## COSMOSKIN — UX1 Runbook (2026-07-09)

### Goal
Premium polish for mini cart drawer + account overview, **CSS-only**, with commerce integrity untouched.

### Local validation commands

```bash
node scripts/validate-ux1-minicart-account-premium-polish.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-c2-cart-checkout-coupon-parity.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

### Manual QA checklist (quick)
- Mini cart drawer
  - Premium thumbnail looks **neutral/ivory**, not beige block
  - Product title clamps to 2 lines, no overflow
  - Coupon success/error is readable but not noisy
  - Summary footer looks premium; primary CTA clearly black
- Account overview
  - Stat grid doesn’t overflow at narrow widths
  - Quick access tiles clamp text; no awkward stacking

### Notes
- No deploy steps included (out of scope).
- No SQL / migrations (out of scope).

