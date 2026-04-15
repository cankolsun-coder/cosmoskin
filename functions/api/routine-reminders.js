function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8' }
  });
}

function validateEmail(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function getSiteUrl(env) {
  const raw = String(env.PUBLIC_SITE_URL || env.SITE_URL || 'https://www.cosmoskin.com.tr').trim();
  return raw.replace(/\/$/, '');
}

function getAssets(env) {
  const siteUrl = getSiteUrl(env);
  return {
    siteUrl,
    logoUrl: `${siteUrl}/assets/logo-mark.png`,
    routineUrl: `${siteUrl}/routine.html`,
    accountUrl: `${siteUrl}/account/profile.html?tab=communication`,
    supportEmail: env.CONTACT_TO_EMAIL || 'destek@cosmoskin.com.tr'
  };
}

function buildShell({ title, preheader, eyebrow, body, footer, env }) {
  const assets = getAssets(env);
  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#181818;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">${escapeHtml(preheader || '')}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f1ea;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#fff;border:1px solid #e7ded2;border-radius:20px;overflow:hidden;">
<tr><td style="padding:28px 28px 24px;background:linear-gradient(180deg,#f7f2eb 0%,#f3ede5 100%);border-bottom:1px solid #ebe2d7;text-align:center;">
<a href="${assets.siteUrl}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block;"><img src="${assets.logoUrl}" alt="COSMOSKIN" width="68" style="display:block;margin:0 auto 10px;width:68px;max-width:68px;height:auto;border:0;"></a>
<div style="font-size:18px;line-height:1.1;letter-spacing:3px;text-transform:uppercase;color:#161616;font-weight:600;">COSMOSKIN</div>
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a7f72;margin-top:10px;">Premium Korean Skincare</div>
</td></tr>
<tr><td style="padding:34px 28px 28px;">${eyebrow ? `<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a7f72;font-weight:600;margin-bottom:10px;">${escapeHtml(eyebrow)}</div>` : ''}${body}</td></tr>
<tr><td style="padding:0 28px 28px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;"><tr>
<td align="center" style="border-radius:999px;background:#141414;"><a href="${assets.routineUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;font-size:13px;line-height:1;color:#ffffff;text-decoration:none;font-weight:600;">Rutinini Gör</a></td>
<td style="width:10px;"></td>
<td align="center" style="border-radius:999px;background:#f4eee7;border:1px solid #e7ded2;"><a href="${assets.accountUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;font-size:13px;line-height:1;color:#181818;text-decoration:none;font-weight:600;">Tercihleri Güncelle</a></td>
</tr></table></td></tr>
<tr><td style="padding:20px 28px;background:#faf7f2;border-top:1px solid #eee5da;">${footer}<div style="margin-top:16px;padding-top:14px;border-top:1px solid #eee5da;font-size:12px;line-height:1.8;color:#857a6f;text-align:center;">${escapeHtml(assets.supportEmail)} · İstanbul, Türkiye</div></td></tr>
</table></td></tr></table></body></html>`;
}

function buildReminderEmail({ email, name, type, cadenceDays, highlights, nextDate, env }) {
  const greeting = escapeHtml(name || email || 'Merhaba');
  const title = type === 'restock' ? 'Ürünlerini yenileme zamanı yaklaşıyor' : 'Rutinine dönme zamanı';
  const preheader = type === 'restock' ? 'Rutinindeki bazı ürünler yakında bitebilir.' : 'Sabah ve akşam adımlarını tazelemek için kısa bir hatırlatma.';
  const eyebrow = type === 'restock' ? 'Yeniden Sipariş Hatırlatması' : 'Rutin Hatırlatması';
  const points = (highlights || []).slice(0, 4).map((item) => `<li style="margin:0 0 8px;">${escapeHtml(item)}</li>`).join('');
  const nextInfo = nextDate ? `<p style="margin:18px 0 0;font-size:14px;line-height:1.8;color:#4f473f;">Bir sonraki planlanan temas tarihi: <strong style="color:#141414;">${escapeHtml(nextDate)}</strong></p>` : '';
  const body = `
    <div style="margin-bottom:20px;">
      <h1 style="margin:0;font-size:30px;line-height:1.2;font-weight:600;color:#141414;">${escapeHtml(title)}</h1>
      <p style="margin:16px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">Merhaba ${greeting},</p>
      <p style="margin:14px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">${type === 'restock' ? 'Rutinindeki bazı ürünler kullanım sıklığına göre yeniden sipariş zamanına yaklaşmış olabilir.' : 'Seçtiğin akışa göre kısa bir rutin kontrolü yapmak için iyi bir zaman.'}</p>
    </div>
    <div style="padding:20px;border:1px solid #ece3d8;border-radius:16px;background:#fcfaf7;">
      <div style="font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#8a7f72;font-weight:600;margin-bottom:12px;">Özet</div>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.8;color:#4f473f;">Hatırlatma sıklığı: <strong style="color:#141414;">${Number(cadenceDays || 14)} gün</strong></p>
      ${points ? `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;color:#4f473f;">${points}</ul>` : '<p style="margin:0;font-size:14px;line-height:1.8;color:#4f473f;">Rutinini ve son siparişlerini hesabından gözden geçirebilirsin.</p>'}
      ${nextInfo}
    </div>
    <p style="margin:22px 0 0;font-size:15px;line-height:1.9;color:#4f473f;">Tercihlerini hesabındaki <strong style="color:#141414;">İletişim Tercihlerim</strong> alanından dilediğin zaman güncelleyebilirsin.</p>`;
  const footer = `<div style="font-size:12px;line-height:1.7;color:#857a6f;text-align:center;">Bu mesaj COSMOSKIN hatırlatma merkezi üzerinden gönderildi.</div>`;
  return buildShell({ title, preheader, eyebrow, body, footer, env });
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
  if (!response.ok) throw new Error(`Brevo error ${response.status}: ${detail}`);
  return detail;
}

function normalizeRequestBody(body = {}) {
  return {
    action: String(body.action || 'test'),
    email: String(body.email || '').trim(),
    name: String(body.name || '').trim(),
    type: body.type === 'restock' ? 'restock' : 'routine',
    cadenceDays: Number(body.cadenceDays || 14),
    highlights: Array.isArray(body.highlights) ? body.highlights.map((x) => String(x || '').trim()).filter(Boolean) : [],
    nextDate: String(body.nextDate || '').trim(),
    subscribers: Array.isArray(body.subscribers) ? body.subscribers : []
  };
}

export async function onRequestPost(context) {
  try {
    const body = normalizeRequestBody(await context.request.json().catch(() => ({})));
    if (!context.env.BREVO_API_KEY || !context.env.CONTACT_FROM_EMAIL) {
      throw new Error('Eksik environment variable. Gerekli alanlar: BREVO_API_KEY ve CONTACT_FROM_EMAIL.');
    }

    if (body.action === 'dispatch_due') {
      const secret = context.request.headers.get('x-reminder-secret') || '';
      if (!context.env.REMINDER_CRON_SECRET || secret !== context.env.REMINDER_CRON_SECRET) {
        return json({ ok: false, error: 'Yetkisiz istek.' }, 401);
      }
      const senderName = context.env.BREVO_SENDER_NAME || 'COSMOSKIN';
      let sent = 0;
      for (const subscriber of body.subscribers) {
        if (!validateEmail(subscriber.email || '')) continue;
        const htmlContent = buildReminderEmail({
          email: subscriber.email,
          name: subscriber.name,
          type: subscriber.type,
          cadenceDays: subscriber.cadenceDays,
          highlights: subscriber.highlights,
          nextDate: subscriber.nextDate,
          env: context.env
        });
        await sendBrevoEmail(context.env, {
          sender: { email: context.env.CONTACT_FROM_EMAIL, name: senderName },
          to: [{ email: subscriber.email, name: subscriber.name || subscriber.email }],
          subject: subscriber.type === 'restock' ? 'COSMOSKIN | Yeniden sipariş zamanı yaklaşıyor' : 'COSMOSKIN | Rutin hatırlatman hazır',
          htmlContent,
          textContent: 'COSMOSKIN hatırlatman hazır. Hesabına girerek rutinini ve tercihlerini gözden geçirebilirsin.'
        });
        sent += 1;
      }
      return json({ ok: true, sent });
    }

    if (!validateEmail(body.email)) {
      return json({ ok: false, error: 'Geçerli bir e-posta adresi gerekli.' }, 400);
    }
    const senderName = context.env.BREVO_SENDER_NAME || 'COSMOSKIN';
    const htmlContent = buildReminderEmail({ ...body, env: context.env });
    await sendBrevoEmail(context.env, {
      sender: { email: context.env.CONTACT_FROM_EMAIL, name: senderName },
      to: [{ email: body.email, name: body.name || body.email }],
      subject: body.type === 'restock' ? 'COSMOSKIN | Ürünlerini yenileme zamanı yaklaşıyor' : 'COSMOSKIN | Rutin hatırlatman hazır',
      htmlContent,
      textContent: body.type === 'restock'
        ? 'Rutinindeki bazı ürünler yakında bitebilir. Hesabından yeniden sipariş önerilerini gözden geçir.'
        : 'Rutinine dönme zamanı. Hesabından sabah ve akşam akışını gözden geçir.'
    });
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Hatırlatma e-postası gönderilemedi.' }, 500);
  }
}
