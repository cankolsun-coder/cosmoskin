# COSMOSKIN DB1C-1A Design for DB1C-1B

Date: 2026-07-12  
Status: migration design only. No migration SQL exists in this batch.

## Recommendation

Choose Option 2: multiple forward migrations separated by risk and behavior. An all-functions migration would combine ACL correction, trigger risk, source replacement, and resolution changes into one rollback boundary.

## Proposed migration lanes

### Lane 1 — confirmed service RPC privilege normalization

Targets are exact live signatures for the 12 repository service RPC names. The migration should remove implicit/broad execution first, then retain execution only for service role. It must not replace function bodies or change owners.

Preconditions:

- exact signatures and overload counts captured;
- live source and owner captured for rollback;
- repository service call evidence confirmed;
- no authenticated-user or external consumer discovered;
- staging call succeeds with service role and fails for disallowed API roles.

### Lane 2 — proven trigger/internal API exposure removal

Targets include the two auth profile trigger handlers, `cosmoskin_order_points_basis(uuid)`, and any live-only function proven trigger/internal by catalog evidence. Remove API-role execution per exact signature without replacing triggers or function bodies.

Preconditions:

- trigger name, target table, timing/event, enabled state, and exact function identity captured;
- nested function calls captured;
- direct API RPC is proven unnecessary;
- auth-user, order activity, loyalty ledger, and routine completion smoke tests are available as applicable.

### Lane 3 — search-path and source hardening

Use a separate migration because safe path changes may require a reviewed body replacement with schema-qualified references. Group by domain when payment, inventory, auth, loyalty, or routine rollback impacts differ.

Preconditions:

- exact live definition matches a reviewed candidate or has been independently reviewed;
- all resolution targets are known;
- dynamic SQL is safe or absent;
- staging proves direct, trigger, scheduled, and nested behavior;
- exact prior definition and configuration are archived.

### Lane 4 — intentionally exposed authenticated RPCs

No function currently qualifies. If live/external evidence proves a user-token contract, isolate it in its own migration. Retained authenticated execution requires internal authentication, ownership validation, bounded identifiers, input validation, and negative cross-user tests. Anonymous execution requires an even stronger explicit product contract and abuse controls.

## Migration mechanics

- Use a collision-free 14-digit UTC version for each lane.
- Keep the baseline/bootstrap lane separate; these are production-forward migrations.
- Never touch `supabase_migrations.schema_migrations`.
- Target every function using schema, name, and identity argument types.
- Treat an unexpectedly absent signature as a preflight failure, not a no-op.
- Resolve overloads before authoring; no name-only operation is allowed.
- Preserve trigger bindings and service RPC routes.
- Do not combine owner/schema moves with the first hardening migration.
- Record an explicit reason for every retained anon or authenticated privilege; current evidence justifies none.
- Require manual production approval after a staging rehearsal and reviewed diff.

## Preflight evidence pack

The DB1C-1A live query pack must be saved with timestamp/project identity and reviewed for:

- exact identities and overloads;
- definition checksums and sources;
- owners and role attributes;
- explicit paths and unsafe reference flags;
- raw/default/effective ACLs;
- trigger and function dependencies;
- optional scheduler references;
- differences from repository definitions.

## Post-deploy verification design

Re-run the identity, owner/config, ACL, definition-checksum, trigger, and API-exposure queries. Verify:

- expected roles succeed and disallowed roles fail;
- function definitions are unchanged in ACL-only lanes;
- owners are unchanged;
- trigger definitions/enabled states are unchanged;
- service endpoints and scheduled operations work;
- no cross-user mutation is possible;
- logs show no PostgREST permission or missing-function regression.

## Rollback design

Use a separate, manually approved rollback artifact per migration lane. It must restore the exact captured pre-change ACL and, for lane 3 only, the exact prior definition/configuration. Rollback must target exact signatures and must not touch migration history. If production source cannot be restored exactly, the lane is not deployable.

## Manual approval gates

1. Security review of function source and identity controls.
2. Application-owner confirmation of all direct/external call paths.
3. Database-owner confirmation of triggers, scheduler, and ownership.
4. Staging evidence and rollback rehearsal.
5. Production backup/snapshot confirmation.
6. Explicit production execution approval.

## Hard stop list

Unknown signature/overload, owner, source, external caller, trigger or scheduler dependency, retained role, dynamic SQL safety, path resolution, behavior-preserving rollback, or production/repository definition equivalence.

