-- Uji Tahap 2 Retail — Fondasi akuntansi dagang (migrasi 20261121170000): neraca saldo, umur utang & piutang,
-- nilai persediaan, indikator grosir. Database baru; lulus = semua kolom t, tanpa ERROR.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('dada2222-0000-0000-0000-000000000001','dagang@x.com'), ('dada2222-0000-0000-0000-000000000002','kasir-dagang@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('dada2222-0000-0000-0000-00000000000a','Toko Dagang','dada2222-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('dada2222-0000-0000-0000-00000000000a','dada2222-0000-0000-0000-000000000001','pemilik'),
  ('dada2222-0000-0000-0000-00000000000a','dada2222-0000-0000-0000-000000000002','kasir');
insert into business_modules(kos_id, module_code, active, updated_by) values ('dada2222-0000-0000-0000-00000000000a', 'r_konsinyasi', true, 'uji')
  on conflict (kos_id, module_code) do update set active = true;
\set K 'dada2222-0000-0000-0000-00000000000a'
\set KO 'dada2222-0000-0000-0000-000000000001'
\set KS 'dada2222-0000-0000-0000-000000000002'
create or replace function pg_temp.sebagai(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claims', json_build_object('sub', u)::text, false); select null::void $$;
create or replace function pg_temp.gagal(q text) returns text language plpgsql as $$
begin execute q; return 'TIDAK_DITOLAK'; exception when others then return sqlerrm; end $$;
-- contact_balance tidak boleh dipanggil langsung oleh pengguna; uji membacanya sebagai admin
create or replace function pg_temp.saldo(c uuid) returns numeric language sql security definer as $$ select public.contact_balance(c) $$;

set role authenticated;
select pg_temp.sebagai(:'KO');
select product_save(:'K', null, 'Beras 5kg', 'karung', 50000, 0, '[{"name":"karung","qty":1,"price_retail":60000,"price_wholesale":58000}]', 100, null) as beras \gset
select product_save(:'K', null, 'Keripik Bu Ani', 'pcs', 0, 0, '[{"name":"pcs","price_retail":10000}]', 0, null) as kr \gset
select contact_save(:'K', null, 'supplier', 'Pak Grosir Sumber Rejeki', '0811') as s1 \gset
select contact_save(:'K', null, 'supplier', 'Toko Plastik', '0812') as s2 \gset
select contact_save(:'K', null, 'supplier', 'Bu Ani', '0813') as ani \gset
select contact_save(:'K', null, 'pelanggan', 'Warung Bu Sri', '0814') as c1 \gset

\echo == A. Umur utang pemasok
-- P1: 10 × 52.000 = 520.000, tanggal −40 hari, jatuh tempo −10 hari; P2: 5 × 50.000 = 250.000, jatuh tempo +14 hari
select purchase_create('dada2222-0000-0000-0000-0000000000a1', :'K', current_date - 40, :'s1', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 10, 'price', 52000)), 'utang', current_date - 10, null) is not null \g /dev/null
select purchase_create('dada2222-0000-0000-0000-0000000000a2', :'K', current_date, :'s1', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 5, 'price', 50000)), 'utang', current_date + 14, null) is not null \g /dev/null
select debt_pay(gen_random_uuid(), :'K', :'s1', 200000, 'kas', current_date, 'cicil') \g /dev/null
select id as pl2 from purchase_lines where purchase_id = 'dada2222-0000-0000-0000-0000000000a2' \gset
select purchase_return_create('dada2222-0000-0000-0000-0000000000a3', 'dada2222-0000-0000-0000-0000000000a2', jsonb_build_array(jsonb_build_object('line_id', :'pl2', 'qty', 1)), 'potong_utang', 'karung sobek') \g /dev/null
-- pemasok lebih bayar: utang 10.000, dibayar lunas lewat aplikasi; kelebihan 5.000 dari data lama (debt_pay sendiri menolak bayar melebihi sisa)
select purchase_create('dada2222-0000-0000-0000-0000000000a4', :'K', current_date, :'s2', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 1, 'price', 10000)), 'utang', current_date, null) is not null \g /dev/null
select debt_pay(gen_random_uuid(), :'K', :'s2', 10000, 'kas', current_date, null) \g /dev/null
select pg_temp.gagal(format($$select debt_pay(gen_random_uuid(), %L, %L, 5000, 'kas', current_date, null)$$, :'K', :'s2')) like '%melebihi sisa%' a0_bayar_lebih_ditolak;
reset role;
insert into debt_payments(kos_id, contact_id, kind, date, amount, account, status, note) values (:'K', :'s2', 'utang', current_date, 5000, 'kas', 'selesai', 'data lama');
set role authenticated;
select pg_temp.sebagai(:'KO');
-- titipan: terima 10 × 7.000, terjual 3 (tunai) → utang ke penitip 21.000 tanpa jatuh tempo
select consign_doc_create('dada2222-0000-0000-0000-0000000000a5', :'K', 'terima', :'ani', jsonb_build_array(jsonb_build_object('product_id', :'kr', 'unit', 'pcs', 'qty', 10, 'price', 7000)), current_date, null) is not null \g /dev/null
select sale_create('dada2222-0000-0000-0000-0000000000a6', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'kr', 'unit', 'pcs', 'qty', 3)), 0, 'tunai', 30000, null, null, null, null) is not null \g /dev/null

select (select sum(open_amount) from payable_open(:'K', :'s1')) = pg_temp.saldo(:'s1') and pg_temp.saldo(:'s1') = 520000 a1_total_sama_saldo_pemasok;
select (select open_amount from payable_open(:'K', :'s1') where doc_id = 'dada2222-0000-0000-0000-0000000000a1') = 270000
   and (select open_amount from payable_open(:'K', :'s1') where doc_id = 'dada2222-0000-0000-0000-0000000000a2') = 250000 a2_fifo_terlama_dulu;
select aging_report(:'K', 'utang') as au \gset
select (:'au'::jsonb -> 'total' ->> 'b1')::numeric = 270000 and (:'au'::jsonb -> 'total' ->> 'belum')::numeric = 250000 a3_kelompok_jatuh_tempo;
select (:'au'::jsonb -> 'total' ->> 'tanpa')::numeric = 21000 and pg_temp.saldo(:'ani') = 21000 a4_titipan_tanpa_jatuh_tempo;
select exists (select 1 from jsonb_array_elements(:'au'::jsonb -> 'lebih_bayar') x where x ->> 'contact_id' = :'s2' and (x ->> 'amount')::numeric = 5000)
   and not exists (select 1 from jsonb_array_elements(:'au'::jsonb -> 'rows') x where x ->> 'contact_id' = :'s2') a5_lebih_bayar_terpisah;
select (:'au'::jsonb -> 'total' ->> 'total')::numeric = 541000 a6_total_utang;
select (select x ->> 'max_late' from jsonb_array_elements(:'au'::jsonb -> 'rows') x where x ->> 'contact_id' = :'s1')::int = 10 a7_hari_terlambat;
select (aging_report(:'K', 'utang', array[7, 14, 30]) -> 'total' ->> 'b2')::numeric = 270000 a8_rentang_bisa_dipilih;
select pg_temp.gagal(format($$select aging_report(%L, 'utang', array[60, 30, 90])$$, :'K')) like '%Rentang umur tidak valid%' a9_rentang_salah_ditolak;
select pg_temp.gagal(format($$select aging_report(%L, 'lainnya')$$, :'K')) like '%piutang atau utang%' a10_jenis_salah_ditolak;
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select aging_report(%L, 'utang')$$, :'K')) like '%akses keuangan%' a11_kasir_ditolak;
select count(*) = 0 a12_kasir_tidak_lihat_utang from payable_open(:'K');
select pg_temp.sebagai(:'KO');

\echo == B. Umur piutang pelanggan
-- kasbon lama dulu (jatuh tempo dibuat lewat 40 hari), lalu kasbon baru jatuh tempo +7 hari
select sale_create('dada2222-0000-0000-0000-0000000000b2', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 1)), 0, 'kasbon', null, :'c1', current_date + 1, null, null) is not null \g /dev/null
select sale_create('dada2222-0000-0000-0000-0000000000b1', :'K', 'ecer', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 2)), 0, 'kasbon', null, :'c1', current_date + 7, null, null) is not null \g /dev/null
reset role;
update sales set due_date = current_date - 40 where id = 'dada2222-0000-0000-0000-0000000000b2';
set role authenticated;
select pg_temp.sebagai(:'KO');
select debt_pay(gen_random_uuid(), :'K', :'c1', 20000, 'kas', current_date, null) \g /dev/null
select aging_report(:'K', 'piutang') as ap \gset
select (:'ap'::jsonb -> 'total' ->> 'total')::numeric = pg_temp.saldo(:'c1') and pg_temp.saldo(:'c1') = 160000 b1_total_sama_saldo_pelanggan;
select (:'ap'::jsonb -> 'total' ->> 'b2')::numeric = 40000 and (:'ap'::jsonb -> 'total' ->> 'belum')::numeric = 120000 b2_kelompok_piutang;
select (:'ap'::jsonb -> 'rows' -> 0 ->> 'max_late')::int = 40 b3_terlambat_terlama;
select jsonb_array_length(:'ap'::jsonb -> 'rows' -> 0 -> 'docs') = 2 b4_rincian_dokumen;

\echo == C. Neraca saldo
select acct_trial_balance(:'K', date_trunc('month', current_date)::date, current_date) as tb \gset
select (:'tb'::jsonb ->> 'seimbang')::boolean c1_seimbang;
select (:'tb'::jsonb -> 'total' ->> 'debit')::numeric = (:'tb'::jsonb -> 'total' ->> 'kredit')::numeric
   and (:'tb'::jsonb -> 'total' ->> 'akhir_debit')::numeric = (:'tb'::jsonb -> 'total' ->> 'akhir_kredit')::numeric c2_total_sama;
select (select sum((r ->> 'awal')::numeric) from jsonb_array_elements(:'tb'::jsonb -> 'rows') r) = 0 c3_saldo_awal_seimbang;
select exists (select 1 from jsonb_array_elements(:'tb'::jsonb -> 'rows') r where r ->> 'sys_key' = 'utang' and (r ->> 'akhir_kredit')::numeric > 0) c4_utang_di_kredit;
select (select (r ->> 'akhir')::numeric from jsonb_array_elements(:'tb'::jsonb -> 'rows') r where r ->> 'sys_key' = 'persediaan')
     = (inventory_valuation(:'K') ->> 'buku')::numeric c5_persediaan_sama_dengan_buku;
select not (:'tb'::jsonb ->> 'ringkas')::boolean c6_lengkap_di_paket_bisnis;
reset role;
update kos set plan = 'dasar' where id = :'K';
set role authenticated;
select pg_temp.sebagai(:'KO');
select acct_trial_balance(:'K', date_trunc('month', current_date)::date, current_date) as tr \gset
select (:'tr'::jsonb ->> 'ringkas')::boolean and (:'tr'::jsonb ->> 'seimbang')::boolean
   and not exists (select 1 from jsonb_array_elements(:'tr'::jsonb -> 'rows') r where r ->> 'type' = 'aset' and not (r ->> 'ringkas')::boolean) c7_ringkas_tetap_seimbang;
reset role;
update kos set plan = 'bisnis' where id = :'K';
set role authenticated;
select pg_temp.sebagai(:'KO');
select pg_temp.gagal(format($$select acct_trial_balance(%L, current_date, current_date - 1)$$, :'K')) like '%Periode tidak valid%' c8_periode_salah;
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select acct_trial_balance(%L, current_date, current_date)$$, :'K')) like '%akses keuangan%' c9_kasir_ditolak;
select pg_temp.sebagai(:'KO');

\echo == D. Nilai persediaan
select inventory_valuation(:'K') as iv \gset
select (:'iv'::jsonb ->> 'selisih')::numeric = 0 d1_sama_dengan_buku_besar;
select (:'iv'::jsonb -> 'total' ->> 'consign')::numeric = 49000 d2_titipan_terpisah;
select (select (r ->> 'qty')::numeric from jsonb_array_elements(:'iv'::jsonb -> 'rows') r where r ->> 'product_id' = :'beras') = (select stock from products where id = :'beras') d3_jumlah_sama_stok;
select abs((select (r ->> 'avg_cost')::numeric from jsonb_array_elements(:'iv'::jsonb -> 'rows') r where r ->> 'product_id' = :'beras') - (select cost from products where id = :'beras')) < 0.01 d4_modal_rata_rata;
select (:'iv'::jsonb -> 'total' ->> 'own')::numeric + (:'iv'::jsonb -> 'total' ->> 'consign')::numeric = (:'iv'::jsonb -> 'total' ->> 'all')::numeric d5_jumlah_bagian;
select (inventory_valuation(:'K', current_date - 1) -> 'total' ->> 'all')::numeric = 0 and inventory_valuation(:'K', current_date - 1) ->> 'buku' is null d6_tanggal_lampau_tanpa_banding;
select (inventory_valuation(:'K', current_date + 30) ->> 'asof')::date = current_date d7_tanggal_depan_jadi_hari_ini;
-- dalam perjalanan: dua lokasi, kirim 2 karung dari utama ke gudang
select branch_save(:'K', null, 'Gudang Cigasong', 'gudang', null, true) as gd \gset
select id as mn from branches where kos_id = :'K' and is_main \gset
select stock_transfer_send('dada2222-0000-0000-0000-0000000000d1', :'K', :'mn', :'gd', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'qty', 2)), 'uji') is not null \g /dev/null
select inventory_valuation(:'K') as it \gset
select (:'it'::jsonb ->> 'transit')::numeric > 0 and (:'it'::jsonb -> 'total' ->> 'all')::numeric = (:'iv'::jsonb -> 'total' ->> 'all')::numeric d8_dalam_perjalanan_tetap_milik;
select abs((select sum((x ->> 'value')::numeric) from jsonb_array_elements(:'it'::jsonb -> 'per_lokasi') x) + (:'it'::jsonb ->> 'transit')::numeric - (:'it'::jsonb -> 'total' ->> 'all')::numeric) < 1 d9_lokasi_plus_perjalanan;
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select inventory_valuation(%L)$$, :'K')) like '%akses keuangan%' d10_kasir_ditolak;
select pg_temp.sebagai(:'KO');

\echo == E. Indikator grosir
select customer_profile_set(:'c1', 'reseller', :'KS') is not null \g /dev/null
select so_save('dada2222-0000-0000-0000-0000000000e1', :'K', jsonb_build_object('contact_id', :'c1', 'need_date', current_date + 1,
  'lines', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'karung', 'qty', 5)))) is not null \g /dev/null
select so_confirm('dada2222-0000-0000-0000-0000000000e1', null) is not null \g /dev/null
select id as sl from so_lines where order_id = 'dada2222-0000-0000-0000-0000000000e1' \gset
select so_deliver('dada2222-0000-0000-0000-0000000000e2', 'dada2222-0000-0000-0000-0000000000e1',
  jsonb_build_object('method', 'kasbon', 'lines', jsonb_build_array(jsonb_build_object('line_id', :'sl', 'qty', 3)))) is not null \g /dev/null
select wholesale_kpi(:'K', current_date - 60, current_date) as wk \gset
select (:'wk'::jsonb ->> 'piutang')::numeric = pg_temp.saldo(:'c1') e1_piutang_sama_saldo;
select (:'wk'::jsonb ->> 'dso') is not null e2_dso_terhitung;
select (select (x ->> 'omzet')::numeric > 0 and x ->> 'margin_pct' is not null and x ->> 'tipe' = 'reseller' from jsonb_array_elements(:'wk'::jsonb -> 'pelanggan') x where x ->> 'contact_id' = :'c1') e3_margin_per_pelanggan;
select (:'wk'::jsonb -> 'per_sales' -> 0 ->> 'sales_user') = :'KS' e4_per_sales;
select (:'wk'::jsonb -> 'pesanan' ->> 'fill_rate_pct')::numeric = 60 and (:'wk'::jsonb -> 'pesanan' ->> 'lengkap')::int = 0 e5_fill_rate;
select (:'wk'::jsonb -> 'kirim' ->> 'tepat_pct')::numeric = 100 e6_tepat_waktu;
select not exists (select 1 from jsonb_array_elements(:'wk'::jsonb -> 'pelanggan') x where x ->> 'contact_id' is null) e7_tanpa_pelanggan_tidak_dihitung;
select pg_temp.sebagai(:'KS');
select pg_temp.gagal(format($$select wholesale_kpi(%L, current_date, current_date)$$, :'K')) like '%akses keuangan%' e8_kasir_ditolak;
