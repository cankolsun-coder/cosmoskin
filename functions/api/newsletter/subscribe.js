import { insertRow, insertRows, selectRows, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { renderNewsletterWelcomeEmail } from '../_lib/newsletter-email.js';
import { recordCrmEvent } from '../_lib/crm-events.js';
import { getClientIp, isRateLimited } from '../_lib/rate-limit.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 6;

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value = '') {
  return EMAIL_RE.test(String(value || '').trim());
}

function newsletterSenderEmail(env = {}) {
  return String(env.NEWSLETTER_FROM_EMAIL || env.BREVO_SENDER_EMAIL || '').trim().toLowerCase();
}

function cleanSource(value = 'footer') {
  const source = String(value || 'footer').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 48);
  return source || 'footer';
}

function rateLimit(context, email) {
  const key = `newsletter:${getClientIp(context)}:${email || 'no-email'}`;
  return isRateLimited(key, { windowMs: WINDOW_MS, max: MAX_REQUESTS });
}

async function sendWelcomeEmail(env, email) {
  if (!env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY eksik. Welcome email gönderilemedi.');
  }
  const senderEmail = newsletterSenderEmail(env);
  const senderName = String(env.NEWSLETTER_SENDER_NAME || env.BREVO_SENDER_NAME || 'COSMOSKIN Journal').trim();
  if (!isEmail(senderEmail)) {
    throw new Error('NEWSLETTER_FROM_EMAIL veya BREVO_SENDER_EMAIL geçerli bir e-posta olmalıdır.');
  }

  const rendered = renderNewsletterWelcomeEmail({ email, env });
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'api-key': env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName || 'COSMOSKIN Journal' },
      to: [{ email }],
      subject: rendered.subject,
      htmlContent: rendered.html,
      textContent: rendered.text
    })
  });

  const detail = await response.text();
  if (!response.ok) {
    throw new Error(`Brevo welcome email error ${response.status}: ${detail.slice(0, 300)}`);
  }
  return true;
}

export async function onRequestPost(context) {
  let body = {};
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, code: 'bad_request', error: 'Geçersiz istek gövdesi.' }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const source = cleanSource(body.source || 'footer');

  if (!EMAIL_RE.test(email)) {
    return json({ ok: false, code: 'invalid_email', error: 'Lütfen geçerli bir e-posta adresi gir.' }, { status: 400 });
  }

  if (rateLimit(context, email)) {
    return json({ ok: false, code: 'rate_limited', error: 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene.' }, { status: 429 });
  }

  if (!context.env.SUPABASE_URL || !context.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, code: 'server_misconfig', error: 'Newsletter veritabanı yapılandırması eksik.' }, { status: 503 });
  }
  if (!context.env.BREVO_API_KEY || !isEmail(newsletterSenderEmail(context.env))) {
    return json({ ok: false, code: 'server_misconfig', error: 'Newsletter e-posta gönderimi yapılandırması eksik.' }, { status: 503 });
  }

  try {
    const existing = await selectRows(context, 'newsletter_subscribers', {
      select: 'id,email,status,welcome_sent_at',
      email: `eq.${email}`,
      limit: '1'
    }).catch((error) => {
      throw new Error(`Newsletter tablo sorgusu başarısız: ${error.message}`);
    });

    if (existing?.[0]?.id) {
      return json({
        ok: true,
        already_subscribed: true,
        message: 'Bu e-posta adresi COSMOSKIN Journal listesinde zaten kayıtlı.'
      });
    }

    const now = new Date().toISOString();
    const row = await insertRow(context, 'newsletter_subscribers', {
      email,
      source,
      status: 'subscribed',
      confirmed_at: now,
      marketing_email_opt_in: false,
      consent_source: source
    });

    await insertRows(context, 'consent_records', [{
      email,
      consent_type: 'newsletter_opt_in',
      status: 'accepted',
      source: 'newsletter_'+source,
      metadata: { source, legal_version: 'legal-20260702', note: 'Newsletter consent is recorded separately from commercial marketing consent.' }
    }]).catch((error) => console.error('newsletter consent record failed', { message: error.message }));
    await recordCrmEvent(context, { event_type: 'newsletter_subscribed', email, metadata: { source } });

    try {
      await sendWelcomeEmail(context.env, email);
    } catch (emailError) {
      console.error('Newsletter welcome email failed', {
        email,
        subscriber_id: row?.id || null,
        message: emailError.message
      });
      return json({
        ok: false,
        code: 'email_send_failed',
        error: 'Newsletter kaydı alındı ancak welcome e-postası gönderilemedi.'
      }, { status: 502 });
    }

    const sentAt = new Date().toISOString();
    if (row?.id) {
      await updateRows(context, 'newsletter_subscribers', { id: row.id }, {
        welcome_sent_at: sentAt,
        last_email_sent_at: sentAt,
        updated_at: sentAt
      });
    }

    return json({
      ok: true,
      already_subscribed: false,
      message: 'COSMOSKIN Journal’a kaydoldun. İlk notumuz e-posta kutuna geliyor.'
    });
  } catch (error) {
    console.error('Newsletter subscribe failed', { message: error.message });
    return json({
      ok: false,
      code: 'server_error',
      error: 'Şu anda kaydını tamamlayamadık. Lütfen biraz sonra tekrar dene.'
    }, { status: 500 });
  }
}

export function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ ok: false, code: 'method_not_allowed', error: 'Yalnızca POST desteklenir.' }, {
    status: 405,
    headers: { Allow: 'POST' }
  });
}
