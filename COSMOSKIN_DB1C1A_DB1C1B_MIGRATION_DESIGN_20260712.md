# COSMOSKIN DB1C-1A Design for DB1C-1B

Date: 2026-07-12  
Status: design only. DB1C-1B1 has not started and no migration SQL was created.

## Live evidence controlling the design

- 33 public-schema `SECURITY DEFINER` functions.
- 20 with PUBLIC execution.
- 21 effectively executable by anon and authenticated.
- all 33 executable by service role.
- 12 already restricted to postgres/service role.
- eight confirmed normal trigger functions.
- three trigger-returning functions without a confirmed normal-trigger attachment.
- no live public-function event-trigger attachment.
- 10 functions without an explicit path, 22 using `public`, and one using `pg_catalog`.

The special ACL on `cleanup_old_notifications(integer, integer, integer, integer)` proves that PUBLIC-only hardening is incomplete: direct anon and authenticated privileges can survive even when PUBLIC is closed.

## Recommended three-lane sequence

### DB1C-1B1 — exact ACL hardening

Purpose: remove unnecessary direct API execution from confirmed service-only or non-client privileged functions without changing function definitions, owners, triggers, policies, or paths.

Requirements:

- one collision-free 14-digit UTC migration version;
- exact schema/name/identity arguments for every target;
- per-role current-state preflight for PUBLIC, anon, authenticated, and service role;
- explicit handling of direct role ACLs, not only PUBLIC inheritance;
- no name-only operation;
- no source replacement;
- retained service-role execution only where a trusted backend/operational call is proven;
- exact pre-change ACL rollback record;
- manual approval and staging rehearsal.

The first ACL batch should prioritize the eight high-risk exposed identities documented in the audit. Exact target membership remains subject to external-consumer and owner review.

### DB1C-1B2 — trigger/internal ACL hardening

Purpose: remove direct API exposure from the eight confirmed normal-trigger functions and other proven internal-only helpers while preserving trigger definitions and execution.

Confirmed normal-trigger functions:

- `cosmoskin_activity_order_insert()`
- `cosmoskin_activity_order_update()`
- `cosmoskin_activity_routine_complete()`
- `handle_new_auth_user_profile()`
- `handle_new_user_profile()`
- `loyalty_ledger_recalculate_trigger()`
- `routine_completion_recalculate_trigger()`
- `sync_review_helpful_count()`

The three unattached trigger-returning candidates and `rls_auto_enable()` require a separate orphan/provenance review. No function is dropped in DB1C-1B2.

### DB1C-1B3 — search-path/source hardening

Purpose: replace reviewed definitions only where necessary to fully qualify objects and use an empty or minimal trusted path.

Population: 10 missing-path functions and 22 `public`-path functions, with `check_purchase(uuid, text)` and `get_review_summary(text)` first. The single `pg_catalog`-path function is preservation-first.

This lane must archive the exact definition/configuration checksum and prove behavior in staging. It must not be combined with ACL hardening.

## Exact-signature safety

No COSMOSKIN privileged overload exists live; global overloads are extension functions such as `citext`. Exact signatures remain mandatory to prevent future overloads or extension objects from being affected accidentally.

## Preflight evidence

For every lane, save:

- exact identity and overload count;
- owner, definition checksum, source, and configuration;
- raw/default/effective role ACLs;
- normal/event-trigger and nested-function dependencies;
- scheduler/webhook/external caller evidence;
- expected success and denial tests;
- exact rollback state.

Q12 showed no `cron.job` catalog. This does not close external scheduling risk.

## Post-deploy verification design

Re-run the read-only identity, owner/configuration, ACL, trigger, event-trigger, and exposure summaries. Confirm expected roles succeed, disallowed roles fail, definitions remain unchanged in ACL-only lanes, triggers remain enabled, and backend workflows preserve behavior.

## Rollback design

- DB1C-1B1/1B2: restore the exact prior per-signature ACL only.
- DB1C-1B3: restore the exact prior definition and configuration, then verify checksum, ACL, owner, and dependencies.
- Never change migration-history rows during rollback.

## Hard stops

Unknown exact signature, source, owner, direct ACL, normal/event trigger, external caller, scheduler, nested dependency, identity authorization, path resolution, staging behavior, or exact rollback state.

