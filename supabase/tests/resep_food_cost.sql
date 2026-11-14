-- Uji resep & food cost. Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/resep_food_cost.sql"
-- Lulus = semua kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('c9c9c9c9-0000-0000-0000-000000000001','resep@x.com'), ('c9c9c9c9-0000-0000-0000-000000000002','koki@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,template_code) values
  ('c9c9c9c9-0000-0000-0000-00000000000a','Warung Uji','c9c9c9c9-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','jasa','kuliner');
insert into kos_members(kos_id,user_id,role) values ('c9c9c9c9-0000-0000-0000-00000000000a','c9c9c9c9-0000-0000-0000-000000000001','pemilik'),
  ('c9c9c9c9-0000-0000-0000-00000000000a','c9c9c9c9-0000-0000-0000-000000000002','operator');
insert into business_modules(kos_id, module_code, active, updated_by) values ('c9c9c9c9-0000-0000-0000-00000000000a', 'j_resep', true, 'uji') on conflict (kos_id, module_code) do update set active = true;
\set K 'c9c9c9c9-0000-0000-0000-00000000000a'
set role authenticated;
select set_config('request.jwt.claim.sub', 'c9c9c9c9-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000001","email":"resep@x.com"}', false) \g /dev/null
select module_on(:'K', 'j_resep') a0_modul;

\echo == A. Bahan & resep: nasi goreng 15.000 = 150 gram beras + 1 butir telur + 20 ml minyak → biaya 4.160 (27,7%)
select product_save(:'K', null, 'Beras', 'kg', 12000, 0, '[{"name":"kg"},{"name":"gram","content_qty":1,"content_unit":"gram"}]', 10, null) as beras \gset
select product_save(:'K', null, 'Telur', 'butir', 2000, 0, '[{"name":"butir"}]', 3, null) as telur \gset
select product_save(:'K', null, 'Minyak goreng', 'liter', 18000, 0, '[{"name":"liter"},{"name":"ml","content_qty":1,"content_unit":"ml"}]', 2, null) as minyak \gset
select svc_service_save(:'K', null, jsonb_build_object('name', 'Nasi goreng', 'unit', 'porsi', 'price', 15000, 'category', 'Makanan')) as nasgor \gset
select svc_service_save(:'K', null, jsonb_build_object('name', 'Es teh', 'unit', 'gelas', 'price', 5000, 'category', 'Minuman')) as esteh \gset
select (recipe_save(:'nasgor', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'gram', 'qty', 150),
  jsonb_build_object('product_id', :'telur', 'qty', 1), jsonb_build_object('product_id', :'minyak', 'unit', 'ml', 'qty', 20))) ->> 'cost')::numeric = 4160 a_biaya_4160;
select base_qty = 0.15 a_beras_015kg from svc_recipes where service_id = :'nasgor' and product_id = :'beras';
select (x->>'cost')::numeric = 4160 and (x->>'pct')::numeric = 27.7 and (x->>'margin')::numeric = 10840 and (x->>'can_make')::int = 3 a_ringkasan_porsi_3
from jsonb_array_elements(recipe_overview(:'K')) x where x->>'id' = :'nasgor';
select x->>'cost' = '0' and (x->>'n')::int = 0 and x->>'pct' is null a_tanpa_resep from jsonb_array_elements(recipe_overview(:'K')) x where x->>'id' = :'esteh';
select jsonb_array_length(recipe_get(:'nasgor')->'lines') = 3 a_baca_resep;

\echo == B. Pesanan 2 nasi goreng + 1 es teh selesai → bahan terpotong, biaya tercatat per baris
select svc_order_create(gen_random_uuid(), :'K', jsonb_build_object('name', 'Meja 1', 'dine', 'bungkus',
  'lines', jsonb_build_array(jsonb_build_object('service_id', :'nasgor', 'qty', 2), jsonb_build_object('service_id', :'esteh', 'qty', 1)))) ->> 'id' as o1 \gset
select stock = 10 b_belum_terpotong_sebelum_selesai from products where id = :'beras';
select svc_order_move(:'o1', 'siap', null) \g /dev/null
select svc_payment_add(gen_random_uuid(), :'o1', 35000, 'tunai', 'bayar') \g /dev/null
select svc_order_move(:'o1', 'selesai', null) \g /dev/null
select status = 'selesai' and recipe_done_at is not null b_selesai from svc_orders where id = :'o1';
select (select stock from products where id = :'beras') = 9.7 b_beras, (select stock from products where id = :'telur') = 1 b_telur, (select stock from products where id = :'minyak') = 1.96 b_minyak;
select recipe_cost = 8320 b_biaya_baris from svc_order_lines where order_id = :'o1' and service_id = :'nasgor';
select recipe_cost is null b_es_teh_tanpa_biaya from svc_order_lines where order_id = :'o1' and service_id = :'esteh';
reset role;
select count(*) = 3 and sum(value) = -8320 b_tiga_pergerakan from stock_moves where ref_id = :'o1' and kind = 'pakai';
set role authenticated;

\echo == C. Stok bahan kurang tidak menghalangi pesanan selesai (telur tinggal 1, butuh 2)
select svc_order_create(gen_random_uuid(), :'K', jsonb_build_object('name', 'Meja 2', 'dine', 'bungkus',
  'lines', jsonb_build_array(jsonb_build_object('service_id', :'nasgor', 'qty', 2)))) ->> 'id' as o2 \gset
select svc_order_move(:'o2', 'siap', null) \g /dev/null
select svc_payment_add(gen_random_uuid(), :'o2', 30000, 'tunai', 'bayar') \g /dev/null
select svc_order_move(:'o2', 'selesai', null) \g /dev/null
select status = 'selesai' c_tetap_selesai from svc_orders where id = :'o2';
select stock = -1 c_telur_minus from products where id = :'telur';
select (x->>'can_make')::int = 0 and x->>'short' = 'Telur' c_ditandai_kurang from jsonb_array_elements(recipe_overview(:'K')) x where x->>'id' = :'nasgor';

\echo == D. Laporan food cost & pembukuan
select (r->>'revenue')::numeric = 60000 and (r->>'cost')::numeric = 16640 and (r->>'revenue_no_recipe')::numeric = 5000 d_total,
       (select (m->>'pct')::numeric from jsonb_array_elements(r->'menus') m where m->>'name' = 'Nasi goreng') = 27.7 d_persen_menu
from (select food_cost_report(:'K', current_date - 1, current_date + 1) r) t;
select stock_adjust(:'beras', 'rusak', 0.5, 'tumpah') \g /dev/null
select (food_cost_report(:'K', current_date - 1, current_date + 1) ->> 'waste')::numeric = 6000 d_bahan_terbuang;
reset role;
select acct_sync_internal(:'K') \g /dev/null
select (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 d_jurnal_seimbang,
       (select sum(l.debit - l.credit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'beban_bahan') = 16640 d_beban_bahan;
set role authenticated;

\echo == E. Ubah resep & validasi; modal berubah tidak mengubah biaya pesanan lama
select (recipe_save(:'nasgor', jsonb_build_array(jsonb_build_object('product_id', :'beras', 'unit', 'gram', 'qty', 200))) ->> 'cost')::numeric = 2400 e_resep_baru;
select recipe_cost = 8320 e_biaya_lama_tetap from svc_order_lines where order_id = :'o1' and service_id = :'nasgor';
do $$ declare m text; s uuid := (select id from svc_services where name = 'Nasi goreng'); b uuid := (select id from products where name = 'Beras'); t uuid := (select id from products where name = 'Telur'); begin
  begin perform recipe_save(s, jsonb_build_array(jsonb_build_object('product_id', b, 'unit', 'gram', 'qty', 0))); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Isi jumlah Beras%' then raise exception 'E_GAGAL nol: %', m; end if; m := null;
  begin perform recipe_save(s, jsonb_build_array(jsonb_build_object('product_id', b, 'unit', 'ons', 'qty', 1))); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Satuan "ons" untuk Beras tidak ada%' then raise exception 'E_GAGAL satuan: %', m; end if; m := null;
  begin perform recipe_save(s, jsonb_build_array(jsonb_build_object('product_id', t, 'qty', 1), jsonb_build_object('product_id', t, 'qty', 2))); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Bahan Telur dobel%' then raise exception 'E_GAGAL dobel: %', m; end if;
  raise notice 'e_OK: jumlah nol, satuan tak dikenal, bahan dobel ditolak';
end $$;
select (select count(*) from svc_recipes where service_id = :'nasgor') = 1 e_resep_tidak_rusak_oleh_gagal;

\echo == F. Izin: operator (dapur) tidak melihat resep/biaya
select set_config('request.jwt.claim.sub', 'c9c9c9c9-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000002","email":"koki@x.com"}', false) \g /dev/null
select count(*) = 0 f_operator_tidak_melihat from svc_recipes;
do $$ declare m text; begin
  begin perform recipe_overview('c9c9c9c9-0000-0000-0000-00000000000a'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik%' then raise exception 'F_GAGAL: %', m; end if; raise notice 'f_OK: operator tidak bisa membuka biaya bahan';
end $$;
