# COSMOSKIN — B1: Bank Transfer Approval Finalization Plan

**Date:** 2026-07-05
**Type:** Planning document only. No files modified, no migrations created, no SQL run, nothing deployed.
**Scope:** Make admin bank-transfer ("Havale/EFT") payment approval produce the same commerce finalization result as a successful card payment — payments row, `payment_events`, coupon redemption, invoice shell, inventory conversion, loyalty award, customer email, admin audit — without altering the iyzico callback path, checkout, or any other unrelated logic.
**Relationship to prior plans:** This is a fresh, standalone investigation requested as "B1." It supersedes and supersets the earlier, higher-level sketch of the same problem filed as **C1 (P0-4)** in `COSMOSKIN_P0_P1_REMEDIATION_PLAN_20260704.md` §"Batch C". Where this plan and that one agree, it is noted; where this plan goes further (exact call sites, idempotency design, RBAC status, validator/test plan), this plan is the source of truth going forward.

---

## 1. Current bank transfer flow (traced)

| # | File | Function | Current behavior | Missing behavior | Risk |
|---|---|---|---|---|---|
| 1.1 | `functions/api/create-checkout.js` (`onRequestPost`, lines 843–911) | Order creation, bank-transfer branch | Creates `orders` row: `status='pending_bank_transfer'`, `payment_status='awaiting_transfer'`, `fulfillment_status='not_started'`, `payment_method='bank_transfer'`. Reserves stock via `reserveInventoryForOrder()` → `inventory_reservations.status='reserved'`. Inserts `coupon_redemptions.status='reserved'` if a coupon was used (`recordCouponUsage`, line 828). Inserts a `payments` row: `provider='bank_transfer'`, `status='awaiting_transfer'`, `conversation_id=orderId`, no `provider_payment_id`/`provider_token` (line 844). Sends `bank_transfer_pending` email. Writes `order_status_events` (`order_created`, `stock_reserved`, `awaiting_transfer`). | Nothing missing at creation time — this stage is correct and symmetric with the card path's pre-payment state. | None (out of scope; not touched). |
| 1.2 | `functions/api/admin/orders.js` (`onRequestPatch`, lines 308–462) | Admin "mark bank transfer paid" — action `mark_payment_paid` | This is **the** manual payment confirmation endpoint (wired to the admin UI button in `assets/admin-orders.js` line 603/809). On `action:'mark_payment_paid'`: sets `orders.status='paid'`, `payment_status='paid'`, `fulfillment_status='preparing'`, `paid_at` (lines 319–330). Runs `assertOperationalTransition()` guard (lines 72–92). Calls `convertInventoryReservations(context, id)` (line 341) — **correct, idempotent, already parity with card path**. Writes one `order_status_events` row (`recordEvent`, lines 345–354). Sends `payment_confirmed_manual` email unconditionally when `paymentStatus === 'paid'` (lines 365–368). Later, gated on `before.payment_status !== 'paid'`, calls `awardOrderPoints()` (lines 444–447) — **correct, idempotent, already parity with card path**. | **`payments` table is never updated.** No `updateRows(context,'payments', …)` call exists anywhere in this file — the bank-transfer `payments` row stays `status='awaiting_transfer'` forever. **No `payment_events` row is ever inserted** for this action — there is no audit trail of the manual confirmation at the payment-provider-abstraction layer at all. **Coupon redemption is never finalized** — `coupon_redemptions.status` stays `'reserved'` forever for bank-transfer orders that used a coupon (only the rejection branch, `mark_bank_transfer_not_received`, touches `coupon_redemptions`, and only to release it). **No invoice shell is created** (`invoice_records` — nothing inserted on approval; only created if an admin separately uses the manual invoice screen). **No shipment shell is guaranteed** — a `shipments` row is only created if the *same* PATCH request also carries `carrier`/`tracking_number` fields; a plain "mark paid" click creates none. **No admin identity is captured** — `recordEvent()` hardcodes `created_by:'admin'` (line 174), never the actual `Cf-Access-Authenticated-User-Email` of the approving admin. **Double-email risk on re-click**: the email send is gated on `body.action === 'mark_payment_paid' \|\| paymentStatus === 'paid'` (line 365) with **no** `before.payment_status !== 'paid'` check, unlike the loyalty-award gate three lines below it — re-approving an already-paid order re-sends the `payment_confirmed_manual` email every time. | **High** — this is the exact P0-4 finding: bank-transfer orders never reach full commerce parity with card orders. |
| 1.3 | `functions/api/admin/orders/[id]/status.js` (`onRequestPatch`, lines 11–73) | Secondary/lower-level "set order status" endpoint | On `body.status === 'paid'` (lines 44–48): calls `convertInventoryReservations()`, sets `payment_status='paid'`, `fulfillment_status='preparing'`. Writes a bare `order_status_events` row (line 50, no `event_type`/`previous_status`/`metadata`). Same loyalty award/promote/reverse hooks as 1.2 (lines 52–67). | Same gap set as 1.2 **minus** even the email: no `payments` update, no `payment_events`, no coupon finalization, no invoice shell, no shipment shell, **and no customer email at all** (this route sends none). Not wired to the current admin UI's bank-transfer button (grep of `assets/admin-orders.js` shows only `admin/orders.js` is called for `mark_payment_paid`), but it is a live, RBAC-gated, reachable API route that any admin tool or future UI change could call to mark an order paid and silently bypass every finalization step. This mirrors the pre-existing **B3/P1-3** finding in the P0/P1 plan (two divergent "change order status" paths) applied specifically to the paid-transition. | **Medium** — not the primary UI path today, but a live bypass of any fix applied only to 1.2. |
| 1.4 | `functions/api/admin/orders.js` (`action:'mark_bank_transfer_not_received'`, lines 355–360) | Admin rejection/cancellation of a bank-transfer order | Releases inventory reservations (`releaseInventoryReservations`), releases `coupon_redemptions.status='released'`, sends `bank_transfer_not_received_cancelled` email. Sets `orders.status='cancelled'`, `payment_status='failed'`, `fulfillment_status='cancelled'` via the same generic payload path as any other action. | **`payments` row is never updated here either** — stays `status='awaiting_transfer'` even after the order is cancelled. This is the same class of gap as 1.2, on the rejection side. See §7 — explicitly out of scope for this implementation pass, noted for completeness. | Low (order itself is correctly cancelled/released; only the `payments` table's own status lags, which is a reporting/reconciliation nuisance, not a customer- or money-facing bug). |
| 1.5 | `functions/api/_lib/bank-accounts.js`, `functions/api/payment/bank-accounts.js` | Bank account config/lookup | Serve validated IBAN/bank account data to checkout and emails (`getValidatedBankAccounts`, `getPrimaryBankAccount`). No order/payment state is touched here. | Nothing relevant to finalization. | None (out of scope). |
| 1.6 | `functions/api/admin/orders.js` (`resendOrderEmail`, lines 464–483) | Admin "resend email" utility | Can re-send `payment_confirmed_manual`/`bank_transfer_*` emails on demand. | N/A — utility function, not part of the approval flow itself. | None (out of scope). |

---

## 2. Canonical card-success flow (traced)

Full sequence, in order, exactly as it runs today in `functions/api/iyzico-callback.js` `onRequestPost` on a successful callback (lines 288–379) — **none of this is proposed to change**, only to be reused:

1. **`process_iyzico_payment_success` RPC** (`supabase/migrations/20260704_h0_live_payment_rpc_hotfix.sql` lines 73–176), called at `iyzico-callback.js` line 331:
   - Advisory-locks the order (`pg_advisory_xact_lock`).
   - **Idempotency gate**: checks `payment_events` for a prior `provider='iyzico', event_type='payment_success', status='processed'` row matching `order_id`/`provider_payment_id`/`token` — if found, returns `{claimed:false, idempotent:true}` and does nothing else.
   - Converts inventory: if `inventory_reservations` has `status='reserved'` rows for the order, calls `convert_order_inventory()`; if none but some are already `'converted'`, treats it as an idempotent replay; if neither, raises an error.
   - Inserts one `payment_events` row: `provider='iyzico', event_type='payment_success', status='processed', raw_reference=token, metadata={..., inventory_conversion}`.
   - Deliberately does **not** touch `payments`/`orders`/coupons/loyalty — those are the caller's job (see next steps), by design, so the RPC "cannot itself get out of sync with the order/payment rows the caller writes immediately after."
2. **`payments` table update** (`iyzico-callback.js` line 342): `status='paid', provider_payment_id, raw_callback_response, updated_at`.
3. **`orders` table update** (line 349): `status='paid', payment_status='paid', fulfillment_status` = `'preparing'` (or `'review_required'` if the RPC threw), `paid_at`, `updated_at`, `metadata`.
4. **`order_status_events` insert** (`recordStatusEvent`, one of three branches depending on outcome — normal success, duplicate-ignored, or review-required).
5. **`ensureShipmentShell()`** (line 370 / line 87): inserts a `shipments` row with `status='preparing'` if none exists yet for the order — **idempotent** (checks for an existing row first).
6. **`finalizeCommerceAfterPayment()`** (lines 105–188, called at both line 362 and line 371):
   - Coupon finalization: if `order.coupon_code` is set, either updates an existing `coupon_redemptions` row to `status='used'` or inserts one directly as `used` (idempotent — checked by `existingRedemption` lookup first), then mirrors the `used` status onto `customer_coupons` by `user_id` and by `customer_email`.
   - Invoice shell: inserts an `invoice_records` row with `invoice_status='pending'` **only if none exists yet** for the order (idempotent — `existingInvoice` check first).
   - Loyalty award: calls `awardOrderPoints()` → `cosmoskin_award_loyalty_for_order` RPC — idempotent via a unique `transaction_reference` inside the ledger migration (Batch 4).
7. **Brevo sync + customer email + CRM event** (lines 372–377), gated on `processing?.claimed !== false` (i.e. skipped only on a genuine duplicate-callback replay): `syncBrevoAfterPayment()`, `sendPaymentSuccessEmailSafely()` (sends `payment_success` email + logs `email_events`), `recordCrmEvent({event_type:'purchase_completed', …})`.

**Canonical sequence, condensed:** `RPC idempotency+inventory-conversion+payment_events` → `payments.status='paid'` → `orders.status/payment_status/fulfillment_status` → `order_status_events` → `ensureShipmentShell` → `finalizeCommerceAfterPayment` (coupon → invoice → loyalty) → `email + CRM`.

---

## 3. Gap comparison table

| Finalization step | Card success (§2) | Bank transfer approval today (§1.2) | Gap |
|---|---|---|---|
| Payment row finalized (`payments.status='paid'`) | ✅ `iyzico-callback.js:342` | ❌ Never written | **Gap** |
| `payment_events` row created | ✅ Inside `process_iyzico_payment_success` RPC | ❌ No `payment_events` insert anywhere in `admin/orders.js` | **Gap** |
| Order status updated (`orders.status`) | ✅ `'paid'` | ✅ `'paid'` (`admin/orders.js:319-324`) | OK |
| `payment_status='paid'` | ✅ | ✅ (`admin/orders.js:322`) | OK |
| Inventory reservation converted | ✅ `convert_order_inventory` via RPC | ✅ `convertInventoryReservations()` — same underlying RPC (`admin/orders.js:341`) | OK — already at parity |
| Coupon redemption finalized (`status='used'`) | ✅ `finalizeCommerceAfterPayment()` | ❌ Never finalized; stays `'reserved'` forever | **Gap** |
| Invoice state updated (shell created) | ✅ `finalizeCommerceAfterPayment()` | ❌ No shell created on approval | **Gap** |
| Shipment/fulfillment shell ready | ✅ `ensureShipmentShell()`, always | ⚠️ Only if admin supplies carrier/tracking in the same request | **Gap (minor)** |
| Loyalty purchase points awarded | ✅ `finalizeCommerceAfterPayment()` → `awardOrderPoints()` | ✅ `awardOrderPoints()` called on before/after transition (`admin/orders.js:444-447`) | OK — already at parity |
| Customer email sent | ✅ `payment_success` | ✅ `payment_confirmed_manual` — **but not de-duplicated** on re-approval (`admin/orders.js:365-368`) | **Gap (idempotency only)** |
| Admin/audit event created | N/A (system-driven) | ⚠️ `order_status_events` written, but with hardcoded `created_by:'admin'` — no approving admin identity captured anywhere | **Gap** |
| RBAC guard present | N/A | ✅ Already gated — `requireAdminPermission(context,'orders:update')` (`admin/orders.js:311`, added in A1.2b) | OK — no work needed |
| Safe on double-click / re-approval | ✅ RPC-level idempotency gate | ❌ No idempotency gate at all for the manual-confirmation side-effects; only the underlying RPCs (`convert_order_inventory`, loyalty ledger) happen to be independently idempotent | **Gap** |

**Net conclusion:** 5 concrete gaps (payments row, `payment_events`, coupon finalization, invoice shell, idempotency/de-dup), 1 minor gap (shipment shell timing), 1 attribution gap (admin identity), 0 RBAC gaps, 0 gaps in inventory conversion or loyalty award (those two are already correctly wired and already idempotent).

---

## 4. Canonical helper strategy — recommendation

**Recommended: Option C — a bank-transfer-specific helper that calls the same shared, lower-level primitives the card path already uses, plus one new shared extraction.**

Rationale for rejecting the alternatives:
- **Option A (reuse `finalizeCommerceAfterPayment()` as-is, unmodified, from admin code)** is not directly usable because that function currently only covers coupon+invoice+loyalty — it does not touch `payments`, does not write `payment_events`, and is a private (non-exported) function local to `iyzico-callback.js`. It would need to be exported at minimum.
- **Option B (one new generic "manual payment success" helper that also branches for card)** would require touching the card path's call sites to route through it, which directly conflicts with "not change iyzico callback behavior" and is a bigger, riskier refactor than this problem requires.
- **Option C** gets the de-duplication benefit (no copy-pasted coupon/invoice/loyalty logic) with the smallest possible blast radius on the card path.

Concretely:

1. **New shared file: `functions/api/_lib/commerce-finalization.js`.**
   - Move `finalizeCommerceAfterPayment(context, orderId)` and `ensureShipmentShell(context, orderId)` out of `functions/api/iyzico-callback.js` into this new file, **verbatim, byte-identical function bodies** — a pure relocation, not a rewrite. Export both.
   - `functions/api/iyzico-callback.js` imports both from the new file instead of defining them locally. Every existing call site (lines 362, 370, 371) is unchanged in behavior — only the `import` line and the two local function definitions change. This is mechanically verifiable (a diff of `iyzico-callback.js` should show only an import-line change and two function-body deletions, nothing else).
   - Add one **new** function to the same file: `confirmManualBankTransferPayment(context, orderId, { approvedByEmail, approvedByAdminId } = {})`. This is new code, specific to the manual/admin bank-transfer path, and never called from `iyzico-callback.js`.

2. **`confirmManualBankTransferPayment()` behavior (new):**
   - Loads the order; if `order.payment_method !== 'bank_transfer'`, throws immediately (defensive — this function must never be reachable for a card order, so it can never write a conflicting `payment_events` row over the iyzico-owned audit trail for that order).
   - **Idempotency gate first, before any write**: selects `payment_events` for `order_id = orderId, provider = 'bank_transfer', event_type = 'bank_transfer_payment_confirmed', status = 'processed'`. If a row already exists, return `{ ok: true, idempotent: true }` immediately — no `payments` write, no inventory call, no coupon/invoice/loyalty call, no email trigger from this function. This is the single source of truth for "has this order already been manually finalized," mirroring exactly the pattern `process_iyzico_payment_success` uses for the card path.
   - If not idempotent: find the latest `payments` row for the order (`provider='bank_transfer'`) and update it to `status='paid', updated_at=now()`, merging `metadata.manual_confirmation = { approved_by_email, approved_by_admin_id, confirmed_at }` into its existing `raw_initialize_response`/`metadata` (whichever column the `payments` schema uses — see the existing `raw_initialize_response` field written at checkout time).
   - Calls `convertInventoryReservations(context, orderId)` (imported from the existing `functions/api/_lib/inventory.js` — no change to that file). Safe to call even though `admin/orders.js` also already calls it in the generic status-mutation block above — `convert_order_inventory` is a documented no-op when no `'reserved'` rows remain (verified in `supabase/migrations/20260629_cosmoskin_final_user_acceptance_fix_v2.sql` lines 417-450: the loop simply matches zero rows and returns `converted:0`).
   - Calls `finalizeCommerceAfterPayment(context, orderId)` (now shared) for coupon finalization + invoice shell + loyalty award — all three are independently idempotent per §2/§5.
   - Calls `ensureShipmentShell(context, orderId)` (now shared) — idempotent, closes the "shipment/fulfillment readiness" gap.
   - Inserts the `payment_events` row that makes the idempotency gate above work on the next call: `{ order_id, provider:'bank_transfer', provider_payment_id: null, event_type:'bank_transfer_payment_confirmed', status:'processed', raw_reference: null, processed_at: now(), metadata: { approved_by_email, approved_by_admin_id, source:'admin_manual_bank_transfer' } }`. No CHECK constraint exists on `payment_events.provider`/`event_type`/`status` (confirmed — plain `text NOT NULL` columns, `supabase/migrations/20260510_phase1_operational_safety.sql` lines 80-91), so this requires no migration.
   - Returns `{ ok: true, idempotent: false, conversion, finalize }` for the caller to use in logging/response only.

3. **`functions/api/admin/orders.js` call site (the only production call site added):**
   - Inside the existing block gated on `body.action === 'mark_payment_paid' || paymentStatus === 'paid'` (line 365), add a new condition: **only if `before.payment_method === 'bank_transfer'`**, call `await confirmManualBankTransferPayment(context, id, { approvedByEmail: getAccessEmail(context), approvedByAdminId: (await getAdminRecord(context))?.id || null })` — placed *before* the `sendAndLogStatusEmail(..., 'payment_confirmed_manual')` call, so the confirmation email only ever describes a fully-finalized state.
   - This one `if` is the entire production-code change to the existing PATCH handler beyond the import line and the de-dup fix in item 4 below. It never fires for a card order (guarded on `payment_method`), never fires for any other action (`mark_preparing`, `mark_shipped`, `mark_delivered`, `cancel_order`, `mark_bank_transfer_not_received` are all untouched), and is itself a no-op on re-invocation (idempotency gate inside the helper).

4. **De-dup fix for the existing email send (small, bundled into the same change):**
   - Change the condition at `admin/orders.js:365` from `body.action === 'mark_payment_paid' || paymentStatus === 'paid'` to also require `before.payment_status !== 'paid'` — exactly mirroring the pattern already used three lines below it for the loyalty-award gate (line 445: `order.payment_status === 'paid' && before.payment_status !== 'paid'`). This directly satisfies "safe if admin clicks approve twice" for the email specifically (the new helper already handles it for every other side effect).

5. **Admin identity attribution (small, bundled):**
   - `recordEvent()`'s call at line 345 already accepts a `created_by` field; pass `getAccessEmail(context) || 'admin'` instead of the hardcoded literal `'admin'`, for this call site only (no change to `recordEvent()`'s signature or its other ~10 call sites in the same file, so no other event's `created_by` value changes).
   - Optionally (recommended, separable): call the existing `recordAdminActivity()` helper (`functions/api/_lib/admin-audit.js:57-76`, already used by 5 other files, not currently imported into `admin/orders.js`) once, scoped only to this action: `action:'bank_transfer_payment_confirmed', resource_type:'order', resource_id:id`. This is intentionally **not** a general rollout of `admin_activity_logs` coverage across `admin/orders.js` (that is the separate, already-identified **A3/P1-6** finding) — it is a single, narrowly-scoped call added only inside the new `if (before.payment_method === 'bank_transfer')` block from item 3.

6. **`admin/orders/[id]/status.js` (secondary call site — recommended, but flagged as a separate go/no-go decision):**
   - Add the identical `if (current.payment_method === 'bank_transfer') await confirmManualBankTransferPayment(...)` call inside its existing `else if (body.status === 'paid')` branch (line 44-48), so this route cannot silently bypass finalization if anything ever calls it for a bank-transfer order. Because this route is not wired to the current admin UI for this purpose, doing this is low-incremental-risk but also low-urgency — call this out explicitly to the user as an optional inclusion in the implementation step, not a hard requirement of closing the P0-4 gap (the UI-driven path in `admin/orders.js` is what actually matters for the reported problem).

**Design properties satisfied:**
- Avoids duplicating card payment callback logic — coupon/invoice/loyalty logic is relocated, not copied; inventory conversion reuses the existing shared helper unchanged.
- Idempotent — single `payment_events` gate covers all new side effects atomically at the JS level (see §5 for the residual race-window discussion).
- Safe on double-click — covered by the gate (new side effects) + independently-idempotent existing primitives (inventory, loyalty) + the email de-dup fix.
- Never double-awards loyalty — `cosmoskin_award_loyalty_for_order`'s unique `transaction_reference` already guarantees this regardless of how many times it's called.
- Never double-finalizes coupons — `finalizeCommerceAfterPayment()`'s `existingRedemption` check already guarantees this.
- Never double-converts inventory — `convert_order_inventory`'s "no `'reserved'` rows left" no-op already guarantees this.
- Never double-sends the confirmation email — fixed by item 4.
- Does not change iyzico callback behavior — `iyzico-callback.js`'s only change is a mechanical import swap with byte-identical function bodies, verified by the validator in §10.

---

## 5. Idempotency requirements — exact keys

| Side effect | Idempotency mechanism | Where it lives |
|---|---|---|
| New `payment_events` write + everything gated behind it (payments row, coupon, invoice, shipment shell) | **New gate**: `SELECT 1 FROM payment_events WHERE order_id=$1 AND provider='bank_transfer' AND event_type='bank_transfer_payment_confirmed' AND status='processed'` — if found, no-op. | New, inside `confirmManualBankTransferPayment()`. |
| Inventory reservation conversion | **Existing**: `convert_order_inventory` only matches rows with `status='reserved'`; already-converted rows are silently skipped, returns `converted:0`. | `supabase/migrations/20260629_cosmoskin_final_user_acceptance_fix_v2.sql:417-450` (unchanged). |
| Coupon redemption finalization | **Existing**: `finalizeCommerceAfterPayment()` checks `existingRedemption` before choosing insert vs. update; either path sets `status='used'` and is safe to re-run. | `functions/api/iyzico-callback.js:115-152` (relocated, unchanged). |
| Invoice shell creation | **Existing**: `finalizeCommerceAfterPayment()` only inserts if `existingInvoice` is empty for the order. | Same file/lines as above. |
| Loyalty purchase-point award | **Existing**: `cosmoskin_award_loyalty_for_order` RPC has a unique `transaction_reference` (Batch 4 ledger migration) — `ON CONFLICT DO NOTHING` semantics. | `supabase/migrations/20260704_batch4_loyalty_ledger.sql` (unchanged). |
| Shipment shell creation | **Existing**: `ensureShipmentShell()` checks for an existing `shipments` row for the order first. | Same file (relocated, unchanged). |
| Customer confirmation email | **New**: gate the send on `before.payment_status !== 'paid'` (item 4 in §4), so a second "mark paid" click on an already-paid order sends nothing. | `functions/api/admin/orders.js:365` (one-line condition change). |

**Residual race window (documented, not silently ignored):** unlike the iyzico webhook path, which uses `pg_advisory_xact_lock` inside a `plpgsql` RPC to fully serialize concurrent callbacks, the new manual-confirmation gate above is a plain JS check-then-act (`SELECT` then later `INSERT`) with no advisory lock, because this path has no SQL RPC of its own. In practice this is low-risk: it requires the *same human admin* (or two different admins) to submit two "mark paid" PATCH requests for the *same order* within the same few hundred milliseconds, which is an edge case a webhook retry storm does not present. Two mitigations are proposed, and the user should pick one:
- **Accepted as-is (recommended for this pass):** rely on the check-then-act gate. The absolute worst case of losing the race is one extra (harmless, idempotent) `convert_order_inventory`/coupon/loyalty call plus a possible duplicate `payment_events` row and a possible duplicate confirmation email — not a money-losing or data-corrupting outcome, just an audit-log/email duplicate in a very narrow window.
- **Optional hardening (see §8):** an additive partial unique index on `payment_events` for this exact `(order_id, event_type)` combination, which would turn the second concurrent `INSERT` into a constraint violation the JS layer catches and treats as "someone else already confirmed this," closing the window completely. This is optional and can be deferred to a follow-up without blocking the rest of B1.

---

## 6. Admin approval behavior — target final state

All values below are **existing, already-allowed values** confirmed against the live CHECK constraints (`orders_status_final_chk`, `orders_payment_status_final_chk`, `orders_fulfillment_status_final_chk`, `payments_status_final_chk` — all in `supabase/migrations/20260629_cosmoskin_final_user_acceptance_fix_v2.sql:192-200`, further widened only for `fulfillment_status='review_required'` by the H0 hotfix, which is not relevant to this path). **No new status value is introduced anywhere in this plan.**

| Field | Target value after approval | Already achieved today? |
|---|---|---|
| `orders.payment_status` | `'paid'` | ✅ Yes |
| `orders.status` | `'paid'` (existing value, already used by `mark_payment_paid` today — this plan does not introduce `'confirmed'` or any other new status) | ✅ Yes |
| `orders.fulfillment_status` | `'preparing'` (existing value; ready for shipping prep, unchanged) | ✅ Yes |
| `payments.status` | `'paid'` | ❌ **New in this plan** |
| `payment_events` | One `bank_transfer_payment_confirmed` / `processed` row exists | ❌ **New in this plan** |
| `inventory_reservations` | Converted `'reserved'` → `'converted'` | ✅ Yes |
| `coupon_redemptions` (if a coupon was used) | `status='used'` | ❌ **New in this plan** |
| `loyalty_points_ledger` | One `pending` purchase-points row exists for the order | ✅ Yes |
| Customer email | `payment_confirmed_manual` sent exactly once | ⚠️ Sent today, but not de-duplicated — **fixed in this plan** |
| Admin audit | `order_status_events.created_by` = approving admin's email; `payment_events.metadata` carries `approved_by_email`/`approved_by_admin_id`; optional `admin_activity_logs` row | ❌ **New in this plan** |

---

## 7. Rejection/cancellation behavior — explicitly deferred

Bank transfer rejection already exists today via `action:'mark_bank_transfer_not_received'` in `functions/api/admin/orders.js` (lines 355-360): it releases inventory reservations, releases the coupon redemption (`status='released'`), cancels the order, and sends the `bank_transfer_not_received_cancelled` email. This is functionally adequate and is **not** part of the reported problem (which is specifically about approval finalization).

One symmetric gap was found while tracing this path for completeness: the `payments` row is never updated to `status='failed'` on rejection either (it stays `'awaiting_transfer'`), for the same structural reason as the approval-side gap (no code anywhere writes to `payments` from `admin/orders.js`). This is **explicitly deferred out of this B1 implementation pass** — it is a reporting/reconciliation nuisance (the order itself is correctly cancelled and stock/coupon are correctly released), not a customer- or money-facing bug, and fixing it is not required to close the P0-4 finding. It is recorded here so it is not silently lost, and can be picked up as a trivial one-line follow-up (`updateRows(context,'payments',{order_id:id},{status:'failed',...})` inside the existing `mark_bank_transfer_not_received` branch) whenever the user wants it.

---

## 8. Database/migration need

**No migration is required for the core fix.** Verified against live-tracked CHECK constraints and table definitions:
- `payments.status IN (..., 'paid', ...)` — already allows `'paid'` (`payments_status_final_chk`).
- `orders.status`/`orders.payment_status`/`orders.fulfillment_status` — already allow every value this plan writes; all are pre-existing, already-shipped-today values.
- `payment_events` — `provider`, `event_type`, `status`, `raw_reference` are plain `text` columns with no `CHECK` constraint at all (only `NOT NULL` on `provider`/`event_type`/`status`) — free to use `provider='bank_transfer'`, `event_type='bank_transfer_payment_confirmed'`, `status='processed'` with zero schema change.
- `coupon_redemptions.status` — no tracked `CHECK` constraint exists on this column in any migration (it is a baseline-only table per the pre-existing F2/P1-10 finding); `'used'` is already the column's own default value and is already written by the exact same code this plan relocates.
- `invoice_records.invoice_status IN ('pending','issued','failed','cancelled')` — `'pending'` already allowed (`invoice_records_invoice_status_check`).

**Optional, non-blocking migration (recommended as a follow-up, not a prerequisite):** an additive partial unique index to close the race-window noted in §5:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_events_bank_transfer_confirmed
  ON payment_events (order_id)
  WHERE provider = 'bank_transfer' AND event_type = 'bank_transfer_payment_confirmed' AND status = 'processed';
```
This is safe to add at any time (before, during, or after the code change) because it is additive-only and cannot conflict with any existing row (no such rows exist yet). It is not required to ship the rest of B1 and should be proposed as its own, separately-reviewable one-line migration if the user wants the extra hardening.

---

## 9. A1 RBAC compatibility — already satisfied, no work needed

Both admin mutation endpoints that can mark a bank-transfer order paid are **already gated** as of A1.2b:
- `functions/api/admin/orders.js` `onRequestPatch` → `await requireAdminPermission(context, 'orders:update');` (line 311).
- `functions/api/admin/orders/[id]/status.js` `onRequestPatch` → `await requireAdminPermission(context, 'orders:update');` (line 14).

No new permission string, no new `admin_permissions` seed row, and no RBAC code change is needed for B1. The new `confirmManualBankTransferPayment()` helper is called from inside these already-gated handlers, after their existing `assertAdmin()` + `requireAdminPermission()` checks, so it inherits the existing guard automatically — it must **not** perform its own separate `assertAdmin`/`requireAdminPermission` call (that would be redundant and out of pattern with every other internal helper in this codebase, none of which re-check admin auth themselves).

---

## 10. Validator plan — `scripts/validate-b1-bank-transfer-finalization.mjs`

Following the existing house style (see `scripts/validate-h0-live-payment-rpc-hotfix.mjs`, `scripts/validate-a1-admin-endpoint-coverage.mjs`): static source-text and byte-diff checks, no live DB access, `process.exit(1)` on any failure with a clear list.

Planned checks:

1. **Required files exist:** `functions/api/_lib/commerce-finalization.js` (new), `functions/api/iyzico-callback.js`, `functions/api/admin/orders.js`, `functions/api/admin/orders/[id]/status.js` (if item 6 of §4 is included).
2. **iyzico callback behavior unchanged (critical gate):** byte-diff `functions/api/iyzico-callback.js` against its pre-B1 content with the two relocated function bodies (`finalizeCommerceAfterPayment`, `ensureShipmentShell`) and their local `function` keyword stripped out on both sides, plus the new `import { finalizeCommerceAfterPayment, ensureShipmentShell } from './_lib/commerce-finalization.js';` line stripped — the remainder must be byte-identical. This directly enforces "changes iyzico callback behavior" → fail.
3. **Relocated functions are byte-identical to their original bodies:** extract the `finalizeCommerceAfterPayment`/`ensureShipmentShell` function bodies from the new shared file and diff them (whitespace-normalized) against a checked-in snapshot of the pre-B1 bodies (captured once, at implementation time, into the validator itself as a string constant) — fail if anything beyond the relocation changed.
4. **New helper exists and is idempotent by construction:** regex-check `commerce-finalization.js` for the exact idempotency-gate query shape (`event_type: 'eq.bank_transfer_payment_confirmed'` or equivalent, `status: 'eq.processed'`) appearing **before** any `insertRow`/`updateRows` call in `confirmManualBankTransferPayment`'s source (textual ordering check — the `SELECT` pattern's match index must be lower than every mutating call's match index within the function body).
5. **`payments` table is actually written:** regex-check `commerce-finalization.js` contains `updateRows(context, 'payments', ...)` with `status: 'paid'` inside `confirmManualBankTransferPayment`.
6. **`payment_events` insert is present with the correct shape:** regex-check for `insertRow(context, 'payment_events', ...)` containing `provider: 'bank_transfer'` and `event_type: 'bank_transfer_payment_confirmed'` and `status: 'processed'`.
7. **Admin call site is correctly gated:** regex-check `functions/api/admin/orders.js` contains a call to `confirmManualBankTransferPayment(` **inside** an `if` condition that textually includes `payment_method === 'bank_transfer'` (guards against accidentally calling it unconditionally for card orders).
8. **Email de-dup fix present:** regex-check the email-send gate in `admin/orders.js` includes `before.payment_status !== 'paid'` (or equivalent) alongside the existing `mark_payment_paid`/`paymentStatus === 'paid'` condition.
9. **RBAC guard untouched:** count of `requireAdminPermission(` occurrences in `admin/orders.js` and `admin/orders/[id]/status.js` must be `>=` the pre-B1 count (never decreases) — guards against an accidental RBAC regression while editing these files.
10. **No invalid status values introduced:** grep the diff of `admin/orders.js`, `admin/orders/[id]/status.js`, and `commerce-finalization.js` for any string literal assigned to `status`/`payment_status`/`fulfillment_status`/`invoice_status` and assert every one is a member of the existing allow-lists already hardcoded in this repo (`VALID_ORDER_STATUSES`, `VALID_PAYMENT_STATUSES`, `VALID_FULFILLMENT` in `admin/orders.js` itself, plus the DB CHECK lists documented in §8) — fails if anything new/invented appears.
11. **Forbidden-paths guard:** `functions/api/create-checkout.js`, `functions/api/_lib/coupons.js`, `functions/api/_lib/loyalty-ledger.js`, `functions/api/_lib/inventory.js`, `functions/api/cron/*.js` must have **zero** diff versus their pre-B1 content (checked via `git diff --stat`, same pattern as the existing A1.2 validators' `forbiddenPaths` list) — enforces "without touching unrelated checkout/payment logic."
12. **Full regression gate:** the validator's final step shells out (`execSync`) to run every pre-existing validator that touches any file this plan modifies, and fails loudly (listing which one) if any of them exits non-zero:
    - `scripts/validate-h0-live-payment-rpc-hotfix.mjs` (touches `iyzico-callback.js`)
    - `scripts/validate-h1-return-attachment-storage-rls.mjs`
    - `scripts/validate-h2-return-attachment-preview.mjs`
    - `scripts/validate-a1-admin-rbac-hardening.mjs`
    - `scripts/validate-a1-admin-endpoint-coverage.mjs` (touches `admin/orders.js`, `admin/orders/[id]/status.js`)
    - `scripts/validate-account-batch-1-safe-fixes.mjs`
    - `scripts/validate-account-batch-3-order-cancellation.mjs`
    - `scripts/validate-account-batch-4-loyalty-ledger.mjs`
    - `scripts/validate-checkout-payment-email-e2e.mjs` (touches `create-checkout.js`/`order-email.js`, both in the forbidden-paths set above — this is the direct "card payment callback still passes" regression gate at the validator level)

---

## 11. Test plan (additions to `tests/local-integration.test.mjs`)

`tests/local-integration.test.mjs` already imports and exercises `functions/api/admin/orders.js` and `functions/api/iyzico-callback.js` handlers directly (in-process, no live DB — the project's existing local-integration pattern). New cases to add, all following that existing pattern:

1. **Approve a pending bank-transfer order** — create via `create-checkout.js` (`payment_method:'bank_transfer'`), PATCH `admin/orders.js` with `action:'mark_payment_paid'` as an authorized admin; assert `payments.status==='paid'`, one `payment_events` row with `event_type='bank_transfer_payment_confirmed'`, `orders.payment_status==='paid'`, `inventory_reservations` converted, one `payment_confirmed_manual` email logged.
2. **Approve the same order twice** — repeat the PATCH; assert no second `payment_events` row, no second email log entry, no error, `payments`/`orders` unchanged from the first approval's result.
3. **Approve an order that is already `payment_status='paid'` via a different path** (e.g. simulate a state where `orders.payment_status` was already flipped by some other action without a matching `payment_events` row) — assert the helper still runs its finalization exactly once (idempotency key is `payment_events`, not `orders.payment_status`), documenting the intentional precedence.
4. **Approve an order with a coupon** — checkout with `coupon_code`, approve; assert `coupon_redemptions.status==='used'` and mirrored `customer_coupons.status==='used'`.
5. **Approve an order with reserved inventory** — assert `inventory_reservations.status` moves from `'reserved'` to `'converted'` and `product_inventory.stock_on_hand`/`stock_reserved` change exactly once.
6. **Approve an order eligible for loyalty points** — assert exactly one `pending` `loyalty_points_ledger` row is created (not two, even though both the generic before/after hook and `finalizeCommerceAfterPayment()` call `awardOrderPoints()`).
7. **Approve with an unauthorized admin** (no `admin_users` row, or a role without `orders:update`) — assert `403` and assert **zero** side effects fired (no `payments` write, no `payment_events`, no email) — this is the RBAC regression gate for this specific action.
8. **Card payment callback still passes unchanged** — re-run the existing iyzico-callback success-path test(s) verbatim after the `finalizeCommerceAfterPayment`/`ensureShipmentShell` relocation; assert identical outcomes (same `payments`/`orders`/`coupon_redemptions`/`invoice_records`/loyalty results as before the relocation) — this is the direct regression proof that the relocation changed nothing observable.
9. **Rejection/cancellation behavior unchanged** — re-run/confirm the existing `mark_bank_transfer_not_received` behavior (inventory released, coupon released, cancellation email sent) is byte-for-byte unchanged, since §7 explicitly defers any change to that branch.

---

## 12. Rollback plan

- **Code rollback:** every production change in this plan is additive/localized to three files (`iyzico-callback.js` import swap, new `commerce-finalization.js` file, `admin/orders.js` new `if` block + one condition edit, optionally `admin/orders/[id]/status.js` one new `if` block). Reverting the commit fully restores pre-B1 behavior — no data migration is entangled with the code change, so a plain `git revert` is sufficient and safe at any time.
- **No migration to roll back** in the core fix (see §8) — if the optional partial unique index from §8 is added later, its rollback is a single `DROP INDEX IF EXISTS uq_payment_events_bank_transfer_confirmed;`, also additive-safe and reversible.
- **Data already written before a rollback decision:** because every new write (`payments.status='paid'`, `payment_events` row, `coupon_redemptions.status='used'`, `invoice_records` shell) is a **correct, intended, permanent** finalization of a real approved payment, there is no "undo" requirement for already-processed orders — rolling back the code only stops *new* approvals from being fully finalized going forward; it does not need to (and should not) revert already-finalized orders.
- **Staged verification before production:** exactly the same pattern used for H0/A1.2a/b/c — run the full validator battery (§10 item 12) plus the new test cases (§11) locally first, then deploy, then manually approve one real staging bank-transfer order and confirm all six target-state rows from §6 by hand before considering the batch closed.

---

*Plan complete. No files were modified, no migrations were created, no SQL was run, and nothing was deployed as part of this pass, per the read-only planning scope of this request.*
