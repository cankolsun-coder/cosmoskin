-- COSMOSKIN FINAL LAUNCH READY FIXES - 2026-07-01
-- Idempotent support tables, coupon rules, preferences, support requests and birth-date change protection.

create extension if not exists pgcrypto;

alter table if exists public.customer_coupons add column if not exists reserved_at timestamptz;
alter table if exists public.customer_coupons add column if not exists order_id uuid;
alter table if exists public.customer_coupons add column if not exists updated_at timestamptz default now();
alter table if exists public.profiles add column if not exists birth_date_locked boolean default false;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  order_updates boolean not null default true,
  cargo_updates boolean not null default true,
  campaign_emails boolean not null default false,
  stock_notifications boolean not null default false,
  routine_reminders boolean not null default false,
  newsletter boolean not null default false,
  sms_notifications boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_email text,
  order_id uuid null,
  category text not null default 'other',
  subject text not null,
  message text not null,
  status text not null default 'açık' check (status in ('açık','yanıtlandı','kapandı','open','answered','closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupon_reservations (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid null,
  code text not null,
  user_id uuid null references auth.users(id) on delete set null,
  customer_email text,
  order_id uuid null,
  status text not null default 'reserved' check (status in ('reserved','used','expired','released','reversed','rejected')),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.birth_date_change_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_birth_date date,
  new_birth_date date,
  changed_by text not null default 'customer_attempt',
  change_reason text,
  metadata jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists idx_notification_preferences_user on public.notification_preferences(user_id);
create index if not exists idx_support_requests_user_created on public.support_requests(user_id, created_at desc);
create index if not exists idx_coupon_reservations_code_status on public.coupon_reservations(code, status);
create index if not exists idx_coupon_reservations_user_status on public.coupon_reservations(user_id, status);
create index if not exists idx_birth_date_change_user on public.birth_date_change_log(user_id, changed_at desc);

-- Approved launch coupon rules. Upsert by code; no fake customer seed data is created.
insert into public.coupons (code, title, description, discount_type, discount_value, min_subtotal, max_discount_amount, per_customer_limit, is_active, starts_at, ends_at, metadata)
values
  ('WELCOME10','Yeni üyeye özel %10 hoş geldin avantajı','İlk başarılı siparişe özel; sepette manuel uygulanır.','percent',10,1000,150,1,true,now(),null,'{"first_order_only":true,"manual_apply_required":true,"combinable_with_points":false}'::jsonb),
  ('BIRTHDAY10','Doğum günü ayına özel %10 avantaj','Doğum günü ayında, uygunluk kontrolleri tamamlandığında kullanılabilir.','percent',10,1500,150,1,true,now(),null,'{"birthday_month_only":true,"once_per_calendar_year":true,"account_age_days_or_paid_order":30,"manual_apply_required":true,"combinable_with_points":false}'::jsonb),
  ('ROUTINE5','Rutin alışveriş avantajı','Akıllı Rutin sonrası uygun sepetlerde kullanılabilir.','percent',5,1500,100,1,true,now(),null,'{"manual_apply_required":true,"combinable_with_points":false}'::jsonb),
  ('SIGNATURE75','Signature üyeye özel 75 TL avantaj','Signature veya Elite üyelik seviyesinde uygun sepetlerde kullanılabilir.','amount',75,1500,75,1,true,now(),null,'{"tier":["signature","elite"],"manual_apply_required":true,"combinable_with_points":false}'::jsonb),
  ('ELITE100','Elite üyeye özel 100 TL avantaj','Elite üyelik seviyesinde uygun sepetlerde kullanılabilir.','amount',100,2000,100,1,true,now(),null,'{"tier":["elite"],"manual_apply_required":true,"combinable_with_points":false}'::jsonb)
on conflict (code) do update set
  title = excluded.title,
  description = excluded.description,
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  min_subtotal = excluded.min_subtotal,
  max_discount_amount = excluded.max_discount_amount,
  per_customer_limit = excluded.per_customer_limit,
  is_active = excluded.is_active,
  metadata = public.coupons.metadata || excluded.metadata,
  updated_at = now();

update public.coupons
set is_active = false,
    ends_at = coalesce(ends_at, now()),
    metadata = coalesce(metadata, '{}'::jsonb) || '{"deprecated":true}'::jsonb,
    updated_at = now()
where code in ('COSMOSKIN10','CLUB10','WELCOME15');

alter table public.notification_preferences enable row level security;
alter table public.support_requests enable row level security;
alter table public.coupon_reservations enable row level security;
alter table public.birth_date_change_log enable row level security;

drop policy if exists notification_preferences_select_self on public.notification_preferences;
create policy notification_preferences_select_self on public.notification_preferences for select using (auth.uid() = user_id);
drop policy if exists notification_preferences_upsert_self on public.notification_preferences;
create policy notification_preferences_upsert_self on public.notification_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists support_requests_select_self on public.support_requests;
create policy support_requests_select_self on public.support_requests for select using (auth.uid() = user_id);
drop policy if exists support_requests_insert_self on public.support_requests;
create policy support_requests_insert_self on public.support_requests for insert with check (auth.uid() = user_id);

drop policy if exists coupon_reservations_select_self on public.coupon_reservations;
create policy coupon_reservations_select_self on public.coupon_reservations for select using (auth.uid() = user_id);

drop policy if exists birth_date_change_select_self on public.birth_date_change_log;
create policy birth_date_change_select_self on public.birth_date_change_log for select using (auth.uid() = user_id);

comment on table public.notification_preferences is 'COSMOSKIN customer notification preferences persisted by account UI.';
comment on table public.support_requests is 'Customer support requests created from account center.';
comment on table public.coupon_reservations is 'Coupon reservation state machine support for pending checkout/bank transfer orders.';
comment on table public.birth_date_change_log is 'Audit log for blocked/supported birth-date change requests.';
