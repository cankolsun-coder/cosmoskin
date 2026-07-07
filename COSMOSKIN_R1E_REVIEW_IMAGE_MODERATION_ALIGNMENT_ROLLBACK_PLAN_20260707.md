# COSMOSKIN R1E — Review Image Moderation Alignment — Rollback Plan

**Date:** 2026-07-07

## When to roll back

- Review approval incorrectly approves images that should stay rejected
- Image-level moderation regressions after deploy
- Unexpected admin UI issues

## Rollback steps

### 1. Revert application code

```bash
git revert <R1E-commit-sha> --no-edit
```

Or restore prior versions:

```bash
git checkout <pre-R1E-sha> -- \
  'functions/api/reviews/[[path]].js' \
  admin/reviews/index.html \
  scripts/validate-r1e-review-image-moderation-alignment.mjs \
  tests/local-integration.test.mjs
```

### 2. Redeploy Cloudflare Pages

Deploy reverted commit after validators pass.

### 3. Verify

- Review approve returns to review-only update (images may stay pending)
- Image upload (R1D) still works
- Admin list loads
- Public PDP still hides pending images

## Database rollback

**Not required.** No schema changes.

## Data impact

Images cascade-approved under R1E remain `approved` in DB. Reverting code does not undo those rows. Manual re-moderation only if needed.

## Re-apply

1. Fix root cause if rollback was due to defect
2. Re-run R1E validator chain
3. Deploy R1E branch again
