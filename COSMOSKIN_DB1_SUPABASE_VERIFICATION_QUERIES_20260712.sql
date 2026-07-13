-- COSMOSKIN DB1 Supabase Verification Queries — 2026-07-12
-- AUDIT-ONLY / READ-ONLY. These statements were prepared but NOT executed.
-- Run manually in the Supabase SQL Editor with a read-only reviewer account where possible.
-- Execute catalog/existence sections first. Data-check sections name relations directly and
-- must be skipped when the preceding existence query reports that a relation is absent.

-- Optional guard when using a direct Postgres session. If the SQL editor does not preserve
-- a transaction across selected blocks, run each SELECT independently with a read-only role.
begin;
set transaction read only;

-- =============================================================================
-- 1. Migration apply-state and expected relation existence
-- =============================================================================

select *
from supabase_migrations.schema_migrations
order by version;

with expected(table_name, classification) as (
  values
    ('admin_activity_logs','runtime'), ('admin_permissions','runtime'),
    ('admin_roles','supporting'), ('admin_users','runtime'),
    ('birthday_benefits','runtime'), ('campaign_eligibility_logs','supporting'),
    ('consent_records','runtime'), ('coupon_redemptions','runtime'),
    ('coupons','runtime'), ('crm_events','runtime'), ('customer_coupons','runtime'),
    ('customer_membership_history','runtime'), ('customer_membership_status','runtime'),
    ('customer_preferences','supporting'), ('customer_routine_results','runtime'),
    ('customer_skin_profiles','runtime'), ('email_events','runtime'),
    ('inventory_lots','runtime'), ('inventory_movements','runtime'),
    ('inventory_reservations','rpc-owned'), ('invoice_records','runtime'),
    ('legal_document_versions','supporting'), ('loyalty_point_rules','supporting'),
    ('loyalty_points_ledger','runtime'), ('loyalty_redemptions','runtime'),
    ('membership_levels','runtime'), ('newsletter_subscribers','runtime'),
    ('notification_preferences','runtime'), ('notifications','runtime/out-of-band'),
    ('order_items','runtime'), ('order_legal_consents','runtime'),
    ('order_legal_snapshots','runtime'), ('order_status_events','runtime'),
    ('orders','runtime'), ('payment_bank_accounts','runtime'),
    ('payment_events','runtime'), ('payments','runtime'),
    ('product_compliance','runtime'), ('product_inventory','runtime'),
    ('product_price_audit_logs','runtime'), ('product_price_overrides','runtime'),
    ('profiles','runtime'), ('refund_records','runtime'), ('restock_alerts','runtime'),
    ('return_request_attachments','runtime'), ('return_request_items','runtime'),
    ('return_requests','runtime'), ('return_status_events','runtime'),
    ('review_helpful','runtime/out-of-band'), ('review_images','runtime/partial'),
    ('reviews','runtime/partial'), ('shipment_events','runtime'),
    ('shipments','runtime/partial'), ('shipping_events','runtime'),
    ('shipping_settings','supporting'), ('supplier_records','runtime'),
    ('support_requests','runtime/missing'), ('user_addresses','runtime'),
    ('user_favorites','runtime/out-of-band')
)
select
  e.table_name,
  e.classification,
  to_regclass(format('public.%I', e.table_name)) as live_relation,
  case when c.oid is null then 'MISSING' else c.relkind::text end as relation_kind,
  c.relispartition,
  c.relrowsecurity,
  c.relforcerowsecurity
from expected e
left join pg_class c
  on c.oid = to_regclass(format('public.%I', e.table_name))
order by e.table_name;

-- Root/manual/legacy names that should not silently become a second source of truth.
select v.table_name, to_regclass(format('public.%I', v.table_name)) as live_relation
from (values
  ('inventory'), ('products'), ('checkout_idempotency'), ('coupon_reservations'),
  ('customer_addresses'), ('customer_profiles'), ('newsletter_subscriptions'),
  ('coupon_usage'), ('refunds'), ('refund_items'), ('crm_sync_logs'),
  ('email_unsubscribe_tokens'), ('abandoned_carts')
) as v(table_name)
order by v.table_name;

-- =============================================================================
-- 2. Complete public schema columns, types, defaults, nullability
-- =============================================================================

select
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.is_generated,
  c.generation_expression
from information_schema.columns c
where c.table_schema = 'public'
order by c.table_name, c.ordinal_position;

-- Focused expected-column gap report. A returned row is a missing column.
with expected(table_name, column_name) as (
  values
    ('user_favorites','user_id'), ('user_favorites','product_slug'),
    ('user_favorites','created_at'),
    ('profiles','id'), ('profiles','first_name'), ('profiles','last_name'),
    ('profiles','phone'), ('profiles','birthday'), ('profiles','birthday_change_count'),
    ('profiles','birthday_last_changed_at'), ('profiles','birth_date_locked'),
    ('profiles','marketing_email_opt_in'), ('profiles','newsletter_opt_in'),
    ('profiles','stock_alert_opt_in'), ('profiles','routine_reminder_opt_in'),
    ('profiles','metadata'), ('profiles','updated_at'),
    ('notification_preferences','user_id'), ('notification_preferences','order_updates'),
    ('notification_preferences','cargo_updates'), ('notification_preferences','campaign_emails'),
    ('notification_preferences','newsletter'), ('notification_preferences','stock_notifications'),
    ('notification_preferences','routine_reminders'), ('notification_preferences','sms_notifications'),
    ('notification_preferences','updated_at'),
    ('product_price_overrides','product_slug'),
    ('product_price_overrides','regular_price_try'),
    ('product_price_overrides','sale_price_try'),
    ('product_price_overrides','compare_at_price_try'),
    ('product_price_overrides','sale_starts_at'),
    ('product_price_overrides','sale_ends_at'),
    ('product_price_audit_logs','old_sale_price_try'),
    ('product_price_audit_logs','new_sale_price_try'),
    ('product_price_audit_logs','old_compare_at_price_try'),
    ('product_price_audit_logs','new_compare_at_price_try'),
    ('product_price_audit_logs','old_sale_starts_at'),
    ('product_price_audit_logs','new_sale_starts_at'),
    ('product_price_audit_logs','old_sale_ends_at'),
    ('product_price_audit_logs','new_sale_ends_at'),
    ('order_items','allocated_order_discount'),
    ('order_items','paid_line_total'), ('order_items','paid_unit_price'),
    ('order_items','pricing_snapshot_version'),
    ('product_inventory','product_slug'), ('product_inventory','stock_on_hand'),
    ('product_inventory','stock_reserved'), ('product_inventory','status'),
    ('product_inventory','allow_backorder'), ('product_inventory','updated_at'),
    ('reviews','updated_at'), ('review_images','review_id'),
    ('review_images','user_id'), ('review_images','storage_path'),
    ('review_images','public_url'), ('review_images','status'),
    ('review_images','sort_order'), ('review_images','updated_at'),
    ('support_requests','user_id'), ('support_requests','customer_email'),
    ('support_requests','order_id'), ('support_requests','category'),
    ('support_requests','subject'), ('support_requests','message'),
    ('support_requests','status'), ('support_requests','created_at'),
    ('support_requests','updated_at')
)
select e.table_name, e.column_name
from expected e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = e.table_name
 and c.column_name = e.column_name
where c.column_name is null
order by e.table_name, e.column_name;

-- =============================================================================
-- 3. Constraints, indexes, foreign keys, and missing FK indexes
-- =============================================================================

select
  n.nspname as schema_name,
  cls.relname as table_name,
  con.conname,
  con.contype,
  con.convalidated,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class cls on cls.oid = con.conrelid
join pg_namespace n on n.oid = cls.relnamespace
where n.nspname = 'public'
order by cls.relname, con.contype, con.conname;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

select
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_schema as foreign_table_schema,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name,
  rc.update_rule,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_schema = tc.constraint_schema
 and kcu.constraint_name = tc.constraint_name
join information_schema.referential_constraints rc
  on rc.constraint_schema = tc.constraint_schema
 and rc.constraint_name = tc.constraint_name
join information_schema.constraint_column_usage ccu
  on ccu.constraint_schema = rc.unique_constraint_schema
 and ccu.constraint_name = rc.unique_constraint_name
where tc.table_schema = 'public'
  and tc.constraint_type = 'FOREIGN KEY'
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- Foreign keys for which no index starts with the complete FK column vector.
with fk as (
  select
    con.oid,
    con.conrelid,
    con.conname,
    con.conkey,
    con.conrelid::regclass as table_name
  from pg_constraint con
  where con.contype = 'f'
    and con.connamespace = 'public'::regnamespace
)
select fk.table_name, fk.conname, fk.conkey
from fk
where not exists (
  select 1
  from pg_index i
  where i.indrelid = fk.conrelid
    and i.indisvalid
    and i.indisready
    and (i.indkey::smallint[])[0:cardinality(fk.conkey)-1] = fk.conkey
)
order by fk.table_name::text, fk.conname;

-- Expected unique identities. A returned row means the exact ordered key was not found.
with expected(table_name, columns) as (
  values
    ('user_favorites', array['user_id','product_slug']::text[]),
    ('notification_preferences', array['user_id']::text[]),
    ('product_price_overrides', array['product_slug']::text[]),
    ('review_helpful', array['review_id','user_id']::text[]),
    ('reviews', array['user_id','product_slug']::text[])
), unique_keys as (
  select
    c.relname as table_name,
    array_agg(a.attname order by u.ordinality)::text[] as columns
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral unnest(i.indkey) with ordinality as u(attnum, ordinality)
  join pg_attribute a on a.attrelid = c.oid and a.attnum = u.attnum
  where n.nspname = 'public'
    and i.indisunique
  group by c.relname, i.indexrelid
)
select e.table_name, e.columns as missing_expected_unique_key
from expected e
where not exists (
  select 1 from unique_keys u
  where u.table_name = e.table_name and u.columns = e.columns
)
order by e.table_name;

-- =============================================================================
-- 4. RLS, policies, grants, and broad-policy indicators
-- =============================================================================

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relkind,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p','v','m')
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public','storage')
order by schemaname, tablename, policyname;

select
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema in ('public','storage')
  and grantee in ('anon','authenticated','service_role','PUBLIC')
group by table_schema, table_name, grantee
order by table_schema, table_name, grantee;

-- User/PII-bearing tables with RLS disabled or absent.
with user_owned(table_name) as (
  values
    ('profiles'), ('user_addresses'), ('orders'), ('order_items'), ('payments'),
    ('user_favorites'), ('notification_preferences'), ('notifications'),
    ('reviews'), ('review_images'), ('review_helpful'), ('support_requests'),
    ('return_requests'), ('return_request_items'), ('return_request_attachments'),
    ('return_status_events'), ('consent_records'), ('order_legal_consents'),
    ('order_legal_snapshots'), ('customer_membership_status'),
    ('customer_membership_history'), ('loyalty_points_ledger'),
    ('loyalty_redemptions'), ('customer_skin_profiles'),
    ('customer_routine_results'), ('admin_activity_logs')
)
select
  u.table_name,
  to_regclass(format('public.%I',u.table_name)) as relation,
  coalesce(c.relrowsecurity,false) as rls_enabled,
  coalesce(c.relforcerowsecurity,false) as rls_forced
from user_owned u
left join pg_class c on c.oid = to_regclass(format('public.%I',u.table_name))
where c.oid is null or not c.relrowsecurity
order by u.table_name;

-- Heuristics only: review every returned policy manually.
select *
from pg_policies
where schemaname in ('public','storage')
  and (
    coalesce(qual,'') ~* '^\s*\(?\s*true\s*\)?\s*$'
    or coalesce(with_check,'') ~* '^\s*\(?\s*true\s*\)?\s*$'
    or coalesce(qual,'') ~* 'auth\.email\s*\('
    or coalesce(with_check,'') ~* 'auth\.email\s*\('
    or (cmd in ('ALL','UPDATE') and with_check is null)
    or roles @> array['public']::name[]
  )
order by schemaname, tablename, policyname;

-- =============================================================================
-- 5. Functions/RPC security and grants
-- =============================================================================

select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.provolatile,
  p.proconfig,
  pg_get_userbyid(p.proowner) as owner,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.prosecdef
    or p.proname in (
      'reserve_order_inventory','release_order_inventory','convert_order_inventory',
      'release_expired_inventory_reservations','process_iyzico_payment_success',
      'process_iyzico_payment_failure','recalculate_customer_membership',
      'cosmoskin_order_points_basis','cosmoskin_award_loyalty_for_order',
      'cosmoskin_promote_loyalty_for_order','cosmoskin_promote_due_loyalty_points',
      'cosmoskin_reverse_loyalty_for_order','cosmoskin_loyalty_balance_for_user',
      'check_purchase','get_review_summary','handle_new_auth_user_profile',
      'handle_new_user_profile'
    )
  )
order by p.proname, identity_arguments;

-- Any SECURITY DEFINER in public executable by PUBLIC/anon/authenticated is a mandatory review.
select
  p.oid::regprocedure as function_signature,
  pg_get_userbyid(p.proowner) as owner,
  exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) as public_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  p.proconfig
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prosecdef
  and (
    exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    )
    or has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
order by p.oid::regprocedure::text;

-- =============================================================================
-- 6. Favorites / wishlist (run only if public.user_favorites exists)
-- =============================================================================

select user_id, product_slug, count(*) as duplicate_count
from public.user_favorites
group by user_id, product_slug
having count(*) > 1
order by duplicate_count desc, user_id, product_slug;

select count(*) as rows_with_blank_slug
from public.user_favorites
where product_slug is null or btrim(product_slug) = '';

-- Run only if public.products also exists and is intentionally the slug registry.
select f.id, f.user_id, f.product_slug
from public.user_favorites f
left join public.products p on p.slug = f.product_slug
where p.slug is null
order by f.created_at desc;

select *
from pg_policies
where schemaname='public' and tablename='user_favorites'
order by policyname;

-- =============================================================================
-- 7. Account/profile/preferences (run only after existence checks)
-- =============================================================================

select id, count(*)
from public.profiles
group by id
having count(*) > 1;

select lower(btrim(email)) as normalized_email, count(*)
from public.profiles
where email is not null and btrim(email) <> ''
group by lower(btrim(email))
having count(*) > 1;

select id, birthday, birthday_change_count, birthday_last_changed_at, birth_date_locked
from public.profiles
where birthday_change_count < 0
   or birthday_change_count > 1
   or (birth_date_locked and birthday is null)
   or (birthday_change_count > 0 and birthday_last_changed_at is null)
order by updated_at desc;

select user_id, count(*)
from public.notification_preferences
group by user_id
having count(*) > 1;

select p.id as user_id,
       p.marketing_email_opt_in,
       np.campaign_emails,
       p.newsletter_opt_in,
       np.newsletter,
       p.stock_alert_opt_in,
       np.stock_notifications,
       p.routine_reminder_opt_in,
       np.routine_reminders
from public.profiles p
join public.notification_preferences np on np.user_id = p.id
where p.marketing_email_opt_in is distinct from np.campaign_emails
   or p.newsletter_opt_in is distinct from np.newsletter
   or p.stock_alert_opt_in is distinct from np.stock_notifications
   or p.routine_reminder_opt_in is distinct from np.routine_reminders;

-- =============================================================================
-- 8. Pricing P1/P1E (run only after existence checks)
-- =============================================================================

select product_slug, count(*)
from public.product_price_overrides
group by product_slug
having count(*) > 1;

select *
from public.product_price_overrides
where regular_price_try <= 0
   or sale_price_try <= 0
   or compare_at_price_try <= 0
   or (sale_price_try is not null and regular_price_try is not null and sale_price_try >= regular_price_try)
   or (sale_price_try is not null and compare_at_price_try is not null and compare_at_price_try <= sale_price_try)
   or (sale_starts_at is not null and sale_ends_at is not null and sale_ends_at <= sale_starts_at)
order by product_slug;

select product_slug, changed_at, old_sale_price_try, new_sale_price_try,
       old_compare_at_price_try, new_compare_at_price_try,
       old_sale_starts_at, new_sale_starts_at, old_sale_ends_at, new_sale_ends_at
from public.product_price_audit_logs
where old_sale_price_try is distinct from new_sale_price_try
   or old_compare_at_price_try is distinct from new_compare_at_price_try
   or old_sale_starts_at is distinct from new_sale_starts_at
   or old_sale_ends_at is distinct from new_sale_ends_at
order by changed_at desc
limit 200;

-- =============================================================================
-- 9. Orders, payments, coupon allocation, and refund snapshots
-- =============================================================================

select checkout_idempotency_key, count(*)
from public.orders
where checkout_idempotency_key is not null
group by checkout_idempotency_key
having count(*) > 1;

select id, order_number, subtotal_amount, discount_amount, vat_amount,
       shipping_amount, total_amount
from public.orders
where coalesce(subtotal_amount,0) < 0
   or coalesce(discount_amount,0) < 0
   or coalesce(vat_amount,0) < 0
   or coalesce(shipping_amount,0) < 0
   or coalesce(total_amount,0) < 0
   or coalesce(discount_amount,0) > coalesce(subtotal_amount,0)
order by created_at desc;

select oi.id, oi.order_id, oi.quantity, oi.unit_price, oi.line_total,
       oi.allocated_order_discount, oi.paid_line_total, oi.paid_unit_price,
       oi.pricing_snapshot_version
from public.order_items oi
where oi.quantity <= 0
   or oi.unit_price < 0
   or oi.line_total < 0
   or oi.allocated_order_discount < 0
   or oi.paid_line_total < 0
   or oi.paid_unit_price < 0
   or (oi.paid_line_total is not null and oi.paid_line_total > oi.line_total + 0.01)
   or (oi.paid_line_total is not null and oi.allocated_order_discount is not null
       and abs(oi.paid_line_total - (oi.line_total - oi.allocated_order_discount)) > 0.02)
order by oi.created_at desc;

select
  count(*) filter (where pricing_snapshot_version is null) as legacy_or_missing_snapshot_rows,
  count(*) filter (where pricing_snapshot_version is not null) as snapshot_rows,
  count(*) as total_rows
from public.order_items;

select order_id,
       sum(coalesce(allocated_order_discount,0)) as item_allocated_discount,
       max(o.discount_amount) as order_discount,
       abs(sum(coalesce(allocated_order_discount,0)) - max(o.discount_amount)) as difference
from public.order_items oi
join public.orders o on o.id = oi.order_id
where oi.pricing_snapshot_version is not null
group by order_id
having abs(sum(coalesce(allocated_order_discount,0)) - max(o.discount_amount)) > 0.02;

select order_id, provider, provider_payment_id, count(*)
from public.payments
where provider_payment_id is not null
group by order_id, provider, provider_payment_id
having count(*) > 1;

select id, order_id, amount, status, provider, provider_reference, metadata
from public.refund_records
where amount is null
   or amount <= 0
   or (status = 'completed' and (provider_reference is null or btrim(provider_reference)=''))
   or (status = 'completed' and completed_at is null)
order by created_at desc;

-- =============================================================================
-- 10. Inventory
-- =============================================================================

select lower(btrim(product_slug)) as normalized_slug, count(*)
from public.product_inventory
group by lower(btrim(product_slug))
having count(*) > 1;

select *
from public.product_inventory
where product_slug is null or btrim(product_slug)=''
   or stock_on_hand < 0 or stock_reserved < 0 or low_stock_threshold < 0
   or (not allow_backorder and stock_reserved > stock_on_hand)
   or status not in ('active','inactive','out_of_stock','discontinued')
order by product_slug;

select order_id, lower(btrim(product_slug)) as product_slug, count(*) as active_rows,
       sum(quantity) as reserved_quantity
from public.inventory_reservations
where status in ('reserved','active')
group by order_id, lower(btrim(product_slug))
having count(*) > 1;

-- =============================================================================
-- 11. Reviews / review images / storage (run only after existence checks)
-- =============================================================================

select user_id, product_slug, count(*)
from public.reviews
where user_id is not null
group by user_id, product_slug
having count(*) > 1;

select id, status, approved, updated_at
from public.reviews
where approved is distinct from (status = 'approved')
order by updated_at desc nulls last;

select ri.*
from public.review_images ri
left join public.reviews r on r.id = ri.review_id
where r.id is null
   or ri.user_id is null
   or ri.storage_path is null or btrim(ri.storage_path)=''
   or ri.public_url is null or btrim(ri.public_url)=''
   or ri.status not in ('pending','approved','rejected')
order by ri.created_at desc;

select review_id, sort_order, count(*)
from public.review_images
where sort_order is not null
group by review_id, sort_order
having count(*) > 1;

select id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at
from storage.buckets
where id in ('review-images','return-attachments');

select *
from pg_policies
where schemaname='storage'
  and tablename='objects'
  and (
    coalesce(qual,'') like '%review-images%'
    or coalesce(with_check,'') like '%review-images%'
    or coalesce(qual,'') like '%return-attachments%'
    or coalesce(with_check,'') like '%return-attachments%'
  )
order by policyname;

-- =============================================================================
-- 12. CRM / Brevo / newsletter
-- =============================================================================

select lower(btrim(email)) as normalized_email, count(*)
from public.newsletter_subscribers
group by lower(btrim(email))
having count(*) > 1;

select id, email, status, confirmed_at, welcome_sent_at, last_email_sent_at,
       marketing_email_opt_in, consent_source
from public.newsletter_subscribers
where status not in ('subscribed','unsubscribed','bounced','complained')
   or email is null or btrim(email)=''
   or (status='subscribed' and confirmed_at is null)
order by created_at desc;

select event_type, count(*) as events, min(created_at), max(created_at)
from public.crm_events
group by event_type
order by event_type;

select c.id, c.email, c.consent_type, c.status, c.source, c.created_at
from public.consent_records c
where c.consent_type in ('marketing_email_opt_in','newsletter_opt_in')
order by c.created_at desc
limit 500;

-- Provenance/existence only for E3 candidates; no assumption that they are required today.
select v.object_name, to_regclass(format('public.%I',v.object_name)) as live_relation
from (values
  ('crm_sync_logs'), ('email_unsubscribe_tokens'), ('abandoned_carts')
) as v(object_name);

-- =============================================================================
-- 13. Membership / loyalty
-- =============================================================================

select code, name, spend_threshold_12m, order_threshold_12m, is_active, sort_order
from public.membership_levels
order by sort_order;

select code, name
from public.membership_levels
where lower(code) not in ('essential','signature','elite')
   or lower(name) in ('select','silver');

select *
from public.customer_membership_status
where level_code not in ('essential','signature','elite')
   or next_level_code is not null and next_level_code not in ('signature','elite')
   or rolling_spend_12m < 0 or completed_orders_12m < 0
   or available_points < 0 or pending_points < 0 or reversed_points < 0;

select transaction_reference, count(*)
from public.loyalty_points_ledger
where transaction_reference is not null
group by transaction_reference
having count(*) > 1;

select user_id,
       coalesce(sum(points_delta) filter (where status='available' and (expires_at is null or expires_at>now())),0) as available,
       coalesce(sum(points_delta) filter (where status='pending' and (expires_at is null or expires_at>now())),0) as pending,
       coalesce(sum(abs(points_delta)) filter (where status='reversed' and (expires_at is null or expires_at>now())),0) as reversed
from public.loyalty_points_ledger
group by user_id
order by user_id;

-- pg_cron may not be installed. Check existence before running the next query.
select to_regclass('cron.job') as cron_job_relation;

-- Run only when cron.job exists.
select jobid, schedule, command, nodename, database, username, active, jobname
from cron.job
where command ilike any(array['%membership%','%loyalty%','%points%','%birthday%'])
   or jobname ilike any(array['%membership%','%loyalty%','%points%','%birthday%'])
order by jobid;

-- =============================================================================
-- 14. Shipments / support
-- =============================================================================

select s.id, s.order_id, s.provider, s.provider_shipment_id, s.tracking_number,
       s.status, s.direction, s.shipped_at, s.delivered_at
from public.shipments s
left join public.orders o on o.id = s.order_id
where o.id is null
   or (s.delivered_at is not null and s.shipped_at is not null and s.delivered_at < s.shipped_at)
   or (s.provider_shipment_id is not null and btrim(s.provider_shipment_id)='')
order by s.created_at desc;

select provider, provider_shipment_id, count(*)
from public.shipments
where provider_shipment_id is not null
group by provider, provider_shipment_id
having count(*) > 1;

select se.*
from public.shipping_events se
left join public.shipments s on s.id = se.shipment_id
left join public.orders o on o.id = se.order_id
where (se.shipment_id is not null and s.id is null)
   or (se.order_id is not null and o.id is null)
order by se.event_at desc;

-- Run only if public.support_requests exists.
select sr.*
from public.support_requests sr
left join auth.users u on u.id = sr.user_id
left join public.orders o on o.id = sr.order_id
where u.id is null
   or (sr.order_id is not null and o.id is null)
   or sr.subject is null or btrim(sr.subject)=''
   or sr.message is null or length(btrim(sr.message)) < 10
order by sr.created_at desc;

-- =============================================================================
-- 15. Views and triggers that can bypass or depend on schema columns
-- =============================================================================

select
  n.nspname as schema_name,
  c.relname as view_name,
  c.reloptions,
  pg_get_viewdef(c.oid, true) as definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','api')
  and c.relkind in ('v','m')
order by n.nspname, c.relname;

select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where event_object_schema in ('public','auth')
order by event_object_schema, event_object_table, trigger_name;

rollback;
