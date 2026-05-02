

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
