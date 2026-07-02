-- COSMOSKIN Customer Returns + Account/PDP Polish
-- Backward-compatible launch patch. Does not drop tables or data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS return_number text NULL;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS delivered_at timestamptz NULL;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS requested_at timestamptz DEFAULT now();
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS return_window_ends_at timestamptz NULL;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS is_within_return_window boolean DEFAULT false;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS hygiene_confirmed boolean DEFAULT false;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS unused_confirmed boolean DEFAULT false;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS seal_intact_confirmed boolean DEFAULT false;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS resaleable_confirmed boolean DEFAULT false;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS return_terms_confirmed boolean DEFAULT false;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS rejection_reason text NULL;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS return_code_shared_at timestamptz NULL;

UPDATE public.return_requests
SET return_number = COALESCE(return_number, 'CS-RET-' || upper(substr(replace(id::text,'-',''),1,10)))
WHERE return_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_return_requests_return_number ON public.return_requests(return_number) WHERE return_number IS NOT NULL;

ALTER TABLE IF EXISTS public.return_requests DROP CONSTRAINT IF EXISTS return_requests_status_check;
ALTER TABLE IF EXISTS public.return_requests ADD CONSTRAINT return_requests_status_check CHECK (status IN (
  'requested','under_review','approved','return_code_shared','waiting_customer_ship','in_transit','received','inspection','refund_pending','refunded','rejected','cancelled','closed'
));
ALTER TABLE IF EXISTS public.return_requests DROP CONSTRAINT IF EXISTS return_requests_refund_status_check;
ALTER TABLE IF EXISTS public.return_requests ADD CONSTRAINT return_requests_refund_status_check CHECK (refund_status IN ('not_started','pending','completed','failed'));

CREATE TABLE IF NOT EXISTS public.return_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id uuid NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  order_item_id uuid NULL,
  product_id text NULL,
  product_slug text NULL,
  product_name_snapshot text NOT NULL,
  sku_snapshot text NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  reason text NOT NULL,
  note text NULL,
  unit_price_snapshot numeric(12,2) NULL,
  refundable_amount numeric(12,2) NULL,
  condition_status text NULL DEFAULT 'customer_declared',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_return_request_items_request ON public.return_request_items(return_request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_return_request_items_product ON public.return_request_items(product_slug, return_request_id);

CREATE TABLE IF NOT EXISTS public.return_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id uuid NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  return_request_item_id uuid NULL REFERENCES public.return_request_items(id) ON DELETE SET NULL,
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid NULL,
  file_path text NOT NULL,
  file_url text NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NULL,
  storage_bucket text NOT NULL DEFAULT 'return-attachments',
  uploaded_by text NOT NULL DEFAULT 'customer',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT return_request_attachments_mime_check CHECK (mime_type IN ('image/jpeg','image/png','image/webp','video/mp4')),
  CONSTRAINT return_request_attachments_size_check CHECK (file_size IS NULL OR file_size <= 10485760)
);
CREATE INDEX IF NOT EXISTS idx_return_request_attachments_request ON public.return_request_attachments(return_request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_return_request_attachments_customer ON public.return_request_attachments(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.return_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id uuid NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  old_status text NULL,
  new_status text NOT NULL,
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id uuid NULL,
  note text NULL,
  metadata jsonb NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_return_status_events_request ON public.return_status_events(return_request_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.return_shipping_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier text NOT NULL DEFAULT 'DHL',
  return_code text NULL,
  instructions text NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_return_shipping_settings_active ON public.return_shipping_settings(is_active, updated_at DESC);

ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS campaign_emails boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS stock_notifications boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS routine_reminders boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS newsletter boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS sms_notifications boolean DEFAULT false;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS birthday date NULL;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS birth_date_locked boolean DEFAULT false;

ALTER TABLE IF EXISTS public.email_events DROP CONSTRAINT IF EXISTS email_events_email_type_check;
ALTER TABLE IF EXISTS public.email_events ADD CONSTRAINT email_events_email_type_check CHECK (email_type IN (
  'order_created','payment_success','payment_failed','shipment_created','shipment_updated','shipment_delivered','restock_alert','refund_created','refund_completed','return_request_received','return_approved','return_rejected','return_code_shared','return_received','refund_pending','review_request','payment_confirmed_manual','bank_transfer_pending','bank_transfer_reminder','bank_transfer_not_received_cancelled','order_preparing','order_packed'
));

-- Manual storage checklist:
-- Create Supabase Storage bucket named: return-attachments
-- Recommended: private bucket + RLS/signed URLs. Do not allow SVG/PDF/ZIP/EXE uploads.
