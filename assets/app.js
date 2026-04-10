(function () {
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const cfg = window.COSMOSKIN_CONFIG || {};
  const VAT = Number(cfg.vatRate ?? 0.20);
  const FREE_SHIPPING = Number(cfg.freeShippingThreshold ?? 2500);
  const SHIPPING_FEE = Number(cfg.shippingFee ?? 119);
  const state = {
    cart: JSON.parse(localStorage.getItem('cosmoskin_cart') || '[]'),
    consent: JSON.parse(localStorage.getItem('cosmoskin_consent') || 'null')
  };

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

  function persistCart() {
    localStorage.setItem('cosmoskin_cart', JSON.stringify(state.cart));
    renderCart();
    renderCheckout();
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
