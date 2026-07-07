# COSMOSKIN P1C2 Effective Price Commerce Integrity Rollback Plan

## Scope

Rollback only P1C2 code changes. Do not roll back P1A/P1B/P1C migrations or committed pricing infrastructure unless explicitly required.

## Code Rollback

Revert these P1C2 files as a single code rollback:

- `assets/app.js`
- `assets/checkout-flow.js`
- `assets/mobile-redesign.js`
- `assets/product-page.js`
- `assets/products-data.js`
- `functions/api/admin/products/[slug]/price.js`
- `functions/api/catalog/effective-prices.js`
- `functions/api/returns.js`
- `scripts/validate-b1-bank-transfer-finalization.mjs`
- `tests/local-integration.test.mjs`
- `scripts/validate-p1c-effective-price-commerce-integrity.mjs`
- `scripts/validate-p1c-effective-price-display-parity.mjs`
- P1C2 docs created on 2026-07-07

## Data Rollback

No P1C2 SQL was run and no P1C2 migration was created. If a runtime price override must be undone operationally, update or deactivate the relevant row in `product_price_overrides` through the approved admin/DB process and preserve audit trail. Do not edit `products.json`.

## Validation After Rollback

Run:

```sh
node scripts/validate-p1c-admin-product-price-editing.mjs
node scripts/validate-p1b-admin-product-price-readonly.mjs
node scripts/validate-p1a-product-price-source-drift.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## Risk

Rolling back P1C2 can reintroduce PDP/cart display divergence where storefront surfaces show static catalog prices while checkout charges the trusted server effective price. If rollback is required, consider temporarily disabling admin price edits or communicating that checkout is authoritative until the display fix is restored.
