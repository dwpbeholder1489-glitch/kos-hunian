-- Uji aturan longgar (akhiri sewa kapan pun, rencana selesai, booking/langsung huni, jasa, reservasi) + cara bayar halaman bisnis semua jenis.
-- Jalankan di database baru: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/fleksibel_cara_bayar.sql"
-- Lulus = semua kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('f1f1f1f1-0000-0000-0000-000000000001','fleks@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('f1f1f1f1-0000-0000-0000-00000000000a','Kos Fleksibel','f1f1f1f1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','properti'),
  ('f1f1f1f1-0000-0000-0000-00000000000b','Laundry Fleksibel','f1f1f1f1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','jasa');
insert into kos_members(kos_id,user_id,role) values ('f1f1f1f1-0000-0000-0000-00000000000a','f1f1f1f1-0000-0000-0000-000000000001','pemilik'),
  ('f1f1f1f1-0000-0000-0000-00000000000b','f1f1f1f1-0000-0000-0000-000000000001','pemilik') on conflict do nothing;
insert into rooms(id,kos_id,code,rent,status) values
  ('f1f1f1f1-0000-0000-0000-0000000000a1','f1f1f1f1-0000-0000-0000-00000000000a','A1',1000000,'tersedia'),
  ('f1f1f1f1-0000-0000-0000-0000000000a2','f1f1f1f1-0000-0000-0000-00000000000a','A2',1000000,'tersedia'),
  ('f1f1f1f1-0000-0000-0000-0000000000a3','f1f1f1f1-0000-0000-0000-00000000000a','A3',1000000,'tersedia');
insert into occupants(id,kos_id,name,phone) values
  ('f1f1f1f1-0000-0000-0000-0000000000b1','f1f1f1f1-0000-0000-0000-00000000000a','Andi','081200000001'),
  ('f1f1f1f1-0000-0000-0000-0000000000b2','f1f1f1f1-0000-0000-0000-00000000000a','Budi','081200000002'),
  ('f1f1f1f1-0000-0000-0000-0000000000b3','f1f1f1f1-0000-0000-0000-00000000000a','Cici','081200000003');
\set K 'f1f1f1f1-0000-0000-0000-00000000000a'
set role authenticated;
select set_config('request.jwt.claim.sub', 'f1f1f1f1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"f1f1f1f1-0000-0000-0000-000000000001","email":"fleks@x.com"}', false) \g /dev/null

\echo == A. Penghuni yang tanggal masuknya belum tiba bisa diakhiri (batal masuk)
select start_lease('f1f1f1f1-0000-0000-0000-0000000000a1','f1f1f1f1-0000-0000-0000-0000000000b1', current_date + 5, 1000000, current_date + 5, null) as l1 \gset
select generate_invoices(:'K', 7) \g /dev/null
select count(*) = 1 a_ada_tagihan_pertama from invoices where lease_id = :'l1' and status <> 'batal';
select end_lease(:'l1', current_date, 'batal pindah') as r \gset
select (:'r'::jsonb ->> 'before_start')::boolean a_batal_masuk, (:'r'::jsonb ->> 'cancelled')::int = 1 a_tagihan_dibatalkan;
select status = 'selesai' and end_date = start_date and end_reason like 'Batal sebelum masuk%' a_sewa_ditutup from leases where id = :'l1';
select status = 'tersedia' a_kamar_kosong from rooms where id = 'f1f1f1f1-0000-0000-0000-0000000000a1';

\echo == B. Tanggal keluar masa depan = rencana selesai (bukan ditolak); keluar lebih awal dari rencana
select start_lease('f1f1f1f1-0000-0000-0000-0000000000a2','f1f1f1f1-0000-0000-0000-0000000000b2', current_date - 70, 1000000, current_date - 70, null) as l2 \gset
select generate_invoices(:'K', 7) \g /dev/null
select (end_lease(:'l2', current_date + 45, null) ->> 'planned')::boolean b_jadi_rencana;
select status = 'aktif' and end_date = current_date + 45 b_masih_aktif from leases where id = :'l2';
select generate_invoices(:'K', 60) \g /dev/null
select count(*) b_jumlah_tagihan_sd_rencana from invoices where lease_id = :'l2' and status <> 'batal';
-- penghuni ternyata keluar lebih awal (kemarin)
select end_lease(:'l2', current_date - 1, 'keluar lebih awal') as r2 \gset
select (:'r2'::jsonb ->> 'planned')::boolean = false b_diakhiri, (:'r2'::jsonb ->> 'cancelled')::int >= 1 b_tagihan_sesudah_keluar_batal;
select status = 'selesai' and end_date = current_date - 1 b_sewa_selesai from leases where id = :'l2';

\echo == C. Rencana selesai dimajukan → tagihan belum dibayar dibatalkan otomatis; diperpanjang lagi → dipulihkan
select start_lease('f1f1f1f1-0000-0000-0000-0000000000a3','f1f1f1f1-0000-0000-0000-0000000000b3', current_date - 40, 1000000, current_date - 40, null) as l3 \gset
select generate_invoices(:'K', 40) \g /dev/null
select count(*) as n_awal from invoices where lease_id = :'l3' and status <> 'batal' \gset
select lease_set_end(:'l3', current_date - 5) \g /dev/null
select count(*) < :n_awal c_tagihan_dibatalkan from invoices where lease_id = :'l3' and status <> 'batal';
select max(period_end) = current_date - 5 c_periode_terakhir_ikut from invoices where lease_id = :'l3' and status <> 'batal';
select lease_set_end(:'l3', null) \g /dev/null
select count(*) = :n_awal c_tagihan_dipulihkan from invoices where lease_id = :'l3' and status <> 'batal';
select bool_and(period_end > period_start + 20) c_periode_penuh_lagi from invoices where lease_id = :'l3' and status <> 'batal';
-- tagihan yang sudah dibayar tidak dibatalkan diam-diam
select id as inv_last from invoices where lease_id = :'l3' and status <> 'batal' order by period_start desc limit 1 \gset
reset role;
insert into payments(kos_id, invoice_id, amount, paid_at, method, status, verified_at) values (:'K', :'inv_last', 1000000, current_date, 'transfer', 'terverifikasi', now());
set role authenticated;
select set_config('t.l3', :'l3', false) \g /dev/null
do $$ declare m text; begin
  begin perform lease_set_end(current_setting('t.l3')::uuid, current_date - 5); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like '%sudah dibayar penghuni%' then raise exception 'C_GAGAL: %', m; end if; raise notice 'c_OK: tagihan yang sudah dibayar menahan rencana selesai (%)', m;
end $$;
-- akhiri sewa sebelum periode yang sudah dibayar → diberi tahu jumlah yang perlu diputuskan
select (end_lease(:'l3', current_date - 5, null) ->> 'paid_after')::numeric = 1000000 c_info_uang_sesudah_keluar;

\echo == D. Booking: tanggal masuk sampai 31 hari ke belakang
select booking_create(gen_random_uuid(), :'K', jsonb_build_object('room_id','f1f1f1f1-0000-0000-0000-0000000000a1','name','Dodi','check_in', current_date - 20, 'months', 1, 'rent', 1000000)) is not null d_booking_20_hari_lalu;
do $$ declare m text; begin
  begin perform booking_create(gen_random_uuid(), 'f1f1f1f1-0000-0000-0000-00000000000a', jsonb_build_object('room_id','f1f1f1f1-0000-0000-0000-0000000000a1','name','Eko','check_in', current_date - 40, 'months', 1, 'rent', 1000000));
  exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tanggal masuk lebih dari sebulan%' then raise exception 'D_GAGAL: %', m; end if; raise notice 'd_OK: lebih dari sebulan ditolak';
end $$;

\echo == E. Jasa: pelanggan antar sendiri; pesanan siap masih bisa diubah
\set J 'f1f1f1f1-0000-0000-0000-00000000000b'
select svc_service_save(:'J', null, jsonb_build_object('name','Cuci kiloan','unit','kg','price',7000)) as svc \gset
select svc_order_create(gen_random_uuid(), :'J', jsonb_build_object('name','Fani','phone','081299990000','pickup',true,'address','Jl. Melati 1',
  'lines', jsonb_build_array(jsonb_build_object('service_id', :'svc', 'qty', 3)))) as o \gset
select (:'o'::jsonb ->> 'id') as oid \gset
select svc_pickup(:'oid', 'sendiri', null) e_antar_sendiri;
select pickup_status = 'dijemput' e_tercatat from svc_orders where id = :'oid';
select svc_order_move(:'oid', 'siap', null) \g /dev/null
select status = 'siap' e_siap from svc_orders where id = :'oid';
select svc_order_edit(:'oid', jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('service_id', :'svc', 'qty', 4)))) is not null e_ubah_saat_siap;
select total = 28000 e_total_baru from svc_orders where id = :'oid';

\echo == F. Cara bayar halaman bisnis untuk jasa
reset role;
update kos set payment_info = 'BRI 123 a.n. Fani', profile = coalesce(profile, '{}') || '{"payment_methods":["QRIS","Transfer bank"]}' where id = :'J';
insert into public_pages(kos_id, slug, enabled, show_payment) values (:'J', 'laundry-fleksibel', true, false);
set role anon;
select public_pay_info('laundry-fleksibel') is null f_mati_tidak_tampil;
reset role; set role authenticated;
select public_page_set_payment(:'J', true) \g /dev/null
set role anon;
select public_pay_info('laundry-fleksibel') ->> 'payment_info' = 'BRI 123 a.n. Fani' f_tampil_untuk_jasa;
reset role;
update kos set payment_info = null where id = :'J';
set role anon;
select public_pay_info('laundry-fleksibel') is null f_tanpa_isi_tidak_tampil;
