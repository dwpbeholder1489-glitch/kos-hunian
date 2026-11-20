-- Uji Fase 3 Dashboard adaptif (migrasi 20261121110000). Database baru:
-- psql -p 5499 -h /var/tmp/pgtest -U postgres -d <db> -f supabase/tests/adaptive_dashboard.sql
-- Lulus = semua kolom t, notice *_OK, tanpa *_GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('dbdbdbdb-0000-0000-0000-000000000001','toko@x.com'), ('dbdbdbdb-0000-0000-0000-000000000002','kasir@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,category_code) values
  ('dbdbdbdb-0000-0000-0000-00000000000a','Toko Uji','dbdbdbdb-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail','retail');
insert into kos_members(kos_id,user_id,role) values ('dbdbdbdb-0000-0000-0000-00000000000a','dbdbdbdb-0000-0000-0000-000000000001','pemilik'),
  ('dbdbdbdb-0000-0000-0000-00000000000a','dbdbdbdb-0000-0000-0000-000000000002','kasir');
\set K 'dbdbdbdb-0000-0000-0000-00000000000a'
insert into products(id, kos_id, name, base_unit, cost, stock, active) values
  ('dbdbdbdb-0000-0000-0000-0000000000b1', :'K', 'Beras 5kg', 'karung', 60000, 0, true),
  ('dbdbdbdb-0000-0000-0000-0000000000b2', :'K', 'Gula 1kg', 'pcs', 15000, 0, true),
  ('dbdbdbdb-0000-0000-0000-0000000000b3', :'K', 'Minyak 1L', 'pcs', 17000, 0, true);
-- penerimaan barang: beras naik 60.000 → 66.000 (10%), gula tetap, minyak hanya sekali
insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, created_at) values
  (:'K', 'dbdbdbdb-0000-0000-0000-0000000000b1', 'beli', 10, 10, 600000, now() - interval '20 days'),
  (:'K', 'dbdbdbdb-0000-0000-0000-0000000000b1', 'beli', 5, 15, 330000, now() - interval '2 days'),
  (:'K', 'dbdbdbdb-0000-0000-0000-0000000000b2', 'beli', 10, 10, 150000, now() - interval '20 days'),
  (:'K', 'dbdbdbdb-0000-0000-0000-0000000000b2', 'beli', 10, 20, 150000, now() - interval '1 days'),
  (:'K', 'dbdbdbdb-0000-0000-0000-0000000000b3', 'beli', 12, 12, 204000, now() - interval '1 days');
set role authenticated;
select set_config('request.jwt.claim.sub', 'dbdbdbdb-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"dbdbdbdb-0000-0000-0000-000000000001","email":"toko@x.com"}', false) \g /dev/null

\echo == A. Harga modal berubah
select jsonb_array_length(cost_changes(:'K', 30)) = 1 a_hanya_beras, (cost_changes(:'K', 30)->0->>'pct')::numeric = 10 a_naik_10persen,
       (cost_changes(:'K', 30)->0->>'old')::numeric = 60000 and (cost_changes(:'K', 30)->0->>'new')::numeric = 66000 a_harga_lama_baru;
select jsonb_array_length(cost_changes(:'K', 1)) = 0 a_batas_hari;

\echo == B. KPI & periode dashboard tersimpan & tervalidasi
select experience_save(:'K', 'dash', '{"toko":{"hidden":["mulai"],"order":["kpi"],"kpis":["omzet","margin","piutang"],"period":"7hari"}}') ->> 'changed' = 'true' b_simpan;
select dash->'toko'->>'period' = '7hari' b_periode, dash->'toko'->'kpis' = '["omzet","margin","piutang"]' b_kpi_urut from experience_configs where kos_id = :'K';
select experience_save(:'K', 'dash', '{"toko":{"hidden":[],"order":[]}}') ->> 'changed' = 'true' b_tanpa_kpi;
select not (dash->'toko' ? 'kpis') and not (dash->'toko' ? 'period') b_kosong_bawaan from experience_configs where kos_id = :'K';
do $$ begin perform experience_save('dbdbdbdb-0000-0000-0000-00000000000a', 'dash', '{"toko":{"period":"tahun"}}');
  raise notice 'b_GAGAL: periode tak dikenal diterima'; exception when others then raise notice 'b_OK: %', sqlerrm; end $$;
do $$ begin perform experience_save('dbdbdbdb-0000-0000-0000-00000000000a', 'dash', '{"toko":{"kpis":["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q"]}}');
  raise notice 'b_GAGAL: >16 KPI diterima'; exception when others then raise notice 'b_OK: %', sqlerrm; end $$;

\echo == C. Izin
select set_config('request.jwt.claim.sub', 'dbdbdbdb-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"dbdbdbdb-0000-0000-0000-000000000002","email":"kasir@x.com"}', false) \g /dev/null
do $$ begin perform cost_changes('dbdbdbdb-0000-0000-0000-00000000000a', 30);
  raise notice 'c_GAGAL: kasir melihat harga modal'; exception when others then raise notice 'c_OK: %', sqlerrm; end $$;
reset role;

\echo == D. Konstruksi: progres rata-rata & realisasi vs RAB dari data nyata
insert into kos(id, name, owner_id, business_type, setup_status, category_code, template_code, plan, paid_until) values
  ('dbdbdbdb-0000-0000-0000-00000000000c', 'Kontraktor Uji', 'dbdbdbdb-0000-0000-0000-000000000001', 'kustom', 'active', 'konstruksi', 'bb_proyek', 'pro', (now() at time zone 'Asia/Jakarta')::date + 20);
insert into kos_members(kos_id,user_id,role) values ('dbdbdbdb-0000-0000-0000-00000000000c','dbdbdbdb-0000-0000-0000-000000000001','pemilik');
select bb_seed_template('dbdbdbdb-0000-0000-0000-00000000000c', 'bb_proyek');
update bb_workspace set status = 'aktif' where kos_id = 'dbdbdbdb-0000-0000-0000-00000000000c';
\set C 'dbdbdbdb-0000-0000-0000-00000000000c'
select string_agg(key, ',' order by sort) = 'klien,proyek,rab,material,tenaga' d_jenis_data from bb_objects where kos_id = :'C';
set role authenticated;
select set_config('request.jwt.claim.sub', 'dbdbdbdb-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"dbdbdbdb-0000-0000-0000-000000000001","email":"toko@x.com"}', false) \g /dev/null
select id as ok from bb_objects where kos_id = :'C' and key = 'klien' \gset
select id as op from bb_objects where kos_id = :'C' and key = 'proyek' \gset
select id as orab from bb_objects where kos_id = :'C' and key = 'rab' \gset
select id as omat from bb_objects where kos_id = :'C' and key = 'material' \gset
select id as oten from bb_objects where kos_id = :'C' and key = 'tenaga' \gset
select bb_record_save(gen_random_uuid(), :'C', :'ok', '{"nama":"Pak Budi"}', null) ->> 'id' as klien \gset
select bb_record_save(gen_random_uuid(), :'C', :'op', jsonb_build_object('nama_proyek','Rumah Tipe 60','klien',:'klien','nilai',400000000,'progres',60), null) ->> 'id' as p1 \gset
select bb_record_save(gen_random_uuid(), :'C', :'op', jsonb_build_object('nama_proyek','Renovasi Dapur','klien',:'klien','nilai',50000000,'progres',80), null) ->> 'id' as p2 \gset
-- pindahkan kedua proyek ke "Dikerjakan" (Survei → Penawaran → Dikerjakan)
reset role;
do $$ declare r record; s1 uuid; s2 uuid; begin
  select s.id into s1 from bb_statuses s join bb_objects o on o.id = s.object_id where o.kos_id = 'dbdbdbdb-0000-0000-0000-00000000000c' and o.key = 'proyek' and s.label = 'Penawaran';
  select s.id into s2 from bb_statuses s join bb_objects o on o.id = s.object_id where o.kos_id = 'dbdbdbdb-0000-0000-0000-00000000000c' and o.key = 'proyek' and s.label = 'Dikerjakan';
  for r in select id from bb_records where kos_id = 'dbdbdbdb-0000-0000-0000-00000000000c' and object_id = (select id from bb_objects where kos_id = 'dbdbdbdb-0000-0000-0000-00000000000c' and key = 'proyek') loop
    perform bb_record_move(r.id, s1, null); perform bb_record_move(r.id, s2, null);
  end loop;
end $$;
set role authenticated;
select bb_record_save(gen_random_uuid(), :'C', :'orab', jsonb_build_object('proyek',:'p1','pekerjaan','Struktur','anggaran',200000000), null) is not null,
       bb_record_save(gen_random_uuid(), :'C', :'orab', jsonb_build_object('proyek',:'p1','pekerjaan','Finishing','anggaran',120000000), null) is not null,
       bb_record_save(gen_random_uuid(), :'C', :'omat', jsonb_build_object('proyek',:'p1','tanggal',current_date::text,'nama','Semen 50 sak','total',150000000), null) is not null,
       bb_record_save(gen_random_uuid(), :'C', :'oten', jsonb_build_object('proyek',:'p1','nama','Tukang A','upah',65000000), null) is not null;
select bb_home(:'C') as h \gset
select (select (x->>'value')::numeric from jsonb_array_elements(:'h'::jsonb->'kpis') x where x->>'label' = 'Progres rata-rata') = 70 d_progres_70,
       (select x->>'suffix' from jsonb_array_elements(:'h'::jsonb->'kpis') x where x->>'label' = 'Progres rata-rata') = '%' d_suffix,
       (select (x->>'value')::numeric = 215000000 and (x->>'total')::numeric = 320000000 and (x->>'pct')::numeric = 67.2 from jsonb_array_elements(:'h'::jsonb->'kpis') x where x->>'label' = 'Realisasi vs RAB') d_realisasi_vs_rab,
       (select (x->>'value')::numeric from jsonb_array_elements(:'h'::jsonb->'kpis') x where x->>'label' = 'Proyek berjalan') = 2 d_proyek_berjalan,
       jsonb_array_length(:'h'::jsonb->'create') = 4 d_buat_4_jenis;
reset role;
