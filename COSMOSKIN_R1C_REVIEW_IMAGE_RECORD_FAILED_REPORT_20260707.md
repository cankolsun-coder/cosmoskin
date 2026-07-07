# COSMOSKIN R1C — Review Image Upload: `image_record_failed` 503 — Report

**Date:** 2026-07-07  
**Batch:** R1C only  
**Status:** Implemented, validated, not deployed

## Summary

Live PDP image uploads were reaching `POST /api/reviews/:reviewId/images` and passing R1B validation, but failing with:

```json
{
  "ok": false,
  "code": "image_record_failed",
  "error": "Görsel yüklenemedi. Lütfen tekrar deneyin."
}
```

This indicates **storage upload succeeds** and the failure happens while creating the `review_images` database record. R1C makes the DB insert **schema-safe**, adds **safe internal logging**, and attempts **storage cleanup** on insert failure to avoid orphaned objects.

## Files changed

See `COSMOSKIN_R1C_REVIEW_IMAGE_RECORD_FAILED_CHANGED_FILES_20260707.txt`.

- `functions/api/reviews/[[path]].js`
- `scripts/validate-r1c-review-image-record-failed.mjs`
- `tests/local-integration.test.mjs`

## review_images schema found (repo source of truth)

From `supabase/reviews.sql` (base table):

- `id` (uuid, pk)
- `review_id` (uuid, not null, FK)
- `storage_path` (text, not null)
- `public_url` (text, not null)
- `status` (text, not null, default `pending`, check `pending|approved|rejected`)
- `width` (int, nullable)
- `height` (int, nullable)
- `created_at` (timestamptz, default now)

From `supabase/phase51_reviews_hardening.sql` (hardening):

- adds moderation fields (nullable): `moderation_note`, `moderated_at`, `moderated_by`
- ensures `storage_path` exists (for older installs)

## Insert payload before fix (R1B)

R1B inserted:

```js
{
  review_id,
  storage_path,
  public_url,
  status: 'pending',
  width: null,
  height: null
}
```

In production, the `image_record_failed` symptom strongly suggests the live schema was not matching what the function attempted to write (most plausibly: **schema lag where `storage_path` column is missing**, or another insert-time constraint error).

## Insert payload after fix (R1C)

R1C keeps the canonical payload but adds a controlled retry:

1. **Primary insert** uses the canonical payload (same keys as above).
2. If the insert fails with a **very specific** “missing column” signature for `storage_path`, it retries with:

```js
{
  review_id,
  public_url,
  status: 'pending',
  width: null,
  height: null
}
```

This allows uploads to succeed on environments that are missing `storage_path` without requiring a migration in R1C.

## Root cause of image_record_failed

**Confirmed mechanism:** insert into `review_images` threw after successful storage upload.  
**Fix strategy:** handle a schema-lag “missing column” case explicitly (retry) and otherwise keep `image_record_failed` safe while improving logs + cleanup.

## Storage cleanup behavior (new)

If storage upload succeeds but DB insert fails (including retry failure), R1C attempts:

- `deleteStorageObject(context, 'review-images', objectPath)`

Cleanup failures are logged internally, but the customer still receives the safe response:

```json
{ "ok": false, "code": "image_record_failed", "error": "Görsel yüklenemedi. Lütfen tekrar deneyin." }
```

## Internal error logging (new)

On insert failure we now log **safe** diagnostics:

- `reviewId`
- `storagePath`
- `insertKeys` (whitelist of attempted insert keys)
- Supabase error message (no secrets)

## Proof of constraints

- **No migrations created**
- **No SQL run**
- **No storage bucket config changes**
- **No RLS/policy changes**
- Retired `POST /api/reviews/images` remains **410 Gone**

## Validators and tests

Passed:

- `node scripts/validate-r1c-review-image-record-failed.mjs`
- `node scripts/validate-r1b-review-image-upload-failure.mjs`
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
- `node --test tests/local-integration.test.mjs` — **pass (full suite)** including R1/R1B/R1C cases

Added/updated tests:

- **R1C**: missing `storage_path` column triggers retry insert without it (upload still succeeds)
- **R1C**: DB insert failure returns `image_record_failed` and attempts storage cleanup DELETE

## Rollback

See `COSMOSKIN_R1C_REVIEW_IMAGE_RECORD_FAILED_ROLLBACK_PLAN_20260707.md`.

