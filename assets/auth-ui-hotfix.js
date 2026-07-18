(function () {
  'use strict';

  if (window.__COSMOSKIN_AUTH_UI_HOTFIX__) return;
  window.__COSMOSKIN_AUTH_UI_HOTFIX__ = true;

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function saveReturnTo() {
    try {
      var current = window.location.pathname + window.location.search + window.location.hash;
      if (!/^\/auth\//.test(window.location.pathname)) sessionStorage.setItem('cosmoskin_return_to', current);
    } catch (error) {}
  }

  function resolvePanel(tab) {
    return tab === 'register' || tab === 'signup' || tab === 'registerPanel' ? 'registerPanel' : 'loginPanel';
  }

  function switchPanel(panelId) {
    var modal = qs('#accountModal');
    qsa('.tab-panel', modal || document).forEach(function (panel) {
      var active = panel.id === panelId;
      panel.classList.toggle('active', active);
      if (active) panel.removeAttribute('hidden');
    });
    qsa('.tab-btn', modal || document).forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === panelId);
    });
  }

  function closeAccountDrawer(keepBackdrop) {
    var drawer = qs('#accountDrawer');
    var backdrop = qs('#backdrop');
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (!keepBackdrop && backdrop) backdrop.classList.remove('show');
  }

  function isMobileV1() {
    return document.body && document.body.classList.contains('cs-mobile-v1-active');
  }

  function openAccountDrawer() {
    // Mobile v1 already has bottom-nav account + auth sheet; skip legacy teaser drawer.
    if (isMobileV1()) {
      openAuth('loginPanel');
      return;
    }
    var drawer = qs('#accountDrawer');
    var backdrop = qs('#backdrop');
    if (!drawer) return;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.classList.add('show');
    document.body.classList.add('modal-open');
  }

  function closeCartDrawer(keepBackdrop) {
    var drawer = qs('#cartDrawer');
    var backdrop = qs('#backdrop');
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (!keepBackdrop && backdrop) backdrop.classList.remove('show');
  }

  function openAuth(tab) {
    var panelId = resolvePanel(tab);
    var modal = qs('#accountModal');
    if (!modal) {
      var next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      window.location.href = '/index.html?auth=' + (panelId === 'registerPanel' ? 'register' : 'login') + '&next=' + next;
      return;
    }
    // Never open auth under/alongside cart; keep viewport scroll position.
    closeCartDrawer(true);
    closeAccountDrawer(true);
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    var backdrop = qs('#backdrop');
    if (backdrop && backdrop.parentElement !== document.body) document.body.appendChild(backdrop);
    modal.classList.add('open', 'show');
    modal.removeAttribute('hidden');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.zIndex = isMobileV1() ? '6800' : '370';
    if (backdrop) backdrop.classList.add('show');
    document.body.classList.add('modal-open');
    switchPanel(panelId);
    window.setTimeout(function () {
      var input = qs('#' + panelId + ' input', modal);
      if (input) {
        try { input.focus({ preventScroll: true }); }
        catch (e) { input.focus(); }
      }
    }, 90);
  }


  function ensurePasswordToggle(inputId) {
    var input = qs('#' + inputId);
    if (!input || qs('[data-toggle-password="' + inputId + '"]')) return;
    var wrap = input.closest('.password-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'password-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle';
    button.setAttribute('data-toggle-password', inputId);
    button.setAttribute('aria-label', 'Şifreyi göster');
    button.textContent = 'Göster';
    wrap.appendChild(button);
  }

  function ensureAllPasswordToggles() {
    ensurePasswordToggle('loginPassword');
    ensurePasswordToggle('registerPassword');
  }

  window.COSMOSKIN_OPEN_AUTH = window.COSMOSKIN_OPEN_AUTH || function (tab) {
    saveReturnTo();
    openAuth(tab || 'loginPanel');
  };

  document.addEventListener('click', function (event) {
    var passwordButton = event.target.closest && event.target.closest('[data-toggle-password]');
    if (passwordButton) {
      event.preventDefault();
      event.stopPropagation();
      var id = passwordButton.getAttribute('data-toggle-password');
      var input = id ? document.getElementById(id) : qs('input', passwordButton.closest('.password-wrap'));
      if (!input) return;
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      passwordButton.textContent = show ? 'Gizle' : 'Göster';
      passwordButton.setAttribute('aria-label', show ? 'Şifreyi gizle' : 'Şifreyi göster');
      passwordButton.setAttribute('aria-pressed', String(show));
      input.focus({ preventScroll: true });
      return;
    }

    var authButton = event.target.closest && event.target.closest('[data-open-auth]');
    if (authButton) {
      event.preventDefault();
      event.stopPropagation();
      saveReturnTo();
      openAuth(authButton.getAttribute('data-auth-tab') || authButton.dataset.authTab || 'loginPanel');
      return;
    }

    var accountButton = event.target.closest && event.target.closest('#accountBtn');
    if (accountButton) {
      event.preventDefault();
      event.stopPropagation();
      var client = window.cosmoskinSupabase;
      if (client && client.auth && typeof client.auth.getUser === 'function') {
        client.auth.getUser().then(function (result) {
          if (result && result.data && result.data.user) window.location.href = '/account/profile.html';
          else openAccountDrawer();
        }).catch(openAccountDrawer);
      } else if (document.body.classList.contains('user-is-authenticated')) {
        window.location.href = '/account/profile.html';
      } else {
        openAccountDrawer();
      }
    }
  }, true);

  document.addEventListener('cosmoskin:open-auth', function (event) {
    saveReturnTo();
    openAuth(event.detail && event.detail.tab || 'loginPanel');
  });
  document.addEventListener('cosmoskin:open-auth-modal', function (event) {
    saveReturnTo();
    openAuth(event.detail && event.detail.tab || 'loginPanel');
  });

  function bootPasswordToggles() {
    ensureAllPasswordToggles();
    qsa('[data-toggle-password]').forEach(function (button) { button.setAttribute('type', 'button'); });
  }

  bootPasswordToggles();
  try {
    new MutationObserver(function () { bootPasswordToggles(); }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (error) {}

  document.addEventListener('DOMContentLoaded', function () {
    bootPasswordToggles();
    try {
      var params = new URLSearchParams(window.location.search);
      var mode = params.get('auth') || (params.get('login') === '1' ? 'login' : '');
      var next = params.get('next');
      if (next && /^\//.test(next)) sessionStorage.setItem('cosmoskin_return_to', next);
      if (mode === 'login' || mode === 'register' || mode === 'signup') {
        window.setTimeout(function () { openAuth(mode === 'register' || mode === 'signup' ? 'registerPanel' : 'loginPanel'); }, 180);
      }
    } catch (error) {}
  });
})();
