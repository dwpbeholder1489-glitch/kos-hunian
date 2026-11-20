-- Uji "Bisnis kustom siap pakai" (migrasi 20261120100000). Jalankan di database baru:
-- psql -p 5499 -h /var/tmp/pgtest -U postgres -d <db> -f supabase/tests/kustom_siap_pakai.sql
-- Lulus = semua kolom bernilai t dan baris NOTICE *_OK, tanpa *_GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('c9c9c9c9-0000-0000-0000-000000000001','eo@x.com'), ('c9c9c9c9-0000-0000-0000-000000000002','kru@x.com') on conflict do nothing;
select set_config('request.jwt.claim.sub', 'c9c9c9c9-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000001","email":"eo@x.com"}', false) \g /dev/null

\echo == A. Daftar sebagai Event Organizer → tampilan siap pakai terpasang (bukan kosong)
select setup_create('{"name":"EO Ceria","category":"event","subcategory":"event_eo","relation":"pemilik","stage":"berjalan"}') as k \gset
select w.template = 'bb_event' a_template, w.status = 'draft' a_masih_draf, w.layout ? 'kpis' a_layout_terisi,
       (select string_agg(key, ',' order by sort) from bb_objects where kos_id = :'k') a_jenis_data,
       bb_ready(:'k') a_siap
from bb_workspace w where kos_id = :'k';
select label = 'Tampilan & alur kerja siap pakai' a_label_baru, complete a_lengkap from setup_items where kos_id = :'k' and input = 'builder';

\echo == B. Aktifkan dari Pusat Konfirmasi TANPA membuka Business Builder
-- pemilik mengisi informasi wajib (alamat & WhatsApp bisnis) — sama seperti di layar Pusat Konfirmasi
select setup_item_save(:'k', 'alamat', '{"v":"Jl. Merdeka 1, Majalengka"}', 'simpan') is not null, setup_item_save(:'k', 'wa', '{"v":"081234567890"}', 'simpan') is not null;
do $$ declare it record; begin
  for it in select * from setup_items where kos_id = (select id from kos where name = 'EO Ceria') and input <> 'builder' and status not in ('approved', 'active') and complete loop
    perform setup_item_save(it.kos_id, it.code, null, 'setujui', null);
  end loop;
end $$;
select setup_refresh(:'k') = 'approved' b_siap_aktif;
select setup_activate(:'k') is not null b_aktivasi_jalan;
select setup_status = 'active' b_bisnis_aktif from kos where id = :'k';
select status = 'aktif' b_workspace_aktif from bb_workspace where kos_id = :'k';

\echo == C. Langsung bisa mencatat & dashboard per jenis usaha terisi dari data nyata
select id as oklien from bb_objects where kos_id = :'k' and key = 'klien' \gset
select id as oacara from bb_objects where kos_id = :'k' and key = 'acara' \gset
select id as otugas from bb_objects where kos_id = :'k' and key = 'tugas' \gset
select bb_record_save(gen_random_uuid(), :'k', :'oklien', '{"nama":"Budi & Ani","no_hp":"08123456789"}', null) ->> 'id' as klien \gset
select bb_record_save(gen_random_uuid(), :'k', :'oacara', jsonb_build_object('nama_acara','Resepsi Budi & Ani','klien',:'klien','tanggal',((now() at time zone 'Asia/Jakarta')::date + 3)::text,'nilai',25000000,'paket','Premium'), null) ->> 'id' as acara \gset
select bb_record_save(gen_random_uuid(), :'k', :'oacara', jsonb_build_object('nama_acara','Ulang tahun Caca','klien',:'klien','tanggal',((now() at time zone 'Asia/Jakarta')::date + 40)::text,'nilai',5000000), null) is not null c_acara_kedua;
select bb_record_save(gen_random_uuid(), :'k', :'otugas', jsonb_build_object('tugas','Booking dekorasi','acara',:'acara','tenggat',((now() at time zone 'Asia/Jakarta')::date - 1)::text,'pj','Rina'), null) is not null c_tugas;
select bb_home(:'k') as h \gset
select (:'h'::jsonb ->> 'layout')::boolean c_layout,
  (select (x->>'value')::numeric from jsonb_array_elements(:'h'::jsonb->'kpis') x where x->>'label' = 'Penawaran berjalan') = 2 c_penawaran_2,
  (select (x->>'value')::numeric from jsonb_array_elements(:'h'::jsonb->'kpis') x where x->>'label' = 'Acara 7 hari ke depan') = 1 c_7hari_1,
  (select (x->>'value')::numeric from jsonb_array_elements(:'h'::jsonb->'kpis') x where x->>'label' = 'Tugas terlambat') = 1 c_tugas_terlambat_1,
  (select x->'rows'->0->>'title' from jsonb_array_elements(:'h'::jsonb->'lists') x where x->>'title' = 'Acara terdekat') = 'Resepsi Budi & Ani' c_terdekat_urut,
  (select x->'rows'->0->'show'->0->>2 from jsonb_array_elements(:'h'::jsonb->'lists') x where x->>'title' = 'Acara terdekat') = 'Budi & Ani' c_referensi_jadi_nama,
  jsonb_array_length(:'h'::jsonb->'create') = 3 c_tombol_buat;

\echo == D. Karyawan operator: kotak uang & field uang tidak terlihat
insert into kos_members(kos_id, user_id, role) values (:'k', 'c9c9c9c9-0000-0000-0000-000000000002', 'operator') on conflict do nothing;
select set_config('request.jwt.claim.sub', 'c9c9c9c9-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000002","email":"kru@x.com"}', false) \g /dev/null
select bb_home(:'k') as h2 \gset
select not exists (select 1 from jsonb_array_elements(:'h2'::jsonb->'kpis') x where (x->>'money')::boolean and x->>'label' like 'Nilai%') d_tanpa_nilai_kontrak,
  not exists (select 1 from jsonb_array_elements(:'h2'::jsonb->'lists') l, jsonb_array_elements(l->'rows') r, jsonb_array_elements(r->'show') s where s->>1 = 'currency') d_tanpa_rupiah;
do $$ declare m text; begin
  begin perform bb_use_template((select id from kos where name = 'EO Ceria'), 'bb_klinik'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik%' then raise exception 'D_GAGAL ganti template oleh karyawan: %', m; end if; raise notice 'd_OK: karyawan tidak bisa mengganti template';
end $$;

\echo == E. Ganti template hanya sebelum ada catatan; "Usaha lain" bisa memilih template siap pakai
select set_config('request.jwt.claim.sub', 'c9c9c9c9-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000001","email":"eo@x.com"}', false) \g /dev/null
do $$ declare m text; begin
  begin perform bb_use_template((select id from kos where name = 'EO Ceria'), 'bb_klinik'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Template hanya bisa diganti sebelum%' then raise exception 'E_GAGAL ada catatan: %', m; end if; raise notice 'e_OK: template tidak diganti bila sudah ada catatan';
end $$;
select setup_create('{"name":"Usaha Pak Joko","category":"lainnya","subcategory":"lainnya_lain","relation":"pemilik","stage":"baru"}') as k2 \gset
select template = 'kosong' e_awal_kosong, layout is null e_tanpa_layout from bb_workspace where kos_id = :'k2';
select jsonb_array_length(bb_templates()) >= 12 e_daftar_template;
select bb_use_template(:'k2', 'bengkel') ->> 'template' = 'bengkel' e_pakai_bengkel;
select template = 'bengkel' e_template, layout ? 'kpis' e_layout, status = 'draft' e_tetap_draf_sampai_aktivasi,
  (select count(*) from bb_objects where kos_id = :'k2') = 3 e_tiga_jenis_data, not exists (select 1 from bb_objects where kos_id = :'k2' and key = 'pekerjaan') e_kosong_terhapus
from bb_workspace where kos_id = :'k2';

\echo == F. Bengkel aktif: status di tata letak cocok dengan template
select setup_item_save(:'k2', 'alamat', '{"v":"Jl. Raya 2"}', 'simpan') is not null, setup_item_save(:'k2', 'wa', '{"v":"081234567891"}', 'simpan') is not null;
do $$ declare it record; begin
  for it in select * from setup_items where kos_id = (select id from kos where name = 'Usaha Pak Joko') and input <> 'builder' and status not in ('approved', 'active') and complete loop
    perform setup_item_save(it.kos_id, it.code, null, 'setujui', null);
  end loop;
end $$;
select setup_activate(:'k2') is not null f_aktif;
select bb_home(:'k2') as h3 \gset
select jsonb_array_length(:'h3'::jsonb->'kpis') = 4 f_empat_kotak, jsonb_array_length(:'h3'::jsonb->'lists') = 2 f_dua_daftar,
  (select bool_and(exists (select 1 from bb_statuses s join bb_objects o on o.id = s.object_id where o.kos_id = :'k2' and o.key = 'servis' and s.label = st))
   from jsonb_array_elements_text(bb_layout_default('bengkel')->'kpis'->0->'status') st) f_status_cocok;

\echo == G. Semua template: kotak/daftar merujuk jenis data, field, dan status yang benar-benar ada di template
do $$ declare t record; k uuid; x jsonb; bad text := ''; begin
  for t in select code from biz_templates where engine = 'kustom' and code <> 'kosong' loop
    insert into kos(name, owner_id, business_type, setup_status) values ('Uji ' || t.code, 'c9c9c9c9-0000-0000-0000-000000000001', 'kustom', 'active') returning id into k;
    perform bb_seed_template(k, t.code);
    for x in select * from jsonb_array_elements(coalesce((select layout->'kpis' from bb_workspace where kos_id = k), '[]') || coalesce((select layout->'lists' from bb_workspace where kos_id = k), '[]')) loop
      if not exists (select 1 from bb_objects where kos_id = k and key = x->>'object') then bad := bad || t.code || ':' || (x->>'object') || ' '; continue; end if;
      if x ? 'field' and not exists (select 1 from bb_fields f join bb_objects o on o.id = f.object_id where o.kos_id = k and o.key = x->>'object' and f.key = x->>'field') then bad := bad || t.code || ':' || (x->>'field') || ' '; end if;
      if x ? 'date' and left(x->>'date', 1) <> '@' and not exists (select 1 from bb_fields f join bb_objects o on o.id = f.object_id where o.kos_id = k and o.key = x->>'object' and f.key = x->>'date' and f.type in ('date', 'datetime')) then bad := bad || t.code || ':date ' || (x->>'date') || ' '; end if;
      if exists (select 1 from jsonb_array_elements_text(coalesce(x->'status', '[]') || coalesce(x->'not', '[]')) st where not exists (select 1 from bb_statuses s join bb_objects o on o.id = s.object_id where o.kos_id = k and o.key = x->>'object' and s.label = st)) then bad := bad || t.code || ':status ' || (x->>'object') || ' '; end if;
      if exists (select 1 from jsonb_array_elements_text(coalesce(x->'show', '[]')) sh where not exists (select 1 from bb_fields f join bb_objects o on o.id = f.object_id where o.kos_id = k and o.key = x->>'object' and f.key = sh)) then bad := bad || t.code || ':show ' || (x->>'object') || ' '; end if;
    end loop;
    if (select layout from bb_workspace where kos_id = k) is null then bad := bad || t.code || ':tanpa_layout '; end if;
    if not coalesce((select bool_and(exists (select 1 from bb_objects where kos_id = k and key = c)) from jsonb_array_elements_text((select layout->'create' from bb_workspace where kos_id = k)) c), true) then bad := bad || t.code || ':create '; end if;
  end loop;
  if bad <> '' then raise exception 'G_GAGAL: %', bad; end if;
  raise notice 'g_OK: semua tata letak template konsisten';
end $$;
