# COSMOSKIN UX3 — Rollback Plan

## Blast radius
Presentation-only: 5 asset files (CSS ×4, JS presentation in phase6-commerce.js),
plus validator/tests/docs. No SQL, no migrations, no deploy, no pricing/coupon/
checkout/stock/admin/refund logic, products.json untouched. Cart data shape,
coupon state and totals math are byte-identical to pre-UX3.

## Rollback (single commit revert)
```bash
git revert <UX3_COMMIT_HASH>
```
Restores:
- the six legacy drawer CSS layers (the 78px/31dvh collision returns — only revert if UX3 itself causes a worse regression),
- the old drawer header (kicker + long title), arrow rec-carousel, cookie z-index 330,
- removes the UX3 validator/tests/docs (git revert handles all together).
HF1 (`cartHasItems`) is a separate earlier commit and is NOT affected by reverting UX3.

## Partial rollback options
- **Visual only, keep collision fix**: revert `assets/phase6-commerce.js` hunks (header/count/recs) while keeping the CSS — drawer functions with old copy on the new layout.
- **Cookie z-index only**: restore `.cookie{z-index:330}` in `assets/style.css` (one rule).
- **Scoping only**: the `:not(.cart-drawer-premium)` scoping in `master-upgrade.css` / `cosmoskin-final-uat-fix.css` is inert for non-premium drawers; reverting it re-exposes the premium drawer to the old `align-items:center`/42vh conflicts — never revert it while keeping the UX3 layer.

## Post-rollback checks
```bash
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-hf1-runtime-commerce-hotfix.mjs
node --test tests/local-integration.test.mjs
```
(The 5 UX3 tests and the UX3 validator disappear with a full revert.)

## Data / cache considerations
- No storage schema changes. The count chip reads existing cart state; header copy is JS-generated at runtime.
- CSS/JS are fingerprinted by `?v=` query strings in page HTML; page HTML was not modified in UX3, so existing `?v=` values still point at the changed files. After a later deploy (or rollback deploy), purge CDN cache for:
  `/assets/phase6-commerce.css`, `/assets/phase6-commerce.js`,
  `/assets/master-upgrade.css`, `/assets/cosmoskin-final-uat-fix.css`,
  `/assets/style.css` — or bump their `?v=` values in a follow-up if stale-cache
  symptoms appear (mixed old/new drawer rules would mimic the collision bug).
