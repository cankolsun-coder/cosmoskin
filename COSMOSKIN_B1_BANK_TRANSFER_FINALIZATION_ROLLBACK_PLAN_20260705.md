# COSMOSKIN — B1: Bank Transfer Approval Finalization — Rollback Plan

**Date:** 2026-07-05

## Why rollback is low-risk here

Every change in this batch is pure application code — **no migration, no SQL, no schema change, no new CHECK-constraint value, no `admin_users`/`admin_permissions` row.** The only new *data* this batch ever writes is: a `payments.status` update to an already-valid `'paid'` value, a new `payment_events` row using a table and column set the card-payment RPC already writes to (just a new, clearly-namespaced `event_type`), an `orders.payment_status` update (defensive, already `paid` in the primary call path), and — via the pre-existing, unmodified `finalizeCommerceAfterPayment()` — a `coupon_redemptions` status update and/or an `invoice_records` insert, both using logic that already existed and already ran for card payments before this batch. Rolling back the code does not require reversing any of these writes: they are all safe, terminal, correct states for an order that a human admin has genuinely approved as paid (see "What rollback does NOT need to touch" below).

---

## Scenario 1 — Bank-transfer approval throws an error, 500s, or otherwise fails after deploy

**Most likely causes, in order of likelihood:**
1. The A1.2b Cloudflare Access / `orders:update` permission precondition is not actually satisfied for the approving admin — this predates B1 entirely (same root-cause class as every A1.2 batch's Scenario 1) and would also block a *plain* order status change, not just bank-transfer approval.
2. An unexpected `payments`/`orders` row shape in production (e.g. an order somehow has no `payments` row at all for `provider: 'bank_transfer'`) that wasn't exercised by the mocked test harness. `confirmManualBankTransferPayment()` is written defensively (guards `payment == null`, wraps its Supabase calls, and the calling routes already wrap the helper call in `try { ... } catch (error) { console.error(...) }` so a helper failure cannot crash the request or block the underlying order-status update that already succeeded).
3. A genuinely new Supabase-side issue unrelated to this batch (network, auth, quota).

**Fastest safe mitigation — the helper call is already fail-soft by design:**

Because `confirmManualBankTransferPayment()` is invoked *after* the existing order-status update already commits, and both call sites wrap it in `try/catch`, a failure inside the helper does **not** prevent the admin's "mark paid" action from taking effect on the order itself — it only means the *extra* finalization (payments row, payment_events, coupon, invoice, shipment shell) didn't happen for that one order. If this is observed:

1. Confirm the order's core status change (visible in the admin UI / `orders` table) still succeeded — if yes, this is a **degraded, not broken**, state; no user-facing incident.
2. Check server logs for the `console.error(...)` line emitted by the helper's catch block to identify the specific failure.
3. If the failure is systemic (affects every bank-transfer approval, not just one order), proceed to Scenario 2 (full rollback) rather than debugging in production.
4. If the failure is order-specific (e.g. one malformed legacy order), the finalization can be safely re-run later once the underlying data issue is fixed — `confirmManualBankTransferPayment()` is idempotent and safe to call again for that order at any time (manually, or by having the admin click "approve" again once the order's `payment_status` is still not `paid`).

---

## Scenario 2 — Full rollback of the B1 code

If the cause is unclear, or a fast, complete revert is preferred over per-order diagnosis:

```bash
git checkout <pre-B1-commit-sha> -- \
  functions/api/_lib/commerce-finalization.js \
  functions/api/iyzico-callback.js \
  "functions/api/admin/orders.js" \
  "functions/api/admin/orders/[id]/status.js"
```

`functions/api/_lib/commerce-finalization.js` did not exist before B1 — `git checkout <pre-B1-sha> --` on a file that didn't exist at that commit will fail/no-op; instead simply delete it:

```bash
rm functions/api/_lib/commerce-finalization.js
```

**Important:** if you delete `commerce-finalization.js` and revert `iyzico-callback.js` to its pre-B1 version, both changes must be applied together — the pre-B1 `iyzico-callback.js` defines `finalizeCommerceAfterPayment`/`ensureShipmentShell` locally again (no import needed), while the current version imports them from the now-deleted shared file. Reverting only one of the two will break the card-payment callback.

Or, if this batch was committed as its own commit (or small set of commits):

```bash
git revert <B1-commit-sha(s)>
```

Either approach is a clean, complete, data-free rollback of B1's code. Redeploy immediately after.

**Note on the validator scripts** (`validate-a1-admin-rbac-hardening.mjs`, `validate-a1-admin-endpoint-coverage.mjs`, `validate-h2-return-attachment-preview.mjs`, `validate-h1-return-attachment-storage-rls.mjs`, `validate-account-batch-4-loyalty-ledger.mjs`) whose scope-guard lists were updated to permit B1's legitimate changes: these do **not** need to be reverted even if the 4 route/helper files above are rolled back. The list adjustments only *permit* those files to differ from a stale baseline going forward — reverting the route files to their pre-B1 state simply means the validators see a zero diff on those paths again and continue to pass, same as before this batch. Leaving `scripts/validate-b1-bank-transfer-finalization.mjs` in place after a rollback is also safe — it will start failing (since the files it checks no longer match its expectations), which is the correct signal that B1 is not currently active; delete or ignore it until B1 is re-applied.

---

## What rollback does NOT need to touch

- **No `supabase/migrations/*.sql` file was added by this batch** — nothing to reverse in the database, ever, under any scenario.
- **No `admin_users` or `admin_permissions` row was written by this batch.**
- Any `payments`/`payment_events`/`coupon_redemptions`/`invoice_records`/`shipments` rows already written by `confirmManualBankTransferPayment()` for orders approved *before* the rollback do **not** need to be reversed or cleaned up — they represent a real, correct admin approval action and are the same category of data a card payment would have produced. Rolling back the code only stops *new* approvals from getting this extra finalization; it does not and should not undo finalization that already happened correctly.
- `functions/api/_lib/admin-audit.js` (RBAC core helper) was **not modified** by B1 at all — no action needed here under any B1 rollback scenario.
- `functions/api/_lib/loyalty-ledger.js`, `functions/api/_lib/coupons.js` (unrelated coupon module) — not modified by B1, no rollback needed.
- `functions/api/returns.js`, `functions/api/_lib/return-attachments.js` (customer return flow) — not modified by B1, no rollback needed.
- The `mark_bank_transfer_not_received` rejection/cancellation block in `admin/orders.js`, `assertOperationalTransition()`, and the `cancelled`-status branch in `admin/orders/[id]/status.js` — not modified by B1 (proven byte-identical to `HEAD` by the B1 validator), no rollback needed.
- Checkout UI, payment RPC SQL, H0/H1/H2/A1 business logic — untouched by B1, no rollback needed.

---

## Verification after any rollback

```bash
node --check functions/api/iyzico-callback.js
node --check "functions/api/admin/orders.js"
node --check "functions/api/admin/orders/[id]/status.js"
node scripts/validate-a1-admin-rbac-hardening.mjs
node scripts/validate-a1-admin-endpoint-coverage.mjs
node scripts/validate-h2-return-attachment-preview.mjs
node scripts/validate-h1-return-attachment-storage-rls.mjs
node scripts/validate-h0-live-payment-rpc-hotfix.mjs
node scripts/validate-account-batch-1-safe-fixes.mjs
node scripts/validate-account-batch-3-order-cancellation.mjs
node scripts/validate-account-batch-4-loyalty-ledger.mjs
node scripts/validate-account-ui-polish.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

Note: after a rollback, `scripts/validate-b1-bank-transfer-finalization.mjs` will correctly **fail** (missing shared helper file / missing wiring) — that is its intended purpose as a regression guard for the B1 fix, not a rollback-compatibility check. A failing B1 validator immediately after an intentional rollback is expected; treat it as a reminder to re-apply B1 once the underlying cause is resolved, rather than as a new bug. Do not run it as part of post-rollback verification — it is listed above only to confirm every *other* validator (which must all still pass, since none of them depend on B1 being present) is unaffected.

Also note the 8 B1-specific tests in `tests/local-integration.test.mjs` will fail for the same reason after a rollback — expected, same treatment. All pre-existing (non-B1) tests in that file are unaffected by a B1-only rollback, since they exercise different files/behavior entirely.
