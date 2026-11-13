-- Uji peringatan kuota (PostgreSQL lokal, database hasil fresh.sh).
insert into auth.users(id,email) values ('d1d1d1d1-0000-0000-0000-000000000001','kuota@x.com'),('d1d1d1d1-0000-0000-0000-000000000002','staf.kuota@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status) values ('d2d2d2d2-0000-0000-0000-000000000001','Kos Kuota','d1d1d1d1-0000-0000-0000-000000000001','gratis',null,null,'active') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values ('d2d2d2d2-0000-0000-0000-000000000001','d1d1d1d1-0000-0000-0000-000000000001','pemilik') on conflict do nothing;

\echo == A. Pemilik: kuota karyawan 0% (belum ada staf)
set role authenticated;
select set_config('request.jwt.claim.sub','d1d1d1d1-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{"sub":"d1d1d1d1-0000-0000-0000-000000000001","email":"kuota@x.com"}',false) \g /dev/null
select x->>'key' k, (x->>'pct')::int pct from jsonb_array_elements(kuota_status('d2d2d2d2-0000-0000-0000-000000000001')) x order by 1;
reset role;

\echo == B. Tambah 1 karyawan di paket gratis (batas 1) -> 100%
insert into kos_members(kos_id,user_id,role,active) values ('d2d2d2d2-0000-0000-0000-000000000001','d1d1d1d1-0000-0000-0000-000000000002','kasir',true) on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','d1d1d1d1-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{"sub":"d1d1d1d1-0000-0000-0000-000000000001","email":"kuota@x.com"}',false) \g /dev/null
select x->>'key' k, (x->>'used')::numeric used, (x->>'limit')::numeric lim, (x->>'pct')::int pct from jsonb_array_elements(kuota_status('d2d2d2d2-0000-0000-0000-000000000001')) x where x->>'key'='karyawan';
reset role;

\echo == C. Bukan anggota -> ditolak
insert into auth.users(id,email) values ('d1d1d1d1-0000-0000-0000-000000000003','orang.lain@x.com') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','d1d1d1d1-0000-0000-0000-000000000003',false), set_config('request.jwt.claims','{"sub":"d1d1d1d1-0000-0000-0000-000000000003","email":"orang.lain@x.com"}',false) \g /dev/null
select kuota_status('d2d2d2d2-0000-0000-0000-000000000001');
reset role;
