# COSMOSKIN P1B — Admin Product Price Read-Only Runbook

Date: 2026-07-07

## When to run

- After any change to admin products API/UI
- Before merging catalog price visibility work
- Alongside P1A drift guard in pre-deploy checks

## Primary command

```bash
node scripts/validate-p1b-admin-product-price-readonly.mjs
```

Expected: exit 0, message `P1B admin product price read-only validation passed`.

## Full P1B regression chain

```bash
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

## Manual admin verification

1. Start wrangler: `npx wrangler pages dev . --compatibility-date=2024-06-01`
2. Open `/admin/products.html`
3. Load products with admin token
4. Confirm **Katalog Fiyatı** column shows TRY prices and “Kaynak: products.json”
5. Confirm no editable price field exists
6. Save stock/SKU changes still work; price is not submitted

## Missing catalog price

If inventory exists without a catalog slug match, the row shows:

> Bu ürün için katalog fiyatı bulunamadı.

Fix by aligning `product_inventory.product_slug` with `products.json` slug or adding the product to the canonical catalog (then regenerate copies per P1A runbook).

## Out of scope

- Deploy
- SQL / migrations
- Admin price editing (P1C)
- Changing checkout, coupon, refund, or inventory runtime logic
