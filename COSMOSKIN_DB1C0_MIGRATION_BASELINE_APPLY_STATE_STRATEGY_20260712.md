# COSMOSKIN DB1C-0 Migration Baseline and Apply-State Strategy

Date: 2026-07-12  
Mode: repository and previously supplied live-evidence audit only  
Baseline evidence: DB1 commit `2b6ed8d`; DB1B commit `4f40988`  
Out of scope: production SQL, deployment, migration creation/modification, migration-history repair, application changes, and DB1C-1 or later remediation

## Executive decision

Adopt **Option E: a guarded dual-track hybrid**.

1. Freeze the current 33 files as immutable legacy evidence. Do not edit, reorder, replay, or treat them as a clean bootstrap chain.
2. In a later separately authorized repository-governance batch, retain the two files whose version prefixes match the two production ledger rows as hash-pinned production-history sentinels and relocate the remaining 31 unchanged files to a legacy archive outside the active production migration lane.
3. Generate a reviewed, versioned, schema-only canonical baseline from an approved live schema snapshot. Store it in a bootstrap-only lane that production deployment tooling cannot see.
4. Bootstrap new and ephemeral databases from that baseline plus only post-cutover forward migrations.
5. Upgrade existing production only with narrow, forward-only migrations. The baseline must never execute against production.
6. Leave the two existing production migration-history rows unchanged. Do not mark the other legacy files applied.
7. Require unique 14-digit UTC migration versions, isolated empty-database replay, normalized schema drift checks, and manual production approval for all future changes.

This refines the preferred DB1B direction. A baseline stored in the same active migration directory used for production would appear missing from production history and could be selected for execution. The dual-track separation removes that hazard without falsifying current apply-state.

## Pre-check

- `git status --short`: clean.
- `git diff -- products.json`: empty.
- `git diff --name-only`: empty.
- DB1B is committed at `4f40988`.
- DB1 is committed at `2b6ed8d`.
- E1 is present at `8594bea`.
- UX4 consent safety is present in `74c91de`.

No application or migration file was dirty when this audit started.

## Evidence sources and limitations

Repository inspection covered:

- all 33 files under `supabase/migrations/`;
- root and supplemental SQL, including manual schema, hotfix, rollback, seed/test, and verification files;
- DB1 and DB1B reports, matrices, query packs, and risk register;
- Supabase configuration presence, seed-file presence, package scripts, and CI workflow presence;
- runtime tables and RPCs under `functions/api/**`, plus relevant validators and tests.

Live evidence is limited to the operator-supplied DB1B results. This task did not connect to Supabase or execute SQL. A live object being reported present does not prove its complete definition or that any specific legacy file ran atomically.

Current Supabase documentation states that migration files are applied in timestamp order, remote state is tracked in `supabase_migrations.schema_migrations`, and only timestamps are compared for migration-list reconciliation. It also warns that direct remote schema edits bypass history. See [Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations) and [Local development with schema migrations](https://supabase.com/docs/guides/local-development/overview).

## Inventory conclusion

### Migration set

- Files: **33**.
- Distinct version prefixes: **15**.
- Version prefixes reused by multiple files: **8**.
- Files inside reused-version groups: **26**.
- Exact duplicate: `20260629_cosmoskin_final_user_acceptance_fix.sql` and `20260629_cosmoskin_final_user_acceptance_fix_v2.sql` have the same SHA-256.
- First replay failure: `20260418_guest_checkout.sql` unconditionally alters `public.orders`, which no earlier repository migration creates.

Reused prefixes:

| Version | File count | Governance consequence |
|---|---:|---|
| `20260510` | 3 | One ledger timestamp cannot identify newsletter vs operations vs phase-1 body |
| `20260511` | 2 | Compliance and invoice/return/refund bodies are indistinguishable in timestamp-only apply-state |
| `20260616` | 4 | Inventory, payment, and blanket-RLS files collide |
| `20260629` | 4 | Broad compatibility files and bank-account hotfix collide; two are byte-identical |
| `20260702` | 2 | Returns and routine migrations collide |
| `20260703` | 4 | Preference ALTER files sort before the preference base CREATE and share one version |
| `20260704` | 5 | Loyalty, payment, expiry, and Storage security bodies collide |
| `20260707` | 2 | Pricing and review patches collide |

Because production reports only `20260418` and `20260510`, the `20260510` row cannot prove which one, two, or all three same-version files were manually executed. File contents, object existence, and migration timestamps are separate evidence dimensions.

### Supplemental SQL inputs

| Class | Important paths | Treatment |
|---|---|---|
| Manual schema evidence | `supabase/schema.sql`, `supabase/commerce-schema.sql`, `supabase/reviews.sql`, `supabase/phase51_reviews_hardening.sql`, `supabase/phase6-commerce-schema.sql`, `functions/api/reviews/schema.sql` | Reconciliation evidence only; never concatenate into the canonical baseline without live comparison |
| Manual/hotfix DDL | `COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql`, `supabase/hotfixes/*.sql` | Historical evidence; capture final live state, not assumed execution |
| Operational backfill | `supabase/scripts/manual/backfill_loyalty_purchase_points_20260704.sql` | Excluded from schema baseline; separate data migration/runbook if ever authorized |
| Seed/test data | `supabase/phase6-inventory-seed.sql`, `supabase/test-data.sql`, `supabase/test/**` | Separate from schema; never production-bootstrap implicitly |
| Verification SQL | DB1/E1/UX4/full-audit query packs and `supabase/verification/**` | Read-only verification library; excluded from baseline execution |
| Rollback SQL | `supabase/rollback/20260616_prelaunch_recovery.sql` | Historical rollback evidence; not a generic down migration |

No root `package.json`, `supabase/config.toml`, canonical `supabase/seed.sql`, or repository CI workflow was found. `qa/package.json` is isolated QA tooling and does not define a Supabase migration pipeline. Storage bucket configuration is therefore currently manual/root-SQL provenance rather than a canonical project config.

### Runtime dependency inputs

DB1 extracted **56 application/test table identifiers** and documented **67 expectation rows**. DB1C-0 reused that inventory and rechecked the table-name drift paths under `functions/api/**`. Direct runtime RPC calls include:

- inventory: `reserve_order_inventory`, `release_order_inventory`, `convert_order_inventory`, `release_expired_inventory_reservations`;
- payment: `process_iyzico_payment_success`, `process_iyzico_payment_failure`;
- loyalty/membership: `recalculate_customer_membership`, `cosmoskin_award_loyalty_for_order`, `cosmoskin_promote_loyalty_for_order`, `cosmoskin_promote_due_loyalty_points`, `cosmoskin_reverse_loyalty_for_order`, and `cosmoskin_loyalty_balance_for_user`.

Every exact live signature/body/grant must enter the baseline inventory. Application strings prove a dependency, not a safe database definition.

Root/manual review SQL also contains policies tied to a literal administrator email. Those expressions are historical evidence only and must not enter the canonical baseline; admin authorization must follow the approved RBAC/server model. Legacy auth profile triggers read `raw_user_meta_data` for display/profile attributes; baseline review must ensure those values are never reused for authorization.

## Dependency graph conclusion

The complete row-level graph is in `COSMOSKIN_DB1C0_MIGRATION_DEPENDENCY_GRAPH_20260712.csv`.

### Topological summary

1. **Platform layer:** Supabase-managed Postgres, `auth.users`, `storage.objects`, roles, and the `public` schema.
2. **Extension layer:** repository SQL consistently uses `pgcrypto`; exact live extension version/state must be captured.
3. **Canonical base layer:** core commerce, account, inventory, CRM, review, support, shipment, and notification tables. This layer is absent as one coherent repository migration.
4. **Constraint/index layer:** PKs, FKs, checks, unique constraints, and query indexes.
5. **function/trigger layer:** inventory, payment, membership, loyalty, review, timestamps, and auth profile hooks.
6. **security layer:** RLS enablement, policies, table/column grants, function EXECUTE, owners, and safe search paths.
7. **Storage/operations layer:** bucket configuration, Storage policies, scheduled jobs, provider configuration, and environment-specific reference data.

The current migration order violates this topology at layer 3 on the first file. Later bridge migrations attempt to compensate with `IF EXISTS`, conditional `DO` blocks, table creation, constraint deletion, and function replacement. That produces environment-dependent outcomes rather than one deterministic graph.

### Detected failure patterns

- unconditional `ALTER` before base `CREATE` for `orders`, `payments`, reviews, and review images;
- silent `ALTER TABLE IF EXISTS` before `notification_preferences` is created;
- policies and triggers tied to tables/functions whose base provenance is manual or partial;
- FKs to commerce objects that are not yet repository-created at that point;
- same-version ordering ambiguity;
- exact duplicate UAT migrations;
- broad compatibility migrations that delete/rebuild columns, checks, views, functions, or reference data;
- one-time dynamic RLS enumeration that cannot protect later-created tables;
- hard-coded operational bank configuration inside a migration;
- manual Storage bucket prerequisites;
- multiple replacements of the same privileged function, where only the final live body matters;
- known partial production execution documented by the H0 migration itself.

## Migration classifications

Primary classification totals:

| Code | Classification | Count |
|---|---|---:|
| A | Bootstrap-safe in its local dependency context | 3 |
| B | Production-forward-safe only after specific bases/preflight | 5 |
| C | Historical/manual dependency | 6 |
| D | Drift-sensitive compatibility behavior | 5 |
| E | Superseded/duplicate | 4 |
| F | Security-critical | 10 |
|  | **Total** | **33** |

“A” does not mean the full repository chain is replayable; it means the individual file can execute deterministically when reached with its declared earlier dependencies. Security-critical is used as the primary class when a file changes privileged functions, RLS, policies, or access boundaries. Full evidence is in `COSMOSKIN_DB1C0_MIGRATION_CLASSIFICATION_MATRIX_20260712.csv`.

## Baseline options

Scores use **5 = safest/strongest/easiest** and **1 = weakest/highest risk/hardest**. Implementation ease is scored in the same direction, so a low score means more work.

| Option | Summary | Average | Decision |
|---|---|---:|---|
| A | Rewrite/squash into one active baseline | 3.7 | Not primary |
| B | Preserve and repair all 33 | 1.3 | Reject |
| C | Freeze legacy; one versioned baseline for new environments | 4.4 | Fallback with proof-gated baseline marker |
| D | Forward-only without baseline | 2.6 | Reject as end state |
| E | Guarded dual-track hybrid | 4.4 | **Primary** |

Option E is preferred over equally scored C because it keeps the bootstrap baseline physically outside the production migration lane and can preserve current production apply-state without repair. Detailed criteria are in `COSMOSKIN_DB1C0_BASELINE_OPTION_COMPARISON_20260712.csv`.

## Canonical source-of-truth hierarchy

1. **Approved live snapshot at cutover:** factual starting state for current production, including definitions, owners, privileges, policies, functions, storage policies, and data-quality exceptions.
2. **Reviewed canonical baseline:** normative reconstruction contract for new databases after object-by-object reconciliation.
3. **Post-cutover forward migrations:** sole authorized evolution history for existing production and all baseline-built environments.
4. **Application expectations and validators:** contract tests that detect missing or incompatible schema; they do not define DDL by themselves.
5. **Legacy migrations/root SQL:** immutable historical evidence; never the executable source of truth after cutover.

Production is the factual source for what exists now, but it is not automatically the desired design. Repository expectations can identify missing safeguards, but they must become explicit future forward migrations rather than being silently folded into a “current production” baseline.

## Primary repository layout decision

Future, separately authorized repository governance should establish three lanes:

| Lane | Purpose | Production visibility |
|---|---|---|
| Legacy archive | All 33 current files, unchanged and hash-manifested | Never executable |
| Production-forward lane | Two ledger-matched sentinels plus unique post-cutover forward migrations | Visible to the controlled production migration workflow |
| Bootstrap lane | Canonical baseline plus copies/manifest-selected post-cutover forward migrations | Isolated/ephemeral databases only; never linked to production |

The archive operation must preserve Git history and byte content. The two sentinels are the exact `20260418_guest_checkout.sql` and `20260510_newsletter_subscribers.sql` files whose versions appear in production history. They remain present only so production migration comparison can retain truthful existing rows. They are explicitly excluded from clean bootstrap.

Before this layout exists, **all Supabase push/reset operations remain prohibited for production** because the current directory contains 31 apparently pending legacy files.

## Baseline format

- One schema-only, versioned baseline SQL artifact generated from a read-only live schema capture and then manually reviewed.
- A baseline manifest recording baseline ID, cutover UTC time, source project/environment identifier, Postgres/Supabase/extension versions, normalized schema checksum, source dump checksum, included schemas, excluded objects, reviewer approvals, and legacy-file hash manifest.
- Baseline SQL contains no customer rows, orders, payment data, provider credentials, bank details, product catalog rows, test data, or environment secrets.
- Safe reference data is stored separately and must be deterministic, non-secret, and explicitly approved.
- Development/test seed data is a third, environment-only input.
- Platform-managed Supabase schemas are not wholesale replaced; only project-owned objects and intentional auth/storage hooks are represented.

The initial baseline should capture the approved **pre-remediation live state** at cutover. DB1C-1 through DB1C-6 then apply as forward migrations to both production and baseline-built environments. After those batches stabilize, a future baseline v2 may squash the baseline-plus-forward result for new environments only; production still never runs the baseline.

## New environment bootstrap

Conceptual sequence, executed only in an isolated unlinked environment:

1. Pin the approved Supabase CLI/container/Postgres versions.
2. Start an empty ephemeral Supabase stack with platform-managed schemas.
3. Install/verify required extensions through the baseline contract.
4. Apply canonical baseline v1.
5. Apply approved non-secret reference data.
6. Apply every post-cutover forward migration in unique timestamp order.
7. Apply optional development/test seed data after schema migrations.
8. Run normalized schema, RLS/policy, grant, function, trigger, Storage, and index validation.
9. Run application integration and role-isolation tests.
10. Destroy the ephemeral environment after evidence capture.

Supabase documents that seed data runs after migrations and recommends keeping schema statements out of seed files. See [Seeding your database](https://supabase.com/docs/guides/local-development/seeding-your-database).

## Existing production upgrade

- Never run the canonical baseline against production.
- Never replay any of the 33 legacy files.
- Generate each approved DB1C fix as a narrow forward migration after read-only preflight.
- Use unique 14-digit UTC versions greater than the baseline cutover.
- Review locks, data scans, transaction boundaries, function grants, policies, and rollback before approval.
- Rehearse on a production-schema clone with representative row counts.
- Apply one authorized batch at a time through a single release owner.
- Record the new migration version normally in `supabase_migrations.schema_migrations` only as a consequence of the approved migration runner applying that migration.
- Verify post-deploy schema checksum, object behavior, role isolation, and application flows before the next batch.

## Migration numbering and collision prevention

- Format: `YYYYMMDDHHMMSS_descriptive_name.sql`, UTC, generated by the approved Supabase migration creation workflow.
- Eight-digit date-only versions are prohibited after cutover.
- The filename timestamp is globally unique; description changes do not make a duplicate timestamp distinct because Supabase compares timestamps.
- A migration is immutable after any shared or production application.
- Every worktree rebases before merge; collision check is mandatory. If two unapplied files collide, regenerate one timestamp before merge.
- Only one release owner applies migrations to each shared environment at a time.
- CI rejects duplicate timestamps, backward timestamps, edited applied-file hashes, and files outside the approved forward lane.

## Apply-state strategy

- Leave the two production rows untouched.
- Do not mark the missing 31 legacy files applied.
- Do not insert all 33 versions.
- Do not use migration repair to make current CLI output appear clean.
- Start truthful forward history at the first post-cutover 14-digit version.
- Maintain an environment apply-state evidence record containing the two historical rows, the baseline relationship (“production equivalent snapshot; baseline not executed”), all future applied versions, and checksums.
- If the primary dual-track approach proves incompatible with approved tooling, use fallback Option C only after exact baseline equivalence proof and separately authorize one baseline marker repair. Never repair the 33-file history wholesale.

The official `migration repair` command changes history only; it does not apply or revert schema. That makes incorrect repair especially dangerous because future tooling can skip SQL that never ran. See [Database Migrations — diagnosing sync errors](https://supabase.com/docs/guides/deployment/database-migrations#diagnosing-and-fixing-sync-errors).

## CI and drift prevention

Every merge containing a future migration must:

1. validate unique 14-digit versions and immutable legacy hashes;
2. construct the isolated bootstrap lane;
3. create an empty ephemeral database;
4. apply baseline plus all forward migrations;
5. apply reference and test seeds in the correct phase;
6. emit a normalized schema representation;
7. compare it with the approved expected schema checksum/diff;
8. verify RLS enabled/forced state, policy expressions/roles, table and column grants, function owners/EXECUTE/search paths, triggers, FKs/checks/uniques/indexes, views, extensions, and Storage policies;
9. run application and two-user authorization tests;
10. fail closed on any unexplained diff.

Production drift monitoring is read-only: periodically capture a normalized production schema and compare it to baseline plus applied forward migrations. Any direct Dashboard/SQL Editor change becomes an incident requiring evidence capture and an approved forward reconciliation migration.

## Disaster recovery

Schema reconstruction must not depend only on a production backup:

- canonical baseline and manifest are version-controlled;
- all post-cutover migrations are immutable and version-controlled;
- reference data is separately versioned;
- secrets/provider configuration is documented in a secure environment runbook, not stored in SQL;
- bucket/cron/external provider configuration has reproducible manifests where safe;
- CI continuously proves an empty build;
- encrypted database backups and point-in-time recovery remain data-recovery controls, not the sole schema source;
- restore rehearsal verifies both schema-only reconstruction and backup restoration.

## Manual/out-of-band domain decisions

| Domain | Baseline decision | Future production decision |
|---|---|---|
| `user_favorites` | Include exact live E1-ready table, constraints, indexes, RLS, policies, grants | DB1C-4 only if reconciliation finds a missing safeguard; do not recreate |
| `notifications` | Include exact live table and access model | DB1C-4 provenance/security forward migration if needed |
| `reviews` | Include exact live base and final moderation state | DB1C-4 narrow fixes after policy/function/storage reconciliation |
| `review_images` | Include exact live table; bucket configuration separate | DB1C-4 table/storage hardening forward changes |
| `review_helpful` | Include exact live table, unique vote rule, and policies | DB1C-4 only for verified gaps |
| `shipments` | Include exact live base and canonical event relationships | DB1C-4/6 forward constraints or event reconciliation |
| `support_requests` | Include exact live base and access contract | DB1C-4 provenance/RLS/index fixes |
| legacy `inventory` | Include only if a live consumer/data-retention need is proven; otherwise exclude and document deprecation | Separate deprecation/data-retention batch; `product_inventory` remains runtime canonical |
| DB `products` | Exclude unless a current runtime/foreign-key dependency is proven; `products.json` remains product source of truth | No speculative table migration |
| Storage buckets/policies | Include policies as schema; bucket properties in approved config/reference manifest | Forward policy/config changes with storage-specific tests |

## Runtime naming decisions

No rename is authorized in DB1C-0. The current recommended canonical runtime names are:

- addresses: `user_addresses`;
- membership state/history: `customer_membership_status` and `customer_membership_history`;
- loyalty transactions: `loyalty_points_ledger`, while `loyalty_accounts` remains unresolved;
- invoices: `invoice_records`;
- refunds: `refund_records`;
- returns: `return_requests` plus `return_request_items`, subject to live reconciliation with `return_items`;
- notification channel preferences: `notification_preferences`;
- notification inbox: `notifications`.

The detailed mapping and compatibility-view decisions are in `COSMOSKIN_DB1C0_RUNTIME_DATABASE_NAMING_MAP_20260712.csv`.

## Security sequencing

| Batch | Must be a production forward migration? | Baseline relationship |
|---|---|---|
| DB1C-1 definer EXECUTE/search path/owners/grants | Yes | Baseline v1 records current live state; forward migration produces hardened state; baseline v2 later absorbs it |
| DB1C-2 profile birthday/consent direct-update boundary | Yes | Same pattern; never silently “fix” only new databases |
| DB1C-4 manual table provenance | Only verified deltas; baseline supplies base provenance | Do not recreate live tables; forward migration changes only gaps |
| DB1C-5 CRM logs/unsubscribe tokens | Yes, because objects are new to production | Future baseline versions include them after deployment |
| DB1C-6 commerce FKs/checks/snapshots | Yes, phased with data preflight/validation | Final constraints included in later baseline versions |

This ordering prevents the canonical baseline from becoming a way to avoid applying security or integrity changes to current production.

## Rollout phases

| Phase | Output | Stop condition |
|---|---|---|
| 0 — backups/read-only evidence | Backup proof, full schema/apply-state/storage/cron capture | Missing backup or incomplete snapshot |
| 1 — isolated baseline generation | Reviewed baseline draft and manifest | Unexplained object/owner/grant/policy omission |
| 2 — clean bootstrap | Successful empty replay evidence | Any replay failure or non-deterministic output |
| 3 — production comparison | Normalized object-level diff | Any unexpected schema/security/storage diff |
| 4 — forward remediation | Narrow reviewed migration drafts | Unresolved naming/data/transaction/lock issue |
| 5 — staging rehearsal | Apply, rollback, performance, and application evidence | Failed role/application/rollback test |
| 6 — production deployment | Human-approved one-batch application | Missing approval, backup, observability, or safe window |
| 7 — post-deploy monitoring | Verified checksum, behavior, and drift record | Any unexplained drift or integrity regression |

The detailed runbook and rollback boundaries are in the accompanying DB1C-0 documents.

## Final strategy decision

Repository evidence strongly supports freezing the current migration set. It contradicts any plan to repair all 33 into a replayable history because:

- the chain fails at its first file;
- 26 files share non-unique version prefixes;
- two files are exact duplicates;
- multiple files depend on manual bases;
- broad bridges intentionally behave differently on partial schemas;
- production itself documents partial file execution;
- production apply-state proves only two timestamps.

The canonical path is therefore: **immutable legacy evidence + isolated baseline for new databases + narrow forward-only production migrations + continuous drift detection**.

## Scope confirmation

No SQL was executed, no deployment occurred, no migration was created or modified, no migration history was repaired, no application code was modified, and `products.json` was unchanged.
