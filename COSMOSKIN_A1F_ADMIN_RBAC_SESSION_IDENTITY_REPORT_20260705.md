# COSMOSKIN A1F — Admin RBAC Session Identity Bridge + 403 UX Fix — Implementation Report

**Date:** 2026-07-05  
**Scope:** A1F only — Admin RBAC session identity bridge + 403 UX fix.  
**Status:** Implemented, tested, validated. **Not deployed.**

---

## 1. Exact files changed

See `COSMOSKIN_A1F_ADMIN_RBAC_SESSION_IDENTITY_CHANGED_FILES_20260705.txt` for the flat list.

| File | Change |
|---|---|
| `assets/admin-runtime.js` | Split 401 vs 403 handling in the admin fetch wrapper |
| `assets/admin-runtime.css` | Permission-denied banner styles |
| `functions/api/_lib/admin.js` | Identity-bearing signed session issuance + verified email extraction |
| `functions/api/_lib/admin-audit.js` | `getAdminRecord()` falls back to signed session email |
| `scripts/validate-a1f-admin-rbac-session-identity.mjs` | **Created** — A1F guardrail |
| `scripts/validate-a1-admin-rbac-hardening.mjs` | Exempt A1F-owned files from zero-diff freeze |
| `scripts/validate-a1-admin-endpoint-coverage.mjs` | Same exemption + typo fix |
| `scripts/validate-h0-live-payment-rpc-hotfix.mjs` | Exempt `admin.js` (A1F owns it) |
| `scripts/validate-h1-return-attachment-storage-rls.mjs` | Same |
| `scripts/validate-h2-return-attachment-preview.mjs` | Same |
| `scripts/validate-b1-bank-transfer-finalization.mjs` | Post-commit baseline fix for chained validator (no B1 logic change) |
| `tests/local-integration.test.mjs` | 10 new A1F tests + updated session issuance mocks |

**Not changed:** checkout, payment, B1/B2 bank transfer business logic, customer returns, storage, loyalty, coupons, order business logic, migrations/SQL.

---

## 2. Why the token screen was kept

A1.1/A1.2 added RBAC permission gates on top of the existing admin token layer. This batch does **not** remove the second gate.

The two-layer model remains:

1. **Cloudflare Access** — corporate identity at the edge (`Cf-Access-Authenticated-User-Email`).
2. **Admin token / signed session** — shared `ADMIN_TOKEN` exchanged for a short-lived HMAC session via `POST /api/admin/session`.

Removing the token screen would collapse the defense-in-depth model and is explicitly out of scope for A1F.

---

## 3. Root cause (confirmed)

After A1.1/A1.2:

- `assertAdmin(context)` passed on a valid `x-admin-token` (raw token or signed session).
- `requireAdminPermission(context, 'inventory:read')` called `getAdminRecord()`, which only read `Cf-Access-Authenticated-User-Email`.
- The signed session carried **no email**, so API calls without the Access header on the request returned **403** (not 401).
- `admin-runtime.js` treated 401 and 403 identically — both cleared the session and showed the token login screen.

Dashboard worked because `functions/api/admin/dashboard.js` is `assertAdmin`-only (A1.2c escape hatch). Inventory failed because it requires `inventory:read`.

---

## 4. How verified email is bound to the session

### Session format (new identity-bearing tokens)

```
v1.<expiresAt>.<nonce>.<emailB64>.<hmacSignature>
```

- `emailB64` = base64url encoding of the verified admin email.
- HMAC-SHA256 covers `v1.<expiresAt>.<nonce>.<emailB64>` using `ADMIN_SESSION_SECRET`.
- Tampering with the email segment invalidates the signature.

### Issuance (`issueAdminSession` in `functions/api/_lib/admin.js`)

On `POST /api/admin/session`:

1. Requires valid `ADMIN_TOKEN` in `x-admin-token` (unchanged).
2. Reads `Cf-Access-Authenticated-User-Email` from the request — **never** from body, query, or client-supplied headers.
3. If Access email is missing → **403**: `"Cloudflare Access kimliği doğrulanamadı. /api/admin/* route kapsamını kontrol edin."`
4. Looks up the email in `admin_users` via `resolveActiveAdminByEmail()` — must exist and be active/not disabled.
5. Embeds the verified email in the signed payload and returns `{ token, expiresAt, email }`.

### Legacy compatibility

4-part sessions (`v1.<exp>.<nonce>.<sig>`) still verify for `assertAdmin()` but carry **no email**. RBAC permission checks will fail closed unless the Access header is present on that specific request.

---

## 5. How `getAdminRecord()` resolves admin identity

File: `functions/api/_lib/admin-audit.js`

**Priority:**

1. `Cf-Access-Authenticated-User-Email` header (via `getAccessEmail()`).
2. Verified email from the signed session (via `getVerifiedSessionEmail()` — signature must validate).

**Never trusted:**

- Request body fields (`email`, `is_admin`, `role`, `permissions`, etc.)
- Query parameters
- `localStorage` (server never reads it)
- Arbitrary client headers such as `x-admin-email`

If no trusted email resolves → `getAdminRecord()` returns `null` → `requireAdminPermission()` throws **403**.

Owner accounts with `permissions: ['*']` still pass all permission checks. Inactive/disabled admins still fail at lookup time.

---

## 6. Proof: 403 no longer clears session

`assets/admin-runtime.js` fetch wrapper:

```javascript
if (response.status === 401) {
  clearSession(SESSION_END_MESSAGE);
  showLoginPanel(SESSION_END_MESSAGE);
} else if (response.status === 403) {
  showPermissionError(PERMISSION_DENIED_MESSAGE);
}
```

- **403** calls `showPermissionError('Bu işlem için yetkiniz bulunmuyor.')` only.
- Session token in `sessionStorage` is untouched.
- Admin panel remains usable for sections the admin is allowed to access.

Validator assertion: `scripts/validate-a1f-admin-rbac-session-identity.mjs` fails if 403 paths still call `clearSession()` or `showLoginPanel()`.

Integration test: `A1F: admin-runtime.js clears session only on 401, not on 403`.

---

## 7. Proof: 401 still clears session

Same fetch wrapper branch above — **401** still calls both `clearSession()` and `showLoginPanel()` with the session-expired message.

Session exchange failure on invalid token also clears and shows login panel.

Integration tests:

- `A1F: invalid admin token still returns 401 and does not issue a session`
- Existing `admin signed session is accepted and raw legacy token is disabled by default`

---

## 8. Proof: arbitrary client email is not trusted

`issueAdminSession()` reads identity exclusively from `Cf-Access-Authenticated-User-Email`.

Integration tests:

- `A1F: forged email in request body or x-admin-email header does not grant RBAC` — session issuance and inventory gate both reject forged identity.
- `A1F: missing Cloudflare Access email during login fails with clear 403`

Validator checks that `getAdminRecord()` does not read body/query/`x-admin-email`.

---

## 9. Proof: inactive admin fails

`resolveActiveAdminByEmail()` requires an active, non-disabled `admin_users` row.

- Session issuance returns **403** for inactive admins.
- Integration test: `A1F: inactive admin email fails session issuance`
- Existing A1 test: `A1: hasAdminPermission denies an inactive or disabled admin`

---

## 10. Proof: owner `['*']` passes

Unchanged deny-by-default flip from A1.1 — owner permissions array containing `'*'` short-circuits to allow.

Integration tests:

- `A1F: owner permissions ['*'] still pass after session identity bridge`
- `A1: owner permissions ['*'] pass every permission check after the deny-by-default flip`

---

## 11. Endpoint protection unchanged

| Route | Gate |
|---|---|
| `GET /api/admin/dashboard` | `assertAdmin()` only (A1.2c escape hatch) |
| `GET /api/admin/inventory` | `requireAdminPermission('inventory:read')` |
| All other A1.2a/b/c gated routes | Unchanged permission names |

Integration test: `A1F: dashboard remains assertAdmin-only and inventory remains permission-gated`.

---

## 12. Cloudflare Access `/api/admin/*` configuration warning

**Critical production requirement:**

Cloudflare Access must protect **both**:

- `/admin/*` (static admin UI)
- `/api/admin/*` (session issuance + all admin API calls)

If only `/admin/*` is protected, `POST /api/admin/session` will not receive `Cf-Access-Authenticated-User-Email` at login time. Session issuance will fail with 403 and no identity-bearing session can be created — RBAC-gated sections will continue to return 403.

See runbook for verification steps.

---

## 13. Test results

All commands run locally on 2026-07-05:

```
node --check assets/admin-runtime.js                          ✓
node --check functions/api/_lib/admin.js                      ✓
node --check functions/api/_lib/admin-audit.js                ✓
node scripts/validate-a1f-admin-rbac-session-identity.mjs     ✓
node scripts/validate-a1-admin-rbac-hardening.mjs             ✓
node scripts/validate-a1-admin-endpoint-coverage.mjs          ✓
node scripts/validate-b2-bank-transfer-rejection-finalization.mjs ✓
node scripts/validate-b1-bank-transfer-finalization.mjs       ✓
node scripts/validate-h2-return-attachment-preview.mjs        ✓
node scripts/validate-h1-return-attachment-storage-rls.mjs    ✓
node scripts/validate-h0-live-payment-rpc-hotfix.mjs          ✓
node scripts/validate-account-batch-1-safe-fixes.mjs          ✓
node scripts/validate-account-batch-3-order-cancellation.mjs  ✓
node scripts/validate-account-batch-4-loyalty-ledger.mjs      ✓
node scripts/validate-account-ui-polish.mjs                   ✓
node scripts/validate-production-launch-readiness.mjs         ✓
node --test tests/local-integration.test.mjs                  ✓ 70/70 pass
```

New A1F integration tests (10):

1. 403 UX structural (runtime source)
2. Missing Access email at login → 403
3. Valid token + Access email → identity session
4. Session email bridges RBAC without Access header on API call
5. Forged body/x-admin-email rejected
6. Inactive admin fails issuance
7. Non-owner without `inventory:read` → 403
8. Owner `['*']` passes
9. Dashboard assertAdmin-only; inventory permission-gated
10. Invalid token → 401

---

## 14. Rollback plan

See `COSMOSKIN_A1F_ADMIN_RBAC_SESSION_IDENTITY_ROLLBACK_PLAN_20260705.md`.

Summary: revert the 12 modified/created A1F files. No database migration to roll back. Existing 4-part sessions remain valid for `assertAdmin()` but will not carry RBAC identity until re-login under the restored code path.

---

## 15. Production deploy warning

Before production deploy, confirm Cloudflare Access protects **both** `/admin/*` and `/api/admin/*`.

After deploy, verify:

1. Admin completes Cloudflare Access login.
2. Admin enters `ADMIN_TOKEN` once — session issued with email in payload.
3. Stock/Inventory loads for owner (or admin with `inventory:read`).
4. A section without permission shows the banner — **does not** kick back to token screen.
5. Invalid/expired session still returns to token screen (401).

**Not deployed in this batch.**
