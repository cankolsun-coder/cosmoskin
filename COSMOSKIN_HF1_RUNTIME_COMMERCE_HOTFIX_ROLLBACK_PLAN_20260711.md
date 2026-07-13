# COSMOSKIN HF1 — Rollback Plan

## Blast radius
Frontend-only. Two runtime files + validator + tests + docs. No SQL, no migrations,
no deploy, no pricing/coupon/checkout/stock-rule/admin logic, products.json untouched.

## Rollback (single commit revert)
```bash
git revert <HF1_COMMIT_HASH>
```
This restores:
- `assets/phase6-commerce.js` without the helper (the ReferenceError regression returns — only do this if HF1 itself causes a worse issue),
- the isntree PDP without `inventory-client.js` (add-to-cart breaks again on that page),
- removes the HF1 validator/tests/docs.

## Partial rollback options
- Only the helper: remove the `function cartHasItems(...)` block from `assets/phase6-commerce.js` (comment-marked `HF1:`). Note the six call sites will throw again.
- Only the PDP: remove the single `<script defer="" src="/assets/inventory-client.js?v=20260616-stockfix"></script>` tag from `products/isntree-hyaluronic-acid-watery-sun-gel.html`.

## Post-rollback checks
```bash
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node --test tests/local-integration.test.mjs
```
(Expect the 3 HF1 tests and the HF1 validator to fail or be absent after a full revert — remove them together with the revert, which `git revert` already does.)

## Data considerations
None. No storage schema, order data, price data, or session data is written or read differently by HF1. The helper only *reads* `localStorage.cosmoskin_cart` (already the cart source of truth).

## Cache note
Script URLs keep their existing `?v=` values except the newly added tag which reuses
`?v=20260616-stockfix`. If a CDN caches the isntree HTML aggressively, purge that single
path after deploy/rollback: `/products/isntree-hyaluronic-acid-watery-sun-gel.html`.
