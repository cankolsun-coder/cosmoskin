-- Batch 1: notification_preferences table + profile birthday correction fields
-- Idempotent only. Does not drop or rewrite prior migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  order_updates boolean NOT NULL DEFAULT true,
  cargo_updates boolean NOT NULL DEFAULT true,
  campaign_emails boolean NOT NULL DEFAULT false,
  sms_notifications boolean NOT NULL DEFAULT false,
  stock_notifications boolean NOT NULL DEFAULT false,
  routine_reminders boolean NOT NULL DEFAULT false,
  newsletter boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON public.notification_preferences(user_id);

ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS birthday_change_count integer NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS birthday_last_changed_at timestamptz;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS birth_date_locked boolean DEFAULT false;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_select_self ON public.notification_preferences;
CREATE POLICY notification_preferences_select_self
  ON public.notification_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_preferences_insert_self ON public.notification_preferences;
CREATE POLICY notification_preferences_insert_self
  ON public.notification_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_preferences_update_self ON public.notification_preferences;
CREATE POLICY notification_preferences_update_self
  ON public.notification_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.notification_preferences IS 'COSMOSKIN customer notification preferences (Batch 1 source of truth).';
