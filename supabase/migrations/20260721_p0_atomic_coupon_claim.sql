-- P0 fix: atomic coupon usage-limit claim to close a TOCTOU race in checkout.
-- Locks the coupons row for the code being claimed, re-checks active/date/usage_limit/
-- per_customer_limit under that lock, then inserts the coupon_redemptions row —
-- all inside a single SECURITY DEFINER function call, mirroring reserve_order_inventory().

drop function if exists public.claim_coupon_redemption(text, uuid, uuid, text, numeric, text, text);
create or replace function public.claim_coupon_redemption(
  p_coupon_code text,
  p_order_id uuid,
  p_user_id uuid,
  p_customer_email text,
  p_discount_amount numeric,
  p_status text default 'reserved',
  p_source text default 'checkout'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_coupon_code, '')));
  v_email text := lower(trim(coalesce(p_customer_email, '')));
  v_status text := coalesce(nullif(trim(p_status), ''), 'reserved');
  coupon record;
  v_usage_limit integer;
  v_per_customer_limit integer;
  v_active_count integer;
  v_customer_count integer;
  v_redemption_id uuid;
begin
  if v_code = '' then
    raise exception 'coupon_code_required' using errcode = 'P0001';
  end if;
  if p_order_id is null then
    raise exception 'order_id_required' using errcode = 'P0001';
  end if;

  -- Row-lock the coupon so concurrent claims for the same code serialize here.
  select * into coupon
  from public.coupons
  where upper(code) = v_code
  for update;

  if not found then
    raise exception 'Kupon bulunamadı: %', v_code using errcode = 'P0001';
  end if;

  if coupon.is_active is false then
    raise exception 'Kupon aktif değil: %', v_code using errcode = 'P0001';
  end if;
  if coupon.starts_at is not null and coupon.starts_at > now() then
    raise exception 'Kupon henüz başlamadı: %', v_code using errcode = 'P0001';
  end if;
  if coupon.ends_at is not null and coupon.ends_at < now() then
    raise exception 'Kuponun süresi doldu: %', v_code using errcode = 'P0001';
  end if;

  v_usage_limit := coalesce(coupon.usage_limit, 0);
  if v_usage_limit > 0 then
    select count(*) into v_active_count
    from public.coupon_redemptions
    where upper(code) = v_code
      and status in ('used', 'reserved');
    if v_active_count >= v_usage_limit then
      raise exception 'Kupon kullanım limiti doldu: %', v_code using errcode = 'P0001';
    end if;
  end if;

  v_per_customer_limit := coalesce(coupon.per_customer_limit, 0);
  if v_per_customer_limit > 0 and (p_user_id is not null or v_email <> '') then
    select count(*) into v_customer_count
    from public.coupon_redemptions
    where upper(code) = v_code
      and status in ('used', 'reserved')
      and (
        (p_user_id is not null and user_id = p_user_id)
        or (v_email <> '' and lower(customer_email) = v_email)
      );
    if v_customer_count >= v_per_customer_limit then
      raise exception 'Bu kupon için müşteri kullanım limiti doldu: %', v_code using errcode = 'P0001';
    end if;
  end if;

  insert into public.coupon_redemptions (
    coupon_id, order_id, user_id, customer_email, code, discount_amount, status, metadata, created_at
  ) values (
    coupon.id,
    p_order_id,
    p_user_id,
    nullif(v_email, ''),
    v_code,
    greatest(0, coalesce(p_discount_amount, 0)),
    v_status,
    jsonb_build_object('source', coalesce(p_source, 'checkout'), 'payment_status', case when v_status = 'used' then 'used' else 'pending' end),
    now()
  )
  returning id into v_redemption_id;

  return jsonb_build_object('ok', true, 'redemption_id', v_redemption_id);
end;
$$;

revoke all on function public.claim_coupon_redemption(text, uuid, uuid, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.claim_coupon_redemption(text, uuid, uuid, text, numeric, text, text) to service_role;
