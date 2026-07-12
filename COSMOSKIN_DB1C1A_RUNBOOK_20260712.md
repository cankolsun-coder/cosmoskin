# COSMOSKIN DB1C-1A Privileged Function Verification Runbook

Date: 2026-07-12  
Purpose: manual, read-only evidence collection before DB1C-1B authoring.

## Roles

- Operator: runs the approved SELECT-only pack in the intended Supabase project.
- Reviewer: verifies project identity, evidence completeness, and per-signature decisions.
- Application owner: confirms RPC call paths and smoke tests.
- Production approver: authorizes any later DB1C-1B deployment; not part of DB1C-1A.

## Before execution

1. Confirm the Supabase project/environment name and project reference in the SQL Editor.
2. Confirm the query file checksum and that every executable statement begins with `SELECT` or `WITH`.
3. Confirm no production mutation session or migration command is open.
4. Record UTC execution time, operator, project, and DB1C-1A commit/hash once documentation is committed separately.
5. Stop if project identity is ambiguous or the pack has been edited without review.

## Execute manually

Run `COSMOSKIN_DB1C1A_PRIVILEGED_FUNCTION_LIVE_VERIFICATION_QUERIES_20260712.sql` query by query. Do not run the optional pg_cron query unless Q12 proves the catalog exists. Export every result set without altering data.

Suggested evidence filenames use the query number, project/environment, and UTC timestamp. Preserve exact definitions securely because they may contain implementation details.

## Review sequence

1. Reconcile Q1 with the 24 repository identities and seven additional live-only privileged identities.
2. Confirm the total privileged population from Q2; investigate every unexpected definer function.
3. Reconcile Q3/Q4 effective privileges with repository intent. Distinguish PUBLIC-inherited execution from direct role ACL entries.
4. Hash and review Q5 definitions; match each live identity to the correct repository definition candidate.
5. Resolve Q6/Q7 exact signatures and overloads. Any ambiguity blocks DB1C-1B.
6. Reconcile Q8 trigger bindings with the trigger matrix. Trigger-named functions are not trigger-only without this evidence.
7. Use Q9 and Q10 as aids, not complete dependency proof; PL/pgSQL body references require manual source review.
8. Reconcile Q11 public-schema API exposure with the grant decision matrix.
9. Run Q12; run optional Q13 separately only when available, then review scheduler commands for target names.

## Decision update

For each exact signature, attach:

- call-path class A–G;
- current live privilege state;
- required final roles and justification;
- definer necessity;
- path risk and intended treatment;
- trigger/scheduler/nested dependencies;
- smoke tests;
- exact rollback source/ACL/config evidence.

No DB1C-1B migration may be drafted for a row marked unknown, pending, or conflicting.

## Required negative tests for later staging

- anon cannot invoke privileged identities without an explicit anonymous contract;
- authenticated users cannot pass another user's UUID/order/account identifier;
- trigger-only functions are not callable as public RPCs;
- service role can execute confirmed backend RPCs;
- removing direct execution does not disable trigger firing;
- source/path hardening does not change payment, inventory, membership, loyalty, review, notification, or routine outcomes.

## Evidence retention

Store the result exports, exact production definitions, checksums, reviewer sign-off, and project identity in the controlled release record. Do not paste secrets or service-role keys into repository documents.

## Stop and escalate

Stop on unexpected functions, overloads, owner roles, definition drift, unsafe dynamic SQL, caller-controlled identities without checks, unresolved trigger/cron/external calls, incomplete ACL output, or inability to restore the exact prior state.

## Completion criteria

DB1C-1A live verification is complete only when all privileged identities have exact signatures, sources, owners, ACLs, paths, dependency classifications, final grant decisions, smoke tests, and rollback evidence. Completion authorizes design review only; it does not authorize deployment.

