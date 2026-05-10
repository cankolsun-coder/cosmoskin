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
    checkout: 'Sepetindeki bazı ürünlerin stoğu değişti. Lütfen sepetini kontrol et.'
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
  function getButtonSlug(btn) { return slugFrom(btn.dataset.slug || btn.dataset.id || btn.dataset.productSlug || btn.dataset.favoriteId || ''); }
  function currentSlug() {
    var main = document.querySelector('[data-product-slug]');
    if (main) return slugFrom(main.getAttribute('data-product-slug'));
    var match = location.pathname.match(/\/products\/([^/.]+)/);
    return match ? slugFrom(match[1]) : '';
  }
  function collectSlugs(root) {
    root = root || document;
    var slugs = [];
    root.querySelectorAll('[data-add-cart], [data-product-id], [data-product-slug], [data-favorite-id]').forEach(function (node) {
      slugs.push(slugFrom(node.dataset.slug || node.dataset.id || node.dataset.productId || node.dataset.productSlug || node.dataset.favoriteId || ''));
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
    if (!inv) return { ok: true, unknown: true };
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
  function productCardFor(btn) { return btn.closest('.product-card') || btn.closest('.pdp5-purchase-card') || btn.closest('.pdp-related-card') || btn.parentElement; }
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
  function renderButtonState(btn) {
    var slug = getButtonSlug(btn);
    var inv = getInventory(slug);
    if (!slug || !inv) return;
    var host = productCardFor(btn);
    var lineHost = btn.closest('.price-row') || btn.closest('.pdp5-actions') || host;
    var line = ensureLine(lineHost);
    btn.dataset.inventoryChecked = 'true';
    if (isOut(inv)) {
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
      if (btn.textContent.trim() === 'Stokta Yok') btn.textContent = 'Sepete Ekle';
      if (line) line.textContent = isLow(inv) ? COPY.low : '';
      if (host) host.classList.remove('is-out-of-stock');
    }
  }
  function renderPdpStock() {
    var slug = currentSlug();
    if (!slug) return;
    var inv = getInventory(slug);
    if (!inv) return;
    var stock = document.querySelector('.pdp5-stock');
    if (stock) {
      stock.textContent = isOut(inv) ? 'Şu anda stokta yok' : (isLow(inv) ? 'Son ürünler' : 'Stokta');
      stock.classList.toggle('is-out', isOut(inv));
      stock.classList.toggle('is-low', isLow(inv));
    }
    var purchase = document.querySelector('.pdp5-purchase-card');
    if (purchase) purchase.classList.toggle('is-out-of-stock', isOut(inv));
    if (isOut(inv)) mountRestockForm(slug);
  }
  function applyState(root) {
    (root || document).querySelectorAll('[data-add-cart]').forEach(renderButtonState);
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
      .catch(function () { return []; });
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
      return true;
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
