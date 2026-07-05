# COSMOSKIN — A1.2: Admin Endpoint Permission Coverage Expansion — PLAN

**Date:** 2026-07-05
**Status:** Plan only. No code changed, no migration created, no SQL run, nothing deployed.
**Depends on:** A1.1 (`COSMOSKIN_A1_ADMIN_RBAC_HARDENING_REPORT_20260704.md`, `..._RUNBOOK_20260704.md`) — already implemented locally: `hasAdminPermission()` is deny-by-default, `admin/users.js` mutations require `admin.users.manage`.
**Source docs reviewed:** A1.1 report, A1.1 runbook, `COSMOSKIN_P0_P1_REMEDIATION_PLAN_20260704.md`, `COSMOSKIN_PROJECT_MEMORY.md`, every file under `functions/api/admin/**` (31 files), plus the 2 already-gated files outside that tree (`functions/api/email/retry-failed.js`, `functions/api/invoices/qnb-create.js`) and the live `admin_permissions`/`admin_roles` seed (`supabase/migrations/20260626_production_launch_readiness.sql`).

---

## 0. Executive summary

Today, **9 of the ~33 assertAdmin-gated endpoints** call `requireAdminPermission()`; the other **~24 are gated only by the shared `ADMIN_TOKEN`/signed session** (`assertAdmin()`), with zero per-role differentiation. Two facts materially reduce A1.2's risk versus what a "typical" RBAC rollout would carry:

1. **Only 2 `admin_users` rows exist today, both `role_code='owner'`, `permissions=['*']`** (confirmed live in the A1.1 preflight). Owner's `['*']` wildcard short-circuits every `hasAdminPermission()` call before any role/permission-string lookup happens. **This means the exact permission string chosen for any endpoint has zero effect on today's only real admin user** — it only matters the day a non-owner `admin_users` row (`operations`/`warehouse`/`customer_support`/`content_editor`/`accountant`) is actually created.
2. **A full role → permission matrix is already seeded** in `admin_permissions` (6 roles, ~19 rows, colon-notation strings like `orders:read`, `orders:update`, `refunds:update`, `inventory:adjust`, `customers:read`, `invoices:read`, `shipments:create`, `coupons:issue`, `loyalty:adjust`, `products:update`) and is **already the naming convention used by all 9 existing `requireAdminPermission()` call sites**. It is currently inert for anything beyond those 9 routes, because the other ~24 routes never check it.

**A1.2's real job is not "add security," it's "make the already-seeded role matrix actually mean something."** Right now, seeding a `warehouse` or `customer_support` `admin_users` row would grant that person unrestricted `assertAdmin()`-level access to all ~24 ungated routes (orders, refunds, invoices, bank account IBANs, customer PII, coupon creation, etc.) — the role matrix would not restrict them at all. A1.2 closes that gap.

There is one decision the plan surfaces (§1) before any file is touched, because it changes the recommended permission string in the coverage table: **reuse the already-seeded colon-notation permissions** (`orders:read`, `refunds:update`, …) wherever one exists, rather than inventing a parallel dot-notation scheme, even though the user's requested grouping in this document uses dot-notation labels for readability. Recommendation stated below; both namings are shown side-by-side in the coverage table so either can be chosen without re-deriving the analysis.

---

## 1. Decision points to confirm before implementation

### Decision 1 — Permission string naming convention
- **Options:** (A) reuse existing seeded colon-notation strings (`orders:read`, `refunds:update`, `inventory:adjust`, …) wherever a match exists; introduce new colon-notation strings only for concepts with no seed row (`suppliers:read`, `suppliers:manage`, `coupons:manage`, `bank_accounts:manage`, `products:read`). (B) Introduce the user's dot-notation scheme (`admin.orders.read`, `admin.orders.manage`, …) everywhere, matching the style of A1.1's `admin.users.manage`.
- **Recommendation: Option A.** Zero migration needed (owner's `['*']` already covers every string today), zero risk of breaking the 9 existing call sites, and the day a non-owner role is actually seeded, the already-existing `admin_permissions` rows for `operations`/`warehouse`/`customer_support`/`accountant` instantly work correctly with no further SQL. `admin.users.manage` remains the one deliberate dot-notation exception (A1.1), because "manage other admins" has no concept in the 6-role matrix by design (owner-only).
- The coverage table below shows the requested dot-notation **bucket** (for grouping, per your ask) next to the **recommended actual string** (Option A). If you prefer Option B instead, every "recommended actual string" cell can be swapped 1:1 with no other change to scope/batching.

### Decision 2 — Granularity vs. the requested 12-bucket list
Two of the requested buckets don't cleanly fit the existing seed or the actual file inventory; flagging rather than silently resolving:
- **`admin.inventory.manage` (single bucket)** vs. the seed's existing **two** permissions `inventory:read` / `inventory:adjust` (already split, already used by the `warehouse` role). Recommendation: keep the existing read/adjust split (reuse both), don't collapse to one string.
- **`admin.support.manage`** and **`admin.audit.read`**: **no matching endpoint exists today.** There is no `functions/api/admin/support*.js` (customer support requests are only exposed customer-side, `functions/api/account/support-requests.js`), and no endpoint reads `admin_activity_logs` back (only written via `recordAdminActivity()`). Both are recorded as reserved-for-future permission names with nothing to gate in A1.2.
- **`admin.products.*`**: no endpoint edits core catalog content (name/price/images — those live in `products.json`/`assets/products-data.js` per project rules, not a DB-backed admin API). The closest real match is `admin/compliance.js` (INCI/regulatory metadata in `product_compliance`), mapped to `products:read` (new) / `products:update` (existing, seeded to `content_editor`).

---

## 2. Full endpoint coverage table

All 31 files under `functions/api/admin/**`, plus the 2 already-gated files outside it for completeness. "Owner covers?" is **Yes for every row** — the wildcard check happens before any permission-string comparison — so it is stated once here rather than repeated 33 times below.

| # | Route (method) | Current guard | R/W | Risk | Requested bucket | Recommended actual permission | A1.2 action |
|---|---|---|---|---|---|---|---|
| 1 | `admin/session.js` (POST/GET) | none (issues the session itself) | auth | n/a | — | **none — never gate** (circular: this endpoint grants the session `assertAdmin()` later checks) | Out of scope, permanently |
| 2 | `admin/users.js` GET | assertAdmin | R | Low-Med | admin.users.manage | *(kept assertAdmin-only, per A1.1's explicit "don't redesign" decision)* | Deferred — optional future symmetry item, not re-litigated here |
| 3 | `admin/users.js` POST/PATCH | assertAdmin **+ requireAdminPermission** | W | Critical | admin.users.manage | `admin.users.manage` | **Done in A1.1** — no change |
| 4 | `admin/orders.js` GET | assertAdmin | R | Med-High (order PII+financial) | admin.orders.read | `orders:read` | **A1.2a** |
| 5 | `admin/orders.js` PATCH | assertAdmin | W | **Critical** (status/payment/fulfillment, triggers inventory + loyalty + emails) | admin.orders.manage | `orders:update` | **A1.2b** (highest-caution item in this batch) |
| 6 | `admin/orders/[id].js` GET | assertAdmin | R | Med-High | admin.orders.read | `orders:read` | **A1.2a** |
| 7 | `admin/orders/[id]/status.js` PATCH | assertAdmin | W | **Critical** (near-duplicate of #5; same inventory/loyalty side effects) | admin.orders.manage | `orders:update` | **A1.2b** |
| 8 | `admin/orders/[id]/emails.js` POST | assertAdmin | W | Medium (customer email resend) | admin.orders.manage | `orders:update` | **A1.2b** |
| 9 | `admin/orders/[id]/shipments.js` POST | assertAdmin | W | High (advances order to shipped + customer email) | admin.orders.manage | `shipments:create` *(matches sibling DHL endpoints below)* | **A1.2b** |
| 10 | `admin/orders/[id]/dhl-shipment.js` POST | assertAdmin **+ requireAdminPermission** | W | High | admin.orders.manage | `shipments:create` | **Already done** — no change |
| 11 | `admin/returns.js` GET | assertAdmin | R | Med-High (signed attachment URLs, PII) | admin.returns.read | `returns:update` *(reuse — no separate read row seeded; see Decision 1)* | **A1.2a** |
| 12 | `admin/returns.js` PATCH | assertAdmin | W | High (approve/reject/refund-status, customer emails) | admin.returns.manage | `returns:update` | **A1.2b** |
| 13 | `admin/returns/[id]/dhl-return-shipment.js` POST | assertAdmin **+ requireAdminPermission** | W | High | admin.returns.manage | `returns:update` | **Already done** — no change |
| 14 | `admin/refunds.js` GET | assertAdmin | R | High (financial records) | admin.refunds.manage | `refunds:update` | **A1.2c** |
| 15 | `admin/refunds.js` POST | assertAdmin | W | **Critical** (creates refund record, reverses loyalty points, refund email) | admin.refunds.manage | `refunds:update` | **A1.2c** |
| 16 | `admin/invoices.js` GET/POST/PATCH | assertAdmin | R/W | High (financial documents) | *(not in requested list — finance-adjacent)* | `invoices:read` (GET) / `invoices:update` (POST/PATCH) | **A1.2c** |
| 17 | `admin/bank-accounts.js` GET/POST/PATCH | assertAdmin | R/W | **Critical** (IBAN/payment routing — fraud-sensitive even to read) | *(not in requested list — finance-adjacent)* | `bank_accounts:manage` (new, single string for R+W) | **A1.2c** |
| 18 | `admin/products.js` GET | assertAdmin | R | Medium (stock levels, merged catalog view) | admin.inventory.manage | `inventory:read` | **A1.2a** |
| 19 | `admin/products.js` PATCH/POST | assertAdmin | W | High (writes `stock_on_hand`, can zero out sellable stock) | admin.inventory.manage | `inventory:adjust` | **A1.2b** |
| 20 | `admin/inventory.js` GET | assertAdmin | R | Medium | admin.inventory.manage | `inventory:read` | **A1.2a** |
| 21 | `admin/inventory/adjust.js` POST | assertAdmin | W | High | admin.inventory.manage | `inventory:adjust` | **A1.2b** |
| 22 | `admin/inventory/[slug].js` PATCH | assertAdmin | W | High | admin.inventory.manage | `inventory:adjust` | **A1.2b** |
| 23 | `admin/inventory/[slug]/movements.js` GET | assertAdmin | R | Low (per-product audit log, no PII) | admin.inventory.manage | `inventory:read` | **A1.2a** (low priority) |
| 24 | `admin/inventory/health.js` GET | assertAdmin | R | Low (diagnostic, no PII, no mutation) | admin.inventory.manage | *(leave assertAdmin-only)* | **Deferred — deliberate escape hatch, see §4** |
| 25 | `admin/lots.js` GET | assertAdmin | R | Low-Med | admin.inventory.manage | `inventory:read` | **A1.2a** |
| 26 | `admin/lots.js` POST/PATCH | assertAdmin | W | Medium (lot/SKT records) | admin.inventory.manage | `inventory:adjust` | **A1.2b** |
| 27 | `admin/suppliers.js` GET | assertAdmin | R | Low (vendor master data) | *(not in requested list)* | `suppliers:read` (new) | **A1.2a** |
| 28 | `admin/suppliers.js` POST/PATCH | assertAdmin | W | Low-Med | *(not in requested list)* | `suppliers:manage` (new) | **A1.2b** |
| 29 | `admin/compliance.js` GET | assertAdmin | R | Low-Med (regulatory content) | admin.products.read | `products:read` (new) | **A1.2a** |
| 30 | `admin/compliance.js` PATCH | assertAdmin | W | Medium | admin.products.manage | `products:update` *(reuse — seeded to `content_editor`)* | **A1.2b** |
| 31 | `admin/coupons/index.js` GET | assertAdmin | R | Low-Med (active discount codes) | *(not in requested list)* | `coupons:manage` (new — distinct from `coupons:issue`) | **A1.2a** |
| 32 | `admin/coupons/index.js` POST/PATCH | assertAdmin | W | Medium (revenue-affecting discount rules) | *(not in requested list)* | `coupons:manage` (new) | **A1.2b** |
| 33 | `admin/coupons/issue-customer-coupon.js` POST | assertAdmin **+ requireAdminPermission** | W | Medium | *(not in requested list)* | `coupons:issue` | **Already done** — no change |
| 34 | `admin/customers.js` GET | assertAdmin | R | Med-High (customer PII + spend) | *(not in requested list)* | `customers:read` *(reuse — seeded to `customer_support`)* | **A1.2a** |
| 35 | `admin/shipments.js` GET | assertAdmin | R | Low-Med | *(not in requested list)* | `shipments:create` *(reuse — precedent already loose, see #9/#10)* | **A1.2a** |
| 36 | `admin/shipments/[id]/sync.js` POST | assertAdmin **+ requireAdminPermission** | W | Low | — | `shipments:create` | **Already done** — no change |
| 37 | `admin/shipments/[id]/label.js` GET | assertAdmin **+ requireAdminPermission** | R | Low | — | `shipments:create` | **Already done** — no change |
| 38 | `admin/email-logs.js` GET | assertAdmin | R | Low-Med (customer email + subject/status) | admin.audit.read | `email_logs:read` (new) *or leave deferred — see §4* | **A1.2a (optional)** |
| 39 | `admin/dashboard.js` GET | assertAdmin | R | Low (aggregate counts only, no PII) | admin.audit.read | *(leave assertAdmin-only)* | **Deferred — deliberate escape hatch, see §4** |
| 40 | `admin/loyalty/adjust-points.js` POST | assertAdmin **+ requireAdminPermission** | W | High | admin.loyalty.manage | `loyalty:adjust` | **Already done** — no change |
| 41 | `email/retry-failed.js` POST *(outside admin/**)* | assertAdmin **+ requireAdminPermission** | W | Low | — | `orders:read` | **Already done** — no change |
| 42 | `invoices/qnb-create.js` POST *(outside admin/**)* | assertAdmin **+ requireAdminPermission** | W | Low (feature-flagged off) | — | `invoices:update` | **Already done** — no change |

**Footnote (explicitly out of literal scope, flagged for awareness only):** `functions/api/reviews/[[path]].js` also calls `assertAdmin()` for review moderation but is not under `functions/api/admin/**`; not analyzed further here per the plan's literal scope. Would be a natural candidate for a future A1.3 if full `assertAdmin()`-surface coverage is ever desired.

---

## 3. Permission grouping (as requested)

| Requested bucket | Endpoints in this plan | Actual string(s) recommended (Decision 1) | Already seeded to |
|---|---|---|---|
| `admin.orders.read` | orders.js GET, orders/[id].js GET | `orders:read` | operations, warehouse, customer_support, accountant |
| `admin.orders.manage` | orders.js PATCH, orders/[id]/status.js, orders/[id]/emails.js, orders/[id]/shipments.js, orders/[id]/dhl-shipment.js✓ | `orders:update` (+ `shipments:create` for the two shipment-creation routes) | operations |
| `admin.returns.read` | returns.js GET | `returns:update` (reused, no dedicated read row seeded) | operations, customer_support |
| `admin.returns.manage` | returns.js PATCH, returns/[id]/dhl-return-shipment.js✓ | `returns:update` | operations, customer_support |
| `admin.products.read` | compliance.js GET | `products:read` (new) | none yet — owner-only until seeded |
| `admin.products.manage` | compliance.js PATCH | `products:update` | content_editor |
| `admin.inventory.manage` | products.js, inventory.js, inventory/adjust.js, inventory/[slug].js, inventory/[slug]/movements.js, lots.js | `inventory:read` (reads) / `inventory:adjust` (writes) | warehouse |
| `admin.refunds.manage` | refunds.js GET+POST | `refunds:update` | operations |
| `admin.loyalty.manage` | loyalty/adjust-points.js✓ | `loyalty:adjust` | operations |
| `admin.support.manage` | **no endpoint exists** | reserved, not applicable to A1.2 | — |
| `admin.users.manage` | users.js POST/PATCH✓ | `admin.users.manage` | owner only, by design |
| `admin.audit.read` | **no `admin_activity_logs` reader exists**; closest analog is email-logs.js (optional) | reserved / `email_logs:read` (optional) | none yet |

Endpoints found in the codebase but not covered by the requested 12 buckets (suppliers, coupons template CRUD, invoices, bank accounts, customers, shipments list) are captured in §2's coverage table with proposed new or reused strings so the plan has no gaps, even though they weren't in your original list.

✓ = already implemented (A1.1 or earlier), no A1.2 change needed for that specific line.

---

## 4. "Don't over-protect helper endpoints" — what's deliberately deferred

Two endpoints are recommended to **stay on `assertAdmin()`-only, indefinitely, on purpose**:

- `admin/dashboard.js` (aggregate counts, zero PII, zero mutation)
- `admin/inventory/health.js` (catalog/inventory consistency diagnostic, zero PII, zero mutation)

Rationale beyond "low value": **after full A1.2 rollout, nearly every admin route becomes dependent on the same single point of failure A1.1 introduced** — successful resolution of `Cf-Access-Authenticated-User-Email` → an active `admin_users` row (see §5). Deliberately leaving 1–2 harmless, no-PII, read-only diagnostic endpoints ungated means that if that dependency ever breaks in production, the owner still has *something* inside the admin panel to load (a "is the RBAC layer itself broken, or is everything actually down" signal) instead of a 100%-locked-out panel. `email-logs.js` is marked **optional** in A1.2a for the same reason — recommend deferring it too unless there's a specific reason to gate it now.

---

## 5. Lockout risk assessment

**A1.2 does not introduce a new category of risk versus A1.1 — it widens the blast radius of the exact same one.**

- Root dependency (unchanged since A1.1): `hasAdminPermission()` denies whenever `getAdminRecord()` can't resolve an active `admin_users` row for the caller's `Cf-Access-Authenticated-User-Email`. That depends on Cloudflare Access actually being configured and injecting the header on `/api/admin/*`.
- **Before A1.2:** if that dependency fails, only the 9 already-gated routes 403. The other ~24 routes (including the entire order/return/refund/inventory admin panel) keep working via `assertAdmin()` alone.
- **After full A1.2 rollout:** ~29 of ~33 routes would depend on that same resolution succeeding. A Cloudflare Access misconfiguration, an expired/misissued Access policy, or a transient Supabase error in `getAdminRecord()`'s `.catch(() => [])` fallback (which is deliberately treated as "no admin found" → deny) would functionally take down the **entire admin panel** for the owner, not just 9 routes.
- **Because only 2 owner rows exist today and `['*']` always passes**, the *permission string* chosen for any given route has no bearing on this risk — the risk is 100% about whether the identity resolution step succeeds at all, which is identical to the A1.1 gate.
- **Net new mitigations for A1.2 specifically (beyond re-running the A1.1 runbook checklist before deploying each batch):**
  1. Ship in three sequenced batches (a → b → c), each independently deployable and independently revertible, so a failure surfaces against the smallest possible blast radius first (read-only routes) before mutation routes and before finance routes.
  2. Keep `dashboard.js` and `inventory/health.js` permanently ungated as an escape hatch (§4).
  3. Before promoting batch *b* or *c*, repeat the A1.1 runbook's "owner exercises one gated route successfully" check against the routes newly gated in the *previous* batch, not just the 9 original ones.
  4. No new migration is required for any of A1.2a/b/c (owner's wildcard covers every new string immediately) — so there is no "migration lag" risk between deploying code and seeding permissions, unlike a from-scratch RBAC rollout.

---

## 6. Tests and validators needed

### New validator: `scripts/validate-a1-2-admin-endpoint-permission-coverage.mjs`
Chains the A1.1 validator (and therefore everything it already chains — H0/H1/H2/Batch 1/3/4/UI-polish). Additional checks, parameterized per batch so each batch's validator run can be scoped:
1. Every file listed as "done" in a given batch actually contains `requireAdminPermission(context, '<expected string>')`, placed after `assertAdmin(context)` and before any read/write to the underlying table.
2. Every file **not** in scope for a given batch has **not** gained a new `requireAdminPermission(` call (same "scope guard" pattern as the A1.1 validator's #8 check) — run per-batch so A1.2a's validator run fails if A1.2b/c work leaked in early, and vice versa.
3. `admin/dashboard.js` and `admin/inventory/health.js` never gain a `requireAdminPermission(` call (locks in the §4 deferral decision as an explicit regression guard, not just a comment).
4. No client-supplied body/query field is read for identity/permission purposes in any of the newly-touched files (same no-bypass check as A1.1, re-run against the new file set).
5. `admin/session.js` is never modified and never gains an admin-permission check (guards Decision-point "never gate the login endpoint" rule).
6. Forbidden-paths lists in H0/H1/H2/Batch validators are re-checked to ensure none of the newly-touched 21 files were on a list that would now legitimately conflict — pre-emptively flagging any needed `forbiddenPaths` adjustment before implementation, the same way A1.1 had to adjust three validators for `admin-audit.js`.

### Integration tests (`tests/local-integration.test.mjs`)
Recommend one shared parametrized helper (e.g. `expectPermissionGate(handler, method, permission, fixtureBody)`) reused across all newly-gated routes, rather than 37 near-duplicate hand-written tests. Per batch, minimum coverage:
- Owner (`permissions: ['*']`) passes.
- An `assertAdmin()`-valid caller with no matching/active `admin_users` row gets 403 (proves the gate is actually wired, not a no-op).
- An inactive/disabled admin gets 403 even if their role would otherwise carry the permission (regression guard reusing A1.1's pattern).
- For **A1.2c only** (finance): an additional test that a caller whose only permission is an *unrelated* string (e.g. `inventory:adjust`) cannot access `refunds:update`/`bank_accounts:manage`-gated routes — proves permission strings are checked precisely, not just "any permission passes any gate."

### Manual/staging verification
Repeat the A1.1 runbook's Steps 1–3 (Cloudflare Access confirmation) once, before A1.2a; then for each subsequent batch (b, c), only re-run Step 4 (owner exercises a newly-gated route + a still-open route) against a preview deploy before promoting to production — no need to re-verify the Cloudflare Access application itself three times if nothing about the Access app changed between batches.

---

## 7. Recommended implementation batches

### A1.2a — low-risk read endpoints (13 files, GET handlers only)
`admin/orders.js` (GET only) · `admin/orders/[id].js` · `admin/returns.js` (GET only) · `admin/customers.js` · `admin/products.js` (GET only) · `admin/inventory.js` · `admin/inventory/[slug]/movements.js` · `admin/lots.js` (GET only) · `admin/suppliers.js` (GET only) · `admin/compliance.js` (GET only) · `admin/coupons/index.js` (GET only) · `admin/shipments.js` · `admin/email-logs.js` (optional, see §4)

Permissions introduced/reused: `orders:read`, `returns:update`(reused), `customers:read`, `inventory:read`, `suppliers:read`(new), `products:read`(new), `coupons:manage`(new, read half), `shipments:create`(reused), `email_logs:read`(new, optional).

### A1.2b — mutation endpoints, non-finance (12 files, POST/PATCH handlers)
`admin/orders.js` (PATCH) · `admin/orders/[id]/status.js` · `admin/orders/[id]/emails.js` · `admin/orders/[id]/shipments.js` · `admin/returns.js` (PATCH) · `admin/products.js` (PATCH/POST) · `admin/inventory/adjust.js` · `admin/inventory/[slug].js` · `admin/lots.js` (POST/PATCH) · `admin/suppliers.js` (POST/PATCH) · `admin/compliance.js` (PATCH) · `admin/coupons/index.js` (POST/PATCH)

Permissions introduced/reused: `orders:update`, `shipments:create`(reused), `returns:update`(reused), `inventory:adjust`, `suppliers:manage`(new), `products:update`(reused), `coupons:manage`(new, write half). **`orders.js` PATCH and `orders/[id]/status.js` PATCH are the highest-caution items in this batch** given their inventory/loyalty/email side effects — recommend implementing and testing these two first within A1.2b, in isolation, before the remaining 10 lower-blast-radius mutation routes in the same batch.

### A1.2c — sensitive finance/refund endpoints (3 files)
`admin/refunds.js` (GET+POST) · `admin/invoices.js` (GET+POST+PATCH) · `admin/bank-accounts.js` (GET+POST+PATCH)

Permissions introduced/reused: `refunds:update`(reused), `invoices:read`/`invoices:update`(reused), `bank_accounts:manage`(new). Recommend this batch ships last and gets the most manual staging verification, given `bank-accounts.js` controls where customer refunds/payments are routed.

**Total new `requireAdminPermission()` call sites across all three batches: 37, across 21 unique files.** No migration required for any batch (owner `['*']` covers every string immediately); a future migration to seed the 5 new strings (`products:read`, `suppliers:read`, `suppliers:manage`, `coupons:manage`, `bank_accounts:manage`) to specific non-owner roles is optional future work, only needed once a non-owner `admin_users` row is actually created.

---

## 8. Exact files likely to change (implementation, not this plan)

- 21 route files listed in §7 (a+b+c), each gaining 1–3 `requireAdminPermission()` call lines plus their existing `import { requireAdminPermission } from '../_lib/admin-audit.js';` (path depth varies per file, matching the existing relative-import pattern already used in `admin/users.js`, `admin/loyalty/adjust-points.js`, etc.).
- `scripts/validate-a1-2-admin-endpoint-permission-coverage.mjs` (new).
- `tests/local-integration.test.mjs` (new shared test helper + per-batch cases).
- `COSMOSKIN_PROJECT_MEMORY.md` (append a short "A1.2 coverage" note once implemented, listing the newly-gated routes and the 5 new permission strings, mirroring the existing "Admin RBAC (A1, 2026-07-04)" section).
- Possibly small `forbiddenPaths` adjustments in the H0/H1/H2/Batch validators if any of the 21 touched files happen to be on one of those lists (to be confirmed file-by-file at implementation time, same as A1.1 required for `admin-audit.js`).
- **No `supabase/migrations/*.sql` file**, **no SQL execution**, for any of A1.2a/b/c.

---

## 9. Rollback plan (for implementation time)

Each batch is an independent, additive, single-line-per-handler diff (`await requireAdminPermission(context, '<string>');` inserted after the existing `await assertAdmin(context);`), with no schema or data change. Rollback for any batch is a pure code revert of that batch's files — identical mechanism to the A1.1 rollback plan. Because batches are sequenced (a → b → c) and each is independently deployable, a problem discovered after deploying batch *b* can be rolled back without touching batch *a*'s already-verified changes, and batch *c* would simply not be deployed yet.

---

## 10. Explicitly out of scope for this plan

- No file was modified. No migration was created. No SQL was run. Nothing was deployed.
- A1.2 implementation (actually adding the `requireAdminPermission()` calls) was **not started** — this document is planning only, per instruction.
- `admin/users.js` GET, `admin/dashboard.js`, `admin/inventory/health.js`, `admin/session.js` are recommended to remain unchanged (see respective rows/sections above for rationale) — not silently included in any batch.
- `functions/api/reviews/[[path]].js` (admin review moderation, outside `functions/api/admin/**`) — noted for awareness only, not analyzed for a permission string here.
- Seeding new `admin_permissions` rows for the 5 new strings to non-owner roles, and creating any non-owner `admin_users` row — both explicitly future/optional work, not part of A1.2.

*Plan complete. Stopping here per instruction — awaiting approval before implementing A1.2a, A1.2b, or A1.2c.*
