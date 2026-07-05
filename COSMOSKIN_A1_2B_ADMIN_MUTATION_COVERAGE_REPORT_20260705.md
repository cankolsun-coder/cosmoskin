# COSMOSKIN — A1.2b: Admin Mutation Endpoint Permission Coverage — REPORT

**Date:** 2026-07-05
**Status:** Implemented locally. Not deployed. No migration created. No SQL run.
**Source of truth:** `COSMOSKIN_A1_2_ADMIN_ENDPOINT_COVERAGE_PLAN_20260705.md` (§2/§7 "A1.2b — mutation endpoints, non-finance") and `COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_REPORT_20260705.md`.
**Depends on:** A1.1 (deny-by-default `hasAdminPermission()`, `admin/users.js` protection) and A1.2a (13 GET/read-only endpoints gated) — both already implemented and unchanged by this batch.

---

## 0. Summary

A1.2b adds `requireAdminPermission()` to the **16 approved mutation (POST/PATCH) handlers across 12 files** identified in the A1.2 plan's "A1.2b — mutation endpoints, non-finance" batch. Every handler keeps its existing `assertAdmin()` call; the new permission check is inserted immediately after it and before any other logic (body parsing, validation, database reads/writes). No response shape, business logic, SQL/query logic, or validation logic was changed anywhere. A1.2c (finance/refund/bank-account: `refunds.js`, `invoices.js`, `bank-accounts.js`) and the two deliberate escape-hatch routes (`dashboard.js`, `inventory/health.js`) were **not touched**, per instruction.

**Total: 30 of 31 `functions/api/admin/**` files are now RBAC-covered end-to-end** (9 from A1.1 + 13 GET handlers from A1.2a + 16 mutation handlers across 12 files from A1.2b — several files overlap across batches, e.g. `orders.js` now has both a gated GET and a gated PATCH). Only A1.2c's 3 finance files, the 2 escape-hatch routes, and `admin/users.js` GET (a deliberate, previously-documented A1.1 exception) remain `assertAdmin()`-only.

---

## 1. Exact files changed and every mutation handler protected

| # | File | Handler | Permission string | Reused or new |
|---|---|---|---|---|
| 1 | `functions/api/admin/orders.js` | `onRequestPatch` | `orders:update` | Reused (seeded to `operations`) |
| 2 | `functions/api/admin/orders/[id]/status.js` | `onRequestPatch` | `orders:update` | Reused |
| 3 | `functions/api/admin/orders/[id]/emails.js` | `onRequestPost` | `orders:update` | Reused |
| 4 | `functions/api/admin/orders/[id]/shipments.js` | `onRequestPost` | `shipments:create` | Reused (matches sibling `dhl-shipment.js`, already gated in A1.1-era work) |
| 5 | `functions/api/admin/returns.js` | `onRequestPatch` | `returns:update` | Reused (seeded to `operations`, `customer_support`) |
| 6 | `functions/api/admin/products.js` | `onRequestPatch` | `inventory:adjust` | Reused (seeded to `warehouse`) |
| 7 | `functions/api/admin/products.js` | `onRequestPost` | `inventory:adjust` | Reused |
| 8 | `functions/api/admin/inventory/adjust.js` | `onRequestPost` | `inventory:adjust` | Reused |
| 9 | `functions/api/admin/inventory/[slug].js` | `onRequestPatch` | `inventory:adjust` | Reused |
| 10 | `functions/api/admin/lots.js` | `onRequestPost` | `inventory:adjust` | Reused |
| 11 | `functions/api/admin/lots.js` | `onRequestPatch` | `inventory:adjust` | Reused |
| 12 | `functions/api/admin/suppliers.js` | `onRequestPost` | `suppliers:manage` | **New** (no non-owner role seeded yet; owner `['*']` covers it today) |
| 13 | `functions/api/admin/suppliers.js` | `onRequestPatch` | `suppliers:manage` | **New** |
| 14 | `functions/api/admin/compliance.js` | `onRequestPatch` | `products:update` | Reused (seeded to `content_editor`) |
| 15 | `functions/api/admin/coupons/index.js` | `onRequestPost` | `coupons:manage` | **New** (distinct from the pre-existing `coupons:issue` used by `issue-customer-coupon.js`) |
| 16 | `functions/api/admin/coupons/index.js` | `onRequestPatch` | `coupons:manage` | **New** |

Every entry above was implemented as a single added line, placed exactly after the existing `await assertAdmin(context);` call:

```js
await assertAdmin(context);
await requireAdminPermission(context, '<permission>');
```

For the 5 files with no prior `requireAdminPermission` import (`orders/[id]/status.js`, `orders/[id]/emails.js`, `orders/[id]/shipments.js`, `inventory/adjust.js`, `inventory/[slug].js`), one import line was also added:

```js
import { requireAdminPermission } from '../_lib/admin-audit.js'; // relative depth matches each file's existing import style
```

The other 7 files (`orders.js`, `returns.js`, `products.js`, `lots.js`, `suppliers.js`, `compliance.js`, `coupons/index.js`) already imported `requireAdminPermission` from their A1.2a GET gate — no duplicate import was added.

---

## 2. High-caution items — proof of unchanged business logic

Per instruction, `admin/orders.js` PATCH and `admin/orders/[id]/status.js` PATCH were treated as highest-risk. Both received **only** the one-line permission guard; every named business-logic marker remains present and unmoved:

**`functions/api/admin/orders.js` `onRequestPatch`:** `assertOperationalTransition` (status-transition guard), `releaseInventoryReservations` / `convertInventoryReservations` (inventory), `recordEvent` (status-event logging), `awardOrderPoints` / `promoteOrderPoints` / `reverseOrderPoints` (loyalty), `sendAndLogShipmentEmail` / `sendAndLogStatusEmail` / `sendAndLogCommerceEmail` (customer email side effects) — all present, all in their original order, byte-identical apart from the new guard line.

**`functions/api/admin/orders/[id]/status.js` `onRequestPatch`:** the same status-transition 409 guards (paid/cancelled/bank-transfer edge cases), `releaseInventoryReservations` / `convertInventoryReservations`, `awardOrderPoints` / `promoteOrderPoints` / `reverseOrderPoints`, and the `order_status_events` insert — all present, unmoved.

This is enforced by two independent mechanisms, not just a visual read-through:
1. **Byte-diff check** in `scripts/validate-a1-admin-endpoint-coverage.mjs` (§5): strips every `requireAdminPermission(...)` call and its import from both the git-HEAD copy and the working-tree copy, then asserts the remainder is byte-identical. Any change beyond the permission scaffolding fails the validator.
2. **Named business-logic marker check** (`scripts/validate-a1-admin-endpoint-coverage.mjs` §6): explicitly asserts the presence of each marker listed above in both files, independent of the generic byte-diff, as a belt-and-suspenders regression guard for exactly these two highest-risk files.
3. Sanity-tested: deliberately commenting out `releaseInventoryReservations` in `orders/[id]/status.js` was confirmed to fail the validator with `High-caution regression: ... missing expected business-logic marker`.

---

## 3. Read vs. write separation — proof GET/read behavior did not change

Every file gated in A1.2a keeps its exact original A1.2a read permission on its `onRequestGet` handler; A1.2b's new mutation permission was added **only** inside the file's POST/PATCH handler(s), never touching the GET handler:

| File | GET permission (A1.2a, unchanged) | Mutation permission (A1.2b, new) |
|---|---|---|
| `orders.js` | `orders:read` | `orders:update` |
| `returns.js` | `returns:read` | `returns:update` |
| `products.js` | `products:read` | `inventory:adjust` |
| `lots.js` | `lots:read` | `inventory:adjust` |
| `suppliers.js` | `suppliers:read` | `suppliers:manage` |
| `compliance.js` | `compliance:read` | `products:update` |
| `coupons/index.js` | `coupons:read` | `coupons:manage` |

Proof mechanisms:
- **Validator §1/§2** (`scripts/validate-a1-admin-endpoint-coverage.mjs`): re-verifies every A1.2a GET handler still calls `requireAdminPermission` with its original exact string, and a cross-contamination check asserts every `requireAdminPermission(...)` call found anywhere in these files matches one of the file's two expected strings (its read string and/or its mutation string) — a read string leaking into a mutation handler, or vice versa, fails the build.
- **Validator §3**: every handler not in either the A1.2a or A1.2b matrix (i.e. every handler that should remain fully ungated) is asserted to still call `assertAdmin(context)` and to have gained **no** `requireAdminPermission(...)` call.
- **Integration tests** (`tests/local-integration.test.mjs`):
  - `A1.2a/A1.2b: mutation handlers sharing a file with a gated GET carry only their own (mutation) permission, never the GET one` — asserts each mutation handler's `requireAdminPermission` calls equal exactly `[expectedMutationPermission]`, nothing else.
  - `A1.2b: a caller holding only the file's read permission cannot perform the mutation (read does not imply write)` — a caller with only `orders:read` gets 403 on `orders.js` PATCH; only `inventory:read` gets 403 on `inventory/adjust.js` POST; only `coupons:read` gets 403 on `coupons/index.js` POST.
  - `A1.2b: a mutation permission does not accidentally unlock the file's unrelated GET/read route` — a caller with only `orders:update` gets 403 on `orders.js` GET; only `suppliers:manage` gets 403 on `suppliers.js` GET; only `coupons:manage` gets 403 on `coupons/index.js` GET.
- Full A1.2a test suite (all 4 pre-existing A1.2a tests) still passes unmodified, proving A1.2a's own guarantees were not regressed.

---

## 4. Proof finance/refund/bank-account files were not touched

`git status --porcelain` confirms `functions/api/admin/refunds.js`, `functions/api/admin/invoices.js`, and `functions/api/admin/bank-accounts.js` show **no diff** — they are not in the list of modified files for this session. This is additionally enforced by:
- `scripts/validate-a1-admin-endpoint-coverage.mjs` §4: fails if any of the three finance files contains a `requireAdminPermission(` call.
- `scripts/validate-a1-admin-endpoint-coverage.mjs` §9 (`forbiddenPaths`): fails if `git diff --name-only HEAD` shows any diff at all for the three finance files (a genuine zero-diff check, since — unlike `admin-audit.js`/`admin/users.js` — these files carry no pre-existing uncommitted diff from an earlier batch).
- `tests/local-integration.test.mjs` — `A1.2a/A1.2b: finance/refund/bank-account endpoints and the deliberate escape-hatch routes remain untouched` reads all three files at test time and asserts no `requireAdminPermission` string appears in any of them.

## 5. Proof `dashboard.js` and `inventory/health.js` remain `assertAdmin`-only

Same three mechanisms as above (validator §4, forbidden-paths zero-diff check, and the integration test) additionally assert both escape-hatch files still call `assertAdmin(context)`, contain no `requireAdminPermission(` call, and are not flipped to `public: true`. `admin/session.js` (the login/session-issuance endpoint, which must never be gated — gating it would be circular, since it is what `assertAdmin()` itself later validates) was added to the same forbidden-paths zero-diff list in this batch's validator as an explicit regression guard, even though the A1.2 plan never proposed gating it.

---

## 6. Validator and scope-guard changes

- **`scripts/validate-a1-admin-endpoint-coverage.mjs` rewritten** to validate both A1.2a and A1.2b in one pass:
  - New `GATED_MUTATION_ENDPOINTS` matrix (16 entries) alongside the existing `GATED_READ_ENDPOINTS` matrix (13 entries).
  - New cross-contamination check (§2): every `requireAdminPermission` call found in a touched file must be one of that file's expected read/mutation strings.
  - New "must stay fully ungated" check (§3): every handler in a touched file that is in neither matrix must remain `assertAdmin()`-only.
  - New high-caution business-logic-marker check (§6) for `orders.js` PATCH and `orders/[id]/status.js` PATCH.
  - `forbiddenPaths` (§9) updated: the 5 files A1.2b now legitimately modifies (`orders/[id]/status.js`, `orders/[id]/emails.js`, `orders/[id]/shipments.js`, `inventory/adjust.js`, `inventory/[slug].js`) were removed from the list; `admin/session.js` and the 4 "already done" routes (`coupons/issue-customer-coupon.js`, `shipments/[id]/sync.js`, `shipments/[id]/label.js`, `orders/[id]/dhl-shipment.js`, `returns/[id]/dhl-return-shipment.js`) were added as explicit zero-diff guards.
  - Chains A1.1 + H0 + H1 + H2 + Batch 1/3/4 + UI-polish validators, unchanged.
- **`scripts/validate-a1-admin-rbac-hardening.mjs`**: `A1_2_DEFERRED_FILES` shrunk — the 5 files now covered by A1.2b were removed (they're no longer "deferred", they're gated); only A1.2c finance files, the 2 escape hatches, and `functions/api/reviews/[[path]].js` remain in the deferred list.
- **`scripts/validate-h2-return-attachment-preview.mjs`**: `functions/api/admin/orders/[id]/status.js` removed from `forbiddenPaths` (it is no longer zero-diff, as of this batch), with an explanatory comment referencing this report.
- **Sanity-tested the rewritten validator** with four deliberate regressions — each correctly caught and reported:
  1. Removing the `requireAdminPermission` call from `orders.js` PATCH → caught (`must call requireAdminPermission(context, 'orders:update')`).
  2. Swapping `products.js` PATCH's permission from `inventory:adjust` to `products:read` → caught (`must call ... with this exact permission string — do not swap a read permission into a mutation handler or vice versa`).
  3. Adding a `requireAdminPermission` call to `refunds.js` (A1.2c scope) → caught by 3 independent checks simultaneously (this validator's own finance-file guard, its forbidden-paths zero-diff check, and the chained A1.1 validator's own A1.2-scope guard).
  4. Commenting out `releaseInventoryReservations` inside `orders/[id]/status.js` → caught by the byte-diff check (`changes beyond the requireAdminPermission import/call(s) were detected`).

---

## 7. Test results

```
node --check functions/api/_lib/admin-audit.js                     → OK
node scripts/validate-a1-admin-rbac-hardening.mjs                  → PASSED
node scripts/validate-a1-admin-endpoint-coverage.mjs                → PASSED (A1.2a + A1.2b)
node scripts/validate-h2-return-attachment-preview.mjs              → PASSED
node scripts/validate-h1-return-attachment-storage-rls.mjs          → PASSED
node scripts/validate-h0-live-payment-rpc-hotfix.mjs                → PASSED
node scripts/validate-account-batch-1-safe-fixes.mjs                → PASSED
node scripts/validate-account-batch-3-order-cancellation.mjs        → PASSED
node scripts/validate-account-batch-4-loyalty-ledger.mjs            → PASSED
node scripts/validate-account-ui-polish.mjs                         → PASSED
node scripts/validate-production-launch-readiness.mjs               → PASSED (19 critical pages, 37 product pages, 29 migrations)
node --test tests/local-integration.test.mjs                        → 36/36 PASSED, 0 failed
```

New tests added for A1.2b (5 new test cases, plus 1 A1.2a test rewritten to reflect the new mutation gates and 1 A1.2a test relabeled — no A1.2a test was weakened, all its original assertions still hold):
1. `A1.2b: every gated mutation admin endpoint denies an assertAdmin()-valid caller with no matching admin_users row (403)`
2. `A1.2b: every gated mutation admin endpoint lets the seeded owner (permissions ['*']) through the new permission gate`
3. `A1.2b: a caller holding only the file's read permission cannot perform the mutation (read does not imply write)`
4. `A1.2b: a mutation permission does not accidentally unlock the file's unrelated GET/read route`
5. `A1.2b: high-caution order status transition endpoints keep their business-logic markers alongside the new permission gate`

---

## 8. Explicitly out of scope (not touched, per instruction)

- A1.2c: `functions/api/admin/refunds.js`, `functions/api/admin/invoices.js`, `functions/api/admin/bank-accounts.js` — untouched, zero diff, verified.
- Escape hatches: `functions/api/admin/dashboard.js`, `functions/api/admin/inventory/health.js` — untouched, zero diff, still `assertAdmin()`-only, verified.
- `functions/api/admin/session.js` — untouched, never gated (by design).
- Checkout, payment, customer return flow, storage, loyalty ledger core, coupon business logic (`functions/api/_lib/coupons.js`), RBAC core helper (`functions/api/_lib/admin-audit.js`), Cloudflare config (`wrangler.toml`, `.env.example`, `_headers`) — all untouched, all in the validator's zero-diff `forbiddenPaths` list.
- No `supabase/migrations/*.sql` file was created or modified. No SQL was run.
- No deployment was performed.

---

## 9. Critical production warning

**Do not deploy A1.2b to production until A1.1's Cloudflare Access verification is complete:**
- Confirm the Cloudflare Access application actually protects `/api/admin/*` routes in production.
- Confirm `Cf-Access-Authenticated-User-Email` is present on real admin requests reaching the Cloudflare Pages Function (test with a real authenticated request, not just local/dev).
- Confirm the current owner email(s) — `cankolsun@gmail.com` and `cankolsun@cosmoskin.com.tr` — map to an active `admin_users` row with `role_code='owner'` and `permissions=['*']`.
- Confirm the owner can successfully load and use the admin panel end-to-end after deploy, including at least one newly-gated A1.2b mutation action (e.g. update an order status, add a shipment) and at least one newly-gated A1.2a read endpoint, in a staging/preview deploy before promoting to production.
- Keep the A1.2b rollback plan (`COSMOSKIN_A1_2B_ADMIN_MUTATION_COVERAGE_ROLLBACK_PLAN_20260705.md`) ready before deploying.

This batch **widens the blast radius** of the exact same single point of failure introduced in A1.1 (Cloudflare Access → `admin_users` resolution). Before A1.2b, a resolution failure would 403 the 13 A1.2a read routes only, while the entire order/return/inventory/coupon mutation surface kept working via `assertAdmin()` alone. After A1.2b, that same failure would additionally 403 all 16 newly-gated mutation actions — i.e. most of the day-to-day admin panel (order status updates, shipment creation, return decisions, inventory/lot adjustments, supplier/coupon edits) would stop working for everyone, including the owner, until Access is fixed. The two escape-hatch diagnostic routes remain the one guaranteed-working signal if this happens.

*Report complete. Stopping after A1.2b per instruction — A1.2c and all further batches remain unimplemented and unapproved.*
