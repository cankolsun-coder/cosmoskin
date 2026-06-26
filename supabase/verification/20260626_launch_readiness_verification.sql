-- COSMOSKIN launch readiness verification SQL
-- Run in Supabase SQL editor after applying migrations.
select 'profiles' as check_name, to_regclass('public.profiles') is not null as ok;
select 'order_legal_consents' as check_name, to_regclass('public.order_legal_consents') is not null as ok;
select 'legal_document_versions' as check_name, count(*) >= 3 as ok from public.legal_document_versions where is_active = true;
select 'membership_levels' as check_name, array_agg(code order by sort_order) as levels from public.membership_levels where is_active = true;
select 'admin_activity_logs' as check_name, to_regclass('public.admin_activity_logs') is not null as ok;
select 'shipping_settings_manual' as check_name, exists(select 1 from public.shipping_settings where provider='manual' and is_active) as ok;
select 'rls_profiles' as check_name, relrowsecurity as ok from pg_class where oid = 'public.profiles'::regclass;
select 'rls_order_legal_consents' as check_name, relrowsecurity as ok from pg_class where oid = 'public.order_legal_consents'::regclass;
