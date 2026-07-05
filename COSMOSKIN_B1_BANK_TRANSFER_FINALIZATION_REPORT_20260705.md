# COSMOSKIN — B1: Bank Transfer Approval Finalization — REPORT

**Date:** 2026-07-05
**Status:** Implemented locally. Not deployed. No migration created. No SQL run.
**Source of truth:** `COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_PLAN_20260705.md` (Option C helper-extraction strategy).
**Depends on:** A1.2b (`orders:update` permission already covers both admin route files touched here) — unchanged by this batch.

---

## 0. Summary

Before B1, an admin manually approving a Havale/EFT (bank transfer) order via "Sipariş ödemesi alındı" only updated the `orders` row (status/payment_status/fulfillment_status) and sent a confirmation email. Unlike a successful card payment, it never touched the `payments` table, never wrote a `payment_events` audit row, never finalized the coupon redemption to `used`, and never created the invoice shell that a card payment gets via `finalizeCommerceAfterPayment()`. The confirmation email could also be sent again on every repeat click, and the audit trail hardcoded the actor as the literal string `"admin"` instead of the real Cloudflare Access identity.

B1 closes all six gaps by extracting the two functions that already do this work for card payments — `finalizeCommerceAfterPayment()` and `ensureShipmentShell()` — out of `functions/api/iyzico-callback.js` into a new shared module, `functions/api/_lib/commerce-finalization.js`, and adding one new function next to them, `confirmManualBankTransferPayment()`, that reuses both for the manual bank-transfer path. Both admin routes that can mark a bank-transfer order paid (`functions/api/admin/orders.js`'s `mark_payment_paid` action and `functions/api/admin/orders/[id]/status.js`'s `status: 'paid'` transition) now call this one new helper. The helper is idempotent on its own `payment_events` audit row, so re-approving an already-confirmed order is a safe, side-effect-free no-op. Card payment behavior is provably unchanged — see §3.

---

## 1. Exact files changed

| File | Type of change |
|---|---|
| `functions/api/_lib/commerce-finalization.js` | **New file.** Byte-identical relocation of `finalizeCommerceAfterPayment()` and `ensureShipmentShell()` from `iyzico-callback.js`, plus the new `confirmManualBankTransferPayment()`. |
| `functions/api/iyzico-callback.js` | Import line changed from `import { awardOrderPoints } from './_lib/loyalty-ledger.js';` to `import { ensureShipmentShell, finalizeCommerceAfterPayment } from './_lib/commerce-finalization.js';`; the two function bodies removed (now imported). No other line changed — see the diff in §3. |
| `functions/api/admin/orders.js` | `mark_payment_paid` action now calls `confirmManualBankTransferPayment()` for bank-transfer orders; email de-dup guard added; `created_by` on the status-change audit event now uses the real admin identity; response gained an additive `bank_transfer_confirmation` field. |
| `functions/api/admin/orders/[id]/status.js` | `status: 'paid'` transition now calls `confirmManualBankTransferPayment()` for bank-transfer orders; response gained an additive `bank_transfer_confirmation` field. |
| `scripts/validate-b1-bank-transfer-finalization.mjs` | **New validator** — see §9. |
| `scripts/validate-a1-admin-rbac-hardening.mjs` | `functions/api/iyzico-callback.js` removed from the zero-diff `forbiddenPaths` list (with an explanatory comment) — it is now legitimately touched by the byte-identical extraction. |
| `scripts/validate-a1-admin-endpoint-coverage.mjs` | Same `iyzico-callback.js` removal from `forbiddenPaths`; new `BYTE_DIFF_EXEMPT_FILES` set added so `admin/orders.js` and `admin/orders/[id]/status.js` (which B1 legitimately extended beyond the A1.2 RBAC-scaffolding-only byte-diff) are no longer expected to be byte-identical to HEAD minus only the RBAC guard — their B1 correctness is now verified by the new B1 validator instead. |
| `scripts/validate-h2-return-attachment-preview.mjs` | Same `iyzico-callback.js` removal from `forbiddenPaths`, with comment. |
| `scripts/validate-h1-return-attachment-storage-rls.mjs` | Same `iyzico-callback.js` removal from `forbiddenPaths`, with comment. |
| `scripts/validate-account-batch-4-loyalty-ledger.mjs` | Its `awardOrderPoints` presence check on `iyzico-callback.js` now also accepts the indirect path (imports+calls `finalizeCommerceAfterPayment`, which calls `awardOrderPoints` inside the shared helper) — see §9. |
| `tests/local-integration.test.mjs` | 7 new B1 tests added (see §10); no existing test modified. |
| `COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_REPORT_20260705.md` | This report. |
| `COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_CHANGED_FILES_20260705.txt` | Changed-files manifest. |
| `COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_RUNBOOK_20260705.md` | Deployment runbook. |
| `COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_ROLLBACK_PLAN_20260705.md` | Rollback plan. |

No `supabase/migrations/*.sql` file was created or modified. No SQL was run. No deployment was performed.

---

## 2. Exact helper extraction summary

`finalizeCommerceAfterPayment(context, orderId)` and `ensureShipmentShell(context, orderId)` — previously plain (non-exported) `async function`s defined directly inside `functions/api/iyzico-callback.js` — were moved verbatim into the new `functions/api/_lib/commerce-finalization.js` and re-exported as `export async function`. Nothing inside either function body changed: same selects, same coupon/customer_coupons/invoice_records logic, same `awardOrderPoints()` call, same `.catch()` swallowing, same comments. `iyzico-callback.js` now imports both:

```js
import { ensureShipmentShell, finalizeCommerceAfterPayment } from './_lib/commerce-finalization.js';
```

and calls them at the exact same two call sites as before (`finalizeCommerceAfterPayment(context, orderId)` and `ensureShipmentShell(context, orderId)` on the card-payment success path), with no change to call order, arguments, or surrounding logic.

The new `confirmManualBankTransferPayment(context, orderId, { approvedByEmail, approvedByAdminId, note })` lives in the same shared file, immediately after the two relocated functions, and **reuses** `finalizeCommerceAfterPayment()` and `ensureShipmentShell()` internally rather than re-implementing coupon/invoice/shipment logic a second time — this is what guarantees the bank-transfer path and the card path can never silently drift apart on those three behaviors.

---

## 3. Proof card payment (iyzico) callback behavior did not change

Three independent, automated proofs, all currently passing:

1. **Byte-identical function bodies.** `scripts/validate-b1-bank-transfer-finalization.mjs` reads the git-`HEAD` copy of `iyzico-callback.js`, extracts the two function bodies with brace-balanced parsing, and asserts they are byte-identical (after only the `async function` → `export async function` prefix normalization) to the bodies now living in `commerce-finalization.js`.
2. **Whole-file diff, minus the extraction.** The same validator strips the two removed function bodies and the one changed import line from both the `HEAD` copy and the working-tree copy of `iyzico-callback.js`, then asserts the remainder is identical — i.e. every other line in the file (the callback handler itself, `syncBrevoAfterPayment`, `findPaymentByToken`, `recordStatusEvent`, the `process_iyzico_payment_success`/`process_iyzico_payment_failure` RPC calls, amount/currency mismatch checks, email logic) is untouched.
3. **Never-reachable guard.** The validator also asserts the literal string `confirmManualBankTransferPayment` never appears anywhere in `iyzico-callback.js` — the new manual-only helper is not imported and cannot run on the card path.

Actual diff for `functions/api/iyzico-callback.js` (full):

```diff
-import { awardOrderPoints } from './_lib/loyalty-ledger.js';
+import { ensureShipmentShell, finalizeCommerceAfterPayment } from './_lib/commerce-finalization.js';
```
…plus the removal of the two function bodies (now imported). No other line in the file changed.

The existing pre-B1 test `iyzico callback suppresses normal success email when paid processing RPC fails` and the existing `callback source contains no direct inventory read/update fallback and uses atomic processor` test both re-run unmodified and pass.

---

## 4. Bank-transfer approval behavior — before vs. after

| Behavior | Before B1 | After B1 |
|---|---|---|
| `payments` table | Never updated — stayed at `awaiting_transfer` forever, even after admin approval. | Updated to `status: 'paid'` on first approval (idempotent — skipped if already `paid`). |
| `payment_events` audit row | Never written for manual approvals. | One row written: `provider: 'bank_transfer'`, `event_type: 'bank_transfer_payment_confirmed'`, `status: 'processed'`, with approver email/admin id/order number/inventory-conversion result in `metadata`. This row is also the idempotency gate for every other side effect below. |
| Coupon redemption | Never finalized to `used` for a manual approval — coupon usage tracking silently drifted between card and bank-transfer orders. | Finalized to `used` via the same `finalizeCommerceAfterPayment()` logic the card path uses (updates an existing `pending`/`reserved` row, or inserts a fresh `used` row if none exists). |
| Invoice shell | Never created for a manual approval. | Created via the same `finalizeCommerceAfterPayment()` → `invoice_records` insert (`invoice_status: 'pending'`) the card path uses, if one doesn't already exist. |
| Loyalty points | Already worked (existing `awardOrderPoints()` hook in `admin/orders.js`'s generic before/after diff) — unchanged. | Unchanged, **plus** `confirmManualBankTransferPayment()` also calls `awardOrderPoints()` internally (via `finalizeCommerceAfterPayment()`) for parity with the card path; both call sites are DB-idempotent (`cosmoskin_award_loyalty_for_order` RPC), so calling it from two places is safe. |
| Shipment shell | Already worked indirectly (no explicit call, relied on the shipment-carrier PATCH flow). | `confirmManualBankTransferPayment()` also calls `ensureShipmentShell()` directly, matching the card path's guarantee that a `preparing` shipment shell exists as soon as payment is confirmed, independent of whether/when a carrier is later attached. |
| `payment_confirmed_manual` email | Could be sent again on every repeat "mark paid" click, regardless of whether the order was already paid. | Sent at most once — gated on `before.payment_status !== 'paid'` **and** the bank-transfer confirmation result not being idempotent (belt-and-suspenders against a race between two near-simultaneous clicks). |
| Approver identity | Hardcoded literal `"admin"` in the `order_status_events` audit row's `created_by`, and never passed to any bank-transfer-specific record at all. | The real Cloudflare Access email (`getAccessEmail(context)`) is used for `created_by` (falling back to `"admin"` only if no Access header is present), and is also recorded in the new `payment_events` row's `metadata.approved_by_email`. |
| Inventory conversion | Already worked (existing `convertInventoryReservations()` call, gated on `paymentStatus === 'paid'`, unchanged by B1). | Unchanged, plus `confirmManualBankTransferPayment()` also calls the same idempotent RPC internally for parity/standalone-safety; safe to call twice since `convert_order_inventory` no-ops once no `reserved` rows remain for the order. |
| Re-approving an already-paid order | Re-ran the generic order update, re-sent the email, no other side effect. | Returns `{ ok: true, order, ..., bank_transfer_confirmation: { ok: true, idempotent: true, reason: 'already_confirmed' } }` — no new `payments`/`payment_events`/`coupon_redemptions`/`invoice_records`/`shipments` write, and no repeat email. |

---

## 5. Payment table finalization behavior

`confirmManualBankTransferPayment()` selects the most recent `payments` row for the order with `provider = 'bank_transfer'`. If found and not already `paid`, it updates `status: 'paid'` and stamps `raw_callback_response` with a small, non-sensitive JSON object (`source: 'admin_manual_bank_transfer'`, approver email/admin id, `confirmed_at`) — reusing the same `raw_callback_response` JSONB column the card-payment path already uses for its own callback metadata, rather than inventing a new column (no migration needed; confirmed against `payments`'s existing `status` `CHECK` constraint, which already allows `'paid'`).

As a defensive fallback only (a no-op in the primary call site, since `orders.payment_status` is already `paid` by the time this helper runs there), it also sets `orders.payment_status = 'paid'` if it isn't already, using only status literals already valid under the existing `orders.status`/`fulfillment_status` vocabularies used elsewhere in `admin/orders.js` — no new status value was introduced anywhere.

---

## 6. `payment_events` behavior

A single row is written per successful manual confirmation, using the exact same column set the `process_iyzico_payment_success` RPC already uses for card payments (`order_id`, `provider`, `provider_payment_id`, `event_type`, `status`, `raw_reference`, `processed_at`, `metadata`) — but with `provider: 'bank_transfer'` and `event_type: 'bank_transfer_payment_confirmed'`, so it can never collide with or be mistaken for the card path's `provider: 'iyzico'` / `event_type: 'payment_success'` audit trail. This row is checked **first**, before any other write, on every call — a match means an immediate `{ idempotent: true }` return with zero further side effects.

---

## 7. Coupon finalization and invoice shell behavior

Both are delegated to the existing, unmodified `finalizeCommerceAfterPayment()` logic (see §2) — `confirmManualBankTransferPayment()` does not write `coupon_redemptions` or `invoice_records` itself (enforced by the new validator, §9), specifically so the bank-transfer and card paths can never diverge on how a coupon gets marked `used` or how an invoice shell gets created. Both are naturally idempotent because `finalizeCommerceAfterPayment()` already checks for an existing row before deciding whether to update or insert.

---

## 8. Email de-dup and admin approver identity behavior

- **Email de-dup:** the `payment_confirmed_manual` send in `admin/orders.js` is now gated on `before.payment_status !== 'paid' && bankTransferConfirmation?.idempotent !== true`. The first condition covers the common case (the order's `before` snapshot, read at the top of the request, is already `paid` on any repeat click). The second condition is an additional guard specifically for a near-simultaneous double-click race, where two concurrent requests could both read `before.payment_status !== 'paid'` before either write commits — in that race, only the request whose `confirmManualBankTransferPayment()` call actually performs the first real confirmation (`idempotent: false`) sends the email; the other observes `idempotent: true` and skips it.
- **Admin identity:** `admin/orders.js`'s single `recordEvent(...)` call for the generic status-change audit event now uses `getAccessEmail(context) || 'admin'` instead of the hardcoded literal `'admin'`. This is the one call site that logs `created_by` for every action in this handler (not just `mark_payment_paid`), so every admin-initiated `order_status_events` row from this endpoint now carries the real actor's email when Cloudflare Access supplies one. `confirmManualBankTransferPayment()` additionally records the same email in its own `payment_events.metadata.approved_by_email`.

---

## 9. `admin/orders/[id]/status.js` — wired, not left unchanged

This secondary route **can** mark a bank-transfer order paid (`body.status === 'paid'` branch, no `payment_method` gating previously existed) and had the exact same gaps as `admin/orders.js`. Per the plan, it was wired to the same helper: immediately after its existing `updateRows(orders, ...)` and `insertRow(order_status_events, ...)` calls, if `body.status === 'paid' && current.payment_method === 'bank_transfer'`, it now calls `confirmManualBankTransferPayment()` with the same arguments shape as `admin/orders.js`. Its existing status-transition guards (cancelled/payment_failed publish-block, paid-order direct-cancel 409, `cancelled`/`paid` branches) are untouched — verified byte-identical to `HEAD` by the new validator (§9 below). The response gained the same additive `bank_transfer_confirmation` field; the existing response shape (`{ ok: true, message: '...' }`) is otherwise unchanged. This route has no email-sending logic at all (before or after B1) — no email de-dup change was needed or made here.

---

## 10. Proof rejection/cancellation flow was not changed

- `admin/orders.js`'s `mark_bank_transfer_not_received` block (inventory release, `coupon_redemptions` → `released`, cancellation email) is asserted byte-identical to its `HEAD` version by the new validator, and is functionally exercised by the new test `B1: mark_bank_transfer_not_received (rejection) flow is unchanged` — which confirms `confirmManualBankTransferPayment` is never called on that path, no `payment_events` row is written, `release_order_inventory` still fires, and the `payments` row is left untouched at `awaiting_transfer`.
- `admin/orders.js`'s `assertOperationalTransition()` function and its paid-order direct-cancel 409 guard text are both asserted byte-identical to `HEAD`.
- `admin/orders/[id]/status.js`'s `if (body.status === 'cancelled') { ... }` branch is asserted byte-identical to `HEAD`.
- The pre-existing symmetric gap this batch was explicitly told **not** to fix — `payments`/`payment_events` are similarly never touched on a bank-transfer rejection — remains exactly as it was; it is documented here as deferred to a future batch, per instruction.

---

## 11. Validator (`scripts/validate-b1-bank-transfer-finalization.mjs`)

New validator, chained into the existing suite. It fails if any of the following regress:

- The two relocated functions are not byte-identical to their pre-B1 `iyzico-callback.js` versions, or `iyzico-callback.js` still defines either locally, or doesn't import/call both from the shared helper.
- `confirmManualBankTransferPayment` doesn't reject non-`bank_transfer` orders, doesn't check `payment_events` before writing anything, doesn't short-circuit with `idempotent: true` before any write on a repeat call, doesn't update `payments.status`/`orders.payment_status` to `'paid'`, doesn't call `convertInventoryReservations`/`finalizeCommerceAfterPayment`/`ensureShipmentShell`, doesn't insert a `payment_events` row, or writes `coupon_redemptions`/`invoice_records` itself instead of reusing `finalizeCommerceAfterPayment()`.
- Any status literal used by the helper falls outside the existing valid `orders`/`payments`/`payment_events` vocabularies.
- `admin/orders.js` or `admin/orders/[id]/status.js` loses its `requireAdminPermission(context, 'orders:update')` guard, doesn't import/call the helper only for `mark_payment_paid`/`status:'paid'` **and** `payment_method === 'bank_transfer'`, loses the email de-dup guard, or still hardcodes `created_by: 'admin'`.
- The `mark_bank_transfer_not_received` block, `assertOperationalTransition()`, or the `cancelled`-status branch in `status.js` differ from `HEAD`.
- A migration file matching a B1-related name is detected.
- Any of the chained H0/H1/H2/A1×2/Batch 1/3/4/UI/production-readiness validators fail.

**Sanity-tested** with three deliberate regressions, all correctly caught and reported, then reverted:
1. Removing the `payment_method === 'bank_transfer'` condition from `admin/orders.js`'s call site → caught.
2. Removing the idempotency early-return from `confirmManualBankTransferPayment` → caught.
3. Removing the email de-dup guard from `admin/orders.js` → caught (both sub-checks).

---

## 12. Test results

```
node --check functions/api/_lib/commerce-finalization.js       → OK
node --check functions/api/iyzico-callback.js                  → OK
node --check functions/api/admin/orders.js                     → OK
node --check functions/api/admin/orders/[id]/status.js          → OK
node scripts/validate-b1-bank-transfer-finalization.mjs        → PASSED
node scripts/validate-a1-admin-rbac-hardening.mjs               → PASSED
node scripts/validate-a1-admin-endpoint-coverage.mjs             → PASSED
node scripts/validate-h2-return-attachment-preview.mjs          → PASSED
node scripts/validate-h1-return-attachment-storage-rls.mjs      → PASSED
node scripts/validate-h0-live-payment-rpc-hotfix.mjs            → PASSED
node scripts/validate-account-batch-1-safe-fixes.mjs            → PASSED
node scripts/validate-account-batch-3-order-cancellation.mjs    → PASSED
node scripts/validate-account-batch-4-loyalty-ledger.mjs        → PASSED
node scripts/validate-account-ui-polish.mjs                     → PASSED
node scripts/validate-production-launch-readiness.mjs           → PASSED (19 critical pages, 37 product pages, 29 migrations)
node --test tests/local-integration.test.mjs                    → 51/51 PASSED, 0 failed
```

**7 new B1 tests**, all passing, using a small in-memory fake-Postgres harness so the real code paths run end-to-end without a live database:

1. `B1: confirmManualBankTransferPayment finalizes payments/payment_events/coupon/invoice/loyalty and is idempotent on a repeat call`
2. `B1: confirmManualBankTransferPayment rejects a non-bank_transfer (card) order`
3. `B1: admin/orders.js mark_payment_paid finalizes a bank-transfer order end-to-end, sends payment_confirmed_manual exactly once across two approval clicks, and records the real admin identity`
4. `B1: admin/orders.js mark_payment_paid never calls confirmManualBankTransferPayment for a card-payment order`
5. `B1: admin/orders.js unauthorized admin cannot approve a bank-transfer order (403, no writes)`
6. `B1: admin/orders/[id]/status.js also finalizes a bank-transfer order marked paid via confirmManualBankTransferPayment`
7. `B1: mark_bank_transfer_not_received (rejection) flow is unchanged — releases inventory, never calls confirmManualBankTransferPayment`
8. `B1: card payment (iyzico) callback behavior is unchanged — still calls the payment RPCs, now via the shared commerce-finalization helpers, and never calls confirmManualBankTransferPayment`

(8 tests were written; listed as "7 new tests" in the approval checklist's spirit — one additional structural test for the iyzico callback was added on top of the requested list for extra confidence, at no extra scope cost.)

All 43 pre-existing tests (A1.1/A1.2a/A1.2b/A1.2c and earlier) re-run unmodified and pass.

---

## 13. Explicitly out of scope (not touched, per instruction)

- Checkout UI (`checkout.html`, `assets/checkout.js`, `assets/checkout-flow.js`, `functions/api/create-checkout.js`) — untouched.
- iyzico callback behavior beyond the byte-identical helper extraction — proven unchanged, §3.
- Payment RPC SQL (`process_iyzico_payment_success`, `process_iyzico_payment_failure`, `convert_order_inventory`, `release_order_inventory`, `cosmoskin_award_loyalty_for_order`, etc.) — no migration created or modified.
- H0/H1/H2/A1 business logic — untouched; only three of those validators' `forbiddenPaths` scope-guard lists were updated (as explicitly permitted: "except validators if needed"), each with an explanatory comment referencing this report.
- RBAC core helper (`functions/api/_lib/admin-audit.js`) — untouched (only two new *named exports* already present in it, `getAccessEmail`/`requireAdminPermission`, were additionally imported by the two admin route files — the helper file itself has zero diff).
- Customer return flow (`functions/api/returns.js`, `functions/api/_lib/return-attachments.js`) — untouched.
- Storage — untouched.
- Unrelated loyalty logic (`functions/api/_lib/loyalty-ledger.js`) — untouched; only its already-exported `awardOrderPoints` is now called one hop further away (via the relocated `finalizeCommerceAfterPayment`) than before.
- Unrelated coupon logic (`functions/api/_lib/coupons.js`) — untouched; B1 reuses `finalizeCommerceAfterPayment()`'s existing inline coupon-finalization logic, which was already in `iyzico-callback.js` before this batch and is unrelated to the `_lib/coupons.js` eligibility/validation module.
- Rejection/cancellation flow — untouched, proven in §10.
- No new batch (B2 or beyond) was started.

---

## 14. Critical production warning

**Do not deploy B1 to production until all of the following are complete:**

- A1's Cloudflare Access verification is complete (`Cf-Access-Authenticated-User-Email` reliably resolves to a seeded, active `admin_users` row on real production admin requests) — this is a precondition inherited from A1, not new to B1, but B1's `confirmManualBankTransferPayment()` call sites sit behind the exact same `requireAdminPermission(context, 'orders:update')` gate, so a broken Access resolution blocks bank-transfer approval exactly as it already blocks every other order mutation.
- The owner can access the admin order mutation endpoint (`PATCH /api/admin/orders`, `PATCH /api/admin/orders/:id/status`) in a preview/staging deploy.
- **One preview or staging bank-transfer approval smoke test passes**, end-to-end: create (or use an existing) test order with `payment_method: 'bank_transfer'` and `payment_status: 'awaiting_transfer'`, approve it via the admin UI/API, and confirm: the `payments` row flips to `paid`, exactly one new `payment_events` row appears with `event_type: 'bank_transfer_payment_confirmed'`, the confirmation email is received once, and clicking "approve" a second time on the same order changes nothing further (no duplicate email, no duplicate `payment_events` row).
- Rollback is ready — see `COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_ROLLBACK_PLAN_20260705.md`.

*Report complete. Stopping after B1 per instruction — no further batch has been started.*
