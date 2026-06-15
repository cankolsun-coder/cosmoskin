-- COSMOSKIN targeted stock fix: atomic checkout inventory reservation.
-- Public stock remains sourced from product_inventory.

CREATE OR REPLACE FUNCTION public.reserve_product_inventory(p_product_slug text, p_quantity integer)
RETURNS TABLE (
  id uuid,
  product_slug text,
  sku text,
  stock_on_hand integer,
  stock_reserved integer,
  low_stock_threshold integer,
  allow_backorder boolean,
  status text,
  updated_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.product_inventory pi
     SET stock_reserved = pi.stock_reserved + GREATEST(1, p_quantity),
         updated_at = now()
   WHERE pi.product_slug = lower(trim(p_product_slug))
     AND pi.status = 'active'
     AND (
       pi.allow_backorder = true
       OR (pi.stock_on_hand - pi.stock_reserved) >= GREATEST(1, p_quantity)
     )
   RETURNING pi.id,
             pi.product_slug,
             pi.sku,
             pi.stock_on_hand,
             pi.stock_reserved,
             pi.low_stock_threshold,
             pi.allow_backorder,
             pi.status,
             pi.updated_at,
             pi.created_at;
END;
$$;
