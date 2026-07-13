-- COSMOSKIN DB1C-1A privileged-function live verification pack
-- Read-only evidence collection only. Run manually with explicit approval.
-- Every executable statement is SELECT or WITH ... SELECT.
-- Q13 remains optional/commented because cron.job may not exist.

-- Q1. Complete public-schema function identity and security attributes.
SELECT
  n.nspname AS function_schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.oid::regprocedure::text AS exact_signature,
  pg_get_function_result(p.oid) AS return_type,
  l.lanname AS language,
  CASE p.provolatile WHEN 'i' THEN 'immutable' WHEN 's' THEN 'stable' ELSE 'volatile' END AS volatility,
  p.prosecdef AS security_definer,
  p.proleakproof AS leakproof,
  CASE p.proparallel WHEN 's' THEN 'safe' WHEN 'r' THEN 'restricted' ELSE 'unsafe' END AS parallel_safety,
  p.prokind
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_language AS l ON l.oid = p.prolang
WHERE n.nspname = 'public'
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- Q2. SECURITY DEFINER ownership and per-function configuration.
SELECT
  p.oid::regprocedure::text AS exact_signature,
  r.rolname AS function_owner,
  r.rolsuper AS owner_is_superuser,
  r.rolinherit AS owner_inherits,
  r.rolcreaterole AS owner_can_create_role,
  r.rolcreatedb AS owner_can_create_db,
  r.rolcanlogin AS owner_can_login,
  p.proconfig,
  (
    SELECT setting
    FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
    WHERE setting LIKE 'search_path=%'
    LIMIT 1
  ) AS configured_search_path,
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

-- Q3. Exact raw ACL and effective API-role execution for every public SECURITY DEFINER.
SELECT
  p.oid::regprocedure::text AS exact_signature,
  p.proacl AS raw_acl,
  EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) AS public_execute,
  CASE WHEN to_regrole('anon') IS NULL THEN NULL
       ELSE has_function_privilege(to_regrole('anon'), p.oid, 'EXECUTE') END AS anon_execute,
  CASE WHEN to_regrole('authenticated') IS NULL THEN NULL
       ELSE has_function_privilege(to_regrole('authenticated'), p.oid, 'EXECUTE') END AS authenticated_execute,
  CASE WHEN to_regrole('service_role') IS NULL THEN NULL
       ELSE has_function_privilege(to_regrole('service_role'), p.oid, 'EXECUTE') END AS service_role_execute
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- Q4. Expanded ACL entries, including the default function ACL when proacl is null.
WITH function_acl AS (
  SELECT
    p.oid::regprocedure::text AS exact_signature,
    a.grantee,
    a.grantor,
    a.privilege_type,
    a.is_grantable
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
  WHERE n.nspname = 'public'
    AND p.prosecdef
)
SELECT
  exact_signature,
  CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END AS grantee,
  pg_get_userbyid(grantor) AS grantor,
  privilege_type,
  is_grantable
FROM function_acl
ORDER BY exact_signature, grantee, privilege_type;

-- Q5. Exact live definitions and checksums for source review and rollback evidence.
SELECT
  p.oid::regprocedure::text AS exact_signature,
  md5(pg_get_functiondef(p.oid)) AS definition_md5,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- Q6. Focused identity resolution and same-name signature count.
WITH targets(function_name) AS (
  VALUES
    ('check_purchase'),
    ('cleanup_old_notifications'),
    ('cosmoskin_activity_order_insert'),
    ('cosmoskin_activity_order_update'),
    ('cosmoskin_activity_routine_complete'),
    ('create_account_activity'),
    ('get_review_summary'),
    ('loyalty_ledger_recalculate_trigger'),
    ('recalculate_customer_membership'),
    ('recalculate_loyalty_account'),
    ('recalculate_routine_streak'),
    ('refresh_inventory_estimate'),
    ('reserve_product_inventory'),
    ('rls_auto_enable'),
    ('routine_completion_recalculate_trigger'),
    ('sync_review_helpful_count')
)
SELECT
  t.function_name AS requested_name,
  p.oid::regprocedure::text AS exact_signature,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS security_definer,
  COUNT(p.oid) OVER (PARTITION BY p.pronamespace, p.proname) AS same_name_signature_count
FROM targets AS t
LEFT JOIN pg_proc AS p
  ON p.proname = t.function_name
 AND EXISTS (
   SELECT 1
   FROM pg_namespace AS pn
   WHERE pn.oid = p.pronamespace AND pn.nspname = 'public'
 )
ORDER BY t.function_name, pg_get_function_identity_arguments(p.oid);

-- Q7. All overloaded public function names. Extension overloads are expected and must be separated from COSMOSKIN functions.
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

-- Q8. Normal table-trigger dependencies and enabled state for public functions.
SELECT
  pn.nspname AS function_schema,
  p.oid::regprocedure::text AS exact_function_signature,
  tn.nspname AS table_schema,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  CASE t.tgenabled
    WHEN 'O' THEN 'origin'
    WHEN 'D' THEN 'disabled'
    WHEN 'R' THEN 'replica'
    WHEN 'A' THEN 'always'
    ELSE t.tgenabled::text
  END AS enabled_state,
  pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger AS t
JOIN pg_proc AS p ON p.oid = t.tgfoid
JOIN pg_namespace AS pn ON pn.oid = p.pronamespace
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS tn ON tn.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND pn.nspname = 'public'
ORDER BY p.proname, tn.nspname, c.relname, t.tgname;

-- Q9. Catalog-recorded dependencies. PL/pgSQL body references can require additional manual source review.
SELECT DISTINCT
  caller.oid::regprocedure::text AS caller_signature,
  refn.nspname AS referenced_schema,
  COALESCE(
    refp.oid::regprocedure::text,
    refc.relname::text,
    reft.typname::text,
    dependency.refclassid::regclass::text
  ) AS referenced_object,
  dependency.deptype
FROM pg_proc AS caller
JOIN pg_namespace AS callern ON callern.oid = caller.pronamespace
JOIN pg_depend AS dependency
  ON dependency.objid = caller.oid
 AND dependency.classid = 'pg_proc'::regclass
LEFT JOIN pg_proc AS refp
  ON dependency.refclassid = 'pg_proc'::regclass
 AND refp.oid = dependency.refobjid
LEFT JOIN pg_class AS refc
  ON dependency.refclassid = 'pg_class'::regclass
 AND refc.oid = dependency.refobjid
LEFT JOIN pg_type AS reft
  ON dependency.refclassid = 'pg_type'::regclass
 AND reft.oid = dependency.refobjid
LEFT JOIN pg_namespace AS refn
  ON refn.oid = COALESCE(refp.pronamespace, refc.relnamespace, reft.typnamespace)
WHERE callern.nspname = 'public'
  AND caller.prosecdef
ORDER BY caller_signature, referenced_schema, referenced_object;

-- Q10. Source-review flags without regular expressions; function source is returned for manual inspection.
WITH normalized_source AS (
  SELECT
    p.oid,
    p.oid::regprocedure::text AS exact_signature,
    lower(translate(p.prosrc, E'\n\r\t', '   ')) AS source_text,
    lower(pg_get_function_identity_arguments(p.oid)) AS identity_arguments,
    p.prosrc
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
)
SELECT
  exact_signature,
  position('execute ' IN source_text) > 0 AS possible_dynamic_sql,
  identity_arguments LIKE '%user_id%'
    OR identity_arguments LIKE '%account_id%'
    OR identity_arguments LIKE '%order_id%' AS accepts_sensitive_identifier,
  position('auth.uid(' IN replace(source_text, ' ', '')) > 0 AS checks_auth_uid,
  position(' from orders ' IN (' ' || source_text || ' ')) > 0
    OR position(' join order_items ' IN (' ' || source_text || ' ')) > 0
    OR position(' from reviews ' IN (' ' || source_text || ' ')) > 0
    OR position(' update product_inventory ' IN (' ' || source_text || ' ')) > 0
    OR position(' into profiles ' IN (' ' || source_text || ' ')) > 0 AS known_unqualified_relation_reference,
  prosrc
FROM normalized_source
ORDER BY exact_signature;

-- Q11. Compact aggregate exposure summary for public SECURITY DEFINER functions.
WITH exposure AS (
  SELECT
    p.oid,
    EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) AS public_execute,
    CASE WHEN to_regrole('anon') IS NULL THEN false
         ELSE has_function_privilege(to_regrole('anon'), p.oid, 'EXECUTE') END AS anon_execute,
    CASE WHEN to_regrole('authenticated') IS NULL THEN false
         ELSE has_function_privilege(to_regrole('authenticated'), p.oid, 'EXECUTE') END AS authenticated_execute,
    CASE WHEN to_regrole('service_role') IS NULL THEN false
         ELSE has_function_privilege(to_regrole('service_role'), p.oid, 'EXECUTE') END AS service_role_execute
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
)
SELECT
  COUNT(*) AS security_definer_count,
  COUNT(*) FILTER (WHERE public_execute) AS public_execute_count,
  COUNT(*) FILTER (WHERE anon_execute) AS anon_execute_count,
  COUNT(*) FILTER (WHERE authenticated_execute) AS authenticated_execute_count,
  COUNT(*) FILTER (WHERE service_role_execute) AS service_role_execute_count,
  COUNT(*) FILTER (
    WHERE NOT public_execute
      AND NOT anon_execute
      AND NOT authenticated_execute
      AND service_role_execute
  ) AS service_role_only_or_restricted_count
FROM exposure;

-- Q12. Is the pg_cron job catalog available? Run optional Q13 only when this is true.
SELECT EXISTS (
  SELECT 1
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'cron'
    AND c.relname = 'job'
) AS cron_job_catalog_available;

-- SUPPLEMENT A. Compact exact ACL summary distinguishing PUBLIC inheritance from direct role ACLs.
WITH exact_acl AS (
  SELECT
    p.oid,
    p.oid::regprocedure::text AS exact_signature,
    pg_get_userbyid(p.proowner) AS function_owner,
    p.proacl,
    EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) AS public_execute,
    EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
      WHERE a.grantee = to_regrole('anon') AND a.privilege_type = 'EXECUTE'
    ) AS direct_anon_execute,
    EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
      WHERE a.grantee = to_regrole('authenticated') AND a.privilege_type = 'EXECUTE'
    ) AS direct_authenticated_execute
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
)
SELECT
  exact_signature,
  function_owner,
  public_execute,
  direct_anon_execute,
  CASE WHEN to_regrole('anon') IS NULL THEN NULL
       ELSE has_function_privilege(to_regrole('anon'), oid, 'EXECUTE') END AS effective_anon_execute,
  direct_authenticated_execute,
  CASE WHEN to_regrole('authenticated') IS NULL THEN NULL
       ELSE has_function_privilege(to_regrole('authenticated'), oid, 'EXECUTE') END AS effective_authenticated_execute,
  CASE WHEN to_regrole('service_role') IS NULL THEN NULL
       ELSE has_function_privilege(to_regrole('service_role'), oid, 'EXECUTE') END AS effective_service_role_execute,
  proacl AS raw_acl
FROM exact_acl
ORDER BY exact_signature;

-- SUPPLEMENT B. PostgreSQL event-trigger attachments for public-schema functions.
SELECT
  e.evtname AS event_trigger_name,
  e.evtevent AS event,
  e.evtenabled AS enabled_state,
  p.oid::regprocedure::text AS exact_function_signature,
  pg_get_userbyid(p.proowner) AS function_owner
FROM pg_event_trigger AS e
JOIN pg_proc AS p ON p.oid = e.evtfoid
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY e.evtname;

-- OPTIONAL Q13. Run separately only if Q12 returned true.
-- SELECT jobid, schedule, command, nodename, database, username, active, jobname
-- FROM cron.job
-- WHERE command ILIKE '%recalculate_%'
--    OR command ILIKE '%cosmoskin_%'
--    OR command ILIKE '%loyalty_%'
--    OR command ILIKE '%routine_%'
--    OR command ILIKE '%inventory_%'
--    OR command ILIKE '%notification_%'
-- ORDER BY jobid;
