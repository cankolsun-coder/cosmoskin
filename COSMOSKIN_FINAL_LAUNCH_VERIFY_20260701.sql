-- COSMOSKIN FINAL LAUNCH READY VERIFY - 2026-07-01
select code, is_active, discount_type, discount_value, min_subtotal, max_discount_amount, per_customer_limit, metadata
from public.coupons
where code in ('WELCOME10','BIRTHDAY10','ROUTINE5','SIGNATURE75','ELITE100','COSMOSKIN10','CLUB10','WELCOME15')
order by code;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('notification_preferences','support_requests','coupon_reservations','birth_date_change_log')
order by table_name;

select column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name in ('profiles','customer_coupons')
  and column_name in ('birth_date_locked','reserved_at','order_id','updated_at')
order by table_name, column_name;

select schemaname, tablename, policyname
from pg_policies
where schemaname='public'
  and tablename in ('notification_preferences','support_requests','coupon_reservations','birth_date_change_log')
order by tablename, policyname;
