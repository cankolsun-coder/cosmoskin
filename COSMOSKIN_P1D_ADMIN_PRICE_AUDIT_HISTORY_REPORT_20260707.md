# COSMOSKIN P1D Admin Price Audit History Report

Date: 2026-07-07

## Summary

P1D adds **read-only** admin visibility for product price change history stored in `product_price_audit_logs`. This provides operational auditability without changing checkout/coupon/refund/inventory behavior.

## Audit table inspection (P1C migration)

Source: `supabase/migrations/20260707_p1c_admin_product_price_editing.sql`

`public.product_price_audit_logs` fields used by P1D:
- `product_slug`
- `old_regular_price_try`
- `new_regular_price_try`
- `old_currency`
- `new_currency`
- `changed_by_admin`
- `changed_at`
- `reason`
- `source`

Audit insertion path (P1C):
- `functions/api/_lib/product-pricing.js` `upsertAdminProductPriceOverride()` inserts into `product_price_audit_logs` and fails closed on audit failure.

## Admin API

Added endpoint:
- `GET /api/admin/products/:slug/price-history`

Behavior:
- Admin-auth required (`assertAdmin`)
- Permission required: `products:read`
- Returns newest first (`changed_at desc`)
- Supports safe limit (`limit`, default 20, max 60) and cursor (`before` timestamp)
- Read-only (no mutation routes)

Response fields:
- `product_slug`
- `items[]`: `{ product_slug, old_regular_price_try, new_regular_price_try, old_currency, new_currency, changed_by_admin, changed_at, reason, source }`

## Admin UI

Updated `admin/products.html` product table rendering (`assets/admin-products.js`) to include a read-only section:

Label: **Fiyat Geçmişi**

Behavior:
- Expands on demand via `<details>` to avoid heavy initial loads.
- Fetches history from `/api/admin/products/:slug/price-history?limit=20`.
- Shows:
  - date/time (Turkish formatting)
  - `changed_by_admin`
  - `₺old → ₺new`
  - `reason` (if present)
  - `source`
- Empty state:
  - “Bu ürün için henüz fiyat değişikliği yok.”
- No edit/delete actions for audit logs.

## Permissions & Security

- Unauthenticated: rejected (admin auth required)
- Admin without `products:read`: 403
- Admin with `products:read`: can view history
- `products:pricing:update` remains required only for price changes
- RBAC not weakened

## Checkout / coupons / refunds / inventory

No changes.

## Files changed

- `functions/api/admin/products/[slug]/price-history.js`
- `assets/admin-products.js`
- `scripts/validate-p1d-admin-price-audit-history.mjs`
- `tests/local-integration.test.mjs`
- `COSMOSKIN_P1D_ADMIN_PRICE_AUDIT_HISTORY_REPORT_20260707.md`
- `COSMOSKIN_P1D_ADMIN_PRICE_AUDIT_HISTORY_CHANGED_FILES_20260707.txt`
- `COSMOSKIN_P1D_ADMIN_PRICE_AUDIT_HISTORY_RUNBOOK_20260707.md`
- `COSMOSKIN_P1D_ADMIN_PRICE_AUDIT_HISTORY_ROLLBACK_PLAN_20260707.md`

## Proofs

- `products.json` unchanged
- no SQL run
- no migration created
- audit logs are read-only in admin UI/API

## Tests

Integration tests added/updated:
- history endpoint returns latest rows
- products:read gating
- unauth + non-products:read rejected
- unknown slug safe empty response
- admin UI contains read-only history + empty state markers

