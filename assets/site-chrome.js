(function () {
  'use strict';
  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (text != null) node.textContent = text;
    return node;
  }
  function preserveApprovedBrandMarks() {
    document.querySelectorAll('a.brand, .cm-footer-brandlock').forEach(function (brand) {
      brand.querySelectorAll('img.brand-logo, img.cm-brand-logo').forEach(function (img) { img.style.display = ''; });
    });
  }
  function normalizePaymentRows() {
    document.querySelectorAll('.payment-logos, .cm-payment-row').forEach(function (row) {
      row.setAttribute('aria-label', 'iyzico, Visa, Mastercard, Troy ve Havale/EFT ödeme yöntemleri');
      row.innerHTML = '';
      [
        ['iyzico','iyzico','/assets/img/payments/iyzico-monochrome.svg'],
        ['visa','Visa','/assets/img/payments/visa.svg'],
        ['mastercard','Mastercard','/assets/img/payments/mastercard.svg'],
        ['troy','Troy','/assets/img/payments/troy.svg'],
        ['bank-transfer','Havale/EFT', null]
      ].forEach(function (item) {
        var span = el('span', { class: 'payment-logo payment-logo--' + item[0], 'aria-label': item[1] });
        if (item[2]) span.appendChild(el('img', { src: item[2], alt: item[1], loading: 'lazy' }));
        else span.textContent = item[1];
        row.appendChild(span);
      });
    });
    document.querySelectorAll('.footer-meta-copy').forEach(function (node) {
      if (node.closest('.footer-payment-block')) node.textContent = 'Kart ödemeleri güvenli ödeme altyapısı üzerinden yürütülür. COSMOSKIN kart bilgilerini doğrudan saklamaz.';
    });
  }
  function removeDuplicateFooterTrustRows() {
    document.querySelectorAll('.footer-trustline, .cs-phase2-footer-trust').forEach(function (node) { node.remove(); });
  }
  function normalizeSecurityBadges() {
    var icons = {
      secure: '<svg aria-hidden="true" class="footer-badge-svg" viewBox="0 0 24 24"><path d="M12 21s7-3.4 7-10V5.6L12 3 5 5.6V11c0 6.6 7 10 7 10Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.55"/><path d="m8.7 12.2 2.1 2.1 4.7-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.55"/></svg>',
      original: '<svg aria-hidden="true" class="footer-badge-svg" viewBox="0 0 24 24"><path d="M12 3.5 14.2 8l4.8.7-3.5 3.4.8 4.8L12 14.6l-4.3 2.3.8-4.8L5 8.7 9.8 8 12 3.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.45"/><path d="m9.5 12.1 1.6 1.6 3.5-3.8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.45"/></svg>',
      delivery: '<svg aria-hidden="true" class="footer-badge-svg" viewBox="0 0 24 24"><path d="M3.5 7h10.2v8.4H3.5V7Zm10.2 3h3.4l3.4 3.4v2h-6.8V10Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/><path d="M6.8 18.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Zm10.8 0a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
      registry: '<svg aria-hidden="true" class="footer-badge-svg" viewBox="0 0 24 24"><path d="M7 3.8h10a1.5 1.5 0 0 1 1.5 1.5v15l-2.2-1.2-2.1 1.2-2.2-1.2-2.2 1.2-2.1-1.2-2.2 1.2v-15A1.5 1.5 0 0 1 7 3.8Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.45"/><path d="M8.5 8h7M8.5 11.2h7M8.5 14.4h4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.45"/></svg>'
    };
    document.querySelectorAll('.footer-security-block .footer-badges').forEach(function (badges) {
      badges.innerHTML = '';
      [
        ['span', 'footer-badge-item footer-badge-item--secure', '', icons.secure, 'Güvenli Ödeme'],
        ['span', 'footer-badge-item footer-badge-item--original', '', icons.original, 'Orijinal Ürün'],
        ['span', 'footer-badge-item footer-badge-item--delivery', '', icons.delivery, 'DHL Teslimat'],
        ['a', 'footer-etbis-badge footer-badge-item footer-badge-item--etbis', 'https://etbis.ticaret.gov.tr/tr/SiteSorgulamaSonuc?siteId=42e611d4-51da-453d-a68a-90cb532f89dd', icons.registry, 'ETBİS’e Kayıtlıdır']
      ].forEach(function (item) {
        var attrs = { class: item[1] };
        if (item[0] === 'a') { attrs.href = item[2]; attrs.target = '_blank'; attrs.rel = 'noopener noreferrer'; }
        var node = el(item[0], attrs);
        node.innerHTML = item[3] + '<b>' + item[4] + '</b>';
        badges.appendChild(node);
      });
    });
    document.querySelectorAll('.footer-security-block .footer-meta-copy').forEach(function (node) { node.remove(); });
  }

  function normalizeFooterSocials() {
    document.querySelectorAll('.footer-socials').forEach(function (wrap) {
      var instagram = wrap.querySelector('a[href*="instagram"]');
      var tiktok = wrap.querySelector('a[href*="tiktok"]');
      if (instagram) {
        instagram.setAttribute('aria-label', 'COSMOSKIN Instagram');
        instagram.classList.add('footer-social-link');
        instagram.innerHTML = '<svg aria-hidden="true" class="footer-social-icon" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/></svg>';
      }
      if (tiktok) {
        tiktok.setAttribute('aria-label', 'COSMOSKIN TikTok');
        tiktok.classList.add('footer-social-link');
        tiktok.innerHTML = '<svg aria-hidden="true" class="footer-social-icon" viewBox="0 0 24 24"><path d="M14.2 4c.45 2.55 1.9 4.18 4.55 4.42v3.05a7.2 7.2 0 0 1-4.5-1.46v5.65c0 3.1-2.18 5.34-5.26 5.34-2.77 0-4.99-1.94-4.99-4.62 0-2.83 2.37-4.78 5.34-4.78.42 0 .84.04 1.24.13v3.16a3.14 3.14 0 0 0-1.13-.2c-1.23 0-2.17.68-2.17 1.65 0 .94.78 1.56 1.81 1.56 1.18 0 1.96-.7 1.96-2.18V4h3.15Z" fill="currentColor"/></svg>';
      }
    });
  }
  function run() { preserveApprovedBrandMarks(); normalizePaymentRows(); normalizeSecurityBadges(); normalizeFooterSocials(); removeDuplicateFooterTrustRows(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
