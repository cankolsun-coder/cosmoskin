# COSMOSKIN — D2B: Item-level Coupon & Discount Proration for Refunds — REPORT

**Date:** 2026-07-06  
**Status:** Implemented locally. Not deployed. No migration created. No SQL run. Not committed.  
**Builds on:** D2A (`9d0f481` — product/shipping separation), D1 (`428f584` — provider_reference, idempotency)

---

## 0. Summary

D2B makes refund amount validation reflect the **actual product amount paid** after order-level coupon/discount proration across returned line items.

- `return_request_items.refundable_amount` is **pre-discount** and is **not** used as the final cap.
- Proration reconstructs paid item value from `order_items.line_total` + order-level discount.
- D2A shipping rules are unchanged (shipping excluded by default; included only per responsibility).
- Free-shipping threshold clawback is **intentionally not implemented** (deferred to D3/D4).

---

## 1. Exact files changed

| File | Change |
|------|--------|
| `functions/api/admin/refunds.js` | D2B proration helpers, balance context, validation, POST metadata |
| `assets/admin-orders.js` | Client-side proration mirror, refund balance UI with required copy |
| `scripts/validate-d2b-refund-discount-proration.mjs` | **Created** — D2B invariants + chains prior validators |
| `tests/local-integration.test.mjs` | 9 D2B integration tests + seed helpers |
| `scripts/validate-a1-admin-endpoint-coverage.mjs` | High-caution markers for D2B exports |
| `scripts/validate-*.mjs` (12 files) | Chain guard `COSMOSKIN_SKIP_VALIDATOR_CHAIN` + `stdio: inherit` fix (infra only) |

See `COSMOSKIN_D2B_REFUND_DISCOUNT_PRORATION_CHANGED_FILES_20260706.txt`.

**No `supabase/migrations/*.sql` created or modified.**

---

## 2. Discount source choice

**Preferred:** `orders.discount_amount` when present and ≥ 0.

**Fallback:** `coupon_redemptions.discount_amount` for first redemption with `status = 'used'` or `'reserved'`.

**Otherwise:** 0 (no proration discount applied).

**Rationale:** `orders.discount_amount` is the canonical checkout-persisted order total; `coupon_redemptions` is a safe reconstruction fallback for legacy rows where order discount was not stored. Checkout calculation and coupon redemption behavior were **not** modified.

---

## 3. Item proration formula

For each `order_items` row with `line_total > 0`:

```
line_subtotal        = order_items.line_total
allocated_discount   = order_discount × (line_subtotal / product_subtotal)
                       — last eligible line absorbs rounding remainder
line_paid_total      = line_subtotal − allocated_discount
refundable_unit_paid = line_paid_total / quantity
returned_item_cap    = refundable_unit_paid × returned_quantity
```

For selected return lines (`return_request_items` or embedded `requested_items`):

```
item_prorated_refundable_cap = Σ returned_item_cap
effective_refund_cap         = min(
  item_prorated_refundable_cap + allowed_shipping_refund,
  D2A remaining_refundable
)
```

Allocation logic mirrors `buildIyzicoBasketItems()` in checkout (proportional by line subtotal; last line absorbs remainder).

**Example:** subtotal 1000, discount 100, lines A=600 / B=400 → paid A=540, B=360. Return A only → cap **540**, not 600.

---

## 4. Rounding strategy

- All amounts rounded to **2 decimal** currency precision via `roundMoney()`.
- Proportional discount per line: `round(discount × line_subtotal / product_subtotal)` for all lines except the last.
- **Last eligible line** receives `order_discount − sum(previous allocations)` so total allocated discount **equals** order discount exactly.
- Per-return unit values derived from allocated line totals divided by purchased quantity.
- Total item refundable cap clamped to D2A `productRefundableCap`.

---

## 5. Partial refund behavior

- Refund capped at **prorated paid value** of returned items only.
- Shipping **excluded** unless D2A responsibility allows (`seller_fault`, `carrier_damage`, `full_order_refund`, or `manual_review` + explicit approval).
- Discount not paid on returned lines is **not** refunded.
- Multiple partial refunds: `completed` + `pending` refunds reserve balance; cumulative total cannot exceed prorated product cap + allowed shipping.
- Exceeding prorated item cap while within order remaining → `ERR_AMOUNT_EXCEEDS_PAID_ITEM`.

---

## 6. Full-order refund behavior

When all order lines are returned:

- Product refund cap = **paid product subtotal** after discount (`Σ line_paid_total`).
- Shipping handled **only** by D2A responsibility rules (not auto-included).
- Total refund cannot exceed order paid total.
- `completed` + `pending` refunds still reserve balance.

---

## 7. Shipping / free-shipping decision

| Topic | D2B decision |
|-------|--------------|
| Shipping in product proration | **Never** — discount allocated only across product lines |
| D2A shipping inclusion rules | **Unchanged** |
| Free-shipping threshold clawback | **Not implemented** — partial return that drops retained order below free-shipping threshold does **not** claw back shipping |
| Future policy | D3/D4 if business requires threshold recalculation |

---

## 8. Fail-safe behavior (old / inconsistent orders)

| Condition | Behavior |
|-----------|----------|
| No `return_request_id` / no return items | D2A order-level cap only (no item binding) |
| `Σ order_items.line_total` ≠ `orders.subtotal_amount` (> 0.01) | Fallback to D2A caps only (`fallback: true`, no item binding) |
| Return item cannot match `order_item_id` / slug | Block: `İade tutarı güvenli şekilde hesaplanamadı. Lütfen sipariş kalemlerini kontrol edin.` |
| Invalid / missing quantity | Same block (`ERR_PRORATION_UNSAFE`) |
| `return_request_items.refundable_amount` | **Never** used as final cap |

---

## 9. Admin UI (minimal)

Refund tab shows when a return is selected:

- Original item subtotal
- Allocated discount
- Paid item value
- Max refundable product amount
- Shipping excluded/included state (D2A)
- Remaining refundable amount

Required copy present:

- “İndirim tutarı iade edilecek ürünlere oransal olarak dağıtılır.”
- “İade tutarı müşterinin ürün için fiilen ödediği tutarı aşamaz.”
- “Kargo bedeli standart ürün iadesine dahil edilmez.”

---

## 10. D1 / D2A preservation proofs

| Rule | Status |
|------|--------|
| `completed` requires `provider_reference` | **Unchanged** |
| Idempotent second `completed` for same `return_request_id` | **Unchanged** |
| RBAC `refunds:update` | **Unchanged** |
| D2A `resolveShippingRefundableCap` / responsibility categories | **Unchanged** |
| `failed` / `cancelled` refunds do not reserve balance | **Unchanged** |
| Admin auth / RBAC / JWT / session files | **Not touched** |
| B1/B2 bank transfer, email, payment callback, coupons, loyalty | **Not touched** |

---

## 11. Test results

```bash
node --check functions/api/admin/refunds.js          # pass
node --check assets/admin-orders.js                  # pass
node scripts/validate-d2b-refund-discount-proration.mjs  # pass
node scripts/validate-d2-refund-amount-correctness.mjs   # pass
node scripts/validate-d1-returns-refunds-correctness.mjs # pass
# … all chained validators (B2E, B2, B1, A1F, A1, H2, H1, H0, Batch 1/3/4, UI, production) — pass
node --test tests/local-integration.test.mjs       # 114/114 pass
```

**D2B integration tests added:**

1. Percentage/fixed coupon prorates across returned items (600 blocked, 540 ok)
2. Full-order return refunds paid product subtotal 900; shipping blocked on `customer_preference`
3. Multiple partial refunds cannot exceed prorated product amount
4. Rounding remainder within paid product subtotal (3×100 − 10 discount)
5. `seller_fault` shipping inclusion with proration (540 + 89)
6. Free shipping not clawed back on partial return
7. Inconsistent subtotal falls back to D2A cap safely
8. Unsafe return item match blocks with `ERR_PRORATION_UNSAFE`
9. D1/D2A/A1/B1/B2 protections remain (existing suite)

---

## 12. Rollback

See `COSMOSKIN_D2B_REFUND_DISCOUNT_PRORATION_ROLLBACK_PLAN_20260706.md`.

Revert restores D2A-only caps (pre-discount item amounts may be accepted again). No DB rollback required.

---

## 13. Proof: no migration

```bash
git status --porcelain -- supabase/migrations   # empty
```

D2B is JS-only; proration computed at refund validation time from existing `orders`, `order_items`, `return_request_items`, `coupon_redemptions` data.
