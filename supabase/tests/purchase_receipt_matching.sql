-- Jalankan setelah seluruh migrasi.
begin;
insert into auth.users(id, email) values
  ('52656365-6970-4000-8000-000000000001', 'owner-receipt@example.test'),
  ('52656365-6970-4000-8000-000000000002', 'other-receipt@example.test');
insert into kos(id, name, owner_id, plan, paid_until, setup_status, business_type) values
  ('52656365-6970-4000-8000-000000000010', 'Toko Penerimaan', '52656365-6970-4000-8000-000000000001', 'bisnis', current_date + 30, 'active', 'retail');
insert into kos_members(kos_id, user_id, role) values
  ('52656365-6970-4000-8000-000000000010', '52656365-6970-4000-8000-000000000001', 'pemilik');

set local role authenticated;
do $$
declare
  k constant uuid := '52656365-6970-4000-8000-000000000010';
  owner_id constant text := '52656365-6970-4000-8000-000000000001';
  product uuid;
  po uuid := gen_random_uuid();
  another_po uuid := gen_random_uuid();
  receipt uuid := gen_random_uuid();
  rest uuid := gen_random_uuid();
  line uuid;
  other_line uuid;
  payload jsonb;
  result jsonb;
  detail jsonb;
begin
  perform set_config('request.jwt.claim.sub', owner_id, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id)::text, true);
  product := product_save(k, null, 'Barang Penerimaan', 'pcs', 0, 0,
    '[{"name":"pcs","qty":1,"price_retail":2500},{"name":"renteng","qty":6,"price_retail":14000},{"name":"dus","qty":24,"price_retail":50000}]', 0, null);
  perform purchase_order_create(po, k, null, null,
    jsonb_build_array(jsonb_build_object('product_id', product, 'unit', 'dus', 'qty', 10, 'price', 24000)), 'tunai');
  perform purchase_order_create(another_po, k, null, null,
    jsonb_build_array(jsonb_build_object('product_id', product, 'unit', 'dus', 'qty', 1, 'price', 24000)), 'tunai');
  select id into strict line from purchase_lines where purchase_id = po;
  select id into strict other_line from purchase_lines where purchase_id = another_po;

  payload := jsonb_build_array(jsonb_build_object('line_id', line, 'unit', 'dus', 'good', 8, 'damaged', 1, 'price', 25000));
  result := purchase_receive_matched(po, receipt, payload);
  assert not (result->>'duplicate')::boolean;
  assert (select stock = 192 from products where id = product), '8 dus baik harus menambah 192 pcs';
  assert (select qty_received = 8 and line_total = 200000 from purchase_lines where id = line);
  assert (select status = 'sebagian' and total = 200000 from purchases where id = po);
  select lines->0 into strict detail from purchase_receipts where purchase_id = po and id = receipt;
  assert (detail->>'remaining_base')::numeric = 48;
  assert (detail->>'damaged_base')::numeric = 24;
  assert (detail->>'price_difference')::numeric = 1000;

  result := purchase_receive_matched(po, receipt, payload);
  assert (result->>'duplicate')::boolean;
  assert (select count(*) = 1 and sum(delta) = 192 from stock_moves where ref_id = po and kind = 'beli');

  perform purchase_receive_matched(po, gen_random_uuid(), jsonb_build_array(jsonb_build_object('line_id', line, 'unit', 'pcs', 'damaged', 2)));
  assert (select stock = 192 from products where id = product), 'Penerimaan rusak saja tidak boleh menambah stok';
  perform purchase_receive_matched(po, gen_random_uuid(), jsonb_build_array(jsonb_build_object('line_id', line, 'unit', 'pcs', 'good', 1)));
  assert (select stock = 193 from products where id = product), 'Satu pcs harus tetap satu pcs untuk dus isi 24';

  payload := jsonb_build_array(
    jsonb_build_object('line_id', line, 'unit', 'renteng', 'good', 7),
    jsonb_build_object('line_id', line, 'unit', 'pcs', 'good', 8),
    jsonb_build_object('line_id', line, 'unit', 'pcs', 'good', 1)
  );
  perform purchase_receive_matched(po, rest, payload);
  assert (select stock = 240 from products where id = product), 'Kelebihan tidak menambah stok';
  assert (select qty_received = 10 and line_total = 248000 from purchase_lines where id = line);
  assert (select status = 'selesai' and total = 248000 from purchases where id = po);
  select lines->1 into strict detail from purchase_receipts where purchase_id = po and id = rest;
  assert (detail->>'accepted_base')::numeric = 5 and (detail->>'excess_base')::numeric = 3;
  assert (purchase_receive_matched(po, rest, payload)->>'duplicate')::boolean, 'Ulang konfirmasi saat PO sudah selesai';
  assert (select count(*) = 4 and sum(delta) = 240 from stock_moves where ref_id = po and kind = 'beli');
  assert (select coalesce(sum(qty), 0) = 240 from stock_levels where product_id = product), 'Stok lokasi mengikuti penerimaan';

  begin
    perform purchase_receive_matched(another_po, gen_random_uuid(), jsonb_build_array(
      jsonb_build_object('line_id', other_line, 'unit', 'pcs', 'good', 1),
      jsonb_build_object('line_id', line, 'unit', 'pcs', 'good', 1)));
    raise exception 'Baris dari PO lain diterima';
  exception when others then
    if sqlerrm <> 'Baris pesanan tidak ditemukan' then raise; end if;
  end;
  assert (select stock = 240 from products where id = product), 'Baris yang ditolak membatalkan seluruh transaksi';

  perform purchase_receive_matched(another_po, gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('line_id', other_line, 'unit', 'dus', 'good', 1, 'price', 0)));
  assert (select status = 'selesai' and total = 0 from purchases where id = another_po);

  perform set_config('request.jwt.claim.sub', '52656365-6970-4000-8000-000000000002', true);
  assert not exists (select 1 from purchase_receipts where purchase_id = po), 'Riwayat bisnis lain tidak boleh terbaca';
  begin
    perform purchase_receive_matched(po, receipt, payload);
    raise exception 'Konfirmasi dari luar bisnis diterima';
  exception when others then
    if sqlerrm <> 'Belanja tidak ditemukan' then raise; end if;
  end;
end $$;
rollback;
