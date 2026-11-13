-- =====================================================================
-- FEMIS store database, part 7: incomplete orders, customers, coupons
-- Run once in Supabase SQL Editor, after 0006_courier_tracking.sql.
-- =====================================================================

-- ---------------- Coupons ----------------
create table public.coupons (
  code text primary key check (code ~ '^[A-Z0-9_-]{3,30}$'),
  kind text not null check (kind in ('percent', 'fixed', 'free_delivery')),
  value int not null default 0 check (value >= 0),
  max_discount int not null default 0 check (max_discount >= 0),   -- percent coupons: 0 = no cap
  min_subtotal int not null default 0 check (min_subtotal >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit int check (usage_limit is null or usage_limit > 0),  -- total uses; empty = unlimited
  per_phone_limit int not null default 1 check (per_phone_limit > 0),
  active boolean not null default true,
  note text not null default '',                                   -- e.g. which influencer it belongs to
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or (value between 1 and 90)),
  check (kind <> 'fixed' or value > 0)
);
alter table public.coupons enable row level security;
create policy coupons_owner on public.coupons for all to authenticated using (public.my_role() = 'owner') with check (public.my_role() = 'owner');
revoke all on public.coupons from anon;

alter table public.orders
  add column discount int not null default 0 check (discount >= 0),
  add column coupon_code text references public.coupons (code) on update cascade;
create index orders_coupon_idx on public.orders (coupon_code) where coupon_code is not null;

-- Totals now include the discount.
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.orders'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%subtotal + addon%' loop
    execute format('alter table public.orders drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.orders add constraint orders_total_ok check (total = subtotal + addon + delivery - discount);

-- A coupon is usable if it is active, in date, the cart is big enough, and its limits are not used up.
-- Cancelled orders don't count as a use.
create or replace function public.coupon_check(p_code text, p_subtotal int, p_phone text)
returns public.coupons
language sql stable security definer set search_path = public
as $$
  select c.* from public.coupons c
  where c.code = upper(btrim(p_code)) and c.active
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now())
    and p_subtotal >= c.min_subtotal
    and (c.usage_limit is null or (select count(*) from public.orders o where o.coupon_code = c.code and o.status <> 'cancelled') < c.usage_limit)
    and (p_phone is null or p_phone = '' or (select count(*) from public.orders o where o.coupon_code = c.code and o.phone = p_phone and o.status <> 'cancelled') < c.per_phone_limit)
$$;

-- Plain-language reason a code can't be used.
create or replace function public.coupon_problem(p_code text, p_subtotal int, p_phone text)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare c public.coupons;
begin
  select * into c from public.coupons where code = upper(btrim(p_code));
  if not found or not c.active or (c.starts_at is not null and c.starts_at > now()) then return 'This code is not valid.'; end if;
  if c.ends_at is not null and c.ends_at <= now() then return 'This code has expired.'; end if;
  if p_subtotal < c.min_subtotal then return 'This code needs an order of at least ৳' || to_char(c.min_subtotal, 'FM999,999,999') || '.'; end if;
  if c.usage_limit is not null and (select count(*) from public.orders o where o.coupon_code = c.code and o.status <> 'cancelled') >= c.usage_limit then
    return 'This code has been fully used.';
  end if;
  return 'You have already used this code.';
end $$;

-- Checkout asks this before the order is placed, to show the discount. place_order checks again.
create or replace function public.check_coupon(p_code text, p_subtotal int, p_phone text default '')
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare c public.coupons; v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g');
begin
  if length(btrim(coalesce(p_code, ''))) < 3 or length(p_code) > 30 then return jsonb_build_object('ok', false, 'message', 'This code is not valid.'); end if;
  if v_phone !~ '^01[3-9][0-9]{8}$' then v_phone := ''; end if;
  select * into c from public.coupon_check(p_code, greatest(p_subtotal, 0), v_phone);
  if c.code is null then return jsonb_build_object('ok', false, 'message', public.coupon_problem(p_code, greatest(p_subtotal, 0), v_phone)); end if;
  return jsonb_build_object('ok', true, 'code', c.code, 'kind', c.kind, 'value', c.value, 'max_discount', c.max_discount, 'min_subtotal', c.min_subtotal);
end $$;

-- Owner's coupon results: uses, discount given, and sales from delivered orders.
create or replace function public.coupons_report()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if public.my_role() is distinct from 'owner' then raise exception 'Not allowed' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x)) from (
      select c.code,
        count(o.id) filter (where o.status <> 'cancelled')::int as uses,
        count(o.id) filter (where o.status = 'delivered')::int as delivered,
        coalesce(sum(o.discount) filter (where o.status = 'delivered'), 0)::int as discount_given,
        coalesce(sum(o.total) filter (where o.status = 'delivered'), 0)::int as delivered_sales
      from public.coupons c left join public.orders o on o.coupon_code = c.code
      group by c.code) x), '[]'::jsonb);
end $$;

-- ---------------- Customers ----------------
alter table public.customers add column blocked boolean not null default false;
grant update (blocked) on public.customers to authenticated;

create or replace function public.customers_report(p_search text default '', p_sort text default 'recent', p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_q text := btrim(coalesce(p_search, '')); result jsonb;
begin
  if public.my_role() not in ('owner', 'orders') then raise exception 'Not allowed' using errcode = '42501'; end if;
  with agg as (
    select cu.phone, cu.name, cu.address, cu.area, cu.blocked,
      count(o.id)::int as orders,
      count(o.id) filter (where o.status = 'delivered')::int as delivered,
      count(o.id) filter (where o.status = 'returned')::int as returned,
      count(o.id) filter (where o.status = 'cancelled')::int as cancelled,
      coalesce(sum(o.total) filter (where o.status = 'delivered'), 0)::int as spent,
      max(o.created_at) as last_order_at,
      min(o.created_at) as first_order_at
    from public.customers cu left join public.orders o on o.customer_id = cu.id
    where v_q = '' or cu.phone like '%' || regexp_replace(v_q, '[^0-9]', '', 'g') || '%' and regexp_replace(v_q, '[^0-9]', '', 'g') <> ''
          or cu.name ilike '%' || v_q || '%'
    group by cu.id
  )
  select jsonb_build_object(
    'total', (select count(*) from agg),
    'rows', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from agg
      order by case when p_sort = 'spent' then spent end desc nulls last,
               case when p_sort = 'orders' then orders end desc nulls last,
               last_order_at desc nulls last
      limit least(greatest(p_limit, 1), 5000) offset greatest(p_offset, 0)) x), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- ---------------- Incomplete orders ----------------
create table public.checkout_drafts (
  id uuid primary key,                          -- made by the visitor's browser, one per checkout
  phone text not null check (phone ~ '^01[3-9][0-9]{8}$'),
  name text not null default '',
  address text not null default '',
  area text check (area in ('inside', 'outside')),
  lines jsonb not null default '[]',
  subtotal int not null default 0,
  converted_order text,                         -- set when this visitor later places an order
  status text not null default 'new' check (status in ('new', 'called', 'no_answer', 'not_interested')),
  staff_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checkout_drafts_open_idx on public.checkout_drafts (updated_at desc) where converted_order is null;
create index checkout_drafts_phone_idx on public.checkout_drafts (phone);
alter table public.checkout_drafts enable row level security;
create policy drafts_staff on public.checkout_drafts for select to authenticated using (public.my_role() in ('owner', 'orders'));
create policy drafts_edit on public.checkout_drafts for update to authenticated using (public.my_role() in ('owner', 'orders')) with check (public.my_role() in ('owner', 'orders'));
revoke all on public.checkout_drafts from anon;
revoke update on public.checkout_drafts from authenticated;
grant update (status, staff_note) on public.checkout_drafts to authenticated;

-- Saves what a visitor has typed at checkout once the phone number is valid. Prices come from the database.
create or replace function public.save_checkout_draft(p jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[\s-]', '', 'g');
  v_lines jsonb;
  v_subtotal int;
begin
  begin
    v_id := (p->>'id')::uuid;
  exception when others then
    return false;
  end;
  if v_id is null or v_phone !~ '^01[3-9][0-9]{8}$' then return false; end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 or jsonb_array_length(p->'lines') > 30 then return false; end if;
  -- Already ordered in the last 30 minutes: nothing to follow up.
  if exists (select 1 from public.orders where phone = v_phone and created_at > now() - interval '30 minutes') then return false; end if;
  -- Spam guard: at most 5 open drafts per number per day.
  if (select count(*) from public.checkout_drafts where phone = v_phone and id <> v_id and created_at > now() - interval '1 day') >= 5 then return false; end if;

  select coalesce(jsonb_agg(jsonb_build_object('slug', pr.slug, 'name', pr.name, 'colour', left(l->>'colour', 40),
           'size', left(l->>'size', 10), 'qty', least(greatest(coalesce((l->>'qty')::int, 1), 1), 20), 'price', pr.price)), '[]'::jsonb),
         coalesce(sum(pr.price * least(greatest(coalesce((l->>'qty')::int, 1), 1), 20)), 0)::int
    into v_lines, v_subtotal
  from jsonb_array_elements(p->'lines') l join public.products pr on pr.slug = l->>'slug' and pr.active;
  if v_subtotal = 0 then return false; end if;

  insert into public.checkout_drafts as d (id, phone, name, address, area, lines, subtotal)
  values (v_id, v_phone, left(btrim(coalesce(p->>'name', '')), 80), left(btrim(coalesce(p->>'address', '')), 300),
          case when p->>'area' in ('inside', 'outside') then p->>'area' end, v_lines, v_subtotal)
  on conflict (id) do update
    set phone = excluded.phone, name = excluded.name, address = excluded.address, area = excluded.area,
        lines = excluded.lines, subtotal = excluded.subtotal, updated_at = now()
    where d.converted_order is null;
  return true;
end $$;

-- place_order again: coupons, blocked numbers, and closing unfinished checkouts.
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
  v_code text := upper(btrim(coalesce(p->>'coupon', '')));
  c public.coupons;
  v_discount int := 0;
  v_free_ship boolean := false;
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

  -- Numbers blocked by staff (repeated fake orders) cannot order on the website.
  if v_phone ~ '^01[3-9][0-9]{8}$' and exists (select 1 from public.customers where phone = v_phone and blocked) then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_object('form', 'We could not place this order online. Please message us on WhatsApp and we will help you.'));
  end if;

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

  -- Coupon
  if v_code <> '' and errors = '{}'::jsonb then
    select * into c from public.coupon_check(v_code, v_subtotal, v_phone);
    if c.code is null then
      errors := errors || jsonb_build_object('coupon', public.coupon_problem(v_code, v_subtotal, v_phone));
    end if;
  end if;

  if errors <> '{}'::jsonb then
    return jsonb_build_object('ok', false, 'errors', errors);
  end if;

  -- Totals
  v_addon := case when v_addon_on and s.addon_enabled then s.addon_price else 0 end;
  if c.code is not null then
    v_discount := case c.kind when 'percent' then floor(v_subtotal * c.value / 100.0)::int when 'fixed' then c.value else 0 end;
    if c.kind = 'percent' and c.max_discount > 0 then v_discount := least(v_discount, c.max_discount); end if;
    v_discount := least(v_discount, v_subtotal);
    v_free_ship := c.kind = 'free_delivery';
  end if;
  -- Free delivery is judged on what the customer pays for products, after any discount.
  v_delivery := case when v_free_ship then 0
                     when s.free_delivery_over > 0 and v_subtotal - v_discount >= s.free_delivery_over then 0
                     when v_area = 'inside' then s.delivery_inside else s.delivery_outside end;
  -- Never let a discount push the total below the advance already paid by bKash.
  v_discount := least(v_discount, v_subtotal + v_addon + v_delivery - v_advance);
  v_total := v_subtotal + v_addon + v_delivery - v_discount;

  -- Save: customer, order, items, stock, first event
  insert into public.customers (phone, name, address, area) values (v_phone, v_name, v_address, v_area)
  on conflict (phone) do update set name = excluded.name, address = excluded.address, area = excluded.area
  returning id into v_customer;

  insert into public.orders (customer_id, name, phone, address, area, has_preorder, subtotal, addon, delivery, discount, coupon_code, total, advance, on_delivery, bkash_trx, note, tracking)
  values (v_customer, v_name, v_phone, v_address, v_area, v_has_pre, v_subtotal, v_addon, v_delivery, v_discount, c.code, v_total, v_advance, v_total - v_advance,
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

  -- This visitor finished, so their unfinished checkouts no longer need a call.
  update public.checkout_drafts set converted_order = v_order.order_no
   where phone = v_phone and converted_order is null and updated_at > now() - interval '14 days';

  return jsonb_build_object('ok', true, 'order', jsonb_build_object(
    'id', v_order.order_no, 'created_at', v_order.created_at,
    'totals', jsonb_build_object('subtotal', v_subtotal, 'addOn', v_addon, 'delivery', v_delivery, 'discount', v_discount, 'total', v_total,
                                 'advance', v_advance, 'onDelivery', v_total - v_advance)));
end $$;

revoke execute on function public.coupon_check(text, int, text) from public, anon, authenticated;
revoke execute on function public.coupon_problem(text, int, text) from public, anon, authenticated;
revoke execute on function public.check_coupon(text, int, text) from public;
revoke execute on function public.coupons_report() from public, anon;
revoke execute on function public.customers_report(text, text, int, int) from public, anon;
revoke execute on function public.save_checkout_draft(jsonb) from public;
grant execute on function public.check_coupon(text, int, text) to anon, authenticated;
grant execute on function public.save_checkout_draft(jsonb) to anon, authenticated;
grant execute on function public.coupons_report() to authenticated;
grant execute on function public.customers_report(text, text, int, int) to authenticated;
