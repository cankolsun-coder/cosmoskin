-- COSMOSKIN Hesabim dashboard Row Level Security policies
-- Run after database/schema.sql.
-- Cloudflare Pages Functions should use SUPABASE_SERVICE_ROLE_KEY for server-only
-- mutations. Service role bypasses these policies in Supabase.

BEGIN;


-- Compatibility repair for existing Supabase tables created by older COSMOSKIN schemas.
-- Safe to re-run. This prevents RLS policies from failing when an existing table
-- was created before account-dashboard columns were added.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.wishlists ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.loyalty_accounts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.loyalty_ledger ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.reward_redemptions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.skin_profiles ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.routines ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.routine_completions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.routine_streaks ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.skin_scores ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.skin_analysis_sessions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.user_product_inventory ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.product_usage_logs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.product_recommendations ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


-- Ensure updated_at columns exist before any UPDATE fires set_updated_at triggers from older schemas.
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.product_usage_defaults ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.dashboard_nav_items ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.loyalty_accounts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.rewards ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.reward_redemptions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.skin_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.routines ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.routine_steps ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.routine_streaks ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.skin_scores ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.user_product_inventory ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.gift_cards ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Existing projects sometimes use profiles.id instead of profiles.user_id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='id'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET user_id = id WHERE user_id IS NULL';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_usage_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_nav_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skin_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skin_analysis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_outbox ENABLE ROW LEVEL SECURITY;

-- Public catalog/config read policies.
DROP POLICY IF EXISTS "Public can read active brands" ON public.brands;
CREATE POLICY "Public can read active brands"
ON public.brands
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Public can read active products" ON public.products;
CREATE POLICY "Public can read active products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Public can read usage defaults" ON public.product_usage_defaults;
CREATE POLICY "Public can read usage defaults"
ON public.product_usage_defaults
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Public can read public site settings" ON public.site_settings;
CREATE POLICY "Public can read public site settings"
ON public.site_settings
FOR SELECT
TO anon, authenticated
USING (is_public = true);

DROP POLICY IF EXISTS "Public can read active dashboard nav items" ON public.dashboard_nav_items;
CREATE POLICY "Public can read active dashboard nav items"
ON public.dashboard_nav_items
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Public can read active membership tiers" ON public.membership_tiers;
CREATE POLICY "Public can read active membership tiers"
ON public.membership_tiers
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Public can read active rewards" ON public.rewards;
CREATE POLICY "Public can read active rewards"
ON public.rewards
FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at > now())
);

-- Existing checkout/order data: direct client reads only. All writes happen
-- through Cloudflare Pages Functions with service role.
DROP POLICY IF EXISTS "Users can read own orders" ON public.orders;
CREATE POLICY "Users can read own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own order items" ON public.order_items;
CREATE POLICY "Users can read own order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.user_id = auth.uid()
  )
);

-- Payments intentionally have no anon/auth policies. They include provider
-- tokens and raw provider payloads. Account APIs must return masked summaries.

-- Profile.
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Addresses.
DROP POLICY IF EXISTS "Users can read own active addresses" ON public.addresses;
CREATE POLICY "Users can read own active addresses"
ON public.addresses
FOR SELECT
TO authenticated
USING (user_id = auth.uid() AND archived_at IS NULL);

DROP POLICY IF EXISTS "Users can insert own addresses" ON public.addresses;
CREATE POLICY "Users can insert own addresses"
ON public.addresses
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own addresses" ON public.addresses;
CREATE POLICY "Users can update own addresses"
ON public.addresses
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own addresses" ON public.addresses;
CREATE POLICY "Users can delete own addresses"
ON public.addresses
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Payment methods are readable by owner. Creation, default switching, and
-- removal happen through provider-backed APIs so token references cannot be
-- changed directly from the browser.
DROP POLICY IF EXISTS "Users can read own payment methods" ON public.payment_methods;
CREATE POLICY "Users can read own payment methods"
ON public.payment_methods
FOR SELECT
TO authenticated
USING (user_id = auth.uid() AND status <> 'removed');

DROP POLICY IF EXISTS "Users can update own payment methods" ON public.payment_methods;

-- Wishlists.
DROP POLICY IF EXISTS "Users can read own wishlists" ON public.wishlists;
CREATE POLICY "Users can read own wishlists"
ON public.wishlists
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own wishlists" ON public.wishlists;
CREATE POLICY "Users can insert own wishlists"
ON public.wishlists
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own wishlists" ON public.wishlists;
CREATE POLICY "Users can delete own wishlists"
ON public.wishlists
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Notifications.
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND (expires_at IS NULL OR expires_at > now())
);

DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.notifications;
-- Notification read mutations are handled by /api/account/notifications/read
-- with service role so title/body/action fields cannot be changed directly.

DROP POLICY IF EXISTS "Users can read own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can read own notification preferences"
ON public.notification_preferences
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert own notification preferences"
ON public.notification_preferences
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can update own notification preferences"
ON public.notification_preferences
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Loyalty and rewards.
DROP POLICY IF EXISTS "Users can read own loyalty account" ON public.loyalty_accounts;
CREATE POLICY "Users can read own loyalty account"
ON public.loyalty_accounts
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own loyalty ledger" ON public.loyalty_ledger;
CREATE POLICY "Users can read own loyalty ledger"
ON public.loyalty_ledger
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own reward redemptions" ON public.reward_redemptions;
CREATE POLICY "Users can read own reward redemptions"
ON public.reward_redemptions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Skin profile, routine, completions, streak, and scores.
DROP POLICY IF EXISTS "Users can read own skin profile" ON public.skin_profiles;
CREATE POLICY "Users can read own skin profile"
ON public.skin_profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own skin profile" ON public.skin_profiles;
CREATE POLICY "Users can insert own skin profile"
ON public.skin_profiles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own skin profile" ON public.skin_profiles;
CREATE POLICY "Users can update own skin profile"
ON public.skin_profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own routines" ON public.routines;
CREATE POLICY "Users can read own routines"
ON public.routines
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own routines" ON public.routines;
CREATE POLICY "Users can insert own routines"
ON public.routines
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own routines" ON public.routines;
CREATE POLICY "Users can update own routines"
ON public.routines
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own routines" ON public.routines;
CREATE POLICY "Users can delete own routines"
ON public.routines
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own routine steps" ON public.routine_steps;
CREATE POLICY "Users can read own routine steps"
ON public.routine_steps
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.routines r
    WHERE r.id = routine_steps.routine_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert own routine steps" ON public.routine_steps;
CREATE POLICY "Users can insert own routine steps"
ON public.routine_steps
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.routines r
    WHERE r.id = routine_steps.routine_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update own routine steps" ON public.routine_steps;
CREATE POLICY "Users can update own routine steps"
ON public.routine_steps
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.routines r
    WHERE r.id = routine_steps.routine_id
      AND r.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.routines r
    WHERE r.id = routine_steps.routine_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete own routine steps" ON public.routine_steps;
CREATE POLICY "Users can delete own routine steps"
ON public.routine_steps
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.routines r
    WHERE r.id = routine_steps.routine_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can read own routine completions" ON public.routine_completions;
CREATE POLICY "Users can read own routine completions"
ON public.routine_completions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own routine completions" ON public.routine_completions;
CREATE POLICY "Users can insert own routine completions"
ON public.routine_completions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own routine completions" ON public.routine_completions;
CREATE POLICY "Users can update own routine completions"
ON public.routine_completions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own routine completions" ON public.routine_completions;
CREATE POLICY "Users can delete own routine completions"
ON public.routine_completions
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own routine streak" ON public.routine_streaks;
CREATE POLICY "Users can read own routine streak"
ON public.routine_streaks
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own skin scores" ON public.skin_scores;
CREATE POLICY "Users can read own skin scores"
ON public.skin_scores
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own skin analyses" ON public.skin_analysis_sessions;
CREATE POLICY "Users can read own skin analyses"
ON public.skin_analysis_sessions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own skin analyses" ON public.skin_analysis_sessions;
CREATE POLICY "Users can insert own skin analyses"
ON public.skin_analysis_sessions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own skin analyses" ON public.skin_analysis_sessions;
CREATE POLICY "Users can update own skin analyses"
ON public.skin_analysis_sessions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Inventory, usage, and recommendations.
DROP POLICY IF EXISTS "Users can read own product inventory" ON public.user_product_inventory;
CREATE POLICY "Users can read own product inventory"
ON public.user_product_inventory
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own usage logs" ON public.product_usage_logs;
CREATE POLICY "Users can read own usage logs"
ON public.product_usage_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own usage logs" ON public.product_usage_logs;
CREATE POLICY "Users can insert own usage logs"
ON public.product_usage_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own recommendations" ON public.product_recommendations;
CREATE POLICY "Users can read own recommendations"
ON public.product_recommendations
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND status = 'active'
  AND (expires_at IS NULL OR expires_at > now())
);

DROP POLICY IF EXISTS "Users can update own recommendation status" ON public.product_recommendations;
-- Recommendation clicks, dismissals, wishlist, and cart actions are handled by
-- account APIs with service role to keep score/reason/product fields immutable
-- from direct browser writes.

-- Authenticated carts. Anonymous carts are handled through the API because
-- anon users have no auth.uid() owner.
DROP POLICY IF EXISTS "Users can read own carts" ON public.carts;
CREATE POLICY "Users can read own carts"
ON public.carts
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own carts" ON public.carts;
CREATE POLICY "Users can insert own carts"
ON public.carts
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own carts" ON public.carts;
CREATE POLICY "Users can update own carts"
ON public.carts
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own cart items" ON public.cart_items;
CREATE POLICY "Users can read own cart items"
ON public.cart_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.carts c
    WHERE c.id = cart_items.cart_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert own cart items" ON public.cart_items;
CREATE POLICY "Users can insert own cart items"
ON public.cart_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.carts c
    WHERE c.id = cart_items.cart_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update own cart items" ON public.cart_items;
CREATE POLICY "Users can update own cart items"
ON public.cart_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.carts c
    WHERE c.id = cart_items.cart_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.carts c
    WHERE c.id = cart_items.cart_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete own cart items" ON public.cart_items;
CREATE POLICY "Users can delete own cart items"
ON public.cart_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.carts c
    WHERE c.id = cart_items.cart_id
      AND c.user_id = auth.uid()
  )
);

-- Gift cards: users may see gift cards they bought or that were issued to
-- their verified account email. Code hashes are never exposed by API.
DROP POLICY IF EXISTS "Users can read own gift cards" ON public.gift_cards;
CREATE POLICY "Users can read own gift cards"
ON public.gift_cards
FOR SELECT
TO authenticated
USING (
  purchaser_user_id = auth.uid()
  OR recipient_email = NULLIF(auth.jwt() ->> 'email', '')::citext
);

DROP POLICY IF EXISTS "Users can read own gift card transactions" ON public.gift_card_transactions;
-- Gift card transaction rows can reveal redemption/refund history and should
-- only be exposed through server APIs that return a sanitized summary.

-- Referrals.
DROP POLICY IF EXISTS "Users can read own referral codes" ON public.referral_codes;
CREATE POLICY "Users can read own referral codes"
ON public.referral_codes
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own referral codes" ON public.referral_codes;
CREATE POLICY "Users can insert own referral codes"
ON public.referral_codes
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own referral codes" ON public.referral_codes;
CREATE POLICY "Users can update own referral codes"
ON public.referral_codes
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read own referral invites" ON public.referral_invites;
CREATE POLICY "Users can read own referral invites"
ON public.referral_invites
FOR SELECT
TO authenticated
USING (referrer_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own referral invites" ON public.referral_invites;
CREATE POLICY "Users can insert own referral invites"
ON public.referral_invites
FOR INSERT
TO authenticated
WITH CHECK (referrer_user_id = auth.uid());

-- Audit/outbox are server-only. No anon/auth policies are defined.
REVOKE ALL ON public.payments FROM anon, authenticated;
REVOKE ALL ON public.audit_events FROM anon, authenticated;
REVOKE ALL ON public.event_outbox FROM anon, authenticated;
REVOKE ALL ON public.gift_card_transactions FROM anon, authenticated;

GRANT SELECT ON public.brands TO anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.product_usage_defaults TO anon, authenticated;
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT SELECT ON public.dashboard_nav_items TO anon, authenticated;
GRANT SELECT ON public.membership_tiers TO anon, authenticated;
GRANT SELECT ON public.rewards TO anon, authenticated;

GRANT SELECT ON public.orders, public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT SELECT ON public.payment_methods TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.wishlists TO authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT SELECT ON public.loyalty_accounts, public.loyalty_ledger, public.reward_redemptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.skin_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routines, public.routine_steps, public.routine_completions TO authenticated;
GRANT SELECT ON public.routine_streaks, public.skin_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.skin_analysis_sessions TO authenticated;
GRANT SELECT ON public.user_product_inventory TO authenticated;
GRANT SELECT, INSERT ON public.product_usage_logs TO authenticated;
GRANT SELECT ON public.product_recommendations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.carts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT SELECT ON public.gift_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.referral_codes TO authenticated;
GRANT SELECT, INSERT ON public.referral_invites TO authenticated;

COMMIT;
