# COSMOSKIN — H0 Supabase Runbook — Emergency Payment/RPC Compatibility Hotfix

Date: 2026-07-04
Audience: whoever runs this against the live Supabase project (Supabase SQL editor or `psql`).

## Before you start

- This migration is additive-only: no `DROP TABLE`, no destructive statements, no data mutation outside function bodies (the `UPDATE`/`INSERT` statements only run later, when the RPCs are actually called). It is safe to run once on production, and safe to re-run (every statement is `CREATE OR REPLACE FUNCTION` or `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`).
- **Run the entire file as one transaction.** The root cause of this incident was exactly this: `20260616_payment_bank_and_callback_hardening.sql` was applied in fragments instead of as a single `BEGIN…COMMIT` block, so some statements landed and others silently didn't. Paste the full contents of `supabase/migrations/20260704_h0_live_payment_rpc_hotfix.sql` into the SQL editor and execute it in one go.
- Note the current timestamp before running, in case you need to correlate with Supabase's automated backups.

## Step 1 — Run the migration

Paste and run the full contents of:

```
supabase/migrations/20260704_h0_live_payment_rpc_hotfix.sql
```

as a single execution (it already contains its own `BEGIN`/`COMMIT`).

Expected result: `COMMIT` with no errors. If any statement errors, the whole transaction rolls back automatically (nothing partially applies) — re-read the error, fix, and re-run the whole file again; do not try to run the remainder of the file starting mid-way.

## Step 2 — Verify the three RPCs now exist with the right signatures

```sql
SELECT
  to_regprocedure('public.process_iyzico_payment_success(uuid,text,text,jsonb)')        AS payment_success_rpc,
  to_regprocedure('public.process_iyzico_payment_failure(uuid,text,text,jsonb)')        AS payment_failure_rpc,
  to_regprocedure('public.release_expired_inventory_reservations(integer)')             AS expiry_rpc;
```

All three columns must be **non-null**. If any is null, the corresponding `CREATE OR REPLACE FUNCTION` did not run — re-run the full migration file.

## Step 3 — Verify the `orders.fulfillment_status` CHECK constraint

```sql
SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid = 'public.orders'::regclass
   AND conname = 'orders_fulfillment_status_final_chk';
```

The `def` column must include `'review_required'` alongside the 8 pre-existing values (`not_started`, `unfulfilled`, `preparing`, `packed`, `shipped`, `delivered`, `returned`, `cancelled`).

## Step 4 — Verify service_role-only grants

```sql
SELECT p.proname, r.privilege_type, g.grantee
  FROM information_schema.role_routine_grants g
  JOIN pg_proc p ON p.proname = g.routine_name
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  CROSS JOIN LATERAL (SELECT g.privilege_type) r
 WHERE p.proname IN ('process_iyzico_payment_success', 'process_iyzico_payment_failure', 'release_expired_inventory_reservations');
```

Every row's `grantee` should be `service_role` (or `postgres`); there should be no `anon`/`authenticated`/`PUBLIC` grantee for these three functions.

## Step 5 — Live payment smoke test (required before declaring this resolved)

1. Place one manual **card** test order end-to-end (Iyzico sandbox/test card if the project has a sandbox key configured; otherwise the smallest real card amount you're comfortable reconciling manually).
2. After the callback redirects, check:
   ```sql
   SELECT id, order_number, status, payment_status, fulfillment_status, metadata->>'inventory_reconciliation_required' AS reconciliation_flag
     FROM public.orders
    WHERE id = '<the test order id>';
   ```
   Expect: `status = 'paid'`, `payment_status = 'paid'`, `fulfillment_status = 'preparing'` (**not** `review_required`), `reconciliation_flag` is `false`/absent.
3. Check the reservation converted exactly once:
   ```sql
   SELECT product_slug, quantity, status FROM public.inventory_reservations WHERE order_id = '<the test order id>';
   ```
   Expect: `status = 'converted'` for every row.
4. Check exactly one `payment_events` success row exists:
   ```sql
   SELECT event_type, status, processed_at FROM public.payment_events WHERE order_id = '<the test order id>' AND provider = 'iyzico';
   ```
5. If your test provider supports simulating a decline, repeat with a declined card and confirm:
   - `payment_events` has one `payment_failed`/`processed` row (not duplicated on retry).
   - `inventory_reservations` for that order moved to `released`.
   - Any coupon used on that order (if applicable) moved from `reserved` to `released` in `coupon_redemptions`.

## Step 6 — Expired-reservation sweep smoke test

1. Find or create a known-expired, unpaid reservation in a non-production-critical test order (`expires_at` in the past, order `status` in `pending_payment`/`pending_bank_transfer`, `payment_status` not `paid`).
2. Call the cron endpoint manually (requires `CRON_SECRET`):
   ```bash
   curl -X POST "https://<your-domain>/api/cron/release-expired-inventory?limit=10" \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
3. Confirm the response is `{"ok":true,"result":{"ok":true,"orders_processed":N,"paid_orders_skipped":M}}` with no error.
4. Confirm in the database:
   ```sql
   SELECT status FROM public.inventory_reservations WHERE order_id = '<test order id>';
   -- expect 'released'
   SELECT status, payment_status, fulfillment_status, cancelled_at FROM public.orders WHERE id = '<test order id>';
   -- expect status/payment_status/fulfillment_status moved to cancelled/failed/cancelled, cancelled_at set
   SELECT status, event_type, note, metadata FROM public.order_status_events WHERE order_id = '<test order id>' ORDER BY created_at DESC LIMIT 1;
   -- expect status = 'stock_released', event_type = 'stock_released', metadata->>'reason' = 'reservation_expired'
   ```
5. Re-run the same `curl` call again and confirm `orders_processed` no longer counts that same order (idempotent — nothing left to release).

## Step 7 — Only after Steps 5 and 6 both pass

Consider this hotfix live and resolved. Wiring a real scheduler (cron trigger) to `/api/cron/release-expired-inventory` is tracked separately (Batch E) and is **not** part of H0 — the endpoint already works correctly when called, it is simply not on an automatic schedule yet.

## Notes on environments where some of this may already exist

- If a target environment already has some of these functions from a partial run, `CREATE OR REPLACE FUNCTION` simply replaces the body — safe.
- If `orders_fulfillment_status_final_chk` already includes `'review_required'` for some reason, the `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` pair is a safe no-op re-application.
- If `cosmoskin_award_loyalty_for_order` (Batch 4) does not exist yet in a given environment, this migration is unaffected — it never calls that function. Batch 4's migration can be applied before or after this one with no ordering requirement.
