# COSMOSKIN — D1: Returns / Refunds Commerce Correctness — ROLLBACK PLAN

**Date:** 2026-07-06  
**Rollback type:** Git revert + redeploy (no DB rollback needed — no migration)

---

## 1. When to rollback

- Customer returns incorrectly blocked for legitimately delivered orders (data model mismatch on `delivered_at`)
- Admin cannot complete refunds despite valid references (regression in `refunds.js`)
- Duplicate refund side effects observed despite idempotency guard
- RBAC regression (unauthorized admin mutations)
- B1/B2/B2E/H1/H2 regression detected in production

---

## 2. Rollback steps

### Step A — Identify commit

```bash
git log --oneline -5
# Locate the D1 commit (returns/refunds correctness)
```

### Step B — Revert

```bash
git revert <D1-commit-sha> --no-edit
```

Or restore specific files from pre-D1 HEAD if reverting as a bundle:

```bash
git checkout <pre-D1-sha> -- \
  functions/api/returns.js \
  functions/api/admin/refunds.js \
  functions/api/admin/returns.js \
  assets/account-dashboard.js \
  assets/account-returns.js \
  scripts/validate-d1-returns-refunds-correctness.mjs \
  tests/local-integration.test.mjs \
  scripts/validate-a1-admin-endpoint-coverage.mjs \
  scripts/validate-a1-admin-rbac-hardening.mjs \
  scripts/validate-a1f-admin-rbac-session-identity.mjs \
  scripts/validate-b2e-email-events-integrity.mjs
```

### Step C — Verify locally

```bash
node scripts/validate-b1-bank-transfer-finalization.mjs
node scripts/validate-b2-bank-transfer-rejection-finalization.mjs
node scripts/validate-b2e-email-events-integrity.mjs
node --test tests/local-integration.test.mjs
```

Note: pre-D1 validator chain may fail on `returns.js` if rolled back to known-bug behavior — that is expected when intentionally reverting D1 fixes.

### Step D — Redeploy

Redeploy Cloudflare Pages from the reverted branch. No Supabase steps.

---

## 3. Data considerations

D1 does not alter schema. Rollback does **not** require SQL.

**In-flight data after rollback:**

- Return requests created under D1 stricter rules remain valid records.
- Refund records completed with `provider_reference` under D1 remain valid.
- Idempotent duplicate completions that returned `{ idempotent: true }` did not create duplicate rows — nothing to clean up.

**If rollback happens mid-incident:**

- Manually verify any refund marked `completed` during D1 has a `provider_reference` populated (D1 enforces this going forward; pre-D1 records may lack it).

---

## 4. Rollback verification checklist

- [ ] Customer can submit returns on pre-D1 rules (note: pre-D1 had known gaps — only rollback if D1 caused worse regression)
- [ ] Admin refund flow works for ops team
- [ ] Bank transfer approve/reject unchanged (B1/B2 smoke)
- [ ] Email audit types unchanged (B2E smoke)
- [ ] Admin login / RBAC unchanged (A1F smoke)
- [ ] Return attachment upload/preview unchanged (H1/H2 smoke)

---

## 5. Re-apply

If rollback was precautionary and root cause was ops/training (e.g. missing `provider_reference`), re-deploy D1 after fix rather than staying on pre-D1 buggy eligibility logic.

See `COSMOSKIN_D1_RETURNS_REFUNDS_CORRECTNESS_RUNBOOK_20260706.md` for re-deploy verification.
