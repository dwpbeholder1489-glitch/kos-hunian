-- Uji Tahap D: target pendapatan, persetujuan anggaran, proyeksi akhir bulan.
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/anggaran_target_persetujuan.sql"
-- Lulus = semua kolom bernilai t / angka sesuai nama kolom, semua NOTICE diawali OK (tanpa GAGAL).
\set ON_ERROR_STOP off
\set K 'adadadad-0000-0000-0000-00000000000a'
\set D 'adadadad-0000-0000-0000-00000000000d'
\set O 'adadadad-0000-0000-0000-000000000001'
\set M 'adadadad-0000-0000-0000-000000000002'
\set X 'adadadad-0000-0000-0000-000000000003'
insert into auth.users(id,email) values (:'O','own@x.com'), (:'M','kelola@x.com'), (:'X','kasir@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  (:'K','Toko Anggaran',:'O','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  (:'D','Toko Dasar',:'O','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'K',:'O','pemilik'), (:'K',:'M','pengelola'), (:'K',:'X','kasir'), (:'D',:'O','pemilik') on conflict do nothing;
insert into expense_categories(id,kos_id,name,kind) values ('adadadad-0000-0000-0000-0000000000c1',:'K','Listrik','operasional'), ('adadadad-0000-0000-0000-0000000000c2',:'K','Iklan','operasional') on conflict do nothing;
-- Bulan lalu (sudah lewat penuh): pendapatan 10 jt, biaya listrik 1,2 jt (anggaran 1 jt) + iklan 300rb (tanpa anggaran)
select date_trunc('month', (now() at time zone 'Asia/Jakarta')::date - interval '1 month')::date as lm,
       date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date as cm,
       date_trunc('month', (now() at time zone 'Asia/Jakarta')::date + interval '1 month')::date as nm \gset
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values (:'K','S-1',:'lm'::date + 4,10000000,10000000,0,'tunai','selesai');
insert into expenses(kos_id,date,category_id,amount,description) values (:'K',:'lm'::date + 5,'adadadad-0000-0000-0000-0000000000c1',1200000,'PLN'),
  (:'K',:'lm'::date + 6,'adadadad-0000-0000-0000-0000000000c2',300000,'IG');
\o /dev/null
select set_config('request.jwt.claim.sub', :'M', false), set_config('request.jwt.claims', '{"sub":"adadadad-0000-0000-0000-000000000002","email":"kelola@x.com"}', false);
\o

\echo == A. Pengelola keuangan menyusun & mengajukan
select budget_save(:'K', :'lm', 'adadadad-0000-0000-0000-0000000000c1', 1000000)::text = '' a_simpan_biaya;
select budget_target_save(:'K', :'lm', 12000000, 'Target lebaran')::text = '' a_simpan_target;
select status = 'draf' a_status_draf, revenue_target = 12000000 a_target from budget_plans where kos_id = :'K' and month = :'lm';
select budget_submit(:'K', :'lm', 'Mohon dicek')::text = '' a_ajukan;
select status = 'diajukan' a_diajukan, submitted_by = 'kelola@x.com' a_oleh from budget_plans where kos_id = :'K' and month = :'lm';
do $$ begin perform budget_decide('adadadad-0000-0000-0000-00000000000a', date_trunc('month', (now() at time zone 'Asia/Jakarta')::date - interval '1 month')::date, 'setujui', null);
  raise notice 'GAGAL a: pengelola bisa menyetujui sendiri';
exception when others then raise notice 'OK a: pengelola tidak bisa menyetujui (%)', left(sqlerrm, 50); end $$;
do $$ begin perform budget_submit('adadadad-0000-0000-0000-00000000000a', date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date, null);
  raise notice 'GAGAL a: anggaran kosong bisa diajukan';
exception when others then raise notice 'OK a: anggaran kosong ditolak'; end $$;

\echo == B. Pemilik menolak (alasan wajib), revisi, lalu menyetujui
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"adadadad-0000-0000-0000-000000000001","email":"own@x.com"}', false);
\o
do $$ begin perform budget_decide('adadadad-0000-0000-0000-00000000000a', date_trunc('month', (now() at time zone 'Asia/Jakarta')::date - interval '1 month')::date, 'tolak', '');
  raise notice 'GAGAL b: tolak tanpa alasan diterima';
exception when others then raise notice 'OK b: tolak wajib alasan'; end $$;
select budget_decide(:'K', :'lm', 'tolak', 'Listrik terlalu kecil')::text = '' b_tolak;
select status = 'ditolak' b_ditolak, decision_note = 'Listrik terlalu kecil' b_alasan from budget_plans where kos_id = :'K' and month = :'lm';
-- revisi oleh pengelola: status kembali draf, revisi naik
\o /dev/null
select set_config('request.jwt.claim.sub', :'M', false), set_config('request.jwt.claims', '{"sub":"adadadad-0000-0000-0000-000000000002","email":"kelola@x.com"}', false);
\o
select budget_save(:'K', :'lm', 'adadadad-0000-0000-0000-0000000000c1', 1500000)::text = '' b_revisi;
select status = 'draf' b_kembali_draf, revision = 1 b_revisi_1, log -> -1 ->> 'ev' = 'revisi' b_log_revisi from budget_plans where kos_id = :'K' and month = :'lm';
select budget_submit(:'K', :'lm', null)::text = '' b_ajukan_lagi;
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"adadadad-0000-0000-0000-000000000001","email":"own@x.com"}', false);
\o
select budget_decide(:'K', :'lm', 'setujui', 'Oke')::text = '' b_setujui;
select status = 'disetujui' b_disetujui, decided_by = 'own@x.com' b_oleh_pemilik from budget_plans where kos_id = :'K' and month = :'lm';
select count(*) = 2 b_riwayat_keputusan from config_history where kos_id = :'K' and action in ('setujui_anggaran', 'tolak_anggaran');
-- mengubah anggaran yang disetujui = revisi, status kembali draf (tidak diam-diam tetap "disetujui")
select budget_target_save(:'K', :'lm', 11000000, 'Target lebaran')::text = '' b_ubah_setelah_setuju;
select status = 'draf' b_setuju_jadi_draf, revision = 2 b_revisi_2 from budget_plans where kos_id = :'K' and month = :'lm';
-- simpan ulang nilai sama tidak membuat revisi
select budget_target_save(:'K', :'lm', 11000000, 'Target lebaran')::text = '' b_sama;
select revision = 2 b_tetap_2 from budget_plans where kos_id = :'K' and month = :'lm';
-- pemilik boleh langsung menyetujui draf
select budget_decide(:'K', :'lm', 'setujui', null)::text = '' b_setujui_draf;

\echo == C. Ringkasan: realisasi dari jurnal & pengeluaran, bulan lalu = final
select budget_summary(:'K', :'lm') as s \gset
select (:'s'::jsonb -> 'pendapatan' ->> 'target')::numeric c_target_11jt, (:'s'::jsonb -> 'pendapatan' ->> 'realisasi')::numeric c_pendapatan_10jt,
       (:'s'::jsonb -> 'pendapatan' ->> 'proyeksi')::numeric c_proyeksi_sama_10jt, (:'s'::jsonb ->> 'final')::boolean c_final,
       (:'s'::jsonb -> 'biaya' ->> 'anggaran')::numeric c_anggaran_1_5jt, (:'s'::jsonb -> 'biaya' ->> 'realisasi')::numeric c_real_dianggarkan_1_2jt,
       (:'s'::jsonb -> 'biaya' ->> 'di_luar_anggaran')::numeric c_luar_300rb, (:'s'::jsonb -> 'biaya' ->> 'total')::numeric c_total_1_5jt,
       :'s'::jsonb -> 'rencana' ->> 'status' c_status, (:'s'::jsonb ->> 'boleh_putuskan')::boolean c_pemilik_boleh;
-- pendapatan sama dengan Laporan Keuangan (biz_financials pendapatan_usaha)
select (biz_financials(:'K', :'lm', (:'nm'::date - 1)) -> 'laba_rugi' -> 'cur' ->> 'pendapatan_usaha')::numeric = (:'s'::jsonb -> 'pendapatan' ->> 'realisasi')::numeric c_sama_laporan;
-- bulan depan: belum mulai → proyeksi null
select budget_summary(:'K', :'nm') -> 'pendapatan' ->> 'proyeksi' is null c_bulan_depan_tanpa_proyeksi;
-- bulan berjalan: proyeksi = realisasi × hari / hari berjalan (≥ realisasi)
insert into sales(kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values (:'K','S-2',(now() at time zone 'Asia/Jakarta')::date,3000000,3000000,0,'tunai','selesai');
select budget_summary(:'K', :'cm') as c \gset
select (:'c'::jsonb -> 'pendapatan' ->> 'proyeksi')::numeric = round(3000000 * (:'c'::jsonb ->> 'hari')::numeric / (:'c'::jsonb ->> 'hari_berjalan')::numeric, 2) c_proyeksi_laju,
       (:'c'::jsonb ->> 'final')::boolean = false c_belum_final;

\echo == D. Tutup buku mengunci, paket & akses
insert into acct_periods(kos_id, month, closed_at, closed_by) values (:'K', :'lm', now(), 'own@x.com');
do $$ begin perform budget_save('adadadad-0000-0000-0000-00000000000a', date_trunc('month', (now() at time zone 'Asia/Jakarta')::date - interval '1 month')::date, 'adadadad-0000-0000-0000-0000000000c1', 2000000);
  raise notice 'GAGAL d: bulan tutup buku masih bisa diubah';
exception when others then raise notice 'OK d: bulan tutup buku terkunci (%)', left(sqlerrm, 40); end $$;
do $$ begin perform budget_copy('adadadad-0000-0000-0000-00000000000a', date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date, date_trunc('month', (now() at time zone 'Asia/Jakarta')::date - interval '1 month')::date);
  raise notice 'GAGAL d: salin ke bulan tutup buku diterima';
exception when others then raise notice 'OK d: salin ke bulan tutup buku ditolak'; end $$;
select (budget_summary(:'K', :'lm') ->> 'terkunci')::boolean d_terkunci;
-- salin ke bulan berjalan tetap boleh & membuat rencana draf
select budget_copy(:'K', :'lm', :'cm') = 1 d_salin_ok;
select status = 'draf' d_salinan_draf from budget_plans where kos_id = :'K' and month = :'cm';
do $$ begin perform budget_target_save('adadadad-0000-0000-0000-00000000000d', date_trunc('month', now())::date, 5000000, null);
  raise notice 'GAGAL d: Paket Dasar bisa membuat target';
exception when others then raise notice 'OK d: Paket Dasar ditolak (%)', left(sqlerrm, 30); end $$;
\o /dev/null
select set_config('request.jwt.claim.sub', :'X', false), set_config('request.jwt.claims', '{"sub":"adadadad-0000-0000-0000-000000000003"}', false);
\o
do $$ begin perform budget_summary('adadadad-0000-0000-0000-00000000000a', date_trunc('month', now())::date);
  raise notice 'GAGAL d: kasir bisa membaca anggaran';
exception when others then raise notice 'OK d: kasir tidak bisa membaca anggaran'; end $$;
set role authenticated;
do $$ begin insert into budget_plans(kos_id, month) values ('adadadad-0000-0000-0000-00000000000a', '2020-01-01');
  raise notice 'GAGAL d: tulis langsung ke tabel diterima';
exception when others then raise notice 'OK d: tulis langsung ditolak'; end $$;
select count(*) = 0 d_kasir_tidak_melihat_baris from budget_plans where kos_id = :'K';
reset role;
