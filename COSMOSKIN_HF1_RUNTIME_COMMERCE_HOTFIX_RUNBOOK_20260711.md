# COSMOSKIN HF1 — Runtime Commerce Hotfix Runbook

## What HF1 does
1. Restores `cartHasItems()` in `assets/phase6-commerce.js` (C3 regression) → mini-cart coupon box, recommendations and empty-state gating work again; zero console errors.
2. Adds `inventory-client.js` to `products/isntree-hyaluronic-acid-watery-sun-gel.html` → add-to-cart works on that PDP.

## Verify locally (2 minutes)
```bash
python3 -m http.server 7710      # repo root; /api/* 404s are expected locally
```
1. Open `http://127.0.0.1:7710/index.html`, DevTools console.
2. Add 2 products to the cart, open the cart drawer.
   - Expect: **no** `cartHasItems` ReferenceError (watch ≥5 s to cover remount ticks).
   - Expect: "İndirim Kodu" coupon box and "Rutini tamamlayan öneriler" visible in the drawer.
3. Open `/products/isntree-hyaluronic-acid-watery-sun-gel.html`:
   - `typeof window.COSMOSKIN_STOCK` → `"object"`.
   - View source: `inventory-client.js?v=20260616-stockfix` present after `mobile-redesign.js`.
   - (Local add-to-cart still shows the service-unavailable guard because `/api/inventory` 404s on a static server — that is pre-existing I2 policy, identical to every other PDP. Full add flow needs wrangler or production.)

## Verify with API (wrangler)
```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```
On the isntree PDP, "Sepete Ekle" must add the item (stock permitting) with no console errors.

## Automated checks
```bash
node scripts/validate-hf1-runtime-commerce-hotfix.mjs
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-p1e3-storefront-sale-display.mjs
node scripts/validate-p1e4-checkout-coupon-sale-snapshot-hardening.mjs   # slow (runs integration suite)
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs                              # expect 222 pass / 0 fail
```

## Post-deploy production smoke (when a deploy is later approved — HF1 itself does NOT deploy)
1. `https://www.cosmoskin.com.tr` → add 2 items → open drawer → coupon box visible, console clean.
2. Apply `WELCOME10` in the drawer → discount row appears; remove → cleared.
3. Isntree PDP → add to cart succeeds; quantity stepper respects available stock.
4. Checkout totals unchanged vs pre-HF1 (no pricing paths touched).

## Escalation
If the drawer coupon box appears but coupon validation errors, that is the shared
`cart-commerce.js`/`coupons/validate` path (NOT HF1) — check `/api/coupons/validate` logs.
If add-to-cart fails on isntree with "Stok servisine şu anda ulaşılamıyor", check `/api/inventory`
availability (service-side), not the page.
