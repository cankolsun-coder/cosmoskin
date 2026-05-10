-- COSMOSKIN Journal newsletter subscribers
-- Apply in Supabase SQL editor before enabling the footer newsletter endpoint.

create extension if not exists pgcrypto;

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text default 'footer',
  status text default 'subscribed',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  confirmed_at timestamptz null,
  welcome_sent_at timestamptz null,
  last_email_sent_at timestamptz null,
  constraint newsletter_subscribers_email_not_blank check (length(trim(email)) > 3),
  constraint newsletter_subscribers_status_check check (status in ('subscribed', 'unsubscribed', 'bounced', 'complained'))
);

create unique index if not exists newsletter_subscribers_email_lower_unique
  on public.newsletter_subscribers (lower(trim(email)));

create index if not exists newsletter_subscribers_status_created_idx
  on public.newsletter_subscribers (status, created_at desc);

create or replace function public.set_newsletter_subscribers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.email = lower(trim(new.email));
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists newsletter_subscribers_set_updated_at on public.newsletter_subscribers;
create trigger newsletter_subscribers_set_updated_at
before insert or update on public.newsletter_subscribers
for each row execute function public.set_newsletter_subscribers_updated_at();

alter table public.newsletter_subscribers enable row level security;

-- Server-side Cloudflare Functions use the Supabase service role key.
-- No public insert/select policy is created, so subscribers cannot be read or written from frontend clients.
