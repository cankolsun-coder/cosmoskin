-- ============================================================================
-- COSMOSKIN — Supabase production verification queries (AUDIT 2026-07-11)
-- READ-ONLY. Do not run DDL/DML from this file. Prepared but NOT executed.
-- Run in Supabase SQL editor with a service role; every statement is SELECT-only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table existence: every table the Cloudflare Functions write to or read
-- ----------------------------------------------------------------------------
WITH expected(table_name, source) AS (VALUES
  ('orders','migrations'), ('order_items','migrations'), ('order_status_events','migrations'),
  ('payments','migrations'), ('payment_events','migrations'), ('payment_bank_accounts','migrations'),
  ('shipments','commerce-schema.sql (NOT in migrations)'), ('shipment_events','migrations'),
  ('product_inventory','migrations'), ('inventory_movements','migrations'), ('inventory_lots','migrations'),
  ('inventory_reservations','migrations'),
  ('product_price_overrides','migrations'), ('product_price_audit_logs','migrations'),
  ('coupons','migrations'), ('coupon_redemptions','migrations'), ('customer_coupons','migrations'),
  ('profiles','migrations'), ('user_addresses','migrations'),
  ('user_favorites','commerce-schema.sql (NOT in migrations)'),
  ('notifications','commerce-schema.sql (NOT in migrations)'),
  ('notification_preferences','migrations'),
  ('reviews','reviews.sql (NOT in migrations)'), ('review_images','reviews.sql'), ('review_helpful','reviews.sql'),
  ('support_requests','FINAL_LAUNCH fix sql (NOT in migrations)'),
  ('customer_membership_status','migrations'), ('customer_membership_history','migrations'),
  ('membership_levels','migrations'), ('birthday_benefits','migrations'),
  ('loyalty_points_ledger','migrations'), ('loyalty_redemptions','migrations'), ('loyalty_point_rules','migrations'),
  ('crm_events','migrations'), ('newsletter_subscribers','migrations'), ('consent_records','migrations'),
  ('customer_skin_profiles','migrations'), ('customer_routine_results','migrations'),
  ('return_requests','migrations'), ('return_request_items','migrations'),
  ('return_request_attachments','migrations'), ('return_status_events','migrations'),
  ('refund_records','migrations'), ('invoice_records','migrations'),
  ('restock_alerts','migrations'), ('email_events','migrations'),
  ('order_legal_snapshots','migrations'), ('order_legal_consents','migrations'),
  ('product_compliance','migrations'),
  ('admin_users','migrations'), ('admin_permissions','migrations'), ('admin_activity_logs','migrations'),
  ('supplier_records','migrations')
)
SELECT e.table_name, e.source,
       CASE WHEN t.table_name IS NULL THEN '*** MISSING ***' ELSE 'ok' END AS status
FROM expected e
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = e.table_name
ORDER BY status DESC, e.table_name;

-- Tables the CRM/QA design wants but that intentionally do not exist yet
-- (expected result: all missing; create only via DB1/E3 migrations):
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('crm_sync_logs','email_unsubscribe_tokens','cart_sessions','membership_events');

-- ----------------------------------------------------------------------------
-- 2. profiles: birthday + opt-in columns (UX4-01 / UX4-02)
-- ----------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
  AND column_name IN ('birthday','birthday_change_count','birthday_last_changed_at','birth_date_locked',
                      'marketing_email_opt_in','newsletter_opt_in','stock_alert_opt_in','routine_reminder_opt_in',
                      'metadata','phone','first_name','last_name','email','updated_at')
ORDER BY column_name;

-- Evidence of the C-02 opt-in wipe (profiles rows updated recently with all flags false
-- while notification_preferences say otherwise). Read-only sanity sample:
SELECT p.id, p.updated_at,
       p.marketing_email_opt_in, p.newsletter_opt_in, p.stock_alert_opt_in, p.routine_reminder_opt_in,
       np.campaign_emails, np.newsletter, np.stock_notifications, np.routine_reminders
FROM public.profiles p
LEFT JOIN public.notification_preferences np ON np.user_id = p.id
WHERE p.updated_at > now() - interval '30 days'
  AND p.marketing_email_opt_in = false AND p.newsletter_opt_in = false
  AND (np.campaign_emails = true OR np.newsletter = true)
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 3. user_favorites: unique constraint, RLS, duplicates (E1)
-- ----------------------------------------------------------------------------
SELECT conname, contype, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.user_favorites'::regclass;

SELECT relrowsecurity AS rls_enabled
FROM pg_class WHERE oid = 'public.user_favorites'::regclass;

SELECT polname, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='user_favorites';

-- Duplicate favorites that a unique constraint should have prevented:
SELECT user_id, product_slug, count(*) AS dupes
FROM public.user_favorites
GROUP BY user_id, product_slug
HAVING count(*) > 1
ORDER BY dupes DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 4. Membership / loyalty (E2)
-- ----------------------------------------------------------------------------
SELECT proname, prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND proname IN ('recalculate_customer_membership');

SELECT code, label FROM public.membership_levels ORDER BY 1;
-- Expected: essential / signature / elite ONLY (no select/silver/legacy rows).

SELECT membership_level_code_or_equivalent.* FROM (
  SELECT level_code, count(*) AS customers
  FROM public.customer_membership_status
  GROUP BY level_code
) AS membership_level_code_or_equivalent;

-- Spot-check: customers whose paid order spend crosses a threshold but whose
-- stored level is still essential (stale recalc):
SELECT s.user_id, s.level_code, s.loyalty_spend_ex_shipping, s.completed_orders_12m, s.updated_at
FROM public.customer_membership_status s
WHERE (s.loyalty_spend_ex_shipping >= 6000 OR s.completed_orders_12m >= 3)
  AND s.level_code = 'essential'
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 5. CRM / newsletter / consents (E3)
-- ----------------------------------------------------------------------------
SELECT event_type, count(*) AS events, max(created_at) AS last_event
FROM public.crm_events GROUP BY event_type ORDER BY events DESC;

SELECT status, count(*) FROM public.newsletter_subscribers GROUP BY status;

SELECT consent_type, status, count(*)
FROM public.consent_records
GROUP BY consent_type, status
ORDER BY consent_type, status;

SELECT type AS email_type, status, count(*)
FROM public.email_events
GROUP BY 1,2 ORDER BY 1,2;

-- ----------------------------------------------------------------------------
-- 6. Reviews / notifications / support provenance checks
-- ----------------------------------------------------------------------------
SELECT c.relname, c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies pol WHERE pol.tablename = c.relname) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relkind='r'
  AND c.relname IN ('reviews','review_images','review_helpful','notifications','support_requests','shipments');

-- ----------------------------------------------------------------------------
-- 7. Pricing override sanity (P1E) — display-only compare-at invariant support
-- ----------------------------------------------------------------------------
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='product_price_overrides'
  AND column_name IN ('regular_price_try','sale_price_try','compare_at_price_try','sale_starts_at','sale_ends_at');

-- Overrides where compare_at <= sale price (display would be nonsensical):
SELECT product_slug, regular_price_try, sale_price_try, compare_at_price_try
FROM public.product_price_overrides
WHERE compare_at_price_try IS NOT NULL
  AND sale_price_try IS NOT NULL
  AND compare_at_price_try <= sale_price_try
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 8. Index coverage on hot paths
-- ----------------------------------------------------------------------------
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN ('user_favorites','orders','order_items','crm_events','newsletter_subscribers',
                    'loyalty_points_ledger','customer_membership_status','notification_preferences')
ORDER BY tablename, indexname;
