
(function(){
  function parseBundleItems(button){
    try {
      return JSON.parse(button.getAttribute('data-bundle-items') || '[]');
    } catch (error) {
      return [];
    }
  }

  function setFeedback(button, message, type){
    const card = button.closest('.routine-bundle');
    const feedback = card ? card.querySelector('.routine-bundle__feedback') : null;
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.classList.remove('is-success', 'is-error');
    if (type) feedback.classList.add(type);
  }

  function addBundle(button){
    const items = parseBundleItems(button);
    if (!items.length) {
      setFeedback(button, 'Bu rutin için ürün bilgisi bulunamadı.', 'is-error');
      return;
    }

    if (window.COSMOSKIN_CART_API?.addItems) {
      window.COSMOSKIN_CART_API.addItems(items, { openDrawer: true });
    } else {
      document.dispatchEvent(new CustomEvent('cosmoskin:add-bundle', { detail: { items } }));
    }

    const totalQty = items.reduce((sum, item) => sum + Math.max(1, Number(item.qty || 1)), 0);
    setFeedback(button, `${totalQty} ürün sepete eklendi.`, 'is-success');
  }

  document.addEventListener('click', function(event){
    const button = event.target.closest('[data-add-bundle]');
    if (!button) return;
    event.preventDefault();
    addBundle(button);
  });
})();
