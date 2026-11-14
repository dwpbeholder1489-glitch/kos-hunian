-- Uji pengadaan: permintaan pembelian → pesanan → terima → faktur supplier (3 arah) + PPN masukan + kinerja supplier.
-- Jalankan di database baru: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/pengadaan_faktur_ppn.sql"
-- Lulus = semua kolom bernilai t, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('c8c8c8c8-0000-0000-0000-000000000001','beli@x.com'), ('c8c8c8c8-0000-0000-0000-000000000002','gudang-beli@x.com'), ('c8c8c8c8-0000-0000-0000-000000000003','luar@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('c8c8c8c8-0000-0000-0000-00000000000a','Toko Pengadaan','c8c8c8c8-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('c8c8c8c8-0000-0000-0000-00000000000a','c8c8c8c8-0000-0000-0000-000000000001','pemilik'),
  ('c8c8c8c8-0000-0000-0000-00000000000a','c8c8c8c8-0000-0000-0000-000000000002','gudang');
\set K 'c8c8c8c8-0000-0000-0000-00000000000a'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u)::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.saldo(c uuid) returns numeric language sql security definer as $$ select public.contact_balance(c) $$;
create or replace function pg_temp.sync(k uuid) returns void language sql security definer as $$ select public.acct_sync_internal(k); select null::void $$;
create or replace function pg_temp.peristiwa(k uuid, t text) returns bigint language sql security definer as $$ select count(*) from public.domain_events where kos_id = k and event_type = t $$;
set role authenticated;
select pg_temp.sebagai('c8c8c8c8-0000-0000-0000-000000000001');
select product_save(:'K', null, 'Beras 5 kg', 'pcs', 60000, 0, '[{"name":"pcs","price_retail":70000},{"name":"Dus","content_qty":4,"content_unit":"pcs","price_retail":270000}]', 0, null) as beras \gset
select product_save(:'K', null, 'Minyak 1 L', 'pcs', 15000, 0, '[{"name":"pcs","price_retail":18000}]', 0, null) as minyak \gset
select contact_save(:'K', null, 'supplier', 'CV Sumber Pangan', '0811') as sup \gset

\echo == A. Permintaan pembelian: staf gudang mengajukan, tidak bisa menyetujui sendiri
select pg_temp.sebagai('c8c8c8c8-0000-0000-0000-000000000002');
select preq_create('c8c8c8c8-0000-0000-0000-0000000000a1', :'K', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'pcs', 'qty', 20), jsonb_build_object('product_id', :'minyak', 'unit', 'pcs', 'qty', 24, 'note', 'stok tinggal 2')), current_date + 3, 'Stok menipis') ->> 'number' like 'PP-%' a_nomor;
select (preq_create('c8c8c8c8-0000-0000-0000-0000000000a1', :'K', '[]', null, null) ->> 'duplicate')::boolean a_idempoten;
select pg_temp.gagal($$select preq_decide('c8c8c8c8-0000-0000-0000-0000000000a1', true)$$) like '%akses%' a_gudang_tidak_bisa_setuju;
select pg_temp.gagal(format($$select preq_to_order('c8c8c8c8-0000-0000-0000-0000000000a1', gen_random_uuid(), %L, '[]', 'utang')$$, :'sup')) like '%belum disetujui%' a_belum_disetujui;
select stock = 0 a_stok_tidak_berubah from products where id = :'beras';
select pg_temp.sebagai('c8c8c8c8-0000-0000-0000-000000000001');
select pg_temp.gagal($$select preq_decide('c8c8c8c8-0000-0000-0000-0000000000a1', false, '')$$) like '%alasan%' a_tolak_wajib_alasan;
select preq_decide('c8c8c8c8-0000-0000-0000-0000000000a1', true, 'Oke') \g /dev/null
select (preq_list(:'K') -> 'rows' -> 0 ->> 'status') = 'disetujui' and jsonb_array_length(preq_list(:'K') -> 'rows' -> 0 -> 'lines') = 2 a_daftar;

\echo == B. Jadi pesanan (jumlah disesuaikan pembeli), lalu diterima sebagian
select pg_temp.sebagai('c8c8c8c8-0000-0000-0000-000000000002');
select preq_to_order('c8c8c8c8-0000-0000-0000-0000000000a1', 'c8c8c8c8-0000-0000-0000-0000000000b1', :'sup',
  jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'pcs', 'qty', 20, 'price', 60000), jsonb_build_object('product_id', :'minyak', 'unit', 'pcs', 'qty', 24, 'price', 15000)),
  'utang', current_date + 30, current_date + 2) ->> 'request' like 'PP-%' b_jadi_pesanan;
select status = 'dipesan' and purchase_id = 'c8c8c8c8-0000-0000-0000-0000000000b1' b_status_permintaan from purchase_requests where id = 'c8c8c8c8-0000-0000-0000-0000000000a1';
select request_id = 'c8c8c8c8-0000-0000-0000-0000000000a1' and order_total = 1560000 b_pesanan from purchases where id = 'c8c8c8c8-0000-0000-0000-0000000000b1';
select bool_and(order_price = price) b_harga_pesanan_tersimpan from purchase_lines where purchase_id = 'c8c8c8c8-0000-0000-0000-0000000000b1';
select id as lb from purchase_lines where purchase_id = 'c8c8c8c8-0000-0000-0000-0000000000b1' and product_id = :'beras' \gset
select id as lm from purchase_lines where purchase_id = 'c8c8c8c8-0000-0000-0000-0000000000b1' and product_id = :'minyak' \gset
-- terima beras 20 (harga sama), minyak 12 dari 24
select purchase_receive('c8c8c8c8-0000-0000-0000-0000000000b1', jsonb_build_array(jsonb_build_object('line_id', :'lb', 'qty', 20), jsonb_build_object('line_id', :'lm', 'qty', 12))) \g /dev/null
select total = 1380000 and status = 'sebagian' b_terima_sebagian from purchases where id = 'c8c8c8c8-0000-0000-0000-0000000000b1';

\echo == C. Faktur: gudang tidak boleh; menagih lebih dari yang diterima → tersimpan draf, tidak bisa diposting
select pg_temp.gagal(format($$select sinv_save(gen_random_uuid(), 'c8c8c8c8-0000-0000-0000-0000000000b1', '{"supplier_no":"X","lines":[{"line_id":"%s","qty":1,"price":1}]}')$$, :'lb')) like '%akses%' c_gudang_tidak_bisa_faktur;
select pg_temp.sebagai('c8c8c8c8-0000-0000-0000-000000000001');
select sinv_save('c8c8c8c8-0000-0000-0000-0000000000f1', 'c8c8c8c8-0000-0000-0000-0000000000b1', jsonb_build_object('supplier_no', 'INV-001',
  'lines', jsonb_build_array(jsonb_build_object('line_id', :'lb', 'qty', 20, 'price', 60000), jsonb_build_object('line_id', :'lm', 'qty', 24, 'price', 15000)))) -> 'match' ->> 'status' = 'menunggu_barang' c_menunggu_barang;
select pg_temp.gagal($$select sinv_post('c8c8c8c8-0000-0000-0000-0000000000f1')$$) like '%lebih banyak dari barang%' c_tidak_bisa_posting;
select status = 'draf' c_tetap_draf from supplier_invoices where id = 'c8c8c8c8-0000-0000-0000-0000000000f1';
select pg_temp.saldo(:'sup') = 1380000 c_utang_belum_berubah;
select pg_temp.gagal(format($$select sinv_save(gen_random_uuid(), 'c8c8c8c8-0000-0000-0000-0000000000b1', '{"supplier_no":"inv-001","lines":[{"line_id":"%s","qty":1,"price":1}]}')$$, :'lb')) like '%sudah pernah dicatat%' c_nomor_ganda_ditolak;
select pg_temp.gagal(format($$select sinv_save('c8c8c8c8-0000-0000-0000-0000000000f1', 'c8c8c8c8-0000-0000-0000-0000000000b1', '{"supplier_no":"INV-001","tax_amount":1000,"lines":[{"line_id":"%s","qty":1,"price":60000}]}')$$, :'lb')) like '%PPN aktif%' c_ppn_butuh_setelan;

\echo == D. Faktur cocok (hanya yang diterima) → posting tanpa mengubah utang
select sinv_save('c8c8c8c8-0000-0000-0000-0000000000f1', 'c8c8c8c8-0000-0000-0000-0000000000b1', jsonb_build_object('supplier_no', 'INV-001', 'due_date', (current_date + 14)::text,
  'lines', jsonb_build_array(jsonb_build_object('line_id', :'lb', 'qty', 20, 'price', 60000), jsonb_build_object('line_id', :'lm', 'qty', 12, 'price', 15000)))) -> 'match' ->> 'status' = 'cocok' d_cocok;
select r ->> 'match' = 'cocok' and (r ->> 'extra')::numeric = 0 d_posting from (select sinv_post('c8c8c8c8-0000-0000-0000-0000000000f1') r) z;
select (sinv_post('c8c8c8c8-0000-0000-0000-0000000000f1') ->> 'duplicate')::boolean d_posting_idempoten;
select pg_temp.saldo(:'sup') = 1380000 d_utang_tetap;
select due_date = current_date + 14 d_jatuh_tempo_ikut_faktur from purchases where id = 'c8c8c8c8-0000-0000-0000-0000000000b1';
select pg_temp.gagal($$select purchase_void('c8c8c8c8-0000-0000-0000-0000000000b1', 'coba')$$) like '%faktur supplier yang diposting%' d_batal_belanja_ditahan;

\echo == E. Sisa minyak datang; faktur kedua harga naik + PPN → selisih perlu alasan pemilik; utang bertambah PPN + selisih
select tax_settings_set(:'K', true, 11, '01.234.567.8-901.000') \g /dev/null
select purchase_receive('c8c8c8c8-0000-0000-0000-0000000000b1', jsonb_build_array(jsonb_build_object('line_id', :'lm', 'qty', 12))) \g /dev/null
select status = 'selesai' and total = 1560000 e_selesai from purchases where id = 'c8c8c8c8-0000-0000-0000-0000000000b1';
-- 12 minyak @15.500 (pesanan 15.000) = 186.000; PPN 11% = 20.460
select r -> 'match' ->> 'status' = 'selisih' and (r -> 'match' ->> 'variance')::numeric = 6000 and (r ->> 'total')::numeric = 206460 e_selisih
from (select sinv_save('c8c8c8c8-0000-0000-0000-0000000000f2', 'c8c8c8c8-0000-0000-0000-0000000000b1', jsonb_build_object('supplier_no', 'INV-002', 'tax_no', '010.000-26.00000001', 'tax_amount', 20460,
  'lines', jsonb_build_array(jsonb_build_object('line_id', :'lm', 'qty', 12, 'price', 15500)))) r) z;
select pg_temp.gagal($$select sinv_post('c8c8c8c8-0000-0000-0000-0000000000f2')$$) like 'SELISIH_FAKTUR:%alasan%' e_wajib_alasan;
select (r ->> 'extra')::numeric = 26460 and r ->> 'match' = 'selisih' e_posting_selisih from (select sinv_post('c8c8c8c8-0000-0000-0000-0000000000f2', 'Harga naik per 1 Nov, sudah dikonfirmasi') r) z;
select pg_temp.saldo(:'sup') = 1586460 e_utang_naik;
select cost = 15000 e_harga_modal_tidak_berubah from products where id = :'minyak';
-- baris yang sudah ditagih penuh tidak bisa ditagih lagi tanpa ketahuan
select sinv_save('c8c8c8c8-0000-0000-0000-0000000000f3', 'c8c8c8c8-0000-0000-0000-0000000000b1', jsonb_build_object('supplier_no', 'INV-003',
  'lines', jsonb_build_array(jsonb_build_object('line_id', :'lm', 'qty', 1, 'price', 15000)))) -> 'match' ->> 'status' = 'menunggu_barang' e_tagih_ganda_terdeteksi;
select sinv_void('c8c8c8c8-0000-0000-0000-0000000000f3', null) \g /dev/null

\echo == F. Jurnal & laporan PPN
select pg_temp.sync(:'K') \g /dev/null
select sum(l.debit - l.credit) filter (where a.sys_key = 'ppn_masukan') = 20460 and sum(l.debit - l.credit) filter (where a.sys_key = 'selisih_beli') = 6000
   and sum(l.credit - l.debit) filter (where a.sys_key = 'utang') = 1586460 and sum(l.debit - l.credit) filter (where a.sys_key = 'persediaan') = 1560000 f_jurnal
from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K';
select (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 f_seimbang;
select (r ->> 'ppn_masukan')::numeric = 20460 and (r ->> 'selisih')::numeric = -20460 and (r -> 'pembelian' ->> 'dpp')::numeric = 186000 and jsonb_array_length(r -> 'faktur_masukan') = 1 f_laporan_ppn
from (select tax_report(:'K', current_date) r) z;
select pg_temp.peristiwa(:'K', 'SupplierInvoicePosted') = 2 and pg_temp.peristiwa(:'K', 'PurchaseRequestApproved') = 1 f_peristiwa;

\echo == G. Bayar utang, batal faktur → utang turun lagi; belanja tunai + PPN langsung dibayar dari kas
select debt_pay(gen_random_uuid(), :'K', :'sup', 1586460, 'bank', current_date) \g /dev/null
select pg_temp.saldo(:'sup') = 0 g_lunas;
select sinv_void('c8c8c8c8-0000-0000-0000-0000000000f2', 'Salah input') \g /dev/null
select pg_temp.saldo(:'sup') = -26460 g_lebih_bayar_terlihat;
select purchase_create('c8c8c8c8-0000-0000-0000-0000000000b2', :'K', current_date, :'sup', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'Dus', 'qty', 2, 'price', 240000)), 'tunai') \g /dev/null
select id as l2 from purchase_lines where purchase_id = 'c8c8c8c8-0000-0000-0000-0000000000b2' \gset
select sinv_save('c8c8c8c8-0000-0000-0000-0000000000f4', 'c8c8c8c8-0000-0000-0000-0000000000b2', jsonb_build_object('supplier_no', 'INV-010', 'tax_amount', 52800,
  'lines', jsonb_build_array(jsonb_build_object('line_id', :'l2', 'qty', 2, 'price', 240000)))) -> 'match' ->> 'status' = 'cocok' g_tunai_cocok;
select (r ->> 'paid')::boolean and (r ->> 'extra')::numeric = 52800 g_ppn_dibayar_kas from (select sinv_post('c8c8c8c8-0000-0000-0000-0000000000f4', null, 'kas') r) z;
select pg_temp.saldo(:'sup') = -26460 g_utang_tidak_bertambah;
select count(*) = 1 g_pembayaran_tercatat from debt_payments where kos_id = :'K' and account = 'kas' and amount = 52800 and status = 'selesai';
select sinv_void('c8c8c8c8-0000-0000-0000-0000000000f4', 'Uji batal') \g /dev/null
select count(*) = 1 g_pembayaran_ikut_batal from debt_payments where kos_id = :'K' and account = 'kas' and amount = 52800 and status = 'batal';
select pg_temp.sync(:'K') \g /dev/null
select (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0
   and (select coalesce(sum(l.debit - l.credit), 0) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'ppn_masukan') = 0 g_jurnal_dikoreksi;

\echo == H. Kinerja supplier & orang luar
select (r -> 'rows' -> 0 ->> 'pesanan')::int = 2 and (r -> 'rows' -> 0 ->> 'tepat')::int = 1 and (r -> 'rows' -> 0 ->> 'terpenuhi')::int = 100 and (r -> 'rows' -> 0 ->> 'faktur')::int = 1 h_kinerja
from (select supplier_scorecard(:'K') r) z;
select pg_temp.sebagai('c8c8c8c8-0000-0000-0000-000000000003');
select pg_temp.gagal(format($$select preq_list(%L)$$, :'K')) like '%akses%' and pg_temp.gagal(format($$select sinv_list(%L)$$, :'K')) like '%akses%'
   and pg_temp.gagal($$select sinv_context('c8c8c8c8-0000-0000-0000-0000000000b1')$$) like '%tidak ditemukan%'
   and pg_temp.gagal(format($$select supplier_scorecard(%L)$$, :'K')) like '%akses%' h_orang_luar_ditolak;
select (select count(*) from supplier_invoices) = 0 and (select count(*) from purchase_requests) = 0 h_rls_kosong;
