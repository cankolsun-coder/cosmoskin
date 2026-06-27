-- COSMOSKIN Supabase preflight fix — missing user_id columns
-- Run this BEFORE rerunning 20260627_customer_experience_production_patch.sql.
-- Safe/idempotent: can be run multiple times.

create extension if not exists pgcrypto;

-- 1) Ensure loyalty_points_ledger exists and has all columns used by the production patch.
do $$
begin
  if to_regclass('public.loyalty_points_ledger') is null then
    create table public.loyalty_points_ledger (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete cascade,
      email text,
      event_type text not null default 'manual_adjustment',
      points_delta integer not null default 0,
      balance_after integer,
      order_id uuid,
      status text not null default 'available',
      transaction_reference text,
      available_at timestamptz,
      points_basis_amount numeric(12,2),
      reason text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  else
    alter table public.loyalty_points_ledger add column if not exists user_id uuid;
    alter table public.loyalty_points_ledger add column if not exists email text;
    alter table public.loyalty_points_ledger add column if not exists event_type text not null default 'manual_adjustment';
    alter table public.loyalty_points_ledger add column if not exists points_delta integer not null default 0;
    alter table public.loyalty_points_ledger add column if not exists balance_after integer;
    alter table public.loyalty_points_ledger add column if not exists order_id uuid;
    alter table public.loyalty_points_ledger add column if not exists status text not null default 'available';
    alter table public.loyalty_points_ledger add column if not exists transaction_reference text;
    alter table public.loyalty_points_ledger add column if not exists available_at timestamptz;
    alter table public.loyalty_points_ledger add column if not exists points_basis_amount numeric(12,2);
    alter table public.loyalty_points_ledger add column if not exists reason text;
    alter table public.loyalty_points_ledger add column if not exists metadata jsonb not null default '{}'::jsonb;
    alter table public.loyalty_points_ledger add column if not exists created_at timestamptz not null default now();
    alter table public.loyalty_points_ledger add column if not exists updated_at timestamptz not null default now();
  end if;
end $$;

-- 2) Ensure customer_payment_methods exists and has user_id before indexes/policies reference it.
do $$
begin
  if to_regclass('public.customer_payment_methods') is null then
    create table public.customer_payment_methods (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete cascade,
      provider text not null default 'provider_pending',
      provider_customer_id text,
      provider_card_token text,
      card_brand text,
      card_last4 text,
      expiry_month integer,
      expiry_year integer,
      display_name text,
      is_default boolean not null default false,
      status text not null default 'active',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  else
    alter table public.customer_payment_methods add column if not exists user_id uuid;
    alter table public.customer_payment_methods add column if not exists provider text not null default 'provider_pending';
    alter table public.customer_payment_methods add column if not exists provider_customer_id text;
    alter table public.customer_payment_methods add column if not exists provider_card_token text;
    alter table public.customer_payment_methods add column if not exists card_brand text;
    alter table public.customer_payment_methods add column if not exists card_last4 text;
    alter table public.customer_payment_methods add column if not exists expiry_month integer;
    alter table public.customer_payment_methods add column if not exists expiry_year integer;
    alter table public.customer_payment_methods add column if not exists display_name text;
    alter table public.customer_payment_methods add column if not exists is_default boolean not null default false;
    alter table public.customer_payment_methods add column if not exists status text not null default 'active';
    alter table public.customer_payment_methods add column if not exists metadata jsonb not null default '{}'::jsonb;
    alter table public.customer_payment_methods add column if not exists created_at timestamptz not null default now();
    alter table public.customer_payment_methods add column if not exists updated_at timestamptz not null default now();
  end if;
end $$;

-- 3) Ensure invoice_records exists and has user_id before indexes/policies reference it.
do $$
begin
  if to_regclass('public.invoice_records') is null then
    create table public.invoice_records (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete set null,
      order_id uuid,
      order_number text,
      invoice_number text,
      invoice_type text default 'e-Arşiv',
      invoice_status text not null default 'pending',
      provider text default 'qnb_e_solutions',
      provider_reference text,
      file_url text,
      issued_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  else
    alter table public.invoice_records add column if not exists user_id uuid;
    alter table public.invoice_records add column if not exists order_id uuid;
    alter table public.invoice_records add column if not exists order_number text;
    alter table public.invoice_records add column if not exists invoice_number text;
    alter table public.invoice_records add column if not exists invoice_type text default 'e-Arşiv';
    alter table public.invoice_records add column if not exists invoice_status text not null default 'pending';
    alter table public.invoice_records add column if not exists provider text default 'qnb_e_solutions';
    alter table public.invoice_records add column if not exists provider_reference text;
    alter table public.invoice_records add column if not exists file_url text;
    alter table public.invoice_records add column if not exists issued_at timestamptz;
    alter table public.invoice_records add column if not exists metadata jsonb not null default '{}'::jsonb;
    alter table public.invoice_records add column if not exists created_at timestamptz not null default now();
    alter table public.invoice_records add column if not exists updated_at timestamptz not null default now();
  end if;
end $$;

-- 4) Create indexes only after columns definitely exist.
create unique index if not exists loyalty_points_ledger_transaction_reference_uidx
  on public.loyalty_points_ledger(transaction_reference)
  where transaction_reference is not null;

create index if not exists loyalty_points_ledger_status_idx
  on public.loyalty_points_ledger(user_id, status, created_at desc);

create index if not exists customer_payment_methods_user_idx
  on public.customer_payment_methods(user_id, status, is_default desc);

create index if not exists invoice_records_user_idx
  on public.invoice_records(user_id, created_at desc);

create index if not exists invoice_records_order_idx
  on public.invoice_records(order_id);

-- 5) Quick verification output. It should return all rows with has_user_id=true.
select
  table_name,
  exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = t.table_name
      and c.column_name = 'user_id'
  ) as has_user_id
from (values
  ('loyalty_points_ledger'),
  ('customer_payment_methods'),
  ('invoice_records')
) as t(table_name);
