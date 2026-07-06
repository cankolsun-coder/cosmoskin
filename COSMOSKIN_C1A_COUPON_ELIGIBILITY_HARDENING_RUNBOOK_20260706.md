# COSMOSKIN — C1A Coupon Eligibility Hardening Runbook

**Date:** 2026-07-06  
**Purpose:** How to validate C1A coupon hardening locally without deploy/SQL.

## 1) What changed (high level)

- Coupon eligibility is enforced **server-side** by a single shared engine in `functions/api/_lib/coupons.js`.
- Both `/api/coupons/validate` and `create-checkout.js` call the same eligibility path.
- ROUTINE5 now requires authenticated user + trusted `customer_routine_results` completion.
- Membership-tier restrictions are enforced from `customer_membership_status.level_code`.
- Per-customer limits count **used + active reserved** redemptions.

## 2) Local verification commands

Run these from repo root:

```bash
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node --check functions/api/_lib/coupons.js
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node --check functions/api/coupons/validate.js
COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1 node --check functions/api/create-checkout.js

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

### Why the env var exists

Several historical validators include “scope guard” rules (to prevent unrelated edits during earlier batches) that mark `functions/api/_lib/coupons.js` as forbidden. C1A legitimately modifies that file.

Setting:

- `COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1`

temporarily disables **only** those scope-guard checks for `coupons.js` during validator runs.

## 3) Quick manual smoke checks (optional, no deploy)

Start Wrangler dev (only if you want to interactively test the endpoints locally):

```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```

Then verify:

- `/api/coupons/validate` rejects `ROUTINE5` for guests and users without routine completion.
- `/api/coupons/validate` rejects `ELITE100` for non-elite tiers.
- `/api/coupons/validate` rejects `COSMOSKIN10`.
- Checkout rejects the same codes during order creation (not just at validate time).

