# COSMOSKIN DB1C-1B1 ACL Rollback Plan

Date: 2026-07-12
Status: review only; manual authorization required.

## Rollback boundary

DB1C-1B1 changes only direct function EXECUTE ACLs. Rollback therefore restores only the exact pre-migration grants recorded in `COSMOSKIN_DB1C1B1_FUNCTION_ACL_TARGET_MANIFEST_20260712.csv`.

It must not change function bodies, owners, `SECURITY DEFINER` state, search paths, triggers, policies, schemas, or migration-history rows.

## Exact before-state restoration

- Twenty functions received effective anon/authenticated execution through PUBLIC. Rollback restores PUBLIC only; it does not fabricate direct anon/authenticated grants.
- `cleanup_old_notifications(integer, integer, integer, integer)` had PUBLIC closed and direct anon/authenticated grants. Rollback restores those two direct grants only.
- `service_role` execution existed before migration for all 33 live definers and is never removed by DB1C-1B1. Rollback therefore requires no service-role operation.
- Twelve already-restricted functions receive no forward or rollback statement.

The review-only SQL contains 21 exact-signature restoration statements and no broad schema/function wildcard.

## Authorization gates

Rollback is permitted only when an approved deployment causes a confirmed backend, trigger, or operational regression and the failure cannot be corrected safely while preserving the hardened ACL.

Before rollback:

1. preserve post-deploy ACL, owner, MD5, and trigger verification results;
2. identify the exact failing signature/call path;
3. confirm the rollback SQL matches the manifest before-state;
4. obtain database/security/application-owner authorization;
5. prefer a targeted subset when only one signature requires restoration;
6. execute in staging first when time and incident severity permit.

## Post-rollback verification

Run the DB1C-1B1 preflight pack and verify the restored role pattern matches the manifest. Re-run backend and trigger smoke tests. Record that rollback reopens a known privileged API surface and create an incident follow-up before any redeployment.

## Stop conditions

Do not roll back if the failing behavior is unrelated to EXECUTE ACLs, the live function identity differs, the before-state ACL cannot be proven, the rollback would restore broader access than recorded, or function/trigger/owner/definition drift is present.
