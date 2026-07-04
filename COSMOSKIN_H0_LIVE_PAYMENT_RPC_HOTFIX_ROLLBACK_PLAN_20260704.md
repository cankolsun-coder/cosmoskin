# COSMOSKIN — H0 Rollback Plan — Emergency Payment/RPC Compatibility Hotfix

Date: 2026-07-04

General principle: **prefer revoke over drop.** Every rollback below disables the new behavior instantly without deleting any function definition, table, or row, so re-enabling is a single `GRANT`/constraint re-add away — no re-deploy of the migration file needed.

## Scenario A — Something is wrong with `process_iyzico_payment_success` / `_failure` specifically

Instant, non-destructive disable:

```sql
REVOKE ALL ON FUNCTION public.process_iyzico_payment_success(uuid, text, text, jsonb) FROM service_role;
REVOKE ALL ON FUNCTION public.process_iyzico_payment_failure(uuid, text, text, jsonb) FROM service_role;
```

Effect: `functions/api/iyzico-callback.js` (unmodified) already wraps the success-path call in a `try/catch` — the callback will fall back to its existing `review_required` handling exactly as it did before this hotfix (which is now a valid `fulfillment_status` value, so at least the order will not fail a second time on the constraint). The failure path call is not wrapped in a try/catch today, so revoking there will surface a callback error — only do this if `process_iyzico_payment_failure` itself is the confirmed problem.

Re-enable:

```sql
GRANT EXECUTE ON FUNCTION public.process_iyzico_payment_success(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_iyzico_payment_failure(uuid, text, text, jsonb) TO service_role;
```

## Scenario B — Something is wrong with `release_expired_inventory_reservations`

```sql
REVOKE ALL ON FUNCTION public.release_expired_inventory_reservations(integer) FROM service_role;
```

Effect: `/api/cron/release-expired-inventory` starts returning its existing `503` error response (already handled gracefully by that endpoint's own `try/catch` — no cascading failure). No scheduler currently depends on this endpoint running successfully (Batch E, not yet wired), so this is low-risk to disable.

Re-enable: `GRANT EXECUTE ON FUNCTION public.release_expired_inventory_reservations(integer) TO service_role;`

## Scenario C — The `review_required` constraint change itself needs reverting

```sql
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_final_chk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_status_final_chk
  CHECK (fulfillment_status IN (
    'not_started', 'unfulfilled', 'preparing', 'packed',
    'shipped', 'delivered', 'returned', 'cancelled'
  ));
```

**Important:** if any live order already has `fulfillment_status = 'review_required'` at the time you run this, the `ADD CONSTRAINT` (fully validated) will fail with a CHECK violation. First check:

```sql
SELECT id, order_number FROM public.orders WHERE fulfillment_status = 'review_required';
```

If any rows exist, either manually reassign them to `preparing` (only after confirming their actual state) before dropping `'review_required'` from the allowed list, or add the new constraint as `NOT VALID` instead (skips validating existing rows, but still enforces on new writes):

```sql
ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_status_final_chk
  CHECK (fulfillment_status IN (
    'not_started', 'unfulfilled', 'preparing', 'packed',
    'shipped', 'delivered', 'returned', 'cancelled'
  )) NOT VALID;
```

## Scenario D — Full rollback of this hotfix

Run Scenarios A, B, and C together. This returns the live database to its exact pre-H0 state for grants and constraints. The function *definitions* remain in `pg_proc` (harmless — they simply can no longer be called without `service_role` grant, which has been revoked), so a fix-forward is always just the two `GRANT` statements plus re-adding `review_required` to the constraint — no need to re-run the full migration file.

## What NOT to do during rollback

- Do **not** `DROP FUNCTION` any of the three RPCs — that would put the live database back into the exact broken state this hotfix fixed (missing RPC, code still calls it).
- Do **not** delete rows from `payment_events`, `inventory_reservations`, `orders`, `payments`, or `order_status_events` — they contain production financial/audit data. This mirrors the existing guidance in `supabase/rollback/20260616_prelaunch_recovery.sql`.
- Do **not** revert `functions/api/iyzico-callback.js` or `functions/api/cron/release-expired-inventory.js` — they were never modified by H0; there is nothing to revert there.

## Post-rollback reconciliation

If a rollback is executed after this hotfix has already processed real traffic (i.e., after Scenario A/B/C is applied to *disable* it again), before considering the incident closed:

1. Identify all orders whose `payment_events` rows were created while the hotfix was active:
   ```sql
   SELECT order_id, event_type, status, processed_at
     FROM public.payment_events
    WHERE provider = 'iyzico'
      AND processed_at BETWEEN '<hotfix start time>' AND '<rollback time>'
    ORDER BY processed_at;
   ```
2. For each, cross-check `orders.status`/`payment_status`/`fulfillment_status` and `inventory_reservations.status` are mutually consistent (a `payment_success` event should correspond to `orders.payment_status = 'paid'` and a `converted` reservation).
3. Manually reconcile (not automated) any order that does not match before resuming normal operations.
