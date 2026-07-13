-- COSMOSKIN DB1C-1B1 ACL preflight
-- SELECT-only. Manual execution and approval required before migration deployment.

-- Q1. Exact target existence, ACL, SECURITY DEFINER, owner, MD5, and trigger count.
WITH targets(exact_signature, function_name, expected_public, expected_anon, expected_authenticated, expected_service_role, confirmed_trigger) AS (
  VALUES
    ('public.check_purchase(uuid,text)', 'check_purchase', true, true, true, true, false),
    ('public.cleanup_old_notifications(integer,integer,integer,integer)', 'cleanup_old_notifications', false, true, true, true, false),
    ('public.cosmoskin_activity_offer_insert()', 'cosmoskin_activity_offer_insert', true, true, true, true, false),
    ('public.cosmoskin_activity_order_insert()', 'cosmoskin_activity_order_insert', true, true, true, true, true),
    ('public.cosmoskin_activity_order_update()', 'cosmoskin_activity_order_update', true, true, true, true, true),
    ('public.cosmoskin_activity_points_insert()', 'cosmoskin_activity_points_insert', true, true, true, true, false),
    ('public.cosmoskin_activity_routine_complete()', 'cosmoskin_activity_routine_complete', true, true, true, true, true),
    ('public.create_account_activity(uuid,text,text,text,text,text,jsonb)', 'create_account_activity', true, true, true, true, false),
    ('public.get_review_summary(text)', 'get_review_summary', true, true, true, true, false),
    ('public.handle_new_auth_user_profile()', 'handle_new_auth_user_profile', true, true, true, true, true),
    ('public.handle_new_user()', 'handle_new_user', true, true, true, true, false),
    ('public.handle_new_user_profile()', 'handle_new_user_profile', true, true, true, true, true),
    ('public.loyalty_ledger_recalculate_trigger()', 'loyalty_ledger_recalculate_trigger', true, true, true, true, true),
    ('public.recalculate_customer_membership(uuid)', 'recalculate_customer_membership', true, true, true, true, false),
    ('public.recalculate_loyalty_account(uuid)', 'recalculate_loyalty_account', true, true, true, true, false),
    ('public.recalculate_routine_streak(uuid,date)', 'recalculate_routine_streak', true, true, true, true, false),
    ('public.refresh_inventory_estimate(uuid)', 'refresh_inventory_estimate', true, true, true, true, false),
    ('public.reserve_product_inventory(text,integer)', 'reserve_product_inventory', true, true, true, true, false),
    ('public.rls_auto_enable()', 'rls_auto_enable', true, true, true, true, false),
    ('public.routine_completion_recalculate_trigger()', 'routine_completion_recalculate_trigger', true, true, true, true, true),
    ('public.sync_review_helpful_count()', 'sync_review_helpful_count', true, true, true, true, true)
), current_state AS (
  SELECT
    targets.*,
    to_regprocedure(targets.exact_signature) AS function_oid,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS function_owner,
    md5(pg_get_functiondef(p.oid)) AS definition_md5,
    EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) AS public_execute,
    CASE WHEN to_regrole('anon') IS NULL THEN NULL ELSE has_function_privilege(to_regrole('anon'), p.oid, 'EXECUTE') END AS anon_execute,
    CASE WHEN to_regrole('authenticated') IS NULL THEN NULL ELSE has_function_privilege(to_regrole('authenticated'), p.oid, 'EXECUTE') END AS authenticated_execute,
    CASE WHEN to_regrole('service_role') IS NULL THEN NULL ELSE has_function_privilege(to_regrole('service_role'), p.oid, 'EXECUTE') END AS service_role_execute,
    (SELECT COUNT(*) FROM pg_trigger AS t WHERE NOT t.tgisinternal AND t.tgfoid = p.oid) AS trigger_attachment_count
  FROM targets
  LEFT JOIN pg_proc AS p ON p.oid = to_regprocedure(targets.exact_signature)
)
SELECT
  *,
  function_oid IS NOT NULL AS signature_exists,
  public_execute IS NOT DISTINCT FROM expected_public AS public_matches_before_state,
  anon_execute IS NOT DISTINCT FROM expected_anon AS anon_matches_before_state,
  authenticated_execute IS NOT DISTINCT FROM expected_authenticated AS authenticated_matches_before_state,
  service_role_execute IS NOT DISTINCT FROM expected_service_role AS service_role_matches_before_state,
  (NOT confirmed_trigger) OR trigger_attachment_count > 0 AS trigger_attachment_matches_expectation
FROM current_state
ORDER BY exact_signature;

-- Q2. Target count, missing identities, SECURITY DEFINER drift, and COSMOSKIN overload detection.
WITH targets(exact_signature, function_name) AS (
  VALUES
    ('public.check_purchase(uuid,text)', 'check_purchase'),
    ('public.cleanup_old_notifications(integer,integer,integer,integer)', 'cleanup_old_notifications'),
    ('public.cosmoskin_activity_offer_insert()', 'cosmoskin_activity_offer_insert'),
    ('public.cosmoskin_activity_order_insert()', 'cosmoskin_activity_order_insert'),
    ('public.cosmoskin_activity_order_update()', 'cosmoskin_activity_order_update'),
    ('public.cosmoskin_activity_points_insert()', 'cosmoskin_activity_points_insert'),
    ('public.cosmoskin_activity_routine_complete()', 'cosmoskin_activity_routine_complete'),
    ('public.create_account_activity(uuid,text,text,text,text,text,jsonb)', 'create_account_activity'),
    ('public.get_review_summary(text)', 'get_review_summary'),
    ('public.handle_new_auth_user_profile()', 'handle_new_auth_user_profile'),
    ('public.handle_new_user()', 'handle_new_user'),
    ('public.handle_new_user_profile()', 'handle_new_user_profile'),
    ('public.loyalty_ledger_recalculate_trigger()', 'loyalty_ledger_recalculate_trigger'),
    ('public.recalculate_customer_membership(uuid)', 'recalculate_customer_membership'),
    ('public.recalculate_loyalty_account(uuid)', 'recalculate_loyalty_account'),
    ('public.recalculate_routine_streak(uuid,date)', 'recalculate_routine_streak'),
    ('public.refresh_inventory_estimate(uuid)', 'refresh_inventory_estimate'),
    ('public.reserve_product_inventory(text,integer)', 'reserve_product_inventory'),
    ('public.rls_auto_enable()', 'rls_auto_enable'),
    ('public.routine_completion_recalculate_trigger()', 'routine_completion_recalculate_trigger'),
    ('public.sync_review_helpful_count()', 'sync_review_helpful_count')
), evaluated AS (
  SELECT
    targets.*,
    to_regprocedure(targets.exact_signature) AS function_oid,
    p.prosecdef,
    (
      SELECT COUNT(*)
      FROM pg_proc AS same_name
      JOIN pg_namespace AS n ON n.oid = same_name.pronamespace
      WHERE n.nspname = 'public' AND same_name.proname = targets.function_name
    ) AS same_name_signature_count
  FROM targets
  LEFT JOIN pg_proc AS p ON p.oid = to_regprocedure(targets.exact_signature)
)
SELECT
  COUNT(*) AS expected_target_count,
  COUNT(*) FILTER (WHERE function_oid IS NOT NULL) AS existing_target_count,
  COUNT(*) FILTER (WHERE function_oid IS NULL) AS missing_signature_count,
  COUNT(*) FILTER (WHERE function_oid IS NOT NULL AND NOT prosecdef) AS security_definer_drift_count,
  COUNT(*) FILTER (WHERE same_name_signature_count > 1) AS unresolved_overload_target_count,
  array_agg(exact_signature ORDER BY exact_signature) FILTER (WHERE function_oid IS NULL) AS missing_signatures,
  array_agg(function_name ORDER BY function_name) FILTER (WHERE same_name_signature_count > 1) AS overloaded_names
FROM evaluated;

-- Q3. Exact owner and definition-MD5 baselines for the six supplied trigger functions.
WITH baselines(exact_signature, expected_owner, expected_definition_md5) AS (
  VALUES
    ('public.cosmoskin_activity_order_insert()', 'postgres', 'fb017bb59ffbe770f871d60cb2c5ca72'),
    ('public.cosmoskin_activity_order_update()', 'postgres', '062eb548fb11757a67911ef50aafd05d'),
    ('public.cosmoskin_activity_routine_complete()', 'postgres', '30d155e0f57d3d73fe996e0f4faada73'),
    ('public.loyalty_ledger_recalculate_trigger()', 'postgres', 'd8858107c597e12bf23b06896bb0ef63'),
    ('public.routine_completion_recalculate_trigger()', 'postgres', '3dc774d7b50d09bc129f3ea46e4e49dd'),
    ('public.sync_review_helpful_count()', 'postgres', 'b8458c14c4328b493e6f28d863eef12e')
)
SELECT
  baselines.*,
  pg_get_userbyid(p.proowner) AS current_owner,
  md5(pg_get_functiondef(p.oid)) AS current_definition_md5,
  pg_get_userbyid(p.proowner) = expected_owner AS owner_matches,
  md5(pg_get_functiondef(p.oid)) = expected_definition_md5 AS definition_md5_matches
FROM baselines
LEFT JOIN pg_proc AS p ON p.oid = to_regprocedure(baselines.exact_signature)
ORDER BY exact_signature;

-- Q4. Seven exact trigger attachments covering the six supplied trigger functions.
WITH baselines(trigger_name, table_schema, table_name, exact_signature, enabled_state, trigger_definition) AS (
  VALUES
    ('cosmoskin_orders_activity_insert', 'public', 'orders', 'public.cosmoskin_activity_order_insert()', 'O', 'CREATE TRIGGER cosmoskin_orders_activity_insert AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION cosmoskin_activity_order_insert()'),
    ('cosmoskin_orders_activity_update', 'public', 'orders', 'public.cosmoskin_activity_order_update()', 'O', 'CREATE TRIGGER cosmoskin_orders_activity_update AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION cosmoskin_activity_order_update()'),
    ('cosmoskin_routine_completions_activity_insert', 'public', 'routine_completions', 'public.cosmoskin_activity_routine_complete()', 'O', 'CREATE TRIGGER cosmoskin_routine_completions_activity_insert AFTER INSERT ON routine_completions FOR EACH ROW EXECUTE FUNCTION cosmoskin_activity_routine_complete()'),
    ('recalculate_loyalty_after_ledger_change', 'public', 'loyalty_ledger', 'public.loyalty_ledger_recalculate_trigger()', 'O', 'CREATE TRIGGER recalculate_loyalty_after_ledger_change AFTER INSERT OR DELETE OR UPDATE ON loyalty_ledger FOR EACH ROW EXECUTE FUNCTION loyalty_ledger_recalculate_trigger()'),
    ('recalculate_streak_after_routine_completion_change', 'public', 'routine_completions', 'public.routine_completion_recalculate_trigger()', 'O', 'CREATE TRIGGER recalculate_streak_after_routine_completion_change AFTER INSERT OR DELETE OR UPDATE ON routine_completions FOR EACH ROW EXECUTE FUNCTION routine_completion_recalculate_trigger()'),
    ('sync_review_helpful_count_insert', 'public', 'review_helpful', 'public.sync_review_helpful_count()', 'O', 'CREATE TRIGGER sync_review_helpful_count_insert AFTER INSERT ON review_helpful FOR EACH ROW EXECUTE FUNCTION sync_review_helpful_count()'),
    ('sync_review_helpful_count_delete', 'public', 'review_helpful', 'public.sync_review_helpful_count()', 'O', 'CREATE TRIGGER sync_review_helpful_count_delete AFTER DELETE ON review_helpful FOR EACH ROW EXECUTE FUNCTION sync_review_helpful_count()')
)
SELECT
  baselines.*,
  t.oid IS NOT NULL AS trigger_exists,
  t.tgenabled AS current_enabled_state,
  pg_get_triggerdef(t.oid, true) AS current_trigger_definition,
  t.tgfoid = to_regprocedure(baselines.exact_signature) AS function_attachment_matches,
  t.tgenabled = baselines.enabled_state AS enabled_state_matches,
  pg_get_triggerdef(t.oid, true) = baselines.trigger_definition AS trigger_definition_matches
FROM baselines
LEFT JOIN pg_namespace AS n ON n.nspname = baselines.table_schema
LEFT JOIN pg_class AS c ON c.relnamespace = n.oid AND c.relname = baselines.table_name
LEFT JOIN pg_trigger AS t ON t.tgrelid = c.oid AND t.tgname = baselines.trigger_name AND NOT t.tgisinternal
ORDER BY trigger_name;

-- Q5. Full normal-trigger inventory for all eight confirmed trigger functions.
WITH confirmed(exact_signature) AS (
  VALUES
    ('public.cosmoskin_activity_order_insert()'),
    ('public.cosmoskin_activity_order_update()'),
    ('public.cosmoskin_activity_routine_complete()'),
    ('public.handle_new_auth_user_profile()'),
    ('public.handle_new_user_profile()'),
    ('public.loyalty_ledger_recalculate_trigger()'),
    ('public.routine_completion_recalculate_trigger()'),
    ('public.sync_review_helpful_count()')
)
SELECT
  confirmed.exact_signature,
  pg_get_userbyid(p.proowner) AS function_owner,
  md5(pg_get_functiondef(p.oid)) AS definition_md5,
  n.nspname AS table_schema,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  t.tgenabled AS enabled_state,
  pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM confirmed
LEFT JOIN pg_proc AS p ON p.oid = to_regprocedure(confirmed.exact_signature)
LEFT JOIN pg_trigger AS t ON t.tgfoid = p.oid AND NOT t.tgisinternal
LEFT JOIN pg_class AS c ON c.oid = t.tgrelid
LEFT JOIN pg_namespace AS n ON n.oid = c.relnamespace
ORDER BY exact_signature, trigger_name;
