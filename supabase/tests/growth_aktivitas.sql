-- Uji Growth Trigger tahap 2: penawaran aktivitas (TRANSAKSI.PERTAMA, LAPORAN.DIBUKA) & pengguna Gratis.
-- Jalankan: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/growth_aktivitas.sql"
insert into auth.users(id,email) values
  ('61616161-0000-0000-0000-000000000005','gratis-owner@x.com'),
  ('61616161-0000-0000-0000-000000000006','super-growth@x.com')
on conflict do nothing;
insert into admin_staff(email, role, active) values ('super-growth@x.com','super_admin',true) on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status) values
  ('61616161-0000-0000-0000-00000000cccc','Toko Gratis','61616161-0000-0000-0000-000000000005','gratis',null,null,'active'),
  ('61616161-0000-0000-0000-00000000dddd','Toko Dasar Laporan','61616161-0000-0000-0000-000000000005','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active')
on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values
  ('61616161-0000-0000-0000-00000000cccc','61616161-0000-0000-0000-000000000005','pemilik'),
  ('61616161-0000-0000-0000-00000000dddd','61616161-0000-0000-0000-000000000005','pemilik')
on conflict do nothing;
\set G  '61616161-0000-0000-0000-00000000cccc'
\set D  '61616161-0000-0000-0000-00000000dddd'
\set U  '61616161-0000-0000-0000-000000000005'
\set SA '61616161-0000-0000-0000-000000000006'

\echo == A. Gratis tanpa transaksi -> tidak ada penawaran transaksi pertama
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000005","email":"gratis-owner@x.com"}', false) \g /dev/null
select growth_offer(:'G', 'aktivitas', 'TRANSAKSI.PERTAMA') is null as a_tanpa_transaksi_tidak_ada;
reset role;

\echo == B. Transaksi pertama tercatat -> penawaran aktivitas Gratis -> Dasar
insert into sales(kos_id, number, subtotal, total, pay_method) values (:'G', 'TEST-0001', 10000, 10000, 'tunai');
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000005","email":"gratis-owner@x.com"}', false) \g /dev/null
select growth_offer(:'G', 'aktivitas', 'TRANSAKSI.PERTAMA') ->> 'id' as b_id,
       growth_offer(:'G', 'aktivitas', 'LAPORAN.DIBUKA') is null as b_event_lain_tidak_cocok;
reset role;

\echo == C. Penawaran aktivitas tampil -> pop-up umum 7 hari ikut terkunci (Gratis umum tidak muncul)
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000005","email":"gratis-owner@x.com"}', false) \g /dev/null
select growth_track(:'G', 'UPGRADE.ACTIVITY.TRANSAKSI', 'shown');
select growth_offer(:'G', 'umum') is null as c_umum_terkunci_7_hari;
reset role;

\echo == D. Pemilik Dasar buka laporan -> penawaran Bisnis; Gratis tidak mendapat penawaran laporan
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000005","email":"gratis-owner@x.com"}', false) \g /dev/null
select growth_offer(:'D', 'aktivitas', 'LAPORAN.DIBUKA') ->> 'id' as d_id,
       growth_offer(:'D', 'aktivitas', 'LAPORAN.DIBUKA') ->> 'to_plan' as d_paket_tujuan,
       growth_offer(:'G', 'aktivitas', 'LAPORAN.DIBUKA') is null as d_gratis_tidak_dapat_laporan;
reset role;

\echo == E. Staf (bukan pemilik) tidak mendapat penawaran aktivitas
set role authenticated;
select set_config('request.jwt.claim.sub', :'SA', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000006","email":"super-growth@x.com"}', false) \g /dev/null
select growth_offer(:'D', 'aktivitas', 'LAPORAN.DIBUKA') is null as e_bukan_pemilik;
reset role;

\echo == F. Kampanye: aktivitas wajib peristiwa; non-aktivitas menghapus peristiwa
set role authenticated;
select set_config('request.jwt.claim.sub', :'SA', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000006","email":"super-growth@x.com"}', false) \g /dev/null
do $$ begin
  begin perform growth_rule_save('UPGRADE.ACTIVITY.LAPORAN', '{"trigger_event":null}');
    raise exception 'F_GAGAL: peristiwa kosong diterima';
  exception when others then
    if sqlerrm like 'F_GAGAL%' then raise; end if;
    raise notice 'f_OK: peristiwa kosong ditolak (%)', sqlerrm;
  end;
end $$;
do $$ begin
  perform growth_rule_save('UPGRADE.ACTIVITY.LAPORAN', '{"context":"umum"}');
  if (select trigger_event from growth_rules where id = 'UPGRADE.ACTIVITY.LAPORAN') is not null then
    raise exception 'F_GAGAL: peristiwa tidak dihapus untuk konteks umum';
  end if;
  raise notice 'f_OK: konteks umum menghapus peristiwa';
  perform growth_rule_save('UPGRADE.ACTIVITY.LAPORAN', '{"context":"aktivitas","trigger_event":"LAPORAN.DIBUKA"}');
  raise notice 'f_OK: aktivitas dengan peristiwa disimpan';
end $$;
reset role;

\echo == G. Pemilik biasa tidak bisa mengubah kampanye
set role authenticated;
select set_config('request.jwt.claim.sub', :'U', false), set_config('request.jwt.claims', '{"sub":"61616161-0000-0000-0000-000000000005","email":"gratis-owner@x.com"}', false) \g /dev/null
do $$ begin
  begin perform growth_rule_save('UPGRADE.ACTIVITY.LAPORAN', '{"name":"x"}');
    raise exception 'G_GAGAL: pemilik biasa bisa mengubah';
  exception when others then
    if sqlerrm like 'G_GAGAL%' then raise; end if;
    raise notice 'g_OK: ubah ditolak (%)', sqlerrm;
  end;
end $$;
reset role;
