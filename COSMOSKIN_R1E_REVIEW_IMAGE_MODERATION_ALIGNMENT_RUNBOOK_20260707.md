# COSMOSKIN R1E — Review Image Moderation Alignment — Runbook

**Date:** 2026-07-07  
**Scope:** R1E only (no deploy included)

## What changed

- Approving a review now also approves attached `pending` images
- Image-level approve/reject no longer writes email into `moderated_by uuid`
- Admin labels distinguish review vs image actions

## Pre-deploy verification

```bash
node --check 'functions/api/reviews/[[path]].js'
node --check js/reviews.js
node scripts/validate-r1e-review-image-moderation-alignment.mjs
node scripts/validate-r1d-review-image-live-schema-alignment.mjs
node scripts/validate-r1c-review-image-record-failed.mjs
node scripts/validate-r1b-review-image-upload-failure.mjs
node scripts/validate-r1-admin-review-image-visibility.mjs
node scripts/validate-i1-inventory-checkout-blocking.mjs
node scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs
node scripts/validate-c1b-coupon-exclusions-metadata.mjs
node scripts/validate-c1-coupon-eligibility-hardening.mjs
node scripts/validate-d3-refund-snapshot-persistence.mjs
node scripts/validate-d2b-refund-discount-proration.mjs
node scripts/validate-d2-refund-amount-correctness.mjs
node scripts/validate-d1-returns-refunds-correctness.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## Manual smoke test

```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```

1. Customer submits review with image → image `pending`
2. Admin opens review moderation
3. Click **Yorumu ve görselleri onayla**
4. Confirm image pill shows **Görsel onaylandı**
5. Open PDP → approved review shows photo
6. Optional: test **Görseli onayla** / **Görseli reddet** on a separate pending image

## Operational notes

- No Supabase migration required
- Canonical public image status remains `approved`
- Rejected images are not auto-approved by review approval
