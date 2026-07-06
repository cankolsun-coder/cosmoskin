import { selectRows, insertRow, updateRows } from '../../_lib/supabase.js';
import { json } from '../../_lib/response.js';
import { assertAdmin, adminError, readJsonBody } from '../../_lib/admin.js';
import { requireAdminPermission } from '../../_lib/admin-audit.js';
import { enrichCouponForAdmin, buildCouponPatchPayload } from '../../_lib/coupon-admin.js';
import { sanitizeEligibilityMetadataPatch } from '../../_lib/coupons.js';

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function payloadFrom(body = {}) {
  const type = ['percent', 'fixed', 'amount', 'free_shipping'].includes(body.type) ? body.type : 'percent';
  const normalizedType = type === 'fixed' ? 'amount' : type;
  const value = normalizedType === 'free_shipping' ? 0 : Math.max(0, Number(body.value || 0));
  const maxDiscount = numberOrNull(body.max_discount);
  return {
    code: String(body.code || '').trim().toUpperCase().slice(0, 64),
    title: String(body.title || '').trim().slice(0, 160) || 'COSMOSKIN Kuponu',
    type: type === 'amount' ? 'fixed' : type,
    value,
    discount_type: normalizedType,
    discount_value: value,
    min_subtotal: Math.max(0, Number(body.min_subtotal || 0)),
    max_discount: maxDiscount,
    max_discount_amount: maxDiscount,
    usage_limit: numberOrNull(body.usage_limit),
    per_customer_limit: Math.max(1, Number(body.per_customer_limit || 1)),
    starts_at: body.starts_at || new Date().toISOString(),
    ends_at: body.ends_at || null,
    is_active: body.is_active !== false,
    stackable: body.stackable === true,
    excluded_product_slugs: Array.isArray(body.excluded_product_slugs) ? body.excluded_product_slugs : [],
    excluded_categories: Array.isArray(body.excluded_categories) ? body.excluded_categories : [],
    metadata: {}
  };
  if (body.eligibility && typeof body.eligibility === 'object') {
    const merged = sanitizeEligibilityMetadataPatch({}, body.eligibility);
    if (merged.ok) payload.metadata = merged.metadata;
  }
  return payload;
}

export async function onRequestGet(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'coupons:read');
    const rows = await selectRows(context, 'coupons', { select: '*', order: 'created_at.desc' });
    const coupons = await Promise.all((rows || []).map((row) => enrichCouponForAdmin(context, row)));
    return json({ ok: true, coupons }, { headers: { 'Cache-Control': 'no-store' } });
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
    const coupon = await enrichCouponForAdmin(context, row);
    return json({ ok: true, coupon }, { headers: { 'Cache-Control': 'no-store' } });
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

    const filters = body.id ? { id: body.id } : { code: String(body.code || '').trim().toUpperCase() };
    const existingRows = await selectRows(context, 'coupons', { select: '*', ...filters, limit: '1' });
    const existing = existingRows?.[0] || null;
    if (!existing) return json({ ok: false, error: 'Kupon bulunamadı.' }, { status: 404 });

    const { payload, errors } = buildCouponPatchPayload(body, existing);
    if (errors.length) {
      return json({ ok: false, error: errors[0], errors }, { status: 400 });
    }

    if (!Object.keys(payload).length) {
      return json({ ok: false, error: 'Güncellenecek alan bulunamadı.' }, { status: 400 });
    }

    delete payload.code;
    await updateRows(context, 'coupons', filters, payload);
    const refreshed = await selectRows(context, 'coupons', { select: '*', ...filters, limit: '1' });
    const coupon = await enrichCouponForAdmin(context, refreshed?.[0] || existing);
    return json({ ok: true, coupon }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminError(error, 'Kupon güncellenemedi.');
  }
}
