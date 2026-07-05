# COSMOSKIN — A1.2a Admin GET/Read Endpoint Coverage — Deployment Runbook

**Date:** 2026-07-05

> ## ⚠ Do not deploy A1.2a to production until the A1.1 Cloudflare Access verification is complete.
>
> A1.2a adds 13 more endpoints that depend on the exact same precondition A1.1 already required: `Cf-Access-Authenticated-User-Email` must be reliably injected on admin requests in production, and it must resolve to a seeded, active `admin_users` row. If that verification (from `COSMOSKIN_A1_ADMIN_RBAC_HARDENING_RUNBOOK_20260704.md`) has not been completed and confirmed, complete it **first** — this runbook assumes it already has been.

---

## 0. What changed and why this gate matters

`hasAdminPermission()` (unchanged by A1.2a — still the A1.1 deny-by-default version) now backs 13 additional GET/read-only admin endpoints. Each endpoint keeps its existing `assertAdmin()` check (shared token/session — unaffected) and *adds* `requireAdminPermission(context, '<resource>:read')`. If the caller's `admin_users` row does not carry that specific permission (directly, or via the owner `['*']` wildcard, or via a seeded `admin_permissions` row for their role), the endpoint now returns `403` where it previously would have returned `200`.

**Newly gated (13):**

| Endpoint | Permission |
|---|---|
| `GET /api/admin/orders` | `orders:read` |
| `GET /api/admin/orders/[id]` | `orders:read` |
| `GET /api/admin/returns` | `returns:read` |
| `GET /api/admin/customers` | `customers:read` |
| `GET /api/admin/products` | `products:read` |
| `GET /api/admin/inventory` | `inventory:read` |
| `GET /api/admin/inventory/[slug]/movements` | `inventory:read` |
| `GET /api/admin/lots` | `lots:read` |
| `GET /api/admin/suppliers` | `suppliers:read` |
| `GET /api/admin/compliance` | `compliance:read` |
| `GET /api/admin/coupons` | `coupons:read` |
| `GET /api/admin/shipments` | `shipments:read` |
| `GET /api/admin/email-logs` | `email_logs:read` |

**Still `assertAdmin()`-only (unaffected by this deploy):** every mutation handler in the files above, `admin/refunds.js`, `admin/invoices.js`, `admin/bank-accounts.js`, `admin/dashboard.js`, `admin/inventory/health.js`, and all other admin routes not listed in the table.

---

## 1. Pre-deploy checklist

### Step 1 — Re-confirm the A1.1 Cloudflare Access precondition is still true

Do not re-do the full A1.1 verification from scratch if it was already confirmed and nothing about Access configuration has changed since. Do re-confirm quickly:

1. Cloudflare Access application still protects the admin routes and still allows `cankolsun@gmail.com` / `cankolsun@cosmoskin.com.tr`.
2. `REQUIRE_CLOUDFLARE_ACCESS=true` is still set for the Production environment in the Cloudflare Pages project settings.
3. The two seeded owner `admin_users` rows (`role_code='owner'`, `permissions=['*']`, `is_active=true`) are unchanged.

If any of these has drifted, stop and fix it before proceeding — the impact of a broken Access chain is now 13 more endpoints wide than it was after A1.1 alone.

### Step 2 — Identify any non-owner admin who currently uses these 13 pages

This is a **data/seeding decision**, not a code change, and is intentionally outside A1.2a's scope. Before deploying:

1. Query `admin_users` for any active, non-owner row (i.e., `role_code != 'owner'` and `permissions` does not contain `'*'`).
2. For each such admin, determine which of the 13 newly-gated pages they currently rely on (Orders list/detail, Returns, Customers, Products, Inventory, Inventory movements, Lots, Suppliers, Compliance, Coupons, Shipments, Email logs).
3. Three of the eight new colon-notation permissions already partially overlap the pre-existing seed (`orders:read` is already granted to `operations`/`warehouse`/`customer_support`/`accountant`; `customers:read` to `customer_support`; `inventory:read` to `warehouse`) — those roles will **not** notice a change for those specific pages.
4. For the remaining new strings (`returns:read`, `products:read`, `lots:read`, `suppliers:read`, `compliance:read`, `coupons:read`, `shipments:read`, `email_logs:read`), **no role currently has them seeded.** Any non-owner admin who currently uses one of those pages will be 403'd immediately after this deploy, until an explicit `admin_permissions` seed row is added for their role. If this applies, seed the required row(s) in `admin_permissions` (e.g. `INSERT INTO admin_permissions (role_code, permission) VALUES ('customer_support', 'returns:read')`) **before** deploying this batch, or accept the temporary 403 for that role as expected behavior and communicate it to the affected operator ahead of time.

### Step 3 — Local validation (already run once during implementation; re-run immediately before deploy)

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
All must pass with zero failures before deploying.

---

## 2. Deploy sequence

1. Deploy to a preview/staging Cloudflare Pages deployment first, if available.
2. On the preview deployment (if it is also Access-protected), as the owner: load each of the 13 admin pages/panels listed above and confirm none returns a 403.
3. Deploy to production.
4. Immediately after production deploy, as the owner, exercise a representative sample (not necessarily all 13, but at least 4-5 spanning different files) — e.g. Orders list, Returns list, Products list, Coupons list, Email logs — and confirm each loads successfully (not a 403).
5. Exercise one mutation action that shares a file with a newly-gated GET (e.g. update an order's status via `PATCH /api/admin/orders/[id]/status`, or edit a product via `PATCH /api/admin/products`) to confirm mutation paths are completely unaffected, as expected.
6. If step 4 fails (owner gets a 403 on a previously-working page), **do not attempt further diagnosis in production** — immediately follow `COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_ROLLBACK_PLAN_20260705.md`.

---

## 3. Post-deploy verification (within the same session)

- [ ] Owner can load all 13 newly-gated pages without a 403.
- [ ] Any non-owner admin identified in Step 2 above can still load the pages they rely on (either because their role already has the permission seeded, or because a new seed row was added before deploy, or because the temporary 403 was expected and communicated).
- [ ] Mutation actions in the same files (order status update, return decision, product edit, lot/supplier edit, compliance edit, coupon create/edit) still work exactly as before — no new 403 on any write path.
- [ ] The two escape-hatch routes (`admin/dashboard.js`, `admin/inventory/health.js`) still load without any permission gate, as a sanity check that the escape hatch itself was not accidentally touched.
- [ ] No unexpected spike in 403 responses on `/api/admin/*` in Cloudflare's request logs/analytics in the minutes following deploy.

---

## 4. Known, accepted limitations

- The eight brand-new permission strings (`returns:read`, `products:read`, `lots:read`, `suppliers:read`, `compliance:read`, `coupons:read`, `shipments:read`, `email_logs:read`) have no seeded `admin_permissions` rows for any non-owner role. Only the owner can pass these checks until a role is explicitly granted one via a future, separate data-seeding change. This is intentional — A1.2a's job was code-level gating only, per instructions ("do not run SQL").
- A1.2b (mutation endpoints) and A1.2c (finance/refund/bank-account endpoints) remain fully `assertAdmin()`-only after this deploy — their security posture is unchanged, neither improved nor worsened by A1.2a.
