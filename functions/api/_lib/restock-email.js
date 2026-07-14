import { getCatalogProductByHandle, getCatalogProductByName } from './catalog.js';
import { loadActivePriceOverrideMap, resolveEffectivePricing, applyEffectivePricingToCatalogProduct } from './product-pricing.js';
import {
  escapeEmailHtml,
  getEmailOrigin,
  toAbsoluteEmailUrl,
  resolveEmailProductImage,
  emailProductThumb,
  renderEmailShell,
  emailCtaRow
} from './email-brand.js';

const escapeHtml = escapeEmailHtml;

function sender(env = {}) {
  return {
    email: env.BREVO_SENDER_EMAIL || env.ORDER_FROM_EMAIL || env.CONTACT_FROM_EMAIL || env.NEWSLETTER_FROM_EMAIL || 'no-reply@cosmoskin.com.tr',
    name: env.BREVO_SENDER_NAME || env.NEWSLETTER_SENDER_NAME || 'COSMOSKIN'
  };
}

function formatMoney(value = 0, currency = 'TRY') {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(0)} ${currency || 'TRY'}`;
  }
}

const EMAIL_PRODUCT_IMAGE_OVERRIDES = {
  'beauty-of-joseon-relief-sun-spf50': '/assets/img/email/products/beauty-of-joseon-relief-sun-spf50-email-v4.png'
};

function emailImage(productImage = '', product = {}, productName = '', env = {}) {
  const name = `${productName || product?.name || ''}`.toLocaleLowerCase('tr-TR');
  const slug = String(product?.slug || product?.id || '').trim();
  if (EMAIL_PRODUCT_IMAGE_OVERRIDES[slug]) return toAbsoluteEmailUrl(EMAIL_PRODUCT_IMAGE_OVERRIDES[slug], env);
  if (name.includes('relief sun') && name.includes('probiotics')) return toAbsoluteEmailUrl(EMAIL_PRODUCT_IMAGE_OVERRIDES['beauty-of-joseon-relief-sun-spf50'], env);
  if (/beauty-of-joseon.*relief-sun-spf50|beauty-of-joseon-relief-sun-spf50/i.test(String(productImage || product?.image || ''))) {
    return toAbsoluteEmailUrl(EMAIL_PRODUCT_IMAGE_OVERRIDES['beauty-of-joseon-relief-sun-spf50'], env);
  }
  // E4 canonical resolver: absolute HTTPS or the branded fallback — the
  // back-in-stock email always renders a product image.
  return resolveEmailProductImage({ image: productImage, product }, env);
}

// Best-effort effective display price (P1E resolver; display-only in email —
// the PDP/checkout remain the authoritative purchase surfaces).
async function resolveDisplayPricing(envOrContext, product) {
  if (!product) return null;
  try {
    const overrideMap = await loadActivePriceOverrideMap(envOrContext);
    const pricing = resolveEffectivePricing(product, overrideMap.get(product.slug) || null);
    return applyEffectivePricingToCatalogProduct(product, pricing);
  } catch {
    return product; // static catalog price fallback
  }
}

function priceLineHtml(priced = null) {
  if (!priced || !(Number(priced.effective_price_try ?? priced.price) > 0)) return '';
  const current = formatMoney(priced.effective_price_try ?? priced.price, priced.effective_currency || 'TRY');
  const compareAt = priced.sale_active && Number(priced.compare_at_price_try) > 0
    ? formatMoney(priced.compare_at_price_try, priced.effective_currency || 'TRY')
    : '';
  return `<p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#171717;line-height:1.5;margin:0 0 22px;text-align:center;"><strong>${escapeHtml(current)}</strong>${compareAt ? ` <span style="font-size:13px;color:#9a8e82;text-decoration:line-through;">${escapeHtml(compareAt)}</span>` : ''}<span style="display:block;font-size:11px;color:#9a8e82;margin-top:4px;">KDV dahil güncel fiyat</span></p>`;
}

function resolveProduct({ productName = '', productUrl = '', productSlug = '', productImage = '', env = {} } = {}) {
  const handle = productSlug || productUrl;
  const product = getCatalogProductByHandle(handle) || getCatalogProductByName(productName);
  const url = toAbsoluteEmailUrl(productUrl || product?.url || (product?.slug ? `/products/${product.slug}.html` : ''), env) || getEmailOrigin(env);
  const image = emailImage(productImage, product, productName, env);
  return {
    catalog: product || null,
    name: productName || product?.name || 'Beklediğin ürün',
    brand: product?.brand || '',
    url,
    image
  };
}

export function renderRestockEmail({ productName = 'Beklediğin ürün', productUrl = '', productSlug = '', productImage = '', pricing = null, env = {} } = {}) {
  const product = resolveProduct({ productName, productUrl, productSlug, productImage, env });
  const origin = getEmailOrigin(env);
  const preferencesUrl = `${origin}/account/profile.html?tab=notifications`;
  const priceText = pricing && Number(pricing.effective_price_try ?? pricing.price) > 0
    ? `\nGüncel fiyat (KDV dahil): ${formatMoney(pricing.effective_price_try ?? pricing.price, pricing.effective_currency || 'TRY')}`
    : '';
  const plainText = `COSMOSKIN\nBeklediğin ürün tekrar stokta\n\n${product.name} yeniden satın alınabilir durumda. Stoklar sınırlı olabilir; ürünü inceleyerek sepetine ekleyebilirsin.${priceText}\n\nÜrünü İncele: ${product.url}\nBildirim tercihlerin: ${preferencesUrl}`;
  const bodyHtml = `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#9a8e82;letter-spacing:2px;text-transform:uppercase;font-weight:bold;text-align:center;margin:0 0 22px;">Stok Bildirimi</div>
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;"><tr><td>${emailProductThumb({ image: product.image, name: product.name, size: 120, inner: 104, env })}</td></tr></table>
        <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.3;font-weight:normal;color:#171717;text-align:center;margin:0 0 12px;">Beklediğin ürün tekrar stokta.</h1>
        ${product.brand ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;letter-spacing:1.6px;text-transform:uppercase;text-align:center;margin:0 0 6px;">${escapeHtml(product.brand)}</div>` : ''}
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#55504a;line-height:1.75;margin:0 auto 14px;text-align:center;max-width:420px;"><strong style="color:#171717;">${escapeHtml(product.name)}</strong> yeniden satın alınabilir durumda. Stoklar sınırlı olabilir; ürünü inceleyerek sepetine ekleyebilirsin.</p>
        ${priceLineHtml(pricing)}
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;line-height:1.6;margin:18px 0 0;text-align:center;">Stok bildirim tercihlerini <a href="${escapeHtml(preferencesUrl)}" target="_blank" rel="noopener" style="color:#8a6a4a;text-decoration:none;">hesabındaki bildirim ayarlarından</a> yönetebilirsin.</p>`;
  const htmlContent = renderEmailShell({
    env,
    title: 'Beklediğin ürün tekrar stokta',
    preheader: `${product.name} yeniden stokta.`,
    bodyHtml,
    ctaHtml: emailCtaRow({ href: product.url, label: 'Ürünü İncele' }),
    footerNote: 'Bu mesaj stok bildirimi talebiniz üzerine gönderilmiştir.',
    maxWidth: 560
  });
  return { subject: 'Beklediğin ürün tekrar stokta', htmlContent, plainText };
}

export async function sendRestockEmail(env, { to, productName, productUrl, productSlug, productImage }) {
  const email = String(to || '').trim().toLowerCase();
  if (!email) return { sent: false, skipped: true, reason: 'email_missing' };
  if (!env?.BREVO_API_KEY) return { sent: false, skipped: true, reason: 'BREVO_API_KEY_missing' };
  const catalog = getCatalogProductByHandle(productSlug || productUrl) || getCatalogProductByName(productName);
  const pricing = await resolveDisplayPricing(env, catalog);
  const content = renderRestockEmail({ productName, productUrl, productSlug, productImage, pricing, env });
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': env.BREVO_API_KEY, accept: 'application/json' },
    body: JSON.stringify({ sender: sender(env), to: [{ email }], subject: content.subject, htmlContent: content.htmlContent, textContent: content.plainText })
  });
  const detail = await response.text();
  if (!response.ok) throw new Error(`Brevo error ${response.status}: ${detail}`);
  return { sent: true, detail };
}
