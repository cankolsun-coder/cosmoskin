# COSMOSKIN — D3A: Refund Snapshot Persistence — RUNBOOK

**Date:** 2026-07-06  
**Scope:** Nullable `order_items` snapshot columns + checkout persistence + refund preference. No backfill.

---

## 1. Pre-deploy verification (local)

```bash
node --check functions/api/admin/refunds.js
node --check functions/api/create-checkout.js
node --check functions/api/_lib/order-pricing-snapshot.js
node scripts/validate-d3-refund-snapshot-persistence.mjs
node --test tests/local-integration.test.mjs
```

All must pass.

---

## 2. Deploy

### Step 1 — Database

Apply migration (production Supabase):

```
supabase/migrations/20260706_d3a_order_item_pricing_snapshot.sql
```

Columns are nullable; safe on live DB with existing orders.

**Do not run backfill** in D3A.

### Step 2 — Application

Deploy Cloudflare Pages:

- `functions/api/_lib/order-pricing-snapshot.js` (new)
- `functions/api/create-checkout.js`
- `functions/api/admin/refunds.js`
- `assets/admin-orders.js`

---

## 3. Post-deploy smoke tests

### New order (post-D3A deploy)

1. Place order with coupon on 2+ line items.
2. Confirm `order_items` rows have:
   - `pricing_snapshot_version = v1_proportional_last_line_remainder`
   - `paid_line_total = line_total − allocated_order_discount`
   - Σ `allocated_order_discount` = `orders.discount_amount`
3. Create partial return → admin refund tab shows **kayıtlı ödeme tutarı**
4. Refund amount at prorated `paid_unit_price × qty` succeeds; pre-discount line amount blocked

### Legacy order (pre-D3A)

1. Open paid order without snapshot columns.
2. Partial refund still works via D2B reconstruction.
3. Admin UI shows **yeniden hesaplandı** source label.

### D2A shipping

| Scenario | Expected |
|----------|----------|
| `customer_preference` + snapshot order | Product cap from snapshot; shipping excluded |
| `seller_fault` + snapshot order | Product + shipping allowed |

---

## 4. Monitoring

- New orders missing `pricing_snapshot_version` after deploy → checkout regression
- Spike in `ERR_PRORATION_UNSAFE` on snapshot orders → data integrity issue
- Refund metadata `snapshot_backed: true` rate on new orders

---

## 5. Files deployed

See `COSMOSKIN_D3A_REFUND_SNAPSHOT_PERSISTENCE_CHANGED_FILES_20260706.txt`.
