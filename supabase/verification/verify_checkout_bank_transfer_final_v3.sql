-- COSMOSKIN final verification for checkout / bank transfer stabilization
-- Run after 20260629_cosmoskin_checkout_bank_transfer_final_fix.sql.

with money_columns as (
  select count(*) = 8 as ok
  from information_schema.columns
  where table_schema = 'public'
    and ((table_name = 'orders' and column_name in ('subtotal_amount','discount_amount','vat_amount','shipping_amount','total_amount') and data_type = 'numeric')
      or (table_name = 'order_items' and column_name in ('unit_price','line_total') and data_type = 'numeric')
      or (table_name = 'payments' and column_name = 'amount' and data_type = 'numeric'))
), rpc_signatures as (
  select
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='reserve_order_inventory' and pg_get_function_identity_arguments(p.oid) like 'p_order_id uuid, p_items jsonb, p_expires_at timestamp with time zone, p_session_id text%') and
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='release_order_inventory') and
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='convert_order_inventory') as ok
), constraints_ok as (
  select
    exists (select 1 from pg_constraint where conname = 'orders_status_final_chk' and pg_get_constraintdef(oid) like '%pending_bank_transfer%') and
    exists (select 1 from pg_constraint where conname = 'orders_payment_status_final_chk' and pg_get_constraintdef(oid) like '%awaiting_transfer%') and
    exists (select 1 from pg_constraint where conname = 'payments_provider_final_chk' and pg_get_constraintdef(oid) like '%bank_transfer%') and
    exists (select 1 from pg_constraint where conname = 'inventory_reservations_status_final_chk' and pg_get_constraintdef(oid) like '%reserved%') and
    exists (select 1 from pg_constraint where conname = 'email_events_email_type_final_chk' and pg_get_constraintdef(oid) like '%bank_transfer_pending%' and pg_get_constraintdef(oid) like '%shipment_delivered%') as ok
), bank_accounts as (
  select count(distinct replace(iban,' ','')) >= 2 as ok
  from public.payment_bank_accounts
  where is_active is true
    and replace(iban,' ','') in ('TR840006200074200006291866','TR700006400000110372579047')
), user_addresses_table as (
  select to_regclass('public.user_addresses') is not null as ok
), inventory_test_slug as (
  select exists(select 1 from public.product_inventory where lower(trim(product_slug)) = 'beauty-of-joseon-relief-sun-spf50') as ok
), generated_aliases as (
  select count(*) = 6 as ok
  from information_schema.columns
  where table_schema='public' and table_name='orders'
    and column_name in ('subtotal','shipping_total','vat_total','discount_total','total','grand_total')
), audit_view as (
  select to_regclass('public.order_checkout_audit') is not null as ok
)
select 'money_columns_numeric' as check_name, ok from money_columns
union all select 'rpc_signatures_match_backend', ok from rpc_signatures
union all select 'constraints_allow_bank_transfer_inventory_email', ok from constraints_ok
union all select 'bank_accounts_seeded', ok from bank_accounts
union all select 'user_addresses_exists', ok from user_addresses_table
union all select 'test_inventory_slug_exists', ok from inventory_test_slug
union all select 'generated_money_aliases_exist', ok from generated_aliases
union all select 'order_checkout_audit_view_exists', ok from audit_view;
