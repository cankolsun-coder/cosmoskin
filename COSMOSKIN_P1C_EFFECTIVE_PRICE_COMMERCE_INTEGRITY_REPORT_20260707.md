# COSMOSKIN P1C2 Effective Price Commerce Integrity Report

Date: 2026-07-07

## Summary

P1C2 closes the production-safety gap where admin price overrides could update checkout/admin surfaces while the PDP continued to display and add the static catalog price. The invariant is now:

For a given `product_slug`, current customer-facing and order-facing prices must match the trusted effective price model across PDP, PLP/card, search, favorites, cart, checkout, coupon subtotal, free-shipping subtotal, Iyzico basket, `order_items`, and D3A paid snapshots. Historical orders remain immutable and keep the price paid at order time.

## PDP Root Cause

The observed Beauty of Joseon sunscreen issue came from the pre-rendered PDP using static HTML:

- Main PDP price rendered as `₺899`.
- `data-price="899"` was embedded on add-to-cart, buy-now, and favorite buttons.
- `assets/product-page.js` built buy-now cart items directly from button datasets.
- `assets/app.js` had product binding refresh logic, but it targeted older PDP selectors (`.pdp-price`, `.pdp-actions`) and missed current PDP5 selectors (`.pdp5-price`, `.pdp5-actions`).

The exact product slug used in tests is `beauty-of-joseon-relief-sun-spf50`. The override fixture is `1099 TRY`.

## Price Surfaces Audited

- `assets/products-data.js`: Shared frontend product source. Now fetches `/api/catalog/effective-prices` with `cache: 'no-store'`, merges effective fields, and exposes `price`, `price_try`, `effective_price_try`, `effective_currency`, `effective_price_source`, `base_catalog_price_try`, `has_price_override`, `price_override_valid`, and `price_warning`.
- `products/*.html` PDP pages: Static first paint may contain catalog prices, but PDP5 DOM, buttons, favorites, sticky price, and JSON-LD offer are refreshed from the shared effective product helper after product data updates.
- `assets/product-page.js`: Buy-now now resolves via `COSMOSKIN_PRODUCT_HELPERS.getProductByHandle()` before adding to cart.
- `assets/app.js`: Product cards, PDP5, cart buttons, favorite payloads, cart drawer, checkout summary, and localStorage cart refresh use the shared effective product lookup.
- `js/search.js`: Waits for `COSMOSKIN_PRODUCTS_READY`; search prices come from the merged product list.
- `assets/collection-renderer.js`: Renders PLP/collection cards from `COSMOSKIN_PRODUCTS` and rerenders on `cosmoskin:products-updated`.
- `assets/allproducts.js`: Uses `COSMOSKIN_PRODUCTS_READY`; price filters and cards use effective `product.price`.
- `favorites.html` and account favorite flows: Favorite entries are canonicalized through `app.js`/product helpers when loaded and when product updates fire.
- `assets/mobile-redesign.js`: Mobile PDP/cards/cart now prefer effective product lookup price over stored local cart price.
- `assets/checkout-flow.js`: Checkout UI normalization prefers effective product lookup price over stored local cart price and rerenders on product updates.
- `functions/api/create-checkout.js`: Server checkout uses `buildPricedCatalogIndex()` and ignores client-submitted price/line-total fields.
- `functions/api/coupons/validate.js` and `functions/api/_lib/coupons.js`: Coupon subtotal, eligible subtotal, exclusions, and allocation use trusted effective cart lines.
- Admin order/customer order/refund displays: Continue to use stored `order_items`/paid snapshots, not current overrides.

## Commerce Integrity

- Checkout resolves effective prices server-side from static catalog plus active `product_price_overrides`.
- Client/localStorage prices are treated as display cache only.
- Iyzico basket item prices are built from D3A paid line snapshots after discount allocation.
- `order_items.unit_price` and `line_total` are written from the server effective price at order creation.
- `paid_unit_price` and `paid_line_total` are immutable paid snapshots after coupon allocation.
- Payment callback amount checks and finalization continue to use persisted order/payment data.

## KDV Behavior

COSMOSKIN continues to use global gross KDV-inclusive prices. P1C2 treats `effective_price_try` as KDV dahil gross unit price.

Formula used by checkout:

- `gross = effective_price_try`
- `net = gross / 1.20`
- `vat = gross - net`

The project’s current checkout rounding helper rounds money to two decimals. The P1C2 1099 TRY test asserts deterministic gross-inclusive KDV calculation.

## Stock And Inventory

Price overrides do not affect inventory identity or quantity logic.

- Stock validation uses `product_slug` and `quantity`.
- Reservation/decrement/release RPC payloads use slug/quantity, not client price.
- Out-of-stock blocking remains enforced before reservation/order creation.
- Admin inventory update rejects price fields.
- Admin price update does not accept stock fields.

## Refund And Historical Safety

P1C2 fixed customer return request creation to prefer `paid_unit_price` and `paid_line_total` from `order_items` when available. Admin refund logic already uses paid snapshots and falls back only for legacy orders without snapshots.

Current price changes do not mutate old orders, refund caps, order history, admin order details, customer order details, or invoice/order display data.

## Admin Price Editing Integrity

P1C admin editing remains permissioned and audited:

- `products:pricing:update` is required.
- `products:read` and `inventory:adjust` do not grant price editing.
- Inventory routes reject price fields.
- Price route returns `PRICE_AUDIT_FAILED` and fails closed if audit insert fails.
- `products.json` is not modified.
- `product_price_overrides` remains the runtime override source.

## Cache Behavior

- `/api/catalog/effective-prices` returns `Cache-Control: no-store, max-age=0`.
- Frontend fetches effective prices with `cache: 'no-store'`.
- Admin price update returns updated effective pricing immediately.
- PDP rerenders on `cosmoskin:products-updated`, so browser-cached static HTML does not remain authoritative after product data loads.

## Proof

- P1C is committed at `d4753a7`.
- P1C migration/deployment status cannot be proven from local git state. No SQL was run in this implementation.
- No deployment was run.
- No new migration was created for P1C2.
- `products.json` was not changed.
- `.wrangler/` remains the only unrelated untracked directory.

## Validation Results

Passed:

- `node scripts/validate-p1c-effective-price-commerce-integrity.mjs`
- `node scripts/validate-p1c-effective-price-display-parity.mjs`
- `node scripts/validate-p1c-admin-product-price-editing.mjs`
- `node scripts/validate-p1b-admin-product-price-readonly.mjs`
- `node scripts/validate-p1a-product-price-source-drift.mjs`
- `node scripts/validate-production-launch-readiness.mjs`
- `node scripts/validate-i1-inventory-checkout-blocking.mjs`
- `node scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs`
- `node scripts/validate-c1b-coupon-exclusions-metadata.mjs`
- `node scripts/validate-c1-coupon-eligibility-hardening.mjs`
- `node scripts/validate-d3-refund-snapshot-persistence.mjs`
- `node scripts/validate-d2b-refund-discount-proration.mjs`
- `node scripts/validate-d2-refund-amount-correctness.mjs`
- `node --test tests/local-integration.test.mjs` (`169/169` passing)

Known warning: `validate-p1a-product-price-source-drift.mjs` still reports the existing fallback updated-stamp mismatch in `assets/products-data.js`; prices remain aligned and runtime fetch mitigates stale fallback.
