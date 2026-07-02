import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { insertRow, selectRows, upsertRow } from '../_lib/supabase.js';

function cleanText(value = '', max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeBool(value) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

async function getProfile(context, user) {
  const rows = await selectRows(context, 'profiles', {
    select: '*',
    id: `eq.${user.id}`,
    limit: '1'
  }).catch(() => []);
  return rows?.[0] || null;
}

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const profile = await getProfile(context, auth.user);
  return json({ ok: true, profile: profile || { id: auth.user.id, email: auth.user.email } });
}

export async function onRequestPatch(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const body = await context.request.json().catch(() => ({}));
  const existing = await getProfile(context, auth.user);
  const requestedBirthday = body.birthday || body.birth_date || null;
  const payload = {
    id: auth.user.id,
    email: String(auth.user.email || body.email || '').toLowerCase(),
    first_name: cleanText(body.first_name, 80),
    last_name: cleanText(body.last_name, 80),
    phone: cleanText(body.phone, 40),
    birthday: requestedBirthday || existing?.birthday || null,
    birth_date_locked: false,
    marketing_email_opt_in: normalizeBool(body.marketing_email_opt_in),
    newsletter_opt_in: normalizeBool(body.newsletter_opt_in),
    stock_alert_opt_in: normalizeBool(body.stock_alert_opt_in),
    routine_reminder_opt_in: normalizeBool(body.routine_reminder_opt_in),
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    updated_at: new Date().toISOString()
  };
  const profile = await upsertRow(context, 'profiles', payload, 'id');
  return json({ ok: true, profile });
}

export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'PATCH' || context.request.method === 'POST') return onRequestPatch(context);
  return json({ ok: false, error: 'Yalnızca GET/PATCH desteklenir.' }, { status: 405, headers: { Allow: 'GET, PATCH, POST' } });
}
