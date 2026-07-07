# COSMOSKIN R1D — Review Image Live Schema Alignment — Report

**Date:** 2026-07-07  
**Batch:** R1D only  
**Status:** Implemented, validated, not deployed

## Summary

Live PDP review image uploads reached `POST /api/reviews/:reviewId/images`, passed R1B validation, uploaded to storage, then failed with `image_record_failed` because the `review_images` insert payload did not match production schema (missing `user_id`, `sort_order`, and using non-existent columns).

R1D aligns `uploadReviewPhoto()` insert payload to the live Supabase `review_images` table.

## Files changed

See `COSMOSKIN_R1D_REVIEW_IMAGE_LIVE_SCHEMA_ALIGNMENT_CHANGED_FILES_20260707.txt`.

- `functions/api/reviews/[[path]].js`
- `scripts/validate-r1d-review-image-live-schema-alignment.mjs` (new)
- `scripts/validate-r1c-review-image-record-failed.mjs` (live-column allowance)
- `tests/local-integration.test.mjs`

## Live review_images schema used

| Column | Required | Notes |
|--------|----------|-------|
| `review_id` | Yes | Bound to route `reviewId` |
| `user_id` | Yes | From `requireUser()`, must match review owner |
| `storage_path` | Yes | Uploaded object path |
| `public_url` | Yes | Public storage URL |
| `status` | Yes | `pending` for moderation queue |
| `sort_order` | Yes | Next order for review images |
| `original_name` | Optional | From `file.name` or generated |
| `file_size_kb` | Optional | `Math.ceil(file.size / 1024)` |
| `mime_type` | Optional | From byte sniffing |
| `width` / `height` | Optional | `null` when unavailable |

## Insert payload before fix

```json
{
  "review_id": "<reviewId>",
  "storage_path": "<objectPath>",
  "public_url": "<publicUrl>",
  "status": "pending",
  "width": null,
  "height": null
}
```

Missing: `user_id`, `sort_order`, `original_name`, `file_size_kb`, `mime_type`.

## Insert payload after fix

```json
{
  "review_id": "<reviewId>",
  "user_id": "<authenticatedUserId>",
  "storage_path": "<objectPath>",
  "public_url": "<publicUrl>",
  "status": "pending",
  "sort_order": 0,
  "original_name": "customer-photo.jpg",
  "file_size_kb": 1,
  "mime_type": "image/jpeg",
  "width": null,
  "height": null
}
```

Not inserted: `filename`, `size_bytes`, `metadata`, `customer_id`.

## user_id behavior

- Taken from `requireUser()` (`required.user.id`).
- Ownership enforced before upload: `review.user_id === required.user.id`.
- Never accepted from client payload.

## sort_order behavior

- Computed from embedded `review.review_images` via `resolveNextReviewImageSortOrder()`.
- First image on a review: `0`.
- Subsequent images: `max(existing sort_order) + 1`.
- `REVIEW_SELECT_WITH_IMAGES` now includes `sort_order` for accurate ordering.

## status decision

- Admin image moderation accepts `pending`, `approved`, `rejected` (`handleAdminImageUpdate`).
- Admin UI counts `pending` media for moderation queue.
- Public PDP only shows `approved` images (`mapReview` `publicOnly` filter).
- **Decision:** new uploads use `status: 'pending'` — visible in admin moderation, not publicly approved.

## Storage cleanup behavior

Preserved from R1C: if DB insert fails after successful storage upload, `deleteStorageObject(context, 'review-images', objectPath)` is attempted. Cleanup failures are logged; customer still receives safe `image_record_failed`.

## Logging

On insert failure, logs include: `reviewId`, `userId`, `storagePath`, `insertKeys`, Supabase `code`, `message`.

## Proof constraints

- **No migration created**
- **No SQL run**
- **Storage bucket / RLS unchanged**
- Retired `POST /api/reviews/images` remains `410 Gone`
- R1B MIME sniffing, Blob/File support, 2 MB limit preserved
- R1 admin image normalization and fallback preserved

## Test results

Run locally:

```bash
node --check functions/api/reviews/[[path]].js
node scripts/validate-r1d-review-image-live-schema-alignment.mjs
node scripts/validate-r1c-review-image-record-failed.mjs
node --test tests/local-integration.test.mjs
```

R1D tests cover: required insert fields, `original_name` / `file_size_kb` mapping, forbidden columns absent, ownership block, admin images array, retired endpoint, storage cleanup regression.

**Result:** 143/143 integration tests pass.

## Rollback plan

See `COSMOSKIN_R1D_REVIEW_IMAGE_LIVE_SCHEMA_ALIGNMENT_ROLLBACK_PLAN_20260707.md`.
