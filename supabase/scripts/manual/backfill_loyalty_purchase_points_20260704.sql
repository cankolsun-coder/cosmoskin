-- COSMOSKIN Batch 4 — Manual backfill: award purchase points for historical paid
-- orders that have no 'purchase' ledger row yet.
--
-- NOT run automatically by any migration or deploy step. An operator must run
-- this manually against the target database (e.g. via Supabase SQL editor or
-- psql with sufficient privileges to call the SECURITY DEFINER RPCs below).
--
-- Idempotent: relies entirely on public.cosmoskin_award_loyalty_for_order(),
-- which no-ops (reason: 'already_awarded') if a 'purchase' ledger row already
-- exists for the order, and no-ops (reason: 'guest_order_skipped') for orders
-- with no user_id. Safe to re-run any number of times — it will never create
-- a second purchase row for the same order.
--
-- Scope: orders with user_id set, payment_status = 'paid', and status not in
-- the cancelled/refunded/return family. Requires supabase/migrations/
-- 20260704_batch4_loyalty_ledger.sql to already be applied (defines the RPC).
--
-- Usage:
--   1. Run "STEP 1 — BEFORE REPORT" and record the counts.
--   2. Run "STEP 2 — BACKFILL" (idempotent; safe to re-run).
--   3. Run "STEP 3 — AFTER REPORT" and compare against step 1.
--   4. Optionally run "STEP 4 — OPTIONAL DUE PROMOTION" if you want backfilled
--      historical points (most of which are already well past a 14-day
--      delivered window) to be immediately usable instead of sitting in
--      'pending' until the next scheduled promotion sweep.
--
-- Backfilled points are created in 'pending' status, exactly like a live
-- purchase earn — they are not fabricated as 'available'. Promotion still
-- follows the same delivered_at + 14 days (or completed) rule as any other
-- order, unless step 4 below is explicitly run by the operator.

-- =====================================================================
-- STEP 1 — BEFORE REPORT
-- =====================================================================
SELECT
  count(*) FILTER (WHERE l.id IS NULL) AS orders_missing_purchase_ledger_row,
  count(*) FILTER (WHERE l.id IS NOT NULL) AS orders_with_purchase_ledger_row,
  count(*) AS eligible_paid_orders_total
FROM public.orders o
LEFT JOIN public.loyalty_points_ledger l
  ON l.order_id = o.id AND l.event_type = 'purchase'
WHERE o.user_id IS NOT NULL
  AND coalesce(o.payment_status, '') = 'paid'
  AND coalesce(o.status, '') NOT IN ('cancelled', 'refunded', 'partially_refunded', 'return_requested', 'returned');

-- =====================================================================
-- STEP 2 — BACKFILL (idempotent, safe to re-run)
-- =====================================================================
DO $$
DECLARE
  v_order record;
  v_result jsonb;
  v_awarded integer := 0;
  v_skipped integer := 0;
BEGIN
  FOR v_order IN
    SELECT o.id
      FROM public.orders o
      LEFT JOIN public.loyalty_points_ledger l
        ON l.order_id = o.id AND l.event_type = 'purchase'
     WHERE o.user_id IS NOT NULL
       AND coalesce(o.payment_status, '') = 'paid'
       AND coalesce(o.status, '') NOT IN ('cancelled', 'refunded', 'partially_refunded', 'return_requested', 'returned')
       AND l.id IS NULL
     ORDER BY o.created_at ASC
  LOOP
    v_result := public.cosmoskin_award_loyalty_for_order(v_order.id);
    IF coalesce((v_result->>'awarded')::boolean, false) THEN
      v_awarded := v_awarded + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'COSMOSKIN Batch 4 backfill complete: % awarded, % skipped (zero-basis/guest/duplicate)', v_awarded, v_skipped;
END $$;

-- =====================================================================
-- STEP 3 — AFTER REPORT (compare against STEP 1)
-- =====================================================================
SELECT
  count(*) FILTER (WHERE l.id IS NULL) AS orders_missing_purchase_ledger_row,
  count(*) FILTER (WHERE l.id IS NOT NULL) AS orders_with_purchase_ledger_row,
  count(*) AS eligible_paid_orders_total
FROM public.orders o
LEFT JOIN public.loyalty_points_ledger l
  ON l.order_id = o.id AND l.event_type = 'purchase'
WHERE o.user_id IS NOT NULL
  AND coalesce(o.payment_status, '') = 'paid'
  AND coalesce(o.status, '') NOT IN ('cancelled', 'refunded', 'partially_refunded', 'return_requested', 'returned');

-- Optional detail: list of ledger rows created by this run (pending status,
-- source = 'order_payment', created within the last hour). Useful for a
-- quick spot-check right after running STEP 2.
SELECT id, user_id, order_id, points_delta, status, points_basis_amount, created_at
FROM public.loyalty_points_ledger
WHERE event_type = 'purchase'
  AND source = 'order_payment'
  AND created_at >= now() - interval '1 hour'
ORDER BY created_at DESC;

-- =====================================================================
-- STEP 4 — OPTIONAL DUE PROMOTION (run only if you want backfilled points to
-- be immediately usable rather than waiting for the standard delivered_at +
-- 14 days / completed rule). Idempotent; safe to re-run.
-- =====================================================================
-- SELECT public.cosmoskin_promote_due_loyalty_points(5000);
