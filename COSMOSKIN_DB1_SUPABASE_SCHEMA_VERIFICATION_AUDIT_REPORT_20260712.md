# COSMOSKIN DB1 Supabase Schema Verification / Missing Schema Audit

Date: 2026-07-12
Mode: repository-only audit; no live SQL executed
Scope: Supabase/Postgres schema expectations, migration provenance, RLS, grants, constraints, indexes, RPCs, storage, and manual production verification
Out of scope: implementation, deployment, migration creation/application, business-logic changes, and `products.json`

## Executive conclusion

The repository contains substantial schema work, but it is not yet a self-proving, reproducible description of production. The most important release risk is provenance: several heavily used objects have no canonical migration base, and the ordered migration chain assumes an out-of-band baseline.

This audit therefore distinguishes three states:

- **Repository-proven:** a migration creates or explicitly evolves the object.
- **Out-of-band/partial:** root SQL or a later `ALTER TABLE` describes the object, but `supabase/migrations/` does not contain its complete base provenance.
- **Live unknown:** production existence, columns, constraints, policies, grants, data quality, and migration apply-state were not queried and must be verified manually.

No statement in this report asserts that production is broken. It identifies what the repository cannot prove.

## Pre-check result

- `git status --short`: clean.
- `git diff -- products.json`: empty.
- Required commits present:
  - `8594bea E1 harden favorites persistence and heart UI`
  - `74c91de UX3B polish storefront hotfix and UX4 fix account consent preservation.`

## Top schema risks

| Priority | Finding | Repository evidence | Production consequence if live state matches the gap |
|---|---|---|---|
| P0 | Migration chain is not a blank-database bootstrap | `20260418_guest_checkout.sql` immediately alters `public.orders`; migrations do not create `orders` until 20260629 | Fresh/staging rebuild can fail before later compatibility migrations run; migration history alone is not sufficient provenance |
| P0 | Favorites has no migration provenance | Runtime uses `user_favorites`; base table/RLS exists only in `supabase/schema.sql` and `supabase/commerce-schema.sql` | E1 can fail on an environment built only from migrations; production table/constraint/policy drift cannot be reviewed from migration history |
| P0 | Support requests has no SQL provenance anywhere under `supabase/` | `functions/api/account/support-requests.js` reads/inserts `support_requests` | Account support feature returns errors if the live table is missing or column shape differs |
| P0 | Reviews are only partially migrated | Base `reviews`, `review_images`, `review_helpful`, policies, and `review-images` bucket are root/manual SQL; the only migration adds `updated_at`/triggers | Fresh apply cannot reproduce R1; live fallback for missing `storage_path` confirms historical drift risk |
| P0 | `shipments` has no base `CREATE TABLE` in migrations | Migrations only `ALTER TABLE IF EXISTS public.shipments`; base exists in root schema files | Shipment migrations silently skip columns if base is absent; later FKs/event tables may fail or drift |
| P0 | User/admin tables created after blanket RLS hardening lack repository RLS blocks | `admin_activity_logs`, `admin_roles`, `admin_permissions`, `return_request_items`, `return_request_attachments`, `return_status_events`, `shipping_events`, `shipping_settings`, and others were created after 20260616 | If default Data API grants exist, PII/audit/provider data may be reachable without RLS |
| P0 | `recalculate_customer_membership(uuid)` is `SECURITY DEFINER` without a repository revoke/grant | 20260704 migration replaces the function but contains no `REVOKE`/`GRANT` for it | Default `PUBLIC EXECUTE` can expose arbitrary-user membership/spend/balance through a privileged RPC and permit repeated recalculation/history effects |
| P0 | Profiles own-update policy can bypass UX4 integrity | `profiles_update_own` permits whole-row update; UX4 birthday lock/counters and consent preservation are enforced in Cloudflare code, not DB constraints/column privileges | A direct authenticated Data API write could change lock counters, lock state, birthday, or consent flags if grants remain |
| P0 | Core FK/check provenance is inconsistent | 20260629 compatibility creates `order_items`/`payments` without FKs; final migration drops all prior check constraints on several tables before adding status checks only | Orphan items/payments and negative/inconsistent money/snapshot values may be possible unless live schema retains additional constraints |
| P1 | Data API grants are not consistently explicit | Most migrations rely on historical defaults; only selected tables/functions have explicit grants/revokes | New Supabase projects default toward opt-in exposure; a table can have correct RLS yet be inaccessible, or be granted broadly with incomplete RLS |

Current Supabase guidance treats grants and RLS as separate controls and requires RLS on exposed-schema tables. See [Securing your API](https://supabase.com/docs/guides/api/securing-your-api) and [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security). The 2026 Data API default change makes explicit-grant provenance especially important: [Tables not exposed automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

## Audit method and limitations

Read-only repository inspection covered:

- all 33 files under `supabase/migrations/`;
- root/manual SQL under `supabase/*.sql`, `supabase/hotfixes/`, `supabase/scripts/manual/`, and verification folders;
- `functions/api/**`, including helper-mediated table access and RPC calls;
- `assets/**` Supabase client initialization and account consumers;
- `tests/local-integration.test.mjs`;
- validator scripts, especially E1, UX4, P1/P1E, D1-D3, R1, H0/H1, and loyalty validators.

No Supabase connection, SQL Editor, CLI database command, MCP database call, deployment, or mutation was used. Live apply-state remains unknown.

## Migration inventory and domain classification

| Migration | Primary domain(s) |
|---|---|
| `20260418_guest_checkout.sql` | orders / guest checkout |
| `20260510_newsletter_subscribers.sql` | CRM / newsletter |
| `20260510_operations_inventory_orders_shipments.sql` | inventory / orders / shipments / restock |
| `20260510_phase1_operational_safety.sql` | inventory reservations / order events / payment events / email events |
| `20260511_phase2_invoice_returns_refunds.sql` | invoices / returns / refunds / shipment events |
| `20260511_phase3_compliance_crm_security.sql` | compliance / lots / suppliers / consent / CRM / admin users |
| `20260517_checkout_bank_transfer_statuses.sql` | orders / payments / bank transfer statuses |
| `20260616_atomic_inventory_reservation.sql` | inventory RPC |
| `20260616_inventory_reservation_hardening.sql` | inventory reservations / RPC / grants |
| `20260616_payment_bank_and_callback_hardening.sql` | payments / bank accounts / callback RPCs |
| `20260616_rls_security_hardening.sql` | blanket RLS/revokes for then-existing sensitive tables |
| `20260626_production_launch_readiness.sql` | profiles / preferences / routine / membership / loyalty / legal / admin RBAC / coupons / shipping settings |
| `20260627_customer_experience_production_patch.sql` | loyalty compatibility / payment methods / invoices / routine metadata |
| `20260628_cosmoskin_final_ecommerce_hotfix.sql` | profiles / addresses / bank accounts / inventory RPC |
| `20260629_cosmoskin_checkout_bank_transfer_final_fix.sql` | orders / items / payments / inventory / bank accounts / profiles / addresses |
| `20260629_cosmoskin_final_user_acceptance_fix.sql` | broad UAT compatibility |
| `20260629_cosmoskin_final_user_acceptance_fix_v2.sql` | duplicate broad UAT compatibility |
| `20260629_cosmoskin_post_verification_hotfix.sql` | bank accounts / post-verification alignment |
| `20260702_customer_returns_account_pdp_polish.sql` | return items/attachments/events / notification/profile compatibility |
| `20260702_routine_data_sync.sql` | skin/routine data sync |
| `20260703_account_experience_final_polish.sql` | profiles / notification preferences / membership cache |
| `20260703_account_runtime_hotfixes.sql` | returns / notifications / profile compatibility |
| `20260703_batch1_account_safe_functional_fixes.sql` | notification_preferences base / birthday lock fields / RLS |
| `20260703_batch3_customer_order_cancellation.sql` | order cancellation/event constraints |
| `20260704_batch4_loyalty_ledger.sql` | loyalty ledger / membership RPCs |
| `20260704_h0_live_payment_rpc_hotfix.sql` | payment/inventory callback RPCs and grants |
| `20260704_h0b_release_expired_inventory_patch.sql` | inventory expiry RPC |
| `20260704_h0c_release_expired_pending_status_patch.sql` | inventory expiry RPC status compatibility |
| `20260704_h1_return_attachment_storage_rls.sql` | Storage RLS for return attachments |
| `20260706_d3a_order_item_pricing_snapshot.sql` | order-item paid pricing snapshots |
| `20260707_p1c_admin_product_price_editing.sql` | price overrides / audit logs / admin permission |
| `20260707_r1g_review_moderation_updated_at_fix.sql` | reviews/review_images updated_at only |
| `20260709_p1e_sale_compare_at_price.sql` | sale/compare-at pricing and audit fields |

### Domain provenance summary

| Domain | Migration provenance | Assessment |
|---|---|---|
| Pricing / sale / compare-at | Clear | P1C/P1E tables, fields, checks, indexes, and RLS-enabled state are migrated; explicit table grants/revokes and audit idempotency still need live verification |
| Orders | Partial baseline, strong later evolution | Later migrations create compatibility tables, but earliest migration assumes `orders` already exists; canonical baseline remains unclear |
| Order items | Clear later creation/evolution | D3A snapshot columns migrated; FK and money/snapshot check constraints not proven |
| Payments | Clear later creation/evolution | Status/provider checks and callback RPCs migrated; FK/idempotency unique constraints require verification |
| Inventory | Clear | Canonical `product_inventory`, reservations, RPCs, checks, and functional uniqueness are migrated; legacy `inventory` remains root-only |
| Coupons/redemptions | Clear | Base/evolution present; duplicate reservation/redemption semantics require constraint verification |
| Reviews/review images/helpful | Partial/out-of-band | Base tables, policies, storage bucket, and storage policies are root/manual SQL; migration only adds timestamps/triggers |
| Refunds | Clear as `refund_records` | No `refunds`/`refund_items`; per-item audit is carried by `return_request_items` and JSONB metadata |
| Favorites/wishlist | Out-of-band | Root schema only; no migration |
| Profiles | Clear | Columns and policies migrated; whole-row direct update integrity is a risk |
| Notification preferences | Clear | Canonical base migration exists |
| Notifications | Out-of-band | Root schema only; no migration |
| Membership/loyalty | Clear but RPC privilege gap | Canonical tiers and ledger/RPCs migrated; recalc function privilege and cron wiring need action |
| CRM/newsletter | Partial | `newsletter_subscribers`, `consent_records`, `crm_events` migrated; sync logs/unsubscribe tokens/abandoned cart are absent |
| Shipments | Partial baseline | Columns/events evolved in migrations; base `shipments` create is root-only |
| Support | Missing | `support_requests` code exists, no Supabase SQL definition found |
| Addresses | Clear as `user_addresses` | No `customer_addresses`; own CRUD policies and explicit authenticated grant exist |
| Legal/consent | Clear | Tables migrated; FKs/idempotency/immutability need live verification |
| Admin/RBAC | Partial security provenance | Tables migrated, but several were created after blanket RLS hardening and lack later table-specific RLS/grant blocks |

## Code table reference inventory

Automated extraction found **56 table identifiers** in application/tests: **52 runtime** and **4 test-only/legacy mocks**. Helper operations are service-role PostgREST calls unless otherwise noted.

The complete expectation detail is in `COSMOSKIN_DB1_SUPABASE_SCHEMA_EXPECTATION_MATRIX_20260712.csv`. File-level evidence follows.

| Table | Usage | Files |
|---|---|---|
| `admin_activity_logs` | insert | `functions/api/_lib/admin-audit.js` |
| `admin_permissions` | read | `_lib/admin-audit.js`; `tests/local-integration.test.mjs` |
| `admin_users` | read/insert/update | `_lib/admin.js`; `_lib/admin-audit.js`; `admin/users.js`; tests |
| `birthday_benefits` | insert | `cron/birthday-benefits.js` |
| `checkout_idempotency` | test-only read | `tests/local-integration.test.mjs` |
| `consent_records` | read/insert | `account/summary.js`; `auth/register.js`; `consents.js`; `create-checkout.js`; `newsletter/subscribe.js`; tests |
| `coupon_redemptions` | read/insert/update | commerce finalization/cancellation; account coupons; admin orders/refunds; checkout; tests/validators |
| `coupon_reservations` | test-only read | tests |
| `coupons` | read/insert/update | commerce finalization; account coupons; admin coupons; tests |
| `crm_events` | insert | `_lib/crm-events.js` |
| `customer_coupons` | read/insert/update | commerce finalization; account coupons/summary; admin issue; checkout; loyalty redeem |
| `customer_membership_history` | read | `account/membership.js` |
| `customer_membership_status` | read | `account/membership.js`; `account/summary.js` |
| `customer_routine_results` | read/insert/update | `account/routine-results.js`; `account/summary.js` |
| `customer_skin_profiles` | read/upsert | `account/skin-profile.js`; `account/summary.js` |
| `email_events` | read/insert/update | email helper; admin dashboard/logs/orders; retry endpoint |
| `inventory` | test-only read | tests |
| `inventory_lots` | read/insert/update | admin dashboard/lots |
| `inventory_movements` | read/insert | inventory helper; admin movements |
| `invoice_records` | read/insert/update | commerce finalization; account/admin/get-orders/invoices/tracking |
| `loyalty_points_ledger` | read/insert | loyalty helper; account membership/points/summary; admin adjustments; birthday; redeem |
| `loyalty_redemptions` | insert | `loyalty/redeem.js` |
| `membership_levels` | read | `account/membership.js` |
| `newsletter_subscribers` | read/insert/update | `newsletter/subscribe.js` |
| `notification_preferences` | read/upsert | `account/notifications.js`; `account/summary.js`; tests |
| `notifications` | read/update | `account/notifications.js`; `account/summary.js` |
| `order_items` | read/insert | checkout; account/admin orders; refunds/returns; Brevo; callback; tracking; reviews; tests |
| `order_legal_consents` | insert | checkout; tests |
| `order_legal_snapshots` | insert | checkout; tests |
| `order_status_events` | read/insert | checkout/callback/cancellation; account/admin orders; returns/refunds/invoices; tests |
| `orders` | read/insert/update | core checkout/payment/account/admin/refund/return/review/shipping/CRM paths; tests |
| `payment_bank_accounts` | read/insert/update | bank-account helper; admin endpoint; tests |
| `payment_events` | read/insert | commerce finalization; admin dashboard; bank-transfer validators |
| `payments` | read/insert/update | checkout/callback/finalization/cancellation/admin/refund; tests |
| `product_compliance` | read/insert/update | public/admin compliance endpoints |
| `product_inventory` | read/insert/update | inventory helper/admin endpoints; tests/reconciliation/concurrency script |
| `product_price_audit_logs` | read/insert | product-pricing helper; admin history; tests/validator |
| `product_price_overrides` | read/upsert | product-pricing helper; tests |
| `products` | test-only read | tests |
| `profiles` | read/upsert | account profile/notifications/summary; registration; birthday/membership cron; tests |
| `refund_records` | read/insert | admin refunds/orders |
| `restock_alerts` | read/insert/update | inventory helper; admin dashboard/inventory; public restock endpoint |
| `return_request_attachments` | read/insert | account/admin returns; validators |
| `return_request_items` | read/insert | account/admin returns/refunds |
| `return_requests` | read/insert/update | cancellation; account/admin/returns/refunds/get-orders |
| `return_status_events` | read/insert | account/admin returns |
| `review_helpful` | read/insert/delete | reviews API |
| `review_images` | read/insert/update/delete | reviews API; tests |
| `reviews` | read/insert/update/delete | reviews API; tests |
| `shipment_events` | read/insert | admin orders |
| `shipments` | read/insert/update | commerce/account/admin/tracking/returns/shipping paths |
| `shipping_events` | read | public shipping tracking endpoint |
| `supplier_records` | read/insert/update | admin suppliers |
| `support_requests` | read/insert | account summary/support endpoint |
| `user_addresses` | CRUD | account addresses/summary |
| `user_favorites` | CRUD | account favorites/summary; E1 tests |

Supporting database objects not captured as direct helper table strings include `inventory_reservations`, `admin_roles`, `customer_preferences`, `legal_document_versions`, `loyalty_point_rules`, `shipping_settings`, and multiple RPCs.

## Table-name crosswalk and non-objects

- Customer identity/profile: `profiles`; skin profile: `customer_skin_profiles`. No `customer_profiles` table reference exists.
- Addresses: `user_addresses`. No `customer_addresses` table reference exists.
- Newsletter: `newsletter_subscribers`. No `newsletter_subscriptions` table reference exists.
- Coupon usage/reservation: `coupon_redemptions` with status. `coupon_usage` and runtime `coupon_reservations` are absent.
- Refunds: `refund_records`; requested line items: `return_request_items`. No `refunds` or `refund_items` table exists.
- Notifications: `notification_preferences` and `notifications` are separate; `customer_preferences` is an older parallel preference source.

## Favorites / wishlist verification

Expected `user_favorites` contract from E1 and root schema:

- UUID `id` PK;
- `user_id` FK to `auth.users(id)` with cascade delete;
- canonical `product_slug` plus display snapshot fields;
- unique `(user_id, product_slug)`;
- indexes on `user_id` and `product_slug`/recent user list;
- RLS with own select/insert/update/delete;
- explicit `authenticated` privileges only if direct Data API access is intentional.

Repository finding: the contract exists in root SQL, not in migrations. The prepared query pack verifies existence, columns, duplicates, blank slugs, optional catalog orphans, indexes, RLS, policies, and grants. Because `products.json` is the catalog source of truth and not a DB table contract, the DB orphan query against `public.products` is explicitly optional; a production slug export may be safer.

Risk: P0 provenance/rebuild risk. E1 runtime itself performs authenticated ownership checks through the server API and handles duplicate insert races, but it relies on the DB unique key for deterministic concurrency.

## Account / profile / preferences verification

### Profiles

Migration provenance covers:

- identity/name/contact: `id`, `email`, `first_name`, `last_name`, `phone`, `metadata`, timestamps;
- birthday: `birthday`, `birthday_change_count`, `birthday_last_changed_at`, `birth_date_locked`;
- consent/preferences: `marketing_email_opt_in`, `newsletter_opt_in`, `stock_alert_opt_in`, `routine_reminder_opt_in`;
- state: `account_status`, `fraud_flags`.

Not proven/ambiguous:

- no dedicated `personalization_opt_in`; routine email/reminder consent exists, while routine profile data is stored separately;
- `profiles.sms_notifications` is selected only as a fallback in one account query but no migration adds it; canonical SMS preference is `notification_preferences.sms_notifications`;
- birthday lock/correction limits are application-enforced and can be bypassed if direct profile UPDATE remains granted;
- unique email is declared in the initial create but later compatibility creates may meet an existing table without normalizing or adding the constraint.

### Notification preferences

`20260703_batch1_account_safe_functional_fixes.sql` provides the canonical base, unique `user_id`, FK, RLS, and own select/insert/update policies. It covers order, cargo, campaign, stock, routine, newsletter, and SMS fields. It intentionally has no delete policy.

Risk: P0 live-apply verification because UX4 persistence depends on this table. P1 source-of-truth drift remains among `profiles`, `notification_preferences`, and unused `customer_preferences`.

## Pricing / P1E verification

`product_price_overrides` and `product_price_audit_logs` have clear migration provenance.

Verified repository expectations:

- regular, sale, compare-at, and sale-window fields;
- positive price checks;
- sale below regular when regular is present;
- compare-at above sale;
- end after start;
- unique `product_slug` on overrides;
- `(product_slug, changed_at desc)` on audit logs;
- audit old/new sale, compare-at, start, and end fields;
- RLS enabled with no user policies, matching service-role/admin-only access.

Manual checks still required:

- explicit grants/revokes and Data API exposure;
- active sale-window query performance if the table grows;
- invalid live rows and duplicate slug state;
- audit immutability and request-level idempotency (`request_id` is not unique).

## Orders / payments / snapshots / refunds

### Orders and payments

Later migrations describe the current money/status model, but baseline order is unsafe. Expected indexes include user/created, email/order number, status/payment/fulfillment/created, checkout idempotency, and order FKs on all child tables.

Expected integrity not proven by the final compatibility create:

- `order_items.order_id`, `payments.order_id`, and some event `order_id` FKs;
- non-negative monetary totals/amounts;
- `quantity > 0` and consistent `line_total`;
- provider payment ID/conversation uniqueness according to provider semantics.

### Paid pricing snapshots

D3A migrates nullable:

- `allocated_order_discount`;
- `paid_line_total`;
- `paid_unit_price`;
- `pricing_snapshot_version`.

Checkout writes these for new lines. Refund code prefers complete stored snapshots and falls back to reconstruction for legacy/mixed rows. No DB CHECK enforces:

- non-negative snapshot amounts;
- `paid_line_total <= line_total`;
- `paid_line_total = line_total - allocated_order_discount` within currency rounding;
- `paid_unit_price * quantity` consistency;
- all-or-none snapshot population.

This is P0/P1 depending on live write controls: refund correctness currently depends on trusted server code and runtime validation rather than database invariants.

### Refunds

Runtime uses `refund_records`; completed records require a provider reference in application code. It derives caps from paid payments/order snapshots and stores proration diagnostics/item breakdown in `metadata`. No normalized `refund_items` table exists.

Recommendation: treat a normalized `refund_items` object as P1 accounting/audit backlog, not an automatic requirement. First verify whether `metadata.item_proration_breakdown` plus `return_request_items` meets legal, reconciliation, and provider-refund audit needs.

## Inventory verification

`product_inventory` is canonical. `available_stock` is deliberately computed in JS as `greatest(stock_on_hand - stock_reserved, 0)`; no generated DB column is required by current code.

Repository covers normalized slug uniqueness, non-negative stock/reserved/threshold, status checks, and service-role RPCs. Manual verification must confirm:

- exactly one normalized row per catalog slug;
- no negative counts;
- whether `stock_reserved > stock_on_hand` is allowed only with backorder or is always invalid;
- final status vocabulary matches code (`active`, `inactive`, `out_of_stock`, `discontinued` vs admin input normalization);
- reservation expiry/status indexes and no duplicate active order/slug reservations;
- RPC signatures and service-role-only execution.

The legacy `inventory` table exists only in root schema/test contexts and should not be considered authoritative.

## Reviews / images / storage verification

The current Supabase reviews API expects:

- `reviews`: status/approved sync, verified purchase, one review per user/product, moderation and timestamps;
- `review_images`: `review_id`, `user_id`, `storage_path`, `public_url`, `status`, `sort_order`, file metadata, moderation fields, `updated_at`;
- `review_helpful`: unique `(review_id,user_id)`;
- public bucket `review-images`, 2 MiB limit, JPEG/PNG/WebP;
- public read only for approved image rows; path-owner insert/delete; server-side admin moderation.

Provenance risks:

- base tables/policies/bucket are in root/manual SQL, not migrations;
- R1G adds only timestamps/triggers;
- current code retries a record insert without `storage_path` for older live schema, which is explicit evidence of schema-version compatibility handling;
- root review policies contain a hard-coded `auth.email() = 'cankolsun@cosmoskin.com.tr'` admin policy, which should not be canonical RBAC;
- `functions/api/reviews/schema.sql` and README describe an older D1 `product_reviews` implementation and are not the current Supabase schema source.

Risk: P0 provenance/RLS/storage alignment. Storage bucket/policies must be verified independently from table RLS.

## CRM / Brevo / newsletter

| Object/capability | Status | DB1 conclusion |
|---|---|---|
| `newsletter_subscribers` | Implemented | Clear migration, normalized unique email, RLS without public policies |
| `consent_records` | Implemented | Migrated; event idempotency/FKs/retention need verification |
| `crm_events` | Implemented foundation | Migrated allowlisted event stream; no delivery/sync state |
| Direct Brevo contact upsert | Implemented in code | `brevo-sync.js` reads paid order/items and writes Brevo; no local sync log |
| Birthday attribute sync | Partial | Birthday exists in profiles and birthday benefit cron; `brevo-sync.js` does not currently send birthday |
| Bank-transfer order CRM sync | Partial | Paid-order manual sync can read a bank-transfer order once paid; no durable automatic sync/outbox proof |
| `crm_sync_logs` | Missing, potentially needed for E3 | Needed if retries/audit/reconciliation are required |
| `email_unsubscribe_tokens` | Missing, likely needed for a secure preference-center link | Current account UI can turn newsletter preference off, but no tokenized email unsubscribe object exists |
| Abandoned cart | Not implemented/not needed for current DB1 | No table or code flow; defer until a consent-aware E3 design exists |

The public contact form sends Brevo emails but does not persist a DB contact/support record. The authenticated account support flow uses the missing `support_requests` table. These are two distinct paths.

## Membership / loyalty verification

Canonical tiers are correctly represented as:

- Essential;
- Signature;
- Elite.

No runtime use of Select or Silver was found; only a migration comment rejects those legacy names.

Migrated objects include:

- `membership_levels`;
- `customer_membership_status`;
- `customer_membership_history`;
- `loyalty_point_rules`;
- `loyalty_points_ledger`;
- `loyalty_redemptions`;
- `birthday_benefits`;
- RPCs for product-net basis, award, promotion, reversal, balance, and membership recalculation.

The ledger has strong idempotency indexes (`transaction_reference`, order/event/status) and the final recalc uses product-net spend excluding shipping.

Gaps:

- **P0:** no `REVOKE/GRANT` for `recalculate_customer_membership(uuid)` despite `SECURITY DEFINER`;
- **P1:** no endpoint/cron invokes `cosmoskin_promote_due_loyalty_points`; the helper exists but is unused;
- **P1:** `points-expiry.js` is a placeholder returning zero, not a ledger reversal/expiry processor;
- **P1:** no repository proof of scheduled invocations for membership, birthday, promotion, or expiry endpoints;
- **P1:** FK/check coverage for ledger references/status and non-negative cached membership values needs live verification.

## Shipments / support / contact

Shipment evolution, event tables, tracking fields, provider payloads, and DHL placeholders are present. DHL label creation intentionally returns `501 DHL_API_NOT_IMPLEMENTED` when credentials are detected; the webhook only validates a shared secret and acknowledges receipt without mapping provider events. This is an explicit placeholder, not a schema defect.

Schema risks:

- `shipments` base create is root-only;
- `shipping_events` was created after blanket RLS hardening without later RLS/grants;
- provider shipment/event idempotency uniqueness is not proven;
- two event tables (`shipment_events` and `shipping_events`) coexist and need an ownership/canonical-use decision.

Support risk: `support_requests` is a live runtime dependency with no repository SQL definition. Required expected fields and policies are captured in the matrix/query pack.

## RLS and security audit summary

User-owned tables requiring explicit verification:

- `profiles`, `user_addresses`;
- `orders`, `order_items`, `payments`, `shipments`;
- `user_favorites`, `notification_preferences`, `notifications`;
- `reviews`, `review_images`, `review_helpful`;
- `support_requests`;
- returns tables and legal/consent tables;
- membership/loyalty tables.

Server/admin-only tables should still have RLS in `public` plus revoked `anon`/`authenticated` grants, or be moved to a non-exposed schema. This includes price overrides/audits, payment events, CRM events, admin RBAC/audit, provider configurations, and raw provider response tables.

Specific policy checks:

- policies without `TO authenticated` are not automatically unsafe when `auth.uid()` is used, but explicit roles improve intent and performance;
- UPDATE must have both SELECT visibility and `WITH CHECK` ownership;
- hard-coded `auth.email()` admin checks are not acceptable as canonical RBAC;
- direct own-profile UPDATE should not permit protected birthday/consent/audit columns;
- review/image policies must be aligned with server-admin moderation and storage path ownership;
- views must be `security_invoker=true` or unavailable to API roles;
- every `SECURITY DEFINER` function must have a safe `search_path`, identity checks where user-callable, and explicit execute grants.

See `COSMOSKIN_DB1_SUPABASE_RLS_SECURITY_AUDIT_PLAN_20260712.md` for the manual test plan.

## Index and constraint audit summary

Highest-value verification targets:

- FK indexes for every child relation, especially order, return, review image, shipment, and ledger references;
- normalized unique coupon codes, emails, IBANs, product slugs;
- unique favorite `(user_id,product_slug)`;
- unique inventory normalized `product_slug`;
- unique notification preference `user_id`;
- review image `review_id` index and review helpful uniqueness;
- status/time composite indexes used by admin queues and cron jobs;
- non-negative money, stock, quantities, points, and thresholds;
- snapshot consistency checks;
- provider/callback/idempotency unique keys;
- legal/consent event duplicate prevention.

The query pack includes complete catalog dumps plus focused expected-key checks and the Supabase/Postgres recommended missing-FK-index query pattern.

## Overall provenance classification

### Clear migration provenance

`admin_activity_logs`, `admin_permissions`, `admin_roles`, `admin_users`, `birthday_benefits`, `campaign_eligibility_logs`, `consent_records`, `coupon_redemptions`, `coupons`, `crm_events`, `customer_coupons`, `customer_membership_history`, `customer_membership_status`, `customer_preferences`, `customer_routine_results`, `customer_skin_profiles`, `email_events`, `inventory_lots`, `inventory_movements`, `inventory_reservations`, `invoice_records`, `legal_document_versions`, `loyalty_point_rules`, `loyalty_points_ledger`, `loyalty_redemptions`, `membership_levels`, `newsletter_subscribers`, `notification_preferences`, `order_items`, `order_legal_consents`, `order_legal_snapshots`, `order_status_events`, `orders` (later compatibility base), `payment_bank_accounts`, `payment_events`, `payments`, `product_compliance`, `product_inventory`, `product_price_audit_logs`, `product_price_overrides`, `profiles`, `refund_records`, `restock_alerts`, `return_request_attachments`, `return_request_items`, `return_requests`, `return_status_events`, `shipment_events`, `shipping_events`, `shipping_settings`, `supplier_records`, and `user_addresses`.

“Clear” means the object is named in a migration; it does not mean the live object is applied or fully constrained.

### Unclear/manual/partial provenance

- `user_favorites` — root SQL only;
- `notifications` — root SQL only;
- `reviews` — root base; migration only patches;
- `review_images` — root base/bucket; migration only patches;
- `review_helpful` — root SQL only;
- `shipments` — root base; migrations only alter;
- `support_requests` — no SQL found;
- legacy/test-only `inventory`, `products`, `checkout_idempotency`, and `coupon_reservations`.

### Missing expected/potential objects

- `customer_profiles`, `customer_addresses`: not needed; canonical tables use other names;
- `newsletter_subscriptions`: not needed; canonical table is `newsletter_subscribers`;
- `coupon_usage`: not needed; canonical event table is `coupon_redemptions`;
- `refund_items`: not implemented; P1 decision for normalized accounting audit;
- `crm_sync_logs`: missing, likely needed for durable E3 reconciliation;
- `email_unsubscribe_tokens`: missing, likely needed for email-link preference center;
- abandoned-cart table: not implemented and not needed until E3 scope is approved.

## Deliverable map

- Expectation matrix: `COSMOSKIN_DB1_SUPABASE_SCHEMA_EXPECTATION_MATRIX_20260712.csv`
- Prepared queries: `COSMOSKIN_DB1_SUPABASE_VERIFICATION_QUERIES_20260712.sql`
- RLS/security plan: `COSMOSKIN_DB1_SUPABASE_RLS_SECURITY_AUDIT_PLAN_20260712.md`
- Migration backlog: `COSMOSKIN_DB1_SUPABASE_RECOMMENDED_MIGRATION_BACKLOG_20260712.md`
- Manual runbook: `COSMOSKIN_DB1_SUPABASE_RUNBOOK_20260712.md`

## Final audit statement

This DB1 audit prepared repository evidence and read-only verification material only. It did not execute SQL, inspect live production, deploy, create a migration, modify application logic, or modify `products.json`.
