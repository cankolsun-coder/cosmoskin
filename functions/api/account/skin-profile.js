import { json } from '../_lib/response.js';
import { requireUser, cleanString } from '../_lib/account.js';
import { selectRows, upsertRow } from '../_lib/supabase.js';

function toArray(value) {
  if (Array.isArray(value)) return value.map((item) => cleanString(item, 100)).filter(Boolean);
  const text = cleanString(value, 400);
  return text ? text.split(',').map((item) => cleanString(item, 100)).filter(Boolean) : [];
}

function unique(values = []) {
  const out = [];
  for (const value of values || []) {
    const text = cleanString(value, 100);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

function normalizePayload(body = {}, user) {
  const concerns = unique(toArray(body.concerns || body.skin_concerns || body.skin_goals || body.goals || body.secondary_goals || body.secondaryGoals));
  const primaryGoal = cleanString(body.primary_goal || body.primaryGoal || body.routine_goal || body.routineGoal || concerns[0] || '', 140);
  const secondaryGoals = unique(toArray(body.secondary_goals || body.secondaryGoals || concerns).filter((goal) => goal !== primaryGoal));
  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
  return {
    user_id: user.id,
    email: String(user.email || body.email || '').toLowerCase(),
    skin_type: cleanString(body.skin_type || body.skinType || body.selectedSkinType || '', 80),
    sensitivity: cleanString(body.sensitivity || body.skin_sensitivity || body.skinSensitivity || body.sensitivity_status || '', 80),
    concerns: unique([primaryGoal, ...secondaryGoals, ...concerns].filter(Boolean)),
    routine_goal: primaryGoal,
    routine_style: cleanString(body.routine_style || body.routine_preference || body.routineStyle || body.intensity || '', 120),
    primary_goal: primaryGoal,
    secondary_goals: secondaryGoals,
    budget_band: cleanString(body.budget_band || body.budgetBand || body.budget || '', 80),
    avoid_ingredients: unique(toArray(body.avoid_ingredients || body.avoidIngredients || body.avoid || body.avoided_ingredients)),
    preferred_texture: cleanString(body.preferred_texture || body.preferredTexture || body.texture || '', 80),
    spf_habit: cleanString(body.spf_habit || body.spfHabit || body.spf || '', 80),
    answers,
    source: cleanString(body.source || body.source_channel || body.sourceChannel || 'account', 80),
    source_channel: cleanString(body.source_channel || body.sourceChannel || body.source || 'account', 80),
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
  return json({ ok: true, skin_profile: rows?.[0] || null }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
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
  return json({ ok: true, skin_profile: row }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}

export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST' || context.request.method === 'PATCH') return onRequestPost(context);
  return json({ ok: false, error: 'Yalnızca GET/POST/PATCH desteklenir.' }, { status: 405, headers: { Allow: 'GET, POST, PATCH' } });
}
