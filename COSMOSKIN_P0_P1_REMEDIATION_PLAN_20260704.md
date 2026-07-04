# COSMOSKIN — P0/P1 Remediation Plan

**Date:** 2026-07-04
**Source:** `COSMOSKIN_FULL_COMMERCE_SUPABASE_AUDIT_20260704.md`
**Type:** Planning document only. No files modified, no migrations created, no code written.
**Scope:** All 6 P0 issues and all 10 P1 issues from the full audit. P2/P3 items are explicitly excluded from this plan per instruction.

This plan does not implement anything. Each batch below still requires its own explicit approval before work starts, consistent with how Batches 1–4 were run in this project.

---

## How to read this plan

Each issue lists:
1. Issue title
2. Why it matters
3. Affected files
4. Affected Supabase tables/functions/policies
5. Category — `Database/Schema`, `API`, `RLS/Security`, or `Operational`
6. Exact proposed fix (described, not implemented)
7. Risk level (of the fix itself, not the issue)
8. Whether a migration is needed
9. Tests/validators needed
10. Recommended implementation batch

Issues are grouped into six batches as requested. Batch letters are independent of the audit's own "Batch 5–13" numbering (§12 of the audit) — this plan supersedes that numbering with the requested A–F grouping.

| Batch | Theme | P0 items | P1 items | Item count |
|---|---|---|---|---|
| A | RLS/security and RBAC critical fixes | P0-3, P0-5 | P1-6, P1-7 | 4 |
| B | Order/payment/inventory lifecycle fixes | P0-1, P0-2 | P1-3, P1-5 | 4 |
| C | Bank transfer finalization consistency | P0-4 | — | 1 |
| D | Return/refund/coupon/loyalty consistency | — | P1-4, P1-8, P1-9 | 3 |
| E | Cron/unwired job operationalization | — | P1-1, P1-2 | 2 |
| F | Migration/baseline schema reconciliation | P0-6 | P1-10 | 2 |

**Suggested cross-batch sequencing:** A and F should start first and can run in parallel — A is pure security/RBAC (no payment logic touched), F is schema documentation/consolidation (no runtime behavior changed for already-provisioned environments). B should follow immediately after, since P0-1 requires a live-database verification step that should happen before any other payment-path change is layered on top of it. C depends on the shared helper extracted in B (both touch payment finalization) so should follow B. D and E are independent of the others and of each other, and can run any time after A.

---

## Batch A — RLS/security and RBAC critical fixes

### A1. P0-5 — Admin RBAC is self-documented as unenforced

**1. Issue title:** Admin permission checks default to allow-all when `admin_users` is unpopulated.

**2. Why it matters:** Any holder of the shared `ADMIN_TOKEN` currently has full access to refunds, loyalty adjustments, order mutation, and customer data, regardless of the role system (`owner/operations/warehouse/customer_support/content_editor`) the admin UI implies exists. The code's own comment calls this a "P0 gate." This is the highest-leverage security fix in the whole audit because it affects every admin-authenticated action, not just one endpoint.

**3. Affected files:** `functions/api/_lib/admin-audit.js`, `functions/api/_lib/admin.js`, and every file under `functions/api/admin/**` that should eventually call `requireAdminPermission` instead of only `assertAdmin` (currently only 6 of 31 do).

**4. Affected Supabase tables/functions/policies:** `admin_users`, `admin_roles`, `admin_permissions` (read by `hasAdminPermission`); no RLS policies involved (service-role access only).

**5. Category:** RLS/Security (application-layer RBAC, not database RLS, but same trust boundary).

**6. Exact proposed fix:**
   - Step 1 (operational, no code change): populate `admin_users` with a row for every real admin operator, with the correct `role_code`, before touching the code default.
   - Step 2 (code change, gated on Step 1 being complete in production): flip `hasAdminPermission()`'s behavior for an unmatched caller from `return true` to `return false`, so an admin identity with no `admin_users` row is denied rather than allowed.
   - Step 3 (code change): expand `requireAdminPermission` calls to the highest-blast-radius routes first — `admin/refunds.js`, `admin/loyalty/adjust-points.js` (already has it), `admin/orders.js`, `admin/orders/[id]/status.js`, `admin/inventory/adjust.js` — before rolling out to the remaining routes.
   - Do not change the underlying token-issuance mechanism (`assertAdmin`, HMAC session signing) in this batch — only the permission-check default and its coverage.

**7. Risk level:** High if sequenced wrong (flipping the default before `admin_users` is fully populated would lock out active admins mid-shift). Low if Step 1 is verified complete first.

**8. Migration needed:** No schema change required — `admin_users`/`admin_roles`/`admin_permissions` tables already exist. This is a data-seeding operation plus a code change, not a migration.

**9. Tests/validators needed:** An integration test that authenticates with a token whose identity has no `admin_users` row and confirms a permission-gated action is denied (expect this test to fail today, pass after the fix). A separate smoke test run against the real admin roster in staging before production rollout, confirming every currently-active admin still has access after Step 1.

**10. Recommended implementation batch:** A.

---

### A2. P0-3 — `return-attachments` storage bucket has no RLS policy anywhere in tracked SQL

**1. Issue title:** Return-attachment storage bucket is undefined/unprotected in version-controlled SQL.

**2. Why it matters:** Customer-submitted return photos/videos (which can show faces, home interiors, or addresses on packaging) are either currently un-uploadable (broken feature) or exposed to anyone who can guess/enumerate a storage path (privacy leak), because no `storage.buckets`/`storage.objects` SQL exists for this bucket — only a code comment telling an operator to create it manually. The customer-facing read path also doesn't sign URLs (only the admin path does).

**3. Affected files:** `functions/api/returns.js` (accepts unverified `file_path`/`file_url`, unsigned customer read), `functions/api/admin/returns.js` (already signs correctly — reference implementation), `functions/api/_lib/supabase.js` (`createSignedStorageUrl` helper, already exists and is correct).

**4. Affected Supabase tables/functions/policies:** New `storage.buckets` row for `return-attachments`; new `storage.objects` policies (owner-scoped insert/select); `return_request_attachments` table (unchanged schema, but its `file_path` values become subject to the new verification step).

**5. Category:** RLS/Security (Database/Schema for the bucket + policy creation specifically).

**6. Exact proposed fix:**
   - New additive migration: `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('return-attachments', 'return-attachments', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','video/mp4'])` guarded with `ON CONFLICT DO NOTHING`, plus `storage.objects` policies mirroring the `review-images` pattern exactly: authenticated INSERT scoped to `auth.uid()::text = (storage.foldername(name))[1]`, and a SELECT policy scoped the same way (no public read, unlike reviews, since return attachments are private).
   - Code change in `functions/api/returns.js`: before persisting a client-supplied `file_path` to `return_request_attachments`, verify the object exists in the bucket and its folder prefix matches the authenticated user's ID (a lightweight Storage API `HEAD`/list call using the service-role key).
   - Code change in `functions/api/returns.js`'s customer-facing GET: sign attachment URLs the same way `functions/api/admin/returns.js` already does, instead of returning raw/unsigned rows.

**7. Risk level:** Medium. Touches a live, working feature (returns), so the existence-verification step must fail open gracefully (log + allow) initially if there's any doubt about the object-check reliability, then tighten once confirmed safe in staging.

**8. Migration needed:** Yes — one additive migration for the bucket + policies.

**9. Tests/validators needed:** Integration test that submits a return with a `file_path` pointing to a non-existent or foreign-owned object and expects rejection. Manual QA: upload a real return attachment as a test customer, confirm it's retrievable only by that customer (signed URL) and not by direct bucket path guessing. Validator script confirming the new migration includes the bucket INSERT and both policies (grep-based, following this project's existing validator pattern).

**10. Recommended implementation batch:** A.

---

### A3. P1-6 — Admin activity logging covers only 5 of 31 admin route files

**1. Issue title:** Most admin mutations are not written to the admin audit log.

**2. Why it matters:** Order status changes, bank-transfer approvals, stock adjustments via `inventory/adjust.js`, invoice creation, and customer/user management leave no queryable "who did this and why" trail beyond `order_status_events.source='admin'`, which usually doesn't capture individual admin identity. This is an accountability gap that becomes more important the moment Batch A1's RBAC tightening is live, since knowing who has which permission is only half the story — knowing who used it is the other half.

**3. Affected files:** `functions/api/_lib/admin-audit.js` (the `recordAdminActivity` helper and where it's wired in), and every admin route file that currently mutates state without calling it — notably `admin/orders.js`, `admin/orders/[id]/status.js`, `admin/inventory/adjust.js`, `admin/invoices.js`, `admin/customers.js`, `admin/users.js`.

**4. Affected Supabase tables/functions/policies:** `admin_activity_logs` (write target); no RLS change needed (already service-role only, correctly).

**5. Category:** Operational (audit/accountability), implemented via API changes.

**6. Exact proposed fix:** Introduce a shared wrapper (e.g. a higher-order function or a call at the top of the existing admin request-handling helper) that automatically writes to `admin_activity_logs` for every successful mutating admin request (PATCH/POST/DELETE), capturing actor identity, route, and a redacted summary of the change, rather than requiring each of the 31 files to opt in individually. Existing explicit `recordAdminActivity` calls (5 files) can remain as-is or be superseded by the wrapper — decide during implementation whether to keep the manual calls for extra detail (e.g. `reason` on loyalty adjustments) or replace them.

**7. Risk level:** Low — additive logging only, doesn't change any admin action's actual behavior or response.

**8. Migration needed:** No — `admin_activity_logs` table already exists with the right shape.

**9. Tests/validators needed:** Integration test asserting that a representative sample of admin mutations (order status change, stock adjust, invoice create) each produce exactly one new `admin_activity_logs` row. Validator script grepping that no new admin route file is added without the shared wrapper going forward (regression guard for future admin routes).

**10. Recommended implementation batch:** A.

---

### A4. P1-7 — `consents.js` accepts an arbitrary `user_id` from an unauthenticated request body

**1. Issue title:** Consent records can be attached to an arbitrary user ID without authentication.

**2. Why it matters:** Consent records are the legal/compliance evidence trail (KVKK-equivalent). An unauthenticated caller supplying `user_id` directly in the POST body means anyone could fabricate a consent record against a real user's ID, or spam consent rows for enumerated/guessed IDs — a legal-exposure and data-integrity risk, not just a technical one.

**3. Affected files:** `functions/api/consents.js`.

**4. Affected Supabase tables/functions/policies:** `consent_records` (write target; RLS enabled with no customer-facing policies today, service-role only).

**5. Category:** API / RLS-adjacent security (application-layer trust boundary, not a database RLS policy issue).

**6. Exact proposed fix:** When an access token is present, always use the authenticated `user_id` derived from the token and ignore any `user_id` supplied in the body. For the genuinely-anonymous pre-registration case (if that flow is actually needed — see the corresponding business question in the audit), replace the client-trusted `user_id` with a client-generated anonymous session identifier that is only linked to a real `user_id` after the user authenticates, with that linkage verified server-side at link time (not trusted from the client).

**7. Risk level:** Low-medium — need to confirm with the business whether any current legitimate flow (e.g. newsletter opt-in before signup) depends on the current unauthenticated `user_id` parameter before removing it outright (see Question 9 in the audit).

**8. Migration needed:** No, unless the anonymous-session-linkage design requires a new column (e.g. `consent_records.anonymous_session_id`) — in which case a small additive migration would be needed.

**9. Tests/validators needed:** Integration test confirming an authenticated request's `user_id` always comes from the token, never the body, even if the body supplies a different `user_id`. Integration test confirming an unauthenticated request without the new anonymous-session mechanism is rejected rather than silently accepted with a client-supplied ID.

**10. Recommended implementation batch:** A.

---

## Batch B — Order/payment/inventory lifecycle fixes

### B1. P0-1 — Inventory reservation status vocabulary mismatch between live SQL functions

**1. Issue title:** `process_iyzico_payment_success` may still check reservation `status = 'active'` while checkout reserves stock as `status = 'reserved'`.

**2. Why it matters:** This sits directly on the card-payment → stock-decrement path, which is presumably the majority of orders. If the live function body is the older version, card-payment stock conversion correctness for the entire store cannot be guaranteed — this is the single highest-leverage correctness risk in the audit, and it cannot be resolved by reading files alone.

**3. Affected files:** `functions/api/iyzico-callback.js` (caller), no direct JS fix expected — root cause is SQL-only.

**4. Affected Supabase tables/functions/policies:** Functions `process_iyzico_payment_success`, `reserve_order_inventory`, `release_order_inventory`, `convert_order_inventory`; table `inventory_reservations` (status column).

**5. Category:** Database/Schema (SQL function correctness).

**6. Exact proposed fix:**
   - Step 1 (mandatory, before any code/migration change): run a live-database read-only query (`select prosrc from pg_proc where proname = 'process_iyzico_payment_success'`) to determine which version of the function is actually installed today.
   - Step 2: if the live function still references `status = 'active'`, ship one additive migration that `CREATE OR REPLACE FUNCTION process_iyzico_payment_success(...)` with the internal reservation-status check updated to `'reserved'`, matching the June-29 "final fix" vocabulary used by `reserve/release/convert_order_inventory`. Do not change the function's external signature or its transactional/advisory-lock behavior — only the internal status-string comparison.
   - Step 3: after deploying, re-run the same live-database query to confirm the new body is installed, then run the reserve→pay→convert integration test (see below) against a staging order.

**7. Risk level:** High if done blind (this is the payment-critical path); low if Step 1's live verification is done first and the fix is scoped to exactly the string-comparison change identified.

**8. Migration needed:** Yes, conditional on Step 1's finding — only needed if the live function is confirmed to be the stale version.

**9. Tests/validators needed:** `node --test` integration test: reserve → pay via iyzico callback → assert `product_inventory.stock_on_hand`/`stock_reserved` both change exactly once and `inventory_reservations.status` ends as `converted`. Run this test both before and after the fix to have before/after evidence.

**10. Recommended implementation batch:** B.

---

### B2. P0-2 — `fulfillment_status = 'review_required'` is written but not in the DB CHECK constraint

**1. Issue title:** The payment-success error-recovery branch may write a value the database itself doesn't allow.

**2. Why it matters:** This is precisely the safety-net branch meant to handle an inventory-RPC failure during an otherwise-successful payment. If the live CHECK constraint (`orders_fulfillment_status_final_chk`) is enforced and doesn't include `'review_required'`, this exact recovery path throws a database error while the customer's card has already been charged — turning a handled edge case into an unhandled one, at the worst possible moment.

**3. Affected files:** `functions/api/iyzico-callback.js` (the write site).

**4. Affected Supabase tables/functions/policies:** `orders.fulfillment_status` column and its CHECK constraint `orders_fulfillment_status_final_chk`.

**5. Category:** Database/Schema (CHECK constraint) with a possible API-side alternative.

**6. Exact proposed fix:** Two valid options, either is acceptable:
   - Option 1 (schema change): additive migration that alters `orders_fulfillment_status_final_chk` to include `'review_required'` in its allowed list.
   - Option 2 (code change, no migration): change `functions/api/iyzico-callback.js` to write an already-allowed value (`'unfulfilled'`) for `fulfillment_status` in this branch, and move the "needs manual review" signal into `orders.metadata.review_required = true` instead, which any JSONB column can hold without a constraint change.
   Recommend Option 1 for clarity (the status value is self-describing and semantically distinct from `'unfulfilled'`), but Option 2 is lower-risk if there's any hesitation about touching a CHECK constraint on the live `orders` table.

**7. Risk level:** Low for Option 2 (JS-only change); low-medium for Option 1 (altering a live CHECK constraint, but purely additive to the allowed-values list, not a behavior change for any existing row).

**8. Migration needed:** Yes for Option 1; no for Option 2.

**9. Tests/validators needed:** Integration test that forces the inventory RPC to throw during a simulated iyzico success callback, then asserts the resulting `orders` row update succeeds (does not throw) and that whichever value/flag is chosen is queryable for an ops "needs review" report.

**10. Recommended implementation batch:** B.

---

### B3. P1-3 — Two divergent admin "change order status" code paths with different side effects

**1. Issue title:** `admin/orders.js` PATCH and `admin/orders/[id]/status.js` PATCH produce different customer-visible outcomes for what looks like the same admin action.

**2. Why it matters:** Only one of the two paths sends customer emails, updates shipment records, sets `paid_at`/`delivered_at` timestamps, and writes richer `order_status_events` payloads. Whichever the admin UI happens to call determines whether the customer is notified and whether audit timestamps are recorded — a latent, hard-to-notice inconsistency that could mean customers silently miss status emails depending on which internal route handled their order.

**3. Affected files:** `functions/api/admin/orders.js`, `functions/api/admin/orders/[id]/status.js`.

**4. Affected Supabase tables/functions/policies:** `orders`, `order_status_events`, `shipments`, `shipment_events` (writes vary between the two routes today).

**5. Category:** API (consolidation of duplicated business logic).

**6. Exact proposed fix:** Extract the richer logic currently only in `admin/orders.js` PATCH (email sending, shipment handling, timestamp setting, full event payload) into a single shared function, and have both `admin/orders.js` and `admin/orders/[id]/status.js` call it, so there is exactly one place that decides what side effects fire for a given status transition. Do not change either route's external request/response contract in this pass — only unify the internal implementation.

**7. Risk level:** Medium — requires care to ensure the admin UI's existing calls to either route keep working identically for the transitions they already exercise correctly, while gaining the previously-missing side effects for the other route's transitions.

**8. Migration needed:** No.

**9. Tests/validators needed:** Integration tests exercising every documented status transition through both routes, asserting identical side effects (email sent, event written, timestamps set) regardless of which route was called.

**10. Recommended implementation batch:** B.

---

### B4. P1-5 — Admin stock edits via `admin/products.js` bypass the inventory movement audit trail

**1. Issue title:** One of two code paths that can change `product_inventory` doesn't log to `inventory_movements`.

**2. Why it matters:** Stock-discrepancy investigations will have a blind spot for any adjustment made through the product-edit route instead of the dedicated inventory-adjustment route, since only the latter records `reason`/`note`/`created_by` for every change.

**3. Affected files:** `functions/api/admin/products.js`, `functions/api/_lib/inventory.js` (the `setInventory`/`adjustInventory` helpers that already do this correctly for the other path).

**4. Affected Supabase tables/functions/policies:** `product_inventory`, `inventory_movements`.

**5. Category:** API (route consistency), operational (audit trail).

**6. Exact proposed fix:** Route all `product_inventory` writes inside `admin/products.js` through the existing `setInventory()`/`adjustInventory()` helper instead of direct `updateRows`/`insertRow` calls, so every stock change — regardless of which admin screen triggered it — produces exactly one `inventory_movements` row.

**7. Risk level:** Low — the helper already exists and is proven via the other code path; this is a call-site change, not new logic.

**8. Migration needed:** No.

**9. Tests/validators needed:** Integration test confirming a stock edit made through `admin/products.js` now produces an `inventory_movements` row identical in shape to one made through `admin/inventory/adjust.js`.

**10. Recommended implementation batch:** B.

---

## Batch C — Bank transfer finalization consistency

### C1. P0-4 — Admin bank-transfer payment confirmation does not reach payment/coupon/invoice/shipment finalization

**1. Issue title:** Manually approving a bank-transfer order does not run the same finalization steps as a successful card payment.

**2. Why it matters:** Bank transfer (EFT/Havale) is a standard, commonly used payment method in Turkish e-commerce — this is not an edge case. Today, every bank-transfer order approved by an admin ends up with a `payments` row permanently stuck at `awaiting_transfer`, a coupon redemption that never gets marked `used`, no invoice shell, and none of the shipment/CRM/Brevo hooks the card path runs. This undermines financial reconciliation and coupon-usage reporting for every bank-transfer order, and is the single biggest cross-path inconsistency found in the audit.

**3. Affected files:** `functions/api/admin/orders.js` (the "mark bank transfer paid" action), `functions/api/iyzico-callback.js` (source of the correct, more complete logic via `finalizeCommerceAfterPayment()`).

**4. Affected Supabase tables/functions/policies:** `payments`, `coupon_redemptions`, `customer_coupons`, `invoice_records`, `shipments` (via `ensureShipmentShell`), `order_status_events`.

**5. Category:** API (shared logic extraction), with downstream data-integrity consequences.

**6. Exact proposed fix:** Extract `finalizeCommerceAfterPayment()` (currently only called from `functions/api/iyzico-callback.js`) into a payment-method-agnostic shared helper that takes an order ID and performs: `payments` row update to `paid`, coupon redemption finalization to `used` + `customer_coupons` update, invoice shell creation, `ensureShipmentShell`, and the CRM/Brevo/email hooks. Call this shared helper from both the iyzico success path and the admin "mark bank transfer paid" action in `admin/orders.js`, so both payment methods converge on identical finalization regardless of entry point. Do not change the actual payment confirmation trigger (still admin-only for bank transfer, still callback-driven for card) — only the finalization steps that run once payment is confirmed.

**7. Risk level:** Medium-high — this touches the exact code path (`finalizeCommerceAfterPayment`) that already works correctly for card payments, so the refactor must be careful not to introduce a regression there while extending it to bank transfer. Should be tested thoroughly against the card path before and after to confirm no behavior change for card orders.

**8. Migration needed:** No schema change required — this reuses existing tables and existing insert/update logic, just triggered from a second call site.

**9. Tests/validators needed:** Integration test: admin bank-transfer "mark paid" → assert `payments.status='paid'`, `coupon_redemptions.status='used'` (if a coupon was used), an `invoice_records` shell exists — mirroring the existing card-payment test. Regression test: re-run all existing card-payment integration tests unchanged to confirm the extraction didn't alter card-path behavior.

**10. Recommended implementation batch:** C.

---

## Batch D — Return/refund/coupon/loyalty consistency

### D1. P1-4 — Return "delivered" eligibility gate accepts `shipped`, contradicting its own error message

**1. Issue title:** A shipped-but-undelivered order can pass the "must be delivered" return-eligibility check.

**2. Why it matters:** The customer-facing rejection copy explicitly promises "after delivery," but the actual gate (`isDelivered()`) also accepts `status`/`fulfillment_status = 'shipped'` with no `delivered_at` set. A customer could file — and have admin process — a return for an order that hasn't arrived yet, and the 14-day window's anchor timestamp can also silently shift if `delivered_at` is missing (falling back through `fulfilled_at → updated_at → created_at`).

**3. Affected files:** `functions/api/returns.js` (`isDelivered()`, `withinReturnWindow()`, `deliveredAt()`).

**4. Affected Supabase tables/functions/policies:** `orders` (`status`, `fulfillment_status`, `delivered_at`, `fulfilled_at` columns read, not written, by this check).

**5. Category:** API (business-rule tightening).

**6. Exact proposed fix:** Change the eligibility gate to require `delivered_at IS NOT NULL` (or an explicit `fulfillment_status = 'delivered'`) as the sole condition, removing `'shipped'` from the accepted set — pending the business-decision question in the audit about whether early return-request filing while shipped is actually wanted. If the business does want early filing, keep it, but fix the customer-facing copy to match reality instead of tightening the code, and stop letting the return window's start-date silently drift by removing the `updated_at`/`created_at` fallbacks and instead blocking window calculation entirely (with an admin-visible flag) when `delivered_at` is genuinely missing.

**7. Risk level:** Low-medium — a business decision is needed first (see business question in the audit) to choose which of the two directions above to take; the code change itself is small and localized to one file.

**8. Migration needed:** No.

**9. Tests/validators needed:** Integration test: attempt to create a return for an order with `status='shipped'` and no `delivered_at` — expect the outcome the business chooses (reject, or accept with corrected copy). Integration test confirming the 14-day window calculation no longer silently uses `created_at` as a delivery-date proxy.

**10. Recommended implementation batch:** D.

---

### D2. P1-8 — No cross-return cumulative-quantity guard

**1. Issue title:** A customer can request return of more units than purchased across multiple sequential return requests.

**2. Why it matters:** The current guard only caps quantity per single request and only blocks a second concurrent request while an active return exists for the same product slug — it does not sum quantity already claimed across all historical (including closed/rejected) requests for the same order item, so a customer could, over several requests, claim a refund/return for more units than they actually bought.

**3. Affected files:** `functions/api/returns.js` (`normalizeItems()`, the duplicate-active-return guard).

**4. Affected Supabase tables/functions/policies:** `return_requests`, `return_request_items`, `order_items` (quantity comparison source).

**5. Category:** API (validation logic).

**6. Exact proposed fix:** Before accepting a new return item, sum the `quantity` already claimed across all of that order item's prior return requests (across all statuses except explicitly `rejected`/`cancelled`, since those free up the quantity again), and reject if the new request would push the cumulative total above what was actually purchased on that line item.

**7. Risk level:** Low — additive validation, no change to the happy path for customers who haven't attempted multiple returns on the same item.

**8. Migration needed:** No.

**9. Tests/validators needed:** Integration test: submit a return for the full purchased quantity of an item, have it closed/rejected, then submit a second return for the same item exceeding the original purchased quantity in combination with any partially-accepted prior claim — expect rejection.

**10. Recommended implementation batch:** D.

---

### D3. P1-9 — Manual-only Iyzico refunds; `provider_reference` optional even for `completed` status

**1. Issue title:** A refund can be marked `completed` without any recorded evidence of the actual money movement.

**2. Why it matters:** Refunds are intentionally manual/reference-only per prior business decisions in this project (no automated Iyzico refund API call, which is fine and out of scope to change here) — but today, `refund_records.status` can be set to `completed` with `provider_reference` left `null`, meaning there's no hard requirement that a human attach evidence of the actual bank transfer or Iyzico dashboard refund before closing the record out. This is a light-touch, low-risk fix that meaningfully improves the audit trail for a manual financial process.

**3. Affected files:** `functions/api/admin/refunds.js`.

**4. Affected Supabase tables/functions/policies:** `refund_records` (`status`, `provider_reference`, `completed_at` columns).

**5. Category:** API (validation), Operational (financial audit trail).

**6. Exact proposed fix:** Require a non-empty `provider_reference` (or an equivalent manual-evidence field/note) whenever the request sets `status = 'completed'`; reject the request with a clear Turkish error otherwise. Do not touch the actual refund-creation logic, the loyalty-reversal hook, or the "manual, no live Iyzico API call" behavior — this is purely a required-field validation addition.

**7. Risk level:** Low, but requires a business decision first (see corresponding question in the audit) on whether this should be strictly mandatory or allow a documented exception path (e.g. "refund confirmed verbally, reference pending").

**8. Migration needed:** No — the column already exists and is nullable; this is a validation-only change, not a schema change (unless the business wants to make the column `NOT NULL` at the database level too, which would need a migration and a backfill decision for existing null rows).

**9. Tests/validators needed:** Integration test: attempt to POST a refund with `status: 'completed'` and no `provider_reference` — expect rejection with a clear error. Integration test: same request with a `provider_reference` present — expect success, unchanged from today's behavior.

**10. Recommended implementation batch:** D.

---

## Batch E — Cron/unwired job operationalization

### E1. P1-1 — Delivered+14-day loyalty point promotion is unwired

**1. Issue title:** The documented 14-day loyalty-promotion hold never actually runs.

**2. Why it matters:** `cosmoskin_promote_due_loyalty_points()` implements the "pending → available after delivered+14 days" rule described in the Batch 4 design, but nothing calls it — no cron file, no `wrangler.toml` trigger, no entry in the existing `automation/cron-reminders` Worker. The only thing that actually promotes points today is an admin manually marking an order "delivered," which defeats the anti-fraud/return-window rationale for the 14-day hold entirely. This is a policy-vs-implementation mismatch that needs a business decision before it's "fixed" one way or the other (see audit business question 2).

**3. Affected files:** `functions/api/_lib/loyalty-ledger.js` (`promoteDueLoyaltyPoints()`, already exists, currently uncalled), `automation/cron-reminders/` (the only existing scheduled Worker, as a structural reference), `wrangler.toml` (no scheduled triggers exist here at all — Cloudflare Pages Functions cannot have `scheduled()` handlers).

**4. Affected Supabase tables/functions/policies:** `cosmoskin_promote_due_loyalty_points()` RPC, `loyalty_points_ledger` (`status` transitions from `pending` to `available`).

**5. Category:** Operational (scheduling infrastructure).

**6. Exact proposed fix:** Pending the business decision on which policy is actually correct:
   - If the 14-day hold is the real intended policy: stand up a new scheduled Cloudflare Worker (structured like `automation/cron-reminders`, since Pages Functions cannot self-schedule) with a daily cron trigger that calls `cosmoskin_promote_due_loyalty_points()` via its existing JS wrapper, authenticated the same way the reminders worker calls its own `/run` endpoint.
   - If "available immediately on admin delivered" is actually the accepted v1 policy: no code change needed here — instead, correct the SQL comments and any customer-facing documentation that currently claims a 14-day hold, so the documented policy matches reality.

**7. Risk level:** Low for either direction once the business decision is made — the RPC itself is already implemented, idempotent, and previously validated in Batch 4; this batch is purely about wiring a trigger (or removing an inaccurate claim).

**8. Migration needed:** No — no schema change, only a new scheduled-invocation mechanism (infrastructure) or a documentation correction.

**9. Tests/validators needed:** If implementing the scheduler: a smoke test that manually invokes the new Worker's endpoint against a staging database and confirms `pending` points older than 14 days past `delivered_at` move to `available` exactly once (idempotent on re-run). If correcting documentation instead: a validator grep confirming no remaining code comment or customer-facing copy claims a 14-day hold that doesn't exist.

**10. Recommended implementation batch:** E.

---

### E2. P1-2 — Three of four scheduled-job endpoints have no scheduler at all

**1. Issue title:** `release-expired-inventory`, `points-expiry`, and `recalculate-memberships` cron endpoints exist but nothing ever calls them on a schedule.

**2. Why it matters:** This is a previously-known, previously-flagged gap (documented in `COSMOSKIN_PRODUCTION_DEPLOYMENT_CHECKLIST.md`, `COSMOSKIN_REMAINING_RISKS.md`, and `COSMOSKIN_AUDIT_CLOSURE_MATRIX.md` before this audit) that was never closed. Practically: abandoned checkouts may hold reserved stock/coupons indefinitely unless someone manually triggers the endpoint; membership tiers never auto-recalculate; and points never expire (though `points-expiry.js` is currently a stub regardless, so scheduling it alone wouldn't do anything yet — see Question 3 in the audit).

**3. Affected files:** `functions/api/cron/release-expired-inventory.js`, `functions/api/cron/points-expiry.js`, `functions/api/cron/recalculate-memberships.js`, and a new scheduled Worker (or an extension of `automation/cron-reminders`).

**4. Affected Supabase tables/functions/policies:** `release_expired_inventory_reservations` RPC, `inventory_reservations`, `coupon_redemptions` (indirectly, via order cancellation triggered by expiry), `customer_membership_status`/`recalculate_customer_membership` RPC.

**5. Category:** Operational (scheduling infrastructure).

**6. Exact proposed fix:** Stand up one additional scheduled Cloudflare Worker (or extend `automation/cron-reminders`'s existing `scheduled()` handler) that, on appropriate cadences, POSTs to each of the three endpoints with `CRON_SECRET`: `release-expired-inventory` frequently (e.g. every 15 minutes, since it directly affects checkout availability), `recalculate-memberships` daily. Defer scheduling `points-expiry` until its underlying expiry rule is actually implemented (currently a stub returning `expired: 0`) — scheduling a no-op endpoint provides no value and could create false confidence that expiry is "handled."

**7. Risk level:** Low — these endpoints already exist, are already `CRON_SECRET`-protected, and are already idempotent by design; this batch only adds a caller.

**8. Migration needed:** No.

**9. Tests/validators needed:** Manual smoke test: trigger each endpoint via the new scheduler in staging and confirm expected side effects (expired reservations released, memberships recalculated). Ongoing operational check: confirm the new Worker's scheduled invocations actually appear in Cloudflare's dashboard/logs after deploy.

**10. Recommended implementation batch:** E.

---

## Batch F — Migration/baseline schema reconciliation

### F1. P0-6 — `supabase/migrations/` alone cannot rebuild the database; no single provisioning document exists

**1. Issue title:** The tracked migration folder is missing several core tables that only exist in an undocumented baseline SQL file.

**2. Why it matters:** `products`, `shipments`, `user_favorites`, `notifications` (in-app), `reviews`/`review_images`, and `support_requests` are only `CREATE TABLE`'d in `supabase/schema.sql` and its siblings — never in any of the 25 tracked migrations. The most-referenced current runbook doesn't mention `schema.sql` at all. This is a real disaster-recovery and environment-parity risk: anyone provisioning a new environment from the documented process today would get a database missing the product catalog, shipments, favorites, in-app notifications, reviews, and support tickets.

**3. Affected files:** None in `functions/api/` — this is purely a documentation and migration-organization issue. Affects `supabase/schema.sql`, `supabase/commerce-schema.sql`, `supabase/phase6-commerce-schema.sql`, `supabase/reviews.sql`, `supabase/phase51_reviews_hardening.sql`, `COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql`, and every README that currently gives partial/contradictory provisioning instructions.

**4. Affected Supabase tables/functions/policies:** `products`, `shipments`, `user_favorites`, `notifications`, `reviews`, `review_images`, `review_helpful`, `support_requests` — all currently baseline-only or root-file-only.

**5. Category:** Database/Schema, Operational (documentation).

**6. Exact proposed fix:** Two complementary steps:
   - Immediate, low-risk: write one authoritative `SUPABASE_PROVISIONING.md` that states the exact, tested, ordered command sequence for a fresh environment (baseline `schema.sql` → 25 migrations in filename order → `COSMOSKIN_FINAL_LAUNCH_SUPABASE_FIX_20260701.sql` for `support_requests` → verification scripts), superseding the five currently-contradictory README files' provisioning instructions.
   - Longer-term, higher-value: consolidate the baseline tables (`products`, `shipments`, `user_favorites`, `notifications`, `reviews`, `review_images`, `support_requests`) into one or more new, additive, `CREATE TABLE IF NOT EXISTS` migrations added to `supabase/migrations/`, so the migrations folder becomes self-sufficient end-to-end and the baseline files become historical only.
   The second step is safe for the already-running production database (the tables already exist there, so `IF NOT EXISTS` no-ops) and only matters for future fresh-environment provisioning.

**7. Risk level:** Low for the documentation step. Low-medium for the consolidation-migration step — needs care to exactly match the current live column set for each table (including all the scattered `ALTER TABLE IF EXISTS` additions from later migrations) so the new "catch-up" migration doesn't miss a column that a later migration assumed already exists.

**8. Migration needed:** Yes, for the consolidation step (not for the documentation step).

**9. Tests/validators needed:** The strongest possible test here is an actual from-scratch provisioning run against a throwaway Supabase project, following only the new `SUPABASE_PROVISIONING.md`, verifying every table the application code depends on exists with the expected columns afterward (see business question 8 in the audit about whether there's appetite to actually run this).

**10. Recommended implementation batch:** F.

---

### F2. P1-10 — Duplicate `CREATE TABLE IF NOT EXISTS` definitions with divergent columns for `profiles`, `invoice_records`, `customer_coupons`, `inventory_reservations`

**1. Issue title:** Four tables have two (or more) incompatible `CREATE TABLE IF NOT EXISTS` definitions across different migration files.

**2. Why it matters:** Because `IF NOT EXISTS` makes the second definition a silent no-op if the first already ran, the resulting schema for any *fresh* environment depends on migration execution order in a way that isn't visible from reading any single file. This is the same underlying migration-hygiene problem that produced P0-1's reservation-status mismatch (`inventory_reservations` is one of the four affected tables), and was already flagged as a known "fragile area" in this project's own memory file before this audit, without ever being resolved.

**3. Affected files:** None in `functions/api/` directly. Affects `supabase/migrations/20260626_production_launch_readiness.sql`, `supabase/migrations/20260628_cosmoskin_final_ecommerce_hotfix.sql`, `supabase/migrations/20260629_cosmoskin_final_user_acceptance_fix.sql` (and its `_v2`), `supabase/migrations/20260510_phase1_operational_safety.sql`, `supabase/migrations/20260627_customer_experience_production_patch.sql`, `supabase/migrations/20260704_batch4_loyalty_ledger.sql`.

**4. Affected Supabase tables/functions/policies:** `profiles`, `invoice_records`, `customer_coupons`, `inventory_reservations`.

**5. Category:** Database/Schema.

**6. Exact proposed fix:** For each of the four tables, replace the multiple divergent `CREATE TABLE IF NOT EXISTS` blocks with a single canonical `CREATE TABLE IF NOT EXISTS` definition (matching whatever the live production schema actually is, verified via `information_schema.columns` before writing the new migration) placed early in migration history conceptually, plus `ADD COLUMN IF NOT EXISTS` everywhere a later migration currently duplicates the CREATE. Add an explicit comment in each superseded migration file noting it is historical/no-op, so future readers don't mistake it for the active definition. This does not change the live schema (since it already reflects whichever version actually ran) — it only prevents the ambiguity from ever mattering for a future fresh-provisioning run, and is required groundwork for confidently resolving P0-1 (`inventory_reservations` status vocabulary) since that fix depends on knowing which reservation-table shape is actually live.

**7. Risk level:** Low for production (no live schema change, since the tables already exist in whatever shape they're in) — the risk is entirely in correctly documenting the actual live shape, which requires the same live-database verification step called for in B1 (P0-1).

**8. Migration needed:** Yes — new additive migrations that consolidate each table's canonical shape, plus comment annotations in the superseded files (comment-only edits, not schema changes, in those files).

**9. Tests/validators needed:** A verification query run against the live database for each of the four tables (`information_schema.columns`, `information_schema.table_constraints`) to confirm the new canonical migration's column list exactly matches production before merging. Validator script confirming no future migration reintroduces a duplicate `CREATE TABLE IF NOT EXISTS` for any of these four table names.

**10. Recommended implementation batch:** F.

---

## Cross-batch dependency notes

- **B1 (P0-1) and F2 (P1-10) share a verification step.** Both require the same live-database read (`information_schema`/`pg_proc` inspection of `inventory_reservations` and `process_iyzico_payment_success`) — do this once and use the result for both fixes rather than duplicating the investigation.
- **C1 (P0-4) should follow B3 (P1-3)** where practical, since both touch order-status-mutation logic in `admin/orders.js` — sequencing them back-to-back reduces merge friction, though they are not strictly blocking on each other.
- **A1 (P0-5)'s Step 2 (flipping the RBAC default) should not ship until Step 1 (seeding `admin_users`) is confirmed complete in production** — this is an operational sequencing risk, not a technical one, and is called out again here because it's the one fix in this plan that could cause an outage (admin lockout) if sequenced wrong.
- **E1 (P1-1) is blocked on a business decision** (audit question 2) before any code/infrastructure work starts — determine the intended policy first.
- **D3 (P1-9) is blocked on a business decision** (audit question 4) on whether `provider_reference` should be strictly mandatory.
- **D1 (P1-4) is blocked on a business decision** (audit question 7) on whether early return-filing while shipped-not-delivered is intentional.

---

*Plan complete. No files were modified, no migrations were created, and no code was written as part of this pass, per the read-only planning scope of this request.*
