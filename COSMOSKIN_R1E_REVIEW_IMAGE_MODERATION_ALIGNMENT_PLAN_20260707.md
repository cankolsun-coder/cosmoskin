# COSMOSKIN — R1E: Review Image Moderation Alignment — PLAN

**Date:** 2026-07-07  
**Type:** Investigation + planning only. No code, no migrations, no SQL, no deploy.  
**Scope:** R1E only — align review approval with review image visibility so approved reviews show attached images publicly, and image-level moderation works reliably.

**Builds on:**
- R1 (`98f40d9`) — admin image normalization + multipart upload path
- R1B (`723e76c`) — upload validation hardening
- R1C (`0c2ee9b`) — `image_record_failed` insert resilience
- R1D (`0607424`) — live `review_images` insert schema alignment

**Git pre-check (2026-07-07):**
- R1D implementation **committed** at `0607424`
- Working tree: only `scripts/validate-r1c-review-image-record-failed.mjs` modified (R1D follow-up validator tweak, not blocking R1E)
- Untracked `.wrangler/` — unrelated local cache

---

## Executive summary

Upload is fixed (R1D). The remaining bug is **moderation state divergence**:

1. **Review approval does not approve attached images.** Main “Onayla” updates only `reviews.status`; `review_images.status` stays `pending`.
2. **Public PDP requires both** `reviews.status = approved` **and** `review_images.status = approved`. Pending images are intentionally hidden.
3. **Image-level “Onayla” likely fails on live DB** because `handleAdminImageUpdate()` writes `moderated_by` as an email/text string while live `review_images.moderated_by` is `uuid`.

**Smallest safe fix:** When admin approves a review, also approve all `pending` images for that review. Separately fix image-level PATCH so independent image moderation works. Clarify admin button labels.

---

## Files inspected

| File | Role |
|------|------|
| `functions/api/reviews/[[path]].js` | Review/image CRUD, admin moderation, public list filtering |
| `admin/reviews/index.html` | Admin moderation UI, approve/reject handlers |
| `js/reviews.js` | PDP public review list + photo filter |
| `supabase/reviews.sql` | Baseline `review_images.status` CHECK |
| `supabase/schema.sql` | Same status vocabulary |
| `supabase/phase51_reviews_hardening.sql` | `moderated_by TEXT` in repo (differs from live UUID) |
| `COSMOSKIN_R1D_REVIEW_IMAGE_LIVE_SCHEMA_ALIGNMENT_REPORT_20260707.md` | R1D insert uses `status: pending` |
| `COSMOSKIN_R1_ADMIN_REVIEW_IMAGE_VISIBILITY_REPORT_20260706.md` | Admin thumbnail normalization |
| `tests/local-integration.test.mjs` | R1/R1D admin list tests (no image moderation cascade tests yet) |

**Out of scope (not touched in plan):** `admin.js`, `admin-audit.js`, `cloudflare-access-jwt.js`, checkout, coupons, inventory, refunds.

---

## SECTION 1 — Review status flow

### Status vocabulary (repo + API)

| Entity | Allowed values | Source |
|--------|----------------|--------|
| `reviews.status` | `pending`, `approved`, `rejected` | `handleAdminReviewUpdate()` validation |
| `review_images.status` | `pending`, `approved`, `rejected` | `handleAdminImageUpdate()` + SQL CHECK in `phase51_reviews_hardening.sql` |

There is **no `active`** status in current filtering logic.

### Main review approve endpoint

- **UI:** `changeReviewStatus(reviewId, 'approved')` in `admin/reviews/index.html`
- **HTTP:** `PATCH /api/reviews/admin/:reviewId`
- **Body:** `{ "status": "approved" }`
- **Handler:** `handleAdminReviewUpdate()` in `functions/api/reviews/[[path]].js`

### What happens on main “Onayla”

**`reviews` row updated:**
```javascript
{
  status: 'approved',
  approved: true,
  moderation_note: ...,
  moderated_at: <ISO>,
  moderated_by: <x-admin-email or 'admin'>
}
```

**`review_images` rows:** **not updated.** No query, no cascade, no side effect.

**API response:** Refreshed review via `getReviewById()` → `mapReview()` returns images with their **existing** `review_images.status` (still `pending` after R1D upload).

### Why image remains “Bekliyor” after review approval

Admin UI reads `image.status` from API (`statusLabel()` → `pending` → **“Bekliyor”**). Because the DB row was never updated, the badge correctly reflects `pending` even though the parent review is `approved`.

This is **expected given current backend behavior**, not an admin UI rendering bug.

---

## SECTION 2 — Review image status flow

### Visible vs pending vs rejected

| `review_images.status` | Admin label | Public PDP (`mapReview` + `js/reviews.js`) |
|------------------------|-------------|---------------------------------------------|
| `pending` | Bekliyor | Hidden |
| `approved` | Onaylı | Shown |
| `rejected` | Reddedildi | Hidden |

Public rule in `mapReview()`:
```javascript
.filter((image) => !options.publicOnly || (image.status || 'pending') === 'approved')
```

PDP client (`js/reviews.js`) also filters:
```javascript
.filter(img => (img.status || 'approved') === 'approved')
```
Note: client default `'approved'` when status missing is inconsistent with backend default `'pending'` — minor edge-case only; R1D inserts explicit `pending`.

### Image-level approve endpoint

- **Exists:** yes — `handleAdminImageUpdate(context, reviewId, imageId)`
- **Route:** `PATCH /api/reviews/admin/:reviewId/images/:imageId`
- **UI:** `changeImageStatus(reviewId, imageId, 'approved')`
- **Payload sent by UI:**
```json
{
  "status": "approved",
  "review_source_table": "...",
  "table": "review_images",
  "source": "review_images",
  "field": "public_url",
  "index": 0
}
```
Backend **only uses** `status`, `note`/`moderation_note`. Extra fields are ignored (harmless).

### Why image-level “Onayla” shows warning/error

**Most likely root cause (live schema mismatch):**

`handleAdminImageUpdate()` always writes:
```javascript
moderated_by: context.request.headers.get('x-admin-email') || 'admin'
```

**Live production schema (user-provided):** `moderated_by uuid NULL`  
**Repo schema (`phase51_reviews_hardening.sql`):** `moderated_by TEXT NULL`

Review-level approve succeeds because `reviews.moderated_by` on live is likely still `text` (or accepts the value). Image-level PATCH fails PostgREST/Postgres type validation when assigning a string to a `uuid` column → `parseSupabaseResponse()` throws → admin `api()` surfaces `data.error` or generic **“İşlem başarısız.”** / **“Görsel güncellenemedi.”** toast.

**Secondary checks (less likely but verify in implementation):**

| Check | Assessment |
|-------|------------|
| Endpoint missing | No — route wired at `parts.length === 4 && parts[2] === 'images'` |
| Wrong endpoint URL | No — UI path matches backend |
| Image id missing | Unlikely if thumbnail renders; `mapImage()` passes `id` from DB |
| Wrong status value | No — `'approved'` is valid |
| Admin permission | `requireAdmin()` → `assertAdmin()` only; same gate as working review approve |
| Payload shape | OK — `status` field correct |

**Confirm during implementation:** capture live PATCH response body for image approve (expect Postgres/PostgREST invalid input syntax for type uuid).

---

## SECTION 3 — Public visibility rule

### Public review API

- **Endpoint:** `GET /api/reviews?product_slug=...`
- **Handler:** `handlePublicList()`
- **Review filter:** `status: 'eq.approved'` on `reviews`
- **Image filter:** `mapReview(..., { publicOnly: true })` → only `review_images.status === 'approved'`

### PDP rendering

- `js/reviews.js` loads public API reviews
- Photo filter chip: reviews with at least one `approved` image
- Card photos: only `approved` images rendered
- Lightbox: same filter

### Current intentional behavior

An **approved review with pending images** is listed (text/rating visible) but **photos are hidden**. This is correct dual-gate behavior — the bug is that admin “approve review” never promotes images to `approved`.

### Expected after R1E

| State | Public text | Public images |
|-------|-------------|---------------|
| Review `approved`, images `pending` (today) | Yes | No |
| Review `approved`, images `approved` (target) | Yes | Yes |
| Review `approved`, image `rejected` | Yes | No (rejected hidden) |

---

## SECTION 4 — Admin UI clarity

### Why two “Onayla” buttons

| Button | Location | Handler | Target |
|--------|----------|---------|--------|
| Main **Onayla** | `review-actions` column | `data-review-action="approve"` | Whole review |
| Image **Onayla** | `media-actions` per thumbnail | `data-image-action="approve"` | Single image |

Both use the same visible label **“Onayla”** with no scope qualifier → confusing duplicate actions.

### Mobile / responsive

- `@media (max-width: 760px)` stacks `review-actions` and `media-actions` to full width
- **Does not duplicate** the main review approve button
- Same handlers; layout change only

### UI status refresh

- Review approve: optimistic `review.status` update, then merges `data.review` from API
- Image approve: optimistic `image.status`, rollback on error
- After successful review approve today, refreshed API still returns `image.status: pending` → badge stays **Bekliyor** (accurate to DB)

### Recommended label changes (R1E UI)

| Current | Proposed |
|---------|----------|
| Onayla (review) | **Yorumu onayla** |
| Onayla (image) | **Görseli onayla** |
| Reddet (review) | **Yorumu reddet** |
| Reddet (image) | **Görseli reddet** |
| (optional helper) | **Görsel beklemede** / **Görsel onaylandı** / **Görsel reddedildi** in image meta or action hint |

Optional composite hint on review card when pending images exist:
> “Bu yorumda onay bekleyen görsel var. Yorumu onayladığınızda görseller de yayına alınır.”

---

## SECTION 5 — Recommended behavior decision

### Default (recommended): Approve-together

**When admin approves a review (`status → approved`):**
1. Update `reviews` as today
2. Also update all `review_images` for that `review_id` where `status = 'pending'` → `approved`
3. Set `moderated_at` on those images (if column exists)
4. Set `moderated_by` only if value matches live column type (see Section 6)
5. **Do not** change images already `rejected` or `approved`
6. Idempotent: re-approving review leaves already-approved images approved

**Rationale:** Customer image is part of review content. If admin approves the review after viewing the image, the image should not remain invisible.

### Image-level moderation (keep, but fix)

- **Görseli onayla** / **Görseli reddet** remain available for granular control
- **Sil** (delete) already wired to `DELETE /api/reviews/admin/:reviewId/images/:imageId`
- If image-level PATCH cannot be fixed minimally, temporarily disable image approve/reject buttons with explicit copy — **prefer fixing PATCH first**

### Review reject behavior (safe default)

When review → `rejected`:
- **Do not** auto-approve pending images
- Optional (defer unless requested): set pending images → `rejected` on review reject
- R1E minimum: leave reject cascade unchanged; focus on approve path

---

## SECTION 6 — Status value decision

### Canonical visible status: `approved` (not `active`)

Evidence:
- SQL CHECK: `('pending','approved','rejected')`
- `handleAdminReviewUpdate` / `handleAdminImageUpdate` validators
- `mapReview` public filter: `=== 'approved'`
- `js/reviews.js` photo filter: `=== 'approved'`
- R1D upload insert: `status: 'pending'` ✓ correct

**No `active` status** in current code paths.

### `moderated_by` live-type decision (critical for image PATCH)

| Column | Repo | Live (user-provided) | Review approve | Image approve |
|--------|------|----------------------|----------------|---------------|
| `reviews.moderated_by` | TEXT | likely TEXT | Works | — |
| `review_images.moderated_by` | TEXT | **UUID** | — | **Fails** |

**R1E implementation rule:**
- Detect/write pattern safe for live UUID column:
  - **Preferred:** omit `moderated_by` on `review_images` update when no admin UUID available; set `moderated_at` only
  - **Or:** resolve admin UUID from `admin_users` / auth context if a stable UUID exists
  - **Never** write email string into UUID column
- Keep `reviews.moderated_by` behavior unchanged

---

## SECTION 7 — Required changes

### Backend — `functions/api/reviews/[[path]].js`

1. **Add helper** `approvePendingReviewImages(context, reviewId, moderationMeta)`:
   - `UPDATE review_images SET status='approved', moderated_at=now() WHERE review_id=? AND status='pending'`
   - Use existing `updateRows` or bulk PATCH via service role
   - Safe `moderated_by` handling per live column type

2. **`handleAdminReviewUpdate()`** — when `nextStatus === 'approved'`:
   - After review row update, call helper to approve pending images
   - Return refreshed review (images should show `approved`)

3. **`handleAdminImageUpdate()`** — fix live update payload:
   - Stop writing invalid `moderated_by` string to UUID column
   - Optionally verify image exists before update; return clear 404 if not
   - Return normalized `mapImage()` in response (already does)

4. **Logging (internal only):**
   - On image update failure: `reviewId`, `imageId`, `insertKeys`/payload keys, Supabase message
   - On cascade approve: count of images promoted

5. **Do not change:**
   - Upload path (R1D)
   - Retired `POST /api/reviews/images` (410)
   - Public list review gate (`reviews.status = approved`)
   - `publicOnly` image filter (still `approved` only)

### Admin UI — `admin/reviews/index.html`

1. Rename action button labels (Section 4)
2. After review approve success, ensure UI reflects updated image statuses from `data.review.images`
3. Optional pending-media hint on review cards with `pending` images
4. Fix `hydrateReview()` minor smell: default template sets `status: review.status` before merge — harmless when API sends `image.status`, but prefer default `image.status` to `'pending'` not parent review status

### No migration required

All changes are application-level status updates on existing columns.

---

## SECTION 8 — Validator plan

**Create:** `scripts/validate-r1e-review-image-moderation-alignment.mjs`

**Must fail if:**
- `handleAdminReviewUpdate` approves review but does not promote pending `review_images`
- Image-level approve handler missing or wrong route
- Image PATCH writes string `moderated_by` without UUID guard when live schema expects UUID
- Public `mapReview` publicOnly filter regresses (must still require `approved`)
- Admin UI uses ambiguous duplicate label `>Onayla<` without review/image qualifier (both buttons)
- Rejected images are bulk-approved on review approve
- Retired `/api/reviews/images` re-enabled
- R1D insert payload regresses (`user_id`, `sort_order`, `pending` status)
- R1B upload validation regresses
- R1 admin image normalization regresses
- Regression chain: R1D, R1B, R1, I1, C1, D3, D2, D1 validators

---

## SECTION 9 — Test plan

### Review approval cascade
- Review with 1 pending image → main approve → review `approved`, image `approved`
- Review with 2 pending images → both approved
- Review with 1 `rejected` + 1 `pending` → only pending becomes `approved`
- Already `approved` image stays `approved` (idempotent re-approve)
- Admin API list returns images with `status: approved` after cascade

### Image-level moderation
- `PATCH .../images/:id` with `status: approved` succeeds on live-safe payload
- `status: rejected` succeeds
- Wrong `reviewId`/`imageId` → structured error
- UI toast success; badge updates to **Onaylı**

### Public visibility
- Approved review + approved image → PDP shows photo URL
- Approved review + pending image (pre-fix simulation) → no photo
- Rejected image never shown publicly

### Admin UI
- Button text includes **Yorumu onayla** / **Görseli onayla**
- Mobile layout: no extra duplicate review approve control
- Thumbnail + fallback still work (R1)

### Regression
- R1D upload creates row with `pending`
- R1B JPEG/Blob upload still 201
- Retired endpoint 410
- Ownership on customer upload intact
- `assertAdmin` gate unchanged on admin routes

**Add to:** `tests/local-integration.test.mjs` under `R1E:` prefix.

---

## SECTION 10 — Implementation sequence

1. **Confirm live failure** — document exact PATCH error for image approve (uuid `moderated_by` hypothesis)
2. **Fix `handleAdminImageUpdate()`** — live-safe `moderated_by` / `moderated_at` payload
3. **Add approve-together cascade** in `handleAdminReviewUpdate()` for `approved`
4. **Admin UI labels** + optional pending-media hint
5. **Validator** `validate-r1e-review-image-moderation-alignment.mjs`
6. **Integration tests** (R1E block)
7. **Run full validator chain** (same list as R1D runbook + R1E)
8. **Docs:** REPORT, CHANGED_FILES, RUNBOOK, ROLLBACK (on implementation, not this plan)

**Deploy note:** Pages deploy only; no Supabase migration.

---

## SECTION 11 — Rollback plan

1. Revert R1E commit(s) on `functions/api/reviews/[[path]].js` and `admin/reviews/index.html`
2. Redeploy Cloudflare Pages
3. Verify:
   - Review approve returns to review-only update (images stay pending)
   - Upload still works (R1D)
   - Admin list loads
4. **No DB rollback** — any images already cascade-approved remain `approved` (acceptable; manual re-moderation if needed)

---

## Root cause summary

| Symptom | Root cause |
|---------|------------|
| Image stays **Bekliyor** after review approved | `handleAdminReviewUpdate` does not update `review_images.status` |
| Public PDP hides image | Public API requires `review_images.status === 'approved'`; images still `pending` |
| Image-level **Onayla** errors | Likely `moderated_by` type mismatch (string/email written to live UUID column) on `handleAdminImageUpdate` |
| Confusing duplicate **Onayla** | Same label for review-level vs image-level actions |

---

## Implementation needed?

**Yes.** Upload path is complete (R1D). R1E is a focused moderation-alignment batch:

- **Backend:** cascade approve + fix image PATCH payload for live schema
- **Admin UI:** label clarity
- **Tests + validator**

**Estimated files:**
- `functions/api/reviews/[[path]].js` (primary)
- `admin/reviews/index.html` (labels + minor hydrate fix)
- `scripts/validate-r1e-review-image-moderation-alignment.mjs` (new)
- `tests/local-integration.test.mjs` (R1E tests)
- R1E report/runbook/rollback docs (on implementation)

**Stop here. No implementation in this batch.**
