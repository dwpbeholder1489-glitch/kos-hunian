-- Uji hak akses per modul (Bisnis), izin per tindakan & persetujuan bertingkat (Pro), otomatisasi lanjutan (Pro), syarat Pro Tahunan.
-- Jalankan di database baru: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/akses_persetujuan_pro.sql"
-- Lulus = semua kolom bernilai t / sesuai keterangan, NOTICE x_OK, tanpa *_GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values
  ('e5e5e5e5-0000-0000-0000-000000000001','akses-owner@x.com'),
  ('e5e5e5e5-0000-0000-0000-000000000002','akses-kasir@x.com'),
  ('e5e5e5e5-0000-0000-0000-000000000003','akses-pengelola@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status,business_type) values
  ('e5e5e5e5-0000-0000-0000-00000000000d','Toko Akses Dasar','e5e5e5e5-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail'),
  ('e5e5e5e5-0000-0000-0000-00000000000b','Toko Akses Bisnis','e5e5e5e5-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail'),
  ('e5e5e5e5-0000-0000-0000-00000000000f','Toko Akses Pro','e5e5e5e5-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail')
on conflict do nothing;
insert into kos_members(kos_id,user_id,role) select id, 'e5e5e5e5-0000-0000-0000-000000000001', 'pemilik' from kos where id::text like 'e5e5e5e5-%' on conflict do nothing;
insert into kos_members(kos_id,user_id,role) select id, 'e5e5e5e5-0000-0000-0000-000000000002', 'kasir' from kos where id::text like 'e5e5e5e5-%' on conflict do nothing;
insert into kos_members(kos_id,user_id,role) select id, 'e5e5e5e5-0000-0000-0000-000000000003', 'pengelola' from kos where id::text like 'e5e5e5e5-%' on conflict do nothing;
insert into products(id,kos_id,name,base_unit,cost,stock) values
  ('e5e5e5e5-0000-0000-0000-0000000000a1','e5e5e5e5-0000-0000-0000-00000000000f','Beras 5kg','karung',20000,50) on conflict do nothing;
\set D 'e5e5e5e5-0000-0000-0000-00000000000d'
\set B 'e5e5e5e5-0000-0000-0000-00000000000b'
\set P 'e5e5e5e5-0000-0000-0000-00000000000f'
\set O 'e5e5e5e5-0000-0000-0000-000000000001'
\set K 'e5e5e5e5-0000-0000-0000-000000000002'
\set M 'e5e5e5e5-0000-0000-0000-000000000003'
\set PR 'e5e5e5e5-0000-0000-0000-0000000000a1'
\set as_owner 'select set_config(''request.jwt.claim.sub'', ''e5e5e5e5-0000-0000-0000-000000000001'', false), set_config(''request.jwt.claims'', ''{"sub":"e5e5e5e5-0000-0000-0000-000000000001","email":"akses-owner@x.com"}'', false) \\g /dev/null'
\set as_kasir 'select set_config(''request.jwt.claim.sub'', ''e5e5e5e5-0000-0000-0000-000000000002'', false), set_config(''request.jwt.claims'', ''{"sub":"e5e5e5e5-0000-0000-0000-000000000002","email":"akses-kasir@x.com"}'', false) \\g /dev/null'
\set as_mgr 'select set_config(''request.jwt.claim.sub'', ''e5e5e5e5-0000-0000-0000-000000000003'', false), set_config(''request.jwt.claims'', ''{"sub":"e5e5e5e5-0000-0000-0000-000000000003","email":"akses-pengelola@x.com"}'', false) \\g /dev/null'

\echo == A. Akses per modul: Dasar ditolak; Bisnis boleh; tidak bisa memberi area team; turun paket = kembali ke peran
:as_owner
do $$ declare m text; begin
  begin perform team_access_set('e5e5e5e5-0000-0000-0000-00000000000d', 'e5e5e5e5-0000-0000-0000-000000000002', '{sell,stock}', '{}', false); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'A_GAGAL dasar: %', m; end if; raise notice 'a_OK: Dasar ditolak';
  m := null;
  begin perform team_access_set('e5e5e5e5-0000-0000-0000-00000000000b', 'e5e5e5e5-0000-0000-0000-000000000002', '{sell,team}', '{}', false); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Ada modul yang tidak tersedia%' then raise exception 'A_GAGAL team: %', m; end if; raise notice 'a_OK: area team ditolak';
end $$;
select team_access_set(:'B', :'K', '{sell,stock}', '{}', false) \g /dev/null
:as_kasir
select member_can(:'B', 'stock') a_kasir_boleh_stok, not member_can(:'B', 'finance') a_kasir_tanpa_keuangan, not member_can(:'B', 'team') a_kasir_tanpa_team,
       (my_access() -> :'B' -> 'areas') = '["sell","stock"]'::jsonb a_my_access, not member_can(:'D', 'stock') a_dasar_tetap_peran;
reset role;
update kos set plan = 'dasar' where id = :'B';
select not member_can(:'B', 'stock') a_turun_paket_kembali_ke_peran, member_can(:'B', 'sell') a_peran_kasir_tetap,
       (select areas from kos_members where kos_id = :'B' and user_id = :'K') = '{sell,stock}' a_pengaturan_tidak_hilang;
:as_owner
select team_access_set(:'B', :'K', '{stock,sell}', '{}', false) \g /dev/null
select (select areas from kos_members where kos_id = :'B' and user_id = :'K') = '{sell,stock}' a_simpan_ulang_tanpa_perubahan_boleh;
do $$ declare m text; begin
  begin perform team_access_set('e5e5e5e5-0000-0000-0000-00000000000b', 'e5e5e5e5-0000-0000-0000-000000000002', '{sell,stock,finance}', '{}', false); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'A_GAGAL ubah saat turun: %', m; end if; raise notice 'a_OK: mengubah modul setelah turun paket ditolak';
end $$;
reset role;
update kos set plan = 'bisnis' where id = :'B';

\echo == B. Izin per tindakan (Pro): Bisnis ditolak; larang / izinkan / persetujuan
:as_owner
do $$ declare m text; begin
  begin perform team_access_set('e5e5e5e5-0000-0000-0000-00000000000b', 'e5e5e5e5-0000-0000-0000-000000000002', null, '{"hapus_kontak":"izinkan"}', false); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'B_GAGAL bisnis: %', m; end if; raise notice 'b_OK: izin per tindakan di Bisnis ditolak';
  m := null;
  begin perform team_access_set('e5e5e5e5-0000-0000-0000-00000000000f', 'e5e5e5e5-0000-0000-0000-000000000002', null, '{"hapus_kontak":"terserah"}', false); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Pilihan izin tidak valid%' then raise exception 'B_GAGAL nilai: %', m; end if; raise notice 'b_OK: nilai izin tidak valid ditolak';
end $$;
select team_access_set(:'P', :'K', '{sell,stock}', '{"batal_penjualan":"larang","hapus_kontak":"izinkan","penyesuaian_stok":"persetujuan"}', false) \g /dev/null
:as_kasir
do $$ declare m text; begin
  begin perform approval_needed('e5e5e5e5-0000-0000-0000-00000000000f', 'batal_penjualan'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tindakan ini tidak diizinkan%' then raise exception 'B_GAGAL larang: %', m; end if; raise notice 'b_OK: tindakan dilarang ditolak';
  m := null;
  begin perform approval_request('e5e5e5e5-0000-0000-0000-00000000000f', 'batal_penjualan', '{}', 'coba minta'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tindakan ini tidak diizinkan%' then raise exception 'B_GAGAL minta: %', m; end if; raise notice 'b_OK: permintaan tindakan dilarang ditolak';
end $$;
select not approval_needed(:'P', 'hapus_kontak') b_izinkan_lewati_pengaman, approval_needed(:'P', 'penyesuaian_stok') b_wajib_persetujuan_khusus,
       approval_needed(:'B', 'hapus_kontak') b_bisnis_ikut_aturan_bawaan;

\echo == C. Persetujuan bertingkat (Pro): penyetuju tingkat 1 + pemilik untuk nominal besar
:as_owner
do $$ declare m text; begin
  begin perform approval_levels_set('e5e5e5e5-0000-0000-0000-00000000000b', 'penyesuaian_stok', 2, 100000); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'C_GAGAL bisnis: %', m; end if; raise notice 'c_OK: tingkat di Bisnis ditolak';
  m := null;
  begin perform team_access_set('e5e5e5e5-0000-0000-0000-00000000000b', 'e5e5e5e5-0000-0000-0000-000000000003', null, '{}', true); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'C_GAGAL penyetuju bisnis: %', m; end if; raise notice 'c_OK: penyetuju di Bisnis ditolak';
end $$;
select approval_levels_set(:'P', 'penyesuaian_stok', 2, 100000) \g /dev/null
select team_access_set(:'P', :'M', null, '{}', true) \g /dev/null
:as_kasir
select approval_request(:'P', 'penyesuaian_stok', jsonb_build_object('product_id', :'PR', 'reason', 'rusak', 'qty', 10), 'karung sobek banyak') as big \gset
select approval_request(:'P', 'penyesuaian_stok', jsonb_build_object('product_id', :'PR', 'reason', 'rusak', 'qty', 1), 'satu karung basah') as small \gset
select (select levels_needed from approvals where id = :'big') = 2 c_besar_dua_tingkat, (select levels_needed from approvals where id = :'small') = 1 c_kecil_satu_tingkat,
       not approval_can_decide(:'big') c_peminta_tidak_bisa_memutuskan;
:as_mgr
select approval_can_decide(:'big') c_penyetuju_bisa_tingkat1, (select count(*) from approvals where kos_id = :'P') c_penyetuju_melihat_2;
select approval_decide(:'big', true, 'cek fisik ok') ->> 'status' c_tingkat1_masih_menunggu;
select (select level from approvals where id = :'big') = 2 c_naik_tingkat2, not approval_can_decide(:'big') c_penyetuju_tidak_bisa_tingkat2;
select approval_decide(:'small', true, null) ->> 'status' c_kecil_langsung_dijalankan;
select (select stock from products where id = :'PR') = 49 c_stok_berkurang_1;  -- dibaca terpisah (perintah yang sama belum melihat perubahan)
:as_owner
select approval_decide(:'big', true, 'oke') ->> 'status' c_pemilik_menjalankan;
select (select stock from products where id = :'PR') = 39 c_stok_berkurang_10,
       jsonb_array_length((select steps from approvals where id = :'big')) = 2 c_riwayat_dua_langkah;
:as_kasir
select approval_request(:'P', 'penyesuaian_stok', jsonb_build_object('product_id', :'PR', 'reason', 'rusak', 'qty', 2), 'pecah') as rej \gset
:as_mgr
select approval_decide(:'rej', false, 'tidak sesuai') ->> 'status' c_penyetuju_menolak;
select (select stock from products where id = :'PR') = 39 c_stok_tetap;
-- turun paket: penyetuju tidak berlaku, permintaan baru kembali 1 tingkat
reset role;
update kos set plan = 'bisnis' where id = :'P';
:as_kasir
select approval_request(:'P', 'penyesuaian_stok', jsonb_build_object('product_id', :'PR', 'reason', 'rusak', 'qty', 10), 'lagi') as big2 \gset
select (select levels_needed from approvals where id = :'big2') = 1 c_bisnis_satu_tingkat;
:as_mgr
select not approval_can_decide(:'big2') c_bisnis_penyetuju_tidak_berlaku;
reset role;
update kos set plan = 'pro' where id = :'P';

\echo == D. Otomatisasi lanjutan (Pro)
:as_owner
do $$ declare m text; begin
  begin perform automation_set('e5e5e5e5-0000-0000-0000-00000000000b', 'penjualan_turun', true, '{}'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'D_GAGAL resep lanjutan: %', m; end if; raise notice 'd_OK: resep lanjutan di Bisnis ditolak';
  m := null;
  begin perform automation_set('e5e5e5e5-0000-0000-0000-00000000000b', 'shift_lama', true, '{"hari_jalan":[1,3]}'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'D_GAGAL hari: %', m; end if; raise notice 'd_OK: hari jalan di Bisnis ditolak';
  m := null;
  begin perform automation_set('e5e5e5e5-0000-0000-0000-00000000000f', 'shift_lama', true, '{"hari_jalan":[9]}'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hari jalan tidak valid%' then raise exception 'D_GAGAL hari salah: %', m; end if; raise notice 'd_OK: hari salah ditolak';
end $$;
select automation_set(:'B', 'shift_lama', true, '{}') is not null d_bisnis_resep_dasar_boleh;
select automation_set(:'P', 'anggaran_lewat', true, '{}') as r_angg \gset
select automation_set(:'P', 'ringkasan_mingguan', true, '{}') as r_ming \gset
select automation_set(:'P', 'shift_lama', true, jsonb_build_object('hari_jalan', jsonb_build_array(((extract(isodow from (now() at time zone 'Asia/Jakarta'))::int % 7) + 1)))) as r_shift \gset
reset role;
insert into expense_categories(id, kos_id, name) values ('e5e5e5e5-0000-0000-0000-0000000000c1', :'P', 'Listrik') on conflict do nothing;
insert into budgets(kos_id, month, category_id, amount) values (:'P', date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date, 'e5e5e5e5-0000-0000-0000-0000000000c1', 1000000);
insert into expenses(kos_id, date, category_id, kind, amount, description) values (:'P', (now() at time zone 'Asia/Jakarta')::date, 'e5e5e5e5-0000-0000-0000-0000000000c1', 'operasional', 950000, 'tagihan PLN');
select automation_run_rule(:'r_angg', 'jadwal') ->> 'status' d_anggaran_ok;
select (select title from automation_notices where rule_id = :'r_angg') d_judul;
select automation_run_rule(:'r_angg', 'jadwal') ->> 'status' d_anggaran_tidak_diulang;
select automation_run_rule(:'r_ming', 'manual') ->> 'status' d_mingguan_manual_ok;
select (select count(*) from automation_notices where rule_id = :'r_ming') = 1 d_ringkasan_dibuat;
select not automation_day_ok(:'P', (select params from automation_rules where id = :'r_shift')) d_bukan_hari_jalan_dilewati,
       automation_day_ok(:'B', '{}') d_tanpa_hari_jalan_setiap_hari;
update kos set plan = 'bisnis' where id = :'P';
select not exists (select 1 from automation_rules ru join automation_recipes rc on rc.code = ru.recipe
                   where ru.kos_id = :'P' and ru.enabled and rc.tier = 'lanjutan' and (rc.tier = 'dasar' or plan_has(ru.kos_id, 'otomatisasi_lanjutan'))) d_turun_paket_resep_lanjutan_berhenti;
update kos set plan = 'pro' where id = :'P';

\echo == E. Penawaran fitur Pro & syarat Pro Tahunan
:as_owner
select growth_offer(:'B', 'fitur', 'ACCESS.GRANULAR.REQUESTED') ->> 'to_plan' e_bisnis_ke_pro, growth_offer(:'D', 'fitur', 'ACCESS.MODULE.REQUESTED') ->> 'to_plan' e_dasar_ke_bisnis,
       growth_offer(:'P', 'fitur', 'WORKFLOW.ADVANCED.REQUESTED') is null e_pro_tidak_ditawari;
reset role;
insert into plan_activations(kos_id, source, plan, months, before, after) values (:'P', 'admin', 'pro', 1, '{}', '{}');
:as_owner
select growth_offer(:'P', 'umum') is null e_baru_5_hari_belum_ditawari_tahunan;
reset role;
insert into public_pages(kos_id, slug, enabled) values (:'P', 'toko-akses-pro', true);
:as_owner
select growth_offer(:'P', 'umum') ->> 'id' e_portal_aktif_ditawari_tahunan, growth_offer(:'P', 'umum') ->> 'to_months' e_12_bulan;
select plan_feature_codes() @> '{akses_modul,akses_granular,persetujuan_bertingkat,otomatisasi_lanjutan,portal_bisnis,anggaran}' e_kode_fitur_lengkap;
