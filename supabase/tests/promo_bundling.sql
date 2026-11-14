-- Uji promo & bundling Kasir. Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/promo_bundling.sql"
-- Lulus = semua kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('b7b7b7b7-0000-0000-0000-000000000001','promo@x.com'), ('b7b7b7b7-0000-0000-0000-000000000002','kasir-promo@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('b7b7b7b7-0000-0000-0000-00000000000a','Toko Promo','b7b7b7b7-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('b7b7b7b7-0000-0000-0000-00000000000a','b7b7b7b7-0000-0000-0000-000000000001','pemilik'),
  ('b7b7b7b7-0000-0000-0000-00000000000a','b7b7b7b7-0000-0000-0000-000000000002','kasir');
insert into business_modules(kos_id, module_code, active, updated_by) values ('b7b7b7b7-0000-0000-0000-00000000000a', 'r_promo', true, 'uji') on conflict (kos_id, module_code) do update set active = true;
\set K 'b7b7b7b7-0000-0000-0000-00000000000a'
set role authenticated;
select set_config('request.jwt.claim.sub', 'b7b7b7b7-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"b7b7b7b7-0000-0000-0000-000000000001","email":"promo@x.com"}', false) \g /dev/null
select shift_open(:'K', 0) \g /dev/null
select product_save(:'K', null, 'Mie instan', 'pcs', 2500, 0, '[{"name":"pcs","price_retail":3500,"price_wholesale":3200},{"name":"Dus","content_qty":40,"content_unit":"pcs","price_retail":130000}]', 500, null) as mie \gset
select product_save(:'K', null, 'Kopi sachet', 'pcs', 1000, 0, '[{"name":"pcs","price_retail":1500}]', 500, null) as kopi \gset
select product_save(:'K', null, 'Gula 1 kg', 'pcs', 15000, 0, '[{"name":"pcs","price_retail":18000}]', 100, null) as gula \gset
select product_save(:'K', null, 'Teh celup', 'kotak', 6000, 0, '[{"name":"kotak","price_retail":8000}]', 100, null) as teh \gset

\echo == A. Tanpa promo: transaksi seperti biasa
select (sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'mie', 'unit', 'pcs', 'qty', 2)), 0, 'tunai') ->> 'total')::numeric = 7000 a_tanpa_promo;

\echo == B. Beli 2 gratis 1 (mie): 7 pcs → 2 set → gratis 2 pcs = 7.000
select promo_save(:'K', null, jsonb_build_object('name', 'Mie beli 2 gratis 1', 'kind', 'gratis', 'product_id', :'mie', 'unit', 'pcs', 'buy_qty', 2, 'free_qty', 1)) as pg \gset
select (promo_preview(:'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'mie', 'unit', 'pcs', 'qty', 7))) ->> 'total')::numeric = 7000 b_pratinjau;
select sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'mie', 'unit', 'pcs', 'qty', 7)), 0, 'tunai') ->> 'id' as s1 \gset
select subtotal = 24500 and discount = 7000 and promo_discount = 7000 and total = 17500 and promos->0->>'name' = 'Mie beli 2 gratis 1' b_transaksi from sales where id = :'s1';
select stock = 491 b_stok_keluar_7 from products where id = :'mie';
-- harga diubah manual di kasir → tidak ikut promo
select (sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'mie', 'unit', 'pcs', 'qty', 3, 'price', 3000)), 0, 'tunai') ->> 'total')::numeric = 9000 b_harga_manual_tanpa_promo;
-- satuan lain (Dus) tidak ikut promo pcs
select (promo_preview(:'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'mie', 'unit', 'Dus', 'qty', 3))) ->> 'total')::numeric = 0 b_satuan_lain;

\echo == C. Paket: 1 gula + 2 teh = 30.000 (normal 34.000) → hemat 4.000 per paket; sisa barang harga biasa
select promo_save(:'K', null, jsonb_build_object('name', 'Paket ngeteh', 'kind', 'paket', 'bundle_price', 30000,
  'items', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'pcs', 'qty', 1), jsonb_build_object('product_id', :'teh', 'unit', 'kotak', 'qty', 2)))) as pp \gset
select (r->>'total')::numeric = 8000 and (r->>'subtotal')::numeric = 76000 c_dua_paket
from (select promo_preview(:'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'pcs', 'qty', 2), jsonb_build_object('product_id', :'teh', 'unit', 'kotak', 'qty', 5))) r) t;
select (promo_preview(:'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'pcs', 'qty', 2), jsonb_build_object('product_id', :'teh', 'unit', 'kotak', 'qty', 1))) ->> 'total')::numeric = 0 c_paket_tidak_lengkap;

\echo == D. Diskon 10% kopi + minimal belanja 100.000 potong 5.000; satu barang hanya satu promo
select promo_save(:'K', null, jsonb_build_object('name', 'Kopi 10%', 'kind', 'diskon', 'percent', 10, 'product_ids', jsonb_build_array(:'kopi'))) as pd \gset
select promo_save(:'K', null, jsonb_build_object('name', 'Belanja 100rb hemat 5rb', 'kind', 'belanja', 'amount', 5000, 'min_spend', 100000)) as pb \gset
-- kopi 20 (30.000 → −3.000), mie 6 (21.000 → gratis 2 = −7.000), gula 4 (72.000): setelah promo 113.000 ≥ 100.000 → −5.000
select sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 20),
  jsonb_build_object('product_id', :'mie', 'unit', 'pcs', 'qty', 6), jsonb_build_object('product_id', :'gula', 'unit', 'pcs', 'qty', 4)), 1000, 'tunai') ->> 'id' as s2 \gset
select subtotal = 123000 and promo_discount = 15000 and discount = 16000 and total = 107000 and jsonb_array_length(promos) = 3 d_gabungan from sales where id = :'s2';
-- di bawah minimal belanja: tidak dapat potongan belanja
select (promo_preview(:'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'pcs', 'qty', 5))) ->> 'total')::numeric = 0 d_di_bawah_minimal;

\echo == E. Jadwal, harga grosir, nonaktif
select promo_save(:'K', null, jsonb_build_object('name', 'Teh besok', 'kind', 'diskon', 'percent', 50, 'product_ids', jsonb_build_array(:'teh'), 'start_date', current_date + 2)) as pt \gset
select (promo_preview(:'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'teh', 'unit', 'kotak', 'qty', 1))) ->> 'total')::numeric = 0 e_belum_mulai;
select promo_save(:'K', :'pg', jsonb_build_object('name', 'Mie beli 2 gratis 1', 'kind', 'gratis', 'product_id', :'mie', 'unit', 'pcs', 'buy_qty', 2, 'free_qty', 1, 'tier', 'ecer')) \g /dev/null
select (promo_preview(:'K', 'grosir', jsonb_build_array(jsonb_build_object('product_id', :'mie', 'unit', 'pcs', 'qty', 3))) ->> 'total')::numeric = 0 e_grosir_tidak_ikut;
select promo_set_active(:'pd', false) \g /dev/null
select (promo_preview(:'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'kopi', 'unit', 'pcs', 'qty', 10))) ->> 'total')::numeric = 0 e_nonaktif;
select (select x->>'state' from jsonb_array_elements(promo_list(:'K')->'promos') x where x->>'id' = :'pt') = 'terjadwal' e_status_terjadwal,
       (select (x->>'used')::int from jsonb_array_elements(promo_list(:'K')->'promos') x where x->>'id' = :'pg') = 2 e_dipakai_2x,
       (promo_list(:'K')->>'month_given')::numeric = 22000 e_total_bulan_ini;

\echo == F. Diskon manual + promo tidak boleh melebihi subtotal; validasi; izin
do $$ declare m text; k uuid := 'b7b7b7b7-0000-0000-0000-00000000000a'; mie uuid := (select id from products where name = 'Mie instan'); begin
  begin perform sale_create(gen_random_uuid(), k, 'ecer', jsonb_build_array(jsonb_build_object('product_id', mie, 'unit', 'pcs', 'qty', 3)), 8000, 'tunai'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Diskon tidak boleh melebihi subtotal (promo otomatis sudah memotong 3.500)%' then raise exception 'F_GAGAL lebih: %', m; end if; m := null;
  begin perform promo_save(k, null, jsonb_build_object('name', 'Paket mahal', 'kind', 'paket', 'bundle_price', 99999, 'items', jsonb_build_array(jsonb_build_object('product_id', mie, 'unit', 'pcs', 'qty', 2)))); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Harga paket (99.999) harus lebih murah%' then raise exception 'F_GAGAL paket: %', m; end if; m := null;
  begin perform promo_save(k, null, jsonb_build_object('name', 'Rugi', 'kind', 'belanja', 'amount', 50000, 'min_spend', 60000)); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Minimal belanja harus sekurangnya%' then raise exception 'F_GAGAL belanja: %', m; end if; m := null;
  begin perform promo_save(k, null, jsonb_build_object('name', 'Gratis banyak', 'kind', 'gratis', 'product_id', mie, 'buy_qty', 1, 'free_qty', 2)); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Jumlah gratis tidak boleh lebih banyak%' then raise exception 'F_GAGAL gratis: %', m; end if;
  raise notice 'f_OK: diskon berlebih, paket lebih mahal, potongan merugikan, gratis berlebih ditolak';
end $$;
select set_config('request.jwt.claim.sub', 'b7b7b7b7-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"b7b7b7b7-0000-0000-0000-000000000002","email":"kasir-promo@x.com"}', false) \g /dev/null
do $$ declare m text; begin
  begin perform promo_save('b7b7b7b7-0000-0000-0000-00000000000a', null, jsonb_build_object('name', 'Nakal', 'kind', 'diskon', 'percent', 90)); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik%' then raise exception 'F_GAGAL kasir: %', m; end if; raise notice 'f_OK: kasir tidak bisa membuat promo';
end $$;
select (promo_preview(:'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'mie', 'unit', 'pcs', 'qty', 3))) ->> 'total')::numeric = 3500 f_kasir_dapat_promo_otomatis;
select set_config('request.jwt.claim.sub', 'b7b7b7b7-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"b7b7b7b7-0000-0000-0000-000000000001","email":"promo@x.com"}', false) \g /dev/null

\echo == G. PPN, retur & jurnal tetap cocok dengan promo
select tax_settings_set(:'K', true, 11, null) \g /dev/null
select sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'mie', 'unit', 'pcs', 'qty', 3)), 0, 'tunai') ->> 'id' as s3 \gset
select total = 7000 and tax_amount = round(7000 * 11 / 111.0, 2) g_ppn_dari_total_setelah_promo from sales where id = :'s3';
reset role;
select acct_sync_internal(:'K') \g /dev/null
select (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 g_jurnal_seimbang;
select (select sum(l.debit - l.credit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'kas' and l.source_type = 'sale')
     = (select sum(total) from sales where kos_id = :'K') g_kas_sama_dengan_total;
