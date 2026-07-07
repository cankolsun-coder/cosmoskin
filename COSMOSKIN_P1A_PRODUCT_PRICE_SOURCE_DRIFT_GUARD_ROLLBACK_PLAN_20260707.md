# COSMOSKIN P1A — Product Price Source Drift Guard Rollback Plan

Date: 2026-07-07

## Rollback trigger

- P1A validator false positives block unrelated work
- Helper import breaks Node test runner in CI
- Documentation-only overhead not wanted (unlikely production impact)

## Rollback steps

1. Remove P1A-specific files:
   - `scripts/validate-p1a-product-price-source-drift.mjs`
   - `scripts/lib/product-price-catalog.mjs`
   - `COSMOSKIN_P1A_PRODUCT_PRICE_SOURCE_DRIFT_GUARD_*.md`
   - `COSMOSKIN_P1A_PRODUCT_PRICE_SOURCE_DRIFT_GUARD_CHANGED_FILES_20260707.txt`

2. Revert P1A tests in `tests/local-integration.test.mjs` (two `P1A:` tests at end of file).

3. Confirm no catalog or checkout files were modified (they should not be).

4. Re-run baseline validators without P1A:

```bash
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## Production impact of rollback

**None on live pricing.** P1A is read-only guard tooling. Rollback only removes drift detection; it does not change runtime catalog sources or checkout trust model.

## Data impact

No database or order data affected. No migrations to roll back.

## Re-apply

Re-merge P1A branch or restore deleted files from git history, then run:

```bash
node scripts/validate-p1a-product-price-source-drift.mjs
```
