# COSMOSKIN Targeted Stock/Admin/Checkout Bug Fix Report — 2026-06-16

## Changed files

### assets/phase6-commerce.js
- Removed the forced stock text override that wrote `Stokta · 24 saat içinde hazırlanır` to PDP stock labels.
- Stock text is now left to `inventory-client.js`.

### assets/inventory-client.js
- Closed fail-open behavior when inventory data is missing or API validation fails.
- Added `data-buy-now` to slug collection, button state rendering, and stock validation.
- Buy Now buttons now disable/restore independently from Add to Cart.
- Missing inventory now disables purchase and shows a verification error.
- API fetch failures now apply a safe disabled state instead of leaving purchase enabled.

### assets/mobile-redesign.js
- Missing inventory now returns `canBuy: false`.
- Mobile cart/checkout/routine flows now block purchase when stock cannot be verified.
- Mobile stock button selectors now include desktop-compatible `[data-add-cart]` and `[data-buy-now]` as defensive coverage.

### assets/app.js
- Cart stock check now fails closed when stock API is unavailable.
- Collection detail modal no longer pushes directly into cart state; it goes through the stock-validated add flow.
- Added `COSMOSKIN_CART_API.clear()` for checkout success cleanup.

### assets/checkout-flow.js
- Checkout stock validation now blocks progress if inventory check fails or cannot be verified.
- Item-level `can_purchase === false` responses now block payment progression.

### functions/api/admin/products.js
- `out_of_stock` status now updates `product_inventory` safely: `stock_on_hand = 0`, `allow_backorder = false`, `status = active`.
- `preorder` status now maps to `allow_backorder = true` while keeping compatible active status.

### functions/api/_lib/inventory.js
- Added RPC-based atomic reservation path through `reserve_product_inventory`.
- Kept a guarded fallback for environments where the new SQL migration has not yet been applied.

### supabase/migrations/20260616_atomic_inventory_reservation.sql
- Added `public.reserve_product_inventory(product_slug, quantity)` RPC for atomic stock reservation.

### admin/orders/index.html
- Added a minimal clarification notice explaining that order item quantity is not product stock.
- Added link to Inventory Management.

### HTML files referencing changed assets
- Updated cache-busting query strings for changed JS assets to `v=20260616-stockfix`.

## Patch summary

- Fail-open stock behavior: closed.
- `data-buy-now` stock handling: included.
- `phase6-commerce.js` stock override: removed.
- Mobile stock behavior: aligned with desktop fail-closed logic.
- Checkout stock verification failure: now blocks progression.
- Orders screen: clarified so it is not mistaken for stock management.
- Product inventory admin status mismatch: corrected for `out_of_stock` and `preorder`.
- Atomic reservation: added via SQL RPC migration.

## Test checklist to run after deployment

- Stock 0 product card: should show `Stokta Yok`; Add to Cart disabled.
- Stock 0 product detail page: should show `Stokta Yok`; Add to Cart and Buy Now disabled.
- Stock 0 Add to Cart: should not add to cart.
- Stock 0 Buy Now: should not proceed.
- Stock 0 checkout: should block payment progression.
- Stock 1 and quantity 2: should block second quantity.
- Product already in cart, then admin changes stock to 0: checkout should block.
- Inventory API error: frontend should block purchase.
- Mobile vs desktop: same stock behavior.

## Deployment note

Apply the SQL migration before relying on fully atomic reservation behavior:

`supabase/migrations/20260616_atomic_inventory_reservation.sql`

If the migration is not applied, the server code keeps a validation fallback, but the RPC is required for the atomic oversell protection.

## Intentionally not touched

- Design and layout were not redesigned.
- Product data was not changed.
- Header/footer structure was not changed.
- No broad refactor was performed.
