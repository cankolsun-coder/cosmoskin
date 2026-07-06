# COSMOSKIN R1 — Admin Review Image Visibility Runbook

**Date:** 2026-07-06  
**Scope:** R1 only, no deploy included

## What Changed

Customer PDP review images now upload through `POST /api/reviews/:reviewId/images` after the review exists. The admin API returns normalized image objects and the admin reviews UI shows a fallback if an image cannot load.

## Verification Commands

Run from repo root:

```bash
node --check js/reviews.js
node --check 'functions/api/reviews/[[path]].js'
node --check scripts/validate-r1-admin-review-image-visibility.mjs
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

There is no `assets/admin-reviews.js`; the real admin reviews UI is the inline script in `admin/reviews/index.html`. To syntax-check it:

```bash
python3 - <<'PY'
from pathlib import Path
html = Path('admin/reviews/index.html').read_text()
start = html.find('<script>')
end = html.find('</script>', start)
Path('/tmp/cosmoskin-admin-reviews-inline.js').write_text(html[start+len('<script>'):end])
PY
node --check /tmp/cosmoskin-admin-reviews-inline.js
```

## Manual Smoke Test

Use the full local Pages Functions runtime if testing APIs:

```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```

Smoke steps:
- Log in as a customer who can review a purchased product.
- Open a PDP using `js/reviews.js`.
- Submit a text-only review; it should still save.
- Submit a review with one JPG/PNG/WebP under 2 MB; network should show `POST /api/reviews/:reviewId/images`, not `POST /api/reviews/images`.
- Open admin reviews; the review image should appear as a thumbnail.
- Break or block the image URL in browser devtools; the card should show `Görsel yüklenemedi`.

## Operational Notes

- Do not change the `review-images` bucket in R1.
- Do not run SQL for R1.
- Existing orphaned storage objects from the retired PDP path are not backfilled by this change.
- Image status moderation remains unchanged.
