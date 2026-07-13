# COSMOSKIN UX3B — Storefront Polish Hotfix Runbook

## What UX3B does
1. Mini cart close X works again (delegated handler) and is a premium SVG circle button.
2. PDP prices are skeletoned until the admin effective price is applied — no stale price flash; add-to-cart held during hydration; safe fallback + CSS failsafe.
3. Account header matches the homepage header (74px / 46px logo / 22px gap).
4. The stray duplicate price under “Bu ürünle uyumlu öneriler” (injected into `#reviewsSection`) is gone.

## Verify locally (4 minutes)
```bash
python3 -m http.server 7710      # repo root; /api/* 404s are expected locally
```
1. **Close X:** add an item, open the drawer, click the circular X → drawer closes. Repeat via overlay click and Escape. Check at 1280 and 390 widths.
2. **Price hydration:** open any PDP with DevTools → Network “Slow 3G”. The price area shows a soft shimmer, never the old number as plain text; within ~2.5s the price appears (static fallback locally since `/api/*` 404s). `document.documentElement.dataset` shows `csPdpPriceReady: "true"` and a `csPdpPriceSource`.
3. **Add-to-cart guard:** on a throttled load, “Sepete Ekle” is briefly disabled with `data-price-waiting`, then enabled.
4. **Account header:** compare `/index.html` and `/account/profile.html` — same header height and C+S logo size:
```js
[document.querySelector('.header').getBoundingClientRect().height, document.querySelector('.header .brand-logo').getBoundingClientRect().width]
// expect ~[74, 46] on BOTH pages
```
5. **Duplicate price:** on a PDP, wait 3s (past the 450/1600ms retry passes), then:
```js
[...document.getElementById('reviewsSection').querySelectorAll('.cs-price')].filter(n => !n.closest('.pdp5-review-card'))
// expect []
```

## With the live API (wrangler) or production
- PDP with an admin price override: page loads with skeleton → final effective price appears; the old static price is never readable; JSON-LD offers.price equals the effective payable price.
- If `/api/catalog/effective-prices` fails: the static price appears within 2.5s (documented fallback; checkout reprices server-side regardless).

## Automated checks
```bash
node scripts/validate-ux3b-storefront-polish-hotfix.mjs
node scripts/validate-ux3-minicart-premium-layout-hardening.mjs
node scripts/validate-hf1-runtime-commerce-hotfix.mjs
node scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs
node scripts/validate-p1e3-storefront-sale-display.mjs
node scripts/validate-p1e4-checkout-coupon-sale-snapshot-hardening.mjs   # slow (runs suite)
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs                              # expect 232 pass / 0 fail
```
Note: run p1e4 and the test suite sequentially, never concurrently — parallel suite runs can flake p1e4's nested validator spawns (observed during UX3).

## Post-deploy production smoke (when a deploy is later approved — UX3B does NOT deploy)
1. Drawer X / overlay / Escape close on desktop + iPhone Safari.
2. A PDP whose price was changed in admin: no old-price flash on hard reload (throttle to verify).
3. `/account/profile.html` header visually identical to home (logo size, height, spacing) with no shift during hydration.
4. PDP scroll past “Bu ürünle uyumlu öneriler”: no stray “₺…” label between recommendations and reviews.
5. Console clean on home/PDP/account.

## Escalation
- X dead again → something restored the per-node `.close-any` binding; `validate-ux3b-*` catches it.
- Price stuck as skeleton > 3s → `markPdpPriceReady` not firing AND the CSS failsafe missing; check product-page.js/css pair (validator covers both).
- Duplicate ₺ label back → `[data-product-price]` selector regained access to `#reviewsSection`.
