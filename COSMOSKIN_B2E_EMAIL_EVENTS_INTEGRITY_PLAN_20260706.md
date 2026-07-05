# COSMOSKIN B2E — Email Events Type Integrity — Plan

**Date:** 2026-07-06  
**Scope:** B2E only — fix `email_events` audit labeling accuracy without changing email sending behavior.  
**Status:** Plan only. **No code, migration, SQL, or deploy in this batch.**

---

## 0. Problem statement (confirmed from B2)

B2 deliberately deferred a pre-existing bug in `functions/api/_lib/email-events.js`:

- `safeEmailType(value, fallback = 'order_created')` returns `fallback` when `value ∉ EMAIL_TYPES`.
- **`bank_transfer_not_received_cancelled`** and **`bank_transfer_reminder`** are used in production code (`order-email.js` COPY, `admin/orders.js` send/resend paths) but are **missing** from `EMAIL_TYPES`.
- Result: rejection and reminder emails **send correctly** via Brevo, but `email_events.email_type` is stored as **`order_created`** — corrupting admin email history and any analytics keyed on type.

Additionally, multiple migrations define **different** `email_events` CHECK constraints with **different names and value lists**. Which constraint(s) are live in production **cannot be inferred from the repo alone** — must be verified read-only against Supabase before any migration or JS-only fix ships.

**Out of scope for B2E:** email template/content changes, Brevo send logic, B1/B2 payment finalization, admin auth/RBAC, Cloudflare Access/JWT/session.

---

## 1. Current email event flow

### 1.1 Insert path

```
Caller (admin/orders.js, iyzico-callback.js, create-checkout.js, returns.js, admin/returns.js, admin/refunds.js, admin/orders/[id]/shipments.js)
  → recordEmailEvent(context, { email_type, customer_email, ... })
    → safeEmailType(event.email_type)           // JS allowlist; unknown → 'order_created'
    → safeEmailStatus(event.status)
    → insertRow(context, 'email_events', payload)
      → Postgres CHECK constraint(s) on email_type  // may accept or reject
```

**Key files:**

| Layer | File | Role |
|---|---|---|
| Allowlist + insert | `functions/api/_lib/email-events.js` | `EMAIL_TYPES`, `safeEmailType()`, `recordEmailEvent()` |
| Templates / send | `functions/api/_lib/order-email.js` | `COPY` keys, `sendOrderStatusEmail`, `sendCommerceTransactionalEmail`, `sendShipmentEmail` — **does not write `email_events`** |
| Restock send | `functions/api/_lib/restock-email.js` | Sends restock emails; **no `recordEmailEvent`** today |

### 1.2 What happens when `email_type` is not in `EMAIL_TYPES`

```javascript
// functions/api/_lib/email-events.js
export function safeEmailType(value, fallback = 'order_created') {
  const type = String(value || '').trim();
  return EMAIL_TYPES.has(type) ? type : fallback;
}
```

- **Silent mislabel:** unknown types become `'order_created'`.
- **No throw, no failed status, no console warning** — insert proceeds with wrong type.
- **No de-dup impact for B2:** B2 idempotency uses `payment_events`, not `email_events` (B2 report §13).

### 1.3 All `recordEmailEvent` call sites

| Source file | Helper / context | Email types passed to `recordEmailEvent` |
|---|---|---|
| `functions/api/admin/orders.js` | `sendAndLogShipmentEmail` | `shipment_created`, `shipment_updated`, `shipment_delivered` (via commerce path) |
| `functions/api/admin/orders.js` | `sendAndLogStatusEmail` | `order_created`, `payment_success`, `payment_confirmed_manual`, `order_preparing`, `order_packed`, `payment_failed` |
| `functions/api/admin/orders.js` | `sendAndLogCommerceEmail` | **`bank_transfer_pending`**, **`bank_transfer_reminder`**, **`bank_transfer_not_received_cancelled`** |
| `functions/api/admin/orders.js` | Shipment suppress branch | `shipment_created` / `shipment_updated` with `status: skipped` |
| `functions/api/admin/orders.js` | B2 rejection (`mark_bank_transfer_not_received`) | **`bank_transfer_not_received_cancelled`** via `sendAndLogCommerceEmail` |
| `functions/api/admin/orders.js` | B1 approval (`mark_payment_paid`) | `payment_confirmed_manual` via `sendAndLogStatusEmail` |
| `functions/api/admin/orders/[id]/emails.js` | Resend API | Any type in `SAFE_RESEND_TYPES` (same set as above resend paths) |
| `functions/api/admin/orders/[id]/shipments.js` | Shipment create | `shipment_created` |
| `functions/api/create-checkout.js` | Bank transfer checkout | `bank_transfer_pending` |
| `functions/api/iyzico-callback.js` | Card success / failure | `payment_success`, `payment_failed` |
| `functions/api/returns.js` | Customer return POST | `return_request_received` (customer + support copy) |
| `functions/api/admin/returns.js` | Admin return status PATCH | `return_approved`, `return_rejected` (also `return_approved` for `return_code_shared`) |
| `functions/api/admin/refunds.js` | Refund complete | `refund_completed` |

**Not logged via `recordEmailEvent` today:**

- `sendRestockEmail` / `notifyRestockAlerts` — restock notifications have no `email_events` row.
- `review_request` — reviews module does not call `recordEmailEvent`.
- Card checkout `order_created` — no post-checkout `order_created` email event at create time (iyzico path logs `payment_success` on callback).

---

## 2. Full email type inventory

Legend:

- **JS** = in `EMAIL_TYPES` (`email-events.js`)
- **COPY** = in `order-email.js` `COPY` object (can send)
- **DB `_chk`** = `email_events_email_type_final_chk` in `20260629_*` migrations (16 values, **missing** bank-transfer reminder/cancelled)
- **DB `_check` (60629 DO)** = `email_events_email_type_final_check` in same files' cleanup block (**includes** reminder + cancelled)
- **DB `_check` (60702)** = `email_events_email_type_check` in `20260702_customer_returns_account_pdp_polish.sql` (broadest list)

| Email type | Used in code (send/log) | JS `EMAIL_TYPES` | COPY | Likely live CHECK (uncertain — verify §3) | Risk |
|---|---|---|---|---|---|
| `order_created` | Yes (admin resend) | Yes | Yes | All migrations | Low |
| `payment_success` | Yes (iyzico + resend) | Yes | Yes | All migrations | Low |
| `payment_confirmed_manual` | Yes (B1 approval + resend) | Yes | Yes | 60628+ | Low |
| `payment_failed` | Yes (iyzico + resend) | Yes | Yes | All migrations | Low |
| `bank_transfer_pending` | Yes (checkout + resend) | Yes | Yes | 60628+ | Low |
| **`bank_transfer_reminder`** | **Yes** (admin resend / manual) | **No → mislabeled `order_created`** | Yes | 60629 DO + 60702 only; **not** in `_final_chk` | **High** |
| **`bank_transfer_not_received_cancelled`** | **Yes** (B2 rejection + resend) | **No → mislabeled `order_created`** | Yes | 60629 DO + 60702 only; **not** in `_final_chk` | **High** |
| `order_preparing` | Yes (admin auto + resend) | Yes | Yes | 60628+ | Low |
| `order_packed` | Yes (resend only) | Yes | Yes | 60628+ | Low |
| `shipment_created` | Yes | Yes | Yes | All migrations | Low |
| `shipment_updated` | Yes | Yes | Yes | All migrations | Low |
| `shipment_delivered` | Yes (resend + commerce) | Yes | Yes | All migrations | Low |
| `return_request_received` | Yes (returns API) | Yes | Yes | Phase2+ | Low |
| `return_approved` | Yes (admin returns) | Yes | Yes | Phase2+ | Low |
| `return_rejected` | Yes (admin returns) | Yes | Yes | Phase2+ | Low |
| `refund_completed` | Yes (admin refunds) | Yes | Yes | Phase2+ | Low |
| `restock_alert` | No (`recordEmailEvent`) | Yes | No | Most migrations | Low (dead allowlist entry) |
| `refund_created` | No (code uses `refund_completed`) | Yes | No | Phase1/2 | Low (dead allowlist entry) |
| `review_request` | No | Yes | No | Most migrations | Low (dead allowlist entry) |
| `return_code_shared` | No (mapped to `return_approved` email) | No | No | 60702 only | None |
| `return_received` | No | No | No | 60702 only | None |
| `refund_pending` | No | No | No | 60702 only | None |

### 2.1 JS vs DB divergence summary

**Confirmed JS bugs (production impact today):**

1. `bank_transfer_not_received_cancelled` — B2 rejection email logged as `order_created` (B2 runbook explicitly documents this).
2. `bank_transfer_reminder` — manual reminder logged as `order_created`.

**Possible DB-layer block (only if live `_final_chk` exists without 60702 superseding it):**

- Even after JS fix, inserts with `bank_transfer_not_received_cancelled` could **fail at Postgres** if `email_events_email_type_final_chk` (16-value list) is still enforced alongside or instead of the broader constraints.

**Migration history conflict (why live state is unknown):**

| Migration | Constraint name | Action | Includes `bank_transfer_not_received_cancelled`? |
|---|---|---|---|
| `20260510_phase1_operational_safety.sql` | inline CHECK | CREATE table | No |
| `20260511_phase2_invoice_returns_refunds.sql` | `email_events_email_type_check` | REPLACE | No |
| `20260628_cosmoskin_final_ecommerce_hotfix.sql` | `email_events_email_type_check` | REPLACE | No |
| `20260629_cosmoskin_checkout_bank_transfer_final_fix.sql` | `email_events_email_type_final_chk` | ADD (after dropping all CHECKs) | **No** |
| `20260629_cosmoskin_final_user_acceptance_fix.sql` | `email_events_email_type_final_chk` | ADD | **No** |
| Same file DO block | `email_events_email_type_final_check` | DROP all email_type CHECKs, ADD | **Yes** |
| `20260629_cosmoskin_final_user_acceptance_fix_v2.sql` | (duplicate of above) | Same | **Yes** (if block ran) |
| `20260702_customer_returns_account_pdp_polish.sql` | `email_events_email_type_check` | DROP/ADD `_check` only | **Yes** |

**Critical:** `20260702` does **not** drop `email_events_email_type_final_chk`. If that constraint survived the 60629 DO block (or was re-added by a partial apply), **multiple CHECK constraints may coexist** — Postgres requires **all** to pass. The **most restrictive** union applies.

---

## 3. Live DB read-only verification SQL

Run in Supabase SQL Editor (production or staging — **read-only, no writes**):

```sql
-- B2E: List every CHECK constraint on public.email_events
SELECT
  c.conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'email_events'
  AND c.contype = 'c'
ORDER BY c.conname;

-- B2E: Focus on email_type-related CHECKs only
SELECT
  c.conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'email_events'
  AND c.contype = 'c'
  AND pg_get_constraintdef(c.oid) ILIKE '%email_type%'
ORDER BY c.conname;

-- B2E: Sample recent rows for mislabeling evidence (read-only)
SELECT
  email_type,
  subject,
  metadata->>'source' AS source,
  created_at
FROM public.email_events
WHERE metadata->>'source' IN ('admin_orders', 'checkout')
  AND (
    subject ILIKE '%iptal%'
    OR subject ILIKE '%Havale/EFT%hatırlat%'
    OR subject ILIKE '%alınamadı%'
  )
ORDER BY created_at DESC
LIMIT 50;

-- B2E: Count rows likely mislabeled (heuristic — not proof alone)
SELECT
  email_type,
  COUNT(*) AS row_count
FROM public.email_events
WHERE email_type = 'order_created'
  AND (
    subject ILIKE '%iptal%'
    OR subject ILIKE '%hatırlat%'
    OR subject ILIKE '%alınmadı%'
  )
GROUP BY email_type;
```

**Decision rule after query:**

1. Parse **every** `email_type` CHECK definition returned.
2. Build `LIVE_DB_ALLOWED = intersection of all constraint value lists` (strictest effective allowlist).
3. Build `CODE_REQUIRED = set of types actually passed to recordEmailEvent` (§2 table).
4. If `CODE_REQUIRED ⊆ LIVE_DB_ALLOWED` → **JS-only fix** sufficient.
5. If any `t ∈ CODE_REQUIRED` but `t ∉ LIVE_DB_ALLOWED` → **migration required** before or with JS fix.

---

## 4. Recommended implementation strategy

### Phase 0 — Read-only live verification (mandatory first step)

- Run §3 SQL against **staging** (preferred) or production.
- Record exact constraint name(s) and full value lists in the B2E implementation report.
- Do **not** ship JS allowlist changes until this completes.

### Phase 1 — JS `EMAIL_TYPES` alignment (always required)

Update `functions/api/_lib/email-events.js`:

1. Add **`bank_transfer_not_received_cancelled`** and **`bank_transfer_reminder`** to `EMAIL_TYPES`.
2. Add any other `CODE_REQUIRED` types missing from JS (none expected beyond those two).
3. **Do not** add types that exist only in 60702 migration but are never passed by code (`return_code_shared`, etc.) unless a caller is added — keep JS aligned to **actual** `recordEmailEvent` usage.

**Harden `safeEmailType` (recommended):**

Replace silent `order_created` fallback for unknown production types with explicit behavior:

```javascript
// Proposed — implementation detail for B2E batch
export function safeEmailType(value, fallback = null) {
  const type = String(value || '').trim();
  if (!type) return fallback || 'order_created';
  if (EMAIL_TYPES.has(type)) return type;
  // Explicit: unknown types must not masquerade as order_created
  return fallback ?? '__invalid_email_type__'; // recordEmailEvent rejects/skips insert OR uses status failed
}
```

Preferred production behavior for unknown types:

- **Do not insert** with wrong type; log `console.error` with masked email + attempted type; return `null` from `recordEmailEvent` OR insert with `status: 'failed'` and `error_message: 'unsupported_email_type:…'` **without** coercing type.
- Keep **`order_created`** fallback only for intentional empty/missing type on legacy paths if any exist — validator must enumerate allowed fallback cases.

**Explicit non-goals:**

- Do not change `sendCommerceTransactionalEmail`, Brevo payloads, or subjects.
- Do not change B1 `confirmManualBankTransferPayment` or B2 `rejectManualBankTransferPayment`.
- Do not touch admin auth / RBAC / JWT files (see guardrails doc).

### Phase 2 — Migration (conditional)

**Migration NOT needed if:**

- Live query shows **no** `email_events_email_type_final_chk` constraint, **or**
- Live effective allowlist already includes `bank_transfer_not_received_cancelled` and `bank_transfer_reminder`, **and**
- JS `EMAIL_TYPES` is updated to match.

**Migration needed if:**

- Code will log `bank_transfer_not_received_cancelled` / `bank_transfer_reminder` with correct types (Phase 1), **but**
- Live `LIVE_DB_ALLOWED` rejects either type.

**Proposed minimal migration** (only after live query — filename TBD, e.g. `20260706_b2e_email_events_type_integrity.sql`):

```sql
-- ILLUSTRATIVE — do not run until live constraint names verified
-- Drop ALL stale email_type CHECK constraints on email_events
ALTER TABLE public.email_events DROP CONSTRAINT IF EXISTS email_events_email_type_check;
ALTER TABLE public.email_events DROP CONSTRAINT IF EXISTS email_events_email_type_final_chk;
ALTER TABLE public.email_events DROP CONSTRAINT IF EXISTS email_events_email_type_final_check;

-- Single canonical constraint: union of CODE_REQUIRED + existing safe values
ALTER TABLE public.email_events ADD CONSTRAINT email_events_email_type_check CHECK (
  email_type IN (
    'order_created','payment_success','payment_confirmed_manual','payment_failed',
    'bank_transfer_pending','bank_transfer_reminder','bank_transfer_not_received_cancelled',
    'order_preparing','order_packed',
    'shipment_created','shipment_updated','shipment_delivered',
    'restock_alert','refund_created','refund_completed',
    'return_request_received','return_approved','return_rejected',
    'review_request'
  )
);
```

Rules:

- **Include all values from previous constraints that appear in existing rows** (query `SELECT DISTINCT email_type FROM email_events` before migration).
- **Never remove** a type that existing rows use.
- **Do not** change table columns or RLS.
- Prefer **one** canonical constraint name (`email_events_email_type_check`) to avoid 60629-style duplication.

### Phase 3 — Validator + tests

See §6–§7.

### Phase 4 — Update B2 validator exemption

`scripts/validate-b2-bank-transfer-rejection-finalization.mjs` currently **fails** if `bank_transfer_not_received_cancelled` appears in `email-events.js` (B2 deferred EMAIL_TYPES fix). B2E must **remove or relocate** that assertion to the B2E validator once the fix lands.

---

## 5. Migration need assessment (pre-live-query estimate)

| Scenario | JS fix only? | Migration? |
|---|---|---|
| Live DB has only `email_events_email_type_check` from 60702 | Yes | No |
| Live DB has `email_events_email_type_final_check` (60629 DO) | Yes | No |
| Live DB has **`email_events_email_type_final_chk`** (16 values) **without** broader constraint | Yes for most types; **No** for bank-transfer reminder/cancelled | **Yes** — extend or replace `_final_chk` |
| Live DB has **both** `_final_chk` (strict) **and** `_check` (broad) | — | **Yes** — drop stale strict constraint |

**Most likely production issue (hypothesis):** JS mislabel only — B2 tests insert into mock DB without CHECK constraints; B2 runbook notes mislabeled `order_created` in preview, implying inserts **succeed** but type is wrong. That suggests live DB either accepts `order_created` (always) or the mislabel avoids CHECK violation.

**Still mandatory:** run §3 SQL — do not ship on hypothesis alone.

---

## 6. Validator plan

**Create:** `scripts/validate-b2e-email-events-integrity.mjs`

Must **fail** if:

| Check | Rationale |
|---|---|
| Any type in `CODE_REQUIRED` missing from `EMAIL_TYPES` | Core B2E fix |
| `bank_transfer_not_received_cancelled` or `bank_transfer_reminder` not in `EMAIL_TYPES` | B2 deferred bug |
| `safeEmailType` silently maps unknown types to `order_created` without explicit allowlist | Prevents regression |
| `recordEmailEvent` can insert mislabeled type for known bank-transfer types | Structural grep / test hook |
| After migration: JS `EMAIL_TYPES` ≠ documented canonical DB list | Drift guard |
| `functions/api/_lib/admin.js`, `admin-audit.js`, `cloudflare-access-jwt.js`, `admin-runtime.js` modified | Admin auth scope guard |
| B2 validator fails (except updated EMAIL_TYPES assertion) | B2 regression |
| B1 validator fails | B1 regression |
| A1/A1F/A1F2 validators fail | Admin auth regression |
| H0/H1/H2, Batch 1/3/4, account UI, production readiness fail | Chained guardrails |

Must **pass** when:

- `EMAIL_TYPES` ⊇ all types passed to `recordEmailEvent` in repo grep.
- Optional: embedded snapshot of live DB allowed list (checked in CI only when env provides it — otherwise skip with warning).

**Update:** `scripts/validate-b2-bank-transfer-rejection-finalization.mjs` — remove "must NOT contain bank_transfer_not_received_cancelled in email-events.js" rule; B2E owns that file.

---

## 7. Test plan

Add to `tests/local-integration.test.mjs` (B2E section):

| Test | Assert |
|---|---|
| B2E: `safeEmailType('bank_transfer_not_received_cancelled')` returns exact type | Not `order_created` |
| B2E: `safeEmailType('bank_transfer_reminder')` returns exact type | Not `order_created` |
| B2E: `recordEmailEvent` after B2 rejection logs `bank_transfer_not_received_cancelled` | Mock `email_events` row type + subject match |
| B2E: B1 `mark_payment_paid` logs `payment_confirmed_manual` | Unchanged B1 behavior |
| B2E: `order_created` resend still logs `order_created` | Baseline |
| B2E: unknown type does not silently become `order_created` | Explicit failed/skipped/null insert per Phase 1 design |
| B2E: iyzico callback still logs `payment_success` / `payment_failed` | No send regression |
| B2E: B2 rejection still sends once, idempotent on second click | B2 behavior unchanged |
| B2E: B1 approval still idempotent | B1 behavior unchanged |
| B2E: admin RBAC smoke (owner passes inventory gate) | Unchanged — reuse existing A1F test or structural skip |

**Mock DB note:** Integration tests use in-memory fake Postgres **without** CHECK constraints. B2E tests validate **JS labeling**; live CHECK compatibility is validated by §3 SQL + optional migration apply on staging.

---

## 8. Files likely to change (implementation batch)

| File | Change |
|---|---|
| `functions/api/_lib/email-events.js` | Add missing types; harden `safeEmailType` / `recordEmailEvent` |
| `supabase/migrations/20260706_b2e_email_events_type_integrity.sql` | **Conditional** — only if §3 shows DB gap |
| `scripts/validate-b2e-email-events-integrity.mjs` | **Create** |
| `scripts/validate-b2-bank-transfer-rejection-finalization.mjs` | Remove EMAIL_TYPES deferral assertion |
| `tests/local-integration.test.mjs` | B2E tests |
| `COSMOSKIN_B2E_EMAIL_EVENTS_INTEGRITY_REPORT_20260706.md` | Post-implementation report |
| `COSMOSKIN_B2E_EMAIL_EVENTS_INTEGRITY_RUNBOOK_20260706.md` | Verification steps |
| `COSMOSKIN_B2E_EMAIL_EVENTS_INTEGRITY_ROLLBACK_PLAN_20260706.md` | Rollback |

**Explicitly NOT changed:**

- `functions/api/_lib/order-email.js` (send/templates) — unless a one-line comment only; no behavior change
- `functions/api/_lib/commerce-finalization.js`, `admin/orders.js` business logic (B1/B2 paths) — only if test asserts logging via existing helpers unchanged
- `functions/api/_lib/admin.js`, `admin-audit.js`, `cloudflare-access-jwt.js`, `assets/admin-runtime.js`
- Admin auth validators beyond chained pass/fail

---

## 9. Rollback plan (for implementation batch)

1. **Revert JS:** restore `email-events.js` to pre-B2E `EMAIL_TYPES` and `safeEmailType` behavior.
2. **Revert migration (if applied):** run down migration or manual `DROP CONSTRAINT` + restore previous constraint definition captured from §3 SQL **before** deploy.
3. **Revert validator/test changes.**
4. **Redeploy** Functions; no customer email behavior change on rollback (labeling returns to mislabeled state only).

Rollback is **low risk** — audit labeling only; no payment/order state.

---

## 10. Execution checklist (when implementing B2E)

- [ ] Run §3 read-only SQL; save output to implementation report.
- [ ] Decide JS-only vs JS+migration from `LIVE_DB_ALLOWED`.
- [ ] Update `EMAIL_TYPES` + `safeEmailType` behavior.
- [ ] Apply migration on staging if required; verify insert with `bank_transfer_not_received_cancelled`.
- [ ] Trigger B2 rejection in staging; confirm `email_events.email_type` correct in admin UI / SQL.
- [ ] Run full validator chain (§6 + user-specified list from B2E requirements).
- [ ] Update B2 runbook note: mislabel expected → **fixed in B2E**.
- [ ] Do **not** deploy without staging proof on real Supabase CHECK constraints.

---

## 11. References

- `COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_REPORT_20260705.md` — §13 EMAIL_TYPES deferred
- `COSMOSKIN_B2_BANK_TRANSFER_REJECTION_FINALIZATION_RUNBOOK_20260705.md` — preview expects mislabeled `order_created`
- `COSMOSKIN_B1_BANK_TRANSFER_FINALIZATION_REPORT_20260705.md` — `payment_confirmed_manual` logging
- `COSMOSKIN_ADMIN_AUTH_RBAC_GUARDRAILS_20260706.md` — protected files; do not touch in B2E
- `COSMOSKIN_PROJECT_MEMORY.md` — checkout/bank-transfer working paths

---

**Stop after plan. No files modified except this plan document.**
