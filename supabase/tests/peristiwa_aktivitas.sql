-- Uji domain events & riwayat aktivitas. Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/peristiwa_aktivitas.sql"
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('c9c9c9c9-0000-0000-0000-000000000001','evt-owner@x.com'),('c9c9c9c9-0000-0000-0000-000000000002','evt-kasir@x.com'),
  ('c9c9c9c9-0000-0000-0000-000000000009','evt-luar@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('c9c9c9c9-0000-0000-0000-00000000000a','Toko Peristiwa','c9c9c9c9-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail') on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values ('c9c9c9c9-0000-0000-0000-00000000000a','c9c9c9c9-0000-0000-0000-000000000001','pemilik'),
  ('c9c9c9c9-0000-0000-0000-00000000000a','c9c9c9c9-0000-0000-0000-000000000002','kasir') on conflict do nothing;
\set K 'c9c9c9c9-0000-0000-0000-00000000000a'
select set_config('request.jwt.claim.sub', 'c9c9c9c9-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"c9c9c9c9-0000-0000-0000-000000000002"}', false) \g /dev/null

\echo == A. Penjualan oleh kasir → SaleCreated (aktor kasir); batal dua kali → satu SaleVoided (idempoten)
insert into sales(id,kos_id,number,sale_date,subtotal,total,cost_total,pay_method,status) values
  ('c9c9c9c9-0000-0000-0000-0000000000c1', :'K', 'PJ-EVT-1', current_date, 50000, 50000, 30000, 'tunai', 'selesai');
reset role;
update sales set status = 'batal', void_reason = 'salah input' where id = 'c9c9c9c9-0000-0000-0000-0000000000c1';
update sales set status = 'selesai' where id = 'c9c9c9c9-0000-0000-0000-0000000000c1';
update sales set status = 'batal' where id = 'c9c9c9c9-0000-0000-0000-0000000000c1';
select (select count(*) from domain_events where aggregate_id = 'c9c9c9c9-0000-0000-0000-0000000000c1' and event_type = 'SaleCreated') = 1 a_satu_created,
       (select count(*) from domain_events where aggregate_id = 'c9c9c9c9-0000-0000-0000-0000000000c1' and event_type = 'SaleVoided') = 1 a_satu_voided,
       (select actor_id from domain_events where event_type = 'SaleCreated' and aggregate_id = 'c9c9c9c9-0000-0000-0000-0000000000c1') = 'c9c9c9c9-0000-0000-0000-000000000002' a_aktor_kasir;

\echo == B. Pengeluaran oleh pemilik (area finance) + satu transaksi = satu correlation_id
select set_config('request.jwt.claim.sub', 'c9c9c9c9-0000-0000-0000-000000000001', false) \g /dev/null
insert into expense_categories(id,kos_id,name) values ('c9c9c9c9-0000-0000-0000-0000000000e1', :'K', 'Listrik') on conflict do nothing;
begin;
insert into expenses(kos_id,date,category_id,kind,amount,description) values (:'K', current_date, 'c9c9c9c9-0000-0000-0000-0000000000e1', 'operasional', 120000, 'PLN');
insert into expenses(kos_id,date,category_id,kind,amount,description) values (:'K', current_date, 'c9c9c9c9-0000-0000-0000-0000000000e1', 'operasional', 30000, 'air');
commit;
select count(distinct correlation_id) = 1 b_satu_korelasi, count(*) = 2 b_dua_peristiwa from domain_events where kos_id = :'K' and event_type = 'ExpenseRecorded';
\echo (transaksi gagal → peristiwa ikut batal)
begin;
insert into expenses(kos_id,date,category_id,kind,amount,description) values (:'K', current_date, 'c9c9c9c9-0000-0000-0000-0000000000e1', 'operasional', 999, 'batal');
rollback;
select not exists (select 1 from domain_events where kos_id = :'K' and amount = 999) b_rollback_tidak_tercatat;

\echo == C. Riwayat: kasir hanya area penjualan, pemilik semua, orang luar ditolak; riwayat per dokumen
select set_config('request.jwt.claim.sub', 'c9c9c9c9-0000-0000-0000-000000000002', false) \g /dev/null
select activity_feed(:'K') as fk \gset
select (select count(*) from jsonb_array_elements(:'fk'::jsonb -> 'rows') r where r ->> 'area' = 'finance') = 0 c_kasir_tanpa_keuangan,
       (select count(*) from jsonb_array_elements(:'fk'::jsonb -> 'rows') r where r ->> 'type' = 'SaleCreated') = 1 c_kasir_lihat_penjualan;
select set_config('request.jwt.claim.sub', 'c9c9c9c9-0000-0000-0000-000000000001', false) \g /dev/null
select jsonb_array_length(activity_feed(:'K') -> 'rows') >= 4 c_pemilik_semua,
       jsonb_array_length(activity_for(:'K', 'sale', 'c9c9c9c9-0000-0000-0000-0000000000c1')) = 2 c_riwayat_dokumen,
       (activity_feed(:'K') -> 'rows' -> 0 ->> 'label') is not null c_ada_label;
select set_config('request.jwt.claim.sub', 'c9c9c9c9-0000-0000-0000-000000000009', false) \g /dev/null
do $$ declare m text; begin
  begin perform activity_feed('c9c9c9c9-0000-0000-0000-00000000000a'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tidak punya akses%' then raise exception 'C_GAGAL luar: %', m; end if; raise notice 'c_OK: orang luar ditolak';
  m := null;
  begin perform event_reconcile(); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tidak punya izin%' then raise exception 'C_GAGAL admin: %', m; end if; raise notice 'c_OK: pemantauan hanya staf';
end $$;

\echo == D. Tabel tidak bisa dibaca/ditulis langsung oleh pengguna
set role authenticated;
select set_config('request.jwt.claim.sub', 'c9c9c9c9-0000-0000-0000-000000000001', false) \g /dev/null
select count(*) = 0 d_tanpa_akses_langsung from domain_events;
do $$ declare m text; begin
  begin insert into domain_events(kos_id,event_type,aggregate_type,aggregate_id,correlation_id,idempotency_key,area,summary)
        values ('c9c9c9c9-0000-0000-0000-00000000000a','X','x',gen_random_uuid(),gen_random_uuid(),'palsu','sell','palsu'); exception when others then m := sqlerrm; end;
  if m is null then raise exception 'D_GAGAL: pengguna bisa menulis peristiwa palsu'; end if; raise notice 'd_OK: tulis langsung ditolak';
end $$;
reset role;
