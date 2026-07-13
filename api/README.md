# `/api` — backend functions

Serverless functions (Vercel-style: one file = one endpoint). No framework, no
dependencies — plain Node handlers using the built-in `fetch` (Node 18+).

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/chargers?lat=&lng=&radius=` | GET | EV charging stations near a point, via Google Places API (New) |

`radius` is in metres (default 8000, max 50000). Response shape:

```jsonc
{
  "source": "google",              // "google" | "sample"
  "center": { "lat": -26.1, "lng": 28.0 },
  "stations": [
    {
      "id": "…",
      "name": "Sandton City",
      "area": "Sandton, Johannesburg",
      "lat": -26.10, "lng": 28.05,
      "kw": 150,                    // max charge rate, or null
      "conn": ["CCS", "Type 2"],    // connector types, or []
      "price": null,                // Google has no per-kWh price
      "rating": 4.3,                // Google rating, or null
      "status": "ok",              // "ok" | "busy" | "unknown" (from live availability)
      "connectors": 6,             // total connector count, or null
      "dist": 1.2                   // km from center
    }
  ]
}
```

If `GOOGLE_MAPS_API_KEY` is unset, or the upstream call fails, the endpoint
returns `source: "sample"` with placeholder data so the UI keeps working. Check
the `note`/`detail` fields when debugging.

## Keys / env

Server key lives in `.env.local` (git-ignored) locally, and in your Vercel
project's Environment Variables in production:

```
GOOGLE_MAPS_API_KEY=<your server key>
```

Recommended: this server key should be **IP-restricted** and limited to
**"Places API (New)"** in the Google Cloud console. Use a *separate*,
referrer-restricted key for the browser map (see `site/config.example.js`).

> Billing note: the `X-Goog-FieldMask` in `chargers.js` requests `evChargeOptions`
> (connector/power/availability). Fields determine the Places SKU you're billed
> for — trim the mask if you want a cheaper tier.

## Running locally

Vite's dev server (`npm run dev`) does **not** execute `/api` functions. To run
them locally use the Vercel CLI:

```
npm i -g vercel
vercel dev        # serves /api on http://localhost:3000
```

Then either open the site through `vercel dev` too, or point the static site at
it by setting `window.API_BASE = "http://localhost:3000"` in
`site/config.local.js`.

Without a backend running, the front-end falls back to its own built-in sample
list, so the map/list still render.

## Deploy topology (open decision)

Right now there are two front-ends in this repo: the live static site in
`site/` and the half-built Vite app in `src/`. For `/api/chargers` to be
same-origin with the page that calls it, both need to deploy together. Two
options, to decide when you wire up hosting:

1. **Static `site/` + `/api`** on Vercel (add a `vercel.json` pointing the
   static output at `site/`), or
2. Finish the **Vite migration** (plan step 1) and serve the React app + `/api`
   from one Vercel project.

The front-end uses a configurable `API_BASE` so it works under either.
