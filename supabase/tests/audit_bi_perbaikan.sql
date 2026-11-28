-- Uji regresi perbaikan audit BI A–J (migrasi 20261128020000). SETIAP kolom = pernyataan angka/aturan yang HARUS benar (t).
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/audit_bi_perbaikan.sql"
-- Lulus = semua kolom t, tidak ada NOTICE "GAGAL". Pada database TANPA migrasi perbaikan, kolom yang ditandai [audit] bernilai f.
\set ON_ERROR_STOP off
-- keluaran consol_report untuk uji JS: -v consol_out=supabase/tests/data/audit_consol.json (bawaan dibuang)
\if :{?consol_out}
\else
\set consol_out /dev/null
\endif
\set O 'f0f0f0f0-0000-0000-0000-000000000001'
\set P 'f0f0f0f0-0000-0000-0000-000000000002'
\set S 'f0f0f0f0-0000-0000-0000-000000000003'
\set A 'f0f0f0f0-0000-0000-0000-00000000000a'
\set B 'f0f0f0f0-0000-0000-0000-00000000000b'
\set D 'f0f0f0f0-0000-0000-0000-00000000000d'
\set E 'f0f0f0f0-0000-0000-0000-00000000000e'
\set F 'f0f0f0f0-0000-0000-0000-00000000000f'
\set G 'f0f0f0f0-0000-0000-0000-000000000010'
\set H 'f0f0f0f0-0000-0000-0000-000000000011'
\set R 'f0f0f0f0-0000-0000-0000-000000000012'
\set L 'f0f0f0f0-0000-0000-0000-000000000013'
select (now() at time zone 'Asia/Jakarta')::date as today, date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date as cm,
       (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) - interval '1 month')::date as lm,
       (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) - interval '2 month')::date as l2,
       (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) - interval '5 month')::date as l5 \gset
insert into auth.users(id,email) values (:'O','audit-own@x.com'), (:'P','audit-pic@x.com'), (:'S','audit-set@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  (:'A','PPh A',:'O','pro',:'today'::date + 30,'active','retail'), (:'B','PPh B',:'O','pro',:'today'::date + 30,'active','retail'),
  (:'D','Dasar D',:'O','dasar',:'today'::date + 30,'active','retail'), (:'E','Toko E',:'O','pro',:'today'::date + 30,'active','retail'),
  (:'F','Toko F',:'O','pro',:'today'::date + 30,'active','retail'), (:'G','Toko G',:'O','pro',:'today'::date + 30,'active','retail'),
  (:'H','Jasa H',:'O','pro',:'today'::date + 30,'active','jasa'), (:'R','Kos R',:'O','pro',:'today'::date + 30,'active','properti'),
  (:'L','Toko L',:'O','pro',:'today'::date + 30,'active','retail') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) select id, :'O', 'pemilik' from kos where id in (:'A',:'B',:'D',:'E',:'F',:'G',:'H',:'R',:'L') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'G',:'P','kasir'), (:'G',:'S','pengelola') on conflict do nothing;
update kos_members set areas = array['settings'] where kos_id = :'G' and user_id = :'S';
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"f0f0f0f0-0000-0000-0000-000000000001","email":"audit-own@x.com"}', false);
\o

\echo == B. PPh: bisnis tutup tetap dihitung untuk bulan yang omzetnya tercatat
-- 2025 (aturan @2022-01, pembebasan OP Rp500 jt): Maret A 400 jt; April A 150 jt + B 100 jt → kena 150 jt → A 90 jt = 450.000, B 60 jt = 300.000
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values
  (:'A','PA1','2025-03-10',400000000,400000000,0,'tunai','selesai'), (:'A','PA2','2025-04-10',150000000,150000000,0,'tunai','selesai'),
  (:'B','PB1','2025-04-12',100000000,100000000,0,'tunai','selesai');
select tax_profile_set(:'A', '{"regime":"pph_final_umkm","wp_type":"op","npwp":"112233445566778","registered_year":2022,"start_month":"2025-01-01"}') is not null b_profil_a,
       tax_profile_set(:'B', '{"regime":"pph_final_umkm","wp_type":"op","npwp":"112233445566778","registered_year":2022,"start_month":"2025-01-01"}') is not null b_profil_b;
select (select (m ->> 'pajak')::numeric = 450000 from jsonb_array_elements(pph_overview(:'A', 2025) -> 'bulan') m where (m ->> 'bulan')::date = '2025-04-01') b_a_april_450000_sebelum_tutup;
-- setoran SEBELUM tutup: B menyetor 300.000
select tax_pay('f0f0f0f0-0000-0000-0000-0000000000b1', :'B', '2025-04-01', 300000, :'today', 'kas', 'NTPN B') is not null b_b_setor;
select (pph_overview(:'B', 2025) ->> 'utang_pph')::numeric = 0 b_b_utang_0_sebelum_tutup;
update kos set closed_at = now() where id = :'B';
select pph_overview(:'A', 2025) as oa \gset
select (select (m ->> 'pajak')::numeric from jsonb_array_elements(:'oa'::jsonb -> 'bulan') m where (m ->> 'bulan')::date = '2025-04-01') = 450000 "b_a_april_tetap_450000_setelah_b_tutup [audit]",
       (select (m ->> 'grup_bruto')::numeric from jsonb_array_elements(:'oa'::jsonb -> 'bulan') m where (m ->> 'bulan')::date = '2025-04-01') = 250000000 "b_omzet_grup_april_250jt [audit]",
       (:'oa'::jsonb ->> 'utang_pph')::numeric = 450000 "b_jurnal_a_utang_450000 [audit]";
-- setoran SESUDAH B tutup: A menyetor 450.000 → utang 0
select tax_pay('f0f0f0f0-0000-0000-0000-0000000000a1', :'A', '2025-04-01', 450000, :'today', 'kas', 'NTPN A') is not null b_a_setor;
select (pph_overview(:'A', 2025) ->> 'utang_pph')::numeric = 0 "b_a_utang_0_setelah_setor [audit]",
       (select (m ->> 'pajak')::numeric from jsonb_array_elements(pph_overview(:'B', 2025) -> 'bulan') m where (m ->> 'bulan')::date = '2025-04-01') = 300000 b_b_tutup_tetap_terbaca_300000;
select (biz_financials(:'B', '2025-04-01', '2025-04-30', null, null) -> 'laba_rugi' -> 'cur' ->> 'pajak')::numeric = 300000 "b_laporan_bisnis_tutup_tetap_terbaca [audit]";
update kos set closed_at = null where id = :'B';

\echo == I. Konsolidasi: neraca bisnis Dasar ditahan, batas 400 hari, pembelian yang dicatat pembeli
insert into contacts(id,kos_id,kind,name) values ('f0f0f0f0-0000-0000-0000-0000000000c1',:'E','pelanggan','Dasar D (sendiri)'),
  ('f0f0f0f0-0000-0000-0000-0000000000c2',:'D','supplier','Toko E (sendiri)') on conflict do nothing;
select contact_link_business('f0f0f0f0-0000-0000-0000-0000000000c1', :'D') is not null i_tautan_e, contact_link_business('f0f0f0f0-0000-0000-0000-0000000000c2', :'E') is not null i_tautan_d;
-- E menjual 100 rb (modal 60 rb) ke D dan 50 rb lagi yang TIDAK dicatat D sebagai pembelian; D mencatat pembelian 100 rb
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status,contact_id) values
  (:'E','IE1',:'cm',100000,100000,60000,'tunai','selesai','f0f0f0f0-0000-0000-0000-0000000000c1'),
  (:'E','IE2',:'cm',50000,50000,30000,'tunai','selesai','f0f0f0f0-0000-0000-0000-0000000000c1');
insert into purchases(kos_id,number,purchase_date,total,pay_method,status,contact_id) values (:'D','ID1',:'cm',100000,'tunai','selesai','f0f0f0f0-0000-0000-0000-0000000000c2');
select consol_group_save(null, 'Grup Audit', '[{"kos_id":"f0f0f0f0-0000-0000-0000-00000000000e","pct":100},{"kos_id":"f0f0f0f0-0000-0000-0000-00000000000d","pct":60}]') ->> 'id' as g \gset
select consol_report(:'g'::uuid, :'cm', :'today') as cr \gset
select (:'cr'::jsonb ->> 'aktif')::boolean i_aktif_karena_ada_pro,
       (select (m -> 'fin' ->> 'neraca_ada')::boolean = false from jsonb_array_elements(:'cr'::jsonb -> 'members') m where m ->> 'kos_id' = :'D') "i_dasar_tanpa_neraca [audit]",
       (select (m -> 'fin' ->> 'neraca_ada')::boolean from jsonb_array_elements(:'cr'::jsonb -> 'members') m where m ->> 'kos_id' = :'E') "i_pro_punya_neraca [audit]",
       (:'cr'::jsonb -> 'auto_sales' -> 0 ->> 'amount')::numeric = 150000 i_jual_antarbisnis_150rb,
       (:'cr'::jsonb -> 'auto_sales' -> 0 ->> 'bought')::numeric = 100000 "i_dicatat_pembeli_100rb [audit]";
do $$ begin perform consol_report((select id from consol_groups where name = 'Grup Audit'), current_date - 500, current_date);
  raise notice 'GAGAL i: periode 500 hari diterima konsolidasi (biz_financials menolak > 400)';
exception when others then raise notice 'OK i: periode 500 hari ditolak (%)', left(sqlerrm, 50); end $$;
select consol_report(:'g'::uuid, :'today'::date - 400, :'today') ->> 'aktif' = 'true' i_400_hari_diterima;
-- data untuk uji JS (node supabase/tests/audit_bi_js.mjs memakai rumus lib/consolidation.js atas keluaran ini)
\t on
\o :consol_out
select consol_report(:'g'::uuid, :'cm', :'today');
\o
\t off

\echo == Analisis Bisnis: tren Paket Dasar tidak melewati batas paket
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values
  (:'D','DD1',:'l2',8000000,8000000,0,'tunai','selesai'), (:'D','DD2',:'lm',1000000,1000000,0,'tunai','selesai');
select biz_intel(:'D', :'lm', (:'cm'::date - 1)) as bi \gset
select not exists (select 1 from jsonb_array_elements(:'bi'::jsonb -> 'tren') t where (t ->> 'mulai')::date < :'lm'::date) "an_tren_dasar_mulai_bulan_lalu [audit]",
       coalesce((select sum((t ->> 'pendapatan')::numeric) from jsonb_array_elements(:'bi'::jsonb -> 'tren') t), 0) = 1000000 "an_tren_tanpa_8jt_bulan_terkunci [audit]";

\echo == Laporan keuangan: riwayat bulanan berhenti di akhir periode
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values
  (:'F','FF1',:'lm',1000000,1000000,0,'tunai','selesai'), (:'F','FF2',:'lm'::date + 4,2000000,2000000,0,'tunai','selesai');
select biz_financials(:'F', :'l2', :'lm', null, null) as bf \gset
select (select (t -> 'v' ->> 'pendapatan_usaha')::numeric from jsonb_array_elements(:'bf'::jsonb -> 'bulanan') t where (t ->> 'mulai')::date = :'lm'::date) = 1000000 "lk_bulan_terakhir_hanya_sampai_tgl_1 [audit]",
       (:'bf'::jsonb -> 'laba_rugi' -> 'cur' ->> 'pendapatan_usaha')::numeric = 1000000 lk_total_periode_1jt;

\echo == A. Pinjaman: jatuh tempo dalam 12 bulan kalender (tahun kabisat)
select loan_save('f0f0f0f0-0000-0000-0000-0000000000d1', :'G', '{"lender":"Bank Audit","principal":10000000,"start_date":"2026-01-02","due_date":"2028-11-28"}') is not null a_simpan;
select loan_move('f0f0f0f0-0000-0000-0000-0000000000d2', :'G', 'f0f0f0f0-0000-0000-0000-0000000000d1', 'pinjaman_masuk', 10000000, 0, '2026-01-02', 'bank', null) is not null a_masuk;
select (loan_current_portion(:'G', '2027-11-28') ->> 'lancar')::numeric = 10000000 "a_28nov2027_jatuh_tempo_28nov2028_lancar [audit]",
       (loan_current_portion(:'G', '2027-11-27') ->> 'lancar')::numeric = 0 a_sehari_lebih_jangka_panjang,
       (loan_current_portion(:'G', '2027-11-27') ->> 'tidak_terjadwal')::numeric = 10000000 a_tanpa_jadwal_dicatat_terpisah;

\echo == D. Anggaran: biaya tetap tidak dikali laju harian
insert into expense_categories(id,kos_id,name,kind) values ('f0f0f0f0-0000-0000-0000-0000000000e1',:'F','Sewa tempat audit','operasional'),
  ('f0f0f0f0-0000-0000-0000-0000000000e2',:'F','Bahan audit','operasional') on conflict do nothing;
select budget_save(:'F', :'cm', 'f0f0f0f0-0000-0000-0000-0000000000e1', 3000000) is not null d_anggaran_sewa,
       budget_save(:'F', :'cm', 'f0f0f0f0-0000-0000-0000-0000000000e2', 1000000) is not null d_anggaran_bahan;
insert into expenses(kos_id,date,category_id,kind,amount,description,account) values
  (:'F',:'cm','f0f0f0f0-0000-0000-0000-0000000000e1','operasional',3000000,'Sewa bulan ini','kas'),
  (:'F',:'cm','f0f0f0f0-0000-0000-0000-0000000000e2','operasional',500000,'Bahan','kas');
select expense_category_fixed_set(:'F', 'f0f0f0f0-0000-0000-0000-0000000000e1', true)::text = '' "d_tandai_biaya_tetap [audit]";
select budget_summary(:'F', :'cm') as bs \gset
select (select (k ->> 'proyeksi')::numeric = 3000000 from jsonb_array_elements(:'bs'::jsonb -> 'kategori') k where k ->> 'nama' = 'Sewa tempat audit') "d_sewa_tetap_proyeksi_3jt [audit]",
       (select (k ->> 'proyeksi')::numeric = round(500000 * (:'bs'::jsonb ->> 'hari')::numeric / (:'bs'::jsonb ->> 'hari_berjalan')::numeric, 2)
          from jsonb_array_elements(:'bs'::jsonb -> 'kategori') k where k ->> 'nama' = 'Bahan audit') d_bahan_tetap_laju_harian,
       (:'bs'::jsonb -> 'biaya' ->> 'proyeksi')::numeric = 3000000 + round(500000 * (:'bs'::jsonb ->> 'hari')::numeric / (:'bs'::jsonb ->> 'hari_berjalan')::numeric, 2) "d_total_proyeksi [audit]",
       (select (k ->> 'tetap')::boolean from jsonb_array_elements(budget_report(:'F', :'cm') -> 'baris') k where k ->> 'nama' = 'Sewa tempat audit') "d_status_tetap_terbaca [audit]";

\echo == E. Skenario: retur mengurangi pendapatan titik awal (model v2)
-- penjualan 5 bulan lalu (di luar jendela 3 bulan), retur 20 rb bulan lalu → pendapatan rata-rata = −20 rb
insert into sales(id,kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values
  ('f0f0f0f0-0000-0000-0000-0000000000f1',:'L','LL1',:'l5',100000,100000,0,'tunai','selesai');
insert into sale_returns(id,kos_id,sale_id,number,return_date,total,cost_total,refund_method,status,reason) values
  ('f0f0f0f0-0000-0000-0000-0000000000f2',:'L','f0f0f0f0-0000-0000-0000-0000000000f1','RL1',:'lm',20000,0,'tunai','selesai','audit');
select scenario_baseline(:'L') as sb \gset
select (:'sb'::jsonb ->> 'pendapatan')::numeric = -20000 "e_retur_tanpa_jual_minus_20rb [audit]", :'sb'::jsonb ->> 'model' = 'v2' "e_model_v2 [audit]";

\echo == F. Risiko: PIC yang aksesnya dicabut tidak bisa memperbarui
select risk_save(:'G', 'f0f0f0f0-0000-0000-0000-0000000000a9', jsonb_build_object('title','Audit PIC','category','operasional','likelihood',3,'impact',3,'owner_user',:'P')) ->> 'id' is not null f_risiko_dengan_pic;
\o /dev/null
select set_config('request.jwt.claim.sub', :'P', false), set_config('request.jwt.claims', '{"sub":"f0f0f0f0-0000-0000-0000-000000000002","email":"audit-pic@x.com"}', false);
\o
select risk_progress(:'G', 'f0f0f0f0-0000-0000-0000-0000000000a9', 'ditangani', 'mulai') ->> 'status' = 'ditangani' f_pic_aktif_boleh;
update kos_members set active = false where kos_id = :'G' and user_id = :'P';
do $$ begin perform risk_progress('f0f0f0f0-0000-0000-0000-000000000010', 'f0f0f0f0-0000-0000-0000-0000000000a9', 'dipantau', 'masih bisa?');
  raise notice 'GAGAL f: PIC yang sudah dinonaktifkan masih bisa memperbarui risiko';
exception when others then raise notice 'OK f: PIC nonaktif ditolak'; end $$;
-- pengelola bagian Pengaturan saja: titik awal keuangan ditolak, sinyal piutang tetap terbaca (saran sebagian, lib/risk.js)
\o /dev/null
select set_config('request.jwt.claim.sub', :'S', false), set_config('request.jwt.claims', '{"sub":"f0f0f0f0-0000-0000-0000-000000000003","email":"audit-set@x.com"}', false);
\o
select (risk_list(:'G') ->> 'manager')::boolean f_pengaturan_saja_pengelola, risk_signals(:'G') ? 'piutang_lewat' f_sinyal_terbaca;
do $$ begin perform scenario_baseline('f0f0f0f0-0000-0000-0000-000000000010');
  raise notice 'INFO f: titik awal keuangan terbuka untuk pengaturan saja';
exception when others then raise notice 'OK f: titik awal keuangan ditolak untuk pengaturan saja (saran dari sinyal saja)'; end $$;
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"f0f0f0f0-0000-0000-0000-000000000001","email":"audit-own@x.com"}', false);
\o

\echo == G. Valuasi: presisi kelipatan
do $$ begin perform valuation_save('f0f0f0f0-0000-0000-0000-000000000010', null, 'Kecil', '{"multiple":{"basis":"pendapatan","low":0.001,"mid":0.002,"high":0.003,"source":"Uji presisi audit"}}', null);
  raise notice 'GAGAL g: kelipatan 0,001 diterima (tersimpan 0,00)';
exception when others then raise notice 'OK g: kelipatan 0,001 ditolak (%)', left(sqlerrm, 60); end $$;
do $$ begin perform valuation_save('f0f0f0f0-0000-0000-0000-000000000010', null, 'Tiga desimal', '{"multiple":{"basis":"pendapatan","low":1.234,"mid":2,"high":3,"source":"Uji presisi audit"}}', null);
  raise notice 'GAGAL g: kelipatan 1,234 diterima';
exception when others then raise notice 'OK g: kelipatan 3 desimal ditolak'; end $$;
select valuation_save(:'G', null, 'Dua desimal', '{"multiple":{"basis":"pendapatan","low":0.01,"mid":1.25,"high":3.5,"source":"Uji presisi audit"}}', null) ->> 'id' as vid \gset
select (assumptions -> 'multiple' ->> 'low')::numeric = 0.01 and (assumptions -> 'multiple' ->> 'mid')::numeric = 1.25 g_001_dan_125_tersimpan_utuh from valuations where id = :'vid';

\echo == H. Laporan investor: batas periode sama untuk simpan & pratinjau
do $$ begin perform investor_report_save('f0f0f0f0-0000-0000-0000-000000000010', null, jsonb_build_object('title','Terlalu panjang','period_from', current_date - 500, 'period_to', current_date));
  raise notice 'GAGAL h: draf 500 hari tersimpan (pratinjau pasti gagal)';
exception when others then raise notice 'OK h: draf 500 hari ditolak (%)', left(sqlerrm, 50); end $$;
select investor_report_save(:'G', 'f0f0f0f0-0000-0000-0000-0000000000b9', jsonb_build_object('title','Setahun','period_from', :'today'::date - 400, 'period_to', :'today')) ->> 'id' is not null h_400_hari_tersimpan;
select investor_report_get(:'G', 'f0f0f0f0-0000-0000-0000-0000000000b9') -> 'data' -> 'keuangan' is not null h_pratinjau_400_hari_jalan;
do $$ begin perform investor_report_save('f0f0f0f0-0000-0000-0000-000000000010', 'f0f0f0f0-0000-0000-0000-0000000000b9', jsonb_build_object('title','Pembanding panjang','period_from', current_date - 30, 'period_to', current_date, 'cmp_from', current_date - 600, 'cmp_to', current_date - 31));
  raise notice 'GAGAL h: pembanding 569 hari diterima';
exception when others then raise notice 'OK h: pembanding > 400 hari ditolak'; end $$;

\echo == J. KPI industri: hari-kamar unik & himpunan pesanan yang sama
insert into rooms(id,kos_id,code,rent) values ('f0f0f0f0-0000-0000-0000-0000000000c9',:'R','K1',1000000);
insert into occupants(id,kos_id,name) values ('f0f0f0f0-0000-0000-0000-0000000000d8',:'R','Lama'), ('f0f0f0f0-0000-0000-0000-0000000000d9',:'R','Baru');
-- penghuni lama keluar 10 Okt 2025, penghuni baru masuk 10 Okt 2025 di kamar yang sama (hari serah terima terhitung di dua sewa)
insert into leases(id,kos_id,room_id,occupant_id,start_date,end_date,rent,billing_start,status) values
  ('f0f0f0f0-0000-0000-0000-0000000000e8',:'R','f0f0f0f0-0000-0000-0000-0000000000c9','f0f0f0f0-0000-0000-0000-0000000000d8','2025-01-01','2025-10-10',1000000,'2025-01-01','selesai'),
  ('f0f0f0f0-0000-0000-0000-0000000000e9',:'R','f0f0f0f0-0000-0000-0000-0000000000c9','f0f0f0f0-0000-0000-0000-0000000000d9','2025-10-10',null,1000000,'2025-10-10','aktif');
select (industry_kpi(:'R', '2025-10-10', '2025-10-10', null, null) -> 'cur' ->> 'kamar_hari')::int = 1 "j_satu_kamar_satu_hari_bukan_200pct [audit]",
       (industry_kpi(:'R', '2025-10-01', '2025-10-31', null, null) -> 'cur' ->> 'kamar_hari')::int = 31 "j_oktober_31_hari_kamar [audit]";
insert into svc_orders(id,kos_id,number,customer_name,received_at,status,total,completed_at,completed_date,pickup,deliver) values
  ('f0f0f0f0-0000-0000-0000-0000000000a7',:'H','HJ1','Bu Audit','2025-10-02 01:00+00','selesai',30000,'2025-10-03 01:00+00','2025-10-03',true,true);
insert into svc_orders(id,kos_id,number,customer_name,received_at,status,total,completed_at,completed_date,pickup,deliver,rework_of) values
  ('f0f0f0f0-0000-0000-0000-0000000000a8',:'H','HJ2','Bu Audit','2025-10-04 01:00+00','selesai',0,'2025-10-05 01:00+00','2025-10-05',true,true,'f0f0f0f0-0000-0000-0000-0000000000a7');
select industry_kpi(:'H', '2025-10-01', '2025-10-31', null, null) -> 'cur' as kj \gset
select (:'kj'::jsonb ->> 'pesanan')::int = 1 j_pesanan_1, (:'kj'::jsonb ->> 'antar_jemput')::int = 1 "j_antar_jemput_1_bukan_200pct [audit]";
