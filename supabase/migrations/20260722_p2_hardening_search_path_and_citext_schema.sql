-- COSMOSKIN P2 #19 — function_search_path_mutable (~20 functions) and
-- extension_in_public (citext) hardening.
--
-- 1) Pin search_path on every app-owned function in `public` that lacks
-- one. Postgres's official recommended remediation for this lint is
-- `ALTER FUNCTION ... SET search_path = ...` — no function body rewrite,
-- so behavior is identical; it just fixes which schema unqualified
-- references resolve against instead of inheriting the caller's session
-- search_path. Using `public` (not empty) matches every function's
-- existing unqualified references without needing to fully-qualify them.
-- This matters most for the SECURITY DEFINER functions in this list
-- (check_purchase, cosmoskin_activity_*, create_account_activity,
-- get_review_summary, handle_new_user, sync_review_helpful_count) — the
-- classic search_path-hijack risk class for SECURITY DEFINER — but
-- verified live first that anon/authenticated have no CREATE privilege on
-- `public` (Postgres 15+/Supabase default), so there's no untrusted role
-- that could shadow an object here even without this fix; this migration
-- closes the lint and adds defense-in-depth regardless.
--
-- Does NOT touch the citext extension's own internal functions
-- (citext_cmp, texticlike, regexp_match(citext,...), etc.) — those are
-- extension-owned and move automatically when the extension itself
-- relocates in step 2 below; hand-altering them would fight
-- `ALTER EXTENSION ... UPDATE` in the future.

ALTER FUNCTION public.check_purchase(uuid, text) SET search_path = public;
ALTER FUNCTION public.coalesce_empty_text(text, text) SET search_path = public;
ALTER FUNCTION public.cosmoskin_activity_offer_insert() SET search_path = public;
ALTER FUNCTION public.cosmoskin_activity_order_insert() SET search_path = public;
ALTER FUNCTION public.cosmoskin_activity_order_update() SET search_path = public;
ALTER FUNCTION public.cosmoskin_activity_points_insert() SET search_path = public;
ALTER FUNCTION public.cosmoskin_activity_routine_complete() SET search_path = public;
ALTER FUNCTION public.cosmoskin_products_insert_defaults() SET search_path = public;
ALTER FUNCTION public.create_account_activity(uuid, text, text, text, text, text, jsonb) SET search_path = public;
ALTER FUNCTION public.get_review_summary(text) SET search_path = public;
ALTER FUNCTION public.handle_new_auth_user_profile() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.set_cosmoskin_updated_at() SET search_path = public;
ALTER FUNCTION public.set_loyalty_ledger_event_key() SET search_path = public;
ALTER FUNCTION public.set_newsletter_subscribers_updated_at() SET search_path = public;
ALTER FUNCTION public.set_reviews_updated_at() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.sync_helpful_count() SET search_path = public;
ALTER FUNCTION public.sync_notification_read_state() SET search_path = public;
ALTER FUNCTION public.sync_review_approved_from_status() SET search_path = public;
ALTER FUNCTION public.sync_review_helpful_count() SET search_path = public;
ALTER FUNCTION public.update_helpful_count() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;

-- 2) Move citext out of the public schema. Verified live before writing
-- this: the database's default search_path is `"$user", public,
-- extensions`, and `extensions` already exists (standard Supabase
-- project layout) — so every existing unqualified `citext` type
-- reference, cast, and operator across RLS policies/columns keeps
-- resolving exactly as before; this only changes citext's schema, not
-- its behavior or any dependent column's data.
ALTER EXTENSION citext SET SCHEMA extensions;

-- Verify after deployment:
-- SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname NOT LIKE 'citext%'
--   AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%');
-- -- expect 0
-- SELECT extnamespace::regnamespace FROM pg_extension WHERE extname = 'citext'; -- expect extensions
-- Spot-check a citext-dependent query still works, e.g. the gift_cards
-- recipient_email lookup or any ::citext cast in application code.

-- Rollback:
--   ALTER EXTENSION citext SET SCHEMA public;
--   (search_path pins are safe to leave in place even if reverted; to
--   fully undo, ALTER FUNCTION ... RESET search_path; per function.)
