-- COSMOSKIN payment bank-account, iyzico callback and reservation-expiry hardening.
-- Apply after 20260616_inventory_reservation_hardening.sql.
-- No production credentials or real IBAN values are included.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.is_valid_tr_iban(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_iban text := upper(regexp_replace(p_value, '[^A-Za-z0-9]', '', 'g'));
  v_rearranged text;
  v_numeric text := '';
  v_char text;
  v_remainder integer := 0;
  v_index integer;
BEGIN
  IF v_iban !~ '^TR[0-9]{24}$' THEN
    RETURN false;
  END IF;
  v_rearranged := substr(v_iban, 5) || substr(v_iban, 1, 4);
  FOR v_index IN 1..length(v_rearranged) LOOP
    v_char := substr(v_rearranged, v_index, 1);
    IF v_char ~ '^[A-Z]$' THEN
      v_numeric := v_numeric || (ascii(v_char) - 55)::text;
    ELSE
      v_numeric := v_numeric || v_char;
    END IF;
  END LOOP;
  FOR v_index IN 1..length(v_numeric) LOOP
    v_remainder := (v_remainder * 10 + substr(v_numeric, v_index, 1)::integer) % 97;
  END LOOP;
  RETURN v_remainder = 1;
END;
$$;

CREATE TABLE IF NOT EXISTS public.payment_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  account_holder text NOT NULL,
  iban text NOT NULL,
  branch text NULL,
  currency text NOT NULL DEFAULT 'TRY',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_bank_accounts ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.payment_bank_accounts ADD COLUMN IF NOT EXISTS account_holder text;
ALTER TABLE public.payment_bank_accounts ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.payment_bank_accounts ADD COLUMN IF NOT EXISTS branch text;
ALTER TABLE public.payment_bank_accounts ADD COLUMN IF NOT EXISTS currency text DEFAULT 'TRY';
ALTER TABLE public.payment_bank_accounts ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.payment_bank_accounts ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.payment_bank_accounts ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.payment_bank_accounts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.payment_bank_accounts
   SET iban = upper(regexp_replace(coalesce(iban, ''), '[^A-Za-z0-9]', '', 'g')),
       currency = upper(coalesce(nullif(trim(currency), ''), 'TRY')),
       updated_at = now()
 WHERE iban IS DISTINCT FROM upper(regexp_replace(coalesce(iban, ''), '[^A-Za-z0-9]', '', 'g'))
    OR currency IS DISTINCT FROM upper(coalesce(nullif(trim(currency), ''), 'TRY'));

ALTER TABLE public.payment_bank_accounts DROP CONSTRAINT IF EXISTS payment_bank_accounts_required_fields_check;
ALTER TABLE public.payment_bank_accounts
  ADD CONSTRAINT payment_bank_accounts_required_fields_check
  CHECK (length(trim(bank_name)) >= 2 AND length(trim(account_holder)) >= 2) NOT VALID;
ALTER TABLE public.payment_bank_accounts DROP CONSTRAINT IF EXISTS payment_bank_accounts_currency_check;
ALTER TABLE public.payment_bank_accounts
  ADD CONSTRAINT payment_bank_accounts_currency_check CHECK (currency = 'TRY') NOT VALID;
ALTER TABLE public.payment_bank_accounts DROP CONSTRAINT IF EXISTS payment_bank_accounts_iban_check;
ALTER TABLE public.payment_bank_accounts
  ADD CONSTRAINT payment_bank_accounts_iban_check CHECK (public.is_valid_tr_iban(iban)) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_bank_accounts_normalized_iban
  ON public.payment_bank_accounts ((upper(regexp_replace(iban, '[^A-Za-z0-9]', '', 'g'))));
CREATE INDEX IF NOT EXISTS idx_payment_bank_accounts_active_order
  ON public.payment_bank_accounts (is_active, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_payment_events_iyzico_order_event
  ON public.payment_events (order_id, event_type, status, created_at DESC)
  WHERE provider = 'iyzico';
CREATE INDEX IF NOT EXISTS idx_payment_events_iyzico_token
  ON public.payment_events (raw_reference, event_type, status)
  WHERE provider = 'iyzico' AND raw_reference IS NOT NULL;

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
  v_conversion jsonb;
  v_converted_count integer := 0;
  v_active_count integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'order_id gerekli.', ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('iyzico:' || p_order_id::text, 0));

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
    RETURN jsonb_build_object('ok', true, 'claimed', false, 'idempotent', true);
  END IF;

  SELECT count(*) INTO v_active_count
    FROM public.inventory_reservations
   WHERE order_id = p_order_id AND status = 'active';

  IF v_active_count > 0 THEN
    v_conversion := public.convert_order_inventory(p_order_id);
  ELSE
    SELECT count(*) INTO v_converted_count
      FROM public.inventory_reservations
     WHERE order_id = p_order_id AND status = 'converted';
    IF v_converted_count = 0 THEN
      RAISE EXCEPTION USING MESSAGE = 'Ödeme için aktif veya dönüştürülmüş stok rezervasyonu bulunamadı.', ERRCODE = 'P0001';
    END IF;
    v_conversion := jsonb_build_object(
      'ok', true,
      'converted', 0,
      'deducted', 0,
      'idempotent', true,
      'previously_converted', v_converted_count
    );
  END IF;

  INSERT INTO public.payment_events (
    order_id, provider, provider_payment_id, event_type, status,
    raw_reference, processed_at, metadata
  ) VALUES (
    p_order_id, 'iyzico', nullif(trim(p_provider_payment_id), ''),
    'payment_success', 'processed', nullif(trim(p_token), ''), now(),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('inventory_conversion', v_conversion)
  );

  RETURN jsonb_build_object('ok', true, 'claimed', true, 'idempotent', false, 'conversion', v_conversion);
END;
$$;

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
  v_release jsonb;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'order_id gerekli.', ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('iyzico:' || p_order_id::text, 0));

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
    RETURN jsonb_build_object('ok', true, 'claimed', false, 'idempotent', true);
  END IF;

  v_release := public.release_order_inventory(p_order_id, 'payment_failed');

  INSERT INTO public.payment_events (
    order_id, provider, provider_payment_id, event_type, status,
    raw_reference, processed_at, metadata
  ) VALUES (
    p_order_id, 'iyzico', nullif(trim(p_provider_payment_id), ''),
    'payment_failed', 'processed', nullif(trim(p_token), ''), now(),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('inventory_release', v_release)
  );

  RETURN jsonb_build_object('ok', true, 'claimed', true, 'idempotent', false, 'release', v_release);
END;
$$;

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
     WHERE r.status = 'active'
       AND r.expires_at <= now()
       AND r.order_id IS NOT NULL
       AND coalesce(o.payment_status, 'pending') NOT IN ('paid','refunded','partially_refunded')
       AND o.status IN ('pending_payment','pending_bank_transfer','payment_failed','cancelled')
     GROUP BY r.order_id
     ORDER BY min(r.expires_at), r.order_id
     LIMIT greatest(1, least(coalesce(p_limit, 100), 1000))
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('expiry:' || v_order.order_id::text, 0));

    IF EXISTS (
      SELECT 1 FROM public.orders
       WHERE id = v_order.order_id
         AND payment_status IN ('paid','refunded','partially_refunded')
    ) THEN
      v_skipped_paid := v_skipped_paid + 1;
      CONTINUE;
    END IF;

    v_release := public.release_order_inventory(v_order.order_id, 'reservation_expired');

    UPDATE public.orders
       SET status = CASE WHEN status IN ('pending_payment','pending_bank_transfer') THEN 'cancelled' ELSE status END,
           payment_status = CASE WHEN payment_status IN ('pending','initiated','awaiting_transfer') THEN 'failed' ELSE payment_status END,
           fulfillment_status = CASE WHEN fulfillment_status IN ('not_started','preparing') THEN 'cancelled' ELSE fulfillment_status END,
           cancelled_at = coalesce(cancelled_at, now()),
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'reservation_expired_at', now(),
             'inventory_release', v_release
           )
     WHERE id = v_order.order_id
       AND payment_status NOT IN ('paid','refunded','partially_refunded');

    UPDATE public.payments
       SET status = 'failed', updated_at = now()
     WHERE order_id = v_order.order_id
       AND status IN ('initiated','awaiting_transfer');

    INSERT INTO public.order_status_events (
      order_id, status, event_type, previous_status, new_status,
      source, created_by, message, note, metadata
    ) VALUES (
      v_order.order_id, 'reservation_expired', 'reservation_expired', NULL, 'cancelled',
      'inventory', 'reservation_expiry_job',
      'Ödeme süresi dolduğu için stok rezervasyonu serbest bırakıldı.',
      'Ödenmiş siparişler bu işlemden hariç tutulur.',
      jsonb_build_object('expired_at', v_order.expires_at, 'inventory_release', v_release)
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

REVOKE ALL ON FUNCTION public.is_valid_tr_iban(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_iyzico_payment_success(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_iyzico_payment_failure(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_inventory_reservations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_tr_iban(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_iyzico_payment_success(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_iyzico_payment_failure(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_inventory_reservations(integer) TO service_role;

COMMIT;
