# COSMOSKIN — C1A Coupon Eligibility Hardening Rollback Plan

**Date:** 2026-07-06  
**Scope:** Roll back C1A coupon eligibility hardening (JS-only).

## 1) What rollback means

Rollback restores the prior coupon behavior by reverting the C1A commits/files:

- Server-side eligibility engine changes in `functions/api/_lib/coupons.js`
- Validate endpoint subtotal/tier/routine enforcement changes
- Checkout apply-coupon error mapping changes
- C1A validator + tests
- Scope-guard validator exemptions (env-var gated)

## 2) Rollback steps (git)

From repo root:

```bash
git revert <C1A_COMMIT_SHA_1> <C1A_COMMIT_SHA_2> ...
```

If C1A is a single commit:

```bash
git revert <C1A_COMMIT_SHA>
```

## 3) Post-rollback verification

Run the same validation suite after rollback:

```bash
node scripts/validate-d3-refund-snapshot-persistence.mjs
node scripts/validate-d2b-refund-discount-proration.mjs
node scripts/validate-d2-refund-amount-correctness.mjs
node scripts/validate-d1-returns-refunds-correctness.mjs
node scripts/validate-b2e-email-events-integrity.mjs
node scripts/validate-b2-bank-transfer-rejection-finalization.mjs
node scripts/validate-b1-bank-transfer-finalization.mjs
node scripts/validate-a1f-admin-rbac-session-identity.mjs
node scripts/validate-a1-admin-rbac-hardening.mjs
node scripts/validate-a1-admin-endpoint-coverage.mjs
node scripts/validate-h2-return-attachment-preview.mjs
node scripts/validate-h1-return-attachment-storage-rls.mjs
node scripts/validate-h0-live-payment-rpc-hotfix.mjs
node scripts/validate-account-batch-1-safe-fixes.mjs
node scripts/validate-account-batch-3-order-cancellation.mjs
node scripts/validate-account-batch-4-loyalty-ledger.mjs
node scripts/validate-account-ui-polish.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## 4) Notes / risks

- C1A is JS-only. No database migrations are involved, so rollback is low-risk and fully reversible.
- Rollback would re-open the known ROUTINE5 abuse gap (manual code entry without routine completion) and should be treated as an emergency-only measure.

