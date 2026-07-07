# COSMOSKIN R1C — Review Image Record Failed — Runbook

**Date:** 2026-07-07  
**Scope:** R1C only (no deploy included)

## What changed

When `POST /api/reviews/:reviewId/images` passes validation and storage upload succeeds, but the `review_images` DB insert fails, R1C:

- logs safe diagnostics (`reviewId`, `storagePath`, `insertKeys`, Supabase message)
- attempts to delete the uploaded storage object to prevent orphans
- retries the insert without `storage_path` only when the error is a clear “missing column” signature

Customer response stays safe:

```json
{ \"ok\": false, \"code\": \"image_record_failed\", \"error\": \"Görsel yüklenemedi. Lütfen tekrar deneyin.\" }
```

## Verification commands

```bash
node --check 'functions/api/reviews/[[path]].js'
node --check js/reviews.js
node scripts/validate-r1c-review-image-record-failed.mjs
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

## Manual smoke test (with full Pages Functions runtime)

```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```

Steps:

1. Log in as a customer who can review a purchased product.
2. Submit a review with a small JPEG (< 2 MB).
3. Confirm `POST /api/reviews/:reviewId/images` returns **201**.
4. Confirm admin reviews shows the thumbnail.

If upload fails, capture the response JSON. Key codes:

| code | meaning |
|------|---------|
| `storage_upload_failed` | Storage upload failed |
| `image_record_failed` | DB insert failed after storage upload |

## Operational notes

- R1C does not change bucket settings or RLS.
- R1C does not add migrations or SQL.
- If production schema lacks `storage_path`, R1C retry allows uploads to succeed without it.
