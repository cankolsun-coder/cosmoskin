# COSMOSKIN — D2B: Refund Discount Proration — RUNBOOK

**Date:** 2026-07-06  
**Scope:** JS-only item-level discount proration for refund validation. No migration.

---

## 1. Pre-deploy verification

```bash
node --check functions/api/admin/refunds.js
node --check assets/admin-orders.js
node scripts/validate-d2b-refund-discount-proration.mjs
node --test tests/local-integration.test.mjs
```

All must pass. The D2B validator chains D2A, D1, and all prior guardrails.

Optional full API dev:

```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```

---

## 2. Deploy

1. Deploy Cloudflare Pages (`functions/api/admin/refunds.js`, `assets/admin-orders.js`).
2. No Supabase migration step.

---

## 3. Post-deploy smoke tests

Example discounted order: subtotal 1000, discount 100, shipping 89, total 989.  
Lines: A=600 (paid 540), B=400 (paid 360).

| Scenario | Return | Responsibility | Expected max product | Expected result |
|----------|--------|----------------|----------------------|-----------------|
| Partial return A | qty 1 of A | `customer_preference` | 540 | Refund 540 OK; 600 rejected |
| Partial return B | qty 1 of B | `customer_preference` | 360 | Refund 360 OK |
| Full product return | A+B | `customer_preference` | 900 | Refund 900 OK; shipping 89 rejected |
| Seller fault + shipping | A only | `seller_fault` | 540 + 89 | Refund 629 OK |
| Manual + shipping reason | A only | `manual_review` + checkbox + reason | 540 + 89 | Refund 629 OK |
| Manual without reason | A only | `manual_review` + checkbox only | — | 400 shipping approval required |
| Second partial after 540 | B | `customer_preference` | 360 remaining | Refund 400 rejected |
| Pre-discount amount | A | `customer_preference` | 540 | Refund 600 → exceeds paid item error |
| Inconsistent subtotal | legacy order | any | D2A cap only | No item binding; D2A cap applies |
| Unmatched return item | bad `order_item_id` | any | — | 400 proration unsafe error |
| Complete without reference | any | any | — | 400 (D1) |
| Repeat complete same return | any | any | — | 200 idempotent (D1) |

Admin UI: İade/Refund tab with return selected shows original subtotal, allocated discount, paid item value, max refundable product, shipping state, remaining amount, and required Turkish policy copy.

---

## 4. Monitoring

- 400 rate on `POST /api/admin/refunds` with `ERR_AMOUNT_EXCEEDS_PAID_ITEM` or `ERR_PRORATION_UNSAFE`.
- Watch for legitimate refunds blocked on orders with `subtotal_mismatch` fallback (review `order_items` vs `orders.subtotal_amount`).
- Confirm no admin reports shipping clawback on partial returns (not implemented by design).

---

## 5. Free shipping policy note

D2B does **not** recalculate free-shipping thresholds after partial return. If business policy requires clawback when retained order drops below threshold, that is a separate D3/D4 change.

---

## 6. Files deployed

See `COSMOSKIN_D2B_REFUND_DISCOUNT_PRORATION_CHANGED_FILES_20260706.txt`.
