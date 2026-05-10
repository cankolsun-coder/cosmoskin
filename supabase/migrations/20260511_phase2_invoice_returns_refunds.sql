-- COSMOSKIN Phase 2: invoice, returns, refunds, shipment events and customer operations foundation.
-- Safe to run after Phase 1. It does not create official invoices, refunds, or carrier integrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS invoice_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  invoice_type text NOT NULL DEFAULT 'e_arsiv',
  invoice_status text NOT NULL DEFAULT 'pending',
  invoice_number text NULL,
  provider text NULL,
  provider_reference text NULL,
  pdf_url text NULL,
  issued_at timestamptz NULL,
  error_message text NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb NULL,
  CONSTRAINT invoice_records_invoice_type_check CHECK (invoice_type IN ('e_fatura','e_arsiv','manual')),
  CONSTRAINT invoice_records_invoice_status_check CHECK (invoice_status IN ('pending','issued','failed','cancelled'))
);

ALTER TABLE IF EXISTS invoice_records ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'e_arsiv';
ALTER TABLE IF EXISTS invoice_records ADD COLUMN IF NOT EXISTS invoice_status text NOT NULL DEFAULT 'pending';
ALTER TABLE IF EXISTS invoice_records ADD COLUMN IF NOT EXISTS invoice_number text NULL;
ALTER TABLE IF EXISTS invoice_records ADD COLUMN IF NOT EXISTS provider text NULL;
ALTER TABLE IF EXISTS invoice_records ADD COLUMN IF NOT EXISTS provider_reference text NULL;
ALTER TABLE IF EXISTS invoice_records ADD COLUMN IF NOT EXISTS pdf_url text NULL;
ALTER TABLE IF EXISTS invoice_records ADD COLUMN IF NOT EXISTS issued_at timestamptz NULL;
ALTER TABLE IF EXISTS invoice_records ADD COLUMN IF NOT EXISTS error_message text NULL;
ALTER TABLE IF EXISTS invoice_records ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE IF EXISTS invoice_records ADD COLUMN IF NOT EXISTS metadata jsonb NULL;
ALTER TABLE IF EXISTS invoice_records DROP CONSTRAINT IF EXISTS invoice_records_invoice_type_check;
ALTER TABLE IF EXISTS invoice_records ADD CONSTRAINT invoice_records_invoice_type_check CHECK (invoice_type IN ('e_fatura','e_arsiv','manual'));
ALTER TABLE IF EXISTS invoice_records DROP CONSTRAINT IF EXISTS invoice_records_invoice_status_check;
ALTER TABLE IF EXISTS invoice_records ADD CONSTRAINT invoice_records_invoice_status_check CHECK (invoice_status IN ('pending','issued','failed','cancelled'));
CREATE INDEX IF NOT EXISTS idx_invoice_records_order ON invoice_records(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_records_status ON invoice_records(invoice_status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_records_invoice_number ON invoice_records(invoice_number) WHERE invoice_number IS NOT NULL AND invoice_number <> '';

CREATE TABLE IF NOT EXISTS return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  user_id uuid NULL,
  customer_email text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  customer_note text NULL,
  admin_note text NULL,
  refund_status text NOT NULL DEFAULT 'not_started',
  requested_items jsonb NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT return_requests_status_check CHECK (status IN ('requested','under_review','approved','rejected','received','refunded','closed')),
  CONSTRAINT return_requests_refund_status_check CHECK (refund_status IN ('not_started','pending','completed','failed'))
);

ALTER TABLE IF EXISTS return_requests ADD COLUMN IF NOT EXISTS user_id uuid NULL;
ALTER TABLE IF EXISTS return_requests ADD COLUMN IF NOT EXISTS customer_note text NULL;
ALTER TABLE IF EXISTS return_requests ADD COLUMN IF NOT EXISTS admin_note text NULL;
ALTER TABLE IF EXISTS return_requests ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'not_started';
ALTER TABLE IF EXISTS return_requests ADD COLUMN IF NOT EXISTS requested_items jsonb NULL;
ALTER TABLE IF EXISTS return_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='return_requests' AND column_name='note') THEN
    EXECUTE 'UPDATE return_requests SET customer_note = COALESCE(customer_note, note) WHERE customer_note IS NULL';
  END IF;
END $$;
ALTER TABLE IF EXISTS return_requests DROP CONSTRAINT IF EXISTS return_requests_status_check;
ALTER TABLE IF EXISTS return_requests ADD CONSTRAINT return_requests_status_check CHECK (status IN ('requested','under_review','approved','rejected','received','refunded','closed'));
ALTER TABLE IF EXISTS return_requests DROP CONSTRAINT IF EXISTS return_requests_refund_status_check;
ALTER TABLE IF EXISTS return_requests ADD CONSTRAINT return_requests_refund_status_check CHECK (refund_status IN ('not_started','pending','completed','failed'));
CREATE INDEX IF NOT EXISTS idx_return_requests_order ON return_requests(order_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_requests_customer ON return_requests(lower(customer_email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_requests_status_refund ON return_requests(status, refund_status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_return_requests_active_order ON return_requests(order_id) WHERE status IN ('requested','under_review','approved','received');

CREATE TABLE IF NOT EXISTS refund_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  return_request_id uuid NULL REFERENCES return_requests(id) ON DELETE SET NULL,
  amount numeric(12,2) NULL,
  currency text DEFAULT 'TRY',
  status text NOT NULL DEFAULT 'pending',
  provider text NULL,
  provider_reference text NULL,
  error_message text NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz NULL,
  metadata jsonb NULL,
  CONSTRAINT refund_records_status_check CHECK (status IN ('pending','completed','failed','cancelled'))
);
ALTER TABLE IF EXISTS refund_records ADD COLUMN IF NOT EXISTS return_request_id uuid NULL REFERENCES return_requests(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS refund_records ADD COLUMN IF NOT EXISTS amount numeric(12,2) NULL;
ALTER TABLE IF EXISTS refund_records ADD COLUMN IF NOT EXISTS currency text DEFAULT 'TRY';
ALTER TABLE IF EXISTS refund_records ADD COLUMN IF NOT EXISTS provider text NULL;
ALTER TABLE IF EXISTS refund_records ADD COLUMN IF NOT EXISTS provider_reference text NULL;
ALTER TABLE IF EXISTS refund_records ADD COLUMN IF NOT EXISTS error_message text NULL;
ALTER TABLE IF EXISTS refund_records ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE IF EXISTS refund_records ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;
ALTER TABLE IF EXISTS refund_records ADD COLUMN IF NOT EXISTS metadata jsonb NULL;
ALTER TABLE IF EXISTS refund_records DROP CONSTRAINT IF EXISTS refund_records_status_check;
ALTER TABLE IF EXISTS refund_records ADD CONSTRAINT refund_records_status_check CHECK (status IN ('pending','completed','failed','cancelled'));
CREATE INDEX IF NOT EXISTS idx_refund_records_order ON refund_records(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_records_return ON refund_records(return_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_records_status ON refund_records(status, created_at DESC);

ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS carrier_name text NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS tracking_number text NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS tracking_url text NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'shipped';
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS shipped_at timestamptz NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS delivered_at timestamptz NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_shipments_order_status ON shipments(order_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES shipments(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text NULL,
  note text NULL,
  occurred_at timestamptz DEFAULT now(),
  metadata jsonb NULL
);
CREATE INDEX IF NOT EXISTS idx_shipment_events_order ON shipment_events(order_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON shipment_events(shipment_id, occurred_at DESC);

ALTER TABLE IF EXISTS email_events DROP CONSTRAINT IF EXISTS email_events_email_type_check;
ALTER TABLE IF EXISTS email_events ADD CONSTRAINT email_events_email_type_check CHECK (email_type IN (
  'order_created','payment_success','payment_failed','shipment_created','shipment_updated','shipment_delivered','restock_alert','refund_created','refund_completed','return_request_received','return_approved','return_rejected','review_request'
));
