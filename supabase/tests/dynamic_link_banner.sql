-- Jalankan sesudah semua migrasi. Data uji dibatalkan di akhir.
begin;

insert into auth.users(id, email) values
  ('f2710000-0000-4000-8000-000000000001', 'banner-a@example.com'),
  ('f2710000-0000-4000-8000-000000000002', 'banner-b@example.com');
insert into kos(id, name, owner_id, plan, paid_until, setup_status, business_type) values
  ('f2710000-0000-4000-8000-00000000000a', 'Bisnis A', 'f2710000-0000-4000-8000-000000000001', 'pro', current_date + 30, 'active', 'retail'),
  ('f2710000-0000-4000-8000-00000000000b', 'Bisnis B', 'f2710000-0000-4000-8000-000000000002', 'pro', current_date + 30, 'active', 'retail');
insert into kos_members(kos_id, user_id, role)
select id, owner_id, 'pemilik' from kos where id::text like 'f2710000-%'
on conflict do nothing;
insert into business_modules(kos_id, module_code, active)
select id, code, true from kos cross join unnest(array['u_halaman', 'u_crm', 'u_penawaran']) code where id::text like 'f2710000-%'
on conflict (kos_id, module_code) do update set active = true;
insert into public_pages(kos_id, slug, enabled, catalog_mode, show_prices) values
  ('f2710000-0000-4000-8000-00000000000a', 'banner-uji-a', true, 'favorit', true),
  ('f2710000-0000-4000-8000-00000000000b', 'banner-uji-b', false, 'semua', true);

do $$
declare
  a constant uuid := 'f2710000-0000-4000-8000-00000000000a';
  b constant uuid := 'f2710000-0000-4000-8000-00000000000b';
  settings constant jsonb := '{"mode":"auto","enabled":true,"color":"#16A34A","title":"Tautan A"}';
  units constant jsonb := '[{"name":"pcs","qty":1,"price_retail":3200}]';
  product_a uuid; hidden_a uuid; product_b uuid; contact_a uuid; token_a text;
  cover_a uuid := gen_random_uuid(); photo_a uuid := gen_random_uuid(); photo_b uuid := gen_random_uuid();
  preview jsonb; published jsonb;
begin
  perform set_config('request.jwt.claim.sub', 'f2710000-0000-4000-8000-000000000002', true);
  product_b := product_save(b, null, 'Produk privat B', 'pcs', 1000, 0, units, 25, null);
  perform set_config('request.jwt.claim.sub', 'f2710000-0000-4000-8000-000000000001', true);
  product_a := product_save(a, null, 'Produk A', 'pcs', 1000, 0, units, 25, null);
  hidden_a := product_save(a, null, 'Produk tersembunyi A', 'pcs', 1000, 0, units, 25, null);
  update products set favorite = true where id = product_a;
  insert into contacts(kos_id, kind, name, phone) values (a, 'pelanggan', 'Nama Pelanggan Privat', '081234567890') returning id into contact_a;
  token_a := cportal_link(contact_a)->>'token';
  insert into media(id, kos_id, category, path, thumb_path, size, uploaded_at) values
    (cover_a, a, 'cover', a || '/cover.jpg', a || '/cover_t.jpg', 100, now()),
    (photo_a, a, 'produk', a || '/produk.jpg', a || '/produk_t.jpg', 100, now()),
    (photo_b, b, 'produk', b || '/produk.jpg', b || '/produk_t.jpg', 100, now());
  insert into media_links(kos_id, media_id, entity, entity_id) values
    (a, cover_a, 'kos_cover', null), (a, photo_a, 'product', product_a), (b, photo_b, 'product', product_b);

  assert link_banner_config(b) is null and link_banner_preview(b, 'beranda') is null, 'Draf tenant lain privat';
  begin
    perform link_banner_save(b, settings);
    raise exception 'Penulisan lintas tenant lolos';
  exception when raise_exception then
    if sqlerrm <> 'Akses pengaturan bisnis ditolak' then raise; end if;
  end;
  begin
    perform link_banner_save(a, settings || '{"mode":"custom"}');
    raise exception 'Mode custom tanpa gambar lolos';
  exception when raise_exception then
    if sqlerrm <> 'Unggah banner custom terlebih dahulu' then raise; end if;
  end;

  preview := link_banner_preview(a, 'produk');
  assert preview->>'itemTitle' = 'Produk A' and preview #>> '{photos,0,path}' = a || '/produk.jpg';
  assert preview #>> '{photos,1,path}' = a || '/cover.jpg';
  assert link_banner_public('b', 'banner-uji-b', 'beranda', null) is null, 'Halaman draf tidak terekspos';
  assert link_banner_public('b', 'banner-uji-a', 'produk', hidden_a::text) is null, 'Produk nonpublik tidak terekspos';
  assert link_banner_public('b', 'banner-uji-a', 'produk', product_b::text) is null, 'Produk lintas tenant tidak terekspos';
  assert link_banner_public('b', 'banner-uji-a', 'produk', product_a::text) #>> '{photos,0,path}' = a || '/produk.jpg';
  assert link_banner_public('b', 'banner-uji-a', 'beranda', null) #>> '{photos,0,path}' = a || '/cover.jpg';
  assert not has_function_privilege('anon', 'link_banner_public(text,text,text,text)', 'execute');
  assert not has_function_privilege('authenticated', 'link_banner_snapshot(uuid,text,text,boolean)', 'execute');

  perform link_banner_save(a, settings);
  published := link_banner_public('c', token_a, 'faktur', null);
  assert published->>'title' = 'Tautan A' and published->>'logo' is null;
  assert position('Nama Pelanggan Privat' in published::text) = 0 and position(token_a in published::text) = 0;
  update kos set name = 'Nama baru A' where id = a;
  assert link_banner_public('b', 'banner-uji-a', 'beranda', null)->>'name' = 'Nama baru A', 'Identitas dibaca ulang';
  perform link_banner_save(a, settings || '{"enabled":false}');
  assert link_banner_public('b', 'banner-uji-a', 'beranda', null)->>'enabled' = 'false';
  update public_pages set enabled = false where kos_id = a;
  assert link_banner_public('b', 'banner-uji-a', 'beranda', null) is null;
  update contacts set portal_token = null where id = contact_a;
  assert link_banner_public('c', token_a, 'portal', null) is null, 'Token yang dicabut tidak memuat gambar';
end $$;

rollback;
