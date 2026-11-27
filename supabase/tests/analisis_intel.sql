-- Uji Analisis Bisnis (biz_intel). Jalankan di database baru (semua migrasi terpasang):
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/analisis_intel.sql"
-- Lulus = semua kolom ber-awalan huruf uji bernilai t / angka yang tertulis di namanya, dan baris NOTICE berawalan OK.
-- Skenario toko 2 cabang (sama dengan analisis_bisnis.sql) + kontak pelanggan & kategori:
--   bulan lalu: jual 1.000.000 (modal 600.000) ke Pelanggan X di Pusat
--   bulan ini : 1.000.000 (Pelanggan X, Pusat), 500.000 (tanpa kontak, Pusat), 500.000 (Pelanggan Y, Cabang B); biaya listrik 200.000 tunai (Pusat)
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('a8a8a8a8-0000-0000-0000-000000000001','intel@x.com'), ('a8a8a8a8-0000-0000-0000-000000000009','luar@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status,business_type) values
  ('a8a8a8a8-0000-0000-0000-00000000000f','Toko Intel','a8a8a8a8-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail')
on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values ('a8a8a8a8-0000-0000-0000-00000000000f','a8a8a8a8-0000-0000-0000-000000000001','pemilik') on conflict do nothing;
\set K 'a8a8a8a8-0000-0000-0000-00000000000f'
update branches set name = 'Pusat' where kos_id = :'K' and is_main;
insert into branches(id,kos_id,name,kind,is_main,active) values ('a8a8a8a8-0000-0000-0000-0000000000b2', :'K', 'Cabang B', 'cabang', false, true) on conflict do nothing;
select id as b1 from branches where kos_id = :'K' and is_main \gset
insert into product_categories(id,kos_id,name) values ('a8a8a8a8-0000-0000-0000-0000000000a1', :'K', 'Sembako') on conflict do nothing;
insert into products(id,kos_id,name,base_unit,cost,stock,category_id) values
  ('a8a8a8a8-0000-0000-0000-0000000000d1', :'K', 'Beras 5kg', 'karung', 60000, 0, 'a8a8a8a8-0000-0000-0000-0000000000a1'),
  ('a8a8a8a8-0000-0000-0000-0000000000d2', :'K', 'Minyak 2L', 'botol', 30000, 0, null),
  ('a8a8a8a8-0000-0000-0000-0000000000d3', :'K', 'Gula 1kg', 'pak', 12000, 0, null) on conflict do nothing;
insert into contacts(id,kos_id,kind,name) values ('a8a8a8a8-0000-0000-0000-0000000000f1', :'K', 'pelanggan', 'Pelanggan X'),
  ('a8a8a8a8-0000-0000-0000-0000000000f2', :'K', 'pelanggan', 'Pelanggan Y') on conflict do nothing;
select date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date as m0, (now() at time zone 'Asia/Jakarta')::date as today \gset
select (:'m0'::date - interval '1 month')::date as p0, (:'m0'::date - 1) as p1 \gset
insert into sales(id,kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status,branch_id,contact_id) values
  ('a8a8a8a8-0000-0000-0000-0000000000c0', :'K', 'TI-0', (:'m0'::date - 10), 1000000, 1000000, 600000, 'tunai', 'selesai', :'b1', 'a8a8a8a8-0000-0000-0000-0000000000f1'),
  ('a8a8a8a8-0000-0000-0000-0000000000c1', :'K', 'TI-1', :'m0', 1000000, 1000000, 600000, 'tunai', 'selesai', :'b1', 'a8a8a8a8-0000-0000-0000-0000000000f1'),
  ('a8a8a8a8-0000-0000-0000-0000000000c2', :'K', 'TI-2', :'m0', 500000, 500000, 300000, 'tunai', 'selesai', :'b1', null),
  ('a8a8a8a8-0000-0000-0000-0000000000c3', :'K', 'TI-3', :'m0', 500000, 500000, 300000, 'tunai', 'selesai', 'a8a8a8a8-0000-0000-0000-0000000000b2', 'a8a8a8a8-0000-0000-0000-0000000000f2');
insert into sale_lines(sale_id,kos_id,product_id,name,unit,unit_qty,qty,price,cost,line_total) values
  ('a8a8a8a8-0000-0000-0000-0000000000c0', :'K', 'a8a8a8a8-0000-0000-0000-0000000000d1', 'Beras 5kg', 'karung', 1, 10, 100000, 60000, 1000000),
  ('a8a8a8a8-0000-0000-0000-0000000000c1', :'K', 'a8a8a8a8-0000-0000-0000-0000000000d1', 'Beras 5kg', 'karung', 1, 10, 100000, 60000, 1000000),
  ('a8a8a8a8-0000-0000-0000-0000000000c2', :'K', 'a8a8a8a8-0000-0000-0000-0000000000d2', 'Minyak 2L', 'botol', 1, 10, 50000, 30000, 500000),
  ('a8a8a8a8-0000-0000-0000-0000000000c3', :'K', 'a8a8a8a8-0000-0000-0000-0000000000d3', 'Gula 1kg', 'pak', 1, 25, 20000, 12000, 500000);
insert into expense_categories(id,kos_id,name) values ('a8a8a8a8-0000-0000-0000-0000000000e1', :'K', 'Listrik') on conflict do nothing;
insert into expenses(kos_id,date,category_id,kind,amount,description,branch_id) values (:'K', :'m0', 'a8a8a8a8-0000-0000-0000-0000000000e1', 'operasional', 200000, 'PLN', :'b1');
select set_config('request.jwt.claim.sub', 'a8a8a8a8-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a8a8a8a8-0000-0000-0000-000000000001"}', false) \g /dev/null

\echo == A. Pro: angka periode = jurnal, pembanding, arus kas = acct_cashflow, pelanggan, produk, cabang, heatmap
select biz_intel(:'K', :'m0', :'today', :'p0', :'p1') as x \gset
select :'x'::jsonb ->> 'level' a_level_mendalam,
       :'x'::jsonb -> 'cur' ->> 'pendapatan' a_pend_2000000, :'x'::jsonb -> 'cur' ->> 'hpp' a_hpp_1200000, :'x'::jsonb -> 'cur' ->> 'biaya' a_biaya_200000,
       :'x'::jsonb -> 'cur' ->> 'laba' a_laba_600000, :'x'::jsonb -> 'cur' ->> 'transaksi' a_trx_3, :'x'::jsonb -> 'cur' ->> 'pelanggan' a_pelanggan_2;
select :'x'::jsonb -> 'cmp' ->> 'pendapatan' a_cmp_1000000, :'x'::jsonb -> 'cmp' ->> 'transaksi' a_cmp_trx_1,
       jsonb_array_length(:'x'::jsonb -> 'tren') = 12 a_tren_12, jsonb_array_length(:'x'::jsonb -> 'harian') = (:'today'::date - :'m0'::date + 1) a_harian_per_hari;
-- tren bulan ini sama persis dengan biz_analysis (sumber lama)
select (select (b ->> 'pendapatan')::numeric from jsonb_array_elements(biz_analysis(:'K', :'m0') -> 'per_bulan') b where (b ->> 'bulan')::date = :'m0')
     = (select (t ->> 'pendapatan')::numeric from jsonb_array_elements(:'x'::jsonb -> 'tren') t where (t ->> 'mulai')::date = :'m0') a_tren_sama_biz_analysis;
-- arus kas sama dengan acct_cashflow
select (:'x'::jsonb -> 'kas' ->> 'masuk')::numeric = (acct_cashflow(:'K', :'m0', :'today') ->> 'masuk')::numeric a_kas_masuk_sama,
       (:'x'::jsonb -> 'kas' ->> 'keluar')::numeric = (acct_cashflow(:'K', :'m0', :'today') ->> 'keluar')::numeric a_kas_keluar_sama,
       (:'x'::jsonb -> 'kas' ->> 'cocok')::boolean a_kas_cocok,
       (select sum((b ->> 'masuk')::numeric) from jsonb_array_elements(:'x'::jsonb -> 'kas' -> 'buckets') b) = (:'x'::jsonb -> 'kas' ->> 'masuk')::numeric a_bucket_jumlah,
       :'x'::jsonb -> 'kas' ->> 'grain' a_grain_week;
select :'x'::jsonb -> 'pelanggan' ->> 'baru' a_baru_1, :'x'::jsonb -> 'pelanggan' ->> 'kadang' a_kadang_1, :'x'::jsonb -> 'pelanggan' ->> 'aktif' a_aktif_2,
       :'x'::jsonb -> 'pelanggan' ->> 'trx_kontak' a_trx_kontak_2, :'x'::jsonb -> 'pelanggan' ->> 'baru_lalu' a_baru_lalu_1,
       jsonb_array_length(:'x'::jsonb -> 'pelanggan' -> 'daftar') = 2 a_daftar_2;
select :'x'::jsonb -> 'produk' ->> 'total' a_produk_2000000, :'x'::jsonb -> 'produk' -> 'items' -> 0 ->> 'nama' a_teratas_beras,
       :'x'::jsonb -> 'produk' -> 'items' -> 0 ->> 'nilai_lalu' a_beras_lalu_1000000, :'x'::jsonb -> 'produk' ->> 'laba' a_produk_laba_800000;
select jsonb_array_length(:'x'::jsonb -> 'per_lokasi') = 2 a_2_lokasi,
       (select sum((c ->> 'n')::int) from jsonb_array_elements(:'x'::jsonb -> 'heatmap' -> 'sel') c) a_heatmap_3,
       (:'x'::jsonb -> 'posisi' ->> 'kas')::numeric = (:'x'::jsonb -> 'kas' ->> 'saldo_akhir')::numeric a_posisi_kas_sama,
       (:'x'::jsonb -> 'piutang_lewat' ->> 'nilai')::numeric = 0 a_piutang_lewat_0;
\echo -- filter cabang & kategori
select biz_intel(:'K', :'m0', :'today', :'p0', :'p1', 'a8a8a8a8-0000-0000-0000-0000000000b2') as xb \gset
select :'xb'::jsonb -> 'cur' ->> 'pendapatan' a_cabang_500000, :'xb'::jsonb -> 'cur' ->> 'transaksi' a_cabang_trx_1, :'xb'::jsonb ->> 'branch_name' a_nama_cabang;
select biz_intel(:'K', :'m0', :'today', :'p0', :'p1', null, 'a8a8a8a8-0000-0000-0000-0000000000a1') as xc \gset
select :'xc'::jsonb -> 'produk' ->> 'total' a_kategori_1000000, jsonb_array_length(:'xc'::jsonb -> 'produk' -> 'items') = 1 a_kategori_1_item,
       :'xc'::jsonb -> 'cur' ->> 'pendapatan' a_kategori_tidak_ubah_laba_rugi_2000000;
\echo -- periode panjang: arus kas per bulan
select biz_intel(:'K', :'p0', :'today') ->> 'kas' is not null a_kas_ada, biz_intel(:'K', (:'m0'::date - interval '5 month')::date, :'today') -> 'kas' ->> 'grain' a_grain_month,
       biz_intel(:'K', (:'m0'::date - interval '5 month')::date, :'today') ? 'harian' = false a_tanpa_harian_panjang;

\echo == B. Paket Bisnis: produk & pelanggan ada; cabang ditolak; tanpa heatmap/per_lokasi
update kos set plan = 'bisnis' where id = :'K';
select biz_intel(:'K', :'m0', :'today', :'p0', :'p1') as y \gset
select :'y'::jsonb ->> 'level' b_lanjutan, (:'y'::jsonb ? 'produk') b_produk, (:'y'::jsonb ? 'pelanggan') b_pelanggan,
       (:'y'::jsonb ? 'heatmap') = false b_tanpa_heatmap, (:'y'::jsonb ? 'per_lokasi') = false b_tanpa_lokasi;
do $$ begin perform biz_intel('a8a8a8a8-0000-0000-0000-00000000000f', date_trunc('month', now())::date, (now() at time zone 'Asia/Jakarta')::date, null, null, 'a8a8a8a8-0000-0000-0000-0000000000b2');
  raise notice 'GAGAL b: cabang di Paket Bisnis diterima';
exception when others then if sqlerrm like 'BATAS_PAKET:%' then raise notice 'OK b: cabang ditolak (BATAS_PAKET)'; else raise notice 'GAGAL b: %', sqlerrm; end if; end $$;

\echo == C. Paket Dasar: hanya bulan ini & lalu; pembanding tahun lalu dikunci; tanpa produk
update kos set plan = 'dasar' where id = :'K';
select biz_intel(:'K', :'m0', :'today', (:'m0'::date - interval '12 month')::date, (:'today'::date - interval '12 month')::date) as z \gset
select :'z'::jsonb ->> 'level' c_dasar, (:'z'::jsonb ->> 'cmp_terkunci')::boolean c_cmp_terkunci, :'z'::jsonb -> 'cmp' = 'null'::jsonb c_cmp_null,
       (:'z'::jsonb ? 'produk') = false c_tanpa_produk, jsonb_array_length(:'z'::jsonb -> 'tren') = 2 c_tren_2;
do $$ begin perform biz_intel('a8a8a8a8-0000-0000-0000-00000000000f', (date_trunc('month', now()) - interval '3 month')::date, (now() at time zone 'Asia/Jakarta')::date);
  raise notice 'GAGAL c: periode panjang di Dasar diterima';
exception when others then if sqlerrm like 'BATAS_PAKET:%' then raise notice 'OK c: periode panjang ditolak'; else raise notice 'GAGAL c: %', sqlerrm; end if; end $$;

\echo == D. Akses & validasi
do $$ begin perform biz_intel('a8a8a8a8-0000-0000-0000-00000000000f', (now() at time zone 'Asia/Jakarta')::date + 5, (now() at time zone 'Asia/Jakarta')::date + 6);
  raise notice 'GAGAL d: periode masa depan diterima';
exception when others then raise notice 'OK d: masa depan ditolak (%)', sqlerrm; end $$;
select set_config('request.jwt.claim.sub', 'a8a8a8a8-0000-0000-0000-000000000009', false), set_config('request.jwt.claims', '{"sub":"a8a8a8a8-0000-0000-0000-000000000009"}', false) \g /dev/null
do $$ begin perform biz_intel('a8a8a8a8-0000-0000-0000-00000000000f', date_trunc('month', now())::date, (now() at time zone 'Asia/Jakarta')::date);
  raise notice 'GAGAL d: orang luar bisa membaca';
exception when others then raise notice 'OK d: orang luar ditolak (%)', sqlerrm; end $$;
reset role;
set role anon;
do $$ begin perform biz_figures('a8a8a8a8-0000-0000-0000-00000000000f', '2026-01-01', '2026-01-31', 'all', null); raise notice 'GAGAL d: biz_figures terbuka';
exception when others then raise notice 'OK d: biz_figures tertutup'; end $$;
reset role;

\echo == E. Kos: hunian, tagihan, piutang lewat tempo
select set_config('request.jwt.claim.sub', 'a8a8a8a8-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a8a8a8a8-0000-0000-0000-000000000001"}', false) \g /dev/null
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('a8a8a8a8-0000-0000-0000-0000000000ff','Kos Intel','a8a8a8a8-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','properti') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values ('a8a8a8a8-0000-0000-0000-0000000000ff','a8a8a8a8-0000-0000-0000-000000000001','pemilik') on conflict do nothing;
\set Q 'a8a8a8a8-0000-0000-0000-0000000000ff'
insert into rooms(id,kos_id,code,rent) values ('a8a8a8a8-0000-0000-0000-000000000a01', :'Q', 'A1', 1000000), ('a8a8a8a8-0000-0000-0000-000000000a02', :'Q', 'A2', 1000000);
insert into occupants(id,kos_id,name) values ('a8a8a8a8-0000-0000-0000-000000000b01', :'Q', 'Budi');
insert into leases(id,kos_id,room_id,occupant_id,start_date,rent,billing_start,status) values
  ('a8a8a8a8-0000-0000-0000-000000000c01', :'Q', 'a8a8a8a8-0000-0000-0000-000000000a01', 'a8a8a8a8-0000-0000-0000-000000000b01', :'m0', 1000000, :'m0', 'aktif');
insert into invoices(id,kos_id,lease_id,room_id,occupant_id,kind,period_start,period_end,due_date,amount,status) values
  ('a8a8a8a8-0000-0000-0000-000000000d01', :'Q', 'a8a8a8a8-0000-0000-0000-000000000c01', 'a8a8a8a8-0000-0000-0000-000000000a01', 'a8a8a8a8-0000-0000-0000-000000000b01',
   'sewa', :'m0', (:'m0'::date + interval '1 month - 1 day')::date, :'today'::date - 1, 1000000, 'terbit')
on conflict do nothing;
delete from invoices where kos_id = :'Q' and id <> 'a8a8a8a8-0000-0000-0000-000000000d01';
insert into payments(kos_id,invoice_id,amount,paid_at,method,status) values (:'Q', 'a8a8a8a8-0000-0000-0000-000000000d01', 400000, :'today', 'tunai', 'terverifikasi');
select biz_intel(:'Q', :'m0', :'today') as k \gset
select :'k'::jsonb -> 'hunian' ->> 'kamar' e_kamar_2, :'k'::jsonb -> 'hunian' ->> 'terisi' e_terisi_1, :'k'::jsonb -> 'piutang_lewat' ->> 'nilai' e_lewat_600000,
       :'k'::jsonb -> 'cur' ->> 'transaksi' e_trx_1;
