import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { selectRows } from '../_lib/supabase.js';

function welcomeCouponFor(user) {
  const createdAt = user?.created_at ? new Date(user.created_at).getTime() : Date.now();
  return {
    id: 'welcome10-virtual',
    code: 'WELCOME10',
    coupon_code: 'WELCOME10',
    title: 'Yeni üyeye özel %10 hoş geldin avantajı',
    description: '1.000 TL ve üzeri ilk alışverişinde geçerlidir.',
    status: 'available',
    discount_type: 'percent',
    discount_value: 10,
    min_subtotal: 1000,
    scope_label: '1.000 TL ve üzeri ilk alışverişte',
    expires_at: new Date(createdAt + 30 * 24 * 60 * 60 * 1000).toISOString(),
    source: 'welcome_virtual'
  };
}

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const [coupons, orders] = await Promise.all([
    selectRows(context, 'customer_coupons', {
      select: '*',
      user_id: `eq.${auth.user.id}`,
      order: 'created_at.desc',
      limit: '100'
    }).catch(() => []),
    selectRows(context, 'orders', {
      select: 'id',
      user_id: `eq.${auth.user.id}`,
      limit: '1'
    }).catch(() => [])
  ]);
  const rows = (coupons || []).filter((coupon) => String(coupon.code || coupon.coupon_code || '').toUpperCase() !== 'CLUB10');
  const hasWelcome = rows.some((coupon) => String(coupon.code || coupon.coupon_code || '').toUpperCase() === 'WELCOME10');
  if (!hasWelcome && !(orders || []).length) rows.unshift(welcomeCouponFor(auth.user));
  return json({ ok: true, coupons: rows });
}
