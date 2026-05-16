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
    if (isOutOfStock(slug)) { toast('Bu ürün şu anda stokta yok.', 'error'); return false; }
    var item = { id: p.slug, slug: p.slug, name: p.name, brand: p.brand, price: Number(p.price || 0), image: p.image, url: p.url, qty: Number(qty || 1) || 1 };
    if (window.COSMOSKIN_CART_API && typeof window.COSMOSKIN_CART_API.addItems === 'function') {
      window.COSMOSKIN_CART_API.addItems([item], { openDrawer: true });
      toast('Ürün sepetinize eklendi.', 'success');
      return true;
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
    var items = cartItems().map(function (item) {
      if ((item.slug || item.id) === slug) return Object.assign({}, item, { qty: Math.max(1, Number(qty || 1)) });
      return item;
    });
    saveCart(items);
  }
  function removeItem(slug) { saveCart(cartItems().filter(function (item) { return (item.slug || item.id) !== slug; })); }
  function isOutOfStock(slug) {
    try {
      var inv = window.COSMOSKIN_STOCK && window.COSMOSKIN_STOCK.getInventory && window.COSMOSKIN_STOCK.getInventory(slug);
      return !!(inv && inv.status === 'active' && !inv.allow_backorder && Number(inv.available_stock || 0) <= 0);
    } catch (_) { return false; }
  }
  function stockBadge(slug) {
    var out = isOutOfStock(slug);
    return '<span class="cs-stock-badge ' + (out ? 'is-out' : 'is-in') + '" data-cm-stock-badge data-product-slug="' + esc(slug) + '">' + (out ? 'Stokta Yok' : 'Stokta') + '</span>';
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
    try {
      var stored = JSON.parse(localStorage.getItem(COUPON_KEY) || 'null');
      if (stored && stored.ok) return stored;
    } catch (_) {}
    var legacy = String(localStorage.getItem(LEGACY_COUPON_KEY) || '').trim().toUpperCase();
    if (legacy === 'COSMOSKIN10') return { ok: true, code: 'COSMOSKIN10', type: 'percent', value: 10, minSubtotal: 750, maxDiscount: 300, source: 'legacy' };
    return null;
  }
  function saveCoupon(coupon) {
    if (!coupon) { localStorage.removeItem(COUPON_KEY); localStorage.removeItem(LEGACY_COUPON_KEY); return; }
    localStorage.setItem(COUPON_KEY, JSON.stringify(coupon));
    localStorage.setItem(LEGACY_COUPON_KEY, coupon.code || '');
  }
  function couponDiscount(subtotal) {
    var coupon = readCoupon();
    if (!coupon || Number(subtotal || 0) < Number(coupon.minSubtotal || 0)) return 0;
    var discount = 0;
    if (coupon.discountAmount) discount = Number(coupon.discountAmount || 0);
    else if (coupon.type === 'percent' || coupon.discountType === 'percent') discount = subtotal * Number(coupon.value || coupon.discountValue || 0) / 100;
    else discount = Number(coupon.value || coupon.discountValue || 0);
    if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
    return Math.max(0, Math.min(subtotal, Math.round(discount)));
  }
  function totals() {
    var items = cartItems();
    var subtotal = items.reduce(function (sum, item) { return sum + Number(item.price || 0) * Number(item.qty || item.quantity || 1); }, 0);
    var discount = couponDiscount(subtotal);
    var shipping = subtotal - discount >= 1000 || !subtotal ? 0 : 69;
    return { items: items, subtotal: subtotal, discount: discount, shipping: shipping, total: Math.max(0, subtotal - discount + shipping), coupon: readCoupon() };
  }
  async function validateCoupon(code, subtotal) {
    code = String(code || '').trim().toUpperCase();
    if (!code) { saveCoupon(null); return { ok: false, empty: true, message: 'Kupon kaldırıldı.' }; }
    if (code === 'COSMOSKIN10') {
      var local = { ok: true, code: code, type: 'percent', value: 10, minSubtotal: 750, maxDiscount: 300, label: '%10 indirim' };
      saveCoupon(local); return local;
    }
    try {
      var res = await fetch('/api/coupons/validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code, cart: cartItems(), subtotal: subtotal || totals().subtotal }) });
      var data = await res.json().catch(function () { return {}; });
      if (res.ok && data && data.ok) { saveCoupon(Object.assign({ code: code }, data)); return Object.assign({ code: code }, data); }
      saveCoupon(null); return { ok: false, message: (data && (data.error || data.message)) || 'Kupon doğrulanamadı.' };
    } catch (_) {
      saveCoupon(null); return { ok: false, message: 'Kupon doğrulanamadı.' };
    }
  }

  function productCard(p, options) {
    options = options || {};
    if (!p) return '';
    var out = isOutOfStock(p.slug);
    return '<article class="cs-product-card' + (out ? ' is-out-of-stock' : '') + '" data-product-id="' + esc(p.slug) + '">' +
      '<a class="cs-product-card__media" href="' + esc(p.url) + '"><img src="' + esc(p.image) + '" alt="' + esc(p.brand + ' ' + p.name) + '" loading="lazy"></a>' +
      '<div class="cs-product-card__info"><small>' + esc(p.brand) + '</small><a class="cs-cart-name" href="' + esc(p.url) + '">' + esc(p.name) + '</a>' + stockBadge(p.slug) + '</div>' +
      '<div class="cs-product-card__footer"><span class="cs-price">' + esc(fmt(p.price)) + '</span><button type="button" data-cs-add="' + esc(p.slug) + '"' + (out ? ' disabled aria-disabled="true" class="is-stock-disabled"' : '') + '>' + (out ? 'Stokta Yok' : (options.shortButton ? 'Ekle' : 'Sepete Ekle')) + '</button></div>' +
    '</article>';
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
        if (ps.length) html += '<div class="cs-search-group"><span class="cs-search-group__title">Ürünler</span>' + ps.map(function (p) { return '<a class="cs-search-row" href="' + esc(p.url) + '"><img src="' + esc(p.image) + '" alt=""><span><strong>' + esc(p.name) + '</strong><span>' + esc(p.brand) + ' · ' + esc(p.category) + '</span></span><b>' + esc(fmt(p.price)) + '</b></a>'; }).join('') + '</div>';
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
    document.querySelectorAll('a[href*="/account/routines.html"]').forEach(function (a) { a.href = a.href.replace('/account/routines.html', '/account/routines.html'); });
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
    host.innerHTML = '<main class="cs-page"><div class="cs-page__inner"><div class="cs-page__hero"><div><p class="cs-kicker">COSMOSKIN MARKALARI</p><h1>Seçilmiş Kore cilt bakımı markaları.</h1><p>Her marka bölümü gerçek ürün verisi, doğru fiyat, doğru görsel ve stok durumuyla listelenir.</p></div><a class="cs-btn cs-btn--dark" href="/allproducts.html">Tüm Ürünler</a></div><nav class="cs-brand-nav" aria-label="Markalar">' + brands.map(function (brand) { return '<a href="#brand-' + esc(brandSlug(brand)) + '">' + esc(brand) + '</a>'; }).join('') + '</nav>' + brands.map(function (brand) {
      var slug = brandSlug(brand), list = (grouped.get(brand) || []).slice(0, 8), logo = brandLogoBase + slug + '.svg';
      return '<section class="cs-card cs-brand-section" id="brand-' + esc(slug) + '"><div class="cs-brand-head"><div><p class="cs-kicker">MARKA</p><h2>' + esc(brand) + '</h2></div><img src="' + esc(logo) + '" alt="' + esc(brand) + ' logo" loading="lazy"></div><div class="cs-brand-products">' + list.map(productCard).join('') + '</div></section>';
    }).join('') + '</div></main>';
  }

  function recommendations(items) {
    var used = new Set(items.map(function (item) { return item.slug || item.id; }));
    var base = items.map(function (item) { return bySlug(item.slug || item.id); }).filter(Boolean);
    var cats = base.map(function (p) { return p.category; });
    var brands = base.map(function (p) { return p.brand; });
    return products().filter(function (p) { return !used.has(p.slug) && !isOutOfStock(p.slug); }).sort(function (a, b) {
      var as = (brands.indexOf(a.brand) !== -1 ? 3 : 0) + (cats.indexOf(a.category) !== -1 ? 2 : 0);
      var bs = (brands.indexOf(b.brand) !== -1 ? 3 : 0) + (cats.indexOf(b.category) !== -1 ? 2 : 0);
      return bs - as || Number(b.price || 0) - Number(a.price || 0);
    }).slice(0, 4);
  }
  function renderCartPage() {
    var host = document.getElementById('csCartApp');
    if (!host) return;
    var t = totals();
    var items = t.items;
    var empty = !items.length;
    host.className = 'cs-page';
    host.innerHTML = '<div class="cs-page__inner"><div class="cs-page__hero"><div><p class="cs-kicker">SEPET</p><h1>Sepetin</h1><p>Ürünlerini, kuponunu ve teslimat özetini tek ekranda kontrol et.</p></div><a class="cs-btn cs-btn--light" href="/allproducts.html">Alışverişe Devam Et</a></div>' + (empty ? '<div class="cs-empty"><strong>Sepetin şu anda boş.</strong><p>Nem, bariyer veya ışıltı hedeflerine göre seçilmiş ürünleri keşfederek sepetini oluşturabilirsin.</p><a class="cs-btn cs-btn--dark" href="/allproducts.html">Alışverişe Başla</a></div>' : '<div class="cs-cart-layout"><section class="cs-card cs-cart-items" aria-label="Sepet ürünleri">' + items.map(function (item) {
      var slug = item.slug || item.id, p = bySlug(slug) || item, qty = Number(item.qty || item.quantity || 1), out = isOutOfStock(slug);
      return '<article class="cs-cart-row' + (out ? ' is-out-of-stock' : '') + '" data-cs-cart-row="' + esc(slug) + '"><a href="' + esc(p.url || item.url || '#') + '"><img src="' + esc(p.image || item.image) + '" alt="' + esc((p.brand || item.brand || '') + ' ' + (p.name || item.name || '')) + '"></a><div><a class="cs-cart-name" href="' + esc(p.url || item.url || '#') + '">' + esc(p.name || item.name) + '</a><span class="cs-cart-brand">' + esc(p.brand || item.brand || '') + '</span><div class="cs-cart-meta">' + stockBadge(slug) + '<div class="cs-stepper" aria-label="Adet"><button type="button" data-cs-qty="-1" data-slug="' + esc(slug) + '">−</button><span>' + qty + '</span><button type="button" data-cs-qty="1" data-slug="' + esc(slug) + '">+</button></div><button class="cs-link-button" type="button" data-cs-remove="' + esc(slug) + '">Kaldır</button></div></div><div class="cs-cart-row__total"><span class="cs-price">' + esc(fmt(Number(p.price || item.price || 0) * qty)) + '</span>' + (out ? '<span class="cs-stock-badge is-out">Stokta Yok</span>' : '') + '</div></article>';
    }).join('') + '</section><aside class="cs-card cs-cart-summary"><h2>Sipariş Özeti</h2><div class="cs-coupon"><label for="csCouponInput">Kupon Kodu</label><div class="cs-coupon__row"><input id="csCouponInput" value="' + esc(t.coupon ? t.coupon.code : '') + '" placeholder="COSMOSKIN10"><button class="cs-btn cs-btn--dark" type="button" data-cs-apply-coupon>Uygula</button></div><div class="cs-coupon-status" id="csCouponStatus">' + (t.coupon ? 'Kupon aktif: ' + esc(t.coupon.code) + (t.discount ? ' · -' + esc(fmt(t.discount)) : ' · minimum tutar bekleniyor') + ' <button class="cs-link-button" type="button" data-cs-remove-coupon>Kuponu kaldır</button>' : 'Geçerli kuponlarda indirim toplamdan düşülür.') + '</div></div><div class="cs-summary-line"><span>Ara toplam</span><strong>' + esc(fmt(t.subtotal)) + '</strong></div>' + (t.discount ? '<div class="cs-summary-line"><span>Kupon indirimi</span><strong>-' + esc(fmt(t.discount)) + '</strong></div>' : '') + '<div class="cs-summary-line"><span>Kargo</span><strong>' + (t.shipping ? esc(fmt(t.shipping)) : 'Ücretsiz') + '</strong></div><div class="cs-summary-total"><span>Toplam</span><strong>' + esc(fmt(t.total)) + '</strong></div><a class="cs-btn cs-btn--dark" style="width:100%;margin-top:18px" href="/checkout.html">Güvenli Ödemeye Geç</a><p class="cs-coupon-status">Visa, Mastercard, American Express ve Troy ile güvenli ödeme.</p></aside></div><section class="cs-card cs-cart-recs" style="margin-top:24px"><div class="cs-brand-head"><div><p class="cs-kicker">ÖNERİLER</p><h2>Sepete uygun öneriler</h2></div></div><div class="cs-recs-grid">' + recommendations(items).map(function (p) { return productCard(p, { shortButton: true }); }).join('') + '</div></section>') + '</div>';
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
      host.innerHTML = '<div class="cs-page__inner"><div class="cs-page__hero"><div><p class="cs-kicker">AKILLI RUTİN</p><h1>Cildin için sabah ve akşam akışı.</h1><p>Hedefini seçtiğinde gerçek COSMOSKIN ürün verisiyle adım adım rutin önerisi oluşturulur. Bu öneriler bakım rehberidir; tıbbi tanı yerine geçmez.</p></div><a class="cs-btn cs-btn--light" href="/categories.html">Kategorileri Keşfet</a></div><section class="cs-card cs-routine-builder"><p class="cs-kicker">1 · CİLT HEDEFİ</p><div class="cs-routine-goals">' + goals.map(function (g) { return '<button class="cs-routine-goal" type="button" data-cs-routine-goal="' + esc(g[0]) + '" aria-pressed="' + (selectedGoal === g[0] ? 'true' : 'false') + '"><strong>' + esc(g[1]) + '</strong><span>' + esc(g[2]) + '</span></button>'; }).join('') + '</div><div class="cs-routine-toolbar"><div><p class="cs-kicker">2 · ZAMAN</p><button class="cs-btn ' + (period === 'day' ? 'cs-btn--dark' : 'cs-btn--light') + '" type="button" data-cs-routine-period="day">Gündüz Rutini</button> <button class="cs-btn ' + (period === 'night' ? 'cs-btn--dark' : 'cs-btn--light') + '" type="button" data-cs-routine-period="night">Akşam Rutini</button></div>' + (list.length ? '<button class="cs-btn cs-btn--dark" type="button" data-cs-add-routine>Rutini Sepete Ekle</button>' : '') + '</div><div class="cs-routine-results">' + (list.length ? list.map(function (p, index) { return '<div class="cs-routine-step"><span>' + (index + 1) + '</span>' + productCard(p) + '<p>' + (period === 'day' && p.category === 'Güneş Koruyucular' ? 'Gündüz rutininin son ve kritik koruma adımıdır.' : p.category === 'Temizleyiciler' ? 'Cildi sonraki bakım adımlarına hazırlar.' : p.category === 'Serum & Ampul' ? 'Seçtiğin hedefe odaklanan aktif bakım adımıdır.' : 'Rutini konforlu ve dengeli şekilde tamamlar.') + '</p></div>'; }).join('') : '<div class="cs-empty"><strong>Cilt hedefini seç</strong><p>Sana uygun sabah ve akşam rutinini görmek için önce Nem, Bariyer, Işıltı veya diğer hedeflerden birini seç.</p></div>') + '</div></section></div>';
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
        validateCoupon(input && input.value, totals().subtotal).then(function (result) { toast(result.ok ? 'Kupon uygulandı.' : (result.message || 'Kupon doğrulanamadı.'), result.ok ? 'success' : 'error'); renderCartPage(); enhanceCheckoutSummary(); });
      }
    });
    window.addEventListener('cosmoskin:cart-updated', function () { renderCartPage(); enhanceCheckoutSummary(); });
    window.addEventListener('cosmoskin:inventory-updated', function () { renderCartPage(); mountBrandsPage(); });
  }

  function normalizePaymentLogos() {
    document.querySelectorAll('img[src$="troy.png"]').forEach(function (img) { img.src = '/assets/img/payments/troy.svg'; });
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
    setTimeout(function () { if (window.COSMOSKIN_STOCK && window.COSMOSKIN_STOCK.loadInventory) window.COSMOSKIN_STOCK.loadInventory(products().map(function (p) { return p.slug; })); }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
