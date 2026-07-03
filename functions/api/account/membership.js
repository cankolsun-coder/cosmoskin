import { json } from '../_lib/response.js';
import { requireUser } from '../_lib/account.js';
import { rpc, selectRows } from '../_lib/supabase.js';
import { computeTierFromSpend } from '../_lib/loyalty-config.js';

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Only used if customer_membership_status has no row yet AND the
// recalculate_customer_membership RPC itself failed (RPC upserts a row on
// every successful call, so this is a rare last-resort path). Spend basis is
// product-net only (subtotal_amount) — shipping is intentionally excluded.
// Balance is ledger status = available only.
function computeFallback(orders = [], ledger = []) {
  const paid = orders.filter((o) => {
    const status = String(o.status || '').toLowerCase();
    const payment = String(o.payment_status || '').toLowerCase();
    return payment === 'paid' && !['cancelled', 'refunded', 'partially_refunded', 'return_requested', 'returned'].includes(status);
  });
  const spend = paid.reduce((sum, o) => sum + Math.max(0, finiteNumber(o.subtotal_amount, 0)), 0);
  const count = paid.length;
  const tier = computeTierFromSpend(spend, count);
  const available = ledger
    .filter((row) => String(row.status || 'available').toLowerCase() === 'available')
    .reduce((sum, row) => sum + finiteNumber(row.points_delta, 0), 0);
  return {
    level_code: tier.code,
    rolling_spend_12m: Math.round(spend * 100) / 100,
    completed_orders_12m: count,
    points_balance: Math.max(0, Math.round(available)),
    next_level_code: tier.nextCode,
    amount_to_next_level: Math.max(0, Math.round((finiteNumber(tier.thresholdSpend, 0) - spend) * 100) / 100),
    orders_to_next_level: 0,
    calculated_at: new Date().toISOString(),
    source: 'fallback'
  };
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
    selectRows(context, 'orders', { select: 'id,status,payment_status,subtotal_amount,created_at', user_id: `eq.${user.id}`, order: 'created_at.desc', limit: '100' }).catch(() => []),
    selectRows(context, 'loyalty_points_ledger', { select: 'points_delta,status,expires_at,created_at', user_id: `eq.${user.id}`, limit: '500' }).catch(() => [])
  ]);
  const status = statusRows?.[0] || computeFallback(orders, ledger);
  return json({ ok: true, membership: status, levels, history });
}
