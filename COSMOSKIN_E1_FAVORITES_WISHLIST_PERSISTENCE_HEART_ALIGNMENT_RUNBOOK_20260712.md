# COSMOSKIN E1 Runbook — Favorites / Wishlist

## Pre-check

```bash
git status --short
git log --oneline -5
git diff -- products.json
```

Expect: clean tree (except `.wrangler/`), UX4 committed, `products.json` clean.

## Validate

```bash
node scripts/validate-e1-favorites-wishlist-persistence-heart-alignment.mjs
node scripts/validate-ux4-account-profile-preferences-premium-consent.mjs
node scripts/validate-ux3b-storefront-polish-hotfix.mjs
node scripts/validate-ux3-minicart-premium-layout-hardening.mjs
node scripts/validate-ux2-product-card-image-frame-standardization.mjs
node scripts/validate-p1e3-storefront-sale-display.mjs
node --test tests/local-integration.test.mjs --test-name-pattern="E1:"
```

Long-timeout deploy gate (optional):

```bash
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-p1e4-checkout-coupon-sale-snapshot-hardening.mjs
```

## DB verify (read-only)

Run queries in `COSMOSKIN_E1_FAVORITES_WISHLIST_DB_VERIFICATION_QUERIES_20260712.sql` in Supabase SQL editor.

## Manual QA

1. Guest: add favorite on category page → refresh → heart stays active
2. Guest: remove favorite → refresh → stays removed
3. Logged-in: add → refresh → persists
4. Logged-in: remove → refresh → does not return
5. Account → Favorilerim tab matches storefront hearts
6. `/favorites.html` empty + filled states
7. Heart click does not open PDP
8. Mobile 360/390: icon centered, no overflow

## Deploy note

E1 does not require deploy from this batch. When deploying later, ensure `assets/favorites-store.js` is published and cached HTML references updated `app.js` query string.
