import { getUserFromAccessToken } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { validateCouponEligibility } from '../_lib/coupons.js';


const COUPON_PREVIEW_FREE_SHIPPING_LIMIT = 2500;
const COUPON_PREVIEW_STANDARD_SHIPPING = 119;

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Math.round((Number.isFinite(number) ? number : 0) * 100) / 100;
}

export function calculateCouponPreview(coupon = {}, subtotal = 0, shippingMethod = 'standard') {
  const safeSubtotal = normalizeMoney(Math.max(0, Number(subtotal || 0)));
  const type = String(coupon.discount_type || coupon.type || '').trim().toLowerCase();
  const rawValue = Number(coupon.discount_value ?? coupon.value ?? 0);
  let discount = 0;
  let freeShipping = false;

  if (type === 'free_shipping') {
    freeShipping = true;
  } else if (type === 'percent') {
    discount = safeSubtotal * (Number.isFinite(rawValue) ? rawValue : 0) / 100;
  } else if (type === 'fixed' || type === 'amount') {
    discount = Number.isFinite(rawValue) ? rawValue : 0;
  }

  discount = normalizeMoney(Math.max(0, Math.min(safeSubtotal, discount)));
  const discountedSubtotal = normalizeMoney(Math.max(0, safeSubtotal - discount));
  const shipping = freeShipping || discountedSubtotal === 0 || discountedSubtotal >= COUPON_PREVIEW_FREE_SHIPPING_LIMIT
    ? 0
    : COUPON_PREVIEW_STANDARD_SHIPPING;
  const total = normalizeMoney(discountedSubtotal + shipping);

  return {
    subtotal: safeSubtotal,
    discount,
    shipping,
    total,
    freeShipping,
    shippingMethod: String(shippingMethod || 'standard')
  };
}

function normalizeCartItem(raw = {}) {
  const price = Number(raw.price || raw.unit_price || raw.unitPrice || 0);
  const quantity = Math.max(1, Number(raw.quantity || raw.qty || 1));
  return { price: Number.isFinite(price) ? price : 0, quantity: Number.isFinite(quantity) ? quantity : 1 };
}

function subtotalFromCart(cart = []) {
  if (!Array.isArray(cart)) return 0;
  return Math.round(cart.reduce((sum, raw) => {
    const item = normalizeCartItem(raw);
    return sum + item.price * item.quantity;
  }, 0) * 100) / 100;
}

function authToken(context, body = {}) {
  const header = String(context.request.headers.get('authorization') || '');
  const bearer = header.replace(/^Bearer\s+/i, '').trim();
  return body.accessToken || body.access_token || bearer || '';
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const code = String(body.code || body.coupon_code || '').trim().toUpperCase();
    const subtotal = Number(body.subtotal ?? subtotalFromCart(body.cart || []));
    const token = authToken(context, body);
    const user = token ? await getUserFromAccessToken(context, token).catch(() => null) : null;
    const customerEmail = body.customer_email || body.email || body.customer?.email || user?.email || '';
    const result = await validateCouponEligibility(context, { code, subtotal, user, customerEmail });

    if (!result.eligible) {
      return json({
        ok: false,
        code: result.reasonCode,
        reasonCode: result.reasonCode,
        error: result.message,
        message: result.message,
        clearStorage: ['DEPRECATED', 'EXPIRED', 'INACTIVE', 'ALREADY_USED'].includes(result.reasonCode)
      }, { status: result.reasonCode === 'INACTIVE' ? 404 : (result.reasonCode === 'FIRST_ORDER_ONLY' || result.reasonCode === 'BIRTHDAY_NOT_ELIGIBLE' ? 403 : 400) });
    }

    return json({
      ok: true,
      code: result.code,
      discount_type: result.discountType,
      discount_value: result.coupon?.discount_value || 0,
      discount_amount: result.discountAmount,
      free_shipping: result.freeShipping,
      freeShipping: result.freeShipping,
      min_subtotal: result.minSubtotal,
      max_discount_amount: result.maxDiscount,
      expires_at: result.expiresAt,
      manual_apply_required: true,
      eligibility_hash: `${result.code}:${Math.round(subtotal)}:${result.reasonCode}`,
      message: result.message,
      coupon: {
        id: result.coupon?.id || null,
        code: result.code,
        title: result.title,
        description: result.description,
        scope_label: result.scopeLabel
      }
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('coupon validate failed:', error);
    return json({ ok: false, error: error.message || 'Kupon doğrulanamadı.' }, { status: 500 });
  }
}
