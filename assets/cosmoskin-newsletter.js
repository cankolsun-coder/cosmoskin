/**
 * COSMOSKIN — Footer newsletter
 * Non-breaking client-side handler. If the project has a backend
 * endpoint configured at /api/newsletter or window.COSMOSKIN_CONFIG.newsletterEndpoint,
 * the email is POSTed there. Otherwise, the email is stored locally and
 * the user gets a success state — never a hard error that breaks the page.
 */
(function () {
  'use strict';
  if (window.__cosmoskinNewsletterReady) return;
  window.__cosmoskinNewsletterReady = true;

  const STORAGE_KEY = 'cosmoskin_newsletter_pending_v1';
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function getEndpoint() {
    const cfg = window.COSMOSKIN_CONFIG || {};
    return cfg.newsletterEndpoint || null;
  }

  function setStatus(form, kind, msg) {
    const status = form.querySelector('[data-newsletter-status]');
    if (!status) return;
    status.textContent = msg || '';
    if (kind) {
      status.setAttribute('data-state', kind);
    } else {
      status.removeAttribute('data-state');
    }
  }

  function persistLocally(email) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list) && !list.includes(email)) {
        list.push(email);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      }
    } catch (_e) { /* ignore */ }
  }

  async function submit(form) {
    const input = form.querySelector('input[type="email"]');
    const btn = form.querySelector('button[type="submit"]');
    if (!input) return;
    const email = String(input.value || '').trim();
    if (!EMAIL_RE.test(email)) {
      setStatus(form, 'error', 'Geçerli bir e-posta adresi gir.');
      input.focus();
      return;
    }
    if (btn) btn.disabled = true;
    setStatus(form, null, 'Kaydediliyor…');

    const endpoint = getEndpoint();
    let serverOk = false;
    if (endpoint) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email, source: 'footer-newsletter' })
        });
        serverOk = res.ok;
      } catch (_e) { serverOk = false; }
    }

    persistLocally(email);

    if (btn) btn.disabled = false;
    setStatus(form, 'ok', 'Teşekkürler. Yeni seçkiler için kayıtlısın.');
    input.value = '';
  }

  document.addEventListener('submit', function (event) {
    const form = event.target.closest('[data-newsletter-form]');
    if (!form) return;
    event.preventDefault();
    submit(form);
  });
})();
