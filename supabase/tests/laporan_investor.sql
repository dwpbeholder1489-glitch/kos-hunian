-- Uji Tahap H: laporan investor (susun, ajukan, tolak, final = angka dibekukan, revisi, arsip, paket & akses).
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/laporan_investor.sql"
-- Lulus = semua kolom t / angka sesuai nama kolom, NOTICE diawali OK. Susunan dokumen: node supabase/tests/laporan_investor_js.mjs
\set ON_ERROR_STOP off
\set K 'ebebebeb-0000-0000-0000-00000000000a'
\set B 'ebebebeb-0000-0000-0000-00000000000b'
\set O 'ebebebeb-0000-0000-0000-000000000001'
\set M 'ebebebeb-0000-0000-0000-000000000002'
\set X 'ebebebeb-0000-0000-0000-000000000003'
insert into auth.users(id,email) values (:'O','inv-own@x.com'), (:'M','inv-kel@x.com'), (:'X','inv-kasir@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  (:'K','Toko Investor',:'O','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'B','Toko Bisnis Inv',:'O','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'K',:'O','pemilik'), (:'K',:'M','pengelola'), (:'K',:'X','kasir'), (:'B',:'O','pemilik') on conflict do nothing;
select date_trunc('month', (now() at time zone 'Asia/Jakarta')::date - interval '1 month')::date as lm, (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) - interval '1 day')::date as le \gset
insert into cash_entries(kos_id,date,kind,amount,account,description) values (:'K',:'lm','setoran_modal',20000000,'kas','Modal');
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values (:'K','I1',:'lm'::date + 2,10000000,10000000,6000000,'tunai','selesai');
\o /dev/null
select set_config('request.jwt.claim.sub', :'M', false), set_config('request.jwt.claims', '{"sub":"ebebebeb-0000-0000-0000-000000000002","email":"inv-kel@x.com"}', false);
\o

\echo == A. Pengelola keuangan menyusun & mengajukan
select investor_report_save(:'K', 'ebebebeb-0000-0000-0000-0000000000e1', jsonb_build_object('title','Laporan Investor Bulan Lalu','period_from',:'lm','period_to',:'le',
  'sections', jsonb_build_object('ringkasan','Penjualan stabil.','mdna','Margin 40%.'), 'include', jsonb_build_object('valuasi', false))) as r1 \gset
select :'r1'::jsonb ->> 'number' like 'LIN-%-001' a_nomor, :'r1'::jsonb ->> 'status' a_draf, (:'r1'::jsonb -> 'include' ->> 'valuasi')::boolean = false a_valuasi_dimatikan,
       (:'r1'::jsonb -> 'include' ->> 'keuangan')::boolean a_keuangan_bawaan_ya;
select investor_report_get(:'K', 'ebebebeb-0000-0000-0000-0000000000e1') as g \gset
select (:'g'::jsonb ->> 'beku')::boolean = false a_pratinjau_tidak_beku, (:'g'::jsonb -> 'data' -> 'keuangan' -> 'laba_rugi' -> 'cur' ->> 'pendapatan_usaha')::numeric a_pendapatan_10jt,
       (:'g'::jsonb ->> 'boleh_final')::boolean = false a_pengelola_tidak_boleh_final, :'g'::jsonb -> 'data' -> 'bisnis' ->> 'nama' a_nama_bisnis;
select investor_report_submit(:'K', 'ebebebeb-0000-0000-0000-0000000000e1', 'Mohon dicek') ->> 'status' a_diajukan;
do $$ begin perform investor_report_decide('ebebebeb-0000-0000-0000-00000000000a', 'ebebebeb-0000-0000-0000-0000000000e1', 'final', null);
  raise notice 'GAGAL a: pengelola bisa memfinalkan';
exception when others then raise notice 'OK a: pengelola tidak bisa memfinalkan'; end $$;

\echo == B. Pemilik menolak, revisi, lalu memfinalkan
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"ebebebeb-0000-0000-0000-000000000001","email":"inv-own@x.com"}', false);
\o
do $$ begin perform investor_report_decide('ebebebeb-0000-0000-0000-00000000000a', 'ebebebeb-0000-0000-0000-0000000000e1', 'tolak', '');
  raise notice 'GAGAL b: tolak tanpa alasan';
exception when others then raise notice 'OK b: tolak wajib alasan'; end $$;
select investor_report_decide(:'K', 'ebebebeb-0000-0000-0000-0000000000e1', 'tolak', 'Tambah prospek') ->> 'status' b_ditolak;
select investor_report_save(:'K', 'ebebebeb-0000-0000-0000-0000000000e1', jsonb_build_object('title','Laporan Investor Bulan Lalu','period_from',:'lm','period_to',:'le',
  'sections', jsonb_build_object('ringkasan','Penjualan stabil.','mdna','Margin 40%.','prospek','Buka cabang.'))) ->> 'status' b_kembali_draf;
select investor_report_decide(:'K', 'ebebebeb-0000-0000-0000-0000000000e1', 'final', 'OK kirim') ->> 'status' b_final;
select snapshot is not null b_snapshot_ada, (snapshot -> 'keuangan' -> 'laba_rugi' -> 'cur' ->> 'pendapatan_usaha')::numeric b_beku_10jt, finalized_by = 'inv-own@x.com' b_oleh
  from investor_reports where id = 'ebebebeb-0000-0000-0000-0000000000e1';
select count(*) = 1 b_riwayat from config_history where kos_id = :'K' and action = 'final_laporan_investor';
-- transaksi baru di periode yang sama TIDAK mengubah laporan final
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values (:'K','I2',:'lm'::date + 5,5000000,5000000,0,'tunai','selesai');
select (investor_report_get(:'K', 'ebebebeb-0000-0000-0000-0000000000e1') -> 'data' -> 'keuangan' -> 'laba_rugi' -> 'cur' ->> 'pendapatan_usaha')::numeric b_final_tetap_10jt;
do $$ begin perform investor_report_save('ebebebeb-0000-0000-0000-00000000000a', 'ebebebeb-0000-0000-0000-0000000000e1', '{"title":"Ubah","period_from":"2026-01-01","period_to":"2026-01-31"}');
  raise notice 'GAGAL b: laporan final bisa diubah';
exception when others then raise notice 'OK b: laporan final terkunci'; end $$;
do $$ begin perform investor_report_delete('ebebebeb-0000-0000-0000-00000000000a', 'ebebebeb-0000-0000-0000-0000000000e1');
  raise notice 'GAGAL b: laporan final bisa dihapus';
exception when others then raise notice 'OK b: laporan final tidak bisa dihapus'; end $$;
select investor_report_revise(:'K', 'ebebebeb-0000-0000-0000-0000000000e1') as rv \gset
select :'rv'::jsonb ->> 'status' b_revisi_draf, :'rv'::jsonb ->> 'revision_of' = 'ebebebeb-0000-0000-0000-0000000000e1' b_tertaut,
       (investor_report_get(:'K', (:'rv'::jsonb ->> 'id')::uuid) -> 'data' -> 'keuangan' -> 'laba_rugi' -> 'cur' ->> 'pendapatan_usaha')::numeric b_revisi_data_terkini_15jt;
select investor_report_delete(:'K', (:'rv'::jsonb ->> 'id')::uuid)::text = '' b_hapus_draf;
select jsonb_array_length(investor_report_list(:'K') -> 'reports') b_tersisa_1;

\echo == C. Validasi, paket & akses
do $$ begin perform investor_report_save('ebebebeb-0000-0000-0000-00000000000a', null, '{"title":"Lama","period_from":"2023-01-01","period_to":"2026-01-31"}');
  raise notice 'GAGAL c: periode > 2 tahun diterima';
exception when others then raise notice 'OK c: periode maks. 2 tahun'; end $$;
do $$ begin perform investor_report_save('ebebebeb-0000-0000-0000-00000000000a', null, '{"title":"Skn","period_from":"2026-01-01","period_to":"2026-01-31","scenario_id":"ebebebeb-0000-0000-0000-0000000000ff"}');
  raise notice 'GAGAL c: skenario asing diterima';
exception when others then raise notice 'OK c: skenario harus milik bisnis ini'; end $$;
do $$ begin perform investor_report_save('ebebebeb-0000-0000-0000-00000000000b', null, '{"title":"Bisnis","period_from":"2026-01-01","period_to":"2026-01-31"}');
  raise notice 'GAGAL c: Paket Bisnis bisa membuat';
exception when others then raise notice 'OK c: Paket Bisnis ditolak (%)', left(sqlerrm, 30); end $$;
select (investor_report_list(:'B') ->> 'aktif')::boolean = false c_bisnis_tidak_aktif;
\o /dev/null
select set_config('request.jwt.claim.sub', :'X', false), set_config('request.jwt.claims', '{"sub":"ebebebeb-0000-0000-0000-000000000003"}', false);
\o
do $$ begin perform investor_report_list('ebebebeb-0000-0000-0000-00000000000a');
  raise notice 'GAGAL c: kasir bisa membaca';
exception when others then raise notice 'OK c: kasir ditolak'; end $$;
set role authenticated;
do $$ begin perform count(*) from investor_reports;
  raise notice 'GAGAL c: tabel terbaca langsung';
exception when others then raise notice 'OK c: tabel tidak terbaca langsung'; end $$;
reset role;
