-- Uji mesin konversi satuan (satuan utama + satuan jual). Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/konversi_satuan.sql"
-- Lulus = semua kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('e5e5e5e5-0000-0000-0000-000000000001','satuan@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('e5e5e5e5-0000-0000-0000-00000000000a','Toko Satuan','e5e5e5e5-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('e5e5e5e5-0000-0000-0000-00000000000a','e5e5e5e5-0000-0000-0000-000000000001','pemilik');
\set K 'e5e5e5e5-0000-0000-0000-00000000000a'
set role authenticated;
select set_config('request.jwt.claim.sub', 'e5e5e5e5-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"e5e5e5e5-0000-0000-0000-000000000001","email":"satuan@x.com"}', false) \g /dev/null
select shift_open(:'K', 0) \g /dev/null

\echo == Mesin konversi
select unit_factor('gram', 'kg') = 0.001 m1_gram_kg, unit_factor('kg', 'gram') = 1000 m2_kg_gram, unit_factor('ons', 'kg') = 0.1 m3_ons,
       unit_factor('kuintal', 'kg') = 100 m4_kuintal, unit_factor('ton', 'kg') = 1000 m5_ton, unit_factor('ml', 'liter') = 0.001 m6_ml,
       unit_factor('Kemasan 250 gram', 'kg') = 0.25 m7_kemasan, unit_factor('liter', 'kg') is null m8_lintas_dimensi_null, unit_factor('liter', 'kg', 0.9) = 0.9 m9_densitas;

\echo == 1-3. Gula 100 kg, jual 250 gram (satuan "gram") → 99,75 kg
select product_save(:'K', null, 'Gula pasir', 'kg', 12000, 0,
  '[{"name":"kg","price_retail":14000},{"name":"gram","content_qty":1,"content_unit":"gram","price_retail":15},
    {"name":"Kemasan 250 gram","content_qty":250,"content_unit":"gram","price_retail":3700,"price_wholesale":3500},
    {"name":"Sak 50 kg","content_qty":50,"content_unit":"kg","price_retail":640000}]', 100, null) as gula \gset
select qty = 0.001 a_gram_0001, content_qty = 1 and content_unit = 'gram' a_isi_tersimpan from product_units where product_id = :'gula' and name = 'gram';
select qty = 0.25 a_kemasan_025 from product_units where product_id = :'gula' and name = 'Kemasan 250 gram';
select qty = 50 a_sak_50 from product_units where product_id = :'gula' and name = 'Sak 50 kg';
select sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'gram', 'qty', 250)), 0, 'tunai') ->> 'id' as s1 \gset
select stock = 99.75 t3_stok_99_75 from products where id = :'gula';
select cost_total = 3000 and total = 3750 t3_hpp_3000_jual_3750 from sales where id = :'s1';

\echo == 4-6. Stok 100 kg, jual 2 kemasan 250 gram → 99,5 kg
select product_save(:'K', null, 'Gula kemasan', 'kg', 12000, 0,
  '[{"name":"kg","price_retail":14000},{"name":"Kemasan 250 gram","content_qty":250,"content_unit":"gram","price_retail":3700}]', 100, null) as gk \gset
select sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'gk', 'unit', 'Kemasan 250 gram', 'qty', 2)), 0, 'tunai') ->> 'id' as s2 \gset
select stock = 99.5 t6_stok_99_5 from products where id = :'gk';
select cost_total = 6000 and total = 7400 and total - cost_total = 1400 t6_laba_1400 from sales where id = :'s2';
select unit_qty = 0.25 and qty = 2 and cost = 12000 t6_baris_simpan_faktor from sale_lines where sale_id = :'s2';

\echo == 7-9. Minyak 10 liter, jual 500 ml → 9,5 liter
select product_save(:'K', null, 'Minyak curah', 'liter', 18000, 0,
  '[{"name":"liter","price_retail":21000},{"name":"ml","content_qty":1,"content_unit":"ml","price_retail":22},{"name":"½ liter","content_qty":500,"content_unit":"ml","price_retail":11000}]', 10, null) as minyak \gset
select sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'minyak', 'unit', 'ml', 'qty', 500)), 0, 'tunai') \g /dev/null
select stock = 9.5 t9_stok_9_5 from products where id = :'minyak';
select sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'minyak', 'unit', '½ liter', 'qty', 1)), 0, 'tunai') ->> 'id' as s3 \gset
select stock = 9 t9_setengah_liter from products where id = :'minyak';
select cost_total = 9000 t9_hpp_setengah_liter from sales where id = :'s3';

\echo == 10. Liter → kg tanpa densitas ditolak; dengan densitas 0,9 dihitung
do $$ declare m text; begin
  begin perform product_save('e5e5e5e5-0000-0000-0000-00000000000a', null, 'Minyak per kg', 'kg', 20000, 0,
    '[{"name":"kg","price_retail":22000},{"name":"Botol","content_qty":1,"content_unit":"liter","price_retail":21000}]'::jsonb, 0, null);
  exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tidak bisa mengubah liter ke kg%' then raise exception 'T10_GAGAL isi liter: %', m; end if;
  m := null;
  begin perform product_save('e5e5e5e5-0000-0000-0000-00000000000a', null, 'Minyak per kg 2', 'kg', 20000, 0,
    '[{"name":"kg","price_retail":22000},{"name":"1 liter","qty":1.5,"price_retail":21000}]'::jsonb, 0, null);
  exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like '"1 liter" adalah volume/berat%' then raise exception 'T10_GAGAL nama liter: %', m; end if;
  raise notice 't10_OK: konversi liter ke kg tanpa densitas ditolak';
end $$;
select product_save(:'K', null, 'Minyak per kg', 'kg', 20000, 0,
  '[{"name":"kg","price_retail":22000},{"name":"1 liter","content_qty":1,"content_unit":"liter","price_retail":21000}]', 50, null, 0.9) as mkg \gset
select qty = 0.9 t10_densitas_09 from product_units where product_id = :'mkg' and name = '1 liter';
select density = 0.9 t10_densitas_tersimpan from products where id = :'mkg';

\echo == 11. Dus isi 24 botol → jual 1 dus mengurangi 24 botol
select product_save(:'K', null, 'Air mineral 600ml', 'botol', 2500, 0,
  '[{"name":"botol","price_retail":3500},{"name":"Dus","content_qty":24,"content_unit":"botol","price_retail":72000,"price_wholesale":68000},
    {"name":"Karton","content_qty":2,"content_unit":"Dus","price_retail":140000}]', 100, null) as air \gset
select qty = 48 t11_karton_2_dus_48 from product_units where product_id = :'air' and name = 'Karton';
select sale_create(gen_random_uuid(), :'K', 'grosir', jsonb_build_array(jsonb_build_object('product_id', :'air', 'unit', 'Dus', 'qty', 1)), 0, 'tunai') ->> 'id' as s4 \gset
select stock = 76 t11_stok_76 from products where id = :'air';
select total = 68000 and cost_total = 60000 t11_harga_grosir_hpp from sales where id = :'s4';

\echo == 12. Harga & HPP akurat: belanja 1 sak 50 kg Rp 650.000 → modal rata-rata per kg
select product_save(:'K', null, 'Beras', 'kg', 12000, 0,
  '[{"name":"kg","price_retail":14000},{"name":"Sak 50 kg","content_qty":50,"content_unit":"kg","price_retail":680000},{"name":"½ kg","content_qty":500,"content_unit":"gram","price_retail":7500}]', 50, null) as beras \gset
select purchase_create(gen_random_uuid(), :'K', current_date, null, jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'Sak 50 kg', 'qty', 1, 'price', 650000)), 'tunai', null, null) \g /dev/null
select stock = 100 and cost = 12500 t12_modal_rata_rata_12500 from products where id = :'beras';
select sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', '½ kg', 'qty', 4)), 0, 'tunai') ->> 'id' as s5 \gset
select stock = 98 t12_stok_98 from products where id = :'beras';
select cost_total = 25000 and total = 30000 t12_laba_5000 from sales where id = :'s5';
-- retur 1 × ½ kg → stok +0,5 kg, HPP dibalik 6.250
select sale_return_create(gen_random_uuid(), :'s5', jsonb_build_array(jsonb_build_object('line_id', (select id from sale_lines where sale_id = :'s5'), 'qty', 1)), 'tunai', 'uji') \g /dev/null
select stock = 98.5 t12_retur_jual_05 from products where id = :'beras';

\echo == Validasi input
do $$ declare m text; begin
  begin perform product_save('e5e5e5e5-0000-0000-0000-00000000000a', null, 'Salah gram', 'kg', 1000, 0, '[{"name":"kg"},{"name":"gram","qty":250}]'::jsonb, 0, null);
  exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Satuan "gram" = 0,001 kg, bukan 250 kg%' then raise exception 'V_GAGAL 250 gram: %', m; end if;
  m := null;
  begin perform product_save('e5e5e5e5-0000-0000-0000-00000000000a', null, 'Salah kemasan', 'kg', 1000, 0, '[{"name":"kg"},{"name":"Kemasan 250 gram","qty":250}]'::jsonb, 0, null);
  exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Satuan "Kemasan 250 gram" = 0,25 kg%' then raise exception 'V_GAGAL kemasan: %', m; end if;
  m := null;
  begin perform product_save('e5e5e5e5-0000-0000-0000-00000000000a', null, 'Pcs gram', 'pcs', 1000, 0, '[{"name":"pcs"},{"name":"Dus","content_qty":250,"content_unit":"gram"}]'::jsonb, 0, null);
  exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Satuan utama "pcs" bukan satuan berat/volume%' then raise exception 'V_GAGAL pcs gram: %', m; end if;
  m := null;
  begin perform product_save('e5e5e5e5-0000-0000-0000-00000000000a', null, 'Ton gram', 'ton', 1000, 0, '[{"name":"ton"},{"name":"gram","content_qty":1,"content_unit":"gram"}]'::jsonb, 0, null);
  exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like '%terlalu kecil untuk dicatat%' then raise exception 'V_GAGAL presisi: %', m; end if;
  m := null;
  begin perform product_save('e5e5e5e5-0000-0000-0000-00000000000a', (select id from products where name = 'Gula pasir'), 'Gula pasir', 'gram', 12, 0, '[{"name":"gram"}]'::jsonb, 0, null);
  exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Satuan utama "kg" tidak bisa diganti%' then raise exception 'V_GAGAL ganti satuan utama: %', m; end if;
  raise notice 'v_OK: 250 gram ≠ 250 kg, kemasan, pcs-gram, presisi, ganti satuan utama — semua ditolak';
end $$;
-- ganti penulisan saja (kg → Kg) tetap boleh
select product_save(:'K', :'gula', 'Gula pasir', 'Kg', 12000, 0,
  '[{"name":"Kg","price_retail":14000},{"name":"gram","content_qty":1,"content_unit":"gram","price_retail":15}]', 0, null) = :'gula' v_ganti_tulisan_boleh;

\echo == Mutasi dalam satuan jual (dikonversi server) & penyesuaian stok
reset role;
insert into branches(id, kos_id, name, kind, is_main, active) values ('e5e5e5e5-0000-0000-0000-0000000000b2', :'K', 'Gudang', 'gudang', false, true);
set role authenticated;
select (select branch_id from stock_levels where product_id = :'gk' and qty > 0 limit 1) as b1 \gset
select stock_transfer(gen_random_uuid(), :'K', :'b1', 'e5e5e5e5-0000-0000-0000-0000000000b2', jsonb_build_array(jsonb_build_object('product_id', :'gk', 'unit', 'Kemasan 250 gram', 'qty', 6)), 'uji') \g /dev/null
select qty = 1.5 x_mutasi_6_kemasan_15kg from stock_levels where product_id = :'gk' and branch_id = 'e5e5e5e5-0000-0000-0000-0000000000b2';
select stock = 99.5 x_total_tetap from products where id = :'gk';
select unit_to_base(:'gk', 'kemasan 250 gram', 3) = 0.75 x_unit_to_base;

\echo == Pembukuan seimbang & HPP jurnal = HPP penjualan
reset role;
select acct_sync_internal(:'K') \g /dev/null
select (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 z_jurnal_seimbang;
select (select coalesce(sum(cost_total), 0) from sales where kos_id = :'K' and status <> 'batal') =
       (select coalesce(sum(l.debit) - sum(l.credit), 0) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'hpp')
       + (select coalesce(sum(round(rl.qty * sl.unit_qty * sl.cost, 2)), 0) from sale_return_lines rl join sale_lines sl on sl.id = rl.sale_line_id join sale_returns r on r.id = rl.return_id where r.kos_id = :'K') z_hpp_jurnal_cocok;
