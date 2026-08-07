/* ============================================================================
   nav-auth.js — reflects auth state in the top nav on any page that includes it.
   Requires supabase.js (window.DB) to be loaded first.

   • Signed out (or backend not configured): leaves the existing
     `<a class="signin" href="auth.html">Sign in</a>` untouched.
   • Signed in: swaps it for an avatar chip + dropdown (profile / feed / sign out)
     and appends the same links to the mobile menu.
   ============================================================================ */
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  var CSS = '' +
    '.nav-chip{display:flex;align-items:center;gap:9px;padding:5px 12px 5px 6px;border-radius:999px;' +
      'border:1px solid var(--line);background:var(--surface);cursor:pointer;font:inherit;color:var(--fg);}' +
    '.nav-chip:hover{border-color:var(--fg-3);}' +
    '.nav-chip .av{width:26px;height:26px;border-radius:7px;background:var(--accent);color:var(--accent-ink);' +
      'display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;overflow:hidden;flex:0 0 auto;}' +
    '.nav-chip .av img{width:100%;height:100%;object-fit:cover;}' +
    '.nav-chip .nm{font-size:13.5px;color:var(--fg);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.nav-menu-wrap{position:relative;}' +
    '.nav-menu{position:absolute;right:0;top:calc(100% + 10px);min-width:210px;background:var(--surface);' +
      'border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:8px;z-index:80;display:none;}' +
    '.nav-menu.open{display:block;}' +
    '.nav-menu .who{padding:8px 10px 10px;border-bottom:1px solid var(--line-2);margin-bottom:6px;}' +
    '.nav-menu .who .dn{font-size:14px;font-weight:600;color:var(--fg);}' +
    '.nav-menu .who .hd{font-size:12.5px;color:var(--fg-3);margin-top:2px;}' +
    '.nav-menu a,.nav-menu button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:9px 10px;' +
      'border-radius:9px;font:inherit;font-size:13.5px;color:var(--fg-2);background:transparent;border:none;cursor:pointer;}' +
    '.nav-menu a:hover,.nav-menu button:hover{background:var(--bg-2);color:var(--fg);}' +
    '.nav-menu .sep{height:1px;background:var(--line-2);margin:6px 0;}' +
    '@media (max-width:560px){ .nav-chip .nm{display:none;} }';

  function inject() {
    if (document.getElementById('nav-auth-css')) return;
    var s = document.createElement('style');
    s.id = 'nav-auth-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function build(profile) {
    var slot = document.querySelector('.nav-right');
    if (!slot) return;
    var signin = slot.querySelector('.signin');
    var existingChip = slot.querySelector('.avatar-chip, .nav-menu-wrap');

    inject();

    var name = (profile && profile.display_name) || 'You';
    var handle = profile && profile.handle ? '@' + profile.handle : '';
    var avUrl = window.DB.avatarUrl(profile);
    var avInner = avUrl ? '<img src="' + avUrl + '" alt=""/>' : window.DB.initials(name);

    var wrap = document.createElement('div');
    wrap.className = 'nav-menu-wrap';
    wrap.innerHTML =
      '<button class="nav-chip" aria-haspopup="true" aria-expanded="false">' +
        '<span class="av">' + avInner + '</span>' +
        '<span class="nm">' + escapeHtml(name.split(' ')[0]) + '</span>' +
      '</button>' +
      '<div class="nav-menu" role="menu">' +
        '<div class="who"><div class="dn">' + escapeHtml(name) + '</div><div class="hd">' + escapeHtml(handle) + '</div></div>' +
        '<a href="profile.html" role="menuitem">My profile</a>' +
        '<a href="garage.html" role="menuitem">The Garage · Feed</a>' +
        '<a href="calculator.html" role="menuitem">New comparison</a>' +
        '<div class="sep"></div>' +
        '<button type="button" data-signout role="menuitem">Sign out</button>' +
      '</div>';

    if (signin) signin.replaceWith(wrap);
    else if (existingChip) existingChip.replaceWith(wrap);
    else slot.appendChild(wrap);

    var btn = wrap.querySelector('.nav-chip');
    var menu = wrap.querySelector('.nav-menu');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    });
    wrap.querySelector('[data-signout]').addEventListener('click', function () {
      window.DB.signOut().then(function () { location.href = 'index.html'; });
    });

    // Mobile menu extras
    var mm = document.querySelector('.mobile-menu');
    if (mm && !mm.querySelector('[data-auth-extra]')) {
      var frag = document.createElement('div');
      frag.setAttribute('data-auth-extra', '');
      frag.innerHTML =
        '<a href="profile.html">My profile</a>' +
        '<a href="#" data-mob-signout>Sign out</a>';
      mm.appendChild(frag);
      frag.querySelector('[data-mob-signout]').addEventListener('click', function (e) {
        e.preventDefault();
        window.DB.signOut().then(function () { location.href = 'index.html'; });
      });
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  ready(function () {
    if (!window.DB || !window.DB.configured) return; // leave "Sign in" as-is
    window.DB.getUser().then(function (u) {
      if (!u) return;
      window.DB.profile().then(build).catch(function () { build({ display_name: 'You' }); });
    });
  });
})();
