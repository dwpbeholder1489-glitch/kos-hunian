-- Uji PPN keluaran & bayar campuran di Kasir. Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/ppn_bayar_campuran.sql"
-- Skenario: PPN 11% (harga termasuk). Sabun Rp 11.100 (kena PPN) ×10 = 111.000; Beras Rp 60.000 (bebas PPN) ×1.
-- Diskon 0. PPN = 111.000 × 11/111 = 11.000. Total 171.000 dibayar tunai 100.000 + transfer 50.000 + kasbon 21.000.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('d1d1d1d1-0000-0000-0000-000000000001','ppn-owner@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('d1d1d1d1-0000-0000-0000-00000000000a','Toko PPN','d1d1d1d1-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values ('d1d1d1d1-0000-0000-0000-00000000000a','d1d1d1d1-0000-0000-0000-000000000001','pemilik') on conflict do nothing;
\set K 'd1d1d1d1-0000-0000-0000-00000000000a'
select set_config('request.jwt.claim.sub', 'd1d1d1d1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"d1d1d1d1-0000-0000-0000-000000000001","email":"ppn-owner@x.com"}', false) \g /dev/null
select product_save(:'K', null, 'Sabun', 'pcs', 8000, 0, '[{"name":"pcs","qty":1,"price_retail":11100,"price_wholesale":0}]', 100, null) as sabun \gset
select product_save(:'K', null, 'Beras 5kg', 'karung', 50000, 0, '[{"name":"karung","qty":1,"price_retail":60000,"price_wholesale":0}]', 20, null) as beras \gset
select product_set_tax(:'beras', true) \g /dev/null
select contact_save(:'K', null, 'pelanggan', 'Bu Sari', '0812') as sari \gset
select shift_open(:'K', 200000) \g /dev/null

\echo == A. Pengaturan PPN: tarif wajib saat aktif
do $$ declare m text; begin
  begin perform tax_settings_set('d1d1d1d1-0000-0000-0000-00000000000a', true, null, null); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Isi tarif PPN%' then raise exception 'A_GAGAL: %', m; end if; raise notice 'a_OK: tarif kosong ditolak';
end $$;
select tax_settings_set(:'K', true, 11, '01.234.567.8-901.000') ->> 'rate' a_tarif;

\echo == B. Validasi bayar campuran
do $$ declare m text; begin
  begin perform sale_create(gen_random_uuid(), 'd1d1d1d1-0000-0000-0000-00000000000a', 'ecer',
    '[{"product_id":"00000000-0000-0000-0000-000000000000","unit":"pcs","qty":1}]'::jsonb, 0, 'campuran', null, null, null, null, '[{"method":"tunai","amount":1}]'::jsonb);
  exception when others then m := sqlerrm; end;
  if m is null then raise exception 'B_GAGAL: barang palsu diterima'; end if; raise notice 'b_OK: barang tidak dikenal ditolak';
end $$;
select set_config('t.sabun', :'sabun', false), set_config('t.beras', :'beras', false), set_config('t.sari', :'sari', false) \g /dev/null
do $$ declare m text; v_lines jsonb := jsonb_build_array(jsonb_build_object('product_id', current_setting('t.sabun'), 'unit', 'pcs', 'qty', 10)); begin
  begin perform sale_create(gen_random_uuid(), 'd1d1d1d1-0000-0000-0000-00000000000a', 'ecer', v_lines, 0, 'campuran', null, null, null, null,
    '[{"method":"tunai","amount":100000},{"method":"transfer","amount":5000}]'::jsonb); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Jumlah rincian pembayaran%' then raise exception 'B_GAGAL jumlah: %', m; end if; raise notice 'b_OK: rincian tidak sama dengan total ditolak';
  m := null;
  begin perform sale_create(gen_random_uuid(), 'd1d1d1d1-0000-0000-0000-00000000000a', 'ecer', v_lines, 0, 'campuran', null, null, null, null,
    '[{"method":"tunai","amount":100000},{"method":"kasbon","amount":11000}]'::jsonb); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Pilih pelanggan untuk kasbon%' then raise exception 'B_GAGAL kasbon: %', m; end if; raise notice 'b_OK: bagian kasbon tanpa pelanggan ditolak';
end $$;
select count(*) = 0 b_tidak_ada_sisa_transaksi_gagal from sales where kos_id = :'K';

\echo == C. Penjualan campuran + PPN
select sale_create('d1d1d1d1-0000-0000-0000-0000000000c1', :'K', 'ecer',
  jsonb_build_array(jsonb_build_object('product_id', :'sabun', 'unit', 'pcs', 'qty', 10), jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 1)),
  0, 'campuran', 120000, :'sari', null, 'uji', '[{"method":"tunai","amount":100000},{"method":"transfer","amount":50000},{"method":"kasbon","amount":21000}]') as r \gset
select :'r'::jsonb ->> 'method' c_metode, :'r'::jsonb ->> 'total' c_total, :'r'::jsonb ->> 'tax' c_ppn;
select amt_tunai c_tunai, amt_transfer c_transfer, amt_kasbon c_kasbon, paid_amount c_uang_diterima from sales where id = 'd1d1d1d1-0000-0000-0000-0000000000c1';
select sale_create('d1d1d1d1-0000-0000-0000-0000000000c1', :'K', 'ecer', '[]', 0, 'tunai') ->> 'duplicate' c_kirim_ulang_tidak_dobel;

\echo == D. Dampak ke kas, bank, piutang, shift, laporan, jurnal, peristiwa
select contact_balance(:'sari') d_piutang_sari;
select id as sh from cash_shifts where kos_id = :'K' \gset
select shift_summary(:'sh') ->> 'expected' d_shift_kas_harapan, shift_summary(:'sh') ->> 'transfer' d_shift_transfer, shift_summary(:'sh') ->> 'kasbon' d_shift_kasbon;
select r -> 'bayar' ->> 'tunai' d_lap_tunai, r -> 'bayar' ->> 'ppn' d_lap_ppn, r ->> 'omzet' d_omzet_tanpa_ppn_160000 from (select retail_report(:'K', current_date, current_date) r) z;
select acct_sync_internal(:'K') \g /dev/null
select a.sys_key d_akun, sum(l.debit) d_debit, sum(l.credit) d_kredit from acct_lines l join acct_accounts a on a.id = l.account_id
  where l.kos_id = :'K' and l.source_type = 'sale' group by a.sys_key order by 1;
select (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 d_jurnal_seimbang;
select amount d_peristiwa_nominal from domain_events where event_type = 'SaleCreated' and aggregate_id = 'd1d1d1d1-0000-0000-0000-0000000000c1';

\echo == E. Retur sebagian: PPN dibalik sebanding; laporan PPN bulanan
select sale_return_create('d1d1d1d1-0000-0000-0000-0000000000e9', 'd1d1d1d1-0000-0000-0000-0000000000c1',
  jsonb_build_array(jsonb_build_object('line_id', (select id from sale_lines where sale_id = 'd1d1d1d1-0000-0000-0000-0000000000c1' and name = 'Sabun'), 'qty', 1)),
  'tunai', 'pecah') \g /dev/null
select total e_retur_total, tax_amount e_retur_ppn from sale_returns where id = 'd1d1d1d1-0000-0000-0000-0000000000e9';
select acct_sync_internal(:'K') \g /dev/null
select (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 e_jurnal_seimbang,
       (select sum(l.credit - l.debit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'ppn_keluaran') e_saldo_ppn_keluaran;
select t ->> 'ppn_keluaran' e_lap_ppn_keluaran, t -> 'penjualan' ->> 'dpp' e_dpp, t ->> 'retur_dpp' e_retur_dpp, t -> 'penjualan' ->> 'tidak_kena' e_tidak_kena from (select tax_report(:'K', current_date) t) z;

\echo == E2. Diskon 10% dibagi proporsional: sabun 11.100 + beras 60.000, diskon 7.110 → PPN 990 (hanya dari sabun)
select sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'sabun', 'unit', 'pcs', 'qty', 1), jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 1)),
  7110, 'transfer') ->> 'tax' e2_ppn_990;
select acct_sync_internal(:'K') \g /dev/null
select (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 e2_jurnal_seimbang;

\echo == F. PPN nonaktif → penjualan baru tanpa PPN
select tax_settings_set(:'K', false, null, null) \g /dev/null
select sale_create(gen_random_uuid(), :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'sabun', 'unit', 'pcs', 'qty', 1)), 0, 'tunai') ->> 'tax' f_tanpa_ppn;
