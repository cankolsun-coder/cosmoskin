# COSMOSKIN Batch 1 Safe Functional Fixes — Report (2026-07-03)

## Summary

Batch 1 implements safe account functional fixes: coupon display parity, birthday correction rules, notification preference persistence, and project memory — without touching order cancellation, loyalty ledger, CSS consolidation, header parity, favorites merge, checkout, returns, or admin flows.

## Changed files

See `COSMOSKIN_BATCH_1_SAFE_FUNCTIONAL_FIXES_CHANGED_FILES_20260703.txt`.

## What changed

### Coupons (account UI + backend rule)

- Fixed broken link: `/ödeme ekranı.html` → `/checkout.html` (label remains **Ödeme Ekranı**).
- Removed all customer-facing **Koşullu** / **KOŞULLU AVANTAJLAR** copy and locked-coupon section.
- **WELCOME10:** Shown only when no successful order (`burnsWelcomeCoupon` aligned with backend); manual checkout entry only.
- **BIRTHDAY10:** Backend and frontend now require **actual birthday date** (not whole month). Optional `birthday_window_days` on rule for future short windows (default `0`). Hidden when ineligible; profile reminder instead of copyable placeholder code.

### Birthday profile

- First save does not consume correction right.
- One real change after birthday exists → `birthday_change_count` increments, `birth_date_locked = true`.
- Re-saving same date does not increment count.
- Server returns friendly Turkish errors; no raw Supabase messages.

### Notifications

- New migration creates `notification_preferences` with RLS.
- API writes/reads preferences from that table only; removed `profiles.marketing_sms_opt_in` fallback.
- Customer messages: success / failure copy per Batch 1 spec.

### Summary API

- Exposes `birthday`, `birthday_change_count`, `birthday_last_changed_at`, `birth_date_locked`.
- Normalized `notification_preferences` object and `coupon_eligibility` flags for dashboard display.

### Docs / validation

- Added `COSMOSKIN_PROJECT_MEMORY.md`.
- Added `scripts/validate-account-batch-1-safe-fixes.mjs`.
- Tightened `scripts/validate-account-experience-final-polish.mjs` (no Koşullu, `/checkout.html`, birthday-date guards).

## Tests run

| Command | Result |
|---|---|
| `node --check assets/account-dashboard.js` | PASS |
| `node --check functions/api/account/profile.js` | PASS |
| `node --check functions/api/account/notifications.js` | PASS |
| `node --check functions/api/account/summary.js` | PASS |
| `node --check functions/api/_lib/coupons.js` | PASS |
| `node scripts/validate-account-batch-1-safe-fixes.mjs` | PASS |
| `node scripts/validate-account-runtime-hotfix.mjs` | PASS |
| `node scripts/validate-account-experience-final-polish.mjs` | PASS |
| `node scripts/validate-production-launch-readiness.mjs` | **FAIL** (pre-existing: missing `.env.example`) |
| `node --test tests/local-integration.test.mjs` | **18/20 PASS** — 2 failures also due to missing `.env.example` (unrelated to Batch 1) |

## Supabase migration

Run in production:

```text
supabase/migrations/20260703_batch1_account_safe_functional_fixes.sql
```

Details: `COSMOSKIN_BATCH_1_SAFE_FUNCTIONAL_FIXES_SUPABASE_NOTES_20260703.md`

## Risks remaining (deferred)

- Loyalty points still not written on order payment; Club display may use client fallback.
- `recalculate_customer_membership` RPC may still sum shipping-inclusive totals.
- Favorites heart/count desync between `app.js` and dashboard.
- Account header not at homepage parity.
- Overview/Security CSS cascade debt in `account-premium.css`.
- Customer order cancellation not implemented.
- Production `.env.example` absent — causes unrelated validator/integration failures.

## Manual QA recommended

With `npx wrangler pages dev . --compatibility-date=2024-06-01`:

1. Notifications: all 7 toggles persist after refresh.
2. Birthday: add → one edit → lock → API rejects further edits.
3. Coupons: BIRTHDAY10 only on birthday; WELCOME10 gone after paid order.

Batch 1 complete. Batch 2+ not started.
