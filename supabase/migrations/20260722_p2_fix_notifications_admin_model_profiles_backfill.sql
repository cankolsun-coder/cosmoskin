-- COSMOSKIN P2 — the three items flagged (not fixed) in the RLS-consolidation
-- migration, now resolved individually since each is a real behavior change,
-- not blind lint cleanup.

BEGIN;

-- 1) notifications: "notifications_select_own" has no expires_at check and,
-- being permissive, ORs with "Users can read own notifications" (which does
-- check it) — the broader policy silently defeats the narrower one, so
-- expired notifications are currently still visible to their owner. Drop
-- the one without the expiry check; the remaining policy is strictly the
-- intended behavior.
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;

-- 2a) review_images / reviews: replace the hardcoded auth.email() admin
-- check with the same raw_app_meta_data->>'role' = 'admin' model already
-- used by product_reviews's admin policy. Verified live that the admin
-- account (cankolsun@cosmoskin.com.tr) already has role metadata 'admin',
-- so this is not a behavior change for the current admin, just removes a
-- hardcoded personal email from policy definitions (DB1-P0-04).
DROP POLICY IF EXISTS "review_images_admin_all" ON public.review_images;
-- "Admin tüm görsellere erişebilir" (role-metadata based) already exists on
-- review_images and remains as the sole admin policy.

DROP POLICY IF EXISTS "reviews_admin_all" ON public.reviews;
CREATE POLICY "reviews_admin_all" ON public.reviews FOR ALL
  USING ((SELECT raw_app_meta_data ->> 'role' FROM auth.users WHERE id = auth.uid()) = 'admin');

-- 2b) review_images INSERT: two permissive policies with genuinely
-- different conditions ("own user_id on the image row" OR "owns the parent
-- review") OR together, so either alone is sufficient — meaning a caller
-- could satisfy just the first and attach an image to a review_id they
-- don't own, as long as they stamp their own user_id on the image row.
-- Replace both with one policy requiring both conditions.
DROP POLICY IF EXISTS "Kullanıcı görsel ekleyebilir" ON public.review_images;
DROP POLICY IF EXISTS "review_images_owner_insert" ON public.review_images;
CREATE POLICY "review_images_owner_insert" ON public.review_images FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = review_images.review_id AND r.user_id = auth.uid())
  );

COMMIT;

-- 3) profiles: backfill the 16 rows where user_id was never set (all are
-- NULL, none are a conflicting non-null value — confirmed live before
-- writing this). Self-referential, idempotent, no cross-table guessing.
UPDATE public.profiles SET user_id = id WHERE user_id IS NULL;

-- Fix the recurrence: the only trigger actually attached to auth.users
-- (on_auth_user_created_profile -> handle_new_auth_user_profile) inserts
-- into profiles without ever setting user_id, so every new signup would
-- reproduce the same gap. handle_new_user() is not attached to any trigger
-- (verified via pg_trigger) and is left untouched.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  begin
    insert into public.profiles (id, user_id, email, first_name, last_name, full_name, metadata, created_at, updated_at)
    values (
      new.id,
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'first_name',''),
      coalesce(new.raw_user_meta_data->>'last_name',''),
      coalesce(new.raw_user_meta_data->>'full_name', trim(concat(coalesce(new.raw_user_meta_data->>'first_name',''), ' ', coalesce(new.raw_user_meta_data->>'last_name','')))),
      coalesce(new.raw_user_meta_data, '{}'::jsonb),
      now(),
      now()
    )
    on conflict (id) do update set
      user_id = coalesce(public.profiles.user_id, excluded.user_id),
      email = excluded.email,
      first_name = coalesce(nullif(excluded.first_name,''), public.profiles.first_name),
      last_name = coalesce(nullif(excluded.last_name,''), public.profiles.last_name),
      full_name = coalesce(nullif(excluded.full_name,''), public.profiles.full_name),
      metadata = coalesce(public.profiles.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
      updated_at = now();
  exception when others then
    raise warning 'COSMOSKIN profile trigger skipped for user %, error: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Verify after deployment:
-- 1) SELECT count(*) FROM pg_policies WHERE tablename='notifications' AND policyname='notifications_select_own'; -- expect 0
-- 2) SELECT policyname, qual FROM pg_policies WHERE tablename='reviews' AND policyname='reviews_admin_all'; -- expect role-metadata qual, not auth.email()
-- 3) SELECT count(*) FROM pg_policies WHERE tablename='review_images' AND policyname IN ('review_images_admin_all','Kullanıcı görsel ekleyebilir'); -- expect 0
-- 4) SELECT with_check FROM pg_policies WHERE tablename='review_images' AND policyname='review_images_owner_insert'; -- expect combined AND condition
-- 5) SELECT count(*) FROM public.profiles WHERE user_id IS NULL; -- expect 0
-- 6) Sign up a fresh test account and confirm profiles.user_id is populated immediately (not just id).

-- Rollback notes:
--   notifications_select_own: CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
--   reviews_admin_all (old): CREATE POLICY "reviews_admin_all" ON public.reviews FOR ALL TO authenticated USING (auth.email() = 'cankolsun@cosmoskin.com.tr');
--   review_images_admin_all: CREATE POLICY "review_images_admin_all" ON public.review_images FOR ALL TO authenticated USING (auth.email() = 'cankolsun@cosmoskin.com.tr');
--   review_images INSERT: recreate the two original policies with their original names/conditions.
--   profiles backfill/trigger: not reversible in the sense of "un-backfilling" is undesirable; if ever needed, revert the function body to the version without user_id (see prior migration history) — the backfilled data itself should stay.
