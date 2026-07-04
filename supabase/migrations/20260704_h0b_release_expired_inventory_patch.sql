-- COSMOSKIN H0b — small corrective patch for release_expired_inventory_reservations only.
--
-- Live verification after H0 (supabase/migrations/20260704_h0_live_payment_rpc_hotfix.sql)
-- showed release_expired_inventory_reservations still running the pre-patch body live
-- (source = 'inventory', eligible orders.status missing 'pending', fulfillment_status
-- cancellation list missing 'unfulfilled'). This file re-applies only the already-reviewed
-- H0 corrections to this one function so it can be run standalone against the live
-- database without touching anything else H0 already fixed.
--
-- Scope: this file CREATE OR REPLACE's exactly one function —
-- public.release_expired_inventory_reservations(integer) — and re-applies its
-- service_role-only grants. Nothing else.
--
-- NOT touched by this file: process_iyzico_payment_success, process_iyzico_payment_failure,
-- any table, any CHECK constraint, any RLS/storage policy, checkout, returns, RBAC,
-- or any other batch's files/objects.
--
-- Preserved from H0 (unchanged in this patch):
--   - r.status = 'reserved' (current live inventory_reservations vocabulary; never 'active')
--   - order_status_events uses 'stock_released' for both status and event_type
--     (already allowed live) — 'reservation_expired' is never written as a status/event_type
--     value, only inside metadata/note, so no order_status_events CHECK constraint is touched.
--   - No destructive SQL. No DROP TABLE. No data mutation outside this function body
--     (the UPDATE/INSERT statements only execute later, when the RPC is called).
--
-- Corrected in this patch (matches the already-approved H0 patch):
--   1. order_status_events.source = 'system' (was 'inventory') — reservation expiry is a
--      system job, not a customer/admin/payment-sourced event.
--   2. Eligible orders.status list includes 'pending' (was missing it).
--   3. fulfillment_status cancellation CASE list includes 'unfulfilled' (was missing it).

BEGIN;

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
    -- event_type (confirmed live). The specific reason ('reservation_expired')
    -- is preserved in metadata/note instead of introducing a new enum value.
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

REVOKE ALL ON FUNCTION public.release_expired_inventory_reservations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_inventory_reservations(integer) TO service_role;

COMMIT;
