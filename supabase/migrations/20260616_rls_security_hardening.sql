-- COSMOSKIN sensitive table RLS hardening.
-- All public/customer operations are mediated by Cloudflare Functions.
-- SUPABASE_SERVICE_ROLE_KEY remains server-only and bypasses RLS.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'orders','order_items','payments','shipments','product_inventory','inventory_movements',
    'inventory_reservations','restock_alerts','email_events','order_status_events','payment_events',
    'invoice_records','return_requests','refund_records','shipment_events','product_compliance',
    'inventory_lots','supplier_records','consent_records','order_legal_consents','crm_events',
    'admin_users','payment_bank_accounts','coupons','coupon_redemptions','newsletter_subscribers',
    'reviews','review_images','review_helpful'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    END IF;
  END LOOP;
END $$;

-- Customers may read their own authenticated orders only when a future direct-Supabase
-- account implementation explicitly opts in. Current account APIs use server mediation,
-- therefore no permissive customer policies are created here.

-- Verify after deployment:
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname='public'
--   AND tablename = ANY (ARRAY['orders','order_items','payments','product_inventory','inventory_reservations','reviews']);
