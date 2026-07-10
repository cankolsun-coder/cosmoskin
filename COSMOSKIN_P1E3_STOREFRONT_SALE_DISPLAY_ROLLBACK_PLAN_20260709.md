# P1E3 Storefront Sale Display — Rollback Plan (2026-07-09)

## When to roll back
- Sale UI breaks layout on mobile cards or search
- Payable price drift (compare-at in cart/checkout)
- JSON-LD or add-to-cart regression

## Fast rollback (frontend only)
1. Revert P1E3 commit(s) touching:
   - `assets/price-display.js`, `assets/price-display.css`
   - Storefront renderers listed in changed-files manifest
2. Redeploy static assets (Pages)
3. Hard-refresh CDN / verify `products-data.js` no longer injects price-display assets

## Partial rollback
- Keep `products-data.js` sale field merge (harmless) but remove `renderPriceHtml` usage in renderers → plain `fmt(price)` fallback

## Do not roll back
- P1E1 resolver or P1E2 admin editing unless separate incident
- DB migration (not applied in this slice)

## Verification after rollback
```bash
node scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
```
