# COSMOSKIN — D2A: Refund Amount Correctness — ROLLBACK PLAN

**Date:** 2026-07-06  
**Rollback type:** Git revert + redeploy (no DB rollback)

---

## 1. When to rollback

- Legitimate product refunds blocked due to incorrect cap calculation
- Shipping incorrectly included for customer-preference returns
- Shipping incorrectly excluded for seller-fault returns after policy review
- Admin UI regression blocking order operations
- D1 return/refund regressions detected

---

## 2. Rollback steps

### Identify commit

```bash
git log --oneline -5
# Locate D2A refund amount correctness commit (when committed)
```

### Revert

```bash
git revert <D2A-commit-sha> --no-edit
```

Or restore files:

```bash
git checkout <pre-D2A-sha> -- \
  functions/api/admin/refunds.js \
  assets/admin-orders.js \
  scripts/validate-d2-refund-amount-correctness.mjs \
  tests/local-integration.test.mjs \
  scripts/validate-a1-admin-endpoint-coverage.mjs
```

### Verify locally

```bash
node scripts/validate-d1-returns-refunds-correctness.mjs
node --test tests/local-integration.test.mjs
```

Note: pre-D2A code may allow shipping in standard refunds or over-refunding — expected when intentionally reverting.

### Redeploy

Redeploy Cloudflare Pages from reverted branch. No Supabase steps.

---

## 3. Data considerations

- Refund rows created under D2A validation remain valid.
- Metadata fields (`refund_responsibility`, `shipping_included`, caps) are informational only.
- No schema changes to revert.

---

## 4. Rollback checklist

- [ ] Admin can create product-only refunds
- [ ] D1 return eligibility still works
- [ ] B1/B2 bank transfer smoke pass
- [ ] B2E email audit smoke pass
- [ ] A1F admin login works

---

## 5. Re-apply

If rollback was precautionary, re-deploy D2A after fixing root cause rather than staying on pre-D2A behavior.

See `COSMOSKIN_D2_REFUND_AMOUNT_CORRECTNESS_RUNBOOK_20260706.md`.
