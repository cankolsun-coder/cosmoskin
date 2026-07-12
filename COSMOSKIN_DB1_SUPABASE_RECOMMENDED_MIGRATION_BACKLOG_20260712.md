# COSMOSKIN DB1 Recommended Migration Backlog

Date: 2026-07-12
Status: recommendations only; no migration created or applied

## Backlog rules

- Do not author any migration until the manual DB1 query pack has been run and live schema/apply-state evidence is captured.
- Never recreate a production table from repository assumptions when an out-of-band live table may already contain data.
- For unclear provenance, first pull/describe the live object, reconcile differences, then design an additive/idempotent migration.
- Separate privilege/RLS changes from structural/data backfills when rollback and review benefit from isolation.
- Before applying, test against a production schema clone with representative row counts and RLS identities.

## P0 — release/security/data-integrity backlog

### DB1-P0-01 — Establish canonical migration baseline and apply-state

Problem: ordered migrations cannot bootstrap a blank database; the first migration alters `orders` before migrations create it, and multiple root SQL files act as an undocumented baseline.

Scope after live verification:

- identify the actual production baseline/version;
- record which root/manual SQL files were historically applied;
- choose a supported bootstrap strategy: squashed baseline for new environments plus forward migrations, or canonical initial migrations;
- verify `supabase_migrations.schema_migrations` against repository filenames;
- document duplicate UAT migrations and hotfix provenance without rewriting applied history.

Acceptance:

- a new empty test project can be built deterministically;
- production apply-state differences are explicit;
- no destructive replay or duplicate seed effects.

### DB1-P0-02 — Canonical `user_favorites` migration

Problem: E1 runtime table exists only in root SQL provenance.

Required verified contract:

- UUID PK, user FK/cascade;
- canonical slug and display snapshot fields;
- unique `(user_id,product_slug)`;
- user list/product indexes;
- updated-at behavior;
- RLS and exact own select/insert/delete/update decision;
- explicit grants matching the chosen direct-client/server-only model.

Acceptance:

- no duplicates or blank slugs before unique enforcement;
- user A/B RLS tests pass;
- E1 add/remove/race behavior passes after migration.

### DB1-P0-03 — Canonical `support_requests` schema

Problem: runtime reads/inserts a table with no SQL definition under `supabase/`.

Required verified contract:

- identity, user/email/order relationship;
- category, subject, message, status, timestamps;
- admin-only status/assignment/resolution fields if used;
- user/created, order, status/created indexes;
- allowed status/category checks;
- own select/insert, admin/server update;
- retention and PII access rules.

Acceptance:

- account support create/list passes;
- cross-user reads/writes fail;
- orphan user/order rows are resolved or explicitly allowed.

### DB1-P0-04 — Canonical reviews/review images/helpful/storage provenance

Problem: base tables, RLS, and Storage bucket live only in root/manual SQL; R1G is only a patch.

Required reconciliation:

- pull exact live columns/types/defaults/constraints/indexes/triggers;
- remove the code-era need for missing-column ambiguity after rollout;
- migrate `reviews`, `review_images`, `review_helpful` base provenance;
- align `status`/`approved` trigger and `updated_at`;
- replace hard-coded admin-email policies with server/RBAC model;
- verify `review-images` bucket and path policies;
- decide public bucket vs private signed URLs.

Acceptance:

- public sees approved rows/images only;
- owner can create/update according to product rules but cannot self-approve;
- image-level moderation works;
- user A cannot affect user B's review/image/helpful rows;
- fresh environment reproduces the R1 schema.

### DB1-P0-05 — Canonical `shipments` base and event model

Problem: migrations alter `shipments` but do not create its base; `shipment_events` and `shipping_events` overlap.

Scope:

- capture live `shipments` definition;
- provide canonical base provenance without data loss;
- verify order FK, status vocabulary, provider IDs, tracking fields, payload JSON, dimensions, direction, timestamps;
- decide canonical ownership of `shipment_events` vs `shipping_events` or document distinct purposes;
- add provider-event idempotency uniqueness where applicable.

Acceptance:

- account/admin/tracking paths use documented tables;
- no orphan shipment/event rows;
- DHL/manual placeholders remain behaviorally unchanged.

### DB1-P0-06 — Post-20260616 RLS/grant hardening

Problem: blanket RLS hardening was one-time and preceded later table creation.

Immediate candidates:

- `admin_roles`, `admin_permissions`, `admin_activity_logs`;
- `campaign_eligibility_logs`, `loyalty_point_rules`, `membership_levels`;
- `return_request_items`, `return_request_attachments`, `return_status_events`;
- `shipping_events`, `shipping_settings`, `return_items`;
- any live table returned by the audit query with RLS disabled.

Acceptance:

- every table in exposed schemas has intentional RLS/grants;
- server-only tables deny anon/authenticated direct access;
- required client tables have minimal explicit grants and passing policies.

### DB1-P0-07 — Privileged function EXECUTE hardening

Problem: final `recalculate_customer_membership(uuid)` is `SECURITY DEFINER` with no repository revoke/grant block; other root/manual helper functions may have the same issue.

Scope:

- inventory all `SECURITY DEFINER` functions;
- revoke default PUBLIC/anon/authenticated execution unless designed for user calls;
- grant server functions only to `service_role`;
- move helpers to a private schema where appropriate;
- fix `search_path` and identity validation;
- review `check_purchase`, `get_review_summary`, profile trigger functions, and all payment/inventory/loyalty RPCs.

Acceptance:

- no unintended privileged function is directly executable by public roles;
- code-call signatures still resolve;
- payment/inventory/loyalty integration tests pass.

### DB1-P0-08 — Protect UX4 profile integrity at the database access boundary

Problem: whole-row own UPDATE can bypass birthday lock/correction counters and consent preservation if direct Data API privileges exist.

Options after access-model decision:

- server-only profile writes;
- column-level privileges for safe fields;
- a validated user-profile RPC with protected columns excluded;
- split protected consent/birthday audit fields into server-only tables.

Acceptance:

- direct authenticated calls cannot alter protected lock/audit/admin fields;
- normal name/phone/account experience remains functional;
- consent records remain append-only/auditable.

### DB1-P0-09 — Core commerce FKs, money checks, and snapshot invariants

Problem: compatibility migrations do not prove child FKs or non-negative/consistency checks.

Verify/design for:

- order FK on items/payments/status events/shipments/refunds/coupon redemptions/legal rows;
- positive item quantity;
- non-negative totals/payments/refunds;
- discount not greater than applicable subtotal;
- D3 snapshot all-or-none and arithmetic consistency;
- provider/callback/idempotency unique constraints;
- indexes on every FK.

Acceptance:

- existing rows pass preflight data checks;
- constraints are added safely/validated;
- checkout, callback, bank transfer, return, and refund validators pass.

### DB1-P0-10 — Apply/verify notification and account preference source of truth

Problem: UX4 depends on `notification_preferences`; preferences also exist in `profiles` and legacy `customer_preferences`.

Scope:

- verify 20260703 migration applied;
- prove unique user row/FK/policies/grants;
- define canonical ownership for each preference;
- remove or document sync behavior for legacy `customer_preferences`;
- decide whether a separate personalization consent field is needed.

Acceptance:

- save/refresh/cross-account-page persistence passes;
- omitted fields preserve consent;
- no conflicting preference values or ambiguous writer.

## P1 — feature degradation, audit, and reconciliation backlog

### DB1-P1-01 — CRM delivery/outbox/sync audit objects for E3

Potential objects:

- `crm_sync_logs` or a transactional outbox with event id, provider, attempt count, status, response code/reference, next retry, timestamps;
- unique idempotency key;
- dead-letter/manual retry state.

Add only when E3 automatic Brevo synchronization is approved. Current `crm_events` is an event foundation, not a delivery ledger.

### DB1-P1-02 — Tokenized unsubscribe/preference-center support

Potential `email_unsubscribe_tokens` contract:

- hashed token only;
- email/user target;
- purpose/list/consent scope;
- expiry, used/revoked timestamps;
- unique token hash;
- server-only access.

Do not implement until the legal/preference-center flow is defined.

### DB1-P1-03 — Membership promotion/expiry scheduling

Problem:

- `cosmoskin_promote_due_loyalty_points` exists but no cron endpoint invokes it;
- `points-expiry.js` is a placeholder;
- repository does not prove scheduled invocations.

Scope:

- define promotion/expiry accounting rules;
- wire authenticated scheduled endpoints or database cron;
- add execution/audit/idempotency evidence;
- verify membership/birthday cron schedules.

### DB1-P1-04 — Normalized refund item ledger decision

Assess whether `refund_records.metadata.item_proration_breakdown` plus `return_request_items` is sufficient. If not, define `refund_items` with paid snapshot, quantity, amount, order item FK, refund FK, and idempotency. Do not duplicate mutable product pricing.

### DB1-P1-05 — Consent/CRM FK, idempotency, and retention hardening

- user/order FKs where compatible with guest/email identities;
- consent event dedupe key or append-only event identity;
- CRM event idempotency;
- retention/pseudonymization policy;
- indexes for user/email/event/time.

### DB1-P1-06 — Admin RBAC schema consistency

Resolve:

- `role` vs `role_code` as canonical;
- `status` vs `is_active` dual state;
- role set drift (`accountant` seeded but omitted from admin/users endpoint role set);
- permission naming drift (`admin.users.manage` vs colon convention);
- actor FK and role FK on activity logs where safe.

No admin auth code change belongs in DB1; this is schema/backlog evidence only and requires the project's protected-auth approval process.

### DB1-P1-07 — Invoice field alias consolidation

Verify and reconcile `pdf_url` vs `file_url`, `invoice_status` vs older `status`, and provider identifiers. Maintain compatibility views/API mapping only if necessary and RLS-safe.

### DB1-P1-08 — Inventory and event audit idempotency

- reservation uniqueness/expiry index;
- movement event idempotency/reference;
- `related_order_id` UUID/FK consistency;
- reserved-vs-on-hand invariant decision;
- legacy `inventory` retirement.

### DB1-P1-09 — Review and return file-row uniqueness

- unique storage bucket/path;
- `(review_id,sort_order)` if stable ordering requires it;
- attachment FK/index/size/mime checks;
- delete/cleanup lifecycle evidence.

## P2 — cleanup and provenance backlog

### DB1-P2-01 — Remove or quarantine stale D1 reviews documentation/schema

`functions/api/reviews/schema.sql` and README describe a D1 `product_reviews` system while the live handler uses Supabase REST tables. Mark historical or update documentation in a separate approved documentation scope.

### DB1-P2-02 — Document table aliases

Canonical names:

- `profiles`, not `customer_profiles`;
- `user_addresses`, not `customer_addresses`;
- `newsletter_subscribers`, not `newsletter_subscriptions`;
- `coupon_redemptions`, not `coupon_usage`;
- `refund_records`, not `refunds`.

### DB1-P2-03 — Duplicate/legacy migration and SQL provenance map

Document the relationship among root schemas, UAT fix/v2, hotfixes, manual scripts, rollback files, and migration history. Do not delete applied history.

### DB1-P2-04 — Index usage/observability review

After correctness is established, use `pg_stat_user_indexes`, query logs, and advisors to identify redundant indexes and missing hot-path composites. Do not remove indexes from static inference alone.

## Recommended sequence

1. Run manual DB1 catalog/existence/RLS/function checks.
2. Resolve P0-01 apply-state and baseline.
3. Immediately contain P0-06/P0-07 security exposure if confirmed live.
4. Reconcile missing/partial runtime tables: P0-02 through P0-05.
5. Protect profile/account integrity and preferences: P0-08/P0-10.
6. Add commerce invariants only after data preflight: P0-09.
7. Address P1 E3, loyalty scheduling, refunds, and audit improvements.
8. Perform P2 cleanup after canonical provenance is stable.

## Explicitly deferred

- No migration SQL is authored in DB1.
- No production backfill is designed without live row-shape/count evidence.
- No abandoned-cart schema is recommended until E3 consent and lifecycle requirements exist.
- No `refund_items` table is assumed mandatory until accounting/reconciliation needs are confirmed.
- No admin auth/RBAC application file is modified.
