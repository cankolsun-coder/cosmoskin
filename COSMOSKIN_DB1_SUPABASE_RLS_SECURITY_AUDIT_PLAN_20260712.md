# COSMOSKIN DB1 Supabase RLS / Security Audit Plan

Date: 2026-07-12
Status: plan only; not executed

## Objective

Prove, for every COSMOSKIN database object exposed through Supabase, both layers of authorization:

1. Postgres grants decide whether `anon`, `authenticated`, and `service_role` can reach the object.
2. RLS policies decide which rows an allowed role can read or mutate.

RLS is not a substitute for grants, and grants are not a substitute for RLS. Tables kept in `public` for server-only use should have RLS enabled and direct `anon`/`authenticated` privileges revoked, or be moved to a non-exposed schema in a later approved design.

References:

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [2026 Data API exposure change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

## Audit principles

- Run catalog queries first; do not infer live state from migration files.
- Use a read-only reviewer role for catalog/data checks when possible.
- Never expose or paste service-role keys into browser tools, reports, or query output.
- Test authorization with dedicated test users in a non-production branch/project before any production policy change.
- Do not use `raw_user_meta_data`/`user_metadata` for authorization.
- Treat every `SECURITY DEFINER` function in an exposed schema as an API endpoint until explicit grants prove otherwise.
- UPDATE policies require SELECT visibility plus `USING` and `WITH CHECK`.
- Views must be `security_invoker=true` on supported Postgres versions or unavailable to API roles.

## Phase 1 — Inventory exposure and grants

Use Sections 1, 4, 5, and 15 of the prepared SQL file.

Capture for each public table/view/function:

- existence and relation kind;
- owner;
- RLS enabled/forced;
- `anon`, `authenticated`, `service_role`, and PUBLIC grants;
- policies and roles;
- function `SECURITY DEFINER` state, `search_path`, and EXECUTE privilege;
- view `security_invoker` option;
- Data API exposed schemas and project setting from Dashboard.

Fail conditions:

- any user/PII/admin/provider table in an exposed schema with RLS disabled;
- any server-only table directly granted to `anon` or `authenticated`;
- a required client table with correct RLS but missing required table privileges;
- any public `SECURITY DEFINER` function executable by PUBLIC/anon/authenticated without a documented, identity-safe design;
- an API-accessible view that bypasses underlying RLS.

## Phase 2 — Table access model

### User-owned direct-access candidates

These may have own-row policies if direct Supabase client access is an intentional contract:

- `profiles`;
- `user_addresses`;
- `user_favorites`;
- `notification_preferences`;
- `notifications`;
- `customer_skin_profiles`;
- `customer_routine_results`;
- membership/ledger own reads;
- reviews/review images/helpful;
- support requests.

Current application code normally reaches these through Cloudflare Functions using the service role. Therefore direct Data API access is optional, not automatically required. For each table, record one explicit decision:

- **server-only:** revoke `anon`/`authenticated`, retain RLS defense, no user policy needed;
- **direct client:** grant only required verbs and implement tested own-row policies;
- **public read projection:** expose a safe table/view/API shape with no PII.

### Server-only tables

Expected server-only unless a separate approved contract exists:

- orders/payment writes and raw provider payloads;
- inventory and reservations;
- price overrides/audits;
- coupons/redemptions/customer coupon writes;
- consent/legal audit writes;
- CRM/newsletter data;
- returns/refunds writes;
- shipment/provider objects;
- admin RBAC/activity logs;
- loyalty ledger writes and privileged RPCs.

## Phase 3 — Role-by-role test cases

Use two real test users, A and B, with distinct data. Use an anonymous request, authenticated user A, authenticated user B, and server/admin paths. Do not use production customer records for adversarial tests.

### Common own-row contract

For each own-row table:

| Actor/action | Expected |
|---|---|
| anon SELECT/INSERT/UPDATE/DELETE | denied unless explicitly public read |
| user A SELECT own | allowed when direct access is intended |
| user A SELECT user B | zero rows/denied |
| user A INSERT with A owner id | allowed if user insert is intended |
| user A INSERT with B owner id | denied by `WITH CHECK` |
| user A UPDATE own non-protected field | allowed if intended |
| user A changes owner id to B | denied by `WITH CHECK` |
| user A UPDATE user B row | zero rows/denied |
| user A DELETE own | allowed only where product contract requires delete |
| user A DELETE user B | zero rows/denied |

### Profiles / UX4

Test both API behavior and direct Data API behavior.

Required results:

- user A cannot read or change user B profile;
- ordinary name/phone changes follow the chosen access model;
- direct client writes cannot reset `birthday_change_count`, clear `birth_date_locked`, forge `birthday_last_changed_at`, or bypass the one-correction rule;
- direct client writes cannot silently change consent/audit flags if server APIs are the authoritative consent path;
- fraud/account status fields are not user-writable;
- profile UPDATE has corresponding SELECT policy.

If direct profile update remains enabled, use column privileges, a safe RPC, or table decomposition in a future migration; RLS alone cannot restrict individual columns.

### Favorites

Required verbs: own SELECT/INSERT/DELETE; UPDATE is used by current server code but direct client UPDATE is optional.

Verify:

- `(user_id,product_slug)` uniqueness handles races;
- cross-user read/delete/update fails;
- a user cannot change a favorite row's `user_id`;
- direct insert is not possible without the matching authenticated `user_id`;
- product display snapshot fields cannot be used as authoritative price data.

### Notification preferences and notifications

- preferences: own SELECT/INSERT/UPDATE with immutable owner;
- notifications: own SELECT/UPDATE for read state only; creation should be server-only;
- direct UPDATE must not permit changing notification ownership/content if only `is_read/read_at` should be mutable;
- absence of DELETE is intentional and tested.

### Orders / items / payments / shipments

If server-only, verify all authenticated direct access is revoked. If own read is retained:

- orders: own SELECT only;
- order items/payments/shipments/events: own SELECT through an indexed order ownership relation;
- no customer direct INSERT/UPDATE/DELETE;
- guest orders do not become visible through email matching in RLS;
- provider tokens/raw payloads are not included in any customer-readable projection.

### Reviews / images / helpful

- public can read only approved reviews/images;
- owner can see own pending review if this is a product requirement;
- authenticated insert requires own `user_id` and verified purchase is set only by server logic;
- users cannot self-approve or set moderation actor/time;
- update returns review to pending as server code expects;
- image insert/delete is limited to parent-review owner;
- helpful insert/delete is own and unique; broad `FOR ALL` is replaced or proven safe;
- hard-coded admin email policies are absent from the canonical live policy set.

### Support / returns

- user A sees/inserts only A's `support_requests`;
- status, assignee, resolution, and admin notes are server/admin writable only;
- returns child tables inherit ownership through `return_requests` or are server-only;
- attachment table rows and storage objects enforce the same owner;
- customer cannot update refund amounts, status events, or moderation/admin notes.

## Phase 4 — Storage RLS

### `review-images`

Verify bucket:

- id/name `review-images`;
- intended public/private state matches API URL strategy;
- 2 MiB limit;
- JPEG/PNG/WebP only;
- path format begins with authenticated user UUID;
- INSERT and DELETE check path ownership;
- SELECT exposes only intended public objects;
- no broad `bucket_id = 'review-images' AND TRUE` policy.

Table moderation and a public bucket are separate controls: an object can be public even when its `review_images` row is pending. Confirm the application does not publish the object URL before approval, or choose a private-bucket/signed-URL design in a later scope.

### `return-attachments`

Verify bucket remains private and policies from H1 enforce:

- first folder `customer`;
- second folder equals `auth.uid()`;
- own INSERT/SELECT/DELETE only;
- no UPDATE/upsert path unless explicitly required;
- service-role admin signing works independently of user policies.

## Phase 5 — RPC/function audit

Mandatory function inventory:

- inventory: reserve/release/convert/release-expired;
- payments: process iyzico success/failure;
- loyalty: basis/award/promote/promote-due/reverse/balance/recalculate;
- review helpers: purchase check/summary if present;
- auth profile trigger functions.

For each function verify:

- exact signature expected by code;
- `SECURITY DEFINER` only where required;
- fixed safe `search_path`;
- explicit `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` for server-only functions;
- explicit `GRANT EXECUTE TO service_role`;
- no user-controlled target UUID unless the function verifies it against `auth.uid()`;
- advisory lock/idempotency for payment/inventory/loyalty mutation functions;
- return value does not disclose another user's data.

Immediate P0 verification: `recalculate_customer_membership(uuid)`. The repository does not contain an EXECUTE privilege block after its final definition.

## Phase 6 — Policy quality review

Flag and manually evaluate:

- `USING (true)` or `WITH CHECK (true)`;
- `TO authenticated` without an ownership predicate;
- policies relying on `auth.email()` or user metadata for admin role;
- UPDATE without `WITH CHECK`;
- UPDATE without a SELECT policy;
- ownership predicates on unindexed columns;
- policies with joins that can be simplified/indexed;
- duplicate permissive policies that unintentionally widen access;
- policy names that exist but target stale columns/tables.

Preferred ownership predicate form for performance is `(select auth.uid()) = user_id`, with explicit `TO authenticated` and an index on `user_id`.

## Phase 7 — Evidence package

Capture without customer row data:

- query timestamp, project ref/environment, and reviewer identity;
- migration versions only, not SQL secrets;
- object existence/column/constraint/index results;
- RLS and grants results;
- function privilege results;
- policy test matrix result (pass/fail/error code), not PII;
- Storage bucket configuration and policy definitions;
- deviations mapped to backlog IDs.

Do not include service keys, access tokens, real customer emails, addresses, payment payloads, IP addresses, or attachment paths in the audit evidence.

## Exit criteria

DB1 security verification passes only when:

- every runtime relation exists with known migration provenance or an approved documented exception;
- every exposed-schema table has intentional RLS and grants;
- user A/B cross-tenant tests pass for every user-owned table;
- every privileged function has explicit safe EXECUTE grants;
- no hard-coded email or user-editable metadata controls admin authorization;
- review and return Storage policies pass path-ownership tests;
- all P0 findings are resolved or formally accepted with owner and expiry date.
