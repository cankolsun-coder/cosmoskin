import { getUserFromAccessToken } from '../_lib/supabase.js';
import { json } from '../_lib/response.js';
import { validateCouponEligibility } from '../_lib/coupons.js';
import { catalog } from '../_lib/catalog.js';


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

function buildTrustedCartLines(cart = []) {
  // Security: coupon eligibility must not trust client-supplied totals.
  // For /api/coupons/validate we compute a best-effort cart from the server catalog
  // (price + category) and pass it through the shared eligibility engine.
  if (!Array.isArray(cart) || cart.length === 0) return [];
  const products = Array.isArray(catalog) ? catalog : Object.values(catalog || {});
  const index = new Map();
  for (const p of products) {
    if (!p) continue;
    const keys = [p.id, p.slug, p.product_id, p.sku].filter(Boolean).map(String);
    for (const key of keys) index.set(key, p);
  }
  return cart.map((raw) => {
    const normalized = normalizeCartItem(raw);
    const slug = String(raw.slug || raw.product_slug || raw.product_id || raw.productId || raw.id || '').trim();
    const product = index.get(slug);
    const unitPrice = Number(product?.price || 0);
    const trusted = Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0;
    const lineTotal = normalizeMoney(trusted * normalized.quantity);
    return {
      product_id: String(product?.id || slug || '').trim() || null,
      product_slug: String(product?.slug || slug || '').trim() || null,
      product_name: String(product?.name || '').trim() || null,
      brand: String(product?.brand || '').trim() || null,
      category: String(product?.category || '').trim() || null,
      categorySlug: String(product?.categorySlug || '').trim() || null,
      unit_price: trusted,
      quantity: normalized.quantity,
      line_total: lineTotal
    };
  }).filter((row) => Number(row?.line_total) > 0 && (row.product_slug || row.product_id));
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
    const cart = Array.isArray(body.cart) ? body.cart : [];
    const trustedCart = buildTrustedCartLines(cart);
    const subtotal = normalizeMoney(trustedCart.reduce((sum, row) => sum + Number(row.line_total || 0), 0));
    const token = authToken(context, body);
    const user = token ? await getUserFromAccessToken(context, token).catch(() => null) : null;
    const customerEmail = body.customer_email || body.email || body.customer?.email || user?.email || '';
    const result = await validateCouponEligibility(context, {
      code,
      subtotal,
      user,
      customerEmail,
      cartItems: trustedCart
    });

    if (!result.eligible) {
      const reason = result.reason_code || result.reasonCode || 'coupon_inactive';
      const forbidden = new Set([
        'authentication_required',
        'membership_required',
        'membership_tier_not_allowed',
        'birthday_month_required',
        'smart_routine_required',
        'first_order_required'
      ]);
      const status = reason === 'coupon_not_found'
        ? 404
        : (forbidden.has(reason) ? 403 : 400);
      return json({
        ok: false,
        code: reason,
        reasonCode: reason,
        error: result.customer_message || result.message,
        message: result.customer_message || result.message,
        clearStorage: ['coupon_deprecated', 'coupon_expired', 'coupon_inactive', 'coupon_not_found'].includes(reason)
      }, { status });
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
      eligibility_hash: `${result.code}:${Math.round(subtotal)}:${result.reason_code || result.reasonCode}`,
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
