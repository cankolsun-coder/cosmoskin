## COSMOSKIN — P1E2 Rollback Plan (2026-07-09)

### Revert files
- `functions/api/_lib/product-pricing.js`
- `functions/api/admin/products.js`
- `functions/api/admin/products/[slug]/price.js`
- `functions/api/admin/products/[slug]/price-history.js`
- `assets/admin-products.js`
- `admin/products.html`
- `scripts/validate-p1e2-admin-sale-price-editing.mjs`
- `tests/local-integration.test.mjs`

### Outcome
- Admin returns to regular-price-only editing (P1C/P1D)
- P1E1 resolver remains (sale fields ignored if unset in DB)
- No customer storefront impact (P1E3 not shipped)

### Verify after rollback
```bash
node scripts/validate-p1c-admin-product-price-editing.mjs
node scripts/validate-p1e1-sale-price-resolver-model.mjs
node --test tests/local-integration.test.mjs
```
