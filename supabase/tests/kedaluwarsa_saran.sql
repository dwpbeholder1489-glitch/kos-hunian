-- Uji batch & kedaluwarsa (FEFO, mutasi, buang batch) dan saran belanja ulang.
-- Jalankan di database baru: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/kedaluwarsa_saran.sql"
-- Lulus = semua kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('b7b7b7b7-0000-0000-0000-000000000001','exp@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('b7b7b7b7-0000-0000-0000-00000000000a','Toko Exp','b7b7b7b7-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('b7b7b7b7-0000-0000-0000-00000000000a','b7b7b7b7-0000-0000-0000-000000000001','pemilik');
\set K 'b7b7b7b7-0000-0000-0000-00000000000a'
set role authenticated;
select set_config('request.jwt.claim.sub', 'b7b7b7b7-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"b7b7b7b7-0000-0000-0000-000000000001","email":"exp@x.com"}', false) \g /dev/null
select module_on(:'K', 'r_batch') a0_modul_aktif;
-- Susu: pcs; dus isi 24. Stok awal 10 pcs sebelum pencatatan dinyalakan.
select product_save(:'K', null, 'Susu UHT', 'pcs', 5000, 0, '[{"name":"pcs","qty":1,"price_retail":7000,"price_wholesale":0},{"name":"dus","qty":24,"price_retail":160000,"price_wholesale":0}]', 10, null) as susu \gset
select contact_save(:'K', null, 'supplier', 'CV Susu', null) as sup \gset

\echo == A. Nyalakan pencatatan: stok lama jadi batch "tanpa tanggal"
select (product_set_tracking(:'susu', true, 2) ->> 'batches_created')::int = 1 a_batch_awal;
select count(*) = 1 and sum(qty) = 10 and bool_and(expiry is null) a_tanpa_tanggal from stock_batches where product_id = :'susu';

\echo == B. Belanja 2 dus dengan dua tanggal kedaluwarsa (baris terpisah)
select purchase_create(gen_random_uuid(), :'K', current_date, :'sup',
  jsonb_build_array(jsonb_build_object('product_id', :'susu', 'unit', 'dus', 'qty', 1, 'price', 110000, 'expiry', current_date + 20, 'lot', 'L-A'),
                    jsonb_build_object('product_id', :'susu', 'unit', 'dus', 'qty', 1, 'price', 110000, 'expiry', current_date + 90, 'lot', 'L-B')), 'tunai', null, null) \g /dev/null
select count(*) = 3 b_tiga_batch, sum(qty) = 58 b_total_58 from stock_batches where product_id = :'susu' and qty > 0;
select (select stock from products where id = :'susu') = 58 b_stok_produk;

\echo == C. Jual 30 pcs → FEFO: L-A (exp +20) habis 24, lalu L-B 6; batch tanpa tanggal terakhir
select sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'susu', 'unit', 'pcs', 'qty', 30)), 0, 'tunai') \g /dev/null
select (select qty from stock_batches where product_id = :'susu' and lot = 'L-A') = 0 c_la_habis,
       (select qty from stock_batches where product_id = :'susu' and lot = 'L-B') = 18 c_lb_sisa,
       (select qty from stock_batches where product_id = :'susu' and expiry is null) = 10 c_tanpa_tanggal_utuh;

\echo == D. Isi tanggal batch lama, pisahkan sebagian, lalu buang yang kedaluwarsa
select id as old from stock_batches where product_id = :'susu' and expiry is null \gset
select batch_set(:'old', current_date - 1, 'LAMA') \g /dev/null
select batch_split(:'old', 4, current_date + 5, 'LAMA-2') \g /dev/null
select (select qty from stock_batches where id = :'old') = 6 d_sisa_dipisah;
select batch_writeoff(:'old', 6, 'kedaluwarsa', 'sudah lewat') = 6 d_dibuang;
select (select stock from products where id = :'susu') = 22 d_stok_produk, (select qty from stock_batches where id = :'old') = 0 d_batch_kosong,
       (select count(*) from stock_moves where product_id = :'susu' and kind = 'kedaluwarsa') = 1 d_tercatat;
select jsonb_array_length(expiry_list(:'K', 30)) = 1 d_daftar_30_hari;  -- LAMA-2 (+5); L-B +90 tidak

\echo == E. Retur jual masuk ke batch terbaru; batal penjualan juga
select sale_create('b7b7b7b7-0000-0000-0000-0000000000e1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'susu', 'unit', 'pcs', 'qty', 2)), 0, 'tunai') \g /dev/null
select sale_void('b7b7b7b7-0000-0000-0000-0000000000e1', 'salah input') \g /dev/null
select (select sum(qty) from stock_batches where product_id = :'susu') = (select stock from products where id = :'susu') e_batch_sama_stok;

\echo == F. Saran belanja: rata-rata keluar 30+2 pcs / 30 hari, stok 22 → belum perlu; naikkan minimum → muncul
select jsonb_array_length(reorder_suggest(:'K')) = 0 f_belum_perlu;
reset role; update products set min_stock = 30 where id = :'susu'; set role authenticated;
select reorder_suggest(:'K') -> 0 as s \gset
select :'s'::jsonb ->> 'unit' = 'dus' f_satuan_beli, (:'s'::jsonb ->> 'suggest')::int >= 1 f_jumlah, :'s'::jsonb ->> 'supplier' = 'CV Susu' f_supplier_terakhir;

\echo == G. Mutasi ke gudang: batch ikut pindah dengan tanggal yang sama (FEFO dari lokasi asal)
reset role;
insert into branches(id, kos_id, name, kind) values ('b7b7b7b7-0000-0000-0000-0000000000a9', :'K', 'Gudang Belakang', 'gudang');
set role authenticated;
select branch_id as main from stock_batches where product_id = :'susu' and qty > 0 limit 1 \gset
select stock_transfer(gen_random_uuid(), :'K', :'main', 'b7b7b7b7-0000-0000-0000-0000000000a9', jsonb_build_array(jsonb_build_object('product_id', :'susu', 'qty', 5)), 'uji') \g /dev/null
select sum(qty) = 5 g_gudang_5, min(expiry) = current_date + 5 g_tanggal_terbawa from stock_batches where product_id = :'susu' and branch_id = 'b7b7b7b7-0000-0000-0000-0000000000a9' and qty > 0;
select (select sum(qty) from stock_batches where product_id = :'susu') = (select stock from products where id = :'susu') g_total_tetap;
