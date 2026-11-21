-- Uji Fase 7 Kinerja pengalaman (migrasi 20261121160000). Database baru:
-- /var/tmp/pgtest/runtest.sh <db> supabase/tests/kinerja_pengalaman.sql
-- Lulus = semua kolom bernilai t, tanpa baris "_GAGAL"/ERROR.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values
  ('d1d1d1d1-0000-0000-0000-000000000001','pemilik@x.com'), ('d1d1d1d1-0000-0000-0000-000000000002','kasir@x.com'),
  ('d1d1d1d1-0000-0000-0000-000000000004','lain@x.com'), ('d1d1d1d1-0000-0000-0000-000000000009','super-kp@x.com') on conflict do nothing;
insert into admin_staff(email, role, active) values ('super-kp@x.com','super_admin',true) on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('d1d1d1d1-0000-0000-0000-00000000000a','Toko Kinerja','d1d1d1d1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','retail'),
  ('d1d1d1d1-0000-0000-0000-00000000000b','Toko Lain','d1d1d1d1-0000-0000-0000-000000000004','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','retail'),
  ('d1d1d1d1-0000-0000-0000-00000000000c','Toko Draf','d1d1d1d1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'draft','retail');
insert into kos_members(kos_id,user_id,role) values
  ('d1d1d1d1-0000-0000-0000-00000000000a','d1d1d1d1-0000-0000-0000-000000000001','pemilik'),
  ('d1d1d1d1-0000-0000-0000-00000000000b','d1d1d1d1-0000-0000-0000-000000000004','pemilik'),
  ('d1d1d1d1-0000-0000-0000-00000000000c','d1d1d1d1-0000-0000-0000-000000000001','pemilik'),
  ('d1d1d1d1-0000-0000-0000-00000000000a','d1d1d1d1-0000-0000-0000-000000000002','kasir');

\set PM 'd1d1d1d1-0000-0000-0000-000000000001'
\set KS 'd1d1d1d1-0000-0000-0000-000000000002'
\set LN 'd1d1d1d1-0000-0000-0000-000000000004'
\set SU 'd1d1d1d1-0000-0000-0000-000000000009'
\set A  'd1d1d1d1-0000-0000-0000-00000000000a'
\set B  'd1d1d1d1-0000-0000-0000-00000000000b'
\set C  'd1d1d1d1-0000-0000-0000-00000000000c'

set role authenticated;

\echo == A. Mencatat: pemilik & kasir; isian tidak sah diabaikan
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select exp_track(:'A', '[{"k":"menu","key":"/kasir","n":3},{"k":"menu","key":"/barang"},{"k":"aksi","key":"pos","n":2},
  {"k":"menu","key":"/kasir?tab=x"},{"k":"menu","key":"javascript:alert(1)"},{"k":"lain","key":"/kasir"},{"k":"aksi","key":"A B"},{"k":"menu","key":"/kasir","n":999}]'::jsonb) = 4 a_empat_sah;
select set_config('request.jwt.claim.sub', :'KS', false) \g /dev/null
select exp_track(:'A', '[{"k":"menu","key":"/kasir"},{"k":"aksi","key":"pos"},{"k":"menu","key":"/catatan/proyek"}]'::jsonb) = 3 a_kasir_tercatat;
select (exp_usage_mine(:'A') -> 'aksi' ->> 'pos')::int = 1 a_milik_sendiri_saja,
       (exp_usage_mine(:'A') -> 'menu' ->> '/kasir')::int = 1 a_menu_sendiri;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select (exp_usage_mine(:'A') -> 'aksi' ->> 'pos')::int = 2 a_pemilik_aksi,
       (exp_usage_mine(:'A') -> 'menu' ->> '/kasir')::int = 23 a_pemilik_menu_dibatasi_20_per_kirim;

\echo == B. Orang luar, bisnis draf, & tanpa login: 0 dan tidak galat
select set_config('request.jwt.claim.sub', :'LN', false) \g /dev/null
select exp_track(:'A', '[{"k":"menu","key":"/kasir"}]'::jsonb) = 0 b_orang_luar_0,
       (exp_usage_mine(:'A') ->> 'aksi') = '{}' b_orang_luar_kosong;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select exp_track(:'C', '[{"k":"menu","key":"/kasir"}]'::jsonb) = 0 b_draf_ditelan;
select exp_track(:'A', 'null'::jsonb) = 0 b_bukan_array, exp_track(:'A', '"x"'::jsonb) = 0 b_teks;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select exp_track(:'A', '[{"k":"menu","key":"/kasir"}]'::jsonb) = 0 b_tanpa_login;

\echo == C. Tabel tertutup untuk klien
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
do $$ begin
  begin perform 1 from exp_usage; raise notice 'C_GAGAL: klien bisa membaca tabel';
  exception when insufficient_privilege then raise notice 'c_OK: tabel tertutup'; end;
  begin insert into exp_usage(kos_id, user_id, day, kind, key) values ('d1d1d1d1-0000-0000-0000-00000000000a', 'd1d1d1d1-0000-0000-0000-000000000001', current_date, 'menu', '/x'); raise notice 'C_GAGAL: klien bisa menulis';
  exception when insufficient_privilege then raise notice 'c_OK: tulis langsung ditolak'; end;
end $$;

\echo == D. Batas 300 jenis kunci per orang per hari
select exp_track(:'A', (select jsonb_agg(jsonb_build_object('k', 'aksi', 'key', 'uji' || g)) from generate_series(1, 50) g)) = 50 d_lima_puluh;
do $$ declare i int; begin
  for i in 1..6 loop perform exp_track('d1d1d1d1-0000-0000-0000-00000000000a', (select jsonb_agg(jsonb_build_object('k', 'aksi', 'key', 'b' || i || '_' || g)) from generate_series(1, 50) g)); end loop;
end $$;
reset role;
select (select count(*) from exp_usage where kos_id = :'A' and user_id = :'PM' and day = (now() at time zone 'Asia/Jakarta')::date) = 300 d_batas_300;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
set role authenticated;
select exp_track(:'A', '[{"k":"aksi","key":"pos"}]'::jsonb) = 1 d_kunci_lama_tetap_bisa;

\echo == E. Laporan kinerja (pemilik): menu, aksi, modul, orang — tanpa rincian per orang
reset role;
-- riwayat 10 hari lalu (modul Belanja dipakai dulu) & 100 hari lalu (di luar 90 hari)
insert into exp_usage(kos_id, user_id, day, kind, key, n) values
  (:'A', :'PM', (now() at time zone 'Asia/Jakarta')::date - 10, 'menu', '/belanja', 4),
  (:'A', :'PM', (now() at time zone 'Asia/Jakarta')::date - 100, 'menu', '/promo', 9);
-- rekomendasi diterima 5 hari lalu, modulnya dipakai sesudahnya
insert into feature_recommendations(kos_id, module_code, status, reason, context_hash, decided_at, created_at)
values (:'A', 'r_belanja', 'activated', 'Uji', 'h1', now() - interval '12 days', now() - interval '13 days'),
       (:'A', 'r_promo', 'rejected', 'Uji', 'h2', now() - interval '2 days', now() - interval '3 days');
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select exp_performance(:'A', 30) as p \gset
select (:'p'::jsonb ->> 'days')::int = 30 e_periode,
       (:'p'::jsonb -> 'people' ->> 'aktif')::int = 2 e_dua_orang_aktif,
       (:'p'::jsonb -> 'people' ->> 'anggota')::int = 2 e_anggota,
       (select (m ->> 'n')::int from jsonb_array_elements(:'p'::jsonb -> 'menus') m where m ->> 'path' = '/kasir') = 24 e_menu_kasir_24,
       (select (m ->> 'users')::int from jsonb_array_elements(:'p'::jsonb -> 'menus') m where m ->> 'path' = '/kasir') = 2 e_menu_kasir_2_orang,
       (select (a ->> 'n')::int from jsonb_array_elements(:'p'::jsonb -> 'aksi') a where a ->> 'id' = 'pos') = 4 e_aksi_pos,
       not (:'p'::text like '%d1d1d1d1-0000-0000-0000-00000000000%') e_tanpa_id_pengguna,
       not (:'p'::text like '%kasir@x.com%') e_tanpa_email;
select (select (m ->> 'n')::int from jsonb_array_elements(:'p'::jsonb -> 'modules') m where m ->> 'code' = 'r_kasir') = 24 e_modul_kasir,
       (select (m ->> 'n')::int from jsonb_array_elements(:'p'::jsonb -> 'modules') m where m ->> 'code' = 'r_belanja') = 4 e_modul_belanja,
       (select (m ->> 'last') is not null from jsonb_array_elements(:'p'::jsonb -> 'modules') m where m ->> 'code' = 'r_belanja') e_terakhir_dipakai,
       (:'p'::jsonb -> 'recos' ->> 'taken')::int = 1 e_reko_diambil,
       (:'p'::jsonb -> 'recos' ->> 'adopted')::int = 1 e_reko_dipakai_sesudahnya,
       (:'p'::jsonb -> 'recos' ->> 'decided')::int = 2 e_reko_diputuskan,
       (:'p'::jsonb ->> 'since')::date = (now() at time zone 'Asia/Jakarta')::date - 100 e_sejak;
select (select count(*) from jsonb_array_elements(exp_performance(:'A', 7) -> 'menus') m where m ->> 'path' = '/belanja') = 0 e_7hari_tanpa_belanja,
       (exp_performance(:'A', 5) ->> 'days')::int = 30 e_periode_asing_jadi_30;
select (select (m ->> 'idle')::boolean from jsonb_array_elements(:'p'::jsonb -> 'modules') m where m ->> 'code' = 'r_kontak') is not false e_modul_tidak_dipakai_ditandai;

\echo == F. Izin: kasir & orang luar ditolak; bisnis lain tidak bocor
select set_config('request.jwt.claim.sub', :'KS', false) \g /dev/null
do $$ declare m text; begin
  begin perform exp_performance('d1d1d1d1-0000-0000-0000-00000000000a', 30); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Khusus pemilik%' then raise exception 'F_GAGAL kasir: %', m; end if;
  raise notice 'f_OK: kasir ditolak';
end $$;
select set_config('request.jwt.claim.sub', :'LN', false) \g /dev/null
do $$ declare m text; begin
  begin perform exp_performance('d1d1d1d1-0000-0000-0000-00000000000a', 30); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Khusus pemilik%' then raise exception 'F_GAGAL orang luar: %', m; end if;
  raise notice 'f_OK: orang luar ditolak';
end $$;
select (exp_performance(:'B', 30) -> 'total' ->> 'menu')::int = 0 f_bisnis_lain_kosong;

\echo == G. Super Admin: angka agregat saja; pemilik bisnis tidak boleh
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
do $$ declare m text; begin
  begin perform admin_experience_overview(); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tidak punya izin%' then raise exception 'G_GAGAL pemilik melihat ringkasan platform: %', m; end if;
  raise notice 'g_OK: pemilik bisnis bukan staf platform';
end $$;
select set_config('request.jwt.claim.sub', :'SU', false) \g /dev/null
select admin_experience_overview() as ad \gset
select (:'ad'::jsonb ->> 'bisnis_tercatat')::int = 1 g_satu_bisnis,
       (:'ad'::jsonb ->> 'pengguna_tercatat')::int = 2 g_dua_pengguna,
       not (:'ad'::text like '%Toko Kinerja%') g_tanpa_nama_bisnis,
       not (:'ad'::text like '%d1d1d1d1%') g_tanpa_id,
       exists (select 1 from jsonb_array_elements(:'ad'::jsonb -> 'rekomendasi') r where r ->> 'module' = 'r_belanja' and (r ->> 'diterima')::int = 1) g_reko_agregat;

\echo == H. Pembersihan 180 hari & isolasi bisnis ditutup
reset role;
insert into exp_usage(kos_id, user_id, day, kind, key, n) values (:'A', :'PM', (now() at time zone 'Asia/Jakarta')::date - 200, 'menu', '/lama', 1);
select exp_usage_purge() = 1 h_hapus_lama;
select not exists (select 1 from exp_usage where key = '/lama') h_lama_hilang, exists (select 1 from exp_usage where key = '/promo') h_100_hari_tetap;
update kos set closed_at = now() where id = :'A';
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select exp_track(:'A', '[{"k":"menu","key":"/kasir"}]'::jsonb) = 0 h_ditutup_ditelan;
reset role;
update kos set closed_at = null where id = :'A';
