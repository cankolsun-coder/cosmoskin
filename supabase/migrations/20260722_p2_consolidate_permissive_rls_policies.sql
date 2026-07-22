-- COSMOSKIN P2 — consolidate duplicate permissive RLS policies flagged by the
-- Supabase performance advisor (multiple_permissive_policies, 89 findings)
-- and close one real security gap found while auditing them.
--
-- Part A (pure dedup, zero behavior change): user_addresses, order_items,
-- orders, payments, products, notification_preferences, review_helpful,
-- profiles, review_images(SELECT only) each carry two or more permissive
-- policies for the same (table, command) that are textually/semantically
-- identical — same predicate, just a narrower {authenticated}-only copy
-- alongside a {public} one (public already covers authenticated; anon can
-- never satisfy an auth.uid()=... check, so dropping the narrower duplicate
-- never changes real-world access). profiles is the one exception: it keeps
-- only the `id`-based policies (id is the NOT NULL PK = auth.uid()) and
-- drops the `user_id`-based duplicates, because 16 live profiles rows have
-- user_id <> id — the id-based policies were already the ones actually
-- granting those users access; this only removes the unreliable duplicate.
--
-- Part B (security fix, not just cleanup): product_recommendations had
-- `recs_public_read` — a SELECT policy with `qual: true`, roles {public} —
-- alongside a correctly-scoped "Users can read own recommendations" policy.
-- Because permissive policies OR together, the unconditional one let anyone
-- (anon included, and this table grants anon full SELECT) read every user's
-- product_recommendations rows. Same shape as the product_reviews /
-- account_activity fix earlier this session. Dropping it restores the
-- intended own-rows-only behavior; nothing else changes.
--
-- Explicitly NOT touched here (flagged separately, needs its own decision):
--   - notifications: two SELECT policies where the broader one has no
--     expires_at check, currently making expired notifications visible.
--     Fixing this changes visible data, not just plan cost.
--   - review_images ALL-admin / reviews ALL-admin: coexisting hardcoded
--     auth.email()='cankolsun@cosmoskin.com.tr' checks alongside a
--     raw_app_meta_data role check, and review_images has two INSERT
--     policies with genuinely different conditions (own user_id vs. owns
--     the parent review) — this is admin/RBAC-model territory, out of
--     scope for a lint cleanup.
--   - product_reviews: already locked to service_role-only by the prior
--     migration (20260722_p2_lock_dead_product_reviews_account_activity),
--     so its remaining duplicate policies are inert; left as-is.

BEGIN;

-- user_addresses
DROP POLICY IF EXISTS "user_addresses_delete_self" ON public.user_addresses;
DROP POLICY IF EXISTS "user_addresses_insert_self" ON public.user_addresses;
DROP POLICY IF EXISTS "user_addresses_select_self" ON public.user_addresses;
DROP POLICY IF EXISTS "user_addresses_update_self" ON public.user_addresses;

-- notification_preferences (the ALL policy already covers every command)
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_insert_self" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can read own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_select_self" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_update_self" ON public.notification_preferences;

-- order_items
DROP POLICY IF EXISTS "Users can read own order items" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_own" ON public.order_items;

-- orders
DROP POLICY IF EXISTS "Users can read own orders" ON public.orders;
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;

-- payments
DROP POLICY IF EXISTS "payments_select_own" ON public.payments;

-- products
DROP POLICY IF EXISTS "Public can read active products" ON public.products;

-- review_helpful (keep the ALL own-row policy and the single public vote-count read)
DROP POLICY IF EXISTS "Kullanıcı kendi oyunu geri alabilir" ON public.review_helpful;
DROP POLICY IF EXISTS "Kullanıcı oy kullanabilir" ON public.review_helpful;
DROP POLICY IF EXISTS "helpful_public_read" ON public.review_helpful;

-- profiles (keep id-based policies only; user_id has 16 mismatched rows)
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;

-- review_images (SELECT only: "Onaylı görsel herkese açık" is a strict superset)
DROP POLICY IF EXISTS "review_images_public_read" ON public.review_images;

-- product_recommendations — Part B security fix
DROP POLICY IF EXISTS "recs_public_read" ON public.product_recommendations;

COMMIT;

-- Verify after deployment:
-- 1) Dropped policies are gone (expect 0 rows):
--    SELECT tablename, policyname FROM pg_policies WHERE policyname IN (
--      'user_addresses_delete_self','user_addresses_insert_self','user_addresses_select_self','user_addresses_update_self',
--      'Users can insert own notification preferences','notification_preferences_insert_self',
--      'Users can read own notification preferences','notification_preferences_select_self',
--      'Users can update own notification preferences','notification_preferences_update_self',
--      'Users can read own order items','order_items_select_own',
--      'Users can read own orders','orders_select_own',
--      'payments_select_own','Public can read active products',
--      'Kullanıcı kendi oyunu geri alabilir','Kullanıcı oy kullanabilir','helpful_public_read',
--      'Users can read own profile','Users read own profile','profiles_select_self',
--      'Users can update own profile','profiles_update_self',
--      'review_images_public_read','recs_public_read'
--    );
-- 2) Own-row access still works end to end: an authenticated user can still
--    select/insert/update their own address, notification preference,
--    order, order item, payment, profile, review-helpful vote, and
--    product_recommendations row (spot-check via the app, not just SQL).
-- 3) product_recommendations no longer exposes other users' rows:
--    SELECT count(*) FROM pg_policies WHERE tablename='product_recommendations' AND qual = 'true';
--    -- expect 0 rows

-- Rollback (only the two behavior-relevant drops need a real rollback path):
--   CREATE POLICY "recs_public_read" ON public.product_recommendations FOR SELECT USING (true);
--   CREATE POLICY "review_images_public_read" ON public.review_images FOR SELECT USING (status = 'approved');
-- The remaining drops were exact duplicates of a still-existing policy, so
-- rollback is simply re-creating the same policy under its old name if ever
-- needed (definitions are documented in the security-review conversation
-- and in COSMOSKIN_PROJECT_MEMORY.md).
