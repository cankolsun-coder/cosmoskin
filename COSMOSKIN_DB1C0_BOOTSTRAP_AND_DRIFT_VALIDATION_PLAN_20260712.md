# COSMOSKIN DB1C-0 Bootstrap and Drift Validation Plan

Date: 2026-07-12  
Status: plan only; all commands are conceptual and require an isolated environment plus separate authorization

## Objectives

1. Prove an empty database can be reconstructed from the canonical baseline and post-cutover forward migrations.
2. Prove the result matches the approved expected schema.
3. Detect direct production changes, incomplete migrations, access-control drift, and non-deterministic DDL before release.

## Safety boundary

- Never link the bootstrap job to production.
- Never use a production connection string, project reference, service key, backup, or customer data in bootstrap CI.
- Never run remote reset.
- Never expose the bootstrap baseline to the production-forward migration workdir.
- Any command name below is a conceptual future step, not authorization to execute it now.

## Bootstrap input manifest

Required inputs:

- pinned Supabase CLI/container/Postgres versions;
- canonical baseline SQL and manifest/checksum;
- approved non-secret reference seed and checksum;
- ordered post-cutover forward migrations and immutable checksums;
- optional test seed clearly marked non-production;
- expected normalized schema representation;
- expected runtime table/RPC inventory;
- role test identities for anonymous, user A, user B, and service/admin paths;
- application integration test selection.

## Empty-database replay

Conceptual sequence:

1. Create a disposable unlinked Supabase environment.
2. Verify its project reference/host against an ephemeral allowlist and production denylist.
3. Apply the bootstrap-only baseline.
4. Apply approved reference data.
5. Apply every post-cutover forward migration in timestamp order.
6. Apply test data only after all schema migrations.
7. capture logs, migration list, catalog inventory, and normalized schema.
8. Run database and application validations.
9. Recreate a second fresh environment and repeat to detect nondeterminism.
10. Destroy both ephemeral environments after evidence is retained.

The current 33 legacy migrations and the two production-history sentinels are not part of this sequence.

## Structural validation

Compare expected and actual for:

- schemas and extensions;
- types/enums/domains/sequences;
- tables, columns, types, defaults, generated expressions, nullability;
- PKs, FKs, checks, unique and exclusion constraints;
- indexes including expressions, predicates, includes, order, and validity;
- views/materialized views and security-invoker behavior;
- functions/procedures including signatures, body hashes, owner, security mode, search path, grants;
- triggers and enablement;
- RLS enabled/forced state;
- policy roles/commands/expressions/mode;
- schema/table/sequence/function/column grants and revokes;
- comments/owners;
- Storage policies and approved bucket configuration;
- scheduled jobs and operational configuration manifests.

Normalize away only approved nondeterministic fields such as dump comments, environment-specific owners where deliberately mapped, and internal object OIDs. Do not normalize away policy expressions, grant roles, function bodies, constraint validation, or extension versions.

## Runtime contract validation

From `functions/api/**`, verify:

- every table reference resolves to the mapped canonical live object;
- every selected/inserted/updated column exists with a compatible type/default;
- every RPC signature resolves exactly;
- Storage buckets/path conventions exist;
- all FK and ownership joins are indexed;
- server-only objects are not accidentally directly exposed;
- user-owned direct access has complete policy/grant coverage.

The current runtime naming map is the starting assertion set, not permanent proof.

## Security drift validation

For every exposed object:

- compare RLS enabled/forced flags;
- compare policies by normalized command, roles, `USING`, `WITH CHECK`, and permissive/restrictive mode;
- compare table and column grants independently of RLS;
- compare function owner, `SECURITY DEFINER`, search path, body hash, and EXECUTE grants;
- ensure `PUBLIC`/`anon`/`authenticated` cannot execute internal privileged functions;
- confirm views do not bypass underlying RLS;
- compare Storage policies and bucket public/private state;
- run anonymous/user A/user B/service role tests.

Any unexplained access expansion is a release blocker.

## Data-quality preflight for forward migrations

Before a future constraint or unique index is authored/applied, read-only checks must prove:

- no duplicate target keys;
- no orphan FKs;
- no nulls where future NOT NULL is intended;
- no status values outside the proposed vocabulary;
- no negative or arithmetically inconsistent commerce amounts;
- no over-refund or snapshot inconsistencies;
- no invalid inventory reserved/on-hand combinations;
- no blank product slugs or duplicate favorites;
- no cross-table naming/data split that a migration would worsen.

Evidence must include row counts, violating samples redacted of PII, query checksum/version, execution timestamp, and reviewer.

## CI gates

### Gate 1 — repository governance

- all legacy hashes unchanged;
- no duplicate future timestamp;
- all future names use 14-digit UTC versions;
- no backward timestamp relative to cutover;
- no baseline file in the production-forward lane;
- no legacy file in the bootstrap execution set;
- manifest/checksum references resolve.

### Gate 2 — replay

- empty bootstrap succeeds twice;
- resulting normalized schemas are identical;
- migration apply-state contains only the expected bootstrap/forward relationship for that ephemeral environment;
- no SQL step requires production data or a manual pre-created table.

### Gate 3 — database contract

- zero unexplained structural diff;
- zero RLS/policy/grant/function-owner drift;
- zero missing runtime tables/RPCs;
- zero formula-like generated-expression or constraint mismatch;
- Storage and cron expectations pass.

### Gate 4 — application behavior

- account/profile/preferences/favorites;
- checkout/bank transfer/payment callback;
- coupon reservation/redemption/allocation;
- stock reservation/conversion/release;
- orders/shipping/tracking;
- returns/refunds/paid-price snapshots;
- reviews/images;
- membership/loyalty;
- support and CRM paths relevant to the changed batch;
- anonymous and cross-user denial cases.

## Production drift monitoring

At an approved cadence and before every database release:

1. capture a read-only production schema representation;
2. normalize using the same rules as CI;
3. compare to canonical baseline plus production-recorded forward migrations;
4. compare production migration list to the approved environment apply-state record;
5. inspect policy/grant/function/body checksums separately;
6. inspect Storage and operational config manifests;
7. triage every diff as expected environment configuration, approved emergency change, or unauthorized drift;
8. require a forward reconciliation migration for any schema drift retained intentionally.

No direct production edit is “fixed” by only updating the expected dump. The cause, authorization, and forward reconciliation must be recorded.

## Drift severity

| Severity | Example | Action |
|---|---|---|
| P0 | RLS disabled, privileged EXECUTE expanded, missing FK/snapshot, function body drift, unknown table used by runtime | Freeze release; security/data-integrity incident review |
| P1 | Missing index, provenance-only live object, expected non-security column/default drift | Freeze related migration; reconcile before next release |
| P2 | Approved comment or environment-only configuration difference | Document normalization rule and reviewer approval |

## Evidence artifacts per run

- environment/version manifest;
- baseline and migration checksums;
- migration list;
- normalized schema and checksum;
- raw-to-normalized transformation version;
- object-level diff;
- RLS/policy/grant/function diff;
- Storage/cron/config comparison;
- runtime resolver results;
- application/role test results;
- final pass/fail decision and reviewer.

Do not store secrets, raw customer rows, service-role keys, or unredacted PII in CI artifacts.

## Stop conditions

Stop on any production connection signal, incomplete baseline manifest, replay failure, nondeterministic second replay, unexplained structural/security diff, missing Storage policy, unresolved runtime name, failed role test, or application regression.

## Scope confirmation

No bootstrap, reset, schema dump, diff, SQL, or remote command was executed in DB1C-0.
