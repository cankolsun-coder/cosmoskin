# COSMOSKIN DB1C-0 Rollback and Stop Conditions

Date: 2026-07-12  
Status: governance controls only; no remediation performed

## Core principle

Stop before mutation whenever evidence is incomplete. A migration history row, a passing parser, or an idempotent keyword is not a substitute for schema/data/security equivalence.

## Absolute stop conditions

Future baseline or remediation work must stop if:

- production backup/PITR evidence is missing or stale;
- production schema snapshot is incomplete;
- baseline differs unexpectedly from production;
- RLS or policy diff is unresolved;
- table/column/function grant diff is unresolved;
- function owner, body, overload, security mode, or search path diff is unresolved;
- Storage bucket or policy evidence is missing;
- cron/operational job state required by runtime is unknown;
- legacy migration hashes have changed;
- migration replay fails on an empty database;
- two clean replays produce different normalized schemas;
- a forward migration needs retry idempotency but does not have it or a safe runbook;
- a migration cannot run transactionally and lacks a reviewed phased procedure;
- application table-name mapping is unresolved;
- data preflight finds duplicate/orphan/invalid rows without an approved cleanup plan;
- migration-history repair is proposed without exact equivalence proof;
- the production runner can see the baseline or archived legacy files;
- a remote reset, bulk repair, or legacy replay is selected;
- target project/environment cannot be independently verified;
- migration checksum differs from the approved artifact;
- anonymous/cross-user/security tests fail;
- affected application flows fail in staging;
- lock duration or table rewrite risk exceeds the approved envelope;
- any secret, bank/provider credential, or customer data appears in baseline/CI artifacts.

## Phase rollback boundaries

| Phase | Highest authorized state | Rollback boundary |
|---|---|---|
| 0 evidence | Read-only artifacts | Discard/redact incomplete evidence; no DB action |
| 1 baseline generation | Isolated files | Reject candidate; production untouched |
| 2 bootstrap | Ephemeral DB only | Destroy/recreate ephemeral environment |
| 3 production diff | Read-only comparison | Reject baseline/normalization rule; no production action |
| 4 migration preparation | Unapplied candidate | Edit/discard candidate; no shared history |
| 5 staging | Staging schema/data | Restore/recreate staging; update runbook |
| 6 production | One approved forward migration | Execute batch-specific rollback or safer forward correction |
| 7 post-deploy | Verified production change | Incident response; freeze next batch; preserve evidence |

## Baseline rollback

Because production never runs the baseline, baseline rollback means:

- revoke approval of the candidate;
- retain rejected checksums/evidence for audit;
- fix the isolated candidate;
- repeat clean bootstrap and production comparison;
- never modify production to make it match a defective baseline.

If a baseline version has already been used by non-production environments, replace it with a new baseline version or rebuild those disposable environments. Do not silently rewrite an approved baseline checksum.

## Forward migration rollback decision tree

1. **Unapplied anywhere:** edit/regenerate after review.
2. **Applied only to disposable local/CI:** rebuild environment; migration may be corrected before merge if no shared history exists.
3. **Applied to shared staging:** migration becomes immutable; use a forward correction for rehearsal fidelity.
4. **Applied to production:** never edit or delete the migration/history row. Choose a batch-specific down action only if proven safer than a forward correction.

Rollback review must account for data written after deployment, not merely the schema operation. Dropping a new column/table or reverting a function can destroy or reinterpret new data.

## History repair rollback

No history repair is authorized. If a future explicitly approved repair is wrong:

- freeze all database deployments;
- capture current ledger and schema read-only;
- determine every migration selected or skipped since repair;
- do not simply flip the row back without impact analysis;
- reconcile schema to the truthful intended state;
- obtain new backup/staging/security approvals;
- record the repair as an incident.

Migration repair changes metadata, not schema, so reverting metadata alone cannot undo skipped or wrongly applied SQL.

## Security rollback

For DB1C-1/2 policy/grant/function changes:

- preserve exact pre-change definitions and grants in restricted evidence;
- never restore broad `PUBLIC`/`anon`/`authenticated` access as a blanket rollback;
- restore only the minimum known-good caller access;
- verify internal triggers/service callbacks and cross-user denial;
- prefer a narrow forward correction if full rollback would reopen a P0 exposure.

## Constraint/index rollback

- adding a validated constraint can block writes; dropping it reopens invalid data risk;
- concurrent/non-transactional index operations require their own resumability/cleanup plan;
- type/column rewrites require backup, space, lock, and irreversible-data analysis;
- NOT VALID/validation phases must state which partial states are safe;
- never remove paid-snapshot/refund integrity merely to restore availability without explicit risk acceptance.

## Operational rollback

Storage, cron, provider, and reference configuration have separate rollback ownership:

- Storage policy rollback must retain object ownership isolation;
- bucket public/private changes require URL/application compatibility review;
- cron rollback must prevent duplicate execution;
- provider/outbox rollback must preserve idempotency and event audit;
- bank/reference data rollback must not expose secrets or delete legitimate operational records.

## Go/no-go authority

Minimum approval for future production schema changes:

- database owner;
- application/domain owner;
- security reviewer for RLS/grant/function/Storage changes;
- release owner/operator;
- privacy/legal reviewer where consent, CRM, or customer-data retention is affected.

Any one reviewer may stop the release on evidence or scope grounds.

## Required incident evidence

On any stop after a shared-environment mutation, preserve:

- repository commit and migration checksum;
- target environment and timestamps;
- pre/post migration list;
- logs/errors/locks;
- pre/post normalized schema/security diff;
- affected row counts and redacted samples;
- application impact;
- rollback/forward-correction actions and approvals.

## Scope confirmation

No rollback, repair, deployment, SQL, migration, or application change was executed in DB1C-0.
