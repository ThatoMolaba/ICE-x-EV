# Supabase setup — The Garage backend

The community features (Feed, Profiles, Dealer Ratings, Saved Comparisons, Ask
an Owner, Auth, Concierge bookings) all run on a single Supabase project. This
is the one-time setup. Budget ~15 minutes. Free tier is plenty to launch.

---

## 1. Create the project

1. Go to <https://supabase.com> → **New project**. Pick a name (e.g. `the-garage`),
   a strong database password, and the region closest to South Africa
   (**EU (Frankfurt)** or **EU West** are the usual best latency picks).
2. Wait for it to finish provisioning (~2 min).

## 2. Run the schema

1. In the project, open **SQL Editor → New query**.
2. Paste the entire contents of [`schema.sql`](schema.sql) and click **Run**.
3. You should see "Success. No rows returned." It creates every table, security
   policy, trigger, storage bucket and realtime hook for **all** features — you
   only ever run this once (it's safe to re-run if you pull schema updates).

## 3. Get your keys → put them in the site config

1. **Project Settings → API**. Copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon / public** key (a long JWT — this one is safe in the browser; it's
     protected by the Row-Level Security policies the schema installed).
2. In `site/`, copy `config.example.js` to `config.local.js` (git-ignored) and
   fill them in:
   ```js
   window.SUPABASE_URL      = "https://xxxx.supabase.co";
   window.SUPABASE_ANON_KEY = "eyJhbGciOi...your-anon-key...";
   ```
   > Until these are set, every community page shows a friendly "Connect your
   > backend" notice instead of breaking — so you can browse the UI first.

## 4. Turn on authentication

**Email (works immediately):**
- **Authentication → Providers → Email** is on by default.
- For fast local testing, **Authentication → Sign In / Providers → Email** →
  turn **Confirm email** *off* while developing (turn it back on for production),
  otherwise new signups must click a confirmation link before they can log in.

**Google (optional but recommended):**
1. In Google Cloud Console → **APIs & Services → Credentials → Create OAuth
   client ID → Web application**.
2. Under **Authorized redirect URIs**, add the callback Supabase shows you at
   **Authentication → Providers → Google** (it looks like
   `https://xxxx.supabase.co/auth/v1/callback`).
3. Copy the Google **Client ID** and **Client secret** into that Supabase Google
   provider panel and **Enable** it.

**Redirect URLs:** under **Authentication → URL Configuration**, set
**Site URL** to where the site runs (e.g. `http://localhost:8000` in dev, your
Vercel domain in prod) and add both to **Redirect URLs**. This is where users
land after clicking an email link or finishing Google sign-in.

New users get a profile row **automatically** (a database trigger creates one
with a unique handle and the Founding Member badge — no app code needed).

## 5. Storage

The schema already created two **public** buckets — `avatars` and `post-photos`
— with policies that let a signed-in user write only into their own folder while
everyone can read. Nothing to click. You can see them under **Storage**.

## 6. Run the site locally

The community pages are static, so any static server works:

```bash
# from the repo root
npx serve site          # or: python -m http.server 8000 --directory site
```

Open `http://localhost:8000` (match the port to your Site URL above). Sign up,
and you should land on your auto-created profile.

> The AI Concierge additionally needs an `ANTHROPIC_API_KEY` server-side env var
> and `vercel dev` to run `/api/concierge` — see the root project notes. It's
> wired in the Live Engagement phase.

---

## What lives where

| Concern | Where |
|---|---|
| Tables, RLS, triggers, storage, realtime | `supabase/schema.sql` (run in SQL editor) |
| Browser config (URL + anon key) | `site/config.local.js` (git-ignored) |
| Shared client + auth helpers | `site/supabase.js` → `window.DB` |
| Auth-aware nav | `site/nav-auth.js` |
| Server secrets (Anthropic, Google Maps) | Vercel env vars / `.env.local` — never in `site/` |

## Security model in one line

Reads are public (it's a social site); every write is checked against
`auth.uid()` by RLS, so the browser can talk to the database directly and still
can't forge posts, ratings or edits as someone else.

### What RLS alone does *not* cover

Row-level security says which **rows** you may touch, never which **columns**.
Three things are therefore locked down with column privileges instead, because
they are trust-bearing or trigger-maintained:

| Column | Why it's not client-writable |
|---|---|
| `profiles.is_verified_owner` | A self-assignable "Verified EV Owner" badge means nothing to buyers. Granting it is a `service_role` action. |
| `posts.like_count`, `posts.comment_count` | Maintained by triggers; otherwise a member could set their own like count. |
| `ask_threads.reply_count` | Same. |

Note that `REVOKE UPDATE (column)` does **not** override a table-level `UPDATE`
grant, and Supabase grants `ALL` on public tables to `anon`/`authenticated` by
default — so `schema.sql` withdraws the table-level privilege and grants back
only the safe columns.

**To verify an EV owner**, from the SQL editor (it runs as the table owner):

```sql
update public.profiles set is_verified_owner = true where handle = 'their_handle';
```

Personal switch preferences (`monthly_km`, `home_tariff`) live in
`profile_prefs`, which is owner-only — `profiles` is world-readable and those
are nobody else's business.
