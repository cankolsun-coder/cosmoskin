# COSMOSKIN P1A — Product Price Source Drift Guard Runbook

Date: 2026-07-07

## When to run

- Before merging any catalog price change
- Before starting P1B admin price editing
- In CI / pre-deploy readiness chain alongside existing validators

## Primary command

```bash
node scripts/validate-p1a-product-price-source-drift.mjs
```

Expected: exit 0, message `P1A product price source drift validation passed`.

Optional warning (non-failing today):

- Browser fallback `updated` stamp older than `products.json` while prices still match

## Full P1A regression chain

```bash
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

## Fixing a drift failure

1. Edit **`products.json`** only (canonical source).
2. Regenerate copies:
   - Update `functions/api/_lib/products-data.js` from `products.json` (existing project sync process).
   - Update `assets/products-data.js` embedded `FALLBACK_SOURCE` from `products.json`.
3. Re-run P1A validator until pass.
4. Do **not** hand-edit prices in generated copies without updating canonical JSON.

## Helper module (for tests/tools)

`scripts/lib/product-price-catalog.mjs` exports:

- `loadCanonicalCatalog()`
- `extractBrowserFallbackCatalog()`
- `loadServerCatalog()`
- `compareCatalogDocuments()`
- `normalizeCatalogPrice()`

## Local static server note

`python3 -m http.server 7700 --directory .` serves `products.json` and `assets/products-data.js` for manual PLP/PDP checks. Checkout API paths require `npx wrangler pages dev`.

## Out of scope

- Deploy
- SQL / migrations
- Admin price UI (P1B)
- Changing checkout, coupon, refund, or inventory runtime logic
