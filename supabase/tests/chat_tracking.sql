-- Uji Chat & Tracking pelanggan (migrasi 20261128140000). Jalankan sesudah semua migrasi; dibatalkan di akhir.
-- Lulus = "CHAT_TRACKING LULUS" tercetak dan tidak ada ERROR.
begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('f2700000-0000-4000-8000-000000000001', 'cx-a@example.com', '{"name":"Pemilik A"}'),
  ('f2700000-0000-4000-8000-000000000002', 'cx-b@example.com', '{"name":"Pemilik B"}'),
  ('f2700000-0000-4000-8000-000000000003', 'cx-kasir@example.com', '{"name":"Kasir A"}'),
  ('f2700000-0000-4000-8000-000000000004', 'cx-gudang@example.com', '{"name":"Gudang A"}'),
  ('f2700000-0000-4000-8000-000000000005', 'cx-jasa@example.com', '{"name":"Pemilik Jasa"}');
insert into kos(id, name, owner_id, plan, paid_until, setup_status, business_type, payment_info) values
  ('f2700000-0000-4000-8000-00000000000a', 'Toko Chat A', 'f2700000-0000-4000-8000-000000000001', 'pro', current_date + 30, 'active', 'retail', 'BCA 123 a.n. Toko A'),
  ('f2700000-0000-4000-8000-00000000000b', 'Toko Chat B', 'f2700000-0000-4000-8000-000000000002', 'pro', current_date + 30, 'active', 'retail', null),
  ('f2700000-0000-4000-8000-00000000000c', 'Laundry Chat', 'f2700000-0000-4000-8000-000000000005', 'pro', current_date + 30, 'active', 'jasa', null);
insert into kos_members(kos_id, user_id, role)
select id, owner_id, 'pemilik' from kos where id::text like 'f2700000-%' on conflict do nothing;
insert into kos_members(kos_id, user_id, role) values
  ('f2700000-0000-4000-8000-00000000000a', 'f2700000-0000-4000-8000-000000000003', 'kasir'),
  ('f2700000-0000-4000-8000-00000000000a', 'f2700000-0000-4000-8000-000000000004', 'gudang');
insert into business_modules(kos_id, module_code, active)
select id, code, true from kos cross join unnest(array['u_halaman', 'u_crm', 'u_penawaran']) code where id::text like 'f2700000-%'
on conflict (kos_id, module_code) do update set active = true;
insert into public_pages(kos_id, slug, enabled, catalog_mode, show_prices) values
  ('f2700000-0000-4000-8000-00000000000a', 'cx-uji-a', true, 'semua', true),
  ('f2700000-0000-4000-8000-00000000000b', 'cx-uji-b', true, 'semua', true),
  ('f2700000-0000-4000-8000-00000000000c', 'cx-uji-c', true, 'semua', true);

do $$
declare
  a constant uuid := 'f2700000-0000-4000-8000-00000000000a';
  b constant uuid := 'f2700000-0000-4000-8000-00000000000b';
  j constant uuid := 'f2700000-0000-4000-8000-00000000000c';
  owner_a constant text := 'f2700000-0000-4000-8000-000000000001';
  owner_b constant text := 'f2700000-0000-4000-8000-000000000002';
  kasir constant text := 'f2700000-0000-4000-8000-000000000003';
  gudang constant text := 'f2700000-0000-4000-8000-000000000004';
  owner_j constant text := 'f2700000-0000-4000-8000-000000000005';
  guest constant text := repeat('a', 64);
  other_guest constant text := repeat('e', 64);
  units constant jsonb := '[{"name":"pcs","qty":1,"price_retail":3200,"price_wholesale":3000}]';
  pr uuid; contact uuid; token text; guest_order uuid := gen_random_uuid(); private_order uuid := gen_random_uuid();
  svc uuid := gen_random_uuid(); delivery uuid := gen_random_uuid(); conv uuid; conv2 uuid; conv_j uuid; r jsonb; m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid(); note uuid := gen_random_uuid(); card uuid := gen_random_uuid(); n int; failed boolean;
  base jsonb;
begin
  perform set_config('request.jwt.claim.sub', owner_a, true);
  pr := product_save(a, null, 'Indomie uji', 'pcs', 1000, 0, units, 50, null);
  insert into contacts(kos_id, kind, name, phone) values (a, 'pelanggan', 'Grosir Uji', '081200000001') returning id into contact;
  token := cportal_link(contact)->>'token';
  perform set_config('request.jwt.claim.sub', '', true);
  r := portal_shop_order('cx-uji-a', guest, repeat('b', 64), jsonb_build_object('id', guest_order, 'name', 'Budi Tamu', 'phone', '081299990000',
    'consent', true, 'fulfillment', 'antar', 'ship_address', 'Jalan Uji 1', 'payment', 'tunai',
    'lines', jsonb_build_array(jsonb_build_object('product_id', pr, 'unit', 'pcs', 'qty', 5))));
  assert r->>'ok' = 'true', 'pesanan tamu dibuat: ' || r::text;
  r := cportal_order(token, jsonb_build_object('id', private_order, 'kind', 'pesanan',
    'lines', jsonb_build_array(jsonb_build_object('product_id', pr, 'unit', 'pcs', 'qty', 2))));
  assert r->>'ok' = 'true', 'pesanan portal grosir dibuat';
  insert into svc_orders(id, kos_id, number, customer_name, customer_phone, status, source, total)
  values (svc, j, 'PSN-UJI-001', 'Sari Laundry', '081277770000', 'proses', 'portal', 25000);

  -- ---------- Hak akses dasar ----------
  assert not has_function_privilege('anon', 'cx_customer(jsonb)', 'execute'), 'pintu pelanggan hanya server';
  assert not has_function_privilege('authenticated', 'cx_customer(jsonb)', 'execute'), 'pintu pelanggan bukan untuk pengguna aplikasi';
  assert not has_table_privilege('authenticated', 'customer_conversations', 'select'), 'tabel percakapan tanpa akses langsung';
  assert not has_table_privilege('anon', 'customer_messages', 'select'), 'tabel pesan tanpa akses langsung';
  assert not has_function_privilege('anon', 'cx_thread(uuid,text,jsonb)', 'execute'), 'pintu staf butuh login';
  assert to_regprocedure('public.cx_exchange(uuid,text,text,text,text,uuid,text,uuid)') is null, 'fungsi tahap 1 diganti';

  base := jsonb_build_object('access', 'guest', 'slug', 'cx-uji-a', 'credential', guest, 'ref', guest_order);
  -- ---------- Isolasi pelanggan ----------
  assert cx_customer(base || '{"op":"list"}' || jsonb_build_object('credential', other_guest)) is null, 'tamu lain tidak bisa membuka chat pesanan';
  assert cx_customer(base || '{"op":"list","slug":"cx-uji-b"}') is null, 'slug toko lain ditolak';
  assert cx_customer(base || '{"op":"list","access":"private"}' || jsonb_build_object('credential', token)) is null, 'token grosir tidak membuka pesanan tamu';
  assert cx_customer(jsonb_build_object('access', 'private', 'credential', token, 'ref', guest_order, 'op', 'list')) is null, 'pesanan tamu bukan milik kontak grosir';
  assert cx_customer(base || '{"op":"list","access":"admin"}') is null, 'akses tak dikenal ditolak';

  -- ---------- Tamu membuka & mengirim ----------
  r := cx_customer(base || '{"op":"list"}');
  assert r is not null and r->'conversation' = 'null'::jsonb and jsonb_array_length(r->'messages') = 0, 'membuka tanpa membuat percakapan';
  assert r #>> '{reference,number}' is not null and r #>> '{business,name}' = 'Toko Chat A', 'kartu pesanan & nama bisnis';
  assert (r #>> '{business,online}')::boolean = false and r #> '{business,response_minutes}' = 'null'::jsonb, 'online & respons dari data nyata (belum ada data)';
  assert cx_customer(base || jsonb_build_object('op', 'send', 'id', m1, 'body', '   ')) ->> 'error' is not null, 'pesan kosong ditolak';
  r := cx_customer(base || jsonb_build_object('op', 'send', 'id', m1, 'body', 'Halo, stok Indomie 5 dus ada?'));
  assert r->>'ok' = 'true', 'tamu mengirim pesan';
  assert (cx_customer(base || jsonb_build_object('op', 'send', 'id', m1, 'body', 'Halo, stok Indomie 5 dus ada?'))->>'duplicate')::boolean, 'kirim ulang idempoten';
  assert cx_customer(base || jsonb_build_object('op', 'send', 'id', m1, 'body', 'isi berbeda'))->>'error' is not null, 'id sama isi beda ditolak';
  select id into conv from customer_conversations where reference_id = guest_order;
  assert (select kind = 'transaksi' and channel = 'toko' and status = 'baru' and customer_name = 'Budi Tamu' from customer_conversations where id = conv), 'percakapan transaksi toko';
  assert cx_customer(base || jsonb_build_object('op', 'send', 'id', gen_random_uuid(), 'kind', 'produk', 'body', 'x', 'file', null))->>'error' is not null, 'pelanggan tidak bisa mengirim kartu';
  assert cx_customer(base || jsonb_build_object('op', 'send', 'id', gen_random_uuid(), 'kind', 'gambar', 'body', '',
    'file', jsonb_build_object('path', a::text || '/' || repeat('1', 64), 'name', 'x.jpg', 'mime', 'image/jpeg', 'size', 10)))->>'error' is not null, 'path lampiran pelanggan harus dari server';
  r := cx_customer(base || jsonb_build_object('op', 'send', 'id', m2, 'kind', 'gambar', 'body', 'Foto barang',
    'file', jsonb_build_object('path', 'pelanggan/' || repeat('2', 64), 'name', 'foto.jpg', 'mime', 'image/jpeg', 'size', 2048)));
  assert r->>'ok' = 'true', 'tamu mengirim foto';
  assert cx_customer(base || jsonb_build_object('op', 'file', 'id', m2))->>'path' = 'pelanggan/' || repeat('2', 64), 'lampiran bisa dibuka pemiliknya';
  assert cx_customer(base || jsonb_build_object('op', 'file', 'id', m2, 'credential', other_guest)) is null, 'lampiran tidak bisa dibuka tamu lain';

  -- ---------- Notifikasi pemilik & kasir (tanpa isi pesan); gudang tidak ----------
  select count(*) into n from notif_items where kos_id = a and event_type = 'CustomerChatMessage' and source_id = conv;
  assert n = 2, 'pemilik & kasir menerima notifikasi (digabung per orang): ' || n;
  assert not exists (select 1 from notif_items where kos_id = a and event_type = 'CustomerChatMessage' and user_id = gudang::uuid), 'gudang (tanpa area kasir) tidak menerima';
  assert not exists (select 1 from notif_items where kos_id = a and event_type like 'CustomerChat%' and body like '%Indomie%'), 'isi pesan tidak masuk notifikasi';
  assert exists (select 1 from notif_items where kos_id = a and user_id = owner_a::uuid and event_type = 'CustomerChatMessage' and link = '/chat?c=' || conv and hits = 2), 'tautan ke percakapan & penggabungan';

  -- ---------- Staf ----------
  perform set_config('request.jwt.claim.sub', owner_b, true);
  failed := false; begin perform cx_thread(conv, 'list'); exception when others then failed := true; end;
  assert failed, 'pemilik bisnis lain ditolak';
  failed := false; begin perform cx_inbox(a); exception when others then failed := true; end;
  assert failed, 'kotak masuk bisnis lain ditolak';
  perform set_config('request.jwt.claim.sub', gudang, true);
  failed := false; begin perform cx_thread(conv, 'list'); exception when others then failed := true; end;
  assert failed, 'karyawan gudang tidak membaca chat';
  perform set_config('request.jwt.claim.sub', kasir, true);
  r := cx_inbox(a);
  assert (r #>> '{counts,unread}')::int = 1 and (r #>> '{rows,0,unread}')::int = 2 and r #>> '{rows,0,preview}' like '%Foto%', 'kotak masuk kasir';
  assert cx_unread_count(a) = 1, 'lencana menu';
  r := cx_thread(conv, 'list');
  assert jsonb_array_length(r->'messages') = 2 and r #>> '{reference,type}' = 'so_order', 'kasir membaca percakapan + konteks';
  assert jsonb_array_length(r->'members') = 2, 'daftar penugasan hanya anggota berakses (pemilik + kasir)';
  perform cx_thread(conv, 'read', jsonb_build_object('id', m2));
  assert cx_unread_count(a) = 0, 'tanda dibaca';
  assert cx_ping(a), 'kehadiran kasir dicatat';
  perform cx_thread(conv, 'send', jsonb_build_object('id', note, 'kind', 'catatan', 'body', 'Cek gudang dulu — internal'));
  r := cx_customer(base || '{"op":"list"}');
  assert not (r->'messages' @> '[{"kind":"catatan"}]'), 'catatan internal TIDAK terlihat pelanggan';
  assert cx_customer(base || jsonb_build_object('op', 'file', 'id', note)) is null, 'catatan tidak bisa dibuka pelanggan';
  assert (select status from customer_conversations where id = conv) = 'baru', 'catatan tidak mengubah status';
  perform cx_thread(conv, 'send', jsonb_build_object('id', gen_random_uuid(), 'body', 'Stok ada kak, siap dikirim.'));
  perform cx_thread(conv, 'send', jsonb_build_object('id', card, 'kind', 'produk', 'product_id', pr, 'unit', 'pcs'));
  perform cx_thread(conv, 'send', jsonb_build_object('id', gen_random_uuid(), 'kind', 'pembayaran'));
  failed := false; begin perform cx_thread(conv, 'send', jsonb_build_object('id', gen_random_uuid(), 'kind', 'gambar',
    'file', jsonb_build_object('path', b::text || '/' || repeat('3', 64), 'name', 'x.jpg', 'mime', 'image/jpeg', 'size', 9))); exception when others then failed := true; end;
  assert failed, 'path lampiran bisnis lain ditolak';
  failed := false; begin perform cx_thread(conv, 'send', jsonb_build_object('id', gen_random_uuid(), 'kind', 'penawaran')); exception when others then failed := true; end;
  assert failed, 'kartu penawaran hanya untuk penawaran yang menunggu';
  r := cx_customer(base || '{"op":"list"}');
  assert r->'messages' @> jsonb_build_array(jsonb_build_object('kind', 'produk', 'payload', jsonb_build_object('name', 'Indomie uji', 'price', 3200))), 'kartu produk (harga eceran)';
  assert r->'messages' @> '[{"kind":"pembayaran","payload":{"payment_info":"BCA 123 a.n. Toko A"}}]', 'kartu cara bayar';
  assert (r #>> '{business,online}')::boolean, 'status online dari kehadiran nyata';
  assert (select status from customer_conversations where id = conv) = 'menunggu_pelanggan', 'balasan → menunggu pelanggan';
  assert (cx_guest_unread('cx-uji-a', guest)->>guest_order::text)::int = 3, 'lencana belum dibaca pelanggan (tanpa catatan)';
  assert cx_guest_unread('cx-uji-a', other_guest) = '{}'::jsonb, 'lencana tamu lain kosong';
  select id into m1 from customer_messages where conversation_id = conv and sender = 'business' and kind <> 'catatan' order by created_at desc limit 1;
  perform cx_customer(base || jsonb_build_object('op', 'read', 'id', m1));
  assert cx_guest_unread('cx-uji-a', guest) = '{}'::jsonb, 'pelanggan menandai dibaca';
  assert (select read_at is null from customer_messages where id = note), 'catatan tidak ikut ditandai dibaca';

  -- penugasan, status, prioritas
  perform cx_thread(conv, 'assign', jsonb_build_object('user_id', owner_a));
  assert (select assigned_to = owner_a::uuid from customer_conversations where id = conv), 'penugasan';
  failed := false; begin perform cx_thread(conv, 'assign', jsonb_build_object('user_id', gudang)); exception when others then failed := true; end;
  assert failed, 'tidak bisa menugaskan anggota tanpa akses';
  perform cx_thread(conv, 'priority', '{"value":"tinggi"}');
  perform cx_thread(conv, 'status', '{"value":"selesai"}');
  assert (cx_inbox(a, 'tinggi')->'rows') = '[]'::jsonb, 'filter prioritas tidak memuat yang selesai';
  perform set_config('request.jwt.claim.sub', '', true);
  perform cx_customer(base || jsonb_build_object('op', 'send', 'id', gen_random_uuid(), 'body', 'Terima kasih, ditunggu'));
  assert (select status from customer_conversations where id = conv) = 'ditangani', 'pesan baru membuka lagi percakapan selesai';
  assert exists (select 1 from notif_items where kos_id = a and user_id = owner_a::uuid and event_type = 'CustomerChatAssigned' and source_id = conv), 'notifikasi ke penanggung jawab';

  -- waktu respons: ≥3 contoh
  for n in 1..3 loop
    insert into customer_messages(id, kos_id, conversation_id, reference_type, reference_id, sender, kind, body, created_at)
    values (gen_random_uuid(), a, conv, 'so_order', guest_order, 'customer', 'teks', 'tanya ' || n, now() - make_interval(hours => 10 - n * 2)),
           (gen_random_uuid(), a, conv, 'so_order', guest_order, 'business', 'teks', 'jawab ' || n, now() - make_interval(hours => 10 - n * 2) + interval '4 minutes');
  end loop;
  assert (cx_business_info(a)->>'response_minutes')::numeric between 3 and 5, 'median waktu respons dari data: ' || (cx_business_info(a)->>'response_minutes');

  -- ---------- Chat umum ----------
  r := cx_customer(jsonb_build_object('access', 'guest', 'slug', 'cx-uji-a', 'credential', other_guest, 'ref', 'umum', 'op', 'list'));
  assert (r->>'need_identity')::boolean, 'tamu baru diminta identitas';
  assert cx_customer(jsonb_build_object('access', 'guest', 'slug', 'cx-uji-a', 'credential', other_guest, 'ref', 'umum', 'op', 'send',
    'id', gen_random_uuid(), 'body', 'Halo'))->>'error' is not null, 'chat umum tamu tanpa nama/HP ditolak';
  r := cx_customer(jsonb_build_object('access', 'guest', 'slug', 'cx-uji-a', 'credential', other_guest, 'ref', 'umum', 'op', 'send',
    'id', gen_random_uuid(), 'body', 'Halo, buka jam berapa?', 'name', 'Rina', 'phone', '0812 3333 4444'));
  assert r->>'ok' = 'true', 'chat umum tamu';
  r := cx_customer(jsonb_build_object('access', 'guest', 'slug', 'cx-uji-a', 'credential', guest, 'ref', 'umum', 'op', 'send', 'id', gen_random_uuid(), 'body', 'Halo umum'));
  assert r->>'ok' = 'true', 'tamu yang pernah pesan memakai nama dari pesanannya';
  assert (select count(*) from customer_conversations where kos_id = a and kind = 'umum') = 2, 'chat umum per sesi tamu';
  r := cx_customer(jsonb_build_object('access', 'private', 'credential', token, 'ref', 'umum', 'op', 'send', 'id', gen_random_uuid(), 'body', 'Minta daftar harga'));
  assert r->>'ok' = 'true', 'chat umum grosir';
  r := cx_customer(jsonb_build_object('access', 'private', 'credential', token, 'ref', private_order, 'op', 'send', 'id', gen_random_uuid(), 'body', 'Kapan dikirim?'));
  assert r->>'ok' = 'true', 'chat transaksi grosir';
  assert (select channel from customer_conversations where reference_id = private_order) = 'grosir', 'kanal grosir';
  perform set_config('request.jwt.claim.sub', owner_a, true);
  select id into conv2 from customer_conversations where kos_id = a and kind = 'umum' and contact_id = contact;
  perform cx_thread(conv2, 'send', jsonb_build_object('id', gen_random_uuid(), 'body', 'Siap, kami kirim'));
  perform set_config('request.jwt.claim.sub', '', true);
  assert (cx_private_unread(token)->>'umum')::int = 1, 'lencana portal grosir';
  -- chat dimatikan
  perform set_config('request.jwt.claim.sub', owner_a, true);
  perform cx_settings_set(a, false, '["Stok tersedia, kak.", "  ", "Pesanan sedang disiapkan."]');
  assert (select jsonb_array_length(profile #> '{chat,balasan}') from kos where id = a) = 2, 'balasan cepat (baris kosong dibuang)';
  perform set_config('request.jwt.claim.sub', kasir, true);
  failed := false; begin perform cx_settings_set(a, true, '[]'); exception when others then failed := true; end;
  assert failed, 'kasir tidak bisa mengubah setelan chat';
  perform set_config('request.jwt.claim.sub', '', true);
  assert cx_customer(base || jsonb_build_object('op', 'send', 'id', gen_random_uuid(), 'body', 'Halo?'))->>'error' like 'Chat sedang dimatikan%', 'chat dimatikan menolak pesan';
  assert (cx_customer(base || '{"op":"list"}')->>'enabled')::boolean = false, 'portal tahu chat mati';
  perform set_config('request.jwt.claim.sub', owner_a, true);
  perform cx_settings_set(a, true, '[]');

  -- ---------- Tracking toko ----------
  failed := false; begin perform so_track_set(guest_order, '{"prepared":true}'); exception when others then failed := true; end;
  assert failed, 'disiapkan hanya setelah dikonfirmasi';
  perform so_confirm(guest_order, null);
  perform so_track_set(guest_order, '{"prepared":true}');
  insert into so_deliveries(id, kos_id, order_id, number, status, driver) values (delivery, a, guest_order, 'SJ-UJI-1', 'dikirim', 'Pak Andi');
  failed := false; begin perform so_track_set(guest_order, jsonb_build_object('delivery_id', delivery, 'eta_from', now() + interval '3 hours', 'eta_to', now() + interval '1 hour')); exception when others then failed := true; end;
  assert failed, 'estimasi terbalik ditolak';
  perform so_track_set(guest_order, jsonb_build_object('delivery_id', delivery, 'courier', 'Kurir Toko', 'tracking_no', 'TSB123',
    'eta_from', now() + interval '1 hour', 'eta_to', now() + interval '3 hours'));
  perform set_config('request.jwt.claim.sub', owner_b, true);
  failed := false; begin perform so_track_set(guest_order, '{"prepared":false}'); exception when others then failed := true; end;
  assert failed, 'bisnis lain tidak bisa mengubah tracking';
  perform set_config('request.jwt.claim.sub', '', true);
  r := cx_customer(base || '{"op":"track"}');
  assert r->>'prepared_at' is not null and r #>> '{deliveries,0,tracking_no}' = 'TSB123' and r #>> '{deliveries,0,courier}' = 'Kurir Toko'
    and r #>> '{deliveries,0,eta_to}' is not null and r->>'fulfillment' = 'antar', 'tracking pelanggan memakai data penjual';
  assert cx_customer(base || '{"op":"track"}' || jsonb_build_object('credential', other_guest)) is null, 'tracking tamu lain ditolak';

  -- ---------- Jasa / laundry ----------
  assert cx_customer(jsonb_build_object('access', 'svc', 'slug', 'cx-uji-c', 'ref', svc, 'number', 'PSN-UJI-001', 'phone', '081200000000', 'op', 'list')) is null, 'HP salah ditolak';
  assert cx_customer(jsonb_build_object('access', 'svc', 'slug', 'cx-uji-a', 'ref', svc, 'number', 'PSN-UJI-001', 'phone', '081277770000', 'op', 'list')) is null, 'halaman bisnis lain ditolak';
  r := cx_customer(jsonb_build_object('access', 'svc', 'slug', 'cx-uji-c', 'ref', svc, 'number', 'psn-uji-001', 'phone', '+62 812-7777-0000', 'op', 'send', 'id', gen_random_uuid(), 'body', 'Sudah selesai belum?'));
  assert r->>'ok' = 'true', 'chat pesanan laundry';
  select id into conv_j from customer_conversations where reference_id = svc;
  assert (select channel = 'jasa' and reference_type = 'svc_order' from customer_conversations where id = conv_j), 'kanal jasa';
  assert exists (select 1 from notif_items where kos_id = j and user_id = owner_j::uuid and event_type = 'CustomerChatMessage'), 'pemilik laundry diberi tahu';
  r := cx_customer(jsonb_build_object('access', 'svc', 'slug', 'cx-uji-c', 'ref', 'nomor', 'number', 'PSN-UJI-001', 'phone', '081277770000', 'op', 'track'));
  assert r->>'status' = 'proses' and r->>'type' = 'svc_order', 'tracking jasa';
  perform set_config('request.jwt.claim.sub', owner_a, true);
  failed := false; begin perform cx_thread(conv_j, 'list'); exception when others then failed := true; end;
  assert failed, 'pemilik toko tidak membaca chat laundry';
  assert cx_open_ref(a, 'so_order', guest_order) = conv, 'buka percakapan dari pesanan memakai yang sudah ada';
  failed := false; begin perform cx_open_ref(a, 'svc_order', svc); exception when others then failed := true; end;
  assert failed, 'tidak bisa membuka pesanan bisnis lain';

  -- Konteks produk tetap satu pesan dalam chat umum tamu dan harga mengikuti katalog publik.
  declare
    request jsonb := jsonb_build_object('access', 'guest', 'slug', 'cx-uji-a', 'credential', guest,
      'ref', 'umum', 'op', 'send', 'id', gen_random_uuid(), 'body', 'Mohon cek Indomie ini',
      'product_id', pr, 'product_unit', 'pcs', 'name', 'Budi Tamu', 'phone', '081299990000');
    product_room uuid;
    shown jsonb;
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    assert cx_public_product('cx-uji-b', pr, 'pcs') is null, 'Produk lintas bisnis ditolak';
    assert cx_public_product('cx-uji-a', pr, 'dus') is null, 'Satuan harus termasuk katalog produk';
    assert not has_function_privilege('anon', 'cx_customer_product(jsonb)', 'execute');
    assert cx_customer_product(request || '{"slug":"cx-uji-b"}')->>'ok' is null;
    assert cx_customer_product(request)->>'ok' = 'true';
    assert cx_customer_product(request)->>'duplicate' = 'true', 'Pesan dengan konteks produk idempoten';
    shown := cx_customer_product(request || '{"op":"list"}');
    product_room := (shown #>> '{conversation,id}')::uuid;
    assert shown->>'signal' is not null and (shown #>> '{product,price}')::numeric = 3200 and shown #>> '{product,available}' = 'true';
    assert cx_customer_product(request || '{"op":"list"}' || jsonb_build_object('credential', repeat('f',64)))->>'signal' is null;
    assert (select count(*) from customer_messages where id = (request->>'id')::uuid and conversation_id = product_room) = 1;
    perform set_config('request.jwt.claim.sub', owner_a, true);
    shown := cx_thread(product_room, 'list');
    assert exists (select 1 from jsonb_array_elements(shown->'messages') x
      where x->>'id' = request->>'id' and x #>> '{product_context,product_id}' = pr::text and (x #>> '{product_context,price}')::numeric = 3200);
    update public_pages set show_prices = false where kos_id = a;
    assert cx_public_product('cx-uji-a', pr, 'pcs')->>'price' is null, 'Harga tersembunyi tidak ikut terbuka';
    shown := cx_thread(product_room, 'list');
    assert exists (select 1 from jsonb_array_elements(shown->'messages') x
      where x->>'id' = request->>'id' and x #>> '{product_context,price}' is null), 'Kartu lama mengikuti kebijakan harga saat ini';
  end;

  -- penghapusan pesanan ikut menghapus percakapan
  delete from svc_orders where id = svc;
  assert not exists (select 1 from customer_conversations where id = conv_j), 'percakapan ikut terhapus';
  raise notice 'CHAT_TRACKING LULUS';
end $$;

rollback;
