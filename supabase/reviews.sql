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
      AND o.status        = 'paid'
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
      AND o.status       = 'paid'
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
