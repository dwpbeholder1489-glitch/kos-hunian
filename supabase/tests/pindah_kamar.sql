-- Uji pindah kamar penghuni (lease_move_room). Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/pindah_kamar.sql"
-- Lulus = semua kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('c1c1c1c1-0000-0000-0000-000000000001','pk@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('c1c1c1c1-0000-0000-0000-00000000000a','Kos Pindah','c1c1c1c1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','properti');
insert into kos_members(kos_id,user_id,role) values ('c1c1c1c1-0000-0000-0000-00000000000a','c1c1c1c1-0000-0000-0000-000000000001','pemilik');
insert into rooms(id,kos_id,code,rent,status) values
  ('c1c1c1c1-0000-0000-0000-0000000000a1','c1c1c1c1-0000-0000-0000-00000000000a','A1',500000,'tersedia'),
  ('c1c1c1c1-0000-0000-0000-0000000000a2','c1c1c1c1-0000-0000-0000-00000000000a','A2',700000,'tersedia'),
  ('c1c1c1c1-0000-0000-0000-0000000000a3','c1c1c1c1-0000-0000-0000-00000000000a','A3',600000,'tersedia');
insert into occupants(id,kos_id,name,phone) values ('c1c1c1c1-0000-0000-0000-0000000000b1','c1c1c1c1-0000-0000-0000-00000000000a','Rani','081200000009');
\set K 'c1c1c1c1-0000-0000-0000-00000000000a'
set role authenticated;
select set_config('request.jwt.claim.sub', 'c1c1c1c1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-000000000001","email":"pk@x.com"}', false) \g /dev/null

-- Rani masuk A1 40 hari lalu (Rp500rb), sudah bayar bulan 1, bulan 2 (berjalan) & bulan 3 (dibayar di muka), deposit 300rb
select start_lease('c1c1c1c1-0000-0000-0000-0000000000a1','c1c1c1c1-0000-0000-0000-0000000000b1', current_date - 40, 500000, current_date - 40, null) as l1 \gset
select generate_invoices(:'K', 60) \g /dev/null
select deposit_add(gen_random_uuid(), :'l1', 'terima', 300000, current_date - 40, 'kas', null, null) \g /dev/null
reset role;
insert into payments(kos_id, invoice_id, amount, paid_at, method, status, verified_at)
  select :'K', id, amount, current_date - 1, 'transfer', 'terverifikasi', now() from invoices where lease_id = :'l1' and kind = 'sewa' order by period_start limit 3;
set role authenticated;
select count(*) as n_l1 from invoices where lease_id = :'l1' and kind = 'sewa' and status <> 'batal' \gset

\echo == A. Penolakan yang wajar
select set_config('t.l1', :'l1', false) \g /dev/null
do $$ declare m text; begin
  begin perform lease_move_room(current_setting('t.l1')::uuid, jsonb_build_object('room_id','c1c1c1c1-0000-0000-0000-0000000000a1')); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Kamar tujuan sama%' then raise exception 'A_GAGAL sama: %', m; end if;
  m := null;
  begin perform lease_move_room(current_setting('t.l1')::uuid, jsonb_build_object('room_id','c1c1c1c1-0000-0000-0000-0000000000a2', 'date', current_date + 3)); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tanggal pindah belum tiba%' then raise exception 'A_GAGAL depan: %', m; end if;
  raise notice 'a_OK: kamar sama & tanggal depan ditolak dengan penjelasan';
end $$;

\echo == B. Pindah hari ini ke A2 (Rp700rb), selisih bulan berjalan Rp100rb
select lease_move_room(:'l1', jsonb_build_object('room_id','c1c1c1c1-0000-0000-0000-0000000000a2', 'rent', 700000, 'extra', 100000, 'reason', 'minta kamar lebih besar')) as r \gset
select (:'r'::jsonb ->> 'lease_id') as l2 \gset
select status = 'selesai' and end_date = current_date and end_reason like 'Pindah ke kamar A2%' b_sewa_lama_ditutup from leases where id = :'l1';
select (select status from rooms where code = 'A1' and kos_id = :'K') = 'tersedia' b_a1_kosong, (select status from rooms where code = 'A2' and kos_id = :'K') = 'terisi' b_a2_terisi;
select status = 'aktif' and rent = 700000 and prev_lease_id = :'l1' and occupant_id = 'c1c1c1c1-0000-0000-0000-0000000000b1' b_sewa_baru from leases where id = :'l2';
-- siklus tagihan dilanjutkan: billing_start sewa baru = awal periode berikutnya pada tanggal yang sama
select (select billing_start from leases where id = :'l2') = (select min(period_start) from invoices where kind = 'sewa' and period_start >= current_date and (lease_id = :'l1' or lease_id = :'l2')) b_siklus_sama;
-- bulan 3 yang dibayar di muka pindah ke sewa baru (uangnya tidak hilang)
select :'r'::jsonb ->> 'moved_paid' = '1' b_lunas_dimuka_dipindah;
select not exists (select 1 from invoices where lease_id = :'l2' and kind = 'sewa' and status <> 'batal' group by period_start having count(*) > 1) b_tidak_ada_periode_dobel;
select (:'r'::jsonb ->> 'deposit')::numeric = 300000 b_deposit_ikut, (select count(*) from deposits where lease_id = :'l2') = 1 b_deposit_di_sewa_baru;
select count(*) = 1 b_tagihan_selisih from invoices where lease_id = :'l2' and kind = 'tambahan' and amount = 100000;
-- tagihan lama yang belum dibayar sesudah tanggal pindah dibatalkan; tunggakan/periode berjalan tetap
select count(*) >= 1 b_ada_yang_dibatalkan from invoices where lease_id = :'l1' and status = 'batal' and cancel_reason like 'Otomatis: pindah ke kamar%';
-- periode berikutnya sesudah yang sudah dibayar ditagih harga baru
select generate_invoices(:'K', 120) \g /dev/null
select bool_and(amount = 700000) b_harga_baru_untuk_periode_baru from invoices i where lease_id = :'l2' and kind = 'sewa' and status <> 'batal'
  and not exists (select 1 from payments p where p.invoice_id = i.id);

\echo == C. Kamar dibooking tidak bisa jadi tujuan
select booking_create(gen_random_uuid(), :'K', jsonb_build_object('room_id','c1c1c1c1-0000-0000-0000-0000000000a3','name','Tono','check_in', current_date + 5, 'rent', 600000)) \g /dev/null
select set_config('t.l2', :'l2', false) \g /dev/null
do $$ declare m text; begin
  begin perform lease_move_room(current_setting('t.l2')::uuid, jsonb_build_object('room_id','c1c1c1c1-0000-0000-0000-0000000000a3')); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like '%sudah dibooking%' then raise exception 'C_GAGAL: %', m; end if; raise notice 'c_OK: kamar dibooking ditolak';
end $$;
