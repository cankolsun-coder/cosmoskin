-- Ensure communication opt-in columns exist on profiles (fixes profile/birthday PATCH 500s).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_email_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS newsletter_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_alert_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS routine_reminder_opt_in boolean NOT NULL DEFAULT false;
