# COSMOSKIN — D1: Returns / Refunds Commerce Correctness — RUNBOOK

**Date:** 2026-07-06  
**Scope:** JS-only return/refund correctness fixes. No migration. No SQL. No schema change.

---

## 1. Pre-deploy verification (local)

Run from repo root:

```bash
node --check functions/api/returns.js
node --check functions/api/admin/refunds.js
node --check functions/api/admin/returns.js
node --check assets/account-dashboard.js
node scripts/validate-d1-returns-refunds-correctness.mjs
node --test tests/local-integration.test.mjs
```

All must pass before deploy.

For full account/API flows locally (optional):

```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```

Static-only server does **not** serve `/api/*`.

---

## 2. Deploy order

1. Deploy Cloudflare Pages (includes `functions/api/**` and `assets/**`) — no separate migration step.
2. No Supabase migration required for D1.
3. Smoke-test immediately after deploy (§3).

---

## 3. Post-deploy smoke tests

### Customer returns

| Scenario | Expected |
|---|---|
| Order `shipped`, no `delivered_at` | Return CTA hidden / POST returns 400 with delivery message |
| Order `delivered` with `delivered_at` within 14 days | Return allowed |
| Order delivered >14 days ago | 400 **`İade süresi dolmuştur.`** |
| Second return exceeding purchased qty | 400/409 quantity or active-return message |

### Admin refunds

| Scenario | Expected |
|---|---|
| POST refund `status: completed` without `provider_reference` | 400 **`Tamamlanan iade için işlem referansı zorunludur.`** |
| POST refund `completed` with reference | 200, side effects once |
| Repeat POST `completed` same return | 200 `{ idempotent: true }`, no duplicate email/points |

### Admin return transitions

| Action | Expected |
|---|---|
| Approve from `requested` | OK |
| Approve from `refunded` | 400 transition error |
| Receive from `approved` | OK |
| Receive from `requested` | 400 |

### RBAC

| Caller | Expected |
|---|---|
| No admin session | 401/403 |
| Admin without `returns:update` / `refunds:update` | 403 |

---

## 4. Monitoring

- Watch Cloudflare Pages function logs for 400 spikes on `POST /api/returns` (delivery/window/qty guards working).
- Watch admin refund POST 400s for missing reference (expected when ops forget reference).
- No new email types introduced — existing B2E audit labels unchanged.

---

## 5. Optional future hardening (not in D1)

**Cumulative return quantity under concurrency:** D1 validates claimed quantities via `return_request_items` + active return statuses at request time. Two simultaneous submissions could still race without a DB constraint or RPC. If this becomes observed in production:

1. Add a Supabase migration with a check constraint or atomic RPC (separate batch).
2. Keep D1 JS validation as first line of defense.

Document any such follow-up in project memory before implementing.

---

## 6. Files deployed

See `COSMOSKIN_D1_RETURNS_REFUNDS_CORRECTNESS_CHANGED_FILES_20260706.txt`.
