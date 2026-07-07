# COSMOSKIN P1A — Product Price Source Drift Guard Report

Date: 2026-07-07  
Scope: P1A only (read-only guard; no admin price editing, no P1B)

## Executive summary

P1A adds a read-only validator and shared catalog comparison helper to detect price/slug drift across static product catalog copies before admin price editing is introduced. No product prices, checkout behavior, coupon logic, refund logic, inventory logic, or admin auth were changed.

## Files inspected

| File | Role |
|------|------|
| `products.json` | Canonical editable catalog |
| `assets/products-data.js` | Browser runtime cache + embedded fallback |
| `functions/api/_lib/products-data.js` | Server embedded catalog for Cloudflare Functions |
| `functions/api/_lib/catalog.js` | Server normalized catalog (`catalog`, `products`) |
| `functions/api/create-checkout.js` | Checkout price resolution + Iyzico basket + D3A snapshots |
| `functions/api/coupons/validate.js` | Coupon preview with trusted cart lines |
| `functions/api/_lib/coupons.js` | Shared coupon eligibility engine |
| `functions/api/_lib/inventory.js` | Stock validation via `catalogProduct()` |
| `functions/api/_lib/order-pricing-snapshot.js` | D3A `paid_unit_price` / `paid_line_total` snapshots |
| PDP/PLP pages | Load `/assets/products-data.js`; runtime fetch to `/products.json` |

## Task 1 — Canonical source decision

### 1. Which file is the canonical source today?

**`products.json`** — explicitly documented as the editable source in `assets/products-data.js` header and `functions/api/_lib/products-data.js` comment.

### 2. Which files are generated copies?

- `assets/products-data.js` — generated browser cache with embedded `FALLBACK_SOURCE`
- `functions/api/_lib/products-data.js` — auto-generated server module embedding the same JSON payload (plus enriched fields like `sku`, `search_terms`)

### 3. Do all copies contain the same product slugs?

**Yes (35/35)** at validation time. Validator fails on any missing/extra slug.

### 4. Do all copies contain the same prices?

**Yes (35/35)** at validation time. All integer TRY prices match canonical `products.json`.

**Metadata note:** Browser fallback `updated` stamp is `2026-04-26` while canonical is `2026-05-11-phase3`. Prices still match; runtime fetch to `/products.json` overwrites live state. Validator emits a warning for stale fallback metadata.

### 5. Does checkout use the trusted server-side catalog?

**Yes.** `create-checkout.js` imports `catalog` from `./_lib/catalog.js`, resolves each cart line via `findCatalogProduct()`, and sets `unitPrice = normalizeMoney(product.price)`. Client-submitted prices are not read.

### 6. Does storefront use a matching browser catalog?

**Yes at runtime** via `fetch('/products.json')` in `assets/products-data.js`. **Embedded fallback** prices currently match canonical (validator enforced); metadata stamp is older.

## Drift risks found

| Risk | Severity | Mitigation in P1A |
|------|----------|-------------------|
| Manual edit to one copy without regenerating others | High | `validate-p1a-product-price-source-drift.mjs` fails CI/local checks |
| Browser offline/first-paint fallback stale | Medium | Warning on `updated` mismatch; price parity still enforced |
| Supabase `products.price_try` unused at runtime | Low (documented) | Out of P1A scope; no Supabase price reads added |
| Client tampering with cart prices | High (existing) | Checkout/coupon already ignore client unit price; static checks retained |

## Validator behavior

**Script:** `scripts/validate-p1a-product-price-source-drift.mjs`  
**Helper:** `scripts/lib/product-price-catalog.mjs`

Fails when:

- `products.json` price differs from `assets/products-data.js` fallback or `functions/api/_lib/products-data.js`
- Browser vs server catalog price mismatch (via `catalog.js` runtime index)
- Product exists in one catalog but not another
- Slug or id mismatch
- Price missing, null, NaN, negative, or non-integer
- Currency field (when present) is not `TRY`
- Checkout/coupon/inventory/D3A static trust markers missing
- Checkout appears to trust `rawItem.price` or `body.subtotal`/`body.total`
- P1A migration files are added under `supabase/migrations/`

Read-only: does not modify catalog data or prices.

## Checkout trust proof

`create-checkout.js`:

- `import { catalog } from './_lib/catalog.js'`
- `normalizeCart()` → `findCatalogProduct()` → `unitPrice = normalizeMoney(product.price)`
- `buildIyzicoBasketItems()` uses `buildOrderItemPricingSnapshots()` → `item.paid_line_total`
- No `rawItem.price` / `body.total` usage

## Coupon trust proof

`functions/api/coupons/validate.js`:

- `buildTrustedCartLines()` rebuilds lines from `catalog` product price
- Subtotal computed from trusted `line_total` sum
- Shared `validateCouponEligibility()` used by checkout

## Refund / history impact

**None.** Refunds continue to use persisted D3A order item snapshots (`paid_unit_price`, `paid_line_total`). P1A did not change snapshot writers or refund calculators.

## Inventory impact

**None.** `inventory.js` continues to resolve products via `catalogProduct(slug)` from server `catalog.js`. Validator confirms inventory admin paths require catalog slug presence.

## Proof no product prices changed

- Validator compares live files; all 35 slugs report price parity
- No edits to `products.json`, `assets/products-data.js`, or `functions/api/_lib/products-data.js`
- Git diff limited to P1A guard scripts, tests, and docs

## Proof no SQL was run

No database commands executed during P1A implementation.

## Proof no migration was created

No new files under `supabase/migrations/` for P1A. Validator explicitly fails if P1A-named migrations appear.

## Test results

Run on 2026-07-07:

```
node scripts/validate-p1a-product-price-source-drift.mjs          PASS (1 warning: fallback updated stamp)
node scripts/validate-production-launch-readiness.mjs             (see runbook)
node scripts/validate-i1-inventory-checkout-blocking.mjs          (see runbook)
node scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs   (see runbook)
node scripts/validate-c1b-coupon-exclusions-metadata.mjs          (see runbook)
node scripts/validate-c1-coupon-eligibility-hardening.mjs          (see runbook)
node scripts/validate-d3-refund-snapshot-persistence.mjs            (see runbook)
node scripts/validate-d2b-refund-discount-proration.mjs             (see runbook)
node scripts/validate-d2-refund-amount-correctness.mjs            (see runbook)
node --test tests/local-integration.test.mjs                      (see runbook)
```

Integration tests added:

- `P1A: canonical catalog prices align across products.json, browser fallback, and server catalog`
- `P1A: drift validator script passes on current catalog sources`

## Rollback plan

See `COSMOSKIN_P1A_PRODUCT_PRICE_SOURCE_DRIFT_GUARD_ROLLBACK_PLAN_20260707.md`.

## Deferred (not P1A)

- P1B admin price editing
- Supabase `products.price_try` runtime wiring
- Regenerating browser fallback `updated` stamp (cosmetic; prices already aligned)
- Deploy
