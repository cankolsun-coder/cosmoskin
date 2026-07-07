# COSMOSKIN P1 — Admin Product Pricing Management Audit (PLAN ONLY)

**Date:** 2026-07-07
**Type:** Plan / audit only — no files modified, no SQL, no migration, no deploy.
**Main question:** Can admin change product prices safely without breaking checkout, coupons, refunds, invoices, or historical orders?

---

## Pre-check result

```
git status --short   → only  ?? .wrangler/   (ignored)
git log --oneline -12 → R1F committed (54996df), R1G committed (45aa41e "updated")
```

- R1F committed: `54996df R1F fix review image level approval`
- R1G committed: `45aa41e updated` (contains migration `20260707_r1g_review_moderation_updated_at_fix.sql`, validator, docs, tests — verified via `git show --stat`)
- Working tree clean except `.wrangler/`. **Pre-check passes. Proceeding with plan.**

---

## Headline answer

**SECTION 2 verdict: C) Admin cannot currently change product price** (with a strong element of **D — price source is static/split across generated copies**).

- Live retail price is **static**: `products.json` → `assets/products-data.js` (browser) + `functions/api/_lib/products-data.js` (server) → `functions/api/_lib/catalog.js`.
- Admin product/inventory APIs manage **only** `product_inventory` (stock/SKU/status). **No price write path, no price field in admin UI, no pricing permission, no price audit log.**
- Changing a price today requires editing `products.json`, regenerating the two generated caches, updating pre-rendered PDP/PLP HTML, and deploying.
- **Good news for safety:** checkout, coupons, and refunds are already tamper-resistant and snapshot-based, so introducing admin pricing is *feasible* without breaking history — provided the plan below is followed.

---

## Files inspected

**Price sources / catalog**
- `products.json` (root, canonical)
- `assets/products-data.js` (generated browser cache; `window.COSMOSKIN_PRODUCTS`)
- `functions/api/_lib/products-data.js` (generated server cache)
- `functions/api/_lib/catalog.js` (`getCatalogProductByHandle/ByName`, `resolveCatalogProduct`, `price: Number(product.price || 0)`)

**Storefront**
- `assets/app.js` (cart API, `cosmoskin_cart`, add-to-cart, catalog re-sync)
- `assets/checkout-flow.js` (checkout UI totals + API payload)
- `assets/commerce.js` (legacy checkout submit)
- `assets/collection-renderer.js`, `assets/allproducts.js`, `assets/bestsellers.js`, `assets/pdp-professional.js`, `assets/mobile-redesign.js`
- Pre-rendered `products/*.html`, `collections/*.html` (baked `₺` + `data-price`)

**Checkout / orders / snapshots**
- `functions/api/create-checkout.js`
- `functions/api/_lib/order-pricing-snapshot.js` (D3A `buildOrderItemPricingSnapshots`, versions v1/v2)
- `functions/api/iyzico-callback.js` (amount verification)
- `functions/api/coupons/validate.js` (`buildTrustedCartLines`)

**Admin / permissions / audit**
- `functions/api/admin/products.js`
- `assets/admin-products.js`, `admin/products.html`, `assets/admin-inventory.js`
- `functions/api/_lib/admin-audit.js` (`hasAdminPermission`, `requireAdminPermission`, `recordAdminActivity`, `admin_activity_logs`)
- `functions/api/_lib/admin.js` (auth/session)
- `functions/api/_lib/inventory.js` (`validateCartStock`, `stockBlockReason`, `inventory_movements`)

**Refunds / returns**
- `functions/api/admin/refunds.js` (reads `paid_line_total`, `paid_unit_price`, `pricing_snapshot_version`)
- `functions/api/admin/returns.js`, `functions/api/returns.js`

**Schema**
- `supabase/schema.sql` (`products.price_try` — unused at runtime; `order_items.unit_price/line_total`)
- `supabase/migrations/20260706_d3a_order_item_pricing_snapshot.sql` (paid snapshot columns)
- `supabase/migrations/20260629_cosmoskin_checkout_bank_transfer_final_fix.sql`, `20260510_operations_inventory_orders_shipments.sql` (`product_inventory`, no price)
- `supabase/migrations/20260626_production_launch_readiness.sql` (RBAC roles/permissions seed)

**Reference reports read/available:** D3A refund snapshot persistence, R1F/R1G reports, project memory, admin auth RBAC guardrails.

---

## SECTION 1 — Trusted product price source

1. **Where does live price come from?** `products.json` field `price` (integer TRY, VAT-inclusive).
2. **DB or static?** **Static file.** Supabase `products.price_try` exists in schema/seed but is **never read at runtime**.
3. **Multiple conflicting sources?** Yes — 4 physical copies that can drift:
   - `products.json` (canonical)
   - `assets/products-data.js` (browser cache; embedded fallback dated older than JSON)
   - `functions/api/_lib/products-data.js` (server cache)
   - pre-rendered `products/*.html` + `collections/*.html` (baked `₺` and `data-price`)
   - plus dead `products.price_try` in Supabase.
4. **PDP price:** static HTML `.pdp5-price` / `data-price` at first paint; `assets/pdp-professional.js` / `app.js` re-sync from catalog (`products.json`) when JS runs.
5. **PLP price:** `window.COSMOSKIN_PRODUCTS` (← `products.json`) via `collection-renderer.js` / `allproducts.js`; static cards until JS loads.
6. **Cart price:** `cosmoskin_cart` localStorage; set from `data-price`/catalog at add time (`app.js`).
7. **Checkout price:** **server catalog only** — `create-checkout.js` re-resolves `product.price` via `catalog.js`; client price ignored.
8. **Admin price:** read-only display from static catalog in the GET merge; not editable.

---

## SECTION 2 — Admin product pricing capability

**Verdict: C (cannot change price), with D (static/split source).**

- `functions/api/admin/products.js`: GET (`products:read`) merges catalog + inventory; PATCH/POST (`inventory:adjust`) write `product_inventory` only. **No price accepted or written.**
- Admin UI (`admin/products.html` + `admin-products.js` + `admin-inventory.js`): columns are Ürün, Marka, Stok, Durum, SKU. **No price column, no price input.**
- No `products:pricing` / `pricing:update` permission exists.
- No price audit logging.

---

## SECTION 3 — Price fields audit

| Field | Exists? | Where | Admin editable? | Storefront uses? | Checkout uses? |
|-------|---------|-------|-----------------|------------------|----------------|
| `regular_price` | **Missing** (only generic `price`) | — | No | No | No |
| `sale_price` | **Missing** (dead fallback refs in `checkout-flow.js`, never populated) | — | No | No | No |
| `compare_at_price` | **Missing** (dead fallback refs in `mobile-redesign.js`) | — | No | No | No |
| `currency` | **Missing** (implicit TRY; TRY hardcoded in formatters & order default) | order default `'TRY'` | No | Display only | Hardcoded TRY |
| `cost_price` | **Missing** | — | No | No | No |
| VAT/KDV included flag | **Missing** (global `VAT_RATE=0.20`, "KDV dahil" text) | `create-checkout.js` const | No | Text only | Global rate |
| `sale_start_at` | **Missing** | — | No | No | No |
| `sale_end_at` | **Missing** | — | No | No | No |
| `price_status` | **Missing** (inventory `status` ≠ price) | — | No | No | No |
| `price_updated_at` | **Missing** (generic `products.updated_at` in unused table) | — | No | No | No |
| `price_updated_by` | **Missing** | — | No | No | No |
| `price_change_reason` | **Missing** | — | No | No | No |
| **effective retail** | `price` | products.json / catalog | No | Yes | **Yes (`order_items.unit_price`)** |

---

## SECTION 4 — Checkout trust audit

1. **Cart stores price locally?** Yes — `cosmoskin_cart[].price`.
2. **localStorage tamperable?** Yes, but **display-only**; server re-prices.
3. **Checkout reloads trusted price?** Yes — `normalizeCart()` → `findCatalogProduct()` → `product.price`.
4. **create-checkout trusts client price anywhere?** **No.** `payload.totals` is sent by the UI but never read; only slug + qty are used.
5. **Price changes while item in cart?** Charged amount always reflects **current server catalog**; UI totals may lag (display gap in `checkout-flow.js` / `mobile-redesign.js`).
6. **Iyzico basket uses trusted price?** Yes — built from D3A snapshots (`paid_line_total`); `price`/`paidPrice` use server `totals.total`; callback rejects mismatch (`PAYMENT_AMOUNT_MISMATCH`).
7. **order_items store paid snapshot?** Yes — `unit_price`, `line_total`, `allocated_order_discount`, `paid_line_total`, `paid_unit_price`, `pricing_snapshot_version`.

---

## SECTION 5 — Historical order protection

1. **Old orders immutable?** Yes — `order_items` rows persist the charged snapshot; catalog price is not joined back at read time.
2. **Paid prices stored separately from current product price?** Yes — snapshot columns are independent of `products.json`.
3. **Refunds use paid snapshot or current price?** **Paid snapshot** — `refunds.js` `loadOrderItems()` selects `paid_line_total`/`paid_unit_price`/`pricing_snapshot_version`; caps use `sum(paid_line_total)`; returns use `return_request_items.unit_price_snapshot`.
4. **Invoices use historical or current price?** Historical order totals (`orders.total_amount`, `vat_amount`); QNB e-invoice is a stub, but does not pull live catalog price.
5. **Could a price change break previous refunds?** **No** — refunds never read catalog price. (Only theoretical risk: legacy rows with NULL D3A snapshots fall back to D2B reconstruction from `unit_price`/`line_total`, which are also stored snapshots — still not live catalog.)

---

## SECTION 6 — Coupon impact

1. **Minimum subtotal uses trusted price?** Yes — `coupons/validate.js` `buildTrustedCartLines()` rebuilds from catalog; ignores client totals.
2. **Excluded products/categories use trusted line subtotal?** Yes — C1B eligible-line model uses server `categorySlug` + catalog price.
3. **Discount allocation affected by price changes?** At order time allocation uses current catalog price; once ordered, allocation is frozen in `allocated_order_discount` (D3A v2).
4. **Checkout uses current price at order time?** Yes.
5. **Refunds use paid coupon allocation snapshot?** Yes — `allocated_order_discount` + `paid_line_total` per line (D2B/D3A).

---

## SECTION 7 — Sale price / compare-at logic

1. **sale_price supported?** **No** (dead fallback references only).
2. **compare_at_price supported?** **No** (dead fallback references only).
3. **Sale date windows?** **No.**
4. **PDP sale display?** No — single `price`.
5. **PLP sale display?** No.
6. **Checkout charges correct sale price?** N/A — no sale concept; charges `price`.
7. **Refund snapshot stores sale price paid?** It stores whatever was charged (`paid_unit_price`), which today is just `price`. Snapshot mechanism is sale-ready once sale pricing exists.

---

## SECTION 8 — VAT / KDV audit

1. **Prices VAT-included?** Yes (KDV dahil).
2. **VAT rate stored?** Only as global `VAT_RATE = 0.20` in `create-checkout.js`; not per product.
3. **VAT shown on checkout/invoice?** Yes — "Dahil olan KDV" in checkout UI and order email from `orders.vat_amount`; QNB e-invoice line-item VAT mapping is stubbed.
4. **Would admin price edit need VAT awareness?** Minimal for now (rate is global and inclusive). If mixed VAT rates ever appear, a per-product `vat_rate` would be required. **Out of scope for P1.**
5. **Missing for production-grade Turkish model?** Per-product `vat_rate`, explicit `currency`, `price_incl_vat` flag, and e-invoice line VAT breakdown. Document only — do not implement in P1.

---

## SECTION 9 — Admin validation requirements (plan for future)

Reject save when:
- empty / non-numeric price → "Geçerli bir fiyat girin."
- price ≤ 0 (zero disallowed unless explicitly flagged) → "Fiyat sıfırdan büyük olmalıdır."
- negative price → "Fiyat sıfırdan büyük olmalıdır."
- `sale_price > regular_price` → "İndirimli fiyat normal fiyattan yüksek olamaz."
- `compare_at_price < active selling price` → "Karşılaştırma fiyatı satış fiyatından düşük olamaz."
- unsupported currency (only TRY today) → "Para birimi desteklenmiyor."
- invalid sale date range (`sale_start_at >= sale_end_at`) → "Satış tarihi aralığı geçerli değil."
- too many decimals (enforce integer or 2dp per money convention) → "Geçerli bir fiyat girin."
- no `products:pricing:update` permission → 403 "Bu işlem için admin yetkiniz bulunmuyor."

Validation must run **server-side** (Pages Function) as the source of truth; client-side mirroring is UX only.

---

## SECTION 10 — Admin permission & audit log

1. **Current permission protecting product editing?** `products:read` (GET); `inventory:adjust` (stock PATCH/POST). `products:update` exists but gates **compliance metadata only**.
2. **Price editing separately protected?** No — it does not exist.
3. **Should price have its own permission?** **Yes — `products:pricing:update`** (do not overload `inventory:adjust` or compliance `products:update`).
4. **Price changes logged today?** No.
5. **Old price in audit?** No.
6. **New price in audit?** No.
7. **changed_by stored?** No (only generic `created_by: 'admin'` on `inventory_movements`).
8. **Reason/note stored?** No for price.

Planned audit log fields (future `price_change_log` or `admin_activity_logs` metadata via `recordAdminActivity`):
`product_id`, `product_slug`, `old_regular_price`, `new_regular_price`, `old_sale_price`, `new_sale_price`, `old_compare_at_price`, `new_compare_at_price`, `changed_by_admin`, `changed_at`, `reason`, `source: 'admin'`.

---

## SECTION 11 — Inventory relationship

1. **Price stored with inventory?** No — `product_inventory` has no price column.
2. **Inventory admin accidentally change price?** No (no price field there).
3. **Price admin accidentally change stock?** Only if a future price endpoint shares the inventory write path — **plan keeps them separate**.
4. **Stock blocking still works if price changes?** Yes — `stockBlockReason()` uses status/stock/backorder, never price.
5. **Unavailable products still blocked?** Yes — I1 blocking is price-independent.

---

## SECTION 12 — Variant pricing

1. **Product variants?** **No variant model** — one slug = one price.
2. **Price per product or per variant?** Per product (per slug). `volume` is display metadata.
3. **Checkout selects variant price?** N/A.
4. **Admin need variant price editing?** No, current scope.
5. **Product-level overwriting variant price risk?** None (no variants).

---

## SECTION 13 — Recommended implementation sequence (phased)

- **P1A — Price source normalization plan.** Decide the single trusted price store. Two candidate strategies (to choose in P1A, not now):
  - **(a) Keep static `products.json` as source, add a build/sync step** so admin edits regenerate both generated caches + pre-rendered HTML. Lowest runtime risk, but admin edits need a deploy/regeneration pipeline.
  - **(b) Introduce a DB price table** (e.g. extend `product_inventory` or a new `product_pricing`) that `catalog.js` reads with static JSON as fallback. Enables live admin edits without deploy; higher care to keep checkout trusted.
  - Deliverable: a decision + column list; **no migration in P1A**.
- **P1B — Admin price visibility (read-only).** Show current price in `admin/products.html` (new column, read-only) behind `products:read`. No writes.
- **P1C — Admin price edit + server-side validation.** Add `products:pricing:update` permission + PATCH price path with Section 9 validation. Separate from inventory writes.
- **P1D — Price audit logging.** Log old/new prices, admin, reason via `recordAdminActivity` or dedicated table (Section 10 fields).
- **P1E — Sale price / compare-at support.** Add `regular_price`, `sale_price`, `compare_at_price`, `sale_start_at`, `sale_end_at`; wire PDP/PLP display + checkout to charge active `sale_price`, never `compare_at_price`.
- **P1F — Checkout tamper-proof verification hardening.** Re-confirm server re-prices from the (possibly new) trusted source; add explicit tests that localStorage tampering is ignored and that stale-cart price divergence is surfaced in UI.
- **P1G — Tests + production readiness.** Full validator + integration suite + launch readiness.

Each phase = its own commit + report, following the R1x cadence. Migrations only appear from P1A's decision onward, and only if strategy (b) is chosen.

---

## SECTION 14 — Validator plan

`scripts/validate-p1-admin-product-pricing-audit.mjs` must fail if:
- product price source is ambiguous (more than one *runtime* trusted source without a defined precedence)
- checkout trusts client-submitted price (`create-checkout.js` reads `payload...price`/`totals` for charging)
- cart price and checkout price can diverge silently with no server re-resolution
- old orders can be affected by current price changes (refund/read path joins live catalog price)
- refunds use current product price instead of paid snapshot (`refunds.js` must select `paid_line_total`/`paid_unit_price`)
- coupons use client price instead of trusted price (`validate.js` must use `buildTrustedCartLines`)
- `sale_price` can exceed `regular_price` (once implemented)
- `compare_at_price` can be charged as payable price
- invalid price can be saved by admin (missing server-side validation)
- price update lacks `products:pricing:update` permission protection
- price update lacks audit logging (once implemented)
- inventory blocking can be bypassed by price changes (`stockBlockReason` must not depend on price)
- D3A / D2B / C1 / I1 markers regress (chain the existing validators, whitelisting only expected new files)

Note: chain regression validators carefully — several older validators enforce "migration-free batch". If P1 adds a migration, whitelist that one file (as done for R1G) rather than editing legacy guards broadly.

---

## SECTION 15 — Test plan

- admin can view current product price (read-only)
- unauthorized admin (no `products:pricing:update`) cannot update price → 403
- invalid / non-numeric price rejected
- negative price rejected
- `sale_price > regular_price` rejected
- `compare_at_price < active selling price` rejected
- localStorage price tampering ignored by `create-checkout` (charged = catalog)
- checkout uses trusted server price
- Iyzico basket uses trusted price; callback rejects amount mismatch
- `order_items` store paid snapshot (`paid_line_total`, `paid_unit_price`, `pricing_snapshot_version`)
- old order total/refund unchanged after a product price update
- refund uses paid snapshot, not current price
- coupon minimum subtotal uses trusted price
- inventory blocking remains active after price change
- PDP/PLP display updates after approved price change (sale vs compare-at correct)

---

## Migration assessment

- **P1 (this plan): no migration.** Diagnosis only.
- Migrations become relevant from **P1A decision** onward, and only if the DB-price strategy (b) or new price fields (P1E) / audit table (P1D) are chosen. Any such migration must be idempotent, additive (`ADD COLUMN IF NOT EXISTS`), no data drops, no RLS/storage weakening, and must not touch coupons/checkout/refunds/inventory/admin-auth tables beyond additive price columns.

## Rollback plan (for future phases)

- Each phase is an isolated commit; rollback = revert that commit.
- Read-only phases (P1B) are trivially reversible.
- Additive migrations (P1D/P1E, or P1A strategy b) are safe to leave in place; if reverting code, leave added columns (harmless) unless explicitly removing triggers/consumers first.
- Because checkout/refunds already snapshot paid prices, reverting a price-management feature cannot corrupt historical orders.

---

## Bottom line

- **Can admin change prices today?** No — prices are static and unmanaged in-app.
- **Is it safe to add admin pricing later?** Yes, the foundation is sound: checkout re-prices server-side, coupons use trusted lines, and refunds/invoices use frozen paid snapshots (D3A/D2B). Historical orders are protected by design.
- **Biggest gaps to close before shipping pricing:** single trusted price source (dedupe the 4 copies), dedicated `products:pricing:update` permission, server-side price validation, price audit logging, and (optional) sale/compare-at + per-product VAT modeling.

**Stop after plan. No implementation performed.**
