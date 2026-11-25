-- Uji Mesin Proyek (Tahap 1A Event, Media & Creative). Jalankan di database baru berisi semua migrasi:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/proyek.sql"
-- Lulus = semua kolom bernilai t, tanpa GAGAL. Baris ERROR yang muncul hanya dari blok do $$ yang memang menguji penolakan (ditangkap).
\set ON_ERROR_STOP off
insert into auth.users(id,email,raw_user_meta_data) values
  ('e0e0e0e0-0000-0000-0000-000000000001','eo@x.com','{"name":"Pemilik EO"}'), ('e0e0e0e0-0000-0000-0000-000000000002','operator@x.com','{"name":"Rani Operator"}'),
  ('e0e0e0e0-0000-0000-0000-000000000003','kasir@x.com','{}'), ('e0e0e0e0-0000-0000-0000-000000000004','lain@x.com','{}'),
  ('e0e0e0e0-0000-0000-0000-000000000005','dasar@x.com','{}') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,category_code) values
  ('e0e0e0e0-0000-0000-0000-00000000000a','EO Bahagia','e0e0e0e0-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','kustom','event'),
  ('e0e0e0e0-0000-0000-0000-00000000000b','Studio Lain','e0e0e0e0-0000-0000-0000-000000000004','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','jasa','media'),
  ('e0e0e0e0-0000-0000-0000-00000000000c','EO Dasar','e0e0e0e0-0000-0000-0000-000000000005','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,'active','kustom','event'),
  ('e0e0e0e0-0000-0000-0000-00000000000d','Toko Biasa','e0e0e0e0-0000-0000-0000-000000000005','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail','retail'),
  ('e0e0e0e0-0000-0000-0000-00000000000e','Laundry Bisnis','e0e0e0e0-0000-0000-0000-000000000005','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','jasa','laundry');
insert into kos_members(kos_id,user_id,role) values
  ('e0e0e0e0-0000-0000-0000-00000000000a','e0e0e0e0-0000-0000-0000-000000000001','pemilik'),
  ('e0e0e0e0-0000-0000-0000-00000000000a','e0e0e0e0-0000-0000-0000-000000000002','operator'),
  ('e0e0e0e0-0000-0000-0000-00000000000a','e0e0e0e0-0000-0000-0000-000000000003','kasir'),
  ('e0e0e0e0-0000-0000-0000-00000000000b','e0e0e0e0-0000-0000-0000-000000000004','pemilik'),
  ('e0e0e0e0-0000-0000-0000-00000000000c','e0e0e0e0-0000-0000-0000-000000000005','pemilik'),
  ('e0e0e0e0-0000-0000-0000-00000000000d','e0e0e0e0-0000-0000-0000-000000000005','pemilik'),
  ('e0e0e0e0-0000-0000-0000-00000000000e','e0e0e0e0-0000-0000-0000-000000000005','pemilik');
\set K 'e0e0e0e0-0000-0000-0000-00000000000a'
\set KD 'e0e0e0e0-0000-0000-0000-00000000000c'
\set OWN 'e0e0e0e0-0000-0000-0000-000000000001'
\set OPR 'e0e0e0e0-0000-0000-0000-000000000002'
\set KSR 'e0e0e0e0-0000-0000-0000-000000000003'
\set LAIN 'e0e0e0e0-0000-0000-0000-000000000004'
\set DSR 'e0e0e0e0-0000-0000-0000-000000000005'

\echo == A. Modul: aktif untuk event + Paket Bisnis; tidak untuk Paket Dasar, laundry, dan toko
select module_on(:'K', 'u_proyek') a_event_bisnis_aktif, not module_on(:'KD', 'u_proyek') a_event_dasar_mati,
       not module_on('e0e0e0e0-0000-0000-0000-00000000000e', 'u_proyek') a_laundry_mati,
       not exists (select 1 from business_modules where kos_id = 'e0e0e0e0-0000-0000-0000-00000000000d' and module_code = 'u_proyek') a_toko_tanpa_baris,
       plan_has(:'K', 'proyek') and not plan_has(:'KD', 'proyek') a_fitur_bisnis,
       'proyek' = any(plan_feature_codes()) a_kode_fitur;

set role authenticated;
select set_config('request.jwt.claim.sub', :'DSR', false), set_config('request.jwt.claims', '{"sub":"e0e0e0e0-0000-0000-0000-000000000005","email":"dasar@x.com"}', false) \g /dev/null
do $$ declare m text; begin
  begin perform module_set('e0e0e0e0-0000-0000-0000-00000000000c', 'u_proyek', true, null); exception when others then m := sqlerrm; end;
  if m like '%paket yang lebih tinggi%' then raise notice 'A_DASAR_TIDAK_BISA_AKTIFKAN_OK'; else raise warning 'GAGAL A dasar aktifkan: %', m; end if;
end $$;

\echo == B. Pemilik membuat proyek + klien baru; nomor berurutan
select set_config('request.jwt.claim.sub', :'OWN', false), set_config('request.jwt.claims', '{"sub":"e0e0e0e0-0000-0000-0000-000000000001","email":"eo@x.com"}', false) \g /dev/null
select prj_save(:'K', null, jsonb_build_object('name', 'Wedding Andi & Sari', 'kind', 'event', 'client_name', 'Andi Pratama', 'client_phone', '0812',
  'start_date', current_date + 10, 'end_date', current_date + 11, 'value', 85000000, 'location', 'Gedung Serbaguna')) as p1 \gset
select prj_save(:'K', null, jsonb_build_object('name', 'Video profil perusahaan', 'kind', 'kreatif', 'status', 'penawaran')) as p2 \gset
reset role;
select number like 'PRJ-____-001' and status = 'berjalan' and manager_user = :'OWN' and value = 85000000 b_proyek1,
       (select name = 'Andi Pratama' and kind = 'pelanggan' from contacts where id = p.contact_id) b_klien_dibuat
from prj_projects p where id = :'p1';
select number like 'PRJ-____-002' and status = 'penawaran' and value is null b_proyek2 from prj_projects where id = :'p2';
select count(*) = 2 b_riwayat_dibuat from domain_events where aggregate_type = 'project' and event_type = 'ProjectCreated' and kos_id = :'K';
set role authenticated;

\echo == C. Milestone, tugas, anggota
select prj_milestone_save(:'p1', null, jsonb_build_object('name', 'DP & konsep', 'due_date', current_date + 1, 'amount', 25000000)) as m1 \gset
select prj_milestone_save(:'p1', null, jsonb_build_object('name', 'Pelunasan', 'due_date', current_date + 9, 'amount', 60000000)) as m2 \gset
select prj_task_save(:'p1', null, jsonb_build_object('title', 'Survei venue', 'milestone_id', :'m1', 'assignee_user', :'OPR', 'due_date', current_date - 1, 'priority', 'tinggi')) as t1 \gset
select prj_task_save(:'p1', null, jsonb_build_object('title', 'Booking dekorasi', 'assignee_user', :'KSR', 'due_date', current_date + 5)) as t2 \gset
select prj_task_save(:'p1', null, jsonb_build_object('title', 'Susun rundown')) as t3 \gset
select prj_member_set(:'p1', :'OPR', true, 'Koordinator lapangan');
select set_config('t.p1', :'p1', false), set_config('t.p2', :'p2', false), set_config('t.t2', :'t2', false), set_config('t.t3', :'t3', false) \g /dev/null
select (x->>'tasks_total')::int = 3 and (x->>'tasks_late')::int = 1 and (x->>'progress')::int = 0 and (x->>'value')::numeric = 85000000
       and (x->'next_milestone'->>'name') = 'DP & konsep' c_ringkasan
from jsonb_array_elements(prj_list(:'K')->'projects') x where x->>'id' = :'p1';
select (prj_get(:'p1')->>'milestone_total')::numeric = 85000000 c_total_termin, prj_get(:'p1')->>'access' = 'kelola' c_pemilik_kelola,
       jsonb_array_length(prj_get(:'p1')->'members') = 1 c_anggota, jsonb_array_length(prj_get(:'p1')->'team') = 3 c_pilihan_tim;
do $$ declare m text; begin
  begin perform prj_task_save('00000000-0000-0000-0000-000000000000', null, '{"title":"x"}'); exception when others then m := sqlerrm; end;
  if m like '%Hanya pemilik%' then raise notice 'C_PROYEK_TIDAK_ADA_OK'; else raise warning 'GAGAL C: %', m; end if;
  m := null;
  begin perform prj_task_save(current_setting('t.p1')::uuid, null,
    jsonb_build_object('title', 'Orang luar', 'assignee_user', 'e0e0e0e0-0000-0000-0000-000000000004')); exception when others then m := sqlerrm; end;
  if m like '%anggota tim%' then raise notice 'C_PJ_LUAR_DITOLAK_OK'; else raise warning 'GAGAL C pj luar: %', m; end if;
end $$;

\echo == D. Operator (area ops): lihat semua proyek, tanpa nilai uang; tidak bisa mengubah proyek; bisa menyelesaikan tugasnya sendiri
select set_config('request.jwt.claim.sub', :'OPR', false), set_config('request.jwt.claims', '{"sub":"e0e0e0e0-0000-0000-0000-000000000002","email":"operator@x.com"}', false) \g /dev/null
select jsonb_array_length(prj_list(:'K')->'projects') = 2 d_lihat_semua, (prj_list(:'K')->>'fin')::boolean = false d_bukan_keuangan,
       not (prj_list(:'K')->>'can_create')::boolean d_tidak_bisa_buat;
select prj_get(:'p1')->>'value' is null d_nilai_tersembunyi, prj_get(:'p1')->>'milestone_total' is null d_termin_tersembunyi,
       (select bool_and(x->>'amount' is null) from jsonb_array_elements(prj_get(:'p1')->'milestones') x) d_nilai_termin_tersembunyi,
       prj_get(:'p1')->>'access' = 'lihat' d_akses_lihat, prj_get(:'p1')->'team' = 'null'::jsonb d_tanpa_daftar_tim;
select jsonb_array_length(prj_list(:'K')->'mine') = 1 d_tugas_saya;
select prj_task_status(:'t1', 'selesai');
do $$ declare m text; begin
  begin perform prj_save('e0e0e0e0-0000-0000-0000-00000000000a', current_setting('t.p1')::uuid, '{"name":"Ubah"}'); exception when others then m := sqlerrm; end;
  if m like '%PIC proyek%' then raise notice 'D_OPERATOR_TIDAK_UBAH_OK'; else raise warning 'GAGAL D ubah: %', m; end if;
  m := null;
  begin perform prj_task_status(current_setting('t.t3')::uuid, 'selesai'); exception when others then m := sqlerrm; end;
  if m like '%penanggung jawab%' then raise notice 'D_TUGAS_ORANG_LAIN_OK'; else raise warning 'GAGAL D tugas lain: %', m; end if;
end $$;

\echo == E. Kasir (area sell): hanya proyek tempat ia diberi tugas
select set_config('request.jwt.claim.sub', :'KSR', false), set_config('request.jwt.claims', '{"sub":"e0e0e0e0-0000-0000-0000-000000000003","email":"kasir@x.com"}', false) \g /dev/null
select jsonb_array_length(prj_list(:'K')->'projects') = 1 e_hanya_yang_ditugaskan, prj_get(:'p1')->>'access' = 'lihat' e_lihat;
select prj_task_status(:'t2', 'proses');
do $$ declare m text; begin
  begin perform prj_get(current_setting('t.p2')::uuid); exception when others then m := sqlerrm; end;
  if m like '%tidak ditemukan%' then raise notice 'E_PROYEK_LAIN_TERTUTUP_OK'; else raise warning 'GAGAL E: %', m; end if;
  m := null;
  begin perform prj_task_status(current_setting('t.t2')::uuid, 'batal'); exception when others then m := sqlerrm; end;
  if m like '%pengelola proyek%' then raise notice 'E_KASIR_TIDAK_BATALKAN_OK'; else raise warning 'GAGAL E batal: %', m; end if;
end $$;

\echo == F. Tabel tidak bisa dibaca langsung; bisnis lain tidak bisa membuka
do $$ declare m text; begin
  begin perform 1 from prj_projects limit 1; exception when others then m := sqlerrm; end;
  if m like '%permission denied%' then raise notice 'F_TABEL_TERTUTUP_OK'; else raise warning 'GAGAL F tabel: %', m; end if;
end $$;
select set_config('request.jwt.claim.sub', :'LAIN', false), set_config('request.jwt.claims', '{"sub":"e0e0e0e0-0000-0000-0000-000000000004","email":"lain@x.com"}', false) \g /dev/null
do $$ declare m text; begin
  begin perform prj_get(current_setting('t.p1')::uuid); exception when others then m := sqlerrm; end;
  if m like '%tidak ditemukan%' or m like '%permission%' then raise notice 'F_ISOLASI_GET_OK'; else raise warning 'GAGAL F get: %', m; end if;
  m := null;
  begin perform prj_list('e0e0e0e0-0000-0000-0000-00000000000a'); exception when others then m := sqlerrm; end;
  if m like '%Tidak punya akses%' then raise notice 'F_ISOLASI_LIST_OK'; else raise warning 'GAGAL F list: %', m; end if;
end $$;

\echo == G. Status: batal wajib alasan, buka lagi wajib alasan; selesai memberi peringatan tugas terbuka
select set_config('request.jwt.claim.sub', :'OWN', false), set_config('request.jwt.claims', '{"sub":"e0e0e0e0-0000-0000-0000-000000000001","email":"eo@x.com"}', false) \g /dev/null
do $$ declare m text; begin
  begin perform prj_status(current_setting('t.p2')::uuid, 'batal', ''); exception when others then m := sqlerrm; end;
  if m like '%alasan pembatalan%' then raise notice 'G_BATAL_ALASAN_OK'; else raise warning 'GAGAL G: %', m; end if;
end $$;
select (prj_status(:'p2', 'batal', 'Klien memilih vendor lain')->>'ok')::boolean g_batal;
do $$ declare m text; begin
  begin perform prj_status(current_setting('t.p2')::uuid, 'berjalan', null); exception when others then m := sqlerrm; end;
  if m like '%alasan membuka lagi%' then raise notice 'G_BUKA_ALASAN_OK'; else raise warning 'GAGAL G buka: %', m; end if;
  m := null;
  begin perform prj_task_save(current_setting('t.p2')::uuid, null, '{"title":"Tugas baru"}'); exception when others then m := sqlerrm; end;
  if m like '%sudah batal%' then raise notice 'G_PROYEK_BATAL_TERKUNCI_OK'; else raise warning 'GAGAL G terkunci: %', m; end if;
end $$;
select prj_status(:'p2', 'berjalan', 'Klien kembali')->>'ok' = 'true' g_dibuka_lagi;

\echo == H. Subproyek satu tingkat
select prj_save(:'K', null, jsonb_build_object('name', 'Produksi panggung', 'kind', 'produksi', 'parent_id', :'p1')) as c1 \gset
select (prj_get(:'p1')->>'subprojects')::int = 1 h_subproyek;
select set_config('request.jwt.claim.sub', :'KSR', false) \g /dev/null
select jsonb_array_length(prj_get(:'p1')->'children') = 0 h_kasir_tidak_lihat_subproyek;
select set_config('request.jwt.claim.sub', :'OWN', false) \g /dev/null
select jsonb_array_length(prj_get(:'p1')->'children') = 1 h_pemilik_lihat_subproyek;
select set_config('t.c1', :'c1', false) \g /dev/null
do $$ declare m text; begin
  begin perform prj_save('e0e0e0e0-0000-0000-0000-00000000000a', null, jsonb_build_object('name', 'Cucu', 'parent_id', current_setting('t.c1')::uuid)); exception when others then m := sqlerrm; end;
  if m like '%satu tingkat%' then raise notice 'H_SATU_TINGKAT_OK'; else raise warning 'GAGAL H: %', m; end if;
end $$;

\echo == I. Paket turun ke Dasar: buka & selesaikan boleh, membuat/mengubah ditolak
reset role;
update kos set plan = 'dasar' where id = :'K';
set role authenticated;
select jsonb_array_length(prj_list(:'K')->'projects') = 3 i_data_tetap_terbuka, not (prj_list(:'K')->>'allowed')::boolean i_tanda_paket;
do $$ declare m text; begin
  begin perform prj_save('e0e0e0e0-0000-0000-0000-00000000000a', null, '{"name":"Proyek baru"}'); exception when others then m := sqlerrm; end;
  if m like 'BATAS_PAKET:%' then raise notice 'I_BUAT_DITOLAK_OK'; else raise warning 'GAGAL I: %', m; end if;
end $$;
select prj_task_status(:'t3', 'selesai');
select (prj_status(:'p1', 'selesai', null)->>'open_tasks')::int = 1 i_selesai_dengan_peringatan;
select prj_get(:'p1')->>'status' = 'selesai' and prj_get(:'p1')->>'closed_at' is not null i_tertutup;
reset role;
update kos set plan = 'bisnis' where id = :'K';

\echo == J. Riwayat proyek & label
select count(*) filter (where event_type = 'TaskCompleted') = 2 and count(*) filter (where event_type = 'MilestoneCompleted') = 0
       and count(*) filter (where event_type = 'ProjectStatusChanged') = 1 and count(*) filter (where event_type = 'TaskAssigned') = 2 j_peristiwa
from domain_events where kos_id = :'K' and aggregate_type = 'project' and aggregate_id = :'p1';
select event_label('ProjectCreated') = 'Proyek baru' j_label;
set role authenticated;
select jsonb_array_length(prj_get(:'p1')->'history') >= 5 j_riwayat_di_detail;

\echo == K. Bisnis ditutup: tidak bisa menulis
reset role;
update kos set closed_at = now() where id = :'K';
set role authenticated;
do $$ declare m text; begin
  begin perform prj_save('e0e0e0e0-0000-0000-0000-00000000000a', null, '{"name":"Setelah tutup"}'); exception when others then m := sqlerrm; end;
  if m is not null then raise notice 'K_DITUTUP_DITOLAK_OK'; else raise warning 'GAGAL K: tulis diterima'; end if;
end $$;
reset role;
update kos set closed_at = null where id = :'K';

\echo == L. Lampiran proyek: target dikenal, area ops/settings
select (select read_area from att_target('project', :'p1')) = 'ops,settings' l_lampiran_target;
