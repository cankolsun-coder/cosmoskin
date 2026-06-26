import { selectRows } from '../_lib/supabase.js';
import { catalog } from '../_lib/catalog.js';
import { json } from '../_lib/response.js';
import { assertRateLimit } from '../_lib/security.js';

const FREE_SHIPPING_LIMIT = 2500;
const SHIPPING_FEE = 119;
const EXPRESS_SURCHARGE = 49.90;
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

function money(value) {
  const number = Number(value || 0);
  return Math.round((Number.isFinite(number) ? number : 0) * 100) / 100;
}

function subtotalFromCart(cart = []) {
  const products = Array.isArray(catalog) ? catalog : Object.values(catalog || {});
  const map = new Map(products.map((product) => [String(product.slug || product.id), product]));
  return money((Array.isArray(cart) ? cart : []).reduce((sum, item) => {
    const product = map.get(String(item.slug || item.product_slug || item.id || ''));
    if (!product) return sum;
    const price = Number(product.price || 0);
    const quantity = Math.max(1, Math.min(10, Math.floor(Number(item.qty || item.quantity || 1) || 1)));
    return sum + price * quantity;
  }, 0));
}

export function calculateCouponPreview(coupon, subtotal, shippingMethod = 'standard') {
  const safeSubtotal = money(Math.max(0, subtotal));
  const type = String(coupon?.discount_type || coupon?.type || '').trim().toLowerCase();
  const value = Number(coupon?.discount_value ?? coupon?.value ?? 0);
  const maximum = Number(coupon?.max_discount_amount ?? coupon?.max_discount ?? 0);
  let discount = type === 'percent' ? safeSubtotal * value / 100 : (type === 'free_shipping' ? 0 : value);
  if (maximum > 0) discount = Math.min(discount, maximum);
  discount = money(Math.max(0, Math.min(discount, safeSubtotal)));
  const discountedSubtotal = money(Math.max(0, safeSubtotal - discount));
  const freeShipping = type === 'free_shipping';
  let shipping = 0;
  if (discountedSubtotal > 0 && !freeShipping) {
    shipping = discountedSubtotal >= FREE_SHIPPING_LIMIT ? 0 : SHIPPING_FEE;
    if (String(shippingMethod || '').toLowerCase() === 'express') shipping += EXPRESS_SURCHARGE;
  }
  shipping = money(Math.max(0, shipping));
  return {
    type,
    discount,
    freeShipping,
    shipping,
    total: money(Math.max(0, discountedSubtotal + shipping))
  };
}

export async function onRequestPost(context) {
  try {
    assertRateLimit(context, 'coupon-validate', 60, 10 * 60 * 1000);
    const contentType = String(context.request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) return json({ ok: false, error: 'İstek içerik türü application/json olmalıdır.' }, { status: 415, headers: NO_STORE });
    const body = await context.request.json().catch(() => ({}));
    const code = String(body.code || '').trim().toUpperCase().slice(0, 40);
    if (!code) return json({ ok: false, error: 'Kupon kodu gerekli.' }, { status: 400, headers: NO_STORE });
    const rows = await selectRows(context, 'coupons', { select: '*', code: `eq.${code}`, is_active: 'eq.true', limit: '1' });
    const coupon = Array.isArray(rows) ? rows[0] : null;
    if (!coupon) return json({ ok: false, error: 'Kupon bulunamadı veya aktif değil.' }, { status: 404, headers: NO_STORE });
    const now = Date.now();
    if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return json({ ok: false, error: 'Kupon henüz başlamadı.' }, { status: 400, headers: NO_STORE });
    if (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) return json({ ok: false, error: 'Kupon süresi doldu.' }, { status: 400, headers: NO_STORE });
    const usageLimit = Number(coupon.usage_limit || 0);
    if (usageLimit > 0) {
      const used = await selectRows(context, 'coupon_redemptions', { select: 'id', coupon_id: `eq.${coupon.id}`, limit: String(usageLimit) }).catch(() => []);
      if ((used || []).length >= usageLimit) return json({ ok: false, error: 'Bu kuponun kullanım limiti doldu.' }, { status: 400, headers: NO_STORE });
    }
    const subtotal = subtotalFromCart(body.cart);
    if (subtotal <= 0) return json({ ok: false, error: 'Kuponu uygulamak için sepetinizde geçerli ürün bulunmalıdır.' }, { status: 400, headers: NO_STORE });
    if (subtotal < Number(coupon.min_subtotal || 0)) return json({ ok: false, error: `Bu kupon için minimum sepet tutarı ${Number(coupon.min_subtotal).toFixed(0)} TL.` }, { status: 400, headers: NO_STORE });
    const preview = calculateCouponPreview(coupon, subtotal, body.shipping_method || body.shippingMethod || 'standard');
    const discountLabel = preview.freeShipping ? 'Ücretsiz kargo' : `${preview.discount.toFixed(0)} TL indirim`;
    return json({
      ok: true,
      code: coupon.code,
      title: coupon.title,
      type: preview.type,
      freeShipping: preview.freeShipping,
      discountAmount: preview.discount,
      shippingAmount: preview.shipping,
      totalAmount: preview.total,
      discountLabel,
      minSubtotal: Number(coupon.min_subtotal || 0)
    }, { headers: NO_STORE });
  } catch (error) {
    console.error('coupon validation failed:', { message: String(error?.message || 'unknown').slice(0, 180) });
    return json({ ok: false, error: 'Kupon şu anda doğrulanamadı. Lütfen tekrar deneyin.' }, { status: error?.status || 503, headers: NO_STORE });
  }
}
