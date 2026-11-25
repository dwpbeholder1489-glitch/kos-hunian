-- Jalankan setelah migrasi. ASSERT memastikan saldo per lokasi dan akses bisnis.
begin;
insert into auth.users(id,email) values
  ('03fa0000-0000-4000-8000-000000000001','owner-lokasi@example.test'),
  ('03fa0000-0000-4000-8000-000000000002','owner-lokasi-lain@example.test');
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('03fa0000-0000-4000-8000-000000000010','Toko Uji','03fa0000-0000-4000-8000-000000000001','bisnis',current_date+30,'active','retail'),
  ('03fa0000-0000-4000-8000-000000000020','Toko Lain','03fa0000-0000-4000-8000-000000000002','bisnis',current_date+30,'active','retail');
insert into kos_members(kos_id,user_id,role) values
  ('03fa0000-0000-4000-8000-000000000010','03fa0000-0000-4000-8000-000000000001','pemilik'),
  ('03fa0000-0000-4000-8000-000000000020','03fa0000-0000-4000-8000-000000000002','pemilik');
insert into branches(id,kos_id,name,kind) values
  ('03fa0000-0000-4000-8000-000000000011','03fa0000-0000-4000-8000-000000000010','Outlet Timur','cabang');

set local role authenticated;
do $$
declare
  k constant uuid := '03fa0000-0000-4000-8000-000000000010';
  other_k constant uuid := '03fa0000-0000-4000-8000-000000000020';
  east constant uuid := '03fa0000-0000-4000-8000-000000000011';
  owner_id constant text := '03fa0000-0000-4000-8000-000000000001';
  v_product uuid;
  items jsonb;
  x jsonb;
  msg text;
begin
  perform set_config('request.jwt.claim.sub',owner_id,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'email','owner-lokasi@example.test')::text,true);
  v_product := product_save(k,null,'Sabun Uji','pcs',1000,0,
    '[{"name":"pcs","qty":1,"price_retail":2000,"price_wholesale":2000}]',10,null);
  assert jsonb_array_length(retail_negative_stock(k)) = 0, 'Saldo 10 tidak masuk peringatan';

  perform set_config('prasara.branch',east::text,true);
  items := jsonb_build_array(jsonb_build_object('product_id',v_product,'unit','pcs','qty',3));
  perform sale_create(gen_random_uuid(),k,'ecer',items,0,'tunai',6000);

  assert (select stock from products where id = v_product) = 7, 'Stok gabungan harus 7 pcs';
  assert (select qty from stock_levels where product_id = v_product and branch_id = east) = -3, 'Outlet Timur harus minus 3';
  assert (select count(*) from stock_moves where kos_id = k and product_id = v_product and branch_id = east and kind = 'jual' and delta = -3) = 1, 'Kartu lokasi menemukan penjualan asal';

  x := retail_negative_stock(k);
  assert jsonb_array_length(x) = 1, 'Hanya lokasi yang minus ditampilkan';
  assert x->0->>'product_id' = v_product::text and x->0->>'branch_id' = east::text
    and x->0->>'branch_name' = 'Outlet Timur', 'Identitas untuk tautan kartu stok harus tepat';
  assert (x->0->>'qty')::numeric = -3 and (x->0->>'total_stock')::numeric = 7, 'Saldo lokasi terpisah dari total';
  assert retail_alerts(k)->'stok_minus' = x, 'Pengingat dan dashboard memakai saldo yang sama';

  begin
    perform retail_negative_stock(other_k);
  exception when others then
    msg := sqlerrm;
  end;
  assert msg = 'Tidak punya akses ke bisnis ini', 'Tidak membuka data bisnis lain';

  perform stock_adjust(v_product,'opname',0,'Hitung fisik di Outlet Timur');
  assert jsonb_array_length(retail_negative_stock(k)) = 0, 'Saldo nol menghapus peringatan';
  assert jsonb_array_length(retail_alerts(k)->'stok_minus') = 0, 'Pengingat juga kembali kosong';
end $$;
reset role;
rollback;
