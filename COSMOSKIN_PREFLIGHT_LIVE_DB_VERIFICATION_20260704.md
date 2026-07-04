# COSMOSKIN — Read-Only Live Supabase Preflight Verification

**Date:** 2026-07-04
**Type:** Read-only live verification. No files modified, no migrations created, no ALTER/UPDATE/DELETE/INSERT executed, no policies changed, nothing deployed.
**Method:** Supabase MCP (`list_projects`, `list_migrations`, `get_advisors`, `execute_sql` with SELECT-only statements) against the live project **COSMOSKIN** (`project_id: nhrvqpymtvilsfwttnge`, Postgres 17.6, `eu-central-1`), cross-referenced against `COSMOSKIN_FULL_COMMERCE_SUPABASE_AUDIT_20260704.md`, `COSMOSKIN_P0_P1_REMEDIATION_PLAN_20260704.md`, `COSMOSKIN_PROJECT_MEMORY.md`, and the relevant source files (`functions/api/iyzico-callback.js`, `functions/api/_lib/admin.js`, `functions/api/_lib/admin-audit.js`, `functions/api/_lib/supabase.js`, `functions/api/cron/release-expired-inventory.js`).

**Headline result: this preflight found one confirmed, live, revenue-path-breaking bug that the file-only audit could only flag as "needs live verification." It is now verified as broken, not hypothetical. See §4 and §6.**

**Re-verification note (2026-07-04, same session, ~15 minutes after initial run):** the identical preflight request was re-run. Core live facts were re-queried and confirmed **unchanged**: the same two `admin_users` owner rows, `process_iyzico_payment_success` and `release_expired_inventory_reservations` still absent from `pg_proc`, the three `return-attachments` `storage.objects` policies still scoped only to `auth.uid() IS NOT NULL` (no ownership predicate), `orders_fulfillment_status_final_chk`/`inventory_reservations_status_final_chk` unchanged, and `list_migrations` still returns zero tracked entries. No drift detected — every finding and recommendation below still applies as written.

---

## 0. Executive summary

Most of the file-based audit's P0/P1 findings hold up against the live database largely as described, with three important corrections that change the remediation plan's priority order:

1. **P0-1/P0-2 are confirmed broken, and worse than hypothesized.** The audit treated the inventory-reservation-status mismatch as "needs live verification." Live inspection shows the actual problem is more severe: the RPC function `process_iyzico_payment_success` **does not exist in the live database at all** (not an old version — simply missing). Every successful card/iyzico payment calls it, the call throws, and the code's own error-recovery branch then tries to write `orders.fulfillment_status = 'review_required'`, which the live CHECK constraint rejects — leaving the order stuck un-paid while `payments` is already marked paid. This has not caused a visible incident yet only because the store has very low live order volume (5 orders total) and the one `payment_status='paid'` order was a bank-transfer order, not a card payment — the iyzico success path has apparently never completed successfully in this environment.
2. **P0-3's premise is outdated: the bucket already exists.** The file audit found no `storage.buckets` SQL for `return-attachments` anywhere in tracked migrations and concluded the bucket might not exist. It exists live (created 2026-07-02, private, correctly sized/typed), with three RLS policies already active — but none of the three policies are ownership-scoped. Any authenticated customer can read, overwrite, or delete any other customer's return attachment object. This is a narrower but still real gap than "missing entirely."
3. **P0-5's blocking risk is lower than feared, with one unverifiable external dependency.** `admin_users` is seeded with exactly two `owner`/`permissions:['*']` rows for the site owner, and `admin_permissions` is fully and correctly populated for all five other roles. Flipping the RBAC default from allow-all to deny-when-unmatched would **not** lock out the owner **provided** Cloudflare Access is actually configured to inject a verified `Cf-Access-Authenticated-User-Email` header on admin requests in production — a fact this Supabase-only preflight cannot verify (it lives in Cloudflare Pages/Access configuration, not the database).

Everything else checked (Batch 1–4 schema columns, RLS enablement, return-request table-level policies, check constraints, RPC existence for loyalty) matches the audit and the prior batch reports.

---

## 1. admin_users readiness

**Table exists:** Yes.

**Columns (live, `information_schema.columns`):**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `email` | text | NO | — |
| `role` | text | NO | `'operations'` |
| `status` | text | NO | `'active'` |
| `created_at` | timestamptz | YES | `now()` |
| `updated_at` | timestamptz | YES | `now()` |
| `role_code` | text | YES | — |
| `permissions` | text[] | NO | `'{}'` |
| `is_active` | boolean | NO | `true` |
| `last_seen_at` | timestamptz | YES | — |

CHECK constraints live: `admin_users_role_check` restricts `role` to `owner/operations/warehouse/customer_support/content_editor` (note: **not** `accountant`, even though `admin_permissions` defines an `accountant` role — see below); `admin_users_status_check` restricts `status` to `active/disabled/invited`.

**Role/is_active representation:** Two parallel fields exist — the constrained `role` column and the free-text `role_code` column (not constrained). Code (`admin-audit.js:33`) reads `admin.role_code || admin.role || 'operations'`, so `role_code` is authoritative when present and can hold values (like `accountant`) that the `role` column's CHECK would reject. `is_active` (boolean) is checked directly (`admin.is_active === false` → deny); the separate `status` text column exists but is not read by `hasAdminPermission()` today.

**Is the admin account seeded?** Yes — two rows, both `owner` with wildcard permissions:

| email | role | role_code | is_active | permissions | created_at |
|---|---|---|---|---|---|
| `cankolsun@gmail.com` | owner | owner | true | `["*"]` | 2026-06-26 13:14:01 UTC |
| `cankolsun@cosmoskin.com.tr` | owner | owner | true | `["*"]` | 2026-06-26 13:15:52 UTC |

`admin_permissions` (the role→permission matrix `hasAdminPermission()` falls back to for non-owner roles) is fully populated and matches the roles implied by the admin UI:

| role_code | permissions |
|---|---|
| `owner` | `*` |
| `operations` | `coupons:issue`, `invoices:update`, `loyalty:adjust`, `orders:read`, `orders:update`, `payments:confirm_bank_transfer`, `refunds:update`, `returns:update`, `shipments:create` |
| `warehouse` | `inventory:adjust`, `inventory:read`, `orders:read`, `shipments:create` |
| `customer_support` | `coupons:issue`, `customers:read`, `orders:read`, `returns:update` |
| `content_editor` | `legal:publish`, `products:update` |
| `accountant` | `invoices:read`, `invoices:update`, `orders:read` |

No `admin_users` rows exist for `operations`/`warehouse`/`customer_support`/`content_editor`/`accountant` today — only the two `owner` rows. If any other real staff member currently performs admin actions, they are doing so either as one of these two identities or purely via the shared `ADMIN_TOKEN`/session (which bypasses `admin_users` entirely — see §2).

**Fallback admin bypass in code:** Confirmed, exactly as the audit described (`functions/api/_lib/admin-audit.js:27-29`):
```
export async function hasAdminPermission(context, permission) {
  const admin = await getAdminRecord(context);
  if (!admin) return true; // Cloudflare Access + signed session remains the P0 gate until table rows are seeded.
  ...
```
`getAdminRecord()` resolves the caller's identity from the `Cf-Access-Authenticated-User-Email` request header (`admin-audit.js:12-13`) — **not** from the `x-admin-token`/session used by `assertAdmin()`. If that header is absent or doesn't match a seeded row, `hasAdminPermission()` returns `true` unconditionally.

**Would flipping the RBAC default to deny lock out the current admin user?** Conditionally no:
- The seeded data is correct and sufficient — both real owner identities exist with `is_active:true` and `permissions:['*']`, which would pass any permission check under either the current or a flipped default, **as long as the request's `Cf-Access-Authenticated-User-Email` header is actually present and correctly set to one of those two addresses.**
- That header is only trustworthy/present if Cloudflare Access (or an equivalent trusted proxy) is genuinely deployed in front of the admin routes. Code-level evidence is inconclusive: `.env.example` recommends `REQUIRE_CLOUDFLARE_ACCESS=true`, but `wrangler.toml`'s `[vars]` block does not set this variable at all — it may be set as a Cloudflare Pages dashboard secret (invisible to this repo and to Supabase MCP), or it may not be set, in which case `assertCloudflareAccess()` (`functions/api/_lib/admin.js:85-93`) silently no-ops and the email header is never required or verified for any request.
- **This is the one dependency this Supabase-only preflight cannot close.** If Cloudflare Access is not actually enforcing that header today, then in production the header is likely absent on every real admin request, `getAdminRecord()` always returns `null`, and `hasAdminPermission()` always hits the `return true` branch regardless of `admin_users` content — meaning a naive default-flip would lock out **everyone**, including the seeded owner, on the 6 files that call `requireAdminPermission`.
- **Action required before flipping the default:** confirm directly in the Cloudflare Pages project settings/Access application configuration that `Cf-Access-Authenticated-User-Email` is genuinely injected (not client-settable) for both `cankolsun@gmail.com` and `cankolsun@cosmoskin.com.tr` on requests to the admin routes, and that `REQUIRE_CLOUDFLARE_ACCESS` is actually `true` in the live Pages environment (not just `.env.example`).

---

## 2. RBAC current behavior

**All admin authorization helpers found in code:**

| Helper | File | Mechanism | Used by |
|---|---|---|---|
| `assertAdmin()` | `functions/api/_lib/admin.js:137-159` | Verifies a signed HMAC session token (`v1.<exp>.<nonce>.<sig>`), or — only if `ADMIN_ALLOW_LEGACY_TOKEN !== 'false'` — a raw shared `ADMIN_TOKEN` via constant-time compare. Independent of `admin_users`. | All 31 admin route files (the universal gate) |
| `assertCloudflareAccess()` | `functions/api/_lib/admin.js:85-93` | No-ops unless `env.REQUIRE_CLOUDFLARE_ACCESS === 'true'`; when active, requires `Cf-Access-Jwt-Assertion` + `Cf-Access-Authenticated-User-Email` headers to be present (does not itself verify the JWT signature — that trust is delegated to Cloudflare Access having already validated it at the edge before the request reaches the Function). | Called inside `assertAdmin()` and `issueAdminSession()` |
| `hasAdminPermission()` / `requireAdminPermission()` | `functions/api/_lib/admin-audit.js:27-49` | Looks up `admin_users` by the `Cf-Access-Authenticated-User-Email` header; **defaults to allow (`true`) when no match is found.** | Only 6 of 31 admin files (confirmed: `admin-audit.js` itself plus `admin/shipments/[id]/sync.js`, `admin/orders/[id]/dhl-shipment.js`, `admin/returns/[id]/dhl-return-shipment.js`, `admin/loyalty/adjust-points.js`, `admin/shipments/[id]/label.js`, `admin/coupons/issue-customer-coupon.js`, `functions/api/email/retry-failed.js`, `functions/api/invoices/qnb-create.js` — 7 call sites outside the definition file itself) |

**Allow-all / self-flagged bypass logic:** `hasAdminPermission()`'s `if (!admin) return true;` branch, with the inline comment "Cloudflare Access + signed session remains the P0 gate until table rows are seeded" — confirms the audit's citation exactly, live in the current codebase.

**Exact safest fix sequence** (revised given live evidence):
1. **Confirm the Cloudflare Access dependency** (see §1) — this is a prerequisite, not a code change, and cannot be verified from Supabase alone.
2. Confirm the two seeded owner emails are still the correct, currently-used operator identities.
3. Seed `admin_users` rows for any additional real staff who need `operations`/`warehouse`/`customer_support`/`content_editor`/`accountant` access — none exist today.
4. Only then flip `hasAdminPermission()`'s no-match branch to `return false`.
5. Expand `requireAdminPermission` calls to the remaining 24 admin files (25 non-owner-only files minus the 7 that already call it), prioritizing refunds, order-status mutation, and inventory-adjust routes as the remediation plan already recommends.

**What must be seeded before changing the default:** For the current single-operator (owner-only) reality, nothing further — the two rows are correctly shaped. For any multi-staff rollout, the missing `admin_users` rows for the other five roles must be added first, or those staff members will silently fall back to allow-all today and be silently locked out the moment the default flips.

---

## 3. Return-attachments storage RLS

**Storage buckets (live, `storage.buckets`):**

| id | public | file_size_limit | allowed_mime_types | created_at |
|---|---|---|---|---|
| `review-images` | true | 2 MB | jpeg, png, webp | 2026-04-21 |
| `return-attachments` | **false** | 10 MB | jpeg, png, webp, mp4 | **2026-07-02** |

**Correction to the file-based audit:** the audit's P0-3 was written from tracked SQL files only and found "only comments instructing an operator to manually create" this bucket, concluding it might not exist or be misconfigured. It exists live, correctly private, correctly sized, correctly typed — created outside version control (no matching `INSERT INTO storage.buckets` found in any tracked migration), confirming the audit's own hypothesis "(b): an undocumented policy was added by hand outside version control."

**RLS enabled:** Yes on both `storage.objects` and `storage.buckets` (`relrowsecurity = true` for both).

**`storage.objects` policies for `return-attachments` (live, `pg_policies`):**

| Policy | Command | Roles | Condition |
|---|---|---|---|
| Customers can upload own return attachments | INSERT | authenticated | `bucket_id = 'return-attachments' AND auth.uid() IS NOT NULL` |
| Customers can read own return attachments | SELECT | authenticated | `bucket_id = 'return-attachments' AND auth.uid() IS NOT NULL` |
| Customers can delete own return attachments | DELETE | authenticated | `bucket_id = 'return-attachments' AND auth.uid() IS NOT NULL` |

**Can customers access only their own return attachments? No.** All three conditions check only `auth.uid() IS NOT NULL` — any signed-in user satisfies this for any object in the bucket, regardless of who uploaded it or which folder it lives in. There is no ownership predicate (no `(storage.foldername(name))[1] = auth.uid()::text` or equivalent), unlike `review-images`'s policies. **Any authenticated customer can read, overwrite, or delete any other customer's return attachment file**, as long as they know or can enumerate the storage path.

**Is public/anonymous access possible?** No — the bucket is private and all three policies are scoped to the `authenticated` role only. The gap is authenticated cross-customer access, not public exposure.

**Does the companion Postgres metadata table have the same gap?** No — this is the one place where the live state is *better* than the storage layer. `public.return_request_attachments` (the table that records `file_path`/`file_url` per return) has correctly owner-scoped RLS:
```
(customer_id = auth.uid()) OR EXISTS (
  SELECT 1 FROM return_requests rr
  WHERE rr.id = return_request_attachments.return_request_id
    AND (rr.customer_email = lower(auth.jwt()->>'email') OR rr.user_id = auth.uid())
)
```
and `public.return_requests` itself is scoped the same way (`customer_email = auth.jwt()->>'email' OR user_id = auth.uid()`). So a customer cannot discover another customer's attachment path *through the API* — the only avenue is if they already know or can guess a raw storage object path and hit Supabase Storage directly.

**Exact policy gap to fix:** replace the `auth.uid() IS NOT NULL` predicate in all three `storage.objects` policies for `return-attachments` with an ownership-scoped predicate tying the object's folder/path to the uploading customer (mirroring the intended `review-images` pattern), e.g. requiring uploads to be placed under `{auth.uid()}/...` and requiring `(storage.foldername(name))[1] = auth.uid()::text` for all three operations. Because the bucket and base policies already exist, this is a smaller, more surgical `ALTER`/`DROP+CREATE POLICY` fix than the original "create everything from scratch" framing in the file audit.

---

## 4. Live schema vs. migrations — table-by-table

### `inventory_reservations.status`
- Live CHECK (`inventory_reservations_status_final_chk`): `ANY (ARRAY['reserved','released','converted','expired','active'])` — **both** vocabulary generations are already accepted at the constraint level.
- Live data distribution: `released: 10`, `reserved: 3`, `converted: 1`, `active: 0`.
- Live function bodies for `reserve_order_inventory`, `release_order_inventory`, `convert_order_inventory` (fetched via `pg_get_functiondef`) **all consistently use `status = 'reserved'`** — no drift between these three functions.
- **`process_iyzico_payment_success` does not exist anywhere in the live database.** A broad `pg_proc` search (`proname ilike '%iyzico%' OR ilike '%payment_success%'`) returned zero rows. This is confirmed missing, not merely an old version — see the incident chain below.

### `orders.fulfillment_status` / "review_required"
- Live CHECK (`orders_fulfillment_status_final_chk`): `ANY (ARRAY['not_started','unfulfilled','preparing','packed','shipped','delivered','returned','cancelled'])` — **confirmed `'review_required'` is not an allowed value**, exactly as audit P0-2 predicted.
- `functions/api/iyzico-callback.js:352` sets exactly this disallowed value on every payment where the (currently always-failing) inventory RPC throws.
- Separately, `order_status_events_status_final_check` **does** allow `'review_required'` as an event `status` value (it's a different column on a different table) — this is not a fix for the `orders.fulfillment_status` problem, just a note that the two checks are independently defined and easy to conflate.

### `notification_preferences`
- Table and all expected columns present (`orders`, `campaigns`, `new_products`, `tips`, `sms`, `routine_reminders`, `restock_reminders`, `low_stock_alerts`, `cadence_days`, `depletion_lead_days`, plus the newer `campaign_emails`, `stock_notifications`, `newsletter`, `sms_notifications`, `order_updates`, `cargo_updates`). Two overlapping naming generations coexist live, consistent with the audit's P2-5-adjacent note — not a P0/P1 item, no action needed for this preflight.

### `orders` cancellation columns (Batch 3)
- All five confirmed present and correctly typed: `cancel_reason` (text), `cancel_requested_at` (timestamptz), `cancelled_by` (text), `cancel_request_reason` (text), `cancellation_status` (text). Matches Batch 3's migration exactly.

### `loyalty_points_ledger`
- Table and all Batch 4 columns present (`status`, `transaction_reference`, `available_at`, `points_basis_amount`, `reason`, `reversal_of`, `event_type`, `points_delta`, `balance_after`, etc.).
- Live row count: **0**. No purchase-earn, promotion, or reversal event has been written yet in this environment. This is internally consistent with "no fictional points" — the maintenance/backfill-note UI path (Batch 4 Step 3) should be the one currently rendering for any customer with historical paid orders, since there is nothing in the ledger yet to display.
- All expected RPCs confirmed present: `cosmoskin_award_loyalty_for_order`, `cosmoskin_promote_loyalty_for_order`, `cosmoskin_reverse_loyalty_for_order`, `cosmoskin_loyalty_balance_for_user`, `cosmoskin_order_points_basis`, `cosmoskin_promote_due_loyalty_points`, `recalculate_customer_membership`.

### `order_status_events`
- Columns confirmed including `created_by` (present, contrary to any assumption it's missing — but whether every write site actually populates it with a real admin identity is a separate, code-level question not answered by schema alone).
- Both `order_status_events_status_final_check` and `order_status_events_event_type_final_check` are defined `NOT VALID`. **Clarification on Postgres semantics: `NOT VALID` only skips the initial validation scan of pre-existing rows at constraint-creation time — it does not exempt future INSERTs/UPDATEs, which are still checked normally.** Confirmed in practice: the crash-recovery event write in `iyzico-callback.js:361` (`event_type: 'order_processing_review_required'`, which **is** in the allowlist) succeeds, but the *outer* catch block's own recovery write (`event_type: 'inventory_reconciliation_required'`, which is **not** in the allowlist) would itself fail the CHECK — this specific call is wrapped in its own local try/catch (`recordStatusEvent`, `iyzico-callback.js:67-84`) so the failure is silently swallowed rather than crashing the request further.

### `return_requests`
- `return_requests_status_check` confirms the full 13-value enum (`requested` … `closed`) live, matching the audit.
- `uq_return_requests_active_order` confirmed live as a partial unique index covering only 4 of the 13 statuses (`requested, under_review, approved, received`) — confirms the audit's note that this index is stale against the current status vocabulary and provides no protection for `return_code_shared`, `waiting_customer_ship`, `in_transit`, `inspection`, `refund_pending`, etc.
- Table-level RLS is correctly owner-scoped (see §3).

### `refund_records`
- Columns confirmed, `provider_reference` confirmed nullable with no CHECK or trigger forcing it to be non-null when `status = 'completed'` — confirms P1-9 exactly as described.

### `admin_users`
- See §1.

---

## 5. Migration rebuild risk

- **`list_migrations` (Supabase's own tracked migration history) returned zero entries** for this project, despite 25 SQL files under `supabase/migrations/` in the repository and clear live evidence that the large majority of them have been applied (Batch 1–4 columns, constraints, and functions are all present and correct). This means migrations here were applied as ad hoc SQL (via the Supabase SQL editor, or MCP `execute_sql`/`apply_migration` calls that didn't register in the CLI's migration-history table) rather than through a tracked mechanism. **Practically, this means there is currently no queryable record — in the repo or in the live database — of exactly which migrations have run, in which order, on this project.** This sharpens audit P0-6/remediation-plan F1: the provisioning-documentation gap isn't just "no single doc exists," it's "no record of applied migration history exists anywhere at all," which makes any future drift much harder to diagnose than a normal missing-runbook problem.
- **Baseline-only tables** (`products`, `shipments`, `user_favorites`, `notifications`, `reviews`, `review_images`, `support_requests`) — all 7 confirmed to exist live, consistent with audit P0-6's finding that they originate from non-tracked baseline SQL files, not `supabase/migrations/`.
- **Duplicate `CREATE TABLE IF NOT EXISTS` tables (P1-10)** — live column/FK inspection shows this risk has **already resolved itself in production**, though the underlying documentation debt remains for any future fresh-provisioning attempt:
  - `profiles`: live table carries FKs from **both** competing migration generations (`profiles_id_fkey: id -> auth.users.id` **and** `profiles_user_id_fkey: user_id -> auth.users.id`), plus the fuller column set (birthday fields, phone, metadata). Already converged to a superset.
  - `invoice_records`: live table has 20 columns spanning both described schemas (`invoice_number`/`invoice_url` from one generation, `provider_invoice_id`/`provider_response`/`order_number`/`file_url` from the other). Already converged.
  - `customer_coupons`: live table has 22 columns spanning both the `coupon_id`-based and `customer_email`/`title`-based schemas described in the audit, with a working `user_id -> auth.users(id) ON DELETE CASCADE` FK. Already converged.
  - `inventory_reservations`: as covered in §4, the CHECK constraint already accepts both status vocabularies; no live conflict.
  - **Conclusion:** the "two divergent CREATE TABLE" risk is real only for a *future* from-scratch provisioning run (where migration filename order determines which `CREATE TABLE IF NOT EXISTS` wins and later `ADD COLUMN IF NOT EXISTS` statements patch the rest). It is not an active bug in the current production database. This lowers the urgency of remediation-plan item F2 relative to the other findings in this report, though the documentation/consolidation work is still worth doing.
- No fixes were made; this section is reporting only, per the read-only scope of this preflight.

---

## 6. Final output

### Safe/unsafe to start Batch A?

| Sub-item | Status | Notes |
|---|---|---|
| A2 — return-attachments storage policy fix | **Safe to start** | Bucket exists; fix is a scoped `ALTER`/`DROP+CREATE POLICY` on 3 existing policies, not a from-scratch bucket creation. |
| A3 — admin activity log wrapper | **Safe to start** | Purely additive logging; `admin_activity_logs` confirmed empty (0 rows) and correctly structured (`actor_user_id`, `actor_email`, `role_code`, `action`, `resource_type`, `before_data`, `after_data`, etc.). |
| A4 — `consents.js` authenticated `user_id` fix | **Safe to start** | No live-DB dependency beyond the `consent_records` table already having RLS enabled with no customer-facing policies (service-role only, unaffected by this fix). |
| A1 — RBAC default flip | **Conditionally safe — do not start yet** | Seed data supports it, but ship only after confirming the Cloudflare Access / `Cf-Access-Authenticated-User-Email` dependency in production (see §1/§2). Treat as its own gated sub-step, separate from A2–A4. |

### Admin lockout risk?

Low for the two seeded owner accounts, **conditional on an external, Cloudflare-side confirmation this preflight cannot make** (see §1). Zero risk to the 25 admin routes gated only by `assertAdmin()` (unaffected by any RBAC default change). Real risk to any *other* staff member currently operating admin routes without a corresponding `admin_users` row — none exist beyond the two owner rows today.

### Required seed SQL if any

None. The two owner rows are already correctly shaped (`role='owner'`, `role_code='owner'`, `permissions=['*']`, `is_active=true`). No SQL was run or is being proposed as part of this read-only preflight.

### Exact Supabase objects verified

- **Tables (existence + columns/constraints/RLS checked):** `admin_users`, `admin_permissions`, `admin_roles` (RLS-enabled-no-policy confirmed via advisor), `admin_activity_logs`, `orders`, `inventory_reservations`, `loyalty_points_ledger`, `order_status_events`, `notification_preferences`, `return_requests`, `return_request_attachments`, `refund_records`, `profiles`, `invoice_records`, `customer_coupons`, `products`, `shipments`, `user_favorites`, `notifications`, `reviews`, `review_images`, `support_requests`.
- **Functions (existence + full body inspected where relevant):** `process_iyzico_payment_success` (**confirmed absent**), `process_iyzico_payment_failure` (**confirmed absent**), `reserve_order_inventory`, `release_order_inventory`, `convert_order_inventory` (all three: body fetched and confirmed consistent), `release_expired_inventory_reservations` (**confirmed absent**), `cosmoskin_award_loyalty_for_order`, `cosmoskin_promote_loyalty_for_order`, `cosmoskin_reverse_loyalty_for_order`, `cosmoskin_loyalty_balance_for_user`, `cosmoskin_order_points_basis`, `cosmoskin_promote_due_loyalty_points`, `recalculate_customer_membership` (all seven: existence confirmed).
- **Storage:** buckets `review-images` (public, correctly configured) and `return-attachments` (private, correctly sized/typed, exists live but under-scoped policies); RLS enablement on `storage.objects`/`storage.buckets` confirmed.
- **Policies:** all `pg_policies` rows for `storage.objects` (return-attachments bucket), `public.return_requests`, `public.return_request_attachments` fetched with full `qual`/`with_check` definitions; confirmed zero policies exist for `admin_users`/`admin_activity_logs` (service-role only, by design).
- **Migration history:** `list_migrations` (Supabase-tracked) confirmed empty/untracked.
- **Security advisors:** full live `get_advisors(type=security)` run, cross-referenced against the audit's RLS findings.
- **Live data samples:** order count (5), payment-method/paid-order distribution, `inventory_reservations` status distribution, `loyalty_points_ledger` row count (0), the one paid order's full status/event history.

### Exact recommended first implementation batch

**Recommend an emergency, narrowly-scoped hotfix ahead of the originally-planned Batch A, addressing only the confirmed-broken payment path:**

1. Restore/recreate `process_iyzico_payment_success` (P0-1) so it exists live again with the correct, already-consistent `'reserved'` vocabulary used by the three sibling functions.
2. In the same deploy, resolve the `'review_required'` CHECK-constraint gap (P0-2) — either widen `orders_fulfillment_status_final_chk` or change the code to use an already-allowed value, so the two failures that currently compound each other are fixed together.
3. Restore/recreate `release_expired_inventory_reservations` (referenced by `functions/api/cron/release-expired-inventory.js` but also confirmed absent live) at the same time, since it's the same class of problem (code references a function that isn't in the database) and is cheap to fix alongside items 1–2.

After that emergency fix is verified (a real test card payment completing end-to-end with `orders.status='paid'`, inventory converted, and no `review_required`/reconciliation flags), proceed with the originally-planned Batch A in this order: **A2 → A3 → A4 → (confirm Cloudflare Access) → A1**.

### Any P0 that must be split smaller?

- **P0-1 must be split into two independent pieces**, since live evidence changes what each piece actually requires:
  1. *Emergency*: restore the missing `process_iyzico_payment_success` (and `release_expired_inventory_reservations`) functions — this alone unblocks the revenue path and should happen before any other remediation batch.
  2. *Non-urgent, possibly already closed*: the "reconcile `'active'` vs `'reserved'` vocabulary across the reservation RPCs" work the original audit called for is **already done** in the three live functions inspected (`reserve/release/convert_order_inventory` all consistently use `'reserved'`); this half of P0-1 does not need further code change, only confirmation (done, in this report).
- **P0-2 should not be scheduled as a separate later batch** — it fails together with P0-1's emergency piece in the same code path and should be fixed in the same deploy, not sequenced afterward.
- **P0-5 should remain split into its two sub-steps** as the remediation plan already proposed: seed verification (done, confirmed in this report) and the Cloudflare Access dependency confirmation (not done, outside Supabase's visibility) must both complete before the code-level default flip — do not treat the flip as a single atomic change.
- **P0-3 should be re-scoped smaller** than originally planned: the bucket-creation work is already done; only the policy-scoping correction remains, which is a smaller `ALTER`/`DROP+CREATE POLICY` change against 3 existing policies rather than a from-scratch bucket-plus-policy migration.
- **P0-6 does not need further splitting**, but the provisioning document it calls for must now also state that migration application needs to be tracked going forward (e.g. via the Supabase CLI's migration history), since this preflight confirmed the live project currently has zero tracked migration history despite 25 files existing in the repo.

---

## Appendix — supplementary live-only findings (outside the named P0/P1 list, surfaced by `get_advisors`)

These were not part of the 16 P0/P1 items in the remediation plan and are not scored here, but are flagged because they were directly observed during this live verification and are related to the same RBAC/RLS trust boundary this preflight was asked to check:

- Several `SECURITY DEFINER` functions are directly callable by the `anon` and/or `authenticated` PostgREST roles via `/rest/v1/rpc/<name>`, including `recalculate_customer_membership(p_user_id uuid)`, `recalculate_loyalty_account(p_user_id uuid)`, `reserve_product_inventory(p_product_slug, p_quantity)`, and `cleanup_old_notifications(...)`. Because these run with the *definer's* privileges and take an arbitrary `p_user_id`/parameters directly from the caller, an unauthenticated or authenticated-but-unrelated caller could invoke them against any user ID or product without going through the application's own authorization logic. Worth a follow-up, narrowly-scoped security pass (likely `REVOKE EXECUTE FROM anon, authenticated` plus re-grant only to `service_role` where these are meant to be backend-only) — not evaluated further here since it wasn't in the requested P0/P1 scope, but flagged so it isn't lost.
- `auth_leaked_password_protection` is disabled project-wide (Supabase Auth setting, unrelated to any table).
- The `citext` extension is installed in the `public` schema rather than a dedicated extensions schema (cosmetic/linter-only).

No action was taken on any of the above; they are reported for awareness only.

---

*Preflight complete. No files were modified, no migrations were created, no data-changing statements were executed, and no policies were changed as part of this pass, per the read-only scope of this request.*
