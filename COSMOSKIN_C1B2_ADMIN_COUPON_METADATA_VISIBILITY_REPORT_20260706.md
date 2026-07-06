# COSMOSKIN C1B2 — Admin Coupon Metadata & Eligibility Visibility

**Date:** 2026-07-06  
**Batch:** C1B2 only (admin visibility + safe eligibility editing)  
**Status:** Complete — not deployed

---

## Summary

C1B2 improves admin coupon management so eligibility rules, exclusions, canonical discount fields, and usage stats are visible from `/admin/coupons.html`. Minimal editing of `metadata.eligibility` and exclusion columns is supported via the existing PATCH endpoint. Checkout enforcement remains unchanged: `validateCouponEligibility()` is still the sole server-side gate.

**Editing implemented:** Yes — minimal eligibility + exclusion editing on existing PATCH flow (not a new coupon management system).

---

## Files changed

| File | Change |
|------|--------|
| `functions/api/_lib/coupon-admin.js` | **Created** — admin enrichment, usage stats, safe PATCH builder |
| `functions/api/_lib/coupons.js` | Exported shared `resolveCouponPresentation`, metadata sanitization, exclusion normalization, field-conflict detection |
| `functions/api/admin/coupons/index.js` | GET returns enriched `admin` view; PATCH merges sanitized eligibility/exclusions |
| `assets/admin-coupons.js` | Detail panel with Turkish labels + eligibility edit form |
| `admin/coupons.html` | Expanded table columns + detail panel styles |
| `scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs` | **Created** — C1B2 scope validator |
| `scripts/validate-a1-admin-endpoint-coverage.mjs` | Exempt `admin/coupons/index.js` byte-diff (C1B2-owned) |
| `tests/local-integration.test.mjs` | Added `C1B2` integration test |

---

## Metadata eligibility behavior

- **Display:** `resolveCouponPresentation()` uses the same resolver stack as checkout (`resolveCouponEnvelope` + `resolveEligibilitySpec`).
- **Rule source labels:**
  - `metadata.eligibility` present → `Kural kaynağı: metadata`
  - Launch `APPROVED_RULES` fallback → `Kural kaynağı: sistem varsayılanı`
  - Otherwise → `Kural kaynağı: veritabanı`
- **PATCH merge:** `sanitizeEligibilityMetadataPatch()` merges into existing `metadata`, preserves unknown top-level keys (`scope`, `extra`, etc.).
- **Validation:** `allowed_tiers` limited to `essential`, `signature`, `elite`; invalid values return HTTP 400.
- **Booleans:** Saved as real booleans; `requires_birthday: true` also sets `requires_birthday_month: true` for checkout compatibility.

---

## Exclusion visibility behavior

- Admin detail shows **Hariç tutulan ürünler** and **Hariç tutulan kategoriler** from resolved coupon columns.
- PATCH normalizes lists: trim, lowercase, dedupe, drop empty.
- UI copy clarifies lists are **exclusions**, not inclusions.
- Partial-exclusion customer notice shown for admin context: `Bu kupon bazı ürünlerde geçerli değildir.`

---

## Canonical resolver display

Admin shows:

| Field | Resolver |
|-------|----------|
| Kanonik tip | `discount_type ?? type` |
| Kanonik değer | `discount_value ?? value` |
| Maks. indirim | `max_discount_amount ?? max_discount` |

When legacy and canonical columns disagree, admin shows:

> Bu kuponda eski ve yeni indirim alanları farklı. Checkout kanonik alanı kullanır.

PATCH writes both canonical and legacy discount columns when discount fields change.

---

## Old/new field conflict behavior

`detectDiscountFieldConflicts()` compares `type` vs `discount_type`, `value` vs `discount_value`, `max_discount` vs `max_discount_amount`. Conflicts surface in `admin.field_conflicts` and the Turkish warning above. Checkout always uses canonical resolved values.

---

## Admin permissions

| Endpoint | Permission |
|----------|------------|
| `GET /api/admin/coupons` | `coupons:read` |
| `POST /api/admin/coupons` | `coupons:manage` |
| `PATCH /api/admin/coupons` | `coupons:manage` |

Admin auth/RBAC files were not modified.

---

## Proof checkout validation did not change

- `validateCouponEligibility()` body unchanged for C1B2 scope (only additive exports at file end).
- `create-checkout.js` and `coupons/validate.js` untouched.
- Integration test confirms ELITE100 still blocks Essential tier at `/api/coupons/validate`.
- C1A/C1B1 validators pass with `COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1`.

---

## Proof C1A/C1B1 did not regress

| Check | Result |
|-------|--------|
| `validate-c1-coupon-eligibility-hardening.mjs` | PASS |
| `validate-c1b-coupon-exclusions-metadata.mjs` | PASS |
| C1A integration test (tier/routine/first-order) | PASS |
| C1B1 allocation + exclusion tests | PASS |
| D3A / D2B / D2A / D1 chained validators | PASS |

---

## Test results

```
node --check functions/api/_lib/coupons.js                          OK
node --check functions/api/create-checkout.js                       OK
node --check functions/api/_lib/order-pricing-snapshot.js           OK
node scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs     PASS
node scripts/validate-c1b-coupon-exclusions-metadata.mjs            PASS
node scripts/validate-c1-coupon-eligibility-hardening.mjs           PASS (COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1)
node scripts/validate-d3-refund-snapshot-persistence.mjs            PASS
node scripts/validate-d2b-refund-discount-proration.mjs             PASS
node scripts/validate-d2-refund-amount-correctness.mjs              PASS
node scripts/validate-d1-returns-refunds-correctness.mjs            PASS
node scripts/validate-production-launch-readiness.mjs               PASS
node --test tests/local-integration.test.mjs                      123/123 PASS
```

---

## Deferred

- Full coupon editor redesign → C1B3+ (per plan)
- Ops SQL seeding of `metadata.eligibility` for launch coupons → runbook only, no migration
- `limit_period` strict enforcement beyond admin visibility → future batch

---

## Rollback

See `COSMOSKIN_C1B2_ADMIN_COUPON_METADATA_VISIBILITY_ROLLBACK_PLAN_20260706.md`.
