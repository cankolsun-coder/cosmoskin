(() => {
  'use strict';

  const TOKEN_KEY = 'cosmoskin_admin_session_token';
  const EXPIRY_KEY = 'cosmoskin_admin_session_expires_at';
  const LEGACY_KEY_PARTS = [
    ['cosmoskin', 'admin', 'token', 'session'],
    ['cosmoskin', 'admin', 'token'],
  ];
  const SESSION_END_MESSAGE = 'Admin oturumu geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.';
  const originalFetch = window.fetch.bind(window);
  const originalSetItem = Storage.prototype.setItem;
  const pendingMutations = new Map();
  let exchangePromise = null;
  let lastActionButton = null;
  let authMounted = false;
  let observerMounted = false;

  function legacyKeys() {
    return LEGACY_KEY_PARTS.map((parts) => parts.join('_'));
  }

  function removeLegacyKeys() {
    legacyKeys().forEach((key) => {
      try { sessionStorage.removeItem(key); } catch (_) {}
      try { localStorage.removeItem(key); } catch (_) {}
    });
  }

  function adminUrl(input) {
    try {
      const value = typeof input === 'string' ? input : input?.url;
      return new URL(value, window.location.origin);
    } catch {
      return null;
    }
  }

  function isAdminApi(url) {
    return url && url.origin === window.location.origin && (
      url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/api/reviews/admin')
    );
  }

  function isSignedToken(value) {
    return String(value || '').startsWith('v1.');
  }

  function expirationFromToken(token) {
    if (!isSignedToken(token)) return 0;
    const parts = String(token || '').split('.');
    const seconds = Number(parts[1]);
    return Number.isFinite(seconds) ? seconds * 1000 : 0;
  }

  function getExpiryMs() {
    const stored = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const fromToken = expirationFromToken(sessionStorage.getItem(TOKEN_KEY) || '');
    if (fromToken) originalSetItem.call(sessionStorage, EXPIRY_KEY, String(fromToken));
    return fromToken;
  }

  function sessionExpired() {
    const expiresAt = getExpiryMs();
    return Boolean(expiresAt && expiresAt <= Date.now());
  }

  function getSessionToken() {
    if (sessionExpired()) {
      clearSession('Admin oturumunun süresi doldu. Lütfen tekrar giriş yapın.');
      return '';
    }
    const token = sessionStorage.getItem(TOKEN_KEY) || '';
    return isSignedToken(token) ? token : '';
  }

  function storeSignedSession(token, expiresAt) {
    if (!isSignedToken(token)) throw new Error('Geçersiz admin session token.');
    originalSetItem.call(sessionStorage, TOKEN_KEY, token);
    const expiryMs = expiresAt ? Date.parse(expiresAt) : expirationFromToken(token);
    if (expiryMs) originalSetItem.call(sessionStorage, EXPIRY_KEY, String(expiryMs));
    removeLegacyKeys();
    syncTokenInputs();
    mountLogoutButton();
    closeLoginPanel();
    document.dispatchEvent(new CustomEvent('cosmoskin:admin-authenticated', {
      detail: { expiresAt: expiryMs || null },
    }));
    return token;
  }

  function clearSession(message = '') {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
    try { sessionStorage.removeItem(EXPIRY_KEY); } catch (_) {}
    removeLegacyKeys();
    syncTokenInputs();
    if (message) {
      document.dispatchEvent(new CustomEvent('cosmoskin:admin-session-ended', { detail: { message } }));
      const status = document.querySelector('#csAdminRuntimeStatus, [id$="LoginStatus"], #adminLoginStatus, #loginError');
      if (status) status.textContent = message;
    }
  }

  async function exchangeRawToken(rawToken) {
    const cleanToken = String(rawToken || '').trim();
    if (!cleanToken) throw new Error('Admin token gerekli.');
    if (isSignedToken(cleanToken)) return storeSignedSession(cleanToken);
    if (exchangePromise) return exchangePromise;

    exchangePromise = (async () => {
      const response = await originalFetch('/api/admin/session', {
        method: 'POST',
        headers: { 'x-admin-token': cleanToken, Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.token) {
        clearSession();
        throw new Error(payload.error || 'Admin oturumu başlatılamadı.');
      }
      return storeSignedSession(payload.token, payload.expiresAt);
    })().finally(() => { exchangePromise = null; });

    return exchangePromise;
  }

  function bodyFingerprint(body) {
    if (typeof body === 'string') return body.slice(0, 2000);
    if (body instanceof URLSearchParams) return body.toString().slice(0, 2000);
    return body ? Object.prototype.toString.call(body) : '';
  }

  function lockButton(button) {
    if (!(button instanceof HTMLButtonElement) || button.disabled) return () => {};
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-admin-loading');
    return () => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.classList.remove('is-admin-loading');
    };
  }

  async function authFetch(input, init = {}) {
    const url = adminUrl(input);
    if (!isAdminApi(url) || url.pathname === '/api/admin/session') {
      return originalFetch(input, init);
    }

    if (sessionExpired()) {
      clearSession('Admin oturumunun süresi doldu. Lütfen tekrar giriş yapın.');
      showLoginPanel('Admin oturumunun süresi doldu. Lütfen tekrar giriş yapın.');
      throw new Error('Admin oturumunun süresi doldu.');
    }

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    let supplied = String(headers.get('x-admin-token') || '').trim();
    let token = getSessionToken();

    if (supplied && !isSignedToken(supplied)) {
      token = await exchangeRawToken(supplied);
    } else if (isSignedToken(supplied)) {
      token = storeSignedSession(supplied);
    }

    if (!token) {
      showLoginPanel('Devam etmek için admin token ile giriş yapın.');
      throw new Error('Admin oturumu gerekli.');
    }

    headers.set('x-admin-token', token);
    headers.set('Accept', 'application/json');
    if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const fingerprint = isMutation ? `${method}:${url.pathname}:${bodyFingerprint(init.body)}` : '';
    if (isMutation && pendingMutations.has(fingerprint)) {
      throw new Error('Bu işlem zaten devam ediyor. Lütfen tamamlanmasını bekleyin.');
    }

    const actionButton = isMutation ? lastActionButton : null;
    lastActionButton = null;
    const unlock = lockButton(actionButton);
    const requestInit = { ...init, headers, cache: 'no-store', credentials: 'same-origin' };
    const operation = originalFetch(input, requestInit);
    if (isMutation) pendingMutations.set(fingerprint, operation);

    document.dispatchEvent(new CustomEvent('cosmoskin:admin-request-start', {
      detail: { method, path: url.pathname, mutation: isMutation },
    }));

    try {
      const response = await operation;
      if (response.status === 401 || response.status === 403) {
        clearSession(SESSION_END_MESSAGE);
        showLoginPanel(SESSION_END_MESSAGE);
      }
      document.dispatchEvent(new CustomEvent('cosmoskin:admin-request-end', {
        detail: { method, path: url.pathname, mutation: isMutation, ok: response.ok, status: response.status },
      }));
      return response;
    } finally {
      if (isMutation) pendingMutations.delete(fingerprint);
      unlock();
    }
  }

  window.fetch = authFetch;

  document.addEventListener('click', (event) => {
    const logout = event.target.closest('[data-admin-logout], #inventoryLogout, #logoutBtn');
    if (logout) {
      event.preventDefault();
      clearSession('Çıkış yapıldı. Tekrar işlem yapmak için admin token ile giriş yapın.');
      showLoginPanel('Çıkış yapıldı. Tekrar işlem yapmak için admin token ile giriş yapın.');
      return;
    }
    const button = event.target.closest('button, [role="button"]');
    if (button) lastActionButton = button;
  }, true);

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    if (this === sessionStorage && key === TOKEN_KEY) {
      const next = String(value || '').trim();
      if (!next) return;
      if (isSignedToken(next)) {
        originalSetItem.call(this, key, next);
        const expiresAt = expirationFromToken(next);
        if (expiresAt) originalSetItem.call(this, EXPIRY_KEY, String(expiresAt));
        return;
      }
      exchangeRawToken(next).catch((error) => {
        clearSession(error.message || SESSION_END_MESSAGE);
        showLoginPanel(error.message || SESSION_END_MESSAGE);
      });
      return;
    }
    originalSetItem.call(this, key, value);
  };

  function tokenInputs() {
    return Array.from(document.querySelectorAll([
      '#dashToken', '#inventoryToken', '#adminToken', '#customerToken', '#couponAdminToken',
      '#tokenInput', '[data-admin-token]', 'input[placeholder="ADMIN_TOKEN"]',
      'input[placeholder="Cloudflare ADMIN_TOKEN"]', 'input[type="password"][autocomplete="off"]',
    ].join(','))).filter((input) => input.id !== 'csAdminRuntimeToken');
  }

  function hideLegacyTokenFields() {
    tokenInputs().forEach((input) => {
      const label = input.closest('label');
      if (label) {
        label.classList.add('cs-admin-token-field-hidden');
        label.setAttribute('aria-hidden', 'true');
      } else {
        input.classList.add('cs-admin-token-field-hidden');
        input.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function syncTokenInputs() {
    const token = getSessionToken();
    tokenInputs().forEach((input) => {
      try { input.value = token; } catch (_) {}
    });
  }

  function closeLoginPanel() {
    const panel = document.getElementById('csAdminRuntimeLogin');
    if (panel) panel.remove();
    document.documentElement.classList.remove('cs-admin-auth-open');
    document.body.classList.remove('cs-admin-auth-open');
  }

  function loginPanelMarkup(message = '') {
    return `
      <div class="cs-admin-runtime-login" id="csAdminRuntimeLogin" role="dialog" aria-modal="true" aria-labelledby="csAdminRuntimeTitle">
        <section class="cs-admin-runtime-card">
          <p class="cs-kicker">COSMOSKIN Admin</p>
          <h2 id="csAdminRuntimeTitle">Güvenli admin girişi</h2>
          <p>Admin token yalnızca güvenli oturum başlatmak için kullanılır. Sayfalar arasında tekrar token girmen gerekmez.</p>
          <form id="csAdminRuntimeForm" autocomplete="off">
            <label for="csAdminRuntimeToken">Admin Token</label>
            <input id="csAdminRuntimeToken" type="password" autocomplete="off" placeholder="ADMIN_TOKEN" required />
            <button class="cs-btn cs-btn-dark" type="submit">Admin Oturumu Başlat</button>
          </form>
          <p class="cs-admin-runtime-status" id="csAdminRuntimeStatus" aria-live="polite">${escapeHtml(message || 'Token sadece bu tarayıcı oturumu için kısa süreli imzalı session’a çevrilir.')}</p>
        </section>
      </div>`;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function showLoginPanel(message = '') {
    if (getSessionToken()) return;
    let panel = document.getElementById('csAdminRuntimeLogin');
    if (!panel) {
      document.body.insertAdjacentHTML('afterbegin', loginPanelMarkup(message));
      panel = document.getElementById('csAdminRuntimeLogin');
      const input = document.getElementById('csAdminRuntimeToken');
      window.setTimeout(() => input?.focus(), 50);
    }
    const status = document.getElementById('csAdminRuntimeStatus');
    if (status && message) status.textContent = message;
    document.documentElement.classList.add('cs-admin-auth-open');
    document.body.classList.add('cs-admin-auth-open');
  }

  async function requireAuth(options = {}) {
    if (getSessionToken()) return true;
    if (options.showLogin !== false) showLoginPanel(options.message || 'Devam etmek için admin token ile giriş yapın.');
    return false;
  }

  function mountLogoutButton() {
    if (!getSessionToken()) return;
    if (document.querySelector('[data-admin-logout]')) return;
    const topbar = document.querySelector('.cs-admin-topbar');
    if (!topbar) return;
    let actions = topbar.querySelector('.cs-admin-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'cs-admin-actions';
      topbar.appendChild(actions);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cs-btn cs-btn-ghost cs-admin-logout-btn';
    button.setAttribute('data-admin-logout', '');
    button.textContent = 'Çıkış Yap';
    actions.appendChild(button);
  }

  async function handleRuntimeLogin(event) {
    event.preventDefault();
    const input = document.getElementById('csAdminRuntimeToken');
    const status = document.getElementById('csAdminRuntimeStatus');
    const button = event.target.querySelector('button[type="submit"]');
    const rawToken = String(input?.value || '').trim();
    if (!rawToken) {
      if (status) status.textContent = 'Admin token gerekli.';
      return;
    }
    const unlock = lockButton(button);
    try {
      if (status) status.textContent = 'Admin oturumu başlatılıyor...';
      await exchangeRawToken(rawToken);
      if (status) status.textContent = 'Admin oturumu başlatıldı. Sayfa yenileniyor...';
      window.setTimeout(() => window.location.reload(), 120);
    } catch (error) {
      if (status) status.textContent = error.message || 'Admin oturumu başlatılamadı.';
    } finally {
      unlock();
    }
  }

  function mountDomObserver() {
    if (observerMounted || !document.body) return;
    observerMounted = true;
    const observer = new MutationObserver(() => {
      hideLegacyTokenFields();
      syncTokenInputs();
      mountLogoutButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    removeLegacyKeys();
    hideLegacyTokenFields();
    mountDomObserver();
    if (getSessionToken()) {
      syncTokenInputs();
      mountLogoutButton();
      closeLoginPanel();
      document.dispatchEvent(new CustomEvent('cosmoskin:admin-authenticated', { detail: { resumed: true } }));
    } else {
      showLoginPanel();
    }
    if (!authMounted) {
      authMounted = true;
      document.addEventListener('submit', (event) => {
        if (event.target && event.target.id === 'csAdminRuntimeForm') handleRuntimeLogin(event);
      });
      document.addEventListener('cosmoskin:admin-session-ended', (event) => {
        if (!getSessionToken()) showLoginPanel(event.detail?.message || SESSION_END_MESSAGE);
      });
    }
  }

  window.setInterval(() => {
    if (sessionExpired()) clearSession('Admin oturumunun süresi doldu. Lütfen tekrar giriş yapın.');
  }, 30_000);

  window.COSMOSKIN_ADMIN = Object.freeze({
    login: exchangeRawToken,
    logout: () => {
      clearSession('Çıkış yapıldı. Tekrar işlem yapmak için admin token ile giriş yapın.');
      showLoginPanel('Çıkış yapıldı. Tekrar işlem yapmak için admin token ile giriş yapın.');
    },
    getSessionToken,
    isAuthenticated: () => Boolean(getSessionToken()),
    authFetch,
    requireAuth,
    clearSession,
  });

  window.COSMOSKIN_ADMIN_SESSION = Object.freeze({
    clear: clearSession,
    exchange: exchangeRawToken,
    isExpired: sessionExpired,
    get token() { return getSessionToken(); },
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
