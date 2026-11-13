-- Uji fitur Paket Bisnis (bisnis lama tetap memakai), Anggaran & realisasi, dan penawaran fitur.
-- Jalankan: su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/fitur_bisnis_anggaran.sql"  (database baru)
\set ON_ERROR_STOP off
insert into auth.users(id,email) values
  ('91919191-0000-0000-0000-000000000001','fitur-owner@x.com'),
  ('91919191-0000-0000-0000-000000000002','fitur-kasir@x.com')
on conflict do nothing;
-- N = bisnis baru Dasar, L = bisnis lama Dasar (fitur dipertahankan), B = Paket Bisnis
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status,business_type) values
  ('91919191-0000-0000-0000-00000000000a','Toko Baru Dasar','91919191-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail'),
  ('91919191-0000-0000-0000-00000000000b','Toko Lama Dasar','91919191-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail'),
  ('91919191-0000-0000-0000-00000000000c','Toko Bisnis','91919191-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail')
on conflict do nothing;
update kos set legacy_features = '{jurnal_manual,persetujuan,otomatisasi}' where id = '91919191-0000-0000-0000-00000000000b';
insert into kos_members(kos_id,user_id,role) values
  ('91919191-0000-0000-0000-00000000000a','91919191-0000-0000-0000-000000000001','pemilik'),
  ('91919191-0000-0000-0000-00000000000b','91919191-0000-0000-0000-000000000001','pemilik'),
  ('91919191-0000-0000-0000-00000000000c','91919191-0000-0000-0000-000000000001','pemilik'),
  ('91919191-0000-0000-0000-00000000000c','91919191-0000-0000-0000-000000000002','kasir')
on conflict do nothing;
\set N '91919191-0000-0000-0000-00000000000a'
\set L '91919191-0000-0000-0000-00000000000b'
\set B '91919191-0000-0000-0000-00000000000c'
select set_config('request.jwt.claim.sub', '91919191-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"91919191-0000-0000-0000-000000000001","email":"fitur-owner@x.com"}', false) \g /dev/null

\echo == A. Hak fitur: bisnis baru Dasar tidak punya; bisnis lama tetap punya; Bisnis punya semua (anggaran hanya Bisnis)
select plan_has(:'N','jurnal_manual') a_baru_jurnal, plan_has(:'L','jurnal_manual') a_lama_jurnal, plan_has(:'L','anggaran') a_lama_anggaran,
       plan_has(:'B','jurnal_manual') a_bisnis_jurnal, plan_has(:'B','anggaran') a_bisnis_anggaran;
select (my_entitlements() -> :'L' -> 'features') ? 'otomatisasi' a_entitlement_lama, (my_entitlements() -> :'N' -> 'features') ? 'otomatisasi' a_entitlement_baru;

\echo == B. Jurnal manual: baru ditolak BATAS_PAKET; lama lolos pemeriksaan paket (lalu ditolak validasi baris)
do $$ declare m text; begin
  begin perform acct_manual('91919191-0000-0000-0000-00000000000a', current_date, 'Saldo awal kas', '[]'); exception when others then m := sqlerrm; end;
  if m not like 'BATAS_PAKET%' then raise exception 'B_GAGAL: baru = %', m; end if; raise notice 'b_OK: baru ditolak (%)', m;
  begin perform acct_manual('91919191-0000-0000-0000-00000000000b', current_date, 'Saldo awal kas', '[]'); exception when others then m := sqlerrm; end;
  if m like 'BATAS_PAKET%' then raise exception 'B_GAGAL: lama ikut terkunci'; end if; raise notice 'b_OK: lama lolos pemeriksaan paket (%)', m;
end $$;

\echo == C. Persetujuan: pengaman bawaan tetap berlaku; mengatur aturan sendiri hanya Bisnis/lama
select approval_required(:'N','batal_penjualan') c_bawaan_tetap_aktif;
do $$ declare m text; begin
  begin perform approval_rule_set('91919191-0000-0000-0000-00000000000a','retur_penjualan',true); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'C_GAGAL: %', m; end if; raise notice 'c_OK: baru ditolak';
end $$;
select approval_rule_set(:'L','retur_penjualan',true); select approval_required(:'L','retur_penjualan') c_lama_bisa_atur;

\echo == D. Otomatisasi: baru tidak bisa menyalakan; mematikan boleh; jadwal harian melewati bisnis tanpa fitur
select code as rc from automation_recipes where 'retail' = any(applies_to) and tier = 'dasar' order by code limit 1 \gset
do $$ declare m text; begin
  begin perform automation_set('91919191-0000-0000-0000-00000000000a', (select code from automation_recipes where 'retail' = any(applies_to) and tier = 'dasar' order by code limit 1), true, '{}'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'D_GAGAL: %', m; end if; raise notice 'd_OK: baru tidak bisa menyalakan';
end $$;
select automation_set(:'N', :'rc', false, '{}') is not null d_mematikan_boleh;
select automation_set(:'L', :'rc', true, '{}') is not null d_lama_bisa_menyalakan;
-- simulasi: aturan N menyala (mis. dari masa lalu / turun paket) -> tidak dijalankan jadwal
update automation_rules set enabled = true where kos_id = :'N';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select automation_tick() \g /dev/null
select (select count(*) from automation_runs where kos_id = :'N') = 0 d_baru_tidak_dijalankan, (select count(*) from automation_runs where kos_id = :'L') > 0 d_lama_dijalankan;
select set_config('request.jwt.claim.sub', '91919191-0000-0000-0000-000000000001', false) \g /dev/null

\echo == E. Anggaran: Bisnis bisa; Dasar ditolak; realisasi dari pengeluaran; salin bulan; 0 = hapus; kasir ditolak
insert into expense_categories(kos_id, name, kind) values (:'B','Listrik uji','operasional'), (:'N','Listrik uji','operasional') on conflict do nothing;
select id as cat from expense_categories where kos_id = :'B' order by name limit 1 \gset
select id as cat_lain from expense_categories where kos_id = :'N' order by name limit 1 \gset
insert into expenses(kos_id, date, category_id, kind, amount, description) values
  (:'B', date_trunc('month', current_date)::date + 1, :'cat', 'operasional', 300000, 'uji'),
  (:'B', date_trunc('month', current_date)::date + 2, :'cat', 'operasional', 150000, 'uji');
do $$ declare m text; begin
  begin perform budget_save('91919191-0000-0000-0000-00000000000a', current_date, (select id from expense_categories where kos_id = '91919191-0000-0000-0000-00000000000a' limit 1), 100000); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'E_GAGAL: %', m; end if; raise notice 'e_OK: Dasar baru ditolak';
end $$;
select budget_save(:'B', current_date, :'cat', 400000);
select x->>'anggaran' e_anggaran, x->>'realisasi' e_realisasi from jsonb_array_elements(budget_report(:'B', current_date) -> 'baris') x where x->>'id' = :'cat';
select budget_copy(:'B', current_date, (current_date + interval '1 month')::date) e_disalin, budget_copy(:'B', current_date, (current_date + interval '1 month')::date) e_salin_ulang_tidak_dobel;
select budget_save(:'B', (current_date + interval '1 month')::date, :'cat', 0);
select count(*) = 0 e_nol_menghapus from budgets where kos_id = :'B' and month = date_trunc('month', current_date + interval '1 month')::date;
do $$ declare m text; begin
  begin perform budget_save('91919191-0000-0000-0000-00000000000c', current_date, (select id from expense_categories where kos_id = '91919191-0000-0000-0000-00000000000a' limit 1), 1000); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Kategori biaya tidak ditemukan%' then raise exception 'E_GAGAL: kategori bisnis lain: %', m; end if; raise notice 'e_OK: kategori bisnis lain ditolak';
end $$;
select set_config('request.jwt.claim.sub', '91919191-0000-0000-0000-000000000002', false) \g /dev/null
do $$ declare m text; begin
  begin perform budget_save('91919191-0000-0000-0000-00000000000c', current_date, (select id from expense_categories where kos_id = '91919191-0000-0000-0000-00000000000c' limit 1), 1000); exception when others then m := sqlerrm; end;
  if m is null then raise exception 'E_GAGAL: kasir bisa mengubah anggaran'; end if; raise notice 'e_OK: kasir ditolak (%)', m;
end $$;
select set_config('request.jwt.claim.sub', '91919191-0000-0000-0000-000000000001', false) \g /dev/null

\echo == F. Penawaran fitur: hanya bila fitur belum dimiliki
select growth_offer(:'N','fitur','BUDGET.CREATE_REQUESTED') ->> 'id' f_baru_anggaran, growth_offer(:'N','fitur','FINANCE.MANUAL_JOURNAL_REQUESTED') ->> 'to_plan' f_baru_jurnal_tujuan,
       growth_offer(:'L','fitur','FINANCE.MANUAL_JOURNAL_REQUESTED') is null f_lama_tidak_ditawari, growth_offer(:'B','fitur','BUDGET.CREATE_REQUESTED') is null f_bisnis_tidak_ditawari;
