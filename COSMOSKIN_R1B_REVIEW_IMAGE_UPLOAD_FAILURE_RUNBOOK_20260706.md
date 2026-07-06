# COSMOSKIN R1B — Review Image Upload Failure Runbook

**Date:** 2026-07-06  
**Scope:** R1B only, no deploy included

## What changed

Review image upload now sniffs file bytes instead of trusting multipart `file.type` or requiring `instanceof File`. PDP refresh session before upload and surfaces safe backend error detail when image upload fails after review save.

## Verification commands

```bash
node --check js/reviews.js
node --check 'functions/api/reviews/[[path]].js'
node scripts/validate-r1b-review-image-upload-failure.mjs
node scripts/validate-r1-admin-review-image-visibility.mjs
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

## Manual smoke test

Use wrangler for API routes:

```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```

Steps:

1. Log in as a customer who can review a purchased product.
2. Submit a text-only review — should still succeed.
3. Submit a review with a JPEG under 2 MB (including one from mobile gallery if possible).
4. Network should show:
   - `POST /api/reviews` → 200
   - `POST /api/reviews/:reviewId/images` → 201
5. Confirm admin reviews screen shows the uploaded thumbnail.
6. If upload fails, UI should show saved-but-failed headline plus safe detail such as `Desteklenmeyen görsel formatı.` when applicable.

## Debugging upload failures

Check response JSON from `POST /api/reviews/:reviewId/images`:

| `code` | Meaning |
|--------|---------|
| `unauthorized` | Missing/expired session |
| `review_not_found` | Review id invalid |
| `review_ownership_mismatch` | Customer does not own review |
| `missing_image` | Multipart field `image` missing/empty |
| `invalid_image_type` | Bytes not JPEG/PNG/WEBP |
| `image_too_large` | Over 2 MB |
| `storage_upload_failed` | Supabase storage upload failed |
| `image_record_failed` | Storage ok, DB insert failed |

## Operational notes

- Do not change `review-images` bucket config for R1B.
- Do not run SQL for R1B.
- Guest review image upload is not supported and was not added.
