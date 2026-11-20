-- Uji Tata kelola harga & kredit, bagian 3 (migrasi 20261115160000): harga per outlet dan urutan harga di penjualan
-- (manual › daftar pelanggan › outlet/umum grosir-eceran). Database baru; lulus = semua t, tanpa ERROR.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('dedede02-0000-0000-0000-000000000001','th3@x.com'), ('dedede02-0000-0000-0000-000000000002','kasir-th3@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('dedede02-0000-0000-0000-00000000000c','Toko Harga 3','dedede02-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('dedede02-0000-0000-0000-00000000000c','dedede02-0000-0000-0000-000000000001','pemilik'), ('dedede02-0000-0000-0000-00000000000c','dedede02-0000-0000-0000-000000000002','kasir');
\set K 'dedede02-0000-0000-0000-00000000000c'
\set KS 'dedede02-0000-0000-0000-000000000002'
\set KO 'dedede02-0000-0000-0000-000000000001'
\set BA 'dedede02-0000-0000-0000-0000000000b1'
\set BB 'dedede02-0000-0000-0000-0000000000b2'
\set C1 'dedede02-0000-0000-0000-0000000000c1'
\set C2 'dedede02-0000-0000-0000-0000000000c2'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u)::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;

-- Data uji: dua outlet aktif (postgres), barang & daftar harga (pemilik)
reset role;
insert into branches(id, kos_id, name, kind, active) values (:'BA', :'K', 'Outlet Majalengka', 'cabang', true), (:'BB', :'K', 'Outlet Cirebon', 'cabang', true) on conflict (id) do update set active = true;
set role authenticated;
select pg_temp.sebagai(:'KO');
select product_save(:'K', null, 'Air mineral 600ml', 'botol', 2000, 0, '[{"name":"botol","price_retail":3500,"price_wholesale":3200}]', 100, null) as air \gset
select price_list_save(:'K', null, 'Harga reseller') as lst \gset
select price_list_item_set(:'lst', :'air', 'botol', 3000);
reset role;
insert into contacts(id, kos_id, kind, name) values (:'C1', :'K', 'pelanggan', 'Warung Bu Sri'), (:'C2', :'K', 'pelanggan', 'Umum') on conflict do nothing;
update contacts set price_list_id = :'lst' where id = :'C1';
set role authenticated;
select pg_temp.sebagai(:'KO');

\echo == A. Urutan harga (tanpa outlet)
select set_config('prasara.branch', :'BA', false) \g /dev/null
select sale_create('dedede02-0000-0000-0000-0000000000a1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 0, 'tunai', 5000, :'C1', null, null, null) ->> 'total' = '3000.00' a1_daftar_menang_atas_eceran;
select sale_create('dedede02-0000-0000-0000-0000000000a2', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 0, 'tunai', 5000, null, null, null, null) ->> 'total' = '3500.00' a2_eceran_umum;
select sale_create('dedede02-0000-0000-0000-0000000000a3', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1, 'price', 3600)), 0, 'tunai', 5000, :'C1', null, null, null) ->> 'total' = '3600.00' a3_manual_menang_atas_daftar;
select sale_create('dedede02-0000-0000-0000-0000000000a4', :'K', 'grosir', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 0, 'tunai', 5000, null, null, null, null) ->> 'total' = '3200.00' a4_grosir_umum;
select sale_create('dedede02-0000-0000-0000-0000000000a5', :'K', 'grosir', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 0, 'tunai', 5000, :'C1', null, null, null) ->> 'total' = '3000.00' a5_daftar_menang_atas_grosir;

\echo == B. Harga outlet
select outlet_price_set(:'K', :'BB', :'air', 'botol', 3300, 3100) is null \g /dev/null
select set_config('prasara.branch', :'BB', false) \g /dev/null
select sale_create('dedede02-0000-0000-0000-0000000000b1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 0, 'tunai', 5000, null, null, null, null) ->> 'total' = '3300.00' b1_outlet_menggantikan_eceran;
select sale_create('dedede02-0000-0000-0000-0000000000b2', :'K', 'grosir', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 0, 'tunai', 5000, null, null, null, null) ->> 'total' = '3100.00' b2_outlet_grosir;
select sale_create('dedede02-0000-0000-0000-0000000000b3', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 0, 'tunai', 5000, :'C1', null, null, null) ->> 'total' = '3000.00' b3_daftar_tetap_menang_atas_outlet;
select set_config('prasara.branch', :'BA', false) \g /dev/null
select sale_create('dedede02-0000-0000-0000-0000000000b4', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 0, 'tunai', 5000, null, null, null, null) ->> 'total' = '3500.00' b4_outlet_lain_tidak_terpengaruh;

\echo == C. Daftar harga yang lewat masa berlaku
select price_list_dates_set(:'lst', (now() at time zone 'Asia/Jakarta')::date - 10, (now() at time zone 'Asia/Jakarta')::date - 1) is null \g /dev/null
select set_config('prasara.branch', :'BB', false) \g /dev/null
select sale_create('dedede02-0000-0000-0000-0000000000c1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 0, 'tunai', 5000, :'C1', null, null, null) ->> 'total' = '3300.00' c1_daftar_kedaluwarsa_jatuh_ke_outlet;
select price_list_dates_set(:'lst', null, null) is null \g /dev/null

\echo == D. Hak akses & riwayat
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select outlet_price_set(%L, %L, %L, 'botol', 1, 1)$$, :'K', :'BB', :'air')) like '%Khusus keuangan%' d1_kasir_tidak_bisa_atur;
select pg_temp.sebagai(:'KO');
select pg_temp.gagal(format($$select outlet_price_set(%L, %L, %L, 'botol', 1, 1)$$, :'K', 'dedede02-0000-0000-0000-00000000ffff', :'air')) like '%Outlet tidak ditemukan%' d2_outlet_salah;
select exists (select 1 from price_history where kos_id = :'K' and kind = 'outlet' and branch_id = :'BB' and new_price = 3300) d3_riwayat_outlet_tercatat;
select outlet_price_set(:'K', :'BB', :'air', 'botol', null, null) is null \g /dev/null
select not exists (select 1 from outlet_prices where branch_id = :'BB' and product_id = :'air') d4_hapus_baris_outlet;
select set_config('prasara.branch', :'BB', false) \g /dev/null
select sale_create('dedede02-0000-0000-0000-0000000000d1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 0, 'tunai', 5000, null, null, null, null) ->> 'total' = '3500.00' d5_setelah_dihapus_kembali_umum;

\echo == E. Pendukung layar Kasir (migrasi 20261115180000)
select outlet_price_set(:'K', :'BB', :'air', 'botol', 3300, null) is null \g /dev/null
select set_config('prasara.branch', :'BB', false) \g /dev/null
select (select (x ->> 'price_retail')::numeric from jsonb_array_elements(kasir_catalog(:'K') -> 'units') x where x ->> 'product_id' = :'air') = 3300 e1_katalog_harga_outlet;
select (select (x ->> 'price_wholesale')::numeric from jsonb_array_elements(kasir_catalog(:'K') -> 'units') x where x ->> 'product_id' = :'air') = 3200 e2_grosir_tetap_umum_bila_kosong;
select set_config('prasara.branch', :'BA', false) \g /dev/null
select (select (x ->> 'price_retail')::numeric from jsonb_array_elements(kasir_catalog(:'K') -> 'units') x where x ->> 'product_id' = :'air') = 3500 e3_outlet_lain_harga_umum;
select (select x ->> 'price_list_id' from jsonb_array_elements(kasir_catalog(:'K') -> 'customers') x where x ->> 'id' = :'C1') = :'lst' e4_pelanggan_bawa_daftar;
select jsonb_array_length(kasir_catalog(:'K') -> 'list_items') = 1 e5_isi_daftar_dikirim;
select (promo_preview(:'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 2)), :'C1') ->> 'subtotal')::numeric = 6000 e6_pratinjau_harga_pelanggan;
select (promo_preview(:'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 2))) ->> 'subtotal')::numeric = 7000 e7_pratinjau_tanpa_pelanggan;
select price_list_dates_set(:'lst', (now() at time zone 'Asia/Jakarta')::date - 10, (now() at time zone 'Asia/Jakarta')::date - 1) is null \g /dev/null
select (select x ->> 'price_list_id' from jsonb_array_elements(kasir_catalog(:'K') -> 'customers') x where x ->> 'id' = :'C1') is null e8_daftar_kedaluwarsa_tidak_dikirim;
select jsonb_array_length(kasir_catalog(:'K') -> 'list_items') = 0 e9_isi_kedaluwarsa_tidak_dikirim;
select price_list_dates_set(:'lst', null, null) is null \g /dev/null
