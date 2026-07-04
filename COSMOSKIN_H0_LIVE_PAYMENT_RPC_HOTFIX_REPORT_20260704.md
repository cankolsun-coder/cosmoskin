# COSMOSKIN — H0 Emergency Live DB Payment/RPC Compatibility Hotfix — REPORT

Date: 2026-07-04
Status: **Implemented, validated locally. Not yet run against the live database — see the Supabase runbook for the manual run procedure.**
Source of truth for design decisions: `COSMOSKIN_H0_EMERGENCY_PAYMENT_RPC_HOTFIX_PLAN_20260704.md`

## 1. What was broken

Three RPCs called by production Cloudflare Functions code did not exist in the live Supabase database:

| RPC | Called from | Effect of being missing |
|---|---|---|
| `process_iyzico_payment_success` | `functions/api/iyzico-callback.js` (success path) | Every successful Iyzico card payment threw inside a `try/catch`, forcing `orders.fulfillment_status = 'review_required'` — which itself violated a CHECK constraint, so the order was left in an inconsistent, unconverted-inventory state despite `payments.status = 'paid'`. |
| `process_iyzico_payment_failure` | `functions/api/iyzico-callback.js` (failure path) | Declined/failed card payments could not release their reserved inventory or reserved coupon redemption through this path. |
| `release_expired_inventory_reservations` | `functions/api/cron/release-expired-inventory.js` | Any future scheduled sweep of abandoned/expired unpaid reservations would fail outright. |

Root cause (confirmed by direct, read-only inspection of the live database before writing any SQL): `supabase/migrations/20260616_payment_bank_and_callback_hardening.sql` never fully executed against production. Proof: `payment_bank_accounts` (an earlier statement in that same file) exists live; `is_valid_tr_iban`, `process_iyzico_payment_success`, and `process_iyzico_payment_failure` (all later in the same file) do not. This was not something dropped later — it never landed.

Bank-transfer paid orders were and are unaffected — `functions/api/admin/orders.js`'s `mark_payment_paid` path never calls any of these three RPCs.

## 2. What was fixed

One new, additive-only migration: `supabase/migrations/20260704_h0_live_payment_rpc_hotfix.sql`.

1. **`orders.fulfillment_status` CHECK constraint** — added `'review_required'` to `orders_fulfillment_status_final_chk`, the only value the codebase (`iyzico-callback.js`, unmodified) writes that wasn't already allowed. All 8 previously-allowed values (`not_started`, `unfulfilled`, `preparing`, `packed`, `shipped`, `delivered`, `returned`, `cancelled`) are preserved unchanged.
2. **`process_iyzico_payment_success(uuid, text, text, jsonb)`** — recreated, but **not verbatim** from the 2026-06-16 design: the original checks `inventory_reservations.status = 'active'`, a value nothing has written since `20260629_cosmoskin_checkout_bank_transfer_final_fix.sql` redefined the reservation lifecycle to use `'reserved'` → `'converted'`/`'released'`. Restoring the old body verbatim would have deployed cleanly but silently broken every card payment forever (0 reservations ever found → exception on every call). The hotfix checks `status = 'reserved'` instead, matching the live `convert_order_inventory`/`release_order_inventory` bodies (read directly from the database before writing this migration).
3. **`process_iyzico_payment_failure(uuid, text, text, jsonb)`** — recreated with the same idempotency shape, plus two additions beyond the original 2026-06-16 design:
   - A defensive guard: if `orders.payment_status` is already `paid`/`refunded`/`partially_refunded`, the function returns immediately without touching inventory/coupons/payment_events, protecting against an out-of-order failure webhook arriving after a success webhook already finalized the order.
   - A coupon-redemption release: `functions/api/create-checkout.js` already releases `coupon_redemptions` (`status: 'reserved' → 'released'`) when payment *initialization* fails synchronously, but the Iyzico *callback* failure branch (a card actually being declined later) had no equivalent release. Since JS files were out of scope for this batch, this gap is closed inside the RPC itself, using the exact same `'released'` status value already used by Batch 3 and `create-checkout.js` — no new status value introduced.
4. **`release_expired_inventory_reservations(integer)`** — recreated using the fuller 2026-06-16 design (cancels the order, fails the payment row, writes an audit event) but with two corrections:
   - `status = 'reserved'` instead of `'active'` (same vocabulary fix as above).
   - The audit-trail `order_status_events` row uses `status = 'stock_released'` / `event_type = 'stock_released'` — both **already allowed** by the live CHECK constraints — instead of introducing a new `'reservation_expired'` enum value. The specific reason (`reservation_expired`) is preserved in `metadata.reason` and the `note` column. This means **no `order_status_events` CHECK constraint had to be touched at all**, which is a narrower, safer change than the plan document's originally-recommended option of widening that constraint.

## 3. Idempotency and concurrency

- `process_iyzico_payment_success` / `_failure`: `pg_advisory_xact_lock(hashtextextended('iyzico:' || order_id, 0))` serializes retries of the same order; a `payment_events` existence check (matched by `order_id` OR `provider_payment_id` OR `raw_reference`/token) makes a repeated identical callback a safe no-op (`claimed: false, idempotent: true`).
- `release_expired_inventory_reservations`: per-order `pg_advisory_xact_lock('expiry:' || order_id)`, with the paid-order check re-verified *inside* the lock (protects against a payment callback landing concurrently with the expiry sweep). Reservations that are already `released`/`converted`, or orders already `cancelled`, no longer match the sweep's `WHERE` clause, so re-running the RPC never double-processes them.
- Lock key namespaces (`'iyzico:'`, `'expiry:'`) do not collide with Batch 4's loyalty locks (`'loyalty:award:'`, `'loyalty:promote:'`, `'loyalty:reverse:'`), confirmed by reading `20260704_batch4_loyalty_ledger.sql`.

## 4. Batch 4 loyalty compatibility

No table, constraint, or RPC that Batch 4 depends on is touched by this migration. `awardOrderPoints()` (unmodified) is still called by `finalizeCommerceAfterPayment()` in `iyzico-callback.js`, **after** `orders.payment_status` is set to `'paid'` — the correct point in time for `cosmoskin_award_loyalty_for_order()` to actually award anything (it requires `payment_status = 'paid'`).

`process_iyzico_payment_success` deliberately does **not** call the loyalty RPC itself: at the moment it runs (before the caller's own `orders` update), `payment_status` is not yet `'paid'`, so a call from inside this RPC would always no-op. Adding a no-op call would be misleading dead code, so it was intentionally omitted and documented instead — this satisfies "must not fail if the loyalty RPC doesn't exist yet" trivially, since the RPC is never called from here. `cosmoskin_award_loyalty_for_order` is itself idempotent (unique `transaction_reference`, `ON CONFLICT DO NOTHING`), so there is no migration-ordering requirement between this file and Batch 4's migration in either direction.

## 5. Scope confirmation

Nothing outside `supabase/migrations/`, `scripts/`, and the 4 root-level `COSMOSKIN_H0_*` docs was created or modified. Confirmed by `git status`/`git diff` before and after, and enforced going forward by `scripts/validate-h0-live-payment-rpc-hotfix.mjs`, which fails the build if any of the following are touched: checkout UI/API, Iyzico refund logic, Batch 3 customer-cancellation files, returns, RBAC, or any RLS/storage-policy file.

## 6. Tests run

```
node scripts/validate-h0-live-payment-rpc-hotfix.mjs        → PASS
node scripts/validate-account-batch-1-safe-fixes.mjs         → PASS
node scripts/validate-account-batch-3-order-cancellation.mjs → PASS
node scripts/validate-account-batch-4-loyalty-ledger.mjs     → PASS
node scripts/validate-account-ui-polish.mjs                  → PASS
node scripts/validate-account-runtime-hotfix.mjs             → PASS
node scripts/validate-account-experience-final-polish.mjs    → PASS
node scripts/validate-checkout-payment-email-e2e.mjs         → PASS (10 scoped runtime files, 8 email previews)
node scripts/validate-production-launch-readiness.mjs        → PASS (19 critical pages, 37 product pages, 26 migrations)
node --test tests/local-integration.test.mjs                 → PASS (20/20 tests)
node --check functions/api/iyzico-callback.js                → PASS (unmodified, sanity-checked)
node --check functions/api/cron/release-expired-inventory.js → PASS (unmodified, sanity-checked)
```

All green. No existing test needed modification — `tests/local-integration.test.mjs`'s static assertions about `20260616_payment_bank_and_callback_hardening.sql` still pass unchanged because that historical file was left in place; H0 is a purely additive, separate migration.

## 7. What H0 explicitly did not do (by design)

- Did not modify checkout UI, the checkout API, or the Iyzico refund/admin-refund flow.
- Did not modify Batch 3 customer cancellation behavior or files.
- Did not modify returns, RBAC, or any storage/RLS policy.
- Did not restore `is_valid_tr_iban` (bank-account IBAN validator — unrelated to the payment/RPC path, out of scope for an emergency payment hotfix; still tracked separately under the existing Batch F migration-reconciliation work).
- Did not wire a real scheduler to `/api/cron/release-expired-inventory` (tracked separately as Batch E).
- Did not run any SQL against the live database. See the runbook for the manual execution procedure.

## 8. Next step

This hotfix is code-complete and fully validated locally. It must be run manually against the live Supabase project per `COSMOSKIN_H0_LIVE_PAYMENT_RPC_HOTFIX_SUPABASE_RUNBOOK_20260704.md` before the fix takes effect in production. No further batches (H1 or otherwise) were started.
