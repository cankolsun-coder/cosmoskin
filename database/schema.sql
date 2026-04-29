-- COSMOSKIN Hesabim dashboard database schema
-- Target: Supabase PostgreSQL
-- Purpose: production-ready account dashboard, routine, loyalty, recommendation,
-- notification, inventory, cart, gift card, and referral data model.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.coalesce_empty_text(value text, fallback text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(BTRIM(value), ''), fallback);
$$;

DO $$
BEGIN
  IF to_regtype('public.profile_gender') IS NULL THEN
    CREATE TYPE public.profile_gender AS ENUM ('female', 'male', 'other', 'prefer_not_to_say');
  END IF;
  IF to_regtype('public.product_stock_status') IS NULL THEN
    CREATE TYPE public.product_stock_status AS ENUM ('in_stock', 'low_stock', 'out_of_stock', 'discontinued');
  END IF;
  IF to_regtype('public.routine_category') IS NULL THEN
    CREATE TYPE public.routine_category AS ENUM ('cleanser', 'essence', 'serum', 'treatment', 'moisturizer', 'sunscreen', 'mask');
  END IF;
  IF to_regtype('public.payment_provider') IS NULL THEN
    CREATE TYPE public.payment_provider AS ENUM ('iyzico', 'manual');
  END IF;
  IF to_regtype('public.payment_method_status') IS NULL THEN
    CREATE TYPE public.payment_method_status AS ENUM ('active', 'expired', 'removed');
  END IF;
  IF to_regtype('public.notification_type') IS NULL THEN
    CREATE TYPE public.notification_type AS ENUM (
      'order_shipped',
      'points_earned',
      'product_depletion',
      'routine_streak',
      'reward_available',
      'system'
    );
  END IF;
  IF to_regtype('public.notification_read_status') IS NULL THEN
    CREATE TYPE public.notification_read_status AS ENUM ('unread', 'read', 'archived');
  END IF;
  IF to_regtype('public.loyalty_ledger_type') IS NULL THEN
    CREATE TYPE public.loyalty_ledger_type AS ENUM ('earn', 'redeem', 'expire', 'refund_adjustment', 'manual_adjustment');
  END IF;
  IF to_regtype('public.loyalty_ledger_status') IS NULL THEN
    CREATE TYPE public.loyalty_ledger_status AS ENUM ('pending', 'available', 'cancelled', 'expired');
  END IF;
  IF to_regtype('public.loyalty_source_type') IS NULL THEN
    CREATE TYPE public.loyalty_source_type AS ENUM ('order', 'review', 'referral', 'reward', 'admin');
  END IF;
  IF to_regtype('public.reward_discount_type') IS NULL THEN
    CREATE TYPE public.reward_discount_type AS ENUM ('fixed_amount', 'percentage', 'free_shipping');
  END IF;
  IF to_regtype('public.reward_redemption_status') IS NULL THEN
    CREATE TYPE public.reward_redemption_status AS ENUM ('created', 'used', 'cancelled', 'expired');
  END IF;
  IF to_regtype('public.routine_period') IS NULL THEN
    CREATE TYPE public.routine_period AS ENUM ('morning', 'evening');
  END IF;
  IF to_regtype('public.routine_status') IS NULL THEN
    CREATE TYPE public.routine_status AS ENUM ('active', 'paused', 'archived');
  END IF;
  IF to_regtype('public.routine_source') IS NULL THEN
    CREATE TYPE public.routine_source AS ENUM ('manual', 'order_based', 'analysis_based');
  END IF;
  IF to_regtype('public.routine_completion_status') IS NULL THEN
    CREATE TYPE public.routine_completion_status AS ENUM ('completed', 'skipped');
  END IF;
  IF to_regtype('public.skin_score_source') IS NULL THEN
    CREATE TYPE public.skin_score_source AS ENUM ('routine', 'analysis', 'manual');
  END IF;
  IF to_regtype('public.skin_analysis_status') IS NULL THEN
    CREATE TYPE public.skin_analysis_status AS ENUM ('draft', 'completed', 'archived');
  END IF;
  IF to_regtype('public.inventory_status') IS NULL THEN
    CREATE TYPE public.inventory_status AS ENUM ('active', 'paused', 'empty', 'reordered');
  END IF;
  IF to_regtype('public.recommendation_status') IS NULL THEN
    CREATE TYPE public.recommendation_status AS ENUM ('active', 'clicked', 'dismissed', 'purchased');
  END IF;
  IF to_regtype('public.recommendation_reason_type') IS NULL THEN
    CREATE TYPE public.recommendation_reason_type AS ENUM (
      'missing_routine_step',
      'skin_concern_match',
      'running_out_alternative',
      'reorder_reminder',
      'similar_to_wishlist',
      'trending_for_segment',
      'manual'
    );
  END IF;
  IF to_regtype('public.recommendation_source') IS NULL THEN
    CREATE TYPE public.recommendation_source AS ENUM (
      'dashboard',
      'routine',
      'skin_profile',
      'skin_analysis',
      'order_history',
      'inventory',
      'wishlist',
      'admin'
    );
  END IF;
  IF to_regtype('public.cart_status') IS NULL THEN
    CREATE TYPE public.cart_status AS ENUM ('active', 'ordered', 'abandoned');
  END IF;
  IF to_regtype('public.gift_card_status') IS NULL THEN
    CREATE TYPE public.gift_card_status AS ENUM ('active', 'redeemed', 'expired', 'disabled');
  END IF;
  IF to_regtype('public.gift_card_transaction_type') IS NULL THEN
    CREATE TYPE public.gift_card_transaction_type AS ENUM ('issue', 'redeem', 'refund', 'adjustment');
  END IF;
  IF to_regtype('public.referral_status') IS NULL THEN
    CREATE TYPE public.referral_status AS ENUM ('active', 'sent', 'accepted', 'rewarded', 'expired', 'cancelled');
  END IF;
  IF to_regtype('public.audit_event_actor_type') IS NULL THEN
    CREATE TYPE public.audit_event_actor_type AS ENUM ('user', 'admin', 'system');
  END IF;
  IF to_regtype('public.outbox_event_status') IS NULL THEN
    CREATE TYPE public.outbox_event_status AS ENUM ('pending', 'processing', 'processed', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brands_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  sku text UNIQUE,
  brand_id uuid REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name text NOT NULL,
  category_slug text NOT NULL,
  image_url text,
  product_url text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  volume_value numeric(10,2) CHECK (volume_value IS NULL OR volume_value > 0),
  volume_unit text,
  keywords text[] NOT NULL DEFAULT '{}',
  concern_slugs text[] NOT NULL DEFAULT '{}',
  routine_category public.routine_category NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_reorderable boolean NOT NULL DEFAULT true,
  stock_status public.product_stock_status NOT NULL DEFAULT 'in_stock',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT products_product_url_path CHECK (product_url LIKE '/products/%' OR product_url LIKE 'https://%')
);

CREATE TABLE IF NOT EXISTS public.product_usage_defaults (
  routine_category public.routine_category PRIMARY KEY,
  default_total_days int NOT NULL CHECK (default_total_days > 0),
  default_daily_usage_amount numeric(10,3),
  low_stock_percent_threshold int NOT NULL DEFAULT 75 CHECK (low_stock_percent_threshold BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  order_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending_payment',
  currency text NOT NULL DEFAULT 'TRY',
  subtotal_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  vat_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  shipping_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  total_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  customer_email citext NOT NULL,
  customer_first_name text NOT NULL,
  customer_last_name text NOT NULL,
  customer_phone text NOT NULL,
  invoice_type text,
  identity_number text,
  city text,
  district text,
  postal_code text,
  address_line text,
  cargo_note text,
  shipping_provider text,
  tracking_number text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_currency_uppercase CHECK (currency = upper(currency)),
  CONSTRAINT orders_status_allowed CHECK (
    status IN (
      'pending_payment',
      'paid',
      'confirmed',
      'processing',
      'shipped',
      'delivered',
      'payment_failed',
      'failed',
      'cancelled',
      'refunded',
      'partially_refunded'
    )
  )
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  product_uuid uuid REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE SET NULL,
  product_id text NOT NULL,
  product_slug text,
  product_name text NOT NULL,
  brand text NOT NULL DEFAULT 'COSMOSKIN',
  image text,
  unit_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- Compatibility migration for existing Cosmoskin databases created from older schema.sql versions.
-- CREATE TABLE IF NOT EXISTS does not add newly introduced columns to an existing table.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_uuid uuid REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  provider public.payment_provider NOT NULL DEFAULT 'iyzico',
  status text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'TRY',
  conversation_id text,
  provider_token text,
  provider_payment_id text,
  raw_initialize_response jsonb,
  raw_callback_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  email citext NOT NULL UNIQUE,
  first_name text,
  last_name text,
  avatar_url text,
  phone text,
  birthdate date,
  gender public.profile_gender,
  locale text NOT NULL DEFAULT 'tr-TR',
  timezone text NOT NULL DEFAULT 'Europe/Istanbul',
  marketing_email_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Adresim',
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  address_line text NOT NULL,
  city text NOT NULL,
  district text,
  postal_code text,
  is_default boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- Compatibility migration for existing Cosmoskin databases created from older addresses schemas.
-- CREATE TABLE IF NOT EXISTS does not add newly introduced columns to an existing table.
ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS title text DEFAULT 'Adresim',
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.addresses SET title = COALESCE(title, 'Adresim');
UPDATE public.addresses SET is_default = COALESCE(is_default, false);
UPDATE public.addresses SET created_at = COALESCE(created_at, now());
UPDATE public.addresses SET updated_at = COALESCE(updated_at, now());

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  provider public.payment_provider NOT NULL DEFAULT 'iyzico',
  provider_customer_id text,
  provider_token_ref text NOT NULL,
  card_brand text NOT NULL,
  card_last4 text NOT NULL CHECK (card_last4 ~ '^[0-9]{4}$'),
  exp_month int NOT NULL CHECK (exp_month BETWEEN 1 AND 12),
  exp_year int NOT NULL CHECK (exp_year BETWEEN 2000 AND 2100),
  holder_name text,
  is_default boolean NOT NULL DEFAULT false,
  status public.payment_method_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dashboard_nav_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label_tr text NOT NULL,
  icon_key text NOT NULL,
  href text,
  tab_key text,
  sort_order int NOT NULL,
  requires_auth boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  badge_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dashboard_nav_items_action_target CHECK (href IS NOT NULL OR tab_key IS NOT NULL OR key = 'logout')
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  action_label text,
  action_url text,
  source_type text,
  source_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_status public.notification_read_status NOT NULL DEFAULT 'unread',
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  read_by_user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  read_source text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  orders boolean NOT NULL DEFAULT true,
  campaigns boolean NOT NULL DEFAULT false,
  new_products boolean NOT NULL DEFAULT false,
  tips boolean NOT NULL DEFAULT false,
  sms boolean NOT NULL DEFAULT false,
  routine_reminders boolean NOT NULL DEFAULT true,
  restock_reminders boolean NOT NULL DEFAULT false,
  low_stock_alerts boolean NOT NULL DEFAULT false,
  cadence_days int NOT NULL DEFAULT 14 CHECK (cadence_days IN (7, 14, 21, 30)),
  depletion_lead_days int NOT NULL DEFAULT 5 CHECK (depletion_lead_days IN (3, 5, 7, 10)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.membership_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label_tr text NOT NULL,
  min_lifetime_spend numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_lifetime_spend >= 0),
  points_multiplier numeric(4,2) NOT NULL DEFAULT 1 CHECK (points_multiplier >= 1),
  sort_order int NOT NULL,
  benefits jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  current_points int NOT NULL DEFAULT 0 CHECK (current_points >= 0),
  pending_points int NOT NULL DEFAULT 0 CHECK (pending_points >= 0),
  lifetime_points int NOT NULL DEFAULT 0 CHECK (lifetime_points >= 0),
  lifetime_spend numeric(12,2) NOT NULL DEFAULT 0 CHECK (lifetime_spend >= 0),
  tier_id uuid REFERENCES public.membership_tiers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  points int NOT NULL,
  type public.loyalty_ledger_type NOT NULL,
  status public.loyalty_ledger_status NOT NULL DEFAULT 'pending',
  source_type public.loyalty_source_type NOT NULL,
  source_id text NOT NULL,
  event_key text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  description_tr text,
  available_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_ledger_user_event_key_key UNIQUE (user_id, event_key),
  CONSTRAINT loyalty_ledger_nonzero_points CHECK (points <> 0)
);

CREATE TABLE IF NOT EXISTS public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title_tr text NOT NULL,
  required_points int NOT NULL CHECK (required_points > 0),
  discount_type public.reward_discount_type NOT NULL,
  discount_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  reward_id uuid NOT NULL REFERENCES public.rewards(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  points_spent int NOT NULL CHECK (points_spent > 0),
  coupon_code text UNIQUE,
  status public.reward_redemption_status NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.skin_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  skin_type text,
  concerns text[] NOT NULL DEFAULT '{}',
  sensitivities text[] NOT NULL DEFAULT '{}',
  goals text[] NOT NULL DEFAULT '{}',
  last_analysis_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'COSMOSKIN Rutinim',
  status public.routine_status NOT NULL DEFAULT 'active',
  source public.routine_source NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.routine_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL REFERENCES public.routines(id) ON UPDATE CASCADE ON DELETE CASCADE,
  period public.routine_period NOT NULL,
  step_order int NOT NULL CHECK (step_order > 0),
  routine_category public.routine_category NOT NULL,
  product_id uuid REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE SET NULL,
  custom_product_name text,
  is_required boolean NOT NULL DEFAULT true,
  frequency_rule jsonb NOT NULL DEFAULT '{"days":"daily"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT routine_steps_product_or_custom CHECK (product_id IS NOT NULL OR custom_product_name IS NOT NULL),
  UNIQUE (routine_id, period, step_order)
);

CREATE TABLE IF NOT EXISTS public.routine_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  routine_id uuid NOT NULL REFERENCES public.routines(id) ON UPDATE CASCADE ON DELETE CASCADE,
  routine_step_id uuid NOT NULL REFERENCES public.routine_steps(id) ON UPDATE CASCADE ON DELETE CASCADE,
  completion_date date NOT NULL,
  period public.routine_period NOT NULL,
  status public.routine_completion_status NOT NULL DEFAULT 'completed',
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT routine_completions_user_step_date_key UNIQUE (user_id, routine_step_id, completion_date)
);

CREATE TABLE IF NOT EXISTS public.routine_streaks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  current_streak int NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  best_streak int NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  weekly_completed_days int NOT NULL DEFAULT 0 CHECK (weekly_completed_days BETWEEN 0 AND 7),
  week_start_date date NOT NULL DEFAULT (date_trunc('week', now())::date),
  last_completed_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.skin_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  overall_score int NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  moisture_score int NOT NULL CHECK (moisture_score BETWEEN 0 AND 100),
  barrier_score int NOT NULL CHECK (barrier_score BETWEEN 0 AND 100),
  spf_score int NOT NULL CHECK (spf_score BETWEEN 0 AND 100),
  source public.skin_score_source NOT NULL DEFAULT 'routine',
  calculation_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.skin_analysis_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  status public.skin_analysis_status NOT NULL DEFAULT 'draft',
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.skin_profiles
  DROP CONSTRAINT IF EXISTS skin_profiles_last_analysis_fk;
ALTER TABLE public.skin_profiles
  ADD CONSTRAINT skin_profiles_last_analysis_fk
  FOREIGN KEY (last_analysis_id)
  REFERENCES public.skin_analysis_sessions(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.user_product_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  source_order_item_id uuid REFERENCES public.order_items(id) ON UPDATE CASCADE ON DELETE SET NULL,
  quantity_purchased int NOT NULL DEFAULT 1 CHECK (quantity_purchased > 0),
  opened_at date,
  started_at date NOT NULL DEFAULT CURRENT_DATE,
  estimated_empty_at date,
  usage_percent int NOT NULL DEFAULT 0 CHECK (usage_percent BETWEEN 0 AND 100),
  daily_usage_amount numeric(10,3),
  status public.inventory_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id, source_order_item_id)
);

CREATE TABLE IF NOT EXISTS public.product_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.user_product_inventory(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_percent numeric(5,2) NOT NULL CHECK (amount_percent >= 0 AND amount_percent <= 100),
  routine_completion_id uuid REFERENCES public.routine_completions(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventory_id, usage_date, routine_completion_id)
);

CREATE TABLE IF NOT EXISTS public.product_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE CASCADE,
  reason_type public.recommendation_reason_type NOT NULL DEFAULT 'skin_concern_match',
  reason_code text NOT NULL,
  reason_text_tr text NOT NULL,
  points_benefit int NOT NULL DEFAULT 0 CHECK (points_benefit >= 0),
  source public.recommendation_source NOT NULL DEFAULT 'dashboard',
  score numeric(6,3) NOT NULL DEFAULT 0 CHECK (score >= 0),
  source_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.recommendation_status NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  anonymous_id text,
  status public.cart_status NOT NULL DEFAULT 'active',
  currency text NOT NULL DEFAULT 'TRY',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carts_owner_present CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10),
  unit_price_snapshot numeric(12,2) NOT NULL CHECK (unit_price_snapshot >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  purchaser_user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  recipient_email citext,
  initial_balance numeric(12,2) NOT NULL CHECK (initial_balance > 0),
  current_balance numeric(12,2) NOT NULL CHECK (current_balance >= 0),
  currency text NOT NULL DEFAULT 'TRY',
  status public.gift_card_status NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_cards_balance_not_above_initial CHECK (current_balance <= initial_balance)
);

CREATE TABLE IF NOT EXISTS public.gift_card_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id uuid NOT NULL REFERENCES public.gift_cards(id) ON UPDATE CASCADE ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  type public.gift_card_transaction_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  status public.referral_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_format CHECK (code ~ '^[A-Z0-9]{4,24}$')
);

CREATE TABLE IF NOT EXISTS public.referral_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  recipient_email citext NOT NULL,
  status public.referral_status NOT NULL DEFAULT 'sent',
  reward_points int NOT NULL DEFAULT 0 CHECK (reward_points >= 0),
  accepted_user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_user_id, recipient_email)
);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type public.audit_event_actor_type NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_table text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.outbox_event_status NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backward-compatible schema upgrades for databases that already ran an older
-- version of this package. These keep existing API fields intact while adding
-- the explicit contract fields requested by the dashboard backend.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_status public.notification_read_status NOT NULL DEFAULT 'unread';
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_by_user_id uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_source text;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.loyalty_accounts
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.routine_streaks
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.product_recommendations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.notifications
SET read_status = CASE
  WHEN read_at IS NULL THEN 'unread'::public.notification_read_status
  ELSE 'read'::public.notification_read_status
END
WHERE read_status IS DISTINCT FROM CASE
  WHEN read_at IS NULL THEN 'unread'::public.notification_read_status
  ELSE 'read'::public.notification_read_status
END;

ALTER TABLE public.notifications
  ALTER COLUMN read_status SET DEFAULT 'unread';
ALTER TABLE public.notifications
  ALTER COLUMN read_status SET NOT NULL;
UPDATE public.notifications
SET is_read = (read_status <> 'unread'::public.notification_read_status OR read_at IS NOT NULL)
WHERE is_read IS DISTINCT FROM (read_status <> 'unread'::public.notification_read_status OR read_at IS NOT NULL);

ALTER TABLE public.notifications
  ALTER COLUMN is_read SET DEFAULT false;
ALTER TABLE public.notifications
  ALTER COLUMN is_read SET NOT NULL;

ALTER TABLE public.loyalty_ledger
  ADD COLUMN IF NOT EXISTS event_key text;
ALTER TABLE public.loyalty_ledger
  ADD COLUMN IF NOT EXISTS idempotency_key text;

UPDATE public.loyalty_ledger
SET idempotency_key = COALESCE(NULLIF(BTRIM(idempotency_key), ''), NULLIF(BTRIM(event_key), ''), id::text)
WHERE idempotency_key IS NULL OR BTRIM(idempotency_key) = '';

UPDATE public.loyalty_ledger
SET event_key = COALESCE(NULLIF(BTRIM(event_key), ''), NULLIF(BTRIM(idempotency_key), ''), id::text)
WHERE event_key IS NULL OR BTRIM(event_key) = '';

ALTER TABLE public.loyalty_ledger
  ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE public.loyalty_ledger
  ALTER COLUMN event_key SET NOT NULL;

DO $$
DECLARE
  duplicate_count bigint;
  has_exact_unique boolean;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT user_id, event_key
    FROM public.loyalty_ledger
    WHERE event_key IS NOT NULL
    GROUP BY user_id, event_key
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add loyalty_ledger UNIQUE(user_id, event_key): % duplicate key group(s) exist. Resolve duplicates manually; migration did not delete data.',
      duplicate_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.loyalty_ledger'::regclass
      AND c.conname = 'loyalty_ledger_event_key_key'
      AND (
        SELECT array_agg(a.attname ORDER BY key.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS key(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
      ) = ARRAY['event_key']::name[]
  ) THEN
    ALTER TABLE public.loyalty_ledger
      DROP CONSTRAINT IF EXISTS loyalty_ledger_event_key_key;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.loyalty_ledger'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY key.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS key(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
      ) = ARRAY['user_id', 'event_key']::name[]
  ) INTO has_exact_unique;

  IF NOT has_exact_unique THEN
    ALTER TABLE public.loyalty_ledger
      ADD CONSTRAINT loyalty_ledger_user_event_key_key UNIQUE (user_id, event_key);
  END IF;
END $$;

DO $$
DECLARE
  duplicate_count bigint;
  has_exact_unique boolean;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT user_id, product_id
    FROM public.wishlists
    GROUP BY user_id, product_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add wishlists UNIQUE(user_id, product_id): % duplicate key group(s) exist. Resolve duplicates manually; migration did not delete data.',
      duplicate_count;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.wishlists'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY key.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS key(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
      ) = ARRAY['user_id', 'product_id']::name[]
  ) INTO has_exact_unique;

  IF NOT has_exact_unique THEN
    ALTER TABLE public.wishlists
      ADD CONSTRAINT wishlists_user_product_key UNIQUE (user_id, product_id);
  END IF;
END $$;

DO $$
DECLARE
  duplicate_count bigint;
  has_exact_unique boolean;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT cart_id, product_id
    FROM public.cart_items
    GROUP BY cart_id, product_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add cart_items UNIQUE(cart_id, product_id): % duplicate key group(s) exist. Resolve duplicates manually; migration did not delete data.',
      duplicate_count;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.cart_items'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY key.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS key(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
      ) = ARRAY['cart_id', 'product_id']::name[]
  ) INTO has_exact_unique;

  IF NOT has_exact_unique THEN
    ALTER TABLE public.cart_items
      ADD CONSTRAINT cart_items_cart_product_key UNIQUE (cart_id, product_id);
  END IF;
END $$;

DO $$
DECLARE
  duplicate_count bigint;
  has_exact_unique boolean;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT user_id, routine_step_id, completion_date
    FROM public.routine_completions
    GROUP BY user_id, routine_step_id, completion_date
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add routine_completions UNIQUE(user_id, routine_step_id, completion_date): % duplicate key group(s) exist. Resolve duplicates manually; migration did not delete data.',
      duplicate_count;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'routine_completions'
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY key.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS key(attnum, ordinality)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
      ) = ARRAY['user_id', 'routine_step_id', 'completion_date']::name[]
  ) INTO has_exact_unique;

  IF NOT has_exact_unique THEN
    ALTER TABLE public.routine_completions
      ADD CONSTRAINT routine_completions_user_step_date_key UNIQUE (user_id, routine_step_id, completion_date);
  END IF;
END $$;

ALTER TABLE public.product_recommendations
  ADD COLUMN IF NOT EXISTS reason_type public.recommendation_reason_type NOT NULL DEFAULT 'skin_concern_match';
ALTER TABLE public.product_recommendations
  ADD COLUMN IF NOT EXISTS source public.recommendation_source NOT NULL DEFAULT 'dashboard';
ALTER TABLE public.product_recommendations
  ADD COLUMN IF NOT EXISTS score numeric(6,3) NOT NULL DEFAULT 0 CHECK (score >= 0);

UPDATE public.product_recommendations
SET reason_type = 'skin_concern_match'::public.recommendation_reason_type
WHERE reason_type IS NULL;

UPDATE public.product_recommendations
SET source = 'dashboard'::public.recommendation_source
WHERE source IS NULL;

UPDATE public.product_recommendations
SET score = 0
WHERE score IS NULL;

ALTER TABLE public.product_recommendations
  ALTER COLUMN reason_type SET DEFAULT 'skin_concern_match',
  ALTER COLUMN reason_type SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'dashboard',
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN score SET DEFAULT 0,
  ALTER COLUMN score SET NOT NULL;

UPDATE public.user_product_inventory
SET status = 'active'::public.inventory_status
WHERE status IS NULL;

ALTER TABLE public.user_product_inventory
  ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.user_product_inventory
  ALTER COLUMN status SET NOT NULL;

CREATE OR REPLACE VIEW public.account_running_out_soon AS
SELECT
  inv.id AS inventory_id,
  inv.user_id,
  inv.product_id,
  p.brand_id,
  p.slug,
  p.name AS product_name,
  p.image_url,
  p.product_url,
  p.routine_category,
  inv.status,
  inv.started_at,
  inv.estimated_empty_at,
  inv.usage_percent,
  GREATEST(0, COALESCE(inv.estimated_empty_at, CURRENT_DATE) - CURRENT_DATE) AS estimated_days_left,
  COALESCE(defaults.low_stock_percent_threshold, 75) AS low_stock_percent_threshold
FROM public.user_product_inventory inv
JOIN public.products p ON p.id = inv.product_id
LEFT JOIN public.product_usage_defaults defaults ON defaults.routine_category = p.routine_category
WHERE inv.status = 'active'
  AND p.is_active = true;

CREATE OR REPLACE FUNCTION public.refresh_inventory_estimate(p_inventory_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory public.user_product_inventory%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_default_days int;
  v_estimated_total_days int;
  v_elapsed_days int;
BEGIN
  SELECT * INTO v_inventory
  FROM public.user_product_inventory
  WHERE id = p_inventory_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = v_inventory.product_id;

  SELECT default_total_days INTO v_default_days
  FROM public.product_usage_defaults
  WHERE routine_category = v_product.routine_category;

  v_default_days := COALESCE(v_default_days, 35);
  v_estimated_total_days := GREATEST(1, v_default_days * GREATEST(1, v_inventory.quantity_purchased));
  v_elapsed_days := GREATEST(0, CURRENT_DATE - v_inventory.started_at);

  UPDATE public.user_product_inventory
  SET
    estimated_empty_at = v_inventory.started_at + v_estimated_total_days,
    usage_percent = LEAST(100, GREATEST(0, FLOOR((v_elapsed_days::numeric / v_estimated_total_days::numeric) * 100)::int)),
    updated_at = now()
  WHERE id = p_inventory_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_notification_read_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_read = true AND NEW.read_status = 'unread' THEN
    NEW.read_status = 'read';
  END IF;

  IF NEW.read_status IN ('read', 'archived') AND NEW.read_at IS NULL THEN
    NEW.read_at = now();
  END IF;

  IF NEW.read_at IS NOT NULL AND NEW.read_status = 'unread' THEN
    NEW.read_status = 'read';
  END IF;

  IF NEW.read_status = 'unread' THEN
    NEW.is_read = false;
    NEW.read_at = NULL;
    NEW.read_by_user_id = NULL;
    NEW.read_source = NULL;
  ELSE
    NEW.is_read = true;
  END IF;

  IF NEW.read_status IN ('read', 'archived') AND NEW.read_source IS NULL THEN
    NEW.read_source = 'user';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_notifications(
  p_archive_read_after_days int DEFAULT 30,
  p_delete_archived_after_days int DEFAULT 180,
  p_delete_expired_after_days int DEFAULT 30,
  p_batch_size int DEFAULT 1000
)
RETURNS TABLE(archived_count int, deleted_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_archived_count int := 0;
  v_deleted_count int := 0;
BEGIN
  IF p_archive_read_after_days < 1 THEN
    RAISE EXCEPTION 'p_archive_read_after_days must be >= 1';
  END IF;
  IF p_delete_archived_after_days < p_archive_read_after_days THEN
    RAISE EXCEPTION 'p_delete_archived_after_days must be >= p_archive_read_after_days';
  END IF;
  IF p_delete_expired_after_days < 0 THEN
    RAISE EXCEPTION 'p_delete_expired_after_days must be >= 0';
  END IF;
  IF p_batch_size < 1 OR p_batch_size > 10000 THEN
    RAISE EXCEPTION 'p_batch_size must be between 1 and 10000';
  END IF;

  WITH candidates AS (
    SELECT id
    FROM public.notifications
    WHERE read_status = 'read'
      AND read_at < now() - make_interval(days => p_archive_read_after_days)
    ORDER BY read_at ASC
    LIMIT p_batch_size
  ),
  archived AS (
    UPDATE public.notifications n
    SET
      read_status = 'archived',
      is_read = true,
      read_source = COALESCE(n.read_source, 'system')
    FROM candidates c
    WHERE n.id = c.id
    RETURNING n.id
  )
  SELECT COUNT(*) INTO v_archived_count FROM archived;

  WITH candidates AS (
    SELECT id
    FROM public.notifications
    WHERE (
        read_status = 'archived'
        AND COALESCE(read_at, created_at) < now() - make_interval(days => p_delete_archived_after_days)
      )
      OR (
        expires_at IS NOT NULL
        AND expires_at < now() - make_interval(days => p_delete_expired_after_days)
      )
    ORDER BY COALESCE(read_at, expires_at, created_at) ASC
    LIMIT p_batch_size
  ),
  deleted AS (
    DELETE FROM public.notifications n
    USING candidates c
    WHERE n.id = c.id
    RETURNING n.id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;

  archived_count := v_archived_count;
  deleted_count := v_deleted_count;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_notifications(int, int, int, int) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications(int, int, int, int) TO service_role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_loyalty_ledger_event_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_key IS NULL OR BTRIM(NEW.event_key) = '' THEN
    NEW.event_key = NEW.idempotency_key;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_loyalty_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_points int;
  v_pending_points int;
  v_lifetime_points int;
  v_lifetime_spend numeric(12,2);
  v_tier_id uuid;
BEGIN
  SELECT
    COALESCE(SUM(points) FILTER (WHERE status = 'available'), 0),
    COALESCE(SUM(points) FILTER (WHERE status = 'pending'), 0),
    COALESCE(SUM(points) FILTER (WHERE type = 'earn' AND status IN ('pending', 'available')), 0)
  INTO v_current_points, v_pending_points, v_lifetime_points
  FROM public.loyalty_ledger
  WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(subtotal_amount), 0)
  INTO v_lifetime_spend
  FROM public.orders
  WHERE user_id = p_user_id
    AND status IN ('paid', 'confirmed', 'processing', 'shipped', 'delivered')
    AND refunded_at IS NULL
    AND cancelled_at IS NULL;

  SELECT id
  INTO v_tier_id
  FROM public.membership_tiers
  WHERE is_active = true
    AND min_lifetime_spend <= COALESCE(v_lifetime_spend, 0)
  ORDER BY min_lifetime_spend DESC, sort_order DESC
  LIMIT 1;

  INSERT INTO public.loyalty_accounts (
    user_id,
    current_points,
    pending_points,
    lifetime_points,
    lifetime_spend,
    tier_id,
    updated_at
  )
  VALUES (
    p_user_id,
    GREATEST(0, COALESCE(v_current_points, 0)),
    GREATEST(0, COALESCE(v_pending_points, 0)),
    GREATEST(0, COALESCE(v_lifetime_points, 0)),
    GREATEST(0, COALESCE(v_lifetime_spend, 0)),
    v_tier_id,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    current_points = EXCLUDED.current_points,
    pending_points = EXCLUDED.pending_points,
    lifetime_points = EXCLUDED.lifetime_points,
    lifetime_spend = EXCLUDED.lifetime_spend,
    tier_id = EXCLUDED.tier_id,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.loyalty_ledger_recalculate_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_loyalty_account(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_routine_streak(p_user_id uuid, p_anchor_date date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start date;
  v_current int := 0;
  v_cursor date := p_anchor_date;
  v_day_complete boolean;
  v_best int;
  v_weekly int;
  v_required_count int;
  v_done_count int;
  v_last_completed date;
BEGIN
  v_week_start := date_trunc('week', p_anchor_date::timestamp)::date;

  LOOP
    SELECT COUNT(*) INTO v_required_count
    FROM public.routines r
    JOIN public.routine_steps s ON s.routine_id = r.id
    WHERE r.user_id = p_user_id
      AND r.status = 'active'
      AND s.is_required = true;

    IF v_required_count = 0 THEN
      v_day_complete := false;
    ELSE
      SELECT COUNT(DISTINCT c.routine_step_id) INTO v_done_count
      FROM public.routine_completions c
      WHERE c.user_id = p_user_id
        AND c.completion_date = v_cursor
        AND c.status IN ('completed', 'skipped');

      v_day_complete := v_done_count >= v_required_count;
    END IF;

    IF NOT v_day_complete THEN
      IF v_current = 0 AND v_cursor = p_anchor_date THEN
        v_cursor := v_cursor - 1;
        CONTINUE;
      END IF;
      EXIT;
    END IF;

    IF v_current = 0 THEN
      v_last_completed := v_cursor;
    END IF;

    v_current := v_current + 1;
    v_cursor := v_cursor - 1;
  END LOOP;

  WITH days AS (
    SELECT generate_series(v_week_start, v_week_start + 6, interval '1 day')::date AS day
  ),
  required AS (
    SELECT COUNT(*) AS count
    FROM public.routines r
    JOIN public.routine_steps s ON s.routine_id = r.id
    WHERE r.user_id = p_user_id
      AND r.status = 'active'
      AND s.is_required = true
  ),
  completed_days AS (
    SELECT d.day
    FROM days d
    CROSS JOIN required req
    LEFT JOIN public.routine_completions c
      ON c.user_id = p_user_id
     AND c.completion_date = d.day
     AND c.status IN ('completed', 'skipped')
    GROUP BY d.day, req.count
    HAVING req.count > 0 AND COUNT(DISTINCT c.routine_step_id) >= req.count
  )
  SELECT COUNT(*) INTO v_weekly FROM completed_days;

  SELECT GREATEST(COALESCE(best_streak, 0), v_current)
  INTO v_best
  FROM public.routine_streaks
  WHERE user_id = p_user_id;

  INSERT INTO public.routine_streaks (
    user_id,
    current_streak,
    best_streak,
    weekly_completed_days,
    week_start_date,
    last_completed_date,
    updated_at
  )
  VALUES (
    p_user_id,
    v_current,
    COALESCE(v_best, v_current),
    COALESCE(v_weekly, 0),
    v_week_start,
    CASE WHEN v_current > 0 THEN v_last_completed ELSE NULL END,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    current_streak = EXCLUDED.current_streak,
    best_streak = GREATEST(public.routine_streaks.best_streak, EXCLUDED.best_streak),
    weekly_completed_days = EXCLUDED.weekly_completed_days,
    week_start_date = EXCLUDED.week_start_date,
    last_completed_date = EXCLUDED.last_completed_date,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.routine_completion_recalculate_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_routine_streak(COALESCE(NEW.user_id, OLD.user_id), COALESCE(NEW.completion_date, OLD.completion_date));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE INDEX IF NOT EXISTS products_brand_id_idx ON public.products(brand_id);
CREATE INDEX IF NOT EXISTS products_active_category_idx ON public.products(is_active, category_slug);
CREATE INDEX IF NOT EXISTS products_routine_category_idx ON public.products(routine_category);
CREATE INDEX IF NOT EXISTS products_keywords_gin_idx ON public.products USING gin(keywords);
CREATE INDEX IF NOT EXISTS products_concern_slugs_gin_idx ON public.products USING gin(concern_slugs);

CREATE INDEX IF NOT EXISTS orders_user_created_idx ON public.orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_uuid_idx ON public.order_items(product_uuid);
CREATE INDEX IF NOT EXISTS payments_order_id_idx ON public.payments(order_id);

CREATE INDEX IF NOT EXISTS addresses_user_active_idx ON public.addresses(user_id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS addresses_one_default_per_user_idx ON public.addresses(user_id) WHERE is_default = true AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS payment_methods_user_active_idx ON public.payment_methods(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_one_default_per_user_idx ON public.payment_methods(user_id) WHERE is_default = true AND status = 'active';

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON public.notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_user_read_status_idx ON public.notifications(user_id, read_status, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_is_read_created_idx ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_cleanup_idx ON public.notifications(read_status, read_at, expires_at, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_source_idx ON public.notifications(user_id, type, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS loyalty_ledger_user_created_idx ON public.loyalty_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS loyalty_ledger_available_idx ON public.loyalty_ledger(user_id, status, available_at);

CREATE INDEX IF NOT EXISTS routines_user_status_idx ON public.routines(user_id, status);
CREATE INDEX IF NOT EXISTS routine_steps_routine_period_idx ON public.routine_steps(routine_id, period, step_order);
CREATE INDEX IF NOT EXISTS routine_completions_user_date_idx ON public.routine_completions(user_id, completion_date DESC);
CREATE INDEX IF NOT EXISTS skin_scores_user_calculated_idx ON public.skin_scores(user_id, calculated_at DESC);

CREATE INDEX IF NOT EXISTS inventory_user_status_idx ON public.user_product_inventory(user_id, status);
CREATE INDEX IF NOT EXISTS inventory_estimated_empty_idx ON public.user_product_inventory(user_id, estimated_empty_at);
CREATE INDEX IF NOT EXISTS inventory_active_running_out_lookup_idx ON public.user_product_inventory(user_id, estimated_empty_at, usage_percent DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS product_usage_logs_user_date_idx ON public.product_usage_logs(user_id, usage_date DESC);
CREATE INDEX IF NOT EXISTS recommendations_user_status_score_idx ON public.product_recommendations(user_id, status, score DESC);
CREATE INDEX IF NOT EXISTS recommendations_user_score_idx ON public.product_recommendations(user_id, score DESC);
CREATE INDEX IF NOT EXISTS recommendations_user_reason_source_idx ON public.product_recommendations(user_id, reason_type, source);

CREATE UNIQUE INDEX IF NOT EXISTS carts_one_active_user_cart_idx ON public.carts(user_id) WHERE status = 'active' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS carts_one_active_anonymous_cart_idx ON public.carts(anonymous_id) WHERE status = 'active' AND anonymous_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cart_items_cart_id_idx ON public.cart_items(cart_id);

CREATE INDEX IF NOT EXISTS gift_cards_purchaser_idx ON public.gift_cards(purchaser_user_id);
CREATE INDEX IF NOT EXISTS gift_cards_recipient_email_idx ON public.gift_cards(recipient_email);
CREATE INDEX IF NOT EXISTS referral_invites_referrer_idx ON public.referral_invites(referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_target_created_idx ON public.audit_events(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS event_outbox_status_available_idx ON public.event_outbox(status, available_at);

DROP TRIGGER IF EXISTS set_brands_updated_at ON public.brands;
CREATE TRIGGER set_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_product_usage_defaults_updated_at ON public.product_usage_defaults;
CREATE TRIGGER set_product_usage_defaults_updated_at BEFORE UPDATE ON public.product_usage_defaults FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_orders_updated_at ON public.orders;
CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_payments_updated_at ON public.payments;
CREATE TRIGGER set_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_addresses_updated_at ON public.addresses;
CREATE TRIGGER set_addresses_updated_at BEFORE UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER set_payment_methods_updated_at BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_site_settings_updated_at ON public.site_settings;
CREATE TRIGGER set_site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_dashboard_nav_items_updated_at ON public.dashboard_nav_items;
CREATE TRIGGER set_dashboard_nav_items_updated_at BEFORE UPDATE ON public.dashboard_nav_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_notifications_updated_at ON public.notifications;
CREATE TRIGGER set_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER set_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_membership_tiers_updated_at ON public.membership_tiers;
CREATE TRIGGER set_membership_tiers_updated_at BEFORE UPDATE ON public.membership_tiers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_loyalty_accounts_updated_at ON public.loyalty_accounts;
CREATE TRIGGER set_loyalty_accounts_updated_at BEFORE UPDATE ON public.loyalty_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_rewards_updated_at ON public.rewards;
CREATE TRIGGER set_rewards_updated_at BEFORE UPDATE ON public.rewards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_reward_redemptions_updated_at ON public.reward_redemptions;
CREATE TRIGGER set_reward_redemptions_updated_at BEFORE UPDATE ON public.reward_redemptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_skin_profiles_updated_at ON public.skin_profiles;
CREATE TRIGGER set_skin_profiles_updated_at BEFORE UPDATE ON public.skin_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_routines_updated_at ON public.routines;
CREATE TRIGGER set_routines_updated_at BEFORE UPDATE ON public.routines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_routine_steps_updated_at ON public.routine_steps;
CREATE TRIGGER set_routine_steps_updated_at BEFORE UPDATE ON public.routine_steps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_routine_streaks_updated_at ON public.routine_streaks;
CREATE TRIGGER set_routine_streaks_updated_at BEFORE UPDATE ON public.routine_streaks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_skin_analysis_sessions_updated_at ON public.skin_analysis_sessions;
CREATE TRIGGER set_skin_analysis_sessions_updated_at BEFORE UPDATE ON public.skin_analysis_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_inventory_updated_at ON public.user_product_inventory;
CREATE TRIGGER set_inventory_updated_at BEFORE UPDATE ON public.user_product_inventory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_product_recommendations_updated_at ON public.product_recommendations;
CREATE TRIGGER set_product_recommendations_updated_at BEFORE UPDATE ON public.product_recommendations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_carts_updated_at ON public.carts;
CREATE TRIGGER set_carts_updated_at BEFORE UPDATE ON public.carts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_cart_items_updated_at ON public.cart_items;
CREATE TRIGGER set_cart_items_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_gift_cards_updated_at ON public.gift_cards;
CREATE TRIGGER set_gift_cards_updated_at BEFORE UPDATE ON public.gift_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_referral_codes_updated_at ON public.referral_codes;
CREATE TRIGGER set_referral_codes_updated_at BEFORE UPDATE ON public.referral_codes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_referral_invites_updated_at ON public.referral_invites;
CREATE TRIGGER set_referral_invites_updated_at BEFORE UPDATE ON public.referral_invites FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_event_outbox_updated_at ON public.event_outbox;
CREATE TRIGGER set_event_outbox_updated_at BEFORE UPDATE ON public.event_outbox FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS sync_notification_read_state_before_write ON public.notifications;
CREATE TRIGGER sync_notification_read_state_before_write
BEFORE INSERT OR UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.sync_notification_read_state();

DROP TRIGGER IF EXISTS set_loyalty_ledger_event_key_before_write ON public.loyalty_ledger;
CREATE TRIGGER set_loyalty_ledger_event_key_before_write
BEFORE INSERT OR UPDATE ON public.loyalty_ledger
FOR EACH ROW EXECUTE FUNCTION public.set_loyalty_ledger_event_key();

DROP TRIGGER IF EXISTS recalculate_loyalty_after_ledger_change ON public.loyalty_ledger;
CREATE TRIGGER recalculate_loyalty_after_ledger_change
AFTER INSERT OR UPDATE OR DELETE ON public.loyalty_ledger
FOR EACH ROW EXECUTE FUNCTION public.loyalty_ledger_recalculate_trigger();

DROP TRIGGER IF EXISTS recalculate_streak_after_routine_completion_change ON public.routine_completions;
CREATE TRIGGER recalculate_streak_after_routine_completion_change
AFTER INSERT OR UPDATE OR DELETE ON public.routine_completions
FOR EACH ROW EXECUTE FUNCTION public.routine_completion_recalculate_trigger();

COMMIT;
