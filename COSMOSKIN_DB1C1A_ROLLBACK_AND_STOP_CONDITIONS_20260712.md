# COSMOSKIN DB1C-1A Rollback and Stop Conditions

Date: 2026-07-12  
Scope: safety requirements for future DB1C-1B1/1B2/1B3 work. No rollback or mutation script is included.

## Live conditions that shape rollback

- 20 functions inherit API exposure through PUBLIC.
- one additional function, `cleanup_old_notifications(integer, integer, integer, integer)`, has direct anon/authenticated execution while PUBLIC is closed.
- 12 functions are already postgres/service-role restricted.
- eight functions have confirmed normal-trigger dependencies.
- no public function has a confirmed event-trigger dependency.
- `rls_auto_enable()` is an unattached legacy/orphan candidate and must not be dropped.
- no pg_cron catalog is available; external scheduling remains unresolved.

## Non-negotiable stop conditions

Stop before authoring or deploying a future migration when any target has:

- an unknown exact signature or unresolved live identity;
- an unexpected overload;
- unknown owner, live definition, checksum, path, or direct/effective ACL;
- unresolved backend, browser, normal trigger, event trigger, nested, webhook, scheduler, operator, or external call path;
- unsafe dynamic SQL or caller-influenced identifiers;
- arbitrary user/account/order input without authorization proof;
- an uncertain retained role;
- a path change that may alter object resolution;
- incomplete exact rollback state;
- failed allowed-role, denied-role, trigger, or workflow staging tests;
- missing backup/snapshot or production approval.

## Evidence required per exact signature

Capture identity arguments, result/language/volatility attributes, exact definition and checksum, owner, `proconfig`, raw/default/effective ACL, normal/event-trigger definitions and enabled states, nested dependencies, scheduler/external evidence, and domain behavior snapshots.

## Rollback boundaries

### DB1C-1B1 ACL-only

Restore the exact prior ACL, including independent PUBLIC, anon, authenticated, service-role, and owner entries. Do not assume restoring PUBLIC restores direct role entries.

### DB1C-1B2 trigger/internal ACL

Restore only the exact prior ACL. Never recreate, disable, or replace a trigger as part of an ACL rollback. Confirm all eight normal triggers remain attached and enabled.

### DB1C-1B3 source/path

Restore the exact captured prior function definition and configuration, then verify its checksum, owner, ACL, trigger dependencies, and domain behavior. A repository approximation is not a rollback source.

## Rollback triggers

- an allowed backend/service call fails;
- anon or authenticated execution remains possible unexpectedly;
- a normal trigger stops, recurses, or mutates the wrong account/user/order;
- PostgREST reports a missing or ambiguous signature;
- payment, inventory, loyalty, membership, routine, review, profile, activity, or notification behavior changes;
- an owner, definition, trigger, policy, or path changes outside the approved lane.

## Incident sequence

1. Stop further rollout.
2. Preserve logs and current read-only catalog evidence.
3. Identify the exact signatures and migration lane.
4. Apply only the pre-reviewed exact-state rollback with human approval.
5. Re-run identity, ACL, definition, owner/configuration, normal-trigger, and event-trigger verification.
6. Run domain smoke and denial tests.
7. Document the incident and do not retry until resolved in staging.

## Explicit exclusions

Rollback must not edit migration-history rows, run a bootstrap baseline on production, move schemas broadly, delete orphan candidates, or combine unrelated function, policy, table, owner, or path changes.
