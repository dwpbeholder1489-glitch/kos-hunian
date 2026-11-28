-- Uji Notification Engine (migrasi 20261128100000). Database baru berisi semua migrasi + stub Supabase.
-- psql -X -A -d <db> -f supabase/tests/notifikasi_push.sql
-- Lulus = setiap kolom pernyataan bernilai t, tanpa baris "GAGAL" dan tanpa ERROR tak terduga.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values
  ('ab0b0b0b-0000-0000-0000-000000000001','pemilik-nt@x.com'), ('ab0b0b0b-0000-0000-0000-000000000002','kasir-nt@x.com'),
  ('ab0b0b0b-0000-0000-0000-000000000003','gudang-nt@x.com'), ('ab0b0b0b-0000-0000-0000-000000000004','luar-nt@x.com'),
  ('ab0b0b0b-0000-0000-0000-000000000005','pengelola-nt@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('ab0b0b0b-0000-0000-0000-00000000000a','Toko Notif','ab0b0b0b-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','retail'),
  ('ab0b0b0b-0000-0000-0000-00000000000b','Toko Luar','ab0b0b0b-0000-0000-0000-000000000004','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','retail'),
  ('ab0b0b0b-0000-0000-0000-00000000000c','Toko Tutup','ab0b0b0b-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','retail');
insert into kos_members(kos_id,user_id,role) values
  ('ab0b0b0b-0000-0000-0000-00000000000a','ab0b0b0b-0000-0000-0000-000000000001','pemilik'),
  ('ab0b0b0b-0000-0000-0000-00000000000a','ab0b0b0b-0000-0000-0000-000000000002','kasir'),
  ('ab0b0b0b-0000-0000-0000-00000000000a','ab0b0b0b-0000-0000-0000-000000000003','gudang'),
  ('ab0b0b0b-0000-0000-0000-00000000000a','ab0b0b0b-0000-0000-0000-000000000005','pengelola'),
  ('ab0b0b0b-0000-0000-0000-00000000000b','ab0b0b0b-0000-0000-0000-000000000004','pemilik'),
  ('ab0b0b0b-0000-0000-0000-00000000000c','ab0b0b0b-0000-0000-0000-000000000001','pemilik');
\set K  'ab0b0b0b-0000-0000-0000-00000000000a'
\set KL 'ab0b0b0b-0000-0000-0000-00000000000b'
\set KT 'ab0b0b0b-0000-0000-0000-00000000000c'
\set PM 'ab0b0b0b-0000-0000-0000-000000000001'
\set KS 'ab0b0b0b-0000-0000-0000-000000000002'
\set GD 'ab0b0b0b-0000-0000-0000-000000000003'
\set LN 'ab0b0b0b-0000-0000-0000-000000000004'
\set PG 'ab0b0b0b-0000-0000-0000-000000000005'

-- pencatat panggilan pg_net (stub): setiap http_post dicatat agar jumlah "bangunkan pengirim" bisa diperiksa
create table if not exists public.uji_net(id serial, url text, body jsonb, headers jsonb, at timestamptz default now());
grant all on public.uji_net to authenticated, service_role; grant usage, select on sequence public.uji_net_id_seq to authenticated, service_role;
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 1000)
returns bigint language sql security definer as $$ insert into public.uji_net(url, body, headers) values (url, body, headers) returning id::bigint $$;

create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u, 'email', 'x@x.com')::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;
-- hitung baris kotak masuk (sebagai postgres, menembus RLS)
create or replace function pg_temp.n(u uuid, t text) returns int language sql as $$ select count(*)::int from public.notif_items where user_id = u and event_type = t $$;
create or replace function pg_temp.q(u uuid) returns int language sql as $$ select count(*)::int from public.notif_queue where user_id = u $$;

\echo == A. Tabel tertutup untuk klien; katalog bisa dibaca
set role authenticated;
select pg_temp.sebagai(:'PM');
do $$ declare t text; begin
  foreach t in array array['notif_items','notif_queue','notif_deliveries','push_subscriptions','notif_config','notif_user_settings','notif_prefs'] loop
    begin execute format('select 1 from public.%I limit 1', t); raise notice 'A_GAGAL: % bisa dibaca klien', t;
    exception when insufficient_privilege then raise notice 'a_OK: % tertutup', t; end;
  end loop;
  begin perform notif_claim(10); raise notice 'A_GAGAL: klien bisa klaim antrean'; exception when insufficient_privilege then raise notice 'a_OK: notif_claim khusus server'; end;
  begin perform push_sub_save(auth.uid(), 'https://x', 'k', 'k', 'devdevdev', 'x', 'x', 'x', false); raise notice 'A_GAGAL: klien bisa simpan langganan'; exception when insufficient_privilege then raise notice 'a_OK: push_sub_save khusus server'; end;
end $$;
select (select count(*) from notif_event_types) >= 50 a_katalog_terbaca;

\echo == B. Penjualan kasir nyata → pemilik & pengelola dapat (digabung), kasir pelaku & gudang & orang luar tidak
select product_save(:'K', null, 'Kopi susu', 'pcs', 5000, 3, '[{"name":"pcs","price_retail":10000}]', 5, null) as kopi \gset
select pg_temp.sebagai(:'KS');
select sale_create('ab0b0b0b-0000-0000-0000-0000000000e1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 1)), 0, 'tunai', 999999, null, null, null) is not null b_jual_1;
select sale_create('ab0b0b0b-0000-0000-0000-0000000000e2', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 1)), 0, 'tunai', 999999, null, null, null) is not null b_jual_2;
reset role;
select pg_temp.n(:'PM', 'SaleCreated') = 1 b_pemilik_satu_baris_gabungan,
       (select hits = 2 and title = '2 penjualan baru' and amount = 20000 from notif_items where user_id = :'PM' and event_type = 'SaleCreated') b_gabungan_dua_20rb,
       pg_temp.n(:'PG', 'SaleCreated') = 1 b_pengelola_dapat,
       pg_temp.n(:'KS', 'SaleCreated') = 0 b_kasir_pelaku_tidak,
       pg_temp.n(:'GD', 'SaleCreated') = 0 b_gudang_tanpa_area_uang_tidak,
       pg_temp.n(:'LN', 'SaleCreated') = 0 b_orang_luar_tidak;
-- stok 5 → 3 = melewati batas minimum 3 → Stok menipis ke gudang & pemilik (pelaku tidak dikecualikan dari peringatan stok)
select pg_temp.n(:'GD', 'StockLow') = 1 b_gudang_stok_menipis, pg_temp.n(:'PM', 'StockLow') = 1 b_pemilik_stok_menipis,
       pg_temp.n(:'KS', 'StockLow') = 0 b_kasir_tanpa_area_stok_tidak;

\echo == C. Idempoten: peristiwa yang sama tidak dihitung dua kali
select notif_emit(:'K', 'SaleVoided', 'uji-batal-1', 'sell', 'Penjualan X dibatalkan', 1000, '{}', null, 'sale', null) >= 1 c_pertama;
select notif_emit(:'K', 'SaleVoided', 'uji-batal-1', 'sell', 'Penjualan X dibatalkan', 1000, '{}', null, 'sale', null) = 0 c_kedua_diabaikan;
select notif_emit(:'K', 'StockOut', 'uji-habis', 'stock', 'A habis', null, '{}', null, 'product', null) >= 1 c_grup_pertama;
select notif_emit(:'K', 'StockOut', 'uji-habis', 'stock', 'A habis', null, '{}', null, 'product', null) = 0 c_grup_kunci_sama_diabaikan,
       (select hits from notif_items where user_id = :'PM' and event_type = 'StockOut') = 1 c_grup_tetap_satu;
select notif_emit(:'K', 'PeristiwaTakDikenal', 'x', 'sell', 'x', null, '{}', null, 'x', null) = 0 c_tanpa_katalog_bukan_notifikasi;

\echo == D. Perangkat & antrean push
select pg_temp.q(:'PM') = 0 d_tanpa_perangkat_tanpa_antrean;
set role service_role;
select (push_sub_save(:'PM', 'https://push.example.com/a1', 'enc1', 'APPKEY', 'dev-hp-1', 'iPhone · Safari', 'ios', 'safari', true) ->> 'new')::boolean d_perangkat_baru;
select (push_sub_save(:'PM', 'https://push.example.com/a1', 'enc1b', 'APPKEY', 'dev-hp-1', 'iPhone · Safari', 'ios', 'safari', true) ->> 'new')::boolean = false d_simpan_ulang_bukan_baru;
reset role;
select pg_temp.n(:'PM', 'DeviceAdded') = 1 d_keamanan_perangkat_baru_sekali,
       (select kos_id is null and priority = 'kritis' from notif_items where user_id = :'PM' and event_type = 'DeviceAdded') d_notif_akun_kritis,
       (select count(*) = 1 from notif_queue q join notif_items n on n.id = q.notif_id where n.user_id = :'PM' and n.event_type = 'DeviceAdded') d_perangkat_baru_dipush;
select notif_emit(:'K', 'SaleVoided', 'uji-batal-2', 'sell', 'Penjualan Y dibatalkan', 2000, '{}', null, 'sale', null) >= 1 d_batal_lagi;
select (select count(*) from notif_queue q join notif_items n on n.id = q.notif_id where n.user_id = :'PM' and n.event_type = 'SaleVoided') = 1 d_push_bawaan_aktif_diantre,
       (select count(*) from notif_queue q join notif_items n on n.id = q.notif_id where n.user_id = :'PM' and n.event_type = 'SaleCreated') = 0 d_penjualan_bawaan_tanpa_push;
-- grup ber-push: dua permintaan pesanan beruntun → satu baris, satu antrean
select notif_emit(:'K', 'LeadCreated', 'uji-lead-1', 'sell', 'Prospek A', null, '{}', null, 'lead', null) >= 1 d_lead_1;
select notif_emit(:'K', 'LeadCreated', 'uji-lead-2', 'sell', 'Prospek B', null, '{}', null, 'lead', null) >= 1 d_lead_2;
select (select count(*) from notif_queue q join notif_items n on n.id = q.notif_id where n.user_id = :'PM' and n.event_type = 'LeadCreated') = 1 d_grup_satu_push,
       (select hits = 2 and body = 'Prospek B' from notif_items where user_id = :'PM' and event_type = 'LeadCreated') d_grup_isi_terbaru;

\echo == E. Pengirim dibangunkan pg_net: hanya bila alamat terdaftar, satu kali per pernyataan
set role service_role;
select notif_config_set('https://app.contoh.id', null) \g /dev/null
select notif_config_set('javascript:alert(1)', null) \g /dev/null
reset role;
select (select app_url from notif_config) = 'https://app.contoh.id' e_alamat_aman;
delete from uji_net;
update notif_queue set created_at = now() - interval '1 minute';
select notif_emit(:'K', 'SaleVoided', 'uji-batal-3', 'sell', 'Penjualan Z dibatalkan', 3000, '{}', null, 'sale', null) >= 1 e_batal;
select (select count(*) from uji_net) = 1 e_satu_kali_dibangunkan,
       (select url = 'https://app.contoh.id/api/notif/kirim' and headers ->> 'x-notif-kick' = (select kick_token from notif_config) from uji_net limit 1) e_alamat_dan_token;
select notif_cron_kick() e_jadwal_ada_antrean;

\echo == F. Jam tenang & prioritas kritis; preferensi kategori
set role authenticated;
select pg_temp.sebagai(:'PM');
select (notif_settings_set(:'K', jsonb_build_object('quiet', jsonb_build_object('on', true,
   'start', to_char((now() at time zone 'Asia/Jakarta') - interval '1 hour', 'HH24:MI'),
   'end', to_char((now() at time zone 'Asia/Jakarta') + interval '1 hour', 'HH24:MI'), 'days', '[1,2,3,4,5,6,7]'::jsonb, 'tz', 'Asia/Jakarta'))) -> 'quiet' ->> 'on')::boolean f_jam_tenang_disimpan;
select pg_temp.gagal($$select notif_settings_set(null, '{"quiet":{"on":true,"start":"25:00","end":"07:00","days":[1],"tz":"Asia/Jakarta"}}')$$) like 'Jam tenang%' f_jam_tidak_sah_ditolak,
       pg_temp.gagal($$select notif_settings_set(null, '{"quiet":{"on":true,"start":"22:00","end":"07:00","days":[9],"tz":"Asia/Jakarta"}}')$$) like 'Hari%' f_hari_tidak_sah_ditolak,
       pg_temp.gagal(format($$select notif_settings_set(%L, '{"cats":{"rahasia":{"app":true}}}')$$, :'K')) like 'Kategori tidak dikenal%' f_kategori_asing_ditolak,
       pg_temp.gagal(format($$select notif_settings_set(%L, '{"cats":{}}')$$, :'KL')) like 'Bukan anggota%' f_bisnis_orang_lain_ditolak;
reset role;
select notif_emit(:'K', 'SaleVoided', 'uji-batal-4', 'sell', 'Penjualan Q dibatalkan', 1, '{}', null, 'sale', null) >= 1 f_emit_tenang;
select (select q.next_at > now() + interval '30 minutes' from notif_queue q join notif_items n on n.id = q.notif_id where n.event_key = 'SaleVoided:uji-batal-4' and n.user_id = :'PM') f_ditunda_sampai_jam_tenang_selesai;
select notif_emit(null, 'TestPush', 'uji-kritis', '', 'Kritis', null, jsonb_build_object('user_id', :'PM'), null, 'test', null) >= 1 f_emit_lain,
       notif_send_at(:'PM', 'kritis') <= now() f_kritis_tidak_ditunda;
set role authenticated;
select pg_temp.sebagai(:'PM');
select notif_settings_set(:'K', '{"quiet":{"on":false,"start":"22:00","end":"07:00","days":[1,2,3,4,5,6,7],"tz":"Asia/Jakarta"},"cats":{"penjualan":{"app":true,"push":false},"inventaris":{"app":false,"push":false},"sistem":{"app":false,"push":false}}}') is not null f_preferensi_disimpan;
reset role;
select notif_emit(:'K', 'SaleVoided', 'uji-batal-5', 'sell', 'Batal tanpa push', 1, '{}', null, 'sale', null) >= 1 f_masuk_kotak_tanpa_push;
select (select count(*) from notif_queue q join notif_items n on n.id = q.notif_id where n.event_key = 'SaleVoided:uji-batal-5' and n.user_id = :'PM') = 0 f_push_kategori_mati;
select notif_emit(:'K', 'StockOut', 'uji-habis-2', 'stock', 'B habis', null, '{}', null, 'product', null) >= 0 f_emit_inventaris;
select (select count(*) from notif_items where event_key = 'StockOut:uji-habis-2' and user_id = :'PM') = 0 f_kategori_dimatikan_tidak_masuk,
       (select count(*) from notif_items where event_key = 'StockOut:uji-habis-2' and user_id = :'GD') = 1 f_orang_lain_tetap_dapat;
select notif_emit(:'K', 'TeamAccessChanged', 'uji-kritis-2', '', 'Kritis tetap masuk', null, jsonb_build_object('user_id', :'PM'), null, 'member', null) >= 1 f_kritis_tetap_masuk;

\echo == G. Membaca hanya milik sendiri & masih anggota
set role authenticated;
select pg_temp.sebagai(:'PM');
select (notif_counts(:'K') ->> 'unread')::int >= 3 g_hitung_belum_dibaca,
       jsonb_array_length(notif_list(:'K', null, false, null, null, 50, false, false)) >= 3 g_daftar,
       jsonb_array_length(notif_list(:'K', 'penjualan', false, null, null, 50, false, false)) >= 1 g_filter_kategori,
       jsonb_array_length(notif_list(:'K', null, false, 'Prospek B', null, 50, false, false)) = 1 g_cari_kata;
reset role;
select id as pm_notif from notif_items where user_id = :'PM' and event_type = 'LeadCreated' \gset
select id as gd_notif from notif_items where user_id = :'GD' and event_type = 'StockLow' \gset
set role authenticated;
select pg_temp.sebagai(:'GD');
select pg_temp.gagal(format('select notif_get(%L)', :'pm_notif')) like 'Notifikasi tidak ditemukan%' g_tidak_bisa_buka_milik_orang,
       notif_mark(array[:'pm_notif'::uuid], true) = 0 g_tidak_bisa_tandai_milik_orang,
       notif_delete(array[:'pm_notif'::uuid]) = 0 g_tidak_bisa_hapus_milik_orang,
       (notif_open(:'pm_notif') ->> 'link') = '/pusat-notifikasi' g_buka_milik_orang_ke_pusat,
       (notif_get(:'gd_notif') ->> 'title') = 'Stok menipis' g_milik_sendiri_terbuka;
select pg_temp.sebagai(:'LN');
select jsonb_array_length(notif_list(:'K', null, false, null, null, 50, false, true)) = 0 g_orang_luar_kosong,
       (notif_counts(:'K') ->> 'unread')::int = 0 g_orang_luar_nol;
select pg_temp.sebagai(:'PM');
select (notif_open(:'pm_notif') ->> 'link') = '/crm' g_buka_tujuan_dari_db;
select (notif_get(:'pm_notif') ->> 'read')::boolean g_dibuka_jadi_dibaca, (notif_get(:'pm_notif') ->> 'opened')::boolean g_tercatat_dibuka;
select notif_archive(array[:'pm_notif'::uuid], true) = 1 g_arsip;
select jsonb_array_length(notif_list(:'K', null, false, 'Prospek B', null, 50, true, false)) = 1 g_ada_di_arsip,
       jsonb_array_length(notif_list(:'K', null, false, 'Prospek B', null, 50, false, false)) = 0 g_hilang_dari_kotak_masuk;
select notif_mark_all(:'K', null) >= 1 g_tandai_semua;
select (notif_counts(:'K') ->> 'unread')::int = 0 g_semua_dibaca;
-- karyawan dinonaktifkan → notifikasinya tidak lagi terbaca
reset role;
update kos_members set active = false where kos_id = :'K' and user_id = :'GD';
set role authenticated;
select pg_temp.sebagai(:'GD');
select (select count(*) from jsonb_array_elements(notif_list(:'K', null, false, null, null, 50, false, true)) x where x ->> 'kos_id' = :'K') = 0 g_nonaktif_tidak_terbaca,
       (select count(*) from jsonb_array_elements(notif_list(null, null, false, null, null, 50, false, true)) x where x ->> 'type' = 'TeamAccessChanged') = 1 g_pemberitahuan_nonaktif_akun;
reset role;
update kos_members set active = true where kos_id = :'K' and user_id = :'GD';

\echo == H. Hak akses diubah pemilik → karyawan diberi tahu; persetujuan ke penyetuju lalu ke peminta
set role authenticated;
select pg_temp.sebagai(:'PM');
reset role;
select pg_temp.sebagai(:'PM');
update kos_members set role = 'pengelola' where kos_id = :'K' and user_id = :'KS';
select (select count(*) from notif_items where user_id = :'KS' and event_type = 'TeamAccessChanged') = 1 h_karyawan_diberi_tahu;
update kos_members set role = 'kasir' where kos_id = :'K' and user_id = :'KS';
select pg_temp.sebagai('');
insert into approvals(id, number, kos_id, action_code, summary, requested_by, status)
  values ('ab0b0b0b-0000-0000-0000-0000000000a1', 'PRS-UJI-1', :'K', (select code from approval_actions limit 1), 'Minta batal penjualan', :'KS', 'menunggu');
select pg_temp.n(:'PM', 'ApprovalRequested') = 1 h_pemilik_penyetuju_dapat,
       pg_temp.n(:'KS', 'ApprovalRequested') = 0 h_peminta_tidak_dapat,
       pg_temp.n(:'GD', 'ApprovalRequested') = 0 h_bukan_penyetuju_tidak;
update approvals set status = 'dijalankan' where id = 'ab0b0b0b-0000-0000-0000-0000000000a1';
select pg_temp.n(:'KS', 'ApprovalDecided') = 1 h_peminta_diberi_tahu_keputusan;

\echo == I. Klaim & laporan pengiriman (server)
update notif_prefs set cats = '{}' where user_id = :'PM';
select notif_emit(:'K', 'SaleVoided', 'uji-kirim-1', 'sell', 'Kirim satu', 1, '{}', null, 'sale', null) >= 1 i_emit_1;
select notif_emit(:'K', 'SaleVoided', 'uji-kirim-2', 'sell', 'Kirim dua', 1, '{}', null, 'sale', null) >= 1 i_emit_2;
update notif_queue set next_at = now() where status = 'antre';
set role service_role;
select jsonb_array_length(notif_claim(100)) as diklaim \gset
reset role;
select :diklaim >= 1 i_ada_yang_diklaim,
       (select count(*) from notif_queue where status = 'proses') = :diklaim i_status_proses,
       (select count(*) from notif_queue q join notif_items n on n.id = q.notif_id where n.event_key = 'SaleVoided:uji-batal-4' and q.status = 'dilewati') = 1 i_sudah_dibaca_dilewati;
set role service_role;
select jsonb_array_length(notif_claim(100)) = 0 i_klaim_kedua_kosong;
reset role;
select id as sub1 from push_subscriptions where endpoint = 'https://push.example.com/a1' \gset
select min(id) as q1, max(id) as q2 from notif_queue where status = 'proses' \gset
select :q1 <> :q2 i_dua_antrean_diproses;
set role service_role;
select notif_report(jsonb_build_array(
  jsonb_build_object('queue_id', :q1, 'outcome', 'terkirim', 'subs', jsonb_build_array(jsonb_build_object('id', :'sub1', 'status', 'diterima', 'http', 201))),
  jsonb_build_object('queue_id', :q2, 'outcome', 'ulang', 'error', 'HTTP 503', 'subs', jsonb_build_array(jsonb_build_object('id', :'sub1', 'status', 'ditunda', 'http', 503)))
)) ->> 'terkirim' = '1' i_laporan;
reset role;
select (select status = 'terkirim' and devices = 1 from notif_queue where id = :q1) i_terkirim_diterima_layanan,
       (select status = 'antre' and next_at > now() from notif_queue where id = :q2) i_ulang_dengan_jeda,
       (select last_success_at is not null from push_subscriptions where id = :'sub1') i_perangkat_sukses_dicatat,
       (select count(*) = 2 from notif_deliveries where queue_id in (:q1, :q2)) i_log_per_perangkat;
update notif_queue set status = 'terkirim' where status = 'proses';
select notif_emit(:'K', 'SaleVoided', 'uji-batal-8', 'sell', 'Untuk 410', 1, '{}', null, 'sale', null) >= 1 i_emit_410;
set role service_role;
select (notif_claim(100) -> 0 ->> 'queue_id')::bigint as q3 \gset
select notif_report(jsonb_build_array(jsonb_build_object('queue_id', :q3, 'outcome', 'gagal', 'error', 'hilang',
  'subs', jsonb_build_array(jsonb_build_object('id', :'sub1', 'status', 'kedaluwarsa', 'http', 410))))) is not null i_410;
reset role;
select (select status = 'kedaluwarsa' from push_subscriptions where id = :'sub1') i_langganan_410_kedaluwarsa,
       (select status = 'gagal' from notif_queue where id = :q3) i_antrean_gagal;
-- sudah dibaca di aplikasi sebelum push dikirim → dilewati (hemat)
set role service_role;
select (push_sub_save(:'PM', 'https://push.example.com/a2', 'enc2', 'APPKEY', 'dev-hp-2', 'Laptop · Chrome', 'windows', 'chrome', false) ->> 'id') is not null i_perangkat_kedua;
reset role;
select notif_emit(:'K', 'SaleVoided', 'uji-batal-7', 'sell', 'Batal dibaca dulu', 1, '{}', null, 'sale', null) >= 1 i_emit_push;
update notif_items set read_at = now() where event_key = 'SaleVoided:uji-batal-7' and user_id = :'PM';
update notif_queue set status = 'terkirim' where status in ('antre','proses') and notif_id not in (select id from notif_items where event_key = 'SaleVoided:uji-batal-7');
set role service_role;
select jsonb_array_length(notif_claim(100)) = 0 i_dibaca_tidak_diklaim;
reset role;
select (select q.status = 'dilewati' from notif_queue q join notif_items n on n.id = q.notif_id where n.event_key = 'SaleVoided:uji-batal-7' and n.user_id = :'PM') i_dilewati;

\echo == J. Uji kirim, perangkat milik sendiri saja
set role authenticated;
select pg_temp.sebagai(:'PM');
select (notif_test() ->> 'devices')::int = 1 j_uji_ke_perangkat_aktif,
       jsonb_array_length(push_devices()) = 2 j_daftar_perangkat_sendiri;
select pg_temp.sebagai(:'GD');
select pg_temp.gagal('select notif_test()') like 'Belum ada perangkat%' j_tanpa_perangkat_ditolak,
       jsonb_array_length(push_devices()) = 0 j_perangkat_orang_tidak_terlihat,
       pg_temp.gagal(format('select push_device_delete(%L)', :'sub1')) like 'Perangkat tidak ditemukan%' j_hapus_perangkat_orang_ditolak;
select pg_temp.sebagai(:'PM');
select push_device_set((select (x->>'id')::uuid from jsonb_array_elements(push_devices()) x where x->>'label' = 'Laptop · Chrome'), false, 'Laptop kantor') \g /dev/null
select (select (x->>'enabled')::boolean = false and x->>'label' = 'Laptop kantor' from jsonb_array_elements(push_devices()) x where x->>'device_id' = 'dev-hp-2') j_perangkat_mati_dan_berganti_nama;

\echo == K. Tautan aman, bisnis tutup, transaksi tidak pernah gagal karena notifikasi
reset role;
select notif_link_ok('/penjualan') and notif_link_ok('/penjualan?tab=offline') and notif_link_ok('/proyek/ab0b0b0b-0000-0000-0000-0000000000a1') k_tautan_sah,
       not notif_link_ok('https://jahat.com') and not notif_link_ok('//jahat.com') and not notif_link_ok('/a/../b') and not notif_link_ok('javascript:alert(1)')
       and not notif_link_ok('/x"><script>') k_tautan_berbahaya_ditolak;
update kos set closed_at = now() where id = :'KT';
select notif_emit(:'KT', 'SaleVoided', 'uji-tutup', 'sell', 'x', 1, '{}', null, 'sale', null) = 0 k_bisnis_tutup_tanpa_notifikasi;
-- rusakkan penentu penerima sementara: penjualan TETAP tersimpan, galat hanya dicatat
alter function public.notif_targets(uuid, text, text, text, uuid, uuid, jsonb) rename to notif_targets_asli;
create function public.notif_targets(uuid, text, text, text, uuid, uuid, jsonb) returns setof uuid language plpgsql as $$ begin raise exception 'rusak sengaja'; end $$;
set role authenticated;
select pg_temp.sebagai(:'KS');
select sale_create('ab0b0b0b-0000-0000-0000-0000000000e3', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 1)), 0, 'tunai', 999999, null, null, null) is not null k_transaksi_tetap_jalan;
reset role;
select (select count(*) from sales where id = 'ab0b0b0b-0000-0000-0000-0000000000e3') = 1 k_penjualan_tersimpan,
       (select last_error like '%rusak sengaja%' from notif_config) k_galat_dicatat;
drop function public.notif_targets(uuid, text, text, text, uuid, uuid, jsonb);
alter function public.notif_targets_asli(uuid, text, text, text, uuid, uuid, jsonb) rename to notif_targets;
-- stok 2 → 0 lewat penjualan → Stok habis (sekali per hari)
set role authenticated;
select pg_temp.sebagai(:'KS');
select sale_create('ab0b0b0b-0000-0000-0000-0000000000e4', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 2)), 0, 'tunai', 999999, null, null, null) is not null k_jual_habis;
reset role;
select (select count(*) from notif_items where user_id = :'GD' and event_type = 'StockOut' and body like 'Kopi susu habis%') = 1 k_stok_habis_ke_gudang;

\echo == L. Rotasi langganan, hapus, retensi, pengingat harian, admin
set role service_role;
select push_sub_rotate('https://push.example.com/a2', 'https://push.example.com/a3', 'enc3', 'APPKEY') l_rotasi_endpoint_terdaftar,
       not push_sub_rotate('https://tidak.terdaftar/x', 'https://push.example.com/a4', 'enc4', 'APPKEY') l_rotasi_asing_ditolak,
       (push_sub_check(:'PM', 'https://push.example.com/a3', true) ->> 'known')::boolean l_cek_perangkat,
       not (push_sub_check(:'GD', 'https://push.example.com/a3', true) ->> 'known')::boolean l_cek_perangkat_akun_lain,
       push_sub_remove(:'PM', 'https://push.example.com/a3') l_hapus_saat_keluar;
select (notif_daily_tick() ? 'dibuat') l_pengingat_harian_jalan;
reset role;
update notif_items set expires_at = now() - interval '1 day' where event_key = 'SaleVoided:uji-batal-1';
set role service_role;
select (notif_purge() ->> 'notifikasi')::int >= 1 l_retensi;
reset role;
insert into admin_staff(email, role, active) values ('super-nt@x.com', 'super_admin', true) on conflict do nothing;
insert into auth.users(id,email) values ('ab0b0b0b-0000-0000-0000-000000000009','super-nt@x.com') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', 'ab0b0b0b-0000-0000-0000-000000000009', false), set_config('request.jwt.claims', json_build_object('sub', 'ab0b0b0b-0000-0000-0000-000000000009', 'email', 'super-nt@x.com', 'aal', 'aal2')::text, false) \g /dev/null
select (admin_notif_overview() ? 'perangkat_aktif') l_admin_angka;
select pg_temp.sebagai(:'PM');
select pg_temp.gagal('select admin_notif_overview()') like 'Tidak punya izin%' l_bukan_admin_ditolak;
reset role;
