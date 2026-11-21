-- Uji penawaran proyek & perubahan scope (Tahap 1B). Jalankan di database baru berisi semua migrasi:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/proyek_penawaran.sql"
-- Lulus = semua kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email,raw_user_meta_data) values
  ('f1f1f1f1-0000-0000-0000-000000000001','agensi@x.com','{"name":"Pemilik Agensi"}'), ('f1f1f1f1-0000-0000-0000-000000000002','opr@x.com','{}'),
  ('f1f1f1f1-0000-0000-0000-000000000003','lain@x.com','{}') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,category_code) values
  ('f1f1f1f1-0000-0000-0000-00000000000a','Agensi Kreatif','f1f1f1f1-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','jasa','media'),
  ('f1f1f1f1-0000-0000-0000-00000000000b','Lain','f1f1f1f1-0000-0000-0000-000000000003','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','jasa','media');
insert into kos_members(kos_id,user_id,role) values
  ('f1f1f1f1-0000-0000-0000-00000000000a','f1f1f1f1-0000-0000-0000-000000000001','pemilik'),
  ('f1f1f1f1-0000-0000-0000-00000000000a','f1f1f1f1-0000-0000-0000-000000000002','operator'),
  ('f1f1f1f1-0000-0000-0000-00000000000b','f1f1f1f1-0000-0000-0000-000000000003','pemilik');
\set K 'f1f1f1f1-0000-0000-0000-00000000000a'
\set OWN 'f1f1f1f1-0000-0000-0000-000000000001'
\set OPR 'f1f1f1f1-0000-0000-0000-000000000002'
\set LAIN 'f1f1f1f1-0000-0000-0000-000000000003'
set role authenticated;
select set_config('request.jwt.claim.sub', :'OWN', false), set_config('request.jwt.claims', '{"sub":"f1f1f1f1-0000-0000-0000-000000000001","email":"agensi@x.com"}', false) \g /dev/null

\echo == A. Buat penawaran: total dihitung server, termin persen dibulatkan ke termin terakhir
select prj_quote_save(:'K', null, jsonb_build_object('title', 'Video profil PT Maju', 'project_kind', 'kreatif', 'client_name', 'PT Maju Jaya', 'client_phone', '0811',
  'valid_until', current_date + 14, 'start_date', current_date + 3, 'end_date', current_date + 30, 'revision_limit', 2, 'extra_revision', 'Revisi ke-3 dst Rp 500.000/revisi',
  'scope_in', 'Konsep, 1 hari shooting, editing 2 menit', 'scope_out', 'Talent & sewa lokasi', 'discount', 1000,
  'lines', jsonb_build_array(jsonb_build_object('description', 'Produksi video 2 menit', 'qty', 1, 'unit', 'paket', 'price', 10000000),
                             jsonb_build_object('description', 'Drone', 'qty', 1, 'unit', 'hari', 'price', 1500000)),
  'terms', jsonb_build_array(jsonb_build_object('name', 'DP', 'pct', 33.3), jsonb_build_object('name', 'Draft video', 'pct', 33.3), jsonb_build_object('name', 'Final', 'pct', 33.4)))) as q1 \gset
select set_config('t.q1', :'q1', false) \g /dev/null
reset role;
select number like 'PNW-____-001' and status = 'draf' and subtotal = 11500000 and discount = 1000 and total = 11499000 a_total,
       (select sum((x->>'amount')::numeric) from jsonb_array_elements(terms) x) = total a_termin_tepat_total,
       (terms->0->>'amount')::numeric = 3829167 a_pembulatan,
       (select count(*) from prj_quote_lines where quote_id = q.id) = 2 a_baris,
       (select name from contacts where id = q.contact_id) = 'PT Maju Jaya' a_klien_baru,
       project_id is null a_belum_ada_proyek
from prj_quotes q where id = :'q1';
set role authenticated;
do $$ declare m text; begin
  begin perform prj_quote_save('f1f1f1f1-0000-0000-0000-00000000000a', null, jsonb_build_object('title', 'Salah termin', 'lines', '[{"description":"x","qty":1,"price":100}]'::jsonb,
    'terms', '[{"name":"DP","pct":50},{"name":"Lunas","pct":40}]'::jsonb)); exception when others then m := sqlerrm; end;
  if m like '%harus 100%%' then raise notice 'A_PERSEN_100_OK'; else raise warning 'GAGAL A persen: %', m; end if;
  m := null;
  begin perform prj_quote_save('f1f1f1f1-0000-0000-0000-00000000000a', null, jsonb_build_object('title', 'Salah nominal', 'lines', '[{"description":"x","qty":1,"price":100}]'::jsonb,
    'terms', '[{"name":"DP","amount":50},{"name":"Lunas","amount":40}]'::jsonb)); exception when others then m := sqlerrm; end;
  if m like '%harus sama dengan total%' then raise notice 'A_NOMINAL_TOTAL_OK'; else raise warning 'GAGAL A nominal: %', m; end if;
  m := null;
  begin perform prj_quote_save('f1f1f1f1-0000-0000-0000-00000000000a', null, jsonb_build_object('title', 'Tanpa baris', 'lines', '[]'::jsonb)); exception when others then m := sqlerrm; end;
  if m like '%minimal satu baris%' then raise notice 'A_BARIS_WAJIB_OK'; else raise warning 'GAGAL A baris: %', m; end if;
  m := null;
  begin perform prj_quote_save('f1f1f1f1-0000-0000-0000-00000000000a', null, jsonb_build_object('title', 'Potongan', 'discount', 999, 'lines', '[{"description":"x","qty":1,"price":100}]'::jsonb)); exception when others then m := sqlerrm; end;
  if m like '%Potongan%' then raise notice 'A_POTONGAN_OK'; else raise warning 'GAGAL A potongan: %', m; end if;
end $$;

\echo == B. Kirim, lalu revisi: nomor revisi naik, isi lama tersimpan, kembali ke draf
select prj_quote_send(:'q1');
select prj_quote_save(:'K', :'q1', jsonb_build_object('title', 'Video profil PT Maju', 'contact_id', (prj_quote_get(:'q1')->>'contact_id'),
  'valid_until', current_date + 14, 'revision_limit', 2, 'scope_in', 'Konsep, 1 hari shooting, editing 2 menit',
  'lines', jsonb_build_array(jsonb_build_object('description', 'Produksi video 2 menit', 'qty', 1, 'unit', 'paket', 'price', 9000000)),
  'terms', jsonb_build_array(jsonb_build_object('name', 'DP', 'amount', 4500000), jsonb_build_object('name', 'Final', 'amount', 4500000)))) is not null b_revisi;
select (x->>'revision')::int = 1 and x->>'status' = 'draf' and (x->>'total')::numeric = 9000000
       and jsonb_array_length(x->'history') = 1 and (x->'history'->0->>'total')::numeric = 11499000 b_riwayat_revisi
from (select prj_quote_get(:'q1') x) z;
select prj_quote_send(:'q1');

\echo == C. Operator (bukan keuangan/pengaturan) tidak bisa melihat atau membuat penawaran
select set_config('request.jwt.claim.sub', :'OPR', false) \g /dev/null
do $$ declare m text; begin
  begin perform prj_quote_list('f1f1f1f1-0000-0000-0000-00000000000a'); exception when others then m := sqlerrm; end;
  if m like '%Penawaran hanya untuk%' then raise notice 'C_OPERATOR_LIST_OK'; else raise warning 'GAGAL C list: %', m; end if;
  m := null;
  begin perform prj_quote_get(current_setting('t.q1')::uuid); exception when others then m := sqlerrm; end;
  if m like '%Penawaran hanya untuk%' then raise notice 'C_OPERATOR_GET_OK'; else raise warning 'GAGAL C get: %', m; end if;
end $$;
select set_config('request.jwt.claim.sub', :'LAIN', false) \g /dev/null
do $$ declare m text; begin
  begin perform prj_quote_decide(current_setting('t.q1')::uuid, 'disetujui', '{}'); exception when others then m := sqlerrm; end;
  if m is not null then raise notice 'C_BISNIS_LAIN_OK'; else raise warning 'GAGAL C bisnis lain bisa memutuskan'; end if;
end $$;

\echo == D. Disetujui klien → proyek dibuat dengan nilai, jadwal, batas revisi, milestone termin
select set_config('request.jwt.claim.sub', :'OWN', false) \g /dev/null
select (prj_quote_decide(:'q1', 'disetujui', jsonb_build_object('client_approver', 'Bu Rina (Marketing PT Maju)'))->>'project_id') as p1 \gset
select set_config('t.p1', :'p1', false) \g /dev/null
select x->>'status' = 'berjalan' and (x->>'value')::numeric = 9000000 and (x->>'revision_limit')::int = 2 and x->>'quote_id' = :'q1'
       and x->>'kind' = 'kreatif' and x->>'client' = 'PT Maju Jaya' and x->>'number' like 'PRJ-____-001' d_proyek_dibuat,
       jsonb_array_length(x->'milestones') = 2 and (select sum((m->>'amount')::numeric) from jsonb_array_elements(x->'milestones') m) = 9000000 d_milestone_termin,
       jsonb_array_length(x->'quotes') = 1 d_penawaran_di_proyek
from (select prj_get(:'p1') x) z;
reset role;
select status = 'disetujui' and client_approver = 'Bu Rina (Marketing PT Maju)' and client_approved_on = (now() at time zone 'Asia/Jakarta')::date d_dicatat from prj_quotes where id = :'q1';
set role authenticated;
do $$ declare m text; begin
  begin perform prj_quote_save('f1f1f1f1-0000-0000-0000-00000000000a', current_setting('t.q1')::uuid, '{"title":"ubah setelah setuju","lines":[{"description":"x","qty":1,"price":1}]}'); exception when others then m := sqlerrm; end;
  if m like '%sudah disetujui%' then raise notice 'D_TERKUNCI_OK'; else raise warning 'GAGAL D terkunci: %', m; end if;
  m := null;
  begin perform prj_quote_save('f1f1f1f1-0000-0000-0000-00000000000a', null, jsonb_build_object('title', 'Awal kedua', 'project_id', current_setting('t.p1'), 'lines', '[{"description":"x","qty":1,"price":1}]'::jsonb)); exception when others then m := sqlerrm; end;
  if m like '%Perubahan scope%' then raise notice 'D_AWAL_DOBEL_OK'; else raise warning 'GAGAL D awal dobel: %', m; end if;
end $$;

\echo == E. Perubahan scope: nilai bertambah, batas revisi bertambah, tanggal selesai bergeser, termin tambahan
select prj_quote_save(:'K', null, jsonb_build_object('kind', 'perubahan', 'project_id', :'p1', 'title', 'Tambahan versi 30 detik untuk Instagram',
  'end_date', current_date + 45, 'revision_limit', 1, 'scope_in', 'Potongan 30 detik format 9:16',
  'lines', jsonb_build_array(jsonb_build_object('description', 'Edit versi 30 detik', 'qty', 2, 'unit', 'video', 'price', 750000)),
  'terms', jsonb_build_array(jsonb_build_object('name', 'Pelunasan tambahan', 'pct', 100)))) as c1 \gset
select prj_quote_send(:'c1');
select (prj_quote_decide(:'c1', 'disetujui', '{}')->>'milestones')::int = 1 e_termin;
select (x->>'value')::numeric = 10500000 and (x->>'revision_limit')::int = 3 and (x->>'end_date')::date = current_date + 45 e_proyek_bertambah,
       jsonb_array_length(x->'quotes') = 2 e_dua_penawaran,
       exists (select 1 from jsonb_array_elements(x->'milestones') m where m->>'name' like 'Perubahan PNW-%' and (m->>'amount')::numeric = 1500000) e_milestone_perubahan
from (select prj_get(:'p1') x) z;

\echo == F. Penawaran untuk proyek berstatus penawaran → proyek dijalankan; penawaran ditolak & dibatalkan
select prj_save(:'K', null, '{"name":"Branding Kopi Senja","kind":"kreatif","status":"penawaran"}') as p2 \gset
select prj_quote_save(:'K', null, jsonb_build_object('project_id', :'p2', 'title', 'Branding Kopi Senja', 'valid_until', current_date - 1,
  'lines', jsonb_build_array(jsonb_build_object('description', 'Logo & panduan merek', 'qty', 1, 'price', 6000000)))) as q2 \gset
select (prj_quote_decide(:'q2', 'disetujui', '{}')->>'expired')::boolean f_lewat_masa_tetap_boleh;
select prj_get(:'p2')->>'status' = 'berjalan' and (prj_get(:'p2')->>'value')::numeric = 6000000 f_proyek_dijalankan;
select prj_quote_save(:'K', null, jsonb_build_object('title', 'Foto produk', 'lines', '[{"description":"Foto 20 produk","qty":20,"unit":"foto","price":75000}]'::jsonb)) as q3 \gset
select prj_quote_decide(:'q3', 'ditolak', '{"note":"Harga di atas anggaran klien"}')->>'project_id' is null f_ditolak_tanpa_proyek;
select prj_quote_save(:'K', null, jsonb_build_object('title', 'Dokumentasi seminar', 'lines', '[{"description":"Foto","qty":1,"price":2000000}]'::jsonb)) as q4 \gset
select set_config('t.q4', :'q4', false) \g /dev/null
do $$ declare m text; begin
  begin perform prj_quote_cancel(current_setting('t.q4')::uuid, ''); exception when others then m := sqlerrm; end;
  if m like '%alasan%' then raise notice 'F_BATAL_ALASAN_OK'; else raise warning 'GAGAL F: %', m; end if;
  m := null;
  begin perform prj_quote_decide(current_setting('t.q4')::uuid, 'disetujui', jsonb_build_object('client_approved_on', current_date + 3)); exception when others then m := sqlerrm; end;
  if m like '%masa depan%' then raise notice 'F_TANGGAL_DEPAN_OK'; else raise warning 'GAGAL F tanggal: %', m; end if;
end $$;
select prj_quote_cancel(:'q4', 'Klien membatalkan acara');
select (select count(*) from jsonb_array_elements(prj_quote_list(:'K')->'quotes') x where x->>'status' = 'batal') = 1 f_batal_tercatat;

\echo == G. Riwayat: peristiwa penawaran ber-area keuangan, tidak tampil untuk operator
reset role;
select count(*) filter (where event_type = 'QuoteApproved') = 2 and count(*) filter (where event_type = 'ChangeApproved') = 1
       and count(*) filter (where event_type = 'QuoteRevised') = 1 and bool_and(area = 'finance') g_peristiwa
from (select * from domain_events where kos_id = :'K' and event_type like 'Quote%' or kos_id = :'K' and event_type like 'Change%') e;
set role authenticated;
select set_config('request.jwt.claim.sub', :'OPR', false) \g /dev/null
select not exists (select 1 from jsonb_array_elements(prj_get(:'p1')->'history') h where h->>'label' like 'Penawaran%' or h->>'label' like 'Perubahan%') g_operator_tanpa_nilai,
       prj_get(:'p1')->'quotes' = 'null'::jsonb g_operator_tanpa_daftar_penawaran;
select set_config('request.jwt.claim.sub', :'OWN', false) \g /dev/null
select exists (select 1 from jsonb_array_elements(prj_get(:'p1')->'history') h where h->>'label' = 'Perubahan scope disetujui') g_pemilik_lihat;

\echo == H. Paket turun: penawaran tetap terbaca, membuat & memutuskan ditolak
reset role;
update kos set plan = 'dasar' where id = :'K';
set role authenticated;
select jsonb_array_length(prj_quote_list(:'K')->'quotes') = 5 h_tetap_terbaca;
do $$ declare m text; begin
  begin perform prj_quote_save('f1f1f1f1-0000-0000-0000-00000000000a', null, '{"title":"Baru","lines":[{"description":"x","qty":1,"price":1}]}'); exception when others then m := sqlerrm; end;
  if m like 'BATAS_PAKET:%' then raise notice 'H_BUAT_DITOLAK_OK'; else raise warning 'GAGAL H: %', m; end if;
end $$;
