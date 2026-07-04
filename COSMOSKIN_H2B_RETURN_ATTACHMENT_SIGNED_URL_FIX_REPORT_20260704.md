# COSMOSKIN — H2B Report: Fix Return Attachment Signed URL Opening/Downloading

Date: 2026-07-04
Status: **Implemented, validated.** No migration, no SQL, no bucket/policy change.

## Exact root cause

`functions/api/_lib/supabase.js`'s `createSignedStorageUrl()` — the single low-level helper both the customer path (`functions/api/_lib/return-attachments.js`) and the admin path (`functions/api/admin/returns.js`) delegate to — mis-assembled the final URL.

Supabase's `POST /storage/v1/object/sign/{bucket}/{path}` response returns `signedURL` as a path **relative to the storage service root**, e.g.:

```
"/object/sign/return-attachments/customer/<uid>/<order_id>/169...-0.jpg?token=eyJhbGciOi..."
```

The pre-H2B code did:

```js
return /^https?:\/\//i.test(signed) ? signed : `${url}${signed.startsWith('/') ? '' : '/'}${signed}`;
```

where `url` is the bare project URL (`https://<ref>.supabase.co`, **not** `.../storage/v1`). This produced:

```
https://<ref>.supabase.co/object/sign/return-attachments/customer/<uid>/.../file.jpg?token=...
```

— missing the required `/storage/v1` segment. That path doesn't resolve to the Storage object-serving route at all; hitting it returns the exact reported error, `"No API key found in request"`, instead of the file. This is a well-documented Supabase Storage REST API gotcha (the SDK's own `storage-js` and the `storage` service's route schema both confirm `signedURL` is relative to `/storage/v1`, not the project root — see e.g. `supabase/storage`'s `getSignedURL.ts` route schema and the `storage-go` community client's own equivalent bugfix).

**This bug predates H2** — it lived in `createSignedStorageUrl()` since the 2026-07-02 admin attachment-preview hotfix, so the admin "Görüntüle"/image-thumbnail click-through was very likely equally broken and simply hadn't been end-to-end click-tested since. H2 (2026-07-04) then reused the same broken helper for the customer path, which is how the bug surfaced now. Fixing the shared helper fixes both, without touching any admin-specific file.

## Fix

`functions/api/_lib/supabase.js`, `createSignedStorageUrl()`:

```js
if (!signed) return null;
if (/^https?:\/\//i.test(signed)) return signed;
const relativePath = signed.startsWith('/') ? signed : `/${signed}`;
const withStoragePrefix = relativePath.startsWith('/storage/v1/') ? relativePath : `/storage/v1${relativePath}`;
return `${url}${withStoragePrefix}`;
```

This now correctly produces:

```
https://<ref>.supabase.co/storage/v1/object/sign/return-attachments/customer/<uid>/<order_id>/file.jpg?token=eyJhbGciOi...
```

— matches Supabase's own documented full-URL shape exactly, and is idempotent if Supabase ever starts returning an already-`/storage/v1`-prefixed path (no double-prefixing).

## Additional defense-in-depth added

1. **`functions/api/_lib/return-attachments.js`**: after calling `createSignedStorageUrl()`, the result is only accepted if it matches `/\/storage\/v1\/object\/sign\//` **and** contains a `token=` query parameter; otherwise the attachment is treated as `preview_error: 'attachment_unavailable'` (never forwards a malformed/partial URL).
2. **`assets/account-dashboard.js`**: new `isRealSignedUrl(value)` guard — `renderReturnAttachment()` only ever treats `file.signed_url`/`file.download_url` as usable if they match the same real-signed-URL shape. If not, no `Görüntüle`/`İndir` buttons are rendered at all (never falls back to `file_path`, `storage_path`, or any raw/public object URL).
3. **Missing/failed signing UX**: the customer card now shows the exact required copy — "Dosya şu anda görüntülenemiyor." — with no buttons rendered.
4. **Broken image thumbnail fallback**: the `<img>` now has an `onerror` handler that hides the broken image and swaps in a plain "Dosya" file-card look (`.cs-return-attachment__media--broken`, new CSS rule) — a failed image load can never remain visible as a broken-image icon. The "Görüntüle"/"İndir" actions are unaffected by this (they still use the same valid `signed_url`/`download_url`; only the inline `<img>` preview swaps).

## Exact `signed_url`/`download_url` shape (after fix)

```
signed_url:   https://<project-ref>.supabase.co/storage/v1/object/sign/return-attachments/customer/<uid>/<order_id>/<ts>-<idx>.jpg?token=<jwt>
download_url: https://<project-ref>.supabase.co/storage/v1/object/sign/return-attachments/customer/<uid>/<order_id>/<ts>-<idx>.jpg?token=<jwt>&download=<original-filename>
```

Both always contain `/storage/v1/object/sign/` and a `token=` parameter; `download_url` is always derived from `signed_url` by appending `download=` with `&` or `?` chosen based on whether `signed_url` already has a query string (it always does, so `&` in practice) — never a separate/raw `/object/...` URL.

## Files changed

| File | Change |
|---|---|
| `functions/api/_lib/supabase.js` | Root-cause fix in `createSignedStorageUrl()` — correct `/storage/v1` resolution of Supabase's relative `signedURL`. |
| `functions/api/_lib/return-attachments.js` | Added a real-signed-URL shape check (`/storage/v1/object/sign/` + `token=`) before ever returning `signed_url`/`download_url`. |
| `assets/account-dashboard.js` | Added `isRealSignedUrl()` guard; updated the missing-signed-URL fallback copy to "Dosya şu anda görüntülenemiyor."; added `onerror` broken-image fallback on the thumbnail `<img>`. |
| `assets/account-premium.css` | One new additive rule, `.cs-return-attachment__media--broken`, for the broken-image fallback state. |
| `scripts/validate-h2-return-attachment-preview.mjs` | Extended with H2B checks (see below). |

No file outside this list was touched. `functions/api/admin/returns.js` and `assets/admin-returns.js` were inspected but **not modified** — they inherit the fix automatically because they call the same shared `createSignedStorageUrl()`, with no admin-specific code change required or made.

## Validator additions (`scripts/validate-h2-return-attachment-preview.mjs`)

- Regression guard for the exact pre-H2B buggy return line in `createSignedStorageUrl()`.
- Requires `/storage/v1` to appear at least twice in the function body (once in the outgoing request, once in the response-URL fix) and requires a `startsWith('/storage/v1'...)` double-prefix guard.
- Customer UI must never reference `file.storage_path`/`file.storage_bucket`, a raw `/object/public/` URL, or `file.file_url` as a fallback.
- Customer UI must gate usable URLs through a real-signed-URL shape check (`isRealSignedUrl` + `/storage/v1/object/sign/`).
- The missing-signed-URL branch must not render `Görüntüle`/`İndir`/`cs-mini-btn` and must show "Dosya şu anda görüntülenemiyor."
- The image thumbnail must have an `onerror` fallback.
- Chains `validate-h1-return-attachment-storage-rls.mjs` (unmodified, still passing).

Sanity-verified: temporarily reintroducing the exact pre-fix buggy line into `supabase.js` and re-running the validator produces 3 explicit failures pinpointing the regression; restoring the fix passes again cleanly.

## Test results

```
node --check functions/api/_lib/return-attachments.js   → OK
node --check functions/api/account/summary.js            → OK
node --check functions/api/returns.js                     → OK
node --check assets/account-dashboard.js                  → OK
node scripts/validate-h2-return-attachment-preview.mjs    → PASS
node scripts/validate-h1-return-attachment-storage-rls.mjs → PASS
node scripts/validate-production-launch-readiness.mjs     → PASS
node --test tests/local-integration.test.mjs               → PASS (20/20)
```

## Security preserved

- Bucket privacy/RLS: untouched (no migration, no policy change).
- Ownership scoping: unaffected — signing still only ever runs over rows already fetched through the customer's own owner-scoped query or admin's `assertAdmin()`-gated query (nothing in H2B changes what rows reach the signer).
- No raw `file_path` exposed: unchanged from H2, additionally now enforced by the frontend's real-signed-URL shape guard.
- `service_role` key: still never leaves the backend; only the resulting temporary signed URL is returned, now simply constructed correctly.

## Not started

No other batch was started. Stopping after H2B per instruction.
