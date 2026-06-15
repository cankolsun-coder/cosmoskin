(function () {
  'use strict';

  var API_BASE = (window.COSMOSKIN_CONFIG && window.COSMOSKIN_CONFIG.apiBase) || '/api';
  var inventoryMap = new Map();
  var loadingPromise = null;
  var COPY = {
    out: 'Şu anda stokta yok.',
    low: 'Son ürünler.',
    cta: 'Gelince Haber Ver.',
    restockSuccess: 'Ürün tekrar stokta olduğunda sana haber vereceğiz.',
    restockDuplicate: 'Bu ürün için stok bildirimi zaten oluşturulmuş.',
    unavailable: 'Bu ürün şu anda stokta yok. Favorilerine ekleyerek tekrar geldiğinde haber alabilirsin.',
    checkout: 'Sepetindeki bazı ürünlerin stoğu değişti. Lütfen sepetini kontrol et.',
    verifyFail: 'Stok bilgisi doğrulanamadı. Lütfen tekrar deneyin.'
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
    root.querySelectorAll('[data-add-cart], [data-cm-add-cart], [data-buy-now], [data-product-id], [data-product-slug], [data-favorite-id], [data-cm-stock-badge]').forEach(function (node) {
      slugs.push(slugFrom(node.getAttribute('data-add-cart') || node.getAttribute('data-cm-add-cart') || node.getAttribute('data-buy-now') || node.dataset.slug || node.dataset.id || node.dataset.productId || node.dataset.productSlug || node.dataset.favoriteId || ''));
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
    if (!inv) return { ok: false, unknown: true, message: COPY.verifyFail, available_stock: 0 };
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
    if (!inv) return { state: 'checking', label: 'Stok kontrol ediliyor', line: COPY.verifyFail };
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
    btn.dataset.inventoryChecked = inv ? 'true' : 'false';
    if (!inv) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('is-stock-disabled');
      if (!btn.classList.contains('cm-card-bag')) btn.textContent = 'Stok kontrol ediliyor';
      if (line) line.textContent = COPY.verifyFail;
      if (host) host.classList.add('is-out-of-stock');
    } else if (isOut(inv)) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('is-stock-disabled');
      btn.textContent = 'Stokta Yok';
      if (line) line.textContent = host && host.classList.contains('pdp5-purchase-card') ? 'Gelince haber almak için stok bildirimi oluşturabilirsin.' : 'Favorilerine ekle, tekrar geldiğinde haber verelim.';
      if (host) host.classList.add('is-out-of-stock');
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-disabled');
      btn.classList.remove('is-stock-disabled');
      if (/stokta yok|stok kontrol/i.test(btn.textContent.trim())) btn.textContent = defaultButtonText(btn);
      if (line) line.textContent = isLow(inv) ? COPY.low : '';
      if (host) host.classList.remove('is-out-of-stock');
    }
  }
  function renderPdpStock() {
    var slug = currentSlug();
    if (!slug) return;
    var inv = getInventory(slug);
    updateCustomStockSurfaces(slug, inv, document);
    var stock = document.querySelector('.pdp5-stock');
    if (stock) {
      stock.textContent = !inv ? 'Stok kontrol ediliyor' : (isOut(inv) ? 'Şu anda stokta yok' : (isLow(inv) ? 'Son ürünler' : 'Stokta'));
      stock.classList.toggle('is-out', !inv || isOut(inv));
      stock.classList.toggle('is-low', Boolean(inv && isLow(inv)));
    }
    var purchase = document.querySelector('.pdp5-purchase-card');
    if (purchase) purchase.classList.toggle('is-out-of-stock', !inv || isOut(inv));
    if (inv && isOut(inv)) mountRestockForm(slug);
  }
  function applyState(root) {
    (root || document).querySelectorAll('[data-add-cart], [data-cm-add-cart], [data-buy-now]').forEach(renderButtonState);
    renderPdpStock();
    window.dispatchEvent(new CustomEvent('cosmoskin:inventory-updated', { detail: { inventory: Array.from(inventoryMap.values()) } }));
  }
  async function loadInventory(slugs) {
    slugs = uniq(slugs || collectSlugs(document)).slice(0, 120);
    if (!slugs.length) return [];
    var missing = slugs.filter(function (slug) { return !inventoryMap.has(slug); });
    if (!missing.length) return Array.from(inventoryMap.values());
    loadingPromise = fetch(API_BASE + '/inventory?product_slugs=' + encodeURIComponent(missing.join(',')))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.ok === false) return [];
        (data.inventory || []).forEach(function (row) { inventoryMap.set(slugFrom(row.product_slug), row); });
        applyState(document);
        return data.inventory || [];
      })
      .catch(function () { applyState(document); return []; });
    return loadingPromise;
  }
  async function checkItems(items) {
    var body = { items: (items || []).map(function (item) { return { product_slug: slugFrom(item.product_slug || item.slug || item.id || item.product_id), quantity: Number(item.quantity || item.qty || 1) || 1 }; }) };
    var res = await fetch(API_BASE + '/inventory/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.ok === false) throw new Error(data.error || 'Stok kontrolü yapılamadı.');
    (data.items || []).forEach(function (item) {
      var slug = slugFrom(item.product_slug);
      var existing = inventoryMap.get(slug) || {};
      inventoryMap.set(slug, Object.assign({}, existing, { product_slug: slug, available_stock: item.available_stock, in_stock: item.can_purchase, low_stock: existing.low_stock, status: existing.status || 'active' }));
    });
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
    window.addEventListener('cosmoskin:cart-updated', function () { loadInventory(collectSlugs(document)); });
  }

  window.COSMOSKIN_STOCK = { loadInventory: loadInventory, checkItems: checkItems, validateAdd: validateAdd, canBuy: canBuy, getInventory: getInventory, copy: COPY };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
