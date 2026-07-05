# COSMOSKIN — A1.2b Admin Mutation Endpoint Coverage — Deployment Runbook

**Date:** 2026-07-05

> ## ⚠ Do not deploy A1.2b to production until the A1.1 Cloudflare Access verification is complete.
>
> A1.2b adds 16 mutation (write) endpoints on top of the exact same precondition A1.1 and A1.2a already required: `Cf-Access-Authenticated-User-Email` must be reliably injected on admin requests in production, and it must resolve to a seeded, active `admin_users` row. If that verification (from `COSMOSKIN_A1_ADMIN_RBAC_HARDENING_RUNBOOK_20260704.md`) has not been completed and confirmed, complete it **first** — this runbook assumes it already has been, and that A1.2a has already been deployed and verified (`COSMOSKIN_A1_2A_ADMIN_READ_COVERAGE_RUNBOOK_20260705.md`).

---

## 0. What changed and why this gate matters — more than A1.2a

A1.2a only affected *read* endpoints — if Cloudflare Access broke, the admin panel would show empty lists/403s on 13 pages, but every write action (order updates, shipments, inventory adjustments, coupon edits) still worked via `assertAdmin()` alone. **A1.2b removes that safety margin for writes.** If the Cloudflare Access → `admin_users` resolution fails after this deploy, the owner (or any admin) would be unable to:

- Update an order's status, payment status, or fulfillment status (`PATCH /api/admin/orders`, `PATCH /api/admin/orders/[id]/status`)
- Resend an order confirmation/status email (`POST /api/admin/orders/[id]/emails`)
- Record a shipment / tracking number (`POST /api/admin/orders/[id]/shipments`)
- Approve, reject, or update a return request (`PATCH /api/admin/returns`)
- Adjust product stock or create inventory rows (`PATCH`/`POST /api/admin/products`, `POST /api/admin/inventory/adjust`, `PATCH /api/admin/inventory/[slug]`)
- Create or edit a lot/SKT record (`POST`/`PATCH /api/admin/lots`)
- Create or edit a supplier record (`POST`/`PATCH /api/admin/suppliers`)
- Edit compliance/INCI metadata (`PATCH /api/admin/compliance`)
- Create or edit a coupon (`POST`/`PATCH /api/admin/coupons`)

This is functionally close to the entire day-to-day admin operations surface. **Treat the pre-deploy checklist below as mandatory, not optional**, and rehearse the rollback plan before deploying.

**Newly gated (16 handlers across 12 files):**

| Endpoint | Method | Permission |
|---|---|---|
| `/api/admin/orders` | PATCH | `orders:update` |
| `/api/admin/orders/[id]/status` | PATCH | `orders:update` |
| `/api/admin/orders/[id]/emails` | POST | `orders:update` |
| `/api/admin/orders/[id]/shipments` | POST | `shipments:create` |
| `/api/admin/returns` | PATCH | `returns:update` |
| `/api/admin/products` | PATCH | `inventory:adjust` |
| `/api/admin/products` | POST | `inventory:adjust` |
| `/api/admin/inventory/adjust` | POST | `inventory:adjust` |
| `/api/admin/inventory/[slug]` | PATCH | `inventory:adjust` |
| `/api/admin/lots` | POST | `inventory:adjust` |
| `/api/admin/lots` | PATCH | `inventory:adjust` |
| `/api/admin/suppliers` | POST | `suppliers:manage` |
| `/api/admin/suppliers` | PATCH | `suppliers:manage` |
| `/api/admin/compliance` | PATCH | `products:update` |
| `/api/admin/coupons` | POST | `coupons:manage` |
| `/api/admin/coupons` | PATCH | `coupons:manage` |

**Still `assertAdmin()`-only after this deploy:** `admin/refunds.js`, `admin/invoices.js`, `admin/bank-accounts.js` (A1.2c, deferred), `admin/dashboard.js`, `admin/inventory/health.js` (deliberate escape hatch), `admin/session.js` (never gated), `admin/users.js` GET (A1.1 decision).

---

## 1. Pre-deploy checklist

### Step 1 — Re-confirm the A1.1/A1.2a Cloudflare Access precondition is still true

1. Cloudflare Access application still protects the admin routes and still allows `cankolsun@gmail.com` / `cankolsun@cosmoskin.com.tr`.
2. `REQUIRE_CLOUDFLARE_ACCESS=true` is still set for the Production environment in the Cloudflare Pages project settings.
3. The two seeded owner `admin_users` rows (`role_code='owner'`, `permissions=['*']`, `is_active=true`) are unchanged.
4. A1.2a's 13 read endpoints are still working correctly in production (if A1.2a has already been deployed) — if any of them is currently 403'ing for the owner, **stop and fix that first**; A1.2b will only make the underlying problem worse.

### Step 2 — Identify any non-owner admin who currently performs these 16 mutation actions

This is a **data/seeding decision**, not a code change, and is intentionally outside A1.2b's scope.

1. Query `admin_users` for any active, non-owner row (`role_code != 'owner'` and `permissions` does not contain `'*'`).
2. Cross-check against the pre-existing `admin_permissions` seed (`supabase/migrations/20260626_production_launch_readiness.sql`): `orders:update` → `operations`; `returns:update` → `operations`, `customer_support`; `inventory:adjust` → `warehouse`; `products:update` → `content_editor`; `shipments:create` → not yet seeded to a non-owner role (already the case before this batch, since the sibling `dhl-shipment.js`/`shipments/[id]/sync.js` routes use the same string).
3. Two permission strings are brand-new and **not seeded to any non-owner role**: `suppliers:manage`, `coupons:manage`. Any non-owner admin who currently edits suppliers or coupons will be 403'd immediately after this deploy, until an explicit `admin_permissions` seed row is added for their role. If this applies today, seed the required row(s) before deploying (e.g. `INSERT INTO admin_permissions (role_code, permission) VALUES ('operations', 'coupons:manage')`), or accept and communicate the temporary 403 to the affected operator ahead of time.
4. As with A1.2a, since only 2 owner `admin_users` rows exist today (per the live preflight in the A1.1 report), this step is currently a no-op in practice — it only matters once a non-owner `admin_users` row is created.

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
2. On the preview deployment (if it is also Access-protected), as the owner:
   a. Confirm the A1.2a read endpoints still load (regression check).
   b. Exercise at least 2-3 of the new mutation actions end-to-end — e.g. update a test order's status, add/edit a test supplier record, create/edit a test coupon — and confirm each succeeds (not a 403).
3. Deploy to production.
4. Immediately after production deploy, as the owner, exercise the two **highest-caution** actions first, in isolation, before anything else:
   a. `PATCH /api/admin/orders` (or the equivalent panel action) — update a real or test order's status.
   b. `PATCH /api/admin/orders/[id]/status` — same, via the alternate status-update route if the admin UI uses it.
   Confirm both succeed and that the resulting order state, inventory reservation state, and any triggered email/loyalty side effects look correct — these two endpoints carry the highest business-logic risk in this batch.
5. Exercise the remaining 10 lower-risk mutation actions (shipment creation, return decision, product/inventory adjustment, lot/supplier edit, compliance edit, coupon create/edit) at your own pace within the same deploy session.
6. Re-confirm at least one A1.2a read endpoint and the two escape-hatch routes (`admin/dashboard.js`, `admin/inventory/health.js`) still load without a permission gate, as a sanity check that neither was accidentally touched.
7. If step 4 fails (owner gets a 403 on either high-caution endpoint), **do not attempt further diagnosis in production** — immediately follow `COSMOSKIN_A1_2B_ADMIN_MUTATION_COVERAGE_ROLLBACK_PLAN_20260705.md`.

---

## 3. Post-deploy verification (within the same session)

- [ ] Owner can perform all 16 newly-gated mutation actions without a 403.
- [ ] The two high-caution order-status endpoints were exercised first, in isolation, and produced correct order/inventory/email/loyalty side effects.
- [ ] Any non-owner admin identified in Step 2 above can still perform the mutations they rely on (either their role already has the permission seeded, a new seed row was added before deploy, or the temporary 403 was expected and communicated).
- [ ] A1.2a's 13 read endpoints still work exactly as before — no regression.
- [ ] The two escape-hatch routes (`admin/dashboard.js`, `admin/inventory/health.js`) and `admin/session.js` still load/function without any permission gate.
- [ ] A1.2c finance routes (`refunds.js`, `invoices.js`, `bank-accounts.js`) are unaffected — still `assertAdmin()`-only, as before this deploy.
- [ ] No unexpected spike in 403 responses on `/api/admin/*` in Cloudflare's request logs/analytics in the minutes following deploy.

---

## 4. Known, accepted limitations

- `suppliers:manage` and `coupons:manage` have no seeded `admin_permissions` rows for any non-owner role. Only the owner can pass these checks until a role is explicitly granted one via a future, separate data-seeding change. This is intentional — A1.2b's job was code-level gating only, per instructions ("do not run SQL").
- A1.2c (finance/refund/bank-account endpoints) remains fully `assertAdmin()`-only after this deploy — its security posture is unchanged, neither improved nor worsened by A1.2b.
- As noted in the A1.2 plan's lockout-risk section, because only 2 owner `admin_users` rows exist today and `['*']` always passes, the exact permission string chosen for any given route has no practical effect on today's only real admin users — the risk is entirely about whether Cloudflare Access → `admin_users` resolution succeeds at all, which is unchanged in kind (only wider in blast radius) since A1.1.
