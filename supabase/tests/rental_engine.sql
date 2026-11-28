-- Uji Universal Rental Engine (migrasi 20261128171000). Database baru (semua migrasi + harness/mock_supabase.sql).
-- Lulus = setiap kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('f1f1f1f1-0000-0000-0000-000000000001','re@x.com'), ('f1f1f1f1-0000-0000-0000-000000000002','luar2@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('f1f1f1f1-0000-0000-0000-00000000000a','Guest House Uji','f1f1f1f1-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','properti');
insert into kos_members(kos_id,user_id,role) values ('f1f1f1f1-0000-0000-0000-00000000000a','f1f1f1f1-0000-0000-0000-000000000001','pemilik');
insert into rooms(id,kos_id,code,rent,status) select ('f1f1f1f1-0000-0000-0000-0000000000a' || g)::uuid, 'f1f1f1f1-0000-0000-0000-00000000000a', 'R' || g, 1500000, 'tersedia' from generate_series(1,6) g;
insert into occupants(id,kos_id,name) select ('f1f1f1f1-0000-0000-0000-0000000000b' || g)::uuid, 'f1f1f1f1-0000-0000-0000-00000000000a', 'Tamu ' || g from generate_series(1,6) g;
\set K 'f1f1f1f1-0000-0000-0000-00000000000a'
set role authenticated;
select set_config('request.jwt.claim.sub', 'f1f1f1f1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"f1f1f1f1-0000-0000-0000-000000000001","email":"re@x.com"}', false) \g /dev/null

\echo == A. Tarif & aturan
select rental_rate_save(:'K', null, '{"unit":"hari","price":300000}') \g /dev/null
select rental_rate_save(:'K', null, '{"unit":"jam","price":50000,"min_qty":2}') \g /dev/null
select rental_rate_save(:'K', null, '{"unit":"minggu","price":1000000}') \g /dev/null
select rental_rule_save(:'K', null, '{"name":"Akhir pekan","kind":"hari_pekan","days":[6,7],"adj_kind":"persen","adj_value":20,"units":["hari"]}') \g /dev/null
select rental_rule_save(:'K', null, '{"name":"Seminggu","kind":"durasi","min_qty":7,"adj_kind":"persen","adj_value":-10,"units":["hari"]}') \g /dev/null
select rental_rule_save(:'K', null, '{"name":"Festival","kind":"musim","start_date":"2027-03-10","end_date":"2027-03-12","adj_kind":"nominal","adj_value":50000}') \g /dev/null
select (rental_quote(:'K', 'f1f1f1f1-0000-0000-0000-0000000000a1', 'hari', rental_day('2027-03-05'), rental_day('2027-03-08')) ->> 'total')::numeric = 1020000 a_akhir_pekan;
select (rental_quote(:'K', 'f1f1f1f1-0000-0000-0000-0000000000a2', 'hari', rental_day('2027-03-01'), rental_day('2027-03-08')) ->> 'total')::numeric = 1998000 a_diskon_durasi;
select (rental_quote(:'K', 'f1f1f1f1-0000-0000-0000-0000000000a2', 'hari', rental_day('2027-03-10'), rental_day('2027-03-12')) ->> 'total')::numeric = 700000 a_musim_nominal;
select (rental_quote(:'K', 'f1f1f1f1-0000-0000-0000-0000000000a2', 'jam', '2027-03-06 10:00+07', '2027-03-06 12:30+07') ->> 'total')::numeric = 150000 a_per_jam_dibulatkan_naik;
select (rental_quote(:'K', 'f1f1f1f1-0000-0000-0000-0000000000a2', 'bulan', rental_day('2027-03-01'), null) ->> 'total')::numeric = 1500000 a_bulanan_dari_harga_kamar;
do $$ declare m text; n int := 0; begin
  begin perform rental_quote('f1f1f1f1-0000-0000-0000-00000000000a', 'f1f1f1f1-0000-0000-0000-0000000000a2', 'jam', '2027-03-06 10:00+07', '2027-03-06 11:00+07'); exception when others then m := sqlerrm; n := n + 1; end;
  if coalesce(m, '') not like 'Minimal sewa 2%' then raise exception 'A_GAGAL minimal: %', m; end if;
  begin perform rental_quote('f1f1f1f1-0000-0000-0000-00000000000a', 'f1f1f1f1-0000-0000-0000-0000000000a2', 'tahun', rental_day('2027-03-01'), null); exception when others then m := sqlerrm; n := n + 1; end;
  if coalesce(m, '') not like 'Tarif per tahun%' then raise exception 'A_GAGAL tanpa tarif: %', m; end if;
  raise notice 'a_OK: minimal sewa & tarif belum diatur ditolak dengan penjelasan';
end $$;

\echo == B. Booking per malam di kamar yang sama tanpa bertumpuk
select booking_create('f1f1f1f1-0000-0000-0000-0000000000c1', :'K', '{"room_id":"f1f1f1f1-0000-0000-0000-0000000000a1","name":"Andi","unit":"hari","check_in":"2027-03-05","check_out":"2027-03-08"}') \g /dev/null
select booking_create('f1f1f1f1-0000-0000-0000-0000000000c2', :'K', '{"room_id":"f1f1f1f1-0000-0000-0000-0000000000a1","name":"Budi","unit":"hari","check_in":"2027-03-08","check_out":"2027-03-10"}') \g /dev/null
select total = 1020000 and unit = 'hari' and check_out = '2027-03-08' b_booking_tersimpan from bookings where id = 'f1f1f1f1-0000-0000-0000-0000000000c1';
select count(*) = 2 b_dua_booking_satu_kamar from bookings where room_id = 'f1f1f1f1-0000-0000-0000-0000000000a1' and status = 'aktif';
do $$ declare n int := 0; m text; begin
  begin perform booking_create(gen_random_uuid(), 'f1f1f1f1-0000-0000-0000-00000000000a', '{"room_id":"f1f1f1f1-0000-0000-0000-0000000000a1","name":"Cici","unit":"hari","check_in":"2027-03-07","check_out":"2027-03-09"}'); exception when others then n := n + 1; m := sqlerrm; end;
  begin perform booking_create(gen_random_uuid(), 'f1f1f1f1-0000-0000-0000-00000000000a', '{"room_id":"f1f1f1f1-0000-0000-0000-0000000000a1","name":"Dodi","check_in":"2027-03-01","rent":1500000}'); exception when others then n := n + 1; end;
  if n <> 2 or m not like '%sudah dibooking Andi%' then raise exception 'B_GAGAL bentrok: % %', n, m; end if;
  raise notice 'b_OK: booking bertumpuk (harian & bulanan) ditolak: %', m;
end $$;
select booking_create('f1f1f1f1-0000-0000-0000-0000000000c3', :'K', '{"room_id":"f1f1f1f1-0000-0000-0000-0000000000a1","name":"Eko","check_in":"2027-04-01","rent":1500000}') \g /dev/null
select unit = 'bulan' and check_out is null and rent = 1500000 b_booking_bulanan_jalur_lama from bookings where id = 'f1f1f1f1-0000-0000-0000-0000000000c3';
do $$ declare m text; begin
  begin perform booking_create(gen_random_uuid(), 'f1f1f1f1-0000-0000-0000-00000000000a', '{"room_id":"f1f1f1f1-0000-0000-0000-0000000000a1","name":"Fani","unit":"hari","check_in":"2027-05-01","check_out":"2027-05-02"}'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like '%sudah dibooking Eko%' then raise exception 'B_GAGAL bulanan terbuka: %', m; end if;
  raise notice 'b_OK: booking bulanan tanpa akhir mengunci kamar sejak tanggal masuk';
end $$;
select jsonb_array_length(rental_calendar(:'K', '2027-03-01', '2027-03-31') -> 'items') = 2 b_kalender;

\echo == C. Check-in booking harian hari ini → satu tagihan seluruh masa sewa
select booking_create('f1f1f1f1-0000-0000-0000-0000000000c4', :'K', jsonb_build_object('room_id','f1f1f1f1-0000-0000-0000-0000000000a3','name','Gita','unit','hari',
  'check_in', current_date, 'check_out', current_date + 2, 'dp_amount', 100000, 'dp_account', 'kas')) \g /dev/null
select booking_checkin('f1f1f1f1-0000-0000-0000-0000000000c4', '{}') ->> 'lease_id' as l4 \gset
select cycle = 'hari' and stay_total = (select total from bookings where id = 'f1f1f1f1-0000-0000-0000-0000000000c4') and end_date = current_date + 1 c_sewa_harian from leases where id = :'l4';
select count(*) = 1 and sum(amount) = (select total from bookings where id = 'f1f1f1f1-0000-0000-0000-0000000000c4') c_satu_tagihan from invoices where lease_id = :'l4' and status <> 'batal';
select generate_invoices(:'K', 400) \g /dev/null
select count(*) = 1 c_tidak_berulang_bulanan from invoices where lease_id = :'l4' and kind = 'sewa';
select exists (select 1 from deposits where lease_id = :'l4' and amount = 100000) c_dp_jadi_deposit;
select (rental_extend(:'l4', jsonb_build_object('check_out', current_date + 3)) ->> 'invoice_id') is not null c_perpanjang;
select end_date = current_date + 2 and qty = 3 c_akhir_bergeser from leases where id = :'l4';
select count(*) = 1 c_tagihan_perpanjangan from invoices where lease_id = :'l4' and kind = 'tambahan' and description like 'Perpanjangan%';
select end_lease(:'l4', current_date) \g /dev/null
select count(*) = 1 c_tagihan_tidak_dibatalkan_saat_checkout from invoices where lease_id = :'l4' and kind = 'sewa' and status = 'terbit';
select status = 'tersedia' c_kamar_kosong_lagi from rooms where id = 'f1f1f1f1-0000-0000-0000-0000000000a3';

\echo == D. Sewa langsung per jam, mingguan; bulanan lama tidak berubah
select rental_start('f1f1f1f1-0000-0000-0000-0000000000a4', 'f1f1f1f1-0000-0000-0000-0000000000b4', jsonb_build_object('unit','jam','start_at', now(), 'end_at', now() + interval '3 hours')) ->> 'lease_id' as l5 \gset
select cycle = 'jam' and stay_total = 150000 and start_at is not null d_sewa_jam from leases where id = :'l5';
select sum(amount) = 150000 d_tagihan_jam from invoices where lease_id = :'l5';
select rental_start('f1f1f1f1-0000-0000-0000-0000000000a5', 'f1f1f1f1-0000-0000-0000-0000000000b5', jsonb_build_object('unit','minggu','check_in', current_date - 14)) ->> 'lease_id' as l6 \gset
-- tagihan terbit sampai 7 hari ke depan: -14, -7, hari ini, +7
select count(*) = 4 and bool_and(amount = 1000000 and description = 'Sewa mingguan') and max(period_start) = current_date + 7 d_mingguan
  from invoices where lease_id = :'l6' and kind = 'sewa';
select start_lease('f1f1f1f1-0000-0000-0000-0000000000a6', 'f1f1f1f1-0000-0000-0000-0000000000b6', current_date - 40, 1500000, current_date - 40) as l7 \gset
select cycle = 'bulan' d_bulanan_bawaan from leases where id = :'l7';
select count(*) = 2 and bool_and(description = 'Sewa bulanan') d_tagihan_bulanan_lama from invoices where lease_id = :'l7';
do $$ declare m text; begin
  begin perform lease_set_end((select id from leases where cycle = 'jam' and status = 'aktif' and kos_id = 'f1f1f1f1-0000-0000-0000-00000000000a'), current_date + 5); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Sewa per jam dibayar sekaligus%' then raise exception 'D_GAGAL rencana selesai: %', m; end if;
  raise notice 'd_OK: sewa sekali bayar diarahkan ke Perpanjang';
end $$;
select lease_set_end(:'l6', current_date + 10) \g /dev/null
select max(period_end) = current_date + 10 and bool_and(period_end - period_start <= 6) d_periode_mingguan_mengikuti_siklus from invoices where lease_id = :'l6' and status <> 'batal';

\echo == E. Akses luar
select set_config('request.jwt.claim.sub', 'f1f1f1f1-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"f1f1f1f1-0000-0000-0000-000000000002"}', false) \g /dev/null
do $$ declare n int := 0; begin
  begin perform rental_quote('f1f1f1f1-0000-0000-0000-00000000000a', 'f1f1f1f1-0000-0000-0000-0000000000a2', 'hari', now(), now() + interval '1 day'); exception when others then n := n + 1; end;
  begin perform rental_rate_save('f1f1f1f1-0000-0000-0000-00000000000a', null, '{"unit":"hari","price":1}'); exception when others then n := n + 1; end;
  begin perform rental_calendar('f1f1f1f1-0000-0000-0000-00000000000a', current_date, current_date + 5); exception when others then n := n + 1; end;
  if n <> 3 then raise exception 'E_GAGAL akses luar %', n; end if;
  raise notice 'e_OK: orang luar ditolak';
end $$;
select (select count(*) from rental_rates) = 0 e_tarif_tak_terlihat;
reset role;
