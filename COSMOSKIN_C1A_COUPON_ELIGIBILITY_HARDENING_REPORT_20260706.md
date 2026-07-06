# COSMOSKIN — C1A Coupon Eligibility Hardening Report

**Date:** 2026-07-06  
**Batch:** C1A only (implementation)  
**Goal:** Harden coupon eligibility so restricted coupons cannot be used just by knowing the code.  

## Scope & constraints (respected)

- **No migrations created** (no new `supabase/migrations/*.sql` files).  
- **No SQL run** (no manual SQL execution; changes are JS-only).  
- **No deploy** performed.  
- **No changes** to protected admin auth/RBAC/JWT/session files.  
- **No changes** to payment RPC SQL, bank transfer B1/B2, email behavior, inventory logic, return attachment logic, loyalty ledger logic, refund calculation logic.  
- Refund/D2B/D3A logic is **read-only regression-validated** (validators + tests).

## Trusted data sources (server-side only)

- **Membership tier:** `customer_membership_status.level_code` (canonical `essential` / `signature` / `elite`).  
- **Birthday:** `profiles.birthday` / `profiles.birth_date` (missing birthday fails closed).  
- **Smart Routine completion (ROUTINE5):** `customer_routine_results` (linked by authenticated `user_id`).  
- **Subtotal/discount:** computed on server at checkout from catalog; `/api/coupons/validate` computes a best-effort subtotal using the server catalog and ignores `body.subtotal`.

## Centralized eligibility engine (single shared path)

All coupon validation now goes through **one shared backend function**:

- `functions/api/_lib/coupons.js` → `validateCouponEligibility()`

And it is used by both:

- `POST /api/coupons/validate` (`functions/api/coupons/validate.js`)
- Final order creation (`functions/api/create-checkout.js` → `applyCoupon()` → `validateCouponEligibility()`)

This guarantees **frontend visibility is not security** and the backend rejects ineligible manual coupon entry.

## Canonical coupon resolver (required)

Resolver behavior (server-side):

- `coupon_type = discount_type ?? type`
- `coupon_value = discount_value ?? value`
- `coupon_max_discount = max_discount_amount ?? max_discount`
- Code normalization: `trim + uppercase`
- Reject:
  - empty code
  - deprecated codes (`DEPRECATED_COUPONS`)
  - inactive coupons (`is_active=false`)
  - future (`starts_at`)
  - expired (`ends_at`)
  - invalid/zero discount values (unless `free_shipping`)
  - fixed discount exceeding eligible subtotal (clamped; totals never negative)

## Eligibility model (metadata-first, code fallback)

Preferred source:

- `coupons.metadata.eligibility` (if present)

Fallback (for launch coupons):

- `APPROVED_RULES` (only for known codes, not title/description-based)

Metadata shape supported:

```json
{
  "eligibility": {
    "allowed_tiers": ["signature", "elite"],
    "requires_auth": true,
    "requires_first_order": false,
    "requires_birthday_month": false,
    "requires_smart_routine": false
  }
}
```

## Required reason codes (implemented)

The shared engine returns (and the validate endpoint forwards) canonical `reason_code` values:

- `coupon_not_found`
- `coupon_inactive`
- `coupon_deprecated`
- `coupon_expired`
- `coupon_not_started`
- `invalid_discount`
- `min_subtotal_not_met`
- `authentication_required`
- `membership_required`
- `membership_tier_not_allowed`
- `birthday_month_required`
- `smart_routine_required`
- `first_order_required`
- `per_customer_limit_reached`
- `usage_limit_reached`
- `coupon_not_stackable`
- `product_excluded`
- `category_excluded`

## Customer-facing messages (safe Turkish)

The engine maps restricted reasons to the required safe messages (no internal IDs/tier IDs/fraud logic):

- “Bu kupon şu anda geçerli değil.”
- “Bu kupon için minimum sepet tutarı karşılanmıyor.”
- “Bu kupon hesabınız için uygun değil.”
- “Bu kupon daha önce kullanılmış.”
- “Bu kupon yalnızca belirli üyelik seviyelerinde kullanılabilir.”
- “Bu kupon doğum günü ayınıza özel olarak kullanılabilir.”
- “Bu kupon Akıllı Rutin tamamlandıktan sonra kullanılabilir.”

## Coupon-by-coupon behavior (C1A)

### WELCOME10

- **Auth required:** yes (guest blocked)  
- **Allowed tiers:** all tiers allowed (no tier gate)  
- **Rule:** first successful paid order only  
- **Min subtotal:** 1000  
- **Max discount:** 150  
- **Per customer limit:** 1 (now counts **used + active reserved**)  

### ROUTINE5 (fixed — formerly unsafe)

- **Auth required:** yes (guest blocked)  
- **Allowed tiers:** all tiers allowed (no tier gate)  
- **Rule:** requires **trusted server-side Smart Routine completion**  
  - Verified via `customer_routine_results` for `user_id` with `is_active=true`
  - If no trusted record exists, coupon is rejected with:
    - `reason_code = smart_routine_required`
    - message: “Bu kupon Akıllı Rutin tamamlandıktan sonra kullanılabilir.”
- **Min subtotal:** 1500  
- **Max discount:** 100  
- **Per customer limit:** 1 (counts **used + reserved**)  

### SIGNATURE75

- **Auth required:** yes  
- **Allowed tiers:** `["signature","elite"]` (Essential rejected)  
- **Min subtotal:** 1500  
- **Discount:** fixed 75  
- **Per customer limit:** 1 (counts **used + reserved**)  

### ELITE100

- **Auth required:** yes  
- **Allowed tiers:** `["elite"]` (Essential + Signature rejected)  
- **Min subtotal:** 2000  
- **Discount:** fixed 100  
- **Per customer limit:** 1 (counts **used + reserved**)  

### BIRTHDAY10

- **Auth required:** yes  
- **Allowed tiers:** all tiers allowed (no tier gate)  
- **Birthday:** read from trusted `profiles` only; missing birthday fails closed  
- **Validation:** existing strict “birthday date-only” + “once per calendar year” behavior is preserved (not weakened)  
- **Min subtotal:** 1500  
- **Max discount:** 150  

### COSMOSKIN10

- Remains **unusable**:
  - Deprecated (`DEPRECATED_COUPONS`)
  - Inactive in DB (`is_active=false`)
  - Zero-value discount never applies accidentally

## Usage limits & reservation hardening

- `usage_limit` counts **used + active reserved** redemptions.
- `per_customer_limit` counts **used + active reserved** redemptions (hardening).
- This prevents “two tabs / parallel checkout” from bypassing per-customer rules.

## Stackability

- Non-stackable behavior is enforced defensively by rejecting a second coupon in the same flow when `stackable=false` (if an `existingCouponCode` is ever supplied).
- Order model remains single `coupon_code`.

## Exclusions (safe C1A behavior)

`excluded_product_slugs` and `excluded_categories` exist in `coupons` but line-level allocation requires deeper integration with D3A snapshots + D2B proration.

**C1A safe policy:** fail closed if exclusions are configured on the coupon:

- Reject coupon with `product_excluded` or `category_excluded`.
- Ensures excluded products **never silently receive discounts**.

This avoids any refund/proration regressions.

## Proof: validate endpoint and checkout use same rules

- Both call `validateCouponEligibility()` in `functions/api/_lib/coupons.js`.
- Integration tests include a dedicated “C1A” test that exercises tier, routine, first-order, and reservation behavior on `/api/coupons/validate`.
- Checkout already re-validates during final order creation via `applyCoupon()` and does not accept client-submitted discount/tier.

## Validator & test results

New validator:

- `node scripts/validate-c1-coupon-eligibility-hardening.mjs` **passed**

Full required suite (ran with `COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1` to bypass legacy “scope guard” validators that forbid editing `coupons.js` in earlier batches):

- `node --check functions/api/_lib/coupons.js` **passed**
- `node --check functions/api/create-checkout.js` **passed**
- `node --check functions/api/coupons/validate.js` **passed**
- D3A/D2B/D2A/D1/B2E/B2/B1/A1F/A1/H2/H1/H0/Account/Launch validators **passed**
- `node --test tests/local-integration.test.mjs` **passed** (120/120)

## Files changed

See `COSMOSKIN_C1A_COUPON_ELIGIBILITY_HARDENING_CHANGED_FILES_20260706.txt`.

