# COSMOSKIN DB1C-1B1 Stop Conditions

Stop before deployment or further migration work if any condition below is true:

- DB1C-1A evidence commits are absent or modified unexpectedly;
- migration version `20260712232725` collides;
- any of the 21 exact signatures is missing;
- any target is no longer `SECURITY DEFINER`;
- a COSMOSKIN privileged overload appears;
- before-state ACL differs from the manifest;
- a browser/client or user-JWT RPC requiring authenticated execution is found;
- service-role retention is not approved for a target;
- any supplied owner or definition MD5 differs;
- any supplied trigger name, table, function attachment, enabled state, or definition differs;
- the full eight-function/nine-attachment trigger inventory differs between preflight and post-deploy, including either partially baselined auth-profile trigger;
- migration contains a name-only privilege statement;
- migration grants PUBLIC, anon, or authenticated execution;
- migration changes a function body, path, owner, definer status, schema, trigger, policy, RLS, table, or migration-history row;
- rollback does not exactly reconstruct the recorded before-state;
- preflight/post-deploy packs are not SELECT-only;
- backup, staging rehearsal, smoke tests, or human approval is missing.

If a stop condition occurs, do not partially edit or execute the migration. Preserve evidence, report the exact signature/object, and return to DB1C-1A/DB1C-1B1 review.
