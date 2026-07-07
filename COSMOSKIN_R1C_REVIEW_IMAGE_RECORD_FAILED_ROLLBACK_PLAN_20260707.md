# COSMOSKIN R1C — Review Image Record Failed — Rollback Plan

**Date:** 2026-07-07  
**Scope:** R1C only

## Rollback target

Rollback only R1C changes:

- `functions/api/reviews/[[path]].js`
- `scripts/validate-r1c-review-image-record-failed.mjs`
- `tests/local-integration.test.mjs` (R1C tests)
- R1C delivery docs

Do not modify migrations, SQL, storage policies, admin auth/RBAC, checkout, coupons, refunds, inventory, bank transfer, email, or product pricing.

## Rollback steps

1. Revert the R1C commit (or restore the files listed above).
2. Run:

```bash
node --check 'functions/api/reviews/[[path]].js'
node scripts/validate-r1b-review-image-upload-failure.mjs
node scripts/validate-r1-admin-review-image-visibility.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## Expected rollback effect

Rolling back R1C restores the previous behavior where, if a storage upload succeeds but the `review_images` DB insert fails, the API will:

- return `image_record_failed` without attempting storage cleanup, and
- not retry insert without `storage_path` on schema-lag environments.

## Data impact

R1C does not create migrations or run SQL. Uploaded images that were successfully inserted into `review_images` remain valid.
