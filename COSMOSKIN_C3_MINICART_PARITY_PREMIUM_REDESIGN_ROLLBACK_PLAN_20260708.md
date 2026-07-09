# C3 Rollback Plan

## Quick rollback (git)

```bash
git checkout HEAD -- assets/app.js assets/master-upgrade.js assets/phase6-commerce.js assets/phase6-commerce.css cart.html tests/local-integration.test.mjs
rm -f assets/cart-commerce.js scripts/validate-c3-minicart-parity-premium-redesign.mjs
rm -f COSMOSKIN_C3_MINICART_PARITY_PREMIUM_REDESIGN_*.md COSMOSKIN_C3_MINICART_PARITY_PREMIUM_REDESIGN_*.txt
```

If C3 was committed as a single commit:

```bash
git revert <c3-commit-sha>
```

## Partial rollback options

| Goal | Action |
|------|--------|
| Coupon only | Revert `phase6-commerce.js` validateCoupon path; keep UI |
| UI only | Revert `phase6-commerce.css` + drawer markup in `app.js`/`phase6-commerce.js` |
| cart.html recs | Revert `master-upgrade.js` `recsSection` logic |
| Shared totals | Remove `cart-commerce.js` bootstrap; restore local `totals()` in `app.js` / `master-upgrade.js` |

## Risk notes

- Rolling back `cart-commerce.js` without rolling back consumers will break `computeTotals` calls — revert all three consumers together.
- C2 `coupon-client.js` should remain; C3 depends on it but C2 is independently valuable.

## Verification after rollback

```bash
node scripts/validate-c2-cart-checkout-coupon-parity.mjs
node --test tests/local-integration.test.mjs
```
