# COSMOSKIN — C1B1 Coupon Exclusions, Eligible Subtotal & Line-Level Allocation Report

**Date:** 2026-07-06  
**Batch:** C1B1 only (implementation)  
**Goal:** Replace C1A fail-closed exclusion behavior with safe line-level eligibility, eligible subtotal, and allocation across eligible lines only.

## Scope & constraints (respected)

- **No migrations created** (no new `supabase/migrations/*.sql`).  
- **No SQL run** (no manual SQL execution).  
- **No deploy** performed.  
- **No changes** to admin auth/RBAC/JWT/session protected files.  
- **No changes** to payment RPC SQL, bank transfer B1/B2, email behavior, inventory logic, return attachment logic, loyalty ledger logic.  
- Refund logic not changed; D2A/D2B/D3A validated for regression.

## What changed (high level)

### C1A behavior replaced

Previously (C1A): any coupon with `excluded_product_slugs` or `excluded_categories` was rejected (“fail closed”).

Now (C1B1): coupons with exclusions are supported safely:

- **Excluded lines receive zero discount**.
- **Eligible subtotal** is computed from **trusted server cart lines** only.
- **Min subtotal check uses eligible subtotal when exclusions exist**.
- If **all** lines are excluded → coupon rejected with safe message:
  - “**Bu kupon sepetinizdeki ürünler için uygun değil.**”
- Validate endpoint and final checkout use the **same** shared eligibility engine and the **same trusted cart inputs**.

## Trusted data sources (server-side only)

- **Product slug / price / category** come from server catalog (`functions/api/_lib/catalog.js`) which reads `products-data.js` generated from `products.json`.
- Validate endpoint builds a **trusted cart** from catalog and ignores client totals.
- Checkout already normalizes cart from catalog; now also attaches `category` + `categorySlug`.

## Eligible subtotal formula

For coupons with exclusions:

```
eligible_subtotal = Σ(line_total for eligible lines)
min_subtotal check uses eligible_subtotal
```

For coupons without exclusions:

```
eligible_subtotal = cart subtotal (existing behavior)
```

Shipping never counts toward min subtotal (unchanged).

## Discount calculation (exclusion-aware)

Percent:

```
discount = eligible_subtotal * percent / 100
discount = min(discount, max_discount_amount if present)
discount ≤ eligible_subtotal
```

Fixed amount:

```
discount = min(fixed_amount, eligible_subtotal)
discount = min(discount, max_discount_amount if present)
discount ≤ eligible_subtotal
```

Generic:

- Discount never negative
- Final totals never below zero

## Line-level allocation helper (single shared path)

Implemented in `functions/api/_lib/order-pricing-snapshot.js`:

- `allocateOrderDiscountSnapshots(cart, discountAmount, { eligibility })`
- `buildOrderItemPricingSnapshots(cart, discountAmount, { version, eligibility })`

Allocation rules:

- Denominator is **eligible lines only** when eligibility is provided.
- Excluded lines get:
  - `allocated_order_discount = 0`
  - `paid_line_total = line_total`
  - `paid_unit_price = line_total / quantity`
- Eligible lines receive proportional allocation by eligible line subtotal.
- **Last eligible line** absorbs rounding remainder.
- 2-decimal currency precision.

## D3A snapshot behavior (exclusions)

For new orders with exclusions:

- Eligible discounted lines store `allocated_order_discount > 0`.
- Excluded lines store `allocated_order_discount = 0` and `paid_line_total = line_total`.
- Snapshot version is set to:
  - `v2_eligible_lines_proportional_last_line_remainder`

Legacy snapshots remain readable (no changes to `isValidPricingSnapshot` requirements).

## D2B refund proration impact

No refund business logic changed.

Expected behavior for exclusion-aware orders:

- D2B/D3A refund path prefers snapshots; since excluded lines have 0 allocated discount, refunds will not prorate discount to excluded items.

## Metadata eligibility behavior (preserved)

C1A rule behavior remains:

- `metadata.eligibility` still preferred when present.
- Launch coupon fallback still works.
- Invalid metadata fails safe.
- Client-submitted metadata ignored.

Exclusions remain in dedicated DB columns:

- `excluded_product_slugs`
- `excluded_categories`

## Customer-facing messages (safe Turkish)

Added/ensured:

- “Bu kupon sepetinizdeki ürünler için uygun değil.”
- “Bu kupon bazı ürünlerde geçerli değildir.” (returned as a non-blocking notice on partial exclusion)
- “Bu kupon için minimum sepet tutarı karşılanmıyor.”
- “Bu kupon şu anda geçerli değil.”

No database IDs / internal details exposed.

## Proof points

- **Validate + checkout match:** both call `validateCouponEligibility()` and both pass **trusted cart lines** (checkout normalized cart; validate builds trusted cart from catalog).
- **No migrations created:** confirmed by status + validators.
- **No SQL run:** JS-only changes.
- **No regressions:** full validator/test suite passed.

## Test / validator results

New validator:

- `node scripts/validate-c1b-coupon-exclusions-metadata.mjs` **passed**

Full required suite ran with:

- `COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1`  

and all required validators + `node --test tests/local-integration.test.mjs` **passed** (122/122).

## Files changed

See `COSMOSKIN_C1B1_COUPON_EXCLUSIONS_ALLOCATION_CHANGED_FILES_20260706.txt`.

