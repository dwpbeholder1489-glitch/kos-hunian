-- Uji Tata kelola harga & kredit, bagian 2 (migrasi 20261115150000): batas diskon kasir & margin minimum,
-- pengecualian oleh pemilik/pengelola dengan alasan. Database baru; lulus = semua t, tanpa ERROR.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('dedede01-0000-0000-0000-000000000001','th2@x.com'), ('dedede01-0000-0000-0000-000000000002','kasir-th2@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('dedede01-0000-0000-0000-00000000000b','Toko Harga 2','dedede01-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('dedede01-0000-0000-0000-00000000000b','dedede01-0000-0000-0000-000000000001','pemilik'), ('dedede01-0000-0000-0000-00000000000b','dedede01-0000-0000-0000-000000000002','kasir');
\set K 'dedede01-0000-0000-0000-00000000000b'
\set KS 'dedede01-0000-0000-0000-000000000002'
\set KO 'dedede01-0000-0000-0000-000000000001'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u)::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;

set role authenticated;
select pg_temp.sebagai(:'KO');
select product_save(:'K', null, 'Air mineral 600ml', 'botol', 2000, 0, '[{"name":"botol","price_retail":3500}]', 100, null) as air \gset
select product_save(:'K', null, 'Gula pasir 1kg', 'kg', 3000, 0, '[{"name":"kg","price_retail":3300}]', 100, null) as gula \gset

\echo == A. Default: tanpa batas (bawaan kosong)
select sale_create('dedede01-0000-0000-0000-0000000000a0', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 1750, 'tunai', 5000, null, null, null, null) ->> 'total' = '1750.00' a0_default_tanpa_batas;

\echo == B. Atur batas (pemilik)
select price_policy_set(:'K', 10, 30) ->> 'max_disc' = '10' b1_pemilik_atur;
select pg_temp.gagal(format($$select price_policy_set(%L, 150, null)$$, :'K')) like '%0–100%' b2_luar_rentang_ditolak;
select (select profile -> 'price_policy' ->> 'min_margin' from kos where id = :'K') = '30' b3_tersimpan;
select price_policy_set(:'K', 10, 30) is not null \g /dev/null

\echo == C. Penjualan dalam batas & melewati batas
select sale_create('dedede01-0000-0000-0000-0000000000c1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 0, 'tunai', 5000, null, null, null, null) ->> 'total' = '3500.00' c1_tanpa_diskon_ok;
select sale_create('dedede01-0000-0000-0000-0000000000c2', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 300, 'tunai', 5000, null, null, null, null) ->> 'total' = '3200.00' c2_diskon_8_persen_ok;
select pg_temp.gagal(format($$select sale_create(%L, %L, 'ecer', '[{"product_id":"%s","unit":"botol","qty":1}]', 500, 'tunai', 5000, null, null, null, null)$$, 'dedede01-0000-0000-0000-0000000000c3', :'K', :'air')) like 'BATAS_DISKON: Diskon 14,29% melewati batas maks 10%%' c3_diskon_14_persen_ditolak;
select exists (select 1 from sales where id = 'dedede01-0000-0000-0000-0000000000c3') = false c4_tidak_tersimpan;
select pg_temp.gagal(format($$select sale_create(%L, %L, 'ecer', '[{"product_id":"%s","unit":"kg","qty":1}]', 0, 'tunai', 5000, null, null, null, null)$$, 'dedede01-0000-0000-0000-0000000000c4', :'K', :'gula')) like 'BATAS_DISKON:%Margin%' c5_margin_di_bawah_minimum_ditolak;

\echo == D. Pengecualian: hanya pemilik/pengelola, dengan alasan
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select sale_create_ov(%L, %L, 'ecer', '[{"product_id":"%s","unit":"botol","qty":1}]', 500, 'tunai', 5000, null, null, null, null, 'langganan')$$, 'dedede01-0000-0000-0000-0000000000d1', :'K', :'air')) like '%pemilik/pengelola%' d1_kasir_tidak_bisa_izinkan;
select pg_temp.sebagai(:'KO');
select pg_temp.gagal(format($$select sale_create_ov(%L, %L, 'ecer', '[{"product_id":"%s","unit":"botol","qty":1}]', 500, 'tunai', 5000, null, null, null, null, 'x')$$, 'dedede01-0000-0000-0000-0000000000d2', :'K', :'air')) like '%alasan%' d2_alasan_terlalu_pendek;
select (sale_create_ov('dedede01-0000-0000-0000-0000000000d3', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 500, 'tunai', 5000, null, null, null, null, 'pelanggan langganan')) ->> 'total' = '3000.00' d3_pemilik_izinkan;
select exists (select 1 from discount_overrides where sale_id = 'dedede01-0000-0000-0000-0000000000d3' and reason = 'pelanggan langganan' and by_email is not null) d4_alasan_tercatat;
select exists (select 1 from sales where id = 'dedede01-0000-0000-0000-0000000000d3') d5_penjualan_tersimpan;
select pg_temp.gagal(format($$select sale_create_ov(%L, %L, 'ecer', '[{"product_id":"%s","unit":"botol","qty":1}]', 500, 'tunai', 5000, null, null, null, null, 'langganan')$$, 'dedede01-0000-0000-0000-0000000000d4', :'K', :'air')) = 'TIDAK_DITOLAK' d6_pengecualian_berlaku_untuk_transaksi_baru;
select pg_temp.gagal(format($$select sale_create(%L, %L, 'ecer', '[{"product_id":"%s","unit":"botol","qty":1}]', 500, 'tunai', 5000, null, null, null, null)$$, 'dedede01-0000-0000-0000-0000000000d5', :'K', :'air')) like 'BATAS_DISKON:%' d7_sale_biasa_tetap_dibatasi;

\echo == E. Pengaturan oleh kasir ditolak; hapus batas
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select price_policy_set(%L, null, null)$$, :'K')) like '%pemilik/pengelola%' e1_kasir_tidak_bisa_atur;
select pg_temp.sebagai(:'KO');
select price_policy_set(:'K', null, null) = '{}'::jsonb e2_hapus_batas;
select sale_create('dedede01-0000-0000-0000-0000000000e1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 1)), 2000, 'tunai', 5000, null, null, null, null) ->> 'total' = '1500.00' e3_tanpa_batas_lagi_diizinkan;
select exists (select 1 from config_history where kos_id = :'K' and action = 'batas_harga') e4_riwayat_batas_tercatat;

\echo == F. Format persen pesan
select pct_txt(10) = '10%' and pct_txt(18.37) = '18,37%' and pct_txt(12.5) = '12,5%' and pct_txt(0) = '0%' f1_format_persen;
