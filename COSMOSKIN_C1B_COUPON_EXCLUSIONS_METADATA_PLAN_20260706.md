# COSMOSKIN — C1B: Coupon Exclusions & Metadata Eligibility Management — PLAN

**Date:** 2026-07-06  
**Type:** Investigation + implementation plan only. No code, no migrations, no SQL, no deploy.  
**Builds on:** C1A (`COSMOSKIN_C1A_COUPON_ELIGIBILITY_HARDENING_REPORT_20260706.md`), C1 audit plan, D3A/D2B refund snapshot/proration.

**Stop boundary:** Plan only. Do not implement C1B in this batch.

---

## 0. Executive summary

C1A hardened server-side coupon eligibility via a single `validateCouponEligibility()` path. **Product/category exclusions are intentionally fail-closed:** any coupon with `excluded_product_slugs` or `excluded_categories` is rejected before discount calculation.

C1B replaces fail-closed with **safe line-level eligibility**:

- Compute **eligible subtotal** from server catalog cart lines only.
- Apply discount only across eligible lines.
- Persist **per-line allocation** consistently across checkout, Iyzico basket, D3A snapshots, and D2B legacy reconstruction.
- Make **`coupons.metadata.eligibility`** the long-term rule source (with legacy fallbacks).
- Add **minimal admin visibility** for eligibility + exclusions (not a full redesign).

**No migration required** for core C1B if `metadata` JSONB and exclusion columns already exist — but **server catalog must gain `categorySlug`** and checkout cart normalization must attach trusted category data.

---

## 1. Files inspected

| File | Role |
|------|------|
| `functions/api/_lib/coupons.js` | C1A eligibility engine; **fail-closed exclusions** (lines ~487–501); `resolveEligibilitySpec()`; `discountFor()`; `resolveCouponEnvelope()` |
| `functions/api/coupons/validate.js` | Validate API; catalog-based subtotal; passes `cartItems` (raw client cart, not enriched) |
| `functions/api/create-checkout.js` | `normalizeCart()`, `applyCoupon()`, `calculateTotalsWithCoupon()`, `buildIyzicoBasketItems()` → `buildOrderItemPricingSnapshots()` |
| `functions/api/_lib/order-pricing-snapshot.js` | D3A snapshot builder; `v1_proportional_last_line_remainder` |
| `functions/api/_lib/catalog.js` | Server product index; has `category` only — **no `categorySlug`** |
| `functions/api/admin/refunds.js` | D2B `allocateOrderDiscount()`; snapshot-preferring `resolveItemProratedRefundableCap()` |
| `functions/api/admin/coupons/index.js` | Admin CRUD; writes legacy `type`/`value` only |
| `assets/admin-coupons.js` | Admin UI table; code/type/value/min/active toggle only |
| `admin/coupons.html` | Admin coupon form shell |
| `assets/products-data.js` | Client cache; `CATEGORY_SLUGS` maps Turkish category → collection slug |
| `products.json` | Source of truth; `category` (Turkish display string) |
| `supabase/migrations/20260626_production_launch_readiness.sql` | `excluded_product_slugs`, `excluded_categories`, `stackable` columns |
| `COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql` | Launch coupon seeds; flat `metadata` (not nested `eligibility`) |
| `scripts/validate-c1-coupon-eligibility-hardening.mjs` | C1A validator |
| `tests/local-integration.test.mjs` | C1A integration tests; D2B/D3A refund tests |

**Not modified in C1B plan:** admin auth/RBAC, payment RPCs, B1/B2, email, inventory, returns attachments, loyalty ledger, refund business rules beyond exclusion-aware allocation inputs.

---

## 2. Current exclusion behavior (C1A)

### 2.1 Database fields

From `20260626_production_launch_readiness.sql`:

```sql
excluded_product_slugs text[] not null default '{}'
excluded_categories   text[] not null default '{}'
stackable             boolean not null default false
metadata              jsonb (present on coupons via launch migrations)
```

- Arrays default to `{}` — **null and empty are safe** (`safeArray()` in `coupons.js` normalizes null/empty/JSON string/comma-separated).
- **No active launch coupon** currently populates exclusions (all `{}`).

### 2.2 Where exclusions are checked today

**Only in** `validateCouponEligibility()` (`coupons.js`):

```javascript
const hasExclusions = (coupon.excluded_product_slugs || []).length > 0
  || (coupon.excluded_categories || []).length > 0;
if (hasExclusions) {
  return failEligibility({ reason_code: 'product_excluded' | 'category_excluded', ... });
}
```

- Runs **before** min-subtotal, usage limits, and discount calculation.
- **Validate and checkout** both hit this path (shared function).
- **No line-level inspection** — coupon is all-or-nothing rejected.

### 2.3 Is C1A fail-closed safe?

**Yes.** It guarantees:

- Excluded products never receive silent discounts.
- D3A/D2B never see inconsistent per-line allocation for exclusion coupons.
- No refund proration regression while exclusion feature is unused.

**Cost:** Any coupon with exclusions configured is **unusable** until C1B ships.

### 2.4 Product slug availability in cart/order context

| Layer | `product_slug` available? |
|-------|-------------------------|
| Client cart payload | Yes (slug/id sent; server re-resolves via catalog) |
| `normalizeCart()` output | Yes — `product_slug`, `product_id` |
| `order_items` insert | Yes — `product_slug`, `product_id` |
| Iyzico basket | Uses `product_id` from cart |
| Refund matching | `product_slug` / `order_item_id` |

**Slug normalization:** `catalog.js` `extractSlug()` lowercases path slugs; coupon exclusions should store **canonical slug** (e.g. `beauty-of-joseon-relief-sun-spf50`). Matching must `trim + lowercase`.

### 2.5 Category availability — **gap identified**

| Layer | Category data |
|-------|---------------|
| `products.json` | `category` — Turkish display (e.g. `"Tonik & Essence"`) |
| `assets/products-data.js` | `categorySlug` via `CATEGORY_SLUGS` map → collection slugs (`hydrate`, `cleanse`, …) |
| `functions/api/_lib/catalog.js` | **`category` only — no `categorySlug`** |
| `normalizeCart()` | **Does not attach category** |
| `order_items` | **No category column** |
| Collection pages | `data-category-slug` (`cleanse`, `protect`, …) |

**Canonical category keys for exclusions (recommended):**

1. **Primary:** collection slugs — `cleanse`, `hydrate`, `treat`, `care`, `protect`, `masks` (stable, URL-aligned).
2. **Secondary (normalized match):** Turkish `category` display strings and slugified forms.

**Multiple categories per product:** Today each product has **one** `category` and **one** derived `categorySlug`. Concern slugs (`concernSlugs`) exist on some products but are **not** coupon exclusion targets in C1B unless explicitly added later.

**Case sensitivity:** Plan **case-insensitive** matching for slugs and categories (`toLocaleLowerCase('tr-TR')`).

### 2.6 Admin UI for exclusions

| Capability | Current state |
|------------|---------------|
| View exclusions | **No** |
| Edit exclusions | **No** |
| View metadata.eligibility | **No** |
| Edit metadata | **No** |
| API writes exclusions | **No** — `payloadFrom()` omits `excluded_*`, `metadata`, `discount_type` |

Admin can only create/toggle `type`/`value`/`min_subtotal`/`max_discount` via `admin/coupons.html` + `assets/admin-coupons.js`.

### 2.7 Files that must change for partial eligible carts

| Priority | File | Change |
|----------|------|--------|
| P0 | `functions/api/_lib/catalog.js` | Add `categorySlug` (shared `CATEGORY_SLUGS` map) |
| P0 | `functions/api/_lib/order-pricing-snapshot.js` | Eligibility-aware allocation helper |
| P0 | `functions/api/_lib/coupons.js` | Replace fail-closed; eligible subtotal + discount |
| P0 | `functions/api/create-checkout.js` | Enrich cart lines; pass eligibility mask to snapshots |
| P0 | `functions/api/coupons/validate.js` | Build trusted cart lines (not raw client cart only) |
| P1 | `functions/api/admin/refunds.js` | D2B `allocateOrderDiscount` optional eligibility mask |
| P1 | `functions/api/admin/coupons/index.js` | Read/write exclusions + metadata.eligibility |
| P1 | `assets/admin-coupons.js` | Read-only display + minimal edit fields |
| P2 | `scripts/validate-c1b-coupon-exclusions-metadata.mjs` | New validator |
| P2 | `tests/local-integration.test.mjs` | Exclusion + metadata tests |

---

## 3. Line-level eligible subtotal plan

### 3.1 Proposed model

Introduce shared helper (location: extend `order-pricing-snapshot.js` or new `coupon-line-eligibility.js` imported by coupons + checkout):

```javascript
/**
 * @typedef {Object} CouponCartLine
 * @property {string} product_slug
 * @property {string} category          // Turkish display from catalog
 * @property {string} category_slug     // collection slug from catalog
 * @property {number} unit_price
 * @property {number} quantity
 * @property {number} line_total
 * @property {boolean} is_coupon_eligible
 * @property {string|null} exclusion_reason  // 'product_slug' | 'category' | null
 */

resolveCouponCartLines(trustedCart, coupon) → {
  lines: CouponCartLine[],
  eligibleSubtotal: number,
  fullSubtotal: number,
  eligibleCount: number,
  allExcluded: boolean
}
```

### 3.2 Per-line rules

| Check | Rule |
|-------|------|
| Product slug | If normalized slug ∈ `excluded_product_slugs` → ineligible (`exclusion_reason: product_slug`) |
| Category | If `category_slug` OR normalized `category` ∈ normalized `excluded_categories` → ineligible (`exclusion_reason: category`) |
| Both empty exclusion lists | All lines eligible |
| All lines ineligible | Reject coupon (`product_excluded` or `category_excluded`) |
| Some ineligible | Continue; discount base = **eligible subtotal only** |

### 3.3 Min subtotal rule

```
eligible_subtotal = sum(line_total where is_coupon_eligible)
min_subtotal_met = eligible_subtotal >= coupon.min_subtotal
```

- **Never** use client `body.subtotal`.
- **Never** include shipping.
- **Never** include excluded line totals in min-subtotal check.
- Validate endpoint must build the **same trusted cart lines** as checkout (shared `normalizeCart` or shared line resolver).

### 3.4 Trusted cart construction

**Checkout:** Already uses `normalizeCart()` with catalog prices — extend to attach `category`, `category_slug`.

**Validate:** Replace lightweight `subtotalFromCart()` with shared normalizer that:

1. Resolves each line via catalog (ignore client prices).
2. Applies same merge/qty rules as checkout where practical.
3. Returns full line objects for eligibility engine.

---

## 4. Discount calculation with exclusions

### 4.1 Order-level discount (unchanged model)

C1B keeps **one** `orders.discount_amount` and **one** `coupon_code` per order (no multi-coupon stacking).

### 4.2 Percent coupons

```
raw = eligible_subtotal * (value / 100)
discount = min(raw, max_discount_amount ?? raw)
discount = min(discount, eligible_subtotal)
discount = roundMoney(discount)
```

### 4.3 Fixed amount coupons

```
discount = min(fixed_value, eligible_subtotal)
discount = min(discount, max_discount_amount ?? discount)
discount = roundMoney(discount)
```

### 4.4 Free shipping coupons

**Safe C1B behavior (document):**

- `discount_amount` on order remains **0** (current `discountFor` pattern).
- `freeShipping` flag set on coupon application.
- **Min subtotal** for eligibility uses **eligible product subtotal** (exclusions apply).
- **Shipping threshold** (`FREE_SHIPPING_LIMIT = 2500` in checkout) continues to use **post-discount eligible subtotal** via existing `calculateTotalsWithCoupon()` — no change to D2A shipping refund rules.
- Excluded items do not receive product discount; shipping waiver is order-level, not per-line.

### 4.5 Final total

```
discounted_eligible_subtotal = eligible_subtotal - discount
total = max(0, discounted_eligible_subtotal + shipping)
```

Excluded lines remain at full `line_total` in subtotal; only eligible lines absorb discount allocation.

---

## 5. Allocation consistency (single shared helper)

### 5.1 Problem today

Two near-duplicate implementations:

| Module | Function | Denominator |
|--------|----------|-------------|
| `order-pricing-snapshot.js` | `buildOrderItemPricingSnapshots(cart, discount)` | All lines with `line_total > 0` |
| `admin/refunds.js` | `allocateOrderDiscount(items, discount, subtotal)` | All lines |

C1B must **not** add a third copy.

### 5.2 Proposed unified API

Extend `functions/api/_lib/order-pricing-snapshot.js`:

```javascript
export function allocateOrderDiscountToLines(lines, discountAmount, options = {}) {
  // options.eligibleOnly: boolean (default false for backward compat)
  // options.eligibilityMask: Map<lineKey, boolean> or line.is_coupon_eligible
  // Returns per-line: allocated_order_discount, paid_line_total, paid_unit_price
  // Last ELIGIBLE line absorbs rounding remainder
  // Excluded lines: allocated_order_discount = 0, paid_line_total = line_total
}
```

`buildOrderItemPricingSnapshots(cart, discount, eligibilityContext)` becomes a thin wrapper.

**Consumers (must all call same helper):**

1. `create-checkout.js` → order_items insert + Iyzico basket
2. `coupons.js` → preview `discountAmount` (sum of allocations = discount)
3. `admin/refunds.js` → D2B legacy `allocateOrderDiscount` delegates to shared helper

### 5.3 Allocation rules

| Rule | Detail |
|------|--------|
| Eligible lines only | Proportional by `line_total` among eligible lines |
| Excluded lines | `allocated_order_discount = 0` |
| Remainder | Last **eligible** line absorbs cents remainder |
| Precision | 2 decimal TRY; `roundSnapshotMoney` |
| Invariant | `sum(allocated_order_discount) === orders.discount_amount` (±0.01) |
| paid_line_total | `line_total - allocated_order_discount` |
| paid_unit_price | `paid_line_total / quantity` |

### 5.4 Coupon redemption records

`coupon_redemptions.discount_amount` = **order-level** `discount_amount` (unchanged). No per-line redemption table needed.

---

## 6. D3A snapshot impact

### 6.1 Expected snapshot behavior after C1B

| Line type | `allocated_order_discount` | `paid_line_total` |
|-----------|---------------------------|-------------------|
| Eligible | > 0 (proportional share) | `line_total - allocated` |
| Excluded | **0** | **= line_total** (full price paid) |

### 6.2 `pricing_snapshot_version` recommendation

**Keep `v1_proportional_last_line_remainder`** if:

- Algorithm structure unchanged (proportional + last-line remainder).
- Only the **eligible subset** changes.

**Optional upgrade to `v2_eligible_lines_proportional_last_line_remainder`** if:

- Admin/refund UI should distinguish exclusion-aware orders from legacy v1 orders.
- Auditors need version flag for support tooling.

**Recommendation:** Use **v2** when **any** excluded line exists on the order AND `discount_amount > 0`. Keeps v1 orders byte-semantically identifiable. Update `isValidPricingSnapshot()` only if new invariants needed (excluded lines with `alloc=0` already valid under v1).

### 6.3 D3A regression guard

- Orders **without** exclusions: identical snapshots to today.
- `orderItemsHaveCompleteSnapshots()` unchanged for legacy orders.

---

## 7. D2B refund impact

### 7.1 Snapshot-backed refunds (preferred path)

**No logic change required** if D3A snapshots are correct:

- `resolveItemProratedRefundableCapFromSnapshots()` reads `paid_line_total` / `allocated_order_discount` per line.
- Excluded returned item → full `paid_line_total` (no discount to return).
- Eligible returned item → discounted paid value.

### 7.2 Legacy D2B reconstruction

**Code change needed in C1B** for orders **without** complete snapshots:

- `allocateOrderDiscount()` must accept eligibility mask when `orders.coupon_code` had exclusions.
- **Problem:** `order_items` rows lack category — legacy reconstruction cannot re-derive exclusions post-hoc.

**Safe fallback hierarchy:**

1. Prefer D3A snapshots (post-C1B orders).
2. If snapshots missing but order has `metadata.coupon_eligibility_snapshot` (optional C1B enhancement storing eligible slugs at checkout) → reconstruct with mask.
3. If insufficient data → **existing D2B behavior** (proportional across all lines) + `fallback: true` label in admin UI — same as today for legacy orders.

**Recommendation:** Persist lightweight eligibility snapshot on order at checkout:

```json
// orders.metadata.coupon_allocation (optional C1B)
{
  "coupon_code": "EXAMPLE",
  "eligible_slugs": ["prod-a"],
  "excluded_slugs": ["prod-b"],
  "excluded_categories": ["protect"],
  "pricing_snapshot_version": "v2_eligible_lines_proportional_last_line_remainder"
}
```

This avoids needing category on `order_items` and makes D2B legacy path accurate for new exclusion orders.

### 7.3 D2A shipping

No change. Shipping caps remain independent of coupon line allocation.

---

## 8. Metadata eligibility management

### 8.1 Current metadata behavior

**DB seed** (`COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql`) uses **flat** metadata:

```json
{"tier":["signature","elite"],"manual_apply_required":true,...}
{"first_order_only":true,...}
{"birthday_month_only":true,"once_per_calendar_year":true,...}
```

**C1A resolver** reads **`metadata.eligibility`** only (nested). Launch coupons rely on **`APPROVED_RULES` code fallback** in `coupons.js` because nested `eligibility` is absent.

### 8.2 C1B target model (long-term source of truth)

```json
{
  "eligibility": {
    "requires_auth": true,
    "allowed_tiers": ["signature", "elite"],
    "requires_first_order": false,
    "requires_birthday": false,
    "birthday_mode": "day",
    "requires_smart_routine": false,
    "limit_period": "lifetime"
  }
}
```

**Exclusions stay in DB columns** (not `metadata.scope`):

- `excluded_product_slugs text[]`
- `excluded_categories text[]`

Rationale: queryable, indexable, admin-friendly lists; avoids duplicating source of truth.

`metadata.scope` is **optional redundancy** — avoid unless admin UI needs single JSON blob export.

### 8.3 Resolver precedence (planned)

```
1. coupons.metadata.eligibility (nested, validated)
2. Legacy flat metadata keys (tier, first_order_only, birthday_month_only) — transitional
3. APPROVED_RULES code fallback (launch codes only)
4. Fail safe on invalid metadata (treat as ineligible / generic error)
```

**Invalid metadata handling:**

- Unknown `allowed_tiers` values → ignore entry or fail closed (recommend: fail closed for admin-created coupons; fallback for known launch codes only).
- `requires_*` must be boolean.
- Do **not** read coupon title/description.

### 8.4 Seeding existing active coupons

| Coupon | metadata.eligibility to seed (ops/SQL script, not migration file) |
|--------|------------------------------------------------------------------|
| WELCOME10 | `requires_auth: true`, `requires_first_order: true` |
| BIRTHDAY10 | `requires_auth: true`, `requires_birthday: true`, `birthday_mode: "day"` |
| ROUTINE5 | `requires_auth: true`, `requires_smart_routine: true` |
| SIGNATURE75 | `requires_auth: true`, `allowed_tiers: ["signature","elite"]` |
| ELITE100 | `requires_auth: true`, `allowed_tiers: ["elite"]` |

**No migration required** — one-time `UPDATE coupons SET metadata = metadata || '{"eligibility":{...}}'` via approved ops script (out of C1B code scope; document in runbook).

### 8.5 `limit_period`

Defer strict enforcement to future batch unless business requires annual birthday-style limits beyond BIRTHDAY10's existing `usedThisYear` check. Document in metadata for admin visibility only in C1B.

---

## 9. Admin coupon UI plan (minimal)

### 9.1 Read-only display additions (`assets/admin-coupons.js`)

| Field | Source |
|-------|--------|
| Canonical type | `discount_type ?? type` |
| Canonical value | `discount_value ?? value` |
| max discount | `max_discount_amount ?? max_discount` |
| per_customer_limit | column |
| usage / reserved | aggregate `coupon_redemptions` (if API extended) |
| allowed_tiers | `metadata.eligibility.allowed_tiers` |
| requires_auth / first_order / birthday / routine | metadata.eligibility flags |
| excluded_product_slugs | column |
| excluded_categories | column |
| stackable | column |

### 9.2 Minimal edit support (C1B6)

Extend `functions/api/admin/coupons/index.js` `payloadFrom()`:

- Write canonical `discount_type`, `discount_value`, `max_discount_amount` **and** sync legacy `type`/`value`/`max_discount` for backward compatibility.
- Accept `excluded_product_slugs`, `excluded_categories` (string arrays).
- Accept `metadata.eligibility` partial updates (merge, don't replace entire metadata).
- **Do not** touch admin auth/RBAC files.

Admin HTML: add textarea/list inputs for exclusions + checkboxes for eligibility flags — keep existing layout.

---

## 10. Canonical resolver consistency

Reconfirmed C1A resolver (unchanged in C1B):

```
coupon_type         = discount_type ?? type
coupon_value        = discount_value ?? value
coupon_max_discount = max_discount_amount ?? max_discount
```

**Admin write recommendation:**

| Field | Admin writes | Checkout reads |
|-------|--------------|----------------|
| Canonical | `discount_type`, `discount_value`, `max_discount_amount` | resolver |
| Legacy sync | `type`, `value`, `max_discount` | fallback only |

**Conflict risk:** Admin POST today writes only legacy fields → resolver already prefers canonical columns when populated. C1B admin patch should **write both** until legacy columns are deprecated.

---

## 11. Customer-facing errors (C1B additions)

Map to safe Turkish copy (no internal IDs):

| reason_code | Message |
|-------------|---------|
| `product_excluded` (all lines) | Bu kupon sepetinizdeki ürünler için uygun değil. |
| `category_excluded` (all lines) | Bu kupon sepetinizdeki ürünler için uygun değil. |
| `partial_exclusion` (informational, ok response) | Bu kupon bazı ürünlerde geçerli değildir. |
| `min_subtotal_not_met` | Bu kupon için minimum sepet tutarı karşılanmıyor. |
| (existing C1A codes) | unchanged |

**Validate/checkout parity:** Partial cart may return `ok: true` with `partial_exclusion: true` and eligible `discount_amount` — both endpoints must use same engine output.

---

## 12. Test plan

### 12.1 Product exclusion tests

- [ ] All items excluded by slug → rejected
- [ ] One excluded slug → discount only on eligible lines
- [ ] Excluded line `allocated_order_discount = 0`
- [ ] Eligible line receives proportional share; last eligible absorbs remainder
- [ ] min_subtotal uses eligible subtotal only
- [ ] final total ≥ 0

### 12.2 Category exclusion tests

- [ ] All items excluded by `category_slug` → rejected
- [ ] One category excluded → partial eligibility
- [ ] Case normalization (`Protect` vs `protect`)
- [ ] Turkish category string match if configured in exclusions

### 12.3 Mixed cart tests

- [ ] Percent coupon on mixed cart; max cap against eligible subtotal
- [ ] Fixed coupon `min(amount, eligible_subtotal)`
- [ ] Rounding remainder on last eligible line only

### 12.4 D3A tests

- [ ] Excluded lines: `allocated_order_discount = 0`, `paid_line_total = line_total`
- [ ] Eligible lines: correct paid values
- [ ] Version v2 when exclusions present (if adopted)

### 12.5 D2B tests

- [ ] Refund excluded item at full paid value
- [ ] Refund eligible item at discounted paid value
- [ ] Legacy order without snapshot: fallback labeled; no over-refund
- [ ] Order with `metadata.coupon_allocation` reconstructs correctly

### 12.6 Metadata tests

- [ ] `metadata.eligibility.allowed_tiers` overrides when present
- [ ] Launch coupons work when metadata missing (APPROVED_RULES fallback)
- [ ] Invalid metadata fails safe
- [ ] C1A ROUTINE5 / tier / WELCOME10 protections unchanged

### 12.7 Security / regression

- [ ] Client eligible subtotal ignored
- [ ] Client category ignored
- [ ] Client allowed_tiers ignored
- [ ] Validate + checkout identical results
- [ ] D3A/D2B/D2A/D1/B1/B2/A1/H0/H1/H2/Batch validators pass

---

## 13. Validator plan

**New file:** `scripts/validate-c1b-coupon-exclusions-metadata.mjs`

Must fail if:

- Exclusions ignored when configured
- All-excluded cart receives discount
- Excluded line receives `allocated_order_discount > 0`
- min_subtotal uses full cart when exclusions exist
- D3A snapshots allocate to excluded lines
- D2B reconstruction allocates to excluded lines (when mask available)
- `metadata.eligibility` ignored when present
- Invalid metadata accepted unsafely
- Admin UI/API cannot display eligibility fields
- Validate vs checkout diverge
- C1A protections regress
- Prior validator chain fails

Chain env: extend `COSMOSKIN_ALLOW_C1A_COUPON_HARDENING` or add `COSMOSKIN_ALLOW_C1B_COUPON_EXCLUSIONS` for scope guards on touched files.

---

## 14. Migration assessment

| Need | Required? |
|------|-----------|
| `metadata` JSONB | **No** — exists |
| `excluded_*` columns | **No** — exist |
| `categorySlug` in server catalog | **No migration** — JS-only catalog map |
| `order_items.category` column | **Not required** if order metadata eligibility snapshot + D3A snapshots used |
| Admin structured eligibility columns | **No** — use metadata JSONB |
| Seed `metadata.eligibility` for launch coupons | **Ops SQL script** (not schema migration) — optional but recommended |

**Migration may be needed later if:**

- Product categories move to DB table with unstable names.
- Refund reconstruction must work without order metadata for very old orders (unlikely).

---

## 15. Implementation sequence (C1B)

```
C1B1 — Shared eligible-line resolver + allocation helper
        • catalog.js categorySlug
        • order-pricing-snapshot.js allocateOrderDiscountToLines()
        • coupon-line-eligibility.js (or module in coupons.js)

C1B2 — Coupon validation + checkout use eligible subtotal
        • Remove fail-closed block in coupons.js
        • normalizeCart enrichment
        • validate.js trusted cart builder
        • discountFor on eligible subtotal only

C1B3 — D3A snapshots respect excluded lines
        • create-checkout passes eligibility mask
        • optional v2 snapshot version
        • optional orders.metadata.coupon_allocation

C1B4 — D2B legacy reconstruction
        • delegate allocateOrderDiscount to shared helper
        • read order metadata mask when snapshots missing

C1B5 — Metadata eligibility handling
        • resolveEligibilitySpec reads nested + legacy flat metadata
        • invalid metadata fail-safe
        • ops seed script for launch coupons (documented, not in repo migration)

C1B6 — Admin visibility + minimal edit
        • admin API payloadFrom extensions
        • admin-coupons.js display/edit exclusions + eligibility

C1B7 — Validator + integration tests
        • validate-c1b-coupon-exclusions-metadata.mjs
        • tests/local-integration.test.mjs expansion
        • deliverable docs (REPORT, RUNBOOK, ROLLBACK)
```

**Estimated touch surface:** 8–12 files. **No** changes to `commerce-finalization.js` coupon used/release timing.

---

## 16. Rollback plan

1. Revert C1B commits (JS + admin UI only).
2. C1A fail-closed exclusion behavior returns — coupons with exclusions become rejected again (safe).
3. Orders placed during C1B with partial exclusions: snapshots remain correct; no DB rollback needed.
4. Re-run full validator chain + `node --test tests/local-integration.test.mjs`.
5. If `metadata.eligibility` was seeded via ops script, rollback script optional (flat metadata still works via APPROVED_RULES).

---

## 17. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Category slug mismatch (catalog vs admin) | Single `CATEGORY_SLUGS` constant shared server-side; document allowed values in admin UI |
| Validate/checkout cart shape differs | Shared `buildTrustedCouponCart()` used by both paths |
| D2B legacy orders with exclusions lack category | D3A snapshots + order metadata mask; fallback flag |
| Rounding drift Iyzico vs snapshots | Single allocation helper for basket + order_items |
| Metadata partially edited by admin | Merge patches; schema validation; fail closed on corrupt JSON |

---

## 18. Stop boundary

**Stop after this plan.** Do not implement C1B, create migrations, run SQL, or deploy.

**Deferred (post-C1B):**

- Full admin coupon editor redesign
- `metadata.scope` duplication
- Concern-slug exclusions
- Multi-category products
- Coupon stacking beyond single code

---

## 19. References

- `COSMOSKIN_C1_COUPON_ELIGIBILITY_AUDIT_PLAN_20260706.md`
- `COSMOSKIN_C1A_COUPON_ELIGIBILITY_HARDENING_REPORT_20260706.md`
- `COSMOSKIN_D3A_REFUND_SNAPSHOT_PERSISTENCE_REPORT_20260706.md`
- `COSMOSKIN_D2B_REFUND_DISCOUNT_PRORATION_REPORT_20260706.md`
- `COSMOSKIN_PROJECT_MEMORY.md`
- `COSMOSKIN_ADMIN_AUTH_RBAC_GUARDRAILS_20260706.md`
