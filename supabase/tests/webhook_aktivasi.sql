-- Uji aktivasi otomatis Lynk (PostgreSQL lokal, database hasil fresh.sh).
-- Hanya notifikasi yang lolos semua pemeriksaan yang boleh mengaktifkan paket:
--   tanda tangan sah + sudah dibayar + ref belum pernah dipakai + nominal = tagihan + email = pemilik + tepat satu tagihan.
-- Setiap kasus negatif harus TIDAK mengubah paket.

insert into auth.users(id,email) values ('77777777-7777-7777-7777-777777777777','bayar@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status) values
  ('bbbbbbbb-0000-0000-0000-000000000001','Kos Uji Lynk','77777777-7777-7777-7777-777777777777','gratis',null,null,'active');
insert into kos_members(kos_id,user_id,role) values ('bbbbbbbb-0000-0000-0000-000000000001','77777777-7777-7777-7777-777777777777','pemilik') on conflict do nothing;

\set K 'bbbbbbbb-0000-0000-0000-000000000001'
\set owner '77777777-7777-7777-7777-777777777777'

\echo == A. Penyedia Lynk aktif
select code, active from pay_providers where code = 'lynk';

\echo == B. Tagihan 1 (dasar 1 bulan, QRIS) lalu pembayaran Lynk yang cocok
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner',false), set_config('request.jwt.claims','{"sub":"77777777-7777-7777-7777-777777777777","email":"bayar@x.com"}',false) \g /dev/null
select request_plan(:'K','dasar',1,'qris') as inv1 \gset
reset role;
select amount, status from plan_requests where id = :'inv1';

-- 49000 persis harga; email = pemilik
select pay_event_ingest('lynk','uji-kunci-0001',true,'{}','{}',
  '{"event":"payment.received","action":"SUCCESS","paid":true,"amount":49000,"email":"bayar@x.com","ref":"REF-UJI-0001"}'::jsonb)->>'status' as hasil_b1;
select r.status, r.plan, k.paid_until - current_date as sisa_hari from plan_requests r join kos k on k.id = r.kos_id where r.id = :'inv1';
select kos.plan, kos.paid_until - current_date as sisa_hari from kos where id = :'K';
select source, plan, months, transaction_id is not null as ada_trx from plan_activations where kos_id = :'K';

\echo == C. Notifikasi yang sama dikirim ulang: tidak boleh aktif dua kali
select pay_event_ingest('lynk','uji-kunci-0001',true,'{}','{}',
  '{"event":"payment.received","action":"SUCCESS","paid":true,"amount":49000,"email":"bayar@x.com","ref":"REF-UJI-0001"}'::jsonb)->>'status' as hasil_c;
select count(*) jumlah_aktivasi from plan_activations where kos_id = :'K';

\echo == D. Tagihan 2 untuk percobaan negatif
set role authenticated;
select set_config('request.jwt.claim.sub',:'owner',false), set_config('request.jwt.claims','{"sub":"77777777-7777-7777-7777-777777777777","email":"bayar@x.com"}',false) \g /dev/null
select request_plan(:'K','dasar',1,'qris') as inv2 \gset
reset role;
select amount, status from plan_requests where id = :'inv2';

\echo == D1. Tanda tangan tidak sah -> ditolak, tagihan tetap menunggu
select pay_event_ingest('lynk','uji-kunci-0002',false,'{}','{}',
  '{"event":"payment.received","action":"SUCCESS","paid":true,"amount":49000,"email":"bayar@x.com","ref":"REF-UJI-0002"}'::jsonb)->>'status' as hasil_d1;
select status from plan_requests where id = :'inv2';

\echo == D2. Belum dibayar (paid false) -> diabaikan
select pay_event_ingest('lynk','uji-kunci-0003',true,'{}','{}',
  '{"event":"payment.received","action":"PENDING","paid":false,"amount":49000,"email":"bayar@x.com","ref":"REF-UJI-0003"}'::jsonb)->>'status' as hasil_d2;
select status from plan_requests where id = :'inv2';

\echo == D3. Nominal termasuk biaya layanan (2014 bukan harga 49000) -> tidak cocok
select pay_event_ingest('lynk','uji-kunci-0004',true,'{}','{}',
  '{"event":"payment.received","action":"SUCCESS","paid":true,"amount":53000,"email":"bayar@x.com","ref":"REF-UJI-0004"}'::jsonb)->>'status' as hasil_d3;
select status from plan_requests where id = :'inv2';

\echo == D4. Email berbeda dari pemilik -> tidak cocok
select pay_event_ingest('lynk','uji-kunci-0005',true,'{}','{}',
  '{"event":"payment.received","action":"SUCCESS","paid":true,"amount":49000,"email":"orang.lain@x.com","ref":"REF-UJI-0005"}'::jsonb)->>'status' as hasil_d4;
select status from plan_requests where id = :'inv2';

\echo == D5. Nomor transaksi (ref) yang sama dengan pembayaran sebelumnya -> ref_ganda
select pay_event_ingest('lynk','uji-kunci-0006',true,'{}','{}',
  '{"event":"payment.received","action":"SUCCESS","paid":true,"amount":49000,"email":"bayar@x.com","ref":"REF-UJI-0001"}'::jsonb)->>'status' as hasil_d5;
select status from plan_requests where id = :'inv2';
select reason, status from pay_recon order by created_at;

\echo == E. Pembayaran sah untuk tagihan 2 setelah semua percobaan negatif -> aktif (perpanjang)
select pay_event_ingest('lynk','uji-kunci-0007',true,'{}','{}',
  '{"event":"payment.received","action":"SUCCESS","paid":true,"amount":49000,"email":"bayar@x.com","ref":"REF-UJI-0007"}'::jsonb)->>'status' as hasil_e;
select status from plan_requests where id = :'inv2';
select count(*) jumlah_aktivasi from plan_activations where kos_id = :'K';
select kos.plan, kos.paid_until - current_date as sisa_hari from kos where id = :'K';
