# COSMOSKIN — H2 Plan: Return Attachment Preview + Admin Visibility

Date: 2026-07-04
Status: **PLAN ONLY — no files edited, no migrations created, no SQL run, no live policy changed.**
Goal (as given): make return attachments visible and usable securely — customer can preview/open only their own files, admin can preview/open any return's files, bucket stays private, no public URLs, no raw storage paths shown to customers, signed URLs only after ownership/admin checks.

This plan is based on: `COSMOSKIN_PROJECT_MEMORY.md`, `COSMOSKIN_H1_RETURN_ATTACHMENT_STORAGE_RLS_REPORT_20260704.md`, the full current contents of `functions/api/returns.js` and `functions/api/admin/returns.js`, the relevant sections of `assets/account-dashboard.js` and `assets/admin-returns.js`, `functions/api/account/summary.js` (traced end-to-end — see the key finding in §0), `functions/api/admin/orders/[id].js`, and the `return_request_attachments` table definition in `supabase/migrations/20260702_customer_returns_account_pdp_polish.sql`.

---

## 0. Key finding that changes the plan: the customer return list does NOT call `functions/api/returns.js`'s GET at all

The plan brief's suggested check ("check whether `functions/api/returns.js` returns signed URLs") assumes the customer account UI reads from `GET /api/returns`. **It does not.** Tracing the actual code path:

- `assets/account-dashboard.js`'s `renderReturns()` reads `state.summary.returns` (line 796), which is populated by `normalizeSummary()` from the response of `apiFetch('/account/summary')` (line 1010) — **not** from `/api/returns`.
- A repo-wide search of `assets/*.js` confirms `GET /api/returns` is **never called by any frontend file**. The only call to `/returns` at all is a `POST` (return-request creation, `account-dashboard.js:1192`). `functions/api/returns.js`'s `onRequestGet` handler is effectively dead code for the current UI — it may exist for a future/other consumer, but is not what customers see today.
- The actual data path is `functions/api/account/summary.js`: it fetches `return_requests` (filtered to the authenticated user's own orders via `requireUser`/`buildInFilter(ids)`, `ids` coming from that user's own `orders`), then fetches `return_request_items`/`return_request_attachments`/`return_status_events` for those return ids (`selectRows(context, 'return_request_attachments', { select: '*', return_request_id: returnInFilter, ... })`, `summary.js:205-209`), groups them, and attaches `attachments: groupedReturnAttachments.get(row.id) || (...)` onto each return row (`summary.js:220-225`) before nesting that under each order and returning the whole payload as JSON — **raw, unsigned, exactly as stored** (`file_path`, `file_name`, `mime_type`, `file_size`, no `file_url`/signed URL added anywhere in this file).
- `assets/account-dashboard.js:804` then renders each attachment as `'<span>' + escapeHtml(file.file_name || file.file_path || 'Ek dosya') + '</span>'` — plain text, no link, no image, no action. This is the exact, confirmed cause of "customer return detail currently shows only the attachment file name."

**Consequence for this plan:** the primary fix belongs in **`functions/api/account/summary.js`**, not (only) in `functions/api/returns.js`. `functions/api/returns.js`'s own `GET` should still be fixed too, for parity/future-proofing (so it doesn't silently diverge from `summary.js`'s behavior if something starts using it later), but it is the secondary file, not the primary one.

## 1. Where things already stand (confirmed by reading the code, not assumed)

| Surface | Current state |
|---|---|
| Storage bucket (`return-attachments`) | Private, RLS ownership-scoped as of H1. Unaffected by H2 (no bucket/policy change proposed). |
| Customer upload (`assets/account-dashboard.js`, `uploadReturnAttachments`) | Already correct — uploads to `customer/{auth.uid()}/{order_id}/...` via the customer's own Supabase client session. Unaffected by H2. |
| Customer attachment **submission** (`functions/api/returns.js` `onRequestPost`) | Already correct as of H1 — verifies every submitted `file_path` belongs to the caller before persisting. Unaffected by H2. |
| Customer attachment **display** (`functions/api/account/summary.js` → `assets/account-dashboard.js`) | **Broken as described** — raw rows, no signed URL, plain file-name text only. **H2's primary target.** |
| Customer attachment display via `functions/api/returns.js` GET | Same gap (no signing), but currently unused by any UI. **H2's secondary target**, for parity. |
| Admin attachment **fetch + signing** (`functions/api/admin/returns.js`, `withSignedAttachmentUrls()`) | **Already implemented** (shipped 2026-07-02, `COSMOSKIN_RETURN_ATTACHMENT_SUCCESS_HOTFIX_REPORT_20260702.md`) — generates a 1-hour signed URL per attachment via the service-role `createSignedStorageUrl()` helper, after `assertAdmin(context)` has already run. Also has a fallback path for legacy return rows whose attachments only exist as a `requested_attachments` JSON snapshot (no `return_request_attachments` child row). |
| Admin attachment **rendering** (`assets/admin-returns.js`, `renderAttachment()`) | **Already implemented** — image attachments render as an `<img>` thumbnail card, video/other attachments render as a labeled card, both link to the signed URL in a new tab (`target="_blank" rel="noopener"`). Missing pieces are polish only: no explicit file type label, no upload date shown per attachment. |
| Admin auth on the returns endpoint | `assertAdmin(context)` already gates both `GET` and `PATCH` in `functions/api/admin/returns.js`. Unaffected by H2. |

**This significantly narrows H2's real scope** relative to the brief's framing: the admin side is ~90% already done (needs UI polish only, no new signing/auth logic), and the customer side needs the actual fix, concentrated in one file (`summary.js`) plus a UI rendering change plus (for parity) the same fix mirrored into `returns.js`'s own GET.

## 2. One security correction found in the existing (admin) pattern that H2 must NOT copy verbatim

`functions/api/admin/returns.js`'s `withSignedAttachmentUrls()` catch block does this today:

```30:41:functions/api/admin/returns.js
async function withSignedAttachmentUrls(context, rows = []) {
  return await Promise.all((rows || []).map(async (file) => {
    ...
    try {
      const signedUrl = await createSignedStorageUrl(context, bucket, path, 60 * 60);
      return { ...file, file_url: signedUrl, file_preview_url: signedUrl, signed_url_expires_in: 3600 };
    } catch (error) {
      return { ...file, file_url: null, file_preview_error: error.message || 'signed_url_failed' };
    }
  }));
}
```

`createSignedStorageUrl()`'s underlying `parseSupabaseResponse()` (`functions/api/_lib/supabase.js:27-40`) throws `new Error(message)` where `message` comes directly from Supabase's raw response body (`data.message || data.error_description || data.error || data.hint`). So `error.message` here **is a raw Supabase/storage provider error string**, and it is put directly into the JSON response as `file_preview_error`. This is a pre-existing, admin-only, low-severity issue (admin is a trusted actor) that is **out of scope to fix for H2** on the admin side — but it means H2's **customer-facing** equivalent must deliberately NOT copy this line verbatim. The plan (§4) requires the customer-facing signing helper to catch failures and return only a fixed, generic, static string — never `error.message` — satisfying "never expose raw Supabase errors" for the surface this request is actually about.

## 3. Customer UI audit (`assets/account-dashboard.js`)

**Why only the file name shows today:** confirmed at `account-dashboard.js:804` — `attachments.map(function(file){ return '<span>' + escapeHtml(file.file_name || file.file_path || 'Ek dosya') + '</span>'; })`. No `<img>`, no `<a href>`, no signed URL is ever requested or available at this point, since `summary.js` never adds one (§0).

**Planned fix:**
- Replace the plain `<span>` mapping with a `renderReturnAttachment(file)` function (new, customer-side, mirroring the shape of admin's `renderAttachment()` in `assets/admin-returns.js` but with customer-appropriate copy and a two-action layout):
  - **Image** (`mime_type` matches `image/*`): a card with an `<img>` thumbnail (`loading="lazy"`, `object-fit:cover`), the clean file name, and two actions: **"Görüntüle"** (opens the signed URL in a new tab) and **"İndir"** (same signed URL with a `download` query param appended — see §4 for why the URL itself, not the HTML `download` attribute, must carry this).
  - **Video** (`mime_type` matches `video/*`): a card with a generic video-file icon/label (no need to eagerly load large `<video>` content into the return list), the clean file name, and the same **"Görüntüle" / "İndir"** actions.
  - **Any other allowed type** (defensive fallback — today only jpeg/png/webp/mp4 are ever accepted, so this path should not normally trigger): a generic file card, same two actions.
  - **No signed URL available** (expired, generation failed, or a legacy pre-Storage record with no real object): a card showing the file name and a small "Önizleme şu anda hazırlanamıyor" note, with no broken/dead link.
  - **Never render `file.file_path`** as visible text under any circumstance (see §4/§5) — display name always falls back to `file.file_name || 'Ek dosya'`, never to `file.file_path`.
- New, small, scoped CSS additions in `assets/account-premium.css` (new class names, e.g. `.cs-return-attachment`, `.cs-return-attachment__media`, `.cs-return-attachment__actions`), visually consistent with the existing `.cs-return-detail-grid`/`.cs-return-file-list` styling already in that file — not a redesign, an extension of the existing return-detail card language.
- No change to the return-*creation* form or upload flow (`uploadReturnAttachments`, the `<input type="file">` field) — H2 is about **viewing** already-submitted attachments, not the upload step.

## 4. Customer API audit and plan (`functions/api/account/summary.js`, `functions/api/returns.js`)

**Confirmed: neither file returns a signed URL today** (§0/§1).

**Ownership is already structurally guaranteed by the existing query chain — no new ownership check needs to be invented, only the signing step needs to be added on top of data that is already correctly scoped:**
- `functions/api/account/summary.js`: `ordersRaw` is fetched scoped to the authenticated user (via `requireUser(context)` → the user's own `orders`, unchanged code, not touched by H2); `returnInFilter` is built only from the ids of returns whose `order_id` is in that already-owned order-id set; `return_request_attachments` is fetched only for `return_request_id IN (returnInFilter)`. **By construction, every attachment row reaching the signing step in this file already belongs to the authenticated caller.** This is the same "derive the signed-URL candidate set from a query that is already filtered to the caller, never from a client-supplied id" principle already used correctly by `functions/api/admin/returns.js` (there, "ownership" is simply "is an admin", checked once via `assertAdmin()` before any row is fetched).
- `functions/api/returns.js`'s `onRequestGet`: same shape — `return_requests` fetched scoped to `customer_email: eq.${lower(user.email)}`, then `return_request_attachments` fetched only for those return ids. Same structural guarantee applies.

**This is a deliberate design choice worth stating explicitly:** H2 will **not** add a new endpoint that accepts a client-supplied `attachment_id`/`file_path` and signs it on demand. That shape would require re-deriving and re-checking "does this id belong to this user" on every call, is a strictly larger attack surface (a new public input to validate), and provides no functional benefit over signing the already-owner-scoped list that these two endpoints already produce. If a future need arises for on-demand signed-URL refresh without a full summary reload, that should be its own, later, explicitly-scoped batch — not silently folded into H2.

**Planned implementation shape (both files use the same shared logic):**

1. New small helper module, `functions/api/_lib/return-attachments.js`, exporting one function:
   ```js
   export async function signReturnAttachments(context, attachments = []) {
     return Promise.all(attachments.map(async (file) => {
       const bucket = file.storage_bucket || 'return-attachments';
       const path = file.file_path || '';
       if (!path) return { ...file, file_url: null, file_preview_url: null };
       try {
         const signedUrl = await createSignedStorageUrl(context, bucket, path, 3600);
         return { ...file, file_url: signedUrl, file_preview_url: signedUrl, signed_url_expires_in: 3600 };
       } catch (_error) {
         // Deliberately never forwards _error.message (raw Supabase/storage text) —
         // see COSMOSKIN_H2_RETURN_ATTACHMENT_PREVIEW_PLAN_20260704.md §2.
         return { ...file, file_url: null, file_preview_url: null, file_preview_error: 'signed_url_unavailable' };
       }
     }));
   }
   ```
   This centralizes the "never leak raw errors" rule in exactly one place, used by every non-admin caller, instead of duplicating (and risking re-diverging) the same logic inline in two files. It is intentionally almost identical in shape to admin's existing `withSignedAttachmentUrls()`, minus the raw-error leak.
2. `functions/api/account/summary.js`: import `signReturnAttachments`; after building `returns` (the `.map()` at `summary.js:220-225` that already attaches `attachments: groupedReturnAttachments.get(row.id) || (...)`), await-map each return's `attachments` array through `signReturnAttachments()` before the value is used to build `orders`/the final response. Runs once per request, in parallel across all attachments (`Promise.all`), consistent with the store's current low order/attachment volume.
3. `functions/api/returns.js`'s `onRequestGet`: same treatment — after `attachments = await selectRows(...)` (line 148) and grouping, sign each return's attachment list the same way before the JSON response is built, for parity with `summary.js` even though nothing currently calls this handler.
4. **Never expose the service-role key**: unaffected either way — `createSignedStorageUrl()` already only uses the service-role key internally, server-side, to call Supabase's `/storage/v1/object/sign/...` endpoint; only the resulting temporary signed URL (a Supabase Storage domain URL with a short-lived token embedded) is ever returned to the client, exactly as the admin path already does today.
5. **Download vs. view**: no backend signature change needed. The frontend builds two hrefs from the one signed URL returned by the API: `viewHref = signedUrl` (opens the file) and `downloadHref = signedUrl + (signedUrl.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(file.file_name)` (Supabase Storage's object-serving endpoint honors a `download` query parameter to force a `Content-Disposition: attachment` response, independent of how the URL was signed) — this is more reliable than relying on the HTML `download` attribute, which browsers frequently ignore for cross-origin URLs (the signed URL's origin is the Supabase project domain, not `cosmoskin.com.tr`).

## 5. Admin API audit and plan (`functions/api/admin/returns.js`)

**Already satisfies every requirement in the brief:**
- Verifies admin: `assertAdmin(context)` on `GET`/`PATCH`, unchanged, not touched by H2.
- Fetches attachment records: `return_request_attachments` (plus the legacy `requested_attachments` JSON-snapshot fallback for older rows with no child table row).
- Generates signed URLs: `withSignedAttachmentUrls()`, 1-hour expiry, service-role only.
- Admin can preview/open files: `assets/admin-returns.js`'s `renderAttachment()` already renders thumbnails/links.

**No functional/API change planned for `functions/api/admin/returns.js`.** The one optional, low-risk improvement identified (§2 — stop forwarding raw `error.message` as `file_preview_error`) could be applied here too for consistency with the new customer-facing helper, but is **not required** to satisfy this request's stated goal and will only be done if explicitly approved, to avoid touching a working admin file beyond what's needed.

**Admin UI polish planned** (`assets/admin-returns.js`, `renderAttachment()`): add a small metadata line to each attachment card — file type (derived from `mime_type`, e.g. "Görsel" / "Video" / extension) and upload date (`file.created_at`, already present on every `return_request_attachments` row and already fetched, just not rendered) — no new API data is needed, since `created_at` is already selected via `select:'*'` in `functions/api/admin/returns.js`. "Open full image/video in new tab" already works today (`target="_blank"`); a modal/lightbox is explicitly optional/nice-to-have, not required to satisfy "admin can preview/open" (new-tab already satisfies "preview/open"), and is not planned for H2 to keep the change minimal — can be a later, separate polish batch if wanted.

## 6. Security requirements — how each is satisfied

| Requirement | How H2 satisfies it |
|---|---|
| Customer can preview/open only their own attachments | Signed URLs are only ever generated over attachment rows that arrived via a query already scoped to the authenticated caller's own orders/returns (§4) — never from a client-supplied id. |
| Admin can preview/open attachments for return requests | Already true today (§5), unaffected. |
| Bucket must stay private | No `storage.buckets` change proposed anywhere in this plan. H1's RLS policies are unaffected and unmodified. |
| Do not create public URLs | Every URL returned is a Supabase signed URL (temporary, expiring token embedded) — never a bare public object URL, never a bucket-public flip. |
| Do not show raw storage paths to customer | `assets/account-dashboard.js`'s new renderer never falls back to `file.file_path` for display text (§3) — a stricter rule than the current admin renderer, which does fall back to `file_path` in its own missing-name case (an existing, admin-only, lower-severity issue this plan does not attempt to also fix, to keep the admin diff at zero unless explicitly asked). |
| Use signed URLs only after ownership/admin checks | Customer: signing happens strictly after the existing owner-scoped `selectRows` calls (§4). Admin: signing happens strictly after `assertAdmin()` (§5, unchanged). |
| Preserve H1 (bucket private, cross-customer access blocked, `file_path` guard intact, admin auth required, no public bucket/URL) | Nothing in this plan touches `supabase/migrations/20260704_h1_return_attachment_storage_rls.sql`, the storage RLS policies, or `functions/api/returns.js`'s `isSafeAttachmentPath`/`isOwnedAttachmentPath`/`onRequestPost` guard (§4 only touches `onRequestGet` in that file). The planned H2 validator explicitly chains H1's validator and re-asserts the guard functions are still present (§7). |

## 7. UI expectation — final shape

**Customer return detail** (inside the existing `<details class="cs-return-details">` panel, replacing today's plain-text pill list):
- Image attachment → thumbnail card (small square/contain image), clean file name below, "Görüntüle" + "İndir" links.
- Video/other attachment → labeled card (file-type icon, no eager media load), clean file name, "Görüntüle" + "İndir" links.
- No raw storage path anywhere in the DOM's visible text.
- If a signed URL could not be produced, a calm fallback message instead of a broken link/image.

**Admin return detail** (`assets/admin-returns.js`, existing `.phase6-return-attachment` cards):
- Existing thumbnail/card + "open in new tab" behavior kept as-is.
- Add: file type label and upload date per attachment (data already fetched, rendering-only change).

## 8. Exact files to change later (implementation phase — not touched in this plan)

| File | Change |
|---|---|
| `functions/api/_lib/return-attachments.js` | **New.** `signReturnAttachments()` shared helper (§4). |
| `functions/api/account/summary.js` | Sign each return's `attachments` array before responding — the primary fix (§0/§4). |
| `functions/api/returns.js` | Sign each return's `attachments` array in `onRequestGet`, for parity — secondary fix (§4). No change to `onRequestPost`'s existing H1 ownership guard. |
| `functions/api/admin/returns.js` | No functional change planned (§5). Only touched if the optional raw-error-message tightening (§2) is separately approved. |
| `assets/account-dashboard.js` | New `renderReturnAttachment()` renderer; replace the plain-text attachment list at `renderReturns()` (§3). No change to the upload flow. |
| `assets/admin-returns.js` | Extend `renderAttachment()` with file type + upload date (§5). No change to signing/fetching (already correct). |
| `assets/account-premium.css` | New, minimal, additive classes for the customer attachment card/thumbnail (§3). No change to existing selectors. |
| `scripts/validate-h2-return-attachment-preview.mjs` | **New.** Validator (§9). |
| `COSMOSKIN_H2_RETURN_ATTACHMENT_PREVIEW_REPORT_20260704.md`, `..._CHANGED_FILES_20260704.txt`, `..._RUNBOOK_20260704.md` (or a lighter "no live SQL involved" note in lieu of a Supabase runbook, since H2 needs no migration) | Deliverables, once approved and implemented. |

No `supabase/migrations/*` file is anticipated for H2 — no schema or policy change is needed (`return_request_attachments.created_at`/`mime_type`/`file_name` already exist; H1's storage policies already correctly gate the underlying objects regardless of which server-side code path requests a signed URL).

## 9. Validator plan: `scripts/validate-h2-return-attachment-preview.mjs`

Static, file-content-based validator (same style as `validate-h1-return-attachment-storage-rls.mjs`), to fail if:

- `assets/account-dashboard.js` still contains the old plain-file-name-only rendering (the literal `file.file_name || file.file_path || 'Ek dosya'` wrapped in a bare `<span>` with no link/image) — regression guard for the exact bug this batch fixes.
- Any customer-facing rendering path (`assets/account-dashboard.js`) references `file.file_path` for **display text** at all (stricter than "only as a fallback" — per §6, the customer path must never use it, even as a fallback).
- `functions/api/account/summary.js` does not import/call the new signing helper (or does not otherwise produce a `file_url`/`file_preview_url` on returned attachments) — i.e., the primary fix is actually wired in.
- The signing helper (or its call sites) computes/accepts a client-supplied attachment id/file_path from the request (query string, body) rather than operating only on server-derived, already-owner-scoped rows — guards against accidentally introducing the larger-attack-surface shape explicitly rejected in §4.
- The customer-facing signing helper's catch/error path forwards `error.message`/`error.stack` into any field returned to the client (regression guard for §2's specific correction).
- `functions/api/admin/returns.js` no longer calls `assertAdmin` before fetching/signing attachments (regression guard — admin check must remain).
- Any `storage.buckets` public flag change, or any new `supabase/migrations/*.sql` file, is present in the diff (H2 must be migration-free).
- `functions/api/returns.js` no longer contains `isSafeAttachmentPath`/`isOwnedAttachmentPath`/the `rawAttachmentPaths` ownership-guard block from H1 (regression guard — H1's fix must remain intact).
- `scripts/validate-h1-return-attachment-storage-rls.mjs` fails (chained).
- Any of checkout (`checkout.html`, `assets/checkout.js`, `functions/api/create-checkout.js`), payment RPCs (`functions/api/iyzico-callback.js`, `functions/api/cron/release-expired-inventory.js`, the H0/H0b/H0c migrations), admin RBAC (`functions/api/_lib/admin.js`, `functions/api/_lib/admin-audit.js`), or the loyalty ledger (`functions/api/_lib/loyalty-ledger.js`) shows a diff (forbidden-path guard, same pattern as H1's validator).

## 10. Tests to run (at implementation time)

```bash
node scripts/validate-h2-return-attachment-preview.mjs
node scripts/validate-h1-return-attachment-storage-rls.mjs
node scripts/validate-h0-live-payment-rpc-hotfix.mjs
node scripts/validate-account-batch-1-safe-fixes.mjs
node scripts/validate-account-batch-3-order-cancellation.mjs
node scripts/validate-account-batch-4-loyalty-ledger.mjs
node scripts/validate-account-ui-polish.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## 11. Manual QA plan (post-implementation, against a real/staging environment)

1. **Customer A uploads a return image and can preview/open it**: submit a return with a photo attachment (a reason like "Ürün hasarlı geldi" forces one); reload the account Returns tab; confirm a thumbnail renders, "Görüntüle" opens the actual image in a new tab, "İndir" downloads it with its original file name (not a random token/UUID).
2. **Customer B cannot preview/open Customer A's file**: as a second customer, confirm there is no UI path to see customer A's return/attachment at all (already true — `summary.js`'s query is scoped per-user); as an extra defense-in-depth check, confirm the H1 manual QA step (direct Storage REST call with B's own token against A's known object path) still returns 403 — unaffected by H2, re-verified for regression.
3. **Admin can preview/open Customer A's file**: in the admin returns screen, confirm the same attachment renders as a thumbnail/card and opens correctly via the already-existing admin signed-URL path, now also showing file type + upload date.
4. **Raw storage path is not visible**: inspect the rendered DOM/visible text in both the customer return detail and the admin return card; confirm no `customer/{uuid}/{uuid}/...` path string appears anywhere in visible text (view-source/inspect-element check, not just visual).
5. **Signed URL expiry does not permanently break the page**: wait past the signed URL's expiry window (or simulate by using an intentionally-expired test URL), confirm clicking an expired "Görüntüle"/"İndir" link fails gracefully (browser/Supabase's own expired-token error page, not a COSMOSKIN page crash), and confirm simply reloading the account Returns tab (`loadSummary()`) fetches a fresh signed URL and restores working preview/download links — no special client-side expiry-refresh logic is needed since every full reload re-signs from scratch (§4).

---

## Summary

| Item | Answer |
|---|---|
| Root cause (customer) | `functions/api/account/summary.js` (the actual data source for the account Returns tab — **not** `functions/api/returns.js`'s unused GET) never signs attachment URLs; `assets/account-dashboard.js` only ever renders the bare file name as text. |
| Root cause (admin) | Already fixed 2026-07-02 — admin signing + thumbnail/card rendering already work; only file-type/upload-date polish remains. |
| Fix strategy (API) | New shared `signReturnAttachments()` helper, applied to `summary.js` (primary) and `returns.js`'s `onRequestGet` (parity) — signs only rows already produced by each file's existing owner-scoped query, never a client-supplied id/path. No new endpoint, no new client-facing input to validate. |
| Fix strategy (UI) | New `renderReturnAttachment()` in `account-dashboard.js` (thumbnail/card + "Görüntüle"/"İndir", never shows `file_path`); small additive polish to `admin-returns.js`'s existing renderer (file type + upload date). |
| Security | Bucket stays private, no public URLs, no raw paths shown, ownership enforced structurally (query scoping) rather than by a new per-request check, admin path unchanged, H1's storage RLS and `returns.js` ownership guard both explicitly re-verified by the new validator. |
| Schema/migration | None needed. |
| Risk | Low — the riskiest-looking piece (customer signed URLs) reuses an already-proven pattern from the admin side, adjusted only to close the one raw-error-leak gap that pattern has today. |

Stop here — no files created/edited beyond this plan document, no SQL executed, no live policy changed. Awaiting approval to implement H2. Not starting H3 or any other batch.
