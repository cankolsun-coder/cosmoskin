(function ensureCartCommerceScripts() {
  if (!window.COSMOSKIN_COUPON) {
    document.write('<script src="/assets/coupon-client.js?v=20260708-c2"><\/script>');
  }
  if (!window.COSMOSKIN_CART_COMMERCE) {
    document.write('<script src="/assets/cart-commerce.js?v=20260709-c3"><\/script>');
  }
}());

(function () {
  var PRODUCT_KEY = 'cosmoskin_recent_products_v1';
  var COMPARE_KEY = 'cosmoskin_compare_products_v1';
  var COUPON_KEY = 'cosmoskin_coupon_state_v1';
  var LEGACY_COUPON_KEY = 'cosmoskin_coupon_code';
  var cartRecommendationIndex = 0;
  var couponApplyInFlight = false;
  var fmt = window.COSMOSKIN_FORMAT_PRICE || function (n) {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(n || 0));
  };
  function priceDisplayHtml(p, options) {
    var PD = window.COSMOSKIN_PRICE_DISPLAY;
    if (PD && typeof PD.renderPriceHtml === 'function') return PD.renderPriceHtml(p, options);
    return '<span class="cs-price cs-price--compact"><span class="cs-price__current">' + escapeHtml(fmt(p.price)) + '</span></span>';
  }

  function commerce() { return window.COSMOSKIN_CART_COMMERCE || null; }
  function products() { return window.COSMOSKIN_PRODUCTS || []; }
  function bySlug(slug) {
    var helpers = window.COSMOSKIN_PRODUCT_HELPERS;
    return helpers && helpers.getProductBySlug ? helpers.getProductBySlug(slug) : products().find(function (p) { return p.slug === slug; });
  }
  function read(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; } }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>'"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch];
    });
  }
  function currentSlug() {
    var main = document.querySelector('[data-product-slug]');
    if (main) return main.getAttribute('data-product-slug');
    var m = location.pathname.match(/\/products\/([^/.]+)/);
    return m ? m[1] : '';
  }
  function cartItems() {
    return (window.COSMOSKIN_CART_API && window.COSMOSKIN_CART_API.getItems && window.COSMOSKIN_CART_API.getItems()) || [];
  }
  function readCouponSnapshot() {
    if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.readState === 'function') {
      return window.COSMOSKIN_COUPON.readState();
    }
    return null;
  }
  function readCouponCode() {
    if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.readCode === 'function') {
      return window.COSMOSKIN_COUPON.readCode();
    }
    var stored = readCouponSnapshot();
    return (stored && stored.code) || localStorage.getItem(LEGACY_COUPON_KEY) || '';
  }

  function recommendationCandidates() {
    var cc = commerce();
    if (cc && typeof cc.recommendationCandidates === 'function') {
      return cc.recommendationCandidates(cartItems(), { excludeOutOfStock: true, limit: 12 });
    }
    return [];
  }

  function pickRecommendations() {
    var list = recommendationCandidates();
    if (!list.length) return [];
    var out = [];
    for (var i = 0; i < Math.min(1, list.length); i++) {
      out.push(list[(cartRecommendationIndex + i) % list.length]);
    }
    return out;
  }

  function enhanceCartDrawerHeader() {
    var drawer = document.querySelector('#cartDrawer');
    if (!drawer || drawer.dataset.c3Premium === '1') return;
    var head = drawer.querySelector('.drawer-head');
    if (!head) return;
    drawer.dataset.c3Premium = '1';
    drawer.classList.add('cart-drawer-premium');
    head.innerHTML = '<div class="cart-drawer-premium__head"><div><p class="cart-drawer-premium__kicker">Sepetin</p><h2 class="cart-drawer-premium__title">Seçtiğin ürünleri kontrol et</h2><p class="cart-drawer-premium__subtitle">Kuponunu uygula ve güvenle ödeme adımına geç.</p></div><button class="cart-drawer-premium__close icon-close close-any" type="button" aria-label="Sepeti kapat">×</button></div>';
    var summary = drawer.querySelector('.cart-summary');
    if (summary && !summary.querySelector('.cart-drawer-premium__trust')) {
      var trust = document.createElement('p');
      trust.className = 'cart-drawer-premium__trust account-mini';
      trust.textContent = 'Güvenli ödeme · KDV dahil fiyat · 14 gün cayma hakkı';
      summary.appendChild(trust);
    }
    var checkout = drawer.querySelector('.cart-summary a[href*="checkout"]');
    if (checkout) checkout.textContent = 'Ödemeye Geç';
    if (summary && !summary.querySelector('.cart-drawer-premium__edit')) {
      var edit = document.createElement('a');
      edit.className = 'cart-drawer-premium__edit account-mini';
      edit.href = '/cart.html';
      edit.textContent = 'Sepeti Düzenle';
      var primary = summary.querySelector('a.btn-primary');
      if (primary) primary.insertAdjacentElement('afterend', edit);
    }
  }

  function setCartDrawerCommerceState() {
    var drawer = document.querySelector('#cartDrawer');
    if (!drawer) return;
    var has = cartHasItems();
    drawer.classList.toggle('cart-drawer--empty', !has);
    drawer.classList.toggle('cart-drawer--filled', has);
    var coupon = document.querySelector('#phase6CartCoupon');
    if (coupon) coupon.hidden = !has;
    var rec = document.querySelector('#phase6CartRecommendations');
    if (rec) {
      var recs = recommendationCandidates();
      rec.hidden = !has || !recs.length;
    }
    var checkoutLink = drawer.querySelector('.cart-summary a[href*="checkout"]');
    if (checkoutLink) {
      checkoutLink.setAttribute('aria-disabled', has ? 'false' : 'true');
      checkoutLink.classList.toggle('is-disabled', !has);
    }
  }

  function mountCartExtras() {
    var drawer = document.querySelector('#cartDrawer');
    if (!drawer) return;
    enhanceCartDrawerHeader();
    var summary = drawer.querySelector('.cart-summary');
    if (summary && !document.querySelector('#phase6CartCoupon')) {
      summary.insertAdjacentHTML('afterbegin',
        '<div class="phase6-coupon-box cart-drawer-premium__coupon" id="phase6CartCoupon" hidden>' +
        '<label for="phase6CouponInput">İndirim Kodu</label>' +
        '<div class="phase6-coupon-row"><input id="phase6CouponInput" autocomplete="off" placeholder="Örn. WELCOME10" aria-describedby="phase6CouponStatus">' +
        '<button type="button" id="phase6CouponApply">Uygula</button></div>' +
        '<div class="phase6-coupon-status" id="phase6CouponStatus" role="status" aria-live="polite"></div></div>');
      var created = document.querySelector('#phase6CouponInput');
      var saved = readCouponCode();
      if (created && saved) created.value = saved;
    }
    var items = document.querySelector('#cartItems');
    if (items && !document.querySelector('#phase6CartRecommendations')) {
      items.insertAdjacentHTML('afterend',
        '<div id="phase6CartRecommendations" class="phase6-coupon-box cart-drawer-premium__recs" hidden>' +
        '<div class="phase6-rec-head"><span class="phase6-rec-title">Rutini tamamlayan öneriler</span>' +
        '<div class="phase6-rec-arrows"><button class="phase6-rec-arrow" type="button" data-phase6-rec-prev aria-label="Önceki öneri">‹</button>' +
        '<button class="phase6-rec-arrow" type="button" data-phase6-rec-next aria-label="Sonraki öneri">›</button></div></div>' +
        '<div class="phase6-cart-recs"></div></div>');
    }
    renderCartRecommendations();
    hydrateCouponFromStorage();
    setCartDrawerCommerceState();
  }

  function hydrateCouponFromStorage() {
    var stored = readCouponSnapshot();
    var code = readCouponCode();
    var input = document.querySelector('#phase6CouponInput');
    if (input && code && document.activeElement !== input && !input.value) input.value = code;
    if (code && cartHasItems()) {
      renderCouponStatusFromState(stored);
    }
  }

  function renderCouponStatusFromState(stored) {
    var status = document.querySelector('#phase6CouponStatus');
    if (!status) return;
    if (!stored || !stored.code) {
      status.textContent = '';
      status.className = 'phase6-coupon-status';
      return;
    }
    var cc = commerce();
    var subtotal = cc ? cc.subtotalForItems(cartItems()) : 0;
    var discount = cc ? cc.couponDiscountAmount(subtotal, stored) : Number(stored.discountAmount || stored.discount_amount || 0);
    if (discount > 0) {
      status.className = 'phase6-coupon-status is-success';
      status.innerHTML = escapeHtml(stored.code) + ' uygulandı · -' + escapeHtml(fmt(discount)) + ' <button type="button" class="phase6-coupon-remove" id="phase6CouponRemove" aria-label="Kuponu kaldır">Kaldır</button>';
    } else {
      status.textContent = stored.code + ' kayıtlı. Sepet güncellendiğinde yeniden doğrulanır.';
      status.className = 'phase6-coupon-status is-applied';
    }
  }

  function renderCartRecommendations() {
    setCartDrawerCommerceState();
    var wrap = document.querySelector('#phase6CartRecommendations .phase6-cart-recs');
    var section = document.querySelector('#phase6CartRecommendations');
    if (!wrap || !section) return;
    if (!cartHasItems()) {
      wrap.innerHTML = '';
      section.hidden = true;
      return;
    }
    var list = recommendationCandidates();
    if (!list.length) {
      wrap.innerHTML = '';
      section.hidden = true;
      return;
    }
    section.hidden = false;
    if (cartRecommendationIndex >= list.length) cartRecommendationIndex = 0;
    var recs = pickRecommendations();
    wrap.innerHTML = '<div class="phase6-rec-track">' + recs.map(function (p) {
      return '<article class="phase6-rec-card">' +
        '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '" loading="lazy">' +
        '<div class="phase6-rec-card__copy"><strong>' + escapeHtml(p.name) + '</strong>' +
        '<span>' + escapeHtml(p.brand) + ' · ' + priceDisplayHtml(p, { compact: true, showBadge: false }) + '</span></div>' +
        '<button type="button" data-phase6-rec-cart="' + escapeHtml(p.slug) + '">Ekle</button></article>';
    }).join('') + '</div>';
  }

  async function validateCoupon(code) {
    code = String(code || '').trim().toUpperCase();
    var status = document.querySelector('#phase6CouponStatus');
    var applyBtn = document.querySelector('#phase6CouponApply');
    if (!cartHasItems()) {
      if (window.COSMOSKIN_COUPON && window.COSMOSKIN_COUPON.clearState) window.COSMOSKIN_COUPON.clearState();
      else { localStorage.removeItem(COUPON_KEY); localStorage.removeItem(LEGACY_COUPON_KEY); }
      if (status) { status.textContent = 'İndirim kodu uygulamak için önce sepetinize ürün ekleyin.'; status.className = 'phase6-coupon-status is-error'; }
      return;
    }
    if (!code) {
      if (window.COSMOSKIN_COUPON && window.COSMOSKIN_COUPON.clearState) window.COSMOSKIN_COUPON.clearState();
      else { localStorage.removeItem(COUPON_KEY); localStorage.removeItem(LEGACY_COUPON_KEY); }
      if (status) { status.textContent = 'Kupon temizlendi.'; status.className = 'phase6-coupon-status'; }
      window.dispatchEvent(new CustomEvent('cosmoskin:coupon-updated'));
      return;
    }
    if (couponApplyInFlight) return;
    couponApplyInFlight = true;
    if (status) { status.textContent = 'Kupon doğrulanıyor…'; status.className = 'phase6-coupon-status is-loading'; }
    if (applyBtn) applyBtn.disabled = true;
    try {
      var cc = commerce();
      var result = cc && typeof cc.validateCoupon === 'function'
        ? await cc.validateCoupon({ code: code, cartItems: cartItems(), shippingMethod: 'standard' })
        : { ok: false, message: 'Kupon doğrulanamadı.' };
      if (!result.ok) {
        if (window.COSMOSKIN_COUPON && window.COSMOSKIN_COUPON.clearState) window.COSMOSKIN_COUPON.clearState();
        else { localStorage.removeItem(COUPON_KEY); localStorage.removeItem(LEGACY_COUPON_KEY); }
        if (status) {
          status.textContent = result.message || 'Kupon kodu geçerli değil.';
          status.className = 'phase6-coupon-status is-error';
        }
      } else {
        renderCouponStatusFromState(window.COSMOSKIN_COUPON ? window.COSMOSKIN_COUPON.readState() : result);
      }
      window.dispatchEvent(new CustomEvent('cosmoskin:coupon-updated'));
    } catch (e) {
      if (status) { status.textContent = e.message || 'Kupon doğrulanamadı.'; status.className = 'phase6-coupon-status is-error'; }
    } finally {
      couponApplyInFlight = false;
      if (applyBtn) applyBtn.disabled = false;
    }
  }

  async function revalidateStoredCoupon() {
    var code = readCouponCode();
    if (!code || !cartHasItems()) return;
    await validateCoupon(code);
  }

  function bindCartExtras() {
    document.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'phase6CouponApply') {
        validateCoupon(document.querySelector('#phase6CouponInput') && document.querySelector('#phase6CouponInput').value);
      }
      if (e.target && (e.target.id === 'phase6CouponRemove' || e.target.closest('#phase6CouponRemove'))) {
        var input = document.querySelector('#phase6CouponInput');
        if (input) input.value = '';
        validateCoupon('');
      }
      if (e.target.closest('[data-phase6-rec-next]')) {
        cartRecommendationIndex++;
        renderCartRecommendations();
      }
      if (e.target.closest('[data-phase6-rec-prev]')) {
        var len = recommendationCandidates().length || 1;
        cartRecommendationIndex = (cartRecommendationIndex - 1 + len) % len;
        renderCartRecommendations();
      }
      var rec = e.target.closest('[data-phase6-rec-cart]');
      if (rec) {
        var p = bySlug(rec.getAttribute('data-phase6-rec-cart'));
        if (p && window.COSMOSKIN_CART_API) {
          window.COSMOSKIN_CART_API.addItems([{ id: p.slug, slug: p.slug, name: p.name, brand: p.brand, price: p.price, image: p.image, url: p.url, qty: 1 }]);
          setTimeout(function () { cartRecommendationIndex = 0; renderCartRecommendations(); revalidateStoredCoupon(); }, 120);
        }
      }
      var checkout = e.target.closest('#cartDrawer .cart-summary a[href*="checkout"]');
      if (checkout && !cartHasItems()) {
        e.preventDefault();
        var target = document.querySelector('#cartItems .cart-empty-state, #cartItems .account-state');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    document.addEventListener('cosmoskin:cart-updated', function () {
      cartRecommendationIndex = 0;
      renderCartRecommendations();
      revalidateStoredCoupon();
    });
    window.addEventListener('cosmoskin:cart-updated', function () {
      cartRecommendationIndex = 0;
      renderCartRecommendations();
      revalidateStoredCoupon();
    });
    document.addEventListener('cosmoskin:auth-state', function () {
      revalidateStoredCoupon();
    });
    document.addEventListener('cosmoskin:cart-drawer-opened', function () {
      mountCartExtras();
      if (typeof window.renderCart === 'function') window.renderCart();
      revalidateStoredCoupon();
    });
    document.addEventListener('cosmoskin:coupon-updated', function () {
      if (typeof window.renderCart === 'function') window.renderCart();
    });
    var cartBtn = document.querySelector('#cartBtn');
    if (cartBtn) {
      cartBtn.addEventListener('click', function () {
        setTimeout(function () {
          mountCartExtras();
          revalidateStoredCoupon();
        }, 0);
      });
    }
  }

  function mountCheckoutCoupon() {
    if (document.body && document.body.classList.contains('checkout-premium-page')) return;
  }

  function rememberProduct() {
    var slug = currentSlug();
    if (!slug) return;
    var list = read(PRODUCT_KEY).filter(function (s) { return s !== slug; });
    list.unshift(slug);
    write(PRODUCT_KEY, list.slice(0, 12));
  }

  function miniCard(p) {
    if (!p) return '';
    return '<a class="phase6-mini-product" href="' + escapeHtml(p.url) + '"><img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '"><span><strong>' + escapeHtml(p.name) + '</strong><span>' + escapeHtml(p.brand) + ' · ' + priceDisplayHtml(p, { compact: true, showBadge: false }) + '</span></span></a>';
  }

  function compareList() { return read(COMPARE_KEY).map(bySlug).filter(Boolean).slice(0, 4); }
  function addCompare(slug) {
    var list = read(COMPARE_KEY).filter(function (s) { return s !== slug; });
    list.unshift(slug);
    write(COMPARE_KEY, list.slice(0, 4));
    renderCompareBar();
  }
  function renderCompareBar() {
    var list = compareList();
    var bar = document.querySelector('#phase6CompareBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'phase6CompareBar';
      bar.className = 'phase6-compare-bar';
      document.body.appendChild(bar);
    }
    if (!list.length) { bar.classList.remove('is-visible'); return; }
    bar.classList.add('is-visible');
    bar.innerHTML = '<strong>' + list.length + ' ürün karşılaştırılıyor</strong><button type="button" data-phase6-open-compare>Karşılaştır</button><button type="button" data-phase6-clear-compare>Temizle</button>';
  }
  function openCompare() {
    var list = compareList();
    if (!list.length) return;
    var modal = document.querySelector('#phase6CompareModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'phase6CompareModal';
      modal.className = 'phase6-modal';
      document.body.appendChild(modal);
    }
    var rows = ['Marka', 'Kategori', 'Hacim', 'Fiyat', 'Ürün'].map(function (label) {
      return '<tr><th>' + label + '</th>' + list.map(function (p) {
        var val = label === 'Marka' ? p.brand : label === 'Kategori' ? p.category : label === 'Hacim' ? (p.volume || '-') : label === 'Fiyat' ? fmt(p.price) : '<a href="' + escapeHtml(p.url) + '">' + escapeHtml(p.name) + '</a>';
        return '<td>' + val + '</td>';
      }).join('') + '</tr>';
    }).join('');
    modal.innerHTML = '<div class="phase6-modal__backdrop" data-phase6-close></div><div class="phase6-modal__panel"><button class="phase6-modal__close" data-phase6-close>×</button><p class="kicker">Ürün Karşılaştırma</p><h2>Benzer ürünleri tek bakışta karşılaştır.</h2><table class="phase6-compare-table">' + rows + '</table></div>';
    modal.classList.add('is-open');
  }
  function bindCompare() {
    document.addEventListener('click', function (e) {
      var add = e.target.closest('[data-compare-add]');
      if (add) { e.preventDefault(); addCompare(add.getAttribute('data-compare-add')); return; }
      if (e.target.closest('[data-phase6-open-compare]')) openCompare();
      if (e.target.closest('[data-phase6-clear-compare]')) { write(COMPARE_KEY, []); renderCompareBar(); }
      if (e.target.closest('[data-phase6-close]')) {
        var m = document.querySelector('#phase6CompareModal');
        if (m) m.classList.remove('is-open');
      }
    });
  }
  function enhancePdp() {
    var slug = currentSlug();
    if (!slug) return;
    var p = bySlug(slug);
    var actions = document.querySelector('.pdp-actions,.pdp5-actions,.product-actions');
    if (actions && !document.querySelector('[data-compare-add="' + slug + '"]')) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-secondary phase6-compare-pdp';
      b.setAttribute('data-compare-add', slug);
      b.textContent = 'Karşılaştır';
      actions.appendChild(b);
    }
    var stock = document.querySelector('.pdp5-stock,.stock-pill,.product-stock');
    if (stock && p) stock.classList.add('phase6-stock-badge');
  }
  function mountRecent() {
    var slug = currentSlug();
    if (!slug) return;
    var anchor = document.querySelector('#reviewsSection') || document.querySelector('main');
    if (!anchor || document.querySelector('#phase6RecentViewed')) return;
    var items = read(PRODUCT_KEY).filter(function (s) { return s !== slug; }).map(bySlug).filter(Boolean).slice(0, 4);
    if (!items.length) return;
    var sec = document.createElement('section');
    sec.className = 'section phase6-section';
    sec.id = 'phase6RecentViewed';
    sec.innerHTML = '<div class="container"><div class="phase6-section-head"><div><p class="kicker">Son gezilenler</p><h2>İlgilendiğin ürünlere hızlı dön.</h2></div></div><div class="phase6-recent-grid">' + items.map(miniCard).join('') + '</div></div>';
    anchor.insertAdjacentElement('afterend', sec);
  }

  var complements = {
    'Temizleyiciler': ['Tonik & Essence', 'Serum & Ampul', 'Nemlendiriciler', 'Güneş Koruyucular'],
    'Tonik & Essence': ['Serum & Ampul', 'Nemlendiriciler', 'Güneş Koruyucular', 'Maskeler'],
    'Serum & Ampul': ['Nemlendiriciler', 'Güneş Koruyucular', 'Tonik & Essence', 'Temizleyiciler'],
    'Nemlendiriciler': ['Güneş Koruyucular', 'Serum & Ampul', 'Tonik & Essence', 'Temizleyiciler'],
    'Güneş Koruyucular': ['Temizleyiciler', 'Tonik & Essence', 'Serum & Ampul', 'Nemlendiriciler'],
    'Maskeler': ['Nemlendiriciler', 'Serum & Ampul', 'Tonik & Essence', 'Güneş Koruyucular']
  };

  function renderPdpComplementary() {
    var slug = currentSlug();
    if (!slug) return;
    var current = bySlug(slug);
    if (!current) return;
    var section = document.querySelector('.pdp5-related');
    var grid = section && section.querySelector('.pdp5-related-grid');
    if (!section || !grid) return;
    var head = section.querySelector('.pdp5-section-head h2');
    if (head) head.textContent = 'Rutini Tamamlayan Ürünler';
    var kicker = section.querySelector('.pdp5-section-head .kicker');
    if (kicker) kicker.textContent = 'Birlikte iyi çalışır';
    var wanted = complements[current.category] || [];
    var rank = new Map();
    wanted.forEach(function (c, i) { rank.set(c, i); });
    var currentKeywords = (current.keywords || []).map(function (k) { return String(k).toLowerCase(); });
    var list = products().filter(function (p) { return p && p.slug !== slug; }).map(function (p) {
      var score = 0;
      if (rank.has(p.category)) score += 100 - rank.get(p.category) * 8;
      else if (p.category === current.category) score -= 20;
      (p.keywords || []).forEach(function (k) { if (currentKeywords.indexOf(String(k).toLowerCase()) !== -1) score += 3; });
      if (p.brand === current.brand) score += 4;
      return { p: p, score: score };
    }).filter(function (x) { return x.score > 0; }).sort(function (a, b) {
      return b.score - a.score || Number(a.p.price || 0) - Number(b.p.price || 0);
    }).map(function (x) { return x.p; }).slice(0, 4);
    if (!list.length) return;
    grid.innerHTML = list.map(function (p) {
      return '<article class="product-card cs-product-card pdp-related-card" data-product-id="' + escapeHtml(p.slug) + '"><a class="product-media" href="' + escapeHtml(p.url) + '"><img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '" loading="lazy"></a><div class="product-body"><span class="badge">' + escapeHtml(p.brand) + '</span><h3><a href="' + escapeHtml(p.url) + '">' + escapeHtml(p.name) + '</a></h3><p>' + escapeHtml(p.category || 'Rutini tamamlayan bakım adımı') + '</p><div class="price-row"><span class="price">' + priceDisplayHtml(p, { compact: true }) + '</span><button class="btn btn-primary" data-add-cart data-id="' + escapeHtml(p.slug) + '" data-slug="' + escapeHtml(p.slug) + '" data-name="' + escapeHtml(p.name) + '" data-brand="' + escapeHtml(p.brand) + '" data-price="' + escapeHtml(p.price) + '" data-image="' + escapeHtml(p.image) + '" data-url="' + escapeHtml(p.url) + '">Sepete Ekle</button></div></div></article>';
    }).join('');
    if (window.initCartButtons) window.initCartButtons(grid);
    if (window.initFavoriteButtons) window.initFavoriteButtons(grid);
  }

  function init() {
    rememberProduct();
    bindCompare();
    bindCartExtras();
    renderCompareBar();
    enhancePdp();
    renderPdpComplementary();
    mountRecent();
    mountCartExtras();
    mountCheckoutCoupon();
    document.addEventListener('cosmoskin:products-updated', function () {
      enhancePdp();
      renderPdpComplementary();
      mountRecent();
      renderCartRecommendations();
    });
    setInterval(mountCartExtras, 1800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
