-- COSMOSKIN Account runtime hotfixes — favorites, returns attachments, notifications
-- Safe backward-compatible migration. Does not drop data.

ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS requested_attachments jsonb DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS attachment_count integer DEFAULT 0;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS user_id uuid NULL;
ALTER TABLE IF EXISTS public.return_requests ADD COLUMN IF NOT EXISTS requested_items jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS campaign_emails boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS stock_notifications boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS routine_reminders boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS newsletter boolean DEFAULT false;
ALTER TABLE IF EXISTS public.notification_preferences ADD COLUMN IF NOT EXISTS sms_notifications boolean DEFAULT false;

ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS birthday date NULL;
ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS birth_date_locked boolean DEFAULT false;

-- Recommended storage bucket/policy manual check:
-- storage.buckets id/name: return-attachments, private, max 10485760, allowed image/jpeg,image/png,image/webp,video/mp4.
