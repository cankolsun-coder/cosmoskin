(() => {
  'use strict';

  const TOKEN_KEY = 'cosmoskin_admin_token_session';
  const EXPIRY_KEY = 'cosmoskin_admin_session_expires_at';
  const originalFetch = window.fetch.bind(window);
  const pendingMutations = new Map();
  let exchangePromise = null;
  let lastActionButton = null;

  function adminUrl(input) {
    try {
      const value = typeof input === 'string' ? input : input?.url;
      return new URL(value, window.location.origin);
    } catch {
      return null;
    }
  }

  function isAdminApi(url) {
    return url && url.origin === window.location.origin && (url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/api/reviews/admin'));
  }

  function isSignedToken(value) {
    return String(value || '').startsWith('v1.');
  }

  function expirationFromToken(token) {
    if (!isSignedToken(token)) return 0;
    const parts = token.split('.');
    const seconds = Number(parts[1]);
    return Number.isFinite(seconds) ? seconds * 1000 : 0;
  }

  function clearSession(message = '') {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
    if (message) {
      document.dispatchEvent(new CustomEvent('cosmoskin:admin-session-ended', { detail: { message } }));
      const status = document.querySelector('[id$="LoginStatus"], #adminLoginStatus');
      if (status) status.textContent = message;
    }
  }

  function sessionExpired() {
    const expiresAt = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);
    return Boolean(expiresAt && expiresAt <= Date.now());
  }

  async function exchangeRawToken(rawToken) {
    if (exchangePromise) return exchangePromise;
    exchangePromise = (async () => {
      const response = await originalFetch('/api/admin/session', {
        method: 'POST',
        headers: { 'x-admin-token': rawToken, Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.token) {
        clearSession();
        throw new Error(payload.error || 'Admin oturumu başlatılamadı.');
      }
      sessionStorage.setItem(TOKEN_KEY, payload.token);
      const expiresAt = Date.parse(payload.expiresAt) || expirationFromToken(payload.token);
      if (expiresAt) sessionStorage.setItem(EXPIRY_KEY, String(expiresAt));
      return payload.token;
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

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button, [role="button"]');
    if (button) lastActionButton = button;
  }, true);

  window.fetch = async function securedAdminFetch(input, init = {}) {
    const url = adminUrl(input);
    if (!isAdminApi(url) || url.pathname === '/api/admin/session') {
      return originalFetch(input, init);
    }

    if (sessionExpired()) {
      clearSession('Admin oturumunun süresi doldu. Lütfen yeniden giriş yapın.');
      throw new Error('Admin oturumunun süresi doldu.');
    }

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    let token = headers.get('x-admin-token') || sessionStorage.getItem(TOKEN_KEY) || '';
    if (token && !isSignedToken(token)) token = await exchangeRawToken(token);
    if (token) headers.set('x-admin-token', token);
    headers.set('Accept', 'application/json');

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
      if (response.status === 401) clearSession('Admin oturumu geçersiz veya süresi dolmuş.');
      document.dispatchEvent(new CustomEvent('cosmoskin:admin-request-end', {
        detail: { method, path: url.pathname, mutation: isMutation, ok: response.ok, status: response.status },
      }));
      return response;
    } finally {
      if (isMutation) pendingMutations.delete(fingerprint);
      unlock();
    }
  };

  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function patchedSetItem(key, value) {
    originalSetItem.call(this, key, value);
    if (this === sessionStorage && key === TOKEN_KEY) {
      const expiresAt = expirationFromToken(value);
      if (expiresAt) originalSetItem.call(this, EXPIRY_KEY, String(expiresAt));
    }
  };

  window.setInterval(() => {
    if (sessionExpired()) clearSession('Admin oturumunun süresi doldu. Lütfen yeniden giriş yapın.');
  }, 30_000);

  window.COSMOSKIN_ADMIN_SESSION = Object.freeze({
    clear: clearSession,
    exchange: exchangeRawToken,
    isExpired: sessionExpired,
  });
})();
