-- Uji batas bayar tagihan pertama penghuni baru (leases.first_due) + bayar saat check-in.
-- Jalankan di database baru: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/tagihan_pertama.sql"
-- Lulus = semua kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('e1e1e1e1-0000-0000-0000-000000000001','tp@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('e1e1e1e1-0000-0000-0000-00000000000a','Kos Tagihan','e1e1e1e1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','properti');
insert into kos_members(kos_id,user_id,role) values ('e1e1e1e1-0000-0000-0000-00000000000a','e1e1e1e1-0000-0000-0000-000000000001','pemilik');
insert into rooms(id,kos_id,code,rent,status) values
  ('e1e1e1e1-0000-0000-0000-0000000000a1','e1e1e1e1-0000-0000-0000-00000000000a','B1',500000,'tersedia'),
  ('e1e1e1e1-0000-0000-0000-0000000000a2','e1e1e1e1-0000-0000-0000-00000000000a','B2',500000,'tersedia');
\set K 'e1e1e1e1-0000-0000-0000-00000000000a'
set role authenticated;
select set_config('request.jwt.claim.sub', 'e1e1e1e1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"e1e1e1e1-0000-0000-0000-000000000001","email":"tp@x.com"}', false) \g /dev/null

\echo == A. Check-in hari ini, batas bayar 3 hari lagi, belum bayar → tagihan TIDAK jatuh tempo hari ini; periode tetap mulai hari ini
select booking_create('e1e1e1e1-0000-0000-0000-0000000000b1', :'K', jsonb_build_object('room_id','e1e1e1e1-0000-0000-0000-0000000000a1','name','Dewi','check_in', current_date, 'rent', 500000)) \g /dev/null
select booking_checkin('e1e1e1e1-0000-0000-0000-0000000000b1', jsonb_build_object('start', current_date, 'first_due', current_date + 3)) ->> 'lease_id' as l1 \gset
select period_start = current_date a_periode_mulai_hari_ini, due_date = current_date + 3 a_jatuh_tempo_3_hari, status = 'terbit' a_belum_bayar
  from invoices where lease_id = :'l1' and kind = 'sewa';
select end_date is null a_tanpa_rencana_selesai_otomatis from leases where id = :'l1';
-- bulan berikutnya tetap jatuh tempo di awal periode
select generate_invoices(:'K', 40) \g /dev/null
select due_date = period_start a_bulan_kedua_normal from invoices where lease_id = :'l1' and kind = 'sewa' order by period_start desc limit 1;

\echo == B. Batas bayar diubah lagi dari detail penghuni
select lease_first_due(:'l1', current_date + 7) \g /dev/null
select due_date = current_date + 7 b_ikut_berubah from invoices where lease_id = :'l1' and kind = 'sewa' order by period_start limit 1;
select set_config('t.l1', :'l1', false) \g /dev/null
do $$ declare m text; begin
  begin perform lease_first_due(current_setting('t.l1')::uuid, current_date - 1); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Batas bayar tidak boleh sebelum%' then raise exception 'B_GAGAL: %', m; end if; raise notice 'b_OK: sebelum awal sewa ditolak';
end $$;

\echo == C. Check-in sambil menerima pembayaran sewa pertama (tunai) → lunas, tidak muncul sebagai tunggakan
select booking_create('e1e1e1e1-0000-0000-0000-0000000000b2', :'K', jsonb_build_object('room_id','e1e1e1e1-0000-0000-0000-0000000000a2','name','Eka','check_in', current_date, 'rent', 500000)) \g /dev/null
select booking_checkin('e1e1e1e1-0000-0000-0000-0000000000b2', jsonb_build_object('start', current_date, 'paid_amount', 500000, 'paid_method', 'tunai')) ->> 'lease_id' as l2 \gset
select s.outstanding = 0 c_lunas from invoice_summary s where s.lease_id = :'l2' and s.kind = 'sewa';
select count(*) = 1 c_satu_pembayaran from payments p join invoices i on i.id = p.invoice_id where i.lease_id = :'l2' and p.status = 'terverifikasi' and p.method = 'tunai';
