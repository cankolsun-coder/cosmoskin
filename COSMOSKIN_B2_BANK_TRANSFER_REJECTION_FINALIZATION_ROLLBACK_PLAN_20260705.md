# COSMOSKIN B2 — Bank Transfer Rejection / Cancellation Finalization — Rollback Plan

## Why a rollback would be needed

- A preview or production bank-transfer rejection double-writes `payment_events`, releases a coupon/inventory twice, or double-sends the rejection email.
- `rejectManualBankTransferPayment()` incorrectly marks a paid order as failed (should be structurally impossible given the already-paid guard, but treat any occurrence as a P0).
- A regression is observed in B1 approval behavior, card payment (iyzico) behavior, or generic `cancel_order` behavior after this batch.
- Cloudflare Access / RBAC verification surfaces that `orders:update` is not actually enforced as expected in the live environment.

## Rollback scope

B2 only touched:
1. `functions/api/_lib/commerce-finalization.js` (added `rejectManualBankTransferPayment`, no edits to existing exports)
2. `functions/api/admin/orders.js` (`mark_bank_transfer_not_received` block + response shape)
3. `functions/api/admin/orders/[id]/status.js` (`cancelled`-status branch + `created_by` fix + response shape)
4. `scripts/validate-b1-bank-transfer-finalization.mjs` (validator-only, no runtime effect)
5. `scripts/validate-b2-bank-transfer-rejection-finalization.mjs` (new, validator-only, no runtime effect)
6. `tests/local-integration.test.mjs` (test-only, no runtime effect)

No database schema, no RPC/SQL function, no migration was touched. **Rollback is a pure code revert — no database rollback is required.**

## Rollback procedure (pre-deploy / local-only state)

Since B2 has not been deployed and remains as uncommitted local changes at the end of this batch (same as B1's own end-of-batch state), rollback is simply not committing/deploying these changes:

1. Do not commit or push the working-tree changes listed above.
2. If you need to discard B2 specifically while keeping B1:
   - Revert `functions/api/admin/orders.js` and `functions/api/admin/orders/[id]/status.js` to their B1-era state by removing:
     - the `rejectManualBankTransferPayment` import
     - the `bankTransferRejection`-related block in each file
     - the `bank_transfer_rejection` key from each JSON response
     - the `created_by: getAccessEmail(context) || 'admin'` addition in `status.js`'s `order_status_events` insert (optional — this specific fix is low-risk and can be kept even if the rest of B2 is rolled back, since it only adds an audit field and changes no business logic)
   - Remove the `rejectManualBankTransferPayment` export from `functions/api/_lib/commerce-finalization.js`.
   - Restore the two byte-identical-to-HEAD assertions in `scripts/validate-b1-bank-transfer-finalization.mjs` (§10, as they existed at the end of B1).
   - Delete `scripts/validate-b2-bank-transfer-rejection-finalization.mjs`.
   - Revert the B2-specific test additions in `tests/local-integration.test.mjs`, restoring the original B1-era rejection test.

## Rollback procedure (post-deploy, if this ever ships)

If B2 has already been deployed to production and needs to be rolled back:

1. Redeploy the pre-B2 build (the B1-only build, or pre-B1 if B1 also needs rolling back) via the Cloudflare Pages dashboard/CLI ("rollback to previous deployment" or redeploy the last-known-good commit).
2. No database migration needs to be reverted — B2 introduced zero schema changes.
3. Any `payment_events` rows with `event_type = 'bank_transfer_payment_rejected'` that were written while B2 was live are harmless, additive audit rows — they do not need to be deleted or reverted; they simply stop being written once the code is rolled back.
4. Any `payments.status = 'failed'` or `coupon_redemptions.status = 'released'` writes made by B2 while live reflect a real rejection that already happened — these should **not** be reverted, as reverting them would reintroduce the exact inconsistent state B2 was designed to fix. Only roll back the **code**, not any rejection data that was correctly recorded.
5. Verify post-rollback that a manual bank-transfer rejection via the admin UI still produces the pre-B2 behavior (order cancelled, inventory released, coupon released inline, email sent) — i.e. confirm the rollback build behaves like the B1-era code, not a broken intermediate state.

## Post-rollback verification

```bash
node --check functions/api/_lib/commerce-finalization.js
node --check functions/api/admin/orders.js
node --check "functions/api/admin/orders/[id]/status.js"
node scripts/validate-b1-bank-transfer-finalization.mjs
node --test tests/local-integration.test.mjs
```
