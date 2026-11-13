-- Uji pengingat masa coba (PostgreSQL lokal, database hasil fresh.sh).
insert into auth.users(id,email) values ('f3f3f3f3-0000-0000-0000-000000000001','trial@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status) values
 ('f4f4f4f4-0000-0000-0000-000000000001','Toko Trial','f3f3f3f3-0000-0000-0000-000000000001','gratis',null,(now() at time zone 'Asia/Jakarta')::date + 4,'active') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values ('f4f4f4f4-0000-0000-0000-000000000001','f3f3f3f3-0000-0000-0000-000000000001','pemilik') on conflict do nothing;
\set K 'f4f4f4f4-0000-0000-0000-000000000001'
set role authenticated;
select set_config('request.jwt.claim.sub','f3f3f3f3-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{"sub":"f3f3f3f3-0000-0000-0000-000000000001","email":"trial@x.com"}',false) \g /dev/null

\echo == A. Sisa 4 hari -> pengingat hari ke-10
select trial_reminder_next(:'K') ->> 'kind' as pengingat_1;
\echo == B. Dipanggil lagi hari yang sama -> tidak diulang
select trial_reminder_next(:'K') is null as tidak_diulang;
reset role;

\echo == C. Sisa 2 hari (hari ke-12) -> ini pengingat kedua dalam 3 hari
update kos set trial_until = (now() at time zone 'Asia/Jakarta')::date + 2 where id = :'K';
set role authenticated;
select set_config('request.jwt.claim.sub','f3f3f3f3-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{"sub":"f3f3f3f3-0000-0000-0000-000000000001","email":"trial@x.com"}',false) \g /dev/null
select trial_reminder_next(:'K') ->> 'kind' as pengingat_2;
reset role;

\echo == D. Sisa 0 hari (hari ke-14) tapi sudah dua pengingat dalam 3 hari -> dibatasi
update kos set trial_until = (now() at time zone 'Asia/Jakarta')::date where id = :'K';
set role authenticated;
select set_config('request.jwt.claim.sub','f3f3f3f3-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{"sub":"f3f3f3f3-0000-0000-0000-000000000001","email":"trial@x.com"}',false) \g /dev/null
select trial_reminder_next(:'K') is null as dibatasi_dua_per_3_hari;
reset role;

\echo == E. Sudah berlangganan -> tidak ada pengingat
update kos set paid_until = (now() at time zone 'Asia/Jakarta')::date + 30, trial_until = (now() at time zone 'Asia/Jakarta')::date where id = :'K';
set role authenticated;
select set_config('request.jwt.claim.sub','f3f3f3f3-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{"sub":"f3f3f3f3-0000-0000-0000-000000000001","email":"trial@x.com"}',false) \g /dev/null
select trial_reminder_next(:'K') is null as tidak_untuk_pelanggan_aktif;
reset role;
