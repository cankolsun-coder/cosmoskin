import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { selectRows } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const coupons = await selectRows(context, 'customer_coupons', {
    select: '*',
    user_id: `eq.${auth.user.id}`,
    order: 'created_at.desc',
    limit: '100'
  }).catch(() => []);
  return json({ ok: true, coupons: coupons || [] });
}
