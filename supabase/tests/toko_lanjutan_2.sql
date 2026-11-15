-- Uji Toko lanjutan 2: harga per jumlah beli, komisi, kebijakan stok minus, pemeriksaan kehilangan. Database baru; lulus = semua t, tanpa ERROR.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('cbcbcbcb-0000-0000-0000-000000000001','tl2@x.com'), ('cbcbcbcb-0000-0000-0000-000000000002','kasir-tl2@x.com'), ('cbcbcbcb-0000-0000-0000-000000000003','luar-tl2@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('cbcbcbcb-0000-0000-0000-00000000000a','Toko Lanjut 2','cbcbcbcb-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('cbcbcbcb-0000-0000-0000-00000000000a','cbcbcbcb-0000-0000-0000-000000000001','pemilik'), ('cbcbcbcb-0000-0000-0000-00000000000a','cbcbcbcb-0000-0000-0000-000000000002','kasir');
\set K 'cbcbcbcb-0000-0000-0000-00000000000a'
\set KS 'cbcbcbcb-0000-0000-0000-000000000002'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u)::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;
set role authenticated;
select pg_temp.sebagai('cbcbcbcb-0000-0000-0000-000000000001');
select product_save(:'K', null, 'Air mineral 600ml', 'botol', 2000, 0, '[{"name":"botol","price_retail":3500},{"name":"Dus","content_qty":24,"content_unit":"botol","price_retail":70000}]', 100, null) as air \gset
select product_save(:'K', null, 'Roti', 'pcs', 4000, 0, '[{"name":"pcs","price_retail":6000}]', 3, null) as roti \gset
select category_save(:'K', null, 'Minuman') as cat \gset
select product_set_category(array[:'air']::uuid[], :'cat') \g /dev/null

\echo == A. Harga per jumlah beli
select price_breaks_set(:'air', 'botol', '[{"min_qty":12,"price":3000},{"min_qty":48,"price":2800,"tier":"semua"}]') = 2 a_simpan;
select pg_temp.gagal(format($$select price_breaks_set(%L, 'botol', '[{"min_qty":1,"price":3000}]')$$, :'air')) like '%lebih dari 1%' a_min_lebih_1;
select sale_create('cbcbcbcb-0000-0000-0000-0000000000e1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 12)), 0, 'tunai', 50000, null, null, null) \g /dev/null
select price = 3000 and not price_manual a_harga_12 from sale_lines where sale_id = 'cbcbcbcb-0000-0000-0000-0000000000e1';
select sale_create('cbcbcbcb-0000-0000-0000-0000000000e2', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 5)), 0, 'tunai', 50000, null, null, null) \g /dev/null
select price = 3500 a_harga_normal from sale_lines where sale_id = 'cbcbcbcb-0000-0000-0000-0000000000e2';
select sale_create('cbcbcbcb-0000-0000-0000-0000000000e3', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 12, 'price', 3600)), 0, 'tunai', 50000, null, null, null) \g /dev/null
select price = 3600 and price_manual a_manual_tetap from sale_lines where sale_id = 'cbcbcbcb-0000-0000-0000-0000000000e3';
select (promo_preview(:'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 48))) ->> 'subtotal')::numeric = 48 * 2800 a_pratinjau;
select jsonb_array_length(kasir_catalog(:'K') -> 'breaks') = 2 and kasir_catalog(:'K') ->> 'stock_policy' = 'izinkan' a_katalog;

\echo == B. Kebijakan stok minus
select pg_temp.gagal(format($$select stock_policy_set(%L, 'tolak')$$, :'K')) = 'TIDAK_DITOLAK' b_set;
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select stock_policy_set(%L, 'izinkan')$$, :'K')) like '%pemilik%' b_kasir_tidak_bisa_ubah;
select pg_temp.gagal(format($$select sale_create(gen_random_uuid(), %L, 'ecer', '[{"product_id":"%s","unit":"pcs","qty":5}]', 0, 'tunai', 50000, null, null, null)$$, :'K', :'roti')) like 'STOK_KURANG:%Roti%' b_tolak;
select sale_create('cbcbcbcb-0000-0000-0000-0000000000e4', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'roti', 'unit', 'pcs', 'qty', 3)), 0, 'tunai', 50000, null, null, null) is not null b_pas_boleh;
select pg_temp.sebagai('cbcbcbcb-0000-0000-0000-000000000001');
select (select count(*) from sales where kos_id = :'K') = 4 b_tidak_tersimpan;
select stock_policy_set(:'K', 'izinkan') \g /dev/null
select sale_create('cbcbcbcb-0000-0000-0000-0000000000e5', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'roti', 'unit', 'pcs', 'qty', 1)), 0, 'tunai', 50000, null, null, null) is not null b_izinkan_minus;
select stock = -1 b_stok_minus from products where id = :'roti';

\echo == C. Komisi: aturan umum 2%, khusus kasir untuk Minuman 5%
select commission_rule_save(:'K', null, null, 2) is not null c_aturan_umum;
select commission_rule_save(:'K', :'KS', :'cat', 5) is not null c_aturan_khusus;
select pg_temp.gagal(format($$select commission_rule_save(%L, null, null, 60)$$, :'K')) like '%maksimal%' c_batas;
-- kasir menjual: air 12 × 3000 = 36.000 (Minuman 5% = 1.800) + roti 3 × 6000 = 18.000 (umum 2% = 360)
select (r -> 'rows') @> jsonb_build_array(jsonb_build_object('user_id', :'KS', 'basis', 18000, 'komisi', 360)) c_hitung
from (select commission_report(:'K', current_date, current_date) r) z;
select (r -> 'rows') @> jsonb_build_array(jsonb_build_object('user_id', 'cbcbcbcb-0000-0000-0000-000000000001')) c_pemilik_juga
from (select commission_report(:'K', current_date, current_date) r) z;
-- ke gaji: perlu draf gaji + karyawan tertaut
select pg_temp.gagal(format($$select commission_to_payroll(%L, current_date)$$, :'K')) like '%draf gaji%' c_tanpa_draf;
select staff_save(:'K', null, jsonb_build_object('name', 'Rina Kasir', 'member_user_id', :'KS', 'pay_type', 'bulanan', 'base_pay', 1500000)) \g /dev/null
select payroll_draft(:'K', date_trunc('month', current_date)::date) \g /dev/null
select (r ->> 'masuk')::int = 1 and jsonb_array_length(r -> 'dilewati') = 1 and r -> 'dilewati' -> 0 ->> 'alasan' like '%belum ditautkan%' c_ke_gaji from (select commission_to_payroll(:'K', current_date) r) z;
select bonus = 360 and note like '%Komisi%' c_bonus_terisi from payroll_lines where kos_id = :'K';
select (commission_to_payroll(:'K', current_date) ->> 'masuk')::int = 0 c_tidak_dobel;
select (commission_report(:'K', current_date, current_date) -> 'rows') @> jsonb_build_array(jsonb_build_object('user_id', :'KS', 'dibayar', 360)) c_tanda_dibayar;

\echo == D. Pemeriksaan kehilangan
select sale_create('cbcbcbcb-0000-0000-0000-0000000000e6', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'Dus', 'qty', 1, 'price', 40000)), 0, 'tunai', 50000, null, null, null) \g /dev/null
select sale_create('cbcbcbcb-0000-0000-0000-0000000000e7', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'botol', 'qty', 10)), 15000, 'tunai', 50000, null, null, null) \g /dev/null
select stock_adjust(:'air', 'rusak', 6, 'pecah') \g /dev/null
select jsonb_array_length(r -> 'di_bawah_modal') = 1 and (r -> 'di_bawah_modal' -> 0 ->> 'rugi')::numeric = 8000
   and jsonb_array_length(r -> 'diskon_besar') = 1 and (r -> 'susut_barang' -> 0 ->> 'nilai')::numeric = 12000 d_temuan
from (select loss_watch(:'K', current_date, current_date) r) z;

\echo == E. Orang luar
select pg_temp.sebagai('cbcbcbcb-0000-0000-0000-000000000003');
select pg_temp.gagal(format($$select loss_watch(%L, current_date, current_date)$$, :'K')) like '%akses%' and pg_temp.gagal(format($$select commission_report(%L, current_date, current_date)$$, :'K')) like '%akses%'
   and pg_temp.gagal(format($$select price_breaks_set(%L, 'botol', '[]')$$, :'air')) like '%tidak ditemukan%' and pg_temp.gagal(format($$select stock_policy_set(%L, 'tolak')$$, :'K')) like '%pemilik%' e_orang_luar_ditolak;
select (select count(*) from price_breaks) + (select count(*) from commission_rules) + (select count(*) from commission_payouts) = 0 e_rls_kosong;
