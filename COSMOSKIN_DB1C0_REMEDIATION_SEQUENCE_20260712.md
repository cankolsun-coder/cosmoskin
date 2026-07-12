# COSMOSKIN DB1C-0 Remediation Sequence

Date: 2026-07-12  
Status: sequencing decision only; DB1C-1 through DB1C-6 have not started

## Governing rule

Baseline v1 captures the approved current live state. Every change required in current production must be a forward migration. A later baseline version may absorb verified final state for new databases, but baseline edits never substitute for production remediation.

## Sequence overview

| Order | Batch | Production-forward requirement | Baseline treatment | Blocking dependency |
|---:|---|---|---|---|
| 0 | DB1C-0 governance implementation | Repository lane/manifest changes only; no production DDL | Establish bootstrap baseline v1 | Complete read-only snapshot and approvals |
| 1 | DB1C-1 privileged function hardening | Yes | v1 captures current; v2 absorbs hardened grants/search paths | Exact signatures, bodies, owners, callers, triggers |
| 2 | DB1C-2 profile protection | Yes | v1 captures current; v2 absorbs protected boundary | Direct-writer inventory and UX4 contract |
| 3 | DB1C-4 manual/out-of-band provenance | Only verified deltas | Base objects belong in baseline v1 | Live exact definitions and naming crosswalk |
| 4 | DB1C-5 CRM/outbox/unsubscribe | Yes, new objects | Included only in later baseline after deployment | Approved E3, privacy, retention, retry contract |
| 5 | DB1C-6 commerce constraints | Yes, phased | Included in later baseline after validation | Data preflight, mapping, lock and rollback plan |

The numbering intentionally follows the user-specified future batches; DB1C-3 is not defined in this strategy and must not be invented implicitly.

## DB1C-0 governance implementation prerequisites

Before any later migration is authored:

- verified production backup/PITR evidence;
- complete schema, privilege, policy, function, Storage, cron, and ledger capture;
- canonical runtime naming map approved;
- legacy hashes recorded;
- dual-track repository layout approved and tested in an isolated branch;
- baseline production-exclusion guard proven;
- empty bootstrap passes;
- production normalized diff is understood;
- future 14-digit version convention enforced.

No current migration file is rewritten. Any archive move preserves bytes and Git history.

## DB1C-1 — SECURITY DEFINER, search path, owner, and EXECUTE

### Must be forward migrations

- revoke unintended `PUBLIC`, `anon`, or `authenticated` EXECUTE;
- grant only approved roles;
- harden search paths and schema qualification;
- change owner/security mode where approved;
- replace function bodies only when identity and dependency review requires it.

### Baseline effect

- v1 records exact current definitions for reproducibility;
- DB1C-1 forward migrations transform both production and v1-built environments;
- post-DB1C-1 baseline v2 includes the hardened final definitions.

### Stop conditions

- any unknown overload/caller/trigger;
- cross-user identity behavior not tested;
- service callback/inventory/loyalty/routine regressions;
- function owner or safe search path unresolved.

## DB1C-2 — Profile birthday and consent integrity

### Must be forward migrations

- server-only direct-write boundary, validated RPC, column privilege model, or protected-table split;
- birthday lock/counter/timestamp transition enforcement;
- protected consent/audit/admin field controls;
- minimum required policy/grant changes.

### Baseline effect

- v1 preserves current UX4-compatible schema and broad own UPDATE state;
- the forward migration applies the protection to all environments;
- v2 later incorporates the protected contract.

### Stop conditions

- any direct Supabase writer remains unidentified;
- safe name/phone/profile edits cannot be preserved;
- consent audit/source-of-truth mapping is ambiguous;
- rollback would expose or discard protected fields.

## DB1C-4 — Manual table provenance

### Baseline-only base provenance

The exact live bases for `user_favorites`, `notifications`, reviews/images/helpful, shipments, support requests, and approved Storage policies enter baseline v1.

### Forward migration only for differences

- missing constraints/indexes/FKs;
- policy/grant/owner corrections;
- moderation/storage alignment;
- canonical event/name reconciliation;
- safe deprecation metadata or compatibility view after proof.

Never issue a production `CREATE TABLE` merely because no legacy migration exists when the table is already live.

### Stop conditions

- incomplete live table definition or data-quality scan;
- unresolved duplicate/legacy table responsibility;
- Storage bucket/path/policy mismatch;
- compatibility view would bypass RLS.

## DB1C-5 — CRM logs and unsubscribe tokens

These objects are missing and therefore require new forward migrations after E3 approval.

Required design first:

- transactional event/outbox boundary;
- idempotency key and provider reference;
- attempts, retry/backoff, dead-letter/manual retry;
- payload redaction and retention;
- bank-transfer order CRM event coverage;
- birthday attribute synchronization ownership;
- hashed, scoped, expiring, single-use unsubscribe tokens;
- consent event linkage and replay protection;
- server-only grants and operational visibility.

Baseline v1 does not invent these objects. A later baseline includes them only after production deployment and verification.

## DB1C-6 — Commerce FK/check/snapshot/index invariants

Every integrity change is forward-only and data-preflight-driven:

- FKs for order children, payments, shipments, returns/refunds, coupons, legal rows, and events;
- non-negative and arithmetic constraints;
- inventory on-hand/reserved/backorder rules;
- paid pricing snapshot all-or-none and refund boundaries;
- provider/callback/idempotency uniqueness;
- coupon uniqueness/allocation/redemption rules;
- supporting FK/RLS/query indexes.

Use phased constraint validation/backfill patterns only after row counts, locks, query plans, and rollback are reviewed. A later baseline contains constraints in final validated form.

## Cross-batch dependencies

- DB1C-1 precedes CRM and commerce changes that introduce new privileged functions.
- DB1C-2 precedes any consolidation of profile/preference/consent sources.
- DB1C-4 naming reconciliation precedes refund/return/invoice/membership constraints.
- DB1C-5 must use the hardened server-only privilege model from DB1C-1.
- DB1C-6 cannot validate FKs until DB1C-4 maps/deprecates duplicate object models.
- Every batch requires baseline-plus-forward clean replay before staging.

## Release granularity

Prefer separate migration/release units for:

1. privilege-only changes;
2. additive structural changes;
3. data backfill/cleanup;
4. constraint addition and validation;
5. function replacement;
6. Storage policy/configuration;
7. destructive deprecation after observation period.

This keeps rollback and lock impact explicit. Do not bundle unrelated domains into another broad bridge migration.

## Completion definition

DB1C-0 ends with strategy documents only. DB1C-1 begins only after a separate instruction, pre-check, live read-only evidence refresh, and implementation authorization.
