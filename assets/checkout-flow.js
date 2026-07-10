(function ensureCosmoskinCouponClient() {
  if (window.COSMOSKIN_COUPON) return;
  document.write('<script src="/assets/coupon-client.js?v=20260708-c2"><\/script>');
}());

(function () {
  'use strict';

  var STORAGE_KEY = 'cosmoskin_checkout_state_v2';
  var ORDER_KEY = 'cosmoskin_checkout_last_order_v1';
  var CART_KEYS = ['cosmoskin_cart', 'cosmoskinCart', 'COSMOSKIN_CART', 'cart', 'cartItems', 'shoppingCart'];
  var STEPS = ['delivery', 'payment', 'review', 'success'];
  var STEP_LABELS = {
    delivery: 'Teslimat',
    payment: 'Ödeme',
    review: 'Kontrol',
    success: 'Tamamlandı'
  };
  var STEP_SUBTITLES = {
    delivery: 'Adres & fatura',
    payment: 'Yöntem & onay',
    review: 'Son kontrol',
    success: 'Sipariş sonucu'
  };
  var cfg = window.COSMOSKIN_CONFIG || {};
  var CARD_PAYMENTS_ENABLED = cfg.cardPaymentsEnabled === true || cfg.iyzicoConfigured === true;
  var FREE_SHIPPING = Number(cfg.freeShippingThreshold || 2500);
  var STANDARD_SHIPPING = Number(cfg.shippingFee || 89);
  var EXPRESS_FEE = 49.90;
  var state = loadState();
  var cart = { key: CART_KEYS[0], data: [], items: [], found: false };
  var inventoryWarning = '';
  var stockBlocked = false;
  var stockBlockDetails = [];
  var stockValidationInFlight = false;
  var submitLocked = false;
  var currentUser = null;
  var savedAddresses = [];
  var accountSyncInFlight = false;
  var addressSyncLoaded = false;
  var bankAccountSyncInFlight = false;
  var bankAccountSyncLoaded = false;
  var liveBankAccount = null;
  var liveBankAccounts = [];
  var liveBankAccountError = '';
  var couponRevalidationInFlight = false;


  function newIdempotencyKey() {
    try { if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID(); } catch (_) {}
    return 'cs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $all(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function money(value) {
    var amount = Number(value || 0);
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: amount % 1 ? 2 : 0,
      maximumFractionDigits: amount % 1 ? 2 : 0
    }).format(amount);
  }
  function checkoutItemPriceHtml(item) {
    var helpers = window.COSMOSKIN_PRODUCT_HELPERS;
    var catalog = helpers && typeof helpers.getProductBySlug === 'function'
      ? helpers.getProductBySlug(item.slug || item.id)
      : null;
    var lineTotal = item.line_total || (item.price * item.qty);
    var PD = window.COSMOSKIN_PRICE_DISPLAY;
    if (PD && catalog && typeof PD.shouldShowSalePrice === 'function' && PD.shouldShowSalePrice(catalog)) {
      return '<div class="cs-checkout-price cs-price cs-price--compact cs-price--sale"><span class="cs-price__current">' + money(lineTotal) + '</span><span class="cs-price__note">İndirimli fiyat</span></div>';
    }
    return '<b>' + money(lineTotal) + '</b>';
  }
  function num(value) {
    if (typeof value === 'number') return value;
    return Number(String(value || '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
  }
  function normalizedOrderItem(item) {
    item = item || {};
    var slug = item.product_slug || item.slug || item.product_id || item.id || '';
    var qty = Number(item.quantity || item.qty || 1) || 1;
    var price = num(item.unit_price != null ? item.unit_price : item.price);
    var line = num(item.line_total != null ? item.line_total : (price * qty));
    return {
      id: slug || item.id || item.product_id || 'order-item',
      slug: slug,
      url: item.url || (slug ? '/products/' + slug + '.html' : '/allproducts.html'),
      image: item.image || item.product_image || item.image_url || '/assets/img/brand/cosmoskin-wordmark.svg',
      brand: item.brand || 'COSMOSKIN',
      name: item.product_name || item.name || 'COSMOSKIN Ürünü',
      size: item.size || 'KDV dahil',
      qty: qty,
      quantity: qty,
      price: price,
      unit_price: price,
      line_total: line || (price * qty)
    };
  }
  function normalizedOrderItems(order) {
    order = order || {};
    var source = Array.isArray(order.items) ? order.items : (Array.isArray(order.order_items) ? order.order_items : []);
    return source.map(normalizedOrderItem);
  }
  function normalizedOrderTotals(order) {
    order = order || {};
    var raw = order.totals || {};
    var subtotal = num(raw.subtotal != null ? raw.subtotal : raw.subtotal_amount);
    var discount = num(raw.discount != null ? raw.discount : raw.discount_amount);
    var shipping = num(raw.shipping != null ? raw.shipping : raw.shipping_amount);
    var vat = num(raw.vat != null ? raw.vat : raw.vat_amount);
    var total = num(raw.total != null ? raw.total : raw.total_amount);
    if (!subtotal) subtotal = normalizedOrderItems(order).reduce(function (sum, item) { return sum + num(item.line_total); }, 0);
    if (!total) total = Math.max(0, subtotal - discount) + shipping;
    if (!vat) vat = Math.round((subtotal * 20 / 120) * 100) / 100;
    return { subtotal: subtotal, discount: discount, shipping: shipping, vat: vat, total: total };
  }
  function formatOrderDeadline(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value)); } catch (_) { return String(value); }
  }
  function digits(value) { return String(value || '').replace(/\D/g, ''); }
  function validTurkishIdentity(value) {
    var d = digits(value);
    if (!/^\d{11}$/.test(d) || d.charAt(0) === '0') return false;
    var n = d.split('').map(Number);
    var odd = n[0] + n[2] + n[4] + n[6] + n[8];
    var even = n[1] + n[3] + n[5] + n[7];
    return n[9] === ((odd * 7 - even) % 10) && n[10] === (n.slice(0, 10).reduce(function (sum, item) { return sum + item; }, 0) % 10);
  }
  function slugFrom(value) {
    return String(value || '')
      .trim()
      .replace(/^.*\/products\//, '')
      .replace(/\.html.*$/, '')
      .toLowerCase();
  }
  function readJSON(key, fallback) {
    try {
      var raw = sessionStorage.getItem(key);
      if (raw == null) raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }
  function writeSession(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function dispatchCheckoutEvent(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (_) {}
  }
  function scheduleCheckoutRender(delay) {
    window.setTimeout(function () { render({ skipAuth: true }); }, delay || 0);
  }
  function normalizeUserMeta(user) {
    var meta = (user && user.user_metadata) || {};
    var fullName = meta.full_name || meta.name || '';
    var parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    var firstName = meta.first_name || meta.firstName || meta.given_name || parts.shift() || '';
    var lastName = meta.last_name || meta.lastName || meta.family_name || parts.join(' ') || '';
    return {
      email: user && user.email || meta.email || '',
      firstName: String(firstName || '').trim(),
      lastName: String(lastName || '').trim()
    };
  }
  function normalizeAddress(address, index) {
    address = address || {};
    var firstName = address.recipient_first_name || address.first_name || address.firstName || '';
    var lastName = address.recipient_last_name || address.last_name || address.lastName || '';
    var full = address.name || address.full_name || [firstName, lastName].filter(Boolean).join(' ');
    var split = String(full || '').trim().split(/\s+/).filter(Boolean);
    if (!firstName && split.length) firstName = split.shift();
    if (!lastName && split.length) lastName = split.join(' ');
    return {
      id: String(address.id || address.__key || 'address-' + index),
      title: address.title || address.label || (address.is_default || address.isDefault ? 'Varsayılan Adres' : 'Adresim'),
      firstName: String(firstName || '').trim(),
      lastName: String(lastName || '').trim(),
      phone: String(address.phone || address.phone_number || '').trim(),
      address: String(address.address_line || address.address || address.line || address.addressLine || '').trim(),
      city: String(address.city || '').trim(),
      district: String(address.district || '').trim(),
      postalCode: String(address.postal_code || address.postalCode || address.postal || '').trim(),
      type: address.address_type || address.type || 'shipping',
      isDefault: Boolean(address.is_default || address.isDefault || address.default)
    };
  }
  function addressHasContent(address) {
    return Boolean(address && (address.address || address.city || address.district || address.phone || address.firstName || address.lastName));
  }
  function applyUserToState(user, overwrite) {
    if (!user) return false;
    var meta = normalizeUserMeta(user);
    var changed = false;
    state.delivery = state.delivery || { country: 'Türkiye' };
    [['email', meta.email], ['firstName', meta.firstName], ['lastName', meta.lastName]].forEach(function (pair) {
      var key = pair[0];
      var value = pair[1];
      if (!value) return;
      if (overwrite || !String(state.delivery[key] || '').trim()) {
        if (state.delivery[key] !== value) { state.delivery[key] = value; changed = true; }
      }
    });
    return changed;
  }
  function applyAddressToState(address, overwrite) {
    var addr = normalizeAddress(address || {}, 0);
    if (!addressHasContent(addr)) return false;
    var changed = false;
    var type = String(addr.type || '').toLowerCase();
    var isBillingOnly = ['billing', 'invoice', 'fatura'].indexOf(type) !== -1;
    var canFillDelivery = !isBillingOnly;
    var canFillBilling = isBillingOnly || ['both', 'delivery_billing', 'teslimat_fatura', 'teslimat + fatura'].indexOf(type) !== -1;
    state.delivery = state.delivery || { country: 'Türkiye' };
    state.invoice = state.invoice || { type: 'individual', sameAsDelivery: true };
    var mapping = {
      firstName: addr.firstName,
      lastName: addr.lastName,
      phone: addr.phone,
      address: addr.address,
      city: addr.city,
      district: addr.district,
      postalCode: addr.postalCode,
      country: 'Türkiye'
    };
    if (canFillDelivery) {
      Object.keys(mapping).forEach(function (key) {
        var value = mapping[key];
        if (!value) return;
        if (overwrite || !String(state.delivery[key] || '').trim()) {
          if (state.delivery[key] !== value) { state.delivery[key] = value; changed = true; }
        }
      });
    }
    if (canFillBilling && !state.invoice.sameAsDelivery) {
      var invoiceMapping = {
        name: [addr.firstName, addr.lastName].filter(Boolean).join(' '),
        phone: addr.phone,
        address: addr.address,
        city: addr.city,
        district: addr.district,
        postalCode: addr.postalCode
      };
      Object.keys(invoiceMapping).forEach(function (key) {
        var value = invoiceMapping[key];
        if (!value) return;
        if (overwrite || !String(state.invoice[key] || '').trim()) {
          if (state.invoice[key] !== value) { state.invoice[key] = value; changed = true; }
        }
      });
    }
    if (state.invoice && state.invoice.sameAsDelivery) syncSameInvoice();
    return changed;
  }
  function setLiveFieldValue(name, value, overwrite) {
    var input = field(name);
    if (!input) return;
    var safe = String(value || '').trim();
    if (!safe) return;
    if (overwrite || !String(input.value || '').trim()) {
      input.value = safe;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function applyLiveCheckoutValues(overwrite) {
    var d = state.delivery || {};
    Object.keys(d).forEach(function (key) { setLiveFieldValue(key, d[key], overwrite); });
  }
  function updateAuthGate(user) {
    var gate = byId('csCheckoutAuthGate');
    var summary = byId('csCheckoutAccountSummary');
    if (gate) {
      gate.hidden = Boolean(user);
      gate.classList.toggle('is-hidden', Boolean(user));
      gate.setAttribute('aria-hidden', user ? 'true' : 'false');
    }
    if (summary) {
      if (user) {
        var meta = normalizeUserMeta(user);
        summary.hidden = false;
        summary.innerHTML = '<strong>' + esc([meta.firstName, meta.lastName].filter(Boolean).join(' ') || 'COSMOSKIN hesabın') + '</strong><span>' + esc(meta.email || 'Hesabınla devam ediyorsun') + '</span>';
      } else {
        summary.hidden = true;
        summary.innerHTML = '';
      }
    }
  }
  function authHeaders(token) {
    return token ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }
  async function fetchAccountAddresses(token) {
    if (!token) return [];
    var res = await fetch(((cfg && cfg.apiBase) || '/api') + '/account/addresses', { headers: authHeaders(token) });
    if (!res.ok) throw new Error('Adresler alınamadı.');
    var data = await res.json().catch(function () { return {}; });
    return (Array.isArray(data.addresses) ? data.addresses : []).map(normalizeAddress).filter(addressHasContent);
  }
  async function fetchBankAccountConfig(options) {
    options = options || {};
    if (bankAccountSyncInFlight) return liveBankAccount;
    if (bankAccountSyncLoaded && !options.force) return liveBankAccount;
    bankAccountSyncInFlight = true;
    liveBankAccountError = '';
    try {
      var res = await fetch(((cfg && cfg.apiBase) || '/api') + '/payment/bank-accounts', { cache: 'no-store' });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Havale/EFT bilgileri doğrulanamadı.');
      var accounts = Array.isArray(data.accounts) ? data.accounts : (data.account ? [data.account] : []);
      liveBankAccounts = accounts.filter(Boolean);
      var account = liveBankAccounts[0] || null;
      liveBankAccount = account && data.configured !== false ? account : null;
      if (!liveBankAccount) liveBankAccountError = data.message || 'Havale/EFT ödeme bilgileri henüz kullanıma hazır değil.';
      bankAccountSyncLoaded = true;
    } catch (error) {
      liveBankAccount = null;
      liveBankAccounts = [];
      liveBankAccountError = error.message || 'Havale/EFT bilgileri şu anda doğrulanamıyor.';
      bankAccountSyncLoaded = true;
    } finally {
      bankAccountSyncInFlight = false;
    }
    return liveBankAccount;
  }
  function loadState() {
    var saved = readJSON(STORAGE_KEY, {});
    var loaded = Object.assign({
      step: 'delivery',
      shippingMethod: 'standard',
      paymentMethod: 'bank_transfer',
      delivery: { country: 'Türkiye' },
      invoice: { type: 'individual', sameAsDelivery: true },
      payment: {},
      legal: { preInformation: false, distanceSales: false, privacy: false, sales: false, kvkk: false, marketing: false },
      coupon: { code: '', type: '', discount: 0, freeShipping: false, label: '' },
      idempotencyKey: newIdempotencyKey(),
      order: null
    }, saved || {});
    if (!CARD_PAYMENTS_ENABLED && loaded.paymentMethod === 'card') loaded.paymentMethod = 'bank_transfer';
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(String(loaded.idempotencyKey || ''))) loaded.idempotencyKey = newIdempotencyKey();
    loaded.legal = Object.assign({ preInformation: false, distanceSales: false, privacy: false, sales: false, kvkk: false, marketing: false }, loaded.legal || {});
    if (loaded.legal.sales && !loaded.legal.preInformation && !loaded.legal.distanceSales) {
      loaded.legal.preInformation = true;
      loaded.legal.distanceSales = true;
    }
    if (loaded.legal.kvkk && !loaded.legal.privacy) loaded.legal.privacy = true;
    return loaded;
  }
  function saveState() {
    writeSession(STORAGE_KEY, state);
  }
  function getProducts() {
    var sources = [window.COSMOSKIN_PRODUCTS, window.PRODUCTS, window.products, window.productsData, window.PRODUCTS_DATA];
    for (var i = 0; i < sources.length; i += 1) {
      if (Array.isArray(sources[i])) return sources[i];
      if (sources[i] && Array.isArray(sources[i].products)) return sources[i].products;
    }
    return [];
  }
  function findProduct(raw) {
    var products = getProducts();
    var keys = [raw.id, raw.slug, raw.product_id, raw.productId, raw.handle, raw.sku].filter(Boolean).map(String);
    return products.find(function (product) {
      return [product.id, product.slug, product.product_id, product.productId, product.handle, product.sku]
        .filter(Boolean)
        .map(String)
        .some(function (key) { return keys.indexOf(key) !== -1; });
    }) || null;
  }
  function extractItems(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    return data.items || data.cart || data.products || data.lines || data.data || [];
  }
  function normalizeItem(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    var product = findProduct(raw) || {};
    var slug = slugFrom(raw.slug || raw.id || raw.product_id || raw.productId || product.slug || product.id);
    var qty = Math.max(1, parseInt(raw.qty || raw.quantity || raw.count || raw.adet || 1, 10) || 1);
    var price = num(product.price != null ? product.price : (raw.price || raw.unit_price || raw.unitPrice || raw.sale_price || raw.salePrice));
    var name = raw.name || raw.title || raw.product_name || raw.productName || product.name || product.title || 'COSMOSKIN ürünü';
    var brand = raw.brand || raw.vendor || product.brand || product.vendor || 'COSMOSKIN';
    var image = raw.image || raw.img || raw.image_url || raw.imageUrl || raw.thumbnail || product.image || product.img || '';
    var url = raw.url || product.url || (slug ? '/products/' + slug + '.html' : '/allproducts.html');
    return {
      original: raw,
      index: index,
      id: slug || String(raw.id || product.id || 'item-' + index),
      slug: slug,
      name: name,
      brand: brand,
      qty: qty,
      price: price,
      image: image,
      url: url,
      size: raw.size || raw.variant || raw.ml || product.volume || product.size || ''
    };
  }
  function readCart() {
    if (window.COSMOSKIN_CART_API && typeof window.COSMOSKIN_CART_API.getItems === 'function') {
      var apiItems = window.COSMOSKIN_CART_API.getItems().map(normalizeItem).filter(Boolean);
      if (apiItems.length) return { key: 'COSMOSKIN_CART_API', data: apiItems, items: apiItems, found: true };
    }
    for (var i = 0; i < CART_KEYS.length; i += 1) {
      var key = CART_KEYS[i];
      var raw = localStorage.getItem(key);
      var parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (_) {}
      var items = extractItems(parsed).map(normalizeItem).filter(Boolean);
      if (items.length) return { key: key, data: parsed, items: items, found: true };
      if (raw) return { key: key, data: parsed, items: [], found: true };
    }
    return { key: CART_KEYS[0], data: [], items: [], found: false };
  }
  function totals() {
    var subtotal = cart.items.reduce(function (sum, item) { return sum + (item.price * item.qty); }, 0);
    var discount = Math.max(0, Math.min(subtotal, Number(state.coupon && state.coupon.discount || 0)));
    var discounted = Math.max(0, subtotal - discount);
    var freeShipping = Boolean(state.coupon && state.coupon.freeShipping);
    var shipping = 0;
    if (discounted > 0 && !freeShipping) {
      state.shippingMethod = 'standard';
      shipping = discounted >= FREE_SHIPPING ? 0 : STANDARD_SHIPPING;
    }
    shipping = Math.max(0, shipping);
    var vat = discounted - (discounted / 1.20);
    return { subtotal: subtotal, discount: discount, discounted: discounted, shipping: shipping, vat: vat, total: Math.max(0, discounted + shipping), freeShipping: freeShipping };
  }
  function stepFromUrl() {
    var url = new URL(window.location.href);
    var requested = url.searchParams.get('step');
    return STEPS.indexOf(requested) !== -1 ? requested : null;
  }
  function setStep(step, push) {
    if (STEPS.indexOf(step) === -1) step = 'delivery';
    state.step = step;
    saveState();
    if (push !== false) {
      var url = new URL(window.location.href);
      url.searchParams.set('step', step);
      history.pushState({ step: step }, '', url);
    }
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function setStatus(message, type) {
    var node = byId('csCheckoutStatus');
    if (!node) return;
    node.className = 'cs-checkout-status' + (type ? ' is-' + type : '');
    node.textContent = message || '';
  }
  function field(name) { return $('[name="' + name + '"]'); }
  function collectForm(scope) {
    var data = {};
    $all('input, textarea, select', scope || document).forEach(function (input) {
      if (!input.name) return;
      if (input.type === 'checkbox') data[input.name] = input.checked;
      else data[input.name] = input.value.trim();
    });
    return data;
  }
  function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim()); }
  function validPhone(value) {
    var d = digits(value);
    if (d.indexOf('0090') === 0) d = d.slice(4);
    if (d.indexOf('90') === 0) d = d.slice(2);
    if (d.indexOf('0') === 0) d = d.slice(1);
    return /^5\d{9}$/.test(d);
  }
  function clearErrors() {
    $all('[aria-invalid="true"]').forEach(function (el) { el.setAttribute('aria-invalid', 'false'); });
    $all('.cs-checkout-error').forEach(function (el) { el.textContent = ''; });
  }
  function errorFor(input, message) {
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    var id = input.getAttribute('aria-describedby');
    var err = id && byId(id);
    if (err) err.textContent = message;
  }
  function requireValue(name, message) {
    var input = field(name);
    if (!input || String(input.value || '').trim()) return true;
    errorFor(input, message || 'Bu alan zorunludur.');
    return false;
  }
  function syncSameInvoice() {
    if (!state.invoice.sameAsDelivery) return;
    state.invoice.name = [state.delivery.firstName, state.delivery.lastName].filter(Boolean).join(' ');
    state.invoice.email = state.delivery.email || '';
    state.invoice.phone = state.delivery.phone || '';
    state.invoice.address = state.delivery.address || '';
    state.invoice.city = state.delivery.city || '';
    state.invoice.district = state.delivery.district || '';
    state.invoice.postalCode = state.delivery.postalCode || '';
  }
  function validateDelivery() {
    clearErrors();
    var ok = true;
    var form = byId('csCheckoutDeliveryForm');
    var data = collectForm(form);
    state.delivery = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      country: data.country || 'Türkiye',
      address: data.address,
      city: data.city,
      district: data.district,
      postalCode: data.postalCode,
      deliveryNote: data.deliveryNote || ''
    };
    state.invoice.type = data.invoiceType || state.invoice.type || 'individual';
    state.invoice.sameAsDelivery = Boolean(data.invoiceSame);
    state.invoice.name = data.invoiceName;
    state.invoice.identity = data.invoiceIdentity;
    state.invoice.email = data.invoiceEmail;
    state.invoice.phone = data.invoicePhone;
    state.invoice.address = data.invoiceAddress;
    state.invoice.city = data.invoiceCity;
    state.invoice.district = data.invoiceDistrict;
    state.invoice.postalCode = data.invoicePostalCode;
    state.invoice.company = data.companyTitle;
    state.invoice.taxOffice = data.taxOffice;
    state.invoice.taxNumber = data.taxNumber;
    state.invoice.corporateEmail = data.corporateEmail;
    state.invoice.eInvoice = Boolean(data.eInvoice);

    ['firstName', 'lastName', 'email', 'phone', 'country', 'address', 'city', 'district', 'postalCode'].forEach(function (name) {
      if (!requireValue(name)) ok = false;
    });
    if (field('email') && !validEmail(field('email').value)) { errorFor(field('email'), 'Geçerli bir e-posta adresi girin.'); ok = false; }
    if (field('phone') && !validPhone(field('phone').value)) { errorFor(field('phone'), 'Türkiye formatında bir telefon numarası girin.'); ok = false; }
    if (field('postalCode') && !/^\d{5}$/.test(digits(field('postalCode').value))) { errorFor(field('postalCode'), '5 haneli posta kodu girin.'); ok = false; }

    if (!cart.items.length) {
      setStatus('Sepetiniz boş. Ödeme adımına geçmek için sepetinize ürün ekleyin.', 'error');
      ok = false;
    }

    if (state.invoice.sameAsDelivery) syncSameInvoice();
    if (state.invoice.type === 'corporate') {
      ['companyTitle', 'taxOffice', 'taxNumber', 'corporateEmail'].forEach(function (name) {
        if (!requireValue(name)) ok = false;
      });
      if (field('corporateEmail') && !validEmail(field('corporateEmail').value)) { errorFor(field('corporateEmail'), 'Geçerli bir kurumsal e-posta girin.'); ok = false; }
      if (field('taxNumber') && digits(field('taxNumber').value).length < 10) { errorFor(field('taxNumber'), 'Vergi numarası en az 10 haneli olmalıdır.'); ok = false; }
    } else {
      ['invoiceName', 'invoiceEmail', 'invoicePhone'].forEach(function (name) {
        if (!state.invoice.sameAsDelivery && !requireValue(name)) ok = false;
      });
      if (field('invoiceEmail') && field('invoiceEmail').value && !validEmail(field('invoiceEmail').value)) { errorFor(field('invoiceEmail'), 'Geçerli bir e-posta girin.'); ok = false; }
      if (field('invoicePhone') && field('invoicePhone').value && !validPhone(field('invoicePhone').value)) { errorFor(field('invoicePhone'), 'Türkiye formatında telefon girin.'); ok = false; }
      if (field('invoiceIdentity') && field('invoiceIdentity').value && !validTurkishIdentity(field('invoiceIdentity').value)) { errorFor(field('invoiceIdentity'), 'Geçerli 11 haneli T.C. kimlik numarası girin.'); ok = false; }
    }
    if (!state.invoice.sameAsDelivery) {
      ['invoiceAddress', 'invoiceCity', 'invoiceDistrict', 'invoicePostalCode'].forEach(function (name) {
        if (!requireValue(name)) ok = false;
      });
    }
    saveState();
    if (!ok) setStatus('Lütfen zorunlu alanları kontrol edin.', 'error');
    return ok;
  }
  async function validatePayment() {
    clearErrors();
    var ok = true;
    var form = byId('csCheckoutPaymentForm');
    var data = collectForm(form);
    state.paymentMethod = data.paymentMethod || state.paymentMethod || 'card';
    state.legal.preInformation = Boolean(data.legalPreInformation);
    state.legal.distanceSales = Boolean(data.legalDistanceSales);
    state.legal.privacy = Boolean(data.legalPrivacy);
    state.legal.sales = state.legal.preInformation && state.legal.distanceSales;
    state.legal.kvkk = state.legal.privacy;
    state.legal.marketing = Boolean(data.marketingEmailOptIn);
    if (state.paymentMethod === 'bank_transfer') {
      await fetchBankAccountConfig({ force: true });
      if (!bankConfig().configured) {
        setStatus(liveBankAccountError || 'Havale/EFT ödeme bilgileri hazır olmadığı için sipariş oluşturulamıyor. Lütfen başka bir ödeme yöntemi seçin.', 'error');
        ok = false;
      }
    }
    if (state.paymentMethod === 'card' && state.invoice.type !== 'corporate' && !validTurkishIdentity(state.invoice.identity)) {
      setStatus('Kartlı ödeme ile bireysel fatura için T.C. kimlik numarası zorunludur. Lütfen Fatura Bilgileri adımına dönüp alanı doldurun.', 'error');
      ok = false;
    }
    if (!state.legal.preInformation) { errorFor(field('legalPreInformation'), 'Devam etmek için Ön Bilgilendirme Formu kabul edilmelidir.'); ok = false; }
    if (!state.legal.distanceSales) { errorFor(field('legalDistanceSales'), 'Devam etmek için Mesafeli Satış Sözleşmesi kabul edilmelidir.'); ok = false; }
    if (!state.legal.privacy) { errorFor(field('legalPrivacy'), 'KVKK Aydınlatma Metni bilgilendirmesini işaretleyin.'); ok = false; }
    saveState();
    if (!ok && state.paymentMethod !== 'bank_transfer') setStatus('Lütfen ödeme ve yasal onay alanlarını kontrol edin.', 'error');
    return ok;
  }
  function formatStockGateMessage(gate, fallback) {
    if (gate && gate.message) return gate.message;
    if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.formatCartStockMessage === 'function' && gate && gate.items && gate.items.length) {
      return window.COSMOSKIN_STOCK.formatCartStockMessage(gate.items, cart.items);
    }
    return fallback || 'Sepetinizde stokta olmayan ürünler var.';
  }
  function formatCheckoutApiError(data) {
    data = data || {};
    var code = String(data.code || '');
    var message = data.message || data.error || '';
    if (data.error === 'stock_unavailable' || code === 'stock_unavailable' || code === 'INSUFFICIENT_STOCK') {
      if (Array.isArray(data.items) && data.items.length) {
        return formatStockGateMessage({ items: data.items, message: message }, message || 'Stok yetersiz. Lütfen sepetinizi kontrol edin.');
      }
      return message || 'Stok yetersiz. Lütfen sepetinizi kontrol edin.';
    }
    if (code === 'authentication_required' || code === 'first_order_required' || code === 'INVALID_COUPON' || code === 'coupon_inactive' || code === 'coupon_limit_reached') {
      return message || 'Kupon artık geçerli değil.';
    }
    if (code === 'BANK_ACCOUNT_NOT_CONFIGURED' || code === 'BANK_ACCOUNT_UNAVAILABLE' || code === 'PAYMENT_NOT_CONFIGURED') {
      return message || 'Ödeme yöntemi doğrulanamadı.';
    }
    if (code === 'CONSENT_REQUIRED' || code === 'INVALID_CUSTOMER' || code === 'INVALID_INVOICE' || code === 'IDENTITY_NUMBER_REQUIRED') {
      return message || 'Sipariş oluşturulamadı. Lütfen bilgileri kontrol edin.';
    }
    if (code === 'ORDER_ITEMS_PERSISTENCE_FAILED' || code === 'CHECKOUT_SCHEMA_MISMATCH') {
      return message || 'Sipariş oluşturulamadı. Lütfen bilgileri kontrol edin.';
    }
    if (code === 'CHECKOUT_INTERNAL_ERROR') {
      return message || 'Checkout başlatılamadı. Lütfen kısa süre sonra tekrar deneyin.';
    }
    return message || 'İşlem başlatılamadı.';
  }
  function stockBlockListHtml() {
    if (!stockBlockDetails.length) return '';
    return '<ul class="cs-checkout-stock-block-list">' + stockBlockDetails.map(function (row) {
      var message = window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.formatItemStockMessage === 'function'
        ? window.COSMOSKIN_STOCK.formatItemStockMessage(row, cart.items.find(function (item) { return (item.slug || item.id) === (row.product_slug || row.slug); }))
        : (row.message || row.product_slug || 'Ürün');
      return '<li>' + esc(message) + '</li>';
    }).join('') + '</ul>';
  }
  async function validateStockSoft() {
    inventoryWarning = '';
    stockBlockDetails = [];
    if (!cart.items.length) {
      stockBlocked = true;
      return false;
    }
    var payload = cart.items.map(function (item) {
      return { product_slug: item.slug || item.id, quantity: item.qty };
    });
    try {
      var data = null;
      if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.validateCartPurchasable === 'function') {
        var gate = await window.COSMOSKIN_STOCK.validateCartPurchasable(cart.items);
        if (!gate.ok) {
          stockBlocked = true;
          stockBlockDetails = gate.items || [];
          inventoryWarning = gate.actionMessage || 'Ödemeye geçmeden önce stokta olmayan ürünleri sepetten kaldırın.';
          setStatus(formatStockGateMessage(gate, 'Sepetinizde stokta olmayan ürünler var.'), 'error');
          return false;
        }
        stockBlocked = false;
        return true;
      }
      if (window.COSMOSKIN_STOCK && typeof window.COSMOSKIN_STOCK.checkItems === 'function') {
        data = await window.COSMOSKIN_STOCK.checkItems(payload);
      } else {
        var res = await fetch(((cfg && cfg.apiBase) || '/api') + '/inventory/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payload })
        });
        if (!res.ok) throw new Error('inventory unavailable');
        data = await res.json();
      }
      var blocked = data && ((data.items || []).find(function (item) { return item && item.can_purchase === false; }) || data.can_purchase === false);
      if (blocked) {
        stockBlocked = true;
        stockBlockDetails = (data.items || []).filter(function (item) { return item && item.can_purchase === false; });
        inventoryWarning = 'Ödemeye geçmeden önce stokta olmayan ürünleri sepetten kaldırın.';
        setStatus(formatStockGateMessage({ items: stockBlockDetails, message: blocked.message }, 'Sepetinizde stokta olmayan ürünler var.'), 'error');
        return false;
      }
      stockBlocked = false;
      return true;
    } catch (_) {
      stockBlocked = true;
      stockBlockDetails = [];
      inventoryWarning = 'Ödemeye geçmeden önce stok durumunu doğrulayıp tekrar deneyin.';
      setStatus('Stok bilgisi doğrulanamadı. Lütfen sepeti yenileyin.', 'error');
      return false;
    }
  }
  async function refreshStockGate() {
    if (stockValidationInFlight) return !stockBlocked;
    if (!cart.items.length || state.step === 'success') {
      stockBlocked = false;
      inventoryWarning = '';
      return true;
    }
    stockValidationInFlight = true;
    try {
      return await validateStockSoft();
    } finally {
      stockValidationInFlight = false;
    }
  }
  function normalizeIban(value) { return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
  function validTurkishIban(value) {
    var iban = normalizeIban(value);
    if (!/^TR\d{24}$/.test(iban)) return false;
    var rearranged = iban.slice(4) + iban.slice(0, 4);
    var numeric = '';
    for (var i = 0; i < rearranged.length; i += 1) {
      var ch = rearranged.charAt(i);
      numeric += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    }
    var remainder = 0;
    for (var j = 0; j < numeric.length; j += 1) remainder = (remainder * 10 + Number(numeric.charAt(j))) % 97;
    return remainder === 1;
  }
  function normalizeBankAccountUi(bank) {
    bank = bank || {};
    var accountName = bank.accountName || bank.account_holder || bank.accountHolder || bank.recipient || '';
    var bankName = bank.bankName || bank.bank_name || bank.bank || '';
    var iban = bank.iban || bank.IBAN || '';
    var branch = bank.branch || bank.branch_name || '';
    return { bankName: bankName, accountName: accountName, iban: iban, branch: branch, configured: Boolean(bankName && accountName && iban) };
  }
  function bankAccountsConfig() {
    // E2E payment readiness: Havale/EFT bilgileri yalnızca runtime API kaynağından gelir.
    // Statik window config veya eski hardcoded fallback kullanılmaz; aktif hesap yoksa checkout güvenli şekilde bloklanır.
    var configured = liveBankAccounts && liveBankAccounts.length ? liveBankAccounts : (liveBankAccount ? [liveBankAccount] : []);
    return configured.map(normalizeBankAccountUi).filter(function (bank) { return bank.configured && validTurkishIban(bank.iban); });
  }
  function bankConfig() {
    var accounts = bankAccountsConfig();
    var primary = accounts[0] || normalizeBankAccountUi({});
    primary.accounts = accounts;
    primary.configured = accounts.length > 0;
    return primary;
  }
  function paymentLabel() { return state.paymentMethod === 'bank_transfer' ? 'Havale / EFT' : 'Kredi Kartı'; }
  function shippingInfo() {
    var t = totals();
    state.shippingMethod = 'standard';
    return { title: 'Standart Kargo', estimate: '2-4 iş günü', fee: t.shipping };
  }

  function checkoutBadge(text, tone) {
    return '<span class="cs-checkout-badge ' + (tone ? 'is-' + tone : '') + '">' + esc(text) + '</span>';
  }
  function compactAddress() {
    var bits = [state.delivery.address, [state.delivery.district, state.delivery.city].filter(Boolean).join(' / '), state.delivery.postalCode].filter(Boolean);
    return bits.join(' · ');
  }
  function shippingProgressHtml(t) {
    t = t || totals();
    var remaining = Math.max(0, FREE_SHIPPING - Number(t.discounted || 0));
    var pct = FREE_SHIPPING ? Math.max(0, Math.min(100, Math.round((Number(t.discounted || 0) / FREE_SHIPPING) * 100))) : 0;
    var copy = remaining > 0 ? 'Ücretsiz kargo için ' + money(remaining) + ' kaldı.' : 'Kargo avantajı sepetine uygulandı.';
    return '<div class="cs-checkout-free-shipping"><div class="cs-checkout-free-shipping__bar"><span style="width:' + pct + '%"></span></div><p>' + esc(copy) + '</p></div>';
  }
  function miniTrustRow() {
    return '<div class="cs-checkout-mini-trust"><span>' + icon('lock') + ' Güvenli ödeme</span><span>' + icon('check') + ' KDV dahil fiyat</span><span>' + icon('return') + ' 14 gün cayma hakkı</span></div>';
  }

  function orderNumberFallback() {
    return 'CSM-' + new Date().getFullYear() + '-' + Math.floor(100000 + Math.random() * 899999);
  }
  function customerPayload() {
    syncSameInvoice();
    var invoiceType = state.invoice.type === 'corporate' ? 'Kurumsal' : 'Bireysel';
    return {
      first_name: state.delivery.firstName,
      last_name: state.delivery.lastName,
      email: state.delivery.email,
      phone: state.delivery.phone,
      identity_number: state.paymentMethod === 'card' && state.invoice.type === 'individual' ? (state.invoice.identity || '') : '',
      city: state.delivery.city,
      district: state.delivery.district,
      postal_code: state.delivery.postalCode,
      invoice_type: invoiceType,
      address: state.delivery.address,
      cargo_note: state.delivery.deliveryNote || state.delivery.note || '',
      kvkk_acknowledged: Boolean(state.legal.privacy),
      preliminary_information_accepted: Boolean(state.legal.preInformation),
      distance_sales_accepted: Boolean(state.legal.distanceSales),
      marketing_email_opt_in: Boolean(state.legal.marketing)
    };
  }
  function checkoutPayload() {
    var t = totals();
    return {
      payment_method: state.paymentMethod,
      idempotency_key: state.idempotencyKey,
      cart: cart.items.map(function (item) {
        return { id: item.slug || item.id, slug: item.slug || item.id, product_slug: item.slug || item.id, quantity: item.qty, qty: item.qty };
      }),
      customer: customerPayload(),
      delivery: state.delivery,
      invoice: state.invoice,
      shipping: Object.assign({ method: state.shippingMethod }, shippingInfo()),
      totals: t,
      coupon_code: state.coupon.code || null,
      legal_approved_at: new Date().toISOString(),
      legal: {
        pre_information: Boolean(state.legal.preInformation),
        distance_sales: Boolean(state.legal.distanceSales),
        privacy: Boolean(state.legal.privacy),
        marketing: Boolean(state.legal.marketing),
        pre_information_version: 'legal-20260702',
        distance_sales_version: 'legal-20260702',
        privacy_notice_version: 'legal-20260702',
        accepted_terms_at: new Date().toISOString(),
        accepted_privacy_at: new Date().toISOString(),
        marketing_consent_at: state.legal.marketing ? new Date().toISOString() : null
      }
    };
  }
  async function accessToken() {
    try {
      if (!window.cosmoskinSupabase || !window.cosmoskinSupabase.auth) return null;
      var result = await window.cosmoskinSupabase.auth.getSession();
      return result && result.data && result.data.session && result.data.session.access_token;
    } catch (_) {
      return null;
    }
  }
  function clearCartAfterSuccessfulOrder() {
    try {
      if (cart && cart.key && cart.key !== 'COSMOSKIN_CART_API') localStorage.removeItem(cart.key);
      CART_KEYS.forEach(function (key) { localStorage.removeItem(key); });
      if (window.COSMOSKIN_CART_API && typeof window.COSMOSKIN_CART_API.clear === 'function') window.COSMOSKIN_CART_API.clear();
      dispatchCheckoutEvent('cosmoskin:cart:updated', { source: 'checkout' });
    } catch (_) {}
  }

  async function submitOrder() {
    if (submitLocked) return;
    if (!await refreshStockGate()) {
      render({ skipAuth: true });
      return;
    }
    submitLocked = true;
    renderSummary();
    setStatus(state.paymentMethod === 'bank_transfer' ? 'Sipariş oluşturuluyor...' : 'Ödeme başlatılıyor...', '');
    try {
      if (state.paymentMethod === 'bank_transfer') {
        await fetchBankAccountConfig({ force: true });
        if (!bankConfig().configured) throw new Error(liveBankAccountError || 'Havale/EFT ödeme bilgileri doğrulanamadı. Sipariş oluşturulmadı.');
      }
      var payload = checkoutPayload();
      payload.accessToken = await accessToken();
      var res = await fetch(((cfg && cfg.apiBase) || '/api') + '/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.ok === false) {
        var requestError = new Error(formatCheckoutApiError(data));
        requestError.code = data.code || '';
        requestError.items = data.items || null;
        throw requestError;
      }
      if (state.paymentMethod === 'bank_transfer') {
        var responseItems = Array.isArray(data.items) ? data.items : (Array.isArray(data.order_items) ? data.order_items : cart.items);
        var responseTotals = data.totals || totals();
        state.order = {
          orderId: data.orderId || data.order_id || '',
          orderNumber: data.orderNumber || data.order_number || orderNumberFallback(),
          paymentMethod: 'bank_transfer',
          orderStatus: data.orderStatus || data.order_status || 'pending_bank_transfer',
          paymentStatus: data.paymentStatus || data.payment_status || 'awaiting_transfer',
          email: data.customerEmail || data.customer_email || state.delivery.email,
          items: responseItems.map(normalizedOrderItem),
          totals: normalizedOrderTotals({ totals: responseTotals, items: responseItems }),
          bank: data.bankAccount || data.bank_account || bankConfig(),
          bankAccounts: data.bankAccounts || data.bank_accounts || bankConfig().accounts || [],
          paymentDeadline: data.paymentDeadline || data.payment_deadline || null
        };
        saveState();
        writeSession(ORDER_KEY, state.order);
        clearCartAfterSuccessfulOrder();
        if (data.price_changed || data.repriced) {
          setStatus(data.message || 'Sepetindeki fiyatlar güncellendi. Lütfen toplamı kontrol edip tekrar dene.', 'success');
        } else {
          setStatus('Siparişiniz oluşturuldu. Havale/EFT ödeme bilgileri aşağıda yer alıyor.', 'success');
        }
        setStep('success');
        return;
      }
      if (data.price_changed || data.repriced) {
        setStatus(data.message || 'Sepetindeki fiyatlar güncellendi. Lütfen toplamı kontrol edip tekrar dene.', '');
      }
      if (data.paymentPageUrl) {
        window.location.href = data.paymentPageUrl;
        return;
      }
      if (data.checkoutFormContent) {
        mountIyzicoForm(data.checkoutFormContent);
        setStatus('Güvenli ödeme formu hazırlandı. Ödemenizi iyzico ekranından tamamlayabilirsiniz.', 'success');
        return;
      }
      throw new Error('Ödeme sağlayıcı yönlendirmesi alınamadı.');
    } catch (error) {
      if (['CHECKOUT_ATTEMPT_CLOSED', 'PAYMENT_INITIALIZE_FAILED', 'IDEMPOTENCY_CONFLICT'].indexOf(error.code) !== -1) {
        state.idempotencyKey = newIdempotencyKey();
        saveState();
      }
      if (error.items && error.items.length) {
        stockBlockDetails = error.items;
        stockBlocked = true;
      }
      setStatus(state.paymentMethod === 'bank_transfer'
        ? (error.message || 'Havale/EFT siparişiniz oluşturulamadı. Lütfen tekrar deneyin.')
        : (error.message || 'Ödeme başlatılamadı. Lütfen tekrar deneyin.'), 'error');
    } finally {
      submitLocked = false;
      renderSummary();
    }
  }
  function mountIyzicoForm(html) {
    var host = byId('csIyzicoHost');
    if (!host) return false;
    host.innerHTML = html || '';
    $all('script', host).forEach(function (oldScript) {
      var script = document.createElement('script');
      Array.prototype.slice.call(oldScript.attributes || []).forEach(function (attr) { script.setAttribute(attr.name, attr.value); });
      script.text = oldScript.textContent || '';
      oldScript.replaceWith(script);
    });
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  function clearCouponPersistence() {
    if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.clearState === 'function') {
      window.COSMOSKIN_COUPON.clearState();
      return;
    }
    ['cosmoskin_coupon_code', 'cosmoskin_checkout_coupon', 'cosmoskin_coupon_state_v1'].forEach(function (key) {
      try { localStorage.removeItem(key); } catch (_) {}
      try { sessionStorage.removeItem(key); } catch (_) {}
    });
    if (window.COSMOSKIN_UAT_CLEAR_COUPON) {
      try { window.COSMOSKIN_UAT_CLEAR_COUPON(); } catch (_) {}
    }
  }
  function hydrateCouponFromCartStorage() {
    var shared = window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.readState === 'function'
      ? window.COSMOSKIN_COUPON.readState()
      : null;
    var code = shared && shared.code ? String(shared.code).trim().toUpperCase() : '';
    if (!code) return '';
    state.coupon = Object.assign({}, state.coupon || {}, { code: code });
    var input = byId('csCouponInput');
    if (input && !String(input.value || '').trim()) input.value = code;
    return code;
  }
  function applyValidatedCoupon(code, data) {
    var discount = num(data.discountAmount || data.discount_amount || data.discount || 0);
    state.coupon = {
      code: code,
      type: data.discount_type || data.type || data.discountType || '',
      discount: discount,
      freeShipping: Boolean(data.freeShipping || data.free_shipping),
      label: data.discountLabel || data.label || data.message || '',
      minSubtotal: num(data.minSubtotal || data.min_subtotal || data.minimumSubtotal || 0),
      maxDiscount: num(data.maxDiscount || data.max_discount_amount || 0)
    };
    if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.persistState === 'function') {
      window.COSMOSKIN_COUPON.persistState(data, code);
    }
    saveState();
  }
  function resetCouponState(input) {
    state.coupon = { code: '', type: '', discount: 0, freeShipping: false, label: '', minSubtotal: 0 };
    if (input) input.value = '';
    clearCouponPersistence();
    saveState();
  }
  async function applyCoupon(options) {
    options = options || {};
    var input = byId('csCouponInput');
    if (!cart.items.length) {
      resetCouponState(input);
      renderSummary();
      if (!options.silent) setStatus('İndirim kodu uygulamak için önce sepetine ürün eklemelisin.', 'error');
      return;
    }
    var code = input ? input.value.trim().toUpperCase() : String(state.coupon && state.coupon.code || '').trim().toUpperCase();
    if (!code) {
      resetCouponState(input);
      renderSummary();
      if (!options.silent) setStatus('Kupon kodu temizlendi.', '');
      return;
    }
    state.coupon = { code: code, type: '', discount: 0, freeShipping: false, label: '', minSubtotal: 0 };
    try {
      var data = null;
      if (window.COSMOSKIN_COUPON && typeof window.COSMOSKIN_COUPON.validate === 'function') {
        data = await window.COSMOSKIN_COUPON.validate({
          code: code,
          cartItems: cart.items,
          shippingMethod: state.shippingMethod,
          accessToken: await accessToken()
        });
        if (!data.ok) throw new Error(data.message || 'Kupon kodu geçerli değil.');
      } else {
        var res = await fetch(((cfg && cfg.apiBase) || '/api') + '/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code, shipping_method: state.shippingMethod, accessToken: await accessToken(), cart: cart.items.map(function (item) { return { slug: item.slug || item.id, quantity: item.qty || item.quantity || 1, price: item.price || item.unit_price || 0 }; }) })
        });
        data = await res.json().catch(function () { return {}; });
        if (!res.ok || data.ok === false) throw new Error(data.error || data.message || 'Kupon bulunamadı veya aktif değil.');
      }
      applyValidatedCoupon(code, data);
      renderSummary();
      if (!options.silent) setStatus(data.freeShipping || data.free_shipping ? 'Ücretsiz kargo kuponu uygulandı.' : 'Kupon uygulandı.', 'success');
    } catch (error) {
      resetCouponState(input);
      renderSummary();
      if (!options.suppressStatus) {
        setStatus(options.silent ? 'Sepet değiştiği için kupon kaldırıldı: ' + (error.message || 'Kupon artık geçerli değil.') : (error.message || 'Kupon bulunamadı veya aktif değil.'), 'error');
      }
    }
  }
  async function hydrateAndRevalidateCoupon() {
    var code = hydrateCouponFromCartStorage();
    if (!code || !cart.items.length) return;
    await applyCoupon({ silent: true, suppressStatus: true });
  }
  async function revalidateCouponAfterCartChange() {
    if (couponRevalidationInFlight || !state.coupon || !state.coupon.code) return;
    couponRevalidationInFlight = true;
    try { await applyCoupon({ silent: true }); } finally { couponRevalidationInFlight = false; }
  }
  function renderStepper() {
    var current = STEPS.indexOf(state.step);
    var node = byId('csCheckoutStepper');
    if (!node) return;
    if (!cart.items.length && state.step !== 'success') {
      node.innerHTML = '';
      node.setAttribute('hidden', 'hidden');
      node.setAttribute('aria-hidden', 'true');
      return;
    }
    node.removeAttribute('hidden');
    node.setAttribute('aria-hidden', 'false');
    node.innerHTML = STEPS.map(function (step, index) {
      var complete = index < current;
      var active = index === current;
      return '<button class="cs-checkout-step ' + (complete ? 'is-complete ' : '') + (active ? 'is-active' : '') + '" type="button" data-step-nav="' + esc(step) + '" aria-current="' + (active ? 'step' : 'false') + '"><span>' + (complete ? '✓' : index + 1) + '</span><strong>' + esc(STEP_LABELS[step]) + '</strong><small>' + esc(STEP_SUBTITLES[step] || '') + '</small></button>';
    }).join('');
  }
  function input(name, label, value, attrs) {
    attrs = attrs || {};
    var id = 'cs-' + name;
    var err = id + '-error';
    var type = attrs.type || 'text';
    return '<div class="cs-checkout-field ' + (attrs.full ? 'is-full' : '') + '">' +
      '<label for="' + id + '">' + label + '</label>' +
      '<input class="cs-checkout-input" id="' + id + '" name="' + name + '" type="' + type + '" value="' + esc(value || '') + '" ' +
      (attrs.placeholder ? 'placeholder="' + esc(attrs.placeholder) + '" ' : '') +
      (attrs.autocomplete ? 'autocomplete="' + esc(attrs.autocomplete) + '" ' : '') +
      (attrs.inputmode ? 'inputmode="' + esc(attrs.inputmode) + '" ' : '') +
      (attrs.maxlength ? 'maxlength="' + esc(attrs.maxlength) + '" ' : '') +
      'aria-invalid="false" aria-describedby="' + err + '">' +
      '<div class="cs-checkout-error" id="' + err + '"></div></div>';
  }
  function textarea(name, label, value) {
    var id = 'cs-' + name;
    var err = id + '-error';
    return '<div class="cs-checkout-field is-full"><label for="' + id + '">' + label + '</label><textarea class="cs-checkout-textarea" id="' + id + '" name="' + name + '" aria-invalid="false" aria-describedby="' + err + '">' + esc(value || '') + '</textarea><div class="cs-checkout-error" id="' + err + '"></div></div>';
  }
  function savedAddressesHtml() {
    var visible = Boolean(currentUser);
    var content = '';
    if (!visible) {
      content = '<p class="cs-checkout-note">Giriş yaptığında kayıtlı adreslerin burada görünecek.</p>';
    } else if (!addressSyncLoaded) {
      content = '<p class="cs-checkout-note">Kayıtlı adresler kontrol ediliyor...</p>';
    } else if (!savedAddresses.length) {
      content = '<div class="cs-checkout-empty-inline"><strong>Kayıtlı adres bulunamadı.</strong><span>Bu sipariş için aşağıdaki teslimat formunu doldurabilir veya hesabım ekranından adres ekleyebilirsin.</span><a href="/account/profile.html?tab=addresses">Adreslerime Git</a></div>';
    } else {
      content = '<div class="cs-checkout-address-grid">' + savedAddresses.map(function (addr, index) {
        var location = [addr.district, addr.city].filter(Boolean).join(' / ');
        var detail = [addr.address, location, addr.postalCode].filter(Boolean).join(' · ');
        var selected = String(state.delivery.address || '') === String(addr.address || '') && String(state.delivery.city || '') === String(addr.city || '');
        return '<button type="button" class="cs-checkout-address-card ' + (selected ? 'is-selected ' : '') + (addr.isDefault ? 'is-default' : '') + '" data-use-address="' + index + '"><span><strong>' + esc(addr.title || 'Adresim') + '</strong>' + (addr.isDefault ? '<em>Varsayılan</em>' : '') + '</span><small>' + esc([addr.firstName, addr.lastName].filter(Boolean).join(' ') || 'Alıcı bilgisi') + '</small><p>' + esc(detail || 'Adres detayı eksik') + '</p>' + (addr.phone ? '<small>' + esc(addr.phone) + '</small>' : '') + '</button>';
      }).join('') + '</div>';
    }
    return '<section class="cs-checkout-card cs-checkout-saved-addresses" id="csCheckoutSavedAddressSection" ' + (!visible ? 'hidden' : '') + '><div class="cs-checkout-card-head"><div><h2>Kayıtlı Adreslerim</h2><p>Hesabına kayıtlı teslimat adreslerinden birini seçebilirsin.</p></div></div>' + content + '</section>';
  }

  function renderDelivery() {
    var d = state.delivery || {};
    var inv = state.invoice || {};
    var same = inv.sameAsDelivery !== false;
    var individual = inv.type !== 'corporate';
    return '<form id="csCheckoutDeliveryForm" novalidate>' +
      '<section class="cs-checkout-card cs-checkout-card--delivery"><div class="cs-checkout-auth" id="csCheckoutAuthGate"><div><strong>Hesabın varsa teslimat ve fatura bilgilerin otomatik gelir.</strong><span>Misafir ödeme açık; giriş yapmak zorunlu değildir.</span></div><div class="cs-checkout-auth-actions"><button class="cs-checkout-secondary" data-open-auth data-auth-tab="loginPanel" type="button">Giriş Yap</button><button class="cs-checkout-secondary" data-open-auth data-auth-tab="registerPanel" type="button">Kayıt Ol</button></div></div><div class="cs-checkout-account-summary" id="csCheckoutAccountSummary" hidden></div>' +
      '<div class="cs-checkout-card-head"><div><span class="cs-checkout-kicker">Teslimat</span><h2>Teslimat Bilgileri</h2><p>Sipariş ve kargo bildirimleri için alıcı bilgilerini eksiksiz doldurun.</p></div>' + checkoutBadge('Güvenli bilgi girişi', 'secure') + '</div>' +
      '<div class="cs-checkout-form-grid cs-checkout-form-grid--delivery">' +
      input('firstName', 'Ad', d.firstName, { autocomplete: 'given-name', placeholder: 'Adınız' }) +
      input('lastName', 'Soyad', d.lastName, { autocomplete: 'family-name', placeholder: 'Soyadınız' }) +
      input('email', 'E-posta', d.email, { type: 'email', autocomplete: 'email', full: true, placeholder: 'ornek@mail.com' }) +
      input('phone', 'Telefon', d.phone, { autocomplete: 'tel', inputmode: 'tel', placeholder: '5XX XXX XX XX' }) +
      input('country', 'Ülke', d.country || 'Türkiye', { autocomplete: 'country-name' }) +
      textarea('address', 'Açık Adres', d.address) +
      input('city', 'İl', d.city, { autocomplete: 'address-level1', placeholder: 'İstanbul' }) +
      input('district', 'İlçe', d.district, { autocomplete: 'address-level2', placeholder: 'Maltepe' }) +
      input('postalCode', 'Posta Kodu', d.postalCode, { inputmode: 'numeric', maxlength: 5, placeholder: '34840' }) +
      textarea('deliveryNote', 'Kargo Notu (Opsiyonel)', d.deliveryNote || d.note || '') +
      '</div></section>' +
      savedAddressesHtml() +
      '<section class="cs-checkout-card cs-checkout-card--shipping"><div class="cs-checkout-card-head"><div><span class="cs-checkout-kicker">Kargo</span><h2>Kargo Yöntemi</h2><p>Kargo bedeli sepet tutarına göre sipariş özetinde otomatik hesaplanır.</p></div>' + checkoutBadge('DHL teslimat', 'delivery') + '</div>' + shippingOptionsHtml() + '</section>' +
      '<section class="cs-checkout-card cs-checkout-card--invoice"><div class="cs-checkout-card-head"><div><span class="cs-checkout-kicker">Fatura</span><h2>Fatura Bilgileri</h2><p>Faturan sipariş bilgilerindeki e-posta adresine iletilir. Kurumsal fatura için vergi bilgilerini eksiksiz girin.</p></div></div>' +
      '<input type="hidden" name="invoiceType" value="' + (individual ? 'individual' : 'corporate') + '">' +
      '<div class="cs-checkout-segment" role="group" aria-label="Fatura tipi"><button type="button" class="' + (individual ? 'is-active' : '') + '" data-invoice-type="individual">Bireysel</button><button type="button" class="' + (!individual ? 'is-active' : '') + '" data-invoice-type="corporate">Kurumsal</button></div>' +
      '<div class="cs-checkout-inline-note">Kartlı bireysel ödemede T.C. kimlik numarası ödeme sağlayıcı/fatura süreci için gerekebilir. Bu bilgi müşteriye açık şekilde gösterilmez.</div>' +
      '<label class="cs-checkout-checkbox cs-checkout-checkbox--boxed"><input type="checkbox" name="invoiceSame" ' + (same ? 'checked' : '') + '><span>Fatura adresim teslimat adresimle aynı</span></label>' +
      '<div class="cs-checkout-form-grid">' + invoiceFieldsHtml(individual, same) + '</div></section>' +
      '</form>';
  }

  function shippingOptionsHtml() {
    var t = totals();
    state.shippingMethod = 'standard';
    var standard = t.discounted >= FREE_SHIPPING ? 0 : STANDARD_SHIPPING;
    return '<div class="cs-checkout-shipping-wrap">' + shippingProgressHtml(t) + '<div class="cs-checkout-option-grid">' +
      optionHtml('standard', 'Standart Kargo', 'Tahmini teslimat: 2-4 iş günü · DHL teslimat ağı', standard) +
      '</div><p class="cs-checkout-note">Siparişler ödeme onayından sonra hazırlık sürecine alınır. Kargo süreci e-posta ile paylaşılır.</p></div>';
  }
  function optionHtml(value, title, desc, fee) {
    return '<button class="cs-checkout-option ' + (state.shippingMethod === value ? 'is-selected' : '') + '" type="button" data-shipping="' + value + '"><span class="cs-checkout-radio"></span><span><strong>' + title + '</strong><span>' + desc + '</span></span><em>' + (fee ? money(fee) : 'Ücretsiz') + '</em></button>';
  }

  function invoiceFieldsHtml(individual, same) {
    var inv = state.invoice || {};
    var html = '';
    if (individual) {
      html += input('invoiceName', 'Ad Soyad', inv.name, { full: true });
      html += input('invoiceIdentity', 'T.C. Kimlik No (kartlı ödeme için zorunlu)', inv.identity, { inputmode: 'numeric', maxlength: 11 });
      html += input('invoiceEmail', 'E-posta', inv.email, { type: 'email' });
      html += input('invoicePhone', 'Telefon', inv.phone, { inputmode: 'tel', full: !same });
    } else {
      html += input('companyTitle', 'Firma Ünvanı', inv.company, { full: true });
      html += input('taxOffice', 'Vergi Dairesi', inv.taxOffice);
      html += input('taxNumber', 'Vergi Numarası', inv.taxNumber, { inputmode: 'numeric' });
      html += input('corporateEmail', 'Kurumsal E-posta', inv.corporateEmail, { type: 'email' });
      html += input('invoicePhone', 'Telefon', inv.phone, { inputmode: 'tel' });
      html += '<div class="cs-checkout-field is-full"><label class="cs-checkout-checkbox"><input type="checkbox" name="eInvoice" ' + (inv.eInvoice ? 'checked' : '') + '><span>E-Fatura mükellefiyim</span></label></div>';
    }
    if (!same) {
      html += textarea('invoiceAddress', 'Fatura Adresi', inv.address);
      html += input('invoiceCity', 'İl', inv.city);
      html += input('invoiceDistrict', 'İlçe', inv.district);
      html += input('invoicePostalCode', 'Posta Kodu', inv.postalCode, { inputmode: 'numeric', maxlength: 5 });
    }
    return html;
  }
  function renderPayment() {
    var ship = shippingInfo();
    return '<section class="cs-checkout-card cs-checkout-card--payment"><div class="cs-checkout-card-head"><div><span class="cs-checkout-kicker">Ödeme</span><h2>Ödeme Bilgileri</h2><p>Ödeme yönteminizi seçin. Kart bilgileriniz COSMOSKIN tarafından alınmaz veya saklanmaz.</p></div>' + checkoutBadge('KDV dahil toplam', 'secure') + '</div>' +
      '<div class="cs-checkout-review-list cs-checkout-review-list--compact"><div class="cs-checkout-review-card cs-checkout-review-card--summary"><header><h3>Teslimat Adresi</h3><button class="cs-checkout-edit" type="button" data-go-step="delivery">Düzenle</button></header><p><strong>' + esc((state.delivery.firstName || '') + ' ' + (state.delivery.lastName || '')) + '</strong><br>' + esc(compactAddress() || 'Adres bilgisi eksik') + '<br>' + esc(state.delivery.phone || '') + '</p></div>' +
      '<div class="cs-checkout-review-card cs-checkout-review-card--summary"><header><h3>Kargo Yöntemi</h3><button class="cs-checkout-edit" type="button" data-go-step="delivery">Düzenle</button></header><p><strong>' + esc(ship.title) + '</strong><br>Tahmini teslimat: ' + esc(ship.estimate) + '<br>' + (ship.fee ? money(ship.fee) : 'Ücretsiz') + '</p></div></div>' +
      '<form id="csCheckoutPaymentForm" novalidate>' +
      '<div class="cs-checkout-payment-panel"><div class="cs-checkout-method-head"><h3>Ödeme yöntemi seç</h3><p>Kartlı ödeme hazır değilse Havale/EFT ile sipariş oluşturabilirsin.</p></div><div class="cs-checkout-option-grid cs-checkout-option-grid--payments">' +
      paymentOptionHtml('card', 'Kart ile Ödeme', CARD_PAYMENTS_ENABLED ? '3D Secure doğrulamasıyla güvenli ödeme' : 'Kredi kartı ödeme altyapısı yapılandırılıyor. Lütfen Havale/EFT kullanın.', CARD_PAYMENTS_ENABLED ? 'Kredi kartı' : 'Yakında', { disabled: !CARD_PAYMENTS_ENABLED, icon: 'card' }) +
      paymentOptionHtml('bank_transfer', 'Havale / EFT', 'Sipariş oluşturulur, ödeme onayı sonrası hazırlanır', 'Ödeme bekleniyor', { icon: 'bank' }) +
      '</div>' + paymentMethodPanelHtml() + '</div>' +
      '<div class="cs-checkout-legal-panel"><div class="cs-checkout-method-head"><h3>Yasal Onaylar</h3><p>Devam etmek için zorunlu bilgilendirme ve sözleşme onaylarını tamamlayın.</p></div>' +
      '<label class="cs-checkout-checkbox"><input type="checkbox" name="legalPreInformation" ' + (state.legal.preInformation ? 'checked' : '') + ' aria-invalid="false" aria-describedby="cs-legalPreInformation-error"><span><a href="/legal/on-bilgilendirme-formu.html" data-legal-document="on-bilgilendirme-formu" data-legal-version="legal-20260702">Ön Bilgilendirme Formu</a>’nu okudum ve kabul ediyorum.</span></label><div class="cs-checkout-error" id="cs-legalPreInformation-error"></div>' +
      '<label class="cs-checkout-checkbox"><input type="checkbox" name="legalDistanceSales" ' + (state.legal.distanceSales ? 'checked' : '') + ' aria-invalid="false" aria-describedby="cs-legalDistanceSales-error"><span><a href="/legal/mesafeli-satis-sozlesmesi.html" data-legal-document="mesafeli-satis-sozlesmesi" data-legal-version="legal-20260702">Mesafeli Satış Sözleşmesi</a>’ni okudum ve kabul ediyorum.</span></label><div class="cs-checkout-error" id="cs-legalDistanceSales-error"></div>' +
      '<label class="cs-checkout-checkbox"><input type="checkbox" name="legalPrivacy" ' + (state.legal.privacy ? 'checked' : '') + ' aria-invalid="false" aria-describedby="cs-legalPrivacy-error"><span><a href="/legal/kvkk-aydinlatma-metni.html" data-legal-document="kvkk-aydinlatma-metni" data-legal-version="legal-20260702">KVKK Aydınlatma Metni</a> kapsamında kişisel verilerimin işlenmesine ilişkin bilgilendirildim.</span></label><div class="cs-checkout-error" id="cs-legalPrivacy-error"></div>' +
      '<label class="cs-checkout-checkbox"><input type="checkbox" name="marketingEmailOptIn" ' + (state.legal.marketing ? 'checked' : '') + ' aria-invalid="false"><span>COSMOSKIN tarafından kampanya, indirim, ürün önerileri ve bilgilendirme amaçlı ticari elektronik ileti gönderilmesini kabul ediyorum. <a href="/legal/ticari-elektronik-ileti-izni.html" data-legal-document="ticari-elektronik-ileti-izni" data-legal-version="legal-20260702">Detaylar</a>.</span></label></div>' +
      '</form><div id="csIyzicoHost"></div></section>';
  }
  function paymentOptionHtml(value, title, desc, meta, options) {
    options = options || {};
    var disabled = Boolean(options.disabled);
    var iconName = options.icon || (value === 'bank_transfer' ? 'bank' : 'card');
    return '<button class="cs-checkout-payment-option ' + (state.paymentMethod === value ? 'is-selected ' : '') + (disabled ? 'is-disabled' : '') + '" type="button" data-payment-method="' + value + '"' + (disabled ? ' disabled aria-disabled="true"' : '') + '><span class="cs-checkout-payment-icon">' + icon(iconName) + '</span><span><strong>' + title + '</strong><span>' + desc + '</span></span><em>' + meta + '</em></button>';
  }
  function paymentMethodPanelHtml() {
    if (state.paymentMethod === 'bank_transfer') return bankPanelHtml();
    return '<div class="cs-checkout-secure-transition" role="status">' +
      '<span class="cs-checkout-secure-transition__icon">' + icon('lock') + '</span>' +
      '<div><h3>Güvenli kart ödemesi</h3><p>Kart bilgileriniz COSMOSKIN tarafından alınmaz veya saklanmaz. Siparişinizi onayladığınızda ödeme, güvenli ödeme sağlayıcısı üzerinden tamamlanır.</p></div>' +
      '</div><div class="cs-card-icons" role="img" aria-label="Visa, Mastercard, Troy ve iyzico desteklenir"><img src="/assets/img/payments/visa.svg" alt="Visa"><img src="/assets/img/payments/mastercard.svg" alt="Mastercard"><img src="/assets/img/payments/troy.svg" alt="Troy"><img src="/assets/img/payments/iyzico-monochrome.svg" alt="iyzico ile Öde"></div>';
  }
  function bankPanelHtml() {
    var bank = bankConfig();
    var accounts = (bank.accounts || []).filter(function (account) { return account && account.configured && validTurkishIban(account.iban); });
    var accountCards = accounts.map(function (account, index) {
      var lines = [['Banka Adı', account.bankName], ['Alıcı Ünvanı', account.accountName], ['IBAN', account.iban]];
      if (account.branch) lines.push(['Şube', account.branch]);
      return '<article class="cs-checkout-bank-account" data-bank-index="' + index + '"><h4>' + esc(account.bankName) + '</h4>' + lines.map(function (line) { return '<div class="cs-checkout-bank-line"><span>' + esc(line[0]) + '</span><strong>' + esc(line[1]) + '</strong>' + (line[0] === 'IBAN' ? '<button class="cs-checkout-secondary" data-copy-iban data-iban="' + esc(account.iban) + '" aria-label="' + esc(account.bankName + ' IBAN bilgisini kopyala') + '" type="button">Kopyala</button>' : '<i></i>') + '</div>'; }).join('') + '</article>';
    }).join('');
    return '<div class="cs-checkout-bank-panel"><div class="cs-checkout-method-head"><h3>Havale / EFT ile ödeme</h3><p>Sipariş numaranız ödeme açıklamasında yer almalıdır. Onay sonrası hazırlık süreci başlar.</p></div>' +
      (!accounts.length ? '<p class="cs-checkout-status is-error">' + esc(liveBankAccountError || 'Havale/EFT ödeme bilgileri henüz kullanıma hazır değil. Bu yöntemle sipariş oluşturulamaz.') + '</p>' : '<div class="cs-checkout-bank-accounts">' + accountCards + '</div>') +
      '<div class="cs-checkout-bank-notes"><span>Ödeme açıklaması sipariş oluşturulduktan sonra görünür.</span><span>24 saat içinde tamamlanmayan havale siparişleri iptal edilebilir.</span></div></div>';
  }

  function renderReview() {
    var ship = shippingInfo();
    return '<section class="cs-checkout-card"><div class="cs-checkout-card-head"><div><h2>Siparişini Kontrol Et</h2><p>Lütfen sipariş bilgilerini kontrol edin ve onaylayarak devam edin.</p></div></div><div class="cs-checkout-review-list">' +
      reviewCard('Teslimat Bilgileri', 'delivery', [
        ['Ad Soyad', [state.delivery.firstName, state.delivery.lastName].filter(Boolean).join(' ')],
        ['E-posta', state.delivery.email],
        ['Telefon', state.delivery.phone],
        ['Adres', state.delivery.address],
        ['İl / İlçe', (state.delivery.city || '') + ' / ' + (state.delivery.district || '')],
        ['Posta Kodu', state.delivery.postalCode],
        ['Ülke', state.delivery.country || 'Türkiye']
      ]) +
      reviewCard('Kargo Yöntemi', 'delivery', [['Yöntem', ship.title], ['Tahmini teslimat', ship.estimate], ['Kargo', ship.fee ? money(ship.fee) : 'Ücretsiz']]) +
      reviewCard('Fatura Bilgileri', 'delivery', invoiceReviewRows()) +
      reviewCard('Ödeme Yöntemi', 'payment', paymentReviewRows()) +
      reviewCard('Ürünler', 'delivery', cart.items.map(function (item) { return [item.name, item.qty + ' adet · ' + money(item.price * item.qty)]; })) +
      '<div class="cs-checkout-review-card"><header><h3>Yasal Onaylar</h3><button class="cs-checkout-edit" type="button" data-go-step="payment">Düzenle</button></header><p>Ön Bilgilendirme Formu, Mesafeli Satış Sözleşmesi ve KVKK Aydınlatma Metni onaylandı. Ticari elektronik ileti izni yalnızca ayrıca seçildiyse geçerlidir.</p></div>' +
      '</div></section>';
  }
  function reviewCard(title, step, rows) {
    return '<div class="cs-checkout-review-card"><header><h3>' + esc(title) + '</h3><button class="cs-checkout-edit" type="button" data-go-step="' + step + '">Düzenle</button></header><dl>' + rows.map(function (row) { return '<dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1] || '—') + '</dd>'; }).join('') + '</dl></div>';
  }
  function invoiceReviewRows() {
    if (state.invoice.type === 'corporate') {
      return [
        ['Fatura Tipi', 'Kurumsal'],
        ['Firma Ünvanı', state.invoice.company],
        ['Vergi Dairesi', state.invoice.taxOffice],
        ['Vergi Numarası', state.invoice.taxNumber],
        ['E-posta', state.invoice.corporateEmail],
        ['E-Fatura', state.invoice.eInvoice ? 'Evet' : 'Hayır'],
        ['Adres', state.invoice.sameAsDelivery ? 'Teslimat adresiyle aynı' : state.invoice.address],
        ['İl / İlçe', state.invoice.sameAsDelivery ? ((state.delivery.city || '') + ' / ' + (state.delivery.district || '')) : ((state.invoice.city || '') + ' / ' + (state.invoice.district || ''))],
        ['Posta Kodu', state.invoice.sameAsDelivery ? state.delivery.postalCode : state.invoice.postalCode]
      ];
    }
    return [
      ['Fatura Tipi', 'Bireysel'],
      ['Ad Soyad', state.invoice.name],
      ['T.C. Kimlik No', state.paymentMethod === 'card' ? (state.invoice.identity ? 'Ödeme/fatura süreci için alındı; açık şekilde gösterilmez' : 'Kartlı ödeme için zorunlu') : 'Havale/EFT siparişlerinde istenmez'],
      ['E-posta', state.invoice.email],
      ['Telefon', state.invoice.phone],
      ['Adres', state.invoice.sameAsDelivery ? 'Teslimat adresiyle aynı' : state.invoice.address]
    ];
  }
  function paymentReviewRows() {
    if (state.paymentMethod === 'bank_transfer') return [['Ödeme Yöntemi', 'Havale / EFT'], ['Durum', 'Ödeme bekleniyor'], ['Not', 'Açıklama alanına sipariş numarası yazılmalıdır.']];
    return [['Ödeme Yöntemi', 'Kredi Kartı'], ['Ödeme Arayüzü', 'iyzico güvenli ödeme'], ['Güvenlik', '3D Secure']];
  }
  function renderSuccess() {
    var order = state.order || readJSON(ORDER_KEY, null) || {};
    var isBank = order.paymentMethod === 'bank_transfer' || state.paymentMethod === 'bank_transfer';
    var items = normalizedOrderItems(order);
    var t = normalizedOrderTotals(order);
    var bank = order.bank || bankConfig();
    var bankList = (Array.isArray(order.bankAccounts) && order.bankAccounts.length ? order.bankAccounts : (bank.accounts || (bank.configured ? [bank] : [])))
      .map(normalizeBankAccountUi)
      .filter(function (account) { return account.configured && validTurkishIban(account.iban); });
    var orderNo = order.orderNumber || orderNumberFallback();
    var itemHtml = items.length ? items.map(function (item) {
      return '<article class="cs-checkout-success-item"><img src="' + esc(item.image || '/assets/img/brand/cosmoskin-wordmark.svg') + '" alt="' + esc(item.name) + '" loading="lazy"><div><span>' + esc(item.brand) + '</span><strong>' + esc(item.name) + '</strong><small>Adet: ' + esc(item.qty) + ' · Birim fiyat: ' + money(item.price) + '</small></div><b>' + money(item.line_total) + '</b></article>';
    }).join('') : '<p class="cs-checkout-note">Sipariş ürünleri kaydedildi. Detayları Siparişlerim alanından takip edebilirsin.</p>';
    var bankCards = isBank ? (bankList.length ? '<div class="cs-checkout-success-bank-grid">' + bankList.map(function (b, index) {
      var lines = [['IBAN', b.iban], ['Alıcı', b.accountName]];
      if (b.branch) lines.push(['Şube', b.branch]);
      return '<article class="cs-checkout-bank-account cs-checkout-success-bank" data-bank-index="' + index + '"><h4>' + esc(b.bankName) + '</h4>' + lines.map(function (line) { return '<div class="cs-checkout-bank-line"><span>' + esc(line[0]) + '</span><strong>' + esc(line[1]) + '</strong>' + (line[0] === 'IBAN' ? '<button class="cs-checkout-secondary" data-copy-iban data-iban="' + esc(b.iban) + '" aria-label="' + esc(b.bankName + ' IBAN bilgisini kopyala') + '" type="button">Kopyala</button>' : '<i></i>') + '</div>'; }).join('') + '</article>';
    }).join('') + '</div>' : '<p class="cs-checkout-status is-error">Banka bilgileri bu oturumda doğrulanamadı. Ödeme yapmadan önce Siparişlerim ekranındaki güncel bilgileri kontrol edin veya destek@cosmoskin.com.tr ile iletişime geçin.</p>') : '';
    var deadline = formatOrderDeadline(order.paymentDeadline);
    return '<section class="cs-checkout-card cs-checkout-success"><div class="cs-checkout-success-mark">' + icon('check') + '</div><h2>' + (isBank ? 'Siparişiniz Oluşturuldu' : 'Siparişiniz Alındı') + '</h2><p>' + (isBank ? 'Havale/EFT ödemeniz bekleniyor. Ödeme açıklamasına mutlaka sipariş numaranızı yazın: <strong>' + esc(orderNo) + '</strong>' : 'Siparişiniz alındı. Elektronik faturanız hazırlanarak kayıtlı e-posta adresinize gönderilecektir.') + '</p><div class="cs-checkout-success-grid"><div class="cs-checkout-success-row"><span>Sipariş No</span><strong>' + esc(orderNo) + '</strong></div><div class="cs-checkout-success-row"><span>E-posta</span><strong>' + esc(order.email || state.delivery.email || '—') + '</strong></div><div class="cs-checkout-success-row"><span>Ödeme Durumu</span><strong>' + (isBank ? 'Havale/EFT bekleniyor' : 'Ödeme sağlayıcı onayı bekleniyor') + '</strong></div><div class="cs-checkout-success-row"><span>Tahmini Teslimat</span><strong>2-4 iş günü</strong></div></div><div class="cs-checkout-success-products"><h3>Sipariş Özeti</h3>' + itemHtml + '<div class="cs-checkout-success-totals">' + totalRow('Ara Toplam', money(t.subtotal)) + (t.discount ? totalRow('İndirim', '-' + money(t.discount)) : '') + totalRow('Kargo', t.shipping ? money(t.shipping) : 'Ücretsiz') + totalRow('Dahil olan KDV', money(t.vat)) + totalRow('Toplam', money(t.total), true) + '</div></div>' + (isBank ? '<div class="cs-checkout-success-payment"><h3>Havale/EFT Bilgileri</h3><p class="cs-checkout-note">Ödeme açıklaması: <strong>' + esc(orderNo) + '</strong></p>' + bankCards + (deadline ? '<p class="cs-checkout-note"><strong>Ödeme son zamanı:</strong> ' + esc(deadline) + '</p>' : '') + '</div>' : '') + '<div class="cs-checkout-summary-actions"><a class="cs-checkout-primary" href="/account/profile.html?tab=orders">Siparişlerime Git</a><a class="cs-checkout-secondary" href="/order-tracking.html">Siparişi Takip Et</a><a class="cs-checkout-secondary" href="/contact.html">Destek Al</a></div></section>';
  }
  function renderContent() {
    var host = byId('csCheckoutContent');
    if (!host) return;
    if (!cart.items.length && state.step !== 'success') {
      host.innerHTML = '<section class="cs-checkout-empty cs-checkout-empty--commerce"><div class="cs-checkout-empty-mark">' + icon('box') + '</div><h2>Sepetin boş</h2><p class="cs-checkout-note">Checkout’a devam etmek için sepetine ürün eklemelisin. Sana uygun ürünleri keşfedebilir veya favorilerine göz atabilirsin.</p><div class="cs-checkout-summary-actions"><a class="cs-checkout-primary" href="/allproducts.html">Ürünleri Keşfet</a><a class="cs-checkout-secondary" href="/account/profile.html?tab=favorites">Favorilerime Git</a><a class="cs-checkout-secondary" href="/collections/bestsellers.html">Çok Satanları Gör</a></div><p class="cs-checkout-empty-trust">Orijinal ürün · Güvenli ödeme · Kolay iade süreci</p></section>';
      return;
    }
    if (stockBlocked && cart.items.length && state.step !== 'success') {
      host.innerHTML = '<section class="cs-checkout-empty cs-checkout-empty--commerce"><div class="cs-checkout-empty-mark">' + icon('box') + '</div><h2>Stok doğrulaması gerekli</h2><p class="cs-checkout-note">' + esc(formatStockGateMessage({ items: stockBlockDetails, message: inventoryWarning }, 'Sepetinizde stokta olmayan ürünler var. Ödemeye geçmeden önce stokta olmayan ürünleri sepetten kaldırın.')) + '</p>' + stockBlockListHtml() + '<div class="cs-checkout-summary-actions"><a class="cs-checkout-primary" href="/cart.html">Sepete Dön</a><a class="cs-checkout-secondary" href="/allproducts.html">Alışverişe Devam Et</a></div></section>';
      return;
    }
    if (state.step === 'payment') host.innerHTML = renderPayment();
    else if (state.step === 'review') host.innerHTML = renderReview();
    else if (state.step === 'success') host.innerHTML = renderSuccess();
    else host.innerHTML = renderDelivery();
  }
  function renderSummary() {
    var host = byId('csCheckoutSummaryCard');
    var action = byId('csCheckoutAction');
    if (!host) return;
    var successOrder = state.step === 'success' ? (state.order || readJSON(ORDER_KEY, null) || {}) : null;
    var summaryItems = successOrder ? normalizedOrderItems(successOrder) : cart.items.map(normalizedOrderItem);
    var t = successOrder ? normalizedOrderTotals(successOrder) : totals();
    if (!summaryItems.length && state.step !== 'success') {
      host.innerHTML = '<div class="cs-checkout-summary-head"><div><span class="cs-checkout-summary-kicker">Sepet</span><h2>Sipariş Özeti</h2></div><span class="cs-checkout-secure">KDV dahil</span></div><div class="cs-checkout-empty-inline cs-checkout-empty-inline--summary"><strong>Sepetinde ürün bulunmuyor.</strong><span>Ürün eklediğinde ürünler, kargo, KDV ve toplam bilgileri burada görünür.</span></div>';
      if (action) {
        action.textContent = 'Ödeme adımına geçilemez';
        action.disabled = true;
        action.setAttribute('aria-busy', 'false');
      }
      var emptyNote = byId('csCheckoutActionNote');
      if (emptyNote) emptyNote.textContent = 'Ödeme adımına geçmek için sepetine ürün eklemelisin.';
      return;
    }
    host.innerHTML = '<div class="cs-checkout-summary-head"><div><span class="cs-checkout-summary-kicker">Sepet Detayı</span><h2>Sipariş Özeti</h2></div><a class="cs-checkout-summary-edit" href="/cart.html">Sepeti Düzenle</a></div>' +
      '<div class="cs-checkout-summary-items">' + (summaryItems.length ? summaryItems.map(function (item) {
        return '<article class="cs-checkout-item"><a href="' + esc(item.url) + '"><img src="' + esc(item.image || '/assets/img/brand/cosmoskin-wordmark.svg') + '" alt="' + esc(item.name) + '" loading="lazy"></a><div><strong>' + esc(item.brand) + '<br>' + esc(item.name) + '</strong><span>' + esc(item.size || 'KDV dahil') + '</span><span>Adet: ' + item.qty + '</span></div>' + checkoutItemPriceHtml(item) + '</article>';
      }).join('') : '<p class="cs-checkout-note">Sipariş ürünleri kaydedildi.</p>') + '</div>' +
      (state.step === 'success' ? '' : shippingProgressHtml(t)) +
      '<div class="cs-checkout-totals">' +
      totalRow('Ara Toplam', money(t.subtotal)) +
      (t.discount ? totalRow(state.coupon && state.coupon.code ? 'Kupon indirimi' : 'İndirim', '-' + money(t.discount)) : '') +
      totalRow('Kargo', t.shipping ? money(t.shipping) : 'Ücretsiz') +
      totalRow('Dahil olan KDV', money(t.vat)) +
      totalRow('Toplam', money(t.total), true) +
      '</div>' +
      (state.step === 'success' ? '<p class="cs-checkout-note cs-checkout-summary-success-note">Sipariş özeti, sepet temizlendikten sonra oluşturulan sipariş verisinden gösterilir.</p>' : '<div class="cs-checkout-discount"><label class="cs-checkout-label" for="csCouponInput">İndirim Kodu</label><div class="cs-checkout-discount-row"><input class="cs-checkout-input" id="csCouponInput" value="' + esc(state.coupon.code || '') + '" placeholder="Örn. WELCOME10" autocomplete="off"><button class="cs-checkout-secondary" id="csCouponApply" type="button">Uygula</button>' + (state.coupon && state.coupon.code ? '<button class="cs-checkout-coupon-clear" id="csCouponClear" type="button" data-clear-checkout-coupon>Kuponu Kaldır</button>' : '') + '</div>' + (state.coupon && state.coupon.code && t.discount ? '<p class="cs-checkout-coupon-applied"><strong>' + esc(state.coupon.code) + '</strong> uygulandı' + (state.coupon.label ? ' · ' + esc(state.coupon.label) : '') + '.</p>' : '<p class="cs-checkout-coupon-hint">Kuponlar otomatik uygulanmaz; geçerli kodu sepet/checkout adımında manuel girmen gerekir.</p>') + '</div>') + miniTrustRow();
    if (!action) return;
    var label = state.step === 'delivery' ? 'Ödeme Adımına Geç' : state.step === 'payment' ? 'Siparişi Kontrol Et' : state.step === 'review' ? (state.paymentMethod === 'bank_transfer' ? 'Siparişi Oluştur' : 'Siparişi Onayla ve Güvenli Ödemeye Geç') : 'Alışverişe Devam Et';
    action.textContent = submitLocked ? (state.paymentMethod === 'bank_transfer' ? 'Sipariş oluşturuluyor…' : 'Güvenli ödeme hazırlanıyor…') : label;
    action.disabled = submitLocked || stockBlocked || (!summaryItems.length && state.step !== 'success') || (state.paymentMethod === 'bank_transfer' && state.step !== 'delivery' && state.step !== 'success' && !bankConfig().configured);
    action.setAttribute('aria-busy', submitLocked ? 'true' : 'false');
    var note = byId('csCheckoutActionNote');
    if (note) note.textContent = stockBlocked
      ? formatStockGateMessage({ items: stockBlockDetails, message: inventoryWarning }, 'Sepetinizde stokta olmayan ürünler var. Ödemeye geçmeden önce stokta olmayan ürünleri sepetten kaldırın.')
      : state.step === 'success'
      ? 'Siparişin oluşturuldu. Siparişlerim alanından takip edebilirsin.'
      : state.step === 'review' && state.paymentMethod === 'bank_transfer'
        ? 'Havale/EFT siparişleri ödeme bekleniyor durumuyla oluşturulur.'
        : state.step === 'review'
          ? 'Onayladıktan sonra güvenli ödeme sağlayıcısına yönlendirilebilirsiniz.'
          : inventoryWarning || 'Ödeme bilgileriniz güvenli bağlantı üzerinden işlenir.';
  }

  function totalRow(label, value, total) {
    return '<div class="cs-checkout-total-row ' + (total ? 'is-total' : '') + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }
  function icon(name) {
    var paths = {
      lock: '<path d="M7 11V8a5 5 0 0 1 10 0v3M6.5 11h11A1.5 1.5 0 0 1 19 12.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-6A1.5 1.5 0 0 1 6.5 11Z"></path>',
      truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"></path>',
      return: '<path d="M9 7H5v4M5.5 10.5A7 7 0 1 0 12 5"></path><path d="M14.5 10.5 12 13l-2.5-2.5"></path>',
      check: '<path d="m6 12 4 4 8-9"></path>',
      box: '<path d="M4 8 12 4l8 4-8 4-8-4Zm0 0v8l8 4 8-4V8M12 12v8"></path>',
      card: '<rect x="3.5" y="6" width="17" height="12" rx="2"></rect><path d="M3.5 10h17M7 14h3"></path>',
      bank: '<path d="M4 9h16L12 4 4 9Zm2 0v9M10 9v9M14 9v9M18 9v9M4 18h16"></path>'
    };
    return '<svg class="cs-checkout-icon" viewBox="0 0 24 24">' + (paths[name] || paths.check) + '</svg>';
  }
  function renderTrust() {
    var host = byId('csCheckoutTrust');
    if (!host) return;
    host.innerHTML = [
      ['check', 'Orijinal ürün seçkisi'],
      ['truck', 'DHL teslimat süreci'],
      ['return', '14 gün cayma hakkı'],
      ['lock', 'Güvenli ödeme altyapısı']
    ].map(function (item) {
      return '<div class="cs-checkout-trust-item"><span class="cs-checkout-trust-icon">' + icon(item[0]) + '</span><span>' + item[1] + '</span></div>';
    }).join('');
  }

  function render(options) {
    options = options || {};
    cart = readCart();
    document.body.classList.toggle('cs-checkout-cart-empty', !cart.items.length && state.step !== 'success');
    document.body.classList.toggle('cs-checkout-cart-ready', !!cart.items.length || state.step === 'success');
    renderStepper();
    renderContent();
    renderSummary();
    renderTrust();
    updateAuthGate(currentUser);
    if (!options.skipAuth) syncAuthUi();
  }
  function syncStateFromField(target) {
    if (!target || !target.name) return;
    var value = target.type === 'checkbox' ? target.checked : target.value;
    state.delivery = state.delivery || { country: 'Türkiye' };
    state.invoice = state.invoice || { type: 'individual', sameAsDelivery: true };
    state.payment = state.payment || {};
    var deliveryFields = ['firstName', 'lastName', 'email', 'phone', 'country', 'address', 'city', 'district', 'postalCode', 'deliveryNote'];
    if (deliveryFields.indexOf(target.name) !== -1) state.delivery[target.name] = value;
    var invoiceMap = {
      invoiceName: 'name', invoiceIdentity: 'identity', invoiceEmail: 'email', invoicePhone: 'phone', invoiceAddress: 'address', invoiceCity: 'city', invoiceDistrict: 'district', invoicePostalCode: 'postalCode', companyTitle: 'company', taxOffice: 'taxOffice', taxNumber: 'taxNumber', corporateEmail: 'corporateEmail', eInvoice: 'eInvoice'
    };
    if (invoiceMap[target.name]) state.invoice[invoiceMap[target.name]] = value;
    saveState();
  }

  function bind() {
    document.addEventListener('click', async function (event) {
      var openAuth = event.target.closest('[data-open-auth]');
      if (openAuth) {
        event.preventDefault();
        event.stopPropagation();
        dispatchCheckoutEvent('cosmoskin:open-auth-modal', { tab: openAuth.getAttribute('data-auth-tab') || 'loginPanel' });
        return;
      }
      var useAddress = event.target.closest('[data-use-address]');
      if (useAddress) {
        var idx = Number(useAddress.getAttribute('data-use-address'));
        if (savedAddresses[idx]) {
          applyAddressToState(savedAddresses[idx], true);
          saveState();
          render({ skipAuth: true });
          setStatus('Kayıtlı adres teslimat bilgilerine aktarıldı.', 'success');
        }
        return;
      }
      var stepNav = event.target.closest('[data-step-nav]');
      if (stepNav) {
        var step = stepNav.getAttribute('data-step-nav');
        if (STEPS.indexOf(step) <= STEPS.indexOf(state.step)) setStep(step);
        return;
      }
      var goStep = event.target.closest('[data-go-step]');
      if (goStep) {
        setStep(goStep.getAttribute('data-go-step'));
        return;
      }
      var shipping = event.target.closest('[data-shipping]');
      if (shipping) {
        state.shippingMethod = shipping.getAttribute('data-shipping');
        saveState();
        render();
        return;
      }
      var invoiceType = event.target.closest('[data-invoice-type]');
      if (invoiceType) {
        state.invoice.type = invoiceType.getAttribute('data-invoice-type');
        saveState();
        render();
        return;
      }
      var payment = event.target.closest('[data-payment-method]');
      if (payment) {
        if (payment.disabled || payment.getAttribute('aria-disabled') === 'true') {
          setStatus('Kredi kartı ödeme altyapısı şu anda yapılandırılıyor. Lütfen Havale/EFT seçeneğini kullanın.', 'error');
          return;
        }
        state.paymentMethod = payment.getAttribute('data-payment-method');
        saveState();
        if (state.paymentMethod === 'bank_transfer') fetchBankAccountConfig().then(function () { render({ skipAuth: true }); });
        render();
        return;
      }
      if (event.target.closest('#csCouponApply')) {
        await applyCoupon();
        return;
      }
      if (event.target.closest('#csCouponClear')) {
        resetCouponState(byId('csCouponInput'));
        renderSummary();
        setStatus('Kupon kaldırıldı. Ödeme işlemine devam edebilirsin.', 'success');
        return;
      }
      if (event.target.closest('#csCheckoutSummaryToggle')) {
        var summary = byId('csCheckoutSummary');
        if (summary) { var collapsed = summary.classList.toggle('is-collapsed'); var toggle = byId('csCheckoutSummaryToggle'); if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true'); }
        return;
      }
      if (event.target.closest('#csCheckoutAction')) {
        await nextAction();
        return;
      }
      var copyIban = event.target.closest('[data-copy-iban]');
      if (copyIban) {
        var bankCard = copyIban.closest('.cs-checkout-bank-account');
        var bankIndex = bankCard ? Number(bankCard.getAttribute('data-bank-index') || 0) : 0;
        var account = ((bankConfig().accounts || [bankConfig()])[bankIndex] || bankConfig());
        var iban = normalizeIban(copyIban.getAttribute('data-iban') || account.iban);
        try {
          if (!iban || !navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard unavailable');
          await navigator.clipboard.writeText(iban);
          copyIban.textContent = 'IBAN kopyalandı';
          setStatus((account.bankName || 'Banka') + ' IBAN panoya kopyalandı.', 'success');
        } catch (_) {
          copyIban.textContent = 'Kopyalanamadı';
          setStatus('IBAN otomatik kopyalanamadı. Lütfen IBAN’ı seçerek manuel kopyalayın.', 'error');
        }
      }
    });
    document.addEventListener('input', function (event) {
      var target = event.target;
      if (target && target.id === 'csCouponInput' && !String(target.value || '').trim()) {
        resetCouponState(target);
        renderSummary();
        return;
      }
      if (!target || !target.name) return;
      syncStateFromField(target);
    });
    document.addEventListener('change', function (event) {
      var target = event.target;
      if (!target || !target.name) return;
      syncStateFromField(target);
      if (target.name === 'invoiceSame') {
        state.invoice.sameAsDelivery = target.checked;
        if (target.checked) syncSameInvoice();
        saveState();
        render({ skipAuth: true });
      }
      if (target.name === 'legalPreInformation' || target.name === 'legalDistanceSales' || target.name === 'legalPrivacy' || target.name === 'marketingEmailOptIn') {
        state.legal.preInformation = Boolean(field('legalPreInformation') && field('legalPreInformation').checked);
        state.legal.distanceSales = Boolean(field('legalDistanceSales') && field('legalDistanceSales').checked);
        state.legal.privacy = Boolean(field('legalPrivacy') && field('legalPrivacy').checked);
        state.legal.sales = state.legal.preInformation && state.legal.distanceSales;
        state.legal.kvkk = state.legal.privacy;
        state.legal.marketing = Boolean(field('marketingEmailOptIn') && field('marketingEmailOptIn').checked);
        saveState();
      }
    });
    window.addEventListener('popstate', function () {
      state.step = stepFromUrl() || state.step || 'delivery';
      saveState();
      render();
    });
    window.addEventListener('storage', function () { render(); });
    document.addEventListener('cosmoskin:cart:updated', function () {
      refreshStockGate().then(function () { render(); revalidateCouponAfterCartChange(); });
    });
    document.addEventListener('cosmoskin:products-updated', function () {
      refreshStockGate().then(function () { render(); revalidateCouponAfterCartChange(); });
    });
  }
  async function nextAction() {
    if (state.step === 'delivery') {
      if (!validateDelivery()) return;
      if (!await validateStockSoft()) return;
      setStep('payment');
      return;
    }
    if (state.step === 'payment') {
      if (!await validatePayment()) return;
      setStep('review');
      return;
    }
    if (state.step === 'review') {
      await submitOrder();
      return;
    }
    window.location.href = '/allproducts.html';
  }
  async function syncAuthUi(options) {
    options = options || {};
    if (accountSyncInFlight && !options.force) return;
    accountSyncInFlight = true;
    try {
      if (!window.cosmoskinSupabase || !window.cosmoskinSupabase.auth) {
        window.setTimeout(function () { syncAuthUi({ force: true }); }, 400);
        return;
      }
      var result = await window.cosmoskinSupabase.auth.getSession();
      var session = result && result.data && result.data.session;
      var user = session && session.user;
      currentUser = user || null;
      updateAuthGate(currentUser);
      if (!user) {
        savedAddresses = [];
        addressSyncLoaded = false;
        return;
      }
      var changed = applyUserToState(user, false);
      if (!addressSyncLoaded && session.access_token) {
        try {
          savedAddresses = await fetchAccountAddresses(session.access_token);
          addressSyncLoaded = true;
          var defaultAddress = savedAddresses.find(function (item) { return item.isDefault && ['billing', 'invoice', 'fatura'].indexOf(String(item.type || '').toLowerCase()) === -1; }) ||
            savedAddresses.find(function (item) { return ['billing', 'invoice', 'fatura'].indexOf(String(item.type || '').toLowerCase()) === -1; }) ||
            savedAddresses[0];
          if (defaultAddress) changed = applyAddressToState(defaultAddress, false) || changed;
          var defaultBillingAddress = savedAddresses.find(function (item) { return item.isDefault && ['billing', 'invoice', 'fatura', 'both', 'delivery_billing', 'teslimat_fatura'].indexOf(String(item.type || '').toLowerCase()) !== -1; });
          if (defaultBillingAddress) changed = applyAddressToState(defaultBillingAddress, false) || changed;
        } catch (_) {
          addressSyncLoaded = true;
          savedAddresses = [];
        }
      }
      saveState();
      if (changed || options.force) render({ skipAuth: true });
      else updateAuthGate(currentUser);
      applyLiveCheckoutValues(false);
    } finally {
      accountSyncInFlight = false;
    }
  }
  function init() {
    var requested = stepFromUrl();
    if (requested) state.step = requested;
    if (state.step === 'success') state.order = state.order || readJSON(ORDER_KEY, null);
    saveState();
    bind();
    cart = readCart();
    var preloadSlugs = cart.items.map(function (item) { return item.slug || item.id; }).filter(Boolean);
    if (window.COSMOSKIN_STOCK && preloadSlugs.length && typeof window.COSMOSKIN_STOCK.loadInventory === 'function') {
      window.COSMOSKIN_STOCK.loadInventory(preloadSlugs, { force: true });
    }
    fetchBankAccountConfig().then(function () {
      refreshStockGate().then(function () {
        return hydrateAndRevalidateCoupon();
      }).then(function () { render({ skipAuth: true }); });
    });
    document.addEventListener('cosmoskin:auth-state', function (event) {
      currentUser = event.detail && event.detail.user || null;
      addressSyncLoaded = false;
      syncAuthUi({ force: true });
      hydrateAndRevalidateCoupon().then(function () { render({ skipAuth: true }); });
    });
    document.addEventListener('cosmoskin:auth-refresh-requested', function () {
      addressSyncLoaded = false;
      syncAuthUi({ force: true });
    });
    render();
    setTimeout(function () { syncAuthUi({ force: true }); }, 300);
    setTimeout(function () { syncAuthUi({ force: true }); }, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
