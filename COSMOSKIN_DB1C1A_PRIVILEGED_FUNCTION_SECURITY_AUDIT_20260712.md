# COSMOSKIN DB1C-1A Privileged Function Security Audit

Date: 2026-07-12  
Scope: repository evidence and a production read-only verification package; no live SQL was executed.

## Executive decision

DB1C-1B must not be implemented until the live query pack resolves exact signatures, owners, definitions, trigger dependencies, and effective role privileges. Repository evidence supports least-privilege hardening, but it does not support a single blanket privilege rule for every function.

The inventory contains 24 distinct repository function identities. Eighteen are explicitly `SECURITY DEFINER`. Seven additional privileged identities appear only in DB1/DB1B live evidence, so the privileged-function scope is 25 identities. Only `recalculate_loyalty_account(uuid)` has an expected live-only signature; the other six live-only identities require `pg_get_function_identity_arguments` evidence before any exact-signature migration can be authored. `cleanup_old_notifications` is treated as an additional live-only exposure candidate from the DB1 preflight evidence.

The repository application has 12 distinct direct RPC names. All identified runtime RPCs go through `functions/api/_lib/supabase.js`, which authenticates to PostgREST with the service-role key. No browser-side authenticated RPC call was found. This evidence strongly supports service-role-only grants for the active mutation and administrative RPC set.

## Pre-check and evidence boundary

- HEAD at audit start: `929c64e DB1C0 define migration baseline and apply-state strategy`.
- DB1B commit `4f40988` and DB1 commit `2b6ed8d` are present.
- Working tree was clean at audit start.
- `products.json`, `supabase/migrations`, and application files had no diff.
- Production evidence is limited to the manually supplied DB1B result set and prior DB1 reports. This audit did not connect to Supabase.
- Repository migration provenance is known to be incomplete. A repository definition is not proof that the same source or privilege state is live.

## Inventory summary

| Measure | Count | Interpretation |
|---|---:|---|
| Distinct repository function identities | 24 | 18 definer; 6 invoker/default |
| Exact repository `SECURITY DEFINER` identities | 18 | Exact identity arguments available |
| Additional live-only privileged identities | 7 | Six signatures unresolved; one expected `(uuid)` |
| Privileged identities in DB1C-1A scope | 25 | 18 repository + 7 additional live-only |
| Distinct direct RPC names in application/tests | 12 | Runtime path uses service role |
| Confirmed privileged trigger/internal functions | 3 | Two auth triggers and one internal helper |
| Additional privileged trigger candidates | 4 | Live trigger catalog evidence required |
| Repository overloads | 0 | Live overloads still must be queried |
| Identities with multiple repository definitions | 11 | Replacement-order and source-drift risk |

## Repository `SECURITY DEFINER` inventory

The exact repository identities are:

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

The seven additional live-only privileged identities are `recalculate_loyalty_account`, `recalculate_routine_streak`, `cosmoskin_activity_order_insert`, `cosmoskin_activity_order_update`, `loyalty_ledger_recalculate_trigger`, `routine_completion_recalculate_trigger`, and `cleanup_old_notifications`. Their production definitions are mandatory evidence, not assumptions.

## Application call-path findings

`functions/api/_lib/supabase.js` constructs `/rest/v1/rpc/{functionName}` requests and sends the service-role key as both API key and bearer credential. The 12 direct RPC names found are:

- Inventory: `reserve_order_inventory`, `release_order_inventory`, `convert_order_inventory`, `release_expired_inventory_reservations`.
- Loyalty/membership: `cosmoskin_award_loyalty_for_order`, `cosmoskin_promote_loyalty_for_order`, `cosmoskin_promote_due_loyalty_points`, `cosmoskin_reverse_loyalty_for_order`, `cosmoskin_loyalty_balance_for_user`, `recalculate_customer_membership`.
- Payments: `process_iyzico_payment_success`, `process_iyzico_payment_failure`.

No static browser `supabase.rpc`, `client.rpc`, or authenticated-user-token RPC path was found. `cosmoskin_promote_due_loyalty_points` has a service helper but no active endpoint or scheduler reference in the inspected code. The absence of a static call does not prove a function is unused: database triggers, pg_cron, PostgREST consumers outside this repository, and operator procedures remain possible.

## Trigger dependency findings

Two privileged repository trigger targets are proven:

- `public.handle_new_auth_user_profile()` is connected to `on_auth_user_created_profile`, an `AFTER INSERT` trigger on `auth.users`.
- `public.handle_new_user_profile()` is connected to `on_auth_user_created_cosmoskin_profile`, an `AFTER INSERT` trigger on `auth.users`.

Direct API-role EXECUTE is not required for PostgreSQL to invoke an already-bound trigger function. The four live function names containing activity/ledger/routine trigger semantics remain candidates, not proven trigger-only functions, until `pg_trigger` evidence supplies the exact target table, trigger definition, enabled state, and function identity.

The privileged internal helper `public.cosmoskin_order_points_basis(uuid)` is called by other database functions and has no application RPC reference. It should have no API-role exposure unless live evidence proves a separate contract.

## Privilege findings

Twelve repository privileged RPCs explicitly remove broad API-role access and retain service-role execution in their defining SQL. Six repository privileged identities contain no explicit repository privilege normalization:

- `check_purchase(uuid, text)`
- `get_review_summary(text)`
- `handle_new_auth_user_profile()`
- `handle_new_user_profile()`
- `recalculate_customer_membership(uuid)`
- `reserve_product_inventory(text, integer)`

Because PostgreSQL function EXECUTE defaults can expose functions to PUBLIC, these six are candidates for broad live exposure until Q3/Q4 proves otherwise. DB1B separately confirmed anon and authenticated execution for seven functions: the three recalculation functions and four activity/ledger/routine trigger-named functions. DB1 evidence also flagged `reserve_product_inventory` and `cleanup_old_notifications` as callable by anon and/or authenticated, but the exact role matrix remains pending.

The audit therefore records 13 PUBLIC/default-exposure candidates: the six repository identities without an explicit privilege block, six additional DB1B live-only names beyond `recalculate_customer_membership`, and `cleanup_old_notifications`. This is a verification population, not a claim that all 13 currently have an explicit PUBLIC ACL.

## Search-path findings

Two repository privileged functions have no explicit search path and use unqualified relations:

- `check_purchase(uuid, text)` references `orders`, `order_items`, and `product_id_to_slug` without schema qualification.
- `get_review_summary(text)` references `reviews` without schema qualification.

The other 16 repository privileged identities specify `search_path = public`. That is better than caller-controlled resolution, but it is not the preferred final state when `public` can contain objects created by non-governed roles. They are candidates for fully qualified references plus an empty or minimal trusted path. A path change must not precede source review because operators, casts, extension functions, and helper calls may resolve differently.

The seven live-only privileged identities have unknown configuration. Accordingly, nine functions require explicit-path resolution in the live pack: two confirmed missing in repository SQL and seven live-only unknowns. Two functions have confirmed unsafe/unqualified relation references; the 16 `public`-path functions require hardening review rather than being labelled immediately exploitable.

## Replacement and overload risk

No repository function name has multiple argument-type signatures. Live overloads are still a hard stop until Q6/Q7 is executed. Eleven identities have multiple repository definitions, often in root/manual SQL and migrations: `check_purchase`, `convert_order_inventory`, `get_review_summary`, both auth-profile handlers, both Iyzico handlers, `recalculate_customer_membership`, and the three inventory lifecycle RPCs. The final live definition can therefore differ from the apparent repository final definition.

All future privilege and configuration changes must target `schema.name(identity_argument_types)`, never a name alone. DB1C-1B must archive the exact pre-change definition, owner, `proconfig`, and ACL obtained from production.

## Mandatory function-specific review

### `public.recalculate_customer_membership(uuid)`

- Direct callers: service-role backend membership, loyalty-ledger, cron, and user-recalculation paths.
- Repository behavior: reads orders, loyalty and membership basis; writes membership status/history; accepts a caller-supplied user UUID; does not use `auth.uid()` as an authorization boundary.
- Live exposure: DB1B reports anon and authenticated execution.
- Decision: probably requires definer semantics for cross-RLS server maintenance, but only service role should execute it directly. Retain trigger/scheduler dependencies if live evidence reveals any.
- Search path: repository uses `public`; fully qualify before narrowing.
- Smoke test: membership endpoint, one-user recalculation, cron sample, tier/lifetime-spend/points result, and no duplicate history event.

### `public.recalculate_loyalty_account(uuid)`

- Expected signature: `(uuid)` from prior verification notes; production must confirm.
- Repository caller/source: none found.
- Live exposure: DB1B reports anon and authenticated execution.
- Decision: no public or user-token execution is justified by repository evidence. Determine whether it is trigger, scheduler, legacy, or external-service driven; grant service role only if a trusted call path is proven.
- Search path and definer necessity: unknown until source is captured.
- Smoke test: exact before/after balance and ledger invariants if retained.

### `public.recalculate_routine_streak(<live identity arguments required>)`

- Signature, source, callers, and target tables are unresolved.
- Live exposure: DB1B reports anon and authenticated execution.
- Decision: hard stop. Do not write a migration until identity arguments, ownership checks, trigger/cron paths, and user-identifier handling are proven.
- Smoke test: routine completion and streak idempotency for the authenticated owner.

### `public.cosmoskin_activity_order_insert(<live identity arguments required>)`

- Name suggests a trigger target, but repository SQL does not prove this.
- Live exposure: DB1B reports anon and authenticated execution.
- Decision: query `pg_trigger`; if trigger-only, remove all API-role execution and retain owner/trigger behavior. Inspect whether the body trusts `NEW.user_id` or derives identity from the linked order.
- Smoke test: order insertion produces exactly one expected activity mutation and no cross-user write.

### `public.cosmoskin_activity_order_update(<live identity arguments required>)`

- Name suggests a trigger target; signature and dependency remain unresolved.
- Live exposure: DB1B reports anon and authenticated execution.
- Decision: same proof requirements as the insert function, plus update recursion and status-transition review.
- Smoke test: permitted order status transition, idempotent repeated update, no recursive activity loop.

### `public.loyalty_ledger_recalculate_trigger(<live identity arguments required>)`

- Name suggests a trigger target that may mutate loyalty account aggregates.
- Live exposure: DB1B reports anon and authenticated execution.
- Decision: verify trigger table/events and recursion; direct API execution should not survive if trigger-only.
- Smoke test: ledger insert/update/delete paths produce the expected account balance exactly once.

### `public.routine_completion_recalculate_trigger(<live identity arguments required>)`

- Name suggests a trigger target that may call the routine-streak function.
- Live exposure: DB1B reports anon and authenticated execution.
- Decision: verify trigger and function-to-function dependencies. Remove API exposure only after the chain is proven.
- Smoke test: completion mutation updates the correct user's streak without recursion or cross-user effects.

## SECURITY DEFINER necessity

- Probably required: inventory lifecycle, payment finalization, loyalty/membership mutation RPCs, and auth-user trigger handlers because they perform trusted server or cross-RLS work.
- Unnecessary or reducible pending tests: `cosmoskin_order_points_basis(uuid)` may be invoker-safe when called only by a definer; the two read-oriented review helpers may not need definer semantics.
- Unknown: `reserve_product_inventory`, all six DB1B live-only identities other than the source-known membership function, and `cleanup_old_notifications`.
- Any function accepting `user_id`, `account_id`, or `order_id` must either be service-role-only or prove internal ownership checks. Definer status plus caller-controlled identity is not acceptable as an authenticated-client boundary by itself.

## Owner and schema governance

Production owner evidence is required. A suitable owner is a controlled, non-API database/deployment role; API roles and transient personal roles are unsuitable. Owner changes should not be bundled into the first privilege migration unless the current owner itself is a demonstrated security defect and staging proves the replacement.

Keep existing public-schema identities during DB1C-1B. Moving functions to a private schema could break PostgREST routes, triggers, cron commands, or external callers. Private/internal schema placement is a later governance improvement after dependency closure.

## Recommended grant model

- PUBLIC: no privileged function requires PUBLIC execution based on repository evidence.
- anon: no privileged function has a proven anonymous contract.
- authenticated: no privileged function has a proven direct user-token RPC contract in this repository.
- service_role: retain for the 12 active service RPC names and for any live-only operational function whose trusted server/scheduler path is proven.
- trigger/internal: remove API-role exposure while preserving trigger bindings and owner execution.
- legacy/unused: remove API-role exposure only after external consumer, cron, webhook, and trigger checks are complete; defer removal or definer conversion.

Each retained grant must be justified per exact signature in the grant decision matrix. The live ACL, not repository intent, is the source for the pre-change state and rollback.

## Highest-risk findings

1. `recalculate_customer_membership(uuid)` combines arbitrary user input, definer authority, active server use, and confirmed anon/authenticated exposure.
2. `recalculate_loyalty_account` and `recalculate_routine_streak` have confirmed API exposure but no canonical repository source.
3. Four trigger-named functions appear API-executable despite having no proven direct-RPC need.
4. `reserve_product_inventory` and `cleanup_old_notifications` have exposure evidence and unclear current provenance/call paths.
5. `check_purchase` and `get_review_summary` combine default-grant risk, missing explicit path, unqualified relations, and manual/root SQL provenance.
6. Multiple function replacements make repository source an unreliable proxy for production source.

## DB1C-1B decision

Use Option 2: separate forward migrations by risk and evidence boundary.

1. Exact-signature privilege normalization for confirmed service-role RPCs; no body replacement.
2. Exact-signature API-role removal for proven trigger/internal functions; no trigger replacement.
3. Search-path/source hardening only after exact definition review and staging regression; preserve behavior with fully qualified references.
4. Any intentionally retained authenticated RPC must be isolated and documented with `auth.uid()`/ownership proof. None is currently evidenced.

This split keeps ACL rollback independent from source replacement and limits the blast radius of trigger or resolution changes.

## Stop conditions

DB1C-1B remains blocked if any target has unresolved identity arguments or overloads; unresolved direct, trigger, scheduler, webhook, or external call paths; unknown owner; dynamic SQL influenced by caller input; arbitrary identity input without authorization proof; source drift from repository; uncertain role requirement; behavior-sensitive path resolution; incomplete rollback capture; or incomplete live evidence.

## Deliverable cross-reference

- Call classifications and file evidence: `COSMOSKIN_DB1C1A_FUNCTION_CALL_PATH_MATRIX_20260712.csv`.
- Proposed exact-signature privileges: `COSMOSKIN_DB1C1A_FUNCTION_GRANT_DECISION_MATRIX_20260712.csv`.
- Trigger relationships: `COSMOSKIN_DB1C1A_TRIGGER_DEPENDENCY_MATRIX_20260712.csv`.
- Live read-only evidence pack: `COSMOSKIN_DB1C1A_PRIVILEGED_FUNCTION_LIVE_VERIFICATION_QUERIES_20260712.sql`.
- Resolution strategy: `COSMOSKIN_DB1C1A_SEARCH_PATH_HARDENING_PLAN_20260712.md`.
- Migration structure only: `COSMOSKIN_DB1C1A_DB1C1B_MIGRATION_DESIGN_20260712.md`.
- Manual execution and evidence handling: `COSMOSKIN_DB1C1A_RUNBOOK_20260712.md`.
- Recovery boundaries: `COSMOSKIN_DB1C1A_ROLLBACK_AND_STOP_CONDITIONS_20260712.md`.

## Deferred

- All live SQL execution and interpretation of returned result sets.
- Function, grant, owner, policy, trigger, or schema changes.
- DB1C-1B migration authoring.
- Private-schema moves and broader owner governance.
- Migration-history reconciliation, deployment, and production remediation.
