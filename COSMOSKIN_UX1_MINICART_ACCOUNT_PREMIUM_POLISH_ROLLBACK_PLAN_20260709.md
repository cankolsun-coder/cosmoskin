## COSMOSKIN — UX1 Rollback Plan (2026-07-09)

### What changed
- CSS-only polish for mini cart premium drawer + account overview (scoped rules)
- UX1 validator + two UX1 tests

### Rollback steps
- Revert these files to the previous commit:
  - `assets/phase6-commerce.css`
  - `tests/local-integration.test.mjs`
  - `scripts/validate-ux1-minicart-account-premium-polish.mjs`
  - `COSMOSKIN_UX1_MINICART_ACCOUNT_PREMIUM_POLISH_*.md|txt`

### Verification after rollback
- Run:

```bash
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node --test tests/local-integration.test.mjs
```

### Expected outcome
- Mini cart/account revert to prior visual state.
- Commerce logic remains unaffected either way (UX1 is CSS-only).

