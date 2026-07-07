# COSMOSKIN R1F — Review Image-Level Approval — Rollback Plan

**Date:** 2026-07-07

## When to rollback

- Image-level approve/reject still returns 500 after deploy
- Review bulk approve regresses
- Public PDP shows pending/rejected images

## Rollback steps

1. Revert R1F commit on `main` (or redeploy previous Pages deployment)
2. Confirm admin image buttons return prior behavior (likely 500 on live — known pre-R1F state)
3. Re-run validators on reverted tree if needed

## Files to revert

- `functions/api/reviews/[[path]].js`
- `admin/reviews/index.html`
- `scripts/validate-r1f-review-image-level-approval.mjs`
- `scripts/validate-r1e-review-image-moderation-alignment.mjs` (if R1F touched)
- `tests/local-integration.test.mjs`
- R1F docs

## Data impact

None. Rollback is code-only. Existing `review_images` rows are unchanged.

## No SQL rollback

No migration was applied for R1F.
