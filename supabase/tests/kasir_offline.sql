-- Uji Tahap 4 Retail — Kasir offline (migrasi 20261121220000): pos_offline_submit (idempoten, waktu asli, temuan untuk pemilik),
-- pos_offline_list/review, lonceng. Database baru; lulus = semua kolom t, tanpa ERROR.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('0ff10000-0000-0000-0000-000000000001','pemilik-off@x.com'), ('0ff10000-0000-0000-0000-000000000002','kasir-off@x.com'),
  ('0ff10000-0000-0000-0000-000000000003','asing-off@x.com'), ('0ff10000-0000-0000-0000-000000000004','kasir2-off@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('0ff10000-0000-0000-0000-00000000000a','Toko Offline','0ff10000-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  ('0ff10000-0000-0000-0000-00000000000b','Toko Lain','0ff10000-0000-0000-0000-000000000003','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('0ff10000-0000-0000-0000-00000000000a','0ff10000-0000-0000-0000-000000000001','pemilik'),
  ('0ff10000-0000-0000-0000-00000000000a','0ff10000-0000-0000-0000-000000000002','kasir'),
  ('0ff10000-0000-0000-0000-00000000000a','0ff10000-0000-0000-0000-000000000004','kasir'),
  ('0ff10000-0000-0000-0000-00000000000b','0ff10000-0000-0000-0000-000000000003','pemilik');
\set K '0ff10000-0000-0000-0000-00000000000a'
\set K2 '0ff10000-0000-0000-0000-00000000000b'
\set KO '0ff10000-0000-0000-0000-000000000001'
\set KS '0ff10000-0000-0000-0000-000000000002'
\set KX '0ff10000-0000-0000-0000-000000000003'
\set KS2 '0ff10000-0000-0000-0000-000000000004'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u)::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.stok(p uuid) returns numeric language sql security definer as $$ select stock from public.products where id = p $$;
create or replace function pg_temp.s(i uuid) returns public.sales language sql security definer as $$ select * from public.sales where id = i $$;
create or replace function pg_temp.o(i uuid) returns public.pos_offline language sql security definer as $$ select * from public.pos_offline where id = i $$;
create or replace function pg_temp.nkontak(k uuid, n text) returns bigint language sql security definer as $$ select count(*) from public.contacts where kos_id = k and name = n $$;
create or replace function pg_temp.gerak_at(i uuid, t timestamptz) returns boolean language sql security definer as $$ select bool_and(created_at = t) and count(*) > 0 from public.stock_moves where ref_id = i $$;
create or replace function pg_temp.nsale(i uuid) returns bigint language sql security definer as $$ select count(*) from public.sales where id = i $$;
create or replace function pg_temp.ovr(i uuid) returns text language sql security definer as $$ select reason from public.discount_overrides where sale_id = i $$;
create or replace function pg_temp.ada(r jsonb, c text) returns boolean language sql as $$ select exists (select 1 from jsonb_array_elements(r -> 'issues') i where i ->> 'code' = c) $$;
-- transaksi HP: id, waktu, baris [{product_id, unit, qty, price}], cara bayar, tambahan
create or replace function pg_temp.tx(i text, at timestamptz, lines jsonb, method text default 'tunai', extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('id', i, 'client_at', at, 'tier', 'ecer', 'lines', lines, 'discount', 0, 'method', method, 'device', 'uji') || extra $$;

set role authenticated;
select pg_temp.sebagai(:'KO');
select product_save(:'K', null, 'Gula pasir', 'kg', 15000, 0, '[{"name":"kg","price_retail":18000}]', 20, null) as gula \gset
select product_save(:'K', null, 'Teh celup', 'pcs', 3000, 0, '[{"name":"pcs","price_retail":5000}]', 2, null) as teh \gset
select product_save(:'K', null, 'Kopi', 'pcs', 1000, 0, '[{"name":"pcs","price_retail":2000}]', 50, null) as kopi \gset
select pg_temp.sebagai(:'KX');
select product_save(:'K2', null, 'Barang toko lain', 'pcs', 1000, 0, '[{"name":"pcs","price_retail":2000}]', 5, null) as lain \gset
select pg_temp.sebagai(:'KO');
select contact_save(:'K', null, 'pelanggan', 'Bu Ani', '0813') as ani \gset

\echo == A. Simpan dari antrean HP, waktu asli, idempoten
select pg_temp.sebagai(:'KS');
select (now() - interval '1 day 2 hours') as kemarin \gset
select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000001', :'kemarin',
  jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'kg', 'qty', 2, 'price', 18000)), 'tunai', '{"paid":40000,"total":36000}')) as r1 \gset
select :'r1'::jsonb ->> 'status' = 'tersimpan' and (:'r1'::jsonb ->> 'total')::numeric = 36000 a1_tersimpan_tanpa_temuan;
select (x).sale_date = ((:'kemarin')::timestamptz at time zone 'Asia/Jakarta')::date and (x).sold_at = (:'kemarin')::timestamptz
   and (x).number like 'TRX-' || to_char(((:'kemarin')::timestamptz at time zone 'Asia/Jakarta')::date, 'YYMMDD') || '-%' and (x).created_by = :'KS'::uuid and (x).paid_amount = 40000
  a2_tanggal_nomor_jam_ikut_waktu_hp from (select pg_temp.s('0ff1a000-0000-0000-0000-000000000001') x) z;
select pg_temp.gerak_at('0ff1a000-0000-0000-0000-000000000001', :'kemarin') a3_kartu_stok_ikut_waktu_hp;
select pg_temp.stok(:'gula') = 18 a4_stok_berkurang;
select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000001', :'kemarin',
  jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'kg', 'qty', 2, 'price', 18000)))) as r1b \gset
select (:'r1b'::jsonb ->> 'duplicate')::boolean and :'r1b'::jsonb ->> 'number' = (:'r1'::jsonb ->> 'number') and pg_temp.stok(:'gula') = 18
   and pg_temp.nsale('0ff1a000-0000-0000-0000-000000000001') = 1 a5_kirim_ulang_tidak_dobel;
-- terlanjur tersimpan online (jawaban tidak sampai), lalu dikirim lagi dari antrean
select sale_create('0ff1a000-0000-0000-0000-000000000002', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 1)), 0, 'tunai') is not null \g /dev/null
select (r ->> 'duplicate')::boolean and r ->> 'status' = 'tersimpan' and pg_temp.o('0ff1a000-0000-0000-0000-000000000002') is null
  a6_sudah_tersimpan_online_dikenali from (select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000002', now(),
  jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 1, 'price', 2000)))) r) z;

\echo == B. Temuan untuk pemilik (tetap tersimpan)
select pg_temp.sebagai(:'KO');
select product_save(:'K', :'teh', 'Teh celup', 'pcs', 3000, 0, '[{"name":"pcs","price_retail":5500}]', 0, null) is not null \g /dev/null
select stock_policy_set(:'K', 'tolak') is not null \g /dev/null
select pg_temp.sebagai(:'KS');
-- harga di HP masih 5000 (sudah naik 5500) + stok teh 2 dijual 3 dengan aturan 'tolak'
select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000003', now() - interval '20 minutes',
  jsonb_build_array(jsonb_build_object('product_id', :'teh', 'unit', 'pcs', 'qty', 3, 'price', 5000)), 'tunai', '{"total":15000}')) as r3 \gset
select :'r3'::jsonb ->> 'status' = 'perlu_cek' and pg_temp.ada(:'r3', 'harga') and pg_temp.ada(:'r3', 'stok') b1_harga_lama_dan_stok_minus_tercatat;
select (pg_temp.s('0ff1a000-0000-0000-0000-000000000003')).total = 15000 and pg_temp.stok(:'teh') = -1 b2_harga_yang_ditagih_dipakai;
select pg_temp.gagal(format($$select sale_create(gen_random_uuid(), %L, 'ecer', '[{"product_id":"%s","unit":"pcs","qty":1}]', 0, 'tunai')$$, :'K', :'teh')) like '%STOK_KURANG%' b3_kasir_online_tetap_ditolak;
-- harga yang diubah manual di HP bukan temuan harga
select pg_temp.ada(r, 'harga') = false b4_harga_manual_bukan_temuan from (select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000004', now(),
  jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 1, 'price', 1500, 'manual', true)))) r) z;
select pg_temp.sebagai(:'KO');
select stock_policy_set(:'K', 'izinkan') is not null \g /dev/null
-- promo yang tidak terhitung
select promo_save(:'K', null, jsonb_build_object('name', 'Kopi 10%', 'kind', 'diskon', 'percent', 10, 'product_ids', jsonb_build_array(:'kopi'))) is not null \g /dev/null
-- batas diskon 10% & margin minimum
select price_policy_set(:'K', 10, null) is not null \g /dev/null
select pg_temp.sebagai(:'KS');
select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000005', now(),
  jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 10, 'price', 2000)), 'tunai', '{"discount":5000,"override_reason":"langganan lama"}')) as r5 \gset
select pg_temp.ada(:'r5', 'promo') and pg_temp.ada(:'r5', 'batas_diskon') and :'r5'::jsonb::text like '%langganan lama%' b5_promo_dan_batas_diskon_tercatat;
select (x).total = 15000 and (x).promo_discount = 0 and pg_temp.ovr((x).id) is null b6_tersimpan_tanpa_izin_resmi from (select pg_temp.s('0ff1a000-0000-0000-0000-000000000005') x) z;
select pg_temp.gagal(format($$select sale_create(gen_random_uuid(), %L, 'ecer', '[{"product_id":"%s","unit":"pcs","qty":10}]', 5000, 'tunai')$$, :'K', :'kopi')) like '%BATAS_DISKON%' b7_online_tetap_dijaga;
-- pemilik offline dengan alasan = izin resmi (tercatat di discount_overrides), bukan temuan
select pg_temp.sebagai(:'KO');
select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000006', now(),
  jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 10, 'price', 2000)), 'tunai', '{"discount":5000,"override_reason":"pelanggan tetap"}')) as r6 \gset
select not pg_temp.ada(:'r6', 'batas_diskon') and pg_temp.ovr('0ff1a000-0000-0000-0000-000000000006') = 'pelanggan tetap' b8_pemilik_mengizinkan;
select price_policy_set(:'K', null, null) is not null \g /dev/null
select pg_temp.sebagai(:'KS');
-- jam HP di masa depan → dipakai waktu terima
select pg_temp.ada(r, 'jam') and (pg_temp.s('0ff1a000-0000-0000-0000-000000000007')).sold_at <= now() b9_jam_hp_maju
  from (select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000007', now() + interval '3 hours',
  jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'kg', 'qty', 1, 'price', 18000)))) r) z;
select pg_temp.ada(r, 'lama') b10_transaksi_lama_ditandai from (select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000008', now() - interval '5 days',
  jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'kg', 'qty', 1, 'price', 18000)))) r) z;

\echo == C. Kasbon & pelanggan baru di HP, transfer, campuran
select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000011', now(),
  jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'kg', 'qty', 1, 'price', 18000)), 'kasbon',
  '{"new_contact":{"key":"new:hp1","name":"Pak Darto","phone":"0819"},"due":"2030-01-01","total":18000}')) as c1 \gset
select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000012', now(),
  jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'kg', 'qty', 1, 'price', 18000)), 'campuran',
  '{"new_contact":{"key":"new:hp1","name":"Pak Darto","phone":"0819"},"payments":[{"method":"tunai","amount":8000},{"method":"kasbon","amount":10000}],"total":18000}')) as c2 \gset
select :'c1'::jsonb ->> 'status' <> 'gagal' and :'c2'::jsonb ->> 'status' <> 'gagal'
   and pg_temp.nkontak(:'K', 'Pak Darto') = 1
   and (pg_temp.s('0ff1a000-0000-0000-0000-000000000011')).contact_id = (pg_temp.s('0ff1a000-0000-0000-0000-000000000012')).contact_id
  c1_pelanggan_baru_hp_jadi_satu;
select (x).amt_kasbon = 18000 and (x).due_date = '2030-01-01' c2_kasbon_dan_janji_bayar from (select pg_temp.s('0ff1a000-0000-0000-0000-000000000011') x) z;
select (x).amt_tunai = 8000 and (x).amt_kasbon = 10000 and (x).pay_method = 'campuran' c3_campuran from (select pg_temp.s('0ff1a000-0000-0000-0000-000000000012') x) z;
select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000013', now(),
  jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 1, 'price', 2000)), 'transfer')) \g /dev/null
select (pg_temp.s('0ff1a000-0000-0000-0000-000000000013')).amt_transfer = 2000 c4_transfer;
select r ->> 'status' = 'gagal' and r ->> 'error' like '%Nota kredit%' and pg_temp.nsale('0ff1a000-0000-0000-0000-000000000014') = 0 c5_nota_kredit_tidak_offline
  from (select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000014', now(),
  jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 1, 'price', 2000)), 'nota')) r) z;

\echo == D. Gagal disimpan → dicatat untuk pemilik; akses
select r ->> 'status' = 'gagal' and r ->> 'error' like '%Barang tidak ditemukan%'
   and (pg_temp.o('0ff1a000-0000-0000-0000-000000000021')).payload -> 'lines' -> 0 ->> 'name' = 'Barang hapus' d1_barang_tak_ada_dicatat
  from (select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000021', now(),
  jsonb_build_array(jsonb_build_object('product_id', gen_random_uuid(), 'name', 'Barang hapus', 'unit', 'pcs', 'qty', 1, 'price', 2000)))) r) z;
-- kasir kedua belum pernah berjualan; dicabut → ditolak (tidak bisa mengisi catatan)
select pg_temp.sebagai(:'KO');
select team_remove(:'K', :'KS2') is null \g /dev/null
select team_remove(:'K', :'KS') is null \g /dev/null
select pg_temp.sebagai(:'KS2');
select pg_temp.gagal(format($$select pos_offline_submit(%L, '{"id":"0ff1a000-0000-0000-0000-000000000022","client_at":"%s","lines":[]}')$$, :'K', now())) like '%akses%' d2_bukan_anggota_ditolak;
-- kasir pertama sudah pernah berjualan; dicabut → transaksi dicatat sebagai gagal untuk pemilik (bukan penjualan)
select pg_temp.sebagai(:'KS');
select r ->> 'status' = 'gagal' and r ->> 'error' like '%dicabut%' and pg_temp.nsale('0ff1a000-0000-0000-0000-000000000023') = 0 d3_akses_dicabut_dicatat
  from (select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000023', now(),
  jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 1, 'price', 2000)))) r) z;
select (pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000023', now(), '[]')) ->> 'duplicate')::boolean d8_kasir_dicabut_kirim_ulang_hasil_sama;
select pg_temp.sebagai(:'KX');
select pg_temp.gagal(format($$select pos_offline_submit(%L, '{"id":"0ff1a000-0000-0000-0000-000000000024","client_at":"%s","lines":[]}')$$, :'K', now())) like '%akses%' d4_orang_asing_ditolak;
select pg_temp.gagal(format($$select pos_offline_submit(%L, '{"id":"0ff1a000-0000-0000-0000-000000000001","client_at":"%s","lines":[]}')$$, :'K2', now())) like '%tidak valid%' d5_id_milik_bisnis_lain_ditolak;
select pg_temp.gagal(format($$select pos_offline_list(%L)$$, :'K')) like '%akses%' d6_daftar_hanya_keuangan;
select pg_temp.gagal(format($$select pos_offline_submit(%L, '{"id":"0ff1a000-0000-0000-0000-000000000003","client_at":"%s"}')$$, :'K', now())) like '%akses%' d7_orang_asing_tidak_bisa_baca_hasil;
select pg_temp.gagal(format($$select pos_offline_submit(%L, '{"id":"0ff1a000-0000-0000-0000-000000000002","client_at":"%s"}')$$, :'K', now())) like '%akses%' d9_orang_asing_tidak_bisa_cek_penjualan;

\echo == E. Shift & tutup harian
reset role;
insert into kos_members(kos_id,user_id,role) values (:'K', :'KS', 'kasir');
set role authenticated;
select pg_temp.sebagai(:'KS');
select shift_open(:'K', 100000) \g /dev/null
reset role; update cash_shifts set opened_at = now() - interval '3 hours' where kos_id = :'K' and user_id = :'KS'; set role authenticated;
select shift_close(:'K', 100000, null) \g /dev/null
select pg_temp.ada(r, 'shift') e1_shift_sudah_tutup_ditandai from (select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000031', now() - interval '1 hour',
  jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 1, 'price', 2000)))) r) z;
select pg_temp.sebagai(:'KO');
select day_close(:'K', (now() at time zone 'Asia/Jakarta')::date, null, null, null) is not null \g /dev/null
select pg_temp.sebagai(:'KS');
select pg_temp.ada(r, 'tutup_hari') e2_tutup_harian_ditandai from (select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000032', now(),
  jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 1, 'price', 2000)))) r) z;
select shift_open(:'K', 50000) \g /dev/null
reset role; update cash_shifts set opened_at = now() - interval '2 hours' where kos_id = :'K' and user_id = :'KS' and closed_at is null; set role authenticated;
select pos_offline_submit(:'K', pg_temp.tx('0ff1a000-0000-0000-0000-000000000033', now() - interval '30 minutes',
  jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 2, 'price', 2000)))) \g /dev/null
select ((shift_current(:'K') -> 'summary') ->> 'tunai')::numeric >= 4000 e3_masuk_shift_berjalan;

\echo == F. Pemilik: daftar, lonceng, tandai dicek
select pg_temp.sebagai(:'KO');
select pos_offline_list(:'K') as lst \gset
select (:'lst'::jsonb ->> 'open')::int >= 8 and exists (select 1 from jsonb_array_elements(:'lst'::jsonb -> 'rows') x where x ->> 'cashier' = 'kasir-off@x.com' and x ->> 'status' = 'gagal' and x -> 'lines' -> 0 ->> 'name' = 'Barang hapus')
   and not exists (select 1 from jsonb_array_elements(:'lst'::jsonb -> 'rows') x where x ->> 'status' = 'tersimpan') f1_daftar_perlu_dicek;
select pos_offline_review('0ff1a000-0000-0000-0000-000000000003', 'sudah hitung ulang teh') is null \g /dev/null
select (x).reviewed_by = 'pemilik-off@x.com' and (x).review_note = 'sudah hitung ulang teh' f2_tandai_dicek from (select pg_temp.o('0ff1a000-0000-0000-0000-000000000003') x) z;
select not exists (select 1 from jsonb_array_elements(pos_offline_list(:'K') -> 'rows') x where x ->> 'id' = '0ff1a000-0000-0000-0000-000000000003')
   and exists (select 1 from jsonb_array_elements(pos_offline_list(:'K', 'semua') -> 'rows') x where x ->> 'id' = '0ff1a000-0000-0000-0000-000000000003') f3_filter;
select pg_temp.gagal($$select pos_offline_review('0ff1a000-0000-0000-0000-000000000001')$$) like '%tidak perlu%' f4_yang_bersih_tidak_perlu_dicek;
select jsonb_array_length(retail_alerts(:'K') -> 'offline') >= 1 f5_lonceng_pemilik;
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select pos_offline_review('0ff1a000-0000-0000-0000-000000000005')$$)) like '%tidak ditemukan%' f6_kasir_tidak_bisa_tandai;
select pg_temp.sebagai(:'KX');
select pg_temp.gagal(format($$select pos_offline_list(%L)$$, :'K')) like '%akses%' f7_bisnis_lain_tidak_bisa_lihat;
reset role;
select (select count(*) from pg_policies where tablename = 'pos_offline') = 0 and not has_table_privilege('authenticated', 'public.pos_offline', 'select') f8_tabel_tertutup;
select coalesce(current_setting('prasara.offline_ok', true), '') = '' f9_flag_bersih;
\echo == SELESAI
