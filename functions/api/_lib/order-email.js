function escapeHtml(value = '') {
  return String(value)
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

function getSender(env = {}) {
  return {
    email: env.ORDER_FROM_EMAIL || env.CONTACT_FROM_EMAIL || env.NEWSLETTER_FROM_EMAIL || 'info@cosmoskin.com.tr',
    name: env.BREVO_SENDER_NAME || env.ORDER_SENDER_NAME || 'COSMOSKIN'
  };
}

const STATUS_COPY = {
  confirmed: {
    subject: 'Siparişiniz onaylandı',
    title: 'Siparişiniz onaylandı.',
    body: 'Ödemeniz başarıyla alındı. Siparişiniz hazırlık sürecine geçti.'
  },
  packed: {
    subject: 'Siparişiniz paketlendi',
    title: 'Siparişiniz paketlendi.',
    body: 'Siparişiniz kargoya teslim edilmek üzere paketlendi.'
  },
  paid: {
    subject: 'Siparişiniz onaylandı',
    title: 'Siparişiniz onaylandı.',
    body: 'Ödemeniz başarıyla alındı. Siparişiniz hazırlık sürecine geçti.'
  },
  preparing: {
    subject: 'Siparişiniz hazırlanıyor',
    title: 'Siparişiniz hazırlanıyor.',
    body: 'COSMOSKIN seçkiniz özenle hazırlanıyor. Kargoya verildiğinde takip bilgilerinizi paylaşacağız.'
  },
  shipped: {
    subject: 'Siparişiniz kargoya verildi',
    title: 'Siparişiniz kargoya verildi.',
    body: 'Siparişiniz kargoya teslim edildi. Takip bilgileri aşağıda yer alıyor.'
  },
  delivered: {
    subject: 'Siparişiniz teslim edildi',
    title: 'Siparişiniz teslim edildi.',
    body: 'Siparişiniz teslim edildi olarak işaretlendi. Deneyiminizi hesabınızdan değerlendirebilirsiniz.'
  },
  cancelled: {
    subject: 'Siparişiniz iptal edildi',
    title: 'Siparişiniz iptal edildi.',
    body: 'Siparişiniz iptal edildi. Ödeme/iade süreci için destek ekibimiz gerektiğinde sizinle iletişime geçecektir.'
  },
  refunded: {
    subject: 'İade süreciniz tamamlandı',
    title: 'İade süreciniz tamamlandı.',
    body: 'Siparişiniz için iade süreci tamamlandı olarak işaretlendi.'
  },
  partially_refunded: {
    subject: 'Kısmi iade süreciniz güncellendi',
    title: 'Kısmi iade süreciniz güncellendi.',
    body: 'Siparişiniz için kısmi iade süreci güncellendi.'
  },
  payment_failed: {
    subject: 'Ödeme işlemi tamamlanamadı',
    title: 'Ödeme işlemi tamamlanamadı.',
    body: 'Siparişiniz için ödeme işlemi tamamlanamadı. Dilerseniz sepetinizi tekrar oluşturup ödeme deneyebilirsiniz.'
  }
};

function buildTrackingBlock(shipment = {}) {
  const carrier = shipment.carrier || '';
  const trackingNumber = shipment.tracking_number || '';
  const trackingUrl = shipment.tracking_url || '';
  if (!carrier && !trackingNumber && !trackingUrl) return '';

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;border-collapse:collapse;background:#fcfaf7;border:1px solid #eee4d9;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="padding:16px 18px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8a7f72;font-weight:700;border-bottom:1px solid #eee4d9;">Kargo Bilgisi</td>
      </tr>
      ${carrier ? `<tr><td style="padding:12px 18px;font-size:14px;color:#4a4038;">Kargo Firması: <strong style="color:#15110f;">${escapeHtml(carrier)}</strong></td></tr>` : ''}
      ${trackingNumber ? `<tr><td style="padding:12px 18px;font-size:14px;color:#4a4038;">Takip No: <strong style="color:#15110f;">${escapeHtml(trackingNumber)}</strong></td></tr>` : ''}
      ${trackingUrl ? `<tr><td style="padding:12px 18px 18px;font-size:14px;color:#4a4038;"><a href="${escapeHtml(trackingUrl)}" target="_blank" rel="noopener" style="color:#15110f;text-decoration:underline;font-weight:700;">Kargo takibini aç</a></td></tr>` : ''}
    </table>`;
}

function buildItemsBlock(items = [], currency = 'TRY') {
  const rows = (items || []).slice(0, 8).map((item) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #eee4d9;vertical-align:top;">
        <div style="font-size:14px;line-height:1.5;color:#15110f;font-weight:700;">${escapeHtml(item.product_name || 'Ürün')}</div>
        <div style="font-size:12px;line-height:1.5;color:#8a7f72;">${escapeHtml(item.brand || '')} · ${Number(item.quantity || 1)} adet</div>
      </td>
      <td align="right" style="padding:12px 0;border-bottom:1px solid #eee4d9;vertical-align:top;font-size:14px;color:#15110f;font-weight:700;">${formatMoney(item.line_total || item.unit_price || 0, currency)}</td>
    </tr>
  `).join('');

  return rows ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;border-collapse:collapse;">
      <tr>
        <td colspan="2" style="padding:0 0 8px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8a7f72;font-weight:700;">Sipariş Özeti</td>
      </tr>
      ${rows}
    </table>` : '';
}

function buildEmailHtml({ order = {}, status = '', message = '', shipment = {}, items = [], env = {} }) {
  const siteUrl = getSiteUrl(env);
  const copy = STATUS_COPY[status] || {
    subject: 'Sipariş durumunuz güncellendi',
    title: 'Sipariş durumunuz güncellendi.',
    body: 'Siparişiniz için yeni bir durum güncellemesi yapıldı.'
  };
  const orderNumber = order.order_number || order.id || '';
  const greeting = `${order.customer_first_name || ''} ${order.customer_last_name || ''}`.trim() || 'Merhaba';
  const adminMessage = String(message || '').trim();

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(copy.subject)} | COSMOSKIN</title></head>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#181818;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">${escapeHtml(copy.body)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f1ea;margin:0;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#fff;border:1px solid #e7ded2;border-radius:22px;overflow:hidden;">
        <tr><td style="padding:28px 28px 24px;background:linear-gradient(180deg,#f8f2ea 0%,#f1e7da 100%);border-bottom:1px solid #ebe2d7;text-align:center;">
          <a href="${siteUrl}" target="_blank" rel="noopener" style="text-decoration:none;color:#15110f;">
            <div style="font-size:20px;letter-spacing:4px;text-transform:uppercase;font-weight:700;">COSMOSKIN</div>
            <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a7f72;margin-top:8px;">Premium Korean Skincare</div>
          </a>
        </td></tr>
        <tr><td style="padding:34px 28px 30px;">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a7f72;font-weight:700;margin-bottom:12px;">Sipariş Güncellemesi</div>
          <h1 style="margin:0;font-size:30px;line-height:1.18;font-weight:650;color:#15110f;">${escapeHtml(copy.title)}</h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">Merhaba ${escapeHtml(greeting)},</p>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">${escapeHtml(copy.body)}</p>
          <div style="margin-top:20px;padding:18px;border:1px solid #eee4d9;border-radius:16px;background:#fcfaf7;">
            <div style="font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8a7f72;font-weight:700;margin-bottom:8px;">Sipariş No</div>
            <div style="font-size:18px;color:#15110f;font-weight:750;">${escapeHtml(orderNumber)}</div>
            <div style="font-size:13px;color:#8a7f72;margin-top:8px;">Toplam: ${formatMoney(order.total_amount || 0, order.currency || 'TRY')}</div>
          </div>
          ${adminMessage ? `<div style="margin-top:18px;padding:18px;border-left:3px solid #b8956c;background:#fbf7f1;border-radius:12px;font-size:14px;line-height:1.8;color:#4f473f;">${escapeHtml(adminMessage)}</div>` : ''}
          ${buildTrackingBlock(shipment)}
          ${buildItemsBlock(items, order.currency || 'TRY')}
        </td></tr>
        <tr><td style="padding:0 28px 30px;text-align:center;">
          <a href="${siteUrl}/account/orders.html" target="_blank" rel="noopener" style="display:inline-block;padding:13px 24px;border-radius:999px;background:#15110f;color:#fff;text-decoration:none;font-size:13px;font-weight:750;">Siparişlerimi Gör</a>
        </td></tr>
        <tr><td style="padding:20px 28px;background:#faf7f2;border-top:1px solid #eee5da;font-size:12px;line-height:1.8;color:#857a6f;text-align:center;">
          Bu mesaj COSMOSKIN sipariş sistemi tarafından gönderildi. Sorularınız için destek ekibimizle iletişime geçebilirsiniz.<br>
          <a href="${siteUrl}" target="_blank" rel="noopener" style="color:#15110f;text-decoration:none;">cosmoskin.com.tr</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildPlainText({ order = {}, status = '', message = '', shipment = {}, env = {} }) {
  const copy = STATUS_COPY[status] || {
    subject: 'Sipariş durumunuz güncellendi',
    body: 'Siparişiniz için yeni bir durum güncellemesi yapıldı.'
  };
  const orderNumber = order.order_number || order.id || '';
  const lines = [
    'COSMOSKIN',
    copy.subject,
    copy.body,
    orderNumber ? `Sipariş No: ${orderNumber}` : '',
    order.total_amount ? `Toplam: ${formatMoney(order.total_amount || 0, order.currency || 'TRY')}` : '',
    shipment.carrier || shipment.carrier_name ? `Kargo Firması: ${shipment.carrier || shipment.carrier_name}` : '',
    shipment.tracking_number ? `Takip No: ${shipment.tracking_number}` : '',
    shipment.tracking_url ? `Takip Bağlantısı: ${shipment.tracking_url}` : '',
    message ? `Not: ${message}` : '',
    `Destek: ${env.CONTACT_FROM_EMAIL || 'info@cosmoskin.com.tr'}`
  ];
  return lines.filter(Boolean).join('\n');
}

async function sendBrevoEmail(env, payload = {}) {
  if (!payload.to) return { sent: false, skipped: true, reason: 'customer_email_missing' };
  if (!env?.BREVO_API_KEY) return { sent: false, skipped: true, reason: 'BREVO_API_KEY_missing' };
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-key': env.BREVO_API_KEY,
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender: payload.sender || getSender(env),
      to: [{ email: payload.to, name: payload.toName || payload.to }],
      subject: payload.subject,
      htmlContent: payload.htmlContent,
      textContent: payload.textContent || payload.plainTextContent || ''
    })
  });

  const detail = await response.text();
  let parsed = null;
  try { parsed = detail ? JSON.parse(detail) : null; } catch { parsed = null; }
  if (!response.ok) throw new Error(`Brevo error ${response.status}`);
  return { sent: true, provider: 'brevo', provider_message_id: parsed?.messageId || parsed?.messageIds?.[0] || null, detail: parsed || detail || null };
}

export async function sendOrderStatusEmail(env, payload = {}) {
  const order = payload.order || {};
  const to = String(order.customer_email || '').trim().toLowerCase();
  if (!to) return { sent: false, skipped: true, reason: 'customer_email_missing' };
  if (!env?.BREVO_API_KEY) return { sent: false, skipped: true, reason: 'BREVO_API_KEY_missing' };

  const status = String(payload.status || order.status || '').trim();
  const copy = STATUS_COPY[status] || { subject: 'Sipariş durumunuz güncellendi' };
  const subject = `${copy.subject} | ${order.order_number || 'COSMOSKIN'}`;
  const htmlContent = buildEmailHtml({ ...payload, status, env });
  const textContent = buildPlainText({ ...payload, status, env });

  return await sendBrevoEmail(env, {
    to,
    toName: `${order.customer_first_name || ''} ${order.customer_last_name || ''}`.trim() || to,
    subject,
    htmlContent,
    textContent
  });
}

function buildShipmentEmailHtml({ order = {}, shipment = {}, env = {} }) {
  const siteUrl = getSiteUrl(env);
  const orderNumber = order.order_number || order.id || '';
  const carrier = shipment.carrier_name || shipment.carrier || '';
  const trackingNumber = shipment.tracking_number || '';
  const trackingUrl = shipment.tracking_url || '';
  const supportEmail = env.CONTACT_FROM_EMAIL || env.ORDER_FROM_EMAIL || 'info@cosmoskin.com.tr';
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Siparişin kargoya verildi | COSMOSKIN</title></head>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#181818;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">COSMOSKIN siparişin kargoya verildi. Kargo durumunu takip bağlantısı üzerinden görüntüleyebilirsin.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f1ea;margin:0;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#fff;border:1px solid #e7ded2;border-radius:24px;overflow:hidden;">
        <tr><td style="padding:30px 30px 26px;background:linear-gradient(180deg,#f8f2ea 0%,#efe4d6 100%);border-bottom:1px solid #e9dece;text-align:center;">
          <a href="${siteUrl}" target="_blank" rel="noopener" style="text-decoration:none;color:#15110f;"><div style="font-size:21px;letter-spacing:4px;text-transform:uppercase;font-weight:750;">COSMOSKIN</div><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a7f72;margin-top:8px;">Premium Korean Skincare</div></a>
        </td></tr>
        <tr><td style="padding:36px 30px 30px;">
          <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a7f72;font-weight:800;margin-bottom:12px;">Kargo Güncellemesi</div>
          <h1 style="margin:0;font-size:31px;line-height:1.16;font-weight:650;color:#15110f;">Siparişin kargoya verildi.</h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">COSMOSKIN siparişin kargoya verildi. Kargo durumunu takip bağlantısı üzerinden görüntüleyebilirsin.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;border-collapse:collapse;background:#fcfaf7;border:1px solid #eee4d9;border-radius:18px;overflow:hidden;">
            <tr><td style="padding:16px 18px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8a7f72;font-weight:800;border-bottom:1px solid #eee4d9;">Takip Bilgileri</td></tr>
            ${orderNumber ? `<tr><td style="padding:12px 18px;font-size:14px;color:#4a4038;">Sipariş No: <strong style="color:#15110f;">${escapeHtml(orderNumber)}</strong></td></tr>` : ''}
            ${carrier ? `<tr><td style="padding:12px 18px;font-size:14px;color:#4a4038;">Kargo Firması: <strong style="color:#15110f;">${escapeHtml(carrier)}</strong></td></tr>` : ''}
            ${trackingNumber ? `<tr><td style="padding:12px 18px;font-size:14px;color:#4a4038;">Takip No: <strong style="color:#15110f;">${escapeHtml(trackingNumber)}</strong></td></tr>` : ''}
          </table>
        </td></tr>
        <tr><td style="padding:0 30px 34px;text-align:center;">
          ${trackingUrl ? `<a href="${escapeHtml(trackingUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 25px;border-radius:999px;background:#15110f;color:#fff;text-decoration:none;font-size:13px;font-weight:800;">Kargoyu Takip Et</a>` : `<a href="${siteUrl}/order-tracking.html" target="_blank" rel="noopener" style="display:inline-block;padding:14px 25px;border-radius:999px;background:#15110f;color:#fff;text-decoration:none;font-size:13px;font-weight:800;">Kargoyu Takip Et</a>`}
        </td></tr>
        <tr><td style="padding:20px 28px;background:#faf7f2;border-top:1px solid #eee5da;font-size:12px;line-height:1.8;color:#857a6f;text-align:center;">Soruların için <a href="mailto:${escapeHtml(supportEmail)}" style="color:#15110f;text-decoration:none;">${escapeHtml(supportEmail)}</a> adresinden bize ulaşabilirsin.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildShipmentPlainText({ order = {}, shipment = {}, env = {} }) {
  const supportEmail = env.CONTACT_FROM_EMAIL || env.ORDER_FROM_EMAIL || 'info@cosmoskin.com.tr';
  return [
    'COSMOSKIN',
    'Siparişin kargoya verildi',
    'COSMOSKIN siparişin kargoya verildi. Kargo durumunu takip bağlantısı üzerinden görüntüleyebilirsin.',
    order.order_number || order.id ? `Sipariş No: ${order.order_number || order.id}` : '',
    shipment.carrier_name || shipment.carrier ? `Kargo Firması: ${shipment.carrier_name || shipment.carrier}` : '',
    shipment.tracking_number ? `Takip No: ${shipment.tracking_number}` : '',
    shipment.tracking_url ? `Kargoyu Takip Et: ${shipment.tracking_url}` : '',
    `Destek: ${supportEmail}`
  ].filter(Boolean).join('\n');
}

export async function sendShipmentEmail(env, payload = {}) {
  const order = payload.order || {};
  const shipment = payload.shipment || {};
  const to = String(payload.to || order.customer_email || '').trim().toLowerCase();
  if (!to) return { sent: false, skipped: true, reason: 'customer_email_missing' };
  if (!env?.BREVO_API_KEY) return { sent: false, skipped: true, reason: 'BREVO_API_KEY_missing' };
  const subject = 'Siparişin kargoya verildi';
  return await sendBrevoEmail(env, {
    to,
    toName: `${order.customer_first_name || ''} ${order.customer_last_name || ''}`.trim() || to,
    subject,
    htmlContent: buildShipmentEmailHtml({ order, shipment, env }),
    textContent: buildShipmentPlainText({ order, shipment, env })
  });
}


const TRANSACTIONAL_COPY = {
  return_request_received: {
    subject: 'İade talebin alındı',
    eyebrow: 'İade Süreci',
    title: 'İade talebin alındı.',
    body: 'İade talebin COSMOSKIN ekibi tarafından incelenmek üzere alındı. Değerlendirme sonucunu e-posta yoluyla paylaşacağız.'
  },
  return_approved: {
    subject: 'İade talebin onaylandı',
    eyebrow: 'İade Değerlendirmesi',
    title: 'İade talebin onaylandı.',
    body: 'İade talebin COSMOSKIN ekibi tarafından onaylandı. Ürün ambalaj, kullanım ve hijyen koşulları nihai kontrolde tekrar değerlendirilecektir.'
  },
  return_rejected: {
    subject: 'İade talebin değerlendirildi',
    eyebrow: 'İade Değerlendirmesi',
    title: 'İade talebin değerlendirildi.',
    body: 'İade talebin COSMOSKIN ekibi tarafından değerlendirildi. Uygunluk sonucu ve gerekçesi sipariş kaydına işlendi.'
  },
  refund_completed: {
    subject: 'İade ödemen tamamlandı',
    eyebrow: 'İade Ödemesi',
    title: 'İade ödemen tamamlandı.',
    body: 'COSMOSKIN iade sürecin tamamlandı. İade ödemen, ödeme sağlayıcının işlem sürelerine bağlı olarak kartına yansıyacaktır.'
  },
  shipment_delivered: {
    subject: 'Siparişin teslim edildi',
    eyebrow: 'Teslimat Tamamlandı',
    title: 'Siparişin teslim edildi.',
    body: 'COSMOSKIN siparişin teslim edildi. Deneyimini bizimle paylaşmak istersen ürün sayfasından yorum bırakabilirsin.'
  }
};

function buildTransactionalHtml({ order = {}, type = '', env = {}, note = '', cta = null } = {}) {
  const copy = TRANSACTIONAL_COPY[type] || TRANSACTIONAL_COPY.return_request_received;
  const siteUrl = getSiteUrl(env);
  const supportEmail = env.CONTACT_FROM_EMAIL || env.ORDER_FROM_EMAIL || 'info@cosmoskin.com.tr';
  const orderNumber = order.order_number || order.id || '';
  const ctaHtml = cta && cta.href && cta.label ? `<tr><td style="padding:0 30px 34px;text-align:center;"><a href="${escapeHtml(cta.href)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 25px;border-radius:999px;background:#15110f;color:#fff;text-decoration:none;font-size:13px;font-weight:800;">${escapeHtml(cta.label)}</a></td></tr>` : '';
  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(copy.subject)} | COSMOSKIN</title></head>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#181818;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">${escapeHtml(copy.body)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f1ea;margin:0;padding:24px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#fff;border:1px solid #e7ded2;border-radius:24px;overflow:hidden;">
      <tr><td style="padding:30px 30px 26px;background:linear-gradient(180deg,#f8f2ea 0%,#efe4d6 100%);border-bottom:1px solid #e9dece;text-align:center;"><a href="${siteUrl}" target="_blank" rel="noopener" style="text-decoration:none;color:#15110f;"><div style="font-size:21px;letter-spacing:4px;text-transform:uppercase;font-weight:750;">COSMOSKIN</div><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a7f72;margin-top:8px;">Premium Korean Skincare</div></a></td></tr>
      <tr><td style="padding:36px 30px 30px;"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a7f72;font-weight:800;margin-bottom:12px;">${escapeHtml(copy.eyebrow)}</div><h1 style="margin:0;font-size:31px;line-height:1.16;font-weight:650;color:#15110f;">${escapeHtml(copy.title)}</h1><p style="margin:16px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">${escapeHtml(copy.body)}</p>
      ${orderNumber ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;border-collapse:collapse;background:#fcfaf7;border:1px solid #eee4d9;border-radius:18px;overflow:hidden;"><tr><td style="padding:16px 18px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8a7f72;font-weight:800;border-bottom:1px solid #eee4d9;">Sipariş Bilgisi</td></tr><tr><td style="padding:12px 18px;font-size:14px;color:#4a4038;">Sipariş No: <strong style="color:#15110f;">${escapeHtml(orderNumber)}</strong></td></tr></table>` : ''}
      ${note ? `<p style="margin:20px 0 0;padding:14px 16px;border-radius:16px;background:#faf7f2;border:1px solid #eee4d9;font-size:13px;line-height:1.7;color:#5b5148;">${escapeHtml(note)}</p>` : ''}</td></tr>
      ${ctaHtml}
      <tr><td style="padding:20px 28px;background:#faf7f2;border-top:1px solid #eee5da;font-size:12px;line-height:1.8;color:#857a6f;text-align:center;">Soruların için <a href="mailto:${escapeHtml(supportEmail)}" style="color:#15110f;text-decoration:none;">${escapeHtml(supportEmail)}</a> adresinden bize ulaşabilirsin.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function buildTransactionalText({ order = {}, type = '', env = {}, note = '', cta = null } = {}) {
  const copy = TRANSACTIONAL_COPY[type] || TRANSACTIONAL_COPY.return_request_received;
  const supportEmail = env.CONTACT_FROM_EMAIL || env.ORDER_FROM_EMAIL || 'info@cosmoskin.com.tr';
  return [
    'COSMOSKIN',
    copy.subject,
    copy.body,
    order.order_number || order.id ? `Sipariş No: ${order.order_number || order.id}` : '',
    note ? `Not: ${note}` : '',
    cta && cta.href ? `${cta.label || 'Bağlantı'}: ${cta.href}` : '',
    `Destek: ${supportEmail}`
  ].filter(Boolean).join('\n');
}

export function getCommerceEmailSubject(type = '') {
  return (TRANSACTIONAL_COPY[type] || TRANSACTIONAL_COPY.return_request_received).subject;
}

export async function sendCommerceTransactionalEmail(env, payload = {}) {
  const order = payload.order || {};
  const to = String(payload.to || order.customer_email || '').trim().toLowerCase();
  if (!to) return { sent: false, skipped: true, reason: 'customer_email_missing' };
  if (!env?.BREVO_API_KEY) return { sent: false, skipped: true, reason: 'BREVO_API_KEY_missing' };
  const type = String(payload.type || 'return_request_received').trim();
  const subject = payload.subject || getCommerceEmailSubject(type);
  return await sendBrevoEmail(env, {
    to,
    toName: `${order.customer_first_name || ''} ${order.customer_last_name || ''}`.trim() || to,
    subject,
    htmlContent: buildTransactionalHtml({ ...payload, order, type, env }),
    textContent: buildTransactionalText({ ...payload, order, type, env })
  });
}
