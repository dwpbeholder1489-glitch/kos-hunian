-- Uji alur ujung-ke-ujung KOS (dari /var/tmp/pgtest/e2e.sql, diperbarui 14 Nov 2026 untuk aturan paket V2).
-- Pendaftaran → aktivasi → halaman publik → permintaan calon penghuni → booking → check-in → tagihan
-- → portal penghuni (Pro) → bukti bayar & keluhan → verifikasi → isolasi antar-penghuni → sewa berakhir.
-- Jalankan di database baru: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/e2e_kos.sql"
-- Lulus = tidak ada baris "E2E_GAGAL"; ERROR yang muncul hanya penolakan yang DIHARAPKAN (ditandai "(diharapkan ditolak)").
\set ON_ERROR_STOP 0
insert into auth.users(id, email) values ('11111111-1111-1111-1111-111111111111', 'pemilik@x.com') on conflict do nothing;

\echo === 1. Pendaftaran kos lewat /mulai
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false), set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","aal":"aal1","email":"pemilik@x.com"}',false) \g /dev/null
select setup_create('{"category":"properti","subcategory":null,"name":"Kos Mawar E2E","relation":"pemilik","answers":{"room_count":4,"prefix":"M"}}') as k \gset

\echo === 2. Lengkapi & aktifkan
select setup_item_save(:'k','kamar','{"count":4,"prefix":"M","price":800000}','setujui') \g /dev/null
select setup_item_save(:'k','alamat','{"v":"Jl. Mawar 1, Majalengka"}','setujui') \g /dev/null
select setup_item_save(:'k','wa','{"v":"081200002222"}','setujui') \g /dev/null
select setup_item_save(:'k','rekening','{"v":"BCA 1234567 a.n. Dewi"}','setujui') \g /dev/null
select setup_item_save(:'k','peraturan','{"v":"Tamu maksimal jam 21.00"}','setujui') \g /dev/null
select setup_item_save(:'k','pembayaran','{"v":["Transfer bank","QRIS"]}','setujui') \g /dev/null
select setup_item_save(:'k','aturan_bayar','{"v":"Bayar paling lambat tanggal 5"}','setujui') \g /dev/null
select setup_approve_recommended(:'k') \g /dev/null
select setup_activate(:'k') \g /dev/null
select (select setup_status from kos where id = :'k') = 'active' as e2e_aktif, (select count(*) from rooms where kos_id = :'k') = 4 as e2e_4_kamar,
       (select bool_and(rent = 800000) from rooms where kos_id = :'k') as e2e_harga_kamar;
-- Portal penghuni hanya untuk Paket Pro (V2): simulasikan pemilik yang sudah membayar Pro
reset role;
update kos set plan = 'pro', paid_until = (now() at time zone 'Asia/Jakarta')::date + 30 where id = :'k';
set role authenticated;
select module_set(:'k', m, true, 'uji e2e') from unnest(array['p_portal', 'p_perbaikan']) m where not module_on(:'k', m) \g /dev/null

\echo === 3. Halaman publik
select public_page_save(:'k', '{"slug":"kos-mawar-e2e","enabled":true,"catalog_mode":"semua","show_prices":true}') is not null as e2e_halaman_disimpan;
reset role; set role anon;
select jsonb_array_length(public_page_view('kos-mawar-e2e')->'items') = 4 as e2e_kamar_publik;

\echo === 4. Calon penghuni kirim permintaan
reset role;
select id as r1 from rooms where kos_id = :'k' and code = 'M01' \gset
set role service_role;
select public_submit('kos-mawar-e2e','Sinta','081233334444','Mau lihat kamar', jsonb_build_array(jsonb_build_object('id',:'r1','unit','bulan','qty',1)), true, 'ipK', 20) as sub \gset
select lead_set_req((:'sub'::jsonb->>'lead_id')::uuid, current_date) \g /dev/null

\echo === 5. Pemilik cek & konfirmasi -> booking
reset role; set role authenticated;
select lead_check((:'sub'::jsonb->>'lead_id')::uuid)->'proposal' as prop \gset
select lead_confirm((:'sub'::jsonb->>'lead_id')::uuid, jsonb_build_object('room_id', :'prop'::jsonb->>'room_id', 'check_in', current_date, 'rent', 800000, 'months', 1, 'other_room', false, 'dp_amount', 0, 'dp_method', 'transfer')) as conf \gset
select id as bk from bookings where kos_id = :'k' \gset
select (select status from bookings where id = :'bk') is not null as e2e_booking_dibuat;

\echo === 6. Check-in -> penghuni + tagihan
select booking_checkin(:'bk', jsonb_build_object('start', current_date, 'billing_start', current_date)) \g /dev/null
select (select count(*) from leases where kos_id = :'k' and status = 'aktif') = 1 as e2e_sewa_aktif;
select id as occ from occupants where kos_id = :'k' limit 1 \gset
select generate_invoices(:'k', 7) \g /dev/null
select (select count(*) from invoices where kos_id = :'k' and kind = 'sewa') >= 1 as e2e_tagihan_terbit;

\echo === 7. Tautan portal penghuni (Pro)
select portal_link(:'occ', false) as tok \gset
reset role; set role anon;
select (portal_get(:'tok')->'invoices'->0->>'id') as inv \gset
select :'inv' <> '' as e2e_portal_menampilkan_tagihan;

\echo === 8. Penghuni kirim bukti bayar & lapor keluhan
select portal_submit_payment(:'tok', :'inv'::uuid, 800000, current_date, 'transfer', 'tf BCA', null) is not null as e2e_bukti_terkirim;
select portal_report_issue(:'tok', 'listrik', 'Lampu mati', 'kamar M01') is not null as e2e_keluhan_terkirim;
select portal_set_email(:'tok', 'sinta@x.com') \g /dev/null

\echo === 9. Pemilik verifikasi
reset role; set role authenticated;
select id as pay from payments where kos_id = :'k' and invoice_id = :'inv' \gset
update payments set status = 'terverifikasi', verified_at = now() where id = :'pay';
select (select pay_state from invoice_summary where id = :'inv') = 'lunas' as e2e_tagihan_lunas,   -- lunas dihitung di view, bukan kolom status
       (select count(*) from maint_tickets where kos_id = :'k') = 1 as e2e_keluhan_tercatat;

\echo === 10. Isolasi antar-penghuni
select id as r2 from rooms where kos_id = :'k' and code = 'M02' \gset
insert into occupants(kos_id, name, phone) values (:'k','Budi','081255556666') returning id as occ2 \gset
select start_lease(:'r2', :'occ2', current_date - 10, 750000, current_date - 10, null) \g /dev/null
select generate_invoices(:'k', 7) \g /dev/null
select portal_link(:'occ2', false) as tok2 \gset
select id as inv2 from invoices where occupant_id = :'occ2' limit 1 \gset
select set_config('e2e.tok', :'tok', false), set_config('e2e.inv2', :'inv2', false) \g /dev/null
reset role; set role anon;
\echo (diharapkan ditolak: penghuni 1 membayar tagihan penghuni 2)
do $$ declare m text; begin
  begin perform portal_submit_payment(current_setting('e2e.tok'), current_setting('e2e.inv2')::uuid, 750000, current_date, 'transfer', 'x', null);
  exception when others then m := sqlerrm; end;
  if m is null then raise exception 'E2E_GAGAL: penghuni bisa membayar tagihan penghuni lain'; end if;
  raise notice 'e2e_OK: tagihan penghuni lain ditolak (%)', m;
end $$;
select portal_get('salah-token-123') is null as e2e_token_salah_kosong;
select (portal_get(:'tok2')->'occupant'->>'name') = 'Budi' as e2e_portal_penghuni_2_benar;

\echo === 11. Sewa berakhir
reset role; set role authenticated;
select id as ls from leases where occupant_id = :'occ' \gset
select set_config('e2e.ls', :'ls', false) \g /dev/null
\echo (diharapkan ditolak: tanggal keluar di masa depan — pakai Rencana selesai)
do $$ declare m text; begin
  begin perform end_lease(current_setting('e2e.ls')::uuid, current_date + 40, 'pindah'); exception when others then m := sqlerrm; end;
  if m is null then raise exception 'E2E_GAGAL: tanggal keluar masa depan diterima'; end if;
  raise notice 'e2e_OK: tanggal keluar masa depan ditolak';
end $$;
select end_lease(:'ls', current_date, 'pindah') \g /dev/null
select (select status from leases where id = :'ls') = 'selesai' as e2e_sewa_selesai;
reset role; set role anon;
select portal_get(:'tok') is not null as e2e_portal_masih_bisa_dibuka;
