-- COSMOSKIN Phase 1 Operational Safety
-- Shipment email logging, order lifecycle extensions, payment idempotency and stock reservations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS product_inventory ADD COLUMN IF NOT EXISTS stock_on_hand integer NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0);
ALTER TABLE IF EXISTS product_inventory ADD COLUMN IF NOT EXISTS stock_reserved integer NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0);
ALTER TABLE IF EXISTS product_inventory ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0);
ALTER TABLE IF EXISTS product_inventory ADD COLUMN IF NOT EXISTS allow_backorder boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS product_inventory ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE IF EXISTS product_inventory ADD COLUMN IF NOT EXISTS sku text NULL;

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NULL,
  session_id text NULL,
  product_slug text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','converted','released','expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  released_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_order ON inventory_reservations(order_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_expiry ON inventory_reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_product ON inventory_reservations(product_slug, status);

ALTER TABLE IF EXISTS inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_reason_check;
ALTER TABLE IF EXISTS inventory_movements ADD CONSTRAINT inventory_movements_reason_check CHECK (reason IN ('manual_adjustment','supplier_restock','order_paid','order_cancelled','return_received','damage_loss','correction','stock_reserved','reservation_released'));

CREATE TABLE IF NOT EXISTS email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NULL,
  customer_email text NOT NULL,
  email_type text NOT NULL CHECK (email_type IN ('order_created','payment_success','payment_failed','shipment_created','shipment_updated','shipment_delivered','restock_alert','refund_created','return_request_received','review_request')),
  provider text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  subject text NULL,
  provider_message_id text NULL,
  error_message text NULL,
  metadata jsonb NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_order_created ON email_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_customer_created ON email_events(lower(customer_email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_type_status ON email_events(email_type, status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NULL,
  message text NULL,
  source text NOT NULL DEFAULT 'system',
  event_type text NULL,
  previous_status text NULL,
  new_status text NULL,
  note text NULL,
  created_by text NULL,
  created_at timestamptz DEFAULT now(),
  metadata jsonb NULL
);

ALTER TABLE IF EXISTS order_status_events ADD COLUMN IF NOT EXISTS event_type text NULL;
ALTER TABLE IF EXISTS order_status_events ADD COLUMN IF NOT EXISTS previous_status text NULL;
ALTER TABLE IF EXISTS order_status_events ADD COLUMN IF NOT EXISTS new_status text NULL;
ALTER TABLE IF EXISTS order_status_events ADD COLUMN IF NOT EXISTS note text NULL;
ALTER TABLE IF EXISTS order_status_events ADD COLUMN IF NOT EXISTS created_by text NULL;
ALTER TABLE IF EXISTS order_status_events ADD COLUMN IF NOT EXISTS metadata jsonb NULL;

UPDATE order_status_events
SET event_type = COALESCE(event_type, status),
    new_status = COALESCE(new_status, status),
    note = COALESCE(note, message),
    created_by = COALESCE(created_by, source)
WHERE event_type IS NULL OR new_status IS NULL OR note IS NULL OR created_by IS NULL;

CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NULL,
  provider text NOT NULL DEFAULT 'iyzico',
  provider_payment_id text NULL,
  event_type text NOT NULL,
  status text NOT NULL,
  raw_reference text NULL,
  processed_at timestamptz NULL,
  created_at timestamptz DEFAULT now(),
  metadata jsonb NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_id, provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_reference ON payment_events(provider, raw_reference, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_events_provider_payment_processed
  ON payment_events(provider, provider_payment_id, event_type)
  WHERE provider_payment_id IS NOT NULL AND processed_at IS NOT NULL;

ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'unfulfilled';
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS billing_address_line text NULL;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS billing_city text NULL;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS billing_district text NULL;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS billing_postal_code text NULL;

ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS carrier text NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS carrier_name text NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS tracking_number text NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS tracking_url text NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS shipped_at timestamptz NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS delivered_at timestamptz NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_orders_email_number ON orders(lower(customer_email), order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status_payment_fulfillment ON orders(status, payment_status, fulfillment_status, created_at DESC);
