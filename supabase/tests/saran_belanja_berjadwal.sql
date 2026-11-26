begin;
insert into auth.users(id,email) values ('aeaa0000-0000-4000-8000-000000000001','restock-owner@example.test');
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('aeaa0000-0000-4000-8000-000000000010','Toko Uji Saran','aeaa0000-0000-4000-8000-000000000001','bisnis',current_date+30,'active','retail');
insert into kos_members(kos_id,user_id,role) values
  ('aeaa0000-0000-4000-8000-000000000010','aeaa0000-0000-4000-8000-000000000001','pemilik');
insert into branches(id,kos_id,name,kind) values
  ('aeaa0000-0000-4000-8000-000000000011','aeaa0000-0000-4000-8000-000000000010','Outlet Timur','cabang');

set local role authenticated;
do $$
declare
  k constant uuid := 'aeaa0000-0000-4000-8000-000000000010';
  east constant uuid := 'aeaa0000-0000-4000-8000-000000000011';
  owner_id constant text := 'aeaa0000-0000-4000-8000-000000000001';
  d constant date := (now() at time zone 'Asia/Jakarta')::date;
  units constant jsonb := '[{"name":"pcs","qty":1,"price_retail":2000,"price_wholesale":2000}]';
  urgent uuid;
  covered uuid;
  planned uuid;
  check_po uuid;
  stale uuid;
  supplier uuid;
  cancelled uuid := gen_random_uuid();
  uncertain_po uuid := gen_random_uuid();
  row_data jsonb;
  result jsonb;
begin
  perform set_config('request.jwt.claim.sub', owner_id, true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'email','restock-owner@example.test')::text,true);

  urgent := product_save(k,null,'Pakan Cepat','pcs',1000,2,units,33,null);
  covered := product_save(k,null,'Tepung Sudah Dipesan','pcs',1000,1,units,36,null);
  planned := product_save(k,null,'Sabun Terjadwal','pcs',1000,1,units,42,null);
  check_po := product_save(k,null,'Kopi Perlu Kepastian','pcs',1000,1,units,32,null);
  stale := product_save(k,null,'Kardus Lambat','pcs',1000,0,units,10,null);
  supplier := contact_save(k,null,'supplier','Supplier Uji',null);
  perform product_set_tracking(urgent,false,5);
  perform sale_create(gen_random_uuid(),k,'ecer',(
    select jsonb_agg(jsonb_build_object('product_id',id,'unit','pcs','qty',30))
    from unnest(array[urgent,covered,planned,check_po]) as id
  ),0,'tunai');
  perform sale_create(cancelled,k,'ecer',jsonb_build_array(jsonb_build_object('product_id',urgent,'unit','pcs','qty',1)),0,'tunai');
  perform sale_void(cancelled,'Salah catat');
  perform purchase_order_create(gen_random_uuid(),k,d,supplier,jsonb_build_array(jsonb_build_object('product_id',covered,'unit','pcs','qty',40,'price',1000)),'transfer',null,null,d+3);
  perform purchase_order_create(uncertain_po,k,d,supplier,jsonb_build_array(jsonb_build_object('product_id',check_po,'unit','pcs','qty',40,'price',1000)),'transfer',null,null,null);

  perform set_config('prasara.branch',east::text,true);
  perform purchase_order_create(gen_random_uuid(),k,d,supplier,jsonb_build_array(jsonb_build_object('product_id',urgent,'unit','pcs','qty',40,'price',1000)),'transfer',null,null,d+1);
  perform set_config('prasara.branch','',true);

  result := reorder_guidance(k);
  select item into row_data from jsonb_array_elements(result->'items') item where item->>'product_id'=urgent::text;
  assert row_data->>'action'='order_now' and (row_data->>'lead_days')::int=5, 'produk cepat perlu beli sekarang';
  assert (row_data->>'suggest')::numeric=18 and (row_data->>'on_order')::numeric=0, 'jumlah harus memakai stok & PO lokasi kerja';
  assert (row_data->>'used')::numeric=30 and (row_data->>'stockout_date')::date=d+3, 'batal penjualan dikeluarkan dan tanggal stok habis sesuai';
  assert not exists(select 1 from jsonb_array_elements(result->'items') item where item->>'product_id' in (covered::text,stale::text)), 'PO terjadwal cukup dan stok tidak bergerak tanpa minimum dikecualikan';

  select item into row_data from jsonb_array_elements(result->'items') item where item->>'product_id'=planned::text;
  assert row_data->>'action'='schedule' and (row_data->>'order_date')::date=d+7, 'tanggal pesan memperhitungkan waktu tunggu dan cadangan';

  select item into row_data from jsonb_array_elements(result->'items') item where item->>'product_id'=check_po::text;
  assert row_data->>'action'='check_eta' and row_data->>'suggest' is null, 'PO tanpa tanggal ditinjau sebelum menambah pesanan';
  perform purchase_expected_set(uncertain_po,d);
  assert not exists(select 1 from jsonb_array_elements(reorder_guidance(k)->'items') item where item->>'product_id'=check_po::text), 'jadwal yang diperbarui menutup kekurangan';
  assert (select status='dipesan' and total=0 from purchases where id=uncertain_po), 'edit tanggal tidak mencatat penerimaan';
end $$;
reset role;
rollback;
