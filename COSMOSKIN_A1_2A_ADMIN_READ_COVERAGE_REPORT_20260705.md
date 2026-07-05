# COSMOSKIN — A1.2a: Admin GET/Read Endpoint Permission Coverage — Report

**Date:** 2026-07-05
**Batch:** A1.2a only (admin GET/read endpoint permission coverage)
**Source of truth used:** `COSMOSKIN_A1_2_ADMIN_ENDPOINT_COVERAGE_PLAN_20260705.md`
**Status:** Implemented in code. **Not deployed.** See production warning at the bottom.

---

## 1. Summary

A1.1 (2026-07-04) made `hasAdminPermission()` deny-by-default and protected `admin/users.js`, but left every other `functions/api/admin/**` route gated only by `assertAdmin()` (the shared `ADMIN_TOKEN`/signed-session check — proves "this caller holds the admin secret," not "this specific admin is authorized for this specific resource").

A1.2a closes that gap for the **13 lowest-risk, GET/read-only admin endpoints** identified in the A1.2 plan. Each now requires a real `admin_users`-backed permission, on top of (not instead of) the existing `assertAdmin()` gate. Mutation endpoints, finance/refund/bank-account endpoints, and the two deliberate diagnostic escape-hatch routes were explicitly left untouched, per the approved plan and this batch's instructions.

---

## 2. Every endpoint protected, and the exact permission string added

| # | File | Handler | Permission added |
|---|---|---|---|
| 1 | `functions/api/admin/orders.js` | `onRequestGet` | `orders:read` |
| 2 | `functions/api/admin/orders/[id].js` | `onRequestGet` | `orders:read` |
| 3 | `functions/api/admin/returns.js` | `onRequestGet` | `returns:read` |
| 4 | `functions/api/admin/customers.js` | `onRequestGet` | `customers:read` |
| 5 | `functions/api/admin/products.js` | `onRequestGet` | `products:read` |
| 6 | `functions/api/admin/inventory.js` | `onRequestGet` | `inventory:read` |
| 7 | `functions/api/admin/inventory/[slug]/movements.js` | `onRequestGet` | `inventory:read` |
| 8 | `functions/api/admin/lots.js` | `onRequestGet` | `lots:read` |
| 9 | `functions/api/admin/suppliers.js` | `onRequestGet` | `suppliers:read` |
| 10 | `functions/api/admin/compliance.js` | `onRequestGet` | `compliance:read` |
| 11 | `functions/api/admin/coupons/index.js` | `onRequestGet` | `coupons:read` |
| 12 | `functions/api/admin/shipments.js` | `onRequestGet` | `shipments:read` |
| 13 | `functions/api/admin/email-logs.js` | `onRequestGet` | `email_logs:read` |

For every file above, the change was strictly:
```js
import { requireAdminPermission } from '../_lib/admin-audit.js'; // (or '../../_lib/...' / '../../../_lib/...' by depth)
```
plus, inside `onRequestGet`, immediately after the existing `await assertAdmin(context);`:
```js
await requireAdminPermission(context, '<permission-from-table-above>');
```
No response shape, query parameter, Supabase table/column, or business-logic line was changed in any of the 13 files. This is enforced structurally by the new validator (see §5) and confirmed by a byte-diff check that strips only the new import/call and asserts the remainder is identical to the pre-batch (`git show HEAD`) copy of each file.

### Permission naming

All 13 strings are plain `resource:read` colon-notation, consistent with the pre-existing seed in `supabase/migrations/20260626_production_launch_readiness.sql` (`admin_permissions`/`admin_roles`). Three of them (`orders:read`, `customers:read`, `inventory:read`) already exist in the seeded role matrix (`operations`, `warehouse`, `customer_support`, `accountant` roles already have some of these). The other eight (`returns:read`, `products:read`, `lots:read`, `suppliers:read`, `compliance:read`, `coupons:read`, `shipments:read`, `email_logs:read`) are new strings but follow the identical naming convention — **no dot-notation scheme was introduced** (the validator enforces this; see §5). No `admin_permissions`/`admin_roles` seed rows were added or changed for the new strings — until a role is explicitly granted one of the eight new strings (or `'*'`), only the owner (`role_code='owner'` or `permissions` containing `'*'`) can pass those specific checks. This is intentional and matches the plan: A1.2a's job is to add the *code-level* gate; seeding non-owner roles for the new strings is a separate, explicit follow-up decision (not part of this batch, no SQL was run).

---

## 3. Endpoints intentionally left `assertAdmin()`-only

**A1.2b (mutation) — deferred, not started:**
- `admin/orders.js` `onRequestPatch`, `admin/orders/[id]/status.js`, `admin/orders/[id]/emails.js`, `admin/orders/[id]/shipments.js`
- `admin/returns.js` `onRequestPatch`
- `admin/products.js` `onRequestPatch`/`onRequestPost`
- `admin/inventory/adjust.js`, `admin/inventory/[slug].js`
- `admin/lots.js` `onRequestPost`/`onRequestPatch`
- `admin/suppliers.js` `onRequestPost`/`onRequestPatch`
- `admin/compliance.js` `onRequestPatch`
- `admin/coupons/index.js` `onRequestPost`/`onRequestPatch`

**A1.2c (finance/refund/bank-account) — deferred, not started:**
- `admin/refunds.js`, `admin/invoices.js`, `admin/bank-accounts.js`

**Deliberate, permanent escape hatch (per this batch's explicit instructions):**
- `admin/dashboard.js` — diagnostic/aggregate, no PII, no writes
- `admin/inventory/health.js` — diagnostic, no PII, no writes

Both escape-hatch routes remain `assertAdmin()`-only by design so that if the Cloudflare Access → `admin_users` identity chain ever breaks in production, the owner still has *some* working admin signal instead of a fully bricked panel. See `COSMOSKIN_PROJECT_MEMORY.md` for the rationale, made explicit there for future batches.

---

## 4. Proof no mutation/finance endpoint was touched

Three independent layers of proof, all currently green:

1. **Static analysis (new validator, `scripts/validate-a1-admin-endpoint-coverage.mjs`):**
   - Isolates every mutation handler co-located in a file that also got a GET gate (`orders.js` PATCH, `returns.js` PATCH, `products.js` PATCH/POST, `lots.js` POST/PATCH, `suppliers.js` POST/PATCH, `compliance.js` PATCH, `coupons/index.js` POST/PATCH) and asserts each still calls `assertAdmin(context)` and does **not** contain `requireAdminPermission(`.
   - Asserts zero `requireAdminPermission(` calls appear anywhere in `admin/refunds.js`, `admin/invoices.js`, `admin/bank-accounts.js`, or the remaining A1.2b-only files (`orders/[id]/status.js`, `orders/[id]/emails.js`, `orders/[id]/shipments.js`, `inventory/adjust.js`, `inventory/[slug].js`).
   - Asserts `admin/dashboard.js` and `admin/inventory/health.js` still call `assertAdmin(context)`, still have zero `requireAdminPermission(` calls, and are not flipped `public: true`.
   - `git diff --name-only HEAD` is empty for all of the above files (a genuine zero-diff check, since none of them carry a pre-existing uncommitted diff from an earlier batch).
2. **Integration tests (`tests/local-integration.test.mjs`):** `A1.2a: mutation handlers sharing a file with a newly-gated GET stay ungated...` and `A1.2a: finance/refund/bank-account endpoints and the deliberate escape-hatch routes remain untouched` — both read the live file source and assert the same invariants behaviorally.
3. **Manual scope confirmation:** `git status --porcelain` (below) shows only the 13 GET-gated route files, 4 validator scripts (updated forbidden-path lists only), `COSMOSKIN_PROJECT_MEMORY.md`, and `tests/local-integration.test.mjs` as modified. No `supabase/migrations/*.sql` file was created or touched.

```
 M COSMOSKIN_PROJECT_MEMORY.md
 M functions/api/admin/compliance.js
 M functions/api/admin/coupons/index.js
 M functions/api/admin/customers.js
 M functions/api/admin/email-logs.js
 M functions/api/admin/inventory.js
 M functions/api/admin/inventory/[slug]/movements.js
 M functions/api/admin/lots.js
 M functions/api/admin/orders.js
 M functions/api/admin/orders/[id].js
 M functions/api/admin/products.js
 M functions/api/admin/returns.js
 M functions/api/admin/shipments.js
 M functions/api/admin/suppliers.js
 M scripts/validate-h0-live-payment-rpc-hotfix.mjs
 M scripts/validate-h1-return-attachment-storage-rls.mjs
 M scripts/validate-h2-return-attachment-preview.mjs
 M tests/local-integration.test.mjs
?? scripts/validate-a1-admin-endpoint-coverage.mjs
?? COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_*.{md,txt}
```
(`functions/api/_lib/admin-audit.js` and `functions/api/admin/users.js` also show as modified in a full repo `git status`, but that is A1.1's pre-existing, already-reported diff — A1.2a made zero additional changes to either file.)

---

## 5. Validator: `scripts/validate-a1-admin-endpoint-coverage.mjs` (new)

Fails if any of the following is true:
- Any of the 13 target GET handlers is missing `assertAdmin(context)`, missing `requireAdminPermission(context, '<exact string>')`, or calls it before `assertAdmin`.
- A co-located mutation handler in one of those same 13 files lost `assertAdmin(context)` or gained `requireAdminPermission(`.
- Any A1.2b/A1.2c-scoped file (mutation or finance/refund/bank-account) gained a `requireAdminPermission(` call.
- `admin/dashboard.js` or `admin/inventory/health.js` lost `assertAdmin(context)`, gained a permission check, or was flipped `public: true`.
- Any change beyond the added import + `requireAdminPermission(...)` call is detected in any of the 13 gated files (byte-diff against the pre-batch `git show HEAD` copy, with only the permission-check scaffolding stripped from both sides).
- A new dot-notation permission string (anything matching `admin.<x>.<y>`) is introduced anywhere in `functions/api/**`, other than the pre-existing `admin.users.manage`.
- A1.1's deny-by-default invariants (`if (!admin) return false`, inactive/disabled denial, owner wildcard) regress in `functions/api/_lib/admin-audit.js`.
- Any forbidden checkout/payment/returns-customer-flow/storage/loyalty/coupons-mutation/order-cancellation/Cloudflare-config file is modified, or a migration is added.
- Any of the chained prior validators (A1.1, H0, H1, H2, Batch 1/3/4/UI-polish) fails.

The validator was sanity-tested three times during implementation by deliberately reintroducing a regression and confirming it fails, then restoring the fix and confirming it passes again:
1. Removed the `requireAdminPermission('orders:read')` call from `orders.js` → validator correctly failed (missing gate + byte-diff drift), then passed again once restored.
2. Added a `requireAdminPermission('orders:update')` call to `orders.js`'s `onRequestPatch` (mutation handler) → validator correctly failed (scope violation + unexpected permission string), then passed again once reverted.
3. Changed `orders.js`'s GET permission string to a dot-notation `'admin.orders.read'` → validator correctly failed (wrong string + new dot-notation scheme detected), then passed again once reverted.

---

## 6. Test results

All required checks were run in the order requested, in a clean, current working tree (no deploy):

```
node --check functions/api/_lib/admin-audit.js                     → OK
node scripts/validate-a1-admin-rbac-hardening.mjs                  → PASSED
node scripts/validate-a1-admin-endpoint-coverage.mjs                → PASSED
node scripts/validate-h2-return-attachment-preview.mjs             → PASSED
node scripts/validate-h1-return-attachment-storage-rls.mjs         → PASSED
node scripts/validate-h0-live-payment-rpc-hotfix.mjs               → PASSED
node scripts/validate-account-batch-1-safe-fixes.mjs               → PASSED
node scripts/validate-account-batch-3-order-cancellation.mjs       → PASSED
node scripts/validate-account-batch-4-loyalty-ledger.mjs           → PASSED
node scripts/validate-account-ui-polish.mjs                        → PASSED
node scripts/validate-production-launch-readiness.mjs              → PASSED (19 critical pages, 37 product pages, 29 migrations)
node --test tests/local-integration.test.mjs                       → 31/31 PASSED, 0 failed
```

New tests added in this batch (6, all passing): a shared parametrized helper exercises all 13 gated endpoints for (a) 403 on no-matching-`admin_users`-row and (b) owner `['*']` pass-through, plus dedicated tests for inactive/disabled-admin denial, cross-permission denial (a `warehouse`-role caller holding only `inventory:read` cannot pass `returns:read`), and the two "nothing outside scope was touched" proof tests described in §4.

---

## 7. Files changed / created

See `COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_CHANGED_FILES_20260705.txt` for the complete, categorized list.

---

## 8. Production deploy warning (critical)

**Do not deploy A1.2a to production until the A1.1 Cloudflare Access verification is complete.** This batch adds *more* endpoints that depend on the exact same precondition A1.1 already flagged as unverified from the repository:

- [ ] Confirm the Cloudflare Access application actually protects `/account*/*` admin routes (or whatever path the admin panel is served from) in the production zone.
- [ ] Confirm `Cf-Access-Authenticated-User-Email` is present on real admin requests in production (check via a live request/log, not just Access policy config).
- [ ] Confirm the current owner email(s) — `cankolsun@gmail.com` and `cankolsun@cosmoskin.com.tr` — map to an `admin_users` row with `role_code='owner'`, `permissions=['*']`, `is_active=true`.
- [ ] After deploy, confirm the owner can still load every one of the 13 newly-gated pages/panels (Orders, Order detail, Returns, Customers, Products, Inventory, Inventory movements, Lots, Suppliers, Compliance, Coupons, Shipments, Email logs) without a 403.
- [ ] Confirm a non-owner admin session (if any exist in production) still works for whatever it was working for before — a non-owner with no `orders:read`/etc. permission and no matching `admin_permissions` seed row **will now be 403'd** on these 13 endpoints where it previously was not. If any non-owner admin currently relies on these pages, seed the appropriate `admin_permissions` rows for their role **before** deploying (this is a data change, not a code change, and is outside this batch's scope — flag it as a pre-deploy step, not a rollback trigger).
- [ ] Keep the rollback plan (`COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_ROLLBACK_PLAN_20260705.md`) ready before deploying.

If Cloudflare Access is not yet confirmed, deploying this batch will 403 the owner out of 13 more admin pages than A1.1 alone did — do not proceed until the checklist above is verified.

---

## 9. Stop condition

A1.2a is complete. A1.2b (mutation endpoints) and A1.2c (finance/refund/bank-account endpoints) were explicitly **not** started, per instructions. No migration, no SQL, no deploy.
