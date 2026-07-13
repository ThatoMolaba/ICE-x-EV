// Browser-side config for the static site.
// Copy this file to `config.local.js` (git-ignored) and fill in your values.
//
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
