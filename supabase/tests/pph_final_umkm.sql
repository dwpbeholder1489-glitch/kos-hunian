-- Uji PPh final UMKM 0,5% (Tahap B). Database baru dengan semua migrasi:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/pph_final_umkm.sql"
-- Skenario (tahun berjalan): pemilik OP punya Toko A & Toko B dengan NPWP sama.
--   Maret: A 400 jt (kumulatif 400 → belum kena). April: A 150 jt + B 100 jt → grup 250 jt, kumulatif 650 jt → kena 150 jt,
--   dibagi sebanding omzet: A 90 jt → PPh 450.000; B 60 jt → PPh 300.000. Toko C (PT) Maret 100 jt → 500.000 (tanpa pembebasan).
\set ON_ERROR_STOP off
\set A 'acacacac-0000-0000-0000-00000000000a'
\set B 'acacacac-0000-0000-0000-00000000000b'
\set C 'acacacac-0000-0000-0000-00000000000c'
\set Q 'acacacac-0000-0000-0000-00000000000d'
insert into auth.users(id,email) values ('acacacac-0000-0000-0000-000000000001','pph@x.com'), ('acacacac-0000-0000-0000-000000000009','luar4@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  (:'A','Toko A','acacacac-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'B','Toko B','acacacac-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'C','Toko C','acacacac-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'Q','Kos Q','acacacac-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','properti') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) select id,'acacacac-0000-0000-0000-000000000001','pemilik' from kos where id in (:'A',:'B',:'C',:'Q') on conflict do nothing;
select extract(year from (now() at time zone 'Asia/Jakarta'))::int as y \gset
select make_date(:y,3,10) as mar, make_date(:y,4,10) as apr, make_date(:y,1,1) as jan, make_date(:y,4,1) as apr1, make_date(:y,3,1) as mar1 \gset
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values
  (:'A','A-1',:'mar',400000000,400000000,0,'tunai','selesai'), (:'A','A-2',:'apr',150000000,150000000,0,'tunai','selesai'),
  (:'B','B-1',:'apr',100000000,100000000,0,'tunai','selesai'), (:'C','C-1',:'mar',100000000,100000000,0,'tunai','selesai');
select set_config('request.jwt.claim.sub', 'acacacac-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"acacacac-0000-0000-0000-000000000001"}', false) \g /dev/null

\echo == A. Profil & perhitungan (batas Rp500 jt digabung untuk NPWP sama)
select tax_profile_set(:'A', jsonb_build_object('regime','pph_final_umkm','wp_type','op','npwp','12.345.678.9-012.345','registered_year',2022,'start_month',:'jan')) ->> 'npwp' a_npwp_dinormalkan;
select tax_profile_set(:'B', jsonb_build_object('regime','pph_final_umkm','wp_type','op','npwp','123456789012345','registered_year',2022,'start_month',:'jan')) is not null a_b;
select tax_profile_set(:'C', jsonb_build_object('regime','pph_final_umkm','wp_type','pt','npwp','999999999999999','registered_year',2024,'start_month',:'jan')) is not null a_c;
select pph_overview(:'A') as oa \gset
select (select (m ->> 'pajak')::numeric from jsonb_array_elements(:'oa'::jsonb -> 'bulan') m where (m ->> 'bulan')::date = :'mar1') a_maret_0,
       (select (m ->> 'pajak')::numeric from jsonb_array_elements(:'oa'::jsonb -> 'bulan') m where (m ->> 'bulan')::date = :'apr1') a_april_450000,
       (select (m ->> 'kena')::numeric from jsonb_array_elements(:'oa'::jsonb -> 'bulan') m where (m ->> 'bulan')::date = :'apr1') a_kena_90jt,
       jsonb_array_length(:'oa'::jsonb -> 'grup') a_grup_1_lain;
select (select (m ->> 'pajak')::numeric from jsonb_array_elements(pph_overview(:'B') -> 'bulan') m where (m ->> 'bulan')::date = :'apr1') a_b_april_300000,
       (select (m ->> 'pajak')::numeric from jsonb_array_elements(pph_overview(:'C') -> 'bulan') m where (m ->> 'bulan')::date = :'mar1') a_c_pt_500000;
\echo == B. Jurnal akrual & setoran lewat Kas
select (pph_overview(:'A') ->> 'utang_pph')::numeric b_utang_450000, (pph_overview(:'A') ->> 'beban_tahun_ini')::numeric b_beban_450000;
select tax_pay('acacacac-0000-0000-0000-0000000000e1', :'A', :'apr1', 450000, (now() at time zone 'Asia/Jakarta')::date, 'kas', 'NTPN 123') is not null b_setor;
select (pph_overview(:'A') ->> 'utang_pph')::numeric b_utang_0,
       (select (m ->> 'disetor')::numeric from jsonb_array_elements(pph_overview(:'A') -> 'bulan') m where (m ->> 'bulan')::date = :'apr1') b_disetor_450000;
select biz_financials(:'A', :'jan', (now() at time zone 'Asia/Jakarta')::date) as f \gset
select :'f'::jsonb -> 'laba_rugi' -> 'cur' ->> 'pajak' b_kelas_pajak_450000, (:'f'::jsonb -> 'neraca' ->> 'seimbang')::boolean b_seimbang,
       (acct_cashflow(:'A', :'jan', (now() at time zone 'Asia/Jakarta')::date) ->> 'cocok')::boolean b_arus_kas_cocok,
       (select sum(amount) from cash_entries where kos_id = :'A' and kind = 'bayar_pajak') b_kas_keluar_450000;
-- saldo kas versi menu Kas (cash_book_until) ikut berkurang
select (cash_book_until(:'A', (now() at time zone 'Asia/Jakarta')::date, null) ->> 'keluar')::numeric b_kas_harian_keluar_450000;
\echo == C. Aturan berversi: bulan 2021 memakai PP 23/2018 (tanpa pembebasan Rp500 jt)
update tax_profiles set start_month = '2021-12-01' where kos_id = :'C';
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values (:'C','C-0','2021-12-05',100000000,100000000,0,'tunai','selesai');
select pph_overview(:'C', 2021) as oc \gset
select :'oc'::jsonb -> 'bulan' -> 0 ->> 'aturan' c_aturan_2018, :'oc'::jsonb -> 'bulan' -> 0 ->> 'pajak' c_pajak_500000;
\echo == D. Validasi & akses
do $$ begin perform tax_profile_set('acacacac-0000-0000-0000-00000000000d', jsonb_build_object('regime','pph_final_umkm','wp_type','op','start_month','2026-01-01'));
  raise notice 'GAGAL d: kos tanpa konfirmasi sewa diterima';
exception when others then raise notice 'OK d: kos wajib konfirmasi PPh sewa (%)', left(sqlerrm, 40); end $$;
select tax_profile_set(:'Q', jsonb_build_object('regime','pph_final_umkm','wp_type','op','start_month',:'jan','rent_ack',true)) ->> 'regime' d_kos_dengan_konfirmasi;
do $$ begin perform tax_profile_set('acacacac-0000-0000-0000-00000000000a', jsonb_build_object('regime','pph_final_umkm','wp_type','op','npwp','123','start_month','2026-01-01'));
  raise notice 'GAGAL d: NPWP pendek diterima';
exception when others then raise notice 'OK d: NPWP tidak valid ditolak'; end $$;
select count(*) > 0 d_tercatat_di_riwayat from config_history where kos_id = :'A' and action = 'ubah_profil_pajak';
select set_config('request.jwt.claim.sub', 'acacacac-0000-0000-0000-000000000009', false), set_config('request.jwt.claims', '{"sub":"acacacac-0000-0000-0000-000000000009"}', false) \g /dev/null
do $$ begin perform pph_overview('acacacac-0000-0000-0000-00000000000a'); raise notice 'GAGAL d: orang luar membaca';
exception when others then raise notice 'OK d: orang luar ditolak'; end $$;
do $$ begin perform tax_pay(gen_random_uuid(), 'acacacac-0000-0000-0000-00000000000a', '2026-01-01', 1, current_date, 'kas', null); raise notice 'GAGAL d: orang luar setor';
exception when others then raise notice 'OK d: orang luar tidak bisa setor'; end $$;
