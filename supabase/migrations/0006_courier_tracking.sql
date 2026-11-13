-- =====================================================================
-- FEMIS store database, part 6: Steadfast courier and Meta tracking
-- Run once in Supabase SQL Editor, after 0005_profit.sql.
-- =====================================================================

-- When to send the Purchase event to Meta: when the order is placed, or when staff confirm it.
alter table public.settings
  add column capi_purchase_on text not null default 'confirmed' check (capi_purchase_on in ('placed', 'confirmed'));

alter table public.orders
  add column courier_status text,                 -- Steadfast's own status, e.g. in_review, delivered
  add column courier_booked_at timestamptz,
  add column courier_checked_at timestamptz,
  add column capi_purchase_sent_at timestamptz;   -- when the Purchase event went to Meta

create unique index orders_consignment_idx on public.orders (courier_consignment_id) where courier_consignment_id is not null;

-- Called after Steadfast accepts a parcel: saves the consignment and marks the order shipped.
create or replace function public.courier_booked(p_order_no text, p_consignment_id text, p_tracking_code text, p_courier_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare o public.orders;
begin
  if public.my_role() not in ('owner', 'orders') then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into o from public.orders where order_no = p_order_no for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Order not found'); end if;
  if o.courier_consignment_id is not null then return jsonb_build_object('ok', false, 'error', 'Already booked with the courier'); end if;

  update public.orders
     set courier = 'steadfast', courier_consignment_id = p_consignment_id, courier_tracking_code = p_tracking_code,
         courier_status = p_courier_status, courier_booked_at = now(), courier_checked_at = now()
   where id = o.id;

  if o.status <> 'shipped' then
    perform public.set_order_status(p_order_no, 'shipped', 'Booked with Steadfast · consignment ' || p_consignment_id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Called with the latest status from Steadfast. Moves the order to delivered or returned when final.
create or replace function public.apply_courier_status(p_order_no text, p_courier_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare o public.orders; v_new public.order_status;
begin
  if public.my_role() not in ('owner', 'orders') then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into o from public.orders where order_no = p_order_no for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Order not found'); end if;

  update public.orders set courier_status = p_courier_status, courier_checked_at = now() where id = o.id;

  v_new := case
    when p_courier_status in ('delivered', 'partial_delivered') then 'delivered'::public.order_status
    when p_courier_status = 'cancelled' then 'returned'::public.order_status
  end;
  if v_new is not null and o.status = 'shipped' then
    perform public.set_order_status(p_order_no, v_new,
      case p_courier_status when 'partial_delivered' then 'Steadfast: partly delivered. Check the collected amount.'
                            when 'cancelled' then 'Steadfast: delivery cancelled, parcel returning.'
                            else 'Steadfast: delivered.' end);
    return jsonb_build_object('ok', true, 'status', v_new);
  end if;
  return jsonb_build_object('ok', true, 'status', o.status);
end $$;

-- Makes sure the Purchase event is sent to Meta only once per order.
-- Returns true if this call claimed the order (and should send), false if it was already sent.
create or replace function public.claim_purchase_event(p_order_no text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() not in ('owner', 'orders') then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.orders set capi_purchase_sent_at = now() where order_no = p_order_no and capi_purchase_sent_at is null;
  return found;
end $$;

-- Undo the claim if sending to Meta failed, so it can be tried again.
create or replace function public.release_purchase_event(p_order_no text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.orders set capi_purchase_sent_at = null
  where order_no = p_order_no and public.my_role() in ('owner', 'orders');
$$;

revoke execute on function public.courier_booked(text, text, text, text) from public, anon;
revoke execute on function public.apply_courier_status(text, text) from public, anon;
revoke execute on function public.claim_purchase_event(text) from public, anon;
revoke execute on function public.release_purchase_event(text) from public, anon;
grant execute on function public.courier_booked(text, text, text, text) to authenticated;
grant execute on function public.apply_courier_status(text, text) to authenticated;
grant execute on function public.claim_purchase_event(text) to authenticated;
grant execute on function public.release_purchase_event(text) to authenticated;
