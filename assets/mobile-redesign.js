(function () {
  'use strict';

  var BREAKPOINT = 768;
  var ROOT_ID = 'cm-mobile-redesign-root';
  var DRAWER_ID = 'cm-mobile-drawer-root';
  var SHEET_ID = 'cm-mobile-sheet-root';
  var STORAGE_CART = 'cosmoskin_cart';
  var STORAGE_FAVORITES = 'cosmoskin_favorites';
  var STORAGE_ROUTINE = 'cosmoskin_saved_routine';
  var FALLBACK_IMG = '/assets/img/products/anua/anua-heartleaf-77-soothing-toner-card.webp';
  var mounted = false;
  var delegatesBound = false;
  var resizeTimer = null;
  var guides = null;
  var currentPdpQty = 1;
  var listingState = { sort: 'featured', category: '', brand: '', query: '' };
  var routineState = { goals: ['Nem'], skin: 'Karma', period: 'day' };

  var CATEGORY_ROUTES = {
    cleanse: { title: 'Temizleyiciler', subtitle: 'Cildi kurutmadan arındıran günlük temizleme seçkisi.', href: '/collections/cleanse.html', category: 'Temizleyiciler' },
    hydrate: { title: 'Tonik & Essence', subtitle: 'Nem katmanını destekleyen hazırlık adımları.', href: '/collections/hydrate.html', category: 'Tonik & Essence' },
    treat: { title: 'Serum & Ampul', subtitle: 'Işıltı, leke ve hedef bakım odaklı yoğun formüller.', href: '/collections/treat.html', category: 'Serum & Ampul' },
    care: { title: 'Nemlendiriciler', subtitle: 'Bariyer, konfor ve yumuşaklık odağı.', href: '/collections/care.html', category: 'Nemlendiriciler' },
    protect: { title: 'Güneş Koruyucular', subtitle: 'Günlük şehir kullanımı için hafif SPF seçkisi.', href: '/collections/protect.html', category: 'Güneş Koruyucular' },
    masks: { title: 'Maskeler', subtitle: 'Haftalık destek ve hedef bakım editleri.', href: '/collections/masks.html', category: 'Maskeler' },
    blemish: { title: 'Akne & Denge', subtitle: 'Sebum, gözenek ve akne görünümü odağı.', href: '/collections/blemish.html', goal: 'blemish', keywords: ['akne', 'gözenek', 'sebum', 'bha', 'salisilik', 'pore'] },
    'acne-balance': { title: 'Akne & Denge', subtitle: 'Daha dengeli bir görünüm için seçili ürünler.', href: '/collections/acne-balance.html', goal: 'blemish', keywords: ['akne', 'gözenek', 'sebum', 'bha', 'salisilik', 'pore'] },
    barrier: { title: 'Bariyer Desteği', subtitle: 'Seramid, nem ve yatıştırma odağındaki bakım seçkisi.', href: '/collections/barrier.html', goal: 'barrier', keywords: ['bariyer', 'ceramide', 'seramid', 'centella', 'cica', 'yatıştırıcı', 'nem'] },
    glow: { title: 'Işıltı', subtitle: 'Daha aydınlık ve canlı görünüm için seçilmiş serum ve bakım ürünleri.', href: '/collections/glow.html', goal: 'glow', keywords: ['ışıltı', 'glow', 'vitamin c', 'niacinamide', 'niasinamid', 'arbutin', 'pirinç', 'leke', 'aydınlatıcı'] },
    sensitivity: { title: 'Hassasiyet', subtitle: 'Yatıştırıcı ve konfor odaklı hassas cilt seçkisi.', href: '/collections/sensitivity.html', goal: 'sensitive', keywords: ['hassas', 'yatıştırıcı', 'soothing', 'centella', 'heartleaf', 'cica', 'bariyer'] },
    'pore-sebum': { title: 'Gözenek & Sebum', subtitle: 'Arındırma, denge ve gözenek görünümü odağı.', href: '/collections/pore-sebum.html', goal: 'pore', keywords: ['gözenek', 'sebum', 'pore', 'bha', 'aha', 'kil', 'volcanic', 'akne'] }
  };

  var BRAND_LOGOS = ['anua', 'beauty-of-joseon', 'cosrx', 'round-lab', 'skin1004', 'torriden', 'thank-you-farmer', 'innisfree', 'medicube', 'dr-jart', 'isntree', 'mediheal', 'goodal', 'laneige', 'some-by-mi', 'by-wishtrend', 'im-from'];

  function isMobile() {
    return window.matchMedia ? window.matchMedia('(max-width: ' + BREAKPOINT + 'px)').matches : window.innerWidth <= BREAKPOINT;
  }

  function getPageType() {
    var p = window.location.pathname;
    if (p === '/' || /\/index\.html$/.test(p)) return 'home';
    if (/\/products\//.test(p)) return 'pdp';
    if (/\/checkout\.html$/.test(p)) return 'cart';
    if (/\/collections\/routine\.html$/.test(p)) return 'routine';
    if (/\/account\//.test(p)) return 'account';
    if (/\/(contact|iade-degisim|teslimat-kargo)\.html$/.test(p)) return 'support';
    if (/\/allproducts\.html$|\/search\.html$|\/collections\//.test(p) || /\/brands\//.test(p)) return 'listing';
    return null;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function slugify(value) {
    return String(value || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function extractSlug(value) {
    var raw = String(value || '').trim();
    var match = raw.match(/\/products\/([^.?#/]+)\.html/);
    if (match) return match[1];
    return raw.replace(/\.html(?:[?#].*)?$/, '').split('/').pop();
  }

  function formatPrice(value) {
    var amount = Number(value || 0);
    if (!Number.isFinite(amount)) amount = 0;
    if (window.COSMOSKIN_FORMAT_PRICE) return window.COSMOSKIN_FORMAT_PRICE(amount);
    return amount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
  }

  function normalizeProduct(raw) {
    if (!raw) return null;
    var slug = extractSlug(raw.slug || raw.id || raw.url || raw.sku || '');
    if (!slug) return null;
    var price = Number(raw.price || raw.num || 0);
    var keywords = Array.isArray(raw.keywords) ? raw.keywords.join(' ') : String(raw.keywords || raw.keywordText || '');
    return {
      id: slug,
      slug: slug,
      name: String(raw.name || raw.title || '').trim() || 'COSMOSKIN ürünü',
      brand: String(raw.brand || 'COSMOSKIN').trim(),
      brandSlug: raw.brandSlug || slugify(raw.brand),
      category: String(raw.category || '').trim(),
      categorySlug: raw.categorySlug || slugify(raw.category),
      concernSlugs: Array.isArray(raw.concernSlugs) ? raw.concernSlugs : [],
      price: Number.isFinite(price) ? price : 0,
      volume: String(raw.volume || '').trim(),
      image: String(raw.image || raw.img || raw.imageUrl || FALLBACK_IMG).trim() || FALLBACK_IMG,
      url: String(raw.url || ('/products/' + slug + '.html')).trim(),
      keywords: keywords,
      label: raw.label || ''
    };
  }

  function getProducts() {
    var src = Array.isArray(window.COSMOSKIN_PRODUCTS) ? window.COSMOSKIN_PRODUCTS : [];
    return src.map(normalizeProduct).filter(Boolean);
  }

  function getProductBySlug(slug) {
    slug = extractSlug(slug);
    if (window.COSMOSKIN_PRODUCT_HELPERS && window.COSMOSKIN_PRODUCT_HELPERS.getProductBySlug) {
      var hit = window.COSMOSKIN_PRODUCT_HELPERS.getProductBySlug(slug);
      if (hit) return normalizeProduct(hit);
    }
    return getProducts().find(function (p) { return p.slug === slug; }) || null;
  }

  function productFromLdJson() {
    var slug = extractSlug(window.location.pathname);
    var product = getProductBySlug(slug);
    Array.prototype.slice.call(document.querySelectorAll('script[type="application/ld+json"]')).some(function (script) {
      try {
        var parsed = JSON.parse(script.textContent || '{}');
        var nodes = parsed['@graph'] || [parsed];
        var node = nodes.find(function (item) { return item && item['@type'] === 'Product'; });
        if (!node) return false;
        var price = node.offers && (node.offers.price || node.offers.lowPrice);
        product = normalizeProduct({ slug: node.sku || slug, name: node.name, brand: node.brand && (node.brand.name || node.brand), price: price, image: node.image, url: window.location.pathname, category: product && product.category, volume: product && product.volume, keywords: product && product.keywords }) || product;
        return true;
      } catch (e) { return false; }
    });
    return product || normalizeProduct({ slug: slug, name: document.title.replace(/\s+\|\s+.*$/, ''), brand: 'COSMOSKIN', image: FALLBACK_IMG, url: window.location.pathname });
  }

  function getCurrentProduct() { return productFromLdJson(); }

  function getCart() {
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_CART) || '[]');
      if (Array.isArray(stored) && stored.length) return stored.map(normalizeCartItem).filter(Boolean);
      if (window.COSMOSKIN_CART_API && typeof window.COSMOSKIN_CART_API.getItems === 'function') {
        var apiItems = window.COSMOSKIN_CART_API.getItems();
        if (Array.isArray(apiItems)) return apiItems.map(normalizeCartItem).filter(Boolean);
      }
      return Array.isArray(stored) ? stored.map(normalizeCartItem).filter(Boolean) : [];
    } catch (e) { return []; }
  }

  function normalizeCartItem(raw) {
    if (!raw) return null;
    var slug = extractSlug(raw.slug || raw.id || raw.url || '');
    var product = getProductBySlug(slug);
    var qty = Math.max(1, Number(raw.qty || raw.quantity || 1));
    var price = Number(raw.price || (product && product.price) || 0);
    return {
      id: slug || (product && product.slug),
      slug: slug || (product && product.slug),
      name: raw.name || (product && product.name) || 'Ürün',
      brand: raw.brand || (product && product.brand) || 'COSMOSKIN',
      price: Number.isFinite(price) ? price : 0,
      image: raw.image || (product && product.image) || FALLBACK_IMG,
      url: raw.url || (product && product.url) || ('/products/' + slug + '.html'),
      qty: qty
    };
  }

  function setCart(items) {
    var normalized = (items || []).map(normalizeCartItem).filter(Boolean);
    localStorage.setItem(STORAGE_CART, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: normalized.slice() } }));
    document.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: normalized.slice() } }));
    updateBadges();
    if (getPageType() === 'cart') renderCartMobile();
  }

  function addItemsToCart(items, options) {
    options = options || {};
    var normalized = (items || []).map(normalizeCartItem).filter(Boolean);
    if (!normalized.length) return;
    if (window.COSMOSKIN_CART_API && typeof window.COSMOSKIN_CART_API.addItems === 'function') {
      window.COSMOSKIN_CART_API.addItems(normalized, { openDrawer: false });
      window.setTimeout(function () { updateBadges(); if (getPageType() === 'cart') renderCartMobile(); }, 80);
    } else {
      var cart = getCart();
      normalized.forEach(function (item) {
        var existing = cart.find(function (entry) { return entry.id === item.id || entry.slug === item.slug; });
        if (existing) existing.qty += item.qty;
        else cart.push(item);
      });
      setCart(cart);
    }
    if (options.toast !== false) toast(options.toast || 'Ürün sepetinize eklendi.');
  }

  function updateCartQuantity(slug, delta) {
    var cart = getCart().map(function (item) {
      if (item.slug === slug || item.id === slug) item.qty = Math.max(0, Number(item.qty || 1) + delta);
      return item;
    }).filter(function (item) { return item.qty > 0; });
    setCart(cart);
  }

  function removeCartItem(slug) {
    setCart(getCart().filter(function (item) { return item.slug !== slug && item.id !== slug; }));
    toast('Ürün sepetten çıkarıldı.');
  }

  function cartTotals() {
    var cart = getCart();
    var subtotal = cart.reduce(function (sum, item) { return sum + Number(item.price || 0) * Number(item.qty || 1); }, 0);
    var shipping = subtotal > 0 && subtotal < 2500 ? 79 : 0;
    var total = subtotal + shipping;
    return { count: cart.reduce(function (sum, item) { return sum + Number(item.qty || 1); }, 0), subtotal: subtotal, shipping: shipping, total: total };
  }

  function favoriteList() {
    try {
      var items = JSON.parse(localStorage.getItem(STORAGE_FAVORITES) || '[]');
      return Array.isArray(items) ? items : [];
    } catch (e) { return []; }
  }

  function syncFallbackFavoriteButtons(root) {
    var favs = favoriteList().map(function (item) { return item.id || item.slug; });
    Array.prototype.slice.call((root || document).querySelectorAll('.favorite-btn')).forEach(function (button) {
      var id = button.dataset.favoriteId || button.dataset.id;
      var active = favs.indexOf(id) !== -1 || button.classList.contains('active') || button.classList.contains('is-active');
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? 'Favorilerden çıkar' : 'Favorilere ekle');
    });
  }

  function fallbackToggleFavorite(button) {
    var item = { id: button.dataset.favoriteId || button.dataset.id, slug: button.dataset.slug || button.dataset.favoriteId, name: button.dataset.name, brand: button.dataset.brand, price: Number(button.dataset.price || 0), image: button.dataset.image, url: button.dataset.url };
    var favs = favoriteList();
    var exists = favs.some(function (entry) { return (entry.id || entry.slug) === item.id; });
    favs = exists ? favs.filter(function (entry) { return (entry.id || entry.slug) !== item.id; }) : [item].concat(favs);
    localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(favs));
    window.dispatchEvent(new CustomEvent('cosmoskin:favorites-updated', { detail: { favorites: favs } }));
    syncFallbackFavoriteButtons(document);
    toast(exists ? 'Favorilerden çıkarıldı.' : 'Favorilere eklendi.');
    if (getPageType() === 'account' && activeAccountTab() === 'favorites') remount();
  }

  function svg(name) {
    var set = {
      menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
      close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
      back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>',
      search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
      bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h10l1 12H6L7 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
      home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7v9H6v-6h12"/></svg>',
      grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h5v5H5V5Zm9 0h5v5h-5V5ZM5 14h5v5H5v-5Zm9 0h5v5h-5v-5Z"/></svg>',
      heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.5-8.5-9.1A4.6 4.6 0 0 1 11 6l1 1 1-1a4.6 4.6 0 0 1 7.5 4.9C19 15.5 12 20 12 20Z"/></svg>',
      user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0"/></svg>',
      leaf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c9 0 14-6 14-14C12 5 6 9 5 19Z"/><path d="M5 19c4-5 8-7 14-14"/></svg>',
      shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-3.5 7-10V5.7L12 3 5 5.7V11c0 6.5 7 10 7 10Z"/><path d="m8.8 12.2 2.1 2.1 4.6-5"/></svg>',
      truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v9H3V7Zm11 3h3.4l3.1 3.2V16H14v-6Z"/><path d="M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10.8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>',
      cube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>',
      drop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4s6 6.45 6 10.8a6 6 0 1 1-12 0C6 9.85 12 3.4 12 3.4Z"/></svg>',
      sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v5M12 16v5M4 12h5M15 12h5M7.8 7.8l2.2 2.2M14 14l2.2 2.2M16.2 7.8 14 10M10 14l-2.2 2.2"/></svg>',
      bottle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6v4l2 3v10H7V10l2-3V3Z"/><path d="M9 7h6M8 13h8"/></svg>',
      tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12V5h7l9 9-7 7-9-9Z"/><path d="M8 8h.01"/></svg>',
      filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M8 5v4M16 15v4"/></svg>',
      star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>',
      chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
      minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>',
      plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>',
      trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>',
      lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2"/><path d="M6 10h12v10H6V10Z"/><path d="M12 14v2"/></svg>',
      sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>',
      moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A7.8 7.8 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></svg>',
      mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4V6Z"/><path d="m4 7 8 6 8-6"/></svg>'
    };
    return set[name] || '';
  }

  function header(options) {
    options = options || {};
    var promo = options.promo === false ? '' : '<div class="cm-promo" aria-label="Kampanya duyuruları"><div class="cm-promo-track"><span>Türkiye geneli hızlı gönderim</span><span>%100 orijinal K-Beauty seçkisi</span><span>Güvenli ödeme</span><span>2.500 TL üzeri ücretsiz kargo</span><span>Türkiye geneli hızlı gönderim</span><span>%100 orijinal K-Beauty seçkisi</span></div></div>';
    var left = options.back ? '<button class="cm-icon-btn cm-header__left" type="button" data-cm-back aria-label="Geri dön">' + svg('back') + '</button>' : '<button class="cm-icon-btn cm-header__left" type="button" data-cm-menu aria-label="Menüyü aç" aria-expanded="false" aria-controls="cm-mobile-menu">' + svg('menu') + '</button>';
    return promo + '<header class="cm-header"><div class="cm-header__slot cm-header__slot--left">' + left + '</div><a href="/index.html" class="cm-wordmark" aria-label="COSMOSKIN anasayfa">COSMOSKIN</a><div class="cm-header__slot cm-header__right"><a class="cm-icon-btn" href="/search.html" aria-label="Ara">' + svg('search') + '</a><a class="cm-icon-btn" href="/checkout.html" aria-label="Sepetim">' + svg('bag') + '<span class="cm-badge" data-cm-cart-badge>0</span></a></div></header>';
  }

  function bottomNav(active) {
    var items = [['home', 'Ana Sayfa', '/index.html', 'home'], ['grid', 'Ürünler', '/allproducts.html', 'list'], ['heart', 'Favoriler', '/account/profile.html#favorites', 'fav'], ['bag', 'Sepet', '/checkout.html', 'cart'], ['user', 'Hesabım', '/account/profile.html', 'account']];
    return '<nav class="cm-bottom-nav" aria-label="Mobil alt navigasyon">' + items.map(function (i) {
      return '<a class="' + (active === i[3] ? 'is-active' : '') + '" href="' + i[2] + '">' + svg(i[0]) + '<span>' + i[1] + '</span>' + (i[3] === 'cart' ? '<span class="cm-badge" data-cm-cart-badge>0</span>' : '') + '</a>';
    }).join('') + '</nav>';
  }

  function productCard(product, options) {
    options = options || {};
    var label = product.label || (options.index === 0 ? 'Editör' : '');
    return '<article class="cm-product-card" data-product-id="' + escapeHtml(product.slug) + '">' +
      (label ? '<span class="cm-chip-label">' + escapeHtml(label) + '</span>' : '') +
      '<button class="cm-fav favorite-btn" type="button" aria-label="Favorilere ekle" aria-pressed="false" data-favorite-id="' + escapeHtml(product.slug) + '" data-id="' + escapeHtml(product.slug) + '" data-slug="' + escapeHtml(product.slug) + '" data-name="' + escapeHtml(product.name) + '" data-brand="' + escapeHtml(product.brand) + '" data-price="' + escapeHtml(product.price) + '" data-image="' + escapeHtml(product.image) + '" data-url="' + escapeHtml(product.url) + '">' + svg('heart') + '</button>' +
      '<a class="cm-product-card__media product-media" href="' + escapeHtml(product.url) + '"><img src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.brand + ' ' + product.name) + '" loading="lazy"></a>' +
      '<div class="cm-product-card__body"><small>' + escapeHtml(product.brand) + '</small><a class="cm-product-title" href="' + escapeHtml(product.url) + '"><h3>' + escapeHtml(product.name) + '</h3></a><b>' + formatPrice(product.price) + '</b><button class="cm-card-cart" type="button" data-cm-add-cart="' + escapeHtml(product.slug) + '" aria-label="' + escapeHtml(product.name) + ' sepete ekle">Ekle</button></div>' +
      '</article>';
  }

  function miniProduct(product) {
    return '<a class="cm-mini-product" href="' + escapeHtml(product.url) + '"><img src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.brand + ' ' + product.name) + '" loading="lazy"><small>' + escapeHtml(product.brand) + '</small><strong>' + escapeHtml(product.name) + '</strong><b>' + formatPrice(product.price) + '</b></a>';
  }

  function categoryCard(img, title, desc, href) {
    return '<a class="cm-category-card" href="' + href + '"><span class="cm-category-card__img"><img src="' + img + '" alt="' + escapeHtml(title) + '" loading="lazy"></span><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(desc) + '</span></a>';
  }

  function trustStrip() {
    return '<section class="cm-trust-strip" aria-label="Güven unsurları"><div class="cm-trust-item">' + svg('leaf') + '<strong>Orijinal<br>seçki</strong></div><div class="cm-trust-item">' + svg('shield') + '<strong>Güvenli<br>ödeme</strong></div><div class="cm-trust-item">' + svg('truck') + '<strong>Hızlı<br>teslimat</strong></div><div class="cm-trust-item">' + svg('cube') + '<strong>Kolay<br>iade</strong></div></section>';
  }

  function brandStrip() {
    var brands = BRAND_LOGOS.slice(0, 8);
    return '<div class="cm-brand-strip" aria-label="Sevdiğin markalar">' + brands.map(function (b) { return '<a href="' + brandHref(b) + '"><img src="/assets/img/brands/' + b + '.svg" alt="' + escapeHtml(brandNameFromSlug(b)) + '" loading="lazy"></a>'; }).join('') + '</div>';
  }

  function brandNameFromSlug(slug) {
    var map = { cosrx: 'COSRX', skin1004: 'SKIN1004', 'beauty-of-joseon': 'Beauty of Joseon', 'round-lab': 'Round Lab', 'thank-you-farmer': 'Thank You Farmer', 'dr-jart': 'Dr. Jart+', 'by-wishtrend': 'By Wishtrend', 'im-from': "I'm From", 'some-by-mi': 'Some By Mi' };
    return map[slug] || slug.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }

  function brandHref(slug) { return '/brands/' + slug + '.html'; }

  function routeListingMeta() {
    var path = window.location.pathname;
    if (/\/search\.html$/.test(path)) {
      var q = new URLSearchParams(window.location.search).get('q') || '';
      return { title: q ? 'Arama Sonuçları' : 'Arama', subtitle: q ? '“' + q + '” için eşleşen ürünler' : 'Ürün, marka veya içerik ara.', category: '', brand: '' };
    }
    if (/\/brands\//.test(path)) {
      var brandSlug = path.split('/').pop().replace('.html', '');
      return { title: brandNameFromSlug(brandSlug), subtitle: 'Seçili marka ürünleri', category: '', brand: brandNameFromSlug(brandSlug) };
    }
    var collection = path.match(/\/collections\/([^.?#/]+)\.html/);
    if (collection) return CATEGORY_ROUTES[collection[1]] || { title: 'Seçili Ürünler', subtitle: 'COSMOSKIN seçkisi.', category: '' };
    return { title: 'Tüm Ürünler', subtitle: 'Seçilmiş Kore cilt bakım ürünleri.', category: '', brand: '' };
  }

  function productMatchesGoal(product, meta) {
    var text = [product.name, product.brand, product.category, product.keywords].join(' ').toLocaleLowerCase('tr-TR');
    if (meta.goal === 'blemish' && product.concernSlugs.indexOf('blemish') !== -1) return true;
    return (meta.keywords || []).some(function (word) { return text.indexOf(String(word).toLocaleLowerCase('tr-TR')) !== -1; });
  }

  function filteredProducts() {
    var products = getProducts();
    var meta = routeListingMeta();
    var q = String(listingState.query || new URLSearchParams(window.location.search).get('q') || '').toLocaleLowerCase('tr-TR');
    if (meta.category) products = products.filter(function (p) { return p.category === meta.category || p.categorySlug === slugify(meta.category); });
    if (meta.goal) products = products.filter(function (p) { return productMatchesGoal(p, meta); });
    if (meta.brand) products = products.filter(function (p) { return p.brand === meta.brand || slugify(p.brand) === slugify(meta.brand); });
    if (listingState.category && !meta.category && !meta.goal) products = products.filter(function (p) { return p.category === listingState.category; });
    if (listingState.brand && !meta.brand) products = products.filter(function (p) { return p.brand === listingState.brand; });
    if (q) products = products.filter(function (p) { return [p.name, p.brand, p.category, p.keywords].join(' ').toLocaleLowerCase('tr-TR').indexOf(q) !== -1; });
    if (listingState.sort === 'price-asc') products.sort(function (a, b) { return a.price - b.price; });
    if (listingState.sort === 'price-desc') products.sort(function (a, b) { return b.price - a.price; });
    if (listingState.sort === 'brand') products.sort(function (a, b) { return a.brand.localeCompare(b.brand, 'tr'); });
    return products;
  }

  function currentRoutineProducts() {
    var goal = routineState.goals[0] || 'Nem';
    var cats = routineState.period === 'day' ? ['Temizleyiciler', 'Tonik & Essence', 'Serum & Ampul', 'Güneş Koruyucular'] : ['Temizleyiciler', 'Tonik & Essence', 'Serum & Ampul', 'Nemlendiriciler'];
    return cats.map(function (cat) { return routinePick(cat, goal); }).filter(Boolean);
  }

  function routinePick(category, goal) {
    var products = getProducts();
    var pool = products.filter(function (p) { return p.category === category; });
    var goalMap = {
      'Nem': ['nem', 'hyaluronic', 'hyalüronik', 'dive-in', 'water'],
      'Bariyer': ['bariyer', 'ceramide', 'seramid', 'cica', 'centella'],
      'Işıltı': ['ışıltı', 'glow', 'vitamin c', 'niacinamide', 'pirinç', 'leke'],
      'Akne & Denge': ['akne', 'bha', 'pore', 'salisilik', 'gözenek'],
      'Hassasiyet': ['hassas', 'soothing', 'heartleaf', 'centella', 'yatıştırıcı'],
      'Gözenek & Sebum': ['gözenek', 'sebum', 'pore', 'clay', 'bha']
    };
    var words = goalMap[goal] || [];
    var preferred = pool.find(function (p) { var text = [p.name, p.brand, p.keywords].join(' ').toLocaleLowerCase('tr-TR'); return words.some(function (w) { return text.indexOf(w.toLocaleLowerCase('tr-TR')) !== -1; }); });
    return preferred || pool[0] || products[0];
  }

  function routineBuilder(compact) {
    var items = currentRoutineProducts();
    var subtotal = items.reduce(function (s, p) { return s + p.price; }, 0);
    var setPrice = Math.round(subtotal * 0.94);
    var goals = ['Nem', 'Bariyer', 'Işıltı', 'Akne & Denge', 'Hassasiyet', 'Gözenek & Sebum'];
    var skins = ['Kuru', 'Karma', 'Yağlı', 'Hassas'];
    var score = Math.min(98, 86 + routineState.goals.length * 3 + (routineState.skin === 'Hassas' ? 1 : 0));
    return '<div class="cm-routine-builder ' + (compact ? 'cm-routine-builder--compact' : '') + '" id="routine-commerce"><section class="cm-step-block"><h2>1. Cilt hedefini seç</h2><small>Seçimlere göre ürün önerileri anında güncellenir.</small><div class="cm-select-grid">' + goals.map(function (g) { var selected = routineState.goals.indexOf(g) !== -1; return '<button class="cm-select-chip ' + (selected ? 'is-selected' : '') + '" type="button" data-cm-routine-goal="' + escapeHtml(g) + '" aria-pressed="' + selected + '">' + svg(g === 'Nem' ? 'drop' : g === 'Bariyer' ? 'shield' : 'sparkle') + '<span>' + escapeHtml(g) + '</span></button>'; }).join('') + '</div></section><section class="cm-step-block"><h2>2. Cilt tipini seç</h2><div class="cm-select-grid cm-select-grid--skin">' + skins.map(function (s) { var selected = routineState.skin === s; return '<button class="cm-select-chip ' + (selected ? 'is-selected' : '') + '" type="button" data-cm-routine-skin="' + escapeHtml(s) + '" aria-pressed="' + selected + '">' + escapeHtml(s) + '</button>'; }).join('') + '</div></section><section class="cm-step-block"><h2>3. Rutin zamanı</h2><div class="cm-toggle"><button class="' + (routineState.period === 'day' ? 'is-active' : '') + '" type="button" data-cm-routine-period="day" aria-pressed="' + (routineState.period === 'day') + '">' + svg('sun') + ' Gündüz</button><button class="' + (routineState.period === 'night' ? 'is-active' : '') + '" type="button" data-cm-routine-period="night" aria-pressed="' + (routineState.period === 'night') + '">' + svg('moon') + ' Akşam</button></div></section><section class="cm-routine-card"><div class="cm-routine-card__head"><div><strong>' + escapeHtml(routineState.goals.join(' + ')) + ' Rutini</strong><span>' + escapeHtml(routineState.skin) + ' cilt için seçildi.</span></div><div class="cm-match">%' + score + '</div></div><div class="cm-routine-products">' + items.map(function (p, idx) { return '<a class="cm-routine-step" href="' + escapeHtml(p.url) + '"><img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '"><b>' + ['Temizleyici', 'Tonik', 'Serum', routineState.period === 'day' ? 'SPF' : 'Nem'][idx] + '</b><span>' + escapeHtml(p.brand) + '</span></a>'; }).join('') + '</div><div class="cm-set-price"><div><small>Set avantaj fiyatı</small><s>' + formatPrice(subtotal) + '</s><b>' + formatPrice(setPrice) + '</b></div><span>Sepette ürün bazında uygulanır</span></div><button class="cm-btn cm-btn--primary cm-btn--wide" type="button" data-cm-add-routine>TÜM RUTİNİ SEPETE EKLE</button><div class="cm-secondary-actions"><button class="cm-btn" type="button" data-cm-save-routine>Rutini Kaydet</button><a class="cm-btn" href="/collections/routine.html#routine-commerce">Rutini Gör</a></div></section></div>';
  }

  function editSection() {
    return '<section class="cm-edit-section" aria-labelledby="cmEditTitle"><a class="cm-edit-card" href="/products/beauty-of-joseon-relief-sun-spf50.html"><img src="/assets/img/editorial/beauty-of-joseon-relief-sun-campaign-card.webp" alt="Beauty of Joseon Relief Sun editör seçimi" loading="lazy"><div class="cm-edit-copy"><span>COSMOSKIN Edit</span><h2 id="cmEditTitle">Günlük SPF, premium bakımın son imzası.</h2><p>Hafif doku, konforlu bitiş ve rutini bozmayan şehir kullanımı.</p><strong>Editör seçimini keşfet</strong></div></a></section>';
  }

  function footerSection() {
    return '<footer class="cm-footer"><div class="cm-footer-logo">COSMOSKIN</div><p>Seçilmiş Kore cilt bakım ürünleri. Gereksiz olanı çıkarır, etkili olanı bırakır.</p><form class="cm-newsletter" action="#" data-cm-newsletter><label><span>Haber bülteni</span><input type="email" placeholder="E-posta adresin" aria-label="E-posta adresi"></label><button type="submit">Kaydol</button></form><div class="cm-footer-grid"><a href="/contact.html">Destek</a><a href="/teslimat-kargo.html">Teslimat</a><a href="/iade-degisim.html">İade</a><a href="/allproducts.html">Tüm Ürünler</a></div><div class="cm-payment-row" aria-label="Ödeme yöntemleri"><img src="/assets/payment/visa.svg" alt="Visa"><img src="/assets/payment/mastercard.svg" alt="Mastercard"><img src="/assets/payment/amex.svg" alt="American Express"></div></footer>';
  }

  function homePage() {
    var products = getProducts();
    var best = products.filter(function (p) { return ['Anua', 'Beauty of Joseon', 'COSRX', 'SKIN1004', 'Torriden', 'Round Lab'].indexOf(p.brand) !== -1; }).slice(0, 8);
    if (best.length < 8) best = products.slice(0, 8);
    var findCat = function (cat) { return products.find(function (p) { return p.category === cat; }) || products[0] || { image: FALLBACK_IMG }; };
    return '<div class="cm-mobile-page cm-mobile-home">' + header({ promo: true }) +
      '<section class="cm-hero" aria-labelledby="cmHomeHeroTitle"><div class="cm-hero__copy"><h1 id="cmHomeHeroTitle"><span>Cildin.</span><span class="cm-gold-word">Işıltın.</span><span class="cm-script-word">Senin hikayen.</span></h1><p>Seçilmiş Kore cilt bakım ürünleriyle sade, etkili ve güvenli bir bakım deneyimi.</p><div class="cm-hero__actions"><a class="cm-btn cm-btn--primary" href="/allproducts.html">ALIŞVERİŞE BAŞLA</a><a class="cm-btn" href="/collections/routine.html">RUTİNİNİ KEŞFET</a></div></div></section>' + trustStrip() + brandStrip() +
      '<div class="cm-page-inner"><section><div class="cm-section-head"><h2>İhtiyacına göre daha hızlı seçim yap</h2><a href="/allproducts.html">Tümünü Gör</a></div><div class="cm-category-row">' +
      categoryCard(findCat('Temizleyiciler').image, 'Temizleyiciler', 'Cildi arındır', '/collections/cleanse.html') +
      categoryCard(findCat('Tonik & Essence').image, 'Tonik & Essence', 'Dengele & hazırla', '/collections/hydrate.html') +
      categoryCard(findCat('Serum & Ampul').image, 'Serum & Ampul', 'Hedef bakım', '/collections/treat.html') +
      categoryCard(findCat('Nemlendiriciler').image, 'Nemlendiriciler', 'Konfor katmanı', '/collections/care.html') +
      categoryCard(findCat('Güneş Koruyucular').image, 'Güneş Koruyucular', 'Günlük SPF', '/collections/protect.html') +
      categoryCard(findCat('Maskeler').image, 'Maskeler', 'Haftalık destek', '/collections/masks.html') +
      '</div></section><section id="bestsellers"><div class="cm-section-head"><h2>Çok Satanlar</h2><a href="/allproducts.html">Tümünü Gör</a></div><div class="cm-product-grid cm-product-grid--compact">' + best.map(productCard).join('') + '</div></section><section class="cm-home-routine"><div class="cm-section-head"><div><p class="cm-kicker">Akıllı Rutin Seçimi</p><h2>Cildine göre seç.</h2></div><a href="/collections/routine.html">Detaylı Gör</a></div>' + routineBuilder(true) + '</section>' + editSection() + '</div>' + footerSection() + bottomNav('home') + '</div>';
  }

  function listingPage() {
    var meta = routeListingMeta();
    var products = filteredProducts();
    var all = getProducts();
    var brands = Array.from(new Set(all.map(function (p) { return p.brand; }).filter(Boolean)));
    var qValue = escapeHtml(listingState.query || new URLSearchParams(window.location.search).get('q') || '');
    var chips = [['Tümü', '', '/allproducts.html'], ['Temizleyici', 'Temizleyiciler', '/collections/cleanse.html'], ['Tonik', 'Tonik & Essence', '/collections/hydrate.html'], ['Serum', 'Serum & Ampul', '/collections/treat.html'], ['Güneş', 'Güneş Koruyucular', '/collections/protect.html'], ['Nem', 'Nemlendiriciler', '/collections/care.html'], ['Maskeler', 'Maskeler', '/collections/masks.html']];
    return '<div class="cm-mobile-page cm-mobile-listing">' + header({ promo: false }) + '<div class="cm-page-inner"><section class="cm-listing-hero"><p class="cm-kicker">COSMOSKIN Seçkisi</p><h1>' + escapeHtml(meta.title) + '</h1><p>' + escapeHtml(meta.subtitle || 'Seçilmiş Kore cilt bakım ürünleri.') + '</p></section><div class="cm-stat-row"><span><b data-cm-product-count>' + products.length + '</b><small>ürün</small></span><span><b>' + brands.length + '</b><small>marka</small></span><span><b>2500 TL+</b><small>ücretsiz kargo</small></span></div><form class="cm-search-box" action="/search.html" role="search">' + svg('search') + '<input name="q" type="search" value="' + qValue + '" placeholder="Ürün, marka veya içerik ara..."><button class="cm-filter-btn" type="button" data-cm-open-filter aria-label="Filtreleri aç">' + svg('filter') + '</button></form><div class="cm-chip-row" aria-label="Hızlı kategoriler">' + chips.map(function (chip) { var active = (!meta.category && !chip[1] && !meta.brand && !meta.goal) || meta.category === chip[1]; return '<a class="cm-chip ' + (active ? 'is-active' : '') + '" href="' + chip[2] + '">' + chip[0] + '</a>'; }).join('') + '</div><div class="cm-listing-actions"><button class="cm-sort-btn" type="button" data-cm-open-sort>Sırala ' + svg('chevron') + '</button><button class="cm-sort-btn" type="button" data-cm-open-filter>' + svg('filter') + ' Filtrele</button></div><div class="cm-product-grid cm-product-grid--compact" data-cm-listing-grid>' + (products.length ? products.map(productCard).join('') : emptyState('Eşleşen ürün bulunamadı.', 'Filtreleri temizleyerek tekrar deneyebilirsin.')) + '</div></div>' + bottomNav('list') + '</div>';
  }

  function categoryFallbackGuide(product) {
    var map = {
      'Temizleyiciler': { benefits: ['Cildi nazikçe arındırır', 'Günlük bakım akışını hazırlar', 'Konforlu temiz his bırakır'], usage: 'Sabah veya akşam nemli cilde masaj yaparak uygulayın, ardından bol suyla durulayın.', ingredients: 'Ürün içeriği için ambalaj ve marka bilgisini kontrol edin.', suitability: 'Günlük temizlik adımı arayan ciltler için uygundur.' },
      'Tonik & Essence': { benefits: ['Nem katmanını destekler', 'Cildi sonraki adıma hazırlar', 'Daha dengeli bir his verir'], usage: 'Temizlikten sonra avuç içi veya pamukla uygulayın, emilene kadar bekleyin.', ingredients: 'Nem ve yatıştırma odağına göre seçilmiş aktifler içerir.', suitability: 'Nem, bariyer ve yatıştırma odağı olan ciltler için uygundur.' },
      'Serum & Ampul': { benefits: ['Hedef bakım sağlar', 'Cilt görünümünü destekler', 'Rutin etkisini güçlendirir'], usage: 'Tonik/essence sonrasında 2-3 damla uygulayın, ardından nemlendiriciyle tamamlayın.', ingredients: 'Ürün odağına göre niasinamid, propolis, hyaluronik asit veya vitamin türevleri içerebilir.', suitability: 'Belirli cilt hedefi olan kullanıcılar için uygundur.' },
      'Nemlendiriciler': { benefits: ['Bariyer hissini destekler', 'Cildi yumuşatır', 'Nem kaybını azaltmaya yardımcı olur'], usage: 'Serumdan sonra yüz ve boyun bölgesine nazikçe uygulayın.', ingredients: 'Nemlendirici ve bariyer destekleyici bileşenler içerir.', suitability: 'Günlük nem ve konfor ihtiyacı olan ciltler için uygundur.' },
      'Güneş Koruyucular': { benefits: ['Günlük SPF koruması sağlar', 'Hafif ve konforlu bitiş sunar', 'Bakım rutininin son adımıdır'], usage: 'Sabah rutininin son adımında yeterli miktarda uygulayın; gün içinde yenileyin.', ingredients: 'UV filtreleri ve bakım destekleyici yardımcı içerikler barındırır.', suitability: 'Gündüz rutini kullanan tüm ciltler için gereklidir.' },
      'Maskeler': { benefits: ['Haftalık destek bakım sağlar', 'Cilde ekstra konfor verir', 'Hedef rutini tamamlar'], usage: 'Haftada 1-3 kez, ürün talimatına uygun sürede kullanın.', ingredients: 'Maske tipine göre nem, arındırma veya yatıştırma odağı taşır.', suitability: 'Rutine destek adımı eklemek isteyenler için uygundur.' }
    };
    return map[product.category] || { benefits: ['COSMOSKIN seçkisinde yer alır', 'Günlük rutine uyum sağlar', 'Kore bakım yaklaşımını destekler'], usage: 'Ürün ambalajındaki kullanım talimatına göre uygulayın.', ingredients: 'Detaylı içerik için ürün ambalajını kontrol edin.', suitability: 'Cilt ihtiyacına göre seçilmelidir.' };
  }

  function productGuide(product) {
    var fallback = categoryFallbackGuide(product);
    var raw = guides && guides[product.slug];
    if (!raw) return fallback;
    return { benefits: Array.isArray(raw.benefits) ? raw.benefits : fallback.benefits, usage: raw.howToUse || raw.usage || fallback.usage, ingredients: Array.isArray(raw.ingredients) ? raw.ingredients.map(function (i) { return i.name || i; }).slice(0, 5).join(', ') : fallback.ingredients, suitability: Array.isArray(raw.idealSkinTypes) ? raw.idealSkinTypes.join(', ') : fallback.suitability, lead: raw.lead || '', editorNote: raw.editorNote || '' };
  }

  function accordion(icon, title, body) {
    return '<details class="cm-acc-row"><summary>' + svg(icon) + '<strong>' + escapeHtml(title) + '</strong>' + svg('chevron') + '</summary><p>' + escapeHtml(body) + '</p></details>';
  }

  function pdpPage() {
    var p = getCurrentProduct();
    var guide = productGuide(p);
    var products = getProducts();
    var recs = products.filter(function (x) { return x.slug !== p.slug && (x.category === p.category || x.brand === p.brand); }).slice(0, 4);
    if (recs.length < 4) recs = recs.concat(products.filter(function (x) { return x.slug !== p.slug && recs.indexOf(x) === -1; }).slice(0, 4 - recs.length));
    return '<div class="cm-mobile-page cm-mobile-pdp">' + header({ promo: false, back: true }) + '<section class="cm-pdp-hero" aria-label="Ürün görseli"><div class="cm-pdp-float"><button class="favorite-btn" type="button" aria-label="Favorilere ekle" aria-pressed="false" data-favorite-id="' + escapeHtml(p.slug) + '" data-id="' + escapeHtml(p.slug) + '" data-slug="' + escapeHtml(p.slug) + '" data-name="' + escapeHtml(p.name) + '" data-brand="' + escapeHtml(p.brand) + '" data-price="' + escapeHtml(p.price) + '" data-image="' + escapeHtml(p.image) + '" data-url="' + escapeHtml(p.url) + '">' + svg('heart') + '</button><button type="button" data-cm-share aria-label="Paylaş">' + svg('tag') + '</button></div><img class="cm-pdp-product" src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.brand + ' ' + p.name) + '"></section><section class="cm-pdp-info"><span class="cm-pdp-brand">' + escapeHtml(p.brand.toUpperCase()) + '</span><h1>' + escapeHtml(p.name) + '</h1><p>' + escapeHtml(guide.lead || (p.brand + ' ' + p.name + ' COSMOSKIN seçkisinde ' + (p.category || 'cilt bakım') + ' ürünü.')) + '</p><div class="cm-pdp-meta"><span class="cm-rating">Henüz değerlendirme yok</span><span>İlk yorumu sen yap</span></div><div class="cm-pdp-price-line"><b>' + formatPrice(p.price) + '</b><span>' + escapeHtml(p.volume || p.category || '') + '</span></div><div class="cm-qty-cta"><div class="cm-stepper" aria-label="Adet seçici"><button type="button" data-cm-pdp-dec aria-label="Adedi azalt">−</button><span data-cm-pdp-qty>' + currentPdpQty + '</span><button type="button" data-cm-pdp-inc aria-label="Adedi artır">+</button></div><button class="cm-btn cm-btn--primary" data-cm-add-cart="' + escapeHtml(p.slug) + '" data-cm-qty="pdp" type="button">SEPETE EKLE</button></div><div class="cm-delivery-note">' + svg('truck') + ' 2.500 TL ve üzeri alışverişlerde ücretsiz kargo.</div><div class="cm-accordion" aria-label="Ürün bilgileri">' + accordion('star', 'Öne Çıkan Faydalar', guide.benefits.join(', ')) + accordion('drop', 'Nasıl Kullanılır?', guide.usage) + accordion('shield', 'İçerik', guide.ingredients) + accordion('user', 'Kimler İçin Uygun?', guide.suitability) + '</div><div class="cm-section-head"><h2>Birlikte iyi gider</h2></div><div class="cm-reco-row">' + recs.map(miniProduct).join('') + '</div></section>' + bottomNav('list') + '</div>';
  }

  function routinePage() {
    return '<div class="cm-mobile-page cm-mobile-routine">' + header({ promo: false }) + '<section class="cm-routine-title"><div class="cm-routine-title__top"><span>AKILLI RUTİN SEÇİMİ</span><span>' + (routineState.period === 'day' ? 'Gündüz' : 'Akşam') + '</span></div><h1>Cildin için en doğru rutini birlikte oluşturalım.</h1><p>Hedeflerini seç, cilt tipini ekle. Önerilen ürünler gerçek COSMOSKIN ürün verisiyle güncellenir.</p></section>' + routineBuilder(false) + bottomNav('list') + '</div>';
  }

  function cartPage() {
    return '<div class="cm-mobile-page cm-mobile-cart">' + header({ promo: false, back: true }) + '<section class="cm-cart-title"><h1>Sepetim <span data-cm-cart-title-count></span></h1></section><div data-cm-cart-content>' + cartContentHtml() + '</div>' + bottomNav('cart') + '</div>';
  }

  function cartContentHtml() {
    var cart = getCart();
    var totals = cartTotals();
    if (!cart.length) return '<div class="cm-empty-state"><strong>Sepetin şu an boş.</strong><span>Seçtiğin ürünler burada görünecek.</span><a class="cm-btn cm-btn--primary" href="/allproducts.html">ALIŞVERİŞE BAŞLA</a></div>';
    return '<div class="cm-cart-list">' + cart.map(function (item) { return '<article class="cm-cart-row"><a class="cm-cart-row__img" href="' + escapeHtml(item.url) + '"><img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '"></a><div><h2>' + escapeHtml(item.name) + '</h2><small>' + escapeHtml(item.brand) + '</small><b>' + formatPrice(item.price * item.qty) + '</b><div class="cm-stepper"><button type="button" data-cm-cart-dec="' + escapeHtml(item.slug) + '" aria-label="Adedi azalt">−</button><span>' + item.qty + '</span><button type="button" data-cm-cart-inc="' + escapeHtml(item.slug) + '" aria-label="Adedi artır">+</button></div></div><button class="cm-trash" type="button" data-cm-cart-remove="' + escapeHtml(item.slug) + '" aria-label="Ürünü sepetten çıkar">' + svg('trash') + '</button></article>'; }).join('') + '</div><form class="cm-coupon" data-cm-coupon-form><label>' + svg('tag') + '<input name="coupon" autocomplete="off" placeholder="Kupon kodu"></label><button type="submit">Uygula</button><span class="cm-coupon-status" data-cm-coupon-status></span></form><section class="cm-summary" aria-label="Sipariş özeti"><h2>Sipariş Özeti</h2><div class="cm-summary-row"><span>Ara Toplam</span><b>' + formatPrice(totals.subtotal) + '</b></div><div class="cm-summary-row"><span>Teslimat</span><b>' + (totals.shipping ? formatPrice(totals.shipping) : 'Ücretsiz') + '</b></div><div class="cm-summary-row is-total"><span>Toplam</span><b>' + formatPrice(totals.total) + '</b></div><div class="cm-campaign-note">' + svg('truck') + (totals.subtotal >= 2500 ? ' Ücretsiz kargo avantajı uygulandı.' : ' Ücretsiz kargo için ' + formatPrice(2500 - totals.subtotal) + ' daha ekleyebilirsin.') + '</div><a class="cm-btn cm-btn--primary cm-btn--wide" href="/checkout.html#checkoutForm" style="margin-top:13px">Ödemeye Geç ' + svg('chevron') + '</a></section><section class="cm-cart-trust"><div>' + svg('lock') + 'SSL<br>Güvenli Ödeme</div><div>' + svg('shield') + 'Orijinal<br>Ürün Garantisi</div><div>' + svg('truck') + '1-3 İş Günü<br>Teslimat</div></section>';
  }

  function emptyState(title, body) {
    return '<div class="cm-empty-state"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(body) + '</span></div>';
  }

  function activeAccountTab() {
    var path = window.location.pathname;
    var hash = (window.location.hash || '').replace('#', '');
    if (/\/account\/orders\.html$/.test(path)) return 'orders';
    if (/\/account\/returns\.html$/.test(path)) return 'returns';
    if (hash === 'favorites') return 'favorites';
    if (hash === 'cart') return 'cart';
    if (hash === 'help') return 'help';
    if (hash === 'returns') return 'returns';
    return 'overview';
  }

  function accountPage() {
    var tab = activeAccountTab();
    var tabs = [['overview', 'Hesabım', '/account/profile.html'], ['orders', 'Siparişlerim', '/account/orders.html'], ['favorites', 'Favorilerim', '/account/profile.html#favorites'], ['cart', 'Sepetim', '/account/profile.html#cart'], ['help', 'Yardım ve Destek', '/account/profile.html#help'], ['returns', 'İade ve Teslimat', '/account/profile.html#returns']];
    return '<div class="cm-mobile-page cm-mobile-account">' + header({ promo: false }) + '<section class="cm-account-hero"><div><p class="cm-kicker">COSMOSKIN hesabı</p><h1>Alışverişini tek yerden yönet.</h1><p>Siparişler, favoriler, sepet ve destek akışları kompakt bir mobil panelde.</p></div><span class="cm-account-mark">CS</span></section><nav class="cm-account-tabs" aria-label="Hesap bölümleri">' + tabs.map(function (t) { return '<a class="' + (tab === t[0] ? 'is-active' : '') + '" href="' + t[2] + '">' + escapeHtml(t[1]) + '</a>'; }).join('') + '</nav><div class="cm-account-content">' + accountContent(tab) + '</div><button class="cm-logout" type="button" data-cm-logout>Çıkış Yap</button>' + bottomNav(tab === 'favorites' ? 'fav' : 'account') + '</div>';
  }

  function accountContent(tab) {
    if (tab === 'orders') return '<section class="cm-account-card"><h2>Siparişlerim</h2><p>Aktif sipariş bulunmuyor. Sipariş verdiğinde durum kartları burada listelenir.</p><a class="cm-btn cm-btn--primary" href="/allproducts.html">Alışverişe başla</a></section><section class="cm-account-card cm-info-list"><h3>Sipariş akışı</h3><p>Hazırlanıyor, kargoda ve teslim edildi durumları tek kartta takip edilir.</p></section>';
    if (tab === 'favorites') {
      var favs = favoriteList().map(function (f) { return normalizeProduct(f) || getProductBySlug(f.slug || f.id); }).filter(Boolean);
      return '<section class="cm-account-card"><h2>Favorilerim</h2><p>Beğendiğin ürünleri hızlıca sepete ekleyebilirsin.</p></section>' + (favs.length ? '<div class="cm-product-grid cm-product-grid--compact">' + favs.map(productCard).join('') + '</div>' : emptyState('Henüz favori ürün yok.', 'Ürün kartlarındaki kalp ikonuyla favorilerine ekleyebilirsin.'));
    }
    if (tab === 'cart') return cartContentHtml();
    if (tab === 'help') return '<section class="cm-account-card"><h2>Yardım ve Destek</h2><p>Sipariş, ürün seçimi veya teslimat soruların için destek ekibimize ulaş.</p><a class="cm-support-link" href="mailto:destek@cosmoskin.com.tr">' + svg('mail') + '<span>destek@cosmoskin.com.tr</span></a><a class="cm-support-link" href="/contact.html">' + svg('shield') + '<span>Destek sayfasını aç</span></a></section>';
    if (tab === 'returns') return '<section class="cm-account-card"><h2>İade ve Teslimat</h2><p>Kullanılmamış ve yeniden satılabilir ürünlerde 14 gün içinde iade talebi oluşturabilirsin.</p><div class="cm-info-list"><p><b>Teslimat:</b> Siparişler hazırlık sonrası kargoya verilir.</p><p><b>İade:</b> Ürün ve ambalaj bütünlüğü korunmalıdır.</p><p><b>Destek:</b> Talep durumunu hesabından takip edebilirsin.</p></div><a class="cm-btn" href="/iade-degisim.html">Detayları Gör</a></section>';
    return '<section class="cm-account-card"><h2>Hesabım</h2><div class="cm-profile-grid"><div><small>Üyelik</small><strong>Essential</strong></div><div><small>Favoriler</small><strong>' + favoriteList().length + '</strong></div><div><small>Sepet</small><strong>' + cartTotals().count + '</strong></div></div></section><section class="cm-account-card"><h3>Kişisel bilgiler</h3><p>Profil bilgileri, adresler ve bildirim tercihleri masaüstü hesap altyapısıyla aynı veriye bağlı kalacak şekilde korunur.</p><a class="cm-btn" href="/account/profile.html?tab=profile">Bilgileri Yönet</a></section><section class="cm-account-card"><h3>Kayıtlı adresler</h3><p>Varsayılan teslimat adresi ve düzenleme akışları hesap panelinden yönetilir.</p><a class="cm-btn" href="/account/profile.html?tab=addresses">Adresleri Yönet</a></section>';
  }

  function supportPage() {
    var path = window.location.pathname;
    var isReturn = /iade-degisim/.test(path);
    var isDelivery = /teslimat-kargo/.test(path);
    var title = isReturn ? 'İade ve Değişim' : isDelivery ? 'Teslimat ve Kargo' : 'Yardım ve Destek';
    var body = isReturn ? 'İade süreci, ürün bütünlüğü ve destek talebi adımlarını tek ekranda oku.' : isDelivery ? 'Kargo hazırlığı, ücretsiz teslimat eşiği ve teslimat takibi bilgileri.' : 'COSMOSKIN destek ekibine ulaş ve sık sorulan konuları hızlıca incele.';
    return '<div class="cm-mobile-page cm-mobile-support">' + header({ promo: false }) + '<section class="cm-support-hero"><p class="cm-kicker">COSMOSKIN destek</p><h1>' + title + '</h1><p>' + body + '</p></section><div class="cm-page-inner"><section class="cm-account-card"><h2>' + title + '</h2><p>' + body + '</p><a class="cm-support-link" href="mailto:destek@cosmoskin.com.tr">' + svg('mail') + '<span>destek@cosmoskin.com.tr</span></a></section><section class="cm-account-card cm-info-list"><h3>Hızlı bağlantılar</h3><a href="/teslimat-kargo.html">Teslimat ve kargo</a><a href="/iade-degisim.html">İade ve değişim</a><a href="/contact.html">İletişim formu</a></section></div>' + bottomNav('account') + '</div>';
  }

  function menuOverlay() {
    function card(icon, title, href) { return '<a class="cm-menu-card" href="' + href + '">' + svg(icon) + '<span>' + title + '</span></a>'; }
    function link(icon, title, href) { return '<a class="cm-menu-link" href="' + href + '">' + svg(icon) + '<span>' + title + '</span>' + svg('chevron') + '</a>'; }
    var brandLinks = BRAND_LOGOS.map(function (b) { return '<a href="' + brandHref(b) + '"><img src="/assets/img/brands/' + b + '.svg" alt="' + escapeHtml(brandNameFromSlug(b)) + '"><span>' + escapeHtml(brandNameFromSlug(b)) + '</span></a>'; }).join('');
    return '<div class="cm-menu-dim" data-cm-menu-close></div><aside class="cm-menu-panel" id="cm-mobile-menu" aria-label="COSMOSKIN mobil menü" aria-hidden="true"><div class="cm-menu-head"><button class="cm-menu-close" type="button" data-cm-menu-close aria-label="Menüyü kapat">' + svg('close') + '</button><div><div class="cm-menu-logo">COSMOSKIN</div><div class="cm-menu-welcome">' + svg('leaf') + ' Merhaba, güzelliğine iyi bak.</div></div></div><nav class="cm-menu-main" aria-label="Genel navigasyon">' + link('grid', 'Tüm Ürünler', '/allproducts.html') + '<details class="cm-menu-accordion"><summary>' + svg('tag') + '<span>Markalar</span>' + svg('chevron') + '</summary><div class="cm-menu-brand-list">' + brandLinks + '</div></details>' + link('star', 'Çok Satanlar', '/index.html#bestsellers') + link('bottle', 'Rutinler', '/collections/routine.html') + link('shield', 'Destek', '/contact.html') + '</nav><section class="cm-menu-section"><div class="cm-menu-section__head"><h3>Hızlı Kategoriler</h3><a href="/allproducts.html">Tümünü Gör</a></div><div class="cm-menu-card-grid">' + card('bottle', 'Temizleyiciler', '/collections/cleanse.html') + card('drop', 'Tonik & Essence', '/collections/hydrate.html') + card('sparkle', 'Serum & Ampul', '/collections/treat.html') + card('cube', 'Nemlendiriciler', '/collections/care.html') + card('shield', 'Güneş Koruyucular', '/collections/protect.html') + card('leaf', 'Maskeler', '/collections/masks.html') + '</div></section><section class="cm-menu-section"><div class="cm-menu-section__head"><h3>Cilt Hedeflerine Göre Keşif</h3><a href="/collections/routine.html">Tümünü Gör</a></div><div class="cm-menu-card-grid">' + card('drop', 'Nem', '/collections/hydrate.html') + card('shield', 'Bariyer', '/collections/barrier.html') + card('sparkle', 'Işıltı', '/collections/glow.html') + card('leaf', 'Akne & Denge', '/collections/acne-balance.html') + card('heart', 'Hassasiyet', '/collections/sensitivity.html') + card('grid', 'Gözenek & Sebum', '/collections/pore-sebum.html') + '</div></section><nav class="cm-service-links" aria-label="Hesap ve destek">' + link('user', 'Hesabım', '/account/profile.html') + link('cube', 'Siparişlerim', '/account/orders.html') + link('heart', 'Favorilerim', '/account/profile.html#favorites') + link('bag', 'Sepetim', '/checkout.html') + link('shield', 'Yardım ve Destek', '/account/profile.html#help') + link('truck', 'İade ve Teslimat', '/account/profile.html#returns') + '</nav></aside>';
  }

  function sheetHtml(kind) {
    if (kind === 'sort') {
      var options = [['featured', 'Öne çıkanlar'], ['price-asc', 'Fiyat: Artan'], ['price-desc', 'Fiyat: Azalan'], ['brand', 'Markaya göre']];
      return '<div class="cm-sheet-dim" data-cm-close-sheet></div><section class="cm-sheet" role="dialog" aria-modal="true" aria-label="Sıralama"><div class="cm-sheet-head"><strong>Sırala</strong><button type="button" data-cm-close-sheet aria-label="Kapat">' + svg('close') + '</button></div>' + options.map(function (o) { return '<button class="cm-sheet-option ' + (listingState.sort === o[0] ? 'is-selected' : '') + '" type="button" data-cm-sort="' + o[0] + '" aria-pressed="' + (listingState.sort === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</section>';
    }
    var cats = Object.keys(CATEGORY_ROUTES).filter(function (key) { return CATEGORY_ROUTES[key].category; }).map(function (key) { return CATEGORY_ROUTES[key].category; });
    var brands = Array.from(new Set(getProducts().map(function (p) { return p.brand; }).filter(Boolean))).slice(0, 16);
    return '<div class="cm-sheet-dim" data-cm-close-sheet></div><section class="cm-sheet" role="dialog" aria-modal="true" aria-label="Filtre"><div class="cm-sheet-head"><strong>Filtrele</strong><button type="button" data-cm-close-sheet aria-label="Kapat">' + svg('close') + '</button></div><h3>Kategori</h3><div class="cm-sheet-chips"><button type="button" data-cm-filter-category="" class="' + (!listingState.category ? 'is-selected' : '') + '">Tümü</button>' + cats.map(function (c) { return '<button type="button" data-cm-filter-category="' + escapeHtml(c) + '" class="' + (listingState.category === c ? 'is-selected' : '') + '">' + escapeHtml(c) + '</button>'; }).join('') + '</div><h3>Marka</h3><div class="cm-sheet-chips"><button type="button" data-cm-filter-brand="" class="' + (!listingState.brand ? 'is-selected' : '') + '">Tümü</button>' + brands.map(function (b) { return '<button type="button" data-cm-filter-brand="' + escapeHtml(b) + '" class="' + (listingState.brand === b ? 'is-selected' : '') + '">' + escapeHtml(b) + '</button>'; }).join('') + '</div><button class="cm-btn cm-btn--primary cm-btn--wide" type="button" data-cm-close-sheet>Uygula</button></section>';
  }

  function openSheet(kind) {
    var root = document.getElementById(SHEET_ID);
    if (!root) { root = document.createElement('div'); root.id = SHEET_ID; document.body.appendChild(root); }
    root.innerHTML = sheetHtml(kind);
    document.body.classList.add('cm-sheet-open');
  }

  function closeSheet() {
    var root = document.getElementById(SHEET_ID);
    if (root) root.innerHTML = '';
    document.body.classList.remove('cm-sheet-open');
  }

  function openMenu() {
    document.body.classList.add('cm-menu-open');
    var panel = document.querySelector('.cm-menu-panel');
    var button = document.querySelector('[data-cm-menu]');
    if (panel) panel.setAttribute('aria-hidden', 'false');
    if (button) button.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    document.body.classList.remove('cm-menu-open');
    var panel = document.querySelector('.cm-menu-panel');
    var button = document.querySelector('[data-cm-menu]');
    if (panel) panel.setAttribute('aria-hidden', 'true');
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function renderListingGrid() {
    var grid = document.querySelector('[data-cm-listing-grid]');
    var count = document.querySelector('[data-cm-product-count]');
    if (!grid) return;
    var products = filteredProducts();
    grid.innerHTML = products.length ? products.map(productCard).join('') : emptyState('Eşleşen ürün bulunamadı.', 'Filtreleri temizleyerek tekrar deneyebilirsin.');
    if (count) count.textContent = products.length;
    refreshInjectedCommerce(grid);
  }

  function renderCartMobile() {
    var content = document.querySelector('[data-cm-cart-content]');
    var title = document.querySelector('[data-cm-cart-title-count]');
    var totals = cartTotals();
    if (content) content.innerHTML = cartContentHtml();
    if (title) title.textContent = totals.count ? '(' + totals.count + ' ürün)' : '';
    updateBadges();
  }

  function refreshInjectedCommerce(root) {
    try { if (window.initFavoriteButtons) window.initFavoriteButtons(root || document); } catch (e) {}
    try { if (window.initCartButtons) window.initCartButtons(root || document); } catch (e) {}
    syncFallbackFavoriteButtons(root || document);
  }

  function updateBadges() {
    var count = cartTotals().count;
    Array.prototype.slice.call(document.querySelectorAll('[data-cm-cart-badge]')).forEach(function (el) {
      el.textContent = count;
      el.style.display = count ? 'grid' : 'none';
    });
    var title = document.querySelector('[data-cm-cart-title-count]');
    if (title) title.textContent = count ? '(' + count + ' ürün)' : '';
  }

  function toast(text) {
    var el = document.querySelector('.cm-mobile-toast');
    if (!el) { el = document.createElement('div'); el.className = 'cm-mobile-toast'; document.body.appendChild(el); }
    el.textContent = text;
    window.requestAnimationFrame(function () { el.classList.add('is-visible'); });
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('is-visible'); }, 1800);
  }

  function pageHtmlForType(type) {
    if (type === 'pdp') return pdpPage();
    if (type === 'cart') return cartPage();
    if (type === 'routine') return routinePage();
    if (type === 'listing') return listingPage();
    if (type === 'account') return accountPage();
    if (type === 'support') return supportPage();
    return homePage();
  }

  function mount() {
    var type = getPageType();
    if (!type || !isMobile()) return;
    var main = document.querySelector('main') || document.body;
    var root = document.getElementById(ROOT_ID);
    if (!root) { root = document.createElement('div'); root.id = ROOT_ID; main.insertAdjacentElement('afterbegin', root); }
    root.innerHTML = pageHtmlForType(type);
    var drawer = document.getElementById(DRAWER_ID);
    if (!drawer) { drawer = document.createElement('div'); drawer.id = DRAWER_ID; drawer.innerHTML = menuOverlay(); document.body.appendChild(drawer); }
    document.body.classList.add('cm-mobile-active');
    document.documentElement.classList.add('cm-mobile-active');
    mounted = true;
    updateBadges();
    refreshInjectedCommerce(root);
  }

  function unmount() {
    var root = document.getElementById(ROOT_ID);
    var drawer = document.getElementById(DRAWER_ID);
    var sheet = document.getElementById(SHEET_ID);
    if (root) root.remove();
    if (drawer) drawer.remove();
    if (sheet) sheet.remove();
    document.body.classList.remove('cm-mobile-active', 'cm-menu-open', 'cm-sheet-open');
    document.documentElement.classList.remove('cm-mobile-active');
    mounted = false;
  }

  function remount() {
    if (!isMobile()) { if (mounted) unmount(); return; }
    var type = getPageType();
    if (!type) { if (mounted) unmount(); return; }
    mount();
  }

  function bindDelegates() {
    if (delegatesBound) return;
    delegatesBound = true;
    document.addEventListener('click', function (event) {
      var target = event.target;
      if (target.closest('[data-cm-menu]')) { event.preventDefault(); openMenu(); return; }
      if (target.closest('[data-cm-menu-close]')) { event.preventDefault(); closeMenu(); return; }
      if (target.closest('.cm-menu-panel a')) { closeMenu(); }
      if (target.closest('[data-cm-back]')) { event.preventDefault(); if (history.length > 1) history.back(); else window.location.href = '/allproducts.html'; return; }
      var add = target.closest('[data-cm-add-cart]');
      if (add) { event.preventDefault(); var product = getProductBySlug(add.getAttribute('data-cm-add-cart')) || getCurrentProduct(); var qty = add.getAttribute('data-cm-qty') === 'pdp' ? currentPdpQty : 1; addItemsToCart([{ id: product.slug, slug: product.slug, name: product.name, brand: product.brand, price: product.price, image: product.image, url: product.url, qty: qty }]); return; }
      if (target.closest('[data-cm-pdp-inc]')) { currentPdpQty += 1; var q1 = document.querySelector('[data-cm-pdp-qty]'); if (q1) q1.textContent = currentPdpQty; return; }
      if (target.closest('[data-cm-pdp-dec]')) { currentPdpQty = Math.max(1, currentPdpQty - 1); var q2 = document.querySelector('[data-cm-pdp-qty]'); if (q2) q2.textContent = currentPdpQty; return; }
      var inc = target.closest('[data-cm-cart-inc]'); if (inc) { updateCartQuantity(inc.getAttribute('data-cm-cart-inc'), 1); return; }
      var dec = target.closest('[data-cm-cart-dec]'); if (dec) { updateCartQuantity(dec.getAttribute('data-cm-cart-dec'), -1); return; }
      var rem = target.closest('[data-cm-cart-remove]'); if (rem) { removeCartItem(rem.getAttribute('data-cm-cart-remove')); return; }
      if (target.closest('[data-cm-open-sort]')) { openSheet('sort'); return; }
      if (target.closest('[data-cm-open-filter]')) { openSheet('filter'); return; }
      if (target.closest('[data-cm-close-sheet]')) { closeSheet(); return; }
      var sort = target.closest('[data-cm-sort]'); if (sort) { listingState.sort = sort.getAttribute('data-cm-sort'); closeSheet(); renderListingGrid(); return; }
      var cat = target.closest('[data-cm-filter-category]'); if (cat) { listingState.category = cat.getAttribute('data-cm-filter-category'); renderListingGrid(); openSheet('filter'); return; }
      var brand = target.closest('[data-cm-filter-brand]'); if (brand) { listingState.brand = brand.getAttribute('data-cm-filter-brand'); renderListingGrid(); openSheet('filter'); return; }
      var goal = target.closest('[data-cm-routine-goal]'); if (goal) { var value = goal.getAttribute('data-cm-routine-goal'); var idx = routineState.goals.indexOf(value); if (idx === -1) routineState.goals.push(value); else if (routineState.goals.length > 1) routineState.goals.splice(idx, 1); remount(); return; }
      var skin = target.closest('[data-cm-routine-skin]'); if (skin) { routineState.skin = skin.getAttribute('data-cm-routine-skin'); remount(); return; }
      var period = target.closest('[data-cm-routine-period]'); if (period) { routineState.period = period.getAttribute('data-cm-routine-period'); remount(); return; }
      if (target.closest('[data-cm-add-routine]')) { var items = currentRoutineProducts().map(function (p) { return { id: p.slug, slug: p.slug, name: p.name, brand: p.brand, price: p.price, image: p.image, url: p.url, qty: 1 }; }); addItemsToCart(items, { toast: 'Rutin sepetinize eklendi.' }); return; }
      if (target.closest('[data-cm-save-routine]')) { localStorage.setItem(STORAGE_ROUTINE, JSON.stringify({ state: routineState, products: currentRoutineProducts().map(function (p) { return p.slug; }), savedAt: new Date().toISOString() })); toast('Rutin kaydedildi.'); return; }
      var fav = target.closest('.favorite-btn'); if (fav && fav.closest('#' + ROOT_ID)) { fallbackToggleFavorite(fav); return; }
      if (target.closest('[data-cm-share]')) { if (navigator.share) navigator.share({ title: document.title, url: window.location.href }).catch(function () {}); else { navigator.clipboard && navigator.clipboard.writeText(window.location.href); toast('Bağlantı kopyalandı.'); } }
      if (target.closest('[data-cm-logout]')) { try { localStorage.removeItem('sb-auth-token'); sessionStorage.clear(); } catch (e) {} toast('Çıkış işlemi başlatıldı.'); window.setTimeout(function () { window.location.href = '/index.html'; }, 350); }
    });
    document.addEventListener('submit', function (event) {
      if (event.target.matches('[data-cm-coupon-form]')) { event.preventDefault(); var status = event.target.querySelector('[data-cm-coupon-status]'); var input = event.target.querySelector('input[name="coupon"]'); if (status) status.textContent = input && input.value ? 'Kupon ödeme adımında doğrulanacak.' : 'Kupon kodu girilmedi.'; }
      if (event.target.matches('[data-cm-newsletter]')) { event.preventDefault(); toast('Haber bülteni kaydı alındı.'); }
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') { closeMenu(); closeSheet(); } });
    window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(remount, 120); });
    window.addEventListener('orientationchange', function () { setTimeout(remount, 180); });
    window.addEventListener('hashchange', function () { if (getPageType() === 'account') remount(); });
    window.addEventListener('cosmoskin:cart-updated', function () { updateBadges(); if (getPageType() === 'cart') renderCartMobile(); });
    window.addEventListener('storage', function (event) { if (event.key === STORAGE_CART || event.key === STORAGE_FAVORITES) { updateBadges(); syncFallbackFavoriteButtons(document); if (event.key === STORAGE_CART && getPageType() === 'cart') renderCartMobile(); } });
    document.addEventListener('cosmoskin:products-updated', function () { if (mounted) remount(); });
  }

  function loadGuides() {
    if (guides !== null) return;
    guides = false;
    fetch('/assets/data/product-guides.json', { cache: 'default' })
      .then(function (res) { if (!res.ok) throw new Error('guide load failed'); return res.json(); })
      .then(function (json) { guides = json || {}; if (mounted && getPageType() === 'pdp') remount(); })
      .catch(function () { guides = {}; });
  }

  function init() {
    bindDelegates();
    loadGuides();
    remount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
