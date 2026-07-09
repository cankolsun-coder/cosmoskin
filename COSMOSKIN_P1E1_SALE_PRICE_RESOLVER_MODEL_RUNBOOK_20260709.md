## COSMOSKIN — P1E1 Runbook (2026-07-09)

### Goal
Introduce sale/compare-at schema + resolver model safely (no UI yet).

### Checks (local)

```bash
node scripts/validate-p1e1-sale-price-resolver-model.mjs
node scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs
node scripts/validate-p1c3-effective-price-fallback-hardening.mjs
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1c-admin-product-price-editing.mjs
node scripts/validate-p1d-admin-product-price-history.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-c2-cart-checkout-coupon-parity.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

### Notes
- Do not run the migration in Cursor.
- P1E2 (admin UI) is intentionally not included.

