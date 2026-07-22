-- COSMOSKIN P2 #14 — fix auth_rls_initplan (107 live findings before this
-- migration, 129 originally before the earlier RLS-consolidation pass).
--
-- Standard Supabase/Postgres RLS performance fix: an RLS policy that calls
-- auth.uid() / auth.email() / auth.jwt() / auth.role() directly gets that
-- function re-evaluated once PER ROW. Wrapping the call in a scalar
-- subquery — (select auth.uid()) instead of auth.uid() — lets the planner
-- treat it as an initplan evaluated once per statement. This changes
-- nothing about which rows are visible; auth.uid() returns the same value
-- for the whole statement either way (it reads the JWT claim set once per
-- request), so the boolean result of every qual/with_check expression is
-- identical before and after.
--
-- 104 policies across 55 tables had at least one unwrapped call. Rather
-- than hand-transcribe 104 CREATE POLICY statements (real risk of a typo
-- silently changing a condition), this reads each policy's own live
-- qual/with_check text from pg_policies, regex-wraps only the bare
-- auth.<fn>() calls (verified beforehand: zero policies had a mix of
-- wrapped and unwrapped calls, so the "not already wrapped" filter cannot
-- double-wrap or skip anything), and reapplies it via ALTER POLICY — so
-- every rewritten policy is Postgres's own round-trip of what was already
-- live, not something retyped by hand. Dry-run reviewed the full generated
-- SQL for all 104 policies before applying.
--
-- Does not touch storage.* policies (schemaname filter is 'public' only)
-- or any policy that has no auth.<fn>() call, or one already wrapped.

DO $$
DECLARE
  pol record;
  new_qual text;
  new_check text;
  alter_sql text;
  n integer := 0;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND qual ~ 'auth\.(uid|email|jwt|role)\(\)' AND qual !~ '\(select auth\.')
        OR
        (with_check IS NOT NULL AND with_check ~ 'auth\.(uid|email|jwt|role)\(\)' AND with_check !~ '\(select auth\.')
      )
  LOOP
    new_qual := NULL;
    new_check := NULL;
    IF pol.qual IS NOT NULL THEN
      new_qual := regexp_replace(pol.qual, 'auth\.(uid|email|jwt|role)\(\)', '(select auth.\1())', 'g');
    END IF;
    IF pol.with_check IS NOT NULL THEN
      new_check := regexp_replace(pol.with_check, 'auth\.(uid|email|jwt|role)\(\)', '(select auth.\1())', 'g');
    END IF;

    alter_sql := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF new_qual IS NOT NULL THEN
      alter_sql := alter_sql || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      alter_sql := alter_sql || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE alter_sql;
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'auth_rls_initplan fix: rewrote % polic(y/ies)', n;
END $$;

-- Verify after deployment:
-- SELECT count(*) FROM pg_policies WHERE schemaname='public'
--   AND ((qual ~ 'auth\.(uid|email|jwt|role)\(\)' AND qual !~ '\(select auth\.')
--     OR (with_check ~ 'auth\.(uid|email|jwt|role)\(\)' AND with_check !~ '\(select auth\.'));
-- -- expect 0
-- Spot-check a few rewritten policies keep the exact same predicate shape,
-- e.g.: SELECT qual FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_select_own';
-- -- expect: ((select auth.uid()) = id)

-- Rollback: re-run the same statement with auth.uid() unwrapped (i.e. the
-- inverse regexp_replace, stripping '(select ' / ')' around each auth.<fn>()
-- call) — purely a plan-shape change, safe to reverse per-policy if ever
-- needed.
