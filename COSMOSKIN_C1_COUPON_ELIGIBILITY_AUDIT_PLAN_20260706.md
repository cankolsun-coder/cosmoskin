# COSMOSKIN — C1: Coupon Eligibility Audit & Abuse Prevention — PLAN

**Date:** 2026-07-06  
**Type:** Investigation + hardening plan only. No code, no migrations, no SQL, no deploy.  
**Scope:** C1 audit — server-side coupon eligibility enforcement and abuse prevention.  
**Builds on:** D3A (`cfd968d` snapshot persistence), D2B (`4e5d15a` discount proration), checkout/coupon stack as deployed.

**Explicitly out of scope for C1 implementation (unless noted as read-only audit):**
- Admin auth / RBAC / JWT / session files
- Payment RPC SQL, bank transfer B1/B2, email sending, inventory, return attachments
- Refund calculation changes (D2A/D2B/D3A read-only regression check only)
- Checkout totals redesign (audit read-only)

---

## 0. Executive summary

COSMOSKIN coupon validation is **partially server-enforced** via `functions/api/_lib/coupons.js` → `validateCouponEligibility()`, called from:

- `POST /api/coupons/validate` (`functions/api/coupons/validate.js`)
- `create-checkout.js` → `applyCoupon()` (authoritative at order creation)
- `GET /api/account/coupons` (eligibility preview for account UI)

**Good:** Checkout recalculates cart from catalog prices, applies discount from server `discountAmount`, reserves coupon at order creation, marks `used` on payment success, releases on payment failure / bank-transfer rejection.

**Critical gaps:**

| Coupon | Server rule present? | Safe if code typed manually? |
|--------|----------------------|------------------------------|
| WELCOME10 | Yes (auth + first paid order) | **Mostly safe** — guest blocked; email/order cross-check |
| ELITE100 | Yes (tier via `customer_membership_status`) | **Mostly safe** — guest blocked; tier from DB |
| SIGNATURE75 | Yes (tier signature + elite) | **Mostly safe** — guest blocked |
| BIRTHDAY10 | Yes (birthday month/day + once/year) | **Mostly safe** — guest blocked; birthday from profile |
| **ROUTINE5** | **No Smart Routine check** | **UNSAFE** — any customer/guest meeting min subtotal can use code |
| COSMOSKIN10 | Yes (`DEPRECATED_COUPONS` + DB inactive) | **Safe** |

**Additional systemic gaps:** `stackable`, `excluded_product_slugs`, `excluded_categories` exist in DB but are **not enforced**; `per_customer_limit` ignores `reserved` for non-WELCOME coupons; eligibility rules are split between **hardcoded `APPROVED_RULES`** and **`coupons.metadata`** (metadata not authoritative); admin UI uses legacy `type`/`value` fields only.

**C1 recommendation:** Introduce a single **canonical coupon resolver** + **eligibility engine** used by validate + checkout + account coupons, with explicit `allowed_tiers` in `coupons.metadata.eligibility`, and close ROUTINE5 / reservation / exclusion / stackability gaps.

---

## 1. Current coupon flow (end-to-end)

```
┌─────────────────┐     POST /api/coupons/validate      ┌──────────────────────────┐
│ checkout-flow.js│ ───────────────────────────────────► │ coupons/validate.js      │
│ (client cart    │     subtotal from client cart       │ → validateCouponEligibility│
│  prices)        │     + optional auth token           └───────────┬──────────────┘
└────────┬────────┘                                                  │
         │ coupon_code only (no client discount)                       │
         ▼                                                            │
┌─────────────────┐     applyCoupon()                                 │
│ create-checkout │ ──────────────────────────────────────────────────┘
│ normalizeCart() │     subtotal from catalog prices (trusted)
│ calculateTotals │     discount = server discountAmount
│ recordCouponUsage(status=reserved)
└────────┬────────┘
         │ order created with orders.discount_amount, coupon_code
         ▼
┌─────────────────────────┐     status → used          ┌─────────────────────┐
│ commerce-finalization.js│ ◄── payment success ────────│ iyzico-callback / B1 │
│ finalizeCommerceAfterPayment                         └─────────────────────┘
│ release on failure/rejection
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ D2B/D3A refunds.js      │  reads orders.discount_amount + order_items snapshots
│ (read-only for C1)      │  — no coupon re-validation at refund time
└─────────────────────────┘
```

**Authoritative enforcement point:** `create-checkout.js` → `applyCoupon()` → `validateCouponEligibility()`.

**Preview-only path:** `/api/coupons/validate` — same eligibility function but subtotal may come from client cart; min-subtotal check is **skipped when subtotal = 0** (used intentionally by account coupon list).

---

## 2. Exact files inspected

| File | Role |
|------|------|
| `functions/api/_lib/coupons.js` | **Core** — `APPROVED_RULES`, `validateCouponEligibility`, `couponEnvelope`, tier/birthday/welcome logic |
| `functions/api/coupons/validate.js` | Public validate API + `calculateCouponPreview` |
| `functions/api/create-checkout.js` | `applyCoupon`, `calculateTotalsWithCoupon`, `recordCouponUsage`, reservation on order create |
| `functions/api/account/coupons.js` | Account coupon list via eligibility |
| `functions/api/account/summary.js` | Tier display, birthday eligibility hints (UI only) |
| `functions/api/account/profile.js` | Birthday change limits / lock |
| `functions/api/_lib/commerce-finalization.js` | Coupon `used` on payment; release on bank-transfer rejection |
| `functions/api/_lib/loyalty-config.js` | Canonical tier names/thresholds (JS) |
| `functions/api/admin/coupons/index.js` | Admin CRUD — `type`/`value` only |
| `assets/admin-coupons.js` | Admin UI — type, value, min, max; no eligibility rules |
| `assets/checkout-flow.js` | Calls `/api/coupons/validate`; sends `coupon_code` to checkout only |
| `COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql` | Seed coupons `discount_type`/`discount_value`/`metadata` |
| `supabase/migrations/20260626_production_launch_readiness.sql` | `coupons`, `coupon_redemptions`, `customer_membership_status`, `membership_levels`, exclusions/stackable columns |
| `supabase/migrations/20260702_routine_data_sync.sql` | `customer_routine_results` — trusted Smart Routine completion store |
| `functions/api/admin/refunds.js` | D2B/D3A — reads `orders.discount_amount` (regression: no change needed) |

---

## 3. Coupon field consistency

### 3.1 Schema fields (coexist)

| Field group | Columns | Used by |
|-------------|---------|---------|
| **Legacy** | `type`, `value`, `max_discount`, `min_subtotal` | `schema.sql` base; **admin API/UI** (`payloadFrom` writes `type`/`value`) |
| **New** | `discount_type`, `discount_value`, `max_discount_amount`, `min_subtotal` | Launch seed SQL; **`couponEnvelope()` resolver** |
| **Policy** | `stackable`, `excluded_product_slugs`, `excluded_categories`, `metadata` | DB only — **not enforced in eligibility** |
| **Redemption** | `coupon_redemptions.status` (`reserved`/`used`/`released`) | Checkout + finalization |

### 3.2 Which layer uses which fields

| Consumer | discount type/value | min subtotal | max discount | eligibility rules |
|----------|---------------------|--------------|--------------|-------------------|
| `couponEnvelope()` | `rule ?? discount_type ?? type` | `rule ?? min_subtotal` | `rule ?? max_discount_amount ?? max_discount` | **`APPROVED_RULES` in code** |
| Admin POST/PATCH | writes `type`, `value`, `max_discount` | `min_subtotal` | `max_discount` | **not written** |
| DB seed (launch fix) | `discount_type`, `discount_value` | `min_subtotal` | `max_discount_amount` | `metadata` JSON (tier, flags) — **not read by engine** |
| Checkout | via `validateCouponEligibility` → `discountAmount` | server cart subtotal | capped in `discountFor()` | code rules |

### 3.3 Conflict risk

- Admin creates coupon with `type=percent`, `value=10` but leaves `discount_type`/`discount_value` stale → `couponEnvelope` may prefer **code rule** for approved codes, DB for others → inconsistent.
- `type` values: schema allows `percent|fixed|free_shipping`; seed uses `amount` for fixed — `couponEnvelope` uses `discount_type` from rule (`amount`) and `discountFor()` accepts `amount` via `type !== 'free_shipping'` branch.
- **Canonical resolver (proposed):**

```javascript
coupon_type     = discount_type ?? type ?? 'amount'
coupon_value    = discount_value ?? value ?? 0
coupon_max      = max_discount_amount ?? max_discount ?? null
coupon_min      = min_subtotal ?? min_cart_total ?? 0
```

- **Legacy fallback still required** for rows only populated via admin `type`/`value`.
- **Long-term:** admin API should write canonical fields + sync legacy columns for backward compatibility.

---

## 4. Trusted membership tier (audit answers)

### 4.1 Where is the trusted tier stored?

| Source | Table/field | Trust level |
|--------|-------------|-------------|
| **Coupon enforcement** | `customer_membership_status.level_code` | **Used today** — `findMembership()` in `coupons.js` |
| Account display | `customer_membership_status` + `computeTierFromSpend()` fallback | Display may differ if RPC stale |
| Canonical codes | `membership_levels.code` | `essential`, `signature`, `elite` (lowercase) |
| Labels | `Essential Üye`, `Signature Üye`, `Elite Üye` | `loyalty-config.js` |

**Mapping:** DB/API canonical values are **`essential` | `signature` | `elite`** (lowercase). `normalizeTierCode()` maps display strings. Coupon rules use lowercase arrays: `['signature','elite']`, `['elite']`.

### 4.2 Can frontend tier be spoofed?

- Checkout does **not** accept client-submitted tier.
- `validateCouponEligibility` reads `customer_membership_status` server-side only.
- Account summary tier in localStorage (`cosmoskin_account_summary`) is **UI only** — not used by coupon engine.
- **Risk:** stale `level_code` if `recalculate_customer_membership()` lags — mitigated by C1 re-fetch at checkout (already done).

### 4.3 Explicit membership-tier model (required for C1)

**Rule:** Restricted coupons must not be usable by knowing the code alone.

| Coupon | Required `allowed_tiers` | `requires_auth` |
|--------|--------------------------|-------------------|
| ELITE100 | `["elite"]` | true |
| SIGNATURE75 | `["signature", "elite"]` | true |
| BIRTHDAY10 | all tiers (or omit) | true (birthday from profile) |
| ROUTINE5 | all tiers (or omit) | true (routine from DB) |
| WELCOME10 | all tiers (or omit) | true (first-order rule) |

**Tier semantics (explicit):**

- Essential may use only coupons whose `allowed_tiers` includes `essential` (or is empty = all).
- Signature may use coupons that include `signature` — **not** Elite-only.
- Elite may use coupons that include `elite` — **not** Signature-only unless `elite` listed.
- Higher tier does **not** inherit lower-tier coupons unless `allowed_tiers` explicitly lists the higher tier (SIGNATURE75 lists both signature and elite by design).

**Preferred metadata shape:**

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

**Current state:** Tier rules live in **`APPROVED_RULES.tier`** (code), duplicated in DB `metadata.tier` (not enforced from DB). C1 should merge into metadata + code fallback for approved codes until admin can edit metadata.

---

## 5. Per-coupon audit

### 5.1 WELCOME10 — **Mostly safe**

**Intended:** First successful paid order only; min 1000; max discount 150; per customer 1.

**Current backend (`coupons.js` lines 277–284):**

- Requires `user.id` (guest blocked).
- Requires email verified (`email_confirmed_at` / `email_verified`).
- `findOrders()` — rejects if any `successOrder()` exists (user_id **or** email).
- Blocks if any `used`/`reserved` redemption for code.
- Blocks pending reservations.

**Gaps:**

- `successOrder()` is broad (includes `preparing`, `shipped`, etc.) — generally correct for “paid”.
- Cancelled **unpaid** orders should not count — `successOrder` excludes cancelled — **OK**.
- Failed payment: reservation `released` on init failure — **OK**; user can retry WELCOME10.
- **Guest checkout:** blocked (auth required) — document as intentional.
- Generic `per_customer_limit` also applies to `used` only — WELCOME10 has stronger `usedOrReserved` check.

**Verdict:** **Safe** with manual code entry if authenticated. C1: unify reason codes; ensure checkout re-validates (already does).

---

### 5.2 ELITE100 — **Mostly safe**

**Intended:** Elite only; min 2000; fixed 75; auth required.

**Current:** `APPROVED_RULES.ELITE100.tier = ['elite']` → `findMembership()` → `level_code` lowercased.

**Gaps:**

- Essential / Signature rejected — **OK**.
- Guest rejected (`!user?.id`) — **OK**.
- No re-validation at payment finalization — relies on checkout gate — **acceptable** if checkout is only entry.
- Admin cannot see/edit tier rule in UI.

**Verdict:** **Safe** for typed code. C1: move to `metadata.eligibility.allowed_tiers: ["elite"]`.

---

### 5.3 SIGNATURE75 — **Mostly safe**

**Intended:** Signature + Elite; min 1500; fixed 75.

**Current:** `tier: ['signature', 'elite']` — Essential blocked.

**Verdict:** **Safe**. C1: explicit `allowed_tiers` in metadata.

---

### 5.4 BIRTHDAY10 — **Mostly safe with policy nuance**

**Intended:** Birthday month; min 1500; max 150; once per customer.

**Current:**

- Auth required.
- Birthday from `profiles.birthday` / `birth_date` (server).
- `isBirthdayCouponEligible()` — with `birthday_window_days: 0` checks **exact calendar month + day** (not full month only).
- `once_per_calendar_year` — checks `used` redemptions in current year (stronger than `per_customer_limit` alone).
- Account age 30 days OR prior paid order required.

**Gaps:**

- **Policy mismatch:** User spec says “birthday month”; code enforces **birthday day** (stricter). Document and align in C1.
- `per_customer_limit = 1` conflicts with annual intent — mitigated by `usedThisYear` check.
- Birthday change abuse: `account/profile.js` has `birth_date_locked`, change count — coupon engine does not re-check lock at apply time (uses current profile birthday).
- Missing birthday → fail closed — **OK**.

**Verdict:** **Safe** but clarify month vs day. C1: `requires_birthday_month` flag + annual window in eligibility engine.

---

### 5.5 ROUTINE5 — **UNSAFE (critical)**

**Intended:** Only after Smart Routine completion; min 1500; max 100.

**Current:**

- Listed in `APPROVED_RULES` with discount/min/max only.
- **No `requires_smart_routine` check** in `validateCouponEligibility`.
- **No auth requirement** — guest can apply if they know the code and meet min subtotal at checkout.
- Trusted completion store exists: `customer_routine_results` (`completed_at`, `user_id`, `is_active`) — **not queried**.

**Verdict:** **UNSAFE** — manual code entry works without routine completion.

**C1 fix:** Query `customer_routine_results` for `user_id` with `is_active = true` and valid `completed_at`; require auth; reason `smart_routine_required`.

---

### 5.6 COSMOSKIN10 — **Safe**

- In `DEPRECATED_COUPONS`.
- DB seed sets `is_active = false`.
- `validateCouponEligibility` returns inactive before rule evaluation.

**Verdict:** **Safe**.

---

## 6. Generic coupon rules audit

| Rule | Enforced? | Notes |
|------|-----------|-------|
| `is_active` | Yes | DB check |
| `starts_at` / `ends_at` | Yes | |
| `min_subtotal` | Yes at checkout | Skipped when `subtotal=0` on validate API |
| `max_discount` | Yes | `discountFor()` |
| `usage_limit` | Partial | Counts `used` + `reserved` globally |
| `per_customer_limit` | Partial | **`used` only** — not `reserved` (except WELCOME10 special case) |
| `stackable` | **No** | Column exists; single `coupon_code` on order prevents multi-code in one request, but no explicit guard |
| Excluded products/categories | **No** | Columns exist; not in eligibility |
| Free shipping | Partial | Type supported; active coupons are percent/amount |
| Code normalization | Yes | `trim` + `uppercase` |
| Final total ≥ 0 | Yes | `calculateTotalsWithCoupon` |
| Client discount tampering | **No** at checkout | Server `discountAmount` used |
| Client subtotal tampering at checkout | **No** | `normalizeCart` catalog prices |

---

## 7. Stackability

- All launch coupons `stackable = false` (metadata `combinable_with_points: false`).
- Order model: single `coupon_code`, single `discount_amount`.
- **Gap:** No explicit `stackable` check; no protection against future multi-coupon API.
- **C1:** Reject second coupon if order already has `coupon_code`; enforce `stackable === false` in eligibility engine.

---

## 8. Usage limits & race conditions

| Scenario | Current behavior | Risk |
|----------|------------------|------|
| Checkout reserves coupon | `status=reserved` on `coupon_redemptions` | Good |
| Payment success | `status=used` via `finalizeCommerceAfterPayment` | Good |
| Payment init failure | `released` | Good |
| Bank transfer rejection | `released` (B2) | Good |
| Parallel tabs (ROUTINE5) | `per_customer_limit` ignores `reserved` | **Medium** — two reservations possible |
| WELCOME10 parallel | `usedOrReserved` blocks | Good |
| Refund/cancel | Does not auto-reverse coupon `used` | Document business policy |

**C1:** For `per_customer_limit`, count `used` + active `reserved` (non-released) per customer/code.

---

## 9. Minimum subtotal

- Checkout: `baseTotals.subtotal` from `normalizeCart()` — **catalog prices**, pre-shipping — **correct**.
- Validate API: client cart prices — preview only; checkout re-validates.
- Exclusions: not applied to eligible subtotal — **gap** when exclusions implemented.

---

## 10. Product/category exclusions

- DB: `excluded_product_slugs`, `excluded_categories` on `coupons`.
- **Not implemented** in `validateCouponEligibility` or `discountFor`.
- **C1 plan:**
  - If all lines excluded → reject (`product_excluded` / `category_excluded`).
  - If partial → discount base = eligible lines only; allocation must align with D2B/D3A per-line snapshots (eligible `line_total` sum as proration denominator).

---

## 11. D2B/D3A refund consistency (read-only)

- Refunds use `orders.discount_amount` + per-line snapshots — **not** coupon eligibility re-check.
- If a coupon was wrongly applied, refund caps reflect **what was charged** — financially consistent.
- C1 must not change refund modules; fixing coupon abuse prevents future incorrect discounts.
- Partial eligibility exclusions (future) must persist eligible subtotal in order metadata for audit.

---

## 12. Proposed eligibility engine (C1 implementation)

### 12.1 Resolver output

```javascript
{
  allowed: boolean,
  reason_code: string,        // machine enum
  customer_message: string,   // Turkish, professional
  internal_reason: string,    // logs/admin
  eligibility_context: object // tier, routine, birthday, order count
}
```

### 12.2 Reason codes (required)

| Code | Customer message (planned) |
|------|----------------------------|
| `coupon_inactive` | Bu kupon şu anda geçerli değil. |
| `coupon_expired` | Bu kupon şu anda geçerli değil. |
| `coupon_not_started` | Bu kupon şu anda geçerli değil. |
| `min_subtotal_not_met` | Bu kupon için minimum sepet tutarı karşılanmıyor. |
| `membership_required` | Bu kupon hesabınız için uygun değil. |
| `membership_tier_not_allowed` | Bu kupon yalnızca belirli üyelik seviyelerinde kullanılabilir. |
| `birthday_month_required` | Bu kupon doğum günü ayınıza özel olarak kullanılabilir. |
| `smart_routine_required` | Bu kupon Akıllı Rutin tamamlandıktan sonra kullanılabilir. |
| `first_order_required` | Bu kupon hesabınız için uygun değil. |
| `per_customer_limit_reached` | Bu kupon daha önce kullanılmış. |
| `usage_limit_reached` | Bu kupon şu anda geçerli değil. |
| `coupon_not_stackable` | Bu kupon şu anda geçerli değil. |
| `product_excluded` | Bu kupon hesabınız için uygun değil. |
| `category_excluded` | Bu kupon hesabınız için uygun değil. |

Map existing codes (`TIER_NOT_ELIGIBLE`, `FIRST_ORDER_ONLY`, etc.) to canonical enums in C1.

### 12.3 Enforcement points (must all use same engine)

1. `POST /api/coupons/validate`
2. `create-checkout.js` → `applyCoupon()` (**mandatory**)
3. Optional hardening: `finalizeCommerceAfterPayment` assert reserved redemption still valid (defense in depth)

**Never trust:** localStorage tier, client `discount`, client `membership`, client routine flags, coupon title/description.

---

## 13. Admin visibility (gaps & minimal improvements)

**Current admin (`assets/admin-coupons.js`):** code, type, value, min_subtotal, active toggle.

**Missing:**

- `discount_type` / `discount_value` display
- `max_discount`, `per_customer_limit`, `usage_limit`
- Eligibility rule summary (`allowed_tiers`, first order, birthday, routine)
- Total usage / last used (from `coupon_redemptions` aggregate)
- `stackable`, exclusions

**C1 plan (minimal):** Read-only columns in admin table; no full eligibility editor until metadata migration approved.

---

## 14. Migration need assessment

| Change | Migration required? |
|--------|---------------------|
| Eligibility engine in JS | **No** |
| ROUTINE5 / tier from metadata | **No** (read `coupons.metadata`) |
| `allowed_tiers` for new coupons | **No** — use metadata JSON |
| Enforce exclusions/stackable | **No** |
| `per_customer_limit` + reserved fix | **No** |
| Admin eligibility editor | **Optional later** — `metadata` schema documentation |
| Canonical column sync (admin writes `discount_type`) | **Optional** — backfill script, not required for C1 |

**No migration required for C1 core hardening** if rules live in `coupons.metadata.eligibility` + code fallback for seeded coupons.

---

## 15. Test plan (matrix)

### WELCOME10
- [ ] First successful paid order allowed
- [ ] Second paid order rejected
- [ ] Failed/unpaid order does not consume eligibility
- [ ] Cancelled unpaid order does not consume
- [ ] Guest rejected
- [ ] Min subtotal enforced at checkout
- [ ] Max discount cap enforced
- [ ] Reserved blocks parallel checkout
- [ ] Payment failure releases reservation

### ELITE100
- [ ] Elite allowed
- [ ] Signature rejected
- [ ] Essential rejected
- [ ] Guest rejected
- [ ] Min subtotal 2000 enforced
- [ ] Fixed 75 ≤ subtotal
- [ ] Per customer limit enforced (used + reserved)
- [ ] Client tier ignored

### SIGNATURE75
- [ ] Signature allowed
- [ ] Elite allowed
- [ ] Essential rejected
- [ ] Guest rejected
- [ ] Min subtotal enforced

### BIRTHDAY10
- [ ] Birthday day/month policy as aligned
- [ ] Non-birthday rejected
- [ ] Missing birthday rejected
- [ ] Once per calendar year enforced
- [ ] Birthday change lock considered
- [ ] Max discount cap

### ROUTINE5
- [ ] Completed `customer_routine_results` allowed
- [ ] No completion rejected
- [ ] localStorage routine flag ignored
- [ ] Guest rejected (after C1)
- [ ] Per customer limit + reserved

### COSMOSKIN10
- [ ] Inactive rejected
- [ ] Deprecated set rejected

### Membership tier (new)
- [ ] Essential-only coupon (when configured) — Essential OK, Signature/Elite blocked
- [ ] Essential cannot use Elite-only
- [ ] Signature cannot use Elite-only
- [ ] Elite can use Elite-only
- [ ] Elite can use Signature+Elite coupon
- [ ] Guest cannot use membership coupons
- [ ] Client-submitted tier ignored
- [ ] Validate API and checkout same result

### Generic
- [ ] Code normalization (lowercase, spaces)
- [ ] Expired / future / inactive rejected
- [ ] Non-stackable enforcement
- [ ] usage_limit with reserved
- [ ] Excluded product/category (when implemented)
- [ ] Partial eligible cart discount base
- [ ] Total never negative
- [ ] Catalog price tampering at checkout rejected
- [ ] Parallel checkout race
- [ ] D2B/D3A proration unchanged for valid coupon orders

**Validator:** `scripts/validate-c1-coupon-eligibility.mjs` (C1 implementation phase).

---

## 16. Implementation sequence (C1 — do not start in this batch)

```
C1.1  Canonical coupon resolver (single module)
C1.2  Eligibility engine + reason codes + customer messages
C1.3  ROUTINE5 smart routine check (customer_routine_results)
C1.4  Explicit allowed_tiers from metadata + APPROVED_RULES fallback
C1.5  per_customer_limit includes reserved; usage_limit hardening
C1.6  stackable + exclusion enforcement (if product categories in catalog)
C1.7  Wire validate + checkout + account/coupons to same engine
C1.8  Optional: finalizeCommerceAfterPayment defense check
C1.9  Admin read-only eligibility display
C1.10 scripts/validate-c1-coupon-eligibility.mjs + integration tests
C1.11 Deliverables (REPORT, RUNBOOK, ROLLBACK)
```

**Files expected to change (implementation):**

- `functions/api/_lib/coupons.js` (refactor)
- `functions/api/coupons/validate.js`
- `functions/api/create-checkout.js` (thin — calls engine)
- `functions/api/account/coupons.js`
- `assets/admin-coupons.js` (minimal)
- `tests/local-integration.test.mjs`
- `scripts/validate-c1-coupon-eligibility.mjs`

**Not expected to change:** `refunds.js`, payment RPCs, B1/B2, admin auth.

---

## 17. Rollback plan (C1 implementation)

1. Revert C1 commit(s) — JS only if no migration.
2. Eligibility falls back to current `APPROVED_RULES` behavior (including ROUTINE5 gap).
3. Re-run D2B/D3A validators + coupon integration tests.
4. No DB rollback if metadata-only reads added.

---

## 18. Audit question checklist (answers)

| # | Question | Answer |
|---|----------|--------|
| 1 | Where is trusted membership tier stored? | `customer_membership_status.level_code` (`essential`/`signature`/`elite`) |
| 2 | Can frontend tier be spoofed? | No for checkout; tier not accepted from client |
| 3 | Does coupon apply endpoint verify tier server-side? | Yes for SIGNATURE75/ELITE100 via `findMembership()` |
| 4 | Does checkout verify tier again? | Yes — `applyCoupon()` calls same `validateCouponEligibility()` |
| 5 | Are tier coupons configured explicitly? | In code `APPROVED_RULES.tier`; DB metadata duplicates but unused |
| 6 | Title/description tier hints without backend? | UI only — backend uses code rules for tier coupons |
| 7 | Migration needed for `allowed_tiers`? | **No** — use `coupons.metadata.eligibility` |
| 8 | Should metadata be used? | **Yes** — canonical with code fallback for launch coupons |
| 9 | Admin UI need eligibility display? | **Yes** — minimal read-only in C1 |

---

## 19. Stop boundary

**Stop after this plan.** No C1 implementation. No D3B. No coupon redemption behavior change in this batch.

---

## 20. References

- `COSMOSKIN_D3_REFUND_SNAPSHOT_PERSISTENCE_PLAN_20260706.md`
- `COSMOSKIN_D3A_REFUND_SNAPSHOT_PERSISTENCE_REPORT_20260706.md`
- `COSMOSKIN_D2B_REFUND_DISCOUNT_PRORATION_REPORT_20260706.md`
- `COSMOSKIN_PROJECT_MEMORY.md` — coupon backend source of truth
- `COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql` — coupon seeds
