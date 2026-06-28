-- COSMOSKIN final e-commerce hotfix, 2026-06-28
-- Idempotent production-safe migration. Does not drop customer/order data.

create extension if not exists pgcrypto;

-- 1) Sign-up resilience: profile table + trigger that must never block auth.users insertion.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  full_name text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.profiles enable row level security;

do $$
begin
  drop policy if exists profiles_select_self on public.profiles;
  drop policy if exists profiles_update_self on public.profiles;
  create policy profiles_select_self on public.profiles for select using (auth.uid() = id);
  create policy profiles_update_self on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
exception when others then
  raise notice 'profiles policies skipped: %', sqlerrm;
end $$;

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, email, first_name, last_name, full_name, metadata, created_at, updated_at)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'first_name',''),
      coalesce(new.raw_user_meta_data->>'last_name',''),
      coalesce(new.raw_user_meta_data->>'full_name', trim(concat(coalesce(new.raw_user_meta_data->>'first_name',''), ' ', coalesce(new.raw_user_meta_data->>'last_name','')))),
      coalesce(new.raw_user_meta_data, '{}'::jsonb),
      now(),
      now()
    )
    on conflict (id) do update set
      email = excluded.email,
      first_name = coalesce(nullif(excluded.first_name,''), public.profiles.first_name),
      last_name = coalesce(nullif(excluded.last_name,''), public.profiles.last_name),
      full_name = coalesce(nullif(excluded.full_name,''), public.profiles.full_name),
      metadata = coalesce(public.profiles.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
      updated_at = now();
  exception when others then
    raise warning 'COSMOSKIN profile trigger skipped for user %, error: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user_profile();

-- 2) User addresses.
create table if not exists public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Adres',
  recipient_first_name text,
  recipient_last_name text,
  phone text,
  city text,
  district text,
  neighborhood text,
  postal_code text,
  address_line text,
  address_type text not null default 'shipping',
  is_default boolean not null default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_addresses add column if not exists neighborhood text;
alter table public.user_addresses add column if not exists address_type text not null default 'shipping';
alter table public.user_addresses add column if not exists is_default boolean not null default false;
alter table public.user_addresses add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.user_addresses add column if not exists updated_at timestamptz default now();
alter table public.user_addresses drop constraint if exists user_addresses_address_type_check;
alter table public.user_addresses add constraint user_addresses_address_type_check check (address_type in ('shipping','billing','both'));
create index if not exists idx_user_addresses_user_default on public.user_addresses(user_id, is_default desc, updated_at desc);
alter table public.user_addresses enable row level security;

do $$
begin
  drop policy if exists user_addresses_select_self on public.user_addresses;
  drop policy if exists user_addresses_insert_self on public.user_addresses;
  drop policy if exists user_addresses_update_self on public.user_addresses;
  drop policy if exists user_addresses_delete_self on public.user_addresses;
  create policy user_addresses_select_self on public.user_addresses for select using (auth.uid() = user_id);
  create policy user_addresses_insert_self on public.user_addresses for insert with check (auth.uid() = user_id);
  create policy user_addresses_update_self on public.user_addresses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy user_addresses_delete_self on public.user_addresses for delete using (auth.uid() = user_id);
exception when others then
  raise notice 'user_addresses policies skipped: %', sqlerrm;
end $$;

-- 3) Official bank accounts.
create table if not exists public.payment_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_holder text not null,
  iban text not null,
  branch text,
  currency text default 'TRY',
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists uq_payment_bank_accounts_iban_norm on public.payment_bank_accounts((upper(regexp_replace(iban, '[^A-Za-z0-9]', '', 'g'))));
do $$
begin
  insert into public.payment_bank_accounts (bank_name, account_holder, iban, branch, currency, is_active, sort_order)
  values ('Garanti Bankası', 'ENES CAN KÖLSÜN', 'TR84 0006 2000 7420 0006 2918 66', 'Maltepe Çarşı', 'TRY', true, 1)
  on conflict do nothing;

  update public.payment_bank_accounts
  set bank_name = 'Garanti Bankası',
      account_holder = 'ENES CAN KÖLSÜN',
      branch = 'Maltepe Çarşı',
      currency = 'TRY',
      is_active = true,
      sort_order = 1,
      updated_at = now()
  where upper(regexp_replace(iban, '[^A-Za-z0-9]', '', 'g')) = 'TR840006200074200006291866';

  insert into public.payment_bank_accounts (bank_name, account_holder, iban, branch, currency, is_active, sort_order)
  values ('İş Bankası', 'ENES CAN KÖLSÜN', 'TR70 0006 4000 0011 0372 5790 47', 'Maltepe Çarşı', 'TRY', true, 2)
  on conflict do nothing;

  update public.payment_bank_accounts
  set bank_name = 'İş Bankası',
      account_holder = 'ENES CAN KÖLSÜN',
      branch = 'Maltepe Çarşı',
      currency = 'TRY',
      is_active = true,
      sort_order = 2,
      updated_at = now()
  where upper(regexp_replace(iban, '[^A-Za-z0-9]', '', 'g')) = 'TR700006400000110372579047';
end $$;

-- 4) Inventory tables and atomic RPCs.
create table if not exists public.product_inventory (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null unique,
  sku text,
  stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  stock_reserved integer not null default 0 check (stock_reserved >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  allow_backorder boolean not null default false,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.product_inventory add column if not exists stock_reserved integer not null default 0;
alter table public.product_inventory add column if not exists allow_backorder boolean not null default false;
alter table public.product_inventory add column if not exists status text not null default 'active';
create unique index if not exists uq_product_inventory_slug_norm on public.product_inventory(lower(trim(product_slug)));

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  product_slug text not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'reserved',
  expires_at timestamptz,
  released_at timestamptz,
  converted_at timestamptz,
  release_reason text,
  created_by text,
  created_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb
);
create index if not exists idx_inventory_reservations_order on public.inventory_reservations(order_id, status);
create index if not exists idx_inventory_reservations_product on public.inventory_reservations(product_slug, status);

create or replace function public.reserve_order_inventory(
  p_order_id uuid,
  p_items jsonb,
  p_expires_at timestamptz,
  p_created_by text default 'checkout'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_slug text;
  v_qty integer;
  v_inv public.product_inventory%rowtype;
  v_reserved integer := 0;
begin
  if p_order_id is null then raise exception 'order_id is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'items array is required'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_slug := lower(trim(coalesce(v_item->>'product_slug', v_item->>'slug', v_item->>'product_id', v_item->>'id')));
    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, (v_item->>'qty')::int, 1));
    if v_slug is null or v_slug = '' then raise exception 'product_slug is required'; end if;

    select * into v_inv from public.product_inventory where lower(trim(product_slug)) = v_slug for update;
    if not found then raise exception 'inventory_not_found:%', v_slug; end if;
    if coalesce(v_inv.status, 'active') <> 'active' then raise exception 'product_not_active:%', v_slug; end if;
    if not coalesce(v_inv.allow_backorder, false) and greatest(0, coalesce(v_inv.stock_on_hand,0) - coalesce(v_inv.stock_reserved,0)) < v_qty then
      raise exception 'insufficient_stock:%', v_slug;
    end if;

    update public.product_inventory
       set stock_reserved = coalesce(stock_reserved, 0) + v_qty, updated_at = now()
     where id = v_inv.id;

    insert into public.inventory_reservations(order_id, product_slug, quantity, status, expires_at, created_by, metadata)
    values (p_order_id, v_inv.product_slug, v_qty, 'reserved', p_expires_at, p_created_by, v_item);
    v_reserved := v_reserved + 1;
  end loop;

  return jsonb_build_object('ok', true, 'reserved', v_reserved);
end;
$$;

create or replace function public.release_order_inventory(
  p_order_id uuid,
  p_reason text default 'released'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res record;
  v_count integer := 0;
begin
  for v_res in select * from public.inventory_reservations where order_id = p_order_id and status = 'reserved' for update loop
    update public.product_inventory
       set stock_reserved = greatest(0, coalesce(stock_reserved,0) - v_res.quantity), updated_at = now()
     where product_slug = v_res.product_slug;
    update public.inventory_reservations
       set status = 'released', released_at = now(), release_reason = p_reason
     where id = v_res.id;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'released', v_count);
end;
$$;

create or replace function public.convert_order_inventory(
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res record;
  v_count integer := 0;
begin
  for v_res in select * from public.inventory_reservations where order_id = p_order_id and status = 'reserved' for update loop
    update public.product_inventory
       set stock_reserved = greatest(0, coalesce(stock_reserved,0) - v_res.quantity),
           stock_on_hand = greatest(0, coalesce(stock_on_hand,0) - v_res.quantity),
           updated_at = now()
     where product_slug = v_res.product_slug;
    update public.inventory_reservations
       set status = 'converted', converted_at = now()
     where id = v_res.id;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'converted', v_count);
end;
$$;

revoke all on function public.reserve_order_inventory(uuid, jsonb, timestamptz, text) from public, anon, authenticated;
revoke all on function public.release_order_inventory(uuid, text) from public, anon, authenticated;
revoke all on function public.convert_order_inventory(uuid) from public, anon, authenticated;
grant execute on function public.reserve_order_inventory(uuid, jsonb, timestamptz, text) to service_role;
grant execute on function public.release_order_inventory(uuid, text) to service_role;
grant execute on function public.convert_order_inventory(uuid) to service_role;

-- 5) Order item/product image fields + email event types.
alter table if exists public.order_items add column if not exists image text;
alter table if exists public.order_items add column if not exists brand text;
alter table if exists public.order_items add column if not exists product_slug text;

alter table if exists public.email_events drop constraint if exists email_events_email_type_check;
alter table if exists public.email_events add constraint email_events_email_type_check check (email_type in (
  'order_created','bank_transfer_pending','payment_success','payment_confirmed_manual','payment_failed','order_preparing','order_packed',
  'shipment_created','shipment_updated','shipment_delivered','restock_alert','refund_created','refund_completed',
  'return_request_received','return_approved','return_rejected','review_request'
));
