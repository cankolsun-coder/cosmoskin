import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { insertRow, selectRows } from '../_lib/supabase.js';

const REDEMPTIONS = {
  '1000': { points: 1000, amount: 30, minSubtotal: 350, label: '30 TL indirim' },
  '2500': { points: 2500, amount: 90, minSubtotal: 750, label: '90 TL indirim' },
  '5000': { points: 5000, amount: 200, minSubtotal: 1500, label: '200 TL indirim' },
  '7500': { points: 7500, amount: 0, minSubtotal: 0, label: 'Ücretsiz kargo / mini ürün', type: 'benefit' }
};

function codeFor(points) {
  return `CSCLUB-${points}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const body = await context.request.json().catch(() => ({}));
  const tier = REDEMPTIONS[String(body.points || body.points_spent || '')];
  if (!tier) return json({ ok: false, error: 'Geçersiz puan kullanım seçeneği.' }, { status: 400 });
  const rows = await selectRows(context, 'loyalty_points_ledger', { select: 'points_delta,expires_at', user_id: `eq.${auth.user.id}`, limit: '500' }).catch(() => []);
  const balance = (rows || []).filter((row) => !row.expires_at || new Date(row.expires_at) > new Date()).reduce((sum, row) => sum + Number(row.points_delta || 0), 0);
  if (balance < tier.points) return json({ ok: false, error: 'Bu kullanım için yeterli puanınız yok.' }, { status: 409 });
  const couponCode = codeFor(tier.points);
  const coupon = await insertRow(context, 'customer_coupons', {
    user_id: auth.user.id,
    email: String(auth.user.email || '').toLowerCase(),
    code: couponCode,
    source: 'loyalty_redemption',
    status: 'available',
    min_subtotal: tier.minSubtotal,
    discount_type: tier.type === 'benefit' ? 'benefit' : 'fixed',
    discount_value: tier.amount,
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString(),
    metadata: { label: tier.label, points_spent: tier.points }
  });
  await insertRow(context, 'loyalty_points_ledger', {
    user_id: auth.user.id,
    email: String(auth.user.email || '').toLowerCase(),
    event_type: 'redemption',
    points_delta: -tier.points,
    balance_after: balance - tier.points,
    coupon_id: coupon?.id || null,
    source: 'account',
    metadata: { label: tier.label, coupon_code: couponCode }
  });
  await insertRow(context, 'loyalty_redemptions', {
    user_id: auth.user.id,
    email: String(auth.user.email || '').toLowerCase(),
    points_spent: tier.points,
    benefit_type: tier.label,
    coupon_id: coupon?.id || null,
    status: 'issued',
    metadata: { coupon_code: couponCode }
  });
  return json({ ok: true, coupon, balance_after: balance - tier.points });
}
