begin;
insert into auth.users(id,email) values
  ('7e57a001-0000-4000-8000-000000000001','stock-analysis@example.test'),
  ('7e57a001-0000-4000-8000-000000000002','other-stock-analysis@example.test');
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('7e57a001-0000-4000-8000-000000000010','Toko Proyeksi','7e57a001-0000-4000-8000-000000000001','bisnis',current_date+30,'active','retail');
insert into kos_members(kos_id,user_id,role) values
  ('7e57a001-0000-4000-8000-000000000010','7e57a001-0000-4000-8000-000000000001','pemilik');
insert into branches(id,kos_id,name,kind) values
  ('7e57a001-0000-4000-8000-000000000011','7e57a001-0000-4000-8000-000000000010','Outlet Timur','cabang');

do $$
declare
  k constant uuid := '7e57a001-0000-4000-8000-000000000010';
  owner_id constant text := '7e57a001-0000-4000-8000-000000000001';
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
  branch uuid;
  request uuid := gen_random_uuid();
  customer uuid;
  customer_order uuid := gen_random_uuid();
  transfer uuid := gen_random_uuid();
  season_end date := (d - interval '1 year')::date;
  first_order jsonb;
  duplicate_order jsonb;
  payload jsonb;
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
  perform set_config('prasara.branch','7e57a001-0000-4000-8000-000000000011',true);
  perform purchase_order_create(gen_random_uuid(),k,d,supplier,jsonb_build_array(jsonb_build_object('product_id',urgent,'unit','pcs','qty',10,'price',1000)),'tunai',null,null,d+1);
  perform set_config('prasara.branch','',true);

  branch := stock_loc(k);
  for offset_days in 1..2 loop
    pos := gen_random_uuid();
    perform sale_create(pos,k,'ecer',jsonb_build_array(jsonb_build_object('product_id',sparse,'unit','pcs','qty',1)),0,'tunai');
    update sales set sale_date=season_end-offset_days,number=pos::text where id=pos;
  end loop;
  customer := contact_save(k,null,'pelanggan','Toko Pelanggan',null);
  perform so_save(customer_order,k,jsonb_build_object('contact_id',customer,'confirm',true,'lines',
    jsonb_build_array(jsonb_build_object('product_id',sparse,'unit','pcs','qty',2,'price',2000))));
  perform stock_transfer_send(transfer,k,branch,'7e57a001-0000-4000-8000-000000000011',
    jsonb_build_array(jsonb_build_object('product_id',sparse,'qty',1)),null);
  result := stock_suggestion_data(k,30);
  assert result->>'location_id'=branch::text and (result->>'days')::int=30;
  select item into strict row_data from jsonb_array_elements(result->'rows') item where item->>'id'=urgent::text;
  assert (row_data->>'sold')::numeric=14 and (row_data->>'selling_days')::int=2;
  assert row_data->>'supplier_id'=supplier::text and row_data->>'lead_source'='supplier' and (row_data->>'lead')::int=4;
  assert row_data->'units'->0->>'name'='dus' and (row_data->'units'->0->>'factor')::numeric=7
    and (row_data->'units'->0->>'price')::numeric=7000;
  assert jsonb_array_length(row_data->'inbound')=0, 'PO lokasi lain dikecualikan';

  select item into strict row_data from jsonb_array_elements(result->'rows') item where item->>'id'=sparse::text;
  assert (row_data->>'sold_season')::numeric=2 and (row_data->>'selling_days_season')::int=2;
  assert (row_data->>'reserved')::numeric=2 and row_data->'customer_orders'->0->>'id'=customer_order::text;
  perform set_config('prasara.branch','7e57a001-0000-4000-8000-000000000011',true);
  select item into strict row_data from jsonb_array_elements(stock_suggestion_data(k,30)->'rows') item where item->>'id'=sparse::text;
  assert row_data->'inbound'->0->>'id'=transfer::text and (row_data->'inbound'->0->>'qty')::numeric=1
    and row_data->'inbound'->0->>'type'='transfer' and (row_data->>'stock')::numeric=0;
  perform set_config('prasara.branch','',true);

  select item into strict row_data from jsonb_array_elements(result->'rows') item where item->>'id'=late::text;
  assert (row_data->'inbound'->0->>'qty')::numeric=9, 'Hanya sisa setelah penerimaan sebagian';
  result := stock_suggestion_data(k,7,urgent);
  assert jsonb_array_length(result->'sales_sources')=2 and (result->'rows'->0->>'sold')::numeric=7;

  perform stock_shopping_save(k,branch,jsonb_build_array(jsonb_build_object('id',urgent,'unit','dus','qty',2)));
  assert jsonb_array_length(stock_suggestion_data(k,30)->'saved'->'items')=1;
  payload := jsonb_build_array(jsonb_build_object('product_id',urgent,'unit','dus','qty',2,'price',7000));
  first_order := stock_suggestion_order(k,branch,request,supplier,payload,'tunai',null,d+4);
  duplicate_order := stock_suggestion_order(k,branch,request,supplier,payload,'tunai',null,d+4);
  assert not (first_order->>'duplicate')::boolean and (duplicate_order->>'duplicate')::boolean;
  assert (select status='dipesan' and order_total=14000 and branch_id=branch from purchases where id=request);
  assert (select stock=3 from products where id=urgent), 'Pesanan belum menambah stok';
  assert jsonb_array_length(stock_suggestion_data(k,30)->'saved'->'items')=0, 'Barang yang dipesan dihapus dari daftar';

  for elapsed in 2..3 loop
    po := gen_random_uuid();
    perform purchase_order_create(po,k,d-elapsed,supplier,
      jsonb_build_array(jsonb_build_object('product_id',unknown_lead,'unit','pcs','qty',1,'price',1000)),'tunai');
    select id into strict line from purchase_lines where purchase_id=po;
    perform purchase_receive_matched(po,gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('line_id',line,'unit','pcs','good',1)));
  end loop;
  select item into strict row_data from jsonb_array_elements(stock_suggestion_data(k,30,unknown_lead)->'rows') item;
  assert row_data->>'lead_source'='receipts' and (row_data->>'lead')::int=3
    and jsonb_array_length(row_data->'lead_samples')=2 and jsonb_array_length(row_data->'replenishments')=2;

  perform set_config('request.jwt.claim.sub','7e57a001-0000-4000-8000-000000000002',true);
  begin
    perform stock_suggestion_data(k,30);
    raise exception 'Data bisnis lain terbuka';
  exception when others then
    if sqlerrm <> 'Tidak punya akses ke Saran Belanja Stok' then raise; end if;
  end;
end $$;
rollback;
