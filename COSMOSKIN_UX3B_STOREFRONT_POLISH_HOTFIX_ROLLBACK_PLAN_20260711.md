# COSMOSKIN UX3B — Rollback Plan

## Blast radius
Frontend presentation/hydration only: 6 asset files + validator + tests + docs.
No backend (`functions/` untouched), no SQL, no migrations, no deploy, no
pricing/coupon/checkout/stock/admin/refund logic, products.json unchanged.

## Rollback (single commit revert)
```bash
git revert <UX3B_COMMIT_HASH>
```
Consequences of a full revert (only do this if UX3B causes something worse):
- Mini cart X stops working again (unbound injected button).
- PDP stale-price flash returns; add-to-cart usable before hydration.
- Account header shrinks the logo (32px) and grows to 80px again.
- The stray “₺…” label re-appears under the PDP recommendations.
UX3 (`b069ba5`) and HF1 (`faeea67`) are separate commits and unaffected.

## Partial rollback options
- **Close delegation only:** restore the `$$('.close-any').forEach(...)` block in `assets/app.js` — but then the injected drawer X breaks again; if the delegation causes an issue elsewhere, prefer scoping the delegated handler rather than reverting it.
- **Hydration only:** remove the UX3B block in `assets/product-page.css` and the `data-cs-price-hydrating`/`holdPdpPurchaseButtons`/`markPdpPriceReady` calls in `assets/product-page.js` (comment-marked `UX3B`). Keep the `#reviewsSection` exclusion — it is an unconditional bug fix.
- **Header only:** restore the previous values in `assets/account-premium.css` (height 80px, logo 32/40px, gap 12px).
- **Duplicate-price fix:** no reason to ever revert; it only skips markup injection into the reviews shell.

## Failure-mode safety already built in
If the hydration JS breaks in production, prices still appear via the pure-CSS
`csPdpPriceReveal` animation (~2.8s) — rollback is not required to “unhide” prices.

## Post-rollback checks
```bash
node scripts/validate-ux3-minicart-premium-layout-hardening.mjs
node scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs
node --test tests/local-integration.test.mjs
```
(The 5 UX3B tests and the UX3B validator disappear with a full revert.)

## Cache note
Page HTML `?v=` fingerprints were not bumped (consistent with HF1/UX3). If
stale-cache symptoms appear after a later deploy, purge these paths:
`/assets/app.js`, `/assets/phase6-commerce.js`, `/assets/phase6-commerce.css`,
`/assets/product-page.js`, `/assets/product-page.css`,
`/assets/account-premium.css`.
