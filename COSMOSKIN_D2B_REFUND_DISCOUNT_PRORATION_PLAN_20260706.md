# COSMOSKIN — D2B: Item-level Coupon & Discount Proration for Refunds — PLAN

**Date:** 2026-07-06
**Type:** Planning document only. No code, no migrations, no SQL, no deploy.
**Scope:** D2B only — prorate order-level coupon/discount across returned items so refunds reflect what the customer *actually paid*, capped by D2A `product_refundable_cap`.
**Builds on:**
- D1 (`428f584`) — delivery gate, cumulative return qty, `provider_reference`, refund idempotency.
- D2A (`9d0f481`) — product/shipping separation; shipping excluded by default; shipping only for `seller_fault` / `carrier_damage` / `full_order_refund` / `manual_review`+approval.

**Explicitly out of scope for D2B (must not touch):**
- Admin auth / RBAC / JWT / session files (`admin.js`, `admin-audit.js`, `cloudflare-access-jwt.js`, `admin-runtime.js/.css`).
- Cloudflare config files.
- Bank transfer B1/B2 finalization logic.
- Email sending behavior.
- Payment callback (`iyzico-callback.js`) and payment RPC SQL.
- Inventory logic.
- Attachment preview/security (H1/H2).
- Unrelated checkout UI.
- Coupon **redemption behavior** (release/reissue on return) — no change to `coupons.js` / `coupon_redemptions` writes.
- Free-shipping **clawback** (explicitly deferred — see §5).
- Automated Iyzico refund API integration.

---

## 0. Executive summary

Today, D2A caps refunds at an **order-level** product amount (`total_amount − shipping_amount`). It does **not** distribute the order-level coupon/discount down to individual returned items. `return_request_items.refundable_amount` is written at **pre-discount** `unit_price × quantity` (see §2). So a partial return of one line can still be over-refunded relative to what the customer paid for that line after a coupon.

**D2B goal:** compute a **prorated paid value per returned line**, sum it into an `item_prorated_refundable_cap`, and enforce:

```
requested_refund ≤ min( item_prorated_refundable_cap , D2A remaining_refundable )
```

**Migration verdict: NOT required for new orders.** The refund endpoint already loads `order_items` and the order row inside `loadRefundBalanceContext()`. Order-level discount lives on `orders.discount_amount`; line pre-discount subtotals live on `order_items.line_total`. Proration can be reconstructed deterministically at refund time using the **same last-item-absorbs-remainder** allocation the checkout already uses for the Iyzico basket (`buildIyzicoBasketItems`). A migration is **only** needed if we want to *persist* the allocation for historical immutability or for orders whose `order_items` rows are missing/zeroed (see §9). D2B proposes **no migration**; it documents a minimal optional future migration and a fail-safe for un-reconstructable old orders.

---

## 1. Checkout & order calculation trace

### 1.1 Cart subtotal, discount, shipping, total

| Concern | File | Function | Current behavior |
|---|---|---|---|
| Cart normalization | `functions/api/create-checkout.js` | `normalizeCart()` | Merges lines, sets `unit_price` (catalog price), `quantity`, `line_total = unit_price × quantity`. All **pre-discount**. |
| Base totals | `functions/api/create-checkout.js` | `calculateTotals()` | `subtotal = Σ line_total`; `shipping = subtotal ≥ 2500 ? 0 : 89`; VAT is informational (extracted from gross). |
| Coupon apply | `functions/api/create-checkout.js` | `applyCoupon()` → `_lib/coupons.js` `validateCouponEligibility()` | Returns `discountAmount`, `discountType` (`percent`/`amount`/`free_shipping`), `freeShipping`. |
| Final totals | `functions/api/create-checkout.js` | `calculateTotalsWithCoupon()` | `discount = clamp(0, subtotal, coupon.discount)`; `discountedSubtotal = subtotal − discount`; `shipping = 0 if freeShipping or discountedSubtotal ≥ 2500 else 89`; `total = discountedSubtotal + shipping`. |
| Iyzico per-item allocation | `functions/api/create-checkout.js` | `buildIyzicoBasketItems()` | **Ephemeral** proportional allocation: `itemDiscount = discount × (line_total / subtotal)`, last item absorbs remainder. **Not persisted.** |

### 1.2 Fields written to `orders` (from `orderPayload`, lines ~728–799)

| Field | Value | D2B relevance |
|---|---|---|
| `subtotal_amount` | `totals.subtotal` (pre-discount Σ line_total) | **Yes** — proration denominator |
| `discount_amount` | `totals.discount` | **Yes** — proration numerator |
| `shipping_amount` | `totals.shipping` | D2A shipping cap |
| `vat_amount` | informational | No |
| `total_amount` | `totals.total` | D2A product cap = `total − shipping` |
| `coupon_code` | `coupon.code` | Reference |
| `metadata.coupon_type` / `free_shipping` | coupon type flag | Reference for edge cases |

### 1.3 Fields written to `order_items` (line ~803)

`insertRows('order_items', cart.map(item => ({ ...item, order_id })))` — writes exactly the cart shape:
`product_id, product_slug, product_name, brand, image, unit_price, quantity, line_total`.
**No discounted price, no allocated discount, no line-after-discount.**

### 1.4 Is there enough data for item-level refund calculation?

**Yes, for new orders**, by reconstruction:
- `order_items.line_total` gives each line's pre-discount subtotal.
- `orders.subtotal_amount` gives the denominator (equals Σ line_total for normal orders).
- `orders.discount_amount` gives the total discount to distribute.
- The allocation algorithm is already defined and used by `buildIyzicoBasketItems`.

**Fail-safe needed** when Σ `order_items.line_total` ≠ `orders.subtotal_amount` (data drift, missing items) — see §9 / §12.

---

## 2. `order_items` data analysis

**Schema** (`20260629_cosmoskin_final_user_acceptance_fix.sql`, identical in `_v2` and `checkout_bank_transfer_final_fix`):

```
order_items(
  id uuid, order_id uuid, product_id text, product_slug text,
  product_name text, brand text, sku text, image text,
  unit_price numeric(12,2), quantity integer, line_total numeric(12,2),
  metadata jsonb, created_at timestamptz )
```

| Needed for proration | Present? | Notes |
|---|---|---|
| product_id / slug | **Yes** | `product_id`, `product_slug` |
| quantity | **Yes** | `quantity` |
| unit price before discount | **Yes** | `unit_price` |
| unit price after discount | **No** | not stored |
| line subtotal before discount | **Yes** | `line_total` |
| line discount (allocated) | **No** | not stored |
| line total after discount | **No** | not stored |
| tax per line | **No** | VAT only at order level (informational) |
| snapshot price | **Partial** | `unit_price`/`line_total` are order-time snapshots (catalog price at checkout) |
| product title / brand snapshot | **Yes** | `product_name`, `brand` |

**Historical price reliability:** `unit_price`/`line_total` are reliable **pre-discount** snapshots. The **post-discount** paid value is *not* stored and must be reconstructed from `orders.discount_amount`.

**`return_request_items` (populated in `functions/api/returns.js` `normalizeItems`, lines ~139–140):**
`unit_price_snapshot = source.unit_price` and `refundable_amount = unit_price × quantity` — **PRE-DISCOUNT**. This is the concrete over-refund vector D2B closes. D2B will **not** trust `return_request_items.refundable_amount` as a ceiling (same stance D2A took), and does not rewrite how returns.js populates it (out of scope; returns.js is D1-owned).

---

## 3. Coupon & discount data analysis

**Tables:** `coupons`, `coupon_redemptions` (`20260629_*` migration).

| Question | Finding |
|---|---|
| Percentage vs fixed | Both. `coupons.discount_type ∈ {percent, amount, free_shipping}`. `_lib/coupons.js` `APPROVED_RULES` has percent (WELCOME10, BIRTHDAY10, ROUTINE5) and fixed (SIGNATURE75, ELITE100). |
| Order-level or item-level | **Order-level only.** `discountFor()` computes on the whole subtotal; capped by `max_discount_amount`. No per-item or per-category logic. |
| Discount stored on order | **Yes** — `orders.discount_amount`; mirrored in `coupon_redemptions.discount_amount`. |
| Per-item allocation stored | **No.** Only the ephemeral Iyzico basket allocation exists at checkout. |
| Excluded products/categories | **None.** No exclusion fields in `coupons` schema or `_lib/coupons.js`. |
| Coupon affects shipping? | Only `free_shipping` type sets `shipping = 0`. `percent`/`amount` discounts apply to product subtotal only and never reduce shipping. |

**Implication:** Because discount is uniformly order-level over the product subtotal with no exclusions, **proportional allocation by `line_total` is correct and lossless** (subject to rounding, §8).

---

## 4. Refund proration rule (proposed)

### 4.1 Preferred formula (data supports it)

For each returned line *i*:

```
line_paid_total_i   = line_total_i − allocated_discount_i         // post-discount paid for the whole purchased line
paid_unit_i         = line_paid_total_i / quantity_purchased_i
item_refund_i       = round2( paid_unit_i × returned_quantity_i )
```

Where `allocated_discount_i` is computed by proportional allocation:

```
allocated_discount_i = discount_amount × (line_total_i / Σ line_total)   // for all but last eligible line
last eligible line   = discount_amount − Σ(previous allocated_discount)   // absorbs rounding remainder
```

This mirrors `buildIyzicoBasketItems()` exactly, guaranteeing consistency with what was charged.

### 4.2 Worked example (matches user spec)

| Line | line_total | share | allocated_discount | line_paid_total |
|---|---|---|---|---|
| A | 600 | 60% | 60 | 540 |
| B | 400 | 40% | 40 | 360 |
| Σ | 1000 | — | 100 | 900 |

Return of full A → `item_refund = 540`. Return of full B → `360`.

### 4.3 Fallback when only order-level discount exists

Already the case here (no persisted per-item discount). D2B **always** reconstructs via §4.1. There is no separate "item-level discount already stored" path in this codebase.

### 4.4 Hard rules

- Do **not** allocate shipping or shipping-discount into product refund (D2A owns shipping).
- `item_prorated_refundable_cap = Σ item_refund_i` over returned lines, **clamped to D2A `product_refundable_cap`**.
- Effective ceiling: `min(item_prorated_refundable_cap, D2A remaining_refundable)`.
- Never refund more than paid.
- Preserve all D2A shipping inclusion rules unchanged.

### 4.5 When no `return_request_id` is supplied

The refund POST allows a bare `order_id` refund. In that case there are no returned lines to prorate. D2B behavior: fall back to **D2A caps only** (product cap / shipping rules), i.e. the item cap is `null` and only the order-level remaining applies. The item-level cap is an **additional** ceiling that activates when a return with items is linked. This keeps full-order refunds working (§6) and avoids blocking legitimate order-level ops refunds.

---

## 5. Free-shipping threshold handling

**Facts:**
- Free shipping is granted when `discountedSubtotal ≥ 2500` (or `free_shipping` coupon). `shipping_amount = 0` is then stored.
- A partial return can drop the *retained* order value below 2500.
- **No code today** claws back shipping in that case, and there is no policy field for it.

**Decision (recommended default, documented):**
> **D2B does NOT claw back free shipping.** If an order received free shipping, a partial return does not retroactively charge shipping, and shipping remains governed solely by D2A responsibility rules. Any future clawback requires explicit commerce/legal approval and a separate batch (D3+).

Rationale: no stored policy, no legal basis in current pages, and clawback would *reduce* a customer refund — high-risk to automate silently. The validator (§13) will assert D2B does not introduce automatic shipping clawback.

---

## 6. Full-order refund behavior (proposed)

- `product refund = paid product subtotal after coupon` = `total_amount − shipping_amount` (equals Σ `line_paid_total`).
- Shipping handled by D2A responsibility rules (e.g. `full_order_refund` flag may include shipping per D2A).
- Total refund must not exceed `paid total` (`total_amount`).
- Completed + pending refunds still reserve balance (D2A `computeRemainingRefundable`).
- When a full-order return lists all lines, `item_prorated_refundable_cap` will equal `product_refundable_cap` (within rounding), so the item ceiling is non-binding — correct.

---

## 7. Partial refund behavior (proposed)

- Refund only the returned line's prorated paid value (`§4.1`).
- Exclude shipping by default (D2A).
- Never refund discount the customer never paid (that's the whole point).
- Multiple partial returns: each new refund validated against `min(item cap for these lines, remaining_refundable)`. Cumulative completed + pending across the order still cannot exceed `product_refundable_cap` (D2A) — so multiple partial refunds cannot collectively exceed prorated product value.

---

## 8. Rounding strategy (proposed)

- Currency precision: 2 decimals; reuse existing `roundMoney()` (`Math.round(x*100)/100`).
- Allocation must sum **exactly** to `discount_amount`: all lines but the last use proportional rounding; the **last eligible line absorbs the remainder** (mirrors `buildIyzicoBasketItems`).
- `Σ allocated_discount === discount_amount` (assertion in validator/tests).
- `Σ line_paid_total === subtotal_amount − discount_amount === total_amount − shipping_amount` (product cap identity).
- `item_prorated_refundable_cap` is finally clamped to `product_refundable_cap` so rounding drift can never exceed the paid product amount.
- Per-line refund for partial quantities: `round2(paid_unit × returned_qty)`; the clamp in the previous bullet protects the aggregate.

---

## 9. Database / migration need

### 9.1 Verdict: NO migration in D2B

Enough data exists to compute proration at refund time:
- `loadRefundBalanceContext()` already fetches `order` + `order_items` + `return_request` + `refunds` + `payments`.
- Discount reconstruction is deterministic and matches the charged basket.

### 9.2 When a migration *would* be needed (not created here)

- If we required an **immutable persisted** allocation (audit-grade) rather than reconstruction.
- If historical `order_items` are missing/zeroed so Σ `line_total` cannot be trusted.

### 9.3 Minimal optional future migration (proposed text only — DO NOT CREATE)

```sql
-- FUTURE (D2B-persist / D3), not part of this batch:
alter table if exists public.order_items
  add column if not exists allocated_discount numeric(12,2) not null default 0,
  add column if not exists line_paid_total   numeric(12,2);  -- line_total - allocated_discount
-- Backfill new orders at checkout; leave historical NULL and reconstruct.
```

### 9.4 Old-order handling (fail-safe)

If, at refund time, `Σ order_items.line_total` differs from `orders.subtotal_amount` by more than 0.01, or `order_items` is empty:
- **Do not** compute an item cap.
- Fall back to **D2A caps only** and surface an admin note: item-level proration unavailable for this order (reconstruct not reliable). This is fail-safe: it never *raises* the ceiling, and D2A already prevents over-refunding the order.

---

## 10. Admin UI plan (minimal, no redesign)

**File:** `assets/admin-orders.js` — refund tab only (`renderRefundBalanceSummary`, `refundBalanceSummary`, `syncRefundFormBalance`). Mirror server math client-side (as D2A already does).

**Add, when a `return_request_id` with items is selected:**
- Orijinal ürün ara toplamı (pre-discount line subtotal of returned lines)
- Dağıtılan indirim (allocated discount for those lines)
- Ödenen ürün tutarı (prorated paid value = item cap)
- Maksimum iade edilebilir ürün tutarı (min(item cap, D2A remaining))
- Kargo dahil/hariç durumu (from D2A — unchanged)
- Kalan iade edilebilir tutar (D2A remaining)

**Required copy (exact):**
- “İndirim tutarı iade edilecek ürünlere oransal olarak dağıtılır.”
- “İade tutarı müşterinin ürün için fiilen ödediği tutarı aşamaz.”
- “Kargo bedeli standart ürün iadesine dahil edilmez.”

When no return/items selected, UI shows D2A summary unchanged. Do not add pages; do not touch `admin-phase2-console.js` / `admin-returns.js`.

---

## 11. Backend validation plan

**File:** `functions/api/admin/refunds.js` (D2A-owned; extend, don't regress).

Add helpers (exported for tests):
- `allocateOrderDiscount(orderItems, discountAmount)` → `Map(order_item_id → allocated_discount)` with last-line remainder.
- `resolveItemProratedRefundableCap(order, orderItems, returnItems)` → `{ ok, itemCap, source }`; fail-safe returns `{ ok:false }` per §9.4.
- Extend `computeRemainingRefundable` / `validateRefundAmount` inputs so the effective remaining is `min(D2A remaining, itemCap)` when an item cap exists.

Endpoint (`onRequestPost`) validation order (preserve D1/D2A ordering):
1. RBAC (`assertAdmin` + `refunds:update`) — unchanged.
2. Load order — unchanged.
3. D1: `provider_reference` on completed — unchanged.
4. D1: idempotent duplicate completed per `return_request_id` — unchanged.
5. D2A: `resolvePaidAmount` gate + product/shipping caps + `remaining_refundable`.
6. **D2B: if `return_request_id` links items → compute `itemCap`; effective ceiling = `min(remaining, itemCap)`.**
7. `amount > 0` and `amount ≤ effective ceiling` → else `İade tutarı kalan iade edilebilir tutarı aşamaz.` / `İade tutarı müşterinin ürün için fiilen ödediği tutarı aşamaz.`
8. Insert + side effects — unchanged (loyalty/email only on completed).

Preserved: `provider_reference`, idempotency, failed/cancelled excluded from balance, pending reserves balance.

---

## 12. Edge cases

| Case | D2B behavior |
|---|---|
| Fixed-amount coupon | Allocated by `line_total` share; last line absorbs remainder. |
| Percentage coupon | Same allocation (discount already resolved to an amount at checkout). |
| Coupon larger than one returned item's line | Allocation is proportional to line_total, so a single small line never absorbs more than its share; `line_paid_total ≥ 0` guaranteed by clamp. |
| Coupon ≥ full subtotal | `discount` clamped to subtotal at checkout; `line_paid_total → 0`; item refund → 0 (fail-safe: refund must be > 0, so admin cannot create a 0/negative refund). |
| BOGO / free item | Not supported by current coupon engine (no such rule); no special handling; treated as normal amount/percent. Documented as unsupported. |
| Bundle / set product | Sold as normal `order_items` lines; no bundle concept in schema; proration applies per line. |
| Manual admin discount | No manual per-order discount mechanism exists beyond coupon `discount_amount`; whatever is in `discount_amount` is prorated. |
| Full order refund | Item cap ≈ product cap; non-binding (§6). |
| Partial order refund | Item cap binds to returned lines (§7). |
| Multiple return requests | Each refund validated against cumulative D2A remaining + its own item cap; cannot collectively exceed product cap. |
| Old order missing data | Fail-safe: no item cap; D2A caps only (§9.4). |
| `subtotal_amount` ≠ Σ line_total | Fail-safe (§9.4). |
| `discount_amount = 0` | Item cap = Σ line_total for returned lines (no discount to allocate) — equals pre-discount, which is correct because nothing was discounted. |

---

## 13. Validator plan

**New file:** `scripts/validate-d2b-refund-discount-proration.mjs` (chains D2A → D1 → all prior validators, like D2A does).

**Must fail if:**
- Refund uses undiscounted item price when a coupon/discount was applied (item cap not reduced by allocated discount).
- Order-level discount is ignored in allocation.
- An item refund can exceed the line's prorated paid value.
- Partial refunds can cumulatively exceed prorated product value / `product_refundable_cap`.
- Shipping is included by default.
- Any D2A shipping rule regresses (seller_fault/carrier_damage/full_order/manual approval).
- `provider_reference` rule (D1) regresses.
- Refund idempotency (D1) regresses.
- Admin UI hides allocated discount / prorated paid item value (missing required copy or fields).
- Free-shipping clawback is introduced automatically.
- D1 return protections regress.
- B1/B2/B2E behavior regresses.
- A1/A1F/A1F2 admin auth behavior regresses.
- H0/H1/H2/Batch 1/3/4 validators fail.
- Any `supabase/migrations/*` modified (D2B creates no migration).
- Admin auth/RBAC protected files modified.

**Must pass (static markers):**
- `allocateOrderDiscount`, `resolveItemProratedRefundableCap` exported from `refunds.js`.
- Unit assertions: allocation sums to `discount_amount`; example (600/400, disc 100 → 540/360).
- Required Turkish copy present in `admin-orders.js`.

**Also update** `scripts/validate-a1-admin-endpoint-coverage.mjs` high-caution markers for the new exports (as D2A did), and add D2B-owned-file exemptions where zero-diff guards would otherwise fire.

---

## 14. Test plan

**File:** `tests/local-integration.test.mjs` — add D2B section. Extend seed with multi-line `order_items` + `return_request` + `return_request_items` and `discount_amount`.

| # | Test | Expected |
|---|---|---|
| 1 | Percentage coupon prorates across returned items | Item cap = post-discount share |
| 2 | Fixed-amount coupon prorates across returned items | Same, remainder on last line |
| 3 | Partial return refunds only prorated paid value | Over-prorated amount → 400 |
| 4 | Full-order return refunds paid product subtotal; shipping separate | 200; shipping per D2A |
| 5 | Rounding never exceeds total paid product subtotal | Σ ≤ product cap |
| 6 | Multiple partial refunds cannot exceed prorated product amount | Second over-cap → 400 |
| 7 | Shipping excluded by default (customer_preference) | Shipping not in cap |
| 8 | seller_fault shipping inclusion (D2A) still works | Shipping included |
| 9 | Free-shipping threshold not clawed back | No shipping charge-back |
| 10 | Old order missing discount allocation fails safe | Falls back to D2A caps; no over-refund |
| 11 | `provider_reference` still required on completed | 400 without it |
| 12 | Unauthorized admin cannot mutate refunds | 403 |
| 13 | D1/D2A protections unchanged | Existing D1/D2A tests still pass |
| 14 | Discount ≥ subtotal → item paid 0 → refund > 0 blocked | 400 |

---

## 15. Files likely to change (implementation preview — NOT this batch)

| File | Change |
|---|---|
| `functions/api/admin/refunds.js` | Add `allocateOrderDiscount`, `resolveItemProratedRefundableCap`; wire item cap into `loadRefundBalanceContext` / `validateRefundAmount`; export for tests. |
| `assets/admin-orders.js` | Refund tab: show original subtotal / allocated discount / paid item value / item cap; add required copy. Mirror math only. |
| `scripts/validate-d2b-refund-discount-proration.mjs` | **New** validator (chains D2A + all prior). |
| `tests/local-integration.test.mjs` | D2B tests + multi-line seeds. |
| `scripts/validate-a1-admin-endpoint-coverage.mjs` | High-caution markers + D2B scope exemptions. |
| Deliverables | REPORT, CHANGED_FILES, RUNBOOK, ROLLBACK_PLAN (on delivery). |

**Not expected to change:** `create-checkout.js` (no persisted allocation in D2B), `coupons.js`, `returns.js`, `admin/returns.js`, `commerce-finalization.js`, `iyzico-callback.js`, `loyalty-ledger.js`, all migrations.

### Functions likely added/changed

| Function | File |
|---|---|
| `allocateOrderDiscount(orderItems, discountAmount)` | `admin/refunds.js` |
| `resolveItemProratedRefundableCap(order, orderItems, returnItems)` | `admin/refunds.js` |
| `computeRemainingRefundable` / `validateRefundAmount` (extended input) | `admin/refunds.js` |
| `refundBalanceSummary` / `renderRefundBalanceSummary` (UI mirror) | `admin-orders.js` |

---

## 16. Rollback plan (for implementation phase)

1. Revert D2B commit(s) — JS-only, no migration to roll back.
2. Re-run D2A + D1 validators and full integration suite.
3. Data: refund rows created under D2B remain valid; metadata (allocated discount, item cap) is informational.
4. Risk if rolled back: reverts to D2A order-level product cap (still safe against over-refunding the order; only loses per-line precision).

---

## 17. Sequencing

```
D1 (done) → D2A (done) → D2B (this plan: item proration, no migration)
                                   ↘ D2B-persist / D3 (optional order_items discount columns, shipping/free-ship policy)
```

**Stop after this plan.** No files modified except this document. Do not start D2B implementation, D3, or any other batch.

---

## 18. References

- `COSMOSKIN_D2_REFUND_AMOUNT_CORRECTNESS_REPORT_20260706.md` (D2A) — product/shipping separation.
- `COSMOSKIN_D2_REFUND_AMOUNT_CORRECTNESS_PLAN_20260706.md` — original D2 order-level cap; §5.3 defers item proration.
- `COSMOSKIN_D1_RETURNS_REFUNDS_CORRECTNESS_REPORT_20260706.md` — provider_reference + idempotency.
- `COSMOSKIN_ADMIN_AUTH_RBAC_GUARDRAILS_20260706.md` — protected files.
- `functions/api/create-checkout.js` — `calculateTotalsWithCoupon`, `buildIyzicoBasketItems`, order/order_items insert.
- `functions/api/_lib/coupons.js` — order-level coupon engine.
- `functions/api/returns.js` — `normalizeItems` (pre-discount `refundable_amount`).
- `functions/api/admin/refunds.js` — D2A caps + `loadRefundBalanceContext`.
- `assets/admin-orders.js` — refund tab UI.
- `supabase/migrations/20260629_cosmoskin_final_user_acceptance_fix.sql` — orders/order_items/payments/coupons/coupon_redemptions.
- `supabase/migrations/20260511_phase2_invoice_returns_refunds.sql` — refund_records, return_requests.
- `supabase/migrations/20260702_customer_returns_account_pdp_polish.sql` — return_request_items.
- `supabase/migrations/20260627_customer_experience_production_patch.sql` — invoice_records.
```
