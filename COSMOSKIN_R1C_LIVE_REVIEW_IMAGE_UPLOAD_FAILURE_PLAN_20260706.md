# COSMOSKIN R1C — Live Review Image Upload Still Failing After R1B — Plan

**Date:** 2026-07-06  
**Batch:** R1C only (diagnose + plan)  
**Status:** Plan complete — **not implemented**

---

## Pre-plan git state (local repo)

`git status`: clean  

Recent commits:

```
723e76c fixed                          ← R1B implementation + tests + validator + docs
15e0690 docs add R1B review image upload failure plan
98f40d9 R1 fix admin review image visibility
```

### Answers (repo-only)

1. **Is R1B implementation committed?** Yes — commit `723e76c` modifies `js/reviews.js` and `functions/api/reviews/[[path]].js` and adds `scripts/validate-r1b-review-image-upload-failure.mjs`.
2. **Has R1B been deployed to the environment being tested?** Unknown from the repo alone; must be verified on the tested URL by checking served asset/function versions.
3. **Is the tested URL production, preview, or local?** Unknown from repo alone; must be confirmed from the URL being tested.
4. **Are `js/reviews.js` and `functions/api/reviews/[[path]].js` in the deployed build?** Depends on whether the environment includes commit `723e76c`; must be verified via live requests (below).

---

## Observed live symptom (from report)

- Review text saves.
- Image preview renders.
- Upload fails with:

> “Yorumunuz kaydedildi ancak görsel yüklenemedi. Görsel yüklenemedi. Lütfen tekrar deneyin.”

Interpretation: frontend shows the saved-but-upload-failed headline, and appends the upload error detail; i.e. the image request is failing with a customer-safe message, likely from the backend.

---

## What we must determine (single source of truth)

For the failing request:

`POST /api/reviews/:reviewId/images`

We need:

- **HTTP status code**
- **JSON response body** (`ok`, `code`, `error`)
- Whether request has **Authorization: Bearer …**
- Whether the backend reaches:
  - multipart parsing (`request.formData()`)
  - byte sniffing
  - storage upload fetch to Supabase Storage
  - DB insert to `review_images`

---

## Likely causes (ranked)

### A) Deployment mismatch / cache (highest)

Even though R1B is committed locally, live behavior may still be running old code:

- Old `js/reviews.js` served via CDN cache
- Old Pages Functions bundle still deployed (old `uploadReviewPhoto()` path)
- Preview environment uses a different branch/commit than production

**This is the first thing to prove/deny** because it’s the cheapest fix (deploy / purge / version-bump).

### B) Storage upload failing (high)

If the request reaches the backend and passes validation, the remaining failure points are:

- Supabase Storage upload fetch returns non-2xx → backend returns `503` with `code: storage_upload_failed`
- Storage object upload succeeds but DB insert fails → backend returns `503` with `code: image_record_failed`

Because the UI shows the exact phrase `Görsel yüklenemedi. Lütfen tekrar deneyin.`, this strongly suggests the backend is returning a customer-safe failure (likely one of the above codes), not a client-side size/MIME issue.

### C) Auth/session loss between create and upload (medium)

This would show as `401` with `code: unauthorized` on the image upload. Review creation already worked, so this is less likely but still possible in Safari/private browsing if the token refresh logic fails.

### D) Multipart/form parsing mismatch (medium)

Would show as:

- `415 invalid_content_type`
- `400 missing_image`

### E) Validation still failing (lower after R1B)

Would show as `400 invalid_image_type` even for valid JPEG bytes; this would imply R1B code is not running or the bytes are not as expected in production.

---

## Trace checklist (exact steps to capture evidence)

### 1) Identify tested environment (production vs preview vs local)

Record:
- The **exact URL** where the PDP is being tested (domain + path + query).
- Whether the test is run via Cloudflare Pages production domain or a preview deployment.

### 2) Confirm deployed frontend `js/reviews.js` version

On the tested PDP:

- Open DevTools → Sources (or “View page source”) and open the loaded `js/reviews.js`.
- Search for these R1B markers:
  - `resolveReviewId(`
  - `await refreshSession()`
  - `detectImageType` (not in frontend, backend only)
  - upload endpoint string: `/reviews/${encodeURIComponent(reviewId)}/images`

If the served JS does **not** contain these markers, the issue is **deploy/cache mismatch**.

### 3) Capture the failing request **as cURL**

In DevTools Network tab, click the failing request:

`POST /api/reviews/:reviewId/images`

Capture:
- Status code
- Response body (JSON)
- Request headers (especially `Authorization`)
- “Copy as cURL”

This gives definitive answers for:
- whether it reaches backend
- what the backend code/message is

### 4) Determine backend failure stage from response `code`

Expected R1B structured codes and interpretation:

| `code` | Expected HTTP | Stage | Meaning |
|--------|---------------|-------|---------|
| `unauthorized` | 401 | auth | missing/expired session |
| `review_not_found` | 404 | ownership | wrong reviewId |
| `review_ownership_mismatch` | 403 | ownership | not your review |
| `invalid_content_type` | 415 | parsing | not multipart |
| `missing_image` | 400 | parsing | no `image` part / empty |
| `image_too_large` | 400 | validation | > 2 MB |
| `invalid_image_type` | 400 | validation | bytes not JPEG/PNG/WEBP |
| `storage_upload_failed` | 503 | storage | Supabase Storage upload failed |
| `image_record_failed` | 503 | DB | storage ok, DB insert failed |

The observed live UX string duplication strongly suggests `storage_upload_failed` or `image_record_failed` (because the frontend appends the server-safe error message).

### 5) Verify whether storage upload is attempted (indirect)

We cannot see internal server logs from the repo, so we infer from:

- Response code `storage_upload_failed` vs `image_record_failed`
- If you have Cloudflare Pages logs enabled, check for:
  - `review_image_upload_failed` log line (includes storage HTTP status)
  - `review_image_record_failed` log line

### 6) Verify whether `review_images` insert is attempted

Indirect via code:
- If code is `image_record_failed`, the insert was attempted and threw.
- If code is `storage_upload_failed`, insert was not attempted.

### 7) Verify admin visibility is not the issue

If the image upload returns `201` but UI still shows failure, it would mean a response parsing mismatch.
To rule this out:
- Ensure the response is valid JSON and includes `{ ok: true, image: ... }`.

---

## Root-cause decision tree (what to do next)

### If deployed JS is old (missing R1B markers)

**Root cause:** deploy mismatch or CDN/browser cache.  
**Smallest fix:** deploy the commit containing R1B (`723e76c`) + bump cache-busting query param on PDP script tags if needed; purge Cloudflare cache for `/js/reviews.js`.

### If response is `401 unauthorized`

**Root cause:** auth token missing on the upload request.  
**Smallest fix:** ensure session refresh is actually executed and `Authorization` header present; confirm `window.cosmoskinSupabase` exists on PDP and is configured; add hard error when session is null before attempting upload.

### If response is `400 missing_image`

**Root cause:** multipart field mismatch or empty file part.  
**Smallest fix:** ensure FormData key is `image` (must stay), ensure the input/file object is passed correctly; check mobile Safari photo picker yields a zero-length blob.

### If response is `400 invalid_image_type`

**Root cause:** byte sniffing not running (old backend deployed) OR bytes read are empty/corrupted in runtime.  
**Smallest fix:** deploy backend `723e76c`; if already deployed, add defensive read and logging for first 16 bytes length and signature detection.

### If response is `503 storage_upload_failed`

**Root cause:** Supabase Storage upload fetch failed from Pages Function. Likely:
- missing/invalid `SUPABASE_SERVICE_ROLE_KEY` on that environment
- wrong `SUPABASE_URL`
- storage service returning 4xx/5xx (bucket name mismatch unlikely)

**Smallest fix:** verify env vars on tested environment; verify Storage endpoint returns 200 with service-role; do not change bucket config/RLS.

### If response is `503 image_record_failed`

**Root cause:** DB insert failed after storage upload. Likely:
- Supabase REST insert failing (service role missing/invalid, schema mismatch, temporary outage)

**Smallest fix:** verify env vars; check Supabase REST error message server-side; consider compensating delete of uploaded object on insert failure (future hardening).

---

## Files to change (if implementation is needed)

Implementation should be decided only after capturing the live failing response. Candidate files by root cause:

- Deploy/cache mismatch: **no code change** required; deploy `723e76c`, purge cache, bump query param on PDP script tags if necessary.
- Auth loss: `js/reviews.js` (session hardening / better guardrails) + possibly `assets/auth.js` load order issues on PDP.
- Backend storage/env: Cloudflare Pages environment variables (no repo changes) or `functions/api/reviews/[[path]].js` (more structured logging + safer error propagation).

---

## Whether implementation is needed

Cannot be determined without the **exact response** from `POST /api/reviews/:reviewId/images` on the tested environment.

However:
- If R1B is **not deployed** on that environment, then **no implementation** is needed — only deploy/cache purge.
- If R1B **is deployed** and the response code is `storage_upload_failed` / `image_record_failed`, a **configuration or Supabase availability** issue is likely, and code changes may be unnecessary (or limited to better diagnostics).

---

## Required evidence to close R1C

Attach (or paste) for the failing upload request:
- tested URL (prod/preview/local)
- the network request status + response JSON
- whether Authorization header is present (redact token value)
- which `js/reviews.js` markers are present in served asset

---

**Stop here. Plan only. No implementation in this batch.**

