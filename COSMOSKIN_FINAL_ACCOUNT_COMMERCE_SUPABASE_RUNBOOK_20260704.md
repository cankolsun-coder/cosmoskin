# COSMOSKIN Final Supabase Runbook — Post-Batch 4

**Date:** 2026-07-04

## 1. Migrations — exact production run order

Supabase's migration runner applies files in filename-sort order. The full list below is that exact order,
verified against every file's actual content for cross-file dependencies.

```
 1. 20260418_guest_checkout.sql
 2. 20260510_newsletter_subscribers.sql
 3. 20260510_operations_inventory_orders_shipments.sql
 4. 20260510_phase1_operational_safety.sql
 5. 20260511_phase2_invoice_returns_refunds.sql
 6. 20260511_phase3_compliance_crm_security.sql
 7. 20260517_checkout_bank_transfer_statuses.sql
 8. 20260616_atomic_inventory_reservation.sql
 9. 20260616_inventory_reservation_hardening.sql
10. 20260616_payment_bank_and_callback_hardening.sql
11. 20260616_rls_security_hardening.sql
12. 20260626_production_launch_readiness.sql
13. 20260627_customer_experience_production_patch.sql
14. 20260628_cosmoskin_final_ecommerce_hotfix.sql
15. 20260629_cosmoskin_checkout_bank_transfer_final_fix.sql
16. 20260629_cosmoskin_final_user_acceptance_fix.sql
17. 20260629_cosmoskin_final_user_acceptance_fix_v2.sql
18. 20260629_cosmoskin_post_verification_hotfix.sql
19. 20260702_customer_returns_account_pdp_polish.sql
20. 20260702_routine_data_sync.sql
21. 20260703_account_experience_final_polish.sql
22. 20260703_account_runtime_hotfixes.sql
23. 20260703_batch1_account_safe_functional_fixes.sql      ← Batch 1 (this project)
24. 20260703_batch3_customer_order_cancellation.sql        ← Batch 3 (this project)
25. 20260704_batch4_loyalty_ledger.sql                     ← Batch 4 (this project)
```

**Batch 2 has no migration** — it was CSS/HTML/JS only.

**New for this release (24-25 if 21-23 already ran in production):** if migrations 1–22 are already live in
production (they predate this session and several — 21/22 — were already applied before Batch 1 started per the
existing project state), then only **#23, #24, #25** need to be run for this release:

```
20260703_batch1_account_safe_functional_fixes.sql
20260703_batch3_customer_order_cancellation.sql
20260704_batch4_loyalty_ledger.sql
```

### Same-date ordering note (informational, not a bug)

Files `#21` (`account_experience_final_polish`), `#22` (`account_runtime_hotfixes`), `#23` (`batch1_account_safe_functional_fixes`)
all carry the `20260703` date prefix, and alphabetically `#21`/`#22` sort **before** `#23` even though `#23`
(Batch 1) is the migration that actually `CREATE TABLE IF NOT EXISTS public.notification_preferences`, while `#21`/`#22`
only `ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS ...`.

This was specifically checked and is **safe regardless of order**:
- If `#21`/`#22` run before `#23`: their `ALTER TABLE IF EXISTS` statements silently no-op (table doesn't exist
  yet) — no error, no data loss.
- `#23`'s `CREATE TABLE` already declares every column that `#21`/`#22` would have added
  (`campaign_emails`, `stock_notifications`, `routine_reminders`, `newsletter`, `sms_notifications`,
  `order_updates`, `cargo_updates`), so nothing is missing afterward either way.
- All statements in `#21`/`#22`/`#23`/`#24` use `IF EXISTS` / `IF NOT EXISTS` defensively — verified by direct
  inspection of all four files, not just assumed.

No migration reordering is required. Run in plain filename-sort order.

## 2. Manual backfill script — confirmed manual-only

**File:** `supabase/scripts/manual/backfill_loyalty_purchase_points_20260704.sql`

- Lives under `supabase/scripts/manual/`, **outside** `supabase/migrations/` — Supabase's migration
  runner (`supabase db push` / migration history tracking) does not scan this folder, so it can never be
  auto-applied by a routine deploy.
- Not referenced by any `.sql` migration, any Cloudflare Pages Function, or any cron job in this repo
  (`rg -l "backfill_loyalty_purchase_points"` → only the file itself).
- Idempotent: relies on `cosmoskin_award_loyalty_for_order()`, which only inserts a `purchase` ledger row if one
  doesn't already exist for that order (`ON CONFLICT (transaction_reference) DO NOTHING`); safe to re-run.
- Includes an operator report query to preview affected orders before/after running.

**Action required:** an operator must run this manually via the Supabase SQL editor or `psql`, after migration
`20260704_batch4_loyalty_ledger.sql` is live, if retroactive points for historical paid orders are desired. This is
optional — the account UI already handles the "no history yet" case gracefully with a neutral maintenance note
(no fake points shown).

## 3. Destructive SQL confirmation

Scanned every file in `supabase/migrations/` for `DROP TABLE`, `TRUNCATE`, unguarded `DELETE FROM ... ;` (no
`WHERE`), `DROP SCHEMA`, `DROP DATABASE`:

- **Batches 1, 3, 4 (this release's new migrations): zero destructive statements.** All are `ADD COLUMN IF NOT
  EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `CREATE INDEX IF NOT EXISTS` — fully
  additive.
- **Pre-existing migrations (dated 2026-06-29, before this session):** `20260629_cosmoskin_checkout_bank_transfer_final_fix.sql`,
  `20260629_cosmoskin_final_user_acceptance_fix.sql`, and `20260629_cosmoskin_final_user_acceptance_fix_v2.sql`
  each contain `alter table if exists public.orders drop column if exists {subtotal, shipping_total, vat_total,
  total, grand_total, discount_total} cascade;`. These drop **legacy alias columns** that had already been
  superseded by the canonical `subtotal_amount` / `shipping_amount` / `vat_amount` / `total_amount` /
  `discount_amount` columns in the same migration set — guarded with `IF EXISTS`, and already deployed to
  production before Batch 1 of this session started. This is flagged here for completeness/transparency only; it
  is **not a new issue introduced by Batches 1–4** and is out of this audit's change scope, so it was left
  untouched per the "do not change files unless critical" instruction.

## 4. Secret exposure confirmation

- `.env.example` (new, tracked file) contains **only placeholder values** (e.g. `replace-with-supabase-service-role-key`,
  `replace-with-iyzico-secret-key`) — no live credentials.
- No `SUPABASE_SERVICE_ROLE_KEY`, `IYZICO_SECRET_KEY`, `ADMIN_SESSION_SECRET`, `BREVO_API_KEY`, or similar were
  found hardcoded in any migration, Cloudflare Function, or script — every reference is via `context.env.*` /
  `process.env.*`.
- `supabase/test/20260616_inventory_test_setup.sql` only contains a comment showing the *shape* of an env var
  assignment (`SUPABASE_SERVICE_ROLE_KEY='set-in-shell-only'`) as local test-setup documentation, not a real key.

## 5. Manual Supabase steps checklist for this release

1. Confirm migrations `#1`–`#22` are already applied in production (they predate this session).
2. Run migrations in order: `20260703_batch1_account_safe_functional_fixes.sql` →
   `20260703_batch3_customer_order_cancellation.sql` → `20260704_batch4_loyalty_ledger.sql`.
3. Verify new tables/columns exist: `notification_preferences`, `orders.cancel_reason` /
   `cancel_requested_at` / `cancelled_by` / `cancel_request_reason` / `cancellation_status`, and confirm the six
   new RPCs exist (`\df cosmoskin_*` in `psql`, or Supabase Dashboard → Database → Functions).
4. (Optional) Run `supabase/scripts/manual/backfill_loyalty_purchase_points_20260704.sql` manually if retroactive
   points backfill is desired for historical paid orders. Review its report query output before and after.
5. Spot-check 2–3 real customer accounts in `/account/profile.html?tab=club` post-deploy: confirm point balances
   look sane and the maintenance note (if any) only appears for accounts genuinely missing ledger history.
6. No RLS policy changes were made in Batches 1/3/4 beyond the `notification_preferences` policies created in
   Batch 1 (self-select/insert/update only) — no broader RLS review is required for this release.

Audit complete. No new batch started.
