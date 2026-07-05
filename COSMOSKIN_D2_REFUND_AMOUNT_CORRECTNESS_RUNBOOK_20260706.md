# COSMOSKIN — D2A: Refund Amount Correctness — RUNBOOK

**Date:** 2026-07-06  
**Scope:** JS-only product/shipping refund validation. No migration.

---

## 1. Pre-deploy verification

```bash
node --check functions/api/admin/refunds.js
node --check assets/admin-orders.js
node scripts/validate-d2-refund-amount-correctness.mjs
node --test tests/local-integration.test.mjs
```

All must pass.

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

Example order: product 839 TRY + shipping 60 TRY = total 899 TRY.

| Scenario | Responsibility | Expected max | Expected result |
|----------|----------------|--------------|-----------------|
| Standard return | `customer_preference` | 839 | Refund 839 OK; 899 rejected |
| Seller fault | `seller_fault` | 899 | Refund 899 OK |
| Carrier damage | `carrier_damage` | 899 | Refund 899 OK |
| Manual + shipping reason | `manual_review` + checkbox + reason | 899 | Refund 899 OK |
| Manual without reason | `manual_review` + checkbox only | — | 400 shipping approval required |
| Prior completed 400 | `customer_preference` | 439 remaining | Refund 500 rejected |
| Prior pending 200 | `customer_preference` | reserves balance | Over remaining rejected |
| Amount 0 / negative | any | — | 400 invalid amount |
| Unpaid order | any | — | 400 payment not received |
| Repeat complete same return | any | — | 200 idempotent (D1) |
| Complete without reference | any | — | 400 (D1) |

Admin UI: İade/Refund tab shows product cap, shipping amount, inclusion state, and remaining product-refundable label.

---

## 4. Monitoring

- 400 rate on `POST /api/admin/refunds` with amount/responsibility errors.
- Watch for false `ERR_PRODUCT_CAP_UNKNOWN` on orders missing shipping breakdown.

---

## 5. Future hardening (D2B / D3)

- Item-level coupon/discount proration
- Supabase RPC with row lock for concurrent admin race

---

## 6. Files deployed

See `COSMOSKIN_D2_REFUND_AMOUNT_CORRECTNESS_CHANGED_FILES_20260706.txt`.
