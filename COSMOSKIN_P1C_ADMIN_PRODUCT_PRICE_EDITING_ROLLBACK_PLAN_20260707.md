# COSMOSKIN P1C — Admin Product Price Editing Rollback Plan

Date: 2026-07-07

## Rollback trigger

- Override prices cause incorrect checkout charges
- Audit logging failures block legitimate updates
- Storefront/checkout price mismatch detected in production

## Code rollback

1. Revert P1C commit(s) for:
   - `functions/api/_lib/product-pricing.js`
   - `functions/api/admin/products/[slug]/price.js`
   - `functions/api/catalog/effective-prices.js`
   - checkout/coupon/admin UI changes
   - migration file (keep DB if already applied — see data rollback)

2. Redeploy previous Pages bundle.

3. Run validators:

```bash
node scripts/validate-p1a-product-price-source-drift.mjs
node scripts/validate-p1b-admin-product-price-readonly.mjs
node --test tests/local-integration.test.mjs
```

## Data rollback (if migration was applied)

**Option A — disable overrides (fast):**

```sql
UPDATE public.product_price_overrides SET is_active = false;
```

Checkout and storefront fall back to static catalog prices.

**Option B — drop tables (destructive, only if no audit retention needed):**

```sql
DROP TABLE IF EXISTS public.product_price_audit_logs;
DROP TABLE IF EXISTS public.product_price_overrides;
```

Run only with explicit approval; preserves orders/refunds unaffected.

## Historical orders

No order snapshot changes required — paid prices remain on `order_items`.

## Re-apply

Restore P1C code, re-apply migration if dropped, redeploy, run P1C validator chain.
