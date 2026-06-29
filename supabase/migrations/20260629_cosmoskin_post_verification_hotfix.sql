-- COSMOSKIN post-verification hotfix
-- Run this after the v2 migration if verification returned:
-- money_columns_numeric = false and/or bank_accounts_seeded = false.
-- This file does not change order data. It normalizes/repairs payment bank account seed rows.

create table if not exists public.payment_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_holder text not null,
  account_name text,
  iban text not null,
  branch text,
  currency text default 'TRY',
  is_active boolean default true,
  sort_order integer default 100,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.payment_bank_accounts
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

-- Remove duplicate records that represent the same IBAN with different spacing.
delete from public.payment_bank_accounts a
using public.payment_bank_accounts b
where a.ctid < b.ctid
  and replace(coalesce(a.iban,''),' ','') = replace(coalesce(b.iban,''),' ','')
  and coalesce(a.iban,'') <> '';

create unique index if not exists payment_bank_accounts_iban_normalized_uidx
  on public.payment_bank_accounts (replace(iban,' ',''))
  where coalesce(iban,'') <> '';

-- Seed/update the two official COSMOSKIN bank accounts.
-- Important: also set iban = acc.iban so verification and UI receive the formatted IBAN.
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

-- Quick confirmation output.
select bank_name, account_holder, iban, branch, currency, is_active, sort_order
from public.payment_bank_accounts
where replace(iban,' ','') in ('TR840006200074200006291866','TR700006400000110372579047')
order by sort_order;
