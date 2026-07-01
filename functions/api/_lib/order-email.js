import { getCatalogProductByHandle, getCatalogProductByName } from './catalog.js';
import { FALLBACK_BANK_ACCOUNTS } from './bank-accounts.js';

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMoney(value = 0, currency = 'TRY') {
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency || 'TRY',
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency || 'TRY'}`;
  }
}

function getSiteUrl(env = {}) {
  const raw = String(env.PUBLIC_SITE_URL || env.SITE_URL || 'https://www.cosmoskin.com.tr').trim();
  return raw.replace(/\/$/, '');
}

function getSupportEmail(env = {}) {
  return String(env.CONTACT_TO_EMAIL || env.CONTACT_FROM_EMAIL || 'destek@cosmoskin.com.tr').trim() || 'destek@cosmoskin.com.tr';
}

function getSender(env = {}) {
  return {
    email: env.ORDER_FROM_EMAIL || env.BREVO_SENDER_EMAIL || env.CONTACT_FROM_EMAIL || 'no-reply@cosmoskin.com.tr',
    name: env.ORDER_SENDER_NAME || env.BREVO_SENDER_NAME || 'COSMOSKIN'
  };
}

function absoluteUrl(url = '', env = {}) {
  const siteUrl = getSiteUrl(env);
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl}${value.startsWith('/') ? '' : '/'}${value}`;
}

function customerName(order = {}) {
  return `${order.customer_first_name || ''} ${order.customer_last_name || ''}`.trim() || 'COSMOSKIN üyesi';
}

function orderNumber(order = {}) {
  return order.order_number || order.id || 'COSMOSKIN';
}

function sanitizeCustomerNote(note = '', type = '') {
  const text = String(note || '').trim();
  if (!text) return '';
  if (type === 'shipment_delivered') return '';
  if (/admin|panel|internal|operasyon|işaretlendi/i.test(text)) return '';
  return text.slice(0, 320);
}

const COPY = {
  order_created: {
    subject: 'Siparişiniz alındı', eyebrow: 'Sipariş Onayı', title: 'Siparişiniz alındı.',
    body: 'COSMOSKIN siparişinizi aldı. Ödeme ve stok kontrolü tamamlandığında hazırlık süreci başlar.', icon: '✓', tone: 'success', cta: 'Siparişimi Gör'
  },
  payment_success: {
    subject: 'Siparişiniz onaylandı', eyebrow: 'Sipariş Onayı', title: 'Siparişiniz onaylandı.',
    body: 'Ödemeniz başarıyla alındı. Siparişiniz hazırlık sürecine geçti.', icon: '✓', tone: 'success', cta: 'Siparişimi Gör'
  },
  payment_confirmed_manual: {
    subject: 'Ödemeniz onaylandı', eyebrow: 'Ödeme Onayı', title: 'Ödemeniz onaylandı.',
    body: 'Havale/EFT ödemeniz COSMOSKIN ekibi tarafından kontrol edilerek onaylandı. Siparişiniz hazırlık sürecine alındı.', icon: '✓', tone: 'success', cta: 'Siparişimi Gör'
  },
  bank_transfer_pending: {
    subject: 'Havale/EFT ödemeniz bekleniyor', eyebrow: 'Havale/EFT Bilgisi', title: 'Havale/EFT ödemeniz bekleniyor.',
    body: 'Siparişiniz ödeme bekleniyor durumuyla oluşturuldu. Lütfen ödeme açıklamasına sipariş numaranızı yazın.', icon: '₺', tone: 'bank', cta: 'Sipariş Detayını Gör'
  },
  bank_transfer_reminder: {
    subject: 'Havale/EFT ödemeniz henüz görünmüyor', eyebrow: 'Ödeme Hatırlatma', title: 'Havale/EFT ödemeniz henüz görünmüyor.',
    body: 'Siparişiniz için Havale/EFT ödemeniz henüz görünmüyor. Ödeme yaptıysanız açıklama alanında sipariş numaranızın yer aldığından emin olun.', icon: '◷', tone: 'bank', cta: 'Sipariş Detayını Gör'
  },
  bank_transfer_not_received_cancelled: {
    subject: 'Havale/EFT ödemeniz alınamadığı için siparişiniz iptal edildi', eyebrow: 'Sipariş İptali', title: 'Siparişiniz iptal edildi.',
    body: 'Havale/EFT ödemeniz beklenen süre içinde görünmediği için siparişiniz iptal edildi. Dilerseniz ürünleri yeniden sepete ekleyerek yeni sipariş oluşturabilirsiniz.', icon: '×', tone: 'warning', cta: 'Alışverişe Devam Et'
  },
  order_preparing: {
    subject: 'Siparişiniz hazırlanıyor', eyebrow: 'Hazırlık Süreci', title: 'Siparişiniz hazırlanıyor.',
    body: 'COSMOSKIN seçkiniz özenle hazırlanıyor. Kargoya verildiğinde takip bilgilerinizi paylaşacağız.', icon: '▣', tone: 'package', cta: 'Siparişimi Gör'
  },
  order_packed: {
    subject: 'Siparişiniz paketlendi', eyebrow: 'Hazırlık Süreci', title: 'Siparişiniz paketlendi.',
    body: 'Siparişiniz kargoya teslim edilmek üzere hazırlandı.', icon: '▣', tone: 'package', cta: 'Siparişimi Gör'
  },
  shipment_created: {
    subject: 'Siparişiniz kargoya verildi', eyebrow: 'Kargo Güncellemesi', title: 'Siparişiniz kargoya verildi.',
    body: 'Siparişiniz kargo firmasına teslim edildi. Takip bilgilerinizi aşağıda bulabilirsiniz.', icon: '▰', tone: 'truck', cta: 'Kargomu Takip Et'
  },
  shipment_updated: {
    subject: 'Kargo bilgileriniz güncellendi', eyebrow: 'Kargo Güncellemesi', title: 'Kargo bilgileriniz güncellendi.',
    body: 'Siparişinizin kargo takip bilgileri güncellendi.', icon: '▰', tone: 'truck', cta: 'Kargomu Takip Et'
  },
  shipment_delivered: {
    subject: 'Siparişiniz teslim edildi', eyebrow: 'Teslimat Tamamlandı', title: 'Siparişiniz teslim edildi.',
    body: 'Siparişiniz teslim edildi. Deneyiminizi paylaşmak isterseniz ürünleri değerlendirebilirsiniz.', icon: '✓', tone: 'delivered', cta: 'Ürünleri Değerlendir'
  },
  payment_failed: {
    subject: 'Ödeme işlemi tamamlanamadı', eyebrow: 'Ödeme Bilgisi', title: 'Ödeme işlemi tamamlanamadı.',
    body: 'Siparişiniz için ödeme işlemi tamamlanamadı. Dilerseniz sepetinizi yeniden oluşturarak tekrar deneyebilirsiniz.', icon: '!', tone: 'warning', cta: 'Sepete Dön'
  },
  return_request_received: {
    subject: 'İade talebiniz alındı', eyebrow: 'İade Süreci', title: 'İade talebiniz alındı.',
    body: 'İade talebiniz COSMOSKIN ekibi tarafından incelenmek üzere alındı. Değerlendirme sonucunu e-posta yoluyla paylaşacağız.', icon: '↺', tone: 'neutral', cta: 'Sipariş Detayını Gör'
  },
  return_approved: {
    subject: 'İade talebiniz onaylandı', eyebrow: 'İade Değerlendirmesi', title: 'İade talebiniz onaylandı.',
    body: 'İade talebiniz onaylandı. Ürün ambalaj, kullanım ve hijyen koşulları nihai kontrolde tekrar değerlendirilecektir.', icon: '✓', tone: 'success', cta: 'Sipariş Detayını Gör'
  },
  return_rejected: {
    subject: 'İade talebiniz değerlendirildi', eyebrow: 'İade Değerlendirmesi', title: 'İade talebiniz değerlendirildi.',
    body: 'İade talebiniz COSMOSKIN ekibi tarafından değerlendirildi. Uygunluk sonucu sipariş kaydına işlendi.', icon: 'i', tone: 'neutral', cta: 'Sipariş Detayını Gör'
  },
  refund_completed: {
    subject: 'İade ödemeniz tamamlandı', eyebrow: 'İade Ödemesi', title: 'İade ödemeniz tamamlandı.',
    body: 'İade süreciniz tamamlandı. Tutarın ödeme aracınıza yansıması bankanızın işlem sürelerine bağlıdır.', icon: '✓', tone: 'success', cta: 'Sipariş Detayını Gör'
  }
};

const STATUS_TO_TYPE = {
  confirmed: 'payment_success', paid: 'payment_success', pending: 'order_created', preparing: 'order_preparing', packed: 'order_packed', shipped: 'shipment_created', delivered: 'shipment_delivered', cancelled: 'return_rejected', refunded: 'refund_completed', partially_refunded: 'refund_completed', payment_failed: 'payment_failed'
};

function copyFor(type = '') {
  return COPY[type] || COPY[STATUS_TO_TYPE[type]] || COPY.order_created;
}

function iconStyle(tone = '') {
  if (tone === 'success' || tone === 'delivered') return 'background:#edf7f1;border-color:#c9e6d2;color:#1f7a4f;';
  if (tone === 'warning') return 'background:#fff3ee;border-color:#efd0c4;color:#9b3b2e;';
  if (tone === 'truck' || tone === 'package') return 'background:#f4ece3;border-color:#dfcdb7;color:#8a6a4a;';
  if (tone === 'bank') return 'background:#f7f1e9;border-color:#d9cdbc;color:#6b5e50;';
  return 'background:#f7f3ec;border-color:#e8dfd4;color:#6b5e50;';
}


const EMAIL_PRODUCT_IMAGE_OVERRIDES = {
  'beauty-of-joseon-relief-sun-spf50': '/assets/img/email/products/beauty-of-joseon-relief-sun-spf50-email-v4.png'
};

function statusIconAsset(type = '', tone = '') {
  if (type === 'shipment_created' || type === 'shipment_updated' || tone === 'truck') return '/assets/img/email/status-truck-v3.png';
  if (type === 'order_preparing' || type === 'order_packed' || tone === 'package') return '/assets/img/email/status-package-v3.png';
  if (type === 'bank_transfer_pending' || tone === 'bank') return '/assets/img/email/status-bank-v3.png';
  if (type === 'bank_transfer_reminder') return '/assets/img/email/status-reminder-v3.png';
  if (type === 'bank_transfer_not_received_cancelled' || tone === 'warning') return '/assets/img/email/status-cancel-v3.png';
  if (type === 'shipment_delivered' || tone === 'delivered') return '/assets/img/email/status-delivered-v3.png';
  return '/assets/img/email/status-check-v3.png';
}

function statusIconHtml(type = '', copy = {}, env = {}) {
  const src = absoluteUrl(statusIconAsset(type, copy.tone), env);
  return `<img src="${escapeHtml(src)}" width="34" height="34" alt="" style="display:block;width:34px;height:34px;max-width:34px;max-height:34px;border:0;outline:none;text-decoration:none;margin:0 auto;-ms-interpolation-mode:bicubic;">`;
}

function emailImageForItem(item = {}, product = {}, slug = '', env = {}) {
  const name = `${item.product_name || item.name || product?.name || ''}`.toLocaleLowerCase('tr-TR');
  const rawSlug = `${slug || item.product_slug || item.slug || product?.slug || product?.id || ''}`.trim();
  const rawImage = `${item.email_image || item.image || item.product_image || item.image_url || product?.image || ''}`.trim();
  const key = rawSlug || (name.includes('relief sun') && name.includes('probiotics') ? 'beauty-of-joseon-relief-sun-spf50' : '');
  if (EMAIL_PRODUCT_IMAGE_OVERRIDES[key]) return absoluteUrl(EMAIL_PRODUCT_IMAGE_OVERRIDES[key], env);
  if (/beauty-of-joseon.*relief-sun-spf50|beauty-of-joseon-relief-sun-spf50/i.test(rawImage)) {
    return absoluteUrl(EMAIL_PRODUCT_IMAGE_OVERRIDES['beauty-of-joseon-relief-sun-spf50'], env);
  }
  return absoluteUrl(rawImage, env);
}

function emailHeaders(type = '', order = {}) {
  const no = orderNumber(order);
  return {
    'X-COSMOSKIN-Email-Type': String(type || 'order_created'),
    'X-COSMOSKIN-Order-Number': String(no || ''),
    'X-Entity-Ref-ID': `cosmoskin-${String(no || 'order').replace(/[^a-z0-9_-]/gi, '')}-${String(type || 'email')}-${Date.now()}`
  };
}

function emailAntiTrimLine(type = '', order = {}, copy = {}) {
  return `<p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#a2978c;line-height:1.6;margin:0 auto 22px;text-align:center;max-width:460px;letter-spacing:.8px;text-transform:uppercase;">Durum güncellemesi: ${escapeHtml(copy.eyebrow || type)} · ${escapeHtml(orderNumber(order))}</p>`;
}

function resolveItem(item = {}, env = {}) {
  const product = getCatalogProductByHandle(item.product_slug || item.slug || item.product_id || item.id || item.url) || getCatalogProductByName(item.product_name || item.name);
  const slug = item.product_slug || item.slug || product?.slug || product?.id || '';
  const image = emailImageForItem(item, product, slug, env);
  return {
    slug,
    brand: item.brand || product?.brand || '',
    name: item.product_name || item.name || product?.name || 'COSMOSKIN ürünü',
    quantity: Number(item.quantity || item.qty || 1),
    unitPrice: Number(item.unit_price || item.price || product?.price || 0),
    lineTotal: Number(item.line_total || (Number(item.unit_price || item.price || product?.price || 0) * Number(item.quantity || item.qty || 1)) || 0),
    image,
    url: absoluteUrl(item.product_url || item.url || (slug ? `/products/${slug}.html` : product?.url || ''), env)
  };
}

function orderItems(order = {}, payloadItems = []) {
  const items = payloadItems?.length ? payloadItems : (order.order_items || order.items || []);
  return Array.isArray(items) ? items : [];
}

function productsBlock(items = [], env = {}, currency = 'TRY') {
  const rows = items.slice(0, 10).map((raw) => {
    const item = resolveItem(raw, env);
    const imageHtml = item.image
      ? `<table role="presentation" width="76" height="76" cellspacing="0" cellpadding="0" border="0" style="width:76px;height:76px;border-collapse:separate;"><tr><td align="center" valign="middle" width="76" height="76" style="width:76px;height:76px;border-radius:16px;border:1px solid #eee5dc;background:#fbf7ef;text-align:center;vertical-align:middle;"><img src="${escapeHtml(item.image)}" width="64" height="64" alt="${escapeHtml(item.name)}" style="display:block;width:64px;height:64px;max-width:64px;max-height:64px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;margin:0 auto;"></td></tr></table>`
      : `<table role="presentation" width="76" height="76" cellspacing="0" cellpadding="0" border="0" style="width:76px;height:76px;border-collapse:separate;"><tr><td align="center" valign="middle" width="76" height="76" style="width:76px;height:76px;border-radius:16px;border:1px solid #eee5dc;background:#fbf7ef;text-align:center;vertical-align:middle;"><span style="display:inline-block;font-family:Georgia,serif;font-size:18px;line-height:1;color:#8a6a4a;">CS</span></td></tr></table>`;
    return `<tr>
      <td width="92" style="padding:14px 0;border-bottom:1px solid #eee5dc;vertical-align:top;">${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;">${imageHtml}</a>` : imageHtml}</td>
      <td style="padding:14px 12px;border-bottom:1px solid #eee5dc;vertical-align:top;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;color:#9a8e82;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:4px;">${escapeHtml(item.brand || 'COSMOSKIN')}</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#171717;font-weight:bold;">${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" style="color:#171717;text-decoration:none;">${escapeHtml(item.name)}</a>` : escapeHtml(item.name)}</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b5e50;margin-top:5px;">${item.quantity} adet · ${formatMoney(item.unitPrice, currency)}</div>
      </td>
      <td align="right" style="padding:14px 0;border-bottom:1px solid #eee5dc;vertical-align:top;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#171717;font-weight:bold;white-space:nowrap;">${formatMoney(item.lineTotal, currency)}</td>
    </tr>`;
  }).join('');
  if (!rows) return '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-top:24px;">
    <tr><td colspan="3" style="padding:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;letter-spacing:1.8px;text-transform:uppercase;font-weight:bold;">Sipariş Özeti</td></tr>
    ${rows}
  </table>`;
}

function infoBox(title, rows = []) {
  const rendered = rows.filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '').map(([label, value]) => `
    <tr><td style="padding:9px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b5e50;">${escapeHtml(label)}</td><td align="right" style="padding:9px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#171717;font-weight:bold;word-break:break-word;">${escapeHtml(value)}</td></tr>`).join('');
  if (!rendered) return '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;border-collapse:separate;border-spacing:0;background:#faf7f3;border:1px solid #eee5dc;border-radius:16px;overflow:hidden;">
    <tr><td colspan="2" style="padding:14px 18px;border-bottom:1px solid #eee5dc;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;letter-spacing:1.8px;text-transform:uppercase;font-weight:bold;">${escapeHtml(title)}</td></tr>
    ${rendered}
  </table>`;
}

function trackingBlock(shipment = {}) {
  const carrier = shipment.carrier_name || shipment.carrier || '';
  const trackingNumber = shipment.tracking_number || '';
  const trackingUrl = shipment.tracking_url || '';
  return infoBox('Kargo Bilgisi', [
    ['Kargo Firması', carrier],
    ['Takip No', trackingNumber],
    ['Takip Bağlantısı', trackingUrl]
  ]);
}

function bankAccountsBlock(accounts = [], order = {}) {
  const normalized = Array.isArray(accounts) && accounts.length ? accounts : FALLBACK_BANK_ACCOUNTS;
  const rows = normalized.map((account) => `
    <tr><td style="padding:14px 18px;border-top:1px solid #eee5dc;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#171717;font-weight:bold;margin-bottom:8px;">${escapeHtml(account.bankName || account.bank_name)}</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.8;color:#6b5e50;">Alıcı: <strong style="color:#171717;">${escapeHtml(account.accountName || account.account_holder)}</strong><br>IBAN: <strong style="color:#171717;word-break:break-all;">${escapeHtml(account.iban)}</strong><br>Şube: ${escapeHtml(account.branch || 'Maltepe Çarşı')}</div>
    </td></tr>`).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;border-collapse:separate;border-spacing:0;background:#faf7f3;border:1px solid #eee5dc;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;letter-spacing:1.8px;text-transform:uppercase;font-weight:bold;">Havale/EFT Bilgileri</td></tr>
    <tr><td style="padding:0 18px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;color:#6b5e50;">Ödeme açıklamasına mutlaka <strong style="color:#171717;">${escapeHtml(orderNumber(order))}</strong> yazılmalıdır.</td></tr>
    ${rows}
  </table>`;
}

function noticeBlock(text, tone = '') {
  if (!text) return '';
  const border = tone === 'warning' ? '#d6a08d' : '#c5a16f';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-top:22px;"><tr><td style="background:#fdf9f5;border:1px solid #eee5dc;border-left:4px solid ${border};padding:15px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b5e50;line-height:1.7;">${escapeHtml(text)}</td></tr></table>`;
}

function ctaRows(copy, type, order, shipment, env) {
  const siteUrl = getSiteUrl(env);
  const trackingUrl = shipment?.tracking_url || '';
  const orderUrl = `${siteUrl}/account/profile.html?tab=orders`;
  const firstItem = resolveItem(orderItems(order)[0] || {}, env);
  if (type === 'shipment_created' || type === 'shipment_updated') {
    const href = trackingUrl || `${siteUrl}/order-tracking.html`;
    return `<tr><td style="padding:0 40px 32px;text-align:center;"><a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 30px;background:#171717;color:#eadcc8;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2.4px;text-transform:uppercase;font-weight:bold;">Kargomu Takip Et</a></td></tr>`;
  }
  if (type === 'shipment_delivered') {
    const reviewUrl = firstItem?.url ? `${firstItem.url}#reviews` : `${orderUrl}&review=1`;
    return `<tr><td style="padding:0 40px 32px;text-align:center;"><a href="${escapeHtml(reviewUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 24px;background:#171717;color:#eadcc8;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2.2px;text-transform:uppercase;font-weight:bold;margin:0 4px 10px;">Ürünleri Değerlendir</a><a href="${escapeHtml(orderUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 22px;border:1px solid #d8cbbb;color:#171717;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin:0 4px 10px;">Sipariş Detayını Gör</a></td></tr>`;
  }
  const href = type === 'payment_failed' ? `${siteUrl}/cart.html` : orderUrl;
  return `<tr><td style="padding:0 40px 32px;text-align:center;"><a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 30px;background:#171717;color:#eadcc8;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2.4px;text-transform:uppercase;font-weight:bold;">${escapeHtml(copy.cta || 'Siparişimi Gör')}</a></td></tr>`;
}

export function buildCommerceEmailHtml({ order = {}, type = 'order_created', env = {}, note = '', shipment = {}, items = [], bankAccounts = [] }) {
  const copy = copyFor(type);
  const siteUrl = getSiteUrl(env);
  const support = getSupportEmail(env);
  const currency = order.currency || 'TRY';
  const resolvedItems = orderItems(order, items);
  const safeNote = sanitizeCustomerNote(note, type);
  const totalRows = [
    ['Sipariş No', orderNumber(order)],
    ['Ara Toplam', order.subtotal_amount ? formatMoney(order.subtotal_amount, currency) : ''],
    ['Kargo', order.shipping_amount != null ? formatMoney(order.shipping_amount, currency) : ''],
    ['Dahil Olan KDV', order.vat_amount != null ? formatMoney(order.vat_amount, currency) : ''],
    ['Toplam', order.total_amount != null ? formatMoney(order.total_amount, currency) : '']
  ];
  const deliveredNotice = type === 'shipment_delivered'
    ? 'Hasarlı, eksik veya yanlış ürün bildiriminizi teslimattan itibaren 48 saat içinde fotoğraf/video ile destek@cosmoskin.com.tr üzerinden bize iletebilirsiniz.'
    : '';
  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(copy.subject)} | COSMOSKIN</title></head>
<body style="margin:0;padding:0;background-color:#f4f1ec;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;color:#171717;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(copy.body)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f4f1ec;margin:0;padding:0;border-collapse:collapse;"><tr><td align="center" style="padding:36px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-collapse:collapse;border:1px solid #e8dfd4;">
      <tr><td align="center" style="background-color:#171717;padding:32px 32px 30px;text-align:center;">
        <a href="${escapeHtml(siteUrl)}" target="_blank" style="display:block;text-align:center;color:#eadcc8;text-decoration:none;font-family:Didot,'Bodoni 72','Bodoni 72 Smallcaps',Baskerville,'Times New Roman',serif;font-size:34px;line-height:1;letter-spacing:14px;font-weight:400;text-transform:uppercase;padding-left:14px;">COSMOSKIN</a>
        <div style="font-family:Arial,Helvetica,sans-serif;color:#9c8f7f;font-size:10px;line-height:1.4;letter-spacing:2.4px;text-transform:uppercase;margin-top:13px;text-align:center;">K-BEAUTY · CİLT BAKIMI</div>
      </td></tr>
      <tr><td style="padding:42px 40px 34px;background-color:#ffffff;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td align="center" style="padding-bottom:22px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" style="width:58px;height:58px;border-radius:58px;border:1px solid #d9cdbc;${iconStyle(copy.tone)}text-align:center;vertical-align:middle;line-height:1;">${statusIconHtml(type, copy, env)}</td></tr></table>
        </td></tr></table>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#9a8e82;letter-spacing:2px;text-transform:uppercase;font-weight:bold;text-align:center;margin:0 0 12px;">${escapeHtml(copy.eyebrow)}</div>
        <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.3;font-weight:normal;color:#171717;text-align:center;margin:0 0 16px;letter-spacing:.2px;">${escapeHtml(copy.title)}</h1>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#55504a;line-height:1.75;margin:0 0 10px;text-align:center;">Merhaba ${escapeHtml(customerName(order))},</p>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#55504a;line-height:1.75;margin:0 auto 12px;text-align:center;max-width:460px;">${escapeHtml(copy.body)}</p>
        ${emailAntiTrimLine(type, order, copy)}
        ${infoBox('Sipariş Bilgisi', totalRows)}
        ${type === 'bank_transfer_pending' ? bankAccountsBlock(bankAccounts, order) : ''}
        ${(type === 'shipment_created' || type === 'shipment_updated') ? trackingBlock(shipment) : ''}
        ${productsBlock(resolvedItems, env, currency)}
        ${deliveredNotice ? noticeBlock(deliveredNotice) : ''}
        ${safeNote ? noticeBlock(`COSMOSKIN notu: ${safeNote}`) : ''}
      </td></tr>
      ${ctaRows(copy, type, order, shipment, env)}
      <tr><td align="center" style="background-color:#f9f6f2;border-top:1px solid #eee5dc;padding:24px 36px;text-align:center;">
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;margin:0 0 7px;line-height:1.6;text-align:center;">Bu e-posta COSMOSKIN sipariş süreciyle ilgili gönderilmiştir.</p>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;margin:0 0 7px;line-height:1.6;text-align:center;">Yardıma ihtiyacınız varsa <a href="mailto:${escapeHtml(support)}" style="color:#8a6a4a;text-decoration:none;">${escapeHtml(support)}</a> üzerinden bize ulaşabilirsiniz.</p>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;margin:0;line-height:1.6;text-align:center;">© 2026 COSMOSKIN · <a href="${escapeHtml(siteUrl)}" target="_blank" style="color:#8a6a4a;text-decoration:none;">www.cosmoskin.com.tr</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function buildCommerceText({ order = {}, type = 'order_created', shipment = {}, note = '', env = {}, items = [] }) {
  const copy = copyFor(type);
  const lines = ['COSMOSKIN', copy.subject, copy.body, `Sipariş No: ${orderNumber(order)}`];
  if (order.total_amount != null) lines.push(`Toplam: ${formatMoney(order.total_amount, order.currency || 'TRY')}`);
  if (shipment.carrier_name || shipment.carrier) lines.push(`Kargo Firması: ${shipment.carrier_name || shipment.carrier}`);
  if (shipment.tracking_number) lines.push(`Takip No: ${shipment.tracking_number}`);
  if (type === 'shipment_delivered') lines.push('Hasarlı, eksik veya yanlış ürün bildiriminizi teslimattan itibaren 48 saat içinde fotoğraf/video ile destek@cosmoskin.com.tr üzerinden bize iletebilirsiniz.');
  const resolved = orderItems(order, items).map((item) => resolveItem(item, env));
  resolved.forEach((item) => lines.push(`${item.brand ? item.brand + ' - ' : ''}${item.name} x ${item.quantity}`));
  const safeNote = sanitizeCustomerNote(note, type);
  if (safeNote) lines.push(`COSMOSKIN notu: ${safeNote}`);
  lines.push(`Destek: ${getSupportEmail(env)}`);
  return lines.filter(Boolean).join('\n');
}

async function sendBrevoEmail(env, payload = {}) {
  if (!payload.to) return { sent: false, skipped: true, reason: 'customer_email_missing' };
  if (!env?.BREVO_API_KEY) return { sent: false, skipped: true, reason: 'BREVO_API_KEY_missing' };
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': env.BREVO_API_KEY, accept: 'application/json' },
    body: JSON.stringify({ sender: payload.sender || getSender(env), to: [{ email: payload.to, name: payload.toName || payload.to }], subject: payload.subject, htmlContent: payload.htmlContent, textContent: payload.textContent || '', headers: payload.headers || undefined })
  });
  const detail = await response.text();
  let parsed = null;
  try { parsed = detail ? JSON.parse(detail) : null; } catch { parsed = null; }
  if (!response.ok) throw new Error(`Brevo error ${response.status}: ${detail.slice(0, 300)}`);
  return { sent: true, provider: 'brevo', provider_message_id: parsed?.messageId || parsed?.messageIds?.[0] || null, detail: parsed || detail || null };
}

export async function sendOrderStatusEmail(env, payload = {}) {
  const order = payload.order || {};
  const to = String(order.customer_email || payload.to || '').trim().toLowerCase();
  if (!to) return { sent: false, skipped: true, reason: 'customer_email_missing' };
  if (!env?.BREVO_API_KEY) return { sent: false, skipped: true, reason: 'BREVO_API_KEY_missing' };
  const type = payload.emailType || STATUS_TO_TYPE[String(payload.status || order.status || '').trim()] || 'order_created';
  const copy = copyFor(type);
  const subject = `${copy.subject} | ${orderNumber(order)}`;
  return await sendBrevoEmail(env, { to, toName: customerName(order), subject, htmlContent: buildCommerceEmailHtml({ ...payload, type, env }), textContent: buildCommerceText({ ...payload, type, env }), headers: emailHeaders(type, order) });
}

export async function sendShipmentEmail(env, payload = {}) {
  const order = payload.order || {};
  const shipment = payload.shipment || {};
  const to = String(payload.to || order.customer_email || '').trim().toLowerCase();
  if (!to) return { sent: false, skipped: true, reason: 'customer_email_missing' };
  if (!env?.BREVO_API_KEY) return { sent: false, skipped: true, reason: 'BREVO_API_KEY_missing' };
  const type = payload.type || payload.emailType || (shipment.status === 'delivered' ? 'shipment_delivered' : 'shipment_created');
  const copy = copyFor(type);
  return await sendBrevoEmail(env, { to, toName: customerName(order), subject: `${copy.subject} | ${orderNumber(order)}`, htmlContent: buildCommerceEmailHtml({ ...payload, order, shipment, type, env }), textContent: buildCommerceText({ ...payload, order, shipment, type, env }), headers: emailHeaders(type, order) });
}

export function getCommerceEmailSubject(type = '') {
  return copyFor(type).subject;
}

export async function sendCommerceTransactionalEmail(env, payload = {}) {
  const order = payload.order || {};
  const to = String(payload.to || order.customer_email || '').trim().toLowerCase();
  if (!to) return { sent: false, skipped: true, reason: 'customer_email_missing' };
  if (!env?.BREVO_API_KEY) return { sent: false, skipped: true, reason: 'BREVO_API_KEY_missing' };
  const type = String(payload.type || 'return_request_received').trim();
  const copy = copyFor(type);
  const subject = payload.subject || `${copy.subject} | ${orderNumber(order)}`;
  return await sendBrevoEmail(env, { to, toName: customerName(order), subject, htmlContent: buildCommerceEmailHtml({ ...payload, order, type, env }), textContent: buildCommerceText({ ...payload, order, type, env }), headers: emailHeaders(type, order) });
}
