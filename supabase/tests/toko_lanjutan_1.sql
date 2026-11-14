-- Uji Toko lanjutan 1: kategori, varian, tutup harian, KPI toko. Database baru; lulus = semua t, tanpa ERROR.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('cacacaca-0000-0000-0000-000000000001','tl1@x.com'), ('cacacaca-0000-0000-0000-000000000002','kasir-tl1@x.com'), ('cacacaca-0000-0000-0000-000000000003','luar-tl1@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('cacacaca-0000-0000-0000-00000000000a','Toko Lanjut','cacacaca-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('cacacaca-0000-0000-0000-00000000000a','cacacaca-0000-0000-0000-000000000001','pemilik'), ('cacacaca-0000-0000-0000-00000000000a','cacacaca-0000-0000-0000-000000000002','kasir');
\set K 'cacacaca-0000-0000-0000-00000000000a'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u)::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;
set role authenticated;
select pg_temp.sebagai('cacacaca-0000-0000-0000-000000000001');

\echo == A. Kategori
select category_save(:'K', null, 'Sembako') as cat1 \gset
select category_save(:'K', null, 'Pakaian') as cat2 \gset
select pg_temp.gagal(format($$select category_save(%L, null, 'sembako')$$, :'K')) like '%sudah ada%' a_nama_unik;
select product_save(:'K', null, 'Beras 5 kg', 'pcs', 60000, 0, '[{"name":"pcs","price_retail":70000}]', 10, null) as beras \gset
select product_save(:'K', null, 'Gula 1 kg', 'pcs', 12000, 0, '[{"name":"pcs","price_retail":15000}]', 5, null) as gula \gset
select product_set_category(array[:'beras', :'gula']::uuid[], :'cat1') = 2 a_pasang_banyak;
select count(*) = 2 a_terpasang from products where category_id = :'cat1';

\echo == B. Varian: buat 3 varian dengan satuan Lusin dari template, label unik, ganti nama grup
select r ->> 'name' = 'Kaos Polos' and jsonb_array_length(r -> 'made') = 3 b_buat_varian from (select variant_save(:'K', null, 'Kaos Polos',
  '[{"name":"Ukuran","values":["S","M","L"]}]', jsonb_build_object('base', 'pcs', 'cost', 30000, 'category_id', :'cat2', 'units', '[{"name":"Lusin","content_qty":12,"content_unit":"pcs","price_retail":550000}]'::jsonb),
  '[{"label":"S","price_retail":50000,"stock":4,"sku":"KP-S"},{"label":"M","price_retail":50000,"stock":6,"sku":"KP-M","barcode":"899100000001"},{"label":"L","price_retail":55000,"cost":32000,"stock":2}]') r) z;
select variant_group_id as grp from products where sku = 'KP-S' \gset
select count(*) = 3 and bool_and(category_id = :'cat2') and bool_and(name like 'Kaos Polos — %') b_varian_tersimpan from products where variant_group_id = :'grp';
select stock = 2 and cost = 32000 b_modal_per_varian from products where variant_group_id = :'grp' and variant_label = 'L';
select (select count(*) from product_units u join products p on p.id = u.product_id where p.variant_group_id = :'grp' and u.name = 'Lusin' and u.qty = 12) = 3 b_satuan_lusin_disalin;
select pg_temp.gagal(format($$select variant_save(%L, %L, null, null, '{"base":"pcs"}', '[{"label":"m"}]')$$, :'K', :'grp')) like '%sudah ada%' b_label_unik;
select jsonb_array_length(variant_save(:'K', :'grp', null, null, '{"base":"pcs","cost":30000}', '[{"label":"XL","price_retail":58000}]') -> 'made') = 1 b_tambah_varian;
select product_save(:'K', null, 'Kaos XXL lama', 'pcs', 33000, 0, '[{"name":"pcs","price_retail":60000}]', 1, null) as xxl \gset
select variant_link(:'xxl', :'grp', 'XXL') \g /dev/null
select name = 'Kaos Polos — XXL' b_gabung_barang_lama from products where id = :'xxl';
select variant_group_rename(:'grp', 'Kaos Polos Katun') \g /dev/null
select count(*) = 5 b_ganti_nama_grup from products where variant_group_id = :'grp' and name like 'Kaos Polos Katun — %';

\echo == C. Penjualan oleh dua orang, retur, batal, rusak
select id as kpm from products where variant_group_id = :'grp' and variant_label = 'M' \gset
select sale_create('cacacaca-0000-0000-0000-0000000000e1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'pcs', 'qty', 2), jsonb_build_object('product_id', :'kpm', 'unit', 'pcs', 'qty', 1)), 0, 'tunai', 200000, null, null, null) \g /dev/null
select pg_temp.sebagai('cacacaca-0000-0000-0000-000000000002');
select sale_create('cacacaca-0000-0000-0000-0000000000e2', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'pcs', 'qty', 5)), 0, 'transfer', null, null, null, null) \g /dev/null
select sale_create('cacacaca-0000-0000-0000-0000000000e3', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'pcs', 'qty', 1)), 0, 'tunai', 70000, null, null, null) \g /dev/null
select pg_temp.gagal($$select day_close_summary('cacacaca-0000-0000-0000-00000000000a', current_date)$$) like '%keuangan%' c_kasir_tidak_bisa_tutup;
select pg_temp.sebagai('cacacaca-0000-0000-0000-000000000001');
select sale_void('cacacaca-0000-0000-0000-0000000000e3', 'salah input') \g /dev/null
select stock_adjust(:'beras', 'rusak', 1, 'karung bocor') \g /dev/null

\echo == D. Tutup harian
select (r ->> 'trx')::int = 2 and (r ->> 'omzet')::numeric = 265000 and (r ->> 'batal_n')::int = 1 and (r -> 'bayar' ->> 'tunai')::numeric = 190000
   and (r -> 'bayar' ->> 'transfer')::numeric = 75000 and jsonb_array_length(r -> 'kasir') = 2 and (r ->> 'susut')::numeric = 60000
   and (r -> 'kas' ->> 'akhir')::numeric = 190000 and (r ->> 'laba_kotor')::numeric = 265000 - (2 * 60000 + 30000 + 5 * 12000) d_ringkasan
from (select day_close_summary(:'K', current_date) r) z;
select pg_temp.gagal(format($$select day_close_summary(%L, current_date + 1)$$, :'K')) like '%masa depan%' d_masa_depan_ditolak;
select (r ->> 'diff')::numeric = -5000 and not (r ->> 'reclosed')::boolean d_tutup from (select day_close(:'K', current_date, null, 185000, 'kurang 5rb') r) z;
select not (day_close_list(:'K') -> 0 ->> 'berubah')::boolean d_belum_berubah;
-- transaksi baru setelah ditutup: tetap boleh, ditandai berubah
select sale_create('cacacaca-0000-0000-0000-0000000000e5', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'pcs', 'qty', 1)), 0, 'tunai', 70000, null, null, null) is not null d_tetap_bisa_jual;
select (day_close_list(:'K') -> 0 ->> 'berubah')::boolean d_ditandai_berubah;
select (day_close(:'K', current_date, null, null, null) ->> 'reclosed')::boolean d_tutup_ulang;
select jsonb_array_length(log) = 1 and (snapshot ->> 'trx')::int = 3 and cash_counted is null d_riwayat_tersimpan from day_closings where kos_id = :'K';

\echo == E. KPI toko
select (r ->> 'trx')::int = 3 and (r ->> 'rata_keranjang')::numeric = round(335000 / 3.0) and (r ->> 'batal_n')::int = 1 and (r ->> 'susut')::numeric = 60000
   and (r ->> 'barang_aktif')::int = 7 and (r ->> 'perputaran') is not null and jsonb_array_length(r -> 'kasir') = 2
   and (r -> 'kategori' -> 0 ->> 'name') = 'Sembako' and (r -> 'varian' -> 0 ->> 'name') = 'Kaos Polos Katun' e_kpi
from (select retail_kpi(:'K', current_date - 6, current_date) r) z;
select (select (r ->> 'stok_habis')::int from (select retail_kpi(:'K', current_date, current_date) r) z) = 2 and (select count(*) from products where kos_id = :'K' and stock <= 0) = 2 e_stok_habis;

\echo == F. Hapus kategori, orang luar
select category_delete(:'cat1') = 2 f_hapus_kategori;
select count(*) = 0 f_lepas from products where category_id = :'cat1';
select pg_temp.sebagai('cacacaca-0000-0000-0000-000000000003');
select pg_temp.gagal(format($$select retail_kpi(%L, current_date, current_date)$$, :'K')) like '%akses%' and pg_temp.gagal(format($$select category_save(%L, null, 'x')$$, :'K')) like '%akses%'
   and pg_temp.gagal(format($$select variant_save(%L, null, 'x', null, '{"base":"pcs"}', '[{"label":"a"}]')$$, :'K')) like '%akses%'
   and pg_temp.gagal(format($$select day_close_list(%L)$$, :'K')) like '%akses%' f_orang_luar_ditolak;
select (select count(*) from product_categories) + (select count(*) from product_variant_groups) + (select count(*) from day_closings) = 0 f_rls_kosong;
