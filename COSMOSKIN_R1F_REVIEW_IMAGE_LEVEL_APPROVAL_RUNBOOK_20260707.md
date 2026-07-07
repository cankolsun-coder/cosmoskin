# COSMOSKIN R1F — Review Image-Level Approval — Runbook

**Date:** 2026-07-07

## Pre-deploy verification

```bash
node --check functions/api/reviews/[[path]].js
node --check js/reviews.js
node scripts/validate-r1f-review-image-level-approval.mjs
node scripts/validate-r1e-review-image-moderation-alignment.mjs
node --test tests/local-integration.test.mjs
```

## Deploy

Deploy Cloudflare Pages with R1F commit only after validation passes.

## Post-deploy smoke test (admin)

1. Open `/admin/reviews/`
2. Find an **approved** review with **Görsel beklemede** image
3. Click **Görseli onayla**
4. Expect: toast success, badge **Görsel onaylandı**, no HTTP 500
5. Open product PDP → approved image visible

## Post-deploy smoke test (bulk)

1. On approved review with pending image, click **Yorumu ve görselleri onayla**
2. Expect: pending image becomes **Görsel onaylandı**

## Post-deploy smoke test (reject)

1. Click **Görseli reddet** on a pending image
2. Expect: **Görsel reddedildi**, image not on public PDP

## Logs

On failure, Workers logs include `review_image_moderation_failed` with reviewId, imageId, action, patchKeys, Supabase code/message.

## No database steps

This batch is code-only. Do not run SQL or migrations for R1F.
