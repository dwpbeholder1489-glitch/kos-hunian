begin;
insert into auth.users(id,email) values
  ('875e0000-0000-4000-8000-000000000001','price-owner@example.test'),
  ('875e0000-0000-4000-8000-000000000002','price-manager@example.test');
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('875e0000-0000-4000-8000-000000000010','Toko Harga','875e0000-0000-4000-8000-000000000001','bisnis',current_date+30,'active','retail');
insert into kos_members(kos_id,user_id,role) values
  ('875e0000-0000-4000-8000-000000000010','875e0000-0000-4000-8000-000000000001','pemilik'),
  ('875e0000-0000-4000-8000-000000000010','875e0000-0000-4000-8000-000000000002','pengelola');

set local role authenticated;
do $$
declare k constant uuid := '875e0000-0000-4000-8000-000000000010';
  owner_id constant text := '875e0000-0000-4000-8000-000000000001';
  staff constant text := '875e0000-0000-4000-8000-000000000002';
  d constant date := (now() at time zone 'Asia/Jakarta')::date;
  product uuid; supplier uuid; other uuid; sale_unit uuid; purchase uuid; line uuid; inv uuid;
  first_id uuid; latest uuid; latest_purchase uuid; latest_line uuid; draft_id uuid; partial uuid; data jsonb; item jsonb;
  received numeric; gross numeric; discount numeric; unit text;
begin
  perform set_config('request.jwt.claim.sub',owner_id,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id)::text,true);
  product := product_save(k,null,'Produk pantau','pcs',1000,0,
    '[{"name":"pcs","qty":1,"price_retail":2000},{"name":"renteng","qty":6,"price_retail":12000},{"name":"dus","qty":24,"price_retail":48000}]',0,null);
  supplier := contact_save(k,null,'supplier','Pemasok A',null);
  other := contact_save(k,null,'supplier','Pemasok B',null);
  select id into strict sale_unit from product_units where product_id=product and name='pcs';
  perform purchase_price_threshold_set(k,10);
  for n in 1..4 loop
    purchase := gen_random_uuid(); inv := gen_random_uuid();
    unit := case when n=1 then 'dus' else 'renteng' end;
    received := case n when 1 then 24000 when 2 then 9000 when 3 then 7200 else 8400 end;
    gross := received+1000; discount := 1000;
    perform purchase_create(purchase,k,d,case when n=2 then other else supplier end,
      jsonb_build_array(jsonb_build_object('product_id',product,'unit',unit,'qty',case when n=3 then 2 else 1 end,'price',received)),'tunai');
    select id into strict line from purchase_lines where purchase_id=purchase;
    perform sinv_save(inv,purchase,jsonb_build_object('supplier_no','DOC-'||n,'invoice_date',d-4+n,'lines',
      jsonb_build_array(jsonb_build_object('line_id',line,'qty',1,'price',gross,'discount',discount))));
    if n<4 then perform sinv_post(inv); end if;
    if n=1 then first_id:=inv; elsif n=3 then latest:=inv; latest_purchase:=purchase; latest_line:=line; elsif n=4 then draft_id:=inv; end if;
  end loop;
  assert (select price=7200 and unit_discount=1000 and line_total=7200 from supplier_invoice_lines where invoice_id=latest);
  data := purchase_price_monitor(k);
  assert jsonb_array_length(data->'items')=3, 'Faktur draf dikecualikan';
  select x into strict item from jsonb_array_elements(data->'items') x where x->>'invoice_id'=latest::text;
  assert item->>'previous_id'=first_id::text and (item->>'net_price')::numeric=1200 and (item->>'previous_price')::numeric=1000;
  assert (item->>'difference')::numeric=200 and (item->>'percent')::numeric=20 and (item->>'alert')::boolean;
  perform purchase_price_threshold_set(k,20);
  assert not (purchase_price_monitor(k)->'items'->0->>'alert')::boolean, 'Batas tepat tidak ditandai';
  data := purchase_price_simulation(k,product,latest);
  assert (data->>'net_price')::numeric=1200;
  assert (select price_retail=2000 from product_units where id=sale_unit), 'Simulasi tidak menulis harga';
  perform set_config('request.jwt.claim.sub',staff,true);
  begin
    perform purchase_price_apply(k,product,latest,sale_unit,'retail',2000,1,2500);
    raise exception 'Pengelola dapat menyetujui';
  exception when others then
    if sqlerrm <> 'Hanya pemilik bisnis dapat menyetujui harga jual baru' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',owner_id,true);
  perform purchase_price_apply(k,product,latest,sale_unit,'retail',2000,1,2500);
  assert (select price_retail=2500 and price_wholesale=0 from product_units where id=sale_unit);
  assert (select count(*)=1 from price_history where product_id=product and new_price=2500);
  perform purchase_price_apply(k,product,latest,sale_unit,'retail',2000,1,2500);
  assert (select count(*)=1 from price_history where product_id=product and new_price=2500);
  partial := gen_random_uuid();
  perform sinv_save(partial,latest_purchase,jsonb_build_object('supplier_no','DOC-3-PARTIAL','invoice_date',d,'lines',
    jsonb_build_array(jsonb_build_object('line_id',latest_line,'qty',1,'price',7200))));
  perform sinv_post(partial);
  select x into strict item from jsonb_array_elements(purchase_price_monitor(k)->'items') x where x->>'invoice_id'=partial::text;
  assert item->>'previous_id'=first_id::text,'Faktur terpisah dari pembelian yang sama bukan pembanding';
  perform sinv_void(partial,'Koreksi sebagian');
  perform sinv_void(latest,'Koreksi faktur');
  perform sinv_post(draft_id);
  assert purchase_price_monitor(k)->'items'->0->>'previous_id'=first_id::text;
end $$;
rollback;
