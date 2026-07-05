# COSMOSKIN B2 — Bank Transfer Rejection / Cancellation Finalization — Implementation Report

**Date:** 2026-07-05
**Scope:** B2 only (Bank Transfer Rejection / Cancellation Finalization), per `COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_PLAN_20260705.md`.
**Status:** Implemented, tested, validated. **Not deployed.** See production deploy warning at the end of this report.

---

## 1. Exact files changed

### Modified by B2

| File | Change |
|---|---|
| `functions/api/_lib/commerce-finalization.js` | Added new export `rejectManualBankTransferPayment(context, orderId, opts)`. No existing export (`confirmManualBankTransferPayment`, `finalizeCommerceAfterPayment`, `ensureShipmentShell`) was edited — verified by the B2 validator's "no B2 token leaks into B1 function bodies" check. |
| `functions/api/admin/orders.js` | `mark_bank_transfer_not_received` block now calls `rejectManualBankTransferPayment()` for `bank_transfer` orders (replacing the two inline `releaseInventoryReservations`/`coupon_redemptions` calls for that case); the rejection email send is now gated on the helper's `idempotent`/`blocked` result; response now includes `bank_transfer_rejection`. Non-`bank_transfer` orders keep the exact prior inline behavior (defensive fallback branch, not expected to be reachable via the current UI). |
| `functions/api/admin/orders/[id]/status.js` | `body.status === 'cancelled' && current.payment_method === 'bank_transfer'` now calls `rejectManualBankTransferPayment()`; response now includes `bank_transfer_rejection`. Also fixed a pre-existing gap: the `order_status_events` insert now sets `created_by: getAccessEmail(context) || 'admin'` (previously this field was omitted entirely for **every** status change made through this route, not just rejections). |
| `scripts/validate-b1-bank-transfer-finalization.mjs` | Removed the two byte-identical-to-HEAD assertions that pinned the `mark_bank_transfer_not_received` block and the `cancelled`-status branch — those assertions existed specifically because B1 was forbidden from touching rejection; B2 legitimately owns that code now. All other B1 protections (helper extraction proof, `confirmManualBankTransferPayment` structural checks, `assertOperationalTransition`/paid-order-guard byte-identical checks, chained validators) are untouched and still enforced. |
| `tests/local-integration.test.mjs` | Added 14 new/updated tests (see §16). |

### Created by B2

| File | Purpose |
|---|---|
| `scripts/validate-b2-bank-transfer-rejection-finalization.mjs` | New guardrail for this batch (see §10 of the plan / §15 below). |
| `COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_REPORT_20260705.md` | This report. |
| `COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_CHANGED_FILES_20260705.txt` | Flat changed-files list. |
| `COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_RUNBOOK_20260705.md` | Preview verification runbook. |
| `COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_ROLLBACK_PLAN_20260705.md` | Rollback plan. |

### Explicitly NOT changed by B2

- `functions/api/iyzico-callback.js` — zero changes; still only imports `finalizeCommerceAfterPayment`/`ensureShipmentShell`, never `confirmManualBankTransferPayment` or `rejectManualBankTransferPayment`.
- `functions/api/_lib/email-events.js` — the `EMAIL_TYPES` mislabeling bug found during B2 planning was **not** fixed in this batch (see §13).
- No `supabase/migrations/*.sql` file was created or modified; no SQL was run.
- `functions/api/admin/orders.js`'s `cancel_order` action — deliberately left unwired (see §9).
- `assertOperationalTransition()` and the paid-order direct-cancel 409 guard in both admin route files — untouched.

---

## 2. Current rejection/cancellation behavior: before vs. after

| Behavior | Before B2 | After B2 |
|---|---|---|
| `payments` table update on rejection | **No** — stayed at `awaiting_transfer`/`initiated` forever | **Yes** — `status: 'failed'` |
| `payment_events` row on rejection | **No** — zero audit trail | **Yes** — `event_type: 'bank_transfer_payment_rejected'`, `provider: 'bank_transfer'`, includes rejector identity + inventory/coupon release summary in `metadata` |
| `orders.payment_status` on rejection | `failed` (already correct) | `failed` (unchanged, now also defensively guaranteed by the helper) |
| `orders.status` / `fulfillment_status` on rejection | `cancelled` / `cancelled` (already correct) | Unchanged |
| Inventory release | Already released via `releaseInventoryReservations()` (idempotent RPC) | Unchanged behavior; now also centralized inside the helper for the bank-transfer case (no duplicate call added — the route's own generic `releaseInventoryReservations(context, id, 'admin_cancelled')` call for any `status === 'cancelled'` action is untouched, and the specific block's own inline call was replaced, not duplicated) |
| Coupon release | Already released inline (`coupon_redemptions.status = 'released'`), but with **no idempotency pre-check** | Same target state, now with an idempotency pre-check (only writes if a non-`released` row exists for the order) |
| Customer rejection email (`bank_transfer_not_received_cancelled`) | Sent unconditionally on every click — **could double-send** on repeated admin clicks | Sent only when the helper's result is neither `idempotent: true` nor `blocked: true` — sent exactly once per real rejection |
| Admin identity in `admin/orders.js`'s audit event | Already captured via `getAccessEmail(context)` (from B1's fix, which touched the shared `recordEvent()` helper used by *all* actions including this one) | Unchanged |
| Admin identity in `admin/orders/[id]/status.js`'s `order_status_events` | **Missing entirely** — `created_by` was never set on this route's insert, for any status change | **Fixed** — `created_by: getAccessEmail(context) || 'admin'` |
| Already-paid protection | Only the outer route-level 409 guard (`before.payment_status` in `['paid','refunded','partially_refunded']`) | Same outer guard, **plus** a new inner guard inside `rejectManualBankTransferPayment()` itself (defense in depth) — see §5 |
| Invoice shell on rejection | Never created (correct) | Still never created — enforced structurally by the validator (helper never calls `finalizeCommerceAfterPayment()`/`insertRow(..., 'invoice_records')`) |
| Loyalty points on rejection | Never awarded (correct); the pre-existing generic `reverseOrderPoints()` hook in `status.js`/`orders.js` could fire on a settling transition regardless of bank vs. card, unrelated to B2 | Unchanged — the new helper itself never calls any loyalty ledger function directly (structurally enforced by the validator) |

---

## 3. `payments` table finalization behavior

`rejectManualBankTransferPayment()` looks up the order's most recent `bank_transfer` payment row (`order_id`, `provider = 'bank_transfer'`, newest by `created_at`). If found and not already `failed`/`cancelled`, it updates:

```js
{
  status: 'failed',
  raw_callback_response: { source: 'admin_manual_bank_transfer_rejection', rejected_by_email, rejected_by_admin_id, reason, confirmed_at },
  updated_at: now
}
```

This mirrors B1's `confirmManualBankTransferPayment()` pattern exactly (same lookup shape, same defensive `.catch()`).

## 4. `payment_events` behavior

One row is inserted per genuine (non-idempotent, non-blocked) rejection:

```js
{
  order_id, provider: 'bank_transfer', provider_payment_id: null,
  event_type: 'bank_transfer_payment_rejected', status: 'processed',
  processed_at: now,
  metadata: { source: 'admin_manual_bank_transfer_rejection', rejected_by_email, rejected_by_admin_id, order_number, reason, inventory_release, coupon_release }
}
```

The idempotency gate queries for an existing row with `event_type = 'bank_transfer_payment_rejected'` and `status = 'processed'` for the order **before any write**, and short-circuits with `{ ok: true, idempotent: true }` if found.

## 5. Already-paid protection behavior

Checked **before** the idempotency gate (an already-paid order can never have a matching prior rejection event, so it must be checked first):

```js
if (order.payment_status === 'paid' || ALREADY_SETTLED_ORDER_STATUSES.has(order.status)) {
  return { ok: false, idempotent: false, blocked: true, reason: 'already_paid_or_settled' };
}
```

`ALREADY_SETTLED_ORDER_STATUSES = {'paid','preparing','packed','shipped','delivered','refunded','partially_refunded'}`.

When blocked, the function performs **zero writes**: no `payments` update, no `orders` update, no inventory release, no coupon release, no `payment_events` insert. This is defense-in-depth on top of the pre-existing outer 409 guards in both admin route files (`before.payment_status`/`current.payment_status` in `['paid','refunded','partially_refunded']`), which already prevent reaching this code for the vast majority of cases — the inner guard protects the rare case where the helper might be invoked directly (e.g. a future consumer) without going through the route's own guard.

## 6. Inventory release behavior

`rejectManualBankTransferPayment()` calls the same idempotent `release_order_inventory` RPC (via `releaseInventoryReservations()`) already used by the pre-existing rejection path. No new RPC, no new SQL. The route's own generic `releaseInventoryReservations(context, id, 'admin_cancelled')` call — which runs for **any** action that maps to `status: 'cancelled'`, not just bank-transfer rejection — is untouched; calling the RPC a second time from inside the helper is safe because the RPC itself is idempotent.

## 7. Coupon release behavior

Same target state as before (`coupon_redemptions.status = 'released'`), now with an idempotency pre-check: the helper first selects the order's `coupon_redemptions` rows and only issues the update if at least one row is not already `'released'`. This avoids an unconditional write on every repeat rejection click.

## 8. Email de-dup behavior

`admin/orders.js`'s rejection email send is now gated:

```js
if (bankTransferRejection?.idempotent !== true && bankTransferRejection?.blocked !== true) {
  // send bank_transfer_not_received_cancelled
}
```

First rejection click → helper returns `{ idempotent: false, blocked: false }` → email sent. Second click on the same order → helper returns `{ idempotent: true }` → email **not** sent. An attempted rejection of an already-paid order → helper returns `{ blocked: true }` → email **not** sent (a paid order must never receive a "payment not received" email). Verified in tests §16.

## 9. Admin identity behavior

- `admin/orders.js`: unchanged from B1 — the shared `recordEvent()` helper (used by every action in this file, including `mark_bank_transfer_not_received`) already captures `created_by: getAccessEmail(context) || 'admin'`. B2 additionally passes `rejectedByEmail: getAccessEmail(context)` into the new helper, which is stored in the `payment_events.metadata.rejected_by_email` field.
- `admin/orders/[id]/status.js`: **fixed** — the `order_status_events` insert previously had no `created_by` field at all (for any status transition through this route, not only rejections). It now sets `created_by: getAccessEmail(context) || 'admin'`, consistent with how `admin/orders.js` already behaved.

## `orders/[id]/status.js` wiring decision

**Wired.** This route can already transition a bank-transfer order to `status: 'cancelled'` (the generic cancelled-status branch existed before B2), so `rejectManualBankTransferPayment()` is called exactly when `body.status === 'cancelled' && current.payment_method === 'bank_transfer'` — mirroring the B1 approval wiring pattern (`body.status === 'paid' && current.payment_method === 'bank_transfer'`) exactly.

## `cancel_order` scope decision — deferred, not wired

`cancel_order` is a **generic** order-cancellation action in `admin/orders.js`, used by the admin UI for any order (card or bank-transfer) that needs to be cancelled outside the dedicated "Havale/EFT ödemesi alınamadı" flow. It maps to the same target state (`status: 'cancelled'`, `payment_status: 'failed'`, `fulfillment_status: 'cancelled'`) via `statusFromAction()`, but it is a **separate code branch** from `mark_bank_transfer_not_received` — it never enters the `if (body.action === 'mark_bank_transfer_not_received')` block, so it was never touched by this change.

Per the plan's §6 guidance ("only wire `cancel_order` if it is part of the same Havale/EFT unpaid rejection/cancellation path"): the current admin UI (`assets/admin-orders.js`) calls `mark_bank_transfer_not_received` specifically for the "ödeme alınamadı" button, and `cancel_order` for the separate generic "siparişi iptal et" action. They are not the same UI affordance, so `cancel_order` was **intentionally left unwired** in B2. This means a bank-transfer order cancelled via the generic `cancel_order` action still does not get a `payments` update, `payment_events` row, or idempotent coupon release — that gap is documented here as an explicit deferral, not fixed in this batch, and is proven by test (`B2: generic cancel_order action and the paid-order direct-cancel 409 guard remain unchanged`).

## 10. Proof B1 approval behavior did not change

- `confirmManualBankTransferPayment()`, `finalizeCommerceAfterPayment()`, and `ensureShipmentShell()` in `commerce-finalization.js` were not edited — B2's validator asserts none of B2's new tokens (`rejectManualBankTransferPayment`, `bank_transfer_payment_rejected`) appear inside those three function bodies, which would only be possible if B2 had spliced code into them rather than adding a new sibling export.
- `admin/orders.js`'s `mark_payment_paid` block and `admin/orders/[id]/status.js`'s `body.status === 'paid'` branch are structurally re-verified in full by the chained B1 validator (`scripts/validate-b1-bank-transfer-finalization.mjs`), which still passes.
- Test `B2: B1 approval behavior remains fully intact alongside the new rejection helper` runs a full `mark_payment_paid` approval end-to-end after B2's changes and asserts the exact same payments/payment_events/coupon/invoice outcomes as the original B1 tests.
- All 8 original B1 tests still pass unmodified (except the one rejection-specific test intentionally updated — see §16).

## 11. Proof card payment (iyzico) behavior did not change

`functions/api/iyzico-callback.js` has **zero diff** — `git status --porcelain -- functions/api/iyzico-callback.js` shows no B2-era change to this file (it was already modified by B1's helper extraction and stayed that way). The B1 validator's byte-identical-to-HEAD extraction proof for `finalizeCommerceAfterPayment`/`ensureShipmentShell` still passes unchanged. `rejectManualBankTransferPayment` is never imported or referenced anywhere in this file (asserted by the B2 validator).

## 12. Proof no invoice shell or loyalty award happens on rejection

Structurally enforced by the B2 validator:
- `rejectManualBankTransferPayment()`'s body must not contain a call to `finalizeCommerceAfterPayment(context...)` or `ensureShipmentShell(context...)`.
- Must not contain `insertRow(context, 'invoice_records'...)`.
- Must not contain any call to `awardOrderPoints`, `reverseOrderPoints`, or `promoteOrderPoints`.
- Must never write `coupon_redemptions.status = 'used'` (only `'released'`).

And functionally proven by tests: `invoice_records` and `shipments` tables remain empty after a rejection in every B2 test that seeds them; no `cosmoskin_award_loyalty_for_order` RPC call is ever observed.

## 13. Proof the EMAIL_TYPES fix was not bundled

- `functions/api/_lib/email-events.js` has a **zero-line diff** in this batch: `git status --porcelain -- functions/api/_lib/email-events.js` returns nothing.
- The B2 validator additionally asserts the string `'bank_transfer_not_received_cancelled'` does not appear anywhere in that file, and independently fails if the file shows up as modified in `git status`.
- The pre-existing bug (rejection emails get logged to `email_events` as `email_type: 'order_created'` due to the `EMAIL_TYPES` allowlist fallback) is **still present** and **unfixed** by design. It is documented here, exactly as instructed, as a candidate for a separate future task (tentatively "B2E" or folded into a future "B3") that requires first running a live `pg_constraint` query against the production `email_events` table to determine which of the two same-named-differently `CHECK` constraints (`email_events_email_type_final_chk` from the `20260629_*` migrations vs. `email_events_email_type_check` from `20260702`) is actually enforced, before any allowlist widening ships.

## 14. Test results

`node --test tests/local-integration.test.mjs` → **60/60 passing**, 0 failing.

14 new/updated tests specific to B2 (full list, see the test file):
1. `B1→B2: mark_bank_transfer_not_received now finalizes the payments row/payment_events for a bank-transfer order, still never calls confirmManualBankTransferPayment` (updated in place from the old B1-era assertion)
2. `B2: rejectManualBankTransferPayment finalizes payments/payment_events/inventory/coupon release and is idempotent on a repeat call`
3. `B2: rejectManualBankTransferPayment rejects a non-bank_transfer (card) order`
4. `B2: rejectManualBankTransferPayment blocks and performs zero writes against an already-paid bank-transfer order`
5. `B2: admin/orders.js mark_bank_transfer_not_received finalizes rejection end-to-end and sends bank_transfer_not_received_cancelled exactly once across two rejection clicks`
6. `B2: admin/orders.js mark_bank_transfer_not_received never calls rejectManualBankTransferPayment for a card-payment order (legacy inline release path preserved)`
7. `B2: admin/orders.js unauthorized admin cannot reject a bank-transfer order (403, no writes)`
8. `B2: admin/orders/[id]/status.js also finalizes a bank-transfer order cancelled via rejectManualBankTransferPayment, and captures the real admin identity`
9. `B2: generic cancel_order action and the paid-order direct-cancel 409 guard remain unchanged`
10. `B2: B1 approval behavior remains fully intact alongside the new rejection helper`

Plus the pre-existing, still-passing:
11. `B1: card payment (iyzico) callback behavior is unchanged...`
12–14. The full original B1 test suite (7 more tests) — all still green, proving zero B1 regression.

## 15. Validator results

```
$ node scripts/validate-b2-bank-transfer-rejection-finalization.mjs
COSMOSKIN B2 bank transfer rejection finalization validation passed.
```

This chains and re-runs (all passing): `validate-b1-bank-transfer-finalization.mjs`, `validate-a1-admin-rbac-hardening.mjs`, `validate-a1-admin-endpoint-coverage.mjs`, `validate-h2-return-attachment-preview.mjs`, `validate-h1-return-attachment-storage-rls.mjs`, `validate-h0-live-payment-rpc-hotfix.mjs`, `validate-account-batch-1-safe-fixes.mjs`, `validate-account-batch-3-order-cancellation.mjs`, `validate-account-batch-4-loyalty-ledger.mjs`, `validate-account-ui-polish.mjs`.

`node scripts/validate-production-launch-readiness.mjs` → passed (19 critical pages, 37 product pages, 29 migrations checked — 0 new migrations from B2).

All `node --check` syntax checks passed for every modified file.

## 16. Production deploy warning

**Do not deploy B2 to production until:**
- A1 Cloudflare Access verification is complete.
- The owner can access the admin order mutation endpoint in preview.
- One preview bank-transfer **approval** smoke test passes (B1, still required).
- One preview bank-transfer **rejection** smoke test passes (B2 — see the runbook).
- Rollback is ready (see `COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_ROLLBACK_PLAN_20260705.md`).

This batch was **not deployed**. `functions/api/_lib/commerce-finalization.js`, `functions/api/admin/orders.js`, and `functions/api/admin/orders/[id]/status.js` remain uncommitted, local-only changes at the end of this batch, exactly like B1 was left at the end of its own batch.
