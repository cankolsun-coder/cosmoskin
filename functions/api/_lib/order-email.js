import { getCatalogProductByHandle, getCatalogProductByName } from './catalog.js';
import {
  escapeEmailHtml,
  getEmailOrigin,
  getEmailSupportAddress,
  toAbsoluteEmailUrl,
  resolveEmailProductImage,
  emailProductThumb,
  renderEmailShell
} from './email-brand.js';

const escapeHtml = escapeEmailHtml;

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

const getSiteUrl = getEmailOrigin;
const getSupportEmail = getEmailSupportAddress;

function getSender(env = {}) {
  return {
    email: env.ORDER_FROM_EMAIL || env.BREVO_SENDER_EMAIL || env.CONTACT_FROM_EMAIL || 'no-reply@cosmoskin.com.tr',
    name: env.ORDER_SENDER_NAME || env.BREVO_SENDER_NAME || 'COSMOSKIN'
  };
}

const absoluteUrl = toAbsoluteEmailUrl;

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
  },
  refund_pending: {
    subject: 'İade işleminiz başlatıldı', eyebrow: 'İade Süreci', title: 'İade işleminiz başlatıldı.',
    body: 'İade tutarınızın işlenmesi başlatıldı. Tutarın ödeme aracınıza yansıması bankanızın işlem sürelerine bağlıdır.', icon: '↺', tone: 'bank', cta: 'Sipariş Detayını Gör'
  },
  refund_failed: {
    subject: 'İade işleminizde bir gecikme oluştu', eyebrow: 'İade Süreci', title: 'İade işleminizde bir gecikme oluştu.',
    body: 'İade tutarınızı işlerken bir sorunla karşılaştık. Ekibimiz konuyu inceliyor ve en kısa sürede sizinle iletişime geçecek. Anlayışınız için teşekkür ederiz.', icon: '!', tone: 'warning', cta: 'Sipariş Detayını Gör'
  },
  invoice_ready: {
    subject: 'Faturanız hazır', eyebrow: 'Fatura Bilgisi', title: 'Faturanız hazır.',
    body: 'Siparişinize ait faturanız oluşturuldu. Faturanızı aşağıdaki bağlantıdan görüntüleyebilir, dilediğiniz zaman hesabınızdan tekrar ulaşabilirsiniz.', icon: '▤', tone: 'neutral', cta: 'Faturanı Görüntüle'
  },
  order_cancelled: {
    subject: 'Siparişiniz iptal edildi', eyebrow: 'Sipariş İptali', title: 'Siparişiniz iptal edildi.',
    body: 'Siparişiniz iptal edildi. Ödemeniz alındıysa iade süreci ayrıca bilgilendirilecektir. Dilerseniz ürünleri yeniden sepete ekleyerek yeni sipariş oluşturabilirsiniz.', icon: '×', tone: 'warning', cta: 'Alışverişe Devam Et'
  },
  order_item_cancelled: {
    subject: 'Siparişiniz güncellendi — ödenecek tutar değişti', eyebrow: 'Sipariş Güncellemesi', title: 'Siparişinizden bir ürün iptal edildi.',
    body: 'Talebiniz üzerine siparişinizden bir ürün iptal edildi. Güncel sipariş özetiniz ve ödenecek tutarınız aşağıdadır. Havale/EFT ödemenizi güncel tutar üzerinden yapabilir, ödeme açıklamasına sipariş numaranızı yazmayı unutmayın.', icon: '↺', tone: 'bank', cta: 'Sipariş Detayını Gör'
  }
};

const STATUS_TO_TYPE = {
  confirmed: 'payment_success', paid: 'payment_success', pending: 'order_created', preparing: 'order_preparing', packed: 'order_packed', shipped: 'shipment_created', delivered: 'shipment_delivered', cancelled: 'order_cancelled', refunded: 'refund_completed', partially_refunded: 'refund_completed', payment_failed: 'payment_failed'
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
  if (type === 'shipment_created' || type === 'shipment_updated' || tone === 'truck') return '/assets/img/email/status-truck-v4.png';
  if (type === 'order_preparing' || type === 'order_packed' || tone === 'package') return '/assets/img/email/status-package-v4.png';
  if (type === 'bank_transfer_pending' || tone === 'bank') return '/assets/img/email/status-bank-v4.png';
  if (type === 'bank_transfer_reminder') return '/assets/img/email/status-reminder-v4.png';
  if (type === 'bank_transfer_not_received_cancelled' || tone === 'warning') return '/assets/img/email/status-cancel-v4.png';
  if (type === 'shipment_delivered' || tone === 'delivered') return '/assets/img/email/status-delivered-v4.png';
  return '/assets/img/email/status-check-v4.png';
}

function statusIconHtml(type = '', copy = {}, env = {}) {
  const src = absoluteUrl(statusIconAsset(type, copy.tone), env);
  return `<img src="${escapeHtml(src)}" width="42" height="42" alt="" style="display:block;width:42px;height:42px;max-width:42px;max-height:42px;border:0;outline:none;text-decoration:none;margin:0 auto;-ms-interpolation-mode:bicubic;">`;
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
  // Prefer the pre-flattened, non-transparent email PNG for any catalog product.
  // The card images are transparent WebP/PNG; email clients (Outlook, some Gmail
  // paths) can't render WebP and composite transparency onto black — the ivory
  // -email.png guarantees a clean light frame everywhere. Generated for every
  // catalog slug under /assets/img/email/products/. Only used when the item maps
  // to a known catalog product, so the file is guaranteed to exist.
  const catalogSlug = `${product?.slug || product?.id || ''}`.trim().toLowerCase();
  if (product && /^[a-z0-9][a-z0-9-]*$/.test(catalogSlug)) {
    return absoluteUrl(`/assets/img/email/products/${catalogSlug}-email.png`, env);
  }
  // E4: canonical resolver — absolute HTTPS or the branded fallback, never a
  // relative/localhost URL and never an empty src.
  return resolveEmailProductImage({ ...item, image: rawImage, product }, env);
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
    const imageHtml = emailProductThumb({ image: item.image, name: item.name, size: 76, inner: 64, env });
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
  const normalized = Array.isArray(accounts) ? accounts.filter((account) => account && (account.iban || account.bankName || account.bank_name)) : [];
  if (!normalized.length) {
    return noticeBlock('Havale/EFT banka bilgileri bu e-postaya eklenemedi. Lütfen ödeme yapmadan önce sipariş ekranındaki güncel banka bilgilerini kontrol edin veya destek@cosmoskin.com.tr ile iletişime geçin.', 'warning');
  }
  const rows = normalized.map((account) => `
    <tr><td style="padding:14px 18px;border-top:1px solid #eee5dc;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#171717;font-weight:bold;margin-bottom:8px;">${escapeHtml(account.bankName || account.bank_name)}</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.8;color:#6b5e50;">Alıcı: <strong style="color:#171717;">${escapeHtml(account.accountName || account.account_holder)}</strong><br>IBAN: <strong style="color:#171717;word-break:break-all;">${escapeHtml(account.iban)}</strong>${account.branch ? `<br>Şube: ${escapeHtml(account.branch)}` : ''}</div>
    </td></tr>`).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;border-collapse:separate;border-spacing:0;background:#faf7f3;border:1px solid #eee5dc;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a8e82;letter-spacing:1.8px;text-transform:uppercase;font-weight:bold;">Havale/EFT Bilgileri</td></tr>
    <tr><td style="padding:0 18px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;color:#6b5e50;">Ödeme açıklamasına mutlaka <strong style="color:#171717;">${escapeHtml(orderNumber(order))}</strong> yazılmalıdır.</td></tr>
    ${rows}
  </table>`;
}

// E4 — Refund details block. Displays values already computed and persisted by
// the D2/D2B/D3 refund pipeline (refund_records + paid snapshots); this module
// never recalculates a refund amount.
function refundKind(refund = {}, order = {}) {
  const amount = Number(refund.amount || 0);
  const paid = Number(order.total_amount || 0);
  if (amount > 0 && paid > 0 && amount >= paid - 0.005) return 'Tam iade';
  return 'Kısmi iade';
}

function paymentMethodLabel(order = {}, refund = {}) {
  const provider = String(refund.provider || order.payment_provider || order.payment_method || '').toLowerCase();
  if (/iyzico|card|kart/.test(provider)) return 'Kredi/Banka Kartı (iyzico)';
  if (/bank|havale|eft|transfer|manual/.test(provider)) return 'Havale/EFT';
  return '';
}

function refundBlock(refund = {}, order = {}, currency = 'TRY') {
  if (!refund || !(Number(refund.amount) > 0)) return '';
  return infoBox('İade Bilgisi', [
    ['Sipariş No', orderNumber(order)],
    ['İade Referansı', refund.provider_reference || ''],
    ['İade Tutarı', formatMoney(refund.amount, refund.currency || currency)],
    ['İade Türü', refundKind(refund, order)],
    ['Ödeme Yöntemi', paymentMethodLabel(order, refund)]
  ]);
}

// E4 — Invoice details block for invoice_ready.
function invoiceBlock(invoice = {}, order = {}, currency = 'TRY') {
  if (!invoice) return '';
  const issued = invoice.issued_at ? new Date(invoice.issued_at) : null;
  const issuedText = issued && !Number.isNaN(issued.getTime())
    ? issued.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';
  return infoBox('Fatura Bilgisi', [
    ['Sipariş No', orderNumber(order)],
    ['Fatura No', invoice.invoice_number || ''],
    ['Düzenlenme Tarihi', issuedText],
    ['Toplam Tutar', order.total_amount != null ? formatMoney(order.total_amount, currency) : '']
  ]);
}

function noticeBlock(text, tone = '') {
  if (!text) return '';
  const border = tone === 'warning' ? '#d6a08d' : '#c5a16f';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-top:22px;"><tr><td style="background:#fdf9f5;border:1px solid #eee5dc;border-left:4px solid ${border};padding:15px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b5e50;line-height:1.7;">${escapeHtml(text)}</td></tr></table>`;
}

function ctaRows(copy, type, order, shipment, env, invoice = null) {
  const siteUrl = getSiteUrl(env);
  const trackingUrl = shipment?.tracking_url || '';
  const orderUrl = `${siteUrl}/account/profile.html?tab=orders`;
  const firstItem = resolveItem(orderItems(order)[0] || {}, env);
  if (type === 'invoice_ready') {
    const pdfUrl = absoluteUrl(invoice?.pdf_url || '', env);
    const invoicesUrl = `${siteUrl}/account/profile.html?tab=invoices`;
    const primary = pdfUrl || invoicesUrl;
    return `<tr><td style="padding:0 40px 32px;text-align:center;"><a href="${escapeHtml(primary)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 30px;background:#171717;color:#eadcc8;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2.4px;text-transform:uppercase;font-weight:bold;margin:0 4px 10px;">Faturanı Görüntüle</a><a href="${escapeHtml(invoicesUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 22px;border:1px solid #d8cbbb;color:#171717;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;margin:0 4px 10px;">Hesabımdaki Faturalar</a></td></tr>`;
  }
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

export function buildCommerceEmailHtml({ order = {}, type = 'order_created', env = {}, note = '', shipment = {}, items = [], bankAccounts = [], refund = null, invoice = null }) {
  const copy = copyFor(type);
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
  const refundNotice = (type === 'refund_completed' || type === 'refund_pending')
    ? 'İade tutarının hesabınıza veya kartınıza yansıma süresi bankanızın işlem sürelerine göre değişebilir.'
    : '';
  const bodyHtml = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td align="center" style="padding-bottom:22px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" style="width:62px;height:62px;border-radius:62px;border:1px solid #d9cdbc;${iconStyle(copy.tone)}text-align:center;vertical-align:middle;line-height:1;">${statusIconHtml(type, copy, env)}</td></tr></table>
        </td></tr></table>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#9a8e82;letter-spacing:2px;text-transform:uppercase;font-weight:bold;text-align:center;margin:0 0 12px;">${escapeHtml(copy.eyebrow)}</div>
        <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.3;font-weight:normal;color:#171717;text-align:center;margin:0 0 16px;letter-spacing:.2px;">${escapeHtml(copy.title)}</h1>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#55504a;line-height:1.75;margin:0 0 10px;text-align:center;">Merhaba ${escapeHtml(customerName(order))},</p>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#55504a;line-height:1.75;margin:0 auto 12px;text-align:center;max-width:460px;">${escapeHtml(copy.body)}</p>
        ${emailAntiTrimLine(type, order, copy)}
        ${['refund_completed', 'refund_pending', 'refund_failed'].includes(type) ? refundBlock(refund, order, currency) : ''}
        ${type === 'invoice_ready' ? invoiceBlock(invoice, order, currency) : ''}
        ${infoBox('Sipariş Bilgisi', totalRows)}
        ${type === 'bank_transfer_pending' ? bankAccountsBlock(bankAccounts, order) : ''}
        ${(type === 'shipment_created' || type === 'shipment_updated') ? trackingBlock(shipment) : ''}
        ${productsBlock(resolvedItems, env, currency)}
        ${deliveredNotice ? noticeBlock(deliveredNotice) : ''}
        ${refundNotice ? noticeBlock(refundNotice) : ''}
        ${safeNote ? noticeBlock(`COSMOSKIN notu: ${safeNote}`) : ''}`;
  return renderEmailShell({
    env,
    title: copy.subject,
    preheader: copy.body,
    bodyHtml,
    ctaHtml: ctaRows(copy, type, order, shipment, env, invoice),
    footerNote: 'Bu e-posta COSMOSKIN sipariş süreciyle ilgili gönderilmiştir.'
  });
}

export function buildCommerceText({ order = {}, type = 'order_created', shipment = {}, note = '', env = {}, items = [], bankAccounts = [], refund = null, invoice = null }) {
  const copy = copyFor(type);
  const lines = ['COSMOSKIN', copy.subject, copy.body, `Sipariş No: ${orderNumber(order)}`];
  if (order.total_amount != null) lines.push(`Toplam: ${formatMoney(order.total_amount, order.currency || 'TRY')}`);
  if (['refund_completed', 'refund_pending', 'refund_failed'].includes(type) && refund && Number(refund.amount) > 0) {
    lines.push(`İade Tutarı: ${formatMoney(refund.amount, refund.currency || order.currency || 'TRY')} (${refundKind(refund, order)})`);
    if (refund.provider_reference) lines.push(`İade Referansı: ${refund.provider_reference}`);
    const method = paymentMethodLabel(order, refund);
    if (method) lines.push(`Ödeme Yöntemi: ${method}`);
    lines.push('İade tutarının yansıma süresi bankanızın işlem sürelerine göre değişebilir.');
  }
  if (type === 'invoice_ready' && invoice) {
    if (invoice.invoice_number) lines.push(`Fatura No: ${invoice.invoice_number}`);
    const pdf = absoluteUrl(invoice.pdf_url || '', env);
    if (pdf) lines.push(`Faturanı Görüntüle: ${pdf}`);
  }
  if (type === 'bank_transfer_pending') {
    const accounts = Array.isArray(bankAccounts) ? bankAccounts.filter((account) => account && account.iban && (account.bankName || account.bank_name)) : [];
    if (accounts.length) {
      lines.push('Havale/EFT banka bilgileri:');
      accounts.forEach((account) => {
        lines.push(`${account.bankName || account.bank_name} · Alıcı: ${account.accountName || account.account_holder || 'Aktif hesap alıcısı'} · IBAN: ${account.iban}${account.branch ? ` · Şube: ${account.branch}` : ''}`);
      });
    } else {
      lines.push('Havale/EFT banka bilgileri bu e-postaya eklenemedi. Ödeme yapmadan önce sipariş ekranındaki güncel banka bilgilerini kontrol edin veya destek@cosmoskin.com.tr ile iletişime geçin.');
    }
  }
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
