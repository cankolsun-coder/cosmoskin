# COSMOSKIN C4 — Checkout Order Creation After Coupon

**Date:** 2026-07-09

## Symptom

- WELCOME10 validates correctly in checkout UI (server discount ₺150, total ₺2,377).
- Clicking **Siparişi Oluştur** (Havale/EFT) failed with generic:
  `Checkout başlatılamadı. Lütfen kısa süre sonra tekrar deneyin.`

## Failing request

| Field | Value |
|-------|-------|
| Endpoint | `POST /api/create-checkout` |
| Payment method | `bank_transfer` |
| Coupon | `WELCOME10` via `coupon_code` |
| Cart | `cosrx-advanced-snail-96-mucin-essence` × 2 |
| Auth | `accessToken` (logged-in first-order customer) |
| HTTP status | **500** |
| Response code | `CHECKOUT_INTERNAL_ERROR` |

Coupon validation and totals were correct; failure occurred during **order persistence** after inventory reservation.

## Root cause

`create-checkout.js` inserted `order_items` by spreading normalized cart lines:

```js
{ ...item, order_id: orderId }
```

`normalizeCart()` attaches **`category`** and **`categorySlug`** for coupon eligibility (C1B). These are **not** `order_items` table columns. PostgREST rejects the insert → uncaught persistence error → generic 500.

Coupon checkout made this path more visible because:
1. Coupon revalidation succeeded (auth + first-order context present).
2. D3A pricing snapshots were built and written in the same `order_items` insert.
3. Any insert failure surfaced only at final submit, not at coupon apply.

## Fix

1. **`serializeOrderItemInsertRow()`** — whitelist only valid `order_items` columns (+ D3A snapshot fields).
2. **`persistOrderItems()`** — use serializer; fallback to `metadata.pricing_snapshot` if D3A columns missing in DB (no migration required for fallback path).
3. **`mapPersistenceError()`** — map known persistence/schema errors to structured `CheckoutError` instead of opaque 500.
4. **`formatCheckoutApiError()`** in `checkout-flow.js` — show specific coupon/stock/payment/consent messages from server `code`/`message`/`items`.

## Behavior after fix (fixture)

| Field | Value |
|-------|-------|
| Subtotal | ₺2,438 |
| WELCOME10 discount | ₺150 (server cap) |
| Shipping | ₺89 |
| Total | **₺2,377** |
| Bank transfer order | `pending_bank_transfer` / `awaiting_transfer` |
| Payment row | `bank_transfer` / `awaiting_transfer` / amount ₺2,377 |
| order_items | `allocated_order_discount: 150`, no `category` fields |

## Coupon / stock authority (unchanged)

- Server revalidates coupon; ignores client `totals.discount`.
- Coupon reserved (not consumed) on bank transfer order create per B1 rules.
- Stock revalidated server-side before reservation.

## SQL / migration / deploy

- **No SQL run**
- **No migration created**
- **No deploy**

## Tests

- Integration: **199/199** pass (4 new C4 tests)
- C4 validator + regression chain passed

## Files changed

See `COSMOSKIN_C4_CHECKOUT_ORDER_CREATION_AFTER_COUPON_CHANGED_FILES_20260709.txt`.
