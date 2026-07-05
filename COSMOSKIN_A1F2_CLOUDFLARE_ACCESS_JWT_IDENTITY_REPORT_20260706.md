# COSMOSKIN A1F2 — Cloudflare Access JWT Identity Fallback — Implementation Report

**Date:** 2026-07-06  
**Scope:** A1F2 only — Cloudflare Access JWT email fallback for admin RBAC session issuance.  
**Status:** Implemented, tested, validated. **Not deployed.**

---

## 1. Exact root cause

After A1F, session issuance required `Cf-Access-Authenticated-User-Email`. In production, Cloudflare Access route coverage was already correct (`/admin/*` and `/api/admin/*`), but the **direct email header was absent** on `POST /api/admin/session` while **`Cf-Access-Jwt-Assertion` was present**.

A1F only read the direct header → `resolveCloudflareAccessEmail()` returned null → 403:

> Cloudflare Access kimliği doğrulanamadı. /api/admin/* route kapsamını kontrol edin.

Additionally, `assertCloudflareAccess()` (when `REQUIRE_CLOUDFLARE_ACCESS=true`) required **both** JWT and email headers, which could block JWT-only requests before session logic ran.

---

## 2. Which header was missing

| Header | Production behavior (reported) |
|---|---|
| `Cf-Access-Authenticated-User-Email` | **Missing** on session issuance request |
| `Cf-Access-Jwt-Assertion` | **Present** (Access authenticated the user) |

Route coverage was not the blocker; **identity header shape** was.

---

## 3. JWT fallback implemented

**Yes.** New module `functions/api/_lib/cloudflare-access-jwt.js` resolves trusted email in order:

1. `Cf-Access-Authenticated-User-Email` (direct header)
2. `Cf-Access-Jwt-Assertion` (RS256 verified against Cloudflare Access certs)
3. *(RBAC only, post-login)* HMAC-protected signed session email via `getVerifiedSessionEmail()`

`issueAdminSession()` and `getAdminRecord()` both use this chain (session path uses steps 1–2 at login; RBAC uses 1–2–3 on each request).

---

## 4. How JWT is verified

Server-side only (`Cf-Access-Jwt-Assertion` header):

1. Require `CF_ACCESS_TEAM_DOMAIN` (or `CLOUDFLARE_ACCESS_TEAM_DOMAIN`) — **fail closed if missing** when JWT fallback is needed.
2. Parse JWT header/payload structure (signature not trusted yet).
3. Verify `iss === https://<team>.cloudflareaccess.com`.
4. Verify `aud` matches `CF_ACCESS_AUD` / `CLOUDFLARE_ACCESS_AUD` when configured.
5. Verify `exp` / `nbf`.
6. Fetch public keys from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` (or `CF_ACCESS_CERTS_URL` override).
7. Match `kid` from JWT header to cert JWK.
8. **`crypto.subtle.verify()` RS256** on `header.payload` — reject if invalid.
9. Extract `payload.email` only after signature verification succeeds.

Unverified JWT payloads are never used for identity.

---

## 5. Required environment variables

Set in **Cloudflare Pages → Production environment variables**:

| Variable | Required | Purpose |
|---|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | **Yes** (for JWT fallback) | Zero Trust team name (e.g. `cosmoskin` → issuer `https://cosmoskin.cloudflareaccess.com`) |
| `CF_ACCESS_AUD` | Recommended | Application AUD tag from Access policy; enforced when set |
| `CF_ACCESS_CERTS_URL` | Optional | Override certs URL (default: team certs endpoint) |
| `REQUIRE_CLOUDFLARE_ACCESS` | Existing | Must remain `true` in production |
| `ADMIN_TOKEN` / `ADMIN_SESSION_SECRET` | Existing | Unchanged second gate |

**Aliases supported:** `CLOUDFLARE_ACCESS_TEAM_DOMAIN`, `CLOUDFLARE_ACCESS_AUD`, `CLOUDFLARE_ACCESS_CERTS_URL`.

**Optional debug:** `ADMIN_ACCESS_IDENTITY_DEBUG=true` logs safe booleans only (`hasAccessEmailHeader`, `hasAccessJwtHeader`, `resolvedEmailMasked`) — never raw JWT or tokens.

If JWT is present but `CF_ACCESS_TEAM_DOMAIN` is missing → **403**:

> Cloudflare Access JWT doğrulanamadı: CF_ACCESS_TEAM_DOMAIN yapılandırılmamış.

---

## 6. Proof arbitrary client email is not trusted

- Email never read from request body, query string, or `x-admin-email`.
- JWT email used only after RS256 signature verification against Cloudflare certs.
- Signed session email used only after HMAC verification (unchanged from A1F).
- Integration tests: forged JWT, wrong audience, JWT without `email` claim, body/`x-admin-email` rejection (A1F tests retained).

---

## 7. Proof 401/403 behavior remains correct

`assets/admin-runtime.js` **unchanged** in A1F2:

- **401** → `clearSession()` + token login screen
- **403** → `showPermissionError('Bu işlem için yetkiniz bulunmuyor.')` — session intact

Validator + A1F/A1F2 integration tests confirm.

---

## 8. Files changed

See `COSMOSKIN_A1F2_CLOUDFLARE_ACCESS_JWT_IDENTITY_CHANGED_FILES_20260706.txt`.

| File | Change |
|---|---|
| `functions/api/_lib/cloudflare-access-jwt.js` | **Created** — JWT verification + identity resolution |
| `functions/api/_lib/admin.js` | Async Access resolution; relaxed `assertCloudflareAccess` to JWT **or** email |
| `functions/api/_lib/admin-audit.js` | JWT fallback in `getAdminRecord()` between header and session |
| `scripts/validate-a1f-admin-rbac-session-identity.mjs` | A1F2 guardrails |
| `tests/local-integration.test.mjs` | +7 A1F2 tests (77 total) |

**Not changed:** checkout, payment, B1/B2, returns, storage, loyalty, coupons, order logic, migrations, frontend token screen.

---

## 9. Test results

All commands passed on 2026-07-06:

```
node --check functions/api/_lib/admin.js                    ✓
node --check functions/api/_lib/admin-audit.js              ✓
node --check assets/admin-runtime.js                        ✓
node scripts/validate-a1f-admin-rbac-session-identity.mjs   ✓
node scripts/validate-a1-admin-rbac-hardening.mjs           ✓
node scripts/validate-a1-admin-endpoint-coverage.mjs        ✓
node scripts/validate-b2-bank-transfer-rejection-finalization.mjs ✓
node scripts/validate-b1-bank-transfer-finalization.mjs     ✓
node scripts/validate-h2-return-attachment-preview.mjs      ✓
node scripts/validate-h1-return-attachment-storage-rls.mjs  ✓
node scripts/validate-h0-live-payment-rpc-hotfix.mjs        ✓
node scripts/validate-account-batch-1-safe-fixes.mjs        ✓
node scripts/validate-account-batch-3-order-cancellation.mjs ✓
node scripts/validate-account-batch-4-loyalty-ledger.mjs      ✓
node scripts/validate-account-ui-polish.mjs                 ✓
node scripts/validate-production-launch-readiness.mjs       ✓
node --test tests/local-integration.test.mjs                ✓ 77/77 pass
```

New A1F2 tests (7):

1. Direct email header still works  
2. JWT fallback when email header absent  
3. Forged JWT rejected  
4. Wrong audience rejected (when AUD configured)  
5. JWT without email claim rejected  
6. `resolveCloudflareAccessEmail()` JWT path  
7. Missing team domain fails closed with clear message  

---

## 10. Production deployment notes

1. Deploy Functions + static assets (no migration).
2. Set **`CF_ACCESS_TEAM_DOMAIN`** to your Cloudflare Zero Trust team name.
3. Set **`CF_ACCESS_AUD`** to the Access application AUD value (from Zero Trust → Access → Application → AUD tag).
4. Confirm Access still protects `/admin/*` and `/api/admin/*`.
5. Admin flow: Access login → enter admin token → session issued with embedded email → RBAC sections work.
6. If session issuance still fails, temporarily set `ADMIN_ACCESS_IDENTITY_DEBUG=true`, reproduce once, check logs for `hasAccessJwtHeader` / `resolvedEmailMasked` (no secrets logged), then disable.

**Not deployed in this batch.**

---

## 11. Rollback plan

See `COSMOSKIN_A1F2_CLOUDFLARE_ACCESS_JWT_IDENTITY_ROLLBACK_PLAN_20260706.md`.
