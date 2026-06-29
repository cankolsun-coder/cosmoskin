-- COSMOSKIN checkout / bank transfer / inventory final stabilization
-- Idempotent migration. Run once before deploying the fixed Cloudflare Pages project.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'public') then
    raise exception 'public schema is required';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Core tables: safe column guarantees
-- -----------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text,
  status text default 'pending_payment',
  payment_status text default 'pending',
  fulfillment_status text default 'not_started',
  payment_method text default 'bank_transfer',
  currency text default 'TRY',
  subtotal_amount numeric(12,2) default 0,
  discount_amount numeric(12,2) default 0,
  vat_amount numeric(12,2) default 0,
  shipping_amount numeric(12,2) default 0,
  total_amount numeric(12,2) default 0,
  customer_email text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.orders
  add column if not exists checkout_idempotency_key text,
  add column if not exists user_id uuid,
  add column if not exists order_number text,
  add column if not exists status text default 'pending_payment',
  add column if not exists payment_status text default 'pending',
  add column if not exists fulfillment_status text default 'not_started',
  add column if not exists payment_method text default 'bank_transfer',
  add column if not exists currency text default 'TRY',
  add column if not exists subtotal_amount numeric(12,2) default 0,
  add column if not exists discount_amount numeric(12,2) default 0,
  add column if not exists vat_amount numeric(12,2) default 0,
  add column if not exists shipping_amount numeric(12,2) default 0,
  add column if not exists total_amount numeric(12,2) default 0,
  add column if not exists customer_email text,
  add column if not exists customer_first_name text,
  add column if not exists customer_last_name text,
  add column if not exists customer_phone text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists legal_consents jsonb default '{}'::jsonb,
  add column if not exists paid_at timestamptz,
  add column if not exists fulfilled_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  product_id text,
  product_slug text,
  product_name text,
  brand text,
  sku text,
  image text,
  unit_price numeric(12,2) not null default 0,
  quantity integer not null default 1,
  line_total numeric(12,2) not null default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  provider text not null default 'bank_transfer',
  status text not null default 'awaiting_transfer',
  amount numeric(12,2) not null default 0,
  currency text not null default 'TRY',
  provider_payment_id text,
  provider_token text,
  conversation_id text,
  raw_initialize_response jsonb default '{}'::jsonb,
  raw_callback_response jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  status text,
  event_type text,
  previous_status text,
  new_status text,
  source text default 'system',
  created_by text default 'system',
  message text,
  note text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  customer_email text,
  email_type text not null,
  provider text,
  status text not null default 'pending',
  subject text,
  provider_message_id text,
  error_message text,
  metadata jsonb default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- Money model: numeric(12,2), with generated display aliases rebuilt safely
-- -----------------------------------------------------------------------------
drop view if exists public.order_checkout_audit cascade;

alter table if exists public.orders drop column if exists subtotal cascade;
alter table if exists public.orders drop column if exists shipping_total cascade;
alter table if exists public.orders drop column if exists vat_total cascade;
alter table if exists public.orders drop column if exists total cascade;
alter table if exists public.orders drop column if exists grand_total cascade;
alter table if exists public.orders drop column if exists discount_total cascade;

alter table if exists public.orders
  alter column subtotal_amount type numeric(12,2) using round(coalesce(subtotal_amount,0)::numeric,2),
  alter column discount_amount type numeric(12,2) using round(coalesce(discount_amount,0)::numeric,2),
  alter column vat_amount type numeric(12,2) using round(coalesce(vat_amount,0)::numeric,2),
  alter column shipping_amount type numeric(12,2) using round(coalesce(shipping_amount,0)::numeric,2),
  alter column total_amount type numeric(12,2) using round(coalesce(total_amount,0)::numeric,2);

alter table if exists public.order_items
  alter column unit_price type numeric(12,2) using round(coalesce(unit_price,0)::numeric,2),
  alter column line_total type numeric(12,2) using round(coalesce(line_total,0)::numeric,2);

alter table if exists public.payments
  alter column amount type numeric(12,2) using round(coalesce(amount,0)::numeric,2);

alter table if exists public.orders
  add column if not exists subtotal numeric(12,2) generated always as (subtotal_amount) stored,
  add column if not exists shipping_total numeric(12,2) generated always as (shipping_amount) stored,
  add column if not exists vat_total numeric(12,2) generated always as (vat_amount) stored,
  add column if not exists discount_total numeric(12,2) generated always as (discount_amount) stored,
  add column if not exists total numeric(12,2) generated always as (total_amount) stored,
  add column if not exists grand_total numeric(12,2) generated always as (total_amount) stored;

create unique index if not exists orders_checkout_idempotency_key_uidx
  on public.orders (checkout_idempotency_key)
  where checkout_idempotency_key is not null;
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists payments_order_id_idx on public.payments(order_id);
create index if not exists order_status_events_order_id_idx on public.order_status_events(order_id);
create index if not exists email_events_order_id_idx on public.email_events(order_id);

-- -----------------------------------------------------------------------------
-- Constraints: drop unknown historical constraints and add final status contracts
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.orders'::regclass and contype = 'c' loop
    execute format('alter table public.orders drop constraint if exists %I', r.conname);
  end loop;
  for r in select conname from pg_constraint where conrelid = 'public.payments'::regclass and contype = 'c' loop
    execute format('alter table public.payments drop constraint if exists %I', r.conname);
  end loop;
  for r in select conname from pg_constraint where conrelid = 'public.order_status_events'::regclass and contype = 'c' loop
    execute format('alter table public.order_status_events drop constraint if exists %I', r.conname);
  end loop;
  for r in select conname from pg_constraint where conrelid = 'public.email_events'::regclass and contype = 'c' loop
    execute format('alter table public.email_events drop constraint if exists %I', r.conname);
  end loop;
exception when undefined_table then null;
end $$;

alter table if exists public.orders
  add constraint orders_status_final_chk check (status in ('pending','confirmed','pending_payment','pending_bank_transfer','paid','preparing','packed','shipped','delivered','cancelled','payment_failed','refunded','partially_refunded','return_requested','returned')),
  add constraint orders_payment_status_final_chk check (payment_status in ('pending','authorized','initiated','awaiting_transfer','paid','failed','refunded','partially_refunded')),
  add constraint orders_fulfillment_status_final_chk check (fulfillment_status in ('not_started','unfulfilled','preparing','packed','shipped','delivered','returned','cancelled')),
  add constraint orders_payment_method_final_chk check (payment_method in ('card','bank_transfer','iyzico','manual'));

alter table if exists public.payments
  add constraint payments_provider_final_chk check (provider in ('bank_transfer','iyzico','card','manual','refund','system')),
  add constraint payments_status_final_chk check (status in ('pending','authorized','initiated','initialize_failed','awaiting_transfer','paid','failed','refunded','partially_refunded','cancelled'));

alter table if exists public.order_status_events
  add constraint order_status_events_status_final_chk check (status is null or status in ('pending','confirmed','pending_payment','pending_bank_transfer','awaiting_transfer','payment_awaiting_transfer','order_created','stock_reserved','paid','payment_success','payment_confirmed_manual','payment_failed','preparing','order_preparing','packed','order_packed','shipped','shipment_created','shipment_updated','shipment_delivered','delivered','cancelled','return_requested','returned','refunded','partially_refunded','updated')),
  add constraint order_status_events_event_type_final_chk check (event_type is null or event_type in ('order_created','status_updated','confirmed','stock_reserved','payment_awaiting_transfer','payment_success','payment_confirmed_manual','payment_failed','order_preparing','order_packed','shipment_created','shipment_updated','shipment_delivered','mark_payment_paid','mark_preparing','mark_packed','mark_shipped','mark_delivered','cancel_order','updated'));

alter table if exists public.email_events
  add constraint email_events_email_type_final_chk check (email_type in ('bank_transfer_pending','order_created','payment_success','payment_confirmed_manual','order_preparing','order_packed','shipment_created','shipment_updated','shipment_delivered','payment_failed','restock_alert','return_request_received','return_approved','return_rejected','refund_completed','review_request')),
  add constraint email_events_status_final_chk check (status in ('pending','queued','sent','failed','skipped'));

-- -----------------------------------------------------------------------------
-- Inventory tables and atomic RPCs
-- -----------------------------------------------------------------------------
create table if not exists public.product_inventory (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null,
  sku text,
  stock_on_hand integer not null default 0,
  stock_reserved integer not null default 0,
  low_stock_threshold integer not null default 5,
  status text not null default 'active',
  allow_backorder boolean not null default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.product_inventory
  add column if not exists product_slug text,
  add column if not exists sku text,
  add column if not exists stock_on_hand integer default 0,
  add column if not exists stock_reserved integer default 0,
  add column if not exists low_stock_threshold integer default 5,
  add column if not exists status text default 'active',
  add column if not exists allow_backorder boolean default false,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

-- Existing production tables may already contain duplicate slug rows. Clean duplicates
-- before creating the functional unique index so the migration can be rerun safely.
delete from public.product_inventory a
using public.product_inventory b
where a.ctid < b.ctid
  and lower(trim(coalesce(a.product_slug,''))) = lower(trim(coalesce(b.product_slug,'')))
  and coalesce(a.product_slug,'') <> '';

create unique index if not exists product_inventory_product_slug_uidx
  on public.product_inventory (lower(trim(product_slug)))
  where coalesce(trim(product_slug),'') <> '';

do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.product_inventory'::regclass and contype = 'c' loop
    execute format('alter table public.product_inventory drop constraint if exists %I', r.conname);
  end loop;
exception when undefined_table then null;
end $$;

alter table if exists public.product_inventory
  add constraint product_inventory_stock_nonnegative_chk check (stock_on_hand >= 0 and stock_reserved >= 0 and low_stock_threshold >= 0),
  add constraint product_inventory_status_final_chk check (status in ('active','inactive','out_of_stock','discontinued'));

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  product_slug text not null,
  quantity integer not null,
  status text not null default 'reserved',
  expires_at timestamptz,
  created_at timestamptz default now(),
  released_at timestamptz,
  release_reason text,
  metadata jsonb default '{}'::jsonb,
  created_by text default 'checkout'
);

alter table if exists public.inventory_reservations
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists order_id uuid,
  add column if not exists product_slug text,
  add column if not exists quantity integer default 1,
  add column if not exists status text default 'reserved',
  add column if not exists expires_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists released_at timestamptz,
  add column if not exists release_reason text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_by text default 'checkout';

create index if not exists inventory_reservations_order_id_idx on public.inventory_reservations(order_id);
create index if not exists inventory_reservations_slug_status_idx on public.inventory_reservations(lower(trim(product_slug)), status);

do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.inventory_reservations'::regclass and contype = 'c' loop
    execute format('alter table public.inventory_reservations drop constraint if exists %I', r.conname);
  end loop;
exception when undefined_table then null;
end $$;

alter table if exists public.inventory_reservations
  add constraint inventory_reservations_status_final_chk check (status in ('reserved','released','converted','expired','active')),
  add constraint inventory_reservations_quantity_positive_chk check (quantity > 0);

insert into public.product_inventory (product_slug, stock_on_hand, stock_reserved, status, allow_backorder, metadata)
select 'beauty-of-joseon-relief-sun-spf50', 0, 0, 'active', false, '{"seed":"slug_guard"}'::jsonb
where not exists (
  select 1
  from public.product_inventory
  where lower(trim(product_slug)) = 'beauty-of-joseon-relief-sun-spf50'
);

drop function if exists public.reserve_order_inventory(uuid,jsonb,timestamptz,text);
create or replace function public.reserve_order_inventory(
  p_order_id uuid,
  p_items jsonb,
  p_expires_at timestamptz,
  p_session_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_slug text;
  v_quantity integer;
  inv record;
  v_reserved integer := 0;
  v_reservations jsonb := '[]'::jsonb;
begin
  if p_order_id is null then
    raise exception 'order_id_required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items_array_required';
  end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    v_slug := lower(trim(coalesce(item->>'product_slug', item->>'slug', item->>'product_id', item->>'id')));
    v_quantity := greatest(1, coalesce((item->>'quantity')::integer, (item->>'qty')::integer, 1));
    if v_slug is null or v_slug = '' then
      raise exception 'inventory_slug_required';
    end if;

    select * into inv
    from public.product_inventory
    where lower(trim(product_slug)) = v_slug
    for update;

    if not found then
      raise exception 'Stok kaydı bulunamadı: %', v_slug using errcode = 'P0001';
    end if;

    if inv.status <> 'active' and inv.allow_backorder is not true then
      raise exception 'Ürün satışa uygun değil: %', v_slug using errcode = 'P0001';
    end if;

    if inv.allow_backorder is not true and (coalesce(inv.stock_on_hand,0) - coalesce(inv.stock_reserved,0)) < v_quantity then
      raise exception 'Yetersiz stok: %', v_slug using errcode = 'P0001';
    end if;

    update public.product_inventory
       set stock_reserved = coalesce(stock_reserved,0) + v_quantity,
           updated_at = now()
     where id = inv.id;

    insert into public.inventory_reservations(order_id, product_slug, quantity, status, expires_at, metadata, created_by)
    values (p_order_id, v_slug, v_quantity, 'reserved', p_expires_at, jsonb_build_object('item', item, 'session_id', p_session_id), 'checkout')
    returning jsonb_build_object('id', id, 'product_slug', product_slug, 'quantity', quantity, 'status', status) into item;

    v_reservations := v_reservations || jsonb_build_array(item);
    v_reserved := v_reserved + v_quantity;
  end loop;

  return jsonb_build_object('ok', true, 'reserved', v_reserved, 'reservations', v_reservations);
end;
$$;

drop function if exists public.release_order_inventory(uuid,text);
create or replace function public.release_order_inventory(
  p_order_id uuid,
  p_reason text default 'released'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select id, product_slug, quantity
    from public.inventory_reservations
    where order_id = p_order_id and status = 'reserved'
    for update
  loop
    update public.product_inventory
       set stock_reserved = greatest(0, coalesce(stock_reserved,0) - r.quantity),
           updated_at = now()
     where lower(trim(product_slug)) = lower(trim(r.product_slug));

    update public.inventory_reservations
       set status = 'released', released_at = now(), release_reason = coalesce(p_reason, 'released')
     where id = r.id;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'released', v_count);
end;
$$;

drop function if exists public.convert_order_inventory(uuid);
create or replace function public.convert_order_inventory(
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
  v_deducted integer := 0;
begin
  for r in
    select id, product_slug, quantity
    from public.inventory_reservations
    where order_id = p_order_id and status = 'reserved'
    for update
  loop
    update public.product_inventory
       set stock_reserved = greatest(0, coalesce(stock_reserved,0) - r.quantity),
           stock_on_hand = greatest(0, coalesce(stock_on_hand,0) - r.quantity),
           updated_at = now()
     where lower(trim(product_slug)) = lower(trim(r.product_slug));

    update public.inventory_reservations
       set status = 'converted', released_at = now(), release_reason = 'converted_to_sale'
     where id = r.id;
    v_count := v_count + 1;
    v_deducted := v_deducted + r.quantity;
  end loop;

  return jsonb_build_object('ok', true, 'converted', v_count, 'deducted', v_deducted);
end;
$$;

revoke all on function public.reserve_order_inventory(uuid,jsonb,timestamptz,text) from public, anon, authenticated;
revoke all on function public.release_order_inventory(uuid,text) from public, anon, authenticated;
revoke all on function public.convert_order_inventory(uuid) from public, anon, authenticated;
grant execute on function public.reserve_order_inventory(uuid,jsonb,timestamptz,text) to service_role;
grant execute on function public.release_order_inventory(uuid,text) to service_role;
grant execute on function public.convert_order_inventory(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Bank accounts
-- -----------------------------------------------------------------------------
create table if not exists public.payment_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_holder text not null,
  account_name text,
  iban text not null unique,
  branch text,
  currency text default 'TRY',
  is_active boolean default true,
  sort_order integer default 100,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.payment_bank_accounts
  add column if not exists bank_name text,
  add column if not exists account_holder text,
  add column if not exists account_name text,
  add column if not exists iban text,
  add column if not exists branch text,
  add column if not exists currency text default 'TRY',
  add column if not exists is_active boolean default true,
  add column if not exists sort_order integer default 100,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- If this table existed before without a unique IBAN constraint, ON CONFLICT(iban)
-- would fail. De-duplicate first and then use explicit update/insert logic below.
delete from public.payment_bank_accounts a
using public.payment_bank_accounts b
where a.ctid < b.ctid
  and replace(coalesce(a.iban,''),' ','') = replace(coalesce(b.iban,''),' ','')
  and coalesce(a.iban,'') <> '';

create unique index if not exists payment_bank_accounts_iban_normalized_uidx
  on public.payment_bank_accounts (replace(iban,' ',''))
  where coalesce(iban,'') <> '';

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='payment_bank_accounts' and column_name='account_name') then
    execute 'update public.payment_bank_accounts set account_holder = coalesce(account_holder, account_name) where account_holder is null';
  end if;
end $$;

do $$
declare
  acc record;
begin
  for acc in
    select * from (values
      ('Garanti Bankası'::text, 'ENES CAN KÖLSÜN'::text, 'ENES CAN KÖLSÜN'::text, 'TR84 0006 2000 7420 0006 2918 66'::text, 'Maltepe Çarşı'::text, 'TRY'::text, true, 10),
      ('İş Bankası'::text, 'ENES CAN KÖLSÜN'::text, 'ENES CAN KÖLSÜN'::text, 'TR70 0006 4000 0011 0372 5790 47'::text, 'Maltepe Çarşı'::text, 'TRY'::text, true, 20)
    ) as v(bank_name, account_holder, account_name, iban, branch, currency, is_active, sort_order)
  loop
    update public.payment_bank_accounts
       set bank_name = acc.bank_name,
           account_holder = acc.account_holder,
           account_name = acc.account_name,
           iban = acc.iban,
           branch = acc.branch,
           currency = acc.currency,
           is_active = acc.is_active,
           sort_order = acc.sort_order,
           updated_at = now()
     where replace(coalesce(iban,''),' ','') = replace(acc.iban,' ','');

    if not found then
      insert into public.payment_bank_accounts(bank_name, account_holder, account_name, iban, branch, currency, is_active, sort_order)
      values (acc.bank_name, acc.account_holder, acc.account_name, acc.iban, acc.branch, acc.currency, acc.is_active, acc.sort_order);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- User profiles and addresses
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.profiles
  add column if not exists id uuid,
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

delete from public.profiles a
using public.profiles b
where a.ctid < b.ctid
  and a.id = b.id
  and a.id is not null;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set email = new.email,
         full_name = coalesce(nullif(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),''), full_name),
         first_name = coalesce(nullif(coalesce(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'firstName', ''),''), first_name),
         last_name = coalesce(nullif(coalesce(new.raw_user_meta_data->>'last_name', new.raw_user_meta_data->>'lastName', ''),''), last_name),
         updated_at = now()
   where id = new.id;

  if not found then
    insert into public.profiles(id, email, full_name, first_name, last_name, created_at, updated_at)
    select
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
      coalesce(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'firstName', ''),
      coalesce(new.raw_user_meta_data->>'last_name', new.raw_user_meta_data->>'lastName', ''),
      now(),
      now()
    where not exists (select 1 from public.profiles where id = new.id);
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('auth.users') is not null then
    drop trigger if exists on_auth_user_created_cosmoskin_profile on auth.users;
    create trigger on_auth_user_created_cosmoskin_profile
      after insert on auth.users
      for each row execute function public.handle_new_user_profile();
  end if;
end $$;

create table if not exists public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  address_type text not null default 'shipping',
  title text,
  recipient_first_name text,
  recipient_last_name text,
  phone text,
  address_line text not null,
  city text not null,
  district text not null,
  postal_code text,
  is_default boolean not null default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.user_addresses
  add column if not exists user_id uuid,
  add column if not exists address_type text default 'shipping',
  add column if not exists title text,
  add column if not exists recipient_first_name text,
  add column if not exists recipient_last_name text,
  add column if not exists phone text,
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists district text,
  add column if not exists postal_code text,
  add column if not exists is_default boolean default false,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

create index if not exists user_addresses_user_id_idx on public.user_addresses(user_id);
with ranked_defaults as (
  select id, row_number() over (partition by user_id, coalesce(address_type,'shipping') order by coalesce(updated_at, created_at) desc nulls last, created_at desc nulls last, id) as rn
  from public.user_addresses
  where is_default is true
)
update public.user_addresses a
   set is_default = false, updated_at = now()
  from ranked_defaults r
 where a.id = r.id and r.rn > 1;
create unique index if not exists user_addresses_one_default_per_type_uidx
  on public.user_addresses(user_id, address_type)
  where is_default is true;

do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.user_addresses'::regclass and contype = 'c' loop
    execute format('alter table public.user_addresses drop constraint if exists %I', r.conname);
  end loop;
exception when undefined_table then null;
end $$;

alter table if exists public.user_addresses
  add constraint user_addresses_type_final_chk check (address_type in ('shipping','billing','both'));

alter table public.user_addresses enable row level security;
drop policy if exists user_addresses_select_own on public.user_addresses;
drop policy if exists user_addresses_insert_own on public.user_addresses;
drop policy if exists user_addresses_update_own on public.user_addresses;
drop policy if exists user_addresses_delete_own on public.user_addresses;
create policy user_addresses_select_own on public.user_addresses for select using (auth.uid() = user_id);
create policy user_addresses_insert_own on public.user_addresses for insert with check (auth.uid() = user_id);
create policy user_addresses_update_own on public.user_addresses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_addresses_delete_own on public.user_addresses for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_addresses to authenticated;
grant usage on schema public to authenticated;

-- Recreate lightweight audit view after amount aliases are stable.
create or replace view public.order_checkout_audit as
select
  id,
  order_number,
  status,
  payment_status,
  fulfillment_status,
  payment_method,
  subtotal_amount,
  discount_amount,
  shipping_amount,
  vat_amount,
  total_amount,
  customer_email,
  created_at,
  updated_at
from public.orders;

commit;
