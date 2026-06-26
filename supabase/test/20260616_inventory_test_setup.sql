-- Disposable staging-only stock-one test setup.
-- Replace variables in psql/supabase SQL editor. Never use a real customer order or sellable SKU.

-- Recommended: create a catalog-independent test inventory row.
INSERT INTO public.product_inventory (
  product_slug, sku, stock_on_hand, stock_reserved, low_stock_threshold,
  allow_backorder, status, updated_at
) VALUES (
  'qa-stock-one-product', 'QA-STOCK-ONE', 1, 0, 0, false, 'active', now()
)
ON CONFLICT (product_slug) DO UPDATE SET
  stock_on_hand = 1,
  stock_reserved = 0,
  allow_backorder = false,
  status = 'active',
  updated_at = now();

-- The Node concurrency script creates two temporary UUID order references and restores
-- the original inventory row in finally:
-- ALLOW_DESTRUCTIVE_TEST=true \
-- SUPABASE_URL='https://PROJECT.supabase.co' \
-- SUPABASE_SERVICE_ROLE_KEY='set-in-shell-only' \
-- TEST_INVENTORY_SLUG='qa-stock-one-product' \
-- node scripts/test-inventory-concurrency.mjs

-- Cleanup after verification, only when no test reservation remains:
-- DELETE FROM public.product_inventory
-- WHERE product_slug = 'qa-stock-one-product'
--   AND stock_reserved = 0
--   AND NOT EXISTS (
--     SELECT 1 FROM public.inventory_reservations
--     WHERE product_slug = 'qa-stock-one-product' AND status = 'active'
--   );
