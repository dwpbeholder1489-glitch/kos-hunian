-- Uji Tahap 5 Retail — Portal pelanggan grosir (migrasi 20261125120000): link pribadi, katalog harga pelanggan, pesanan portal →
-- penawaran → dikonfirmasi penjual, idempoten, batal oleh pelanggan, faktur & piutang terlihat, lonceng, batas paket & isolasi.
-- Database baru; lulus = semua kolom t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('b2b00000-0000-0000-0000-000000000001','pemilik-b2b@x.com'), ('b2b00000-0000-0000-0000-000000000002','kasir-b2b@x.com'),
  ('b2b00000-0000-0000-0000-000000000003','asing-b2b@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('b2b00000-0000-0000-0000-00000000000a','Grosir Portal','b2b00000-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail'),
  ('b2b00000-0000-0000-0000-00000000000b','Toko Bisnis','b2b00000-0000-0000-0000-000000000003','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('b2b00000-0000-0000-0000-00000000000a','b2b00000-0000-0000-0000-000000000001','pemilik'),
  ('b2b00000-0000-0000-0000-00000000000a','b2b00000-0000-0000-0000-000000000002','kasir'),
  ('b2b00000-0000-0000-0000-00000000000b','b2b00000-0000-0000-0000-000000000003','pemilik');
\set K 'b2b00000-0000-0000-0000-00000000000a'
\set K2 'b2b00000-0000-0000-0000-00000000000b'
\set KO 'b2b00000-0000-0000-0000-000000000001'
\set KS 'b2b00000-0000-0000-0000-000000000002'
\set KX 'b2b00000-0000-0000-0000-000000000003'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u, ''), false), set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u)::text end, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.so(i uuid) returns public.so_orders language sql security definer as $$ select * from public.so_orders where id = i $$;
create or replace function pg_temp.nso(k uuid) returns bigint language sql security definer as $$ select count(*) from public.so_orders where kos_id = k $$;
create or replace function pg_temp.line_price(o uuid, n text) returns numeric language sql security definer as $$ select price from public.so_lines where order_id = o and name = n $$;
create or replace function pg_temp.nlines(o uuid) returns bigint language sql security definer as $$ select count(*) from public.so_lines where order_id = o $$;
-- harga katalog untuk barang & satuan
create or replace function pg_temp.harga(g jsonb, n text, u text) returns numeric language sql as $$
  select (x->>'price')::numeric from jsonb_array_elements(g->'catalog') p, jsonb_array_elements(p->'units') x where p->>'name' = n and x->>'name' = u $$;

set role authenticated;
select pg_temp.sebagai(:'KO');
select product_save(:'K', null, 'Beras 5kg', 'karung', 50000, 0, '[{"name":"karung","qty":1,"price_retail":60000,"price_wholesale":58000}]', 100, null) as beras \gset
select product_save(:'K', null, 'Minyak 1L', 'pcs', 14000, 0, '[{"name":"pcs","qty":1,"price_retail":17000,"price_wholesale":0},{"name":"dus","qty":12,"price_retail":200000,"price_wholesale":190000}]', 120, null) as minyak \gset
select product_save(:'K', null, 'Gula 1kg', 'pcs', 13000, 0, '[{"name":"pcs","qty":1,"price_retail":16000,"price_wholesale":15000}]', 5, null) as gula \gset
select product_save(:'K', null, 'Barang tanpa harga', 'pcs', 1000, 0, '[{"name":"pcs","qty":1,"price_retail":0,"price_wholesale":0}]', 5, null) as nol \gset
select price_breaks_set(:'minyak', 'dus', '[{"min_qty":10,"price":185000,"tier":"grosir"}]') \g /dev/null
select contact_save(:'K', null, 'pelanggan', 'Warung Bu Tini', '081311112222') as tini \gset
select contact_save(:'K', null, 'pelanggan', 'Toko Pak Budi', '081322223333') as budi \gset
select price_list_save(:'K', null, 'Harga reseller') as pl \gset
select price_list_item_set(:'pl', :'beras', 'karung', 56000) \g /dev/null
select customer_terms_set(:'tini', jsonb_build_object('credit_limit', 3000000, 'terms_days', 14, 'price_list_id', :'pl', 'address', 'Jl. Pasar 5')) \g /dev/null
select pg_temp.sebagai(:'KX');
select contact_save(:'K2', null, 'pelanggan', 'Pelanggan toko lain', '0813') as lain \gset

\echo == A. Link pribadi: dibuat penjual, sama bila diminta ulang, diganti bila reset, ditolak tanpa Paket Pro / orang asing
select pg_temp.gagal(format('select cportal_link(%L)', :'tini')) like 'Pelanggan tidak ditemukan%' a_asing_ditolak;
select pg_temp.gagal(format('select cportal_link(%L)', :'lain')) like 'BATAS_PAKET:%' a_paket_bisnis_ditolak;
select pg_temp.sebagai(:'KS');
select cportal_link(:'tini') ->> 'token' as tok \gset
select length(:'tok') = 64 a_token_64, cportal_link(:'tini') ->> 'token' = :'tok' a_sama_bila_diminta_ulang;
select pg_temp.sebagai(:'KO');
select cportal_link(:'budi') ->> 'token' as tokbudi \gset
select cportal_link(:'budi', true) ->> 'token' as tokbudi2 \gset
select :'tokbudi' <> :'tokbudi2' a_reset_ganti;
select (cportal_list(:'K') -> 'customers' -> 0 ->> 'token') is not null a_daftar_portal, (cportal_list(:'K') ->> 'allowed')::boolean a_allowed;

\echo == B. Isi portal (anon): harga milik pelanggan, tanpa modal/angka stok, token salah ditolak
reset role; select pg_temp.sebagai(null); set role anon;
select cportal_get(:'tok') as g \gset
select (:'g'::jsonb ->> 'ok')::boolean b_ok, :'g'::jsonb -> 'customer' ->> 'name' = 'Warung Bu Tini' b_nama;
select pg_temp.harga(:'g'::jsonb, 'Beras 5kg', 'karung') = 56000 b_harga_daftar, pg_temp.harga(:'g'::jsonb, 'Minyak 1L', 'dus') = 190000 b_harga_grosir,
       pg_temp.harga(:'g'::jsonb, 'Minyak 1L', 'pcs') = 17000 b_eceran_bila_grosir_kosong;
select not exists (select 1 from jsonb_array_elements(:'g'::jsonb -> 'catalog') p where p->>'name' = 'Barang tanpa harga') b_tanpa_harga_disembunyikan;
select (select x -> 'breaks' -> 0 ->> 'price' from jsonb_array_elements(:'g'::jsonb -> 'catalog') p, jsonb_array_elements(p->'units') x where p->>'name' = 'Minyak 1L' and x->>'name' = 'dus')::numeric = 185000 b_harga_beli_banyak;
select position('"cost"' in :'g') = 0 and position('"stock"' in :'g') = 0 b_tanpa_modal_stok, (:'g'::jsonb -> 'catalog' -> 0 ->> 'avail') is not null b_status_tersedia;
select (:'g'::jsonb -> 'customer' ->> 'credit_limit')::numeric = 3000000 b_batas, :'g'::jsonb -> 'customer' ->> 'price_list' = 'Harga reseller' b_daftar_harga;
select (cportal_get(:'tokbudi') ->> 'ok')::boolean = false b_token_lama_mati, (cportal_get('xx') ->> 'ok')::boolean = false b_token_pendek;
select pg_temp.gagal('select cportal_order(''x'', ''{}'')') like '%permission denied%' b_anon_tidak_bisa_pesan;
select pg_temp.gagal('select cportal_cancel(''x'', gen_random_uuid())') like '%permission denied%' b_anon_tidak_bisa_batal;
select pg_temp.gagal('select count(*) from contacts where kind = ''pelanggan''') <> 'TIDAK_DITOLAK' b_anon_tidak_baca_kontak;
select pg_temp.gagal('select * from receivable_open_core(''b2b00000-0000-0000-0000-00000000000a'')') like '%permission denied%' b_inti_piutang_tertutup;

\echo == C. Pesanan dari portal (server): harga dihitung server, digabung, beli banyak, idempoten
reset role; set role service_role;
select cportal_order(:'tok', jsonb_build_object('id', 'b2b00000-0000-0000-0000-0000000000c1', 'kind', 'pesanan', 'customer_ref', 'PO-9', 'need_date', current_date + 2,
  'lines', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 4, 'price', 1),
                             jsonb_build_object('product_id', :'minyak', 'unit', 'dus', 'qty', 6),
                             jsonb_build_object('product_id', :'minyak', 'unit', 'dus', 'qty', 4),
                             jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 1)))) as r \gset
select (:'r'::jsonb ->> 'ok')::boolean c_ok, :'r'::jsonb ->> 'number' like 'SO-%' c_nomor;
select (pg_temp.so('b2b00000-0000-0000-0000-0000000000c1')).status = 'penawaran' c_status_penawaran, (pg_temp.so('b2b00000-0000-0000-0000-0000000000c1')).source = 'portal' c_sumber,
       (pg_temp.so('b2b00000-0000-0000-0000-0000000000c1')).ship_address = 'Jl. Pasar 5' c_alamat, (pg_temp.so('b2b00000-0000-0000-0000-0000000000c1')).terms_days = 14 c_tempo,
       (pg_temp.so('b2b00000-0000-0000-0000-0000000000c1')).reviewed_at is null c_belum_dilihat;
select pg_temp.nlines('b2b00000-0000-0000-0000-0000000000c1') = 2 c_digabung, pg_temp.line_price('b2b00000-0000-0000-0000-0000000000c1', 'Beras 5kg') = 56000 c_harga_server_bukan_klien,
       pg_temp.line_price('b2b00000-0000-0000-0000-0000000000c1', 'Minyak 1L') = 185000 c_beli_banyak_10dus;
select (pg_temp.so('b2b00000-0000-0000-0000-0000000000c1')).total = 5 * 56000 + 10 * 185000 c_total;
select (cportal_order(:'tok', jsonb_build_object('id', 'b2b00000-0000-0000-0000-0000000000c1', 'lines', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'pcs', 'qty', 1)))) ->> 'duplicate')::boolean c_kirim_ulang_sama,
       pg_temp.nlines('b2b00000-0000-0000-0000-0000000000c1') = 2 c_kirim_ulang_tidak_mengubah;
select pg_temp.nso(:'K') as n0 \gset
select cportal_order(:'tok', jsonb_build_object('id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 1), jsonb_build_object('product_id', :'nol', 'unit', 'pcs', 'qty', 1)))) ->> 'error' like 'Harga Barang tanpa harga%' c_tanpa_harga_ditolak;
select pg_temp.nso(:'K') = :n0 c_gagal_tidak_meninggalkan_pesanan;
select cportal_order(:'tok', jsonb_build_object('id', gen_random_uuid(), 'need_date', current_date - 1, 'lines', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 1)))) ->> 'error' like 'Tanggal dibutuhkan%' c_tanggal_lewat;
select cportal_order(:'tok', jsonb_build_object('id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', -3)))) ->> 'error' like 'Jumlah%' c_jumlah_minus;
select cportal_order(:'tok', jsonb_build_object('id', gen_random_uuid(), 'lines', '[]'::jsonb)) ->> 'error' = 'Keranjang masih kosong' c_kosong;
select cportal_order(:'tokbudi', jsonb_build_object('id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 1)))) ->> 'ok' = 'false' c_token_lama_tidak_bisa_pesan;
-- minta penawaran (pesanan kedua) lalu dibatalkan pelanggan
select cportal_order(:'tok', jsonb_build_object('id', 'b2b00000-0000-0000-0000-0000000000c2', 'kind', 'penawaran', 'note', 'Minta harga 50 karung',
  'lines', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'pcs', 'qty', 50)))) ->> 'ok' = 'true' c_minta_penawaran;
select (pg_temp.so('b2b00000-0000-0000-0000-0000000000c2')).portal_kind = 'penawaran' c_jenis_penawaran;

\echo == D. Penjual: lonceng, tandai dilihat, konfirmasi (cek kredit tetap), stok dipesan
reset role; set role authenticated; select pg_temp.sebagai(:'KO');
select jsonb_array_length(retail_alerts(:'K') -> 'portal') = 2 d_lonceng_dua;
select so_mark_reviewed('b2b00000-0000-0000-0000-0000000000c1') \g /dev/null
select jsonb_array_length(retail_alerts(:'K') -> 'portal') = 1 d_setelah_dilihat;
select so_confirm('b2b00000-0000-0000-0000-0000000000c1') ->> 'status' = 'dikonfirmasi' d_dikonfirmasi;
reset role;
select stock_reserved_at(:'minyak', branch_main_id(:'K')) = 120 d_stok_dipesan_10dus;
set role authenticated;
select pg_temp.sebagai(:'KX');
select pg_temp.gagal('select so_mark_reviewed(''b2b00000-0000-0000-0000-0000000000c1'')') like 'Pesanan tidak ditemukan%' d_asing_tidak_bisa;
select count(*) = 0 d_asing_piutang_kosong from receivable_open(:'K');

\echo == E. Batal oleh pelanggan hanya sebelum dikonfirmasi
reset role; set role service_role;
select cportal_cancel(:'tok', 'b2b00000-0000-0000-0000-0000000000c1') ->> 'error' like 'Pesanan sudah dikonfirmasi%' e_terkonfirmasi_tidak_bisa;
select cportal_cancel(:'tok', 'b2b00000-0000-0000-0000-0000000000c2', 'salah pilih') ->> 'ok' = 'true' e_batal;
select (pg_temp.so('b2b00000-0000-0000-0000-0000000000c2')).status = 'batal' e_status, (pg_temp.so('b2b00000-0000-0000-0000-0000000000c2')).close_reason like 'Dibatalkan pelanggan%salah pilih' e_alasan;
select cportal_cancel(:'tokbudi2', 'b2b00000-0000-0000-0000-0000000000c1') ->> 'error' = 'Pesanan tidak ditemukan' e_pelanggan_lain_tidak_bisa;

\echo == F. Surat jalan → faktur & sisa tagihan terlihat di portal
reset role; set role authenticated; select pg_temp.sebagai(:'KO');
select id as lb from so_lines where order_id = 'b2b00000-0000-0000-0000-0000000000c1' and name = 'Beras 5kg' \gset
select so_deliver('b2b00000-0000-0000-0000-0000000000d1', 'b2b00000-0000-0000-0000-0000000000c1', jsonb_build_object('method', 'kasbon', 'lines', jsonb_build_array(jsonb_build_object('line_id', :'lb', 'qty', 5)))) ->> 'status' = 'sebagian' f_kirim_sebagian;
reset role; select pg_temp.sebagai(null); set role anon;
select cportal_get(:'tok') as g2 \gset
select (:'g2'::jsonb -> 'invoices' -> 0 ->> 'open')::numeric = 280000 f_sisa_faktur, (:'g2'::jsonb -> 'customer' ->> 'balance')::numeric = 280000 f_piutang,
       (:'g2'::jsonb -> 'customer' ->> 'open_orders')::numeric = 1850000 f_pesanan_berjalan,
       (select o -> 'deliveries' -> 0 ->> 'invoice' from jsonb_array_elements(:'g2'::jsonb -> 'orders') o where o->>'id' = 'b2b00000-0000-0000-0000-0000000000c1') is not null f_surat_jalan_terlihat;
select (select sum((l->>'sent')::numeric) from jsonb_array_elements(:'g2'::jsonb -> 'orders') o, jsonb_array_elements(o->'lines') l where o->>'id' = 'b2b00000-0000-0000-0000-0000000000c1') = 5 f_terkirim;

\echo == G. Link dimatikan / bisnis ditutup / paket turun → portal berhenti
reset role; set role authenticated; select pg_temp.sebagai(:'KO');
select cportal_off(:'budi') \g /dev/null
reset role;
select (cportal_get(:'tokbudi2') ->> 'ok')::boolean = false g_dimatikan;
update kos set plan = 'dasar' where id = :'K';
select cportal_get(:'tok') ->> 'error' like 'Portal pelanggan sedang tidak aktif%' g_paket_turun, (select legacy_features from kos where id = :'K') is not null g_ada_legacy;
update kos set plan = 'pro' where id = :'K';
update kos set closed_at = now() where id = :'K';
select (cportal_get(:'tok') ->> 'ok')::boolean = false g_ditutup;
update kos set closed_at = null where id = :'K';
select (cportal_get(:'tok') ->> 'ok')::boolean g_buka_lagi;
-- receivable_open (pemakai lama) tetap memeriksa anggota
set role authenticated; select pg_temp.sebagai(:'KO');
select count(*) = 1 g_piutang_pemilik from receivable_open(:'K', :'tini');
