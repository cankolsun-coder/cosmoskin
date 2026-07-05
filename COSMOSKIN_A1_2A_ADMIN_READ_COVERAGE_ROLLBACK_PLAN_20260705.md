# COSMOSKIN — A1.2a Admin GET/Read Endpoint Coverage — Rollback Plan

**Date:** 2026-07-05

## Why rollback is low-risk here

Every change in this batch is a strictly additive two-line diff per file (one import line, one `requireAdminPermission(...)` call line) across 13 route files, plus forbidden-path-list comment/entry updates in four validator scripts. **No schema change, no migration, no data write of any kind.** No `admin_users` or `admin_permissions` row is created, deleted, or modified. Rollback is a pure code revert — there is no data cleanup step and no risk of an inconsistent database state.

---

## Scenario 1 — Owner (or a previously-working non-owner admin) gets an unexpected 403 on one of the 13 newly-gated endpoints after deploy

**Most likely causes, in order of likelihood:**
1. The A1.1 Cloudflare Access precondition was not actually verified/is not actually working (same root cause class as A1.1's own Scenario 1) — affects the owner too.
2. A non-owner admin relies on one of the 8 brand-new, unseeded permission strings (`returns:read`, `products:read`, `lots:read`, `suppliers:read`, `compliance:read`, `coupons:read`, `shipments:read`, `email_logs:read`) and no `admin_permissions` seed row was added for their role before deploy (see runbook §1 Step 2).

**Fastest safe mitigation for cause 2 (no code change, no rollback needed):** seed the missing `admin_permissions` row for the affected role, e.g.:
```sql
INSERT INTO admin_permissions (role_code, permission)
VALUES ('customer_support', 'returns:read')
ON CONFLICT DO NOTHING;
```
This is a data-only fix and does not require touching any code from this batch.

**Fastest safe mitigation for cause 1, or if cause is unclear — revert one endpoint's gate:**
```javascript
// e.g. functions/api/admin/orders.js, inside onRequestGet, remove only this line:
await requireAdminPermission(context, 'orders:read');
```
Repeat for whichever specific endpoint(s) are affected. This restores that single endpoint to its pre-A1.2a `assertAdmin()`-only behavior without touching the other 12.

---

## Scenario 2 — Full rollback of all 13 endpoints

If it's unclear which specific endpoint(s) are implicated, or a fast complete revert is preferred over per-endpoint diagnosis:

```bash
git checkout <pre-A1.2a-commit-sha> -- \
  functions/api/admin/orders.js \
  "functions/api/admin/orders/[id].js" \
  functions/api/admin/returns.js \
  functions/api/admin/customers.js \
  functions/api/admin/products.js \
  functions/api/admin/inventory.js \
  "functions/api/admin/inventory/[slug]/movements.js" \
  functions/api/admin/lots.js \
  functions/api/admin/suppliers.js \
  functions/api/admin/compliance.js \
  functions/api/admin/coupons/index.js \
  functions/api/admin/shipments.js \
  functions/api/admin/email-logs.js
```

or, if this batch was committed as its own commit:
```bash
git revert <A1.2a-commit-sha>
```

Either approach is a clean, complete, data-free rollback of the 13 route files. Redeploy immediately after.

**Note on the four validator scripts** (`validate-h0-live-payment-rpc-hotfix.mjs`, `validate-h1-return-attachment-storage-rls.mjs`, `validate-h2-return-attachment-preview.mjs`, `validate-a1-admin-rbac-hardening.mjs`) whose `forbiddenPaths`/deferred-file lists were updated to permit `admin/returns.js` and `admin/orders.js` to legitimately change: these do **not** need to be reverted even if the route files above are rolled back. The list adjustment only *permits* those two files to differ from a stale baseline going forward — it doesn't assert anything about their current contents. If you do revert the route files to their pre-A1.2a state, the validators will simply see a zero (or reduced) diff on those paths and continue to pass, same as before this batch.

---

## What rollback does NOT need to touch

- No `supabase/migrations/*.sql` file was added by this batch — nothing to reverse in the database.
- No `admin_users` or `admin_permissions` row was written by this batch.
- `functions/api/_lib/admin-audit.js` (RBAC core helper) and `functions/api/admin/users.js` were **not modified** by A1.2a at all (their existing diff is entirely A1.1's, already reported and already rollback-covered by `COSMOSKIN_A1_ADMIN_RBAC_HARDENING_ROLLBACK_PLAN_20260704.md`) — no action needed here under any A1.2a rollback scenario.
- `functions/api/_lib/admin.js` (session/token layer) was never modified — no rollback needed.
- All A1.2b/A1.2c-scoped files (`admin/refunds.js`, `admin/invoices.js`, `admin/bank-accounts.js`, all mutation handlers) and the two escape-hatch files (`admin/dashboard.js`, `admin/inventory/health.js`) were never modified by this batch — no rollback needed there under any scenario.

---

## Verification after any rollback

```bash
node --check functions/api/_lib/admin-audit.js
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

Note: after a full rollback of a given endpoint, `scripts/validate-a1-admin-endpoint-coverage.mjs` will correctly **fail** for that endpoint (missing `requireAdminPermission(...)` call) — that is its intended purpose as a regression guard for the fix, not a rollback-compatibility check. A failing `validate-a1-admin-endpoint-coverage.mjs` immediately after an intentional, deliberate rollback is expected; treat it as a reminder to re-apply the fix once the underlying cause (Cloudflare Access, or a missing `admin_permissions` seed row) is resolved, rather than as a new bug. If only some of the 13 endpoints were rolled back, expect the validator to report failures only for those specific files.

Also note the integration tests added for A1.2a (`tests/local-integration.test.mjs`) will fail for any endpoint that was rolled back, for the same reason — this is expected and should be treated the same way.
