# COSMOSKIN C2 — Cart/Checkout Coupon Parity Report (2026-07-08)

## Summary

Fixed a customer-facing pricing integrity bug where WELCOME10 appeared valid on `cart.html` but was rejected or ignored on `checkout.html` for the same session.

## Exact root cause

Four independent failures combined:

1. **Cart optimistic WELCOME10 bypass** (`assets/master-upgrade.js`): `validateCoupon()` short-circuited server validation for `WELCOME10`, computing a client-side 10% discount with `maxDiscount: 300` (yielding ₺244 on a ₺2,438 subtotal).
2. **Checkout used server validation** via `/api/coupons/validate` with `accessToken`, which correctly enforces auth + first-order rules from `functions/api/_lib/coupons.js`.
3. **Checkout did not hydrate coupon from cart storage** on page load — `cosmoskin_coupon_state_v1` was never read before first render/revalidation.
4. **Checkout success-path bug**: after a valid coupon apply, `clearCouponPersistence()` was called, wiping shared storage immediately.

Secondary finding: the live cart total of ₺2,283 (₺244 discount) was **not server-authoritative**. Server `APPROVED_RULES.WELCOME10.max_discount_amount` is **₺150**, so the correct paired total is **₺2,377** (₺2,438 − ₺150 + ₺89).

## Cart coupon state — before / after

| Aspect | Before | After |
|--------|--------|-------|
| Validation | Client bypass for WELCOME10 | `COSMOSKIN_COUPON.validate()` → `/api/coupons/validate` |
| Storage key | Mixed `cosmoskin_coupon_state_v1` + legacy | `cosmoskin_coupon_state_v1` (code + server `discountAmount` preview only) |
| Discount source | Client math (`10%`, max ₺300) | Server `discount_amount` |
| WELCOME10 on ₺2,438 subtotal | ₺244 (wrong cap) | ₺150 (server cap) |

## Checkout coupon state — before / after

| Aspect | Before | After |
|--------|--------|-------|
| Load from cart | No | `hydrateCouponFromCartStorage()` |
| Revalidate timing | Before cart/prices ready / ad hoc | `hydrateAndRevalidateCoupon()` after cart + stock gate |
| Valid apply persistence | Cleared storage on success | `applyValidatedCoupon()` persists via shared client |
| Summary label | Generic / missing | `Kupon indirimi` line when valid |
| Error on valid coupon | “Bu kupon şu anda geçerli değil.” | Server-specific messages via coupon client |

## Coupon validation payload — before / after

**Cart (before):** skipped server for WELCOME10; otherwise `{ code, cart, subtotal }` without `accessToken`.

**Checkout (before):** `{ code, cart, accessToken, shipping_method }` but coupon not hydrated from storage.

**Both (after):** shared `COSMOSKIN_COUPON.buildValidatePayload()` → `{ code, cart, shipping_method, accessToken? }`; trusted subtotal computed server-side via `buildTrustedCartLines()`.

## WELCOME10 parity proof (fixture)

- Product: `cosrx-advanced-snail-96-mucin-essence` × 2
- Effective unit price: ₺1,219 (override) → subtotal **₺2,438**
- Coupon: **WELCOME10** (authenticated, first order, email verified)
- Server discount: **₺150** (10% capped by `APPROVED_RULES.max_discount_amount`)
- Shipping: **₺89**
- **Final total: ₺2,377** (`2438 − 150 + 89`)

Cart and checkout now show the same server discount; integration tests assert identical validate responses for cart-style and checkout-style payloads.

## create-checkout final authority proof

- `create-checkout` receives `coupon_code` from checkout UI (`state.coupon.code`).
- Revalidates via `validateCouponEligibility()` with trusted cart lines and effective prices.
- Ignores client `price` spoofing and does not accept `discount_amount` from client body.
- Fixture test: `totals.discount = 150`, `totals.total = 2377`.

## Coupon usage timing proof

- Validation and cart/checkout preview do **not** record redemption.
- Usage remains on successful payment finalization per existing C1/B1 flow.
- `per_customer_limit` / first-order checks use `used` + `reserved` redemptions, not validate calls.

## P1 effective price impact

- `/api/coupons/validate` already uses `buildTrustedCartLines()` + `buildPricedCatalogIndex()`.
- No change to effective price resolver; C2 only aligns client surfaces to existing server path.

## I2 stock validation impact

- No changes to inventory gate or `validateCartStock`.
- Checkout still runs `refreshStockGate()` before coupon revalidation.
- I2 validator chain passes.

## Files changed

See `COSMOSKIN_C2_CART_CHECKOUT_COUPON_PARITY_CHANGED_FILES_20260708.txt`.

## SQL / migrations

- **No SQL executed.**
- **No migrations created.**

## Test results

```
node scripts/validate-c2-cart-checkout-coupon-parity.mjs          → PASS
node --test tests/local-integration.test.mjs (C2 tests)           → PASS (4/4)
```

Full Section 12 chain run recorded in runbook.

## Rollback

See `COSMOSKIN_C2_CART_CHECKOUT_COUPON_PARITY_ROLLBACK_PLAN_20260708.md`.
