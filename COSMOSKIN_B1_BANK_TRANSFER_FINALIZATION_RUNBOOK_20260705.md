# COSMOSKIN — B1: Bank Transfer Approval Finalization — Deployment Runbook

**Date:** 2026-07-05

> ## ⚠ Do not deploy B1 to production until all of the following are true
>
> - A1's Cloudflare Access verification is complete (this is inherited, not new — B1's new code sits behind the exact same `requireAdminPermission(context, 'orders:update')` gate A1.2b already added to both files touched here).
> - The owner can access the admin order mutation endpoints (`PATCH /api/admin/orders`, `PATCH /api/admin/orders/:id/status`) in a preview/staging deploy.
> - One preview/staging bank-transfer approval smoke test passes (§2 below).
> - Rollback is ready (`COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_ROLLBACK_PLAN_20260705.md`).

---

## 0. What changed and why this matters

Before B1, approving a Havale/EFT order in the admin panel updated only the `orders` row and sent an email — it silently skipped the `payments` table, the `payment_events` audit trail, coupon finalization, and invoice-shell creation that a card payment always got. B1 makes bank-transfer approval finalize an order the same way a successful card payment does, by routing both admin approval paths through one new, idempotent helper, `confirmManualBankTransferPayment()`, defined in a new shared module, `functions/api/_lib/commerce-finalization.js`, which also now houses the two functions extracted byte-identically out of the card-payment callback (`finalizeCommerceAfterPayment`, `ensureShipmentShell`).

**No migration. No SQL. No schema change. No new CHECK-constraint value.** This is a pure application-code change layered on existing, already-valid statuses and an existing table (`payment_events`) that the card-payment RPC already writes to.

**Files touched:** see `COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_CHANGED_FILES_20260705.txt`. Full behavioral detail in `COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_REPORT_20260705.md`.

---

## 1. Pre-deploy checklist

### Step 1 — Re-confirm the Cloudflare Access precondition is still true

1. Cloudflare Access still protects the admin routes; the owner's admin session still resolves to a seeded, active `admin_users` row with `orders:update` (owner has `['*']`).
2. `admin/orders.js` and `admin/orders/[id]/status.js` are not currently 403'ing for the owner on any pre-existing action (e.g. a plain status change) — if they are, **stop and fix that first**; B1 does not change the permission gate, only what happens after it passes.

### Step 2 — Local validation (already run once during implementation; re-run immediately before deploy)

```bash
node --check functions/api/_lib/commerce-finalization.js
node --check functions/api/iyzico-callback.js
node --check functions/api/admin/orders.js
node --check "functions/api/admin/orders/[id]/status.js"
node scripts/validate-b1-bank-transfer-finalization.mjs
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

All must pass with zero failures before deploying. (Last confirmed run: all 15 `node --check`/validator commands passed; `node --test` reported `tests 51, pass 51, fail 0`, including the 8 new B1 tests.)

### Step 3 — Identify a safe, real (or realistic test) bank-transfer order for the smoke test

You need one order in the target environment (preview/staging, ideally not production) with `payment_method: 'bank_transfer'` and `payment_status: 'awaiting_transfer'` (i.e. still pending admin approval). If none exists, create one through the normal checkout flow selecting "Havale/EFT" as the payment method, without completing the bank transfer, so it's a realistic pending order.

---

## 2. Deploy sequence

1. Deploy to a preview/staging Cloudflare Pages deployment first, if available.
2. On the preview deployment (Access-protected), as the owner:
   a. Confirm existing, unrelated admin order actions still work (regression check) — e.g. viewing the order list, changing a card-payment order's status.
   b. Run the **bank-transfer approval smoke test**:
      - Open the pending bank-transfer test order from Step 3 above in the admin panel and approve it ("Sipariş ödemesi alındı" / `mark_payment_paid`).
      - Confirm the API response includes `bank_transfer_confirmation: { ok: true, idempotent: false, ... }` (first approval).
      - Confirm in Supabase: the order's `payments` row is now `status: 'paid'`; a new `payment_events` row exists with `event_type: 'bank_transfer_payment_confirmed'`, `provider: 'bank_transfer'`, and `metadata.approved_by_email` matching the approving admin; if the order had a coupon, its `coupon_redemptions` row is now `used`; an `invoice_records` row exists for the order.
      - Confirm exactly **one** `payment_confirmed_manual` email was received.
      - Click approve again on the same order (or re-send the same `mark_payment_paid` request). Confirm the response now shows `bank_transfer_confirmation: { ok: true, idempotent: true, reason: 'already_confirmed' }`, no second `payment_events` row was created, and no second email was received.
   c. If the secondary route (`PATCH /api/admin/orders/:id/status` with `status: 'paid'`) is used in your admin UI for this action instead of/in addition to `admin/orders.js`, repeat the same check against a second pending bank-transfer test order through that route.
3. Deploy to production only after step 2 passes cleanly.
4. Immediately after production deploy, as the owner:
   a. Re-confirm ordinary (non-bank-transfer) order actions still work — regression check.
   b. If a real, low-risk pending bank-transfer order is available and the customer's bank transfer has genuinely been received, approve it and confirm the same four checks from step 2b (payments paid, one payment_events row, coupon/invoice as applicable, exactly one email). Do not use this as your very first production check without having already passed the preview smoke test in step 2.
5. If step 2 or step 4 fails, **do not attempt further diagnosis in production** — immediately follow `COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_ROLLBACK_PLAN_20260705.md`.

---

## 3. Post-deploy verification (within the same session)

- [ ] Owner can approve a pending bank-transfer order without error.
- [ ] `payments` row for that order flips to `status: 'paid'`.
- [ ] Exactly one new `payment_events` row with `event_type: 'bank_transfer_payment_confirmed'` appears, carrying the real approver's email in `metadata`.
- [ ] Coupon (if any) finalizes to `used`; invoice shell (`invoice_records`) exists.
- [ ] Exactly one `payment_confirmed_manual` email is received for the approval.
- [ ] Re-approving the same order is a safe no-op: no second `payment_events` row, no second email, response marks `idempotent: true`.
- [ ] Ordinary card-payment order flows (iyzico callback) are unaffected — a card payment still finalizes normally.
- [ ] `mark_bank_transfer_not_received` (rejection) still works exactly as before — inventory released, coupon released, cancellation email sent, no `payment_events` row written.
- [ ] `order_status_events` audit rows created by this endpoint now show the real admin's email in `created_by` (not the literal string `"admin"`), when Cloudflare Access supplies one.
- [ ] No unexpected spike in 5xx or 403 responses on `/api/admin/orders*` in Cloudflare's request logs/analytics in the minutes following deploy.

---

## 4. Known, accepted limitations

- The idempotency guarantee relies on an application-level check-then-insert against `payment_events` (no new unique DB index was added in B1, per instruction — "if a perfect DB-level unique guarantee needs a new index, do not create it in B1"). A genuinely simultaneous double-click race is narrowed by the existing email de-dup guard's second condition (`bankTransferConfirmation?.idempotent !== true`) but is not fully eliminated at the database level. Document as optional future hardening: a partial unique index on `payment_events (order_id, event_type) WHERE event_type = 'bank_transfer_payment_confirmed'`.
- The pre-existing symmetric gap on the **rejection** side (`payments`/`payment_events` are similarly never updated when a bank-transfer order is marked `mark_bank_transfer_not_received`) was deliberately left unaddressed in B1, per instruction, and remains for a future batch.
- `bank_accounts:manage`-style follow-on hardening, refund/invoice endpoint coverage, and RBAC are all A1.2c concerns, already shipped separately and unaffected by B1.
- This is the final planned scope of B1. No further batch has been started or approved.
