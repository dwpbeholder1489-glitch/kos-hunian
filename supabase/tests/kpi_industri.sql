-- Uji Tahap J: KPI industri (industry_kpi). Angka mentah dihitung manual; rasio diuji di node supabase/tests/kpi_industri_js.mjs
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/kpi_industri.sql"
\set ON_ERROR_STOP off
\set L 'cacacaca-0000-0000-0000-00000000000a'
\set Q 'cacacaca-0000-0000-0000-00000000000b'
\set R 'cacacaca-0000-0000-0000-00000000000c'
\set D 'cacacaca-0000-0000-0000-00000000000d'
\set O 'cacacaca-0000-0000-0000-000000000001'
\set X 'cacacaca-0000-0000-0000-000000000003'
insert into auth.users(id,email) values (:'O','kpi@x.com'), (:'X','kpi-kasir@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,template_code,profile) values
  (:'L','Laundry KPI',:'O','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','jasa','laundry','{}'),
  (:'Q','Warung KPI',:'O','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','jasa','kuliner','{"tables":4}'),
  (:'R','Kos KPI',:'O','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','properti',null,'{}'),
  (:'D','Laundry Dasar',:'O','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,'active','jasa','laundry','{}') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) select id, :'O', 'pemilik' from kos where id in (:'L',:'Q',:'R',:'D') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values (:'L',:'X','kasir') on conflict do nothing;
select '2026-10-01'::date as f, '2026-10-31'::date as t \gset

-- LAUNDRY Oktober: 3 pesanan selesai (2 pelanggan, Bu Ani 2×), 1 cuci ulang, 1 batal, 1 dari portal
insert into svc_orders(id,kos_id,number,customer_name,customer_phone,received_at,due_at,status,total,completed_at,completed_date,pickup,deliver,source) values
  ('cacacaca-0000-0000-0000-0000000000a1',:'L','L1','Bu Ani','0811-111','2026-10-02 01:00+00','2026-10-03 10:00+00','selesai',35000,'2026-10-03 01:00+00','2026-10-03',true,false,'kasir'),
  ('cacacaca-0000-0000-0000-0000000000a2',:'L','L2','bu ani','0811111','2026-10-05 01:00+00','2026-10-06 01:00+00','selesai',21000,'2026-10-07 01:00+00','2026-10-07',false,false,'portal'),
  ('cacacaca-0000-0000-0000-0000000000a3',:'L','L3','Pak Budi',null,'2026-10-10 01:00+00',null,'selesai',50000,'2026-10-12 01:00+00','2026-10-12',false,true,'kasir'),
  ('cacacaca-0000-0000-0000-0000000000a4',:'L','L4','Bu Ani','0811111','2026-10-08 01:00+00',null,'batal',0,null,null,false,false,'kasir');
insert into svc_orders(id,kos_id,number,customer_name,received_at,status,total,completed_at,completed_date,rework_of) values
  ('cacacaca-0000-0000-0000-0000000000a5',:'L','L5','Bu Ani','2026-10-08 01:00+00','selesai',0,'2026-10-09 01:00+00','2026-10-09','cacacaca-0000-0000-0000-0000000000a1');
insert into svc_order_lines(order_id,kos_id,name,unit,qty,charge_qty,price,line_total) values
  ('cacacaca-0000-0000-0000-0000000000a1',:'L','Cuci setrika','kg',5,5,7000,35000),
  ('cacacaca-0000-0000-0000-0000000000a2',:'L','Cuci kering','Kg',3,3,7000,21000),
  ('cacacaca-0000-0000-0000-0000000000a3',:'L','Bed cover','pcs',2,2,25000,50000);
-- L1 siap sebelum janji (tepat), L2 siap sesudah janji (terlambat)
insert into svc_events(order_id,kos_id,kind,text,created_at) values
  ('cacacaca-0000-0000-0000-0000000000a1',:'L','status','Siap diambil','2026-10-03 00:00+00'),
  ('cacacaca-0000-0000-0000-0000000000a2',:'L','status','Siap diambil','2026-10-06 05:00+00');
insert into svc_complaints(kos_id,order_id,kind,note,created_at) values (:'L','cacacaca-0000-0000-0000-0000000000a1','kurang_bersih','noda masih ada','2026-10-08 01:00+00');

-- KULINER Oktober: 3 pesanan (2 makan di tempat bermeja, 1 bungkus), resep Rp 18.000 dari pendapatan Rp 60.000
insert into svc_orders(id,kos_id,number,customer_name,received_at,status,total,completed_at,completed_date,dine,table_no) values
  ('cacacaca-0000-0000-0000-0000000000b1',:'Q','K1','Meja 1','2026-10-02 05:00+00','selesai',30000,'2026-10-02 05:30+00','2026-10-02','tempat',1),
  ('cacacaca-0000-0000-0000-0000000000b2',:'Q','K2','Meja 2','2026-10-02 06:00+00','selesai',20000,'2026-10-02 06:20+00','2026-10-02','tempat',2),
  ('cacacaca-0000-0000-0000-0000000000b3',:'Q','K3','Bungkus','2026-10-03 06:00+00','selesai',10000,'2026-10-03 06:10+00','2026-10-03','bungkus',null);
insert into svc_order_lines(order_id,kos_id,name,unit,qty,charge_qty,price,line_total,recipe_cost) values
  ('cacacaca-0000-0000-0000-0000000000b1',:'Q','Nasi goreng','porsi',2,2,15000,30000,9000),
  ('cacacaca-0000-0000-0000-0000000000b2',:'Q','Mi ayam','porsi',2,2,10000,20000,6000),
  ('cacacaca-0000-0000-0000-0000000000b3',:'Q','Es teh','gelas',2,2,5000,10000,3000);

-- KOS Oktober (31 hari): 2 kamar. A1 terisi penuh; A2 terisi 1–15 Okt (keluar, tinggal sejak 1 Jul). Tagihan 2 × 1 jt jatuh tempo 5 Okt:
-- A1 dibayar 4 Okt (tepat), A2 dibayar 500 rb (tunggakan 500 rb).
insert into rooms(id,kos_id,code,rent) values ('cacacaca-0000-0000-0000-0000000000c1',:'R','A1',1000000), ('cacacaca-0000-0000-0000-0000000000c2',:'R','A2',1000000);
insert into occupants(id,kos_id,name) values ('cacacaca-0000-0000-0000-0000000000d1',:'R','Rina'), ('cacacaca-0000-0000-0000-0000000000d2',:'R','Tono');
insert into leases(id,kos_id,room_id,occupant_id,start_date,end_date,rent,billing_start,status) values
  ('cacacaca-0000-0000-0000-0000000000e1',:'R','cacacaca-0000-0000-0000-0000000000c1','cacacaca-0000-0000-0000-0000000000d1','2026-09-01',null,1000000,'2026-09-01','aktif'),
  ('cacacaca-0000-0000-0000-0000000000e2',:'R','cacacaca-0000-0000-0000-0000000000c2','cacacaca-0000-0000-0000-0000000000d2','2026-07-01','2026-10-15',1000000,'2026-07-01','selesai');
insert into invoices(id,kos_id,lease_id,room_id,occupant_id,kind,period_start,period_end,due_date,amount) values
  ('cacacaca-0000-0000-0000-0000000000f1',:'R','cacacaca-0000-0000-0000-0000000000e1','cacacaca-0000-0000-0000-0000000000c1','cacacaca-0000-0000-0000-0000000000d1','sewa','2026-10-01','2026-10-31','2026-10-05',1000000),
  ('cacacaca-0000-0000-0000-0000000000f2',:'R','cacacaca-0000-0000-0000-0000000000e2','cacacaca-0000-0000-0000-0000000000c2','cacacaca-0000-0000-0000-0000000000d2','sewa','2026-10-01','2026-10-31','2026-10-05',1000000);
insert into payments(kos_id,invoice_id,amount,paid_at,method,status) values
  (:'R','cacacaca-0000-0000-0000-0000000000f1',1000000,'2026-10-04','transfer','terverifikasi'),
  (:'R','cacacaca-0000-0000-0000-0000000000f2',500000,'2026-10-10','tunai','terverifikasi');
\o /dev/null
select set_config('request.jwt.claim.sub', :'O', false), set_config('request.jwt.claims', '{"sub":"cacacaca-0000-0000-0000-000000000001","email":"kpi@x.com"}', false);
\o

\echo == A. Laundry
select industry_kpi(:'L', :'f', :'t', null, null) -> 'cur' as a \gset
select (:'a'::jsonb ->> 'pesanan')::int a_pesanan_3, (:'a'::jsonb ->> 'ulang')::int a_ulang_1, (:'a'::jsonb ->> 'pendapatan')::numeric a_pendapatan_106rb,
       (:'a'::jsonb ->> 'masuk')::int a_masuk_5, (:'a'::jsonb ->> 'batal')::int a_batal_1, (:'a'::jsonb ->> 'online')::int a_online_1;
select (:'a'::jsonb ->> 'kg')::numeric a_kg_8, (:'a'::jsonb ->> 'kg_pendapatan')::numeric a_kg_rp_56rb, (:'a'::jsonb ->> 'kg_pesanan')::int a_kg_pesanan_2,
       (:'a'::jsonb ->> 'proses_jam')::numeric a_proses_jam_rata_36;
select (:'a'::jsonb ->> 'dengan_janji')::int a_janji_2, (:'a'::jsonb ->> 'tepat_waktu')::int a_tepat_1, (:'a'::jsonb ->> 'keluhan')::int a_keluhan_1,
       (:'a'::jsonb ->> 'antar_jemput')::int a_antar_2, (:'a'::jsonb ->> 'pelanggan')::int a_pelanggan_2, (:'a'::jsonb ->> 'pelanggan_ulang')::int a_ulang_1_bu_ani;
\echo == B. Kuliner
select industry_kpi(:'Q', :'f', :'t', null, null) -> 'cur' as b \gset
select (:'b'::jsonb ->> 'kuliner')::boolean b_kuliner, (:'b'::jsonb ->> 'tempat')::int b_tempat_2, (:'b'::jsonb ->> 'bungkus')::int b_bungkus_1,
       (:'b'::jsonb ->> 'meja_pesanan')::int b_meja_2, (:'b'::jsonb ->> 'meja')::int b_4_meja, (:'b'::jsonb ->> 'biaya_resep')::numeric b_resep_18rb, (:'b'::jsonb ->> 'pendapatan_resep')::numeric b_60rb;
\echo == C. Kos
select industry_kpi(:'R', :'f', :'t', '2026-09-01', '2026-09-30') as c \gset
select (:'c'::jsonb -> 'cur' ->> 'kamar')::int c_kamar_2, (:'c'::jsonb -> 'cur' ->> 'kamar_hari')::int c_kamar_hari_31_15_46, (:'c'::jsonb -> 'cur' ->> 'hari')::int c_31_hari,
       (:'c'::jsonb -> 'cur' ->> 'uang_masuk')::numeric c_uang_1_5jt, (:'c'::jsonb -> 'cur' ->> 'tagihan')::numeric c_tagihan_2jt, (:'c'::jsonb -> 'cur' ->> 'tunggakan')::numeric c_tunggak_500rb;
select (:'c'::jsonb -> 'cur' ->> 'tepat_bayar')::int c_tepat_1, (:'c'::jsonb -> 'cur' ->> 'keluar')::int c_keluar_1, (:'c'::jsonb -> 'cur' ->> 'lama_tinggal_bln')::numeric c_lama_3_5_bln,
       (:'c'::jsonb -> 'cur' ->> 'terisi_akhir')::int c_terisi_akhir_1, (:'c'::jsonb -> 'cmp' ->> 'kamar_hari')::int c_september_60;
\echo == D. Akses & paket
select (industry_kpi(:'D', :'f', :'t', null, null) ->> 'aktif')::boolean = false d_dasar_tidak_aktif;
do $$ begin perform industry_kpi('cacacaca-0000-0000-0000-00000000000a', '2025-01-01', '2026-10-31', null, null);
  raise notice 'GAGAL d: periode > 400 hari diterima';
exception when others then raise notice 'OK d: periode dibatasi'; end $$;
\o /dev/null
select set_config('request.jwt.claim.sub', :'X', false), set_config('request.jwt.claims', '{"sub":"cacacaca-0000-0000-0000-000000000003"}', false);
\o
do $$ begin perform industry_kpi('cacacaca-0000-0000-0000-00000000000a', '2026-10-01', '2026-10-31', null, null);
  raise notice 'GAGAL d: kasir bisa membaca KPI';
exception when others then raise notice 'OK d: kasir ditolak'; end $$;
