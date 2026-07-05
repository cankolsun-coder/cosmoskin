# COSMOSKIN — D2A: Refund Amount Correctness (Product / Shipping Separation) — REPORT

**Date:** 2026-07-06  
**Status:** Implemented locally. Not deployed. No migration created. No SQL run. Not committed.  
**Scope amendment:** D2A supersedes the initial D2 order-level paid cap approach.  
**Builds on:** D1 (`428f584` — return eligibility, provider_reference, refund idempotency)

---

## 0. Summary

**D2A uses product/shipping separation.** Standard product return refunds exclude shipping by default. Shipping is **not** automatically refunded and must **not** be included via `orders.total_amount` alone.

**Shipping can be included only when:**

- `refund_responsibility = seller_fault`
- `refund_responsibility = carrier_damage`
- Full-order refund policy allows it (`full_order_refund = true`)
- Explicit admin-approved shipping refund under `manual_review` with `include_shipping_refund` + `shipping_refund_reason`

**Item-level coupon/discount proration is deferred to D2B/D3.**

D1 `provider_reference` and idempotent completion rules are preserved.

---

## 1. Exact files changed

| File | Change |
|------|--------|
| `functions/api/admin/refunds.js` | D2A caps: `resolveProductRefundableCap`, `resolveShippingRefundableCap`, `buildRefundCaps`, `loadRefundBalanceContext`; responsibility-aware POST validation |
| `assets/admin-orders.js` | Product/shipping balance UI, responsibility selector, manual shipping approval fields, required Turkish copy |
| `scripts/validate-d2-refund-amount-correctness.mjs` | D2A invariants + chains D1 and all prior validators |
| `tests/local-integration.test.mjs` | 13 D2A integration tests; `seedReturnOrder` includes shipping breakdown |
| `scripts/validate-a1-admin-endpoint-coverage.mjs` | High-caution markers for product/shipping cap helpers |

No `supabase/migrations/*.sql` created or modified.

---

## 2. Product refundable cap source

**Preferred:** `orders.total_amount - orders.shipping_amount` when both are present and consistent.

**Fallback 1:** `orders.subtotal_amount - orders.discount_amount`

**Fallback 2:** Sum of `order_items.line_total`, capped at `total_amount - shipping_amount` when shipping is known.

**Fail-safe:** If product cap cannot be determined safely → 400 `Ürün iade tavanı güvenli biçimde hesaplanamadı.`

**Not used as product cap:** `orders.total_amount` alone, `payments.amount` alone.

**Schema fields investigated:**

| Field | Present | Used for D2A |
|-------|---------|--------------|
| `orders.subtotal_amount` | Yes | Fallback product cap |
| `orders.shipping_amount` | Yes | Exclusion + shipping cap |
| `orders.discount_amount` | Yes | Fallback adjustment |
| `orders.total_amount` | Yes | Only with shipping subtracted |
| `orders.items_total` | No | — |
| `orders.products_total` | No | — |
| `orders.delivery_fee` / `cargo_fee` | No | — |
| `payments.amount` | Yes | Payment gate cross-check only |
| `order_items.line_total` | Yes | Fallback / cap |

---

## 3. Shipping refundable cap

```
shipping_refundable_cap = 0   (default)

> 0 only when:
  - seller_fault
  - carrier_damage
  - full_order_refund (policy)
  - manual_review + include_shipping_refund + shipping_refund_reason
```

If shipping amount is unknown or zero, shipping cap remains 0.

---

## 4. Remaining refundable calculation

```
product_refundable_cap = product amount eligible (excludes shipping)
shipping_refundable_cap = per rules above
max_refundable = product_refundable_cap + shipping_refundable_cap
completed_refund_total = SUM(amount WHERE status = 'completed')
pending_refund_total = SUM(amount WHERE status = 'pending')
remaining_refundable = max_refundable - completed - pending (floor 0)
```

Validation on every POST:

- `amount > 0` → else `İade tutarı geçerli bir tutar olmalıdır.`
- `amount <= remaining_refundable` → else `İade tutarı kalan iade edilebilir tutarı aşamaz.`

---

## 5. Refund responsibility categories

| Category | Shipping default | Example reasons |
|----------|------------------|-----------------|
| `customer_preference` | Excluded | changed_mind, not_suitable |
| `seller_fault` | Included | wrong_item_sent, damaged_item |
| `carrier_damage` | Included | — |
| `manual_review` | Excluded unless admin approves | Diğer + explicit shipping reason |

---

## 6. D1 preservation

| Rule | Status |
|------|--------|
| `completed` requires `provider_reference` | **Unchanged** |
| Idempotent second `completed` for same `return_request_id` | **Unchanged** |
| RBAC `refunds:update` | **Unchanged** |

---

## 7. Admin UI

Required copy shown:

- “Kargo bedeli standart ürün iadesine dahil edilmez.”
- “Satıcı kaynaklı hata durumunda kargo bedeli iade kapsamına alınabilir.”
- “Kalan iade edilebilir ürün tutarı”
- “İade tutarı kalan iade edilebilir tutarı aşamaz.”

UI displays: product refundable, shipping amount, shipping included/excluded state, completed/pending totals, remaining refundable. Responsibility selector drives shipping inclusion client-side (mirrors server).

---

## 8. Deferred (D2B / D3)

- Item-level coupon/discount proration for suggested refund amounts
- `refund_items` table
- Payment provider refund automation
- DB CHECK / RPC for concurrent admin race on balance

---

## 9. Rollback

See `COSMOSKIN_D2_REFUND_AMOUNT_CORRECTNESS_ROLLBACK_PLAN_20260706.md`.
