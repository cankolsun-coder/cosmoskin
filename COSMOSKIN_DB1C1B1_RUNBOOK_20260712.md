# COSMOSKIN DB1C-1B1 Manual Runbook

Date: 2026-07-12
Status: manual approval only; no execution authorized by this document.

## Phase 0 — release gate

Confirm a current backup/snapshot, project identity, maintenance window, migration checksum, exact 33-row manifest, clean Git state, and approval from database security and application owners. Stop on any mismatch.

## Phase 1 — preflight

Run the SELECT-only preflight pack manually. Save every result with UTC time and project reference.

Required results:

- expected/existing target count: 21/21;
- missing signature count: 0;
- COSMOSKIN overload target count: 0;
- SECURITY DEFINER drift count: 0;
- current ACL matches the manifest;
- all 33 manifest identities and 12 no-change functions remain accounted for;
- six supplied owner/MD5 baselines match;
- seven supplied trigger attachments match exactly;
- full eight-function/nine-attachment trigger inventory is captured for later comparison;
- `handle_new_auth_user_profile()` / `on_auth_user_created_profile` and `handle_new_user_profile()` / `on_auth_user_created_cosmoskin_profile` are present in the catalog inventory, while their exact owner/MD5/enabled-state baselines remain deferred.

Do not deploy when any result differs.

## Phase 2 — staging deployment

Apply only the single DB1C-1B1 migration to staging using the approved migration lane. Do not edit migration history and do not run a baseline migration.

The migration transaction must complete atomically. It performs only exact-signature EXECUTE privilege operations after fail-safe identity and trigger-baseline checks.

## Phase 3 — staging verification

Run the SELECT-only post-deploy pack. Required summary:

- target count 21;
- PUBLIC/anon/authenticated exposure remaining 0/0/0;
- service-role mismatch count 0;
- missing signature count 0;
- SECURITY DEFINER drift count 0;
- supplied definition/owner drift count 0;
- supplied trigger-invariant mismatches 0;
- full eight-function/nine-attachment trigger inventory identical to the saved preflight output;
- no claim that the two auth-profile trigger attachments have embedded exact baselines: they must be compared to the saved preflight export until separately baselined.

## Phase 4 — staging smoke tests

Exercise:

1. inventory reserve/release/convert and expired-release backend paths;
2. loyalty award/promote/reverse/balance and membership recalculation;
3. Iyzico success/failure finalization test fixtures;
4. order insert/update activity triggers;
5. routine completion activity and streak triggers;
6. loyalty ledger recalculation trigger;
7. review-helpful insert/delete synchronization;
8. new-auth-user profile creation;
9. negative direct calls as anon/authenticated for all 21 targets.

Do not use production customer/payment data.

## Phase 5 — production approval and deployment

Only after staging and rollback review, obtain explicit human authorization. Apply the immutable migration once. Do not run SQL snippets independently, repair history, or make adjacent changes.

## Phase 6 — production verification

Immediately run the post-deploy SELECT pack, compare the full trigger/function output to preflight, run bounded backend/trigger smoke checks, and monitor PostgREST/backend errors. Stop and evaluate rollback on any permission or trigger regression.

## Rollback

Use the review-only rollback only with separate authorization. Prefer the smallest exact-signature subset needed. Rollback deliberately restores a known exposed before-state and therefore requires an incident follow-up.
