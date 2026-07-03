-- Batch 3 — Customer order cancellation before shipment (additive, idempotent)

alter table if exists public.orders
  add column if not exists cancel_reason text,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancel_request_reason text,
  add column if not exists cancellation_status text;

create index if not exists idx_orders_cancel_requested_at
  on public.orders (cancel_requested_at)
  where cancel_requested_at is not null;

comment on column public.orders.cancel_reason is 'Customer/admin reason when order is cancelled';
comment on column public.orders.cancel_request_reason is 'Customer reason when paid pre-shipment cancel is requested';
comment on column public.orders.cancellation_status is 'e.g. request_pending, cancelled';

-- Extend order_status_events.event_type safely (NOT VALID pattern used elsewhere in repo).
do $$
begin
  if to_regclass('public.order_status_events') is not null then
    alter table public.order_status_events drop constraint if exists order_status_events_event_type_final_check;
    alter table public.order_status_events drop constraint if exists order_status_events_event_type_final_chk;
    alter table public.order_status_events add constraint order_status_events_event_type_final_check check (
      event_type is null or event_type in (
        'order_created','status_updated','updated','confirmed','payment_awaiting_transfer','bank_transfer_reminder',
        'bank_transfer_not_received','bank_transfer_not_received_cancelled','payment_confirmed_manual','payment_success',
        'payment_failed','payment_authorized','stock_reserved','stock_released','order_preparing','order_packed',
        'shipment_created','shipment_updated','shipment_delivered','mark_payment_paid','mark_preparing','mark_packed',
        'mark_shipped','mark_delivered','cancel_order','mark_bank_transfer_not_received',
        'return_requested','return_approved','return_rejected','return_refunded','return_received','return_completed','return_cancelled',
        'refund_pending','refund_completed','refund_failed','invoice_pending','invoice_issued','invoice_cancelled',
        'order_processing_review_required','payment_duplicate_ignored','paid',
        'customer_cancel_requested'
      )
    ) not valid;
  end if;
end $$;
