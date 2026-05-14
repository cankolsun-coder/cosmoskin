/* ============================================================================
   COSMOSKIN — Mobile Premium Layer (JS)
   Scope: only attaches behavior on viewports ≤ 768px.
   Does NOT replace existing markup; augments the real site DOM:
     • Premium hamburger drawer (replaces .mobile-nav strip)
     • Mobile search overlay (replaces inline header search on mobile)
     • Sticky PDP add-to-cart bar
     • Checkout summary collapse handler
     • Filter sheet backdrop & body scroll lock
     • Cart drawer body scroll lock
   Desktop behavior is untouched.
   ============================================================================ */
(function () {
  'use strict';

  var BP = 768;
  var isMobile = function () {
    return window.matchMedia
      ? window.matchMedia('(max-width: ' + BP + 'px)').matches
      : window.innerWidth <= BP;
  };

  /* --- Tiny utils ---------------------------------------------------------- */
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, props, html) {
    var node = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === 'class') node.className = props[k];
      else if (k === 'dataset' && props[k]) Object.keys(props[k]).forEach(function (dk) { node.dataset[dk] = props[k][dk]; });
      else node.setAttribute(k, props[k]);
    });
    if (html != null) node.innerHTML = html;
    return node;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function formatPrice(v) {
    var n = Number(v || 0);
    if (!isFinite(n)) n = 0;
    if (typeof window.COSMOSKIN_FORMAT_PRICE === 'function') return window.COSMOSKIN_FORMAT_PRICE(n);
    try { return n.toLocaleString('tr-TR', { style:'currency', currency:'TRY', maximumFractionDigits:0 }); }
    catch (e) { return '₺' + n; }
  }
  var lockCount = 0;
  function lockBodyScroll() {
    lockCount++;
    if (lockCount === 1) document.body.classList.add('csm-no-scroll');
  }
  function unlockBodyScroll() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) document.body.classList.remove('csm-no-scroll');
  }

  /* --- SVG icons (lightweight; brand-safe) -------------------------------- */
  var ICON = {
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm8 2-3.6-3.6"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".8" fill="currentColor"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h2l2.2 10.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L21 8H7"/><circle cx="10" cy="19" r="1.4"/><circle cx="18" cy="19" r="1.4"/></svg>'
  };

  /* --- Available collection / category routes (limited to real pages) ----- */
  var DRAWER_NAV = {
    shop: [
      { label: 'Tüm Ürünler',   href: '/allproducts.html' },
      { label: 'Çok Satanlar',  href: '/index.html#bestsellers' },
      { label: 'Akıllı Rutin',  href: '/akilli-rutin.html' },
      { label: 'Keşfet',        href: '/explore.html' }
    ],
    categories: [
      { label: 'Temizleyiciler',     href: '/collections/cleanse.html' },
      { label: 'Tonik & Essence',    href: '/collections/hydrate.html' },
      { label: 'Serum & Ampul',      href: '/collections/treat.html' },
      { label: 'Nemlendiriciler',    href: '/collections/care.html' },
      { label: 'Güneş Koruyucular',  href: '/collections/protect.html' },
      { label: 'Maskeler',           href: '/collections/masks.html' },
      { label: 'Rutinler',           href: '/routine.html' }
    ],
    brands: [
      { label: 'Anua',              href: '/brands/anua.html' },
      { label: 'Beauty of Joseon',  href: '/brands/beauty-of-joseon.html' },
      { label: 'COSRX',             href: '/brands/cosrx.html' },
      { label: 'Round Lab',         href: '/brands/round-lab.html' },
      { label: 'SKIN1004',          href: '/brands/skin1004.html' },
      { label: 'Torriden',          href: '/brands/torriden.html' },
      { label: 'Some By Mi',        href: '/brands/some-by-mi.html' },
      { label: 'Tüm Markaları Gör', href: '/brands.html', emphasis: true }
    ],
    account: [
      { label: 'Hesabım',     href: '/account/profile.html?tab=overview' },
      { label: 'Siparişlerim', href: '/account/profile.html?tab=orders' },
      { label: 'Favorilerim', href: '/account/profile.html?tab=favorites' },
      { label: 'Adreslerim',  href: '/account/profile.html?tab=addresses' },
      { label: 'Destek',      href: '/contact.html' }
    ]
  };

  /* ========================================================================
     DRAWER (hamburger)
     ====================================================================== */
  function buildDrawer() {
    if ($('.csm-drawer')) return; // already in DOM

    var overlay = el('div', { class: 'csm-overlay', id: 'csmOverlay', 'aria-hidden': 'true' });

    var drawer = el('aside', {
      class: 'csm-drawer',
      id: 'csmDrawer',
      'data-side': 'left',
      'aria-hidden': 'true',
      'aria-label': 'Mobil ana menü',
      role: 'dialog'
    });

    function group(label, items, emphasizeFirst) {
      var html = '<div class="csm-drawer__group">';
      if (label) html += '<span class="csm-drawer__label">' + esc(label) + '</span>';
      items.forEach(function (it, idx) {
        var cls = 'csm-drawer__link' + (it.emphasis || (emphasizeFirst && idx === 0) ? ' is-emphasis' : '');
        html += '<a class="' + cls + '" href="' + esc(it.href) + '">' +
                '<span>' + esc(it.label) + '</span>' + ICON.chevron + '</a>';
      });
      html += '</div>';
      return html;
    }

    drawer.innerHTML =
      '<div class="csm-drawer__head">' +
        '<div>' +
          '<a class="csm-drawer__brand" href="/index.html">COSMOSKIN</a>' +
          '<span class="csm-drawer__sub">Seçilmiş Kore cilt bakımı.</span>' +
        '</div>' +
        '<button class="csm-drawer__close" type="button" aria-label="Menüyü kapat" data-csm-drawer-close>' + ICON.close + '</button>' +
      '</div>' +
      '<div class="csm-drawer__body">' +
        group('Alışveriş',  DRAWER_NAV.shop) +
        group('Kategoriler', DRAWER_NAV.categories) +
        group('Markalar',   DRAWER_NAV.brands) +
        group('Hesap',      DRAWER_NAV.account) +
        '<div class="csm-drawer__trust">' +
          '<span>Güvenli ödeme</span>' +
          '<span>Orijinal ürün</span>' +
          '<span>Hızlı teslimat</span>' +
          '<span>14 gün iade</span>' +
        '</div>' +
        '<div class="csm-drawer__social">' +
          '<a href="https://instagram.com/cosmoskin.tr" target="_blank" rel="noopener">' +
            ICON.instagram + '<span>Instagram</span>' +
          '</a>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    overlay.addEventListener('click', closeDrawer);
    drawer.addEventListener('click', function (e) {
      var closeBtn = e.target.closest('[data-csm-drawer-close]');
      if (closeBtn) { e.preventDefault(); closeDrawer(); return; }
      // Auto-close on link nav so back gesture works cleanly
      var a = e.target.closest('a[href]');
      if (a) closeDrawer();
    });
  }

  function openDrawer() {
    var d = $('#csmDrawer'); var o = $('#csmOverlay');
    if (!d || !o) return;
    d.classList.add('is-open');
    o.classList.add('is-open');
    d.setAttribute('aria-hidden', 'false');
    o.setAttribute('aria-hidden', 'false');
    lockBodyScroll();
  }
  function closeDrawer() {
    var d = $('#csmDrawer'); var o = $('#csmOverlay');
    if (!d || !o) return;
    d.classList.remove('is-open');
    o.classList.remove('is-open');
    d.setAttribute('aria-hidden', 'true');
    o.setAttribute('aria-hidden', 'true');
    unlockBodyScroll();
  }

  function wireHamburger() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('#mobileToggle, .mobile-toggle');
      if (!t) return;
      if (!isMobile()) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      buildDrawer();
      openDrawer();
    }, true);
  }

  /* ========================================================================
     SEARCH OVERLAY
     ====================================================================== */
  function buildSearchSheet() {
    if ($('.csm-search-sheet')) return;
    var sheet = el('div', {
      class: 'csm-search-sheet',
      id: 'csmSearch',
      'aria-hidden': 'true',
      role: 'dialog',
      'aria-label': 'Arama'
    });
    sheet.innerHTML =
      '<div class="csm-search-sheet__bar">' +
        '<label class="csm-search-sheet__field">' +
          ICON.search +
          '<input id="csmSearchInput" type="search" autocomplete="off" enterkeyhint="search" placeholder="Ürün, marka veya içerik ara" />' +
        '</label>' +
        '<button class="csm-search-sheet__cancel" type="button" data-csm-search-close>İptal</button>' +
      '</div>' +
      '<div class="csm-search-sheet__body" id="csmSearchBody">' +
        '<div class="csm-search-hint"><strong>En çok aranan</strong>' +
          'Snail mucin · Heartleaf · Niacinamide · SPF · Cica' +
        '</div>' +
      '</div>';
    document.body.appendChild(sheet);

    sheet.addEventListener('click', function (e) {
      if (e.target.closest('[data-csm-search-close]')) {
        e.preventDefault();
        closeSearch();
      }
    });

    var input = $('#csmSearchInput', sheet);
    var body = $('#csmSearchBody', sheet);
    var timer = null;
    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { renderSearchResults(q, body); }, 110);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSearch();
    });
  }

  function renderSearchResults(query, body) {
    if (!body) return;
    if (!query || query.length < 2) {
      body.innerHTML =
        '<div class="csm-search-hint"><strong>En çok aranan</strong>' +
        'Snail mucin · Heartleaf · Niacinamide · SPF · Cica</div>';
      return;
    }
    var products = window.COSMOSKIN_PRODUCTS || [];
    var q = query.toLocaleLowerCase('tr-TR');
    function matches(p) {
      var hay = [p.name, p.brand, p.category, (p.keywords || []).join(' '), p.slug]
        .join(' ')
        .toLocaleLowerCase('tr-TR');
      return hay.indexOf(q) !== -1;
    }
    var results = products.filter(matches).slice(0, 24);
    if (!results.length) {
      body.innerHTML = '<div class="csm-search-empty">Sonuç bulunamadı.<br><span style="font-size:12px;display:block;margin-top:8px;">Farklı bir anahtar kelime deneyin.</span></div>';
      return;
    }
    var inv = (window.COSMOSKIN_STOCK && window.COSMOSKIN_STOCK.getInventory)
      ? window.COSMOSKIN_STOCK.getInventory
      : function () { return null; };
    body.innerHTML = results.map(function (p) {
      var stock = inv(p.slug);
      var out = stock && stock.status === 'active' && !stock.allow_backorder && Number(stock.available_stock || 0) <= 0;
      var stockHtml = out
        ? '<span class="csm-search-result__stock">Stokta Yok</span>'
        : '<span class="csm-search-result__stock is-in">Stokta</span>';
      return '<a class="csm-search-result" href="' + esc(p.url || '#') + '">' +
        '<span class="csm-search-result__img"><img src="' + esc(p.image || '') + '" alt="' + esc(p.brand + ' ' + p.name) + '" loading="lazy"></span>' +
        '<span class="csm-search-result__body">' +
          '<span class="csm-search-result__brand">' + esc(p.brand || '') + '</span>' +
          '<span class="csm-search-result__name">' + esc(p.name || '') + '</span>' +
          '<span class="csm-search-result__meta">' +
            '<span class="csm-search-result__price">' + esc(formatPrice(p.price)) + '</span>' +
            stockHtml +
          '</span>' +
        '</span>' +
      '</a>';
    }).join('');
  }

  function openSearch() {
    buildSearchSheet();
    var s = $('#csmSearch');
    if (!s) return;
    s.classList.add('is-open');
    s.setAttribute('aria-hidden', 'false');
    lockBodyScroll();
    setTimeout(function () { var i = $('#csmSearchInput', s); if (i) i.focus(); }, 60);
  }
  function closeSearch() {
    var s = $('#csmSearch');
    if (!s) return;
    s.classList.remove('is-open');
    s.setAttribute('aria-hidden', 'true');
    unlockBodyScroll();
  }

  function wireMobileSearchAccess() {
    // Inject a mobile search icon in the header tools (between mobile-toggle and account)
    function inject() {
      if (!isMobile()) return;
      var tools = $('.header-tools');
      if (!tools) return;
      if ($('.csm-header-search', tools)) return;
      var btn = el('button', {
        type: 'button',
        class: 'tool-btn csm-header-search',
        'aria-label': 'Ara',
        'data-csm-search-open': '1'
      }, ICON.search);
      // Insert just before the first non-hamburger tool button (account)
      var accountBtn = $('#accountBtn', tools);
      if (accountBtn && accountBtn.parentNode === tools) {
        tools.insertBefore(btn, accountBtn);
      } else {
        tools.appendChild(btn);
      }
    }
    inject();
    // After DOM mutations from other scripts, re-inject if needed
    var mo = new MutationObserver(inject);
    mo.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-csm-search-open]');
      if (!t) return;
      if (!isMobile()) return;
      e.preventDefault();
      openSearch();
    });
  }

  /* ========================================================================
     STICKY PDP CTA
     ====================================================================== */
  function buildPdpStickyBar() {
    if (!isMobile()) return;
    var purchase = $('.pdp5-purchase-card');
    if (!purchase) return;
    if ($('.csm-pdp-stickybar')) return;
    var primaryBtn = purchase.querySelector('[data-add-cart]');
    if (!primaryBtn) return;

    var priceEl = purchase.querySelector('.pdp5-price');
    var priceText = priceEl ? priceEl.textContent : '';
    var vatEl = purchase.querySelector('.pdp5-vat');
    var vatText = vatEl ? vatEl.textContent : 'KDV dahil';

    var bar = el('div', { class: 'csm-pdp-stickybar', id: 'csmPdpStickyBar' });
    bar.innerHTML =
      '<div class="csm-pdp-stickybar__price">' +
        '<strong>' + esc(priceText) + '</strong>' +
        '<small>' + esc(vatText) + '</small>' +
      '</div>' +
      '<button type="button" class="csm-pdp-stickybar__cta" id="csmPdpStickyCta">' +
        ICON.bag + '<span>Sepete Ekle</span>' +
      '</button>';

    document.body.appendChild(bar);

    function copyAttributes(target, source) {
      ['data-add-cart','data-id','data-slug','data-name','data-brand','data-price','data-image','data-url'].forEach(function (a) {
        var v = source.getAttribute(a);
        if (v != null) target.setAttribute(a, v);
      });
    }
    var cta = $('#csmPdpStickyCta', bar);
    copyAttributes(cta, primaryBtn);

    function syncCta() {
      var p = $('.pdp5-purchase-card .pdp5-actions [data-add-cart]');
      if (!p) return;
      copyAttributes(cta, p);
      // Mirror disabled state and label
      if (p.disabled || p.classList.contains('is-stock-disabled')) {
        cta.disabled = true;
        cta.classList.add('is-disabled');
        cta.querySelector('span').textContent = 'Stokta Yok';
        bar.querySelector('.csm-pdp-stickybar__price small').textContent = 'Şu anda stokta yok';
      } else {
        cta.disabled = false;
        cta.classList.remove('is-disabled');
        cta.querySelector('span').textContent = 'Sepete Ekle';
        if (vatEl) bar.querySelector('.csm-pdp-stickybar__price small').textContent = vatEl.textContent;
      }
    }

    // Visible when user scrolls past the in-page CTA
    function onScroll() {
      var rect = primaryBtn.getBoundingClientRect();
      // Show when primary CTA is above viewport, or its bottom edge is near top
      var shouldShow = rect.bottom < 80;
      bar.classList.toggle('is-visible', shouldShow);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () {
      onScroll();
      syncCta();
    });
    window.addEventListener('cosmoskin:inventory-updated', syncCta);
    document.addEventListener('cosmoskin:cart-updated', syncCta);
    onScroll();
    syncCta();
  }

  /* ========================================================================
     CHECKOUT — auth gate sync + summary toggle + recompute body padding
     ====================================================================== */
  function wireCheckoutSummaryToggle() {
    var toggle = $('#checkoutSummaryToggle');
    if (!toggle) return;
    var summary = $('#checkoutPremiumSummary');
    if (!summary) return;
    var detail = summary.querySelector('.summary-card.summary-card--premium');
    if (!detail) return;
    // Default collapsed on mobile
    function apply() {
      if (isMobile()) {
        if (!toggle.dataset.csmInit) {
          toggle.dataset.csmInit = '1';
          var cards = summary.querySelectorAll('.summary-card.summary-card--premium');
          cards.forEach(function (c) { c.style.display = 'none'; });
        }
      } else {
        var cards2 = summary.querySelectorAll('.summary-card.summary-card--premium');
        cards2.forEach(function (c) { c.style.display = ''; });
      }
    }
    apply();
    window.addEventListener('resize', apply);

    toggle.addEventListener('click', function () {
      var cards = summary.querySelectorAll('.summary-card.summary-card--premium');
      var anyHidden = false;
      cards.forEach(function (c) { if (c.style.display === 'none') anyHidden = true; });
      cards.forEach(function (c) { c.style.display = anyHidden ? '' : 'none'; });
    });
  }

  /* Make sure the auth gate is hidden if body has user-is-authenticated.
     auth.js already does this; this is a defensive sync. */
  function syncCheckoutAuthGate() {
    var gate = $('#checkoutAuthGate');
    if (!gate) return;
    if (document.body.classList.contains('user-is-authenticated')) {
      gate.setAttribute('hidden', '');
      gate.style.display = 'none';
    }
  }

  /* ========================================================================
     FILTER SHEET — overlay backdrop for allproducts.js panel
     ====================================================================== */
  function wireFilterBackdrop() {
    var panel = $('#csApFilters');
    if (!panel) return;
    if ($('.csm-filter-backdrop')) return;
    var bd = el('div', { class: 'csm-filter-backdrop' });
    document.body.appendChild(bd);
    bd.addEventListener('click', function () {
      document.body.classList.remove('cs-ap-filter-open');
      var t = $('#csApFilterToggle');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  }

  /* ========================================================================
     CART DRAWER — body scroll lock when open (real site uses .open class)
     ====================================================================== */
  function wireSiteDrawerLock() {
    function checkDrawers() {
      var openDr = document.querySelector('aside.drawer.open');
      if (openDr) {
        if (!document.body.classList.contains('csm-no-scroll')) {
          document.body.classList.add('csm-no-scroll');
        }
      } else if (!document.querySelector('.csm-overlay.is-open, .csm-search-sheet.is-open')) {
        document.body.classList.remove('csm-no-scroll');
      }
    }
    var mo = new MutationObserver(checkDrawers);
    mo.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  }

  /* ========================================================================
     PDP — collapse "Birlikte Tercih Edilenler" duplicate if it exists
     The PDP currently shows "Yanında Önerilenler". Some pages also include
     a second related block; hide the second one on mobile to avoid duplication.
     ====================================================================== */
  function dedupePdpRelated() {
    if (!isMobile()) return;
    var relateds = $$('.pdp5-related');
    if (relateds.length > 1) {
      for (var i = 1; i < relateds.length; i++) {
        relateds[i].style.display = 'none';
      }
    }
    // Also: review section duplicates
    var reviewSections = $$('#reviewsSection, [data-reviews-section]');
    if (reviewSections.length > 1) {
      for (var j = 1; j < reviewSections.length; j++) {
        reviewSections[j].style.display = 'none';
      }
    }
  }

  /* ========================================================================
     INIT
     ====================================================================== */
  function init() {
    // Always build drawer/search lazily; hamburger handler triggers buildDrawer
    wireHamburger();
    wireMobileSearchAccess();
    wireFilterBackdrop();
    wireCheckoutSummaryToggle();
    wireSiteDrawerLock();

    // PDP-specific
    buildPdpStickyBar();
    dedupePdpRelated();

    // Auth gate sync after auth.js runs
    syncCheckoutAuthGate();
    document.addEventListener('cosmoskin:auth-state', syncCheckoutAuthGate);
    var authObserver = new MutationObserver(syncCheckoutAuthGate);
    authObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-eval on viewport change
  var resizeT = null;
  window.addEventListener('resize', function () {
    if (resizeT) clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (!isMobile()) {
        closeDrawer();
        closeSearch();
      } else {
        // Ensure search button is injected on first rotate-to-mobile
        var tools = $('.header-tools');
        if (tools && !$('.csm-header-search', tools)) wireMobileSearchAccess();
      }
    }, 120);
  });
})();
