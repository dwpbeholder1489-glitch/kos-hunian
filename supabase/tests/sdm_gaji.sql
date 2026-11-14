-- Uji SDM: karyawan, jadwal, absensi (pengelola & absen sendiri), kasbon, penggajian, slip, pembukuan.
-- Jalankan di database baru: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/sdm_gaji.sql"
-- Lulus = semua kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('d7d7d7d7-0000-0000-0000-000000000001','sdm@x.com'), ('d7d7d7d7-0000-0000-0000-000000000002','rina@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('d7d7d7d7-0000-0000-0000-00000000000a','Toko SDM','d7d7d7d7-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('d7d7d7d7-0000-0000-0000-00000000000a','d7d7d7d7-0000-0000-0000-000000000001','pemilik'),
  ('d7d7d7d7-0000-0000-0000-00000000000a','d7d7d7d7-0000-0000-0000-000000000002','kasir');
\set K 'd7d7d7d7-0000-0000-0000-00000000000a'
set role authenticated;
select set_config('request.jwt.claim.sub', 'd7d7d7d7-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"d7d7d7d7-0000-0000-0000-000000000001","email":"sdm@x.com"}', false) \g /dev/null
select module_on(:'K', 'u_sdm') a0_modul;

\echo == A. Karyawan: Rina (bulanan 2.000.000 + tunjangan 300.000, lembur 15.000/jam, punya akun), Budi (harian 100.000, tanpa akun)
select staff_save(:'K', null, jsonb_build_object('name', 'Rina', 'position', 'Kasir', 'pay_type', 'bulanan', 'base_pay', 2000000, 'allowance', 300000, 'overtime_rate', 15000,
  'member_user_id', 'd7d7d7d7-0000-0000-0000-000000000002', 'join_date', date_trunc('month', current_date)::date - 60)) as rina \gset
select staff_save(:'K', null, jsonb_build_object('name', 'Budi', 'position', 'Gudang', 'pay_type', 'harian', 'base_pay', 100000)) as budi \gset
select count(*) = 2 a_dua_karyawan from staff where kos_id = :'K';

\echo == B. Jadwal & absensi oleh pengelola
select shift_plan_set(:'K', jsonb_build_object('staff_ids', jsonb_build_array(:'rina'), 'dates', jsonb_build_array(current_date), 'start', '08:00', 'end', '16:00', 'label', 'Pagi')) = 1 b_jadwal;
select attendance_set(:'K', jsonb_build_object('staff_id', :'budi', 'date', date_trunc('month', current_date)::date, 'status', 'hadir', 'in', '08:00', 'out', '18:00')) ->> 'hours' b_jam_budi;
select (attendance_set(:'K', jsonb_build_object('staff_id', :'budi', 'date', date_trunc('month', current_date)::date + 1, 'status', 'hadir')) ->> 'hours')::numeric = 8 b_hadir_tanpa_jam;
select attendance_set(:'K', jsonb_build_object('staff_id', :'budi', 'date', date_trunc('month', current_date)::date + 2, 'status', 'alpa')) ->> 'status' b_alpa;

\echo == C. Absen sendiri (Rina, kasir) — tanpa melihat data gaji
select set_config('request.jwt.claim.sub', 'd7d7d7d7-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"d7d7d7d7-0000-0000-0000-000000000002","email":"rina@x.com"}', false) \g /dev/null
select (staff_me(:'K') ->> 'linked')::boolean c_tertaut;
select (attendance_clock(:'K', 'masuk', null) -> 'today' ->> 'clock_in') is not null c_absen_masuk;
do $$ declare m text; begin
  begin perform attendance_clock('d7d7d7d7-0000-0000-0000-00000000000a', 'masuk', null); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Sudah absen masuk%' then raise exception 'C_GAGAL dobel: %', m; end if; raise notice 'c_OK: absen masuk dua kali ditolak';
end $$;
select count(*) = 0 c_tidak_bisa_lihat_gaji from staff;
do $$ declare m text; begin
  begin perform payroll_draft('d7d7d7d7-0000-0000-0000-00000000000a', current_date); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik%' then raise exception 'C_GAGAL akses: %', m; end if; raise notice 'c_OK: kasir tidak bisa menghitung gaji';
end $$;
-- pulang 10 jam kemudian (disimulasikan oleh pemilik mengubah jam)
select set_config('request.jwt.claim.sub', 'd7d7d7d7-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"d7d7d7d7-0000-0000-0000-000000000001","email":"sdm@x.com"}', false) \g /dev/null
select attendance_set(:'K', jsonb_build_object('staff_id', :'rina', 'date', current_date, 'status', 'hadir', 'in', '08:00', 'out', '18:00')) ->> 'overtime' = '2.00' c_lembur_dari_jadwal;

\echo == D. Kasbon karyawan → pengeluaran "Gaji karyawan"
select staff_advance_add(:'K', :'budi', 50000, 'kas', null, 'beli obat') as adv \gset
select staff_advance_balance(:'budi') = 50000 d_saldo_kasbon;
select (select name from expense_categories c join expenses e on e.category_id = c.id where e.id = (select expense_id from staff_advances where id = :'adv')) = 'Gaji karyawan' d_kategori;

\echo == E. Draf gaji bulan ini: Rina bulanan penuh + lembur 2 jam; Budi harian 2 hari − kasbon
select payroll_draft(:'K', current_date) as run \gset
select base = 2000000 and allowance = 300000 and overtime = 30000 and net = 2330000 e_rina from payroll_lines where run_id = :'run' and staff_id = :'rina';
select base = 200000 and days_present = 2 and days_absent = 1 and advance_deduction = 50000 and net = 150000 e_budi from payroll_lines where run_id = :'run' and staff_id = :'budi';
select id as lrina from payroll_lines where run_id = :'run' and staff_id = :'rina' \gset
select (payroll_line_set(:'lrina', jsonb_build_object('bonus', 100000, 'deduction', 20000, 'note', 'bonus target')) ->> 'net')::numeric = 2410000 e_ubah_bonus;
select payroll_draft(:'K', current_date) = :'run' e_hitung_ulang_sama;
select bonus = 100000 and net = 2410000 e_bonus_dipertahankan from payroll_lines where id = :'lrina';

\echo == F. Bayar gaji → pengeluaran = total dibayar; kasbon lunas; tidak bisa dihapus dari menu Pengeluaran
select (payroll_pay(:'run', 'bank', null) ->> 'total')::numeric = 2560000 f_total;
select staff_advance_balance(:'budi') = 0 f_kasbon_lunas;
reset role;
select (select sum(amount) from expenses where kos_id = :'K') = 2610000 f_total_beban_kotor_minus_potongan;
select acct_sync_internal(:'K') \g /dev/null
select (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 f_jurnal_seimbang;
set role authenticated;
select set_config('t.exp', (select expense_id::text from payroll_runs where id = :'run'), false) \g /dev/null
do $$ declare m text; begin
  begin delete from expenses where id = current_setting('t.exp')::uuid; exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like '%SDM & gaji%' then raise exception 'F_GAGAL hapus: %', m; end if; raise notice 'f_OK: pengeluaran gaji tidak bisa dihapus dari Pengeluaran';
end $$;

\echo == G. Slip: Rina melihat slipnya sendiri; batal gaji membuka kembali kasbon
select set_config('request.jwt.claim.sub', 'd7d7d7d7-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"d7d7d7d7-0000-0000-0000-000000000002","email":"rina@x.com"}', false) \g /dev/null
select (payroll_slip(:'run', :'rina') -> 'line' ->> 'net')::numeric = 2410000 g_slip_sendiri;
select set_config('t.run', :'run', false), set_config('t.budi', :'budi', false) \g /dev/null
do $$ declare m text; begin
  begin perform payroll_slip(current_setting('t.run')::uuid, current_setting('t.budi')::uuid); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Slip tidak ditemukan%' then raise exception 'G_GAGAL slip orang lain: %', m; end if; raise notice 'g_OK: slip orang lain tidak bisa dibuka';
end $$;
select set_config('request.jwt.claim.sub', 'd7d7d7d7-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"d7d7d7d7-0000-0000-0000-000000000001","email":"sdm@x.com"}', false) \g /dev/null
select payroll_void(:'run', 'salah hitung lembur') \g /dev/null
select staff_advance_balance(:'budi') = 50000 g_kasbon_terbuka_lagi;
reset role;
select (select sum(amount) from expenses where kos_id = :'K') = 50000 g_pengeluaran_gaji_dihapus;
set role authenticated;
select jsonb_array_length(attendance_summary(:'K', date_trunc('month', current_date)::date, current_date)) = 2 g_ringkasan;
