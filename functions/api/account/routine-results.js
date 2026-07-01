import { insertRow, selectRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { cleanString, requireUser } from '../_lib/account.js';

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function normalizeRoutinePayload(body = {}) {
  const result = body.result && typeof body.result === 'object' ? body.result : body;
  return {
    routine_key: cleanString(body.routine_key || body.routineKey || result.routine_key || result.key || 'smart-routine', 80),
    routine_title: cleanString(body.routine_title || body.routineTitle || result.routine_title || result.title || 'Akıllı Rutin Sonucu', 120),
    result,
    recommended_products: normalizeArray(body.recommended_products || body.recommendedProducts || result.recommended_products || result.products),
    skin_profile_id: body.skin_profile_id || body.skinProfileId || null
  };
}

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const rows = await selectRows(context, 'customer_routine_results', {
      select: '*',
      user_id: `eq.${auth.user.id}`,
      order: 'created_at.desc',
      limit: '50'
    }).catch(() => []);
    return json({ ok: true, routine_results: rows || [], routines: rows || [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Rutin sonuçları alınamadı.' }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const auth = await requireUser(context);
    if (auth.response) return auth.response;
    const body = await context.request.json().catch(() => ({}));
    const payload = normalizeRoutinePayload(body);
    if (!payload.result || typeof payload.result !== 'object') return json({ ok: false, error: 'Rutin sonucu zorunlu.' }, { status: 400 });
    const now = new Date().toISOString();
    const saved = await insertRow(context, 'customer_routine_results', {
      user_id: auth.user.id,
      customer_email: auth.user.email || null,
      routine_key: payload.routine_key,
      routine_title: payload.routine_title,
      result: payload.result,
      recommended_products: payload.recommended_products,
      skin_profile_id: payload.skin_profile_id,
      completed_at: now,
      created_at: now
    });
    return json({ ok: true, routine_result: saved, routine: saved });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Rutin sonucu kaydedilemedi.' }, { status: 500 });
  }
}
