# COSMOSKIN — A1.1 Admin RBAC Hardening — Rollback Plan

**Date:** 2026-07-04

## Why rollback is low-risk here

Both changes in this batch are small, single-file, additive-in-spirit diffs with **no schema change, no migration, no data write of any kind**. No `admin_users` or `admin_permissions` row is created, deleted, or modified by this batch — the two seeded owner rows are read-only inputs to this change, never touched by it. This means rollback is a pure code revert: there is no data cleanup step, no migration to reverse, and no risk of leaving the database in an inconsistent state.

---

## Scenario 1 — Owner (or any previously-working caller) gets an unexpected 403 on one of the 9 gated endpoints after deploy

**Most likely cause:** Cloudflare Access is not actually injecting `Cf-Access-Authenticated-User-Email` in production (the one precondition this batch could not verify from code).

**Fastest safe mitigation — revert only the core flip, one line:**

```javascript
// functions/api/_lib/admin-audit.js, inside hasAdminPermission()
// Revert:
if (!admin) return false;
// Back to:
if (!admin) return true; // TEMPORARY ROLLBACK — see COSMOSKIN_A1_ADMIN_RBAC_HARDENING_ROLLBACK_PLAN_20260704.md
```

This restores the exact pre-A1.1 behavior for all 9 gated endpoints in one line, deployable as an immediate hotfix commit. It does not require reverting the `admin/users.js` change (§ Scenario 2) unless that is also implicated — the two fixes are independent and can be rolled back separately.

**After this rollback:** immediately follow up with the Cloudflare Access confirmation steps in `COSMOSKIN_A1_ADMIN_RBAC_HARDENING_RUNBOOK_20260704.md` §1 before attempting to re-deploy the fix.

---

## Scenario 2 — Owner cannot manage admin users (`/api/admin/users` POST/PATCH returns 403 for the owner)

**Most likely cause:** the owner's `Cf-Access-Authenticated-User-Email` header isn't resolving to the seeded owner row for this specific request (same root cause class as Scenario 1), or the seeded owner row's `permissions`/`role_code` has drifted from `['*']`/`'owner'`.

**Fastest safe mitigation — revert only the `admin/users.js` gate, two lines:**

```javascript
// functions/api/admin/users.js
// Remove this line from onRequestPost:
await requireAdminPermission(context, MANAGE_ADMINS_PERMISSION);
// Remove the identical line from onRequestPatch.
```

This restores admin user management to its pre-A1.1 `assertAdmin()`-only gate, independent of whether Scenario 1's core flip is rolled back or kept. Re-add the import removal is optional (an unused import is harmless, but can be cleaned up in the same commit for tidiness).

---

## Scenario 3 — Full revert (both changes)

If it's unclear which of the two changes is implicated, or if a fast, complete revert is preferred over diagnosing which scenario applies:

```bash
git revert <A1.1-commit-sha>
```

or, if the two files were changed as part of a larger commit, restore the two files individually from the pre-A1.1 commit:

```bash
git checkout <pre-A1.1-commit-sha> -- functions/api/_lib/admin-audit.js functions/api/admin/users.js
```

Either approach is a clean, complete, data-free rollback. Redeploy immediately after.

---

## What rollback does NOT need to touch

- No `supabase/migrations/*.sql` file was added by this batch — there is nothing to reverse in the database.
- No `admin_users` or `admin_permissions` row was written by this batch — the two seeded owner rows are exactly as they were before this deploy, whether or not the code is rolled back.
- `functions/api/_lib/admin.js` (session/token layer) was never modified by this batch — no rollback needed there under any scenario.
- The three validator files that had their `forbiddenPaths` lists adjusted (`validate-h0-live-payment-rpc-hotfix.mjs`, `validate-h1-return-attachment-storage-rls.mjs`, `validate-h2-return-attachment-preview.mjs`) do not need to be reverted even if the core code change is rolled back — the adjustment only permits `functions/api/_lib/admin-audit.js` to be a legitimately-modified file going forward; it doesn't assert anything about the file's current contents beyond what `validate-a1-admin-rbac-hardening.mjs` itself checks.

## Verification after any rollback

Run the same validator/test chain used for the original implementation to confirm the rollback itself didn't introduce a new regression:

```bash
node --check functions/api/_lib/admin-audit.js
node --check functions/api/admin/users.js
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

Note: `scripts/validate-a1-admin-rbac-hardening.mjs` itself will correctly **fail** after a rollback to the pre-A1.1 allow-all behavior (that is its intended purpose — it is a regression guard for the fix, not a rollback-compatibility check). A failing `validate-a1-admin-rbac-hardening.mjs` after an intentional rollback is expected and should not block the rollback deploy; it is a signal to re-apply the fix once the Cloudflare Access precondition is confirmed.
