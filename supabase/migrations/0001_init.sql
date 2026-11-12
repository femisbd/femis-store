-- =====================================================================
-- FEMIS store database, part 1
-- Run once in Supabase: SQL Editor -> New query -> paste all -> Run.
-- Safe design: customers can only read products and settings, place an
-- order through place_order(), and check a status through track_order().
-- Everything else is visible only to logged-in staff.
-- =====================================================================

-- ---------- Types ----------
create type public.staff_role as enum ('owner', 'orders', 'packing');
create type public.order_status as enum (
  'pending',    -- placed on the website, not yet confirmed by phone
  'confirmed',  -- confirmed by phone (and advance verified, if any)
  'packed',
  'shipped',    -- handed to the courier
  'delivered',
  'returned',
  'cancelled'
);

-- ---------- Store settings (one row) ----------
create table public.settings (
  id int primary key default 1 check (id = 1),
  delivery_inside int not null default 80 check (delivery_inside >= 0),
  delivery_outside int not null default 150 check (delivery_outside >= 0),
  free_delivery_over int not null default 3000 check (free_delivery_over >= 0),
  addon_name text not null default 'Gift box',
  addon_price int not null default 200 check (addon_price >= 0),
  bkash_number text not null default '',
  whatsapp_number text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------- Catalogue ----------
create table public.categories (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  grp text not null check (grp in ('clutches', 'purses', 'shoes')),
  sort int not null default 0
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  category_slug text not null references public.categories (slug) on update cascade,
  price int not null check (price > 0),
  colours text[] not null default '{}',
  sizes text[] not null default '{}',          -- empty = no size choice (bags)
  images text[] not null default '{}',
  details text not null default '',
  stock int not null default 0 check (stock >= 0), -- ignored for pre-order products
  is_preorder boolean not null default false,
  preorder_ship_days text,                      -- e.g. '15–20'
  preorder_advance int not null default 0 check (preorder_advance >= 0), -- 0 = no advance
  pairs_with text,                              -- slug for "Complete the look"
  bestseller boolean not null default false,
  active boolean not null default true,         -- false = hidden from the website
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (preorder_advance <= price)
);
create index products_category_idx on public.products (category_slug) where active;

-- Product costs live in their own table so only the owner can ever see them (for profit and loss).
create table public.product_costs (
  product_id uuid primary key references public.products (id) on delete cascade,
  unit_cost int not null default 0 check (unit_cost >= 0),
  packaging_cost int not null default 0 check (packaging_cost >= 0),
  updated_at timestamptz not null default now()
);

-- ---------- Staff ----------
-- A staff member is a Supabase Auth user with a row here.
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role public.staff_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.my_role()
returns public.staff_role
language sql stable security definer set search_path = public
as $$ select role from public.staff where user_id = auth.uid() and active $$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.staff where user_id = auth.uid() and active) $$;

-- ---------- Customers and orders ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^01[3-9][0-9]{8}$'),
  name text not null,
  address text not null,
  area text not null check (area in ('inside', 'outside')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.order_no_seq start 10001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default ('FM' || nextval('public.order_no_seq')),
  customer_id uuid not null references public.customers (id),
  name text not null,
  phone text not null,
  address text not null,
  area text not null check (area in ('inside', 'outside')),
  status public.order_status not null default 'pending',
  has_preorder boolean not null default false,
  subtotal int not null,
  addon int not null default 0,
  delivery int not null,
  total int not null,
  advance int not null default 0,        -- due by bKash before shipping
  on_delivery int not null,              -- cash collected by the courier
  bkash_trx text,
  advance_verified boolean not null default false,
  note text not null default '',
  staff_note text not null default '',
  courier text,                          -- 'steadfast'
  courier_consignment_id text,
  courier_tracking_code text,
  tracking jsonb not null default '{}',  -- ad attribution data for server-side events
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total = subtotal + addon + delivery),
  check (on_delivery = total - advance)
);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_phone_idx on public.orders (phone, created_at desc);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  slug text not null,
  name text not null,
  colour text not null,
  size text,
  qty int not null check (qty between 1 and 20),
  unit_price int not null,
  is_preorder boolean not null,
  line_total int not null
);
create index order_items_order_idx on public.order_items (order_id);

-- Every status change is logged; the tracking page reads this timeline.
create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.order_status not null,
  note text not null default '',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------- updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger t_settings before update on public.settings for each row execute function public.touch_updated_at();
create trigger t_products before update on public.products for each row execute function public.touch_updated_at();
create trigger t_costs before update on public.product_costs for each row execute function public.touch_updated_at();
create trigger t_customers before update on public.customers for each row execute function public.touch_updated_at();
create trigger t_orders before update on public.orders for each row execute function public.touch_updated_at();

-- =====================================================================
-- Security rules (Row Level Security)
-- =====================================================================
alter table public.settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.staff enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;

-- Visitors: read settings, categories and active products only.
create policy settings_read on public.settings for select to anon, authenticated using (true);
create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy products_read on public.products for select to anon, authenticated using (active or public.is_staff());

-- Owner manages catalogue, costs, settings and staff.
create policy settings_owner on public.settings for update to authenticated using (public.my_role() = 'owner') with check (public.my_role() = 'owner');
create policy categories_owner on public.categories for all to authenticated using (public.my_role() = 'owner') with check (public.my_role() = 'owner');
create policy products_owner on public.products for all to authenticated using (public.my_role() = 'owner') with check (public.my_role() = 'owner');
create policy costs_owner on public.product_costs for all to authenticated using (public.my_role() = 'owner') with check (public.my_role() = 'owner');
create policy staff_self on public.staff for select to authenticated using (user_id = auth.uid() or public.my_role() = 'owner');
create policy staff_owner on public.staff for all to authenticated using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

-- Staff read customers and orders. Owner and order staff edit them.
create policy customers_staff on public.customers for select to authenticated using (public.is_staff());
create policy customers_edit on public.customers for update to authenticated using (public.my_role() in ('owner', 'orders')) with check (public.my_role() in ('owner', 'orders'));
create policy orders_staff on public.orders for select to authenticated using (public.is_staff());
create policy orders_edit on public.orders for update to authenticated using (public.my_role() in ('owner', 'orders')) with check (public.my_role() in ('owner', 'orders'));
create policy items_staff on public.order_items for select to authenticated using (public.is_staff());
create policy events_staff on public.order_events for select to authenticated using (public.is_staff());

-- Visitors get no direct table access beyond reading the catalogue.
revoke all on public.product_costs, public.staff, public.customers, public.orders, public.order_items, public.order_events from anon;
revoke insert, update, delete on public.settings, public.categories, public.products from anon;
revoke all on sequence public.order_no_seq from anon, authenticated;

-- =====================================================================
-- place_order: the only way a visitor can create an order.
-- Prices, delivery, add-on and advance are calculated here from the
-- database, never taken from the browser. Nothing is written unless
-- every check passes.
-- =====================================================================
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
  v_addon := case when v_addon_on then s.addon_price else 0 end;
  v_delivery := case when v_subtotal >= s.free_delivery_over then 0 when v_area = 'inside' then s.delivery_inside else s.delivery_outside end;
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

  insert into public.order_events (order_id, status) values (v_order.id, 'pending');

  return jsonb_build_object('ok', true, 'order', jsonb_build_object(
    'id', v_order.order_no, 'created_at', v_order.created_at,
    'totals', jsonb_build_object('subtotal', v_subtotal, 'addOn', v_addon, 'delivery', v_delivery, 'total', v_total,
                                 'advance', v_advance, 'onDelivery', v_total - v_advance)));
end $$;

-- =====================================================================
-- track_order: look up by order number (FM10001) or mobile number.
-- Returns status only, never the name or address.
-- =====================================================================
create or replace function public.track_order(q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := upper(regexp_replace(coalesce(q, ''), '[\s-]', '', 'g'));
  o public.orders;
begin
  if v_q ~ '^FM[0-9]+$' then
    select * into o from public.orders where order_no = v_q;
  elsif v_q ~ '^01[3-9][0-9]{8}$' then
    select * into o from public.orders where phone = v_q order by created_at desc limit 1;
  else
    return jsonb_build_object('found', false);
  end if;
  if not found then return jsonb_build_object('found', false); end if;

  return jsonb_build_object(
    'found', true,
    'orderId', o.order_no,
    'status', o.status,
    'placedAt', o.created_at,
    'hasPreorder', o.has_preorder,
    'courierCode', o.courier_tracking_code,
    'events', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'at', e.created_at) order by e.created_at)
                        from public.order_events e where e.order_id = o.id), '[]'::jsonb));
end $$;

-- =====================================================================
-- set_order_status: staff move an order along, with role rules.
-- Packing staff may only mark confirmed orders as packed.
-- =====================================================================
create or replace function public.set_order_status(p_order_no text, p_status public.order_status, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.staff_role := public.my_role();
  o public.orders;
begin
  if r is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into o from public.orders where order_no = p_order_no for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Order not found'); end if;
  if r = 'packing' and not (o.status = 'confirmed' and p_status = 'packed') then
    raise exception 'Packing staff can only mark confirmed orders as packed' using errcode = '42501';
  end if;
  if p_status = 'confirmed' and o.advance > 0 and not o.advance_verified then
    return jsonb_build_object('ok', false, 'error', 'Verify the bKash advance before confirming');
  end if;

  -- Put stock back when an in-stock order is cancelled or returned.
  if p_status in ('cancelled', 'returned') and o.status not in ('cancelled', 'returned') then
    update public.products pr set stock = pr.stock + x.qty
    from (select product_id, sum(qty) qty from public.order_items where order_id = o.id and not is_preorder group by product_id) x
    where pr.id = x.product_id;
  end if;

  update public.orders set status = p_status where id = o.id;
  insert into public.order_events (order_id, status, note, created_by) values (o.id, p_status, coalesce(p_note, ''), auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- Function permissions: visitors may call only place_order and track_order.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to anon, authenticated;
grant execute on function public.track_order(text) to anon, authenticated;
grant execute on function public.set_order_status(text, public.order_status, text) to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.is_staff() to anon, authenticated;

-- Categories (fixed list; names can be edited later in the admin panel)
insert into public.categories (slug, name, grp, sort) values
  ('party-clutch', 'Party Clutch', 'clutches', 1),
  ('bridal-clutch', 'Bridal Clutch', 'clutches', 2),
  ('embroidery-clutch', 'Embroidery Clutch', 'clutches', 3),
  ('purse', 'Purse', 'purses', 4),
  ('heels', 'Heels', 'shoes', 5),
  ('slippers', 'Slippers', 'shoes', 6),
  ('sneakers', 'Sneakers', 'shoes', 7);
