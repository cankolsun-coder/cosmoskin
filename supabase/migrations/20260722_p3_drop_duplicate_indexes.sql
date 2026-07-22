-- COSMOSKIN P3 #20 (duplicate_index half only — see commit message for why
-- the 120 unused_index findings are deliberately NOT touched here).
--
-- 13 duplicate_index findings, all confirmed live to be byte-for-byte
-- identical index definitions under two (or three) different names —
-- same table, same columns, same expression, same partial WHERE clause.
-- Dropping the redundant copy has zero read/behavior impact (an identical
-- index remains) and only removes wasted write overhead + storage.
--
-- Exactly one pair involves a constraint: product_inventory has both
-- product_inventory_product_slug_key (backs an actual UNIQUE CONSTRAINT,
-- confirmed via pg_constraint) and uq_product_inventory_product_slug (a
-- plain unique index, no constraint). Kept the constraint-backed one,
-- dropped the plain duplicate. Every other pair here is two plain
-- CREATE INDEX statements with no owning constraint, so either name was
-- safe to drop; kept whichever already matches this repo's dominant
-- idx_<table>_<column> naming convention.

DROP INDEX IF EXISTS public.coupons_code_upper_idx;                    -- kept idx_coupons_code_upper
DROP INDEX IF EXISTS public.idx_order_items_order;                     -- kept idx_order_items_order_id
DROP INDEX IF EXISTS public.order_items_order_id_idx;                  -- kept idx_order_items_order_id
DROP INDEX IF EXISTS public.order_legal_consents_order_idx;            -- kept idx_order_legal_consents_order_id
DROP INDEX IF EXISTS public.order_status_events_order_id_idx;          -- kept idx_order_status_events_order_id
DROP INDEX IF EXISTS public.orders_status_created_idx;                 -- kept idx_orders_status_created
DROP INDEX IF EXISTS public.orders_user_created_idx;                   -- kept idx_orders_user_created
DROP INDEX IF EXISTS public.orders_checkout_idempotency_key_unique;    -- kept orders_checkout_idempotency_key_uidx
DROP INDEX IF EXISTS public.payments_order_id_idx;                     -- kept idx_payments_order_id
DROP INDEX IF EXISTS public.uq_product_inventory_product_slug;         -- kept product_inventory_product_slug_key (constraint-backed)
DROP INDEX IF EXISTS public.review_helpful_user_idx;                   -- kept idx_helpful_user_id
DROP INDEX IF EXISTS public.idx_review_images_review;                  -- kept idx_review_images_review_id
DROP INDEX IF EXISTS public.idx_shipments_order;                       -- kept idx_shipments_order_id
DROP INDEX IF EXISTS public.user_addresses_user_id_idx;                -- kept idx_user_addresses_user_id

-- Verify after deployment:
-- SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN (
--   'coupons_code_upper_idx','idx_order_items_order','order_items_order_id_idx',
--   'order_legal_consents_order_idx','order_status_events_order_id_idx',
--   'orders_status_created_idx','orders_user_created_idx',
--   'orders_checkout_idempotency_key_unique','payments_order_id_idx',
--   'uq_product_inventory_product_slug','review_helpful_user_idx',
--   'idx_review_images_review','idx_shipments_order','user_addresses_user_id_idx'
-- ); -- expect 0 rows
-- Confirm the surviving index of each pair still exists and the
-- product_inventory unique constraint (product_inventory_product_slug_key)
-- is intact via \d product_inventory or information_schema.table_constraints.

-- Rollback: re-run the original CREATE INDEX/CREATE UNIQUE INDEX statement
-- (definitions preserved above and in the security-review conversation).
