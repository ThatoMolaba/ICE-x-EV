-- ============================================================================
-- THE GARAGE — Supabase schema  ("Twitter for Car People", ICE → EV)
-- ----------------------------------------------------------------------------
-- Run this ONCE in your Supabase project (SQL editor → paste → Run). It creates
-- every table, security policy, trigger, storage bucket and realtime hook for
-- ALL features — Feed, Dealer Ratings, Profiles, Saved Comparisons, Ask an
-- Owner, Auth (auto-profile) and Concierge bookings — so you never have to
-- re-run migrations as the UI is built out phase by phase.
--
-- Safe to re-run: everything is guarded with "if not exists" / "on conflict".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES  (one row per auth user, created automatically on signup)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  handle             text unique not null,
  display_name       text not null default 'New member',
  avatar_url         text,
  bio                text not null default '',
  car_make           text,
  car_model          text,
  car_year           int,
  fuel_type          text check (fuel_type in ('ICE','EV','Hybrid','PHEV')),
  location           text,
  is_verified_owner  boolean not null default false,   -- verified EV owner (Ask an Owner)
                                                       -- NOT self-serve: update is revoked from
                                                       -- anon/authenticated further down, so only
                                                       -- service_role (dashboard) can grant it.
  created_at         timestamptz not null default now()
);

-- Personal preferences, kept OUT of the profile row. public.profiles is
-- world-readable by design (it is a social site), and a member's typical
-- monthly distance and home electricity tariff are usage/financial details no
-- other visitor needs. Owner-only RLS below.
create table if not exists public.profile_prefs (
  profile_id   uuid primary key references public.profiles(id) on delete cascade,
  monthly_km   int default 2000,
  home_tariff  numeric(6,2) default 3.30,              -- R/kWh
  updated_at   timestamptz not null default now()
);

-- Carry values over from the previous layout, then drop them. A no-op on a
-- fresh database; preserves data if an earlier version of this schema was run.
-- Dynamic SQL deliberately: the old columns do not exist on a fresh database,
-- and EXECUTE defers resolving them until the branch actually runs.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles'
               and column_name = 'monthly_km') then
    execute $mig$
      insert into public.profile_prefs (profile_id, monthly_km, home_tariff)
      select id, monthly_km, home_tariff from public.profiles
      on conflict (profile_id) do nothing
    $mig$;
    execute 'alter table public.profiles drop column monthly_km';
    execute 'alter table public.profiles drop column home_tariff';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. SOCIAL GRAPH
-- ---------------------------------------------------------------------------
create table if not exists public.follows (
  follower_id   uuid not null references public.profiles(id) on delete cascade,
  following_id  uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

-- ---------------------------------------------------------------------------
-- 3. SAVED COMPARISONS  (Snap & Compare / Calculator results, shareable to feed)
-- ---------------------------------------------------------------------------
create table if not exists public.comparisons (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  title       text not null default 'Comparison',
  car_a       jsonb not null,          -- { name, kind, year, price, run, tco5, ... }
  car_b       jsonb not null,
  result      jsonb,                   -- { winner, savingPerYear, breakEvenYear, ... }
  is_public   boolean not null default false,   -- true once shared into the feed
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. FEED  (posts + photos + likes + comments)
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles(id) on delete cascade,
  body           text not null default '',
  photos         text[] not null default '{}',            -- storage paths in 'post-photos'
  comparison_id  uuid references public.comparisons(id) on delete set null,
  like_count     int not null default 0,                  -- kept in sync by trigger
  comment_count  int not null default 0,                  -- kept in sync by trigger
  created_at     timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx  on public.posts (author_id);

create table if not exists public.post_likes (
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

-- ---------------------------------------------------------------------------
-- 5. DEALER RATINGS  (dealers, 3-axis ratings, salesperson nominations)
-- ---------------------------------------------------------------------------
create table if not exists public.dealers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  area        text,
  brand       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists dealers_name_idx on public.dealers (lower(name));

create table if not exists public.dealer_ratings (
  id          uuid primary key default gen_random_uuid(),
  dealer_id   uuid not null references public.dealers(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  service     int not null check (service between 1 and 5),
  price       int not null check (price between 1 and 5),
  honesty     int not null check (honesty between 1 and 5),
  review      text not null default '',
  created_at  timestamptz not null default now(),
  unique (dealer_id, user_id)              -- one rating per user per dealer
);

create table if not exists public.salespeople (
  id          uuid primary key default gen_random_uuid(),
  dealer_id   uuid not null references public.dealers(id) on delete cascade,
  name        text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
-- Added after the fact: without an owner column there is no way to attribute or
-- remove a bogus entry, and the insert policy had nothing to check against.
alter table public.salespeople
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create table if not exists public.salesperson_nominations (
  id              uuid primary key default gen_random_uuid(),
  salesperson_id  uuid not null references public.salespeople(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  reason          text not null,
  created_at      timestamptz not null default now(),
  unique (salesperson_id, user_id)
);

-- Aggregate dealer scores (avg of the three axes + overall). security_invoker so
-- the caller's RLS applies; the underlying tables are public-readable anyway.
create or replace view public.dealer_scores
  with (security_invoker = true) as
select d.id as dealer_id,
       count(r.id)                                   as rating_count,
       round(avg(r.service)::numeric, 1)             as avg_service,
       round(avg(r.price)::numeric, 1)               as avg_price,
       round(avg(r.honesty)::numeric, 1)             as avg_honesty,
       round(avg((r.service + r.price + r.honesty) / 3.0)::numeric, 1) as avg_overall
from public.dealers d
left join public.dealer_ratings r on r.dealer_id = d.id
group by d.id;

-- ---------------------------------------------------------------------------
-- 6. ASK AN OWNER  (forum: threads + replies, verified-owner flag)
-- ---------------------------------------------------------------------------
create table if not exists public.ask_threads (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  body         text not null default '',
  topic        text,                         -- 'charging' | 'cost' | 'range' | 'buying' | ...
  reply_count  int not null default 0,       -- kept in sync by trigger
  created_at   timestamptz not null default now()
);
create index if not exists ask_threads_created_idx on public.ask_threads (created_at desc);

create table if not exists public.ask_replies (
  id                   uuid primary key default gen_random_uuid(),
  thread_id            uuid not null references public.ask_threads(id) on delete cascade,
  author_id            uuid not null references public.profiles(id) on delete cascade,
  body                 text not null,
  from_verified_owner  boolean not null default false,
  created_at           timestamptz not null default now()
);
create index if not exists ask_replies_thread_idx on public.ask_replies (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- 7. CONCIERGE BOOKINGS  (test drive / service requests)
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  kind            text not null check (kind in ('test_drive','service')),
  vehicle         text,
  dealer_id       uuid references public.dealers(id) on delete set null,
  preferred_date  date,
  preferred_time  text,
  notes           text,
  status          text not null default 'requested' check (status in ('requested','confirmed','cancelled')),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. BADGES
-- ---------------------------------------------------------------------------
create table if not exists public.badges (
  slug         text primary key,
  label        text not null,
  description  text,
  icon         text                         -- emoji or lucide name, rendered client-side
);

create table if not exists public.profile_badges (
  profile_id   uuid references public.profiles(id) on delete cascade,
  badge_slug   text references public.badges(slug) on delete cascade,
  awarded_at   timestamptz not null default now(),
  primary key (profile_id, badge_slug)
);

insert into public.badges (slug, label, description, icon) values
  ('founding-member', 'Founding Member', 'Joined in the early days of The Garage', '🚀'),
  ('verified-owner',  'Verified EV Owner','Confirmed owner of an electric vehicle',  '⚡'),
  ('first-post',      'First Post',       'Shared their first post in the feed',     '✍️'),
  ('reviewer',        'Trusted Reviewer', 'Rated a dealership',                       '⭐'),
  ('helper',          'Community Helper', 'Answered a question in Ask an Owner',      '🤝')
on conflict (slug) do nothing;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-create a profile whenever a new auth user signs up (email or OAuth).
-- Generates a unique handle from the email/name and awards Founding Member.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_handle text;
  final_handle text;
  suffix int := 0;
begin
  base_handle := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  if base_handle is null or base_handle = '' then base_handle := 'member'; end if;
  base_handle := left(base_handle, 20);
  final_handle := base_handle;
  while exists (select 1 from public.profiles where handle = final_handle) loop
    suffix := suffix + 1;
    final_handle := base_handle || suffix::text;
  end loop;

  insert into public.profiles (id, handle, display_name, avatar_url)
  values (
    new.id,
    final_handle,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''),
             nullif(new.raw_user_meta_data->>'name',''),
             initcap(base_handle)),
    new.raw_user_meta_data->>'avatar_url'
  );

  insert into public.profile_prefs (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  insert into public.profile_badges (profile_id, badge_slug)
  values (new.id, 'founding-member')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep posts.like_count in sync.
-- security definer is load-bearing, not boilerplate: as security invoker this
-- UPDATE runs as the *liking* user and is filtered by posts_update_own
-- (auth.uid() = author_id), so liking anyone else's post matched zero rows and
-- the counter silently never moved. Running as the table owner bypasses RLS,
-- and is also what lets like_count be revoked from clients below.
create or replace function public.bump_post_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists trg_post_like_count on public.post_likes;
create trigger trg_post_like_count
  after insert or delete on public.post_likes
  for each row execute function public.bump_post_like_count();

-- Keep posts.comment_count in sync. security definer for the same reason.
create or replace function public.bump_post_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists trg_post_comment_count on public.comments;
create trigger trg_post_comment_count
  after insert or delete on public.comments
  for each row execute function public.bump_post_comment_count();

-- Keep ask_threads.reply_count in sync. security definer for the same reason.
create or replace function public.bump_thread_reply_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.ask_threads set reply_count = reply_count + 1 where id = new.thread_id;
  elsif tg_op = 'DELETE' then
    update public.ask_threads set reply_count = greatest(0, reply_count - 1) where id = old.thread_id;
  end if;
  return null;
end $$;
drop trigger if exists trg_thread_reply_count on public.ask_replies;
create trigger trg_thread_reply_count
  after insert or delete on public.ask_replies
  for each row execute function public.bump_thread_reply_count();

-- Stamp ask_replies.from_verified_owner from the author's actual profile.
-- The insert policy only checks author_id, so the client was free to send
-- from_verified_owner = true on its own reply and borrow the credibility of a
-- verified owner. Whatever the client sends is overwritten here.
create or replace function public.stamp_reply_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.from_verified_owner := coalesce(
    (select is_verified_owner from public.profiles where id = new.author_id), false);
  return new;
end $$;
drop trigger if exists trg_stamp_reply_verified on public.ask_replies;
create trigger trg_stamp_reply_verified
  before insert or update on public.ask_replies
  for each row execute function public.stamp_reply_verified();

-- Mirror profiles.is_verified_owner onto the verified-owner badge.
create or replace function public.sync_verified_badge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_verified_owner then
    insert into public.profile_badges (profile_id, badge_slug)
    values (new.id, 'verified-owner') on conflict do nothing;
  else
    delete from public.profile_badges where profile_id = new.id and badge_slug = 'verified-owner';
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_verified_badge on public.profiles;
create trigger trg_sync_verified_badge
  after update of is_verified_owner on public.profiles
  for each row execute function public.sync_verified_badge();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Reads are public (a social site is public by design); writes are limited to
-- the authenticated owner of each row. Private tables (bookings) are owner-only.
-- ============================================================================
alter table public.profiles                enable row level security;
alter table public.profile_prefs           enable row level security;
alter table public.follows                 enable row level security;
alter table public.comparisons             enable row level security;
alter table public.posts                   enable row level security;
alter table public.post_likes              enable row level security;
alter table public.comments                enable row level security;
alter table public.dealers                 enable row level security;
alter table public.dealer_ratings          enable row level security;
alter table public.salespeople             enable row level security;
alter table public.salesperson_nominations enable row level security;
alter table public.ask_threads             enable row level security;
alter table public.ask_replies             enable row level security;
alter table public.bookings                enable row level security;
alter table public.badges                  enable row level security;
alter table public.profile_badges          enable row level security;

-- Helper: recreate a policy idempotently.
do $$ begin
  -- PROFILES ---------------------------------------------------------------
  drop policy if exists profiles_read on public.profiles;
  create policy profiles_read on public.profiles for select using (true);
  drop policy if exists profiles_update_own on public.profiles;
  create policy profiles_update_own on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

  -- PROFILE PREFS (private to the owner) -----------------------------------
  drop policy if exists profile_prefs_read_own on public.profile_prefs;
  create policy profile_prefs_read_own on public.profile_prefs for select using (auth.uid() = profile_id);
  drop policy if exists profile_prefs_insert_own on public.profile_prefs;
  create policy profile_prefs_insert_own on public.profile_prefs for insert with check (auth.uid() = profile_id);
  drop policy if exists profile_prefs_update_own on public.profile_prefs;
  create policy profile_prefs_update_own on public.profile_prefs for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

  -- FOLLOWS ----------------------------------------------------------------
  drop policy if exists follows_read on public.follows;
  create policy follows_read on public.follows for select using (true);
  drop policy if exists follows_insert_own on public.follows;
  create policy follows_insert_own on public.follows for insert with check (auth.uid() = follower_id);
  drop policy if exists follows_delete_own on public.follows;
  create policy follows_delete_own on public.follows for delete using (auth.uid() = follower_id);

  -- COMPARISONS ------------------------------------------------------------
  drop policy if exists comparisons_read on public.comparisons;
  create policy comparisons_read on public.comparisons for select using (is_public or auth.uid() = owner_id);
  drop policy if exists comparisons_insert_own on public.comparisons;
  create policy comparisons_insert_own on public.comparisons for insert with check (auth.uid() = owner_id);
  drop policy if exists comparisons_update_own on public.comparisons;
  -- with check matters as much as using: `using` decides which rows may be
  -- updated, `with check` validates the row that results. Without it the owner
  -- column can be rewritten to another user, handing the row away.
  create policy comparisons_update_own on public.comparisons for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  drop policy if exists comparisons_delete_own on public.comparisons;
  create policy comparisons_delete_own on public.comparisons for delete using (auth.uid() = owner_id);

  -- POSTS ------------------------------------------------------------------
  drop policy if exists posts_read on public.posts;
  create policy posts_read on public.posts for select using (true);
  drop policy if exists posts_insert_own on public.posts;
  create policy posts_insert_own on public.posts for insert with check (auth.uid() = author_id);
  drop policy if exists posts_update_own on public.posts;
  create policy posts_update_own on public.posts for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
  drop policy if exists posts_delete_own on public.posts;
  create policy posts_delete_own on public.posts for delete using (auth.uid() = author_id);

  -- POST LIKES -------------------------------------------------------------
  drop policy if exists post_likes_read on public.post_likes;
  create policy post_likes_read on public.post_likes for select using (true);
  drop policy if exists post_likes_insert_own on public.post_likes;
  create policy post_likes_insert_own on public.post_likes for insert with check (auth.uid() = user_id);
  drop policy if exists post_likes_delete_own on public.post_likes;
  create policy post_likes_delete_own on public.post_likes for delete using (auth.uid() = user_id);

  -- COMMENTS ---------------------------------------------------------------
  drop policy if exists comments_read on public.comments;
  create policy comments_read on public.comments for select using (true);
  drop policy if exists comments_insert_own on public.comments;
  create policy comments_insert_own on public.comments for insert with check (auth.uid() = author_id);
  drop policy if exists comments_delete_own on public.comments;
  create policy comments_delete_own on public.comments for delete using (auth.uid() = author_id);

  -- DEALERS ----------------------------------------------------------------
  drop policy if exists dealers_read on public.dealers;
  create policy dealers_read on public.dealers for select using (true);
  drop policy if exists dealers_insert_auth on public.dealers;
  create policy dealers_insert_auth on public.dealers for insert with check (auth.uid() = created_by);
  drop policy if exists dealers_update_own on public.dealers;
  create policy dealers_update_own on public.dealers for update using (auth.uid() = created_by) with check (auth.uid() = created_by);

  -- DEALER RATINGS ---------------------------------------------------------
  drop policy if exists ratings_read on public.dealer_ratings;
  create policy ratings_read on public.dealer_ratings for select using (true);
  drop policy if exists ratings_insert_own on public.dealer_ratings;
  create policy ratings_insert_own on public.dealer_ratings for insert with check (auth.uid() = user_id);
  drop policy if exists ratings_update_own on public.dealer_ratings;
  create policy ratings_update_own on public.dealer_ratings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  drop policy if exists ratings_delete_own on public.dealer_ratings;
  create policy ratings_delete_own on public.dealer_ratings for delete using (auth.uid() = user_id);

  -- SALESPEOPLE ------------------------------------------------------------
  drop policy if exists salespeople_read on public.salespeople;
  create policy salespeople_read on public.salespeople for select using (true);
  drop policy if exists salespeople_insert_auth on public.salespeople;
  create policy salespeople_insert_auth on public.salespeople for insert to authenticated with check (auth.uid() = created_by);
  drop policy if exists salespeople_delete_own on public.salespeople;
  create policy salespeople_delete_own on public.salespeople for delete using (auth.uid() = created_by);

  -- SALESPERSON NOMINATIONS ------------------------------------------------
  drop policy if exists noms_read on public.salesperson_nominations;
  create policy noms_read on public.salesperson_nominations for select using (true);
  drop policy if exists noms_insert_own on public.salesperson_nominations;
  create policy noms_insert_own on public.salesperson_nominations for insert with check (auth.uid() = user_id);
  drop policy if exists noms_delete_own on public.salesperson_nominations;
  create policy noms_delete_own on public.salesperson_nominations for delete using (auth.uid() = user_id);

  -- ASK THREADS ------------------------------------------------------------
  drop policy if exists ask_threads_read on public.ask_threads;
  create policy ask_threads_read on public.ask_threads for select using (true);
  drop policy if exists ask_threads_insert_own on public.ask_threads;
  create policy ask_threads_insert_own on public.ask_threads for insert with check (auth.uid() = author_id);
  drop policy if exists ask_threads_delete_own on public.ask_threads;
  create policy ask_threads_delete_own on public.ask_threads for delete using (auth.uid() = author_id);

  -- ASK REPLIES ------------------------------------------------------------
  drop policy if exists ask_replies_read on public.ask_replies;
  create policy ask_replies_read on public.ask_replies for select using (true);
  drop policy if exists ask_replies_insert_own on public.ask_replies;
  create policy ask_replies_insert_own on public.ask_replies for insert with check (auth.uid() = author_id);
  drop policy if exists ask_replies_delete_own on public.ask_replies;
  create policy ask_replies_delete_own on public.ask_replies for delete using (auth.uid() = author_id);

  -- BOOKINGS (private, owner-only) -----------------------------------------
  drop policy if exists bookings_read_own on public.bookings;
  create policy bookings_read_own on public.bookings for select using (auth.uid() = user_id);
  drop policy if exists bookings_insert_own on public.bookings;
  create policy bookings_insert_own on public.bookings for insert with check (auth.uid() = user_id);
  drop policy if exists bookings_update_own on public.bookings;
  create policy bookings_update_own on public.bookings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  drop policy if exists bookings_delete_own on public.bookings;
  create policy bookings_delete_own on public.bookings for delete using (auth.uid() = user_id);

  -- BADGES -----------------------------------------------------------------
  drop policy if exists badges_read on public.badges;
  create policy badges_read on public.badges for select using (true);
  drop policy if exists profile_badges_read on public.profile_badges;
  create policy profile_badges_read on public.profile_badges for select using (true);
end $$;

-- ============================================================================
-- COLUMN PRIVILEGES
-- ----------------------------------------------------------------------------
-- RLS decides which ROWS you may touch; it cannot say which COLUMNS. Three
-- columns are trust-bearing or trigger-maintained and must not be client
-- writable even on your own row:
--   profiles.is_verified_owner  — the "Verified EV Owner" badge. Self-serve
--                                 verification makes the badge worthless, and
--                                 trg_sync_verified_badge awards it on write.
--   posts.like_count / comment_count, ask_threads.reply_count
--                               — maintained by the bump_* triggers above.
--
-- Note on mechanics: REVOKE UPDATE (col) does NOT override a table-level
-- UPDATE grant, and Supabase grants ALL on public tables to anon/authenticated
-- by default. So the table-level privilege is withdrawn and only the safe
-- columns are granted back. The bump_* triggers are unaffected — they are
-- security definer and run as the owner.
-- ============================================================================
revoke update on public.profiles     from anon, authenticated;
revoke update on public.posts        from anon, authenticated;
revoke update on public.ask_threads  from anon, authenticated;

grant update (handle, display_name, avatar_url, bio,
              car_make, car_model, car_year, fuel_type, location)
  on public.profiles to authenticated;

grant update (body, photos, comparison_id)
  on public.posts to authenticated;

grant update (title, body, topic)
  on public.ask_threads to authenticated;

-- ============================================================================
-- STORAGE  (public buckets for avatars and post photos)
-- ----------------------------------------------------------------------------
-- Files live under a per-user folder (name = "<uid>/<file>") so users can only
-- write into their own folder while everyone can read.
-- ============================================================================
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('post-photos', 'post-photos', true)
  on conflict (id) do nothing;

do $$ begin
  drop policy if exists media_public_read on storage.objects;
  create policy media_public_read on storage.objects
    for select using (bucket_id in ('avatars','post-photos'));

  drop policy if exists media_insert_own on storage.objects;
  create policy media_insert_own on storage.objects
    for insert to authenticated
    with check (bucket_id in ('avatars','post-photos')
                and (storage.foldername(name))[1] = auth.uid()::text);

  drop policy if exists media_update_own on storage.objects;
  create policy media_update_own on storage.objects
    for update to authenticated
    using (bucket_id in ('avatars','post-photos')
           and (storage.foldername(name))[1] = auth.uid()::text);

  drop policy if exists media_delete_own on storage.objects;
  create policy media_delete_own on storage.objects
    for delete to authenticated
    using (bucket_id in ('avatars','post-photos')
           and (storage.foldername(name))[1] = auth.uid()::text);
end $$;

-- ============================================================================
-- REALTIME  (live likes, comments, posts, forum replies)
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['posts','post_likes','comments','ask_threads','ask_replies'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Done. Next: Authentication → Google provider (Dashboard → Authentication →
-- Providers) and paste your project URL + anon key into site/config.local.js.
--
-- To verify an EV owner (it is not self-serve — see COLUMN PRIVILEGES above),
-- run this from the SQL editor, which executes as the table owner:
--   update public.profiles set is_verified_owner = true where handle = 'their_handle';
