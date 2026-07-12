# COSMOSKIN DB1B Remediation Decision Plan

Date: 2026-07-12  
Input: DB1 audit commit `2b6ed8d` and operator-supplied DB1B live read-only results  
Status: decision plan only; no remediation, SQL execution, deployment, or migration authoring

## Decision objective

DB1C must turn a live-but-partly-out-of-band production schema into a controlled, reproducible, least-privilege database contract without replaying guessed history or interrupting current commerce. Each batch below begins with evidence and design approval; no production DDL is implied by this plan.

## Global guardrails

- Do not replay the full repository migration chain against production.
- Do not insert historical migration versions into `supabase_migrations.schema_migrations` until the baseline strategy is explicitly approved.
- Do not create alternate tables merely because an expected logical name is absent.
- Capture the live definition, dependencies, policies, grants, triggers, row counts, and data anomalies before drafting DDL.
- Separate structural, data-backfill, privilege, and constraint-validation changes when separation improves rollback safety.
- Test on a production-schema clone or isolated branch with representative data and four roles: anonymous, user A, user B, and service/admin.
- Treat service-role compatibility as necessary but not sufficient; direct Data API exposure must be intentionally denied or tested.
- Preserve current checkout, pricing, coupon, stock, refund, account, and membership behavior.
- Every implementation batch requires an explicit authorization separate from this document.

## DB1C P0-1 — Migration baseline and apply-state strategy

### Evidence to capture

- complete live schema-only dump or equivalent catalog export, including schemas, tables, sequences, views, functions, triggers, indexes, constraints, policies, grants, owners, extensions, storage metadata, and cron objects;
- exact live `supabase_migrations.schema_migrations` contents;
- repository migrations and root/manual SQL crosswalk;
- object creation/modification evidence where Supabase logs or release records retain it;
- row counts and dependent-object graph for objects with unclear provenance.

### Decision options

1. **Squashed canonical baseline for new environments plus forward-only migrations.** Prefer when historical application order cannot be proven.
2. **Canonical initial migrations rebuilt from reconciled live definitions.** Prefer only if history can be represented safely and deterministically.

Production history must remain truthful. A new baseline may be a bootstrap artifact for new environments without pretending that every historical migration ran in production.

### Acceptance gate

- a brand-new isolated database builds successfully and deterministically;
- schema diff against the approved live contract is empty or contains documented environment-only differences;
- no seeds, emails, external calls, or duplicate business data are produced;
- production is not modified during the proof;
- the future migration starting point and apply-state recording procedure are documented.

### No-go conditions

- incomplete function/policy/grant capture;
- unexplained live objects or destructive diff;
- a plan that requires replaying unknown DDL against production;
- bootstrap depends on root/manual SQL without an ordered contract.

## DB1C P0-2 — SECURITY DEFINER EXECUTE hardening

### In-scope functions

- `recalculate_customer_membership`
- `recalculate_loyalty_account`
- `recalculate_routine_streak`
- `cosmoskin_activity_order_insert`
- `cosmoskin_activity_order_update`
- `loyalty_ledger_recalculate_trigger`
- `routine_completion_recalculate_trigger`

### Evidence and decisions

For every exact signature/overload, capture owner, source, arguments, return type, trigger dependencies, callable code paths, grants, `search_path`, and whether the function accepts a caller-selected user/order identifier.

Classify each function:

- **trigger/internal only:** remove direct public/API execution;
- **service-role operation:** revoke `PUBLIC`, `anon`, and `authenticated`; grant only the service execution role;
- **intentional authenticated RPC:** keep only after identity-safe parameter and row-scope validation is proven;
- **obsolete:** deprecate only after dependency and usage proof.

### Acceptance gate

- anonymous execution denied for all seven;
- authenticated direct execution denied unless a written user-RPC contract exists;
- retained user RPCs bind ownership to `auth.uid()` and pass cross-user denial tests;
- safe fixed `search_path` and schema qualification are in place;
- triggers, order activity, routine streak, membership, and loyalty recalculation paths pass regression tests;
- no function grant relies on default `PUBLIC EXECUTE`.

### Rollback requirement

Record exact pre-change grants and definitions. Any rollback must restore only the explicitly required caller role, never broad `PUBLIC` by default.

## DB1C P0-3 — Profiles DB-level birthday and consent protection

### Protected fields

At minimum, review:

- birthday and lock state: `birthday`, `birth_date_locked`, `birthday_change_count`, `birthday_last_changed_at`;
- consent/preference fields on `profiles`;
- `metadata` keys that influence eligibility, consent, authorization, or audit state;
- administrative/account-control fields such as status or fraud flags;
- owner identity and server-managed timestamps.

### Design options

1. **Server-only profile writes:** revoke authenticated direct UPDATE and keep Cloudflare APIs authoritative.
2. **Validated profile RPC:** expose only customer-editable inputs; enforce birthday and consent transitions atomically.
3. **Column-level privileges:** deny protected columns while allowing safe fields, with RLS retained for row ownership.
4. **Table separation:** move consent/birthday audit state into server-owned tables when immutable history justifies it.

The chosen option must account for all current account pages and any direct Supabase client consumers; do not assume all writes are server-side without code and traffic proof.

### Acceptance gate

- user A cannot read or update user B;
- direct authenticated writes cannot reset counters, unlock birthday, forge last-changed time, alter protected consent/audit state, change ownership, or modify admin fields;
- permitted name/phone/profile edits still work through the chosen path;
- UX4 omitted-field consent preservation still passes;
- append-only consent evidence remains intact;
- service/admin repair path is documented and audited.

## DB1C P0-4 — Exact commerce and membership table-name mapping

### Required crosswalk

| Capability | Candidate live objects | Decision evidence |
|---|---|---|
| addresses | `addresses`, `user_addresses` | Runtime references, row counts, owners, FKs, policies, legacy writers |
| membership | `customer_membership_status`, `customer_membership_history`, `loyalty_accounts` | Current-state owner, history source, balance authority, recalculation functions |
| invoices | `invoice_records` | Runtime reads/writes, order FK, uniqueness, status/audit contract |
| refunds | `refund_records` | Paid snapshot source, payment/order FK, idempotency, amount boundaries |
| returns | `return_requests`, `return_items`, possibly `return_request_items` | Header/line relationship, runtime name, FKs, refund linkage |

### Decisions

- designate one canonical object per responsibility;
- document compatibility aliases/views only if required and RLS-safe;
- do not introduce `customer_addresses`, `customer_memberships`, `invoices`, `refunds`, or `returns` tables merely to match generic expectations;
- retain only the canonical Essential, Signature, and Elite tier vocabulary;
- identify any dual-write or stale-object decommission work as a separate future batch.

### Acceptance gate

- every application table reference maps to exactly one live contract;
- no unresolved dual writer exists;
- ownership, FK, policy, and snapshot source are documented;
- refund calculations demonstrably use paid order-item snapshots;
- membership current state, history, lifetime spend, qualifying count, and points ledger responsibilities are unambiguous.

## DB1C P1-1 — Canonical provenance for live manual/out-of-band objects

Order after the P0 baseline is frozen:

1. `support_requests`;
2. `shipments` and shipment/event ownership;
3. `reviews`, `review_images`, `review_helpful`, and review-image storage policies;
4. `notifications`.

For each object, capture then reconcile the exact live base definition. Author future migrations only after duplicate/blank/orphan/status checks pass. Include explicit indexes, constraints, policies, grants, triggers, and ownership. Treat root/manual SQL as evidence, not automatically as the canonical source.

Acceptance:

- new-environment bootstrap produces the approved live contract;
- current production data requires no destructive recreation;
- cross-user and anonymous access tests pass;
- support PII, shipment provider payloads, pending reviews, and notification content have intentional exposure models;
- `review-images` bucket/path policies match review ownership and moderation.

## DB1C P1-2 — CRM delivery logs and unsubscribe tokens

Create only after the E3 delivery and preference-center requirements are approved.

Required delivery/outbox decisions:

- canonical event type and payload contract;
- provider, attempt count, status, response/reference, next retry, timestamps, and dead-letter/manual retry state;
- unique idempotency key and retention/redaction policy;
- bank-transfer order event coverage and birthday attribute sync ownership;
- server-only grants/RLS and operational visibility.

Required unsubscribe-token decisions:

- one-way token hashing rather than plaintext token storage;
- purpose, scope, expiry, used/revoked timestamps, and rotation;
- consent event linkage and provider synchronization;
- rate limiting, replay resistance, and audit retention.

Acceptance: delivery failures are observable and safely retryable, duplicate sends are bounded by idempotency, and unsubscribe actions are single-purpose, auditable, and cannot expose customer data.

## DB1C P1-3 — Commerce FK, check, snapshot, and index invariants

Verify existing data before proposing enforcement for:

- FKs from order items, payments, shipments, refund records, returns, coupon redemptions, legal records, and status events;
- positive quantities and non-negative stock, reservation, price, discount, total, payment, and refund amounts;
- `stock_reserved <= stock_on_hand` unless approved backorder semantics explicitly permit otherwise;
- order total arithmetic and discount allocation boundaries;
- D3 paid-unit-price/snapshot all-or-none and arithmetic consistency;
- refund totals bounded by paid/refundable snapshots and prior refunds;
- provider/callback/order/reference idempotency uniqueness;
- coupon-code and redemption uniqueness;
- indexes supporting every FK, user/order/product lookup, status queue, and recent-history query.

Use NOT VALID/VALIDATE or phased backfill patterns where appropriate only after row-count, lock, and query-plan assessment.

Acceptance: zero unexplained preflight violations; checkout, bank transfer, callback, cancellation, return, refund, inventory, pricing, and coupon tests pass on the isolated target; lock and rollback plans are approved.

## Release decision table

| Decision area | Current decision | DB1C exit condition |
|---|---|---|
| E1 favorites live contract | Accept | Preserve exact live contract in canonical baseline |
| UX4 schema presence | Accept | Add DB-boundary protection before declaring integrity complete |
| P1E live field contract | Accept | Preserve fields and prove constraints/admin write model |
| Migration bootstrap | Reject | Clean deterministic build matches approved live contract |
| Seven exposed definer functions | Reject current broad EXECUTE | Minimum-role grants and regression tests pass |
| Logical-name aliases | Do not create | Code-to-live crosswalk is approved |
| P1 provenance migrations | Defer | P0 baseline and security decisions are frozen |
| CRM outbox/tokens | Defer to E3 scope | Product, privacy, retention, and delivery contracts approved |

## Recommended next authorized batch

Authorize DB1C as an evidence-and-design batch first, not a production mutation batch:

1. capture immutable live schema/apply-state evidence;
2. produce the canonical baseline decision record and clean-build proof plan;
3. inventory the seven `SECURITY DEFINER` definitions and dependencies;
4. inventory every direct `profiles` writer and protected column;
5. finish the refunds/returns/invoices/membership table-name crosswalk.

Only after those outputs are reviewed should DB1C migration authoring or privilege changes be separately authorized.

## Scope confirmation

This plan creates no migration and authorizes no SQL execution or deployment. It does not change application logic or `products.json`.
