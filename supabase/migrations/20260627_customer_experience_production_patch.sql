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
-- COSMOSKIN customer experience production patch — 2026-06-27
-- Safe, idempotent hardening for COSMOSKIN Club, account payment methods,
-- invoice visibility, cosmetic profile recommendations and cart/checkout auditability.
-- This migration does not contain or require API keys/secrets.

-- 1) Keep the loyalty tier vocabulary canonical: Essential / Signature / Elite only.
insert into public.membership_levels (code, name, spend_threshold_12m, order_threshold_12m, benefits_json, sort_order, is_active)
values
  ('essential', 'Essential', 0, 0, '{"positioning":"Başlangıç seviyesi","benefits":["COSMOSKIN Club erişimi","Puan kazanımı","Seçili kampanya bilgilendirmeleri"]}'::jsonb, 10, true),
  ('signature', 'Signature', 6000, 3, '{"positioning":"Düzenli COSMOSKIN müşterisi","benefits":["Signature seviye ilerleme avantajları","Özel kampanya dönemleri","Öncelikli stok bilgilendirmeleri"]}'::jsonb, 20, true),
  ('elite', 'Elite', 15000, 8, '{"positioning":"En yüksek sadakat seviyesi","benefits":["Elite sadakat avantajları","Öncelikli kampanya erişimi","Premium müşteri deneyimi"]}'::jsonb, 30, true)
on conflict (code) do update set
  name = excluded.name,
  spend_threshold_12m = excluded.spend_threshold_12m,
  order_threshold_12m = excluded.order_threshold_12m,
  benefits_json = excluded.benefits_json,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

update public.customer_membership_status set level_code = 'signature', updated_at = now() where level_code in ('select','silver');
update public.customer_membership_history set old_level = 'signature' where old_level in ('select','silver');
update public.customer_membership_history set new_level = 'signature' where new_level in ('select','silver');


-- Compatibility guard for legacy/partial COSMOSKIN schemas.
-- Some earlier databases may already have loyalty_points_ledger but without user_id.
-- Ensure required columns exist before indexes/policies reference them.
do $$
begin
  if to_regclass('public.loyalty_points_ledger') is not null then
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='user_id') then
      alter table public.loyalty_points_ledger add column user_id uuid;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='email') then
      alter table public.loyalty_points_ledger add column email text;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='created_at') then
      alter table public.loyalty_points_ledger add column created_at timestamptz not null default now();
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='order_id') then
      alter table public.loyalty_points_ledger add column order_id uuid;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='loyalty_points_ledger' and column_name='points_delta') then
      alter table public.loyalty_points_ledger add column points_delta integer not null default 0;
    end if;
  end if;
end $$;

-- 2) Extend points ledger for production-safe status and idempotency metadata.
alter table public.loyalty_points_ledger add column if not exists status text not null default 'available';
alter table public.loyalty_points_ledger add column if not exists transaction_reference text;
alter table public.loyalty_points_ledger add column if not exists available_at timestamptz;
alter table public.loyalty_points_ledger add column if not exists points_basis_amount numeric(12,2);
alter table public.loyalty_points_ledger add column if not exists reason text;
create unique index if not exists loyalty_points_ledger_transaction_reference_uidx on public.loyalty_points_ledger(transaction_reference) where transaction_reference is not null;
create index if not exists loyalty_points_ledger_status_idx on public.loyalty_points_ledger(user_id, status, created_at desc);

-- 3) Tokenized payment method metadata only. Never store PAN/CVV/raw card data.
create table if not exists public.customer_payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
  updated_at timestamptz not null default now(),
  constraint customer_payment_methods_last4_safe check (card_last4 is null or card_last4 ~ '^[0-9]{4}$')
);
create index if not exists customer_payment_methods_user_idx on public.customer_payment_methods(user_id, status, is_default desc);
alter table public.customer_payment_methods enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_payment_methods' and policyname='customer_payment_methods_own_select') then
    create policy customer_payment_methods_own_select on public.customer_payment_methods for select using (auth.uid() = user_id);
  end if;
end $$;

-- 4) Account-facing invoice state table. Provider integration can fill file_url/provider_reference later.
create table if not exists public.invoice_records (
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
create index if not exists invoice_records_user_idx on public.invoice_records(user_id, created_at desc);
create index if not exists invoice_records_order_idx on public.invoice_records(order_id);
alter table public.invoice_records enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_records' and policyname='invoice_records_own_select') then
    create policy invoice_records_own_select on public.invoice_records for select using (auth.uid() = user_id);
  end if;
end $$;

-- 5) Cosmetic recommendation metadata. These are commerce/product tags, not medical diagnosis data.
create table if not exists public.product_routine_tags (
  id uuid primary key default gen_random_uuid(),
  product_id uuid,
  product_slug text,
  routine_step text,
  cosmetic_care_goals text[] not null default '{}'::text[],
  suitable_skin_types text[] not null default '{}'::text[],
  texture_preferences text[] not null default '{}'::text[],
  sensitivity_preferences text[] not null default '{}'::text[],
  recommendation_priority integer not null default 100,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_routine_tags_identity check (product_id is not null or product_slug is not null)
);
create index if not exists product_routine_tags_slug_idx on public.product_routine_tags(product_slug);
create index if not exists product_routine_tags_step_idx on public.product_routine_tags(routine_step, is_active, recommendation_priority);

create table if not exists public.risky_cosmetic_claim_terms (
  id uuid primary key default gen_random_uuid(),
  term text unique not null,
  replacement_guidance text,
  severity text not null default 'warning',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.risky_cosmetic_claim_terms (term, replacement_guidance, severity) values
  ('tedavi eder','Kozmetik ürün seçimi ve görünüm odaklı dil kullanın.','block'),
  ('iyileştirir','Kozmetik ürün seçimi ve görünüm odaklı dil kullanın.','block'),
  ('geçirir','Kozmetik ürün seçimi ve görünüm odaklı dil kullanın.','block'),
  ('yok eder','Kozmetik ürün seçimi ve görünüm odaklı dil kullanın.','block'),
  ('kesin çözüm','Kesin sonuç vaadi kullanmayın.','block'),
  ('akne tedavisi','Tıbbi tedavi iddiası kullanmayın.','block'),
  ('egzama','Hastalık/teşhis odaklı yönlendirme kullanmayın.','warning'),
  ('rozasea','Hastalık/teşhis odaklı yönlendirme kullanmayın.','warning'),
  ('teşhis','Teşhis/tedavi ifadesi kullanmayın.','block')
on conflict (term) do update set replacement_guidance = excluded.replacement_guidance, severity = excluded.severity, is_active = true;
