-- Uji anggaran, biaya & laba proyek (Tahap 1C). Jalankan di database baru berisi semua migrasi:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/proyek_biaya.sql"
-- Lulus = semua kolom bernilai t (periksa dengan keluaran -A), notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email,raw_user_meta_data) values
  ('b1b1b1b1-0000-0000-0000-000000000001','eo2@x.com','{"name":"Pemilik EO"}'), ('b1b1b1b1-0000-0000-0000-000000000002','opr2@x.com','{}') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,category_code) values
  ('b1b1b1b1-0000-0000-0000-00000000000a','EO Biaya','b1b1b1b1-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','kustom','event');
insert into kos_members(kos_id,user_id,role) values
  ('b1b1b1b1-0000-0000-0000-00000000000a','b1b1b1b1-0000-0000-0000-000000000001','pemilik'),
  ('b1b1b1b1-0000-0000-0000-00000000000a','b1b1b1b1-0000-0000-0000-000000000002','operator');
\set K 'b1b1b1b1-0000-0000-0000-00000000000a'
\set OWN 'b1b1b1b1-0000-0000-0000-000000000001'
\set OPR 'b1b1b1b1-0000-0000-0000-000000000002'
insert into expense_categories(id, kos_id, name, kind) values ('b1b1b1b1-0000-0000-0000-0000000000c1', :'K', 'Sewa peralatan', 'operasional');
set role authenticated;
select set_config('request.jwt.claim.sub', :'OWN', false), set_config('request.jwt.claims', '{"sub":"b1b1b1b1-0000-0000-0000-000000000001","email":"eo2@x.com"}', false) \g /dev/null
select prj_save(:'K', null, '{"name":"Konser Amal","kind":"event","value":100000000}') as p1 \gset
select prj_save(:'K', null, '{"name":"Seminar Kampus","kind":"event","value":20000000}') as p2 \gset
select set_config('t.p1', :'p1', false), set_config('t.p2', :'p2', false) \g /dev/null

\echo == A. Anggaran per kategori & persetujuan
select (prj_budget_save(:'p1', '[{"category":"Sound","amount":20000000},{"category":"Venue","amount":30000000},{"category":"Talent","amount":25000000}]'::jsonb)->>'budget')::numeric = 75000000 a_total_anggaran;
select prj_budget_approve(:'p1');
select prj_budget_save(:'p1', '[{"category":"Sound","amount":22000000},{"category":"Venue","amount":30000000},{"category":"Talent","amount":25000000}]'::jsonb) is not null a_ubah_setelah_setuju;
select (x->>'budget')::numeric = 77000000 and (x->>'approved')::numeric = 75000000 a_disetujui_tetap,
       (select (c->>'variance')::numeric from jsonb_array_elements(x->'categories') c where c->>'category' = 'Sound') = -2000000 a_selisih_sound
from (select prj_costs(:'p1') x) z;

\echo == B. Catat biaya proyek = pengeluaran biasa (masuk Kas/Pembukuan) + ditandai
select prj_cost_add(:'p1', jsonb_build_object('amount', 8000000, 'category', 'Sound', 'category_id', 'b1b1b1b1-0000-0000-0000-0000000000c1', 'account', 'bank', 'description', 'DP sound system')) as e1 \gset
reset role;
select amount = 8000000 and account = 'bank' and category_id = 'b1b1b1b1-0000-0000-0000-0000000000c1' and description like 'DP sound system · PRJ-%' b_pengeluaran_biasa from expenses where id = :'e1';
select exists (select 1 from domain_events where event_type = 'ExpenseRecorded' and aggregate_id = :'e1') b_peristiwa_pengeluaran;
-- pengeluaran lama 3.000.000 dari menu Kas (belum ditandai) → dibagi dua proyek
insert into expenses(id, kos_id, date, kind, amount, description, account) values ('b1b1b1b1-0000-0000-0000-0000000000e2', :'K', current_date - 2, 'operasional', 3000000, 'Transport kru', 'kas');
set role authenticated;
select exists (select 1 from jsonb_array_elements(prj_costs(:'p1')->'candidates') c where c->>'id' = 'b1b1b1b1-0000-0000-0000-0000000000e2' and (c->>'free')::numeric = 3000000) b_kandidat;
select prj_cost_link(:'p1', 'expense', 'b1b1b1b1-0000-0000-0000-0000000000e2', 2000000, 'Transport', null) is not null b_bagi_1;
select prj_cost_link(:'p2', 'expense', 'b1b1b1b1-0000-0000-0000-0000000000e2', null, 'Transport', 'sisa untuk seminar') is not null b_bagi_sisa;
reset role;
select sum(amount) = 3000000 b_total_terbagi_pas from prj_cost_links where expense_id = 'b1b1b1b1-0000-0000-0000-0000000000e2';
set role authenticated;
do $$ declare m text; begin
  begin perform prj_cost_link(current_setting('t.p1')::uuid, 'expense', 'b1b1b1b1-0000-0000-0000-0000000000e2', 1, 'Transport', null); exception when others then m := sqlerrm; end;
  if m like '%Tidak ada sisa%' or m like '%melebihi%' then raise notice 'B_TIDAK_DOBEL_OK'; else raise warning 'GAGAL B dobel: %', m; end if;
  m := null;
  begin perform prj_cost_add(current_setting('t.p1')::uuid, jsonb_build_object('amount', 100, 'category', 'Sound', 'date', (now() at time zone 'Asia/Jakarta')::date + 1)); exception when others then m := sqlerrm; end;
  if m like '%masa depan%' then raise notice 'B_TANGGAL_DEPAN_OK'; else raise warning 'GAGAL B tanggal: %', m; end if;
end $$;

\echo == C. Belanja dipesan = komitmen; setelah diterima = realisasi. Komitmen vendor manual.
reset role;
insert into purchases(id, kos_id, number, purchase_date, total, order_total, pay_method, status) values
  ('b1b1b1b1-0000-0000-0000-0000000000a1', :'K', 'BL-UJI-1', current_date, 0, 5000000, 'utang', 'dipesan');
set role authenticated;
select prj_cost_link(:'p1', 'purchase', 'b1b1b1b1-0000-0000-0000-0000000000a1', null, 'Venue', null) is not null c_tandai_belanja;
select prj_commit_save(:'p1', null, '{"vendor_name":"Bintang Talent Agency","category":"Talent","description":"Fee band utama","amount":15000000}'::jsonb) as k1 \gset
select (x->>'actual')::numeric = 10000000 and (x->>'committed')::numeric = 20000000 c_realisasi_komitmen,
       (select (c->>'remaining')::numeric from jsonb_array_elements(x->'categories') c where c->>'category' = 'Talent') = 10000000 c_sisa_talent
from (select prj_costs(:'p1') x) z;
reset role;
update purchases set status = 'selesai', total = 5000000 where id = 'b1b1b1b1-0000-0000-0000-0000000000a1';
select contact_id is not null and (select kind from contacts where id = c.contact_id) = 'supplier' c_vendor_baru from prj_commitments c where id = :'k1';
set role authenticated;
select prj_commit_close(:'k1', 'selesai');
select prj_cost_add(:'p1', jsonb_build_object('amount', 15000000, 'category', 'Talent', 'description', 'Pelunasan fee band')) is not null c_bayar_vendor;
select (x->>'actual')::numeric = 30000000 and (x->>'committed')::numeric = 0 c_semua_realisasi,
       (x->>'forecast')::numeric = 79000000 c_perkiraan_akhir,   -- 22+30+25 anggaran + Transport 2 jt (di luar anggaran tetap dihitung)
       (x->>'profit_now')::numeric = 70000000 and (x->>'profit_forecast')::numeric = 21000000 and (x->>'margin_forecast')::numeric = 21.0 c_laba
from (select prj_costs(:'p1') x) z;

\echo == D. Biaya melebihi anggaran: perkiraan akhir ikut naik, ditandai over
select prj_cost_add(:'p1', jsonb_build_object('amount', 16000000, 'category', 'Sound', 'description', 'Tambahan line array')) is not null d_tambah;
select (c->>'over')::boolean and (c->>'forecast')::numeric = 24000000 d_sound_lewat
from jsonb_array_elements(prj_costs(:'p1')->'categories') c where c->>'category' = 'Sound';
select (x->>'forecast')::numeric = 81000000 d_perkiraan_naik from (select prj_costs(:'p1') x) z;

\echo == E. Sumber diubah setelah ditandai → peringatan selisih; lepas tanda tidak menghapus pengeluaran
reset role;
update expenses set amount = 1000000 where id = 'b1b1b1b1-0000-0000-0000-0000000000e2';
set role authenticated;
select (prj_costs(:'p1')->>'mismatch')::int = 1 e_peringatan_selisih;
select id as l2 from jsonb_to_recordset(prj_costs(:'p2')->'links') as x(id uuid) limit 1 \gset
select prj_cost_unlink(:'l2');
reset role;
select exists (select 1 from expenses where id = 'b1b1b1b1-0000-0000-0000-0000000000e2') e_pengeluaran_tetap;
set role authenticated;

\echo == F. Laporan laba semua proyek; operator tidak bisa melihat uang
select jsonb_array_length(prj_profit_report(:'K')->'rows') = 2 f_laporan,
       (select (r->>'actual')::numeric from jsonb_array_elements(prj_profit_report(:'K')->'rows') r where r->>'name' = 'Seminar Kampus') = 0 f_seminar_setelah_lepas;
select prj_get(:'p1')->'cost'->>'actual' is not null and not (prj_get(:'p1')->'cost' ? 'categories') f_ringkas_di_detail;
select set_config('request.jwt.claim.sub', :'OPR', false) \g /dev/null
select prj_get(:'p1')->'cost' = 'null'::jsonb f_operator_tanpa_biaya;
do $$ declare m text; begin
  begin perform prj_costs(current_setting('t.p1')::uuid); exception when others then m := sqlerrm; end;
  if m like '%hanya untuk pemilik atau bagian keuangan%' then raise notice 'F_OPERATOR_COSTS_OK'; else raise warning 'GAGAL F costs: %', m; end if;
  m := null;
  begin perform prj_profit_report('b1b1b1b1-0000-0000-0000-00000000000a'); exception when others then m := sqlerrm; end;
  if m like '%hanya untuk pemilik atau bagian keuangan%' then raise notice 'F_OPERATOR_LAPORAN_OK'; else raise warning 'GAGAL F laporan: %', m; end if;
end $$;

\echo == G. Paket turun: baca boleh, ubah anggaran ditolak; proyek batal tidak bisa diberi biaya
select set_config('request.jwt.claim.sub', :'OWN', false) \g /dev/null
reset role;
update kos set plan = 'dasar' where id = :'K';
set role authenticated;
select (prj_costs(:'p1')->>'actual')::numeric > 0 g_tetap_terbaca;
do $$ declare m text; begin
  begin perform prj_budget_save(current_setting('t.p1')::uuid, '[]'::jsonb); exception when others then m := sqlerrm; end;
  if m like 'BATAS_PAKET:%' then raise notice 'G_PAKET_OK'; else raise warning 'GAGAL G paket: %', m; end if;
end $$;
reset role;
update kos set plan = 'bisnis' where id = :'K';
set role authenticated;
select (prj_status(:'p2', 'batal', 'Acara dibatalkan kampus')->>'ok')::boolean g_batal;
do $$ declare m text; begin
  begin perform prj_cost_add(current_setting('t.p2')::uuid, '{"amount":1000,"category":"Lain"}'::jsonb); exception when others then m := sqlerrm; end;
  if m like '%sudah batal%' then raise notice 'G_BATAL_TANPA_BIAYA_OK'; else raise warning 'GAGAL G batal: %', m; end if;
end $$;
