# COSMOSKIN DB1C-1A Privileged Function Security Audit

Date: 2026-07-12  
Status: repository audit finalized with manually collected live Supabase read-only evidence. No SQL was executed during this finalization.

## Executive decision

The live catalog contains 92 functions in `public`, including 33 `SECURITY DEFINER` functions. The focused DB1C-1A audit began with 25 privileged identities—18 exact repository identities and seven live-only identities—and the live inventory exposed eight additional privileged identities. The final call-path and grant matrices therefore cover all 33 live definers by exact signature.

The principal risk is direct API execution of privileged code:

- 20 of 33 definers have PUBLIC EXECUTE.
- 21 of 33 are effectively executable by `anon`.
- 21 of 33 are effectively executable by `authenticated`.
- all 33 are executable by `service_role`.
- 12 are already restricted to `postgres`/`service_role`.

`cleanup_old_notifications(integer, integer, integer, integer)` is the decisive special case: PUBLIC execution is closed, but `anon` and `authenticated` have explicit execution. A future hardening migration cannot rely only on removing PUBLIC; it must evaluate and remove privileges from each exact API role for each exact signature.

DB1C-1B1 must remain an ACL-only, exact-signature migration design. Trigger/internal exposure belongs in DB1C-1B2. Function-source and search-path replacement remains deferred to DB1C-1B3. No DB1C-1B migration was created in this batch.

## Evidence boundary

- Repository-audit commit: `9953658 DB1C1A audit privileged function security`.
- Live Q1–Q12 were executed manually in the Supabase SQL Editor as read-only queries.
- The compact exact ACL summary was executed manually.
- A supplemental `pg_event_trigger` query completed successfully with no rows.
- Q12 proved the `cron.job` catalog unavailable; optional Q13 was not run.
- No write SQL, deployment, migration-history operation, function replacement, privilege change, policy change, owner change, or path change occurred.
- Repository migration provenance remains incomplete; live catalog evidence controls the production assessment.

## Live inventory summary

| Measure | Live result | Decision impact |
|---|---:|---|
| Public-schema functions | 92 | Broader than the original focused repository inventory |
| Public-schema `SECURITY DEFINER` functions | 33 | Final privileged inventory population |
| Focused DB1C-1A identities | 25 | 18 repository + seven live-only |
| Additional live definers | 8 | Added to final matrices |
| Direct runtime RPC names | 12 | All use backend/service-role calls |
| Browser/client RPC names | 0 | No direct user-token contract found |
| PUBLIC-executable definers | 20 | Exact-signature removal candidate population |
| Effective anon-executable definers | 21 | Includes explicit grants independent of PUBLIC |
| Effective authenticated-executable definers | 21 | Includes explicit grants independent of PUBLIC |
| Service-role-executable definers | 33 | Retention must still be justified per signature |
| Already restricted to postgres/service role | 12 | No exposure remediation presently indicated |
| Missing explicit search path | 10 | DB1C-1B3 source-review population |
| `search_path=public` | 22 | DB1C-1B3 hardening-review population |
| `search_path=pg_catalog` | 1 | Preserve unless exact source review requires change |
| Confirmed normal trigger dependencies | 8 | Direct API execution is not required for trigger firing |
| Confirmed event-trigger dependencies | 0 | Supplemental query returned no rows |

## Exact repository identities

The 18 repository `SECURITY DEFINER` identities remain:

1. `public.check_purchase(uuid, text)`
2. `public.convert_order_inventory(uuid)`
3. `public.cosmoskin_award_loyalty_for_order(uuid)`
4. `public.cosmoskin_loyalty_balance_for_user(uuid)`
5. `public.cosmoskin_order_points_basis(uuid)`
6. `public.cosmoskin_promote_due_loyalty_points(integer)`
7. `public.cosmoskin_promote_loyalty_for_order(uuid)`
8. `public.cosmoskin_reverse_loyalty_for_order(uuid, text, numeric, text)`
9. `public.get_review_summary(text)`
10. `public.handle_new_auth_user_profile()`
11. `public.handle_new_user_profile()`
12. `public.process_iyzico_payment_failure(uuid, text, text, jsonb)`
13. `public.process_iyzico_payment_success(uuid, text, text, jsonb)`
14. `public.recalculate_customer_membership(uuid)`
15. `public.release_expired_inventory_reservations(integer)`
16. `public.release_order_inventory(uuid, text)`
17. `public.reserve_order_inventory(uuid, jsonb, timestamptz, text)`
18. `public.reserve_product_inventory(text, integer)`

The seven previously live-only focused identities are now resolved as:

- `public.recalculate_loyalty_account(uuid)`
- `public.recalculate_routine_streak(uuid, date)`
- `public.cosmoskin_activity_order_insert()`
- `public.cosmoskin_activity_order_update()`
- `public.loyalty_ledger_recalculate_trigger()`
- `public.routine_completion_recalculate_trigger()`
- `public.cleanup_old_notifications(integer, integer, integer, integer)`

The additional live identities covered by the final matrices are:

- `public.create_account_activity(uuid, text, text, text, text, text, jsonb)`
- `public.refresh_inventory_estimate(uuid)`
- `public.cosmoskin_activity_routine_complete()`
- `public.sync_review_helpful_count()`
- `public.cosmoskin_activity_offer_insert()`
- `public.cosmoskin_activity_points_insert()`
- `public.handle_new_user()`
- `public.rls_auto_enable()`

## Application call paths

Twelve distinct direct RPC names are present in runtime code:

- Inventory: `reserve_order_inventory`, `release_order_inventory`, `convert_order_inventory`, `release_expired_inventory_reservations`.
- Loyalty/membership: `cosmoskin_award_loyalty_for_order`, `cosmoskin_promote_loyalty_for_order`, `cosmoskin_promote_due_loyalty_points`, `cosmoskin_reverse_loyalty_for_order`, `cosmoskin_loyalty_balance_for_user`, `recalculate_customer_membership`.
- Payments: `process_iyzico_payment_success`, `process_iyzico_payment_failure`.

All direct runtime RPC calls pass through the backend helper and use service-role credentials. No browser/client `.rpc()` or direct user-JWT RPC call was found. Static absence does not rule out an external scheduler, webhook, operator procedure, or consumer outside this repository.

## ACL findings

### Already restricted

Twelve exact signatures are live with execution restricted to `postgres`/`service_role`:

- inventory lifecycle: `reserve_order_inventory`, `release_order_inventory`, `convert_order_inventory`, `release_expired_inventory_reservations`;
- loyalty helpers: `cosmoskin_award_loyalty_for_order`, `cosmoskin_promote_loyalty_for_order`, `cosmoskin_promote_due_loyalty_points`, `cosmoskin_reverse_loyalty_for_order`, `cosmoskin_loyalty_balance_for_user`, `cosmoskin_order_points_basis`;
- payment finalization: `process_iyzico_payment_success`, `process_iyzico_payment_failure`.

These functions require regression verification but no broad-exposure remediation based on the live ACL result.

### Exposed population

Twenty definers receive execution through PUBLIC. Because API roles inherit PUBLIC privileges, this produces effective anon/authenticated execution. One additional function, `cleanup_old_notifications(integer, integer, integer, integer)`, has PUBLIC closed but direct anon/authenticated privileges. Thus 21 functions require exact-role review.

The highest-risk exposed identities are:

- `public.reserve_product_inventory(text, integer)`
- `public.cleanup_old_notifications(integer, integer, integer, integer)`
- `public.recalculate_customer_membership(uuid)`
- `public.recalculate_loyalty_account(uuid)`
- `public.recalculate_routine_streak(uuid, date)`
- `public.create_account_activity(uuid, text, text, text, text, text, jsonb)`
- `public.refresh_inventory_estimate(uuid)`
- `public.check_purchase(uuid, text)`

No repository evidence establishes a legitimate anonymous or direct authenticated-client contract for any privileged function. Active direct RPCs use service role. Retained API-role execution would therefore require separate, affirmative evidence and identity/ownership tests.

## Normal trigger dependencies

Live Q8 confirms eight `SECURITY DEFINER` functions attached to normal table triggers:

1. `public.cosmoskin_activity_order_insert()`
2. `public.cosmoskin_activity_order_update()`
3. `public.cosmoskin_activity_routine_complete()`
4. `public.handle_new_auth_user_profile()`
5. `public.handle_new_user_profile()`
6. `public.loyalty_ledger_recalculate_trigger()`
7. `public.routine_completion_recalculate_trigger()`
8. `public.sync_review_helpful_count()`

Direct execution by PUBLIC, anon, or authenticated is not required for an already-bound PostgreSQL trigger to fire. DB1C-1B2 must preserve the trigger definitions and enabled states while removing unnecessary API exposure.

Three trigger-returning functions have no confirmed live table-trigger attachment:

- `public.cosmoskin_activity_offer_insert()`
- `public.cosmoskin_activity_points_insert()`
- `public.handle_new_user()`

They are orphan/legacy candidates, not deletion candidates. External or dynamically managed dependencies remain possible until separately reviewed.

## Event-trigger result

The supplemental `pg_event_trigger` query completed successfully and returned no rows. No `public`-schema function is attached to a live PostgreSQL event trigger. In particular, `public.rls_auto_enable()` has no confirmed event-trigger attachment. It must not be dropped in DB1C-1B; mark it as a legacy/orphan candidate pending separate provenance, external-dependency, and intent review.

## Search-path findings

Live Q2 produced:

- 10 definers without an explicit path;
- 22 with `search_path=public`;
- one with `search_path=pg_catalog`.

`public.check_purchase(uuid, text)` and `public.get_review_summary(text)` are confirmed missing an explicit path and use unqualified relations. They remain the clearest object-shadowing candidates. No search-path or source change belongs in ACL-only DB1C-1B1 or trigger ACL DB1C-1B2. All definition replacement and path narrowing remains deferred to DB1C-1B3 after exact source, owner, dependency, and staging behavior review.

## Overloads

No COSMOSKIN privileged-function overload was found live. The global overload query returned extension functions such as `citext`, not COSMOSKIN application functions. Every future privilege/configuration statement must nevertheless use schema plus exact identity argument types; a later overload must not silently broaden scope.

## Cron and external scheduling

Q12 showed that `cron.job` is unavailable, so optional Q13 was not run. No pg_cron execution was proven. This does not prove that an external scheduler, Cloudflare cron endpoint, operator process, or another integration does not invoke a function. External execution remains a stop condition for identities without a closed call path.

## SECURITY DEFINER necessity

- Probably required: payment finalization, inventory lifecycle, loyalty/membership maintenance, and confirmed trigger functions that cross RLS or write protected aggregates.
- Possibly reducible later: pure/internal helpers such as `cosmoskin_order_points_basis` after nested-call tests.
- Unknown: legacy/unattached trigger-returning functions, `reserve_product_inventory`, `refresh_inventory_estimate`, `cleanup_old_notifications`, `check_purchase`, `get_review_summary`, and `rls_auto_enable`.
- Any privileged function accepting a user/account/order identifier must be service-only or enforce authenticated identity and row ownership internally. Definer status is not an authorization boundary.

## Recommended final grant model

- PUBLIC: no privileged function has a proven requirement.
- anon: no privileged function has a proven requirement.
- authenticated: no direct privileged client RPC contract was found.
- service_role: retain for the 12 active backend RPC names and any additional trusted operational path proven before migration authoring.
- trigger/internal: retain owner-trigger execution; remove direct API-role exposure only after dependency review.
- orphan/legacy candidates: close exposure only after external-consumer review; do not drop in DB1C-1B.

The future migration must evaluate PUBLIC, anon, and authenticated independently. `cleanup_old_notifications` proves that PUBLIC removal cannot substitute for exact direct-role removal.

## DB1C-1B sequencing decision

1. **DB1C-1B1 — exact ACL hardening:** ACL-only changes for confirmed service/internal-only exposed functions. No source, owner, policy, trigger, or path changes.
2. **DB1C-1B2 — trigger/internal ACL hardening:** the eight confirmed trigger functions plus separately proven internal-only identities, preserving trigger behavior.
3. **DB1C-1B3 — search-path/source hardening:** reviewed source replacement and path narrowing for the 10 missing-path and 22 public-path functions. Prioritize `check_purchase` and `get_review_summary`.

No lane may begin until its exact signature list, pre-change ACL, owner, definition checksum, dependency evidence, smoke tests, and exact rollback state are approved.

## Stop conditions

Stop if an exact signature, live source, owner, explicit/direct ACL, normal/event trigger dependency, nested call, external caller, or rollback state is unresolved; if dynamic SQL is caller-influenced; if identity inputs lack authorization proof; if source/path resolution could change behavior; or if staging cannot prove allowed-role success, disallowed-role failure, and preserved trigger/backend behavior.

## Deliverables

- `COSMOSKIN_DB1C1A_FUNCTION_CALL_PATH_MATRIX_20260712.csv`: all 33 live definers, call classes, exposure, and dependency decisions.
- `COSMOSKIN_DB1C1A_FUNCTION_GRANT_DECISION_MATRIX_20260712.csv`: exact-signature current and proposed role treatment.
- `COSMOSKIN_DB1C1A_TRIGGER_DEPENDENCY_MATRIX_20260712.csv`: eight confirmed normal triggers, three unattached trigger-returning candidates, and event-trigger evidence.
- `COSMOSKIN_DB1C1A_PRIVILEGED_FUNCTION_LIVE_VERIFICATION_QUERIES_20260712.sql`: corrected SELECT-only Q1–Q12 plus supplemental exact ACL and event-trigger queries; Q13 remains optional/commented.

## Deferred

- DB1C-1B1, DB1C-1B2, and DB1C-1B3 migration implementation.
- Any function, privilege, policy, owner, trigger, schema, or path mutation.
- Deletion of `rls_auto_enable` or any unattached trigger-returning function.
- Migration-history repair, deployment, and production remediation.
