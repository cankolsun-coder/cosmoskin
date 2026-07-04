# COSMOSKIN — H2 Rollback Plan: Return Attachment Preview + Admin Visibility

Date: 2026-07-04

## Risk profile

Low. H2 is code-only (no migration, no live policy/bucket change). Rollback is a pure code revert with no data or schema implications — nothing needs to be "undone" in Supabase.

## Rollback (full)

Revert the H2 commit(s) covering exactly these files (see `COSMOSKIN_H2_RETURN_ATTACHMENT_PREVIEW_CHANGED_FILES_20260704.txt` for the full list):

```
functions/api/_lib/return-attachments.js        (delete — new file)
functions/api/account/summary.js                (revert)
functions/api/returns.js                        (revert)
assets/account-dashboard.js                     (revert)
assets/admin-returns.js                         (revert)
assets/account-premium.css                      (revert)
assets/phase6-commerce.css                      (revert)
scripts/validate-h1-return-attachment-storage-rls.mjs   (revert — restores account-premium.css to its forbidden list)
scripts/validate-h2-return-attachment-preview.mjs       (delete — new file)
```

Redeploy. No Supabase action needed before, during, or after this revert.

## Effect of rollback

- Customer Returns tab reverts to showing only the plain attachment file name (the pre-H2 state) — a UX regression, not a security or data-integrity issue.
- Admin returns screen reverts to its 2026-07-02 state (thumbnails/links, no file-type/date meta line) — still fully functional, just less detailed.
- H1's storage RLS and `functions/api/returns.js` ownership guard are entirely unaffected either way (H2 never modified them).

## Partial rollback (customer-only, keep admin polish)

If only the customer-facing signing/UI needs to be reverted (e.g. an unexpected issue with signed URL generation in `summary.js`) while keeping the low-risk admin meta-line polish:

1. Revert `functions/api/account/summary.js` and `functions/api/returns.js` to their pre-H2 versions (removes the `signReturnAttachments` import/calls).
2. Revert `assets/account-dashboard.js`'s `renderReturnAttachment()`/attachment-list change (restores the plain-text fallback — degrades UX but is always safe, since the underlying data was never broken by H2, only its presentation).
3. Leave `functions/api/_lib/return-attachments.js`, `assets/admin-returns.js`, `assets/phase6-commerce.css`, and `assets/account-premium.css`'s new block in place — they have no effect once nothing calls `signReturnAttachments` from the customer path (the admin path uses its own separate, untouched `withSignedAttachmentUrls()`).

## What does NOT need to be rolled back

- No Supabase migration was run — there is nothing to reverse in the database.
- No storage bucket/policy was changed — H1's RLS policies remain exactly as they were.
- `functions/api/admin/returns.js` was not modified — no admin-side rollback risk exists there.

## Validation after rollback

```bash
node scripts/validate-h1-return-attachment-storage-rls.mjs
node scripts/validate-h0-live-payment-rpc-hotfix.mjs
node scripts/validate-account-batch-1-safe-fixes.mjs
node scripts/validate-account-batch-3-order-cancellation.mjs
node scripts/validate-account-batch-4-loyalty-ledger.mjs
node scripts/validate-account-ui-polish.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```
All should pass exactly as they did before H2 was implemented (H2's own validator, `scripts/validate-h2-return-attachment-preview.mjs`, would also need to be deleted as part of a full rollback since its required files would no longer exist).
