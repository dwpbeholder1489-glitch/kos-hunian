-- Uji workspace Event (Tahap A): paket inti/lanjutan, status event 8 tahap, info event, cover, Beranda Event.
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/event_workspace.sql"
-- Lulus = semua kolom t (periksa keluaran -A), notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email,raw_user_meta_data) values
  ('a7a7a7a7-0000-0000-0000-000000000001','eo.bisnis@x.com','{"name":"Pemilik EO"}'), ('a7a7a7a7-0000-0000-0000-000000000002','eo.dasar@x.com','{}'),
  ('a7a7a7a7-0000-0000-0000-000000000003','opr.eo@x.com','{}'), ('a7a7a7a7-0000-0000-0000-000000000004','luar@x.com','{}') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,category_code) values
  ('a7a7a7a7-0000-0000-0000-00000000000a','EO Bisnis','a7a7a7a7-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','kustom','event'),
  ('a7a7a7a7-0000-0000-0000-00000000000b','EO Dasar','a7a7a7a7-0000-0000-0000-000000000002','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,'active','kustom','event');
insert into kos_members(kos_id,user_id,role) values
  ('a7a7a7a7-0000-0000-0000-00000000000a','a7a7a7a7-0000-0000-0000-000000000001','pemilik'),
  ('a7a7a7a7-0000-0000-0000-00000000000a','a7a7a7a7-0000-0000-0000-000000000003','operator'),
  ('a7a7a7a7-0000-0000-0000-00000000000b','a7a7a7a7-0000-0000-0000-000000000002','pemilik');
\set K 'a7a7a7a7-0000-0000-0000-00000000000a'
\set KD 'a7a7a7a7-0000-0000-0000-00000000000b'
\set OWN 'a7a7a7a7-0000-0000-0000-000000000001'
\set DSR 'a7a7a7a7-0000-0000-0000-000000000002'
\set OPR 'a7a7a7a7-0000-0000-0000-000000000003'
\set LUAR 'a7a7a7a7-0000-0000-0000-000000000004'
select ((now() at time zone 'Asia/Jakarta')::date) as hari \gset

\echo == A. Paket: Proyek inti di Dasar, lanjutan di Bisnis; modul Proyek & Kontak aktif untuk event Dasar
select plan_has(:'KD', 'proyek') and not plan_has(:'KD', 'proyek_lanjut') and plan_has(:'K', 'proyek_lanjut') a_paket,
       module_on(:'KD', 'u_proyek') a_modul_dasar, module_on(:'KD', 'r_kontak') a_kontak_event,
       'proyek_lanjut' = any(plan_feature_codes()) a_kode;

set role authenticated;
select set_config('request.jwt.claim.sub', :'DSR', false), set_config('request.jwt.claims', '{"sub":"a7a7a7a7-0000-0000-0000-000000000002","email":"eo.dasar@x.com"}', false) \g /dev/null
\echo == B. Paket Dasar: event, tagihan & pembayaran boleh; penawaran & anggaran ditolak
select prj_save(:'KD', null, '{"name":"Wedding Dasar","kind":"event","value":20000000}') as d1 \gset
select set_config('t.d1', :'d1', false) \g /dev/null
select prj_invoice_create(:'d1', '{"amount":5000000,"description":"DP"}'::jsonb) is not null b_tagihan_dasar,
       prj_payment_add(:'d1', '{"amount":5000000,"account":"kas"}'::jsonb) is not null b_bayar_dasar;
do $$ declare m text; begin
  begin perform prj_quote_save('a7a7a7a7-0000-0000-0000-00000000000b', null, '{"title":"x","lines":[{"description":"x","qty":1,"price":1}]}'::jsonb); exception when others then m := sqlerrm; end;
  if m like 'BATAS_PAKET:%Paket Bisnis%' then raise notice 'B_PENAWARAN_BISNIS_OK'; else raise warning 'GAGAL B penawaran: %', m; end if;
  m := null;
  begin perform prj_budget_save(current_setting('t.d1')::uuid, '[]'::jsonb); exception when others then m := sqlerrm; end;
  if m like 'BATAS_PAKET:%Paket Bisnis%' then raise notice 'B_ANGGARAN_BISNIS_OK'; else raise warning 'GAGAL B anggaran: %', m; end if;
end $$;
select (prj_costs(:'d1')->>'actual')::numeric = 0 b_baca_biaya_tetap_boleh, not (event_home(:'KD', null)->>'lanjut')::boolean b_tanda_lanjut;

\echo == C. Status event otomatis: draft → penawaran → menunggu → terkonfirmasi; manual persiapan; tanggal hari ini = berlangsung
select set_config('request.jwt.claim.sub', :'OWN', false), set_config('request.jwt.claims', '{"sub":"a7a7a7a7-0000-0000-0000-000000000001","email":"eo.bisnis@x.com"}', false) \g /dev/null
select prj_save(:'K', null, jsonb_build_object('name', 'Konser Musik Lokal', 'kind', 'event', 'status', 'penawaran', 'client_name', 'Komunitas Musik',
  'start_date', (:'hari'::date + 5), 'location', 'GOR Majalengka')) as e1 \gset
select set_config('t.e1', :'e1', false) \g /dev/null
select prj_get(:'e1')->>'event_status' = 'draft' c_draft;
select prj_quote_save(:'K', null, jsonb_build_object('project_id', :'e1', 'title', 'Konser Musik Lokal', 'lines', '[{"description":"Paket konser","qty":1,"price":40000000}]'::jsonb)) as q1 \gset
select prj_get(:'e1')->>'event_status' = 'penawaran' c_penawaran;
select prj_quote_send(:'q1');
select prj_get(:'e1')->>'event_status' = 'menunggu' c_menunggu;
do $$ declare m text; begin
  begin perform prj_stage_set(current_setting('t.e1')::uuid, 'persiapan'); exception when others then m := sqlerrm; end;
  if m like '%Konfirmasi event dulu%' then raise notice 'C_PERSIAPAN_BELUM_KONFIRMASI_OK'; else raise warning 'GAGAL C: %', m; end if;
end $$;
select (prj_quote_decide(:'q1', 'disetujui', '{}')->>'ok')::boolean c_setuju;
select prj_get(:'e1')->>'event_status' = 'terkonfirmasi' and prj_get(:'e1')->>'confirmed_at' is not null c_terkonfirmasi;
select prj_stage_set(:'e1', 'persiapan') = 'persiapan' c_persiapan_manual;
do $$ declare m text; begin
  begin perform prj_stage_set(current_setting('t.e1')::uuid, 'menunggu'); exception when others then m := sqlerrm; end;
  if m like '%sudah dikonfirmasi%' then raise notice 'C_MUNDUR_DITOLAK_OK'; else raise warning 'GAGAL C mundur: %', m; end if;
end $$;
select prj_save(:'K', :'e1', jsonb_build_object('name', 'Konser Musik Lokal', 'kind', 'event', 'contact_id', (prj_get(:'e1')->>'contact_id'),
  'start_date', :'hari', 'end_date', :'hari', 'location', 'GOR Majalengka', 'value', 40000000)) is not null c_ubah_tanggal;
select prj_get(:'e1')->>'event_status' = 'berlangsung' c_berlangsung_menang;
select prj_stage_set(:'e1', null) = 'berlangsung' c_kembali_otomatis;

\echo == D. Info event (kategori, peserta, jam) & foto cover
select prj_event_info_set(:'e1', '{"category":"Konser","guests":1500,"start_time":"19:00","end_time":"23:00"}'::jsonb);
select x->>'category' = 'Konser' and (x->>'guests')::int = 1500 and x->>'start_time' = '19:00' and x->>'end_time' = '23:00' d_info from (select prj_get(:'e1') x) z;
reset role;
insert into media(id, kos_id, path, thumb_path, size, category, created_by, uploaded_at) values
  ('a7a7a7a7-0000-0000-0000-0000000000f1', :'K', 'a7/foto.jpg', 'a7/foto_t.jpg', 1000, 'cover', null, now()) ;
set role authenticated;
select media_link('a7a7a7a7-0000-0000-0000-0000000000f1', 'project', :'e1', true) is not null d_link_cover;
select prj_get(:'e1')->>'cover' = 'a7/foto_t.jpg' d_cover;

\echo == E. Beranda Event: KPI dari data nyata
select prj_save(:'K', null, jsonb_build_object('name', 'Seminar Bisnis UMKM', 'kind', 'event', 'start_date', (:'hari'::date + 3), 'value', 10000000)) as e2 \gset
select prj_save(:'K', null, jsonb_build_object('name', 'Gathering Lama', 'kind', 'event', 'start_date', (date_trunc('month', :'hari'::date) - interval '10 days')::date, 'value', 5000000)) as e3 \gset
reset role;
-- e3 dikonfirmasi bulan lalu
update prj_projects set confirmed_at = (date_trunc('month', (now() at time zone 'Asia/Jakarta')) - interval '10 days') where id = :'e3';
set role authenticated;
select prj_milestone_save(:'e2', null, '{"name":"DP","amount":4000000}'::jsonb) as m2 \gset
select prj_milestone_done(:'m2', true);
select prj_task_save(:'e2', null, jsonb_build_object('title', 'Finalisasi rundown', 'due_date', :'hari', 'priority', 'tinggi')) is not null e_tugas;
select (h->'kpi'->>'active')::int = 3 e_aktif, (h->'kpi'->>'active_prev')::int = 1 e_aktif_lalu,
       (h->'kpi'->>'booking_count')::int = 2 and (h->'kpi'->>'booking_value')::numeric = 50000000 e_booking,
       (h->'kpi'->>'booking_value_prev')::numeric = 5000000 e_booking_lalu,
       (h->'kpi'->>'events')::int = 2 e_event_bulan_ini,
       (h->'kpi'->>'revenue')::numeric = 4000000 e_pendapatan,
       jsonb_array_length(h->'upcoming') = 2 and h->'upcoming'->0->>'name' = 'Konser Musik Lokal' e_mendatang_urut,
       h->'upcoming'->0->>'cover' = 'a7/foto_t.jpg' and h->'upcoming'->0->>'event_status' = 'berlangsung' e_mendatang_isi,
       jsonb_array_length(h->'calendar') >= 2 e_kalender,
       jsonb_array_length(h->'revenue6') = 6 and (h->'revenue6'->5->>'amount')::numeric = 4000000 e_grafik,
       (h->'finance'->>'receivable')::numeric = 4000000 and (h->'finance'->>'revenue')::numeric = 4000000 e_keuangan,   -- DP 4 jt diserahkan, belum dibayar = piutang
       h->'tasks'->0->>'title' = 'Finalisasi rundown' and (h->'tasks'->0->>'can_toggle')::boolean e_tugas_dashboard
from (select event_home(:'K', null) h) z;
select (j->>'tasks_total')::int = 1 and j->'tasks'->0->>'title' = 'Finalisasi rundown' and (j->'tasks'->0->>'can_toggle')::boolean e_jadwal_tugas,
       jsonb_array_length(j->'events') >= 2 and j->'events'->0 ? 'event_status' e_jadwal_event,
       jsonb_array_length(j->'team') = 1 and (j->'team'->0->>'open')::int = 1 and (j->'team'->0->>'today')::int = 1 and j->'team'->0->>'name' = 'Belum ditentukan' e_jadwal_tim
from (select event_schedule(:'K', null) j) z;

\echo == F. Operator: tanpa angka uang; orang luar ditolak
select set_config('request.jwt.claim.sub', :'OPR', false) \g /dev/null
select h->'kpi'->>'booking_value' is null and h->'kpi'->>'revenue' is null and h->'finance' = 'null'::jsonb and h->'revenue6' = 'null'::jsonb
       and (h->'kpi'->>'active')::int = 3 f_operator from (select event_home(:'K', null) h) z;
select (event_schedule(:'K', null)->'events'->0->>'value') is null f_operator_jadwal_tanpa_nilai;
select set_config('request.jwt.claim.sub', :'LUAR', false) \g /dev/null
do $$ declare m text; begin
  begin perform event_home('a7a7a7a7-0000-0000-0000-00000000000a', null); exception when others then m := sqlerrm; end;
  if m like '%Tidak punya akses%' then raise notice 'F_LUAR_OK'; else raise warning 'GAGAL F luar: %', m; end if;
  m := null;
  begin perform event_schedule('a7a7a7a7-0000-0000-0000-00000000000a', null); exception when others then m := sqlerrm; end;
  if m like '%Tidak punya akses%' then raise notice 'F_LUAR_JADWAL_OK'; else raise warning 'GAGAL F jadwal luar: %', m; end if;
  m := null;
  begin perform prj_stage_set(current_setting('t.e1')::uuid, 'persiapan'); exception when others then m := sqlerrm; end;
  if m is not null then raise notice 'F_LUAR_TAHAP_OK'; else raise warning 'GAGAL F tahap luar'; end if;
end $$;

\echo == H. Ubah event tanpa mengirim klien/PIC: data lama tetap (perbaikan prj_save)
select set_config('request.jwt.claim.sub', :'OWN', false) \g /dev/null
select prj_save(:'K', :'e1', '{"name":"Konser Musik Lokal 2026","kind":"event"}'::jsonb) is not null h_ubah_nama;
select x->>'name' = 'Konser Musik Lokal 2026' and x->>'client' = 'Komunitas Musik' and x->>'manager_user' = :'OWN' h_tidak_terhapus from (select prj_get(:'e1') x) z;

\echo == G. Selesai & batal
select set_config('request.jwt.claim.sub', :'OWN', false) \g /dev/null
select (prj_status(:'e3', 'selesai', null)->>'ok')::boolean g_selesai;
select prj_get(:'e3')->>'event_status' = 'selesai' g_status_selesai;
select (prj_status(:'e2', 'batal', 'Klien membatalkan')->>'ok')::boolean g_batal;
select prj_get(:'e2')->>'event_status' = 'dibatalkan' g_status_batal;
