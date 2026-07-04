# COSMOSKIN — H2 Report: Return Attachment Preview + Admin Visibility

Date: 2026-07-04
Status: **Implemented, validated, documented.** Migration-free (no SQL, no live policy change).
Source of truth: `COSMOSKIN_H2_RETURN_ATTACHMENT_PREVIEW_PLAN_20260704.md`

## Problem

Customer return detail showed only the raw attachment file name as plain text — no preview, no way to open or download an uploaded photo/video. The admin return screen already had signed-URL preview (shipped 2026-07-02), but with no file type/upload-date context.

## Confirmed root cause

The customer Returns tab does **not** call `GET /api/returns`. It reads `state.summary.returns`, populated from `GET /api/account/summary` (`functions/api/account/summary.js`), which fetched `return_request_attachments` raw and unsigned. `assets/account-dashboard.js` then rendered each attachment as a bare `<span>{file_name}</span>`. The fix therefore had to land in `functions/api/account/summary.js` (primary), not only in `functions/api/returns.js` (parity).

## What was built

### 1. Shared signing helper — `functions/api/_lib/return-attachments.js` (new)
`signReturnAttachments(context, rows)` — the single exported function. For each already-fetched `return_request_attachments`-shaped row:
- Rejects malformed/unsafe storage paths before ever calling Supabase (defense-in-depth, mirrors `isSafeAttachmentPath` from H1).
- Delegates actual signing to the existing `createSignedStorageUrl()` helper (service-role, 1-hour expiry) — no duplicated Storage-signing logic, no direct handling of the service-role key.
- Builds a `download_url` by appending `?download=<filename>` to the signed URL (Supabase Storage's object-serving endpoint honors this to force `Content-Disposition: attachment`, more reliably than the HTML `download` attribute across the Supabase origin).
- Returns exactly: `file_name, mime_type, file_size, created_at, signed_url, download_url, preview_kind` (+`preview_error` on failure) — **never `file_path`/`storage_bucket`**.
- On any signing failure, returns a fixed `preview_error` code — **never** the caught error's `message`/`stack` (which `createSignedStorageUrl`'s `parseSupabaseResponse` populates from Supabase's raw response body).
- Documented contract: this module must only ever be called with rows the caller already fetched through an ownership-scoped (customer) or `assertAdmin()`-gated (admin) query — it takes no request/body/query input itself.

### 2. Customer summary API — `functions/api/account/summary.js` (the actual fix)
Each return's `attachments` array (sourced from `return_request_attachments`, already scoped via `return_request_id: returnInFilter` → ids of `returns` → `order_id: inFilter` → this authenticated user's own `orders`) is now passed through `signReturnAttachments()` before the response is built. Ownership was already guaranteed by this existing query chain; H2 only added the signing step on top of it — no new client input is accepted anywhere in this file.

### 3. `functions/api/returns.js` GET — parity fix
Same treatment applied to `onRequestGet`'s own attachment list (unused by any current UI, kept in parity for future-proofing). The H1 `onRequestPost` ownership guard (`isSafeAttachmentPath`, `isOwnedAttachmentPath`, the `rawAttachmentPaths` rejection block) is **untouched**.

### 4. Customer UI — `assets/account-dashboard.js`
New `renderReturnAttachment(file)` replaces the old plain-text `<span>` list:
- Image (`preview_kind === 'image'`) → thumbnail card.
- Video/other → labeled file/video card (no eager media load).
- Shows clean file name, file size, upload date (all backend-provided).
- "Görüntüle" (view, opens `signed_url`) and "İndir" (download, opens `download_url`) actions.
- Missing/expired signed URL → calm fallback card, no broken link.
- Never references `file.file_path` anywhere (stricter than the pre-existing admin renderer's own fallback).

### 5. Admin UI polish only — `assets/admin-returns.js`
Added a small meta line per attachment card: file type label (Görsel/Video/Dosya) + upload date (`created_at`, already fetched via `select:'*'`, previously unused). No change to `withSignedAttachmentUrls()` signing/fetch logic, no change to `assertAdmin()`.

### 6. CSS — additive only
- `assets/account-premium.css`: new `H2_RETURN_ATTACHMENT_PREVIEW`-marked block (`.cs-return-attachment*`) for the customer card/thumbnail/actions, mobile-responsive at 640px.
- `assets/phase6-commerce.css`: one new rule (`.phase6-return-attachment__meta`) for the admin card's new meta line.
- No existing selector was modified; no header/footer/PDP/checkout/loyalty selector touched.

### 7. Validator — `scripts/validate-h2-return-attachment-preview.mjs` (new)
Fails on: plain-file-name-only regression, any `file.file_path` reference in customer UI, missing/misused signing wiring in `summary.js`/`returns.js`, a new endpoint importing the shared helper, admin auth/signing regressions, raw-error forwarding in the helper, public-bucket/migration changes, H1 guard removal, out-of-scope CSS selectors, or forbidden-path (checkout/payment/RBAC/loyalty/unrelated-admin) diffs. Chains `validate-h1-return-attachment-storage-rls.mjs` (which itself chains H0 and Batch 1/3/4/UI-polish).

### 8. Required scope-guard maintenance
`assets/account-premium.css` was zero-diff-forbidden in `scripts/validate-h1-return-attachment-storage-rls.mjs`. H2's plan and this approval explicitly scope a minimal, additive CSS change to that file, so it was removed from H1's forbidden-path list (documented inline, same precedent already used for `functions/api/returns.js` when H1 itself needed to touch a previously-frozen file). No H1 storage RLS behavior or assertion changed — H1's validator still runs unmodified in every other respect and still passes.

## Tests — all passing

```
node --check functions/api/_lib/return-attachments.js
node --check functions/api/account/summary.js
node --check functions/api/returns.js
node --check functions/api/admin/returns.js
node --check assets/account-dashboard.js
node scripts/validate-h2-return-attachment-preview.mjs        → PASS
node scripts/validate-h1-return-attachment-storage-rls.mjs    → PASS
node scripts/validate-h0-live-payment-rpc-hotfix.mjs          → PASS
node scripts/validate-account-batch-1-safe-fixes.mjs          → PASS
node scripts/validate-account-batch-3-order-cancellation.mjs  → PASS
node scripts/validate-account-batch-4-loyalty-ledger.mjs      → PASS
node scripts/validate-account-ui-polish.mjs                   → PASS
node scripts/validate-production-launch-readiness.mjs         → PASS
node --test tests/local-integration.test.mjs                  → PASS (20/20)
```

## Security checklist (all preserved/satisfied)

| Requirement | Status |
|---|---|
| Bucket remains private | ✅ No migration/SQL touched by H2 |
| No public URLs | ✅ Only short-lived Supabase signed URLs returned |
| Customer cannot preview another customer's file | ✅ Signing only ever runs over rows from an already-user-scoped query |
| Customer cannot pass arbitrary `file_path` for signing | ✅ Helper takes no request input; validator asserts no new endpoint imports it |
| Admin endpoint requires real admin auth | ✅ `assertAdmin(context)` unchanged, re-asserted by validator |
| `service_role` only used server-side | ✅ Unchanged; helper delegates to existing `createSignedStorageUrl()` |
| No raw Supabase/Storage errors exposed to customers | ✅ New helper returns only fixed `preview_error` codes |
| H1's `file_path` ownership guard (`onRequestPost`) intact | ✅ Untouched, re-asserted by validator |

## Files changed/created

See `COSMOSKIN_H2_RETURN_ATTACHMENT_PREVIEW_CHANGED_FILES_20260704.txt`.

## Deferred / explicitly out of scope

- Admin order-detail screen (`assets/admin-orders.js` / `functions/api/admin/orders/[id].js`) does not fetch/render return attachments at all — a separate, adjacent gap noticed during the audit but not part of this request's stated problem ("admin **return** screen"). Not touched.
- Tightening `functions/api/admin/returns.js`'s pre-existing `file_preview_error: error.message` (raw provider text, admin-only, low severity) was identified but intentionally **not** applied — out of the approved H2 scope ("do not rewrite admin signing logic").
- On-demand signed-URL refresh endpoint (without a full account-summary reload) was considered and explicitly rejected in the plan as unnecessary added attack surface; a full reload (which already happens on every tab switch/`loadSummary()` call) re-signs everything from scratch.

## Not started

No other batch was started. Stopping after H2 per instruction.
