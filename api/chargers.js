// api/chargers.js
// Serverless function (Vercel-style):  GET /api/chargers?lat=&lng=&radius=
//
// Returns EV charging stations near a point using Google Places API (New) —
// Nearby Search. The Google key is read from process.env.GOOGLE_MAPS_API_KEY
// and is NEVER sent to the browser.
//
// If the key is missing OR the upstream call fails, this returns a small sample
// dataset so the front-end stays demonstrable during development. The response
// always carries a `source` field: "google" | "sample".

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";

// Default to Sandton, Johannesburg if the caller doesn't pass coordinates.
const DEFAULT_CENTER = { lat: -26.1076, lng: 28.0567 };
const DEFAULT_RADIUS_M = 8000; // 8 km
const MAX_RADIUS_M = 50000; // Places API circle cap

// Google's connector enums → short labels used in the UI.
const CONNECTOR_LABELS = {
  EV_CONNECTOR_TYPE_CCS_COMBO_1: "CCS1",
  EV_CONNECTOR_TYPE_CCS_COMBO_2: "CCS",
  EV_CONNECTOR_TYPE_CHADEMO: "CHAdeMO",
  EV_CONNECTOR_TYPE_TYPE_1: "Type 1",
  EV_CONNECTOR_TYPE_TYPE_2: "Type 2",
  EV_CONNECTOR_TYPE_TESLA: "Tesla",
  EV_CONNECTOR_TYPE_J1772: "J1772",
  EV_CONNECTOR_TYPE_UNSPECIFIED_GB_T: "GB/T",
  EV_CONNECTOR_TYPE_UNSPECIFIED_WALL_OUTLET: "Wall",
  EV_CONNECTOR_TYPE_OTHER: "Other",
};

// Field mask controls which fields (and which billing SKU) Places returns.
// evChargeOptions gives connector types, power (kW) and live availability.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.shortFormattedAddress",
  "places.location",
  "places.rating",
  "places.currentOpeningHours.openNow",
  "places.evChargeOptions",
].join(",");

function num(v, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalizePlace(place, center) {
  const loc = place.location || {};
  const lat = typeof loc.latitude === "number" ? loc.latitude : null;
  const lng = typeof loc.longitude === "number" ? loc.longitude : null;

  const ev = place.evChargeOptions || {};
  const aggs = Array.isArray(ev.connectorAggregation) ? ev.connectorAggregation : [];

  let maxKw = 0;
  let total = 0;
  let available = 0;
  let sawAvailability = false;
  const conn = [];
  for (const agg of aggs) {
    if (typeof agg.maxChargeRateKw === "number") maxKw = Math.max(maxKw, agg.maxChargeRateKw);
    total += agg.count || 0;
    if (typeof agg.availableCount === "number") {
      sawAvailability = true;
      available += agg.availableCount;
    }
    const label = CONNECTOR_LABELS[agg.type];
    if (label && !conn.includes(label)) conn.push(label);
  }

  // Derive a coarse status: prefer live availability, else fall back to open-now.
  let status = "unknown";
  if (sawAvailability) status = available > 0 ? "ok" : "busy";
  else if (place.currentOpeningHours && place.currentOpeningHours.openNow === true) status = "ok";

  const here = lat != null && lng != null ? { lat, lng } : null;
  return {
    id: place.id,
    name: (place.displayName && place.displayName.text) || "Charging station",
    area: place.shortFormattedAddress || "",
    lat,
    lng,
    kw: maxKw || null,
    conn,
    price: null, // Google Places does not expose per-kWh pricing.
    rating: typeof place.rating === "number" ? place.rating : null,
    status,
    connectors: total || null,
    dist: here ? Math.round(haversineKm(center, here) * 10) / 10 : null,
  };
}

// Tiny sample used when there's no key yet, so the UI is demonstrable.
function sampleStations(center) {
  const seed = [
    ["Sandton City", "Sandton", 0.001, -0.004, 150, ["CCS", "Type 2"], "ok"],
    ["Mall of Africa", "Midrand", 0.06, 0.01, 60, ["CCS"], "busy"],
    ["Rosebank Mall", "Rosebank", -0.03, -0.01, 80, ["CCS", "Type 2"], "ok"],
    ["Melrose Arch", "Melrose", -0.02, 0.005, 22, ["Type 2"], "ok"],
    ["N1 Engen 1-Stop", "N1 North", 0.09, -0.05, 200, ["CCS"], "ok"],
    ["Fourways Mall", "Fourways", 0.08, -0.02, 120, ["CCS", "Type 2"], "busy"],
  ];
  return seed.map((r, i) => {
    const lat = center.lat + r[2];
    const lng = center.lng + r[3];
    return {
      id: "sample-" + (i + 1),
      name: r[0],
      area: r[1],
      lat,
      lng,
      kw: r[4],
      conn: r[5],
      price: null,
      rating: null,
      status: r[6],
      connectors: null,
      dist: Math.round(haversineKm(center, { lat, lng }) * 10) / 10,
    };
  });
}

export default async function handler(req, res) {
  // Permissive CORS so the static site can call this during local dev.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = req.query || {};
  const center = { lat: num(q.lat, DEFAULT_CENTER.lat), lng: num(q.lng, DEFAULT_CENTER.lng) };
  const radius = Math.min(MAX_RADIUS_M, Math.max(1, num(q.radius, DEFAULT_RADIUS_M)));

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  // No key yet → sample data so the front-end works end-to-end.
  if (!apiKey) {
    return res.status(200).json({
      source: "sample",
      note: "GOOGLE_MAPS_API_KEY not set — returning sample data. Add it to .env.local (local) or your Vercel project env (prod).",
      center,
      stations: sampleStations(center),
    });
  }

  try {
    const upstream = await fetch(PLACES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: ["electric_vehicle_charging_station"],
        maxResultCount: 20,
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: { center: { latitude: center.lat, longitude: center.lng }, radius },
        },
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return res.status(200).json({
        source: "sample",
        note: `Places API returned ${upstream.status}. Falling back to sample data. Check the key, that "Places API (New)" is enabled, and its restrictions.`,
        detail: detail.slice(0, 500),
        center,
        stations: sampleStations(center),
      });
    }

    const data = await upstream.json();
    const stations = (data.places || [])
      .map((p) => normalizePlace(p, center))
      .filter((s) => s.lat != null && s.lng != null)
      .sort((a, b) => (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist));

    // Charger locations barely change — cache at the edge to protect quota.
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({ source: "google", center, stations });
  } catch (err) {
    return res.status(200).json({
      source: "sample",
      note: "Unexpected error calling Places API. Falling back to sample data.",
      detail: String(err && err.message ? err.message : err),
      center,
      stations: sampleStations(center),
    });
  }
}
