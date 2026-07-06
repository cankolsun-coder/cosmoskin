import {
  DEPRECATED_COUPONS,
  normalizeCouponCode,
  normalizeExclusionList,
  resolveCouponPresentation,
  sanitizeEligibilityMetadataPatch
} from './coupons.js';
import { selectRows } from './supabase.js';

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function isActiveRedemptionStatus(status) {
  const normalized = lower(status || 'used');
  return normalized === 'used' || normalized === 'reserved';
}

async function safeSelect(context, table, params) {
  try {
    return await selectRows(context, table, params);
  } catch (_) {
    return [];
  }
}

export async function fetchCouponUsageStats(context, code) {
  const rows = await safeSelect(context, 'coupon_redemptions', {
    select: 'id,status,created_at,used_at',
    code: `eq.${code}`,
    order: 'created_at.desc',
    limit: '500'
  });
  const used = (rows || []).filter((row) => lower(row?.status) === 'used');
  const reserved = (rows || []).filter((row) => lower(row?.status) === 'reserved');
  const lastUsed = used[0]?.used_at || used[0]?.created_at || null;
  return {
    total_used_count: used.length,
    active_reserved_count: reserved.length,
    last_used_at: lastUsed
  };
}

export async function enrichCouponForAdmin(context, couponRow) {
  const presentation = resolveCouponPresentation(couponRow);
  const usage = await fetchCouponUsageStats(context, presentation.code);
  return {
    ...couponRow,
    admin: {
      ...presentation,
      usage
    }
  };
}

export function buildCouponPatchPayload(body = {}, existingRow = null) {
  const code = normalizeCouponCode(existingRow?.code || body.code);
  const payload = {};
  const errors = [];

  if (DEPRECATED_COUPONS.has(code) && body.is_active === true) {
    errors.push('Bu kupon kodu kullanımdan kaldırılmıştır ve aktifleştirilemez.');
  }

  if (body.title != null) payload.title = String(body.title || '').trim().slice(0, 160) || 'COSMOSKIN Kuponu';

  const discountType = body.discount_type || body.type;
  if (discountType && ['percent', 'fixed', 'amount', 'free_shipping'].includes(String(discountType))) {
    const normalizedType = discountType === 'fixed' ? 'amount' : discountType;
    payload.discount_type = normalizedType;
    payload.type = normalizedType === 'amount' ? 'fixed' : normalizedType;
  }

  if (body.discount_value != null || body.value != null) {
    const rawValue = body.discount_value != null ? body.discount_value : body.value;
    const value = normalizedTypeIsFreeShipping(payload, existingRow) ? 0 : Math.max(0, Number(rawValue || 0));
    payload.discount_value = value;
    payload.value = value;
  }

  if (body.max_discount_amount != null || body.max_discount != null) {
    const rawMax = body.max_discount_amount != null ? body.max_discount_amount : body.max_discount;
    const max = rawMax === '' || rawMax === null ? null : Math.max(0, Number(rawMax || 0));
    payload.max_discount_amount = max;
    payload.max_discount = max;
  }

  if (body.min_subtotal != null) payload.min_subtotal = Math.max(0, Number(body.min_subtotal || 0));
  if (body.usage_limit != null) payload.usage_limit = body.usage_limit === '' || body.usage_limit === null ? null : Math.max(0, Number(body.usage_limit || 0));
  if (body.per_customer_limit != null) payload.per_customer_limit = Math.max(1, Number(body.per_customer_limit || 1));
  if (body.starts_at != null) payload.starts_at = body.starts_at || null;
  if (body.ends_at != null) payload.ends_at = body.ends_at || null;
  if (body.is_active != null) payload.is_active = body.is_active !== false;
  if (body.stackable != null) payload.stackable = body.stackable === true;

  if ('excluded_product_slugs' in body) {
    payload.excluded_product_slugs = normalizeExclusionList(body.excluded_product_slugs);
  }
  if ('excluded_categories' in body) {
    payload.excluded_categories = normalizeExclusionList(body.excluded_categories);
  }

  if (body.eligibility && typeof body.eligibility === 'object') {
    const merged = sanitizeEligibilityMetadataPatch(existingRow?.metadata, body.eligibility);
    if (!merged.ok) {
      errors.push(merged.error || 'metadata.eligibility güncellenemedi.');
    } else {
      payload.metadata = merged.metadata;
    }
  }

  const nextType = lower(payload.discount_type || existingRow?.discount_type || existingRow?.type || '');
  const nextValue = payload.discount_value != null
    ? Number(payload.discount_value)
    : Number(existingRow?.discount_value ?? existingRow?.value ?? 0);
  const activating = body.is_active === true || (body.is_active == null && existingRow?.is_active !== false);
  if (activating && nextType !== 'free_shipping' && (!Number.isFinite(nextValue) || nextValue <= 0)) {
    errors.push('Sıfır değerli kupon aktif kullanıma açılamaz.');
  }

  return { payload, errors };
}

function normalizedTypeIsFreeShipping(payload, existingRow) {
  const type = lower(payload.discount_type || payload.type || existingRow?.discount_type || existingRow?.type || '');
  return type === 'free_shipping';
}

export {
  normalizeExclusionList,
  resolveCouponPresentation,
  sanitizeEligibilityMetadataPatch
};
