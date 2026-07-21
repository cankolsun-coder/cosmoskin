-- P1 fix: add 'refund_failed' to the email_events email_type CHECK constraint.
-- Additive, idempotent — follows the exact constraint-swap pattern used by
-- 20260511/20260628/20260702/20260714161845. No data modified or dropped.
-- 'refund_pending' is already allowed (added in 20260714161845); this only
-- adds the missing 'refund_failed' value so the P1 refund-lifecycle emails
-- (refund_pending / refund_failed customer notifications) can log events.

ALTER TABLE IF EXISTS public.email_events DROP CONSTRAINT IF EXISTS email_events_email_type_check;
ALTER TABLE IF EXISTS public.email_events ADD CONSTRAINT email_events_email_type_check CHECK (email_type IN (
  'order_created','payment_success','payment_failed','shipment_created','shipment_updated','shipment_delivered',
  'restock_alert','refund_created','refund_completed','return_request_received','return_approved','return_rejected',
  'return_code_shared','return_received','refund_pending','review_request','payment_confirmed_manual',
  'bank_transfer_pending','bank_transfer_reminder','bank_transfer_not_received_cancelled','order_preparing','order_packed',
  'invoice_ready','order_cancelled',
  -- P1 addition:
  'refund_failed'
));

-- Verification (read-only):
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.email_events'::regclass AND conname = 'email_events_email_type_check';
-- Rollback:
--   Re-run the 20260714161845 constraint block (drops 'refund_failed'; only
--   do this after confirming no rows with that type exist).
