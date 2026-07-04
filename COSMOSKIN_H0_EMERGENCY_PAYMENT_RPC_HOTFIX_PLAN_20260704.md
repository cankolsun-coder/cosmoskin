# COSMOSKIN — H0 Emergency Live DB Payment/RPC Compatibility Hotfix — PLAN ONLY

Date: 2026-07-04
Status: **PLAN ONLY — no files edited, no SQL run, no live database changes made.**
Scope: Restore the two missing Iyzico/inventory RPCs and close the `orders.fulfillment_status` CHECK gap that blocks card payments today. Nothing else.

This plan was produced by re-inspecting the exact migration files, the exact call sites, and — critically — the **live production schema** via read-only Supabase MCP queries. The live inspection surfaced two additional problems beyond what the audit/preflight reports described textually. Both are called out explicitly in §4 and §7 because they change what "restore the RPC" safely means.

---

## 1. Exact code call sites for `process_iyzico_payment_success`

Single call site, success path only:

```327:340:functions/api/iyzico-callback.js
    if (success) {
      let processing = null;
      let inventoryProcessingError = null;
      try {
        processing = await rpc(context, 'process_iyzico_payment_success', {
          p_order_id: orderId,
          p_provider_payment_id: providerPaymentId,
          p_token: token,
          p_metadata: metadata
        });
      } catch (error) {
        inventoryProcessingError = String(error?.message || 'inventory_processing_failed').slice(0, 300);
        console.error('iyzico paid inventory processing failed:', { orderId, code: error?.code || null, message: inventoryProcessingError });
      }
```

The sibling function `process_iyzico_payment_failure` is called the same way on the failure path (line 381) and is **also missing live** (confirmed in §4). It shares the exact same call/retry/idempotency shape and must be restored in the same migration or the failure path (cancel + coupon/inventory release on a declined card) is equally broken.

```381:386:functions/api/iyzico-callback.js
    const failureProcessing = await rpc(context, 'process_iyzico_payment_failure', {
      p_order_id: orderId,
      p_provider_payment_id: providerPaymentId,
      p_token: token,
      p_metadata: metadata
    });
```

No other file calls either function. `functions/api/admin/orders.js` (`mark_payment_paid` for bank transfer) does **not** call these RPCs — it updates `orders`/`payments` directly and never touches `process_iyzico_payment_success`. This confirms the earlier audit finding: bank-transfer paid orders finalize fine; only the Iyzico card path is broken. The hotfix does not need to touch the bank-transfer path at all.

## 2. Exact code call sites for `release_expired_inventory_reservations`

Single call site:

```13:22:functions/api/cron/release-expired-inventory.js
  try {
    const limit = Math.min(500, Math.max(1, Number(new URL(context.request.url).searchParams.get('limit') || 100)));
    const result = await rpc(context, 'release_expired_inventory_reservations', { p_limit: limit });
    return json({ ok: true, result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
```

This endpoint is bearer-token gated (`CRON_SECRET`) and is not currently wired to a real scheduler (separately flagged as P1/Batch E in the remediation plan — out of scope for H0). It is safe to fix the RPC now regardless of whether a scheduler exists yet.

## 3. Expected RPC signatures (from code, not guessed)

| RPC | Signature required by caller |
|---|---|
| `process_iyzico_payment_success` | `(p_order_id uuid, p_provider_payment_id text, p_token text, p_metadata jsonb)` → jsonb |
| `process_iyzico_payment_failure` | `(p_order_id uuid, p_provider_payment_id text, p_token text, p_metadata jsonb)` → jsonb |
| `release_expired_inventory_reservations` | `(p_limit integer)` → jsonb (caller always passes `p_limit`; a default is safe to keep) |

These signatures are already used with named parameters in every call site (`rpc(context, name, { p_order_id, ... })` → Supabase PostgREST RPC call), so the new functions must use **exactly these parameter names** or PostgREST will 404/400 on the call.

## 4. Where the intended definitions live — and the two live-schema traps found

### 4.1 The definitions exist in migration history

Both functions were already written once, in two files applied on `2026-06-16`:

- `supabase/migrations/20260616_inventory_reservation_hardening.sql` — first version of `release_expired_inventory_reservations` (simple: loops active reservations, calls `release_order_inventory`, no order/payment/event writes).
- `supabase/migrations/20260616_payment_bank_and_callback_hardening.sql` (applied "after" the above, per its own header comment) — defines `process_iyzico_payment_success`, `process_iyzico_payment_failure`, and **re-defines** `release_expired_inventory_reservations` with a fuller version that also cancels the order, fails the payment row, and writes an `order_status_events` audit row when a reservation truly expires unpaid.

The fuller version is the intended final behavior (its own migration comment says to apply it after the simpler one, i.e. it is meant to win).

### 4.2 Live-DB root cause: why they are missing

Read-only verification against the live database (not just grepping files) shows:

- `payment_bank_accounts` table (created by the **same** `20260616_payment_bank_and_callback_hardening.sql` file, at line 42, *after* `is_valid_tr_iban` and *before* `process_iyzico_payment_success`) **exists live**.
- `is_valid_tr_iban`, `process_iyzico_payment_success`, and `process_iyzico_payment_failure` (all in the same file) **do not exist live**.
- `release_expired_inventory_reservations` (defined in both 20260616 files) **does not exist live** either.

Conclusion: this migration file was never fully executed as one transaction against production. Only some of its `CREATE TABLE`/`ALTER TABLE` statements ever reached the live database (most likely pasted/run in fragments through the SQL editor rather than as the single `BEGIN…COMMIT` file), while the function bodies further down the file never ran. This matches the pattern already seen elsewhere in this project (untracked migration history, no `supabase_migrations` bookkeeping — confirmed separately in the preflight report). **This is not a case of something being dropped later; it simply never landed.**

This also means the `supabase/rollback/20260616_prelaunch_recovery.sql` script (which only `REVOKE`s execute grants, and explicitly documents itself as manual/never-auto-run) is **not** the cause — it only revokes grants, it never drops a function, and it was never invoked automatically.

### 4.3 Live-DB trap #1: stale `'active'` vocabulary would make a verbatim restore silently break payments forever

`supabase/migrations/20260629_cosmoskin_checkout_bank_transfer_final_fix.sql` later replaced `reserve_order_inventory`, `release_order_inventory`, and `convert_order_inventory` with versions that create and match `inventory_reservations.status = 'reserved'` (not `'active'`). This **is** live today — confirmed by reading the live function bodies directly:

```text
-- live reserve_order_inventory inserts:
insert into public.inventory_reservations(... status ...) values (..., 'reserved', ...)

-- live convert_order_inventory / release_order_inventory both filter:
where order_id = p_order_id and status = 'reserved'
```

The original (never-applied) `process_iyzico_payment_success` body checks:

```sql
SELECT count(*) INTO v_active_count
  FROM public.inventory_reservations
 WHERE order_id = p_order_id AND status = 'active';
```

If we restored this function **verbatim**, it would deploy cleanly but **never find an active reservation** (nothing is ever created with `status = 'active'` anymore), fall into the "0 active, 0 converted" branch, and raise `'Ödeme için aktif veya dönüştürülmüş stok rezervasyonu bulunamadı.'` on every single successful card payment — i.e. the hotfix would look successful (function exists, no 404) but silently keep the payment/inventory path broken with a different error. **The H0 migration must use `status = 'reserved'`, matching the live `convert_order_inventory`/`release_order_inventory` vocabulary**, not the vocabulary in the 2026-06-16 file.

The `inventory_reservations_status_final_chk` CHECK constraint live already allows both `'active'` and `'reserved'` (legacy value kept for compatibility), so this is purely a "which value does the code check" bug, not a constraint bug.

### 4.4 Live-DB trap #2: the fuller `release_expired_inventory_reservations` would violate a live CHECK constraint mid-batch

The fuller 2026-06-16 version of `release_expired_inventory_reservations` inserts into `order_status_events` with `status = 'reservation_expired'` and `event_type = 'reservation_expired'`. Live CHECK constraints on `order_status_events` were read directly:

- `order_status_events_status_final_check` — allowed value list does **not** include `'reservation_expired'`.
- `order_status_events_event_type_final_check` — allowed value list does **not** include `'reservation_expired'` either.

Because the whole RPC body runs as one function invocation, a CHECK violation on that `INSERT` for **any single order** in the batch would raise an exception and roll back the **entire call**, including the inventory releases and order/payment updates already made for every other order processed earlier in the same loop iteration. That would turn a "reservations should expire safely" cron job into a "cron job either does nothing or occasionally rolls back a whole batch" landmine.

Two safe options, both additive:
- **(a)** add `'reservation_expired'` to both `order_status_events` CHECK constraints (they are already `NOT VALID`, i.e. designed to be extended safely), or
- **(b)** reuse an already-allowed status/event_type instead of introducing a new one (e.g. `status_updated`/`updated` for event_type, `cancelled` for status, with the specific reason kept in `metadata`).

**Recommendation: (a)** — it is more auditable (you can tell a "reservation just timed out" event apart from a generic "updated" event in `order_status_events` history), it is additive-only, and both constraints are already `NOT VALID` so extending the allowed list is a low-risk, no-scan change. This does not touch the `orders.fulfillment_status` constraint at all (different table, different gap — see §5).

## 5. The exact CHECK constraint gap around `review_required`

Confirmed live (read directly from `pg_constraint`), not inferred from a migration file:

```text
conname: orders_fulfillment_status_final_chk
def:     CHECK (fulfillment_status = ANY (ARRAY[
           'not_started','unfulfilled','preparing','packed',
           'shipped','delivered','returned','cancelled'
         ]))
```

`'review_required'` is **not** in this list. This constraint is fully validated live (not `NOT VALID`), and is defined identically (missing `review_required`) in three separate migration files (`20260629_cosmoskin_final_user_acceptance_fix.sql`, `_v2.sql`, and `20260629_cosmoskin_checkout_bank_transfer_final_fix.sql`), so this is a real, current, repeatedly-reaffirmed constraint — not a stale leftover that later logic already fixed.

## 6. Which column `review_required` belongs to

`review_required` is written in exactly one place in the codebase:

```352:352:functions/api/iyzico-callback.js
        fulfillment_status: paymentVerifiedButProcessingFailed ? 'review_required' : 'preparing',
```

This is `orders.fulfillment_status`. It is **not** written to `orders.status`, `payments.status`, or `order_status_events.status`/`event_type` anywhere.

Two related, useful facts confirmed live:
- `order_status_events_status_final_check` (a *different* table) **already allows** `'review_required'` as a `status` value — so the `recordStatusEvent(..., 'order_processing_review_required', ...)` call right after this update (line 361) does not fail on `event_type`/`status` grounds; it uses `event_type: 'order_processing_review_required'` which is already allowed. The only broken write is the `orders.fulfillment_status` update itself.
- `orders_status_final_chk` and `payments_status_final_chk` do not need any change for this bug — the code never tries to set `orders.status` or `payments.status` to `review_required`.

So the fix is narrowly: **add `'review_required'` to `orders_fulfillment_status_final_chk` only.** No other constraint on `orders`, `payments`, or `order_status_events` needs to change for this specific bug.

## 7. Proposed safe additive migration (for review — not created yet)

One new file, e.g. `supabase/migrations/20260704_h0_payment_rpc_compat_hotfix.sql`, additive-only, wrapped in a single transaction. Illustrative contents (final file will be written only after approval):

```sql
-- COSMOSKIN H0 — emergency payment/RPC compatibility hotfix.
-- Restores process_iyzico_payment_success / process_iyzico_payment_failure /
-- release_expired_inventory_reservations (never landed live on 2026-06-16),
-- using the CURRENT ('reserved') inventory_reservations vocabulary, and closes
-- the orders.fulfillment_status CHECK gap for 'review_required'.
-- No DROP TABLE. No data mutation outside function bodies (only executes when called later).

BEGIN;

-- 1) Close the orders.fulfillment_status CHECK gap (additive superset; safe to
--    fully validate since the new list is a strict superset of the old one).
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_final_chk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_status_final_chk
  CHECK (fulfillment_status IN (
    'not_started','unfulfilled','preparing','packed',
    'shipped','delivered','returned','cancelled','review_required'
  )) NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_fulfillment_status_final_chk;

-- 2) Allow 'reservation_expired' as an order_status_events audit value
--    (both constraints are already NOT VALID; extend without validating
--    historical rows to avoid an unnecessary full-table scan).
ALTER TABLE public.order_status_events DROP CONSTRAINT IF EXISTS order_status_events_status_final_check;
ALTER TABLE public.order_status_events
  ADD CONSTRAINT order_status_events_status_final_check
  CHECK (status IS NULL OR status IN (
    -- ...exact existing live list unchanged...
    'reservation_expired'
  )) NOT VALID;

ALTER TABLE public.order_status_events DROP CONSTRAINT IF EXISTS order_status_events_event_type_final_check;
ALTER TABLE public.order_status_events
  ADD CONSTRAINT order_status_events_event_type_final_check
  CHECK (event_type IS NULL OR event_type IN (
    -- ...exact existing live list unchanged...
    'reservation_expired'
  )) NOT VALID;

-- 3) process_iyzico_payment_success — same signature/idempotency contract as
--    the 2026-06-16 design, but checking status = 'reserved' (current live
--    vocabulary) instead of the never-live 'active' value.
CREATE OR REPLACE FUNCTION public.process_iyzico_payment_success(
  p_order_id uuid,
  p_provider_payment_id text,
  p_token text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversion jsonb;
  v_converted_count integer := 0;
  v_reserved_count integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'order_id gerekli.', ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('iyzico:' || p_order_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.payment_events e
     WHERE e.provider = 'iyzico' AND e.event_type = 'payment_success' AND e.status = 'processed'
       AND (
         e.order_id = p_order_id
         OR (nullif(trim(p_provider_payment_id), '') IS NOT NULL AND e.provider_payment_id = nullif(trim(p_provider_payment_id), ''))
         OR (nullif(trim(p_token), '') IS NOT NULL AND e.raw_reference = nullif(trim(p_token), ''))
       )
  ) THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false, 'idempotent', true);
  END IF;

  SELECT count(*) INTO v_reserved_count
    FROM public.inventory_reservations
   WHERE order_id = p_order_id AND status = 'reserved';

  IF v_reserved_count > 0 THEN
    v_conversion := public.convert_order_inventory(p_order_id);
  ELSE
    SELECT count(*) INTO v_converted_count
      FROM public.inventory_reservations
     WHERE order_id = p_order_id AND status = 'converted';
    IF v_converted_count = 0 THEN
      RAISE EXCEPTION USING MESSAGE = 'Ödeme için rezerve veya dönüştürülmüş stok rezervasyonu bulunamadı.', ERRCODE = 'P0001';
    END IF;
    v_conversion := jsonb_build_object('ok', true, 'converted', 0, 'deducted', 0, 'idempotent', true, 'previously_converted', v_converted_count);
  END IF;

  INSERT INTO public.payment_events (order_id, provider, provider_payment_id, event_type, status, raw_reference, processed_at, metadata)
  VALUES (p_order_id, 'iyzico', nullif(trim(p_provider_payment_id), ''), 'payment_success', 'processed',
          nullif(trim(p_token), ''), now(), coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('inventory_conversion', v_conversion));

  RETURN jsonb_build_object('ok', true, 'claimed', true, 'idempotent', false, 'conversion', v_conversion);
END;
$$;

-- 4) process_iyzico_payment_failure — unchanged logic vs. 2026-06-16 design;
--    release_order_inventory already operates on 'reserved' live, so no
--    vocabulary fix is needed here (it delegates, it does not filter itself).
CREATE OR REPLACE FUNCTION public.process_iyzico_payment_failure(
  p_order_id uuid,
  p_provider_payment_id text,
  p_token text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_release jsonb;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'order_id gerekli.', ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('iyzico:' || p_order_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.payment_events e
     WHERE e.provider = 'iyzico' AND e.event_type = 'payment_failed' AND e.status = 'processed'
       AND (e.order_id = p_order_id OR (nullif(trim(p_token), '') IS NOT NULL AND e.raw_reference = nullif(trim(p_token), '')))
  ) THEN
    RETURN jsonb_build_object('ok', true, 'claimed', false, 'idempotent', true);
  END IF;

  v_release := public.release_order_inventory(p_order_id, 'payment_failed');

  INSERT INTO public.payment_events (order_id, provider, provider_payment_id, event_type, status, raw_reference, processed_at, metadata)
  VALUES (p_order_id, 'iyzico', nullif(trim(p_provider_payment_id), ''), 'payment_failed', 'processed',
          nullif(trim(p_token), ''), now(), coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('inventory_release', v_release));

  RETURN jsonb_build_object('ok', true, 'claimed', true, 'idempotent', false, 'release', v_release);
END;
$$;

-- 5) release_expired_inventory_reservations — fuller behavior (order/payment
--    finalization + audit trail), but checking status = 'reserved' and
--    guarding paid orders exactly like the 2026-06-16 design intended.
CREATE OR REPLACE FUNCTION public.release_expired_inventory_reservations(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_release jsonb;
  v_orders integer := 0;
  v_skipped_paid integer := 0;
BEGIN
  FOR v_order IN
    SELECT r.order_id, min(r.expires_at) AS expires_at
      FROM public.inventory_reservations r
      JOIN public.orders o ON o.id = r.order_id
     WHERE r.status = 'reserved'
       AND r.expires_at <= now()
       AND r.order_id IS NOT NULL
       AND coalesce(o.payment_status, 'pending') NOT IN ('paid','refunded','partially_refunded')
       AND o.status IN ('pending_payment','pending_bank_transfer','payment_failed','cancelled')
     GROUP BY r.order_id
     ORDER BY min(r.expires_at), r.order_id
     LIMIT greatest(1, least(coalesce(p_limit, 100), 1000))
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('expiry:' || v_order.order_id::text, 0));

    IF EXISTS (SELECT 1 FROM public.orders WHERE id = v_order.order_id AND payment_status IN ('paid','refunded','partially_refunded')) THEN
      v_skipped_paid := v_skipped_paid + 1;
      CONTINUE;
    END IF;

    v_release := public.release_order_inventory(v_order.order_id, 'reservation_expired');

    UPDATE public.orders
       SET status = CASE WHEN status IN ('pending_payment','pending_bank_transfer') THEN 'cancelled' ELSE status END,
           payment_status = CASE WHEN payment_status IN ('pending','initiated','awaiting_transfer') THEN 'failed' ELSE payment_status END,
           fulfillment_status = CASE WHEN fulfillment_status IN ('not_started','preparing') THEN 'cancelled' ELSE fulfillment_status END,
           cancelled_at = coalesce(cancelled_at, now()),
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reservation_expired_at', now(), 'inventory_release', v_release)
     WHERE id = v_order.order_id AND payment_status NOT IN ('paid','refunded','partially_refunded');

    UPDATE public.payments SET status = 'failed', updated_at = now()
     WHERE order_id = v_order.order_id AND status IN ('initiated','awaiting_transfer');

    INSERT INTO public.order_status_events (order_id, status, event_type, previous_status, new_status, source, created_by, message, note, metadata)
    VALUES (v_order.order_id, 'reservation_expired', 'reservation_expired', NULL, 'cancelled', 'inventory', 'reservation_expiry_job',
            'Ödeme süresi dolduğu için stok rezervasyonu serbest bırakıldı.', 'Ödenmiş siparişler bu işlemden hariç tutulur.',
            jsonb_build_object('expired_at', v_order.expires_at, 'inventory_release', v_release));

    v_orders := v_orders + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'orders_processed', v_orders, 'paid_orders_skipped', v_skipped_paid);
END;
$$;

REVOKE ALL ON FUNCTION public.process_iyzico_payment_success(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_iyzico_payment_failure(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_inventory_reservations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_iyzico_payment_success(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_iyzico_payment_failure(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_expired_inventory_reservations(integer) TO service_role;

COMMIT;
```

No `DROP TABLE`, no `DELETE`, no `UPDATE` against existing data outside function bodies (the `UPDATE`/`INSERT` statements only execute later, when the RPC is actually called by the application). Everything is `CREATE OR REPLACE FUNCTION` (safe re-run) or `ADD CONSTRAINT` guarded by `DROP CONSTRAINT IF EXISTS` first (safe re-run).

## 8. Idempotency and advisory-lock strategy

- **`process_iyzico_payment_success` / `_failure`**: unchanged from the 2026-06-16 design — `pg_advisory_xact_lock(hashtextextended('iyzico:' || order_id, 0))` serializes concurrent callback retries for the same order, then a `payment_events` existence check (`provider='iyzico'`, matching `event_type`+`status='processed'`, matched by `order_id` OR `provider_payment_id` OR `raw_reference`/token) makes a second identical callback a no-op (`claimed:false, idempotent:true`) instead of re-converting inventory or double-writing.
- **`release_expired_inventory_reservations`**: outer loop takes a per-order advisory lock (`'expiry:' || order_id`) before mutating, and re-checks `payment_status` inside the lock (protects against a payment callback landing concurrently with the expiry sweep — "paid-order skip" is re-verified after acquiring the lock, not just in the outer `WHERE`). Re-running the RPC is safe: once a reservation is `released`/`converted`/order is `cancelled`, it no longer matches the `WHERE r.status = 'reserved'` filter, so it's never processed twice.
- **Lock key namespaces do not collide** with Batch 4 loyalty locks, which use `'loyalty:award:'`, `'loyalty:promote:'`, `'loyalty:reverse:'` prefixes (confirmed by reading `20260704_batch4_loyalty_ledger.sql`) — verified distinct from `'iyzico:'` and `'expiry:'`.

## 9. Compatibility with Batch 4 loyalty RPCs

- No table, column, or function this hotfix touches is written by any Batch 4 loyalty RPC (`cosmoskin_award_loyalty_for_order`, `cosmoskin_promote_loyalty_for_order`, `cosmoskin_reverse_loyalty_for_order`, `cosmoskin_loyalty_balance_for_user`) — those operate on `loyalty_points_ledger`, `customer_membership_status`, `customer_membership_history`.
- `awardOrderPoints(context, orderId)` (the JS wrapper) is called from `finalizeCommerceAfterPayment()` in `iyzico-callback.js`, **after** `process_iyzico_payment_success` runs and **after** `orders.status`/`fulfillment_status` are updated — this ordering is unchanged by H0. Fixing `process_iyzico_payment_success` does not change when or how the loyalty hook fires; it only makes the inventory-conversion step that currently throws actually succeed, so the order now correctly ends up `status='paid'`, `fulfillment_status='preparing'` (not `review_required`) on the happy path, exactly as loyalty accrual already assumes.
- No advisory lock, CHECK constraint, or RPC name collision with Batch 4 (verified: Batch 4 does not touch `orders_fulfillment_status_final_chk`, `order_status_events` constraints, `inventory_reservations`, or `payment_events`).

## 10. Confirmed non-interference with excluded surfaces

- **Checkout UI**: not touched — `checkout.html`/checkout JS never call any of the three RPCs; `reserve_order_inventory` (checkout's own RPC) is untouched by this plan.
- **Iyzico refund API**: not touched — no refund endpoint calls these three RPCs; refunds are a separate, still-manual flow per prior batches.
- **Admin behavior**: not touched — `functions/api/admin/orders.js` never calls `process_iyzico_payment_success`/`_failure`; its bank-transfer `mark_payment_paid` path is entirely separate and untouched. `VALID_FULFILLMENT` in that file is also left alone (admin never writes `review_required`, so it does not need the new value).
- **Loyalty UI**: not touched — no frontend or account API file is part of this migration.
- **Customer cancellation flow (Batch 3)**: not touched — `functions/api/account/orders/[id]/cancel.js` and `functions/api/_lib/order-cancellation.js` do not reference any of the three RPCs or the `orders_fulfillment_status_final_chk` constraint's value list beyond values already allowed.
- **Returns**: not touched — no return-flow file references these RPCs.

## 11. Exact files to create/modify

**Create (new, additive-only):**
- `supabase/migrations/20260704_h0_payment_rpc_compat_hotfix.sql` — the migration in §7.
- `supabase/verification/20260704_h0_payment_rpc_compat_verification.sql` — read-only `SELECT`/`to_regprocedure` checks (see §12), mirroring the existing `supabase/verification/20260616_prelaunch_verification.sql` pattern, extended to check the `'reserved'` vocabulary and the `review_required` constraint value specifically.
- `scripts/validate-h0-payment-rpc-hotfix.mjs` — see §12.
- `COSMOSKIN_H0_PAYMENT_RPC_HOTFIX_REPORT_20260704.md`, `COSMOSKIN_H0_PAYMENT_RPC_HOTFIX_CHANGED_FILES_20260704.txt`, `COSMOSKIN_H0_PAYMENT_RPC_HOTFIX_SUPABASE_NOTES_20260704.md` — deliverables, at implementation time.

**No existing files modified.** `functions/api/iyzico-callback.js` and `functions/api/cron/release-expired-inventory.js` already call the RPCs with the correct names/signatures — nothing in application code needs to change for H0. (`is_valid_tr_iban` is not restored by H0 — it is only used for validating bank IBANs in an admin/bank-account-management surface, not on the payment success/failure path; it is out of scope for an emergency payment hotfix and should be picked up, if still needed, under the existing Batch F migration-reconciliation work.)

## 12. Validation script needed

`scripts/validate-h0-payment-rpc-hotfix.mjs` (static, no DB connection required — mirrors the pattern of `validate-account-batch-3/4-*.mjs`) must fail if:

- The new migration file is missing, or does not contain `CREATE OR REPLACE FUNCTION public.process_iyzico_payment_success`, `process_iyzico_payment_failure`, and `release_expired_inventory_reservations`.
- The migration checks `inventory_reservations.status = 'active'` anywhere inside `process_iyzico_payment_success` or `release_expired_inventory_reservations` bodies (must be `'reserved'` — regression guard against reintroducing the stale-vocabulary bug from §4.3).
- The migration does not add `'review_required'` to the `orders_fulfillment_status_final_chk` definition.
- The migration does not add `'reservation_expired'` to both `order_status_events_status_final_check` and `order_status_events_event_type_final_check`.
- The migration contains any `DROP TABLE`, bare `TRUNCATE`, or an `UPDATE`/`DELETE` against `orders`/`payments`/`inventory_reservations` outside a `CREATE FUNCTION ... AS $$ ... $$` body.
- `pg_advisory_xact_lock` calls are missing from `process_iyzico_payment_success`, `process_iyzico_payment_failure`, or the per-order loop in `release_expired_inventory_reservations`.
- `functions/api/iyzico-callback.js`, `functions/api/cron/release-expired-inventory.js`, `functions/api/admin/orders.js`, or any checkout/refund/loyalty/account-cancellation file is modified by this batch (diff-based guard, same style as the Batch 3/4 validators).
- Batch 1, 2, 3, 4 validators fail (chained, same pattern already used).

A live-DB verification script (`supabase/verification/20260704_h0_payment_rpc_compat_verification.sql`) should additionally assert, via `to_regprocedure(...)`, that all three functions now resolve, and via `pg_get_constraintdef` that `orders_fulfillment_status_final_chk` contains `review_required`. This is a read-only `SELECT`-only script to be run manually against Supabase after the migration — never auto-run, matching the existing `20260616_prelaunch_verification.sql` convention.

## 13. Tests to run (at implementation time)

```bash
node --check functions/api/iyzico-callback.js
node --check functions/api/cron/release-expired-inventory.js
node scripts/validate-h0-payment-rpc-hotfix.mjs
node scripts/validate-account-batch-1-safe-fixes.mjs
node scripts/validate-account-batch-3-order-cancellation.mjs
node scripts/validate-account-batch-4-loyalty-ledger.mjs
node scripts/validate-account-ui-polish.mjs
node scripts/validate-account-runtime-hotfix.mjs
node scripts/validate-account-experience-final-polish.mjs
node scripts/validate-checkout-payment-email-e2e.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

`tests/local-integration.test.mjs` already asserts (statically) that `20260616_payment_bank_and_callback_hardening.sql` contains `process_iyzico_payment_success` + `pg_advisory_xact_lock` + the correct `REVOKE`/`GRANT` lines (lines 174-180 of that test file) — since H0 does not delete or edit that historical migration file, those assertions keep passing unchanged. The new migration is purely additive alongside it.

## 14. Manual Supabase run order

1. Take a fresh Supabase point-in-time/manual backup note (project already has automated backups; record the timestamp before running).
2. Run `supabase/migrations/20260704_h0_payment_rpc_compat_hotfix.sql` as **one transaction** via the Supabase SQL editor (paste the entire file, including `BEGIN`/`COMMIT`, in a single execution — do not split it into fragments, since fragment-by-fragment execution is the exact failure mode that caused this incident on 2026-06-16).
3. Run `supabase/verification/20260704_h0_payment_rpc_compat_verification.sql` (read-only) and confirm all three `to_regprocedure(...)` calls resolve (non-null) and the `orders_fulfillment_status_final_chk` definition includes `review_required`.
4. Place one **manual test order** end-to-end on the live card (Iyzico sandbox/test card if available, otherwise a real minimal-amount card transaction) and confirm: `payments.status='paid'`, `orders.status='paid'`, `orders.fulfillment_status='preparing'` (not `review_required`), an `inventory_reservations` row with `status='converted'`, and no `inventory_processing_error` in `orders.metadata`.
5. Manually invoke `POST /api/cron/release-expired-inventory` (with `CRON_SECRET`) against a known-expired unpaid test reservation and confirm `orders_processed` increments and the order/payment/inventory rows update as expected, with an `order_status_events` row of `status='reservation_expired'` written successfully (no CHECK violation).
6. Only after both live checks pass, consider wiring a real scheduler to the cron endpoint (that wiring itself is out of scope for H0 — tracked separately as Batch E).

## 15. Rollback plan

- **Function rollback (safe, non-destructive):** `REVOKE ALL ON FUNCTION public.process_iyzico_payment_success(uuid,text,text,jsonb), public.process_iyzico_payment_failure(uuid,text,text,jsonb), public.release_expired_inventory_reservations(integer) FROM service_role;` — this immediately stops the RPCs from being callable (Iyzico callback falls back to its existing `catch` path, marking the order `review_required` instead of crashing) without deleting the function definitions, so a fix-forward re-grant is instant.
- **Constraint rollback:** `ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_final_chk; ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_status_final_chk CHECK (fulfillment_status IN ('not_started','unfulfilled','preparing','packed','shipped','delivered','returned','cancelled')) NOT VALID;` — reverts to the pre-H0 list. Only do this if `review_required` itself is judged to be causing a new problem; note that reverting this while any live row already has `fulfillment_status='review_required'` will fail validation, so pair with `NOT VALID` (skip-validate) rather than a full `VALIDATE CONSTRAINT` if rolling back.
- **`order_status_events` constraint rollback:** re-run with `'reservation_expired'` removed from both lists; since both constraints are already `NOT VALID` live, this is a no-scan, low-risk change either direction.
- Do not drop `payment_events`, `inventory_reservations`, `orders`, or `payments` rows during rollback — they contain production audit/financial data (same guidance as the existing `20260616_prelaunch_recovery.sql` rollback doc).
- If a rollback is executed, immediately re-check whether any orders processed during the "fixed" window need manual reconciliation (compare `payment_events` rows created during the window against `orders.fulfillment_status`/`inventory_reservations.status` for consistency) before re-attempting the fix.

---

## Summary of what H0 fixes vs. what it explicitly does not

| In scope | Out of scope (unchanged) |
|---|---|
| Recreate `process_iyzico_payment_success` (fixed to use `'reserved'` vocabulary) | Bank-transfer `mark_payment_paid` admin path (already working, untouched) |
| Recreate `process_iyzico_payment_failure` (same fix pattern; also missing live) | `is_valid_tr_iban` / bank account admin validation (separate, non-blocking) |
| Recreate `release_expired_inventory_reservations` (fixed to use `'reserved'` vocabulary + safe audit-event values) | Wiring a real scheduler to `/api/cron/release-expired-inventory` (Batch E) |
| Add `review_required` to `orders_fulfillment_status_final_chk` | Any other `orders`/`payments` CHECK constraint value |
| Add `reservation_expired` to both `order_status_events` CHECK constraints | Checkout UI, Iyzico refund API, admin UI/behavior, loyalty UI, Batch 3 cancellation flow, returns |

Stop here — no files created/edited beyond this plan document, no SQL executed, no live database or Cloudflare/Supabase policy changes made. Awaiting approval to implement H0.
