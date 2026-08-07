// Browser-side config for the static site.
// Copy this file to `config.local.js` (git-ignored) and fill in your values.

// ---------------------------------------------------------------------------
// Supabase — powers The Garage community layer (auth, feed, profiles, ratings,
// forum, saved comparisons, bookings). Both values live under
// Supabase → Project Settings → API. The anon key is SAFE in the browser: it is
// protected by the Row-Level Security policies installed by supabase/schema.sql.
// Until these are set, community pages show a "Connect your backend" notice
// instead of breaking. Setup guide: supabase/README.md
window.SUPABASE_URL      = ""; // e.g. "https://xxxx.supabase.co"
window.SUPABASE_ANON_KEY = ""; // the long anon/public JWT

// ---------------------------------------------------------------------------
// GOOGLE_MAPS_API_KEY here is the *browser* key used to render the map with the
// Maps JavaScript API. It WILL be visible in the browser — that's expected and
// safe *provided* you lock it down in the Google Cloud console:
//   - Application restriction: HTTP referrers (your domain + http://localhost:*)
//   - API restriction: "Maps JavaScript API" only.
// Ideally this is a DIFFERENT key from the server key in .env.local.
window.GOOGLE_MAPS_API_KEY = ""; // your Maps JavaScript API (browser) key

// Where /api lives. Leave "" for same-origin (production). When running the
// backend locally with `vercel dev`, set this to "http://localhost:3000".
window.API_BASE = "";
