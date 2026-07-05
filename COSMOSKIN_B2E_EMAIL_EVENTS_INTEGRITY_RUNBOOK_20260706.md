# COSMOSKIN B2E — Email Events Type Integrity — Runbook

**Date:** 2026-07-06  
**Batch:** B2E (audit labeling only — no email send changes, no SQL)

---

## Pre-deploy checklist

- [ ] Confirm live Supabase `email_events` CHECK constraints still include `bank_transfer_reminder` and `bank_transfer_not_received_cancelled` (verified 2026-07-06 — no migration needed).
- [ ] Confirm column name is `customer_email` (not `recipient_email`).
- [ ] Deploy only `functions/api/_lib/email-events.js` (plus validator/docs if desired — not required at runtime).

---

## Local validation (must all pass)

From repo root:

```bash
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

Expected: all validators pass; **81/81** integration tests pass.

---

## Post-deploy smoke (production)

### 1. Bank-transfer reminder audit type

1. Open admin → order with `payment_method = bank_transfer`, status awaiting transfer.
2. Click **Ödeme bekleniyor hatırlatma maili gönder** (or resend `bank_transfer_reminder`).
3. Customer should receive the same email as before (subject unchanged).
4. In Supabase `email_events`, newest row for that order should have:
   - `email_type = bank_transfer_reminder`
   - `customer_email = <order customer email>`
   - `metadata.source = admin_orders`

### 2. Bank-transfer rejection audit type

1. On a test awaiting-transfer order, use **Ödeme alınamadı ve iptal et**.
2. Customer receives rejection email (unchanged).
3. New `email_events` row should have `email_type = bank_transfer_not_received_cancelled`.

### 3. Manual payment approval (regression)

1. Mark a bank-transfer order paid.
2. Confirm `email_type = payment_confirmed_manual` (not changed by B2E).

### 4. Unsupported type safety (optional log check)

If any caller passes an unknown `email_type`, Worker logs should show:

```
email_events insert skipped: unsupported email_type { email_type: '...', source: '...' }
```

No row should be inserted with `email_type = order_created` for that send.

---

## What this batch does NOT do

- Does not backfill historical mislabeled rows (`order_created` where type should be reminder/rejection).
- Does not run SQL or migrations.
- Does not change email templates, subjects, or Brevo integration.

---

## Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| New rows still show `order_created` for reminder | Old Worker still deployed | Redeploy Pages Functions; verify `EMAIL_TYPES` in deployed bundle |
| Insert fails with CHECK violation | DB constraint drift (unexpected) | Compare live CHECK vs migration allowlist; do **not** patch in this batch without separate approval |
| Customer email not sent | Unrelated — B2E only affects audit insert | Check `BREVO_API_KEY`, order `customer_email`; sending path unchanged |

---

## Related docs

- Plan: `COSMOSKIN_B2E_EMAIL_EVENTS_INTEGRITY_PLAN_20260706.md`
- Report: `COSMOSKIN_B2E_EMAIL_EVENTS_INTEGRITY_REPORT_20260706.md`
- Rollback: `COSMOSKIN_B2E_EMAIL_EVENTS_INTEGRITY_ROLLBACK_PLAN_20260706.md`
