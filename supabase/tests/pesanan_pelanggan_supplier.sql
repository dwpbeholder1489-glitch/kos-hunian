-- Jalankan setelah seluruh migrasi. ASSERT gagal bila hubungan SO/PO atau stok meleset.
begin;
insert into auth.users(id, email) values
  ('b2b20000-0000-4000-8000-000000000001', 'owner-po@example.test'),
  ('b2b20000-0000-4000-8000-000000000002', 'kasir-po@example.test'),
  ('b2b20000-0000-4000-8000-000000000003', 'other-po@example.test');
insert into kos(id, name, owner_id, plan, paid_until, setup_status, business_type) values
  ('b2b20000-0000-4000-8000-000000000010', 'Toko PO', 'b2b20000-0000-4000-8000-000000000001', 'bisnis', current_date + 30, 'active', 'retail'),
  ('b2b20000-0000-4000-8000-000000000020', 'Toko lain', 'b2b20000-0000-4000-8000-000000000003', 'bisnis', current_date + 30, 'active', 'retail');
insert into kos_members(kos_id, user_id, role) values
  ('b2b20000-0000-4000-8000-000000000010', 'b2b20000-0000-4000-8000-000000000001', 'pemilik'),
  ('b2b20000-0000-4000-8000-000000000010', 'b2b20000-0000-4000-8000-000000000002', 'kasir'),
  ('b2b20000-0000-4000-8000-000000000020', 'b2b20000-0000-4000-8000-000000000003', 'pemilik');
insert into branches(id, kos_id, name, kind) values
  ('b2b20000-0000-4000-8000-000000000011', 'b2b20000-0000-4000-8000-000000000010', 'Cabang kedua', 'cabang');

set local role authenticated;
do $$
declare
  k constant uuid := 'b2b20000-0000-4000-8000-000000000010';
  other_branch constant uuid := 'b2b20000-0000-4000-8000-000000000011';
  owner_id constant text := 'b2b20000-0000-4000-8000-000000000001';
  buyer uuid;
  supplier_a uuid;
  supplier_b uuid;
  product uuid;
  so uuid := gen_random_uuid();
  other_so uuid := gen_random_uuid();
  po uuid := gen_random_uuid();
  po2 uuid := gen_random_uuid();
  free_po uuid := gen_random_uuid();
  sol uuid;
  sol2 uuid;
  pol uuid;
  pol2 uuid;
  result jsonb;
  item jsonb;
  m text;
begin
  perform set_config('request.jwt.claim.sub', owner_id, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'email', 'owner-po@example.test')::text, true);
  product := product_save(k, null, 'Tepung PO', 'pcs', 1000, 0,
    '[{"name":"pcs","qty":1,"price_retail":2500,"price_wholesale":2000},{"name":"dus","qty":6,"price_retail":15000,"price_wholesale":12000}]', 0, null);
  buyer := contact_save(k, null, 'pelanggan', 'Warung Uji', null);
  supplier_a := contact_save(k, null, 'supplier', 'Supplier A', null);
  supplier_b := contact_save(k, null, 'supplier', 'Supplier B', null);

  perform so_save(so, k, jsonb_build_object('contact_id', buyer, 'confirm', true, 'lines', jsonb_build_array(
    jsonb_build_object('product_id', product, 'unit', 'dus', 'qty', 5))));
  select id into sol from so_lines where order_id = so;
  item := jsonb_build_object('line_id', sol, 'qty', 4, 'price', 6000);
  result := so_procurement(so)->'lines'->0;
  assert (result->>'unplaced')::numeric = 5 and (result->>'ready')::numeric = 0, 'stok kosong perlu 5 dus';

  perform set_config('request.jwt.claim.sub', 'b2b20000-0000-4000-8000-000000000002', true);
  begin
    perform so_purchase_create(po, so, supplier_a, jsonb_build_array(item), 'transfer');
  exception when others then m := sqlerrm; end;
  assert coalesce(m, '') like 'Akses Belanja%', 'kasir boleh lihat SO, tidak boleh buat PO';
  perform set_config('request.jwt.claim.sub', owner_id, true);

  perform set_config('prasara.branch', other_branch::text, true);
  m := null;
  begin
    perform so_purchase_create(po, so, supplier_a, jsonb_build_array(item), 'transfer');
  exception when others then m := sqlerrm; end;
  assert coalesce(m, '') like 'Pindah ke lokasi%', 'PO mengikuti lokasi pesanan';
  perform set_config('prasara.branch', '', true);

  perform so_purchase_create(po, so, supplier_a, jsonb_build_array(item), 'transfer');
  assert (select stock from products where id = product) = 0, 'membuat PO tidak menambah stok';
  assert (select so_order_id = so and total = 0 from purchases where id = po), 'PO tertaut, belum ada nilai terima';
  select id into pol from purchase_lines where purchase_id = po and so_line_id = sol;
  assert pol is not null, 'hubungan per baris tersimpan';
  assert (so_purchase_create(po, so, supplier_a, jsonb_build_array(item), 'transfer')->>'duplicate')::boolean, 'retry tetap memakai PO yang sama';
  result := so_procurement(so)->'lines'->0;
  assert (result->>'incoming')::numeric = 4 and (result->>'unplaced')::numeric = 1, 'tunggu 4 dus, perlu pesan 1';

  m := null;
  begin
    perform so_purchase_create(gen_random_uuid(), so, supplier_b, jsonb_build_array(item), 'utang');
  exception when others then m := sqlerrm; end;
  assert coalesce(m, '') like '%jumlah maksimum%', 'cegah pesan ulang di atas sisa';

  m := null;
  begin
    perform purchase_receive(po, jsonb_build_array(jsonb_build_object('line_id', pol, 'qty', 5, 'price', 6000)));
  exception when others then m := sqlerrm; end;
  assert coalesce(m, '') like '%melebihi jumlah pesanan supplier%', 'tolak penerimaan melebihi PO';
  assert (select stock from products where id = product) = 0, 'penerimaan gagal rollback stok';

  perform purchase_receive(po, jsonb_build_array(jsonb_build_object('line_id', pol, 'qty', 2, 'price', 6000)));
  assert (select status from purchases where id = po) = 'sebagian', 'status PO diterima sebagian';
  assert (select stock from products where id = product) = 12, '2 dus masuk sebagai 12 pcs';
  result := so_procurement(so)->'lines'->0;
  assert (result->>'received')::numeric = 2 and (result->>'incoming')::numeric = 2
    and (result->>'ready')::numeric = 2 and (result->>'unplaced')::numeric = 1, 'penerimaan sebagian dihitung sekali';

  m := null;
  begin
    perform so_deliver(gen_random_uuid(), so, jsonb_build_object('method', 'tunai',
      'lines', jsonb_build_array(jsonb_build_object('line_id', sol, 'qty', 3))));
  exception when others then m := sqlerrm; end;
  assert coalesce(m, '') like '%siap diserahkan saat ini%', 'pesanan terkait tidak bisa kirim melebihi stok siap';
  perform so_deliver(gen_random_uuid(), so, jsonb_build_object('method', 'tunai',
    'lines', jsonb_build_array(jsonb_build_object('line_id', sol, 'qty', 2))));
  assert (select stock from products where id = product) = 0, 'surat jalan mengurangi stok';
  assert (so_procurement(so)->'lines'->0->>'ready')::numeric = 0, 'barang yang dikirim tidak terhitung siap';

  perform purchase_receive(po, '[]', null, true);
  result := so_procurement(so)->'lines'->0;
  assert (result->>'incoming')::numeric = 0 and (result->>'unplaced')::numeric = 3, 'sisa PO ditutup dan dapat dipesan ulang';
  perform so_purchase_create(po2, so, supplier_b, jsonb_build_array(jsonb_build_object('line_id', sol, 'qty', 3, 'price', 6000)), 'utang');
  select id into pol2 from purchase_lines where purchase_id = po2 and so_line_id = sol;
  perform purchase_receive(po2, jsonb_build_array(jsonb_build_object('line_id', pol2, 'qty', 3, 'price', 6000)));
  assert (select status from purchases where id = po2) = 'selesai', 'PO penuh ditutup';
  result := so_procurement(so)->'lines'->0;
  assert (result->>'received')::numeric = 5 and (result->>'ready')::numeric = 3 and (result->>'unplaced')::numeric = 0, 'pemenuhan siap seluruh sisa';

  perform purchase_return_create(gen_random_uuid(), po2, jsonb_build_array(jsonb_build_object('line_id', pol2, 'qty', 1)), 'transfer', 'Kirim barang keliru');
  result := so_procurement(so)->'lines'->0;
  assert (result->>'received')::numeric = 4 and (result->>'ready')::numeric = 2 and (result->>'unplaced')::numeric = 1, 'retur mengoreksi penerimaan dan stok siap';

  perform so_save(other_so, k, jsonb_build_object('contact_id', buyer, 'confirm', true, 'lines', jsonb_build_array(
    jsonb_build_object('product_id', product, 'unit', 'dus', 'qty', 5),
    jsonb_build_object('product_id', product, 'unit', 'dus', 'qty', 5))));
  select id into sol2 from so_lines where order_id = other_so order by sort limit 1;
  m := null;
  begin
    perform so_purchase_create(gen_random_uuid(), so, supplier_a, jsonb_build_array(jsonb_build_object('line_id', sol2, 'qty', 1, 'price', 6000)), 'transfer');
  exception when others then m := sqlerrm; end;
  assert coalesce(m, '') like 'Baris barang bukan%', 'jangan menautkan baris SO berbeda';

  perform so_purchase_create(free_po, other_so, supplier_b, (
    select jsonb_agg(jsonb_build_object('line_id', id, 'qty', 1, 'price', 0)) from so_lines where order_id = other_so
  ), 'transfer');
  assert (select count(distinct so_line_id) from purchase_lines where purchase_id = free_po) = 2, 'baris identik ditautkan satu per satu';
  perform purchase_receive(free_po, (
    select jsonb_agg(jsonb_build_object('line_id', id, 'qty', 1, 'price', 0)) from purchase_lines where purchase_id = free_po
  ));
  assert (select status from purchases where id = free_po) = 'selesai', 'barang gratis diterima tanpa menandai PO batal';

  perform set_config('request.jwt.claim.sub', 'b2b20000-0000-4000-8000-000000000003', true);
  m := null;
  begin
    perform so_procurement(so);
  exception when others then m := sqlerrm; end;
  assert coalesce(m, '') like 'Tidak punya akses%', 'bisnis lain tidak melihat pemenuhan';
end $$;
reset role;
rollback;
