-- COSMOSKIN H0 — emergency live DB payment/RPC compatibility hotfix.
-- Source of truth: COSMOSKIN_H0_EMERGENCY_PAYMENT_RPC_HOTFIX_PLAN_20260704.md
--
-- Confirmed live (read-only Supabase inspection before writing this file):
--   1. public.process_iyzico_payment_success        -- MISSING live
--   2. public.process_iyzico_payment_failure         -- MISSING live
--   3. public.release_expired_inventory_reservations -- MISSING live
--   (root cause: supabase/migrations/20260616_payment_bank_and_callback_hardening.sql
--    never fully executed against production — payment_bank_accounts, an earlier
--    statement in that same file, exists live; is_valid_tr_iban and every function
--    below it in that file do not. This is a genuinely new definition, not a
--    restore of something that was later dropped.)
--
-- Two vocabulary/constraint traps confirmed live and deliberately NOT repeated here:
--   - The original 2026-06-16 function bodies check inventory_reservations.status
--     = 'active'. Live reserve/release/convert_order_inventory (redefined by
--     20260629_cosmoskin_checkout_bank_transfer_final_fix.sql) create and match
--     status = 'reserved'. This file uses 'reserved' throughout — using 'active'
--     here would deploy cleanly but silently never find a reservation.
--   - order_status_events.status/event_type CHECK constraints (live) do NOT allow
--     'reservation_expired'. Rather than widen that constraint, this file reuses
--     'stock_released' (already allowed for both columns) for the reservation-expiry
--     audit trail and puts the specific reason in metadata/note. No CHECK constraint
--     on order_status_events is touched by this migration.
--
-- The only CHECK constraint actually widened is orders_fulfillment_status_final_chk,
-- because functions/api/iyzico-callback.js (unmodified, existing code) is the only
-- place in the codebase that writes fulfillment_status = 'review_required'
-- (line ~352), and that value is not in the live constraint's allowed list.
--
-- Safety: additive only. No DROP TABLE. No data mutation outside function bodies
-- (UPDATE/INSERT statements below only execute later, when the RPCs are called by
-- the application). CREATE OR REPLACE FUNCTION is idempotent to re-run. Every
-- ALTER TABLE constraint change is guarded by DROP CONSTRAINT IF EXISTS first, so
-- this file is safe to run once on production and safe to re-run if it is ever
-- re-applied to an environment where it (or part of it) already ran.
--
-- Not touched by this migration: checkout UI, iyzico refund API, customer
-- cancellation behavior (Batch 3), returns, admin RBAC, storage policies,
-- Batch 4 loyalty tables/RPCs/constraints, coupons/checkout logic beyond the one
-- coupon_redemptions release documented in §4 below.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) orders.fulfillment_status — add the exact missing value only.
--    Existing allowed values are preserved verbatim; 'review_required' is the
--    only addition. Fully validated (not NOT VALID) because the new list is a
--    strict superset of the current one, so every existing row already passes.
-- -----------------------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_final_chk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_status_final_chk
  CHECK (fulfillment_status IN (
    'not_started', 'unfulfilled', 'preparing', 'packed',
    'shipped', 'delivered', 'returned', 'cancelled',
    'review_required'
  ));

-- No other CHECK constraint is modified by this migration. orders_status_final_chk,
-- orders_payment_status_final_chk, orders_payment_method_final_chk,
-- payments_provider_final_chk, payments_status_final_chk, and both
-- order_status_events_*_final_check constraints already allow every value the
-- functions below write (verified live before writing this file).

-- -----------------------------------------------------------------------------
-- 2) process_iyzico_payment_success
--    Signature matches functions/api/iyzico-callback.js line ~331:
--      rpc(context, 'process_iyzico_payment_success', {
--        p_order_id, p_provider_payment_id, p_token, p_metadata
--      })
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_iyzico_payment_success(
  p_order_id uuid,
  p_provider_payment_id text,
  p_token text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_payment_status text;
  v_conversion jsonb;
  v_converted_count integer := 0;
  v_reserved_count integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'order_id gerekli.', ERRCODE = '22023';
  END IF;

  -- Concurrency guard: serialize concurrent/duplicate callbacks for this order.
  PERFORM pg_advisory_xact_lock(hashtextextended('iyzico:' || p_order_id::text, 0));

  -- Idempotency guard: a previously processed success for this order/payment
  -- id/token makes this call a safe no-op instead of converting inventory or
  -- writing payment_events a second time.
  IF EXISTS (
    SELECT 1
      FROM public.payment_events e
     WHERE e.provider = 'iyzico'
       AND e.event_type = 'payment_success'
       AND e.status = 'processed'
       AND (
         e.order_id = p_order_id
         OR (nullif(trim(p_provider_payment_id), '') IS NOT NULL AND e.provider_payment_id = nullif(trim(p_provider_payment_id), ''))
         OR (nullif(trim(p_token), '') IS NOT NULL AND e.raw_reference = nullif(trim(p_token), ''))
       )
  ) THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false, 'idempotent', true, 'reason', 'already_processed');
  END IF;

  -- Convert exactly once: current live vocabulary is 'reserved' -> 'converted'
  -- (see public.convert_order_inventory / public.release_order_inventory,
  -- redefined by 20260629_cosmoskin_checkout_bank_transfer_final_fix.sql).
  -- 'active' is intentionally NOT used here — it is a legacy value that current
  -- reservation-writing code (reserve_order_inventory) never creates.
  SELECT count(*) INTO v_reserved_count
    FROM public.inventory_reservations
   WHERE order_id = p_order_id AND status = 'reserved';

  IF v_reserved_count > 0 THEN
    v_conversion := public.convert_order_inventory(p_order_id);
  ELSE
    SELECT count(*) INTO v_converted_count
      FROM public.inventory_reservations
     WHERE order_id = p_order_id AND status = 'converted';
    IF v_converted_count = 0 THEN
      RAISE EXCEPTION USING MESSAGE = 'Ödeme için rezerve edilmiş veya dönüştürülmüş stok rezervasyonu bulunamadı.', ERRCODE = 'P0001';
    END IF;
    -- Already converted by an earlier successful call for this order — treat as
    -- an idempotent replay rather than an error.
    v_conversion := jsonb_build_object(
      'ok', true, 'converted', 0, 'deducted', 0,
      'idempotent', true, 'previously_converted', v_converted_count
    );
  END IF;

  -- payments/orders finalization stays with the existing caller
  -- (functions/api/iyzico-callback.js, unmodified) exactly as it does today —
  -- this RPC owns inventory conversion + payment_events audit only, so it
  -- cannot itself get out of sync with the order/payment rows the caller writes
  -- immediately after this call returns.
  INSERT INTO public.payment_events (
    order_id, provider, provider_payment_id, event_type, status,
    raw_reference, processed_at, metadata
  ) VALUES (
    p_order_id, 'iyzico', nullif(trim(p_provider_payment_id), ''),
    'payment_success', 'processed', nullif(trim(p_token), ''), now(),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('inventory_conversion', v_conversion)
  );

  -- coupon_redemptions confirmation on success ("status = 'used'") is already
  -- performed unconditionally by functions/api/iyzico-callback.js's
  -- finalizeCommerceAfterPayment() immediately after this RPC returns (existing,
  -- unmodified code). Duplicating that write here would race/duplicate it, so
  -- it is deliberately left to the existing caller.

  -- Batch 4 loyalty award integration point: intentionally NOT called from
  -- inside this RPC. At the moment this function runs, the caller has not yet
  -- updated orders.payment_status to 'paid' (that update happens immediately
  -- after this RPC returns, in functions/api/iyzico-callback.js). Since
  -- public.cosmoskin_award_loyalty_for_order() requires payment_status = 'paid'
  -- before it will award anything, calling it here would always no-op. The
  -- correct, already-existing integration point is the unmodified
  -- finalizeCommerceAfterPayment() -> awardOrderPoints() call, which runs after
  -- the order is marked paid. cosmoskin_award_loyalty_for_order is itself fully
  -- idempotent (unique transaction_reference, ON CONFLICT DO NOTHING), so no
  -- coordination between this migration and Batch 4's migration file is
  -- required in either run order.

  RETURN jsonb_build_object('ok', true, 'claimed', true, 'idempotent', false, 'conversion', v_conversion);
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) process_iyzico_payment_failure
--    Signature matches functions/api/iyzico-callback.js line ~381 (identical
--    call shape to process_iyzico_payment_success). Also missing live.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_iyzico_payment_failure(
  p_order_id uuid,
  p_provider_payment_id text,
  p_token text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_payment_status text;
  v_release jsonb;
  v_coupons_released integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'order_id gerekli.', ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('iyzico:' || p_order_id::text, 0));

  -- Defensive guard beyond the payment_events dedup below: never let a late or
  -- duplicate failure callback touch an order that has already been finalized
  -- as paid/refunded by a success callback (protects against out-of-order
  -- webhook delivery). This does not change how the JS caller itself sets
  -- orders.status/payment_status (unmodified) — it only protects this RPC's
  -- own side effects (inventory release, coupon release, payment_events).
  SELECT payment_status INTO v_order_payment_status
    FROM public.orders
   WHERE id = p_order_id;

  IF v_order_payment_status IN ('paid', 'refunded', 'partially_refunded') THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false, 'idempotent', true, 'reason', 'order_already_finalized_paid');
  END IF;

  -- Idempotency guard: a previously processed failure for this order/token
  -- makes this call a safe no-op.
  IF EXISTS (
    SELECT 1
      FROM public.payment_events e
     WHERE e.provider = 'iyzico'
       AND e.event_type = 'payment_failed'
       AND e.status = 'processed'
       AND (
         e.order_id = p_order_id
         OR (nullif(trim(p_token), '') IS NOT NULL AND e.raw_reference = nullif(trim(p_token), ''))
       )
  ) THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false, 'idempotent', true, 'reason', 'already_processed');
  END IF;

  -- Release any reserved inventory for this order. release_order_inventory
  -- already operates on the current live vocabulary (status = 'reserved') —
  -- confirmed by reading its live definition before writing this file — so no
  -- vocabulary fix is needed here; this call was always correct, only the
  -- function that wraps it was missing.
  v_release := public.release_order_inventory(p_order_id, 'payment_failed');

  -- Close the coupon-release gap confirmed for this exact path: unlike
  -- functions/api/create-checkout.js (which already releases coupon_redemptions
  -- to status = 'released' when payment initialization fails synchronously),
  -- functions/api/iyzico-callback.js's failure branch has no equivalent
  -- release for a coupon reserved at checkout (status = 'reserved') that is
  -- only declined later at the card issuer. Same status value ('released'),
  -- same table, same semantics as the existing Batch 3 / create-checkout.js
  -- convention — no new coupon status is introduced. Idempotent: only rows
  -- still in 'reserved' state are touched, so re-running this on an
  -- already-released or already-used redemption is a no-op.
  WITH released AS (
    UPDATE public.coupon_redemptions
       SET status = 'released',
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('source', 'iyzico_payment_failed', 'released_at', now())
     WHERE order_id = p_order_id
       AND status = 'reserved'
     RETURNING id
  )
  SELECT count(*) INTO v_coupons_released FROM released;

  INSERT INTO public.payment_events (
    order_id, provider, provider_payment_id, event_type, status,
    raw_reference, processed_at, metadata
  ) VALUES (
    p_order_id, 'iyzico', nullif(trim(p_provider_payment_id), ''),
    'payment_failed', 'processed', nullif(trim(p_token), ''), now(),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('inventory_release', v_release, 'coupons_released', v_coupons_released)
  );

  RETURN jsonb_build_object('ok', true, 'claimed', true, 'idempotent', false, 'release', v_release, 'coupons_released', v_coupons_released);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4) release_expired_inventory_reservations
--    Signature matches functions/api/cron/release-expired-inventory.js:
--      rpc(context, 'release_expired_inventory_reservations', { p_limit })
--    Returned shape ({ ok, orders_processed, paid_orders_skipped }) is
--    documented here; the calling code does not destructure specific fields
--    (it forwards the whole result as-is), so any jsonb object is compatible.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_expired_inventory_reservations(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_release jsonb;
  v_orders integer := 0;
  v_skipped_paid integer := 0;
BEGIN
  FOR v_order IN
    SELECT r.order_id, min(r.expires_at) AS expires_at
      FROM public.inventory_reservations r
      JOIN public.orders o ON o.id = r.order_id
     WHERE r.status = 'reserved'                 -- current live vocabulary; never 'active'
       AND r.expires_at <= now()
       AND r.order_id IS NOT NULL
       AND coalesce(o.payment_status, 'pending') NOT IN ('paid', 'refunded', 'partially_refunded')
       AND o.status IN ('pending', 'pending_payment', 'pending_bank_transfer', 'payment_failed', 'cancelled')
     GROUP BY r.order_id
     ORDER BY min(r.expires_at), r.order_id
     LIMIT greatest(1, least(coalesce(p_limit, 100), 1000))
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('expiry:' || v_order.order_id::text, 0));

    -- Re-check inside the lock: never release/cancel an order a concurrent
    -- payment callback has since marked paid/refunded.
    IF EXISTS (
      SELECT 1 FROM public.orders
       WHERE id = v_order.order_id
         AND payment_status IN ('paid', 'refunded', 'partially_refunded')
    ) THEN
      v_skipped_paid := v_skipped_paid + 1;
      CONTINUE;
    END IF;

    -- release_order_inventory only touches status = 'reserved' rows, so
    -- already-converted (paid) or already-released inventory is never
    -- double-released or removed from a paid order.
    v_release := public.release_order_inventory(v_order.order_id, 'reservation_expired');

    UPDATE public.orders
       SET status = CASE WHEN status IN ('pending_payment', 'pending_bank_transfer') THEN 'cancelled' ELSE status END,
           payment_status = CASE WHEN payment_status IN ('pending', 'initiated', 'awaiting_transfer') THEN 'failed' ELSE payment_status END,
           fulfillment_status = CASE WHEN fulfillment_status IN ('not_started', 'unfulfilled', 'preparing') THEN 'cancelled' ELSE fulfillment_status END,
           cancelled_at = coalesce(cancelled_at, now()),
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'reservation_expired_at', now(),
             'inventory_release', v_release
           )
     WHERE id = v_order.order_id
       AND payment_status NOT IN ('paid', 'refunded', 'partially_refunded');

    UPDATE public.payments
       SET status = 'failed', updated_at = now()
     WHERE order_id = v_order.order_id
       AND status IN ('initiated', 'awaiting_transfer');

    -- Audit trail without widening any order_status_events CHECK constraint:
    -- 'stock_released' is already an allowed value for BOTH status and
    -- event_type (confirmed live before writing this file). The specific
    -- reason ('reservation_expired') is preserved in metadata/note instead of
    -- introducing a new enum value.
    INSERT INTO public.order_status_events (
      order_id, status, event_type, previous_status, new_status,
      source, created_by, message, note, metadata
    ) VALUES (
      v_order.order_id, 'stock_released', 'stock_released', NULL, 'cancelled',
      'system', 'reservation_expiry_job',
      'Ödeme süresi dolduğu için stok rezervasyonu serbest bırakıldı.',
      'reservation_expired — ödenmiş siparişler bu işlemden hariç tutulur.',
      jsonb_build_object('reason', 'reservation_expired', 'expired_at', v_order.expires_at, 'inventory_release', v_release)
    );

    v_orders := v_orders + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'orders_processed', v_orders,
    'paid_orders_skipped', v_skipped_paid
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5) Grants — service_role only, matching every other RPC in this project.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.process_iyzico_payment_success(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_iyzico_payment_failure(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_inventory_reservations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_iyzico_payment_success(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_iyzico_payment_failure(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_inventory_reservations(integer) TO service_role;

COMMIT;
