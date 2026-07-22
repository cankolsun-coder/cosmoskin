-- P1 fix: uq_return_requests_active_order only covered the original 4
-- statuses ('requested','under_review','approved','received') from
-- 20260511_phase2_invoice_returns_refunds.sql. The status enum was expanded
-- in 20260702_customer_returns_account_pdp_polish.sql to add
-- 'return_code_shared','waiting_customer_ship','in_transit','inspection',
-- 'refund_pending' — this index was never updated to match, so a duplicate
-- return request could be created for an order whose existing request had
-- moved into one of those newer statuses. Matches ACTIVE_RETURN_STATUSES
-- already used app-side in functions/api/_lib/order-cancellation.js.
--
-- Pre-verified against production: no order currently has more than one
-- return_requests row across the full active-status set, so this is a safe,
-- non-conflicting index swap.

DROP INDEX IF EXISTS public.uq_return_requests_active_order;
CREATE UNIQUE INDEX uq_return_requests_active_order
  ON public.return_requests (order_id)
  WHERE (status = ANY (ARRAY[
    'requested'::text, 'under_review'::text, 'approved'::text, 'return_code_shared'::text,
    'waiting_customer_ship'::text, 'in_transit'::text, 'received'::text, 'inspection'::text,
    'refund_pending'::text
  ]));

-- Verification (read-only):
--   SELECT indexdef FROM pg_indexes WHERE schemaname='public'
--     AND tablename='return_requests' AND indexname='uq_return_requests_active_order';
-- Rollback:
--   DROP INDEX IF EXISTS public.uq_return_requests_active_order;
--   CREATE UNIQUE INDEX uq_return_requests_active_order ON public.return_requests (order_id)
--     WHERE (status = ANY (ARRAY['requested'::text,'under_review'::text,'approved'::text,'received'::text]));
