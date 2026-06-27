import { json } from '../_lib/response.js';
import { requireUser, cleanString } from '../_lib/account.js';
import { selectRows, upsertRow } from '../_lib/supabase.js';

function toArray(value) {
  if (Array.isArray(value)) return value.map((item) => cleanString(item, 80)).filter(Boolean);
  const text = cleanString(value, 240);
  return text ? text.split(',').map((item) => cleanString(item, 80)).filter(Boolean) : [];
}

function normalizePayload(body = {}, user) {
  return {
    user_id: user.id,
    email: String(user.email || body.email || '').toLowerCase(),
    skin_type: cleanString(body.skin_type || body.skinType || 'Karma Cilt', 80),
    sensitivity: cleanString(body.sensitivity || body.skin_sensitivity || body.sensitivity_status || '', 80),
    concerns: toArray(body.concerns || body.skin_concerns || body.skin_goals || body.goals),
    routine_goal: cleanString(body.routine_goal || body.primaryGoal || 'Nem desteği', 140),
    routine_style: cleanString(body.routine_style || body.routine_preference || body.routineStyle || 'Günlük bakım', 120),
    answers: body.answers && typeof body.answers === 'object' ? body.answers : {},
    source: 'account',
    updated_at: new Date().toISOString()
  };
}

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const rows = await selectRows(context, 'customer_skin_profiles', {
    select: '*',
    user_id: `eq.${auth.user.id}`,
    order: 'updated_at.desc',
    limit: '1'
  }).catch(() => []);
  return json({ ok: true, skin_profile: rows?.[0] || null });
}

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const body = await context.request.json().catch(() => ({}));
  const existing = await selectRows(context, 'customer_skin_profiles', {
    select: 'id', user_id: `eq.${auth.user.id}`, order: 'updated_at.desc', limit: '1'
  }).catch(() => []);
  const payload = normalizePayload(body, auth.user);
  if (existing?.[0]?.id) payload.id = existing[0].id;
  const row = await upsertRow(context, 'customer_skin_profiles', payload, 'id');
  return json({ ok: true, skin_profile: row });
}

export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST' || context.request.method === 'PATCH') return onRequestPost(context);
  return json({ ok: false, error: 'Yalnızca GET/POST/PATCH desteklenir.' }, { status: 405, headers: { Allow: 'GET, POST, PATCH' } });
}
