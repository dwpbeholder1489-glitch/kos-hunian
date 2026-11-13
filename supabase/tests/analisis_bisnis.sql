-- Uji analisis bisnis bertingkat. Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/analisis_bisnis.sql"
-- Skenario toko 2 cabang: bulan lalu jual 1.000.000 (modal 600.000) di Pusat; bulan ini 1.500.000 (modal 900.000) di Pusat
-- + 500.000 (modal 300.000) di Cabang B; biaya listrik bulan ini 200.000 (Pusat).
-- Harapan bulan ini: pendapatan 2.000.000, HPP 1.200.000, biaya 200.000, transaksi 3; bulan lalu: 1.000.000 / 600.000 / 0 / 1.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('a7a7a7a7-0000-0000-0000-000000000001','analisis@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status,business_type) values
  ('a7a7a7a7-0000-0000-0000-00000000000f','Toko Analisis','a7a7a7a7-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail')
on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values ('a7a7a7a7-0000-0000-0000-00000000000f','a7a7a7a7-0000-0000-0000-000000000001','pemilik') on conflict do nothing;
-- lokasi utama dibuat otomatis; ganti namanya jadi Pusat, tambah Cabang B
update branches set name = 'Pusat' where kos_id = 'a7a7a7a7-0000-0000-0000-00000000000f' and is_main;
insert into branches(id,kos_id,name,kind,is_main,active) values
  ('a7a7a7a7-0000-0000-0000-0000000000b2','a7a7a7a7-0000-0000-0000-00000000000f','Cabang B','cabang',false,true) on conflict do nothing;
\set K 'a7a7a7a7-0000-0000-0000-00000000000f'
select id as b1 from branches where kos_id = :'K' and is_main \gset
insert into products(id,kos_id,name,base_unit,cost,stock) values
  ('a7a7a7a7-0000-0000-0000-0000000000d1', :'K', 'Beras 5kg', 'karung', 60000, 0), ('a7a7a7a7-0000-0000-0000-0000000000d2', :'K', 'Minyak 2L', 'botol', 30000, 0),
  ('a7a7a7a7-0000-0000-0000-0000000000d3', :'K', 'Gula 1kg', 'pak', 12000, 0) on conflict do nothing;
select date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date as m0 \gset
-- penjualan (jurnal diposting otomatis oleh acct_sync_internal) + baris barang
insert into sales(id,kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status,branch_id) values
  ('a7a7a7a7-0000-0000-0000-0000000000c0', :'K', 'TA-0', (:'m0'::date - 10), 1000000, 1000000, 600000, 'tunai', 'selesai', :'b1'),
  ('a7a7a7a7-0000-0000-0000-0000000000c1', :'K', 'TA-1', :'m0', 1000000, 1000000, 600000, 'tunai', 'selesai', :'b1'),
  ('a7a7a7a7-0000-0000-0000-0000000000c2', :'K', 'TA-2', :'m0', 500000, 500000, 300000, 'tunai', 'selesai', :'b1'),
  ('a7a7a7a7-0000-0000-0000-0000000000c3', :'K', 'TA-3', :'m0', 500000, 500000, 300000, 'tunai', 'selesai', 'a7a7a7a7-0000-0000-0000-0000000000b2');
insert into sale_lines(sale_id,kos_id,product_id,name,unit,unit_qty,qty,price,cost,line_total) values
  ('a7a7a7a7-0000-0000-0000-0000000000c1', :'K', 'a7a7a7a7-0000-0000-0000-0000000000d1', 'Beras 5kg', 'karung', 1, 10, 100000, 60000, 1000000),
  ('a7a7a7a7-0000-0000-0000-0000000000c2', :'K', 'a7a7a7a7-0000-0000-0000-0000000000d2', 'Minyak 2L', 'botol', 1, 10, 50000, 30000, 500000),
  ('a7a7a7a7-0000-0000-0000-0000000000c3', :'K', 'a7a7a7a7-0000-0000-0000-0000000000d3', 'Gula 1kg', 'pak', 1, 25, 20000, 12000, 500000);
insert into expense_categories(id,kos_id,name) values ('a7a7a7a7-0000-0000-0000-0000000000e1', :'K', 'Listrik') on conflict do nothing;
insert into expenses(kos_id,date,category_id,kind,amount,description,branch_id) values (:'K', :'m0', 'a7a7a7a7-0000-0000-0000-0000000000e1', 'operasional', 200000, 'PLN', :'b1');
select set_config('request.jwt.claim.sub', 'a7a7a7a7-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a7a7a7a7-0000-0000-0000-000000000001"}', false) \g /dev/null

\echo == A. Pro (mendalam): angka bulan ini & lalu dari jurnal, 13 bulan, per lokasi, teratas, hari
select biz_analysis(:'K', :'m0') as x \gset
select :'x'::jsonb ->> 'level' a_level, jsonb_array_length(:'x'::jsonb -> 'per_bulan') = 13 a_13_bulan;
select b ->> 'pendapatan' a_pend_ini, b ->> 'hpp' a_hpp_ini, b ->> 'biaya' a_biaya_ini, b ->> 'transaksi' a_trx_ini from jsonb_array_elements(:'x'::jsonb -> 'per_bulan') b where (b ->> 'bulan')::date = :'m0';
select b ->> 'pendapatan' a_pend_lalu, b ->> 'transaksi' a_trx_lalu from jsonb_array_elements(:'x'::jsonb -> 'per_bulan') b where (b ->> 'bulan')::date = (:'m0'::date - interval '1 month')::date;
select (:'x'::jsonb ->> 'multi_lokasi')::boolean a_multi,
       (select sum((p ->> 'pendapatan')::numeric) from jsonb_array_elements(:'x'::jsonb -> 'per_lokasi') p where p ->> 'lokasi' = 'Pusat' and (p ->> 'bulan')::date = :'m0') a_pusat_1500000,
       (select sum((p ->> 'pendapatan')::numeric) from jsonb_array_elements(:'x'::jsonb -> 'per_lokasi') p where p ->> 'lokasi' = 'Cabang B' and (p ->> 'bulan')::date = :'m0') a_cabang_500000,
       (select sum((p ->> 'biaya')::numeric) from jsonb_array_elements(:'x'::jsonb -> 'per_lokasi') p where p ->> 'lokasi' = 'Pusat' and (p ->> 'bulan')::date = :'m0') a_biaya_pusat_200000;
select (:'x'::jsonb -> 'teratas' -> 0 ->> 'nama') a_teratas_beras, jsonb_array_length(:'x'::jsonb -> 'teratas_lokasi') = 3 a_teratas_per_lokasi,
       jsonb_array_length(:'x'::jsonb -> 'hari') = 7 a_7_hari,
       exists (select 1 from jsonb_array_elements(:'x'::jsonb -> 'per_akun') a where a ->> 'jenis' = 'biaya' and (a ->> 'ini')::numeric = 200000) a_biaya_per_akun;

\echo == B. Bisnis (lanjutan): tren 12 bulan & per akun, tanpa per lokasi
update kos set plan = 'bisnis' where id = :'K';
select biz_analysis(:'K', :'m0') as y \gset
select :'y'::jsonb ->> 'level' b_level, jsonb_array_length(:'y'::jsonb -> 'per_bulan') = 13 b_13_bulan, (:'y'::jsonb ? 'per_lokasi') = false b_tanpa_lokasi,
       (:'y'::jsonb ? 'teratas') b_ada_teratas;

\echo == C. Dasar: hanya bulan ini vs bulan lalu
update kos set plan = 'dasar' where id = :'K';
select biz_analysis(:'K', :'m0') as z \gset
select :'z'::jsonb ->> 'level' c_level, jsonb_array_length(:'z'::jsonb -> 'per_bulan') = 2 c_2_bulan, (:'z'::jsonb ? 'per_akun') = false c_tanpa_per_akun;

\echo == D. Akses: orang luar ditolak; bulan depan ditolak; penawaran sesuai paket
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false) \g /dev/null
do $$ declare m text; begin
  begin perform biz_analysis('a7a7a7a7-0000-0000-0000-00000000000f', null); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tidak punya akses%' then raise exception 'D_GAGAL luar: %', m; end if; raise notice 'd_OK: orang luar ditolak';
end $$;
select set_config('request.jwt.claim.sub', 'a7a7a7a7-0000-0000-0000-000000000001', false) \g /dev/null
do $$ declare m text; begin
  begin perform biz_analysis('a7a7a7a7-0000-0000-0000-00000000000f', (now() + interval '2 month')::date); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Bulan belum berjalan%' then raise exception 'D_GAGAL bulan depan: %', m; end if; raise notice 'd_OK: bulan depan ditolak';
end $$;
select growth_offer(:'K', 'fitur', 'ANALYTICS.ADVANCED.REQUESTED') ->> 'to_plan' d_dasar_ke_bisnis, growth_offer(:'K', 'fitur', 'ANALYTICS.MULTI_BRANCH.REQUESTED') ->> 'to_plan' d_dasar_ke_pro;
