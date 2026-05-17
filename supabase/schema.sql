-- ============================================================
-- COSMOSKIN — Supabase Database Schema
-- Version: 1.0 — Production Ready
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Products ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  brand         TEXT NOT NULL,
  product_types TEXT[] NOT NULL DEFAULT '{}',
  skin_types    TEXT[] NOT NULL DEFAULT '{}',
  concerns      TEXT[] NOT NULL DEFAULT '{}',
  ingredients   TEXT[] NOT NULL DEFAULT '{}',
  price_try     INTEGER NOT NULL,
  image_url     TEXT,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- ─── Product Reviews ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_slug  TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name     TEXT NOT NULL,
  user_email    TEXT,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT NOT NULL,
  is_approved   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product_slug ON product_reviews(product_slug);
CREATE INDEX IF NOT EXISTS idx_product_reviews_is_approved ON product_reviews(is_approved);

-- ─── Product FAQs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_faqs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_slug  TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faqs_product_slug ON product_faqs(product_slug);

-- ─── Product Recommendations ────────────────────────────────
CREATE TABLE IF NOT EXISTS product_recommendations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_slug     TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  recommended_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
  reason           TEXT,
  sort_order       SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (product_slug, recommended_slug)
);

CREATE INDEX IF NOT EXISTS idx_recs_product_slug ON product_recommendations(product_slug);

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
                          'pending_payment','pending_bank_transfer','paid','preparing','shipped','delivered','cancelled',
                          'payment_failed','refunded','partially_refunded'
                        )),
  payment_status        TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN (
                          'pending','initiated','awaiting_transfer','paid','failed','refunded','partially_refunded'
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
                            'initiated','awaiting_transfer','paid','failed','initialize_failed','refunded','partially_refunded'
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


-- ─── Row Level Security ─────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_events ENABLE ROW LEVEL SECURITY;

-- Products: public read, admin write via service role
DROP POLICY IF EXISTS "products_public_read" ON products;
CREATE POLICY "products_public_read" ON products FOR SELECT USING (is_active = TRUE);

-- Reviews: public read approved, authenticated insert
DROP POLICY IF EXISTS "reviews_public_read" ON product_reviews;
CREATE POLICY "reviews_public_read" ON product_reviews FOR SELECT USING (is_approved = TRUE);
DROP POLICY IF EXISTS "reviews_authenticated_insert" ON product_reviews;
CREATE POLICY "reviews_authenticated_insert" ON product_reviews FOR INSERT TO authenticated WITH CHECK (TRUE);

-- FAQs: public read
DROP POLICY IF EXISTS "faqs_public_read" ON product_faqs;
CREATE POLICY "faqs_public_read" ON product_faqs FOR SELECT USING (TRUE);

-- Recommendations: public read
DROP POLICY IF EXISTS "recs_public_read" ON product_recommendations;
CREATE POLICY "recs_public_read" ON product_recommendations FOR SELECT USING (TRUE);

-- User addresses: authenticated users can manage their own addresses
DROP POLICY IF EXISTS "user_addresses_select_own" ON user_addresses;
CREATE POLICY "user_addresses_select_own" ON user_addresses FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_addresses_insert_own" ON user_addresses;
CREATE POLICY "user_addresses_insert_own" ON user_addresses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_addresses_update_own" ON user_addresses;
CREATE POLICY "user_addresses_update_own" ON user_addresses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_addresses_delete_own" ON user_addresses;
CREATE POLICY "user_addresses_delete_own" ON user_addresses FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Orders: customers can read only their own authenticated orders. Guest orders are handled by server-side callbacks/admin.
DROP POLICY IF EXISTS "orders_select_own" ON orders;
CREATE POLICY "orders_select_own" ON orders FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "order_items_select_own" ON order_items;
CREATE POLICY "order_items_select_own" ON order_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
);

DROP POLICY IF EXISTS "payments_select_own" ON payments;
CREATE POLICY "payments_select_own" ON payments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = payments.order_id AND orders.user_id = auth.uid())
);

DROP POLICY IF EXISTS "shipments_select_own" ON shipments;
CREATE POLICY "shipments_select_own" ON shipments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = shipments.order_id AND orders.user_id = auth.uid())
);

DROP POLICY IF EXISTS "order_status_events_select_own" ON order_status_events;
CREATE POLICY "order_status_events_select_own" ON order_status_events FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = order_status_events.order_id AND orders.user_id = auth.uid())
);

-- ─── Seed Products ──────────────────────────────────────────
INSERT INTO products (slug, name, brand, product_types, skin_types, concerns, ingredients, price_try, image_url, description)
VALUES
  ('cosrx-low-ph-good-morning-gel-cleanser', 'COSRX Low pH Good Morning Gel Cleanser', 'COSRX', '{"Temizleyiciler"}', '{"Normal Cilt","Yağlı Cilt"}', '{"Akne Eğilimi","Gözenek & Sebum"}', '{"Salicylic Acid"}', 749, '/assets/img/products/cosrx-low-ph-good-morning-gel-cleanser.webp', 'Salicylic Acid içeren düşük pH''lı jel temizleyici. Normal ve yağlı ciltler için; gözenek ve akne eğilimini hedefleyen nazik günlük arındırma.'),
  ('round-lab-1025-dokdo-cleanser', 'Round Lab 1025 Dokdo Cleanser', 'Round Lab', '{"Temizleyiciler"}', '{"Yağlı Cilt","Normal Cilt"}', '{"Gözenek & Sebum"}', '{}', 729, '/assets/img/products/round-lab-1025-dokdo-cleanser.webp', 'Mineral açısından zengin derin deniz suyu ve Ceramide NP içeren köpük temizleyici. Kuru ve hassas ciltlerde bariyer destekli yumuşak temizlik sunar.'),
  ('anua-heartleaf-pore-control-cleansing-oil', 'Anua Heartleaf Pore Control Cleansing Oil', 'Anua', '{"Temizleyiciler"}', '{"Karma Cilt","Yağlı Cilt"}', '{"Gözenek & Sebum","Hassasiyet & Kızarıklık"}', '{}', 849, '/assets/img/products/anua-heartleaf-pore-control-cleansing-oil.webp', 'Heartleaf ekstraktı formülüyle gözenek kontrolüne odaklanan temizleme yağı. Yağlı ve karma ciltlerde derin temizleme ve sebum dengeleme sağlar.'),
  ('beauty-of-joseon-green-plum-refreshing-cleanser', 'Beauty of Joseon Green Plum Refreshing Cleanser', 'Beauty of Joseon', '{"Temizleyiciler"}', '{"Normal Cilt","Karma Cilt"}', '{"Gözenek & Sebum"}', '{}', 729, '/assets/img/products/beauty-of-joseon-green-plum-refreshing-cleanser.webp', 'Yeşil erik özü içeren ferahlatıcı jel temizleyici. Normal ve karma ciltler için hafif, bariyer dostu günlük arındırma.'),
  ('anua-heartleaf-77-soothing-toner', 'Anua Heartleaf 77% Soothing Toner', 'Anua', '{"Tonik & Essence"}', '{"Hassas Cilt","Yağlı Cilt"}', '{"Hassasiyet & Kızarıklık"}', '{}', 849, '/assets/img/products/anua-heartleaf-77-soothing-toner.webp', 'Heartleaf özünün %77 konsantrasyonuyla hassas ve karma ciltleri sakinleştiren tonik. Kızarıklık ve hassasiyet görünümünü hedefleyen hafif katmanlama.'),
  ('round-lab-dokdo-toner', 'Round Lab Dokdo Toner', 'Round Lab', '{"Tonik & Essence"}', '{"Normal Cilt","Karma Cilt"}', '{"Nemsizlik"}', '{}', 799, '/assets/img/products/round-lab-dokdo-toner.webp', 'Derin deniz mineralleri destekli günlük nem toniği. Kuru ve normal ciltlerde bariyer desteği ve nem dengesine yönelik sade bir esans katmanı.'),
  ('cosrx-aha-bha-clarifying-treatment-toner', 'COSRX AHA/BHA Clarifying Treatment Toner', 'COSRX', '{"Tonik & Essence"}', '{"Yağlı Cilt","Karma Cilt"}', '{"Gözenek & Sebum","Akne Eğilimi"}', '{}', 879, '/assets/img/products/cosrx-aha-bha-clarifying-treatment-toner.webp', 'AHA ve BHA içerikli arındırıcı tonik. Yağlı ve akne eğilimli ciltlerde gözenek görünümünü ve sebum dengesini hedefler.'),
  ('skin1004-centella-toning-toner', 'SKIN1004 Centella Toning Toner', 'SKIN1004', '{"Tonik & Essence"}', '{"Hassas Cilt","Karma Cilt"}', '{"Hassasiyet & Kızarıklık"}', '{"Centella Asiatica"}', 829, '/assets/img/products/skin1004-centella-toning-toner.webp', 'Centella Asiatica odaklı yatıştırıcı tonik. Hassas ve kuru ciltlerde bariyer desteği ve sakinleştirici etki için hafif katmanlama.'),
  ('torriden-dive-in-hyaluronic-acid-serum', 'Torriden DIVE-IN Hyaluronic Acid Serum', 'Torriden', '{"Serum & Ampul"}', '{"Kuru Cilt","Karma Cilt"}', '{"Nemsizlik"}', '{"DIVE-IN Serum"}', 949, '/assets/img/products/torriden-dive-in-hyaluronic-acid-serum.webp', 'DIVE-IN teknolojisiyle 5 farklı molekül ağırlığında hyaluronik asit sunan serum. Normal ve kuru ciltlerde derinlemesine nem ve dolgunluk hissi sağlar.'),
  ('cosrx-advanced-snail-96-mucin-essence', 'COSRX Advanced Snail 96 Mucin Essence', 'COSRX', '{"Serum & Ampul"}', '{"Kuru Cilt","Normal Cilt"}', '{"Bariyer Desteği","Nemsizlik"}', '{}', 979, '/assets/img/products/cosrx-advanced-snail-96-mucin-essence.webp', '%96 snail secretion filtrate içeren essence. Bariyer desteği, nem yoğunlaşması ve hassas ciltler için daha esnek ve pürüzsüz görünüm odağı.'),
  ('beauty-of-joseon-glow-serum-propolis-niacinamide', 'Beauty of Joseon Glow Serum (Propolis + Niacinamide)', 'Beauty of Joseon', '{"Serum & Ampul"}', '{"Karma Cilt","Normal Cilt"}', '{"Leke Görünümü","Gözenek & Sebum"}', '{"Niacinamide"}', 879, '/assets/img/products/beauty-of-joseon-glow-serum-propolis-niacinamide.webp', 'Propolis ve Niacinamide içerikli ışıltı serumu. Karma ve normal ciltlerde leke görünümü ve ton eşitsizliğine yönelik yastıksı formül.'),
  ('skin1004-madagascar-centella-ampoule', 'SKIN1004 Madagascar Centella Ampoule', 'SKIN1004', '{"Serum & Ampul"}', '{"Hassas Cilt","Karma Cilt"}', '{"Hassasiyet & Kızarıklık","Bariyer Desteği"}', '{"Centella Asiatica"}', 869, '/assets/img/products/skin1004-madagascar-centella-ampoule.webp', 'Madagaskar Centella Asiatica özlü ampul. Hassas ve kuru ciltlerde kızarıklık ve bariyer hasarına karşı yatıştırıcı yoğun bakım.'),
  ('by-wishtrend-pure-vitamin-c-21-5-serum', 'By Wishtrend Pure Vitamin C 21.5 Serum', 'By Wishtrend', '{"Serum & Ampul"}', '{"Normal Cilt","Karma Cilt"}', '{"Leke Görünümü"}', '{"Vitamin C"}', 1149, '/assets/img/products/by-wishtrend-pure-vitamin-c-21-5-serum.webp', '%21,5 saf Vitamin C içerikli güçlü aydınlatıcı serum. Leke görünümü ve ton eşitsizliğini hedefleyen yoğun aktif bakım.'),
  ('beauty-of-joseon-dynasty-cream', 'Beauty of Joseon Dynasty Cream', 'Beauty of Joseon', '{"Nemlendiriciler"}', '{"Normal Cilt","Kuru Cilt"}', '{"Nemsizlik","Bariyer Desteği"}', '{}', 999, '/assets/img/products/beauty-of-joseon-dynasty-cream.webp', 'Pirinç özü ve Niacinamide içeren nem kremi. Kuru ve normal ciltlerde bariyer destekli yumuşak ve dolgun görünüm sağlar.'),
  ('cosrx-oil-free-ultra-moisturizing-lotion', 'COSRX Oil-Free Ultra Moisturizing Lotion', 'COSRX', '{"Nemlendiriciler"}', '{"Yağlı Cilt","Karma Cilt"}', '{"Nemsizlik"}', '{}', 849, '/assets/img/products/cosrx-oil-free-ultra-moisturizing-lotion.webp', 'Yağ içermeyen hafif losyon formülü. Yağlı ve karma ciltlerde ağır his bırakmadan nem katmanı sunar.'),
  ('torriden-solid-in-ceramide-cream', 'Torriden Solid-In Ceramide Cream', 'Torriden', '{"Nemlendiriciler"}', '{"Kuru Cilt","Hassas Cilt"}', '{"Bariyer Desteği"}', '{}', 1099, '/assets/img/products/torriden-solid-in-ceramide-cream.webp', 'Ceramide kompleksi ile güçlendirilmiş yoğun bariyer kremi. Kuru ve hassas ciltlerde onarıcı ve konforlu kapanış katmanı.'),
  ('dr-jart-ceramidin-cream', 'Dr. Jart+ Ceramidin Cream', 'Dr. Jart+', '{"Nemlendiriciler"}', '{"Kuru Cilt","Hassas Cilt"}', '{"Bariyer Desteği","Nemsizlik"}', '{}', 1249, '/assets/img/products/dr-jart-ceramidin-cream.webp', '5-Cera Complex teknolojisiyle yoğun bariyer güçlendirici krem. Kuru ve hassas ciltlerde uzun süreli nem ve yatıştırıcı etki.'),
  ('beauty-of-joseon-relief-sun-spf50', 'Beauty of Joseon Relief Sun SPF50+', 'Beauty of Joseon', '{"Güneş Koruyucular"}', '{"Normal Cilt","Kuru Cilt","Karma Cilt"}', '{}', '{"Rice Extract"}', 899, '/assets/img/products/beauty-of-joseon-relief-sun-spf50.webp', 'Pirinç özü ve Niacinamide içerikli SPF50+ PA++++ güneş koruyucu. Yağlı ve karma ciltlerde beyaz iz bırakmadan rahat günlük koruması.'),
  ('round-lab-birch-juice-sunscreen', 'Round Lab Birch Juice Sunscreen', 'Round Lab', '{"Güneş Koruyucular"}', '{"Kuru Cilt","Normal Cilt"}', '{"Nemsizlik"}', '{}', 849, '/assets/img/products/round-lab-birch-juice-sunscreen.webp', 'Huş ağacı suyu destekli SPF50+ PA++++ güneş kremi. Normal ve kuru ciltlerde nem destekli hafif bitiş ve konforlu günlük koruma.'),
  ('isntree-hyaluronic-acid-watery-sun-gel', 'Isntree Hyaluronic Acid Watery Sun Gel', 'Isntree', '{"Güneş Koruyucular"}', '{"Kuru Cilt","Karma Cilt"}', '{"Nemsizlik"}', '{}', 879, '/assets/img/products/isntree-hyaluronic-acid-watery-sun-gel.webp', 'Hyaluronik asit içerikli sulandırılmış jel SPF50+ PA++++. Yağlı ve karma ciltlerde nem dengesini korurken hafif ve parlak olmayan bitiş.'),
  ('skin1004-hyalu-cica-water-fit-sun-serum', 'SKIN1004 Hyalu-Cica Water Fit Sun Serum', 'SKIN1004', '{"Güneş Koruyucular"}', '{"Hassas Cilt","Karma Cilt"}', '{"Hassasiyet & Kızarıklık"}', '{"Centella Asiatica"}', 899, '/assets/img/products/skin1004-hyalu-cica-water-fit-sun-serum.webp', 'Hyaluronik asit ve Centella Asiatica içerikli serum kıvamlı SPF50+ PA++++. Hassas ciltlerde koruma ve yatıştırıcı bakımı tek adımda sunar.'),
  ('laneige-water-sleeping-mask', 'Laneige Water Sleeping Mask', 'Laneige', '{"Maskeler"}', '{"Kuru Cilt","Normal Cilt"}', '{"Nemsizlik"}', '{}', 1199, '/assets/img/products/laneige-water-sleeping-mask.webp', 'Su bazlı Sleeping Mask teknolojisiyle geceleri derin nem yoğunlaşması. Kuru ve normal ciltlerde sabah dolgun ve parlak görünüm için gece maskesi.'),
  ('mediheal-nmf-aquaring-sheet-mask', 'Mediheal N.M.F Aquaring Sheet Mask', 'Mediheal', '{"Maskeler"}', '{"Kuru Cilt","Hassas Cilt"}', '{"Nemsizlik"}', '{}', 549, '/assets/img/products/mediheal-nmf-aquaring-sheet-mask.webp', 'NMF (Natural Moisturizing Factor) sistemiyle kuru ciltlerde yoğun su bazlı nem sağlayan sheet mask. Nemsizlik ve hassasiyet için hızlı destek.'),
  ('innisfree-super-volcanic-clay-mask', 'Innisfree Super Volcanic Clay Mask', 'Innisfree', '{"Maskeler"}', '{"Yağlı Cilt","Karma Cilt"}', '{"Gözenek & Sebum"}', '{}', 649, '/assets/img/products/innisfree-super-volcanic-clay-mask.webp', 'Jeju Super Volcanic Cluster ile yağlı ve karma ciltlerde gözenek arındırma ve sebum kontrolü sağlayan kil maskesi.'),
  ('medicube-collagen-night-wrapping-mask', 'Medicube Collagen Night Wrapping Mask', 'Medicube', '{"Maskeler"}', '{"Kuru Cilt","Normal Cilt"}', '{"Nemsizlik","Bariyer Desteği"}', '{}', 849, '/assets/img/products/medicube-collagen-night-wrapping-mask.webp', 'Kolajen destekli gece boyunca etki gösteren yoğun bakım maskesi. Kuru ve normal ciltlerde gece onarımı ve nem yoğunlaşması için.'),
  ('cosrx-salicylic-acid-daily-gentle-cleanser', 'COSRX Salicylic Acid Daily Gentle Cleanser', 'COSRX', '{"Temizleyiciler"}', '{"Yağlı Cilt","Karma Cilt"}', '{"Akne Eğilimi","Gözenek & Sebum"}', '{"Salicylic Acid"}', 769, '/assets/img/products/cosrx-salicylic-acid-daily-gentle-cleanser.webp', 'Salicylic Acid içerikli günlük yumuşak temizleyici. Yağlı ve akne eğilimli ciltlerde gözenek görünümü ve sebum dengesini hedefler.'),
  ('beauty-of-joseon-glow-deep-serum', 'Beauty of Joseon Glow Deep Serum', 'Beauty of Joseon', '{"Serum & Ampul"}', '{"Normal Cilt","Karma Cilt"}', '{"Leke Görünümü"}', '{"Rice Extract"}', 949, '/assets/img/products/beauty-of-joseon-glow-deep-serum.webp', 'Pirinç özü ve Niacinamide içerikli derin ışıltı serumu. Karma ciltlerde leke görünümünü ve ton dengesini hedefleyen katmanlı bakım.'),
  ('cosrx-acne-pimple-master-patch', 'COSRX Acne Pimple Master Patch', 'COSRX', '{"Maskeler"}', '{"Yağlı Cilt","Karma Cilt"}', '{"Akne Eğilimi"}', '{}', 449, '/assets/img/products/cosrx-acne-pimple-master-patch.webp', 'Hydrocolloidal teknolojisiyle akne lekesi ve sivilce görünümüne yönelik yama bandı. Akne eğilimli ciltlerde hedefli nokta tedavisi.'),
  ('medicube-zero-pore-pad', 'Medicube Zero Pore Pad', 'Medicube', '{"Tonik & Essence"}', '{"Yağlı Cilt","Karma Cilt"}', '{"Gözenek & Sebum"}', '{}', 849, '/assets/img/products/medicube-zero-pore-pad.webp', 'BHA ve niacinamide içerikli gözenek görünümünü azaltmaya yönelik pad. Yağlı ve karma ciltlerde günlük gözenek kontrolü ve aydınlatma.'),
  ('some-by-mi-aha-bha-miracle-toner', 'Some By Mi AHA BHA Miracle Toner', 'Some By Mi', '{"Tonik & Essence"}', '{"Yağlı Cilt","Karma Cilt"}', '{"Akne Eğilimi","Gözenek & Sebum"}', '{"Niacinamide","Salicylic Acid"}', 799, '/assets/img/products/some-by-mi-aha-bha-miracle-toner.webp', 'AHA ve BHA içerikli 30 günlük cilt dönüşümü toniği. Akne eğilimli ve yağlı ciltlerde gözenek, sebum ve leke görünümüne kapsamlı destek.'),
  ('goodal-green-tangerine-vitamin-c-serum', 'Goodal Green Tangerine Vitamin C Serum', 'Goodal', '{"Serum & Ampul"}', '{"Normal Cilt","Karma Cilt"}', '{"Leke Görünümü"}', '{"Vitamin C"}', 1099, '/assets/img/products/goodal-green-tangerine-vitamin-c-serum.webp', 'Yeşil mandalin özü ve %10 Vitamin C içerikli aydınlatıcı serum. Leke görünümü, ton eşitsizliği ve canlı görünüm odaklı aktif serum.'),
  ('im-from-rice-toner', 'I''m From Rice Toner', 'I''m From', '{"Tonik & Essence"}', '{"Kuru Cilt","Normal Cilt"}', '{"Nemsizlik"}', '{"Rice Extract"}', 899, '/assets/img/products/im-from-rice-toner.webp', 'Rice Extract ile nem desteği ve ışıltı sağlayan pirinç özlü tonik. Normal ve kuru ciltlerde mineral açısından zengin nazik nem katmanı.')
ON CONFLICT (slug) DO NOTHING;

-- ─── Phase 3 Account Dashboard Additions ────────────────────
-- Supports real customer profile dashboard: DB-backed favorites, notifications,
-- address metadata and account activity states.

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

DROP TRIGGER IF EXISTS trg_user_favorites_updated_at ON user_favorites;
CREATE TRIGGER trg_user_favorites_updated_at
BEFORE UPDATE ON user_favorites
FOR EACH ROW EXECUTE FUNCTION set_cosmoskin_updated_at();

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


-- ============================================================
-- PHASE 5: Reviews system merged into master schema
-- ============================================================
-- ============================================================
-- COSMOSKIN — Reviews System SQL  (v2 — Düzeltilmiş)
-- ============================================================
-- SORUN: order_items tablosu product_slug değil product_id
--        ("boj-relief", "cosrx-snail" gibi katalog ID'leri) kullanır.
-- ÇÖZÜM: Bu script mevcut yapıya dokunmadan çalışır.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. CATALOG → SLUG EŞLEŞTİRME TABLOSU ───────────────────
CREATE TABLE IF NOT EXISTS product_id_to_slug (
  product_id   TEXT PRIMARY KEY,
  product_slug TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO product_id_to_slug (product_id, product_slug) VALUES
  ('boj-relief',           'beauty-of-joseon-relief-sun-spf50'),
  ('boj-glow',             'beauty-of-joseon-glow-serum-propolis-niacinamide'),
  ('boj-glow-deep',        'beauty-of-joseon-glow-deep-serum'),
  ('boj-dynasty',          'beauty-of-joseon-dynasty-cream'),
  ('boj-green-plum',       'beauty-of-joseon-green-plum-refreshing-cleanser'),
  ('cosrx-snail',          'cosrx-advanced-snail-96-mucin-essence'),
  ('cosrx-vitc',           'cosrx-the-vitamin-c-23-serum'),
  ('cosrx-patch',          'cosrx-acne-pimple-master-patch'),
  ('cosrx-aha-bha',        'cosrx-aha-bha-clarifying-treatment-toner'),
  ('cosrx-morning',        'cosrx-low-ph-good-morning-gel-cleanser'),
  ('cosrx-salicylic',      'cosrx-salicylic-acid-daily-gentle-cleanser'),
  ('cosrx-lotion',         'cosrx-oil-free-ultra-moisturizing-lotion'),
  ('torriden-divein-serum','torriden-dive-in-hyaluronic-acid-serum'),
  ('torriden-ceramide',    'torriden-solid-in-ceramide-cream'),
  ('torriden-sun',         'torriden-dive-in-watery-moisture-sun-cream'),
  ('roundlab-cleanser',    'round-lab-1025-dokdo-cleanser'),
  ('roundlab-toner',       'round-lab-dokdo-toner'),
  ('roundlab-birch',       'round-lab-birch-juice-sunscreen'),
  ('roundlab-soy',         'round-lab-soybean-nourishing-cream'),
  ('anua-toner',           'anua-heartleaf-77-soothing-toner'),
  ('anua-cleansing-oil',   'anua-heartleaf-pore-control-cleansing-oil'),
  ('skin1004-ampoule',     'skin1004-madagascar-centella-ampoule'),
  ('skin1004-toner',       'skin1004-centella-toning-toner'),
  ('skin1004-sun',         'skin1004-hyalu-cica-water-fit-sun-serum'),
  ('bywishtrend-vitc',     'by-wishtrend-pure-vitamin-c-21-5-serum'),
  ('drjart-ceramidin',     'dr-jart-ceramidin-cream'),
  ('goodal-vitc',          'goodal-green-tangerine-vitamin-c-serum'),
  ('imfrom-rice',          'im-from-rice-toner'),
  ('innisfree-clay',       'innisfree-super-volcanic-clay-mask'),
  ('isntree-sun',          'isntree-hyaluronic-acid-watery-sun-gel'),
  ('laneige-sleeping',     'laneige-water-sleeping-mask'),
  ('medicube-pad',         'medicube-zero-pore-pad'),
  ('medicube-mask',        'medicube-collagen-night-wrapping-mask'),
  ('mediheal-nmf',         'mediheal-nmf-aquaring-sheet-mask'),
  ('some-by-mi-toner',     'some-by-mi-aha-bha-miracle-toner')
ON CONFLICT (product_id) DO UPDATE SET product_slug = EXCLUDED.product_slug;

ALTER TABLE product_id_to_slug ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "slug_map_public_read" ON product_id_to_slug;
CREATE POLICY "slug_map_public_read" ON product_id_to_slug FOR SELECT USING (TRUE);

-- ─── 2. ORDER_ITEMS: product_slug KOLONU EKLE ────────────────
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_slug TEXT;

UPDATE order_items oi
SET product_slug = m.product_slug
FROM product_id_to_slug m
WHERE oi.product_id = m.product_id
  AND oi.product_slug IS NULL;

-- ─── 3. REVIEWS TABLOSU ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_slug      TEXT        NOT NULL,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_display_name TEXT        NOT NULL DEFAULT 'Anonim',
  user_email        TEXT,
  title             TEXT        NOT NULL CHECK (char_length(title)  BETWEEN 3 AND 100),
  body              TEXT        NOT NULL CHECK (char_length(body)   BETWEEN 10 AND 2000),
  rating            SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  helpful_count     INTEGER     NOT NULL DEFAULT 0,
  approved          BOOLEAN     NOT NULL DEFAULT FALSE,
  is_edited         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reviews_user_product_unique UNIQUE (user_id, product_slug)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product_slug ON reviews(product_slug);
CREATE INDEX IF NOT EXISTS idx_reviews_approved     ON reviews(approved);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id      ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at   ON reviews(created_at DESC);

-- ─── 4. REVIEW IMAGES TABLOSU ────────────────────────────────
CREATE TABLE IF NOT EXISTS review_images (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id    UUID        NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  storage_path TEXT        NOT NULL,
  public_url   TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected')),
  width        INTEGER,
  height       INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_images_review_id ON review_images(review_id);

-- ─── 5. REVIEW HELPFUL TABLOSU ───────────────────────────────
CREATE TABLE IF NOT EXISTS review_helpful (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id  UUID        NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (review_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_helpful_review_id ON review_helpful(review_id);
CREATE INDEX IF NOT EXISTS idx_helpful_user_id   ON review_helpful(user_id);

-- ─── 6. ROW LEVEL SECURITY ───────────────────────────────────
ALTER TABLE reviews        ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_images  ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_helpful ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_public_read"          ON reviews;
DROP POLICY IF EXISTS "reviews_authenticated_insert" ON reviews;
DROP POLICY IF EXISTS "reviews_own_update"           ON reviews;
DROP POLICY IF EXISTS "reviews_admin_all"            ON reviews;

CREATE POLICY "reviews_public_read" ON reviews
  FOR SELECT USING (approved = TRUE);

CREATE POLICY "reviews_authenticated_insert" ON reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reviews_own_update" ON reviews
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reviews_admin_all" ON reviews
  FOR ALL TO authenticated
  USING (auth.email() = 'cankolsun@cosmoskin.com.tr');

DROP POLICY IF EXISTS "review_images_public_read"  ON review_images;
DROP POLICY IF EXISTS "review_images_owner_insert" ON review_images;
DROP POLICY IF EXISTS "review_images_admin_all"    ON review_images;

CREATE POLICY "review_images_public_read" ON review_images
  FOR SELECT USING (status = 'approved');

CREATE POLICY "review_images_owner_insert" ON review_images
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM reviews r WHERE r.id = review_images.review_id AND r.user_id = auth.uid())
  );

CREATE POLICY "review_images_admin_all" ON review_images
  FOR ALL TO authenticated
  USING (auth.email() = 'cankolsun@cosmoskin.com.tr');

DROP POLICY IF EXISTS "helpful_public_read"        ON review_helpful;
DROP POLICY IF EXISTS "helpful_authenticated_write" ON review_helpful;

CREATE POLICY "helpful_public_read" ON review_helpful
  FOR SELECT USING (TRUE);

CREATE POLICY "helpful_authenticated_write" ON review_helpful
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 7. SATIN ALMA DOĞRULAMA (DÜZELTİLMİŞ) ──────────────────
-- product_id (eski katalog) VE product_slug (yeni) ikisini de kontrol eder.
DROP FUNCTION IF EXISTS check_purchase(UUID, TEXT);

CREATE OR REPLACE FUNCTION check_purchase(
  p_user_id      UUID,
  p_product_slug TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_found BOOLEAN := FALSE;
BEGIN
  -- YOL 1: order_items.product_slug doğrudan eşleştir (yeni siparişler)
  SELECT EXISTS (
    SELECT 1
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.user_id       = p_user_id
      AND o.status IN ('paid','preparing','shipped','delivered','partially_refunded')
      AND oi.product_slug = p_product_slug
  ) INTO v_found;

  IF v_found THEN RETURN TRUE; END IF;

  -- YOL 2: catalog_id → slug eşleştirme (eski siparişler için)
  SELECT EXISTS (
    SELECT 1
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN product_id_to_slug m ON m.product_id = oi.product_id
    WHERE o.user_id      = p_user_id
      AND o.status IN ('paid','preparing','shipped','delivered','partially_refunded')
      AND m.product_slug = p_product_slug
  ) INTO v_found;

  RETURN v_found;
END;
$$;

-- ─── 8. YORUM ÖZET FONKSİYONU ────────────────────────────────
DROP FUNCTION IF EXISTS get_review_summary(TEXT);

CREATE OR REPLACE FUNCTION get_review_summary(p_slug TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_build_object(
    'product_slug', p_slug,
    'total_count',  COUNT(*),
    'avg_rating',   ROUND(AVG(rating)::NUMERIC, 1),
    'five_star',    COUNT(*) FILTER (WHERE rating = 5),
    'four_star',    COUNT(*) FILTER (WHERE rating = 4),
    'three_star',   COUNT(*) FILTER (WHERE rating = 3),
    'two_star',     COUNT(*) FILTER (WHERE rating = 2),
    'one_star',     COUNT(*) FILTER (WHERE rating = 1)
  )
  INTO v_result
  FROM reviews
  WHERE product_slug = p_slug AND approved = TRUE;
  RETURN v_result;
END;
$$;

-- ─── 9. HELPFUL COUNT TRIGGER ────────────────────────────────
CREATE OR REPLACE FUNCTION update_helpful_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE reviews SET helpful_count = GREATEST(helpful_count - 1, 0) WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_helpful_count ON review_helpful;
CREATE TRIGGER trg_helpful_count
  AFTER INSERT OR DELETE ON review_helpful
  FOR EACH ROW EXECUTE FUNCTION update_helpful_count();

-- ─── 10. UPDATED_AT TRIGGER ──────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON reviews;
CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 11. DOĞRULAMA ───────────────────────────────────────────
-- Kurulum sonrası SQL Editor'da çalıştırın:
-- SELECT check_purchase('00000000-0000-0000-0000-000000000000','beauty-of-joseon-relief-sun-spf50');
-- Beklenen sonuç: false




-- ============================================================
-- COSMOSKIN Phase 5.1 — Reviews hardening / verified buyer / storage
-- Safe to run multiple times after base schema.sql
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Supabase Storage bucket for moderated review images.
-- If storage schema is not available in local SQL preview this block may be skipped by Supabase.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('review-images', 'review-images', TRUE, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE IF EXISTS reviews ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE IF EXISTS reviews ADD COLUMN IF NOT EXISTS verified_purchase BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS reviews ADD COLUMN IF NOT EXISTS order_id UUID NULL;
ALTER TABLE IF EXISTS reviews ADD COLUMN IF NOT EXISTS moderation_note TEXT NULL;
ALTER TABLE IF EXISTS reviews ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ NULL;
ALTER TABLE IF EXISTS reviews ADD COLUMN IF NOT EXISTS moderated_by TEXT NULL;

DO $$ BEGIN
  ALTER TABLE reviews ADD CONSTRAINT reviews_status_check CHECK (status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE reviews SET status = CASE WHEN approved IS TRUE THEN 'approved' ELSE COALESCE(status,'pending') END WHERE status IS NULL OR status NOT IN ('pending','approved','rejected');
UPDATE reviews SET approved = (status = 'approved') WHERE approved IS DISTINCT FROM (status = 'approved');

ALTER TABLE IF EXISTS review_images ADD COLUMN IF NOT EXISTS storage_path TEXT NULL;
ALTER TABLE IF EXISTS review_images ADD COLUMN IF NOT EXISTS moderation_note TEXT NULL;
ALTER TABLE IF EXISTS review_images ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ NULL;
ALTER TABLE IF EXISTS review_images ADD COLUMN IF NOT EXISTS moderated_by TEXT NULL;
DO $$ BEGIN
  ALTER TABLE review_images ADD CONSTRAINT review_images_status_check CHECK (status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_slug, status);
CREATE INDEX IF NOT EXISTS idx_reviews_verified_purchase ON reviews(verified_purchase);
CREATE INDEX IF NOT EXISTS idx_review_images_status ON review_images(status);
CREATE INDEX IF NOT EXISTS idx_review_images_storage_path ON review_images(storage_path);

CREATE OR REPLACE FUNCTION sync_review_approved_from_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.approved := (NEW.status = 'approved');
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_status_sync ON reviews;
CREATE TRIGGER trg_reviews_status_sync
  BEFORE INSERT OR UPDATE OF status ON reviews
  FOR EACH ROW EXECUTE FUNCTION sync_review_approved_from_status();

DROP FUNCTION IF EXISTS get_review_summary(TEXT);
CREATE OR REPLACE FUNCTION get_review_summary(p_slug TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result JSON;
BEGIN
  SELECT json_build_object(
    'product_slug', p_slug,
    'total_count',  COUNT(*),
    'approved_count', COUNT(*),
    'avg_rating',   COALESCE(ROUND(AVG(rating)::NUMERIC, 1), 0),
    'five_star',    COUNT(*) FILTER (WHERE rating = 5),
    'four_star',    COUNT(*) FILTER (WHERE rating = 4),
    'three_star',   COUNT(*) FILTER (WHERE rating = 3),
    'two_star',     COUNT(*) FILTER (WHERE rating = 2),
    'one_star',     COUNT(*) FILTER (WHERE rating = 1)
  ) INTO v_result
  FROM reviews
  WHERE product_slug = p_slug AND status = 'approved';
  RETURN v_result;
END;
$$;

DROP POLICY IF EXISTS "review_images_authenticated_upload_storage" ON storage.objects;
CREATE POLICY "review_images_authenticated_upload_storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'review-images' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "review_images_public_read_storage" ON storage.objects;
CREATE POLICY "review_images_public_read_storage" ON storage.objects
  FOR SELECT USING (bucket_id = 'review-images');

DROP POLICY IF EXISTS "review_images_owner_delete_storage" ON storage.objects;
CREATE POLICY "review_images_owner_delete_storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'review-images' AND auth.uid()::text = (storage.foldername(name))[1]);



-- ============================================================
-- COSMOSKIN Phase 6 — Commerce hardening: inventory, coupons, returns, invoices, shipping
-- Safe to run multiple times after base schema.sql.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS coupon_code TEXT NULL;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled';
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS invoice_status TEXT NOT NULL DEFAULT 'not_requested';
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE IF EXISTS order_items ADD COLUMN IF NOT EXISTS image TEXT NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS inventory (
  product_slug TEXT PRIMARY KEY,
  sku TEXT UNIQUE,
  stock_qty INTEGER NOT NULL DEFAULT 25 CHECK (stock_qty >= 0),
  reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','archived','out_of_stock','preorder')),
  warehouse_note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'percent' CHECK (type IN ('percent','fixed','free_shipping')),
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_discount NUMERIC(12,2),
  usage_limit INTEGER,
  per_customer_limit INTEGER DEFAULT 1,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID REFERENCES coupons(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  user_id UUID,
  customer_email TEXT,
  code TEXT NOT NULL,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID,
  customer_email TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','under_review','approved','rejected','received','refunded','cancelled')),
  requested_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','queued','issued','failed','cancelled')),
  invoice_number TEXT,
  invoice_url TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipping_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  location TEXT,
  message TEXT,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status, stock_qty);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_returns_order ON return_requests(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_user_created ON return_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_events_order ON shipping_events(order_id, event_at DESC);

INSERT INTO coupons (code,title,type,value,min_subtotal,max_discount,usage_limit,is_active)
VALUES ('COSMOSKIN10','İlk alışverişe özel %10','percent',10,750,300,500,true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO inventory (product_slug, sku, stock_qty, low_stock_threshold, status) VALUES
('anua-heartleaf-77-soothing-toner','ANUA_HEARTLEAF_77_SOOTHING_TONER',25,5,'active'),
('anua-heartleaf-pore-control-cleansing-oil','ANUA_HEARTLEAF_PORE_CONTROL_CLEANSING_OIL',25,5,'active'),
('beauty-of-joseon-relief-sun-spf50','BEAUTY_OF_JOSEON_RELIEF_SUN_SPF50',25,5,'active'),
('beauty-of-joseon-glow-serum-propolis-niacinamide','BEAUTY_OF_JOSEON_GLOW_SERUM_PROPOLIS_NIACINAMIDE',25,5,'active'),
('beauty-of-joseon-glow-deep-serum','BEAUTY_OF_JOSEON_GLOW_DEEP_SERUM',25,5,'active'),
('beauty-of-joseon-dynasty-cream','BEAUTY_OF_JOSEON_DYNASTY_CREAM',25,5,'active'),
('beauty-of-joseon-green-plum-refreshing-cleanser','BEAUTY_OF_JOSEON_GREEN_PLUM_REFRESHING_CLEANSER',25,5,'active'),
('by-wishtrend-pure-vitamin-c-21-5-serum','BY_WISHTREND_PURE_VITAMIN_C_21_5_SERUM',25,5,'active'),
('cosrx-advanced-snail-96-mucin-essence','COSRX_ADVANCED_SNAIL_96_MUCIN_ESSENCE',25,5,'active'),
('cosrx-the-vitamin-c-23-serum','COSRX_THE_VITAMIN_C_23_SERUM',25,5,'active'),
('cosrx-acne-pimple-master-patch','COSRX_ACNE_PIMPLE_MASTER_PATCH',25,5,'active'),
('cosrx-aha-bha-clarifying-treatment-toner','COSRX_AHA_BHA_CLARIFYING_TREATMENT_TONER',25,5,'active'),
('cosrx-low-ph-good-morning-gel-cleanser','COSRX_LOW_PH_GOOD_MORNING_GEL_CLEANSER',25,5,'active'),
('cosrx-salicylic-acid-daily-gentle-cleanser','COSRX_SALICYLIC_ACID_DAILY_GENTLE_CLEANSER',25,5,'active'),
('cosrx-oil-free-ultra-moisturizing-lotion','COSRX_OIL_FREE_ULTRA_MOISTURIZING_LOTION',25,5,'active'),
('dr-jart-ceramidin-cream','DR_JART_CERAMIDIN_CREAM',25,5,'active'),
('goodal-green-tangerine-vitamin-c-serum','GOODAL_GREEN_TANGERINE_VITAMIN_C_SERUM',25,5,'active'),
('im-from-rice-toner','IM_FROM_RICE_TONER',25,5,'active'),
('innisfree-super-volcanic-clay-mask','INNISFREE_SUPER_VOLCANIC_CLAY_MASK',25,5,'active'),
('isntree-hyaluronic-acid-watery-sun-gel','ISNTREE_HYALURONIC_ACID_WATERY_SUN_GEL',25,5,'active'),
('laneige-water-sleeping-mask','LANEIGE_WATER_SLEEPING_MASK',25,5,'active'),
('medicube-zero-pore-pad','MEDICUBE_ZERO_PORE_PAD',25,5,'active'),
('medicube-collagen-night-wrapping-mask','MEDICUBE_COLLAGEN_NIGHT_WRAPPING_MASK',25,5,'active'),
('mediheal-nmf-aquaring-sheet-mask','MEDIHEAL_NMF_AQUARING_SHEET_MASK',25,5,'active'),
('round-lab-1025-dokdo-cleanser','ROUND_LAB_1025_DOKDO_CLEANSER',25,5,'active'),
('round-lab-dokdo-toner','ROUND_LAB_DOKDO_TONER',25,5,'active'),
('round-lab-birch-juice-sunscreen','ROUND_LAB_BIRCH_JUICE_SUNSCREEN',25,5,'active'),
('round-lab-soybean-nourishing-cream','ROUND_LAB_SOYBEAN_NOURISHING_CREAM',25,5,'active'),
('skin1004-madagascar-centella-ampoule','SKIN1004_MADAGASCAR_CENTELLA_AMPOULE',25,5,'active'),
('skin1004-centella-toning-toner','SKIN1004_CENTELLA_TONING_TONER',25,5,'active'),
('skin1004-hyalu-cica-water-fit-sun-serum','SKIN1004_HYALU_CICA_WATER_FIT_SUN_SERUM',25,5,'active'),
('some-by-mi-aha-bha-miracle-toner','SOME_BY_MI_AHA_BHA_MIRACLE_TONER',25,5,'active'),
('torriden-dive-in-hyaluronic-acid-serum','TORRIDEN_DIVE_IN_HYALURONIC_ACID_SERUM',25,5,'active'),
('torriden-solid-in-ceramide-cream','TORRIDEN_SOLID_IN_CERAMIDE_CREAM',25,5,'active'),
('torriden-dive-in-watery-moisture-sun-cream','TORRIDEN_DIVE_IN_WATERY_MOISTURE_SUN_CREAM',25,5,'active')
ON CONFLICT (product_slug) DO NOTHING;
