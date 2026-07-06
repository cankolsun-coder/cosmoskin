# COSMOSKIN — D3: Refund Snapshot Persistence & Historical Accuracy — PLAN

**Date:** 2026-07-06  
**Type:** Investigation + planning document only. No code, no migrations, no SQL, no deploy.  
**Scope:** D3 only — persist per-line paid values at order creation so refund caps are immutable and do not depend on later reconstruction.  
**Builds on:**
- D1 (`428f584`) — return eligibility, `provider_reference`, refund idempotency.
- D2A (`9d0f481`) — product/shipping separation.
- D2B (`4e5d15a`) — item-level coupon proration via runtime reconstruction from `order_items.line_total` + `orders.discount_amount`.

**Explicitly out of scope for D3 planning (must not touch in implementation without separate approval):**
- Admin auth / RBAC / JWT / session files.
- Payment callback / payment RPC SQL.
- Bank transfer B1/B2 logic.
- Email sending behavior.
- Inventory logic.
- Free-shipping clawback policy (D4).
- Automated Iyzico refund API integration.

---

## 0. Executive summary

**D2B solved correctness for new refunds by reconstructing** proportional discount allocation at refund time using the same algorithm as checkout (`buildIyzicoBasketItems` / `allocateOrderDiscount`). That works when source data is intact and consistent, but it is **not permanently deterministic**:

- Allocation is recomputed on every refund request.
- Any drift between `order_items`, `orders.subtotal_amount`, and `orders.discount_amount` forces fallback or blocks.
- `return_request_items.refundable_amount` is still written at **pre-discount** prices in `returns.js`.
- Algorithm or rounding rule changes would retroactively alter caps for old orders.
- `coupon_redemptions` may disagree with `orders.discount_amount` on legacy rows.

**D3 goal:** at **order creation** (checkout insert), persist an immutable per-line pricing snapshot on `order_items` so refund validation reads **stored paid values** instead of reconstructing them.

**Migration verdict: YES — required for D3.** New columns (or a dedicated snapshot table) are needed. `order_items.metadata` JSONB exists but is unused today; JSON-only persistence is possible without DDL but is weaker for constraints, indexing, and refund-path clarity. **Recommended:** explicit `order_items` columns + `calculation_version`.

**Backward compatibility:** orders without snapshots continue through D2B reconstruction + D2A fallbacks unchanged.

---

## 1. End-to-end trace (investigation)

### 1.1 Checkout → order creation (`functions/api/create-checkout.js`)

| Step | Function / line | What happens |
|------|-----------------|--------------|
| Cart normalize | `normalizeCart()` | Catalog price → `unit_price`, `quantity`, `line_total` (all **pre-discount**). |
| Base totals | `calculateTotals()` | Pre-coupon subtotal + shipping threshold logic. |
| Coupon | `applyCoupon()` → `_lib/coupons.js` | Order-level `discountAmount`, `freeShipping`, type (`percent` / `amount` / `free_shipping`). |
| Final totals | `calculateTotalsWithCoupon()` | `discount = clamp(0, subtotal, coupon.discount)`; `total = (subtotal − discount) + shipping`. |
| Ephemeral allocation | `buildIyzicoBasketItems()` | Proportional `itemDiscount` per line; **last line absorbs remainder**; Iyzico basket price = `line_total − itemDiscount`. **Not persisted.** |
| Order insert | `orderPayload` ~728–799 | Writes `subtotal_amount`, `discount_amount`, `shipping_amount`, `total_amount`, `coupon_code`, rich `metadata`. |
| Items insert | ~803 | `insertRows('order_items', cart.map(item => ({ ...item, order_id })))` — only cart fields; **no paid snapshot.** |
| Coupon log | `recordCouponUsage()` | `coupon_redemptions.discount_amount` = order discount (status `reserved`). |

**Key finding:** the paid per-line values are computed for Iyzico but discarded before DB insert.

### 1.2 Payment success flow

| Path | File | Effect on `order_items` |
|------|------|-------------------------|
| Card (Iyzico) | `iyzico-callback.js` → payment RPCs → `finalizeCommerceAfterPayment()` | **None** — updates `orders` status, `payments`, coupon redemption `used`, invoice shell, loyalty. |
| Bank transfer (B1) | `commerce-finalization.js` `confirmManualBankTransferPayment()` | **None** — same pattern. |
| Payment failure / cancel | checkout cleanup / admin rejection | Order may cancel; items unchanged. |

**Key finding:** payment success does **not** rewrite line pricing. Snapshot must be written at **order creation**, not payment confirmation.

### 1.3 Return creation (`functions/api/returns.js`)

`normalizeItems()` sets:

```
unit_price_snapshot = order_items.unit_price   (pre-discount)
refundable_amount   = unit_price × quantity    (pre-discount)
```

**Key finding:** return rows snapshot the wrong economic base for refunds. D3 should align return item snapshots with persisted `paid_unit_price` / `paid_line_total` at return creation time (separate from order_items persistence but dependent on it).

### 1.4 Refund calculation (`functions/api/admin/refunds.js`)

**D2A** (`resolveProductRefundableCap`, `resolveShippingRefundableCap`, `computeRemainingRefundable`):
- Product cap = `total_amount − shipping_amount` (preferred) or `subtotal − discount`.
- Shipping cap per responsibility rules.
- Completed + pending refunds reserve balance.

**D2B** (`resolveOrderDiscountAmount`, `allocateOrderDiscount`, `resolveItemProratedRefundableCap`):
- Loads `order_items` (`id, unit_price, quantity, line_total` only).
- Loads `coupon_redemptions` as discount fallback.
- Reconstructs allocation; sums `unitPaid × returnedQty`.
- Fail-safe: subtotal mismatch → D2A fallback; unmatched items → `ERR_PRORATION_UNSAFE`.
- `return_request_items.refundable_amount` is **not** trusted.

**Refund record metadata** (POST ~598–618) already stores proration breakdown at refund time — this is a **refund-event snapshot**, not an **order-creation snapshot**.

### 1.5 Admin UI (`assets/admin-orders.js`)

- Mirrors `allocateOrderDiscount` client-side for display.
- Shows proration breakdown when return selected (recomputed live).
- D3 would prefer reading persisted line paid values when present.

---

## 2. Which values should be persisted on `order_items`

### 2.1 Candidate field analysis

| Candidate | Recommend? | Role |
|-----------|------------|------|
| `line_discount` | **No** (ambiguous name) | Could mean product promo vs order coupon. Use `allocated_order_discount`. |
| `allocated_order_discount` | **Yes** | This line's share of `orders.discount_amount` at checkout. |
| `paid_unit_price` | **Yes** | `paid_line_total / quantity` — unit economics for partial returns. |
| `paid_line_total` | **Yes (canonical)** | `line_total − allocated_order_discount` — primary refund base per line. |
| `refund_base_amount` | **No** (redundant) | Same as `paid_line_total` for product lines; shipping stays order-level (D2A). |
| `shipping_allocation` | **No** | D2A/D2B explicitly keep shipping at order level; do not allocate into product refund base. |
| `calculation_version` | **Yes** | Algorithm identifier for forward compatibility and audits. |

### 2.2 Recommended schema (implementation phase — not created in this plan)

```sql
-- order_items additions (proposed)
allocated_order_discount  numeric(12,2) NOT NULL DEFAULT 0
paid_line_total           numeric(12,2) NOT NULL  -- CHECK paid_line_total >= 0
paid_unit_price           numeric(12,2) NOT NULL  -- CHECK paid_unit_price >= 0
pricing_snapshot_version  text NOT NULL DEFAULT 'v1_proportional_last_line_remainder'
```

**Invariants (enforced in app + optional DB checks):**

```
paid_line_total = line_total - allocated_order_discount  (±0.01)
paid_unit_price = paid_line_total / quantity             (rounded 2dp)
Σ allocated_order_discount = orders.discount_amount      (exact, last-line remainder)
Σ paid_line_total = orders.subtotal_amount - orders.discount_amount  (product paid subtotal)
```

**Optional order-level checksum (not required if line sums validated):**

```
orders.product_paid_total  -- redundant with subtotal - discount; useful for admin display only
orders.pricing_snapshot_version
```

### 2.3 Shared helper extraction (implementation note)

Extract allocation from `buildIyzicoBasketItems()` into a shared module (e.g. `functions/api/_lib/order-pricing-snapshot.js`):

```javascript
buildOrderItemPricingSnapshots(cart, orderDiscount, version = 'v1_proportional_last_line_remainder')
// → [{ ...cartFields, allocated_order_discount, paid_line_total, paid_unit_price, pricing_snapshot_version }]
```

Used by:
1. `create-checkout.js` — persist on `order_items` insert.
2. `buildIyzicoBasketItems()` — consume same output (single source of truth).
3. `admin/refunds.js` — read snapshots when present; else D2B reconstruct.
4. `returns.js` — populate return item paid snapshots at return creation.
5. `admin-orders.js` — display persisted values.

---

## 3. Which values already exist

### 3.1 `orders` (persisted at checkout)

| Field | Present | Pre/post discount | D3 use |
|-------|---------|-------------------|--------|
| `subtotal_amount` | Yes | Pre-discount Σ lines | Denominator / validation |
| `discount_amount` | Yes | Order-level discount | Sum check |
| `shipping_amount` | Yes | Post-discount shipping rule | D2A shipping cap |
| `total_amount` | Yes | Final paid total | Payment gate |
| `coupon_code` | Yes | Reference | Audit |
| `metadata.coupon_type`, `free_shipping` | Yes | Reference | Audit |
| `product_paid_total` | **No** | — | Optional |

### 3.2 `order_items` (persisted at checkout)

| Field | Present | Notes |
|-------|---------|-------|
| `unit_price` | Yes | Catalog unit price, pre-discount |
| `quantity` | Yes | |
| `line_total` | Yes | Pre-discount line subtotal |
| `metadata` | Yes (JSONB) | **Unused** — could hold snapshot without migration but not recommended as primary |
| `allocated_order_discount` | **No** | |
| `paid_line_total` | **No** | |
| `paid_unit_price` | **No** | |
| `pricing_snapshot_version` | **No** | |

### 3.3 `coupon_redemptions`

| Field | Present | Notes |
|-------|---------|-------|
| `discount_amount` | Yes | Order-level; D2B fallback source |
| `status` | Yes | `reserved` → `used` on payment |

### 3.4 `return_request_items`

| Field | Present | Notes |
|-------|---------|-------|
| `unit_price_snapshot` | Yes | Pre-discount today |
| `refundable_amount` | Yes | Pre-discount today — **must not be refund authority** |

### 3.5 `refund_records.metadata`

Stores D2B proration breakdown **at refund creation** — useful audit trail but does not fix order-level immutability for future refunds on the same order.

---

## 4. Whether migration is required

| Approach | Migration? | Verdict |
|----------|------------|---------|
| **A. New `order_items` columns** | Yes | **Recommended** — clear contract, CHECK constraints possible, simple refund SELECT |
| **B. `order_items.metadata.pricing_snapshot`** | No (JSONB exists) | Possible shortcut; harder to validate, query, and backfill consistently |
| **C. New `order_item_pricing_snapshots` table** | Yes | Normalized; more joins; only if multiple snapshot revisions per line needed |

**D3 implementation should use Approach A.**

Additionally (implementation phase, not this plan):
- Optional backfill migration/script for reconstructable historical orders.
- Optional `return_request_items.paid_unit_price_snapshot` / corrected `refundable_amount` columns — or fix writes in JS only using joined `order_items` paid fields.

---

## 5. Backward compatibility strategy

### 5.1 Detection

Treat an order line as **snapshot-backed** when:

```
pricing_snapshot_version IS NOT NULL
AND paid_line_total IS NOT NULL
AND paid_line_total >= 0
```

For legacy rows: all snapshot fields null / version absent.

### 5.2 Refund path precedence

```
1. If ALL returned lines have snapshot-backed order_items:
     itemCap = Σ (paid_unit_price × returned_qty)   [no reconstruction]
2. Else if D2B reconstruction safe (subtotal match, discount known):
     itemCap = resolveItemProratedRefundableCap()  [current D2B]
3. Else if D2B fallback (subtotal mismatch):
     itemCap = null → D2A order-level product cap only
4. Else:
     ERR_PRORATION_UNSAFE
```

**Never regress:** D2A shipping rules, D1 idempotency, `provider_reference`, completed/pending balance reservation.

### 5.3 Checkout compatibility

- New checkout writes snapshots for all new orders immediately after D3 deploy.
- In-flight orders (created pre-D3, paid post-D3): no snapshot → D2B path.
- No change to `calculateTotalsWithCoupon` economics — only persistence added.

### 5.4 API read paths

Account/admin order APIs should include new fields in `order_items` SELECT when added. Customer PDP/account displays may continue showing `line_total` (list price) with paid value optional — minimal surface change unless requested.

---

## 6. Old-order fallback strategy

| Order class | Snapshot | Refund behavior |
|-------------|----------|-----------------|
| Pre-D3, consistent data | None | D2B reconstruction (current) |
| Pre-D3, subtotal mismatch | None | D2A fallback only |
| Pre-D3, unmatched return item | None | `ERR_PRORATION_UNSAFE` |
| Backfilled (optional) | `v1_backfill` | Use snapshot; flag in admin UI |
| Post-D3 | `v1_proportional_last_line_remainder` | Use snapshot only |
| Post-D3, zero discount | Snapshot with `allocated_order_discount = 0`, `paid_line_total = line_total` | Trivial snapshot |

**Optional backfill (implementation phase, separate batch approval):**

1. For each paid order where `Σ line_total ≈ subtotal_amount` and `discount_amount` known:
   - Run `allocateOrderDiscount` offline.
   - Write snapshot columns with `pricing_snapshot_version = 'v1_backfill'`.
2. Skip orders failing reconstruction; leave null snapshots.
3. **Do not** silently backfill from `return_request_items.refundable_amount`.

**Free-shipping / shipping:** no retroactive shipping clawback in D3 (same as D2B).

---

## 7. Historical refund determinism after persistence

| Scenario | Before D3 (D2B) | After D3 (new orders) |
|----------|-----------------|------------------------|
| Same order, multiple partial refunds | Recomputed each time; same result if data stable | **Identical** caps from stored `paid_unit_price` |
| `orders.discount_amount` later corrected (manual DB) | Caps change | Caps **unchanged** (snapshot frozen) |
| Algorithm change (`v2_*` version) | Retroactive effect on old orders | Old orders stay on `v1_*`; new orders use `v2_*` |
| Catalog price changes | No effect (order uses stored line_total) | No effect |
| `coupon_redemptions` drift | May change fallback discount source | No effect when snapshot present |
| Refunds already completed | `refund_records.metadata` captures point-in-time breakdown | Unchanged; new refunds on same order use order snapshot |

**Verdict:** For post-D3 orders with complete line snapshots, refund caps become **fully deterministic** and **historically accurate** relative to checkout. Pre-D3 orders remain best-effort via D2B.

**Gap:** Refund records created before D3 still rely on metadata at refund time; D3 does not retroactively fix past `refund_records` unless a separate backfill is requested.

---

## 8. Admin UI impact

**Minimal changes** (mirror D2B style — no redesign):

| Area | Change |
|------|--------|
| Order detail — line items | Show `line_total`, `allocated_order_discount`, `paid_line_total` when snapshot present |
| Refund tab — balance summary | Label source: **"Kayıtlı ödeme tutarı"** vs **"Hesaplanan (eski sipariş)"** |
| Refund tab — proration block | If snapshot: read stored values; else: current client-side `allocateOrderDiscount` |
| Return selector | Prefer `paid_line_total` from `order_items` in `data-return-items` payload |
| Warnings | If mixed snapshot/legacy lines on same order → show caution copy |

**No change** to responsibility selector, shipping approval fields, or D2A policy copy.

---

## 9. Validator strategy

Create `scripts/validate-d3-refund-snapshot-persistence.mjs` (implementation phase).

### 9.1 Must pass

| Invariant | Check |
|-----------|-------|
| Checkout persists snapshots | `create-checkout.js` writes `paid_line_total`, `allocated_order_discount`, `pricing_snapshot_version` on insert |
| Single allocation source | `buildIyzicoBasketItems` uses shared snapshot helper |
| Refund prefers snapshot | `resolveItemProratedRefundableCap` uses `paid_unit_price` when version present |
| D2B fallback preserved | Legacy orders without version still reconstruct |
| No `refundable_amount` trust | `return_request_items.refundable_amount` not final cap |
| Sum invariants | Unit tests: Σ allocated discount = order discount; Σ paid_line_total = product paid subtotal |
| D2A/D2B/D1 regression | Chain `validate-d2b-refund-discount-proration.mjs` |
| Scope guards | No admin auth, payment callback, B1/B2, coupon redemption logic changes |
| No free-shipping clawback | Grep guard |

### 9.2 Chain guard

Use existing `COSMOSKIN_SKIP_VALIDATOR_CHAIN` pattern from D2B to avoid recursive validator deadlock.

### 9.3 High-caution markers

Add to `validate-a1-admin-endpoint-coverage.mjs`:

- `buildOrderItemPricingSnapshots`
- `pricing_snapshot_version`
- `paid_line_total`

---

## 10. Integration test plan

Add to `tests/local-integration.test.mjs` (implementation phase):

| # | Test | Assert |
|---|------|--------|
| 1 | Checkout with percent coupon | `order_items[].paid_line_total` persisted; sum = subtotal − discount |
| 2 | Checkout with fixed coupon | Same + last line absorbs remainder |
| 3 | Checkout zero discount | `allocated_order_discount = 0`, `paid_line_total = line_total` |
| 4 | Partial refund uses snapshot | Refund cap = `paid_unit_price × qty`; no `coupon_redemptions` load needed |
| 5 | Full-order refund uses snapshot | Product cap = Σ `paid_line_total` |
| 6 | Legacy order without snapshot | D2B reconstruction still works |
| 7 | Subtotal mismatch legacy | D2A fallback unchanged |
| 8 | Multiple partial refunds | Cumulative ≤ Σ prorated paid value |
| 9 | Return creation | `return_request_items` paid snapshot matches `order_items` |
| 10 | `seller_fault` shipping + snapshot | Shipping inclusion unchanged (D2A) |
| 11 | `provider_reference` required | D1 rule unchanged |
| 12 | Unauthorized admin | RBAC unchanged |

**Seed helpers:** extend `seedDiscountedMultiLineOrder()` to assert snapshot columns after simulated checkout insert.

---

## 11. Proposed implementation sequence (D3 batch only)

```
D3.0  Migration SQL (order_items columns + optional CHECK)     [separate approval]
D3.1  Shared snapshot helper (_lib/order-pricing-snapshot.js)
D3.2  create-checkout.js — persist snapshots on order_items insert
D3.3  admin/refunds.js — prefer snapshot; keep D2B fallback
D3.4  returns.js — write paid snapshots on return_request_items
D3.5  admin-orders.js — display snapshot source labels
D3.6  validate-d3-refund-snapshot-persistence.mjs + integration tests
D3.7  Deliverables (REPORT, CHANGED_FILES, RUNBOOK, ROLLBACK_PLAN)
```

**Optional D3.8:** backfill script for historical orders (not required for launch).

---

## 12. Files expected to change (implementation phase)

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_d3_order_item_pricing_snapshot.sql` | New columns |
| `functions/api/_lib/order-pricing-snapshot.js` | **New** shared helper |
| `functions/api/create-checkout.js` | Persist snapshots on insert |
| `functions/api/admin/refunds.js` | Read snapshots first |
| `functions/api/returns.js` | Paid return item snapshots |
| `assets/admin-orders.js` | Snapshot vs calculated labels |
| `scripts/validate-d3-refund-snapshot-persistence.mjs` | **New** |
| `tests/local-integration.test.mjs` | D3 tests |
| `scripts/validate-a1-admin-endpoint-coverage.mjs` | Markers |

**Not expected to change:** `coupons.js` redemption rules, `iyzico-callback.js`, `commerce-finalization.js` payment flows, admin auth files.

---

## 13. Rollback sketch (for implementation deliverable)

1. Revert D3 commit(s).
2. New orders lose snapshots; D2B reconstruction resumes (safe).
3. DB columns can remain nullable unused (no forced drop).
4. Re-run D2B validator chain.

---

## 14. Sequencing

```
D1 → D2A → D2B (reconstruct at refund time) → D3 (persist at order creation)
                                                      ↘ D4 (free-shipping clawback policy, if ever)
```

**Stop after this plan.** No implementation. No migration created. No SQL run.

---

## 15. References

- `COSMOSKIN_D2B_REFUND_DISCOUNT_PRORATION_REPORT_20260706.md` — current reconstruction approach.
- `COSMOSKIN_D2B_REFUND_DISCOUNT_PRORATION_PLAN_20260706.md` — §9 optional persistence deferral.
- `COSMOSKIN_D2_REFUND_AMOUNT_CORRECTNESS_REPORT_20260706.md` — D2A product/shipping separation.
- `COSMOSKIN_D1_RETURNS_REFUNDS_CORRECTNESS_REPORT_20260706.md` — provider_reference, idempotency.
- `functions/api/create-checkout.js` — `normalizeCart`, `calculateTotalsWithCoupon`, `buildIyzicoBasketItems`, order/items insert (~803).
- `functions/api/_lib/commerce-finalization.js` — `finalizeCommerceAfterPayment` (no item rewrite).
- `functions/api/returns.js` — `normalizeItems` pre-discount `refundable_amount`.
- `functions/api/admin/refunds.js` — D2A/D2B `loadRefundBalanceContext`, `allocateOrderDiscount`.
- `assets/admin-orders.js` — refund balance UI.
- `supabase/schema.sql` / `20260629_*` — `orders`, `order_items` base schema.
- `supabase/migrations/20260702_customer_returns_account_pdp_polish.sql` — `return_request_items`.
