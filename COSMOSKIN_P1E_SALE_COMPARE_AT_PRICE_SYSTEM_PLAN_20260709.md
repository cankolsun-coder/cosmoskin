## COSMOSKIN — P1E Sale Price / Compare-at Price System Plan (2026-07-09)

### Scope (planning only)
- Add **sale price** + **compare-at price** with optional date window.
- Preserve current P1A–P1D guarantees:
  - server-authoritative checkout pricing
  - effective price resolver is single source of truth for payable price
  - old orders/refunds rely on paid snapshots, not current catalog/overrides
- Do **not** modify `products.json` (catalog remains base).
- Do **not** change checkout logic until implementation is approved (this document is a plan).

---

## PRE-CHECK (repo state)
- `git status --short`: clean (no changes) except optional `.wrangler/` allowed.
- `git log --oneline -12`: confirms both **UX1** and **C4** are committed (`3037a9b` UX1, `2ac88dc` C4).

---

## SECTION 1 — Current price model audit (answers)

### 1) Where is regular admin override price stored?
- **DB table**: `public.product_price_overrides`
  - column: `regular_price_try`
  - key: `product_slug` (unique)
- Migration: `supabase/migrations/20260707_p1c_admin_product_price_editing.sql`
- Write path: `functions/api/admin/products/[slug]/price.js` → `upsertAdminProductPriceOverride()` in `functions/api/_lib/product-pricing.js`
- Audit table: `public.product_price_audit_logs` (logs old/new regular price and currency)

### 2) Which resolver decides effective payable price?
- `functions/api/_lib/product-pricing.js`
  - `resolveEffectivePricing(catalogProduct, overrideRow)`
  - returns `effective_price_try` + `effective_price_source` (`static_catalog` or `admin_override`) and safety flags.

### 3) Which frontend surfaces consume effective price?
Effective pricing is merged into runtime product data and then used across UI:
- `assets/products-data.js`
  - loads `/products.json` then overlays `/api/catalog/effective-prices`
  - writes `price`, `price_try`, `effective_price_try`, `effective_price_source`, etc. into `window.COSMOSKIN_PRODUCTS`
- `assets/product-page.js`
  - patches PDP visible price + JSON-LD offer price from `/api/catalog/effective-prices`
- `assets/app.js`
  - normalizes product references from `COSMOSKIN_PRODUCTS` and uses `product.price` (which is already effective)
- `assets/cart-commerce.js`
  - totals use `line.price` derived from `COSMOSKIN_PRODUCTS` (`product.price`)

### 4) Which checkout/coupon flows consume effective price?
Server-trusted catalog + overrides are already used:
- Checkout: `functions/api/create-checkout.js`
  - `buildPricedCatalogIndex()` → product objects contain trusted `price` (effective)
  - cart normalization uses `unitPrice = product.price` (server authoritative)
- Coupon validate: `functions/api/coupons/validate.js`
  - `buildPricedCatalogIndex()` and trusted cart lines are computed from `product.price`

### 5) Which audit logs store price changes?
- `public.product_price_audit_logs`
  - currently stores: old/new regular price, currency, changed_by_admin, changed_at, reason, source, request_id
  - read path: `functions/api/admin/products/[slug]/price-history.js`
  - UI: `assets/admin-products.js` shows “Fiyat Geçmişi”

### 6) Which parts need extension for sale/compare-at?
We must extend the effective pricing surface end-to-end:
- DB persistence for sale/compare-at fields
- `resolveEffectivePricing()` to compute:
  - `regular_price_try`, `sale_price_try`, `compare_at_price_try`, `sale_active`
  - `effective_price_try` and `effective_price_source` (add `admin_sale`)
  - a `price_display_mode` for storefront
- Effective prices API payload (`/api/catalog/effective-prices`)
- Frontend overlays:
  - `assets/products-data.js` merge overlay
  - `assets/product-page.js` (PDP price + JSON-LD)
  - storefront card renderers and cart surfaces must show sale correctly (but payable stays `effective_price_try`)
- Checkout/coupon flows must continue to use payable effective price (sale when active)
- Audit logs must record sale/compare-at and window changes.

---

## SECTION 2 — Sale price model (definitions)

### Canonical fields (TRY integer-only)
- **base_catalog_price_try**: from `products.json` (existing)
- **regular_price_try**: payable when no active sale
  - equals admin override if present and valid, otherwise base catalog
- **sale_price_try**: discounted payable price when **sale_active**
- **compare_at_price_try**: display-only crossed-out reference price
  - MUST NEVER be used as payable
- **sale_starts_at**: nullable timestamptz
- **sale_ends_at**: nullable timestamptz
- **sale_active** (derived): `sale_price_try` is valid and window contains “now”
- **effective_price_try**: payable final price
  - `sale_price_try` if `sale_active`
  - else `regular_price_try`
- **effective_price_source**:
  - `static_catalog` (no override and no sale)
  - `admin_override` (override used, no sale active)
  - `admin_sale` (sale is active and valid; compare-at may be set)

### Derived display helpers
- **price_display_mode** (string enum)
  - `regular` (no sale)
  - `sale` (active sale + compare-at or regular strike-through)
  - `scheduled_sale` (future window; show regular)
  - `expired_sale` (past window; show regular)
  - `invalid_sale` (admin-only diagnostic; storefront treats as `regular`)

---

## SECTION 3 — Validation rules (server-side, strict)

### Regular price (existing)
- integer TRY, > 0, <= `MAX_REGULAR_PRICE_TRY`

### Sale/compare-at validation (new)
Reject (admin API must return structured error codes + Turkish messages):
- `sale_price_try <= 0`
  - “Geçerli bir indirimli fiyat girin.”
- `sale_price_try >= regular_price_try`
  - “İndirimli fiyat normal fiyattan düşük olmalıdır.”
- `compare_at_price_try` present but `compare_at_price_try <= regular_price_try` when no sale, or `<= sale_price_try` when sale exists
  - “Karşılaştırma fiyatı satış fiyatından yüksek olmalıdır.”
- decimal TRY anywhere
  - “Fiyat tam TL olarak kaydedilmelidir.”
- currency not TRY
- `sale_ends_at < sale_starts_at`
  - “İndirim tarihi aralığı geçerli değil.”
- invalid date format
- unknown `product_slug`
- any attempt to set sale fields through inventory routes
  - keep current guard: `inventory:adjust` endpoints reject all pricing keys

Fail-closed principle:
- invalid sale data must not silently affect checkout; it must be **blocked on write** and treated as inactive in resolver if it ever exists (defense-in-depth).

---

## SECTION 4 — Persistence model options (decision)

### Option A (recommended): extend `product_price_overrides`
Add nullable sale fields to `product_price_overrides`:
- `sale_price_try integer null`
- `compare_at_price_try integer null`
- `sale_starts_at timestamptz null`
- `sale_ends_at timestamptz null`

Extend `product_price_audit_logs` with old/new fields for sale and compare-at + window.

**Why this is safest here**
- Minimal moving parts; integrates directly with the existing single override row per product.
- Keeps `buildPricedCatalogIndex()` / `resolveEffectivePricing()` architecture intact.
- RLS/RBAC model already exists for pricing update; no new table permissions required (beyond additional columns).
- Audit trail remains first-class and queryable (not hidden in metadata).

### Option B: separate `product_price_promotions` table
- More flexible for multiple promos, but introduces join complexity + new RLS surface + migration risk.

### Option C: `product_price_rules` table
- Overkill for current codebase; higher risk and longer integration.

**Chosen**: **Option A**.

---

## SECTION 5 — Migration plan (planned only; do not run)

### Migration file (planned)
`supabase/migrations/20260709_p1e_sale_compare_at_price.sql`

### Migration content (idempotent; high-level)
1) Alter `product_price_overrides` add columns if not exist:
- `sale_price_try integer null`
- `compare_at_price_try integer null`
- `sale_starts_at timestamptz null`
- `sale_ends_at timestamptz null`

2) Add constraints (drop+add for idempotency):
- `sale_price_try > 0` when not null
- `compare_at_price_try > 0` when not null
- `sale_ends_at >= sale_starts_at` when both present
- Optional: `compare_at_price_try > sale_price_try` when both present (and/or > regular) — this may be difficult to express without referencing derived effective; enforce primarily at application layer.

3) Alter `product_price_audit_logs` to add nullable columns:
- `old_sale_price_try`, `new_sale_price_try`
- `old_compare_at_price_try`, `new_compare_at_price_try`
- `old_sale_starts_at`, `new_sale_starts_at`
- `old_sale_ends_at`, `new_sale_ends_at`

4) Indexing:
- keep existing indexes; optionally add `(product_slug, changed_at desc)` already exists.

**Must NOT touch**: orders, refunds, coupons, inventory quantities, reviews, RLS weakening.

---

## SECTION 6 — Resolver behavior changes (planned)

### Update `resolveEffectivePricing(catalogProduct, overrideRow)`
Extend the resolver return shape to include both payable and display-only fields:

**New/extended return fields**
- `base_catalog_price_try` (existing)
- `regular_price_try` (new; derived)
- `sale_price_try` (new; from override row when set and valid)
- `compare_at_price_try` (new; from override row when set and valid)
- `sale_starts_at`, `sale_ends_at` (new; passthrough)
- `sale_active` (new; derived)
- `effective_price_try` (existing name is already `effective_price_try`; keep)
- `effective_price_source` (extend with `admin_sale`)
- `price_display_mode` (new; `regular|sale|scheduled_sale|expired_sale|invalid_sale`)

**Computation rules**
- Determine **regular price basis**:
  - if `overrideRow.regular_price_try` valid and active → `regular_price_try = overrideRow.regular_price_try` and base source is `admin_override`
  - else if catalog base valid → `regular_price_try = base_catalog_price_try` and base source is `static_catalog`
  - else `regular_price_try = null` (invalid catalog) with warnings as today
- Determine **sale validity** (defense-in-depth even though admin write validation blocks bad data):
  - `sale_price_try` must be integer > 0 and `< regular_price_try`
  - `now` must satisfy window:
    - if `sale_starts_at` present, `now >= sale_starts_at`
    - if `sale_ends_at` present, `now <= sale_ends_at`
  - if valid + in-window → `sale_active = true`
- Determine **effective payable price**:
  - if `sale_active` → `effective_price_try = sale_price_try`, `effective_price_source = 'admin_sale'`
  - else → `effective_price_try = regular_price_try`, `effective_price_source = base source`
- `compare_at_price_try` is **display only**:
  - if set, it must be integer > 0 and **>`effective_price_try`** for any sale display
  - if invalid, resolver sets it to null and sets `price_display_mode = invalid_sale` (admin-only diagnostic)

**Price display mode**
- `sale` when `sale_active` and compare-at is valid (or fallback strike-through to regular)
- `scheduled_sale` when sale data valid but `now < sale_starts_at`
- `expired_sale` when sale data valid but `now > sale_ends_at`
- `regular` otherwise
- `invalid_sale` only for admin diagnostics (storefront treats as `regular`)

---

## SECTION 7 — Storefront display behavior (planned)

### Data flow: keep “payable” and “display” separate
- Payable:
  - `product.price` continues to be the **payable effective** (already used everywhere)
  - backed by resolver `effective_price_try`
- Display:
  - new fields are used only for crossed-out UI and badges:
    - `compare_at_price_try`
    - `regular_price_try` (when no compare-at; strike-through regular)
    - `sale_active` / `price_display_mode`

### Surfaces to update (implementation later)
- PDP main price + sticky price + JSON-LD (`assets/product-page.js`)
- PLP cards, bestsellers, search results, favorites, smart routine cards (`assets/app.js` and any card renderers)
- Mini cart drawer, cart.html, checkout.html must show **payable sale price when active** (they already reflect payable `product.price`; add crossed-out display only)

### Display rules
- No sale:
  - show single price (payable)
- Active sale:
  - show payable sale price as main price
  - show crossed-out compare-at price if present; else crossed-out regular price
  - optional badge “%X” or “İndirim” (badge content must derive from prices; include accessible text)
- Scheduled/expired:
  - do not show sale as payable; show regular payable price

Accessibility
- For sale display: add visually-hidden text such as “İndirimli fiyat” / “Eski fiyat” where appropriate.

---

## SECTION 8 — Checkout / payment behavior (planned)

### Required invariants
- `create-checkout` must use **resolver effective payable** price:
  - if sale active → charge `sale_price_try`
  - else charge regular effective
- Client-submitted price fields remain ignored (already true via trusted catalog index).
- Coupon math uses payable effective prices (already true via trusted cart lines in `coupons/validate.js` and checkout `normalizeCart()`).
- Iyzico basket unit prices must use payable effective prices.
- `order_items.unit_price` and D3A snapshot fields store the **paid** price, not compare-at.
- Refunds continue to use paid snapshots; sale expiry never mutates old orders.

---

## SECTION 9 — Coupon interaction (planned)

Default rule (keep current policy):
- Coupons apply over **effective payable price** (sale if active).
- Compare-at is never used for coupon eligibility, minimums, allocation, or totals.

No new exclusion policies introduced in P1E (defer).

---

## SECTION 10 — KDV / VAT (planned)

- Treat `effective_price_try` as **KDV dahil** gross price.
- VAT derivation uses payable effective totals (as today).
- Compare-at does not affect VAT.
- Coupon discount continues to reduce gross basis under existing logic.

---

## SECTION 11 — Admin UI plan (planned)

### API changes
Update admin price endpoint:
- `functions/api/admin/products/[slug]/price.js` PATCH accepts:
  - `regular_price_try` (existing)
  - `sale_price_try`
  - `compare_at_price_try`
  - `sale_starts_at`
  - `sale_ends_at`
  - `reason`
- Enforce `products:pricing:update` permission (already).

Update admin products list payload:
- `functions/api/admin/products.js` includes derived fields from resolver:
  - regular, sale, compare-at, window, status badges

Update history endpoint:
- `functions/api/admin/products/[slug]/price-history.js` returns the new audit columns.

### UI changes (`assets/admin-products.js`)
Add inputs:
- Normal fiyat (regular)
- İndirimli fiyat (sale)
- Karşılaştırma fiyatı (compare-at)
- Başlangıç / Bitiş datetime
- Reason (already exists)
Add badges:
- Katalog / Admin override
- İndirim aktif / planlandı / süresi doldu
Show:
- payable effective price
- crossed-out compare-at/regular preview
- validation errors inline

---

## SECTION 12 — Audit log plan (planned)

Preferred: **extend `product_price_audit_logs` columns** (Option A) so changes are queryable without parsing metadata.

Log on every admin pricing write:
- product_slug
- old/new regular_price_try
- old/new sale_price_try
- old/new compare_at_price_try
- old/new sale_starts_at
- old/new sale_ends_at
- changed_by_admin, changed_at
- reason, source, request_id

---

## SECTION 13 — Admin permissions (planned)

- `products:read`: view pricing fields and history
- `products:pricing:update`: edit regular/sale/compare-at fields
- `inventory:adjust`: must not edit any pricing keys (extend existing server-side guard to include sale fields)

No RBAC weakening.

---

## SECTION 14 — Validator plan (planned)

Create `scripts/validate-p1e-sale-compare-at-price-system.mjs` that fails if:
- compare-at can become payable anywhere (server or client)
- checkout does not charge sale when active, or charges sale when future/expired
- sale validations are missing (sale >= regular allowed, decimals allowed, invalid windows allowed)
- coupon math uses compare-at
- VAT uses compare-at
- order snapshots omit sale paid price
- refund logic reads current pricing instead of snapshots
- inventory endpoints accept sale fields
- audit log doesn’t record sale/compare-at changes
- `products.json` modified
- P1C/P1D behaviors regress

---

## SECTION 15 — Test plan (planned)

Add tests in `tests/local-integration.test.mjs`:

**Admin validation**
- accepts valid sale window + compare-at
- rejects sale >= regular
- rejects compare-at <= sale/effective
- rejects invalid date window
- inventory admin cannot set sale fields

**Resolver**
- active sale → `effective_price_try = sale_price_try`, source `admin_sale`
- future sale → regular effective, display mode scheduled
- expired sale → regular effective, display mode expired
- compare-at never impacts payable

**Storefront**
- PDP shows sale + strike-through compare-at/regular and JSON-LD uses payable sale
- PLP cards show sale UI without affecting add-to-cart payload pricing
- mini cart/cart/checkout show payable sale price when active

**Checkout**
- `create-checkout` uses sale effective price
- coupon subtotal uses sale effective price
- iyzico basket uses sale effective price
- order item snapshots store paid sale price

**History/refund**
- orders remain unchanged after sale expiry
- refund uses paid snapshots
- history endpoint shows sale changes

---

## SECTION 16 — Implementation slicing (recommended)

Split for safety and reviewability:
- **P1E1**: Migration + resolver + effective-prices API payload extension
- **P1E2**: Admin API validation + audit log extension + admin UI edits
- **P1E3**: Storefront sale display (PDP/PLP/search/favorites/routine)
- **P1E4**: Checkout/coupon/snapshot verification + iyzico payload checks (should be mostly already aligned once resolver drives `product.price`)
- **P1E5**: Validators/tests/docs + production readiness checks

Rationale: reduces blast radius and keeps commerce integrity changes easy to pinpoint.

---

## Risks & mitigations

- **Risk: compare-at accidentally used as payable**
  - Mitigation: resolver never sets payable from compare-at; validators enforce; tests assert checkout unit_price equals effective/sale.
- **Risk: scheduled/expired sale leaks into payable**
  - Mitigation: resolver window gating + tests around boundary conditions.
- **Risk: storefront shows sale while checkout doesn’t charge it (or vice versa)**
  - Mitigation: keep payable `product.price` as single source; display-only fields separate.
- **Risk: audit gaps**
  - Mitigation: fail-closed write when audit insert fails (mirror P1C behavior).

---

## Rollback plan (planned)
- Revert migration (or gate by feature flag if we add one in P1E1).
- Revert resolver and API payload extensions.
- Storefront falls back to showing `product.price` only (regular effective).
- Old orders unaffected.

