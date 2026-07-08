# COSMOSKIN P1D Admin Price Audit History — Rollback Plan

Date: 2026-07-07

## Scope

Rollback the read-only audit history API + UI introduced in P1D.

Do not roll back P1C price editing, override resolver, checkout/coupon trust, or P1C4 PDP runtime fixes unless separately approved.

## Rollback steps

Revert the P1D commit or restore these files to pre-P1D state:

- `functions/api/admin/products/[slug]/price-history.js`
- `assets/admin-products.js` (remove the history `<details>` section + fetch)
- `scripts/validate-p1d-admin-price-audit-history.mjs`
- `tests/local-integration.test.mjs`
- P1D docs in repo root

## Post-rollback behavior

- Admin can no longer view price change history in the UI.
- Audit logs are still written by P1C (DB-backed) and remain available in the database.
- Checkout/coupon/refund/inventory behavior remains unchanged.

## Verify after rollback

```bash
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1c-admin-product-price-editing.mjs
node --test tests/local-integration.test.mjs
```

