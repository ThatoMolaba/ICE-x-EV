#!/usr/bin/env node
// Validates api/scan.js's output schema against the subset the Messages API
// accepts for structured outputs.
//
// Worth having as a script because the failure mode is so quiet: an invalid
// schema is rejected for the whole request, so a single bad field returns 400
// on every scan — and the endpoint reported that to users as "Couldn't read
// that photo", which sounds like their picture was blurry. The schema that
// shipped used ["string", "null"] type arrays and enums containing null; both
// are rejected, and nothing in the codebase would have told us.
//
//   node scripts/check-scan-schema.mjs
//
// Exits non-zero and lists every offending path if the schema drifts back.

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const { SCHEMA } = await import(
  pathToFileURL(resolve(process.cwd(), "api/scan.js")).href
);

// One basic type per node; unions go through anyOf.
const BASIC = ["object", "array", "string", "integer", "number", "boolean", "null"];
// Accepted by JSON Schema at large, silently dropped here — so a schema that
// relies on them is not enforcing what its author thinks it is.
const DROPPED = ["minimum", "maximum", "multipleOf", "minLength", "maxLength",
                 "pattern", "maxItems", "uniqueItems"];

const problems = [];

function walk(node, path) {
  if (!node || typeof node !== "object") return;

  const branches = node.anyOf || node.oneOf || node.allOf;
  if (branches) {
    if (node.type !== undefined) problems.push(`${path}: has both "type" and anyOf/allOf`);
    branches.forEach((b, i) => walk(b, `${path}.anyOf[${i}]`));
  } else if (node.type === undefined) {
    problems.push(`${path}: needs a "type" or an anyOf`);
  } else if (Array.isArray(node.type)) {
    problems.push(`${path}: "type" is an array ${JSON.stringify(node.type)} — express it as anyOf`);
  } else if (!BASIC.includes(node.type)) {
    problems.push(`${path}: unknown type "${node.type}"`);
  }

  if (Array.isArray(node.enum)) {
    if (node.enum.some((v) => v === null)) {
      problems.push(`${path}: enum contains null — null belongs in an anyOf branch`);
    }
    if (typeof node.type === "string" && node.enum.some((v) => typeof v !== node.type)) {
      problems.push(`${path}: enum values do not all match type "${node.type}"`);
    }
  }

  for (const k of DROPPED) {
    if (node[k] !== undefined) problems.push(`${path}: "${k}" is not enforced and will be dropped`);
  }

  if (node.type === "object") {
    if (node.additionalProperties !== false) {
      problems.push(`${path}: objects must set additionalProperties:false`);
    }
    const props = Object.keys(node.properties || {});
    const required = node.required || [];
    const missing = props.filter((p) => !required.includes(p));
    if (missing.length) problems.push(`${path}: missing from "required": ${missing.join(", ")}`);
    for (const [k, v] of Object.entries(node.properties || {})) walk(v, `${path}.${k}`);
  }

  if (node.type === "array" && node.items) walk(node.items, `${path}.items`);
}

walk(SCHEMA, "SCHEMA");

const fields = Object.keys(SCHEMA.properties || {}).length;
if (problems.length) {
  console.error(`scan schema: ${problems.length} problem(s) across ${fields} fields\n`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`scan schema: OK (${fields} fields conform to the structured-output subset)`);
