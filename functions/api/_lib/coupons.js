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

function couponEnvelope(coupon, rule, code) {
  const merged = { ...(coupon || {}), ...(rule || {}) };
  merged.code = code;
  merged.discount_type = rule?.discount_type || coupon?.discount_type || coupon?.type || 'amount';
  merged.discount_value = Number(rule?.discount_value ?? coupon?.discount_value ?? coupon?.value ?? 0);
  merged.min_subtotal = Number(rule?.min_subtotal ?? coupon?.min_subtotal ?? coupon?.min_cart_total ?? 0);
  merged.max_discount_amount = Number(rule?.max_discount_amount ?? coupon?.max_discount_amount ?? coupon?.max_discount ?? 0) || null;
  merged.per_customer_limit = Number(rule?.per_customer_limit ?? coupon?.per_customer_limit ?? 0) || 0;
  merged.title = rule?.title || coupon?.title || code;
  merged.description = rule?.description || coupon?.description || 'Sepette uygun koşullarda uygulanabilir.';
  merged.scope_label = rule?.scope_label || coupon?.scope_label || '';
  return merged;
}

function fail(code, reasonCode, message, extra = {}) {
  return { eligible: false, code, reasonCode, message, manualApplyRequired: true, ...extra };
}

function discountFor(coupon, subtotal) {
  const type = lower(coupon.discount_type || coupon.type);
  let discount = 0;
  if (type === 'percent') discount = Number(subtotal || 0) * (Number(coupon.discount_value || 0) / 100);
  else if (type !== 'free_shipping') discount = Number(coupon.discount_value || 0);
  if (coupon.max_discount_amount) discount = Math.min(discount, Number(coupon.max_discount_amount));
  return normalizeMoney(Math.max(0, Math.min(Number(subtotal || 0), discount)));
}

export async function validateCouponEligibility(context, { code: rawCode, subtotal = 0, user = null, customerEmail = '', checkout = false } = {}) {
  const code = normalizeCouponCode(rawCode);
  if (!code) return fail('', 'INACTIVE', 'Kupon kodu boş olamaz.');
  if (DEPRECATED_COUPONS.has(code)) return fail(code, 'DEPRECATED', 'Bu kupon artık aktif değildir.');

  const rule = defaultRuleFor(code);
  const dbCoupon = await findCoupon(context, code);
  if (!dbCoupon || dbCoupon.is_active === false) return fail(code, 'INACTIVE', 'Kupon kodu geçersiz veya pasif.');

  const now = nowMs();
  if (dbCoupon.starts_at && toMs(dbCoupon.starts_at) > now) return fail(code, 'INACTIVE', 'Kupon henüz aktif değil.');
  if (dbCoupon.ends_at && toMs(dbCoupon.ends_at) < now) return fail(code, 'EXPIRED', 'Kupon süresi dolmuş.');

  const coupon = couponEnvelope(dbCoupon, rule, code);
  const minSubtotal = Number(coupon.min_subtotal || 0);
  if (Number(subtotal || 0) > 0 && minSubtotal > Number(subtotal || 0)) {
    return fail(code, 'MIN_SUBTOTAL_NOT_MET', `Bu kupon için minimum sepet tutarı ${minSubtotal.toLocaleString('tr-TR')} TL.`, { minSubtotal, maxDiscount: coupon.max_discount_amount || null });
  }

  const email = lower(customerEmail || user?.email || '');
  const redemptions = await findRedemptions(context, code, user, email);
  const usedOrReserved = (redemptions || []).filter((r) => ['used', 'reserved'].includes(lower(r.status || 'used')));
  const usedOnly = (redemptions || []).filter((r) => lower(r.status || 'used') === 'used');
  const pendingReservations = await findReservations(context, code, user, email);

  if (code === 'WELCOME10') {
    if (!user?.id) return fail(code, 'FIRST_ORDER_ONLY', 'WELCOME10 yalnızca giriş yapmış yeni müşteriler için geçerlidir.');
    if (user.email_confirmed_at === null || user.email_verified === false) return fail(code, 'ANTI_ABUSE_REVIEW', 'Bu kupon için hesap doğrulama koşulları tamamlanmalıdır.');
    const orders = await findOrders(context, user, email);
    if ((orders || []).some(successOrder)) return fail(code, 'ALREADY_USED', 'WELCOME10 ilk başarılı siparişe özeldir.');
    if (usedOrReserved.length) return fail(code, 'ALREADY_USED', 'WELCOME10 kullanım hakkınız daha önce kullanılmış veya ayrılmış görünüyor.');
    if ((pendingReservations || []).length) return fail(code, 'RESERVED_ON_PENDING_ORDER', 'Bu kupon bekleyen başka bir siparişte ayrılmış görünüyor.');
  }

  if (code === 'BIRTHDAY10') {
    if (!user?.id) return fail(code, 'BIRTHDAY_NOT_ELIGIBLE', 'Doğum günü kuponu için giriş yapmanız gerekir.');
    const profile = await findProfile(context, user);
    const birthDate = profile?.birthday || profile?.birth_date || user?.user_metadata?.birthday || user?.user_metadata?.birth_date || '';
    if (!birthDate) return fail(code, 'BIRTHDAY_NOT_ELIGIBLE', 'Doğum günü avantajı için doğum tarihinizi hesabınıza ekleyin.');
    const windowDays = Number(rule?.birthday_window_days ?? 0);
    if (!isBirthdayCouponEligible(birthDate, new Date(), windowDays)) {
      return fail(code, 'BIRTHDAY_NOT_ELIGIBLE', windowDays > 0
        ? 'BIRTHDAY10 yalnızca doğum günü döneminizde aktif olur.'
        : 'BIRTHDAY10 yalnızca doğum gününüzde aktif olur.');
    }
    const orders = await findOrders(context, user, email);
    const hasPaidOrder = (orders || []).some(successOrder);
    const accountAge = user.created_at ? daysBetween(new Date(user.created_at).getTime(), now) : 0;
    if (!hasPaidOrder && accountAge < Number(rule?.account_age_days_or_paid_order || 30)) return fail(code, 'ACCOUNT_TOO_NEW', 'Doğum günü kuponunuz hesap doğrulama ve uygunluk kontrolleri tamamlandığında aktif olur.');
    const usedThisYear = usedOnly.some((r) => new Date(r.created_at || r.used_at || 0).getFullYear() === currentYear());
    if (usedThisYear) return fail(code, 'ALREADY_USED', 'BIRTHDAY10 her takvim yılında bir kez kullanılabilir.');
  }

  if (rule?.tier) {
    if (!user?.id) return fail(code, 'TIER_NOT_ELIGIBLE', 'Bu kupon üyelik seviyesine özeldir.');
    const membership = await findMembership(context, user);
    const level = lower(membership?.level_code || membership?.tier || 'essential');
    if (!rule.tier.includes(level)) return fail(code, 'TIER_NOT_ELIGIBLE', 'Bu kupon kullanım koşullarını şu anda karşılamıyor.');
  }

  const usageLimit = Number(coupon.usage_limit || 0);
  if (usageLimit > 0) {
    const allUsed = await safeSelect(context, 'coupon_redemptions', { select: 'id,status', code: `eq.${code}`, limit: String(usageLimit + 1) });
    if ((allUsed || []).filter((r) => ['used', 'reserved'].includes(lower(r.status || 'used'))).length >= usageLimit) return fail(code, 'EXPIRED', 'Bu kuponun kullanım limiti dolmuş.');
  }
  if (Number(coupon.per_customer_limit || 0) > 0 && usedOnly.length >= Number(coupon.per_customer_limit || 0)) {
    return fail(code, 'ALREADY_USED', 'Bu kupon için kullanım hakkınızı tamamladınız.');
  }

  const discountAmount = discountFor(coupon, Number(subtotal || 0));
  return {
    eligible: true,
    code,
    reasonCode: 'ELIGIBLE',
    message: 'Kupon uygulanabilir.',
    minSubtotal,
    maxDiscount: coupon.max_discount_amount || null,
    discountAmount,
    discountType: lower(coupon.discount_type || coupon.type),
    freeShipping: lower(coupon.discount_type || coupon.type) === 'free_shipping',
    expiresAt: coupon.ends_at || coupon.expires_at || null,
    manualApplyRequired: true,
    title: coupon.title,
    description: coupon.description,
    scopeLabel: coupon.scope_label,
    coupon
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
