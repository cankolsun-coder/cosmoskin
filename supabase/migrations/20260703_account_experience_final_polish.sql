-- COSMOSKIN Account Experience Final Polish + Loyalty Logic Correction
-- Safe, backward-compatible schema alignment. No destructive changes.

ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS birthday date NULL;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS birth_date_locked boolean DEFAULT false;

ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS campaign_emails boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS stock_notifications boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS routine_reminders boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS newsletter boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS sms_notifications boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS order_updates boolean DEFAULT true;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS cargo_updates boolean DEFAULT true;

ALTER TABLE IF EXISTS public.customer_membership_status ADD COLUMN IF NOT EXISTS loyalty_spend_ex_shipping numeric DEFAULT 0;
ALTER TABLE IF EXISTS public.customer_membership_status ADD COLUMN IF NOT EXISTS available_points integer DEFAULT 0;
ALTER TABLE IF EXISTS public.customer_membership_status ADD COLUMN IF NOT EXISTS pending_points integer DEFAULT 0;
ALTER TABLE IF EXISTS public.customer_membership_status ADD COLUMN IF NOT EXISTS reversed_points integer DEFAULT 0;

-- Loyalty/Club note:
-- Application logic now computes account spend from order_items/subtotal or total_amount - shipping_amount fallback.
-- Shipping amount must not be included in points or tier spend calculations.
