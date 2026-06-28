import { getCatalogProductByHandle, getCatalogProductByName } from './catalog.js';

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function siteUrl(env = {}) {
  return String(env.PUBLIC_SITE_URL || env.SITE_URL || 'https://www.cosmoskin.com.tr').replace(/\/$/, '');
}

function sender(env = {}) {
  return {
    email: env.BREVO_SENDER_EMAIL || env.ORDER_FROM_EMAIL || env.CONTACT_FROM_EMAIL || env.NEWSLETTER_FROM_EMAIL || 'no-reply@cosmoskin.com.tr',
    name: env.BREVO_SENDER_NAME || env.NEWSLETTER_SENDER_NAME || 'COSMOSKIN'
  };
}

function absoluteUrl(url = '', env = {}) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = siteUrl(env);
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

function resolveProduct({ productName = '', productUrl = '', productSlug = '', productImage = '', env = {} } = {}) {
  const handle = productSlug || productUrl;
  const product = getCatalogProductByHandle(handle) || getCatalogProductByName(productName);
  const url = absoluteUrl(productUrl || product?.url || (product?.slug ? `/products/${product.slug}.html` : ''), env) || siteUrl(env);
  const image = absoluteUrl(productImage || product?.image || '', env);
  return {
    name: productName || product?.name || 'Beklediğin ürün',
    brand: product?.brand || '',
    url,
    image
  };
}

export function renderRestockEmail({ productName = 'Beklediğin ürün', productUrl = '', productSlug = '', productImage = '', env = {} } = {}) {
  const product = resolveProduct({ productName, productUrl, productSlug, productImage, env });
  const plainText = `COSMOSKIN\nFavorindeki ürün tekrar stokta\n\n${product.name} yeniden satın alınabilir durumda. Stoklar sınırlı olabilir; ürünü inceleyerek sepetine ekleyebilirsin.\n\nÜrünü İncele: ${product.url}`;
  const productMedia = product.image
    ? `<img src="${escapeHtml(product.image)}" width="120" height="120" alt="${escapeHtml(product.name)}" style="display:block;width:120px;height:120px;object-fit:cover;border-radius:18px;border:1px solid #eee5dc;background:#faf7f3;">`
    : `<div style="width:120px;height:120px;border-radius:18px;border:1px solid #eee5dc;background:#faf7f3;text-align:center;line-height:120px;font-family:Georgia,serif;font-size:26px;color:#8a6a4a;">CS</div>`;
  const htmlContent = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Favorindeki ürün tekrar stokta</title></head>
<body style="margin:0;padding:0;background-color:#f4f1ec;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;color:#171717;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(product.name)} yeniden stokta.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f4f1ec;margin:0;padding:0;border-collapse:collapse;"><tr><td align="center" style="padding:36px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border-collapse:collapse;border:1px solid #e8dfd4;">
      <tr><td align="center" style="background-color:#171717;padding:32px 32px 30px;text-align:center;"><a href="${escapeHtml(siteUrl(env))}" target="_blank" style="display:block;text-align:center;color:#eadcc8;text-decoration:none;font-family:Didot,'Bodoni 72','Bodoni 72 Smallcaps',Baskerville,'Times New Roman',serif;font-size:34px;line-height:1;letter-spacing:14px;font-weight:400;text-transform:uppercase;padding-left:14px;">COSMOSKIN</a><div style="font-family:Arial,Helvetica,sans-serif;color:#9c8f7f;font-size:10px;line-height:1.4;letter-spacing:2.4px;text-transform:uppercase;margin-top:13px;text-align:center;">K-BEAUTY · CİLT BAKIMI</div></td></tr>
      <tr><td style="padding:42px 40px 34px;background-color:#ffffff;text-align:center;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#9a8e82;letter-spacing:2px;text-transform:uppercase;font-weight:bold;text-align:center;margin:0 0 22px;">Stok Bildirimi</div><table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;"><tr><td>${productMedia}</td></tr></table><h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.3;font-weight:normal;color:#171717;text-align:center;margin:0 0 16px;">Beklediğin ürün tekrar stokta.</h1><p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#55504a;line-height:1.75;margin:0 auto 22px;text-align:center;max-width:420px;"><strong style="color:#171717;">${escapeHtml(product.name)}</strong> yeniden satın alınabilir durumda. Stoklar sınırlı olabilir; ürünü inceleyerek sepetine ekleyebilirsin.</p><a href="${escapeHtml(product.url)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 30px;background:#171717;color:#eadcc8;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2.4px;text-transform:uppercase;font-weight:bold;">Ürünü İncele</a></td></tr>
      <tr><td align="center" style="background-color:#f9f6f2;border-top:1px solid #eee5dc;padding:24px 36px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;line-height:1.6;">Bu mesaj stok bildirimi talebiniz üzerine gönderilmiştir.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject: 'Favorindeki ürün tekrar stokta', htmlContent, plainText };
}

export async function sendRestockEmail(env, { to, productName, productUrl, productSlug, productImage }) {
  const email = String(to || '').trim().toLowerCase();
  if (!email) return { sent: false, skipped: true, reason: 'email_missing' };
  if (!env?.BREVO_API_KEY) return { sent: false, skipped: true, reason: 'BREVO_API_KEY_missing' };
  const content = renderRestockEmail({ productName, productUrl, productSlug, productImage, env });
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': env.BREVO_API_KEY, accept: 'application/json' },
    body: JSON.stringify({ sender: sender(env), to: [{ email }], subject: content.subject, htmlContent: content.htmlContent, textContent: content.plainText })
  });
  const detail = await response.text();
  if (!response.ok) throw new Error(`Brevo error ${response.status}: ${detail}`);
  return { sent: true, detail };
}
