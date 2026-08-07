// api/listing.js
// Serverless function (Vercel-style):  GET /api/listing?url=<listing url>
//
// Turns a pasted car-listing link into calculator-ready figures, plus a set of
// live electric alternatives in the same price band.
//
// Why this is server-side: a browser cannot read another origin's HTML (CORS),
// so "paste any link and it fills in" is impossible in page JavaScript. This
// endpoint does the fetch, scrapes the listing's OpenGraph tags, and returns
// clean JSON the calculator can drop straight into its fields.
//
// Response shape:
// {
//   "vehicle": {
//     "name": "Ford Ranger 2.0 SiT Double Cab XL 4x4 Auto",
//     "make": "ford", "model": "ranger", "year": 2025, "condition": "Used",
//     "price": 498800, "location": "Kempton Park", "image": "https://…",
//     "fuel": "diesel", "powertrain": "ice", "engine": 2.0, "body": "bakkie",
//     "use": 7.2, "maint": 8500, "dep": 12,
//     "estimated": ["use", "maint", "dep"],   // NOT from the ad — our estimates
//     "url": "https://…"
//   },
//   "alternatives": [ { name, year, price, variant, url, dealer, … } ],
//   "notes": [ "…" ]
// }

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Only these hosts may be fetched. This endpoint takes a URL from the caller,
// so without an allowlist it is an open proxy — anyone could point it at
// internal metadata endpoints or use the deployment to launder requests.
const ALLOWED_HOSTS = ["autotrader.co.za", "www.autotrader.co.za"];

const FETCH_TIMEOUT = 12000;

/* ------------------------------------------------------------------ utils */

const clean = (s) =>
  String(s || "")
    .replace(/&#xA0;|&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();

const toNumber = (s) => {
  const digits = String(s || "").replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null;
};

async function getHtml(url) {
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
  } finally {
    clearTimeout(timer);
  }
}

function meta(html, prop) {
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

function estimateUse(powertrain, engine, body, fuel) {
  if (powertrain === "ev") return BODY_KWH[body] || 16.5;
  const litres = engine && engine > 0.5 && engine < 8 ? engine : 1.8;
  let l = 3.6 + 1.75 * litres + (BODY_FUEL_ADJ[body] || 0);
  if (fuel === "diesel") l *= 0.85;
  if (fuel === "hybrid") l *= 0.72;
  return Math.round(Math.max(3.5, Math.min(20, l)) * 10) / 10;
}

// Service + tyres + sundries per year. EVs skip oil, filters and plugs and run
// far fewer wear items, so they sit at roughly a third of an equivalent ICE.
function estimateMaint(powertrain, price) {
  const p = price || 400000;
  const rate = powertrain === "ev" ? 0.006 : 0.017;
  return Math.round((p * rate) / 500) * 500;
}

// Straight-ish annual depreciation. Used stock has already taken the first,
// steepest hit, so it declines more slowly from here.
function estimateDep(powertrain, condition) {
  const used = /used|demo/i.test(condition || "");
  if (powertrain === "ev") return used ? 15 : 18;
  return used ? 10 : 12;
}

function detectBody(text) {
  const t = String(text || "").toLowerCase();
  if (/double cab|single cab|super cab|bakkie|pick ?up|\bd\/c\b/.test(t)) return "bakkie";
  if (/suv|crossover|4x4|awd|cross\b/.test(t)) return "suv";
  if (/mpv|kombi|panel van|people mover|7 seat/.test(t)) return "mpv";
  if (/coupe|cabriolet|roadster|convertible/.test(t)) return "coupe";
  if (/sedan|saloon/.test(t)) return "sedan";
  return "hatch";
}

function detectFuel(text) {
  const t = String(text || "").toLowerCase();
  if (/\belectric\b|\bev\b/.test(t)) return "electric";
  if (/plug-?in|\bphev\b/.test(t)) return "phev";
  if (/hybrid|\bhev\b/.test(t)) return "hybrid";
  if (/diesel|\btdi\b|\bgd-?6\b|\bcrdi\b|\bd-?4d\b|\bsit\b|\btdci\b/.test(t)) return "diesel";
  return "petrol";
}

// Engine capacity in litres, from strings like "2.0 SiT", "1.5T", "A45 S".
function detectEngine(text) {
  const m = String(text || "").match(/\b([0-8][.,]\d)\b\s*(?:t|tsi|tdi|d|l)?\b/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(",", "."));
  return v >= 0.6 && v <= 8 ? v : null;
}

/* ------------------------------------------------------ listing extraction */

// AutoTrader listing pages carry everything we need in their OG tags:
//   og:description → "Used 2025 Ford Ranger 2.0 Sit Double Cab XL 4x4 Auto
//                     For Sale - R 498 800 - ID: 28664601"
//   og:title       → "… for sale in Kempton Park - ID: 28664601"
function parseListing(html, url) {
  const desc = meta(html, "og:description") || "";
  const title = meta(html, "og:title") || "";
  const image = meta(html, "og:image");

  let condition = null, year = null, name = null, price = null;

  const d = desc.match(
    /^\s*(New|Used|Demo)?\s*((?:19|20)\d{2})?\s*(.+?)\s+For Sale\s*[-–]\s*R\s*([\d\s]+)/i
  );
  if (d) {
    condition = d[1] || null;
    year = d[2] ? parseInt(d[2], 10) : null;
    name = clean(d[3]);
    price = toNumber(d[4]);
  }

  if (!name) {
    const t = title.match(/^(.+?)\s+for sale/i);
    if (t) name = clean(t[1]);
  }
  if (price == null) {
    const p = (desc + " " + title).match(/R\s*([\d][\d\s]{4,})/);
    if (p) price = toNumber(p[1]);
  }

  let location = null;
  const loc = title.match(/for sale in\s+(.+?)\s*[-–]\s*ID/i);
  if (loc) location = clean(loc[1]);

  // Make / model come from the path — /car-for-sale/{make}/{model}/{variant}/{id}
  let make = null, model = null;
  try {
    const segs = new URL(url).pathname.split("/").filter(Boolean);
    const i = segs.findIndex((s) => /^car-for-sale$/i.test(s));
    if (i >= 0) {
      make = segs[i + 1] ? segs[i + 1].replace(/-/g, " ") : null;
      model = segs[i + 2] ? segs[i + 2].replace(/-/g, " ") : null;
    }
  } catch (e) { /* url already validated */ }

  if (!name && make) name = clean(make + " " + (model || ""));
  if (!name) return null;

  const hay = [name, desc, title].join(" ");
  const fuel = detectFuel(hay);
  const powertrain = fuel === "electric" ? "ev" : "ice";
  const body = detectBody(hay);
  const engine = detectEngine(name);

  return {
    name,
    make,
    model,
    year,
    condition: condition || null,
    price,
    location,
    image: image || null,
    fuel,
    powertrain,
    engine,
    body,
    use: estimateUse(powertrain, engine, body, fuel),
    maint: estimateMaint(powertrain, price),
    dep: estimateDep(powertrain, condition),
    estimated: ["use", "maint", "dep"],
    url,
  };
}

/* ------------------------------------------------- search-result extraction */

// Result tiles use build-hashed class names, which change on every AutoTrader
// deploy — matching on them would break silently. The anchor href and the
// tile's visible text are stable, so we split on the anchor and read the text.
function parseResults(html, limit) {
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

// Live electric stock in the same money as the pasted car. A wide-ish band,
// because the point is "what could I have bought instead", not an exact match.
async function findElectric(price) {
  const from = price ? Math.round((price * 0.6) / 10000) * 10000 : 300000;
  const to = price ? Math.round((price * 1.6) / 10000) * 10000 : 900000;
  const url =
    "https://www.autotrader.co.za/cars-for-sale?fueltype=Electric" +
    "&pricefrom=" + from + "&priceto=" + to;
  const { html } = await getHtml(url);
  if (!html) return { list: [], band: [from, to] };

  const rows = parseResults(html, 24);
  // One entry per model — six near-identical Atto 3s is not a set of options.
  const byModel = new Map();
  for (const r of rows) {
    const key = clean(r.name).toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    const prev = byModel.get(key);
    if (!prev || (r.price || 1e9) < (prev.price || 1e9)) byModel.set(key, r);
  }
  const list = [...byModel.values()]
    .filter((r) => r.price)
    .sort((a, b) => Math.abs(a.price - (price || 0)) - Math.abs(b.price - (price || 0)))
    .slice(0, 6)
    .map((r) => {
      const body = detectBody(r.name);
      return {
        ...r,
        powertrain: "ev",
        body,
        use: estimateUse("ev", null, body, "electric"),
        maint: estimateMaint("ev", r.price),
        dep: estimateDep("ev", r.condition),
        estimated: ["use", "maint", "dep"],
      };
    });
  return { list, band: [from, to] };
}

/* ----------------------------------------------------------------- handler */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const raw = (req.query && req.query.url) || "";
  if (!raw) return res.status(400).json({ error: "Pass ?url=<car listing link>." });

  let target;
  try {
    target = new URL(String(raw));
  } catch (e) {
    return res.status(400).json({ error: "That does not look like a link." });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return res.status(400).json({ error: "Only http(s) links are supported." });
  }
  if (!ALLOWED_HOSTS.includes(target.hostname.toLowerCase())) {
    return res.status(422).json({
      error: "unsupported_site",
      message:
        "Only autotrader.co.za links work right now. Other marketplaces block " +
        "automated reads, so their listings can't be fetched.",
    });
  }
  // Must be one specific advert. A search or index page still has og: tags, and
  // without this check it parses into a "vehicle" called "New & used cars" with
  // wholly invented running costs.
  if (!/^\/car-for-sale\/[^/]+\/[^/]+\/.*\d{6,}/i.test(target.pathname)) {
    return res.status(422).json({
      error: "not_a_listing",
      message:
        "That's a search or index page. Open the specific car and paste that link " +
        "(it looks like /car-for-sale/make/model/variant/12345678).",
    });
  }

  try {
    const { status, html } = await getHtml(target.toString());
    if (!html) {
      return res.status(502).json({
        error: "fetch_failed",
        message: "The listing site returned " + status + ". The advert may have been removed.",
      });
    }

    const vehicle = parseListing(html, target.toString());
    if (!vehicle) {
      return res.status(422).json({
        error: "not_a_listing",
        message: "That page doesn't look like a car advert. Paste the link to a specific car.",
      });
    }

    let alternatives = [], band = null;
    try {
      const found = await findElectric(vehicle.price);
      alternatives = found.list;
      band = found.band;
    } catch (e) {
      // Alternatives are a bonus — never fail the whole request over them.
    }

    const notes = [
      "Fuel/energy use, maintenance and depreciation are estimates — the advert does not publish them. Edit any field.",
    ];
    if (vehicle.powertrain === "ev") {
      notes.push("This listing is already electric, so the alternatives below are other EVs in the same price range.");
    }
    if (!alternatives.length) {
      notes.push("No electric stock found in this price band right now.");
    }

    // Adverts move; a short edge cache keeps repeat pastes cheap without
    // showing stale prices for long.
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json({
      source: "autotrader.co.za",
      vehicle,
      alternatives,
      priceBand: band,
      notes,
    });
  } catch (e) {
    const aborted = e && (e.name === "AbortError" || /abort/i.test(String(e.message)));
    return res.status(aborted ? 504 : 500).json({
      error: aborted ? "timeout" : "server_error",
      message: aborted
        ? "The listing site took too long to respond. Try again."
        : "Could not read that listing.",
    });
  }
}
