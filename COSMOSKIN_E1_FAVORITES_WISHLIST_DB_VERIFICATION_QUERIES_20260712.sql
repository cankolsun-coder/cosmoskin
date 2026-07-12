-- COSMOSKIN E1 — user_favorites DB verification (read-only)
-- Run in Supabase SQL editor. Do not apply schema changes from this file.

-- 1) Table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'user_favorites';

-- 2) Columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_favorites'
ORDER BY ordinal_position;

-- 3) Unique constraint on (user_id, product_slug)
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.user_favorites'::regclass
  AND contype = 'u';

-- 4) RLS enabled
SELECT relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid = 'public.user_favorites'::regclass;

-- 5) Policies
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_favorites'
ORDER BY policyname;

-- 6) Duplicate favorites (should return zero rows)
SELECT user_id, product_slug, COUNT(*) AS duplicate_count
FROM public.user_favorites
GROUP BY user_id, product_slug
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 50;

-- 7) Sample recent favorites
SELECT id, user_id, product_slug, product_name, created_at
FROM public.user_favorites
ORDER BY created_at DESC
LIMIT 20;

-- DB1 dependency note:
-- If any query in sections 1-5 fails because the table/policies are missing,
-- apply the idempotent user_favorites block from supabase/commerce-schema.sql
-- as a tracked migration before enabling E1 in production.
