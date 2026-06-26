import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { rpc, selectRows, upsertRow } from '../_lib/supabase.js';

function computeFallback(orders = [], ledger = []) {
  const paid = orders.filter((o) => ['paid','confirmed','preparing','shipped','delivered'].includes(String(o.payment_status || o.status || '').toLowerCase()) && !['cancelled','payment_failed','refunded'].includes(String(o.status || '').toLowerCase()));
  const spend = paid.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const count = paid.length;
  let level = 'essential';
  let next = 'signature';
  let amount = Math.max(0, 6000 - spend);
  let ordersNeeded = Math.max(0, 3 - count);
  if (spend >= 15000 || count >= 8) { level = 'elite'; next = null; amount = 0; ordersNeeded = 0; }
  else if (spend >= 6000 || count >= 3) { level = 'signature'; next = 'elite'; amount = Math.max(0, 15000 - spend); ordersNeeded = Math.max(0, 8 - count); }
  const balance = ledger.reduce((sum, row) => sum + Number(row.points_delta || 0), 0);
  return { level_code: level, rolling_spend_12m: spend, completed_orders_12m: count, points_balance: balance, next_level_code: next, amount_to_next_level: amount, orders_to_next_level: ordersNeeded, calculated_at: new Date().toISOString(), source: 'fallback' };
}

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const user = auth.user;
  await rpc(context, 'recalculate_customer_membership', { p_user_id: user.id }).catch(() => null);
  const [statusRows, levels, history, orders, ledger] = await Promise.all([
    selectRows(context, 'customer_membership_status', { select: '*', user_id: `eq.${user.id}`, limit: '1' }).catch(() => []),
    selectRows(context, 'membership_levels', { select: '*', is_active: 'eq.true', order: 'sort_order.asc' }).catch(() => []),
    selectRows(context, 'customer_membership_history', { select: '*', user_id: `eq.${user.id}`, order: 'calculated_at.desc', limit: '20' }).catch(() => []),
    selectRows(context, 'orders', { select: 'id,status,payment_status,total_amount,created_at', user_id: `eq.${user.id}`, order: 'created_at.desc', limit: '100' }).catch(() => []),
    selectRows(context, 'loyalty_points_ledger', { select: 'points_delta,expires_at,created_at', user_id: `eq.${user.id}`, limit: '500' }).catch(() => [])
  ]);
  const status = statusRows?.[0] || computeFallback(orders, ledger);
  return json({ ok: true, membership: status, levels, history });
}
