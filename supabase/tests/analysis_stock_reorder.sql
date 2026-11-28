begin;
insert into auth.users(id,email) values
  ('7e57a000-0000-4000-8000-000000000001','stock-analysis@example.test'),
  ('7e57a000-0000-4000-8000-000000000002','other-stock-analysis@example.test');
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('7e57a000-0000-4000-8000-000000000010','Toko Proyeksi','7e57a000-0000-4000-8000-000000000001','bisnis',current_date+30,'active','retail');
insert into kos_members(kos_id,user_id,role) values
  ('7e57a000-0000-4000-8000-000000000010','7e57a000-0000-4000-8000-000000000001','pemilik');
insert into branches(id,kos_id,name,kind) values
  ('7e57a000-0000-4000-8000-000000000011','7e57a000-0000-4000-8000-000000000010','Outlet Timur','cabang');

do $$
declare
  k constant uuid := '7e57a000-0000-4000-8000-000000000010';
  owner_id constant text := '7e57a000-0000-4000-8000-000000000001';
  d constant date := (now() at time zone 'Asia/Jakarta')::date;
  units constant jsonb := '[{"name":"pcs","qty":1,"price_retail":2000},{"name":"dus","qty":7,"price_retail":14000}]';
  urgent uuid;
  boundary uuid;
  early uuid;
  late uuid;
  unknown_eta uuid;
  unknown_lead uuid;
  sparse uuid;
  supplier uuid;
  product uuid;
  pos uuid;
  po uuid;
  line uuid;
  result jsonb;
  row_data jsonb;
begin
  perform set_config('request.jwt.claim.sub', owner_id, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id)::text, true);
  urgent := product_save(k,null,'Perlu dipesan','pcs',1000,0,units,17,null);
  boundary := product_save(k,null,'Tepat waktu tunggu','pcs',1000,0,units,18,null);
  early := product_save(k,null,'Kedatangan cukup','pcs',1000,0,units,17,null);
  late := product_save(k,null,'Kedatangan terlambat','pcs',1000,0,units,16,null);
  unknown_eta := product_save(k,null,'Jadwal kosong','pcs',1000,0,units,17,null);
  unknown_lead := product_save(k,null,'Waktu kirim kosong','pcs',1000,0,units,17,null);
  sparse := product_save(k,null,'Jarang terjual','pcs',1000,0,units,17,null);
  supplier := contact_save(k,null,'supplier','Supplier Uji',null);
  update products set created_at = (d-20)::timestamp at time zone 'Asia/Jakarta' where kos_id = k;

  foreach product in array array[urgent,boundary,early,late,unknown_eta,unknown_lead,sparse] loop
    if product <> unknown_lead then
      perform product_set_tracking(product,false,4);
    end if;
    pos := gen_random_uuid();
    perform sale_create(pos,k,'ecer',jsonb_build_array(jsonb_build_object('product_id',product,'unit','dus','qty',1)),0,'tunai');
    update sales set sale_date = d-14, number = pos::text where id = pos;
    if product <> sparse then
      pos := gen_random_uuid();
      perform sale_create(pos,k,'ecer',jsonb_build_array(jsonb_build_object('product_id',product,'unit','pcs','qty',7)),0,'tunai');
      update sales set sale_date = d-1, number = pos::text where id = pos;
    end if;
  end loop;

  perform product_set_tracking(urgent,false,8);
  perform supplier_item_save(k,supplier,urgent,'dus',7000,null,4,null,true);

  -- Penjualan batal di dalam periode dan penjualan hari ini tidak masuk rata-rata.
  pos := gen_random_uuid();
  perform sale_create(pos,k,'ecer',jsonb_build_array(jsonb_build_object('product_id',urgent,'unit','pcs','qty',1)),0,'tunai');
  perform sale_void(pos,'Salah catat');
  update sales set sale_date = d-2, number = pos::text where id = pos;
  perform sale_create(gen_random_uuid(),k,'ecer',jsonb_build_array(jsonb_build_object('product_id',late,'unit','pcs','qty',1)),0,'tunai');

  perform purchase_order_create(gen_random_uuid(),k,d,supplier,jsonb_build_array(jsonb_build_object('product_id',early,'unit','dus','qty',1,'price',7000)),'tunai',null,null,d+2);
  po := gen_random_uuid();
  perform purchase_order_create(po,k,d,supplier,jsonb_build_array(jsonb_build_object('product_id',late,'unit','pcs','qty',10,'price',1000)),'tunai',null,null,d+4);
  select id into strict line from purchase_lines where purchase_id = po;
  perform purchase_receive_matched(po,gen_random_uuid(),jsonb_build_array(jsonb_build_object('line_id',line,'unit','pcs','good',1)));
  perform purchase_order_create(gen_random_uuid(),k,d,supplier,jsonb_build_array(jsonb_build_object('product_id',unknown_eta,'unit','pcs','qty',10,'price',1000)),'tunai');
  perform set_config('prasara.branch','7e57a000-0000-4000-8000-000000000011',true);
  perform purchase_order_create(gen_random_uuid(),k,d,supplier,jsonb_build_array(jsonb_build_object('product_id',urgent,'unit','pcs','qty',10,'price',1000)),'tunai',null,null,d+1);
  perform set_config('prasara.branch','',true);

  result := analysis_stock_reorder(k);
  assert (result->>'from')::date = d-14 and (result->>'to')::date = d-1;
  select item into strict row_data from jsonb_array_elements(result->'items') item where item->>'id'=urgent::text;
  assert row_data->>'reason'='order' and (row_data->>'days_left')::numeric=3 and (row_data->>'per_day')::numeric=1;
  assert row_data->>'lead_source'='pemasok' and row_data->>'supplier_id'=supplier::text and row_data->>'unit'='dus';
  assert (row_data->>'lead')::int=4 and jsonb_array_length(row_data->'orders')=0, 'PO cabang lain tidak dihitung';
  assert exists(select 1 from jsonb_array_elements(result->'items') item where item->>'id'=boundary::text and item->>'reason'='order'), 'Stok habis tepat pada hari kirim';
  assert not exists(select 1 from jsonb_array_elements(result->'items') item where item->>'id'=early::text), 'PO tepat waktu mencegah habis';
  select item into strict row_data from jsonb_array_elements(result->'items') item where item->>'id'=late::text;
  assert row_data->>'reason'='order' and (row_data->>'sold')::numeric=14 and (row_data->'orders'->0->>'qty')::numeric=9, 'Hanya sisa PO; stok sempat habis sebelum PO datang';
  assert exists(select 1 from jsonb_array_elements(result->'items') item where item->>'id'=unknown_eta::text and item->>'reason'='eta');
  assert exists(select 1 from jsonb_array_elements(result->'items') item where item->>'id'=unknown_lead::text and item->>'reason'='lead');
  assert exists(select 1 from jsonb_array_elements(result->'items') item where item->>'id'=sparse::text and item->>'reason'='history');

  perform set_config('request.jwt.claim.sub','7e57a000-0000-4000-8000-000000000002',true);
  begin
    perform analysis_stock_reorder(k);
    raise exception 'Data bisnis lain terbuka';
  exception when others then
    if sqlerrm <> 'Tidak punya akses ke Saran Belanja Stok' then raise; end if;
  end;
end $$;
rollback;
