# COSMOSKIN R1 — Admin Review Image Visibility Fix Report

**Date:** 2026-07-06  
**Batch:** R1 only  
**Status:** Implemented, validated, not deployed

## Summary

R1 fixes the production PDP review-image persistence bug. `js/reviews.js` no longer uploads review images directly to Supabase Storage or calls the retired `POST /api/reviews/images` endpoint. The PDP now creates/updates the review first, then uploads selected files through the working multipart route: `POST /api/reviews/:reviewId/images`.

## Files Changed

See `COSMOSKIN_R1_ADMIN_REVIEW_IMAGE_VISIBILITY_CHANGED_FILES_20260706.txt`.

Implementation files:
- `js/reviews.js`
- `functions/api/reviews/[[path]].js`
- `admin/reviews/index.html`

Validation/tests:
- `scripts/validate-r1-admin-review-image-visibility.mjs`
- `tests/local-integration.test.mjs`

## Retired Endpoint Behavior

`POST /api/reviews/images` remains retired and still returns `410 Gone`. R1 does not revive the JSON image-registration route and does not trust client-provided raw `storage_path` / `public_url` payloads from create/update review requests.

`sanitizeReviewPayload()` still returns `images: []`, so create/update review payloads cannot insert raw image paths into `review_images`.

## PDP Upload Path Fix

The production PDP path now:
- Validates selected files client-side against the effective 2 MB limit and allowed image MIME types.
- Submits the review JSON without image path metadata.
- Uses `FormData` field `image` against `/api/reviews/:reviewId/images` after the review id exists.
- Keeps text-only and rating/body review submission behavior intact.
- Shows `Yorumunuz kaydedildi ancak görsel yüklenemedi.` if the review saves but image upload fails.

Customer upload messages now include:
- `Yorumunuz kaydedildi ancak görsel yüklenemedi.`
- `Görsel yüklenemedi. Lütfen tekrar deneyin.`
- `Görsel boyutu çok büyük.`
- `Desteklenmeyen görsel formatı.`

## review_images Persistence

`uploadReviewPhoto()` remains the only active customer image persistence path. It verifies:
- The request is authenticated.
- The target review exists.
- The target review belongs to the authenticated customer.
- The request is multipart.
- File type and magic bytes are valid.
- File size does not exceed 2 MB.

Successful uploads write a `review_images` row with `review_id`, `storage_path`, `public_url`, and `status: pending`.

## Admin API Image Objects

`GET /api/reviews/admin` now returns normalized image objects including:

```json
{
  "id": "...",
  "storage_path": "...",
  "public_url": "...",
  "signed_url": "...",
  "thumbnail_url": "...",
  "filename": "...",
  "mime_type": null,
  "size_bytes": null,
  "width": 1000,
  "height": 1000,
  "status": "pending"
}
```

Because `review-images` is public today, `signed_url` and `thumbnail_url` may equal `public_url`. If `public_url` is missing but `storage_path` exists, the API derives a usable public object URL without exposing the raw path as the primary image URL.

## Admin UI Fallback

The admin reviews UI is inline in `admin/reviews/index.html`; there is no `assets/admin-reviews.js` in this repo.

Admin image cards now prefer `signed_url`, then `thumbnail_url`, then `public_url`, then legacy `url`. Broken or missing previews show:

`Görsel yüklenemedi`

The existing lightbox/open-full-image flow is preserved and now uses the same normalized preview URL helper.

## File Size Limit Decision

The storage bucket effectively enforces 2 MB (`2097152` bytes). R1 does not change bucket config or storage settings. The PDP/client and backend validation are aligned to the effective 2 MB limit so the UI no longer promises 5 MB.

## Proof of No Schema/Storage Weakening

- No migration files were created.
- No SQL files were modified.
- `review-images` bucket config remains public with 2 MB limit.
- RLS/storage policy files were not changed.
- The new validator checks for unexpected review bucket/policy weakening.

## Validation Results

Passed:
- `node --check js/reviews.js`
- `node --check functions/api/reviews/[[path]].js`
- `node --check scripts/validate-r1-admin-review-image-visibility.mjs`
- Inline admin reviews script extracted from `admin/reviews/index.html` and checked with `node --check`
- `node scripts/validate-r1-admin-review-image-visibility.mjs`
- `node scripts/validate-i1-inventory-checkout-blocking.mjs`
- `node scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs`
- `node scripts/validate-c1b-coupon-exclusions-metadata.mjs`
- `node scripts/validate-c1-coupon-eligibility-hardening.mjs`
- `node scripts/validate-d3-refund-snapshot-persistence.mjs`
- `node scripts/validate-d2b-refund-discount-proration.mjs`
- `node scripts/validate-d2-refund-amount-correctness.mjs`
- `node scripts/validate-d1-returns-refunds-correctness.mjs`
- `node scripts/validate-production-launch-readiness.mjs`
- `node --test tests/local-integration.test.mjs` — 131/131 passing

Regression proof:
- H2 return attachment previews passed.
- Admin auth/RBAC validators passed.
- I1 inventory checkout blocking passed.
- C1/C1B/C1B2 coupon validators passed.
- D3/D2/D1 refund/returns validators passed.

## Rollback

Use `COSMOSKIN_R1_ADMIN_REVIEW_IMAGE_VISIBILITY_ROLLBACK_PLAN_20260706.md`.

## Deferred

- Backfilling old orphaned storage objects was not performed because R1 does not run SQL or create migrations.
- Private-bucket signed URL migration was not performed because the current bucket is public and storage/RLS changes were out of scope.
