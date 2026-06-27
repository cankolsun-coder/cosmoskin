-- COSMOSKIN hotfix — loyalty_points_ledger missing user_id compatibility
-- Run this once, then rerun 20260627_customer_experience_production_patch.sql.
-- It is safe to run multiple times.

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
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='user_id') then
      alter table public.loyalty_points_ledger add column user_id uuid;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='email') then
      alter table public.loyalty_points_ledger add column email text;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='created_at') then
      alter table public.loyalty_points_ledger add column created_at timestamptz not null default now();
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='updated_at') then
      alter table public.loyalty_points_ledger add column updated_at timestamptz not null default now();
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='order_id') then
      alter table public.loyalty_points_ledger add column order_id uuid;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='event_type') then
      alter table public.loyalty_points_ledger add column event_type text not null default 'manual_adjustment';
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='points_delta') then
      alter table public.loyalty_points_ledger add column points_delta integer not null default 0;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='status') then
      alter table public.loyalty_points_ledger add column status text not null default 'available';
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='transaction_reference') then
      alter table public.loyalty_points_ledger add column transaction_reference text;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='available_at') then
      alter table public.loyalty_points_ledger add column available_at timestamptz;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='points_basis_amount') then
      alter table public.loyalty_points_ledger add column points_basis_amount numeric(12,2);
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='reason') then
      alter table public.loyalty_points_ledger add column reason text;
    end if;
  end if;
end $$;

create unique index if not exists loyalty_points_ledger_transaction_reference_uidx
on public.loyalty_points_ledger(transaction_reference)
where transaction_reference is not null;

create index if not exists loyalty_points_ledger_status_idx
on public.loyalty_points_ledger(user_id, status, created_at desc);
