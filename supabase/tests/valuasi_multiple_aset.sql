-- Uji Tahap G: dasar valuasi dari jurnal, simpan berversi, validasi kelipatan & sumber, akses & paket.
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/valuasi_multiple_aset.sql"
-- Lulus = semua kolom t / angka sesuai nama kolom, NOTICE diawali OK. Rumus: node supabase/tests/valuasi_js.mjs
\set ON_ERROR_STOP off
\set K 'dadadada-0000-0000-0000-00000000000a'
\set D 'dadadada-0000-0000-0000-00000000000d'
\set O 'dadadada-0000-0000-0000-000000000001'
\set X 'dadadada-0000-0000-0000-000000000003'
insert into auth.users(id,email) values (:'O','val@x.com'), (:'X','val-kasir@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  (:'K','Toko Valuasi',:'O','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'D','Toko Dasar Val',:'O','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'K',:'O','pemilik'), (:'K',:'X','kasir'), (:'D',:'O','pemilik') on conflict do nothing;
select date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date as cm \gset
select (:'cm'::date - interval '6 months')::date as m6, (:'cm'::date - interval '1 months')::date as m1 \gset
-- 6 bulan data: modal 100 jt, penjualan 10 jt/bln (HPP 6 jt), biaya 1 jt/bln → laba 3 jt/bln; bulan ini (tidak dihitung) penjualan 50 jt
insert into cash_entries(kos_id,date,kind,amount,account,description) values (:'K',:'m6','setoran_modal',100000000,'kas','Modal');
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status)
  select :'K', 'V' || i, (:'m6'::date + (i || ' months')::interval)::date + 3, 10000000, 10000000, 6000000, 'tunai', 'selesai' from generate_series(0, 5) i;
insert into expenses(kos_id,date,amount,description,kind,account)
  select :'K', (:'m6'::date + (i || ' months')::interval)::date + 5, 1000000, 'Operasional', 'operasional', 'kas' from generate_series(0, 5) i;
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values (:'K','VX',:'cm',50000000,50000000,0,'tunai','selesai');
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"dadadada-0000-0000-0000-000000000001","email":"val@x.com"}', false);
\o

\echo == A. Dasar perhitungan
select valuation_basis(:'K') as b \gset
select (:'b'::jsonb ->> 'aktif')::boolean a_aktif, (:'b'::jsonb ->> 'bulan_data')::int a_6_bulan,
       (:'b'::jsonb -> 'laba_rugi' ->> 'pendapatan_usaha')::numeric a_pendapatan_60jt, (:'b'::jsonb -> 'laba_rugi' ->> 'hpp')::numeric a_hpp_36jt,
       (:'b'::jsonb -> 'laba_rugi' ->> 'beban_operasional')::numeric a_biaya_6jt;
-- neraca hari ini termasuk penjualan bulan ini; laba ditahan = akumulasi s.d. hari ini (18 jt + 50 jt)
select (:'b'::jsonb -> 'neraca' ->> 'kas')::numeric a_kas_204jt, (:'b'::jsonb ->> 'laba_ditahan')::numeric a_laba_ditahan_68jt,
       jsonb_typeof(:'b'::jsonb -> 'aset_tetap') = 'array' a_daftar_aset;
\echo == B. Simpan berversi & validasi
select valuation_save(:'K', null, 'Tawaran Pak Joko', '{"multiple":{"basis":"laba_bersih","low":2,"mid":3,"high":4,"source":"Penawaran tertulis calon pembeli, 10 Nov 2026","source_date":"2026-11-10"},"aset":{"inv_pct":80,"ar_pct":90,"assets":[],"other_adj":0}}', 'awal') as s1 \gset
select (:'s1'::jsonb ->> 'version')::int b_versi_1;
select assumptions -> 'multiple' ->> 'source' like 'Penawaran%' b_sumber_tersimpan, (basis ->> 'bulan_data')::int b_salinan_dasar_6 from valuations where id = (:'s1'::jsonb ->> 'id')::uuid;
select (valuation_save(:'K', (:'s1'::jsonb ->> 'group_id')::uuid, 'Tawaran Pak Joko', '{"multiple":{"basis":"ebitda","low":1.5,"mid":2.5,"high":3,"source":"Konsultan UMKM setempat"}}', 'ganti dasar') ->> 'version')::int b_versi_2;
select jsonb_array_length(valuation_list(:'K') -> 0 -> 'versions') b_dua_versi;
do $$ begin update valuations set note = 'x' where kos_id = 'dadadada-0000-0000-0000-00000000000a';
  raise notice 'GAGAL b: versi lama bisa diubah';
exception when others then raise notice 'OK b: versi lama tidak bisa diubah'; end $$;
do $$ begin perform valuation_save('dadadada-0000-0000-0000-00000000000a', null, 'X', '{"multiple":{"basis":"laba_bersih","low":2,"mid":3,"high":4,"source":""}}', null);
  raise notice 'GAGAL b: kelipatan tanpa sumber diterima';
exception when others then raise notice 'OK b: sumber wajib (%)', left(sqlerrm, 30); end $$;
do $$ begin perform valuation_save('dadadada-0000-0000-0000-00000000000a', null, 'X', '{"multiple":{"basis":"laba_bersih","low":5,"mid":3,"high":4,"source":"Konsultan"}}', null);
  raise notice 'GAGAL b: urutan kelipatan salah diterima';
exception when others then raise notice 'OK b: bawah ≤ tengah ≤ atas'; end $$;
do $$ begin perform valuation_save('dadadada-0000-0000-0000-00000000000a', null, 'X', '{"aset":{"inv_pct":150}}', null);
  raise notice 'GAGAL b: persen persediaan 150 diterima';
exception when others then raise notice 'OK b: persen 0–100'; end $$;
do $$ begin perform valuation_save('dadadada-0000-0000-0000-00000000000a', null, 'X', '{}', null);
  raise notice 'GAGAL b: valuasi kosong diterima';
exception when others then raise notice 'OK b: valuasi kosong ditolak'; end $$;
select count(*) = 2 b_riwayat from config_history where kos_id = :'K' and action = 'simpan_valuasi';
\echo == C. Paket & akses
select (valuation_basis(:'D') ->> 'aktif')::boolean = false c_dasar_tidak_aktif;
do $$ begin perform valuation_save('dadadada-0000-0000-0000-00000000000d', null, 'X', '{"aset":{}}', null);
  raise notice 'GAGAL c: Paket Dasar bisa menyimpan';
exception when others then raise notice 'OK c: Paket Dasar ditolak'; end $$;
\o /dev/null
select set_config('request.jwt.claim.sub', :'X', false), set_config('request.jwt.claims', '{"sub":"dadadada-0000-0000-0000-000000000003"}', false);
\o
do $$ begin perform valuation_basis('dadadada-0000-0000-0000-00000000000a');
  raise notice 'GAGAL c: kasir bisa membaca';
exception when others then raise notice 'OK c: kasir ditolak'; end $$;
set role authenticated;
select count(*) = 0 c_kasir_tidak_melihat_baris from valuations where kos_id = :'K';
reset role;
