# COSMOSKIN D2 — Refund Amount Correctness — Plan

**Date:** 2026-07-06  
**Type:** Planning document only. No code, migrations, SQL, or deploy.  
**Scope:** D2 only — refund amount calculation limits and refundable balance enforcement.  
**Builds on:** D1 (`428f584` — delivery gate, cumulative return qty, `provider_reference`, refund idempotency per `return_request_id`), A1.2c finance RBAC, B1/B2/B2E (must not regress).

**Explicit out of scope for D2 implementation:**
- Admin auth / RBAC / JWT / session core files
- Cloudflare files
- B1/B2 bank-transfer finalization logic
- Email sending templates / Brevo behavior
- Payment callback / payment RPC SQL
- Unrelated checkout logic
- Coupon redemption **behavior** changes (release/reissue on return)
- Loyalty ledger **policy** redesign (only pass validated `refundAmount` to existing hook)
- Unrelated inventory logic
- H1/H2 attachment preview/security
- Automated Iyzico refund API integration
- Order `payment_status` → `partially_refunded` automation (document deferral)
- Legal page copy changes for shipping refund policy

---

## Executive summary

D1 fixed refund **audit** correctness (`provider_reference`, duplicate completion per `return_request_id`) but left refund **amount** unconstrained. Today an admin can POST any `amount` (including `null`, zero, or multiples of `order.total_amount`) with no check against what the customer actually paid or what was already refunded.

**Recommended D2 strategy: Option C — strict order-level paid cap in D2; item-level discount proration deferred to D3.**

| # | Gap | Risk | D2 fix |
|---|-----|------|--------|
| **D2-A** | Single refund can exceed paid amount | **Critical** | Validate `amount <= remaining_refundable` |
| **D2-B** | Multiple partial refunds can cumulatively exceed paid | **Critical** | Sum `completed` (+ reserved `pending`) refunds per order |
| **D2-C** | Refund ignores discounts (item snapshots use pre-discount `unit_price`) | **High** | Do **not** trust `return_request_items.refundable_amount` for ceiling; use `orders.total_amount` cap |
| **D2-D** | Shipping inclusion/exclusion undefined in API | **Medium** | Enforce total paid cap only; do not invent shipping split |
| **D2-E** | Refund amount not tied to returned item qty math | **Medium** | Defer item-level sum validation to D3; optional soft warning only |
| **D2-F** | Zero/null/negative amount allowed on `completed` | **High** | Require `amount > 0` on create/complete |
| **D2-G** | Refund on unpaid order possible | **High** | Gate on `payment_status` paid/settled states |

**Migration verdict:** **Not required for D2 core.** Existing `orders.total_amount`, `payments.amount`, `refund_records.amount/status` are sufficient for code-level validation. Optional **D2B** migration if production needs atomic RPC or DB CHECK — see §10.

---

## 1. Refund creation/completion flow (current state)

### 1.1 Admin refund API

| Item | Detail |
|------|--------|
| **File** | `functions/api/admin/refunds.js` |
| **Handlers** | `onRequestGet` (list), `onRequestPost` (create only — **no PATCH**) |
| **RBAC** | `assertAdmin()` + `requireAdminPermission(context, 'refunds:update')` on both |
| **Status values** | `pending`, `completed`, `failed`, `cancelled` (`STATUSES` Set) |
| **Amount field** | `body.amount` → `num()` → rounded 2dp; **`null` allowed** if missing/invalid |
| **Links** | `order_id` (required), `return_request_id` (optional), no `payment_id` |
| **D1 guards** | `provider_reference` required when `status === 'completed'`; `findCompletedRefund()` idempotent return when same `return_request_id` already has `completed` row |
| **Side effects on `completed`** | Insert `refund_records`, `order_status_events`, update linked `return_requests`, `reverseOrderPoints(refundAmount)`, send `refund_completed` email |
| **Missing validation** | No paid-amount ceiling; no cumulative sum; no `amount > 0`; no unpaid-order gate; no currency sanity beyond order default |
| **Risk** | **Critical** |

**Functions:**

| Function | Behavior | Gap |
|----------|----------|-----|
| `onRequestPost` | Single-shot create (pending or completed) | No amount cap |
| `findCompletedRefund` | Blocks duplicate **completed** for same `return_request_id` | Does not block second completed refund with different/null `return_request_id` on same order |
| `num()` | Parses amount | Returns `null` for invalid — not rejected |
| `loadOrder` | Loads order by id | Does not load payments or prior refunds for validation |

### 1.2 Admin return API (adjacent, not amount authority)

| File | Handler | Amount role |
|------|---------|-------------|
| `functions/api/admin/returns.js` | `onRequestPatch` | Updates return status/refund_status; calls `reverseOrderPoints` without `refundAmount` on `refunded` — **no refund amount** |
| `functions/api/returns.js` | Customer POST | Sets `return_request_items.refundable_amount = unit_price × qty` — **pre-discount**, not used by refund API today |

### 1.3 Admin UI

| File | Surface | Current behavior | Gap |
|------|---------|------------------|-----|
| `assets/admin-orders.js` | Order detail → İade/Refund tab → `#refundCreateForm` | Amount input defaults to **`order.total_amount`**; no paid/refunded/remaining display; no client max | **High** UX + false confidence |
| `assets/admin-phase2-console.js` | Returns list | Status/refund_status PATCH only; **no refund amount form** | N/A |
| `assets/admin-returns.js` | Return workflow | Status buttons only | N/A |

**UI fields:** `return_request_id`, `amount`, `currency`, `status`, `provider_reference`, `note`.  
**Completed action:** Select `status: completed` + submit POST (same request as create).  
**Backend is source of truth** — UI mirrors only.

### 1.4 Data linkage model

```
orders (1) ──< refund_records (N)
              └── return_request_id → return_requests (optional)
              └── NO payment_id column
              └── NO refund_items table
payments (N) ── order_id (separate lookup)
return_request_items ── quantity, unit_price_snapshot, refundable_amount (informational only today)
```

---

## 2. Paid amount source analysis

### 2.1 Candidate fields

| Source | Column | Meaning | Trust for refundable ceiling? |
|--------|--------|---------|-------------------------------|
| **orders** | `total_amount` | Checkout grand total after coupon + shipping | **Primary yes** — what customer was charged |
| **orders** | `subtotal_amount` | Pre-shipping product subtotal (pre-discount list sum) | **No** — excludes shipping, ignores discount in total |
| **orders** | `discount_amount` | Order-level coupon discount applied at checkout | Reference only — already baked into `total_amount` |
| **orders** | `shipping_amount` | Shipping charged (0 if free shipping) | Reference only — already in `total_amount` |
| **payments** | `amount` | Set at checkout to `totals.total` | **Secondary cross-check** — should match `orders.total_amount` |
| **payments** | `paid_amount` | **Does not exist** in schema | N/A |
| **invoice_records** | — | Fiscal document; not payment proof | **No** for refund ceiling |
| **iyzico callback** | `retrieve.paidPrice` | Verified at payment time vs `order.total_amount` | Historical proof only; not re-fetched at refund time |

### 2.2 Checkout composition (canonical)

From `functions/api/create-checkout.js` → `calculateTotalsWithCoupon()`:

```
discountedSubtotal = subtotal - discount
shipping = f(discountedSubtotal, freeShipping coupon)
total_amount = discountedSubtotal + shipping   // stored on orders + payments.amount
```

Coupon discount is **order-level** (`orders.discount_amount`, `coupon_redemptions.discount_amount`).  
Per-item discounted prices are allocated ephemerally for Iyzico basket (`buildIyzicoBasketItems`) but **not persisted** on `order_items`.

### 2.3 Recommended paid amount resolver

**`resolvePaidAmount(order, payments[])`** (new helper, D2):

1. If `order.payment_status` **not in** `{ paid, refunded, partially_refunded }` → **not refundable** (400).
2. `paidAmount = round2(order.total_amount)`.
3. If paid `payments` row exists (`status === 'paid'`), assert `abs(payments[0].amount - paidAmount) <= 0.01`; if mismatch, log warning and **still use `orders.total_amount`** (checkout + callback treat it as canonical) OR fail closed with ops error — **recommend fail closed with 409** if mismatch > 0.01 to surface data corruption.
4. Reject refund if `paidAmount <= 0`.

**Do not use** `invoice_records` or `subtotal_amount` alone as ceiling.

---

## 3. Existing refunds — schema and totals

### 3.1 `refund_records` schema (from `20260511_phase2_invoice_returns_refunds.sql`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `order_id` | uuid FK | Required link |
| `return_request_id` | uuid FK nullable | Optional |
| `amount` | numeric(12,2) nullable | **No CHECK > 0** |
| `currency` | text default TRY | |
| `status` | pending \| completed \| failed \| cancelled | |
| `provider_reference` | text nullable | D1: required when completed |
| `completed_at` | timestamptz nullable | Set on completed |
| `created_at` / `updated_at` | timestamptz | |
| `metadata` | jsonb | Manual refund warning |

**No `refund_items` table exists.**

### 3.2 Status classification for balance math

| Status | Count toward `total_successful_refunds`? | Count toward `reserved_pending`? |
|--------|------------------------------------------|----------------------------------|
| `completed` | **Yes** | — |
| `pending` | No | **Yes** (recommended) |
| `failed` | **No** | No |
| `cancelled` | **No** | No |

**Rationale for counting `pending`:** Prevents ops from opening three pending refunds of full order total and completing them sequentially. Pending rows are operational commitments until cancelled/failed.

### 3.3 `completed_refund_total_for_order` (planned)

```js
function sumRefundAmounts(refunds, { includeStatuses }) {
  return round2(
    refunds
      .filter(r => includeStatuses.has(r.status))
      .reduce((sum, r) => sum + Math.max(0, Number(r.amount) || 0), 0)
  );
}

completedTotal = sumRefundAmounts(refunds, { includeStatuses: new Set(['completed']) });
pendingReserved = sumRefundAmounts(refunds, { includeStatuses: new Set(['pending']) });
```

When validating a **new** refund (exclude current insert from sum — always insert, never update):

```
remaining = paidAmount - completedTotal - pendingReserved
```

If validating completion of an existing pending row were added later (D2.1+), exclude that row's id from pending sum — **out of scope** unless PATCH is added; D2 only has POST create.

### 3.4 D1 idempotency interaction

`findCompletedRefund()` returns early for duplicate **completed** POST with same `return_request_id` — **before** amount validation would run on second call. Preserve this ordering:

1. RBAC  
2. Load order  
3. D1: `provider_reference` if completed  
4. D1: idempotent duplicate completed per `return_request_id`  
5. **D2: amount / balance validation**  
6. Insert + side effects  

For idempotent replay, skip amount re-validation (no insert).

---

## 4. Refundable balance rule (planned)

### 4.1 Formula

```
paid_amount = resolvePaidAmount(order, payments)
completed_refund_total = SUM(refund_records.amount WHERE order_id AND status = 'completed')
pending_refund_total = SUM(refund_records.amount WHERE order_id AND status = 'pending')
remaining_refundable = paid_amount - completed_refund_total - pending_refund_total
```

### 4.2 Validation rules (POST `onRequestPost`)

| Rule | When | Error (TR) |
|------|------|------------|
| Order must be paid/settled | Always | `Bu sipariş için iade tutarı oluşturulamaz; ödeme henüz alınmamış.` (or reuse existing tone) |
| `amount` required and `> 0` | Always (including `pending`) | `İade tutarı sıfırdan büyük olmalıdır.` |
| `amount <= remaining_refundable` | Always | **`İade tutarı kalan iade edilebilir tutarı aşamaz.`** |
| Currency matches order | If body.currency present | `Para birimi sipariş ile uyuşmuyor.` |
| `status === 'completed'` | D1 + D2 | `provider_reference` + amount rules |

**Tolerance:** Compare with `round2`; allow no float slack beyond 0.01 TRY.

### 4.3 Partial refunds

Allowed when `amount < remaining_refundable`. Multiple completed partial refunds OK if cumulative sum ≤ paid.

### 4.4 Full refund detection

When `amount === remaining_refundable` (within 0.01), treat as full remaining refund. **Do not** auto-update `orders.payment_status` to `refunded` in D2 — document deferral (ops may still use admin order status separately).

### 4.5 Duplicate `provider_reference`

**D2:** Optional soft audit — warn in metadata if same `provider_reference` exists on another completed refund (different order). **Do not block** unless D2B adds unique index (cross-order references could legitimately repeat for batch bank files). **In-order duplicate reference:** log + optional 409 — low priority.

---

## 5. Returned item amount correctness

### 5.1 Current data

| Table / field | Content | Discount-aware? |
|---------------|---------|-----------------|
| `order_items.unit_price` | Catalog unit price at order time | Pre-discount |
| `order_items.line_total` | `unit_price × quantity` | Pre-discount |
| `order_items.quantity` | Purchased qty | — |
| `return_request_items.quantity` | Returned qty | — |
| `return_request_items.unit_price_snapshot` | Copied from `order_items.unit_price` | **Pre-discount** |
| `return_request_items.refundable_amount` | `unit_price_snapshot × quantity` | **Wrong vs actual paid** when coupon applied |

### 5.2 Coupon / discount structure

- Coupons are **order-level** (`functions/api/_lib/coupons.js`, `coupon_redemptions.discount_amount`).
- `orders.discount_amount` stores applied discount.
- No per-`order_item` discounted line persisted.
- Iyzico basket allocates discount proportionally at payment — not stored.

### 5.3 Item-level feasibility

**Item-level refund validation is NOT safe in D2** without either:
- Persisting per-line discounted totals at checkout (schema change), or
- Recomputing allocation from `orders.discount_amount` + line proportions (fragile, must match checkout rounding).

### 5.4 Planned approach

| Option | D2 decision |
|--------|-------------|
| **A** Order-level cap only | **Yes — primary D2 delivery** |
| **B** Item-level validation | **No — defer to D3** |
| **C** Order cap now, item proration later | **Selected** |

**D3 preview (document only):** Recompute `suggestedRefundForReturn(returnRequestId)` = proportional share of `(order.total_amount - order.shipping_amount?)` by returned line `line_total` weights, capped by remaining balance. Shipping inclusion TBD with legal/commerce policy.

**D2 optional soft hint (non-blocking):** If `return_request_id` provided, show admin UI "Önerilen üst sınır: {remaining}" only — do not auto-fill item sum.

---

## 6. Coupon / discount treatment

| Principle | D2 action |
|-----------|-----------|
| Never refund more than customer paid | Enforce via `orders.total_amount` ceiling |
| Do not change coupon redemption on refund | **No code changes** to `coupons.js` / `coupon_redemptions` |
| Discount already reflected in paid total | Use `total_amount`, not pre-discount item sums |
| Gift/tester clawback (legal text) | Manual ops / future D3 — not automated in D2 |

---

## 7. Shipping refund treatment

| Fact | Implication |
|------|-------------|
| `total_amount` includes `shipping_amount` when charged | Full order refund cap naturally includes shipping |
| Free shipping coupon → `shipping_amount = 0` | Cap still correct |
| Legal pages discuss return **shipping cost** (DHL code), not product refund split | No automated "non-refundable shipping" rule in codebase |
| Partial return shipping policy | **Undefined in data model** |

**D2 plan:** Enforce **total paid cap only**. Do not subtract shipping automatically on partial returns. Document for legal/commerce review:

> Partial refunds may include or exclude shipping at ops discretion today; D2 prevents over-refunding the order total but does not encode shipping-refund policy. Future D3 may add `include_shipping` flag or item-net formula.

---

## 8. Admin UI behavior (planned)

**File:** `assets/admin-orders.js` — `renderReturnTab()` / `createRefund()` only. No redesign.

### 8.1 Display (read-only summary above refund form)

| Label | Source |
|-------|--------|
| Ödenen tutar | `order.total_amount` |
| Tamamlanan iade | sum `refunds` where `status === 'completed'` |
| Bekleyen iade | sum `refunds` where `status === 'pending'` |
| Kalan iade edilebilir | computed client-side (same formula as backend) |

Show only when `payment_status` indicates paid/settled; else disable form with message.

### 8.2 Input behavior

- Default `amount` input to **`remaining_refundable`** (not blind `total_amount`).
- Set `max={remaining}` on number input (HTML hint only).
- On submit: if `amount > remaining`, show toast **`İade tutarı kalan iade edilebilir tutarı aşamaz.`** and abort (client); backend still validates.

### 8.3 No new pages

Do not touch `admin-phase2-console.js` refund status dropdowns.

---

## 9. RBAC compatibility

| Endpoint | Current | D2 |
|----------|---------|-----|
| `admin/refunds.js` GET/POST | `assertAdmin` + `refunds:update` | **Unchanged** — validation runs after permission check |

Do not modify: `admin.js`, `admin-audit.js`, `cloudflare-access-jwt.js`, `admin-runtime.js`.

---

## 10. Migration need assessment

### 10.1 Not required for D2 core

| Need | Existing support |
|------|------------------|
| Paid amount | `orders.total_amount`, `payments.amount` |
| Refund amount/status | `refund_records.amount`, `status` |
| Cumulative sum | Query `refund_records` by `order_id` |
| Code validation | Sufficient for normal ops concurrency |

### 10.2 Optional D2B (separate approval)

| Migration | Purpose | Trigger |
|-----------|---------|---------|
| `CHECK (amount IS NULL OR amount > 0)` on `refund_records` | DB backstop | If null amounts observed in prod |
| `CHECK (status <> 'completed' OR (provider_reference IS NOT NULL AND amount > 0))` | Combine D1+D2 | Defense in depth |
| RPC `cosmoskin_validate_refund_amount(order_id, amount, exclude_id)` | Atomic sum under concurrent admins | If double-refund races observed |
| Partial unique on `(order_id) WHERE status = 'completed' AND return_request_id IS NOT NULL` | One completed refund per return | Already partially covered by D1 code |

**D2 default: zero migrations.**

---

## 11. Concurrency / idempotency plan

| Scenario | D2 mitigation | D2B if insufficient |
|----------|-------------|---------------------|
| Two admins complete refunds simultaneously exceeding paid | SELECT sum + validate before INSERT (best effort) | RPC with row lock on `orders` |
| Double completion same refund | D1 `findCompletedRefund` idempotent path | — |
| Duplicate `provider_reference` | Optional warn; no hard block in D2 | Unique index per provider+reference if needed |
| Stale UI remaining balance | Reload order detail after each refund; show timestamp | — |
| Repeated API submission | Same idempotency + balance check | — |

**Implementation pattern (mirror D1):**

```js
async function loadRefundBalanceContext(context, orderId) {
  const [order, payments, refunds] = await Promise.all([...]);
  const paidAmount = resolvePaidAmount(order, payments);
  const completedTotal = sumRefundAmounts(refunds, COMPLETED);
  const pendingTotal = sumRefundAmounts(refunds, PENDING);
  return { paidAmount, completedTotal, pendingTotal, remaining: round2(paidAmount - completedTotal - pendingTotal) };
}
```

Run immediately before `insertRow` — no transaction wrapper available in current Supabase JS helper.

---

## 12. Validator plan

**New file:** `scripts/validate-d2-refund-amount-correctness.mjs`

### 12.1 Must fail if

- Completed refund amount can exceed `orders.total_amount`
- Multiple completed refunds can cumulatively exceed paid amount
- Refund amount can be zero or negative on completed (or any status)
- Refund completed bypasses D1 `provider_reference` rule
- Refund can be completed twice (D1 idempotency removed)
- `failed` / `cancelled` refunds reduce remaining balance in sum logic
- Admin UI allows amount above remaining without any warning path
- RBAC `refunds:update` guard removed
- D1 delivery/qty/provider_reference protections regress
- B1/B2/B2E/A1/A1F/H0/H1/H2/Batch 1/3/4 validators fail

### 12.2 Must pass (static markers)

- `resolvePaidAmount` or equivalent exists in refunds API
- `remaining_refundable` / balance validation error string present
- `İade tutarı kalan iade edilebilir tutarı aşamaz.`
- Exports helpers for integration tests (like D1)
- Chains `validate-d1-returns-refunds-correctness.mjs` + prior validators

### 12.3 Scope guards

- D2-owned: `functions/api/admin/refunds.js`, `assets/admin-orders.js` (refund tab only)
- Forbidden diff: admin auth, commerce-finalization, iyzico-callback, email-events, order-email, coupons redemption logic

---

## 13. Test plan

**File:** `tests/local-integration.test.mjs` — add D2 section (~10 tests).

| # | Test | Expected |
|---|------|----------|
| 1 | Complete refund above `total_amount` | 400, no insert |
| 2 | Two partial completed refunds exceeding paid | Second 400 |
| 3 | Partial refund within remaining | 200, insert |
| 4 | `failed` refund in history does not reduce remaining | Second refund allowed up to full paid |
| 5 | `cancelled` pending does not reserve balance | Same |
| 6 | `pending` refund reserves balance | Completing second full amount blocked |
| 7 | Zero amount completed | 400 |
| 8 | Negative amount | 400 |
| 9 | Unpaid order (`pending_payment`) refund | 400 |
| 10 | Without `provider_reference` still blocked (D1) | 400 |
| 11 | Idempotent second complete same return | 200 idempotent, no extra row |
| 12 | Unauthorized admin | 403 |
| 13 | D1 return delivery gate still works | Re-run one D1 test marker |
| 14 | B1/B2 smoke subset | Unchanged pass |

**Harness:** Extend fake Supabase seeds with `payments`, multiple `refund_records` rows per order.

---

## 14. Files likely to change (implementation preview)

| File | Change |
|------|--------|
| `functions/api/admin/refunds.js` | **Primary** — balance helpers, validation in `onRequestPost`, export for tests |
| `assets/admin-orders.js` | Refund tab summary + client-side max/warning in `renderReturnTab` / `createRefund` |
| `scripts/validate-d2-refund-amount-correctness.mjs` | **New** |
| `tests/local-integration.test.mjs` | D2 tests |
| `scripts/validate-d1-returns-refunds-correctness.mjs` | Chain D2 validator at end (or D2 chains D1) |
| `scripts/validate-a1-admin-endpoint-coverage.mjs` | D2 scope exemption for refunds.js business logic (if byte-diff) |
| Deliverables (post-implementation) | REPORT, CHANGED_FILES, RUNBOOK, ROLLBACK_PLAN |

**Not expected to change:** `returns.js`, `admin/returns.js`, `commerce-finalization.js`, `coupons.js`, `loyalty-ledger.js` (except unchanged call with validated amount), checkout, payment callback.

### Functions likely added/changed

| Function | File |
|----------|------|
| `resolvePaidAmount(order, payments)` | `admin/refunds.js` (or `_lib/refund-balance.js` if split — prefer single file to minimize scope) |
| `sumRefundAmounts(refunds, statuses)` | same |
| `computeRemainingRefundable(ctx)` | same |
| `validateRefundAmount(amount, balanceCtx)` | same |
| `onRequestPost` | extended validation block |
| `renderReturnTab` / `createRefund` | admin UI mirror |

---

## 15. Rollback plan (for implementation phase)

1. Revert D2 commit(s) — JS-only, no migration rollback needed.
2. Re-run D1 validator + integration tests.
3. **Data:** Refund rows created under D2 rules remain valid; no cleanup required.
4. **Risk if rolled back:** Over-refunding again possible — document in rollback doc.

---

## 16. Before/after summary (expected)

| Behavior | Before D2 | After D2 |
|----------|-----------|----------|
| Max single refund | Unlimited | ≤ remaining refundable |
| Cumulative refunds | Unlimited | ≤ paid amount |
| Zero/null amount | Allowed | Blocked |
| Unpaid order refund | Allowed | Blocked |
| Discount handling | Ignored (UI pre-fills gross total) | Capped at actual paid total |
| Item-level sum vs return qty | Not checked | Still not checked (D3) |
| Shipping split on partial | Undefined | Still undefined; total cap only |
| Pending reservation | None | Counts against remaining |
| D1 provider_reference | Required | Preserved |
| D1 idempotency | Per return_request_id | Preserved |

---

## 17. Dependencies and sequencing

```
D1 (done) → D2 (this plan) → D3 (item-level proration + shipping policy, optional schema)
                         ↘ D2B (RPC/constraints, if races observed)
```

**Stop after D2 plan.** No files modified in this batch except this document.

---

## 18. References

- `COSMOSKIN_D1_RETURNS_REFUNDS_CORRECTNESS_REPORT_20260706.md` — §5–§6 refund gaps deferred to D2
- `COSMOSKIN_D1_RETURNS_REFUNDS_CORRECTNESS_PLAN_20260706.md` — §6.2 D1/D2 split table
- `COSMOSKIN_A1_2C_ADMIN_FINANCE_COVERAGE_REPORT_20260705.md` — refunds RBAC
- `COSMOSKIN_FULL_COMMERCE_SUPABASE_AUDIT_20260704.md` — P1 refund amount gap
- `supabase/migrations/20260511_phase2_invoice_returns_refunds.sql` — `refund_records`
- `supabase/migrations/20260629_cosmoskin_final_user_acceptance_fix.sql` — orders money columns, `order_items`, `payments`
- `supabase/migrations/20260702_customer_returns_account_pdp_polish.sql` — `return_request_items`
- `functions/api/admin/refunds.js` — current handler
- `assets/admin-orders.js` — refund form UI
