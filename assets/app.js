(function () {
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const cfg = window.COSMOSKIN_CONFIG || {};
  const VAT = Number(cfg.vatRate ?? 0.20);
  const FREE_SHIPPING = Number(cfg.freeShippingThreshold ?? 2500);
  const SHIPPING_FEE = Number(cfg.shippingFee ?? 119);
  const state = {
    cart: JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'),
    favorites: [],
    consent: JSON.parse(localStorage.getItem('cosmoskin_consent') || 'null')
  };
  const FAVORITES_KEY = 'cosmoskin_favorites';
  const LEGACY_FAVORITES_KEY = 'cosmoskin_favorites_v1';
  let favoriteAccountSyncReady = false;

  function readFavoriteStorage() {
    try {
      const currentRaw = localStorage.getItem(FAVORITES_KEY);
      const legacyRaw = localStorage.getItem(LEGACY_FAVORITES_KEY);
      let current = [];
      if (currentRaw) {
        const parsed = JSON.parse(currentRaw);
        if (Array.isArray(parsed)) current = parsed;
        else if (parsed && typeof parsed === 'object') current = Object.values(parsed);
      }
      if ((!current || !current.length) && legacyRaw) {
        const legacyParsed = JSON.parse(legacyRaw);
        if (Array.isArray(legacyParsed)) current = legacyParsed;
        else if (legacyParsed && typeof legacyParsed === 'object') current = Object.values(legacyParsed);
      }
      return Array.isArray(current) ? current : [];
    } catch (error) {
      return [];
    }
  }

  state.favorites = readFavoriteStorage();

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

  function fmt(n) {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      maximumFractionDigits: 0
    }).format(n);
  }

  function totals() {
    const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
    const vat = Math.round(subtotal * VAT / (1 + VAT));
    const shipping = subtotal >= FREE_SHIPPING || subtotal === 0 ? 0 : SHIPPING_FEE;
    return { subtotal, vat, shipping, total: subtotal + shipping };
  }

  function openDrawer(drawer) {
    if (!drawer) return;
    drawer.classList.add('open');
    backdrop?.classList.add('show');
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
    $('.shop-wrap')?.classList.remove('open');
    mobileNav?.classList.remove('open');
    document.body.classList.remove('modal-open');
  });

  $$('.close-any').forEach((btn) => btn.addEventListener('click', () => {
    closeDrawers();
    closeModals();
    mobileNav?.classList.remove('open');
    document.body.classList.remove('modal-open');
  }));

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
      $('.shop-wrap')?.classList.remove('open');
      $('.brands-wrap')?.classList.remove('open');
      mobileNav?.classList.remove('open');
      document.body.classList.remove('modal-open');
    }
  });

  const shopWrap = $('.shop-wrap');
  if (shopWrap) {
    const trigger = shopWrap.querySelector('.shop-trigger');
    const openMenu = () => {
      clearTimeout(megaTimer);
      shopWrap.classList.add('open');
      trigger?.setAttribute('aria-expanded', 'true');
    };
    const closeMenu = () => {
      clearTimeout(megaTimer);
      megaTimer = setTimeout(() => {
        shopWrap.classList.remove('open');
        trigger?.setAttribute('aria-expanded', 'false');
      }, 140);
    };

    trigger?.addEventListener('click', (e) => {
      e.preventDefault();
      shopWrap.classList.toggle('open');
      trigger.setAttribute('aria-expanded', shopWrap.classList.contains('open') ? 'true' : 'false');
    });

    shopWrap.addEventListener('mouseenter', () => window.innerWidth > 1150 && openMenu());
    shopWrap.addEventListener('mouseleave', () => window.innerWidth > 1150 && closeMenu());
  }

  // ── Brands mega menu (same pattern as shop-wrap) ──────────
  const brandsWrap = $('.brands-wrap');
  if (brandsWrap) {
    let brandsTimer;
    const brandsTrigger = brandsWrap.querySelector('.brands-trigger');
    const openBrands = () => {
      clearTimeout(brandsTimer);
      brandsWrap.classList.add('open');
      brandsTrigger?.setAttribute('aria-expanded', 'true');
    };
    const closeBrands = () => {
      clearTimeout(brandsTimer);
      brandsTimer = setTimeout(() => {
        brandsWrap.classList.remove('open');
        brandsTrigger?.setAttribute('aria-expanded', 'false');
      }, 140);
    };
    brandsTrigger?.addEventListener('click', (e) => {
      e.preventDefault();
      brandsWrap.classList.toggle('open');
      brandsTrigger.setAttribute('aria-expanded', brandsWrap.classList.contains('open') ? 'true' : 'false');
    });
    brandsWrap.addEventListener('mouseenter', () => window.innerWidth > 1150 && openBrands());
    brandsWrap.addEventListener('mouseleave', () => window.innerWidth > 1150 && closeBrands());
  }


  function persistCart() {
    localStorage.setItem('cosmoskin_cart', JSON.stringify(state.cart));
    renderCart();
    renderCheckout();
  }

  function normalizeFavoriteItem(item) {
    if (!item?.id) return null;
    return {
      id: String(item.id),
      name: item.name || 'Ürün',
      brand: item.brand || 'Cosmoskin',
      price: Number(item.price || 0),
      image: item.image || '',
      url: item.url || ''
    };
  }

  function uniqueFavorites(items = []) {
    const map = new Map();
    items.forEach((item) => {
      const normalized = normalizeFavoriteItem(item);
      if (normalized && !map.has(normalized.id)) {
        map.set(normalized.id, normalized);
      }
    });
    return Array.from(map.values());
  }

  
  function favoriteHeartIcon(active = false) {
    return `<span class="favorite-btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.1 20.3 4.9 13.4a4.8 4.8 0 0 1 6.8-6.8l.3.3.3-.3a4.8 4.8 0 1 1 6.8 6.8l-7.2 6.9a.6.6 0 0 1-.8 0Z" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  }
function broadcastFavoritesChange() {
    window.dispatchEvent(new CustomEvent('cosmoskin:favorites-updated', { detail: { favorites: state.favorites } }));
  }

  async function saveFavoritesToAccount() {
    const client = window.cosmoskinSupabase;
    if (!client || !favoriteAccountSyncReady) return;
    try {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;
      const metadata = user.user_metadata || {};
      const { error } = await client.auth.updateUser({
        data: {
          ...metadata,
          favorites: state.favorites
        }
      });
      if (error) throw error;
    } catch (error) {
      console.warn('Favorites account sync warning:', error);
    }
  }

  function persistFavorites(options = {}) {
    state.favorites = uniqueFavorites(state.favorites);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
    localStorage.removeItem(LEGACY_FAVORITES_KEY);
    renderFavoriteButtons();
    broadcastFavoritesChange();
    if (!options.skipRemote) {
      saveFavoritesToAccount();
    }
  }

  async function hydrateFavoritesFromAccount() {
    const client = window.cosmoskinSupabase;
    if (!client) return;
    try {
      const { data: { user } } = await client.auth.getUser();
      favoriteAccountSyncReady = Boolean(user);
      if (!user) return;
      const remoteFavorites = Array.isArray(user.user_metadata?.favorites) ? user.user_metadata.favorites : [];
      const localFavorites = uniqueFavorites(state.favorites);
      const resolvedFavorites = localFavorites.length ? localFavorites : uniqueFavorites(remoteFavorites);
      const remoteIds = JSON.stringify(uniqueFavorites(remoteFavorites).map((item) => item.id).sort());
      const resolvedIds = JSON.stringify(resolvedFavorites.map((item) => item.id).sort());
      state.favorites = resolvedFavorites;
      persistFavorites({ skipRemote: true });
      if (remoteIds !== resolvedIds) {
        await saveFavoritesToAccount();
      }
    } catch (error) {
      console.warn('Favorites hydrate warning:', error);
    }
  }

  function watchFavoriteAuthState() {
    const client = window.cosmoskinSupabase;
    if (!client?.auth?.onAuthStateChange) return;
    client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        favoriteAccountSyncReady = Boolean(session?.user);
        await hydrateFavoritesFromAccount();
      }
      if (event === 'SIGNED_OUT') {
        favoriteAccountSyncReady = false;
      }
    });
  }

  function isFavorite(id) {
    return state.favorites.some((item) => item.id === id);
  }

  function toggleFavorite(item) {
    const normalized = normalizeFavoriteItem(item);
    if (!normalized?.id) return;
    if (isFavorite(normalized.id)) {
      state.favorites = state.favorites.filter((entry) => entry.id !== normalized.id);
      showFavoriteToast('Favorilerden çıkarıldı');
    } else {
      state.favorites.unshift(normalized);
      showFavoriteToast('Favorilere eklendi');
    }
    persistFavorites();
  }

  function getProductDataFromButton(btn) {
    if (!btn) return null;
    return {
      id: btn.dataset.id,
      name: btn.dataset.name,
      brand: btn.dataset.brand,
      price: Number(btn.dataset.price),
      image: btn.dataset.image,
      url: btn.closest('.product-card')?.querySelector('.product-media')?.getAttribute('href') || window.location.pathname
    };
  }

  function ensureFavoriteButtons() {
    $$('.product-card').forEach((card) => {
      const media = card.querySelector('.product-media');
      const cartBtn = card.querySelector('[data-add-cart]');
      if (!media || !cartBtn || media.querySelector('.favorite-btn')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'favorite-btn';
      button.setAttribute('aria-label', 'Favorilere ekle');
      button.setAttribute('title', 'Favorilere ekle');
      button.dataset.favoriteId = cartBtn.dataset.id;
      button.innerHTML = favoriteHeartIcon(false);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(getProductDataFromButton(cartBtn));
      });
      media.appendChild(button);
    });
  }

  function renderFavoriteButtons() {
    $$('.favorite-btn').forEach((button) => {
      if (!button.dataset.favoriteBound) {
        button.dataset.favoriteBound = 'true';
        button.addEventListener('click', (event) => {
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
          toggleFavorite(explicit?.id ? explicit : getProductDataFromButton(cardCartBtn));
        });
      }
      const active = isFavorite(button.dataset.favoriteId);
      button.classList.toggle('active', active);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? 'Favorilerden çıkar' : 'Favorilere ekle');
      button.setAttribute('title', active ? 'Favorilerden çıkar' : 'Favorilere ekle');
      const icon = button.querySelector('.favorite-btn-icon');
      if (icon) icon.innerHTML = favoriteHeartIcon(active).replace('<span class="favorite-btn-icon" aria-hidden="true">','').replace('</span>','');
    });
  }

  function updateQty(id, delta) {
    state.cart = state.cart
      .map((item) => item.id === id ? { ...item, qty: item.qty + delta } : item)
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

    $$('.cart-count').forEach((el) => {
      el.textContent = qty;
      el.style.display = qty ? 'grid' : 'none';
    });

    const t = totals();
    if (subtotalEl) subtotalEl.textContent = fmt(t.subtotal);
    if (vatEl) vatEl.textContent = fmt(t.vat);
    if (shippingEl) shippingEl.textContent = t.shipping ? fmt(t.shipping) : 'Ücretsiz';
    if (totalEl) totalEl.textContent = fmt(t.total);
    if (shippingProgressFill && shippingProgressText) {
      const ratio = Math.max(0, Math.min(100, Math.round((t.subtotal / FREE_SHIPPING) * 100)));
      shippingProgressFill.style.width = `${ratio}%`;
      if (t.subtotal === 0) {
        shippingProgressText.textContent = `${fmt(FREE_SHIPPING)} üzeri siparişlerde ücretsiz kargo avantajı uygulanır.`;
      } else if (t.subtotal >= FREE_SHIPPING) {
        shippingProgressText.textContent = 'Siparişiniz ücretsiz kargo avantajına ulaştı.';
      } else {
        shippingProgressText.textContent = `${fmt(FREE_SHIPPING - t.subtotal)} daha ekleyerek ücretsiz kargo avantajına ulaşabilirsiniz.`;
      }
    }

    if (!target) return;
    if (!state.cart.length) {
      target.innerHTML = '<div class="account-state"><strong>Sepetiniz şu an boş.</strong><div class="account-mini">Eklediğiniz ürünler burada listelenir.</div></div>';
      return;
    }

    target.innerHTML = state.cart.map((item) => `
      <article class="cart-item">
        <img src="${item.image}" alt="${item.name}">
        <div>
          <strong>${item.name}</strong>
          <div class="account-mini">${item.brand}</div>
          <div class="qty">
            <button type="button" data-dec="${item.id}">−</button>
            <span>${item.qty}</span>
            <button type="button" data-inc="${item.id}">+</button>
            <button type="button" data-remove="${item.id}">Sil</button>
          </div>
        </div>
        <strong>${fmt(item.price * item.qty)}</strong>
      </article>
    `).join('');

    $$('[data-inc]', target).forEach((btn) => btn.addEventListener('click', () => updateQty(btn.dataset.inc, 1)));
    $$('[data-dec]', target).forEach((btn) => btn.addEventListener('click', () => updateQty(btn.dataset.dec, -1)));
    $$('[data-remove]', target).forEach((btn) => btn.addEventListener('click', () => removeItem(btn.dataset.remove)));
  }

  ensureFavoriteButtons();
  renderFavoriteButtons();
  hydrateFavoritesFromAccount();
  watchFavoriteAuthState();

  window.addEventListener('load', () => {
    ensureFavoriteButtons();
    renderFavoriteButtons();
    setTimeout(() => {
      ensureFavoriteButtons();
      renderFavoriteButtons();
    }, 120);
  });

  $$('[data-add-cart]').forEach((btn) => btn.addEventListener('click', () => {
    const item = {
      id: btn.dataset.id,
      name: btn.dataset.name,
      brand: btn.dataset.brand,
      price: Number(btn.dataset.price),
      image: btn.dataset.image,
      qty: 1
    };
    const found = state.cart.find((entry) => entry.id === item.id);
    if (found) found.qty += 1;
    else state.cart.push(item);
    persistCart();
    openDrawer(cartDrawer);
  }));

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
    if (shipping) shipping.textContent = t.shipping ? fmt(t.shipping) : 'Ücretsiz';
    if (total) total.textContent = fmt(t.total);

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

  renderCart();
  renderCheckout();

  function setConsent(mode) {
    const consent = {
      essential: true,
      analytics: mode === 'all' || (mode === 'custom' && $('#prefAnalytics')?.checked)
    };
    state.consent = consent;
    localStorage.setItem('cosmoskin_consent', JSON.stringify(consent));
    cookieBanner?.classList.remove('show');
    closeModals();
    if (consent.analytics && window.enableAnalytics) window.enableAnalytics();
  }

  $('#cookieAcceptAll')?.addEventListener('click', () => setConsent('all'));
  $('#cookieAcceptEssential')?.addEventListener('click', () => setConsent('essential'));
  $('#cookieSavePrefs')?.addEventListener('click', () => setConsent('custom'));
  $('#cookieCustomize')?.addEventListener('click', () => openModal(prefModal));

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

  $$('form[data-static-form="true"]').forEach((form) => form.addEventListener('submit', (event) => {
    event.preventDefault();
    const status = $('.form-status', form);
    if (status) {
      status.textContent = 'Form altyapısı Cloudflare uyumlu şekilde yeniden bağlanana kadar lütfen ilgili e-posta adresi üzerinden bizimle iletişime geçin.';
    }
  }));

  function inferCollectionTheme() {
    const path = window.location.pathname;
    if (path.includes('/collections/cleanse')) return 'cleanse';
    if (path.includes('/collections/hydrate')) return 'hydrate';
    if (path.includes('/collections/treat')) return 'treat';
    if (path.includes('/collections/protect')) return 'protect';
    if (path.includes('/collections/routine')) return 'routine';
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
      brand: cartBtn?.dataset.brand || brand?.textContent?.trim() || badge?.textContent?.trim() || 'Cosmoskin',
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
          <div class="collection-detail-note">Satış odaklı ürün görünümü · tek ürün odaklı detay ekranı</div>
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
                <button class="collection-detail-favorite ${favoriteActive ? 'active' : ''} favorite-btn" type="button" aria-label="${favoriteActive ? 'Favorilerden çıkar' : 'Favorilere ekle'}" aria-pressed="${favoriteActive ? 'true' : 'false'}" data-favorite-id="${escapeHtml(product.id)}" data-name="${escapeHtml(product.name)}" data-brand="${escapeHtml(product.brand)}" data-price="${escapeHtml(product.price)}" data-image="${escapeHtml(product.image)}" data-url="${escapeHtml(product.url)}">${favoriteHeartIcon(favoriteActive)}</button>
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

      detailShell.querySelector('[data-detail-add-cart]')?.addEventListener('click', () => {
        const item = {
          id: product.id,
          name: product.name,
          brand: product.brand,
          price: Number(product.price || 0),
          image: product.image,
          qty: 1
        };
        const found = state.cart.find((entry) => entry.id === item.id);
        if (found) found.qty += 1;
        else state.cart.push(item);
        persistCart();
        openDrawer(cartDrawer);
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

})();
