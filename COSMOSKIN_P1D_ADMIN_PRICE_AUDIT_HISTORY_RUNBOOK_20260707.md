# COSMOSKIN P1D Admin Price Audit History — Runbook

Date: 2026-07-07

## Scope

Adds read-only visibility into `product_price_audit_logs` via admin API + UI.

No SQL. No migrations. No deploy from Cursor.

## Validate

```bash
node scripts/validate-p1d-admin-price-audit-history.mjs
node scripts/validate-p1c4-live-pdp-effective-price-runtime.mjs
node scripts/validate-p1c3-effective-price-fallback-hardening.mjs
node scripts/validate-p1c-effective-price-commerce-integrity.mjs
node scripts/validate-p1c-admin-product-price-editing.mjs
node scripts/validate-p1b-admin-product-price-readonly.mjs
node scripts/validate-p1a-product-price-source-drift.mjs
node --test tests/local-integration.test.mjs
```

## Manual admin smoke test

1. Go to `admin/products.html`.
2. Load products.
3. Expand **Fiyat Geçmişi** for any product:
   - If history exists: verify newest-first rows, `₺old → ₺new`, admin email, time, reason, source.
   - If no history exists: verify “Bu ürün için henüz fiyat değişikliği yok.”
4. Confirm there are **no** edit/delete actions for history rows.

## API check

```bash
curl -sS -H \"x-admin-token: <token>\" \\
  \"https://www.cosmoskin.com.tr/api/admin/products/beauty-of-joseon-relief-sun-spf50/price-history?limit=20\"
```

Expected:
- 200 OK for admins with `products:read`
- `items[]` fields present
- sorted newest first

