# ICE → EV · Integration plan: Autofill + Charging map

Two features you asked about, what each needs, the accounts to open, and rough
costs. No code yet — this is the decision document.

---

## The one thing both features have in common: you need a backend

Today the whole site runs **in the browser** (React via Babel). That's fine for
the UI, but it can't safely do either of these jobs, because both require a
**secret API key** and a **server-side network call**:

- An API key in browser code is visible to anyone (View Source) — they'd run up
  your bill. Keys must live on a server.
- Browsers also can't freely fetch other websites (CORS) — scraping a car
  listing has to happen server-side.

So step zero is a **small backend**. The cleanest path: move the site onto the
**Vite + React** scaffold already in this repo, and add two server endpoints
(serverless functions work fine):

| Endpoint | Does |
|---|---|
| `POST /api/autofill` | Takes a listing URL → returns car details |
| `GET /api/chargers?lat=&lng=` | Returns nearby charging stations |

Hosting: **Vercel** or **Netlify** free tier covers both functions and the
static site for an MVP. No dedicated server to manage.

---

## Feature 1 — Autofill a pasted car link (this is the AI part)

**Pipeline:**

```
user pastes URL
   → backend fetches the page (fetch layer)
   → Claude reads it and extracts structured fields (extraction layer)
   → form auto-fills: make, model, year, price, fuel type, consumption
```

### Which AI model: Claude (Anthropic API)

Recommended model for the extraction step — pick by budget, it's your call:

| Model | Model ID | Price (input / output, per 1M tokens) | Notes |
|---|---|---|---|
| **Claude Haiku 4.5** | `claude-haiku-4-5` | **$1 / $5** | Recommended. Cheap, fast, plenty smart for extraction. |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | $3 / $15 | For messier pages. |
| Claude Opus 4.8 | `claude-opus-4-8` | $5 / $25 | Overkill here. |

Use **structured outputs** so Claude returns exactly the JSON shape you want —
no fragile text parsing.

### The fetch layer — two options

| Option | Cost | Robustness |
|---|---|---|
| **Claude's built-in `web_fetch` tool** | included in the API call | Good on clean pages; can fail on JS-heavy / bot-protected SA classifieds |
| **A scraping API** (Firecrawl, ScrapingBee) | free tier, then paid | Returns clean text, handles JS + anti-bot — "just works" on real listings |

Recommendation: try `web_fetch` first (nothing extra to sign up for); add
Firecrawl if real SA car sites give it trouble.

### ⚠️ Two honest caveats

1. **Accuracy depends on the listing, not the model.** Most car ads don't state
   fuel economy (L/100km or kWh/100km). Claude would have to infer it from the
   model name — error-prone. For trustworthy numbers, pair extraction with a
   **spec lookup table** (you already have consumption figures for popular SA
   cars in the calculator presets — extend that into the source of truth, and
   let the link fill in price/year/trim).
2. It only fills the form — the user can still edit every number. Good: keeps
   them in control and covers any extraction mistake.

### Cost estimate (Feature 1)

One listing page ≈ ~15K tokens in, a few hundred out. On **Haiku 4.5**:
~**$0.02 per autofill** (≈ R0.35). So:

- 1,000 autofills / month ≈ **$17/mo** (≈ R310)
- 10,000 autofills / month ≈ **$170/mo** (≈ R3,100)

Add Firecrawl only if needed (~free up to ~500 scrapes/mo, ~$16/mo for 3,000).

### Accounts to open
- **Anthropic API** — console.anthropic.com → create API key. (Pre-pay credits.)
- *(Optional)* **Firecrawl** — firecrawl.dev → API key.

---

## Feature 2 — Charging stations across South Africa (NOT an AI job)

Do **not** use an LLM to "find chargers" — it has no live map and will invent
locations. Use a real charging-data API.

| Source | Cost | SA coverage | Live "available now"? | Best for |
|---|---|---|---|---|
| **Open Charge Map** | **Free** (API key) | Good (community data) | Limited | **Start here (MVP)** |
| **Google Places API** | Paid, has free credit | Very good | Some | Production polish |
| **GridCars** | Commercial / partnership | Best — runs most of SA's public network | Yes, real-time | Accurate live status |
| Eco-Movement / ChargeFinder | Commercial | Good (aggregators) | Yes | Live status w/o a GridCars deal |

**Recommendation:** launch on **Open Charge Map** (free, real SA stations) to
replace the decorative map you have now. Upgrade to **Google Places** or strike
a **GridCars** deal later if you need live availability.

### The map itself
Your `energy-map.html` currently draws a fake SVG map. To show real pins on a
real map, add a map library:

| Library | Cost |
|---|---|
| **Leaflet + OpenStreetMap** | **Free** — recommended for MVP |
| Google Maps / Mapbox | Paid (free tier), nicer styling |

### Cost estimate (Feature 2)
- Open Charge Map + Leaflet/OpenStreetMap = **R0** for an MVP.
- Google Places, if you go that route, is pay-per-request with a monthly free
  allowance — budget later based on traffic.

### Accounts to open
- **Open Charge Map** — openchargemap.org → request an API key (free).
- *(Later)* **Google Cloud** (Places + Maps) or a **GridCars** commercial contact.

---

## Suggested build order

1. **Backend foundation** — move onto the Vite scaffold, add the two empty API
   endpoints, deploy to Vercel/Netlify. (Nothing user-visible yet.)
2. **Charging map** — Open Charge Map + Leaflet. Cheapest, fully free, immediate
   visible win, no AI risk.
3. **Autofill** — Anthropic key + `web_fetch` + structured extraction, backed by
   your spec table for consumption figures. Add Firecrawl only if needed.

## Rough monthly cost at launch (modest traffic)
- Hosting: **R0** (free tier)
- Charging map: **R0** (Open Charge Map + OpenStreetMap)
- Autofill: **~R300–600** depending on usage (Anthropic, Haiku 4.5)
- **Total ≈ R300–600/mo**, scaling with autofill volume.

*(USD↔ZAR converted at ≈ R18.5/$ — adjust to the current rate.)*
