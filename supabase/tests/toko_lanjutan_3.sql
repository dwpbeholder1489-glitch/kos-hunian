-- Uji Toko lanjutan 3: stok tersedia (dipesan, ditahan, dalam perjalanan), retur rusak, stok maksimum, kesehatan stok. Database baru; lulus = semua t, tanpa ERROR.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('cdcdcdcd-0000-0000-0000-000000000001','tl3@x.com'), ('cdcdcdcd-0000-0000-0000-000000000002','kasir-tl3@x.com'), ('cdcdcdcd-0000-0000-0000-000000000003','luar-tl3@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('cdcdcdcd-0000-0000-0000-00000000000a','Toko Lanjut 3','cdcdcdcd-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('cdcdcdcd-0000-0000-0000-00000000000a','cdcdcdcd-0000-0000-0000-000000000001','pemilik'), ('cdcdcdcd-0000-0000-0000-00000000000a','cdcdcdcd-0000-0000-0000-000000000002','kasir');
\set K 'cdcdcdcd-0000-0000-0000-00000000000a'
\set KS 'cdcdcdcd-0000-0000-0000-000000000002'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u, 'email', 'x@x.com')::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.lvl(p uuid, b uuid) returns numeric language sql security definer as $$ select coalesce((select qty from public.stock_levels where product_id = p and branch_id = b), 0) $$;
set role authenticated;
select pg_temp.sebagai('cdcdcdcd-0000-0000-0000-000000000001');
select product_save(:'K', null, 'Gula pasir', 'kg', 12000, 0, '[{"name":"kg","price_retail":15000,"price_wholesale":14000}]', 50, null) as gula \gset
select id as utama from branches where kos_id = :'K' and is_main \gset
select branch_save(:'K', null, 'Gudang belakang', 'gudang', null, true) as gudang \gset
select contact_save(:'K', null, 'pelanggan', 'Warung Bu Tini', '081311112222') as tini \gset

\echo == A. Dipesan (reservasi) dari pesanan grosir
select so_save('cdcdcdcd-0000-0000-0000-0000000000b1', :'K', jsonb_build_object('contact_id', :'tini', 'lines', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'kg', 'qty', 20)))) \g /dev/null
select (stock_avail(:'K') -> 'products') = '[]'::jsonb a_penawaran_belum_menahan;
select so_confirm('cdcdcdcd-0000-0000-0000-0000000000b1', null) \g /dev/null
select (stock_avail(:'K') -> 'products') @> jsonb_build_array(jsonb_build_object('product_id', :'gula', 'reserved', 20, 'available', 30)) a_dipesan_20;
select (so_stock_check('cdcdcdcd-0000-0000-0000-0000000000b1') -> 0 ->> 'available')::numeric = 50 and (so_stock_check('cdcdcdcd-0000-0000-0000-0000000000b1') -> 0 ->> 'need')::numeric = 20 a_cek_pesanan_sendiri;
select (select (x ->> 'reserved')::numeric from jsonb_array_elements(kasir_catalog(:'K') -> 'products') x where x ->> 'id' = :'gula') = 20 a_kasir_lihat_dipesan;

\echo == B. Aturan tolak memakai stok tersedia
select stock_policy_set(:'K', 'tolak') \g /dev/null
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select sale_create(gen_random_uuid(), %L, 'ecer', '[{"product_id":"%s","unit":"kg","qty":35}]', 0, 'tunai', 999999, null, null, null)$$, :'K', :'gula')) like 'STOK_KURANG:%dipesan pelanggan grosir%' b_tolak_karena_dipesan;
select sale_create('cdcdcdcd-0000-0000-0000-0000000000e1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'kg', 'qty', 30)), 0, 'tunai', 999999, null, null, null) is not null b_tepat_sisa_boleh;
select pg_temp.sebagai('cdcdcdcd-0000-0000-0000-000000000001');
select id as l1 from so_lines where order_id = 'cdcdcdcd-0000-0000-0000-0000000000b1' \gset
select (so_deliver('cdcdcdcd-0000-0000-0000-0000000000c1', 'cdcdcdcd-0000-0000-0000-0000000000b1', jsonb_build_object('method', 'tunai', 'lines', jsonb_build_array(jsonb_build_object('line_id', :'l1', 'qty', 20)))) ->> 'status') = 'selesai' b_kirim_pesanan_tetap_bisa;
select stock = 0 b_stok_habis from products where id = :'gula';
select (stock_avail(:'K') -> 'products') = '[]'::jsonb b_dipesan_lepas_setelah_kirim;
select stock_policy_set(:'K', 'izinkan') \g /dev/null

\echo == C. Barang ditahan (rusak/karantina) & retur rusak
select stock_adjust(:'gula', 'koreksi', 40, 'barang datang') \g /dev/null
select hold_create(:'K', :'gula', 'kg', 5, 'karantina', 'karung basah') as h1 \gset
select pg_temp.gagal(format($$select hold_create(%L, %L, 'kg', 36, 'rusak')$$, :'K', :'gula')) like '%belum ditahan%' c_tidak_lebih_dari_stok;
select (stock_avail(:'K') -> 'products') @> jsonb_build_array(jsonb_build_object('product_id', :'gula', 'held', 5, 'available', 35)) c_ditahan_5;
select (hold_decide(:'h1', 'lepas', 2, 'kering, aman') ->> 'status') = 'dilepas' c_lepas_sebagian;
select qty = 3 and status = 'ditahan' c_sisa_tetap_ditahan from stock_holds where id = :'h1';
select (hold_decide(:'h1', 'buang', null, 'berjamur') ->> 'qty')::numeric = 3 c_buang;
select stock = 37 c_stok_berkurang from products where id = :'gula';
select value = -36000 and kind = 'rusak' c_nilai_jadi_beban from stock_moves where ref_id = :'h1';
select pg_temp.gagal(format($$select hold_decide(%L, 'lepas')$$, :'h1')) like '%sudah diputuskan%' c_tidak_dua_kali;
select sale_create('cdcdcdcd-0000-0000-0000-0000000000e2', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'unit', 'kg', 'qty', 4)), 0, 'tunai', 999999, null, null, null) \g /dev/null
select id as sl from sale_lines where sale_id = 'cdcdcdcd-0000-0000-0000-0000000000e2' \gset
select sale_return_create('cdcdcdcd-0000-0000-0000-0000000000f1', 'cdcdcdcd-0000-0000-0000-0000000000e2', jsonb_build_array(jsonb_build_object('line_id', :'sl', 'qty', 1, 'rusak', true)), 'tunai', 'kemasan sobek') \g /dev/null
select stock = 34 c_stok_retur_masuk from products where id = :'gula';
select count(*) = 1 c_retur_rusak_ditahan from stock_holds where ref_id = 'cdcdcdcd-0000-0000-0000-0000000000f1' and reason = 'retur_rusak' and qty = 1 and status = 'ditahan';
select jsonb_array_length(hold_list(:'K')) = 1 and hold_list(:'K') -> 0 ->> 'ref' like 'RTR-%' c_daftar;

\echo == D. Mutasi dalam perjalanan
select stock_transfer_send('cdcdcdcd-0000-0000-0000-0000000000d1', :'K', :'utama', :'gudang', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'qty', 10)), 'pakai pickup') ->> 'number' like 'MUT-%' d_kirim;
select pg_temp.lvl(:'gula', :'utama') = 24 and pg_temp.lvl(:'gula', :'gudang') = 0 d_asal_berkurang_tujuan_belum;
select stock = 34 d_total_tetap from products where id = :'gula';
select (stock_avail(:'K') -> 'levels') @> jsonb_build_array(jsonb_build_object('branch_id', :'gudang', 'incoming', 10)) d_dalam_perjalanan;
select (stock_transfer_receive('cdcdcdcd-0000-0000-0000-0000000000d1', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'qty', 8)), 'kembali', null) -> 'lines' -> 0 ->> 'short')::numeric = 2 d_terima_8;
select pg_temp.lvl(:'gula', :'gudang') = 8 and pg_temp.lvl(:'gula', :'utama') = 26 d_kurang_kembali_ke_asal;
select status = 'selesai' and receive_note like '%kembali ke lokasi asal%' d_selesai from stock_transfers where id = 'cdcdcdcd-0000-0000-0000-0000000000d1';
select pg_temp.gagal($$select stock_transfer_receive('cdcdcdcd-0000-0000-0000-0000000000d1', '[]', 'kembali', null)$$) like '%sudah diterima%' d_tidak_dua_kali;
select stock_transfer_send('cdcdcdcd-0000-0000-0000-0000000000d2', :'K', :'utama', :'gudang', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'qty', 5)), null) \g /dev/null
select stock_transfer_receive('cdcdcdcd-0000-0000-0000-0000000000d2', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'qty', 3)), 'hilang', 'satu karung sobek') \g /dev/null
select stock = 32 d_hilang_mengurangi_total from products where id = :'gula';
select pg_temp.lvl(:'gula', :'gudang') = 11 and pg_temp.lvl(:'gula', :'utama') = 21 d_lokasi_benar;
select count(*) = 1 d_hilang_tercatat from stock_moves where ref_id = 'cdcdcdcd-0000-0000-0000-0000000000d2' and kind = 'rusak' and delta = -2 and value = -24000;
select stock_transfer_send('cdcdcdcd-0000-0000-0000-0000000000d3', :'K', :'utama', :'gudang', jsonb_build_array(jsonb_build_object('product_id', :'gula', 'qty', 4)), null) \g /dev/null
select pg_temp.gagal($$select stock_transfer_cancel('cdcdcdcd-0000-0000-0000-0000000000d3', '')$$) like '%alasan%' d_batal_perlu_alasan;
select stock_transfer_cancel('cdcdcdcd-0000-0000-0000-0000000000d3', 'truk mogok') \g /dev/null
select pg_temp.lvl(:'gula', :'utama') = 21 d_batal_kembali;
select (select sum(qty) from stock_levels where product_id = :'gula') = (select stock from products where id = :'gula') d_jumlah_lokasi_sama_total;
reset role;
select batch_list_rest('[{"lot":"A","qty":3},{"lot":"B","qty":5}]', 4) = '[{"lot":"B","qty":4}]'::jsonb d_sisa_batch;
set role authenticated;
select pg_temp.sebagai('cdcdcdcd-0000-0000-0000-000000000001');

\echo == E. Stok maksimum, saran belanja & kesehatan stok
select pg_temp.gagal(format($$select product_set_max(%L, 0)$$, :'gula')) like '%lebih dari 0%' e_max_valid;
select product_set_max(:'gula', 20) \g /dev/null
select (r ->> 'over_max')::int = 1 e_lewat_maks, exists (select 1 from jsonb_array_elements(r -> 'rows') x where x ->> 'product_id' = :'gula' and x ->> 'kelas' = 'normal' and (x ->> 'cover')::numeric = 53) e_kelas_normal_cukup_53_hari
from (select stock_health(:'K') r) z;
select product_save(:'K', null, 'Payung lipat', 'pcs', 20000, 0, '[{"name":"pcs","price_retail":35000}]', 6, null) as payung \gset
select exists (select 1 from jsonb_array_elements(stock_health(:'K') -> 'rows') x where x ->> 'product_id' = :'payung' and x ->> 'kelas' = 'baru') e_kelas_baru;
reset role;
update stock_moves set created_at = now() - interval '120 days' where product_id = :'payung';
set role authenticated;
select pg_temp.sebagai('cdcdcdcd-0000-0000-0000-000000000001');
select exists (select 1 from jsonb_array_elements(stock_health(:'K') -> 'rows') x where x ->> 'product_id' = :'payung' and x ->> 'kelas' = 'mati') e_kelas_mati;
reset role;
update products set min_stock = 25 where id = :'gula';
set role authenticated;
select pg_temp.sebagai('cdcdcdcd-0000-0000-0000-000000000001');
select not exists (select 1 from jsonb_array_elements(reorder_suggest(:'K')) x where x ->> 'product_id' = :'gula') e_saran_tidak_lewat_maks;

\echo == F. Akses
select pg_temp.sebagai('cdcdcdcd-0000-0000-0000-000000000003');
select pg_temp.gagal(format($$select stock_avail(%L)$$, :'K')) like '%akses%' f_luar_avail;
select pg_temp.gagal(format($$select hold_create(%L, %L, 'kg', 1, 'rusak')$$, :'K', :'gula')) like '%akses%' f_luar_tahan;
select pg_temp.gagal(format($$select stock_health(%L)$$, :'K')) like '%akses%' f_luar_kesehatan;
select pg_temp.gagal($$select stock_transfer_send(gen_random_uuid(), 'cdcdcdcd-0000-0000-0000-00000000000a', null, null, '[]', null)$$) like '%akses%' f_luar_kirim;
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select hold_create(%L, %L, 'kg', 1, 'rusak')$$, :'K', :'gula')) like '%akses%' f_kasir_tidak_menahan;
select (select count(*) from stock_holds) = 0 f_kasir_tidak_lihat_tahanan;
