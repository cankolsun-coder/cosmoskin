## COSMOSKIN — P1E2 Admin Sale Price Editing Report (2026-07-09)

### Scope
Admin-side sale/compare-at editing + audit/history. No storefront sale UI (P1E3). No SQL run. No deploy.

---

## Admin API behavior
Extended `PATCH /api/admin/products/:slug/price` to accept:
- `regular_price_try`, `sale_price_try`, `compare_at_price_try`, `sale_starts_at`, `sale_ends_at`, `reason`
- Empty strings normalize to `null` for nullable sale fields.
- Permission: `products:pricing:update`
- Inventory route still rejects all price/sale fields.

---

## Validation rules (server)
- Regular price: positive integer TRY (P1C rules)
- Sale price: optional/nullable; if set must be `< regular_price_try`
- Compare-at: optional/nullable; if set must be `> sale_price_try` (or `> regular` when no sale)
- Sale window: `sale_ends_at > sale_starts_at` when both set
- Unknown slug → 404
- Missing sale DB columns + sale field submission → `409 P1E_MIGRATION_REQUIRED`

---

## Migration-not-run fallback
- Admin read/list: sale columns missing → legacy override select (P1E1)
- Regular-only price update: still works without sale columns
- Sale field update without migration: structured `P1E_MIGRATION_REQUIRED` (not generic 500)
- Price history: extended select with legacy fallback; legacy rows still render

---

## Persistence
- Upsert `product_price_overrides` by `product_slug`
- Nullable sale fields; clearing sends `null`
- No `products.json` mutation; no orders/refunds/coupons/inventory touched

---

## Audit / history
- Audit writes old/new sale + compare-at + window fields when columns exist
- Sale audit missing + sale changed → `P1E_MIGRATION_REQUIRED`
- Regular-only audit falls back to P1C legacy insert
- History endpoint adds `changed_fields` + `event_label` (e.g. “İndirimli fiyat güncellendi”, “İndirim kaldırıldı”)

---

## Admin UI
`assets/admin-products.js` + `admin/products.html`:
- Normal / İndirimli / Üstü çizili / başlangıç / bitiş / reason fields
- Inline validation + server error display
- Save loading state; list + history refresh after save
- Compare-at marked display-only
- Status labels: Katalog, Admin fiyat, İndirim aktif/planlandı/süresi doldu

---

## Checkout/storefront safety
- No storefront crossed-out UI added
- Resolver still sets payable `effective_price_try` (sale when active)
- Checkout/coupons use `product.price` from priced catalog; compare-at never used

---

## Proof
- `products.json` unchanged
- No SQL run
- No deploy
- P1E3 not started

---

## Tests
**207/207** integration tests pass (`node --test tests/local-integration.test.mjs`).
