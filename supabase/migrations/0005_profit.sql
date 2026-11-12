-- =====================================================================
-- FEMIS store database, part 5: profit and loss
-- Run once in Supabase SQL Editor, after 0004_settings.sql.
-- =====================================================================

-- What you pay (not what the customer pays).
alter table public.settings
  add column courier_cost_inside int not null default 0 check (courier_cost_inside >= 0),
  add column courier_cost_outside int not null default 0 check (courier_cost_outside >= 0),
  add column addon_cost int not null default 0 check (addon_cost >= 0);

alter table public.orders
  add column courier_cost int not null default 0,
  add column addon_cost int not null default 0;

-- Product cost at the time of each order. Owner only.
create table public.order_item_costs (
  order_item_id bigint primary key references public.order_items (id) on delete cascade,
  unit_cost int not null default 0,
  packaging_cost int not null default 0
);
alter table public.order_item_costs enable row level security;
create policy item_costs_owner on public.order_item_costs for select to authenticated using (public.my_role() = 'owner');
revoke all on public.order_item_costs from anon;

-- Fill in costs for orders placed before this file was run, from today's product costs.
insert into public.order_item_costs (order_item_id, unit_cost, packaging_cost)
select oi.id, coalesce(pc.unit_cost, 0), coalesce(pc.packaging_cost, 0)
from public.order_items oi left join public.product_costs pc on pc.product_id = oi.product_id
on conflict do nothing;

-- Daily ad spend, entered by the owner.
create table public.ad_spend (
  day date primary key,
  amount int not null check (amount >= 0),
  updated_at timestamptz not null default now()
);
alter table public.ad_spend enable row level security;
create policy ad_spend_owner on public.ad_spend for all to authenticated using (public.my_role() = 'owner') with check (public.my_role() = 'owner');
revoke all on public.ad_spend from anon;

-- place_order again, now saving the cost snapshot with each order.
create or replace function public.place_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.settings;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[\s-]', '', 'g');
  v_address text := btrim(coalesce(p->>'address', ''));
  v_area text := coalesce(p->>'area', '');
  v_addon_on boolean := coalesce((p->>'add_on')::boolean, false);
  v_trx text := btrim(coalesce(p->>'trx_id', ''));
  v_note text := left(btrim(coalesce(p->>'note', '')), 500);
  v_lines jsonb := coalesce(p->'lines', '[]'::jsonb);
  errors jsonb := '{}'::jsonb;
  line jsonb;
  prod public.products;
  v_qty int;
  v_colour text;
  v_size text;
  needed jsonb := '{}'::jsonb;   -- in-stock qty needed per product id
  items jsonb := '[]'::jsonb;
  v_subtotal int := 0;
  v_advance int := 0;
  v_has_pre boolean := false;
  v_addon int;
  v_delivery int;
  v_total int;
  v_customer uuid;
  v_order public.orders;
  k text;
begin
  select * into s from public.settings where id = 1;

  -- Customer details
  if length(v_name) < 2 or length(v_name) > 80 then errors := errors || '{"name":"Please enter your full name."}'; end if;
  if v_phone !~ '^01[3-9][0-9]{8}$' then errors := errors || '{"phone":"Enter an 11-digit mobile number starting with 01."}'; end if;
  if length(v_address) < 10 or length(v_address) > 300 then errors := errors || '{"address":"Please enter your full address with area and district."}'; end if;
  if v_area not in ('inside', 'outside') then errors := errors || '{"area":"Choose a delivery area."}'; end if;

  -- Basic spam guard: at most 3 orders per phone in 10 minutes
  if v_phone ~ '^01[3-9][0-9]{8}$' and (select count(*) from public.orders where phone = v_phone and created_at > now() - interval '10 minutes') >= 3 then
    errors := errors || '{"form":"You have placed several orders just now. Please wait a few minutes or message us on WhatsApp."}';
  end if;

  -- Cart lines
  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    errors := errors || '{"lines":"Your cart is empty."}';
  elsif jsonb_array_length(v_lines) > 30 then
    errors := errors || '{"lines":"Too many items in one order."}';
  else
    for line in select * from jsonb_array_elements(v_lines) loop
      -- Lock the product row so stock cannot change until this order is saved.
      select * into prod from public.products where slug = line->>'slug' and active for update;
      if not found then
        errors := errors || jsonb_build_object('lines', 'One of the items is no longer available. Please refresh your cart.');
        continue;
      end if;
      v_qty := coalesce((line->>'qty')::int, 0);
      v_colour := coalesce(line->>'colour', '');
      v_size := nullif(line->>'size', '');
      if v_qty < 1 or v_qty > 20 then errors := errors || jsonb_build_object('lines', prod.name || ': choose a quantity between 1 and 20.'); continue; end if;
      if cardinality(prod.colours) > 0 and not (v_colour = any (prod.colours)) then errors := errors || jsonb_build_object('lines', prod.name || ': please choose a colour.'); continue; end if;
      if cardinality(prod.sizes) > 0 and (v_size is null or not (v_size = any (prod.sizes))) then errors := errors || jsonb_build_object('lines', prod.name || ': please choose a size.'); continue; end if;
      if cardinality(prod.sizes) = 0 then v_size := null; end if;

      if prod.is_preorder then
        v_has_pre := true;
        v_advance := v_advance + prod.preorder_advance * v_qty;
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

  if v_advance > 0 and (length(v_trx) < 6 or length(v_trx) > 40) then
    errors := errors || '{"trx_id":"Enter the bKash transaction ID for the advance."}';
  end if;

  if errors <> '{}'::jsonb then
    return jsonb_build_object('ok', false, 'errors', errors);
  end if;

  -- Totals
  v_addon := case when v_addon_on and s.addon_enabled then s.addon_price else 0 end;
  v_delivery := case when s.free_delivery_over > 0 and v_subtotal >= s.free_delivery_over then 0 when v_area = 'inside' then s.delivery_inside else s.delivery_outside end;
  v_total := v_subtotal + v_addon + v_delivery;

  -- Save: customer, order, items, stock, first event
  insert into public.customers (phone, name, address, area) values (v_phone, v_name, v_address, v_area)
  on conflict (phone) do update set name = excluded.name, address = excluded.address, area = excluded.area
  returning id into v_customer;

  insert into public.orders (customer_id, name, phone, address, area, has_preorder, subtotal, addon, delivery, total, advance, on_delivery, bkash_trx, note, tracking)
  values (v_customer, v_name, v_phone, v_address, v_area, v_has_pre, v_subtotal, v_addon, v_delivery, v_total, v_advance, v_total - v_advance,
          nullif(v_trx, ''), v_note, coalesce(p->'tracking', '{}'::jsonb))
  returning * into v_order;

  insert into public.order_items (order_id, product_id, slug, name, colour, size, qty, unit_price, is_preorder, line_total)
  select v_order.id, (i->>'product_id')::uuid, i->>'slug', i->>'name', i->>'colour', i->>'size', (i->>'qty')::int, (i->>'unit_price')::int, (i->>'is_preorder')::boolean, (i->>'line_total')::int
  from jsonb_array_elements(items) i;

  for k in select jsonb_object_keys(needed) loop
    update public.products set stock = stock - (needed->>k)::int where id = k::uuid;
  end loop;

  -- Snapshot today's costs on the order, so later cost changes don't rewrite past profit.
  insert into public.order_item_costs (order_item_id, unit_cost, packaging_cost)
  select oi.id, coalesce(pc.unit_cost, 0), coalesce(pc.packaging_cost, 0)
  from public.order_items oi left join public.product_costs pc on pc.product_id = oi.product_id
  where oi.order_id = v_order.id;

  update public.orders
     set courier_cost = case when v_area = 'inside' then s.courier_cost_inside else s.courier_cost_outside end,
         addon_cost = case when v_addon > 0 then s.addon_cost else 0 end
   where id = v_order.id;

  insert into public.order_events (order_id, status) values (v_order.id, 'pending');

  return jsonb_build_object('ok', true, 'order', jsonb_build_object(
    'id', v_order.order_no, 'created_at', v_order.created_at,
    'totals', jsonb_build_object('subtotal', v_subtotal, 'addOn', v_addon, 'delivery', v_delivery, 'total', v_total,
                                 'advance', v_advance, 'onDelivery', v_total - v_advance)));
end $$;

-- =====================================================================
-- profit_report: owner-only profit and loss between two dates (Dhaka time).
--   Profit counts DELIVERED orders only:
--     revenue - product and packaging cost - add-on cost - courier cost
--     - courier cost of returned parcels - ad spend
-- =====================================================================
create or replace function public.profit_report(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if public.my_role() is distinct from 'owner' then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_to < p_from or p_to - p_from > 366 then raise exception 'Choose a range of up to one year'; end if;

  with o as (
    select ord.*, (ord.created_at at time zone 'Asia/Dhaka')::date as day,
           coalesce((select sum(i.qty * (c.unit_cost + c.packaging_cost))
                     from order_items i left join order_item_costs c on c.order_item_id = i.id
                     where i.order_id = ord.id), 0)::int as goods_cost
    from orders ord
    where (ord.created_at at time zone 'Asia/Dhaka')::date between p_from and p_to
  ),
  d as (
    select g.day::date as day,
      count(o.id)::int as orders,
      count(o.id) filter (where o.status = 'delivered')::int as delivered,
      count(o.id) filter (where o.status = 'returned')::int as returned,
      count(o.id) filter (where o.status = 'cancelled')::int as cancelled,
      count(o.id) filter (where o.status in ('pending','confirmed','packed','shipped'))::int as open,
      coalesce(sum(o.total) filter (where o.status = 'delivered'), 0)::int as revenue,
      coalesce(sum(o.goods_cost + o.addon_cost) filter (where o.status = 'delivered'), 0)::int as goods_cost,
      coalesce(sum(o.courier_cost) filter (where o.status = 'delivered'), 0)::int as courier_cost,
      coalesce(sum(o.courier_cost) filter (where o.status = 'returned'), 0)::int as return_loss,
      coalesce(sum(o.total) filter (where o.status in ('pending','confirmed','packed','shipped')), 0)::int as open_value,
      coalesce((select a.amount from ad_spend a where a.day = g.day::date), 0)::int as ad_spend
    from generate_series(p_from, p_to, interval '1 day') g(day)
    left join o on o.day = g.day::date
    group by g.day
  ),
  dd as (select d.*, (revenue - goods_cost - courier_cost - return_loss - ad_spend) as profit from d),
  prod as (
    select i.name,
      sum(i.qty)::int as units,
      sum(i.line_total)::int as revenue,
      sum(i.qty * (coalesce(c.unit_cost, 0) + coalesce(c.packaging_cost, 0)))::int as cost,
      bool_or(coalesce(c.unit_cost, 0) = 0) as cost_missing
    from o join order_items i on i.order_id = o.id left join order_item_costs c on c.order_item_id = i.id
    where o.status = 'delivered'
    group by i.name
  )
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(to_jsonb(dd) order by dd.day desc) from dd), '[]'::jsonb),
    'totals', (select jsonb_build_object(
        'orders', sum(orders), 'delivered', sum(delivered), 'returned', sum(returned), 'cancelled', sum(cancelled), 'open', sum(open),
        'revenue', sum(revenue), 'goods_cost', sum(goods_cost), 'courier_cost', sum(courier_cost), 'return_loss', sum(return_loss),
        'ad_spend', sum(ad_spend), 'open_value', sum(open_value), 'profit', sum(profit)) from dd),
    'products', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'units', units, 'revenue', revenue, 'cost', cost,
                          'profit', revenue - cost, 'cost_missing', cost_missing) order by revenue - cost desc) from prod), '[]'::jsonb),
    'products_without_cost', (select count(*) from products p where p.active and not exists
                              (select 1 from product_costs pc where pc.product_id = p.id and pc.unit_cost > 0)),
    'courier_cost_set', (select courier_cost_inside > 0 or courier_cost_outside > 0 from settings where id = 1)
  ) into result;
  return result;
end $$;

revoke execute on function public.profit_report(date, date) from public, anon;
grant execute on function public.profit_report(date, date) to authenticated;
