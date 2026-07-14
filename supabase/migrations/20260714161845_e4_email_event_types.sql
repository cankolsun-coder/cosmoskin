-- E4 — Transactional email integrity (2026-07-14)
-- Additive, idempotent: extends the email_events email_type CHECK constraint
-- with the two lifecycle events wired in E4. Follows the exact constraint-swap
-- pattern used by 20260511/20260628/20260702. No data is modified or dropped.
-- Production apply is manual (see COSMOSKIN_E4 runbooks); code paths degrade
-- gracefully (send still happens, event insert logs a console error) until
-- this is applied.

ALTER TABLE IF EXISTS public.email_events DROP CONSTRAINT IF EXISTS email_events_email_type_check;
ALTER TABLE IF EXISTS public.email_events ADD CONSTRAINT email_events_email_type_check CHECK (email_type IN (
  'order_created','payment_success','payment_failed','shipment_created','shipment_updated','shipment_delivered',
  'restock_alert','refund_created','refund_completed','return_request_received','return_approved','return_rejected',
  'return_code_shared','return_received','refund_pending','review_request','payment_confirmed_manual',
  'bank_transfer_pending','bank_transfer_reminder','bank_transfer_not_received_cancelled','order_preparing','order_packed',
  -- E4 additions:
  'invoice_ready','order_cancelled'
));

-- E4 durable idempotency claim: at most one live claim ('pending') or
-- completed send ('sent') may exist per idempotency key. The refund/invoice
-- dispatchers INSERT a 'pending' email_events claim row BEFORE sending; this
-- partial unique index makes that claim atomic across concurrent callers
-- (admin refunds.js and returns.js firing for the same refund). 'failed' and
-- 'skipped' rows are deliberately excluded so a failed send stays retryable
-- and duplicate-skip audit rows are unbounded.
-- Pre-apply check — must return 0 rows; resolve any duplicates first:
--   SELECT metadata->>'idempotency_key' AS key, count(*) FROM public.email_events
--   WHERE metadata->>'idempotency_key' IS NOT NULL AND status IN ('pending','sent')
--   GROUP BY 1 HAVING count(*) > 1;
-- Note: plain CREATE INDEX takes a brief write lock on email_events; the
-- table is low-volume (transactional email log). If it has grown large at
-- apply time, run the CREATE UNIQUE INDEX CONCURRENTLY variant outside a
-- transaction instead.
CREATE UNIQUE INDEX IF NOT EXISTS email_events_idempotency_claim_uniq
  ON public.email_events ((metadata->>'idempotency_key'))
  WHERE metadata->>'idempotency_key' IS NOT NULL AND status IN ('pending','sent');

-- Verification (read-only):
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.email_events'::regclass AND conname = 'email_events_email_type_check';
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE schemaname = 'public' AND tablename = 'email_events'
--     AND indexname = 'email_events_idempotency_claim_uniq';
-- Rollback:
--   DROP INDEX IF EXISTS public.email_events_idempotency_claim_uniq;
--   then re-run the 20260702 constraint block (drops the two new values;
--   only do this after confirming no rows with the new types exist, or the
--   re-add will fail — in that case leave this constraint in place).
