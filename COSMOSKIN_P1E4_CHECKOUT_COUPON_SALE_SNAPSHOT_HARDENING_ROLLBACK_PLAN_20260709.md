# P1E4 Rollback Plan — Checkout / Coupon / Sale Snapshot Hardening (2026-07-09)

## When to rollback
- Checkout rejects valid sale-priced carts
- Coupon subtotals diverge from checkout for same cart
- Iyzico/bank totals mismatch order_items snapshots
- False-positive `price_changed` notices block checkout UX

## Rollback steps
1. Revert modified files listed in `COSMOSKIN_P1E4_CHECKOUT_COUPON_SALE_SNAPSHOT_HARDENING_CHANGED_FILES_20260709.txt`
2. Remove `scripts/validate-p1e4-checkout-coupon-sale-snapshot-hardening.mjs`
3. Run P1E3 + P1C validator chain to confirm storefront/display path intact
4. Deploy reverted Workers/Pages bundle

## Safe partial rollback
- **Server-only:** revert `create-checkout.js` + `coupons/validate.js` if client notice causes UX noise; keep `getPayableUnitPriceTry` in resolver
- **UI-only:** revert `checkout-flow.js` repriced notice handling; server hardening remains

## Data impact
- None. No migrations. Existing orders unaffected.
- In-flight checkouts created during rollback window use prices at creation time.

## Not required for rollback
- SQL changes
- `products.json` restore
- Admin sale field removal (P1E2 remains)
