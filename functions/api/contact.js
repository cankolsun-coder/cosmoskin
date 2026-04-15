function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function nl2br(value = '') {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8'
    }
  });
}

function formatDateTR(date = new Date()) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul'
  }).format(date);
}

function createReferenceCode(prefix = 'CS') {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${y}${m}${d}-${rand}`;
}

function getRecipientConfig(kind, env) {
  if (kind === 'partnership') {
    return {
      key: 'partnership',
      to: env.PARTNERSHIP_TO_EMAIL || 'partnership@cosmoskin.com.tr',
      fallback: 'partnership@cosmoskin.com.tr',
      label: 'İş Ortaklığı Formu',
      adminSubject: 'Yeni İş Ortaklığı Talebi',
      customerSubject: 'Başvurunuzu aldık | COSMOSKIN',
      senderName: 'COSMOSKIN Partnerships',
      referencePrefix: 'CP'
    };
  }

  return {
    key: 'support',
    to: env.CONTACT_TO_EMAIL || 'destek@cosmoskin.com.tr',
    fallback: 'destek@cosmoskin.com.tr',
    label: 'Müşteri Destek Formu',
    adminSubject: 'Yeni Müşteri Destek Talebi',
    customerSubject: 'Mesajınızı aldık | COSMOSKIN',
    senderName: 'COSMOSKIN Support',
    referencePrefix: 'CS'
  };
}


function getSiteUrl(env) {
  const raw = String(env.PUBLIC_SITE_URL || env.SITE_URL || 'https://www.cosmoskin.com.tr').trim();
  return raw.replace(/\/$/, '');
}

function getBrandAssets(env) {
  const siteUrl = getSiteUrl(env);
  return {
    siteUrl,
    logoUrl: `${siteUrl}/assets/logo-mark.png`,
    supportUrl: `${siteUrl}/contact.html`,
    shopUrl: `${siteUrl}/collections/routine.html`,
    instagramUrl: 'https://instagram.com/cosmoskin.tr',
    partnershipEmail: 'partnership@cosmoskin.com.tr',
    supportEmail: 'destek@cosmoskin.com.tr'
  };
}

function buildEmailShell({ preheader = '', title = '', eyebrow = '', body = '', footer = '', env }) {
  const assets = getBrandAssets(env || {});
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#181818;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f1ea;margin:0;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border:1px solid #e7ded2;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 24px;background:linear-gradient(180deg,#f7f2eb 0%,#f3ede5 100%);border-bottom:1px solid #ebe2d7;text-align:center;">
              <a href="${assets.siteUrl}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;">
                <img src="${assets.logoUrl}" alt="COSMOSKIN" width="68" style="display:block;margin:0 auto 10px;width:68px;max-width:68px;height:auto;border:0;outline:none;text-decoration:none;">
              </a>
              <div style="font-size:18px;line-height:1.1;letter-spacing:3px;text-transform:uppercase;color:#161616;font-weight:600;">COSMOSKIN</div>
              <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a7f72;margin-top:10px;">Premium Korean Skincare</div>
              <div style="width:42px;height:2px;background:#e6dccf;margin:16px auto 0;border-radius:2px;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 28px 28px;">
              ${eyebrow ? `<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a7f72;font-weight:600;margin-bottom:10px;">${escapeHtml(eyebrow)}</div>` : ''}
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:999px;background:#141414;">
                    <a href="${assets.supportUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;font-size:13px;line-height:1;color:#ffffff;text-decoration:none;font-weight:600;">Destek Merkezini Aç</a>
                  </td>
                  <td style="width:10px;"></td>
                  <td align="center" style="border-radius:999px;background:#f4eee7;border:1px solid #e7ded2;">
                    <a href="${assets.shopUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;font-size:13px;line-height:1;color:#181818;text-decoration:none;font-weight:600;">Seçkiyi İncele</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;background:#faf7f2;border-top:1px solid #eee5da;">
              ${footer}
              <div style="margin-top:16px;padding-top:14px;border-top:1px solid #eee5da;font-size:12px;line-height:1.8;color:#857a6f;text-align:center;">
                <a href="${assets.siteUrl}" target="_blank" rel="noopener" style="color:#181818;text-decoration:none;margin:0 10px;">Web Sitesi</a>
                <a href="${assets.instagramUrl}" target="_blank" rel="noopener" style="color:#181818;text-decoration:none;margin:0 10px;">Instagram</a>
                <a href="mailto:${assets.supportEmail}" style="color:#181818;text-decoration:none;margin:0 10px;">${assets.supportEmail}</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}


function buildSupportRows(data) {
  const rows = [
    ['Talep Türü', data.config.label],
    ['Referans Kodu', data.referenceCode],
    ['Ad Soyad', data.fullName],
    ['E-posta', data.email],
    ['Konu', data.topic || '—'],
    ['Sipariş / Referans', data.reference || '—'],
    ['Tarih', data.submittedAt]
  ];

  return rows.map(([label, value]) => `
    <tr>
      <td style="padding:12px 0;color:#7a6f63;font-size:13px;border-bottom:1px solid #efe6db;vertical-align:top;width:180px;">${escapeHtml(label)}</td>
      <td style="padding:12px 0;color:#181818;font-size:14px;border-bottom:1px solid #efe6db;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>
  `).join('');
}

function buildPartnershipRows(data) {
  const rows = [
    ['Başvuru Türü', data.config.label],
    ['Referans Kodu', data.referenceCode],
    ['Şirket / Marka', data.company],
    ['Yetkili Kişi', data.name],
    ['E-posta', data.email],
    ['Talep Tipi', data.requestType || '—'],
    ['Ülke / Bölge', data.region || '—'],
    ['Tarih', data.submittedAt]
  ];

  return rows.map(([label, value]) => `
    <tr>
      <td style="padding:12px 0;color:#7a6f63;font-size:13px;border-bottom:1px solid #efe6db;vertical-align:top;width:180px;">${escapeHtml(label)}</td>
      <td style="padding:12px 0;color:#181818;font-size:14px;border-bottom:1px solid #efe6db;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>
  `).join('');
}

function buildAdminTemplate(data) {
  const body = `
    <div style="margin-bottom:22px;">
      <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:600;color:#141414;">${escapeHtml(data.config.label)}</h1>
      <p style="margin:14px 0 0;font-size:15px;line-height:1.8;color:#4f473f;">Site üzerinden yeni bir form gönderimi alındı. Aşağıdaki detayları inceleyebilirsiniz.</p>
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
      ${data.config.key === 'partnership' ? buildPartnershipRows(data) : buildSupportRows(data)}
    </table>
    <div style="margin-top:22px;padding:20px;border:1px solid #ece3d8;border-radius:16px;background:#fcfaf7;">
      <div style="font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8a7f72;font-weight:600;margin-bottom:10px;">Mesaj</div>
      <div style="font-size:15px;line-height:1.9;color:#1d1d1d;">${nl2br(data.message || '—')}</div>
    </div>
  `;

  const footer = `
    <div style="font-size:12px;line-height:1.7;color:#857a6f;text-align:center;">
      Bu bildirim <span style="color:#141414;">cosmoskin.com.tr</span> iletişim akışı üzerinden otomatik oluşturuldu.<br>
      Yanıt verirken başvuru sahibine doğrudan dönüş yapabilmeniz için <strong>Reply-To</strong> alanı kullanıcı e-postasına ayarlanmıştır.
    </div>
  `;

  return buildEmailShell({
    preheader: `${data.config.label} alındı`,
    title: `${data.config.label} | COSMOSKIN`,
    eyebrow: 'Yeni Talep',
    body,
    footer,
    env: data.env
  });
}

function buildAdminText(data) {
  const lines = [
    'COSMOSKIN',
    '',
    `${data.config.label} alındı.`,
    '',
    `Referans Kodu: ${data.referenceCode}`,
    `Tarih: ${data.submittedAt}`
  ];

  if (data.config.key === 'partnership') {
    lines.push(
      `Şirket / Marka: ${data.company}`,
      `Yetkili Kişi: ${data.name}`,
      `E-posta: ${data.email}`,
      `Talep Tipi: ${data.requestType || '—'}`,
      `Ülke / Bölge: ${data.region || '—'}`
    );
  } else {
    lines.push(
      `Ad Soyad: ${data.fullName}`,
      `E-posta: ${data.email}`,
      `Konu: ${data.topic || '—'}`,
      `Sipariş / Referans: ${data.reference || '—'}`
    );
  }

  lines.push('', 'Mesaj:', data.message || '—');
  return lines.join('\n');
}

function buildCustomerTemplate(data) {
  const summaryRows = data.config.key === 'partnership'
    ? `
      <tr>
        <td style="padding:8px 0;color:#7a6f63;font-size:13px;width:160px;">Talep Tipi</td>
        <td style="padding:8px 0;color:#181818;font-size:14px;">${escapeHtml(data.requestType || 'İş ortaklığı başvurusu')}</td>
      </tr>
    `
    : `
      <tr>
        <td style="padding:8px 0;color:#7a6f63;font-size:13px;width:160px;">Konu</td>
        <td style="padding:8px 0;color:#181818;font-size:14px;">${escapeHtml(data.topic || 'Genel talep')}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#7a6f63;font-size:13px;width:160px;">Sipariş / Referans</td>
        <td style="padding:8px 0;color:#181818;font-size:14px;">${escapeHtml(data.reference || '—')}</td>
      </tr>
    `;

  const greetingName = data.config.key === 'partnership' ? (data.name || data.company || 'Merhaba') : (data.firstName || data.fullName || 'Merhaba');
  const channelEmail = data.config.fallback;
  const intro = data.config.key === 'partnership'
    ? 'Başvurunuz ekibimize ulaştı. İş ortaklığı talebinizi incelemeye aldık.'
    : 'Mesajınız destek ekibimize başarıyla ulaştı ve inceleme sürecine alındı.';

  const body = `
    <div style="margin-bottom:20px;">
      <h1 style="margin:0;font-size:30px;line-height:1.2;font-weight:600;color:#141414;">${data.config.key === 'partnership' ? 'Başvurunuzu aldık' : 'Talebinizi aldık'}</h1>
      <p style="margin:16px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">Merhaba ${escapeHtml(greetingName)},</p>
      <p style="margin:14px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">${intro}</p>
    </div>

    <div style="padding:20px;border:1px solid #ece3d8;border-radius:16px;background:#fcfaf7;">
      <div style="font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8a7f72;font-weight:600;margin-bottom:12px;">Talep Özeti</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#7a6f63;font-size:13px;width:160px;">Referans Kodu</td>
          <td style="padding:8px 0;color:#181818;font-size:14px;">${escapeHtml(data.referenceCode)}</td>
        </tr>
        ${summaryRows}
        <tr>
          <td style="padding:8px 0;color:#7a6f63;font-size:13px;width:160px;">Gönderim Tarihi</td>
          <td style="padding:8px 0;color:#181818;font-size:14px;">${escapeHtml(data.submittedAt)}</td>
        </tr>
      </table>
    </div>

    <p style="margin:22px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">
      Ekibimiz en kısa sürede size dönüş sağlayacaktır. Ek bilgi paylaşmanız gerekirse bu e-postayı yanıtlayabilir veya bize doğrudan
      <span style="color:#141414;font-weight:600;">${escapeHtml(channelEmail)}</span>
      üzerinden ulaşabilirsiniz.
    </p>

    <div style="margin-top:24px;padding-top:18px;border-top:1px solid #efe6db;">
      <p style="margin:0;font-size:14px;line-height:1.8;color:#4f473f;">Teşekkür ederiz,<br><span style="color:#141414;font-weight:600;">COSMOSKIN ${data.config.key === 'partnership' ? 'Partnerships' : 'Destek'} Ekibi</span></p>
    </div>
  `;

  const footer = `
    <div style="font-size:12px;line-height:1.7;color:#857a6f;text-align:center;">
      COSMOSKIN Destek Ekibi<br>
      İstanbul, Türkiye · Premium Korean Skincare
    </div>
  `;

  return buildEmailShell({
    preheader: 'Mesajınızı aldık. Ekibimiz en kısa sürede dönüş sağlayacaktır.',
    title: data.config.customerSubject,
    eyebrow: 'Mesajınız Bize Ulaştı',
    body,
    footer,
    env: data.env
  });
}

function buildCustomerText(data) {
  const greetingName = data.config.key === 'partnership' ? (data.name || data.company || 'Merhaba') : (data.firstName || data.fullName || 'Merhaba');
  const lines = [
    'COSMOSKIN',
    '',
    `Merhaba ${greetingName},`,
    '',
    data.config.key === 'partnership'
      ? 'Başvurunuz bize ulaştı. İş ortaklığı talebiniz incelemeye alındı.'
      : 'Mesajınız bize ulaştı. Destek ekibimiz talebinizi incelemeye aldı.',
    `Referans Kodu: ${data.referenceCode}`,
    `Tarih: ${data.submittedAt}`
  ];

  if (data.config.key === 'partnership') {
    lines.push(`Talep Tipi: ${data.requestType || 'İş ortaklığı başvurusu'}`);
  } else {
    lines.push(`Konu: ${data.topic || 'Genel talep'}`);
    lines.push(`Sipariş / Referans: ${data.reference || '—'}`);
  }

  lines.push('', 'Ekibimiz en kısa sürede size dönüş sağlayacaktır.', `Ek bilgi paylaşmanız gerekirse ${data.config.fallback} adresine yazabilirsiniz.`, '', `COSMOSKIN ${data.config.key === 'partnership' ? 'Partnerships' : 'Destek'} Ekibi`);
  return lines.join('\n');
}

async function sendBrevoEmail(env, payload) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-key': env.BREVO_API_KEY,
      accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const detail = await response.text();

  if (!response.ok) {
    throw new Error(`Brevo error ${response.status}: ${detail}`);
  }

  return detail;
}

function validateEmail(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function buildSupportData(values, config) {
  const firstName = values.first_name.trim();
  const lastName = values.last_name.trim();
  const email = values.email.trim();
  const topic = values.topic.trim();
  const reference = values.reference.trim();
  const message = values.message.trim();
  const fullName = `${firstName} ${lastName}`.trim();

  if (!firstName || !lastName || !email || !topic || !message) {
    throw new Error('Lütfen zorunlu alanları doldurun.');
  }

  if (!validateEmail(email)) {
    throw new Error('Lütfen geçerli bir e-posta adresi girin.');
  }

  return {
    config,
    firstName,
    lastName,
    fullName,
    email,
    topic,
    reference,
    message,
    referenceCode: createReferenceCode(config.referencePrefix),
    submittedAt: formatDateTR(new Date())
  };
}

function buildPartnershipData(values, config) {
  const company = values.company.trim();
  const name = values.name.trim();
  const email = values.email.trim();
  const requestType = values.request_type.trim();
  const region = values.region.trim();
  const message = values.message.trim();

  if (!company || !name || !email || !requestType || !message) {
    throw new Error('Lütfen zorunlu alanları doldurun.');
  }

  if (!validateEmail(email)) {
    throw new Error('Lütfen geçerli bir e-posta adresi girin.');
  }

  return {
    config,
    company,
    name,
    email,
    requestType,
    region,
    message,
    referenceCode: createReferenceCode(config.referencePrefix),
    submittedAt: formatDateTR(new Date())
  };
}

export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const website = String(formData.get('website') || '').trim();
    const recipient = String(formData.get('recipient') || 'destek').trim();
    const config = getRecipientConfig(recipient, context.env);

    if (website) {
      return json({ ok: true, message: 'Mesajınız alındı.' });
    }

    if (!context.env.BREVO_API_KEY || !context.env.CONTACT_FROM_EMAIL) {
      throw new Error(`Eksik environment variable. Gerekli alanlar: BREVO_API_KEY ve CONTACT_FROM_EMAIL. Fallback: ${config.fallback}`);
    }

    const values = Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, String(value || '')]));
    const data = config.key === 'partnership'
      ? buildPartnershipData(values, config)
      : buildSupportData(values, config);
    data.env = context.env;

    const adminPayload = {
      sender: { name: config.senderName, email: context.env.CONTACT_FROM_EMAIL },
      to: [{ email: config.to }],
      replyTo: {
        email: data.email,
        name: data.config.key === 'partnership' ? data.name : data.fullName
      },
      subject: `${config.adminSubject} | ${config.key === 'partnership' ? (data.requestType || data.company) : (data.topic || data.fullName)}`,
      htmlContent: buildAdminTemplate(data),
      textContent: buildAdminText(data)
    };

    const customerPayload = {
      sender: { name: config.senderName, email: context.env.CONTACT_FROM_EMAIL },
      to: [{ email: data.email }],
      subject: config.customerSubject,
      htmlContent: buildCustomerTemplate(data),
      textContent: buildCustomerText(data)
    };

    await sendBrevoEmail(context.env, adminPayload);
    await sendBrevoEmail(context.env, customerPayload);

    return json({
      ok: true,
      message: 'Mesajınız başarıyla gönderildi. Size bir onay e-postası ilettik.',
      referenceCode: data.referenceCode
    });
  } catch (error) {
    const fallback = 'destek@cosmoskin.com.tr';
    const message = String(error.message || 'Şu anda form kullanılamıyor.');
    return json({
      ok: false,
      message: message.includes('Brevo error')
        ? `Şu anda form kullanılamıyor. Lütfen ${fallback} üzerinden iletişime geçin.`
        : message
    }, 500);
  }
}
