-- =====================================================================
-- FEMIS store database, part 2: admin panel rules
-- Run once in Supabase SQL Editor, after 0001_init.sql.
-- =====================================================================

-- Staff may edit only these order fields directly. Prices, totals and the delivery area can never be
-- edited (area changes the delivery charge). Status and advance changes go through functions so who did what is recorded.
revoke update on public.orders from authenticated;
grant update (name, phone, address, staff_note) on public.orders to authenticated;

revoke update on public.customers from authenticated;
grant update (name, address) on public.customers to authenticated;

-- Record who verified a bKash advance, and when.
alter table public.orders add column advance_verified_by uuid references auth.users (id);
alter table public.orders add column advance_verified_at timestamptz;

create or replace function public.verify_advance(p_order_no text, p_verified boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() not in ('owner', 'orders') then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.orders
     set advance_verified = p_verified,
         advance_verified_by = case when p_verified then auth.uid() end,
         advance_verified_at = case when p_verified then now() end
   where order_no = p_order_no and advance > 0;
  if not found then return jsonb_build_object('ok', false, 'error', 'Order not found or has no advance'); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.verify_advance(text, boolean) from public, anon;
grant execute on function public.verify_advance(text, boolean) to authenticated;

-- Order staff and the owner can see staff names (shown in the order history).
create or replace function public.staff_names()
returns table (user_id uuid, name text)
language sql stable security definer set search_path = public
as $$ select user_id, name from public.staff where public.is_staff() $$;
revoke execute on function public.staff_names() from public, anon;
grant execute on function public.staff_names() to authenticated;
