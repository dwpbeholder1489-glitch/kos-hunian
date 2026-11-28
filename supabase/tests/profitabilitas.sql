-- Uji Analisis Kinerja & Profitabilitas (migrasi 20261128150000). Setiap kolom pernyataan HARUS t.
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -v out=supabase/tests/data/profit_analysis.json -f supabase/tests/profitabilitas.sql"
-- Skenario bulan lalu (Toko P, Pro): A (modal 6.000) 10 × 10.000 + 5 × 10.000 diskon manual 5.000; B (modal 9.000) 2 × 8.000 (di bawah modal);
-- retur 1 A 10.000; batal 20.000; rusak 1 A 6.000; sewa 20.000 (biaya tetap) + listrik 5.000; stok A habis 10 hari (tgl 11–21).
\set ON_ERROR_STOP off
\if :{?out}
\else
\set out /dev/null
\endif
\set O 'e1e1e1e1-0000-0000-0000-000000000001'
\set X 'e1e1e1e1-0000-0000-0000-000000000002'
\set P 'e1e1e1e1-0000-0000-0000-00000000000a'
\set D 'e1e1e1e1-0000-0000-0000-00000000000d'
\set R 'e1e1e1e1-0000-0000-0000-00000000000b'
\set J 'e1e1e1e1-0000-0000-0000-00000000000c'
\set A 'e1e1e1e1-0000-0000-0000-0000000000a1'
\set B 'e1e1e1e1-0000-0000-0000-0000000000a2'
select (now() at time zone 'Asia/Jakarta')::date as today,
       (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) - interval '1 month')::date as lm,
       (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) - interval '1 day')::date as le,
       (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) - interval '2 month')::date as l2,
       (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) - interval '1 month' - interval '1 day')::date as l2e \gset
insert into auth.users(id,email) values (:'O','profit-own@x.com'), (:'X','profit-kasir@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  (:'P','Toko Profit',:'O','pro',:'today'::date + 30,'active','retail'), (:'D','Toko Dasar',:'O','dasar',:'today'::date + 30,'active','retail'),
  (:'R','Kos Profit',:'O','pro',:'today'::date + 30,'active','properti'), (:'J','Laundry Profit',:'O','pro',:'today'::date + 30,'active','jasa') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) select id, :'O', 'pemilik' from kos where id in (:'P',:'D',:'R',:'J') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'P',:'X','kasir') on conflict do nothing;
insert into products(id,kos_id,name,cost,stock,active) values (:'A',:'P','Beras A',6000,10,true), (:'B',:'P','Minyak B',9000,0,true) on conflict do nothing;
insert into sales(id,kos_id,number,sale_date,subtotal,discount,total,cost_total,pay_method,status) values
  ('e1e1e1e1-0000-0000-0000-0000000000b1',:'P','P1',:'lm'::date + 2,100000,0,100000,60000,'tunai','selesai'),
  ('e1e1e1e1-0000-0000-0000-0000000000b2',:'P','P2',:'lm'::date + 3,16000,0,16000,18000,'tunai','selesai'),
  ('e1e1e1e1-0000-0000-0000-0000000000b3',:'P','P3',:'lm'::date + 4,50000,5000,45000,30000,'tunai','selesai'),
  ('e1e1e1e1-0000-0000-0000-0000000000b4',:'P','P4',:'lm'::date + 5,20000,0,20000,12000,'tunai','batal');
insert into sale_lines(id,sale_id,kos_id,product_id,name,unit,unit_qty,qty,price,cost,line_total,tax_amount) values
  ('e1e1e1e1-0000-0000-0000-0000000000b9','e1e1e1e1-0000-0000-0000-0000000000b1',:'P',:'A','Beras A','pcs',1,10,10000,6000,100000,0);
insert into sale_lines(sale_id,kos_id,product_id,name,unit,unit_qty,qty,price,cost,line_total,tax_amount) values
  ('e1e1e1e1-0000-0000-0000-0000000000b2',:'P',:'B','Minyak B','pcs',1,2,8000,9000,16000,0),
  ('e1e1e1e1-0000-0000-0000-0000000000b3',:'P',:'A','Beras A','pcs',1,5,10000,6000,50000,0),
  ('e1e1e1e1-0000-0000-0000-0000000000b4',:'P',:'A','Beras A','pcs',1,2,10000,6000,20000,0);
insert into sale_returns(id,kos_id,sale_id,number,return_date,total,cost_total,refund_method,status,reason) values
  ('e1e1e1e1-0000-0000-0000-0000000000c1',:'P','e1e1e1e1-0000-0000-0000-0000000000b1','RP1',:'lm'::date + 6,10000,6000,'tunai','selesai','uji');
insert into sale_return_lines(return_id,kos_id,sale_line_id,product_id,name,unit,unit_qty,qty,amount,cost) values
  ('e1e1e1e1-0000-0000-0000-0000000000c1',:'P','e1e1e1e1-0000-0000-0000-0000000000b9',:'A','Beras A','pcs',1,1,10000,6000);
-- kartu stok A: 15 awal (tgl 1) → habis tgl 11 → masuk lagi tgl 21; rusak 1
insert into stock_moves(kos_id,product_id,kind,delta,stock_after,value,created_at) values
  (:'P',:'A','awal',15,15,90000,(:'lm'::date + time '08:00') at time zone 'Asia/Jakarta'),
  (:'P',:'A','jual',-15,0,-90000,(:'lm'::date + 10 + time '09:00') at time zone 'Asia/Jakarta'),
  (:'P',:'A','beli',11,11,66000,(:'lm'::date + 20 + time '09:00') at time zone 'Asia/Jakarta'),
  (:'P',:'A','rusak',-1,10,-6000,(:'lm'::date + 22 + time '09:00') at time zone 'Asia/Jakarta');
insert into expense_categories(id,kos_id,name,kind) values ('e1e1e1e1-0000-0000-0000-0000000000e1',:'P','Sewa toko','operasional'),
  ('e1e1e1e1-0000-0000-0000-0000000000e2',:'P','Listrik','operasional') on conflict do nothing;
insert into expenses(kos_id,date,category_id,kind,amount,description,account) values
  (:'P',:'lm'::date + 1,'e1e1e1e1-0000-0000-0000-0000000000e1','operasional',20000,'Sewa','kas'),
  (:'P',:'lm'::date + 9,'e1e1e1e1-0000-0000-0000-0000000000e2','operasional',5000,'Listrik','kas');
insert into cash_shifts(kos_id,user_id,opened_at,opening_cash,closed_at,expected_cash,counted_cash) values
  (:'P',:'X',(:'lm'::date + 3 + time '08:00') at time zone 'Asia/Jakarta',0,(:'lm'::date + 3 + time '20:00') at time zone 'Asia/Jakarta',100000,97000);
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"e1e1e1e1-0000-0000-0000-000000000001","email":"profit-own@x.com"}', false);
\o

\echo == A. Setelan & akses
select expense_category_fixed_set(:'P', 'e1e1e1e1-0000-0000-0000-0000000000e1', true)::text = '' a_tandai_sewa_tetap;
select (profit_settings_set(:'P', 6) ->> 'opp_rate')::numeric = 6 a_bunga_acuan_6;
do $$ begin perform profit_settings_set('e1e1e1e1-0000-0000-0000-00000000000a', 6.123);
  raise notice 'GAGAL a: bunga 3 desimal diterima';
exception when others then raise notice 'OK a: bunga acuan maks. 2 desimal'; end $$;
select count(*) = 1 a_riwayat_bunga from config_history where kos_id = :'P' and action = 'ubah_bunga_acuan';

\echo == B. Ringkasan laba rugi dari jurnal (sama dengan biz_intel)
select profit_analysis(:'P', :'lm', :'le', :'l2', :'l2e') as pa \gset
\t on
\o :out
select :'pa';
\o
\t off
select (:'pa'::jsonb -> 'cur' ->> 'pendapatan_usaha')::numeric = 161000 b_pendapatan_161rb,
       (:'pa'::jsonb -> 'cur' ->> 'retur')::numeric = -10000 b_retur_min_10rb,
       (:'pa'::jsonb -> 'cur' ->> 'tetap')::numeric = 20000 b_biaya_tetap_sewa_20rb,
       (:'pa'::jsonb -> 'cur' ->> 'pendapatan')::numeric = (biz_intel(:'P', :'lm', :'le') -> 'cur' ->> 'pendapatan')::numeric b_sama_dengan_biz_intel,
       (:'pa'::jsonb -> 'cur' ->> 'laba')::numeric = (biz_intel(:'P', :'lm', :'le') -> 'cur' ->> 'laba')::numeric b_laba_sama,
       :'pa'::jsonb ->> 'level' = 'mendalam' b_level_pro, (:'pa'::jsonb ->> 'opp_rate')::numeric = 6 b_bunga_terbaca;
\echo == C. Produk, kategori biaya, kebocoran
select (select (x ->> 'omzet')::numeric from jsonb_array_elements(:'pa'::jsonb -> 'produk') x where x ->> 'id' = :'A') = 135000 c_omzet_a_135rb,
       (select (x ->> 'hpp')::numeric from jsonb_array_elements(:'pa'::jsonb -> 'produk') x where x ->> 'id' = :'A') = 84000 c_hpp_a_84rb,
       (select (x ->> 'qty')::numeric from jsonb_array_elements(:'pa'::jsonb -> 'produk') x where x ->> 'id' = :'A') = 14 c_qty_a_14,
       (select (x ->> 'cur')::numeric from jsonb_array_elements(:'pa'::jsonb -> 'kategori_biaya') x where x ->> 'nama' = 'Sewa toko') = 20000 c_sewa,
       (select (x ->> 'tetap')::boolean from jsonb_array_elements(:'pa'::jsonb -> 'kategori_biaya') x where x ->> 'nama' = 'Sewa toko') c_sewa_bertanda_tetap;
select (:'pa'::jsonb -> 'bocor' -> 'diskon_manual' ->> 'nilai')::numeric = 5000 c_diskon_5rb,
       (:'pa'::jsonb -> 'bocor' -> 'bawah_modal' ->> 'nilai')::numeric = 2000 c_bawah_modal_2rb,
       (:'pa'::jsonb -> 'bocor' -> 'susut' ->> 'nilai')::numeric = 6000 c_susut_6rb,
       (:'pa'::jsonb -> 'bocor' -> 'retur' ->> 'nilai')::numeric = 10000 c_retur_10rb,
       (:'pa'::jsonb -> 'bocor' -> 'batal' ->> 'n')::int = 1 c_batal_1,
       (:'pa'::jsonb -> 'bocor' -> 'laci_kurang' ->> 'nilai')::numeric = 3000 c_laci_kurang_3rb;
\echo == D. Peluang: stok habis 10 hari, kas
select (select (x ->> 'hari_habis')::numeric from jsonb_array_elements(:'pa'::jsonb -> 'peluang' -> 'stok_habis') x where x ->> 'id' = :'A') = 10 d_a_habis_10_hari,
       (:'pa'::jsonb -> 'peluang' -> 'kas' ->> 'hari')::int = (:'le'::date - :'lm'::date + 1) d_kas_harian_sebulan,
       jsonb_array_length(:'pa'::jsonb -> 'tren') = 12 d_tren_12_bulan;
\echo == E. Paket & akses
select profit_analysis(:'D', :'lm', :'le') as pd \gset
select :'pd'::jsonb ->> 'level' = 'dasar' e_dasar, :'pd'::jsonb -> 'produk' is null e_dasar_tanpa_produk, :'pd'::jsonb -> 'bocor' is null e_dasar_tanpa_bocor,
       jsonb_array_length(:'pd'::jsonb -> 'tren') <= 2 e_dasar_tren_2_bulan;
do $$ begin perform profit_analysis('e1e1e1e1-0000-0000-0000-00000000000d', (date_trunc('month', current_date) - interval '3 month')::date, current_date);
  raise notice 'GAGAL e: Dasar bisa 3 bulan ke belakang';
exception when others then raise notice 'OK e: Dasar dibatasi (%)', left(sqlerrm, 40); end $$;
do $$ begin perform profit_analysis('e1e1e1e1-0000-0000-0000-00000000000a', current_date - 500, current_date);
  raise notice 'GAGAL e: 500 hari diterima';
exception when others then raise notice 'OK e: maks. 400 hari'; end $$;
\o /dev/null
select set_config('request.jwt.claim.sub', :'X', false), set_config('request.jwt.claims', '{"sub":"e1e1e1e1-0000-0000-0000-000000000002"}', false);
\o
do $$ begin perform profit_analysis('e1e1e1e1-0000-0000-0000-00000000000a', current_date - 10, current_date);
  raise notice 'GAGAL e: kasir bisa membaca profitabilitas';
exception when others then raise notice 'OK e: kasir ditolak'; end $$;
do $$ begin perform profit_docs('e1e1e1e1-0000-0000-0000-00000000000a', 'product', 'e1e1e1e1-0000-0000-0000-0000000000a1', current_date - 60, current_date, null);
  raise notice 'GAGAL e: kasir bisa membuka rincian';
exception when others then raise notice 'OK e: rincian ditolak untuk kasir'; end $$;
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"e1e1e1e1-0000-0000-0000-000000000001","email":"profit-own@x.com"}', false);
\o
\echo == F. Rincian sampai transaksi asal
select jsonb_array_length(profit_docs(:'P', 'product', :'A', :'lm', :'le', null) -> 'rows') = 3 f_produk_a_3_baris,
       jsonb_array_length(profit_docs(:'P', 'leak', 'bawah_modal', :'lm', :'le', null) -> 'rows') = 1 f_bawah_modal_1,
       jsonb_array_length(profit_docs(:'P', 'leak', 'diskon_manual', :'lm', :'le', null) -> 'rows') = 1 f_diskon_1,
       jsonb_array_length(profit_docs(:'P', 'expense', 'e1e1e1e1-0000-0000-0000-0000000000e1', :'lm', :'le', null) -> 'rows') = 1 f_biaya_sewa_1;
\echo == G. Kos & jasa (adaptif)
insert into rooms(id,kos_id,code,rent) values ('e1e1e1e1-0000-0000-0000-0000000000d1',:'R','A1',1500000), ('e1e1e1e1-0000-0000-0000-0000000000d2',:'R','A2',1500000) on conflict do nothing;
insert into occupants(id,kos_id,name) values ('e1e1e1e1-0000-0000-0000-0000000000d3',:'R','Rina') on conflict do nothing;
insert into leases(id,kos_id,room_id,occupant_id,start_date,end_date,rent,billing_start,status) values
  ('e1e1e1e1-0000-0000-0000-0000000000d4',:'R','e1e1e1e1-0000-0000-0000-0000000000d1','e1e1e1e1-0000-0000-0000-0000000000d3',:'l2',null,1500000,:'l2','aktif') on conflict do nothing;
select profit_analysis(:'R', :'lm', :'le') as pr \gset
select (select (x ->> 'hari_kosong')::int from jsonb_array_elements(:'pr'::jsonb -> 'peluang' -> 'kamar_kosong') x where x ->> 'nama' = 'A2') = (:'le'::date - :'lm'::date + 1) g_a2_kosong_sebulan,
       not exists (select 1 from jsonb_array_elements(:'pr'::jsonb -> 'peluang' -> 'kamar_kosong') x where x ->> 'nama' = 'A1') g_a1_terisi,
       :'pr'::jsonb -> 'bocor' ? 'tunggakan' g_kos_tunggakan, :'pr'::jsonb -> 'peluang' -> 'stok_habis' = 'null'::jsonb g_kos_tanpa_stok;
insert into svc_orders(id,kos_id,number,customer_name,received_at,status,subtotal,discount,total) values
  ('e1e1e1e1-0000-0000-0000-0000000000f1',:'J','J1','Bu A',(:'lm'::date + 3 + time '09:00') at time zone 'Asia/Jakarta','batal',30000,0,30000);
select (profit_analysis(:'J', :'lm', :'le') -> 'peluang' -> 'pesanan_batal' ->> 'nilai')::numeric = 30000 g_jasa_batal_30rb,
       profit_analysis(:'J', :'lm', :'le') -> 'bocor' ? 'ganti_rugi' g_jasa_ganti_rugi;
