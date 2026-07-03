# COSMOSKIN Batch 1 — Supabase Notes (2026-07-03)

## Migration to run in production

Apply:

```text
supabase/migrations/20260703_batch1_account_safe_functional_fixes.sql
```

Or paste equivalent SQL in Supabase SQL Editor.

## What it creates / alters

### `notification_preferences` (CREATE TABLE IF NOT EXISTS)

- Primary key: `id uuid`
- Unique: `user_id` → `auth.users(id)`
- Columns: `email`, `order_updates`, `cargo_updates`, `campaign_emails`, `sms_notifications`, `stock_notifications`, `routine_reminders`, `newsletter`, `created_at`, `updated_at`
- RLS enabled with owner-only SELECT / INSERT / UPDATE policies on `auth.uid() = user_id`

### `profiles` (ADD COLUMN IF NOT EXISTS)

- `birthday_change_count integer NOT NULL DEFAULT 0`
- `birthday_last_changed_at timestamptz`
- `birth_date_locked boolean DEFAULT false` (idempotent re-add)

## Pre-deploy verification

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'notification_preferences';
```

If the table already exists from manual `COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql`:

- `CREATE TABLE IF NOT EXISTS` is a no-op for structure.
- RLS policy drops/recreates are safe and idempotent.
- Compare columns; add any missing via separate `ADD COLUMN IF NOT EXISTS` if schemas diverged.

## Post-deploy smoke test

1. Log in → **Bildirim Tercihlerim** → toggle all 7 prefs including SMS → save → hard refresh → values persist.
2. **Hesap Bilgilerim** → add birthday → save → change once → field locks → third change rejected by API.
3. **Kuponlarım** on a non-birthday date → BIRTHDAY10 not listed; on birthday date with unused year quota → BIRTHDAY10 listed.

## Not in this migration

- No `profiles.marketing_sms_opt_in` (intentionally omitted; SMS lives in `notification_preferences` only).
- No loyalty ledger writer, order cancellation, or club spend RPC changes.

## Rollback note

Do not drop `notification_preferences` in production if rows exist. To revert API behavior only, redeploy prior Functions build; table can remain unused.
