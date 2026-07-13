/* site.js — shared behaviour: theme, reveal, nav scroll, mobile menu, hero meter */
(function () {
  // ---- Theme (persisted) ----
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem('voltage-theme');
    if (saved) root.setAttribute('data-theme', saved);
  } catch (e) {}
  function setTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('voltage-theme', t); } catch (e) {}
    syncToggles();
  }
  function syncToggles() {
    var t = root.getAttribute('data-theme') || 'dark';
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-theme-btn') === t);
    });
  }
  window.VOLT = { setTheme: setTheme };

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    syncToggles();
    setTimeout(syncToggles, 250);
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-theme-btn]');
      if (b) setTheme(b.getAttribute('data-theme-btn'));
    });

    // ---- Nav scroll state ----
    var nav = document.querySelector('.vnav');
    if (nav) {
      var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 12); };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // ---- Mobile menu ----
    var burger = document.querySelector('.burger');
    var menu = document.querySelector('.mobile-menu');
    if (burger && menu) {
      burger.addEventListener('click', function () { menu.classList.toggle('open'); });
      menu.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { menu.classList.remove('open'); });
      });
    }

    // ---- Reveal ----
    var els = document.querySelectorAll('.reveal');
    function revealVisible() {
      var vh = window.innerHeight || 800;
      els.forEach(function (el) {
        if (el.classList.contains('in')) return;
        if (el.getBoundingClientRect().top < vh * 0.92) el.classList.add('in');
      });
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      els.forEach(function (el) { io.observe(el); });
      // Reveal above-the-fold immediately (don't wait on first IO tick).
      requestAnimationFrame(revealVisible);
      setTimeout(revealVisible, 200);
    } else {
      els.forEach(function (el) { el.classList.add('in'); });
    }

    // ---- Hero meter / underline trigger ----
    var hero = document.querySelector('.hero');
    if (hero) setTimeout(function () { hero.classList.add('lit'); }, 250);
  });
})();
