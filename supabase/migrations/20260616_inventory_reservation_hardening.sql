-- COSMOSKIN inventory reservation hardening
-- Apply after 20260616_atomic_inventory_reservation.sql.
-- This migration adds order-level atomic, idempotent reservation operations.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_idempotency_key text NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_checkout_idempotency_key
  ON public.orders(checkout_idempotency_key)
  WHERE checkout_idempotency_key IS NOT NULL;

-- Fail before changing data when normalized duplicate slugs exist. Resolve them with
-- scripts/reconcile-inventory.mjs in a staging copy, then re-run this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.product_inventory
     GROUP BY lower(trim(product_slug))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'product_inventory contains duplicate normalized product_slug values';
  END IF;
END $$;

UPDATE public.product_inventory
   SET product_slug = lower(trim(product_slug)),
       updated_at = now()
 WHERE product_slug IS DISTINCT FROM lower(trim(product_slug));

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_inventory_normalized_slug
  ON public.product_inventory (lower(trim(product_slug)));

ALTER TABLE public.product_inventory
  DROP CONSTRAINT IF EXISTS product_inventory_stock_on_hand_check;
ALTER TABLE public.product_inventory
  ADD CONSTRAINT product_inventory_stock_on_hand_check
  CHECK (stock_on_hand >= 0) NOT VALID;
ALTER TABLE public.product_inventory
  DROP CONSTRAINT IF EXISTS product_inventory_stock_reserved_check;
ALTER TABLE public.product_inventory
  ADD CONSTRAINT product_inventory_stock_reserved_check
  CHECK (stock_reserved >= 0) NOT VALID;
ALTER TABLE public.product_inventory
  DROP CONSTRAINT IF EXISTS product_inventory_status_check;
ALTER TABLE public.product_inventory
  ADD CONSTRAINT product_inventory_status_check
  CHECK (status IN ('active','inactive','discontinued')) NOT VALID;

-- Keep movement reasons compatible with the order-level reservation RPCs even when
-- the older operational migration was only partially applied.
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_reason_check
  CHECK (reason IN (
    'manual_adjustment','supplier_restock','order_paid','order_cancelled',
    'return_received','damage_loss','correction','stock_reserved','reservation_released'
  )) NOT VALID;

-- New writes must preserve non-negative inventory. The NOT VALID constraint also
-- allows deployment teams to inspect historical rows before validating them.
ALTER TABLE public.product_inventory
  DROP CONSTRAINT IF EXISTS product_inventory_reserved_within_stock_check;
ALTER TABLE public.product_inventory
  ADD CONSTRAINT product_inventory_reserved_within_stock_check
  CHECK (allow_backorder OR stock_reserved <= stock_on_hand) NOT VALID;

CREATE OR REPLACE FUNCTION public.reserve_order_inventory(
  p_order_id uuid,
  p_items jsonb,
  p_expires_at timestamptz,
  p_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_inventory public.product_inventory%ROWTYPE;
  v_reservation public.inventory_reservations%ROWTYPE;
  v_reservations jsonb := '[]'::jsonb;
  v_existing jsonb;
  v_item_count integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'order_id gerekli.', ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'Rezervasyon için ürün bulunamadı.', ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION USING MESSAGE = 'Rezervasyon bitiş zamanı geçersiz.', ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));

  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at, r.product_slug)
    INTO v_existing
    FROM public.inventory_reservations r
   WHERE r.order_id = p_order_id;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'reserved', jsonb_array_length(v_existing),
      'reservations', v_existing
    );
  END IF;

  FOR v_item IN
    SELECT lower(trim(item->>'product_slug')) AS product_slug,
           sum(CASE WHEN coalesce(item->>'quantity','') ~ '^[0-9]+$'
                    THEN (item->>'quantity')::integer ELSE 0 END)::integer AS quantity
      FROM jsonb_array_elements(p_items) item
     GROUP BY lower(trim(item->>'product_slug'))
     ORDER BY lower(trim(item->>'product_slug'))
  LOOP
    IF v_item.product_slug IS NULL OR v_item.product_slug = '' OR v_item.quantity < 1 OR v_item.quantity > 99 THEN
      RAISE EXCEPTION USING MESSAGE = 'Rezervasyon ürün verisi geçersiz.', ERRCODE = '22023';
    END IF;

    SELECT * INTO v_inventory
      FROM public.product_inventory
     WHERE product_slug = v_item.product_slug
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('%s için stok kaydı bulunamadı.', v_item.product_slug), ERRCODE = 'P0001';
    END IF;
    IF v_inventory.status <> 'active' THEN
      RAISE EXCEPTION USING MESSAGE = format('%s şu anda satışta değil.', v_item.product_slug), ERRCODE = 'P0001';
    END IF;
    IF NOT v_inventory.allow_backorder
       AND (v_inventory.stock_on_hand - v_inventory.stock_reserved) < v_item.quantity THEN
      RAISE EXCEPTION USING MESSAGE = format('%s için yeterli stok bulunmuyor.', v_item.product_slug), ERRCODE = 'P0001';
    END IF;

    UPDATE public.product_inventory
       SET stock_reserved = stock_reserved + v_item.quantity,
           updated_at = now()
     WHERE id = v_inventory.id;

    INSERT INTO public.inventory_reservations (
      order_id, session_id, product_slug, quantity, status, expires_at
    ) VALUES (
      p_order_id, nullif(trim(p_session_id), ''), v_item.product_slug,
      v_item.quantity, 'active', p_expires_at
    ) RETURNING * INTO v_reservation;

    INSERT INTO public.inventory_movements (
      product_slug, change, previous_stock_on_hand, new_stock_on_hand,
      reason, note, related_order_id, created_by
    ) VALUES (
      v_item.product_slug, 0, v_inventory.stock_on_hand, v_inventory.stock_on_hand,
      'stock_reserved', format('Checkout rezervasyonu: %s adet', v_item.quantity),
      p_order_id::text, 'checkout'
    );

    v_reservations := v_reservations || jsonb_build_array(to_jsonb(v_reservation));
    v_item_count := v_item_count + 1;
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'Rezervasyon için geçerli ürün bulunamadı.', ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'reserved', v_item_count,
    'reservations', v_reservations
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order_inventory(
  p_order_id uuid,
  p_reason text DEFAULT 'payment_failed'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.inventory_reservations%ROWTYPE;
  v_inventory public.product_inventory%ROWTYPE;
  v_released integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'released', 0, 'idempotent', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));

  FOR v_reservation IN
    SELECT * FROM public.inventory_reservations
     WHERE order_id = p_order_id AND status = 'active'
     ORDER BY product_slug, created_at
     FOR UPDATE
  LOOP
    SELECT * INTO v_inventory
      FROM public.product_inventory
     WHERE product_slug = v_reservation.product_slug
     FOR UPDATE;

    IF FOUND THEN
      UPDATE public.product_inventory
         SET stock_reserved = greatest(0, stock_reserved - v_reservation.quantity),
             updated_at = now()
       WHERE id = v_inventory.id;

      INSERT INTO public.inventory_movements (
        product_slug, change, previous_stock_on_hand, new_stock_on_hand,
        reason, note, related_order_id, created_by
      ) VALUES (
        v_reservation.product_slug, 0, v_inventory.stock_on_hand, v_inventory.stock_on_hand,
        'reservation_released', left('Rezervasyon serbest bırakıldı: ' || coalesce(p_reason, 'unspecified'), 500),
        p_order_id::text, 'inventory_rpc'
      );
    END IF;

    UPDATE public.inventory_reservations
       SET status = CASE WHEN p_reason = 'reservation_expired' THEN 'expired' ELSE 'released' END,
           released_at = now()
     WHERE id = v_reservation.id;
    v_released := v_released + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'released', v_released, 'idempotent', v_released = 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_order_inventory(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.inventory_reservations%ROWTYPE;
  v_inventory public.product_inventory%ROWTYPE;
  v_converted integer := 0;
  v_deducted integer := 0;
  v_next_stock integer;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'converted', 0, 'deducted', 0, 'idempotent', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));

  FOR v_reservation IN
    SELECT * FROM public.inventory_reservations
     WHERE order_id = p_order_id AND status = 'active'
     ORDER BY product_slug, created_at
     FOR UPDATE
  LOOP
    SELECT * INTO v_inventory
      FROM public.product_inventory
     WHERE product_slug = v_reservation.product_slug
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('%s için stok kaydı bulunamadı.', v_reservation.product_slug), ERRCODE = 'P0001';
    END IF;
    IF NOT v_inventory.allow_backorder AND v_inventory.stock_on_hand < v_reservation.quantity THEN
      RAISE EXCEPTION USING MESSAGE = format('%s için kalıcı stok düşümü güvenle yapılamadı.', v_reservation.product_slug), ERRCODE = 'P0001';
    END IF;

    v_next_stock := greatest(0, v_inventory.stock_on_hand - v_reservation.quantity);
    UPDATE public.product_inventory
       SET stock_on_hand = v_next_stock,
           stock_reserved = greatest(0, stock_reserved - v_reservation.quantity),
           updated_at = now()
     WHERE id = v_inventory.id;

    UPDATE public.inventory_reservations
       SET status = 'converted', released_at = now()
     WHERE id = v_reservation.id;

    INSERT INTO public.inventory_movements (
      product_slug, change, previous_stock_on_hand, new_stock_on_hand,
      reason, note, related_order_id, created_by
    ) VALUES (
      v_reservation.product_slug, -v_reservation.quantity,
      v_inventory.stock_on_hand, v_next_stock, 'order_paid',
      'Ödeme onayı sonrası rezervasyon kalıcı stok düşümüne çevrildi.',
      p_order_id::text, 'inventory_rpc'
    );

    v_converted := v_converted + 1;
    v_deducted := v_deducted + v_reservation.quantity;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'converted', v_converted,
    'deducted', v_deducted,
    'idempotent', v_converted = 0
  );
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
  v_orders integer := 0;
BEGIN
  FOR v_order IN
    SELECT DISTINCT order_id
      FROM public.inventory_reservations
     WHERE status = 'active' AND expires_at <= now() AND order_id IS NOT NULL
     ORDER BY order_id
     LIMIT greatest(1, least(coalesce(p_limit, 100), 1000))
  LOOP
    PERFORM public.release_order_inventory(v_order.order_id, 'reservation_expired');
    v_orders := v_orders + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'orders_processed', v_orders);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_order_inventory(uuid, jsonb, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_order_inventory(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convert_order_inventory(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_inventory_reservations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_order_inventory(uuid, jsonb, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_order_inventory(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_inventory_reservations(integer) TO service_role;

COMMIT;
