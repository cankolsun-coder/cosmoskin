# COSMOSKIN — A1.2b Admin Mutation Endpoint Coverage — Rollback Plan

**Date:** 2026-07-05

## Why rollback is low-risk here

Every change in this batch is a strictly additive one- or two-line diff per handler (an import line where not already present, plus one `requireAdminPermission(...)` call line) across 12 route files / 16 handlers, plus scope-guard updates in two validator scripts (`validate-a1-admin-rbac-hardening.mjs`, `validate-h2-return-attachment-preview.mjs`) and a rewrite of `validate-a1-admin-endpoint-coverage.mjs` to also cover this batch. **No schema change, no migration, no data write of any kind.** No `admin_users` or `admin_permissions` row is created, deleted, or modified. No business logic, SQL query, validation rule, or side effect (email/inventory/loyalty) was altered — only the new permission guard was inserted. Rollback is a pure code revert — there is no data cleanup step and no risk of an inconsistent database state.

---

## Scenario 1 — Owner (or a previously-working non-owner admin) gets an unexpected 403 on one of the 16 newly-gated mutation handlers after deploy

**Most likely causes, in order of likelihood:**
1. The A1.1/A1.2a Cloudflare Access precondition was not actually verified/is not actually working (same root cause class as A1.1's own Scenario 1 and A1.2a's Scenario 1) — affects the owner too, and now affects writes, not just reads.
2. A non-owner admin relies on `suppliers:manage` or `coupons:manage` — the two brand-new, unseeded permission strings introduced in this batch — and no `admin_permissions` seed row was added for their role before deploy (see runbook §1 Step 2).
3. Less likely, but possible: a non-owner admin relies on `orders:update`, `returns:update`, `inventory:adjust`, `products:update`, or `shipments:create` but their seeded role does not actually carry that string (verify against `supabase/migrations/20260626_production_launch_readiness.sql`'s `admin_permissions` seed before assuming this is the cause, since these five strings are mostly already seeded to `operations`/`warehouse`/`content_editor`).

**Fastest safe mitigation for causes 2/3 (no code change, no rollback needed):** seed the missing `admin_permissions` row for the affected role, e.g.:
```sql
INSERT INTO admin_permissions (role_code, permission)
VALUES ('operations', 'coupons:manage')
ON CONFLICT DO NOTHING;
```
This is a data-only fix and does not require touching any code from this batch.

**Fastest safe mitigation for cause 1, or if cause is unclear — revert one handler's gate:**
```javascript
// e.g. functions/api/admin/orders.js, inside onRequestPatch, remove only this line:
await requireAdminPermission(context, 'orders:update');
```
Repeat for whichever specific handler(s) are affected. This restores that single mutation handler to its pre-A1.2b `assertAdmin()`-only behavior without touching the other 15, and without touching that same file's A1.2a read gate (if it has one).

---

## Scenario 2 — Full rollback of all 16 mutation handlers

If it's unclear which specific handler(s) are implicated, a Cloudflare Access failure is confirmed and will take longer to fix than the deploy window allows, or a fast complete revert is preferred over per-handler diagnosis:

```bash
git checkout <pre-A1.2b-commit-sha> -- \
  functions/api/admin/orders.js \
  "functions/api/admin/orders/[id]/status.js" \
  "functions/api/admin/orders/[id]/emails.js" \
  "functions/api/admin/orders/[id]/shipments.js" \
  functions/api/admin/returns.js \
  functions/api/admin/products.js \
  "functions/api/admin/inventory/adjust.js" \
  "functions/api/admin/inventory/[slug].js" \
  functions/api/admin/lots.js \
  functions/api/admin/suppliers.js \
  functions/api/admin/compliance.js \
  functions/api/admin/coupons/index.js
```

or, if this batch was committed as its own commit:
```bash
git revert <A1.2b-commit-sha>
```

**Important:** because several of these files (`orders.js`, `returns.js`, `products.js`, `lots.js`, `suppliers.js`, `compliance.js`, `coupons/index.js`) also carry their **A1.2a read-gate** change in the same file, a naive `git checkout <pre-A1.2b-sha>` will correctly preserve the A1.2a GET gate as long as `<pre-A1.2b-commit-sha>` is a commit taken **after** A1.2a landed but **before** A1.2b's changes were added — it will NOT accidentally also revert A1.2a. If A1.2a and A1.2b were never committed as separate commits (e.g. both are still uncommitted working-tree changes at rollback time), use the per-handler line removal from Scenario 1 instead, repeated for each of the 16 handlers, to avoid losing the A1.2a read gates in the same files.

Either approach is a clean, complete, data-free rollback of the 12 route files' A1.2b changes. Redeploy immediately after.

**Note on the validator scripts** (`validate-a1-admin-rbac-hardening.mjs`, `validate-h2-return-attachment-preview.mjs`) whose deferred-file/`forbiddenPaths` lists were updated to permit the 5 previously-deferred files (`orders/[id]/status.js`, `orders/[id]/emails.js`, `orders/[id]/shipments.js`, `inventory/adjust.js`, `inventory/[slug].js`) to legitimately change: these do **not** need to be reverted even if the route files above are rolled back. The list adjustment only *permits* those files to differ from a stale baseline going forward — it doesn't assert anything about their current contents. If you revert the route files to their pre-A1.2b state, the validators will simply see a zero (or reduced) diff on those paths and continue to pass, same as before this batch.

---

## What rollback does NOT need to touch

- No `supabase/migrations/*.sql` file was added by this batch — nothing to reverse in the database.
- No `admin_users` or `admin_permissions` row was written by this batch.
- `functions/api/_lib/admin-audit.js` (RBAC core helper) and `functions/api/admin/users.js` were **not modified** by A1.2b at all (their existing diff is entirely A1.1's, already reported and already rollback-covered by `COSMOSKIN_A1_ADMIN_RBAC_HARDENING_ROLLBACK_PLAN_20260704.md`) — no action needed here under any A1.2b rollback scenario.
- `functions/api/_lib/admin.js` (session/token layer) was never modified — no rollback needed.
- A1.2a's 13 GET/read handlers are unaffected by an A1.2b-only rollback (per-handler line removal touches only the mutation handler in each shared file).
- A1.2c-scoped files (`admin/refunds.js`, `admin/invoices.js`, `admin/bank-accounts.js`) and the two escape-hatch files (`admin/dashboard.js`, `admin/inventory/health.js`) and `admin/session.js` were never modified by this batch — no rollback needed there under any scenario.

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

Note: after a full or partial rollback of a given mutation handler, `scripts/validate-a1-admin-endpoint-coverage.mjs` will correctly **fail** for that handler (missing `requireAdminPermission(...)` call) — that is its intended purpose as a regression guard for the fix, not a rollback-compatibility check. A failing validator immediately after an intentional, deliberate rollback is expected; treat it as a reminder to re-apply the fix once the underlying cause (Cloudflare Access, or a missing `admin_permissions` seed row) is resolved, rather than as a new bug. If only some of the 16 handlers were rolled back, expect the validator to report failures only for those specific handlers.

Also note the integration tests added for A1.2b (`tests/local-integration.test.mjs`) will fail for any handler that was rolled back, for the same reason — this is expected and should be treated the same way. A1.2a's own tests are unaffected by an A1.2b-only rollback, since they exercise the GET handlers, not the mutation handlers this batch touches.
