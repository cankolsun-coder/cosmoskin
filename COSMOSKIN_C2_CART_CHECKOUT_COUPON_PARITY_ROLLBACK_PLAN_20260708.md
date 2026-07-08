# COSMOSKIN C2 — Rollback Plan (2026-07-08)

## When to rollback

- Cart/checkout totals diverge after deploy
- WELCOME10 incorrectly accepted for ineligible customers
- Coupon storage corruption or checkout init regression

## Fast rollback (client only)

1. Revert these files to pre-C2 commit:
   - `assets/coupon-client.js` (delete)
   - `assets/master-upgrade.js`
   - `assets/checkout-flow.js`
   - `assets/mobile-redesign.js`
   - `cart.html`
   - `tests/local-integration.test.mjs`
   - `scripts/validate-c2-cart-checkout-coupon-parity.mjs` (delete)
2. Clear customer `localStorage` key `cosmoskin_coupon_state_v1` if stale state causes UI errors.

## Partial rollback options

| Symptom | Action |
|---------|--------|
| Checkout loader issue | Remove `ensureCosmoskinCouponClient` block from `checkout-flow.js`; restore script tag only on cart |
| Cart regression | Revert `master-upgrade.js` only; keep shared client for checkout |
| Mobile cart coupon | Revert `mobile-redesign.js` coupon hooks |

## Do not rollback

- `functions/api/coupons/validate.js` — unchanged; still authoritative
- `functions/api/create-checkout.js` — unchanged
- C1/C1B/C1B2 server hardening — never weaken

## Verification after rollback

```bash
node scripts/validate-c1-coupon-eligibility-hardening.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node --test tests/local-integration.test.mjs
```

## Data impact

No database migrations or coupon redemption schema changes in C2. Rollback is frontend-only.
