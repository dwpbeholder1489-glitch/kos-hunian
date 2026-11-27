-- Uji Rekap Bisnis (biz_recap, recap_docs, recap_save/list/get, recap_auto_tick, recap_notice). Database baru dengan semua migrasi:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/rekap_bisnis.sql"
-- Lulus = semua kolom berawalan huruf uji bernilai t (periksa dengan -A: tidak boleh ada '|f' / 'f|'), dan ERROR hanya pada baris
-- "-- harus ditolak" (6 ERROR: luar, kasir, cabang paket Bisnis, arsip periode berjalan, ubah arsip, hapus arsip) + 1 ERROR baca tabel langsung.
\set ON_ERROR_STOP off
\set K 'b9b9b9b9-0000-0000-0000-00000000000f'
\set R 'b9b9b9b9-0000-0000-0000-00000000000e'
\set O 'b9b9b9b9-0000-0000-0000-000000000001'
\set X 'b9b9b9b9-0000-0000-0000-000000000009'
\set S 'b9b9b9b9-0000-0000-0000-000000000003'
insert into auth.users(id,email) values (:'O','rekap@x.com'), (:'X','luar-rekap@x.com'), (:'S','kasir-rekap@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  (:'K','Toko Rekap',:'O','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'R','Kos Rekap',:'O','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','properti') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'K',:'O','pemilik'), (:'R',:'O','pemilik'), (:'K',:'S','kasir') on conflict do nothing;
select date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date as m0, (now() at time zone 'Asia/Jakarta')::date as today \gset
select (:'m0'::date - interval '1 month')::date as p0, (:'m0'::date - 1) as p1, (:'m0'::date - interval '2 month')::date as q0, (:'m0'::date - interval '1 month')::date - 1 as q1 \gset
select id as b1 from branches where kos_id = :'K' and is_main \gset
insert into branches(id,kos_id,name,kind,is_main,active) values ('b9b9b9b9-0000-0000-0000-0000000000b2', :'K', 'Cabang B', 'cabang', false, true) on conflict do nothing;
insert into product_categories(id,kos_id,name) values ('b9b9b9b9-0000-0000-0000-0000000000a1', :'K', 'Sembako') on conflict do nothing;
insert into products(id,kos_id,name,base_unit,cost,stock,category_id) values
  ('b9b9b9b9-0000-0000-0000-0000000000d1', :'K', 'Beras 5kg', 'karung', 60000, 0, 'b9b9b9b9-0000-0000-0000-0000000000a1'),
  ('b9b9b9b9-0000-0000-0000-0000000000d2', :'K', 'Minyak 2L', 'botol', 30000, 0, null) on conflict do nothing;
insert into contacts(id,kos_id,kind,name) values ('b9b9b9b9-0000-0000-0000-0000000000f1', :'K', 'pelanggan', 'Pelanggan X'),
  ('b9b9b9b9-0000-0000-0000-0000000000f9', :'K', 'supplier', 'PT Sumber') on conflict do nothing;

-- BULAN LALU (periode selesai): beli 20 beras utang 1.200.000; jual 10 beras 1.000.000 tunai (diskon 0) ke Pelanggan X di Pusat,
-- jual 5 minyak 250.000 transfer di Cabang B; retur 1 beras 100.000; biaya listrik 150.000; setoran modal 500.000; prive 100.000.
\set PB 'b9b9b9b9-0000-0000-0000-0000000000c9'
insert into purchases(id,kos_id,number,purchase_date,contact_id,total,pay_method,status,branch_id) values
  (:'PB', :'K', 'BL-1', :'p0', 'b9b9b9b9-0000-0000-0000-0000000000f9', 1200000, 'utang', 'selesai', :'b1');
insert into purchase_lines(purchase_id,kos_id,product_id,name,unit,unit_qty,qty,price,line_total,qty_received) values
  (:'PB', :'K', 'b9b9b9b9-0000-0000-0000-0000000000d1', 'Beras 5kg', 'karung', 1, 20, 60000, 1200000, 20);
insert into stock_moves(kos_id,product_id,kind,delta,stock_after,value,ref_id,created_at,branch_id) values
  (:'K', 'b9b9b9b9-0000-0000-0000-0000000000d1', 'beli', 20, 20, 1200000, :'PB', (:'p0'::date + time '10:00') at time zone 'Asia/Jakarta', :'b1');
insert into sales(id,kos_id,number,sale_date,subtotal,discount,total,cost_total,pay_method,status,branch_id,contact_id,pay_split) values
  ('b9b9b9b9-0000-0000-0000-0000000000c1', :'K', 'TR-1', :'p0'::date + 2, 1050000, 50000, 1000000, 600000, 'tunai', 'selesai', :'b1', 'b9b9b9b9-0000-0000-0000-0000000000f1', null),
  ('b9b9b9b9-0000-0000-0000-0000000000c2', :'K', 'TR-2', :'p0'::date + 3, 250000, 0, 250000, 150000, 'transfer', 'selesai', 'b9b9b9b9-0000-0000-0000-0000000000b2', null, null),
  ('b9b9b9b9-0000-0000-0000-0000000000c3', :'K', 'TR-3', :'p0'::date + 3, 80000, 0, 80000, 40000, 'tunai', 'batal', :'b1', null, null);
insert into sale_lines(id,sale_id,kos_id,product_id,name,unit,unit_qty,qty,price,cost,line_total) values
  ('b9b9b9b9-0000-0000-0000-0000000000e1','b9b9b9b9-0000-0000-0000-0000000000c1', :'K', 'b9b9b9b9-0000-0000-0000-0000000000d1', 'Beras 5kg', 'karung', 1, 10, 105000, 60000, 1050000),
  ('b9b9b9b9-0000-0000-0000-0000000000e2','b9b9b9b9-0000-0000-0000-0000000000c2', :'K', 'b9b9b9b9-0000-0000-0000-0000000000d2', 'Minyak 2L', 'botol', 1, 5, 50000, 30000, 250000);
insert into stock_moves(kos_id,product_id,kind,delta,stock_after,value,ref_id,created_at,branch_id) values
  (:'K', 'b9b9b9b9-0000-0000-0000-0000000000d1', 'jual', -10, 10, -600000, 'b9b9b9b9-0000-0000-0000-0000000000c1', (:'p0'::date + 2 + time '11:00') at time zone 'Asia/Jakarta', :'b1'),
  (:'K', 'b9b9b9b9-0000-0000-0000-0000000000d1', 'rusak', -1, 9, -60000, null, (:'p0'::date + 4 + time '09:00') at time zone 'Asia/Jakarta', :'b1');
insert into sale_returns(id,kos_id,sale_id,contact_id,number,return_date,total,cost_total,refund_method,status,reason) values
  ('b9b9b9b9-0000-0000-0000-0000000000c4', :'K', 'b9b9b9b9-0000-0000-0000-0000000000c1', 'b9b9b9b9-0000-0000-0000-0000000000f1', 'RT-1', :'p0'::date + 5, 95238.10, 60000, 'tunai', 'selesai', 'rusak kemasan');
insert into sale_return_lines(return_id,kos_id,sale_line_id,product_id,name,unit,unit_qty,qty,amount,cost) values
  ('b9b9b9b9-0000-0000-0000-0000000000c4', :'K', 'b9b9b9b9-0000-0000-0000-0000000000e1', 'b9b9b9b9-0000-0000-0000-0000000000d1', 'Beras 5kg', 'karung', 1, 1, 95238.10, 60000);
insert into expense_categories(id,kos_id,name) values ('b9b9b9b9-0000-0000-0000-0000000000e9', :'K', 'Listrik') on conflict do nothing;
insert into expenses(kos_id,date,category_id,kind,amount,description,branch_id) values (:'K', :'p0'::date + 6, 'b9b9b9b9-0000-0000-0000-0000000000e9', 'operasional', 150000, 'PLN', :'b1');
insert into cash_entries(kos_id,kind,date,amount,description,account) values
  (:'K', 'setoran_modal', :'p0', 500000, 'modal awal', 'kas'), (:'K', 'prive', :'p0'::date + 7, 100000, 'ambil', 'kas');
-- BULAN INI: jual 1 beras 100.000 tunai (periode berjalan)
insert into sales(id,kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status,branch_id) values
  ('b9b9b9b9-0000-0000-0000-0000000000c5', :'K', 'TR-5', :'today', 100000, 100000, 60000, 'tunai', 'selesai', :'b1');
insert into sale_lines(sale_id,kos_id,product_id,name,unit,unit_qty,qty,price,cost,line_total) values
  ('b9b9b9b9-0000-0000-0000-0000000000c5', :'K', 'b9b9b9b9-0000-0000-0000-0000000000d1', 'Beras 5kg', 'karung', 1, 1, 100000, 60000, 100000);
-- KOS: 1 kamar, 1 penghuni, tagihan 1.000.000 dibayar 600.000 bulan lalu
insert into rooms(id,kos_id,code,rent) values ('b9b9b9b9-0000-0000-0000-0000000000a9', :'R', 'A1', 1000000) on conflict do nothing;
insert into occupants(id,kos_id,name) values ('b9b9b9b9-0000-0000-0000-0000000000a8', :'R', 'Rina') on conflict do nothing;
insert into leases(id,kos_id,room_id,occupant_id,start_date,rent,billing_start,status) values
  ('b9b9b9b9-0000-0000-0000-0000000000a7', :'R', 'b9b9b9b9-0000-0000-0000-0000000000a9', 'b9b9b9b9-0000-0000-0000-0000000000a8', :'p0', 1000000, :'p0', 'aktif');
insert into invoices(id,kos_id,lease_id,room_id,occupant_id,kind,period_start,period_end,due_date,amount,created_at) values
  ('b9b9b9b9-0000-0000-0000-0000000000a6', :'R', 'b9b9b9b9-0000-0000-0000-0000000000a7', 'b9b9b9b9-0000-0000-0000-0000000000a9', 'b9b9b9b9-0000-0000-0000-0000000000a8', 'sewa', :'p0', :'p1', :'p0'::date + 5, 1000000, (:'p0'::date + time '08:00') at time zone 'Asia/Jakarta');
insert into payments(kos_id,invoice_id,amount,paid_at,method,status) values (:'R', 'b9b9b9b9-0000-0000-0000-0000000000a6', 600000, :'p0'::date + 4, 'transfer', 'terverifikasi');

select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"b9b9b9b9-0000-0000-0000-000000000001"}', false) \g /dev/null

\echo == A. Ringkasan = Analisis Bisnis (biz_intel) & penjualan = Laporan toko (retail_report)
select biz_recap(:'K', :'p0', :'p1', :'q0', :'q1', null, jsonb_build_array(jsonb_build_object('from', :'q0', 'to', :'q1'), jsonb_build_object('from', :'p0', 'to', :'p1'))) as r \gset
select biz_intel(:'K', :'p0', :'p1') as bi \gset
select retail_report(:'K', :'p0', :'p1') as rr \gset
select (:'r'::jsonb #> '{cur,ringkas}') = (:'bi'::jsonb -> 'cur') a_ringkas_sama_analisis,
       (:'r'::jsonb #>> '{cur,penjualan,omzet}')::numeric = (:'rr'::jsonb ->> 'omzet')::numeric a_omzet_sama_laporan_toko,
       (:'r'::jsonb #>> '{cur,penjualan,retur}')::numeric = (select (:'rr'::jsonb ->> 'retur')::numeric) a_retur_sama,
       (:'r'::jsonb #>> '{cur,penjualan,diskon}')::numeric = 50000 a_diskon_50000,
       (:'r'::jsonb #>> '{cur,penjualan,trx}')::int = 2 a_trx_2, (:'r'::jsonb #>> '{cur,penjualan,batal_n}')::int = 1 a_batal_1,
       (:'r'::jsonb #>> '{cur,penjualan,hpp}')::numeric = (:'rr'::jsonb ->> 'hpp')::numeric a_hpp_sama;
select (:'r'::jsonb #>> '{cur,kas,masuk}')::numeric = (acct_cashflow(:'K', :'p0', :'p1') ->> 'masuk')::numeric a_kas_masuk_sama_arus_kas,
       (:'r'::jsonb #>> '{cur,kas,keluar}')::numeric = (acct_cashflow(:'K', :'p0', :'p1') ->> 'keluar')::numeric a_kas_keluar_sama,
       (select sum((b ->> 'masuk')::numeric) from jsonb_array_elements(:'r'::jsonb #> '{cur,kas,buckets}') b) = (:'r'::jsonb #>> '{cur,kas,masuk}')::numeric a_bucket_kas_jumlah,
       jsonb_array_length(:'r'::jsonb #> '{cur,tren}') = (:'p1'::date - :'p0'::date + 1) a_tren_harian,
       (select sum((t ->> 'pendapatan')::numeric) from jsonb_array_elements(:'r'::jsonb #> '{cur,tren}') t) = (:'r'::jsonb #>> '{cur,ringkas,pendapatan}')::numeric a_tren_jumlah_sama;
-- saldo akun: kas akhir dari baris akun = posisi kas Analisis Bisnis
select (select sum((a ->> 'open')::numeric + (a ->> 'dr')::numeric - (a ->> 'cr')::numeric) from jsonb_array_elements(:'r'::jsonb #> '{cur,akun}') a where a ->> 'kelas' = 'kas')
     = (:'bi'::jsonb #>> '{posisi,kas}')::numeric a_kas_akhir_sama_posisi,
       (select sum((a ->> 'open')::numeric + (a ->> 'dr')::numeric - (a ->> 'cr')::numeric) from jsonb_array_elements(:'r'::jsonb #> '{cur,akun}') a) = 0 a_neraca_seimbang;
-- modal: awal + setoran − prive + laba + lain = akhir (dihitung lib; di sini cek setoran & prive dari jurnal)
select (select sum((a ->> 'cr')::numeric) from jsonb_array_elements(:'r'::jsonb #> '{cur,akun}') a where a ->> 'sys' = 'modal') = 500000 a_setoran_500000,
       (select sum((a ->> 'dr')::numeric) from jsonb_array_elements(:'r'::jsonb #> '{cur,akun}') a where a ->> 'sys' = 'prive') = 100000 a_prive_100000;
select (:'r'::jsonb #>> '{cur,pembelian,total}')::numeric = 1200000 a_beli_1200000, (:'r'::jsonb #>> '{cur,pembelian,utang}')::numeric = 1200000 a_beli_utang,
       :'r'::jsonb #>> '{cur,pembelian,supplier,0,name}' = 'PT Sumber' a_supplier,
       (:'r'::jsonb #>> '{cur,persediaan,akhir,nilai}')::numeric = 540000 a_stok_akhir_540000,
       (:'r'::jsonb #>> '{cur,persediaan,awal,nilai}')::numeric = 0 a_stok_awal_0,
       (:'r'::jsonb #>> '{cur,pengeluaran,operasional}')::numeric = 150000 a_biaya_150000,
       (:'r'::jsonb #>> '{cur,pelanggan,aktif}')::int = 1 a_pelanggan_aktif_1,
       (:'r'::jsonb #>> '{kini,utang_supplier}')::int = 1 a_utang_1_supplier;
select jsonb_array_length(:'r'::jsonb -> 'seri') = 2 a_seri_2, (:'r'::jsonb #> '{seri,1,v}') = (:'r'::jsonb #> '{cur,ringkas}') a_seri_akhir_sama,
       (:'r'::jsonb -> 'cmp') is not null a_ada_pembanding, (:'r'::jsonb #>> '{status,berjalan}')::boolean = false a_periode_selesai,
       (:'r'::jsonb ? 'heatmap') a_heatmap_pro, jsonb_typeof(:'r'::jsonb -> 'arsip') = 'null' a_belum_arsip;
\echo -- cabang (Pro): hanya Cabang B
select biz_recap(:'K', :'p0', :'p1', null, null, 'b9b9b9b9-0000-0000-0000-0000000000b2') as rb \gset
select (:'rb'::jsonb #>> '{cur,penjualan,omzet}')::numeric = 250000 a_cabang_omzet, (:'rb'::jsonb #>> '{cur,ringkas,transaksi}')::int = 1 a_cabang_trx,
       :'rb'::jsonb ->> 'branch_name' = 'Cabang B' a_cabang_nama;

\echo == B. Rincian transaksi sumber (recap_docs)
select jsonb_array_length(recap_docs(:'K', 'penjualan', :'p0', :'p1')) = 2 b_jual_2,
       jsonb_array_length(recap_docs(:'K', 'penjualan', :'p0', :'p1', null, 'batal')) = 1 b_batal_1,
       jsonb_array_length(recap_docs(:'K', 'penjualan', :'p0', :'p1', null, 'diskon')) = 1 b_diskon_1,
       jsonb_array_length(recap_docs(:'K', 'retur', :'p0', :'p1')) = 1 b_retur_1,
       jsonb_array_length(recap_docs(:'K', 'pembelian', :'p0', :'p1')) = 1 b_beli_1,
       jsonb_array_length(recap_docs(:'K', 'pengeluaran', :'p0', :'p1')) = 1 b_biaya_1,
       jsonb_array_length(recap_docs(:'K', 'stok', :'p0', :'p1', null, 'opname,rusak,kedaluwarsa,koreksi')) = 1 b_penyesuaian_1,
       jsonb_array_length(recap_docs(:'K', 'kategori', :'p0', :'p1', null, 'b9b9b9b9-0000-0000-0000-0000000000a1')) = 1 b_kategori_1,
       jsonb_array_length(recap_docs(:'K', 'pelanggan', :'p0', :'p1', null, 'aktif')) = 1 b_pelanggan_1,
       (select sum((x ->> 'nilai')::numeric) from jsonb_array_elements(recap_docs(:'K', 'penjualan', :'p0', :'p1')) x) = 1250000 b_jumlah_sama_bruto_tanpa_retur;

\echo == C. Kos: rekap khusus kategori
select biz_recap(:'R', :'p0', :'p1') as rk \gset
select (:'rk'::jsonb #> '{cur,penjualan}') is null c_tanpa_penjualan_toko, (:'rk'::jsonb #>> '{cur,operasional,uang_masuk}')::numeric = 600000 c_uang_masuk,
       (:'rk'::jsonb #>> '{cur,sewa,tagihan_terbit}')::numeric = 1000000 c_tagihan_terbit, (:'rk'::jsonb #>> '{cur,sewa,tunggakan_total}')::numeric = 400000 c_tunggakan_400000,
       (:'rk'::jsonb #>> '{cur,sewa,penghuni_aktif}')::int = 1 c_penghuni_1, (:'rk'::jsonb ? 'heatmap') = false c_tanpa_heatmap_bisnis,
       jsonb_array_length(recap_docs(:'R', 'bayar_sewa', :'p0', :'p1')) = 1 c_docs_bayar;
-- harus ditolak: cabang di Paket Bisnis
select biz_recap(:'R', :'p0', :'p1', null, null, 'b9b9b9b9-0000-0000-0000-0000000000b2');

\echo == D. Hak akses
select set_config('request.jwt.claim.sub', :'X', false) \g /dev/null
-- harus ditolak: orang luar
select biz_recap(:'K', :'p0', :'p1');
select set_config('request.jwt.claim.sub', :'S', false) \g /dev/null
-- harus ditolak: kasir (bukan area keuangan)
select recap_docs(:'K', 'penjualan', :'p0', :'p1');
select recap_notice(:'K') = '[]'::jsonb d_kasir_notice_kosong;
select set_config('request.jwt.claim.sub', :'O', false) \g /dev/null

\echo == E. Arsip berversi
-- harus ditolak: periode masih berjalan
select recap_save(:'K', 'bulanan', :'m0', :'today');
select recap_save(:'K', 'bulanan', :'p0', :'p1', null, 'tutup bulan') as s1 \gset
select recap_save(:'K', 'bulanan', :'p0', :'p1') as s2 \gset
select (:'s1'::jsonb ->> 'version')::int = 1 e_versi_1, (:'s1'::jsonb ->> 'baru')::boolean e_baru, (:'s2'::jsonb ->> 'baru')::boolean = false e_tidak_dobel,
       :'s2'::jsonb ->> 'id' = :'s1'::jsonb ->> 'id' e_id_sama;
select (recap_get((:'s1'::jsonb ->> 'id')::uuid) ->> 'berubah')::boolean = false e_belum_berubah,
       (biz_recap(:'K', :'p0', :'p1') #>> '{arsip,berubah}')::boolean = false e_live_tidak_berubah;
-- tutup buku tidak mengubah hash (status bukan data)
insert into acct_periods(kos_id, month, closed_at, closed_by) values (:'K', :'p0', now(), 'uji');
select (recap_get((:'s1'::jsonb ->> 'id')::uuid) ->> 'berubah')::boolean = false e_tutup_buku_bukan_perubahan,
       (biz_recap(:'K', :'p0', :'p1') #>> '{status,ditutup}')::boolean e_status_ditutup;
delete from acct_periods where kos_id = :'K' and month = :'p0';
-- koreksi data historis → arsip lama terdeteksi berubah → versi 2
insert into expenses(kos_id,date,category_id,kind,amount,description,branch_id) values (:'K', :'p0'::date + 8, 'b9b9b9b9-0000-0000-0000-0000000000e9', 'operasional', 25000, 'koreksi', :'b1');
select (recap_get((:'s1'::jsonb ->> 'id')::uuid) ->> 'berubah')::boolean e_terdeteksi_berubah;
select recap_save(:'K', 'bulanan', :'p0', :'p1') as s3 \gset
select (:'s3'::jsonb ->> 'version')::int = 2 e_versi_2,
       (select (recap_get((:'s1'::jsonb ->> 'id')::uuid) #>> '{data,pengeluaran,operasional}')::numeric) = 150000 e_versi_1_tetap_150000,
       jsonb_array_length(recap_list(:'K')) = 2 e_list_2, (recap_list(:'K') -> 0 ->> 'terbaru')::boolean e_terbaru_ditandai,
       jsonb_array_length(recap_get((:'s1'::jsonb ->> 'id')::uuid) -> 'versi') = 2 e_riwayat_versi;
-- harus ditolak: ubah & hapus arsip
update recap_snapshots set note = 'x' where kos_id = :'K';
delete from recap_snapshots where kos_id = :'K';
-- harus ditolak: tabel tidak bisa dibaca langsung
set role authenticated;
select count(*) from recap_snapshots;
reset role;

\echo == F. Otomatis (cron, tanpa pengguna)
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select recap_auto_tick() as t1 \gset
select (:'t1'::jsonb ->> 'gagal')::int = 0 f_tanpa_gagal, (:'t1'::jsonb ->> 'bisnis')::int >= 1 f_bisnis_diproses;
-- bulanan bulan lalu toko sudah ada (manual v2, data sama) → tidak dibuat ulang; kos dapat arsip otomatis
select (select count(*) from recap_snapshots where kos_id = :'K' and kind = 'bulanan' and period_from = :'p0') = 2 f_toko_tidak_dobel,
       (select count(*) from recap_snapshots where kos_id = :'R' and kind = 'bulanan' and period_from = :'p0' and source = 'otomatis') = 1 f_kos_otomatis;
select recap_auto_tick() as t2 \gset
select (:'t2'::jsonb ->> 'arsip_baru')::int = 0 and (:'t2'::jsonb ->> 'versi_koreksi')::int = 0 f_idempoten;
-- koreksi data kos bulan lalu → versi koreksi otomatis
insert into payments(kos_id,invoice_id,amount,paid_at,method,status) values (:'R', 'b9b9b9b9-0000-0000-0000-0000000000a6', 100000, :'p0'::date + 9, 'tunai', 'terverifikasi');
select recap_auto_tick() as t3 \gset
select (:'t3'::jsonb ->> 'versi_koreksi')::int >= 1 f_versi_koreksi,
       (select source from recap_snapshots where kos_id = :'R' and kind = 'bulanan' and period_from = :'p0' order by version desc limit 1) = 'koreksi' f_sumber_koreksi;
select set_config('request.jwt.claim.sub', :'O', false) \g /dev/null
select jsonb_array_length(recap_notice(:'R')) >= 1 f_notice_ada;
-- bisnis ditutup dilewati
update kos set closed_at = now() where id = :'R';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
insert into payments(kos_id,invoice_id,amount,paid_at,method,status) values (:'R', 'b9b9b9b9-0000-0000-0000-0000000000a6', 50000, :'p0'::date + 10, 'tunai', 'terverifikasi');
select recap_auto_tick() as t4 \gset
select (select count(*) from recap_snapshots where kos_id = :'R' and kind = 'bulanan' and period_from = :'p0') = 2 f_ditutup_dilewati;
