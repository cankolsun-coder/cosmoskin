# COSMOSKIN — A1.2c: Admin Finance / Refund / Bank-Account Endpoint Permission Coverage — REPORT

**Date:** 2026-07-05
**Status:** Implemented locally. Not deployed. No migration created. No SQL run.
**Source of truth:** `COSMOSKIN_A1_2_ADMIN_ENDPOINT_COVERAGE_PLAN_20260705.md` (§2 rows 14-17, "A1.2c — finance/refund/bank-account"), `COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_REPORT_20260705.md`, `COSMOSKIN_A1_2B_ADMIN_MUTATION_COVERAGE_REPORT_20260705.md`.
**Depends on:** A1.1 (deny-by-default `hasAdminPermission()`, `admin/users.js` protection), A1.2a (13 GET/read-only endpoints gated), and A1.2b (16 mutation handlers gated) — all already implemented and unchanged by this batch.

---

## 0. Summary

A1.2c adds `requireAdminPermission()` to every handler in the three finance-adjacent admin route files that were deliberately deferred by A1.2a and A1.2b: `functions/api/admin/refunds.js` (GET, POST), `functions/api/admin/invoices.js` (GET, POST, PATCH), and `functions/api/admin/bank-accounts.js` (GET, POST, PATCH). Every handler keeps its existing `assertAdmin()` call; the new permission check is inserted immediately after it and before any other logic (body parsing, validation, database reads/writes). No response shape, business logic, SQL/query logic, validation logic, `provider_reference` handling, refund completion rule, or bank-account validation was changed anywhere — only one line was added per handler (plus one import line per file).

**This closes the last gap in the A1.2 plan.** All `functions/api/admin/**` route files with at least one permission-gateable handler now call `requireAdminPermission()` on every non-escape-hatch handler: 9 call sites from A1.1, 13 GET handlers from A1.2a, 16 mutation handlers from A1.2b, and 8 finance handlers (across 3 files) from this batch. Only the two deliberate, permanent escape-hatch routes (`admin/dashboard.js`, `admin/inventory/health.js`) and the never-gated `admin/session.js` remain `assertAdmin()`-only, by design.

---

## 1. Exact files changed and every finance endpoint protected

| # | File | Handler | Permission string | Reused or new |
|---|---|---|---|---|
| 1 | `functions/api/admin/refunds.js` | `onRequestGet` | `refunds:update` | Reused (no separate `refunds:read` is seeded — see §2) |
| 2 | `functions/api/admin/refunds.js` | `onRequestPost` | `refunds:update` | Reused (seeded to `operations`) |
| 3 | `functions/api/admin/invoices.js` | `onRequestGet` | `invoices:read` | Reused (seeded to `accountant`) |
| 4 | `functions/api/admin/invoices.js` | `onRequestPost` | `invoices:update` | Reused (seeded to `operations`, `accountant`) |
| 5 | `functions/api/admin/invoices.js` | `onRequestPatch` | `invoices:update` | Reused |
| 6 | `functions/api/admin/bank-accounts.js` | `onRequestGet` | `bank_accounts:manage` | **New** (not yet seeded to any non-owner role — see §2) |
| 7 | `functions/api/admin/bank-accounts.js` | `onRequestPost` | `bank_accounts:manage` | **New** |
| 8 | `functions/api/admin/bank-accounts.js` | `onRequestPatch` | `bank_accounts:manage` | **New** |

Every entry above was implemented as a single added line, placed exactly after the existing `await assertAdmin(context);` call:

```js
await assertAdmin(context);
await requireAdminPermission(context, '<permission>');
```

All three files needed a new import line, since none previously imported `requireAdminPermission`:

```js
import { requireAdminPermission } from '../_lib/admin-audit.js';
```

---

## 2. Permission-naming decisions — why these exact strings

Per instruction, colon-notation was used exclusively, no dot-notation was invented, and no migration was created. Two of the three files have a deliberate, plan-driven naming exception worth calling out explicitly:

- **`refunds.js` GET and POST both use `refunds:update`.** The `admin_permissions` seed (`supabase/migrations/20260626_production_launch_readiness.sql`) only ever defines `refunds:update` (to `operations`) — there is no seeded `refunds:read`. The A1.2 plan's endpoint table (§2, rows 14-15) explicitly recommends reusing `refunds:update` for the GET handler rather than inventing an unseeded `refunds:read` string. This matches the instruction to "use the permission string recommended in the A1.2 plan" when the exact string is not already seeded.
- **`bank-accounts.js` GET/POST/PATCH all use a single `bank_accounts:manage` string — not a read/write split.** This is an intentional exception to the read-vs-write pattern used everywhere else in A1.2a/A1.2b (e.g. `orders:read` vs `orders:update`). The A1.2 plan (§2 row 17) explicitly recommends this: IBAN/payment-routing data is "fraud-sensitive even to read", so there is deliberately no low-bar `bank_accounts:read` string that would let a lower-trust role see bank routing details. `bank_accounts:manage` is a brand-new string.
- **`invoices.js` needed no naming decision** — it reuses the pre-existing seeded pair `invoices:read` / `invoices:update` exactly as-is, matching A1.2a/A1.2b's standard read/write split pattern.

**Non-owner role seeding is deferred, by design, per instruction ("if the exact permission string is not already seeded, do not create a migration").** Today, only the owner (`role_code='owner'` or `permissions` containing `'*'`) can pass the `bank_accounts:manage` gate, since no `admin_permissions` row grants it to any other role. `refunds:update` and `invoices:read`/`invoices:update` are already seeded to `operations`/`accountant`, so those two files are usable by non-owner roles today without any further action. A future, separately-approved migration is required before any non-owner role (e.g. `accountant` or a new `finance` role) can be granted `bank_accounts:manage`. This is intentionally the most conservative interpretation for the most fraud-sensitive of the three files.

---

## 3. High-caution items — proof of unchanged business logic

Per instruction, `refunds.js`, `invoices.js`, and `bank-accounts.js` were treated as highest-risk (money-adjacent, refund-routing, and fiscal-record files respectively). Each received **only** the permission guard line(s); every named business-logic marker remains present and unmoved:

- **`functions/api/admin/refunds.js`:** `STATUSES` validation set, `provider_reference` field handling on create, `completed_at:status==='completed'?...` timestamp rule, the `return_requests` status-sync side effect, the `reverseOrderPoints` loyalty-reversal hook fired only when `status==='completed'`, and the `sendCommerceTransactionalEmail`/`logRefundEmail` completion-email side effect — all present, all in their original order, byte-identical apart from the new guard lines.
- **`functions/api/admin/invoices.js`:** `TYPES`/`STATUSES` validation sets, `provider_reference` field handling, `invoice_number`/`pdf_url` fields (including the `isUrl()` https/http validation), and the `order_status_events` audit-trail insert on both create and update — all present, unmoved.
- **`functions/api/admin/bank-accounts.js`:** `normalizeBankAccount`/`validateBankAccount` (IBAN MOD-97 + field validation) via the shared `toDbPayload()` helper, the `sort_order` field, and the `NO_STORE` cache-control headers on every response — all present, unmoved.

This is enforced by two independent mechanisms, not just a visual read-through:
1. **Byte-diff check** in `scripts/validate-a1-admin-endpoint-coverage.mjs` (§5): strips every `requireAdminPermission(...)` call and its import from both the git-HEAD copy and the working-tree copy of all three files, then asserts the remainder is byte-identical. Any change beyond the permission scaffolding fails the validator.
2. **Named business-logic marker check** (`scripts/validate-a1-admin-endpoint-coverage.mjs` §6, extended for this batch): explicitly asserts the presence of each marker listed above in all three files, independent of the generic byte-diff, as a belt-and-suspenders regression guard.
3. Sanity-tested: deliberately removing the `sort_order` line from `bank-accounts.js`'s `toDbPayload()` was confirmed to fail the validator's byte-diff check with `changes beyond the requireAdminPermission import/call(s) were detected`; deliberately removing the `requireAdminPermission` call from `refunds.js` POST was confirmed to fail with `must call requireAdminPermission(context, 'refunds:update')`.

---

## 4. Proof A1.2a and A1.2b coverage did not regress

- All 13 A1.2a GET-handler checks and all 16 A1.2b mutation-handler checks in `scripts/validate-a1-admin-endpoint-coverage.mjs` (§1, `GATED_READ_ENDPOINTS` + `GATED_MUTATION_ENDPOINTS`) re-run unchanged and pass — none of those 29 handlers, or the files containing them, were touched by this batch.
- The cross-contamination guard (§2) and "must stay fully ungated" guard (§3) run across the union of all three batches' matrices (`ALL_GATED_ENDPOINTS`), so an A1.2c permission string leaking into an A1.2a/A1.2b handler (or vice versa) would fail the build.
- `node --test tests/local-integration.test.mjs` re-runs every A1.2a test (4) and A1.2b test (5) unmodified alongside the new A1.2c tests (7) — all 43 tests pass, 0 failed.
- A1.1's deny-by-default checks (§8 of the validator, plus the chained `validate-a1-admin-rbac-hardening.mjs`) were re-run and pass unchanged.

---

## 5. Validator and scope-guard changes

- **`scripts/validate-a1-admin-endpoint-coverage.mjs` rewritten** to validate A1.2a, A1.2b, and A1.2c together in one pass:
  - New `GATED_FINANCE_ENDPOINTS` matrix (8 entries: `refunds.js` GET/POST, `invoices.js` GET/POST/PATCH, `bank-accounts.js` GET/POST/PATCH), unioned with the existing `GATED_READ_ENDPOINTS`/`GATED_MUTATION_ENDPOINTS` matrices into `ALL_GATED_ENDPOINTS`.
  - The old §4 ("A1.2c finance files must show zero `requireAdminPermission` calls") was removed, since these files are now expected to carry the gate — they are validated the same way as every other gated file via the matrix-driven checks in §1-§3.
  - §4 is now scoped to only the two deliberate escape-hatch files and `admin/session.js`.
  - The high-caution business-logic-marker check (§6) was extended with entries for `refunds.js`, `invoices.js`, and `bank-accounts.js` (markers listed in §3 above).
  - `forbiddenPaths` (§9) no longer lists the three finance files (they are now legitimately touched); two additional defensive zero-diff guards were added for files this batch must not touch but are adjacent to the change (`functions/api/_lib/bank-accounts.js`, the IBAN validation helper consumed by `bank-accounts.js`, and `functions/api/_lib/inventory.js`).
  - Chains A1.1 + H0 + H1 + H2 + Batch 1/3/4 + UI-polish validators, unchanged.
- **`scripts/validate-a1-admin-rbac-hardening.mjs`**: `A1_2_DEFERRED_FILES` shrunk — `refunds.js`, `invoices.js`, and `bank-accounts.js` were removed (they're no longer deferred, they're gated); only `admin/inventory/health.js`, `admin/dashboard.js`, and `functions/api/reviews/[[path]].js` remain in the deferred list.
- **`scripts/validate-h2-return-attachment-preview.mjs`**: `functions/api/admin/refunds.js` removed from `forbiddenPaths` (it is no longer zero-diff, as of this batch), with an explanatory comment referencing this report.
- **`scripts/validate-h0-live-payment-rpc-hotfix.mjs`**: `functions/api/admin/refunds.js` removed from `forbiddenPaths` for the same reason, with an explanatory comment.
- **Sanity-tested the rewritten validator** with two deliberate regressions — both correctly caught and reported:
  1. Removing the `requireAdminPermission` call from `refunds.js` POST → caught (`must call requireAdminPermission(context, 'refunds:update')`).
  2. Removing the `sort_order` line from `bank-accounts.js`'s `toDbPayload()` → caught by the byte-diff check (`changes beyond the requireAdminPermission import/call(s) were detected`).

---

## 6. Test results

```
node --check functions/api/admin/refunds.js                        → OK
node --check functions/api/admin/invoices.js                       → OK
node --check functions/api/admin/bank-accounts.js                  → OK
node scripts/validate-a1-admin-rbac-hardening.mjs                  → PASSED
node scripts/validate-a1-admin-endpoint-coverage.mjs                → PASSED (A1.2a + A1.2b + A1.2c)
node scripts/validate-h2-return-attachment-preview.mjs              → PASSED
node scripts/validate-h1-return-attachment-storage-rls.mjs          → PASSED
node scripts/validate-h0-live-payment-rpc-hotfix.mjs                → PASSED
node scripts/validate-account-batch-1-safe-fixes.mjs                → PASSED
node scripts/validate-account-batch-3-order-cancellation.mjs        → PASSED
node scripts/validate-account-batch-4-loyalty-ledger.mjs            → PASSED
node scripts/validate-account-ui-polish.mjs                         → PASSED
node scripts/validate-production-launch-readiness.mjs               → PASSED (19 critical pages, 37 product pages, 29 migrations)
node --test tests/local-integration.test.mjs                        → 43/43 PASSED, 0 failed
```

New tests added for A1.2c (7 new test cases; one A1.2a/A1.2b-era test — "finance/refund/bank-account endpoints and the deliberate escape-hatch routes remain untouched" — was retitled and narrowed to only the two escape-hatch files, since the finance files are no longer untouched):
1. `A1.2c: non-authorized admin cannot access finance read endpoints (403)`
2. `A1.2c: non-authorized admin cannot call finance mutation endpoints (403)`
3. `A1.2c: owner (permissions ['*']) can access finance read endpoints`
4. `A1.2c: owner (permissions ['*']) can call finance mutation endpoints`
5. `A1.2c: read-only finance permission cannot perform the finance mutation (read does not imply write)`
6. `A1.2c: a finance mutation permission does not accidentally unlock the file's unrelated GET/read route`
7. `A1.2c: high-caution finance endpoints keep their business-logic markers alongside the new permission gate`

---

## 7. Explicitly out of scope (not touched, per instruction)

- Checkout, payment callback, payment RPCs, customer returns (`functions/api/returns.js`), storage, loyalty ledger core (`functions/api/_lib/loyalty-ledger.js`), order cancellation, coupon business logic (`functions/api/_lib/coupons.js`), products (`functions/api/admin/products.js`), inventory (`functions/api/admin/inventory*.js`), shipments (`functions/api/admin/shipments*.js`), RBAC core helper (`functions/api/_lib/admin-audit.js`), Cloudflare config (`wrangler.toml`, `.env.example`, `_headers`) — all untouched, all in the validator's zero-diff `forbiddenPaths` list.
- Escape hatches: `functions/api/admin/dashboard.js`, `functions/api/admin/inventory/health.js` — untouched, zero diff, still `assertAdmin()`-only, verified.
- `functions/api/admin/session.js` — untouched, never gated (by design).
- No `supabase/migrations/*.sql` file was created or modified. No SQL was run.
- No deployment was performed.
- No new batch (A1.3 or beyond) was started.

---

## 8. Critical production warning

**Do not deploy A1.2c to production until Cloudflare Access verification is complete.** This batch gates the last and most sensitive remaining admin surface — money-adjacent flows. Before any production deploy, confirm:

- Admin routes (`/api/admin/*`) are protected by Cloudflare Access in the production Cloudflare dashboard (not just assumed from `.env.example`).
- The current owner email(s) — `cankolsun@gmail.com` and `cankolsun@cosmoskin.com.tr` — are actually delivered to the backend via `Cf-Access-Authenticated-User-Email` on real production requests (test with a real authenticated request, not just local/dev).
- The owner email maps to an active `admin_users` row with `role_code='owner'` and `permissions=['*']` (`is_active=true`, `status='active'`).
- The owner can access admin read endpoints, including the three newly-gated finance reads (`GET /api/admin/refunds`, `GET /api/admin/invoices`, `GET /api/admin/bank-accounts`), in a staging/preview deploy before promoting to production.
- The owner can perform **one safe preview or staging finance mutation test** (e.g. a `PATCH /api/admin/invoices` no-op status update, or a manual refund record against a known test order in a non-production environment) to confirm the mutation gate does not unexpectedly 403 the owner.
- Rollback is ready — see `COSMOSKIN_A1_2C_ADMIN_FINANCE_COVERAGE_ROLLBACK_PLAN_20260705.md`.

This batch **widens the blast radius to its maximum extent across the whole A1.2 effort**. Before A1.2c, a Cloudflare Access resolution failure would 403 the 13 A1.2a reads and 16 A1.2b mutations, while refund creation, invoice management, and bank-account routing kept working via `assertAdmin()` alone. After A1.2c, that same failure would additionally 403 every refund, invoice, and bank-account admin action — the entire finance/fiscal surface of the admin panel — for everyone, including the owner, until Access is fixed. The two escape-hatch diagnostic routes remain the one guaranteed-working signal if this happens.

*Report complete. Stopping after A1.2c per instruction — no further batch has been started.*
