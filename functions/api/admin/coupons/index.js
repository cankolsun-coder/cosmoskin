import { selectRows, insertRow, updateRows } from '../../_lib/supabase.js';
import { json } from '../../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../../_lib/admin.js';
import { requireAdminPermission } from '../../_lib/admin-audit.js';

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function payloadFrom(body = {}) {
  const type = ['percent', 'fixed', 'free_shipping'].includes(body.type) ? body.type : 'percent';
  const value = type === 'free_shipping' ? 0 : Math.max(0, Number(body.value || 0));
  return {
    code: String(body.code || '').trim().toUpperCase().slice(0, 64),
    title: String(body.title || '').trim().slice(0, 160) || 'COSMOSKIN Kuponu',
    type,
    value,
    min_subtotal: Math.max(0, Number(body.min_subtotal || 0)),
    max_discount: numberOrNull(body.max_discount),
    usage_limit: numberOrNull(body.usage_limit),
    per_customer_limit: Math.max(1, Number(body.per_customer_limit || 1)),
    starts_at: body.starts_at || new Date().toISOString(),
    ends_at: body.ends_at || null,
    is_active: body.is_active !== false,
  };
}

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'coupons:read');
    const rows = await selectRows(context, 'coupons', { select: '*', order: 'created_at.desc' });
    return json({ ok: true, coupons: rows || [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminError(error, 'Kuponlar alınamadı.');
  }
}

export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'coupons:manage');
    const body = await readJsonBody(context);
    const payload = payloadFrom(body);
    if (!payload.code) return json({ ok: false, error: 'Kupon kodu gereklidir.' }, { status: 400 });
    const row = await insertRow(context, 'coupons', payload);
    return json({ ok: true, coupon: row }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminError(error, 'Kupon oluşturulamadı.');
  }
}

export async function onRequestPatch(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'coupons:manage');
    const body = await readJsonBody(context);
    if (!body.id && !body.code) return json({ ok: false, error: 'Kupon kimliği veya kodu gereklidir.' }, { status: 400 });
    const payload = payloadFrom(body);
    delete payload.code;
    const filters = body.id ? { id: body.id } : { code: String(body.code || '').trim().toUpperCase() };
    await updateRows(context, 'coupons', filters, payload);
    return json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminError(error, 'Kupon güncellenemedi.');
  }
}
