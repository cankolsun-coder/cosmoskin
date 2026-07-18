(function () {
  'use strict';

  var API_BASE = (window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.apiBase) || '/api';
  var inventoryMap = new Map();
  var loadingPromise = null;
  var serviceState = 'idle';
  var serviceError = '';
  var COPY = {
    out: 'Şu anda stokta yok.',
    low: 'Son ürünler.',
    cta: 'Gelince Haber Ver.',
    restockSuccess: 'Ürün tekrar stokta olduğunda sana haber vereceğiz.',
    restockDuplicate: 'Bu ürün için stok bildirimi zaten oluşturulmuş.',
    unavailable: 'Bu ürün şu anda stokta yok. Favorilerine ekleyerek tekrar geldiğinde haber alabilirsin.',
    checkout: 'Sepetindeki bazı ürünlerin stoğu değişti. Lütfen sepetini kontrol et.',
    verifyFail: 'Stok bilgisi doğrulanamadı. Lütfen tekrar deneyin.',
    serviceUnavailable: 'Stok servisine şu anda ulaşılamıyor. Ürün stokta yok değil; güvenlik nedeniyle satın alma geçici olarak durduruldu.',
    missingRecord: 'Bu ürünün stok kaydı eksik. Satın alma güvenlik nedeniyle durduruldu ve ekip bilgilendirilmeli.'
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function slugFrom(value) {
    return String(value || '').trim().replace(/^.*\/products\//, '').replace(/\.html.*$/, '').toLowerCase();
  }
  function uniq(list) { return Array.from(new Set(list.filter(Boolean))); }
  function getButtonSlug(btn) { return slugFrom(btn.getAttribute('data-add-cart') || btn.getAttribute('data-cm-add-cart') || btn.getAttribute('data-buy-now') || btn.dataset.slug || btn.dataset.id || btn.dataset.productSlug || btn.dataset.favoriteId || ''); }
  function currentSlug() {
    var main = document.querySelector('[data-product-slug]');
    if (main) return slugFrom(main.getAttribute('data-product-slug'));
    var match = location.pathname.match(/\/products\/([^/.]+)/);
    return match ? slugFrom(match[1]) : '';
  }
  function collectSlugs(root) {
    root = root || document;
    var slugs = [];
    root.querySelectorAll('[data-add-cart], [data-cm-add-cart], [data-buy-now], [data-add-product-cart], [data-product-id], [data-product-slug], [data-favorite-id], [data-cm-stock-badge]').forEach(function (node) {
      slugs.push(slugFrom(node.getAttribute('data-add-cart') || node.getAttribute('data-cm-add-cart') || node.getAttribute('data-buy-now') || node.getAttribute('data-add-product-cart') || node.dataset.slug || node.dataset.id || node.dataset.productId || node.dataset.productSlug || node.dataset.favoriteId || node.dataset.addProductCart || ''));
    });
    var pdpSlug = currentSlug();
    if (pdpSlug) slugs.push(pdpSlug);
    return uniq(slugs);
  }
  function getInventory(slug) { return inventoryMap.get(slugFrom(slug)) || null; }
  function isOut(inv) { return inv && inv.status === 'active' && !inv.allow_backorder && Number(inv.available_stock || 0) <= 0; }
  function isLow(inv) { return inv && inv.low_stock && !isOut(inv); }
  function canBuy(slug, qty) {
    var inv = getInventory(slug);
    var quantity = Math.max(1, Number(qty || 1));
    if (!inv) return { ok: false, unknown: true, service_unavailable: serviceState === 'error', message: serviceState === 'error' ? COPY.serviceUnavailable : COPY.verifyFail, available_stock: null };
    if (inv._missing || inv.status === 'missing') return { ok: false, missing_record: true, message: COPY.missingRecord, available_stock: null };
    if (inv.status !== 'active') return { ok: false, message: COPY.out, available_stock: 0 };
    if (inv.allow_backorder) return { ok: true, available_stock: inv.available_stock };
    if (Number(inv.available_stock || 0) <= 0) return { ok: false, message: COPY.unavailable, available_stock: 0 };
    if (Number(inv.available_stock || 0) < quantity) {
      return { ok: false, message: 'Bu ürün için şu anda yalnızca ' + Number(inv.available_stock || 0) + ' adet satın alınabilir.', available_stock: Number(inv.available_stock || 0) };
    }
    return { ok: true, available_stock: Number(inv.available_stock || 0) };
  }
  function toast(message, type) {
    var node = document.querySelector('.favorite-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'favorite-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.toggle('is-error', type === 'error');
    node.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { node.classList.remove('show'); }, 3200);
  }
  function productCardFor(btn) { return btn.closest('.cm-product-card') || btn.closest('.cm-mobile-pdp') || btn.closest('.cm-cart-row') || btn.closest('.cm-checkout-item') || btn.closest('.product-card') || btn.closest('.pdp5-purchase-card') || btn.closest('.pdp-related-card') || btn.parentElement; }
  function ensureLine(host) {
    if (!host) return null;
    var line = host.querySelector(':scope > .cs-stock-line');
    if (!line) {
      line = document.createElement('div');
      line.className = 'cs-stock-line';
      line.setAttribute('aria-live', 'polite');
      host.appendChild(line);
    }
    return line;
  }

  function stockLabel(inv) {
    if (!inv && serviceState === 'error') return { state: 'error', label: 'Stok doğrulanamıyor', line: serviceError || COPY.serviceUnavailable };
    if (!inv) return { state: 'checking', label: 'Stok kontrol ediliyor', line: COPY.verifyFail };
    if (inv._missing || inv.status === 'missing') return { state: 'error', label: 'Stok kaydı eksik', line: COPY.missingRecord };
    if (isOut(inv)) return { state: 'out', label: 'Stokta Yok', line: 'Favorilerine ekle, tekrar geldiğinde haber verelim.' };
    if (isLow(inv)) return { state: 'low', label: 'Az stok kaldı', line: COPY.low };
    return { state: 'in', label: 'Stokta', line: '' };
  }
  function updateCustomStockSurfaces(slug, inv, root) {
    var info = stockLabel(inv);
    (root || document).querySelectorAll('[data-cm-stock-badge][data-product-slug="' + slug + '"], [data-product-id="' + slug + '"] [data-cm-stock-badge]').forEach(function (badge) {
      badge.textContent = info.label;
      badge.className = 'cm-stock-badge is-' + info.state;
      badge.setAttribute('aria-label', 'Stok durumu: ' + info.label);
    });
    (root || document).querySelectorAll('[data-cm-stock-line][data-product-slug="' + slug + '"], [data-product-id="' + slug + '"] [data-cm-stock-line]').forEach(function (line) {
      line.textContent = info.line || (info.state === 'in' ? 'Ürün stokta ve sepete eklenebilir.' : '');
      line.className = 'cm-stock-line is-' + info.state;
    });
  }
  function defaultButtonText(btn) {
    if (btn.dataset.originalText) return btn.dataset.originalText;
    if (btn.hasAttribute('data-buy-now')) return 'Hemen Al';
    if (btn.hasAttribute('data-cm-add-cart') && !btn.closest('.cm-mobile-pdp')) return 'Ekle';
    return 'Sepete Ekle';
  }
  function renderButtonState(btn) {
    var slug = getButtonSlug(btn);
    if (!slug) return;
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent.trim() || defaultButtonText(btn);
    var inv = getInventory(slug);
    var host = productCardFor(btn);
    updateCustomStockSurfaces(slug, inv, document);
    var lineHost = btn.closest('.price-row') || btn.closest('.pdp5-actions') || host;
    var line = ensureLine(lineHost);
    btn.dataset.inventoryChecked = inv && !inv._missing ? 'true' : 'false';
    if (!inv || inv._missing || inv.status === 'missing') {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('is-stock-disabled');
      if (!btn.classList.contains('cm-card-bag')) btn.textContent = serviceState === 'error' ? 'Stok doğrulanamıyor' : (inv && inv._missing ? 'Stok kaydı eksik' : 'Stok kontrol ediliyor');
      if (line) line.textContent = serviceState === 'error' ? (serviceError || COPY.serviceUnavailable) : (inv && inv._missing ? COPY.missingRecord : COPY.verifyFail);
      if (host) { host.classList.remove('is-out-of-stock'); host.classList.add('is-stock-unavailable'); }
    } else if (isOut(inv)) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('is-stock-disabled');
      btn.textContent = 'Stokta Yok';
      if (line) line.textContent = host && host.classList.contains('pdp5-purchase-card') ? 'Gelince haber almak için stok bildirimi oluşturabilirsin.' : 'Favorilerine ekle, tekrar geldiğinde haber verelim.';
      if (host) { host.classList.add('is-out-of-stock'); host.classList.remove('is-stock-unavailable'); }
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-disabled');
      btn.classList.remove('is-stock-disabled');
      if (/stokta yok|stok kontrol/i.test(btn.textContent.trim())) btn.textContent = defaultButtonText(btn);
      if (line) line.textContent = isLow(inv) ? COPY.low : '';
      if (host) { host.classList.remove('is-out-of-stock'); host.classList.remove('is-stock-unavailable'); }
    }
  }
  function renderPdpStock() {
    var slug = currentSlug();
    if (!slug) return;
    var inv = getInventory(slug);
    updateCustomStockSurfaces(slug, inv, document);
    var stock = document.querySelector('.pdp5-stock');
    if (stock) {
      stock.textContent = !inv ? (serviceState === 'error' ? 'Stok servisine ulaşılamıyor' : 'Stok kontrol ediliyor') : ((inv._missing || inv.status === 'missing') ? 'Stok kaydı doğrulanamadı' : (isOut(inv) ? 'Şu anda stokta yok' : (isLow(inv) ? 'Son ürünler' : 'Stokta')));
      stock.classList.toggle('is-out', Boolean(inv && isOut(inv)));
      stock.classList.toggle('is-low', Boolean(inv && isLow(inv)));
      stock.classList.toggle('is-error', serviceState === 'error' || Boolean(inv && (inv._missing || inv.status === 'missing')));
    }
    var purchase = document.querySelector('.pdp5-purchase-card');
    if (purchase) {
      purchase.classList.toggle('is-out-of-stock', Boolean(inv && isOut(inv)));
      purchase.classList.toggle('is-stock-unavailable', !inv || Boolean(inv && (inv._missing || inv.status === 'missing')));
    }
    if (inv && isOut(inv)) mountRestockForm(slug);
  }
  function updateProductSchemaAvailability() {
    var slug = currentSlug();
    if (!slug) return;
    var inv = getInventory(slug);
    var availability = 'https://schema.org/LimitedAvailability';
    if (inv && !inv._missing && inv.status !== 'missing') {
      if (inv.status === 'inactive' || inv.status === 'discontinued') availability = 'https://schema.org/OutOfStock';
      else if (Number(inv.available_stock || 0) > 0) availability = 'https://schema.org/InStock';
      else if (inv.allow_backorder) availability = 'https://schema.org/BackOrder';
      else availability = 'https://schema.org/OutOfStock';
    }
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (script) {
      try {
        var data = JSON.parse(script.textContent || '{}');
        var nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data];
        var changed = false;
        nodes.forEach(function (node) {
          if (!node || node['@type'] !== 'Product') return;
          var offers = node.offers;
          if (Array.isArray(offers)) offers.forEach(function (offer) { if (offer) { offer.availability = availability; changed = true; } });
          else if (offers && typeof offers === 'object') { offers.availability = availability; changed = true; }
        });
        if (changed) script.textContent = JSON.stringify(data);
      } catch (_) {}
    });
  }
  function applyState(root) {
    (root || document).querySelectorAll('[data-add-cart], [data-cm-add-cart], [data-buy-now]').forEach(renderButtonState);
    renderPdpStock();
    updateProductSchemaAvailability();
    window.dispatchEvent(new CustomEvent('cosmoskin:inventory-updated', { detail: { inventory: Array.from(inventoryMap.values()) } }));
  }
  async function loadInventory(slugs, options) {
    options = options || {};
    slugs = uniq(slugs || collectSlugs(document)).slice(0, 120);
    if (!slugs.length) return [];
    var requested = options.force ? slugs : slugs.filter(function (slug) { return !inventoryMap.has(slug); });
    if (!requested.length) return Array.from(inventoryMap.values());
    serviceState = 'loading';
    serviceError = '';
    loadingPromise = fetch(API_BASE + '/inventory?product_slugs=' + encodeURIComponent(requested.join(',')), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { if (!res.ok || data.ok === false) { var error = new Error(data.error || COPY.serviceUnavailable); error.code = data.code || ''; throw error; } return data; }); })
      .then(function (data) {
        serviceState = 'available';
        (data.inventory || []).forEach(function (row) { inventoryMap.set(slugFrom(row.product_slug), row); });
        (data.missing || []).forEach(function (slug) { inventoryMap.set(slugFrom(slug), { product_slug: slugFrom(slug), status: 'missing', _missing: true, available_stock: null }); });
        applyState(document);
        return data.inventory || [];
      })
      .catch(function (error) {
        serviceState = 'error';
        serviceError = error.message || COPY.serviceUnavailable;
        applyState(document);
        return [];
      });
    return loadingPromise;
  }
  async function checkItems(items) {
    var body = { items: (items || []).map(function (item) { return { product_slug: slugFrom(item.product_slug || item.slug || item.id || item.product_id), quantity: Number(item.quantity || item.qty || 1) || 1 }; }) };
    var res = await fetch(API_BASE + '/inventory/check', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify(body) });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.ok === false) {
      serviceState = 'error';
      serviceError = data.error || COPY.serviceUnavailable;
      applyState(document);
      var stockError = new Error(serviceError);
      stockError.code = data.code || 'INVENTORY_SERVICE_UNAVAILABLE';
      throw stockError;
    }
    serviceState = 'available';
    serviceError = '';
    (data.items || []).forEach(mergeCheckItemIntoMap);
    applyState(document);
    return data;
  }
  async function validateAdd(item) {
    var slug = slugFrom(item.product_slug || item.slug || item.id || item.product_id);
    var quantity = Number(item.quantity || item.qty || 1) || 1;
    await loadInventory([slug]);
    var local = canBuy(slug, quantity);
    if (!local.ok) {
      toast(local.message || COPY.unavailable, 'error');
      return false;
    }
    try {
      var data = await checkItems([{ product_slug: slug, quantity: quantity }]);
      var row = (data.items || [])[0];
      if (row && !row.can_purchase) {
        toast(row.message || COPY.unavailable, 'error');
        return false;
      }
    } catch (_) {
      toast(COPY.verifyFail, 'error');
      return false;
    }
    return true;
  }
  function stockQuantityLimit(slug) {
    var inv = getInventory(slug);
    if (!inv) return 0;
    if (inv.allow_backorder) return Infinity;
    var available = Number(inv.available_stock || 0);
    return Number.isFinite(available) ? Math.max(0, available) : Infinity;
  }
  function cartItemSlug(item) {
    return slugFrom(item.slug || item.id || item.product_slug || item.product_id);
  }
  function formatItemStockMessage(row, cartItem) {
    var name = row.name || (cartItem && (cartItem.name || cartItem.product_name)) || row.product_slug || 'Ürün';
    var requested = row.requested_quantity != null ? row.requested_quantity : (row.quantity != null ? row.quantity : (cartItem && (cartItem.qty || cartItem.quantity)) || 1);
    var available = row.available_quantity != null ? row.available_quantity : row.available_stock;
    if (row.reason === 'insufficient_stock' && Number.isFinite(Number(available))) {
      return name + ' için stok yetersiz. Sepette: ' + requested + ', mevcut: ' + Number(available) + '.';
    }
    if (row.reason === 'out_of_stock') return name + ' şu anda stokta yok.';
    if (row.reason === 'product_inactive') return name + ' şu anda satışta değil.';
    if (row.reason === 'product_not_found') return name + ' için stok kaydı bulunamadı.';
    if (row.message && row.message !== 'Stokta') return name + ': ' + row.message;
    return name + ' için stok doğrulanamadı.';
  }
  function formatCartStockMessage(blockedRows, cartItems) {
    var rows = (blockedRows || []).filter(Boolean);
    if (!rows.length) return 'Sepetinizde stokta olmayan ürünler var.';
    var bySlug = {};
    (cartItems || []).forEach(function (item) { bySlug[cartItemSlug(item)] = item; });
    return rows.map(function (row) { return formatItemStockMessage(row, bySlug[slugFrom(row.product_slug || row.slug)]); }).join(' ');
  }
  function mergeCheckItemIntoMap(item) {
    var slug = slugFrom(item.product_slug || item.slug);
    var existing = inventoryMap.get(slug) || {};
    inventoryMap.set(slug, Object.assign({}, existing, {
      product_slug: slug,
      available_stock: item.available_stock != null ? item.available_stock : (item.available_quantity != null ? item.available_quantity : existing.available_stock),
      in_stock: item.can_purchase,
      low_stock: existing.low_stock,
      status: item.inventory_status || existing.status || 'active',
      allow_backorder: item.allow_backorder != null ? item.allow_backorder : existing.allow_backorder
    }));
  }
  function getCartBlockingItems(items) {
    return (items || []).filter(function (item) {
      var slug = cartItemSlug(item);
      var qty = Number(item.qty || item.quantity || 1);
      var buy = canBuy(slug, qty);
      return buy.ok === false && !buy.unknown;
    });
  }
  function getCartStockState(items) {
    var blocked = getCartBlockingItems(items || []);
    return {
      blocked: blocked.length > 0,
      items: blocked,
      message: blocked.length ? 'Sepetinizde stokta olmayan ürünler var.' : '',
      actionMessage: 'Ödemeye geçmeden önce stokta olmayan ürünleri sepetten kaldırın.'
    };
  }
  async function validateCartPurchasable(items) {
    var cartItems = (items || []).map(function (item) {
      return {
        product_slug: cartItemSlug(item),
        quantity: Number(item.qty || item.quantity || 1),
        name: item.name || item.product_name || ''
      };
    }).filter(function (item) { return item.product_slug; });
    if (!cartItems.length) {
      return { ok: false, blocked: true, message: 'Sepetiniz boş.' };
    }
    try {
      await loadInventory(cartItems.map(function (item) { return item.product_slug; }), { force: true });
      var data = await checkItems(cartItems);
      var blockedRows = (data.items || []).filter(function (row) { return row && row.can_purchase === false; });
      if (blockedRows.length || data.can_purchase === false) {
        return {
          ok: false,
          blocked: true,
          message: formatCartStockMessage(blockedRows, items),
          actionMessage: 'Ödemeye geçmeden önce stokta olmayan ürünleri sepetten kaldırın.',
          items: blockedRows
        };
      }
      return { ok: true, blocked: false };
    } catch (_) {
      return {
        ok: false,
        blocked: true,
        message: 'Stok bilgisi doğrulanamadı. Lütfen sepeti yenileyin.',
        actionMessage: 'Ödemeye geçmeden önce stok durumunu doğrulayıp tekrar deneyin.'
      };
    }
  }
  function favoriteStockState(slug) {
    slug = slugFrom(slug);
    var inv = getInventory(slug);
    if (!inv) return { sellable: false, label: 'Kontrol ediliyor', className: 'is-unknown', buttonLabel: 'Bekliyor' };
    if (inv._missing || inv.status === 'missing') return { sellable: false, label: 'Stokta yok', className: 'is-out', buttonLabel: 'Stokta yok' };
    if (inv.status !== 'active') return { sellable: false, label: 'Stokta yok', className: 'is-out', buttonLabel: 'Stokta yok' };
    if (!inv.allow_backorder && Number(inv.available_stock || 0) <= 0) return { sellable: false, label: 'Stokta yok', className: 'is-out', buttonLabel: 'Stokta yok' };
    if (inv.low_stock) return { sellable: true, label: 'Son ürünler', className: 'is-low', buttonLabel: 'Sepete ekle' };
    return { sellable: true, label: 'Stokta', className: 'is-in', buttonLabel: 'Sepete ekle' };
  }
  function mountRestockForm(slug) {
    var actions = document.querySelector('.pdp5-actions');
    if (!actions || document.getElementById('csRestockForm')) return;
    var name = document.querySelector('.pdp5-info h1')?.textContent?.trim() || 'Bu ürün';
    actions.insertAdjacentHTML('afterend', '<form class="cs-restock-form" id="csRestockForm" novalidate><label><span>Stok bildirimi</span><input type="email" name="email" placeholder="E-posta adresin" autocomplete="email" required></label><button class="btn btn-secondary" type="submit">Gelince Haber Ver</button><p id="csRestockStatus" aria-live="polite">' + esc(name) + ' yeniden geldiğinde haber verelim.</p></form>');
    prefillEmail();
  }
  async function prefillEmail() {
    var input = document.querySelector('#csRestockForm input[name="email"]');
    if (!input || input.value) return;
    try {
      if (window.cosmoskinSupabase?.auth?.getUser) {
        var result = await window.cosmoskinSupabase.auth.getUser();
        if (result?.data?.user?.email) input.value = result.data.user.email;
      }
    } catch {}
  }
  async function submitRestock(form) {
    var status = document.getElementById('csRestockStatus');
    var email = form.email.value.trim().toLowerCase();
    var slug = currentSlug();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      if (status) status.textContent = 'Geçerli bir e-posta adresi gir.';
      return;
    }
    var headers = { 'content-type': 'application/json' };
    try {
      if (window.cosmoskinSupabase?.auth?.getSession) {
        var session = await window.cosmoskinSupabase.auth.getSession();
        var token = session?.data?.session?.access_token;
        if (token) headers.authorization = 'Bearer ' + token;
      }
    } catch {}
    var btn = form.querySelector('button');
    if (btn) btn.disabled = true;
    if (status) status.textContent = 'Bildirim oluşturuluyor...';
    try {
      var res = await fetch(API_BASE + '/restock-alerts', { method: 'POST', headers: headers, body: JSON.stringify({ email: email, product_slug: slug }) });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Şu anda bildirimi oluşturamadık. Lütfen biraz sonra tekrar dene.');
      if (status) status.textContent = data.already_registered ? COPY.restockDuplicate : (data.message || COPY.restockSuccess);
    } catch (error) {
      if (status) status.textContent = error.message || 'Şu anda bildirimi oluşturamadık. Lütfen biraz sonra tekrar dene.';
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  function bindRestock() {
    document.addEventListener('submit', function (event) {
      var form = event.target.closest('#csRestockForm');
      if (!form) return;
      event.preventDefault();
      submitRestock(form);
    });
  }
  function init() {
    bindRestock();
    loadInventory(collectSlugs(document));
    document.addEventListener('cosmoskin:products-updated', function (event) { loadInventory(collectSlugs(event.target || document)); });
    window.addEventListener('cosmoskin:cart-updated', function () { loadInventory(collectSlugs(document), { force: true }); });
  }

  window.COSMOSKIN_STOCK = {
    loadInventory: loadInventory,
    checkItems: checkItems,
    validateAdd: validateAdd,
    validateCartPurchasable: validateCartPurchasable,
    getCartBlockingItems: getCartBlockingItems,
    getCartStockState: getCartStockState,
    favoriteStockState: favoriteStockState,
    stockQuantityLimit: stockQuantityLimit,
    canBuy: canBuy,
    getInventory: getInventory,
    formatItemStockMessage: formatItemStockMessage,
    formatCartStockMessage: formatCartStockMessage,
    getServiceState: function () { return { state: serviceState, error: serviceError }; },
    copy: COPY
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
