-- P1 fix: support cancelling a single line item within a multi-item order
-- (previously only whole-order cancellation existed). Additive, nullable
-- columns — cancelled_at IS NULL means the line is still active.

alter table if exists public.order_items
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

-- Reverse of reserve/convert for a SINGLE product line within an order —
-- handles both 'reserved' (unpaid order, still holding a stock reservation)
-- and 'converted' (paid order, stock already deducted) states so callers
-- don't need to know which one applies. Idempotent: a second call finds no
-- matching 'reserved'/'converted' row left for that order+product.
drop function if exists public.release_order_item_inventory(uuid, text, text);
create or replace function public.release_order_item_inventory(
  p_order_id uuid,
  p_product_slug text,
  p_reason text default 'order_item_cancelled'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_slug text := lower(trim(p_product_slug));
  v_lines integer := 0;
  v_quantity integer := 0;
begin
  if p_order_id is null then
    raise exception 'order_id_required';
  end if;
  if v_slug is null or v_slug = '' then
    raise exception 'product_slug_required';
  end if;

  for r in
    select id, product_slug, quantity, status
    from public.inventory_reservations
    where order_id = p_order_id
      and lower(trim(product_slug)) = v_slug
      and status in ('reserved', 'converted')
    for update
  loop
    if r.status = 'converted' then
      update public.product_inventory
         set stock_on_hand = coalesce(stock_on_hand, 0) + r.quantity,
             updated_at = now()
       where lower(trim(product_slug)) = v_slug;
    else
      update public.product_inventory
         set stock_reserved = greatest(0, coalesce(stock_reserved, 0) - r.quantity),
             updated_at = now()
       where lower(trim(product_slug)) = v_slug;
    end if;

    update public.inventory_reservations
       set status = 'released',
           released_at = now(),
           release_reason = p_reason
     where id = r.id;

    v_lines := v_lines + 1;
    v_quantity := v_quantity + r.quantity;
  end loop;

  return jsonb_build_object('ok', true, 'released_lines', v_lines, 'released_quantity', v_quantity);
end;
$$;

revoke all on function public.release_order_item_inventory(uuid, text, text) from public, anon, authenticated;
grant execute on function public.release_order_item_inventory(uuid, text, text) to service_role;
