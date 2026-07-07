# COSMOSKIN R1F — Review Image-Level Approval — Report

**Date:** 2026-07-07  
**Batch:** R1F only  
**Status:** Implemented, validated, not deployed

## Summary

After R1E deployed, admin image-level **Görseli onayla** returned HTTP 500 while review-level approval UI was correct. Root cause: moderation PATCH sent optional columns (`moderation_note`, `moderated_at`, `moderated_by`) that do not exist on the live `review_images` table (R1D live schema only guarantees `status` and upload metadata).

## Failing request (Task 1)

| Field | Value |
|-------|-------|
| Endpoint | `PATCH /api/reviews/admin/:reviewId/images/:imageId` |
| Method | `PATCH` |
| Review id | `data-review-id` from button |
| Image id | `data-image-id` from button |
| Body (before) | `{ status, review_source_table, table, source, field, index }` |
| Body (after) | `{ status: "approved" \| "rejected" }` |

UI wiring was correct; failure was backend Supabase PATCH rejection.

## Root cause of HTTP 500

R1E `buildReviewImageModerationPayload()` always included:

- `moderation_note`
- `moderated_at`
- optional `moderated_by` (uuid-safe)

Live production `review_images` (per R1D) does not include moderation columns. Supabase rejected the PATCH → uncaught error → generic 500 **"Yorum işlemi şu anda tamamlanamadı."**

Bulk approve-on-review (`approvePendingReviewImages`) had the same latent failure for pending images on already-approved reviews.

## Backend fix

Added live-schema-safe moderation helpers in `functions/api/reviews/[[path]].js`:

- `buildReviewImageModerationPatchVariants()` — full payload, reduced payload, then `{ status }` only
- `patchReviewImageRows()` — image-level PATCH with retry on missing optional columns
- `patchReviewImagesByQuery()` — bulk pending-image approve with same retry
- `logReviewImageModerationFailure()` — internal log: reviewId, imageId, action, patch keys, Supabase code/message
- `handleAdminImageUpdate()` — uses `patchReviewImageRows`, returns `{ code: 'image_update_failed' }` on failure (safe text)
- `approvePendingReviewImages()` — uses `patchReviewImagesByQuery` (idempotent pending → approved)

`moderated_by` remains uuid-only when optional columns exist; never writes email/text.

## UI fix

`changeImageStatus()` now sends only `{ status }`, applies returned `data.image` to local state, and uses `imageStatusLabel()` for toast text. Removed legacy inline-image metadata from PATCH body.

## Already-approved review behavior

- **Görseli onayla** patches only the selected `review_images` row; parent review status is not required to change.
- **Yorumu ve görselleri onayla** on an approved review still bulk-approves `status=pending` images via `approvePendingReviewImages`.

## Public visibility

Unchanged and verified:

- `mapReview(..., { publicOnly: true })` exposes only `review_images.status === 'approved'`
- Pending/rejected images hidden from public API and PDP

## Proof constraints

- No migration created
- No SQL run
- Storage / RLS unchanged
- R1E approve-together preserved
- R1D upload insert unchanged
- Retired `POST /api/reviews/images` remains 410

## Regression proof

Validators pass: R1F, R1E, R1D, R1C, R1B, R1, production launch readiness.

## Test results

```bash
node --check functions/api/reviews/[[path]].js
node --check js/reviews.js
node scripts/validate-r1f-review-image-level-approval.mjs
node scripts/validate-r1e-review-image-moderation-alignment.mjs
node --test tests/local-integration.test.mjs
```

**Result:** 151/151 integration tests pass.

## Rollback plan

See `COSMOSKIN_R1F_REVIEW_IMAGE_LEVEL_APPROVAL_ROLLBACK_PLAN_20260707.md`.
