# COSMOSKIN P1C4 Live PDP Effective Price Runtime Fix — Runbook

Date: 2026-07-07

## Scope

P1C4 ensures PDP visible price and PDP add-to-cart metadata are patched from the effective price model used by checkout, even when static PDP HTML first paint is stale.

No SQL. No migrations. No deploy from Cursor.

## Validate locally

```bash
node scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs
node scripts/validate-p1c3-effective-price-fallback-hardening.mjs
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1c-effective-price-display-parity.mjs
node scripts/validate-p1c-admin-product-price-editing.mjs
node scripts/validate-p1b-admin-product-price-readonly.mjs
node scripts/validate-p1a-product-price-source-drift.mjs
node --test tests/local-integration.test.mjs
```

## Production smoke test (after deployment elsewhere)

Fixture:
- slug: `beauty-of-joseon-relief-sun-spf50`
- override: `1099 TRY`

1. Set admin override to `1099 TRY`.
2. Open `/products/beauty-of-joseon-relief-sun-spf50.html`.
3. Confirm:
   - `.pdp5-price` becomes `₺1.099` after load
   - sticky `.mobile-sticky-pdp__copy strong` becomes `₺1.099`
   - add-to-cart button `data-price="1099"`
   - `#reviewsSection[data-product-price="1099"]`
   - JSON-LD Offer price becomes `1099` (DOM-inspect after load)
4. Add to cart and proceed to checkout; confirm server totals reflect `1099` (checkout remains authoritative).

## Debug tips

- If PDP remains `899`:
  - Confirm the page is loading the latest `assets/product-page.js`.
  - Confirm `/api/catalog/effective-prices` returns `prices['beauty-of-joseon-relief-sun-spf50'].effective_price_try = 1099`.
  - Hard refresh once to eliminate a stale browser cache of `assets/product-page.js`.

