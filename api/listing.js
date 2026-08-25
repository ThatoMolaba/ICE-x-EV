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

// The fetch/parse/estimate helpers moved to lib/cars.js when api/scan.js needed
// the same ones. Only listing-page parsing is specific to this endpoint.
import {
  ALLOWED_HOSTS,
  clean,
  toNumber,
  getHtml,
  meta,
  estimateUse,
  estimateMaint,
  estimateDep,
  detectBody,
  detectFuel,
  detectEngine,
  findElectric,
} from "../lib/cars.js";

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
