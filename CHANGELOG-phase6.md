# COSMOSKIN Mobile Redesign — Phase 6 Changelog
**Cart, Commerce, Favorites & Checkout System**
`v20260509-phase6`

---

## Overview

Phase 6 implemented the complete real-data commerce layer for the mobile redesign. Cart, favorites, quantity control, badge sync, and checkout flow are all driven by `localStorage` with a `COSMOSKIN_CART_API` fallback. No fake cart or product data is used anywhere.

---

## Files Modified

| File | Change |
|------|--------|
| `assets/mobile-redesign.js` | All commerce functions added |

---

## JavaScript Changes

### Cart state — `localStorage.cosmoskin_cart`

**`getCart()`** reads from `localStorage.cosmoskin_cart`, normalizes items via `normalizeCartItem()`, falls back to `COSMOSKIN_CART_API.getItems()` if the API is available.

**`setCart(items)`** normalizes items, writes to localStorage, dispatches `cosmoskin:cart-updated` on both `window` and `document`, then calls `updateBadges()`. If the current page type is `'cart'`, it also calls `renderCartMobile()`.

**`addItemsToCart(items, options)`** deduplicates by slug: existing items get their qty incremented; new items are pushed. Uses `COSMOSKIN_CART_API.addItems()` if available, otherwise falls back to `setCart()`. Calls `toast()` unless `options.toast === false`.

**`updateCartQuantity(slug, delta)`** increments or decrements qty for a cart item. Items reaching qty 0 are removed.

**`removeCartItem(slug)`** filters the item from cart, calls `setCart()`, shows toast "Ürün sepetten çıkarıldı."

**`cartTotals()`** returns `{ count, subtotal, shipping, total }`. Shipping is 79 TRY if subtotal < 2500, else 0.

---

### Cart badge sync — `updateBadges()`

Finds all `[data-cm-cart-badge]` elements (header bag icon + bottom nav bag icon) and sets their `textContent` to the current cart item count. Badge is hidden (`display:none`) when count is 0.

---

### Favorites — `localStorage.cosmoskin_favorites`

**`favoriteList()`** reads from `localStorage.cosmoskin_favorites`, returns normalized array.

**`fallbackToggleFavorite(button)`** reads `data-*` attributes from the clicked `.favorite-btn`, toggles the item in favorites, writes back to localStorage, dispatches `cosmoskin:favorites-updated`, calls `syncFallbackFavoriteButtons()` and `toast()`. If on account/favorites tab, calls `remount()`.

**`syncFallbackFavoriteButtons(root)`** scans all `.favorite-btn` elements within `root`, sets `is-active` class, `aria-pressed`, and `aria-label` based on current favorites state.

---

### Checkout CTA — no-loop fix

The cart CTA was previously rendered as `<a href="/checkout.html#checkoutForm">`. On `/checkout.html`, clicking this caused the mobile shell to remount in a loop.

**Fix:** CTA changed to `<button type="button" data-cm-proceed-checkout>`. The `data-cm-proceed-checkout` click handler:
- On the cart page: hides the mobile root + drawer, removes `cm-mobile-active` classes, sets `mounted = false`, then smooth-scrolls to `#checkoutForm`
- On any other page: navigates to `/checkout.html`

---

### Delegate handlers added to `bindDelegates()`

| Attribute | Action |
|-----------|--------|
| `[data-cm-add-cart]` | Add product to cart with qty |
| `[data-cm-pdp-inc]` | Increment `currentPdpQty`, update DOM |
| `[data-cm-pdp-dec]` | Decrement `currentPdpQty` (min 1), update DOM |
| `[data-cm-cart-inc]` | Increment cart item qty |
| `[data-cm-cart-dec]` | Decrement cart item qty |
| `[data-cm-cart-remove]` | Remove cart item |
| `[data-cm-proceed-checkout]` | Checkout CTA (no-loop) |
| `.favorite-btn` (inside root) | Toggle favorite via `fallbackToggleFavorite()` |

---

### Real-state cart and favorites rendering

- `cartPage()` reads real `localStorage.cosmoskin_cart` via `getCart()`
- `cartContentHtml()` renders real items with quantity steppers and remove buttons
- `accountContent('favorites')` reads real `localStorage.cosmoskin_favorites` via `favoriteList()`
- Empty states are premium and truthful — no fake items displayed

---

## Verification

| Check | Result |
|-------|--------|
| `node --check mobile-redesign.js` | ✅ Pass |
| `data-cm-proceed-checkout` present | ✅ |
| Cart badge sync in header + bottom nav | ✅ |
| `localStorage.cosmoskin_cart` used | ✅ |
| `localStorage.cosmoskin_favorites` used | ✅ |
| No fake cart data | ✅ |
| Checkout CTA no loop | ✅ |
