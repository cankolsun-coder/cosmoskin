create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  first_name text,
  last_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete restrict,
  order_number text not null unique,
  status text not null default 'pending_payment',
  currency text not null default 'TRY',
  subtotal_amount integer not null default 0,
  vat_amount integer not null default 0,
  shipping_amount integer not null default 0,
  total_amount integer not null default 0,
  customer_email text not null,
  customer_first_name text,
  customer_last_name text,
  customer_phone text,
  invoice_type text,
  identity_number text,
  city text,
  district text,
  postal_code text,
  address_line text,
  cargo_note text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  brand text,
  image text,
  unit_price integer not null,
  quantity integer not null default 1,
  line_total integer not null
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null,
  status text not null default 'initiated',
  amount integer not null,
  conversation_id uuid,
  provider_token text,
  provider_payment_id text,
  raw_initialize_response jsonb,
  raw_callback_response jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  )
  on conflict (id) do update
  set email = excluded.email,
      first_name = excluded.first_name,
      last_name = excluded.last_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

create policy "Users read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users read own orders"
on public.orders for select
using (auth.uid() = user_id);

create policy "Users read own order items"
on public.order_items for select
using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and o.user_id = auth.uid()
  )
);

create policy "Users read own payments"
on public.payments for select
using (
  exists (
    select 1 from public.orders o
    where o.id = payments.order_id
      and o.user_id = auth.uid()
  )
);