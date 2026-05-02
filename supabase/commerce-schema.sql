-- ─── Commerce Core / Orders ─────────────────────────────────
-- Phase 1: checkout, payment callback and customer order history need these tables.

CREATE TABLE IF NOT EXISTS user_addresses (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL DEFAULT 'Adresim',
  recipient_first_name  TEXT,
  recipient_last_name   TEXT,
  phone                 TEXT,
  city                  TEXT NOT NULL,
  district              TEXT NOT NULL,
  postal_code           TEXT,
  address_line          TEXT NOT NULL,
  address_type          TEXT NOT NULL DEFAULT 'shipping' CHECK (address_type IN ('shipping','billing','both')),
  is_default            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_addresses_default_shipping
  ON user_addresses(user_id)
  WHERE is_default IS TRUE AND address_type IN ('shipping','both');

CREATE TABLE IF NOT EXISTS orders (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_number          TEXT UNIQUE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
                          'pending_payment','paid','preparing','shipped','delivered','cancelled',
                          'payment_failed','refunded','partially_refunded'
                        )),
  payment_status        TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN (
                          'pending','initiated','paid','failed','refunded','partially_refunded'
                        )),
  fulfillment_status    TEXT NOT NULL DEFAULT 'not_started' CHECK (fulfillment_status IN (
                          'not_started','preparing','packed','shipped','delivered','cancelled','returned'
                        )),
  currency              TEXT NOT NULL DEFAULT 'TRY',
  subtotal_amount       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  vat_amount            NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  shipping_amount       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  discount_amount       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  customer_email        TEXT NOT NULL,
  customer_first_name   TEXT NOT NULL,
  customer_last_name    TEXT NOT NULL,
  customer_phone        TEXT NOT NULL,
  invoice_type          TEXT NOT NULL DEFAULT 'Bireysel',
  identity_number       TEXT,
  city                  TEXT NOT NULL,
  district              TEXT NOT NULL,
  postal_code           TEXT,
  address_line          TEXT NOT NULL,
  cargo_note            TEXT,
  ip_address            TEXT,
  user_agent            TEXT,
  paid_at               TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  fulfilled_at          TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);

CREATE TABLE IF NOT EXISTS order_items (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id            TEXT NOT NULL,
  product_slug          TEXT,
  product_name          TEXT NOT NULL,
  brand                 TEXT,
  sku                   TEXT,
  image                 TEXT,
  unit_price            NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity              INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_total            NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_slug ON order_items(product_slug);

CREATE TABLE IF NOT EXISTS payments (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider                TEXT NOT NULL DEFAULT 'iyzico',
  status                  TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN (
                            'initiated','paid','failed','initialize_failed','refunded','partially_refunded'
                          )),
  amount                  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency                TEXT NOT NULL DEFAULT 'TRY',
  conversation_id         TEXT,
  provider_token          TEXT,
  provider_payment_id     TEXT,
  raw_initialize_response JSONB,
  raw_callback_response   JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider_token ON payments(provider_token);
CREATE INDEX IF NOT EXISTS idx_payments_conversation_id ON payments(conversation_id);

CREATE TABLE IF NOT EXISTS shipments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN (
                      'not_started','preparing','packed','shipped','delivered','cancelled','returned'
                    )),
  carrier           TEXT,
  tracking_number   TEXT,
  tracking_url      TEXT,
  shipped_at        TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);

CREATE TABLE IF NOT EXISTS order_status_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  message     TEXT,
  source      TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system','payment','admin','customer')),
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_events_order_id ON order_status_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_events_created_at ON order_status_events(created_at DESC);

CREATE OR REPLACE FUNCTION set_cosmoskin_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_addresses_updated_at ON user_addresses;
CREATE TRIGGER trg_user_addresses_updated_at
BEFORE UPDATE ON user_addresses
FOR EACH ROW EXECUTE FUNCTION set_cosmoskin_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_cosmoskin_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_cosmoskin_updated_at();

DROP TRIGGER IF EXISTS trg_shipments_updated_at ON shipments;
CREATE TRIGGER trg_shipments_updated_at
BEFORE UPDATE ON shipments
FOR EACH ROW EXECUTE FUNCTION set_cosmoskin_updated_at();


-- Phase 3 account dashboard additions
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS user_favorites (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL,
  product_slug  TEXT NOT NULL,
  product_name  TEXT NOT NULL,
  brand         TEXT,
  image         TEXT,
  price         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_slug)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_product_slug ON user_favorites(product_slug);

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('system','order','shipping','favorite','routine','coupon','security')),
  title       TEXT NOT NULL,
  body        TEXT,
  action_url  TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_favorites_select_own" ON user_favorites;
CREATE POLICY "user_favorites_select_own" ON user_favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_favorites_insert_own" ON user_favorites;
CREATE POLICY "user_favorites_insert_own" ON user_favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_favorites_update_own" ON user_favorites;
CREATE POLICY "user_favorites_update_own" ON user_favorites FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_favorites_delete_own" ON user_favorites;
CREATE POLICY "user_favorites_delete_own" ON user_favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
