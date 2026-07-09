-- P1E1: Sale price + compare-at price fields (idempotent, safe).
-- Extends existing P1C override + audit tables only.
-- Does NOT touch products.json, orders, refunds, coupons, inventory quantities, or reviews.
-- Does NOT weaken RLS.

-- ============================================================
-- product_price_overrides: nullable sale + compare-at + window
-- ============================================================
alter table if exists public.product_price_overrides
  add column if not exists sale_price_try integer null,
  add column if not exists compare_at_price_try integer null,
  add column if not exists sale_starts_at timestamptz null,
  add column if not exists sale_ends_at timestamptz null;

alter table public.product_price_overrides
  drop constraint if exists product_price_overrides_sale_price_try_check;
alter table public.product_price_overrides
  add constraint product_price_overrides_sale_price_try_check
  check (sale_price_try is null or sale_price_try > 0);

alter table public.product_price_overrides
  drop constraint if exists product_price_overrides_compare_at_price_try_check;
alter table public.product_price_overrides
  add constraint product_price_overrides_compare_at_price_try_check
  check (compare_at_price_try is null or compare_at_price_try > 0);

alter table public.product_price_overrides
  drop constraint if exists product_price_overrides_sale_window_check;
alter table public.product_price_overrides
  add constraint product_price_overrides_sale_window_check
  check (
    sale_ends_at is null
    or sale_starts_at is null
    or sale_ends_at > sale_starts_at
  );

alter table public.product_price_overrides
  drop constraint if exists product_price_overrides_sale_less_than_regular_check;
alter table public.product_price_overrides
  add constraint product_price_overrides_sale_less_than_regular_check
  check (
    sale_price_try is null
    or regular_price_try is null
    or sale_price_try < regular_price_try
  );

alter table public.product_price_overrides
  drop constraint if exists product_price_overrides_compare_at_greater_than_sale_check;
alter table public.product_price_overrides
  add constraint product_price_overrides_compare_at_greater_than_sale_check
  check (
    compare_at_price_try is null
    or sale_price_try is null
    or compare_at_price_try > sale_price_try
  );

-- ============================================================
-- product_price_audit_logs: nullable sale + compare-at history
-- ============================================================
alter table if exists public.product_price_audit_logs
  add column if not exists old_sale_price_try integer null,
  add column if not exists new_sale_price_try integer null,
  add column if not exists old_compare_at_price_try integer null,
  add column if not exists new_compare_at_price_try integer null,
  add column if not exists old_sale_starts_at timestamptz null,
  add column if not exists new_sale_starts_at timestamptz null,
  add column if not exists old_sale_ends_at timestamptz null,
  add column if not exists new_sale_ends_at timestamptz null;

