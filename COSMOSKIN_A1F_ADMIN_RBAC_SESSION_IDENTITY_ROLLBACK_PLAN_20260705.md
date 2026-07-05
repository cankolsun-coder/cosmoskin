# COSMOSKIN A1F — Admin RBAC Session Identity Bridge — Rollback Plan

**Date:** 2026-07-05

---

## When to roll back

- Cloudflare Access cannot be extended to `/api/admin/*` before deploy deadline.
- Identity-bearing sessions cause unexpected RBAC denials in production.
- Permission banner UX is acceptable but session binding causes operational blockers.

---

## Rollback steps

### 1. Revert code

Revert these files to the pre-A1F commit:

```
assets/admin-runtime.js
assets/admin-runtime.css
functions/api/_lib/admin.js
functions/api/_lib/admin-audit.js
scripts/validate-a1f-admin-rbac-session-identity.mjs  (delete)
scripts/validate-a1-admin-rbac-hardening.mjs
scripts/validate-a1-admin-endpoint-coverage.mjs
scripts/validate-h0-live-payment-rpc-hotfix.mjs
scripts/validate-h1-return-attachment-storage-rls.mjs
scripts/validate-h2-return-attachment-preview.mjs
scripts/validate-b1-bank-transfer-finalization.mjs  (optional — only if reverting validator baseline fix)
tests/local-integration.test.mjs
```

Git example (replace `<pre-a1f-sha>` with the commit before A1F):

```bash
git checkout <pre-a1f-sha> -- assets/admin-runtime.js assets/admin-runtime.css \
  functions/api/_lib/admin.js functions/api/_lib/admin-audit.js \
  scripts/validate-a1-admin-rbac-hardening.mjs \
  scripts/validate-a1-admin-endpoint-coverage.mjs \
  scripts/validate-h0-live-payment-rpc-hotfix.mjs \
  scripts/validate-h1-return-attachment-storage-rls.mjs \
  scripts/validate-h2-return-attachment-preview.mjs \
  tests/local-integration.test.mjs
rm scripts/validate-a1f-admin-rbac-session-identity.mjs
```

### 2. No database rollback

A1F created no migrations and ran no SQL. `admin_users` table is unchanged.

### 3. Session state after rollback

- Existing 5-part identity sessions will fail verification (format unknown to old code) → admins re-login with raw token flow.
- Old 4-part sessions remain valid for `assertAdmin()` only.
- **Known regression:** RBAC-gated sections will again return 403 without Access header on each API call, and old `admin-runtime.js` will treat 403 like 401 (token screen redirect). This is the pre-A1F broken state.

### 4. Redeploy

Deploy reverted static assets + Functions to Cloudflare Pages.

Purge CDN cache for:

- `/assets/admin-runtime.js`
- `/assets/admin-runtime.css`

### 5. Post-rollback verification

```bash
node scripts/validate-a1-admin-rbac-hardening.mjs
node scripts/validate-a1-admin-endpoint-coverage.mjs
node --test tests/local-integration.test.mjs
```

Note: A1F-specific tests will be absent after rollback; expect fewer tests unless test file is also fully reverted.

Manual check:

- Admin token login still works (`assertAdmin` path).
- Expect Stock/Inventory redirect-to-token behavior to return (pre-A1F bug).

---

## Partial rollback (not recommended)

| Partial change | Risk |
|---|---|
| Revert only `admin-runtime.js` 403 UX | Backend still 403s; UX improves but RBAC identity still missing |
| Revert only `admin.js` session email | 403 UX fixed but permission checks still fail without Access header on every API call |

Full A1F rollback or full A1F forward deploy — no mixed state is supported.

---

## Forward fix (preferred over rollback)

If the only blocker is Cloudflare Access coverage:

1. Add `/api/admin/*` to the Access application (same identity provider as `/admin/*`).
2. Have affected admins log out and re-login (new 5-part session with email).
3. Re-test inventory without rollback.
