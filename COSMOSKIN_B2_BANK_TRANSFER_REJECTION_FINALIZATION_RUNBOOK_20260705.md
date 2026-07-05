# COSMOSKIN B2 — Bank Transfer Rejection / Cancellation Finalization — Runbook

**Purpose:** verify B2 in a Cloudflare Pages preview deployment before any production deploy. Do not run these steps against production.

## Prerequisites

- A1 Cloudflare Access verification is complete and the owner can reach the admin order mutation endpoints in preview.
- B1's own runbook smoke test (bank-transfer **approval**) has already passed in preview — B2 assumes B1 is already verified.
- A test bank-transfer order exists in preview with `payment_method = 'bank_transfer'` and `payment_status = 'awaiting_transfer'` (create one via a real preview checkout using the Havale/EFT payment method, or ask an engineer to seed one directly in Supabase for the preview project).

## Local verification (already done, repeat if needed)

```bash
node --check functions/api/_lib/commerce-finalization.js
node --check functions/api/admin/orders.js
node --check "functions/api/admin/orders/[id]/status.js"
node scripts/validate-b2-bank-transfer-rejection-finalization.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

All of the above must pass with 0 failures before touching preview.

## Preview smoke test 1 — reject via `admin/orders.js` (`mark_bank_transfer_not_received`)

1. Open the admin panel in the preview deployment and sign in with an account that has `orders:update`.
2. Find the seeded pending bank-transfer test order.
3. Click "Havale/EFT ödemesi alınamadı" (or the equivalent reject action wired to `mark_bank_transfer_not_received`).
4. Confirm the response is `200 ok: true` and the payload includes `bank_transfer_rejection: { ok: true, idempotent: false, blocked: false, ... }`.
5. In Supabase (preview project), verify:
   - `orders.payment_status = 'failed'`, `orders.status = 'cancelled'`, `orders.fulfillment_status = 'cancelled'` for the test order.
   - `payments` row for this order has `status = 'failed'`.
   - A new `payment_events` row exists with `event_type = 'bank_transfer_payment_rejected'`, `provider = 'bank_transfer'`, and `metadata.rejected_by_email` set to the signed-in admin's email.
   - If the order had a coupon, `coupon_redemptions.status = 'released'`.
   - `invoice_records` has **no** row for this order.
   - `email_events` has exactly one new row for this order (email_type may show as `order_created` due to the known, unfixed `EMAIL_TYPES` allowlist bug — that is expected, not a regression).
6. Click the same reject action **again** on the same (now-cancelled) order.
7. Confirm the response now shows `bank_transfer_rejection: { ok: true, idempotent: true }`.
8. Verify no second `payment_events` row was created and no second customer email was sent (still exactly 1 row in `email_events` for this order).

## Preview smoke test 2 — reject via `admin/orders/[id]/status.js`

1. Seed a second pending bank-transfer test order.
2. `PATCH /api/admin/orders/{id}/status` with `{ "status": "cancelled" }`, signed in as the same admin.
3. Confirm `bank_transfer_rejection.idempotent === false` in the response.
4. Verify the same Supabase state as smoke test 1 (payments/payment_events/orders).
5. Verify the `order_status_events` row for this transition has `created_by` set to the real admin email (this route previously never set `created_by` at all — confirm this fix landed).
6. Repeat the same PATCH call and confirm `bank_transfer_rejection.idempotent === true`, with no duplicate `payment_events` row.

## Preview smoke test 3 — already-paid protection

1. Take a test order that is already `payment_status = 'paid'` (e.g. the B1 runbook's approved test order).
2. Attempt to reject it via either route (`mark_bank_transfer_not_received` or `status: 'cancelled'`).
3. Confirm you get the pre-existing `409` "Ödemesi alınmış sipariş doğrudan iptal edilemez..." response — the request must be blocked **before** any B2 code runs.
4. Verify in Supabase that the order's `payment_status` is still `paid` and no new `payment_events` row was created.

## Preview smoke test 4 — card order regression check

1. Take any card-payment (`payment_method = 'iyzico'`) test order in `pending_payment`.
2. Cancel it via the normal admin flow (`cancel_order` or `status: 'cancelled'`).
3. Confirm the response's `bank_transfer_rejection` is `null` (the helper must never run for a card order).
4. Confirm a completed card-payment (iyzico callback) flow elsewhere in preview still succeeds normally (unrelated to this change, but worth a quick spot check since this batch touched two shared admin files).

## Rollback trigger

If any of the above smoke tests fail, or if `payment_events`/`payments` show unexpected duplicate rows, or if a customer email is sent twice, stop and follow `COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_ROLLBACK_PLAN_20260705.md`.
