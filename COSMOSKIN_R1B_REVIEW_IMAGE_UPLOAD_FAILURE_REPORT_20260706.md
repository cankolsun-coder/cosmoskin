# COSMOSKIN R1B — Review Image Upload Failure Fix Report

**Date:** 2026-07-06  
**Batch:** R1B only  
**Status:** Implemented, validated, not deployed

## Summary

R1B fixes post-R1 review image upload failures where review text saved but images failed with `Yorumunuz kaydedildi ancak görsel yüklenemedi.` The root cause was unsafe server-side multipart validation in `uploadReviewPhoto()`: it required `instanceof File`, trusted `file.type` before byte sniffing, and could reject valid JPEGs when declared MIME metadata was empty or unreliable.

## Root cause confirmed

| Layer | Issue |
|-------|-------|
| Backend | `instanceof File` rejected valid Blob-like multipart parts from Workers/runtime |
| Backend | MIME allowlist used `file.type` before sniffing bytes |
| Backend | Empty `file.type` on otherwise valid JPEG → `invalid_image_type` (400) |
| Frontend | Cached session token used without refresh before upload |
| Frontend | Generic saved-but-failed message hid structured backend `code` |
| Not the cause | 2 MB size limit for reported 0.47 MB JPEG |
| Not the cause | Guest review flow (guest reviews are not supported) |

## Files changed

See `COSMOSKIN_R1B_REVIEW_IMAGE_UPLOAD_FAILURE_CHANGED_FILES_20260706.txt`.

- `functions/api/reviews/[[path]].js`
- `js/reviews.js`
- `scripts/validate-r1b-review-image-upload-failure.mjs`
- `scripts/validate-r1-admin-review-image-visibility.mjs`
- `tests/local-integration.test.mjs`

## Backend Blob/File compatibility

`uploadReviewPhoto()` now accepts Blob-like multipart parts via `isBlobLikeUploadPart()`:

- Accepts `Blob` and `File` (File extends Blob)
- Rejects empty or non-binary parts with `missing_image`
- No longer requires `instanceof File`

## MIME sniffing behavior

Added `detectImageType(bytes)`:

| Format | Magic bytes | Output |
|--------|-------------|--------|
| JPEG | `FF D8 FF` | `image/jpeg` / `jpg` |
| PNG | `89 50 4E 47 0D 0A 1A 0A` | `image/png` / `png` |
| WEBP | `RIFF....WEBP` | `image/webp` / `webp` |

Rules:

- Sniff bytes before rejecting MIME
- Do not rely only on `file.type` or filename extension
- Storage upload uses sniffed `mime_type`
- Unrecognized bytes → `invalid_image_type`

## Structured upload errors

Upload failures now return structured JSON:

```json
{
  "ok": false,
  "code": "invalid_image_type",
  "error": "Desteklenmeyen görsel formatı."
}
```

Codes implemented:

- `unauthorized`
- `review_not_found`
- `review_ownership_mismatch`
- `missing_image`
- `invalid_image_type`
- `image_too_large`
- `storage_upload_failed`
- `image_record_failed`

Ownership mismatch now returns **403** with `Bu yoruma görsel ekleme yetkiniz bulunmuyor.`

## Frontend session / review_id fallback

`js/reviews.js` now:

- Calls `await refreshSession()` before create/update + upload
- Uses async `await authHeaders()` on all review API calls
- Resolves review id via `data.review_id || data.review?.id || userReview?.id`
- Skips upload when review id is missing after successful text save
- Shows generic saved-but-failed headline plus safe backend detail when available

FormData field remains `image`. Endpoint remains `POST /api/reviews/:reviewId/images`.

## 2 MB limit

Unchanged and enforced at `2 * 1024 * 1024` in `uploadReviewPhoto()`.

## Retired endpoint

`POST /api/reviews/images` remains **410 Gone**. Not revived.

## Proof of no schema/storage weakening

- No migrations created
- No SQL run
- No changes to `supabase/phase51_reviews_hardening.sql`, `supabase/schema.sql`, or storage RLS policy files
- `review-images` bucket config unchanged

## Regression proof

Passed:

- `scripts/validate-r1b-review-image-upload-failure.mjs`
- `scripts/validate-r1-admin-review-image-visibility.mjs`
- `scripts/validate-i1-inventory-checkout-blocking.mjs`
- `scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs`
- `scripts/validate-c1b-coupon-exclusions-metadata.mjs`
- `scripts/validate-c1-coupon-eligibility-hardening.mjs`
- `scripts/validate-d3-refund-snapshot-persistence.mjs`
- `scripts/validate-d2b-refund-discount-proration.mjs`
- `scripts/validate-d2-refund-amount-correctness.mjs`
- `scripts/validate-d1-returns-refunds-correctness.mjs`
- `scripts/validate-production-launch-readiness.mjs`
- `node --test tests/local-integration.test.mjs` — **137/137**

R1 admin image visibility, H2, I1, C1, D3, D2, D1 behavior preserved.

## Test results

| Area | Result |
|------|--------|
| JPEG with `image/jpeg` | 201 |
| JPEG with empty `file.type` | 201 |
| Blob multipart part | 201 |
| PNG / WEBP sniffing | 201 |
| Invalid bytes / unsupported type | 400 structured |
| Oversized image | 400 `image_too_large` |
| Other customer review | 403 `review_ownership_mismatch` |
| Retired endpoint | 410 |
| Frontend review_id fallback markers | present |

## Rollback

See `COSMOSKIN_R1B_REVIEW_IMAGE_UPLOAD_FAILURE_ROLLBACK_PLAN_20260706.md`.
