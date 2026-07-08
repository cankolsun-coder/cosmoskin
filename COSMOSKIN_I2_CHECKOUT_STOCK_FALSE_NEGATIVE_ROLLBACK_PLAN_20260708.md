# COSMOSKIN I2 — Rollback Plan (2026-07-08)

## When to rollback

- Checkout allows payment for genuinely out-of-stock products.
- Stock service errors cause checkout to proceed without server validation (should not happen — server still fail-closed).
- Item-level stock messages regress to silent failures.

## Git rollback (single commit)

If I2 is one commit on branch:

```bash
git revert <i2-commit-sha>
```

Or restore files from parent:

```bash
git checkout <parent-sha> -- \
  assets/inventory-client.js \
  assets/checkout-flow.js \
  assets/mobile-redesign.js \
  functions/api/_lib/inventory.js \
  functions/api/inventory/check.js \
  tests/local-integration.test.mjs
```

Remove I2-only artifacts if desired:

```bash
rm -f scripts/validate-i2-checkout-stock-false-negative.mjs \
  COSMOSKIN_I2_CHECKOUT_STOCK_FALSE_NEGATIVE_*.md \
  COSMOSKIN_I2_CHECKOUT_STOCK_FALSE_NEGATIVE_CHANGED_FILES_20260708.txt
```

## Post-rollback verification

```bash
node scripts/validate-i1-inventory-checkout-blocking.mjs
node --test tests/local-integration.test.mjs
```

Manual: confirm checkout blocks zero-stock cart on staging.

## Data / SQL

No migration was added. No database rollback required.
