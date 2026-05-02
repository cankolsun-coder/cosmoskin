

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
