-- Uji Growth Trigger Engine (PostgreSQL lokal, database hasil fresh.sh).
-- Jalankan: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/growth_trigger.sql"
insert into auth.users(id,email) values
  ('61616161-0000-0000-0000-000000000001','growth@x.com'),
  ('61616161-0000-0000-0000-000000000002','staf-growth@x.com'),
  ('61616161-0000-0000-0000-000000000003','super-growth@x.com'),
  ('61616161-0000-0000-0000-000000000004','pemilik-lain@x.com')
on conflict do nothing;
insert into admin_staff(email, role, active) values ('super-growth@x.com','super_admin',true) on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status) values
  ('61616161-0000-0000-0000-00000000aaaa','Toko Growth','61616161-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active'),
  ('61616161-0000-0000-0000-00000000bbbb','Toko Lain','61616161-0000-0000-0000-000000000004','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active')
on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values
  ('61616161-0000-0000-0000-00000000aaaa','61616161-0000-0000-0000-000000000001','pemilik'),
  ('61616161-0000-0000-0000-00000000bbbb','61616161-0000-0000-0000-000000000004','pemilik')
on conflict do nothing;
\set K  '61616161-0000-0000-0000-00000000aaaa'
\set KL '61616161-0000-0000-0000-00000000bbbb'
\set U  '61616161-0000-0000-0000-000000000001'
\set S  '61616161-0000-0000-0000-000000000002'
\set SA '61616161-0000-0000-0000-000000000003'

\echo == A. Dasar, karyawan belum penuh -> tidak ada penawaran
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000001","email":"growth@x.com"}', false) \g /dev/null
select growth_offer(:'K', 'karyawan') is null as a_tidak_ada;
reset role;

\echo == B. Karyawan kedua -> batas Dasar (1) penuh -> penawaran Bisnis dengan harga dari paket
insert into kos_members(kos_id,user_id,role) values (:'K','61616161-0000-0000-0000-000000000002','kasir') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000001","email":"growth@x.com"}', false) \g /dev/null
select growth_offer(:'K', 'karyawan') ->> 'id' as b_id, (growth_offer(:'K', 'karyawan') ->> 'price')::numeric as b_harga_final,
       (growth_offer(:'K', 'karyawan') ->> 'list_price')::numeric as b_harga_normal, growth_offer(:'K', 'karyawan') ->> 'to_plan' as b_paket_tujuan;
reset role;

\echo == C. Penawaran ditampilkan lalu ditolak -> tidak diulang dalam 7 hari
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000001","email":"growth@x.com"}', false) \g /dev/null
select growth_track(:'K', 'UPGRADE.EMPLOYEE.LIMIT', 'shown', 'EMPLOYEE.CREATE_REQUESTED');
select growth_track(:'K', 'UPGRADE.EMPLOYEE.LIMIT', 'dismissed');
select growth_offer(:'K', 'karyawan') is null as c_tidak_diulang;
reset role;

\echo == D. Staf (bukan pemilik) tidak bisa mencatat atau melihat penawaran
set role authenticated;
select set_config('request.jwt.claim.sub', :'S', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000002","email":"staf-growth@x.com"}', false) \g /dev/null
select growth_offer(:'K', 'karyawan') is null as d_staf_tidak_dapat;
do $$ begin perform growth_track('61616161-0000-0000-0000-00000000aaaa', 'UPGRADE.EMPLOYEE.LIMIT', 'clicked');
  raise notice 'd_FAIL: staf bisa mencatat'; exception when others then raise notice 'd_OK: staf ditolak (%)', sqlerrm; end $$;
reset role;

\echo == E. Pemilik lain tidak melihat penawaran bisnis ini
set role authenticated;
select set_config('request.jwt.claim.sub', '61616161-0000-0000-0000-000000000004', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000004","email":"pemilik-lain@x.com"}', false) \g /dev/null
select growth_offer(:'K', 'karyawan') is null as e_pemilik_lain_tidak_dapat;
reset role;

\echo == F. Pro bulanan aktif 31 hari -> penawaran Pro tahunan (harga 1.072.800, hemat 715.200)
update kos set plan = 'pro', paid_until = (now() at time zone 'Asia/Jakarta')::date + 20 where id = :'K';
insert into plan_activations(kos_id, source, plan, months, before, after, actor, created_at)
values (:'K', 'admin', 'pro', 1, '{}', '{}', 'uji', now() - interval '31 days');
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000001","email":"growth@x.com"}', false) \g /dev/null
select growth_offer(:'K', 'umum') ->> 'id' as f_id, (growth_offer(:'K', 'umum') ->> 'price')::numeric as f_harga,
       (growth_offer(:'K', 'umum') ->> 'list_price')::numeric as f_normal, (growth_offer(:'K', 'umum') ->> 'saving')::numeric as f_hemat,
       (growth_offer(:'K', 'umum') ->> 'monthly')::numeric as f_per_bulan;
select growth_track(:'K', 'UPGRADE.ANNUAL.PRO', 'shown');
select growth_offer(:'K', 'umum') is null as f_sekali_per_30_hari;
reset role;

\echo == G. Pro tahunan sudah dibeli -> tidak ditawarkan lagi
insert into plan_activations(kos_id, source, plan, months, before, after, actor, created_at)
values (:'K', 'admin', 'pro', 12, '{}', '{}', 'uji', now());
update growth_log set created_at = now() - interval '40 days' where kos_id = :'K';
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000001","email":"growth@x.com"}', false) \g /dev/null
select growth_offer(:'K', 'umum') is null as g_tahunan_tidak_ditawarkan_lagi;
reset role;

\echo == H. Non-Super Admin tidak bisa mengubah kampanye atau melihat analitik
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000001","email":"growth@x.com"}', false) \g /dev/null
do $$ begin perform growth_rule_save('UPGRADE.ANNUAL.PRO', '{"cta":"Coba"}');
  raise notice 'h_FAIL: pemilik bisa ubah kampanye'; exception when others then raise notice 'h_OK: ubah ditolak (%)', sqlerrm; end $$;
do $$ begin perform growth_analytics(30);
  raise notice 'h_FAIL: pemilik bisa lihat analitik'; exception when others then raise notice 'h_OK: analitik ditolak (%)', sqlerrm; end $$;
reset role;

\echo == I. Super Admin mengubah kampanye -> tercatat di audit; aturan tak valid ditolak
set role authenticated;
select set_config('request.jwt.claim.sub', :'SA', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000003","email":"super-growth@x.com"}', false) \g /dev/null
select growth_rule_save('UPGRADE.ANNUAL.PRO', '{"cta":"Ambil Pro Tahunan","frequency_days":45}') ->> 'cta' as i_cta_baru;
do $$ begin perform growth_rule_save('UPGRADE.ANNUAL.PRO', '{"to_months":3}');
  raise notice 'i_FAIL: jangka 3 bulan diterima'; exception when others then raise notice 'i_OK: jangka tidak valid ditolak (%)', sqlerrm; end $$;
do $$ begin perform growth_rule_save('UPGRADE.ANNUAL.PRO', '{"frequency_days":0}');
  raise notice 'i_FAIL: frekuensi 0 diterima'; exception when others then raise notice 'i_OK: frekuensi tidak valid ditolak (%)', sqlerrm; end $$;
select growth_rule_save('UPGRADE.EMPLOYEE.LIMIT', '{"active":false}') ->> 'active' as i_nonaktif;
select growth_offer(:'K', 'karyawan') is null as i_nonaktif_tidak_tampil;
select growth_rule_save('UPGRADE.EMPLOYEE.LIMIT', '{"active":true}') ->> 'active' as i_aktif_lagi;
reset role;
select count(*) as i_catatan_audit from admin_log where action in ('ubah_kampanye','buat_kampanye') and detail->>'penawaran' = 'UPGRADE.ANNUAL.PRO';

\echo == J. Analitik nyata (tanpa angka tiruan)
set role authenticated;
select set_config('request.jwt.claim.sub', :'SA', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000003","email":"super-growth@x.com"}', false) \g /dev/null
select (growth_analytics(30)) -> 'pemicu' -> 0 ->> 'id' as j_pemicu_pertama,
       (growth_analytics(30)) -> 'pendapatan' ->> 'mrr' as j_mrr,
       (growth_analytics(30)) -> 'akuisisi' ->> 'pengunjung' as j_pengunjung_belum_dilacak,
       (growth_analytics(30)) -> 'upgrade' ->> 'pro_bulanan_ke_tahunan' as j_pro_ke_tahunan;
select jsonb_pretty(growth_analytics(30) -> 'pemicu') as j_detail_pemicu;
reset role;

\echo == K. Bisnis ditutup -> pencatatan ditolak (guard)
update kos set closed_at = now() where id = :'K';
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000001","email":"growth@x.com"}', false) \g /dev/null
do $$ begin perform growth_track('61616161-0000-0000-0000-00000000aaaa', 'UPGRADE.ANNUAL.PRO', 'clicked');
  raise notice 'k_FAIL: bisnis tutup bisa mencatat'; exception when others then raise notice 'k_OK: ditolak guard (%)', sqlerrm; end $$;
reset role;
update kos set closed_at = null where id = :'K';
