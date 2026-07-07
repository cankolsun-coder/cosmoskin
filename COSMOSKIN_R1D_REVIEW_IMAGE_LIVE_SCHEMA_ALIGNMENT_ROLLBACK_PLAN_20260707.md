# COSMOSKIN R1D — Review Image Live Schema Alignment — Rollback Plan

**Date:** 2026-07-07

## When to roll back

- Review image upload still fails with `image_record_failed` after R1D deploy.
- Unexpected admin moderation regressions on new image rows.

## Rollback steps

### 1. Revert application code

```bash
git revert <R1D-commit-sha> --no-edit
```

Or restore prior versions:

```bash
git checkout <pre-R1D-sha> -- \
  'functions/api/reviews/[[path]].js' \
  scripts/validate-r1d-review-image-live-schema-alignment.mjs \
  scripts/validate-r1c-review-image-record-failed.mjs \
  tests/local-integration.test.mjs
```

### 2. Redeploy Cloudflare Pages

Deploy the reverted commit to production after local validators pass.

### 3. Verify

- PDP review text-only submit still works.
- Image upload returns prior behavior (may still fail if pre-R1D schema mismatch).
- Admin reviews list loads.
- Retired `/api/reviews/images` still returns 410.

## Database rollback

**Not required.** R1D did not create migrations or alter Supabase schema.

## Data impact

Rows successfully inserted under R1D remain valid. Reverting code does not delete existing `review_images` records.

## Re-apply

1. Fix root cause if rollback was due to unexpected issue.
2. Re-run R1D validator chain.
3. Deploy R1D branch again.
