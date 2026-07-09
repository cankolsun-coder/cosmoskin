## COSMOSKIN — P1E1 Rollback Plan (2026-07-09)

### What to revert
- `supabase/migrations/20260709_p1e_sale_compare_at_price.sql` (if applied elsewhere, create a follow-up rollback migration; do not drop data)
- `functions/api/_lib/product-pricing.js`
- `functions/api/catalog/effective-prices.js`
- `scripts/validate-p1e1-sale-price-resolver-model.mjs`
- `tests/local-integration.test.mjs`

### Expected rollback outcome
- Effective pricing returns to P1C regular override + static catalog only.
- Storefront and checkout continue to use payable effective price (no sale model).
- No order/refund behavior changes either way (snapshots remain authoritative).

### Verification after rollback

```bash
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1d-admin-product-price-history.mjs
node --test tests/local-integration.test.mjs
```

