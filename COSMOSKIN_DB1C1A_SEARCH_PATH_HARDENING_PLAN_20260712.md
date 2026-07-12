# COSMOSKIN DB1C-1A Search-Path Hardening Plan

Date: 2026-07-12  
Status: design only; no function was changed.

## Objective

Prevent a `SECURITY DEFINER` function from resolving attacker-shadowed or unintended objects while preserving its current production behavior. A safe path is a consequence of fully understood source resolution, not a mechanical setting applied to every function.

## Evidence required per exact signature

Capture, in one evidence bundle:

- exact identity arguments and return type;
- `pg_get_functiondef`, definition checksum, language, volatility, parallel safety, and leakproof flag;
- owner and owner-role attributes;
- `proconfig` and the explicit path, if any;
- every table, view, sequence, function, operator, cast, type, and extension reference;
- trigger, function, cron, RPC, and external consumer dependencies;
- dynamic SQL and identifier interpolation;
- the live ACL and effective privileges for PUBLIC, anon, authenticated, and service role.

## Repository assessment

### Missing explicit path and confirmed unqualified relations

- `public.check_purchase(uuid, text)`: unqualified `orders`, `order_items`, and `product_id_to_slug`.
- `public.get_review_summary(text)`: unqualified `reviews`.

These functions must not be changed to an empty path until all relation/function references are schema-qualified and the production source is proven equivalent to the reviewed source.

### Explicit `public` path

Sixteen repository privileged identities set the path to `public`. Their bodies are generally more schema-qualified, but source-by-source review is still required for helper functions, operators, casts, sequence calls, JSON helpers, and extension functions. `public` is only a trusted path if object creation there is tightly governed; the live role/grant review must prove that condition.

### Live-only functions

The seven additional privileged identities have unknown configuration and source. They remain blocked until the live pack resolves both. `cleanup_old_notifications` is also a live-only exposure candidate whose exact source/path must be captured.

## Preferred final patterns

1. Fully qualify every repository-managed relation, sequence, view, type, and helper function.
2. Use an empty path when the reviewed body has no legitimate unqualified dependency.
3. Use the smallest ordered list of trusted schemas only when an unavoidable dependency cannot be safely qualified.
4. Never include caller-writable or insufficiently governed schemas.
5. Never rely on the caller's path.
6. Treat temporary-object resolution and dynamic SQL as separate blockers; path hardening alone does not make unsafe dynamic SQL safe.

## Decision sequence

For each exact signature:

1. Compare the production definition checksum with repository candidates.
2. Build a resolution inventory from the live definition.
3. Prove every unqualified token's current target in an isolated production-like database.
4. Produce a behavior-preserving, fully qualified candidate definition only if source replacement is necessary.
5. Test with the current path, then the proposed empty/minimal path.
6. Exercise direct RPC, trigger, scheduler, and nested-function paths.
7. Separate path/source changes from ACL-only changes so each has an independent rollback boundary.

## Risk classes

| Class | Condition | DB1C-1B treatment |
|---|---|---|
| SP0 | No explicit path plus unqualified objects | Source review/replacement lane; never ACL-only assumption |
| SP1 | Explicit `public` path with fully qualified relations | Candidate for minimal/empty path after regression proof |
| SP2 | Extension/operator/type resolution dependency | Minimal trusted path or explicit qualification after compatibility test |
| SP3 | Dynamic SQL or caller-influenced identifier | Stop; redesign/validation required before path change |
| SP4 | Live source/configuration unknown | Stop; collect read-only evidence |

## Function decisions

- `check_purchase` and `get_review_summary`: SP0; highest path priority, but no first-pass body change without live usage proof.
- Twelve active service RPCs: SP1 unless live source reveals drift; retain service behavior and test payment, inventory, membership, and loyalty invariants.
- Auth profile handlers: SP1; include auth-trigger tests and ensure `auth.users`/profile objects remain explicitly qualified.
- `cosmoskin_order_points_basis`: SP1; verify nested calls resolve under the proposed path.
- `reserve_product_inventory`: SP1/legacy uncertainty; usage and supersession proof precede path work.
- Seven live-only privileged identities and `cleanup_old_notifications`: SP4 until definitions are captured.

## Search-path change stop conditions

- A production definition differs from every reviewed repository candidate.
- Any overload is unresolved.
- A relation, function, type, operator, cast, extension, or sequence target cannot be proven.
- Dynamic SQL consumes caller-controlled identifiers or fragments.
- A trigger/nested call behaves differently in staging.
- The exact prior definition/configuration cannot be restored.
- The function owner or retained role requirement is unknown.

## Rollback requirement

Before any future change, archive the exact live definition, owner, path configuration, ACL, and checksum. The rollback must restore that exact per-signature state, not regenerate it from a repository file that may not match production.

