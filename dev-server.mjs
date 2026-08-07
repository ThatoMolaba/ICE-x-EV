// dev-server.mjs — run the site AND the /api functions locally.
//
//   npm run dev:site      →  http://localhost:3000
//
// In production Vercel serves `site/` as static files and each `api/*.js` as a
// serverless function. A plain static server can't do the second half, so the
// calculator's listing autofill would 404 locally. This mimics both, with no
// dependencies and no Vercel login.
//
// It is a development convenience only — not used in the deployed build.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve('.');
const SITE = join(ROOT, 'site');
const PORT = Number(process.env.PORT) || 3000;

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
    await mod.default({ method: req.method, query, headers: req.headers, url: req.url }, shimRes(res));
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
