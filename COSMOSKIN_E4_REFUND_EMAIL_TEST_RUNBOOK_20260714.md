# COSMOSKIN E4 — Refund Email Test Runbook

**Hard rules:** never use real card payments; never refund a real customer order for testing;
E4 changed only email dispatch/content — refund amounts remain fully owned by D2/D2B/D3 logic.

## A. Rendering verification (no DB, no send)
```bash
node scripts/email-preview.mjs --only refund_full
node scripts/email-preview.mjs --only refund_partial
open email-previews/refund_full.html email-previews/refund_partial.html
```
Check: İade Bilgisi block (Sipariş No, İade Referansı, İade Tutarı, İade Türü *Tam/Kısmi iade*,
Ödeme Yöntemi), bank-reflection disclaimer, product rows with images, canonical wordmark.

## B. Delivery test (explicit, allowlisted)
```bash
export BREVO_API_KEY=... E4_TEST_EMAIL_ALLOWLIST="you@yourdomain.tld"
node scripts/email-preview.mjs --only refund_partial --send-to you@yourdomain.tld
```

## C. Application-flow test (staging/wrangler + test data only)
1. Test order (Havale/EFT), mark paid via admin manual confirmation.
2. Admin → refunds → create refund `status=completed` with a `TEST-REF-...` provider reference.
   - Expect exactly one refund_completed email; response `email.sent=true`.
   - `email_events`: a claim row settled to `sent` with
     `metadata.idempotency_key = refund_completed:refund:{refund_id}:{email}` for a standalone
     refund, or `refund_completed:return:{return_request_id}:{email}` when the refund is
     return-linked (both admin paths converge on the return-scoped key).
   - `refund_records.metadata.email` stamped `{ state: "sent", idempotency_key, sent_at }`.
3. **Duplicate-click test:** repeat the same POST for the same return request →
   endpoint answers `idempotent: true` and the response email object is
   `{ skipped: true, reason: "skipped_duplicate" }` — never a second send.
4. **Cross-path test:** for a return-linked refund, additionally set the return request to
   `refunded` via admin returns → expect `skipped_duplicate` in the response email object,
   and an `email_events` row with status `skipped`.
5. **Failure test:** point `BREVO_API_KEY` at a broken key and complete a refund →
   refund record still persists (never rolled back); the claim settles to `failed` +
   `metadata.pending_retry=true` and `refund_records.metadata.email.state = "failed"`.
   **Retry:** POST the same completion again (repeated completion callback) — the failed
   state is claimable again and exactly one email goes out on success. With the key simply
   unset, the claim settles to `skipped` (`BREVO_API_KEY_missing`) — also retryable.
6. **Partial-refund legitimacy:** two separate partial refunds on one order are two refund
   records → two (correct) emails, each with its own amount.

## C2. Durable claim + stale-claim retry policy
- Before any send, the dispatcher acquires a durable claim: a compare-and-set on
  `refund_records.metadata.email` (`(none|failed) → pending_claimed → sent|failed`) plus a
  `pending` `email_events` claim row made unique per idempotency key by the
  `email_events_idempotency_claim_uniq` index (migration `20260714161845_e4_email_event_types.sql`).
- If the claim stores are unreachable the dispatcher **refuses to send**
  (`refund_email_claim_unavailable`, retryable) — an outage can delay a refund email but can
  never duplicate one, and never touches the refund itself.
- **Stale-claim policy:** a `pending_claimed` claim older than **15 minutes**
  (`REFUND_CLAIM_STALE_MS`) is treated as abandoned (claimant crashed between claim and send)
  and may be taken over by the next completion/retry trigger. Fresh pending claims are never
  stolen. Operationally: if a refund email seems stuck `pending`, wait 15 minutes and repeat
  the completion callback; do not edit `email_events` rows by hand.
- Until the migration is applied in production the unique index is not enforced; the
  refund-record CAS still serializes every record-backed dispatch (the pre-migration residual
  race is limited to concurrent record-less returns callbacks, closed by the migration).

## D. What the email shows (and where it comes from)
| Field | Source |
|---|---|
| İade Tutarı / para birimi | `refund_records.amount/currency` (validated by D2 pipeline) |
| İade Türü | display comparison of refund.amount vs order.total_amount |
| İade Referansı | `refund_records.provider_reference` |
| Ödeme Yöntemi | refund/order provider labels (iyzico ↔ Havale/EFT) |
| Ürün satırları | order items (paid snapshot names/images) |
