begin;
insert into auth.users(id,email) values ('acea0000-0000-4000-8000-000000000001', 'photo-owner@example.test');
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('acea0000-0000-4000-8000-000000000010', 'Toko Foto Uji', 'acea0000-0000-4000-8000-000000000001', 'bisnis', current_date + 30, 'active', 'retail');
insert into kos_members(kos_id,user_id,role) values
  ('acea0000-0000-4000-8000-000000000010', 'acea0000-0000-4000-8000-000000000001', 'pemilik');

set local role authenticated;
do $$
declare
  k constant uuid := 'acea0000-0000-4000-8000-000000000010';
  u constant text := 'acea0000-0000-4000-8000-000000000001';
  units constant jsonb := '[{"name":"pcs","qty":1,"price_retail":3000,"price_wholesale":2800}]';
  p uuid;
  catalog jsonb;
  failure text;
begin
  perform set_config('request.jwt.claim.sub', u, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',u,'email','photo-owner@example.test')::text, true);
  p := product_save_with_packaging(k, null, 'Mie Uji Goreng', 'pcs', 2000, 0, units, 0, null, null,
    array[' Kemasan Lama ', 'Kemasan Lama', '', 'Varian Baru']);
  assert (select packaging_aliases from products where id = p) = array['Kemasan Lama','Varian Baru'];
  select x into catalog from jsonb_array_elements(kasir_catalog(k)->'products') x where x->>'id' = p::text;
  assert catalog->'packaging_aliases' = '["Kemasan Lama", "Varian Baru"]'::jsonb;
  assert not (catalog ? 'cost');

  begin
    perform product_save_with_packaging(k, p, 'Nama yang tidak tersimpan', 'pcs', 2000, 0, units, 0, null, null, array[repeat('x',101)]);
  exception when others then failure := sqlerrm; end;
  assert failure like 'Gunakan maksimal%';
  assert (select name from products where id = p) = 'Mie Uji Goreng';

  perform product_save_with_packaging(k, p, 'Mie Uji Goreng', 'pcs', 2000, 0, units, 0, null, null, '{}'::text[]);
  assert (select cardinality(packaging_aliases) from products where id = p) = 0;
end $$;
reset role;
rollback;
