-- Uji harga V2, lapisan pembayaran, dan pendaftaran bisnis (PostgreSQL lokal).
-- Bagian 1 (data lama) dijalankan SEBELUM migrasi 202611131*, bagian 2 sesudahnya. Lihat /var/tmp/pgtest/v2pre.sql & v2t.sql.
-- ===== BAGIAN 1: data sebelum migrasi =====
-- data lama sebelum migrasi V2
insert into auth.users(id,email) values ('22222222-2222-2222-2222-222222222222','admin@x.com'),('55555555-5555-5555-5555-555555555555','lama@x.com'),('66666666-6666-6666-6666-666666666666','coba@x.com') on conflict do nothing;
insert into app_admins(email) values ('admin@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,plan_version_id,trial_until,setup_status) values
 ('aaaaaaaa-0000-0000-0000-000000000001','Toko Lama Standar','55555555-5555-5555-5555-555555555555','standar',current_date+40,(select id from plan_versions where plan_key='standar'),current_date-10,'active'),
 ('aaaaaaaa-0000-0000-0000-000000000002','Kos Coba Lama','66666666-6666-6666-6666-666666666666','gratis',null,null,current_date+20,'active'),
 ('aaaaaaaa-0000-0000-0000-000000000003','Kos Pro Lama','55555555-5555-5555-5555-555555555555','pro',current_date+15,(select id from plan_versions where plan_key='pro'),null,'active');
insert into kos_members(kos_id,user_id,role) values ('aaaaaaaa-0000-0000-0000-000000000001','55555555-5555-5555-5555-555555555555','pemilik'),('aaaaaaaa-0000-0000-0000-000000000002','66666666-6666-6666-6666-666666666666','pemilik'),('aaaaaaaa-0000-0000-0000-000000000003','55555555-5555-5555-5555-555555555555','pemilik') on conflict do nothing;
insert into plan_requests(kos_id,user_id,plan,months,amount,method,status,number,unit_price,kind,decided_at) values
 ('aaaaaaaa-0000-0000-0000-000000000001','55555555-5555-5555-5555-555555555555','standar',1,100000,'qris','disetujui','INV-2610-0001',100000,'baru',now()-interval '20 days');
select name, plan, paid_until-current_date sisa, kos_plan(id) berlaku from kos where id::text like 'aaaaaaaa%' order by name;
-- ===== BAGIAN 2: setelah migrasi =====
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on
\set owner '55555555-5555-5555-5555-555555555555'
\set K1 'aaaaaaaa-0000-0000-0000-000000000001'
\set K3 'aaaaaaaa-0000-0000-0000-000000000003'
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner',false), set_config('request.jwt.claims','{"sub":"55555555-5555-5555-5555-555555555555","email":"lama@x.com"}',false) \g /dev/null
\echo == A. Pendaftaran bisnis dengan isian baru
select setup_create('{"category":"properti","name":"Kos Baru V2","relation":"pemilik","location":"Majalengka","phone":"0812-0000-1111","description":"Kos putri dekat kampus","hours":"Setiap hari 08.00-20.00","owner_name":"Dewi","managed":"tim","needs":["keuangan","karyawan"],"answers":{"room_count":3,"prefix":"A"}}') as kb \gset
select contact_phone, profile->>'description' d, profile->>'hours' h, setup_meta->>'owner_name' o, setup_meta->>'managed' m, setup_meta->'needs' n, setup_status from kos where id=:'kb';
select setup_create('{"category":"properti","name":"X Salah","relation":"pemilik","phone":"12","answers":{}}');
select setup_create('{"category":"properti","name":"X Salah2","relation":"pemilik","needs":["hack"],"answers":{}}');
select count(*) draf_salah_tidak_tersimpan from kos where name like 'X Salah%';
select string_agg((x->>'code')||':'||(x->>'done'),' ') ck, setup_checklist(:'kb')->>'active' aktif from jsonb_array_elements(setup_checklist(:'kb')->'items') x;
select setup_item_save(:'kb','kamar','{"count":3,"prefix":"A","price":700000}','setujui') \g /dev/null
select setup_item_save(:'kb','alamat','{"v":"Jl. Baru 1"}','setujui') \g /dev/null
select setup_item_save(:'kb','wa','{"v":"081200001111"}','setujui') \g /dev/null
select setup_item_save(:'kb','rekening','{"v":"BCA 1 a.n. Dewi"}','setujui') \g /dev/null
select setup_approve_recommended(:'kb') \g /dev/null
-- setup_refresh sudah fungsi internal (tidak bisa dipanggil pengguna); status dicek lewat setup_activate di bawah
select setup_activate(:'kb')->>'ok' aktif;
select trial_until - (now() at time zone 'Asia/Jakarta')::date hari_coba, trial_plan, kos_plan(id) berlaku, plan_limit(id,'karyawan') kary, plan_has(id,'portal_penghuni') portal from kos where id=:'kb';
select string_agg((x->>'code')||':'||(x->>'done'),' ') ck from jsonb_array_elements(setup_checklist(:'kb')->'items') x;
select setup_checklist_skip(:'kb','karyawan',true); select setup_checklist(:'kb')->'items'->4->>'skipped' skip_kary;
select setup_checklist_skip(:'kb','semua',true); select setup_checklist(:'kb')->>'hidden' hidden;
\echo == B. Harga & tagihan
select string_agg((x->>'key')||'='||(x->>'price')||'/'||coalesce(x->>'list_price','-'),' ') q from jsonb_array_elements(plan_quote(:'kb')) x;
select request_plan(:'kb','standar',1,'qris');
-- Lynk (gateway) membuat tagihan menunggu sejak migrasi 20261113160000; batalkan agar tagihan berikutnya bisa dibuat
select request_plan(:'kb','pro',12,'gateway') as rg \gset
select status gateway_menunggu from plan_requests where id=:'rg'; select plan_request_cancel(:'rg') \g /dev/null
select request_plan(:'kb','pro',12,'qris') as r1 \gset
select amount, unit_price, kind, number is not null no, status from plan_requests where id=:'r1';
select t.code ~ '^TRX-' kode, t.status, t.amount, t.provider from pay_transactions t where invoice_id=:'r1';
select request_plan(:'kb','dasar',1,'qris');
select plan_request_cancel(:'r1'); select r.status, t.status from plan_requests r join pay_transactions t on t.invoice_id=r.id where r.id=:'r1';
select request_plan(:'kb','dasar',1,'transfer') as r2 \gset
select amount from plan_requests where id=:'r2';
\echo == C. Fungsi internal tertutup bagi pengguna
select plan_activate(:'kb','pro',12,null,'admin');
select invoice_settle(:'r2','admin');
select pay_event_ingest('lynk','evt-000001',true,'{}','{}','{"paid":true,"amount":49000,"email":"lama@x.com"}');
select admin_decide_request(:'r2',true);
insert into pay_transactions(code,invoice_id,kos_id,provider,amount) values ('X',:'r2',:'kb','manual',1);
update pay_transactions set status='paid' where invoice_id=:'r2';
select kos_plan(:'kb') masih_coba;
\echo == D. Orang lain tidak melihat transaksi
select set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666',false), set_config('request.jwt.claims','{"sub":"66666666-6666-6666-6666-666666666666","email":"coba@x.com"}',false) \g /dev/null
select count(*) trx_terlihat_orang_lain from pay_transactions; select count(*) akt from plan_activations;
select my_invoices(:'kb');
\echo == E. Admin menyetujui (jalur manual)
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false), set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","email":"admin@x.com"}',false) \g /dev/null
select admin_decide_request(:'r2',true);
select k.plan, k.paid_until - (now() at time zone 'Asia/Jakarta')::date hari, kos_plan(k.id) from kos k where id=:'kb';
select r.status, t.status, t.paid_at is not null from plan_requests r join pay_transactions t on t.invoice_id=r.id where r.id=:'r2';
select source, plan, months, before->>'berlaku' seb, after->>'berlaku' ses, actor from plan_activations where invoice_id=:'r2';
select admin_decide_request(:'r2',true);
select count(*) aktivasi_r2 from plan_activations where invoice_id=:'r2';
select admin_override(:'K3','beri_paket','pro',1,'kompensasi gangguan'); select source, reason from plan_activations where kos_id=:'K3';
\echo == F. Webhook (notifikasi tanpa tagihan yang cocok -> tidak mengaktifkan apa pun; lihat webhook_aktivasi.sql)
reset role;
select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false) \g /dev/null
select set_config('request.jwt.claim.sub',:'owner',false) \g /dev/null
set role authenticated; select set_config('request.jwt.claims','{"sub":"55555555-5555-5555-5555-555555555555","email":"lama@x.com"}',false) \g /dev/null
select request_plan(:'K1','bisnis',1,'qris') as r3 \gset
select amount from plan_requests where id=:'r3';
reset role; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false) \g /dev/null
select pay_event_ingest('lynk','evt-inactive-1',true,'{"raw":1}','{}','{"paid":true,"amount":99000,"email":"lama@x.com","ref":"L-0"}')->>'status' s0;
update pay_providers set active=true where code='lynk';
select paid_until as pu0 from kos where id=:'K1' \gset
\echo -- tanda tangan tidak sah / tidak bisa diverifikasi
select pay_event_ingest('lynk','evt-badsig-1',false,'{"raw":1}','{}','{"paid":true,"amount":99000,"email":"lama@x.com","ref":"L-1"}')->>'status' s1;
select pay_event_ingest('lynk','evt-nosig-1',null,'{"raw":1}','{}','{"paid":true,"amount":99000,"email":"lama@x.com","ref":"L-1b"}')->>'status' s1b;
\echo -- nominal beda, email tak dikenal, bukan pembayaran berhasil
select pay_event_ingest('lynk','evt-amount-1',true,'{}','{}','{"paid":true,"amount":49000,"email":"lama@x.com","ref":"L-2"}')->>'status' s2;
select pay_event_ingest('lynk','evt-email-1',true,'{}','{}','{"paid":true,"amount":99000,"email":"asing@x.com","ref":"L-3"}')->>'status' s3;
select pay_event_ingest('lynk','evt-pending-1',true,'{}','{}','{"paid":false,"amount":99000,"email":"lama@x.com","ref":"L-4"}')->>'status' s4;
select (select paid_until from kos where id=:'K1') = :'pu0'::date belum_berubah, (select status from plan_requests where id=:'r3') inv;
\echo -- cocok
select pay_event_ingest('lynk','evt-ok-1',true,'{"raw":"x"}','{"h":1}','{"paid":true,"amount":99000,"email":"LAMA@x.com","ref":"L-5","name":"Pak Lama"}')->>'status' s5;
select (select paid_until from kos where id=:'K1') - :'pu0'::date tambah_hari, (select status from plan_requests where id=:'r3') inv;
select t.status, t.provider, t.provider_ref, t.method from pay_transactions t where invoice_id=:'r3';
select source, actor, after->>'bayar_sampai' is not null from plan_activations where invoice_id=:'r3';
\echo -- kirim ulang notifikasi yang sama & ref yang sama dengan kunci lain
select paid_until as pu1 from kos where id=:'K1' \gset
select pay_event_ingest('lynk','evt-ok-1',true,'{"raw":"x"}','{}','{"paid":true,"amount":99000,"email":"lama@x.com","ref":"L-5"}') dup;
select pay_event_ingest('lynk','evt-ok-1b',true,'{}','{}','{"paid":true,"amount":99000,"email":"lama@x.com","ref":"L-5"}')->>'alasan' ref_ganda;
select (select paid_until from kos where id=:'K1') = :'pu1'::date tidak_dobel, (select count(*) from plan_activations where invoice_id=:'r3') n_akt, (select seen from pay_events where event_key='evt-ok-1') seen;
\echo -- dua tagihan cocok sekaligus (email+nominal sama) -> rekonsiliasi
set role authenticated; select set_config('request.jwt.claim.sub',:'owner',false), set_config('request.jwt.claims','{"sub":"55555555-5555-5555-5555-555555555555","email":"lama@x.com"}',false) \g /dev/null
select request_plan(:'K1','pro',1,'qris') as r4 \gset
select request_plan(:'K3','pro',1,'qris') as r5 \gset
reset role; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false) \g /dev/null
select pay_event_ingest('lynk','evt-two-1',true,'{}','{}','{"paid":true,"amount":149000,"email":"lama@x.com","ref":"L-6"}') dua;
\echo -- dengan kode transaksi internal -> tepat satu
select code as c4 from pay_transactions where invoice_id=:'r4' \gset
select pay_event_ingest('lynk','evt-code-1',true,'{}','{}',jsonb_build_object('paid',true,'amount',149000,'ref','L-7','code',:'c4'))->>'status' s7;
select status from plan_requests where id in (:'r4',:'r5') order by (id=:'r4') desc;
\echo -- aktivasi gagal setelah pembayaran sah -> lunas_belum_aktif, bisa diulang admin
alter table plan_requests disable trigger all; update plan_requests set plan='hilang' where id=:'r5'; alter table plan_requests enable trigger all;
select paid_until as pu3 from kos where id=:'K3' \gset
select pay_event_ingest('lynk','evt-fail-1',true,'{}','{}','{"paid":true,"amount":149000,"email":"lama@x.com","ref":"L-8"}')->>'status' s8;
select t.status trx, r.status inv, (select paid_until from kos where id=:'K3') = :'pu3'::date belum_aktif from pay_transactions t join plan_requests r on r.id=t.invoice_id where r.id=:'r5';
alter table plan_requests disable trigger all; update plan_requests set plan='pro' where id=:'r5'; alter table plan_requests enable trigger all;
\echo == G. Rekonsiliasi oleh admin
set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false), set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","email":"admin@x.com"}',false) \g /dev/null
select string_agg(x->>'reason', ',' order by x->>'reason') terbuka from jsonb_array_elements(admin_recon_list()) x where x->>'status'='terbuka';
select (x->>'id') as cf from jsonb_array_elements(admin_recon_list()) x where x->>'reason'='aktivasi_gagal' \gset
select admin_recon_resolve(:'cf','cocokkan',null,'x');
select admin_recon_resolve(:'cf','cocokkan',null,'aktivasi diulang setelah perbaikan');
reset role;   -- periksa sebagai sistem (RLS menyembunyikan kos & aktivasi pelanggan dari akun admin uji)
select r.status inv, (select paid_until from kos where id=:'K3') > :'pu3'::date aktif, (select source from plan_activations where invoice_id=:'r5') sumber from plan_requests r where id=:'r5';
set role authenticated;
select (x->>'id') as cs from jsonb_array_elements(admin_recon_list()) x where x->>'reason'='tanda_tangan' limit 1 \gset
select admin_recon_resolve(:'cs','cocokkan',:'r5','coba paksa');
select admin_recon_resolve(:'cs','abaikan',null,'notifikasi palsu');
\echo -- pembayaran nominal beda dicocokkan ke tagihan yang nominalnya lain -> ditolak
reset role; select set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','',false) \g /dev/null
set role authenticated; select set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666',false), set_config('request.jwt.claims','{"sub":"66666666-6666-6666-6666-666666666666","email":"coba@x.com"}',false) \g /dev/null
select request_plan('aaaaaaaa-0000-0000-0000-000000000002','dasar',1,'qris') as r6 \gset
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false), set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","email":"admin@x.com"}',false) \g /dev/null
select (x->>'id') as ca from jsonb_array_elements(admin_recon_list()) x where x->>'reason'='tidak_ada_tagihan' and x->'detail'->>'ref'='L-3' \gset
select admin_recon_resolve(:'ca','cocokkan',:'r6','email pembayar beda');
select (x->>'id') as cb from jsonb_array_elements(admin_recon_list()) x where x->>'reason'='tidak_ada_tagihan' and x->'detail'->>'ref'='L-2' \gset
select admin_recon_resolve(:'cb','cocokkan',:'r6','pelanggan bayar dengan email lain');
select r.status, t.provider_ref, kos_plan(r.kos_id) from plan_requests r join pay_transactions t on t.invoice_id=r.id where r.id=:'r6';
reset role; select count(*) log_rekon from admin_log where action='rekonsiliasi';
set role authenticated;
\echo == H. Promosi berakhir bila admin mengisi tanggal; harga & pengaturan admin
select admin_setting_save('promo_until', to_jsonb((current_date-1)::text));
select string_agg((x->>'key')||'='||(x->>'price')||'/'||coalesce(x->>'list_price','-'),' ') from jsonb_array_elements(plans_public()) x;
select admin_setting_save('promo_until', 'null'::jsonb);
select string_agg((x->>'key')||'='||(x->>'price'),' ') from jsonb_array_elements(plans_public()) x;
select admin_plan_version('dasar',59000,'{"karyawan":"1","lampiran_mb":"500"}','{ekspor}','harga_baru','uji harga',50000);
select admin_plan_term_save('bisnis',12,990000,1188000,true,'uji tahunan bisnis');
reset role; select plan_total(:'K1','bisnis',12) t12, plan_total(:'K1','bisnis',3) t3;   -- plan_total fungsi internal
set role authenticated;
select (admin_overview()->'plans') plans;
reset role;
select count(*) trx, count(distinct code) kode_unik from pay_transactions;
select status, count(*) from pay_events group by 1 order by 1;
