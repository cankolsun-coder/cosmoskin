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
