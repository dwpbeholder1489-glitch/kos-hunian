-- Uji tagihan termin, pembayaran & jurnal proyek (Tahap 1D, keputusan K3). Jalankan di database baru berisi semua migrasi:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -A -f supabase/tests/proyek_tagihan.sql"
-- Lulus = semua kolom bernilai t (periksa keluaran -A), notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email,raw_user_meta_data) values
  ('d1d1d1d1-0000-0000-0000-000000000001','eo3@x.com','{"name":"Pemilik EO"}'), ('d1d1d1d1-0000-0000-0000-000000000002','opr3@x.com','{}') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,category_code) values
  ('d1d1d1d1-0000-0000-0000-00000000000a','EO Tagihan','d1d1d1d1-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','kustom','event');
insert into kos_members(kos_id,user_id,role) values
  ('d1d1d1d1-0000-0000-0000-00000000000a','d1d1d1d1-0000-0000-0000-000000000001','pemilik'),
  ('d1d1d1d1-0000-0000-0000-00000000000a','d1d1d1d1-0000-0000-0000-000000000002','operator');
\set K 'd1d1d1d1-0000-0000-0000-00000000000a'
\set OWN 'd1d1d1d1-0000-0000-0000-000000000001'
\set OPR 'd1d1d1d1-0000-0000-0000-000000000002'
select ((now() at time zone 'Asia/Jakarta')::date) as hari, ((now() at time zone 'Asia/Jakarta')::date - 10) as h10 \gset
-- saldo akun (debit − kredit) setelah jurnal disinkronkan
create or replace function pg_temp.saldo(p_kos uuid, p_key text) returns numeric language sql as $$
  select coalesce(sum(l.debit - l.credit), 0) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = p_kos and a.sys_key = p_key $$;
create or replace function pg_temp.seimbang(p_kos uuid) returns boolean language sql as $$
  select not exists (select 1 from acct_lines where kos_id = p_kos group by entry_id having sum(debit) <> sum(credit)) $$;
set role authenticated;
select set_config('request.jwt.claim.sub', :'OWN', false), set_config('request.jwt.claims', '{"sub":"d1d1d1d1-0000-0000-0000-000000000001","email":"eo3@x.com"}', false) \g /dev/null
select prj_save(:'K', null, '{"name":"Wedding Rina & Bayu","kind":"event","value":100000000,"client_name":"Rina"}') as p1 \gset
select prj_milestone_save(:'p1', null, '{"name":"DP","amount":30000000}') as m1 \gset
select prj_milestone_save(:'p1', null, '{"name":"Pelunasan","amount":70000000}') as m2 \gset
select set_config('t.p1', :'p1', false), set_config('t.m1', :'m1', false) \g /dev/null

\echo == A. Tagihan DP dari milestone (nominal = termin), dibayar lewat bank → UANG MUKA, belum pendapatan
select prj_invoice_create(:'p1', jsonb_build_object('milestone_id', :'m1', 'due_date', :'hari')) as i1 \gset
select set_config('t.i1', :'i1', false) \g /dev/null
select (x->>'amount')::numeric = 30000000 and x->>'description' = 'DP' and x->>'number' like 'TGP-____-001' and x->>'state' = 'belum' a_tagihan_dp
from (select prj_invoice_get(:'i1') x) z;
select prj_payment_add(:'p1', jsonb_build_object('invoice_id', :'i1', 'amount', 30000000, 'account', 'bank', 'pay_date', :'h10')) is not null a_bayar;
reset role;
select acct_sync_internal(:'K') >= 0 \g /dev/null
select pg_temp.saldo(:'K', 'bank') = 30000000 and pg_temp.saldo(:'K', 'uang_muka') = -30000000 and pg_temp.saldo(:'K', 'pendapatan_jasa') = 0 a_jurnal_uang_muka,
       (select entry_date from acct_entries where kos_id = :'K' and source_type = 'prj_payment' order by created_at limit 1) = :'h10'::date a_tanggal_bayar;
set role authenticated;
select prj_invoice_get(:'i1')->>'state' = 'lunas' a_lunas, (prj_billing(:'p1')->>'advance')::numeric = 30000000 a_ringkasan_uang_muka;

\echo == B. Milestone DP diserahkan → uang muka menjadi pendapatan
select prj_milestone_done(:'m1', true);
reset role;
select acct_sync_internal(:'K') >= 0 \g /dev/null
select pg_temp.saldo(:'K', 'uang_muka') = 0 and pg_temp.saldo(:'K', 'pendapatan_jasa') = -30000000 and pg_temp.saldo(:'K', 'piutang_jasa') = 0 b_diakui;
set role authenticated;

\echo == C. Pelunasan diserahkan sebelum dibayar → pendapatan + PIUTANG; dibayar sebagian → piutang berkurang
select prj_milestone_done(:'m2', true);
select prj_invoice_create(:'p1', jsonb_build_object('milestone_id', :'m2')) as i2 \gset
select set_config('t.i2', :'i2', false) \g /dev/null
select prj_payment_add(:'p1', jsonb_build_object('invoice_id', :'i2', 'amount', 50000000, 'account', 'kas')) as y2 \gset
reset role;
select acct_sync_internal(:'K') >= 0 \g /dev/null
select pg_temp.saldo(:'K', 'pendapatan_jasa') = -100000000 and pg_temp.saldo(:'K', 'piutang_jasa') = 20000000 and pg_temp.saldo(:'K', 'kas') = 50000000 c_piutang_sisa;
set role authenticated;
select x->>'state' = 'sebagian' and (x->>'paid')::numeric = 50000000 c_sebagian from (select prj_invoice_get(:'i2') x) z;
select (x->>'receivable')::numeric = 20000000 and (x->>'recognized')::numeric = 100000000 and (x->>'received')::numeric = 80000000 and (x->>'invoices_open')::numeric = 20000000 and (x->>'unlinked')::numeric = 0 c_ringkasan
from (select prj_billing(:'p1') x) z;
do $$ declare m text; begin
  begin perform prj_payment_add(current_setting('t.p1')::uuid, jsonb_build_object('invoice_id', current_setting('t.i2'), 'amount', 30000000, 'account', 'kas')); exception when others then m := sqlerrm; end;
  if m like '%melebihi sisa tagihan%' then raise notice 'C_LEBIH_TAGIHAN_OK'; else raise warning 'GAGAL C lebih: %', m; end if;
  m := null;
  begin perform prj_invoice_void(current_setting('t.i2')::uuid, 'salah'); exception when others then m := sqlerrm; end;
  if m like '%sudah ada pembayarannya%' then raise notice 'C_VOID_BERBAYAR_OK'; else raise warning 'GAGAL C void: %', m; end if;
  m := null;
  begin perform prj_invoice_create(current_setting('t.p1')::uuid, jsonb_build_object('milestone_id', current_setting('t.m1'))); exception when others then m := sqlerrm; end;
  if m like '%sudah ditagih seluruhnya%' then raise notice 'C_DP_TIDAK_DOBEL_OK'; else raise warning 'GAGAL C dobel: %', m; end if;
end $$;

\echo == D. Bayar lebih tanpa tagihan → piutang lunas + sisanya uang muka; uang muka dikembalikan
select prj_payment_add(:'p1', '{"amount":30000000,"account":"bank"}'::jsonb) is not null d_lebih;
reset role;
select acct_sync_internal(:'K') >= 0 \g /dev/null
select pg_temp.saldo(:'K', 'piutang_jasa') = 0 and pg_temp.saldo(:'K', 'uang_muka') = -10000000 d_kelebihan_jadi_uang_muka;
set role authenticated;
-- tagihan 100 jt − diterima 110 jt → belum dibayar 0 (tidak negatif); pembayaran tanpa tagihan 30 jt tercatat
select (x->>'invoices_open')::numeric = 0 and (x->>'unlinked')::numeric = 30000000 and (x->>'overdue')::numeric = 0 d_belum_dibayar_proyek from (select prj_billing(:'p1') x) z;
reset role;
set role authenticated;
do $$ declare m text; begin
  begin perform prj_payment_add(current_setting('t.p1')::uuid, '{"kind":"kembali","amount":15000000,"account":"bank"}'::jsonb); exception when others then m := sqlerrm; end;
  if m like '%Maksimal%' then raise notice 'D_KEMBALI_MAKS_OK'; else raise warning 'GAGAL D maks: %', m; end if;
end $$;
select prj_payment_add(:'p1', '{"kind":"kembali","amount":10000000,"account":"bank"}'::jsonb) is not null d_kembalikan;
reset role;
select acct_sync_internal(:'K') >= 0 \g /dev/null
select pg_temp.saldo(:'K', 'uang_muka') = 0 and pg_temp.saldo(:'K', 'bank') = 50000000 d_uang_muka_nol;
set role authenticated;

\echo == E. Batalkan pembayaran 50 jt → koreksi otomatis: piutang kembali muncul
select prj_payment_void(:'y2', 'Transfer ternyata gagal');
reset role;
select acct_sync_internal(:'K') >= 0 \g /dev/null
-- tanpa 50 jt: diterima 30 (DP) + 30 (lebih) − 10 (kembali) = 50 jt; diakui 100 jt → piutang 50 jt
select pg_temp.saldo(:'K', 'piutang_jasa') = 50000000 and pg_temp.saldo(:'K', 'kas') = 0 and pg_temp.saldo(:'K', 'uang_muka') = 0 e_koreksi,
       exists (select 1 from acct_entries where kos_id = :'K' and kind = 'koreksi') e_ada_jurnal_koreksi;
set role authenticated;

\echo == F. Proyek tanpa milestone: DP 5 jt lalu SELESAI → seluruh nilai kontrak diakui (uang muka 5 + piutang 15)
select prj_save(:'K', null, '{"name":"Seminar Pajak","kind":"event","value":20000000}') as p2 \gset
select prj_payment_add(:'p2', '{"amount":5000000,"account":"kas"}'::jsonb) is not null f_dp;
select (prj_status(:'p2', 'selesai', null)->>'ok')::boolean f_selesai;
reset role;
select acct_sync_internal(:'K') >= 0 \g /dev/null
select (select sum(debit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and l.source_type = 'prj_recog_rest' and a.sys_key = 'uang_muka') = 5000000
   and (select sum(debit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and l.source_type = 'prj_recog_rest' and a.sys_key = 'piutang_jasa') = 15000000
   and (select sum(credit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and l.source_type = 'prj_recog_rest' and a.sys_key = 'pendapatan_jasa') = 20000000 f_sisa_diakui;
set role authenticated;

\echo == G. Acara batal dengan DP 4 jt: 3 jt hangus (pendapatan lain), 1 jt dikembalikan
select prj_save(:'K', null, '{"name":"Gathering Kantor","kind":"event","value":15000000}') as p3 \gset
select prj_payment_add(:'p3', '{"amount":4000000,"account":"bank"}'::jsonb) is not null g_dp;
select (prj_status(:'p3', 'batal', 'Klien membatalkan acara')->>'ok')::boolean g_batal;
select prj_payment_add(:'p3', '{"kind":"hangus","amount":3000000,"note":"Sesuai kontrak DP tidak kembali"}'::jsonb) is not null g_hangus;
select prj_payment_add(:'p3', '{"kind":"kembali","amount":1000000,"account":"bank"}'::jsonb) is not null g_kembali;
select (x->>'advance')::numeric = 0 and (x->>'forfeited')::numeric = 3000000 and (x->>'recognized')::numeric = 0 g_ringkasan from (select prj_billing(:'p3') x) z;
reset role;
select acct_sync_internal(:'K') >= 0 \g /dev/null
select (select sum(credit - debit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'pendapatan_lain') = 3000000 g_pendapatan_lain;

\echo == H. Semua jurnal seimbang; total pendapatan jasa = 100 + 20 jt; uang muka bersih 0
select pg_temp.seimbang(:'K') h_seimbang,
       pg_temp.saldo(:'K', 'pendapatan_jasa') = -120000000 h_pendapatan,
       pg_temp.saldo(:'K', 'uang_muka') = 0 h_uang_muka,
       pg_temp.saldo(:'K', 'piutang_jasa') = 65000000 h_piutang;   -- 50 jt (wedding) + 15 jt (seminar)
set role authenticated;

\echo == I. Laba proyek ikut menampilkan pendapatan diakui; operator tidak bisa; paket turun: tagihan baru ditolak, pembayaran tetap boleh
select (select (r->'bill'->>'recognized')::numeric from jsonb_array_elements(prj_profit_report(:'K')->'rows') r where r->>'name' = 'Wedding Rina & Bayu') = 100000000 i_laba_ada_pendapatan,
       (prj_get(:'p1')->'bill'->>'receivable')::numeric = 50000000 i_detail;
select set_config('request.jwt.claim.sub', :'OPR', false) \g /dev/null
select prj_get(:'p1')->'bill' = 'null'::jsonb i_operator_tanpa_tagihan;
do $$ declare m text; begin
  begin perform prj_billing(current_setting('t.p1')::uuid); exception when others then m := sqlerrm; end;
  if m like '%hanya untuk pemilik atau bagian keuangan%' then raise notice 'I_OPERATOR_OK'; else raise warning 'GAGAL I operator: %', m; end if;
end $$;
select set_config('request.jwt.claim.sub', :'OWN', false) \g /dev/null
reset role;
update kos set plan = 'dasar' where id = :'K';
set role authenticated;
do $$ declare m text; begin
  begin perform prj_invoice_create(current_setting('t.p1')::uuid, '{"amount":1000,"description":"Tambahan"}'::jsonb); exception when others then m := sqlerrm; end;
  if m like 'BATAS_PAKET:%' then raise notice 'I_PAKET_TAGIHAN_OK'; else raise warning 'GAGAL I paket: %', m; end if;
end $$;
select prj_payment_add(:'p1', jsonb_build_object('invoice_id', :'i2', 'amount', 20000000, 'account', 'kas')) is not null i_bayar_tetap_boleh;
do $$ declare m text; begin
  begin perform prj_payment_add(current_setting('t.p1')::uuid, jsonb_build_object('amount', 1000, 'account', 'kas', 'pay_date', (now() at time zone 'Asia/Jakarta')::date + 1)); exception when others then m := sqlerrm; end;
  if m like '%masa depan%' then raise notice 'I_TANGGAL_DEPAN_OK'; else raise warning 'GAGAL I tanggal: %', m; end if;
end $$;
