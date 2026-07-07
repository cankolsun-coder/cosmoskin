# COSMOSKIN P1C — Admin Product Price Editing Report

Date: 2026-07-07  
Scope: P1C only (first admin price editing; no P1D)

## Persistence model decision

**Chosen:** `product_price_overrides` + `product_price_audit_logs` keyed by `product_slug`.

**Why not `products.price_try` alone:**
- Supabase `products` table exists with `price_try` but is **not** the runtime catalog source today (static `products.json` chain is).
- `products` rows are not guaranteed 1:1 with the live static catalog slug set.
- Override layer keeps static catalog canonical for drift guard (P1A) while allowing DB-backed admin edits without writing `products.json` at runtime.

**Audit decision:** Price update **fails closed** if `product_price_audit_logs` insert fails after override upsert (production-safe).

## Migration (created, not run from Cursor)

`supabase/migrations/20260707_p1c_admin_product_price_editing.sql`

- `product_price_overrides` with unique `product_slug`, `regular_price_try > 0`, `currency IN ('TRY')`
- `product_price_audit_logs` insert-only audit trail
- Seeds `products:pricing:update` permission (owner already has `*`)
- RLS enabled, no public policies (service-role Workers access only)
- Does not modify existing prices, orders, refunds, coupons, inventory, reviews, or admin auth

## Price resolver

`functions/api/_lib/product-pricing.js`

1. Base price from static server catalog (`catalog.js` / `products-data.js`)
2. Active override from `product_price_overrides` by slug
3. Override wins when valid; else static catalog
4. Invalid override → warning metadata; checkout fails closed if no valid effective price
5. Never trusts client-submitted price

Metadata exposed: `effective_price_try`, `effective_currency`, `effective_price_source` (`static_catalog` | `admin_override`), `base_catalog_price_try`, `has_price_override`, `price_override_valid`, `price_warning`.

## Admin API

### GET `/api/admin/products` (unchanged permission: `products:read`)

Returns effective + catalog fields and `permissions.can_edit_price`.

### PATCH `/api/admin/products/:slug/price` (new)

- Permission: `products:pricing:update`
- Validates integer TRY > 0, supported currency, catalog slug must exist
- Upserts `product_price_overrides`
- Writes `product_price_audit_logs`
- Returns updated effective pricing

### PATCH/POST `/api/admin/products` (inventory)

- Still `inventory:adjust` only
- Rejects any price fields with 400

## Admin UI

- Shows effective price with source badge (`Katalog` / `Admin override`)
- Base catalog price when override exists
- **Fiyatı güncelle** button + price/reason inputs only when `permissions.can_edit_price`
- Inventory save remains separate (no price in payload)
- Orphan inventory rows: blocked with *"Bu ürün katalogda bulunmadığı için fiyat düzenlenemez."*

## Storefront strategy (Option A — included in P1C)

`/api/catalog/effective-prices` public read endpoint + `assets/products-data.js` overlay after `/products.json` fetch.

**No display/checkout mismatch:** storefront PLP/PDP/cart and checkout/coupons all use effective server price.

## Checkout trust proof

- `create-checkout.js` uses `buildPricedCatalogIndex()` before cart normalization
- Ignores `rawItem.price`
- Iyzico basket + D3A snapshots use trusted `product.price` (effective)

## Coupon trust proof

- `coupons/validate.js` uses `buildPricedCatalogIndex()` for `buildTrustedCartLines()`
- Subtotal/eligibility uses effective trusted prices

## Refund/history safety

- No changes to refund calculators or `order-pricing-snapshot.js`
- Refunds continue using persisted `paid_unit_price` / `paid_line_total` snapshots

## Inventory safety

- `inventory.js` unchanged
- Stock PATCH does not accept price
- `validateCartStock` unchanged

## Permission model

| Permission | Capability |
|------------|------------|
| `products:read` | View prices |
| `inventory:adjust` | Stock/SKU only |
| `products:pricing:update` | Edit price via `/price` endpoint |

## Validation rules (server)

Rejected with Turkish messages:
- missing/null/NaN/non-numeric/zero/decimal TRY
- unsupported currency
- unknown catalog slug
- missing `products:pricing:update` → 403

## Proof `products.json` not modified

No edits to `products.json` or `functions/api/_lib/products-data.js`.

## Proof no SQL run from Cursor

Migration file created only; not applied.

## Test results (2026-07-07)

| Check | Result |
|-------|--------|
| `validate-p1c-admin-product-price-editing.mjs` | PASS |
| `validate-p1b-admin-product-price-readonly.mjs` | PASS |
| `validate-p1a-product-price-source-drift.mjs` | PASS |
| Production launch + I1 + C1/C1B/C1B2 + D3/D2B/D2 | PASS |
| Integration tests | **166/166 PASS** |

## Deployment order

1. Apply migration `20260707_p1c_admin_product_price_editing.sql` in Supabase
2. Deploy Cloudflare Pages (API + static assets)
3. Verify admin price edit + storefront effective price + checkout charge alignment
4. Run P1C validator chain in CI

## Rollback

See `COSMOSKIN_P1C_ADMIN_PRODUCT_PRICE_EDITING_ROLLBACK_PLAN_20260707.md`.

## Deferred

- P1D
- Sale/compare-at pricing
- Supabase `products.price_try` runtime wiring
- Deploy (not done in P1C)
