-- Uji Tata kelola harga & kredit, bagian 1 (migrasi 20261115140000): tanggal berlaku daftar harga,
-- riwayat harga, peringatan kasbon (tidak memblokir). Database baru; lulus = semua t, tanpa ERROR.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('dedede00-0000-0000-0000-000000000001','th1@x.com'), ('dedede00-0000-0000-0000-000000000002','kasir-th1@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('dedede00-0000-0000-0000-00000000000a','Toko Harga 1','dedede00-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('dedede00-0000-0000-0000-00000000000a','dedede00-0000-0000-0000-000000000001','pemilik'), ('dedede00-0000-0000-0000-00000000000a','dedede00-0000-0000-0000-000000000002','kasir');
\set K 'dedede00-0000-0000-0000-00000000000a'
\set KS 'dedede00-0000-0000-0000-000000000002'
\set KO 'dedede00-0000-0000-0000-000000000001'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u)::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;

-- Data uji (sebagai pemilik)
set role authenticated;
select pg_temp.sebagai(:'KO');
select product_save(:'K', null, 'Air mineral 600ml', 'botol', 2000, 0, '[{"name":"botol","price_retail":3500,"price_wholesale":3200}]', 100, null) as air \gset
select price_list_save(:'K', null, 'Harga reseller') as lst \gset
select price_list_item_set(:'lst', :'air', 'botol', 3000);
reset role;
-- Pelanggan (data uji langsung sebagai postgres)
insert into contacts(id, kos_id, kind, name) values ('dedede00-0000-0000-0000-0000000000c1', :'K', 'pelanggan', 'Warung Bu Sri') on conflict do nothing;
set role authenticated;
select pg_temp.sebagai(:'KO');
select customer_terms_set('dedede00-0000-0000-0000-0000000000c1', jsonb_build_object('price_list_id', :'lst')) is not null as setup_pelanggan \gset

\echo == A. Tanggal berlaku daftar harga
select price_for(:'K', 'dedede00-0000-0000-0000-0000000000c1', :'air', 'botol', 'ecer') ->> 'source' = 'daftar' a1_tanpa_tanggal_berlaku;
select price_list_dates_set(:'lst', '2026-01-01', '2026-02-01') is null \g /dev/null
select price_for(:'K', 'dedede00-0000-0000-0000-0000000000c1', :'air', 'botol', 'ecer') ->> 'source' = 'eceran' a2_lewat_masa_kembali_eceran;
select price_list_for_contact(:'K', 'dedede00-0000-0000-0000-0000000000c1') is null a3_daftar_tidak_dikirim_saat_lewat;
select price_list_dates_set(:'lst', (now() at time zone 'Asia/Jakarta')::date - 5, (now() at time zone 'Asia/Jakarta')::date + 5) is null \g /dev/null
select price_for(:'K', 'dedede00-0000-0000-0000-0000000000c1', :'air', 'botol', 'ecer') ->> 'source' = 'daftar' a4_masa_berlaku_harga_daftar;
select price_list_for_contact(:'K', 'dedede00-0000-0000-0000-0000000000c1') ->> 'valid_to' is not null a5_daftar_dikirim_saat_berlaku;
select pg_temp.gagal(format($$select price_list_dates_set(%L, '2026-03-01', '2026-02-01')$$, :'lst')) like '%sama atau sesudah%' a6_selesai_sebelum_mulai_ditolak;
select price_list_dates_set(:'lst', null, null) is null \g /dev/null
select price_for(:'K', 'dedede00-0000-0000-0000-0000000000c1', :'air', 'botol', 'ecer') ->> 'source' = 'daftar' a7_tanpa_batas_kembali;
select price_list_dates_set(:'lst', (now() at time zone 'Asia/Jakarta')::date + 3, null) is null \g /dev/null
select price_for(:'K', 'dedede00-0000-0000-0000-0000000000c1', :'air', 'botol', 'ecer') ->> 'source' = 'eceran' a8_belum_mulai_eceran;
select price_list_dates_set(:'lst', null, null) is null \g /dev/null
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select price_list_dates_set(%L, null, null)$$, :'lst')) like '%tidak%' a9_kasir_tidak_bisa_ubah;

\echo == B. Riwayat harga jual
select pg_temp.sebagai(:'KO');
reset role;
update product_units set price_retail = 4000 where product_id = :'air' and name = 'botol';
update product_units set price_wholesale = 3300 where product_id = :'air' and name = 'botol';
set role authenticated;
select pg_temp.sebagai(:'KO');
select price_list_item_set(:'lst', :'air', 'botol', 2800);
select count(*) = 1 b0_eceran_tercatat from price_history where kos_id = :'K' and product_id = :'air' and kind = 'eceran' and old_price = 3500 and new_price = 4000;
select exists (select 1 from price_history where kos_id = :'K' and kind = 'grosir' and old_price = 3200 and new_price = 3300) b1_grosir_tercatat;
select exists (select 1 from price_history where kos_id = :'K' and kind = 'daftar' and old_price = 3000 and new_price = 2800 and list_name = 'Harga reseller') b2_daftar_tercatat;
select exists (select 1 from price_history where kos_id = :'K' and kind = 'daftar' and old_price is null and new_price = 3000) b3_daftar_baru_tercatat;
select jsonb_array_length(price_history_list(:'K', :'air')) >= 4 b4_riwayat_per_barang;
select jsonb_array_length(price_history_list(:'K', null, 1)) = 1 b5_batas_jumlah;
select price_list_item_set(:'lst', :'air', 'botol', null) is null \g /dev/null
select exists (select 1 from price_history where kos_id = :'K' and kind = 'daftar' and old_price = 2800 and new_price is null) b6_hapus_tercatat;
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select price_history_list(%L, null)$$, :'K')) like '%akses%' b7_kasir_tidak_boleh_lihat_riwayat;
select count(*) = 0 b8_rls_kasir_kosong from price_history where kos_id = :'K';
select pg_temp.sebagai(:'KO');
select count(*) >= 5 b9_pemilik_lihat_tabel from price_history where kos_id = :'K';
select exists (select 1 from pg_trigger where tgrelid = 'public.price_history'::regclass and tgname = 'zz_kos_open_guard') b10_guard_terpasang;

\echo == C. Peringatan kasbon melewati batas (tidak memblokir)
select (kasbon_check(:'K', 'dedede00-0000-0000-0000-0000000000c1', 50000) -> 'warnings') = '[]'::jsonb c1_tanpa_batas_tanpa_peringatan;
select customer_terms_set('dedede00-0000-0000-0000-0000000000c1', jsonb_build_object('price_list_id', :'lst', 'credit_limit', 100000, 'terms_days', 14)) is not null c0_set_batas;
select jsonb_array_length(kasbon_check(:'K', 'dedede00-0000-0000-0000-0000000000c1', 150000) -> 'warnings') >= 1 c2_melewati_batas_ada_peringatan;
select (kasbon_check(:'K', 'dedede00-0000-0000-0000-0000000000c1', 150000) -> 'warnings') ->> 0 like '%melewati batas kredit%' c3_isi_peringatan;
select (kasbon_check(:'K', 'dedede00-0000-0000-0000-0000000000c1', 20000) -> 'warnings') = '[]'::jsonb c4_dalam_batas_kosong;
select sale_create('dedede00-0000-0000-0000-0000000000e1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 50)), 0, 'kasbon', null, 'dedede00-0000-0000-0000-0000000000c1', current_date + 14, null, null) ->> 'total' is not null c5_kasbon_tetap_bisa_disimpan;
select exists (select 1 from sales where id = 'dedede00-0000-0000-0000-0000000000e1' and contact_id = 'dedede00-0000-0000-0000-0000000000c1') c6_tercatat_di_riwayat_pelanggan;
select pg_temp.gagal(format($$select kasbon_check(%L, %L, 1000)$$, :'K', 'dedede00-0000-0000-0000-0000000000c1')) = 'TIDAK_DITOLAK' c7_pemilik_boleh;
