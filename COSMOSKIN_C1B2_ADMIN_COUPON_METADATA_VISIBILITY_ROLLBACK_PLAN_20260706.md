# C1B2 Rollback Plan — Admin Coupon Metadata Visibility

## When to rollback

- Admin coupon GET/PATCH returns 500 after deploy.
- Metadata edits wipe unrelated keys or accept invalid tiers in production.
- Admin UI breaks coupon list rendering on `/admin/coupons.html`.

Checkout coupon enforcement is independent; rolling back C1B2 does **not** remove C1A/C1B1 server protections if those files are left intact.

## Fast rollback (revert C1B2 only)

```bash
git revert <c1b2-commit-sha>
# redeploy Cloudflare Pages as usual
```

Or restore these paths from pre-C1B2 commit:

- `functions/api/_lib/coupon-admin.js` (delete)
- `functions/api/_lib/coupons.js` (remove C1B2 exports only if keeping C1A/C1B1)
- `functions/api/admin/coupons/index.js`
- `assets/admin-coupons.js`
- `admin/coupons.html`
- `scripts/validate-c1b2-admin-coupon-metadata-visibility.mjs` (delete)
- `scripts/validate-a1-admin-endpoint-coverage.mjs` (remove coupons/index exempt)
- `tests/local-integration.test.mjs` (remove C1B2 test block)

## Partial rollback options

| Symptom | Action |
|---------|--------|
| UI only broken | Revert `admin-coupons.js` + `coupons.html`; keep API enrichment |
| PATCH unsafe | Revert `coupon-admin.js` PATCH builder; keep read-only GET enrichment |
| Validator noise | Revert `validate-a1-admin-endpoint-coverage.mjs` exempt entry |

## Data impact

- C1B2 does not run migrations.
- Metadata/exclusion edits made via admin PATCH persist in `coupons` table — rollback code does not undo DB writes.
- If bad metadata was saved, restore rows from backup or manual SQL correcting `metadata.eligibility` / exclusion columns.

## Verification after rollback

```bash
export COSMOSKIN_ALLOW_C1A_COUPON_HARDENING=1
node scripts/validate-c1-coupon-eligibility-hardening.mjs
node scripts/validate-c1b-coupon-exclusions-metadata.mjs
node --test tests/local-integration.test.mjs
```

Confirm checkout coupon validation still works for WELCOME10, ROUTINE5, ELITE100, SIGNATURE75.

## Forward fix

Re-apply C1B2 with targeted fix rather than full rollback if only PATCH sanitization or UI rendering is at fault.
