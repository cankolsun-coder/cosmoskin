# COSMOSKIN P1C3 Effective Price Fallback Hardening Report

Date: 2026-07-07

## Summary

P1C3 hardens the remaining low-risk effective price fallback gaps after P1C2. The goal is to ensure search, homepage bestsellers, smart routine recommendations, and PDP professional meta/points never permanently display stale static catalog prices after an admin override is applied.

The invariant from P1C2 remains unchanged: checkout, coupons, order creation, and refunds stay server-trusted. P1C3 only improves frontend fallback and refresh behavior.

## P1C2 Unexpected Files Review

Commit `5737e1d` included two files outside the primary storefront display set:

| File | Verdict | Reason |
|---|---|---|
| `functions/api/returns.js` | Valid P1C2 change | Customer return creation now prefers `paid_unit_price` / `paid_line_total` from `order_items` for refund basis, preserving D3A historical safety when current overrides differ. |
| `scripts/validate-b1-bank-transfer-finalization.mjs` | Valid compatibility change | Warns instead of failing when pre-extraction git history is unavailable; no runtime behavior change. |

Neither file introduced unrelated commerce behavior.

## Search Fallback

### Before
- `js/search.js` preferred `COSMOSKIN_PRODUCTS_READY`.
- If that failed, it fetched raw `/products.json` and rendered static catalog prices permanently.
- No rerender on `cosmoskin:products-updated`.

### After
- Raw `/products.json` fallback now also fetches `/api/catalog/effective-prices` with `cache: 'no-store'` and applies `_applyEffectiveOverlay()` before mapping search results.
- Search tracks the active input/results container and rerenders visible results on `cosmoskin:products-updated`.
- Search does not read localStorage price.

## Bestsellers

### Before
- `assets/bestsellers.js` rendered from `COSMOSKIN_PRODUCTS` on first load only.
- Admin override updates did not refresh homepage bestseller cards until full page reload.

### After
- Tracks `currentTab` and rerenders the active bestseller section on `cosmoskin:products-updated`.
- Cards continue to resolve products through `COSMOSKIN_PRODUCT_HELPERS.getProductBySlug()`.

## Smart Routine

### Before
- Routine cards and totals used `COSMOSKIN_PRODUCTS` at build time.
- Add-to-cart reused stored routine product price, which could remain stale after override.

### After
- Added `resolveCatalogPrice()` and `refreshRoutinePricesFromCatalog()`.
- Routine cards rerender on `cosmoskin:products-updated`.
- `collectCartItems()` re-resolves live catalog price at add-to-cart time.

## PDP Professional Fallback

### Before
- `productPrice()` could fall back to static DOM `[data-price]` / `.pdp5-price` when product object lacked price.
- Club points/meta could derive from stale static HTML.

### After
- `catalogPriceForSlug()` prefers `COSMOSKIN_PRODUCT_HELPERS` / `COSMOSKIN_PRODUCTS` before DOM fallback.
- DOM fallback remains only when catalog lookup is unavailable.
- Club points refresh on `cosmoskin:products-updated`.
- Visible PDP price and JSON-LD remain owned by `assets/app.js` `syncPdpState()`.

## Cache Behavior

- `/api/catalog/effective-prices` remains `Cache-Control: no-store, max-age=0`.
- `assets/products-data.js` fetches effective prices with `cache: 'no-store'`.
- Search fallback overlay also uses `cache: 'no-store'`.
- Static `/products.json` may be cached by the browser, but effective overlay still updates visible prices after fetch and on `cosmoskin:products-updated`.

## Files Changed

- `js/search.js`
- `assets/bestsellers.js`
- `assets/js/smart-routine.js`
- `assets/pdp-professional.js`
- `scripts/validate-p1c3-effective-price-fallback-hardening.mjs`
- `tests/local-integration.test.mjs`
- `COSMOSKIN_P1C3_EFFECTIVE_PRICE_FALLBACK_HARDENING_REPORT_20260707.md`
- `COSMOSKIN_P1C3_EFFECTIVE_PRICE_FALLBACK_HARDENING_CHANGED_FILES_20260707.txt`
- `COSMOSKIN_P1C3_EFFECTIVE_PRICE_FALLBACK_HARDENING_RUNBOOK_20260707.md`
- `COSMOSKIN_P1C3_EFFECTIVE_PRICE_FALLBACK_HARDENING_ROLLBACK_PLAN_20260707.md`

## Safety Proofs

- `products.json` was not modified.
- No SQL was run.
- No migration was created.
- Checkout still uses `buildPricedCatalogIndex()` and ignores client-submitted prices.
- Coupon validation still uses trusted effective catalog pricing.
- Refund/history still prefers paid snapshots.
- Inventory blocking unchanged.

## Test Fixture

- Slug: `beauty-of-joseon-relief-sun-spf50`
- Static catalog price: `899 TRY`
- Override fixture: `1099 TRY`

## Validation

- `scripts/validate-p1c3-effective-price-fallback-hardening.mjs`
- Full P1C/P1B/P1A and commerce integrity chain
- `tests/local-integration.test.mjs`

## Deferred

- P1D not started.
- No deploy performed from this batch.
