-- COSMOSKIN DB1C-1B1
-- Exact-signature EXECUTE ACL normalization only.
-- Forward-only; do not run against production without the approved manual runbook.

BEGIN;

DO $db1c1b1_preflight$
BEGIN
  IF to_regprocedure('public.check_purchase(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.check_purchase(uuid,text)';
  END IF;
  IF to_regprocedure('public.cleanup_old_notifications(integer,integer,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.cleanup_old_notifications(integer,integer,integer,integer)';
  END IF;
  IF to_regprocedure('public.cosmoskin_activity_offer_insert()') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.cosmoskin_activity_offer_insert()';
  END IF;
  IF to_regprocedure('public.cosmoskin_activity_order_insert()') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.cosmoskin_activity_order_insert()';
  END IF;
  IF to_regprocedure('public.cosmoskin_activity_order_update()') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.cosmoskin_activity_order_update()';
  END IF;
  IF to_regprocedure('public.cosmoskin_activity_points_insert()') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.cosmoskin_activity_points_insert()';
  END IF;
  IF to_regprocedure('public.cosmoskin_activity_routine_complete()') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.cosmoskin_activity_routine_complete()';
  END IF;
  IF to_regprocedure('public.create_account_activity(uuid,text,text,text,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.create_account_activity(uuid,text,text,text,text,text,jsonb)';
  END IF;
  IF to_regprocedure('public.get_review_summary(text)') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.get_review_summary(text)';
  END IF;
  IF to_regprocedure('public.handle_new_auth_user_profile()') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.handle_new_auth_user_profile()';
  END IF;
  IF to_regprocedure('public.handle_new_user()') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.handle_new_user()';
  END IF;
  IF to_regprocedure('public.handle_new_user_profile()') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.handle_new_user_profile()';
  END IF;
  IF to_regprocedure('public.loyalty_ledger_recalculate_trigger()') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.loyalty_ledger_recalculate_trigger()';
  END IF;
  IF to_regprocedure('public.recalculate_customer_membership(uuid)') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.recalculate_customer_membership(uuid)';
  END IF;
  IF to_regprocedure('public.recalculate_loyalty_account(uuid)') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.recalculate_loyalty_account(uuid)';
  END IF;
  IF to_regprocedure('public.recalculate_routine_streak(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.recalculate_routine_streak(uuid,date)';
  END IF;
  IF to_regprocedure('public.refresh_inventory_estimate(uuid)') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.refresh_inventory_estimate(uuid)';
  END IF;
  IF to_regprocedure('public.reserve_product_inventory(text,integer)') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.reserve_product_inventory(text,integer)';
  END IF;
  IF to_regprocedure('public.rls_auto_enable()') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.rls_auto_enable()';
  END IF;
  IF to_regprocedure('public.routine_completion_recalculate_trigger()') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.routine_completion_recalculate_trigger()';
  END IF;
  IF to_regprocedure('public.sync_review_helpful_count()') IS NULL THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: expected function signature is missing: public.sync_review_helpful_count()';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.check_purchase(uuid,text)'),
      ('public.cleanup_old_notifications(integer,integer,integer,integer)'),
      ('public.cosmoskin_activity_offer_insert()'),
      ('public.cosmoskin_activity_order_insert()'),
      ('public.cosmoskin_activity_order_update()'),
      ('public.cosmoskin_activity_points_insert()'),
      ('public.cosmoskin_activity_routine_complete()'),
      ('public.create_account_activity(uuid,text,text,text,text,text,jsonb)'),
      ('public.get_review_summary(text)'),
      ('public.handle_new_auth_user_profile()'),
      ('public.handle_new_user()'),
      ('public.handle_new_user_profile()'),
      ('public.loyalty_ledger_recalculate_trigger()'),
      ('public.recalculate_customer_membership(uuid)'),
      ('public.recalculate_loyalty_account(uuid)'),
      ('public.recalculate_routine_streak(uuid,date)'),
      ('public.refresh_inventory_estimate(uuid)'),
      ('public.reserve_product_inventory(text,integer)'),
      ('public.rls_auto_enable()'),
      ('public.routine_completion_recalculate_trigger()'),
      ('public.sync_review_helpful_count()')
    ) AS expected(exact_signature)
    JOIN pg_proc AS p ON p.oid = to_regprocedure(expected.exact_signature)
    WHERE NOT p.prosecdef
  ) THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: an expected target is no longer SECURITY DEFINER';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.cosmoskin_activity_order_insert()', 'postgres', 'fb017bb59ffbe770f871d60cb2c5ca72'),
      ('public.cosmoskin_activity_order_update()', 'postgres', '062eb548fb11757a67911ef50aafd05d'),
      ('public.cosmoskin_activity_routine_complete()', 'postgres', '30d155e0f57d3d73fe996e0f4faada73'),
      ('public.loyalty_ledger_recalculate_trigger()', 'postgres', 'd8858107c597e12bf23b06896bb0ef63'),
      ('public.routine_completion_recalculate_trigger()', 'postgres', '3dc774d7b50d09bc129f3ea46e4e49dd'),
      ('public.sync_review_helpful_count()', 'postgres', 'b8458c14c4328b493e6f28d863eef12e')
    ) AS baseline(exact_signature, expected_owner, expected_definition_md5)
    JOIN pg_proc AS p ON p.oid = to_regprocedure(baseline.exact_signature)
    WHERE pg_get_userbyid(p.proowner) <> baseline.expected_owner
       OR md5(pg_get_functiondef(p.oid)) <> baseline.expected_definition_md5
  ) THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: trigger-function owner or definition MD5 drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('cosmoskin_orders_activity_insert', 'public', 'orders', 'public.cosmoskin_activity_order_insert()', 'O'),
      ('cosmoskin_orders_activity_update', 'public', 'orders', 'public.cosmoskin_activity_order_update()', 'O'),
      ('cosmoskin_routine_completions_activity_insert', 'public', 'routine_completions', 'public.cosmoskin_activity_routine_complete()', 'O'),
      ('recalculate_loyalty_after_ledger_change', 'public', 'loyalty_ledger', 'public.loyalty_ledger_recalculate_trigger()', 'O'),
      ('recalculate_streak_after_routine_completion_change', 'public', 'routine_completions', 'public.routine_completion_recalculate_trigger()', 'O'),
      ('sync_review_helpful_count_insert', 'public', 'review_helpful', 'public.sync_review_helpful_count()', 'O'),
      ('sync_review_helpful_count_delete', 'public', 'review_helpful', 'public.sync_review_helpful_count()', 'O')
    ) AS baseline(trigger_name, table_schema, table_name, exact_signature, enabled_state)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_trigger AS t
      JOIN pg_class AS c ON c.oid = t.tgrelid
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal
        AND t.tgname = baseline.trigger_name
        AND n.nspname = baseline.table_schema
        AND c.relname = baseline.table_name
        AND t.tgfoid = to_regprocedure(baseline.exact_signature)
        AND t.tgenabled = baseline.enabled_state
    )
  ) THEN
    RAISE EXCEPTION 'DB1C-1B1 preflight failed: trigger attachment baseline drifted';
  END IF;
END
$db1c1b1_preflight$;

REVOKE EXECUTE ON FUNCTION public.check_purchase(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_notifications(integer, integer, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cosmoskin_activity_offer_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cosmoskin_activity_order_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cosmoskin_activity_order_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cosmoskin_activity_points_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cosmoskin_activity_routine_complete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_account_activity(uuid, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_review_summary(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.loyalty_ledger_recalculate_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_customer_membership(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_loyalty_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_routine_streak(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_inventory_estimate(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_product_inventory(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.routine_completion_recalculate_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_review_helpful_count() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.recalculate_customer_membership(uuid) TO service_role;

COMMIT;
