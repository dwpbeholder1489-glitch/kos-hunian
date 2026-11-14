-- Uji Grosir: daftar harga, batas kredit, penawaran → pesanan → surat jalan bertahap → faktur → piutang & umur piutang, gagal kirim.
-- Jalankan di database baru: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/grosir_pesanan.sql"
-- Lulus = semua kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('a9a9a9a9-0000-0000-0000-000000000001','grosir@x.com'), ('a9a9a9a9-0000-0000-0000-000000000002','kasir@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('a9a9a9a9-0000-0000-0000-00000000000a','Toko Grosir','a9a9a9a9-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('a9a9a9a9-0000-0000-0000-00000000000a','a9a9a9a9-0000-0000-0000-000000000001','pemilik'),
  ('a9a9a9a9-0000-0000-0000-00000000000a','a9a9a9a9-0000-0000-0000-000000000002','kasir');
\set K 'a9a9a9a9-0000-0000-0000-00000000000a'
set role authenticated;
select set_config('request.jwt.claim.sub', 'a9a9a9a9-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a9a9a9a9-0000-0000-0000-000000000001","email":"grosir@x.com"}', false) \g /dev/null
select module_on(:'K', 'u_penawaran') a0_modul_aktif_untuk_toko_baru;
-- Beras: karung (isi 1) eceran 60.000 / grosir 58.000; Minyak: dus (isi 12 pcs) eceran 200.000 / grosir 190.000
select product_save(:'K', null, 'Beras 5kg', 'karung', 50000, 0, '[{"name":"karung","qty":1,"price_retail":60000,"price_wholesale":58000}]', 100, null) as beras \gset
select product_save(:'K', null, 'Minyak 1L', 'pcs', 14000, 0, '[{"name":"pcs","qty":1,"price_retail":17000,"price_wholesale":0},{"name":"dus","qty":12,"price_retail":200000,"price_wholesale":190000}]', 120, null) as minyak \gset
select contact_save(:'K', null, 'pelanggan', 'Warung Bu Tini', '081311112222') as tini \gset

\echo == A. Daftar harga khusus & syarat pelanggan
select price_list_save(:'K', null, 'Harga reseller') as pl \gset
select price_list_item_set(:'pl', :'beras', 'karung', 56000) \g /dev/null
select customer_terms_set(:'tini', jsonb_build_object('credit_limit', 1000000, 'terms_days', 14, 'price_list_id', :'pl', 'address', 'Jl. Pasar 5, Majalengka')) ->> 'limit' a_batas;
select (price_for(:'K', :'tini', :'beras', 'karung') ->> 'price')::numeric = 56000 a_harga_daftar, (price_for(:'K', :'tini', :'minyak', 'dus') ->> 'price')::numeric = 190000 a_harga_grosir;

\echo == B. Penawaran → pesanan (melewati batas kredit perlu alasan pemilik)
-- 10 karung × 56.000 + 5 dus × 190.000 = 560.000 + 950.000 = 1.510.000 > batas 1.000.000
select so_save('a9a9a9a9-0000-0000-0000-0000000000b1', :'K', jsonb_build_object('contact_id', :'tini', 'customer_ref', 'PO-77',
  'lines', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 10), jsonb_build_object('product_id', :'minyak', 'unit', 'dus', 'qty', 5)))) ->> 'status' b_penawaran;
select total = 1510000 b_total, ship_address = 'Jl. Pasar 5, Majalengka' b_alamat_dari_pelanggan, terms_days = 14 b_tempo from so_orders where id = 'a9a9a9a9-0000-0000-0000-0000000000b1';
select count(*) = 0 b_penawaran_tidak_ubah_stok from stock_moves where kos_id = :'K' and kind = 'jual';
-- kasir tidak boleh melewati batas
select set_config('request.jwt.claim.sub', 'a9a9a9a9-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"a9a9a9a9-0000-0000-0000-000000000002","email":"kasir@x.com"}', false) \g /dev/null
do $$ declare m text; begin
  begin perform so_confirm('a9a9a9a9-0000-0000-0000-0000000000b1', 'boleh'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Melewati batas kredit%' then raise exception 'B_GAGAL kasir: %', m; end if; raise notice 'b_OK: kasir ditolak (%)', m;
end $$;
select set_config('request.jwt.claim.sub', 'a9a9a9a9-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a9a9a9a9-0000-0000-0000-000000000001","email":"grosir@x.com"}', false) \g /dev/null
do $$ declare m text; begin
  begin perform so_confirm('a9a9a9a9-0000-0000-0000-0000000000b1', null); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_KREDIT:%' then raise exception 'B_GAGAL alasan: %', m; end if; raise notice 'b_OK: pemilik diminta alasan';
end $$;
select so_confirm('a9a9a9a9-0000-0000-0000-0000000000b1', 'pelanggan lama, bayar tiap Jumat') ->> 'status' b_dikonfirmasi;
select credit_check ->> 'override' = 'pelanggan lama, bayar tiap Jumat' b_alasan_tercatat from so_orders where id = 'a9a9a9a9-0000-0000-0000-0000000000b1';

\echo == C. Surat jalan 1 (sebagian, piutang tempo 14 hari) → faktur grosir dengan harga pesanan
select id as l_beras from so_lines where order_id = 'a9a9a9a9-0000-0000-0000-0000000000b1' and product_id = :'beras' \gset
select id as l_minyak from so_lines where order_id = 'a9a9a9a9-0000-0000-0000-0000000000b1' and product_id = :'minyak' \gset
select so_deliver('a9a9a9a9-0000-0000-0000-0000000000c1', 'a9a9a9a9-0000-0000-0000-0000000000b1',
  jsonb_build_object('method', 'kasbon', 'driver', 'Ujang', 'vehicle', 'E 1234 AB',
    'lines', jsonb_build_array(jsonb_build_object('line_id', :'l_beras', 'qty', 6), jsonb_build_object('line_id', :'l_minyak', 'qty', 5)))) as d1 \gset
select :'d1'::jsonb ->> 'status' = 'sebagian' c_status_sebagian, (:'d1'::jsonb ->> 'total')::numeric = 6 * 56000 + 5 * 190000 c_total_faktur;
select tier = 'grosir' c_tier, pay_method = 'kasbon' c_piutang, due_date = current_date + 14 c_jatuh_tempo, contact_id = :'tini' c_pelanggan from sales where id = (:'d1'::jsonb ->> 'sale_id')::uuid;
select (select stock from products where id = :'beras') = 94 c_stok_beras, (select stock from products where id = :'minyak') = 60 c_stok_minyak_60pcs;
reset role;
select contact_balance(:'tini') = 1286000 c_saldo_piutang;
set role authenticated;
-- tidak boleh kirim melebihi sisa pesanan
select set_config('t.lb', :'l_beras', false) \g /dev/null
do $$ declare m text; begin
  begin perform so_deliver(gen_random_uuid(), 'a9a9a9a9-0000-0000-0000-0000000000b1', jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('line_id', current_setting('t.lb'), 'qty', 5))));
  exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like '%hanya tersisa%' then raise exception 'C_GAGAL lebih: %', m; end if; raise notice 'c_OK: kirim melebihi sisa ditolak';
end $$;
-- kirim ulang id yang sama tidak dobel
select so_deliver('a9a9a9a9-0000-0000-0000-0000000000c1', 'a9a9a9a9-0000-0000-0000-0000000000b1', '{}') ->> 'duplicate' c_tidak_dobel;

\echo == D. Surat jalan 2 gagal → faktur batal, stok & piutang kembali, sisa bisa dikirim ulang
select so_deliver('a9a9a9a9-0000-0000-0000-0000000000c2', 'a9a9a9a9-0000-0000-0000-0000000000b1',
  jsonb_build_object('method', 'kasbon', 'lines', jsonb_build_array(jsonb_build_object('line_id', :'l_beras', 'qty', 4)))) ->> 'status' d_selesai;
select so_delivery_status('a9a9a9a9-0000-0000-0000-0000000000c2', 'gagal', null, 'toko tutup') \g /dev/null
reset role;
select (select status from sales where id = (select sale_id from so_deliveries where id = 'a9a9a9a9-0000-0000-0000-0000000000c2')) = 'batal' d_faktur_batal,
       (select stock from products where id = :'beras') = 94 d_stok_kembali, contact_balance(:'tini') = 1286000 d_piutang_kembali,
       (select status from so_orders where id = 'a9a9a9a9-0000-0000-0000-0000000000b1') = 'sebagian' d_pesanan_sebagian_lagi;
set role authenticated;
select so_deliver('a9a9a9a9-0000-0000-0000-0000000000c3', 'a9a9a9a9-0000-0000-0000-0000000000b1',
  jsonb_build_object('method', 'tunai', 'lines', jsonb_build_array(jsonb_build_object('line_id', :'l_beras', 'qty', 4)))) ->> 'status' d_kirim_ulang_selesai;
select so_delivery_status('a9a9a9a9-0000-0000-0000-0000000000c1', 'diterima', 'Bu Tini', null) = 'diterima' d_diterima;

\echo == E. Umur piutang, jurnal seimbang, peristiwa
select count(*) = 1 e_satu_faktur_terbuka, sum(open_amount) = 1286000 e_sisa from receivable_open(:'K', :'tini');
select debt_pay(gen_random_uuid(), :'K', :'tini', 500000, 'kas', current_date, 'cicil') \g /dev/null
select sum(open_amount) = 786000 e_fifo from receivable_open(:'K', :'tini');
select (customer_credit(:'tini') ->> 'overdue')::numeric = 0 e_belum_terlambat;
reset role;
update sales set due_date = current_date - 3 where id = (select sale_id from so_deliveries where id = 'a9a9a9a9-0000-0000-0000-0000000000c1');
set role authenticated;
select (customer_credit(:'tini') ->> 'overdue')::numeric = 786000 e_terlambat, (customer_credit(:'tini') ->> 'overdue_days')::int = 3 e_hari_terlambat;
reset role;
select acct_sync_internal(:'K') \g /dev/null
select (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 e_jurnal_seimbang;
select count(*) >= 4 e_peristiwa from domain_events where kos_id = :'K' and aggregate_type in ('so_order', 'so_delivery');
set role authenticated;

\echo == F. Pesanan baru langsung dikonfirmasi saat simpan; batal tanpa surat jalan; peringatan piutang terlambat
select so_save('a9a9a9a9-0000-0000-0000-0000000000b2', :'K', jsonb_build_object('contact_id', :'tini', 'confirm', true, 'override_reason', 'sudah janji bayar',
  'lines', jsonb_build_array(jsonb_build_object('product_id', :'minyak', 'unit', 'pcs', 'qty', 3, 'price', 16500)))) as f \gset
select :'f'::jsonb ->> 'status' = 'dikonfirmasi' f_langsung_pesanan, jsonb_array_length(:'f'::jsonb -> 'warnings') >= 1 f_ada_peringatan_terlambat;
select so_cancel('a9a9a9a9-0000-0000-0000-0000000000b2', 'pelanggan batal') = 'batal' f_batal;
