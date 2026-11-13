-- =====================================================================
-- FEMIS store database, part 8: orders entered by staff (Messenger, WhatsApp, phone)
-- Run once in Supabase SQL Editor, after 0007_customers_coupons.sql.
-- =====================================================================

alter table public.orders
  add column source text not null default 'website'
    check (source in ('website', 'messenger', 'whatsapp', 'phone', 'instagram', 'other')),
  add column created_by uuid references auth.users (id);
create index orders_source_idx on public.orders (source, created_at desc);

-- Staff enter an order from a chat or call. Same price, stock and pre-order rules as the website,
-- plus what staff agree with the customer: a delivery charge, a discount, and an advance.
create or replace function public.create_manual_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.settings;
  v_source text := coalesce(p->>'source', '');
  v_name text := btrim(coalesce(p->>'name', ''));
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[\s-]', '', 'g');
  v_address text := btrim(coalesce(p->>'address', ''));
  v_area text := coalesce(p->>'area', '');
  v_addon_on boolean := coalesce((p->>'add_on')::boolean, false);
  v_trx text := btrim(coalesce(p->>'trx_id', ''));
  v_note text := left(btrim(coalesce(p->>'note', '')), 500);
  v_staff_note text := left(btrim(coalesce(p->>'staff_note', '')), 1000);
  v_confirmed boolean := coalesce((p->>'confirmed')::boolean, false);
  v_adv_received boolean := coalesce((p->>'advance_received')::boolean, false);
  v_delivery_in int;
  v_discount_in int;
  v_advance_in int;
  v_lines jsonb := coalesce(p->'lines', '[]'::jsonb);
  errors jsonb := '{}'::jsonb;
  line jsonb;
  prod public.products;
  v_qty int;
  v_colour text;
  v_size text;
  needed jsonb := '{}'::jsonb;
  items jsonb := '[]'::jsonb;
  v_subtotal int := 0;
  v_rule_advance int := 0;
  v_has_pre boolean := false;
  v_addon int;
  v_delivery int;
  v_discount int;
  v_advance int;
  v_total int;
  v_customer uuid;
  v_order public.orders;
  k text;
begin
  if public.my_role() not in ('owner', 'orders') then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into s from public.settings where id = 1;

  -- Numbers typed by staff; empty means "use the normal rule".
  begin
    v_delivery_in := nullif(p->>'delivery', '')::int;
    v_discount_in := coalesce(nullif(p->>'discount', '')::int, 0);
    v_advance_in := nullif(p->>'advance', '')::int;
  exception when others then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_object('form', 'Delivery, discount and advance must be whole numbers.'));
  end;

  if v_source not in ('messenger', 'whatsapp', 'phone', 'instagram', 'other') then errors := errors || '{"source":"Choose where the order came from."}'; end if;
  if length(v_name) < 2 or length(v_name) > 80 then errors := errors || '{"name":"Enter the customer name."}'; end if;
  if v_phone !~ '^01[3-9][0-9]{8}$' then errors := errors || '{"phone":"Enter an 11-digit mobile number starting with 01."}'; end if;
  if length(v_address) < 10 or length(v_address) > 300 then errors := errors || '{"address":"Enter the full address with area and district."}'; end if;
  if v_area not in ('inside', 'outside') then errors := errors || '{"area":"Choose a delivery area."}'; end if;
  if v_delivery_in is not null and (v_delivery_in < 0 or v_delivery_in > 2000) then errors := errors || '{"delivery":"Enter a delivery charge from 0 to 2000."}'; end if;
  if v_discount_in < 0 then errors := errors || '{"discount":"The discount cannot be negative."}'; end if;

  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    errors := errors || '{"lines":"Add at least one product."}';
  elsif jsonb_array_length(v_lines) > 30 then
    errors := errors || '{"lines":"Too many items in one order."}';
  else
    for line in select * from jsonb_array_elements(v_lines) loop
      select * into prod from public.products where slug = line->>'slug' for update;
      if not found then errors := errors || jsonb_build_object('lines', 'One of the products no longer exists.'); continue; end if;
      v_qty := coalesce((line->>'qty')::int, 0);
      v_colour := coalesce(line->>'colour', '');
      v_size := nullif(line->>'size', '');
      if v_qty < 1 or v_qty > 20 then errors := errors || jsonb_build_object('lines', prod.name || ': choose a quantity between 1 and 20.'); continue; end if;
      if cardinality(prod.colours) > 0 and not (v_colour = any (prod.colours)) then errors := errors || jsonb_build_object('lines', prod.name || ': choose a colour.'); continue; end if;
      if cardinality(prod.sizes) > 0 and (v_size is null or not (v_size = any (prod.sizes))) then errors := errors || jsonb_build_object('lines', prod.name || ': choose a size.'); continue; end if;
      if cardinality(prod.sizes) = 0 then v_size := null; end if;

      if prod.is_preorder then
        v_has_pre := true;
        v_rule_advance := v_rule_advance + prod.preorder_advance * v_qty;
      else
        needed := needed || jsonb_build_object(prod.id::text, coalesce((needed->>prod.id::text)::int, 0) + v_qty);
        if (needed->>prod.id::text)::int > prod.stock then
          errors := errors || jsonb_build_object('lines', case when prod.stock = 0 then prod.name || ' is sold out.' else prod.name || ': only ' || prod.stock || ' left in stock.' end);
          continue;
        end if;
      end if;

      v_subtotal := v_subtotal + prod.price * v_qty;
      items := items || jsonb_build_object('product_id', prod.id, 'slug', prod.slug, 'name', prod.name, 'colour', v_colour, 'size', v_size,
        'qty', v_qty, 'unit_price', prod.price, 'is_preorder', prod.is_preorder, 'line_total', prod.price * v_qty);
    end loop;
  end if;

  if errors <> '{}'::jsonb then return jsonb_build_object('ok', false, 'errors', errors); end if;

  -- Totals
  v_addon := case when v_addon_on and s.addon_enabled then s.addon_price else 0 end;
  v_discount := least(v_discount_in, v_subtotal);
  v_delivery := coalesce(v_delivery_in, case when s.free_delivery_over > 0 and v_subtotal - v_discount >= s.free_delivery_over then 0
                                             when v_area = 'inside' then s.delivery_inside else s.delivery_outside end);
  v_total := v_subtotal + v_addon + v_delivery - v_discount;
  v_advance := coalesce(v_advance_in, v_rule_advance);

  if v_advance < 0 or v_advance > v_total then errors := errors || '{"advance":"The advance must be between 0 and the order total."}'; end if;
  if v_advance > 0 and v_confirmed and not v_adv_received then
    errors := errors || '{"advance":"Tick \"Advance received\" after checking bKash, or save the order as not confirmed."}';
  end if;
  if v_adv_received and v_advance > 0 and (length(v_trx) < 6 or length(v_trx) > 40) then
    errors := errors || '{"trx_id":"Enter the bKash transaction ID."}';
  end if;
  if errors <> '{}'::jsonb then return jsonb_build_object('ok', false, 'errors', errors); end if;

  -- Save
  insert into public.customers (phone, name, address, area) values (v_phone, v_name, v_address, v_area)
  on conflict (phone) do update set name = excluded.name, address = excluded.address, area = excluded.area
  returning id into v_customer;

  insert into public.orders (customer_id, name, phone, address, area, has_preorder, subtotal, addon, delivery, discount, total,
                             advance, on_delivery, bkash_trx, advance_verified, advance_verified_by, advance_verified_at,
                             note, staff_note, source, created_by)
  values (v_customer, v_name, v_phone, v_address, v_area, v_has_pre, v_subtotal, v_addon, v_delivery, v_discount, v_total,
          v_advance, v_total - v_advance, nullif(v_trx, ''), v_adv_received and v_advance > 0,
          case when v_adv_received and v_advance > 0 then auth.uid() end, case when v_adv_received and v_advance > 0 then now() end,
          v_note, v_staff_note, v_source, auth.uid())
  returning * into v_order;

  insert into public.order_items (order_id, product_id, slug, name, colour, size, qty, unit_price, is_preorder, line_total)
  select v_order.id, (i->>'product_id')::uuid, i->>'slug', i->>'name', i->>'colour', i->>'size', (i->>'qty')::int, (i->>'unit_price')::int, (i->>'is_preorder')::boolean, (i->>'line_total')::int
  from jsonb_array_elements(items) i;

  for k in select jsonb_object_keys(needed) loop
    update public.products set stock = stock - (needed->>k)::int where id = k::uuid;
  end loop;

  insert into public.order_item_costs (order_item_id, unit_cost, packaging_cost)
  select oi.id, coalesce(pc.unit_cost, 0), coalesce(pc.packaging_cost, 0)
  from public.order_items oi left join public.product_costs pc on pc.product_id = oi.product_id
  where oi.order_id = v_order.id;

  update public.orders
     set courier_cost = case when v_area = 'inside' then s.courier_cost_inside else s.courier_cost_outside end,
         addon_cost = case when v_addon > 0 then s.addon_cost else 0 end
   where id = v_order.id;

  insert into public.order_events (order_id, status, note, created_by)
  values (v_order.id, 'pending', 'Entered by staff from ' || initcap(v_source), auth.uid());
  if v_confirmed then
    update public.orders set status = 'confirmed' where id = v_order.id;
    insert into public.order_events (order_id, status, note, created_by) values (v_order.id, 'confirmed', 'Confirmed in chat or call', auth.uid());
  end if;

  update public.checkout_drafts set converted_order = v_order.order_no
   where phone = v_phone and converted_order is null and updated_at > now() - interval '14 days';

  return jsonb_build_object('ok', true, 'order_no', v_order.order_no, 'total', v_total);
end $$;

revoke execute on function public.create_manual_order(jsonb) from public, anon;
grant execute on function public.create_manual_order(jsonb) to authenticated;
