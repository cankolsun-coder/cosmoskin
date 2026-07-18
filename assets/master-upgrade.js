(function () {
  'use strict';

  var COUPON_KEY = 'cosmoskin_coupon_state_v1';
  var LEGACY_COUPON_KEY = 'cosmoskin_coupon_code';
  var CART_KEY = 'cosmoskin_cart';
  var brandLogoBase = '/assets/img/brands/';
  var brandOrder = ['COSRX','Anua','Beauty of Joseon','Round Lab','Torriden','SKIN1004','Some By Mi','By Wishtrend','Dr. Jart+','Goodal','I\'m From','Innisfree','Isntree','Laneige','Medicube','Mediheal','Thank You Farmer'];
  var categoryMap = {
    'Temizleyiciler': '/collections/cleanse.html',
    'Tonik & Essence': '/collections/hydrate.html',
    'Serum & Ampul': '/collections/treat.html',
    'Nemlendiriciler': '/collections/care.html',
    'Güneş Koruyucular': '/collections/protect.html',
    'Maskeler': '/collections/masks.html'
  };
  var goalMap = {
    'Nem': '/collections/hydration.html',
    'Bariyer': '/collections/barrier.html',
    'Işıltı': '/collections/glow.html',
    'Leke': '/collections/blemish.html',
    'Akne': '/collections/acne-balance.html',
    'Hassasiyet': '/collections/sensitivity.html',
    'Gözenek': '/collections/pore-sebum.html',
    'Güneş bakımı': '/collections/protect.html'
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function products() { return Array.isArray(window.COSMOSKIN_PRODUCTS) ? window.COSMOSKIN_PRODUCTS : []; }
  function fmt(value) {
    if (window.COSMOSKIN_FORMAT_PRICE) return window.COSMOSKIN_FORMAT_PRICE(value);
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0));
  }
  function priceHtml(p, options) {
    var PD = window.COSMOSKIN_PRICE_DISPLAY;
    if (PD && typeof PD.renderPriceHtml === 'function') return PD.renderPriceHtml(p, options);
    return '<span class="cs-price cs-price--compact"><span class="cs-price__current">' + esc(fmt(p.price)) + '</span></span>';
  }
  function slugify(value) {
    return String(value || '').toLowerCase()
      .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/&/g, 'and').replace(/\+/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function brandSlug(brand) { return slugify(brand).replace('skin-1004', 'skin1004').replace('dr-jart-', 'dr-jart').replace('i-m-from', 'im-from'); }
  function bySlug(slug) { slug = String(slug || ''); return products().find(function (p) { return p.slug === slug || p.id === slug; }) || null; }
  function cartItems() {
    if (window.COSMOSKIN_CART_API && typeof window.COSMOSKIN_CART_API.getItems === 'function') return window.COSMOSKIN_CART_API.getItems() || [];
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (_) { return []; }
  }
  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items || []));
    window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: items || [] } }));
    document.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: items || [] } }));
  }
  function addItem(slug, qty) {
    var p = bySlug(slug);
    if (!p) return false;
    var invState = stockState(slug);
    // Only hard-block confirmed out-of-stock. Unknown (no inventory API / still loading) stays buyable.
    if (invState.state === 'out') { toast('Bu ürün şu anda stokta yok.', 'error'); return false; }
    var item = { id: p.slug, slug: p.slug, name: p.name, brand: p.brand, price: Number(p.price || 0), image: p.image, url: p.url, qty: Number(qty || 1) || 1 };
    if (window.COSMOSKIN_CART_API && typeof window.COSMOSKIN_CART_API.addItems === 'function') {
      var added = Number(window.COSMOSKIN_CART_API.addItems([item], { openDrawer: false }) || 0);
      if (added > 0) {
        toast('Ürün sepetinize eklendi.', 'success');
        return true;
      }
      toast('Ürün sepete eklenemedi. Lütfen tekrar deneyin.', 'error');
      return false;
    }
    var items = cartItems();
    var found = items.find(function (entry) { return (entry.slug || entry.id) === p.slug; });
    if (found) found.qty = Number(found.qty || 1) + item.qty;
    else items.push(item);
    saveCart(items);
    toast('Ürün sepetinize eklendi.', 'success');
    return true;
  }
  function setQty(slug, qty) {
    var limit = stockQuantityLimit(slug);
    var nextQty = Math.max(1, Number(qty || 1));
    if (Number.isFinite(limit) && limit !== Infinity && nextQty > limit) {
      toast(limit <= 0 ? 'Bu ürün şu anda stokta yok.' : 'Bu miktar için yeterli stok bulunmuyor.', 'error');
      nextQty = Math.max(1, limit);
    }
    var items = cartItems().map(function (item) {
      if ((item.slug || item.id) === slug) return Object.assign({}, item, { qty: nextQty });
      return item;
    });
    saveCart(items);
  }
  function removeItem(slug) { saveCart(cartItems().filter(function (item) { return (item.slug || item.id) !== slug; })); }
  function stockState(slug) {
    try {
      var inv = window.COSMOSKIN_STOCK && window.COSMOSKIN_STOCK.getInventory && window.COSMOSKIN_STOCK.getInventory(slug);
      if (!inv) return { state: 'unknown', label: 'Stok bilgisi kontrol ediliyor' };
      if (inv._missing || inv.status === 'missing') return { state: 'unknown', label: 'Stok kaydı doğrulanamadı' };
      if (inv.status !== 'active') return { state: 'out', label: 'Stokta Yok' };
      if (!inv.allow_backorder && Number(inv.available_stock || 0) <= 0) return { state: 'out', label: 'Stokta Yok' };
      return { state: 'in', label: Number(inv.available_stock || 0) <= Number(inv.low_stock_threshold || 0) ? 'Son ürünler' : 'Stokta' };
    } catch (_) { return { state: 'unknown', label: 'Stok bilgisi kontrol ediliyor' }; }
  }
  function isOutOfStock(slug) { return stockState(slug).state === 'out'; }
  function stockQuantityLimit(slug) {
    if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.stockQuantityLimit === 'function') {
      return window.COSMOSKIN_STOCK.stockQuantityLimit(slug);
    }
    var inv = window.COSMOSKIN_STOCK && window.COSMOSKIN_STOCK.getInventory && window.COSMOSKIN_STOCK.getInventory(slug);
    if (!inv || inv.allow_backorder) return Infinity;
    return Math.max(0, Number(inv.available_stock || 0));
  }
  function cartBlockingItems() {
    var items = cartItems();
    if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.getCartBlockingItems === 'function') {
      return window.COSMOSKIN_STOCK.getCartBlockingItems(items);
    }
    return items.filter(function (item) {
      var slug = item.slug || item.id;
      return isOutOfStock(slug) || Number(item.qty || item.quantity || 1) > stockQuantityLimit(slug);
    });
  }
  function stockBadge(slug) {
    var state = stockState(slug);
    // Quiet luxury: only surface stock when it needs attention (out / low).
    if (state.state === 'unknown' || (state.state === 'in' && state.label === 'Stokta')) return '';
    return '<span class="cs-stock-badge ' + (state.state === 'out' ? 'is-out' : (state.state === 'unknown' ? 'is-unknown' : 'is-in')) + '" data-cm-stock-badge data-product-slug="' + esc(slug) + '">' + esc(state.label) + '</span>';
  }
  function toast(message, type) {
    var node = document.querySelector('.cs-toast');
    if (!node) { node = document.createElement('div'); node.className = 'cs-toast'; document.body.appendChild(node); }
    node.textContent = message;
    node.dataset.type = type || 'info';
    node.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { node.classList.remove('is-visible'); }, 2600);
  }

  function readCoupon() {
    if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.readState === 'function') {
      return window.COSMOSKIN_COUPON.readState();
    }
    try {
      var stored = JSON.parse(localStorage.getItem(COUPON_KEY) || 'null');
      if (stored && stored.ok) return stored;
    } catch (_) {}
    return null;
  }
  function saveCoupon(coupon) {
    if (!coupon) {
      if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.clearState === 'function') window.COSMOSKIN_COUPON.clearState();
      else { localStorage.removeItem(COUPON_KEY); localStorage.removeItem(LEGACY_COUPON_KEY); }
      return;
    }
    if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.persistState === 'function') {
      window.COSMOSKIN_COUPON.persistState(coupon, coupon.code);
      return;
    }
    localStorage.setItem(COUPON_KEY, JSON.stringify(coupon));
    localStorage.setItem(LEGACY_COUPON_KEY, coupon.code || '');
  }
  function couponDiscount(subtotal) {
    if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.previewDiscount === 'function') {
      return window.COSMOSKIN_COUPON.previewDiscount(readCoupon(), subtotal);
    }
    var coupon = readCoupon();
    if (!coupon || Number(subtotal || 0) < Number(coupon.minSubtotal || coupon.min_subtotal || 0)) return 0;
    return Math.max(0, Math.min(Number(subtotal || 0), Math.round(Number(coupon.discountAmount || coupon.discount_amount || 0))));
  }
  function totals() {
    var items = cartItems();
    if (window.COSMOSKIN_CART_COMMERCE && typeof window.COSMOSKIN_CART_COMMERCE.computeTotals === 'function') {
      var computed = window.COSMOSKIN_CART_COMMERCE.computeTotals({ items: items });
      return {
        items: computed.items.length ? computed.items : items,
        subtotal: computed.subtotal,
        discount: computed.couponDiscount,
        couponDiscount: computed.couponDiscount,
        shipping: computed.shipping,
        vat: Math.round(computed.vat),
        total: computed.total,
        freeShippingRemaining: computed.freeShippingRemaining,
        coupon: computed.coupon
      };
    }
    var subtotal = items.reduce(function (sum, item) { return sum + Number(item.price || 0) * Number(item.qty || item.quantity || 1); }, 0);
    var discount = couponDiscount(subtotal);
    var shipping = subtotal - discount >= 2500 || !subtotal ? 0 : 89;
    return { items: items, subtotal: subtotal, discount: discount, couponDiscount: discount, shipping: shipping, vat: Math.round((subtotal - discount) * 0.20 / 1.20), total: Math.max(0, subtotal - discount + shipping), freeShippingRemaining: Math.max(0, 2500 - (subtotal - discount)), coupon: readCoupon() };
  }
  async function validateCoupon(code, subtotal) {
    code = String(code || '').trim().toUpperCase();
    if (!code) { saveCoupon(null); return { ok: false, empty: true, message: 'Kupon kaldırıldı.' }; }
    if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.validate === 'function') {
      var result = await window.COSMOSKIN_COUPON.validate({ code: code, cartItems: cartItems() });
      if (!result.ok) { saveCoupon(null); return result; }
      return result;
    }
    try {
      var res = await fetch('/api/coupons/validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code, cart: cartItems() }) });
      var data = await res.json().catch(function () { return {}; });
      if (res.ok && data && data.ok) { saveCoupon(Object.assign({ code: code }, data)); return Object.assign({ code: code, ok: true }, data); }
      saveCoupon(null); return { ok: false, message: (data && (data.error || data.message)) || 'Kupon doğrulanamadı.' };
    } catch (_) {
      saveCoupon(null); return { ok: false, message: 'Kupon doğrulanamadı.' };
    }
  }

  function productCard(p, options) {
    options = options || {};
    if (!p) return '';
    var inventory = stockState(p.slug);
    var out = inventory.state === 'out';
    var unavailable = out;
    var btnLabel = unavailable ? inventory.label : (options.shortButton ? 'Ekle' : 'Sepete Ekle');
    return '<article class="cs-product-card' + (unavailable ? ' is-out-of-stock' : '') + '" data-product-id="' + esc(p.slug) + '">' +
      '<a class="cs-product-card__media" href="' + esc(p.url) + '"><img src="' + esc(p.image) + '" alt="' + esc(p.brand + ' ' + p.name) + '" loading="lazy"></a>' +
      '<div class="cs-product-card__info"><small>' + esc(p.brand) + '</small><a class="cs-cart-name" href="' + esc(p.url) + '">' + esc(p.name) + '</a>' + stockBadge(p.slug) + '</div>' +
      '<div class="cs-product-card__footer">' + priceHtml(p, { compact: true }) + '<button type="button" data-cs-add="' + esc(p.slug) + '"' + (unavailable ? ' disabled aria-disabled="true" class="is-stock-disabled"' : '') + '>' + btnLabel + '</button></div>' +
    '</article>';
  }

  function cartRecCard(p, index) {
    if (!p) return '';
    var out = stockState(p.slug).state === 'out';
    return '<article class="cs-rec-slide" data-product-id="' + esc(p.slug) + '" style="--cs-rec-i:' + (index || 0) + '" role="listitem">' +
      '<div class="cs-rec-slide__media-wrap">' +
        '<a class="cs-rec-slide__media" href="' + esc(p.url) + '"><img src="' + esc(p.image) + '" alt="' + esc(p.brand + ' ' + p.name) + '" loading="lazy" decoding="async"></a>' +
        '<button type="button" class="cs-rec-slide__cart" data-cs-add="' + esc(p.slug) + '" aria-label="' + (out ? 'Stokta yok' : 'Sepete ekle') + '"' + (out ? ' disabled aria-disabled="true"' : '') + '>' +
          (out
            ? '<span aria-hidden="true">×</span>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>') +
        '</button>' +
      '</div>' +
      '<div class="cs-rec-slide__body">' +
        '<span class="cs-rec-slide__brand">' + esc(p.brand) + '</span>' +
        '<a class="cs-rec-slide__title" href="' + esc(p.url) + '">' + esc(p.name) + '</a>' +
        '<b class="cs-rec-slide__price">' + esc(fmt(p.price)) + '</b>' +
      '</div>' +
    '</article>';
  }
  function bindCartRecsRail(root) {
    var track = (root || document).querySelector('#csCartApp [data-recs-track]');
    if (!track || track.dataset.bound === '1') return;
    track.dataset.bound = '1';
    var rail = track.closest('.cs-recs-rail');
    if (!rail) return;
    rail.querySelectorAll('[data-recs-dir]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = Number(btn.getAttribute('data-recs-dir')) || 1;
        var amount = Math.max(200, Math.floor(track.clientWidth * 0.72));
        track.scrollBy({ left: dir * amount, behavior: 'smooth' });
      });
    });
  }

  function mountLiveSearch() {
    var dedicatedDesktopSearch = Array.from(document.scripts || []).some(function (script) {
      return /\/js\/search\.js(?:$|[?#])/.test(script.getAttribute('src') || '');
    });
    var forms = Array.from(document.querySelectorAll('[data-cs-live-search], .site-search-form, form[role="search"], .cm-searchbar')).filter(function (form) {
      if (form.dataset.csSearchMounted) return false;
      if (dedicatedDesktopSearch && form.classList.contains('site-search-form')) return false;
      return form.querySelector('input[type="search"], input[name="q"], input[placeholder*="Ara"], input[placeholder*="ara"]');
    });
    forms.forEach(function (form) {
      form.dataset.csSearchMounted = 'true';
      var input = form.querySelector('input[type="search"], input[name="q"], input[placeholder*="Ara"], input[placeholder*="ara"]');
      if (!input) return;
      input.setAttribute('autocomplete', 'off');
      if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', 'Ürün, marka veya kategori ara');
      var results = form.querySelector('.cs-live-search') || document.createElement('div');
      results.className = 'cs-live-search';
      results.hidden = true;
      results.setAttribute('role', 'listbox');
      if (!results.parentNode) form.appendChild(results);
      function render() {
        var q = input.value.trim().toLowerCase();
        if (q.length < 2) { results.hidden = true; return; }
        var token = q.replace(/ı/g, 'i');
        var match = function (text) { return String(text || '').toLowerCase().replace(/ı/g, 'i').indexOf(token) !== -1; };
        var ps = products().filter(function (p) { return match([p.name, p.brand, p.category, (p.keywords || []).join(' ')].join(' ')); }).slice(0, 6);
        var brands = brandOrder.filter(function (b) { return match(b); }).slice(0, 5);
        var cats = Object.keys(categoryMap).filter(function (c) { return match(c); }).slice(0, 5);
        var goals = Object.keys(goalMap).filter(function (g) { return match(g); }).slice(0, 4);
        var html = '';
        if (ps.length) html += '<div class="cs-search-group"><span class="cs-search-group__title">Ürünler</span>' + ps.map(function (p) { return '<a class="cs-search-row" href="' + esc(p.url) + '"><img src="' + esc(p.image) + '" alt=""><span><strong>' + esc(p.name) + '</strong><span>' + esc(p.brand) + ' · ' + esc(p.category) + '</span></span><span class="cs-search-row__price">' + priceHtml(p, { compact: true, showBadge: false }) + '</span></a>'; }).join('') + '</div>';
        if (brands.length) html += '<div class="cs-search-group"><span class="cs-search-group__title">Markalar</span>' + brands.map(function (b) { return '<a class="cs-search-row" href="/brands/' + esc(brandSlug(b)) + '.html"><span></span><span><strong>' + esc(b) + '</strong><span>Marka sayfasını aç</span></span><b>›</b></a>'; }).join('') + '</div>';
        if (cats.length) html += '<div class="cs-search-group"><span class="cs-search-group__title">Kategoriler</span>' + cats.map(function (c) { return '<a class="cs-search-row" href="' + esc(categoryMap[c]) + '"><span></span><span><strong>' + esc(c) + '</strong><span>Kategori seçkisini gör</span></span><b>›</b></a>'; }).join('') + '</div>';
        if (goals.length) html += '<div class="cs-search-group"><span class="cs-search-group__title">Cilt İhtiyaçları</span>' + goals.map(function (g) { return '<a class="cs-search-row" href="' + esc(goalMap[g]) + '"><span></span><span><strong>' + esc(g) + '</strong><span>İlgili seçkiyi gör</span></span><b>›</b></a>'; }).join('') + '</div>';
        results.innerHTML = html || '<div class="cs-search-empty"><strong>Aramanızla eşleşen ürün bulunamadı.</strong><span>Ürün adı, marka veya kategori ile tekrar deneyebilirsiniz.</span><a href="/allproducts.html">Tüm ürünleri keşfet</a></div>';
        results.hidden = false;
      }
      input.addEventListener('input', render);
      input.addEventListener('focus', render);
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          var first = results.querySelector('a[href]');
          if (first) location.href = first.href;
          else if (input.value.trim()) location.href = '/search.html?q=' + encodeURIComponent(input.value.trim());
        }
      });
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var first = results.querySelector('a[href]');
        if (first) location.href = first.href;
        else if (input.value.trim()) location.href = '/search.html?q=' + encodeURIComponent(input.value.trim());
      });
      document.addEventListener('click', function (event) { if (!form.contains(event.target)) results.hidden = true; });
    });
  }

  function patchLinks() {
    document.querySelectorAll('.brand-ribbon__item[href*="/collections/"], .brand-strip a[href*="/collections/"]').forEach(function (a) {
      var label = a.getAttribute('aria-label') || a.textContent || a.href.split('/').pop().replace('.html', '');
      a.href = '/brands.html#brand-' + brandSlug(label);
    });
    document.querySelectorAll('.home-hero__shine-word,.shine-word').forEach(function (el) { el.setAttribute('data-hero-shimmer', ''); });
  }

  function mountBrandsPage() {
    var host = document.getElementById('csBrandsApp');
    if (!host) return;
    var grouped = new Map();
    products().forEach(function (p) { if (!grouped.has(p.brand)) grouped.set(p.brand, []); grouped.get(p.brand).push(p); });
    var brands = brandOrder.filter(function (name) { return grouped.has(name); }).concat(Array.from(grouped.keys()).filter(function (name) { return brandOrder.indexOf(name) === -1; }));
    host.innerHTML = '<main class="cs-page cs-brands-directory"><div class="cs-page__inner"><header class="cs-page__hero cs-brands-hero"><div><p class="cs-kicker">COSMOSKIN MARKALARI</p><h2>Kore bakımının seçkin isimleri.</h2><p>Formül yaklaşımı, marka mirası ve gerçek ürün seçkisiyle öne çıkan K-Beauty markalarını keşfet.</p><div class="cs-brands-meta" aria-label="Marka seçkisi bilgileri"><span>' + brands.length + ' seçilmiş marka</span><span>Orijinal ürün seçkisi</span></div></div><a class="cs-btn cs-btn--dark" href="/allproducts.html">Tüm ürünleri gör<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></header><div class="cs-brand-directory-head"><div><p class="cs-kicker">MARKA DİZİNİ</p><h2>Markanı seç.</h2></div><p>Her logo ilgili markanın COSMOSKIN seçkisine açılır.</p></div><nav class="cs-brand-grid" aria-label="COSMOSKIN marka dizini">' + brands.map(function (brand, index) {
      var slug = brandSlug(brand), logo = brandLogoBase + slug + '.svg';
      return '<a class="cs-brand-tile" href="/brands/' + esc(slug) + '.html" aria-label="' + esc(brand) + ' ürünlerini keşfet"><span class="cs-brand-tile__index" aria-hidden="true">' + String(index + 1).padStart(2, '0') + '</span><span class="cs-brand-tile__logo"><img src="' + esc(logo) + '" alt="' + esc(brand) + '" loading="lazy" decoding="async"></span><span class="cs-brand-tile__arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></a>';
    }).join('') + '</nav></div></main>';
  }

  function recommendations(items) {
    if (window.COSMOSKIN_CART_COMMERCE && typeof window.COSMOSKIN_CART_COMMERCE.recommendationCandidates === 'function') {
      // Soft-allow unknown inventory so local/static hosts still show a premium rail.
      return window.COSMOSKIN_CART_COMMERCE.recommendationCandidates(items, { excludeOutOfStock: false, limit: 8 });
    }
    var used = new Set(items.map(function (item) { return item.slug || item.id; }));
    var base = items.map(function (item) { return bySlug(item.slug || item.id); }).filter(Boolean);
    var cats = base.map(function (p) { return p.category; });
    var brands = base.map(function (p) { return p.brand; });
    return products().filter(function (p) { return !used.has(p.slug); }).sort(function (a, b) {
      var as = (brands.indexOf(a.brand) !== -1 ? 3 : 0) + (cats.indexOf(a.category) !== -1 ? 2 : 0);
      var bs = (brands.indexOf(b.brand) !== -1 ? 3 : 0) + (cats.indexOf(b.category) !== -1 ? 2 : 0);
      return bs - as || Number(b.price || 0) - Number(a.price || 0);
    }).slice(0, 8);
  }
  function cartEmptyIcon() {
    return '<span class="cs-cart-empty__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7.5 8.2V7a4.5 4.5 0 0 1 9 0v1.2"/><path d="M5.5 8.2h13l-1.1 11.3H6.6L5.5 8.2Z"/><path d="M9.2 11.4h5.6"/></svg></span>';
  }
  function cartTrustIcon(type) {
    var path = '<path d="M12 3.5 19 6v5.3c0 4.2-2.8 7.6-7 9.2-4.2-1.6-7-5-7-9.2V6l7-2.5Z"/><path d="m8.8 12 2 2 4.4-4.5"/>';
    if (type === 'payment') path = '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M3.5 9.5h17M7 14.5h3"/>';
    else if (type === 'shipping') path = '<path d="M3.5 6.5h10v10h-10zM13.5 9h3l3 3v4.5h-6z"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="16.8" cy="17.5" r="1.7"/>';
    return '<span class="cs-cart-trust__icon cs-cart-trust__icon--' + type + '" aria-hidden="true"><svg viewBox="0 0 24 24">' + path + '</svg></span>';
  }
  function cartTrustRow() {
    return '<ul class="cs-cart-trust" role="list">' +
      '<li class="cs-cart-trust__item" role="listitem">' + cartTrustIcon('original') + '<span>Orijinal K-Beauty seçkisi</span></li>' +
      '<li class="cs-cart-trust__item" role="listitem">' + cartTrustIcon('payment') + '<span>Güvenli ödeme altyapısı</span></li>' +
      '<li class="cs-cart-trust__item" role="listitem">' + cartTrustIcon('shipping') + '<span>2.500 TL üzeri ücretsiz kargo</span></li>' +
    '</ul>';
  }
  function readLastCheckoutOrder() {
    try {
      var raw = sessionStorage.getItem('cosmoskin_checkout_last_order_v1');
      if (raw == null) raw = localStorage.getItem('cosmoskin_checkout_last_order_v1');
      if (raw) {
        var order = JSON.parse(raw);
        if (order && (order.orderNumber || order.order_number || order.orderId || order.order_id)) return order;
      }
    } catch (_) {}
    try {
      var summary = JSON.parse(localStorage.getItem('cosmoskin_account_summary') || 'null');
      var orders = summary && (summary.orders || (summary.data && summary.data.orders));
      if (Array.isArray(orders) && orders[0]) {
        var latest = orders[0];
        return {
          orderId: latest.id || latest.order_id,
          order_id: latest.id || latest.order_id,
          orderNumber: latest.order_number || latest.orderNumber,
          order_number: latest.order_number || latest.orderNumber,
          paymentStatus: latest.payment_status,
          payment_status: latest.payment_status,
          orderStatus: latest.status,
          status: latest.status,
          paymentMethod: latest.payment_method,
          items: latest.order_items || latest.items || [],
          order_items: latest.order_items || latest.items || [],
          totals: { total: latest.total_amount || latest.total }
        };
      }
    } catch (_) {}
    return null;
  }
  function cartOrderStatusLabel(order) {
    var payment = String(order.paymentStatus || order.payment_status || '').toLowerCase();
    var status = String(order.orderStatus || order.status || '').toLowerCase();
    if (order.paymentMethod === 'bank_transfer' || payment === 'awaiting_transfer' || status === 'pending_bank_transfer') return 'Havale/EFT bekleniyor';
    if (['paid', 'confirmed', 'preparing', 'packed', 'shipped', 'delivered'].indexOf(status) >= 0) return 'Sipariş alındı';
    if (payment === 'paid') return 'Ödeme alındı';
    return 'Sipariş kaydı';
  }
  function cartLastOrderSection() {
    var order = readLastCheckoutOrder();
    if (!order) {
      return '<section class="cs-cart-last cs-cart-last--empty" aria-label="Son sipariş">' +
        '<header class="cs-cart-last__head"><span>01</span><div><h3>Son sipariş</h3><p>Geçmiş siparişler hesabında görünür</p></div></header>' +
        '<div class="cs-cart-last__empty-visual" aria-hidden="true">' +
          '<span class="cs-cart-last__empty-mark"><svg viewBox="0 0 24 24"><path d="M7.5 8.2V7a4.5 4.5 0 0 1 9 0v1.2"/><path d="M5.5 8.2h13l-1.1 11.3H6.6L5.5 8.2Z"/></svg></span>' +
          '<div class="cs-cart-last__empty-copy"><strong>Henüz sipariş kaydı yok</strong><p>Bu cihazda tamamlanmış bir checkout bulunamadı.</p></div>' +
        '</div>' +
        '<p class="cs-cart-last__lede">Siparişlerini hesap alanından görüntüleyebilir veya takip numarasıyla kontrol edebilirsin.</p>' +
        '<div class="cs-cart-last__actions">' +
          '<a class="cs-cart-last__btn cs-cart-last__btn--dark" href="/account/profile.html?tab=orders">Siparişlerim</a>' +
          '<a class="cs-cart-last__btn" href="/order-tracking.html">Sipariş takip</a>' +
        '</div>' +
      '</section>';
    }
    var items = Array.isArray(order.items) ? order.items : (Array.isArray(order.order_items) ? order.order_items : []);
    var first = items[0] || {};
    var product = bySlug(first.slug || first.product_slug || first.id) || first;
    var orderNo = order.orderNumber || order.order_number || order.orderId || order.order_id;
    var total = order.totals && (order.totals.total != null ? order.totals.total : order.totals.grand_total);
    if (total == null && items.length) {
      total = items.reduce(function (sum, item) {
        return sum + Number(item.line_total || item.lineTotal || ((item.price || 0) * (item.qty || item.quantity || 1)) || 0);
      }, 0);
    }
    var qty = items.reduce(function (sum, item) { return sum + Number(item.qty || item.quantity || 1); }, 0) || items.length || 1;
    var img = product.image || first.image || '/assets/logo-mark.png';
    var name = product.name || first.name || 'Sipariş ürünü';
    var brand = product.brand || first.brand || '';
    var detailHref = order.orderId || order.order_id
      ? '/account/order-detail.html?id=' + encodeURIComponent(order.orderId || order.order_id)
      : '/account/profile.html?tab=orders';
    return '<section class="cs-cart-last" aria-label="Son sipariş">' +
      '<header class="cs-cart-last__head"><span>01</span><div><h3>Son sipariş</h3><p>Bu oturumdaki checkout kaydı</p></div></header>' +
      '<article class="cs-cart-last__card">' +
        '<a class="cs-cart-last__media" href="' + esc(detailHref) + '"><img src="' + esc(img) + '" alt="' + esc(brand + ' ' + name) + '" loading="lazy" decoding="async"></a>' +
        '<div class="cs-cart-last__copy">' +
          '<em class="cs-cart-last__status">' + esc(cartOrderStatusLabel(order)) + '</em>' +
          '<strong>' + esc(orderNo) + '</strong>' +
          '<p>' + esc(brand ? brand + ' · ' + name : name) + '</p>' +
          '<small>' + qty + ' ürün' + (total != null ? ' · ' + esc(fmt(total)) : '') + '</small>' +
        '</div>' +
      '</article>' +
      '<div class="cs-cart-last__actions">' +
        '<a class="cs-cart-last__btn cs-cart-last__btn--dark" href="' + esc(detailHref) + '">Siparişi gör</a>' +
        '<a class="cs-cart-last__btn" href="/order-tracking.html">Takip et</a>' +
      '</div>' +
    '</section>';
  }
  function cartEmptyDiscover() {
    var picks = products().filter(function (p) { return !isOutOfStock(p.slug); }).slice(0, 4);
    if (!picks.length) return '';
    return '<section class="cs-cart-discover" aria-label="Keşfet">' +
      '<header class="cs-cart-discover__head"><span>02</span><div><h3>Keşfetmeye başla</h3><p>Seçilmiş K-Beauty ürünleri</p></div></header>' +
      '<div class="cs-cart-discover__rail">' + picks.map(function (p, i) {
        return '<a class="cs-cart-discover__card" href="' + esc(p.url || '/products/' + p.slug + '.html') + '" style="--cs-cart-i:' + i + '">' +
          '<span class="cs-cart-discover__media"><img src="' + esc(p.image || '/assets/logo-mark.png') + '" alt="' + esc((p.brand || '') + ' ' + (p.name || '')) + '" loading="lazy" decoding="async"></span>' +
          '<span class="cs-cart-discover__brand">' + esc(p.brand || '') + '</span>' +
          '<strong>' + esc(p.name || '') + '</strong>' +
          '<em>' + esc(fmt(p.price || 0)) + '</em>' +
        '</a>';
      }).join('') + '</div>' +
    '</section>';
  }
  function cartEmptyStudio() {
    return '<section class="cs-cart-studio" aria-label="Boş sepet">' +
      '<article class="cs-cart-studio__hero">' +
        '<div class="cs-cart-studio__hero-top">' +
          cartEmptyIcon() +
          '<span class="cs-cart-studio__badge">0 ürün</span>' +
        '</div>' +
        '<span class="cs-cart-studio__kicker">Sepet durumu</span>' +
        '<h2>Sepetin henüz boş</h2>' +
        '<p>Nem, bariyer veya ışıltı hedeflerine göre seçilmiş ürünlerle sepetini oluştur. Kupon ve teslimat özeti ürün ekledikten sonra burada görünür.</p>' +
        cartTrustRow() +
        '<div class="cs-cart-studio__links">' +
          '<a class="cs-cart-studio__chip" href="/collections/bestsellers.html">Çok Satanlar</a>' +
          '<a class="cs-cart-studio__chip" href="/account/routines/">Akıllı Rutin</a>' +
          '<a class="cs-cart-studio__chip" href="/categories.html">Kategoriler</a>' +
        '</div>' +
        '<a class="cs-btn cs-btn--dark cs-cart-empty__cta" href="/allproducts.html">Alışverişe Başla</a>' +
      '</article>' +
      cartLastOrderSection() +
      cartEmptyDiscover() +
    '</section>';
  }
  function cartShippingNote(subtotal) {
    if (Number(subtotal || 0) >= 2500) return '<p class="cs-cart-shipping-note is-free">2.500 TL üzeri siparişlerde kargo ücretsiz.</p>';
    var remaining = Math.max(0, 2500 - Number(subtotal || 0));
    var pct = Math.min(100, Math.round((Number(subtotal || 0) / 2500) * 100));
    return '<div class="cs-cart-shipping-progress" aria-label="Ücretsiz kargo ilerlemesi"><div class="cs-cart-shipping-progress__bar"><span style="width:' + pct + '%"></span></div><p class="cs-cart-shipping-progress__text">Ücretsiz kargoya <strong>' + esc(fmt(remaining)) + '</strong> kaldı</p></div>';
  }
  var cartPageRenderToken = 0;
  var cartInventoryRefreshTimer = 0;
  function renderCartPage(options) {
    options = options || {};
    var host = document.getElementById('csCartApp');
    if (!host) return;
    var renderToken = ++cartPageRenderToken;
    var t = totals();
    var items = t.items;
    var empty = !items.length;
    var itemCount = items.reduce(function (sum, item) { return sum + Number(item.qty || item.quantity || 1); }, 0);
    host.className = 'cs-page cs-cart-page' + (empty ? ' is-empty' : ' has-items');
    var blocked = cartBlockingItems();
    var checkoutCta = blocked.length
      ? '<div class="cs-cart-checkout"><p class="cs-cart-stock-warning" role="alert">Sepetinizde stokta olmayan ürünler var.</p><p class="cs-cart-stock-warning">Ödemeye geçmeden önce stokta olmayan ürünleri sepetten kaldırın.</p><button class="cs-btn cs-btn--dark cs-cart-checkout__btn" type="button" data-cs-checkout-blocked disabled aria-disabled="true">Güvenli Ödemeye Geç</button></div>'
      : '<div class="cs-cart-checkout"><a class="cs-btn cs-btn--dark cs-cart-checkout__btn" href="/checkout.html" data-cs-proceed-checkout>Ödemeye Geç</a><p class="cs-cart-checkout__trust">Güvenli ödeme · Orijinal ürün · 14 gün cayma</p></div>';
    var recProducts = empty ? [] : recommendations(items);
    var recsSection = recProducts.length
      ? '<section id="cs-cart-recs" class="cs-cart-recs cs-recs-rail" data-cs-cart-recs aria-label="Sepete uygun öneriler">' +
          '<header class="cs-recs-rail__head">' +
            '<div class="cs-recs-rail__copy">' +
              '<span class="cs-recs-rail__kicker">Tamamla</span>' +
              '<h2>Sepetine uygun</h2>' +
              '<p class="cs-recs-rail__lede">Sepetindeki ürünlerle uyumlu, rutini tamamlayan seçimler.</p>' +
            '</div>' +
            '<div class="cs-recs-rail__controls" aria-hidden="false">' +
              '<button type="button" class="cs-recs-rail__nav" data-recs-dir="-1" aria-label="Önceki ürünler">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6 9 12l6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
              '</button>' +
              '<button type="button" class="cs-recs-rail__nav" data-recs-dir="1" aria-label="Sonraki ürünler">' +
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
              '</button>' +
            '</div>' +
          '</header>' +
          '<div class="cs-recs-rail__track" data-recs-track role="list" tabindex="0">' +
            recProducts.map(function (p, i) { return cartRecCard(p, i); }).join('') +
          '</div>' +
          '<footer class="cs-recs-rail__foot">' +
            '<a class="cs-recs-rail__more" href="/allproducts.html">Tüm ürünleri keşfet' +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</a>' +
          '</footer>' +
        '</section>'
      : '';
    var heroContinue = empty ? '' : '<a class="cs-cart-hero__continue" href="/allproducts.html">Alışverişe devam</a>';
    var heroCount = empty ? '<span class="cs-cart-hero__count">Boş</span>' : '<span class="cs-cart-hero__count">' + itemCount + '</span>';
    var hero = empty
      ? '<header class="cs-page__hero cs-cart-hero cs-cart-hero--empty"><div class="cs-cart-hero__copy"><p class="cs-kicker">Sepet</p><div class="cs-cart-hero__title-row"><h2>Siparişin</h2>' + heroCount + '</div></div></header>'
      : '<header class="cs-page__hero cs-cart-hero"><div class="cs-cart-hero__copy"><p class="cs-kicker">Sepet</p><div class="cs-cart-hero__title-row"><h2>Siparişin</h2>' + heroCount + '</div></div>' + heroContinue + '</header>';
    var emptySection = cartEmptyStudio();
    var filledSection = '<div class="cs-cart-layout"><section class="cs-card cs-cart-items" aria-label="Sepet ürünleri">' + items.map(function (item, idx) {
      var slug = item.slug || item.id, p = bySlug(slug) || item, qty = Number(item.qty || item.quantity || 1), out = isOutOfStock(slug);
      var lineTotal = Number(p.price != null ? p.price : item.price || 0) * qty;
      return '<article class="cs-cart-row' + (out ? ' is-out-of-stock' : '') + '" data-cs-cart-row="' + esc(slug) + '" style="--cs-cart-i:' + idx + '">' +
        '<a class="cs-cart-row__media" href="' + esc(p.url || item.url || '/products/' + slug + '.html') + '"><img src="' + esc(p.image || item.image) + '" alt="' + esc((p.brand || item.brand || '') + ' ' + (p.name || item.name || '')) + '" loading="lazy"></a>' +
        '<div class="cs-cart-row__body">' +
          '<div class="cs-cart-row__top">' +
            '<div class="cs-cart-row__copy">' +
              '<span class="cs-cart-brand">' + esc(p.brand || item.brand || '') + '</span>' +
              '<a class="cs-cart-name" href="' + esc(p.url || item.url || '/products/' + slug + '.html') + '">' + esc(p.name || item.name) + '</a>' +
            '</div>' +
            '<strong class="cs-cart-row__price">' + esc(fmt(lineTotal)) + '</strong>' +
          '</div>' +
          '<div class="cs-cart-meta">' + stockBadge(slug) +
            '<div class="cs-stepper" aria-label="Adet"><button type="button" data-cs-qty="-1" data-slug="' + esc(slug) + '" aria-label="Adedi azalt">−</button><span>' + qty + '</span><button type="button" data-cs-qty="1" data-slug="' + esc(slug) + '" aria-label="Adedi artır">+</button></div>' +
            '<button class="cs-link-button" type="button" data-cs-remove="' + esc(slug) + '">Kaldır</button>' +
            (out ? '<span class="cs-stock-badge is-out">Stokta Yok</span>' : '') +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('') + '</section><aside class="cs-card cs-cart-summary" aria-label="Sipariş özeti"><header class="cs-cart-summary__head"><p class="cs-kicker">Özet</p><h2>Toplam</h2></header>' + cartShippingNote(t.subtotal) + '<div class="cs-coupon"><label for="csCouponInput">İndirim kodu</label><div class="cs-coupon__row"><input id="csCouponInput" value="' + esc(t.coupon ? t.coupon.code : '') + '" placeholder="Kodunu gir" autocomplete="off" autocapitalize="characters"><button class="cs-btn cs-btn--dark" type="button" data-cs-apply-coupon>Uygula</button></div><div class="cs-coupon-status" id="csCouponStatus">' + (t.coupon ? 'Aktif: ' + esc(t.coupon.code) + (t.discount ? ' · -' + esc(fmt(t.discount)) : '') + ' <button class="cs-link-button" type="button" data-cs-remove-coupon>Kaldır</button>' : '') + '</div></div><div class="cs-cart-totals"><div class="cs-summary-line"><span>Ara toplam</span><strong>' + esc(fmt(t.subtotal)) + '</strong></div>' + (t.discount ? '<div class="cs-summary-line is-discount"><span>İndirim</span><strong>-' + esc(fmt(t.discount)) + '</strong></div>' : '') + '<div class="cs-summary-line"><span>Kargo</span><strong>' + (t.shipping ? esc(fmt(t.shipping)) : 'Ücretsiz') + '</strong></div><div class="cs-summary-total"><span>Toplam</span><strong>' + esc(fmt(t.total)) + '</strong></div></div>' + checkoutCta + '</aside></div>' + recsSection;
    host.innerHTML = '<div class="cs-page__inner cs-cart-page__inner">' + hero + (empty ? emptySection : filledSection) + '</div>';
    bindCartRecsRail(host);
    if (!empty && !options.skipInventory && window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.loadInventory === 'function') {
      var stockSlugs = items.map(function (item) { return item.slug || item.id; }).concat(recProducts.map(function (p) { return p.slug; })).filter(Boolean);
      window.setTimeout(function () {
        if (renderToken !== cartPageRenderToken) return;
        window.COSMOSKIN_STOCK.loadInventory(stockSlugs, { root: host });
      }, 0);
    }
  }


  function routineGoalProducts(goal, period) {
    var goalText = {
      nem: ['nem','hyaluronic','hydration','water','moisture','watery'],
      bariyer: ['bariyer','ceramide','centella','panthenol','mucin','soothing'],
      isilti: ['ışıltı','glow','rice','niacinamide','vitamin c','propolis'],
      leke: ['leke','dark spot','vitamin c','arbutin','spf'],
      akne: ['akne','pimple','salicylic','aha','bha','pore'],
      hassasiyet: ['hassas','soothing','heartleaf','centella','low ph'],
      gozenek: ['gözenek','pore','bha','clay','pad'],
      spf: ['spf','güneş','sun']
    }[goal] || [];
    var stepOrder = period === 'night' ? ['Temizleyiciler','Tonik & Essence','Serum & Ampul','Nemlendiriciler','Maskeler'] : ['Temizleyiciler','Tonik & Essence','Serum & Ampul','Nemlendiriciler','Güneş Koruyucular'];
    var selected = [];
    stepOrder.forEach(function (cat) {
      var found = products().filter(function (p) {
        var text = [p.name,p.brand,p.category,(p.keywords||[]).join(' ')].join(' ').toLowerCase();
        var score = (p.category === cat ? 4 : 0) + goalText.reduce(function (sum, kw) { return sum + (text.indexOf(String(kw).toLowerCase()) !== -1 ? 1 : 0); }, 0);
        return score > 0 && !selected.some(function (x) { return x.slug === p.slug; });
      }).sort(function (a,b) {
        var at = [a.name,a.brand,a.category,(a.keywords||[]).join(' ')].join(' ').toLowerCase();
        var bt = [b.name,b.brand,b.category,(b.keywords||[]).join(' ')].join(' ').toLowerCase();
        var as = (a.category === cat ? 4 : 0) + goalText.reduce(function (sum, kw) { return sum + (at.indexOf(String(kw).toLowerCase()) !== -1 ? 1 : 0); }, 0);
        var bs = (b.category === cat ? 4 : 0) + goalText.reduce(function (sum, kw) { return sum + (bt.indexOf(String(kw).toLowerCase()) !== -1 ? 1 : 0); }, 0);
        return bs - as;
      })[0];
      if (found) selected.push(found);
    });
    return selected;
  }
  function mountRoutinePage() {
    var host = document.getElementById('csRoutineApp');
    if (!host) return;
    var query = new URLSearchParams(location.search);
    var selectedGoal = query.get('goal') || '';
    var period = query.get('period') || 'day';
    var goals = [
      ['nem','Nem','Dolgun, konforlu nem katmanları'],
      ['bariyer','Bariyer','Yatıştırıcı ve bariyer destekli akış'],
      ['isilti','Işıltı','Daha canlı ve aydınlık görünüm'],
      ['leke','Leke','Ton eşitsizliği görünümüne destek'],
      ['akne','Akne','Gözenek ve sebum dengesine odaklı'],
      ['hassasiyet','Hassasiyet','Nazik, düşük iritasyonlu öneriler'],
      ['gozenek','Gözenek','Arındırıcı ve dengeleyici adımlar'],
      ['spf','Güneş bakımı','Gündüz koruma akışını tamamla']
    ];
    function render() {
      var list = selectedGoal ? routineGoalProducts(selectedGoal, period) : [];
      host.className = 'cs-page';
      host.innerHTML = '<div class="cs-page__inner"><div class="cs-page__hero"><div><p class="cs-kicker">AKILLI RUTİN</p><h2>Cildin için sabah ve akşam akışı.</h2><p>Hedefini seçtiğinde gerçek COSMOSKIN ürün verisiyle adım adım rutin önerisi oluşturulur. Bu öneriler bakım rehberidir; tıbbi tanı yerine geçmez.</p></div><a class="cs-btn cs-btn--light" href="/categories.html">Kategorileri Keşfet</a></div><section class="cs-card cs-routine-builder"><p class="cs-kicker">1 · CİLT HEDEFİ</p><div class="cs-routine-goals">' + goals.map(function (g) { return '<button class="cs-routine-goal" type="button" data-cs-routine-goal="' + esc(g[0]) + '" aria-pressed="' + (selectedGoal === g[0] ? 'true' : 'false') + '"><strong>' + esc(g[1]) + '</strong><span>' + esc(g[2]) + '</span></button>'; }).join('') + '</div><div class="cs-routine-toolbar"><div><p class="cs-kicker">2 · ZAMAN</p><button class="cs-btn ' + (period === 'day' ? 'cs-btn--dark' : 'cs-btn--light') + '" type="button" data-cs-routine-period="day">Gündüz Rutini</button> <button class="cs-btn ' + (period === 'night' ? 'cs-btn--dark' : 'cs-btn--light') + '" type="button" data-cs-routine-period="night">Akşam Rutini</button></div>' + (list.length ? '<button class="cs-btn cs-btn--dark" type="button" data-cs-add-routine>Rutini Sepete Ekle</button>' : '') + '</div><div class="cs-routine-results">' + (list.length ? list.map(function (p, index) { return '<div class="cs-routine-step"><span>' + (index + 1) + '</span>' + productCard(p) + '<p>' + (period === 'day' && p.category === 'Güneş Koruyucular' ? 'Gündüz rutininin son ve kritik koruma adımıdır.' : p.category === 'Temizleyiciler' ? 'Cildi sonraki bakım adımlarına hazırlar.' : p.category === 'Serum & Ampul' ? 'Seçtiğin hedefe odaklanan aktif bakım adımıdır.' : 'Rutini konforlu ve dengeli şekilde tamamlar.') + '</p></div>'; }).join('') : '<div class="cs-empty"><strong>Cilt hedefini seç</strong><p>Sana uygun sabah ve akşam rutinini görmek için önce Nem, Bariyer, Işıltı veya diğer hedeflerden birini seç.</p></div>') + '</div></section></div>';
    }
    render();
    host.addEventListener('click', function (event) {
      var goal = event.target.closest('[data-cs-routine-goal]');
      if (goal) { selectedGoal = goal.getAttribute('data-cs-routine-goal'); render(); return; }
      var per = event.target.closest('[data-cs-routine-period]');
      if (per) { period = per.getAttribute('data-cs-routine-period'); render(); return; }
      if (event.target.closest('[data-cs-add-routine]')) {
        routineGoalProducts(selectedGoal, period).forEach(function (p) { addItem(p.slug, 1); });
        toast('Rutin ürünleri sepete eklendi.', 'success');
      }
    });
  }

  function enhanceCheckoutSummary() {
    var t = totals();
    var possibleSubtotal = document.querySelector('#checkoutSubtotal');
    var possibleShipping = document.querySelector('#checkoutShipping');
    var possibleTotal = document.querySelector('#checkoutTotal');
    if (possibleSubtotal) possibleSubtotal.textContent = fmt(t.subtotal);
    if (possibleShipping) possibleShipping.textContent = t.shipping ? fmt(t.shipping) : 'Ücretsiz';
    if (possibleTotal) possibleTotal.textContent = fmt(t.total);
    var summary = document.querySelector('.summary-card,.checkout-summary,.checkout-sidebar');
    if (summary && t.coupon && !document.getElementById('csCheckoutCouponLine')) {
      var line = document.createElement('div');
      line.id = 'csCheckoutCouponLine';
      line.className = 'cs-summary-line';
      line.innerHTML = '<span>Kupon indirimi <b>' + esc(t.coupon.code) + '</b></span><strong>-' + esc(fmt(t.discount)) + '</strong>';
      var totalLine = summary.querySelector('#checkoutTotal')?.closest('.summary-line,.checkout-summary-row') || summary.lastElementChild;
      if (totalLine) totalLine.insertAdjacentElement('beforebegin', line); else summary.appendChild(line);
    }
  }

  function bindGlobalActions() {
    document.addEventListener('click', function (event) {
      var add = event.target.closest('[data-cs-add]');
      if (add) { event.preventDefault(); addItem(add.getAttribute('data-cs-add'), 1); setTimeout(function(){ renderCartPage(); }, 80); return; }
      var qty = event.target.closest('[data-cs-qty]');
      if (qty) { var slug = qty.getAttribute('data-slug'); var item = cartItems().find(function (x) { return (x.slug || x.id) === slug; }); if (item) setQty(slug, Number(item.qty || item.quantity || 1) + Number(qty.getAttribute('data-cs-qty'))); renderCartPage(); return; }
      var rem = event.target.closest('[data-cs-remove]');
      if (rem) { removeItem(rem.getAttribute('data-cs-remove')); renderCartPage(); return; }
      if (event.target.closest('[data-cs-remove-coupon]')) { saveCoupon(null); toast('Kupon kaldırıldı.', 'info'); renderCartPage(); enhanceCheckoutSummary(); return; }
      if (event.target.closest('[data-cs-apply-coupon]')) {
        var input = document.getElementById('csCouponInput');
        var status = document.getElementById('csCouponStatus');
        if (status) { status.textContent = 'Kupon kontrol ediliyor…'; status.className = 'cs-coupon-status is-pending'; }
        validateCoupon(input && input.value, totals().subtotal).then(function (result) {
          if (status) {
            status.textContent = result.ok
              ? ('Kupon aktif: ' + (result.code || (input && input.value) || '') + (result.discountAmount || result.discount_amount ? '' : ''))
              : (result.message || 'Bu kupon şu anda geçerli değil.');
            status.className = 'cs-coupon-status ' + (result.ok ? 'is-success' : 'is-error');
          }
          toast(result.ok ? 'Kupon uygulandı.' : (result.message || 'Kupon doğrulanamadı.'), result.ok ? 'success' : 'error');
          renderCartPage();
          enhanceCheckoutSummary();
        });
        return;
      }
      var checkout = event.target.closest('[data-cs-proceed-checkout]');
      if (checkout) {
        event.preventDefault();
        var proceed = function () { window.location.href = '/checkout.html'; };
        if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.validateCartPurchasable === 'function') {
          window.COSMOSKIN_STOCK.validateCartPurchasable(cartItems()).then(function (result) {
            if (result && result.ok) proceed();
            else toast((result && result.message) || 'Sepetinizde stokta olmayan ürünler var.', 'error');
          });
          return;
        }
        if (cartBlockingItems().length) {
          toast('Sepetinizde stokta olmayan ürünler var.', 'error');
          return;
        }
        proceed();
      }
    });
    window.addEventListener('cosmoskin:cart-updated', function () { renderCartPage(); enhanceCheckoutSummary(); });
    window.addEventListener('cosmoskin:inventory-updated', function () {
      // Re-render once with skipInventory to refresh badges — never call loadInventory again here.
      window.clearTimeout(cartInventoryRefreshTimer);
      cartInventoryRefreshTimer = window.setTimeout(function () {
        renderCartPage({ skipInventory: true });
        mountBrandsPage();
      }, 80);
    });
  }

  function normalizePaymentLogos() {
    document.querySelectorAll('img[src$="unsupported-local-card.png"]').forEach(function (img) { img.src = '/assets/img/payments/iyzico-monochrome.svg'; });
  }

  function init() {
    patchLinks();
    mountLiveSearch();
    mountBrandsPage();
    mountRoutinePage();
    renderCartPage();
    enhanceCheckoutSummary();
    normalizePaymentLogos();
    bindGlobalActions();
    setTimeout(mountLiveSearch, 600);
    setTimeout(function () {
      if (!window.COSMOSKIN_STOCK || !window.COSMOSKIN_STOCK.loadInventory) return;
      // Cart page already loads cart + recommendation slugs; avoid a second full-catalog fetch.
      if (document.getElementById('csCartApp')) return;
      window.COSMOSKIN_STOCK.loadInventory(products().map(function (p) { return p.slug; }));
    }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
