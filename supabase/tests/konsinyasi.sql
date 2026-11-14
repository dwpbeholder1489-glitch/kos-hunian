-- Uji konsinyasi (titip jual). Jalankan di database baru. Lulus = semua kolom t, tanpa ERROR.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('c9c9c9c9-0000-0000-0000-000000000001','titip@x.com'), ('c9c9c9c9-0000-0000-0000-000000000003','luar2@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('c9c9c9c9-0000-0000-0000-00000000000a','Toko Titip','c9c9c9c9-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('c9c9c9c9-0000-0000-0000-00000000000a','c9c9c9c9-0000-0000-0000-000000000001','pemilik');
\set K 'c9c9c9c9-0000-0000-0000-00000000000a'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u)::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.saldo(c uuid) returns numeric language sql security definer as $$ select public.contact_balance(c) $$;
create or replace function pg_temp.sync(k uuid) returns void language sql security definer as $$ select public.acct_sync_internal(k); select null::void $$;
create or replace function pg_temp.akun(k uuid, s text) returns numeric language sql security definer as $$
  select coalesce(sum(l.debit - l.credit), 0) from public.acct_lines l join public.acct_accounts a on a.id = l.account_id where l.kos_id = k and a.sys_key = s $$;
set role authenticated;
select pg_temp.sebagai('c9c9c9c9-0000-0000-0000-000000000001');
select product_save(:'K', null, 'Keripik Bu Ani', 'pcs', 0, 0, '[{"name":"pcs","price_retail":10000},{"name":"Pak","content_qty":10,"content_unit":"pcs","price_retail":95000}]', 0, null) as kr \gset
select product_save(:'K', null, 'Gula milik toko', 'pcs', 12000, 0, '[{"name":"pcs","price_retail":15000}]', 5, null) as gula \gset
select contact_save(:'K', null, 'supplier', 'Bu Ani', '0812') as ani \gset
select contact_save(:'K', null, 'supplier', 'Pak Budi', '0813') as budi \gset

\echo == A. Modul mati → ditolak; nyala → terima titipan
reset role;
update business_modules set active = false where kos_id = :'K' and module_code = 'r_konsinyasi';
set role authenticated;
select pg_temp.gagal(format($$select consign_overview(%L)$$, :'K')) like '%belum aktif%' a_modul_mati;
reset role;
insert into business_modules(kos_id, module_code, active, updated_by) values (:'K', 'r_konsinyasi', true, 'uji') on conflict (kos_id, module_code) do update set active = true;
set role authenticated;
select pg_temp.gagal(format($$select consign_doc_create(gen_random_uuid(), %L, 'terima', %L, '[{"product_id":"%s","unit":"pcs","qty":5,"price":10000}]')$$, :'K', :'ani', :'gula')) like '%riwayat stok%' a_barang_milik_toko_ditolak;
select r ->> 'number' like 'TT-%' and (r ->> 'total')::numeric = 140000 a_terima from (select consign_doc_create('c9c9c9c9-0000-0000-0000-0000000000d1', :'K', 'terima', :'ani',
  jsonb_build_array(jsonb_build_object('product_id', :'kr', 'unit', 'Pak', 'qty', 2, 'price', 70000))) r) z;
select (consign_doc_create('c9c9c9c9-0000-0000-0000-0000000000d1', :'K', 'terima', :'ani', '[]') ->> 'duplicate')::boolean a_idempoten;
select stock = 20 and cost = 7000 and consign_contact_id = :'ani' a_stok_dan_harga_titip from products where id = :'kr';
select pg_temp.saldo(:'ani') = 0 a_belum_ada_utang;
select pg_temp.gagal(format($$select consign_doc_create(gen_random_uuid(), %L, 'terima', %L, '[{"product_id":"%s","unit":"pcs","qty":5,"price":7000}]')$$, :'K', :'budi', :'kr')) like '%penitip lain%' a_penitip_lain_ditolak;

\echo == B. Pengaman: tidak bisa dibeli, harga titip tidak bisa diubah dari form barang
select pg_temp.gagal(format($$select purchase_create(gen_random_uuid(), %L, current_date, %L, '[{"product_id":"%s","unit":"pcs","qty":1,"price":7000}]', 'tunai')$$, :'K', :'ani', :'kr')) like '%barang titipan%' b_belanja_ditolak;
select pg_temp.gagal(format($$select product_save(%L, %L, 'Keripik Bu Ani', 'pcs', 9000, 0, '[{"name":"pcs","price_retail":10000},{"name":"Pak","content_qty":10,"content_unit":"pcs","price_retail":95000}]', 0, null)$$, :'K', :'kr')) like '%Harga titip%' b_ubah_modal_ditolak;
select product_save(:'K', :'kr', 'Keripik Bu Ani', 'pcs', 7000, 0, '[{"name":"pcs","price_retail":11000},{"name":"Pak","content_qty":10,"content_unit":"pcs","price_retail":95000}]', 0, null) = :'kr' b_ubah_harga_jual_boleh;

\echo == C. Jual lewat Kasir → utang ke penitip = harga titip; retur & batal mengurangi
select sale_create('c9c9c9c9-0000-0000-0000-0000000000e1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'kr', 'unit', 'pcs', 'qty', 6), jsonb_build_object('product_id', :'gula', 'unit', 'pcs', 'qty', 1)), 0, 'tunai', 100000, null, null, null) \g /dev/null
select pg_temp.saldo(:'ani') = 42000 c_utang_setelah_jual;
select id as sl from sale_lines where sale_id = 'c9c9c9c9-0000-0000-0000-0000000000e1' and product_id = :'kr' \gset
select sale_return_create(gen_random_uuid(), 'c9c9c9c9-0000-0000-0000-0000000000e1', jsonb_build_array(jsonb_build_object('line_id', :'sl', 'qty', 1)), 'tunai', 'kemasan sobek') \g /dev/null
select pg_temp.saldo(:'ani') = 35000 c_retur_mengurangi;
select sale_create('c9c9c9c9-0000-0000-0000-0000000000e2', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'kr', 'unit', 'pcs', 'qty', 2)), 0, 'tunai', 22000, null, null, null) \g /dev/null
select sale_void('c9c9c9c9-0000-0000-0000-0000000000e2', 'salah input') \g /dev/null
select pg_temp.saldo(:'ani') = 35000 c_batal_tidak_menambah;
select stock_adjust(:'kr', 'rusak', 1, 'remuk') \g /dev/null
select pg_temp.saldo(:'ani') = 42000 c_rusak_ditanggung_toko;
select stock = 14 c_stok from products where id = :'kr';

\echo == D. Kembalikan sebagian, setor, jurnal
select pg_temp.gagal(format($$select consign_doc_create(gen_random_uuid(), %L, 'kembali', %L, '[{"product_id":"%s","unit":"pcs","qty":99}]')$$, :'K', :'ani', :'kr')) like '%tidak cukup%' d_kembali_melebihi_stok;
select r ->> 'number' like 'KT-%' and (r ->> 'total')::numeric = 28000 d_kembali from (select consign_doc_create('c9c9c9c9-0000-0000-0000-0000000000d2', :'K', 'kembali', :'ani',
  jsonb_build_array(jsonb_build_object('product_id', :'kr', 'unit', 'pcs', 'qty', 4))) r) z;
select pg_temp.saldo(:'ani') = 42000 d_kembali_tidak_mengubah_utang;
select pg_temp.sync(:'K') \g /dev/null
select pg_temp.akun(:'K', 'titipan') = -70000 and pg_temp.akun(:'K', 'utang') = -42000 d_jurnal_titipan_utang;   -- sisa 10 pcs × 7.000 masih titipan
select pg_temp.akun(:'K', 'persediaan') = 70000 + 4 * 12000 d_persediaan;
select debt_pay(gen_random_uuid(), :'K', :'ani', 42000, 'kas', current_date, 'Setor titipan') \g /dev/null
select pg_temp.saldo(:'ani') = 0 d_lunas;
select pg_temp.sync(:'K') \g /dev/null
select pg_temp.akun(:'K', 'utang') = 0 and (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 d_seimbang;

\echo == E. Titipan lagi dengan harga baru (rata-rata), ringkasan, orang luar
select consign_doc_create('c9c9c9c9-0000-0000-0000-0000000000d3', :'K', 'terima', :'ani', jsonb_build_array(jsonb_build_object('product_id', :'kr', 'unit', 'pcs', 'qty', 10, 'price', 8000))) \g /dev/null
select stock = 20 and cost = 7500 e_rata_rata from products where id = :'kr';
select (b ->> 'diterima')::numeric = 30 and (b ->> 'dikembalikan')::numeric = 4 and (b ->> 'terjual')::numeric = 5 and (b ->> 'susut')::numeric = 1 and (b ->> 'stock')::numeric = 20
   and (r -> 'penitip' -> 0 ->> 'saldo')::numeric = 0 and jsonb_array_length(r -> 'penitip') = 1 e_ringkasan
from (select consign_overview(:'K') r) z, lateral (select r -> 'penitip' -> 0 -> 'barang' -> 0 as b) y;
select pg_temp.sebagai('c9c9c9c9-0000-0000-0000-000000000003');
select pg_temp.gagal(format($$select consign_overview(%L)$$, :'K')) like '%akses%'
   and pg_temp.gagal(format($$select consign_doc_create(gen_random_uuid(), %L, 'terima', %L, '[]')$$, :'K', :'ani')) like '%akses%' e_orang_luar_ditolak;
select (select count(*) from consign_docs) = 0 e_rls_kosong;
