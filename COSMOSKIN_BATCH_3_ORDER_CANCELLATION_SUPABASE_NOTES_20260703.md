# COSMOSKIN Batch 3 — Supabase Notes (2026-07-03)

## Migration

Apply after deploy:

```bash
# Via Supabase CLI or SQL editor
supabase db push
# or run manually:
# supabase/migrations/20260703_batch3_customer_order_cancellation.sql
```

File: `supabase/migrations/20260703_batch3_customer_order_cancellation.sql`

## New columns on `orders` (all nullable, idempotent)

| Column | Type | Purpose |
|--------|------|---------|
| `cancel_reason` | text | Reason when order is directly cancelled |
| `cancel_requested_at` | timestamptz | When customer submitted paid pre-shipment cancel request |
| `cancelled_by` | text | e.g. `customer`, `admin` |
| `cancel_request_reason` | text | Reason on paid cancel **request** (not completed cancel) |
| `cancellation_status` | text | e.g. `request_pending`, `cancelled` |

Index: `idx_orders_cancel_requested_at` (partial, where `cancel_requested_at is not null`).

## Event type extension

Adds `customer_cancel_requested` to `order_status_events.event_type` CHECK using the repo’s **NOT VALID** drop/recreate pattern (same as prior migrations). No constraint name guessing at runtime beyond dropping known aliases:

- `order_status_events_event_type_final_check`
- `order_status_events_event_type_final_chk`

Direct unpaid cancel continues to use existing `cancel_order` event type with `source = customer`.

## No RLS changes

Customer access remains via Cloudflare Functions service role + ownership checks in `POST /api/account/orders/:id/cancel`.

## Rollback (manual, if needed)

```sql
-- Only if no production data depends on new columns/events yet
alter table public.orders drop column if exists cancel_reason;
alter table public.orders drop column if exists cancel_requested_at;
alter table public.orders drop column if exists cancelled_by;
alter table public.orders drop column if exists cancel_request_reason;
alter table public.orders drop column if exists cancellation_status;
drop index if exists idx_orders_cancel_requested_at;
-- Revert event_type CHECK separately if customer_cancel_requested rows exist
```

## Verification queries

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'orders'
  and column_name in ('cancel_reason','cancel_requested_at','cancelled_by','cancel_request_reason','cancellation_status');

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.order_status_events'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) like '%customer_cancel_requested%';
```
