/**
 * COSMOSKIN — Bottom Navigation System
 * Auto-injects persistent bottom nav on mobile.
 * Active state from URL. Cart badge from localStorage.
 */
(function () {
  'use strict';

  var NAV_HTML = [
    '<nav class="cs-bottom-nav" aria-label="Ana gezinme" id="csBottomNav">',

    /* Home */
    '<a class="cs-tab cs-tab-home" href="/index.html" aria-label="Anasayfa">',
    '<svg viewBox="0 0 24 24"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>',
    '<span>Ana Sayfa</span>',
    '</a>',

    /* Search */
    '<button class="cs-tab cs-tab-search" id="csSearchTabBtn" aria-label="Arama" type="button">',
    '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
    '<span>Ara</span>',
    '</button>',

    /* Categories */
    '<a class="cs-tab cs-tab-categories" href="/collections/cleanse.html" aria-label="Kategoriler">',
    '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    '<span>Kategoriler</span>',
    '</a>',

    /* Favorites */
    '<a class="cs-tab cs-tab-favorites" href="/profile.html#favorites" aria-label="Favoriler">',
    '<svg viewBox="0 0 24 24"><path d="M12 21s-6.716-4.27-9.193-8.12C.89 9.91 1.59 6.1 4.61 4.39c2.06-1.17 4.62-.82 6.39.87 1.77-1.69 4.33-2.04 6.39-.87 3.02 1.71 3.72 5.52 1.803 8.49C18.716 16.73 12 21 12 21z"/></svg>',
    '<span>Favoriler</span>',
    '</a>',

    /* Cart */
    '<button class="cs-tab cs-tab-cart" id="csCartTabBtn" aria-label="Sepet" type="button">',
    '<svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    '<span class="cs-cart-badge" id="csCartBadge"></span>',
    '<span>Sepet</span>',
    '</button>',

    '</nav>'
  ].join('');

  /* ── Inject nav ── */
  function inject() {
    if (document.getElementById('csBottomNav')) return;
    var div = document.createElement('div');
    div.innerHTML = NAV_HTML;
    var nav = div.firstChild;
    document.body.appendChild(nav);

    setActiveTab();
    bindCartBtn();
    bindSearchBtn();
    updateCartBadge();
  }

  /* ── Active state from URL ── */
  function setActiveTab() {
    var path = location.pathname;
    var nav = document.getElementById('csBottomNav');
    if (!nav) return;

    var tabs = nav.querySelectorAll('.cs-tab');
    tabs.forEach(function (t) { t.classList.remove('is-active'); });

    var active = null;

    if (path === '/' || path.indexOf('/index') !== -1 || path === '') {
      active = nav.querySelector('.cs-tab-home');
    } else if (path.indexOf('/collections/') !== -1 || path.indexOf('/brands/') !== -1) {
      active = nav.querySelector('.cs-tab-categories');
    } else if (path.indexOf('/products/') !== -1) {
      /* PDP — no specific tab active */
    } else if (path.indexOf('/profile') !== -1) {
      active = nav.querySelector('.cs-tab-favorites');
    } else if (path.indexOf('/search') !== -1) {
      active = nav.querySelector('.cs-tab-search');
    }

    if (active) active.classList.add('is-active');
  }

  /* ── Cart button — open existing cart drawer ── */
  function bindCartBtn() {
    var btn = document.getElementById('csCartTabBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      /* Try existing cart button */
      var existingCartBtn = document.getElementById('cartBtn');
      if (existingCartBtn) {
        existingCartBtn.click();
        return;
      }
      /* Fallback: open drawer directly */
      var drawer = document.getElementById('cartDrawer');
      var backdrop = document.getElementById('backdrop');
      if (drawer) {
        drawer.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
      }
    });
  }

  /* ── Search button — open search sheet / navigate ── */
  function bindSearchBtn() {
    var btn = document.getElementById('csSearchTabBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      /* If on search page, focus input */
      if (location.pathname.indexOf('/search') !== -1) {
        var inp = document.getElementById('searchPageInput');
        if (inp) { inp.focus(); return; }
      }
      /* Navigate to search page */
      location.href = '/search.html';
    });
  }

  /* ── Cart badge from localStorage ── */
  function updateCartBadge() {
    var badge = document.getElementById('csCartBadge');
    if (!badge) return;
    try {
      var cart = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]');
      var total = cart.reduce(function (s, i) { return s + (i.qty || 1); }, 0);
      if (total > 0) {
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.classList.add('visible');
      } else {
        badge.classList.remove('visible');
      }
    } catch (e) { /* ignore */ }
  }

  /* ── Observe cart changes ── */
  window.addEventListener('cosmoskin:cart-updated', updateCartBadge);
  window.addEventListener('storage', function (e) {
    if (e.key === 'cosmoskin_cart') updateCartBadge();
  });

  /* ── Init ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

})();
