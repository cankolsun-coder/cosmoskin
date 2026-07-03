# COSMOSKIN Batch 4 — Club Loyalty Ledger Completion

**Date:** 2026-07-04
**Scope:** Loyalty ledger, points, tier calculation, Club point history, and related validation only.
**Status:** Complete — Steps 1, 2 and 3 all implemented and validated. Batch stops here per instruction; no new batch started.

---

## Step 1 — SQL migration + RPCs + manual backfill (recap)

- `supabase/migrations/20260704_batch4_loyalty_ledger.sql` — additive migration adding canonical loyalty RPCs:
  `cosmoskin_order_points_basis`, `cosmoskin_award_loyalty_for_order`, `cosmoskin_promote_loyalty_for_order`,
  `cosmoskin_promote_due_loyalty_points`, `cosmoskin_reverse_loyalty_for_order`, `cosmoskin_loyalty_balance_for_user`,
  and an updated `recalculate_customer_membership`. All `SECURITY DEFINER`, advisory-lock guarded, idempotent via
  `ON CONFLICT (transaction_reference) DO NOTHING`.
- `supabase/scripts/manual/backfill_loyalty_purchase_points_20260704.sql` — manual, idempotent backfill for historical
  paid orders with no `purchase` ledger row yet. Not run automatically; includes an operator report query.

## Step 2 — Backend JS loyalty wiring and account API fixes (recap)

- New libraries: `functions/api/_lib/loyalty-config.js` (canonical Essential/Signature/Elite tier config) and
  `functions/api/_lib/loyalty-ledger.js` (non-throwing wrappers around the Step 1 RPCs).
- Loyalty hooks wired into: `iyzico-callback.js` (award on paid), `admin/orders.js` and
  `admin/orders/[id]/status.js` (award/promote/reverse on status transitions), `admin/refunds.js` (proportional
  reversal), `admin/returns.js` (manual-review reversal).
- Account APIs (`summary.js`, `membership.js`, `points.js`, `loyalty/redeem.js`, `cron/birthday-benefits.js`)
  rewritten to remove fictional points fallbacks and read exclusively from the ledger (`status = available` for
  redeemable balance).

## Step 3 — Account Club UI + frontend ledger truth (this delivery)

### What changed

**`assets/account-dashboard.js`**

1. Added a canonical, module-scope `LOYALTY_TIERS` config (`essential` 0 / `signature` 6,000 TL·3 orders / `elite`
   15,000 TL·8 orders) plus `LOYALTY_POINT_STATUS_LABELS` and `LOYALTY_POINT_EVENT_LABELS` Turkish label maps —
   mirrors `functions/api/_lib/loyalty-config.js` exactly (this is a plain `<script>` file, not an ES module, so the
   values are duplicated by design rather than imported; both are validated to stay in sync at 6,000 / 15,000).
2. `normalizeTierName()` — removed the `select`/`silver` string matches and the hardcoded `5000` spend threshold.
   Now only recognizes `elite` / `signature` by code, and falls back to the canonical 6,000 / 15,000 spend
   thresholds when no explicit tier code is present.
3. `loyalty()` — **removed the fictional fallback entirely**:
   `if (!available && spend > 0 && !ledger.length) available = Math.round(spend)` is gone. `available`, `pending`
   and `reversed` are now read only from `summary.points.available/pending/reversed` (the ledger-backed values
   Step 2 already computes server-side via `getLoyaltyBalance`). Tier progress prefers the backend-computed
   `stats.tier.progress` when present, falling back to a canonical-threshold-based local calculation only as a
   defensive path (e.g. very old cached summaries). No more hardcoded `5000`/`15000` progress math.
4. `renderClub()` — the tier cards' displayed range text was corrected from `5.000 TL+` to the canonical `6.000 TL+`
   for Signature (the last remaining stale threshold in the UI).
5. New helpers `pointEventLabel()`, `pointStatusLabel()`, `pointStatusClass()`, `pointHistoryTable()`,
   `pointMaintenanceNote()` replace the old ad-hoc `.cs-point-row` div list with a proper table:
   - Columns: **Tarih, Sipariş No, Açıklama, Puan, Durum** (exactly as specified).
   - Sipariş No is resolved by looking up `p.order_id` against `state.summary.orders` (already loaded for the
     account) via the existing `safeOrderNumber()` helper; shows `—` if the order isn't in the loaded set.
   - Açıklama uses the Turkish event-type map: `purchase` → "Sipariş kazanımı", `redemption` → "Kullanıldı",
     `birthday` → "Doğum günü avantajı", `admin_adjustment` → "Manuel düzenleme", `purchase_partial_reversal` →
     "Kısmi iade düzeltmesi", with `p.reason` as a last-resort fallback.
   - Durum uses the Turkish status map: `pending` → "Beklemede", `available` → "Kullanılabilir", `reversed` →
     "Geri alındı".
   - The table renders **every** row in `state.summary.points.ledger` unconditionally (`ledger.map(...)`, no
     `.filter()`); history is only ever empty when the backend ledger array itself is empty.
6. Maintenance/backfill note — if `summary.points.maintenance_note_required` is true, a neutral note renders above
   the history table with the exact required Turkish copy. No fake ledger rows or invented order history are ever
   created; the note is purely informational.
7. Overview vs. Club consistency — both `statCards()` (Overview "Kullanılabilir Puan") and `renderClub()` (Club
   available/pending/reversed) call the same `loyalty()` function against the same `state.summary` object; there is
   no separate/duplicated calculation path, so the two views cannot drift apart.
8. Redeem UI — confirmed no redeem action/button exists anywhere in `account-dashboard.js` (grepped for
   `redeem`/`loyalty/redeem`). Per instruction, no new redeem UI was added in this step.

**`assets/account-premium.css`**

- Added a single new CSS block marked `BATCH4_LOYALTY_HISTORY` containing only:
  - `.cs-point-history-table` base table styling (spacing, row backgrounds, rounded row ends).
  - `.cs-point-status` badge styling with `.is-pending` / `.is-available` / `.is-reversed` color variants.
  - `.cs-point-maintenance-note` note-box styling.
  - A `max-width:720px` media query that stacks the table into label/value rows for mobile (uses
    `data-label` attributes already emitted by the table markup — no separate mobile render path needed).
- No header, footer, PDP, checkout, favorites, routines, coupons, or security selectors were touched.

### What was intentionally NOT done in Step 3

- No new redeem UI was built (none existed before this step).
- No changes to `account/profile.html`, checkout, `iyzico-callback.js`, or any admin file.
- No changes to Batch 1/2/3 behavior (cancellation, coupons, notifications, birthday logic untouched).
- No fake/backfilled ledger rows were created anywhere — the maintenance note is the only concession for
  historical gaps, and only renders when the backend explicitly flags it.

### Validation

`scripts/validate-account-batch-4-loyalty-ledger.mjs` was extended for Step 3 (see
`COSMOSKIN_BATCH_4_LOYALTY_LEDGER_SUPABASE_NOTES_20260704.md` for the itemized validator changes). Since Step 3 is
explicitly allowed to modify `assets/account-dashboard.js` and `assets/account-premium.css`, both files were
**removed** from the byte-for-byte frozen-hash list and replaced with behavioral assertions instead
(no-fictional-fallback, canonical thresholds present, history renders unconditionally, Turkish labels present,
Overview/Club share one source, no out-of-scope CSS selectors, `Stok kontrolü` regression guard).

### Tests run (all passed)

```
node --check assets/account-dashboard.js
node scripts/validate-account-batch-4-loyalty-ledger.mjs
node scripts/validate-account-batch-1-safe-fixes.mjs
node scripts/validate-account-batch-3-order-cancellation.mjs
node scripts/validate-account-ui-polish.mjs
node scripts/validate-account-runtime-hotfix.mjs
node scripts/validate-account-experience-final-polish.mjs
node scripts/validate-checkout-payment-email-e2e.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

Results: all `node --check` passed with no output (success). All 9 validator scripts printed a `passed` line and
exited 0. `local-integration.test.mjs`: **20/20 tests passed**, 0 failed.

A sanity check was also performed to confirm the new validator rules actually catch regressions: temporarily
reintroducing a `Math.round(spend)`-style fallback into `loyalty()` caused 4 validator checks to fail as expected;
the change was then reverted and the validator passed again cleanly.

---

## Changed files (Step 3)

See `COSMOSKIN_BATCH_4_LOYALTY_LEDGER_CHANGED_FILES_20260704.txt` for the full cumulative list across Steps 1–3.

Step 3 specifically touched:
- `assets/account-dashboard.js` (modified)
- `assets/account-premium.css` (modified)
- `scripts/validate-account-batch-4-loyalty-ledger.mjs` (modified — Step 3 behavioral checks added, frozen-hash
  entries for the two frontend files removed)
- `COSMOSKIN_BATCH_4_LOYALTY_LEDGER_REPORT_20260704.md` (this file)
- `COSMOSKIN_BATCH_4_LOYALTY_LEDGER_CHANGED_FILES_20260704.txt` (updated)
- `COSMOSKIN_BATCH_4_LOYALTY_LEDGER_SUPABASE_NOTES_20260704.md` (updated)

## Deferred / out of scope (unchanged from the approved plan)

- No new redeem UI (none existed; not added).
- No automated iyzico refunds.
- No header/footer/checkout/PDP redesign.
- No production backfill was run — `supabase/scripts/manual/backfill_loyalty_purchase_points_20260704.sql` remains
  a manual, operator-run script only.
- Delivered-at + 14 day auto-promotion still relies on `cosmoskin_promote_due_loyalty_points()` being invoked by a
  scheduled job/cron outside this repo's current cron set, or on admin manually marking orders `completed`
  (documented as a Step 2 risk; unchanged in Step 3, since Step 3 is frontend-only).

Batch 4 stops here. No new batch has been started.
