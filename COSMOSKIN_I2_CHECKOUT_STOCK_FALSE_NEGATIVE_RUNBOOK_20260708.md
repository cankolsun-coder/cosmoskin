# COSMOSKIN I2 — Checkout Stock False Negative Runbook (2026-07-08)

## Verify fix locally

1. Static server (UI only):
   ```bash
   python3 -m http.server 7700 --directory .
   ```
2. Full API (stock check + checkout):
   ```bash
   npx wrangler pages dev . --compatibility-date=2024-06-01
   ```

## Manual QA — COSRX Snail essence

Product: **COSRX Advanced Snail 96 Mucin Power Essence 100ml**  
Slug: `cosrx-advanced-snail-96-mucin-essence`

1. Add qty 1 to cart from PDP.
2. Open `/checkout.html` directly (fresh navigation).
3. Expect: delivery step visible; order summary shows price/KDV; **no** “Stok doğrulaması gerekli” if inventory has `available_stock >= 1` and `status = active`.
4. Repeat with qty 2 only if `available_stock >= 2`.

## Manual QA — true block cases

| Inventory | Qty | Expected |
|---|---|---|
| `on_hand 5, reserved 5` | 1 | Block with out-of-stock message |
| `on_hand 5, reserved 4` | 2 | Block: “Sepette: 2, mevcut: 1.” |
| `status inactive` | 1 | Block: satışta değil |

## Supabase SQL Editor (production/test)

Run diagnostics from I2 plan sections 2.1–2.4 before blaming code.

## Validators

```bash
node scripts/validate-i2-checkout-stock-false-negative.mjs
node scripts/validate-i1-inventory-checkout-blocking.mjs
node --test tests/local-integration.test.mjs
```

## Deploy note

Do **not** deploy until QA + full validator chain pass in target environment. This runbook documents verification only.
