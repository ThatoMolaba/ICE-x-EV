// lib/cars.js
// Shared vehicle logic for the /api endpoints.
//
// Extracted from api/listing.js when api/scan.js needed the same three things:
// fetching AutoTrader safely, turning a search page into rows, and estimating
// the running costs an advert never publishes. It lives outside api/ so no
// platform routes it as an endpoint.
//
// What the site actually honours (probed, not assumed):
//   /cars-for-sale/{make}/{model}      → works, ~32 tiles per page
//   ?pricefrom=&priceto=               → SILENTLY IGNORED, stripped on redirect
//   ?yearfrom=&yearto=                 → same
//   ?page=N                            → returns some stock page 1 did not
// So price and year are filtered here, on the rows we get back, never by URL.

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Only these hosts may be fetched. Endpoints take caller input, so without an
// allowlist they are open proxies — anyone could point one at internal metadata
// endpoints or use the deployment to launder requests.
export const ALLOWED_HOSTS = ["autotrader.co.za", "www.autotrader.co.za"];

export const FETCH_TIMEOUT = 12000;

/* ------------------------------------------------------------------ utils */

export const clean = (s) =>
  String(s || "")
    .replace(/&#xA0;|&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();

export const toNumber = (s) => {
  const digits = String(s || "").replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null;
};

export function hostAllowed(url) {
  try {
    return ALLOWED_HOSTS.includes(new URL(url).hostname.toLowerCase());
  } catch (e) {
    return false;
  }
}

export async function getHtml(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctl.signal,
    });
    if (!r.ok) return { status: r.status, html: null };
    return { status: r.status, html: await r.text() };
  } catch (e) {
    return { status: 0, html: null };
  } finally {
    clearTimeout(timer);
  }
}

export function meta(html, prop) {
  const re = new RegExp(
    '<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)',
    "i"
  );
  const alt = new RegExp(
    '<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + prop + '["\']',
    "i"
  );
  const m = html.match(re) || html.match(alt);
  return m ? clean(m[1]) : null;
}

// "Volkswagen Polo" → "volkswagen/polo" for the search path.
export const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

/* -------------------------------------------------------------- estimates */

// Listings never publish fuel consumption, but TCO is meaningless without it.
// These are transparent heuristics, returned flagged as estimates so the UI can
// mark them and the user can overwrite them.
//
// L/100km ≈ 3.6 + 1.75 × engine litres, adjusted for body, ×0.85 for diesel.
// Checked against the figures this project already used: Polo 1.0 TSI 5.9,
// Corolla 1.8 6.6, Golf GTI 2.0 7.2, Ranger 2.0d 7.6, Fortuner 2.8d 7.8.
const BODY_FUEL_ADJ = { bakkie: 1.3, suv: 0.8, mpv: 0.6, sedan: 0, hatch: 0, coupe: 0 };
const BODY_KWH = { bakkie: 22.0, suv: 18.0, mpv: 18.0, sedan: 16.5, hatch: 15.5, coupe: 16.0 };

export function estimateUse(powertrain, engine, body, fuel) {
  if (powertrain === "ev") return BODY_KWH[body] || 16.5;
  const litres = engine && engine > 0.5 && engine < 8 ? engine : 1.8;
  let l = 3.6 + 1.75 * litres + (BODY_FUEL_ADJ[body] || 0);
  if (fuel === "diesel") l *= 0.85;
  if (fuel === "hybrid") l *= 0.72;
  return Math.round(Math.max(3.5, Math.min(20, l)) * 10) / 10;
}

// Service + tyres + sundries per year. EVs skip oil, filters and plugs and run
// far fewer wear items, so they sit at roughly a third of an equivalent ICE.
export function estimateMaint(powertrain, price) {
  const p = price || 400000;
  const rate = powertrain === "ev" ? 0.006 : 0.017;
  return Math.round((p * rate) / 500) * 500;
}

// Straight-ish annual depreciation. Used stock has already taken the first,
// steepest hit, so it declines more slowly from here.
export function estimateDep(powertrain, condition) {
  const used = /used|demo/i.test(condition || "");
  if (powertrain === "ev") return used ? 15 : 18;
  return used ? 10 : 12;
}

export function detectBody(text) {
  const t = String(text || "").toLowerCase();
  if (/double cab|single cab|super cab|bakkie|pick ?up|\bd\/c\b/.test(t)) return "bakkie";
  if (/suv|crossover|4x4|awd|cross\b/.test(t)) return "suv";
  if (/mpv|kombi|panel van|people mover|7 seat/.test(t)) return "mpv";
  if (/coupe|cabriolet|roadster|convertible/.test(t)) return "coupe";
  if (/sedan|saloon/.test(t)) return "sedan";
  return "hatch";
}

export function detectFuel(text) {
  const t = String(text || "").toLowerCase();
  if (/\belectric\b|\bev\b/.test(t)) return "electric";
  if (/plug-?in|\bphev\b/.test(t)) return "phev";
  if (/hybrid|\bhev\b/.test(t)) return "hybrid";
  if (/diesel|\btdi\b|\bgd-?6\b|\bcrdi\b|\bd-?4d\b|\bsit\b|\btdci\b/.test(t)) return "diesel";
  return "petrol";
}

// Engine capacity in litres, from strings like "2.0 SiT", "1.5T", "A45 S".
export function detectEngine(text) {
  const m = String(text || "").match(/\b([0-8][.,]\d)\b\s*(?:t|tsi|tdi|d|l)?\b/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(",", "."));
  return v >= 0.6 && v <= 8 ? v : null;
}

// Attach the estimate set to a bare search row.
export function withEstimates(row) {
  const hay = [row.name, row.variant].filter(Boolean).join(" ");
  const fuel = row.fuel || detectFuel(hay);
  const powertrain = fuel === "electric" ? "ev" : "ice";
  const body = detectBody(hay);
  const engine = powertrain === "ev" ? null : detectEngine(hay);
  return {
    ...row,
    fuel,
    powertrain,
    body,
    engine,
    use: estimateUse(powertrain, engine, body, fuel),
    maint: estimateMaint(powertrain, row.price),
    dep: estimateDep(powertrain, row.condition),
    estimated: ["use", "maint", "dep"],
  };
}

/* ------------------------------------------------- search-result extraction */

// Result tiles use build-hashed class names, which change on every AutoTrader
// deploy — matching on them would break silently. The anchor href and the
// tile's visible text are stable, so we split on the anchor and read the text.
export function parseResults(html, limit) {
  const out = [];
  const re = /<a href="(\/car-for-sale\/[^"]+?\/(\d{6,}))"[^>]*>/gi;

  // Collect anchor positions first so each tile can be bounded by the next
  // one. A fixed-size slice overruns into the following tile and picks up its
  // "New"/"Used"/"Automatic" tags, mislabelling the car.
  const hits = [];
  let mm;
  while ((mm = re.exec(html))) hits.push({ index: mm.index, href: mm[1], id: mm[2] });

  const seen = new Set();
  for (let k = 0; k < hits.length && out.length < limit; k++) {
    const m = hits[k];
    const href = m.href, id = m.id;
    if (seen.has(id)) continue;
    seen.add(id);

    const end = k + 1 < hits.length ? hits[k + 1].index : Math.min(html.length, m.index + 6000);
    const chunk = html.slice(m.index, end);
    const parts = clean(
      chunk.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|")
    ).split("|").map((s) => s.trim()).filter(Boolean);

    const priceSeg = parts.find((p) => /^R\s*[\d\s]{5,}$/.test(p));
    const nameIdx = parts.findIndex((p) => /^(19|20)\d{2}\s+\S/.test(p));
    if (nameIdx < 0) continue;

    const yearName = parts[nameIdx];
    const next = parts[nameIdx + 1] || "";
    const isTag = /^(New|Used|Demo|Automatic|Manual|Electric|Petrol|Diesel|Hybrid)$/i;
    const variant = isTag.test(next) ? null : next;

    const ym = yearName.match(/^((?:19|20)\d{2})\s+(.+)$/);
    out.push({
      id,
      url: "https://www.autotrader.co.za" + href,
      year: ym ? parseInt(ym[1], 10) : null,
      name: clean((ym ? ym[2] : yearName) + (variant ? " " + variant : "")),
      variant: variant || null,
      price: priceSeg ? toNumber(priceSeg) : null,
      condition: parts.find((p) => /^(New|Used|Demo)$/i.test(p)) || null,
      transmission: parts.find((p) => /^(Automatic|Manual)$/i.test(p)) || null,
      fuel: (parts.find((p) => /^(Electric|Petrol|Diesel|Hybrid)$/i.test(p)) || "").toLowerCase() || null,
      dealer: null,
    });
  }
  return out;
}

// Fetch a search path across a couple of pages and dedupe. Two pages because
// page 2 does return stock page 1 did not; more than that is a lot of traffic
// for a long tail nobody scrolls to.
async function searchRows(path, pages = 2) {
  const rows = [];
  const seen = new Set();
  for (let p = 1; p <= pages; p++) {
    const url = "https://www.autotrader.co.za" + path + (p > 1 ? (path.includes("?") ? "&" : "?") + "page=" + p : "");
    const { html } = await getHtml(url);
    if (!html) break;
    for (const r of parseResults(html, 40)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      rows.push(r);
    }
  }
  return rows;
}

/* ------------------------------------------------------------- the searches */

// Where you can actually buy the car that was scanned. Year is filtered here
// because the site drops yearfrom/yearto.
export async function findForSale(make, model, opts = {}) {
  const { years = null, limit = 8 } = opts;
  if (!make) return { list: [], searchUrl: null };

  const path = "/cars-for-sale/" + slug(make) + (model ? "/" + slug(model) : "");
  let rows = await searchRows(path);

  if (years && years.length === 2) {
    const [lo, hi] = years;
    const inRange = rows.filter((r) => r.year && r.year >= lo - 1 && r.year <= hi + 1);
    // Only narrow if the generation actually has stock — an empty list is worse
    // than a slightly-wrong year.
    if (inRange.length >= 3) rows = inRange;
  }

  const list = rows
    .filter((r) => r.price)
    .sort((a, b) => (b.year || 0) - (a.year || 0))
    .slice(0, limit);

  return { list, searchUrl: "https://www.autotrader.co.za" + path };
}

// Live electric stock to weigh against the scanned car. The site ignores price
// filtering entirely, so the whole band is applied here, over the rows we have.
export async function findElectric(price, opts = {}) {
  const { limit = 6 } = opts;
  const rows = await searchRows("/cars-for-sale?fueltype=Electric");

  const from = price ? Math.round((price * 0.6) / 10000) * 10000 : 300000;
  const to = price ? Math.round((price * 1.6) / 10000) * 10000 : 900000;

  // One entry per model — six near-identical Atto 3s is not a set of options.
  const byModel = new Map();
  for (const r of rows) {
    if (!r.price) continue;
    const key = clean(r.name).toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    const prev = byModel.get(key);
    if (!prev || r.price < prev.price) byModel.set(key, r);
  }

  let pool = [...byModel.values()];
  const inBand = pool.filter((r) => r.price >= from && r.price <= to);
  // Fall back to the full pool rather than return nothing when the scanned car
  // is cheaper or dearer than any EV on the site.
  const banded = inBand.length >= 3;
  if (banded) pool = inBand;

  const list = pool
    .sort((a, b) => Math.abs(a.price - (price || 0)) - Math.abs(b.price - (price || 0)))
    .slice(0, limit)
    .map(withEstimates);

  return { list, band: banded ? [from, to] : null };
}
