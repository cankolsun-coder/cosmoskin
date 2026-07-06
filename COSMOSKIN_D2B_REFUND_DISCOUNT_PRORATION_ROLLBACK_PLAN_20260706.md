# COSMOSKIN — D2B: Refund Discount Proration — ROLLBACK PLAN

**Date:** 2026-07-06  
**Rollback type:** Git revert + redeploy (no DB rollback)

---

## 1. When to rollback

- Legitimate partial refunds blocked due to incorrect proration
- Proration fallback too aggressive (blocking refunds that D2A would allow)
- Admin UI regression blocking refund operations
- D2A shipping rules accidentally regressed
- D1 `provider_reference` / idempotency regressions detected

---

## 2. Rollback steps

### Identify commit

```bash
git log --oneline -5
# Locate D2B refund discount proration commit (when committed)
```

### Revert

```bash
git revert <D2B-commit-sha> --no-edit
```

Or restore files:

```bash
git checkout <pre-D2B-sha> -- \
  functions/api/admin/refunds.js \
  assets/admin-orders.js \
  scripts/validate-d2b-refund-discount-proration.mjs \
  tests/local-integration.test.mjs \
  scripts/validate-a1-admin-endpoint-coverage.mjs
```

Optional: revert validator chain-guard infra changes in `scripts/validate-*.mjs` if desired (not required for functional rollback).

### Verify locally

```bash
node scripts/validate-d2-refund-amount-correctness.mjs
node scripts/validate-d1-returns-refunds-correctness.mjs
node --test tests/local-integration.test.mjs
```

Note: pre-D2B code may accept pre-discount item amounts (e.g. 600 instead of 540) — expected when intentionally reverting.

### Redeploy

Redeploy Cloudflare Pages from reverted branch. No Supabase steps.

---

## 3. Data considerations

- Refunds **already created** under D2B rules remain in `refunds` table; rollback does not auto-adjust amounts.
- No schema changes to roll back.
- `return_request_items.refundable_amount` was never authoritative under D2B; reverting does not require data migration.

---

## 4. Rollback verification checklist

| Check | Expected after rollback |
|-------|-------------------------|
| D2A product/shipping separation | Still active (D2A not reverted) |
| Item-level proration | Removed — order-level D2A caps only |
| `provider_reference` on complete | Still required (D1) |
| Admin auth / RBAC | Unchanged |
| Free-shipping clawback | Still not implemented |

---

## 5. Re-apply

When fix is ready, re-apply D2B branch and run:

```bash
node scripts/validate-d2b-refund-discount-proration.mjs
node --test tests/local-integration.test.mjs
```
