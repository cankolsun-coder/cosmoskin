# COSMOSKIN C2 — Cart/Checkout Coupon Parity Runbook (2026-07-08)

## Preconditions

- Node.js available locally
- No deploy required for validation
- Use wrangler only if testing live `/api/*` in browser: `npx wrangler pages dev . --compatibility-date=2024-06-01`

## Validators (run in order, stop after C2 chain completes)

```bash
node scripts/validate-c2-cart-checkout-coupon-parity.mjs
node scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs
node scripts/validate-c1b-coupon-exclusions-metadata.mjs
node scripts/validate-c1-coupon-eligibility-hardening.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-i1-inventory-checkout-blocking.mjs
node scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs
node scripts/validate-p1c3-effective-price-fallback-hardening.mjs
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1c-admin-product-price-editing.mjs
node scripts/validate-p1b-admin-product-price-readonly.mjs
node scripts/validate-p1a-product-price-source-drift.mjs
node scripts/validate-production-launch-readiness.mjs
node scripts/validate-d3-refund-snapshot-persistence.mjs
node scripts/validate-d2b-refund-discount-proration.mjs
node scripts/validate-d2-refund-amount-correctness.mjs
node --test tests/local-integration.test.mjs
```

## Manual QA (authenticated first-order customer)

1. Add `cosrx-advanced-snail-96-mucin-essence` × 2 to cart (effective subtotal ~₺2,438).
2. Apply **WELCOME10** on cart — confirm server-validated discount line appears.
3. Open checkout — coupon field pre-filled, **Kupon indirimi** shown, total matches cart.
4. Submit bank transfer checkout — order total matches UI (server recalculated).
5. Guest session: WELCOME10 rejected on both cart and checkout with auth-required message.

## Storage inspection

```js
JSON.parse(localStorage.getItem('cosmoskin_coupon_state_v1'))
```

Expect: `{ ok: true, code: 'WELCOME10', discountAmount: <server>, source: 'backend', validatedAt: ... }`

## Known server cap

WELCOME10 discount is capped at **₺150** per `APPROVED_RULES` in `functions/api/_lib/coupons.js`, not the legacy client cap of ₺300.
