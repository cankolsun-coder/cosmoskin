# COSMOSKIN R1B — Review Image Upload Failure Rollback Plan

**Date:** 2026-07-06  
**Scope:** R1B only

## Rollback target

Revert only R1B implementation files:

- `functions/api/reviews/[[path]].js`
- `js/reviews.js`
- `scripts/validate-r1b-review-image-upload-failure.mjs`
- `scripts/validate-r1-admin-review-image-visibility.mjs` (R1B marker updates)
- `tests/local-integration.test.mjs` (R1B test additions)
- R1B delivery docs

Do not modify migrations, SQL, storage policies, admin auth/RBAC, checkout, coupons, refunds, inventory, bank transfer, email, or product pricing.

## Safe rollback steps

1. Revert the R1B commit or restore the listed files from pre-R1B state.
2. Run:

```bash
node --check js/reviews.js
node --check 'functions/api/reviews/[[path]].js'
node scripts/validate-r1-admin-review-image-visibility.mjs
node scripts/validate-i1-inventory-checkout-blocking.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## Expected rollback effect

Rolling back R1B restores the pre-R1B upload validation behavior:

- `instanceof File` requirement returns
- MIME validation trusts `file.type` before sniffing
- Valid images with empty/unreliable multipart MIME may fail again
- Frontend may use stale cached session during upload

R1 admin image visibility behavior remains from the R1 commit if only R1B is rolled back.

## Data impact

R1B does not create migrations or run SQL. `review_images` rows created while R1B was active remain valid.
