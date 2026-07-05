# COSMOSKIN — A1.1 Admin RBAC Hardening — Deployment Runbook

**Date:** 2026-07-04

> ## ⚠ Do not deploy A1.1 to production until Cloudflare Access is confirmed to inject `Cf-Access-Authenticated-User-Email` for admin routes.
>
> This is the single hard gate for this deploy. Everything else below is standard rollout process; this one step is what prevents a production lockout.

---

## 0. Why this gate exists

`hasAdminPermission()` (`functions/api/_lib/admin-audit.js`) now denies any admin permission check when no `admin_users` row matches the caller's identity (previously it allowed everything in that case). The *only* source of that identity is the `Cf-Access-Authenticated-User-Email` request header. If Cloudflare Access is not actually configured to authenticate the operator and inject that header on requests to `/api/admin/*`, the header will be empty on every real request, `hasAdminPermission()` will now correctly (and unavoidably) deny every one of the 9 permission-gated endpoints — including for the owner.

**This only affects the 9 endpoints below.** It does **not** affect the other ~24 `functions/api/admin/**` routes, which are gated only by `assertAdmin()` (the shared `ADMIN_TOKEN`/signed-session check) and never call `hasAdminPermission()`:

- `functions/api/admin/loyalty/adjust-points.js`
- `functions/api/admin/shipments/[id]/sync.js`
- `functions/api/admin/shipments/[id]/label.js`
- `functions/api/admin/orders/[id]/dhl-shipment.js`
- `functions/api/admin/returns/[id]/dhl-return-shipment.js`
- `functions/api/admin/coupons/issue-customer-coupon.js`
- `functions/api/email/retry-failed.js`
- `functions/api/invoices/qnb-create.js`
- **`functions/api/admin/users.js`** (new as of A1.1 — `admin.users.manage` gate)

---

## 1. Pre-deploy checklist (must complete in order)

### Step 1 — Confirm Cloudflare Access is live for admin routes (external, manual, cannot be automated by this codebase)

1. Log into the Cloudflare dashboard for the account hosting `cosmoskin.com.tr`.
2. Go to **Zero Trust → Access → Applications**. Confirm an Access application exists that covers the admin routes (`/api/admin/*` and, if applicable, `/admin/*` HTML paths) on the production hostname.
3. Confirm the application's policy allows exactly the intended operator identities — at minimum `cankolsun@gmail.com` and `cankolsun@cosmoskin.com.tr`.
4. Go to the Cloudflare Pages project (`cosmoskin`) → **Settings → Environment variables** (Production). Confirm `REQUIRE_CLOUDFLARE_ACCESS` is set to `true` for Production. (It is **not** set in the repository's `wrangler.toml`, only recommended in `.env.example` — this must be a dashboard-level secret/variable if it's set at all.)
5. If either the Access application or `REQUIRE_CLOUDFLARE_ACCESS=true` is missing: **stop here.** Configure Cloudflare Access first, or coordinate with whoever manages the Cloudflare account. Do not proceed to Step 2 until this is confirmed.

### Step 2 — Confirm the header is actually injected (a real request, not just configuration review)

1. From a browser authenticated through the configured Access application (i.e., you've completed the Access login/SSO flow for the admin hostname), make one request to any of the 9 gated endpoints (e.g. `POST /api/admin/loyalty/adjust-points` with a deliberately invalid body, just to observe the response code — a `400` for bad input is a healthier signal than a `403` here, since a `403` would mean the Access header either isn't present or doesn't map to a seeded admin).
2. If Cloudflare request logging or a temporary debug log is available, confirm `Cf-Access-Authenticated-User-Email` is present on that request and matches one of the two seeded owner emails exactly (case-insensitive — `hasAdminPermission()` lowercases before lookup).
3. If this cannot be confirmed with confidence, do not deploy. Escalate to confirm Access configuration before proceeding.

### Step 3 — Confirm the seeded `admin_users` rows are unchanged

Both rows were confirmed correctly shaped in `COSMOSKIN_PREFLIGHT_LIVE_DB_VERIFICATION_20260704.md` (2026-07-04): `role_code='owner'`, `permissions=['*']`, `is_active=true`, for `cankolsun@gmail.com` and `cankolsun@cosmoskin.com.tr`. Re-verify this hasn't drifted (e.g. via a read-only Supabase query) immediately before deploying, since any time may have passed between that preflight and this deploy.

---

## 2. Deploy sequence

1. Deploy to a preview/staging Cloudflare Pages deployment first if one is available for this project (not directly to the production custom domain).
2. On the preview deployment, repeat Step 2 above (a real authenticated request to a gated endpoint) if the preview environment is also behind Cloudflare Access; if the preview is not Access-protected, this step can only be meaningfully done against production — factor that into how cautious the production rollout should be.
3. Deploy to production.
4. Immediately after production deploy, as the owner:
   - Log into the admin panel via the normal `ADMIN_TOKEN` → signed-session flow (`assets/admin-runtime.js`'s existing login modal — unchanged by this batch).
   - Exercise one of the 9 gated endpoints (the loyalty adjustment panel is a good, low-risk pick — it does not affect payments/inventory).
   - Confirm success (not a 403).
   - Exercise a read-only, non-gated endpoint (e.g. `GET /api/admin/orders`) to confirm the other 24 files are unaffected, as expected.
5. If step 4 fails (owner gets a 403 on a previously-working gated endpoint), **do not attempt further diagnosis in production** — immediately follow `COSMOSKIN_A1_ADMIN_RBAC_HARDENING_ROLLBACK_PLAN_20260704.md`.

---

## 3. Post-deploy verification (within the same session)

- [ ] Owner can access the admin panel and successfully use a `requireAdminPermission()`-gated action (e.g. loyalty adjustment).
- [ ] Owner can successfully create/update an `admin_users` row via `/api/admin/users` (proves the new `admin.users.manage` gate does not lock out the owner's own admin-management ability).
- [ ] A request to `/api/admin/users` (POST/PATCH) from a session that is valid per `assertAdmin()` but has no matching/active `admin_users` row returns 403 with the standard Turkish message — not a raw error, not a silent success. (This is best verified in a lower environment if one exists that mirrors production's Access configuration; if not available, this is the one check that may need to remain a code-review/test-suite guarantee rather than a live production probe, to avoid deliberately exercising an unauthorized path against production.)
- [ ] The other ~24 `assertAdmin()`-only admin routes behave identically to before this deploy (spot-check 2-3, e.g. `GET /api/admin/orders`, `GET /api/admin/refunds`).
- [ ] No unexpected spike in 403 responses on `/api/admin/*` in Cloudflare's request logs/analytics in the minutes following deploy.

---

## 4. Known, accepted limitations (not blockers, documented for awareness)

- `Cf-Access-Jwt-Assertion` presence is checked by `assertCloudflareAccess()` but its signature is not cryptographically verified by this codebase — Cloudflare's own edge-level header-stripping protection is what actually prevents spoofing of `Cf-Access-Authenticated-User-Email`, not application-level JWT validation. This is an accepted, pre-existing gap, unchanged by A1.1.
- A1.2 (extending `requireAdminPermission()` coverage to the other ~24 `assertAdmin()`-only admin routes) is a separate, larger, future batch. Those routes' security posture (single shared-token gate, no per-role differentiation) is unchanged by this deploy — neither improved nor worsened.
