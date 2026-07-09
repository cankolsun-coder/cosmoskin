# COSMOSKIN C3 — Mini Cart Commerce Parity + Premium Drawer Redesign

**Date:** 2026-07-08  
**Scope:** Mini cart drawer coupon/totals/stock parity with `cart.html` and `checkout.html`, premium drawer UI, cart.html recommendation block fix.

## Executive summary

Three cart surfaces now share a single commerce model (`assets/cart-commerce.js`). The mini cart coupon mismatch was caused by `phase6-commerce.js` validating coupons via a legacy direct `/api/coupons/validate` call **without** `accessToken`, while checkout used `COSMOSKIN_COUPON.validate()` with session identity. WELCOME10 (auth-gated) therefore showed “Bu kupon hesabınız için uygun değil.” in the drawer while checkout accepted the same code for logged-in customers.

## Cart surfaces (3)

| Surface | HTML | JS | CSS |
|--------|------|----|-----|
| **Mini cart drawer** (`#cartDrawer`) | Inline in site pages | `assets/app.js`, `assets/phase6-commerce.js` | `assets/phase6-commerce.css`, `assets/cosmoskin-final-uat-fix.css` |
| **cart.html** | `cart.html` → `#csCartApp` | `assets/master-upgrade.js` | `assets/master-upgrade.css`, `assets/phase6-commerce.css` |
| **checkout.html** | `checkout.html` | `assets/checkout-flow.js` | checkout premium CSS |

**Shared:** `assets/coupon-client.js`, `assets/cart-commerce.js`, `assets/inventory-client.js`, `functions/api/coupons/validate.js`, `functions/api/create-checkout.js`

## Root cause — mini cart coupon mismatch

1. **Different validation path:** `phase6-commerce.js` `validateCoupon()` called `/api/coupons/validate` without `accessToken` and without `COSMOSKIN_COUPON.validate()`.
2. **Auth-gated coupons:** WELCOME10 requires authenticated first-order eligibility server-side; guest/unauthenticated validation returns account-ineligible messaging.
3. **Missing coupon line in drawer totals:** `app.js` `totals()` applied routine bundle discount only; coupon discount was not reflected in summary rows.
4. **Stale revalidation:** Drawer did not reliably revalidate on open or after `cosmoskin:auth-state`.

## Shared commerce state (`assets/cart-commerce.js`)

`window.COSMOSKIN_CART_COMMERCE` provides:

- `normalizeLine`, `subtotalForItems`, `computeTotals`
- `readCouponState`, `couponDiscountAmount`, `validateCoupon` (wraps `COSMOSKIN_COUPON.validate`)
- `recommendationCandidates` (complementary categories, excludes in-cart + OOS)
- `isOutOfStock` (I2-safe: unknown ≠ unavailable)

Storage key: `cosmoskin_coupon_state_v1` (code + server-persisted discount metadata only).

## Behavior before / after

### Coupon

| | Before | After |
|---|--------|-------|
| Mini cart validation | Direct fetch, no token | `COSMOSKIN_CART_COMMERCE.validateCoupon` → `COSMOSKIN_COUPON.validate` with `resolveAccessToken` |
| Discount source | Not shown / inconsistent | Server `discount_amount` via `previewDiscount` |
| Revalidation | On cart update only | Cart open, cart update, auth-state, coupon-updated |

### Totals

| | Before | After |
|---|--------|-------|
| Drawer subtotal/coupon/shipping/KDV/total | Routine only; coupon missing | `computeTotals()` aligned with cart page |
| Free shipping progress | Based on raw subtotal | Based on discounted subtotal |
| cart.html | Local coupon math | `COSMOSKIN_CART_COMMERCE.computeTotals` |

Fixture (2× ₺1,219 snail essence + WELCOME10): subtotal ₺2,438 → discount ₺150 → shipping ₺89 → **total ₺2,377**.

### Stock (I2 preserved)

- Unknown inventory does not block checkout CTA.
- Confirmed OOS still blocks.
- Item-level stock messages unchanged.

### Design

| Area | Before | After |
|------|--------|-------|
| Header | Plain “Sepet” | “Sepetin” + subtitle + circular close |
| Product rows | Cramped, overflow | Thumbnail frame, brand/name hierarchy, 2-line clamp |
| Coupon | Generic box | Premium states: loading/success/error + remove |
| Summary | Generic rows | Kupon İndirimi row, trust microcopy, “Sepeti Düzenle” |
| Empty state | Basic | Premium copy + “Alışverişe Başla” |
| Recommendations | Placeholder when empty | Hidden unless real candidates |

### cart.html recommendations decision

**Chosen:** Hide the entire “Sepete uygun öneriler” section when `recommendationCandidates()` returns zero products. No empty premium shell remains. Checkout has no recommendation block. Mini cart keeps compact carousel only when populated.

## Responsive behavior

- Drawer width `min(420px, 100vw - 24px)`; full-width sheet on ≤720px.
- `minmax(0,1fr)` + `-webkit-line-clamp:2` on product/recommendation text.
- Sticky summary footer with smooth item scroll.

## Accessibility

- `aria-label` on close, quantity, remove, recommendation arrows.
- Coupon status `role="status"` + `aria-live="polite"`.
- Checkout CTA `aria-disabled` when cart empty.
- Focus-visible styles on close button.

## Tests

- **Integration:** 195 tests, 195 pass (5 new C3 tests).
- **C3 validator:** `scripts/validate-c3-minicart-parity-premium-redesign.mjs` — passed.
- **Section 16 chain:** C2, C1/C1B/C1B2, I1/I2, P1A–P1C4, D2/D2B/D3, production readiness — all passed.

## SQL / deploy / migration / P1E

- **No SQL executed**
- **No migrations created**
- **No deploy**
- **P1E not started**

## Files changed

See `COSMOSKIN_C3_MINICART_PARITY_PREMIUM_REDESIGN_CHANGED_FILES_20260708.txt`.
