# COSMOSKIN — C1B1 Coupon Exclusions & Allocation Runbook

**Date:** 2026-07-06  
**Purpose:** How to validate C1B1 locally (no deploy, no SQL).

## 1) What C1B1 adds

- Excluded products/categories are supported safely (line-level eligibility).
- Eligible subtotal is used for min-subtotal and discount base.
- Allocation is shared for order_items snapshots and Iyzico basket totals.
- Snapshot version v2 is used when exclusions exist and a discount is applied.

## 2) Local verification commands

Run from repo root:

```bash
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node --check functions/api/_lib/coupons.js
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node --check functions/api/_lib/order-pricing-snapshot.js
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node --check functions/api/create-checkout.js
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node --check functions/api/coupons/validate.js

COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-c1b-coupon-exclusions-metadata.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-c1-coupon-eligibility-hardening.mjs

COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-d3-refund-snapshot-persistence.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-d2b-refund-discount-proration.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-d2-refund-amount-correctness.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-d1-returns-refunds-correctness.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-b2e-email-events-integrity.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-b2-bank-transfer-rejection-finalization.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-b1-bank-transfer-finalization.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-a1f-admin-rbac-session-identity.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-a1-admin-rbac-hardening.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-a1-admin-endpoint-coverage.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-h2-return-attachment-preview.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-h1-return-attachment-storage-rls.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-h0-live-payment-rpc-hotfix.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-account-batch-1-safe-fixes.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-account-batch-3-order-cancellation.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-account-batch-4-loyalty-ledger.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-account-ui-polish.mjs
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node scripts/validate-production-launch-readiness.mjs

COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node --test tests/local-integration.test.mjs
```

## 3) Notes

- The env var `COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1` is used to bypass legacy “scope guard” validators that still list `functions/api/_lib/coupons.js` as forbidden for historical batches; C1A/C1B legitimately modify coupon logic.

