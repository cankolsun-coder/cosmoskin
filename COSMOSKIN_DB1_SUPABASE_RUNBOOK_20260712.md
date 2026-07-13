# COSMOSKIN DB1 Manual Supabase Verification Runbook

Date: 2026-07-12
Prepared only; not executed

## Purpose

Safely compare the live Supabase project with repository expectations without mutating schema or data. The operator, not this audit, executes the prepared read-only queries.

Primary inputs:

- `COSMOSKIN_DB1_SUPABASE_SCHEMA_VERIFICATION_AUDIT_REPORT_20260712.md`
- `COSMOSKIN_DB1_SUPABASE_SCHEMA_EXPECTATION_MATRIX_20260712.csv`
- `COSMOSKIN_DB1_SUPABASE_VERIFICATION_QUERIES_20260712.sql`
- `COSMOSKIN_DB1_SUPABASE_RLS_SECURITY_AUDIT_PLAN_20260712.md`
- `COSMOSKIN_DB1_SUPABASE_RECOMMENDED_MIGRATION_BACKLOG_20260712.md`

## Safety conditions

Before opening the SQL Editor:

- confirm the Supabase project reference and environment (production/staging);
- use a read-only database role where possible;
- do not use an application service key in the SQL Editor;
- do not paste customer data into tickets/reports;
- do not run any `CREATE`, `ALTER`, `DROP`, `GRANT`, `REVOKE`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, migration apply, or function invocation;
- do not run repository manual/backfill/test-data SQL;
- do not enable extensions or advisors that mutate configuration;
- stop if a selected block contains a write statement.

The query pack uses `BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK;` as an optional session guard. If the Supabase SQL Editor executes selections independently, use a genuinely read-only role and run only SELECT blocks.

## Roles

| Role | Responsibility |
|---|---|
| DB operator | Executes read-only query blocks and exports sanitized results |
| Security reviewer | Reviews RLS, grants, policies, function privileges, and Storage |
| Commerce owner | Reviews orders/payments/refund/snapshot/inventory discrepancies |
| Account owner | Reviews profile/preferences/favorites/support discrepancies |
| Release owner | Assigns P0/P1 decisions and blocks/releases deployment |

## Step 1 — Record evidence header

Record outside SQL:

- project ref and environment;
- UTC and Europe/Istanbul timestamps;
- reviewer/operator identity;
- current application commit (`8594bea` or later expected);
- whether Data API is enabled;
- exposed schemas;
- “Automatically expose new tables/functions” project setting;
- Postgres version;
- whether production branching/clone is available.

Do not record keys or connection strings.

## Step 2 — Verify migration apply-state

Run query-pack Section 1 migration-history SELECT.

Compare returned versions with all 33 repository migration filenames. Classify each:

- applied exactly once;
- missing;
- present under a different/manual version;
- unknown because production baseline predates migration tracking.

Mandatory checks:

- Is `20260703_batch1_account_safe_functional_fixes` applied?
- Is `20260704_batch4_loyalty_ledger` applied?
- Are H0/H0b/H0c applied in intended order?
- Is D3A applied?
- Are P1C and P1E applied?
- Is R1G applied?
- Were root/manual `schema.sql`, `commerce-schema.sql`, `reviews.sql`, or `phase51_reviews_hardening.sql` historically applied?

Do not apply a missing migration during this runbook.

## Step 3 — Relation existence inventory

Run the expected-relation query.

Immediate P0 conditions:

- missing `user_favorites`;
- missing `notification_preferences`;
- missing `support_requests`;
- missing review tables;
- missing `shipments`;
- missing orders/items/payments/inventory/price tables;
- unexpected relation kind (for example a view where a base table is expected).

Also record unexpected legacy relations:

- `inventory`;
- `products`;
- `checkout_idempotency`;
- `coupon_reservations`;
- alternate customer/profile/newsletter/refund names.

Do not drop legacy objects during verification.

## Step 4 — Column/type/default comparison

Run the complete column inventory and focused missing-column query.

Export only schema metadata. Compare against the CSV matrix.

Priority discrepancies:

- favorites owner/slug/timestamps;
- UX4 birthday lock/correction and consent fields;
- notification preference fields;
- P1E sale/compare-at/windows and audit old/new fields;
- D3 snapshot fields;
- inventory stock/status/backorder fields;
- reviews/review-images moderation and timestamps;
- return item paid-snapshot fields;
- support request fields.

For each difference record:

- live type/default/nullability;
- repository expectation;
- code read/write location;
- whether code has a compatibility fallback;
- P0/P1/P2 impact.

## Step 5 — Constraints, indexes, and FKs

Run query-pack Section 3.

Review in this order:

1. primary keys;
2. unique identities;
3. foreign keys and delete rules;
4. CHECK constraints;
5. FK indexes;
6. hot-path composite indexes;
7. duplicate/redundant indexes (observation only).

P0 checks:

- favorite `(user_id,product_slug)` unique;
- notification preference `user_id` unique;
- inventory normalized slug unique;
- price override slug unique;
- checkout idempotency unique;
- review user/product and helpful user/review unique;
- order child FKs;
- positive/non-negative commerce/inventory constraints;
- payment/provider idempotency;
- return/review/shipment child FKs and indexes.

Do not create an index or constraint during this runbook.

## Step 6 — RLS, grants, policies, views

Run query-pack Section 4 and view query in Section 15.

For every table assign one access model:

- server-only;
- direct authenticated own-row access;
- public safe read;
- internal/non-exposed.

Compare actual grants/policies with that model.

Immediate P0 escalation:

- RLS disabled on PII/user/admin/provider table;
- `anon`/`authenticated` direct access to a server-only table;
- broad true policy on sensitive data;
- hard-coded admin email policy;
- direct profile UPDATE can modify protected UX4 fields;
- returns/support/favorites/reviews cross-user access;
- non-security-invoker API view exposing protected tables.

Use the separate RLS plan for A/B identity tests. Catalog review alone is not sufficient.

## Step 7 — RPC and `SECURITY DEFINER` review

Run query-pack Section 5.

First inspect `recalculate_customer_membership(uuid)`:

- is it `SECURITY DEFINER`?
- can PUBLIC/anon/authenticated execute it?
- can it return another user's membership row when given another UUID?
- is `search_path` fixed?

Then review every inventory/payment/loyalty/review/auth helper.

P0 condition: any server-only privileged function executable by a public API role.

Do not invoke mutation RPCs in production as part of verification.

## Step 8 — Data-quality checks by domain

Only run a domain block after the relation/column inventory proves all named columns exist. If a query fails because of schema drift, record the error and stop that block; do not edit the query ad hoc against production data without review.

### Favorites

Run duplicates, blank slug, and policies. Run the DB `products` orphan check only if `public.products` is an intentional slug registry. Otherwise compare a sanitized slug export to the trusted `products.json` catalog offline.

### Account/preferences

Run profile email duplicates, birthday-state inconsistencies, duplicate preferences, and cross-source preference drift. Export counts/IDs only; redact email values.

### Pricing

Run duplicate/invalid override and audit-presence queries. Do not include full admin actor data in shared evidence.

### Orders/payments/refunds

Run negative total, snapshot integrity/completeness, allocation sum, provider duplicate, and completed-refund checks. Share order IDs only in restricted evidence.

### Inventory

Run normalized duplicate, invalid stock/status, and active reservation duplicate checks. Do not reconcile stock during DB1.

### Reviews/storage

Run duplicate review, status/approved drift, orphan image, sort-order duplicate, bucket, and storage-policy checks. Do not export customer image paths.

### CRM/newsletter

Run normalized email duplicate and status/consent checks. Export aggregate counts, not subscriber emails.

### Membership

Run canonical tier, invalid status, ledger idempotency, and aggregate balance queries. Check cron existence/schedules without invoking jobs.

### Shipments/support

Run orphan/idempotency/time-order checks. Run support data query only if the table exists; export counts and internal IDs, not messages/emails.

## Step 9 — Storage dashboard verification

For each bucket record:

- name/id;
- public/private;
- size limit;
- MIME allowlist;
- policy names/roles/commands;
- path ownership predicate;
- whether application upload path matches the policy.

Buckets:

- `review-images`;
- `return-attachments`.

Do not open or download customer files during DB1.

## Step 10 — Cron/scheduler verification

Check whether `pg_cron` exists and whether scheduled jobs cover:

- membership recalculation;
- loyalty pending promotion;
- points expiry/reversal;
- birthday benefits;
- expired inventory reservation release.

Also check external Cloudflare scheduler configuration if database cron is not used. Record schedule, endpoint/function, authentication mechanism, last success, and retry behavior. Do not trigger a job.

## Step 11 — Reconcile results

Create a restricted result worksheet with:

| Field | Meaning |
|---|---|
| Finding ID | DB1-P0/P1/P2 identifier |
| Environment | production/staging |
| Object | table/function/policy/index/bucket |
| Expected | matrix contract |
| Actual | sanitized metadata/result |
| Evidence query | query-pack section |
| Impact | feature/security/integrity/provenance |
| Owner | accountable team/person |
| Decision | fix/accept/defer/false positive |
| Due date | required for accepted P0/P1 debt |

Map confirmed findings to the migration backlog. Do not create migration filenames until scope and live shape are approved.

## Step 12 — Release gate

Block database-dependent release when any of the following is unresolved:

- required runtime table missing;
- missing favorite uniqueness or account preference persistence contract;
- user/PII/admin table exposed without intended RLS/grants;
- privileged server RPC publicly executable;
- core order/payment/inventory child integrity broken;
- D3 snapshot inconsistency affecting refund caps;
- review Storage/table moderation mismatch;
- production migration state cannot identify the active schema version.

P1/P2 items may be deferred only with written owner, rationale, monitoring, and expiry date.

## Step 13 — Post-verification handoff

The next authorized phase may design migrations, but only after:

- sanitized live evidence is reviewed;
- exact before/after schemas are agreed;
- backfill/constraint validation strategy is safe;
- RLS identity tests are specified;
- rollback/containment is documented;
- no protected admin auth/RBAC application changes are included without explicit approval.

## Completion record

At runbook completion record:

- SQL executed: read-only SELECT/catalog blocks only;
- mutations/deployments: none;
- customer data exported: none beyond approved sanitized counts/IDs;
- P0 count/open decisions;
- P1 count/open decisions;
- release decision and approver.
