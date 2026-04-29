-- COSMOSKIN Supabase Review System
-- Run after database/schema.sql and before database/rls.sql.
-- This file is for Supabase/Postgres. Do not use functions/api/reviews/schema.sql; that file is legacy SQLite/D1 syntax.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_display_name text NOT NULL DEFAULT 'COSMOSKIN Üyesi',
  user_email citext,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 100),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  helpful_count int NOT NULL DEFAULT 0 CHECK (helpful_count >= 0),
  approved boolean NOT NULL DEFAULT false,
  is_edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_slug, user_id)
);

CREATE TABLE IF NOT EXISTS public.review_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON UPDATE CASCADE ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  width int,
  height int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.review_helpful (
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);

CREATE INDEX IF NOT EXISTS reviews_product_approved_created_idx
ON public.reviews(product_slug, approved, created_at DESC);

CREATE INDEX IF NOT EXISTS reviews_user_product_idx
ON public.reviews(user_id, product_slug);

CREATE INDEX IF NOT EXISTS review_images_review_status_idx
ON public.review_images(review_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS review_helpful_user_idx
ON public.review_helpful(user_id);

CREATE OR REPLACE FUNCTION public.set_reviews_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_reviews_updated_at ON public.reviews;
CREATE TRIGGER set_reviews_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.set_reviews_updated_at();

DROP TRIGGER IF EXISTS set_review_images_updated_at ON public.review_images;
CREATE TRIGGER set_review_images_updated_at
BEFORE UPDATE ON public.review_images
FOR EACH ROW EXECUTE FUNCTION public.set_reviews_updated_at();

CREATE OR REPLACE FUNCTION public.sync_review_helpful_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_review_id uuid;
BEGIN
  v_review_id := COALESCE(NEW.review_id, OLD.review_id);

  UPDATE public.reviews r
  SET helpful_count = (
    SELECT count(*)::int
    FROM public.review_helpful h
    WHERE h.review_id = v_review_id
  )
  WHERE r.id = v_review_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_review_helpful_count_insert ON public.review_helpful;
CREATE TRIGGER sync_review_helpful_count_insert
AFTER INSERT ON public.review_helpful
FOR EACH ROW EXECUTE FUNCTION public.sync_review_helpful_count();

DROP TRIGGER IF EXISTS sync_review_helpful_count_delete ON public.review_helpful;
CREATE TRIGGER sync_review_helpful_count_delete
AFTER DELETE ON public.review_helpful
FOR EACH ROW EXECUTE FUNCTION public.sync_review_helpful_count();

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_helpful ENABLE ROW LEVEL SECURITY;
