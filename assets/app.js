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


  const heroParallax = document.querySelector('[data-hero-parallax]');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function updateHeroParallax() {
    if (!heroParallax || prefersReducedMotion.matches) return;
    const heroSection = document.getElementById('heroSection');
    if (!heroSection) return;
    const rect = heroSection.getBoundingClientRect();
    const viewport = window.innerHeight || document.documentElement.clientHeight || 1;
    const progress = Math.max(-1, Math.min(1, (viewport - rect.top) / (viewport + rect.height)));
    const intensity = window.innerWidth <= 768 ? 0.45 : 1;
    heroParallax.style.setProperty('--hero-cloud-back-y', `${Math.round(progress * 26 * intensity)}px`);
    heroParallax.style.setProperty('--hero-cloud-front-y', `${Math.round(progress * 40 * intensity)}px`);
    heroParallax.style.setProperty('--hero-product-y', `${Math.round(progress * 14 * intensity)}px`);
    heroParallax.style.setProperty('--hero-card-rotate', `${(progress * -1.2 * intensity).toFixed(3)}deg`);
    heroParallax.style.setProperty('--hero-glow-shift', `${Math.round(progress * 18 * intensity)}px`);
  }

  let heroParallaxTick = false;
  function onHeroParallaxScroll() {
    if (heroParallaxTick) return;
    heroParallaxTick = true;
    requestAnimationFrame(() => {
      updateHeroParallax();
      heroParallaxTick = false;
    });
  }

  if (heroParallax) {
    updateHeroParallax();
    window.addEventListener('scroll', onHeroParallaxScroll, { passive: true });
    window.addEventListener('resize', onHeroParallaxScroll);
    if (typeof prefersReducedMotion.addEventListener === 'function') {
      prefersReducedMotion.addEventListener('change', onHeroParallaxScroll);
    }
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
      state.favorites = uniqueFavorites([...state.favorites, ...remoteFavorites]);
      persistFavorites({ skipRemote: true });
      await saveFavoritesToAccount();
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

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  $$('form[data-static-form="true"]').forEach((form) => form.addEventListener('submit', (event) => {
    event.preventDefault();
    const status = $('.form-status', form);
    if (status) {
      status.textContent = 'Form altyapısı Cloudflare uyumlu şekilde yeniden bağlanana kadar lütfen ilgili e-posta adresi üzerinden bizimle iletişime geçin.';
    }
  }));
})();

// Handle ?openAuth=login redirect (from email verification callback)
(function(){
  const params = new URLSearchParams(window.location.search);
  if (params.get('openAuth') === 'login') {
    window.addEventListener('DOMContentLoaded', function() {
      const accountModal = document.getElementById('accountModal');
      const backdrop     = document.getElementById('backdrop');
      if (accountModal && backdrop) {
        accountModal.classList.add('show');
        backdrop.classList.add('show');
        // Clean URL without reload
        const url = new URL(window.location.href);
        url.searchParams.delete('openAuth');
        history.replaceState(null, '', url.toString());
      }
    });
  }
})();
