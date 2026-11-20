-- Uji Tata kelola harga & kredit, bagian 4 (migrasi 20261115170000): tipe pelanggan & sales yang memegang pelanggan.
-- Database baru; lulus = semua t, tanpa ERROR.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('dedede03-0000-0000-0000-000000000001','th4@x.com'), ('dedede03-0000-0000-0000-000000000002','kasir-th4@x.com'), ('dedede03-0000-0000-0000-000000000003','luar-th4@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('dedede03-0000-0000-0000-00000000000d','Toko Harga 4','dedede03-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('dedede03-0000-0000-0000-00000000000d','dedede03-0000-0000-0000-000000000001','pemilik'), ('dedede03-0000-0000-0000-00000000000d','dedede03-0000-0000-0000-000000000002','kasir');
insert into contacts(id, kos_id, kind, name) values ('dedede03-0000-0000-0000-0000000000c1','dedede03-0000-0000-0000-00000000000d','pelanggan','Toko Maju');
\set K 'dedede03-0000-0000-0000-00000000000d'
\set KS 'dedede03-0000-0000-0000-000000000002'
\set KO 'dedede03-0000-0000-0000-000000000001'
\set KL 'dedede03-0000-0000-0000-000000000003'
\set C1 'dedede03-0000-0000-0000-0000000000c1'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u)::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;

set role authenticated;
select pg_temp.sebagai(:'KO');
select customer_profile_set(:'C1', 'reseller', :'KS') ->> 'tipe' = 'reseller' a1_pemilik_atur;
select (select tipe from contacts where id = :'C1') = 'reseller' and (select sales_user from contacts where id = :'C1') = :'KS'::uuid a2_tersimpan;
select pg_temp.gagal(format($$select customer_profile_set(%L, 'grosir', null)$$, :'C1')) like '%tidak dikenal%' a3_tipe_tidak_dikenal;
select pg_temp.gagal(format($$select customer_profile_set(%L, 'umum', %L)$$, :'C1', :'KL')) like '%anggota%' a4_sales_bukan_anggota;
select customer_profile_set(:'C1', null, null) ->> 'tipe' is null a5_kosongkan;
select customer_profile_set(:'C1', 'distributor', :'KS') is not null \g /dev/null
select exists (select 1 from config_history where kos_id = :'K' and action = 'profil_pelanggan') a6_riwayat_tercatat;
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select customer_profile_set(%L, 'umum', null)$$, :'C1')) like '%Pelanggan tidak ditemukan%' a7_kasir_tidak_bisa_ubah;
select pg_temp.sebagai(:'KO');
select (select count(*) from contacts where kos_id = :'K' and tipe = 'distributor') = 1 a8_bisa_difilter;
select (select x ->> 'tipe' from jsonb_array_elements(contacts_overview(:'K')) x where x ->> 'id' = :'C1') = 'distributor' a9_daftar_kontak_bawa_tipe;
select (select x ->> 'sales_user' from jsonb_array_elements(contacts_overview(:'K')) x where x ->> 'id' = :'C1') = :'KS' a10_daftar_kontak_bawa_sales;

\echo == B. Riwayat limit kredit (sebelum → sesudah, RET-014)
select customer_terms_set(:'C1', jsonb_build_object('credit_limit', 1000000, 'terms_days', 7)) is not null \g /dev/null
select customer_terms_set(:'C1', jsonb_build_object('credit_limit', 3000000, 'terms_days', 7)) is not null \g /dev/null
select exists (select 1 from config_history where kos_id = :'K' and action = 'syarat_pelanggan'
  and (before ->> 'batas_kredit')::numeric = 1000000 and (after ->> 'batas_kredit')::numeric = 3000000 and (before ->> 'tempo')::int = 7) b1_riwayat_limit_sebelum_sesudah;
