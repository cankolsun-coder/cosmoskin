# COSMOSKIN P1C — Admin Product Price Editing Runbook

Date: 2026-07-07

## Pre-deploy

1. Run locally:

```bash
node scripts/validate-p1c-admin-product-price-editing.mjs
node scripts/validate-p1b-admin-product-price-readonly.mjs
node scripts/validate-p1a-product-price-source-drift.mjs
node --test tests/local-integration.test.mjs
```

2. Review migration: `supabase/migrations/20260707_p1c_admin_product_price_editing.sql`

## Deploy sequence

1. **Apply migration in Supabase** (not from Cursor):

```sql
-- Run file contents in Supabase SQL editor or migration pipeline
```

2. Deploy Cloudflare Pages bundle (API functions + static assets).

3. Smoke test:
   - Admin with `products:pricing:update` (owner) edits a test product price
   - Storefront shows updated price on PLP/PDP after refresh
   - Coupon preview subtotal matches checkout
   - Test checkout charges override price
   - Audit row appears in `product_price_audit_logs`

## Admin usage

1. Open `/admin/products.html`
2. Load products with admin token
3. If permitted, enter new TRY price + optional note
4. Click **Fiyatı güncelle** (separate from inventory **Kaydet**)

## Validator

```bash
node scripts/validate-p1c-admin-product-price-editing.mjs
```

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Price edit 403 | Admin lacks `products:pricing:update` |
| Price edit 500 audit failed | `product_price_audit_logs` table missing |
| Storefront stale price | `/api/catalog/effective-prices` + `products-data.js` deployed |
| Checkout old price | `buildPricedCatalogIndex` in `create-checkout.js` deployed |
| Override ignored | `product_price_overrides.is_active = true` and valid integer TRY |

## Out of scope

- Do not edit `products.json` manually for admin price changes
- Do not use inventory PATCH for price updates
