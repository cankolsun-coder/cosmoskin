# COSMOSKIN A1F — Admin RBAC Session Identity Bridge — Runbook

**Date:** 2026-07-05  
**Scope:** Preview verification for A1F only. **Not a deploy runbook.**

---

## Prerequisites

1. Cloudflare Access application protects:
   - `/admin/*`
   - `/api/admin/*` ← **required for session identity binding**
2. Environment variables set on Cloudflare Pages:
   - `ADMIN_TOKEN`
   - `ADMIN_SESSION_SECRET`
   - `ADMIN_SESSION_TTL_SECONDS` (optional)
3. Target admin email exists in `admin_users` with appropriate permissions (owner `['*']` or e.g. `inventory:read`).

---

## Local static preview (limited)

```bash
python3 -m http.server 7700 --directory .
```

Static server does **not** run `/api/admin/*` Functions. Use wrangler for full admin flow:

```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```

Without wrangler, admin API calls fail — expected, not an A1F bug.

---

## Validator gate (run before any preview deploy)

```bash
node --check assets/admin-runtime.js
node --check functions/api/_lib/admin.js
node --check functions/api/_lib/admin-audit.js
node scripts/validate-a1f-admin-rbac-session-identity.mjs
node scripts/validate-a1-admin-rbac-hardening.mjs
node scripts/validate-a1-admin-endpoint-coverage.mjs
node --test tests/local-integration.test.mjs
```

All must pass.

---

## Production / staging verification checklist

### A. Cloudflare Access route coverage

In Cloudflare Zero Trust → Access → Applications:

- [ ] Application includes path `/admin/*`
- [ ] **Same or separate application includes `/api/admin/*`**
- [ ] Test user email matches an active row in `admin_users`

If `/api/admin/*` is missing from Access, session issuance returns:

> Cloudflare Access kimliği doğrulanamadı. /api/admin/* route kapsamını kontrol edin.

### B. Two-gate login flow

1. Open `/admin/` (or inventory page).
2. Complete Cloudflare Access login (first gate).
3. Enter `ADMIN_TOKEN` on the token screen (second gate).
4. Confirm admin panel loads (dashboard or landing section).

### C. RBAC-gated section (inventory)

1. As owner (`permissions: ['*']`): open Stock/Inventory — **must load** (200).
2. As non-owner **without** `inventory:read`: open Stock/Inventory — **must show permission banner**, stay logged in, **must not** return to token screen.
3. Navigate to dashboard or another permitted section — **must still work**.

Expected 403 banner text:

> Bu işlem için yetkiniz bulunmuyor.

### D. Session invalidation (401)

1. Clear session or wait for expiry / use invalid token.
2. Any admin API call → token login screen with session expired message.
3. Re-enter valid `ADMIN_TOKEN` after Access login → session re-issued with email.

### E. Inactive admin

1. Set `admin_users.is_active = false` (or disable) for test user.
2. Attempt token login → **403**, no session issued.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Token screen after every gated section click | `/api/admin/*` not behind Access; old session without email | Add Access to `/api/admin/*`; log out and re-login |
| 403 at token login with Access message | Access header missing on session endpoint | Fix Access application paths |
| 403 on inventory, banner shown, session intact | Expected for admin without `inventory:read` | Grant permission in `admin_users` |
| 401 on all calls | Invalid/expired session or wrong `ADMIN_TOKEN` | Re-login with correct token |
| Dashboard works, inventory 403 + token redirect | Old `admin-runtime.js` cached | Hard refresh / purge CDN cache |

---

## What this batch does NOT change

- Checkout, payment, bank transfer B1/B2, returns, storage, loyalty, coupons
- Order business logic
- Database schema (no migrations)

Stop after A1F verification. Do not start another batch from this runbook.
