# COSMOSKIN P1C2 Effective Price Commerce Integrity Runbook

## Purpose

Use this runbook after admin price overrides are enabled to verify PDP, PLP, cart, checkout, coupons, KDV, inventory, refunds, and order history all use the same trusted effective price model.

## Manual Smoke Test

1. Ensure P1C migration has been applied in the target environment.
2. In admin products, set `beauty-of-joseon-relief-sun-spf50` to `1099 TRY`.
3. Open `/products/beauty-of-joseon-relief-sun-spf50.html`.
4. Confirm the PDP main price, mobile/sticky PDP price, related card buttons, and favorite/add-to-cart payloads resolve to `1099 TRY` after product data loads.
5. Add the product to cart from PDP.
6. Confirm cart subtotal, KDV summary, free-shipping progress, and checkout summary use `1099 TRY`.
7. Submit checkout with a deliberately stale client/localStorage price. Server checkout must still create order lines at `1099 TRY`.
8. Confirm old orders created before the override still show paid historical prices.
9. Confirm return/refund pages use paid snapshots, not current product override.

## Required Checks

Run from repository root:

```sh
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1c-effective-price-display-parity.mjs
node scripts/validate-p1c-admin-product-price-editing.mjs
node scripts/validate-p1b-admin-product-price-readonly.mjs
node scripts/validate-p1a-product-price-source-drift.mjs
node scripts/validate-production-launch-readiness.mjs
node scripts/validate-i1-inventory-checkout-blocking.mjs
node scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs
node scripts/validate-c1b-coupon-exclusions-metadata.mjs
node scripts/validate-c1-coupon-eligibility-hardening.mjs
node scripts/validate-d3-refund-snapshot-persistence.mjs
node scripts/validate-d2b-refund-discount-proration.mjs
node scripts/validate-d2-refund-amount-correctness.mjs
node --test tests/local-integration.test.mjs
```

Expected result: all pass. `validate-p1a-product-price-source-drift.mjs` may print the known fallback updated-stamp warning while still passing.

## Cache Expectations

- `/api/catalog/effective-prices` must return `Cache-Control: no-store, max-age=0`.
- Frontend effective-price fetch must use `cache: 'no-store'`.
- Static PDP HTML can first-paint old catalog text, but JavaScript must rerender effective price and button datasets after `COSMOSKIN_PRODUCTS_READY`.

## Operational Notes

- Do not edit `products.json` for admin price changes.
- Do not run SQL from this runbook.
- Do not deploy from this runbook unless explicitly requested.
- If effective prices do not load, checkout remains protected because `create-checkout.js` resolves prices server-side.
