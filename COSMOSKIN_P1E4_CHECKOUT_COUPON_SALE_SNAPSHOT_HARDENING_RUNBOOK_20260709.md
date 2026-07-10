# P1E4 Checkout / Coupon / Sale Snapshot Hardening — Runbook (2026-07-09)

## Preconditions
- P1E1, P1E2, P1E3 committed
- Working tree clean except `.wrangler/`
- No `products.json` edits

## Section 17 — Validator chain
```bash
node scripts/validate-p1e4-checkout-coupon-sale-snapshot-hardening.mjs
node scripts/validate-p1e3-storefront-sale-display.mjs
node scripts/validate-p1e2-admin-sale-price-editing.mjs
node scripts/validate-p1e1-sale-price-resolver-model.mjs
node scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs
node scripts/validate-p1c3-effective-price-fallback-hardening.mjs
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1d-admin-price-audit-history.mjs
node scripts/validate-c4-checkout-order-creation-after-coupon.mjs
node scripts/validate-c3-minicart-parity-premium-redesign.mjs
node scripts/validate-c2-cart-checkout-coupon-parity.mjs
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-d3-refund-snapshot-persistence.mjs
node scripts/validate-d2b-refund-discount-proration.mjs
node scripts/validate-d2-refund-amount-correctness.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## Manual wrangler checks (optional)
```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```
1. Set active sale on a catalog product (regular 1219, sale 999, compare-at 1299)
2. Add qty 2 to cart → checkout subtotal should be 1998
3. Apply WELCOME10 (authenticated, first order) → discount 150
4. Complete bank transfer checkout → `order_items.unit_price` = 999, `paid_unit_price` = 924 after coupon allocation
5. Expire sale → new checkout uses 1219

## Stale client total check
Send checkout with `totals.subtotal: 2598` while server resolves 1998 → response includes `price_changed: true`, `repriced: true`, charges 1998.
