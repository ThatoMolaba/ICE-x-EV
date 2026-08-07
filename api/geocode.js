// api/geocode.js
// Serverless function (Vercel-style):  GET /api/geocode?q=<place or address>
//
// Turns what someone types in the Energy Map search box into coordinates, so
// the charger list and the map can move there.
//
// Why server-side: the browser-side google.maps.Geocoder needs the *browser*
// Maps key, which is optional in this project (config.local.js ships it blank
// and the map canvas simply shows a "add your key" overlay). Geocoding here
// means search still works with no browser key at all — the charger list moves
// even when the map itself can't render.
//
// Two providers, in order:
//   1. Google Geocoding API, using the same server key as /api/chargers.
//   2. OpenStreetMap Nominatim — no key required, so search works out of the
//      box. Rate-limited to ~1 req/s by their usage policy; results are edge
//      cached for a day to stay well inside it.
//
// Response: { source, lat, lng, label }   source: "google" | "osm"

const GOOGLE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
const OSM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

// Results are biased to South Africa — this is an SA charging map, and a bare
// "Springfield" or "Sandton" should not land in another hemisphere.
const COUNTRY = "ZA";

// Nominatim's policy requires a real identifying User-Agent.
const OSM_UA = "ICE-to-EV EnergyMap/1.0 (+https://github.com/ThatoMolaba/ICE-x-EV)";

const TIMEOUT = 8000;

async function getJson(url, headers) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers: headers || {}, signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function viaGoogle(q, key) {
  const url =
    GOOGLE_ENDPOINT +
    "?address=" + encodeURIComponent(q) +
    "&components=country:" + COUNTRY +
    "&key=" + encodeURIComponent(key);
  const d = await getJson(url);
  if (!d || d.status !== "OK" || !d.results || !d.results.length) return null;
  const top = d.results[0];
  const loc = top.geometry && top.geometry.location;
  if (!loc) return null;
  return { source: "google", lat: loc.lat, lng: loc.lng, label: top.formatted_address || q };
}

// Nominatim's raw first hit is whatever matched the string best, which for
// "Umhlanga" is a taxi rank named after the suburb rather than the suburb. Ask
// for several and prefer actual places and administrative areas over shops,
// amenities and roads that merely share the name.
const CLASS_RANK = { place: 4, boundary: 3, landuse: 2, natural: 2, amenity: 1, shop: 1, tourism: 1 };

async function viaOsm(q) {
  const url =
    OSM_ENDPOINT +
    "?q=" + encodeURIComponent(q) +
    "&countrycodes=" + COUNTRY.toLowerCase() +
    "&format=json&limit=8&addressdetails=0";
  const d = await getJson(url, { "user-agent": OSM_UA, accept: "application/json" });
  if (!Array.isArray(d) || !d.length) return null;

  const scored = d
    .map((r) => ({
      r,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      score: (CLASS_RANK[r.class] || 0) * 10 + (parseFloat(r.importance) || 0),
    }))
    .filter((x) => isFinite(x.lat) && isFinite(x.lng))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  const top = scored[0];
  // display_name is a full postal chain; the first two parts are the useful bit.
  const label = String(top.r.display_name || q).split(",").slice(0, 2).join(",").trim();
  return { source: "osm", lat: top.lat, lng: top.lng, label: label || q };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = String((req.query && req.query.q) || "").trim();
  if (!q) return res.status(400).json({ error: "Pass ?q=<place or address>." });
  if (q.length > 160) return res.status(400).json({ error: "That search is too long." });

  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    let hit = key ? await viaGoogle(q, key) : null;
    if (!hit) hit = await viaOsm(q);

    if (!hit) {
      return res.status(404).json({
        error: "not_found",
        message: 'Could not find "' + q + '" in South Africa. Try a suburb, city or full address.',
      });
    }

    // Places don't move. Cache hard.
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json(hit);
  } catch (e) {
    return res.status(500).json({ error: "server_error", message: "Location lookup failed." });
  }
}
