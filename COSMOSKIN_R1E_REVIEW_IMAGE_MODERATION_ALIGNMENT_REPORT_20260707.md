# COSMOSKIN R1E — Review Image Moderation Alignment — Report

**Date:** 2026-07-07  
**Batch:** R1E only  
**Status:** Implemented, validated, not deployed

## Summary

After R1D fixed image upload, approved reviews still appeared without photos because review approval and image approval were decoupled. R1E aligns moderation so approving a review also approves its pending images, fixes image-level moderation payloads for live `moderated_by uuid`, and clarifies admin action labels.

## Files changed

See `COSMOSKIN_R1E_REVIEW_IMAGE_MODERATION_ALIGNMENT_CHANGED_FILES_20260707.txt`.

- `functions/api/reviews/[[path]].js`
- `admin/reviews/index.html`
- `scripts/validate-r1e-review-image-moderation-alignment.mjs` (new)
- `tests/local-integration.test.mjs`

## Review status flow before fix

- Admin `PATCH /api/reviews/admin/:reviewId` with `{ status: "approved" }`
- Updated only `reviews` (`status`, `approved`, moderation fields)
- `review_images` rows unchanged → stayed `pending`

## Image status flow before fix

- Upload (R1D) inserts `review_images.status = pending` ✓
- Image-level `PATCH /api/reviews/admin/:reviewId/images/:imageId` attempted to set `moderated_by` from `x-admin-email` (text)
- Live `review_images.moderated_by` is `uuid` → PATCH failed
- Admin showed **Bekliyor** on images even after review approved

## Public visibility rule

- Public list: `reviews.status = approved`
- Images: `mapReview(..., { publicOnly: true })` keeps only `review_images.status === 'approved'`
- PDP (`js/reviews.js`) also filters to `approved` images only
- Pending/rejected images are correctly hidden publicly

## Why image stayed pending

Main review approval did not cascade to `review_images`. Public gate requires image `approved`, so text showed without photo.

## Why image-level approve errored

`handleAdminImageUpdate()` wrote `moderated_by: x-admin-email || 'admin'` (string) into live UUID column.

## Backend after fix

### Approve-together

`handleAdminReviewUpdate()` when `status === 'approved'`:

1. Updates `reviews` as before
2. Calls `approvePendingReviewImages()` → bulk PATCH `review_images` where `review_id` matches and `status = pending` → `approved`
3. Does not change `rejected` images (filtered by `status=eq.pending`)

### Safe moderation payload

`buildReviewImageModerationPayload()` sets:

- `status`, `moderation_note`, `moderated_at`
- `moderated_by` only when a valid admin UUID is available from headers (`x-admin-user-id`, `cf-access-authenticated-user-id`)
- Never writes email/text into `moderated_by`

### Image-level moderation

`handleAdminImageUpdate()`:

- Verifies image exists (`image_not_found` 404)
- Uses `buildReviewImageModerationPayload()`
- Returns `{ ok: true, code: 'image_updated', image }`

## Admin UI label changes

| Before | After |
|--------|-------|
| Onayla (review) | **Yorumu ve görselleri onayla** |
| Onayla (image) | **Görseli onayla** |
| Reddet (image) | **Görseli reddet** |
| Bekliyor / Onaylı (image pill) | **Görsel beklemede** / **Görsel onaylandı** / **Görsel reddedildi** |

`hydrateReview()` default image status is `pending` (not inherited from review status).

## Proof constraints

- No migration created
- No SQL run
- Storage bucket / RLS unchanged
- R1D insert payload unchanged
- R1C cleanup, R1B upload validation, R1 admin thumbnails preserved
- Retired `POST /api/reviews/images` remains 410

## Test results

```bash
node --check functions/api/reviews/[[path]].js
node scripts/validate-r1e-review-image-moderation-alignment.mjs
node --test tests/local-integration.test.mjs
```

**Result:** 147/147 integration tests pass. R1E validator + regression chain pass.

## Rollback plan

See `COSMOSKIN_R1E_REVIEW_IMAGE_MODERATION_ALIGNMENT_ROLLBACK_PLAN_20260707.md`.
