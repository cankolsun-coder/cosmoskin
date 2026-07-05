# COSMOSKIN A1F2 — Cloudflare Access JWT Identity — Runbook

**Date:** 2026-07-06  
**Scope:** Preview verification and production env setup for A1F2.

---

## Problem this batch solves

Access protects admin routes, but `POST /api/admin/session` may receive **`Cf-Access-Jwt-Assertion` without `Cf-Access-Authenticated-User-Email`**. A1F rejected that as “Cloudflare Access kimliği doğrulanamadı.” A1F2 verifies the JWT server-side and extracts email from the signed payload.

---

## Required Cloudflare Pages variables (Production)

| Variable | Example | Notes |
|---|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | `your-team` | From Zero Trust URL: `your-team.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | *(from Access app)* | Application → Settings → **Application AUD** |
| `REQUIRE_CLOUDFLARE_ACCESS` | `true` | Already required |
| `ADMIN_TOKEN` | *(secret)* | Unchanged |
| `ADMIN_SESSION_SECRET` | *(secret)* | Unchanged |

Optional:

| Variable | Purpose |
|---|---|
| `CF_ACCESS_CERTS_URL` | Override default `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` |
| `ADMIN_ACCESS_IDENTITY_DEBUG` | `true` for one-shot safe diagnostics (disable after) |

Aliases: `CLOUDFLARE_ACCESS_TEAM_DOMAIN`, `CLOUDFLARE_ACCESS_AUD`, `CLOUDFLARE_ACCESS_CERTS_URL`.

### How to find AUD

Cloudflare Zero Trust → **Access** → **Applications** → select the admin application → copy **Application AUD** (UUID).

### How to find team domain

Zero Trust dashboard URL: `https://one.dash.cloudflare.com/...` — team subdomain is shown in Access settings, or use the hostname before `.cloudflareaccess.com` in your Access login URL.

---

## Access route checklist

Confirm applications include:

- `www.cosmoskin.com.tr/admin/*`
- `www.cosmoskin.com.tr/api/admin/*`
- `cosmoskin.com.tr/admin/*`
- `cosmoskin.com.tr/api/admin/*`

---

## Validator gate (before deploy)

```bash
node --check functions/api/_lib/cloudflare-access-jwt.js
node --check functions/api/_lib/admin.js
node --check functions/api/_lib/admin-audit.js
node scripts/validate-a1f-admin-rbac-session-identity.mjs
node --test tests/local-integration.test.mjs
```

---

## Production verification

1. Complete Cloudflare Access login (email code / IdP).
2. Open admin panel → enter **admin token**.
3. Session should issue (no “Cloudflare Access kimliği doğrulanamadı” error).
4. Open Stock/Inventory as owner → loads (200).
5. Section without permission → banner “Bu işlem için yetkiniz bulunmuyor.” — **not** token screen redirect.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `CF_ACCESS_TEAM_DOMAIN yapılandırılmamış` | Team domain env missing | Set `CF_ACCESS_TEAM_DOMAIN` in Pages Production vars |
| Still “kimliği doğrulanamadı” with JWT | Wrong team domain or AUD mismatch | Verify team name and `CF_ACCESS_AUD` match Access app |
| JWT verify fails (certs fetch) | Worker cannot reach certs URL | Check `CF_ACCESS_CERTS_URL`; confirm outbound fetch allowed |
| Session works, inventory 403 + banner | RBAC permission missing | Grant `inventory:read` in `admin_users` — expected |
| Token screen after every action | 401 not 403 — session invalid | Re-login; check `ADMIN_SESSION_SECRET` |

### Safe debug (one request)

Set `ADMIN_ACCESS_IDENTITY_DEBUG=true`, reproduce login failure, check Worker logs for:

```json
{
  "hasAccessEmailHeader": false,
  "hasAccessJwtHeader": true,
  "resolvedEmailMasked": "c***@gmail.com"
}
```

Disable debug immediately after.

---

## Error when config missing (fail closed)

A1F2 **never** accepts unverified JWT. Without `CF_ACCESS_TEAM_DOMAIN`, JWT fallback cannot run and session issuance returns 403 with an explicit message — this is intentional.

---

Stop after A1F2. Do not start another batch from this runbook.
