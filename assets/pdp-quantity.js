(() => {
  'use strict';
  const slug = window.location.pathname.split('/').pop().replace(/\.html$/i, '');
  const mainActions = document.querySelector('.pdp5-actions, .pdp-actions');
  if (!slug || !mainActions || document.querySelector('[data-pdp-quantity]')) return;

  let quantity = 1;
  let maxStock = 1;
  let inventoryUnavailable = false;
  const wrapper = document.createElement('div');
  wrapper.className = 'pdp-quantity-control';
  wrapper.dataset.pdpQuantity = '';
  wrapper.innerHTML = `
    <div class="pdp-quantity-control__copy">
      <strong>Adet</strong>
      <span data-pdp-quantity-note>Güncel stok kontrol ediliyor.</span>
    </div>
    <div class="pdp-quantity-stepper" role="group" aria-label="Ürün adedi">
      <button type="button" data-pdp-quantity-dec aria-label="Adedi azalt">−</button>
      <output data-pdp-quantity-value aria-live="polite">1</output>
      <button type="button" data-pdp-quantity-inc aria-label="Adedi artır">+</button>
    </div>`;
  mainActions.parentNode.insertBefore(wrapper, mainActions);

  const value = wrapper.querySelector('[data-pdp-quantity-value]');
  const note = wrapper.querySelector('[data-pdp-quantity-note]');
  const dec = wrapper.querySelector('[data-pdp-quantity-dec]');
  const inc = wrapper.querySelector('[data-pdp-quantity-inc]');

  function purchaseButtons() {
    return Array.from(document.querySelectorAll(`.pdp5-actions [data-add-cart], .pdp-actions [data-add-cart], #mobileStickyAddBtn[data-add-cart]`));
  }
  function sync() {
    quantity = Math.max(1, Math.min(Math.max(1, maxStock), quantity));
    value.value = String(quantity);
    value.textContent = String(quantity);
    dec.disabled = quantity <= 1;
    inc.disabled = quantity >= maxStock;
    purchaseButtons().forEach((button) => { button.dataset.quantity = String(quantity); });
    note.textContent = maxStock > 1 ? `En fazla ${maxStock} adet ekleyebilirsiniz.` : 'Bu ürün için 1 adet eklenebilir.';
  }
  function inventory() {
    return window.COSMOSKIN_STOCK?.getInventory?.(slug) || null;
  }
  function refreshLimit() {
    const row = inventory();
    if (!row) {
      maxStock = 1;
      note.textContent = window.COSMOSKIN_STOCK?.getServiceState?.()?.state === 'error'
        ? 'Stok hizmetine şu anda ulaşılamıyor.'
        : 'Güncel stok kontrol ediliyor.';
      sync();
      return;
    }
    const available = Math.max(0, Number(row.available_stock || 0));
    inventoryUnavailable = !row.active || (!row.allow_backorder && available <= 0);
    maxStock = row.allow_backorder ? 99 : Math.max(1, available);
    sync();
  }
  dec.addEventListener('click', () => { quantity -= 1; sync(); });
  inc.addEventListener('click', () => { quantity += 1; sync(); });
  window.addEventListener('cosmoskin:inventory-updated', refreshLimit);
  refreshLimit();
})();
