/**
 * COSMOSKIN — Mobile Layout Injector v4
 * Builds: search bar, category circles, trust bar, bottom nav.
 * Kills all old mobile injections.
 */
(function () {
  'use strict';

  /* ── Inline SVG icons ── */
  var ICON = {
    search:    '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/></svg>',
    qr:        '<svg viewBox="0 0 24 24"><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v2h-2zM15 19h2v2h-2zM19 19h2v2h-2z" stroke-linejoin="round"/></svg>',
    home:      '<svg viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/></svg>',
    grid:      '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    sparkle:   '<svg viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3.5"/></svg>',
    heart:     '<svg viewBox="0 0 24 24"><path d="M12 21C12 21 4 15.5 4 9.5a4 4 0 0 1 8 0 4 4 0 0 1 8 0C20 15.5 12 21 12 21z"/></svg>',
    bag:       '<svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',

    /* category circles */
    cat_serum:    '<svg viewBox="0 0 24 24" fill="none" stroke="#16120e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6v3l1 2v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7l1-2z"/><path d="M9 9h6"/><circle cx="12" cy="14" r="1.5"/></svg>',
    cat_skin:     '<svg viewBox="0 0 24 24" fill="none" stroke="#16120e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a8 8 0 0 0-8 8c0 5 4 9 8 10 4-1 8-5 8-10a8 8 0 0 0-8-8z"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/></svg>',
    cat_spf:      '<svg viewBox="0 0 24 24" fill="none" stroke="#16120e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M5.6 18.4l1.5-1.5M16.9 7.1l1.5-1.5"/></svg>',
    cat_toner:    '<svg viewBox="0 0 24 24" fill="none" stroke="#16120e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8v3l1 1v13a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2V7l1-1z"/><path d="M12 11v5"/></svg>',
    cat_mask:     '<svg viewBox="0 0 24 24" fill="none" stroke="#16120e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8c0-2 4-4 8-4s8 2 8 4-2 12-8 12S4 10 4 8z"/><circle cx="9" cy="11" r=".8"/><circle cx="15" cy="11" r=".8"/></svg>',
    cat_cream:    '<svg viewBox="0 0 24 24" fill="none" stroke="#16120e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M5 9V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/></svg>',
    cat_cleanse:  '<svg viewBox="0 0 24 24" fill="none" stroke="#16120e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10l-1 4H8z"/><path d="M8 8h8l-1 12a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/></svg>',

    /* trust bar */
    trust_truck:  '<svg viewBox="0 0 24 24" fill="none" stroke="#16120e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7h11v10H2z"/><path d="M13 10h5l3 3v4h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    trust_speed:  '<svg viewBox="0 0 24 24" fill="none" stroke="#16120e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 1 18 0"/><path d="M12 12l4-3"/><circle cx="12" cy="12" r="1.5"/></svg>',
    trust_shield: '<svg viewBox="0 0 24 24" fill="none" stroke="#16120e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    trust_return: '<svg viewBox="0 0 24 24" fill="none" stroke="#16120e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14H4v5"/><path d="M4 14a8 8 0 0 0 14 4"/><path d="M15 10h5V5"/><path d="M20 10A8 8 0 0 0 6 6"/></svg>'
  };

  /* ── Categories config ── */
  var CATEGORIES = [
    { label: 'Cilt Bakımı', icon: 'cat_skin',    href: '/collections/care.html' },
    { label: 'Serum',       icon: 'cat_serum',   href: '/collections/treat.html' },
    { label: 'SPF',         icon: 'cat_spf',     href: '/collections/protect.html' },
    { label: 'Tonik',       icon: 'cat_toner',   href: '/collections/hydrate.html' },
    { label: 'Maske',       icon: 'cat_mask',    href: '/collections/masks.html' },
    { label: 'Krem',        icon: 'cat_cream',   href: '/collections/care.html' },
    { label: 'Temizleyici', icon: 'cat_cleanse', href: '/collections/cleanse.html' }
  ];

  /* ── Trust bar config ── */
  var TRUST = [
    { icon: 'trust_truck',  label: 'Ücretsiz Kargo' },
    { icon: 'trust_speed',  label: 'Hızlı Teslimat' },
    { icon: 'trust_shield', label: 'Güvenli Alışveriş' },
    { icon: 'trust_return', label: 'Kolay İade' }
  ];

  function qs(s, r) { return (r || document).querySelector(s); }
  function ce(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }

  /* ── 1. Mobile search bar (sticky below header) ── */
  function injectSearchBar() {
    if (qs('.cs-m-search')) return;
    var path = location.pathname;
    if (path.indexOf('/search') !== -1) return;
    var header = qs('.header');
    if (!header) return;

    var wrap = ce('div', 'cs-m-search');
    wrap.innerHTML =
      '<a class="cs-m-search__bar" href="/search.html" aria-label="Ara">' +
        ICON.search.replace('<svg', '<svg class="cs-m-search__icon"') +
        '<span>Ürün, kategori veya marka ara</span>' +
        '<span class="cs-m-search__qr" aria-label="QR ile ara">' + ICON.qr + '</span>' +
      '</a>';
    header.after(wrap);
  }

  /* ── 2. Category shortcuts (only on home) ── */
  function injectCategories() {
    if (qs('.cs-m-categories')) return;
    var path = location.pathname;
    if (path !== '/' && path.indexOf('/index') === -1 && path !== '') return;

    var search = qs('.cs-m-search');
    if (!search) return;

    var wrap = ce('div', 'cs-m-categories');
    var track = ce('div', 'cs-m-categories__track');
    CATEGORIES.forEach(function (c) {
      var a = ce('a', 'cs-m-cat');
      a.href = c.href;
      a.innerHTML =
        '<div class="cs-m-cat__circle">' + ICON[c.icon] + '</div>' +
        '<div class="cs-m-cat__label">' + c.label + '</div>';
      track.appendChild(a);
    });
    wrap.appendChild(track);
    search.after(wrap);
  }

  /* ── 3. Trust bar (only on home, after hero) ── */
  function injectTrustBar() {
    if (qs('.cs-m-trustbar')) return;
    var path = location.pathname;
    if (path !== '/' && path.indexOf('/index') === -1 && path !== '') return;

    var hero = qs('.hero, .hero-premium, section.hero, .home-hero');
    if (!hero) return;

    var bar = ce('div', 'cs-m-trustbar');
    TRUST.forEach(function (t) {
      var item = ce('div', 'cs-m-trust');
      item.innerHTML =
        '<div class="cs-m-trust__icon">' + ICON[t.icon] + '</div>' +
        '<div class="cs-m-trust__label">' + t.label + '</div>';
      bar.appendChild(item);
    });
    hero.after(bar);
  }

  /* ── 4. Bottom navigation ── */
  function injectBottomNav() {
    if (qs('#csBottomNav')) return;

    var nav = ce('nav', 'cs-bottom-nav');
    nav.id = 'csBottomNav';
    nav.setAttribute('aria-label', 'Mobil gezinme');

    var path = location.pathname;
    var isHome = path === '/' || path.indexOf('/index') !== -1 || path === '';
    var isCat  = path.indexOf('/collections/') !== -1 || path.indexOf('/brands/') !== -1;
    var isFav  = path.indexOf('/profile') !== -1 && location.hash.indexOf('favorites') !== -1;
    var isExplore = path.indexOf('/routine') !== -1;

    nav.innerHTML =
      '<a class="cs-tab cs-tab-home ' + (isHome ? 'is-active' : '') + '" href="/index.html" aria-label="Ana Sayfa">' +
        ICON.home + '<span>Ana Sayfa</span>' +
      '</a>' +
      '<a class="cs-tab cs-tab-categories ' + (isCat ? 'is-active' : '') + '" href="/collections/cleanse.html" aria-label="Kategoriler">' +
        ICON.grid + '<span>Kategoriler</span>' +
      '</a>' +
      '<a class="cs-tab cs-tab-explore ' + (isExplore ? 'is-active' : '') + '" href="/collections/routine.html" aria-label="Keşfet">' +
        ICON.sparkle + '<span>Keşfet</span>' +
      '</a>' +
      '<a class="cs-tab cs-tab-favorites ' + (isFav ? 'is-active' : '') + '" href="/profile.html#favorites" aria-label="Favoriler">' +
        ICON.heart + '<span>Favorilerim</span>' +
      '</a>' +
      '<button class="cs-tab cs-tab-cart" id="csCartTabBtn" type="button" aria-label="Sepet">' +
        ICON.bag +
        '<span class="cs-cart-badge" id="csCartBadge"></span>' +
        '<span>Sepetim</span>' +
      '</button>';

    document.body.appendChild(nav);

    qs('#csCartTabBtn').addEventListener('click', function () {
      var cartBtn = qs('#cartBtn');
      if (cartBtn) { cartBtn.click(); return; }
      var drawer = qs('#cartDrawer');
      var bd = qs('#backdrop');
      if (drawer) {
        drawer.classList.add('open');
        if (bd) bd.classList.add('open');
      }
    });
  }

  /* ── 5. Cart badge ── */
  function updateCartBadge() {
    var badge = qs('#csCartBadge');
    if (!badge) return;
    try {
      var cart = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]');
      var total = cart.reduce(function (s, i) { return s + (i.qty || 1); }, 0);
      badge.textContent = total > 99 ? '99+' : (total > 0 ? String(total) : '');
      badge.classList.toggle('visible', total > 0);
    } catch (e) {}
  }
  window.addEventListener('cosmoskin:cart-updated', updateCartBadge);
  window.addEventListener('storage', function (e) { if (e.key === 'cosmoskin_cart') updateCartBadge(); });

  /* ── 6. Kill old mobile injections ── */
  function killOld() {
    [
      '.mobile-bottom-nav',
      '.mobile-header-search-btn',
      '.mobile-search-sheet',
      '.mobile-page-pillbar',
      '.mobile-luxe-hero__meta',
      '.mobile-editorial-rail',
      '.mobile-category-shortcuts',
      '.mobile-account-tabs',
      '.mobile-orders-banner',
      '.mobile-checkout-steps',
      '.mobile-sticky-checkout',
      '.mobile-card-accent'
    ].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (n) { n.remove(); });
    });
    document.documentElement.classList.remove('mobile-master-ready');
    document.body.classList.remove('mobile-master-ready', 'mobile-scroll-down');
    if (typeof MutationObserver !== 'undefined') {
      var obs = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType !== 1 || !n.classList) return;
            var kill = ['mobile-bottom-nav','mobile-header-search-btn','mobile-search-sheet',
                        'mobile-page-pillbar','mobile-luxe-hero__meta','mobile-editorial-rail',
                        'mobile-category-shortcuts','mobile-account-tabs','mobile-orders-banner',
                        'mobile-checkout-steps','mobile-sticky-checkout','mobile-card-accent'];
            for (var i = 0; i < kill.length; i++) {
              if (n.classList.contains(kill[i])) { n.remove(); return; }
            }
          });
        });
      });
      obs.observe(document.body, { childList: true, subtree: false });
    }
  }

  /* ── INIT ── */
  function init() {
    if (window.innerWidth > 768) return;
    killOld();
    injectSearchBar();
    injectCategories();
    injectTrustBar();
    injectBottomNav();
    updateCartBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Re-run after window load to catch late-injected enhancements */
  window.addEventListener('load', function () {
    if (window.innerWidth > 768) return;
    killOld();
    if (!qs('.cs-m-search')) injectSearchBar();
    if (!qs('.cs-m-categories')) injectCategories();
    if (!qs('.cs-m-trustbar')) injectTrustBar();
    if (!qs('#csBottomNav')) injectBottomNav();
    updateCartBadge();
  });

})();
