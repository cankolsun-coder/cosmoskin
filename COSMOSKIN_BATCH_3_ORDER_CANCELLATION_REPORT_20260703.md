# COSMOSKIN Batch 3 — Customer Order Cancellation Report (2026-07-03)

## Scope

Customer-initiated order cancellation **before shipment** in the Account tab (`account-dashboard.js`) only. No loyalty ledger, iyzico callback, checkout, returns API, admin flows, or legacy `order-detail.js`.

## Behaviour

### A. Direct cancel (unpaid / open payment)

Eligible when order/payment status is among: `pending`, `pending_payment`, `pending_bank_transfer`, `payment_failed`, or payment_status `pending` / `initiated` / `awaiting_transfer` / `failed` / `authorized` — and hard blocks do not apply.

Actions:

- `orders.status = cancelled`, `fulfillment_status = cancelled`, `payment_status = failed` (allowed by existing CHECK)
- `cancelled_at`, `cancelled_by = customer`, `cancel_reason`, `cancellation_status = cancelled`
- Release **reserved** inventory via `releaseInventoryReservations(..., 'customer_cancelled')`
- Release `coupon_redemptions` for the order (`status = released`)
- Fail open non-paid `payments` rows
- `order_status_events`: `event_type = cancel_order`, `source = customer`

UI: **Siparişi İptal Et**

### B. Cancel request (paid, not shipped)

Eligible when `payment_status = paid` and order status is `paid` / `confirmed` / `preparing` / `packed`, with no tracking/shipment block.

Actions:

- **Does not** change `payment_status`, call iyzico, restock, or release coupons
- Sets `cancel_requested_at`, `cancel_request_reason`, `cancellation_status = request_pending`
- `order_status_events`: `event_type = customer_cancel_requested`, `source = customer`

Customer copy (toast + persistent note on card):

> İptal talebiniz alındı. Siparişiniz henüz kargoya verilmediği için talebiniz ekibimiz tarafından incelenecek. Ödeme alındıysa ücret iadesi kontrol sonrası başlatılır.

UI: **İptal Talebi Gönder**

### C. Hard server blocks (409)

Rejected when: terminal order/fulfillment statuses, any shipment with `tracking_number` or shipped/delivered status, active return request, or duplicate `cancel_requested_at` on paid orders.

## API

`POST /api/account/orders/:id/cancel`

- Auth: `requireUser`
- Ownership: `loadOwnedOrderBundle` (user_id or customer_email)
- Reloads order + shipments + returns immediately before mutation
- Body: `{ reason?: string }` (optional, persisted)
- Turkish-friendly errors; no raw Supabase messages

## Database

Migration: `supabase/migrations/20260703_batch3_customer_order_cancellation.sql`

See `COSMOSKIN_BATCH_3_ORDER_CANCELLATION_SUPABASE_NOTES_20260703.md`.

## Files

See `COSMOSKIN_BATCH_3_ORDER_CANCELLATION_CHANGED_FILES_20260703.txt`.

## Deferred

- Batch 4: loyalty ledger / Club points on cancel
- Optional transactional email on cancel request
- Admin approval workflow UI for cancel requests (admin APIs unchanged in this batch)

## Validation

```bash
node --check functions/api/_lib/order-cancellation.js
node --check functions/api/account/orders/[id]/cancel.js
node --check assets/account-dashboard.js
node scripts/validate-account-batch-3-order-cancellation.mjs
node scripts/validate-account-batch-1-safe-fixes.mjs
node scripts/validate-account-ui-polish.mjs
node scripts/validate-account-runtime-hotfix.mjs
node scripts/validate-account-experience-final-polish.mjs
node scripts/validate-checkout-payment-email-e2e.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## Test results

All checks passed on 2026-07-03:

- `node --check` — order-cancellation.js, cancel.js, account-dashboard.js
- `validate-account-batch-3-order-cancellation.mjs` — passed
- Batch 1 / Batch 2 / runtime / final-polish validators — passed
- `validate-checkout-payment-email-e2e.mjs` — passed
- `validate-production-launch-readiness.mjs` — passed
- `tests/local-integration.test.mjs` — 20/20 passed
