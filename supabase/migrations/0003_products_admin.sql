-- =====================================================================
-- FEMIS store database, part 3: product editing and product photos
-- Run once in Supabase SQL Editor, after 0002_admin.sql.
-- =====================================================================

-- Public photo storage for product images ("products" bucket).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

-- Only the owner can upload, replace or delete product photos. Anyone can view them.
create policy "Owner uploads product photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'products' and public.my_role() = 'owner');
create policy "Owner updates product photos" on storage.objects
  for update to authenticated using (bucket_id = 'products' and public.my_role() = 'owner');
create policy "Owner deletes product photos" on storage.objects
  for delete to authenticated using (bucket_id = 'products' and public.my_role() = 'owner');

-- A product can only "pair with" a product that exists.
alter table public.products
  add constraint products_pairs_with_fk foreign key (pairs_with) references public.products (slug) on update cascade on delete set null;

-- Keep pre-order fields consistent.
alter table public.products
  add constraint products_preorder_days check (not is_preorder or coalesce(btrim(preorder_ship_days), '') <> '');
