# COSMOSKIN — D3A: Refund Snapshot Persistence for New Orders — REPORT

**Date:** 2026-07-06  
**Status:** Implemented locally. Migration file created. **No SQL run.** Not deployed. Not committed.  
**Builds on:** D2B (`4e5d15a`), D2A (`9d0f481`), D1 (`428f584`)

---

## 0. Summary

D3A persists immutable per-line paid values on `order_items` at checkout so refund caps no longer depend solely on runtime reconstruction. Legacy orders without snapshots continue through D2B reconstruction + D2A fail-safes.

**No historical backfill** was performed or scripted in this batch.

---

## 1. Migration file created

**File:** `supabase/migrations/20260706_d3a_order_item_pricing_snapshot.sql`

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `allocated_order_discount` | `numeric(12,2)` | Yes | Order coupon share for this line |
| `paid_line_total` | `numeric(12,2)` | Yes | `line_total − allocated_order_discount` |
| `paid_unit_price` | `numeric(12,2)` | Yes | `paid_line_total / quantity` |
| `pricing_snapshot_version` | `text` | Yes | Algorithm id (`v1_proportional_last_line_remainder`) |

- No `UPDATE` / backfill statements
- No column removals or destructive changes
- No constraints that break legacy rows

**Proof no SQL was run:** migration file only; no `supabase db push` / remote apply in this batch.

---

## 2. Checkout persistence behavior

**File:** `functions/api/create-checkout.js`  
**Helper:** `functions/api/_lib/order-pricing-snapshot.js` → `buildOrderItemPricingSnapshots()`

At order creation (before `insertRows('order_items', …)`):

1. `buildOrderItemPricingSnapshots(cart, totals.discount)` allocates discount proportionally by `line_total / subtotal`
2. Last line absorbs rounding remainder
3. Writes `allocated_order_discount`, `paid_line_total`, `paid_unit_price`, `pricing_snapshot_version`
4. `buildIyzicoBasketItems()` now uses `paid_line_total` from the same helper (single source of truth)

**Checkout totals unchanged:** `calculateTotalsWithCoupon()` untouched; only persistence + Iyzico basket source unified.

**Coupon redemption behavior unchanged:** `recordCouponUsage()` not modified.

---

## 3. Refund snapshot preference behavior

**File:** `functions/api/admin/refunds.js`

When **all** `order_items` with `line_total > 0` pass `isValidPricingSnapshot()`:

- `resolveItemProratedRefundableCapFromSnapshots()` uses stored `paid_unit_price × returned_qty`
- `discountSource = 'order_items.pricing_snapshot'`
- `snapshotBacked = true`
- No `coupon_redemptions` load required for proration

Validation on snapshots:

- `paid_line_total ≤ line_total`
- `allocated_order_discount ≥ 0`
- `paid_unit_price > 0` when `quantity > 0`
- Σ `paid_line_total` must not exceed paid product subtotal

`return_request_items.refundable_amount` is **still not** used as final cap.

---

## 4. Legacy fallback behavior

| Condition | Path |
|-----------|------|
| Snapshot columns null / missing (pre-D3A orders) | D2B `allocateOrderDiscount` reconstruction |
| Partial or invalid snapshots on an order | D2B reconstruction |
| Subtotal mismatch | D2A order-level fallback |
| Unmatched return items | `ERR_PRORATION_UNSAFE` |

D2A shipping rules, D1 `provider_reference`, idempotency, and balance reservation **unchanged**.

---

## 5. Admin UI (minimal)

**File:** `assets/admin-orders.js`

When snapshot-backed proration is active, refund balance summary shows:

- **Fiyat anlık görüntüsü:** `v1_proportional_last_line_remainder (kayıtlı ödeme tutarı)`
- Legacy reconstruction label: **Hesaplama kaynağı: Sipariş oluşturma anı yeniden hesaplandı**

Existing D2B proration fields (original subtotal, allocated discount, paid item value) preserved.

---

## 6. Proof: no historical backfill

- Migration contains only `ADD COLUMN IF NOT EXISTS` + comments
- No backfill script created
- No `UPDATE order_items` in migration or application code
- D3B explicitly deferred

---

## 7. Proof: D2A/D2B did not regress

| Check | Result |
|-------|--------|
| `validate-d2b-refund-discount-proration.mjs` | Pass |
| `validate-d2-refund-amount-correctness.mjs` | Pass |
| `validate-d1-returns-refunds-correctness.mjs` | Pass |
| D2B integration tests (legacy seeds without snapshots) | Pass |
| D3A integration tests (snapshot + legacy + invalid fallback) | Pass |
| `seller_fault` shipping with snapshots | Pass |

---

## 8. Test results

```bash
node --check functions/api/admin/refunds.js          # pass
node --check functions/api/create-checkout.js        # pass
node scripts/validate-d3-refund-snapshot-persistence.mjs  # pass (+ full chain)
node --test tests/local-integration.test.mjs       # 119/119 pass
```

**New D3A tests:**

1. `buildOrderItemPricingSnapshots` stores allocated discount and paid totals
2. Refund prefers stored snapshot (`snapshot_backed`, `order_items.pricing_snapshot`)
3. Legacy order without snapshot → D2B reconstruction
4. Invalid snapshot row → D2B fallback
5. `seller_fault` shipping + snapshots

---

## 9. Deployment order

1. **Apply migration** on Supabase: `supabase/migrations/20260706_d3a_order_item_pricing_snapshot.sql`
2. **Deploy Cloudflare Pages** with updated `create-checkout.js`, `refunds.js`, `admin-orders.js`, `_lib/order-pricing-snapshot.js`
3. **Smoke test:** place discounted multi-line order → verify `order_items` snapshot columns populated → partial refund uses snapshot cap
4. **Verify legacy:** refund on pre-D3A order still works via D2B reconstruction

---

## 10. Rollback

See `COSMOSKIN_D3A_REFUND_SNAPSHOT_PERSISTENCE_ROLLBACK_PLAN_20260706.md`.

---

## 11. Files changed

See `COSMOSKIN_D3A_REFUND_SNAPSHOT_PERSISTENCE_CHANGED_FILES_20260706.txt`.
