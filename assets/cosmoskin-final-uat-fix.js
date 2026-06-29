(function () {
  'use strict';
  var COUPON_KEYS = ['cosmoskin_coupon_code', 'cosmoskin_checkout_coupon', 'cosmoskin_coupon_state_v1'];

  function clearLegacyCouponStorage() {
    COUPON_KEYS.forEach(function (key) {
      try { window.localStorage && localStorage.removeItem(key); } catch (_) {}
      try { window.sessionStorage && sessionStorage.removeItem(key); } catch (_) {}
    });
  }

  function closestPasswordInput(button) {
    var selector = button.getAttribute('data-target') || button.getAttribute('data-password-target') || button.getAttribute('aria-controls') || '';
    if (selector) {
      try {
        var explicit = selector.charAt(0) === '#' ? document.querySelector(selector) : document.getElementById(selector);
        if (explicit) return explicit;
      } catch (_) {}
    }
    var wrap = button.closest('.password-wrap, .cs-auth-field--password, .cs-auth-password-field, label, .form-group, .auth-form-field');
    if (wrap) {
      var inWrap = wrap.querySelector('input[type="password"], input[type="text"][data-password-field], input[data-password-field]');
      if (inWrap) return inWrap;
    }
    var previous = button.previousElementSibling;
    while (previous) {
      if (previous.matches && previous.matches('input[type="password"], input[type="text"][data-password-field], input[data-password-field]')) return previous;
      previous = previous.previousElementSibling;
    }
    return null;
  }

  function labelToggle(button, shown) {
    button.setAttribute('aria-pressed', shown ? 'true' : 'false');
    button.setAttribute('aria-label', shown ? 'Parolayı gizle' : 'Parolayı göster');
    var text = button.querySelector('[data-password-toggle-label]');
    if (text) text.textContent = shown ? 'Gizle' : 'Göster';
    else if (!button.querySelector('svg')) button.textContent = shown ? 'Gizle' : 'Göster';
  }

  function ensurePasswordButtons(root) {
    root = root || document;
    var inputs = root.querySelectorAll ? root.querySelectorAll('#loginPassword, #registerPassword, input[name="password"], input[name="password_confirm"], input[type="password"][autocomplete*="password"]') : [];
    Array.prototype.forEach.call(inputs, function (input) {
      if (!input || input.dataset.passwordField === '1') return;
      input.dataset.passwordField = '1';
      var parent = input.parentElement;
      if (!parent) return;
      if (!parent.classList.contains('password-wrap') && !parent.classList.contains('cs-auth-field--password')) parent.classList.add('password-wrap');
      if (parent.querySelector('[data-toggle-password], .password-toggle')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'password-toggle';
      btn.setAttribute('data-toggle-password', 'true');
      btn.setAttribute('aria-controls', input.id || '');
      btn.innerHTML = '<span data-password-toggle-label>Göster</span>';
      parent.appendChild(btn);
    });
  }

  document.addEventListener('click', function (event) {
    var passwordBtn = event.target.closest && event.target.closest('[data-toggle-password], .password-toggle');
    if (passwordBtn) {
      event.preventDefault();
      event.stopPropagation();
      var input = closestPasswordInput(passwordBtn);
      if (!input) return;
      var nextType = input.type === 'password' ? 'text' : 'password';
      input.type = nextType;
      input.dataset.passwordField = '1';
      labelToggle(passwordBtn, nextType === 'text');
      try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
      return;
    }

    if (event.target.closest && (event.target.closest('#cartBtn') || event.target.closest('[data-cart-open]') || event.target.closest('[data-add-cart]'))) {
      setTimeout(function () {
        var items = document.querySelector('#cartDrawer #cartItems, #cartDrawer .cart-items');
        if (items) items.scrollTop = 0;
      }, 40);
    }

    if (event.target.closest && event.target.closest('#csCouponClear, [data-clear-checkout-coupon]')) {
      clearLegacyCouponStorage();
    }
  }, true);

  document.addEventListener('input', function (event) {
    if (event.target && event.target.id === 'csCouponInput' && !String(event.target.value || '').trim()) clearLegacyCouponStorage();
  }, true);

  function installSearchState() {
    Array.prototype.forEach.call(document.querySelectorAll('.site-search-form:not(.site-search-form--mobile)'), function (form) {
      var input = form.querySelector('.site-search-input');
      if (!input || form.dataset.uatSearchPatched === '1') return;
      form.dataset.uatSearchPatched = '1';
      input.addEventListener('focus', function () { form.classList.add('is-search-active'); });
      input.addEventListener('blur', function () { if (!input.value) setTimeout(function () { form.classList.remove('is-search-active'); }, 120); });
      form.addEventListener('mouseenter', function () { form.classList.add('is-search-active'); });
      form.addEventListener('mouseleave', function () { if (document.activeElement !== input && !input.value) form.classList.remove('is-search-active'); });
    });
  }

  function run() {
    ensurePasswordButtons(document);
    installSearchState();
    if (document.body && document.body.classList.contains('checkout-premium-page')) {
      var input = document.getElementById('csCouponInput');
      if (input && !input.value) clearLegacyCouponStorage();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes || [], function (node) { if (node.nodeType === 1) ensurePasswordButtons(node); }); });
    installSearchState();
  });
  try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}

  document.addEventListener('cosmoskin:cart-updated', function () {
    setTimeout(function () { var items = document.querySelector('#cartDrawer #cartItems, #cartDrawer .cart-items'); if (items) items.scrollTop = 0; }, 20);
  });
  window.addEventListener('cosmoskin:cart-updated', function () {
    setTimeout(function () { var items = document.querySelector('#cartDrawer #cartItems, #cartDrawer .cart-items'); if (items) items.scrollTop = 0; }, 20);
  });

  window.COSMOSKIN_UAT_CLEAR_COUPON = clearLegacyCouponStorage;
})();
