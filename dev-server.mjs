// dev-server.mjs — run the site AND the /api functions locally.
//
//   npm run dev:site      →  http://localhost:3000
//
// On Vercel, `site/` is served as static files and each `api/*.js` as a
// serverless function. A plain static server can't do the second half, so the
// calculator's listing autofill would 404 locally. This mimics both, with no
// dependencies and no Vercel login.
//
// NOT dev-only any more: render.yaml sets `startCommand: node dev-server.mjs`,
// so on Render this file IS the production server. Anything it does not
// implement (request bodies, for one) is missing in production too.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve('.');
const SITE = join(ROOT, 'site');
const PORT = Number(process.env.PORT) || 3000;

// Vercel injects project env vars into functions automatically; locally nothing
// does, so without this every endpoint silently falls back to sample data even
// though the key is sitting in .env.local.
for (const name of ['.env.local', '.env']) {
  const file = join(ROOT, name);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;                                   // comment or blank
    if (process.env[m[1]] !== undefined) continue;      // real env wins
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const loaded = ['GOOGLE_MAPS_API_KEY', 'ANTHROPIC_API_KEY'].filter((k) => process.env[k]);
console.log('env loaded:', loaded.length ? loaded.join(', ') : '(none — endpoints will report unavailable)');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/babel; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// Minimal stand-ins for the req/res shapes a Vercel function expects.
function shimRes(res) {
  return {
    setHeader: (k, v) => res.setHeader(k, v),
    status(code) { res.statusCode = code; return this; },
    json(obj) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(obj));
      return this;
    },
    send(body) { res.end(body); return this; },
    end() { res.end(); return this; },
  };
}

// Vercel hands functions a parsed req.body; a bare node server does not, so
// POST endpoints (/api/scan takes an uploaded photo) would see nothing at all.
const MAX_BODY = 12 * 1024 * 1024;   // a shrunk photo is ~200KB; this is slack

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method !== 'POST' && req.method !== 'PUT') return resolve(undefined);
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      if (/application\/json/i.test(req.headers['content-type'] || '')) {
        try { return resolve(JSON.parse(raw)); } catch { return resolve(raw); }
      }
      resolve(raw);
    });
    req.on('error', reject);
  });
}

async function serveApi(name, url, req, res) {
  const file = join(ROOT, 'api', name + '.js');
  try {
    await stat(file);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'No such endpoint: /api/' + name }));
  }
  // Cache-bust so edits to api/*.js are picked up without restarting.
  const mod = await import(pathToFileURL(file).href + '?t=' + Date.now());
  const query = Object.fromEntries(url.searchParams.entries());
  try {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      res.statusCode = 413;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'too_large', message: 'Upload is too large.' }));
    }
    await mod.default({ method: req.method, query, body, headers: req.headers, url: req.url }, shimRes(res));
  } catch (err) {
    console.error('[api/' + name + ']', err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'server_error', message: String(err && err.message || err) }));
    }
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  let pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) {
    const name = pathname.slice(5).replace(/\.js$/, '');
    if (!/^[a-z0-9_-]+$/i.test(name)) { res.statusCode = 400; return res.end('bad endpoint'); }
    console.log(req.method, pathname + url.search);
    return serveApi(name, url, req, res);
  }

  if (pathname === '/') pathname = '/index.html';
  const file = join(SITE, pathname);
  if (!file.startsWith(SITE)) { res.statusCode = 403; return res.end('forbidden'); }

  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');   // always see the latest edit
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<h1>404</h1><p>' + pathname + ' not found in site/</p>');
  }
}).listen(PORT, () => {
  console.log('site + api  →  http://localhost:' + PORT);
  console.log('calculator  →  http://localhost:' + PORT + '/calculator.html');
});
