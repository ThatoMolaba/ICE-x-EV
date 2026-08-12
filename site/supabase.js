/* ============================================================================
   supabase.js — shared client + auth/data helpers for The Garage.
   ----------------------------------------------------------------------------
   Load order on every page that needs it:
     <script src="config.local.js"></script>              (URL + anon key)
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="supabase.js"></script>                  (this file → window.DB)

   Everything hangs off window.DB. When Supabase isn't configured yet,
   DB.configured is false and pages should show a "connect your backend" notice
   rather than call data methods.
   ============================================================================ */
(function () {
  var URL = window.SUPABASE_URL || '';
  var KEY = window.SUPABASE_ANON_KEY || '';
  var lib = window.supabase; // the @supabase/supabase-js UMD global
  var configured = !!(URL && KEY && lib && lib.createClient);

  var sb = configured
    ? lib.createClient(URL, KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  // ---- session / profile cache -------------------------------------------
  var _user = null;      // auth user (or null)
  var _profile = null;   // current user's profiles row (or null)
  var _loaded = false;

  function _refresh() {
    if (!configured) { _loaded = true; return Promise.resolve(null); }
    return sb.auth.getSession().then(function (r) {
      _user = (r && r.data && r.data.session && r.data.session.user) || null;
      _loaded = true;
      return _user;
    });
  }

  var ready = _refresh();

  if (configured) {
    sb.auth.onAuthStateChange(function (_evt, session) {
      var next = (session && session.user) || null;
      if ((next && next.id) !== (_user && _user.id)) _profile = null; // user changed → drop cached profile
      _user = next;
    });
  }

  // ---- helpers ------------------------------------------------------------
  function notConfigured() {
    return Promise.reject(new Error('Supabase is not configured. See supabase/README.md.'));
  }

  // ---- reachability -------------------------------------------------------
  // `configured` only means the URL + key strings are present and the library
  // loaded. It says nothing about whether the project still answers. A paused
  // or deleted Supabase project stops resolving in DNS, so every query rejects
  // with a bare "TypeError: Failed to fetch" — useless to show a visitor.
  // These two helpers let pages tell "backend is gone" apart from a real query
  // error and degrade gracefully instead.

  var PROBE_TIMEOUT = 6000;

  // True for transport-level failures (DNS, CORS, offline, abort) as opposed to
  // a Postgres/PostgREST error, which always arrives with a real message.
  function isNetworkError(ex) {
    if (!ex) return false;
    if (ex.name === 'TypeError' || ex.name === 'AbortError') return true;
    return /failed to fetch|networkerror|network error|load failed|fetch failed/i
      .test(String(ex.message || ex));
  }

  // Resolves 'ok' | 'unconfigured' | 'unreachable'. Cached — one probe per page.
  // Any HTTP response at all counts as reachable; we only care about transport.
  var _probe = null;
  function probe() {
    if (!configured) return Promise.resolve('unconfigured');
    if (_probe) return _probe;
    _probe = new Promise(function (resolve) {
      var done = false;
      function settle(v) { if (!done) { done = true; resolve(v); } }

      var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctl) { try { ctl.abort(); } catch (e) {} }
        settle('unreachable');
      }, PROBE_TIMEOUT);

      fetch(String(URL).replace(/\/+$/, '') + '/rest/v1/', {
        method: 'GET',
        headers: { apikey: KEY },
        signal: ctl ? ctl.signal : undefined
      }).then(function () {
        clearTimeout(timer); settle('ok');
      }).catch(function () {
        clearTimeout(timer); settle('unreachable');
      });
    });
    return _probe;
  }

  function user() { return _user; }               // sync (after `ready`)
  function isReady() { return _loaded; }

  function getUser() {                              // async, always fresh-ish
    if (!configured) return Promise.resolve(null);
    return ready.then(function () { return _user; });
  }

  // Current user's profile (cached).
  function profile() {
    if (!configured) return notConfigured();
    if (_profile) return Promise.resolve(_profile);
    return getUser().then(function (u) {
      if (!u) return null;
      return sb.from('profiles').select('*').eq('id', u.id).single().then(function (r) {
        if (r.error) throw r.error;
        _profile = r.data;
        return _profile;
      });
    });
  }
  function clearProfileCache() { _profile = null; }

  // Fetch any profile by id or @handle.
  function getProfile(idOrHandle) {
    if (!configured) return notConfigured();
    var col = /^[0-9a-f-]{36}$/i.test(idOrHandle) ? 'id' : 'handle';
    return sb.from('profiles').select('*').eq(col, idOrHandle).single().then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
  }

  function signOut() {
    if (!configured) return Promise.resolve();
    _profile = null; _user = null;
    return sb.auth.signOut();
  }

  // Redirect to sign-in if there's no session. Returns the user (or null if it
  // redirected). Call as: `await DB.requireUser()`.
  function requireUser(opts) {
    opts = opts || {};
    return getUser().then(function (u) {
      if (u) return u;
      var next = encodeURIComponent(location.pathname + location.search);
      location.href = (opts.to || 'auth.html') + '?next=' + next;
      return null;
    });
  }

  // Resolve a storage path OR full URL to a public URL.
  // `data:` URIs pass straight through so inline/placeholder art renders with
  // no storage round-trip.
  function publicUrl(bucket, path) {
    if (!path) return null;
    if (/^(https?:\/\/|data:)/.test(path)) return path;
    if (!configured) return null;
    return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
  function avatarUrl(p) {
    if (!p) return null;
    return publicUrl('avatars', p.avatar_url);
  }
  function photoUrl(path) { return publicUrl('post-photos', path); }

  // Upload a File into "<uid>/<name>" of a bucket; returns the stored path.
  function upload(bucket, file, uid) {
    if (!configured) return notConfigured();
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    var path = uid + '/' + Math.random().toString(36).slice(2) + '_' + Date.now() + '.' + ext;
    return sb.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false })
      .then(function (r) { if (r.error) throw r.error; return path; });
  }

  // ---- small display utilities (shared across pages) ---------------------
  function initials(name) {
    if (!name) return '?';
    var parts = String(name).trim().split(/\s+/).slice(0, 2);
    return parts.map(function (s) { return s.charAt(0).toUpperCase(); }).join('') || '?';
  }
  function timeAgo(ts) {
    var d = (Date.now() - new Date(ts).getTime()) / 1000;
    if (d < 45) return 'just now';
    if (d < 90) return '1 min';
    if (d < 3600) return Math.round(d / 60) + ' min';
    if (d < 5400) return '1 hr';
    if (d < 86400) return Math.round(d / 3600) + ' hr';
    if (d < 172800) return 'yesterday';
    if (d < 604800) return Math.round(d / 86400) + ' d';
    return new Date(ts).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  }
  function group(n) {
    return Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  window.DB = {
    sb: sb,
    configured: configured,
    probe: probe,
    isNetworkError: isNetworkError,
    ready: ready,
    isReady: isReady,
    user: user,
    getUser: getUser,
    profile: profile,
    clearProfileCache: clearProfileCache,
    getProfile: getProfile,
    signOut: signOut,
    requireUser: requireUser,
    publicUrl: publicUrl,
    avatarUrl: avatarUrl,
    photoUrl: photoUrl,
    upload: upload,
    initials: initials,
    timeAgo: timeAgo,
    group: group
  };
})();
