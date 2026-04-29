-- COSMOSKIN Activity Event System
-- Safe additive SQL. It does not drop existing tables or overwrite user data.
-- Run this after schema.sql / rls.sql / activity-notifications.sql.
-- It creates:
-- 1. account_activity table if missing
-- 2. create_account_activity helper
-- 3. safe triggers for common tables when those tables exist

create extension if not exists pgcrypto;

create table if not exists public.account_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'activity',
  category text,
  title text not null,
  body text,
  message text,
  action_url text,
  action_label text,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_activity_user_created_idx
on public.account_activity(user_id, created_at desc);

create index if not exists account_activity_user_read_idx
on public.account_activity(user_id, read_at);

create index if not exists account_activity_type_idx
on public.account_activity(type);

alter table public.account_activity enable row level security;

drop policy if exists "Users can read own account activity" on public.account_activity;
create policy "Users can read own account activity"
on public.account_activity
for select
using (auth.uid() = user_id);

drop policy if exists "Users can update own account activity" on public.account_activity;
create policy "Users can update own account activity"
on public.account_activity
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Service role can insert account activity" on public.account_activity;
create policy "Service role can insert account activity"
on public.account_activity
for insert
with check (true);

create or replace function public.create_account_activity(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_action_url text default null,
  p_action_label text default 'Görüntüle',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.account_activity (
    user_id,
    type,
    category,
    title,
    body,
    message,
    action_url,
    action_label,
    metadata
  )
  values (
    p_user_id,
    coalesce(p_type, 'activity'),
    coalesce(p_type, 'activity'),
    coalesce(p_title, 'Hesap aktivitesi'),
    p_body,
    p_body,
    p_action_url,
    coalesce(p_action_label, 'Görüntüle'),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Generic helpers that read NEW via jsonb, so missing columns will not break function compilation.

create or replace function public.cosmoskin_activity_order_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  j jsonb;
  v_user_id uuid;
  v_order_id text;
  v_total text;
begin
  j := to_jsonb(new);

  v_user_id := coalesce(
    nullif(j->>'user_id','')::uuid,
    nullif(j->>'customer_id','')::uuid,
    nullif(j->>'profile_id','')::uuid
  );

  v_order_id := coalesce(j->>'id', j->>'order_id', j->>'number', j->>'order_number');
  v_total := coalesce(j->>'total_amount', j->>'total', j->>'amount');

  perform public.create_account_activity(
    v_user_id,
    'order',
    'Siparişin alındı',
    case when v_total is not null then 'Siparişin başarıyla oluşturuldu. Toplam: ' || v_total else 'Siparişin başarıyla oluşturuldu.' end,
    '/account/order-detail.html?id=' || coalesce(v_order_id,''),
    'Siparişi Gör',
    jsonb_build_object('source','orders_trigger','order_id',v_order_id,'total',v_total)
  );

  return new;
exception when others then
  -- Never block order creation because of activity logging.
  return new;
end;
$$;

create or replace function public.cosmoskin_activity_order_update()
returns trigger
language plpgsql
security definer
as $$
declare
  j jsonb;
  oldj jsonb;
  v_user_id uuid;
  v_order_id text;
  v_status text;
  old_status text;
  v_title text;
  v_body text;
begin
  j := to_jsonb(new);
  oldj := to_jsonb(old);

  v_user_id := coalesce(
    nullif(j->>'user_id','')::uuid,
    nullif(j->>'customer_id','')::uuid,
    nullif(j->>'profile_id','')::uuid
  );

  v_order_id := coalesce(j->>'id', j->>'order_id', j->>'number', j->>'order_number');
  v_status := lower(coalesce(j->>'status', j->>'fulfillment_status', j->>'shipping_status', ''));
  old_status := lower(coalesce(oldj->>'status', oldj->>'fulfillment_status', oldj->>'shipping_status', ''));

  if v_status is null or v_status = old_status then
    return new;
  end if;

  v_title := case
    when v_status in ('shipped','in_transit','kargoda') then 'Siparişin kargoya verildi'
    when v_status in ('delivered','completed','teslim_edildi') then 'Siparişin teslim edildi'
    when v_status in ('cancelled','canceled','iptal') then 'Siparişin iptal edildi'
    when v_status in ('returned','refunded','iade') then 'İade sürecin güncellendi'
    else 'Sipariş durumun güncellendi'
  end;

  v_body := case
    when v_status in ('shipped','in_transit','kargoda') then 'Kargo hareketlerini sipariş detayından takip edebilirsin.'
    when v_status in ('delivered','completed','teslim_edildi') then 'Ürünlerin teslim edildi. Dilersen rutinine ekleyebilirsin.'
    else 'Sipariş durumunu hesabından takip edebilirsin.'
  end;

  perform public.create_account_activity(
    v_user_id,
    'order',
    v_title,
    v_body,
    '/account/order-detail.html?id=' || coalesce(v_order_id,''),
    'Siparişi Gör',
    jsonb_build_object('source','orders_update_trigger','order_id',v_order_id,'status',v_status)
  );

  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.cosmoskin_activity_routine_complete()
returns trigger
language plpgsql
security definer
as $$
declare
  j jsonb;
  v_user_id uuid;
  v_mode text;
begin
  j := to_jsonb(new);

  v_user_id := coalesce(
    nullif(j->>'user_id','')::uuid,
    nullif(j->>'profile_id','')::uuid
  );

  v_mode := coalesce(j->>'routine_mode', j->>'mode', j->>'routine_type', 'rutin');

  perform public.create_account_activity(
    v_user_id,
    'routine',
    'Rutin tamamlandı',
    'Bugünkü ' || v_mode || ' rutinin tamamlandı. Cilt bakım serin güncellendi.',
    '/account/routines.html',
    'Rutini Gör',
    jsonb_build_object('source','routine_trigger','mode',v_mode,'row',j)
  );

  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.cosmoskin_activity_points_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  j jsonb;
  v_user_id uuid;
  v_amount text;
  v_reason text;
begin
  j := to_jsonb(new);

  v_user_id := coalesce(
    nullif(j->>'user_id','')::uuid,
    nullif(j->>'profile_id','')::uuid
  );

  v_amount := coalesce(j->>'amount', j->>'points', j->>'value');
  v_reason := coalesce(j->>'reason', j->>'label', j->>'description', 'Puan hareketi');

  perform public.create_account_activity(
    v_user_id,
    'reward',
    case when coalesce(v_amount,'0')::numeric >= 0 then 'Puan kazandın' else 'Puan kullandın' end,
    v_reason || case when v_amount is not null then ' (' || v_amount || ' puan)' else '' end,
    '/account/rewards.html',
    'Puanları Gör',
    jsonb_build_object('source','points_trigger','amount',v_amount,'row',j)
  );

  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.cosmoskin_activity_offer_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  j jsonb;
  v_user_id uuid;
begin
  j := to_jsonb(new);

  v_user_id := coalesce(
    nullif(j->>'user_id','')::uuid,
    nullif(j->>'profile_id','')::uuid,
    nullif(j->>'customer_id','')::uuid
  );

  perform public.create_account_activity(
    v_user_id,
    'offer',
    'Kişisel teklifin hazır',
    'Sık kullandığın ürünlere ve benzerlerine özel avantajlar seni bekliyor.',
    '/account/personal-offers.html',
    'Teklifleri Gör',
    jsonb_build_object('source','offer_trigger','row',j)
  );

  return new;
exception when others then
  return new;
end;
$$;

-- Attach triggers only when matching tables exist.
-- This avoids breaking deploys when table names differ.

do $$
begin
  if to_regclass('public.orders') is not null then
    drop trigger if exists cosmoskin_orders_activity_insert on public.orders;
    create trigger cosmoskin_orders_activity_insert
      after insert on public.orders
      for each row execute function public.cosmoskin_activity_order_insert();

    drop trigger if exists cosmoskin_orders_activity_update on public.orders;
    create trigger cosmoskin_orders_activity_update
      after update on public.orders
      for each row execute function public.cosmoskin_activity_order_update();
  end if;

  if to_regclass('public.customer_orders') is not null then
    drop trigger if exists cosmoskin_customer_orders_activity_insert on public.customer_orders;
    create trigger cosmoskin_customer_orders_activity_insert
      after insert on public.customer_orders
      for each row execute function public.cosmoskin_activity_order_insert();

    drop trigger if exists cosmoskin_customer_orders_activity_update on public.customer_orders;
    create trigger cosmoskin_customer_orders_activity_update
      after update on public.customer_orders
      for each row execute function public.cosmoskin_activity_order_update();
  end if;
end $$;

do $$
begin
  if to_regclass('public.routine_completions') is not null then
    drop trigger if exists cosmoskin_routine_completions_activity_insert on public.routine_completions;
    create trigger cosmoskin_routine_completions_activity_insert
      after insert on public.routine_completions
      for each row execute function public.cosmoskin_activity_routine_complete();
  end if;

  if to_regclass('public.user_routine_completions') is not null then
    drop trigger if exists cosmoskin_user_routine_completions_activity_insert on public.user_routine_completions;
    create trigger cosmoskin_user_routine_completions_activity_insert
      after insert on public.user_routine_completions
      for each row execute function public.cosmoskin_activity_routine_complete();
  end if;

  if to_regclass('public.routine_logs') is not null then
    drop trigger if exists cosmoskin_routine_logs_activity_insert on public.routine_logs;
    create trigger cosmoskin_routine_logs_activity_insert
      after insert on public.routine_logs
      for each row execute function public.cosmoskin_activity_routine_complete();
  end if;
end $$;

do $$
begin
  if to_regclass('public.points_transactions') is not null then
    drop trigger if exists cosmoskin_points_transactions_activity_insert on public.points_transactions;
    create trigger cosmoskin_points_transactions_activity_insert
      after insert on public.points_transactions
      for each row execute function public.cosmoskin_activity_points_insert();
  end if;

  if to_regclass('public.point_transactions') is not null then
    drop trigger if exists cosmoskin_point_transactions_activity_insert on public.point_transactions;
    create trigger cosmoskin_point_transactions_activity_insert
      after insert on public.point_transactions
      for each row execute function public.cosmoskin_activity_points_insert();
  end if;

  if to_regclass('public.reward_transactions') is not null then
    drop trigger if exists cosmoskin_reward_transactions_activity_insert on public.reward_transactions;
    create trigger cosmoskin_reward_transactions_activity_insert
      after insert on public.reward_transactions
      for each row execute function public.cosmoskin_activity_points_insert();
  end if;
end $$;

do $$
begin
  if to_regclass('public.personal_offers') is not null then
    drop trigger if exists cosmoskin_personal_offers_activity_insert on public.personal_offers;
    create trigger cosmoskin_personal_offers_activity_insert
      after insert on public.personal_offers
      for each row execute function public.cosmoskin_activity_offer_insert();
  end if;

  if to_regclass('public.user_offers') is not null then
    drop trigger if exists cosmoskin_user_offers_activity_insert on public.user_offers;
    create trigger cosmoskin_user_offers_activity_insert
      after insert on public.user_offers
      for each row execute function public.cosmoskin_activity_offer_insert();
  end if;
end $$;
