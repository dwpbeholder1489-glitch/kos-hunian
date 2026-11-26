-- Jalankan sesudah semua migrasi di database uji. Perubahan dibatalkan di akhir.
begin;

insert into auth.users(id, email) values
  ('f2600000-0000-4000-8000-000000000001', 'portal-shop-a@example.com'),
  ('f2600000-0000-4000-8000-000000000002', 'portal-shop-b@example.com');
insert into kos(id, name, owner_id, plan, paid_until, setup_status, business_type) values
  ('f2600000-0000-4000-8000-00000000000a', 'Toko Uji Portal', 'f2600000-0000-4000-8000-000000000001', 'pro', current_date + 30, 'active', 'retail'),
  ('f2600000-0000-4000-8000-00000000000b', 'Toko Uji Lain', 'f2600000-0000-4000-8000-000000000002', 'pro', current_date + 30, 'active', 'retail');
insert into kos_members(kos_id, user_id, role)
select id, owner_id, 'pemilik' from kos where id::text like 'f2600000-%'
on conflict do nothing;
insert into business_modules(kos_id, module_code, active)
select id, code, true from kos cross join unnest(array['u_halaman', 'u_crm', 'u_penawaran']) code where id::text like 'f2600000-%'
on conflict (kos_id, module_code) do update set active = true;
insert into public_pages(kos_id, slug, enabled, catalog_mode, show_prices) values
  ('f2600000-0000-4000-8000-00000000000a', 'portal-shop-uji-a', true, 'favorit', true),
  ('f2600000-0000-4000-8000-00000000000b', 'portal-shop-uji-b', true, 'semua', true);

do $$
declare
  a constant uuid := 'f2600000-0000-4000-8000-00000000000a';
  b constant uuid := 'f2600000-0000-4000-8000-00000000000b';
  owner_a constant text := 'f2600000-0000-4000-8000-000000000001';
  owner_b constant text := 'f2600000-0000-4000-8000-000000000002';
  slug constant text := 'portal-shop-uji-a';
  guest constant text := repeat('a', 64);
  device constant text := repeat('b', 64);
  guest_id uuid := gen_random_uuid();
  private_id uuid := gen_random_uuid();
  pr uuid; pr_hidden uuid; pr_other uuid; contact uuid; private_token text; sl uuid; delivery uuid := gen_random_uuid();
  units constant jsonb := '[{"name":"pcs","qty":1,"price_retail":3200,"price_wholesale":3000},{"name":"pak","qty":10,"price_retail":31000,"price_wholesale":29000}]';
  lines jsonb; payload jsonb; result jsonb; catalog jsonb; before_contacts bigint;
begin
  perform set_config('request.jwt.claim.sub', owner_a, true);
  pr := product_save(a, null, 'Barang uji', 'pcs', 1000, 0, units, 25, null);
  pr_hidden := product_save(a, null, 'Barang tersembunyi uji', 'pcs', 1000, 0, units, 25, null);
  update products set favorite = true where id = pr;
  perform product_save_for_portal(a, pr, 'Barang uji', 'pcs', 1000, 0, units, 0, null, null, '{}', 'Deskripsi uji', 'Komposisi uji');
  perform price_breaks_set(pr, 'pcs', '[{"min_qty":5,"price":3100,"tier":"ecer"}]');
  insert into contacts(kos_id, kind, name, phone) values (a, 'pelanggan', 'Pelanggan privat uji', '081234567890') returning id into contact;
  private_token := cportal_link(contact)->>'token';
  perform set_config('request.jwt.claim.sub', owner_b, true);
  pr_other := product_save(b, null, 'Barang toko lain uji', 'pcs', 1000, 0, units, 25, null);
  perform set_config('request.jwt.claim.sub', '', true);
  assert not has_function_privilege('anon', 'portal_shop_order(text,text,text,jsonb)', 'execute');
  assert not has_function_privilege('anon', 'portal_shop_orders(text,text)', 'execute');
  assert not has_function_privilege('authenticated', 'portal_write_order(contacts,jsonb,public_pages,text)', 'execute');

  catalog := portal_shop_catalog(slug);
  assert jsonb_array_length(catalog->'items') = 1 and catalog #>> '{items,0,id}' = pr::text, 'Katalog favorit terisolasi';
  assert catalog #>> '{items,0,description}' = 'Deskripsi uji' and catalog #>> '{items,0,composition}' = 'Komposisi uji', 'Detail yang diisi pemilik tampil';
  assert catalog #>> '{items,0,units,0,price}' = '3200.00', 'Harga eceran';
  assert catalog #>> '{items,0,units,1,available}' = 'true', 'Ketersediaan kemasan';
  assert (cportal_get(private_token) #>> '{catalog,0,units,0,price}')::numeric = 3000, 'Harga toko grosir tetap privat';

  lines := jsonb_build_array(jsonb_build_object('product_id', pr, 'unit', 'pcs', 'qty', 5, 'price', 1));
  payload := jsonb_build_object('id', guest_id, 'name', 'Pelanggan publik uji', 'phone', '081234567890',
    'consent', true, 'fulfillment', 'antar', 'ship_address', 'Jalan Uji Nomor 1', 'payment', 'tunai', 'lines', lines);
  select count(*) into before_contacts from contacts where kos_id = a;
  result := portal_shop_order(slug, guest, device, payload || jsonb_build_object('payment', 'qris'));
  assert result->>'ok' = 'false', 'Metode tanpa konfigurasi ditolak';
  result := portal_shop_order(slug, guest, device, payload || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('product_id', pr_hidden, 'unit', 'pcs', 'qty', 1))));
  assert result->>'ok' = 'false', 'Barang tidak terbit ditolak';
  result := portal_shop_order(slug, guest, device, payload || jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('product_id', pr_other, 'unit', 'pcs', 'qty', 1))));
  assert result->>'ok' = 'false', 'Barang tenant lain ditolak';
  result := portal_shop_order(slug, guest, device, payload || jsonb_build_object('lines',
    jsonb_build_array(jsonb_build_object('product_id', pr, 'unit', 'pak', 'qty', 2), jsonb_build_object('product_id', pr, 'unit', 'pcs', 'qty', 6))));
  assert result->>'ok' = 'false', 'Stok dicek lintas satuan';
  result := portal_shop_order(slug, guest, device, payload || jsonb_build_object('lines',
    lines || jsonb_build_array(jsonb_build_object('product_id', pr, 'unit', 'pcs', 'qty', '-1'))));
  assert result->>'ok' = 'false', 'Baris jumlah tidak valid ditolak meski satuan yang sama juga memiliki baris valid';
  assert (select count(*) from contacts where kos_id = a) = before_contacts, 'Tamu gagal tidak meninggalkan kontak';
  result := portal_shop_order(slug, guest, device, payload);
  assert result->>'ok' = 'true' and (result->>'total')::numeric = 15500, 'Harga klien diabaikan; harga jumlah server berlaku';
  assert (select contact_id <> contact and status = 'penawaran' and portal_payment = 'tunai' from so_orders where id = guest_id), 'Pesanan privat dan publik dipisahkan';
  assert (portal_shop_order(slug, guest, device, payload)->>'duplicate')::boolean, 'Kirim ulang idempoten';
  assert portal_shop_order(slug, repeat('c',64), device, payload)->>'ok' = 'false', 'ID pesanan tidak memberi akses lintas tamu';
  assert portal_shop_orders(slug, repeat('c',64)) = '[]'::jsonb, 'Tamu berbeda tidak melihat pesanan';
  assert portal_shop_orders('portal-shop-uji-b', guest) = '[]'::jsonb, 'Toko berbeda tidak melihat pesanan';
  assert jsonb_array_length(cportal_get(private_token)->'orders') = 0, 'Nomor WA sama tidak menghubungkan riwayat';
  result := cportal_order(private_token, jsonb_build_object('id', private_id, 'lines', lines, 'kind', 'penawaran'));
  assert result->>'ok' = 'true' and (result->>'total')::numeric = 15000, 'Link grosir lama tetap bisa pesan';
  assert jsonb_array_length(portal_shop_orders(slug, guest)) = 1, 'Riwayat tamu tidak memuat pesanan privat';

  perform set_config('request.jwt.claim.sub', owner_a, true);
  perform so_confirm(guest_id);
  select id into sl from so_lines where order_id = guest_id;
  result := so_deliver(delivery, guest_id, jsonb_build_object('method', 'transfer', 'lines', jsonb_build_array(jsonb_build_object('line_id', sl, 'qty', 5))));
  assert result->>'sale_id' is not null, 'Faktur dari mesin transaksi';
  assert portal_shop_orders(slug, guest) #>> '{0,deliveries,0,status}' = 'dikirim', 'Status pengiriman terbaca';
  assert not portal_shop_rate(slug, guest, guest_id, pr, 5), 'Produk belum diterima tidak dapat dinilai';
  perform so_delivery_status(delivery, 'diterima', 'Pembeli uji');
  assert portal_shop_orders(slug, guest) #>> '{0,deliveries,0,status}' = 'diterima', 'Pelacakan menerima status penjual';
  perform set_config('request.jwt.claim.sub', '', true);
  assert not portal_shop_rate(slug, repeat('c',64), guest_id, pr, 5), 'Tamu lain tidak dapat menilai';
  assert not portal_shop_rate(slug, guest, guest_id, pr_hidden, 5), 'Produk yang tidak dibeli tidak dapat dinilai';
  assert portal_shop_rate(slug, guest, guest_id, pr, 5), 'Rating dari barang yang diterima';
  assert portal_shop_rate(slug, guest, guest_id, pr, 4), 'Penilaian yang sama dapat diperbarui';
  catalog := portal_shop_catalog(slug);
  assert (catalog #>> '{items,0,rating}')::numeric = 4 and (catalog #>> '{items,0,rating_count}')::int = 1, 'Agregat publik tidak menggandakan rating';
end $$;
rollback;
