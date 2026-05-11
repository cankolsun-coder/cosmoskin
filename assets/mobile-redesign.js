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
  var menuFocusTrapped = false;
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
    'pore-sebum': { title: 'Gözenek & Sebum', subtitle: 'Arındırma, denge ve gözenek görünümü odağı.', href: '/collections/pore-sebum.html', goal: 'pore', keywords: ['gözenek', 'sebum', 'pore', 'bha', 'aha', 'kil', 'volcanic', 'akne'] },
    hydration: { title: 'Nem', subtitle: 'Nem bariyerini destekleyen ve cilde konfor veren ürün seçkisi.', href: '/collections/hydration.html', goal: 'hydration', keywords: ['nem', 'hyaluronic', 'hyalüronik', 'moisture', 'moisturizing', 'hydration', 'aquaring', 'water', 'sleeping'] }
  };

  var BRAND_LOGOS = ['anua', 'beauty-of-joseon', 'cosrx', 'round-lab', 'skin1004', 'torriden', 'thank-you-farmer', 'innisfree', 'medicube', 'dr-jart', 'isntree', 'mediheal', 'goodal', 'laneige', 'some-by-mi', 'by-wishtrend', 'im-from'];

  function isMobile() {
    return window.matchMedia ? window.matchMedia('(max-width: ' + BREAKPOINT + 'px)').matches : window.innerWidth <= BREAKPOINT;
  }

  function getPageType() {
    var p = window.location.pathname;
    if (p === '/' || /\/index\.html$/.test(p)) return 'home';
    if (/\/products\//.test(p)) return 'pdp';
    if (/\/cart\.html$/.test(p)) return 'cart';
    if (/\/checkout\.html$/.test(p)) return 'checkout';
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
      aliases: Array.isArray(raw.aliases) ? raw.aliases.map(function (alias) { return extractSlug(alias); }).filter(Boolean) : [],
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
    return getProducts().find(function (p) {
      return p.slug === slug || extractSlug(p.url) === slug || (Array.isArray(p.aliases) && p.aliases.indexOf(slug) !== -1);
    }) || null;
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
    var left = options.back ? '<button class="cm-icon-btn cm-header__back" type="button" data-cm-back aria-label="Geri dön">' + svg('back') + '</button>' : '<button class="cm-icon-btn cm-header__menu" type="button" data-cm-menu aria-label="Menüyü aç" aria-expanded="false" aria-controls="cm-mobile-menu">' + svg('menu') + '</button>';
    var secure = options.checkout ? '<span class="cm-secure-title">' + svg('lock') + ' Güvenli Ödeme</span>' : '';
    return '<header class="cm-header ' + (options.checkout ? 'cm-header--checkout' : '') + '"><div class="cm-header__left">' + left + '</div><a href="/index.html" class="cm-wordmark" aria-label="COSMOSKIN anasayfa">COSMOSKIN</a>' + (options.checkout ? secure : headerIcons()) + '</header>';
  }

  function bottomNav(active) {
    var items = [
      ['home', 'Ana Sayfa', '/index.html', 'home', false],
      ['grid', 'Kategoriler', '/allproducts.html', 'list', true],
      ['sparkle', 'Keşfet', '/collections/routine.html', 'discover', false],
      ['heart', 'Favorilerim', '/account/profile.html?tab=favorites', 'fav', false],
      ['user', 'Hesabım', '/account/profile.html', 'account', false]
    ];
    return '<nav class="cm-bottom-nav" aria-label="Mobil alt navigasyon">' + items.map(function (i) {
      if (i[4]) return '<button class="' + (active === i[3] ? 'is-active' : '') + '" type="button" data-cm-menu aria-label="Kategoriler menüsünü aç">' + svg(i[0]) + '<span>' + i[1] + '</span></button>';
      return '<a class="' + (active === i[3] ? 'is-active' : '') + '" href="' + i[2] + '">' + svg(i[0]) + '<span>' + i[1] + '</span></a>';
    }).join('') + '</nav>';
  }


  function searchBar(extraClass) {
    var query = escapeHtml(new URLSearchParams(window.location.search).get('q') || '');
    return '<form class="cm-searchbar ' + (extraClass || '') + '" action="/search.html" method="get" role="search">' + svg('search') + '<input name="q" value="' + query + '" autocomplete="off" placeholder="Ürün, marka veya içerik ara" aria-label="Ürün, marka veya içerik ara"></form>';
  }

  function headerIcons() {
    return '<div class="cm-header__right"><a class="cm-icon-btn" href="/account/profile.html?tab=favorites" aria-label="Favorilerim">' + svg('heart') + '</a><a class="cm-icon-btn" href="/cart.html" aria-label="Sepetim">' + svg('bag') + '<span class="cm-badge" data-cm-cart-badge>0</span></a></div>';
  }

  function statusPill(slug) {
    return '<span class="cm-stock-dot" data-cm-stock-badge data-product-slug="' + escapeHtml(slug) + '" aria-live="polite">Stok kontrol ediliyor</span>';
  }

  function ratingPlaceholder(slug) {
    return '<a class="cm-card-review" href="/products/' + escapeHtml(slug) + '.html#reviewsSection" data-cm-card-rating data-product-slug="' + escapeHtml(slug) + '" aria-label="Ürün yorumlarına git"><em>Yorumları Gör</em></a>';
  }

  function primaryImageBySlug(slug, fallback) {
    var p = getProductBySlug(slug);
    return (p && p.image) || fallback || FALLBACK_IMG;
  }

  function checkoutStepHtml(active) {
    var steps = [['cart','Sepet'], ['delivery','Teslimat'], ['payment','Ödeme'], ['confirm','Onay']];
    return '<div class="cm-checkout-steps" aria-label="Ödeme adımları">' + steps.map(function(step, idx){
      var done = (active === 'delivery' && idx === 0) || (active === 'payment' && idx < 2) || (active === 'confirm' && idx < 3);
      var current = active === step[0];
      return '<span class="' + (current ? 'is-active' : done ? 'is-done' : '') + '"><b>' + (idx+1) + '</b>' + step[1] + '</span>';
    }).join('') + '</div>';
  }

  function compactCheckoutItems(cart) {
    if (!cart.length) return '<div class="cm-empty-state cm-empty-state--inline"><strong>Sepetin boş.</strong><span>Ödemeye geçmek için önce ürün eklemelisin.</span></div>';
    return cart.slice(0, 3).map(function(item){
      return '<article class="cm-checkout-mini" data-product-id="' + escapeHtml(item.slug) + '" data-product-slug="' + escapeHtml(item.slug) + '"><img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '"><div><strong>' + escapeHtml(item.name) + '</strong><span>' + escapeHtml(item.brand) + ' · ' + item.qty + ' adet</span></div></article>';
    }).join('') + (cart.length > 3 ? '<p class="cm-more-items">+' + (cart.length - 3) + ' ürün daha</p>' : '');
  }

  function orderSummaryBlock(totals, cart, compact) {
    return '<section class="cm-summary cm-summary--checkout"><div class="cm-summary-title"><h2>Sipariş Özeti</h2>' + (compact ? '<a href="/cart.html">Düzenle</a>' : '') + '</div>' + (cart ? '<div class="cm-checkout-minis">' + compactCheckoutItems(cart) + '</div>' : '') + '<div class="cm-summary-row"><span>Ara Toplam</span><b>' + formatPrice(totals.subtotal) + '</b></div><div class="cm-summary-row"><span>Kargo</span><b>' + (totals.shipping ? formatPrice(totals.shipping) : 'Ücretsiz') + '</b></div><div class="cm-summary-row is-total"><span>Toplam</span><b>' + formatPrice(totals.total) + '</b></div></section>';
  }

  function readCheckoutDraft() {
    try { return JSON.parse(sessionStorage.getItem('cosmoskin_checkout_mobile_draft') || '{}') || {}; } catch (e) { return {}; }
  }

  function writeCheckoutDraft(data) {
    try { sessionStorage.setItem('cosmoskin_checkout_mobile_draft', JSON.stringify(data || {})); } catch (e) {}
  }

  function hiddenCheckoutFields(data) {
    data = data || readCheckoutDraft();
    var fields = ['first_name','last_name','email','phone','city','district','postal_code','address','cargo_note','identity_number'];
    return fields.map(function(name){ return '<input type="hidden" name="' + name + '" value="' + escapeHtml(data[name] || '') + '">'; }).join('');
  }

  function getStoredOrders() {
    var keys = ['cosmoskin_orders', 'cosmoskin_recent_orders', 'cosmoskin_account_orders'];
    for (var i = 0; i < keys.length; i++) {
      try { var value = JSON.parse(localStorage.getItem(keys[i]) || '[]'); if (Array.isArray(value) && value.length) return value; } catch (e) {}
    }
    return [];
  }

  function orderStatusLabel(status) {
    var map = { pending:'Hazırlanıyor', processing:'Hazırlanıyor', preparing:'Hazırlanıyor', shipped:'Kargoda', in_transit:'Kargoda', delivered:'Teslim Edildi', cancelled:'İptal Edildi', canceled:'İptal Edildi', refunded:'İade Edildi' };
    return map[String(status || '').toLowerCase()] || 'Hazırlanıyor';
  }

  function orderCard(order) {
    var items = order.order_items || order.items || [];
    var first = items[0] || {};
    var slug = extractSlug(first.product_slug || first.slug || first.url || first.product_id || '');
    var p = slug ? getProductBySlug(slug) : null;
    var img = first.image || first.image_url || (p && p.image) || FALLBACK_IMG;
    var brand = first.brand || (p && p.brand) || '';
    var name = first.product_name || first.name || (p && p.name) || 'Sipariş ürünü';
    var total = Number(order.total || order.total_amount || order.grand_total || first.price || 0);
    var date = order.created_at || order.date || '';
    var formattedDate = '';
    try { formattedDate = date ? new Intl.DateTimeFormat('tr-TR', { day:'2-digit', month:'long', year:'numeric' }).format(new Date(date)) : ''; } catch(e) { formattedDate = String(date || ''); }
    var status = orderStatusLabel(order.status || order.fulfillment_status);
    return '<article class="cm-order-card"><div class="cm-order-card__top"><div><strong>#' + escapeHtml(order.order_number || order.number || order.id || '—') + '</strong><span>' + escapeHtml(formattedDate) + '</span></div><em class="cm-order-status">' + escapeHtml(status) + '</em></div><div class="cm-order-product"><img src="' + escapeHtml(img) + '" alt="' + escapeHtml(name) + '"><div><small>' + escapeHtml(brand) + '</small><b>' + escapeHtml(name) + '</b><span>' + escapeHtml(first.quantity || first.qty || 1) + ' Adet</span><strong>' + (total ? formatPrice(total) : '') + '</strong></div></div><div class="cm-order-actions"><a href="/account/order-detail.html">Detayı Gör</a>' + (status === 'Kargoda' ? '<a class="is-dark" href="/order-tracking.html">Kargoyu Takip Et</a>' : '') + (status === 'Teslim Edildi' ? '<a href="/account/profile.html?tab=invoices">Faturayı İndir</a>' : '') + '</div></article>';
  }

  function productCard(product, options) {
    options = options || {};
    var label = product.label || options.label || '';
    return '<article class="cm-product-card" data-product-id="' + escapeHtml(product.slug) + '" data-product-slug="' + escapeHtml(product.slug) + '">' +
      (label ? '<span class="cm-chip-label">' + escapeHtml(label) + '</span>' : '') +
      '<button class="cm-fav favorite-btn" type="button" aria-label="Favorilere ekle" aria-pressed="false" data-favorite-id="' + escapeHtml(product.slug) + '" data-id="' + escapeHtml(product.slug) + '" data-slug="' + escapeHtml(product.slug) + '" data-name="' + escapeHtml(product.name) + '" data-brand="' + escapeHtml(product.brand) + '" data-price="' + escapeHtml(product.price) + '" data-image="' + escapeHtml(product.image) + '" data-url="' + escapeHtml(product.url) + '">' + svg('heart') + '</button>' +
      '<a class="cm-product-card__media product-media" href="' + escapeHtml(product.url) + '"><img src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.brand + ' ' + product.name) + '" loading="lazy"></a>' +
      '<div class="cm-product-card__body"><small>' + escapeHtml(product.brand.toUpperCase()) + '</small><a class="cm-product-title" href="' + escapeHtml(product.url) + '"><h3>' + escapeHtml(product.name) + '</h3></a>' +
      '<b class="cm-card-price">' + formatPrice(product.price) + '</b>' + ratingPlaceholder(product.slug) + '<div class="cm-card-stock-row">' + statusPill(product.slug) + '</div>' +
      '<div class="cm-card-actions"><button class="cm-card-cart" type="button" data-cm-add-cart="' + escapeHtml(product.slug) + '" data-slug="' + escapeHtml(product.slug) + '" data-id="' + escapeHtml(product.slug) + '" data-product-slug="' + escapeHtml(product.slug) + '" aria-label="' + escapeHtml(product.name) + ' sepete ekle">Sepete Ekle</button><button class="cm-card-bag" type="button" data-cm-add-cart="' + escapeHtml(product.slug) + '" data-slug="' + escapeHtml(product.slug) + '" data-id="' + escapeHtml(product.slug) + '" data-product-slug="' + escapeHtml(product.slug) + '" aria-label="' + escapeHtml(product.name) + ' hızlı sepete ekle">' + svg('bag') + '</button></div>' +
      '<span class="cm-stock-line" data-cm-stock-line data-product-slug="' + escapeHtml(product.slug) + '" aria-live="polite">Stok bilgisi kontrol ediliyor.</span></div>' +
      '</article>';
  }

  function miniProduct(product) {
    return '<article class="cm-mini-product cm-product-card" data-product-id="' + escapeHtml(product.slug) + '" data-product-slug="' + escapeHtml(product.slug) + '"><button class="cm-fav favorite-btn" type="button" aria-label="Favorilere ekle" aria-pressed="false" data-favorite-id="' + escapeHtml(product.slug) + '" data-id="' + escapeHtml(product.slug) + '" data-slug="' + escapeHtml(product.slug) + '" data-name="' + escapeHtml(product.name) + '" data-brand="' + escapeHtml(product.brand) + '" data-price="' + escapeHtml(product.price) + '" data-image="' + escapeHtml(product.image) + '" data-url="' + escapeHtml(product.url) + '">' + svg('heart') + '</button><a class="cm-product-card__media" href="' + escapeHtml(product.url) + '"><img src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.brand + ' ' + product.name) + '" loading="lazy"></a><div class="cm-product-card__body"><small>' + escapeHtml(product.brand.toUpperCase()) + '</small><a class="cm-product-title" href="' + escapeHtml(product.url) + '"><h3>' + escapeHtml(product.name) + '</h3></a><b class="cm-card-price">' + formatPrice(product.price) + '</b>' + statusPill(product.slug) + '</div></article>';
  }

  function categoryCard(img, title, desc, href) {
    return '<a class="cm-category-card" href="' + href + '"><span class="cm-category-card__img"><img src="' + img + '" alt="' + escapeHtml(title) + '" loading="lazy"></span><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(desc) + '</span></a>';
  }

  function trustStrip() {
    return '<section class="cm-trust-strip" aria-label="Güven unsurları"><div class="cm-trust-item">' + svg('lock') + '<strong>Güvenli ödeme</strong><span>3D Secure koruması</span></div><div class="cm-trust-item">' + svg('truck') + '<strong>Hızlı teslimat</strong><span>1–3 iş günü</span></div><div class="cm-trust-item">' + svg('shield') + '<strong>Özenle seçildi</strong><span>Uzman onaylı</span></div></section>';
  }

  function brandStrip() {
    var brands = ['cosrx', 'beauty-of-joseon', 'anua', 'torriden', 'round-lab', 'skin1004'];
    return '<div class="cm-brand-strip" aria-label="Sevdiğin markalar">' + brands.map(function (b) { return '<a href="' + brandHref(b) + '"><img src="/assets/img/brands/' + b + '.svg" alt="' + escapeHtml(brandNameFromSlug(b)) + '" loading="lazy"></a>'; }).join('') + '<a class="cm-brand-more" href="/allproducts.html" aria-label="Tüm markaları gör">' + svg('chevron') + '</a></div>';
  }

  function brandNameFromSlug(slug) {
    var map = { cosrx: 'COSRX', skin1004: 'SKIN1004', 'beauty-of-joseon': 'Beauty of Joseon', 'round-lab': 'Round Lab', 'thank-you-farmer': 'Thank You Farmer', 'dr-jart': 'Dr. Jart+', 'by-wishtrend': 'By Wishtrend', 'im-from': "I'm From", 'some-by-mi': 'Some By Mi' };
    return map[slug] || slug.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }

  function brandHref(slug) { return '/brands/' + slug + '.html'; }


  function productConcernLabel(product) {
    var text = [product.category, product.keywords, product.name].join(' ').toLocaleLowerCase('tr-TR');
    if (text.indexOf('hassas') !== -1 || text.indexOf('soothing') !== -1 || text.indexOf('centella') !== -1) return 'Hassasiyet';
    if (text.indexOf('akne') !== -1 || text.indexOf('pore') !== -1 || text.indexOf('gözenek') !== -1 || text.indexOf('sebum') !== -1) return 'Akne · Sebum';
    if (text.indexOf('bariyer') !== -1 || text.indexOf('ceramide') !== -1 || text.indexOf('seramid') !== -1) return 'Bariyer';
    if (text.indexOf('glow') !== -1 || text.indexOf('ışıltı') !== -1 || text.indexOf('vitamin') !== -1 || text.indexOf('leke') !== -1) return 'Işıltı';
    if (text.indexOf('nem') !== -1 || text.indexOf('hyal') !== -1 || text.indexOf('moisture') !== -1) return 'Nem';
    return product.category || 'Cilt Bakımı';
  }

  function stockFallbackHtml(slug) {
    return '<span class="cm-stock-badge is-checking" data-cm-stock-badge data-product-slug="' + escapeHtml(slug) + '" aria-live="polite">Stok kontrol ediliyor</span>';
  }

  function collectRenderedSlugs(root) {
    return Array.prototype.slice.call((root || document).querySelectorAll('[data-cm-add-cart], [data-cm-stock-badge], [data-product-slug], [data-product-id], [data-favorite-id]')).map(function (node) {
      return extractSlug(node.getAttribute('data-cm-add-cart') || node.dataset.productSlug || node.dataset.productId || node.dataset.favoriteId || node.dataset.slug || node.dataset.id || '');
    }).filter(Boolean);
  }

  function stockInfo(slug) {
    var api = window.COSMOSKIN_STOCK;
    var inv = api && api.getInventory ? api.getInventory(slug) : null;
    if (!inv) return { state: 'checking', label: 'Stok kontrol ediliyor', line: 'Stok bilgisi canlı olarak kontrol ediliyor.', canBuy: true };
    var available = Number(inv.available_stock || 0);
    var out = inv.status === 'active' && !inv.allow_backorder && available <= 0;
    var inactive = inv.status && inv.status !== 'active';
    if (inactive || out) return { state: 'out', label: 'Stokta Yok', line: 'Favorilerine ekle, tekrar geldiğinde haber verelim.', canBuy: false };
    if (inv.low_stock || available <= 3) return { state: 'low', label: 'Az stok kaldı', line: 'Son ürünler: tükenmeden sepetine ekleyebilirsin.', canBuy: true };
    return { state: 'in', label: 'Stokta', line: 'Ürün stokta ve sepete eklenebilir.', canBuy: true };
  }

  function applyMobileInventoryState(root) {
    root = root || document;
    Array.prototype.slice.call(root.querySelectorAll('[data-cm-stock-badge]')).forEach(function (badge) {
      var slug = extractSlug(badge.dataset.productSlug || badge.closest('[data-product-id]')?.dataset.productId || '');
      var info = stockInfo(slug);
      badge.textContent = info.label;
      badge.className = 'cm-stock-badge is-' + info.state;
      badge.setAttribute('aria-label', 'Stok durumu: ' + info.label);
    });
    Array.prototype.slice.call(root.querySelectorAll('[data-cm-stock-line]')).forEach(function (line) {
      var slug = extractSlug(line.dataset.productSlug || line.closest('[data-product-id]')?.dataset.productId || '');
      var info = stockInfo(slug);
      line.textContent = info.line;
      line.className = 'cm-stock-line is-' + info.state;
    });
    Array.prototype.slice.call(root.querySelectorAll('[data-cm-add-cart]')).forEach(function (btn) {
      var slug = extractSlug(btn.getAttribute('data-cm-add-cart') || btn.dataset.productSlug || '');
      var info = stockInfo(slug);
      btn.disabled = !info.canBuy;
      btn.setAttribute('aria-disabled', info.canBuy ? 'false' : 'true');
      btn.classList.toggle('is-stock-disabled', !info.canBuy);
      if (!info.canBuy) btn.textContent = btn.closest('.cm-mobile-pdp') ? 'STOKTA YOK' : 'Stokta Yok';
      else if (/stokta yok/i.test(btn.textContent)) btn.textContent = btn.closest('.cm-mobile-pdp') ? 'Sepete Ekle' : 'Sepete Ekle';
    });
  }

  function refreshMobileInventory(root) {
    root = root || document;
    var slugs = collectRenderedSlugs(root);
    applyMobileInventoryState(root);
    if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.loadInventory === 'function' && slugs.length) {
      window.COSMOSKIN_STOCK.loadInventory(slugs).then(function () { applyMobileInventoryState(root); }).catch(function () { applyMobileInventoryState(root); });
    }
  }

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
    return '<div class="cm-routine-builder ' + (compact ? 'cm-routine-builder--compact' : '') + '" id="routine-commerce"><section class="cm-step-block"><h2>1. Cilt hedefini seç</h2><small>Seçimlere göre ürün önerileri anında güncellenir.</small><div class="cm-select-grid">' + goals.map(function (g) { var selected = routineState.goals.indexOf(g) !== -1; return '<button class="cm-select-chip ' + (selected ? 'is-selected' : '') + '" type="button" data-cm-routine-goal="' + escapeHtml(g) + '" aria-pressed="' + selected + '">' + svg(g === 'Nem' ? 'drop' : g === 'Bariyer' ? 'shield' : 'sparkle') + '<span>' + escapeHtml(g) + '</span></button>'; }).join('') + '</div></section><section class="cm-step-block"><h2>2. Cilt tipini seç</h2><div class="cm-select-grid cm-select-grid--skin">' + skins.map(function (s) { var selected = routineState.skin === s; return '<button class="cm-select-chip ' + (selected ? 'is-selected' : '') + '" type="button" data-cm-routine-skin="' + escapeHtml(s) + '" aria-pressed="' + selected + '">' + escapeHtml(s) + '</button>'; }).join('') + '</div></section><section class="cm-step-block"><h2>3. Rutin zamanı</h2><div class="cm-toggle"><button class="' + (routineState.period === 'day' ? 'is-active' : '') + '" type="button" data-cm-routine-period="day" aria-pressed="' + (routineState.period === 'day') + '">' + svg('sun') + ' Gündüz</button><button class="' + (routineState.period === 'night' ? 'is-active' : '') + '" type="button" data-cm-routine-period="night" aria-pressed="' + (routineState.period === 'night') + '">' + svg('moon') + ' Akşam</button></div></section><section class="cm-routine-card"><div class="cm-routine-card__head"><div><strong>' + escapeHtml(routineState.goals.join(' + ')) + ' Rutini</strong><span>' + escapeHtml(routineState.skin) + ' cilt için seçildi.</span></div><div class="cm-match">%' + score + '</div></div><div class="cm-routine-products">' + items.map(function (p, idx) { return '<a class="cm-routine-step" href="' + escapeHtml(p.url) + '"><img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '"><b>' + ['Temizleyici', 'Tonik', 'Serum', routineState.period === 'day' ? 'SPF' : 'Nem'][idx] + '</b><span>' + escapeHtml(p.brand) + '</span></a>'; }).join('') + '</div><div class="cm-set-price"><div><small>Set avantaj fiyatı</small><s>' + formatPrice(subtotal) + '</s><b>' + formatPrice(setPrice) + '</b></div><span>Sepette ürün bazında uygulanır</span></div><button class="cm-btn cm-btn--primary cm-btn--wide" type="button" data-cm-add-routine>TÜM RUTİNİ SEPETE EKLE</button><div class="cm-secondary-actions"><button class="cm-btn" type="button" data-cm-save-routine>Rutini Kaydet</button>' + (compact ? '<a class="cm-btn" href="/collections/routine.html">Rutini Gör</a>' : '<a class="cm-btn" href="/allproducts.html">Tüm Ürünleri Gör</a>') + '</div></section></div>';
  }

  function editSection() {
    return '<section class="cm-edit-section" aria-labelledby="cmEditTitle"><a class="cm-edit-card" href="/products/beauty-of-joseon-relief-sun-spf50.html"><img src="/assets/img/editorial/beauty-of-joseon-relief-sun-campaign-card.webp" alt="Beauty of Joseon Relief Sun editör seçimi" loading="lazy"><div class="cm-edit-copy"><span>COSMOSKIN Edit</span><h2 id="cmEditTitle">Günlük SPF, premium bakımın son imzası.</h2><p>Hafif doku, konforlu bitiş ve rutini bozmayan şehir kullanımı.</p><strong>Editör seçimini keşfet</strong></div></a></section>';
  }

  function footerSection() {
    return '<footer class="cm-footer"><div class="cm-footer-logo">COSMOSKIN</div><p>Seçilmiş Kore cilt bakım ürünleri. Gereksiz olanı çıkarır, etkili olanı bırakır.</p><form class="cm-newsletter" action="/api/newsletter/subscribe" method="post" data-newsletter-form data-newsletter-source="mobile-footer" novalidate><p class="cm-newsletter__microcopy">COSMOSKIN Journal’dan seçkiler ve rutin notları almak için kaydol.</p><label><span>E-posta adresi</span><input type="email" name="email" placeholder="E-posta adresin" autocomplete="email" required aria-label="E-posta adresi"></label><button type="submit"><span>Kaydol</span></button><p class="cm-newsletter__legal">Kayıt olarak COSMOSKIN Journal e-postalarını almayı kabul edersin. KVKK ve abonelik tercihlerine yasal metinlerden ulaşabilirsin.</p><p class="cm-newsletter__status" data-newsletter-status aria-live="polite"></p></form><div class="cm-footer-grid"><a href="/contact.html">Destek</a><a href="/teslimat-kargo.html">Teslimat</a><a href="/iade-degisim.html">İade</a><a href="/allproducts.html">Tüm Ürünler</a></div><div class="cm-footer-legal"><a href="/mesafeli-satis.html">Mesafeli Satış</a><a href="/on-bilgilendirme.html">Ön Bilgilendirme</a></div><div class="cm-payment-row" aria-label="Ödeme yöntemleri"><img src="/assets/payment/visa.svg" alt="Visa"><img src="/assets/payment/mastercard.svg" alt="Mastercard"><img src="/assets/payment/amex.svg" alt="American Express"></div></footer>';
  }

  function homePage() {
    var products = getProducts();
    var best = products.filter(function (p) { return ['Anua', 'Beauty of Joseon', 'COSRX', 'SKIN1004', 'Torriden', 'Round Lab'].indexOf(p.brand) !== -1; }).slice(0, 4);
    var newest = products.slice(-4).reverse();
    if (best.length < 4) best = products.slice(0, 4);
    var heroProduct = getProductBySlug('anua-heartleaf-77-soothing-toner') || products[0] || {};
    function concern(icon, title, href) { return '<a class="cm-concern-tile" href="' + href + '">' + svg(icon) + '<span>' + title + '</span></a>'; }
    return '<div class="cm-mobile-page cm-mobile-home">' + header({ promo: false }) + '<div class="cm-page-inner cm-page-inner--top">' + searchBar() + '</div>' +
      '<section class="cm-hero-ref" aria-labelledby="cmHomeHeroTitle"><div class="cm-hero-ref__copy"><p>PREMIUM KORE BAKIMI</p><h1 id="cmHomeHeroTitle">Seçilmiş<br>Kore Cilt Bakımı</h1><span>Bilimsel içerikler, nazik formüller, görünür sonuçlar.</span><a class="cm-btn cm-btn--primary" href="/allproducts.html">Keşfet</a></div><img src="' + escapeHtml(heroProduct.image || FALLBACK_IMG) + '" alt="' + escapeHtml(heroProduct.name || 'COSMOSKIN seçilmiş Kore cilt bakımı') + '"></section>' + trustStrip() + brandStrip() +
      '<div class="cm-page-inner"><section><div class="cm-section-head"><h2>Cilt İhtiyacına Göre</h2><a class="cm-see-all" href="/collections/routine.html">Tümünü Gör ' + svg('chevron') + '</a></div><div class="cm-concern-grid">' + concern('drop','Nem','/collections/hydration.html') + concern('shield','Bariyer','/collections/barrier.html') + concern('sparkle','Işıltı','/collections/glow.html') + concern('leaf','Hassasiyet','/collections/sensitivity.html') + '</div></section>' +
      '<section><div class="cm-section-head"><h2>Çok Satanlar</h2><a class="cm-see-all" href="/allproducts.html">Tümünü Gör ' + svg('chevron') + '</a></div><div class="cm-product-grid cm-product-grid--home">' + best.map(function(p, i){ return productCard(p, { index: i }); }).join('') + '</div></section>' +
      '<section class="cm-routine-teaser"><div><p>AKILLI RUTİN</p><h2>Gündüz ve akşam bakımını tek akışta kur.</h2><span>Cilt hedefini seç, COSMOSKIN ürün verisiyle önerilen rutini gör.</span></div><a class="cm-btn" href="/collections/routine.html">Rutini Başlat</a></section>' +
      '<section><div class="cm-section-head"><h2>Editörün Seçtikleri</h2><a class="cm-see-all" href="/allproducts.html">Tümünü Gör ' + svg('chevron') + '</a></div><div class="cm-product-grid cm-product-grid--home">' + newest.map(function(p, i){ return productCard(p, { index: i }); }).join('') + '</div></section>' + editSection() + footerSection() + '</div>' + bottomNav('home') + '</div>';
  }

  function listingPage() {
    var meta = routeListingMeta();
    listingState.query = new URLSearchParams(window.location.search).get('q') || '';
    var selected = [];
    if (meta.category) selected.push(meta.category);
    if (meta.brand) selected.push(meta.brand);
    if (listingState.query) selected.push('Arama: ' + listingState.query);
    var chips = selected.length ? '<div class="cm-filter-chips">' + selected.map(function(ch){ return '<span>' + escapeHtml(ch) + ' <b aria-hidden="true">×</b></span>'; }).join('') + '</div>' : '';
    return '<div class="cm-mobile-page cm-mobile-listing">' + header({ promo: false, back: true }) + '<div class="cm-page-inner cm-page-inner--top">' + searchBar() + '<section class="cm-list-head"><div><h1>' + escapeHtml(meta.title) + '</h1><p><span data-cm-product-count>0</span> ürün</p></div></section><div class="cm-list-controls"><button type="button" data-cm-open-filter>Filtrele ' + svg('filter') + '</button><button type="button" data-cm-open-sort>Sırala ' + svg('chevron') + '</button></div>' + chips + '<div class="cm-product-grid" data-cm-listing-grid></div></div><div class="cm-mobile-filterbar"><button type="button" data-cm-open-filter>' + svg('filter') + ' Filtrele</button><button type="button" data-cm-open-sort>Sırala ' + svg('chevron') + '</button></div>' + bottomNav('list') + '</div>';
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
    currentPdpQty = 1;
    var p = getCurrentProduct();
    var guide = productGuide(p);
    var products = getProducts();
    var recs = products.filter(function (x) { return x.slug !== p.slug && (x.category === p.category || x.brand === p.brand); }).slice(0, 4);
    if (recs.length < 4) recs = recs.concat(products.filter(function (x) { return x.slug !== p.slug && recs.indexOf(x) === -1; }).slice(0, 4 - recs.length));
    return '<div class="cm-mobile-page cm-mobile-pdp" data-product-slug="' + escapeHtml(p.slug) + '">' + header({ promo: false, back: true }) +
      '<section class="cm-pdp-hero-ref" aria-label="Ürün görseli"><img class="cm-pdp-product" src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.brand + ' ' + p.name) + '"><button class="cm-pdp-floating cm-pdp-floating--back" type="button" data-cm-back aria-label="Geri dön">' + svg('back') + '</button><button class="cm-pdp-floating cm-pdp-floating--share" type="button" data-cm-share aria-label="Paylaş">' + svg('tag') + '</button><button class="cm-pdp-floating cm-pdp-floating--zoom" type="button" aria-label="Görseli büyüt">' + svg('search') + '</button><span class="cm-gallery-count">1/1</span></section>' +
      '<section class="cm-pdp-info"><div class="cm-pdp-title-row"><div><span class="cm-pdp-brand">' + escapeHtml(p.brand.toUpperCase()) + '</span><h1>' + escapeHtml(p.name) + '</h1></div>' + statusPill(p.slug) + '</div><div class="cm-pdp-meta"><span class="cm-rating" data-cm-pdp-rating>Yorumlar yükleniyor</span><span data-cm-pdp-review-count>Doğrulanmış yorumlar</span></div><div class="cm-pdp-price-line"><b>' + formatPrice(p.price) + '</b><span>3 x ' + formatPrice(Math.round(Number(p.price || 0) / 3)) + '’den başlayan taksitlerle</span></div><div class="cm-pdp-benefits">' + guide.benefits.slice(0,3).map(function(b, i){ return '<p>' + svg(i === 0 ? 'drop' : i === 1 ? 'sparkle' : 'leaf') + '<span>' + escapeHtml(b) + '</span></p>'; }).join('') + '</div><div class="cm-pdp-trust"><span>' + svg('truck') + '1–3 iş günü</span><span>' + svg('shield') + 'Kolay iade</span></div><div class="cm-pdp-actions"><div class="cm-stepper" aria-label="Adet seçici"><button type="button" data-cm-pdp-dec aria-label="Adedi azalt">−</button><span data-cm-pdp-qty>' + currentPdpQty + '</span><button type="button" data-cm-pdp-inc aria-label="Adedi artır">+</button></div><button class="cm-fav-inline favorite-btn" type="button" aria-label="Favorilere ekle" aria-pressed="false" data-favorite-id="' + escapeHtml(p.slug) + '" data-id="' + escapeHtml(p.slug) + '" data-slug="' + escapeHtml(p.slug) + '" data-name="' + escapeHtml(p.name) + '" data-brand="' + escapeHtml(p.brand) + '" data-price="' + escapeHtml(p.price) + '" data-image="' + escapeHtml(p.image) + '" data-url="' + escapeHtml(p.url) + '">' + svg('heart') + '<span>Favorilere ekle</span></button></div><button class="cm-btn cm-btn--primary cm-pdp-sticky-cta" data-cm-add-cart="' + escapeHtml(p.slug) + '" data-slug="' + escapeHtml(p.slug) + '" data-id="' + escapeHtml(p.slug) + '" data-product-slug="' + escapeHtml(p.slug) + '" data-cm-qty="pdp" type="button">Sepete Ekle</button><a class="cm-stock-notify" href="/account/profile.html?tab=favorites">Stok gelince haber ver ' + svg('chevron') + '</a><div class="cm-accordion" aria-label="Ürün bilgileri">' + accordion('drop', 'Kullanım', guide.usage) + accordion('bottle', 'İçindekiler', guide.ingredients) + accordion('user', 'Cilt Tipi', guide.suitability) + '</div><section class="cm-mobile-reviews" data-cm-mobile-reviews data-product-slug="' + escapeHtml(p.slug) + '" aria-live="polite"><div class="cm-section-head"><div><h2>Müşteri Yorumları</h2></div><a class="cm-see-all" href="#reviewsSection">Tümünü Gör ' + svg('chevron') + '</a></div><div class="cm-review-loading">Yorumlar yükleniyor…</div></section><div class="cm-section-head"><h2>Sizin İçin Seçtiklerimiz</h2><a class="cm-see-all" href="/allproducts.html">Tümünü Gör ' + svg('chevron') + '</a></div><div class="cm-product-grid cm-product-grid--reco">' + recs.map(miniProduct).join('') + '</div></section>' + bottomNav('list') + '</div>';
  }


  function checkoutPage() {
    var step = new URLSearchParams(window.location.search).get('step') || 'delivery';
    if (step === 'payment') return checkoutPaymentPage();
    return checkoutDeliveryPage();
  }


  function checkoutDeliveryPage() {
    var cart = getCart();
    var totals = cartTotals();
    var draft = readCheckoutDraft();
    return '<div class="cm-mobile-page cm-mobile-checkout cm-mobile-checkout--delivery">' + header({ promo: false, back: true, checkout: true }) + checkoutStepHtml('delivery') + '<form class="cm-checkout-form" data-cm-delivery-form novalidate><section class="cm-checkout-title"><h1>Teslimat Bilgileri</h1><p>Siparişinizin teslim edileceği adresi seçin.</p></section><section class="cm-checkout-card"><div class="cm-checkout-card__head"><div><strong>Teslimat Adresi</strong></div><button type="button">' + svg('plus') + ' Yeni Adres Ekle</button></div><label class="cm-address-card is-selected"><input type="radio" name="address_choice" value="manual" checked><span class="cm-radio-dot"></span><b>Yeni teslimat adresi</b><small>Kayıtlı adres bulunmuyorsa bilgileri aşağıdaki alandan tamamlayın.</small><i>Aktif</i></label></section><section class="cm-checkout-card"><h2>Teslimat Yöntemi</h2><label class="cm-delivery-method is-selected"><input type="radio" name="delivery_method" value="standard" checked><span class="cm-radio-dot"></span>' + svg('truck') + '<b>Standart Teslimat<small>2–3 iş günü içinde teslimat</small></b><em>Ücretsiz</em></label><label class="cm-delivery-method"><input type="radio" name="delivery_method" value="express"><span class="cm-radio-dot"></span>' + svg('cube') + '<b>Hızlı Teslimat<small>1 iş günü içinde teslimat</small></b><em>50,00 TL</em></label></section><section class="cm-checkout-card"><h2>İletişim Bilgileri</h2><div class="cm-field-grid"><label>Ad<input name="first_name" value="' + escapeHtml(draft.first_name || '') + '" required autocomplete="given-name"></label><label>Soyad<input name="last_name" value="' + escapeHtml(draft.last_name || '') + '" required autocomplete="family-name"></label><label>E-posta<input name="email" value="' + escapeHtml(draft.email || '') + '" required type="email" autocomplete="email"></label><label>Telefon<input name="phone" value="' + escapeHtml(draft.phone || '') + '" required inputmode="tel" autocomplete="tel"></label><label>İl<input name="city" value="' + escapeHtml(draft.city || '') + '" required autocomplete="address-level1"></label><label>İlçe<input name="district" value="' + escapeHtml(draft.district || '') + '" required autocomplete="address-level2"></label><label>Posta Kodu<input name="postal_code" value="' + escapeHtml(draft.postal_code || '') + '" required inputmode="numeric" autocomplete="postal-code"></label><label>T.C. Kimlik No <em>Opsiyonel</em><input name="identity_number" value="' + escapeHtml(draft.identity_number || '') + '" inputmode="numeric"></label><label class="is-full">Adres<textarea name="address" required rows="3" autocomplete="street-address">' + escapeHtml(draft.address || '') + '</textarea></label><label class="is-full">Teslimat Notu<input name="cargo_note" value="' + escapeHtml(draft.cargo_note || '') + '" placeholder="Opsiyonel teslimat notu"></label></div><label class="cm-check-row"><input type="checkbox" name="notifications" checked><span>Sipariş süreciyle ilgili bilgilendirmeleri e-posta ve SMS ile almak istiyorum.</span></label><p class="cm-checkout-status" data-cm-checkout-status aria-live="polite"></p></section>' + orderSummaryBlock(totals, cart, true) + '<section class="cm-cart-trust"><div>' + svg('shield') + '<b>256-bit SSL</b><span>ile güvenli alışveriş</span></div><div>' + svg('truck') + '<b>7/24 Müşteri Desteği</b><span>destek@cosmoskin.com</span></div><div>' + svg('leaf') + '<b>Kolay iade</b><span>14 gün içinde iade</span></div></section><div class="cm-checkout-sticky"><div><small>Toplam</small><strong>' + formatPrice(totals.total) + '</strong></div><button class="cm-btn cm-btn--primary" type="submit" ' + (!cart.length ? 'disabled' : '') + '>Ödemeye Geç ' + svg('chevron') + '</button></div></form></div>';
  }

  function checkoutPaymentPage() {
    var cart = getCart();
    var totals = cartTotals();
    var draft = readCheckoutDraft();
    return '<div class="cm-mobile-page cm-mobile-checkout cm-mobile-checkout--payment">' + header({ promo: false, back: true, checkout: true }) + checkoutStepHtml('payment') + '<form class="cm-checkout-form" data-cm-checkout-form novalidate>' + hiddenCheckoutFields(draft) + '<input type="hidden" name="invoice_type" value="individual"><section class="cm-checkout-card cm-payment-card"><div class="cm-checkout-card__head"><div><strong>Kart ile Ödeme</strong></div><span>' + svg('lock') + '256-bit SSL ile korunur</span></div><div class="cm-payment-provider"><strong>iyzico güvenli ödeme</strong><span>Kart bilgileriniz mevcut ödeme sağlayıcısının güvenli akışında işlenir. Test veya sağlayıcı başarısı simüle edilmez.</span></div><div class="cm-provider-placeholder" role="note"><div><b>Kart bilgileri bu sayfada toplanmaz.</b><span>Siparişi tamamladığında mevcut iyzico güvenli ödeme akışı açılır; kart numarası, CVV ve banka doğrulaması sağlayıcı tarafında işlenir.</span></div></div></section><section class="cm-checkout-card"><h2>Fatura Bilgileri</h2><div class="cm-segmented"><button type="button" class="is-active" data-cm-invoice="individual">Bireysel</button><button type="button" data-cm-invoice="company">Kurumsal</button></div></section><section class="cm-checkout-card cm-legal-card"><h2>Güvenli Alışveriş</h2><p>Tüm işlemleriniz 256-bit SSL sertifikası ile korunmaktadır.</p><label><input name="kvkk_acknowledged" type="checkbox" required><span>KVKK Aydınlatma Metni’ni okudum, anladım.</span>' + svg('chevron') + '</label><label><input name="distance_sales_accepted" type="checkbox" required><span>Mesafeli Satış Sözleşmesi’ni okudum, onaylıyorum.</span>' + svg('chevron') + '</label><label><input name="preliminary_information_accepted" type="checkbox" required><span>Ön Bilgilendirme Formu’nu okudum, onaylıyorum.</span>' + svg('chevron') + '</label><label><input name="marketing_email_opt_in" type="checkbox"><span>Ticari elektronik ileti almak istiyorum.</span>' + svg('chevron') + '</label><p class="cm-checkout-status" data-cm-checkout-status aria-live="polite"></p></section><section class="cm-checkout-summary"><button type="button" data-cm-summary-toggle><span>Sipariş Özeti</span><b>' + formatPrice(totals.total) + '</b>' + svg('chevron') + '</button><div class="cm-checkout-summary__detail">' + compactCheckoutItems(cart) + '<div><span>Ara Toplam</span><b>' + formatPrice(totals.subtotal) + '</b></div><div><span>Kargo</span><b>' + (totals.shipping ? formatPrice(totals.shipping) : 'Ücretsiz') + '</b></div><div class="is-total"><span>Toplam</span><b>' + formatPrice(totals.total) + '</b></div></div></section><div class="cm-checkout-sticky"><div><small>Ödenecek Tutar</small><strong>' + formatPrice(totals.total) + '</strong></div><button class="cm-btn cm-btn--primary" type="submit" ' + (!cart.length ? 'disabled' : '') + '>Siparişi Tamamla ' + svg('chevron') + '</button></div></form></div>';
  }

  function renderMobileReviews(root) {
    root = root || document;
    var host = root.querySelector('[data-cm-mobile-reviews]');
    if (!host || host.dataset.loaded === 'true') return;
    var slug = host.dataset.productSlug || extractSlug(window.location.pathname);
    if (!slug) return;
    host.dataset.loaded = 'true';
    function stars(value) {
      var safe = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
      return '<span class="cm-stars" aria-label="' + safe + ' yıldız">' + '★★★★★'.slice(0, safe) + '☆☆☆☆☆'.slice(0, 5 - safe) + '</span>';
    }
    function dateText(value) {
      try { return value ? new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value)) : ''; } catch (e) { return ''; }
    }
    function initials(name) { return String(name || 'Müşteri').split(/\s+/).map(function(part){ return part.charAt(0); }).join('').slice(0,2).toUpperCase(); }
    function paintEmpty(message) {
      host.innerHTML = '<div class="cm-section-head"><div><h2>Müşteri Yorumları</h2></div><a class="cm-see-all" href="#reviewsSection">Tümünü Gör ' + svg('chevron') + '</a></div><div class="cm-review-empty">' + escapeHtml(message || 'Bu ürün için henüz yorum bulunmuyor.') + '</div>';
      var rating = root.querySelector('[data-cm-pdp-rating]');
      var count = root.querySelector('[data-cm-pdp-review-count]');
      if (rating) rating.textContent = 'Henüz değerlendirme yok';
      if (count) count.textContent = 'İlk yorumu satın aldıktan sonra yazabilirsin';
    }
    if (location.protocol === 'file:') { paintEmpty('Yorumlar canlı API ile yayın ortamında yüklenir.'); return; }
    fetch(((window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.apiBase) || '/api').replace(/\/$/, '') + '/reviews?product_slug=' + encodeURIComponent(slug))
      .then(function (res) { return res.json().then(function (data) { if (!res.ok) throw new Error(data.error || 'Yorumlar yüklenemedi.'); return data; }); })
      .then(function (data) {
        var list = Array.isArray(data.reviews) ? data.reviews : [];
        var summary = data.summary || {};
        var countValue = Number(summary.approved_count != null ? summary.approved_count : list.length);
        var avg = countValue ? Number(summary.avg_rating || (list.reduce(function (sum, item) { return sum + Number(item.rating || 0); }, 0) / Math.max(1, list.length))) : 0;
        var rating = root.querySelector('[data-cm-pdp-rating]');
        var count = root.querySelector('[data-cm-pdp-review-count]');
        if (rating) rating.textContent = countValue ? avg.toFixed(1) + ' / 5' : 'Henüz değerlendirme yok';
        if (count) count.textContent = countValue ? countValue.toLocaleString('tr-TR') + ' değerlendirme' : 'İlk yorumu satın aldıktan sonra yazabilirsin';
        if (!list.length) { paintEmpty('Bu ürün için henüz yorum bulunmuyor.'); return; }
        host.innerHTML = '<div class="cm-section-head"><div><h2>Müşteri Yorumları</h2></div><a class="cm-see-all" href="#reviewsSection">Tümünü Gör ' + svg('chevron') + '</a></div><div class="cm-review-summary"><strong>' + avg.toFixed(1) + '</strong>' + stars(avg) + '<span>(' + countValue.toLocaleString('tr-TR') + ')</span></div><div class="cm-review-filters"><button class="is-active">Tümü (' + countValue.toLocaleString('tr-TR') + ')</button><button>5★</button><button>4★</button><button>3★</button><button>2★</button><button>1★</button></div><div class="cm-review-list">' + list.slice(0, 3).map(function (r) {
          var name = r.user_display_name || (r.user && r.user.name) || 'Doğrulanmış Müşteri';
          return '<article class="cm-review-card"><div class="cm-review-card__head"><span class="cm-review-avatar">' + escapeHtml(initials(name)) + '</span><div><strong>' + escapeHtml(name) + '</strong>' + stars(r.rating) + '</div><time>' + escapeHtml(dateText(r.created_at)) + '</time></div>' + (r.verified_purchase !== false ? '<small class="cm-verified">' + svg('shield') + 'Doğrulanmış Alışveriş</small>' : '') + '<p>' + escapeHtml(r.body || r.title || '') + '</p></article>';
        }).join('') + '</div>';
      })
      .catch(function () { paintEmpty('Yorumlar şu anda yüklenemedi. Lütfen daha sonra tekrar dene.'); });
  }

  function routinePage() {
    return '<div class="cm-mobile-page cm-mobile-routine">' + header({ promo: false }) + '<section class="cm-routine-title"><div class="cm-routine-title__top"><span>AKILLI RUTİN SEÇİMİ</span><span>' + (routineState.period === 'day' ? 'Gündüz' : 'Akşam') + '</span></div><h1>Cildin için en doğru rutini birlikte oluşturalım.</h1><p>Hedeflerini seç, cilt tipini ekle. Önerilen ürünler gerçek COSMOSKIN ürün verisiyle güncellenir.</p></section>' + routineBuilder(false) + bottomNav('list') + '</div>';
  }

  function cartPage() {
    return '<div class="cm-mobile-page cm-mobile-cart">' + header({ promo: false, back: false }) + '<section class="cm-cart-title"><h1>Sepetim</h1><p data-cm-cart-title-count></p></section><div data-cm-cart-content>' + cartContentHtml() + '</div>' + bottomNav('home') + '</div>';
  }

  function cartContentHtml() {
    var cart = getCart();
    var totals = cartTotals();
    if (!cart.length) return '<div class="cm-empty-state"><strong>Sepetin şu an boş.</strong><span>Seçtiğin ürünler burada görünecek.</span><a class="cm-btn cm-btn--primary" href="/allproducts.html">Alışverişe Başla</a></div>';
    return '<div class="cm-cart-list">' + cart.map(function (item) { return '<article class="cm-cart-row" data-product-id="' + escapeHtml(item.slug) + '" data-product-slug="' + escapeHtml(item.slug) + '"><a class="cm-cart-row__img" href="' + escapeHtml(item.url) + '"><img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '"></a><div class="cm-cart-row__body"><div class="cm-cart-row__top"><div><small>' + escapeHtml(item.brand) + '</small><h2>' + escapeHtml(item.name) + '</h2><span>' + escapeHtml(item.volume || '') + '</span></div><button class="favorite-btn cm-cart-fav" type="button" aria-label="Favorilere ekle" aria-pressed="false" data-favorite-id="' + escapeHtml(item.slug) + '" data-id="' + escapeHtml(item.slug) + '" data-slug="' + escapeHtml(item.slug) + '" data-name="' + escapeHtml(item.name) + '" data-brand="' + escapeHtml(item.brand) + '" data-price="' + escapeHtml(item.price) + '" data-image="' + escapeHtml(item.image) + '" data-url="' + escapeHtml(item.url) + '">' + svg('heart') + '</button></div><b>' + formatPrice(item.price * item.qty) + '</b><div class="cm-cart-controls"><div class="cm-stepper"><button type="button" data-cm-cart-dec="' + escapeHtml(item.slug) + '" aria-label="Adedi azalt">−</button><span>' + item.qty + '</span><button type="button" data-cm-cart-inc="' + escapeHtml(item.slug) + '" aria-label="Adedi artır">+</button></div><button class="cm-trash" type="button" data-cm-cart-remove="' + escapeHtml(item.slug) + '" aria-label="Ürünü sepetten çıkar">' + svg('trash') + '</button></div><div class="cm-stock-line" data-cm-stock-line data-product-slug="' + escapeHtml(item.slug) + '" aria-live="polite">Stok kontrol ediliyor.</div></div></article>'; }).join('') + '</div><button class="cm-coupon-row" type="button">' + svg('tag') + '<span><strong>İndirim kodun var mı?</strong><small>Kupon kodunu ödeme adımında girebilirsin.</small></span>' + svg('chevron') + '</button><section class="cm-free-shipping"><div>' + svg('truck') + '<strong>' + (totals.subtotal >= 2500 ? 'Ücretsiz kargo kazandın.' : 'Ücretsiz kargo için ' + formatPrice(2500 - totals.subtotal) + ' daha harca!') + '</strong></div><span><i style="width:' + Math.min(100, Math.round((totals.subtotal / 2500) * 100)) + '%"></i></span><p>' + formatPrice(Math.min(totals.subtotal, 2500)) + ' / ' + formatPrice(2500) + '</p></section>' + orderSummaryBlock(totals, null, false) + '<div class="cm-cart-sticky"><div><small>Toplam</small><strong>' + formatPrice(totals.total) + '</strong></div><button class="cm-btn cm-btn--primary" type="button" data-cm-proceed-checkout>Ödemeye Geç</button></div>';
  }

  function emptyState(title, body) {
    return '<div class="cm-empty-state"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(body) + '</span></div>';
  }

  function activeAccountTab() {
    var path = window.location.pathname;
    var params = new URLSearchParams(window.location.search);
    var tab = params.get('tab') || (window.location.hash || '').replace('#', '');
    if (/\/account\/orders\.html$/.test(path)) return 'orders';
    if (/\/account\/returns\.html$/.test(path)) return 'returns';
    if (tab === 'orders') return 'orders';
    if (tab === 'favorites') return 'favorites';
    if (tab === 'cart') return 'cart';
    if (tab === 'help') return 'help';
    if (tab === 'returns') return 'returns';
    return 'overview';
  }

  function accountPage() {
    var tab = activeAccountTab();
    return '<div class="cm-mobile-page cm-mobile-account">' + header({ promo: false }) + '<section class="cm-account-title"><h1>' + (tab === 'orders' ? 'Siparişlerim' : tab === 'favorites' ? 'Favorilerim' : 'Hesabım') + '</h1></section><div class="cm-account-content" aria-live="polite" aria-label="Hesap içeriği">' + accountContent(tab) + '</div>' + bottomNav(tab === 'favorites' ? 'fav' : 'account') + '</div>';
  }

  function accountContent(tab) {
    if (tab === 'favorites') {
      var favs = favoriteList().map(function (f) { return normalizeProduct(f) || getProductBySlug(f.slug || f.id); }).filter(Boolean);
      return favs.length ? '<div class="cm-product-grid cm-product-grid--compact">' + favs.map(productCard).join('') + '</div>' : emptyState('Henüz favori ürün yok.', 'Ürün kartlarındaki kalp ikonuyla favorilerine ekleyebilirsin.');
    }
    if (tab === 'cart') return cartContentHtml();
    if (tab === 'orders') {
      var ordersOnly = getStoredOrders();
      return '<section class="cm-account-orders"><div class="cm-section-head"><h2>Son Siparişlerim</h2><a class="cm-see-all" href="/account/profile.html?tab=orders">Tümünü Gör ' + svg('chevron') + '</a></div>' + (ordersOnly.length ? ordersOnly.slice(0,5).map(orderCard).join('') : '<div class="cm-empty-state cm-empty-state--inline"><strong>Siparişiniz henüz bulunmuyor.</strong><span>Sipariş verdiğinizde kargo ve fatura işlemleri burada görünecek.</span></div>') + '</section>';
    }
    if (tab === 'help') {
      return '<section class="cm-help-card"><strong>Yardıma mı ihtiyacınız var?</strong><span>Destek ekibimizle iletişime geçin.</span><a href="/contact.html">Destek & İletişim ' + svg('chevron') + '</a></section>';
    }
    if (tab === 'returns') {
      return '<section class="cm-account-card"><h2>İade ve Teslimat</h2><p>Kullanılmamış ürünlerde teslimattan itibaren 14 gün içinde iade talebi oluşturabilirsin.</p><a class="cm-btn" href="/iade-degisim.html">İade Koşullarını Gör</a></section>';
    }
    var orders = getStoredOrders();
    var profileName = 'COSMOSKIN Üyesi';
    var profileEmail = '';
    try { var user = JSON.parse(localStorage.getItem('cosmoskin_user') || '{}'); profileName = user.name || user.full_name || profileName; profileEmail = user.email || ''; } catch(e) {}
    return '<section class="cm-profile-card"><div class="cm-avatar">' + escapeHtml(profileName.split(/\s+/).map(function(x){return x.charAt(0);}).join('').slice(0,2) || 'CS') + '</div><div><strong>' + escapeHtml(profileName) + '</strong><span>' + escapeHtml(profileEmail || 'Hesap bilgilerinizi yönetin') + '</span></div><a href="/account/profile.html?tab=profile">Profili Düzenle ' + svg('chevron') + '</a></section><section><h2 class="cm-subtitle">Hızlı İşlemler</h2><div class="cm-quick-actions"><a href="/account/profile.html?tab=orders">' + svg('cube') + '<span>Siparişlerim</span></a><a href="/account/profile.html?tab=addresses">' + svg('tag') + '<span>Adreslerim</span></a><a href="/account/profile.html?tab=favorites">' + svg('heart') + '<span>Favorilerim</span></a><button type="button" data-cm-logout>' + svg('chevron') + '<span>Çıkış</span></button></div></section><section class="cm-account-orders"><div class="cm-section-head"><h2>Son Siparişlerim</h2><a class="cm-see-all" href="/account/profile.html?tab=orders">Tümünü Gör ' + svg('chevron') + '</a></div>' + (orders.length ? orders.slice(0,2).map(orderCard).join('') : '<div class="cm-empty-state cm-empty-state--inline"><strong>Siparişiniz henüz bulunmuyor.</strong><span>Sipariş verdiğinizde durum kartları burada görünür.</span></div>') + '</section><section class="cm-help-card"><strong>Yardıma mı ihtiyacınız var?</strong><span>Destek ekibimizle iletişime geçin.</span><a href="/contact.html">Destek & İletişim ' + svg('chevron') + '</a></section>';
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
    function card(icon, title, href) { return '<a class="cm-menu-card" href="' + href + '">' + svg(icon) + '<span>' + title + '</span>' + svg('chevron') + '</a>'; }
    function link(icon, title, href) { return '<a class="cm-menu-link" href="' + href + '">' + svg(icon) + '<span>' + title + '</span>' + svg('chevron') + '</a>'; }
    var brandLinks = ['cosrx','beauty-of-joseon','anua','torriden','round-lab','skin1004'].map(function (b) { return '<a href="' + brandHref(b) + '"><img src="/assets/img/brands/' + b + '.svg" alt="' + escapeHtml(brandNameFromSlug(b)) + '"></a>'; }).join('');
    return '<div class="cm-menu-dim" data-cm-menu-close aria-hidden="true"></div><aside class="cm-menu-panel" id="cm-mobile-menu" role="dialog" aria-modal="true" aria-label="COSMOSKIN mobil menü" aria-hidden="true"><div class="cm-menu-head"><div class="cm-menu-logo">COSMOSKIN</div><button class="cm-menu-close" type="button" data-cm-menu-close aria-label="Menüyü kapat">' + svg('close') + '</button></div><a class="cm-menu-profile" href="/account/profile.html"><span>' + svg('user') + '</span><div><small>Merhaba</small><strong>Hesabımı Görüntüle</strong></div>' + svg('chevron') + '</a>' + searchBar('cm-menu-search') + '<nav class="cm-menu-main" aria-label="Genel navigasyon">' + link('home','Ana Sayfa','/index.html') + link('grid','Kategoriler','/allproducts.html') + link('sparkle','Keşfet','/collections/routine.html') + link('heart','Favorilerim','/account/profile.html?tab=favorites') + link('bag','Siparişlerim','/account/profile.html?tab=orders') + link('tag','Kampanyalar','/allproducts.html') + link('star','Yeni Ürünler','/allproducts.html') + link('cube','Çok Satanlar','/index.html#bestsellers') + link('leaf','Cilt Analizi','/collections/routine.html') + '</nav><section class="cm-menu-section"><h3>Kategoriler</h3><div class="cm-menu-card-grid">' + card('drop','Temizleyiciler','/collections/cleanse.html') + card('bottle','Tonikler','/collections/hydrate.html') + card('sparkle','Serumlar','/collections/treat.html') + card('cube','Nemlendiriciler','/collections/care.html') + card('sun','Güneş Koruyucular','/collections/protect.html') + card('leaf','Maske','/collections/masks.html') + '</div></section><section class="cm-menu-section"><div class="cm-menu-section__head"><h3>Markalar</h3><a href="/allproducts.html">Tümünü Gör ' + svg('chevron') + '</a></div><div class="cm-menu-brand-grid">' + brandLinks + '</div></section><section class="cm-menu-trust"><div>' + svg('lock') + '<b>Güvenli ödeme</b><span>3D Secure koruması</span></div><div>' + svg('truck') + '<b>Hızlı kargo</b><span>1–3 iş günü</span></div><div>' + svg('shield') + '<b>Kolay iade</b><span>14 gün içinde</span></div></section><nav class="cm-service-links" aria-label="Destek bağlantıları">' + link('shield','Destek & İletişim','/contact.html') + link('user','Hakkımızda','/contact.html') + '</nav></aside>';
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
    document.documentElement.classList.add('cm-menu-open');
    menuFocusTrapped = true;
    var panel = document.querySelector('.cm-menu-panel');
    var button = document.querySelector('[data-cm-menu]');
    if (panel) panel.setAttribute('aria-hidden', 'false');
    if (button) button.setAttribute('aria-expanded', 'true');
    var closeBtn = panel && panel.querySelector('[data-cm-menu-close]');
    if (closeBtn) window.setTimeout(function () { closeBtn.focus(); }, 80);
  }

  function closeMenu() {
    document.body.classList.remove('cm-menu-open');
    document.documentElement.classList.remove('cm-menu-open');
    menuFocusTrapped = false;
    var panel = document.querySelector('.cm-menu-panel');
    var button = document.querySelector('[data-cm-menu]');
    if (panel) panel.setAttribute('aria-hidden', 'true');
    if (button) { button.setAttribute('aria-expanded', 'false'); window.setTimeout(function () { button.focus(); }, 50); }
  }

  function renderListingGrid() {
    var grid = document.querySelector('[data-cm-listing-grid]');
    var count = document.querySelector('[data-cm-product-count]');
    if (!grid) return;
    var products = filteredProducts();
    grid.innerHTML = products.length ? products.map(productCard).join('') : emptyState('Eşleşen ürün bulunamadı.', 'Filtreleri temizleyerek tekrar deneyebilirsin.');
    if (count) count.textContent = products.length;
    refreshInjectedCommerce(grid);
    refreshMobileInventory(grid);
  }

  function renderCartMobile() {
    var content = document.querySelector('[data-cm-cart-content]');
    var title = document.querySelector('[data-cm-cart-title-count]');
    var totals = cartTotals();
    if (content) content.innerHTML = cartContentHtml();
    if (title) title.textContent = totals.count ? '(' + totals.count + ' ürün)' : '';
    updateBadges();
    refreshMobileInventory(content || document);
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
    if (type === 'checkout') return checkoutPage();
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
    if (type === 'listing') renderListingGrid();
    refreshInjectedCommerce(root);
    renderMobileReviews(root);
    refreshMobileInventory(root);
  }

  function unmount() {
    var root = document.getElementById(ROOT_ID);
    var drawer = document.getElementById(DRAWER_ID);
    var sheet = document.getElementById(SHEET_ID);
    if (root) root.remove();
    if (drawer) drawer.remove();
    if (sheet) sheet.remove();
    document.body.classList.remove('cm-mobile-active', 'cm-menu-open', 'cm-sheet-open');
    document.documentElement.classList.remove('cm-mobile-active', 'cm-menu-open');
    menuFocusTrapped = false;
    mounted = false;
  }

  function remount() {
    if (!isMobile()) { if (mounted) unmount(); return; }
    var type = getPageType();
    if (!type) { if (mounted) unmount(); return; }
    mount();
  }


  function submitMobileCheckout(form) {
    var status = form.querySelector('[data-cm-checkout-status]');
    var setStatus = function (message) { if (status) status.textContent = message || ''; };
    var invalid = Array.prototype.slice.call(form.querySelectorAll('input, textarea, select')).find(function (field) { return !field.checkValidity(); });
    if (invalid) {
      invalid.focus();
      setStatus('Lütfen teslimat bilgilerini ve zorunlu sözleşme onaylarını tamamlayın.');
      return;
    }
    var cart = getCart();
    if (!cart.length) { setStatus('Ödemeye geçebilmek için sepetine en az bir ürün eklemelisin.'); return; }
    var proceed = function () {
      var nativeForm = document.getElementById('checkoutForm');
      if (!nativeForm) { setStatus('Ödeme formu bulunamadı. Lütfen sayfayı yenileyin.'); return; }
      var data = new FormData(form);
      var nativeFields = Array.prototype.slice.call(nativeForm.elements || []);
      var mobileFields = Array.prototype.slice.call(form.elements || []);
      function fieldByName(fields, name) {
        return fields.find(function (field) { return field && field.name === name; });
      }
      data.forEach(function (value, key) {
        var target = fieldByName(nativeFields, key);
        if (!target) return;
        if (target.type === 'checkbox') target.checked = value === 'on' || value === 'true' || value === '1';
        else target.value = value;
      });
      Array.prototype.slice.call(nativeForm.querySelectorAll('input[type="checkbox"][required]')).forEach(function (box) {
        var source = fieldByName(mobileFields, box.name);
        if (source) box.checked = !!source.checked;
      });
      setStatus('Güvenli ödeme hazırlanıyor...');
      var root = document.getElementById(ROOT_ID);
      if (root) root.style.display = 'none';
      document.documentElement.classList.remove('cm-mobile-active');
      document.body.classList.remove('cm-mobile-active');
      mounted = false;
      window.setTimeout(function () {
        if (nativeForm.requestSubmit) nativeForm.requestSubmit();
        else document.getElementById('checkoutSubmit')?.click();
      }, 80);
    };
    if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.checkItems === 'function') {
      setStatus('Stok durumu kontrol ediliyor...');
      window.COSMOSKIN_STOCK.checkItems(cart.map(function (item) { return { product_slug: item.slug || item.id, quantity: item.qty || 1 }; }))
        .then(function (result) {
          var blocked = (result.items || []).find(function (item) { return item && item.can_purchase === false; });
          if (blocked) { setStatus(blocked.message || 'Sepetindeki bazı ürünlerin stoğu değişti. Lütfen sepetini kontrol et.'); refreshMobileInventory(document.getElementById(ROOT_ID) || document); return; }
          proceed();
        })
        .catch(function () { setStatus('Stok kontrolü tamamlanamadı. Ödeme öncesi lütfen tekrar dene.'); refreshMobileInventory(document.getElementById(ROOT_ID) || document); });
    } else {
      proceed();
    }
  }

  function bindDelegates() {
    if (delegatesBound) return;
    delegatesBound = true;
    document.addEventListener('click', function (event) {
      var favButton = event.target && event.target.closest && event.target.closest('.favorite-btn');
      if (favButton && favButton.closest('#' + ROOT_ID)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        fallbackToggleFavorite(favButton);
      }
    }, true);

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (target.closest('[data-cm-menu]')) { event.preventDefault(); openMenu(); return; }
      if (target.closest('[data-cm-menu-close]')) { event.preventDefault(); closeMenu(); return; }
      if (target.closest('.cm-menu-panel a')) { closeMenu(); }
      if (target.closest('[data-cm-back]')) { event.preventDefault(); if (history.length > 1) history.back(); else window.location.href = '/allproducts.html'; return; }
      var invoice = target.closest('[data-cm-invoice]');
      if (invoice) {
        var form = invoice.closest('form');
        Array.prototype.slice.call(invoice.parentNode.querySelectorAll('[data-cm-invoice]')).forEach(function(btn){ btn.classList.toggle('is-active', btn === invoice); });
        var hidden = form && form.querySelector('input[name="invoice_type"]');
        if (hidden) hidden.value = invoice.getAttribute('data-cm-invoice') || 'individual';
        return;
      }
      var add = target.closest('[data-cm-add-cart]');
      if (add) {
        event.preventDefault();
        if (add.disabled || add.getAttribute('aria-disabled') === 'true') { toast('Bu ürün şu anda stokta yok.'); return; }
        var product = getProductBySlug(add.getAttribute('data-cm-add-cart')) || getCurrentProduct();
        var qty = add.getAttribute('data-cm-qty') === 'pdp' ? currentPdpQty : 1;
        var payload = { id: product.slug, slug: product.slug, product_slug: product.slug, name: product.name, brand: product.brand, price: product.price, image: product.image, url: product.url, qty: qty, quantity: qty };
        var finalizeAdd = function () { addItemsToCart([payload]); refreshMobileInventory(document.getElementById(ROOT_ID) || document); };
        if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.validateAdd === 'function') {
          add.disabled = true;
          add.classList.add('is-loading');
          window.COSMOSKIN_STOCK.validateAdd(payload).then(function (ok) { if (ok) finalizeAdd(); else applyMobileInventoryState(document.getElementById(ROOT_ID) || document); }).catch(function () { toast('Stok kontrolü tamamlanamadı. Lütfen tekrar dene.'); applyMobileInventoryState(document.getElementById(ROOT_ID) || document); }).finally(function () { add.classList.remove('is-loading'); applyMobileInventoryState(document.getElementById(ROOT_ID) || document); });
        } else {
          finalizeAdd();
        }
        return;
      }
      if (target.closest('[data-cm-pdp-inc]')) { currentPdpQty += 1; var q1 = document.querySelector('[data-cm-pdp-qty]'); if (q1) q1.textContent = currentPdpQty; return; }
      if (target.closest('[data-cm-pdp-dec]')) { currentPdpQty = Math.max(1, currentPdpQty - 1); var q2 = document.querySelector('[data-cm-pdp-qty]'); if (q2) q2.textContent = currentPdpQty; return; }
      var inc = target.closest('[data-cm-cart-inc]'); if (inc) { updateCartQuantity(inc.getAttribute('data-cm-cart-inc'), 1); return; }
      var dec = target.closest('[data-cm-cart-dec]'); if (dec) { updateCartQuantity(dec.getAttribute('data-cm-cart-dec'), -1); return; }
      var rem = target.closest('[data-cm-cart-remove]'); if (rem) { removeCartItem(rem.getAttribute('data-cm-cart-remove')); return; }
      if (target.closest('[data-cm-reveal-native-checkout]')) { event.preventDefault(); var root = document.getElementById(ROOT_ID); if (root) root.style.display = 'none'; document.documentElement.classList.remove('cm-mobile-active'); document.body.classList.remove('cm-mobile-active'); mounted = false; document.getElementById('checkoutForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (target.closest('[data-cm-summary-toggle]')) { event.preventDefault(); var detail = document.querySelector('.cm-checkout-summary__detail'); if (detail) detail.hidden = !detail.hidden; return; }
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
      var fav = target.closest('.favorite-btn'); if (fav && fav.closest('#' + ROOT_ID)) { event.preventDefault(); event.stopImmediatePropagation(); fallbackToggleFavorite(fav); return; }
      if (target.closest('[data-cm-share]')) { if (navigator.share) navigator.share({ title: document.title, url: window.location.href }).catch(function () {}); else { navigator.clipboard && navigator.clipboard.writeText(window.location.href); toast('Bağlantı kopyalandı.'); } }
      if (target.closest('[data-cm-logout]')) { try { localStorage.removeItem('sb-auth-token'); sessionStorage.clear(); } catch (e) {} toast('Çıkış işlemi başlatıldı.'); window.setTimeout(function () { window.location.href = '/index.html'; }, 350); }
      var accountTabLink = target.closest('[data-cm-account-tab]');
      if (accountTabLink && getPageType() === 'account') {
        event.preventDefault();
        var newTab = accountTabLink.getAttribute('data-cm-account-tab');
        var tabUrl = newTab === 'overview' ? '/account/profile.html' : '/account/profile.html?tab=' + newTab;
        history.pushState({ cmTab: newTab }, '', tabUrl);
        remount();
        return;
      }
      if (target.closest('[data-cm-proceed-checkout]')) {
        event.preventDefault();
        window.location.href = '/checkout.html';
        return;
      }
    });
    document.addEventListener('submit', function (event) {
      if (event.target.matches('[data-cm-coupon-form]')) { event.preventDefault(); var status = event.target.querySelector('[data-cm-coupon-status]'); var input = event.target.querySelector('input[name="coupon"]'); if (status) status.textContent = input && input.value ? 'Kupon ödeme adımında doğrulanacak.' : 'Kupon kodu girilmedi.'; }
      if (event.target.matches('[data-cm-delivery-form]')) {
        event.preventDefault();
        var deliveryForm = event.target;
        var deliveryStatus = deliveryForm.querySelector('[data-cm-checkout-status]');
        var invalid = Array.prototype.slice.call(deliveryForm.querySelectorAll('input, textarea, select')).find(function (field) { return !field.checkValidity(); });
        if (invalid) { invalid.focus(); if (deliveryStatus) deliveryStatus.textContent = 'Teslimat ve iletişim bilgilerini tamamlayın.'; return; }
        var data = {};
        new FormData(deliveryForm).forEach(function(value, key){ data[key] = value; });
        writeCheckoutDraft(data);
        window.location.href = '/checkout.html?step=payment';
        return;
      }
      if (event.target.matches('[data-cm-checkout-form]')) {
        event.preventDefault();
        submitMobileCheckout(event.target);
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { closeMenu(); closeSheet(); return; }
      if (event.key === 'Tab' && menuFocusTrapped) {
        var panel = document.querySelector('.cm-menu-panel');
        if (!panel) return;
        var focusable = Array.prototype.slice.call(panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function (el) { return el.offsetParent !== null; });
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey) { if (document.activeElement === first) { event.preventDefault(); last.focus(); } }
        else { if (document.activeElement === last) { event.preventDefault(); first.focus(); } }
      }
    });
    window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(remount, 120); });
    window.addEventListener('orientationchange', function () { setTimeout(remount, 180); });
    window.addEventListener('hashchange', function () { if (getPageType() === 'account') remount(); });
    window.addEventListener('popstate', function () { if (getPageType() === 'account') remount(); });
    window.addEventListener('cosmoskin:cart-updated', function () { updateBadges(); var type = getPageType(); if (type === 'cart') renderCartMobile(); else if (type === 'checkout' && mounted) remount(); if (mounted) refreshMobileInventory(document.getElementById(ROOT_ID) || document); });
    window.addEventListener('cosmoskin:inventory-updated', function () { if (mounted) applyMobileInventoryState(document.getElementById(ROOT_ID) || document); });
    window.addEventListener('storage', function (event) { if (event.key === STORAGE_CART || event.key === STORAGE_FAVORITES) { updateBadges(); syncFallbackFavoriteButtons(document); if (event.key === STORAGE_CART && getPageType() === 'cart') renderCartMobile(); else if (event.key === STORAGE_CART && getPageType() === 'checkout' && mounted) remount(); } });
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
