-- COSMOSKIN hotfix for partial launch migration runs
-- Fixes: ERROR 42703 column "email" does not exist while creating order_legal_consents_email_idx.
-- Run this once, then re-run supabase/migrations/20260626_production_launch_readiness.sql.

create extension if not exists pgcrypto;

create table if not exists public.order_legal_consents (
  id uuid primary key default gen_random_uuid()
);

alter table public.order_legal_consents add column if not exists order_id uuid;
alter table public.order_legal_consents add column if not exists user_id uuid;
alter table public.order_legal_consents add column if not exists email text;
alter table public.order_legal_consents add column if not exists consent_type text;
alter table public.order_legal_consents add column if not exists accepted boolean not null default false;
alter table public.order_legal_consents add column if not exists document_key text;
alter table public.order_legal_consents add column if not exists document_title text;
alter table public.order_legal_consents add column if not exists document_version text;
alter table public.order_legal_consents add column if not exists document_hash text;
alter table public.order_legal_consents add column if not exists document_url text;
alter table public.order_legal_consents add column if not exists accepted_at timestamptz not null default now();
alter table public.order_legal_consents add column if not exists ip_address text;
alter table public.order_legal_consents add column if not exists user_agent text;
alter table public.order_legal_consents add column if not exists source text not null default 'checkout';
alter table public.order_legal_consents add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.order_legal_consents add column if not exists created_at timestamptz not null default now();

create index if not exists order_legal_consents_order_idx on public.order_legal_consents(order_id);
create index if not exists order_legal_consents_email_idx on public.order_legal_consents(lower(email)) where email is not null;
