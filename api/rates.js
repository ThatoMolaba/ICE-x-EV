// api/rates.js
// Serverless function (Vercel-style):  GET /api/rates
//
// Returns current South African fuel + electricity rates for the TCO
// calculator. These are the volatile numbers that swing the result most —
// keeping them here (server-side, cached) lets the calculator always open with
// current figures instead of stale hardcoded ones.
//
// NOTE: These are curated indicative figures (source: "stub"). There is no free
// official API for SA fuel/electricity, so the accurate path is a small
// scheduled job that refreshes them:
//   - Fuel: DMRE monthly announcement (changes 1st Wednesday) / AA South Africa.
//   - Electricity: Eskom Homeflex + municipal tariffs (NERSA, ~annual).
// Swap the RATES constant below for a real fetch when you wire that up.

const RATES = {
  asOf: "2026-07", // data vintage — bump when you refresh the figures
  currency: "ZAR",
  fuel: {
    petrol95_inland: 24.5, // R / litre
    petrol93_inland: 24.1,
    diesel50_inland: 22.9,
    petrol95_coastal: 23.75,
  },
  electricity: {
    home: 3.3, // R / kWh — residential average
    public_ac: 5.5, // typical public AC network rate
    public_dc: 7.5, // typical public DC fast-charge rate
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  // Rates change at most monthly — cache hard at the edge.
  res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=86400");
  return res.status(200).json({
    source: "stub",
    note: "Indicative SA rates. Replace RATES in api/rates.js with a live DMRE/Eskom feed for production accuracy.",
    ...RATES,
  });
}
