# COSMOSKIN P1C3 Effective Price Fallback Hardening Rollback Plan

Date: 2026-07-07

## Scope

Rollback only P1C3 frontend fallback hardening. Do not roll back P1C2 commerce integrity or P1C admin price editing unless separately approved.

## Fast Rollback

Revert the P1C3 commit or restore these files from pre-P1C3 state:

- `js/search.js`
- `assets/bestsellers.js`
- `assets/js/smart-routine.js`
- `assets/pdp-professional.js`
- `scripts/validate-p1c3-effective-price-fallback-hardening.mjs`
- `tests/local-integration.test.mjs`
- P1C3 docs in repo root

## Post-Rollback Behavior

- Checkout/coupon/order integrity remain safe via P1C2 server-side effective pricing.
- Search may again show static `/products.json` prices if `COSMOSKIN_PRODUCTS_READY` fails.
- Bestsellers/smart routine may remain stale until full page reload after admin override.
- PDP club points may again derive from static DOM fallback before overlay.

## Do Not Roll Back

- `functions/api/returns.js` paid snapshot preference from P1C2 unless refund correctness regresses.
- `functions/api/catalog/effective-prices.js`
- `functions/api/_lib/product-pricing.js`
- P1C migration or admin price API

## Verification After Rollback

```bash
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1c-effective-price-display-parity.mjs
node --test tests/local-integration.test.mjs
```

## Data Safety

- No migration to reverse.
- No SQL rollback required.
- `products.json` unchanged.
