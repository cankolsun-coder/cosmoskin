# COSMOSKIN E4 — Rollback Plan

## Blast radius
Backend email templates/dispatch (6 function files, 3 new libs/scripts), one hosted image asset,
one additive un-executed migration file, tests, docs. No checkout pricing, refund math, stock,
coupon or fiscal logic. Emails are side-effects after committed transactions — rolling E4 back
cannot corrupt orders/refunds/invoices.

## Full rollback
```bash
git revert <E4_COMMIT_HASH>
```
Consequences: refund emails lose the amount/type block and cross-path dedup (duplicate-email
risk returns); invoice_ready emails stop entirely; back-in-stock loses price + guaranteed image;
templates return to the Didot text-logo; cancelled orders again receive return-review copy.

## Partial rollback options
- **Branding only:** revert order-email.js/restock-email.js hunks; keep lifecycle-emails.js
  (dedup) intact.
- **Invoice email only:** remove the `dispatchInvoiceReadyEmail` calls in admin/invoices.js
  (the lib becomes dormant).
- **Refund dedup only:** NOT recommended in isolation — restoring the old direct
  `sendCommerceTransactionalEmail` call re-opens the double-email path via admin/returns.js.
- **Migration:** if `20260714161845_e4_email_event_types.sql` was already applied and E4 is reverted,
  leave the CHECK constraint in place (it is a superset; removing values fails if rows exist).
  The unique claim index can be dropped independently if needed:
  `DROP INDEX IF EXISTS public.email_events_idempotency_claim_uniq;` — only do this after the
  code revert, since the durable refund-email claim relies on it for cross-path atomicity.
  Nothing else depends on reverting it.
- **supabase.js:** E4 adds only the additive `updateRowsWhere` helper (conditional PATCH with
  `return=representation`); it changes no existing helper and reverts safely with the commit.

## Failure modes that do NOT require rollback
- Wordmark 404 before the asset deploys → emails show alt-text "COSMOSKIN"; fixed by deploy.
- Migration not applied → invoice_ready/order_cancelled event rows fail to insert (console
  errors); sends + dedup still safe (invoice metadata stamp).
- Brevo outage → events log `failed` + `pending_retry`; refunds/invoices unaffected.

## Post-rollback checks
```bash
node --test tests/local-integration.test.mjs      # E4 tests disappear with the revert
node scripts/validate-d2-refund-amount-correctness.mjs
```
Note: `tests/local-integration.test.mjs` A1.2c marker must revert together with refunds.js
(git revert handles this — do not cherry-pick one without the other).
