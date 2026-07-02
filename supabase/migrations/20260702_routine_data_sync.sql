-- COSMOSKIN Akıllı Rutin Veri Modeli + Supabase Sync
-- Backward-compatible migration: mevcut tabloları drop etmez, yalnızca eksik kolonları ekler.

alter table if exists public.customer_skin_profiles
  add column if not exists primary_goal text,
  add column if not exists secondary_goals text[] not null default '{}'::text[],
  add column if not exists budget_band text,
  add column if not exists avoid_ingredients text[] not null default '{}'::text[],
  add column if not exists preferred_texture text,
  add column if not exists spf_habit text,
  add column if not exists source_channel text not null default 'account';

update public.customer_skin_profiles
set
  primary_goal = coalesce(primary_goal, nullif(routine_goal, '')),
  secondary_goals = case
    when secondary_goals is null or secondary_goals = '{}'::text[] then coalesce(concerns, '{}'::text[])
    else secondary_goals
  end,
  source_channel = coalesce(nullif(source_channel, ''), nullif(source, ''), 'account')
where primary_goal is null
   or secondary_goals is null
   or secondary_goals = '{}'::text[]
   or source_channel is null
   or source_channel = '';

alter table if exists public.customer_routine_results
  add column if not exists routine_score integer,
  add column if not exists routine_version text not null default '2026-07-routine-data-v1',
  add column if not exists skin_profile_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists morning_steps jsonb not null default '[]'::jsonb,
  add column if not exists evening_steps jsonb not null default '[]'::jsonb,
  add column if not exists weekly_steps jsonb not null default '[]'::jsonb,
  add column if not exists alternative_products jsonb not null default '[]'::jsonb,
  add column if not exists conflict_warnings jsonb not null default '[]'::jsonb,
  add column if not exists source_channel text not null default 'smart-routine',
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.customer_routine_results
set
  routine_score = coalesce(routine_score, case when (result->>'routine_score') ~ '^[0-9]+$' then (result->>'routine_score')::int end, case when (result->>'score') ~ '^[0-9]+$' then (result->>'score')::int end, case when (result->>'matchScore') ~ '^[0-9]+$' then (result->>'matchScore')::int end),
  routine_version = coalesce(nullif(routine_version, ''), result->>'routine_version', '2026-07-routine-data-v1'),
  skin_profile_snapshot = case when skin_profile_snapshot = '{}'::jsonb then coalesce(result->'skin_profile_snapshot', result->'profile', result->'preferences', '{}'::jsonb) else skin_profile_snapshot end,
  morning_steps = case when morning_steps = '[]'::jsonb then coalesce(result->'morning_steps', result->'morning', result->'dayRoutine', '[]'::jsonb) else morning_steps end,
  evening_steps = case when evening_steps = '[]'::jsonb then coalesce(result->'evening_steps', result->'evening', result->'nightRoutine', '[]'::jsonb) else evening_steps end,
  weekly_steps = case when weekly_steps = '[]'::jsonb then coalesce(result->'weekly_steps', result->'weekly', '[]'::jsonb) else weekly_steps end,
  alternative_products = case when alternative_products = '[]'::jsonb then coalesce(result->'alternative_products', result->'alternatives', '[]'::jsonb) else alternative_products end,
  conflict_warnings = case when conflict_warnings = '[]'::jsonb then coalesce(result->'conflict_warnings', result->'warnings', '[]'::jsonb) else conflict_warnings end,
  source_channel = coalesce(nullif(source_channel, ''), result->>'source_channel', result->>'source', 'smart-routine'),
  updated_at = coalesce(updated_at, completed_at, created_at, now())
where result is not null;

create index if not exists customer_skin_profiles_user_updated_idx on public.customer_skin_profiles(user_id, updated_at desc);
create index if not exists customer_routine_results_user_active_updated_idx on public.customer_routine_results(user_id, is_active desc, updated_at desc);
create index if not exists customer_routine_results_email_active_updated_idx on public.customer_routine_results(lower(email), is_active desc, updated_at desc) where email is not null;
