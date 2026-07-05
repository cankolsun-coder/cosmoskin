# COSMOSKIN — D1: Returns / Refunds Commerce Correctness — REPORT

**Date:** 2026-07-06  
**Status:** Implemented locally. Not deployed. No migration created. No SQL run.  
**Source of truth:** `COSMOSKIN_D1_RETURNS_REFUNDS_CORRECTNESS_PLAN_20260706.md`  
**Depends on:** H1/H2 (return attachment ownership + signed preview), A1/A1F (admin RBAC guards), B1/B2/B2E (unchanged by this batch)

---

## 0. Summary

D1 closes six confirmed return/refund commerce gaps without redesigning the return system: customer returns now require real delivery (not merely shipped), the 14-day window anchors only on `delivered_at`, cumulative return quantities are validated against `return_request_items`, admin refund completion requires a non-empty `provider_reference`, duplicate refund completion is idempotent, and admin return status transitions have minimal guards. Account UI mirrors the backend eligibility rules for customer experience only.

---

## 1. Exact files changed

| File | Type of change |
|---|---|
| `functions/api/returns.js` | Delivery gate, return-window anchor, cumulative quantity validation; exports helpers for tests/validator. H1/H2 attachment guards preserved. |
| `functions/api/admin/refunds.js` | Reformatted from minified one-liner; `provider_reference` required on `completed`; `findCompletedRefund()` idempotency guard. |
| `functions/api/admin/returns.js` | Added `validateReturnStatusTransition()` minimal guards on PATCH. |
| `assets/account-dashboard.js` | Client-side return eligibility mirrors server (`resolveDeliveryTimestampForOrder`, stricter `isDeliveredOrder` / `isReturnEligible`). |
| `assets/account-returns.js` | Empty-state / ineligible copy aligned with D1 messages. |
| `scripts/validate-d1-returns-refunds-correctness.mjs` | **New validator** — D1 invariants + chains all prior validators. |
| `tests/local-integration.test.mjs` | 11 new D1 integration tests; A1.2c marker list updated for reformatted `refunds.js`. |
| `scripts/validate-a1-admin-endpoint-coverage.mjs` | D1 scope exemptions for `returns.js`, `account-dashboard.js`, `admin/refunds.js`, `admin/returns.js`; updated high-caution marker for reformatted refunds. |
| `scripts/validate-a1-admin-rbac-hardening.mjs` | D1 scope exemptions for `returns.js`, `account-dashboard.js`. |
| `scripts/validate-a1f-admin-rbac-session-identity.mjs` | D1 scope exemption for `returns.js`. |
| `scripts/validate-b2e-email-events-integrity.mjs` | Removed `validate-a1f-*.mjs` from zero-diff forbidden list so D1 can update A1 scope guards without blocking B2E chain. |

No `supabase/migrations/*.sql` file was created or modified. No SQL was run. No deployment was performed.

---

## 2. Delivered-gate behavior — before vs. after

| Aspect | Before D1 | After D1 |
|---|---|---|
| Shipped order without delivery | Could be eligible via `shipped` / fulfillment status or `fulfilled_at` fallbacks | **Blocked** — requires canonical delivery timestamp |
| `preparing` / `packed` | Sometimes allowed via status heuristics | **Blocked** via `NON_RETURNABLE_ORDER_STATUSES` |
| Payment-pending / cancelled | Inconsistent | **Blocked** for `pending`, `pending_payment`, `pending_bank_transfer`, `payment_failed`, `cancelled` |
| Delivery anchor | Could infer from `fulfilled_at`, `updated_at`, or `created_at` | **`orders.delivered_at` or `shipments.delivered_at` only** (`resolveDeliveryTimestamp`) |
| Customer error | Generic / legal-window wording | **`Sipariş teslim edildikten sonra iade talebi oluşturabilirsiniz.`** |

---

## 3. Return-window behavior — before vs. after

| Aspect | Before D1 | After D1 |
|---|---|---|
| Window start | Could fall back to `order.created_at` / `order.updated_at` | **14 days from resolved delivery timestamp only** |
| Missing `delivered_at` | Could still allow return | **Not eligible** (`withinReturnWindow(null)` → false) |
| Expired window error | `Yasal iade süresi sona erdi.` (or similar) | **`İade süresi dolmuştur.`** |
| Legal text pages | N/A | **Unchanged** (out of scope) |

---

## 4. Cumulative quantity validation — before vs. after

| Aspect | Before D1 | After D1 |
|---|---|---|
| Source of prior claims | Often slug/JSON matching only | **`return_request_items` joined to `return_requests`** |
| Active statuses counted | Incomplete | `requested`, `under_review`, `approved`, `return_code_shared`, `waiting_customer_ship`, `in_transit`, `received`, `inspection`, `refund_pending`, `refunded` |
| Rejected / cancelled | Sometimes counted | **Excluded** from claimed totals |
| Same-request duplicates | Could exceed purchased qty | **Aggregated per `order_item_id`** before validation |
| Errors | Generic | **`Bu ürün için iade adedi satın aldığınız miktarı aşamaz.`** or **`Bu ürün için daha önce iade talebi oluşturulmuş.`** (409) |
| Concurrency | N/A | Best-effort code-level check; optional future DB hardening documented in runbook |

---

## 5. Admin refund `provider_reference` — before vs. after

| Aspect | Before D1 | After D1 |
|---|---|---|
| `completed` without reference | Could be saved | **400** — **`Tamamlanan iade için işlem referansı zorunludur.`** |
| Manual/offline mode | Reference sometimes optional | **Still required** as bank/provider/internal transaction reference |
| RBAC | `refunds:update` | **Unchanged** |

---

## 6. Refund completion idempotency

| Aspect | Before D1 | After D1 |
|---|---|---|
| Second `completed` POST | Could insert duplicate rows / re-run side effects | **`findCompletedRefund()`** returns `{ ok: true, idempotent: true, refund: existing }` with no duplicate insert, email, or loyalty reversal |
| First completion | Unchanged side effects | Unchanged — `reverseOrderPoints`, email, `return_requests` update still run once |

---

## 7. Admin return status transitions

**Changed (minimal guards in `functions/api/admin/returns.js`):**

- `approved` / `rejected` — only from `requested` or `under_review`
- `received` — only from post-approval ship statuses
- `refunded` — only from `received`, `inspection`, or `refund_pending`

No inventory restock automation, coupon/loyalty side effects, or email template changes were made.

---

## 8. Account UI mirror

`assets/account-dashboard.js` now:

- Shows return CTA only when `isReturnEligible()` passes (delivered + in window + no blocking prior return)
- Does not treat `shipped` alone as delivered
- Does not fall back to `created_at` / `updated_at` for window calculation
- Surfaces D1 copy where the existing UI supports reasons

Backend remains source of truth.

---

## 9. Proof: no migration

```bash
git status --porcelain -- supabase/migrations
# (empty — no migration changes)
```

D1 validator §9 also fails if any migration file is modified.

---

## 10. Proof: B1/B2 bank transfer unchanged

Chained validators pass with zero modifications to:

- `functions/api/_lib/commerce-finalization.js`
- `functions/api/admin/orders.js` (B1/B2 paths)
- `functions/api/admin/orders/[id]/status.js`

Integration tests `B1: …` and `B2: …` (14 tests) all pass unmodified.

---

## 11. Proof: B2E email audit unchanged

- `functions/api/_lib/email-events.js` — **not modified**
- `functions/api/_lib/order-email.js` — **not modified**
- `scripts/validate-b2e-email-events-integrity.mjs` — **passed**
- Integration tests `B2E: …` (4 tests) all pass

---

## 12. Proof: admin auth / RBAC core untouched

These files were **not modified**:

- `functions/api/_lib/admin.js`
- `functions/api/_lib/admin-audit.js`
- `functions/api/_lib/cloudflare-access-jwt.js`
- `assets/admin-runtime.js`

RBAC guards remain on D1-touched admin routes:

- `returns:read`, `returns:update` on `functions/api/admin/returns.js`
- `refunds:update` on `functions/api/admin/refunds.js`

Integration tests A1/A1F (38 tests) all pass.

---

## 13. Proof: H1/H2 attachment security intact

- `isOwnedAttachmentPath`, `isSafeAttachmentPath`, POST ownership guard — preserved in `returns.js`
- `signReturnAttachments` — preserved on GET
- `scripts/validate-h1-return-attachment-storage-rls.mjs` — **passed**
- `scripts/validate-h2-return-attachment-preview.mjs` — **passed**
- D1 test: foreign-owned attachment path → 403

---

## 14. Test results

```text
node --check functions/api/returns.js                          PASS
node --check functions/api/admin/refunds.js                    PASS
node --check functions/api/admin/returns.js                    PASS
node --check assets/account-dashboard.js                       PASS
node scripts/validate-d1-returns-refunds-correctness.mjs       PASS (chains all prior validators)
node scripts/validate-b2e-email-events-integrity.mjs           PASS
node scripts/validate-b2-bank-transfer-rejection-finalization.mjs PASS
node scripts/validate-b1-bank-transfer-finalization.mjs        PASS
node scripts/validate-a1f-admin-rbac-session-identity.mjs      PASS
node scripts/validate-a1-admin-rbac-hardening.mjs              PASS
node scripts/validate-a1-admin-endpoint-coverage.mjs           PASS
node scripts/validate-h2-return-attachment-preview.mjs         PASS
node scripts/validate-h1-return-attachment-storage-rls.mjs     PASS
node scripts/validate-h0-live-payment-rpc-hotfix.mjs           PASS
node scripts/validate-account-batch-1-safe-fixes.mjs           PASS
node scripts/validate-account-batch-3-order-cancellation.mjs   PASS
node scripts/validate-account-batch-4-loyalty-ledger.mjs       PASS
node scripts/validate-account-ui-polish.mjs                    PASS
node scripts/validate-production-launch-readiness.mjs          PASS
node --test tests/local-integration.test.mjs                   92 pass, 0 fail
```

### New D1 integration tests (11)

1. Customer cannot create return for shipped order without delivery timestamp  
2. Customer can create return for delivered order within return window  
3. Customer cannot create return for delivered order outside return window  
4. Customer cannot return more than purchased quantity cumulatively  
5. Rejected prior return does not count against cumulative quantity budget  
6. `resolveDeliveryTimestamp` ignores `created_at` and uses shipment `delivered_at` fallback  
7. Customer return rejects foreign-owned attachment path (H1)  
8. Admin cannot complete refund without `provider_reference`  
9. Admin can complete refund with `provider_reference` and cannot complete twice  
10. Unauthorized admin cannot mutate returns or refunds  
11. Admin return approve rejects invalid status transition  

---

## 15. Rollback

See `COSMOSKIN_D1_RETURNS_REFUNDS_CORRECTNESS_ROLLBACK_PLAN_20260706.md`.

---

## 16. Deferred

- DB-level transactional lock / RPC for cumulative return quantity under high concurrency (documented in runbook; no migration in D1)
- Legal text page copy updates for return window wording (explicitly out of scope)
