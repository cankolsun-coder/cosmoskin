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

CREATE INDEX IF NOT EXISTS idx_reviews_product_slug ON product_reviews(product_slug);
CREATE INDEX IF NOT EXISTS idx_reviews_is_approved ON product_reviews(is_approved);

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

-- ─── Row Level Security ─────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_recommendations ENABLE ROW LEVEL SECURITY;

-- Products: public read, admin write
CREATE POLICY "products_public_read" ON products FOR SELECT USING (is_active = TRUE);

-- Reviews: public read approved, authenticated insert
CREATE POLICY "reviews_public_read" ON product_reviews FOR SELECT USING (is_approved = TRUE);
CREATE POLICY "reviews_authenticated_insert" ON product_reviews FOR INSERT TO authenticated WITH CHECK (TRUE);

-- FAQs: public read
CREATE POLICY "faqs_public_read" ON product_faqs FOR SELECT USING (TRUE);

-- Recommendations: public read
CREATE POLICY "recs_public_read" ON product_recommendations FOR SELECT USING (TRUE);

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
