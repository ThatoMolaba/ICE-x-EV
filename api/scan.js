// api/scan.js
// Serverless function:  POST /api/scan   { image: "<base64>", mime: "image/jpeg" }
//
// Turns a photo of a car into: what it is, what it costs to run, where you can
// buy one, and the electric alternative costed against it.
//
// Why a vision model rather than a car-recognition API: the fixed-taxonomy
// services are trained on US/EU fleets, which is exactly where South African
// stock — BYD, Haval, Chery, GWM, Omoda — is thinnest. A general model has no
// taxonomy to miss, and it can read the windscreen sticker in the same call.
//
// The sticker matters more than the metal. Body shape gives make and model, but
// never the variant, and an advert's variant is most of its price — a Ranger XL
// and a Wildtrak are ~R300k apart on the same silhouette. So when a price
// sticker is legible we take it as the answer; otherwise the variant comes back
// as a guess flagged for the user to confirm, and is never silently applied.
//
// Response shape (deliberately the same conventions as /api/listing):
// {
//   "vehicle": {
//     "name": "Volkswagen Polo 1.0 TSI Comfortline",
//     "make": "Volkswagen", "model": "Polo", "variant": "1.0 TSI Comfortline",
//     "years": [2018, 2024], "year": 2021, "price": 289900,
//     "fuel": "petrol", "powertrain": "ice", "engine": 1.0, "body": "hatch",
//     "use": 5.4, "maint": 4500, "dep": 10,
//     "estimated": ["use", "maint", "dep"],
//     "confidence": "high", "source": "sticker", "variant_confirmed": true
//   },
//   "buy": [ { name, year, variant, price, url, condition, … } ],
//   "alternatives": [ … ],
//   "notes": [ "…" ]
// }

import Anthropic from "@anthropic-ai/sdk";
import {
  estimateUse,
  estimateMaint,
  estimateDep,
  detectBody,
  detectFuel,
  detectEngine,
  findForSale,
  findElectric,
  clean,
} from "../lib/cars.js";

const MODEL = "claude-opus-5";
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // after base64 decode
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

// Structured output: the model must answer in exactly this shape, so there is
// no free-text parsing and no "sometimes it returns prose" failure mode.
//
// A nullable field must be written as anyOf, never as a ["string", "null"] type
// array. Structured outputs take exactly one basic type per node and express
// unions through anyOf; a type array is rejected, and since a rejected schema
// fails the whole request, that one habit made every single scan return a 400.
// The enum belongs on the string branch alone — listing null inside an enum is
// the same mistake wearing a different hat.
const nullable = (schema, description) => ({
  anyOf: [schema, { type: "null" }],
  ...(description ? { description } : {}),
});

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_car", "make", "model", "variant", "year_from", "year_to",
             "fuel", "body", "engine_litres", "sticker_price", "read_from",
             "confidence", "notes"],
  properties: {
    is_car: { type: "boolean", description: "false if the photo does not show a car" },
    make: nullable({ type: "string" }, "Manufacturer, e.g. Volkswagen"),
    model: nullable({ type: "string" }, "Model line, e.g. Polo"),
    variant: nullable({ type: "string" }, "Trim/derivative if legible on a sticker or badge, else your best guess, else null"),
    year_from: nullable({ type: "integer" }, "First year of this generation/facelift"),
    year_to: nullable({ type: "integer" }, "Last year of this generation/facelift"),
    fuel: nullable({ type: "string", enum: ["petrol", "diesel", "hybrid", "phev", "electric"] }),
    body: nullable({ type: "string", enum: ["hatch", "sedan", "suv", "bakkie", "mpv", "coupe"] }),
    engine_litres: nullable({ type: "number" }, "Engine capacity in litres if determinable, else null"),
    sticker_price: nullable({ type: "integer" }, "Asking price in rand if a windscreen/price sticker is legible, else null"),
    read_from: { type: "string", enum: ["sticker", "badge", "visual"], description: "Where the identification mainly came from" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    notes: { type: "array", items: { type: "string" }, description: "Anything the user should know: obscured plate, unusual angle, ambiguity between two similar models" },
  },
};

const SYSTEM = `You identify cars from photographs for a South African car-buying app.

Read, in this order of preference:
1. Any windscreen or price sticker — dealers print make, model, variant and asking price on it. This is the most reliable source; transcribe it rather than guessing from the shape.
2. Badges on the boot, grille and wings — model names and derivative badges (TSI, GTI, Wildtrak, GD-6).
3. The body itself — shape, lights, grille.

Rules:
- Variant/trim decides most of a car's price, and is usually NOT determinable from a photo. Only give a variant you can actually read on a sticker or badge, or state your best guess and set confidence to "low".
- Give a generation year RANGE (year_from/year_to), not a single year, unless a sticker states the year.
- The market is South African. Prefer models sold here (BYD, Haval, Chery, GWM, Omoda, Suzuki, Toyota, VW, Ford) over similar-looking models that are not.
- If the photo shows no car, set is_car false and leave the rest null.
- Never invent a price. sticker_price is only for a price you can actually read.`;

/* ------------------------------------------------------------------ helpers */

function readBody(req) {
  // Vercel parses JSON bodies for us; the local/Render dev-server attaches the
  // raw string. Accept either.
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  return null;
}

function buildVehicle(id, price) {
  const name = clean([id.make, id.model, id.variant].filter(Boolean).join(" "));
  const hay = [name, id.body, id.fuel].filter(Boolean).join(" ");

  const fuel = id.fuel || detectFuel(hay);
  const powertrain = fuel === "electric" ? "ev" : "ice";
  const body = id.body || detectBody(hay);
  const engine = powertrain === "ev" ? null : (id.engine_litres || detectEngine(name));

  const years = id.year_from && id.year_to ? [id.year_from, id.year_to] : null;

  return {
    name: name || null,
    make: id.make || null,
    model: id.model || null,
    variant: id.variant || null,
    years,
    // A single year only when a sticker gave us one; otherwise the newest of the
    // generation, so the UI has something to show without implying precision.
    year: years ? years[1] : null,
    price: price || null,
    fuel,
    powertrain,
    engine,
    body,
    use: estimateUse(powertrain, engine, body, fuel),
    maint: estimateMaint(powertrain, price),
    dep: estimateDep(powertrain, null),
    estimated: ["use", "maint", "dep"],
    confidence: id.confidence || "low",
    source: id.read_from || "visual",
    // The calculator must not treat a guessed variant as fact.
    variant_confirmed: id.read_from === "sticker" || id.read_from === "badge",
  };
}

/* ----------------------------------------------------------------- handler */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed", message: "POST an image to this endpoint." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // A server-side secret, unlike the Supabase publishable key — it must never
    // reach site/config.local.js.
    console.error("[scan] ANTHROPIC_API_KEY is not set");
    return res.status(503).json({
      error: "not_configured",
      message: "Scanning is unavailable right now.",
    });
  }

  const body = readBody(req);
  if (!body || !body.image) {
    return res.status(400).json({ error: "no_image", message: "Send { image: <base64>, mime }." });
  }

  const mime = ALLOWED_MIME.includes(body.mime) ? body.mime : "image/jpeg";
  const b64 = String(body.image).replace(/^data:[^;]+;base64,/, "");
  const bytes = Math.floor((b64.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    return res.status(413).json({
      error: "too_large",
      message: "That photo is too large. Try again — the app should be shrinking it before upload.",
    });
  }

  let id;
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
            { type: "text", text: "Identify this car. Read the windscreen sticker if there is one." },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      console.error("[scan] refused:", response.stop_details);
      return res.status(422).json({ error: "refused", message: "That image couldn't be processed." });
    }

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    id = JSON.parse(text);
  } catch (ex) {
    // Blaming the photo for a server problem is the worst thing this endpoint
    // can do: the user retries a perfectly good picture forever and nobody ever
    // learns the key is wrong. Separate "our fault" from "that photo".
    const status = ex && ex.status;
    console.error(`[scan] vision call failed (status ${status || "none"}):`, ex && ex.message);

    if (ex instanceof Anthropic.RateLimitError) {
      return res.status(429).json({
        error: "rate_limited",
        message: "Too many scans right now — try again in a moment.",
      });
    }
    // 401/403 = bad or missing key; 400 credit_balance_too_low = unpaid account.
    // All are deployment faults, and no retry by the user will fix them.
    const badCredentials =
      ex instanceof Anthropic.AuthenticationError ||
      ex instanceof Anthropic.PermissionDeniedError ||
      (status === 400 && /credit balance|billing/i.test((ex && ex.message) || ""));
    if (badCredentials) {
      return res.status(503).json({
        error: "not_configured",
        message: "Scanning is temporarily unavailable — this one is on us, not your photo.",
        // Names the failure class only; the key itself never leaves the server.
        code: status === 400 ? "billing" : "auth",
      });
    }
    if (ex instanceof Anthropic.BadRequestError) {
      return res.status(502).json({
        error: "scan_failed",
        message: "Scanning hit a problem on our side. Try again shortly.",
        code: "bad_request",
      });
    }
    return res.status(502).json({
      error: "scan_failed",
      message: "Couldn't read that photo. Try again.",
      code: "upstream",
    });
  }

  if (!id || !id.is_car) {
    return res.status(422).json({
      error: "not_a_car",
      message: "That doesn't look like a car. Point the camera at the whole vehicle and try again.",
    });
  }
  if (!id.make) {
    return res.status(422).json({
      error: "unidentified",
      message: "Couldn't work out what car that is. A clearer side or three-quarter view helps.",
    });
  }

  const notes = Array.isArray(id.notes) ? id.notes.slice(0, 4) : [];

  // Where you can buy one. Failures here are non-fatal — the identification is
  // still worth showing.
  let buy = [], searchUrl = null, buyReached = false, buyStatus = null;
  try {
    const years = id.year_from && id.year_to ? [id.year_from, id.year_to] : null;
    const found = await findForSale(id.make, id.model, { years });
    buy = found.list;
    searchUrl = found.searchUrl;
    buyReached = found.reached;
    buyStatus = found.status;
  } catch (ex) {
    console.error("[scan] for-sale search failed:", ex);
  }

  // Price the car off real stock when no sticker was legible: the median of what
  // it actually sells for beats any number we could invent.
  let price = id.sticker_price || null;
  if (!price && buy.length) {
    const sorted = buy.map((r) => r.price).filter(Boolean).sort((a, b) => a - b);
    if (sorted.length) {
      price = sorted[Math.floor(sorted.length / 2)];
      notes.push("No price sticker was readable, so the figures use the median asking price of similar stock listed today.");
    }
  }

  const vehicle = buildVehicle(id, price);

  if (!vehicle.variant_confirmed && vehicle.variant) {
    notes.push("Variant is a guess from the photo — confirm it, because trim moves the price more than anything else.");
  }
  if (!buy.length) {
    notes.push(
      buyReached
        ? "Nothing matching is listed for sale right now, so there's no price to compare against."
        : "We couldn't reach the listings site just now, so the cars for sale and the electric alternatives are missing. The identification above is unaffected — try again shortly."
    );
  }

  // The EV alternative, costed against it — unless it already is one.
  let alternatives = [], band = null, evReached = false, evStatus = null, evSearchUrl = null;
  if (vehicle.powertrain !== "ev") {
    try {
      const found = await findElectric(price);
      alternatives = found.list;
      band = found.band;
      evReached = found.reached;
      evStatus = found.status;
      evSearchUrl = found.searchUrl;
    } catch (ex) {
      console.error("[scan] electric search failed:", ex);
    }
    // Only worth saying when the for-sale note above did not already say it.
    if (!alternatives.length && buy.length) {
      notes.push(
        evReached
          ? "No electric stock is listed in this price band right now."
          : "We couldn't reach the listings site to pull the electric alternatives. Try again shortly."
      );
    }
  }

  return res.status(200).json({
    vehicle, buy, searchUrl, alternatives, band, evSearchUrl, notes,
    // Lets the page distinguish "no stock" from "couldn't look" without
    // re-reading the wording of a note.
    reached: { forSale: buyReached, electric: evReached },
    // The upstream status when a search came back empty. It names a third-party
    // response, never anything of ours, and it is the difference between
    // diagnosing this from a browser and needing dashboard access to the logs.
    upstream: { forSale: buyStatus, electric: evStatus },
  });
}
