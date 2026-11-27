-- Uji Tahap C: laporan perubahan ekuitas (biz_financials.neraca.ekuitas_mutasi).
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/perubahan_ekuitas.sql"
-- Lulus = semua kolom t / angka sesuai nama kolom. Susunan laporan: node supabase/tests/perubahan_ekuitas_js.mjs
\set ON_ERROR_STOP off
\set K 'afafafaf-0000-0000-0000-00000000000a'
\set D 'afafafaf-0000-0000-0000-00000000000d'
\set O 'afafafaf-0000-0000-0000-000000000001'
insert into auth.users(id,email) values (:'O','ekuitas@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  (:'K','Toko Ekuitas',:'O','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'D','Toko Dasar Ekuitas',:'O','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'K',:'O','pemilik'), (:'D',:'O','pemilik') on conflict do nothing;
select date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date as cm, (now() at time zone 'Asia/Jakarta')::date as today \gset
select (:'cm'::date - interval '2 months')::date as pm \gset
-- Sebelum periode: setoran modal 50 jt, laba lama (penjualan 8 jt, modal barang 5 jt → laba 3 jt)
insert into cash_entries(kos_id,date,kind,amount,account,description) values (:'K',:'pm'::date + 1,'setoran_modal',50000000,'kas','Modal awal');
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values (:'K','E0',:'pm'::date + 2,8000000,8000000,5000000,'tunai','selesai');
-- Dalam periode (bulan ini): setoran 10 jt, prive 3 jt, penjualan 20 jt (HPP 12 jt), biaya 2 jt → laba 6 jt
insert into cash_entries(kos_id,date,kind,amount,account,description) values (:'K',:'cm','setoran_modal',10000000,'kas','Tambah modal'), (:'K',:'cm','prive',3000000,'kas','Ambil pribadi');
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values (:'K','E1',:'cm',20000000,20000000,12000000,'tunai','selesai');
insert into expenses(kos_id,date,amount,description,kind,account) values (:'K',:'cm',2000000,'Listrik','operasional','kas');
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"afafafaf-0000-0000-0000-000000000001","email":"ekuitas@x.com"}', false);
\o

\echo == A. Mutasi per akun ekuitas
select biz_financials(:'K', :'cm', :'today', null, null) as f \gset
select (select (a ->> 'open')::numeric from jsonb_array_elements(:'f'::jsonb -> 'neraca' -> 'ekuitas_mutasi') a where a ->> 'sys_key' = 'modal') a_modal_awal_50jt,
       (select (a ->> 'tambah')::numeric from jsonb_array_elements(:'f'::jsonb -> 'neraca' -> 'ekuitas_mutasi') a where a ->> 'sys_key' = 'modal') a_setoran_10jt,
       (select (a ->> 'close')::numeric from jsonb_array_elements(:'f'::jsonb -> 'neraca' -> 'ekuitas_mutasi') a where a ->> 'sys_key' = 'modal') a_modal_akhir_60jt,
       (select (a ->> 'kurang')::numeric from jsonb_array_elements(:'f'::jsonb -> 'neraca' -> 'ekuitas_mutasi') a where a ->> 'sys_key' = 'prive') a_prive_3jt;
\echo == B. Cocok dengan neraca & laba rugi
select (:'f'::jsonb -> 'neraca' -> 'open' ->> 'laba_ditahan')::numeric b_laba_ditahan_awal_3jt,
       (:'f'::jsonb -> 'neraca' -> 'close' ->> 'laba_ditahan')::numeric - (:'f'::jsonb -> 'neraca' -> 'open' ->> 'laba_ditahan')::numeric b_laba_periode_6jt,
       (select sum((a ->> 'close')::numeric) from jsonb_array_elements(:'f'::jsonb -> 'neraca' -> 'ekuitas_mutasi') a) = (:'f'::jsonb -> 'neraca' -> 'close' ->> 'ekuitas')::numeric b_akun_sama_neraca,
       (select sum((a ->> 'open')::numeric) from jsonb_array_elements(:'f'::jsonb -> 'neraca' -> 'ekuitas_mutasi') a) = coalesce((:'f'::jsonb -> 'neraca' -> 'open' ->> 'ekuitas')::numeric, 0) b_awal_sama_neraca,
       (:'f'::jsonb -> 'neraca' ->> 'seimbang')::boolean b_seimbang;
-- total ekuitas akhir = aset − kewajiban: 50 + 10 − 3 + 3 + 6 = 66 jt (kas 66 jt, tanpa kewajiban)
select (:'f'::jsonb -> 'neraca' -> 'close' ->> 'ekuitas')::numeric + (:'f'::jsonb -> 'neraca' -> 'close' ->> 'laba_ditahan')::numeric b_ekuitas_akhir_66jt;
\echo == C. Tanpa laporan_lanjutan tidak ada neraca/mutasi
insert into cash_entries(kos_id,date,kind,amount,account,description) values (:'D',:'cm','setoran_modal',1000000,'kas','x');
select coalesce(jsonb_typeof(biz_financials(:'D', :'cm', :'today', null, null) -> 'neraca'), 'null') = 'null' c_dasar_tanpa_neraca;
