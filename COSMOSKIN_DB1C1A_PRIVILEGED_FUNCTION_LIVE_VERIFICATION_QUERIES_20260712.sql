-- COSMOSKIN DB1C-1A privileged-function live verification pack
-- Read-only evidence collection only. Execute manually in the Supabase SQL Editor.
-- Every executable statement in this file is SELECT or WITH ... SELECT.

-- Q1. Complete public function identity and security attributes.
SELECT
  n.nspname AS function_schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS return_type,
  l.lanname AS language,
  CASE p.provolatile WHEN 'i' THEN 'immutable' WHEN 's' THEN 'stable' ELSE 'volatile' END AS volatility,
  p.prosecdef AS security_definer,
  p.proleakproof AS leakproof,
  CASE p.proparallel WHEN 's' THEN 'safe' WHEN 'r' THEN 'restricted' ELSE 'unsafe' END AS parallel_safety,
  p.prokind,
  p.oid::regprocedure::text AS exact_signature
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_language AS l ON l.oid = p.prolang
WHERE n.nspname = 'public'
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- Q2. SECURITY DEFINER functions, ownership, owner attributes, and configuration.
SELECT
  p.oid::regprocedure::text AS exact_signature,
  r.rolname AS function_owner,
  r.rolsuper AS owner_is_superuser,
  r.rolinherit AS owner_inherits,
  r.rolcreaterole AS owner_can_create_role,
  r.rolcreatedb AS owner_can_create_db,
  r.rolcanlogin AS owner_can_login,
  p.proconfig,
  (SELECT setting FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting WHERE setting LIKE 'search_path=%' LIMIT 1) AS configured_search_path,
  NOT EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
    WHERE setting LIKE 'search_path=%'
  ) AS missing_explicit_search_path
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_roles AS r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.prosecdef
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- Q3. Raw and effective EXECUTE exposure for API roles.
SELECT
  p.oid::regprocedure::text AS exact_signature,
  p.proacl AS raw_acl,
  EXISTS (
    SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) AS public_execute,
  CASE WHEN to_regrole('anon') IS NULL THEN NULL ELSE has_function_privilege(to_regrole('anon'), p.oid, 'EXECUTE') END AS anon_execute,
  CASE WHEN to_regrole('authenticated') IS NULL THEN NULL ELSE has_function_privilege(to_regrole('authenticated'), p.oid, 'EXECUTE') END AS authenticated_execute,
  CASE WHEN to_regrole('service_role') IS NULL THEN NULL ELSE has_function_privilege(to_regrole('service_role'), p.oid, 'EXECUTE') END AS service_role_execute
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- Q4. Expanded ACL entries, including privileges inherited from the default ACL.
WITH function_acl AS (
  SELECT
    p.oid,
    p.oid::regprocedure::text AS exact_signature,
    p.proowner,
    aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
)
SELECT
  exact_signature,
  CASE WHEN (acl).grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid((acl).grantee) END AS grantee,
  pg_get_userbyid((acl).grantor) AS grantor,
  (acl).privilege_type,
  (acl).is_grantable
FROM function_acl
ORDER BY exact_signature, grantee, (acl).privilege_type;

-- Q5. Exact definitions for source review and definition preservation.
SELECT
  p.oid::regprocedure::text AS exact_signature,
  md5(pg_get_functiondef(p.oid)) AS definition_md5,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- Q6. Known high-risk identities and overload detection. Empty identity_arguments means a zero-argument function.
WITH targets(function_name) AS (
  VALUES
    ('recalculate_customer_membership'),
    ('recalculate_loyalty_account'),
    ('recalculate_routine_streak'),
    ('cosmoskin_activity_order_insert'),
    ('cosmoskin_activity_order_update'),
    ('loyalty_ledger_recalculate_trigger'),
    ('routine_completion_recalculate_trigger'),
    ('reserve_product_inventory'),
    ('cleanup_old_notifications'),
    ('check_purchase'),
    ('get_review_summary')
)
SELECT
  t.function_name AS requested_name,
  p.oid::regprocedure::text AS exact_signature,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS security_definer,
  COUNT(p.oid) OVER (PARTITION BY n.nspname, p.proname) AS overload_count
FROM targets AS t
LEFT JOIN pg_proc AS p ON p.proname = t.function_name
  AND EXISTS (
    SELECT 1 FROM pg_namespace AS pn
    WHERE pn.oid = p.pronamespace AND pn.nspname = 'public'
  )
LEFT JOIN pg_namespace AS n ON n.oid = p.pronamespace
ORDER BY t.function_name, identity_arguments;

-- Q7. All overloaded public function names.
SELECT
  n.nspname AS function_schema,
  p.proname AS function_name,
  COUNT(*) AS overload_count,
  array_agg(p.oid::regprocedure::text ORDER BY pg_get_function_identity_arguments(p.oid)) AS exact_signatures
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
GROUP BY n.nspname, p.proname
HAVING COUNT(*) > 1
ORDER BY p.proname;

-- Q8. Trigger dependencies and enabled state for every public function.
SELECT
  pn.nspname AS function_schema,
  p.oid::regprocedure::text AS exact_signature,
  tn.nspname AS table_schema,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  CASE t.tgenabled WHEN 'O' THEN 'origin' WHEN 'D' THEN 'disabled' WHEN 'R' THEN 'replica' WHEN 'A' THEN 'always' ELSE t.tgenabled::text END AS enabled_state,
  pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger AS t
JOIN pg_proc AS p ON p.oid = t.tgfoid
JOIN pg_namespace AS pn ON pn.oid = p.pronamespace
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS tn ON tn.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND pn.nspname = 'public'
ORDER BY p.proname, tn.nspname, c.relname, t.tgname;

-- Q9. Catalog-recorded function dependencies. PL/pgSQL body dependencies may be incomplete here.
SELECT DISTINCT
  caller.oid::regprocedure::text AS caller_signature,
  refn.nspname AS referenced_schema,
  COALESCE(refp.oid::regprocedure::text, refc.relname::text, reft.typname::text, referenced.classid::regclass::text) AS referenced_object,
  referenced.deptype
FROM pg_proc AS caller
JOIN pg_namespace AS callern ON callern.oid = caller.pronamespace
JOIN pg_depend AS referenced ON referenced.objid = caller.oid AND referenced.classid = 'pg_proc'::regclass
LEFT JOIN pg_proc AS refp ON referenced.refclassid = 'pg_proc'::regclass AND refp.oid = referenced.refobjid
LEFT JOIN pg_class AS refc ON referenced.refclassid = 'pg_class'::regclass AND refc.oid = referenced.refobjid
LEFT JOIN pg_type AS reft ON referenced.refclassid = 'pg_type'::regclass AND reft.oid = referenced.refobjid
LEFT JOIN pg_namespace AS refn ON refn.oid = COALESCE(refp.pronamespace, refc.relnamespace, reft.typnamespace)
WHERE callern.nspname = 'public'
  AND caller.prosecdef
ORDER BY caller_signature, referenced_schema, referenced_object;

-- Q10. Source-review flags: dynamic SQL, identity inputs, caller identity checks, and common unqualified relation syntax.
SELECT
  p.oid::regprocedure::text AS exact_signature,
  p.prosrc ~* '\\mEXECUTE\\M|format\\s*\\(' AS possible_dynamic_sql,
  pg_get_function_identity_arguments(p.oid) ~* '(^|, )[^,]*(user_id|account_id|order_id)' AS accepts_sensitive_identifier,
  p.prosrc ~* 'auth\\.uid\\s*\\(' AS checks_auth_uid,
  p.prosrc ~* '\\m(FROM|JOIN|UPDATE|INTO|DELETE[[:space:]]+FROM)[[:space:]]+[a-z_][a-z0-9_]*(?:[[:space:]]|$)' AS possible_unqualified_relation_reference,
  p.prosrc
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- Q11. Functions exposed through the public schema with role-by-role effective EXECUTE status.
SELECT
  p.oid::regprocedure::text AS exact_signature,
  p.prosecdef AS security_definer,
  EXISTS (
    SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) AS public_execute,
  CASE WHEN to_regrole('anon') IS NULL THEN NULL ELSE has_function_privilege(to_regrole('anon'), p.oid, 'EXECUTE') END AS anon_execute,
  CASE WHEN to_regrole('authenticated') IS NULL THEN NULL ELSE has_function_privilege(to_regrole('authenticated'), p.oid, 'EXECUTE') END AS authenticated_execute,
  CASE WHEN to_regrole('service_role') IS NULL THEN NULL ELSE has_function_privilege(to_regrole('service_role'), p.oid, 'EXECUTE') END AS service_role_execute,
  EXISTS (SELECT 1 FROM pg_trigger AS t WHERE t.tgfoid = p.oid AND NOT t.tgisinternal) AS is_trigger_target
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- Q12. Does pg_cron appear available? Use the optional query below only when this returns true.
SELECT
  EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'cron' AND c.relname = 'job'
  ) AS cron_job_catalog_available;

-- OPTIONAL Q13. Run separately only if Q12 returned true.
-- SELECT jobid, schedule, command, nodename, database, username, active, jobname
-- FROM cron.job
-- WHERE command ~* '(recalculate_|cosmoskin_|loyalty_|routine_|inventory_|notification_)'
-- ORDER BY jobid;
