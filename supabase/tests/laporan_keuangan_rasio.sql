-- Uji laporan keuangan bertingkat (biz_financials). Database baru dengan semua migrasi:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/laporan_keuangan_rasio.sql"
-- Lulus = semua kolom bernilai t / angka sesuai namanya, NOTICE berawalan OK.
\set ON_ERROR_STOP off
\set K 'a9a9a9a9-0000-0000-0000-00000000000f'
insert into auth.users(id,email) values ('a9a9a9a9-0000-0000-0000-000000000001','lk@x.com'), ('a9a9a9a9-0000-0000-0000-000000000009','luar2@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values (:'K','Toko LK','a9a9a9a9-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'K','a9a9a9a9-0000-0000-0000-000000000001','pemilik') on conflict do nothing;
select date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date as m0, (now() at time zone 'Asia/Jakarta')::date as today \gset
insert into products(id,kos_id,name,base_unit,cost,stock) values ('a9a9a9a9-0000-0000-0000-0000000000d1', :'K', 'Beras', 'karung', 60000, 0) on conflict do nothing;
-- stok awal 100 × 60.000 (jurnal Persediaan ↔ Ekuitas saldo awal)
insert into stock_moves(kos_id,product_id,kind,delta,stock_after,value,note,created_at) values (:'K','a9a9a9a9-0000-0000-0000-0000000000d1','awal',100,100,6000000,'uji', ((:'m0'::date - 40)::timestamp at time zone 'Asia/Jakarta'));
insert into sales(id,kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values
  ('a9a9a9a9-0000-0000-0000-0000000000c0', :'K', 'LK-0', :'m0'::date - 10, 1000000, 1000000, 600000, 'tunai', 'selesai'),
  ('a9a9a9a9-0000-0000-0000-0000000000c1', :'K', 'LK-1', :'m0', 2000000, 2000000, 1200000, 'tunai', 'selesai');
insert into sale_lines(sale_id,kos_id,product_id,name,unit,unit_qty,qty,price,cost,line_total) values
  ('a9a9a9a9-0000-0000-0000-0000000000c0', :'K', 'a9a9a9a9-0000-0000-0000-0000000000d1', 'Beras', 'karung', 1, 10, 100000, 60000, 1000000),
  ('a9a9a9a9-0000-0000-0000-0000000000c1', :'K', 'a9a9a9a9-0000-0000-0000-0000000000d1', 'Beras', 'karung', 1, 20, 100000, 60000, 2000000);
insert into expense_categories(id,kos_id,name) values ('a9a9a9a9-0000-0000-0000-0000000000e1', :'K', 'Listrik') on conflict do nothing;
insert into expenses(kos_id,date,category_id,kind,amount,description) values (:'K', :'m0', 'a9a9a9a9-0000-0000-0000-0000000000e1', 'operasional', 300000, 'PLN');
select set_config('request.jwt.claim.sub', 'a9a9a9a9-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a9a9a9a9-0000-0000-0000-000000000001"}', false) \g /dev/null

\echo == A. Laba rugi bertingkat = biz_intel; neraca seimbang
select biz_financials(:'K', :'m0', :'today', (:'m0'::date - interval '1 month')::date, (:'m0'::date - 1)) as f \gset
select :'f'::jsonb -> 'laba_rugi' -> 'cur' ->> 'pendapatan_usaha' a_pend_2000000, :'f'::jsonb -> 'laba_rugi' -> 'cur' ->> 'hpp' a_hpp_1200000,
       :'f'::jsonb -> 'laba_rugi' -> 'cur' ->> 'beban_operasional' a_opex_300000, :'f'::jsonb -> 'laba_rugi' -> 'cmp' ->> 'pendapatan_usaha' a_cmp_1000000;
select (select sum(v.value::numeric * case when v.key in ('pendapatan_usaha','retur','pendapatan_lain') then 1 else -1 end) from jsonb_each_text(:'f'::jsonb -> 'laba_rugi' -> 'cur') v)
     = (biz_intel(:'K', :'m0', :'today') -> 'cur' ->> 'laba')::numeric a_laba_sama_biz_intel;
select (:'f'::jsonb -> 'neraca' ->> 'seimbang')::boolean a_seimbang,
       :'f'::jsonb -> 'neraca' -> 'close' ->> 'kas' a_kas_2700000, :'f'::jsonb -> 'neraca' -> 'close' ->> 'persediaan' a_persediaan_4200000,
       :'f'::jsonb -> 'neraca' -> 'close' ->> 'laba_ditahan' a_laba_ditahan_900000, :'f'::jsonb -> 'neraca' -> 'open' ->> 'laba_ditahan' a_ditahan_awal_400000,
       jsonb_array_length(:'f'::jsonb -> 'bulanan') = 12 a_riwayat_12;
\echo == B. Tanpa laporan_lanjutan (Dasar): hanya laba rugi
update kos set plan = 'dasar' where id = :'K';
select biz_financials(:'K', :'m0', :'today') as g \gset
select (:'g'::jsonb ->> 'lengkap')::boolean = false b_ringkas, :'g'::jsonb -> 'neraca' = 'null'::jsonb b_tanpa_neraca, (:'g'::jsonb ? 'bulanan') = false b_tanpa_riwayat,
       :'g'::jsonb -> 'laba_rugi' -> 'cur' ->> 'pendapatan_usaha' b_laba_rugi_tetap_ada;
\echo == C. Akses & validasi
do $$ begin perform biz_financials('a9a9a9a9-0000-0000-0000-00000000000f', '2026-01-01', '2027-06-01'); raise notice 'GAGAL c: periode > 400 hari diterima';
exception when others then raise notice 'OK c: periode terlalu panjang ditolak'; end $$;
select set_config('request.jwt.claim.sub', 'a9a9a9a9-0000-0000-0000-000000000009', false), set_config('request.jwt.claims', '{"sub":"a9a9a9a9-0000-0000-0000-000000000009"}', false) \g /dev/null
do $$ begin perform biz_financials('a9a9a9a9-0000-0000-0000-00000000000f', date_trunc('month', now())::date, current_date); raise notice 'GAGAL c: orang luar bisa membaca';
exception when others then raise notice 'OK c: orang luar ditolak (%)', sqlerrm; end $$;
