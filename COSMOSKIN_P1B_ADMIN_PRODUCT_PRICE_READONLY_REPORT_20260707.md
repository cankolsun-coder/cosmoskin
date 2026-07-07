# COSMOSKIN P1B — Admin Product Price Read-Only Visibility Report

Date: 2026-07-07  
Scope: P1B only (read-only admin visibility; no price editing, no P1C)

## Executive summary

P1B adds trusted catalog price visibility to the admin products list. Prices are read from the server-side catalog (`products.json` → `functions/api/_lib/products-data.js` → `catalog.js`) and displayed read-only in the admin UI. No product prices, checkout, coupons, refunds, inventory logic, or admin auth were changed.

## Task 1 — Current admin product flow

### 1. Which admin endpoint returns product rows?

**`GET /api/admin/products`** (`functions/api/admin/products.js` → `onRequestGet`)

### 2. Does it currently include catalog product data?

**Before P1B:** Yes — merged `catalog` product fields with `product_inventory` rows, but without explicit read-only price metadata.

**After P1B:** Yes — enriched with `catalog_price_*` read-only fields from trusted server catalog.

### 3. Does it currently include price?

**Before P1B:** Implicit `price` field from catalog spread (`...p`) but not surfaced in admin UI.

**After P1B:** Explicit `catalog_price`, `catalog_price_try`, `catalog_currency`, `catalog_price_source`, `catalog_updated_label`, plus warnings when missing/invalid.

### 4. Does it use product slug to map inventory to catalog?

**Yes.** `product_inventory.product_slug` maps to `catalogProducts[].slug`. Orphan inventory rows (no catalog match) are now included with a missing-price warning.

### 5. Which permission protects the endpoint?

- **GET:** `products:read`
- **PATCH/POST (inventory only):** `inventory:adjust` (unchanged)

## Admin API behavior

### Before

```json
{
  "slug": "anua-heartleaf-77-soothing-toner",
  "name": "...",
  "price": 849,
  "inventory": { "stock_on_hand": 4, ... }
}
```

Price existed in payload but was not labeled, validated, or shown in admin UI.

### After

```json
{
  "slug": "anua-heartleaf-77-soothing-toner",
  "catalog_slug": "anua-heartleaf-77-soothing-toner",
  "catalog_title": "Heartleaf 77% Soothing Toner",
  "catalog_price": 849,
  "catalog_price_try": 849,
  "catalog_currency": "TRY",
  "catalog_price_source": "products.json",
  "catalog_updated_label": "2026-05-11-phase3",
  "catalog_price_valid": true,
  "catalog_price_warning": null,
  "inventory": { ... }
}
```

Orphan inventory example:

```json
{
  "slug": "orphan-inventory-only-slug",
  "catalog_price_try": null,
  "catalog_price_warning": "Bu ürün için katalog fiyatı bulunamadı."
}
```

## Admin UI behavior

### Before

Table columns: Ürün, Marka, Stok, Durum, SKU, Aksiyon. No price column.

### After

Added **Katalog Fiyatı** column showing:

- TRY formatted price (e.g. `₺849`)
- Label “Katalog Fiyatı”
- “Kaynak: products.json”
- Note: “Bu fiyat şu anda yalnızca katalogdan okunur. Admin fiyat düzenleme P1C aşamasında eklenecek.”
- Warning text when `catalog_price_warning` is set

No price input, no save button for price, no hidden price fields in PATCH payload.

## Price source used

**Trusted server catalog only:**

`products.json` → `functions/api/_lib/products-data.js` → `functions/api/_lib/catalog.js` → `functions/api/admin/products.js`

**Not used:** Supabase `products.price_try`, client `assets/products-data.js`, localStorage.

## Proof price is read-only

- API adds fields only on GET; PATCH/POST still accept inventory fields only
- UI renders price as static HTML (`renderCatalogPrice()`); no `data-price` inputs
- `save()` payload: `{ product_slug, stock_qty, status, sku }` only
- Validator `scripts/validate-p1b-admin-product-price-readonly.mjs` enforces markers

## Proof no product prices changed

No edits to `products.json`, `assets/products-data.js`, or `functions/api/_lib/products-data.js`.

## Proof no SQL was run

No database commands executed.

## Proof no migration was created

No new `supabase/migrations/*` files.

## Checkout trust proof

Unchanged. `create-checkout.js` still uses `unitPrice = normalizeMoney(product.price)` from server catalog; ignores `rawItem.price`.

## Coupon / refund / inventory regression proof

- C1, C1B, C1B2 validators: **PASS**
- D2, D2B, D3 validators: **PASS**
- I1 inventory validator: **PASS**
- P1A drift guard: **PASS**

## Test results (2026-07-07)

| Check | Result |
|-------|--------|
| `validate-p1b-admin-product-price-readonly.mjs` | PASS |
| `validate-p1a-product-price-source-drift.mjs` | PASS |
| `validate-production-launch-readiness.mjs` | PASS |
| `validate-i1-inventory-checkout-blocking.mjs` | PASS |
| C1 / C1B / C1B2 validators | PASS |
| D3 / D2B / D2 validators | PASS |
| `node --test tests/local-integration.test.mjs` | **160/160 PASS** |

New integration tests:

- P1B: admin product API includes read-only catalog price fields
- P1B: admin PATCH payload remains inventory-only
- P1B: checkout/D3A static trust markers
- P1B: drift and read-only validators pass

## Rollback plan

See `COSMOSKIN_P1B_ADMIN_PRODUCT_PRICE_READONLY_ROLLBACK_PLAN_20260707.md`.

## Deferred (not P1B)

- P1C admin price editing
- Supabase `products.price_try` runtime wiring
- Deploy
