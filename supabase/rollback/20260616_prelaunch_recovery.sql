-- COSMOSKIN 20260616 recovery procedure
-- Do not run automatically. Take a database backup first.
-- The safest rollback is application rollback while retaining additive columns/tables.

BEGIN;

-- Revoke newly introduced RPCs first so an older application cannot call incompatible functions.
REVOKE ALL ON FUNCTION public.process_iyzico_payment_success(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.process_iyzico_payment_failure(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reserve_order_inventory(uuid, jsonb, timestamptz, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_order_inventory(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.convert_order_inventory(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Restore service-role execution only when rolling forward again.
-- Do not drop payment_bank_accounts, reservation records, payment events, or order columns:
-- they may contain production audit data. Keep them for recovery and reconciliation.

-- Optional emergency disablement of EFT without deleting account data:
UPDATE public.payment_bank_accounts SET is_active = false, updated_at = now();

COMMIT;

-- Application rollback sequence:
-- 1. Disable checkout traffic or put the site in maintenance mode.
-- 2. Deploy the previously known-good application build.
-- 3. Keep inventory mutations disabled until reservation/order reconciliation is complete.
-- 4. Compare active reservations with product_inventory.stock_reserved.
-- 5. Restore EXECUTE grants only when the hardened application is redeployed.
-- 6. Never manually add stock for a reservation without checking payment_events and orders.
