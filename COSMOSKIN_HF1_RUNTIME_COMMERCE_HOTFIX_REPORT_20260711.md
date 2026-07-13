# COSMOSKIN HF1 — Runtime Commerce Hotfix Report
**Date:** 2026-07-11 · **Scope:** two P0 runtime fixes from the full audit (UX3-01, E1-01). No redesign, no pricing/coupon/checkout/stock-rule changes.

## Root causes

### 1. `cartHasItems is not defined` (audit UX3-01)
Commit `23f7c95` (C3 mini cart premium redesign) deleted the one-line helper
`function cartHasItems(){return cartItems().length>0;}` from `assets/phase6-commerce.js`
while keeping six call sites (`setCartDrawerCommerceState`, `hydrateCouponFromStorage`,
`renderCartRecommendations`, `validateCoupon`, `revalidateStoredCoupon`, empty-cart CTA guard).
Every drawer commerce hook threw `ReferenceError` on every page, re-firing every 1.8 s via
`setInterval(mountCartExtras, 1800)`. Net effect: mini-cart coupon box never appeared,
recommendations never rendered, empty-state CTA guard dead.

### 2. Isntree PDP missing `inventory-client.js` (audit E1-01)
`products/isntree-hyaluronic-acid-watery-sun-gel.html` was the only PDP (of 37) that shipped
the cart drawer without loading `/assets/inventory-client.js`. Without it,
`window.COSMOSKIN_STOCK` is undefined, `app.js#cartStockCheck` returns `{ok:false, unknown:true}`,
and `addCartItems` rejects every add — the product could not be purchased from its own PDP.

## Fixes

### `assets/phase6-commerce.js`
Restored `cartHasItems` as a local, minimal-scope, non-throwing helper (no shared helper existed
in `assets/cart-commerce.js`):
- returns `true` iff the normalized cart has ≥1 item with quantity > 0 (`qty` or `quantity` field; missing quantity counts as present, matching cart normalization defaults);
- accepts an optional explicit items array;
- falls back to reading `localStorage.cosmoskin_cart` when `COSMOSKIN_CART_API` has not mounted yet (guest/early-call safety);
- corrupt storage is swallowed (never throws).
Original gating semantics preserved: same call sites, no coupon/recommendation/totals logic touched.

### `products/isntree-hyaluronic-acid-watery-sun-gel.html`
Added `<script defer="" src="/assets/inventory-client.js?v=20260616-stockfix"></script>` in the
canonical PDP position (after `mobile-redesign.js`, before `master-upgrade.js`), matching the
other 36 PDPs. No product content, price, or other markup touched. A repo-wide scan confirmed no
other PDP is missing the script, so no other PDPs were modified.

## Runtime behavior — before / after (headless Chrome, local static server)

| Check | Before | After |
|---|---|---|
| Console on home/PLP/PDP/cart/checkout | `ReferenceError: cartHasItems is not defined` every ~1.8 s | **0 errors** (measured over multiple remount ticks) |
| Drawer with 2 items: coupon box `#phase6CartCoupon` | never visible | **visible** |
| Drawer recommendations `#phase6CartRecommendations` | never visible | **visible** |
| `cart-drawer--filled` state class | unreliable (hook threw) | applied |
| Isntree PDP `window.COSMOSKIN_STOCK` | `undefined` | `object` |
| Isntree PDP add-to-cart (inventory API responding — stubbed `{status:'active', available_stock:25}`) | blocked ("Stok bilgisi doğrulanamadı") | **1 item added, 0 page errors** |
| Isntree PDP with API unreachable | blocked with wrong reason (missing script) | identical behavior to baseline PDP (anua) — service-unavailable guard, which is pre-existing I2 policy, unchanged by HF1 |

## Files changed
- `assets/phase6-commerce.js` — restored `cartHasItems` helper (+18 lines, 1 hunk)
- `products/isntree-hyaluronic-acid-watery-sun-gel.html` — 1 script tag added
- `scripts/validate-hf1-runtime-commerce-hotfix.mjs` — new validator
- `tests/local-integration.test.mjs` — 3 new HF1 tests
- 4 HF1 docs (this report, changed-files list, runbook, rollback plan)

## Validator results
- `validate-hf1-runtime-commerce-hotfix.mjs` — PASS (definition/behavior/gating, PDP scan, products.json guard, protected-file guard, C3/I2 canaries)
- `validate-c3-minicart-parity-premium-redesign.mjs` — PASS
- `validate-c4-checkout-order-creation-after-coupon.mjs` — PASS
- `validate-p1e3-storefront-sale-display.mjs` — PASS
- `validate-p1e4-checkout-coupon-sale-snapshot-hardening.mjs` — PASS
- `validate-i2-checkout-stock-false-negative.mjs` — PASS
- `validate-production-launch-readiness.mjs` — PASS

## Tests
`node --test tests/local-integration.test.mjs` → **222 pass / 0 fail** (219 pre-existing + 3 new HF1 tests: helper definition coverage, non-throwing quantity-gating behavior incl. guest/corrupt-storage cases, repo-wide PDP inventory-script scan).

## Confirmations
- `git diff -- products.json` → empty (byte-identical to HEAD).
- No SQL executed, no migrations created, no deploy.
- No pricing, coupon, checkout, stock-rule, account/profile, or admin file touched (enforced by the HF1 validator's protected-file guard).
- Commerce invariants intact: checkout remains server-authoritative; `compare_at_price_try` remains display-only; no payable-math paths modified.

## Known risks
- The localStorage fallback in `cartHasItems` reads the same key app.js persists (`cosmoskin_cart`); if a future cart-storage rename happens, update the helper (validator will catch behavioral drift).
- The drawer's *visual* row-collision issue (audit UX3-02) is intentionally NOT fixed here — it is UX3 scope.

## Rollback
See `COSMOSKIN_HF1_RUNTIME_COMMERCE_HOTFIX_ROLLBACK_PLAN_20260711.md` — single revert of the HF1 commit restores prior state; no data/schema involvement.
