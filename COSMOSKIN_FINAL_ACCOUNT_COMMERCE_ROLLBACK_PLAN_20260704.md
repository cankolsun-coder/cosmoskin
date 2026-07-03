# COSMOSKIN Final Rollback Plan — Post-Batch 4

**Date:** 2026-07-04
**Principle:** Every migration in this release is additive (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT
EXISTS`, `CREATE OR REPLACE FUNCTION`). Nothing destructive was introduced, so rollback is primarily a matter of
reverting application code (fast, safe, no data loss) rather than reversing schema changes (slower, and only
needed in extreme cases).

## Rollback tiers (fastest/safest first)

### Tier 0 — Static asset revert (Batch 2/4 frontend issues only)

If an issue is isolated to `assets/account-dashboard.js` or `assets/account-premium.css` (e.g. a Club UI display
bug), revert just those two files to their pre-Batch-4 (or pre-Batch-2, as needed) git state and redeploy the
static assets. No API or database change required. Fastest possible rollback — minutes.

```bash
git checkout <last-good-commit> -- assets/account-dashboard.js assets/account-premium.css
```

### Tier 1 — Application code revert (Cloudflare Pages Functions)

If an issue is in a specific API route (e.g. `functions/api/account/summary.js` returning wrong points), revert
that single file (or the small set of files for the affected batch) and redeploy:

| Batch | Files to revert for a full batch rollback |
|---|---|
| Batch 1 | `functions/api/account/profile.js`, `functions/api/account/notifications.js`, `functions/api/_lib/coupons.js`, `functions/api/account/summary.js` (birthday/coupon fields only), `assets/account-dashboard.js` (coupon/birthday sections) |
| Batch 2 | `account/profile.html`, `assets/account-premium.css` (header/overview/security/favorites blocks) |
| Batch 3 | `functions/api/_lib/order-cancellation.js`, `functions/api/account/orders/[id]/cancel.js` (delete the route entirely to disable), `functions/api/account/summary.js` (cancel-eligibility columns), `assets/account-dashboard.js` (cancel UI) |
| Batch 4 | `functions/api/_lib/loyalty-ledger.js`, `functions/api/_lib/loyalty-config.js`, the loyalty hook lines in `iyzico-callback.js` / `admin/orders.js` / `admin/orders/[id]/status.js` / `admin/refunds.js` / `admin/returns.js`, `functions/api/account/{summary,membership,points}.js`, `functions/api/loyalty/redeem.js`, `functions/api/cron/birthday-benefits.js`, `assets/account-dashboard.js` (Club UI) |

Since the underlying tables/columns/RPCs from the corresponding migration remain in place (additive-only), reverted
code simply stops calling the new RPCs/columns — this is safe and doesn't orphan data.

### Tier 2 — Disable a single feature without a full code revert

- **Batch 3 (disable customer cancellation):** delete or short-circuit
  `functions/api/account/orders/[id]/cancel.js` to return a 503/"özellik geçici olarak kapalı" response. The
  frontend cancel buttons will still render (since `orderCancelEligibility` reads `summary.js` fields, which stay
  intact), so also hide them by having `summary.js` stop populating cancel-eligibility fields temporarily, or hide
  the buttons via `assets/account-dashboard.js` as an even smaller patch. No schema change needed either way.
- **Batch 4 (disable new point earning without losing existing data):** remove or comment out the
  `awardOrderPoints(...)` / `promoteOrderPoints(...)` / `reverseOrderPoints(...)` call sites in
  `iyzico-callback.js` and the admin files. Existing ledger rows are untouched; no new rows get created until
  hooks are restored. The Club UI will simply stop showing new activity but will still correctly display whatever
  is already in the ledger.

### Tier 3 — Schema rollback (only if a migration itself is found to be harmful — none currently known)

None of the four migrations in this release (`20260703_batch1_...`, `20260703_batch3_...`, `20260704_batch4_...`)
were flagged as harmful in this audit. If a schema rollback is ever required regardless:

```sql
-- Batch 1 (only if notification_preferences must be fully removed — NOT recommended if any
-- customer has already saved preferences, since this is a hard data loss):
-- DROP TABLE IF EXISTS public.notification_preferences CASCADE;
-- (Prefer leaving the table in place and just reverting the API/frontend code instead — Tier 1.)

-- Batch 3 (columns are nullable and additive; safe to leave in place even if the feature is disabled):
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS cancel_reason;
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS cancel_requested_at;
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS cancelled_by;
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS cancel_request_reason;
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS cancellation_status;
-- (Not recommended — dropping columns that already hold real cancellation data is destructive and
-- irreversible. Prefer Tier 1/2 for Batch 3 rollback.)

-- Batch 4 (RPCs can be dropped without touching data; the underlying loyalty_points_ledger table
-- and its rows are never touched by dropping these functions):
-- DROP FUNCTION IF EXISTS public.cosmoskin_award_loyalty_for_order(uuid);
-- DROP FUNCTION IF EXISTS public.cosmoskin_promote_loyalty_for_order(uuid);
-- DROP FUNCTION IF EXISTS public.cosmoskin_promote_due_loyalty_points(integer);
-- DROP FUNCTION IF EXISTS public.cosmoskin_reverse_loyalty_for_order(uuid, text, numeric, text);
-- DROP FUNCTION IF EXISTS public.cosmoskin_loyalty_balance_for_user(uuid);
-- DROP FUNCTION IF EXISTS public.cosmoskin_order_points_basis(uuid);
-- (recalculate_customer_membership existed before Batch 4 — do NOT drop it; instead restore its
-- prior CREATE OR REPLACE body from the 20260626_production_launch_readiness.sql migration if a
-- full revert of the tier-calculation logic is required.)
```

**Recommendation: never execute the Tier 3 statements unless a genuine data-integrity emergency requires it.**
Tier 0–2 (code-only) rollbacks fully cover every realistic failure scenario for this release because every schema
change is additive and nullable/defaulted.

## Manual backfill rollback

If `supabase/scripts/manual/backfill_loyalty_purchase_points_20260704.sql` is run and produces unwanted results,
the inserted rows are all standard `loyalty_points_ledger` rows with `event_type = 'purchase'` and can be
identified and reversed the same way any purchase-earn row is reversed — via
`cosmoskin_reverse_loyalty_for_order(order_id, reason, 1, 'admin')` per affected order — rather than a raw
`DELETE`, so the audit trail stays intact.

## Post-rollback verification

After any rollback tier, re-run:

```
node scripts/validate-account-batch-1-safe-fixes.mjs
node scripts/validate-account-batch-3-order-cancellation.mjs
node scripts/validate-account-batch-4-loyalty-ledger.mjs
node scripts/validate-account-ui-polish.mjs
node scripts/validate-account-runtime-hotfix.mjs
node scripts/validate-account-experience-final-polish.mjs
node scripts/validate-checkout-payment-email-e2e.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

Note: validators for a batch that was intentionally rolled back (e.g. Batch 4 hooks removed) will start failing
their own batch-specific checks by design — that's expected and simply confirms the rollback took effect. The
important signal is that **all other batches' validators + `local-integration.test.mjs` still pass**, confirming
the rollback didn't collaterally break anything else.

Audit complete. No new batch started.
