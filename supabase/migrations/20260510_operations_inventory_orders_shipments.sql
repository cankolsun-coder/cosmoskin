-- COSMOSKIN Operations Foundation — Inventory, restock alerts, order and shipment extensions
-- Safe to run after existing commerce schema. It preserves legacy inventory values when present.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS product_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL UNIQUE,
  sku text NULL,
  stock_on_hand integer NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0),
  stock_reserved integer NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
  low_stock_threshold integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  allow_backorder boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_inventory_status ON product_inventory(status, stock_on_hand, stock_reserved);
CREATE INDEX IF NOT EXISTS idx_product_inventory_slug ON product_inventory(product_slug);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  change integer NOT NULL,
  previous_stock_on_hand integer NULL,
  new_stock_on_hand integer NULL,
  reason text NOT NULL CHECK (reason IN ('manual_adjustment','supplier_restock','order_paid','order_cancelled','return_received','damage_loss','correction')),
  note text NULL,
  related_order_id text NULL,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_created ON inventory_movements(product_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order ON inventory_movements(related_order_id);

CREATE TABLE IF NOT EXISTS restock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  email text NOT NULL,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','notified','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz NULL,
  last_attempt_at timestamptz NULL,
  last_error text NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_restock_alerts_waiting_email_product
  ON restock_alerts (product_slug, lower(trim(email)))
  WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_restock_alerts_status_product ON restock_alerts(status, product_slug, created_at);

-- Preserve values from the existing Phase 6 inventory table when it exists.
DO $$
BEGIN
  IF to_regclass('public.inventory') IS NOT NULL THEN
    INSERT INTO product_inventory (product_slug, sku, stock_on_hand, stock_reserved, low_stock_threshold, allow_backorder, status, updated_at)
    SELECT
      product_slug,
      sku,
      COALESCE(stock_qty, 0),
      COALESCE(reserved_qty, 0),
      COALESCE(low_stock_threshold, 5),
      CASE WHEN status = 'preorder' THEN true ELSE false END,
      CASE WHEN status IN ('active','preorder','out_of_stock') THEN 'active'
           WHEN status IN ('draft','archived') THEN 'inactive'
           ELSE 'active' END,
      COALESCE(updated_at, now())
    FROM inventory
    ON CONFLICT (product_slug) DO UPDATE SET
      sku = EXCLUDED.sku,
      stock_on_hand = EXCLUDED.stock_on_hand,
      stock_reserved = EXCLUDED.stock_reserved,
      low_stock_threshold = EXCLUDED.low_stock_threshold,
      allow_backorder = EXCLUDED.allow_backorder,
      status = EXCLUDED.status,
      updated_at = now();
  END IF;
END $$;

-- Ensure every current catalog slug has an inventory row, without inventing positive stock.
INSERT INTO product_inventory (product_slug, sku) VALUES
  ('anua-heartleaf-77-soothing-toner', 'ANUA_HEARTLEAF_77_SOOTHING_TONER'),
  ('anua-heartleaf-pore-control-cleansing-oil', 'ANUA_HEARTLEAF_PORE_CONTROL_CLEANSING_OIL'),
  ('beauty-of-joseon-relief-sun-spf50', 'BEAUTY_OF_JOSEON_RELIEF_SUN_SPF50'),
  ('beauty-of-joseon-glow-serum-propolis-niacinamide', 'BEAUTY_OF_JOSEON_GLOW_SERUM_PROPOLIS_NIACINAMIDE'),
  ('beauty-of-joseon-glow-deep-serum', 'BEAUTY_OF_JOSEON_GLOW_DEEP_SERUM'),
  ('beauty-of-joseon-dynasty-cream', 'BEAUTY_OF_JOSEON_DYNASTY_CREAM'),
  ('beauty-of-joseon-green-plum-refreshing-cleanser', 'BEAUTY_OF_JOSEON_GREEN_PLUM_REFRESHING_CLEANSER'),
  ('by-wishtrend-pure-vitamin-c-21-5-serum', 'BY_WISHTREND_PURE_VITAMIN_C_21_5_SERUM'),
  ('cosrx-advanced-snail-96-mucin-essence', 'COSRX_ADVANCED_SNAIL_96_MUCIN_ESSENCE'),
  ('cosrx-the-vitamin-c-23-serum', 'COSRX_THE_VITAMIN_C_23_SERUM'),
  ('cosrx-acne-pimple-master-patch', 'COSRX_ACNE_PIMPLE_MASTER_PATCH'),
  ('cosrx-aha-bha-clarifying-treatment-toner', 'COSRX_AHA_BHA_CLARIFYING_TREATMENT_TONER'),
  ('cosrx-low-ph-good-morning-gel-cleanser', 'COSRX_LOW_PH_GOOD_MORNING_GEL_CLEANSER'),
  ('cosrx-salicylic-acid-daily-gentle-cleanser', 'COSRX_SALICYLIC_ACID_DAILY_GENTLE_CLEANSER'),
  ('cosrx-oil-free-ultra-moisturizing-lotion', 'COSRX_OIL_FREE_ULTRA_MOISTURIZING_LOTION'),
  ('dr-jart-ceramidin-cream', 'DR_JART_CERAMIDIN_CREAM'),
  ('goodal-green-tangerine-vitamin-c-serum', 'GOODAL_GREEN_TANGERINE_VITAMIN_C_SERUM'),
  ('im-from-rice-toner', 'IM_FROM_RICE_TONER'),
  ('innisfree-super-volcanic-clay-mask', 'INNISFREE_SUPER_VOLCANIC_CLAY_MASK'),
  ('isntree-hyaluronic-acid-watery-sun-gel', 'ISNTREE_HYALURONIC_ACID_WATERY_SUN_GEL'),
  ('laneige-water-sleeping-mask', 'LANEIGE_WATER_SLEEPING_MASK'),
  ('medicube-zero-pore-pad', 'MEDICUBE_ZERO_PORE_PAD'),
  ('medicube-collagen-night-wrapping-mask', 'MEDICUBE_COLLAGEN_NIGHT_WRAPPING_MASK'),
  ('mediheal-nmf-aquaring-sheet-mask', 'MEDIHEAL_NMF_AQUARING_SHEET_MASK'),
  ('round-lab-1025-dokdo-cleanser', 'ROUND_LAB_1025_DOKDO_CLEANSER'),
  ('round-lab-dokdo-toner', 'ROUND_LAB_DOKDO_TONER'),
  ('round-lab-birch-juice-sunscreen', 'ROUND_LAB_BIRCH_JUICE_SUNSCREEN'),
  ('round-lab-soybean-nourishing-cream', 'ROUND_LAB_SOYBEAN_NOURISHING_CREAM'),
  ('skin1004-madagascar-centella-ampoule', 'SKIN1004_MADAGASCAR_CENTELLA_AMPOULE'),
  ('skin1004-centella-toning-toner', 'SKIN1004_CENTELLA_TONING_TONER'),
  ('skin1004-hyalu-cica-water-fit-sun-serum', 'SKIN1004_HYALU_CICA_WATER_FIT_SUN_SERUM'),
  ('some-by-mi-aha-bha-miracle-toner', 'SOME_BY_MI_AHA_BHA_MIRACLE_TONER'),
  ('torriden-dive-in-hyaluronic-acid-serum', 'TORRIDEN_DIVE_IN_HYALURONIC_ACID_SERUM'),
  ('torriden-solid-in-ceramide-cream', 'TORRIDEN_SOLID_IN_CERAMIDE_CREAM'),
  ('torriden-dive-in-watery-moisture-sun-cream', 'TORRIDEN_DIVE_IN_WATERY_MOISTURE_SUN_CREAM')
ON CONFLICT (product_slug) DO NOTHING;

-- Existing order tables are suitable; add aliases/extensions required by operations UI without duplicating data.
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'not_started';
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) GENERATED ALWAYS AS (subtotal_amount) STORED;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS shipping_total numeric(12,2) GENERATED ALWAYS AS (shipping_amount) STORED;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS discount_total numeric(12,2) GENERATED ALWAYS AS (discount_amount) STORED;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS grand_total numeric(12,2) GENERATED ALWAYS AS (total_amount) STORED;

ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS carrier_name text NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS tracking_number text NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS tracking_url text NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS shipped_at timestamptz NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS delivered_at timestamptz NULL;
ALTER TABLE IF EXISTS shipments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE shipments SET carrier_name = carrier WHERE carrier_name IS NULL AND carrier IS NOT NULL;
UPDATE shipments SET carrier = carrier_name WHERE carrier IS NULL AND carrier_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_order_created ON shipments(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_created ON orders(fulfillment_status, created_at DESC);

-- Public read is intentionally not granted here; Cloudflare Functions use the service role and expose a safe public shape.
