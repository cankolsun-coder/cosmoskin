-- COSMOSKIN Account Activity / Notifications
-- Run after main schema.sql and before/after rls.sql is fine.

create table if not exists public.account_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'activity',
  category text,
  title text not null,
  body text,
  message text,
  action_url text,
  action_label text,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_activity_user_created_idx
on public.account_activity(user_id, created_at desc);

create index if not exists account_activity_user_read_idx
on public.account_activity(user_id, read_at);

create index if not exists account_activity_type_idx
on public.account_activity(type);

alter table public.account_activity enable row level security;

drop policy if exists "Users can read own account activity" on public.account_activity;
create policy "Users can read own account activity"
on public.account_activity
for select
using (auth.uid() = user_id);

drop policy if exists "Users can update own account activity" on public.account_activity;
create policy "Users can update own account activity"
on public.account_activity
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Service role/backend can insert activities for users.
drop policy if exists "Service role can insert account activity" on public.account_activity;
create policy "Service role can insert account activity"
on public.account_activity
for insert
with check (true);

-- Optional helper function for backend / triggers.
create or replace function public.create_account_activity(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_action_url text default null,
  p_action_label text default 'Görüntüle',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.account_activity (
    user_id,
    type,
    category,
    title,
    body,
    message,
    action_url,
    action_label,
    metadata
  )
  values (
    p_user_id,
    p_type,
    p_type,
    p_title,
    p_body,
    p_body,
    p_action_url,
    p_action_label,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Example trigger helpers can be added later after exact table/column names are confirmed.
-- Recommended event types:
-- routine, order, reward, offer, product, account
