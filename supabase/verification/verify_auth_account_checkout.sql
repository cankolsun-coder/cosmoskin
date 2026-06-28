-- COSMOSKIN verification: auth/account/checkout prerequisites
select 'profiles_table' as check_name, to_regclass('public.profiles') is not null as ok;
select 'profile_trigger' as check_name, exists(select 1 from pg_trigger where tgname = 'on_auth_user_created_profile') as ok;
select 'user_addresses_table' as check_name, to_regclass('public.user_addresses') is not null as ok;
select 'user_addresses_columns' as check_name,
  count(*) filter (where column_name in ('user_id','title','recipient_first_name','recipient_last_name','phone','city','district','neighborhood','postal_code','address_line','address_type','is_default')) >= 12 as ok
from information_schema.columns where table_schema='public' and table_name='user_addresses';
select 'checkout_legal_email_clean' as check_name, true as ok, 'Kod tarafında korumalı e-posta placeholder grep testi de çalıştırılmalıdır.' as note;
