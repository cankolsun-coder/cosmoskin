(function () {
  'use strict';
  var DOCS = {
    '/legal/kvkk-aydinlatma-metni.html': { key: 'kvkk-aydinlatma-metni', title: 'KVKK Aydınlatma Metni', version: 'checkout-20260626' },
    '/legal/on-bilgilendirme-formu.html': { key: 'on-bilgilendirme-formu', title: 'Ön Bilgilendirme Formu', version: 'checkout-20260626' },
    '/legal/mesafeli-satis-sozlesmesi.html': { key: 'mesafeli-satis-sozlesmesi', title: 'Mesafeli Satış Sözleşmesi', version: 'checkout-20260626' },
    '/legal/ticari-elektronik-ileti-izni.html': { key: 'ticari-elektronik-ileti-izni', title: 'Ticari Elektronik İleti Onayı', version: 'checkout-20260626' },
    '/legal/uyelik-sozlesmesi.html': { key: 'uyelik-sozlesmesi', title: 'Üyelik Sözleşmesi', version: 'checkout-20260626' },
    '/legal/cosmoskin-club-kurallari.html': { key: 'cosmoskin-club-kurallari', title: 'COSMOSKIN Club Kuralları', version: 'checkout-20260626' },
    '/legal/cerez-politikasi.html': { key: 'cerez-politikasi', title: 'Çerez Politikası', version: 'checkout-20260626' },
    '/legal/iade-ve-cayma-politikasi.html': { key: 'iade-ve-cayma-politikasi', title: 'İade ve Cayma Politikası', version: 'checkout-20260626' },
    '/legal/teslimat-ve-kargo.html': { key: 'teslimat-ve-kargo', title: 'Teslimat ve Kargo', version: 'checkout-20260626' }
  };
  var lastTrigger = null;
  var cache = new Map();
  function pathFromHref(href) {
    try { return new URL(href, window.location.origin).pathname; } catch (_) { return href; }
  }
  function shouldOpenInline(link) {
    if (!link || !link.href) return false;
    var path = pathFromHref(link.href);
    if (!DOCS[path]) return false;
    if (link.closest('main.legal-page, .cs-legal-page, body.legal-integrated-page main')) return false;
    if (link.hasAttribute('data-legal-document')) return true;
    return Boolean(link.closest('label, form, .cs-checkout-legal-panel, #accountModal, .footer-newsletter__note, .stock-alert, [data-consent], .cookie-card'));
  }
  function ensureModal() {
    var modal = document.getElementById('csLegalInlineModal');
    if (modal) return modal;
    var backdrop = document.createElement('div');
    backdrop.className = 'cs-legal-modal-backdrop';
    backdrop.id = 'csLegalInlineBackdrop';
    var wrapper = document.createElement('div');
    wrapper.className = 'cs-legal-modal';
    wrapper.id = 'csLegalInlineModal';
    wrapper.setAttribute('role', 'dialog');
    wrapper.setAttribute('aria-modal', 'true');
    wrapper.setAttribute('aria-labelledby', 'csLegalInlineTitle');
    wrapper.innerHTML = '' +
      '<div class="cs-legal-modal__panel" tabindex="-1">' +
      '<div class="cs-legal-modal__head"><div><p class="cs-legal-modal__eyebrow">Yasal metin</p><h2 class="cs-legal-modal__title" id="csLegalInlineTitle">Yasal Metin</h2></div><button type="button" class="cs-legal-modal__close" aria-label="Yasal metni kapat" data-legal-close>×</button></div>' +
      '<div class="cs-legal-modal__body" id="csLegalInlineBody" tabindex="0"><p>Yasal metin yükleniyor...</p></div>' +
      '<div class="cs-legal-modal__actions"><button type="button" class="cs-legal-modal__button" data-legal-close>Kapat</button></div>' +
      '</div>';
    document.body.appendChild(backdrop);
    document.body.appendChild(wrapper);
    backdrop.addEventListener('click', closeModal);
    wrapper.addEventListener('click', function (event) {
      if (event.target.matches('[data-legal-close]')) closeModal();
    });
    return wrapper;
  }
  function closeModal() {
    var modal = document.getElementById('csLegalInlineModal');
    var backdrop = document.getElementById('csLegalInlineBackdrop');
    modal && modal.classList.remove('is-open');
    backdrop && backdrop.classList.remove('is-open');
    document.body.classList.remove('cs-legal-modal-open');
    if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus({ preventScroll: true });
  }
  function extractLegalContent(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var content = doc.querySelector('.cs-legal-layout .cs-legal-content') || doc.querySelector('.cs-legal-content') || doc.querySelector('main') || doc.body;
    var clone = content.cloneNode(true);
    clone.querySelectorAll('script, style, header, footer, .announcement, .drawer, .modal, .cookie, .cs-legal-toc, .cs-legal-hero, .bottom-nav').forEach(function (n) { n.remove(); });
    return clone.innerHTML || '<p>Yasal metin içeriği alınamadı.</p>';
  }
  function markLegalLinks(root) {
    (root || document).querySelectorAll('a[href*="/legal/"]').forEach(function (link) {
      var path = pathFromHref(link.href);
      var doc = DOCS[path];
      if (!doc) return;
      if (link.closest('body.legal-integrated-page main')) return;
      if (link.closest('label, form, .cs-checkout-legal-panel, #accountModal, .footer-newsletter__note, .stock-alert, [data-consent], .cookie-card')) {
        link.setAttribute('data-legal-document', doc.key);
        link.setAttribute('data-legal-version', doc.version);
        link.removeAttribute('target');
        link.removeAttribute('rel');
      }
    });
  }
  async function openLegal(link) {
    lastTrigger = link;
    var path = pathFromHref(link.href);
    var doc = DOCS[path];
    var modal = ensureModal();
    var backdrop = document.getElementById('csLegalInlineBackdrop');
    var title = document.getElementById('csLegalInlineTitle');
    var body = document.getElementById('csLegalInlineBody');
    title.textContent = doc.title;
    body.innerHTML = '<p>Yasal metin yükleniyor...</p>';
    modal.classList.add('is-open');
    backdrop && backdrop.classList.add('is-open');
    document.body.classList.add('cs-legal-modal-open');
    modal.querySelector('.cs-legal-modal__panel')?.focus({ preventScroll: true });
    try {
      if (!cache.has(path)) {
        var response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error('legal fetch failed');
        cache.set(path, extractLegalContent(await response.text()));
      }
      body.innerHTML = cache.get(path);
      body.scrollTop = 0;
    } catch (error) {
      body.innerHTML = '<p>Yasal metin şu anda yüklenemedi. Lütfen işlemi tamamlamadan önce bağlantıyı daha sonra tekrar deneyin.</p>';
    }
  }
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href*="/legal/"]');
    if (!shouldOpenInline(link)) return;
    event.preventDefault();
    openLegal(link);
  }, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && document.getElementById('csLegalInlineModal')?.classList.contains('is-open')) {
      event.preventDefault();
      closeModal();
    }
  });
  document.addEventListener('DOMContentLoaded', function () { markLegalLinks(document); });
  if (document.readyState !== 'loading') markLegalLinks(document);
  window.COSMOSKIN_LEGAL_MODAL = { open: openLegal, markLinks: markLegalLinks, documents: DOCS };
})();
