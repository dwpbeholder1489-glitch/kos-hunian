-- Uji Fase 6 Integrasi (migrasi 20261121140000). Database baru:
-- /var/tmp/pgtest/runtest.sh <db> supabase/tests/integrasi.sql
-- Lulus = semua kolom bernilai t, tanpa baris "GAGAL"/ERROR. (Pemanggilan webhook dilakukan tanpa pengguna = seperti kunci server.)
\set ON_ERROR_STOP off
insert into auth.users(id,email) values
  ('c1c1c1c1-0000-0000-0000-000000000001','pemilik@x.com'), ('c1c1c1c1-0000-0000-0000-000000000002','kasir@x.com'),
  ('c1c1c1c1-0000-0000-0000-000000000004','lain@x.com'), ('c1c1c1c1-0000-0000-0000-000000000009','super-int@x.com') on conflict do nothing;
insert into admin_staff(email, role, active) values ('super-int@x.com','super_admin',true) on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('c1c1c1c1-0000-0000-0000-00000000000a','Toko Integrasi','c1c1c1c1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','retail'),
  ('c1c1c1c1-0000-0000-0000-00000000000b','Toko Milik Lain','c1c1c1c1-0000-0000-0000-000000000004','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','retail'),
  ('c1c1c1c1-0000-0000-0000-00000000000c','Toko Tanpa CRM','c1c1c1c1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','retail');
insert into kos_members(kos_id,user_id,role) values
  ('c1c1c1c1-0000-0000-0000-00000000000a','c1c1c1c1-0000-0000-0000-000000000001','pemilik'),
  ('c1c1c1c1-0000-0000-0000-00000000000b','c1c1c1c1-0000-0000-0000-000000000004','pemilik'),
  ('c1c1c1c1-0000-0000-0000-00000000000c','c1c1c1c1-0000-0000-0000-000000000001','pemilik'),
  ('c1c1c1c1-0000-0000-0000-00000000000a','c1c1c1c1-0000-0000-0000-000000000002','kasir');
delete from business_modules where kos_id in ('c1c1c1c1-0000-0000-0000-00000000000a','c1c1c1c1-0000-0000-0000-00000000000b','c1c1c1c1-0000-0000-0000-00000000000c') and module_code = 'u_crm';
insert into business_modules(kos_id, module_code, active, updated_by) values
  ('c1c1c1c1-0000-0000-0000-00000000000a','u_crm',true,'uji'), ('c1c1c1c1-0000-0000-0000-00000000000b','u_crm',true,'uji');

\set PM 'c1c1c1c1-0000-0000-0000-000000000001'
\set KS 'c1c1c1c1-0000-0000-0000-000000000002'
\set LN 'c1c1c1c1-0000-0000-0000-000000000004'
\set SU 'c1c1c1c1-0000-0000-0000-000000000009'
\set A  'c1c1c1c1-0000-0000-0000-00000000000a'
\set B  'c1c1c1c1-0000-0000-0000-00000000000b'
\set C  'c1c1c1c1-0000-0000-0000-00000000000c'

set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false);

\echo == A. Registry: 5 konektor, hanya webhook masuk yang tersedia; modul terdaftar
select (select count(*) from jsonb_array_elements(integ_overview(:'A') -> 'catalog')) = 5 a_lima_konektor,
       (select count(*) from jsonb_array_elements(integ_overview(:'A') -> 'catalog') e where e ->> 'impl_status' = 'production_ready' and e ->> 'code' = 'webhook_masuk') = 1 a_hanya_webhook_masuk,
       (select count(*) from jsonb_array_elements(integ_overview(:'A') -> 'catalog') e where e ->> 'impl_status' = 'planned' and coalesce(e ->> 'needs', '') <> '') = 4 a_rencana_punya_syarat,
       (integ_overview(:'A') ->> 'crm_on')::boolean a_crm_aktif,
       module_on(:'A', 'u_integrasi') a_modul_inti_aktif;
reset role;
select (select impl_status from modules where code = 'u_integrasi') = 'production_ready' a_modul_siap,
       (select status from modules where code = 'u_integrasi') = 'available' a_status_sinkron;
set role authenticated;

\echo == B. Izin: kasir & orang luar ditolak
select set_config('request.jwt.claim.sub', :'KS', false) \g /dev/null
do $$ declare m text; begin
  begin perform integ_overview('c1c1c1c1-0000-0000-0000-00000000000a'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik atau pengelola%' then raise exception 'B_GAGAL overview kasir: %', m; end if;
  m := null;
  begin perform integ_create('c1c1c1c1-0000-0000-0000-00000000000a', 'webhook_masuk', 'Percobaan kasir'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik atau pengelola%' then raise exception 'B_GAGAL create kasir: %', m; end if;
  raise notice 'b_OK: kasir ditolak';
end $$;
select set_config('request.jwt.claim.sub', :'LN', false) \g /dev/null
do $$ declare m text; begin
  begin perform integ_overview('c1c1c1c1-0000-0000-0000-00000000000a'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik atau pengelola%' then raise exception 'B_GAGAL overview orang luar: %', m; end if;
  m := null;
  begin perform integ_logs('c1c1c1c1-0000-0000-0000-00000000000a'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik atau pengelola%' then raise exception 'B_GAGAL logs orang luar: %', m; end if;
  raise notice 'b_OK: orang luar ditolak';
end $$;

\echo == C. Membuat sambungan: token acak, hanya hash yang tersimpan, tampil sekali
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select integ_create(:'A', 'webhook_masuk', 'Formulir web', '{}') as r \gset
select (:'r'::jsonb ->> 'token') as tok, (:'r'::jsonb ->> 'id') as cid \gset
select length(:'tok') = 52 c_panjang_52, :'tok' ~ '^prs_[0-9a-f]{48}$' c_format,
       not (integ_overview(:'A')::text like '%' || :'tok' || '%') c_ringkasan_tanpa_token,
       (select count(*) from jsonb_array_elements(integ_overview(:'A') -> 'connections')) = 1 c_satu_sambungan;
reset role;
select (select token_hash from integration_connections where id = :'cid') = encode(sha256(convert_to(:'tok', 'UTF8')), 'hex') c_hash_sha256,
       (select token_hint from integration_connections where id = :'cid') = right(:'tok', 4) c_petunjuk_4_huruf,
       not exists (select 1 from integration_connections where token_hash = :'tok' or token_hint = :'tok') c_token_asli_tidak_tersimpan;
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
do $$ declare m text; begin
  begin perform integ_create('c1c1c1c1-0000-0000-0000-00000000000a', 'webhook_masuk', 'formulir WEB'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Nama sambungan itu sudah dipakai%' then raise exception 'C_GAGAL nama ganda: %', m; end if;
  m := null;
  begin perform integ_create('c1c1c1c1-0000-0000-0000-00000000000a', 'webhook_masuk', 'X'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Beri nama sambungan%' then raise exception 'C_GAGAL nama pendek: %', m; end if;
  m := null;
  begin perform integ_create('c1c1c1c1-0000-0000-0000-00000000000a', 'whatsapp_api', 'WA resmi'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Jenis integrasi ini belum tersedia%' then raise exception 'C_GAGAL jenis rencana: %', m; end if;
  m := null;
  begin perform integ_create('c1c1c1c1-0000-0000-0000-00000000000a', 'webhook_masuk', 'Pemetaan salah', '{"umur":"x"}'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Kolom "umur" tidak dikenal%' then raise exception 'C_GAGAL kunci pemetaan: %', m; end if;
  m := null;
  begin perform integ_create('c1c1c1c1-0000-0000-0000-00000000000a', 'webhook_masuk', 'Pemetaan aneh', '{"name":"a;drop"}'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Nama kolom "a;drop" hanya boleh%' then raise exception 'C_GAGAL isi pemetaan: %', m; end if;
  m := null;
  begin perform integ_create('c1c1c1c1-0000-0000-0000-00000000000c', 'webhook_masuk', 'Tanpa CRM'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Aktifkan modul "Prospek%' then raise exception 'C_GAGAL tanpa CRM: %', m; end if;
  raise notice 'c_OK: validasi nama, jenis, pemetaan, dan modul CRM';
end $$;

\echo == D. Webhook masuk (tanpa pengguna, seperti kunci server)
reset role;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select hook_inbound(:'tok', 'ip1', '{"name":"Budi Santoso","phone":"0812-3456-7890","message":"Tanya harga grosir"}'::jsonb) as h \gset
select (:'h'::jsonb ->> 'ok')::boolean d1_ok, :'h'::jsonb ->> 'status' = '200' d1_status, :'h'::jsonb ->> 'number' like 'PRM-%' d1_nomor;
select :'h'::jsonb ->> 'number' as no1 \gset
select (select count(*) from crm_leads where kos_id = :'A' and source = 'webhook') = 1 d1_satu_prospek,
       (select name from crm_leads where number = :'no1') = 'Budi Santoso' d1_nama,
       (select phone from crm_leads where number = :'no1') = '081234567890' d1_telepon,
       (select need from crm_leads where number = :'no1') = 'Tanya harga grosir' d1_kebutuhan,
       (select consent_at is null and created_by is null and stage = 'baru' from crm_leads where number = :'no1') d1_tanpa_klaim_persetujuan,
       (select count(*) from crm_activities a join crm_leads l on l.id = a.lead_id where l.number = :'no1' and a.created_email = 'integrasi') = 1 d1_aktivitas,
       (select last_used_at is not null from integration_connections where id = :'cid') d1_terakhir_dipakai,
       (select count(*) from integration_logs where connection_id = :'cid' and outcome = 'ok' and ref = :'no1') = 1 d1_log_ok;

\echo -- D2 nomor sama (format berbeda) dalam 10 menit = satu prospek
select hook_inbound(:'tok', 'ip1', '{"name":"Budi","phone":"+62 812 3456 7890"}'::jsonb) as h \gset
select (:'h'::jsonb ->> 'duplicate')::boolean d2_duplikat, :'h'::jsonb ->> 'number' = :'no1' d2_nomor_sama,
       (select count(*) from crm_leads where kos_id = :'A' and source = 'webhook') = 1 d2_tetap_satu,
       (select count(*) from integration_logs where connection_id = :'cid' and outcome = 'duplikat') = 1 d2_log_duplikat;

\echo -- D3 kunci idempotensi
select hook_inbound(:'tok', 'ip1', '{"name":"Dewi","phone":"081355500002"}'::jsonb, 'abc-1') as h \gset
select :'h'::jsonb ->> 'number' as no3 \gset
select hook_inbound(:'tok', 'ip1', '{"name":"Dewi lagi","phone":"081355500099"}'::jsonb, 'abc-1') as h \gset
select (:'h'::jsonb ->> 'duplicate')::boolean d3_duplikat, :'h'::jsonb ->> 'number' = :'no3' d3_nomor_sama,
       (select count(*) from crm_leads where kos_id = :'A' and source = 'webhook') = 2 d3_dua_prospek,
       not exists (select 1 from crm_leads where phone = '081355500099') d3_tidak_membuat_kedua;

\echo -- D4 nama kolom umum (huruf besar/kecil), telepon bertipe angka, email
select hook_inbound(:'tok', 'ip1', '{"Nama":"Siti","HP":81355500001,"Pesan":"Booking kamar","Email":"s@x.com"}'::jsonb) as h \gset
select (:'h'::jsonb ->> 'ok')::boolean d4_ok,
       (select name || '|' || phone || '|' || need from crm_leads where number = (:'h'::jsonb ->> 'number')) = 'Siti|81355500001|Booking kamar · Email: s@x.com' d4_pemetaan_umum;

\echo -- D5 tanpa nama tetap diterima bila ada telepon
select hook_inbound(:'tok', 'ip1', '{"telepon":"085211112222"}'::jsonb) as h \gset
select (:'h'::jsonb ->> 'ok')::boolean d5_ok, (select name from crm_leads where number = (:'h'::jsonb ->> 'number')) = 'Tanpa nama' d5_nama_bawaan;

\echo -- D6-D8 kiriman tidak valid ditolak dan tercatat (tanpa isi data)
select count(*) as n0 from crm_leads where kos_id = :'A' \gset
select hook_inbound(:'tok', 'ip1', '{"name":"Andi","phone":"123"}'::jsonb) as h \gset
select :'h'::jsonb ->> 'status' = '400' d6_status, (select count(*) from crm_leads where kos_id = :'A') = :n0 d6_tidak_ada_prospek,
       (select detail like '%Kolom diterima: name, phone%' and detail not like '%Andi%' from integration_logs where connection_id = :'cid' and outcome = 'tidak_valid' order by id desc limit 1) d6_log_kolom_tanpa_isi;
select hook_inbound(:'tok', 'ip1', '{"foo":"bar","baz":1}'::jsonb) as h \gset
select :'h'::jsonb ->> 'status' = '400' d7_status, :'h'::jsonb ->> 'error' like '%baz, foo%' d7_menyebut_kolom, (select count(*) from crm_leads where kos_id = :'A') = :n0 d7_tidak_ada_prospek;
select hook_inbound(:'tok', 'ip1', '[1,2]'::jsonb) as h \gset
select :'h'::jsonb ->> 'status' = '400' d8_bukan_objek;
select hook_inbound(:'tok', 'ip1', null) as h \gset
select :'h'::jsonb ->> 'status' = '400' d8_kosong;

\echo -- D9 pemetaan kolom pilihan pemilik (termasuk bersarang)
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select integ_update(:'cid', 'Formulir web', '{"name":"nama_pelanggan","phone":"kontak.wa"}') \g /dev/null
reset role;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select hook_inbound(:'tok', 'ip1', '{"nama_pelanggan":"Rina","kontak":{"wa":"081300009999"},"name":"Salah"}'::jsonb) as h \gset
select (:'h'::jsonb ->> 'ok')::boolean d9_ok,
       (select name || '|' || phone from crm_leads where number = (:'h'::jsonb ->> 'number')) = 'Rina|081300009999' d9_pemetaan_pemilik_menang;

\echo -- D10 tautan salah: ditolak, dicatat tanpa bisnis, dibatasi per perangkat
select hook_inbound('prs_' || repeat('0', 48), 'ipX', '{}'::jsonb) as h \gset
select :'h'::jsonb ->> 'status' = '401' d10_status, (select count(*) from integration_logs where outcome = 'token_salah' and ip_hash = 'ipX' and kos_id is null) = 1 d10_log_tanpa_bisnis;
do $$ declare r jsonb; begin
  for i in 1..29 loop perform hook_inbound('prs_' || repeat('0', 48), 'ipX', '{}'::jsonb); end loop;
  r := hook_inbound('prs_' || repeat('0', 48), 'ipX', '{}'::jsonb);
  if r ->> 'status' <> '429' then raise exception 'D10_GAGAL batas percobaan: %', r; end if;
  if (select count(*) from integration_logs where outcome = 'token_salah' and ip_hash = 'ipX') <> 30 then raise exception 'D10_GAGAL log berhenti di 30'; end if;
  raise notice 'd10_OK: 30 percobaan salah dibatasi, log tidak membengkak';
end $$;
select hook_inbound(:'tok', 'ipX', '{"name":"Orang Sah","phone":"081377770001"}'::jsonb) as h \gset
select (:'h'::jsonb ->> 'ok')::boolean d10_tautan_benar_tetap_jalan;

\echo -- D11 jeda & aktifkan
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select integ_set_status(:'cid', false) \g /dev/null
reset role;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select hook_inbound(:'tok', 'ip1', '{"name":"Saat Jeda","phone":"081377770002"}'::jsonb) as h \gset
select :'h'::jsonb ->> 'status' = '409' d11_dijeda, not exists (select 1 from crm_leads where phone = '081377770002') d11_tidak_masuk,
       (select paused_at is not null from integration_connections where id = :'cid') d11_waktu_jeda;
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select integ_set_status(:'cid', true) \g /dev/null
reset role;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select hook_inbound(:'tok', 'ip1', '{"name":"Setelah Aktif","phone":"081377770003"}'::jsonb) as h \gset
select (:'h'::jsonb ->> 'ok')::boolean d11_aktif_lagi;

\echo -- D12 batas pemakaian: 60 kiriman/jam
insert into integration_logs(kos_id, connection_id, kind, outcome, ref) select :'A', :'cid', 'webhook_masuk', 'ok', 'PRM-FAKE' from generate_series(1, 60);
select hook_inbound(:'tok', 'ip1', '{"name":"Kebanyakan","phone":"081377770004"}'::jsonb) as h \gset
select hook_inbound(:'tok', 'ip1', '{"name":"Kebanyakan 2","phone":"081377770005"}'::jsonb) as h2 \gset
select :'h'::jsonb ->> 'status' = '429' d12_dibatasi, :'h2'::jsonb ->> 'status' = '429' d12_tetap_dibatasi,
       not exists (select 1 from crm_leads where phone in ('081377770004', '081377770005')) d12_tidak_masuk,
       (select count(*) from integration_logs where connection_id = :'cid' and outcome = 'dibatasi') = 1 d12_log_sekali;
delete from integration_logs where ref = 'PRM-FAKE' or outcome = 'dibatasi';

\echo -- D13 bisnis ditutup / ditangguhkan tidak menerima
update kos set closed_at = now() where id = :'A';
select hook_inbound(:'tok', 'ip1', '{"name":"Saat Tutup","phone":"081377770006"}'::jsonb) as h \gset
select :'h'::jsonb ->> 'status' = '403' d13_ditutup, not exists (select 1 from crm_leads where phone = '081377770006') d13_tidak_masuk;
update kos set closed_at = null where id = :'A';
update kos set suspended_at = now() where id = :'A';
select hook_inbound(:'tok', 'ip1', '{"name":"Saat Tangguh","phone":"081377770007"}'::jsonb) as h \gset
select :'h'::jsonb ->> 'status' = '403' d13_ditangguhkan;
update kos set suspended_at = null where id = :'A';
select hook_inbound(:'tok', 'ip1', '{"name":"Setelah Buka","phone":"081377770008"}'::jsonb) as h \gset
select (:'h'::jsonb ->> 'ok')::boolean d13_buka_lagi;

\echo -- D14 modul CRM nonaktif
insert into integration_connections(kos_id, kind, name, token_hash, token_hint) values (:'C', 'webhook_masuk', 'Tanpa CRM', integ_hash('prs_' || repeat('a', 48)), 'aaaa');
select hook_inbound('prs_' || repeat('a', 48), 'ip1', '{"name":"Tanpa CRM","phone":"081377770009"}'::jsonb) as h \gset
select :'h'::jsonb ->> 'status' = '403' d14_crm_nonaktif, not exists (select 1 from crm_leads where kos_id = :'C') d14_tidak_masuk;

\echo -- D15 ganti kode: tautan lama langsung mati
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select integ_rotate(:'cid') ->> 'token' as tok2 \gset
reset role;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select hook_inbound(:'tok', 'ip9', '{"name":"Lama","phone":"081377770010"}'::jsonb) as h \gset
select :'h'::jsonb ->> 'status' = '401' d15_lama_mati, :'tok2' <> :'tok' d15_baru_beda, :'tok2' ~ '^prs_[0-9a-f]{48}$' d15_format;
select hook_inbound(:'tok2', 'ip1', '{"name":"Baru","phone":"081377770011"}'::jsonb) as h \gset
select (:'h'::jsonb ->> 'ok')::boolean d15_baru_jalan, (select rotated_at is not null from integration_connections where id = :'cid') d15_waktu_ganti;

\echo == E. Isolasi antar bisnis & tabel tertutup
select count(*) = 0 e_prospek_tidak_bocor_ke_bisnis_lain from crm_leads where kos_id = :'B';
select set_config('uji.cid', :'cid', false) \g /dev/null
set role authenticated;
select set_config('request.jwt.claim.sub', :'LN', false) \g /dev/null
select jsonb_array_length(integ_overview(:'B') -> 'connections') = 0 e_bisnis_lain_tanpa_sambungan;
do $$ declare m text; cid uuid := current_setting('uji.cid')::uuid; begin
  begin perform integ_rotate(cid); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik atau pengelola%' then raise exception 'E_GAGAL rotate bisnis lain: %', m; end if;
  m := null;
  begin perform integ_delete(cid); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik atau pengelola%' then raise exception 'E_GAGAL delete bisnis lain: %', m; end if;
  m := null;
  begin perform integ_set_status(cid, false); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik atau pengelola%' then raise exception 'E_GAGAL status bisnis lain: %', m; end if;
  m := null;
  begin perform integ_update(cid, 'Dibajak', '{}'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik atau pengelola%' then raise exception 'E_GAGAL update bisnis lain: %', m; end if;
  raise notice 'e_OK: sambungan bisnis lain tidak bisa disentuh';
end $$;
reset role;
select not has_table_privilege('authenticated', 'integration_connections', 'select') e_tabel_sambungan_tertutup,
       not has_table_privilege('authenticated', 'integration_logs', 'select') e_tabel_log_tertutup,
       not has_table_privilege('authenticated', 'integration_catalog', 'select') e_tabel_katalog_tertutup,
       not has_table_privilege('anon', 'integration_connections', 'select') e_anon_tertutup,
       not has_function_privilege('authenticated', 'hook_inbound(text,text,jsonb,text)', 'execute') e_hook_bukan_untuk_pengguna,
       not has_function_privilege('anon', 'hook_inbound(text,text,jsonb,text)', 'execute') e_hook_bukan_untuk_anon,
       has_function_privilege('service_role', 'hook_inbound(text,text,jsonb,text)', 'execute') e_hook_untuk_server,
       not has_function_privilege('authenticated', 'integ_logs_purge()', 'execute') e_purge_bukan_untuk_pengguna,
       not has_function_privilege('authenticated', 'integ_guard(uuid)', 'execute') e_guard_internal,
       has_function_privilege('authenticated', 'integ_overview(uuid)', 'execute') e_overview_untuk_pengguna;
set role authenticated;
do $$ declare m text; begin
  begin perform hook_inbound('prs_' || repeat('0', 48), 'ipZ', '{}'::jsonb); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'permission denied%' then raise exception 'E_GAGAL pengguna memanggil hook: %', m; end if;
  raise notice 'e_OK: pengguna biasa tidak bisa memanggil webhook langsung';
end $$;

\echo == F. Batas 5 sambungan, dan bisnis ditutup menolak pengaturan
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select integ_create(:'A', 'webhook_masuk', 'S2') is not null f_s2, integ_create(:'A', 'webhook_masuk', 'S3') is not null f_s3,
       integ_create(:'A', 'webhook_masuk', 'S4') is not null f_s4, integ_create(:'A', 'webhook_masuk', 'S5') is not null f_s5;
do $$ declare m text; begin
  begin perform integ_create('c1c1c1c1-0000-0000-0000-00000000000a', 'webhook_masuk', 'S6'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Maksimal 5 sambungan%' then raise exception 'F_GAGAL batas: %', m; end if;
  raise notice 'f_OK: batas 5 sambungan';
end $$;
reset role;
update kos set closed_at = now() where id = :'A';
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
do $$ declare m text; begin
  begin perform integ_set_status(current_setting('uji.cid')::uuid, false); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like '%sudah ditutup%' then raise exception 'F_GAGAL bisnis ditutup: %', m; end if;
  raise notice 'f_OK: bisnis ditutup menolak ubah sambungan';
end $$;
reset role;
update kos set closed_at = null where id = :'A';

\echo == G. Hapus sambungan: tautan mati, riwayat tetap ada
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select integ_delete(:'cid') \g /dev/null
reset role;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select hook_inbound(:'tok2', 'ip1', '{"name":"Setelah Hapus","phone":"081377770012"}'::jsonb) as h \gset
select :'h'::jsonb ->> 'status' = '401' g_tautan_mati, not exists (select 1 from crm_leads where phone = '081377770012') g_tidak_masuk,
       (select count(*) from integration_logs where kos_id = :'A' and connection_id is null and outcome = 'ok') >= 5 g_riwayat_tetap_ada,
       (select count(*) from crm_leads where kos_id = :'A' and source = 'webhook') >= 5 g_prospek_tetap_ada;
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
select jsonb_array_length(integ_logs(:'A', null, 100)) >= 5 g_logs_terbaca_pemilik,
       (select count(*) from jsonb_array_elements(integ_logs(:'A', null, 3))) = 3 g_batas_limit,
       not (integ_logs(:'A', null, 100)::text like '%' || :'tok' || '%') and not (integ_logs(:'A', null, 100)::text like '%081234567890%') and not (integ_logs(:'A', null, 100)::text like '%Budi%') g_log_tanpa_token_dan_data;

\echo == H. Jejak audit tanpa kode rahasia
reset role;
select (select count(*) from config_history where kos_id = :'A' and action = 'integrasi_buat') >= 5 h_buat,
       exists (select 1 from config_history where kos_id = :'A' and action = 'integrasi_token_baru') h_token_baru,
       exists (select 1 from config_history where kos_id = :'A' and action = 'integrasi_jeda') h_jeda,
       exists (select 1 from config_history where kos_id = :'A' and action = 'integrasi_aktif') h_aktif,
       exists (select 1 from config_history where kos_id = :'A' and action = 'integrasi_ubah') h_ubah,
       exists (select 1 from config_history where kos_id = :'A' and action = 'integrasi_hapus') h_hapus,
       not exists (select 1 from config_history where kos_id = :'A' and (coalesce(before::text, '') like '%prs\_%' or coalesce(after::text, '') like '%prs\_%' or coalesce(reason, '') like '%prs\_%')) h_tanpa_token;

\echo == I. Sumber prospek: nilai asing tetap ditolak
do $$ declare m text; begin
  begin insert into crm_leads(kos_id, name, source) values ('c1c1c1c1-0000-0000-0000-00000000000a', 'Uji Sumber', 'asing'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like '%crm_leads_source_check%' then raise exception 'I_GAGAL sumber asing diterima: %', m; end if;
  raise notice 'i_OK: sumber asing ditolak';
end $$;

\echo == J. Pembersihan log & pemantauan Super Admin
delete from integration_logs;
insert into integration_logs(kos_id, outcome, created_at) values (:'A', 'ok', now() - interval '70 days'), (:'A', 'ok', now() - interval '3 days');
insert into integration_logs(outcome, ip_hash, created_at) values ('token_salah', 'old', now() - interval '8 days'), ('token_salah', 'new', now() - interval '2 days');
select integ_logs_purge() = 2 j_hapus_2;
select (select count(*) from integration_logs) = 2 j_sisa_2,
       exists (select 1 from integration_logs where ip_hash = 'new') j_percobaan_baru_tetap;
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false) \g /dev/null
do $$ declare m text; begin
  begin perform admin_integration_overview(); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tidak punya izin%' then raise exception 'J_GAGAL pemilik bisnis melihat ringkasan admin: %', m; end if;
  raise notice 'j_OK: pemilik bisnis bukan staf platform';
end $$;
select set_config('request.jwt.claim.sub', :'SU', false) \g /dev/null
select (admin_integration_overview() -> 'sambungan' ->> 'total')::int >= 5 j_admin_total,
       (admin_integration_overview() -> 'h7' ->> 'ok')::int = 1 j_admin_h7_ok,
       (admin_integration_overview() -> 'h7' ->> 'token_salah')::int = 1 j_admin_h7_salah,
       not (admin_integration_overview()::text like '%prs\_%') j_admin_tanpa_token,
       not (admin_integration_overview()::text like '%Budi%') j_admin_tanpa_data_pelanggan;
