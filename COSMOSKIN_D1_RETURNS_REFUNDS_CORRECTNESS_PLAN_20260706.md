# COSMOSKIN D1 — Returns / Refunds Commerce Correctness — Plan

**Date:** 2026-07-06  
**Type:** Planning document only. No code, migrations, SQL, or deploy.  
**Scope:** D1 only — customer return creation correctness + admin return/refund guardrails.  
**Source audits:** `COSMOSKIN_P0_P1_REMEDIATION_PLAN_20260704.md` (Batch D: P1-4, P1-8, P1-9), prior H1/H2 attachment work, A1.2c finance RBAC, B1/B2/B2E (must not regress).

**Explicit out of scope for D1 implementation:**
- Admin auth / RBAC / JWT / session files
- Cloudflare files
- B1/B2 bank-transfer finalization logic
- Email sending templates / Brevo behavior (audit labeling already fixed in B2E)
- Payment callback / payment RPC SQL
- Unrelated checkout logic
- Loyalty/coupon/inventory **policy redesign** (document only; change only if required to fix a correctness bug)
- Refund amount cap math beyond minimal guards (defer full amount correctness to **D2** if data insufficient)

---

## Executive summary

Three confirmed commerce-correctness gaps drive D1:

| # | Gap | Risk | Primary fix surface |
|---|-----|------|---------------------|
| **D1-A** | `isDelivered()` accepts `shipped` without `delivered_at` | **High** — return before delivery | `functions/api/returns.js` + account UI eligibility mirrors |
| **D1-B** | Return window anchor falls back to `updated_at` / `created_at` | **High** — silent 14-day extension | `deliveredAt()` / `withinReturnWindow()` |
| **D1-C** | No cumulative return quantity guard across requests | **High** — over-return | `functions/api/returns.js` (+ optional admin PATCH guard) |
| **D1-D** | `refund_records.status = completed` allows null `provider_reference` | **Medium** — unaudited money movement | `functions/api/admin/refunds.js` |
| **D1-E** | Admin return status transitions unconstrained; no idempotent refund completion | **Medium** — double refund / invalid workflow | `functions/api/admin/returns.js`, `admin/refunds.js` |

**Migration verdict:** **Not required for D1 core fixes.** Existing columns (`orders.delivered_at`, `return_request_items.quantity`, `refund_records.provider_reference`) are sufficient. Code-level validation + tests + validator are the primary delivery. Optional additive migration (deferred decision) only if production needs a DB backstop for refund `provider_reference` or cumulative quantity — see §9.

---

## 1. Customer return creation flow (current state)

### 1.1 Endpoint

| Item | Detail |
|------|--------|
| **File** | `functions/api/returns.js` |
| **Handlers** | `onRequestGet`, `onRequestPost` |
| **Auth** | Bearer token via `getUserFromAccessToken()` |
| **Rate limit** | `assertRateLimit(context, 'return-request', 10, 10min)` on POST |

### 1.2 Account UI entry points

| Surface | File | Behavior |
|---------|------|----------|
| **Primary** | `assets/account-dashboard.js` | Returns tab → “İade Talebi Oluştur” → `createReturnRequest()` → `POST /api/returns` |
| **Standalone** | `assets/account-returns.js` | Same API; loads eligible orders via `GET /api/returns?scope=eligible-orders` |
| **Page shell** | `account/returns.html` | Loads `account-returns.js` |
| **Support hint** | `assets/account-dashboard.js` | Directs “resmi iade” to Returns tab vs support tickets |

**Eligible order selection (client):**
- Dashboard: `returnEligibleOrders()` → `state.summary.orders.filter(isReturnEligible)`
- Standalone: `(data.orders||[]).filter(o => o.is_return_eligible)` from API
- **Server is authoritative** on POST; client filters are UX-only but currently **mirror the same loose rules** (see §1.5).

### 1.3 POST flow (step-by-step)

1. Authenticate user; validate `order_id`.
2. Load order; verify `customer_email` matches user.
3. **`isDelivered(order)`** — eligibility gate (see gap §3).
4. **`withinReturnWindow(order)`** — 14-day window (see §2).
5. Load `order_items`; **`normalizeItems(body.items, orderItems)`** — per-request qty cap only.
6. Hygiene confirmations for cosmetic reasons; attachment rules for damage/wrong/missing.
7. Attachment path ownership check (`isOwnedAttachmentPath` → `customer/{userId}/...`).
8. **Active duplicate guard:** query `return_requests` with `ACTIVE_RETURN_STATUSES`; block if same `product_slug` already in an active request’s `requested_items` JSON.
9. Insert `return_requests`, `return_request_items`, `return_request_attachments`, `return_status_events`, `order_status_events`.
10. CRM event + customer/support emails via `sendAndLog()` (`return_request_received`).

### 1.4 GET flows

| Scope | Behavior |
|-------|----------|
| Default | Customer’s `return_requests` + items + **H2 signed attachments** + status events |
| `?scope=eligible-orders` | Last 30 orders for user/email; attaches `order_items`; sets `is_return_eligible`, `return_window_ends_at` |

### 1.5 Delivered-gate analysis

**Current `isDelivered()` (`returns.js` L33–37):**

```javascript
ELIGIBLE_ORDER_STATUSES = {'shipped','delivered','completed'}
ELIGIBLE_FULFILLMENT = {'shipped','delivered'}
return ELIGIBLE_ORDER_STATUSES.has(status)
  || ELIGIBLE_FULFILLMENT.has(fulfillment)
  || Boolean(order.delivered_at || order.fulfilled_at);
```

| Order state | Current POST result | Expected |
|-------------|---------------------|----------|
| `pending`, `pending_payment`, `pending_bank_transfer`, `payment_failed`, `cancelled`, `preparing`, `packed` | Blocked (not delivered) | Blocked ✓ |
| `shipped` / fulfillment `shipped`, **no** `delivered_at` | **Allowed** | **Must block** |
| `delivered` with `delivered_at` | Allowed | Allowed ✓ |
| `completed` with delivery timestamp | Allowed | Allowed ✓ |

**Missing validations:**
- No explicit **`payment_status === 'paid'`** (or equivalent paid/completed payment) check — low practical risk for returns (unpaid orders rarely ship) but worth documenting; optional hardening in D1.
- No read of **`shipments.delivered_at`** when `orders.delivered_at` is null — admin may mark shipment delivered without syncing order column.

**Risk level:** **High** (P1-4).

**Client mirror (same bug):** `assets/account-dashboard.js` `isDeliveredOrder()` (L773) and API `isEligible()` power the eligible-order dropdown — shipped-not-delivered orders can show “İade Talebi Oluştur”.

**Error copy already promises delivery gate:** POST returns `"Sipariş teslim edildikten sonra iade talebi oluşturabilirsiniz."` — but gate does not enforce it for `shipped`.

---

## 2. Return window rule

### 2.1 Current behavior

| Constant | Value |
|----------|-------|
| `RETURN_WINDOW_DAYS` | 14 |
| Anchor function | `deliveredAt(order)` |

**`deliveredAt()` fallback chain (L25):**

```
order.delivered_at → order.fulfilled_at → order.updated_at → order.created_at
```

**`withinReturnWindow()`:** returns `false` only if all fallbacks are falsy; otherwise `now <= anchor + 14 days`.

### 2.2 Problems

| Issue | Effect | Risk |
|-------|--------|------|
| Fallback to `updated_at` / `created_at` | Window starts at order placement, not delivery | **High** |
| `shipped` passes `isDelivered` | Window may start from `created_at` while package in transit | **High** |
| No shipment `delivered_at` join | Admin-delivered-via-shipment-only orders may lack order-level timestamp | **Medium** |

### 2.3 Planned rule (D1)

1. **Anchor priority (code-only):**
   - `orders.delivered_at` (canonical)
   - Else latest `shipments.delivered_at` for order (new read in POST + eligible-orders GET)
   - Else **`null` → not eligible** (do not fall back to `created_at` / `updated_at` / `fulfilled_at` for window start)

2. **`fulfilled_at`:** do **not** use as delivery proxy (means packed/shipped milestone in this codebase).

3. **Customer-facing errors (Turkish, stable):**
   - No delivery date: `"Sipariş teslim edildikten sonra iade talebi oluşturabilirsiniz."`
   - Window expired: `"İade süresi dolmuştur."` (existing copy `"Yasal iade süresi sona erdi."` — align to one string in UX plan §11)

4. **Persist on insert:** continue storing `delivered_at` + `return_window_ends_at` on `return_requests` using the **resolved canonical delivery timestamp** (not fallback).

---

## 3. Cumulative return quantity validation

### 3.1 Schema (existing)

| Table | Relevant fields |
|-------|-----------------|
| `order_items` | `id`, `order_id`, `product_slug`, `quantity`, `unit_price`, `line_total` |
| `return_request_items` | `return_request_id`, `order_item_id`, `product_slug`, `quantity`, … |
| `return_requests` | `status`, `requested_items` (jsonb snapshot), `order_id` |

**Note:** Legacy name `return_items` in older docs maps to **`return_request_items`** in live migrations (`20260702_customer_returns_account_pdp_polish.sql`).

### 3.2 Current per-request validation (`normalizeItems`)

- Resolves line from `order_items` by `order_item_id` or slug.
- `quantity = clamp(raw, 1, order_item.quantity)` — **single request only**.
- No query of prior `return_request_items` rows.

### 3.3 Current duplicate / parallel request guard

- **`ACTIVE_RETURN_STATUSES`** (L9):  
  `requested, under_review, approved, return_code_shared, waiting_customer_ship, in_transit, received, inspection, refund_pending`
- Blocks new request if **same `product_slug`** appears in `requested_items` of any active request for the order.
- **Does not:**
  - Sum quantities across requests for same `order_item_id`
  - Count completed/refunded returns toward cumulative cap
  - Free quantity when prior request was **`rejected` / `cancelled` / `closed`** (correct intent, but not implemented via quantity math — only slug block while active)
  - Use `return_request_items` table (only json snapshot on parent row for duplicate check)

### 3.4 DB concurrency artifact

**Partial unique index** (`20260511_phase2_invoice_returns_refunds.sql`):

```sql
uq_return_requests_active_order ON return_requests(order_id)
WHERE status IN ('requested','under_review','approved','received')
```

- **Narrower** than application `ACTIVE_RETURN_STATUSES`.
- Can allow **two concurrent return_requests** for same order when first is e.g. `refund_pending` — application slug guard is the only protection.
- D1 should not rely on this index alone; expand logic in code first.

### 3.5 Planned cumulative rule (D1)

For each `order_item_id` (fallback: `product_slug` if id missing):

```
requested_qty
  + SUM(qty from return_request_items joined to return_requests
        WHERE order_id = :order
          AND status IN ACTIVE_CLAIM_STATUSES)
  <= order_items.quantity
```

**Proposed `ACTIVE_CLAIM_STATUSES` (quantity-consuming):**

`requested, under_review, approved, return_code_shared, waiting_customer_ship, in_transit, received, inspection, refund_pending, refunded`

**Exclude from sum (free capacity):**

`rejected, cancelled, closed`

**Open product decision:** If `refunded` return completes but stock not returned, should quantity be re-claimable? **Plan default: no** — refunded rows still consume purchased quantity unless admin rejects/cancels. Document in runbook.

**Admin PATCH:** When admin edits/approves, re-run same cumulative check if quantities can change (today admin cannot change item qty via API — status only). Future-proof validator comment.

**Risk level:** **High** (P1-8).

---

## 4. Admin return decision flow

### 4.1 Endpoints

| File | Methods | Permission |
|------|---------|------------|
| `functions/api/admin/returns.js` | GET, PATCH | `returns:read`, `returns:update` |
| `functions/api/admin/returns/[id]/dhl-return-shipment.js` | POST | `returns:update` |
| `functions/api/admin/refunds.js` | GET, POST | `refunds:update` (both; no separate read seed) |

### 4.2 Admin UI

| File | Role |
|------|------|
| `assets/admin-returns.js` | List + status dropdown PATCH |
| `assets/admin-orders.js` | Order detail: return update forms + refund create form |
| `admin/returns.html` | Admin returns page shell |

### 4.3 PATCH `admin/returns.js` — current behavior

- Accepts arbitrary `status` ∈ `VALID_STATUS`, `refund_status` ∈ `VALID_REFUND`.
- **No transition matrix** — e.g. `requested → refunded` in one step allowed.
- Rejection requires `rejection_reason` (or `admin_note`).
- Side effects on status change:
  - **`return_status_events`** + **`order_status_events`** logged
  - Emails: `return_approved`, `return_rejected`, `refund_completed` (when status → `refunded`)
  - **`reverseOrderPoints()`** when status becomes `refunded` OR `refund_status` becomes `completed` (no refund amount — manual review ratio)

**Not performed:**
- Inventory restock (no automatic `inventory/adjust` / RPC)
- Coupon restoration
- Payment row mutation
- Quantity validation against `order_items`

### 4.4 Refund initiation

- Refunds created only via **`POST /api/admin/refunds`** (no PATCH on refunds).
- Optional `return_request_id` links refund to return; syncs return `refund_status` and may set return `status` to `refunded` when refund completes.

### 4.5 Planned admin workflow guards (D1 — code validation only)

| Action | Planned rule |
|--------|--------------|
| Approve | From `requested` or `under_review` only |
| Reject | From `requested`, `under_review`, or `approved` (pre-ship); require reason |
| Mark received | From post-approval ship flow statuses only (`waiting_customer_ship`, `in_transit`, …) |
| Set `refund_pending` | After `received` / `inspection` |
| Mark return `refunded` | Prefer via linked **`refund_records.completed`** rather than orphan status jump |
| Double refund | Reject second `refund_records` with `status=completed` for same `return_request_id` (or same order if full refund) |

**Inventory / coupon:** Document as **manual ops** in D1; no automatic restock/coupon release unless a latent bug forces a minimal guard.

**Risk:** **Medium** — workflow looseness is operational risk, not customer-facing fraud for D1-A/B/C.

---

## 5. Refund `provider_reference` rule

### 5.1 Current `admin/refunds.js` POST

- `provider_reference: clean(body.provider_reference, 200) || null` — always optional.
- `status === 'completed'` sets `completed_at` regardless of reference.
- Triggers: loyalty reversal (with `refundAmount`), `refund_completed` email, return_request sync.

### 5.2 Schema

`refund_records.provider_reference text NULL` — column exists; no CHECK requiring it when `status = completed`.

### 5.3 Admin UI

`assets/admin-orders.js` refund form: `provider_reference` placeholder **“Opsiyonel”** — encourages null on complete.

### 5.4 Planned rule (D1)

When `status === 'completed'`:

- **Require** non-empty `provider_reference` (trimmed, min length e.g. 3).
- Turkish error: `"Tamamlanan refund için sağlayıcı referansı zorunludur (banka/iyzico dekont no)."`
- **`pending` / `failed` / `cancelled`:** reference remains optional.

**Documented exception path (explicit, not silent):**

- Optional `metadata.offline_refund_mode: 'verbal_confirmed'` + required `metadata.offline_refund_note` (min 20 chars) **only if business approves** — otherwise strict reference only. Default plan: **strict reference, no bypass in D1** unless user approves exception during implementation.

**Risk level:** **Medium** (P1-9).

---

## 6. Refund amount correctness

### 6.1 Current behavior

- `amount` from body, rounded to 2 decimals; **no validation** against `orders.total_amount` or prior refunds.
- Default UI pre-fills `order.total_amount` — partial refunds possible but unguarded.
- No shipping/discount/coupon proration logic in API.

### 6.2 D1 vs D2 split

| Check | D1 | D2 |
|-------|----|----|
| `provider_reference` required on complete | ✓ | |
| Block duplicate `completed` refund per return/order | ✓ | |
| `SUM(completed refunds) + new <= paid/refundable` | Minimal stub if easy | Full proration |
| Line-item refund sum vs returned items | | ✓ |
| Shipping refund policy | Document only | ✓ |

**D1 minimal guard (recommended):** On POST complete, reject if another `refund_records` row exists with `status=completed` and same `return_request_id`. For order-level full refunds, reject second completed refund where `amount` equals or exceeds remaining refundable (needs `paid amount - sum prior completed`).

---

## 7. Loyalty, coupon, inventory side effects (document only)

| System | Current behavior on return/refund | D1 plan |
|--------|-----------------------------------|---------|
| **Loyalty** | `reverseOrderPoints()` on return `refunded` or refund `completed`; proportional when `refundAmount` passed (refunds.js only) | **No change** unless double-reversal bug found; add idempotent refund guard |
| **Coupon** | No automatic `coupon_redemptions` release on return | **No change** — document: coupons not reissued on partial return |
| **Inventory** | No automatic restock on `received` | **No change** — warehouse uses `admin/inventory/adjust` manually (`return_received` reason exists in UI labels) |

---

## 8. RBAC compatibility

### 8.1 Current guards (post-A1.2c)

| Endpoint | Permission | Status |
|----------|------------|--------|
| `admin/returns.js` GET | `returns:read` | ✓ |
| `admin/returns.js` PATCH | `returns:update` | ✓ |
| `admin/returns/[id]/dhl-return-shipment.js` POST | `returns:update` | ✓ |
| `admin/refunds.js` GET/POST | `refunds:update` | ✓ (no separate read) |

**D1 plan:** Do **not** remove or relocate permission checks. New validation runs **after** `requireAdminPermission()`.

**Customer `returns.js`:** Auth via Supabase token only (no RBAC).

---

## 9. Migration need assessment

### 9.1 Not required for D1 (code sufficient)

| Need | Reason |
|------|--------|
| Delivered gate | `orders.delivered_at`, `shipments.delivered_at`, status columns exist |
| Return window | Same |
| Cumulative quantity | `return_request_items.quantity`, `order_items.quantity` exist |
| Provider reference | Column exists; enforce in API |

### 9.2 Optional future migration (not in D1 unless approved)

| Migration | Purpose | When |
|-----------|---------|------|
| `CHECK (status <> 'completed' OR provider_reference IS NOT NULL)` on `refund_records` | DB backstop for reference rule | If ops want defense-in-depth |
| Expanded partial unique index on `return_requests(order_id)` | Align with app active statuses | If code guards prove insufficient under race |
| RPC `cosmoskin_validate_return_quantities(order_id, items[])` | Concurrency-safe quantity check | If double-submit races observed in production |

**D1 default:** **Zero migrations.** Validator fails if D1 adds migration files.

---

## 10. Concurrency and idempotency plan

| Scenario | Current | D1 plan |
|----------|---------|---------|
| Double POST return (double-click) | Rate limit 10/10min; slug active guard | Add **idempotency key** optional follow-up (D1.1) OR rely on cumulative qty + rate limit; integration test double-submit |
| Two tabs racing two returns | Partial unique index may not fire | Cumulative quantity check in same request transaction path; consider SELECT prior items before insert |
| Admin double PATCH approve | Last write wins | Reject if `current.status` not in allowed from-set (optimistic) |
| Double refund complete | **No guard** | Query existing `completed` for `return_request_id` / order |
| Reused `provider_reference` | Not checked | Optional warn log; duplicate reference rejection deferred |

**Pattern:** Follow B1/B2 style — validate state before write, return 409 with Turkish message, prefer **no throw** on email side effects.

---

## 11. Customer UX plan (no redesign)

### 11.1 Align client eligibility with server

Update **`assets/account-dashboard.js`** and **`assets/account-returns.js`** mirrors:

- `isDeliveredOrder()` → require delivery timestamp or `status/fulfillment === 'delivered'` (remove bare `shipped`).
- `deliveredDate()` / `returnWindowEnds()` → same anchor as server (no `created_at` fallback).

### 11.2 Copy matrix (server + client)

| Condition | Message |
|-----------|---------|
| Not delivered | `Sipariş teslim edildikten sonra iade talebi oluşturabilirsiniz.` |
| Window expired | `İade süresi dolmuştur.` |
| Active return for SKU | `Bu ürün için daha önce iade talebi oluşturulmuş.` (extend existing duplicate message) |
| Quantity exceeded | `Bu ürün için iade adedi satın aldığınız miktarı aşamaz.` (new) |

### 11.3 Button visibility

- “İade Talebi Oluştur” only when `is_return_eligible === true` from API (after server fix).
- Orders list: no new return CTA on non-eligible orders (existing pattern).

**Do not** redesign account layout or H2 attachment preview components.

---

## 12. Validator plan

**Create:** `scripts/validate-d1-returns-refunds-correctness.mjs`

### 12.1 Must fail if

- `returns.js` `isDelivered` accepts `shipped` without `delivered_at` / delivery fulfillment
- POST allows return for `pending`, `pending_payment`, `pending_bank_transfer`, `payment_failed`, `cancelled` (static/test harness)
- `deliveredAt()` uses `created_at` or `updated_at` as window anchor
- Cumulative quantity not enforced (grep for `return_request_items` sum or helper name)
- Admin can PATCH approve quantity beyond purchased (if such path exists)
- `admin/refunds.js` allows `completed` without `provider_reference`
- Duplicate `completed` refund not guarded
- RBAC `requireAdminPermission` removed from returns/refunds handlers
- H1/H2 attachment ownership / signing contracts broken in `returns.js` / `return-attachments.js`
- B1/B2/B2E/A1/A1F/A1F2 regressions (chain validators)
- Forbidden files touched: `admin.js`, `admin-audit.js`, `cloudflare-access-jwt.js`, `commerce-finalization.js`, `order-email.js`, `email-events.js`, bank-transfer paths

### 12.2 Chain (same pattern as B2E)

```
validate-b2e-email-events-integrity.mjs
validate-b2-bank-transfer-rejection-finalization.mjs
validate-b1-bank-transfer-finalization.mjs
validate-a1f-admin-rbac-session-identity.mjs
validate-a1-admin-rbac-hardening.mjs
validate-a1-admin-endpoint-coverage.mjs
validate-h2-return-attachment-preview.mjs
validate-h1-return-attachment-storage-rls.mjs
validate-h0-live-payment-rpc-hotfix.mjs
validate-account-batch-1-safe-fixes.mjs
validate-account-batch-3-order-cancellation.mjs
validate-account-batch-4-loyalty-ledger.mjs
validate-account-ui-polish.mjs
validate-production-launch-readiness.mjs
```

---

## 13. Test plan (`tests/local-integration.test.mjs`)

| Test | Assert |
|------|--------|
| Customer cannot return `shipped` order without `delivered_at` | POST 400 |
| Customer can return `delivered` order within 14 days | POST 200 |
| Customer cannot return delivered order outside window | POST 400 |
| Customer cannot return qty > purchased | POST 400 |
| Two requests same item exceed purchased qty cumulatively | Second POST 400 |
| `rejected` prior return does not block new return within qty budget | POST 200 if qty allows |
| Admin cannot complete refund without `provider_reference` | POST 400 |
| Admin can complete with reference | POST 200 |
| Second `completed` refund for same return blocked | POST 409/400 |
| Unauthorized admin PATCH returns / POST refunds | 403 |
| H1 attachment foreign path rejected | existing + regression |
| H2 signed URL still returned on GET | existing + regression |
| B1/B2/B2E tests unchanged | full suite pass |

**Harness notes:** Extend `createFakeSupabase` seed helpers with `orders`, `order_items`, `return_requests`, `return_request_items`, `refund_records`, `shipments`.

---

## 14. Exact files likely to change (implementation batch)

### 14.1 Primary (expected)

| File | Functions / areas |
|------|-------------------|
| `functions/api/returns.js` | `deliveredAt`, `isDelivered`, `withinReturnWindow`, `isEligible`, new `resolveDeliveryTimestamp()`, new `assertReturnQuantities()`, `onRequestPost`, eligible-orders GET |
| `functions/api/admin/refunds.js` | `onRequestPost` — reference required, duplicate complete guard |
| `functions/api/admin/returns.js` | `onRequestPatch` — optional status transition matrix (minimal) |
| `assets/account-dashboard.js` | `isDeliveredOrder`, `deliveredDate`, `returnWindowEnds`, eligibility empty-state copy |
| `assets/account-returns.js` | Mirror eligibility (uses API flag — minimal if server drives truth) |
| `assets/admin-orders.js` | Refund form: mark reference required when status=completed; helper text only |
| `scripts/validate-d1-returns-refunds-correctness.mjs` | **New** |
| `tests/local-integration.test.mjs` | D1 tests |

### 14.2 Possibly touched (small)

| File | Reason |
|------|--------|
| `functions/api/account/summary.js` | Only if eligible metadata exposed to dashboard (optional; may reuse `/returns?scope=eligible-orders`) |
| `assets/admin-returns.js` | Rejection reason UX if transition guards add errors |

### 14.3 Must NOT change

- `functions/api/_lib/admin.js`, `admin-audit.js`, `cloudflare-access-jwt.js`
- `functions/api/_lib/commerce-finalization.js`
- `functions/api/_lib/order-email.js`, `email-events.js`
- `functions/api/iyzico-callback.js`
- `functions/api/_lib/return-attachments.js` (unless H1/H2 contract comment-only)
- Bank-transfer admin paths
- `supabase/migrations/*` (D1 default)

---

## 15. Rollback plan

1. Revert D1 commits (API + account JS + validator + tests).
2. No database rollback (no migrations).
3. Re-run full validator chain; confirm 81+ integration tests pass at pre-D1 baseline.
4. **Behavioral rollback effect:** Shipped-not-delivered returns become allowed again; cumulative over-return possible; completed refunds without reference allowed — document for ops.

---

## 16. Implementation sequencing (within D1)

| Step | Deliverable | Risk |
|------|-------------|------|
| **D1.1** | Server delivered gate + delivery timestamp resolution + window fix | Low — tightens customer POST |
| **D1.2** | Cumulative quantity helper + POST integration | Medium — query `return_request_items` |
| **D1.3** | Refund `provider_reference` + duplicate complete guard | Low |
| **D1.4** | Client eligibility mirror + copy | Low |
| **D1.5** | Admin transition guards (minimal) | Medium — ops workflow |
| **D1.6** | Validator + tests + docs | Low |

Approve each step or entire D1 bundle before coding.

---

## 17. Open product decisions (resolve before or during implementation)

1. **Strict delivery:** Confirm `shipped` without `delivered_at` must **never** allow return (plan assumes yes, per P1-4).
2. **`provider_reference` exception:** Strict only, or verbal/offline documented bypass?
3. **Refunded return quantity:** Does `refunded` status permanently consume line qty?
4. **Payment gate:** Require `payment_status = paid` for return eligibility?

---

## 18. Related completed work (must not regress)

| Batch | Relevance |
|-------|-----------|
| **H1** | Return attachment storage RLS; path ownership on POST |
| **H2/H2B** | Signed attachment URLs customer + admin |
| **A1.2c** | `returns:read/update`, `refunds:update` permissions |
| **B1/B2/B2E** | Unrelated payment paths; chain validators |
| **Batch 3** | Order cancellation — separate from return flow |

---

**Stop here.** D1 is plan-only. No implementation until explicitly approved.
