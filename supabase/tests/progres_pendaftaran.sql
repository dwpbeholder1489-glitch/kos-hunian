-- Uji progres pendaftaran di server (PostgreSQL lokal, database hasil fresh.sh).
insert into auth.users(id,email) values ('e1e1e1e1-0000-0000-0000-000000000001','daftar@x.com'),('e1e1e1e1-0000-0000-0000-000000000002','lain@x.com') on conflict do nothing;

\echo == A. Belum ada draf -> null
set role authenticated;
select set_config('request.jwt.claim.sub','e1e1e1e1-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{"sub":"e1e1e1e1-0000-0000-0000-000000000001","email":"daftar@x.com"}',false) \g /dev/null
select reg_draft_get() is null as kosong_awal;

\echo == B. Simpan lalu baca lagi (perangkat lain = panggilan berikutnya)
select reg_draft_save('{"sel":["retail"],"biz":{"retail":{"name":"Toko Subur"}},"step":1,"sub":2}'::jsonb);
select reg_draft_save('{"sel":["retail","jasa"],"biz":{"retail":{"name":"Toko Subur"}},"step":2,"sub":0}'::jsonb);
select reg_draft_get()->'sel' as sel_terakhir, reg_draft_get()->>'step' as step;

\echo == C. Isian bukan objek -> ditolak
select reg_draft_save('[1,2]'::jsonb);
reset role;

\echo == D. Pengguna lain tidak melihat draf ini
set role authenticated;
select set_config('request.jwt.claim.sub','e1e1e1e1-0000-0000-0000-000000000002',false), set_config('request.jwt.claims','{"sub":"e1e1e1e1-0000-0000-0000-000000000002","email":"lain@x.com"}',false) \g /dev/null
select reg_draft_get() is null as tidak_melihat_draf_orang_lain;
reset role;

\echo == E. Hapus setelah bisnis dibuat
set role authenticated;
select set_config('request.jwt.claim.sub','e1e1e1e1-0000-0000-0000-000000000001',false), set_config('request.jwt.claims','{"sub":"e1e1e1e1-0000-0000-0000-000000000001","email":"daftar@x.com"}',false) \g /dev/null
select reg_draft_clear();
select reg_draft_get() is null as kosong_setelah_hapus;
reset role;
