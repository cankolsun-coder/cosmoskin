# COSMOSKIN — A1.2c Admin Finance / Refund / Bank-Account Coverage — Deployment Runbook

**Date:** 2026-07-05

> ## ⚠ Do not deploy A1.2c to production until Cloudflare Access verification is complete.
>
> A1.2c gates the last and most sensitive remaining admin surface — money-adjacent flows — on top of the exact same precondition A1.1, A1.2a, and A1.2b already required: `Cf-Access-Authenticated-User-Email` must be reliably injected on admin requests in production, and it must resolve to a seeded, active `admin_users` row. If that verification (from `COSMOSKIN_A1_ADMIN_RBAC_HARDENING_RUNBOOK_20260704.md`) has not been completed and confirmed, complete it **first** — this runbook assumes it already has been, and that A1.2a and A1.2b have already been deployed and verified.

---

## 0. What changed and why this gate matters — the widest blast radius yet

A1.2a only affected reads; A1.2b added the day-to-day order/inventory/coupon mutation surface but left finance untouched. **A1.2c removes the last safety margin: refund creation, invoice management, and bank-account routing.** If the Cloudflare Access → `admin_users` resolution fails after this deploy, the owner (or any admin) would be unable to:

- View existing refund records (`GET /api/admin/refunds`)
- Create a manual refund record, including the loyalty-points reversal and refund-completion email that fire when a refund is marked `completed` (`POST /api/admin/refunds`)
- View existing invoice records (`GET /api/admin/invoices`)
- Create or update an invoice record (`POST`/`PATCH /api/admin/invoices`)
- View the configured bank-transfer accounts (`GET /api/admin/bank-accounts`)
- Create or edit a bank-transfer account, including the IBAN used to route customer bank-transfer payments (`POST`/`PATCH /api/admin/bank-accounts`)

This is the entire finance/fiscal-record surface of the admin panel. **Treat the pre-deploy checklist below as mandatory, not optional**, and rehearse the rollback plan before deploying.

**Newly gated (8 handlers across 3 files):**

| Endpoint | Method | Permission |
|---|---|---|
| `/api/admin/refunds` | GET | `refunds:update` |
| `/api/admin/refunds` | POST | `refunds:update` |
| `/api/admin/invoices` | GET | `invoices:read` |
| `/api/admin/invoices` | POST | `invoices:update` |
| `/api/admin/invoices` | PATCH | `invoices:update` |
| `/api/admin/bank-accounts` | GET | `bank_accounts:manage` |
| `/api/admin/bank-accounts` | POST | `bank_accounts:manage` |
| `/api/admin/bank-accounts` | PATCH | `bank_accounts:manage` |

**Still `assertAdmin()`-only after this deploy (deliberately, permanently):** `admin/dashboard.js`, `admin/inventory/health.js` (escape hatch), `admin/session.js` (never gated), `admin/users.js` GET (A1.1 decision).

---

## 1. Pre-deploy checklist

### Step 1 — Re-confirm the Cloudflare Access precondition is still true

1. Cloudflare Access application still protects the admin routes and still allows `cankolsun@gmail.com` / `cankolsun@cosmoskin.com.tr`.
2. `REQUIRE_CLOUDFLARE_ACCESS=true` is still set for the Production environment in the Cloudflare Pages project settings.
3. The two seeded owner `admin_users` rows (`role_code='owner'`, `permissions=['*']`, `is_active=true`) are unchanged.
4. A1.2a's 13 read endpoints and A1.2b's 16 mutation endpoints are still working correctly in production (if already deployed) — if any of them is currently 403'ing for the owner, **stop and fix that first**; A1.2c will only make the underlying problem worse.

### Step 2 — Identify any non-owner admin who currently performs refund, invoice, or bank-account actions

This is a **data/seeding decision**, not a code change, and is intentionally outside A1.2c's scope (per instruction: "do not create a migration", "do not run SQL").

1. Query `admin_users` for any active, non-owner row (`role_code != 'owner'` and `permissions` does not contain `'*'`).
2. Cross-check against the pre-existing `admin_permissions` seed (`supabase/migrations/20260626_production_launch_readiness.sql`): `refunds:update` → `operations`; `invoices:read`/`invoices:update` → `accountant` (and `invoices:update` also → `operations`).
3. **`bank_accounts:manage` is brand-new and not seeded to any non-owner role.** Any non-owner admin who currently manages bank-transfer accounts will be 403'd immediately after this deploy, until an explicit `admin_permissions` seed row is added for their role (e.g. `INSERT INTO admin_permissions (role_code, permission) VALUES ('operations', 'bank_accounts:manage')`), or accept and communicate the temporary 403 to the affected operator ahead of time. Given how fraud-sensitive bank-account routing is, consider deliberately keeping this owner-only for longer than the other permission strings, rather than seeding it broadly by default.
4. As with A1.2a/A1.2b, since only 2 owner `admin_users` rows exist today (per the live preflight in the A1.1 report), this step is currently a no-op in practice — it only matters once a non-owner `admin_users` row is created or granted one of these permissions.

### Step 3 — Local validation (already run once during implementation; re-run immediately before deploy)

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
All must pass with zero failures before deploying.

---

## 2. Deploy sequence

1. Deploy to a preview/staging Cloudflare Pages deployment first, if available.
2. On the preview deployment (if it is also Access-protected), as the owner:
   a. Confirm the A1.2a read endpoints and A1.2b mutation endpoints still work (regression check).
   b. Load the three new finance reads: `GET /api/admin/refunds`, `GET /api/admin/invoices`, `GET /api/admin/bank-accounts` — confirm none 403 for the owner.
   c. Perform **one safe, non-destructive mutation test per file** against test/known-safe data only:
      - `invoices.js`: a `PATCH` that only touches a test invoice's `invoice_number`/`note`-equivalent field, or a no-op status update.
      - `refunds.js`: a manual refund record against a known test order, with `status: 'pending'` (not `'completed'`, to avoid triggering the real loyalty-points reversal and completion email against a live customer order).
      - `bank-accounts.js`: a `GET`, plus if a staging-only test bank account exists, a `PATCH` that only touches its `sort_order` or `is_active` flag.
3. Deploy to production.
4. Immediately after production deploy, as the owner, in this order:
   a. `GET /api/admin/refunds`, `GET /api/admin/invoices`, `GET /api/admin/bank-accounts` — confirm all three load (regression check for the new read gates).
   b. Perform **one safe preview or staging finance mutation test** as described in step 2c above — do not perform a live, customer-facing refund completion or bank-account IBAN change as your first production verification action.
5. Re-confirm A1.2a's 13 read endpoints, A1.2b's 16 mutation endpoints, and the two escape-hatch routes (`admin/dashboard.js`, `admin/inventory/health.js`) still work exactly as before, as a sanity check that none was accidentally touched.
6. If step 4 fails (owner gets a 403 on any of the three finance files), **do not attempt further diagnosis in production** — immediately follow `COSMOSKIN_A1_2C_ADMIN_FINANCE_COVERAGE_ROLLBACK_PLAN_20260705.md`.

---

## 3. Post-deploy verification (within the same session)

- [ ] Owner can access all 3 finance read endpoints (`refunds`, `invoices`, `bank-accounts`) without a 403.
- [ ] Owner can perform the one safe mutation test per finance file described in §2 without a 403, and the resulting record/state looks correct.
- [ ] Any non-owner admin identified in Step 2 above can still perform the finance actions they rely on (either their role already has the permission seeded, a new seed row was added before deploy, or the temporary 403 was expected and communicated).
- [ ] A1.2a's 13 read endpoints and A1.2b's 16 mutation endpoints still work exactly as before — no regression.
- [ ] The two escape-hatch routes (`admin/dashboard.js`, `admin/inventory/health.js`) and `admin/session.js` still load/function without any permission gate.
- [ ] No unexpected spike in 403 responses on `/api/admin/*` in Cloudflare's request logs/analytics in the minutes following deploy.

---

## 4. Known, accepted limitations

- `bank_accounts:manage` has no seeded `admin_permissions` row for any non-owner role. Only the owner can pass this check until a role is explicitly granted one via a future, separate data-seeding change. This is intentional — A1.2c's job was code-level gating only, per instructions ("do not create a migration", "do not run SQL"), and the plan deliberately recommends keeping this fraud-sensitive permission conservative.
- `refunds:update` and `invoices:read`/`invoices:update` are already seeded to `operations`/`accountant`, so those two files are usable by non-owner roles today without any further action, assuming Cloudflare Access resolves correctly.
- As noted in the A1.2 plan's lockout-risk section, because only 2 owner `admin_users` rows exist today and `['*']` always passes, the exact permission string chosen for any given route has no practical effect on today's only real admin users — the risk is entirely about whether Cloudflare Access → `admin_users` resolution succeeds at all, which is unchanged in kind (only wider in blast radius, now covering all of finance) since A1.1.
- This is the final planned batch of the A1.2 admin endpoint coverage expansion. No further batch has been started or approved.
