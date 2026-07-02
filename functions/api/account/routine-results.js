import { insertRow, selectRows, updateRows } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { cleanString, requireUser } from '../_lib/account.js';

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeProduct(item, index = 0) {
  if (!item) return null;
  if (typeof item === 'string') return { slug: cleanString(item, 160), product_slug: cleanString(item, 160), sort_order: index };
  const slug = cleanString(item.slug || item.product_slug || item.productSlug || item.id || '', 160);
  return {
    id: cleanString(item.id || slug, 160),
    slug,
    product_slug: slug,
    name: cleanString(item.name || item.product_name || item.title || '', 240),
    brand: cleanString(item.brand || 'COSMOSKIN', 120),
    category: cleanString(item.category || '', 160),
    routine_step: cleanString(item.routine_step || item.routineStep || item.step || '', 120),
    period: cleanString(item.period || item.am_pm || '', 40),
    price: Number(item.price || item.unit_price || 0) || 0,
    image: cleanString(item.image || item.image_url || '', 500),
    url: cleanString(item.url || item.product_url || (slug ? `/products/${slug}.html` : ''), 500),
    sort_order: Number(item.sort_order ?? index) || 0
  };
}

function normalizeSteps(value, period) {
  return normalizeArray(value).map((step, index) => {
    const obj = safeObject(step);
    const product = normalizeProduct(obj.product || obj, index);
    return {
      id: cleanString(obj.id || obj.key || `${period}-${index}`, 120),
      label: cleanString(obj.label || obj.step || obj.routine_step || product?.routine_step || '', 120),
      routine_step: cleanString(obj.routine_step || obj.routineStep || product?.routine_step || '', 120),
      period,
      description: cleanString(obj.description || '', 240),
      product,
      sort_order: Number(obj.sort_order ?? index) || 0
    };
  }).filter((step) => step.label || step.product?.slug || step.product?.name);
}

function collectRecommendedProducts(payload, result) {
  const seen = new Set();
  const out = [];
  const add = (item, index) => {
    const product = normalizeProduct(item?.product || item, index);
    if (!product || (!product.slug && !product.name)) return;
    const key = product.slug || product.name;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(product);
  };
  normalizeArray(payload.recommended_products || payload.recommendedProducts || result.recommended_products || result.products).forEach(add);
  normalizeArray(payload.morning_steps || payload.morningSteps || result.morning_steps || result.morning || result.dayRoutine).forEach(add);
  normalizeArray(payload.evening_steps || payload.eveningSteps || result.evening_steps || result.evening || result.nightRoutine).forEach(add);
  return out;
}

function normalizeRoutinePayload(body = {}) {
  const result = body.result && typeof body.result === 'object' && !Array.isArray(body.result) ? body.result : body;
  const score = Number(body.routine_score ?? body.routineScore ?? result.routine_score ?? result.score ?? result.matchScore ?? 0) || null;
  const morningSteps = normalizeSteps(body.morning_steps || body.morningSteps || result.morning_steps || result.morning || result.dayRoutine, 'morning');
  const eveningSteps = normalizeSteps(body.evening_steps || body.eveningSteps || result.evening_steps || result.evening || result.nightRoutine, 'evening');
  const weeklySteps = normalizeSteps(body.weekly_steps || body.weeklySteps || result.weekly_steps || result.weekly, 'weekly');
  const recommendedProducts = collectRecommendedProducts({ ...body, morning_steps: morningSteps, evening_steps: eveningSteps }, result);
  const skinProfileSnapshot = safeObject(body.skin_profile_snapshot || body.skinProfileSnapshot || result.skin_profile_snapshot || result.profile || result.preferences);
  const sourceChannel = cleanString(body.source_channel || body.sourceChannel || result.source_channel || result.source || 'smart-routine', 80);
  const routineVersion = cleanString(body.routine_version || body.routineVersion || result.routine_version || '2026-07-routine-data-v1', 80);
  const routineTitle = cleanString(body.routine_title || body.routineTitle || result.routine_title || result.title || result.name || 'Akıllı Rutin Sonucu', 140);
  const routineKey = cleanString(body.routine_key || body.routineKey || result.routine_key || result.key || `${sourceChannel}-${Date.now()}`, 120);
  const normalizedResult = {
    ...result,
    routine_title: routineTitle,
    routine_score: score,
    routine_version: routineVersion,
    skin_profile_snapshot: skinProfileSnapshot,
    morning_steps: morningSteps,
    evening_steps: eveningSteps,
    weekly_steps: weeklySteps,
    recommended_products: recommendedProducts,
    source_channel: sourceChannel,
    summary: cleanString(result.summary || `${routineTitle} hesabınıza kaydedildi.`, 240)
  };
  return {
    routine_key: routineKey,
    routine_title: routineTitle,
    routine_score: score,
    routine_version: routineVersion,
    skin_profile_snapshot: skinProfileSnapshot,
    morning_steps: morningSteps,
    evening_steps: eveningSteps,
    weekly_steps: weeklySteps,
    result: normalizedResult,
    recommended_products: recommendedProducts,
    alternative_products: normalizeArray(body.alternative_products || body.alternativeProducts || result.alternative_products || result.alternatives),
    conflict_warnings: normalizeArray(body.conflict_warnings || body.conflictWarnings || result.conflict_warnings || result.warnings),
    source_channel: sourceChannel,
    is_active: body.is_active !== false,
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
      order: 'is_active.desc,updated_at.desc,created_at.desc',
      limit: '50'
    }).catch(() => []);
    const active = Array.isArray(rows) ? rows.find((row) => row.is_active) || rows[0] || null : null;
    return json({ ok: true, active_routine: active, routine_results: rows || [], routines: rows || [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
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
    if (payload.is_active) {
      await updateRows(context, 'customer_routine_results', { user_id: auth.user.id }, { is_active: false, updated_at: now }).catch(() => true);
    }
    const saved = await insertRow(context, 'customer_routine_results', {
      user_id: auth.user.id,
      email: auth.user.email || null,
      routine_key: payload.routine_key,
      routine_title: payload.routine_title,
      routine_score: payload.routine_score,
      routine_version: payload.routine_version,
      skin_profile_id: payload.skin_profile_id,
      skin_profile_snapshot: payload.skin_profile_snapshot,
      morning_steps: payload.morning_steps,
      evening_steps: payload.evening_steps,
      weekly_steps: payload.weekly_steps,
      result: payload.result,
      recommended_products: payload.recommended_products,
      alternative_products: payload.alternative_products,
      conflict_warnings: payload.conflict_warnings,
      source_channel: payload.source_channel,
      is_active: payload.is_active,
      completed_at: now,
      created_at: now,
      updated_at: now
    });
    return json({ ok: true, routine_result: saved, routine: saved }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return json({ ok: false, error: error.message || 'Rutin sonucu kaydedilemedi.' }, { status: 500 });
  }
}

export function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST' || context.request.method === 'PATCH' || context.request.method === 'PUT') return onRequestPost(context);
  return json({ ok: false, error: 'Yalnızca GET/POST/PATCH/PUT desteklenir.' }, { status: 405, headers: { Allow: 'GET, POST, PATCH, PUT' } });
}
