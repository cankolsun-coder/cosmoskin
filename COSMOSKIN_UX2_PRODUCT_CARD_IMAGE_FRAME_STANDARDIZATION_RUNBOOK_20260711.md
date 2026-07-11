# UX2 Runbook — Product Card Image Frame Standardization (2026-07-11)

## Pre-check
```bash
git status --short
git log --oneline -8
git diff -- products.json
```

## Validators
```bash
node scripts/validate-ux2-product-card-image-frame-standardization.mjs
node scripts/validate-p1e3-storefront-sale-display.mjs
node scripts/validate-p1e4-checkout-coupon-sale-snapshot-hardening.mjs
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## Visual QA (local static server)
```bash
python3 -m http.server 7700 --directory .
```

Check at 360 / 390 / 768 / 1280:
- `/collections/cosrx.html` — tall bottle + square products same row height
- `/` homepage bestsellers + product grids
- `/allproducts.html` — catalog cards
- `/search.html?q=snail` — search rows
- Mini cart drawer recommendations
- PDP related products
- Sale-priced product card: sale + compare-at row does not overflow

## Do not
- Deploy from this runbook unless explicitly requested
- Run SQL or modify products.json
