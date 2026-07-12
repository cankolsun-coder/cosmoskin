# COSMOSKIN UX3 — Mini Cart Premium Layout Hardening Runbook

## What UX3 does
Consolidates six competing drawer CSS layers into one premium layer, fixes the
2+/3+ item row-collision (78px row lock / 31dvh trap), redesigns the drawer head
(“Sepetin” + count chip + responsive subtitle), refines rows/coupon/summary/CTA,
replaces the arrow rec-carousel with one compact card, and drops the cookie
banner below the drawer. Commerce logic untouched.

## Verify locally (3 minutes)
```bash
python3 -m http.server 7710      # repo root; /api/* 404s are expected locally
```
1. Open `http://127.0.0.1:7710/index.html`, add 3 products (or seed below), click the cart icon:
```js
const P = window.COSMOSKIN_PRODUCTS;
localStorage.setItem('cosmoskin_cart', JSON.stringify(P.slice(0,3).map((p,i)=>({id:p.slug,slug:p.slug,name:p.name,brand:p.brand,price:p.price,image:p.image,url:p.url,qty:i?1:2}))));
location.reload();
```
2. Expect: distinct item cards with no overlapping text; head shows **Sepetin** + “4 ürün” chip; coupon box (“İNDİRİM KODU”) and one “Rutini tamamlayan öneriler” card visible; black **ÖDEMEYE GEÇ** pill + **Sepeti Düzenle**; console clean.
3. DevTools mobile presets 360 / 390 / 430 / 768: bottom sheet with top radius, compact subtitle (“Ürünlerini kontrol et ve güvenle devam et.”), no horizontal scroll, no CTA overlap, cookie banner behind the sheet.
4. Row measurement (must be content-driven, not 78):
```js
[...document.querySelectorAll('#cartItems .cart-item')].map(e=>e.getBoundingClientRect().height)
```

## Automated checks
```bash
node scripts/validate-ux3-minicart-premium-layout-hardening.mjs
node scripts/validate-hf1-runtime-commerce-hotfix.mjs
node scripts/validate-ux2-product-card-image-frame-standardization.mjs
node scripts/validate-p1e3-storefront-sale-display.mjs
node scripts/validate-p1e4-checkout-coupon-sale-snapshot-hardening.mjs   # slow (runs suite)
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs                              # expect 227 pass / 0 fail
```

## Post-deploy production smoke (when a deploy is later approved — UX3 does NOT deploy)
1. Add 2–3 items → open drawer → rows don't collide, coupon box + rec card visible, console clean.
2. Apply `WELCOME10` → success state; remove → cleared (same server-validated flow as before).
3. A product with an active sale: drawer row shows payable price strong + compare-at muted line-through, no overflow at 360px.
4. Mobile Safari: bottom sheet respects the home-indicator safe area; cookie banner does not cover the sheet.
5. Qty +/− and Kaldır work; totals update; checkout receives the same cart (no commerce change expected).

## Escalation
- Rows colliding again → someone re-introduced a fixed/min height or `align-items:center` drawer layer; `validate-ux3-*` pinpoints the rule.
- Coupon box missing → `cartHasItems` regression; run `validate-hf1-*`.
- Drawer unstyled (plain “Sepet” 38px head) → phase6-commerce.js not loading on that page.
