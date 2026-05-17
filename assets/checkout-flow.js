(function () {
  'use strict';

  var STORAGE_KEY = 'cosmoskin_checkout_state_v2';
  var ORDER_KEY = 'cosmoskin_checkout_last_order_v1';
  var CART_KEYS = ['cosmoskin_cart', 'cosmoskinCart', 'COSMOSKIN_CART', 'cart', 'cartItems', 'shoppingCart'];
  var STEPS = ['delivery', 'payment', 'review', 'success'];
  var STEP_LABELS = {
    delivery: 'Teslimat',
    payment: 'Ödeme',
    review: 'Kontrol Et',
    success: 'Tamamlandı'
  };
  var cfg = window.COSMOSKIN_CONFIG || {};
  var FREE_SHIPPING = Number(cfg.freeShippingThreshold || 2500);
  var STANDARD_SHIPPING = Number(cfg.shippingFee || 119);
  var EXPRESS_FEE = 49.90;
  var state = loadState();
  var cart = { key: CART_KEYS[0], data: [], items: [], found: false };
  var inventoryWarning = '';
  var submitLocked = false;

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
  function num(value) {
    if (typeof value === 'number') return value;
    return Number(String(value || '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
  }
  function digits(value) { return String(value || '').replace(/\D/g, ''); }
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
  function loadState() {
    var saved = readJSON(STORAGE_KEY, {});
    return Object.assign({
      step: 'delivery',
      shippingMethod: 'standard',
      paymentMethod: 'card',
      delivery: { country: 'Türkiye' },
      invoice: { type: 'individual', sameAsDelivery: true },
      payment: { cardLast4: '', cardHolder: '' },
      legal: { sales: false, kvkk: false },
      coupon: { code: '', discount: 0, label: '' },
      order: null
    }, saved || {});
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
    var price = num(raw.price || raw.unit_price || raw.unitPrice || raw.sale_price || raw.salePrice || product.price);
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
    var discount = Math.min(subtotal, Number(state.coupon && state.coupon.discount || 0));
    var discounted = Math.max(0, subtotal - discount);
    var shipping = 0;
    if (discounted > 0) {
      if (state.shippingMethod === 'express') shipping = discounted >= FREE_SHIPPING ? EXPRESS_FEE : STANDARD_SHIPPING + EXPRESS_FEE;
      else shipping = discounted >= FREE_SHIPPING ? 0 : STANDARD_SHIPPING;
    }
    var vat = discounted - (discounted / 1.20);
    return { subtotal: subtotal, discount: discount, discounted: discounted, shipping: shipping, vat: vat, total: discounted + shipping };
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
      postalCode: data.postalCode
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
  function validatePayment() {
    clearErrors();
    var ok = true;
    var form = byId('csCheckoutPaymentForm');
    var data = collectForm(form);
    state.paymentMethod = data.paymentMethod || state.paymentMethod || 'card';
    state.legal.sales = Boolean(data.legalSales);
    state.legal.kvkk = Boolean(data.legalKvkk);
    if (state.paymentMethod === 'card') {
      var cardNumber = digits(data.cardNumber);
      state.payment.cardHolder = data.cardHolder || '';
      state.payment.cardLast4 = cardNumber.slice(-4);
      if (!data.cardHolder) { errorFor(field('cardHolder'), 'Kart üzerindeki ismi girin.'); ok = false; }
      if (cardNumber.length < 13 || cardNumber.length > 19) { errorFor(field('cardNumber'), 'Kart numarasını kontrol edin.'); ok = false; }
      if (!/^\d{2}\/\d{2}$/.test(data.cardExpiry || '')) { errorFor(field('cardExpiry'), 'AA/YY formatında girin.'); ok = false; }
      if (!/^\d{3,4}$/.test(digits(data.cardCvv))) { errorFor(field('cardCvv'), 'CVV 3 veya 4 haneli olmalıdır.'); ok = false; }
    }
    if (!state.legal.sales) { errorFor(field('legalSales'), 'Devam etmek için yasal metinleri onaylayın.'); ok = false; }
    if (!state.legal.kvkk) { errorFor(field('legalKvkk'), 'KVKK bilgilendirmesini onaylayın.'); ok = false; }
    saveState();
    if (!ok) setStatus('Lütfen ödeme ve yasal onay alanlarını kontrol edin.', 'error');
    return ok;
  }
  async function validateStockSoft() {
    inventoryWarning = '';
    if (!cart.items.length) return false;
    var payload = cart.items.map(function (item) {
      return { product_slug: item.slug || item.id, quantity: item.qty };
    });
    try {
      var data = null;
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
      if (data && data.can_purchase === false) {
        setStatus('Sepetinizdeki bir ürün artık stokta bulunmuyor. Devam etmek için sepetinizi güncelleyin.', 'error');
        return false;
      }
      return true;
    } catch (_) {
      inventoryWarning = 'Stok bilgisi şu anda canlı olarak doğrulanamadı; ödeme oluşturulurken sunucu tarafında tekrar kontrol edilecek.';
      return true;
    }
  }
  function bankConfig() {
    var checkout = (window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.checkout) || {};
    var bank = checkout.bankTransfer || window.COSMOSKIN_BANK_TRANSFER || {};
    return {
      bankName: bank.bankName || bank.bank || '',
      accountName: bank.accountName || bank.recipient || '',
      iban: bank.iban || '',
      branch: bank.branch || '',
      currency: bank.currency || 'TRY',
      configured: Boolean(bank.bankName && bank.accountName && bank.iban)
    };
  }
  function paymentLabel() { return state.paymentMethod === 'bank_transfer' ? 'Havale / EFT' : 'Kredi Kartı'; }
  function shippingInfo() {
    var t = totals();
    if (state.shippingMethod === 'express') return { title: 'Hızlı Kargo', estimate: '1-2 iş günü', fee: t.shipping };
    return { title: 'Standart Kargo', estimate: '2-4 iş günü', fee: t.shipping };
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
      identity_number: state.invoice.type === 'individual' ? (state.invoice.identity || '') : '',
      city: state.delivery.city,
      district: state.delivery.district,
      postal_code: state.delivery.postalCode,
      invoice_type: invoiceType,
      address: state.delivery.address,
      cargo_note: '',
      kvkk_acknowledged: true,
      preliminary_information_accepted: true,
      distance_sales_accepted: true
    };
  }
  function checkoutPayload() {
    var t = totals();
    return {
      payment_method: state.paymentMethod,
      cart: cart.items.map(function (item) {
        return { id: item.slug || item.id, slug: item.slug || item.id, product_slug: item.slug || item.id, quantity: item.qty, qty: item.qty };
      }),
      customer: customerPayload(),
      delivery: state.delivery,
      invoice: state.invoice,
      shipping: Object.assign({ method: state.shippingMethod }, shippingInfo()),
      totals: t,
      coupon_code: state.coupon.code || null,
      legal_approved_at: new Date().toISOString()
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
  async function submitOrder() {
    if (submitLocked) return;
    submitLocked = true;
    setStatus(state.paymentMethod === 'bank_transfer' ? 'Sipariş oluşturuluyor...' : 'Ödeme başlatılıyor...', '');
    try {
      var payload = checkoutPayload();
      payload.accessToken = await accessToken();
      var res = await fetch(((cfg && cfg.apiBase) || '/api') + '/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.ok === false) throw new Error(data.error || 'İşlem başlatılamadı.');
      if (state.paymentMethod === 'bank_transfer') {
        state.order = {
          orderId: data.orderId || data.order_id || '',
          orderNumber: data.orderNumber || data.order_number || orderNumberFallback(),
          paymentMethod: 'bank_transfer',
          paymentStatus: 'awaiting_transfer',
          email: state.delivery.email,
          totals: totals(),
          bank: bankConfig()
        };
        saveState();
        writeSession(ORDER_KEY, state.order);
        setStep('success');
        return;
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
  async function applyCoupon() {
    var input = byId('csCouponInput');
    var code = input ? input.value.trim().toUpperCase() : '';
    state.coupon = { code: code, discount: 0, label: '' };
    if (!code) {
      saveState();
      renderSummary();
      setStatus('Kupon kodu temizlendi.', '');
      return;
    }
    try {
      var res = await fetch(((cfg && cfg.apiBase) || '/api') + '/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, cart: cart.items.map(function (item) { return item.original || item; }) })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Kupon doğrulanamadı.');
      var discount = num(data.discountAmount || data.discount_amount || data.discount || 0);
      state.coupon = { code: code, discount: discount, label: data.discountLabel || data.label || '' };
      saveState();
      renderSummary();
      setStatus(discount > 0 ? 'Kupon uygulandı.' : 'Kupon ödeme oluşturulurken sunucu tarafında doğrulanacak.', 'success');
    } catch (error) {
      state.coupon = { code: code, discount: 0, label: '' };
      saveState();
      renderSummary();
      setStatus(error.message || 'Kupon doğrulanamadı.', 'error');
    }
  }
  function renderStepper() {
    var current = STEPS.indexOf(state.step);
    var node = byId('csCheckoutStepper');
    if (!node) return;
    node.innerHTML = STEPS.map(function (step, index) {
      var complete = index < current;
      var active = index === current;
      return '<button class="cs-checkout-step ' + (complete ? 'is-complete ' : '') + (active ? 'is-active' : '') + '" type="button" data-step-nav="' + esc(step) + '"><span>' + (complete ? '✓' : index + 1) + '</span>' + esc(STEP_LABELS[step]) + '</button>';
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
  function renderDelivery() {
    var d = state.delivery || {};
    var inv = state.invoice || {};
    var same = inv.sameAsDelivery !== false;
    var individual = inv.type !== 'corporate';
    return '<form id="csCheckoutDeliveryForm" novalidate>' +
      '<section class="cs-checkout-card"><div class="cs-checkout-auth" id="csCheckoutAuthGate"><div><strong>Hesabın varsa daha hızlı ilerleyebilirsin.</strong><span>Misafir ödeme açık; giriş yapmak zorunlu değildir.</span></div><div class="cs-checkout-auth-actions"><button class="cs-checkout-secondary" data-open-auth data-auth-tab="loginPanel" type="button">Giriş Yap</button><button class="cs-checkout-secondary" data-open-auth data-auth-tab="registerPanel" type="button">Kayıt Ol</button></div></div>' +
      '<div class="cs-checkout-card-head"><div><h2>Teslimat Bilgileri</h2><p>Sipariş bildirimleri ve kargo süreci için gerekli bilgileri girin.</p></div></div>' +
      '<div class="cs-checkout-form-grid">' +
      input('firstName', 'Ad', d.firstName, { autocomplete: 'given-name' }) +
      input('lastName', 'Soyad', d.lastName, { autocomplete: 'family-name' }) +
      input('email', 'E-posta', d.email, { type: 'email', autocomplete: 'email', full: true, placeholder: 'ornek@mail.com' }) +
      input('phone', 'Telefon', d.phone, { autocomplete: 'tel', inputmode: 'tel', placeholder: '5XX XXX XX XX' }) +
      input('country', 'Ülke', d.country || 'Türkiye', { autocomplete: 'country-name' }) +
      textarea('address', 'Açık Adres', d.address) +
      input('city', 'İl', d.city, { autocomplete: 'address-level1' }) +
      input('district', 'İlçe', d.district, { autocomplete: 'address-level2' }) +
      input('postalCode', 'Posta Kodu', d.postalCode, { inputmode: 'numeric', maxlength: 5, full: true }) +
      '</div></section>' +
      '<section class="cs-checkout-card"><div class="cs-checkout-card-head"><div><h2>Kargo Yöntemi</h2><p>Seçiminiz sipariş özetindeki kargo tutarını günceller.</p></div></div>' + shippingOptionsHtml() + '</section>' +
      '<section class="cs-checkout-card"><div class="cs-checkout-card-head"><div><h2>Fatura Bilgileri</h2><p>Bireysel veya kurumsal fatura bilgilerinizi güvenle ekleyin.</p></div></div>' +
      '<input type="hidden" name="invoiceType" value="' + (individual ? 'individual' : 'corporate') + '">' +
      '<div class="cs-checkout-segment" role="group" aria-label="Fatura tipi"><button type="button" class="' + (individual ? 'is-active' : '') + '" data-invoice-type="individual">Bireysel</button><button type="button" class="' + (!individual ? 'is-active' : '') + '" data-invoice-type="corporate">Kurumsal</button></div>' +
      '<div style="height:14px"></div><label class="cs-checkout-checkbox"><input type="checkbox" name="invoiceSame" ' + (same ? 'checked' : '') + '><span>Fatura adresim teslimat adresimle aynı</span></label>' +
      '<div style="height:16px"></div><div class="cs-checkout-form-grid">' + invoiceFieldsHtml(individual, same) + '</div></section>' +
      '</form>';
  }
  function shippingOptionsHtml() {
    var t = totals();
    var standard = t.discounted >= FREE_SHIPPING ? 0 : STANDARD_SHIPPING;
    var express = t.discounted >= FREE_SHIPPING ? EXPRESS_FEE : STANDARD_SHIPPING + EXPRESS_FEE;
    return '<div class="cs-checkout-option-grid">' +
      optionHtml('standard', 'Standart Kargo', 'Tahmini teslimat: 2-4 iş günü', standard) +
      optionHtml('express', 'Hızlı Kargo', 'Tahmini teslimat: 1-2 iş günü', express) +
      '</div>';
  }
  function optionHtml(value, title, desc, fee) {
    return '<button class="cs-checkout-option ' + (state.shippingMethod === value ? 'is-selected' : '') + '" type="button" data-shipping="' + value + '"><span class="cs-checkout-radio"></span><span><strong>' + title + '</strong><span>' + desc + '</span></span><em>' + (fee ? money(fee) : 'Ücretsiz') + '</em></button>';
  }
  function invoiceFieldsHtml(individual, same) {
    var inv = state.invoice || {};
    var html = '';
    if (individual) {
      html += input('invoiceName', 'Ad Soyad', inv.name, { full: true });
      html += input('invoiceIdentity', 'T.C. Kimlik No (opsiyonel)', inv.identity, { inputmode: 'numeric', maxlength: 11 });
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
    return '<section class="cs-checkout-card"><div class="cs-checkout-card-head"><div><h2>Ödeme Bilgileri</h2><p>Ödeme yönteminizi seçin. Kart bilgileri bu tarayıcıda saklanmaz.</p></div></div>' +
      '<div class="cs-checkout-review-list"><div class="cs-checkout-review-card"><header><h3>Teslimat Adresi</h3><button class="cs-checkout-edit" type="button" data-go-step="delivery">Düzenle</button></header><p>' + esc((state.delivery.firstName || '') + ' ' + (state.delivery.lastName || '')) + '<br>' + esc(state.delivery.address || '') + '<br>' + esc((state.delivery.district || '') + ' / ' + (state.delivery.city || '') + ' ' + (state.delivery.postalCode || '')) + '<br>' + esc(state.delivery.phone || '') + '</p></div>' +
      '<div class="cs-checkout-review-card"><header><h3>Kargo Yöntemi</h3><button class="cs-checkout-edit" type="button" data-go-step="delivery">Düzenle</button></header><p><strong>' + esc(ship.title) + '</strong><br>Tahmini teslimat: ' + esc(ship.estimate) + '<br>' + (ship.fee ? money(ship.fee) : 'Ücretsiz') + '</p></div></div>' +
      '<form id="csCheckoutPaymentForm" novalidate>' +
      '<div class="cs-checkout-payment-panel"><div class="cs-checkout-option-grid">' +
      paymentOptionHtml('card', 'Kart ile Ödeme', '3D Secure doğrulamasıyla güvenli ödeme', 'Kredi kartı') +
      paymentOptionHtml('bank_transfer', 'Havale / EFT', 'Sipariş oluşturulur, ödeme onayı beklenir', 'Ödeme bekleniyor') +
      '</div>' + paymentMethodPanelHtml() + '</div>' +
      '<div class="cs-checkout-legal-panel"><h3>Yasal Onaylar</h3><label class="cs-checkout-checkbox"><input type="checkbox" name="legalSales" ' + (state.legal.sales ? 'checked' : '') + ' aria-invalid="false" aria-describedby="cs-legalSales-error"><span><a href="/legal/on-bilgilendirme-formu.html" target="_blank" rel="noopener">Ön Bilgilendirme Formu</a> ve <a href="/legal/mesafeli-satis-sozlesmesi.html" target="_blank" rel="noopener">Mesafeli Satış Sözleşmesi</a>’ni okudum, anladım ve kabul ediyorum.</span></label><div class="cs-checkout-error" id="cs-legalSales-error"></div><label class="cs-checkout-checkbox"><input type="checkbox" name="legalKvkk" ' + (state.legal.kvkk ? 'checked' : '') + ' aria-invalid="false" aria-describedby="cs-legalKvkk-error"><span><a href="/legal/kvkk-aydinlatma-metni.html" target="_blank" rel="noopener">KVKK Aydınlatma Metni</a>’ni okudum ve anladım.</span></label><div class="cs-checkout-error" id="cs-legalKvkk-error"></div></div>' +
      '</form><div id="csIyzicoHost"></div></section>';
  }
  function paymentOptionHtml(value, title, desc, meta) {
    return '<button class="cs-checkout-payment-option ' + (state.paymentMethod === value ? 'is-selected' : '') + '" type="button" data-payment-method="' + value + '"><span class="cs-checkout-radio"></span><span><strong>' + title + '</strong><span>' + desc + '</span></span><em>' + meta + '</em></button>';
  }
  function paymentMethodPanelHtml() {
    if (state.paymentMethod === 'bank_transfer') return bankPanelHtml();
    return '<div class="cs-checkout-form-grid">' +
      input('cardHolder', 'Kart Üzerindeki İsim', state.payment.cardHolder, { full: true, autocomplete: 'cc-name', placeholder: 'Ad Soyad' }) +
      input('cardNumber', 'Kart Numarası', '', { full: true, inputmode: 'numeric', autocomplete: 'cc-number', placeholder: '0000 0000 0000 0000', maxlength: 23 }) +
      input('cardExpiry', 'Son Kullanma Tarihi', '', { inputmode: 'numeric', autocomplete: 'cc-exp', placeholder: 'AA/YY', maxlength: 5 }) +
      input('cardCvv', 'CVV', '', { inputmode: 'numeric', autocomplete: 'cc-csc', placeholder: '123', maxlength: 4 }) +
      '<div class="cs-card-icons cs-checkout-field is-full"><img src="/assets/img/payments/visa.svg" alt="Visa"><img src="/assets/img/payments/mastercard.svg" alt="Mastercard"><img src="/assets/img/payments/troy.svg" alt="Troy"></div>' +
      '<p class="cs-checkout-note cs-checkout-field is-full">Ödemeniz bankanızın 3D Secure doğrulamasıyla tamamlanacaktır. Kart numarası, CVV veya son kullanma tarihi tarayıcı depolamasına kaydedilmez.</p>' +
      '</div>';
  }
  function bankPanelHtml() {
    var bank = bankConfig();
    var lines = [
      ['Banka Adı', bank.bankName || 'Banka bilgisi yapılandırılmadı'],
      ['Alıcı Ünvanı', bank.accountName || 'Sipariş sonrası paylaşılacak'],
      ['IBAN', bank.iban || 'IBAN henüz yapılandırılmadı'],
      ['Para Birimi', bank.currency || 'TRY']
    ];
    if (bank.branch) lines.push(['Şube / Hesap No', bank.branch]);
    return '<div class="cs-checkout-bank-panel"><h3>Havale / EFT ile Ödeme</h3><p class="cs-checkout-note">Siparişiniz oluşturulduktan sonra ödeme onayı beklenir. Lütfen açıklama alanına sipariş numaranızı yazın.</p>' +
      (!bank.configured ? '<p class="cs-checkout-status is-error">Canlı banka hesap bilgisi henüz yapılandırılmadı. Bu alan yapılandırıldığında müşteriye IBAN gösterilir.</p>' : '') +
      lines.map(function (line) { return '<div class="cs-checkout-bank-line"><span>' + esc(line[0]) + '</span><strong>' + esc(line[1]) + '</strong>' + (line[0] === 'IBAN' ? '<button class="cs-checkout-secondary" data-copy-iban type="button" ' + (!bank.iban ? 'disabled' : '') + '>Kopyala</button>' : '<i></i>') + '</div>'; }).join('') +
      '<p class="cs-checkout-note">Ödeme onaylandıktan sonra siparişiniz hazırlanmaya alınır. Havale/EFT siparişi otomatik olarak “ödendi” kabul edilmez.</p></div>';
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
      '<div class="cs-checkout-review-card"><header><h3>Yasal Onaylar</h3><button class="cs-checkout-edit" type="button" data-go-step="payment">Düzenle</button></header><p>Ön Bilgilendirme Formu, Mesafeli Satış Sözleşmesi ve KVKK Aydınlatma Metni onaylandı.</p></div>' +
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
        ['Adres', state.invoice.sameAsDelivery ? 'Teslimat adresiyle aynı' : state.invoice.address]
      ];
    }
    return [
      ['Fatura Tipi', 'Bireysel'],
      ['Ad Soyad', state.invoice.name],
      ['T.C. Kimlik No', state.invoice.identity || 'Opsiyonel'],
      ['E-posta', state.invoice.email],
      ['Telefon', state.invoice.phone],
      ['Adres', state.invoice.sameAsDelivery ? 'Teslimat adresiyle aynı' : state.invoice.address]
    ];
  }
  function paymentReviewRows() {
    if (state.paymentMethod === 'bank_transfer') return [['Ödeme Yöntemi', 'Havale / EFT'], ['Durum', 'Ödeme bekleniyor'], ['Not', 'Açıklama alanına sipariş numarası yazılmalıdır.']];
    return [['Ödeme Yöntemi', 'Kredi Kartı'], ['Kart', '**** **** **** ' + (state.payment.cardLast4 || '----')], ['Güvenlik', '3D Secure']];
  }
  function renderSuccess() {
    var order = state.order || readJSON(ORDER_KEY, null) || {};
    var bank = order.bank || bankConfig();
    var isBank = order.paymentMethod === 'bank_transfer' || state.paymentMethod === 'bank_transfer';
    var rows = isBank
      ? [
          ['Sipariş No', order.orderNumber || orderNumberFallback()],
          ['Banka Adı', bank.bankName || 'Banka bilgisi yapılandırılmadı'],
          ['Alıcı Ünvanı', bank.accountName || 'Sipariş sonrası paylaşılacak'],
          ['IBAN', bank.iban || 'IBAN henüz yapılandırılmadı'],
          ['Açıklama', order.orderNumber || 'Sipariş numarası'],
          ['E-posta', order.email || state.delivery.email || '—']
        ]
      : [
          ['Sipariş No', order.orderNumber || 'Ödeme sağlayıcı dönüşünden sonra oluşur'],
          ['E-posta', order.email || state.delivery.email || '—'],
          ['Tahmini Teslimat', '2-4 iş günü'],
          ['Ödeme Yöntemi', 'Kredi Kartı'],
          ['Ödeme Durumu', order.paymentStatus === 'paid' ? 'Ödendi' : 'Ödeme sağlayıcı onayı bekleniyor']
        ];
    return '<section class="cs-checkout-card cs-checkout-success"><div class="cs-checkout-success-mark">' + icon('check') + '</div><h2>' + (isBank ? 'Siparişiniz Oluşturuldu' : 'Siparişiniz Alındı') + '</h2><p>' + (isBank ? 'Havale/EFT ödemeniz bekleniyor. Lütfen ödeme açıklamasına sipariş numaranızı yazın.' : 'Teşekkür ederiz. Siparişiniz oluşturuldu; ödeme durumu sağlayıcı dönüşüne göre güncellenir.') + '</p><div class="cs-checkout-success-grid">' +
      rows.map(function (row) { return '<div class="cs-checkout-success-row"><span>' + esc(row[0]) + '</span><strong>' + esc(row[1]) + '</strong></div>'; }).join('') +
      '</div><div class="cs-checkout-summary-actions"><a class="cs-checkout-primary" href="/account/profile.html?tab=orders">Siparişlerime Git</a><a class="cs-checkout-secondary" href="/allproducts.html">Alışverişe Devam Et</a></div></section>';
  }
  function renderContent() {
    var host = byId('csCheckoutContent');
    if (!host) return;
    if (!cart.items.length && state.step !== 'success') {
      host.innerHTML = '<section class="cs-checkout-empty"><h2>Sepetin boş.</h2><p class="cs-checkout-note">Checkout’a devam etmek için sepetine ürün eklemelisin.</p><div class="cs-checkout-summary-actions"><a class="cs-checkout-primary" href="/allproducts.html">Ürünleri Keşfet</a><a class="cs-checkout-secondary" href="/cart.html">Sepete Git</a></div></section>';
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
    var t = totals();
    host.innerHTML = '<div class="cs-checkout-summary-head"><h2>Sipariş Özeti</h2><span class="cs-checkout-secure">KDV dahil</span></div>' +
      '<div class="cs-checkout-summary-items">' + (cart.items.length ? cart.items.map(function (item) {
        return '<article class="cs-checkout-item"><a href="' + esc(item.url) + '"><img src="' + esc(item.image || '/assets/logo-mark.png') + '" alt="' + esc(item.name) + '" loading="lazy"></a><div><strong>' + esc(item.brand) + '<br>' + esc(item.name) + '</strong><span>' + esc(item.size || 'KDV dahil') + '</span><span>Adet: ' + item.qty + '</span></div><b>' + money(item.price * item.qty) + '</b></article>';
      }).join('') : '<p class="cs-checkout-note">Sepetin boş.</p>') + '</div>' +
      totalRow('Ara Toplam', money(t.subtotal)) +
      (t.discount ? totalRow('İndirim', '-' + money(t.discount)) : '') +
      totalRow('Kargo', t.shipping ? money(t.shipping) : 'Ücretsiz') +
      totalRow('Dahil olan KDV', money(t.vat)) +
      totalRow('Toplam', money(t.total), true) +
      '<div class="cs-checkout-discount"><label class="cs-checkout-label" for="csCouponInput">İndirim Kodu</label><div class="cs-checkout-discount-row"><input class="cs-checkout-input" id="csCouponInput" value="' + esc(state.coupon.code || '') + '" placeholder="İndirim kodunuz"><button class="cs-checkout-secondary" id="csCouponApply" type="button">Uygula</button></div></div>';
    if (!action) return;
    var label = state.step === 'delivery' ? 'Ödeme Adımına Geç' : state.step === 'payment' ? 'Kontrol Et' : state.step === 'review' ? (state.paymentMethod === 'bank_transfer' ? 'Siparişi Oluştur' : 'Siparişi Onayla ve Öde') : 'Alışverişe Devam Et';
    action.textContent = label;
    action.disabled = submitLocked || (!cart.items.length && state.step !== 'success');
    var note = byId('csCheckoutActionNote');
    if (note) note.textContent = state.step === 'review' && state.paymentMethod === 'bank_transfer'
      ? 'Havale/EFT siparişleri ödeme bekleniyor durumuyla oluşturulur.'
      : state.step === 'review'
        ? 'Onayladıktan sonra bankanızın güvenli ödeme sayfasına yönlendirilebilirsiniz.'
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
      box: '<path d="M4 8 12 4l8 4-8 4-8-4Zm0 0v8l8 4 8-4V8M12 12v8"></path>'
    };
    return '<svg class="cs-checkout-icon" viewBox="0 0 24 24">' + (paths[name] || paths.check) + '</svg>';
  }
  function renderTrust() {
    var host = byId('csCheckoutTrust');
    if (!host) return;
    host.innerHTML = [
      ['check', '%100 Orijinal<br>Ürün Garantisi'],
      ['truck', 'Ücretsiz<br>Kargo'],
      ['return', '14 Gün İçinde<br>Kolay İade'],
      ['lock', 'Güvenli<br>Ödeme']
    ].map(function (item) {
      return '<div class="cs-checkout-trust-item"><span class="cs-checkout-trust-icon">' + icon(item[0]) + '</span><span>' + item[1] + '</span></div>';
    }).join('');
  }
  function render() {
    cart = readCart();
    renderStepper();
    renderContent();
    renderSummary();
    renderTrust();
    syncAuthUi();
  }
  function bind() {
    document.addEventListener('click', async function (event) {
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
        state.paymentMethod = payment.getAttribute('data-payment-method');
        saveState();
        render();
        return;
      }
      if (event.target.closest('#csCouponApply')) {
        await applyCoupon();
        return;
      }
      if (event.target.closest('#csCheckoutSummaryToggle')) {
        var summary = byId('csCheckoutSummary');
        if (summary) summary.classList.toggle('is-collapsed');
        return;
      }
      if (event.target.closest('#csCheckoutAction')) {
        await nextAction();
        return;
      }
      var copyIban = event.target.closest('[data-copy-iban]');
      if (copyIban) {
        var iban = bankConfig().iban;
        if (iban && navigator.clipboard) {
          await navigator.clipboard.writeText(iban);
          copyIban.textContent = 'IBAN kopyalandı';
        }
      }
    });
    document.addEventListener('input', function (event) {
      var target = event.target;
      if (!target || !target.name) return;
      if (target.name === 'cardNumber') target.value = digits(target.value).slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
      if (target.name === 'cardExpiry') {
        var d = digits(target.value).slice(0, 4);
        target.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
      }
      if (target.name === 'cardCvv') target.value = digits(target.value).slice(0, 4);
    });
    window.addEventListener('popstate', function () {
      state.step = stepFromUrl() || state.step || 'delivery';
      saveState();
      render();
    });
    window.addEventListener('storage', function () { render(); });
    document.addEventListener('cosmoskin:cart:updated', function () { render(); });
  }
  async function nextAction() {
    if (state.step === 'delivery') {
      if (!validateDelivery()) return;
      if (!await validateStockSoft()) return;
      setStep('payment');
      return;
    }
    if (state.step === 'payment') {
      if (!validatePayment()) return;
      setStep('review');
      return;
    }
    if (state.step === 'review') {
      await submitOrder();
      return;
    }
    window.location.href = '/allproducts.html';
  }
  async function syncAuthUi() {
    var gate = byId('csCheckoutAuthGate');
    if (!gate) return;
    try {
      if (!window.cosmoskinSupabase || !window.cosmoskinSupabase.auth) return;
      var result = await window.cosmoskinSupabase.auth.getSession();
      var user = result && result.data && result.data.session && result.data.session.user;
      gate.hidden = Boolean(user);
      if (!user) return;
      var meta = user.user_metadata || {};
      state.delivery.email = state.delivery.email || user.email || '';
      state.delivery.firstName = state.delivery.firstName || meta.first_name || meta.firstName || '';
      state.delivery.lastName = state.delivery.lastName || meta.last_name || meta.lastName || '';
      saveState();
    } catch (_) {}
  }
  function init() {
    var requested = stepFromUrl();
    if (requested) state.step = requested;
    if (state.step === 'success') state.order = state.order || readJSON(ORDER_KEY, null);
    saveState();
    bind();
    render();
    setTimeout(render, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
