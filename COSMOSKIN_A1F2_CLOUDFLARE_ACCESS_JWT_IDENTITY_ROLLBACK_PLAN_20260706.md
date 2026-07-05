# COSMOSKIN A1F2 — Cloudflare Access JWT Identity — Rollback Plan

**Date:** 2026-07-06

---

## When to roll back

- JWT verification causes production login failures (wrong team domain / AUD / certs fetch).
- Operational need to revert to A1F-only behavior (direct email header required).
- Unexpected identity resolution from JWT payload.

---

## Rollback steps

### 1. Revert code

Revert to the A1F commit (`6459ad3` or later pre-A1F2 state):

```bash
git checkout 6459ad3 -- \
  functions/api/_lib/admin.js \
  functions/api/_lib/admin-audit.js \
  scripts/validate-a1f-admin-rbac-session-identity.mjs \
  tests/local-integration.test.mjs
rm functions/api/_lib/cloudflare-access-jwt.js
```

Or revert the entire A1F2 commit if already committed.

### 2. Remove env vars (optional)

Unset (not required for rollback, but avoids confusion):

- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_AUD`
- `CF_ACCESS_CERTS_URL`
- `ADMIN_ACCESS_IDENTITY_DEBUG`

### 3. No database rollback

No migrations or SQL were created.

### 4. Redeploy

Deploy reverted Functions to Cloudflare Pages.

### 5. Post-rollback behavior

- **Regression:** If production only sends `Cf-Access-Jwt-Assertion` (no direct email header), session issuance will again fail with A1F’s 403 message until Cloudflare is configured to inject `Cf-Access-Authenticated-User-Email` or A1F2 is re-deployed.
- A1F 401/403 UX and signed session email bridge remain if only A1F2 is reverted from an A1F+A1F2 tree.
- Identity-bearing sessions already issued remain valid until expiry.

### 6. Verification after rollback

```bash
node scripts/validate-a1f-admin-rbac-session-identity.mjs
node --test tests/local-integration.test.mjs
```

Expect 70 tests (A1F only) if A1F2 tests are fully reverted.

---

## Forward fix (preferred over rollback)

If rollback is considered because of env misconfiguration:

1. Set correct `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`.
2. Redeploy A1F2 (no code rollback).
3. Re-test admin token login.

---

## Partial rollback

Not supported. JWT module and admin wiring must roll back together.
