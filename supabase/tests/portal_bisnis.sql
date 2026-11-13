-- Uji Portal bisnis = Paket Pro (bisnis lama tetap). Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/portal_bisnis.sql"
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('d4d4d4d4-0000-0000-0000-000000000001','portal-owner@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status,business_type) values
  ('d4d4d4d4-0000-0000-0000-00000000000d','Toko Portal Dasar','d4d4d4d4-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail'),
  ('d4d4d4d4-0000-0000-0000-00000000000a','Toko Portal Lama','d4d4d4d4-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail'),
  ('d4d4d4d4-0000-0000-0000-00000000000f','Toko Portal Pro','d4d4d4d4-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail')
on conflict do nothing;
update kos set legacy_features = '{portal_bisnis}' where id = 'd4d4d4d4-0000-0000-0000-00000000000a';
insert into kos_members(kos_id,user_id,role) select id, 'd4d4d4d4-0000-0000-0000-000000000001', 'pemilik' from kos where id::text like 'd4d4d4d4-%' on conflict do nothing;
\set D 'd4d4d4d4-0000-0000-0000-00000000000d'
\set L 'd4d4d4d4-0000-0000-0000-00000000000a'
\set P 'd4d4d4d4-0000-0000-0000-00000000000f'
select set_config('request.jwt.claim.sub', 'd4d4d4d4-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"d4d4d4d4-0000-0000-0000-000000000001","email":"portal-owner@x.com"}', false) \g /dev/null

\echo == A. Dasar baru: menerbitkan ditolak; menyimpan draf boleh; terbit cepat (Bagikan) juga ditolak
do $$ declare m text; begin
  begin perform public_page_save('d4d4d4d4-0000-0000-0000-00000000000d', '{"slug":"portal-dasar","enabled":true}'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'A_GAGAL: terbit: %', m; end if; raise notice 'a_OK: terbit ditolak';
end $$;
select public_page_save(:'D', '{"slug":"portal-dasar","enabled":false,"tagline":"Draf siap"}') is not null a_draf_disimpan;
do $$ declare m text; begin
  begin perform public_page_quick_publish('d4d4d4d4-0000-0000-0000-00000000000d'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like '%BATAS_PAKET%' and coalesce(m, '') not like '%Paket Pro%' then raise exception 'A_GAGAL: terbit cepat: %', m; end if; raise notice 'a_OK: terbit cepat ditolak';
end $$;
select (select enabled from public_pages where kos_id = :'D') = false a_tetap_draf, (select tagline from public_pages where kos_id = :'D') a_isi_tersimpan;

\echo == B. Bisnis lama (legacy) & Pro: boleh terbit
select public_page_save(:'L', '{"slug":"portal-lama","enabled":true}') is not null b_lama_terbit;
select public_page_save(:'P', '{"slug":"portal-pro","enabled":true}') is not null b_pro_terbit;
select (select count(*) from public_pages where kos_id in (:'L', :'P') and enabled) = 2 b_dua_terbit;

\echo == C. Setup otomatis: halaman disimpan tapi tidak diterbitkan (aktivasi tidak gagal)
reset role;
select set_config('prasara.setup_ok', '1', false) \g /dev/null
update public_pages set enabled = true where kos_id = :'D';
select set_config('prasara.setup_ok', '', false) \g /dev/null
select (select enabled from public_pages where kos_id = :'D') = false c_setup_tidak_menerbitkan;

\echo == D. Turun paket: Pro -> Dasar, jadwal harian menyembunyikan halaman; isi tetap ada; bisnis lama tidak terdampak
update kos set plan = 'dasar' where id = :'P';
select portal_unpublish_lapsed() d_disembunyikan;
select (select enabled from public_pages where kos_id = :'P') = false d_pro_lama_tersembunyi, (select slug from public_pages where kos_id = :'P') d_slug_tetap,
       (select enabled from public_pages where kos_id = :'L') d_legacy_tetap_terbit;

\echo == E. Penawaran Pro saat ingin menerbitkan
select set_config('request.jwt.claim.sub', 'd4d4d4d4-0000-0000-0000-000000000001', false) \g /dev/null
select growth_offer(:'D', 'fitur', 'PORTAL.PUBLIC_PAGE.REQUESTED') ->> 'id' e_penawaran, growth_offer(:'D', 'fitur', 'PORTAL.PUBLIC_PAGE.REQUESTED') ->> 'to_plan' e_tujuan,
       growth_offer(:'L', 'fitur', 'PORTAL.PUBLIC_PAGE.REQUESTED') is null e_lama_tidak_ditawari;
