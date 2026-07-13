# COSMOSKIN DB1C-0 Baseline Content Specification

Date: 2026-07-12  
Status: specification only; no baseline or migration created

## Purpose

Define the complete, reviewable content of a future canonical schema baseline for new and ephemeral COSMOSKIN databases. The baseline is a reconstruction artifact, not a production upgrade script, and must never be exposed to the existing production migration runner.

## Baseline identity and manifest

Every baseline version must have a manifest containing:

- baseline ID and semantic version;
- cutover UTC timestamp;
- source environment identifier without credentials;
- source Postgres, Supabase stack/CLI, and extension versions;
- raw schema-capture checksum;
- normalized schema checksum;
- baseline file checksum;
- included and excluded schemas/object classes;
- legacy migration hash manifest;
- forward-migration cutover timestamp;
- known approved deviations from production;
- reviewer identities and approvals;
- evidence locations for clean replay and production diff.

Suggested future naming convention: `<14-digit-UTC>_cosmoskin_canonical_baseline_v1.sql`. The actual timestamp must be generated only when baseline creation is authorized. The baseline belongs to the isolated bootstrap lane, not the production-forward lane.

## Required schema content

### Platform and extensions

- required extensions, with schema placement and version compatibility recorded;
- `pgcrypto` is the only extension declared by current repository migrations, but live verification must confirm the full set;
- references to Supabase-managed roles and schemas without attempting to recreate platform-owned internals;
- explicit assumptions for `auth.users`, `storage.objects`, `storage.buckets`, `auth.uid()`, and standard API roles.

Stop if the live extension set, owner, or schema placement is not captured.

### Types and domains

- project-owned enums, composite types, domains, and sequences;
- type owners and privileges;
- all enum values in their approved order;
- no status vocabulary inferred only from application strings when the live type/constraint differs.

### Tables and columns

For every approved project-owned table:

- schema and table name;
- owner;
- columns in stable declared order;
- exact types, collations, defaults, identity/generated expressions, and nullability;
- primary key;
- partitioning or persistence settings if any;
- comments that explain non-obvious integrity/security contracts;
- replica identity or publication implications where intentionally used.

The baseline must include all runtime tables confirmed as canonical and every supporting table required by functions, triggers, policies, FKs, views, or scheduled jobs.

### Constraints

- primary keys;
- foreign keys with exact referenced schema/table/column and update/delete actions;
- unique constraints and partial unique indexes;
- check constraints, including non-negative money/stock, valid status vocabularies, quantity, discount, refund, snapshot, date-window, and identity rules;
- exclusion constraints where live and intentional;
- constraint validation state and deferrability.

Do not copy a constraint name or expression from a legacy migration when the live definition has not been compared.

### Indexes

- PK/unique indexes;
- every FK-supporting index needed for delete/update and RLS joins;
- user, order, product slug, status/queue, and created-time lookup indexes;
- expressions, predicates, sort direction, included columns, operator classes, and uniqueness;
- index owner/schema and validity state;
- no duplicate semantically equivalent index unless justified.

### Views and materialized views

- exact definition and owner;
- dependency graph;
- `security_invoker` or access-revocation decision for API-visible views;
- grants and column exposure;
- refresh/index policy for materialized views;
- `order_checkout_audit` only if confirmed live and approved, because legacy files drop/recreate it.

### Functions and procedures

- schema, exact signature/overloads, arguments/defaults, return type;
- language, volatility, parallel safety, strictness, leakproof state, cost/rows if material;
- owner and `SECURITY INVOKER`/`SECURITY DEFINER` state;
- fixed safe `search_path` and schema qualification;
- complete normalized body checksum;
- all EXECUTE grants/revokes, including `PUBLIC`;
- dependency classification: trigger-only, internal, service-role, authenticated RPC, anonymous RPC, or maintenance;
- explicit identity checks for any retained privileged user RPC.

The seven DB1B-exposed definer functions must be captured exactly in baseline v1, then hardened through DB1C-1 forward migrations. A later baseline v2 may include the hardened final state.

### Triggers

- table/event/timing/orientation;
- trigger function exact signature;
- transition tables, conditions, constraint/deferred behavior;
- enablement state and firing order assumptions;
- duplicate trigger detection;
- auth-user profile hooks and Storage-related dependencies.

### RLS, policies, and privileges

- RLS enabled and forced flags for every exposed-schema table;
- policy name, command, roles, permissive/restrictive mode, `USING`, and `WITH CHECK`;
- table, sequence, function, schema, and column grants;
- explicit revokes from `PUBLIC`, `anon`, and `authenticated` for server-only objects;
- owner/bypass-RLS role assumptions;
- API exposure decision: server-only, own-row direct access, or public-safe read projection.

RLS and grants must be reviewed together. An enabled RLS flag alone is not sufficient baseline evidence.

### Storage

Represent separately but validate together:

- Storage policies on `storage.objects` as project-owned schema/security DDL;
- bucket IDs, public/private flag, size limit, MIME allowlist, and file-layout contract in approved configuration/reference data;
- no object rows or customer files in the schema baseline;
- `review-images` and `return-attachments` exact live configuration and policies;
- signed/public URL model and retention/deletion responsibility.

Current Supabase documentation supports representing bucket configuration through project config while Storage policies can be schema-managed. See [Local development with schema migrations — Storage buckets](https://supabase.com/docs/guides/local-development/overview#sync-storage-buckets).

### Scheduled jobs and operational metadata

- project-owned cron job definitions only if reproducible, non-secret, and approved;
- job schedule, command/function target, owner, timeout, and failure observability;
- no provider token, webhook secret, project URL secret, or environment-specific credential in baseline SQL;
- if a job cannot be represented safely, store a declarative operational manifest and manual approval runbook instead.

DB1 did not prove live cron apply-state; baseline generation must capture it read-only.

### Comments and ownership

- object comments for security and source-of-truth boundaries;
- explicit object owners following the approved Supabase role model;
- no accidental ownership by a transient developer role;
- safe search paths for privileged functions;
- baseline comments must not contain secrets, customer PII, or operational credentials.

## Domain inclusion matrix

| Domain | Baseline v1 | Notes |
|---|---|---|
| profiles/account | Include exact live tables, fields, triggers, RLS/policies/grants | DB1C-2 hardening remains a forward migration |
| notification preferences | Include exact live source-of-truth table | Separate channel preferences from consent audit |
| favorites | Include exact E1-ready table and own policies | No production recreation |
| orders/items/payments | Include exact live bases and snapshots | DB1C-6 constraints remain forward changes |
| inventory | Include `product_inventory`, reservations, movements, RPC dependencies | Legacy `inventory` only with proven consumer/retention need |
| pricing | Include override/audit tables and sale fields | Capture admin grants/RLS exactly |
| coupons | Include coupons, redemptions, customer-coupon model actually used | Reconcile reservation/usage aliases |
| reviews/images/helpful | Include exact live base, moderation triggers/policies | Bucket configuration separate |
| shipments/events | Include canonical live model | Reconcile `shipment_events` vs `shipping_events` responsibilities |
| support | Include exact live `support_requests` | Define own/server/admin access |
| returns/refunds/invoices | Include canonical mapped live names | No generic alias tables |
| membership/loyalty | Include state, history, ledger, levels/rules, functions | Keep Essential/Signature/Elite; map `loyalty_accounts` first |
| CRM/newsletter/consent | Include existing live schema | DB1C-5 adds new outbox/token objects forward-only |
| admin/RBAC/audit | Include exact live roles/permissions/users/audit objects | Never seed privileged user identity casually |
| legal | Include versions/snapshots/consent schema | Legal content rows are reference data, not schema |
| DB `products` | Exclude unless a current dependency is proven | `products.json` remains catalog source of truth |

## Separate reference data

Reference data is versioned separately from schema and must be deterministic and idempotent:

- membership level definitions;
- loyalty point rules;
- allowed status/reference vocabularies only when table-backed;
- legal-document metadata/content versions under legal approval;
- admin role/permission catalog without personal admin accounts;
- shipping/return configuration defaults that are genuinely environment-independent;
- other immutable lookup rows confirmed as required for application startup.

Reference data must have its own checksum and review. It runs after schema and before application tests.

## Excluded from baseline SQL

- customer profiles, consent rows, favorites, orders, payments, addresses, reviews, support cases, returns, refunds, shipment events, CRM events, logs, and audit rows;
- production product catalog rows when `products.json` is authoritative;
- inventory quantities/lots/reservations;
- bank account values and provider configuration;
- admin user identities, password/session material, API keys, JWT secrets, SMTP/Brevo/iyzico/DHL credentials;
- Storage object rows and files;
- environment URLs and project references;
- analytics/test/demo data;
- manual backfills;
- production migration-history rows.

## Environment configuration inventory

The baseline manifest/runbook must name, but never embed:

- Supabase project/region/compute settings;
- Auth providers, redirect URLs, token/session settings, email templates, CAPTCHA, and SMTP;
- Data API exposed schemas and table-grant defaults;
- Vault/secrets;
- Storage provider/bucket operational settings not safely declarative;
- Realtime publications;
- network restrictions, backups, PITR, log drains, and alerting;
- Brevo, iyzico, DHL, Cloudflare, and email-provider configuration;
- scheduled job credentials and external endpoints.

## Baseline review acceptance criteria

- exact object inventory reconciles to approved live snapshot;
- no unexplained owner, grant, policy, function, trigger, Storage, or extension diff;
- no customer/operational data or secret is embedded;
- all runtime tables/RPCs resolve;
- clean bootstrap and second replay produce deterministic results;
- baseline plus forward migrations matches the approved expected schema;
- two-user/anonymous/service authorization tests pass;
- application integration tests pass;
- checksum and reviewer approvals are recorded;
- production-exclusion guard is proven.

## Stop conditions

Stop baseline work for any incomplete live snapshot, unexplained object, unresolved runtime name, missing Storage policy, unknown function owner/grant, embedded secret/PII, non-deterministic replay, or unexpected production diff.

## Scope confirmation

This specification did not create a baseline, SQL migration, seed, configuration file, or database object.
