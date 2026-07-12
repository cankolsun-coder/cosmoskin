# COSMOSKIN DB1B Production Schema Risk Register

Date: 2026-07-12  
Evidence basis: DB1 repository audit plus operator-supplied live read-only results  
Status: open risk register; no remediation performed

## Rating model

- **P0:** security, data integrity, recovery, or release safety can fail materially; resolve or explicitly accept before related production database work.
- **P1:** feature, audit, integration, or rebuild degradation risk; address after P0 controls are frozen.
- **P2:** documentation, observability, or cleanup risk without a current material failure signal.

Likelihood and impact are qualitative because raw catalog output, traffic data, row counts, and exploit testing were not included in the supplied result summary.

## Open risks

| ID | Priority | Risk | Evidence | Impact | Likelihood | Current control | DB1C treatment | Exit criterion | Owner | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| DB1B-R01 | P0 | Production cannot be reliably rebuilt from migration apply-state | Ledger reports only `20260418 guest_checkout` and `20260510 newsletter_subscribers`; many later objects exist live | Failed recovery/staging bootstrap, unsafe future migrations, audit gap | High | Repository SQL and live DB exist, but are not reconciled | Establish canonical baseline/apply-state strategy first | Clean isolated build matches approved live schema; production history remains truthful | DB/platform | Open |
| DB1B-R02 | P0 | Privileged function execution is exposed too broadly | Seven `SECURITY DEFINER` functions executable by `anon` and `authenticated` | RLS bypass, cross-user recalculation, unauthorized side effects | Medium–High pending body review | Function-level logic may check identity, but not yet proven | Inventory bodies/signatures/dependencies; revoke broad EXECUTE unless justified | Anonymous denied; authenticated limited to documented identity-safe RPCs; regressions pass | DB/security | Open |
| DB1B-R03 | P0 | Direct profile UPDATE can bypass UX4 birthday and consent integrity | Own UPDATE policies exist; protected transitions are application-enforced | Forged birthday lock/counters/timestamps, consent drift, audit loss | Medium | Cloudflare application path preserves rules | Choose server-only writes, safe RPC, column grants, or table split | Direct adversarial writes cannot change protected fields; UX4 still passes | DB/account | Open |
| DB1B-R04 | P0 | Naming drift can cause a duplicate or wrong-source remediation | Generic names absent while live alternatives exist for addresses, membership, invoices, refunds, returns | Split-brain writes, incorrect refunds/points, data loss during migration | Medium | Runtime currently uses some alternative names | Complete code/live/dependency crosswalk before DDL | One canonical object per responsibility; no unresolved dual writer | Architecture/commerce | Open |
| DB1B-R05 | P1 | `support_requests` cannot be reproduced canonically | Exists live with no clear migration provenance | Support create/list failure on new environment; PII policy drift | High for rebuild | Live table presently serves feature | Capture exact live contract and add reconciled provenance after baseline | Clean build and A/B-user policy tests reproduce live contract | DB/support | Open |
| DB1B-R06 | P1 | `shipments` base contract is out-of-band | Exists live; migrations alter but do not clearly create base | Bootstrap failure, orphan events, tracking/provider drift | High for rebuild | Live table exists | Reconcile base, FKs, statuses, provider idempotency, event ownership | Canonical schema and tracking/account/admin tests pass | DB/operations | Open |
| DB1B-R07 | P1 | Reviews and image moderation/storage cannot be reproduced canonically | `reviews`, `review_images`, `review_helpful` exist live with root/manual provenance | Pending content exposure, upload ownership gaps, rebuild failure | Medium | Live policies/storage exist in some form | Reconcile tables, triggers, policies, grants, bucket/path rules | Public/owner/admin/storage role tests pass on clean build | DB/content | Open |
| DB1B-R08 | P1 | `notifications` is outside the expected verification pack | Object appears in policies/grants but was not in DB1 expected-table pack | Unreviewed user-content exposure or rebuild omission | Medium | Some live policies/grants exist | Inventory table, columns, writers, policies, grants, indexes, provenance | Access model and canonical migration status documented/tested | DB/account | Open |
| DB1B-R09 | P1 | CRM provider delivery lacks a durable outbox/sync ledger | CRM outbox/sync table reported missing | Lost/duplicated syncs, weak retry/audit visibility for E3 | High once E3 automation starts | `crm_events` provides event foundation | Design idempotent outbox/log only with approved E3 scope | Retry, dead-letter, idempotency, retention, and bank-transfer sync tested | CRM/platform | Deferred to E3 |
| DB1B-R10 | P1 | Tokenized unsubscribe workflow lacks a database contract | Unsubscribe token table reported missing | Weak preference-center audit/replay controls | Medium once token links are used | Existing consent/newsletter records may cover direct updates | Design hashed, scoped, expiring, single-use tokens | Replay/privacy tests and consent linkage pass | CRM/privacy | Deferred to E3 |
| DB1B-R11 | P1 | Commerce FKs/checks/snapshot invariants remain incompletely proven | Live presence/RLS does not prove child FKs, arithmetic checks, idempotency, or D3/refund invariants | Orphans, over-refund, negative/inconsistent totals, duplicate callbacks | Unknown | Application validation and some migrations | Run preflight evidence, then design phased constraints/indexes | Zero unexplained violations; commerce regression and lock plan approved | DB/commerce | Open |
| DB1B-R12 | P1 | RLS enabled may be mistaken for complete authorization | Nine P0 tables lack supplied full policy/grant/adversarial results | Inaccessible feature or unintended row/column exposure | Unknown | RLS flag enabled | Capture policies, table/column/function grants and role tests together | Explicit access model and A/B-user/anon tests for every exposed object | DB/security | Open |
| DB1B-R13 | P1 | P1E audit/admin controls are not fully proven by field presence | Required live fields observed, but constraint, grant, index, and audit immutability detail is incomplete | Price window inconsistency or unauthorized mutation/audit gaps | Low–Medium | Server/admin application paths and RLS enabled | Verify exact constraints, admin-only writes, audit inserts, slug indexes | Negative/window tests and unauthorized role tests pass | DB/pricing | Open |
| DB1B-R14 | P1 | Notification preference ownership and constraints are incompletely evidenced | Required fields and RLS observed; full policies/grants/unique/FK not in supplied summary | Cross-user preference drift or duplicate preference rows | Low–Medium | UX4 application behavior and RLS enabled | Capture unique/FK/policies/grants and test omitted-field preservation | One row per user; own access only; UX4 persistence tests pass | DB/account | Open |
| DB1B-R15 | P2 | Raw DB1B evidence retention is not defined | Findings were summarized from manual SQL Editor execution | Future reviewers cannot reproduce the exact observation set | Medium | This report records conclusions | Store redacted query outputs, timestamp, project identifier, and reviewer in approved restricted evidence location | Evidence package is immutable, access-controlled, and linked to DB1B | Release assurance | Open |

## Accepted positive controls

These are findings, not risk closures for unrelated controls:

- The ten P0 tables in the live verification set exist and have RLS enabled.
- `user_favorites` has the expected composite unique key and own SELECT/INSERT/DELETE/UPDATE policies; E1 is ready in the current live environment.
- UX4-required profile and notification-preference fields exist.
- P1E override and audit sale/compare-at fields exist.

## Risk dependencies

- R01 blocks safe provenance migrations for R05–R08.
- R02 must be reviewed before changing membership, loyalty, routine, or order-activity objects.
- R03 must be resolved before declaring UX4 integrity complete.
- R04 blocks any attempt to add generic refund/return/invoice/membership/address tables.
- R11 depends on the canonical crosswalk from R04 and the baseline decision from R01.
- R09 and R10 remain deferred until E3 behavior, privacy, retention, and provider contracts are approved.

## Release safety gates

### Gate A — before any DB1C migration is drafted

- R01 evidence capture is complete;
- exact live object definitions are available;
- R04 crosswalk has no unresolved writer ambiguity;
- production replay is explicitly prohibited.

### Gate B — before privilege/policy changes

- exact grants and function overloads are captured;
- required callers and trigger dependencies are known;
- anonymous/user A/user B/service test cases and rollback grants are written.

### Gate C — before production application

- isolated clean-build/schema-diff proof passes;
- preflight data checks have no unexplained violations;
- lock/runtime impact and rollback are approved;
- checkout, bank transfer, pricing, coupon, inventory, account, returns/refunds, membership, reviews, and support regressions are selected in proportion to the batch.

## Scope confirmation

This register records risk only. No SQL was executed, no deployment occurred, no migration or application code was changed, and `products.json` was not modified.
