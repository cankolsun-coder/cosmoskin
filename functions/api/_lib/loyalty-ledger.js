// COSMOSKIN Batch 4 — thin JS wrappers around the loyalty SQL RPCs defined in
// supabase/migrations/20260704_batch4_loyalty_ledger.sql.
//
// public.loyalty_points_ledger is the single source of truth. These helpers
// never write to the ledger directly for purchase/promotion/reversal — they
// only call the SECURITY DEFINER RPCs, which own the idempotency/locking.
//
// Every exported function here is intentionally non-throwing: it logs and
// returns a safe default on failure so that callers in payment/admin flows
// (whose primary job is NOT loyalty bookkeeping) are never blocked or broken
// by a loyalty-side error. This mirrors the existing `.catch(() => null)`
// pattern used throughout functions/api/admin/orders.js and
// functions/api/iyzico-callback.js for non-critical side effects.

import { rpc, selectRows } from './supabase.js';

/**
 * Award purchase points for an order (idempotent — no-op if already awarded,
 * order not paid, order in a terminal state, or a guest order with no user_id).
 * Creates a 'pending' ledger row; points are not redeemable until promoted.
 */
export async function awardOrderPoints(context, orderId) {
  if (!orderId) return null;
  try {
    return await rpc(context, 'cosmoskin_award_loyalty_for_order', { p_order_id: orderId });
  } catch (error) {
    console.error('loyalty award failed:', { orderId, message: error?.message || String(error) });
    return null;
  }
}

/**
 * Promote a single order's pending purchase points to available (idempotent —
 * no-op if nothing pending for that order). Call when an order is marked
 * delivered/completed.
 */
export async function promoteOrderPoints(context, orderId) {
  if (!orderId) return null;
  try {
    return await rpc(context, 'cosmoskin_promote_loyalty_for_order', { p_order_id: orderId });
  } catch (error) {
    console.error('loyalty promote failed:', { orderId, message: error?.message || String(error) });
    return null;
  }
}

/**
 * Batch-sweep due promotions (delivered_at + 14 days, or status = completed).
 * Not wired to any cron endpoint in Step 2 — exposed here for a future
 * scheduled job, per the Step 1 SQL migration notes.
 */
export async function promoteDueLoyaltyPoints(context, limit = 500) {
  try {
    return await rpc(context, 'cosmoskin_promote_due_loyalty_points', { p_limit: limit });
  } catch (error) {
    console.error('loyalty due-promotion sweep failed:', error?.message || String(error));
    return null;
  }
}

async function computeRefundRatio(context, orderId, refundAmount) {
  const amount = Number(refundAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rows = await selectRows(context, 'loyalty_points_ledger', {
    select: 'points_basis_amount',
    order_id: `eq.${orderId}`,
    event_type: 'eq.purchase',
    limit: '1'
  }).catch(() => []);
  const basis = Number(rows?.[0]?.points_basis_amount);
  if (!Number.isFinite(basis) || basis <= 0) return null;
  return Math.min(1, amount / basis);
}

/**
 * Reverse purchase points for an order — full or proportional, idempotent.
 * Only call this when an order is ACTUALLY cancelled/refunded/returned by an
 * admin or system action, never for a Batch 3 customer cancel *request* and
 * never for an unpaid direct cancel (which never earned points).
 *
 * ratio: 1 = full reversal. 0 < ratio < 1 = proportional. Omit both `ratio`
 * and `refundAmount` (or pass an unresolvable refundAmount) to flag the earn
 * row for manual review instead of guessing.
 */
export async function reverseOrderPoints(context, orderId, { reason = null, source = 'admin', ratio = null, refundAmount = null } = {}) {
  if (!orderId) return null;
  try {
    let resolvedRatio = ratio;
    if (resolvedRatio == null && refundAmount != null) {
      resolvedRatio = await computeRefundRatio(context, orderId, refundAmount);
    }
    return await rpc(context, 'cosmoskin_reverse_loyalty_for_order', {
      p_order_id: orderId,
      p_reason: reason,
      p_ratio: resolvedRatio,
      p_source: source
    });
  } catch (error) {
    console.error('loyalty reverse failed:', { orderId, message: error?.message || String(error) });
    return null;
  }
}

/**
 * Ledger-backed balance for a user: available/pending/reversed. This is the
 * ONLY function account APIs should call for a live balance — never re-derive
 * available points from spend, totals, or a naive sum of all ledger rows.
 */
export async function getLoyaltyBalance(context, userId) {
  const empty = { available_points: 0, pending_points: 0, reversed_points: 0 };
  if (!userId) return empty;
  try {
    const rows = await rpc(context, 'cosmoskin_loyalty_balance_for_user', { p_user_id: userId });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return empty;
    return {
      available_points: Math.max(0, Math.round(Number(row.available_points) || 0)),
      pending_points: Math.max(0, Math.round(Number(row.pending_points) || 0)),
      reversed_points: Math.max(0, Math.round(Number(row.reversed_points) || 0))
    };
  } catch (error) {
    console.error('loyalty balance fetch failed:', { userId, message: error?.message || String(error) });
    return empty;
  }
}

/**
 * Recalculate a user's membership tier/spend snapshot (product-net, canonical
 * Essential/Signature/Elite thresholds). Wraps the SQL RPC of the same name.
 */
export async function recalculateMembership(context, userId) {
  if (!userId) return null;
  try {
    return await rpc(context, 'recalculate_customer_membership', { p_user_id: userId });
  } catch (error) {
    console.error('membership recalculation failed:', { userId, message: error?.message || String(error) });
    return null;
  }
}
