# COSMOSKIN Account Experience Final Polish — Supabase Notes 20260703

## Migration to run
Run this migration on the production Supabase project after deploying the code package:

```text
supabase/migrations/20260703_account_experience_final_polish.sql
```

## What it adds / confirms
```sql
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
```

## Manual checks after migration
```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in ('birthday', 'birth_date_locked')
order by column_name;
```

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notification_preferences'
  and column_name in (
    'campaign_emails',
    'stock_notifications',
    'routine_reminders',
    'newsletter',
    'sms_notifications',
    'order_updates',
    'cargo_updates'
  )
order by column_name;
```

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'customer_membership_status'
  and column_name in (
    'loyalty_spend_ex_shipping',
    'available_points',
    'pending_points',
    'reversed_points'
  )
order by column_name;
```

## Password reset required Supabase Auth redirect URLs
Add/confirm these in Supabase Auth URL configuration:

```text
https://cosmoskin.com.tr/auth/reset.html
https://www.cosmoskin.com.tr/auth/reset.html
```

## Club/points behavior
Application logic now excludes shipping from displayed Club spend/point fallback:
- Prefer `order_items.line_total` / `unit_price * quantity`
- Else use `orders.subtotal_amount`
- Else use `orders.total_amount - orders.shipping_amount`

Shipping must not be used for loyalty points or tier spend.
