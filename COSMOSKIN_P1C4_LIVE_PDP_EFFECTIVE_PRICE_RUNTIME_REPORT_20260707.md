# COSMOSKIN P1C4 Live PDP Effective Price Runtime Fix

Date: 2026-07-07

## Summary

P1C4 fixes a remaining production issue where admin override prices (effective prices) were correctly applied across PLP/cart/checkout, but product detail pages (PDP) could still show and submit the stale static catalog price.

This change is **runtime-only** and does not alter `products.json`, does not run SQL, and does not change checkout trust. PDP visible price and PDP add-to-cart metadata are patched from the same server-trusted effective price model used by checkout.

## Root Cause (Live PDP)

The BOJ PDP (`/products/beauty-of-joseon-relief-sun-spf50.html`) ships a static first paint:

- `.pdp5-price` shows `₺899`
- `data-price="899"` on add-to-cart / buy-now / favorite buttons
- JSON-LD Offer `price: "899"`
- sticky mobile bar `<strong>₺899</strong>`

P1C2/P1C3 validators proved the shared catalog overlay and `app.js` patching path, but **did not simulate the live PDP runtime where stale static HTML and button datasets remain visible** if the shared overlay path does not run or is cached/stale.

## Fix

`assets/product-page.js` now performs a dedicated PDP price sync:

- Resolves PDP slug from `main[data-product-slug]` / URL.
- Reads effective price from:
  - `window.COSMOSKIN_PRODUCT_HELPERS.getProductBySlug()` when present, and
  - **always** from `GET /api/catalog/effective-prices` (`cache: 'no-store'`) as a source-of-truth overlay for PDP.
- Patches **all PDP price surfaces**:
  - main `.pdp5-price`
  - sticky bar `.mobile-sticky-pdp__copy strong`
  - button datasets `data-price` for `[data-add-cart]`, `[data-buy-now]`, favorites
  - reviews shell `#reviewsSection[data-product-price]`
  - JSON-LD Product Offer `offers.price` / `offers.priceCurrency`
- Re-applies on `cosmoskin:products-updated` and via short delayed retries to prevent late renderers from restoring stale static price.
- Marks patched nodes with `data-effective-price-applied="true"` / `data-effective-price-applied` in datasets for diagnostics.

## Effective Price API Proof

The endpoint remains server-trusted and non-cacheable:

- `functions/api/catalog/effective-prices.js` returns `prices[slug].effective_price_try`
- `Cache-Control: no-store, max-age=0`

The PDP runtime now consumes the same effective model (static catalog + active overrides) that checkout uses.

## Before / After (BOJ Relief Sun)

- **Before**: PDP visible price can remain `₺899` after an admin override to `1099`.
- **After**: PDP visible price and PDP payload `data-price` are patched to `1099` after the runtime overlay loads. JSON-LD Offer price becomes `1099` when present.

## Cart add from PDP

Even if a stale `data-price="899"` existed in HTML, the runtime patch updates it to `1099` quickly, and checkout still ignores client price and re-resolves server effective price via `buildPricedCatalogIndex()`.

## Cache / Deploy Notes

This fix is resilient to stale static PDP HTML because it re-fetches effective prices at runtime with `cache: 'no-store'`. A hard refresh may still be needed after deploy if a browser holds an old `assets/product-page.js`, but the correct long-term fix is that the current runtime patcher now exists on the PDP JS path.

## Files Changed

- `assets/product-page.js`
- `scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs`
- `tests/local-integration.test.mjs`
- `COSMOSKIN_P1C4_LIVE_PDP_EFFECTIVE_PRICE_RUNTIME_REPORT_20260707.md`
- `COSMOSKIN_P1C4_LIVE_PDP_EFFECTIVE_PRICE_RUNTIME_CHANGED_FILES_20260707.txt`
- `COSMOSKIN_P1C4_LIVE_PDP_EFFECTIVE_PRICE_RUNTIME_RUNBOOK_20260707.md`
- `COSMOSKIN_P1C4_LIVE_PDP_EFFECTIVE_PRICE_RUNTIME_ROLLBACK_PLAN_20260707.md`

## Safety Proofs

- `products.json` unchanged
- No SQL run
- No migration created
- Checkout and coupon trust unchanged
- Inventory blocking unchanged
- Admin auth unchanged

## Tests

- Added a P1C4 runtime-style test that asserts BOJ PDP static HTML starts at `899` and that `assets/product-page.js` contains the effective-price patcher logic.
- Validator `scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs` ensures the real BOJ PDP HTML contains stale price surfaces and that the runtime patcher exists to correct them.

## Manual Smoke Test (Production)

Fixture:
- slug: `beauty-of-joseon-relief-sun-spf50`
- override: `1099 TRY`

Steps:
1. Apply admin override to `1099 TRY`.
2. Open `/products/beauty-of-joseon-relief-sun-spf50.html`.
3. Confirm `.pdp5-price` becomes `₺1.099` after load.
4. Confirm sticky bar `<strong>` becomes `₺1.099`.
5. Confirm add-to-cart button `data-price` is `1099`.
6. Confirm JSON-LD Offer `price` becomes `1099` (view-source vs DOM-inspected after load).
7. Add to cart and verify checkout totals use `1099` (server-trusted).

