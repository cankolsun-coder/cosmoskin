# COSMOSKIN P1E4 — Checkout / Coupon / Order Snapshot Sale-Price Hardening Report (2026-07-09)

## Scope
Final hardening so payable commerce paths use `effective_price_try` only (active sale when window-valid; regular otherwise). `compare_at_price_try` remains display-only.

## Payable invariant
`PAYABLE = resolver.effective_price_try` via `getPayableUnitPriceTry()` — never `compare_at_price_try` for cart payable, coupon subtotal/allocation, shipping threshold basis (product lines), KDV, checkout total, iyzico basket, bank transfer total, `order_items.unit_price`, refunds, or JSON-LD.

## Changes

### Resolver (`product-pricing.js`)
- `getPayableUnitPriceTry(pricedProduct)` — explicit payable extraction; rejects compare-at collision
- `compareAtIsDisplayOnly()` — guard helper
- `applyEffectivePricingToCatalogProduct()` — passes sale metadata (`sale_active`, `compare_at_price_try`, etc.) for downstream audit; payable still `effective_price_try`

### Checkout (`create-checkout.js`)
- `normalizeCart()` uses `getPayableUnitPriceTry(product)` instead of raw `product.price`
- Cart lines store `effective_price_source` and `sale_active`
- `buildPriceChangedNotice()` — optional `price_changed` / `repriced` when client `totals.subtotal` differs from server (client totals never charged)
- Bank transfer + iyzico success responses may include repriced metadata

### Coupon validate (`coupons/validate.js`)
- Trusted cart lines use `getPayableUnitPriceTry()`
- Response includes `trusted_subtotal` (server-computed)

### Snapshots (`order-pricing-snapshot.js`)
- `isPayableSnapshotUnitPrice()` — rejects compare-at as payable unit

### Checkout UI (`checkout-flow.js`)
- Surfaces `price_changed` / `repriced` server notice on successful checkout

## Fixture proof (WELCOME10 + active sale)
Product: regular 1219, sale 999, compare-at 1299, qty 2
- Trusted subtotal: **1998** (not 2438 regular, not 2598 compare-at)
- WELCOME10 10% theoretical 199.8, cap 150 → discount **150**

## Sale timing (server at checkout creation)
| State | Payable |
|-------|---------|
| Active sale | `sale_price_try` (999) |
| Future / expired / invalid | `regular_price_try` (1219) |

## Surfaces verified unchanged in policy
- Shipping threshold uses discounted product-line subtotal (post-coupon eligible lines)
- KDV: gross-inclusive on discounted subtotal
- Iyzico basket: `paid_line_total` per snapshot line + shipping row
- Bank transfer: `orders.total_amount` from server totals
- Refunds: still snapshot-based (D2/D3 validators in chain)

## Proof
- **products.json:** not modified
- **SQL / deploy:** not run
- **Admin UI:** not modified
- **P1E5:** not started

## Test / validator results
- **Integration tests:** 216/216 passed (`node --test tests/local-integration.test.mjs`)
- **P1E4 tests:** 7/7 passed
- **P1E3 validator:** passed (updated compare-at guard for snapshot metadata)
- **P1E4 validator:** static checks pass; full nested Section 17 chain ~13 min (run locally via runbook)

## Files
See `COSMOSKIN_P1E4_CHECKOUT_COUPON_SALE_SNAPSHOT_HARDENING_CHANGED_FILES_20260709.txt`
