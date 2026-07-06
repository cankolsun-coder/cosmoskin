# COSMOSKIN R1 — Admin Review Image Visibility Rollback Plan

**Date:** 2026-07-06  
**Scope:** R1 only

## Rollback Target

Rollback only the R1 implementation files:

- `js/reviews.js`
- `functions/api/reviews/[[path]].js`
- `admin/reviews/index.html`
- `scripts/validate-r1-admin-review-image-visibility.mjs`
- `tests/local-integration.test.mjs` R1 test additions
- R1 delivery docs

Do not modify migrations, SQL, storage policies, admin auth/RBAC, checkout, coupons, refunds, inventory, bank transfer, email, or product pricing.

## Safe Rollback Steps

1. Revert the R1 commit or restore the listed files from the pre-R1 commit.
2. Confirm `POST /api/reviews/images` remains retired if reverting manually.
3. Run:

```bash
node --check js/reviews.js
node --check 'functions/api/reviews/[[path]].js'
node scripts/validate-i1-inventory-checkout-blocking.mjs
node scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs
node scripts/validate-c1b-coupon-exclusions-metadata.mjs
node scripts/validate-c1-coupon-eligibility-hardening.mjs
node scripts/validate-d3-refund-snapshot-persistence.mjs
node scripts/validate-d2b-refund-discount-proration.mjs
node scripts/validate-d2-refund-amount-correctness.mjs
node scripts/validate-d1-returns-refunds-correctness.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## Expected Rollback Effect

Rolling back R1 restores the previous bug: PDP image uploads may no longer create `review_images` rows, so admin reviews may again show no images for new PDP review submissions.

## Data Impact

R1 does not create migrations and does not run SQL. Rollback does not require schema cleanup. Any `review_images` rows created while R1 was active are valid rows and can remain.
