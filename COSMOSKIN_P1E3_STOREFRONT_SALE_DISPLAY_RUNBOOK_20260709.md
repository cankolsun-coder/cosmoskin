# P1E3 Storefront Sale Display — Runbook (2026-07-09)

## Preconditions
- P1E1 and P1E2 committed
- No `products.json` edits in this slice

## Verify locally
```bash
node scripts/validate-p1e3-storefront-sale-display.mjs
node scripts/validate-p1e2-admin-sale-price-editing.mjs
node scripts/validate-p1e1-sale-price-resolver-model.mjs
node scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs
node scripts/validate-p1c3-effective-price-fallback-hardening.mjs
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1d-admin-price-audit-history.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-c2-cart-checkout-coupon-parity.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## Static preview
```bash
python3 -m http.server 7700 --directory .
```
Open a PDP and category page; confirm sale rows show current + strikethrough + badge when admin sale is active (requires wrangler + DB for live effective-prices).

## Full commerce preview
```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```

## Manual checks
- PDP main + sticky prices show sale HTML when `price_display_mode=sale`
- Add-to-cart `data-price` equals effective payable price
- JSON-LD `offers.price` equals effective payable price
- Mini cart / cart.html line totals unchanged (payable × qty)
- Checkout summary total unchanged; optional “İndirimli fiyat” note only
