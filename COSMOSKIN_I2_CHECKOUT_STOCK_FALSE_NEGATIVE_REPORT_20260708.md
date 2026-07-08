# COSMOSKIN I2 — Checkout Stock False Negative Report (2026-07-08)

## Summary

Checkout was blocking payment with **“Stok doğrulaması gerekli”** even when catalog/inventory showed sellable stock. Root cause was a **frontend false negative**: `validateCartPurchasable()` ran a **local inventory-map gate before the trusted API**, and `canBuy()` treated a **missing in-memory inventory row** as blocked.

## Root cause

1. `assets/inventory-client.js` called `getCartStockState()` before `/api/inventory/check`.
2. `getCartBlockingItems()` used `canBuy()`, which returns `ok: false` when `getInventory(slug)` is missing.
3. On `/checkout.html`, cart slugs live in `localStorage` / `COSMOSKIN_CART_API`, not in PDP DOM nodes collected by `collectSlugs(document)`.
4. Fresh checkout page load → empty `inventoryMap` for cart items → immediate block with generic copy, even though server inventory was available.

Price/KDV totals were unaffected because they use cart/catalog pricing, not the stock gate path.

## Product slug mapping (COSRX Advanced Snail 96 Mucin Power Essence 100ml)

| Surface | Slug |
|---|---|
| Catalog (`products.json`) | `cosrx-advanced-snail-96-mucin-essence` |
| PDP URL | `/products/cosrx-advanced-snail-96-mucin-essence.html` |
| Catalog aliases (search only) | `cosrx-advanced-snail-96-mucin-power-essence`, `cosrx-snail` |
| Expected `product_inventory.product_slug` | `cosrx-advanced-snail-96-mucin-essence` |
| Cart / checkout payload | `item.slug` or `item.id` → normalized to same slug |

**No slug drift in cart/checkout code path.** Aliases are not used for inventory lookup; inventory must use the canonical catalog slug.

## Frontend stock gate (after fix)

- `validateCartPurchasable()`:
  1. `loadInventory(cartSlugs, { force: true })` from `/api/inventory`
  2. `/api/inventory/check` (authoritative)
  3. Block only on API `can_purchase === false`
- `getCartBlockingItems()` ignores unknown local inventory (`buy.unknown`).
- Item-level messages via `formatItemStockMessage()` / `formatCartStockMessage()`.
- Checkout UI shows per-item reasons in `stockBlockDetails`.

## Server stock validation (unchanged authority, hardened)

- `create-checkout.js` still calls `validateCartStock()` before reservation.
- `validateCartStock()` and `/api/inventory/check` now call `releaseExpiredReservationsBestEffort()` before reading `product_inventory` (best-effort RPC; failures are ignored).
- Sellable status remains **`active`** only (`ACTIVE_STATUS` in `inventory.js`).
- Structured `stock_unavailable` payload with `items[]` preserved.

## Supabase diagnostics (prepared, not run from Cursor)

Use in Supabase SQL Editor to confirm live data for the test product:

```sql
select product_slug, stock_on_hand, stock_reserved,
       greatest(stock_on_hand - stock_reserved, 0) as available_stock,
       status, allow_backorder, updated_at
from public.product_inventory
where product_slug ilike '%snail%' or product_slug ilike '%cosrx%';
```

Confirm:

- `available_stock >= requested quantity`
- `status = 'active'`
- stale `inventory_reservations` not consuming stock (Diagnostic SQL 2–3 from I2 plan)

**No SQL was executed from this remediation.**

## Stale reservations

- Code now attempts `release_expired_inventory_reservations` before stock reads.
- Whether stale rows were the live cause for this product is **unverified** (no SQL run). The observed false negative matched missing client inventory cache, not reserved stock math.

## P1 effective price overlay

- Verified: effective price merge does not remove `available_stock` / inventory fields.
- `mergeCheckItemIntoMap()` preserves stock fields from API check responses.

## Proof checkout still blocks truly unavailable items

- Integration tests: zero available, fully reserved, inactive status, quantity above available.
- I1 validator chain re-run and must pass.

## Files changed

See `COSMOSKIN_I2_CHECKOUT_STOCK_FALSE_NEGATIVE_CHANGED_FILES_20260708.txt`.

## Test results

Run:

```bash
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-i1-inventory-checkout-blocking.mjs
node --test tests/local-integration.test.mjs
```

(Full Section 11 chain executed at delivery time: **186/186** integration tests pass; I2 + I1 + P1 + C1 + D2/D3 validators pass.)

## Migrations / deploy

- **No migration created.**
- **No deploy performed.**
- **P1E not started.**

## Rollback

See `COSMOSKIN_I2_CHECKOUT_STOCK_FALSE_NEGATIVE_ROLLBACK_PLAN_20260708.md`.
