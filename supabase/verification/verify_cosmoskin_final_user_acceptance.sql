with checks as (
  select 'money_columns_numeric'::text as check_name,
    (
      select count(*) = 8
      from information_schema.columns
      where table_schema = 'public'
        and ((table_name = 'orders' and column_name in ('subtotal_amount','discount_amount','vat_amount','shipping_amount','total_amount'))
          or (table_name = 'order_items' and column_name in ('unit_price','line_total'))
          or (table_name = 'payments' and column_name = 'amount'))
        and data_type = 'numeric'
    ) as ok
  union all
  select 'rpc_signatures_match_backend',
    exists (select 1 from pg_proc where proname = 'reserve_order_inventory' and pronargs = 4)
    and exists (select 1 from pg_proc where proname = 'release_order_inventory' and pronargs = 2)
    and exists (select 1 from pg_proc where proname = 'convert_order_inventory' and pronargs = 1)
  union all
  select 'constraints_allow_bank_transfer_inventory_email',
    exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and pg_get_constraintdef(oid) like '%pending_bank_transfer%')
    and exists (select 1 from pg_constraint where conrelid = 'public.payments'::regclass and pg_get_constraintdef(oid) like '%bank_transfer%')
    and exists (select 1 from pg_constraint where conrelid = 'public.email_events'::regclass and pg_get_constraintdef(oid) like '%bank_transfer_reminder%' and pg_get_constraintdef(oid) like '%bank_transfer_not_received_cancelled%')
  union all
  select 'bank_accounts_seeded',
    exists (select 1 from public.payment_bank_accounts where regexp_replace(iban,'\s','','g') = 'TR840006200074200006291866' and is_active = true)
    and exists (select 1 from public.payment_bank_accounts where regexp_replace(iban,'\s','','g') = 'TR700006400000110372579047' and is_active = true)
  union all
  select 'user_addresses_exists', to_regclass('public.user_addresses') is not null
  union all
  select 'test_inventory_slug_exists',
    exists (select 1 from public.product_inventory where product_slug = 'beauty-of-joseon-relief-sun-spf50')
  union all
  select 'generated_money_aliases_exist',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='total')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='grand_total')
  union all
  select 'order_checkout_audit_view_exists', to_regclass('public.order_checkout_audit') is not null
  union all
  select 'welcome10_coupon_seeded',
    exists (select 1 from public.coupons where upper(code) = 'WELCOME10' and is_active = true and discount_type = 'percent' and discount_value = 10 and min_subtotal >= 1000)
  union all
  select 'club10_not_active',
    not exists (select 1 from public.coupons where upper(code) = 'CLUB10' and is_active = true)
  union all
  select 'coupon_tables_exist',
    to_regclass('public.coupons') is not null and to_regclass('public.customer_coupons') is not null and to_regclass('public.coupon_redemptions') is not null
  union all
  select 'coupon_usage_columns_exist',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='coupon_redemptions' and column_name='status')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='customer_coupons' and column_name='used_at')
  union all
  select 'admin_bank_transfer_email_types_exist',
    exists (select 1 from pg_constraint where conrelid = 'public.email_events'::regclass and pg_get_constraintdef(oid) like '%bank_transfer_reminder%' and pg_get_constraintdef(oid) like '%bank_transfer_not_received_cancelled%')
)
select check_name, ok from checks order by check_name;
