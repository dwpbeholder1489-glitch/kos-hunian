-- Uji Tahap E: titik awal skenario dari jurnal, simpan berversi, validasi, akses & paket.
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/skenario_stress_test.sql"
-- Lulus = semua kolom t / angka sesuai nama kolom, semua NOTICE diawali OK (tanpa GAGAL). Rumus proyeksi: node supabase/tests/skenario_js.mjs
\set ON_ERROR_STOP off
\set K 'aeaeaeae-0000-0000-0000-00000000000a'
\set D 'aeaeaeae-0000-0000-0000-00000000000d'
\set Q 'aeaeaeae-0000-0000-0000-00000000000e'
\set O 'aeaeaeae-0000-0000-0000-000000000001'
\set X 'aeaeaeae-0000-0000-0000-000000000003'
insert into auth.users(id,email) values (:'O','skn@x.com'), (:'X','kasir-skn@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  (:'K','Toko Skenario',:'O','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'D','Toko Dasar',:'O','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'Q','Kos Skenario',:'O','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','properti') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'K',:'O','pemilik'), (:'K',:'X','kasir'), (:'D',:'O','pemilik'), (:'Q',:'O','pemilik') on conflict do nothing;
select date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date as cm \gset
select (:'cm'::date - interval '3 months')::date as m3, (:'cm'::date - interval '2 months')::date as m2, (:'cm'::date - interval '1 months')::date as m1 \gset
-- Toko: penjualan 3 bulan (9 jt, 12 jt, 15 jt → rata 12 jt, HPP 60%), biaya 2 jt/bulan, penjualan bulan ini TIDAK ikut
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values
  (:'K','S1',:'m3'::date + 3,9000000,9000000,5400000,'tunai','selesai'), (:'K','S2',:'m2'::date + 3,12000000,12000000,7200000,'tunai','selesai'),
  (:'K','S3',:'m1'::date + 3,15000000,15000000,9000000,'kasbon','selesai'), (:'K','S4',:'cm',50000000,50000000,0,'tunai','selesai');
insert into expenses(kos_id,date,amount,description,kind) select :'K', m::date + 5, 2000000, 'Operasional', 'operasional' from (values (:'m3'), (:'m2'), (:'m1')) v(m);
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"aeaeaeae-0000-0000-0000-000000000001","email":"skn@x.com"}', false);
\o

\echo == A. Titik awal dari jurnal
select scenario_baseline(:'K') as b \gset
select (:'b'::jsonb ->> 'aktif')::boolean a_aktif, (:'b'::jsonb ->> 'bulan_data')::int a_3_bulan, (:'b'::jsonb ->> 'pendapatan')::numeric a_pendapatan_12jt,
       (:'b'::jsonb ->> 'hpp')::numeric a_hpp_7_2jt, (:'b'::jsonb ->> 'beban_operasional')::numeric a_biaya_2jt, (:'b'::jsonb ->> 'piutang')::numeric a_piutang_15jt,
       :'b'::jsonb ->> 'jenis' a_jenis;
-- angka sama dengan Laporan Keuangan (biz_financials) untuk 3 bulan yang sama
select round((biz_financials(:'K', :'m3', (:'cm'::date - 1)) -> 'laba_rugi' -> 'cur' ->> 'pendapatan_usaha')::numeric / 3, 2) = (:'b'::jsonb ->> 'pendapatan')::numeric a_sama_laporan;
-- bisnis yang baru 1 bulan: dirata-rata 1 bulan saja
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values ('aeaeaeae-0000-0000-0000-00000000000b','Toko Baru',:'O','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('aeaeaeae-0000-0000-0000-00000000000b',:'O','pemilik');
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values ('aeaeaeae-0000-0000-0000-00000000000b','B1',:'m1'::date + 2,6000000,6000000,0,'tunai','selesai');
select (scenario_baseline('aeaeaeae-0000-0000-0000-00000000000b') ->> 'bulan_data')::int a_baru_1_bulan, (scenario_baseline('aeaeaeae-0000-0000-0000-00000000000b') ->> 'pendapatan')::numeric a_baru_6jt;
-- kos: hunian
insert into rooms(id,kos_id,code,rent) values ('aeaeaeae-0000-0000-0000-0000000000a1',:'Q','A1',1000000), ('aeaeaeae-0000-0000-0000-0000000000a2',:'Q','A2',1000000);
select scenario_baseline(:'Q') -> 'hunian' ->> 'kamar' a_kos_2_kamar;

\echo == B. Simpan berversi
select scenario_save(:'K', null, 'Rencana 2027', '{"skenario":[{"key":"pesimis","pendapatan":-15,"biaya":5,"margin_pp":-2,"piutang_hari":15,"bunga_pp":2,"kejutan":0,"kejutan_bulan":1,"hunian":50},{"key":"dasar","pendapatan":0},{"key":"optimis","pendapatan":10,"margin_pp":1}]}', 'awal') as s1 \gset
select (:'s1'::jsonb ->> 'version')::int b_versi_1;
select assumptions -> 'skenario' -> 0 ? 'hunian' = false b_hunian_dibuang_untuk_toko, (baseline ->> 'pendapatan')::numeric b_salinan_titik_awal_12jt, created_by = 'skn@x.com' b_oleh
  from fin_scenarios where id = (:'s1'::jsonb ->> 'id')::uuid;
select scenario_save(:'K', (:'s1'::jsonb ->> 'group_id')::uuid, 'Rencana 2027', '{"skenario":[{"key":"pesimis","pendapatan":-25},{"key":"dasar"},{"key":"optimis","pendapatan":5}]}', 'revisi') as s2 \gset
select (:'s2'::jsonb ->> 'version')::int b_versi_2, (select count(*) from fin_scenarios where group_id = (:'s1'::jsonb ->> 'group_id')::uuid) b_dua_baris;
select jsonb_array_length(scenario_list(:'K') -> 0 -> 'versions') b_daftar_2_versi, (scenario_get(:'K', (:'s1'::jsonb ->> 'id')::uuid) ->> 'note') = 'awal' b_versi_lama_utuh;
do $$ begin update fin_scenarios set note = 'ubah' where kos_id = 'aeaeaeae-0000-0000-0000-00000000000a';
  raise notice 'GAGAL b: versi lama bisa diubah';
exception when others then raise notice 'OK b: versi lama tidak bisa diubah (%)', left(sqlerrm, 40); end $$;
select count(*) > 0 b_riwayat from config_history where kos_id = :'K' and action = 'simpan_skenario';
select scenario_archive(:'K', (:'s1'::jsonb ->> 'group_id')::uuid, true)::text = '' b_arsip;
select (scenario_list(:'K') -> 0 ->> 'archived') = 'true' b_terarsip;

\echo == C. Validasi
do $$ begin perform scenario_save('aeaeaeae-0000-0000-0000-00000000000a', null, 'X', '{"skenario":[{"key":"pesimis","pendapatan":-150},{"key":"dasar"},{"key":"optimis"}]}', null);
  raise notice 'GAGAL c: pendapatan -150%% diterima';
exception when others then raise notice 'OK c: di luar batas ditolak (%)', left(sqlerrm, 50); end $$;
do $$ begin perform scenario_save('aeaeaeae-0000-0000-0000-00000000000a', null, 'X', '{"skenario":[{"key":"dasar"},{"key":"dasar"},{"key":"optimis"}]}', null);
  raise notice 'GAGAL c: skenario dobel diterima';
exception when others then raise notice 'OK c: skenario dobel ditolak'; end $$;
do $$ begin perform scenario_save('aeaeaeae-0000-0000-0000-00000000000a', null, ' ', '{"skenario":[{"key":"pesimis"},{"key":"dasar"},{"key":"optimis"}]}', null);
  raise notice 'GAGAL c: nama kosong diterima';
exception when others then raise notice 'OK c: nama wajib'; end $$;
do $$ begin perform scenario_save('aeaeaeae-0000-0000-0000-00000000000a', null, 'X', '{"skenario":[{"key":"pesimis","biaya":"10"},{"key":"dasar"},{"key":"optimis"}]}', null);
  raise notice 'GAGAL c: teks diterima sebagai angka';
exception when others then raise notice 'OK c: nilai harus angka'; end $$;
select scenario_save(:'Q', null, 'Kos', '{"skenario":[{"key":"pesimis","hunian":40,"margin_pp":-3},{"key":"dasar","hunian":50},{"key":"optimis","hunian":80}]}', null) as sq \gset
select (assumptions -> 'skenario' -> 0 ->> 'hunian')::numeric = 40 c_kos_hunian_disimpan, assumptions -> 'skenario' -> 0 ? 'margin_pp' = false c_kos_tanpa_margin
  from fin_scenarios where id = (:'sq'::jsonb ->> 'id')::uuid;

\echo == D. Paket & akses
select (scenario_baseline(:'D') ->> 'aktif')::boolean = false d_dasar_tidak_aktif, scenario_baseline(:'D') ? 'pendapatan' = false d_dasar_tanpa_angka;
do $$ begin perform scenario_save('aeaeaeae-0000-0000-0000-00000000000d', null, 'X', '{"skenario":[{"key":"pesimis"},{"key":"dasar"},{"key":"optimis"}]}', null);
  raise notice 'GAGAL d: Paket Dasar bisa menyimpan';
exception when others then raise notice 'OK d: Paket Dasar ditolak (%)', left(sqlerrm, 30); end $$;
\o /dev/null
select set_config('request.jwt.claim.sub', :'X', false), set_config('request.jwt.claims', '{"sub":"aeaeaeae-0000-0000-0000-000000000003"}', false);
\o
do $$ begin perform scenario_baseline('aeaeaeae-0000-0000-0000-00000000000a');
  raise notice 'GAGAL d: kasir bisa membaca';
exception when others then raise notice 'OK d: kasir ditolak'; end $$;
set role authenticated;
select count(*) = 0 d_kasir_tidak_melihat_baris from fin_scenarios where kos_id = :'K';
do $$ begin insert into fin_scenarios(kos_id, group_id, version, name, assumptions, baseline) values ('aeaeaeae-0000-0000-0000-00000000000a', gen_random_uuid(), 1, 'x', '{}', '{}');
  raise notice 'GAGAL d: tulis langsung diterima';
exception when others then raise notice 'OK d: tulis langsung ditolak'; end $$;
reset role;
