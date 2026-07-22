-- P1 fix: a paid order's stock is CONVERTED (permanently deducted from
-- stock_on_hand, inventory_reservations.status='converted') at payment time
-- via convert_order_inventory(). release_order_inventory() only operates on
-- rows still in status='reserved', so it is a no-op for a paid order — until
-- now, cancelling a paid-but-not-shipped order left stock permanently short
-- (product marked sold even though it never left the warehouse).
--
-- This is the reverse of convert_order_inventory(): adds each converted
-- line's quantity back to stock_on_hand and marks the reservation row
-- 'released' (reusing the existing status, distinguished via release_reason)
-- so it can never be double-processed by either function again.
-- Idempotent: a second call finds no 'converted' rows left for the order.

drop function if exists public.restock_cancelled_order_inventory(uuid, text);
create or replace function public.restock_cancelled_order_inventory(
  p_order_id uuid,
  p_reason text default 'order_cancelled_after_payment'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_lines integer := 0;
  v_quantity integer := 0;
begin
  if p_order_id is null then
    raise exception 'order_id_required';
  end if;

  for r in
    select id, product_slug, quantity
    from public.inventory_reservations
    where order_id = p_order_id and status = 'converted'
    for update
  loop
    update public.product_inventory
       set stock_on_hand = coalesce(stock_on_hand, 0) + r.quantity,
           updated_at = now()
     where lower(trim(product_slug)) = lower(trim(r.product_slug));

    update public.inventory_reservations
       set status = 'released',
           released_at = now(),
           release_reason = p_reason
     where id = r.id;

    v_lines := v_lines + 1;
    v_quantity := v_quantity + r.quantity;
  end loop;

  return jsonb_build_object('ok', true, 'restocked_lines', v_lines, 'restocked_quantity', v_quantity);
end;
$$;

revoke all on function public.restock_cancelled_order_inventory(uuid, text) from public, anon, authenticated;
grant execute on function public.restock_cancelled_order_inventory(uuid, text) to service_role;
