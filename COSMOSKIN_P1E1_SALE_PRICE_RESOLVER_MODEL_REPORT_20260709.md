## COSMOSKIN — P1E1 Sale Price Resolver Model Report (2026-07-09)

### Scope
- Added **DB schema fields (migration file only; not run)** for sale/compare-at.
- Extended **server pricing resolver model** to compute sale-effective payable price safely.
- Extended `/api/catalog/effective-prices` payload with sale fields (backward-compatible).
- **Did not** build admin UI editing (P1E2) or storefront crossed-out UI.
- **Did not** deploy or run SQL.

---

## 1) Migration summary
Created `supabase/migrations/20260709_p1e_sale_compare_at_price.sql` (idempotent):
- Extends `public.product_price_overrides` with nullable:
  - `sale_price_try`, `compare_at_price_try`, `sale_starts_at`, `sale_ends_at`
- Extends `public.product_price_audit_logs` with nullable old/new sale fields + window fields.
- Adds safe constraints:
  - positive integer checks
  - sale window ordering
  - sale < regular
  - compare-at > sale

No data mutation statements exist; no other tables touched.

---

## 2) Resolver behavior (model)
File: `functions/api/_lib/product-pricing.js`

New output fields:
- `regular_price_try`
- `sale_price_try`
- `compare_at_price_try`
- `sale_starts_at`, `sale_ends_at`
- `sale_active`
- `price_display_mode`
- (existing) `base_catalog_price_try`, `effective_price_try`, `effective_price_source`

| Scenario | effective_price_try | effective_price_source | sale_active | price_display_mode |
|---|---:|---|---|---|
| No override | catalog | `static_catalog` | false | `regular` |
| Regular override only | override regular | `admin_override` | false | `regular` |
| Active valid sale | sale | `admin_sale` | true | `sale` |
| Future sale | regular | `admin_override`/`static_catalog` | false | `scheduled_sale` |
| Expired sale | regular | `admin_override`/`static_catalog` | false | `expired_sale` |
| Invalid sale data | regular | `admin_override`/`static_catalog` | false | `regular` (fail-closed) |

Important invariants:
- `compare_at_price_try` is **display-only** and is never assigned to `effective_price_try`.
- Invalid/scheduled/expired sale never affects checkout payable price.

---

## 3) Missing-column fallback behavior (pre-migration safety)
`loadPriceOverrideRows()` now attempts a wider select including sale columns, **but retries with the legacy select** when PostgREST reports missing sale columns.

This prevents breaking:
- PDP/PLP/search surfaces relying on effective prices
- mini cart/cart/checkout
- coupon validation
- admin products list

---

## 4) Effective prices API payload
Endpoint: `functions/api/catalog/effective-prices.js`
- Adds fields:
  - `regular_price_try`, `sale_price_try`, `compare_at_price_try`
  - `sale_active`, `sale_starts_at`, `sale_ends_at`
  - `price_display_mode`
- Keeps existing fields untouched.
- Still publishes payable `effective_price_try` as before.

---

## 5) Checkout/coupon safety notes
- Checkout (`functions/api/create-checkout.js`) and coupon validate (`functions/api/coupons/validate.js`) consume **trusted server catalog** from `buildPricedCatalogIndex()` and use `product.price`.
- Resolver sets `product.price` to payable **effective** (sale when active).
- Compare-at is not used in totals, VAT, checkout, or coupons.

---

## 6) Proof / guardrails
- `products.json` unchanged.
- No SQL run.
- No deploy done.
- No P1E2 admin UI work started.

---

## 7) Tests & validators
- Added P1E1 resolver tests and missing-column fallback test to `tests/local-integration.test.mjs`.
- Added validator: `scripts/validate-p1e1-sale-price-resolver-model.mjs`.

