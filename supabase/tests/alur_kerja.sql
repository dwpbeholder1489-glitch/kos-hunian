-- Uji Fase 4 Alur kerja (migrasi 20261121120000). Database baru:
-- psql -p 5499 -h /var/tmp/pgtest -U postgres -d <db> -f supabase/tests/alur_kerja.sql
-- Lulus = semua kolom t, notice *_OK, tanpa *_GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values
  ('a1a1a1a1-0000-0000-0000-000000000001','pemilik@x.com'), ('a1a1a1a1-0000-0000-0000-000000000002','kasir@x.com'),
  ('a1a1a1a1-0000-0000-0000-000000000003','operator@x.com'), ('a1a1a1a1-0000-0000-0000-000000000004','lain@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,category_code,subcategory_code,template_code) values
  ('a1a1a1a1-0000-0000-0000-00000000000a','Laundry Bersih','a1a1a1a1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','jasa','laundry','laundry_laundry','laundry'),
  ('a1a1a1a1-0000-0000-0000-00000000000b','Laundry Dasar','a1a1a1a1-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 30,'active','jasa','laundry','laundry_laundry','laundry'),
  ('a1a1a1a1-0000-0000-0000-00000000000c','Jasa Umum','a1a1a1a1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','jasa','profesional',null,'jasa_umum'),
  ('a1a1a1a1-0000-0000-0000-00000000000d','Toko Uji','a1a1a1a1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','retail','retail',null,'toko'),
  ('a1a1a1a1-0000-0000-0000-00000000000e','Kos Uji','a1a1a1a1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','properti','properti',null,'kos'),
  ('a1a1a1a1-0000-0000-0000-00000000000f','Kontraktor Uji','a1a1a1a1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','kustom','konstruksi',null,'bb_proyek'),
  ('a1a1a1a1-0000-0000-0000-000000000010','Event Draf','a1a1a1a1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'draft','kustom','event',null,'bb_event');
insert into kos_members(kos_id,user_id,role)
select k, 'a1a1a1a1-0000-0000-0000-000000000001', 'pemilik' from unnest(array['a1a1a1a1-0000-0000-0000-00000000000a','a1a1a1a1-0000-0000-0000-00000000000b','a1a1a1a1-0000-0000-0000-00000000000c',
  'a1a1a1a1-0000-0000-0000-00000000000d','a1a1a1a1-0000-0000-0000-00000000000e','a1a1a1a1-0000-0000-0000-00000000000f','a1a1a1a1-0000-0000-0000-000000000010']::uuid[]) k;
insert into kos_members(kos_id,user_id,role) values
  ('a1a1a1a1-0000-0000-0000-00000000000a','a1a1a1a1-0000-0000-0000-000000000002','kasir'),
  ('a1a1a1a1-0000-0000-0000-00000000000b','a1a1a1a1-0000-0000-0000-000000000002','kasir'),
  ('a1a1a1a1-0000-0000-0000-00000000000f','a1a1a1a1-0000-0000-0000-000000000003','operator');
insert into svc_stages(kos_id, name, sort) values ('a1a1a1a1-0000-0000-0000-00000000000a','Cuci',1), ('a1a1a1a1-0000-0000-0000-00000000000a','Setrika',2),
  ('a1a1a1a1-0000-0000-0000-00000000000b','Cuci',1), ('a1a1a1a1-0000-0000-0000-00000000000c','Dijadwalkan',1), ('a1a1a1a1-0000-0000-0000-00000000000c','Dikerjakan',2);
select bb_seed_template('a1a1a1a1-0000-0000-0000-00000000000f', 'bb_proyek') \g /dev/null
update bb_workspace set status = 'aktif' where kos_id = 'a1a1a1a1-0000-0000-0000-00000000000f';
select bb_seed_template('a1a1a1a1-0000-0000-0000-000000000010', 'bb_event') \g /dev/null
\set J 'a1a1a1a1-0000-0000-0000-00000000000a'
\set J2 'a1a1a1a1-0000-0000-0000-00000000000b'
\set U 'a1a1a1a1-0000-0000-0000-00000000000c'
\set R 'a1a1a1a1-0000-0000-0000-00000000000d'
\set P 'a1a1a1a1-0000-0000-0000-00000000000e'
\set C 'a1a1a1a1-0000-0000-0000-00000000000f'
\set E 'a1a1a1a1-0000-0000-0000-000000000010'
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","email":"pemilik@x.com"}', false) \g /dev/null

\echo == A. Peta proses laundry: tahap periksa & cek kualitas belum diatur
select svc_service_save(:'J', null, jsonb_build_object('name','Cuci kiloan','unit','kg','price',7000)) as svc \gset
select svc_order_create(gen_random_uuid(), :'J', jsonb_build_object('name','Ani','lines', jsonb_build_array(jsonb_build_object('service_id', :'svc', 'qty', 3)))) ->> 'id' as o1 \gset
select process_map(:'J') as pm \gset
select :'pm'::jsonb->0->>'code' = 'laundry' a_peta_laundry,
       (select x->>'state' from jsonb_array_elements(:'pm'::jsonb->0->'steps') x where x->>'key' = 'terima') = 'berjalan' a_terima_berjalan,
       (select x->>'state' from jsonb_array_elements(:'pm'::jsonb->0->'steps') x where x->>'key' = 'periksa') = 'belum_diatur' a_periksa_belum_diatur,
       (select x->>'state' from jsonb_array_elements(:'pm'::jsonb->0->'steps') x where x->>'key' = 'qc') = 'belum_diatur' a_qc_belum_diatur;

\echo == B. Saran template, pakai template + aturan, versi
select (select count(*) from jsonb_array_elements(workflow_recommendations(:'J')) x where x->>'code' = 'template' and x->'action'->>'code' = 'laundry_kiloan') = 1 b_saran_template;
select (wf_template_apply(:'J', 'laundry_kiloan', true)->>'rules_added')::int = 1 b_aturan_ditambah;
select string_agg(name, ',' order by sort) filter (where active) = 'Timbang & cek,Cuci,Kering,Setrika & lipat,Cek kualitas,Kemas' b_tahap_template,
       string_agg(name, ',') filter (where not active) = 'Setrika' b_tahap_lama_dinonaktifkan from svc_stages where kos_id = :'J';
select count(*) = 2 b_dua_versi, bool_or(version = 1 and reason like 'Versi awal%') b_versi_awal from workflow_versions where kos_id = :'J' and workflow = 'svc_order';
select (select x->>'state' from jsonb_array_elements(process_map(:'J')->0->'steps') x where x->>'key' = 'qc') <> 'belum_diatur' b_qc_kini_diatur;
select (select count(*) from jsonb_array_elements(workflow_recommendations(:'J')) x where x->>'code' in ('template', 'qc')) = 0 b_saran_hilang;

\echo == C. Aturan ditegakkan untuk karyawan, pemilik dikecualikan, persetujuan per alur
select svc_order_create(gen_random_uuid(), :'J', jsonb_build_object('name','Budi','lines', jsonb_build_array(jsonb_build_object('service_id', :'svc', 'qty', 2)))) ->> 'id' as o2 \gset
select svc_order_create(gen_random_uuid(), :'J', jsonb_build_object('name','Cici','lines', jsonb_build_array(jsonb_build_object('service_id', :'svc', 'qty', 2)))) ->> 'id' as o3 \gset
select wf_rule_save(:'J', jsonb_build_object('workflow','svc_order','point','serahkan','name','Wajib lunas','action','tolak','cond', jsonb_build_object('belum_lunas', true),
  'message','Pesanan harus lunas sebelum diserahkan.')) is not null c_aturan_tolak;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000002","email":"kasir@x.com"}', false) \g /dev/null
select svc_order_move(:'o2', 'next', null) ->> 'stage' = 'Timbang & cek' c_kasir_tahap_biasa;
do $$ declare m text; begin
  begin perform svc_order_move((select id from svc_orders where customer_name = 'Budi'), 'siap', null); exception when others then m := sqlerrm; end;
  if coalesce(m, '') like 'PERLU_PERSETUJUAN: Aturan "Persetujuan bila melewati tahap"%' then raise notice 'c_OK: lewati tahap perlu persetujuan'; else raise notice 'c_GAGAL: %', m; end if;
end $$;
select approval_request(:'J', 'langkah_pesanan_jasa', jsonb_build_object('order_id', :'o2', 'to', 'siap'), 'pelanggan buru-buru') as ap \gset
reset role; select summary like 'Langkah pesanan % → langsung siap' c_ringkasan from approvals where id = :'ap'; set role authenticated;
select status = 'proses' c_belum_berubah from svc_orders where id = :'o2';
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","email":"pemilik@x.com"}', false) \g /dev/null
select approval_decide(:'ap', true, 'ok') ->> 'status' = 'dijalankan' c_disetujui;
select status = 'siap' c_siap_setelah_disetujui from svc_orders where id = :'o2';
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000002","email":"kasir@x.com"}', false) \g /dev/null
do $$ declare m text; begin
  begin perform svc_order_move((select id from svc_orders where customer_name = 'Budi'), 'selesai', null); exception when others then m := sqlerrm; end;
  if coalesce(m, '') = 'ATURAN_ALUR: Pesanan harus lunas sebelum diserahkan.' then raise notice 'c_OK: belum lunas ditolak'; else raise notice 'c_GAGAL: %', m; end if;
end $$;
select svc_payment_add(gen_random_uuid(), :'o2', 14000, 'tunai', 'bayar') is not null c_bayar;
select svc_order_move(:'o2', 'selesai', 'Budi') ->> 'status' = 'selesai' c_lunas_boleh;
reset role;
-- pemilik: boleh langsung siap & serahkan belum lunas (dikecualikan)
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","email":"pemilik@x.com"}', false) \g /dev/null
select svc_order_move(:'o3', 'siap', null) ->> 'status' = 'siap' and svc_order_move(:'o3', 'selesai', null) ->> 'status' = 'selesai' c_pemilik_dikecualikan;
-- wajib catatan
select wf_rule_save(:'J', jsonb_build_object('workflow','svc_order','point','serahkan','name','Catat penerima','action','catatan')) is not null c_aturan_catatan;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000002","email":"kasir@x.com"}', false) \g /dev/null
select svc_payment_add(gen_random_uuid(), :'o1', 21000, 'tunai', 'bayar') is not null c_bayar_o1;
do $$ declare m text; o uuid := (select id from svc_orders where customer_name = 'Ani'); begin
  perform svc_order_move(o, 'next', null); perform svc_order_move(o, 'next', null); perform svc_order_move(o, 'next', null);
  perform svc_order_move(o, 'next', null); perform svc_order_move(o, 'next', null); perform svc_order_move(o, 'next', null); perform svc_order_move(o, 'next', null);
  begin perform svc_order_move(o, 'selesai', null); exception when others then m := sqlerrm; end;
  if coalesce(m, '') like 'ATURAN_ALUR: Aturan "Catat penerima" mewajibkan catatan%' then raise notice 'c_OK: catatan wajib'; else raise notice 'c_GAGAL: %', m; end if;
end $$;
select status = 'siap' c_tahap_lengkap_tanpa_persetujuan from svc_orders where id = :'o1';
select svc_order_move(:'o1', 'selesai', 'Diambil Ani') ->> 'status' = 'selesai' c_dengan_catatan;
do $$ begin perform workflow_registry('a1a1a1a1-0000-0000-0000-00000000000a'); raise notice 'c_GAGAL: kasir melihat registry';
  exception when others then raise notice 'c_OK: kasir tidak bisa membuka alur'; end $$;
do $$ begin perform wf_rule_save('a1a1a1a1-0000-0000-0000-00000000000a', '{"workflow":"svc_order","point":"batal","name":"X","action":"tolak"}'); raise notice 'c_GAGAL: kasir membuat aturan';
  exception when others then raise notice 'c_OK: kasir tidak bisa membuat aturan'; end $$;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","email":"pemilik@x.com"}', false) \g /dev/null

\echo == D. Validasi & paket
do $$ begin perform wf_rule_save('a1a1a1a1-0000-0000-0000-00000000000b', '{"workflow":"svc_order","point":"serahkan","name":"Perlu izin","action":"persetujuan"}');
  raise notice 'd_GAGAL: persetujuan di paket Dasar'; exception when others then
  if sqlerrm like 'BATAS_PAKET:%' then raise notice 'd_OK: %', sqlerrm; else raise notice 'd_GAGAL: %', sqlerrm; end if; end $$;
select wf_rule_save(:'J2', '{"workflow":"svc_order","point":"batal","name":"Tidak boleh batal sudah bayar","action":"tolak","cond":{"sudah_bayar":true}}') is not null d_tolak_paket_dasar;
do $$ begin perform wf_rule_save('a1a1a1a1-0000-0000-0000-00000000000a', '{"workflow":"svc_order","point":"lewati_tahap","name":"Catatan","action":"catatan"}');
  raise notice 'd_GAGAL: catatan untuk lewati tahap'; exception when others then raise notice 'd_OK: %', sqlerrm; end $$;
do $$ begin perform wf_rule_save('a1a1a1a1-0000-0000-0000-00000000000a', '{"workflow":"svc_order","point":"batal","name":"Aneh","action":"tolak","cond":{"belum_lunas":true}}');
  raise notice 'd_GAGAL: syarat tak tersedia diterima'; exception when others then raise notice 'd_OK: %', sqlerrm; end $$;
do $$ begin perform wf_rule_save('a1a1a1a1-0000-0000-0000-00000000000d', '{"workflow":"sale","point":"batal","name":"Toko","action":"tolak"}');
  raise notice 'd_GAGAL: aturan di alur standar'; exception when others then raise notice 'd_OK: %', sqlerrm; end $$;
select (select count(*) from jsonb_array_elements(approval_rules_list(:'J')) x where x->>'code' = 'langkah_pesanan_jasa') = 0 d_tidak_di_sakelar_persetujuan;
-- batal: aturan bersyarat menggantikan sakelar bawaan (pemilik mematikan bawaan, menahan batal yang sudah dibayar)
select approval_rule_set(:'J', 'batal_pesanan_jasa', false) d_matikan_bawaan;
select approval_required(:'J', 'batal_pesanan_jasa') = false d_bawaan_mati;
select wf_rule_save(:'J', '{"workflow":"svc_order","point":"batal","name":"Batal sudah bayar","action":"tolak","cond":{"sudah_bayar":true}}') is not null d_aturan_batal;
select svc_order_create(gen_random_uuid(), :'J', jsonb_build_object('name','Dodi','lines', jsonb_build_array(jsonb_build_object('service_id', :'svc', 'qty', 2)))) ->> 'id' as o4 \gset
select svc_order_create(gen_random_uuid(), :'J', jsonb_build_object('name','Eka','lines', jsonb_build_array(jsonb_build_object('service_id', :'svc', 'qty', 2)))) ->> 'id' as o5 \gset
select svc_payment_add(gen_random_uuid(), :'o4', 5000, 'tunai', 'bayar') is not null d_bayar_dp;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000002","email":"kasir@x.com"}', false) \g /dev/null
do $$ declare m text; begin
  begin perform svc_order_cancel((select id from svc_orders where customer_name = 'Dodi'), 'salah input'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') like 'ATURAN_ALUR: Langkah ini tidak diizinkan oleh aturan "Batal sudah bayar"%' then raise notice 'd_OK: batal sudah bayar ditolak'; else raise notice 'd_GAGAL: %', m; end if;
end $$;
select svc_order_cancel(:'o5', 'salah input') ->> 'refund_due' = '0' d_batal_belum_bayar_boleh;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","email":"pemilik@x.com"}', false) \g /dev/null

\echo == E. Pulihkan versi awal
select id as v1 from workflow_versions where kos_id = :'J' and workflow = 'svc_order' and version = 1 \gset
select wf_restore(:'J', :'v1') > 3 e_versi_baru;
select string_agg(name, ',' order by sort) filter (where active) = 'Cuci,Setrika' e_tahap_awal from svc_stages where kos_id = :'J';
select count(*) = 0 e_aturan_awal from workflow_rules where kos_id = :'J';
select (select jsonb_agg(x) from jsonb_array_elements((select definition->'stages' from workflow_versions where id = :'v1')) x where (x->>'active')::boolean)
     = (select jsonb_agg(x) from jsonb_array_elements(wf_definition(:'J', 'svc_order')->'stages') x where (x->>'active')::boolean) e_tahap_aktif_sama;

\echo == F. Catatan kustom: syarat isian & total, Builder tidak menghapus aturan
select id as op from bb_objects where kos_id = :'C' and key = 'proyek' \gset
select id as s_done from bb_statuses where object_id = :'op' and label = 'Selesai' \gset
select id as okl from bb_objects where kos_id = :'C' and key = 'klien' \gset
select bb_record_save(gen_random_uuid(), :'C', :'okl', '{"nama":"Pak Budi"}', null) ->> 'id' as klien \gset
select bb_record_save(gen_random_uuid(), :'C', :'op', jsonb_build_object('nama_proyek','Rumah A','klien',:'klien','nilai',400000000,'progres',60), null) ->> 'id' as p1 \gset
select bb_record_move(:'p1', (select id from bb_statuses where object_id = :'op' and label = 'Penawaran'), null) is not null
   and bb_record_move(:'p1', (select id from bb_statuses where object_id = :'op' and label = 'Dikerjakan'), null) is not null
   and bb_record_move(:'p1', (select id from bb_statuses where object_id = :'op' and label = 'Serah terima'), null) is not null f_ke_serah_terima;
select wf_rule_save(:'C', jsonb_build_object('workflow','bb:' || :'op','point', :'s_done','name','Progres harus 100','action','tolak',
  'cond', jsonb_build_object('fields', jsonb_build_array(jsonb_build_object('key','progres','op','<','value',100))))) is not null f_aturan_isian;
select wf_rule_save(:'C', jsonb_build_object('workflow','bb:' || :'op','point', :'s_done','name','Proyek besar','action','catatan',
  'cond', jsonb_build_object('fields', jsonb_build_array(jsonb_build_object('key','nilai','op','>=','value',100000000))))) is not null f_aturan_nilai;
select (select money_field from bb_objects where id = :'op') = 'nilai' f_kolom_uang,
       wf_rule_save(:'C', jsonb_build_object('workflow','bb:' || :'op','point', :'s_done','name','Total besar (nonaktif)','action','tolak','active',false,
         'cond', '{"total_min":5}'::jsonb)) is not null f_syarat_total_tersedia;
do $$ begin perform wf_rule_save('a1a1a1a1-0000-0000-0000-00000000000f', jsonb_build_object('workflow','bb:' || (select id from bb_objects where kos_id = 'a1a1a1a1-0000-0000-0000-00000000000f' and key = 'proyek'),
    'point', (select s.id from bb_statuses s join bb_objects o on o.id = s.object_id where o.kos_id = 'a1a1a1a1-0000-0000-0000-00000000000f' and o.key = 'proyek' and s.label = 'Selesai'),
    'name','Teks','action','tolak','cond', '{"fields":[{"key":"nama_proyek","op":">","value":5}]}'::jsonb));
  raise notice 'f_GAGAL: pembanding angka untuk teks'; exception when others then raise notice 'f_OK: %', sqlerrm; end $$;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000003', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000003","email":"operator@x.com"}', false) \g /dev/null
\set QUIET on
select set_config('uji.p1', :'p1', false), set_config('uji.sd', :'s_done', false) \g /dev/null
\set QUIET off
do $$ declare m text; begin
  begin perform bb_record_move(current_setting('uji.p1')::uuid, current_setting('uji.sd')::uuid, 'beres');
  exception when others then m := sqlerrm; end;
  if coalesce(m, '') like 'ATURAN_ALUR: Langkah ini tidak diizinkan oleh aturan "Progres harus 100"%' then raise notice 'f_OK: progres kurang ditolak'; else raise notice 'f_GAGAL: %', m; end if;
end $$;
select bb_record_save(:'p1', :'C', :'op', jsonb_build_object('nama_proyek','Rumah A','klien',:'klien','nilai',400000000,'progres',100), null) is not null f_progres_100;
do $$ declare m text; begin
  begin perform bb_record_move(current_setting('uji.p1')::uuid, current_setting('uji.sd')::uuid, null);
  exception when others then m := sqlerrm; end;
  if coalesce(m, '') like 'ATURAN_ALUR: Aturan "Proyek besar" mewajibkan catatan%' then raise notice 'f_OK: proyek besar wajib catatan'; else raise notice 'f_GAGAL: %', m; end if;
end $$;
select bb_record_move(:'p1', :'s_done', 'serah terima beres') ->> 'status' = 'Selesai' f_lolos;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","email":"pemilik@x.com"}', false) \g /dev/null
-- Builder menyimpan ulang alur: aturan tetap (terikat pada status, bukan langkah)
select id as v_bb1 from workflow_versions where kos_id = :'C' and workflow = 'bb:' || :'op' and version = 1 \gset
select wf_restore(:'C', :'v_bb1') is not null f_pulihkan_bb;
select count(*) = 0 f_aturan_bb_kembali_awal from workflow_rules where kos_id = :'C';
select (select count(*) from bb_transitions where object_id = :'op') = (select jsonb_array_length(definition->'transitions') from workflow_versions where id = :'v_bb1') f_langkah_utuh;
select (select x->>'code' from jsonb_array_elements(process_map(:'C')) x limit 1) = 'konstruksi' f_peta_konstruksi,
       (select y->>'state' from jsonb_array_elements(process_map(:'C')->0->'steps') y where y->>'key' = 'serah') = 'berjalan' f_serah_terima_tercatat;
select (select count(*) from jsonb_array_elements(workflow_registry(:'C')) x where x->>'kind' = 'kustom' and x->>'code' = 'bb:' || :'op') = 1 f_registry_kustom;

\echo == G. Saran: cek kualitas, terima = tahap ditambah; tolak tidak muncul lagi
select (select count(*) from jsonb_array_elements(workflow_recommendations(:'U')) x where x->>'code' = 'qc') = 1 g_saran_qc;
select workflow_reco_decide(:'U', 'qc', 'terima') ->> 'ok' = 'true' g_terima;
select bool_or(name = 'Cek kualitas' and active) g_tahap_qc_ada from svc_stages where kos_id = :'U';
select (select count(*) from jsonb_array_elements(workflow_recommendations(:'U')) x where x->>'code' = 'qc') = 0 g_qc_hilang;
select workflow_reco_decide(:'J2', 'template', 'tolak', 'belum perlu') ->> 'ok' = 'true' g_tolak;
select (select count(*) from jsonb_array_elements(workflow_recommendations(:'J2')) x where x->>'code' = 'template') = 0 g_tolak_tidak_muncul;
do $$ begin perform workflow_reco_decide('a1a1a1a1-0000-0000-0000-00000000000b', 'template', 'tolak');
  raise notice 'g_GAGAL: saran yang sudah ditolak diputuskan lagi'; exception when others then raise notice 'g_OK: %', sqlerrm; end $$;

\echo == H. Registry & peta jenis bisnis lain
select (select string_agg(x->>'code', ',') from jsonb_array_elements(workflow_registry(:'R')) x) = 'sale,so_order,purchase_request,purchase,supplier_invoice,stock_transfer' h_toko_standar;
select (select string_agg(x->>'code', ',') from jsonb_array_elements(workflow_registry(:'P')) x) = 'booking,lease,payment,maint_ticket' h_kos_standar;
select (select string_agg(x->>'code', ',') from jsonb_array_elements(process_map(:'R')) x) = 'retail_jual,retail_grosir' h_peta_toko,
       (select string_agg(x->>'code', ',') from jsonb_array_elements(process_map(:'P')) x) = 'properti' h_peta_kos;
reset role; update business_modules set active = false where kos_id = :'P' and module_code = 'p_booking'; set role authenticated;
select (select x->>'state' from jsonb_array_elements(process_map(:'P')->0->'steps') x where x->>'key' = 'booking') = 'nonaktif' h_booking_nonaktif,
       (select string_agg(x->>'code', ',') from jsonb_array_elements(workflow_registry(:'P')) x) = 'lease,payment,maint_ticket' h_registry_ikut_modul;
select (select string_agg(x->>'l', '>') from jsonb_array_elements(workflow_detail(:'J', 'svc_order')->'statuses') x) = 'Permintaan (halaman bisnis)>Diterima>Cuci>Setrika>Siap>Diserahkan>Batal' h_status_dengan_tahap;
select jsonb_array_length(workflow_detail(:'J', 'svc_order')->'versions') >= 4 h_riwayat_versi, jsonb_array_length(workflow_history(:'J')->'versions') >= 4 h_riwayat;

\echo == I. Bisnis lain tidak bisa membaca
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000004', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000004","email":"lain@x.com"}', false) \g /dev/null
do $$ begin perform process_map('a1a1a1a1-0000-0000-0000-00000000000a'); raise notice 'i_GAGAL: orang lain membuka peta';
  exception when others then raise notice 'i_OK: %', sqlerrm; end $$;
select count(*) = 0 i_aturan_tersembunyi from workflow_rules where kos_id = :'J2';
select count(*) = 0 i_versi_tersembunyi from workflow_versions;

\echo == J. Bisnis draf: alur Builder & aturan boleh disusun sebelum aktif
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","email":"pemilik@x.com"}', false) \g /dev/null
select id as oa from bb_objects where kos_id = :'E' and key = 'acara' \gset
select wf_rule_save(:'E', jsonb_build_object('workflow','bb:' || :'oa','point', (select id from bb_statuses where object_id = :'oa' and label = 'Batal'),
  'name','Alasan batal','action','catatan')) is not null j_aturan_draf;
select id as ve1 from workflow_versions where kos_id = :'E' and version = 1 \gset
select wf_restore(:'E', :'ve1') is not null j_pulihkan_draf;
reset role;
