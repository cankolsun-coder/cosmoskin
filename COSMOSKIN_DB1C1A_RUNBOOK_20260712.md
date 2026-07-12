# COSMOSKIN DB1C-1A Privileged Function Verification Runbook

Date: 2026-07-12  
Status: Q1–Q12, compact ACL summary, and event-trigger verification completed manually as read-only operations. Q13 was not run.

## Evidence completed

- Q1: 92 public functions identified.
- Q2: 33 `SECURITY DEFINER` functions and path configuration captured.
- Q3/Q4/Q11 plus compact ACL summary: 20 PUBLIC, 21 effective anon, 21 effective authenticated, 33 service-role executable, and 12 postgres/service-role restricted.
- Q5: exact definitions/checksums available for review.
- Q6/Q7: focused identities resolved; no COSMOSKIN privileged overload found.
- Q8: eight confirmed normal-trigger dependencies.
- Q9/Q10: dependency and source-review evidence collected.
- Q12: `cron.job` catalog unavailable.
- Supplemental event-trigger query: success, no rows.

## Interpretation rules

1. Treat PUBLIC, anon, and authenticated as separate privilege channels.
2. Do not infer that PUBLIC removal closes direct role grants; `cleanup_old_notifications(integer, integer, integer, integer)` is the counterexample.
3. Treat exact live signatures as authoritative over repository guesses.
4. Treat global extension overloads as out of COSMOSKIN scope but continue using exact signatures.
5. Treat normal trigger attachment as evidence that direct API execution is unnecessary, not as permission to change or drop the function.
6. Treat an empty event-trigger result as no current attachment, not as permission to drop `rls_auto_enable()`.
7. Treat missing pg_cron catalog as no pg_cron proof, not proof that no external scheduler exists.

## Evidence retention

Preserve Q1–Q12 exports, the compact exact ACL result, event-trigger result, project reference, UTC execution time, operator, and exact SQL-pack checksum in the controlled release record. Do not store credentials or service keys in the repository.

## DB1C-1B1 readiness review

Before migration authoring, for each proposed signature:

- confirm current PUBLIC/anon/authenticated/service-role state;
- confirm direct backend, browser, trigger, nested, cron, webhook, and external calls;
- confirm owner and exact definition checksum;
- decide the final role set and document every retained API-role privilege;
- define allowed-role and denied-role staging tests;
- capture exact ACL rollback state.

Do not begin DB1C-1B1 while any row is unknown or conflicting.

## Later-lane readiness

- DB1C-1B2 requires exact live trigger definitions and enabled states for all eight confirmed functions.
- DB1C-1B3 requires a complete object-resolution inventory and behavior-preserving prior definition for every source/path target.

## Stop and escalate

Stop on unexpected identities, owner/source drift, direct grants not represented in the matrix, unsafe dynamic SQL, caller-controlled identities without authorization, unresolved external scheduling, incomplete trigger evidence, or inability to restore the exact prior state.

## Completion statement

The DB1C-1A evidence package is complete for security decision-making. Completion does not authorize migration implementation or production mutation.

