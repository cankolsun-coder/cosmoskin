# COSMOSKIN Batch 4 — Supabase / Deployment Notes

**Date:** 2026-07-04

## What must be deployed for Batch 4 to be fully live

1. **SQL migration (Step 1):** `supabase/migrations/20260704_batch4_loyalty_ledger.sql`
   Additive only — new/replaced functions, no destructive changes. Safe to run on production once reviewed.
   Adds: `cosmoskin_order_points_basis`, `cosmoskin_award_loyalty_for_order`, `cosmoskin_promote_loyalty_for_order`,
   `cosmoskin_promote_due_loyalty_points`, `cosmoskin_reverse_loyalty_for_order`, `cosmoskin_loyalty_balance_for_user`,
   and replaces `recalculate_customer_membership` with a version that reads thresholds from `membership_levels`
   (Signature 6,000 TL / 3 orders, Elite 15,000 TL / 8 orders) instead of hardcoded values.

2. **Backend JS (Step 2):** `functions/api/_lib/loyalty-config.js`, `functions/api/_lib/loyalty-ledger.js`, and the
   modified route files ship with the normal Cloudflare Pages deploy — no separate action needed beyond the usual
   deploy pipeline.

3. **Frontend (Step 3):** `assets/account-dashboard.js` and `assets/account-premium.css` ship with the normal
   static asset deploy — no separate action needed.

4. **Manual backfill (optional, operator-run only):**
   `supabase/scripts/manual/backfill_loyalty_purchase_points_20260704.sql`
   This is **not** run automatically by any migration or deploy step. An operator should run it manually in the
   Supabase SQL editor (or `psql`) after Step 1's migration is live, if historical paid orders should retroactively
   receive purchase-earn ledger rows. It is idempotent (safe to re-run) and only inserts a `purchase` row for
   orders that don't already have one.

## How `has_ledger_history` / `maintenance_note_required` drive the Step 3 UI

`functions/api/account/summary.js` (Step 2) sets these two flags on the `points` object it returns:

- `has_ledger_history`: true if the account has at least one `loyalty_points_ledger` row.
- `maintenance_note_required`: true when the account has paid orders but **no** ledger rows yet (i.e. it predates
  Batch 4 and hasn't been backfilled).

`assets/account-dashboard.js` (Step 3) consumes `maintenance_note_required` only — if true, it renders the exact
required Turkish copy above the point history table:

> "Önceki siparişleriniz için puan yansıtması kontrol ediliyor olabilir. Puan geçmişinizde eksik gördüğünüz bir
> işlem varsa destek ekibimizle iletişime geçebilirsiniz."

No fake points, no invented ledger rows, no invented order history are ever rendered — this note is purely
informational and only appears when the backend explicitly says the account needs the manual backfill.

**Recommendation:** run the manual backfill script once in production after deploying Step 1, then spot-check a
few real customer accounts in `/account/profile.html?tab=club` to confirm the maintenance note disappears and the
point history reflects real historical purchases.

## Points lifecycle recap (for support/ops reference)

1. Order becomes `paid` → `awardOrderPoints()` inserts a `purchase` ledger row with `status = 'pending'`.
2. Order is marked `delivered`/`completed` by admin (or `cosmoskin_promote_due_loyalty_points()` runs via a
   scheduled job, if one is configured outside this repo) → `promoteOrderPoints()` flips that row to
   `status = 'available'`. Only `available` points are redeemable or counted as "Kullanılabilir Puan".
3. Order is cancelled/refunded/returned by admin/system → `reverseOrderPoints()` either flips the original row to
   `status = 'reversed'` (full reversal) or inserts a negative partial-reversal row (proportional refund), or is
   flagged for manual review when the reversal ratio can't be determined automatically (e.g. some return flows).
4. Unpaid direct customer cancellations (Batch 3) never earn points in the first place — no hook fires for that
   path. Paid cancellation *requests* (Batch 3, unshipped) also do not reverse points — only an actual
   admin-confirmed cancellation/refund does.

## Known Step 3 limitation (documented, not fixed in this step)

- If an order referenced by a ledger row falls outside the customer's most recently loaded order list (the
  account summary currently returns a capped/recent order set), the point-history table shows "—" instead of the
  order number for that row instead of doing an extra fetch. This is a display-only limitation — the ledger data
  itself is complete and accurate; only the friendly order-number lookup is best-effort. Fixing this would require
  either expanding the orders payload in `summary.js` or a dedicated order-number lookup endpoint, which is out of
  scope for a frontend-only Step 3 change.

Batch 4 (Steps 1-3) is complete. No further steps or new batches were started.
