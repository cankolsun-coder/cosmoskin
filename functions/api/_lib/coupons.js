import { selectRows } from './supabase.js';

export const DEPRECATED_COUPONS = new Set(['COSMOSKIN10', 'CLUB10', 'WELCOME15']);

const APPROVED_RULES = {
  WELCOME10: {
    discount_type: 'percent',
    discount_value: 10,
    min_subtotal: 1000,
    max_discount_amount: 150,
    per_customer_limit: 1,
    first_order_only: true,
    manualApplyRequired: true,
    title: 'Yeni üyeye özel %10 hoş geldin avantajı',
    description: 'İlk başarılı siparişe özel, sepette manuel uygulanır.',
    scope_label: '1.000 TL ve üzeri ilk alışverişte'
  },
  BIRTHDAY10: {
    discount_type: 'percent',
    discount_value: 10,
    min_subtotal: 1500,
    max_discount_amount: 150,
    per_customer_limit: 1,
    birthday_date_only: true,
    birthday_window_days: 0,
    once_per_calendar_year: true,
    account_age_days_or_paid_order: 30,
    manualApplyRequired: true,
    title: 'Doğum gününe özel %10 avantaj',
    description: 'Doğum gününüzde, uygunluk kontrolleri tamamlandığında kullanılabilir.',
    scope_label: '1.500 TL ve üzeri alışverişlerde'
  },
  ROUTINE5: {
    discount_type: 'percent',
    discount_value: 5,
    min_subtotal: 1500,
    max_discount_amount: 100,
    manualApplyRequired: true,
    title: 'Rutin alışveriş avantajı',
    description: 'Akıllı Rutin sonrası uygun sepetlerde kullanılabilir.',
    scope_label: '1.500 TL ve üzeri rutin alışverişinde'
  },
  SIGNATURE75: {
    discount_type: 'amount',
    discount_value: 75,
    min_subtotal: 1500,
    max_discount_amount: 75,
    tier: ['signature', 'elite'],
    manualApplyRequired: true,
    title: 'Signature üyeye özel 75 TL avantaj',
    description: 'Signature veya Elite üyelik seviyesinde uygun sepetlerde kullanılabilir.',
    scope_label: '1.500 TL ve üzeri alışverişlerde'
  },
  ELITE100: {
    discount_type: 'amount',
    discount_value: 100,
    min_subtotal: 2000,
    max_discount_amount: 100,
    tier: ['elite'],
    manualApplyRequired: true,
    title: 'Elite üyeye özel 100 TL avantaj',
    description: 'Elite üyelik seviyesinde uygun sepetlerde kullanılabilir.',
    scope_label: '2.000 TL ve üzeri alışverişlerde'
  }
};

export function normalizeCouponCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Math.round((Number.isFinite(number) ? number : 0) * 100) / 100;
}

function nowMs() { return Date.now(); }
function toMs(value) { return value ? new Date(value).getTime() : null; }
function lower(value) { return String(value || '').trim().toLowerCase(); }
function monthNumber(value) { return value ? new Date(value).getUTCMonth() + 1 : null; }
function currentYear() { return new Date().getFullYear(); }
function daysBetween(a, b) { return Math.floor((Number(b) - Number(a)) / (24 * 60 * 60 * 1000)); }

function parseBirthdayParts(value) {
  const raw = String(value || '').trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  return { month: Number(match[2]), day: Number(match[3]) };
}

export function isBirthdayCouponEligible(birthDate, now = new Date(), windowDays = 0) {
  const parts = parseBirthdayParts(birthDate);
  if (!parts) return false;
  const window = Math.max(0, Number(windowDays) || 0);
  if (window <= 0) {
    return parts.month === (now.getMonth() + 1) && parts.day === now.getDate();
  }
  const year = now.getFullYear();
  const birthday = new Date(year, parts.month - 1, parts.day);
  const today = new Date(year, now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - birthday.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays >= 0 && diffDays <= window;
}

export function approvedCouponCodes() {
  return Object.keys(APPROVED_RULES);
}

export function defaultRuleFor(code) {
  return APPROVED_RULES[normalizeCouponCode(code)] || null;
}

function successOrder(order = {}) {
  const status = lower(order.status);
  const payment = lower(order.payment_status);
  if (['cancelled', 'payment_failed', 'failed', 'refunded'].includes(status)) return false;
  if (['failed', 'cancelled', 'refunded'].includes(payment)) return false;
  return ['paid', 'confirmed', 'processing', 'preparing', 'packed', 'shipped', 'delivered', 'completed'].includes(status)
    || ['paid', 'confirmed', 'captured'].includes(payment)
    || Boolean(order.paid_at || order.delivered_at || order.fulfilled_at);
}

async function safeSelect(context, table, params) {
  try { return await selectRows(context, table, params); } catch (_) { return []; }
}

async function findCoupon(context, code) {
  const rows = await safeSelect(context, 'coupons', {
    select: '*',
    code: `eq.${code}`,
    limit: '1'
  });
  return rows?.[0] || null;
}

async function findOrders(context, user, customerEmail) {
  const email = lower(customerEmail || user?.email);
  if (user?.id && email) {
    return await safeSelect(context, 'orders', {
      select: 'id,status,payment_status,total_amount,created_at,paid_at,delivered_at,fulfilled_at,customer_email,user_id',
      or: `(user_id.eq.${user.id},customer_email.eq.${email})`,
      order: 'created_at.desc',
      limit: '100'
    });
  }
  if (user?.id) {
    return await safeSelect(context, 'orders', {
      select: 'id,status,payment_status,total_amount,created_at,paid_at,delivered_at,fulfilled_at,customer_email,user_id',
      user_id: `eq.${user.id}`,
      order: 'created_at.desc',
      limit: '100'
    });
  }
  if (email) {
    return await safeSelect(context, 'orders', {
      select: 'id,status,payment_status,total_amount,created_at,paid_at,delivered_at,fulfilled_at,customer_email,user_id',
      customer_email: `eq.${email}`,
      order: 'created_at.desc',
      limit: '100'
    });
  }
  return [];
}

async function findRedemptions(context, code, user, customerEmail) {
  const email = lower(customerEmail || user?.email);
  if (user?.id && email) {
    return await safeSelect(context, 'coupon_redemptions', {
      select: '*',
      code: `eq.${code}`,
      or: `(user_id.eq.${user.id},customer_email.eq.${email})`,
      order: 'created_at.desc',
      limit: '50'
    });
  }
  if (user?.id) {
    return await safeSelect(context, 'coupon_redemptions', {
      select: '*',
      code: `eq.${code}`,
      user_id: `eq.${user.id}`,
      order: 'created_at.desc',
      limit: '50'
    });
  }
  if (email) {
    return await safeSelect(context, 'coupon_redemptions', {
      select: '*',
      code: `eq.${code}`,
      customer_email: `eq.${email}`,
      order: 'created_at.desc',
      limit: '50'
    });
  }
  return [];
}

async function findReservations(context, code, user, customerEmail) {
  const email = lower(customerEmail || user?.email);
  const filters = { select: '*', code: `eq.${code}`, status: 'eq.reserved', limit: '20' };
  if (user?.id) filters.user_id = `eq.${user.id}`;
  else if (email) filters.customer_email = `eq.${email}`;
  else return [];
  const redemptionReservations = await safeSelect(context, 'coupon_redemptions', filters);
  const reservationRows = await safeSelect(context, 'coupon_reservations', {
    select: '*',
    code: `eq.${code}`,
    ...(user?.id ? { user_id: `eq.${user.id}` } : { customer_email: `eq.${email}` }),
    status: 'eq.reserved',
    limit: '20'
  });
  return [...(redemptionReservations || []), ...(reservationRows || [])];
}

async function findProfile(context, user) {
  if (!user?.id) return null;
  const rows = await safeSelect(context, 'profiles', { select: '*', id: `eq.${user.id}`, limit: '1' });
  return rows?.[0] || null;
}

async function findMembership(context, user) {
  if (!user?.id) return null;
  const rows = await safeSelect(context, 'customer_membership_status', { select: '*', user_id: `eq.${user.id}`, limit: '1' });
  return rows?.[0] || null;
}

function safeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return trimmed.split(',').map((part) => part.trim()).filter(Boolean);
    }
  }
  return [];
}

function asMetadataObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) { /* ignore */ }
  }
  return {};
}

function customerFacingMessage(reasonCode) {
  switch (reasonCode) {
    case 'min_subtotal_not_met':
      return 'Bu kupon için minimum sepet tutarı karşılanmıyor.';
    case 'authentication_required':
    case 'membership_required':
      return 'Bu kupon hesabınız için uygun değil.';
    case 'membership_tier_not_allowed':
      return 'Bu kupon yalnızca belirli üyelik seviyelerinde kullanılabilir.';
    case 'birthday_month_required':
      return 'Bu kupon doğum günü ayınıza özel olarak kullanılabilir.';
    case 'smart_routine_required':
      return 'Bu kupon Akıllı Rutin tamamlandıktan sonra kullanılabilir.';
    case 'per_customer_limit_reached':
      return 'Bu kupon daha önce kullanılmış.';
    case 'coupon_not_found':
    case 'coupon_inactive':
    case 'coupon_deprecated':
    case 'coupon_expired':
    case 'coupon_not_started':
    case 'usage_limit_reached':
    case 'coupon_not_stackable':
    case 'product_excluded':
    case 'category_excluded':
    case 'invalid_discount':
    default:
      return 'Bu kupon şu anda geçerli değil.';
  }
}

function resolveCouponEnvelope(couponRow, rule, code) {
  const merged = { ...(couponRow || {}), ...(rule || {}) };
  const metadata = asMetadataObject(couponRow?.metadata);
  const eligibilityMeta = asMetadataObject(metadata?.eligibility);
  merged.code = code;
  merged.metadata = metadata;
  merged.eligibility = eligibilityMeta;

  // Canonical coupon resolver (required): discount_type/value/max_discount_amount fall back to legacy.
  merged.discount_type = (merged.discount_type ?? merged.type ?? 'amount');
  merged.discount_value = Number(merged.discount_value ?? merged.value ?? 0);
  merged.max_discount_amount = Number(merged.max_discount_amount ?? merged.max_discount ?? 0) || null;
  merged.min_subtotal = Number(merged.min_subtotal ?? merged.min_cart_total ?? 0);

  merged.per_customer_limit = Number(merged.per_customer_limit ?? 0) || 0;
  merged.usage_limit = Number(merged.usage_limit ?? 0) || 0;
  merged.stackable = merged.stackable === true;
  merged.excluded_product_slugs = safeArray(merged.excluded_product_slugs);
  merged.excluded_categories = safeArray(merged.excluded_categories);

  merged.title = merged.title || code;
  merged.description = merged.description || 'Sepette uygun koşullarda uygulanabilir.';
  merged.scope_label = merged.scope_label || '';
  return merged;
}

function discountFor(coupon, eligibleSubtotal) {
  const type = lower(coupon.discount_type || coupon.type);
  const value = Number(coupon.discount_value || 0);
  const subtotal = Math.max(0, Number(eligibleSubtotal || 0));

  if (type === 'free_shipping') return 0;
  if (!Number.isFinite(value) || value <= 0) return 0;

  let discount = 0;
  if (type === 'percent') discount = subtotal * (value / 100);
  else discount = value;

  if (coupon.max_discount_amount && Number.isFinite(Number(coupon.max_discount_amount))) {
    discount = Math.min(discount, Number(coupon.max_discount_amount));
  }
  return normalizeMoney(Math.max(0, Math.min(subtotal, discount)));
}

function isActiveRedemptionStatus(status) {
  const normalized = lower(status || 'used');
  return normalized === 'used' || normalized === 'reserved';
}

async function hasTrustedSmartRoutineCompletion(context, user) {
  if (!user?.id) return false;
  const rows = await safeSelect(context, 'customer_routine_results', {
    select: 'id,user_id,completed_at,is_active,updated_at,created_at',
    user_id: `eq.${user.id}`,
    is_active: 'eq.true',
    order: 'updated_at.desc',
    limit: '5'
  });
  return (rows || []).some((row) => Boolean(row?.completed_at || row?.updated_at || row?.created_at));
}

function resolveEligibilitySpec(code, coupon, rule) {
  const meta = coupon?.eligibility && typeof coupon.eligibility === 'object' ? coupon.eligibility : {};
  const normalizedMetaTiers = safeArray(meta.allowed_tiers).map(lower).filter(Boolean);
  const normalizedRuleTiers = safeArray(rule?.tier).map(lower).filter(Boolean);
  const approvedCode = normalizeCouponCode(code);

  const requires_auth = meta.requires_auth === true
    || approvedCode === 'WELCOME10'
    || approvedCode === 'BIRTHDAY10'
    || approvedCode === 'ROUTINE5'
    || normalizedMetaTiers.length > 0
    || normalizedRuleTiers.length > 0;

  const allowed_tiers = normalizedMetaTiers.length ? normalizedMetaTiers : normalizedRuleTiers;
  const requires_first_order = meta.requires_first_order === true || approvedCode === 'WELCOME10' || Boolean(rule?.first_order_only);
  const requires_birthday_month = meta.requires_birthday_month === true || approvedCode === 'BIRTHDAY10' || Boolean(rule?.birthday_date_only);
  const requires_smart_routine = meta.requires_smart_routine === true || approvedCode === 'ROUTINE5';

  return {
    requires_auth,
    allowed_tiers,
    requires_first_order,
    requires_birthday_month,
    requires_smart_routine
  };
}

function failEligibility({ code, reason_code, internal_reason, eligibility_context = {}, coupon = null } = {}) {
  const safeCode = normalizeCouponCode(code);
  return {
    allowed: false,
    code: safeCode,
    reason_code,
    customer_message: customerFacingMessage(reason_code),
    internal_reason: internal_reason || reason_code,
    eligibility_context,
    coupon
  };
}

function okEligibility({ code, coupon, discountAmount, discountType, freeShipping, eligibility_context = {} }) {
  const safeCode = normalizeCouponCode(code);
  return {
    allowed: true,
    code: safeCode,
    reason_code: 'eligible',
    customer_message: 'Kupon uygulanabilir.',
    internal_reason: 'eligible',
    eligibility_context,
    coupon,
    discountAmount,
    discountType,
    freeShipping
  };
}

export async function validateCouponEligibility(context, {
  code: rawCode,
  subtotal = 0,
  user = null,
  customerEmail = '',
  checkout = false,
  cartItems = null,
  existingCouponCode = null
} = {}) {
  const code = normalizeCouponCode(rawCode);
  const now = nowMs();

  if (!code) {
    const denied = failEligibility({ code: '', reason_code: 'coupon_not_found', internal_reason: 'empty_coupon_code' });
    return {
      eligible: false,
      code: '',
      reasonCode: 'coupon_not_found',
      message: denied.customer_message,
      manualApplyRequired: true,
      ...denied
    };
  }

  if (DEPRECATED_COUPONS.has(code)) {
    const denied = failEligibility({ code, reason_code: 'coupon_deprecated', internal_reason: 'deprecated_coupon_code' });
    return {
      eligible: false,
      code,
      reasonCode: denied.reason_code,
      message: denied.customer_message,
      manualApplyRequired: true,
      ...denied
    };
  }

  const rule = defaultRuleFor(code);
  const dbCoupon = await findCoupon(context, code);
  if (!dbCoupon) {
    const denied = failEligibility({ code, reason_code: 'coupon_not_found', internal_reason: 'coupon_row_missing' });
    return {
      eligible: false,
      code,
      reasonCode: denied.reason_code,
      message: denied.customer_message,
      manualApplyRequired: true,
      ...denied
    };
  }

  if (dbCoupon.is_active === false) {
    const denied = failEligibility({ code, reason_code: 'coupon_inactive', internal_reason: 'coupon_inactive_flag' });
    return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
  }

  if (dbCoupon.starts_at && toMs(dbCoupon.starts_at) > now) {
    const denied = failEligibility({ code, reason_code: 'coupon_not_started', internal_reason: 'starts_at_in_future', eligibility_context: { starts_at: dbCoupon.starts_at } });
    return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
  }

  if (dbCoupon.ends_at && toMs(dbCoupon.ends_at) < now) {
    const denied = failEligibility({ code, reason_code: 'coupon_expired', internal_reason: 'ends_at_passed', eligibility_context: { ends_at: dbCoupon.ends_at } });
    return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
  }

  const coupon = resolveCouponEnvelope(dbCoupon, rule, code);
  const eligibilitySpec = resolveEligibilitySpec(code, coupon, rule);

  const safeSubtotal = normalizeMoney(Math.max(0, Number(subtotal || 0)));
  const minSubtotal = Number(coupon.min_subtotal || 0);

  const discountType = lower(coupon.discount_type || coupon.type);
  const rawDiscountValue = Number(coupon.discount_value || 0);
  const invalidDiscount = discountType === 'free_shipping'
    ? false
    : (!Number.isFinite(rawDiscountValue) || rawDiscountValue <= 0);
  if (invalidDiscount) {
    const denied = failEligibility({ code, reason_code: 'invalid_discount', internal_reason: 'discount_value_invalid', eligibility_context: { discount_type: discountType, discount_value: coupon.discount_value } });
    return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
  }

  // Stackability: defend against a second coupon being supplied in the same flow.
  const normalizedExisting = normalizeCouponCode(existingCouponCode);
  if (normalizedExisting && normalizedExisting !== code && coupon.stackable === false) {
    const denied = failEligibility({ code, reason_code: 'coupon_not_stackable', internal_reason: 'non_stackable_coupon_with_existing', eligibility_context: { existing_coupon: normalizedExisting } });
    return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
  }

  // Exclusions: C1A safe mode — fail closed if exclusions are configured, unless we later add line-level allocation.
  // This guarantees excluded items never silently receive a discount.
  const hasExclusions = (coupon.excluded_product_slugs || []).length > 0 || (coupon.excluded_categories || []).length > 0;
  if (hasExclusions) {
    const denied = failEligibility({
      code,
      reason_code: (coupon.excluded_product_slugs || []).length ? 'product_excluded' : 'category_excluded',
      internal_reason: 'coupon_exclusions_present_fail_closed',
      eligibility_context: {
        excluded_product_slugs: coupon.excluded_product_slugs || [],
        excluded_categories: coupon.excluded_categories || []
      }
    });
    return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
  }

  if (safeSubtotal > 0 && minSubtotal > safeSubtotal) {
    const denied = failEligibility({ code, reason_code: 'min_subtotal_not_met', internal_reason: 'subtotal_below_minimum', eligibility_context: { min_subtotal: minSubtotal, subtotal: safeSubtotal } });
    return {
      eligible: false,
      code,
      reasonCode: denied.reason_code,
      message: denied.customer_message,
      manualApplyRequired: true,
      minSubtotal,
      maxDiscount: coupon.max_discount_amount || null,
      ...denied
    };
  }

  const email = lower(customerEmail || user?.email || '');
  const redemptions = await findRedemptions(context, code, user, email);
  const activeRedemptions = (redemptions || []).filter((r) => isActiveRedemptionStatus(r?.status));
  const usedOnly = (redemptions || []).filter((r) => lower(r?.status || 'used') === 'used');
  const pendingReservations = await findReservations(context, code, user, email);

  // usage_limit: global across used + active reserved.
  const usageLimit = Number(coupon.usage_limit || 0);
  if (usageLimit > 0) {
    const all = await safeSelect(context, 'coupon_redemptions', { select: 'id,status', code: `eq.${code}`, limit: String(Math.max(usageLimit + 3, 20)) });
    const activeCount = (all || []).filter((r) => isActiveRedemptionStatus(r?.status)).length;
    if (activeCount >= usageLimit) {
      const denied = failEligibility({ code, reason_code: 'usage_limit_reached', internal_reason: 'usage_limit_reached', eligibility_context: { usage_limit: usageLimit, active_count: activeCount } });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
  }

  // per_customer_limit: per customer across used + active reserved (hardening).
  const perCustomerLimit = Number(coupon.per_customer_limit || 0);
  if (perCustomerLimit > 0 && activeRedemptions.length >= perCustomerLimit) {
    const denied = failEligibility({
      code,
      reason_code: 'per_customer_limit_reached',
      internal_reason: 'per_customer_limit_reached',
      eligibility_context: { per_customer_limit: perCustomerLimit, active_count: activeRedemptions.length }
    });
    return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
  }

  if (eligibilitySpec.requires_auth && !user?.id) {
    const denied = failEligibility({ code, reason_code: 'authentication_required', internal_reason: 'auth_required_missing_user' });
    return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
  }

  // Membership tier enforcement (trusted source only).
  let resolvedTier = null;
  if (eligibilitySpec.allowed_tiers && eligibilitySpec.allowed_tiers.length) {
    if (!user?.id) {
      const denied = failEligibility({ code, reason_code: 'membership_required', internal_reason: 'allowed_tiers_requires_auth' });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
    const membership = await findMembership(context, user);
    resolvedTier = lower(membership?.level_code || membership?.tier || '');
    if (!['essential', 'signature', 'elite'].includes(resolvedTier)) resolvedTier = 'essential';
    if (!eligibilitySpec.allowed_tiers.includes(resolvedTier)) {
      const denied = failEligibility({
        code,
        reason_code: 'membership_tier_not_allowed',
        internal_reason: 'tier_not_allowed',
        eligibility_context: { tier: resolvedTier, allowed_tiers: eligibilitySpec.allowed_tiers }
      });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
  }

  // First successful paid order (WELCOME10) — keep hardened anti-abuse behavior.
  if (eligibilitySpec.requires_first_order) {
    if (!user?.id) {
      const denied = failEligibility({ code, reason_code: 'authentication_required', internal_reason: 'first_order_requires_auth' });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
    if (code === 'WELCOME10' && (user.email_confirmed_at === null || user.email_verified === false)) {
      const denied = failEligibility({ code, reason_code: 'authentication_required', internal_reason: 'email_verification_required' });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
    const orders = await findOrders(context, user, email);
    if ((orders || []).some(successOrder)) {
      const denied = failEligibility({ code, reason_code: 'first_order_required', internal_reason: 'prior_success_order_found' });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
    if (activeRedemptions.length) {
      const denied = failEligibility({ code, reason_code: 'per_customer_limit_reached', internal_reason: 'already_used_or_reserved_first_order_coupon' });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
    if ((pendingReservations || []).length) {
      const denied = failEligibility({ code, reason_code: 'per_customer_limit_reached', internal_reason: 'pending_reservation_detected' });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
  }

  // Birthday rule (BIRTHDAY10) — do not weaken.
  if (eligibilitySpec.requires_birthday_month) {
    if (!user?.id) {
      const denied = failEligibility({ code, reason_code: 'authentication_required', internal_reason: 'birthday_coupon_requires_auth' });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
    const profile = await findProfile(context, user);
    const birthDate = profile?.birthday || profile?.birth_date || '';
    if (!birthDate) {
      const denied = failEligibility({ code, reason_code: 'birthday_month_required', internal_reason: 'missing_profile_birthday' });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
    const windowDays = Number(rule?.birthday_window_days ?? 0);
    if (!isBirthdayCouponEligible(birthDate, new Date(), windowDays)) {
      const denied = failEligibility({ code, reason_code: 'birthday_month_required', internal_reason: 'birthday_window_not_matched', eligibility_context: { window_days: windowDays } });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
    if (code === 'BIRTHDAY10') {
      const orders = await findOrders(context, user, email);
      const hasPaidOrder = (orders || []).some(successOrder);
      const accountAge = user.created_at ? daysBetween(new Date(user.created_at).getTime(), now) : 0;
      if (!hasPaidOrder && accountAge < Number(rule?.account_age_days_or_paid_order || 30)) {
        const denied = failEligibility({ code, reason_code: 'authentication_required', internal_reason: 'birthday_account_age_gate' });
        return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
      }
      const usedThisYear = usedOnly.some((r) => new Date(r.created_at || r.used_at || 0).getFullYear() === currentYear());
      if (usedThisYear) {
        const denied = failEligibility({ code, reason_code: 'per_customer_limit_reached', internal_reason: 'birthday_coupon_used_this_year' });
        return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
      }
    }
  }

  // Smart routine completion (ROUTINE5) — must be trusted DB record.
  if (eligibilitySpec.requires_smart_routine) {
    if (!user?.id) {
      const denied = failEligibility({ code, reason_code: 'authentication_required', internal_reason: 'routine_coupon_requires_auth' });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
    const completed = await hasTrustedSmartRoutineCompletion(context, user);
    if (!completed) {
      const denied = failEligibility({ code, reason_code: 'smart_routine_required', internal_reason: 'no_trusted_routine_completion' });
      return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
    }
  }

  const discountAmount = discountFor(coupon, safeSubtotal);
  if (discountType !== 'free_shipping' && discountAmount <= 0) {
    const denied = failEligibility({ code, reason_code: 'invalid_discount', internal_reason: 'computed_discount_zero', eligibility_context: { subtotal: safeSubtotal } });
    return { eligible: false, code, reasonCode: denied.reason_code, message: denied.customer_message, manualApplyRequired: true, ...denied };
  }

  const freeShipping = discountType === 'free_shipping';
  const ok = okEligibility({
    code,
    coupon,
    discountAmount,
    discountType,
    freeShipping,
    eligibility_context: {
      subtotal: safeSubtotal,
      min_subtotal: minSubtotal,
      tier: resolvedTier,
      checkout: Boolean(checkout),
      cart_items_present: Array.isArray(cartItems) ? cartItems.length : 0
    }
  });

  // Backward-compatible response shape + new required fields.
  return {
    eligible: true,
    code: ok.code,
    reasonCode: ok.reason_code,
    message: ok.customer_message,
    minSubtotal,
    maxDiscount: coupon.max_discount_amount || null,
    discountAmount: ok.discountAmount,
    discountType: ok.discountType,
    freeShipping: ok.freeShipping,
    expiresAt: coupon.ends_at || coupon.expires_at || null,
    manualApplyRequired: true,
    title: coupon.title,
    description: coupon.description,
    scopeLabel: coupon.scope_label,
    coupon,
    ...ok
  };
}

export function publicCouponRow(result) {
  const coupon = result.coupon || {};
  return {
    id: coupon.id || `${result.code.toLowerCase()}-eligibility`,
    code: result.code,
    coupon_code: result.code,
    title: result.title || coupon.title || result.code,
    description: result.description || coupon.description || result.message,
    status: result.eligible ? 'available' : 'locked',
    reason_code: result.reasonCode,
    message: result.message,
    discount_type: result.discountType || coupon.discount_type,
    discount_value: Number(coupon.discount_value || 0),
    min_subtotal: result.minSubtotal ?? coupon.min_subtotal ?? 0,
    max_discount_amount: result.maxDiscount ?? coupon.max_discount_amount ?? null,
    scope_label: result.scopeLabel || coupon.scope_label || '',
    expires_at: result.expiresAt || coupon.ends_at || coupon.expires_at || null,
    manual_apply_required: true,
    copyable: Boolean(result.eligible),
    source: 'backend_eligibility'
  };
}
