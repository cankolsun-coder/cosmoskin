# C1B2 Runbook — Admin Coupon Metadata Visibility

## Preconditions

- C1A and C1B1 deployed or present in branch.
- Admin user has `coupons:read` (view) and `coupons:manage` (edit).
- Cloudflare Access + admin token/session per existing admin contract.

## Local verification

```bash
export COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1

node --check functions/api/_lib/coupons.js
node --check functions/api/_lib/coupon-admin.js
node --check functions/api/admin/coupons/index.js
node --check assets/admin-coupons.js

node scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs
node scripts/validate-c1b-coupon-exclusions-metadata.mjs
node scripts/validate-c1-coupon-eligibility-hardening.mjs
node scripts/validate-d3-refund-snapshot-persistence.mjs
node scripts/validate-d2b-refund-discount-proration.mjs
node scripts/validate-d2-refund-amount-correctness.mjs
node scripts/validate-d1-returns-refunds-correctness.mjs
node scripts/validate-production-launch-readiness.mjs

node --test tests/local-integration.test.mjs
```

Full API flow (includes `/api/admin/coupons`):

```bash
npx wrangler pages dev . --compatibility-date=2024-06-01
```

Open `/admin/coupons.html`, load coupons, expand **Detay** on WELCOME10 / ROUTINE5 / ELITE100.

## Admin UI usage

1. **Load coupons** — table shows canonical type/value, rule source, tier summary.
2. **Detay** — full eligibility, exclusions, usage counts, conflict warning if legacy/canonical fields differ.
3. **Uygunluk düzenleme** — edit checkboxes, tier CSV, exclusion CSV; saves via PATCH.
4. Invalid tier (e.g. `platinum`) → API 400 with Turkish error.

## API contract (enriched GET)

Each coupon includes `admin` object from `resolveCouponPresentation()` plus `usage`:

```json
{
  "admin": {
    "canonical": { "coupon_type": "percent", "coupon_value": 10, "coupon_max_discount": 150 },
    "eligibility": { "requires_auth": true, "allowed_tiers": ["elite"], ... },
    "rule_source_label": "Kural kaynağı: metadata",
    "field_conflicts": { "has_conflict": false, "warning": null },
    "usage": { "total_used_count": 1, "active_reserved_count": 0, "last_used_at": "..." }
  }
}
```

## PATCH fields (manage permission)

- `eligibility` partial (merged into `metadata.eligibility`)
- `excluded_product_slugs`, `excluded_categories` (normalized arrays)
- Existing fields: `is_active`, `title`, discount fields, limits, dates

Raw `metadata` blob from client is **not** accepted on POST/PATCH.

## Ops note: seed launch coupon metadata (optional, out of band)

Recommended one-time SQL (not in this batch):

```sql
-- Example only — run via approved ops process, not auto-migration
UPDATE coupons SET metadata = metadata || '{"eligibility":{"requires_auth":true,"requires_first_order":true}}'::jsonb
WHERE code = 'WELCOME10';
```

## Validator env var

When `functions/api/_lib/coupons.js` differs from HEAD, chained validators require:

```bash
export COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1
```

`functions/api/admin/coupons/index.js` is exempt in A1.2 byte-diff check as of C1B2.

## Post-deploy smoke

1. GET `/api/admin/coupons` — enriched rows, no 500.
2. ROUTINE5 shows `requires_smart_routine: true` (metadata or system default).
3. ELITE100 shows `allowed_tiers: ["elite"]`.
4. Customer checkout still rejects ELITE100 for Essential tier (manual coupon entry).
