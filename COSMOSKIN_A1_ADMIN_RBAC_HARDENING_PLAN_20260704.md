# COSMOSKIN — A1: RBAC Deny-by-Default Hardening — Implementation Plan

**Date:** 2026-07-04
**Type:** Planning document only. No files modified, no migrations created, no SQL executed, nothing deployed.
**Inputs read:** `COSMOSKIN_PREFLIGHT_LIVE_DB_VERIFICATION_20260704.md`, `COSMOSKIN_P0_P1_REMEDIATION_PLAN_20260704.md`, `COSMOSKIN_PROJECT_MEMORY.md`, `functions/api/_lib/admin-audit.js`, `functions/api/_lib/admin.js`, all 31 files under `functions/api/admin/**`, `functions/api/email/retry-failed.js`, `functions/api/invoices/qnb-create.js`, `functions/api/reviews/[[path]].js`, `functions/api/admin/users.js`, `assets/admin-runtime.js`, `wrangler.toml`, `.env.example`, and current Cloudflare Access documentation (via web search, cited in §2).

There is no `functions/api/_lib/admin-auth.js` file in this codebase — the two relevant helper files are `functions/api/_lib/admin.js` (session/token layer) and `functions/api/_lib/admin-audit.js` (permission/RBAC layer + activity log).

---

## 0. Executive summary

- **The allow-all bypass is exactly one line:** `functions/api/_lib/admin-audit.js:29` — `if (!admin) return true;` inside `hasAdminPermission()`. There is no separate "self-flag" or client-supplied `is_admin`/`role` field anywhere in the codebase that grants admin access — confirmed by grep across all of `functions/api/`. The only bypass is this single allow-all default.
- **The blast radius of fixing that one line is smaller than it sounds.** Only **8 of 101** API route files call `requireAdminPermission()`/`hasAdminPermission()` at all (6 inside `functions/api/admin/**`, plus `functions/api/email/retry-failed.js` and `functions/api/invoices/qnb-create.js`). The other **25 of 31** `functions/api/admin/**` files — including the highest-blast-radius ones (`admin/orders.js`, `admin/refunds.js`, `admin/inventory/adjust.js`, `admin/users.js`, `admin/customers.js`) — are gated **only** by `assertAdmin()` (the shared session/token check) and are **completely unaffected** by any change to `hasAdminPermission()`'s default, because they never call it. Flipping the default does not, by itself, expand protection to those 25 files — that is a separate, larger, coverage-expansion decision (see §5).
- **The one real precondition, confirmed unresolved by this plan:** `hasAdminPermission()`'s only source of caller identity is the `Cf-Access-Authenticated-User-Email` request header (`admin-audit.js:12-13`, `getAccessEmail()`). This header **cannot be spoofed by an external client** — Cloudflare's edge strips any client-supplied header of this exact name on all Cloudflare-proxied traffic (confirmed via current Cloudflare/community documentation, §2) — but it is only ever **populated** if Cloudflare Access is actually configured and enforcing on the admin routes in production. `wrangler.toml`'s `[vars]` block does not set `REQUIRE_CLOUDFLARE_ACCESS` (only `.env.example` recommends it), so this cannot be confirmed from the repository. **If Access is not actually configured, flipping the default to deny-by-default will lock out everyone, including the owner, on exactly the 8 already-permission-gated endpoints** — not the other 25, which don't call `hasAdminPermission()` at all and stay reachable via `assertAdmin()` regardless.
- **A related, higher-severity finding surfaced during this investigation, not in the original P0/P1 list:** `functions/api/admin/users.js` (POST/PATCH to `admin_users`, including the `role` column) is gated **only** by `assertAdmin()` — any caller who has completed the signed-session login flow (i.e., anyone who at some point supplied the raw shared `ADMIN_TOKEN`) can insert or edit an `admin_users` row with `role: 'owner'` for their own email, self-escalating to full wildcard permissions regardless of what `hasAdminPermission()`'s default is. This does not require the Cloudflare Access header at all. Flipping `hasAdminPermission()`'s default without also closing this gap only partially achieves "deny-by-default" — see §4 and §5 for the recommended fix, which is small and does not require new data.
- **Recommendation:** proceed with **A1.1 (this plan's core scope)** — flip the one-line default, close the `admin/users.js` self-escalation gap, add the validator/tests below — **gated on an operational confirmation step that is not a code change** (§3/§9). Do **not** expand `requireAdminPermission` coverage to the other 25 files in this pass; treat that as **A1.2**, a separate, larger, higher-blast-radius batch (§5).

---

## 1. Admin auth layers

| # | Helper | File:line | Current behavior | Risk | Used by admin endpoints? |
|---|---|---|---|---|---|
| 1 | `assertAdmin()` | `functions/api/_lib/admin.js:137-159` | Verifies a signed HMAC session token (`v1.<exp>.<nonce>.<sig>`, `ADMIN_SESSION_SECRET`-signed, issued by `issueAdminSession()`); falls back to raw shared `ADMIN_TOKEN` constant-time compare **only if** `ADMIN_ALLOW_LEGACY_TOKEN !== 'false'` (live `wrangler.toml` sets this to `"false"`, so legacy raw-token admin API calls are disabled by config today — only signed sessions work). Independent of `admin_users`; carries no notion of role or permission, only "this caller previously supplied the correct shared secret." | Rate-limited (8 failures / 10 min / IP), constant-time compare, no secrets logged. Not itself a bypass — but it is the **only** gate for 25 of 31 `admin/**` files. | **All 31** `functions/api/admin/**` files, plus `functions/api/email/retry-failed.js`, `functions/api/invoices/qnb-create.js`, `functions/api/reviews/[[path]].js` (admin moderation branch) — 34 call sites total. |
| 2 | `assertCloudflareAccess()` | `functions/api/_lib/admin.js:85-93` | No-ops entirely unless `env.REQUIRE_CLOUDFLARE_ACCESS === 'true'`. When active, requires `Cf-Access-Jwt-Assertion` + `Cf-Access-Authenticated-User-Email` to be present — does **not** itself verify the JWT signature (trust is delegated to Cloudflare Access having validated it at the edge before the request reaches the Function). | If `REQUIRE_CLOUDFLARE_ACCESS` is unset/false in production, this is a complete no-op and never requires or checks anything. | Called inside `assertAdmin()` (so it runs on all 34 call sites above) and `issueAdminSession()` (the `/api/admin/session` login endpoint). |
| 3 | `getAccessEmail()` | `functions/api/_lib/admin-audit.js:12-14` | Reads `Cf-Access-Authenticated-User-Email` directly off the request header, lowercased nowhere at this layer. No validation, no JWT check — trusts the header verbatim. | Safe **only** because Cloudflare's edge strips client-supplied headers of this exact name (see §2) — this function has no independent verification of its own. | Feeds `getAdminRecord()`, `hasAdminPermission()`, `recordAdminActivity()`. |
| 4 | `getAdminRecord()` | `functions/api/_lib/admin-audit.js:16-25` | Looks up `admin_users` by `email = lower(header value)`. Returns `null` if header absent or no row matches. | None beyond what `getAccessEmail()` and the DB lookup provide. | Feeds `hasAdminPermission()`, `recordAdminActivity()`. |
| 5 | `hasAdminPermission()` | `functions/api/_lib/admin-audit.js:27-40` | **`if (!admin) return true;`** — the confirmed allow-all bypass. If a match is found: `is_active === false` → deny; direct `permissions` array containing `'*'` or the exact permission → allow; `role_code \|\| role === 'owner'` → allow; otherwise looks up `admin_permissions` by `role_code` and allows if that role has `'*'` or the exact permission. | **This is the P0 finding.** Any caller who reaches a `requireAdminPermission()` call site without a matching `admin_users` row (including one with **no** Cloudflare Access header at all) is granted the permission. | Called by `requireAdminPermission()` only. |
| 6 | `requireAdminPermission()` | `functions/api/_lib/admin-audit.js:42-49` | Throws a `403` (`error.status = 403`, Turkish message) if `hasAdminPermission()` returns falsy. | Inherits all of #5's risk. | Exactly 8 call sites (see table below) — all of them call `assertAdmin(context)` immediately before this, in every case observed. |
| 7 | `recordAdminActivity()` | `functions/api/_lib/admin-audit.js:51-70` | Writes to `admin_activity_logs`, using `getAdminRecord()`/`getAccessEmail()` for actor attribution; swallows its own errors (fire-and-forget). | Not an authorization gate — pure logging. If the Access header is absent, `actor_email` is `null`, weakening audit trail, but does not affect access control. | Used in 6 of the 8 `requireAdminPermission()` call sites (`admin/orders/[id]/dhl-shipment.js`, `admin/returns/[id]/dhl-return-shipment.js`, `admin/shipments/[id]/sync.js`, `admin/coupons/issue-customer-coupon.js`, `admin/loyalty/adjust-points.js`, `functions/api/email/retry-failed.js`). |
| 8 | `issueAdminSession()` | `functions/api/_lib/admin.js:119-135` | The `/api/admin/session` login handler. Calls `assertCloudflareAccess()` first (so if Access **is** required, the login step already has a verified email in hand — but the resulting signed session token does **not** embed that email; see §4 for why this matters), then validates the raw `ADMIN_TOKEN`, then issues a signed session. | See §4's proposed enhancement. | `functions/api/admin/session.js` only. |
| 9 | Client-provided `is_admin`/`role`/`permissions` flags | — | **None found.** Grep across all of `functions/api/**/*.js` for `is_admin`, `isAdmin`, `body.role`, `body.permissions`, `x-admin-role`, `adminRole` found no code path that reads a client-supplied flag and uses it to grant admin/permission access. The one hit, `functions/api/admin/users.js:23,37`, reads `body.role` — but only to **write** a new/updated `admin_users.role` value (see the next row), not to authorize the current request. | N/A — confirms the user's premise that no direct client-controlled admin flag exists. | — |
| 10 | `admin/users.js` unprotected role-write (**new finding, not in original scope**) | `functions/api/admin/users.js:18-42` | `onRequestPost`/`onRequestPatch` insert/update `admin_users` rows, including the `role` column (constrained by CHECK to `owner/operations/warehouse/customer_support/content_editor` — `'owner'` is a legal value), gated **only** by `assertAdmin()`. No `requireAdminPermission()` call at all. | **High**, and directly undermines the point of A1: any caller who can pass `assertAdmin()` (i.e., anyone who has the shared `ADMIN_TOKEN` or a still-valid signed session) can mint themselves (or anyone) an `owner` row via `POST /api/admin/users` with an arbitrary email, then supply that email via `Cf-Access-Authenticated-User-Email` **if and only if Cloudflare Access is not actually stripping/validating that header for this environment** (see §2 for why this is not trivially exploitable when Access is genuinely active) — or, regardless of Access, simply grants that other email full RBAC-recognized owner status for any future request that does carry a legitimately-authenticated Access session as that email. | `functions/api/admin/users.js` (`onRequestGet` is read-only and lower risk). |

**Coverage tally used throughout this plan:** 8 files call `requireAdminPermission()` today (`admin/loyalty/adjust-points.js`, `admin/shipments/[id]/sync.js`, `admin/shipments/[id]/label.js`, `admin/orders/[id]/dhl-shipment.js`, `admin/returns/[id]/dhl-return-shipment.js`, `admin/coupons/issue-customer-coupon.js`, `functions/api/email/retry-failed.js`, `functions/api/invoices/qnb-create.js`). The remaining 25 `functions/api/admin/**` files (`admin/orders.js`, `admin/orders/[id].js`, `admin/orders/[id]/status.js`, `admin/orders/[id]/emails.js`, `admin/orders/[id]/shipments.js`, `admin/refunds.js`, `admin/returns.js`, `admin/products.js`, `admin/inventory.js`, `admin/inventory/adjust.js`, `admin/inventory/health.js`, `admin/inventory/[slug].js`, `admin/inventory/[slug]/movements.js`, `admin/customers.js`, `admin/users.js`, `admin/invoices.js`, `admin/bank-accounts.js`, `admin/compliance.js`, `admin/coupons/index.js`, `admin/lots.js`, `admin/suppliers.js`, `admin/shipments.js`, `admin/email-logs.js`, `admin/dashboard.js`, `admin/session.js` — `session.js` is the login endpoint itself, not a protected resource) rely solely on `assertAdmin()`.

---

## 2. Verify admin identity source

**Confirmed identity sources in code, in the order a request actually passes through them:**

1. **`x-admin-token` header** → `assertAdmin()` → establishes "this caller knows the shared secret / holds a still-valid signed session." This is **mandatory** for all 34 gated call sites (§1, row 1). No admin route is reachable without it.
2. **`Cf-Access-Authenticated-User-Email` header** → `getAccessEmail()`/`getAdminRecord()` → establishes "this caller is (claims to be) a specific email, looked up in `admin_users`." This is used **only** by the 8 `requireAdminPermission()` call sites, layered **on top of** (never instead of) step 1 in every call site observed. It is **optional** in the sense that `assertCloudflareAccess()` (§1, row 2) does not require it unless `REQUIRE_CLOUDFLARE_ACCESS === 'true'`, and even when that flag is off, `hasAdminPermission()` will still run — it just always resolves `admin = null` and hits the allow-all branch today.
3. **Supabase session / access token** — not used anywhere in the admin surface. Customer-facing endpoints (`functions/api/account/**`) use Supabase JWTs; admin endpoints do not.
4. **Fallback email** — none found; there is no hardcoded or env-configured fallback admin email anywhere in `functions/api/_lib/admin.js` or `admin-audit.js`.
5. **Client-provided flag** — none found (§1, row 9).

**Is the Cloudflare Access header mandatory or optional today?** **Optional**, both by code (`assertCloudflareAccess()` no-ops unless `REQUIRE_CLOUDFLARE_ACCESS==='true'`) and by confirmed live evidence (`wrangler.toml`'s tracked `[vars]` block does not set it; only `.env.example` recommends `REQUIRE_CLOUDFLARE_ACCESS=true` as a template default). Whether it is actually set as a Cloudflare Pages **dashboard** secret (which would not appear in this repo) cannot be determined by reading code or querying Supabase — it can only be confirmed by inspecting the live Cloudflare Pages project settings / Access application configuration directly, which is outside this plan's tooling access.

**Can `Cf-Access-Authenticated-User-Email` be spoofed by an external client?** Per current Cloudflare documentation and community-verified behavior (checked during this planning pass): **no** — `Cf-Access-Authenticated-User-Email` is one of Cloudflare's reserved, edge-stripped header names. Cloudflare's network strips any client-supplied header with this exact name from inbound requests before they reach the origin, on **any** Cloudflare-proxied zone — this protection is not conditional on Access being actively enforced for a specific route. This meaningfully **de-risks** the spoofing concern: an external attacker without valid Cloudflare Access credentials cannot inject a fake value for this header today, regardless of whether `REQUIRE_CLOUDFLARE_ACCESS` is set. **However**, the practically important consequence of Access not being configured is not spoofing risk — it is that the header will simply **never be present** (empty) on any real request, which is a lockout risk, not a security hole (see §3).

**Belt-and-suspenders caveat:** the code's own trust in this header is still "second-hand" — `getAccessEmail()` reads it directly with no JWT verification of its own (`Cf-Access-Jwt-Assertion` is checked for *presence* by `assertCloudflareAccess()`, not cryptographically validated anywhere in this codebase). This is consistent with Cloudflare's own guidance that the email header is a convenience, and that origins wanting cryptographic certainty should validate the JWT — this codebase currently does not, which is an accepted, lower-priority gap **not** in scope for A1 (would require fetching Cloudflare's public JWKS and is a larger change than a permission-default flip).

---

## 3. Lockout risk

**If `hasAdminPermission()`'s no-match branch is flipped to `return false`, will the current owner still pass?**

**Conditionally yes**, and the condition is entirely external to this codebase:

- The two seeded `admin_users` rows (`cankolsun@gmail.com`, `cankolsun@cosmoskin.com.tr`) are correctly shaped: `role='owner'`, `role_code='owner'`, `permissions=['*']`, `is_active=true`. Under a flipped default, either row would pass `hasAdminPermission()` for **any** permission string, exactly as it does today, **provided** the request actually carries `Cf-Access-Authenticated-User-Email` set to one of those two addresses.
- **The header is only populated if Cloudflare Access is actually configured and enforcing on the admin routes in production.** This cannot be confirmed from this repository (§2). If it is not configured, the header will be absent on every real request, `getAdminRecord()` will always return `null`, and a flipped default would return `false` unconditionally — a total lockout, including for the owner, but **only on the 8 endpoints that call `requireAdminPermission()`**.

**Which header/session/email must be present?** `x-admin-token` (as a valid signed session, per §1 row 1) on every request, **and** `Cf-Access-Authenticated-User-Email` set to a seeded, active `admin_users.email` on the 8 permission-gated requests specifically.

**Which admin endpoints would become inaccessible if the Cloudflare Access header is missing, after the flip?** Exactly the 8: `admin/loyalty/adjust-points.js` (loyalty point adjustments), `admin/shipments/[id]/sync.js` and `admin/shipments/[id]/label.js` (DHL sync/label), `admin/orders/[id]/dhl-shipment.js` and `admin/returns/[id]/dhl-return-shipment.js` (DHL shipment creation), `admin/coupons/issue-customer-coupon.js` (manual coupon issuance), `functions/api/email/retry-failed.js` (email retry), `functions/api/invoices/qnb-create.js` (QNB invoice creation). **The other 25 `admin/**` files are entirely unaffected** — they remain reachable via `assertAdmin()` alone regardless of the Access header's presence, because they never call `hasAdminPermission()`. This is the single most important scoping fact for risk assessment: **worst case is a partial degradation of 8 secondary/operational endpoints, not a full admin-panel lockout.**

**Is there a safe fallback that is server-trusted, not client-controlled?** Two options were considered:

1. **Do the flip now, accept the risk on those 8 endpoints, and treat any resulting 403 as a signal to go verify Cloudflare Access** (reactive). Rejected as the primary plan — a silent degradation of DHL/coupon/loyalty admin actions in production is a bad way to discover a configuration gap.
2. **(Recommended) Bind identity into the signed session token at issuance time, not just at request time.** `issueAdminSession()` already calls `assertCloudflareAccess()` before issuing a session — meaning if `REQUIRE_CLOUDFLARE_ACCESS==='true'`, the login step already has a Cloudflare-verified email in hand at that moment. Embedding that email into the signed token payload (HMAC-signed alongside the existing `exp`/`nonce`, e.g. `v1.<exp>.<nonce>.<email-b64>.<sig>`) would let `hasAdminPermission()` fall back to the **session's own attested identity** when the live per-request Access header happens to be absent (e.g. Access session cookie present at login but not re-validated on every XHR) — while remaining just as un-spoofable as today's header, since the client cannot alter the embedded email without invalidating the HMAC signature. This is described here as the safe design pattern to have ready, but **implementing it is explicitly out of scope for A1** unless the Cloudflare Access confirmation in §9 comes back negative and a code-level mitigation is wanted instead of/alongside an infrastructure fix. Recorded here so it is not lost, and so A1's validator (§7) does not need to assume it.

**Conclusion:** lockout risk from the core one-line flip is **low and narrowly scoped** (8 endpoints, not 31), but it is not zero, and it is **not verifiable from this codebase or from Supabase alone** — it requires one external, human confirmation step (§9) before the flip ships.

---

## 4. RBAC hardening strategy

Two changes are proposed for A1.1, both small and localized. **Described only — not implemented in this pass.**

### 4a. Flip `hasAdminPermission()`'s default (the core P0 fix)

In `functions/api/_lib/admin-audit.js`:

```javascript
export async function hasAdminPermission(context, permission) {
  const admin = await getAdminRecord(context);
  if (!admin) return false; // deny-by-default: no matching admin_users row => no permission
  if (admin.is_active === false) return false;
  if (admin.status === 'disabled') return false; // defense-in-depth: honor the separate status column too
  const direct = Array.isArray(admin.permissions) ? admin.permissions : [];
  if (direct.includes('*') || direct.includes(permission)) return true;
  const role = admin.role_code || admin.role || 'operations';
  if (role === 'owner') return true;
  const rows = await selectRows(context, 'admin_permissions', {
    select: 'permission',
    role_code: `eq.${role}`
  }).catch(() => []);
  return (rows || []).some((row) => row.permission === '*' || row.permission === permission);
}
```

Changes from current code: `return true` → `return false` on the no-match branch (the actual P0 fix); one additive line honoring `admin.status === 'disabled'` alongside the existing `is_active === false` check, since both columns exist live and today only one is read — this is optional but recommended, low-risk, and closes a theoretical data-inconsistency gap (a row disabled via `status` but not via `is_active`) at zero cost. Everything else in the function is unchanged: the owner shortcut, the wildcard/direct-permission checks, and the `admin_permissions` fallback lookup all continue to work exactly as they do today for any request that *does* resolve a matching `admin_users` row.

This one function change removes the allow-all/self-flag bypass and is the entirety of "deny-by-default" as requested. It does not touch `assertAdmin()`, `issueAdminSession()`, session issuance, or the HMAC signing scheme — none of that changes in A1.

### 4b. Close the `admin/users.js` self-escalation gap

Add a permission gate to `functions/api/admin/users.js`'s `onRequestPost`/`onRequestPatch` (the two handlers that can write `admin_users.role`):

```javascript
import { requireAdminPermission, recordAdminActivity } from '../_lib/admin-audit.js';
// ...
export async function onRequestPost(context) {
  try {
    await assertAdmin(context);
    await requireAdminPermission(context, 'admin:manage_admins');
    // ... existing body
```

(same addition to `onRequestPatch`). **No new row needs to be seeded in `admin_permissions`** for this to work: `hasAdminPermission()`'s owner shortcut (`role === 'owner' → return true`, and/or the existing `permissions.includes('*')` check) already grants any permission string — including one that has never been seen before — to the two seeded owner rows. Any non-owner caller who reaches this new `requireAdminPermission()` call with no matching `admin_permissions` row for `admin:manage_admins` would correctly be denied under the flipped default from 4a. This closes the gap identified in §1 row 10 with a two-line change to one file, no data migration, and no risk to the owner's existing access.

**Why this belongs in A1 and not a separate batch:** shipping 4a without 4b leaves a documented, easily-exploitable path for any `assertAdmin()`-authenticated caller (i.e. anyone who ever had the shared `ADMIN_TOKEN`) to mint themselves an `owner` `admin_users` row and defeat the entire point of the hardening the moment they also control (or the environment lacks enforcement of) the identity header. It is small enough in scope (one file, one new permission string, zero new data) that deferring it would be inconsistent with "deny-by-default... without locking out the owner" as stated in the request.

### 4c. What is explicitly *not* changed in A1

- `assertAdmin()`, `issueAdminSession()`, the HMAC session scheme, `ADMIN_TOKEN`/`ADMIN_SESSION_SECRET` handling — untouched.
- `assertCloudflareAccess()` — untouched; whether it enforces anything remains controlled entirely by the `REQUIRE_CLOUDFLARE_ACCESS` env var, which A1 does not set or change (see §9 for why this is verified operationally, not via a code default).
- Coverage expansion to the other 25 `admin/**` files — explicitly deferred to A1.2 (§5).
- Cryptographic JWT validation of `Cf-Access-Jwt-Assertion` — noted in §2 as a real but lower-priority gap, out of scope.
- The session-embeds-identity enhancement described in §3 — documented as a ready fallback design, not built in A1.

---

## 5. Coverage plan

**Endpoints not yet protected by `requireAdminPermission()`:** the 25 files listed in §1's coverage tally. These are **not** expanded in A1 for the following reasons:

- They are already gated by `assertAdmin()`, so they are not "unauthenticated" — they require the same shared-secret-derived session as every other admin route. The risk they carry today (any token holder can act on any of them, without role differentiation) is unchanged by A1 either way — A1 neither improves nor worsens their exposure, since none of them call `hasAdminPermission()` before or after the flip.
- Adding `requireAdminPermission()` calls to 25 files, each requiring a decision about which of the six `admin_permissions.role_code` buckets (`owner/operations/warehouse/customer_support/content_editor/accountant`) should hold each specific permission string, is a materially larger and more error-prone change than the two-file, ~10-line diff in §4. Doing it in the same pass as the core deny-by-default flip would conflate two different risk profiles (a config/identity risk in A1.1 vs. a "did I correctly map 25 routes to permissions without breaking one" correctness risk in a coverage batch) and make it harder to isolate the cause if something breaks after deploy.
- The original P0/P1 remediation plan (`COSMOSKIN_P0_P1_REMEDIATION_PLAN_20260704.md`, item A1/Step 3) already anticipated this as a follow-on step, not part of the default-flip itself.

**Proposed split:**

| Batch | Scope | Files | Blast radius | Depends on |
|---|---|---|---|---|
| **A1.1** (this plan's implementation target) | Flip `hasAdminPermission()` default (§4a) + close `admin/users.js` gap (§4b) + validator + tests | 2 files (`admin-audit.js`, `admin/users.js`) | Low — only the 8 existing `requireAdminPermission()` call sites + 1 new one behave differently | Cloudflare Access confirmation (§9) |
| **A1.2a** (future, not started here) | Add `requireAdminPermission()` to the highest-financial-impact routes: `admin/refunds.js`, `admin/orders.js` (status-mutating branches), `admin/orders/[id]/status.js`, `admin/inventory/adjust.js`, `admin/invoices.js`, `admin/bank-accounts.js` | ~6 files | Medium — each needs a correct permission string mapped to existing `admin_permissions` rows (`refunds:update`, `orders:update`, `inventory:adjust`, `invoices:update` already exist in the seeded matrix; bank-accounts needs a decision) | A1.1 shipped and confirmed stable |
| **A1.2b** (future, not started here) | Remaining lower-risk routes: `admin/products.js`, `admin/customers.js`, `admin/compliance.js`, `admin/coupons/index.js`, `admin/lots.js`, `admin/suppliers.js`, `admin/shipments.js`, `admin/email-logs.js`, `admin/dashboard.js`, `admin/inventory.js`, `admin/inventory/health.js`, `admin/inventory/[slug].js`, `admin/inventory/[slug]/movements.js`, `admin/orders/[id].js`, `admin/orders/[id]/emails.js`, `admin/orders/[id]/shipments.js`, `admin/returns.js` | ~17 files | Low-medium, mostly read paths or already-covered-by-other-guards writes | A1.2a |

**A1 (this plan) covers only A1.1.** No coverage expansion is proposed to start now.

---

## 6. Migration need

**No migration is needed for A1.1.** `admin_users` already has `email`, `role`, `role_code`, `permissions`, `is_active`, and `status` (confirmed live in §1 of the preflight report). `admin_permissions` is already fully populated for all six roles including a wildcard-equivalent for `owner`. The two code changes in §4 read existing columns only; §4b's new permission string (`admin:manage_admins`) needs **no** `admin_permissions` row to be inserted, because the owner's existing `permissions: ['*']` and `role === 'owner'` shortcut already grant it — it would only need a new seeded row if a *non-owner* role were ever meant to manage other admins, which is explicitly not part of this plan.

If a future decision is made to have `hasAdminPermission()` also honor the `status` column as more than a defensive add-on (e.g. treating `status='invited'` differently from `status='active'`), that would still be a pure code change against existing columns — no migration either way.

---

## 7. Validator plan — `scripts/validate-a1-admin-rbac-hardening.mjs`

Following this project's established validator pattern (see `scripts/validate-h2-return-attachment-preview.mjs`, `scripts/validate-h1-return-attachment-storage-rls.mjs` for structure/conventions). The validator must **fail** (exit non-zero) if any of the following hold true against the working tree:

1. **Allow-all default remains:** `functions/api/_lib/admin-audit.js` still contains a `hasAdminPermission` function whose no-match branch (the code immediately following `const admin = await getAdminRecord(context);`) is `return true` instead of `return false`. Implemented as a source-slice check (extract the function body between its `export async function hasAdminPermission` marker and the next top-level `export`, then regex/`indexOf` for `if (!admin) return true` — must be **absent** — and `if (!admin) return false` — must be **present**), mirroring the slice-based approach already used in the H1/H2 validators rather than a single brittle regex.
2. **Self-flag/admin-flag bypass reintroduced:** grep all of `functions/api/**/*.js` for any of `body.is_admin`, `body.isAdmin`, `req.is_admin`, `headers.get\('x-is-admin'\)`, `headers.get\('x-admin-role'\)` being read and used in a conditional that leads to a `return true`/`return json({ok:true` /permission grant within ~15 lines — fail if found. (This is a regression guard for a bypass type that doesn't exist today, so it should never trigger unless someone reintroduces it.)
3. **Client-provided `is_admin`/`role`/`permissions` can grant admin:** same grep family as #2, extended to scan `functions/api/_lib/admin-audit.js` and `functions/api/_lib/admin.js` specifically for any place that reads `body.role`, `body.permissions`, or `body.is_admin` and feeds it into an authorization decision (as opposed to `admin/users.js`'s legitimate write-only usage, which the validator should allowlist by file+line as it already does for known-safe patterns elsewhere in this project's validators).
4. **`hasAdminPermission` returns true when `admin_users` lookup has no match:** covered by #1's direct source check; additionally, if the local integration test harness (see §8) supports it, a runtime assertion mocking `getAdminRecord` to return `null` and asserting `hasAdminPermission(ctx, 'orders:read')` resolves `false`.
5. **Inactive admin can pass:** verify the function body still contains `admin.is_active === false` (or equivalent) returning `false` before any permission grant — fail if this check has been removed or reordered after a `return true` branch.
6. **Owner `['*']` permission path is broken:** verify the function body still contains both the `direct.includes('*')` check and the `role === 'owner'` shortcut (either one passing is sufficient — this is intentionally not stricter than today's working owner logic, since accidentally breaking owner access is exactly the failure mode A1 must not introduce).
7. **`admin/users.js` still lacks a permission gate:** verify `functions/api/admin/users.js`'s `onRequestPost` and `onRequestPatch` each contain a `requireAdminPermission(` call before their first `insertRow`/`updateRows` call against `admin_users`.
8. **Any of the 8 existing `requireAdminPermission()` call sites lost their `assertAdmin()` pairing:** for each of the 8 known files (§1's coverage tally) plus `admin/users.js` (the 9th after 4b), verify `assertAdmin(context)` appears textually before `requireAdminPermission(context,` within the same function body. This directly guards the invariant this plan relies on in §2/§3 (identity-header trust is only meaningful because it's layered behind the shared-secret gate, never in front of or instead of it).
9. **Coverage was not silently expanded beyond A1.1's declared scope:** assert that none of the 25 `admin/**` files listed in §5's A1.2a/A1.2b tables have gained a new `requireAdminPermission(` call relative to what's listed in §1 — if one has, either the implementation went further than approved (fail, needs explicit sign-off) or this validator's file list needs a deliberate update alongside the change (not a silent pass).
10. **H0/H1/H2 and Batch 1/3/4 validators still pass:** chain-invoke (via `execSync` or dynamic `import()`, matching the existing pattern in `validate-h2-return-attachment-preview.mjs`'s own chaining of `validate-h1-return-attachment-storage-rls.mjs`) — `validate-h0-live-payment-rpc-hotfix.mjs`, `validate-h1-return-attachment-storage-rls.mjs`, `validate-h2-return-attachment-preview.mjs`, `validate-account-batch-1-safe-fixes.mjs`, `validate-account-batch-3-order-cancellation.mjs`, `validate-account-batch-4-loyalty-ledger.mjs`, `validate-account-ui-polish.mjs`. Fail if any of them fail.
11. **Forbidden-paths guard:** the validator should declare `forbiddenPaths` for files A1.1 explicitly must not touch (`functions/api/_lib/admin.js`'s session/token logic, `functions/api/iyzico-callback.js`, any `supabase/migrations/*.sql`, any `functions/api/account/**` file) — consistent with how prior validators (H0/H1/H2) scoped their own diffs, and to catch accidental scope creep into A1.2 territory during implementation.

---

## 8. Tests

Run, in this order, after implementation (none run yet — planning only):

```bash
node --check functions/api/_lib/admin-audit.js
node --check functions/api/admin/users.js
node scripts/validate-a1-admin-rbac-hardening.mjs
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

**New integration test cases to add to `tests/local-integration.test.mjs` (or a new `tests/a1-admin-rbac.test.mjs` if the harness supports isolated module mocking more cleanly — implementation detail to decide at build time, not now):**

1. Mock/stub `selectRows` for `admin_users` to return `[]` (no match) → assert `hasAdminPermission(ctx, 'orders:read')` resolves `false` (today this would resolve `true`; this test is expected to **fail before the fix and pass after**, exactly mirroring how the H1/H2 batches proved their fixes).
2. Mock `selectRows` for `admin_users` to return the real owner shape (`role_code:'owner', permissions:['*'], is_active:true`) → assert `hasAdminPermission(ctx, 'anything:not_seeded')` resolves `true` — proves the owner path survives the flip.
3. Mock an `admin_users` row with `is_active:false` → assert `hasAdminPermission()` resolves `false` regardless of role.
4. Mock an `admin_users` row with `status:'disabled'`, `is_active:true` → assert `hasAdminPermission()` resolves `false` (proves 4a's defense-in-depth line).
5. Mock a non-owner role (`operations`) with a real `admin_permissions` row → assert the seeded permission passes and a non-seeded one is denied — proves the per-role lookup path is unchanged by the flip.
6. `admin/users.js` `onRequestPost`/`onRequestPatch` with a caller that passes `assertAdmin()` but has no matching `admin_users` row (or a non-owner one without `admin:manage_admins`) → assert `403`, not a successful insert/update — proves 4b closes the self-escalation gap.
7. Regression: `admin/users.js` `onRequestPost`/`onRequestPatch` with the seeded owner identity → assert success, unchanged from today — proves 4b doesn't lock out the owner's own admin-management ability.

---

## 9. Manual live verification (before deploy)

This is the step that resolves the one precondition this plan cannot verify from code or Supabase alone:

1. **Confirm Cloudflare Access configuration directly in the Cloudflare dashboard** (Zero Trust → Access → Applications, and Pages project → Settings → Environment variables) for both admin route paths (`/api/admin/*`) and the `REQUIRE_CLOUDFLARE_ACCESS` variable's actual production value. This is an operator action outside this codebase's tooling — cannot be automated by this agent.
2. **If Access is confirmed active and injecting the header:** deploy A1.1 to a preview/staging Cloudflare Pages deployment first (not directly to production). Load the admin panel there, authenticate via the normal `ADMIN_TOKEN` → signed-session flow, and exercise one of the 8 now-hardened endpoints (the loyalty adjustment panel is a good low-risk pick) — confirm it still succeeds for the owner identity.
3. **Confirm a non-admin (or an intentionally-unseeded test email, if Access supports a second test identity) cannot access the same endpoint** — expect a `403` with the existing friendly Turkish message, not a raw 500 or a silent success.
4. **Confirm the missing-header behavior explicitly:** from a request path that bypasses Access (if any test tooling allows constructing a request without going through the Access-protected hostname — e.g. hitting the Pages `*.pages.dev` preview URL directly, which is typically not behind the custom-domain Access policy), verify the 8 hardened endpoints now correctly return `403` (expected under deny-by-default) rather than silently succeeding — this is the direct behavioral proof that the flip took effect and is exactly the scenario that constituted the P0 bypass before.
5. **Confirm the `admin_users` owner rows still work end-to-end**, not just for the 8 permission-gated routes but for the new `admin/users.js` gate specifically — log in as owner, create or edit a test `admin_users` row via the panel (if a panel UI exists for this; otherwise via a direct authenticated API call), confirm success.
6. **Confirm no lockout for the 25 `assertAdmin()`-only routes** — spot-check 2-3 of them (e.g. `admin/orders.js` GET, `admin/refunds.js` GET) with the same owner session to confirm they behave identically to before the deploy (they should, since they never call the changed function).
7. **Only after all of the above pass in staging**, deploy to production, and immediately re-run steps 2-3 (owner access + a permission-gated action) against the live production admin panel as a final smoke test, with a rollback plan (§10) ready if step 2 or 3 fails.

---

## 10. Output

### Exact files likely to change (A1.1 only)

| File | Change |
|---|---|
| `functions/api/_lib/admin-audit.js` | `hasAdminPermission()`: flip `if (!admin) return true` → `return false`; add `if (admin.status === 'disabled') return false` defense-in-depth line. ~2 lines changed. |
| `functions/api/admin/users.js` | Import `requireAdminPermission`; add `await requireAdminPermission(context, 'admin:manage_admins');` to `onRequestPost` and `onRequestPatch`, immediately after each existing `await assertAdmin(context);`. ~4 lines added. |
| `scripts/validate-a1-admin-rbac-hardening.mjs` (new) | Full validator per §7. |
| `tests/local-integration.test.mjs` (or new `tests/a1-admin-rbac.test.mjs`) | New test cases per §8. |
| `COSMOSKIN_A1_ADMIN_RBAC_HARDENING_REPORT_20260704.md` (new, at implementation time) | Standard batch report, per this project's convention. |

**Exact functions to modify:** `hasAdminPermission()` (`functions/api/_lib/admin-audit.js`), `onRequestPost()` and `onRequestPatch()` (`functions/api/admin/users.js`). No other function in the codebase needs to change for A1.1.

### Lockout risk

**Low, and narrowly scoped** to the 8 pre-existing `requireAdminPermission()` endpoints plus the newly-gated `admin/users.js` — **not** the other 24 `admin/**` files, which are unaffected by this change under any Cloudflare Access outcome. The risk is entirely conditional on the external, unverified-from-this-repo fact of whether Cloudflare Access is genuinely configured in production (§2/§3/§9). This plan does not recommend shipping until §9 step 1 is confirmed.

### Cloudflare Access dependency

**Real and load-bearing for the 8 (soon 9) permission-gated endpoints only.** Not load-bearing for `assertAdmin()`-only endpoints, which make up the large majority (25/31) of the admin surface and are entirely session/token-based. Cloudflare Access headers cannot be spoofed by an external client (confirmed, §2) — the risk from Access being mis- or un-configured is exclusively **lockout** (false negative), not **impersonation** (false positive), which is the more forgiving failure mode to have if a choice had to be made.

### Implementation batches

- **A1.1 (this plan):** the two-file code change in §4, validator, tests, manual verification. Recommended to ship only after §9 step 1 is confirmed.
- **A1.2a / A1.2b (future, separate approval required):** coverage expansion to the remaining 25 `admin/**` files, split by financial/operational blast radius as tabulated in §5. Not started, not scoped in detail beyond the file lists above, pending A1.1 landing successfully first.

### Tests

Full list in §8. Summary: 2 `node --check`, 1 new validator + 6 chained existing validators + production-launch-readiness validator, 1 `node --test` run (existing suite + 7 new proposed cases).

### Rollback plan

- **Code rollback:** both changes in §4 are small, additive-in-spirit, single-file diffs with no schema/migration component — a `git revert` of the A1.1 commit fully restores the prior (allow-all) behavior with no data cleanup required, since no `admin_users`/`admin_permissions` rows are written or altered by this batch.
- **If the deploy causes unexpected 403s on the 8 hardened endpoints post-deploy:** the fastest safe mitigation is reverting `functions/api/_lib/admin-audit.js`'s `hasAdminPermission()` back to `return true` on the no-match branch (one-line revert) via a hotfix commit, rather than a full rollback of `admin/users.js`'s gate (which is lower-risk and less likely to be the cause, since it only affects two rarely-used admin-management endpoints).
- **If specifically `admin/users.js` locks out the owner from managing admins** (e.g. the owner's own `admin_users` row was somehow not resolving correctly): the same one-line-per-handler revert (removing the `requireAdminPermission` call) restores prior behavior without touching the core `hasAdminPermission()` fix, allowing the two changes to be rolled back independently if only one is implicated.
- **No irreversible action is taken by A1.1** — no data is deleted, no migration runs, no existing `admin_users`/`admin_permissions` row is modified. Rollback is pure code revert + redeploy.

---

*Plan complete. No files were modified, no migrations were created, no SQL was executed, and nothing was deployed as part of this pass, per the plan-only scope of this request. A1/A2/H1/H2 or any other implementation batch was not started.*
