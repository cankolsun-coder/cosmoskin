(function () {
  'use strict';

  var STORAGE_KEY = 'cosmoskin_coupon_state_v1';
  var LEGACY_KEY = 'cosmoskin_coupon_code';

  function apiBase() {
    return (window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.apiBase) || '/api';
  }

  function normalizeCode(value) {
    return String(value || '').trim().toUpperCase();
  }

  function normalizeCartLine(item) {
    if (!item || typeof item !== 'object') return null;
    var slug = String(item.slug || item.id || item.product_slug || item.product_id || '').trim();
    var quantity = Math.max(1, Number(item.qty || item.quantity || 1) || 1);
    if (!slug) return null;
    return {
      slug: slug,
      product_slug: slug,
      quantity: quantity,
      qty: quantity,
      price: Number(item.price || item.unit_price || 0) || 0
    };
  }

  function readRawState() {
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return stored && typeof stored === 'object' ? stored : null;
    } catch (_) {
      return null;
    }
  }

  function readCode() {
    var stored = readRawState();
    return stored && stored.ok && stored.code ? normalizeCode(stored.code) : '';
  }

  function readState() {
    var stored = readRawState();
    if (!stored || !stored.ok || !stored.code) return null;
    return stored;
  }

  function clearState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    try { localStorage.removeItem(LEGACY_KEY); } catch (_) {}
    try { localStorage.removeItem('cosmoskin_checkout_coupon'); } catch (_) {}
  }

  function persistState(apiData, code) {
    var normalizedCode = normalizeCode((apiData && apiData.code) || code);
    if (!normalizedCode) return null;
    var discountAmount = Number(apiData.discount_amount || apiData.discountAmount || apiData.discount || 0);
    var payload = {
      ok: true,
      code: normalizedCode,
      discountAmount: discountAmount,
      discount_amount: discountAmount,
      discountType: apiData.discount_type || apiData.type || '',
      discount_type: apiData.discount_type || apiData.type || '',
      freeShipping: Boolean(apiData.free_shipping || apiData.freeShipping),
      free_shipping: Boolean(apiData.free_shipping || apiData.freeShipping),
      minSubtotal: Number(apiData.min_subtotal || apiData.minSubtotal || 0),
      min_subtotal: Number(apiData.min_subtotal || apiData.minSubtotal || 0),
      maxDiscount: Number(apiData.max_discount_amount || apiData.maxDiscount || 0) || null,
      max_discount_amount: Number(apiData.max_discount_amount || apiData.maxDiscount || 0) || null,
      label: apiData.message || (apiData.coupon && apiData.coupon.title) || '',
      message: apiData.message || '',
      eligibilityHash: apiData.eligibility_hash || '',
      expiresAt: apiData.expires_at || '',
      validatedAt: new Date().toISOString(),
      source: 'backend'
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      localStorage.setItem(LEGACY_KEY, normalizedCode);
    } catch (_) {}
    return payload;
  }

  function previewDiscount(state, subtotal) {
    if (!state || !state.ok || !state.code) return 0;
    var safeSubtotal = Math.max(0, Number(subtotal || 0));
    var min = Number(state.minSubtotal || state.min_subtotal || 0);
    if (safeSubtotal < min) return 0;
    var amount = Number(state.discountAmount != null ? state.discountAmount : state.discount_amount || 0);
    return Math.max(0, Math.min(safeSubtotal, Math.round(amount)));
  }

  async function resolveAccessToken(explicitToken) {
    if (explicitToken) return explicitToken;
    try {
      if (!window.cosmoskinSupabase || !window.cosmoskinSupabase.auth) return null;
      var result = await window.cosmoskinSupabase.auth.getSession();
      return result && result.data && result.data.session && result.data.session.access_token;
    } catch (_) {
      return null;
    }
  }

  function buildValidatePayload(options) {
    options = options || {};
    var cartItems = (options.cartItems || []).map(normalizeCartLine).filter(Boolean);
    var payload = {
      code: normalizeCode(options.code),
      cart: cartItems,
      shipping_method: options.shippingMethod || 'standard'
    };
    if (options.accessToken) payload.accessToken = options.accessToken;
    return payload;
  }

  async function validate(options) {
    options = options || {};
    var code = normalizeCode(options.code);
    if (!code) {
      clearState();
      return { ok: false, empty: true, message: 'Kupon kaldırıldı.' };
    }
    var token = await resolveAccessToken(options.accessToken);
    var payload = buildValidatePayload({
      code: code,
      cartItems: options.cartItems || [],
      shippingMethod: options.shippingMethod || 'standard',
      accessToken: token || undefined
    });
    try {
      var res = await fetch(apiBase() + '/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.ok === false) {
        if (data.clearStorage) clearState();
        return {
          ok: false,
          code: code,
          message: data.error || data.message || 'Kupon kodu geçerli değil.',
          reasonCode: data.reasonCode || data.code || ''
        };
      }
      var stored = persistState(data, code);
      return Object.assign({ ok: true }, stored || {}, data);
    } catch (_) {
      return { ok: false, code: code, message: 'Kupon doğrulanamadı. Lütfen tekrar deneyin.' };
    }
  }

  window.COSMOSKIN_COUPON = {
    STORAGE_KEY: STORAGE_KEY,
    readCode: readCode,
    readState: readState,
    clearState: clearState,
    persistState: persistState,
    previewDiscount: previewDiscount,
    buildValidatePayload: buildValidatePayload,
    validate: validate,
    resolveAccessToken: resolveAccessToken
  };
})();
