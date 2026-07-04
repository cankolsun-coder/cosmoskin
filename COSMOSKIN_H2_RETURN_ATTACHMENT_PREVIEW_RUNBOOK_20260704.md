# COSMOSKIN — H2 Runbook: Return Attachment Preview + Admin Visibility

Date: 2026-07-04

## Summary

H2 is **code-only** — no SQL, no Supabase migration, no live policy change, no bucket configuration change. There is nothing to "run" against the live database. This runbook covers deployment and manual verification only.

## Pre-deploy checklist

1. Confirm the automated suite is green (already run and passing as of this batch):
   ```bash
   node --check functions/api/_lib/return-attachments.js
   node --check functions/api/account/summary.js
   node --check functions/api/returns.js
   node --check functions/api/admin/returns.js
   node --check assets/account-dashboard.js
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
2. No environment variable changes are required. H2 reuses the existing `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` bindings already used by `createSignedStorageUrl()` (unchanged from H1/the 2026-07-02 admin hotfix).

## Local verification (before/instead of a live deploy)

Static HTML/CSS/JS only (`python3 -m http.server 7700 --directory .`) is **not sufficient** to test this batch — the fix lives in `/api/account/summary` and `/api/returns`, which are Cloudflare Pages Functions. Use:

```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```

Then, with real Supabase env vars available to wrangler (`.dev.vars` or `--var`), sign in as a customer with at least one existing return request that has a real (not `pending-upload/...`) Storage-uploaded attachment:

1. Open `/account/profile.html?tab=returns`.
2. Expand a return's "İade detayını görüntüle" panel.
3. Confirm an image thumbnail (or a labeled video/file card) renders instead of plain text.
4. Click "Görüntüle" — confirm the actual file opens in a new tab.
5. Click "İndir" — confirm the file downloads with its original name (not a random token).
6. Open browser dev tools → Elements/view-source — confirm no `customer/<uuid>/<uuid>/...` path string appears anywhere in the visible DOM text.

For the admin side:
1. Open the admin returns screen, load with a valid admin token.
2. Confirm each attachment card now also shows a file-type label and an upload date beneath the file name.
3. Confirm "open in new tab" still works exactly as before (unchanged signing/fetch logic).

## Deploy

Standard Cloudflare Pages deploy (git push / existing CI pipeline). No special ordering or migration step is required before or after this deploy — H2 has no database dependency beyond tables/columns that already exist (`return_request_attachments.mime_type`, `.file_size`, `.created_at`, `.file_name` — all present since the 2026-07-02 migration).

## Post-deploy smoke test (production)

Repeat the local verification steps above against `https://www.cosmoskin.com.tr/account/profile.html?tab=returns` with a real customer account that has at least one return with a genuine Storage-uploaded attachment (not a legacy `pending-upload/...` record from the old standalone `/account/returns.html` flow — those never had a real object and will correctly show the "Önizleme şu anda hazırlanamıyor" fallback card, which is expected, not a bug).

## Monitoring

No new logging/alerting was added. If `preview_error: 'signed_url_unavailable'` starts appearing broadly (visible in production as the customer-facing "Önizleme şu anda hazırlanamıyor" fallback appearing for attachments that should have real files), check:
- Supabase Storage service health.
- `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL` env bindings on the Pages Functions deploy.
- Whether the affected attachment rows have a genuine `file_path` pointing at an object that actually exists in the `return-attachments` bucket (vs. a legacy/placeholder path).

## Rollback

See `COSMOSKIN_H2_RETURN_ATTACHMENT_PREVIEW_ROLLBACK_PLAN_20260704.md`.
