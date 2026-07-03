-- COSMOSKIN Batch 4 — Club Loyalty Ledger Completion (Step 1: SQL only)
-- Additive, idempotent. No DROP TABLE, no destructive rewrite, no automatic backfill.
--
-- Single source of truth: public.loyalty_points_ledger (no new ledger table created).
-- Canonical tiers: Essential / Signature / Elite only (thresholds read from
-- public.membership_levels — no hardcoded 5,000 threshold, no Select/Silver/Essantial).
--
-- New RPCs (all SECURITY DEFINER, service_role only — matches process_iyzico_payment_success
-- convention in 20260616_payment_bank_and_callback_hardening.sql):
--   cosmoskin_order_points_basis(order_id)         -> product-net amount, ex-shipping
--   cosmoskin_award_loyalty_for_order(order_id)    -> idempotent purchase earn (status=pending)
--   cosmoskin_promote_loyalty_for_order(order_id)  -> idempotent pending -> available (single order)
--   cosmoskin_promote_due_loyalty_points(limit)    -> batch sweep, delivered_at + 14 days
--   cosmoskin_reverse_loyalty_for_order(order_id, reason, ratio, source)
--                                                    -> idempotent full/partial reversal
--   cosmoskin_loyalty_balance_for_user(user_id)    -> available/pending/reversed aggregate
--
-- Replaced (CREATE OR REPLACE only, no old migration file touched):
--   recalculate_customer_membership(user_id) -> now sums product-net spend (ex-shipping)
--                                                via cosmoskin_order_points_basis(), and reads
--                                                Signature/Elite thresholds from membership_levels
--                                                instead of hardcoded literals.
--
-- Not modified in this step: process_iyzico_payment_success, iyzico refund logic, checkout,
-- admin refunds, Batch 3 customer cancel endpoint/logic, order_status_events.
-- JS wiring (where these RPCs get called from card/bank-transfer/admin payment paths, and from
-- summary/membership/points/redeem APIs) is Step 2 — documented at the bottom of this file and
-- in COSMOSKIN_BATCH_4_LOYALTY_LEDGER_SUPABASE_NOTES_20260704.md, not implemented here.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Compatibility guard: ensure loyalty_points_ledger has every column this
--    batch relies on, regardless of which prior migration/hotfix created it.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.loyalty_points_ledger') IS NULL THEN
    CREATE TABLE public.loyalty_points_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      email text,
      event_type text NOT NULL DEFAULT 'manual_adjustment',
      points_delta integer NOT NULL DEFAULT 0,
      balance_after integer,
      order_id uuid,
      review_id uuid,
      routine_result_id uuid,
      coupon_id uuid,
      expires_at timestamptz,
      reversal_of uuid,
      source text NOT NULL DEFAULT 'system',
      status text NOT NULL DEFAULT 'available',
      transaction_reference text,
      available_at timestamptz,
      points_basis_amount numeric(12,2),
      reason text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS reversal_of uuid;
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system';
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available';
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS transaction_reference text;
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS available_at timestamptz;
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS points_basis_amount numeric(12,2);
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.loyalty_points_ledger ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_points_ledger_transaction_reference_uidx
  ON public.loyalty_points_ledger (transaction_reference)
  WHERE transaction_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS loyalty_points_ledger_status_idx
  ON public.loyalty_points_ledger (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS loyalty_points_ledger_order_event_idx
  ON public.loyalty_points_ledger (order_id, event_type, status);

-- Compatibility guard: cache columns on customer_membership_status referenced by
-- the updated recalc function below (added in 20260703_account_experience_final_polish.sql;
-- re-asserted here defensively so this migration does not depend on that file's order).
ALTER TABLE IF EXISTS public.customer_membership_status ADD COLUMN IF NOT EXISTS loyalty_spend_ex_shipping numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.customer_membership_status ADD COLUMN IF NOT EXISTS available_points integer DEFAULT 0;
ALTER TABLE IF EXISTS public.customer_membership_status ADD COLUMN IF NOT EXISTS pending_points integer DEFAULT 0;
ALTER TABLE IF EXISTS public.customer_membership_status ADD COLUMN IF NOT EXISTS reversed_points integer DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 1) Product-net points basis for an order: ex-shipping, ex-discount-inflation.
--    Prefer sum(order_items.line_total); fall back to orders.subtotal_amount
--    only when no order_items rows exist. Never derives from shipping_amount
--    or total_amount.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cosmoskin_order_points_basis(p_order_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items_total numeric(12,2) := 0;
  v_subtotal numeric(12,2) := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT coalesce(sum(line_total), 0) INTO v_items_total
    FROM public.order_items
   WHERE order_id = p_order_id;

  IF v_items_total > 0 THEN
    RETURN v_items_total;
  END IF;

  SELECT coalesce(subtotal_amount, 0) INTO v_subtotal
    FROM public.orders
   WHERE id = p_order_id;

  RETURN greatest(0, v_subtotal);
END;
$$;

REVOKE ALL ON FUNCTION public.cosmoskin_order_points_basis(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cosmoskin_order_points_basis(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Idempotent purchase earn writer. Creates a single 'pending' ledger row
--    per order the first time it is called for a paid, non-terminal order.
--    Guest orders (no user_id) are intentionally skipped in v1 — there is no
--    authenticated account balance to attach earned points to.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cosmoskin_award_loyalty_for_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_basis numeric(12,2);
  v_points integer;
  v_existing_id uuid;
  v_ref text;
  v_row public.loyalty_points_ledger;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'order_id gerekli.', ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('loyalty:award:' || p_order_id::text, 0));

  SELECT id, user_id, customer_email, status, payment_status
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'awarded', false, 'reason', 'order_not_found');
  END IF;

  IF v_order.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'guest_order_skipped');
  END IF;

  IF coalesce(v_order.payment_status, '') <> 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'not_paid');
  END IF;

  IF coalesce(v_order.status, '') IN ('cancelled', 'refunded', 'partially_refunded', 'return_requested', 'returned') THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'order_terminal_state');
  END IF;

  SELECT id INTO v_existing_id
    FROM public.loyalty_points_ledger
   WHERE order_id = p_order_id
     AND event_type = 'purchase'
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'already_awarded', 'ledger_id', v_existing_id);
  END IF;

  v_basis := public.cosmoskin_order_points_basis(p_order_id);
  v_points := greatest(0, round(v_basis));

  IF v_points <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'zero_basis');
  END IF;

  v_ref := 'purchase:earn:' || p_order_id::text;

  INSERT INTO public.loyalty_points_ledger (
    user_id, email, event_type, points_delta, order_id, status,
    source, reason, points_basis_amount, transaction_reference, metadata
  ) VALUES (
    v_order.user_id, lower(coalesce(v_order.customer_email, '')), 'purchase', v_points, p_order_id, 'pending',
    'order_payment', 'Sipariş ödemesi onaylandı; puan teslimattan sonra kullanılabilir olur.', v_basis, v_ref,
    jsonb_build_object('awarded_at', now())
  )
  ON CONFLICT (transaction_reference) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'awarded', false, 'reason', 'already_awarded_race');
  END IF;

  RETURN jsonb_build_object('ok', true, 'awarded', true, 'ledger_id', v_row.id, 'points', v_points, 'basis', v_basis, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.cosmoskin_award_loyalty_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cosmoskin_award_loyalty_for_order(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Promote a single order's pending purchase points to available.
--    Idempotent: no-op if nothing pending for that order.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cosmoskin_promote_loyalty_for_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_promoted integer := 0;
  v_points_net integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'order_id gerekli.', ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('loyalty:promote:' || p_order_id::text, 0));

  WITH updated AS (
    UPDATE public.loyalty_points_ledger
       SET status = 'available',
           available_at = now(),
           updated_at = now()
     WHERE order_id = p_order_id
       AND event_type IN ('purchase', 'purchase_partial_reversal')
       AND status = 'pending'
    RETURNING points_delta
  )
  SELECT count(*), coalesce(sum(points_delta), 0) INTO v_rows_promoted, v_points_net FROM updated;

  IF v_rows_promoted = 0 THEN
    RETURN jsonb_build_object('ok', true, 'promoted', false, 'reason', 'no_pending_row');
  END IF;

  RETURN jsonb_build_object('ok', true, 'promoted', true, 'rows_promoted', v_rows_promoted, 'points_net', v_points_net);
END;
$$;

REVOKE ALL ON FUNCTION public.cosmoskin_promote_loyalty_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cosmoskin_promote_loyalty_for_order(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Batch sweep: promote pending purchase points once delivered_at + 14 days
--    has elapsed. This project has no existing delivered_at+14d cron; this
--    function is the safe due-promotion primitive. Step 2/3 will expose it via
--    a documented HTTP cron endpoint (mirroring functions/api/cron/birthday-benefits.js)
--    or an admin-triggered call — not wired in this SQL-only step.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cosmoskin_promote_due_loyalty_points(p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH due AS (
    SELECT l.id
      FROM public.loyalty_points_ledger l
      JOIN public.orders o ON o.id = l.order_id
     WHERE l.event_type IN ('purchase', 'purchase_partial_reversal')
       AND l.status = 'pending'
       AND coalesce(o.status, '') NOT IN ('cancelled', 'refunded', 'partially_refunded', 'return_requested', 'returned')
       AND (
         o.status = 'completed'
         OR (o.delivered_at IS NOT NULL AND now() >= o.delivered_at + interval '14 days')
       )
     ORDER BY l.created_at ASC
     LIMIT greatest(1, least(coalesce(p_limit, 500), 2000))
  )
  UPDATE public.loyalty_points_ledger l
     SET status = 'available',
         available_at = now(),
         updated_at = now()
    FROM due
   WHERE l.id = due.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'promoted_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.cosmoskin_promote_due_loyalty_points(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cosmoskin_promote_due_loyalty_points(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Idempotent reversal (full or proportional). Triggered only when an order
--    is actually cancelled/refunded/returned by admin or system — never for a
--    paid cancel *request* (Batch 3) and never for an unpaid direct cancel
--    (which never earned in the first place).
--
--    Full reversal (p_ratio = 1.0): flips the original earn row's status to
--    'reversed'. It stops counting as pending/available; its full magnitude
--    now reports under "reversed". No separate negative row — avoids double
--    counting by construction.
--
--    Partial reversal (0 < p_ratio < 1): the original earn row is left
--    untouched (still the accurate audit record) and a separate negative
--    offsetting row is inserted in the SAME lifecycle bucket (pending/
--    available) as the original, so balances net correctly. Only one partial
--    reversal per order is supported in v1 (enforced by a unique
--    transaction_reference) — a second refund event on the same order after a
--    partial reversal already exists is intentionally rejected/no-op rather
--    than guessed; document as a v1 limitation requiring manual admin review.
--
--    Unknown/ambiguous refund ratio (p_ratio NULL or <= 0): no automatic
--    points change. The earn row is flagged requires_manual_loyalty_review in
--    metadata so an operator can resolve it manually.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cosmoskin_reverse_loyalty_for_order(
  p_order_id uuid,
  p_reason text DEFAULT NULL,
  p_ratio numeric DEFAULT NULL,
  p_source text DEFAULT 'system'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_earn public.loyalty_points_ledger;
  v_ratio numeric;
  v_reverse_points integer;
  v_ref text;
  v_reversal_row public.loyalty_points_ledger;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'order_id gerekli.', ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('loyalty:reverse:' || p_order_id::text, 0));

  SELECT * INTO v_earn
    FROM public.loyalty_points_ledger
   WHERE order_id = p_order_id
     AND event_type = 'purchase'
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_earn.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'reversed', false, 'reason', 'no_earn_row');
  END IF;

  IF v_earn.status = 'reversed' THEN
    RETURN jsonb_build_object('ok', true, 'reversed', false, 'reason', 'already_reversed', 'ledger_id', v_earn.id);
  END IF;

  IF p_ratio IS NULL OR p_ratio <= 0 THEN
    UPDATE public.loyalty_points_ledger
       SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'requires_manual_loyalty_review', true,
             'manual_review_reason', coalesce(p_reason, 'refund_ratio_unknown'),
             'manual_review_flagged_at', now(),
             'manual_review_source', p_source
           ),
           updated_at = now()
     WHERE id = v_earn.id;

    RETURN jsonb_build_object('ok', true, 'reversed', false, 'reason', 'manual_review_required', 'ledger_id', v_earn.id);
  END IF;

  v_ratio := least(1.0, greatest(0.0, p_ratio));

  IF v_ratio >= 0.999 THEN
    UPDATE public.loyalty_points_ledger
       SET status = 'reversed',
           reason = coalesce(p_reason, reason, 'order_cancelled_or_refunded'),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'reversed_at', now(),
             'reversed_ratio', 1,
             'reversed_source', p_source
           ),
           updated_at = now()
     WHERE id = v_earn.id
    RETURNING * INTO v_earn;

    RETURN jsonb_build_object('ok', true, 'reversed', true, 'mode', 'full', 'ledger_id', v_earn.id, 'points', v_earn.points_delta);
  END IF;

  IF coalesce((v_earn.metadata->>'partial_reversal_applied')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'reversed', false, 'reason', 'partial_reversal_already_recorded_manual_review', 'ledger_id', v_earn.id);
  END IF;

  v_reverse_points := round(abs(v_earn.points_delta) * v_ratio);
  IF v_reverse_points <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'reversed', false, 'reason', 'zero_reversal_amount');
  END IF;

  v_ref := 'purchase:reverse:' || p_order_id::text;

  INSERT INTO public.loyalty_points_ledger (
    user_id, email, event_type, points_delta, order_id, status,
    source, reason, reversal_of, transaction_reference, metadata
  ) VALUES (
    v_earn.user_id, v_earn.email, 'purchase_partial_reversal', -v_reverse_points, p_order_id, v_earn.status,
    p_source, coalesce(p_reason, 'partial_refund'), v_earn.id, v_ref,
    jsonb_build_object('ratio', v_ratio, 'reversed_at', now())
  )
  ON CONFLICT (transaction_reference) DO NOTHING
  RETURNING * INTO v_reversal_row;

  IF v_reversal_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'reversed', false, 'reason', 'partial_reversal_already_recorded_race');
  END IF;

  UPDATE public.loyalty_points_ledger
     SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('partial_reversal_applied', true, 'partial_reversal_ratio', v_ratio),
         updated_at = now()
   WHERE id = v_earn.id;

  RETURN jsonb_build_object('ok', true, 'reversed', true, 'mode', 'partial', 'ledger_id', v_reversal_row.id, 'points', -v_reverse_points, 'ratio', v_ratio);
END;
$$;

REVOKE ALL ON FUNCTION public.cosmoskin_reverse_loyalty_for_order(uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cosmoskin_reverse_loyalty_for_order(uuid, text, numeric, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Ledger-backed balance aggregate for a user. Single place both the recalc
--    function below and the Step 2 account APIs should read from, so
--    available/pending/reversed can never be computed two different ways.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cosmoskin_loyalty_balance_for_user(p_user_id uuid)
RETURNS TABLE(available_points integer, pending_points integer, reversed_points integer)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    coalesce(sum(points_delta) FILTER (WHERE status = 'available'), 0)::integer AS available_points,
    coalesce(sum(points_delta) FILTER (WHERE status = 'pending'), 0)::integer AS pending_points,
    coalesce(sum(abs(points_delta)) FILTER (WHERE status = 'reversed'), 0)::integer AS reversed_points
  FROM public.loyalty_points_ledger
  WHERE user_id = p_user_id
    AND (expires_at IS NULL OR expires_at > now());
$$;

REVOKE ALL ON FUNCTION public.cosmoskin_loyalty_balance_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cosmoskin_loyalty_balance_for_user(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Canonical tier recalculation. Essential / Signature / Elite only.
--    Spend basis = product net ex-shipping via cosmoskin_order_points_basis().
--    Thresholds are read from membership_levels (no hardcoded 5,000 anywhere),
--    falling back to 6,000/3 (signature) and 15,000/8 (elite) only if that
--    table/row is unexpectedly missing.
--    Same function signature/name as before (CREATE OR REPLACE) — no old
--    migration file touched, callers (functions/api/account/membership.js,
--    functions/api/loyalty/recalculate-user.js, cron/recalculate-memberships.js)
--    are unaffected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_customer_membership(p_user_id uuid)
RETURNS public.customer_membership_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  spend numeric(12,2) := 0;
  order_count integer := 0;
  new_level text := 'essential';
  next_level text;
  amount_needed numeric(12,2) := 0;
  orders_needed integer := 0;
  old_level text;
  result public.customer_membership_status;
  v_order record;
  v_signature_spend numeric(12,2);
  v_signature_orders integer;
  v_elite_spend numeric(12,2);
  v_elite_orders integer;
  v_available integer := 0;
  v_pending integer := 0;
  v_reversed integer := 0;
BEGIN
  SELECT spend_threshold_12m, order_threshold_12m INTO v_signature_spend, v_signature_orders
    FROM public.membership_levels WHERE code = 'signature';
  SELECT spend_threshold_12m, order_threshold_12m INTO v_elite_spend, v_elite_orders
    FROM public.membership_levels WHERE code = 'elite';

  v_signature_spend := coalesce(v_signature_spend, 6000);
  v_signature_orders := coalesce(v_signature_orders, 3);
  v_elite_spend := coalesce(v_elite_spend, 15000);
  v_elite_orders := coalesce(v_elite_orders, 8);

  FOR v_order IN
    SELECT o.id
      FROM public.orders o
     WHERE o.user_id = p_user_id
       AND o.created_at >= now() - interval '12 months'
       AND coalesce(o.payment_status, '') = 'paid'
       AND coalesce(o.status, '') NOT IN ('cancelled', 'refunded', 'partially_refunded', 'return_requested', 'returned')
  LOOP
    spend := spend + public.cosmoskin_order_points_basis(v_order.id);
    order_count := order_count + 1;
  END LOOP;

  IF spend >= v_elite_spend OR order_count >= v_elite_orders THEN
    new_level := 'elite';
    next_level := NULL;
    amount_needed := 0;
    orders_needed := 0;
  ELSIF spend >= v_signature_spend OR order_count >= v_signature_orders THEN
    new_level := 'signature';
    next_level := 'elite';
    amount_needed := greatest(0, v_elite_spend - spend);
    orders_needed := greatest(0, v_elite_orders - order_count);
  ELSE
    new_level := 'essential';
    next_level := 'signature';
    amount_needed := greatest(0, v_signature_spend - spend);
    orders_needed := greatest(0, v_signature_orders - order_count);
  END IF;

  SELECT b.available_points, b.pending_points, b.reversed_points
    INTO v_available, v_pending, v_reversed
    FROM public.cosmoskin_loyalty_balance_for_user(p_user_id) b;

  SELECT level_code INTO old_level FROM public.customer_membership_status WHERE user_id = p_user_id;

  INSERT INTO public.customer_membership_status (
    user_id, level_code, rolling_spend_12m, completed_orders_12m, points_balance,
    next_level_code, amount_to_next_level, orders_to_next_level, calculated_at,
    loyalty_spend_ex_shipping, available_points, pending_points, reversed_points
  )
  VALUES (
    p_user_id, new_level, spend, order_count, v_available,
    next_level, amount_needed, orders_needed, now(),
    spend, v_available, v_pending, v_reversed
  )
  ON CONFLICT (user_id) DO UPDATE SET
    level_code = excluded.level_code,
    rolling_spend_12m = excluded.rolling_spend_12m,
    completed_orders_12m = excluded.completed_orders_12m,
    points_balance = excluded.points_balance,
    next_level_code = excluded.next_level_code,
    amount_to_next_level = excluded.amount_to_next_level,
    orders_to_next_level = excluded.orders_to_next_level,
    calculated_at = now(),
    loyalty_spend_ex_shipping = excluded.loyalty_spend_ex_shipping,
    available_points = excluded.available_points,
    pending_points = excluded.pending_points,
    reversed_points = excluded.reversed_points,
    updated_at = now()
  RETURNING * INTO result;

  IF old_level IS NOT NULL AND old_level <> new_level THEN
    INSERT INTO public.customer_membership_history (user_id, old_level, new_level, reason, metadata)
    VALUES (p_user_id, old_level, new_level, 'rolling_12m_recalculation', jsonb_build_object('rolling_spend_12m_ex_shipping', spend, 'completed_orders_12m', order_count));
  END IF;

  RETURN result;
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Step 2 wiring plan (NOT implemented in this SQL-only step — documented here
-- for continuity; see COSMOSKIN_BATCH_4_LOYALTY_LEDGER_SUPABASE_NOTES_20260704.md):
--
--   Purchase earn writer call sites (functions/api/_lib/loyalty-ledger.js
--   wrapping rpc(context, 'cosmoskin_award_loyalty_for_order', { p_order_id })):
--     1. Card/iyzico paid orders — functions/api/iyzico-callback.js, inside the
--        existing finalizeCommerceAfterPayment() helper (a minimal post-success
--        hook at the point payment is already finalized; process_iyzico_payment_success
--        itself is left untouched).
--     2. Bank transfer manually marked paid — functions/api/admin/orders.js,
--        existing `body.action === 'mark_payment_paid' || paymentStatus === 'paid'` branch.
--     3. Admin payment confirmation — same branch as #2 (shared code path).
--
--   Promotion call sites (cosmoskin_promote_loyalty_for_order):
--     - functions/api/admin/orders.js when fulfillment/status moves to 'delivered'
--       (or a future 'completed' marker).
--   Due-sweep (cosmoskin_promote_due_loyalty_points): new cron endpoint,
--     mirroring functions/api/cron/birthday-benefits.js pattern.
--
--   Reversal call sites (cosmoskin_reverse_loyalty_for_order):
--     - functions/api/admin/orders.js / admin/orders/[id]/status.js when an
--       order actually transitions to cancelled/refunded/partially_refunded
--       (not on Batch 3 customer cancel-request, and not on unpaid direct
--       cancel, which never earned).
--     - functions/api/admin/refunds.js when a manual refund_records row is
--       marked status = 'completed' (ratio derived from refund amount vs.
--       order product-net basis when available; NULL ratio -> manual_review).
-- ---------------------------------------------------------------------------
