-- COSMOSKIN P2 — close the two live Supabase security-advisor WARN findings
-- (rls_policy_always_true) on product_reviews and account_activity.
--
-- Both policies use WITH CHECK (true) with no auth.uid() scoping, and both
-- tables still carry the default anon/authenticated GRANTs from before the
-- 20260616 RLS hardening pass (which covered `reviews`/`review_images`/
-- `review_helpful` but missed the legacy `product_reviews` duplicate and
-- never touched `account_activity`). Combined with the public anon key,
-- anyone can currently INSERT arbitrary rows into either table without
-- authentication.
--
-- Neither table is referenced anywhere in functions/api or assets (verified
-- via repo-wide grep) — product_reviews is superseded by the `reviews`
-- table the live review handler actually uses, and account_activity has no
-- application writer. This migration locks both down to service_role only,
-- matching the same pattern already applied to the 28 other internal-only
-- tables in 20260616_rls_security_hardening.sql. It does not touch the
-- `reviews`/`review_images`/`review_helpful` tables or any commerce data.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['product_reviews', 'account_activity']
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "reviews_authenticated_insert" ON public.product_reviews;
DROP POLICY IF EXISTS "Service role can insert account activity" ON public.account_activity;

-- Verify after deployment:
-- 1) No anon/authenticated grants remain:
--    SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND table_name IN ('product_reviews','account_activity')
--      AND grantee IN ('anon','authenticated');
--    -- expect 0 rows
-- 2) The two always-true policies are gone:
--    SELECT tablename, policyname FROM pg_policies
--    WHERE tablename IN ('product_reviews','account_activity')
--      AND (policyname = 'reviews_authenticated_insert' OR policyname = 'Service role can insert account activity');
--    -- expect 0 rows
-- 3) service_role access is unaffected (bypasses RLS/grants by default in Supabase).

-- Rollback (only if a live client integration for these tables is discovered):
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reviews TO anon, authenticated;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_activity TO anon, authenticated;
--   CREATE POLICY "reviews_authenticated_insert" ON public.product_reviews FOR INSERT TO authenticated WITH CHECK (true);
--   CREATE POLICY "Service role can insert account activity" ON public.account_activity FOR INSERT WITH CHECK (true);
