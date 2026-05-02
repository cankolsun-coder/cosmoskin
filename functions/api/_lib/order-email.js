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

export async function sendOrderStatusEmail(env, payload = {}) {
  const order = payload.order || {};
  const to = String(order.customer_email || '').trim().toLowerCase();
  if (!to) return { sent: false, skipped: true, reason: 'customer_email_missing' };
  if (!env?.BREVO_API_KEY) return { sent: false, skipped: true, reason: 'BREVO_API_KEY_missing' };

  const sender = getSender(env);
  const status = String(payload.status || order.status || '').trim();
  const copy = STATUS_COPY[status] || { subject: 'Sipariş durumunuz güncellendi' };
  const subject = `${copy.subject} | ${order.order_number || 'COSMOSKIN'}`;
  const htmlContent = buildEmailHtml({ ...payload, status, env });

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-key': env.BREVO_API_KEY,
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to, name: `${order.customer_first_name || ''} ${order.customer_last_name || ''}`.trim() || to }],
      subject,
      htmlContent
    })
  });

  const detail = await response.text();
  if (!response.ok) throw new Error(`Brevo error ${response.status}: ${detail}`);
  return { sent: true, detail };
}
