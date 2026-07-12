# COSMOSKIN DB1C-1A Rollback and Stop Conditions

Date: 2026-07-12  
Scope: safety requirements for the future DB1C-1B work. No rollback or mutation script is included.

## Non-negotiable stop conditions

Stop before migration authoring or deployment when any target has:

- unknown exact identity argument types or unresolved overloads;
- a production definition that differs from the reviewed repository definition;
- an unknown or unsuitable owner;
- unresolved direct RPC, external integration, trigger, nested-function, webhook, or scheduled call path;
- unsafe dynamic SQL or caller-influenced identifiers/fragments;
- an arbitrary `user_id`, `account_id`, or `order_id` without proven authorization controls;
- an uncertain retained role privilege;
- path resolution that may change when narrowed;
- incomplete storage of the prior definition, configuration, ACL, owner, and checksum;
- a rollback that cannot restore the exact prior state;
- incomplete live result sets or ambiguous project identity;
- failed staging smoke or negative tests;
- missing production backup/snapshot or manual approval.

## Rollback evidence per exact signature

Capture before any future change:

- schema, name, identity arguments, return type, language, volatility, leakproof and parallel attributes;
- exact `pg_get_functiondef` output and checksum;
- owner and owner-role evidence;
- `proconfig`, including current path;
- raw and expanded ACL plus effective API-role privileges;
- trigger definitions and enabled states;
- function-to-function and scheduler dependencies;
- production behavior snapshots for the applicable domain.

## Rollback boundaries

### ACL-only lane

Restore the exact prior per-signature privilege state. Function definition, owner, path, and trigger bindings must remain unchanged. If any of those changed unexpectedly, stop and use the broader incident procedure.

### Trigger/internal exposure lane

Restore only prior direct-execution privileges when rollback is necessary; never recreate or alter a trigger as part of an ACL rollback. Verify trigger behavior before and after.

### Search-path/source lane

Restore the exact captured prior definition and configuration for the exact signature, then verify its checksum, owner, ACL, trigger bindings, and domain behavior. A repository approximation is not a valid rollback source.

## Rollback triggers

- required backend or scheduler RPC receives a permission error;
- trigger stops firing or fires recursively;
- PostgREST reports missing/ambiguous function identity;
- payment finalization, inventory reservation/conversion/release, membership, loyalty, routine streak, or auth-profile creation changes behavior;
- allowed role fails or disallowed role succeeds;
- function definition/owner changes outside the approved lane;
- unexpected cross-user mutation or privilege escalation is observed.

## Production safety sequence

1. Stop the rollout and prevent further migration execution.
2. Preserve logs and current catalog evidence.
3. Determine the affected migration lane and exact signatures.
4. Apply only the pre-reviewed exact-state rollback under manual authorization.
5. Re-run read-only identity, owner/config, ACL, definition, trigger, and exposure verification.
6. Run domain smoke tests and review error telemetry.
7. Document the incident and do not retry until the root cause is resolved in staging.

## Explicit exclusions

Rollback must not modify migration-history rows, bulk-mark legacy migrations, run the canonical baseline on production, move schemas broadly, or combine unrelated owner/policy/table changes.

