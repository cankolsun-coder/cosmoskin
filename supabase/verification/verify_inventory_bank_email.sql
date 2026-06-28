-- COSMOSKIN verification: inventory, bank transfer, email events
select 'product_inventory_table' as check_name, to_regclass('public.product_inventory') is not null as ok;
select 'inventory_reservations_table' as check_name, to_regclass('public.inventory_reservations') is not null as ok;
select 'reserve_rpc' as check_name, to_regprocedure('public.reserve_order_inventory(uuid,jsonb,timestamptz,text)') is not null as ok;
select 'release_rpc' as check_name, to_regprocedure('public.release_order_inventory(uuid,text)') is not null as ok;
select 'convert_rpc' as check_name, to_regprocedure('public.convert_order_inventory(uuid)') is not null as ok;
select 'bank_accounts_count' as check_name, count(*) >= 2 as ok, count(*) as active_accounts from public.payment_bank_accounts where is_active = true;
select 'official_bank_accounts' as check_name,
  bool_or(bank_name ilike '%Garanti%' and iban ilike 'TR84%') and bool_or(bank_name ilike '%İş%' and iban ilike 'TR70%') as ok
from public.payment_bank_accounts where is_active = true;
select 'email_events_table' as check_name, to_regclass('public.email_events') is not null as ok;
