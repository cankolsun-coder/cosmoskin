# COSMOSKIN DB1C-0 Baseline Governance Runbook

Date: 2026-07-12  
Mode: conceptual/manual-approval runbook only; no commands were executed

## Audience

Database owner, Supabase release operator, security reviewer, application owner, and release approver.

## Mandatory warning

The current `supabase/migrations/` directory is not safe for `db push` or clean `db reset`. It contains a first-file dependency failure, duplicate timestamp versions, manual dependencies, duplicate bodies, and files that production history does not record.

Do not run any remote migration/reset/repair command from the current repository state.

## Phase 0 — Backup and read-only evidence

### Inputs

- production project identifier;
- authorized read-only database access;
- backup/PITR evidence;
- DB1 query pack and DB1B findings;
- repository commit and migration hashes.

### Conceptual/manual-approval actions

- confirm encrypted backup and restoration ownership;
- capture full schema-only definition and catalog metadata read-only;
- capture migration ledger, extensions, owners, grants, policies, function bodies, triggers, Storage config/policies, cron jobs, and row counts;
- record exact tool versions and timestamps;
- redact secrets and customer data from evidence.

### Outputs

- immutable source snapshot and checksum;
- apply-state evidence;
- backup proof;
- object/dependency inventory;
- evidence completeness sign-off.

### Stop conditions

Missing backup, incomplete snapshot, unknown owner/grant/function, Storage omission, or PII/secrets in evidence.

### Rollback boundary

Read-only; no database rollback required. Discard incomplete evidence and recapture.

## Phase 1 — Baseline generation in isolation

### Inputs

- approved Phase 0 evidence;
- canonical naming map;
- baseline content specification;
- exclusions/reference-data manifest.

### Conceptual/manual-approval actions

- generate a schema-only candidate from the captured live state in an isolated workspace;
- remove platform-managed internals and data rows only through reviewed rules;
- manually reconcile manual/root SQL, application expectations, and live definitions;
- normalize owners/search paths/grants only when the normalization represents current approved state, not future remediation;
- create baseline and manifest checksums.

### Outputs

- candidate baseline v1;
- manifest and exclusions;
- object-level review matrix;
- unresolved-diff list.

### Stop conditions

Any guessed object, hidden data mutation, unresolved runtime mapping, or security difference.

### Rollback boundary

Delete/reject the isolated candidate only; production remains untouched.

## Phase 2 — Clean bootstrap test

### Inputs

- baseline candidate;
- approved reference/test seed separation;
- forward-migration set after cutover;
- ephemeral-only environment guard.

### Conceptual/manual-approval actions

- create empty unlinked ephemeral Supabase stack;
- apply baseline, reference data, and forward migrations;
- replay twice in independently created environments;
- run catalog, role, runtime, and application validations.

### Outputs

- two successful replay logs;
- normalized checksums;
- role/application test evidence;
- deterministic replay decision.

### Stop conditions

Any production connection signal, replay failure, nondeterministic checksum, missing object, or role/application failure.

### Rollback boundary

Destroy ephemeral environments. Never attempt to “fix” them by editing production.

## Phase 3 — Diff against production

### Inputs

- approved bootstrap result;
- fresh read-only production snapshot;
- shared normalization rules.

### Conceptual/manual-approval actions

- compare objects and security metadata;
- classify differences as expected platform/environment, baseline defect, approved future remediation, or unauthorized production drift;
- refresh baseline candidate for defects only; do not silently include planned remediation.

### Outputs

- zero-unexplained-diff report;
- signed exception list;
- baseline approval or rejection.

### Stop conditions

Unexpected table/column/constraint/index/view/function/policy/grant/owner/Storage/cron difference.

### Rollback boundary

Reject candidate; production remains untouched.

## Phase 4 — Forward remediation preparation

### Inputs

- approved baseline v1;
- DB1C batch scope;
- fresh data/security preflight;
- runtime mapping.

### Conceptual/manual-approval actions

- author one narrowly scoped future migration with a unique 14-digit version;
- document transaction/lock/rollback behavior;
- update expected schema representation;
- apply to baseline-built ephemeral environment only;
- run affected and cross-domain tests.

### Outputs

- reviewed migration candidate;
- preflight and test evidence;
- rollback plan;
- release decision.

### Stop conditions

Non-idempotent retry requirement without runbook, unsafe lock, data violations, unresolved mapping, or unrelated scope expansion.

### Rollback boundary

Discard/edit the unapplied candidate. Once applied to a shared environment, never rewrite it; use a forward correction.

## Phase 5 — Staging rehearsal

### Inputs

- production-schema clone or representative staging state;
- candidate migration;
- backup and rollback plan;
- application release candidate.

### Conceptual/manual-approval actions

- rehearse exact preflight, migration, postflight, and rollback/forward-correction path;
- measure locks, duration, query plans, and application errors;
- test anonymous/user A/user B/service/admin paths;
- capture migration selection to prove baseline/legacy files are absent.

### Outputs

- staging evidence;
- timing/lock envelope;
- go/no-go recommendation;
- operator checklist.

### Stop conditions

Baseline/legacy file selected, timeout/lock risk outside envelope, rollback failure, or application/security regression.

### Rollback boundary

Restore/recreate staging only. Production remains untouched.

## Phase 6 — Production deployment

### Inputs

- explicit human approval;
- current backup/PITR proof;
- fresh read-only preflight;
- staged artifact checksums;
- maintenance/observability plan.

### Conceptual/manual-approval actions

- one release owner verifies target and selected version;
- apply only the approved forward migration;
- do not use repair, baseline, legacy replay, or remote reset;
- monitor database/application errors and locks;
- stop after one batch.

### Outputs

- applied migration record;
- deployment log and checksum;
- immediate postflight evidence.

### Stop conditions

Target mismatch, changed checksum, unexpected migration selection, missing backup/approval, live data preflight change, or unsafe lock.

### Rollback boundary

Follow the batch-specific rollback/forward-correction plan. Never edit the applied migration file or falsify history.

## Phase 7 — Post-deploy and drift monitoring

### Inputs

- applied version;
- expected schema checksum;
- application/role verification suite.

### Conceptual/manual-approval actions

- verify object and security diffs;
- verify data invariants and application flows;
- capture fresh apply-state;
- update environment evidence record;
- schedule/read periodic drift comparison.

### Outputs

- release closure report;
- current normalized checksum;
- incident ticket for any unexplained drift.

### Stop conditions

Any security expansion, missing object, integrity violation, or application regression.

### Rollback boundary

Batch-specific; prefer forward correction when destructive rollback would increase risk.

## Operator target checks

Before any future command that can mutate a database, the operator must independently verify:

- project reference/host;
- local repository commit;
- approved migration filename and checksum;
- selected migration list;
- baseline and legacy exclusion;
- backup/PITR status;
- reviewer approvals;
- environment and secret source;
- observability window;
- rollback owner.

## Evidence retention

Retain manifests, checksums, approvals, normalized diffs, migration logs, timing/lock evidence, and test results. Do not retain service-role keys, connection strings, raw provider payloads, or customer rows.

## Scope confirmation

This runbook did not run any conceptual command, connect to Supabase, or create a migration/deployment script.
