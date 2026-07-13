-- COSMOSKIN DB1C-1B1 post-deploy verification
-- SELECT-only. Run manually only after an authorized staging/production deployment.

-- Q1. Per-target ACL and immutable function attributes after deployment.
WITH targets(exact_signature, expected_service_role) AS (
  VALUES
    ('public.check_purchase(uuid,text)', true),
    ('public.cleanup_old_notifications(integer,integer,integer,integer)', true),
    ('public.cosmoskin_activity_offer_insert()', true),
    ('public.cosmoskin_activity_order_insert()', true),
    ('public.cosmoskin_activity_order_update()', true),
    ('public.cosmoskin_activity_points_insert()', true),
    ('public.cosmoskin_activity_routine_complete()', true),
    ('public.create_account_activity(uuid,text,text,text,text,text,jsonb)', true),
    ('public.get_review_summary(text)', true),
    ('public.handle_new_auth_user_profile()', true),
    ('public.handle_new_user()', true),
    ('public.handle_new_user_profile()', true),
    ('public.loyalty_ledger_recalculate_trigger()', true),
    ('public.recalculate_customer_membership(uuid)', true),
    ('public.recalculate_loyalty_account(uuid)', true),
    ('public.recalculate_routine_streak(uuid,date)', true),
    ('public.refresh_inventory_estimate(uuid)', true),
    ('public.reserve_product_inventory(text,integer)', true),
    ('public.rls_auto_enable()', true),
    ('public.routine_completion_recalculate_trigger()', true),
    ('public.sync_review_helpful_count()', true)
)
SELECT
  targets.*,
  p.oid IS NOT NULL AS signature_exists,
  p.prosecdef AS security_definer,
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
ORDER BY exact_signature;

-- Q2. Exact owner, MD5, and trigger-definition invariants supplied for six functions/seven attachments.
WITH function_baselines(exact_signature, expected_owner, expected_definition_md5) AS (
  VALUES
    ('public.cosmoskin_activity_order_insert()', 'postgres', 'fb017bb59ffbe770f871d60cb2c5ca72'),
    ('public.cosmoskin_activity_order_update()', 'postgres', '062eb548fb11757a67911ef50aafd05d'),
    ('public.cosmoskin_activity_routine_complete()', 'postgres', '30d155e0f57d3d73fe996e0f4faada73'),
    ('public.loyalty_ledger_recalculate_trigger()', 'postgres', 'd8858107c597e12bf23b06896bb0ef63'),
    ('public.routine_completion_recalculate_trigger()', 'postgres', '3dc774d7b50d09bc129f3ea46e4e49dd'),
    ('public.sync_review_helpful_count()', 'postgres', 'b8458c14c4328b493e6f28d863eef12e')
), trigger_baselines(trigger_name, table_schema, table_name, exact_signature, expected_enabled_state, trigger_definition) AS (
  VALUES
    ('cosmoskin_orders_activity_insert', 'public', 'orders', 'public.cosmoskin_activity_order_insert()', 'O', 'CREATE TRIGGER cosmoskin_orders_activity_insert AFTER INSERT ON orders FOR EACH ROW EXECUTE FUNCTION cosmoskin_activity_order_insert()'),
    ('cosmoskin_orders_activity_update', 'public', 'orders', 'public.cosmoskin_activity_order_update()', 'O', 'CREATE TRIGGER cosmoskin_orders_activity_update AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION cosmoskin_activity_order_update()'),
    ('cosmoskin_routine_completions_activity_insert', 'public', 'routine_completions', 'public.cosmoskin_activity_routine_complete()', 'O', 'CREATE TRIGGER cosmoskin_routine_completions_activity_insert AFTER INSERT ON routine_completions FOR EACH ROW EXECUTE FUNCTION cosmoskin_activity_routine_complete()'),
    ('recalculate_loyalty_after_ledger_change', 'public', 'loyalty_ledger', 'public.loyalty_ledger_recalculate_trigger()', 'O', 'CREATE TRIGGER recalculate_loyalty_after_ledger_change AFTER INSERT OR DELETE OR UPDATE ON loyalty_ledger FOR EACH ROW EXECUTE FUNCTION loyalty_ledger_recalculate_trigger()'),
    ('recalculate_streak_after_routine_completion_change', 'public', 'routine_completions', 'public.routine_completion_recalculate_trigger()', 'O', 'CREATE TRIGGER recalculate_streak_after_routine_completion_change AFTER INSERT OR DELETE OR UPDATE ON routine_completions FOR EACH ROW EXECUTE FUNCTION routine_completion_recalculate_trigger()'),
    ('sync_review_helpful_count_insert', 'public', 'review_helpful', 'public.sync_review_helpful_count()', 'O', 'CREATE TRIGGER sync_review_helpful_count_insert AFTER INSERT ON review_helpful FOR EACH ROW EXECUTE FUNCTION sync_review_helpful_count()'),
    ('sync_review_helpful_count_delete', 'public', 'review_helpful', 'public.sync_review_helpful_count()', 'O', 'CREATE TRIGGER sync_review_helpful_count_delete AFTER DELETE ON review_helpful FOR EACH ROW EXECUTE FUNCTION sync_review_helpful_count()')
), function_check AS (
  SELECT
    function_baselines.*,
    pg_get_userbyid(p.proowner) AS current_owner,
    md5(pg_get_functiondef(p.oid)) AS current_definition_md5,
    pg_get_userbyid(p.proowner) = expected_owner AS owner_matches,
    md5(pg_get_functiondef(p.oid)) = expected_definition_md5 AS definition_md5_matches
  FROM function_baselines
  LEFT JOIN pg_proc AS p ON p.oid = to_regprocedure(function_baselines.exact_signature)
), trigger_check AS (
  SELECT
    trigger_baselines.*,
    t.oid IS NOT NULL AS trigger_exists,
    t.tgenabled::text AS current_enabled_state,
    pg_get_triggerdef(t.oid, true) AS current_trigger_definition,
    t.tgfoid = to_regprocedure(trigger_baselines.exact_signature) AS function_attachment_matches,
    t.tgenabled::text = trigger_baselines.expected_enabled_state::text AS enabled_state_matches,
    pg_get_triggerdef(t.oid, true) = trigger_baselines.trigger_definition AS trigger_definition_matches
  FROM trigger_baselines
  LEFT JOIN pg_namespace AS n ON n.nspname = trigger_baselines.table_schema
  LEFT JOIN pg_class AS c ON c.relnamespace = n.oid AND c.relname = trigger_baselines.table_name
  LEFT JOIN pg_trigger AS t ON t.tgrelid = c.oid AND t.tgname = trigger_baselines.trigger_name AND NOT t.tgisinternal
)
SELECT
  'function' AS invariant_type,
  exact_signature AS object_identity,
  owner_matches AND definition_md5_matches AS invariant_matches,
  expected_owner || '/' || expected_definition_md5 AS expected_state,
  current_owner || '/' || current_definition_md5 AS current_state
FROM function_check
UNION ALL
SELECT
  'trigger' AS invariant_type,
  trigger_name AS object_identity,
  trigger_exists AND function_attachment_matches AND enabled_state_matches AND trigger_definition_matches AS invariant_matches,
  table_schema || '.' || table_name || '/' || COALESCE(expected_enabled_state::text, '<missing>') || '/' || trigger_definition AS expected_state,
  table_schema || '.' || table_name || '/' || COALESCE(current_enabled_state::text, '<missing>') || '/' || COALESCE(current_trigger_definition, '<missing>') AS current_state
FROM trigger_check
ORDER BY invariant_type, object_identity;

-- Q3. Full normal-trigger inventory for all eight confirmed trigger functions; compare to saved preflight export.
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
  t.tgenabled::text AS enabled_state,
  pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM confirmed
LEFT JOIN pg_proc AS p ON p.oid = to_regprocedure(confirmed.exact_signature)
LEFT JOIN pg_trigger AS t ON t.tgfoid = p.oid AND NOT t.tgisinternal
LEFT JOIN pg_class AS c ON c.oid = t.tgrelid
LEFT JOIN pg_namespace AS n ON n.oid = c.relnamespace
ORDER BY exact_signature, trigger_name;

-- Q4. Final ACL and immutable-baseline summary.
WITH targets(exact_signature, expected_service_role) AS (
  VALUES
    ('public.check_purchase(uuid,text)', true),
    ('public.cleanup_old_notifications(integer,integer,integer,integer)', true),
    ('public.cosmoskin_activity_offer_insert()', true),
    ('public.cosmoskin_activity_order_insert()', true),
    ('public.cosmoskin_activity_order_update()', true),
    ('public.cosmoskin_activity_points_insert()', true),
    ('public.cosmoskin_activity_routine_complete()', true),
    ('public.create_account_activity(uuid,text,text,text,text,text,jsonb)', true),
    ('public.get_review_summary(text)', true),
    ('public.handle_new_auth_user_profile()', true),
    ('public.handle_new_user()', true),
    ('public.handle_new_user_profile()', true),
    ('public.loyalty_ledger_recalculate_trigger()', true),
    ('public.recalculate_customer_membership(uuid)', true),
    ('public.recalculate_loyalty_account(uuid)', true),
    ('public.recalculate_routine_streak(uuid,date)', true),
    ('public.refresh_inventory_estimate(uuid)', true),
    ('public.reserve_product_inventory(text,integer)', true),
    ('public.rls_auto_enable()', true),
    ('public.routine_completion_recalculate_trigger()', true),
    ('public.sync_review_helpful_count()', true)
), function_baselines(exact_signature, expected_owner, expected_definition_md5) AS (
  VALUES
    ('public.cosmoskin_activity_order_insert()', 'postgres', 'fb017bb59ffbe770f871d60cb2c5ca72'),
    ('public.cosmoskin_activity_order_update()', 'postgres', '062eb548fb11757a67911ef50aafd05d'),
    ('public.cosmoskin_activity_routine_complete()', 'postgres', '30d155e0f57d3d73fe996e0f4faada73'),
    ('public.loyalty_ledger_recalculate_trigger()', 'postgres', 'd8858107c597e12bf23b06896bb0ef63'),
    ('public.routine_completion_recalculate_trigger()', 'postgres', '3dc774d7b50d09bc129f3ea46e4e49dd'),
    ('public.sync_review_helpful_count()', 'postgres', 'b8458c14c4328b493e6f28d863eef12e')
), current_state AS (
  SELECT
    targets.*,
    p.oid,
    p.proowner,
    p.proacl,
    p.prosecdef,
    EXISTS (
      SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) AS public_execute,
    CASE WHEN to_regrole('anon') IS NULL THEN false ELSE has_function_privilege(to_regrole('anon'), p.oid, 'EXECUTE') END AS anon_execute,
    CASE WHEN to_regrole('authenticated') IS NULL THEN false ELSE has_function_privilege(to_regrole('authenticated'), p.oid, 'EXECUTE') END AS authenticated_execute,
    CASE WHEN to_regrole('service_role') IS NULL THEN false ELSE has_function_privilege(to_regrole('service_role'), p.oid, 'EXECUTE') END AS service_role_execute
  FROM targets
  LEFT JOIN pg_proc AS p ON p.oid = to_regprocedure(targets.exact_signature)
), definition_check AS (
  SELECT
    function_baselines.exact_signature,
    p.oid,
    pg_get_userbyid(p.proowner) = expected_owner AS owner_matches,
    md5(pg_get_functiondef(p.oid)) = expected_definition_md5 AS definition_matches
  FROM function_baselines
  LEFT JOIN pg_proc AS p ON p.oid = to_regprocedure(function_baselines.exact_signature)
)
SELECT
  (SELECT COUNT(*) FROM targets) AS target_count,
  COUNT(*) FILTER (WHERE current_state.oid IS NULL) AS missing_signature_count,
  COUNT(*) FILTER (WHERE current_state.oid IS NOT NULL AND NOT current_state.prosecdef) AS security_definer_drift_count,
  COUNT(*) FILTER (WHERE current_state.public_execute) AS public_exposure_remaining,
  COUNT(*) FILTER (WHERE current_state.anon_execute) AS anon_exposure_remaining,
  COUNT(*) FILTER (WHERE current_state.authenticated_execute) AS authenticated_exposure_remaining,
  COUNT(*) FILTER (WHERE current_state.service_role_execute IS DISTINCT FROM current_state.expected_service_role) AS service_role_mismatch_count,
  (SELECT COUNT(*) FROM definition_check WHERE NOT definition_matches) AS definition_drift_count,
  (SELECT COUNT(*) FROM definition_check WHERE NOT owner_matches) AS owner_drift_count,
  (SELECT COUNT(*) FROM function_baselines) AS embedded_definition_baseline_count
FROM current_state;
