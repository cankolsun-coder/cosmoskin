const DEFAULT_SITE_URL = 'https://www.cosmoskin.com.tr';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getSiteUrl(env = {}) {
  const raw = String(env.PUBLIC_SITE_URL || env.SITE_URL || DEFAULT_SITE_URL).trim();
  return (raw || DEFAULT_SITE_URL).replace(/\/$/, '');
}

export function renderNewsletterWelcomeEmail({ email = '', env = {} } = {}) {
  const siteUrl = getSiteUrl(env);
  const safeEmail = escapeHtml(email);
  const subject = 'COSMOSKIN Journal’a hoş geldin';
  const preheader = 'Cilt bakımında daha sakin, daha seçilmiş bir başlangıç.';
  const text = `COSMOSKIN Journal’a hoş geldin.

Cilt bakımını kalabalıktan arındıran seçkiler, rutin notları ve Kore cilt bakımına dair sade ama etkili öneriler paylaşacağız.

COSMOSKIN’i keşfet:
${siteUrl}/

Bu e-posta, COSMOSKIN Journal’a kaydolduğun için gönderildi.`;

  const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;color:#161412;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;visibility:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f0e8;margin:0;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#fffaf4;border:1px solid #e8ddcf;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(60,45,28,.08);">
          <tr>
            <td style="padding:34px 30px 26px;text-align:center;background:linear-gradient(180deg,#fbf7f0 0%,#f3eadf 100%);border-bottom:1px solid #e8ddcf;">
              <div style="font-size:12px;letter-spacing:.32em;text-transform:uppercase;color:#9b7a3c;font-weight:700;margin:0 0 14px;">COSMOSKIN Journal</div>
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:1.08;letter-spacing:.08em;color:#141210;text-transform:uppercase;">COSMOSKIN</div>
              <div style="width:44px;height:1px;background:#b9944d;margin:18px auto 0;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:42px 34px 18px;">
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:34px;line-height:1.14;letter-spacing:-.02em;color:#161412;">Cilt bakımında daha sakin, daha seçilmiş bir başlangıç.</h1>
              <p style="margin:22px 0 0;font-size:15.5px;line-height:1.9;color:#4a4238;">COSMOSKIN Journal’a hoş geldin. Burada cilt bakımını kalabalıktan arındıran seçkiler, rutin notları ve Kore cilt bakımına dair sade ama etkili öneriler paylaşacağız.</p>
              <p style="margin:16px 0 0;font-size:15.5px;line-height:1.9;color:#4a4238;">Amacımız daha fazlasını önermek değil; cildin için gerçekten anlamlı olanı seçmene yardımcı olmak.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 34px 42px;">
              <a href="${siteUrl}/" target="_blank" rel="noopener" style="display:inline-block;background:#151210;color:#ffffff;text-decoration:none;border-radius:999px;padding:15px 28px;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;">COSMOSKIN’i Keşfet</a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 34px;background:#f7f0e7;border-top:1px solid #eadfd2;text-align:center;">
              <p style="margin:0;font-size:12.5px;line-height:1.8;color:#756a5d;">Bu e-posta, COSMOSKIN Journal’a kaydolduğun için gönderildi.</p>
              ${safeEmail ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.8;color:#8c8174;">Kayıtlı adres: ${safeEmail}</p>` : ''}
              <p style="margin:14px 0 0;font-size:12px;line-height:1.8;color:#8c8174;">Abonelikten ayrılma bağlantısı, abonelik yönetimi akışı tamamlandığında bu alana eklenecektir. Bu e-postada kırık veya geçici bir ayrılma linki kullanılmamıştır.</p>
              <p style="margin:14px 0 0;font-size:12px;line-height:1.8;color:#161412;"><a href="${siteUrl}/" target="_blank" rel="noopener" style="color:#161412;text-decoration:none;">www.cosmoskin.com.tr</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
