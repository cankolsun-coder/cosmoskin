-- D3A: Persist per-line paid pricing snapshots at checkout for deterministic refunds.
-- Nullable columns only — no backfill, no destructive changes, legacy rows unaffected.

ALTER TABLE IF EXISTS public.order_items
  ADD COLUMN IF NOT EXISTS allocated_order_discount numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS paid_line_total numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS paid_unit_price numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS pricing_snapshot_version text NULL;

COMMENT ON COLUMN public.order_items.allocated_order_discount IS 'D3A: order-level coupon share allocated to this line at checkout.';
COMMENT ON COLUMN public.order_items.paid_line_total IS 'D3A: line_total minus allocated_order_discount at checkout.';
COMMENT ON COLUMN public.order_items.paid_unit_price IS 'D3A: paid_line_total / quantity at checkout.';
COMMENT ON COLUMN public.order_items.pricing_snapshot_version IS 'D3A: pricing allocation algorithm version (e.g. v1_proportional_last_line_remainder).';
