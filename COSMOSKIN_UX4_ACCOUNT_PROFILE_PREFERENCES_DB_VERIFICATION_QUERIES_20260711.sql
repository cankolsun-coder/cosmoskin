-- COSMOSKIN UX4 — read-only Supabase verification queries (do not run in UX4 deploy)
-- Use in Supabase SQL editor after UX4 code deploy for production verification only.

-- 1) Profile consent columns present
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN (
    'birthday',
    'birthday_change_count',
    'birthday_last_changed_at',
    'birth_date_locked',
    'marketing_email_opt_in',
    'newsletter_opt_in',
    'stock_alert_opt_in',
    'routine_reminder_opt_in',
    'metadata'
  )
ORDER BY column_name;

-- 2) Profiles with all opt-ins false (possible consent wipe signal)
SELECT id, email, marketing_email_opt_in, newsletter_opt_in,
       stock_alert_opt_in, routine_reminder_opt_in, updated_at
FROM public.profiles
WHERE marketing_email_opt_in = false
  AND newsletter_opt_in = false
  AND stock_alert_opt_in = false
  AND routine_reminder_opt_in = false
ORDER BY updated_at DESC
LIMIT 50;

-- 3) Profiles with empty metadata after prior non-empty updates (audit via app logs; sample empty rows)
SELECT id, email, metadata, updated_at
FROM public.profiles
WHERE metadata = '{}'::jsonb OR metadata IS NULL
ORDER BY updated_at DESC
LIMIT 50;

-- 4) Birthday lock integrity
SELECT id, email, birthday, birth_date_locked, birthday_change_count, birthday_last_changed_at
FROM public.profiles
WHERE birthday IS NOT NULL
ORDER BY birthday_last_changed_at DESC NULLS LAST
LIMIT 50;

-- 5) Notification preferences table parity
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'notification_preferences'
ORDER BY column_name;

-- 6) Consent records table (if used for audit trail)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'consent_records'
ORDER BY column_name;

-- 7) Sample user preference merge check (replace USER_ID)
-- SELECT p.id, p.marketing_email_opt_in, p.newsletter_opt_in, p.stock_alert_opt_in, p.routine_reminder_opt_in,
--        np.campaign_emails, np.newsletter, np.stock_notifications, np.routine_reminders
-- FROM public.profiles p
-- LEFT JOIN public.notification_preferences np ON np.user_id = p.id
-- WHERE p.id = 'USER_ID';
