-- Uji Event Tahap B: rundown (item, durasi/lewat tengah malam, versi, live, geser, bentrok PIC, pulihkan, agenda, akses, paket).
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/event_rundown.sql"
-- Lulus = semua kolom t (periksa keluaran -A), notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email,raw_user_meta_data) values
  ('b8b8b8b8-0000-0000-0000-000000000001','eo.rundown@x.com','{"name":"Pemilik Rundown"}'), ('b8b8b8b8-0000-0000-0000-000000000002','opr.rundown@x.com','{"name":"Operator Lapangan"}'),
  ('b8b8b8b8-0000-0000-0000-000000000003','kasir.rundown@x.com','{"name":"MC Acara"}'), ('b8b8b8b8-0000-0000-0000-000000000004','luar.rundown@x.com','{}'),
  ('b8b8b8b8-0000-0000-0000-000000000005','gratis.rundown@x.com','{}') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,category_code) values
  ('b8b8b8b8-0000-0000-0000-00000000000a','EO Rundown','b8b8b8b8-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,'active','kustom','event'),
  ('b8b8b8b8-0000-0000-0000-00000000000c','EO Gratis Rundown','b8b8b8b8-0000-0000-0000-000000000005','gratis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','kustom','event');
update kos set trial_until = (now() at time zone 'Asia/Jakarta')::date - 1 where id = 'b8b8b8b8-0000-0000-0000-00000000000c';
insert into kos_members(kos_id,user_id,role) values
  ('b8b8b8b8-0000-0000-0000-00000000000a','b8b8b8b8-0000-0000-0000-000000000001','pemilik'),
  ('b8b8b8b8-0000-0000-0000-00000000000a','b8b8b8b8-0000-0000-0000-000000000002','operator'),
  ('b8b8b8b8-0000-0000-0000-00000000000a','b8b8b8b8-0000-0000-0000-000000000003','kasir'),
  ('b8b8b8b8-0000-0000-0000-00000000000c','b8b8b8b8-0000-0000-0000-000000000005','pemilik');
-- modul Proyek bisnis gratis aktif (bisnis lama yang paketnya turun) agar jalur "paket turun" teruji
update business_modules set active = true where kos_id = 'b8b8b8b8-0000-0000-0000-00000000000c' and module_code = 'u_proyek';
\set K 'b8b8b8b8-0000-0000-0000-00000000000a'
\set KG 'b8b8b8b8-0000-0000-0000-00000000000c'
\set OWN 'b8b8b8b8-0000-0000-0000-000000000001'
\set OPR 'b8b8b8b8-0000-0000-0000-000000000002'
\set MC 'b8b8b8b8-0000-0000-0000-000000000003'
\set LUAR 'b8b8b8b8-0000-0000-0000-000000000004'
\set GRT 'b8b8b8b8-0000-0000-0000-000000000005'
select ((now() at time zone 'Asia/Jakarta')::date) as hari \gset

set role authenticated;
select set_config('request.jwt.claim.sub', :'OWN', false) \g /dev/null
\echo == A. Item: urutan, durasi dari jam selesai, lewat tengah malam
select prj_save(:'K', null, jsonb_build_object('name', 'Wedding Rina & Bayu', 'kind', 'event', 'start_date', :'hari', 'end_date', :'hari', 'location', 'Gedung Serbaguna')) as e1 \gset
select prj_save(:'K', null, jsonb_build_object('name', 'Seminar UMKM', 'kind', 'event', 'start_date', :'hari')) as e2 \gset
select set_config('t.e1', :'e1', false), set_config('t.e2', :'e2', false) \g /dev/null
select prj_rundown_save(:'e1', null, '{"start_time":"09:00","end_time":"10:30","title":"Akad nikah","location":"Ballroom","performer":"Penghulu","cue":"Lampu redup, musik instrumental"}'::jsonb) as r2 \gset
select prj_rundown_save(:'e1', null, '{"start_time":"08:00","duration_min":30,"title":"Persiapan pengantin"}'::jsonb) as r1 \gset
select prj_rundown_save(:'e1', null, jsonb_build_object('start_time', '23:00', 'end_time', '01:00', 'title', 'Bongkar dekorasi', 'pic_user', :'OPR')) as r3 \gset
select set_config('t.r1', :'r1', false), set_config('t.r3', :'r3', false) \g /dev/null
select jsonb_array_length(x->'items') = 3 a_jumlah,
       x->'items'->0->>'title' = 'Persiapan pengantin' and x->'items'->0->>'end_time' = '08:30' a_urut_durasi,
       (x->'items'->1->>'duration_min')::int = 90 and x->'items'->1->>'end_time' = '10:30' a_dari_jam_selesai,
       (x->'items'->2->>'duration_min')::int = 120 and x->'items'->2->>'end_time' = '01:00' a_lewat_tengah_malam,
       x->'items'->2->>'pic' = 'Operator Lapangan' and x->>'day' is null and x->'items'->0->>'day' = :'hari' a_hari_bawaan_event,
       (x->>'can_edit')::boolean and (x->>'changed')::boolean and jsonb_array_length(x->'versions') = 0 a_belum_ada_versi,
       jsonb_array_length(x->'team') = 3 a_tim
from (select prj_rundown(:'e1') x) z;

\echo == B. Validasi
do $$ declare m text; begin
  begin perform prj_rundown_save(current_setting('t.e1')::uuid, null, '{"start_time":"10:00","title":"x"}'::jsonb); exception when others then m := sqlerrm; end;
  if m like '%nama kegiatan%' then raise notice 'B_JUDUL_OK'; else raise warning 'GAGAL B judul: %', m; end if;
  m := null;
  begin perform prj_rundown_save(current_setting('t.e1')::uuid, null, '{"title":"Tanpa jam"}'::jsonb); exception when others then m := sqlerrm; end;
  if m like '%jam mulai%' then raise notice 'B_JAM_OK'; else raise warning 'GAGAL B jam: %', m; end if;
  m := null;
  begin perform prj_rundown_save(current_setting('t.e1')::uuid, null, '{"start_time":"10:00","title":"PIC asing","pic_user":"b8b8b8b8-0000-0000-0000-000000000004"}'::jsonb); exception when others then m := sqlerrm; end;
  if m like '%anggota tim%' then raise notice 'B_PIC_ASING_OK'; else raise warning 'GAGAL B pic: %', m; end if;
  m := null;
  begin perform prj_rundown_save(current_setting('t.e1')::uuid, null, '{"start_time":"25:00","title":"Jam salah"}'::jsonb); exception when others then m := sqlerrm; end;
  if m like '%tidak valid%' then raise notice 'B_JAM_SALAH_OK'; else raise warning 'GAGAL B jam salah: %', m; end if;
end $$;

\echo == C. Versi: simpan, tolak tanpa perubahan, ubah → berubah, versi 2, lihat versi 1
select prj_rundown_version_save(:'e1', 'Disetujui klien') = 1 c_versi1;
select not (prj_rundown(:'e1')->>'changed')::boolean c_tidak_berubah;
do $$ declare m text; begin
  begin perform prj_rundown_version_save(current_setting('t.e1')::uuid, 'lagi'); exception when others then m := sqlerrm; end;
  if m like '%Tidak ada perubahan%' then raise notice 'C_TANPA_PERUBAHAN_OK'; else raise warning 'GAGAL C: %', m; end if;
end $$;
select prj_rundown_save(:'e1', :'r1', '{"start_time":"07:30","duration_min":60,"title":"Persiapan & make up pengantin"}'::jsonb) = :'r1'::uuid c_ubah;
select (prj_rundown(:'e1')->>'changed')::boolean c_berubah;
select prj_rundown_version_save(:'e1', 'Make up lebih awal') = 2 c_versi2;
reset role;
select v.id as v1 from prj_rundown_versions v where v.project_id = :'e1' and v.version = 1 \gset
select set_config('t.v1', :'v1', false) \g /dev/null
set role authenticated;
select (x->>'version')::int = 1 and jsonb_array_length(x->'items') = 3 and x->'items'->0->>'start_time' = '08:00' and x->>'note' = 'Disetujui klien' c_lihat_versi1
from (select prj_rundown_version_get(:'v1') x) z;
select jsonb_array_length(prj_rundown(:'e1')->'versions') = 2 and prj_rundown(:'e1')->'versions'->0->>'version' = '2' c_daftar_versi;

\echo == D. Live: PIC item boleh mengubah status itu saja; waktu nyata & pelaku tercatat
select set_config('request.jwt.claim.sub', :'OPR', false) \g /dev/null
select (prj_rundown(:'e1')->>'access') = 'lihat' and not (prj_rundown(:'e1')->>'can_edit')::boolean d_operator_lihat;
select x->>'status' = 'berjalan' and x->>'actual_start' is not null and x->>'status_by' = 'Operator Lapangan' d_mulai
from (select prj_rundown_status(:'r3', 'berjalan') x) z;
select x->>'status' = 'selesai' and x->>'actual_end' is not null and x->>'actual_start' is not null d_selesai
from (select prj_rundown_status(:'r3', 'selesai') x) z;
do $$ declare m text; begin
  begin perform prj_rundown_status(current_setting('t.r1')::uuid, 'berjalan'); exception when others then m := sqlerrm; end;
  if m like '%PIC item ini%' then raise notice 'D_BUKAN_PIC_OK'; else raise warning 'GAGAL D bukan pic: %', m; end if;
  m := null;
  begin perform prj_rundown_save(current_setting('t.e1')::uuid, current_setting('t.r3')::uuid, '{"start_time":"23:30","title":"Diubah operator"}'::jsonb); exception when others then m := sqlerrm; end;
  if m like '%Hanya pemilik%' then raise notice 'D_OPERATOR_TIDAK_UBAH_OK'; else raise warning 'GAGAL D ubah: %', m; end if;
end $$;
-- status bukan isi: tidak membuat rundown "berubah" terhadap versi
select set_config('request.jwt.claim.sub', :'OWN', false) \g /dev/null
select not (prj_rundown(:'e1')->>'changed')::boolean d_status_bukan_perubahan_isi;

\echo == E. Kasir yang jadi PIC (MC) ikut melihat event itu & menjalankan itemnya
select prj_rundown_save(:'e1', null, jsonb_build_object('start_time', '11:00', 'duration_min', 60, 'title', 'Resepsi', 'pic_user', :'MC', 'performer', 'MC Acara')) as r4 \gset
select set_config('request.jwt.claim.sub', :'MC', false) \g /dev/null
select prj_rundown(:'e1')->>'access' = 'lihat' e_kasir_lihat,
       exists (select 1 from jsonb_array_elements(prj_list(:'K')->'projects') p where p->>'id' = :'e1') e_di_daftar,
       not exists (select 1 from jsonb_array_elements(prj_list(:'K')->'projects') p where p->>'id' = :'e2') e_event_lain_tersembunyi,
       (prj_rundown_status(:'r4', 'siap')->>'status') = 'siap' e_kasir_status;

\echo == F. Geser jadwal (acara molor) & batas tengah malam
select set_config('request.jwt.claim.sub', :'OWN', false) \g /dev/null
select prj_rundown_shift(:'e1', :'hari', '09:00', 15) = 2 f_geser_dua;   -- akad 09:00 & resepsi 11:00 (bongkar sudah selesai)
select (select x->>'start_time' from jsonb_array_elements(prj_rundown(:'e1')->'items') x where x->>'id' = :'r2') = '09:15' f_akad_0915,
       (select x->>'start_time' from jsonb_array_elements(prj_rundown(:'e1')->'items') x where x->>'id' = :'r1') = '07:30' f_sebelumnya_tetap,
       (select x->>'start_time' from jsonb_array_elements(prj_rundown(:'e1')->'items') x where x->>'id' = :'r3') = '23:00' f_selesai_tetap;
select prj_rundown_status(:'r3', 'rencana') is not null f_buka_lagi;
do $$ declare m text; begin
  begin perform prj_rundown_shift(current_setting('t.e1')::uuid, (now() at time zone 'Asia/Jakarta')::date, '23:00', 90); exception when others then m := sqlerrm; end;
  if m like '%pergantian hari%' then raise notice 'F_TENGAH_MALAM_OK'; else raise warning 'GAGAL F: %', m; end if;
end $$;

\echo == G. Bentrok PIC antar event (peringatan)
select prj_rundown_save(:'e2', null, jsonb_build_object('start_time', '11:30', 'duration_min', 30, 'title', 'Sambutan', 'pic_user', :'MC')) is not null g_simpan;
select jsonb_array_length(x->'clash') = 1 and x->'clash'->0->>'project' = 'Seminar UMKM' g_bentrok
from jsonb_array_elements(prj_rundown(:'e1')->'items') x where x->>'id' = :'r4';
select jsonb_array_length(x->'clash') = 0 g_tanpa_bentrok
from jsonb_array_elements(prj_rundown(:'e1')->'items') x where x->>'id' = :'r2';

\echo == H. Pulihkan versi 1: isi sekarang disimpan otomatis dulu, item & status kembali
do $$ declare m text; begin
  begin perform prj_rundown_restore(current_setting('t.v1')::uuid, 'x'); exception when others then m := sqlerrm; end;
  if m like '%alasan%' then raise notice 'H_ALASAN_OK'; else raise warning 'GAGAL H alasan: %', m; end if;
end $$;
select prj_rundown_restore(:'v1', 'Klien kembali ke susunan awal') = 4 h_versi_baru;  -- v3 = otomatis sebelum pulih, v4 = hasil pulih
select jsonb_array_length(x->'items') = 3 and x->'items'->0->>'start_time' = '08:00' and x->'items'->1->>'start_time' = '09:00'
       and not exists (select 1 from jsonb_array_elements(x->'items') i where i->>'status' <> 'rencana')
       and not (x->>'changed')::boolean and x->'versions'->1->>'note' like 'Otomatis%' h_isi_pulih
from (select prj_rundown(:'e1') x) z;

\echo == I. Massal, hapus, agenda harian lintas event
select prj_rundown_bulk(:'e2', '[{"start_time":"08:00","duration_min":30,"title":"Registrasi peserta"},{"start_time":"08:30","duration_min":15,"title":"Pembukaan"}]'::jsonb) = 2 i_massal;
do $$ declare m text; begin
  begin perform prj_rundown_bulk(current_setting('t.e2')::uuid, '[]'::jsonb); exception when others then m := sqlerrm; end;
  if m like '%kosong%' then raise notice 'I_MASSAL_KOSONG_OK'; else raise warning 'GAGAL I: %', m; end if;
end $$;
reset role;
select (select r.id from prj_rundown_items r where r.project_id = :'e2' and r.title = 'Pembukaan') as rdel \gset
set role authenticated;
select prj_rundown_delete(:'rdel')::text = '' i_hapus;
select jsonb_array_length(a->'items') = 5 and a->'items'->0->>'title' in ('Persiapan pengantin', 'Registrasi peserta')
       and exists (select 1 from jsonb_array_elements(a->'items') x where x->>'project' = 'Seminar UMKM') i_agenda
from (select event_agenda(:'K', :'hari') a) z;
select set_config('request.jwt.claim.sub', :'MC', false) \g /dev/null
-- MC hanya melihat event tempat ia terlibat (resepsi e1 dipulihkan tanpa dirinya → hanya Sambutan di e2)
select jsonb_array_length(a->'items') = 2 and not exists (select 1 from jsonb_array_elements(a->'items') x where x->>'project' = 'Wedding Rina & Bayu') i_agenda_mc
from (select event_agenda(:'K', :'hari') a) z;

\echo == J. Riwayat & label
select set_config('request.jwt.claim.sub', :'OWN', false) \g /dev/null
select event_label('RundownStatus') = 'Pelaksanaan rundown' and event_label('RundownVersion') = 'Versi rundown' j_label,
       exists (select 1 from jsonb_array_elements(prj_get(:'e1')->'history') h where h->>'label' = 'Pelaksanaan rundown' and h->>'summary' like '%Bongkar dekorasi → selesai%') j_riwayat_live;

\echo == K. Akses orang luar & paket turun
select set_config('request.jwt.claim.sub', :'LUAR', false) \g /dev/null
do $$ declare m text; begin
  begin perform prj_rundown(current_setting('t.e1')::uuid); exception when others then m := sqlerrm; end;
  if m like '%tidak ditemukan%' then raise notice 'K_LUAR_BACA_OK'; else raise warning 'GAGAL K baca: %', m; end if;
  m := null;
  begin perform event_agenda('b8b8b8b8-0000-0000-0000-00000000000a', null); exception when others then m := sqlerrm; end;
  if m like '%Tidak punya akses%' then raise notice 'K_LUAR_AGENDA_OK'; else raise warning 'GAGAL K agenda: %', m; end if;
  m := null;
  begin perform prj_rundown_status(current_setting('t.r1')::uuid, 'selesai'); exception when others then m := sqlerrm; end;
  if m is not null then raise notice 'K_LUAR_STATUS_OK'; else raise warning 'GAGAL K status'; end if;
end $$;
reset role;
insert into prj_projects(id, kos_id, number, name, kind, status, start_date) values
  ('b8b8b8b8-0000-0000-0000-0000000000e9', :'KG', 'PRJ-T-001', 'Event lama', 'event', 'berjalan', :'hari');
insert into prj_rundown_items(id, kos_id, project_id, day, start_time, title) values
  ('b8b8b8b8-0000-0000-0000-0000000000f9', :'KG', 'b8b8b8b8-0000-0000-0000-0000000000e9', :'hari', '10:00', 'Acara lama');
set role authenticated;
select set_config('request.jwt.claim.sub', :'GRT', false) \g /dev/null
do $$ declare m text; begin
  begin perform prj_rundown_save('b8b8b8b8-0000-0000-0000-0000000000e9', null, '{"start_time":"11:00","title":"Item baru"}'::jsonb); exception when others then m := sqlerrm; end;
  if m like 'BATAS_PAKET:%Paket Dasar%' then raise notice 'K_GRATIS_UBAH_DITOLAK_OK'; else raise warning 'GAGAL K gratis: %', m; end if;
end $$;
select not (x->>'can_edit')::boolean and jsonb_array_length(x->'items') = 1 k_gratis_tetap_baca from (select prj_rundown('b8b8b8b8-0000-0000-0000-0000000000e9') x) z;
select (prj_rundown_status('b8b8b8b8-0000-0000-0000-0000000000f9', 'selesai')->>'status') = 'selesai' k_gratis_live_boleh;
select prj_rundown_shift('b8b8b8b8-0000-0000-0000-0000000000e9', :'hari', '00:00', 10) = 0 k_gratis_geser_boleh;
reset role;
