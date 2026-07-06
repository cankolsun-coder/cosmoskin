# COSMOSKIN I1 — Inventory Availability & Checkout Blocking Report

**Date:** 2026-07-06  
**Batch:** I1  
**Status:** Implemented (not deployed)

---

## Summary

I1 closes the reported stock bypass: out-of-stock favorites could be added to cart, desktop cart checkout stayed enabled, and checkout UI could proceed until the final API call. Stock is now enforced consistently on favorites add-to-cart, desktop cart, checkout UI (load/submit/step), and `create-checkout.js` with structured server errors.

---

## Trusted stock source

| Field | Source |
|-------|--------|
| Table | `product_inventory` |
| On hand | `stock_on_hand` |
| Reserved | `stock_reserved` |
| Status | `active` / `inactive` / `discontinued` |
| Backorder | `allow_backorder` |
| Available | `stock_on_hand - stock_reserved` (via `normalizeInventoryRow`) |

`products.json` / `COSMOSKIN_PRODUCTS` is **not** authoritative for stock.

---

## Files changed

See `COSMOSKIN_I1_INVENTORY_CHECKOUT_BLOCKING_CHANGED_FILES_20260706.txt`.

### Backend
- **`functions/api/_lib/inventory.js`** — `validateCartStock()`, reason codes on `buildCheckItem()`, Turkish `STOCK_VALIDATION_MESSAGES`
- **`functions/api/create-checkout.js`** — uses shared validator; structured `{ error, message, items[] }` on stock failures; no order/payment/reservation when stock invalid

### Frontend
- **`assets/inventory-client.js`** — `validateCartPurchasable`, `getCartBlockingItems`, `favoriteStockState`, `stockQuantityLimit`
- **`assets/account-dashboard.js`** — favorites use live inventory; `validateAdd` before cart write; stock badge on favorites
- **`assets/master-upgrade.js`** — desktop cart disables checkout when blocked; quantity capped; warning copy
- **`assets/checkout-flow.js`** — `refreshStockGate` on init/cart update/submit; blocking UI when stock invalid

### Tests / validators
- **`scripts/validate-i1-inventory-checkout-blocking.mjs`** (new)
- **`tests/local-integration.test.mjs`** — I1 unit/integration cases
- **`scripts/validate-a1-admin-endpoint-coverage.mjs`** — I1 exemption for `inventory.js` / `create-checkout.js`
- **`scripts/validate-account-batch-4-loyalty-ledger.mjs`** — I1 exemption for `checkout-flow.js`

---

## Favorite add-to-cart fix

- Favoriting OOS products remains allowed.
- `addToCart()` calls `COSMOSKIN_STOCK.validateAdd()` (server-backed `/api/inventory/check`).
- Favorites render live stock via `favoriteStockState()` after `loadInventory()`.
- Button shows **Stokta yok** and is disabled when unavailable.
- Static catalog `stockInfo()` no longer defaults unknown products to sellable.

---

## Desktop cart checkout blocking

- `cartBlockingItems()` mirrors mobile logic.
- Checkout CTA disabled with warnings when any line is blocked.
- Quantity increases capped to `available_stock`.
- Proceed click revalidates via `validateCartPurchasable()`.

---

## Checkout page blocking

- Stock validated on page init (`refreshStockGate`).
- Revalidated on cart updates and before final submit.
- `stockBlocked` disables primary CTA and shows blocking empty state with link to cart.
- Direct `/checkout.html` navigation cannot proceed with invalid cart.

---

## create-checkout structured errors

Example:

```json
{
  "ok": false,
  "code": "OUT_OF_STOCK",
  "error": "stock_unavailable",
  "message": "Sepetinizde stokta olmayan ürünler var.",
  "items": [
    {
      "product_id": "beauty-of-joseon-relief-sun-spf50",
      "slug": "beauty-of-joseon-relief-sun-spf50",
      "name": "Relief Sun: Rice + Probiotics SPF 50+ PA++++",
      "requested_quantity": 1,
      "available_quantity": 0,
      "reason": "out_of_stock",
      "message": "Bu ürün şu anda stokta yok."
    }
  ]
}
```

Reason codes: `product_not_found`, `product_inactive`, `out_of_stock`, `insufficient_stock`, `reservation_failed`, `cart_invalid`.

---

## Reservation behavior preserved

- `reserve_order_inventory` RPC unchanged.
- `releaseInventoryReservations` on checkout/payment failures unchanged.
- Expired reservation cron unchanged.
- Bank transfer pending reservation window unchanged.
- **No migration. No SQL run.**

---

## Regression proof

| Validator | Result |
|-----------|--------|
| `validate-i1-inventory-checkout-blocking.mjs` | PASS |
| `validate-c1b2-admin-coupon-metadata-visibility.mjs` | PASS |
| `validate-c1b-coupon-exclusions-metadata.mjs` | PASS |
| `validate-c1-coupon-eligibility-hardening.mjs` | PASS |
| `validate-d3-refund-snapshot-persistence.mjs` | PASS |
| `validate-d2b-refund-discount-proration.mjs` | PASS |
| `validate-d2-refund-amount-correctness.mjs` | PASS |
| `validate-d1-returns-refunds-correctness.mjs` | PASS |
| `validate-h0-live-payment-rpc-hotfix.mjs` | PASS |
| `validate-production-launch-readiness.mjs` | PASS |
| `node --test tests/local-integration.test.mjs` | **126/126 PASS** |

---

## Known limitations

- Legacy cart drawer links on some PDP templates may still navigate to `/checkout.html`; checkout page blocks invalid carts server-side and in `checkout-flow.js`.
- `allow_backorder: true` continues to allow purchase per existing system rules (no new backorder UX).
- Account favorites stock badge updates after inventory API round-trip (brief “Stok kontrol ediliyor” state).

---

## Rollback

See `COSMOSKIN_I1_INVENTORY_CHECKOUT_BLOCKING_ROLLBACK_PLAN_20260706.md`.

---

*No deploy performed. R1 and product pricing audit not started.*
