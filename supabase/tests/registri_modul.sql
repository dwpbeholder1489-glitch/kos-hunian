-- Uji Module Registry V2. Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/registri_modul.sql"
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('b8b8b8b8-0000-0000-0000-000000000001','registri@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('b8b8b8b8-0000-0000-0000-00000000000a','Toko Registri','b8b8b8b8-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values ('b8b8b8b8-0000-0000-0000-00000000000a','b8b8b8b8-0000-0000-0000-000000000001','pemilik') on conflict do nothing;
\set K 'b8b8b8b8-0000-0000-0000-00000000000a'
select set_config('request.jwt.claim.sub', 'b8b8b8b8-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"b8b8b8b8-0000-0000-0000-000000000001"}', false) \g /dev/null

\echo == A. Katalog: AI dihentikan & tidak tampil; modul rencana = dalam_rencana; fitur lama terdaftar & aktif
select module_catalog(:'K') as c \gset
select not exists (select 1 from jsonb_array_elements(:'c'::jsonb) m where m ->> 'code' = 'u_asisten') a_tanpa_ai,
       (select m ->> 'activation' from jsonb_array_elements(:'c'::jsonb) m where m ->> 'code' = 'u_pajak') a_pajak,
       (select m ->> 'activation' from jsonb_array_elements(:'c'::jsonb) m where m ->> 'code' = 'u_analisis') a_analisis,
       (select m ->> 'module_type' from jsonb_array_elements(:'c'::jsonb) m where m ->> 'code' = 'r_kasir') a_jenis_kasir,
       (select count(*) from jsonb_array_elements(:'c'::jsonb) m where m ->> 'impl_status' is null) = 0 a_semua_berstatus;
do $$ declare m text; begin
  begin perform module_set('b8b8b8b8-0000-0000-0000-00000000000a', 'u_pajak', true, null); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Modul ini belum tersedia%' then raise exception 'A_GAGAL rencana: %', m; end if; raise notice 'a_OK: modul dalam rencana tidak bisa diaktifkan';
end $$;

\echo == B. Dampak menonaktifkan
select module_impact(:'K', 'r_barang') ->> 'can_disable' b_barang_inti_tidak_bisa, module_impact(:'K', 'r_shift') ->> 'can_disable' b_shift_bisa,
       module_impact(:'K', 'r_shift') -> 'menus_hidden' b_menu_shift;
select jsonb_array_length(module_impact(:'K', 'r_kontak') -> 'dependents_active') b_kontak_dependen;

\echo == C. Status sinkron & bisnis baru tidak mendapat modul rencana
reset role;
update modules set impl_status = 'testing' where code = 'r_promo';
select status = 'segera' c_testing_belum_tersedia from modules where code = 'r_promo';
insert into kos(id,name,owner_id,setup_status,business_type) values ('b8b8b8b8-0000-0000-0000-00000000000b','Toko Baru','b8b8b8b8-0000-0000-0000-000000000001','active','retail');
select not exists (select 1 from business_modules where kos_id = 'b8b8b8b8-0000-0000-0000-00000000000b' and module_code in ('u_pajak', 'r_promo', 'u_asisten')) c_tanpa_modul_rencana;

\echo == D. Registry admin: bukan staf ditolak
select set_config('request.jwt.claim.sub', 'b8b8b8b8-0000-0000-0000-000000000001', false) \g /dev/null
do $$ declare m text; begin
  begin perform admin_module_registry(); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tidak punya izin%' then raise exception 'D_GAGAL: %', m; end if; raise notice 'd_OK: bukan staf ditolak';
end $$;
