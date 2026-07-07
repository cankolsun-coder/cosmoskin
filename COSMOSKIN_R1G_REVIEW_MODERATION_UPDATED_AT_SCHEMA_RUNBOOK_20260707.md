# COSMOSKIN R1G — Review Moderation updated_at Schema — Runbook

**Date:** 2026-07-07

## Problem

Admin moderation returns: `record "new" has no field "updated_at"`

## Pre-apply verification

```bash
node scripts/validate-r1g-review-moderation-updated-at-schema.mjs
node --test tests/local-integration.test.mjs
```

## Step 1 — Apply migration in Supabase

Run in Supabase SQL Editor:

`supabase/migrations/20260707_r1g_review_moderation_updated_at_fix.sql`

Or via CLI in a controlled environment:

```bash
supabase db push
```

## Step 2 — Verify columns

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('reviews', 'review_images')
  and column_name = 'updated_at';
```

Expect 2 rows.

## Step 3 — Verify triggers

```sql
select c.relname, t.tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'reviews'
  and not t.tgisinternal;
```

Expect `trg_reviews_status_sync` and `trg_reviews_updated_at`.

## Step 4 — Smoke test admin

1. Open `/admin/reviews/`
2. Approve a pending review with image → **Yorumu ve görselleri onayla**
3. On approved review with pending image → **Görseli onayla**
4. Confirm no `updated_at` error in network tab
5. Confirm image visible on PDP after approval

## No Cloudflare deploy required for DB fix

R1F backend already sends correct payloads. Migration unblocks Postgres triggers.

## No storage / RLS changes

This migration only adds columns and re-binds review moderation triggers.
