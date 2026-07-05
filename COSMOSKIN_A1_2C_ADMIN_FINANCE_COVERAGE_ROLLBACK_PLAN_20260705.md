# COSMOSKIN — A1.2c Admin Finance Coverage — Rollback Plan

**Date:** 2026-07-05

## Why rollback is low-risk here

Every change in this batch is a strictly additive one- or two-line diff per handler (one new `import { requireAdminPermission } from '../_lib/admin-audit.js';` line per file, plus one `requireAdminPermission(...)` call line per handler) across 3 route files / 8 handlers, plus scope-guard updates in three validator scripts (`validate-a1-admin-rbac-hardening.mjs`, `validate-h2-return-attachment-preview.mjs`, `validate-h0-live-payment-rpc-hotfix.mjs`) and a rewrite of `validate-a1-admin-endpoint-coverage.mjs` to also cover this batch. **No schema change, no migration, no data write of any kind.** No `admin_users` or `admin_permissions` row is created, deleted, or modified. No refund/invoice/bank-account business logic, SQL query, validation rule, or side effect (loyalty reversal, refund-completion email, `order_status_events` audit insert) was altered — only the new permission guard was inserted. Rollback is a pure code revert — there is no data cleanup step and no risk of an inconsistent database state.

---

## Scenario 1 — Owner (or a previously-working non-owner admin) gets an unexpected 403 on one of the 8 newly-gated finance handlers after deploy

**Most likely causes, in order of likelihood:**
1. The A1.1/A1.2a/A1.2b Cloudflare Access precondition was not actually verified/is not actually working (same root cause class as every prior batch's Scenario 1) — affects the owner too, and now affects the finance surface specifically.
2. A non-owner admin relies on `bank_accounts:manage` — the brand-new, unseeded permission string introduced in this batch — and no `admin_permissions` seed row was added for their role before deploy (see runbook §1 Step 2).
3. Less likely, but possible: a non-owner admin relies on `refunds:update` or `invoices:read`/`invoices:update` but their seeded role does not actually carry that string (verify against `supabase/migrations/20260626_production_launch_readiness.sql`'s `admin_permissions` seed before assuming this is the cause, since these three strings are already seeded to `operations`/`accountant`).

**Fastest safe mitigation for causes 2/3 (no code change, no rollback needed):** seed the missing `admin_permissions` row for the affected role, e.g.:
```sql
INSERT INTO admin_permissions (role_code, permission)
VALUES ('accountant', 'bank_accounts:manage')
ON CONFLICT DO NOTHING;
```
This is a data-only fix and does not require touching any code from this batch. Given `bank_accounts:manage`'s fraud sensitivity, confirm the target role is actually appropriate before seeding — do not seed it broadly "just to unblock" without a deliberate decision.

**Fastest safe mitigation for cause 1, or if cause is unclear — revert one handler's gate:**
```javascript
// e.g. functions/api/admin/refunds.js, inside onRequestPost, remove only this line:
await requireAdminPermission(context, 'refunds:update');
```
Repeat for whichever specific handler(s) are affected. This restores that single handler to its pre-A1.2c `assertAdmin()`-only behavior without touching the other 7.

---

## Scenario 2 — Full rollback of all 8 finance handlers

If it's unclear which specific handler(s) are implicated, a Cloudflare Access failure is confirmed and will take longer to fix than the deploy window allows, or a fast complete revert is preferred over per-handler diagnosis:

```bash
git checkout <pre-A1.2c-commit-sha> -- \
  functions/api/admin/refunds.js \
  functions/api/admin/invoices.js \
  functions/api/admin/bank-accounts.js
```

or, if this batch was committed as its own commit:
```bash
git revert <A1.2c-commit-sha>
```

**Important:** unlike several A1.2b files, none of these three files carry a permission gate from any earlier batch — A1.2a and A1.2b deliberately left all three fully untouched. A `git checkout <pre-A1.2c-commit-sha>` (or a full revert) for these three files is therefore a clean, complete restoration to their pre-A1.2 state with no risk of accidentally reverting an unrelated batch's change in the same file.

Either approach is a clean, complete, data-free rollback of the 3 route files' A1.2c changes. Redeploy immediately after.

**Note on the validator scripts** (`validate-a1-admin-rbac-hardening.mjs`, `validate-h2-return-attachment-preview.mjs`, `validate-h0-live-payment-rpc-hotfix.mjs`) whose deferred-file/`forbiddenPaths` lists were updated to permit these 3 previously-deferred files to legitimately change: these do **not** need to be reverted even if the route files above are rolled back. The list adjustment only *permits* those files to differ from a stale baseline going forward — it doesn't assert anything about their current contents. If you revert the route files to their pre-A1.2c state, the validators will simply see a zero (or reduced) diff on those paths and continue to pass, same as before this batch.

---

## What rollback does NOT need to touch

- No `supabase/migrations/*.sql` file was added by this batch — nothing to reverse in the database.
- No `admin_users` or `admin_permissions` row was written by this batch.
- `functions/api/_lib/admin-audit.js` (RBAC core helper) and `functions/api/admin/users.js` were **not modified** by A1.2c at all (their existing diff is entirely A1.1's, already reported and already rollback-covered by `COSMOSKIN_A1_ADMIN_RBAC_HARDENING_ROLLBACK_PLAN_20260704.md`) — no action needed here under any A1.2c rollback scenario.
- `functions/api/_lib/admin.js` (session/token layer) and `functions/api/_lib/bank-accounts.js` (IBAN validation helper) were never modified — no rollback needed.
- A1.2a's 13 GET/read handlers and A1.2b's 16 mutation handlers are entirely unaffected by an A1.2c-only rollback — none of those files were touched by this batch.
- The two escape-hatch files (`admin/dashboard.js`, `admin/inventory/health.js`) and `admin/session.js` were never modified by this batch — no rollback needed there under any scenario.

---

## Verification after any rollback

```bash
node --check functions/api/admin/refunds.js
node --check functions/api/admin/invoices.js
node --check functions/api/admin/bank-accounts.js
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

Note: after a full or partial rollback of a given finance handler, `scripts/validate-a1-admin-endpoint-coverage.mjs` will correctly **fail** for that handler (missing `requireAdminPermission(...)` call) — that is its intended purpose as a regression guard for the fix, not a rollback-compatibility check. A failing validator immediately after an intentional, deliberate rollback is expected; treat it as a reminder to re-apply the fix once the underlying cause (Cloudflare Access, or a missing `admin_permissions` seed row) is resolved, rather than as a new bug. If only some of the 8 handlers were rolled back, expect the validator to report failures only for those specific handlers.

Also note the integration tests added for A1.2c (`tests/local-integration.test.mjs`) will fail for any handler that was rolled back, for the same reason — this is expected and should be treated the same way. A1.2a's and A1.2b's own tests are unaffected by an A1.2c-only rollback, since they exercise different files entirely.
