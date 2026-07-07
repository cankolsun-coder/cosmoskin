# COSMOSKIN R1G — Review Moderation updated_at Schema — Rollback Plan

**Date:** 2026-07-07

## When to rollback

- Migration causes unexpected constraint errors
- Moderation still fails after migration
- Unrelated tables affected

## Rollback steps

### Code rollback

Revert R1G commit (migration file + validator + docs). R1F backend/UI remains valid.

### Database rollback (optional, only if needed)

**Do not drop columns if moderation is working.** `updated_at` columns are harmless.

If you must remove added columns (not recommended while triggers exist):

```sql
-- Only if triggers referencing updated_at are removed first
ALTER TABLE public.review_images DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.reviews DROP COLUMN IF EXISTS updated_at;
```

Removing columns while `sync_review_approved_from_status` / `set_updated_at` triggers remain will restore the original error.

Safer rollback: restore previous trigger definitions that do not reference `updated_at` (only if columns are removed).

## Data impact

None. `ADD COLUMN ... DEFAULT now()` preserves existing rows.

## RLS / storage

No rollback needed — migration did not change policies.
