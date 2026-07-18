(function ensureCartCommerceScripts() {
  if (!window.COSMOSKIN_COUPON) {
    document.write('<script src="/assets/coupon-client.js?v=20260708-c2"><\/script>');
  }
  if (!window.COSMOSKIN_CART_COMMERCE) {
    document.write('<script src="/assets/cart-commerce.js?v=20260709-c3"><\/script>');
  }
  if (!window.COSMOSKINFavorites) {
    document.write('<script src="/assets/favorites-store.js?v=20260712-e1"><\/script>');
  }
}());

(function () {
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const cfg = window.COSMOSKIN_CONFIG || {};
  const VAT = Number(cfg.vatRate ?? 0.20);
  const FREE_SHIPPING = Number(cfg.freeShippingThreshold ?? 2500);
  const SHIPPING_FEE = Number(cfg.shippingFee ?? 89);
  const state = {
    cart: JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'),
    favorites: [],
    consent: JSON.parse(localStorage.getItem('cosmoskin_consent') || 'null')
  };
  const FAVORITES_KEY = 'cosmoskin_favorites';

  function favoritesStore() {
    return window.COSMOSKINFavorites || null;
  }

  function syncFavoritesState() {
    const store = favoritesStore();
    state.favorites = store ? store.get() : [];
    return state.favorites;
  }

  syncFavoritesState();

  function showFavoriteToast(message) {
    if (!message) return;
    let toast = document.querySelector('.favorite-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'favorite-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showFavoriteToast._timer);
    showFavoriteToast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 1800);
  }


  const backdrop = $('#backdrop');
  const cartDrawer = $('#cartDrawer');
  const accountDrawer = $('#accountDrawer');
  const cookieBanner = $('#cookieBanner');
  const prefModal = $('#cookiePreferences');
  const legalModal = $('#legalModal');
  const progress = $('#progress');
  const mobileNav = $('#mobileNav');
  let megaTimer;


  function alignMegaPanel(wrap) {
    const mega = wrap?.querySelector('.mega');
    if (!mega || window.innerWidth <= 768) return;
    mega.style.setProperty('--mega-nudge-x', '0px');
    requestAnimationFrame(() => {
      const rect = mega.getBoundingClientRect();
      const pad = 18;
      let nudge = 0;
      if (rect.left < pad) nudge = pad - rect.left;
      if (rect.right > window.innerWidth - pad) nudge = (window.innerWidth - pad) - rect.right;
      mega.style.setProperty('--mega-nudge-x', `${Math.round(nudge)}px`);
    });
  }

  function closeAllMegaMenus(exceptWrap = null) {
    ['.categories-wrap', '.brands-wrap'].forEach((selector) => {
      const wrap = $(selector);
      if (!wrap || wrap === exceptWrap) return;
      wrap.classList.remove('open');
    });
    [
      ['.categories-wrap', '.categories-trigger'],
      ['.brands-wrap', '.brands-trigger']
    ].forEach(([wrapSelector, triggerSelector]) => {
      const wrap = $(wrapSelector);
      const trigger = wrap?.querySelector(triggerSelector);
      if (!trigger) return;
      trigger.setAttribute('aria-expanded', wrap?.classList.contains('open') ? 'true' : 'false');
    });
  }

  function fmt(n) {
    if (typeof window.COSMOSKIN_FORMAT_PRICE === 'function') {
      return window.COSMOSKIN_FORMAT_PRICE(n);
    }
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      maximumFractionDigits: 0
    }).format(n);
  }

  function priceDisplayHtml(product, options) {
    const PD = window.COSMOSKIN_PRICE_DISPLAY;
    if (PD && typeof PD.renderPriceHtml === 'function') {
      return PD.renderPriceHtml(product, options);
    }
    const price = Number(product && (product.effective_price_try ?? product.price ?? 0));
    const mult = Math.max(1, Number(options?.multiplier || 1));
    return `<span class="cs-price cs-price--compact"><span class="cs-price__current">${fmt(price * mult)}</span></span>`;
  }

  function getRoutineBundleDiscount() {
    let offer = null;
    try { offer = JSON.parse(localStorage.getItem('cosmoskin_routine_bundle_offer') || 'null'); } catch (error) { offer = null; }
    const rate = Math.min(0.10, Math.max(0, Number(offer?.discountRate || 0)));
    const slugs = Array.isArray(offer?.productSlugs) ? offer.productSlugs : [];
    if (!rate || slugs.length < 2) return 0;
    const eligible = state.cart.filter((item) => slugs.includes(item.slug || item.id));
    const uniqueEligible = new Map();
    eligible.forEach((item) => {
      const key = item.slug || item.id;
      if (!uniqueEligible.has(key)) uniqueEligible.set(key, item);
    });
    if (uniqueEligible.size < 2) return 0;
    let basis = 0;
    uniqueEligible.forEach((item) => { basis += Number(item.price || 0); });
    return Math.round(basis * rate);
  }

  function totals() {
    const routineDiscount = Math.min(
      state.cart.reduce((s, i) => s + i.price * i.qty, 0),
      getRoutineBundleDiscount()
    );
    if (window.COSMOSKIN_CART_COMMERCE && typeof window.COSMOSKIN_CART_COMMERCE.computeTotals === 'function') {
      const computed = window.COSMOSKIN_CART_COMMERCE.computeTotals({
        items: state.cart,
        routineDiscount
      });
      return {
        subtotal: computed.subtotal,
        discount: computed.discount,
        routineDiscount: computed.routineDiscount,
        couponDiscount: computed.couponDiscount,
        discountedSubtotal: computed.discountedSubtotal,
        vat: Math.round(computed.vat),
        shipping: computed.shipping,
        total: computed.total,
        freeShippingRemaining: computed.freeShippingRemaining,
        coupon: computed.coupon
      };
    }
    const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
    const discount = Math.min(subtotal, routineDiscount);
    const discountedSubtotal = Math.max(0, subtotal - discount);
    const vat = Math.round(discountedSubtotal * VAT / (1 + VAT));
    const shipping = discountedSubtotal >= FREE_SHIPPING || discountedSubtotal === 0 ? 0 : SHIPPING_FEE;
    return { subtotal, discount, routineDiscount: discount, couponDiscount: 0, discountedSubtotal, vat, shipping, total: discountedSubtotal + shipping, freeShippingRemaining: Math.max(0, FREE_SHIPPING - discountedSubtotal), coupon: null };
  }

  function getProductHelpers() {
    return window.COSMOSKIN_PRODUCT_HELPERS || {};
  }

  function normalizeProductReference(reference) {
    const input = reference && typeof reference === 'object' ? reference : { id: reference };
    const helpers = getProductHelpers();
    const lookup = typeof helpers.getProductByHandle === 'function'
      ? helpers.getProductByHandle(input.slug || input.id || input.favoriteId || input.url || '')
      : null;
    const extractedSlug = typeof helpers.extractSlug === 'function'
      ? (helpers.extractSlug(input.url || '') || helpers.extractSlug(input.slug || input.id || input.favoriteId || ''))
      : '';
    const price = lookup ? Number(lookup.price || 0) : Number(input.price || 0);

    return {
      id: lookup?.id || extractedSlug || String(input.id || '').trim(),
      slug: lookup?.slug || extractedSlug || String(input.slug || input.id || '').trim(),
      name: lookup?.name || input.name || 'Ürün',
      brand: lookup?.brand || input.brand || 'COSMOSKIN',
      price: Number.isFinite(price) ? price : 0,
      price_try: Number(lookup?.price_try ?? lookup?.price ?? price),
      effective_price_try: Number(lookup?.effective_price_try ?? lookup?.price ?? price),
      effective_currency: lookup?.effective_currency || 'TRY',
      effective_price_source: lookup?.effective_price_source || 'static',
      base_catalog_price_try: Number(lookup?.base_catalog_price_try ?? lookup?.price ?? price),
      regular_price_try: Number(lookup?.regular_price_try ?? lookup?.base_catalog_price_try ?? lookup?.price ?? price),
      sale_price_try: lookup?.sale_price_try == null ? null : Number(lookup.sale_price_try),
      compare_at_price_try: lookup?.compare_at_price_try == null ? null : Number(lookup.compare_at_price_try),
      sale_active: Boolean(lookup?.sale_active),
      sale_starts_at: lookup?.sale_starts_at || null,
      sale_ends_at: lookup?.sale_ends_at || null,
      price_display_mode: lookup?.price_display_mode || 'regular',
      has_price_override: Boolean(lookup?.has_price_override),
      price_override_valid: lookup?.price_override_valid !== false,
      price_warning: lookup?.price_warning || '',
      image: lookup?.image || input.image || '',
      url: lookup?.url || input.url || (extractedSlug ? `/products/${extractedSlug}.html` : ''),
      volume: lookup?.volume || input.volume || ''
    };
  }

  function canonicalizeCartItems(items = []) {
    return (Array.isArray(items) ? items : []).map((item) => {
      const product = normalizeProductReference(item);
      const qty = Math.max(1, Number(item?.qty || 1));
      return product.id ? { ...product, qty } : null;
    }).filter(Boolean);
  }

  function setCartButtonData(button, product) {
    if (!button || !product?.id) return;
    button.dataset.id = product.id;
    button.dataset.slug = product.slug;
    button.dataset.name = product.name;
    button.dataset.brand = product.brand;
    button.dataset.price = String(product.price);
    button.dataset.priceTry = String(product.price_try || product.price);
    button.dataset.effectivePriceTry = String(product.effective_price_try || product.price);
    button.dataset.effectiveCurrency = product.effective_currency || 'TRY';
    button.dataset.effectivePriceSource = product.effective_price_source || 'static';
    button.dataset.baseCatalogPriceTry = String(product.base_catalog_price_try || product.price);
    button.dataset.hasPriceOverride = product.has_price_override ? 'true' : 'false';
    button.dataset.priceOverrideValid = product.price_override_valid === false ? 'false' : 'true';
    button.dataset.priceWarning = product.price_warning || '';
    button.dataset.image = product.image;
    if (product.url) button.dataset.url = product.url;
  }

  function setFavoriteButtonData(button, product) {
    if (!button || !product?.id) return;
    button.dataset.favoriteId = product.id;
    button.dataset.name = product.name;
    button.dataset.brand = product.brand;
    button.dataset.price = String(product.price);
    button.dataset.effectivePriceTry = String(product.effective_price_try || product.price);
    button.dataset.image = product.image;
    button.dataset.url = product.url;
  }

  function syncProductCard(card) {
    if (!card) return;

    const media = card.querySelector('.product-media');
    const image = media?.querySelector('img') || card.querySelector('img');
    const cartBtn = card.querySelector('[data-add-cart]');
    const favoriteBtn = card.querySelector('.favorite-btn');
    const titleLink = card.querySelector('h3 a, .product-name a');
    const titleHeading = titleLink ? null : card.querySelector('h3, .product-name');
    const brandline = card.querySelector('.brandline');
    const badge = card.querySelector('.badge');
    const priceEls = card.querySelectorAll('.price');

    const product = normalizeProductReference({
      id: cartBtn?.dataset.id || favoriteBtn?.dataset.favoriteId || card.dataset.productId || '',
      slug: cartBtn?.dataset.slug || '',
      url: cartBtn?.dataset.url || favoriteBtn?.dataset.url || media?.getAttribute('href') || '',
      name: cartBtn?.dataset.name || favoriteBtn?.dataset.name || titleLink?.textContent || titleHeading?.textContent || '',
      brand: cartBtn?.dataset.brand || favoriteBtn?.dataset.brand || brandline?.textContent || badge?.textContent || '',
      price: cartBtn?.dataset.price || favoriteBtn?.dataset.price || 0,
      image: cartBtn?.dataset.image || favoriteBtn?.dataset.image || image?.getAttribute('src') || ''
    });

    if (!product.id) return;

    if (media && product.url) media.setAttribute('href', product.url);
    if (image) {
      if (product.image) image.setAttribute('src', product.image);
      image.setAttribute('alt', product.name);
    }
    if (titleLink) {
      titleLink.textContent = product.name;
      if (product.url) titleLink.setAttribute('href', product.url);
    } else if (titleHeading) {
      titleHeading.textContent = product.name;
    }
    if (brandline) brandline.textContent = product.brand;
    if (badge) badge.textContent = product.brand;
    priceEls.forEach((priceEl) => {
      const html = priceDisplayHtml(product, { compact: true });
      if (html) priceEl.innerHTML = html;
      else priceEl.textContent = fmt(product.price);
    });
    setCartButtonData(cartBtn, product);
    setFavoriteButtonData(favoriteBtn, product);
  }

  function syncBundleButton(button) {
    if (!button) return;

    let items = [];
    try {
      items = JSON.parse(button.getAttribute('data-bundle-items') || '[]');
    } catch (_error) {
      items = [];
    }
    if (!Array.isArray(items) || !items.length) return;

    const normalizedItems = items.map((item) => {
      const product = normalizeProductReference(item);
      const qty = Math.max(1, Number(item?.qty || 1));
      return product.id ? { id: product.id, name: product.name, brand: product.brand, price: product.price, image: product.image, qty } : null;
    }).filter(Boolean);

    if (!normalizedItems.length) return;

    button.dataset.bundleItems = JSON.stringify(normalizedItems);

    const card = button.closest('.routine-bundle');
    if (!card) return;

    const rows = card.querySelectorAll('.routine-bundle__item');
    normalizedItems.forEach((item, index) => {
      const row = rows[index];
      if (!row) return;
      const nameEl = row.querySelector('strong');
      const priceEl = row.lastElementChild;
      if (nameEl) nameEl.textContent = item.name;
      if (priceEl) priceEl.textContent = fmt(item.price * item.qty);
    });

    const totalEl = card.querySelector('.routine-bundle__price-copy strong');
    if (totalEl) {
      const total = normalizedItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
      totalEl.textContent = fmt(total);
    }
  }

  function syncPdpState(root = document) {
    if (!window.location.pathname.includes('/products/')) return;

    const product = normalizeProductReference({
      slug: window.location.pathname,
      url: window.location.pathname
    });
    if (!product.id) return;

    root.querySelectorAll('.pdp-actions [data-add-cart], .pdp5-actions [data-add-cart], [data-buy-now], #mobileStickyAddBtn[data-add-cart]').forEach((button) => {
      setCartButtonData(button, product);
    });
    root.querySelectorAll('.pdp-fav-btn, .pdp5-favorite').forEach((button) => {
      setFavoriteButtonData(button, product);
    });
    root.querySelectorAll('.pdp-price, .pdp-detail-card__price, .pdp5-price').forEach((priceEl) => {
      const html = priceDisplayHtml(product, { stack: true });
      if (html) priceEl.innerHTML = html;
      else priceEl.textContent = fmt(product.price);
    });
    root.querySelectorAll('.pdp5-vat').forEach((vatEl) => {
      vatEl.textContent = 'KDV dahil' + (product.volume ? ' · ' + product.volume : '');
    });
    const stickyWrap = root.querySelector('.mobile-sticky-pdp__copy');
    if (stickyWrap) {
      const stickyHtml = priceDisplayHtml(product, { compact: true });
      const stickyPrice = stickyWrap.querySelector('.cs-price, strong');
      if (stickyHtml && stickyPrice) stickyPrice.outerHTML = stickyHtml;
      else if (stickyPrice) stickyPrice.textContent = fmt(product.price);
    }
    const stickyBrand = root.querySelector('.mobile-sticky-pdp__copy span');
    if (stickyBrand) stickyBrand.textContent = product.brand;
    const brandEl = root.querySelector('.pdp-brand');
    if (brandEl) brandEl.textContent = product.brand;
    const volumeEl = root.querySelector('.pdp-volume-note');
    if (volumeEl && product.volume) volumeEl.textContent = product.volume;
    Array.from(root.querySelectorAll('script[type="application/ld+json"]')).some((script) => {
      try {
        const data = JSON.parse(script.textContent || '{}');
        const graph = Array.isArray(data['@graph']) ? data['@graph'] : [data];
        const node = graph.find((entry) => entry && entry['@type'] === 'Product');
        if (!node) return false;
        node.offers = node.offers || { '@type': 'Offer' };
        node.offers.price = String(product.price);
        node.offers.priceCurrency = product.effective_currency || 'TRY';
        script.textContent = JSON.stringify(data);
        return true;
      } catch (_error) {
        return false;
      }
    });
  }

  function syncProductBindings(root = document) {
    root.querySelectorAll('.product-card').forEach(syncProductCard);
    root.querySelectorAll('[data-add-bundle]').forEach(syncBundleButton);
    if (root === document) syncPdpState(root);
  }

  function openDrawer(drawer) {
    if (!drawer) return;
    drawer.classList.add('open');
    backdrop?.classList.add('show');
    if (drawer.id === 'cartDrawer') {
      refreshCommerceUi();
      document.dispatchEvent(new CustomEvent('cosmoskin:cart-drawer-opened'));
    }
  }

  function closeDrawers() {
    [cartDrawer, accountDrawer].forEach((drawer) => drawer?.classList.remove('open'));
    if (!$('.modal.show')) backdrop?.classList.remove('show');
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('show');
    backdrop?.classList.add('show');
  }

  function closeModals() {
    [prefModal, legalModal, $('#accountModal')].forEach((modal) => modal?.classList.remove('show'));
    if (!(cartDrawer?.classList.contains('open')) && !(accountDrawer?.classList.contains('open'))) {
      backdrop?.classList.remove('show');
    }
  }

  backdrop?.addEventListener('click', () => {
    closeDrawers();
    closeModals();
    closeAllMegaMenus();
    mobileNav?.classList.remove('open');
    document.body.classList.remove('modal-open');
  });

  // UX3B: delegated so close buttons injected after startup (e.g. the premium
  // drawer head replaces its markup at runtime) still close reliably. The old
  // per-node forEach binding missed dynamically injected .close-any buttons.
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.close-any');
    if (!btn) return;
    closeDrawers();
    closeModals();
    mobileNav?.classList.remove('open');
    document.body.classList.remove('modal-open');
  });

  $('#cartBtn')?.addEventListener('click', () => openDrawer(cartDrawer));
  $('#accountBtn')?.addEventListener('click', async () => {
    try {
      const supabaseClient = window.cosmoskinSupabase;
      if (supabaseClient) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
          window.location.href = '/account/profile.html';
          return;
        }
      }
    } catch (error) {
      console.warn('account redirect check failed:', error);
    }
    openDrawer(accountDrawer);
  });

  document.addEventListener('cosmoskin:open-auth', (event) => {
    document.dispatchEvent(new CustomEvent('cosmoskin:open-auth-modal', { detail: event.detail || {} }));
  });


  document.querySelectorAll('[data-favorites-link]').forEach((link) => {
    if (link.dataset.favoritesGuardBound) return;
    link.dataset.favoritesGuardBound = 'true';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = link.getAttribute('href') || '/favorites.html';
    });
  });

  $('#mobileToggle')?.addEventListener('click', () => {
    const isOpen = mobileNav?.classList.toggle('open');
    backdrop?.classList.toggle('show', !!isOpen);
    document.body.classList.toggle('modal-open', !!isOpen);
  });

  $$('.open-legal').forEach((btn) => btn.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(legalModal);
  }));

  $('#openCookiePrefs')?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(prefModal);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDrawers();
      closeModals();
      closeAllMegaMenus();
      mobileNav?.classList.remove('open');
      document.body.classList.remove('modal-open');
    }
  });

  function bindMegaMenu(wrapSelector, triggerSelector) {
    const wrap = $(wrapSelector);
    if (!wrap) return;
    const trigger = wrap.querySelector(triggerSelector);
    const openMenu = () => {
      clearTimeout(megaTimer);
      closeAllMegaMenus(wrap);
      wrap.classList.add('open');
      trigger?.setAttribute('aria-expanded', 'true');
      alignMegaPanel(wrap);
    };
    const closeMenu = () => {
      clearTimeout(megaTimer);
      megaTimer = setTimeout(() => {
        wrap.classList.remove('open');
        trigger?.setAttribute('aria-expanded', 'false');
      }, 140);
    };
    trigger?.addEventListener('click', (e) => {
      e.preventDefault();
      const willOpen = !wrap.classList.contains('open');
      closeAllMegaMenus(willOpen ? wrap : null);
      wrap.classList.toggle('open', willOpen);
      trigger?.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      if (willOpen) alignMegaPanel(wrap);
    });
    wrap.addEventListener('mouseenter', () => window.innerWidth > 1150 && openMenu());
    wrap.addEventListener('mouseleave', () => window.innerWidth > 1150 && closeMenu());
  }

  bindMegaMenu('.categories-wrap', '.categories-trigger');
  bindMegaMenu('.brands-wrap', '.brands-trigger');

  window.addEventListener('resize', () => {
    $$('.categories-wrap.open, .brands-wrap.open').forEach((wrap) => alignMegaPanel(wrap));
  }, { passive: true });


  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#') || href.startsWith('/') || href.startsWith(window.location.origin)) {
      closeAllMegaMenus();
      mobileNav?.classList.remove('open');
      document.body.classList.remove('modal-open');
      if (!cartDrawer?.classList.contains('open') && !accountDrawer?.classList.contains('open') && !document.querySelector('.modal.show')) {
        backdrop?.classList.remove('show');
      }
    }
  });

  // Ürün verileri products-data.js'den; kategori/marka/içerik sabit listesiyle birleştirilir
  const SEARCH_INDEX_STATIC = [
    { label: 'Temizleyiciler', type: 'Kategori', url: '/collections/cleanse.html', keywords: 'cleanser jel kopuk yag bazli makyaj temizleyici arindirici', meta: 'Jel, köpük ve çift temizleme', badge: 'Kategori' },
    { label: 'Tonik & Essence', type: 'Kategori', url: '/collections/hydrate.html', keywords: 'tonik essence esans nem katmanlari hydrate', meta: 'Hafif nem ve hazırlık katmanları', badge: 'Kategori' },
    { label: 'Serum & Ampul', type: 'Kategori', url: '/collections/treat.html', keywords: 'serum ampul hedef bakim leke isilti', meta: 'Leke, ton ve ışıltı odaklı serumlar', badge: 'Kategori' },
    { label: 'Nemlendiriciler', type: 'Kategori', url: '/collections/care.html', keywords: 'nemlendirici krem bariyer goz cevresi care', meta: 'Krem ve destek bakım ürünleri', badge: 'Kategori' },
    { label: 'Güneş Koruyucular', type: 'Kategori', url: '/collections/protect.html', keywords: 'gunes bakimi gunes kremi spf sun sunscreen protect', meta: 'Şehir kullanımına uygun SPF seçkileri', badge: 'Kategori' },
    { label: 'Maskeler', type: 'Kategori', url: '/collections/masks.html', keywords: 'yuz maskesi sheet mask maske care', meta: 'Maskeler ve destek bakım editleri', badge: 'Kategori' },
    { label: 'Kuru Cilt', type: 'Cilt Tipi', url: '/collections/kuru-cilt.html', keywords: 'dry skin kuru cilt nemsizlik barrier', meta: 'Nem ve konfor odaklı seçkiler', badge: 'Cilt Tipi' },
    { label: 'Yağlı Cilt', type: 'Cilt Tipi', url: '/collections/yagli-cilt.html', keywords: 'oily skin yagli cilt sebum parlama hafif spf', meta: 'Daha hafif ve dengeli seçimler', badge: 'Cilt Tipi' },
    { label: 'Hassas Cilt', type: 'Cilt Tipi', url: '/collections/hassas-cilt.html', keywords: 'sensitive skin hassas cilt centella bariyer', meta: 'Yatıştırıcı ve bariyer dostu bakım', badge: 'Cilt Tipi' },
    { label: 'Karma Cilt', type: 'Cilt Tipi', url: '/collections/karma-cilt.html', keywords: 'combination skin karma cilt denge rutin', meta: 'Günlük denge için sabah-akşam akışları', badge: 'Cilt Tipi' },
    { label: 'Normal Cilt', type: 'Cilt Tipi', url: '/collections/normal-cilt.html', keywords: 'normal skin normal cilt gunluk bakim', meta: 'Günlük bakım için dengeli seçkiler', badge: 'Cilt Tipi' },
    { label: 'Nemsizlik', type: 'Cilt Problemi', url: '/collections/hydration.html', keywords: 'dehydration nemsizlik hyaluronic acid essence dolgunluk', meta: 'Dolgun görünüm ve su tutma desteği', badge: 'Cilt Problemi' },
    { label: 'Leke Görünümü', type: 'Cilt Problemi', url: '/collections/blemish.html', keywords: 'tone leke gorunumu vitamin c niacinamide serum brightening', meta: 'Daha eşit ton görünümü için serumlar', badge: 'Cilt Problemi' },
    { label: 'Akne Eğilimi', type: 'Cilt Problemi', url: '/collections/acne-balance.html', keywords: 'blemish acne akne egilimi salicylic acid pore sivilce gozenek', meta: 'Gözenek ve akne eğilimine uygun bakım', badge: 'Cilt Problemi' },
    { label: 'Niacinamide', type: 'İçerik', url: '/collections/glow.html', keywords: 'niacinamide tone glow leke ingredient niasinamid', meta: 'Ton eşitliği ve görünüm dengesi', badge: 'İçerik' },
    { label: 'Hyaluronik Asit', type: 'İçerik', url: '/collections/hydrate.html', keywords: 'hyaluronic acid hyaluronik nem ingredient dolgunluk', meta: 'Nem ve dolgun görünüm desteği', badge: 'İçerik' },
    { label: 'Centella Asiatica', type: 'İçerik', url: '/collections/sensitivity.html', keywords: 'centella asiatica cica hassasiyet ingredient yatistirici', meta: 'Yatıştırıcı ve bariyer dostu bakım', badge: 'İçerik' },
    { label: 'Salicylic Acid', type: 'İçerik', url: '/collections/acne-balance.html', keywords: 'salicylic acid bha akne gozenek ingredient bha asit', meta: 'Akne eğilimi ve gözenek desteği', badge: 'İçerik' },
    { label: 'Ceramide', type: 'İçerik', url: '/collections/barrier.html', keywords: 'ceramide seramid bariyer kuru hassas ingredient', meta: 'Bariyer güçlendirici ve nem koruyucu', badge: 'İçerik' },
    { label: 'Vitamin C', type: 'İçerik', url: '/collections/glow.html', keywords: 'vitamin c c vitamini leke brightening isilti ingredient', meta: 'Işıltı ve leke görünümü için', badge: 'İçerik' },
    { label: 'Anua', type: 'Marka', url: '/collections/anua.html', keywords: 'marka anua heartleaf', meta: 'Heartleaf ile hassas ve yatıştırıcı bakım', badge: 'Marka' },
    { label: 'COSRX', type: 'Marka', url: '/collections/cosrx.html', keywords: 'marka cosrx snail essence', meta: 'Essence ve hedef bakım ikonları', badge: 'Marka' },
    { label: 'Beauty of Joseon', type: 'Marka', url: '/collections/beauty-of-joseon.html', keywords: 'marka beauty of joseon boj', meta: 'Glow ve hafif SPF seçkileri', badge: 'Marka' },
    { label: 'Round Lab', type: 'Marka', url: '/collections/round-lab.html', keywords: 'marka round lab dokdo', meta: 'Nazik temizleme ve günlük denge', badge: 'Marka' },
    { label: 'Torriden', type: 'Marka', url: '/collections/torriden.html', keywords: 'marka torriden dive', meta: 'Nem odaklı serum ve SPF', badge: 'Marka' },
    { label: 'SKIN1004', type: 'Marka', url: '/collections/skin1004.html', keywords: 'marka skin1004 centella madagascar', meta: 'Centella odaklı yatıştırıcı bakım', badge: 'Marka' },
    { label: 'By Wishtrend', type: 'Marka', url: '/collections/by-wishtrend.html', keywords: 'marka by wishtrend wishtrend vitamin', meta: 'Vitamin C ve aktif içerik odaklı seçki', badge: 'Marka' },
    { label: 'Dr. Jart+', type: 'Marka', url: '/collections/dr-jart.html', keywords: 'marka dr jart ceramidin ceramide', meta: 'Seramid ve bariyer odaklı bakım', badge: 'Marka' },
    { label: 'Goodal', type: 'Marka', url: '/collections/goodal.html', keywords: 'marka goodal green tangerine vitamin c mandalin', meta: 'Yeşil mandalin Vitamin C odağı', badge: 'Marka' },
    { label: "I'm From", type: 'Marka', url: '/collections/im-from.html', keywords: 'marka im from rice toner pirinc', meta: 'Pirinç ve doğal içerikli K-beauty', badge: 'Marka' },
    { label: 'Innisfree', type: 'Marka', url: '/collections/innisfree.html', keywords: 'marka innisfree jeju volcanic', meta: 'Jeju kaynaklı doğal cilt bakımı', badge: 'Marka' },
    { label: 'Isntree', type: 'Marka', url: '/collections/isntree.html', keywords: 'marka isntree hyaluronic sun', meta: 'Hyaluronik asit odaklı bakım', badge: 'Marka' },
    { label: 'Laneige', type: 'Marka', url: '/collections/laneige.html', keywords: 'marka laneige water sleeping mask', meta: 'Su bazlı nem teknolojisi', badge: 'Marka' },
    { label: 'Medicube', type: 'Marka', url: '/collections/medicube.html', keywords: 'marka medicube zero pore pad', meta: 'Gözenek ve akne odaklı bakım', badge: 'Marka' },
    { label: 'Mediheal', type: 'Marka', url: '/collections/mediheal.html', keywords: 'marka mediheal sheet mask nmf aquaring', meta: 'Sheet mask ve nem yoğunlaşması', badge: 'Marka' },
    { label: 'Some By Mi', type: 'Marka', url: '/collections/some-by-mi.html', keywords: 'marka some by mi aha bha miracle', meta: 'AHA BHA Miracle serisi', badge: 'Marka' },
    { label: 'Rutinler', type: 'Sayfa', url: '/account/routines/', keywords: 'rutinler routine cilt bakim rutini sabah aksam', meta: 'Hazır sabah-akşam akışları', badge: 'Sayfa' },
    { label: 'Destek Merkezi', type: 'Sayfa', url: '/contact.html', keywords: 'destek merkez iletisim yardim partnership', meta: 'İletişim ve iş ortaklığı formları', badge: 'Sayfa' }
  ];

  // Tüm ürünleri products-data.js'den al, yoksa boş dizi kullan
  const _productEntries = (window.COSMOSKIN_SEARCH_PRODUCTS || []);
  const SEARCH_INDEX = _productEntries.concat(SEARCH_INDEX_STATIC);

  function normalizeSearchValue(value) {
    return String(value || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findSearchMatches(query) {
    const normalized = normalizeSearchValue(query);
    if (!normalized) return [];
    return SEARCH_INDEX.map((item) => {
      const haystack = normalizeSearchValue(`${item.label} ${item.type} ${item.keywords || ''}`);
      let score = 0;
      if (normalizeSearchValue(item.label) === normalized) score += 120;
      if (normalizeSearchValue(item.label).startsWith(normalized)) score += 80;
      if (haystack.includes(normalized)) score += 42;
      normalized.split(' ').forEach((token) => {
        if (!token) return;
        if (haystack.includes(token)) score += 14;
      });
      return { ...item, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  }

  function renderSearchResults(container, results, query = '') {
    if (!container) return;
    if (!results.length) {
      container.innerHTML = '<div class="site-search-empty"><strong>Aramanızla eşleşen ürün bulunamadı.</strong><span>Farklı bir ürün, kategori, içerik veya marka deneyin.</span><a class="site-search-empty__link" href="/allproducts.html">Tüm ürünleri keşfet</a></div>';
      container.hidden = false;
      return;
    }
    container.innerHTML = results.map((item) => `
      <a class="site-search-result" href="${item.url}">
        <span class="site-search-result__badge">${item.badge || item.type}</span>
        <div class="site-search-result__body">
          <span class="site-search-result__type">${item.type}</span>
          <strong>${item.label}</strong>
          <span class="site-search-result__meta">${item.meta || ''}</span>
        </div>
        <span class="site-search-result__arrow" aria-hidden="true">→</span>
      </a>`).join('') + '<a class="site-search-results__all" href="/search.html?q=' + encodeURIComponent(query || '') + '">Tüm ürünleri gör</a>';
    container.hidden = false;
  }

  function bindSiteSearch() {
    $$('.site-search-form').forEach((form) => {
      const input = form.querySelector('.site-search-input');
      const clearBtn = form.querySelector('.site-search-clear');
      const resultsBox = form.querySelector('.site-search-results');
      if (!input || !clearBtn || !resultsBox) return;

      const sync = () => {
        const hasValue = !!input.value.trim();
        clearBtn.classList.toggle('is-visible', hasValue);
        if (!hasValue) {
          resultsBox.hidden = true;
          resultsBox.innerHTML = '';
          return;
        }
        renderSearchResults(resultsBox, findSearchMatches(input.value), input.value);
      };

      input.addEventListener('input', sync);
      input.addEventListener('focus', sync);
      clearBtn.addEventListener('click', () => {
        input.value = '';
        sync();
        input.focus();
      });

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const query = input.value.trim();
        if (query) window.location.href = '/search.html?q=' + encodeURIComponent(query);
      });
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest('.site-search-form')) return;
      $$('.site-search-results').forEach((box) => {
        box.hidden = true;
      });
    });
  }

  function hasDedicatedSearchScript() {
    return Array.from(document.scripts || []).some((script) => /\/js\/search\.js(?:$|[?#])/.test(script.getAttribute('src') || ''));
  }

  function syncSearchClearButtonsOnly() {
    $$('.site-search-form').forEach(form => {
      const input    = form.querySelector('.site-search-input');
      const clearBtn = form.querySelector('.site-search-clear');
      if (!input || !clearBtn) return;
      input.addEventListener('input', () => {
        clearBtn.classList.toggle('is-visible', !!input.value.trim());
      });
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.remove('is-visible');
        const res = form.querySelector('.site-search-results');
        if (res) { res.hidden = true; res.innerHTML = ''; }
        input.focus();
      });
    });
  }

  // search.js is commonly loaded after app.js. Defer legacy binding so one search
  // controller owns each form and the dropdown never renders twice.
  setTimeout(() => {
    if (!window.__COSMOSKIN_SEARCH_BOUND && !hasDedicatedSearchScript()) bindSiteSearch();
    else syncSearchClearButtonsOnly();
  }, 0);

  function persistCart() {
    localStorage.setItem('cosmoskin_cart', JSON.stringify(state.cart));
    renderCart();
    renderCheckout();
    window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { cart: state.cart.slice() } }));
  }

  function normalizeFavoriteItem(item) {
    const store = favoritesStore();
    if (store?.normalizeItem) return store.normalizeItem(item);
    const product = normalizeProductReference(item);
    if (!product?.id) return null;
    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      price: Number(product.price || 0),
      image: product.image || '',
      url: product.url || ''
    };
  }

  function uniqueFavorites(items = []) {
    const store = favoritesStore();
    if (store?.uniqueItems) return store.uniqueItems(items);
    const map = new Map();
    items.forEach((item) => {
      const normalized = normalizeFavoriteItem(item);
      if (normalized && !map.has(normalized.id)) map.set(normalized.id, normalized);
    });
    return Array.from(map.values());
  }

  function favoriteHeartIcon(active = false) {
    const store = favoritesStore();
    if (store?.heartIconHtml) return store.heartIconHtml(active);
    return `<span class="favorite-btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" fill="${active ? 'currentColor' : 'none'}"/></svg></span>`;
  }

  function favoriteHeartSvgInner(active = false) {
    return favoriteHeartIcon(active).replace('<span class="favorite-btn-icon" aria-hidden="true">', '').replace('</span>', '');
  }

  function paintFavoriteButton(button, active = false) {
    if (!button) return;
    let icon = button.querySelector('.favorite-btn-icon');
    if (!icon) {
      button.innerHTML = favoriteHeartIcon(active);
      return;
    }
    icon.innerHTML = favoriteHeartSvgInner(active);
  }

  function broadcastFavoritesChange() {
    syncFavoritesState();
    window.dispatchEvent(new CustomEvent('cosmoskin:favorites-updated', { detail: { favorites: state.favorites } }));
  }

  function persistFavorites() {
    syncFavoritesState();
    renderFavoriteButtons();
    broadcastFavoritesChange();
  }

  let _externalSyncRunning = false;
  function syncFavoritesFromStorage() {
    if (_externalSyncRunning) return;
    const store = favoritesStore();
    if (store?.isLoggedIn?.()) return;
    const fresh = store?.readStorage ? store.readStorage() : [];
    const sameLength = fresh.length === state.favorites.length;
    const sameIds = sameLength && fresh.every((item, idx) => item.id === state.favorites[idx]?.id);
    if (sameIds) return;
    _externalSyncRunning = true;
    try {
      syncFavoritesState();
      renderFavoriteButtons();
    } finally {
      _externalSyncRunning = false;
    }
  }
  window.addEventListener('storage', (event) => {
    if (event.key === FAVORITES_KEY) syncFavoritesFromStorage();
  });
  window.addEventListener('cosmoskin:favorites-updated', () => {
    setTimeout(() => {
      syncFavoritesState();
      renderFavoriteButtons();
    }, 0);
  });

  function isFavorite(id) {
    const store = favoritesStore();
    if (store?.isFavorite) return store.isFavorite(id);
    return state.favorites.some((item) => item.id === id);
  }

  async function toggleFavorite(item) {
    const normalized = normalizeFavoriteItem(item);
    if (!normalized?.id) return;
    const store = favoritesStore();
    const alreadyFavorite = isFavorite(normalized.id);
    try {
      if (store?.toggle) {
        const active = await store.toggle(normalized);
        showFavoriteToast(active ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
      } else if (alreadyFavorite) {
        state.favorites = state.favorites.filter((entry) => entry.id !== normalized.id);
        showFavoriteToast('Favorilerden çıkarıldı');
      } else {
        state.favorites.unshift(normalized);
        showFavoriteToast('Favorilere eklendi');
      }
      persistFavorites();
    } catch (error) {
      console.warn('Favorite toggle warning:', error);
      showFavoriteToast('Favori güncellenemedi. Lütfen tekrar deneyin.');
    }
  }
  // External-sync listener for cart: account/profile.html's "add to cart from
  // favorites" flow writes localStorage directly, so we re-read here and
  // re-render the cart drawer.
  let _cartSyncRunning = false;
  function syncCartFromStorage() {
    if (_cartSyncRunning) return;
    let fresh = [];
    try {
      fresh = JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]');
      if (!Array.isArray(fresh)) fresh = [];
    } catch { fresh = []; }
    fresh = canonicalizeCartItems(fresh);
    const a = JSON.stringify(state.cart);
    const b = JSON.stringify(fresh);
    if (a === b) return;
    _cartSyncRunning = true;
    try {
      state.cart = fresh;
      renderCart();
    } finally {
      _cartSyncRunning = false;
    }
  }
  window.addEventListener('storage', (event) => {
    if (event.key === 'cosmoskin_cart') syncCartFromStorage();
  });
  window.addEventListener('cosmoskin:cart-updated', () => {
    setTimeout(syncCartFromStorage, 0);
  });

  async function ensureFavoriteAuth(message = 'Favoriye ürün eklemek için önce giriş yapmalısınız.') {
    const client = window.cosmoskinSupabase;
    if (!client?.auth?.getUser) return true;
    try {
      const { data: { user } } = await client.auth.getUser();
      if (user) return true;
    } catch (error) {
      console.warn('favorite auth check failed:', error);
    }
    showFavoriteToast(message);
    document.dispatchEvent(new CustomEvent('cosmoskin:open-auth-modal', { detail: { tab: 'loginPanel' } }));
    return false;
  }

  function getProductDataFromButton(btn) {
    if (!btn) return null;
    return normalizeProductReference({
      id: btn.dataset.id,
      slug: btn.dataset.slug,
      name: btn.dataset.name,
      brand: btn.dataset.brand,
      price: btn.dataset.price,
      image: btn.dataset.image,
      url: btn.dataset.url || btn.closest('.product-card')?.querySelector('.product-media')?.getAttribute('href') || window.location.pathname
    });
  }

  function ensureFavoriteButtons(root = document) {
    root.querySelectorAll('.product-card').forEach((card) => {
      const existingFav = card.querySelector('.favorite-btn');
      if (existingFav) {
        if (!existingFav.querySelector('.favorite-btn-icon svg')) {
          paintFavoriteButton(existingFav, isFavorite(existingFav.dataset.favoriteId));
        }
        return;
      }
      const media = card.querySelector('.product-media');
      const mediaWrap = card.querySelector('.product-media-wrap');
      const cartBtn = card.querySelector('[data-add-cart]');
      if (!media || !cartBtn) return;
      const product = getProductDataFromButton(cartBtn);
      if (!product?.id) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'favorite-btn';
      button.setAttribute('aria-label', 'Favorilere ekle');
      button.setAttribute('title', 'Favorilere ekle');
      setFavoriteButtonData(button, product);
      paintFavoriteButton(button, isFavorite(product.id));
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await toggleFavorite(getProductDataFromButton(cartBtn));
      });
      (mediaWrap || card).appendChild(button);
    });
  }

  function renderFavoriteButtons(root = document) {
    root.querySelectorAll('.favorite-btn').forEach((button) => {
      if (!button.dataset.favoriteBound) {
        button.dataset.favoriteBound = 'true';
        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const explicit = button.dataset.favoriteId ? {
            id: button.dataset.favoriteId,
            name: button.dataset.name,
            brand: button.dataset.brand,
            price: Number(button.dataset.price || 0),
            image: button.dataset.image,
            url: button.dataset.url || button.closest('.product-card')?.querySelector('.product-media')?.getAttribute('href') || window.location.pathname
          } : null;
          const cardCartBtn = button.closest('.product-card')?.querySelector('[data-add-cart]');
          await toggleFavorite(explicit?.id ? explicit : getProductDataFromButton(cardCartBtn));
        });
      }
      const active = isFavorite(button.dataset.favoriteId);
      button.classList.toggle('active', active);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? 'Favorilerden kaldır' : 'Favorilere ekle');
      button.setAttribute('title', active ? 'Favorilerden kaldır' : 'Favorilere ekle');
      paintFavoriteButton(button, active);
    });
  }


  function getStockApi() {
    return window.COSMOSKIN_STOCK || null;
  }

  function cartStockCheck(item, nextQty) {
    const api = getStockApi();
    if (!api || typeof api.canBuy !== 'function') return { ok: true };
    const result = api.canBuy(item.slug || item.id, nextQty || item.qty || 1);
    // Soft-allow while inventory is still loading or the service is unreachable.
    // Confirmed out-of-stock / missing-record responses still block.
    if (result && (result.unknown || result.service_unavailable)) return { ok: true, unknown: true };
    return result;
  }

  function showStockToast(message) {
    showFavoriteToast(message || 'Sepetindeki bazı ürünlerin stoğu değişti. Lütfen sepetini kontrol et.');
  }

  function updateQty(id, delta) {
    state.cart = state.cart
      .map((item) => {
        if (item.id !== id) return item;
        const nextQty = item.qty + delta;
        if (delta > 0) {
          const stock = cartStockCheck(item, nextQty);
          if (!stock.ok) {
            showStockToast(stock.message);
            return item;
          }
        }
        return { ...item, qty: nextQty };
      })
      .filter((item) => item.qty > 0);
    persistCart();
  }

  function removeItem(id) {
    state.cart = state.cart.filter((item) => item.id !== id);
    persistCart();
  }

  function renderCart() {
    const target = $('#cartItems');
    const subtotalEl = $('#cartSubtotal');
    const vatEl = $('#cartVat');
    const shippingEl = $('#cartShipping');
    const totalEl = $('#cartTotal');
    const shippingProgressFill = $('#shippingProgressFill');
    const shippingProgressText = $('#shippingProgressText');
    const qty = state.cart.reduce((a, b) => a + b.qty, 0);
    if (cartDrawer) {
      cartDrawer.classList.toggle('cart-drawer--empty', !state.cart.length);
      cartDrawer.classList.toggle('cart-drawer--filled', !!state.cart.length);
    }

    $$('.cart-count').forEach((el) => {
      el.textContent = qty;
      el.style.display = qty ? 'grid' : 'none';
    });

    const t = totals();
    if (subtotalEl) subtotalEl.textContent = fmt(t.subtotal);
    let discountRow = $('#cartRoutineDiscount');
    let couponRow = $('#cartCouponDiscount');
    const shippingRow = shippingEl?.closest('.sum-row');
    if (t.routineDiscount > 0 && subtotalEl) {
      if (!discountRow) {
        discountRow = document.createElement('div');
        discountRow.className = 'sum-row routine-discount-row';
        discountRow.id = 'cartRoutineDiscount';
        discountRow.innerHTML = '<span>Rutin set avantajı</span><strong></strong>';
        if (shippingRow) shippingRow.insertAdjacentElement('beforebegin', discountRow);
      }
      discountRow.querySelector('strong').textContent = '-' + fmt(t.routineDiscount);
      discountRow.hidden = false;
    } else if (discountRow) {
      discountRow.hidden = true;
    }
    if (t.couponDiscount > 0 && subtotalEl) {
      if (!couponRow) {
        couponRow = document.createElement('div');
        couponRow.className = 'sum-row coupon-discount-row';
        couponRow.id = 'cartCouponDiscount';
        couponRow.innerHTML = '<span>Kupon İndirimi</span><strong></strong>';
        if (discountRow && discountRow.parentNode) {
          discountRow.insertAdjacentElement('afterend', couponRow);
        } else if (shippingRow) {
          shippingRow.insertAdjacentElement('beforebegin', couponRow);
        }
      }
      couponRow.querySelector('strong').textContent = '-' + fmt(t.couponDiscount);
      couponRow.hidden = false;
    } else if (couponRow) {
      couponRow.hidden = true;
    }
    if (vatEl) vatEl.textContent = fmt(t.vat);
    if (shippingEl) shippingEl.textContent = state.cart.length ? (t.shipping ? fmt(t.shipping) : 'Ücretsiz') : 'Ürün eklenince hesaplanır';
    if (totalEl) totalEl.textContent = state.cart.length ? fmt(t.total) : '—';
    if (shippingProgressFill && shippingProgressText) {
      const progressBase = t.discountedSubtotal != null ? t.discountedSubtotal : t.subtotal;
      const ratio = Math.max(0, Math.min(100, Math.round((progressBase / FREE_SHIPPING) * 100)));
      shippingProgressFill.style.width = `${ratio}%`;
      if (progressBase === 0) {
        shippingProgressText.textContent = `${fmt(FREE_SHIPPING)} üzeri siparişlerde ücretsiz kargo avantajı uygulanır.`;
      } else if (progressBase >= FREE_SHIPPING) {
        shippingProgressText.textContent = 'Siparişiniz ücretsiz kargo avantajına ulaştı.';
      } else {
        shippingProgressText.textContent = `${fmt(FREE_SHIPPING - progressBase)} daha ekleyerek ücretsiz kargo avantajına ulaşabilirsiniz.`;
      }
    }

    if (!target) return;
    if (!state.cart.length) {
      target.innerHTML = '<div class="account-state cart-empty-state cart-drawer-premium__empty"><strong>Sepetin şu anda boş.</strong><div class="account-mini">Cilt bakım rutinini tamamlayacak ürünleri keşfet.</div><div class="cart-empty-actions"><a class="btn btn-primary" href="/allproducts.html">Alışverişe Başla</a><a class="btn btn-secondary" href="/account/profile.html?tab=favorites">Favorilerime Git</a></div></div>';
      return;
    }

    target.innerHTML = state.cart.map((item) => {
      const stock = cartStockCheck(item, item.qty);
      const problem = !stock.ok;
      const limitReached = stock.available_stock !== undefined && Number(stock.available_stock) > 0 && Number(item.qty || 1) >= Number(stock.available_stock);
      const displayProduct = normalizeProductReference(item);
      const priceHtml = priceDisplayHtml(displayProduct, { compact: true, multiplier: item.qty });
      return `
      <article class="cart-item cart-drawer-premium__item ${problem ? 'is-stock-problem' : ''}">
        <a class="cart-drawer-premium__thumb" href="${item.url || '#'}"><img src="${item.image}" alt="${item.name}"></a>
        <div class="cart-drawer-premium__copy">
          <div class="account-mini cart-drawer-premium__brand">${item.brand}</div>
          <a class="cart-drawer-premium__name" href="${item.url || '#'}">${item.name}</a>
          ${problem ? `<div class="cart-stock-warning">${stock.message || 'Sepetindeki bazı ürünlerin stoğu değişti. Lütfen sepetini kontrol et.'}</div>` : (limitReached ? `<div class="cart-stock-warning">Bu ürün için şu anda yalnızca ${stock.available_stock} adet satın alınabilir.</div>` : '')}
          <div class="qty cart-drawer-premium__qty">
            <button type="button" data-dec="${item.id}" aria-label="Adedi azalt">−</button>
            <span>${item.qty}</span>
            <button type="button" data-inc="${item.id}" ${problem || limitReached ? 'disabled aria-disabled="true"' : ''} aria-label="Adedi artır">+</button>
            <button type="button" data-remove="${item.id}" aria-label="Ürünü kaldır">Kaldır</button>
          </div>
        </div>
        <div class="cart-drawer-premium__price cs-mini-cart-price">${priceHtml}</div>
      </article>`;
    }).join('');

    $$('[data-inc]', target).forEach((btn) => btn.addEventListener('click', () => updateQty(btn.dataset.inc, 1)));
    $$('[data-dec]', target).forEach((btn) => btn.addEventListener('click', () => updateQty(btn.dataset.dec, -1)));
    $$('[data-remove]', target).forEach((btn) => btn.addEventListener('click', () => removeItem(btn.dataset.remove)));
  }

  function bindCartButtons(root = document) {
    root.querySelectorAll('[data-add-cart]').forEach((btn) => {
      if (btn.dataset.cartBound) return;
      btn.dataset.cartBound = 'true';
      btn.addEventListener('click', async () => {
        const item = {
          id: btn.dataset.id,
          slug: btn.dataset.slug || btn.dataset.id,
          name: btn.dataset.name,
          brand: btn.dataset.brand,
          price: Number(btn.dataset.price),
          image: btn.dataset.image,
          url: btn.dataset.url || btn.closest('.product-card')?.querySelector('.product-media')?.getAttribute('href') || window.location.pathname,
          qty: Math.max(1, Math.floor(Number(btn.dataset.quantity || 1) || 1))
        };
        if (window.COSMOSKIN_STOCK?.validateAdd) {
          btn.disabled = true;
          const allowed = await window.COSMOSKIN_STOCK.validateAdd(item);
          btn.disabled = btn.classList.contains('is-stock-disabled');
          if (!allowed) return;
        }
        addCartItems([item]);
      });
    });
  }

  function refreshCatalogDrivenState() {
    const nextCart = canonicalizeCartItems(state.cart);
    if (JSON.stringify(nextCart) !== JSON.stringify(state.cart)) {
      state.cart = nextCart;
      localStorage.setItem('cosmoskin_cart', JSON.stringify(state.cart));
    }

    const store = favoritesStore();
    syncFavoritesState();
    const nextFavorites = uniqueFavorites(state.favorites);
    if (JSON.stringify(nextFavorites) !== JSON.stringify(state.favorites)) {
      state.favorites = nextFavorites;
      if (store?.persistLocal) store.persistLocal();
      else localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
    }
  }

  function initFavoriteButtons(root = document) {
    syncProductBindings(root);
    ensureFavoriteButtons(root);
    renderFavoriteButtons(root);
  }

  function initCartButtons(root = document) {
    syncProductBindings(root);
    bindCartButtons(root);
  }

  function refreshCommerceUi(root = document) {
    refreshCatalogDrivenState();
    syncProductBindings(root);
    ensureFavoriteButtons(root);
    renderFavoriteButtons(root);
    bindCartButtons(root);
    renderCart();
    renderCheckout();
  }

  function addCartItems(items = [], options = {}) {
    const normalizedItems = canonicalizeCartItems(items);

    if (!normalizedItems.length) return 0;

    let added = 0;
    normalizedItems.forEach((item) => {
      const found = state.cart.find((entry) => entry.id === item.id);
      const nextQty = (found ? Number(found.qty || 1) : 0) + Number(item.qty || 1);
      const stock = cartStockCheck(item, nextQty);
      if (!stock.ok) {
        showStockToast(stock.message);
        return;
      }
      if (found) found.qty += item.qty;
      else state.cart.push(item);
      added += 1;
    });

    if (!added) return 0;
    persistCart();
    if (options.openDrawer !== false) openDrawer(cartDrawer);
    return added;
  }

  document.addEventListener('cosmoskin:add-bundle', (event) => {
    const items = event.detail?.items || [];
    addCartItems(items, { openDrawer: true });
  });

  window.addEventListener('cosmoskin:inventory-updated', () => {
    renderCart();
    renderCheckout();
  });

  window.renderCart = renderCart;

  window.COSMOSKIN_CART_API = {
    addItems: addCartItems,
    getItems: () => state.cart.slice(),
    clear: () => {
      state.cart = [];
      persistCart();
      renderCart();
      renderCheckout();
      window.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { items: [] } }));
      document.dispatchEvent(new CustomEvent('cosmoskin:cart-updated', { detail: { items: [] } }));
    }
  };
  window.initCartButtons = initCartButtons;
  window.initFavoriteButtons = initFavoriteButtons;

  function renderCheckout() {
    const itemsWrap = $('#checkoutItems');
    const sub = $('#checkoutSubtotal');
    const vat = $('#checkoutVat');
    const shipping = $('#checkoutShipping');
    const total = $('#checkoutTotal');
    const summaryField = $('#orderSummaryField');
    if (!itemsWrap) return;

    const t = totals();
    if (sub) sub.textContent = fmt(t.subtotal);
    if (vat) vat.textContent = fmt(t.vat);
    if (shipping) shipping.textContent = state.cart.length ? (t.shipping ? fmt(t.shipping) : 'Ücretsiz') : 'Ürün eklenince hesaplanır';
    if (total) total.textContent = state.cart.length ? fmt(t.total) : '—';

    document.body.classList.toggle('checkout-cart-empty', !state.cart.length && !!document.getElementById('checkoutForm'));
    document.body.classList.toggle('checkout-cart-ready', !!state.cart.length && !!document.getElementById('checkoutForm'));

    if (!state.cart.length) {
      itemsWrap.innerHTML = '<div class="account-state"><strong>Sepetiniz boş.</strong><div class="account-mini">Ürün eklediğinizde sipariş özeti burada görünür.</div></div>';
      if (summaryField) summaryField.value = '';
      return;
    }

    itemsWrap.innerHTML = state.cart.map((item) => `
      <article class="checkout-item">
        <img src="${item.image}" alt="${item.name}">
        <div>
          <strong>${item.name}</strong>
          <div class="account-mini">${item.brand} · ${item.qty} adet</div>
        </div>
        <strong>${fmt(item.price * item.qty)}</strong>
      </article>
    `).join('');

    if (summaryField) {
      summaryField.value = state.cart.map((item) => `${item.brand} ${item.name} x${item.qty} (${fmt(item.price * item.qty)})`).join(' | ') + ` | Toplam: ${fmt(t.total)}`;
    }
  }

  refreshCommerceUi();
  favoritesStore()?.load?.().catch(() => {});

  document.addEventListener('cosmoskin:products-updated', () => {
    refreshCommerceUi();
  });

  window.addEventListener('load', () => {
    refreshCommerceUi();
    setTimeout(() => {
      refreshCommerceUi();
    }, 120);
  });

  function applyStoredCookiePrefs() {
    const prefs = state.consent || {};
    const analytics = $('#prefAnalytics');
    const functional = $('#prefFunctional');
    const marketing = $('#prefMarketing');
    if (analytics) analytics.checked = !!prefs.analytics;
    if (functional) functional.checked = !!prefs.functional;
    if (marketing) marketing.checked = !!prefs.marketing;
  }

  function setConsent(mode) {
    const consent = {
      essential: true,
      analytics: mode === 'all' || (mode === 'custom' && $('#prefAnalytics')?.checked),
      functional: mode === 'all' || (mode === 'custom' && $('#prefFunctional')?.checked),
      marketing: mode === 'all' || (mode === 'custom' && $('#prefMarketing')?.checked),
      version: 'legal-20260702',
      updatedAt: new Date().toISOString()
    };
    state.consent = consent;
    localStorage.setItem('cosmoskin_consent', JSON.stringify(consent));
    localStorage.setItem('cosmoskin_cookie_prefs_v1', JSON.stringify(consent));
    cookieBanner?.classList.remove('show');
    closeModals();
    if (consent.analytics && window.enableAnalytics) window.enableAnalytics();
    if (window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage: consent.analytics ? 'granted' : 'denied',
        ad_storage: consent.marketing ? 'granted' : 'denied',
        ad_user_data: consent.marketing ? 'granted' : 'denied',
        ad_personalization: consent.marketing ? 'granted' : 'denied'
      });
    }
  }

  function enhanceCookieBanner() {
    if (!cookieBanner) return;
    const card = cookieBanner.querySelector('.cookie-card');
    if (!card || card.dataset.csCookieEnhanced === '1') return;
    card.dataset.csCookieEnhanced = '1';
    const actions = card.querySelector('.cookie-actions');
    const existingP = card.querySelector('p');
    const copy = document.createElement('div');
    copy.className = 'cookie-copy';
    copy.innerHTML = '' +
      '<p class="cookie-kicker">Gizlilik</p>' +
      '<h2 class="cookie-title">Çerez tercihleri</h2>' +
      '<p>Zorunlu çerezler sepet, oturum ve güvenli ödeme için kullanılır. Analitik, işlevsel ve pazarlama çerezleri yalnızca seçiminize göre etkinleşir.</p>' +
      '<p class="cookie-links"><a href="/legal/cerez-politikasi.html">Çerez Politikası</a><a href="/legal/kvkk-aydinlatma-metni.html">KVKK Aydınlatma</a><button type="button" class="cookie-detail-link" id="cookieOpenDetails">Detaylı tercihler</button></p>';
    if (existingP) existingP.replaceWith(copy);
    else card.insertBefore(copy, actions || null);
    const detailBtn = card.querySelector('#cookieOpenDetails');
    if (detailBtn && !detailBtn.dataset.bound) {
      detailBtn.dataset.bound = '1';
      detailBtn.addEventListener('click', () => {
        applyStoredCookiePrefs();
        openModal(prefModal);
      });
    }
  }

  $('#cookieAcceptAll')?.addEventListener('click', () => setConsent('all'));
  $('#cookieAcceptEssential')?.addEventListener('click', () => setConsent('essential'));
  $('#cookieSavePrefs')?.addEventListener('click', () => setConsent('custom'));
  $('#cookieCustomize')?.addEventListener('click', () => { applyStoredCookiePrefs(); openModal(prefModal); });

  enhanceCookieBanner();
  if (!state.consent) cookieBanner?.classList.add('show');
  else if (state.consent.analytics && window.enableAnalytics) window.enableAnalytics();

  $$('.tab-btn').forEach((btn) => btn.addEventListener('click', () => {
    const wrap = btn.closest('.modal-card');
    $$('.tab-btn', wrap).forEach((b) => b.classList.remove('active'));
    $$('.tab-panel', wrap).forEach((panel) => panel.classList.remove('active'));
    btn.classList.add('active');
    wrap.querySelector(`#${btn.dataset.tab}`)?.classList.add('active');
  }));

  $$('.filter-chip').forEach((chip) => chip.addEventListener('click', () => {
    const wrap = chip.closest('[data-filter-wrap]');
    if (!wrap) return;
    $$('.filter-chip', wrap).forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    const value = chip.dataset.filter;
    wrap.nextElementSibling?.querySelectorAll('[data-filter-item]').forEach((item) => {
      item.style.display = value === 'all' || item.dataset.filterItem.includes(value) ? '' : 'none';
    });
  }));

  function onScroll() {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const y = window.scrollY;
    if (progress) progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    $$('.reveal').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight - 70) el.classList.add('visible');
    });
  }



  function initHeroParallax() {
    const hero = document.querySelector('[data-hero-parallax]');
    if (!hero || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const state = { currentY: 0, targetY: 0, currentX: 0, targetX: 0, ticking: false };
    const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

    function updateTargets() {
      const rect = hero.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const progress = clamp((vh - rect.top) / (vh + rect.height), 0, 1);
      state.targetY = (progress - 0.35) * 42;
    }

    function apply() {
      state.currentY += (state.targetY - state.currentY) * 0.08;
      state.currentX += (state.targetX - state.currentX) * 0.08;

      hero.style.setProperty('--hero-cloud-back-y', `${state.currentY * 1.4}px`);
      hero.style.setProperty('--hero-cloud-front-y', `${state.currentY * 2.1}px`);
      hero.style.setProperty('--hero-showcase-y', `${state.currentY * -0.16}px`);
      hero.style.setProperty('--hero-card-y', `${state.currentY * -0.34}px`);
      hero.style.setProperty('--hero-card-x', `${state.currentX * 6}px`);
      hero.style.setProperty('--hero-card-rotate', `${state.currentX * 0.4}deg`);
      hero.style.setProperty('--hero-product-y', `${state.currentY * -0.22}px`);
      hero.style.setProperty('--hero-product-x', `${state.currentX * 8}px`);
      hero.style.setProperty('--hero-product-scale', `${1 + Math.abs(state.currentY) * 0.0008}`);
      hero.style.setProperty('--hero-orb-y', `${state.currentY * -0.9}px`);
      hero.style.setProperty('--hero-orb-x', `${state.currentX * 12}px`);
      hero.style.setProperty('--hero-note-left-y', `${state.currentY * -0.1}px`);
      hero.style.setProperty('--hero-note-left-x', `${state.currentX * 7}px`);
      hero.style.setProperty('--hero-note-center-y', `${state.currentY * -0.2}px`);
      hero.style.setProperty('--hero-note-right-y', `${state.currentY * -0.14}px`);
      hero.style.setProperty('--hero-note-right-x', `${state.currentX * -7}px`);

      if (Math.abs(state.targetY - state.currentY) > 0.08 || Math.abs(state.targetX - state.currentX) > 0.08) {
        requestAnimationFrame(apply);
      } else {
        state.ticking = false;
      }
    }

    function queue() {
      if (state.ticking) return;
      state.ticking = true;
      requestAnimationFrame(apply);
    }

    function onPointerMove(event) {
      if (window.innerWidth < 900) {
        state.targetX = 0;
        return;
      }
      const rect = hero.getBoundingClientRect();
      const localX = clamp((event.clientX - rect.left) / rect.width, 0, 1) - 0.5;
      state.targetX = localX;
      queue();
    }

    updateTargets();
    queue();
    window.addEventListener('scroll', () => { updateTargets(); queue(); }, { passive: true });
    window.addEventListener('resize', () => { updateTargets(); queue(); }, { passive: true });
    hero.addEventListener('pointermove', onPointerMove, { passive: true });
    hero.addEventListener('pointerleave', () => { state.targetX = 0; queue(); }, { passive: true });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  initHeroParallax();

  $$('form[data-form-endpoint]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const status = $('.form-status', form);
    const submitButton = form.querySelector('button[type="submit"]');
    const endpoint = form.dataset.formEndpoint;
    const recipient = form.dataset.formRecipient || 'destek';
    const fallbackEmail = recipient === 'partnership' ? 'partnership@cosmoskin.com.tr' : 'destek@cosmoskin.com.tr';

    if (!endpoint) return;

    const formData = new FormData(form);
    formData.set('recipient', recipient);

    if (status) {
      status.textContent = 'Gönderiliyor...';
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.originalText = submitButton.dataset.originalText || submitButton.textContent;
      submitButton.textContent = 'Gönderiliyor...';
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      const payload = await response.json().catch(() => ({}));
      const ok = response.ok && payload.ok;

      if (status) {
        status.textContent = ok
          ? (payload.referenceCode
              ? `Mesajınız gönderildi. Referans kodunuz: ${payload.referenceCode}. Onay e-postası tarafınıza iletildi.`
              : (payload.message || 'Mesajınız başarıyla gönderildi.'))
          : (payload.message || `Şu anda form kullanılamıyor. Lütfen ${fallbackEmail} üzerinden iletişime geçin.`);
      }

      if (ok) {
        form.reset();
      }
    } catch (error) {
      if (status) {
        status.textContent = `Şu anda form kullanılamıyor. Lütfen ${fallbackEmail} üzerinden iletişime geçin.`;
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.originalText || 'Gönder';
      }
    }
  }));

  function inferCollectionTheme() {
    const path = window.location.pathname;
    if (path.includes('/collections/cleanse')) return 'cleanse';
    if (path.includes('/collections/hydrate')) return 'hydrate';
    if (path.includes('/collections/treat')) return 'treat';
    if (path.includes('/collections/protect')) return 'protect';
    if (path.includes('/account/routines/')) return 'routine';
    if (path.includes('/collections/care')) return 'care';
    return 'default';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function createSlug(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function inferRoutineStep(product, theme) {
    if (theme === 'cleanse') return '1. adım · Temizleme';
    if (theme === 'hydrate') return '2. adım · Nem desteği';
    if (theme === 'treat') return '2. adım · Hedef bakım';
    if (theme === 'protect') return '3. adım · Günlük koruma';
    if (theme === 'routine') return 'Rutin seçkisi';
    if (theme === 'care') return 'Destek bakım';
    if ((product.tags || []).includes('spf')) return '3. adım · Günlük koruma';
    if ((product.tags || []).includes('serum')) return '2. adım · Serum';
    return 'Seçilmiş ürün';
  }

  function inferSkinFit(product, theme) {
    const name = (product.name || '').toLowerCase();
    const tags = (product.tags || []).join(' ');
    if (theme === 'protect' || name.includes('sun') || tags.includes('spf')) {
      return 'Günlük şehir kullanımı, normal, karma ve hassas ciltler için rahat bir son adım.';
    }
    if (theme === 'cleanse' || name.includes('cleanser')) {
      return 'Gün sonunda kalıntıyı konforlu biçimde uzaklaştırmak isteyen normal, karma ve yağlanmaya meyilli ciltler için uygundur.';
    }
    if (theme === 'hydrate' || tags.includes('hyaluronik') || tags.includes('barrier') || name.includes('snail')) {
      return 'Kuruluk hissi, bariyer desteği veya gün içinde esnek görünüm arayan cilt tipleri için iyi bir katman oluşturur.';
    }
    if (theme === 'treat' || name.includes('vitamin') || name.includes('glow')) {
      return 'Donuk görünüm, ton eşitsizliği veya daha canlı bir cilt görünümü isteyen bakım rutinleri için tasarlanmış bir ara adımdır.';
    }
    return 'Dengeli, sade ve sonuç odaklı bir rutin kurmak isteyen kullanıcılar için seçilmiş bir üründür.';
  }

  function inferUseSteps(product, theme) {
    if (theme === 'protect' || (product.tags || []).includes('spf')) {
      return [
        'Sabah rutininin son adımında kuru cilde eşit şekilde uygula.',
        'Makyaj altına ince katman halinde rahatça yerleşir.',
        'Gün içinde uzun dış mekân planlarında tazeleme düşün.'
      ];
    }
    if (theme === 'cleanse') {
      return [
        'Nemli cilde nazikçe masaj yaparak uygula.',
        'Ilık su ile durula ve cildi germeden temiz bırak.',
        'Ardından tonik, serum veya nem adımına geç.'
      ];
    }
    if (theme === 'hydrate') {
      return [
        'Temizleme sonrası hafif nemli cilde uygula.',
        'Tek başına ya da krem öncesi katman olarak kullan.',
        'Sabah ve akşam rutine kolayca eklenir.'
      ];
    }
    if (theme === 'treat') {
      return [
        'Temizleme sonrası ve krem öncesi ara adım olarak kullan.',
        'İhtiyaca göre tek ürün odaklı sade rutin içinde konumlandır.',
        'Hassasiyet hissedersen kullanım sıklığını kademeli artır.'
      ];
    }
    return [
      'Temizleme sonrası kullanıma uygundur.',
      'Dokuya göre serum, essence veya krem adımında konumlandır.',
      'Düzenli kullanımda rutinin görünümünü daha dengeli hale getirir.'
    ];
  }

  function inferTabContent(product, theme) {
    const summaryIntro = product.description || 'Premium, sade ve günlük rutine kolay entegre olan bir seçki ürünü.';
    const useSteps = inferUseSteps(product, theme);
    const orderCopy = inferRoutineStep(product, theme);
    const skinFit = inferSkinFit(product, theme);

    return {
      overview: {
        title: 'Ürün Bilgileri',
        body: `<p>${escapeHtml(summaryIntro)}</p>
          <ul>
            <li>${escapeHtml(orderCopy)} içinde konumlandırılabilir.</li>
            <li>Günlük kullanım odağında sade ve anlaşılır bir rutin akışına uygundur.</li>
            <li>Hızlı karar vermeyi kolaylaştıran net fayda, temiz görsel ve güven işaretleriyle sunulur.</li>
          </ul>`
      },
      routine: {
        title: 'Nasıl Kullanılır',
        body: `<ul>${useSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ul>`
      },
      fit: {
        title: 'Kimler İçin Uygun',
        body: `<p>${escapeHtml(skinFit)}</p>
          <ul>
            <li>İlk alışverişte kafa karıştırmayan, net bir ürün seçimi arayan kullanıcılar için uygundur.</li>
            <li>${escapeHtml((product.meta || 'KDV dahil · Türkiye içi gönderim').replace(/\s+/g, ' ').trim())}</li>
            <li>Rutinini gereksiz kalabalık olmadan kurmak isteyenler için iyi bir eşleşmedir.</li>
          </ul>`
      },
      trust: {
        title: 'Teslimat & Güven',
        body: `<ul>
          <li>Tüm fiyatlar KDV dahil gösterilir.</li>
          <li>${escapeHtml(fmt(FREE_SHIPPING))} ve üzeri siparişlerde ücretsiz kargo avantajı uygulanır.</li>
          <li>Güvenli ödeme, açık fiyatlama ve üyelik üzerinden favori takibi ile desteklenir.</li>
        </ul>`
      }
    };
  }

  function getCollectionProductData(card) {
    const media = card.querySelector('.product-media');
    const cartBtn = card.querySelector('[data-add-cart]');
    const title = card.querySelector('h3');
    const desc = card.querySelector('.product-body p');
    const brand = card.querySelector('.brandline');
    const price = card.querySelector('.price');
    const meta = card.querySelector('.meta-note');
    const img = card.querySelector('img');
    const badge = card.querySelector('.badge');
    const pills = $$('.pill', card).map((pill) => pill.textContent.trim()).filter(Boolean);
    return {
      id: cartBtn?.dataset.id || card.dataset.productId || createSlug(title?.textContent || ''),
      name: cartBtn?.dataset.name || title?.textContent?.trim() || 'Ürün',
      brand: cartBtn?.dataset.brand || brand?.textContent?.trim() || badge?.textContent?.trim() || 'COSMOSKIN',
      price: Number(cartBtn?.dataset.price || String(price?.textContent || '0').replace(/[^\d]/g, '')),
      image: cartBtn?.dataset.image || img?.getAttribute('src') || '',
      description: desc?.textContent?.trim() || '',
      meta: meta?.textContent?.trim() || 'KDV dahil · Türkiye içi gönderim',
      url: media?.getAttribute('href') || window.location.pathname,
      tags: pills,
      categoryTheme: inferCollectionTheme()
    };
  }

  function setProductQueryParam(id) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('product', id);
    else url.searchParams.delete('product');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function attachCollectionDetailExperience() {
    const isCollectionPage = window.location.pathname.includes('/collections/');
    if (!isCollectionPage) return;

    document.body.classList.add('collection-page');

    const grid = document.querySelector('.product-grid');
    if (!grid) return;

    const detailShell = document.createElement('section');
    detailShell.className = 'collection-detail-shell';
    detailShell.hidden = true;
    grid.parentElement.insertBefore(detailShell, grid);

    function renderDetail(product) {
      if (!product?.id) return;
      const theme = inferCollectionTheme();
      const tabs = inferTabContent(product, theme);
      const favoriteActive = isFavorite(product.id);
      const floatingBottom = product.tags?.length ? product.tags.slice(0, 2).join(' · ') : inferRoutineStep(product, theme);
      detailShell.innerHTML = `
        <div class="collection-detail-toolbar">
          <button type="button" class="collection-detail-back">Tüm Ürünlere Dön</button>
          <div class="collection-detail-note">Ürün bilgileri, kullanım sırası ve temel teslimat notları</div>
        </div>
        <div class="collection-detail-grid">
          <div class="collection-detail-media">
            <div class="collection-detail-floating collection-detail-floating--top">${escapeHtml(inferRoutineStep(product, theme))}</div>
            <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
            <div class="collection-detail-floating collection-detail-floating--bottom"><strong>${escapeHtml(floatingBottom)}</strong></div>
          </div>
          <div class="collection-detail-info">
            <div class="collection-detail-brand">${escapeHtml(product.brand)}</div>
            <h2 class="collection-detail-title">${escapeHtml(product.name)}</h2>
            <p class="collection-detail-summary">${escapeHtml(product.description || 'Seçilmiş ürün bilgisi bu ekranda net ve sade biçimde sunulur.')}</p>
            <div class="collection-detail-pills">
              ${(product.tags?.length ? product.tags : [theme, 'premium']).slice(0, 4).map((tag) => `<span class="collection-detail-pill">${escapeHtml(tag)}</span>`).join('')}
            </div>
            <div class="collection-detail-price-row">
              <div class="collection-detail-price-wrap">
                <div class="price">${fmt(product.price || 0)}</div>
                <div class="price-note">${escapeHtml(product.meta || 'KDV dahil')}</div>
              </div>
              <div class="collection-detail-actions">
                <button class="btn btn-primary" type="button" data-detail-add-cart>Sepete Ekle</button>
                <button class="collection-detail-favorite ${favoriteActive ? 'active' : ''} favorite-btn" type="button" aria-label="${favoriteActive ? 'Favorilerden kaldır' : 'Favorilere ekle'}" aria-pressed="${favoriteActive ? 'true' : 'false'}" data-favorite-id="${escapeHtml(product.id)}" data-name="${escapeHtml(product.name)}" data-brand="${escapeHtml(product.brand)}" data-price="${escapeHtml(product.price)}" data-image="${escapeHtml(product.image)}" data-url="${escapeHtml(product.url)}">${favoriteHeartIcon(favoriteActive)}</button>
              </div>
            </div>
            <div class="collection-detail-trust">
              <article><h4>Hızlı Karar</h4><p>Ürün ismi, fayda ve rutin sırası tek bakışta anlaşılır yapıdadır.</p></article>
              <article><h4>Güven İşaretleri</h4><p>Net fiyat, KDV bilgisi ve kargo avantajı kullanıcı tereddüdünü azaltır.</p></article>
              <article><h4>Apple Düzeyi Netlik</h4><p>Tek ürün odağı, sakin tipografi ve boşluk kullanımı satın alma akışını güçlendirir.</p></article>
            </div>
            <div class="collection-detail-tabs">
              <button type="button" class="collection-detail-tab active" data-detail-tab="overview">Ürün Bilgileri</button>
              <button type="button" class="collection-detail-tab" data-detail-tab="routine">Kullanım</button>
              <button type="button" class="collection-detail-tab" data-detail-tab="fit">Cilt Tipi</button>
              <button type="button" class="collection-detail-tab" data-detail-tab="trust">Teslimat & Güven</button>
            </div>
            <div class="collection-detail-panels">
              ${Object.entries(tabs).map(([key, value], index) => `
                <div class="collection-detail-panel ${index === 0 ? 'active' : ''}" data-detail-panel="${key}">
                  <h3>${escapeHtml(value.title)}</h3>
                  ${value.body}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
      detailShell.hidden = false;
      document.body.classList.add('collection-has-detail');
      setProductQueryParam(product.id);
      detailShell.scrollIntoView({ behavior: 'smooth', block: 'start' });
      renderFavoriteButtons();

      detailShell.querySelector('.collection-detail-back')?.addEventListener('click', () => {
        detailShell.hidden = true;
        detailShell.innerHTML = '';
        document.body.classList.remove('collection-has-detail');
        setProductQueryParam('');
      });

      detailShell.querySelector('[data-detail-add-cart]')?.addEventListener('click', async () => {
        const item = {
          id: product.id,
          slug: product.slug || product.id,
          product_slug: product.slug || product.id,
          name: product.name,
          brand: product.brand,
          price: Number(product.price || 0),
          image: product.image,
          url: product.url,
          qty: 1,
          quantity: 1
        };
        if (window.COSMOSKIN_STOCK?.validateAdd) {
          const allowed = await window.COSMOSKIN_STOCK.validateAdd(item);
          if (!allowed) return;
        }
        addCartItems([item], { openDrawer: true });
      });

      $$('.collection-detail-tab', detailShell).forEach((tab) => {
        tab.addEventListener('click', () => {
          $$('.collection-detail-tab', detailShell).forEach((btn) => btn.classList.remove('active'));
          $$('.collection-detail-panel', detailShell).forEach((panel) => panel.classList.remove('active'));
          tab.classList.add('active');
          detailShell.querySelector(`[data-detail-panel="${tab.dataset.detailTab}"]`)?.classList.add('active');
        });
      });
    }

    const cards = $$('.product-card', grid);
    cards.forEach((card) => {
      const product = getCollectionProductData(card);
      card.dataset.productId = product.id;
      const media = card.querySelector('.product-media');
      const title = card.querySelector('h3');

      [media, title].forEach((target) => {
        if (!target) return;
        target.style.cursor = 'pointer';
        target.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          renderDetail(getCollectionProductData(card));
        });
      });

      card.addEventListener('click', (event) => {
        if (event.target.closest('button') || event.target.closest('.favorite-btn') || event.target.closest('[data-add-cart]')) return;
        if (event.target.closest('.product-media') || event.target.closest('h3') || event.target.closest('.product-body')) {
          renderDetail(getCollectionProductData(card));
        }
      });
    });

    const selectedId = new URL(window.location.href).searchParams.get('product');
    if (selectedId) {
      const selectedCard = cards.find((card) => card.dataset.productId === selectedId);
      if (selectedCard) renderDetail(getCollectionProductData(selectedCard));
    }

    window.addEventListener('cosmoskin:favorites-updated', () => {
      const currentId = new URL(window.location.href).searchParams.get('product');
      if (!currentId || detailShell.hidden) return;
      const activeCard = cards.find((card) => card.dataset.productId === currentId);
      if (activeCard) renderDetail(getCollectionProductData(activeCard));
    });
  }

  attachCollectionDetailExperience();

  // ---------------------------------------------------------------------------
  // Phase 5 — Akıllı Rutin Seçimi: Gündüz / Akşam mood toggle
  // ---------------------------------------------------------------------------
  // Toggles `data-mood` on the .home-routine section so CSS can swap the
  // background gradient + ink color. Choice is persisted in localStorage so
  // it survives page reloads. Soft, single-line behavior; no animations
  // beyond the CSS `transition`.
  function attachRoutineMoodToggle() {
    const section = document.querySelector('.home-routine');
    if (!section) return;
    const buttons = Array.from(section.querySelectorAll('.home-routine__mood-btn'));
    if (!buttons.length) return;

    const STORAGE_KEY = 'cosmoskin_routine_mood';
    const apply = (mood) => {
      section.dataset.mood = mood;
      buttons.forEach((btn) => {
        const isActive = btn.dataset.mood === mood;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    };

    let initial = 'day';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'day' || stored === 'night') initial = stored;
    } catch (_) { /* localStorage unavailable */ }
    apply(initial);

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.mood;
        if (next !== 'day' && next !== 'night') return;
        apply(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch (_) { /* swallow */ }
      });
    });
  }
  attachRoutineMoodToggle();

})();
