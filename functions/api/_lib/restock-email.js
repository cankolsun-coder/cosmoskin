function escapeHtml(value = '') {
  return String(value)
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
    email: env.BREVO_SENDER_EMAIL || env.ORDER_FROM_EMAIL || env.CONTACT_FROM_EMAIL || env.NEWSLETTER_FROM_EMAIL || 'info@cosmoskin.com.tr',
    name: env.BREVO_SENDER_NAME || 'COSMOSKIN'
  };
}

export function renderRestockEmail({ productName = 'Beklediğin ürün', productUrl = '', env = {} } = {}) {
  const url = productUrl || siteUrl(env);
  const plainText = `Beklediğin ürün tekrar stokta.\n\n${productName} yeniden satın alınabilir durumda. Stoklar sınırlı olabilir; ürünü inceleyerek sepetine ekleyebilirsin.\n\nÜrünü İncele: ${url}`;
  const htmlContent = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Favorindeki ürün tekrar stokta</title></head>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#17120f;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f1ea;margin:0;padding:26px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#fffaf4;border:1px solid #eadfce;border-radius:22px;overflow:hidden;">
      <tr><td style="padding:28px;text-align:center;background:#efe6da;border-bottom:1px solid #e5d7c4;">
        <div style="font-size:20px;letter-spacing:4px;text-transform:uppercase;font-weight:700;color:#17120f;">COSMOSKIN</div>
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8d7c67;margin-top:8px;">Premium Korean Skincare</div>
      </td></tr>
      <tr><td style="padding:34px 30px 30px;">
        <div style="font-size:12px;letter-spacing:1.8px;text-transform:uppercase;color:#8d7c67;font-weight:700;margin-bottom:12px;">Stok Bildirimi</div>
        <h1 style="margin:0;font-size:30px;line-height:1.15;color:#17120f;font-weight:650;">Beklediğin ürün tekrar stokta.</h1>
        <p style="margin:16px 0 0;font-size:15px;line-height:1.9;color:#4d4238;">${escapeHtml(productName)} yeniden satın alınabilir durumda. Stoklar sınırlı olabilir; ürünü inceleyerek sepetine ekleyebilirsin.</p>
        <div style="margin-top:28px;"><a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#17120f;color:#fff;text-decoration:none;font-size:13px;font-weight:750;">Ürünü İncele</a></div>
      </td></tr>
      <tr><td style="padding:18px 30px;background:#faf4ec;border-top:1px solid #eadfce;font-size:12px;line-height:1.7;color:#8d7c67;text-align:center;">Bu mesaj stok bildirimi talebin üzerine gönderildi.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject: 'Favorindeki ürün tekrar stokta', htmlContent, plainText };
}

export async function sendRestockEmail(env, { to, productName, productUrl }) {
  const email = String(to || '').trim().toLowerCase();
  if (!email) return { sent: false, skipped: true, reason: 'email_missing' };
  if (!env?.BREVO_API_KEY) return { sent: false, skipped: true, reason: 'BREVO_API_KEY_missing' };
  const content = renderRestockEmail({ productName, productUrl, env });
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': env.BREVO_API_KEY, accept: 'application/json' },
    body: JSON.stringify({
      sender: sender(env),
      to: [{ email }],
      subject: content.subject,
      htmlContent: content.htmlContent,
      textContent: content.plainText
    })
  });
  const detail = await response.text();
  if (!response.ok) throw new Error(`Brevo error ${response.status}: ${detail}`);
  return { sent: true, detail };
}
