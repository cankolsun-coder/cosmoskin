# COSMOSKIN P1C3 Effective Price Fallback Hardening Runbook

Date: 2026-07-07

## Preconditions

- P1C2 commit `5737e1d` or later is present.
- `products.json` remains canonical static catalog source.
- No SQL execution required for P1C3.

## Validate

```bash
node scripts/validate-p1c3-effective-price-fallback-hardening.mjs
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1c-effective-price-display-parity.mjs
node scripts/validate-p1c-admin-product-price-editing.mjs
node scripts/validate-p1b-admin-product-price-readonly.mjs
node scripts/validate-p1a-product-price-source-drift.mjs
node --test tests/local-integration.test.mjs
```

## Manual Spot Checks

Fixture:
- Slug: `beauty-of-joseon-relief-sun-spf50`
- Static catalog: `899 TRY`
- Override: `1099 TRY`

1. Apply admin override to `1099 TRY`.
2. Open homepage bestsellers and confirm BOJ card shows `₺1.099`.
3. Open live search, query `joseon`, confirm result price is `₺1.099`.
4. Open smart routine, build a routine containing BOJ sunscreen, confirm card total uses `₺1.099`.
5. Open PDP `/products/beauty-of-joseon-relief-sun-spf50.html` and confirm visible price + JSON-LD offer use `1099`.
6. Add from routine/search/bestseller and confirm checkout server total uses `1099`, regardless of stale client cache.

## API Checks

```bash
curl -sS -D - https://www.cosmoskin.com.tr/api/catalog/effective-prices | head
```

Expected:
- `Cache-Control: no-store, max-age=0`
- BOJ slug price `1099` when override active

## Failure Triage

- Search still shows `899`: confirm `js/search.js` loaded, effective-prices API reachable, and `cosmoskin:products-updated` fires after overlay.
- Bestsellers stale: confirm `assets/bestsellers.js` listener rerenders `currentTab`.
- Smart routine stale cart price: confirm `resolveCatalogPrice()` runs in `collectCartItems()`.
- PDP club points stale: confirm `assets/pdp-professional.js` `catalogPriceForSlug()` resolves before DOM fallback.

## Do Not

- Do not edit `products.json` for admin overrides.
- Do not run SQL for P1C3.
- Do not start P1D from this runbook.
