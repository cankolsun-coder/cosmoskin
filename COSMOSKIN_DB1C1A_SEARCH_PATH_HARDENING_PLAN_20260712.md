# COSMOSKIN DB1C-1A Search-Path Hardening Plan

Date: 2026-07-12  
Status: live evidence incorporated; design only. No function or path was changed.

## Live result

The 33 live public-schema `SECURITY DEFINER` functions divide into:

- 10 with no explicit `search_path`;
- 22 with `search_path=public`;
- one with `search_path=pg_catalog`.

These counts define the DB1C-1B3 review population. They do not authorize a mechanical path change.

## Priority source risks

`public.check_purchase(uuid, text)` and `public.get_review_summary(text)` have no explicit path and use unqualified relations. They are the first source-review candidates because caller-controlled resolution or object shadowing can change which objects privileged code accesses.

The 22 functions using `public` have an explicit but broad path. A `public` path is only trusted if object creation is tightly governed and every unqualified dependency resolves as intended. The single `pg_catalog` path should be preserved unless its exact source review proves a different minimal path is required.

## Sequencing boundary

- DB1C-1B1 is ACL-only. It must not replace source or change path configuration.
- DB1C-1B2 is trigger/internal ACL hardening. It must not replace trigger-function source or change path configuration.
- DB1C-1B3 is the first lane allowed to consider source replacement and path narrowing.

This separation gives ACL changes and function-definition changes independent staging and rollback boundaries.

## Required evidence per exact signature

Before DB1C-1B3, capture and approve:

- exact signature, return type, language, volatility, parallel/leakproof attributes;
- exact live definition and checksum;
- owner and owner-role attributes;
- `proconfig` and current path;
- all table, view, sequence, type, operator, cast, extension, and helper-function resolution;
- dynamic SQL and caller-controlled identifier handling;
- normal trigger, event-trigger, nested-function, RPC, webhook, cron, and external scheduler dependencies;
- current ACL and the exact prior definition/configuration required for rollback.

## Preferred final patterns

1. Schema-qualify repository-managed relations, sequences, types, and helper functions.
2. Use an empty path only when every legitimate dependency is explicitly qualified and staging proves identical behavior.
3. Otherwise use the smallest ordered list of trusted schemas.
4. Do not include user-writable or weakly governed schemas.
5. Never rely on the caller's path.
6. Treat dynamic SQL and temporary-object resolution as independent security reviews.

## Risk classes

| Class | Live condition | Treatment |
|---|---|---|
| SP0 | No explicit path plus unqualified objects | Highest-priority DB1C-1B3 source review |
| SP1 | No explicit path; source not yet fully resolved | Stop until exact resolution inventory exists |
| SP2 | `search_path=public` | Qualify source, prove behavior, then evaluate empty/minimal path |
| SP3 | Minimal trusted path such as `pg_catalog` | Preserve unless exact source evidence requires change |
| SP4 | Dynamic SQL or caller-influenced identifiers | Stop; redesign/validation required |

## Function decisions

- `check_purchase(uuid, text)` and `get_review_summary(text)`: SP0; defer to DB1C-1B3.
- Active payment, inventory, loyalty, and membership RPCs: SP1/SP2 according to the exact Q2 row; preserve runtime semantics.
- Eight confirmed normal trigger functions: SP1/SP2 according to Q2; include trigger smoke tests.
- Three unattached trigger-returning candidates and `rls_auto_enable()`: no source/path change until provenance and external dependency review; do not drop them.
- All live-only functions: the exact Q2 result, not a repository assumption, controls classification.

## Regression requirements

Test direct backend calls, nested calls, normal triggers, auth-user provisioning, payment finalization, inventory reservation/release/conversion, membership/loyalty recalculation, routine completion/streaks, review helpful counts, and notification cleanup as applicable. Verify result equivalence and no privilege escalation.

## Stop conditions

Stop if any resolution target, overload, owner, definition checksum, nested/external caller, dynamic SQL input, trigger behavior, or exact rollback definition is unresolved. A path change that cannot be restored exactly is not deployable.

