# COSMOSKIN — C1B1 Coupon Exclusions & Allocation Rollback Plan

**Date:** 2026-07-06  
**Scope:** Roll back C1B1 changes (JS-only).

## 1) What rollback does

Rollback reverts C1B1’s exclusion-aware eligible subtotal and eligible-line allocation. The system returns to C1A behavior (fail-closed exclusions).

## 2) Rollback steps (git)

```bash
git revert <C1B1_COMMIT_SHA>
```

If C1B1 is split across multiple commits:

```bash
git revert <SHA1> <SHA2> ...
```

## 3) Post-rollback verification

```bash
node scripts/validate-c1-coupon-eligibility-hardening.mjs
node scripts/validate-d3-refund-snapshot-persistence.mjs
node scripts/validate-d2b-refund-discount-proration.mjs
node scripts/validate-d2-refund-amount-correctness.mjs
node scripts/validate-d1-returns-refunds-correctness.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## 4) Notes / risks

- C1B1 is JS-only; no migrations are involved.
- Rollback re-opens the “exclusion coupons are unusable” limitation (safe fail-closed behavior), but does not re-open ROUTINE5/tier/first-order hardening (those are C1A).

