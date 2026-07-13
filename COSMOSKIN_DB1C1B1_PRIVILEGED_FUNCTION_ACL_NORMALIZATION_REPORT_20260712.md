# COSMOSKIN DB1C-1B1 Privileged Function ACL Normalization Report

Date: 2026-07-12
Migration: `20260712232725_db1c1b1_privileged_function_acl_normalization.sql`
Status: created and statically validated; not executed or deployed.

## Outcome

The forward migration normalizes direct EXECUTE exposure for 21 exact public-schema `SECURITY DEFINER` signatures. It leaves 12 already-restricted signatures unchanged. No function source, path, owner, definer status, trigger, policy, schema, or application behavior is altered by DDL in this batch.

## Counts

| Measure | Count |
|---|---:|
| Live privileged identities in manifest | 33 |
| Actionable migration targets | 21 |
| No-change restricted functions | 12 |
| Confirmed backend RPC functions | 12 |
| Actionable backend RPC functions | 1 |
| Confirmed normal-trigger functions | 8 |
| Known normal-trigger attachments | 9 |
| Trigger functions with exact live owner/MD5/attachment baselines | 6 |
| Trigger attachments with exact live baselines | 7 |
| Trigger functions with partial/deferred exact attachment baselines | 2 |
| Confirmed internal helpers in manifest | 2 |
| Actionable trigger/internal functions | 9 |
| Orphan/legacy trigger candidates | 4 |
| PUBLIC revokes | 20 |
| anon revokes | 21 |
| authenticated revokes | 21 |
| Explicit service-role grants | 1 |
| Exact rollback restoration statements | 21 |

## Exact actionable signatures

1. `public.check_purchase(uuid, text)`
2. `public.cleanup_old_notifications(integer, integer, integer, integer)`
3. `public.cosmoskin_activity_offer_insert()`
4. `public.cosmoskin_activity_order_insert()`
5. `public.cosmoskin_activity_order_update()`
6. `public.cosmoskin_activity_points_insert()`
7. `public.cosmoskin_activity_routine_complete()`
8. `public.create_account_activity(uuid, text, text, text, text, text, jsonb)`
9. `public.get_review_summary(text)`
10. `public.handle_new_auth_user_profile()`
11. `public.handle_new_user()`
12. `public.handle_new_user_profile()`
13. `public.loyalty_ledger_recalculate_trigger()`
14. `public.recalculate_customer_membership(uuid)`
15. `public.recalculate_loyalty_account(uuid)`
16. `public.recalculate_routine_streak(uuid, date)`
17. `public.refresh_inventory_estimate(uuid)`
18. `public.reserve_product_inventory(text, integer)`
19. `public.rls_auto_enable()`
20. `public.routine_completion_recalculate_trigger()`
21. `public.sync_review_helpful_count()`

## Before and after ACL state

- Twenty targets currently receive PUBLIC execution and effective anon/authenticated execution. After migration, all three channels are closed.
- `cleanup_old_notifications(integer, integer, integer, integer)` currently has PUBLIC closed but direct anon/authenticated execution. The migration explicitly removes both direct grants and does not issue a noisy PUBLIC revoke.
- All 21 targets currently have service-role execution and retain it. Only `recalculate_customer_membership(uuid)`, the one exposed confirmed backend RPC, receives an explicit service-role grant; the other 20 preserve their existing grant by leaving it untouched.
- Twelve already-restricted functions are listed as `no_change_verified` and omitted from migration/rollback statements.

## Backend RPC safety

Twelve runtime RPC names were confirmed, all through the backend service-role helper. Eleven already have the approved restricted ACL and receive no change. `recalculate_customer_membership(uuid)` is the only exposed backend RPC target and is normalized to service-role-only execution.

No browser/client RPC or user-JWT path requiring authenticated EXECUTE was found.

## Trigger/internal safety

Eight confirmed normal-trigger functions are included, representing nine known normal-trigger attachments. Direct API EXECUTE is removed without recreating or altering functions or triggers. The migration preflight embeds exact owner/definition-MD5 baselines for six functions and exact baselines for seven attachments; `sync_review_helpful_count()` correctly accounts for two of those attachments.

The pre/post packs inventory all eight confirmed trigger functions. For the six fully baselined functions, post-deploy results can be checked directly against the embedded owner, MD5, trigger name/table, enabled state, and trigger-definition constants. For `handle_new_auth_user_profile()` and `handle_new_user_profile()`, the packs capture current and post-deploy catalog output for comparison, but retained evidence does not provide a complete exact owner/MD5/enabled-state baseline. Their exact attachment verification is therefore deferred and is not counted as fully baselined.

### Trigger reconciliation

| Exact signature | Trigger name | Target | Timing/event | Enabled state | ACL actionable | Manifest | Migration | Preflight | Post-deploy | Exact live baseline |
|---|---|---|---|---|---:|---:|---:|---:|---:|---|
| `public.cosmoskin_activity_order_insert()` | `cosmoskin_orders_activity_insert` | `public.orders` | AFTER INSERT | `origin` | yes | yes | yes | yes | yes | yes |
| `public.cosmoskin_activity_order_update()` | `cosmoskin_orders_activity_update` | `public.orders` | AFTER UPDATE | `origin` | yes | yes | yes | yes | yes | yes |
| `public.cosmoskin_activity_routine_complete()` | `cosmoskin_routine_completions_activity_insert` | `public.routine_completions` | AFTER INSERT | `origin` | yes | yes | yes | yes | yes | yes |
| `public.handle_new_auth_user_profile()` | `on_auth_user_created_profile` | `auth.users` | AFTER INSERT | not restated in retained evidence | yes | yes | yes | catalog inventory | catalog inventory | deferred: exact owner/MD5/enabled state not retained |
| `public.handle_new_user_profile()` | `on_auth_user_created_cosmoskin_profile` | `auth.users` | AFTER INSERT | not restated in retained evidence | yes | yes | yes | catalog inventory | catalog inventory | deferred: exact owner/MD5/enabled state not retained |
| `public.loyalty_ledger_recalculate_trigger()` | `recalculate_loyalty_after_ledger_change` | `public.loyalty_ledger` | AFTER INSERT OR DELETE OR UPDATE | `origin` | yes | yes | yes | yes | yes | yes |
| `public.routine_completion_recalculate_trigger()` | `recalculate_streak_after_routine_completion_change` | `public.routine_completions` | AFTER INSERT OR DELETE OR UPDATE | `origin` | yes | yes | yes | yes | yes | yes |
| `public.sync_review_helpful_count()` | `sync_review_helpful_count_insert` | `public.review_helpful` | AFTER INSERT | `origin` | yes | yes | yes | yes | yes | yes |
| `public.sync_review_helpful_count()` | `sync_review_helpful_count_delete` | `public.review_helpful` | AFTER DELETE | `origin` | yes | yes | yes | yes | yes | yes |

Count reconciliation:

- `trigger_function_count = 8`
- `trigger_attachment_count = 9`
- `trigger_functions_with_exact_live_baseline = 6`
- `trigger_attachments_with_exact_live_baseline = 7`
- two auth-profile trigger functions remain actionable ACL targets but have deferred exact attachment-baseline verification

## Supplied immutable baselines

Six trigger functions have exact embedded owner (`postgres`) and definition-MD5 values. Seven trigger attachments have exact name, table, function, `origin` enabled state, and definition baselines. The remaining two confirmed auth-profile trigger functions are included in the ACL manifest, migration, and pre/post catalog inventory, but their exact owner/MD5/enabled-state baseline is deferred. Their source and attachments are not changed by this migration.

## Mandatory high-risk coverage

The manifest and migration cover:

- `reserve_product_inventory(text, integer)`
- `cleanup_old_notifications(integer, integer, integer, integer)`
- `recalculate_customer_membership(uuid)`
- `recalculate_loyalty_account(uuid)`
- `recalculate_routine_streak(uuid, date)`
- `create_account_activity(uuid, text, text, text, text, text, jsonb)`
- `refresh_inventory_estimate(uuid)`
- `check_purchase(uuid, text)`
- `get_review_summary(text)`

## Rollback mapping

The review-only rollback is generated from the recorded before-state: restore PUBLIC on the 20 formerly PUBLIC-exposed functions; restore direct anon/authenticated execution only on `cleanup_old_notifications`; do not touch service role or the 12 no-change functions.

## Staging smoke plan

- backend inventory, loyalty, membership, and payment RPC permission checks;
- order insert and update activity events;
- routine-completion activity and streak recalculation;
- loyalty-ledger insert/update/delete recalculation;
- review-helpful insert/delete synchronization;
- new-auth-user profile creation;
- negative anonymous/authenticated RPC invocation checks for all 21 targets.

No smoke test was run against production in this batch.

## Manual production approval

Deployment requires saved preflight results, zero missing/overloaded/drifted targets, staging success, reviewed rollback, backup confirmation, database/security/application-owner sign-off, and explicit production authorization.

## Deferred

- DB1C-1B2 trigger/orphan refinements.
- DB1C-1B3 source qualification and search-path hardening, including `check_purchase` and `get_review_summary`.
- Any function, owner, trigger, policy, schema, RLS, or migration-history change.
