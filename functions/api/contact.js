function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8'
    }
  });
}

function getRecipientConfig(kind, env) {
  if (kind === 'partnership') {
    return {
      to: env.PARTNERSHIP_TO_EMAIL || 'partnership@cosmoskin.com.tr',
      fallback: 'partnership@cosmoskin.com.tr',
      subjectPrefix: 'İş Ortaklığı Formu',
      senderName: 'Cosmoskin Partnership Form'
    };
  }

  return {
    to: env.CONTACT_TO_EMAIL || 'destek@cosmoskin.com.tr',
    fallback: 'destek@cosmoskin.com.tr',
    subjectPrefix: 'Müşteri Destek Formu',
    senderName: 'Cosmoskin Contact Form'
  };
}

function buildPayload(kind, values, env) {
  const config = getRecipientConfig(kind, env);
  const senderEmail = env.CONTACT_FROM_EMAIL;

  if (!env.BREVO_API_KEY || !senderEmail) {
    throw new Error(`Eksik environment variable. Gerekli alanlar: BREVO_API_KEY ve CONTACT_FROM_EMAIL. Fallback: ${config.fallback}`);
  }

  if (kind === 'partnership') {
    const company = values.company.trim();
    const name = values.name.trim();
    const email = values.email.trim();
    const requestType = values.request_type.trim();
    const region = values.region.trim();
    const message = values.message.trim();

    if (!company || !name || !email || !requestType || !message) {
      throw new Error('Lütfen zorunlu alanları doldurun.');
    }

    return {
      config,
      payload: {
        sender: { name: config.senderName, email: senderEmail },
        to: [{ email: config.to }],
        replyTo: { email, name },
        subject: `${config.subjectPrefix}: ${requestType}`,
        htmlContent: `
          <h2>Yeni iş ortaklığı başvurusu</h2>
          <p><strong>Şirket / Marka:</strong> ${escapeHtml(company)}</p>
          <p><strong>Ad Soyad:</strong> ${escapeHtml(name)}</p>
          <p><strong>E-posta:</strong> ${escapeHtml(email)}</p>
          <p><strong>Talep Tipi:</strong> ${escapeHtml(requestType)}</p>
          <p><strong>Ülke / Bölge:</strong> ${escapeHtml(region || '-')}</p>
          <p><strong>Mesaj:</strong><br>${escapeHtml(message).replaceAll('\n', '<br>')}</p>
        `
      }
    };
  }

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

  return {
    config,
    payload: {
      sender: { name: config.senderName, email: senderEmail },
      to: [{ email: config.to }],
      replyTo: { email, name: fullName },
      subject: `${config.subjectPrefix}: ${topic}`,
      htmlContent: `
        <h2>Yeni müşteri destek mesajı</h2>
        <p><strong>Ad Soyad:</strong> ${escapeHtml(fullName)}</p>
        <p><strong>E-posta:</strong> ${escapeHtml(email)}</p>
        <p><strong>Konu:</strong> ${escapeHtml(topic)}</p>
        <p><strong>Sipariş No:</strong> ${escapeHtml(reference || '-')}</p>
        <p><strong>Mesaj:</strong><br>${escapeHtml(message).replaceAll('\n', '<br>')}</p>
      `
    }
  };
}

export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const website = String(formData.get('website') || '').trim();
    const recipient = String(formData.get('recipient') || 'destek').trim();

    if (website) {
      return json({ ok: true, message: 'Mesajınız alındı.' });
    }

    const values = Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, String(value || '')]));
    const { config, payload } = buildPayload(recipient, values, context.env);

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': context.env.BREVO_API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.text();
      return json({
        ok: false,
        message: `Şu anda form kullanılamıyor. Lütfen ${config.fallback} üzerinden iletişime geçin.`,
        detail
      }, 502);
    }

    return json({ ok: true, message: 'Mesajınız başarıyla gönderildi.' });
  } catch (error) {
    return json({
      ok: false,
      message: String(error.message || 'Form şu anda kullanılamıyor.')
    }, 500);
  }
}
