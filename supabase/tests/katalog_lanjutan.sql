-- Uji Tahap 3 Retail — Katalog lanjutan (migrasi 20261121180000–20261121210000): merek, banyak barcode, harga & MOQ supplier,
-- barang paket, nomor seri & garansi, nota kredit & tukar barang. Database baru; lulus = semua kolom t, tanpa ERROR.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('ca7a3333-0000-0000-0000-000000000001','katalog@x.com'), ('ca7a3333-0000-0000-0000-000000000002','kasir-katalog@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('ca7a3333-0000-0000-0000-00000000000a','Toko Katalog','ca7a3333-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('ca7a3333-0000-0000-0000-00000000000a','ca7a3333-0000-0000-0000-000000000001','pemilik'),
  ('ca7a3333-0000-0000-0000-00000000000a','ca7a3333-0000-0000-0000-000000000002','kasir');
\set K 'ca7a3333-0000-0000-0000-00000000000a'
\set KO 'ca7a3333-0000-0000-0000-000000000001'
\set KS 'ca7a3333-0000-0000-0000-000000000002'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u)::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.stok(p uuid) returns numeric language sql security definer as $$ select stock from public.products where id = p $$;

set role authenticated;
select pg_temp.sebagai(:'KO');
select product_save(:'K', null, 'Gula pasir', 'kg', 15000, 0, '[{"name":"kg","price_retail":18000,"barcode":"111"}]', 20, null) as gula \gset
select product_save(:'K', null, 'Minyak goreng 1 L', 'pcs', 16000, 10, '[{"name":"pcs","price_retail":19000,"barcode":"444"},{"name":"dus","content_qty":12,"content_unit":"pcs","price_retail":220000}]', 2, null) as minyak \gset
select product_save(:'K', null, 'Teh celup', 'pcs', 3000, 0, '[{"name":"pcs","price_retail":5000}]', 50, null) as teh \gset
select product_save(:'K', null, 'Paket Hemat', 'paket', 0, 0, '[{"name":"paket","price_retail":60000}]', 0, null) as paket \gset
select product_save(:'K', null, 'HP Android X1', 'unit', 2000000, 0, '[{"name":"unit","price_retail":2500000}]', 3, null) as hp \gset
select contact_save(:'K', null, 'supplier', 'Distributor Maju', '0811') as s1 \gset
select contact_save(:'K', null, 'supplier', 'Grosir Murah', '0812') as s2 \gset
select contact_save(:'K', null, 'pelanggan', 'Pak Budi', '0813') as c1 \gset

\echo == A. Merek
select brand_save(:'K', null, 'Gulaku') as b1 \gset
select brand_save(:'K', null, 'Bimoli') as b2 \gset
select pg_temp.gagal(format($$select brand_save(%L, null, 'gulaku')$$, :'K')) like '%sudah ada%' a1_nama_ganda_ditolak;
select product_set_brand(array[:'gula']::uuid[], :'b1') = 1 and product_set_brand(array[:'minyak']::uuid[], :'b2') = 1 a2_pasang_merek;
select sale_create('ca7a3333-0000-0000-0000-0000000000a1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'kg', 'qty', 2), jsonb_build_object('product_id', :'teh', 'unit', 'pcs', 'qty', 2)), 0, 'tunai', null, null, null, null, null) is not null \g /dev/null
select brand_report(:'K', current_date, current_date) as br \gset
select exists (select 1 from jsonb_array_elements(:'br'::jsonb) x where x ->> 'name' = 'Gulaku' and (x ->> 'omzet')::numeric = 36000 and (x ->> 'laba')::numeric = 6000)
   and exists (select 1 from jsonb_array_elements(:'br'::jsonb) x where x ->> 'name' = 'Tanpa merek' and (x ->> 'omzet')::numeric = 10000) a3_laporan_per_merek;
select (kasir_catalog(:'K') -> 'products') @> jsonb_build_array(jsonb_build_object('id', :'gula', 'brand', 'Gulaku')) a4_kasir_bawa_merek;
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select brand_save(%L, null, 'Merek Kasir')$$, :'K')) like '%akses%' a5_kasir_tidak_bisa_ubah_merek;
select pg_temp.sebagai(:'KO');
select brand_delete(:'b2') is null \g /dev/null
select (select brand_id from products where id = :'minyak') is null a6_hapus_merek_barang_tetap_ada;

\echo == B. Banyak barcode per satuan
select unit_barcodes_set(:'gula', 'kg', array['222', '333', ' 222 ', '111']) = 2 b1_barcode_tambahan_disimpan;
select (barcode_find(:'K', '333') ->> 'product_id') = :'gula' and barcode_find(:'K', '333') ->> 'via' = 'tambahan' and barcode_find(:'K', '111') ->> 'via' = 'utama' b2_cari_semua_kode;
select pg_temp.gagal(format($$select unit_barcodes_set(%L, 'kg', array['444'])$$, :'gula')) like '%sudah dipakai Minyak%' b3_bentrok_barcode_utama_lain;
select pg_temp.gagal(format($$select product_save(%L, %L, 'Minyak goreng 1 L', 'pcs', 16000, 10, '[{"name":"pcs","price_retail":19000,"barcode":"222"}]', 0, null)$$, :'K', :'minyak')) like '%sudah dipakai%' b4_barcode_utama_tidak_boleh_sama_tambahan;
-- simpan ulang barang (satuan dibuat ulang) tidak menghapus barcode tambahan
select product_save(:'K', :'gula', 'Gula pasir', 'kg', 15000, 0, '[{"name":"kg","price_retail":18000,"barcode":"111"},{"name":"karung","content_qty":50,"content_unit":"kg","price_retail":850000}]', 0, null) is not null \g /dev/null
select unit_barcodes_set(:'gula', 'karung', array['555']) = 1 \g /dev/null
select (barcode_find(:'K', '222') ->> 'product_id') = :'gula' b5_tetap_ada_setelah_simpan_ulang;
select (select u -> 'codes' from jsonb_array_elements(kasir_catalog(:'K') -> 'units') u where u ->> 'product_id' = :'gula' and u ->> 'name' = 'kg') @> '["222","333"]' b6_kasir_bisa_scan_kode_tambahan;
select product_save(:'K', :'gula', 'Gula pasir', 'kg', 15000, 0, '[{"name":"kg","price_retail":18000,"barcode":"111"}]', 0, null) is not null \g /dev/null
select barcode_find(:'K', '555') is null and not exists (select 1 from product_barcodes where product_id = :'gula' and unit = 'karung') b7_satuan_dihapus_barcode_ikut_bersih;
select (barcode_find(:'K', '444') ->> 'unit') = 'pcs' b8_kode_lama_tetap;

\echo == C. Harga & MOQ per supplier
select supplier_item_save(:'K', :'s1', :'minyak', 'dus', 200000, 5, 4, 'MNY-12', true, null) as si1 \gset
select supplier_item_save(:'K', :'s2', :'minyak', 'dus', 195000, null, 2, null, false, null) is not null \g /dev/null
select supplier_items_for(:'K', null, :'minyak') as sf \gset
select jsonb_array_length(:'sf'::jsonb) = 2 and (:'sf'::jsonb -> 0 ->> 'supplier') = 'Distributor Maju' and (:'sf'::jsonb -> 0 ->> 'unit_cost')::numeric = 16666.67 c1_daftar_harga_supplier_utama_dulu;
select reorder_suggest(:'K') as rs \gset
select (select x ->> 'supplier' from jsonb_array_elements(:'rs'::jsonb) x where x ->> 'product_id' = :'minyak') = 'Distributor Maju'
   and (select (x ->> 'suggest')::numeric from jsonb_array_elements(:'rs'::jsonb) x where x ->> 'product_id' = :'minyak') = 5
   and (select (x ->> 'moq_applied')::boolean from jsonb_array_elements(:'rs'::jsonb) x where x ->> 'product_id' = :'minyak')
   and (select (x ->> 'price')::numeric from jsonb_array_elements(:'rs'::jsonb) x where x ->> 'product_id' = :'minyak') = 200000 c2_saran_belanja_pakai_supplier_utama_dan_moq;
select supplier_item_save(:'K', :'s2', :'minyak', 'dus', 195000, null, 2, null, true, null) is not null \g /dev/null
select (select count(*) from supplier_items where product_id = :'minyak' and preferred) = 1
   and (select contact_id from supplier_items where product_id = :'minyak' and preferred) = :'s2' c3_supplier_utama_hanya_satu;
select purchase_create('ca7a3333-0000-0000-0000-0000000000c1', :'K', current_date, :'s1', jsonb_build_array(jsonb_build_object('product_id', :'teh', 'unit', 'pcs', 'qty', 10, 'price', 3000)), 'tunai', null, null) is not null \g /dev/null
select exists (select 1 from jsonb_array_elements(supplier_items_for(:'K', :'s1')) x where x ->> 'product_id' = :'teh' and x ->> 'source' = 'riwayat' and (x ->> 'last_price')::numeric = 3000) c4_harga_terakhir_dari_belanja;
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select supplier_items_for(%L)$$, :'K')) like '%akses%' c5_kasir_tidak_lihat_harga_supplier;
select pg_temp.sebagai(:'KO');
select pg_temp.gagal(format($$select supplier_item_save(%L, %L, %L, 'liter', 1, null)$$, :'K', :'s1', :'minyak')) like '%tidak ada%' c6_satuan_harus_ada;

\echo == D. Barang paket (memotong stok komponen)
select pg_temp.gagal(format($$select kit_save(%L, '[{"product_id":"%s","unit":"kg","qty":1}]')$$, :'gula', :'teh')) like '%riwayat stok%' d1_barang_berstok_tidak_bisa_jadi_paket;
select pg_temp.gagal(format($$select kit_save(%L, '[{"product_id":"%s","unit":"paket","qty":1}]')$$, :'paket', :'paket')) like '%dirinya sendiri%' d2_tidak_berisi_diri_sendiri;
select (kit_save(:'paket', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'kg', 'qty', 2), jsonb_build_object('product_id', :'teh', 'unit', 'pcs', 'qty', 3))) ->> 'cost')::numeric = 39000 d3_modal_paket_dari_komponen;
select product_save(:'K', null, 'Paket Lain', 'paket', 0, 0, '[{"name":"paket","price_retail":1000}]', 0, null) as paket2 \gset
select pg_temp.gagal(format($$select kit_save(%L, '[{"product_id":"%s","unit":"paket","qty":1}]')$$, :'paket2', :'paket')) like '%paket lain%' d4_paket_tidak_berisi_paket;
-- stok sekarang: gula 18 kg, teh 48+10 = 58 (modal tetap 3.000) → bisa dibuat min(18/2, 58/3) = 9
select (select (p ->> 'stock')::numeric from jsonb_array_elements(kasir_catalog(:'K') -> 'products') p where p ->> 'id' = :'paket') = 9 d5_stok_paket_dari_komponen;
select sale_create('ca7a3333-0000-0000-0000-0000000000d1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'paket', 'unit', 'paket', 'qty', 2)), 0, 'tunai', null, null, null, null, null) is not null \g /dev/null
select pg_temp.stok(:'gula') = 14 and pg_temp.stok(:'teh') = 52 and pg_temp.stok(:'paket') = 0 d6_komponen_berkurang;
select (select cost_total from sales where id = 'ca7a3333-0000-0000-0000-0000000000d1') = 78000
   and (select count(*) from sale_line_parts where sale_id = 'ca7a3333-0000-0000-0000-0000000000d1') = 2
   and not exists (select 1 from stock_moves where product_id = :'paket') d7_modal_dan_rincian_komponen;
select pg_temp.gagal(format($$select stock_adjust(%L, 'koreksi', 5, 'uji')$$, :'paket')) like '%tidak punya stok sendiri%' d8_stok_paket_tidak_bisa_diubah;
select pg_temp.gagal(format($$select purchase_create(gen_random_uuid(), %L, current_date, null, '[{"product_id":"%s","unit":"paket","qty":1,"price":1000}]', 'tunai', null, null)$$, :'K', :'paket')) like '%tidak punya stok sendiri%' d9_paket_tidak_dibeli;
select id as dl from sale_lines where sale_id = 'ca7a3333-0000-0000-0000-0000000000d1' \gset
select (sale_return_create('ca7a3333-0000-0000-0000-0000000000d2', 'ca7a3333-0000-0000-0000-0000000000d1', jsonb_build_array(jsonb_build_object('line_id', :'dl', 'qty', 1)), 'tunai', 'ganti pikiran') ->> 'total')::numeric = 60000 \g /dev/null
select pg_temp.stok(:'gula') = 16 and pg_temp.stok(:'teh') = 55 and (select cost_total from sale_returns where id = 'ca7a3333-0000-0000-0000-0000000000d2') = 39000 d10_retur_paket_kembalikan_komponen;
select sale_return_create('ca7a3333-0000-0000-0000-0000000000d3', 'ca7a3333-0000-0000-0000-0000000000d1', jsonb_build_array(jsonb_build_object('line_id', :'dl', 'qty', 1, 'rusak', true)), 'tunai', 'rusak') is not null \g /dev/null
select pg_temp.stok(:'gula') = 18 and pg_temp.stok(:'teh') = 58 and (select count(*) from stock_holds where ref_id = 'ca7a3333-0000-0000-0000-0000000000d3') = 2 d11_retur_terakhir_tepat_sisa_dan_rusak_ditahan;
select sale_create('ca7a3333-0000-0000-0000-0000000000d4', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'paket', 'unit', 'paket', 'qty', 1)), 0, 'tunai', null, null, null, null, null) is not null \g /dev/null
select sale_void('ca7a3333-0000-0000-0000-0000000000d4', 'salah input') is null \g /dev/null
select pg_temp.stok(:'gula') = 18 and pg_temp.stok(:'teh') = 58 d12_batal_paket_kembalikan_komponen;
select not exists (select 1 from jsonb_array_elements(reorder_suggest(:'K')) x where x ->> 'product_id' = :'paket')
   and not exists (select 1 from jsonb_array_elements(stock_health(:'K') -> 'rows') x where x ->> 'id' = :'paket') d13_paket_tidak_ikut_saran_dan_kesehatan;
select jsonb_array_length(kit_overview(:'K')) = 1 and (kit_overview(:'K') -> 0 ->> 'avail')::numeric = 8 d14_ringkasan_paket_tanpa_barang_ditahan;

\echo == E. Nomor seri & garansi
select product_set_serial(:'hp', true, 365) is null \g /dev/null
select pg_temp.gagal(format($$select product_set_serial(%L, true, 30)$$, :'paket')) like '%paket%' e1_paket_tidak_bernomor_seri;
select (serial_add(:'K', :'hp', array['SN1', 'SN2', 'SN3', 'sn1']) ->> 'added')::int = 3 e2_daftar_nomor_seri;
select (serial_add(:'K', :'hp', array['SN1', 'SN4']) -> 'duplicates') = '["SN1"]' e3_nomor_ganda_dilewati;
select sale_create('ca7a3333-0000-0000-0000-0000000000e1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'hp', 'unit', 'unit', 'qty', 1, 'serials', jsonb_build_array('SN1'))), 0, 'tunai', null, :'c1', null, null, null) is not null \g /dev/null
select status = 'terjual' and warranty_until = current_date + 365 and contact_id = :'c1' e4_terjual_dengan_garansi from product_serials where product_id = :'hp' and serial = 'SN1';
select pg_temp.gagal(format($$select sale_create(gen_random_uuid(), %L, 'ecer', '[{"product_id":"%s","unit":"unit","qty":1,"serials":["sn1"]}]', 0, 'tunai')$$, :'K', :'hp')) like '%berstatus terjual%' e5_tidak_bisa_dijual_dua_kali;
select pg_temp.gagal(format($$select sale_create(gen_random_uuid(), %L, 'ecer', '[{"product_id":"%s","unit":"unit","qty":1,"serials":["SN2","SN3"]}]', 0, 'tunai')$$, :'K', :'hp')) like '%lebih banyak%' e6_jumlah_nomor_tidak_lebih_dari_qty;
select sale_create('ca7a3333-0000-0000-0000-0000000000e2', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'hp', 'unit', 'unit', 'qty', 1, 'serials', jsonb_build_array('SN9'))), 0, 'tunai', null, null, null, null, null) is not null \g /dev/null
select exists (select 1 from product_serials where serial = 'SN9' and status = 'terjual') e7_nomor_belum_terdaftar_dicatat_saat_dijual;
select sale_create('ca7a3333-0000-0000-0000-0000000000e3', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'hp', 'unit', 'unit', 'qty', 1)), 0, 'tunai', null, null, null, null, null) is not null \g /dev/null
select id as el3 from sale_lines where sale_id = 'ca7a3333-0000-0000-0000-0000000000e3' \gset
select sale_serials_set('ca7a3333-0000-0000-0000-0000000000e3', :'el3', array['SN2']) = 1 and (sale_serials('ca7a3333-0000-0000-0000-0000000000e3') -> 0 ->> 'serial') = 'SN2' e8_tautkan_nomor_belakangan;
select serial_lookup(:'K', 'SN1') as lk \gset
select (:'lk'::jsonb -> 0 ->> 'garansi') = 'aktif' and (:'lk'::jsonb -> 0 ->> 'customer') = 'Pak Budi' and (:'lk'::jsonb -> 0 ->> 'days_left')::int = 365 e9_cek_garansi;
select id as sn1 from product_serials where serial = 'SN1' \gset
select (claim_create(:'K', :'sn1', 'layar bergaris') ->> 'in_warranty')::boolean e10_klaim_dalam_garansi;
select id as cl1 from warranty_claims where serial_id = :'sn1' \gset
select pg_temp.gagal(format($$select claim_status(%L, 'selesai', null)$$, :'cl1')) like '%Tulis hasilnya%' e11_selesai_wajib_hasil;
select claim_status(:'cl1', 'selesai', 'layar diganti servis resmi') \g /dev/null
select (select status from warranty_claims where id = :'cl1') = 'selesai' e12_klaim_selesai;
select id as el1 from sale_lines where sale_id = 'ca7a3333-0000-0000-0000-0000000000e1' \gset
select sale_return_create(gen_random_uuid(), 'ca7a3333-0000-0000-0000-0000000000e1', jsonb_build_array(jsonb_build_object('line_id', :'el1', 'qty', 1, 'rusak', true, 'serials', jsonb_build_array('SN1'))), 'tunai', 'mati total') is not null \g /dev/null
select status = 'rusak' and sale_id is null e13_retur_rusak from product_serials where id = :'sn1';
select sale_void('ca7a3333-0000-0000-0000-0000000000e2', 'salah') is null \g /dev/null
select status = 'tersedia' e14_batal_nomor_kembali_tersedia from product_serials where serial = 'SN9';
select pg_temp.gagal(format($$select serial_set_status(id, 'tersedia', 'x') from product_serials where serial = 'SN2'$$)) like '%retur atau pembatalan%' e15_terjual_tidak_diubah_manual;
select serial_set_status(id, 'hapus') from product_serials where serial = 'SN3' \g /dev/null
select not exists (select 1 from product_serials where serial = 'SN3') e16_hapus_salah_ketik;
select pg_temp.gagal($$select serial_set_status(id, 'hapus') from product_serials where serial = 'SN9'$$) like '%belum pernah terjual%' e17_pernah_terjual_tidak_dihapus;
select pg_temp.sebagai(:'KS');
select jsonb_array_length(serial_lookup(:'K', 'SN')) >= 3 e18_kasir_bisa_cek_garansi;
select pg_temp.gagal(format($$select serial_add(%L, %L, array['SNX'])$$, :'K', :'hp')) like '%akses%' e19_kasir_tidak_bisa_daftar;
select pg_temp.sebagai(:'KO');

\echo == F. Nota kredit & tukar barang
select sale_create('ca7a3333-0000-0000-0000-0000000000f1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'teh', 'unit', 'pcs', 'qty', 4)), 0, 'tunai', null, :'c1', null, null, null) is not null \g /dev/null
select id as fl1 from sale_lines where sale_id = 'ca7a3333-0000-0000-0000-0000000000f1' \gset
select sale_return_create('ca7a3333-0000-0000-0000-0000000000f2', 'ca7a3333-0000-0000-0000-0000000000f1', jsonb_build_array(jsonb_build_object('line_id', :'fl1', 'qty', 2)), 'nota', 'tukar rasa') as fr \gset
select (:'fr'::jsonb -> 'credit_note' ->> 'amount')::numeric = 10000 and (:'fr'::jsonb -> 'credit_note' ->> 'number') like 'NK-%' f1_retur_terbitkan_nota;
select (:'fr'::jsonb -> 'credit_note' ->> 'id') as n1, (:'fr'::jsonb -> 'credit_note' ->> 'number') as n1no \gset
select (credit_note_check(:'K', lower(:'n1no')) ->> 'balance')::numeric = 10000 and (credit_note_check(:'K', :'n1no') ->> 'usable')::boolean f2_cek_saldo_nota;
select sale_create('ca7a3333-0000-0000-0000-0000000000f3', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'teh', 'unit', 'pcs', 'qty', 3)), 0, 'campuran', 5000, null, null, null,
  jsonb_build_array(jsonb_build_object('method', 'nota', 'amount', 10000, 'note_id', :'n1'), jsonb_build_object('method', 'tunai', 'amount', 5000))) is not null \g /dev/null
select amt_nota = 10000 and amt_tunai = 5000 and pay_method = 'campuran' and credit_note_balance(:'n1') = 0 f3_bayar_campuran_dengan_nota from sales where id = 'ca7a3333-0000-0000-0000-0000000000f3';
select pg_temp.gagal(format($$select sale_create(gen_random_uuid(), %L, 'ecer', '[{"product_id":"%s","unit":"pcs","qty":1}]', 0, 'nota', null, null, null, null, '[{"method":"nota","amount":5000,"note_id":"%s"}]')$$, :'K', :'teh', :'n1')) like '%tinggal 0%' f4_saldo_habis_ditolak;
select sale_void('ca7a3333-0000-0000-0000-0000000000f3', 'salah') \g /dev/null
select credit_note_balance(:'n1') = 10000 f5_batal_mengembalikan_saldo_nota;
select pg_temp.gagal(format($$select sale_create(gen_random_uuid(), %L, 'ecer', '[{"product_id":"%s","unit":"pcs","qty":1}]', 0, 'nota')$$, :'K', :'teh')) like '%Pilih nota kredit%' f6_nota_wajib_dipilih;
select sale_create('ca7a3333-0000-0000-0000-0000000000f4', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'teh', 'unit', 'pcs', 'qty', 2)), 0, 'nota', null, null, null, null,
  jsonb_build_array(jsonb_build_object('method', 'nota', 'amount', 10000, 'note_id', :'n1'))) is not null \g /dev/null
select pay_method = 'nota' and amt_nota = total and credit_note_balance(:'n1') = 0 f7_bayar_penuh_dengan_nota from sales where id = 'ca7a3333-0000-0000-0000-0000000000f4';
-- masa berlaku
select credit_note_policy_set(:'K', 30) is null \g /dev/null
select sale_return_create('ca7a3333-0000-0000-0000-0000000000f5', 'ca7a3333-0000-0000-0000-0000000000f1', jsonb_build_array(jsonb_build_object('line_id', :'fl1', 'qty', 1)), 'nota', 'kemasan sobek') -> 'credit_note' as fn2 \gset
select (:'fn2'::jsonb ->> 'valid_until')::date = current_date + 30 f8_masa_berlaku_dari_aturan;
reset role;
update credit_notes set valid_until = current_date - 1 where id = (:'fn2'::jsonb ->> 'id')::uuid;
set role authenticated;
select pg_temp.sebagai(:'KO');
select pg_temp.gagal(format($$select sale_create(gen_random_uuid(), %L, 'ecer', '[{"product_id":"%s","unit":"pcs","qty":1}]', 0, 'nota', null, null, null, null, '[{"method":"nota","amount":5000,"note_id":"%s"}]')$$, :'K', :'teh', :'fn2'::jsonb ->> 'id')) like '%masa berlaku%' f9_lewat_masa_berlaku_ditolak;
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select credit_note_forfeit(%L, 'hangus')$$, :'fn2'::jsonb ->> 'id')) like '%tidak ditemukan%' f10_kasir_tidak_bisa_menghanguskan;
select pg_temp.sebagai(:'KO');
select credit_note_forfeit((:'fn2'::jsonb ->> 'id')::uuid, 'lewat masa berlaku') = 5000 f11_hangus_jadi_pendapatan_lain;
select jsonb_array_length(credit_notes_list(:'K', false)) = 2 and jsonb_array_length(credit_notes_list(:'K', true)) = 0 f12_daftar_nota;
-- tukar barang, selisih dibayar tunai: retur 2 teh (10.000) → beli 1 Paket Hemat (60.000)
select sale_create('ca7a3333-0000-0000-0000-0000000000f6', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'teh', 'unit', 'pcs', 'qty', 2)), 0, 'tunai', null, null, null, null, null) is not null \g /dev/null
select id as fl6 from sale_lines where sale_id = 'ca7a3333-0000-0000-0000-0000000000f6' \gset
select sale_exchange(jsonb_build_object('id', 'ca7a3333-0000-0000-0000-0000000000f7', 'sale_id', 'ca7a3333-0000-0000-0000-0000000000f6', 'lines', jsonb_build_array(jsonb_build_object('line_id', :'fl6', 'qty', 2)), 'refund', 'tunai', 'reason', 'tukar'),
  jsonb_build_object('id', 'ca7a3333-0000-0000-0000-0000000000f8', 'lines', jsonb_build_array(jsonb_build_object('product_id', :'paket', 'unit', 'paket', 'qty', 1)), 'method', 'tunai')) as ex \gset
select (:'ex'::jsonb -> 'sale' ->> 'total')::numeric = 60000 and (:'ex'::jsonb -> 'return' ->> 'total')::numeric = 10000
   and (select exchange_return_id from sales where id = 'ca7a3333-0000-0000-0000-0000000000f8') = 'ca7a3333-0000-0000-0000-0000000000f7'
   and (select exchange_sale_id from sale_returns where id = 'ca7a3333-0000-0000-0000-0000000000f7') = 'ca7a3333-0000-0000-0000-0000000000f8' f13_tukar_barang_tertaut;
-- tukar dengan nota: retur 1 teh → nota 5.000 langsung membayar 1 teh baru
select sale_create('ca7a3333-0000-0000-0000-0000000000f9', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'teh', 'unit', 'pcs', 'qty', 1)), 0, 'tunai', null, null, null, null, null) is not null \g /dev/null
select id as fl9 from sale_lines where sale_id = 'ca7a3333-0000-0000-0000-0000000000f9' \gset
select sale_exchange(jsonb_build_object('id', 'ca7a3333-0000-0000-0000-0000000000fa', 'sale_id', 'ca7a3333-0000-0000-0000-0000000000f9', 'lines', jsonb_build_array(jsonb_build_object('line_id', :'fl9', 'qty', 1)), 'refund', 'nota', 'reason', 'ganti'),
  jsonb_build_object('id', 'ca7a3333-0000-0000-0000-0000000000fb', 'lines', jsonb_build_array(jsonb_build_object('product_id', :'teh', 'unit', 'pcs', 'qty', 1)), 'method', 'nota',
    'payments', jsonb_build_array(jsonb_build_object('method', 'nota', 'amount', 5000, 'note_id', '$return')))) is not null \g /dev/null
select (select amt_nota from sales where id = 'ca7a3333-0000-0000-0000-0000000000fb') = 5000
   and credit_note_balance((select id from credit_notes where return_id = 'ca7a3333-0000-0000-0000-0000000000fa')) = 0 f14_tukar_pakai_nota_langsung;
-- gagal di penjualan baru → retur ikut batal (satu transaksi)
select sale_create('ca7a3333-0000-0000-0000-0000000000fc', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'teh', 'unit', 'pcs', 'qty', 1)), 0, 'tunai', null, null, null, null, null) is not null \g /dev/null
select id as flc from sale_lines where sale_id = 'ca7a3333-0000-0000-0000-0000000000fc' \gset
select pg_temp.gagal(format($$select sale_exchange('{"id":"ca7a3333-0000-0000-0000-0000000000fd","sale_id":"ca7a3333-0000-0000-0000-0000000000fc","lines":[{"line_id":"%s","qty":1}],"refund":"tunai","reason":"x"}', '{"id":"ca7a3333-0000-0000-0000-0000000000fe","lines":[],"method":"tunai"}')$$, :'flc')) like '%Keranjang masih kosong%'
   and not exists (select 1 from sale_returns where id = 'ca7a3333-0000-0000-0000-0000000000fd') f15_tukar_gagal_retur_dibatalkan;

\echo == G. Pembukuan tetap seimbang
select acct_trial_balance(:'K', date_trunc('month', current_date)::date, current_date) as tb \gset
select (:'tb'::jsonb ->> 'seimbang')::boolean g1_neraca_saldo_seimbang;
select (select (r ->> 'akhir')::numeric from jsonb_array_elements(:'tb'::jsonb -> 'rows') r where r ->> 'sys_key' = 'persediaan') = (inventory_valuation(:'K') ->> 'buku')::numeric
   and (inventory_valuation(:'K') ->> 'selisih')::numeric = 0 g2_persediaan_kartu_stok_sama_buku;
select coalesce((select -(r ->> 'akhir')::numeric from jsonb_array_elements(:'tb'::jsonb -> 'rows') r where r ->> 'sys_key' = 'nota_kredit'), 0)
     = (select coalesce(sum(credit_note_balance(id)), 0) from credit_notes where kos_id = :'K' and status = 'aktif') g3_saldo_nota_sama_buku;
select exists (select 1 from jsonb_array_elements(:'tb'::jsonb -> 'rows') r where r ->> 'sys_key' = 'pendapatan_lain' and (r ->> 'akhir_kredit')::numeric = 5000) g4_nota_hangus_pendapatan_lain;
reset role;
