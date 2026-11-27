-- Uji pinjaman & beban bunga (Tahap A). Database baru dengan semua migrasi:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/pinjaman_bunga.sql"
-- Lulus = kolom bernilai t / angka sesuai namanya, NOTICE berawalan OK.
\set ON_ERROR_STOP off
\set K 'abababab-0000-0000-0000-00000000000f'
\set L 'abababab-0000-0000-0000-0000000000a1'
\set L2 'abababab-0000-0000-0000-0000000000a2'
insert into auth.users(id,email) values ('abababab-0000-0000-0000-000000000001','pj@x.com'), ('abababab-0000-0000-0000-000000000009','luar3@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values (:'K','Toko Pinjam','abababab-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'K','abababab-0000-0000-0000-000000000001','pemilik') on conflict do nothing;
select (now() at time zone 'Asia/Jakarta')::date as today, date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date as m0 \gset
select set_config('request.jwt.claim.sub', 'abababab-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"abababab-0000-0000-0000-000000000001"}', false) \g /dev/null

\echo == A. Pinjaman diterima & dibayar (pokok + bunga) → jurnal
select loan_save(:'L', :'K', jsonb_build_object('lender', 'Bank BRI', 'principal', 10000000, 'rate_year', 12, 'start_date', :'m0', 'term_months', 12, 'installment', 888488)) = :'L' a_simpan;
select loan_move('abababab-0000-0000-0000-0000000000c1', :'K', :'L', 'pinjaman_masuk', 10000000, 0, :'m0', 'bank', null) is not null a_masuk;
select loan_move('abababab-0000-0000-0000-0000000000c2', :'K', :'L', 'bayar_pinjaman', 1000000, 200000, :'today', 'kas', 'Cicilan 1') is not null a_bayar;
select loan_move('abababab-0000-0000-0000-0000000000c2', :'K', :'L', 'bayar_pinjaman', 1000000, 200000, :'today', 'kas', 'Cicilan 1') = 'abababab-0000-0000-0000-0000000000c2' a_idempoten,
       (select count(*) from cash_entries where kos_id = :'K') a_dua_catatan;
select loan_overview(:'K') as o \gset
select :'o'::jsonb -> 'loans' -> 0 ->> 'balance' a_sisa_9200000, :'o'::jsonb -> 'loans' -> 0 ->> 'paid_interest' a_bunga_200000,
       (:'o'::jsonb ->> 'akun_pinjaman')::numeric = (:'o'::jsonb -> 'loans' -> 0 ->> 'balance')::numeric a_sama_dengan_jurnal;
select biz_financials(:'K', :'m0', :'today') as f \gset
select :'f'::jsonb -> 'laba_rugi' -> 'cur' ->> 'bunga' a_beban_bunga_200000, (:'f'::jsonb -> 'neraca' ->> 'seimbang')::boolean a_seimbang,
       :'f'::jsonb -> 'neraca' -> 'close' ->> 'pinjaman' a_pinjaman_9200000,
       (:'f'::jsonb -> 'neraca' -> 'pinjaman_close' ->> 'lancar')::numeric between 9000000 and 9200000 a_porsi_lancar_anuitas,
       (acct_cashflow(:'K', :'m0', :'today') ->> 'cocok')::boolean a_arus_kas_cocok;
-- bunga masuk aktivitas operasi, pokok masuk pendanaan
select (select (g ->> 'keluar')::numeric from jsonb_array_elements(acct_cashflow(:'K', :'m0', :'today') -> 'kelompok') g where g ->> 'kelompok' = 'operasi') a_operasi_keluar_200000,
       (select (g ->> 'bersih')::numeric from jsonb_array_elements(acct_cashflow(:'K', :'m0', :'today') -> 'kelompok') g where g ->> 'kelompok' = 'pendanaan') a_pendanaan_9200000;

\echo == B. Validasi
do $$ begin perform loan_move(gen_random_uuid(), 'abababab-0000-0000-0000-00000000000f', 'abababab-0000-0000-0000-0000000000a1', 'bayar_pinjaman', 20000000, 0, (now() at time zone 'Asia/Jakarta')::date, 'kas', null);
  raise notice 'GAGAL b: pokok melebihi sisa diterima';
exception when others then raise notice 'OK b: pokok melebihi sisa ditolak'; end $$;
do $$ begin perform loan_move(gen_random_uuid(), 'abababab-0000-0000-0000-00000000000f', 'abababab-0000-0000-0000-0000000000a1', 'pinjaman_masuk', 1000, 10, (now() at time zone 'Asia/Jakarta')::date, 'kas', null);
  raise notice 'GAGAL b: bunga pada pinjaman masuk diterima';
exception when others then raise notice 'OK b: bunga pada pinjaman masuk ditolak'; end $$;
do $$ begin perform loan_move(gen_random_uuid(), 'abababab-0000-0000-0000-00000000000f', 'abababab-0000-0000-0000-0000000000a1', 'bayar_pinjaman', 1000, 0, (now() at time zone 'Asia/Jakarta')::date + 3, 'kas', null);
  raise notice 'GAGAL b: tanggal masa depan diterima';
exception when others then raise notice 'OK b: tanggal masa depan ditolak'; end $$;
do $$ begin perform loan_cancel('abababab-0000-0000-0000-00000000000f', 'abababab-0000-0000-0000-0000000000a1');
  raise notice 'GAGAL b: batal pinjaman bercatatan diterima';
exception when others then raise notice 'OK b: pinjaman bercatatan tidak bisa dibatalkan'; end $$;

\echo == C. Catatan lama (tanpa daftar & bunga) tetap sama; bisa ditautkan; jatuh tempo ≤ 12 bulan = lancar penuh
insert into cash_entries(id,kos_id,kind,date,amount,account,description) values
  ('abababab-0000-0000-0000-0000000000c3', :'K', 'pinjaman_masuk', :'m0', 3000000, 'kas', 'Pinjaman saudara');
select loan_overview(:'K') -> 'unlinked' -> 0 ->> 'amount' c_belum_tertaut_3000000;
select loan_save(:'L2', :'K', jsonb_build_object('lender', 'Saudara', 'principal', 3000000, 'start_date', :'m0', 'due_date', (:'today'::date + 90)::text)) = :'L2' c_simpan2;
select loan_link(:'K', 'abababab-0000-0000-0000-0000000000c3', :'L2') \g /dev/null
select (select loan_id from cash_entries where id = 'abababab-0000-0000-0000-0000000000c3') = :'L2' c_tautkan;
select (loan_overview(:'K') -> 'porsi' ->> 'lancar')::numeric > 9000000 + 3000000 - 1 c_porsi_termasuk_jatuh_tempo,
       jsonb_array_length(loan_overview(:'K') -> 'unlinked') = 0 c_semua_tertaut;
select (select count(*) from acct_lines l join acct_entries e on e.id = l.entry_id where e.source_type = 'cash_entry' and e.source_id = 'abababab-0000-0000-0000-0000000000c3') c_jurnal_lama_2_baris;

\echo -- status mengikuti catatan: lunas lalu catatan dihapus → aktif lagi
select loan_move('abababab-0000-0000-0000-0000000000c4', :'K', :'L2', 'bayar_pinjaman', 3000000, 0, :'today', 'kas', null) is not null c_lunasi;
select status c_lunas from loans where id = :'L2';
delete from cash_entries where id = 'abababab-0000-0000-0000-0000000000c4';
select status c_aktif_lagi from loans where id = :'L2';

\echo == D. Akses
select set_config('request.jwt.claim.sub', 'abababab-0000-0000-0000-000000000009', false), set_config('request.jwt.claims', '{"sub":"abababab-0000-0000-0000-000000000009"}', false) \g /dev/null
do $$ begin perform loan_overview('abababab-0000-0000-0000-00000000000f'); raise notice 'GAGAL d: orang luar bisa membaca';
exception when others then raise notice 'OK d: orang luar ditolak'; end $$;
set role authenticated;
select count(*) = 0 d_rls_daftar_kosong from loans where kos_id = 'abababab-0000-0000-0000-00000000000f';
reset role;
