// api/chargers.js
// Serverless function (Vercel-style):  GET /api/chargers?lat=&lng=&radius=
//
// Returns EV charging stations near a point using Google Places API (New) —
// Nearby Search. The Google key is read from process.env.GOOGLE_MAPS_API_KEY
// and is NEVER sent to the browser.
//
// If the key is missing or the upstream call fails, this returns no stations
// and says why. It must never invent them: a fabricated charger has a name and
// a coordinate, so it survives every glance a person gives it and is only
// discovered by driving to a bay that was never there. The response always
// carries a `source` field: "google" | "unavailable".

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

export default async function handler(req, res) {
  // Permissive CORS so the static site can call this during local dev.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = req.query || {};
  const center = { lat: num(q.lat, DEFAULT_CENTER.lat), lng: num(q.lng, DEFAULT_CENTER.lng) };
  const radius = Math.min(MAX_RADIUS_M, Math.max(1, num(q.radius, DEFAULT_RADIUS_M)));

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error("[chargers] GOOGLE_MAPS_API_KEY is not set");
    return res.status(200).json({
      source: "unavailable",
      reason: "not_configured",
      note: "Live charger data isn't switched on for this deployment yet.",
      center,
      stations: [],
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
      // Logged in full for whoever holds the dashboard; the caller gets the
      // status alone, which is enough to tell a bad key from a quota problem.
      console.error(`[chargers] Places API ${upstream.status}: ${(await upstream.text()).slice(0, 500)}`);
      return res.status(200).json({
        source: "unavailable",
        reason: "upstream_error",
        upstream: upstream.status,
        note: "We couldn't reach the charging-station service just now.",
        center,
        stations: [],
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
    console.error("[chargers] Places API call threw:", err);
    return res.status(200).json({
      source: "unavailable",
      reason: "network_error",
      note: "We couldn't reach the charging-station service just now.",
      center,
      stations: [],
    });
  }
}
