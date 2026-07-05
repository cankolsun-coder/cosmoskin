# COSMOSKIN Admin Auth / RBAC Guardrails

**Effective:** 2026-07-06 (A1F / A1F2)  
**Canonical reference** for admin authentication, session identity, Cloudflare Access JWT verification, RBAC, and admin frontend UX.  
Also mirrored in `COSMOSKIN_PROJECT_MEMORY.md`.

---

The admin panel uses a two-layer authentication model:

## 1. Cloudflare Access

- First gate.
- Must protect both:
  - `/admin/*`
  - `/api/admin/*`
- Allowed owner emails:
  - `cankolsun@gmail.com`
  - `cankolsun@cosmoskin.com.tr`

## 2. Admin token screen

- Second gate.
- Must remain enabled for now.
- Do not remove the token screen unless explicitly approved.

## 3. Admin session identity

- Signed admin session must include verified admin email.
- Email must come only from:
  - `Cf-Access-Authenticated-User-Email`, or
  - verified `Cf-Access-Jwt-Assertion`, or
  - HMAC-protected signed admin session email after valid issuance.
- Never trust email from:
  - request body
  - query string
  - localStorage directly
  - arbitrary `x-admin-email` header
  - hardcoded owner fallback

## 4. Cloudflare Access JWT

- Production requires:
  - `CF_ACCESS_TEAM_DOMAIN`
  - `CF_ACCESS_AUD`
- Do not remove JWT verification.
- Do not decode `Cf-Access-Jwt-Assertion` without signature verification.
- If required env variables are missing, fail closed.

Aliases also supported: `CLOUDFLARE_ACCESS_TEAM_DOMAIN`, `CLOUDFLARE_ACCESS_AUD`, `CLOUDFLARE_ACCESS_CERTS_URL`.

Implementation: `functions/api/_lib/cloudflare-access-jwt.js`.

## 5. RBAC

- `admin_users` table is the source of permission truth.
- Owner users with `permissions: ['*']` must pass.
- Inactive or disabled admin users must fail.
- Permission checks must remain deny-by-default.
- Do not reintroduce:
  - `if (!admin) return true`
  - self-declared admin flags
  - client-provided role/permission trust

Implementation: `functions/api/_lib/admin-audit.js` (`getAdminRecord()`, `hasAdminPermission()`, `requireAdminPermission()`).

## 6. Frontend admin UX

- **401** means invalid/expired session:
  - clear session
  - show token screen
- **403** means authenticated but not permitted:
  - do not clear session
  - do not show token screen
  - show **“Bu işlem için yetkiniz bulunmuyor.”**
- Never treat 403 the same as 401.

Implementation: `assets/admin-runtime.js`, `assets/admin-runtime.css`.

## 7. Protected files

Do not modify these without explicit approval:

- `functions/api/_lib/admin.js`
- `functions/api/_lib/admin-audit.js`
- `functions/api/_lib/cloudflare-access-jwt.js`
- `assets/admin-runtime.js`
- `assets/admin-runtime.css`
- `scripts/validate-a1f-admin-rbac-session-identity.mjs`

## 8. Required validation after any admin auth/RBAC change

Run:

```bash
node scripts/validate-a1f-admin-rbac-session-identity.mjs
node scripts/validate-a1-admin-rbac-hardening.mjs
node scripts/validate-a1-admin-endpoint-coverage.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

## 9. Deployment warning

Before production deploy, confirm:

- `/admin/*` is protected by Cloudflare Access
- `/api/admin/*` is protected by Cloudflare Access
- `CF_ACCESS_TEAM_DOMAIN` is set
- `CF_ACCESS_AUD` is set
- Owner can log in through Cloudflare Access + admin token
- Inventory, Orders, Returns and Products screens open without returning to token screen

---

## Related deliverables

| Document | Purpose |
|---|---|
| `COSMOSKIN_A1F_ADMIN_RBAC_SESSION_IDENTITY_REPORT_20260705.md` | Session identity bridge + 403 UX |
| `COSMOSKIN_A1F2_CLOUDFLARE_ACCESS_JWT_IDENTITY_REPORT_20260706.md` | JWT email fallback |
| `COSMOSKIN_A1_ADMIN_RBAC_HARDENING_RUNBOOK_20260704.md` | A1 deny-by-default rollout |
| `COSMOSKIN_PROJECT_MEMORY.md` | Working behavior + guardrails mirror |
