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
  lead_id uuid := gen_random_uuid();
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
  assert jsonb_array_length(retail_portal_inbox(a)) = 2, 'Pesanan dan penawaran menunggu tampil';
  assert retail_portal_inbox(b) = '[]'::jsonb, 'Pemberitahuan dibatasi akses bisnis';
  perform so_mark_reviewed(guest_id);
  assert jsonb_array_length(retail_portal_inbox(a)) = 2, 'Dibaca tetap menunggu';
  perform so_cancel(private_id, 'Batal uji pemberitahuan');
  assert jsonb_array_length(retail_portal_inbox(a)) = 1, 'Pesanan dibatalkan keluar dari antrean';
  perform so_confirm(guest_id);
  assert retail_portal_inbox(a) = '[]'::jsonb, 'Pesanan dikonfirmasi keluar dari antrean';
  insert into crm_leads(id, kos_id, name, source) values (lead_id, a, 'Permintaan portal uji', 'halaman');
  assert retail_portal_inbox(a) #>> '{0,target}' = 'lead', 'Permintaan dari formulir portal mengarah ke prospek';
  update crm_leads set stage = 'batal' where id = lead_id;
  assert retail_portal_inbox(a) = '[]'::jsonb, 'Permintaan yang dibatalkan keluar dari antrean';
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

  -- Pengajuan publik tanpa memilih katalog, revisi dan persetujuan tamu.
  declare
    quote_id uuid := gen_random_uuid();
    revision uuid;
    latest uuid;
  begin
    update public_pages set show_prices = false where kos_id = a;
    assert portal_quote_catalog(slug) is not null and portal_shop_catalog(slug) is null, 'Penawaran terpisah dari sakelar harga/checkout';
    assert portal_quote_catalog(slug) #>> '{0,id}' = pr::text and portal_quote_catalog(slug) #> '{0,units,0,price}' is null;
    payload := jsonb_build_object('id', quote_id, 'kind', 'penawaran', 'name', 'Pelanggan publik uji', 'phone', '081234567890',
      'consent', false, 'manual', 'Minta lima kemasan', 'purpose', 'Warung / Toko', 'lines', '[]'::jsonb);
    assert portal_shop_order(slug, guest, device, payload)->>'ok' = 'false', 'Persetujuan wajib';
    payload := payload || '{"consent":true}';
    assert portal_shop_order(slug, guest, device, payload || '{"attachment":"forged"}')->>'ok' = 'false';
    payload := payload || jsonb_build_object('attachment', slug || '/' || guest || '/' || quote_id::text || '/' || repeat('d', 64),
      'filename', 'daftar-pelanggan.pdf');
    assert portal_shop_order(slug, guest, device, payload)->>'ok' = 'true', 'Daftar manual tanpa barang harus masuk ke modul penawaran';
    assert portal_shop_order(slug, guest, device, payload)->>'duplicate' = 'true', 'Pengajuan ulang tidak membuat baris ganda';
    assert (select quote_manual = 'Minta lima kemasan' and quote_purpose = 'Warung / Toko'
      and quote_consent_at is not null and quote_filename = 'daftar-pelanggan.pdf' from so_orders where id = quote_id);
    assert (select item->>'quote_filename' = 'daftar-pelanggan.pdf' and not (item ? 'quote_attachment')
      from jsonb_array_elements(portal_shop_orders(slug, guest)) item where item->>'id' = quote_id::text);
    assert not has_function_privilege('anon', 'portal_quote_approve(text,text,uuid,uuid)', 'execute');
    assert not has_function_privilege('anon', 'portal_quote_publish(uuid,text)', 'execute');
    perform set_config('request.jwt.claim.sub', owner_a, true);
    select contact_id into contact from so_orders where id = quote_id;
    lines := jsonb_build_array(jsonb_build_object('product_id', pr, 'unit', 'pcs', 'qty', 5, 'price', 3000));
    perform so_save(quote_id, a, jsonb_build_object('contact_id', contact, 'lines', lines));
    revision := portal_quote_publish(quote_id, 'Penawaran pertama');
    perform set_config('request.jwt.claim.sub', '', true);
    assert portal_quote_approve(slug, repeat('c',64), quote_id, revision)->>'ok' = 'false';
    assert portal_quote_approve('portal-shop-uji-b', guest, quote_id, revision)->>'ok' = 'false';
    assert portal_quote_counter(slug, guest, quote_id, revision, 'Bisa Rp2.900 per pcs?');
    assert portal_quote_approve(slug, guest, quote_id, revision)->>'ok' = 'false', 'Negosiasi menutup versi lama';
    perform set_config('request.jwt.claim.sub', owner_a, true);
    assert retail_portal_inbox(a) #>> '{0,kind}' = 'penawaran_negosiasi';
    latest := portal_quote_publish(quote_id, 'Penawaran kedua');
    perform so_save(quote_id, a, jsonb_build_object('contact_id', contact,
      'lines', jsonb_set(lines, '{0,price}', '2900')));
    assert portal_quote_approve(slug, guest, quote_id, latest)->>'ok' = 'false', 'Ubah harga menonaktifkan versi yang sudah dikirim';
    assert (select item->>'total' is null from jsonb_array_elements(portal_shop_orders(slug, guest)) item where item->>'id' = quote_id::text),
      'Harga draf revisi tidak tampil sebelum dikirim';
    latest := portal_quote_publish(quote_id, 'Harga revisi');
    perform set_config('request.jwt.claim.sub', '', true);
    assert portal_quote_approve(slug, guest, quote_id, latest)->>'ok' = 'true', 'Pelanggan dapat menyetujui versi yang berlaku';
    assert portal_quote_approve(slug, guest, quote_id, latest)->>'ok' = 'true', 'Persetujuan dapat diulang';
    assert (select status = 'dikonfirmasi' and total = 14500 and quote_accepted_at is not null from so_orders where id = quote_id), 'Satu baris menjadi pesanan dengan harga revisi';
    assert not exists (select 1 from so_deliveries where order_id = quote_id), 'Persetujuan tidak menerbitkan faktur atau surat jalan';
    perform set_config('request.jwt.claim.sub', owner_a, true);
    assert retail_portal_inbox(a) #>> '{0,kind}' = 'penawaran_disetujui';
  end;
end $$;
rollback;
