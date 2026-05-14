(function () {
  'use strict';

  var BREAKPOINT = 768;
  var ROOT_ID = 'cm-mobile-redesign-root';
  var SHEET_ID = 'cm-mobile-sheet-root';
  var STORAGE_CART = 'cosmoskin_cart';
  var STORAGE_FAVORITES = 'cosmoskin_favorites';
  var STORAGE_CHECKOUT = 'cosmoskin_checkout_mobile_draft';
  var STORAGE_ROUTINE = 'cosmoskin_saved_routine';
  var FALLBACK_IMG = '/assets/img/products/anua/anua-heartleaf-pore-control-cleansing-oil-card.webp';
  var mounted = false;
  var listenersBound = false;
  var resizeTimer = null;
  var currentPdpQty = 1;
  var listingState = { sort: 'featured', category: '', brand: '', stock: '', skin: '', concern: '', price: '' };
  var routineState = { skin: 'Karma', goal: '', period: 'day' };
  var accountSummaryRequested = false;

  var CATEGORY_ROUTES = [
    { key: 'cleanse', title: 'Temizleyiciler', subtitle: 'Cildi arındıran nazik temizleme seçkisi.', category: 'Temizleyiciler', href: '/collections/cleanse.html', icon: 'drop' },
    { key: 'hydrate', title: 'Tonikler', subtitle: 'Cildi sonraki adıma hazırlayan tonik ve essence ürünleri.', category: 'Tonik & Essence', href: '/collections/hydrate.html', icon: 'bottle' },
    { key: 'treat', title: 'Serumlar', subtitle: 'Hedef bakım için serum ve ampuller.', category: 'Serum & Ampul', href: '/collections/treat.html', icon: 'sparkle' },
    { key: 'care', title: 'Nemlendiriciler', subtitle: 'Bariyer ve konfor odaklı kremler.', category: 'Nemlendiriciler', href: '/collections/care.html', icon: 'cube' },
    { key: 'protect', title: 'Güneş Koruyucular', subtitle: 'Günlük kullanım için SPF ürünleri.', category: 'Güneş Koruyucular', href: '/collections/protect.html', icon: 'sun' },
    { key: 'masks', title: 'Maskeler', subtitle: 'Haftalık destek ve sheet mask seçkisi.', category: 'Maskeler', href: '/collections/masks.html', icon: 'leaf' }
  ];

  var GOAL_ROUTES = [
    { title: 'Nem', href: '/collections/hydration.html', icon: 'drop' },
    { title: 'Bariyer', href: '/collections/barrier.html', icon: 'shield' },
    { title: 'Işıltı', href: '/collections/glow.html', icon: 'sparkle' },
    { title: 'Hassasiyet', href: '/collections/sensitivity.html', icon: 'leaf' }
  ];

  var BRAND_SLUGS = ['cosrx', 'anua', 'beauty-of-joseon', 'round-lab', 'skin1004', 'torriden', 'some-by-mi', 'thank-you-farmer'];
  var ALL_BRAND_SLUGS = ['anua', 'beauty-of-joseon', 'by-wishtrend', 'cosrx', 'dr-jart', 'goodal', 'im-from', 'innisfree', 'isntree', 'laneige', 'medicube', 'mediheal', 'round-lab', 'skin1004', 'some-by-mi', 'thank-you-farmer', 'torriden'];

  var COLLECTION_META = {
    cleanse: { title: 'Temizleyiciler', category: 'Temizleyiciler', keywords: ['temizleyici', 'cleanser', 'cleansing', 'oil', 'foam'] },
    hydrate: { title: 'Tonikler', category: 'Tonik & Essence', keywords: ['tonik', 'toner', 'essence'] },
    treat: { title: 'Serumlar', category: 'Serum & Ampul', keywords: ['serum', 'ampul', 'ampoule'] },
    care: { title: 'Nemlendiriciler', category: 'Nemlendiriciler', keywords: ['cream', 'lotion', 'nemlendirici'] },
    protect: { title: 'Güneş Koruyucular', category: 'Güneş Koruyucular', keywords: ['spf', 'sun', 'güneş'] },
    masks: { title: 'Maskeler', category: 'Maskeler', keywords: ['mask', 'maske', 'patch'] },
    hydration: { title: 'Nem', goal: 'Nem', keywords: ['nem', 'hyaluronic', 'hyalüronik', 'water', 'moisture', 'hydration'] },
    barrier: { title: 'Bariyer Desteği', goal: 'Bariyer', keywords: ['bariyer', 'barrier', 'ceramide', 'seramid', 'cica', 'centella'] },
    glow: { title: 'Işıltı', goal: 'Işıltı', keywords: ['ışıltı', 'glow', 'vitamin', 'niacinamide', 'niasinamid', 'arbutin', 'pirinç'] },
    sensitivity: { title: 'Hassasiyet', goal: 'Hassasiyet', keywords: ['hassas', 'soothing', 'heartleaf', 'centella', 'cica', 'yatıştırıcı'] },
    blemish: { title: 'Akne & Denge', goal: 'Akne', keywords: ['akne', 'acne', 'pore', 'gözenek', 'sebum', 'bha', 'salisilik'] },
    'acne-balance': { title: 'Akne & Denge', goal: 'Akne', keywords: ['akne', 'acne', 'pore', 'gözenek', 'sebum', 'bha', 'salisilik'] },
    'pore-sebum': { title: 'Gözenek & Sebum', goal: 'Gözenek', keywords: ['pore', 'gözenek', 'sebum', 'bha', 'clay'] },
    routine: { title: 'Akıllı Rutin', goal: 'Rutin', keywords: [] }
  };

  function isMobile() {
    return window.matchMedia ? window.matchMedia('(max-width: ' + BREAKPOINT + 'px)').matches : window.innerWidth <= BREAKPOINT;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
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
    var productMatch = raw.match(/\/products\/([^.?#/]+)\.html/);
    if (productMatch) return productMatch[1];
    return raw.replace(/\.html(?:[?#].*)?$/, '').split('/').pop();
  }

  function formatPrice(value) {
    var amount = Number(value || 0);
    if (!Number.isFinite(amount)) amount = 0;
    if (typeof window.COSMOSKIN_FORMAT_PRICE === 'function') return window.COSMOSKIN_FORMAT_PRICE(amount);
    return amount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
  }

  function configNumber(key, fallback) {
    var cfg = window.COSMOSKIN_CONFIG || window.__COSMOSKIN_CFG || {};
    var value = Number(cfg[key]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  function freeShippingThreshold() {
    return configNumber('freeShippingThreshold', 2500);
  }

  function shippingFee() {
    return configNumber('shippingFee', 119);
  }

  function normalizeProduct(raw) {
    if (!raw) return null;
    var slug = extractSlug(raw.slug || raw.id || raw.url || raw.sku || '');
    if (!slug) return null;
    var price = Number(raw.price || raw.num || 0);
    var keywords = [];
    if (Array.isArray(raw.keywords)) keywords = keywords.concat(raw.keywords);
    if (Array.isArray(raw.search_terms)) keywords = keywords.concat(raw.search_terms);
    if (Array.isArray(raw.ingredients)) keywords = keywords.concat(raw.ingredients);
    if (Array.isArray(raw.activeIngredients)) keywords = keywords.concat(raw.activeIngredients);
    if (typeof raw.ingredients === 'string') keywords.push(raw.ingredients);
    if (typeof raw.description === 'string') keywords.push(raw.description);
    if (typeof raw.short_description === 'string') keywords.push(raw.short_description);
    if (Array.isArray(raw.concern)) keywords = keywords.concat(raw.concern);
    if (Array.isArray(raw.concernSlugs)) keywords = keywords.concat(raw.concernSlugs);
    return {
      id: slug,
      slug: slug,
      name: String(raw.name || raw.title || 'COSMOSKIN ürünü'),
      brand: String(raw.brand || 'COSMOSKIN'),
      brandSlug: raw.brandSlug || slugify(raw.brand || ''),
      category: String(raw.category || ''),
      categorySlug: raw.categorySlug || slugify(raw.category || ''),
      price: Number.isFinite(price) ? price : 0,
      volume: String(raw.volume || raw.size || ''),
      image: String(raw.image || raw.img || raw.imageUrl || FALLBACK_IMG),
      images: Array.isArray(raw.images) ? raw.images.filter(Boolean) : (Array.isArray(raw.gallery) ? raw.gallery.filter(Boolean) : []),
      url: String(raw.url || ('/products/' + slug + '.html')),
      keywords: keywords.join(' '),
      aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
      rating: Number(raw.rating || raw.average_rating || raw.avg_rating || 0),
      reviewCount: Number(raw.reviewCount || raw.review_count || raw.reviews_count || raw.review_total || 0),
      compareAtPrice: Number(raw.compareAtPrice || raw.compare_at_price || raw.old_price || raw.original_price || 0),
      createdAt: String(raw.createdAt || raw.created_at || raw.updated || '')
    };
  }

  function getProducts() {
    var source = Array.isArray(window.COSMOSKIN_PRODUCTS) ? window.COSMOSKIN_PRODUCTS : [];
    return source.map(normalizeProduct).filter(Boolean);
  }

  function getProductBySlug(slug) {
    slug = extractSlug(slug);
    if (!slug) return null;
    if (window.COSMOSKIN_PRODUCT_HELPERS && typeof window.COSMOSKIN_PRODUCT_HELPERS.getProductBySlug === 'function') {
      var hit = window.COSMOSKIN_PRODUCT_HELPERS.getProductBySlug(slug);
      if (hit) return normalizeProduct(hit);
    }
    return getProducts().find(function (p) {
      return p.slug === slug || extractSlug(p.url) === slug || p.aliases.map(extractSlug).indexOf(slug) !== -1;
    }) || null;
  }

  function getCurrentProduct() {
    var slug = extractSlug(location.pathname);
    return getProductBySlug(slug) || normalizeProduct({ slug: slug, name: document.title.replace(/\s+\|\s+.*$/, ''), brand: 'COSMOSKIN', image: FALLBACK_IMG, url: location.pathname });
  }

  function pageType() {
    var p = location.pathname;
    if (p === '/' || /\/index\.html$/.test(p)) return 'home';
    if (/\/categories\.html$/.test(p)) return 'categories';
    if (/\/explore\.html$|\/kesfet\.html$/.test(p)) return 'explore';
    if (/\/favorites\.html$/.test(p)) return 'favorites';
    if (/\/routine\.html$|\/akilli-rutin\.html$|\/collections\/routine\.html$/.test(p)) return 'routine';
    if (/\/products\//.test(p)) return 'pdp';
    if (/\/cart\.html$/.test(p)) return 'cart';
    if (/\/checkout\.html$/.test(p)) return 'checkout';
    if (/\/account\//.test(p)) return 'account';
    if (/\/allproducts\.html$|\/search\.html$|\/collections\//.test(p) || /\/brands\//.test(p)) return 'listing';
    if (/\/(contact|iade-degisim|teslimat-kargo|mesafeli-satis|on-bilgilendirme)\.html$/.test(p) || /\/legal\//.test(p)) return 'support';
    return null;
  }

  function svg(name) {
    var icons = {
      search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>',
      menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
      back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>',
      heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.6-8.4-9.1A4.7 4.7 0 0 1 11 6l1 1 1-1a4.7 4.7 0 0 1 7.4 4.9C19 15.4 12 20 12 20Z"/></svg>',
      bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h10l1 12H6L7 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
      home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7v9H6v-7h12"/></svg>',
      grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h5v5H5V5Zm9 0h5v5h-5V5ZM5 14h5v5H5v-5Zm9 0h5v5h-5v-5Z"/></svg>',
      sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v5M12 16v5M4 12h5M15 12h5M7.8 7.8l2.2 2.2M14 14l2.2 2.2M16.2 7.8 14 10M10 14l-2.2 2.2"/></svg>',
      user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0"/></svg>',
      chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
      filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M8 5v4M16 15v4"/></svg>',
      sort: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>',
      drop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5s6 6.4 6 10.6a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5Z"/></svg>',
      shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-3.5 7-10V5.7L12 3 5 5.7V11c0 6.5 7 10 7 10Z"/><path d="m8.8 12.2 2.1 2.1 4.6-5"/></svg>',
      leaf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c9 0 14-6 14-14C12 5 6 9 5 19Z"/><path d="M5 19c4-5 8-7 14-14"/></svg>',
      sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>',
      moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A7.8 7.8 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></svg>',
      bottle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6v4l2 3v10H7V10l2-3V3Z"/><path d="M9 7h6M8 13h8"/></svg>',
      cube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>',
      tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12V5h7l9 9-7 7-9-9Z"/><path d="M8 8h.01"/></svg>',
      truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v9H3V7Zm11 3h3.4l3.1 3.2V16H14v-6Z"/><path d="M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10.8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>',
      lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2"/><path d="M6 10h12v10H6V10Z"/><path d="M12 14v2"/></svg>',
      plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>',
      minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>',
      trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>',
      share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a3 3 0 1 0-2.8-4M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm12 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM8.7 9.7l6.6-3.4M8.7 17.7l6.6 3.4"/></svg>',
      eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
      help: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17h.01M9.5 9a2.6 2.6 0 0 1 5 1c0 2-2.5 2.2-2.5 4"/><circle cx="12" cy="12" r="9"/></svg>',
      edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
      card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/></svg>',
      crown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 18 1.5-10 4.2 4.4L12 5l2.3 7.4L18.5 8 20 18H4Z"/><path d="M5 20h14"/></svg>',
      bank: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16L12 4 4 10Z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8M4 20h16"/></svg>',
      mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
      bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3V9Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
      globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9S14.3 18.5 12 21c-2.3-2.5-3.5-5.5-3.5-9S9.7 5.5 12 3Z"/></svg>',
      logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M13 4h6v16h-6"/></svg>',
      instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4"/><circle cx="12" cy="12" r="3.2"/><path d="M16.5 7.5h.01"/></svg>',
      link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/></svg>',
      message: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 4V5Z"/></svg>'
    };
    return icons[name] || '';
  }

  function header(opts) {
    opts = opts || {};
    var left = opts.back ? '<button type="button" class="cm-icon-btn" data-cm-back aria-label="Geri dön">' + svg('back') + '</button>' : '<button type="button" class="cm-icon-btn" data-cm-open-menu aria-label="Menüyü aç">' + svg('menu') + '</button>';
    var right = opts.checkout ? '<span class="cm-secure-title">' + svg('lock') + ' Güvenli Ödeme</span>' : '<div class="cm-header__right"><a class="cm-icon-btn" href="/favorites.html" aria-label="Favorilerim">' + svg('heart') + '</a><a class="cm-icon-btn" href="/cart.html" aria-label="Sepetim">' + svg('bag') + '<span class="cm-badge" data-cm-cart-badge>0</span></a></div>';
    return '<header class="cm-header ' + (opts.checkout ? 'cm-header--checkout' : '') + '"><div class="cm-header__left">' + left + '</div><a class="cm-wordmark" href="/index.html" aria-label="COSMOSKIN anasayfa">COSMOSKIN</a>' + right + '</header>';
  }

  function bottomNav(active) {
    var items = [
      ['home', 'Ana Sayfa', '/index.html', 'home'],
      ['search', 'Keşfet', '/explore.html', 'explore'],
      ['sparkle', 'Rutinim', '/routine.html', 'routine'],
      ['heart', 'Favorilerim', '/favorites.html', 'favorites'],
      ['user', 'Hesabım', '/account/profile.html', 'account']
    ];
    return '<nav class="cm-bottom-nav" aria-label="Mobil alt navigasyon">' + items.map(function (item) {
      return '<a class="' + (active === item[3] ? 'is-active' : '') + '" href="' + item[2] + '">' + svg(item[0]) + '<span>' + item[1] + '</span></a>';
    }).join('') + '</nav>';
  }

  function searchBar(placeholder) {
    var q = new URLSearchParams(location.search).get('q') || '';
    return '<form class="cm-searchbar" action="/search.html" method="get" role="search" data-cs-live-search> ' + svg('search') + '<input name="q" value="' + esc(q) + '" autocomplete="off" placeholder="' + esc(placeholder || 'Ürün, marka veya içerik ara') + '" aria-label="' + esc(placeholder || 'Ürün, marka veya içerik ara') + '"><div class="cs-live-search" hidden></div></form>'; 
  }

  function cartItems() {
    try {
      var local = JSON.parse(localStorage.getItem(STORAGE_CART) || '[]');
      if (Array.isArray(local)) return local.map(normalizeCartItem).filter(Boolean);
    } catch (e) {}
    return [];
  }

  function normalizeCartItem(raw) {
    if (!raw) return null;
    var slug = extractSlug(raw.slug || raw.id || raw.url || raw.product_slug || '');
    var p = getProductBySlug(slug);
    var qty = Math.max(1, Number(raw.qty || raw.quantity || 1));
    var price = Number(raw.price || (p && p.price) || 0);
    return {
      id: slug || (p && p.slug), slug: slug || (p && p.slug), name: raw.name || (p && p.name) || 'Ürün', brand: raw.brand || (p && p.brand) || 'COSMOSKIN',
      price: Number.isFinite(price) ? price : 0, image: raw.image || (p && p.image) || FALLBACK_IMG, url: raw.url || (p && p.url) || ('/products/' + slug + '.html'), qty: qty, volume: raw.volume || (p && p.volume) || ''
    };
  }

  function saveCart(items) {
    var normalized = (items || []).map(normalizeCartItem).filter(Boolean);
    localStorage.setItem(STORAGE_CART, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: normalized } }));
    document.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: normalized } }));
    updateBadges();
  }

  function couponState() {
    try { return JSON.parse(localStorage.getItem('cosmoskin_coupon_state_v1') || 'null') || null; } catch (e) { return null; }
  }

  function couponDiscount(subtotal) {
    var c = couponState();
    if (!c || !c.code || !c.ok) return 0;
    var min = Number(c.minSubtotal || c.min_subtotal || 0);
    if (subtotal < min) return 0;
    var amount = Number(c.discountAmount || c.discount || 0);
    if (!amount && c.type === 'percent') amount = subtotal * Number(c.value || 0) / 100;
    if (c.maxDiscount || c.max_discount) amount = Math.min(amount, Number(c.maxDiscount || c.max_discount));
    return Math.max(0, Math.min(subtotal, Math.round(amount)));
  }

  function cartTotals() {
    var items = cartItems();
    var count = items.reduce(function (sum, item) { return sum + Number(item.qty || 1); }, 0);
    var subtotal = items.reduce(function (sum, item) { return sum + Number(item.price || 0) * Number(item.qty || 1); }, 0);
    var discount = couponDiscount(subtotal);
    var threshold = freeShippingThreshold();
    var shipping = subtotal > 0 && (subtotal - discount) < threshold ? shippingFee() : 0;
    var total = Math.max(0, subtotal - discount + shipping);
    return { items: items, count: count, subtotal: subtotal, discount: discount, coupon: couponState(), shipping: shipping, total: total, freeShippingThreshold: threshold, freeShippingRemaining: Math.max(0, threshold - (subtotal - discount)) };
  }

  function favorites() {
    try {
      var list = JSON.parse(localStorage.getItem(STORAGE_FAVORITES) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function isFavorite(slug) {
    return favorites().some(function (f) { return extractSlug(f.slug || f.id || f.url) === slug; });
  }

  function toggleFavorite(product) {
    var list = favorites();
    var slug = extractSlug(product.slug || product.id || product.url);
    var exists = list.some(function (f) { return extractSlug(f.slug || f.id || f.url) === slug; });
    var next = exists ? list.filter(function (f) { return extractSlug(f.slug || f.id || f.url) !== slug; }) : [product].concat(list);
    localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('cosmoskin:favorites-updated', { detail: { favorites: next } }));
    toast(exists ? 'Favorilerden çıkarıldı.' : 'Favorilere eklendi.');
    syncFavButtons();
    if (pageType() === 'favorites') mount();
  }

  function stockInfo(slug) {
    var api = window.COSMOSKIN_STOCK;
    var inv = api && typeof api.getInventory === 'function' ? api.getInventory(slug) : null;
    if (!inv) return { state: 'checking', label: 'Stok kontrol ediliyor', line: 'Stok bilgisi canlı olarak kontrol ediliyor.', canBuy: true };
    var available = Number(inv.available_stock || 0);
    var inactive = inv.status && inv.status !== 'active';
    var out = inactive || (inv.status === 'active' && !inv.allow_backorder && available <= 0);
    if (out) return { state: 'out', label: 'Stokta Yok', line: 'Favorilerine ekle, tekrar geldiğinde haber verelim.', canBuy: false, available: Math.max(0, available), allowBackorder: Boolean(inv.allow_backorder) };
    if (inv.low_stock || available <= 3) return { state: 'low', label: 'Az stok kaldı', line: 'Az stok kaldı! Acele et.', canBuy: true, available: Math.max(0, available), allowBackorder: Boolean(inv.allow_backorder) };
    return { state: 'in', label: 'Stokta', line: 'Ürün stokta ve sepete eklenebilir.', canBuy: true, available: Math.max(0, available), allowBackorder: Boolean(inv.allow_backorder) };
  }

  function stockQuantityLimit(slug) {
    var api = window.COSMOSKIN_STOCK;
    var inv = api && typeof api.getInventory === 'function' ? api.getInventory(slug) : null;
    if (!inv || inv.allow_backorder) return Infinity;
    var available = Number(inv.available_stock || 0);
    return Number.isFinite(available) ? Math.max(0, available) : Infinity;
  }

  function cartBlockingItems() {
    return cartItems().filter(function (item) {
      var info = stockInfo(item.slug);
      var limit = stockQuantityLimit(item.slug);
      return !info.canBuy || Number(item.qty || 1) > limit;
    });
  }

  function validateCartBeforeContinue(statusEl, done) {
    var totals = cartTotals();
    if (!totals.items.length) { if (statusEl) statusEl.textContent = 'Ödeme için sepetine ürün eklemelisin.'; toast('Sepetin boş.'); return; }
    var localBlocked = cartBlockingItems();
    if (localBlocked.length) {
      if (statusEl) statusEl.textContent = 'Sepetinde stokta olmayan veya stok adedini aşan ürün var.';
      toast('Stok durumunu kontrol etmelisin.');
      return;
    }
    if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.checkItems === 'function') {
      if (statusEl) statusEl.textContent = 'Stok durumu kontrol ediliyor...';
      window.COSMOSKIN_STOCK.checkItems(totals.items.map(function (item) { return { product_slug: item.slug, quantity: item.qty }; })).then(function (result) {
        var blocked = (result.items || []).find(function (item) { return item && item.can_purchase === false; });
        if (blocked) { if (statusEl) statusEl.textContent = blocked.message || 'Sepetindeki bazı ürünlerin stoğu değişti.'; toast('Stok durumunu kontrol etmelisin.'); return; }
        done();
      }).catch(function () { if (statusEl) statusEl.textContent = 'Stok kontrolü tamamlanamadı. Lütfen tekrar dene.'; });
      return;
    }
    done();
  }

  function collectSlugs(root) {
    return Array.prototype.slice.call((root || document).querySelectorAll('[data-product-slug], [data-cm-add-cart], [data-favorite-id]')).map(function (node) {
      return extractSlug(node.getAttribute('data-cm-add-cart') || node.dataset.productSlug || node.dataset.favoriteId || node.dataset.slug || node.dataset.id || '');
    }).filter(Boolean);
  }

  function refreshInventory(root) {
    root = root || document;
    var slugs = collectSlugs(root);
    applyInventory(root);
    if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.loadInventory === 'function' && slugs.length) {
      window.COSMOSKIN_STOCK.loadInventory(slugs).then(function () { applyInventory(root); }).catch(function () { applyInventory(root); });
    }
  }

  function applyInventory(root) {
    root = root || document;
    Array.prototype.slice.call(root.querySelectorAll('[data-cm-stock-badge]')).forEach(function (badge) {
      var slug = extractSlug(badge.dataset.productSlug || badge.closest('[data-product-slug]')?.dataset.productSlug || '');
      var info = stockInfo(slug);
      badge.textContent = info.label;
      badge.className = 'cm-stock-badge is-' + info.state;
      badge.setAttribute('aria-label', 'Stok durumu: ' + info.label);
    });
    Array.prototype.slice.call(root.querySelectorAll('[data-cm-stock-line]')).forEach(function (line) {
      var slug = extractSlug(line.dataset.productSlug || line.closest('[data-product-slug]')?.dataset.productSlug || '');
      var info = stockInfo(slug);
      line.textContent = info.line;
      line.className = 'cm-stock-line is-' + info.state;
    });
    Array.prototype.slice.call(root.querySelectorAll('[data-cm-stock-notify]')).forEach(function (link) {
      var slug = extractSlug(link.dataset.productSlug || link.closest('[data-product-slug]')?.dataset.productSlug || '');
      var info = stockInfo(slug);
      link.hidden = info.canBuy;
      link.setAttribute('aria-hidden', info.canBuy ? 'true' : 'false');
    });
    Array.prototype.slice.call(root.querySelectorAll('[data-cm-add-cart]')).forEach(function (btn) {
      var slug = extractSlug(btn.getAttribute('data-cm-add-cart') || btn.dataset.productSlug || '');
      var info = stockInfo(slug);
      btn.disabled = !info.canBuy;
      btn.setAttribute('aria-disabled', info.canBuy ? 'false' : 'true');
      btn.classList.toggle('is-stock-disabled', !info.canBuy);
      if (!info.canBuy && !btn.classList.contains('cm-card-bag')) btn.textContent = 'Stokta Yok';
      else if (info.canBuy && /stokta yok/i.test(btn.textContent)) btn.textContent = 'Sepete Ekle';
    });
  }

  function syncFavButtons(root) {
    root = root || document;
    Array.prototype.slice.call(root.querySelectorAll('.favorite-btn')).forEach(function (btn) {
      var slug = extractSlug(btn.dataset.favoriteId || btn.dataset.slug || btn.dataset.id || '');
      var active = isFavorite(slug);
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.setAttribute('aria-label', active ? 'Favorilerden çıkar' : 'Favorilere ekle');
    });
  }

  function hasDiscount(product) {
    return Number(product.compareAtPrice || 0) > Number(product.price || 0);
  }

  function ratingHtml(product) {
    var count = Number(product.reviewCount || 0);
    var rating = Number(product.rating || 0);
    if (count > 0 && rating > 0) {
      return '<a class="cm-card-review" href="/products/' + esc(product.slug) + '.html#reviewsSection" aria-label="' + esc(product.name) + ' yorumlarını gör"><span class="cm-stars" aria-hidden="true">★★★★★</span><em>' + rating.toFixed(1).replace('.', ',') + ' (' + count.toLocaleString('tr-TR') + ')</em></a>';
    }
    return '<a class="cm-card-review cm-card-review--empty" href="/products/' + esc(product.slug) + '.html#reviewsSection" aria-label="Ürün yorumlarını gör"><em>Yorumları Gör</em></a>';
  }

  function statusPill(slug) {
    return '<span class="cm-stock-badge is-checking" data-cm-stock-badge data-product-slug="' + esc(slug) + '" aria-live="polite">Stok kontrol ediliyor</span>';
  }

  function favoriteButton(p, extra) {
    return '<button class="favorite-btn ' + (extra || '') + '" type="button" data-favorite-id="' + esc(p.slug) + '" data-slug="' + esc(p.slug) + '" data-id="' + esc(p.slug) + '" data-name="' + esc(p.name) + '" data-brand="' + esc(p.brand) + '" data-price="' + esc(p.price) + '" data-image="' + esc(p.image) + '" data-url="' + esc(p.url) + '" aria-label="Favorilere ekle" aria-pressed="false">' + svg('heart') + '</button>';
  }

  function productCard(product, opts) {
    opts = opts || {};
    var label = opts.label || product.label || '';
    var title = esc(product.brand + ' ' + product.name);
    return '<article class="cm-product-card" data-product-slug="' + esc(product.slug) + '">' +
      (label ? '<span class="cm-chip-label">' + esc(label) + '</span>' : '') + favoriteButton(product, 'cm-fav') +
      '<a class="cm-product-card__media" href="' + esc(product.url) + '" aria-label="' + title + ' ürün detayını aç"><img src="' + esc(product.image) + '" alt="' + title + '" loading="lazy" decoding="async"></a>' +
      '<div class="cm-product-card__body"><small>' + esc(product.brand.toUpperCase()) + '</small><a class="cm-product-title" href="' + esc(product.url) + '" aria-label="' + title + ' ürün detayını aç"><h3>' + esc(product.name) + '</h3></a><b class="cm-card-price">' + formatPrice(product.price) + '</b>' + ratingHtml(product) + '<div class="cm-card-stock-row">' + statusPill(product.slug) + '</div><div class="cm-card-actions cm-card-actions--single"><button class="cm-card-cart" type="button" data-cm-add-cart="' + esc(product.slug) + '" aria-label="' + title + ' sepete ekle">Sepete Ekle</button></div></div></article>';
  }


  function smallProductCard(product, label) {
    return '<a class="cm-horizontal-product" href="' + esc(product.url) + '" data-product-slug="' + esc(product.slug) + '" aria-label="' + esc(product.brand + ' ' + product.name) + ' ürün detayını aç"><img src="' + esc(product.image) + '" alt="' + esc(product.name) + '" loading="lazy" decoding="async"><div><small>' + esc(product.brand) + '</small><b>' + esc(product.name) + '</b><span>' + formatPrice(product.price) + '</span>' + statusPill(product.slug) + '</div><em>' + (label || svg('chevron')) + '</em></a>';
  }

  function productImageForCategory(category) {
    var p = getProducts().find(function (item) { return item.category === category; }) || getProducts()[0];
    return p ? p.image : FALLBACK_IMG;
  }

  function trustStrip() {
    return '<section class="cm-trust-strip"><div>' + svg('lock') + '<strong>Güvenli ödeme</strong><span>3D Secure koruması</span></div><div>' + svg('truck') + '<strong>Hızlı teslimat</strong><span>1–3 iş günü</span></div><div>' + svg('shield') + '<strong>Özenle seçildi</strong><span>Uzman onaylı</span></div></section>';
  }

  function brandName(slug) {
    var map = { cosrx: 'COSRX', anua: 'anua', mixsoon: 'mixsoon', 'some-by-mi': 'SOME BY MI', skin1004: 'SKIN1004', 'beauty-of-joseon': 'Beauty of Joseon', 'round-lab': 'ROUND LAB', torriden: 'Torriden', 'thank-you-farmer': 'Thank You Farmer', 'by-wishtrend': 'By Wishtrend', 'dr-jart': 'Dr. Jart+', goodal: 'Goodal', 'im-from': "I'm From", innisfree: 'Innisfree', isntree: 'Isntree', laneige: 'Laneige', medicube: 'Medicube', mediheal: 'Mediheal' };
    return map[slug] || slug.split('-').map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
  }

  function brandTile(slug) {
    return '<a class="cm-brand-tile" href="/brands/' + slug + '.html"><span>' + esc(brandName(slug)) + '</span></a>';
  }

  function brandStrip() {
    return '<div class="cm-brand-strip-ref">' + BRAND_SLUGS.slice(0, 6).map(function (slug) { return '<a href="/brands/' + slug + '.html">' + esc(brandName(slug)) + '</a>'; }).join('') + '<a class="cm-brand-arrow" href="/brands.html" aria-label="Tüm markalar">Tüm Markalar ' + svg('chevron') + '</a></div>';
  }

  function sectionHead(title, href, text) {
    return '<div class="cm-section-head"><h2>' + esc(title) + '</h2>' + (href ? '<a class="cm-see-all" href="' + href + '">' + esc(text || 'Tümünü Gör') + ' ' + svg('chevron') + '</a>' : '') + '</div>';
  }

  function faqSection() {
    var items = [
      ['Ürünler orijinal mi?', 'COSMOSKIN seçkisi yalnızca orijinal marka ürünlerinden oluşur.'],
      ['Kargo ne kadar sürer?', 'Siparişler genellikle 1–3 iş günü içinde kargoya hazırlanır.'],
      ['Cilt ihtiyacıma göre nasıl seçerim?', 'Nem, Bariyer, Işıltı ve Hassasiyet kategorileriyle ihtiyacına göre başlayabilirsin.']
    ];
    return '<section class="cm-faq-section" aria-labelledby="cmHomeFaqTitle"><div class="cm-section-head"><h2 id="cmHomeFaqTitle">Sık Sorulan Sorular</h2><a class="cm-see-all" href="/contact.html#sss">Tümünü Gör ' + svg('chevron') + '</a></div><div class="cm-faq-list">' + items.map(function (item, index) { return '<details class="cm-faq-item"' + (index === 0 ? ' open' : '') + '><summary><span>' + esc(item[0]) + '</span>' + svg('chevron') + '</summary><p>' + esc(item[1]) + '</p></details>'; }).join('') + '</div></section>';
  }

  function homePage() {
    var products = getProducts();
    var best = ['medicube-zero-pore-pad', 'skin1004-madagascar-centella-ampoule', 'cosrx-advanced-snail-96-mucin-essence', 'beauty-of-joseon-glow-serum-propolis-niacinamide'].map(getProductBySlug).filter(Boolean);
    if (best.length < 4) best = products.slice(0, 4);
    var newest = products.slice(-4).reverse();
    var heroProduct = best[0] || products[0] || null;
    var heroImage = heroProduct && heroProduct.image ? heroProduct.image : '/assets/img/hero-sunscreen-cosmoskin.png';
    return '<div class="cm-mobile-page cm-mobile-home">' + header() + '<div class="cm-page-inner cm-page-inner--top">' + searchBar() + '</div><section class="cm-hero-ref cm-hero-ref--desktop-match"><div class="cm-hero-ref__copy"><p>KORE’DEN. BİLİMİN IŞIĞINDA.</p><h1><span>Cildin. <em>Işıltın.</em></span><span class="cm-hero-script">Senin hikayen.</span></h1><span>Kore’nin yüksek performanslı formüllerini seçilmiş markalarla bir araya getiriyor; cildine hak ettiği özeni sade ve güvenli bir alışveriş deneyimiyle sunuyoruz.</span><a class="cm-btn cm-btn--primary" href="#cm-mobile-bestsellers">Alışverişe Başla</a></div><div class="cm-hero-ref__visual" aria-hidden="true"><img src="' + esc(heroImage) + '" alt="" loading="eager" decoding="async"></div></section>' + trustStrip() + brandStrip() + '<div class="cm-page-inner">' + sectionHead('Cilt İhtiyacına Göre', '/categories.html#ihtiyac') + '<div class="cm-concern-grid" id="ihtiyac">' + GOAL_ROUTES.map(function (g) { return '<a class="cm-concern-tile" href="' + g.href + '">' + svg(g.icon) + '<span>' + g.title + '</span></a>'; }).join('') + '</div>' + sectionHead('Çok Satanlar', '/allproducts.html') + '<div class="cm-product-grid cm-product-grid--home" id="cm-mobile-bestsellers">' + best.map(function (p, i) { return productCard(p, { label: i === 0 ? 'Popüler' : i === 1 ? 'Bestseller' : '' }); }).join('') + '</div><section class="cm-routine-teaser"><div><p>AKILLI RUTİN</p><h2>Cildine uygun gündüz ve akşam akışını kur.</h2><span>Seçimlerine göre gerçek ürün verisiyle önerilen rutini gör.</span></div><a class="cm-btn" href="/routine.html">Rutini Başlat</a></section>' + sectionHead('Editörün Seçtikleri', '/explore.html') + '<div class="cm-product-grid cm-product-grid--home">' + newest.map(function (p) { return productCard(p); }).join('') + '</div>' + faqSection() + footer() + '</div>' + bottomNav('home') + '</div>';
  }


  function categoriesPage() {
    return '<div class="cm-mobile-page cm-mobile-categories">' + header() + '<div class="cm-page-inner cm-page-inner--top"><h1 class="cm-page-title">Kategoriler</h1><p class="cm-page-subtitle">Cilt bakımını ihtiyacına göre keşfet.</p><div class="cm-search-filter-row">' + searchBar('Ürün, kategori veya içerik ara') + '<button type="button" class="cm-filter-mini" data-cm-open-filter>Filtrele ' + svg('filter') + '</button></div><div class="cm-category-grid-ref">' + CATEGORY_ROUTES.map(function (cat) { return '<a class="cm-category-tile-ref" href="' + cat.href + '"><span><img src="' + esc(productImageForCategory(cat.category)) + '" alt="' + esc(cat.title) + '" loading="lazy"></span><b>' + esc(cat.title) + '</b>' + svg('chevron') + '</a>'; }).join('') + '</div>' + sectionHead('Cilt İhtiyacına Göre', '/routine.html') + '<div class="cm-concern-grid">' + GOAL_ROUTES.map(function (g) { return '<a class="cm-concern-tile" href="' + g.href + '">' + svg(g.icon) + '<span>' + g.title + '</span></a>'; }).join('') + '</div>' + sectionHead('Markalar', '/allproducts.html', 'Tümünü Gör') + '<div class="cm-brand-grid-ref" id="markalar">' + ALL_BRAND_SLUGS.map(brandTile).join('') + '</div>' + footer() + '</div>' + bottomNav('explore') + '</div>';
  }

  function explorePage() {
    var products = getProducts();
    var trending = ['medicube-zero-pore-pad', 'skin1004-madagascar-centella-ampoule', 'cosrx-advanced-snail-96-mucin-essence', 'beauty-of-joseon-glow-serum-propolis-niacinamide'].map(getProductBySlug).filter(Boolean);
    if (trending.length < 4) trending = products.slice(0, 4);
    var articleImageA = productImageForCategory('Tonik & Essence');
    var articleImageB = productImageForCategory('Nemlendiriciler');
    var articleImageC = productImageForCategory('Serum & Ampul');
    var routineCards = [
      ['Sabah Işıltısı', 'Hafif temizleme, nem ve SPF ile aydınlık başlangıç.', '/routine.html?period=day', productImageForCategory('Güneş Koruyucular')],
      ['Akşam Rahatlaması', 'Arındırma, bariyer desteği ve gece konforu.', '/routine.html?period=night', productImageForCategory('Nemlendiriciler')],
      ['Minimal & Etkili', 'Az ürünle düzenli ve ölçülü bakım akışı.', '/routine.html', productImageForCategory('Serum & Ampul')]
    ];
    var articles = [
      ['Cilt Tipinizi Nasıl Belirlersiniz?', '/journal.html#cilt-tipi', articleImageA],
      ['Cilt Bariyerinizi Güçlendirmenin Yolları', '/journal.html#bariyer', articleImageB],
      ['Doğru Serum Seçimi Nasıl Yapılır?', '/journal.html#serum-secimi', articleImageC]
    ];
    return '<div class="cm-mobile-page cm-mobile-explore">' + header() + '<div class="cm-page-inner cm-page-inner--top">' + searchBar() + '<h1 class="cm-page-title">Keşfet</h1><section class="cm-explore-hero"><p>EDİTÖRÜN SEÇİMİ</p><h2>Cildini Yenile, Işıltını Keşfet</h2><span>COSMOSKIN tarafından özenle seçilen rutinler, ürünler ve K-Beauty notları.</span><a class="cm-btn cm-btn--primary" href="/collections/glow.html">Keşfet</a></section><div class="cm-content-chips"><a href="/routine.html">Rutinler</a><a href="/journal.html">Journal</a><a href="/collections/glow.html">Trendler</a><a href="/allproducts.html?sort=new">Yeni Gelenler</a></div>' + sectionHead('İlham Veren Rutinler', '/routine.html') + '<div class="cm-routine-inspo-grid">' + routineCards.map(function (card) { return '<a class="cm-routine-inspo-card" href="' + card[2] + '"><img src="' + esc(card[3]) + '" alt="' + esc(card[0]) + '"><strong>' + esc(card[0]) + '</strong><span>' + esc(card[1]) + '</span>' + svg('chevron') + '</a>'; }).join('') + '</div>' + sectionHead('Journal', '/journal.html') + '<div class="cm-article-grid" id="journal">' + articles.map(function (a) { return '<a class="cm-article-card" href="' + a[1] + '"><img src="' + esc(a[2]) + '" alt="' + esc(a[0]) + '"><strong>' + esc(a[0]) + '</strong><span>3 dk okuma</span></a>'; }).join('') + '</div>' + sectionHead('Şu Anda Popüler', '/allproducts.html') + '<div class="cm-horizontal-grid">' + trending.map(function (p) { return smallProductCard(p); }).join('') + '</div></div>' + bottomNav('explore') + '</div>';
  }

  function favoritesPage() {
    var list = favorites().map(function (item) { return getProductBySlug(item.slug || item.id || item.url) || normalizeProduct(item); }).filter(Boolean);
    var tab = new URLSearchParams(location.search).get('tab') || 'all';
    var products = list;
    if (tab === 'stock') products = list.filter(function (p) { return stockInfo(p.slug).canBuy; });
    if (tab === 'sale') products = list.filter(hasDiscount);
    products = sortProducts(products, listingState.sort);
    var emptyCopy = tab === 'sale' ? 'İndirimde favori ürün bulunmuyor.' : tab === 'stock' ? 'Stokta favori ürün bulunmuyor.' : 'Favorileriniz henüz boş.';
    return '<div class="cm-mobile-page cm-mobile-favorites">' + header({ back: true }) + '<div class="cm-page-inner cm-page-inner--top">' + searchBar() + '<section class="cm-list-head cm-list-head--fav"><div><h1>Favorilerim</h1><p>' + list.length + ' ürün</p></div><button type="button" data-cm-open-sort>Sırala ' + svg('sort') + '</button></section><div class="cm-tabs"><a class="' + (tab === 'all' ? 'is-active' : '') + '" href="/favorites.html">Tümü</a><a class="' + (tab === 'stock' ? 'is-active' : '') + '" href="/favorites.html?tab=stock">Stokta</a><a class="' + (tab === 'sale' ? 'is-active' : '') + '" href="/favorites.html?tab=sale">İndirimde</a></div>' + (products.length ? '<div class="cm-product-grid cm-product-grid--favorites">' + products.map(productCard).join('') + '</div>' : '<div class="cm-empty-state"><strong>' + emptyCopy + '</strong><span>Ürün kartlarındaki kalp ikonuyla favorilerinizi oluşturabilirsiniz.</span><a class="cm-btn cm-btn--primary" href="/allproducts.html">Ürünleri Keşfet</a></div>') + '</div>' + bottomNav('favorites') + '</div>';
  }

  function routeListingMeta() {
    var path = location.pathname;
    if (/\/search\.html$/.test(path)) {
      var q = new URLSearchParams(location.search).get('q') || '';
      return { title: q ? 'Arama Sonuçları' : 'Arama', subtitle: q ? '“' + q + '” için eşleşen ürünler' : 'Ürün, marka veya içerik ara.', query: q };
    }
    if (/\/brands\//.test(path)) {
      var brandSlug = extractSlug(path);
      return { title: brandName(brandSlug), subtitle: 'Seçili marka ürünleri', brand: brandName(brandSlug) };
    }
    var collection = path.match(/\/collections\/([^.?#/]+)\.html/);
    if (collection) {
      var collectionSlug = collection[1];
      if (ALL_BRAND_SLUGS.indexOf(collectionSlug) !== -1) return { title: brandName(collectionSlug), subtitle: 'Seçili marka ürünleri', brand: brandName(collectionSlug) };
      var meta = COLLECTION_META[collectionSlug] || { title: 'Seçili Ürünler', subtitle: 'COSMOSKIN seçkisi.' };
      return Object.assign({ subtitle: meta.subtitle || 'COSMOSKIN seçkisi.' }, meta);
    }
    return { title: 'Tüm Ürünler', subtitle: 'Seçilmiş Kore cilt bakım ürünleri.' };
  }

  function productMatchesMeta(product, meta) {
    var text = [product.name, product.brand, product.category, product.keywords, (product.aliases || []).join(' ')].join(' ').toLocaleLowerCase('tr-TR');
    if (meta.category && !(product.category === meta.category || product.categorySlug === slugify(meta.category))) return false;
    if (meta.brand && !(slugify(product.brand) === slugify(meta.brand))) return false;
    if (meta.query && text.indexOf(String(meta.query).toLocaleLowerCase('tr-TR')) === -1) return false;
    if (meta.keywords && meta.keywords.length && !meta.keywords.some(function (word) { return text.indexOf(String(word).toLocaleLowerCase('tr-TR')) !== -1; })) return false;
    if (listingState.category && product.category !== listingState.category) return false;
    if (listingState.brand && slugify(product.brand) !== slugify(listingState.brand)) return false;
    if (listingState.skin) {
      var skin = String(listingState.skin).toLocaleLowerCase('tr-TR');
      if (text.indexOf(skin) === -1) return false;
    }
    if (listingState.concern) {
      var concern = String(listingState.concern).toLocaleLowerCase('tr-TR');
      if (text.indexOf(concern) === -1) return false;
    }
    if (listingState.price === 'under800' && !(product.price < 800)) return false;
    if (listingState.price === '800-1000' && !(product.price >= 800 && product.price <= 1000)) return false;
    if (listingState.price === 'over1000' && !(product.price > 1000)) return false;
    return true;
  }

  function sortProducts(products, mode) {
    var list = products.slice();
    if (mode === 'price-asc') list.sort(function (a, b) { return a.price - b.price; });
    else if (mode === 'price-desc') list.sort(function (a, b) { return b.price - a.price; });
    else if (mode === 'new') list.reverse();
    else if (mode === 'rating') list.sort(function (a, b) { return Number(b.rating || 0) - Number(a.rating || 0) || Number(b.reviewCount || 0) - Number(a.reviewCount || 0); });
    return list;
  }

  function filteredProducts() {
    var meta = routeListingMeta();
    var products = getProducts().filter(function (p) { return productMatchesMeta(p, meta); });
    if (listingState.stock === 'in') products = products.filter(function (p) { return stockInfo(p.slug).canBuy; });
    return sortProducts(products, listingState.sort);
  }

  function listingPage() {
    var meta = routeListingMeta();
    var chips = [];
    if (meta.category) chips.push({ label: meta.category, key: '' });
    if (meta.brand) chips.push({ label: meta.brand, key: '' });
    if (meta.query) chips.push({ label: 'Arama: ' + meta.query, key: '' });
    if (listingState.category) chips.push({ label: 'Kategori: ' + listingState.category, key: 'category' });
    if (listingState.brand) chips.push({ label: 'Marka: ' + listingState.brand, key: 'brand' });
    if (listingState.skin) chips.push({ label: 'Cilt Tipi: ' + listingState.skin, key: 'skin' });
    if (listingState.concern) chips.push({ label: 'Cilt İhtiyacı: ' + listingState.concern, key: 'concern' });
    if (listingState.price) chips.push({ label: 'Fiyat filtresi', key: 'price' });
    if (!chips.length && /cleanse/.test(location.pathname)) chips = [{ label: 'Cilt Tipi: Karma', key: '' }, { label: 'Cilt Endişesi: Gözenek', key: '' }, { label: 'Temizleyici', key: '' }];
    return '<div class="cm-mobile-page cm-mobile-listing">' + header({ back: true }) + '<div class="cm-page-inner cm-page-inner--top">' + searchBar() + '<section class="cm-list-head"><div><h1>' + esc(meta.title) + '</h1><p><span data-cm-product-count>0</span> ürün</p></div></section><div class="cm-list-controls"><button type="button" data-cm-open-filter>Filtrele ' + svg('filter') + '</button><button type="button" data-cm-open-sort>Sırala ' + svg('sort') + '</button></div>' + (chips.length ? '<div class="cm-filter-chips">' + chips.map(function (c) { return c.key ? '<button type="button" data-cm-filter-remove="' + esc(c.key) + '">' + esc(c.label) + ' <b aria-hidden="true">×</b></button>' : '<span>' + esc(c.label) + '</span>'; }).join('') + '</div>' : '') + '<div class="cm-product-grid" data-cm-listing-grid></div></div><div class="cm-mobile-filterbar"><button type="button" data-cm-open-filter>' + svg('filter') + ' Filtrele</button><button type="button" data-cm-open-sort>' + svg('sort') + ' Sırala</button></div>' + bottomNav('explore') + '</div>';
  }

  function renderListingGrid() {
    var grid = document.querySelector('[data-cm-listing-grid]');
    if (!grid) return;
    var products = filteredProducts();
    var count = document.querySelector('[data-cm-product-count]');
    if (count) count.textContent = String(products.length);
    grid.innerHTML = products.length ? products.map(function (p, i) { return productCard(p, { label: i === 0 ? 'Popüler' : '' }); }).join('') : '<div class="cm-empty-state"><strong>Eşleşen ürün bulunamadı.</strong><span>Filtreleri temizleyerek tekrar deneyebilirsin.</span></div>';
    syncFavButtons(grid);
    refreshInventory(grid);
  }

  function routinePick(category, goal) {
    var products = getProducts().filter(function (p) { return p.category === category; });
    if (!products.length) return null;
    var goalLower = (goal || '').toLocaleLowerCase('tr-TR');
    var skinLower = (routineState.skin || '').toLocaleLowerCase('tr-TR');
    var periodLower = (routineState.period || '').toLocaleLowerCase('tr-TR');
    var score = function (p) {
      var hay = [p.name, p.brand, p.category, p.keywords, (p.aliases || []).join(' ')].join(' ').toLocaleLowerCase('tr-TR');
      var points = 0;
      if (goalLower && hay.indexOf(goalLower) !== -1) points += 6;
      if (skinLower && hay.indexOf(skinLower) !== -1) points += 3;
      if (goal === 'Bariyer' && /ceramide|seramid|cica|centella|barrier|bariyer/.test(hay)) points += 5;
      if (goal === 'Nem' && /hyaluronic|hyalüronik|water|moisture|nem|dive-in|dokdo/.test(hay)) points += 5;
      if (goal === 'Işıltı' && /glow|vitamin|niacinamide|niasinamid|rice|pirinç|tangerine/.test(hay)) points += 5;
      if (goal === 'Akne' && /acne|akne|pore|gözenek|bha|salisilik|clay/.test(hay)) points += 5;
      if (goal === 'Hassasiyet' && /soothing|heartleaf|centella|cica|hassas|yatıştırıcı/.test(hay)) points += 5;
      if (routineState.skin === 'Yağlı' && /oil|pore|sebum|gel|foam|clay/.test(hay)) points += 2;
      if (routineState.skin === 'Kuru' && /cream|ceramide|hyaluronic|moisture|water|balm/.test(hay)) points += 2;
      if (periodLower === 'day' && category === 'Güneş Koruyucular') points += 10;
      if (p.rating && p.reviewCount) points += Math.min(3, Number(p.rating));
      return points;
    };
    return products.slice().sort(function (a, b) { return score(b) - score(a); })[0];
  }

  function currentRoutineProducts() {
    if (!routineState.goal) return [];
    var cats = routineState.period === 'day' ? ['Temizleyiciler', 'Tonik & Essence', 'Serum & Ampul', 'Nemlendiriciler', 'Güneş Koruyucular'] : ['Temizleyiciler', 'Tonik & Essence', 'Serum & Ampul', 'Nemlendiriciler'];
    return cats.map(function (cat) { return routinePick(cat, routineState.goal); }).filter(Boolean);
  }

  function routinePage() {
    if (!routineState.goal) {
      var goalParam = (new URLSearchParams(location.search).get('goal') || '').toLowerCase();
      var goalMap = { nem: 'Nem', bariyer: 'Bariyer', isilti: 'Işıltı', glow: 'Işıltı', leke: 'Leke', akne: 'Akne', hassasiyet: 'Hassasiyet', gozenek: 'Gözenek', spf: 'Güneş bakımı' };
      if (goalMap[goalParam]) routineState.goal = goalMap[goalParam];
    }
    var skinOptions = ['Kuru', 'Karma', 'Yağlı', 'Hassas'];
    var goalOptions = ['Nem', 'Bariyer', 'Işıltı', 'Leke', 'Akne', 'Hassasiyet', 'Gözenek', 'Güneş bakımı'];
    var items = currentRoutineProducts();
    var stepNames = routineState.period === 'day' ? ['Temizleyici', 'Toner', 'Serum', 'Nemlendirici', 'Güneş Koruyucu'] : ['Temizleyici', 'Toner', 'Serum', 'Nemlendirici'];
    return '<div class="cm-mobile-page cm-mobile-routine">' + header() + '<div class="cm-routine-progress"><span class="is-active"><b>1</b>Cilt Tipi</span><span class="is-active"><b>2</b>Hedef</span><span><b>3</b>Rutin</span></div><div class="cm-page-inner cm-page-inner--top"><section class="cm-routine-title-ref"><h1>Akıllı Rutin Seçimi</h1><p>Cildine uygun rutini birkaç adımda oluştur.</p></section><section class="cm-step-block"><h2>Cilt Tipin</h2><div class="cm-select-grid cm-select-grid--skin">' + skinOptions.map(function (s) { return '<button class="cm-select-chip ' + (routineState.skin === s ? 'is-selected' : '') + '" type="button" data-cm-routine-skin="' + esc(s) + '" aria-pressed="' + (routineState.skin === s ? 'true' : 'false') + '">' + svg(s === 'Hassas' ? 'leaf' : s === 'Yağlı' ? 'drop' : s === 'Karma' ? 'shield' : 'drop') + '<span>' + esc(s) + '</span></button>'; }).join('') + '</div></section><section class="cm-step-block"><h2>Cilt Hedefin</h2><div class="cm-select-grid">' + goalOptions.map(function (g) { return '<button class="cm-select-chip ' + (routineState.goal === g ? 'is-selected' : '') + '" type="button" data-cm-routine-goal="' + esc(g) + '" aria-pressed="' + (routineState.goal === g ? 'true' : 'false') + '">' + svg(g === 'Nem' ? 'drop' : g === 'Bariyer' ? 'shield' : g === 'Hassasiyet' ? 'leaf' : g === 'Akne' ? 'drop' : 'sparkle') + '<span>' + esc(g) + '</span></button>'; }).join('') + '</div></section><div class="cm-toggle"><button class="' + (routineState.period === 'day' ? 'is-active' : '') + '" type="button" data-cm-routine-period="day" aria-pressed="' + (routineState.period === 'day' ? 'true' : 'false') + '">' + svg('sun') + ' Gündüz</button><button class="' + (routineState.period === 'night' ? 'is-active' : '') + '" type="button" data-cm-routine-period="night" aria-pressed="' + (routineState.period === 'night' ? 'true' : 'false') + '">' + svg('moon') + ' Akşam</button></div><section class="cm-routine-list"><h2>Önerilen Rutin (' + (routineState.period === 'day' ? 'Gündüz' : 'Akşam') + ')</h2>' + (items.length ? items.map(function (p, i) { return '<a class="cm-routine-row" href="' + esc(p.url) + '" data-product-slug="' + esc(p.slug) + '"><b>' + (i + 1) + '</b><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '"><span><strong>' + stepNames[i] + '</strong><small>' + esc(routineLine(stepNames[i])) + '</small><em class="cm-routine-product-name">' + esc(p.brand + ' · ' + p.name) + '</em><em class="cm-stock-line" data-cm-stock-line data-product-slug="' + esc(p.slug) + '"></em></span>' + svg('chevron') + '</a>'; }).join('') : '<div class="cm-empty-state cm-empty-state--inline"><strong>Cilt hedefini seç</strong><span>Sana uygun sabah ve akşam rutinini görmek için önce bir hedef seç.</span></div>') + '</section><button class="cm-btn cm-btn--primary cm-btn--wide" type="button" data-cm-add-routine ' + (!items.length ? 'disabled aria-disabled="true"' : '') + '>Rutini Oluştur</button><a class="cm-routine-expert" href="/explore.html">Uzman seçimlerini gör ' + svg('chevron') + '</a></div>' + bottomNav('explore') + '</div>';
  }

  function routineLine(step) {
    return {
      Temizleyici: 'Nazik jel temizleyici ile arındırır.',
      Toner: 'Cildi dengeler ve nem desteği sağlar.',
      Serum: 'Bariyeri destekler ve cildi güçlendirir.',
      Nemlendirici: 'Uzun süreli nem ve konfor sağlar.',
      'Güneş Koruyucu': 'Geniş spektrum UV koruması sağlar.'
    }[step] || 'Rutinin bu adımını tamamlar.';
  }

  function guideFor(product) {
    var category = product.category || '';
    var base = {
      benefits: ['Cildin günlük bakım akışını destekler', 'Konforlu ve dengeli bir his verir', 'COSMOSKIN seçkisinde yer alır'],
      usage: 'Ürün ambalajındaki kullanım talimatına göre uygulayın.',
      ingredients: 'Detaylı içerik için ürün ambalajını ve marka bilgisini kontrol edin.',
      skin: 'Cilt ihtiyacına göre seçilmelidir.'
    };
    if (/Temizleyiciler/.test(category)) base = { benefits: ['Cildi nazikçe arındırır', 'Günlük bakım akışını hazırlar', 'Temiz ve konforlu his bırakır'], usage: 'Nemli cilde masaj yaparak uygulayın, ardından durulayın.', ingredients: 'Nazik temizleyici bileşenler içerir.', skin: 'Günlük arındırma adımı arayan ciltler için uygundur.' };
    if (/Serum/.test(category)) base = { benefits: ['Hedef bakım sağlar', 'Cilt görünümünü destekler', 'Rutinin etkisini güçlendirir'], usage: 'Tonik sonrası birkaç damla uygulayın.', ingredients: 'Ürün odağına göre aktif bakım bileşenleri içerir.', skin: 'Belirli cilt hedefi olan kullanıcılar için uygundur.' };
    if (/Güneş/.test(category)) base = { benefits: ['Günlük SPF koruması sağlar', 'Hafif ve konforlu bitiş sunar', 'Gündüz rutininin son adımıdır'], usage: 'Sabah rutininin son adımında yeterli miktarda uygulayın.', ingredients: 'UV filtreleri ve bakım destekleyici bileşenler içerir.', skin: 'Gündüz rutini kullanan tüm ciltler için gereklidir.' };
    return base;
  }

  function pdpRatingHtml(product) {
    var count = Number(product.reviewCount || 0);
    var rating = Number(product.rating || 0);
    if (count > 0 && rating > 0) {
      return '<span class="cm-stars" aria-hidden="true">★★★★★</span><a href="/products/' + esc(product.slug) + '.html#reviewsSection">' + rating.toFixed(1).replace('.', ',') + ' (' + count.toLocaleString('tr-TR') + ')</a>';
    }
    return '<a href="/products/' + esc(product.slug) + '.html#reviewsSection">Yorumları Gör</a>';
  }

  function pdpPage() {
    currentPdpQty = 1;
    var p = getCurrentProduct();
    var guide = guideFor(p);
    var gallery = (Array.isArray(p.images) && p.images.length ? p.images : [p.image]).filter(Boolean);
    var heroImage = gallery[0] || p.image || FALLBACK_IMG;
    var galleryCount = gallery.length > 1 ? '1/' + gallery.length : '1/1';
    var related = getProducts().filter(function (x) { return x.slug !== p.slug && (x.category === p.category || x.brand === p.brand); }).slice(0, 4);
    if (related.length < 4) related = related.concat(getProducts().filter(function (x) { return x.slug !== p.slug && !related.some(function (r) { return r.slug === x.slug; }); }).slice(0, 4 - related.length));
    return '<div class="cm-mobile-page cm-mobile-pdp" data-product-slug="' + esc(p.slug) + '">' + header({ back: true }) + '<section class="cm-pdp-hero-ref"><img class="cm-pdp-product" src="' + esc(heroImage) + '" alt="' + esc(p.brand + ' ' + p.name) + '"><button class="cm-pdp-floating cm-pdp-floating--back" type="button" data-cm-back aria-label="Geri dön">' + svg('back') + '</button><button class="cm-pdp-floating cm-pdp-floating--share" type="button" data-cm-share aria-label="Paylaş">' + svg('share') + '</button><button class="cm-pdp-floating cm-pdp-floating--zoom" type="button" data-cm-zoom aria-label="Görseli büyüt">' + svg('search') + '</button><span class="cm-gallery-count">' + galleryCount + '</span></section><section class="cm-pdp-info"><div class="cm-pdp-title-row"><div><span class="cm-pdp-brand">' + esc(p.brand.toUpperCase()) + '</span><h1>' + esc(p.name) + '</h1></div>' + statusPill(p.slug) + '</div><div class="cm-pdp-meta">' + pdpRatingHtml(p) + '</div><div class="cm-pdp-price-line"><b>' + formatPrice(p.price) + '</b><span>3 x ' + formatPrice(Math.round(p.price / 3)) + '’den başlayan taksitlerle</span></div><div class="cm-pdp-benefits">' + guide.benefits.slice(0, 3).map(function (b, i) { return '<p>' + svg(i === 0 ? 'drop' : i === 1 ? 'sparkle' : 'leaf') + '<span>' + esc(b) + '</span></p>'; }).join('') + '</div><div class="cm-pdp-trust"><span>' + svg('truck') + '1–3 iş günü</span><span>' + svg('shield') + 'Kolay iade</span></div><div class="cm-pdp-actions"><div class="cm-stepper"><button type="button" data-cm-pdp-dec aria-label="Adedi azalt">−</button><span data-cm-pdp-qty>1</span><button type="button" data-cm-pdp-inc aria-label="Adedi artır">+</button></div>' + favoriteButton(p, 'cm-fav-inline') + '</div><button class="cm-btn cm-btn--primary cm-pdp-sticky-cta" data-cm-add-cart="' + esc(p.slug) + '" data-cm-qty="pdp" type="button">Sepete Ekle</button><p class="cm-stock-line cm-pdp-stock-line" data-cm-stock-line data-product-slug="' + esc(p.slug) + '" aria-live="polite"></p><div class="cm-accordion">' + accordion('drop', 'Kullanım', guide.usage) + accordion('bottle', 'İçindekiler', guide.ingredients) + accordion('user', 'Cilt Tipi', guide.skin) + '</div><section class="cm-mobile-reviews" id="reviewsSection" data-cm-mobile-reviews data-product-slug="' + esc(p.slug) + '"><div class="cm-section-head"><h2>Müşteri Yorumları</h2><a class="cm-see-all" href="/products/' + esc(p.slug) + '.html#reviewsSection">Tümünü Gör ' + svg('chevron') + '</a></div><div class="cm-review-empty">Yorumlar yükleniyor…</div></section>' + sectionHead('Sizin İçin Seçtiklerimiz', '/allproducts.html') + '<div class="cm-product-grid cm-product-grid--reco">' + related.map(productCard).join('') + '</div></section>' + bottomNav('explore') + '</div>';
  }

  function accordion(icon, title, body) {
    return '<details class="cm-acc-row"><summary>' + svg(icon) + '<strong>' + esc(title) + '</strong>' + svg('chevron') + '</summary><p>' + esc(body) + '</p></details>';
  }

  function cartRow(item) {
    var info = stockInfo(item.slug);
    var max = stockQuantityLimit(item.slug);
    var plusDisabled = Number(item.qty || 1) >= max ? ' disabled aria-disabled="true"' : '';
    return '<article class="cm-cart-row cm-cart-row--ref" data-product-slug="' + esc(item.slug) + '"><a class="cm-cart-row__img" href="' + esc(item.url) + '"><img src="' + esc(item.image) + '" alt="' + esc(item.name) + '"></a><div class="cm-cart-row__body"><div class="cm-cart-row__top"><div><small>' + esc(item.brand.toUpperCase()) + '</small><h2><a href="' + esc(item.url) + '">' + esc(item.name) + '</a></h2><span>' + esc(item.volume || '') + '</span></div>' + favoriteButton(item, 'cm-cart-fav') + '</div><b>' + formatPrice(item.price * item.qty) + '</b><div class="cm-cart-controls"><div class="cm-stepper"><button type="button" data-cm-cart-dec="' + esc(item.slug) + '" aria-label="Adedi azalt">−</button><span>' + item.qty + '</span><button type="button" data-cm-cart-inc="' + esc(item.slug) + '" aria-label="Adedi artır"' + plusDisabled + '>+</button></div><button class="cm-trash" type="button" data-cm-cart-remove="' + esc(item.slug) + '" aria-label="Ürünü sepetten çıkar">' + svg('trash') + '</button></div><div class="cm-stock-line is-' + info.state + '" data-cm-stock-line data-product-slug="' + esc(item.slug) + '">' + esc(info.line) + '</div></div></article>';
  }

  function orderSummary(totals, compact) {
    return '<section class="cm-summary"><div class="cm-summary-title"><h2>Sipariş Özeti</h2>' + (compact ? '<a href="/cart.html">Düzenle</a>' : '') + '</div><div class="cm-summary-row"><span>Ara Toplam</span><b>' + formatPrice(totals.subtotal) + '</b></div>' + (totals.discount ? '<div class="cm-summary-row is-discount"><span>Kupon indirimi' + (totals.coupon && totals.coupon.code ? ' (' + esc(totals.coupon.code) + ')' : '') + '</span><b>-'+formatPrice(totals.discount)+'</b></div>' : '') + '<div class="cm-summary-row"><span>Kargo</span><b>' + (totals.shipping ? formatPrice(totals.shipping) : 'Ücretsiz') + '</b></div><div class="cm-summary-row is-total"><span>Toplam</span><b>' + formatPrice(totals.total) + '</b></div></section>';
  }

  function cartPage() {
    var totals = cartTotals();
    return '<div class="cm-mobile-page cm-mobile-cart">' + header() + '<section class="cm-cart-title"><h1>Sepetim</h1><p>' + totals.count + ' ürün</p></section><div data-cm-cart-content>' + cartContent() + '</div>' + bottomNav('') + '</div>';
  }

  function cartContent() {
    var totals = cartTotals();
    if (!totals.items.length) return '<div class="cm-empty-state"><strong>Sepetin şu an boş.</strong><span>Seçtiğin ürünler burada görünecek.</span><a class="cm-btn cm-btn--primary" href="/allproducts.html">Alışverişe Başla</a></div>';
    var threshold = totals.freeShippingThreshold || freeShippingThreshold();
    var remaining = Math.max(0, threshold - totals.subtotal);
    var progress = threshold ? Math.min(100, Math.round(totals.subtotal / threshold * 100)) : 100;
    var blocked = cartBlockingItems().length;
    return '<div class="cm-cart-list">' + totals.items.map(cartRow).join('') + '</div><form class="cm-coupon-row cm-coupon-row--ref" data-cm-coupon-form><span>' + svg('tag') + '</span><label><strong>İndirim kodun var mı?</strong><input name="coupon" value="' + esc((totals.coupon && totals.coupon.code) || '') + '" placeholder="Kupon kodunu girerek indirim kazanabilirsin." autocomplete="off"></label><button type="submit">Uygula</button>' + (totals.coupon ? '<button type="button" class="cm-coupon-remove" data-cm-remove-coupon>Kuponu kaldır</button>' : '') + '<p data-cm-coupon-status aria-live="polite">' + (totals.discount ? 'Kupon uygulandı: -' + formatPrice(totals.discount) : '') + '</p></form><section class="cm-free-shipping"><div>' + svg('truck') + '<strong>' + (remaining ? 'Ücretsiz kargo için ' + formatPrice(remaining) + ' daha harca!' : 'Siparişin ücretsiz kargo avantajına ulaştı.') + '</strong></div><span><i style="width:' + progress + '%"></i></span><p>' + formatPrice(Math.min(totals.subtotal, threshold)) + ' / ' + formatPrice(threshold) + '</p></section>' + (blocked ? '<p class="cm-cart-warning" aria-live="polite">Sepetinde stok adedi uygun olmayan ürün var. Ödemeye geçmeden önce sepetini güncelle.</p>' : '') + orderSummary(totals, false) + '<div class="cm-cart-sticky"><div><small>Toplam</small><strong>' + formatPrice(totals.total) + '</strong></div><button class="cm-btn cm-btn--primary" type="button" data-cm-proceed-checkout ' + (blocked ? 'disabled aria-disabled="true"' : '') + '>Ödemeye Geç</button></div>';
  }

  function readCheckoutDraft() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_CHECKOUT) || '{}') || {}; } catch (e) { return {}; }
  }

  function writeCheckoutDraft(data) {
    try { sessionStorage.setItem(STORAGE_CHECKOUT, JSON.stringify(data || {})); } catch (e) {}
  }

  function readStoredProfile() {
    var keys = ['cosmoskin_profile', 'cosmoskin_user', 'cosmoskin_account_summary'];
    for (var i = 0; i < keys.length; i += 1) {
      try { var value = JSON.parse(localStorage.getItem(keys[i]) || 'null'); if (value && typeof value === 'object') return value.profile || value.user || value; } catch (e) {}
    }
    return {};
  }

  function checkoutPerson(draft) {
    var profile = readStoredProfile();
    var full = String(draft.full_name || profile.full_name || profile.name || '').trim();
    var first = String(draft.first_name || profile.first_name || '').trim();
    var last = String(draft.last_name || profile.last_name || '').trim();
    if (!first && full) first = full.split(/\s+/)[0] || '';
    if (!last && full) last = full.split(/\s+/).slice(1).join(' ');
    return {
      first_name: first,
      last_name: last,
      name: (full || [first, last].filter(Boolean).join(' ') || 'Teslimat Alıcısı').trim(),
      email: String(draft.email || profile.email || '').trim(),
      phone: String(draft.phone || profile.phone || profile.phone_number || '').trim(),
      address: String(draft.address || profile.address || profile.address_line || '').trim(),
      district: String(draft.district || profile.district || '').trim(),
      city: String(draft.city || profile.city || '').trim()
    };
  }

  function displayAddressLine(person, fallback) {
    var parts = [person.address, person.district, person.city].filter(Boolean);
    return parts.length ? parts.join(', ') : fallback;
  }

  function checkoutSteps(active) {
    var steps = [['cart', 'Sepet'], ['delivery', 'Teslimat'], ['payment', 'Ödeme'], ['confirm', 'Onay']];
    return '<div class="cm-checkout-steps">' + steps.map(function (s, i) { var current = active === s[0]; var done = (active === 'delivery' && i === 0) || (active === 'payment' && i < 2) || (active === 'confirm' && i < 3); return '<span class="' + (current ? 'is-active' : done ? 'is-done' : '') + '"><b>' + (i + 1) + '</b>' + s[1] + '</span>'; }).join('') + '</div>';
  }

  function checkoutPage() {
    var step = new URLSearchParams(location.search).get('step') || 'delivery';
    return step === 'payment' ? checkoutPayment() : checkoutDelivery();
  }

  function checkoutDelivery() {
    var totals = cartTotals();
    var draft = readCheckoutDraft();
    var person = checkoutPerson(draft);
    var addressLine = displayAddressLine(person, 'Teslimat adresini aşağıdaki alanlardan tamamlayın.');
    var workLine = 'Alternatif teslimat adresi eklemek için Yeni Adres Ekle seçeneğini kullanın.';
    return '<div class="cm-mobile-page cm-mobile-checkout cm-mobile-checkout--delivery">' + header({ back: true, checkout: true }) + checkoutSteps('delivery') + '<form class="cm-checkout-form" data-cm-delivery-form novalidate><section class="cm-checkout-title"><h1>Teslimat Bilgileri</h1><p>Siparişinizin teslim edileceği adresi seçin.</p></section><section class="cm-checkout-card"><div class="cm-checkout-card__head"><strong>Kayıtlı Adreslerim</strong><button type="button" data-cm-new-address>' + svg('plus') + ' Yeni Adres Ekle</button></div><label class="cm-address-card is-selected"><input type="radio" name="address_choice" value="home" checked data-cm-select-address><span class="cm-radio-dot"></span><span><b>Ev Adresim <em>Varsayılan</em></b><small>' + esc(person.name) + '<br>' + esc(addressLine) + (person.phone ? '<br>Tel: ' + esc(person.phone) : '') + '</small></span><button type="button" class="cm-address-edit" data-cm-edit-address>' + svg('edit') + '<span>Düzenle</span></button></label><label class="cm-address-card"><input type="radio" name="address_choice" value="work" data-cm-select-address><span class="cm-radio-dot"></span><span><b>İş Adresim</b><small>' + esc(workLine) + '</small></span><button type="button" class="cm-address-edit" data-cm-edit-address>' + svg('edit') + '<span>Düzenle</span></button></label></section><section class="cm-checkout-card"><h2>Teslimat Yöntemi</h2><label class="cm-delivery-method is-selected"><input type="radio" name="delivery_method" value="standard" checked><span class="cm-radio-dot"></span>' + svg('truck') + '<b>Standart Teslimat<small>2–3 iş günü içinde teslimat</small></b><em>Ücretsiz</em></label><label class="cm-delivery-method"><input type="radio" name="delivery_method" value="express"><span class="cm-radio-dot"></span>' + svg('cube') + '<b>Hızlı Teslimat<small>1 iş günü içinde teslimat</small></b><em>' + formatPrice(50) + '</em></label></section><section class="cm-checkout-card"><h2>İletişim Bilgileri</h2><div class="cm-field-grid cm-field-grid--delivery"><label>Ad<input name="first_name" value="' + esc(person.first_name) + '" required autocomplete="given-name"></label><label>Soyad<input name="last_name" value="' + esc(person.last_name) + '" required autocomplete="family-name"></label><label>E-posta<input name="email" value="' + esc(person.email) + '" required type="email" autocomplete="email"></label><label>Telefon<input name="phone" value="' + esc(person.phone) + '" required inputmode="tel" autocomplete="tel"></label><label class="is-full">Adres<textarea name="address" required rows="3" autocomplete="street-address">' + esc(person.address) + '</textarea></label></div><label class="cm-check-row"><input type="checkbox" name="notifications" checked><span>Sipariş süreciyle ilgili bilgilendirmeleri e-posta ve SMS ile almak istiyorum.</span></label><p class="cm-checkout-status" data-cm-checkout-status aria-live="polite"></p></section>' + checkoutMiniSummary(totals) + trustRow() + '<div class="cm-checkout-sticky"><div><small>Toplam</small><strong>' + formatPrice(totals.total) + '</strong></div><button class="cm-btn cm-btn--primary" type="submit" ' + (!totals.items.length ? 'disabled' : '') + '>Ödemeye Geç ' + svg('chevron') + '</button></div></form></div>';
  }

  function checkoutMiniSummary(totals) {
    return '<section class="cm-summary cm-summary--checkout"><div class="cm-summary-title"><h2>Sipariş Özeti</h2><a href="/cart.html">Düzenle</a></div><div class="cm-checkout-minis">' + totals.items.slice(0, 3).map(function (item) { return '<img src="' + esc(item.image) + '" alt="' + esc(item.name) + '">'; }).join('') + '<span>' + totals.count + ' ürün</span></div><div class="cm-summary-row"><span>Ara Toplam</span><b>' + formatPrice(totals.subtotal) + '</b></div><div class="cm-summary-row"><span>Kargo</span><b>' + (totals.shipping ? formatPrice(totals.shipping) : 'Ücretsiz') + '</b></div><div class="cm-summary-row is-total"><span>Toplam</span><b>' + formatPrice(totals.total) + '</b></div></section>';
  }

  function trustRow() {
    return '<section class="cm-cart-trust"><div>' + svg('shield') + '<b>256-bit SSL</b><span>ile güvenli alışveriş</span></div><div>' + svg('help') + '<b>7/24 Müşteri Desteği</b><span>destek@cosmoskin.com.tr</span></div><div>' + svg('leaf') + '<b>Kolay İade</b><span>14 gün içinde iade</span></div></section>';
  }

  function hiddenCheckoutFields(draft) {
    var fields = ['first_name', 'last_name', 'email', 'phone', 'address'];
    return fields.map(function (name) { return '<input type="hidden" name="' + name + '" value="' + esc(draft[name] || '') + '">'; }).join('');
  }

  function checkoutPayment() {
    var totals = cartTotals();
    var draft = readCheckoutDraft();
    var legalDisabled = ' disabled aria-disabled="true"';
    return '<div class="cm-mobile-page cm-mobile-checkout cm-mobile-checkout--payment">' + header({ back: true, checkout: true }) + checkoutSteps('payment') + '<form class="cm-checkout-form" data-cm-checkout-form novalidate>' + hiddenCheckoutFields(draft) + '<input type="hidden" name="invoice_type" value="individual"><section class="cm-checkout-card cm-payment-card"><div class="cm-checkout-card__head"><strong>' + svg('card') + ' Kart ile Ödeme</strong><span>' + svg('lock') + ' 256-bit SSL ile korunur</span></div><div class="cm-card-mock cm-card-mock--iyzico"><b>iyzico Güvenli Ödeme</b><span>Kart bilgileriniz COSMOSKIN tarafından saklanmaz; ödeme mevcut iyzico güvenli ödeme akışıyla tamamlanır.</span><em>VISA / Mastercard / AmEx</em></div><div class="cm-provider-placeholder" role="note"><b>Güvenli ödeme sağlayıcısı kullanılacak.</b><span>“Siparişi Tamamla” seçildiğinde sipariş ve stok bilgileri tekrar doğrulanır, ardından mevcut sağlayıcı akışı başlatılır. Başarı simülasyonu yapılmaz.</span></div></section><section class="cm-checkout-card"><h2>Fatura Bilgileri</h2><div class="cm-segmented"><button type="button" class="is-active" data-cm-invoice="individual">Bireysel</button><button type="button" data-cm-invoice="company">Kurumsal</button></div></section><section class="cm-checkout-card cm-legal-card"><label><input name="kvkk_acknowledged" type="checkbox" required data-cm-legal-check><a href="/legal/kvkk-aydinlatma-metni.html">KVKK Aydınlatma Metni’ni okudum, anladım.</a>' + svg('chevron') + '</label><label><input name="distance_sales_accepted" type="checkbox" required data-cm-legal-check><a href="/legal/mesafeli-satis-sozlesmesi.html">Mesafeli Satış Sözleşmesi’ni okudum, onaylıyorum.</a>' + svg('chevron') + '</label><label><input name="preliminary_information_accepted" type="checkbox" required data-cm-legal-check><a href="/legal/on-bilgilendirme-formu.html">Ön Bilgilendirme Formu’nu okudum, onaylıyorum.</a>' + svg('chevron') + '</label><p class="cm-checkout-status" data-cm-checkout-status aria-live="polite"></p></section><section class="cm-checkout-summary"><button type="button" data-cm-summary-toggle><span>Sipariş Özeti</span><b>' + totals.count + ' ürün</b>' + svg('chevron') + '</button><div class="cm-checkout-summary__detail" hidden>' + totals.items.map(function (item) { return smallCheckoutItem(item); }).join('') + orderSummary(totals, false) + '</div></section><div class="cm-checkout-sticky"><div><small>Ödenecek Tutar</small><strong>' + formatPrice(totals.total) + '</strong></div><button class="cm-btn cm-btn--primary" type="submit" data-cm-payment-submit ' + (!totals.items.length ? 'disabled' : legalDisabled) + '>Siparişi Tamamla ' + svg('chevron') + '</button></div><p class="cm-secure-footnote">' + svg('lock') + ' Ödemeleriniz güvenle işlenir.</p></form></div>';
  }

  function smallCheckoutItem(item) {
    return '<div class="cm-checkout-mini"><img src="' + esc(item.image) + '" alt="' + esc(item.name) + '"><div><strong>' + esc(item.name) + '</strong><span>' + esc(item.brand) + ' · ' + item.qty + ' adet</span></div></div>';
  }

  function getStoredAccountSummary() {
    try { return JSON.parse(localStorage.getItem('cosmoskin_account_summary') || '{}') || {}; } catch (e) { return {}; }
  }

  function getStoredOrders() {
    var summary = getStoredAccountSummary();
    if (Array.isArray(summary.orders) && summary.orders.length) return summary.orders;
    var keys = ['cosmoskin_orders', 'cosmoskin_recent_orders', 'cosmoskin_account_orders'];
    for (var i = 0; i < keys.length; i += 1) {
      try { var value = JSON.parse(localStorage.getItem(keys[i]) || '[]'); if (Array.isArray(value) && value.length) return value; } catch (e) {}
    }
    return [];
  }

  function getStoredSessionToken() {
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (!key || key.indexOf('auth') === -1 && key.indexOf('supabase') === -1 && key.indexOf('sb-') !== 0) continue;
        var raw = localStorage.getItem(key);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        var token = parsed.access_token || parsed?.currentSession?.access_token || parsed?.session?.access_token;
        if (token) return token;
      }
    } catch (e) {}
    return '';
  }

  function profileData() {
    var summary = getStoredAccountSummary();
    var user = summary.user || {};
    try { user = Object.assign({}, user, JSON.parse(localStorage.getItem('cosmoskin_user') || '{}') || {}); } catch (e) {}
    try { user = Object.assign({}, user, JSON.parse(localStorage.getItem('cosmoskin_profile') || '{}') || {}); } catch (e) {}
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (!key || key.indexOf('sb-') !== 0) continue;
        var parsed = JSON.parse(localStorage.getItem(key) || '{}');
        var authUser = parsed.user || parsed?.currentSession?.user || parsed?.session?.user;
        if (authUser) {
          var meta = authUser.user_metadata || {};
          user = Object.assign({}, user, { email: authUser.email || user.email, name: meta.full_name || meta.name || user.name, phone: meta.phone || user.phone });
        }
      }
    } catch (e) {}
    var first = user.first_name || user.firstName || '';
    var last = user.last_name || user.lastName || '';
    var composed = (first || last) ? (first + ' ' + last).trim() : '';
    return { name: user.name || user.full_name || user.display_name || composed || '', email: user.email || '', phone: user.phone || user.phone_number || '' };
  }

  function accountPage() {
    var profile = profileData();
    var tab = new URLSearchParams(location.search).get('tab') || '';
    if (tab === 'favorites') return favoritesPage();
    var logged = Boolean(profile.name || profile.email);
    var name = profile.name || 'COSMOSKIN Üyesi';
    var email = profile.email || 'Hesap bilgilerini tamamla';
    var initials = name.split(/\s+/).map(function (p) { return p.charAt(0); }).join('').slice(0, 2).toUpperCase();
    var orders = getStoredOrders();
    var summary = getStoredAccountSummary();
    var lastOrder = orders[0] || null;
    var lastProduct = null;
    if (lastOrder) { var first = (lastOrder.order_items || lastOrder.items || [])[0] || {}; lastProduct = getProductBySlug(first.product_slug || first.slug || first.url || first.product_id) || normalizeProduct(first); }
    var points = summary.loyalty?.points || summary.points || 0;
    var memberLabel = summary.loyalty?.label || 'Silver Üye';
    var profileCard = '<section class="cm-account-profile-card"><div class="cm-account-avatar">' + esc(initials || 'CS') + '</div><div class="cm-account-profile-main"><strong>' + esc(name) + '</strong><span>' + esc(email) + '</span><em>' + svg('shield') + esc(memberLabel) + '</em><small>' + esc(Number(points || 0).toLocaleString('tr-TR')) + ' Puan' + (logged ? '  |  Üyelik bilgileri' : '  |  Giriş yaparak üyeliğini başlat') + '</small></div><a href="/account/profile.html?tab=profile" aria-label="Profil detayları">' + svg('chevron') + '</a></section>';
    var actions = '<div class="cm-account-action-grid"><a href="/account/profile.html?tab=orders">' + svg('cube') + '<span>Siparişlerim</span></a><a href="/favorites.html">' + svg('heart') + '<span>Favorilerim</span></a><a href="/account/profile.html?tab=addresses">' + svg('tag') + '<span>Adreslerim</span></a><a href="/contact.html">' + svg('help') + '<span>Destek</span></a></div>';
    var order = lastOrder && lastProduct ? '<section class="cm-account-last-order"><div class="cm-account-last-order__media"><img src="' + esc(lastProduct.image) + '" alt="' + esc(lastProduct.name) + '"></div><div class="cm-account-last-order__body"><small>SON SİPARİŞ</small><strong>#' + esc(lastOrder.order_number || lastOrder.number || lastOrder.id || 'Sipariş') + '</strong><span>' + esc(formatOrderDate(lastOrder.date || lastOrder.created_at || lastOrder.createdAt) || 'Sipariş tarihi') + ' · ' + esc(((lastOrder.items || lastOrder.order_items || []).length || 1)) + ' Ürün</span><p>' + esc(lastProduct.brand + ' ' + lastProduct.name) + '</p><em class="cm-status-chip ' + orderStatusMeta(lastOrder.status || lastOrder.fulfillment_status).cls + '">' + esc(orderStatusMeta(lastOrder.status || lastOrder.fulfillment_status).label) + '</em></div><a href="/account/profile.html?tab=orders">Siparişi Görüntüle ' + svg('chevron') + '</a></section>' : '<section class="cm-account-last-order cm-account-last-order--empty"><strong>Son sipariş görünmüyor.</strong><span>İlk siparişini verdiğinde durum kartı burada yer alacak.</span><a href="/allproducts.html">Alışverişe Başla ' + svg('chevron') + '</a></section>';
    var personal = '<section class="cm-account-list"><h2>Kişisel Bilgiler</h2><a href="/account/profile.html?tab=profile">' + svg('user') + '<span>Profil Bilgileri</span>' + svg('chevron') + '</a><a href="/account/profile.html?tab=security">' + svg('lock') + '<span>Şifre ve Güvenlik</span>' + svg('chevron') + '</a><a href="/account/profile.html?tab=addresses">' + svg('tag') + '<span>Kayıtlı Adresler</span>' + svg('chevron') + '</a><a href="/checkout.html?step=payment">' + svg('card') + '<span>Ödeme Yöntemleri</span>' + svg('chevron') + '</a></section>';
    var skin = '<section class="cm-account-skin"><div class="cm-account-section-head"><h2>Cilt Profilim</h2><a href="/routine.html">Rutinimi Güncelle ' + svg('chevron') + '</a></div><div><span>' + svg('drop') + '<strong>Nem</strong><small>Yüksek</small></span><span>' + svg('shield') + '<strong>Bariyer</strong><small>Güçlendir</small></span><span>' + svg('sparkle') + '<strong>Işıltı</strong><small>Hedefim</small></span></div></section>';
    var prefs = '<section class="cm-account-list"><h2>Tercihler</h2><a href="/account/profile.html?tab=notifications">' + svg('bell') + '<span>Bildirimler</span>' + svg('chevron') + '</a><a href="/account/profile.html?tab=language">' + svg('globe') + '<span>Dil / Bölge</span><small>Türkçe / Türkiye</small>' + svg('chevron') + '</a><a href="/legal/kvkk-aydinlatma-metni.html">' + svg('lock') + '<span>Gizlilik Ayarları</span>' + svg('chevron') + '</a><a href="/contact.html">' + svg('help') + '<span>Yardım Merkezi</span>' + svg('chevron') + '</a></section>';
    var logout = logged ? '<button class="cm-account-logout" type="button" data-cm-logout>' + svg('logout') + ' Çıkış Yap</button>' : '<a class="cm-account-login" href="/index.html?auth=login&next=/account/profile.html">Giriş Yap</a>';
    return '<div class="cm-mobile-page cm-mobile-account cm-mobile-account--premium">' + header({ back: true }) + '<div class="cm-page-inner cm-page-inner--top"><h1 class="cm-page-title">Hesabım</h1>' + profileCard + actions + order + personal + skin + prefs + logout + '</div>' + bottomNav('account') + '</div>';
  }


  function orderStatusMeta(status) {
    status = String(status || 'preparing').toLowerCase();
    if (status.indexOf('deliver') !== -1 || status.indexOf('teslim') !== -1) return { label: 'Teslim Edildi', cls: 'is-delivered' };
    if (status.indexOf('ship') !== -1 || status.indexOf('kargo') !== -1 || status.indexOf('packed') !== -1) return { label: 'Kargoda', cls: 'is-shipped' };
    if (status.indexOf('cancel') !== -1 || status.indexOf('iptal') !== -1 || status.indexOf('fail') !== -1) return { label: 'İptal Edildi', cls: 'is-cancelled' };
    return { label: 'Hazırlanıyor', cls: 'is-preparing' };
  }

  function formatOrderDate(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value)); } catch (e) { return String(value); }
  }

  function orderCard(order) {
    var items = order.order_items || order.items || [];
    var first = items[0] || {};
    var product = getProductBySlug(first.product_slug || first.slug || first.url || first.product_id) || normalizeProduct(first) || getProducts()[0];
    var total = Number(order.total || order.total_amount || order.grand_total || (product && product.price) || 0);
    var status = orderStatusMeta(order.status || order.fulfillment_status || order.shipment_status);
    var detailHref = '/account/order-detail.html' + (order.id || order.order_id ? '?id=' + encodeURIComponent(order.id || order.order_id) : '');
    var trackingUrl = order.tracking_url || order.shipment_tracking_url || order.cargo_tracking_url || order.trackingUrl || '';
    var invoice = (order.invoices || []).find(function (inv) { return inv && (inv.pdf_url || inv.url); }) || {};
    var invoiceUrl = order.invoice_url || invoice.pdf_url || invoice.url || '';
    var meta = [first.volume || first.size, (first.quantity || first.qty || 1) + ' Adet'].filter(Boolean).join(' · ');
    return '<article class="cm-order-card"><div class="cm-order-card__top"><div><strong>#' + esc(order.order_number || order.number || order.id || '—') + '</strong><span>' + esc(formatOrderDate(order.date || order.created_at || order.createdAt)) + '</span></div><em class="cm-status-chip ' + status.cls + '">' + esc(status.label) + '</em></div><div class="cm-order-product"><img src="' + esc((product && product.image) || FALLBACK_IMG) + '" alt="' + esc((product && product.name) || 'Sipariş ürünü') + '"><div><small>' + esc((product && product.brand) || '') + '</small><b>' + esc((product && product.name) || 'Sipariş ürünü') + '</b><span>' + esc(meta) + '</span><strong>' + formatPrice(total) + '</strong></div></div><div class="cm-order-actions ' + (!trackingUrl && !invoiceUrl ? 'cm-order-actions--single' : '') + '"><a href="' + detailHref + '">Detayı Gör</a>' + (trackingUrl ? '<a class="is-dark" href="' + esc(trackingUrl) + '">Kargoyu Takip Et</a>' : '') + (invoiceUrl ? '<a href="' + esc(invoiceUrl) + '" download>Faturayı İndir</a>' : '') + '</div></article>';
  }

  function loadMobileAccountSummary() {
    if (accountSummaryRequested || pageType() !== 'account') return;
    var token = getStoredSessionToken();
    if (!token && !(window.cosmoskinSupabase || window.supabase?.createClient)) return;
    accountSummaryRequested = true;
    var finish = function (accessToken) {
      if (!accessToken) return;
      fetch(((window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.apiBase) || '/api').replace(/\/$/, '') + '/account/summary', { headers: { authorization: 'Bearer ' + accessToken } })
        .then(function (res) { return res.json().then(function (json) { if (!res.ok || json.ok === false) throw new Error(json.error || 'Hesap bilgileri alınamadı.'); return json; }); })
        .then(function (data) { localStorage.setItem('cosmoskin_account_summary', JSON.stringify(data)); if (pageType() === 'account') mount(); })
        .catch(function () {});
    };
    if (token) { finish(token); return; }
    try {
      var client = window.cosmoskinSupabase;
      if (!client && window.supabase?.createClient && window.COSMOSKIN_CONFIG?.supabaseUrl && window.COSMOSKIN_CONFIG?.supabaseAnonKey) {
        client = window.supabase.createClient(window.COSMOSKIN_CONFIG.supabaseUrl, window.COSMOSKIN_CONFIG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      }
      if (client?.auth?.getSession) client.auth.getSession().then(function (res) { finish(res?.data?.session?.access_token); }).catch(function () {});
    } catch (e) {}
  }

  function supportOriginalContent() {
    var legalCard = document.querySelector('main .legal-card');
    if (legalCard) return '<div class="cm-embedded-legal">' + legalCard.outerHTML + '</div>';
    var originalTitle = document.querySelector('main h1, .page-title, .section-title');
    var title = originalTitle ? originalTitle.textContent.trim() : '';
    var paragraphs = Array.prototype.slice.call(document.querySelectorAll('main p')).slice(0, 6).map(function (p) { return '<p>' + esc(p.textContent.trim()) + '</p>'; }).join('');
    if (paragraphs) return '<section class="cm-account-card">' + (title ? '<h2>' + esc(title) + '</h2>' : '') + paragraphs + '</section>';
    return '<section class="cm-account-card"><p>Destek ve yasal bağlantılara aşağıdan hızlıca ulaşabilirsiniz.</p></section>';
  }

  function supportPage() {
    var title = /iade/.test(location.pathname) ? 'İade ve Değişim' : /teslimat/.test(location.pathname) ? 'Teslimat ve Kargo' : /mesafeli|on-bilgilendirme|legal/.test(location.pathname) ? 'Yasal Bilgilendirme' : 'Yardım ve Destek';
    return '<div class="cm-mobile-page cm-mobile-support">' + header({ back: true }) + '<div class="cm-page-inner cm-page-inner--top"><h1 class="cm-page-title">' + title + '</h1>' + supportOriginalContent() + '<section class="cm-account-card cm-info-list"><a href="/legal/kvkk-aydinlatma-metni.html">KVKK Aydınlatma Metni</a><a href="/legal/mesafeli-satis-sozlesmesi.html">Mesafeli Satış Sözleşmesi</a><a href="/legal/on-bilgilendirme-formu.html">Ön Bilgilendirme Formu</a><a href="/legal/teslimat-ve-kargo.html">Teslimat ve Kargo</a><a href="/legal/iade-ve-cayma-politikasi.html">İade ve Değişim</a><a href="/contact.html">İletişim</a></section><a class="cm-btn cm-btn--primary cm-btn--wide" href="mailto:destek@cosmoskin.com.tr">Destek Ekibine Yaz</a></div>' + bottomNav('account') + '</div>';
  }

  function footer() {
    return '<footer class="cm-footer"><div class="cm-footer-logo">COSMOSKIN</div><p>Seçilmiş Kore cilt bakım ürünleri. Gereksiz olanı çıkarır, etkili olanı bırakır.</p><div class="cm-footer-grid"><a href="/contact.html">Destek</a><a href="/teslimat-kargo.html">Teslimat</a><a href="/iade-degisim.html">İade</a><a href="/legal/kvkk-aydinlatma-metni.html">KVKK</a></div><div class="cm-payment-row"><img src="/assets/payment/visa.svg" alt="Visa"><img src="/assets/payment/mastercard.svg" alt="Mastercard"><img src="/assets/payment/amex.svg" alt="American Express"><img src="/assets/payment/troy.svg" alt="Troy"></div></footer>';
  }

  function pageHtml() {
    var type = pageType();
    if (type === 'home') return homePage();
    if (type === 'categories') return categoriesPage();
    if (type === 'explore') return explorePage();
    if (type === 'favorites') return favoritesPage();
    if (type === 'routine') return routinePage();
    if (type === 'listing') return listingPage();
    if (type === 'pdp') return pdpPage();
    if (type === 'cart') return cartPage();
    if (type === 'checkout') return checkoutPage();
    if (type === 'account') return accountPage();
    if (type === 'support') return supportPage();
    return '';
  }

  function mount() {
    if (!isMobile()) { unmount(); return; }
    var html = pageHtml();
    if (!html) { unmount(); return; }
    var main = document.body;
    var root = document.getElementById(ROOT_ID);
    if (!root) { root = document.createElement('div'); root.id = ROOT_ID; main.insertBefore(root, main.firstChild); }
    root.innerHTML = html;
    document.documentElement.classList.add('cm-mobile-active');
    document.body.classList.add('cm-mobile-active');
    mounted = true;
    updateBadges();
    syncFavButtons(root);
    syncChoiceCards(root);
    updatePaymentSubmitState(root);
    if (pageType() === 'listing') renderListingGrid();
    refreshInventory(root);
    if (pageType() === 'pdp') loadMobileReviews(root);
    if (pageType() === 'account') loadMobileAccountSummary();
  }

  function unmount() {
    var root = document.getElementById(ROOT_ID);
    var sheet = document.getElementById(SHEET_ID);
    if (root) root.remove();
    if (sheet) sheet.remove();
    document.documentElement.classList.remove('cm-mobile-active');
    document.body.classList.remove('cm-mobile-active', 'cm-sheet-open');
    mounted = false;
  }

  function updateBadges() {
    var count = cartTotals().count;
    Array.prototype.slice.call(document.querySelectorAll('[data-cm-cart-badge]')).forEach(function (el) {
      el.textContent = String(count);
      el.style.display = count ? 'grid' : 'none';
    });
  }

  function addToCart(slug, qty) {
    var p = getProductBySlug(slug) || getCurrentProduct();
    if (!p) return;
    var info = stockInfo(p.slug);
    if (!info.canBuy) { toast('Bu ürün şu anda stokta yok.'); return; }
    var requestedQty = Math.max(1, Number(qty || 1));
    var max = stockQuantityLimit(p.slug);
    var currentQty = cartItems().filter(function (item) { return item.slug === p.slug; }).reduce(function (sum, item) { return sum + Number(item.qty || 1); }, 0);
    if (currentQty + requestedQty > max) { toast('Sepete eklemek istediğin adet stok miktarını aşıyor.'); return; }
    var payload = { slug: p.slug, id: p.slug, product_slug: p.slug, name: p.name, brand: p.brand, price: p.price, image: p.image, url: p.url, qty: requestedQty, quantity: requestedQty };
    var finish = function () {
      var items = cartItems();
      var existing = items.find(function (item) { return item.slug === p.slug; });
      if (existing) existing.qty += payload.qty;
      else items.push(payload);
      saveCart(items);
      toast('Ürün sepetinize eklendi.');
      if (pageType() === 'cart') mount();
    };
    if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.validateAdd === 'function') {
      window.COSMOSKIN_STOCK.validateAdd(payload).then(function (ok) { if (ok) finish(); else applyInventory(document); }).catch(function () { toast('Stok kontrolü tamamlanamadı.'); });
    } else finish();
  }

  function updateCartQty(slug, delta) {
    var items = cartItems().map(function (item) {
      if (item.slug === slug) {
        var nextQty = Math.max(0, Number(item.qty || 1) + delta);
        var max = stockQuantityLimit(slug);
        if (nextQty > max) { nextQty = Number(item.qty || 1); toast('Bu ürün için seçilebilecek maksimum stok adedine ulaştın.'); }
        item.qty = nextQty;
      }
      return item;
    }).filter(function (item) { return item.qty > 0; });
    saveCart(items);
    if (pageType() === 'cart' || pageType() === 'checkout') mount();
  }

  function removeCart(slug) {
    saveCart(cartItems().filter(function (item) { return item.slug !== slug; }));
    toast('Ürün sepetten çıkarıldı.');
    if (pageType() === 'cart' || pageType() === 'checkout') mount();
  }

  function openSheet(kind) {
    var root = document.getElementById(SHEET_ID);
    if (!root) { root = document.createElement('div'); root.id = SHEET_ID; document.body.appendChild(root); }
    root.innerHTML = sheetHtml(kind);
    document.body.classList.add('cm-sheet-open');
    var first = root.querySelector('button, a, input');
    if (first) setTimeout(function () { first.focus(); }, 40);
  }

  function closeSheet() {
    var root = document.getElementById(SHEET_ID);
    if (root) root.innerHTML = '';
    document.body.classList.remove('cm-sheet-open');
  }

  function sheetHtml(kind) {
    if (kind === 'menu') {
      var primary = [
        ['/categories.html', 'Kategoriler', 'grid'],
        ['/allproducts.html', 'Tüm Ürünler', 'drop'],
        ['/brands.html', 'Markalar', 'leaf'],
        ['/collections/bestsellers.html', 'Çok Satanlar', 'crown'],
        ['/collections/protect.html', 'Güneş Bakımı', 'sun'],
        ['/routine.html', 'Akıllı Rutin', 'bottle']
      ];
      var secondary = [
        ['/account/profile.html', 'Hesabım', 'user'],
        ['/favorites.html', 'Favorilerim', 'heart'],
        ['/order-tracking.html', 'Sipariş Takibi', 'cube'],
        ['/contact.html', 'İletişim', 'mail']
      ];
      var linkRow = function (l) { return '<a href="' + l[0] + '">' + svg(l[2]) + '<span>' + l[1] + '</span>' + svg('chevron') + '</a>'; };
      return '<div class="cm-sheet-dim cm-sheet-dim--drawer" data-cm-close-sheet></div><aside class="cm-mobile-drawer" role="dialog" aria-modal="true" aria-label="Menü"><div class="cm-drawer-head"><button type="button" data-cm-close-sheet aria-label="Kapat">×</button><a href="/index.html">COSMOSKIN</a><div><a class="cm-drawer-icon" href="/favorites.html">' + svg('heart') + '</a><a class="cm-drawer-icon" href="/cart.html">' + svg('bag') + '<span class="cm-badge" data-cm-cart-badge>0</span></a></div></div><nav class="cm-drawer-links cm-drawer-links--primary">' + primary.map(linkRow).join('') + '</nav><nav class="cm-drawer-links cm-drawer-links--secondary">' + secondary.map(linkRow).join('') + '</nav><div class="cm-drawer-social"><a href="https://www.instagram.com/cosmoskin.tr" aria-label="Instagram">' + svg('instagram') + '</a></div><div class="cm-drawer-legal"><a href="/legal/cerez-politikasi.html">Gizlilik Politikası</a><span>|</span><a href="/legal/uyelik-sozlesmesi.html">Kullanım Şartları</a><span>|</span><a href="/legal/kvkk-aydinlatma-metni.html">KVKK</a></div><p class="cm-drawer-copy">© 2026 COSMOSKIN. Tüm hakları saklıdır.</p></aside>';
    }
    if (kind === 'share') {
      var product = getCurrentProduct();
      return '<div class="cm-sheet-dim" data-cm-close-sheet></div><section class="cm-sheet cm-share-sheet" role="dialog" aria-modal="true" aria-label="Ürünü paylaş"><div class="cm-sheet-head"><strong>Ürünü paylaş</strong><button type="button" data-cm-close-sheet aria-label="Kapat">×</button></div><div class="cm-share-preview"><img src="' + esc(product.image || FALLBACK_IMG) + '" alt="' + esc(product.name || 'Ürün') + '"><div><small>' + esc(product.brand || 'COSMOSKIN') + '</small><b>' + esc(product.name || document.title) + '</b><span>' + formatPrice(product.price || 0) + '</span></div></div><div class="cm-share-actions"><button type="button" data-cm-copy-link>' + svg('link') + '<span>Ürün linkini kopyala</span></button><a href="https://wa.me/?text=' + encodeURIComponent((product.name || document.title) + ' ' + location.href) + '" target="_blank" rel="noopener">' + svg('message') + '<span>WhatsApp ile paylaş</span></a><button type="button" data-cm-native-share>' + svg('share') + '<span>Paylaş menüsünü aç</span></button></div></section>';
    }
    if (kind === 'sort') {
      var sortOptions = [['featured', 'Önerilen'], ['new', 'Yeni Gelenler'], ['price-asc', 'Fiyat Artan'], ['price-desc', 'Fiyat Azalan'], ['rating', 'Puan']];
      return '<div class="cm-sheet-dim" data-cm-close-sheet></div><section class="cm-sheet" role="dialog" aria-modal="true" aria-label="Sırala"><div class="cm-sheet-head"><strong>Sırala</strong><button type="button" data-cm-close-sheet aria-label="Kapat">×</button></div>' + sortOptions.map(function (o) { return '<button class="cm-sheet-option ' + (listingState.sort === o[0] ? 'is-selected' : '') + '" type="button" data-cm-sort="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</section>';
    }
    var cats = CATEGORY_ROUTES.filter(function (c) { return c.category; }).map(function (c) { return c.category; });
    var brands = Array.from(new Set(getProducts().map(function (p) { return p.brand; }).filter(Boolean)));
    var concerns = ['Nem', 'Bariyer', 'Işıltı', 'Akne', 'Hassasiyet', 'Gözenek'];
    var skins = ['Kuru', 'Karma', 'Yağlı', 'Hassas'];
    var priceOptions = [['', 'Tümü'], ['under800', '800 TL altı'], ['800-1000', '800–1.000 TL'], ['over1000', '1.000 TL üzeri']];
    return '<div class="cm-sheet-dim" data-cm-close-sheet></div><section class="cm-sheet" role="dialog" aria-modal="true" aria-label="Filtrele"><div class="cm-sheet-head"><strong>Filtrele</strong><button type="button" data-cm-close-sheet aria-label="Kapat">×</button></div><h3>Kategori</h3><div class="cm-sheet-chips"><button type="button" data-cm-filter-category="" class="' + (!listingState.category ? 'is-selected' : '') + '">Tümü</button>' + cats.map(function (c) { return '<button type="button" data-cm-filter-category="' + esc(c) + '" class="' + (listingState.category === c ? 'is-selected' : '') + '">' + esc(c) + '</button>'; }).join('') + '</div><h3>Marka</h3><div class="cm-sheet-chips"><button type="button" data-cm-filter-brand="" class="' + (!listingState.brand ? 'is-selected' : '') + '">Tümü</button>' + brands.map(function (b) { return '<button type="button" data-cm-filter-brand="' + esc(b) + '" class="' + (listingState.brand === b ? 'is-selected' : '') + '">' + esc(b) + '</button>'; }).join('') + '</div><h3>Cilt Tipi</h3><div class="cm-sheet-chips"><button type="button" data-cm-filter-skin="" class="' + (!listingState.skin ? 'is-selected' : '') + '">Tümü</button>' + skins.map(function (c) { return '<button type="button" data-cm-filter-skin="' + esc(c) + '" class="' + (listingState.skin === c ? 'is-selected' : '') + '">' + esc(c) + '</button>'; }).join('') + '</div><h3>Cilt İhtiyacı</h3><div class="cm-sheet-chips"><button type="button" data-cm-filter-concern="" class="' + (!listingState.concern ? 'is-selected' : '') + '">Tümü</button>' + concerns.map(function (c) { return '<button type="button" data-cm-filter-concern="' + esc(c) + '" class="' + (listingState.concern === c ? 'is-selected' : '') + '">' + esc(c) + '</button>'; }).join('') + '</div><h3>Fiyat</h3><div class="cm-sheet-chips">' + priceOptions.map(function (o) { return '<button type="button" data-cm-filter-price="' + o[0] + '" class="' + (listingState.price === o[0] ? 'is-selected' : '') + '">' + o[1] + '</button>'; }).join('') + '</div><h3>Stok</h3><div class="cm-sheet-chips"><button type="button" data-cm-filter-stock="" class="' + (!listingState.stock ? 'is-selected' : '') + '">Tümü</button><button type="button" data-cm-filter-stock="in" class="' + (listingState.stock === 'in' ? 'is-selected' : '') + '">Stokta</button></div><div class="cm-sheet-actions"><button class="cm-btn" type="button" data-cm-clear-filters>Temizle</button><button class="cm-btn cm-btn--primary" type="button" data-cm-close-sheet>Uygula</button></div></section>';
  }

  function reviewName(review) {
    return review.user_display_name || review.display_name || review.customer_name || review.name || 'COSMOSKIN Müşterisi';
  }

  function reviewRating(review) {
    var rating = Number(review.rating || review.stars || review.score || 0);
    return Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0;
  }

  function reviewDate(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); } catch (e) { return String(value).slice(0, 10); }
  }

  function renderReviewStars(value) {
    var rating = reviewRating({ rating: value });
    return '<span class="cm-stars" aria-label="' + rating + ' yıldız">' + '★★★★★'.slice(0, rating) + '</span>';
  }

  function reviewCard(review) {
    var name = reviewName(review);
    var initials = name.split(/\s+/).map(function (n) { return n.charAt(0); }).join('').slice(0, 2).toUpperCase();
    var verified = review.verified_purchase === true || review.is_verified_purchase === true || review.verified === true;
    var date = reviewDate(review.created_at || review.date || review.updated_at);
    return '<article class="cm-review-card" data-cm-review-rating="' + reviewRating(review) + '"><div class="cm-review-card__head"><span class="cm-review-avatar">' + esc(initials || 'CS') + '</span><div><strong>' + esc(name) + '</strong><span>' + renderReviewStars(reviewRating(review)) + (date ? '<em>' + esc(date) + '</em>' : '') + '</span></div></div>' + (verified ? '<small class="cm-verified">' + svg('shield') + 'Doğrulanmış Alışveriş</small>' : '') + '<p>' + esc(review.body || review.comment || review.content || review.title || '') + '</p></article>';
  }

  function reviewSectionHtml(list, slug) {
    var ratings = list.map(reviewRating).filter(Boolean);
    var avg = ratings.length ? ratings.reduce(function (sum, value) { return sum + value; }, 0) / ratings.length : 0;
    var summary = ratings.length ? '<div class="cm-review-summary"><strong>' + avg.toFixed(1).replace('.', ',') + '</strong><span>' + ratings.length.toLocaleString('tr-TR') + ' yorum</span></div>' : '';
    var filters = ['Tümü', '5★', '4★', '3★', '2★', '1★'].map(function (label, index) { return '<button type="button" class="' + (index === 0 ? 'is-active' : '') + '" data-cm-review-filter="' + (index === 0 ? 'all' : 6 - index) + '">' + label + '</button>'; }).join('');
    return '<div class="cm-section-head"><h2>Müşteri Yorumları</h2><a class="cm-see-all" href="/products/' + esc(slug) + '.html#reviewsSection">Tümünü Gör ' + svg('chevron') + '</a></div>' + summary + '<div class="cm-review-filters" role="list" aria-label="Yorum filtreleri">' + filters + '</div><div class="cm-review-list">' + list.slice(0, 6).map(reviewCard).join('') + '</div>';
  }

  function loadMobileReviews(root) {
    var host = root.querySelector('[data-cm-mobile-reviews]');
    if (!host) return;
    var slug = host.dataset.productSlug;
    if (location.protocol === 'file:') { host.querySelector('.cm-review-empty').textContent = 'Yorumlar canlı API ile yayın ortamında yüklenir.'; return; }
    fetch(((window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.apiBase) || '/api').replace(/\/$/, '') + '/reviews?product_slug=' + encodeURIComponent(slug))
      .then(function (res) { return res.json().then(function (json) { if (!res.ok) throw new Error(json.error || 'Yorumlar yüklenemedi.'); return json; }); })
      .then(function (data) {
        var list = Array.isArray(data.reviews) ? data.reviews : [];
        if (!list.length) { host.querySelector('.cm-review-empty').textContent = 'Bu ürün için henüz yorum bulunmuyor.'; return; }
        host.innerHTML = reviewSectionHtml(list, slug);
      })
      .catch(function () { host.querySelector('.cm-review-empty').textContent = 'Yorumlar şu anda yüklenemedi. Lütfen daha sonra tekrar dene.'; });
  }

  function toast(message) {
    var el = document.querySelector('.cm-mobile-toast');
    if (!el) { el = document.createElement('div'); el.className = 'cm-mobile-toast'; document.body.appendChild(el); }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove('is-visible'); }, 2200);
  }

  function updatePaymentSubmitState(root) {
    root = root || document;
    var form = root.querySelector('[data-cm-checkout-form]');
    if (!form) return;
    var submit = form.querySelector('[data-cm-payment-submit]');
    if (!submit) return;
    var legalChecks = Array.prototype.slice.call(form.querySelectorAll('[data-cm-legal-check]'));
    var allChecked = legalChecks.length && legalChecks.every(function (box) { return box.checked; });
    var hasItems = cartTotals().items.length > 0;
    submit.disabled = !(allChecked && hasItems);
    submit.setAttribute('aria-disabled', submit.disabled ? 'true' : 'false');
  }

  function syncChoiceCards(root) {
    root = root || document;
    Array.prototype.slice.call(root.querySelectorAll('.cm-address-card')).forEach(function (card) {
      var input = card.querySelector('input[type="radio"]');
      card.classList.toggle('is-selected', Boolean(input && input.checked));
    });
    Array.prototype.slice.call(root.querySelectorAll('.cm-delivery-method')).forEach(function (card) {
      var input = card.querySelector('input[type="radio"]');
      card.classList.toggle('is-selected', Boolean(input && input.checked));
    });
  }

  function bind() {
    if (listenersBound) return;
    listenersBound = true;
    document.addEventListener('click', function (event) {
      var target = event.target;
      if (target.closest('[data-cm-open-menu]')) { event.preventDefault(); openSheet('menu'); return; }
      if (target.closest('[data-cm-remove-coupon]')) { event.preventDefault(); localStorage.removeItem('cosmoskin_coupon_state_v1'); toast('Kupon kaldırıldı.'); if (pageType() === 'cart' || pageType() === 'checkout') mount(); return; }
      if (target.closest('[data-cm-back]')) { event.preventDefault(); if (history.length > 1) history.back(); else location.href = '/index.html'; return; }
      var fav = target.closest('.favorite-btn');
      if (fav && fav.closest('#' + ROOT_ID)) { event.preventDefault(); event.stopPropagation(); toggleFavorite({ slug: fav.dataset.slug || fav.dataset.favoriteId, id: fav.dataset.id, name: fav.dataset.name, brand: fav.dataset.brand, price: Number(fav.dataset.price || 0), image: fav.dataset.image, url: fav.dataset.url }); return; }
      var add = target.closest('[data-cm-add-cart]');
      if (add) { event.preventDefault(); if (add.disabled) { toast('Bu ürün şu anda stokta yok.'); return; } addToCart(add.getAttribute('data-cm-add-cart'), add.getAttribute('data-cm-qty') === 'pdp' ? currentPdpQty : 1); return; }
      var inc = target.closest('[data-cm-cart-inc]'); if (inc) { event.preventDefault(); updateCartQty(inc.getAttribute('data-cm-cart-inc'), 1); return; }
      var dec = target.closest('[data-cm-cart-dec]'); if (dec) { event.preventDefault(); updateCartQty(dec.getAttribute('data-cm-cart-dec'), -1); return; }
      var rem = target.closest('[data-cm-cart-remove]'); if (rem) { event.preventDefault(); removeCart(rem.getAttribute('data-cm-cart-remove')); return; }
      if (target.closest('[data-cm-pdp-inc]')) { var pdpSlug = document.querySelector('.cm-mobile-pdp')?.dataset.productSlug || extractSlug(location.pathname); var limit = stockQuantityLimit(pdpSlug); if (currentPdpQty + 1 > limit) { toast('Bu ürün için seçilebilecek maksimum stok adedine ulaştın.'); return; } currentPdpQty += 1; var q = document.querySelector('[data-cm-pdp-qty]'); if (q) q.textContent = String(currentPdpQty); return; }
      if (target.closest('[data-cm-pdp-dec]')) { currentPdpQty = Math.max(1, currentPdpQty - 1); var q2 = document.querySelector('[data-cm-pdp-qty]'); if (q2) q2.textContent = String(currentPdpQty); return; }
      if (target.closest('[data-cm-proceed-checkout]')) { event.preventDefault(); var cartStatus = document.querySelector('.cm-cart-warning'); validateCartBeforeContinue(cartStatus, function () { location.href = '/checkout.html?step=delivery'; }); return; }
      if (target.closest('[data-cm-new-address]')) { event.preventDefault(); var addressField = document.querySelector('[name="address"]'); if (addressField) { addressField.focus(); addressField.select && addressField.select(); } toast('Yeni adres bilgilerini aşağıdaki alanlardan girebilirsiniz.'); return; }
      if (target.closest('[data-cm-edit-address]')) { event.preventDefault(); var addressField2 = document.querySelector('[name="address"]'); if (addressField2) addressField2.focus(); toast('Adres alanını düzenleyebilirsiniz.'); return; }
      if (target.closest('[data-cm-open-filter]')) { event.preventDefault(); openSheet('filter'); return; }
      if (target.closest('[data-cm-open-sort]')) { event.preventDefault(); openSheet('sort'); return; }
      if (target.closest('[data-cm-close-sheet]')) { event.preventDefault(); closeSheet(); return; }
      var sort = target.closest('[data-cm-sort]'); if (sort) { listingState.sort = sort.getAttribute('data-cm-sort'); closeSheet(); if (pageType() === 'listing') renderListingGrid(); else mount(); return; }
      var cat = target.closest('[data-cm-filter-category]'); if (cat) { listingState.category = cat.getAttribute('data-cm-filter-category'); renderListingGrid(); openSheet('filter'); return; }
      var brand = target.closest('[data-cm-filter-brand]'); if (brand) { listingState.brand = brand.getAttribute('data-cm-filter-brand'); renderListingGrid(); openSheet('filter'); return; }
      var stock = target.closest('[data-cm-filter-stock]'); if (stock) { listingState.stock = stock.getAttribute('data-cm-filter-stock'); renderListingGrid(); openSheet('filter'); return; }
      var filterRemove = target.closest('[data-cm-filter-remove]'); if (filterRemove) { listingState[filterRemove.getAttribute('data-cm-filter-remove')] = ''; renderListingGrid(); mount(); return; }
      var filterSkin = target.closest('[data-cm-filter-skin]'); if (filterSkin) { listingState.skin = filterSkin.getAttribute('data-cm-filter-skin'); renderListingGrid(); openSheet('filter'); return; }
      var concern = target.closest('[data-cm-filter-concern]'); if (concern) { listingState.concern = concern.getAttribute('data-cm-filter-concern'); renderListingGrid(); openSheet('filter'); return; }
      var price = target.closest('[data-cm-filter-price]'); if (price) { listingState.price = price.getAttribute('data-cm-filter-price'); renderListingGrid(); openSheet('filter'); return; }
      if (target.closest('[data-cm-clear-filters]')) { listingState.category = ''; listingState.brand = ''; listingState.stock = ''; listingState.skin = ''; listingState.concern = ''; listingState.price = ''; renderListingGrid(); openSheet('filter'); return; }
      var skin = target.closest('[data-cm-routine-skin]'); if (skin) { routineState.skin = skin.getAttribute('data-cm-routine-skin'); mount(); return; }
      var goal = target.closest('[data-cm-routine-goal]'); if (goal) { routineState.goal = goal.getAttribute('data-cm-routine-goal'); mount(); return; }
      var period = target.closest('[data-cm-routine-period]'); if (period) { routineState.period = period.getAttribute('data-cm-routine-period'); mount(); return; }
      if (target.closest('[data-cm-add-routine]')) { if (!routineState.goal) { toast('Önce cilt hedefini seçmelisin.'); return; } var routineProducts = currentRoutineProducts(); var added = 0; var skipped = 0; routineProducts.forEach(function (p) { if (stockInfo(p.slug).canBuy) { addToCart(p.slug, 1); added += 1; } else skipped += 1; }); localStorage.setItem(STORAGE_ROUTINE, JSON.stringify({ state: routineState, products: routineProducts.map(function (p) { return p.slug; }), savedAt: new Date().toISOString() })); toast(added ? (added + ' ürün rutinden sepete eklendi' + (skipped ? ', stokta olmayanlar atlandı.' : '.')) : 'Rutindeki ürünler şu anda stokta değil.'); return; }
      if (target.closest('[data-cm-share]')) { event.preventDefault(); openSheet('share'); return; }
      if (target.closest('[data-cm-copy-link]')) { event.preventDefault(); if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { toast('Ürün linki kopyalandı.'); closeSheet(); }); else toast('Link: ' + location.href); return; }
      if (target.closest('[data-cm-native-share]')) { event.preventDefault(); var shareProduct = getCurrentProduct(); if (navigator.share) navigator.share({ title: shareProduct.name || document.title, text: shareProduct.brand ? shareProduct.brand + ' ' + shareProduct.name : document.title, url: location.href }).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { toast('Ürün linki kopyalandı.'); }); return; }
      if (target.closest('[data-cm-zoom]')) { var img = document.querySelector('.cm-pdp-product'); if (img) openImageModal(img.src, img.alt); return; }
      var reviewFilter = target.closest('[data-cm-review-filter]'); if (reviewFilter) { event.preventDefault(); var wrap = reviewFilter.closest('.cm-mobile-reviews'); if (wrap) { Array.prototype.slice.call(wrap.querySelectorAll('[data-cm-review-filter]')).forEach(function (btn) { btn.classList.toggle('is-active', btn === reviewFilter); }); var value = reviewFilter.getAttribute('data-cm-review-filter'); Array.prototype.slice.call(wrap.querySelectorAll('[data-cm-review-rating]')).forEach(function (card) { card.hidden = value !== 'all' && card.getAttribute('data-cm-review-rating') !== value; }); } return; }
      var invoice = target.closest('[data-cm-invoice]'); if (invoice) { event.preventDefault(); Array.prototype.slice.call(invoice.parentNode.querySelectorAll('[data-cm-invoice]')).forEach(function (btn) { btn.classList.toggle('is-active', btn === invoice); }); var hidden = invoice.closest('form').querySelector('input[name="invoice_type"]'); if (hidden) hidden.value = invoice.getAttribute('data-cm-invoice'); return; }
      if (target.closest('[data-cm-summary-toggle]')) { event.preventDefault(); var detail = document.querySelector('.cm-checkout-summary__detail'); if (detail) detail.hidden = !detail.hidden; return; }
      if (target.closest('[data-cm-logout]')) { event.preventDefault(); var done = function () { localStorage.removeItem('cosmoskin_user'); localStorage.removeItem('cosmoskin_profile'); localStorage.removeItem('cosmoskin_account_summary'); toast('Çıkış yapıldı.'); setTimeout(function () { location.href = '/index.html'; }, 300); }; try { var client = window.cosmoskinSupabase; if (!client && window.supabase?.createClient && window.COSMOSKIN_CONFIG?.supabaseUrl && window.COSMOSKIN_CONFIG?.supabaseAnonKey) client = window.supabase.createClient(window.COSMOSKIN_CONFIG.supabaseUrl, window.COSMOSKIN_CONFIG.supabaseAnonKey); if (client?.auth?.signOut) { client.auth.signOut().finally(done); } else done(); } catch (e) { done(); } return; }
      var modalClose = target.closest('[data-cm-modal-close]'); if (modalClose) { event.preventDefault(); var modal = document.querySelector('.cm-image-modal'); if (modal) modal.remove(); return; }
    }, true);

    document.addEventListener('submit', function (event) {
      var target = event.target;
      if (target.matches('[data-cm-coupon-form]')) { event.preventDefault(); var status = target.querySelector('[data-cm-coupon-status]'); var input = target.querySelector('input[name="coupon"]'); var code = (input && input.value || '').trim().toUpperCase(); if (!code) { localStorage.removeItem('cosmoskin_coupon_state_v1'); if (status) status.textContent = 'Kupon kaldırıldı.'; if (pageType() === 'cart' || pageType() === 'checkout') mount(); return; } if (code === 'COSMOSKIN10') { localStorage.setItem('cosmoskin_coupon_state_v1', JSON.stringify({ ok:true, code:code, title:'İlk alışverişe özel %10', type:'percent', value:10, maxDiscount:300, minSubtotal:750 })); toast('Kupon uygulandı.'); if (pageType() === 'cart' || pageType() === 'checkout') mount(); return; } if (status) status.textContent = 'Kupon doğrulanıyor...'; fetch('/api/coupons/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code,cart:cartItems(),subtotal:cartTotals().subtotal})}).then(function(res){return res.json().then(function(json){ if(!res.ok || json.ok === false) throw new Error(json.error || 'Kupon geçersiz.'); return json;});}).then(function(json){ localStorage.setItem('cosmoskin_coupon_state_v1', JSON.stringify(Object.assign({}, json, { ok:true, code:json.code || code }))); toast('Kupon uygulandı.'); if (pageType() === 'cart' || pageType() === 'checkout') mount(); }).catch(function(err){ localStorage.removeItem('cosmoskin_coupon_state_v1'); if(status) status.textContent = err.message || 'Kupon geçersiz.'; toast(err.message || 'Kupon geçersiz.'); }); return; }
      if (event.target.matches('[data-cm-delivery-form]')) { event.preventDefault(); var invalid = Array.prototype.slice.call(event.target.querySelectorAll('input, textarea, select')).find(function (field) { return !field.checkValidity(); }); var statusEl = event.target.querySelector('[data-cm-checkout-status]'); if (invalid) { invalid.focus(); if (statusEl) statusEl.textContent = 'Teslimat ve iletişim bilgilerini tamamlayın.'; return; } var data = {}; new FormData(event.target).forEach(function (value, key) { data[key] = value; }); validateCartBeforeContinue(statusEl, function () { writeCheckoutDraft(data); location.href = '/checkout.html?step=payment'; }); return; }
      if (event.target.matches('[data-cm-checkout-form]')) { event.preventDefault(); submitCheckout(event.target); return; }
    });

    document.addEventListener('change', function (event) {
      if (event.target.matches('.cm-address-card input[type="radio"], .cm-delivery-method input[type="radio"]')) syncChoiceCards(document);
      if (event.target.matches('[data-cm-legal-check]')) updatePaymentSubmitState(document);
    });

    window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(mount, 150); });
    window.addEventListener('cosmoskin:inventory-updated', function () { if (mounted) applyInventory(document.getElementById(ROOT_ID) || document); });
    window.addEventListener('cosmoskin:cart-updated', function () { updateBadges(); });
    window.addEventListener('storage', function (e) { if (e.key === STORAGE_CART || e.key === STORAGE_FAVORITES) mount(); });
    document.addEventListener('cosmoskin:products-updated', function () { if (mounted) mount(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') { closeSheet(); var modal = document.querySelector('.cm-image-modal'); if (modal) modal.remove(); } });
  }

  function submitCheckout(form) {
    var status = form.querySelector('[data-cm-checkout-status]');
    var invalid = Array.prototype.slice.call(form.querySelectorAll('input, textarea, select')).find(function (field) { return !field.checkValidity(); });
    if (invalid) { invalid.focus(); if (status) status.textContent = 'Zorunlu sözleşme onaylarını tamamlayın.'; updatePaymentSubmitState(form); return; }
    var nativeForm = document.getElementById('checkoutForm');
    var proceed = function () {
      if (status) status.textContent = 'Güvenli ödeme hazırlanıyor...';
      if (nativeForm) {
        var data = new FormData(form);
        data.forEach(function (value, key) {
          var target = nativeForm.elements[key];
          if (!target) return;
          if (target.type === 'checkbox') target.checked = value === 'on' || value === 'true';
          else target.value = value;
        });
        var root = document.getElementById(ROOT_ID);
        if (root) root.style.display = 'none';
        document.documentElement.classList.remove('cm-mobile-active');
        document.body.classList.remove('cm-mobile-active');
        setTimeout(function () { if (nativeForm.requestSubmit) nativeForm.requestSubmit(); else nativeForm.submit(); }, 80);
      } else if (status) status.textContent = 'Ödeme formu bulunamadı. Lütfen sayfayı yenileyin.';
    };
    validateCartBeforeContinue(status, proceed);
  }

  function openImageModal(src, alt) {
    var old = document.querySelector('.cm-image-modal');
    if (old) old.remove();
    var modal = document.createElement('div');
    modal.className = 'cm-image-modal';
    modal.innerHTML = '<button type="button" data-cm-modal-close aria-label="Kapat">×</button><img src="' + esc(src) + '" alt="' + esc(alt || '') + '">';
    document.body.appendChild(modal);
  }

  function init() {
    bind();
    mount();
    var authMode = new URLSearchParams(location.search).get('auth');
    if (authMode) {
      setTimeout(function () {
        document.dispatchEvent(new CustomEvent('cosmoskin:open-auth-modal', { detail: { tab: authMode === 'signup' ? 'registerPanel' : 'loginPanel' } }));
      }, 250);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
