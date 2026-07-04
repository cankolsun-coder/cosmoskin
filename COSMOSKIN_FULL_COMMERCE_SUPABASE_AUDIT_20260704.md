# COSMOSKIN — Full Supabase & Backend Commerce Audit

**Date:** 2026-07-04
**Type:** Read-only audit. No files modified, no migrations created, no code written.
**Scope:** Entire Supabase schema (25 tracked migrations + non-migration baseline SQL), every `functions/api/**` handler (101 files), order/payment/inventory lifecycle, returns/refunds, coupons/loyalty, customer account, admin operations, migration hygiene, data integrity, observability.
**Method:** Full-file reads of all migrations and API handlers (via five parallel deep-read passes), cross-referenced against prior batch reports (`COSMOSKIN_BATCH_1..4_*`), the pre-Batch-1 audit (`docs/audits/claude-account-audit-20260703.md`), and the post-Batch-4 readiness checklist. All claims below carry `file:line` citations. Ambiguity is stated explicitly rather than guessed.

---

## 1. Executive summary

COSMOSKIN's backend is **substantially more built-out than a typical MVP** — atomic inventory reservation RPCs, idempotent iyzico callback handling, a real loyalty ledger with advisory-lock concurrency control, hygiene-checklist return flows, and application-enforced ownership checks are all present and mostly correct. Batches 1–4 (coupons/notifications, header/UI, order cancellation, loyalty ledger) delivered exactly what they scoped, and the project's own final checklist (`COSMOSKIN_FINAL_ACCOUNT_COMMERCE_RELEASE_CHECKLIST_20260704.md`) correctly verified those specific behaviors.

However, this audit — which looks at the **whole** backend rather than the account module Batches 1–4 touched — surfaces a materially different picture in three areas that the batch-scoped work never covered:

1. **Schema provenance is split and undocumented.** `supabase/migrations/` (25 files, the only thing any recent runbook references) **cannot provision `products`, `shipments`, `user_favorites`, `notifications`, `reviews`, or `support_requests` from an empty database** — those tables only exist in a separate, older, undocumented baseline (`supabase/schema.sql` + siblings) that no current deployment checklist mentions. This is a real disaster-recovery and environment-parity risk, not a hypothetical one.
2. **Two live migration generations disagree on inventory-reservation status vocabulary** (`'active'` vs `'reserved'`) across functions that are both still installed (`process_iyzico_payment_success` vs the June-29 "final fix" `reserve/release/convert_order_inventory`). This sits directly on the card-payment → stock-decrement path and needs to be checked against the live database's `pg_proc` before the next payment-related deploy — it cannot be resolved by reading files alone.
3. **The two payment-confirmation code paths (iyzico success vs. admin "mark bank transfer paid") do materially different things.** The bank-transfer path — a commonly used method in Turkish e-commerce — never updates the `payments` row, never finalizes the coupon redemption (`used`), never creates an invoice shell, and never runs the shipment/CRM/Brevo hooks that the card path runs. This is a live commerce-integrity gap, not a hypothetical one.

Loyalty (Batch 4) is internally consistent (ledger-backed, no fictional points, correct 6,000/15,000 thresholds in all four places), but its **"available after delivered+14 days" business rule is not actually enforced anywhere** — the only wired promotion path is "immediate on admin delivered click," and the 14-day sweep RPC has no caller. Returns are functionally solid but the **attachment storage bucket has no actual RLS policy in any SQL file**, only a comment instructing an operator to create one — for a feature that already accepts client-supplied file paths without server-side verification.

Admin operations work, but role-based permissions are **schema-ready and self-flagged in code as unenforced** (`hasAdminPermission` returns `true` for everyone when `admin_users` is unpopulated — the code comment literally says "P0 gate until table rows are seeded"), and only 5 of 31 admin route files write to the admin activity log.

None of this is a fabricated-data or brand-integrity issue (Batches 1–4 hold up), but several items below are genuine production risk that the account-focused batches never had visibility into because they were scoped to `assets/account-dashboard.js` and a handful of `functions/api/account/*` + `functions/api/loyalty/*` files.

---

## 2. P0 issues (launch-blocking / data-loss / payment / security risk)

### P0-1 — Inventory reservation status vocabulary mismatch between live SQL functions
`supabase/migrations/20260616_payment_bank_and_callback_hardening.sql:132-137` (`process_iyzico_payment_success`) checks/expects reservation `status = 'active'`. `supabase/migrations/20260629_cosmoskin_checkout_bank_transfer_final_fix.sql:348-378,398,432` replaces `reserve_order_inventory` / `release_order_inventory` / `convert_order_inventory` to operate on `status = 'reserved'` and does **not** re-define `process_iyzico_payment_success` to match. Because checkout today calls the June-29 `reserve_order_inventory` (which stamps `'reserved'`), the embedded `'active'` check inside `process_iyzico_payment_success` can never find a match. **This must be verified directly against the live database** (`select prosrc from pg_proc where proname = 'process_iyzico_payment_success'`) before any further payment-path work — if the live function body is the June-16 version, card-payment stock conversion correctness is not guaranteed today. Not confirmable from files alone because Supabase migration application order on the live project is unknown to this audit.
**Recommended fix:** re-`CREATE OR REPLACE` `process_iyzico_payment_success` in a new additive migration so its internal reservation-status checks match `'reserved'`, add a regression test that reserves → pays → asserts `product_inventory.stock_reserved` and `stock_on_hand` both moved exactly once.

### P0-2 — `fulfillment_status = 'review_required'` is written but not in the DB CHECK constraint
`functions/api/iyzico-callback.js:352` sets `orders.fulfillment_status = 'review_required'` on the exact failure path meant to protect against inventory RPC exceptions during a successful payment. The live constraint `orders_fulfillment_status_final_chk` (`supabase/migrations/20260629_cosmoskin_checkout_bank_transfer_final_fix.sql:195`) allows only `not_started, unfulfilled, preparing, packed, shipped, delivered, returned, cancelled`. If this constraint is enforced live, **the exact error-recovery branch that exists to handle a payment-success/inventory-failure edge case will itself throw a DB error**, potentially leaving the customer's card charged with an order stuck in an inconsistent, hard-to-diagnose state.
**Recommended fix:** add `'review_required'` to the CHECK constraint in an additive migration, or change the code to use an already-allowed value (`'unfulfilled'`) plus a `metadata.review_required: true` flag.

### P0-3 — `return-attachments` storage bucket has no RLS policy anywhere in tracked SQL
Grep across every migration and baseline SQL file found only **comments** instructing an operator to manually create a private `return-attachments` bucket (`supabase/migrations/20260703_account_runtime_hotfixes.sql:19`, `supabase/migrations/20260702_customer_returns_account_pdp_polish.sql:110-111`) — unlike `review-images`, which has a complete, correct `storage.buckets` INSERT + three `storage.objects` policies (`supabase/phase51_reviews_hardening.sql:11-16,86-98`). Meanwhile `functions/api/returns.js:46-54` accepts a client-supplied `file_path`/`file_url` with **no server-side verification that the object exists or belongs to the uploading user**, which means the actual upload happens directly from the browser to Supabase Storage using the user's own session. Combined, this means one of three things is true in production today, all bad: (a) uploads are currently broken because a private bucket with no policies rejects authenticated writes, (b) an undocumented policy was added by hand outside version control, or (c) the bucket is public and any customer's damaged/wrong-product photo or video is fetchable by anyone who can guess/enumerate the path. Customer support attachments frequently contain identifying content (faces, addresses on packaging, home interiors).
**Recommended fix:** mirror the `review-images` pattern exactly — `INSERT INTO storage.buckets` (private) + owner-scoped `INSERT`/`SELECT` policies keyed on `auth.uid()` folder prefix, add server-side existence/ownership verification in `returns.js` before persisting `file_path` to `return_request_attachments`, and sign all customer-facing attachment URLs (today only the admin endpoint signs URLs — `functions/api/admin/returns.js:30-41` vs. unsigned customer read at `functions/api/returns.js:136-142`).

### P0-4 — Admin bank-transfer payment confirmation does not reach payment/coupon/invoice/shipment finalization
When admin marks a bank-transfer order paid (`functions/api/admin/orders.js:60,318-341,362-365`), the flow updates `orders` and converts inventory, but: the `payments` row is **never updated** (stays `awaiting_transfer` forever — `functions/api/admin/orders.js` has no write to `payments`, contrast checkout's own insert at `functions/api/create-checkout.js:844-858`), the coupon redemption is **never finalized to `used`** (only released on the "not received" branch — `functions/api/admin/orders.js:352-354`), no invoice shell is created, and none of `ensureShipmentShell`/Brevo sync/CRM event run (all present in the iyzico success path at `functions/api/iyzico-callback.js:105-188,370-377` but absent here). Bank transfer (EFT/Havale) is a standard, commonly used payment method in Turkish e-commerce, so this is not an edge case — every bank-transfer order that gets manually approved today carries a `payments` row and coupon-redemption state that never converge with reality. This directly undermines financial reconciliation, coupon usage reporting, and (if any future logic ever keys off `payments.status` instead of `orders.payment_status`) could cause silent double-processing.
**Recommended fix:** factor `finalizeCommerceAfterPayment()` (currently iyzico-only, `functions/api/iyzico-callback.js:105-188`) into a shared helper called from both the iyzico success path and the admin bank-transfer "mark paid" action, so `payments`, coupon `used` state, and invoice shell creation happen identically regardless of payment method.

### P0-5 — Admin RBAC is self-documented as unenforced ("P0" in the code's own comment)
`functions/api/_lib/admin-audit.js:27-29` — `hasAdminPermission()` returns `true` for every permission when no `admin_users` row matches the caller's identity, with an inline comment stating this is a stopgap "until table rows are seeded." Combined with the finding that most admin route files call only `assertAdmin` (a single shared token check) and not `requireAdminPermission` (used in only 6 of 31 admin files), the schema-level RBAC (`admin_users`, `admin_roles`, `admin_permissions` — real, well-designed tables per `supabase/migrations/20260626_production_launch_readiness.sql:256-295`) is effectively decorative today: **any holder of the shared `ADMIN_TOKEN` has full access to refunds, loyalty adjustments, order mutation, and customer data**, regardless of the `owner/operations/warehouse/customer_support/content_editor` role distinctions the UI implies exist (`functions/api/admin/users.js:7`).
**Recommended fix:** populate `admin_users` for every real admin operator as part of onboarding, flip the default in `hasAdminPermission` from allow-all to deny-when-unmatched, and expand `requireAdminPermission` coverage to the high-blast-radius routes first (refunds, loyalty adjust, order status, inventory adjust).

### P0-6 — `supabase/migrations/` alone cannot rebuild the database; no single provisioning document exists
A dedicated reconciliation pass confirmed `products`, `shipments`, `user_favorites`, `notifications` (in-app), `reviews`/`review_images`, and `support_requests` are **only** `CREATE TABLE`'d in non-tracked files (`supabase/schema.sql`, `supabase/commerce-schema.sql`, `supabase/phase6-commerce-schema.sql`, `supabase/reviews.sql`, `supabase/phase51_reviews_hardening.sql`, and the repo-root `COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql` for `support_requests` specifically) — never in any of the 25 files under `supabase/migrations/`. The current, most-referenced runbook (`COSMOSKIN_FINAL_ACCOUNT_COMMERCE_SUPABASE_RUNBOOK_20260704.md`) lists only the 25 migrations and explicitly does not mention `schema.sql` or the hotfix scripts. An engineer following that document today to provision a new environment (disaster recovery, staging, or a second Supabase project) would get a database missing the products catalog, shipments, favorites, in-app notifications, reviews, and support tickets. Three `hotfixes/*.sql` files also exist as evidence of past mid-migration failures (missing `email` column, missing `user_id` on `loyalty_points_ledger`) that were never folded back cleanly into a single authoritative migration chain.
**Recommended fix:** produce one `SUPABASE_PROVISIONING.md` that lists the exact ordered command sequence (baseline `schema.sql` → 25 migrations → any still-needed root-level fix files → verification scripts), or better, consolidate the baseline tables into a proper first migration so `supabase/migrations/` becomes the single source of truth end-to-end.

---

## 3. P1 issues (serious commerce or customer trust issue)

### P1-1 — Delivered+14-day loyalty point promotion is unwired; only immediate admin-triggered promotion works
`cosmoskin_promote_due_loyalty_points()` (`supabase/migrations/20260704_batch4_loyalty_ledger.sql:272-305`) implements the documented "pending → available after delivered+14 days" rule, but has **no caller anywhere** — not in any `functions/api/cron/*.js` file, not in `wrangler.toml` (no `[triggers]`/`crons` block at all), not in the separate `automation/cron-reminders` Worker (which only sends routine/restock emails on its own daily trigger). The only mechanism that actually promotes points today is immediate promotion when an admin manually marks an order "delivered" (`functions/api/admin/orders.js:445-446`), which defeats the 14-day anti-fraud/return-window rationale entirely.
**Recommended fix:** either add a genuine Cloudflare Worker scheduled trigger (mirroring `automation/cron-reminders`) that calls `cosmoskin_promote_due_loyalty_points()` daily, or accept immediate-on-delivered as the actual v1 policy and update the SQL comments/documentation to stop claiming a 14-day hold that doesn't run.

### P1-2 — Three of four scheduled-job endpoints have no scheduler at all
`functions/api/cron/release-expired-inventory.js`, `functions/api/cron/points-expiry.js`, and `functions/api/cron/recalculate-memberships.js` are `CRON_SECRET`-protected HTTP endpoints with no actual invoker anywhere in the repository (confirmed: no GitHub Actions workflow exists — `.github/` is empty — and `wrangler.toml` has no `[triggers]` section; Cloudflare Pages Functions cannot have `scheduled()` handlers at all, only standalone Workers can, which is why `automation/cron-reminders` exists as a separate Worker). This exact gap was **already flagged in prior project documentation** before this audit (`COSMOSKIN_PRODUCTION_DEPLOYMENT_CHECKLIST.md:33`, `COSMOSKIN_REMAINING_RISKS.md:15`, `COSMOSKIN_AUDIT_CLOSURE_MATRIX.md:15` all state the EFT-expiry cron was never actually scheduled), meaning: abandoned checkouts may hold reserved stock/coupons indefinitely unless someone remembers to `curl` the endpoint manually; `points-expiry.js` is currently a stub that expires nothing regardless (`functions/api/cron/points-expiry.js:9-12`); and `recalculate-memberships.js` (tier recalculation) never runs on its own schedule either.
**Recommended fix:** stand up one additional scheduled Worker (or extend `automation/cron-reminders`) that calls all four `/api/cron/*` endpoints with `CRON_SECRET` on appropriate cadences (e.g. every 15 min for inventory release, daily for memberships/promotion, and implement real expiry rules before scheduling `points-expiry`).

### P1-3 — Two divergent admin "change order status" code paths with different side effects
`functions/api/admin/orders.js` PATCH and `functions/api/admin/orders/[id]/status.js` PATCH both mutate `orders.status`/`payment_status`/`fulfillment_status` and both call the same loyalty hooks, but only the former sends customer emails, updates shipment records, sets `paid_at`/`delivered_at` timestamps, and writes richer `order_status_events` payloads (`event_type`, `previous_status`, `new_status`). Whichever one the admin UI actually calls for a given action determines whether the customer gets notified and whether timestamps are recorded — this is a latent inconsistency risk even if today's admin UI only calls one of them consistently.
**Recommended fix:** consolidate into a single order-status-mutation function used by both routes (or deprecate one route), so there is exactly one place that decides which side effects fire for which transition.

### P1-4 — Return "delivered" eligibility gate accepts `shipped`, contradicting its own error message
`functions/api/returns.js:32-36` (`isDelivered()`) returns true for `status = 'shipped'` or `fulfillment_status = 'shipped'` even with no `delivered_at` set, while the rejection message shown to ineligible customers explicitly says "Sipariş teslim edildikten sonra iade talebi oluşturabilirsiniz" (return only after delivery). A customer could file (and have admin process) a return request for an order that has shipped but not yet arrived. The 14-day return-window anchor (`functions/api/returns.js:24-25`) also falls back through `fulfilled_at → updated_at → created_at` when `delivered_at` is missing, which can silently shift the legal return deadline earlier or later than the true delivery date.
**Recommended fix:** require `delivered_at IS NOT NULL` (or an explicit `fulfillment_status = 'delivered'`) as the sole eligibility gate, and only fall back to `shipped_at + estimated transit time` as a documented, intentional exception if the business wants to allow early return requests.

### P1-5 — Admin stock edits via `admin/products.js` bypass the inventory movement audit trail
`functions/api/admin/products.js:64,76-84` writes directly to `product_inventory` without inserting into `inventory_movements`, unlike the parallel path through `functions/api/admin/inventory/adjust.js` → `functions/api/_lib/inventory.js:171-181`, which does log every change with `reason`/`note`/`created_by`. Two ways to change the same number, only one of which is audited, means stock-discrepancy investigations will have blind spots.
**Recommended fix:** route all `product_inventory` writes (including from `admin/products.js`) through the shared `setInventory()`/`adjustInventory()` helper that guarantees a movement row.

### P1-6 — Admin activity logging covers only 5 of 31 admin route files
`recordAdminActivity()` (`functions/api/_lib/admin-audit.js`) is called from only `admin/loyalty/adjust-points.js`, `admin/coupons/issue-customer-coupon.js`, `admin/orders/[id]/dhl-shipment.js`, `admin/returns/[id]/dhl-return-shipment.js`, and `admin/shipments/[id]/sync.js`. Order status changes, manual payment approvals, stock adjustments via `inventory/adjust.js`, invoice creation, customer/user management, and coupon list management are not written to `admin_activity_logs` at all — accountability for "who approved this bank transfer" or "who changed this order status" relies solely on `order_status_events.source = 'admin'` (no actor identity in most cases) rather than a queryable admin audit log.
**Recommended fix:** wrap the shared admin route helper so every successful mutating admin request logs to `admin_activity_logs` by default, rather than requiring each handler to opt in individually.

### P1-7 — `consents.js` accepts an arbitrary `user_id` from an unauthenticated request body
`functions/api/consents.js:15,21` — when no access token is present, `user_id` can be supplied directly in the POST body and is trusted as-is. Since consent records are the legal/compliance evidence trail (KVKK-equivalent), an unauthenticated caller could attach a fabricated consent record to any real user ID, or spam consent rows for enumerated IDs.
**Recommended fix:** require the caller's own authenticated `user_id` when a session exists, and for the genuinely-anonymous (pre-registration) case, key consent rows by a client-generated anonymous session identifier that is only linked to a real `user_id` after the user authenticates and the linkage is verified server-side.

### P1-8 — No cross-return cumulative-quantity guard
`functions/api/returns.js:56-79` caps a single return request's quantity to the purchased quantity, but does not check quantity already claimed across prior return requests for the same order item. A customer could submit two sequential return requests (e.g. after one is rejected/closed) that together exceed the units actually purchased, since the app-level duplicate guard only blocks by `product_slug` while an active return exists (`functions/api/returns.js:171-175`), not by cumulative quantity across all historical requests.
**Recommended fix:** sum `quantity` across all non-rejected/non-cancelled return requests for the same `order_item_id` before accepting a new one.

### P1-9 — Manual-only Iyzico refunds are undisclosed in the "complete e-commerce" sense (accepted business decision, flagged for completeness)
Fully self-documented in code (`functions/api/admin/refunds.js` sets `metadata: { manual: true, warning: 'Gerçek Iyzico refund API çağrısı yapılmadı.' }`) and explicitly out-of-scope per this project's own Batch 3/4 instructions ("Do not implement automated refunds"). Not a bug, but worth stating plainly for the "complete e-commerce comparison": refund completion today only creates an internal `refund_records` row; a `refund_records.status = 'completed'` can be set **without a `provider_reference`** at all (it's optional), meaning there is no hard requirement that a human attach evidence of the actual bank transfer or Iyzico dashboard refund before marking it done.
**Recommended fix (future batch, requires business sign-off):** integrate the real Iyzico refund API for card payments, and until then, make `provider_reference` (or an equivalent manual evidence field) mandatory when `status = 'completed'`.

### P1-10 — Duplicate `CREATE TABLE IF NOT EXISTS` definitions with divergent columns for `profiles`, `invoice_records`, `customer_coupons`, `inventory_reservations`
Confirmed again in this audit (previously flagged in `COSMOSKIN_PROJECT_MEMORY.md:52` as a "fragile area" but never resolved): `profiles` is `CREATE TABLE`'d differently in `supabase/migrations/20260626_production_launch_readiness.sql:7-23` (has FK to `auth.users`, more columns) vs. `supabase/migrations/20260629_cosmoskin_final_user_acceptance_fix.sql:539-548` (no FK, fewer columns) — because of `IF NOT EXISTS`, whichever runs first on an empty database "wins" and the other silently no-ops, meaning the resulting schema for a *fresh* environment depends on migration file execution order in a way that isn't obvious from reading any single file. Same pattern confirmed for `invoice_records` (two different column sets), `customer_coupons` (two entirely different schemas — `coupon_id`-based vs. `customer_email/title`-based), and `inventory_reservations` (status vocabulary `'active'` vs `'reserved'`, tying back to P0-1).
**Recommended fix:** replace all duplicate `CREATE TABLE IF NOT EXISTS` blocks for these four tables with a single canonical `CREATE TABLE` in an early migration plus `ADD COLUMN IF NOT EXISTS` everywhere else, and add a comment in each superseded file noting it's historical/no-op.

---

## 4. P2 / P3 issues (important but not launch-blocking / polish)

| # | Sev | Issue | Evidence |
|---|-----|-------|----------|
| P2-1 | P2 | `orders.order_number` has no UNIQUE constraint in the migrations-tracked schema (only in the non-migration `schema.sql:98`) | `supabase/migrations/20260629_cosmoskin_checkout_bank_transfer_final_fix.sql:23,43` |
| P2-2 | P2 | `coupon_redemptions` has no UNIQUE constraint on `(user_id, code)`/`(order_id, code)` — double-redemption is prevented only by an application-layer check-then-act read, with a real (if narrow) TOCTOU race window on concurrent checkouts | `supabase/migrations/20260629_cosmoskin_final_user_acceptance_fix.sql:882-906`; `functions/api/_lib/coupons.js:252,277-284` |
| P2-3 | P2 | `coupon_reservations` table is read by validation logic but never written by any `functions/api/**` file — dead/aspirational code path | `functions/api/_lib/coupons.js:203-209` |
| P2-4 | P2 | Reserved coupons on abandoned card checkouts (`payment_status: initiated`, never completed) are never released by any cron — they block WELCOME10 reuse until a manual DB fix | `functions/api/create-checkout.js:828`; no release path found in any cron file |
| P2-5 | P2 | BIRTHDAY10 "used this year" check reads `created_at` first, `used_at` as fallback, while `account/summary.js` UI reads a different set of timestamp columns from `customer_coupons` — two data sources for the same fact | `functions/api/_lib/coupons.js:301-302` vs `functions/api/account/summary.js:259-266` |
| P2-6 | P2 | Two parallel shipment "event" tables exist (`shipment_events` from migrations, `shipping_events` from baseline `schema.sql`) with no documented canonical choice | `supabase/migrations/20260511_phase2_invoice_returns_refunds.sql:120` vs `supabase/schema.sql:865` |
| P2-7 | P2 | `admin/loyalty/adjust-points.js` computes `balance_after` via a naive sum over up to 500 raw ledger rows (ignoring `status`), inconsistent with the canonical status-aware RPC used everywhere else | `functions/api/admin/loyalty/adjust-points.js:18-25` |
| P2-8 | P2 | `functions/api/auth/register.js` has no rate limiting, unlike `consents.js` which does | `functions/api/auth/register.js` (no `assertRateLimit` call found) vs `functions/api/consents.js:10` |
| P2-9 | P2 | Registration/profile accept unbounded JSON in `metadata` (`profile.js:103`) and `answers` (`skin-profile.js:24`) with no size/depth cap, unlike `security.js`'s `safeMetadata` helper | `functions/api/account/profile.js:103`; `functions/api/account/skin-profile.js:24,39` |
| P2-10 | P2 | Return-quantity matching can mis-associate line items when multiple order items share the same `product_slug`, since matching falls back to slug rather than requiring `order_item_id` | `functions/api/returns.js:60-64` |
| P3-1 | P3 | `CANCEL_REQUEST_ORDER_STATUSES` includes `'confirmed'`, a status value checkout never actually writes — dead vocabulary | `functions/api/_lib/order-cancellation.js:20` |
| P3-2 | P3 | `admin/orders/[id]/dhl-shipment.js` and `admin/returns/[id]/dhl-return-shipment.js` are stubs (DHL API not implemented, return 501) | `functions/api/admin/returns/[id]/dhl-return-shipment.js:15-24`; `functions/api/dhl/webhook.js:8` |
| P3-3 | P3 | No email sent for several return/refund intermediate statuses (`under_review`, `in_transit`, `inspection`, `refund_pending`, refund `pending`/`failed`) | `functions/api/admin/returns.js:98-102`; `functions/api/admin/refunds.js` |
| P3-4 | P3 | `README_COMMERCE_SETUP.md`, `README_FINAL_PHASE_5_1_5_2_6.md`, `README_PHASE6_COMMERCE_HARDENING.md`, `README_PHASE3_ACCOUNT_DASHBOARD.md`, and the migrations runbook all disagree on provisioning order (ties to P0-6) | see §11 |
| P3-5 | P3 | No product variant (size/shade) support anywhere in schema or code — single SKU per product slug (likely intentional for this catalog, noted for completeness) | `supabase/migrations/20260510_operations_inventory_orders_shipments.sql:6-8` |
| P3-6 | P3 | No `product_images`, `categories`, or `brands` tables exist anywhere in the repo; imagery is a single `image_url` column, brand is a text column, categorization is via array columns (`product_types`, `skin_types`, `concerns`) — fine for the current static-catalog model, would need real tables if the catalog becomes admin-editable at scale | confirmed via full-repo grep |

---

## 5. Supabase schema gap table

| Table | Exists | Defined in | PK | Notable gaps |
|---|---|---|---|---|
| `profiles` | Y | **Duplicated**, non-migration baseline absent; migrations only (divergent CREATEs) | `id` (=`auth.users.id`) | See P1-10; no `deleted_at`/soft-delete |
| `auth.users` | Y (Supabase built-in) | n/a | — | — |
| Separate `customers` table | **N** | — | — | Identity lives in `profiles` + `orders.customer_*` fields; guest orders have `user_id = NULL` |
| `user_addresses` | Y | `supabase/schema.sql:73` (baseline) + migrations extend | `id` | FK to `auth.users` present in one CREATE, absent in another (`20260629:610`) |
| `products` | Y | **Baseline only** (`schema.sql:10`) — **not in migrations** | `id` | No `product_images`/variants/categories/brands tables |
| `product_images` | **N** | — | — | Does not exist anywhere; `products.image_url` only |
| `product_variants` | **N** | — | — | No variant support |
| `categories` / `brands` | **N** | — | — | Array columns on `products`/`coupons` instead |
| `product_inventory` | Y | `supabase/migrations/20260629...:213-225` | `id` | Legacy parallel `inventory` table also exists in baseline schema (`schema.sql:800`), unused by current code |
| `inventory_reservations` | Y | Migrations (conflicting CREATEs) | `id` | Status vocabulary drift — see P0-1 |
| `orders` | Y | Migrations | `id` | No UNIQUE on `order_number` in tracked migrations (P2-1) |
| `order_items` | Y | Migrations | `id` | No FK to `orders.id` in the migration CREATE (relies on baseline/app discipline) |
| `payments` | Y | Migrations | `id` | No UNIQUE on `provider_payment_id` |
| `shipments` | Y | **Baseline only** — never `CREATE TABLE`'d in migrations, only `ALTER TABLE IF EXISTS` | `id` | Two parallel event tables (`shipment_events` vs `shipping_events`) |
| `order_status_events` | Y | Both baseline and migrations | `id` | Very broad, `NOT VALID` CHECK constraints on `event_type`/`status` |
| `return_requests` | Y | Migrations | `id` | `uq_return_requests_active_order` partial index still keyed to an outdated 4-value status list |
| `return_request_items` | Y | Migrations | `id` | Legacy parallel `return_items` table also exists |
| `return_request_attachments` | Y | Migrations | `id` | **No storage bucket RLS** — see P0-3 |
| `refund_records` | Y | Migrations | `id` | `provider_reference` optional even when `status='completed'` |
| `coupon_redemptions` | Y | Migrations | `id` | No uniqueness constraint (P2-2) |
| `coupons` | Y | Migrations | `id` | Code uniqueness via non-unique index only |
| `loyalty_points_ledger` | Y | Migrations (heavily evolved, hotfixed) | `id` | No CHECK constraint on `status`/`event_type` columns at all |
| `customer_membership_status` | Y | Migrations | `user_id` | — |
| `customer_membership_history` | Y | Migrations | `id` | — |
| `notification_preferences` | Y | Migrations (Batch 1) | `id` (unique `user_id`) | — |
| `support_requests` | Y | **Only in repo-root `COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql`** — not in `supabase/migrations/` at all | `id` | See P0-6 |
| `invoice_records` | Y | Duplicated across baseline + 2 migrations, divergent columns | `id` | — |
| `admin_activity_logs`, `admin_users`, `admin_roles`, `admin_permissions` | Y | Migrations | various | No RLS on `admin_activity_logs`; enforcement gap (P0-5) |
| `membership_levels` | Y | Migrations | `code` | Seeded correctly (6,000/3, 15,000/8) |
| `customer_coupons` | Y | Duplicated, divergent schemas | `id` | See P1-10 |
| `email_events` | Y | Migrations | `id` | — |
| `newsletter_subscribers` | Y | Migrations | `id` (unique lower(email)) | RLS enabled, no policies (service-role only — fine) |
| `legal_consents` (as named) | **N** | `consent_records` + `order_legal_consents` instead | `id` | Naming mismatch only |
| `crm_events` | Y | Migrations | `id` | RLS enabled, no policies |
| `user_favorites` | Y | **Baseline only** — not in migrations | `id` | UNIQUE `(user_id, product_slug)` present |
| `reviews` / `review_images` | Y | **Baseline only** — not in migrations | `id` | Fully-formed RLS + storage policies (best-implemented storage example in the repo) |
| `notifications` (in-app) | Y | **Baseline only** — not in migrations | `id` | — |
| Storage bucket: `return-attachments` | **Comment only, no INSERT/policy SQL** | — | — | See P0-3 |
| Storage bucket: `review-images` | Y, fully implemented | `supabase/phase51_reviews_hardening.sql:11-16,86-98` | — | Use as the template to fix `return-attachments` |

---

## 6. RLS / security gap table

| Table / area | RLS enabled | Policies | Risk |
|---|---|---|---|
| `orders`, `order_items`, `payments`, `shipments`, `product_inventory`, `inventory_reservations`, `coupons`, `coupon_redemptions`, `return_requests`, `refund_records`, and ~20 more commerce tables | Y | **None** — REVOKE ALL from anon/authenticated | Intentional: all API access goes through the Cloudflare Functions service-role client (`functions/api/_lib/supabase.js:18-24`), which bypasses RLS by design. RLS here is defense-in-depth only. **This means every ownership check in the system is an application-code responsibility, not a database guarantee.** |
| `return_request_items`, `return_request_attachments`, `return_status_events` | **No `ENABLE ROW LEVEL SECURITY` found in any migration** | — | If the service-role assumption is ever broken (e.g. a future direct-from-browser Supabase client), these tables would be wide open |
| `admin_activity_logs` | **No RLS** | — | Low risk today (service-role only access) but no defense-in-depth |
| `profiles`, `user_addresses`, `customer_preferences`, `customer_skin_profiles`, `customer_membership_status`, `loyalty_points_ledger`, `customer_coupons`, `notification_preferences`, `invoice_records` | Y | `auth.uid() = user_id` (or `= id`) | Correctly scoped |
| `legal_document_versions` | Y | `is_active = true` (any authenticated/anon reader) | Intentional — public legal doc read |
| Storage: `return-attachments` | **Unknown / not defined in SQL** | **None in SQL** | See P0-3 |
| Storage: `review-images` | Y | Owner-scoped upload/delete, public read | Correct, well-implemented reference pattern |
| `user_addresses` write path | RLS + explicit `GRANT SELECT,INSERT,UPDATE,DELETE ... TO authenticated` | `auth.uid() = user_id` | Acceptable, but combined with a blanket RLS-hardening migration that runs `REVOKE ALL` on other tables, verify actual migration application order didn't leave this table's earlier revoke in place unexpectedly |
| Admin auth | Token-based (`x-admin-token` / signed HMAC session), optional Cloudflare Access | IP-based brute-force throttle present (8 failures/10 min) | See P0-5 — RBAC permission layer is unenforced by default |
| `consents.js` unauthenticated `user_id` | n/a (app-layer, not RLS) | — | See P1-7 |

**No policy in the entire codebase matches by email string when a `user_id` column is available** — all reviewed policies correctly use `auth.uid()`. The one email-based matching pattern found is at the **application layer**, not RLS: `functions/api/invoices.js:10-12` and `functions/api/account/summary.js:79` match orders by `customer_email` **in addition to** `user_id`, which is a deliberate guest-checkout-linking design, not an oversight — but it does mean if a customer's email were ever reused (e.g. two different real people historically shared a company email for guest checkout), one account could see the other's historical orders/invoices. Flagged as a business-decision question in §15, not a coded bug.

---

## 7. Order / payment / inventory lifecycle findings

- **Status vocabulary is wide and mostly reconciled**, but the final, authoritative CHECK constraints (`orders_status_final_chk`, `orders_payment_status_final_chk`, `orders_fulfillment_status_final_chk`, all in `supabase/migrations/20260629_cosmoskin_checkout_bank_transfer_final_fix.sql:192-196`) supersede two earlier, narrower generations (`20260517_checkout_bank_transfer_statuses.sql`, and an intermediate list inside `20260629_cosmoskin_checkout_bank_transfer_final_fix.sql:203-204` itself before being expanded again by `20260629_cosmoskin_final_user_acceptance_fix_v2.sql:950-968`). This drift is resolved **only if migrations apply in filename order on the live DB** — see P0-1/P0-2 for why that assumption needs live verification.
- **`order_status_events` is written for nearly every important transition** (order created, stock reserved, payment authorized, awaiting transfer, paid, shipped, cancelled, cancel-requested), with two notable gaps: (a) event writes are frequently `.catch(() => null)` — best-effort, can silently fail (`functions/api/admin/orders.js:175`, `admin/orders/[id]/status.js` event write); (b) `mark_delivered` in `admin/orders.js:423-429` updates the shipment row and writes `shipment_events` but does **not** clearly write a dedicated `order_status_events` row with `status='delivered'` in that specific branch.
- **Checkout idempotency is solid**: mandatory `idempotency_key` (`create-checkout.js:557-563`), backed by a real unique index (`orders_checkout_idempotency_key_uidx`), with same-key reuse correctly returning the prior order/payment attempt rather than creating a duplicate.
- **iyzico callback idempotency is solid at the RPC layer** (advisory lock + `payment_events` dedup with a partial unique index), but **not fully idempotent end-to-end**: `orders`/`payments` JS-side updates re-run on every callback regardless of the RPC's `claimed` flag, and the whole success flow (RPC → payments update → orders update → event → email → coupon/loyalty finalize) is **not wrapped in one transaction** — a failure partway through (e.g. the JS `orders` update failing after the RPC already converted inventory) leaves stock decremented with an order that may not reflect it.
- **Payment-success failure fallback marks the order paid anyway** (`fulfillment_status='review_required'`, tied to P0-2) rather than holding the order in a pending-reconciliation state — pragmatic (money was captured) but means ops must manually catch these via the `review_required` flag, and today that flag may not even be legal per the DB constraint.
- **Coupon release on iyzico payment failure is missing** — only checkout-initialize failures release the coupon reservation (`create-checkout.js:967,1003`); the iyzico callback's own failure branch releases inventory but not the coupon (no coupon-release call found in `iyzico-callback.js`'s failure path).
- **Bank transfer**: reservation window defaults to 24h (`EFT_RESERVATION_MINUTES=1440`), a real `payments` row is created at checkout, but as detailed in P0-4, admin approval never updates it. No customer self-service "I've paid" confirmation endpoint exists — admin-only.
- **Inventory reservation is atomic** at the RPC layer (`FOR UPDATE` row locking, not a JS read-then-write race) for the reserve step; the pre-check (`validateInventory`) is a separate, non-locking read, so two concurrent shoppers can both pass the pre-check, but the actual reservation RPC is the real gate and should correctly reject the second one on insufficient stock.
- **Reservation expiry exists** (RPC `release_expired_inventory_reservations`, paid orders explicitly excluded from expiry) but its **only invoker is a manual `CRON_SECRET`-protected POST with no scheduler** — tied to P1-2.
- **Stock conversion is designed to be exactly-once** via idempotent RPCs and `payment_events` dedup, contingent on the status-vocabulary issue in P0-1 being resolved.
- **No automated restock on return/refund completion** — `inventory_movements` supports a `return_received` reason and `adjustInventory()` could increment stock, but no audited code path calls it automatically when a return is marked `refunded`/`received`. This is a defined-in-schema-but-unimplemented-in-code gap, not ambiguous.
- **Single-SKU catalog model** — no product variants; likely intentional given the current catalog, noted for completeness (P3-5).
- **Out-of-stock is enforced server-side**, not just client-side, both at pre-check and at the reservation RPC, with Turkish-language errors surfaced through `CheckoutError`.
- **DHL webhook is a stub** (`functions/api/dhl/webhook.js:8`) and DHL shipment creation from admin is also a stub returning 501 — tracking/shipment data entry today is manual-only.

---

## 8. Returns / refunds findings

- Return creation, 14-day window, and hygiene-checklist enforcement are **real server-side checks**, not just UI (`functions/api/returns.js:160-169`), consistent with the prior audit's assessment that this flow was "functional, well-built."
- **Delivered-eligibility gate is looser than its own error copy claims** (P1-4) — accepts `shipped` as sufficient.
- **Attachments**: dual storage (JSONB snapshot on `return_requests` + normalized `return_request_attachments` table), MIME/size validated server-side, but **no actual bucket policy exists** (P0-3) and **no server-side verification that an uploaded object exists/belongs to the caller** before its path is trusted and persisted.
- **Item-level quantity is capped per-request** against the matched order item, but **not cumulatively across multiple requests** for the same item (P1-8).
- **Duplicate-return guard is product-slug-scoped and app-layer only**; the DB-level partial unique index (`uq_return_requests_active_order`) is stale against the current, much larger status enum, so it provides essentially no protection for any of the newer statuses (`return_code_shared`, `in_transit`, `inspection`, etc.) — the app-layer check is doing all the real work here.
- **Admin review flow** covers 13 statuses with full `return_status_events` + `order_status_events` logging on every PATCH, but **emails only fire for `approved`, `return_code_shared`, `rejected`, `refunded`** — customers get no notification for `under_review`, `waiting_customer_ship`, `in_transit`, `received`, `inspection`, or `refund_pending`, which for a 13-status pipeline means most of the journey is silent to the customer.
- **Refunds are entirely manual/reference-only** by explicit, self-documented, business-approved design (no live Iyzico refund API call) — `provider_reference` is optional even for `completed` status (P1-9).
- **Refund completion does trigger proportional loyalty-point reversal** correctly (`functions/api/_lib/loyalty-ledger.js:61-72`), and **does not** update `orders.payment_status`/`status` directly — that's left to the linked `return_requests` row or a separate admin order-status action, which is a reasonable separation of concerns but means an admin must remember to do both.
- **Partial refunds** are supported at the amount level but have no item-level/quantity linkage to what was actually returned — reconciliation between "what came back" and "how much was refunded" is manual/trust-based today.
- **Return via `admin/returns.js` intentionally skips loyalty-ratio calculation**, flagging `requires_manual_loyalty_review` instead of guessing a proportional reversal — a deliberately conservative, correct design choice (per the Batch 4 v1 scope).

---

## 9. Coupons / loyalty findings

**Coupons:**
- WELCOME10's "first successful order" definition is broad and correctly excludes cancelled/failed/refunded orders, and correctly treats reserved-but-abandoned redemptions as blocking reuse — but those abandoned reservations are **never cleaned up by any cron** (P2-4), meaning a customer who starts checkout with WELCOME10 and abandons can be permanently locked out of ever using it, an unintended customer-trust cost of the anti-fraud design.
- BIRTHDAY10 enforces exact calendar day + once-per-year correctly server-side, using **local** date math in the validator (`_lib/coupons.js:95`) vs **UTC** in the birthday-benefits cron — a real but narrow (single-day-around-midnight) timezone edge case.
- Coupon redemption "used" marking is not fully race-protected — no DB uniqueness constraint backs the app-layer check-then-act pattern (P2-2), and admin bank-transfer paid orders never reach the "mark used" step at all (tied to P0-4).
- Coupon expiration and usage-limit checks are genuinely server-side (`_lib/coupons.js:261-263,312-315`), not just displayed.
- "Manual entry only" is a frontend convention; the backend will happily apply any valid `coupon_code` sent in the checkout payload regardless of how the client obtained it — not a security issue (codes aren't secret), just worth noting it's not a backend-enforced anti-auto-apply rule.

**Loyalty:**
- Full ledger-based lifecycle (pending → available → reversed) is real, idempotent (unique `transaction_reference`, advisory locks), and status-aware everywhere it's supposed to be, including redemption (`functions/api/loyalty/redeem.js:50-54`) — this audit independently re-verified the Batch 4 report's claims and found them accurate.
- Tier thresholds (Signature 6,000 TL/3 orders, Elite 15,000 TL/8 orders, product-net-ex-shipping basis) are **consistent across all four locations** checked: `loyalty-config.js`, `account/summary.js`, `account/membership.js`, and the Batch 4 SQL RPC/seed data.
- The one remaining non-status-aware point calculation is `admin/loyalty/adjust-points.js`'s display-only `balance_after` field (P2-7) — cosmetic, not a redemption-affecting bug, since actual redemption always goes through the canonical RPC.
- **The documented delivered+14-day promotion policy does not run automatically anywhere** (P1-1) — the only live trigger is immediate promotion on admin "mark delivered."
- `cron/points-expiry.js` is a stub that expires nothing; no points ever actually expire today despite the ledger schema supporting `expires_at`.
- The manual backfill script (`supabase/scripts/manual/backfill_loyalty_purchase_points_20260704.sql`) is correctly idempotent, correctly creates `pending` (not `available`) rows, and is correctly not referenced/auto-run by any application code — confirmed independently, consistent with the Batch 4 report.

---

## 10. Admin operations findings

- **Every admin route calls `assertAdmin`** except the session-issuance endpoint itself (expected) — no route was found missing the baseline auth guard.
- **RBAC (`requireAdminPermission`) is used in only 6 of 31 files**, and its underlying permission check silently allows everything when `admin_users` isn't populated (P0-5) — today's admin model is effectively a single flat shared-token credential regardless of the well-designed roles/permissions schema that exists.
- **Admin activity logging covers 5 of 31 files** (P1-6) — most impactful admin actions (order status change, bank-transfer approval, stock adjustment via the products route, invoice creation, customer/user management) leave no queryable "who did this and why" trail beyond `order_status_events.source='admin'`, which usually does not capture individual admin identity.
- **Order status management triggers loyalty hooks consistently** across both admin order-mutation routes, but only one of the two also handles shipment/email/timestamp side effects (P1-3).
- **Manual payment approval (bank transfer) is the single biggest inconsistency found in this audit** relative to the card-payment path (P0-4).
- **Shipping/tracking entry does notify the customer by email by default**, with an explicit opt-out flag (`suppress_customer_email`) that is itself logged when used — good design.
- **Stock adjustment logging is inconsistent**: the dedicated inventory-adjustment routes log to `inventory_movements` correctly; the general product-edit route does not (P1-5).
- **Loyalty admin adjustments are correctly ledger-logged** with `event_type='admin_adjustment'` and cross-logged to `admin_activity_logs` — one of the better-audited admin actions in the system.
- **Admin dashboard exposes aggregate counts only**, no cross-customer PII leak found in any single-customer-scoped response; the customer list endpoint is intentionally multi-customer (admin-facing) and not a leak.

---

## 11. Migration risks

- **25 tracked migrations are internally mostly additive and idempotent** (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` dominate), with a few explicit, intentional exceptions: a constraint-drop-and-recreate loop in `20260629_cosmoskin_checkout_bank_transfer_final_fix.sql:177-196` (safe to re-run, drops before adding), and dedup `DELETE FROM` statements for `product_inventory`/`payment_bank_accounts`/`profiles` duplicate rows (also intentional one-time cleanup, not a re-run hazard since they're conditioned on duplicates existing).
- **No `DROP TABLE`, `TRUNCATE`, or `DROP SCHEMA`** exists in any of the 25 migrations. The only `DROP COLUMN` usages are all `IF EXISTS`-guarded and target superseded generated-alias columns being recreated as proper `GENERATED` columns — safe.
- **The real risk is not destructive SQL, it's incompleteness and duplication**: migrations alone cannot provision `products`/`shipments`/`user_favorites`/`notifications`/`reviews`/`support_requests` (P0-6), and four tables have divergent duplicate `CREATE TABLE IF NOT EXISTS` definitions whose final shape depends on execution order (P1-10, includes P0-1's reservation-status root cause).
- **CHECK constraint drift across migration generations** exists for `orders.status`, `orders.payment_status`, `orders.fulfillment_status`, and `payments.status` — each has at least one earlier, narrower migration superseded by a later, broader one. As long as migrations apply in filename-sorted order on the live database (which the existing runbook assumes), the final constraint is the broad one; this has not been independently verified against the live database's actual `information_schema.check_constraints` as part of this read-only, file-based audit.
- **Three `hotfixes/*.sql` files** document real past production incidents (a failed index creation on a not-yet-existent column, a `loyalty_points_ledger` missing `user_id`) whose logic is now mostly duplicated inside later proper migrations, but the hotfix files themselves remain undocumented one-offs outside the tracked runbook — fine for the current live database (already past those incidents) but a trap for anyone rebuilding from scratch.
- **No single document** ties together baseline SQL → migrations → hotfixes → verification scripts → manual backfill scripts into one authoritative provisioning sequence (P0-6/P3-4). At least five different README files make five different, partially contradictory claims about what needs to run.
- **`CREATE OR REPLACE FUNCTION` history** shows healthy iteration for the inventory RPCs (idempotency added over time) but the specific `process_iyzico_payment_success` vs. `reserve/release/convert_order_inventory` divergence (P0-1) is the one case where two "final" versions of related logic were never reconciled with each other.

---

## 12. Recommended implementation batches

Ordered by risk-reduction priority; each batch should get its own scoped approval and validator, following this project's established pattern.

**Batch 5 — Payment/inventory correctness verification & fix (P0-1, P0-2)**
Verify live `pg_proc`/`information_schema.check_constraints` state against the two identified mismatches; ship one additive migration that reconciles `process_iyzico_payment_success` reservation-status vocabulary and adds `'review_required'` to the fulfillment CHECK constraint (or changes the code to use an allowed value). Add integration tests that exercise reserve → pay → convert end-to-end against a real Postgres instance.

**Batch 6 — Bank-transfer payment-confirmation parity (P0-4)**
Extract `finalizeCommerceAfterPayment()` into a shared, payment-method-agnostic helper; wire it into the admin "mark bank transfer paid" action so `payments`, coupon `used` state, invoice shell, and shipment/CRM/email hooks all fire identically to the card path.

**Batch 7 — Return-attachment storage security (P0-3)**
Create the `return-attachments` bucket with real `storage.buckets`/`storage.objects` SQL (mirroring `review-images`), add server-side upload-existence/ownership verification in `returns.js`, and sign customer-facing attachment URLs the same way the admin endpoint already does.

**Batch 8 — Admin RBAC enforcement (P0-5, P1-6)**
Seed `admin_users` for real operators, flip `hasAdminPermission`'s unmatched-caller default from allow to deny, expand `requireAdminPermission` coverage to refunds/loyalty-adjust/order-status/inventory-adjust, and wrap the shared admin handler so every mutating action logs to `admin_activity_logs` by default.

**Batch 9 — Scheduled jobs (P1-1, P1-2)**
Stand up a scheduled Worker (or extend `automation/cron-reminders`) to actually invoke `release-expired-inventory`, `recalculate-memberships`, and `cosmoskin_promote_due_loyalty_points` on real schedules; decide and implement real `points-expiry` rules before scheduling that one.

**Batch 10 — Schema consolidation & provisioning documentation (P0-6, P1-10, P3-4)**
Produce one authoritative `SUPABASE_PROVISIONING.md`; resolve the four duplicate-CREATE-TABLE tables (`profiles`, `invoice_records`, `customer_coupons`, `inventory_reservations`) into single canonical definitions; fold `support_requests` into a tracked migration.

**Batch 11 — Order-status-path consolidation (P1-3, P1-5)**
Merge `admin/orders.js` and `admin/orders/[id]/status.js` order-mutation logic into one function; route `admin/products.js` stock writes through the audited `setInventory()` helper.

**Batch 12 — Coupon/return hardening (P2-2, P2-4, P1-8, P1-4)**
Add DB uniqueness for coupon redemption, a cron to release abandoned card-checkout coupon reservations, cumulative return-quantity validation, and tighten the return "delivered" eligibility gate.

**Batch 13 — Consent endpoint authentication (P1-7)**
Require authenticated `user_id` for consent writes; design an anonymous-session linkage model for pre-registration consent capture if that flow is genuinely needed.

---

## 13. Exact files likely to change later

- `supabase/migrations/` — new additive migration(s) for: `process_iyzico_payment_success` reservation-status fix, `orders_fulfillment_status_final_chk` addition, `return-attachments` storage bucket + policies, `coupon_redemptions` uniqueness, `admin_activity_logs` RLS, consolidated `profiles`/`invoice_records`/`customer_coupons`/`inventory_reservations` canonical definitions, tracked `support_requests` table.
- `functions/api/iyzico-callback.js` — `finalizeCommerceAfterPayment()` extraction for shared use.
- `functions/api/admin/orders.js`, `functions/api/admin/orders/[id]/status.js` — bank-transfer parity, consolidation.
- `functions/api/returns.js`, `functions/api/admin/returns.js` — attachment verification/signing, cumulative-quantity guard, delivered-gate tightening.
- `functions/api/_lib/admin-audit.js`, `functions/api/_lib/admin.js` — RBAC default flip, shared audit-logging wrapper.
- `functions/api/admin/products.js`, `functions/api/_lib/inventory.js` — route stock writes through the audited helper.
- `functions/api/consents.js` — authenticated user_id requirement.
- `functions/api/cron/release-expired-inventory.js`, `recalculate-memberships.js`, `points-expiry.js` — real expiry logic, scheduler wiring.
- New file: a scheduled Worker (e.g. `automation/cron-commerce/`) analogous to `automation/cron-reminders/`.
- New doc: `SUPABASE_PROVISIONING.md`.

---

## 14. Tests / validation scripts needed

- Live-database verification query (not a file change, an operational step): confirm the actual deployed body of `process_iyzico_payment_success` and the actual `orders_fulfillment_status_final_chk` allowed-value list via `information_schema`/`pg_proc`, before Batch 5 work starts.
- `node --test` integration test: reserve → pay via iyzico callback → assert `product_inventory.stock_on_hand`/`stock_reserved` change exactly once, `inventory_reservations.status` ends `converted`.
- Integration test: admin bank-transfer "mark paid" → assert `payments.status='paid'`, `coupon_redemptions.status='used'` (if a coupon was used), an `invoice_records` shell exists — mirroring the existing iyzico success test.
- Integration test: submit a return attachment with a `file_path` pointing to a non-existent/foreign-owned object → expect rejection (once P0-3 is fixed).
- Integration test: two sequential return requests on the same order item exceeding purchased quantity → expect rejection (once P1-8 is fixed).
- `scripts/validate-*-batch-5..13-*.mjs` — one per batch above, following this project's established validator pattern (syntax checks, behavioral greps, prior-batch regression guards).
- Admin RBAC test: authenticate as a token holder with no matching `admin_users` row, attempt a permission-gated action → expect denial (once P0-5 default flips).
- Cron-wiring smoke test: manually POST each `/api/cron/*` endpoint with `CRON_SECRET` and confirm expected side effects, then confirm the new scheduler actually invokes them on schedule in a staging environment.

---

## 15. Questions requiring business decision

1. **Bank-transfer payment finalization parity (P0-4):** Should bank-transfer orders get the exact same coupon/invoice/CRM/email finalization as card orders, or is a lighter-weight bank-transfer flow intentional? If intentional, the `payments` row inconsistency should at least be resolved (e.g. explicitly close it out) for accounting cleanliness.
2. **Loyalty promotion policy (P1-1):** Is "available immediately when admin marks delivered" the actual intended v1 policy, or must the 14-day hold be enforced before this goes further? This determines whether Batch 9 needs to build a real scheduler or just correct the documentation.
3. **Points expiry (`points-expiry.js` is currently a stub):** What is the actual desired expiry rule (e.g. points expire N months after being earned/becoming available)? Needs a concrete rule before it can be implemented or scheduled.
4. **Refund evidence requirement (P1-9):** Should `provider_reference` (or equivalent manual evidence) become mandatory before a refund can be marked `completed`? This is a process/compliance decision, not just a code change.
5. **Guest/registered order linkage by email (§6):** Is it acceptable that orders and invoices are matched by `customer_email` in addition to `user_id` (meaning a changed or reused email could surface another party's historical order/invoice on a different account)? If not, a stricter user_id-only policy (with a separate, explicit "claim my guest orders" flow) may be needed.
6. **Admin RBAC rollout (P0-5, Batch 8):** Who are the real admin operators today, and what `admin_users`/role rows need to be seeded before the RBAC default can safely flip from allow-all to deny-when-unmatched? This needs an operational rollout plan, not just a code change, to avoid locking out active admins.
7. **Return delivered-eligibility (P1-4):** Should returns genuinely be blockable until `delivered_at` is set, or is allowing a return request while an order is merely `shipped` an intentional customer-friendliness choice (e.g. for pre-emptive "wrong item" reports before arrival)? The current error copy implies the former; the code implements the latter.
8. **Database provisioning ownership (P0-6, Batch 10):** Who owns writing and maintaining the single authoritative provisioning document, and is there an appetite to actually run a from-scratch provisioning test against a throwaway Supabase project to validate it, rather than relying on the always-already-running production database?
9. **Consent endpoint anonymous writes (P1-7):** Is the ability to record a consent for an unauthenticated visitor before registration a real, needed product flow (e.g. newsletter opt-in before signup)? If yes, what identifier should anchor that anonymous record instead of a client-trusted `user_id`?
10. **DHL integration (P3-2):** Is real DHL API integration (label creation, tracking webhook, return-shipment creation) still planned, or is manual tracking-number entry the accepted permanent operating model?

---

*Audit complete. No files were modified, no migrations were created, and no fixes were implemented as part of this pass, per the read-only scope of this request.*
