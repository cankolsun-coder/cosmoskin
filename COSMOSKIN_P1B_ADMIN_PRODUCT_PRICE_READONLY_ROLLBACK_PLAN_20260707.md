# COSMOSKIN P1B — Admin Product Price Read-Only Rollback Plan

Date: 2026-07-07

## Rollback trigger

- Admin price display causes confusion or incorrect formatting
- API payload size concerns (unlikely)
- Validator false positives block unrelated work

## Rollback steps

1. Revert P1B files:
   - `functions/api/admin/products.js`
   - `assets/admin-products.js`
   - `admin/products.html`
   - `scripts/validate-p1b-admin-product-price-readonly.mjs`
   - `COSMOSKIN_P1B_ADMIN_PRODUCT_PRICE_READONLY_*`
   - P1B tests in `tests/local-integration.test.mjs`
   - P1B exempt line in `scripts/validate-a1-admin-endpoint-coverage.mjs`

2. Confirm catalog/checkout files were not modified.

3. Re-run baseline validators:

```bash
node scripts/validate-p1a-product-price-source-drift.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## Production impact of rollback

Admin loses read-only catalog price column. **No impact** on storefront prices, checkout, coupons, refunds, or inventory blocking.

## Data impact

None. No migrations or order data changes.

## Re-apply

Restore P1B commit from git history and run:

```bash
node scripts/validate-p1b-admin-product-price-readonly.mjs
```
