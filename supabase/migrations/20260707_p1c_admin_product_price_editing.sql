-- P1C: Admin product price override layer + audit logs (idempotent).
-- Does not modify static catalog prices, orders, refunds, coupons, inventory, or reviews.

create table if not exists public.product_price_overrides (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null,
  regular_price_try integer not null,
  currency text not null default 'TRY',
  is_active boolean not null default true,
  source text not null default 'admin',
  reason text null,
  created_by text null,
  updated_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_price_overrides_product_slug_uidx
  on public.product_price_overrides (product_slug);

alter table public.product_price_overrides
  drop constraint if exists product_price_overrides_regular_price_try_check;
alter table public.product_price_overrides
  add constraint product_price_overrides_regular_price_try_check
  check (regular_price_try > 0);

alter table public.product_price_overrides
  drop constraint if exists product_price_overrides_currency_check;
alter table public.product_price_overrides
  add constraint product_price_overrides_currency_check
  check (currency in ('TRY'));

create table if not exists public.product_price_audit_logs (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null,
  old_regular_price_try integer null,
  new_regular_price_try integer not null,
  old_currency text null,
  new_currency text not null default 'TRY',
  changed_by_admin text null,
  changed_at timestamptz not null default now(),
  reason text null,
  source text not null default 'admin',
  request_id text null
);

create index if not exists product_price_audit_logs_slug_changed_at_idx
  on public.product_price_audit_logs (product_slug, changed_at desc);

alter table public.product_price_overrides enable row level security;
alter table public.product_price_audit_logs enable row level security;

-- Permission seed (owner already has '*').
insert into public.admin_permissions (role_code, permission)
values ('owner', 'products:pricing:update')
on conflict (role_code, permission) do nothing;
