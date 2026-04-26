/**
 * POST /api/auth/register
 *
 * Server-side mirror of the registration password rules.
 *
 * Frontend ALSO validates these rules client-side and blocks submit on failure.
 * This endpoint exists so password rules cannot be bypassed by tampering with
 * the frontend (e.g. devtools, stale JS bundles).
 *
 * Rules (must all pass):
 *   - length >= 8
 *   - at least one uppercase letter (Latin or Turkish)
 *   - at least one lowercase letter (Latin or Turkish)
 *   - at least one digit
 *
 * On valid input we proxy to Supabase Auth's /auth/v1/signup using the
 * service-role key. Supabase returns either a session (auto-confirm on)
 * or a "confirmation email sent" response (auto-confirm off). We pass the
 * relevant fields through to the client as JSON.
 */

import { json } from '../_lib/response.js';

const PASSWORD_RULES = [
  { code: 'length', test: (p) => p.length >= 8,                                message: 'Şifre en az 8 karakter olmalı.' },
  { code: 'upper',  test: (p) => /[A-ZÇĞİÖŞÜ]/.test(p),                        message: 'Şifre en az 1 büyük harf içermeli.' },
  { code: 'lower',  test: (p) => /[a-zçğıöşü]/.test(p),                        message: 'Şifre en az 1 küçük harf içermeli.' },
  { code: 'number', test: (p) => /\d/.test(p),                                  message: 'Şifre en az 1 rakam içermeli.' },
];

function validatePassword(pw) {
  if (typeof pw !== 'string') {
    return { ok: false, code: 'invalid', message: 'Şifre alanı geçersiz.' };
  }
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(pw)) {
      return { ok: false, code: rule.code, message: rule.message };
    }
  }
  return { ok: true };
}

function validateEmail(email) {
  if (typeof email !== 'string') return false;
  // RFC-5322-ish pragmatic check: local@domain.tld with no spaces.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function onRequestPost(context) {
  let payload = {};
  try {
    payload = await context.request.json();
  } catch {
    return json({ ok: false, code: 'bad_request', error: 'Geçersiz istek gövdesi.' }, { status: 400 });
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const firstName = String(payload.first_name || '').trim();
  const lastName = String(payload.last_name || '').trim();

  if (!validateEmail(email)) {
    return json({ ok: false, code: 'invalid_email', error: 'Geçerli bir e-posta adresi girin.' }, { status: 400 });
  }

  if (!firstName || !lastName) {
    return json({ ok: false, code: 'missing_name', error: 'Ad ve soyad zorunludur.' }, { status: 400 });
  }

  const pwResult = validatePassword(password);
  if (!pwResult.ok) {
    return json({ ok: false, code: pwResult.code, error: pwResult.message }, { status: 400 });
  }

  const url = String(context.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = context.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = context.env.SUPABASE_ANON_KEY;
  if (!url || !serviceRoleKey || !anonKey) {
    return json({ ok: false, code: 'server_misconfig', error: 'Supabase yapılandırması eksik.' }, { status: 503 });
  }

  // Forward to Supabase Auth using the anon key (signup). The service-role
  // key is reserved for trusted server actions and we deliberately do NOT
  // skip email confirmation here — Supabase project settings control that.
  const redirectTo = (context.env.PUBLIC_SITE_URL || `${new URL(context.request.url).origin}`)
    + '/auth/callback.html';

  let upstream;
  try {
    upstream = await fetch(`${url}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        data: { first_name: firstName, last_name: lastName },
        options: { emailRedirectTo: redirectTo }
      })
    });
  } catch (error) {
    return json({ ok: false, code: 'upstream_unreachable', error: 'Auth servisi şu an yanıt vermiyor.' }, { status: 502 });
  }

  let body = null;
  try {
    body = await upstream.json();
  } catch {
    body = null;
  }

  if (!upstream.ok) {
    const message = String(body?.msg || body?.error_description || body?.error || '').toLowerCase();
    if (
      message.includes('already') ||
      message.includes('exists') ||
      message.includes('duplicate') ||
      message.includes('registered')
    ) {
      return json({ ok: false, code: 'email_exists', error: 'Bu e-posta adresi zaten kayıtlı.' }, { status: 409 });
    }
    return json({
      ok: false,
      code: 'upstream_error',
      error: body?.msg || body?.error_description || body?.error || 'Kayıt işlemi başarısız.'
    }, { status: upstream.status });
  }

  // Successful signup. Body shape varies depending on Supabase auto-confirm
  // setting:
  //   auto-confirm ON  → body has `access_token`, `refresh_token`, `user`
  //   auto-confirm OFF → body has `user` and `session: null` (email sent)
  const session = body?.access_token ? {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_in: body.expires_in,
    token_type: body.token_type,
    user: body.user
  } : null;

  return json({
    ok: true,
    requiresEmailConfirmation: !session,
    user: body?.user || null,
    session
  });
}

export function onRequest(context) {
  // Reject non-POST verbs explicitly so callers don't get cryptic 405s
  // from the platform's default router.
  if (context.request.method === 'POST') return onRequestPost(context);
  return json(
    { ok: false, code: 'method_not_allowed', error: 'Yalnızca POST desteklenir.' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
