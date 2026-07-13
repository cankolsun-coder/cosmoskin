-- REVIEW ONLY — MANUAL AUTHORIZATION REQUIRED
-- COSMOSKIN DB1C-1B1 exact before-state ACL restoration.
-- Never execute automatically. This intentionally restores the pre-migration exposure recorded in the manifest.

BEGIN;

GRANT EXECUTE ON FUNCTION public.check_purchase(uuid, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications(integer, integer, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cosmoskin_activity_offer_insert() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmoskin_activity_order_insert() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmoskin_activity_order_update() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmoskin_activity_points_insert() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cosmoskin_activity_routine_complete() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_account_activity(uuid, text, text, text, text, text, jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_review_summary(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user_profile() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user_profile() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.loyalty_ledger_recalculate_trigger() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_customer_membership(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_loyalty_account(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_routine_streak(uuid, date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_inventory_estimate(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_product_inventory(text, integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.routine_completion_recalculate_trigger() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_review_helpful_count() TO PUBLIC;

COMMIT;
