# COSMOSKIN E4 — Safe Test Invoice Runbook

**Hard rules:** never issue an official e-Fatura/e-Arşiv document for testing, never call the QNB
integration (`functions/api/invoices/qnb-create.js`), never use production invoice numbering,
never attach a test invoice to a real customer's order, never email a real customer.

## A. Rendering-only verification (no DB, no send — default path)
```bash
node scripts/make-test-invoice-pdf.mjs        # writes email-previews/TEST-INVOICE-MALI-DEGERI-YOKTUR.pdf
node scripts/email-preview.mjs --only invoice_ready
open email-previews/invoice_ready.html        # verify block, CTA, branding
open email-previews/TEST-INVOICE-MALI-DEGERI-YOKTUR.pdf
```
The PDF is non-fiscal, numbered `TEST-2026-0001`, watermarked
“TEST BELGESIDIR - MALI DEGERI YOKTUR” with diagonal strokes, and states explicitly that the
official e-Fatura/e-Arşiv integration was not used.

## B. End-to-end delivery test (explicit, allowlisted send)
```bash
export BREVO_API_KEY=...                       # never commit/echo this
export E4_TEST_EMAIL_ALLOWLIST="you@yourdomain.tld"
node scripts/email-preview.mjs --only invoice_ready --send-to you@yourdomain.tld
```
Sends exactly one email, to the allowlisted address only, using fixture data
(`CS-TEST-E4-001`, `test-fixture@cosmoskin.invalid` as the fixture customer — the tool has no
customer/order lookup, so a real customer cannot be selected). Verify in Gmail web + mobile:
wordmark, invoice block, “Faturanı Görüntüle” CTA, Turkish characters, no broken images.

## C. Full application-flow test (staging/wrangler, admin auth, TEST order only)
Only if you need to exercise the real dispatch path:
1. Run under wrangler with a **test** Supabase project/branch (never production data).
2. Create a Havale/EFT test order with a dedicated test user (your own inbox).
3. Upload the watermarked test PDF somewhere HTTPS-accessible (e.g. a private bucket signed URL).
4. In the admin panel create an invoice record for the TEST order: type `manual`,
   status `issued`, PDF URL from step 3, invoice number starting `TEST-`.
5. The `invoice_ready` email dispatches once; repeating the PATCH must return
   `skipped_duplicate` (same version). Changing the PDF URL re-sends (new version) — expected.
6. Clean up the test rows afterwards.

## D. What blocks a send (by design)
- invoice status not `issued`/`ready` → `invoice_not_ready`
- missing / non-HTTPS PDF URL → `invoice_pdf_missing`
- order/customer email unresolvable → `customer_email_missing`
- same invoice version already emailed → `skipped_duplicate`

## E. Production migration prerequisite
`supabase/migrations/20260714161845_e4_email_event_types.sql` must be applied (manually, per the
DB1C0 baseline process) before `invoice_ready` events appear in `email_events`. Sends and
dedup (metadata stamp) work before that; only the audit log insert fails visibly in logs.
Verification SQL is embedded in the migration file.
