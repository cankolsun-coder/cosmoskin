-- COSMOSKIN pre-launch verification queries
-- Run with a read-only or service-role SQL session after applying all 20260616 migrations.
-- This file does not modify customer data.

-- 1) Required functions and tables.
SELECT to_regclass('public.payment_bank_accounts') AS payment_bank_accounts,
       to_regprocedure('public.reserve_order_inventory(uuid,jsonb,timestamp with time zone,text)') AS reserve_rpc,
       to_regprocedure('public.release_order_inventory(uuid,text)') AS release_rpc,
       to_regprocedure('public.convert_order_inventory(uuid)') AS convert_rpc,
       to_regprocedure('public.process_iyzico_payment_success(uuid,text,text,jsonb)') AS payment_success_rpc,
       to_regprocedure('public.process_iyzico_payment_failure(uuid,text,text,jsonb)') AS payment_failure_rpc,
       to_regprocedure('public.release_expired_inventory_reservations(integer)') AS expiry_rpc;

-- 2) Inventory integrity. Every result set must be empty.
SELECT product_slug, count(*) AS duplicate_count
FROM public.product_inventory
GROUP BY lower(trim(product_slug)), product_slug
HAVING count(*) > 1;

SELECT id, product_slug, stock_on_hand, stock_reserved, allow_backorder, status
FROM public.product_inventory
WHERE stock_on_hand < 0
   OR stock_reserved < 0
   OR (NOT allow_backorder AND stock_reserved > stock_on_hand)
   OR status NOT IN ('active','inactive','discontinued')
   OR product_slug IS DISTINCT FROM lower(trim(product_slug));

-- 3) Active reservation consistency.
SELECT r.order_id, r.product_slug, sum(r.quantity) AS active_reserved,
       i.stock_reserved AS inventory_reserved
FROM public.inventory_reservations r
JOIN public.product_inventory i ON i.product_slug = r.product_slug
WHERE r.status = 'active'
GROUP BY r.order_id, r.product_slug, i.stock_reserved
HAVING sum(r.quantity) > i.stock_reserved;

-- 4) Valid active EFT account. Exactly one preferred row is recommended.
SELECT id, bank_name, account_holder,
       regexp_replace(upper(iban), '[^A-Z0-9]', '', 'g') AS normalized_iban,
       public.is_valid_tr_iban(iban) AS iban_valid,
       currency, is_active, sort_order
FROM public.payment_bank_accounts
ORDER BY is_active DESC, sort_order ASC, created_at ASC;

-- 5) Constraints should be validated after legacy data is cleaned.
SELECT conrelid::regclass AS table_name, conname, convalidated
FROM pg_constraint
WHERE conname IN (
  'product_inventory_stock_on_hand_check',
  'product_inventory_stock_reserved_check',
  'product_inventory_reserved_within_stock_check',
  'product_inventory_status_check',
  'inventory_movements_reason_check',
  'payment_bank_accounts_required_fields_check',
  'payment_bank_accounts_currency_check',
  'payment_bank_accounts_iban_check'
)
ORDER BY table_name::text, conname;

-- After all integrity queries are clean, validate in a controlled deployment window:
-- ALTER TABLE public.product_inventory VALIDATE CONSTRAINT product_inventory_stock_on_hand_check;
-- ALTER TABLE public.product_inventory VALIDATE CONSTRAINT product_inventory_stock_reserved_check;
-- ALTER TABLE public.product_inventory VALIDATE CONSTRAINT product_inventory_reserved_within_stock_check;
-- ALTER TABLE public.product_inventory VALIDATE CONSTRAINT product_inventory_status_check;
-- ALTER TABLE public.inventory_movements VALIDATE CONSTRAINT inventory_movements_reason_check;
-- ALTER TABLE public.payment_bank_accounts VALIDATE CONSTRAINT payment_bank_accounts_required_fields_check;
-- ALTER TABLE public.payment_bank_accounts VALIDATE CONSTRAINT payment_bank_accounts_currency_check;
-- ALTER TABLE public.payment_bank_accounts VALIDATE CONSTRAINT payment_bank_accounts_iban_check;

-- 6) RLS and grants. rowsecurity must be true and anon/authenticated should have no direct writes.
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = ANY (ARRAY[
    'orders','order_items','payments','product_inventory','inventory_reservations',
    'payment_bank_accounts','payment_events','reviews','review_images'
  ])
ORDER BY tablename;

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon','authenticated')
  AND table_name = ANY (ARRAY[
    'orders','order_items','payments','product_inventory','inventory_reservations',
    'payment_bank_accounts','payment_events','reviews','review_images'
  ])
ORDER BY grantee, table_name, privilege_type;

-- 7) Reservation and callback diagnostics.
SELECT order_id, product_slug, quantity, status, expires_at, released_at
FROM public.inventory_reservations
WHERE order_id = :'test_order_id'::uuid
ORDER BY created_at, product_slug;

SELECT order_id, provider, provider_payment_id, raw_reference, event_type, status,
       processed_at, created_at
FROM public.payment_events
WHERE order_id = :'test_order_id'::uuid
ORDER BY created_at;

-- A duplicate successful callback must have only one processed payment_success row.
SELECT order_id, event_type, count(*) AS processed_count
FROM public.payment_events
WHERE order_id = :'test_order_id'::uuid
  AND provider = 'iyzico'
  AND event_type = 'payment_success'
  AND status = 'processed'
GROUP BY order_id, event_type;

-- 8) Expired EFT verification. Paid/refunded orders must never appear here.
SELECT o.id, o.order_number, o.status, o.payment_status, r.expires_at
FROM public.orders o
JOIN public.inventory_reservations r ON r.order_id = o.id
WHERE r.status = 'active'
  AND r.expires_at <= now()
  AND o.payment_status IN ('paid','refunded','partially_refunded');
