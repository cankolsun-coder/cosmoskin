// E4 — Canonical COSMOSKIN transactional email brand layer.
// Single source of truth for: the email shell (header/wordmark/footer),
// product-image URL resolution, and email-safe image markup. Every
// customer-facing transactional template must render through this module so
// branding and image safety cannot drift per template again.

export function escapeEmailHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getEmailOrigin(env = {}) {
  const raw = String(env.PUBLIC_SITE_URL || env.SITE_URL || 'https://www.cosmoskin.com.tr').trim().replace(/\/$/, '');
  // The email origin must always be the canonical production site — never a
  // preview deployment or a local server, even if env is misconfigured.
  if (!/^https:\/\//i.test(raw) || /localhost|127\.0\.0\.1|\.pages\.dev/i.test(raw)) {
    return 'https://www.cosmoskin.com.tr';
  }
  return raw;
}

export function getEmailSupportAddress(env = {}) {
  return String(env.CONTACT_TO_EMAIL || env.CONTACT_FROM_EMAIL || 'destek@cosmoskin.com.tr').trim() || 'destek@cosmoskin.com.tr';
}

// Canonical hosted brand assets (email clients cannot load the site's web
// font, so the wordmark ships as a retina PNG rendered from the brand serif).
export const EMAIL_WORDMARK_PATH = '/assets/img/email/cosmoskin-wordmark-email-v1.png';
export const EMAIL_WORDMARK_WIDTH = 300;   // display px (asset is 788x128 @2x)
export const EMAIL_WORDMARK_HEIGHT = 49;
export const EMAIL_PRODUCT_FALLBACK_PATH = '/assets/logo-mark.png';

const UNSAFE_IMAGE_PATTERN = /localhost|127\.0\.0\.1|0\.0\.0\.0|\.pages\.dev|^file:|^data:|^javascript:|^blob:|^ftp:/i;

export function toAbsoluteEmailUrl(url = '', env = {}) {
  const origin = getEmailOrigin(env);
  const value = String(url || '').trim();
  if (!value) return '';
  if (UNSAFE_IMAGE_PATTERN.test(value)) return '';
  if (/^https:\/\//i.test(value)) return value;
  if (/^http:\/\//i.test(value)) return value.replace(/^http:/i, 'https:');
  if (/^\/\//.test(value)) return `https:${value}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return ''; // any other explicit protocol is unsafe
  return `${origin}${value.startsWith('/') ? '' : '/'}${value}`;
}

/**
 * E4 canonical product-image resolver for emails.
 * Accepts an order item, a catalog product, or a merged object; returns an
 * absolute HTTPS URL, falling back to the branded mark when no valid image
 * exists. Never returns localhost/file/data/relative URLs.
 */
export function resolveEmailProductImage(productOrOrderItem = {}, env = {}) {
  const source = productOrOrderItem || {};
  const candidates = [
    source.email_image,
    source.image,
    source.image_url,
    source.product_image,
    source.thumbnail,
    source.metadata && typeof source.metadata === 'object' ? source.metadata.image : '',
    source.product && typeof source.product === 'object' ? source.product.image : ''
  ];
  for (const candidate of candidates) {
    const absolute = toAbsoluteEmailUrl(candidate, env);
    if (absolute) return absolute;
  }
  return toAbsoluteEmailUrl(EMAIL_PRODUCT_FALLBACK_PATH, env);
}

/**
 * Email-safe <img> markup: absolute src, explicit dimensions, display:block,
 * border=0, alt text, fallback background — Gmail/Apple Mail/Outlook safe.
 */
export function emailImageTag({ src = '', width = 64, height = 64, alt = '', extraStyle = '' } = {}) {
  const safeSrc = escapeEmailHtml(src);
  const w = Math.max(1, Math.round(Number(width) || 64));
  const h = Math.max(1, Math.round(Number(height) || w));
  return `<img src="${safeSrc}" width="${w}" height="${h}" alt="${escapeEmailHtml(alt)}" border="0" style="display:block;width:${w}px;height:${h}px;max-width:${w}px;max-height:${h}px;border:0;outline:none;text-decoration:none;background-color:#fbf7ef;-ms-interpolation-mode:bicubic;${extraStyle}">`;
}

/** Framed product thumbnail cell used across all templates. */
export function emailProductThumb({ image = '', name = '', size = 76, inner = 64, env = {} } = {}) {
  const src = image || resolveEmailProductImage({}, env);
  const pad = Math.max(0, Math.round((size - inner) / 2));
  return `<table role="presentation" width="${size}" height="${size}" cellspacing="0" cellpadding="0" border="0" style="width:${size}px;height:${size}px;border-collapse:separate;"><tr><td align="center" valign="middle" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:16px;border:1px solid #eee5dc;background-color:#fbf7ef;text-align:center;vertical-align:middle;padding:${pad}px;">${emailImageTag({ src, width: inner, height: inner, alt: name, extraStyle: 'margin:0 auto;' })}</td></tr></table>`;
}

export function emailWordmarkHtml(env = {}) {
  const src = toAbsoluteEmailUrl(EMAIL_WORDMARK_PATH, env);
  return `<img src="${escapeEmailHtml(src)}" width="${EMAIL_WORDMARK_WIDTH}" height="${EMAIL_WORDMARK_HEIGHT}" alt="COSMOSKIN" border="0" style="display:block;width:${EMAIL_WORDMARK_WIDTH}px;height:${EMAIL_WORDMARK_HEIGHT}px;max-width:${EMAIL_WORDMARK_WIDTH}px;border:0;outline:none;text-decoration:none;margin:0 auto;-ms-interpolation-mode:bicubic;">`;
}

/**
 * Canonical transactional shell. `bodyHtml` (and optional `ctaHtml`) render
 * inside the shared header/footer. Ivory background, dark header with the
 * hosted wordmark, shared legal footer.
 */
export function renderEmailShell({ env = {}, title = 'COSMOSKIN', preheader = '', bodyHtml = '', ctaHtml = '', footerNote = '', maxWidth = 600 } = {}) {
  const origin = getEmailOrigin(env);
  const support = getEmailSupportAddress(env);
  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeEmailHtml(title)} | COSMOSKIN</title></head>
<body style="margin:0;padding:0;background-color:#f4f1ec;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;color:#171717;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeEmailHtml(preheader || title)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f4f1ec;margin:0;padding:0;border-collapse:collapse;"><tr><td align="center" style="padding:36px 16px;">
    <table role="presentation" width="${maxWidth}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${maxWidth}px;background-color:#ffffff;border-collapse:collapse;border:1px solid #e8dfd4;">
      <tr><td align="center" style="background-color:#171717;padding:30px 24px 26px;text-align:center;">
        <a href="${escapeEmailHtml(origin)}" target="_blank" style="display:inline-block;text-decoration:none;">${emailWordmarkHtml(env)}</a>
        <div style="font-family:Arial,Helvetica,sans-serif;color:#9c8f7f;font-size:10px;line-height:1.4;letter-spacing:2.4px;text-transform:uppercase;margin-top:12px;text-align:center;">K-BEAUTY · CİLT BAKIMI</div>
      </td></tr>
      <tr><td style="padding:42px 40px 34px;background-color:#ffffff;">
        ${bodyHtml}
      </td></tr>
      ${ctaHtml}
      <tr><td align="center" style="background-color:#f9f6f2;border-top:1px solid #eee5dc;padding:24px 36px;text-align:center;">
        ${footerNote ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;margin:0 0 7px;line-height:1.6;text-align:center;">${escapeEmailHtml(footerNote)}</p>` : ''}
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;margin:0 0 7px;line-height:1.6;text-align:center;">Yardıma ihtiyacınız varsa <a href="mailto:${escapeEmailHtml(support)}" style="color:#8a6a4a;text-decoration:none;">${escapeEmailHtml(support)}</a> üzerinden bize ulaşabilirsiniz.</p>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;margin:0;line-height:1.6;text-align:center;">© 2026 COSMOSKIN · <a href="${escapeEmailHtml(origin)}" target="_blank" style="color:#8a6a4a;text-decoration:none;">www.cosmoskin.com.tr</a> · Orijinal ürün · Güvenli ödeme · 14 gün cayma hakkı</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** Standard primary CTA row (black button, cream text). */
export function emailCtaRow({ href = '', label = 'Siparişimi Gör', secondaryHref = '', secondaryLabel = '' } = {}) {
  const secondary = secondaryHref
    ? `<a href="${escapeEmailHtml(secondaryHref)}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 22px;border:1px solid #d8cbbb;color:#171717;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin:0 4px 10px;">${escapeEmailHtml(secondaryLabel || 'Detaylar')}</a>`
    : '';
  return `<tr><td style="padding:0 40px 32px;text-align:center;"><a href="${escapeEmailHtml(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 30px;background:#171717;color:#eadcc8;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2.4px;text-transform:uppercase;font-weight:bold;margin:0 4px 10px;">${escapeEmailHtml(label)}</a>${secondary}</td></tr>`;
}
