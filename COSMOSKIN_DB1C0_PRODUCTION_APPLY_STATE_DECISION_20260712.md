# COSMOSKIN DB1C-0 Production Apply-State Decision

Date: 2026-07-12  
Decision status: final strategy recommendation; no history mutation authorized or performed

## Current evidence

Production `supabase_migrations.schema_migrations` was reported to contain only:

- `20260418` — guest checkout;
- `20260510` — newsletter subscribers.

The repository contains 33 files but only 15 distinct version prefixes. Eight prefixes are reused; `20260510` is shared by three different files. Supabase compares migration timestamps to reconcile local and remote history, so production history cannot identify individual same-prefix file bodies. See [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations).

Live production contains many objects not proven by those two rows. Some legacy files are known to have been partially applied or executed manually. Object presence therefore cannot be converted automatically into migration-file apply-state.

## Explicit decisions

| Question | Decision |
|---|---|
| Alter the two existing production rows? | **No.** Preserve them as truthful historical facts. |
| Mark missing historical versions applied? | **No.** Object overlap is not proof that a whole file ran successfully. |
| Use `supabase migration repair` now? | **No.** Not in DB1C-0 and not to clean CLI output. |
| Insert all 33 repository versions? | **No.** There are only 15 distinct timestamps, collisions, partial files, and duplicate content. |
| Replay legacy files on production? | **No.** The first file is dependency-broken and later files contain state-sensitive/destructive compatibility behavior. |
| Run the future baseline on production? | **Never.** The baseline is bootstrap-only. |
| Record future forward migrations? | **Yes.** Each is recorded normally when the approved runner applies it successfully. |

## Why bulk history repair would be false

A history row means the migration version is considered applied for future ordering decisions. It does not prove:

- every statement in the corresponding file executed;
- the file ran atomically;
- the live function body/policy/constraint still matches that file;
- the file was the only file sharing that version;
- reference-data updates/backfills ran;
- later manual changes did not replace the result.

Known repository evidence makes these uncertainties concrete:

- first-file `ALTER` before `orders` creation;
- H0 documents partial execution of a 20260616 file;
- broad bridge files branch on existing state;
- exact duplicate UAT files;
- multiple replacements of the same function;
- one-time dynamic RLS hardening;
- manual/root-only review, shipment, favorites, notifications, support, and legacy object provenance.

Bulk marking would tell future tooling to skip SQL without proving the intended state exists. That is more dangerous than an untidy but truthful ledger.

## Primary apply-state operating model

### Legacy cutover

In a future authorized repository-governance change:

- all 33 current files are frozen and hash-manifested;
- 31 files not represented by the two production ledger rows move unchanged to a non-executable legacy archive;
- the exact `20260418_guest_checkout.sql` and `20260510_newsletter_subscribers.sql` files remain as production-history sentinels in the production-forward lane;
- the production-forward lane then accepts only new unique 14-digit UTC migrations;
- clean bootstrap uses a separate lane and excludes both sentinels.

This preserves the current remote/local historical intersection without pretending the other 31 files ran.

### Future production migrations

- one migration version per file;
- immutable after application;
- applied by one release owner through the approved pipeline;
- recorded by the migration runner only after successful application;
- object checksum and post-deploy verification linked to the version;
- emergency direct edits prohibited; if unavoidable, treated as an incident and reconciled with a forward migration.

### Environment record

Maintain a governance record separate from the Supabase ledger:

- environment/project identifier;
- baseline relationship: “production-equivalent snapshot at cutover; baseline SQL not executed”;
- two preserved historical rows;
- every post-cutover applied version/checksum;
- deployment approval/evidence;
- current normalized schema checksum;
- known approved environment-only differences.

This record supplements but never replaces the actual migration ledger.

## When history repair could ever be considered

Only fallback Option C may require a one-time baseline marker to keep one active migration directory compatible with production. That is not the primary recommendation.

Minimum prerequisites for even proposing it:

1. complete read-only live schema capture;
2. exact baseline schema equivalence proof;
3. object-level normalized diff showing no unexplained table/column/type/default/constraint/index/view difference;
4. exact RLS/policy/grant/owner/function body/search-path/trigger equivalence;
5. Storage bucket/policy and cron/config equivalence;
6. baseline and source checksums;
7. verified encrypted backup/PITR posture;
8. staging rehearsal with the same starting history mismatch;
9. proof that marking the baseline applied causes only future migrations—not baseline SQL—to be selected;
10. written rollback and incident plan;
11. explicit human approval from database owner, security reviewer, and release owner.

Even then, repair would mark at most one semantically documented baseline-equivalence version. It would not insert the 33 historical versions.

## Rollback risk of falsified apply-state

- future migrations skip prerequisites that are absent;
- a recovery database is built with a different function/policy/constraint set;
- migration tooling cannot determine which duplicate same-version file was intended;
- partial file execution is concealed;
- data migrations/backfills are assumed complete when they are not;
- later down/reconciliation work targets the wrong predecessor state;
- incident responders trust a ledger that contradicts the database;
- rollback of the history row cannot restore the schema because repair changed metadata, not objects.

Therefore the safe rollback for an incorrect history repair is not merely deleting a row; it requires re-auditing every migration selected/skipped since the false record. This is why prevention is mandatory.

## Production preflight before first post-cutover migration

- current ledger re-captured read-only;
- active production lane contains exactly the two sentinels plus approved forward files;
- sentinel hashes match the frozen manifest;
- no baseline or archived legacy file is visible to the runner;
- migration selection dry-run/list is reviewed without mutation;
- target forward migration has complete object/data/security preflight;
- backup, staging rehearsal, rollback, observability, and approval are current.

## Stop conditions

Stop if a repair is suggested merely to remove a mismatch; if a file checksum differs; if the runner sees the baseline or any archived legacy file; if production history has changed unexpectedly; or if equivalence cannot be proven.

## Scope confirmation

No history row was inserted, changed, removed, repaired, or queried in this task. The decisions use the previously supplied DB1B result only.
