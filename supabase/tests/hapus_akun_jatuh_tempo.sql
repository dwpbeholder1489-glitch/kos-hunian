-- Uji: batas waktu bayar invoice & permintaan hapus akun (PostgreSQL lokal, database hasil fresh.sh).
insert into auth.users(id,email) values ('c1c1c1c1-0000-0000-0000-000000000001','hapus@x.com') on conflict do nothing;
insert into auth.users(id,email) values ('88888888-8888-8888-8888-888888888888','adm@x.com') on conflict do nothing;
insert into app_admins(email) values ('adm@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,setup_status) values ('c2c2c2c2-0000-0000-0000-000000000001','Toko Hapus','c1c1c1c1-0000-0000-0000-000000000001','gratis','active') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values ('c2c2c2c2-0000-0000-0000-000000000001','c1c1c1c1-0000-0000-0000-000000000001','pemilik') on conflict do nothing;

\echo == A. Batas waktu bayar terisi otomatis (default 3 hari)
select count(*) = 0 as semua_terisi from plan_requests where due_at is null;
select column_default like '%interval%' as ada_default from information_schema.columns where table_name='plan_requests' and column_name='due_at';

\echo == B. Pengguna meminta hapus akun -> tercatat menunggu
set role authenticated;
select set_config('request.jwt.claim.sub','c1c1c1c1-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{"sub":"c1c1c1c1-0000-0000-0000-000000000001","email":"hapus@x.com"}',false) \g /dev/null
select account_request_delete()->>'status' as status_1;
select account_request_delete()->>'status' as status_2_idempoten;
reset role;
select count(*) as jumlah_permintaan_aktif from account_requests where user_id='c1c1c1c1-0000-0000-0000-000000000001' and status='menunggu';

\echo == C. Admin melihat antrean & memproses
select id as req_id from account_requests where user_id='c1c1c1c1-0000-0000-0000-000000000001' \gset
set role authenticated;
select set_config('request.jwt.claim.sub','88888888-8888-8888-8888-888888888888',false), set_config('request.jwt.claims','{"sub":"88888888-8888-8888-8888-888888888888","email":"adm@x.com"}',false) \g /dev/null
select jsonb_array_length(admin_account_requests()) as antrean_terlihat;
select admin_account_requests()->0->>'bisnis' as bisnis_terkait;
select admin_account_resolve(:'req_id', 'selesai', 'Uji: data disimpan sesuai retensi');
reset role;
select status, handled_by from account_requests where user_id='c1c1c1c1-0000-0000-0000-000000000001';

\echo == D. Setelah selesai, pengguna bisa mengajukan lagi
set role authenticated;
select set_config('request.jwt.claim.sub','c1c1c1c1-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{"sub":"c1c1c1c1-0000-0000-0000-000000000001","email":"hapus@x.com"}',false) \g /dev/null
select account_request_delete()->>'status' as status_setelah_selesai;
reset role;

\echo == E. Pengguna biasa tidak boleh melihat antrean admin
set role authenticated;
select set_config('request.jwt.claim.sub','c1c1c1c1-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{"sub":"c1c1c1c1-0000-0000-0000-000000000001","email":"hapus@x.com"}',false) \g /dev/null
select admin_account_requests();
reset role;
