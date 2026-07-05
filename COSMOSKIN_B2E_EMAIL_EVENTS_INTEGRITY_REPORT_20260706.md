# COSMOSKIN B2E — Email Events Type Integrity — Implementation Report

**Date:** 2026-07-06  
**Scope:** B2E only (JS audit labeling fix for `email_events.email_type`).  
**Status:** Implemented, tested, validated. **Not deployed.**

---

## 1. Exact files changed

### Modified by B2E

| File | Change |
|---|---|
| `functions/api/_lib/email-events.js` | Added `bank_transfer_reminder` and `bank_transfer_not_received_cancelled` to `EMAIL_TYPES`. Hardened `safeEmailType()` to return `null` for unsupported types (no silent `order_created` fallback). `recordEmailEvent()` now skips audit insert for unsupported types with a safe `console.warn`. |
| `scripts/validate-b2-bank-transfer-rejection-finalization.mjs` | Removed B2 scope guard that forbade `email-events.js` changes. Added comment: B2E owns audit type integrity; B2 payment/rejection behavior unchanged. |
| `tests/local-integration.test.mjs` | Added 4 B2E tests; updated B2 rejection test to assert correct `email_type`. |

### Created by B2E

| File | Purpose |
|---|---|
| `scripts/validate-b2e-email-events-integrity.mjs` | Guardrail for this batch. |
| `COSMOSKIN_B2E_EMAIL_EVENTS_INTEGRITY_REPORT_20260706.md` | This report. |
| `COSMOSKIN_B2E_EMAIL_EVENTS_INTEGRITY_CHANGED_FILES_20260706.txt` | Flat changed-files list. |
| `COSMOSKIN_B2E_EMAIL_EVENTS_INTEGRITY_RUNBOOK_20260706.md` | Verification runbook. |
| `COSMOSKIN_B2E_EMAIL_EVENTS_INTEGRITY_ROLLBACK_PLAN_20260706.md` | Rollback plan. |

### Explicitly NOT changed by B2E

- `functions/api/_lib/order-email.js` — templates, subjects, Brevo send logic untouched.
- `functions/api/admin/orders.js` — bank-transfer send/resend paths unchanged (only audit labeling fixed downstream).
- `functions/api/_lib/commerce-finalization.js` — B1/B2 payment finalization untouched.
- Admin auth/RBAC/JWT/session files (`admin.js`, `admin-audit.js`, `cloudflare-access-jwt.js`, `admin-runtime.js`) — untouched.
- Cloudflare files — untouched.
- No `supabase/migrations/*.sql` — no SQL run, no live row updates.

---

## 2. Live DB CHECK conclusion: no migration required

Live Supabase verification (2026-07-06):

- **`email_events` column:** `customer_email` (not `recipient_email`).
- **Active CHECK constraints** already allow both:
  - `bank_transfer_reminder`
  - `bank_transfer_not_received_cancelled`
- **Conclusion:** JS-only fix is sufficient. No migration, no constraint change, no live row backfill in this batch.

---

## 3. Live existing mislabeled rows (not modified in this batch)

Confirmed production mislabeled rows (pre-B2E):

| Field | Value |
|---|---|
| `subject` | Havale/EFT ödemeniz henüz görünmüyor |
| `metadata.source` | admin_orders |
| `email_type` (current) | `order_created` |
| `email_type` (expected) | `bank_transfer_reminder` |

**Root cause:** `safeEmailType('bank_transfer_reminder')` fell through to default `order_created` because the type was missing from `EMAIL_TYPES`.

**This batch does not update existing live rows.** New sends/resends after deploy will log the correct type.

---

## 4. `EMAIL_TYPES` before / after

### Before (17 types)

```
order_created, payment_success, payment_confirmed_manual, payment_failed,
bank_transfer_pending, order_preparing, order_packed, shipment_created,
shipment_updated, shipment_delivered, restock_alert, refund_created,
refund_completed, return_request_received, return_approved, return_rejected,
review_request
```

**Missing:** `bank_transfer_reminder`, `bank_transfer_not_received_cancelled`

### After (19 types)

Added:

- `bank_transfer_reminder`
- `bank_transfer_not_received_cancelled`

All prior values retained unchanged.

---

## 5. `safeEmailType()` behavior before / after

### Before

```javascript
export function safeEmailType(value, fallback = 'order_created') {
  const type = String(value || '').trim();
  return EMAIL_TYPES.has(type) ? type : fallback;
}
```

Unknown types silently became `order_created`.

### After

```javascript
export function safeEmailType(value) {
  const type = String(value || '').trim();
  if (!type) return null;
  return EMAIL_TYPES.has(type) ? type : null;
}
```

- Known types → return themselves.
- Unknown / empty types → `null` (no mislabeling).
- `recordEmailEvent()` skips insert when `null`, logs `email_events insert skipped: unsupported email_type` with truncated type + optional `metadata.source`.

---

## 6. Proof: bank-transfer types no longer map to `order_created`

Runtime assertions (also enforced by validator + tests):

| Input | Before | After |
|---|---|---|
| `bank_transfer_reminder` | `order_created` | `bank_transfer_reminder` |
| `bank_transfer_not_received_cancelled` | `order_created` | `bank_transfer_not_received_cancelled` |
| `payment_confirmed_manual` | `payment_confirmed_manual` | `payment_confirmed_manual` |
| `order_created` | `order_created` | `order_created` |
| unknown type | `order_created` | `null` (insert skipped) |

Integration proof:

- B2 rejection flow: `email_events[0].email_type === 'bank_transfer_not_received_cancelled'`
- Reminder resend: `email_events[0].email_type === 'bank_transfer_reminder'`

---

## 7. Proof: email sending behavior did not change

- `order-email.js` — zero diff vs HEAD (validator enforced).
- `sendCommerceTransactionalEmail()` still runs before `recordEmailEvent()` in `sendAndLogCommerceEmail()`.
- Without `BREVO_API_KEY`, emails still return `{ skipped: true }` — only audit labeling changed for supported types.
- B1 approval still logs `payment_confirmed_manual` (existing test passes).
- B2 rejection still sends exactly once (existing de-dup gates unchanged).

---

## 8. Test results

All commands passed on 2026-07-06:

```
node --check functions/api/_lib/email-events.js
node scripts/validate-b2e-email-events-integrity.mjs
node scripts/validate-b2-bank-transfer-rejection-finalization.mjs
node scripts/validate-b1-bank-transfer-finalization.mjs
node scripts/validate-a1f-admin-rbac-session-identity.mjs
node scripts/validate-a1-admin-rbac-hardening.mjs
node scripts/validate-a1-admin-endpoint-coverage.mjs
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

**Integration tests:** 81/81 pass (4 new B2E tests).

New B2E tests:

1. `safeEmailType` returns bank-transfer types; unknown → `null`
2. `recordEmailEvent` skips unsupported type (no row inserted)
3. `resendOrderEmail` logs `bank_transfer_reminder`
4. `resendOrderEmail` still logs `order_created`

---

## 9. Rollback plan

See `COSMOSKIN_B2E_EMAIL_EVENTS_INTEGRITY_ROLLBACK_PLAN_20260706.md`.

Summary: revert `email-events.js` to pre-B2E version. No DB rollback needed. Historical mislabeled rows remain until a future optional backfill batch.

---

## 10. Deferred (out of scope for B2E)

- Backfill/correct existing mislabeled `email_events` rows in production.
- Any SQL migration (confirmed unnecessary).
- Email template or send-provider changes.
