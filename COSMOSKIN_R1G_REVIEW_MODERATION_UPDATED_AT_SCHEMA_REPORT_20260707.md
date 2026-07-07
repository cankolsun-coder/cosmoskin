# COSMOSKIN R1G — Review Moderation updated_at Schema — Report

**Date:** 2026-07-07  
**Batch:** R1G only  
**Status:** Diagnosed, migration prepared, not deployed

## Summary

Admin review moderation still fails in production with:

`record "new" has no field "updated_at"`

After R1F fixed optional-column PATCH payloads, the remaining blocker is a **Postgres trigger vs schema mismatch** on `reviews` and/or `review_images`.

## Section 1 — Failing operations

| Action | Endpoint | Method | Target table | Payload |
|--------|----------|--------|--------------|---------|
| Yorumu ve görselleri onayla | `/api/reviews/admin/:reviewId` | PATCH | `reviews` then `review_images` | `{ status: "approved" }` |
| Görseli onayla | `/api/reviews/admin/:reviewId/images/:imageId` | PATCH | `review_images` | `{ status: "approved" }` |
| Görseli reddet | `/api/reviews/admin/:reviewId/images/:imageId` | PATCH | `review_images` | `{ status: "rejected" }` |

**Supabase/Postgres error:** `record "new" has no field "updated_at"`

### Failure analysis

1. **Review approval** — `PATCH reviews` updates `status`. Trigger `trg_reviews_status_sync` runs `sync_review_approved_from_status()` which executes `NEW.updated_at := NOW()`. If `reviews.updated_at` is missing in live DB → error.

2. **Review approval (step 2)** — `approvePendingReviewImages()` bulk `PATCH review_images`. If live has a `set_updated_at`-style trigger on `review_images` without the column → same error.

3. **Image-level approval** — `PATCH review_images` only. Fails when `review_images` has an `updated_at` trigger but no `updated_at` column.

## Section 2 — Repo schema / trigger findings

### `reviews`

- `supabase/schema.sql` defines `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Triggers:
  - `trg_reviews_updated_at` → `set_updated_at()` → `NEW.updated_at = NOW()`
  - `trg_reviews_status_sync` → `sync_review_approved_from_status()` → `NEW.updated_at := NOW()`
- Live DB may have been created/evolved without `updated_at` while phase51 triggers were applied.

### `review_images`

- Base `CREATE TABLE` has **no** `updated_at` (only `created_at`)
- Phase51 adds moderation columns but **not** `updated_at`
- Live schema (R1D) lists moderation columns but **not** `updated_at`
- Any live `BEFORE UPDATE` trigger referencing `NEW.updated_at` will fail on image moderation PATCH.

### Trigger source files

- `supabase/schema.sql` — `set_updated_at()`, `trg_reviews_updated_at`
- `supabase/phase51_reviews_hardening.sql` — `sync_review_approved_from_status()`, `trg_reviews_status_sync`

## Section 3 — Supabase SQL diagnostics (manual)

Run in Supabase SQL Editor before/after migration:

```sql
-- Diagnostic 1 — columns
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('reviews', 'review_images')
order by table_name, ordinal_position;

-- Diagnostic 2 — triggers
select c.relname as table_name, t.tgname as trigger_name, pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('reviews', 'review_images')
  and not t.tgisinternal
order by c.relname, t.tgname;

-- Diagnostic 3 — trigger functions with updated_at
select n.nspname as schema_name, p.proname as function_name, pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and pg_get_functiondef(p.oid) ilike '%updated_at%'
order by p.proname;

-- Diagnostic 4 — constraints
select c.relname as table_name, con.conname as constraint_name, pg_get_constraintdef(con.oid) as constraint_definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('reviews', 'review_images')
order by c.relname, con.conname;
```

## Section 4 — Chosen fix

**Fix A (preferred):** Add `updated_at` to tables that have triggers writing `NEW.updated_at`.

Production-safe: adding nullable-safe `TIMESTAMPTZ NOT NULL DEFAULT now()` columns does not drop data and aligns with existing trigger functions.

## Section 5 — Migration

**File:** `supabase/migrations/20260707_r1g_review_moderation_updated_at_fix.sql`

- `ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS updated_at ...`
- `ALTER TABLE public.review_images ADD COLUMN IF NOT EXISTS updated_at ...`
- Re-declares `sync_review_approved_from_status()` and `set_updated_at()` + review triggers (idempotent)

**Proof idempotent:** `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`

**No data drops:** no `DELETE`, `TRUNCATE`, or `DROP TABLE`

**RLS/storage unchanged:** migration touches only `reviews` / `review_images` columns and review moderation triggers

## Section 6 — Backend compatibility

`functions/api/reviews/[[path]].js` (R1F):

- Does **not** manually PATCH `updated_at` on reviews or review_images
- Image moderation uses `patchReviewImageRows()` with live-schema retry
- `moderated_by` remains uuid-safe

No additional backend code change required for R1G.

## Section 7 — Admin UI

`admin/reviews/index.html` (R1F):

- **Yorumu ve görselleri onayla** → `PATCH /api/reviews/admin/:reviewId`
- **Görseli onayla** → `PATCH /api/reviews/admin/:reviewId/images/:imageId` with `{ status }`
- Review id + image id present on buttons

No UI change required for R1G.

## Regression proof

R1G’s focused validator checks the migration, backend/admin wiring, and R1F/R1E/R1D compatibility markers without invoking older migration-free batch validators against an uncommitted R1G migration.

Production launch readiness passes with the new migration present.

## Test results

```bash
node --check functions/api/reviews/[[path]].js
node --check js/reviews.js
node scripts/validate-r1g-review-moderation-updated-at-schema.mjs
node scripts/validate-production-launch-readiness.mjs
node --test tests/local-integration.test.mjs
```

**Result:** 154/154 integration tests pass. `node --check admin/reviews/index.html` is not supported by Node because the file extension is `.html`.

## Deployment order

1. Apply migration in Supabase SQL Editor (or `supabase db push` in controlled environment)
2. Verify diagnostics show `updated_at` on both tables
3. Deploy Cloudflare Pages (R1F already committed; R1G is migration + validator/docs)
4. Smoke test admin **Görseli onayla** and **Yorumu ve görselleri onayla**

## Rollback plan

See `COSMOSKIN_R1G_REVIEW_MODERATION_UPDATED_AT_SCHEMA_ROLLBACK_PLAN_20260707.md`.
