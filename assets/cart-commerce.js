(function () {
  'use strict';

  var cfg = window.COSMOSKIN_CONFIG || {};
  var VAT_RATE = Number(cfg.vatRate != null ? cfg.vatRate : 0.20);
  var FREE_SHIPPING = Number(cfg.freeShippingThreshold != null ? cfg.freeShippingThreshold : 2500);
  var SHIPPING_FEE = Number(cfg.shippingFee != null ? cfg.shippingFee : 89);
  var COUPON_KEY = 'cosmoskin_coupon_state_v1';

  var COMPLEMENTS = {
    'Temizleyiciler': ['Tonik & Essence', 'Serum & Ampul', 'Nemlendiriciler', 'Güneş Koruyucular'],
    'Tonik & Essence': ['Serum & Ampul', 'Nemlendiriciler', 'Güneş Koruyucular', 'Maskeler'],
    'Serum & Ampul': ['Nemlendiriciler', 'Güneş Koruyucular', 'Tonik & Essence', 'Temizleyiciler'],
    'Nemlendiriciler': ['Güneş Koruyucular', 'Serum & Ampul', 'Tonik & Essence', 'Temizleyiciler'],
    'Güneş Koruyucular': ['Temizleyiciler', 'Tonik & Essence', 'Serum & Ampul', 'Nemlendiriciler'],
    'Maskeler': ['Nemlendiriciler', 'Serum & Ampul', 'Tonik & Essence', 'Güneş Koruyucular']
  };

  function products() {
    return Array.isArray(window.COSMOSKIN_PRODUCTS) ? window.COSMOSKIN_PRODUCTS : [];
  }

  function bySlug(slug) {
    slug = String(slug || '').trim();
    if (!slug) return null;
    var helpers = window.COSMOSKIN_PRODUCT_HELPERS || {};
    if (typeof helpers.getProductBySlug === 'function') return helpers.getProductBySlug(slug);
    return products().find(function (p) { return p && (p.slug === slug || p.id === slug); }) || null;
  }

  function normalizeLine(item) {
    if (!item || typeof item !== 'object') return null;
    var slug = String(item.slug || item.id || item.product_slug || '').trim();
    if (!slug) return null;
    var product = bySlug(slug);
    var qty = Math.max(1, Number(item.qty || item.quantity || 1) || 1);
    var price = Number(product && product.price != null ? product.price : (item.price || item.unit_price || 0));
    return {
      slug: slug,
      id: slug,
      name: item.name || (product && product.name) || 'Ürün',
      brand: item.brand || (product && product.brand) || '',
      image: item.image || (product && product.image) || '',
      url: item.url || (product && product.url) || ('/products/' + slug + '.html'),
      qty: qty,
      quantity: qty,
      price: Number.isFinite(price) ? price : 0
    };
  }

  function readCouponState() {
    if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.readState === 'function') {
      return window.COSMOSKIN_COUPON.readState();
    }
    try {
      var stored = JSON.parse(localStorage.getItem(COUPON_KEY) || 'null');
      return stored && stored.ok ? stored : null;
    } catch (_) {
      return null;
    }
  }

  function couponDiscountAmount(subtotal, couponState) {
    var state = couponState || readCouponState();
    if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.previewDiscount === 'function') {
      return window.COSMOSKIN_COUPON.previewDiscount(state, subtotal);
    }
    if (!state || Number(subtotal || 0) < Number(state.minSubtotal || state.min_subtotal || 0)) return 0;
    return Math.max(0, Math.min(Number(subtotal || 0), Math.round(Number(state.discountAmount || state.discount_amount || 0))));
  }

  function isOutOfStock(slug) {
    try {
      var inv = window.COSMOSKIN_STOCK && window.COSMOSKIN_STOCK.getInventory && window.COSMOSKIN_STOCK.getInventory(slug);
      if (!inv) return false;
      if (inv._missing || inv.status === 'missing') return false;
      if (inv.status !== 'active') return true;
      if (!inv.allow_backorder && Number(inv.available_stock || 0) <= 0) return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  function subtotalForItems(items) {
    return (items || []).reduce(function (sum, raw) {
      var line = normalizeLine(raw);
      if (!line) return sum;
      return sum + line.price * line.qty;
    }, 0);
  }

  function computeTotals(options) {
    options = options || {};
    var items = (options.items || []).map(normalizeLine).filter(Boolean);
    var subtotal = subtotalForItems(items);
    var routineDiscount = Math.max(0, Number(options.routineDiscount || 0));
    var couponDiscount = Math.max(0, Number(options.couponDiscount != null
      ? options.couponDiscount
      : couponDiscountAmount(subtotal, options.couponState)));
    var totalDiscount = Math.min(subtotal, routineDiscount + couponDiscount);
    var discountedSubtotal = Math.max(0, subtotal - totalDiscount);
    var freeShipping = Boolean(options.freeShipping || (options.couponState && (options.couponState.freeShipping || options.couponState.free_shipping)));
    var shipping = 0;
    if (discountedSubtotal > 0 && !freeShipping) {
      shipping = discountedSubtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
    }
    var vat = discountedSubtotal - (discountedSubtotal / (1 + VAT_RATE));
    var freeShippingRemaining = discountedSubtotal >= FREE_SHIPPING ? 0 : Math.max(0, FREE_SHIPPING - discountedSubtotal);
    return {
      items: items,
      subtotal: subtotal,
      routineDiscount: routineDiscount,
      couponDiscount: couponDiscount,
      discount: totalDiscount,
      discountedSubtotal: discountedSubtotal,
      shipping: shipping,
      vat: vat,
      total: Math.max(0, discountedSubtotal + shipping),
      freeShipping: freeShipping,
      freeShippingRemaining: freeShippingRemaining,
      coupon: options.couponState || readCouponState()
    };
  }

  function keywordScore(product, baseProducts) {
    var score = 0;
    var kws = (product.keywords || []).map(function (k) { return String(k).toLowerCase(); });
    (baseProducts || []).forEach(function (bp) {
      (bp.keywords || []).forEach(function (k) {
        if (kws.indexOf(String(k).toLowerCase()) !== -1) score += 1;
      });
      if (bp.brand === product.brand) score += 1.2;
    });
    return score;
  }

  function recommendationCandidates(cartItemsInput, options) {
    options = options || {};
    var cart = (cartItemsInput || []).map(normalizeLine).filter(Boolean);
    var used = new Set(cart.map(function (i) { return i.slug; }));
    var base = cart.map(function (i) { return bySlug(i.slug); }).filter(Boolean);
    if (!base.length) return [];
    var wanted = [];
    base.forEach(function (p) {
      (COMPLEMENTS[p.category] || []).forEach(function (c) {
        if (wanted.indexOf(c) === -1) wanted.push(c);
      });
    });
    var categoryRank = new Map();
    wanted.forEach(function (c, i) { categoryRank.set(c, i); });
    return products().filter(function (p) {
      if (!p || !p.slug || used.has(p.slug)) return false;
      if (options.excludeOutOfStock !== false && isOutOfStock(p.slug)) return false;
      return true;
    }).sort(function (a, b) {
      var ar = categoryRank.has(a.category) ? categoryRank.get(a.category) : 99;
      var br = categoryRank.has(b.category) ? categoryRank.get(b.category) : 99;
      if (ar !== br) return ar - br;
      return keywordScore(b, base) - keywordScore(a, base);
    }).slice(0, options.limit || 12);
  }

  async function validateCoupon(options) {
    options = options || {};
    var code = String(options.code || '').trim().toUpperCase();
    var cartItemsList = options.cartItems || [];
    if (!code) {
      if (window.COSMOSKIN_COUPON && window.COSMOSKIN_COUPON.clearState) window.COSMOSKIN_COUPON.clearState();
      return { ok: false, empty: true, message: 'Kupon kaldırıldı.' };
    }
    if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.validate === 'function') {
      return window.COSMOSKIN_COUPON.validate({
        code: code,
        cartItems: cartItemsList,
        shippingMethod: options.shippingMethod || 'standard',
        accessToken: options.accessToken
      });
    }
    return { ok: false, message: 'Kupon doğrulanamadı.' };
  }

  window.COSMOSKIN_CART_COMMERCE = {
    COUPON_KEY: COUPON_KEY,
    FREE_SHIPPING: FREE_SHIPPING,
    SHIPPING_FEE: SHIPPING_FEE,
    VAT_RATE: VAT_RATE,
    normalizeLine: normalizeLine,
    readCouponState: readCouponState,
    couponDiscountAmount: couponDiscountAmount,
    subtotalForItems: subtotalForItems,
    computeTotals: computeTotals,
    recommendationCandidates: recommendationCandidates,
    validateCoupon: validateCoupon,
    isOutOfStock: isOutOfStock
  };
})();
