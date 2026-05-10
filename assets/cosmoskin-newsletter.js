/**
 * COSMOSKIN — Footer newsletter / COSMOSKIN Journal
 * Real client handler for every desktop/mobile footer newsletter instance.
 * Success is shown only after /api/newsletter/subscribe confirms the result.
 */
(function () {
  'use strict';
  if (window.__cosmoskinNewsletterReady) return;
  window.__cosmoskinNewsletterReady = true;

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var COPY = {
    invalid: 'Lütfen geçerli bir e-posta adresi gir.',
    success: 'COSMOSKIN Journal’a kaydoldun. İlk notumuz e-posta kutuna geliyor.',
    already: 'Bu e-posta adresi COSMOSKIN Journal listesinde zaten kayıtlı.',
    server: 'Şu anda kaydını tamamlayamadık. Lütfen biraz sonra tekrar dene.',
    loading: 'Kaydın alınıyor…'
  };

  function getEndpoint() {
    var cfg = window.COSMOSKIN_CONFIG || {};
    return cfg.newsletterEndpoint || '/api/newsletter/subscribe';
  }

  function getStatusEl(form) {
    var status = form.querySelector('[data-newsletter-status]');
    if (!status) {
      status = document.createElement('p');
      status.className = form.matches('.cm-newsletter') ? 'cm-newsletter__status' : 'footer-newsletter__status';
      status.setAttribute('data-newsletter-status', '');
      status.setAttribute('aria-live', 'polite');
      form.appendChild(status);
    }
    return status;
  }

  function setStatus(form, kind, message) {
    var status = getStatusEl(form);
    status.textContent = message || '';
    if (kind) status.setAttribute('data-state', kind);
    else status.removeAttribute('data-state');
  }

  function setLoading(form, isLoading) {
    var button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent.trim() || 'Kaydol';
    button.disabled = !!isLoading;
    button.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    button.classList.toggle('is-loading', !!isLoading);
    var label = button.querySelector('span');
    if (label) label.textContent = isLoading ? 'Kaydediliyor' : button.dataset.originalText;
    else button.textContent = isLoading ? 'Kaydediliyor' : button.dataset.originalText;
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function sourceFor(form) {
    return form.getAttribute('data-newsletter-source') || form.getAttribute('data-source') || 'footer';
  }

  async function submit(form) {
    if (form.dataset.newsletterLoading === 'true') return;
    var input = form.querySelector('input[type="email"], input[name="email"]');
    if (!input) return;
    var email = normalizeEmail(input.value);

    if (!EMAIL_RE.test(email)) {
      setStatus(form, 'error', COPY.invalid);
      input.focus();
      return;
    }

    form.dataset.newsletterLoading = 'true';
    setLoading(form, true);
    setStatus(form, null, COPY.loading);

    try {
      var response = await fetch(getEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email, source: sourceFor(form) })
      });
      var data = await response.json().catch(function () { return {}; });

      if (response.ok && data && data.already_subscribed) {
        setStatus(form, 'ok', COPY.already);
        return;
      }

      if (response.ok && data && data.ok) {
        setStatus(form, 'ok', data.message || COPY.success);
        input.value = '';
        return;
      }

      if (data && data.code === 'invalid_email') {
        setStatus(form, 'error', COPY.invalid);
        input.focus();
        return;
      }

      setStatus(form, 'error', COPY.server);
    } catch (_error) {
      setStatus(form, 'error', COPY.server);
    } finally {
      form.dataset.newsletterLoading = 'false';
      setLoading(form, false);
    }
  }

  document.addEventListener('submit', function (event) {
    var form = event.target.closest('[data-newsletter-form], [data-cm-newsletter]');
    if (!form) return;
    event.preventDefault();
    submit(form);
  });
})();
