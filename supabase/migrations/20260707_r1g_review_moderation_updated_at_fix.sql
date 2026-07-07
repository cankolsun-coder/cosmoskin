-- COSMOSKIN R1G — Review moderation updated_at schema fix
-- Idempotent. No data drops. No RLS or storage policy changes.

-- Live moderation triggers reference NEW.updated_at (sync_review_approved_from_status, set_updated_at).
-- review_images live schema lacked updated_at; reviews may also lack it on older deployments.

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.review_images
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Keep status/approved sync trigger aligned with reviews.updated_at column.
CREATE OR REPLACE FUNCTION public.sync_review_approved_from_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.approved := (NEW.status = 'approved');
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_status_sync ON public.reviews;
CREATE TRIGGER trg_reviews_status_sync
  BEFORE INSERT OR UPDATE OF status ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.sync_review_approved_from_status();

-- Ensure generic reviews updated_at trigger exists when column is present.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON public.reviews;
CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
