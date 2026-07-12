# COSMOSKIN DB1B Live Supabase Verification Results Report

Date: 2026-07-12  
Baseline: `2b6ed8d` — DB1 audit Supabase schema provenance and RLS gaps  
Mode: documentation of operator-supplied, manually executed read-only Supabase SQL Editor results  
Out of scope: SQL execution, deployment, migration creation/application, remediation, application changes, and `products.json`

## Executive conclusion

The live production database contains the P0 commerce, pricing, account, preferences, and favorites tables checked in DB1B, and RLS was reported enabled on all ten tables in the P0 verification set. E1 favorites has the strongest live readiness result: the table, composite uniqueness, RLS, and own-row CRUD policy set were all observed. P1E pricing fields and UX4 profile/preference fields were also observed live.

The highest release-safety risk is not immediate table absence; it is the inability to reproduce the live database from recorded migration apply-state. `supabase_migrations.schema_migrations` reportedly contains only `20260418 guest_checkout` and `20260510 newsletter_subscribers`, while production contains many later objects, indexes, and policies. The current repository-plus-ledger evidence therefore does not prove a deterministic empty-database bootstrap.

Two security issues require P0 DB1C design before remediation:

- seven `SECURITY DEFINER` functions are executable by `anon` and `authenticated`;
- direct own-row `profiles` UPDATE policies may permit authenticated users to bypass UX4 birthday locking and consent-preservation rules that currently live in application code.

“Exists and safe” in this report means the specifically reported checks passed. It does not mean every policy expression, grant, foreign key, check constraint, function body, data-quality invariant, or adversarial role test has been independently proven.

## Evidence boundary

The live checks were executed manually by the operator in the Supabase SQL Editor before this task. This task did not connect to Supabase or execute SQL. The findings below are a structured record of the supplied results, not an independent replay of the queries.

Evidence classifications used here:

- **Live verified:** explicitly present in the supplied DB1B results.
- **Live observed, control incomplete:** existence or RLS was observed, but full grants/policy expressions/invariants were not supplied.
- **Provenance unclear:** live object exists, but the repository migration chain does not clearly create its base object.
- **Missing:** reported absent from the expected live object set.
- **Mapping decision required:** a requested logical name is absent while a differently named live object may implement the capability.

Supabase treats table privileges and RLS policies as separate authorization layers; both must be intentional. `SECURITY DEFINER` functions must also have explicit EXECUTE and identity decisions because functions are executable by roles with grants even when underlying table RLS would otherwise restrict rows. References: [Securing your API](https://supabase.com/docs/guides/api/securing-your-api) and [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## What was verified live

### P0 table and RLS presence

The following tables were reported present with RLS enabled:

| Table | Domain | Live result | Residual verification boundary |
|---|---|---|---|
| `profiles` | account | Exists; RLS enabled | Own UPDATE is too broad for protected UX4 fields until DB-level controls are designed |
| `notification_preferences` | preferences | Exists; RLS enabled | Exact policy expressions, grants, unique/FK state, and role tests remain to be captured |
| `user_favorites` | favorites | Exists; RLS enabled | Composite uniqueness and own policies were also verified; see E1 status |
| `orders` | orders | Exists; RLS enabled | Own/admin policy semantics and commerce invariants remain to be proven |
| `order_items` | orders | Exists; RLS enabled | Order-derived ownership, FKs, snapshot constraints, and indexes remain to be proven |
| `payments` | payments | Exists; RLS enabled | Customer exposure, provider fields, FKs, amount/idempotency checks remain to be proven |
| `product_inventory` | inventory | Exists; RLS enabled | Admin-only writes, non-negative checks, uniqueness, and available-stock behavior remain to be proven |
| `product_price_overrides` | pricing | Exists; RLS enabled | Explicit API grants/admin-only mutation model and check expressions remain to be proven |
| `coupons` | coupons | Exists; RLS enabled | Code uniqueness, public-read shape, admin mutation, and validity checks remain to be proven |
| `coupon_redemptions` | coupon usage | Exists; RLS enabled | User/order/coupon uniqueness and reservation/redemption invariants remain to be proven |

## What exists and is safe within the verified boundary

The current live schema supports the specifically observed E1, UX4, and P1E contracts below. This is a bounded release-readiness statement, not a blanket certification of every grant, policy expression, constraint, or future bootstrap path.

### E1 favorites / wishlist

`user_favorites` is live-ready for E1 based on the supplied evidence:

- table exists;
- RLS is enabled;
- unique `(user_id, product_slug)` exists;
- own SELECT, INSERT, DELETE, and UPDATE policies exist.

Decision: **E1 database contract is ready in the current live environment.** Its remaining risk is migration provenance and rebuild reproducibility, not the observed production table contract. A future canonical baseline must capture the exact live constraint, policies, grants, indexes, defaults, and FKs without recreating or disturbing production data.

### UX4 profile and notification preferences

Live `profiles` includes the reported UX4 fields:

- `birthday`;
- `birth_date_locked`;
- `birthday_change_count`;
- `birthday_last_changed_at`;
- `metadata`.

Live `notification_preferences` includes campaign, newsletter, stock, SMS, order, and cargo-related fields.

Decision: **UX4 schema presence is ready; UX4 database integrity is conditional.** The current application-level behavior can operate against the live schema, but direct authenticated profile UPDATE may bypass birthday correction limits, lock state, counters, timestamps, or consent-preservation behavior. DB1C must decide whether writes become server-only, use a validated RPC, use column-level privileges, or split protected fields. Until that decision is implemented and adversarially tested, UX4 has a P0 defense-in-depth gap.

### P1E pricing

Live `product_price_overrides` includes regular, sale, compare-at, and sale-window fields. Live `product_price_audit_logs` includes sale and compare-at audit fields.

Decision: **P1E production schema is ready for the currently verified field contract.** Rebuild/apply-state provenance is not ready, and the live check summary does not fully prove check constraints, admin-only mutation, audit immutability, all grants/policies, or indexes. Those remain DB1C acceptance checks.

## What exists but has provenance risk

| Object | Live observation | Repository provenance concern | Risk |
|---|---|---|---|
| `support_requests` | Exists live | No clear canonical migration provenance | P1 rebuild/support continuity risk |
| `shipments` | Exists live | Later migrations alter it, but no clear base `CREATE TABLE` provenance | P1 bootstrap and event-model drift risk |
| `reviews` | Exists live | Base schema is root/manual SQL; migrations provide later patches | P1 bootstrap/moderation policy risk |
| `review_images` | Exists live | Base table/storage contract is root/manual SQL | P1 image ownership/moderation/storage drift risk |
| `review_helpful` | Exists live | Root/manual provenance | P1 uniqueness and own-write policy drift risk |
| `notifications` | Appears in policies/grants | Not included in the DB1 expected-table verification pack and lacks a canonical migration base | P1 inventory and policy provenance risk |

These objects must be captured from the live catalog before any migration is authored. DB1C must reconcile types, defaults, constraints, indexes, triggers, policies, grants, owners, comments, and data quality; it must not create a guessed duplicate table.

## What is missing or requires a naming decision

### Missing capability objects

- CRM/Brevo delivery outbox or sync-log table: missing.
- Email unsubscribe token table: missing.

These gaps do not invalidate the existing `crm_events` or newsletter functionality. They are needed for a reliable E3 Brevo delivery ledger, bank-transfer order sync evidence, birthday-attribute sync evidence, retry/dead-letter observability, idempotency, and tokenized unsubscribe/preference-center workflow when that scope is approved.

### Logical-to-live naming drift

| Expected/logical name | Live alternative(s) | Required decision |
|---|---|---|
| `customer_addresses` | `addresses`, `user_addresses` | Confirm exact runtime and canonical ownership; do not add a third address table |
| `customer_memberships` | `customer_membership_status`, `customer_membership_history`, `loyalty_accounts` | Confirm which table is current state, history, and financial balance; preserve Essential/Signature/Elite vocabulary |
| `invoices` | `invoice_records` | Confirm all code, FK, and policy paths use `invoice_records` |
| `refunds` | `refund_records` | Confirm refund state and paid-snapshot source; define line-item relationship without creating an alias table |
| `returns` | `return_requests`, `return_items` | Confirm request/header versus line-item mapping and reconcile any `return_request_items` naming in code/migrations |

Absence of the logical names is not itself a defect. Creating alias or duplicate tables before the crosswalk is proven would increase consistency and data-loss risk.

## RLS, policy, and privilege findings

Positive evidence:

- RLS was reported enabled on all ten P0 tables in the live verification set.
- `user_favorites` has own SELECT/INSERT/DELETE/UPDATE policies and composite uniqueness.

Unresolved evidence:

- For the other nine P0 tables, the summary proves RLS state but not every policy role, command, `USING`, `WITH CHECK`, table grant, column grant, or adversarial A/B-user result.
- Server-only commerce tables may be safer with direct `anon`/`authenticated` grants revoked even when RLS exists.
- Child objects such as `order_items` must derive ownership safely through `orders`; email matching or unindexed policy subqueries are not acceptable substitutes for authenticated ownership.
- Customer-readable payment/shipment projections must not expose provider secrets, raw callbacks, bank account details, or internal payloads.
- Profile UPDATE policy coverage is an integrity risk even if cross-user isolation is correct.
- `notifications` needs explicit inventory because it appeared in policies/grants outside the expected pack.

DB1C should capture grants and policies together. An enabled RLS flag without an intentional grant/policy access model is incomplete evidence.

## SECURITY DEFINER finding

The following functions were reported as `SECURITY DEFINER` and executable by both `anon` and `authenticated`:

1. `recalculate_customer_membership`
2. `recalculate_loyalty_account`
3. `recalculate_routine_streak`
4. `cosmoskin_activity_order_insert`
5. `cosmoskin_activity_order_update`
6. `loyalty_ledger_recalculate_trigger`
7. `routine_completion_recalculate_trigger`

Risk: a caller may execute the function with owner privileges and bypass normal table-level authorization, depending on the function body, parameters, search path, and identity checks. Trigger-oriented helpers being callable as RPCs is especially unnecessary unless explicitly designed and defended. This finding establishes exposure, not confirmed exploitability.

DB1C P0 acceptance requires, for every overload/signature:

- record owner, language, volatility, `prosecdef`, `proconfig`/`search_path`, argument types, return type, and complete body;
- identify whether it is trigger-only, internal, service-role-only, or an intentional user RPC;
- revoke `PUBLIC`, `anon`, and `authenticated` EXECUTE unless a documented user-call contract requires it;
- if a user RPC remains, bind authorization to `auth.uid()` and reject caller-selected ownership outside that identity;
- use a fixed safe `search_path` and schema-qualified object references;
- grant only the minimum role and verify required triggers/server flows still work;
- test direct anonymous and cross-user calls before production approval.

## Migration apply-state finding

The live migration ledger reportedly contains only:

- `20260418 guest_checkout`;
- `20260510 newsletter_subscribers`.

Production contains many more live tables, indexes, functions, and policies than these two ledger entries prove. This creates four distinct risks:

1. **Bootstrap risk:** a new database cannot be assumed to reproduce production from `supabase/migrations/`.
2. **Drift risk:** the exact live definition may differ from the repository SQL that appears to describe it.
3. **Future migration risk:** a migration can fail or apply a wrong branch because its assumed predecessor is not recorded.
4. **Recovery/audit risk:** incident recovery and reviewer approval cannot rely on apply-state alone.

Decision: **migration baseline/apply-state strategy is the first DB1C P0 item.** Do not retroactively mark migrations applied, replay the repository chain in production, or create a synthetic baseline until a live schema capture and object-by-object reconciliation are complete. The chosen approach must support a clean environment build and preserve immutable production history.

## Readiness decisions

| System | Decision | Basis | Residual risk |
|---|---|---|---|
| E1 favorites | **Ready in live production** | Table, RLS, composite unique, and own CRUD policies observed | Canonical migration/baseline provenance |
| UX4 profile/preferences | **Conditionally ready** | Required profile and preference fields exist; RLS enabled | Direct profile UPDATE can bypass DB-level birthday/consent integrity |
| P1E pricing | **Schema ready in live production** | Override and audit sale/compare-at fields observed | Apply-state, constraints, grants/admin-only writes, audit integrity |
| Empty DB bootstrap | **Not ready** | Ledger proves only two migrations while live schema is much richer | Highest DB1B release-safety risk |

## Recommended DB1C remediation order

### P0 — before provenance-sensitive database work

1. Establish the migration baseline/apply-state strategy from a complete live catalog and schema capture.
2. Harden EXECUTE access for the seven exposed `SECURITY DEFINER` functions after body/signature/dependency review.
3. Protect UX4 birthday, consent, lock, counter, audit, and account-control fields at the database access boundary.
4. Confirm exact code-to-live table mapping for refunds, returns, invoices, and membership/loyalty before adding or renaming objects.

### P1 — after P0 decisions are frozen

5. Create canonical, reconciled provenance for `support_requests`, `shipments`, `reviews`, `review_images`, `review_helpful`, and `notifications`.
6. Design CRM delivery logs/outbox and unsubscribe-token objects only for an approved E3 contract.
7. Verify and then harden commerce foreign keys, non-negative/arithmetic checks, idempotency, paid-price snapshots, coupon allocation, and supporting indexes.

The detailed sequencing and acceptance gates are in `COSMOSKIN_DB1B_REMEDIATION_DECISION_PLAN_20260712.md`; tracked risks are in `COSMOSKIN_DB1B_PRODUCTION_SCHEMA_RISK_REGISTER_20260712.md`.

## Scope confirmation

This DB1B documentation task did not execute SQL, connect to Supabase, deploy, create or alter migrations, modify application code, or modify `products.json`.
