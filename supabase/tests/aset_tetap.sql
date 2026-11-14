-- Uji aset tetap & penyusutan. Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/aset_tetap.sql"
-- Lulus = semua kolom bernilai t, notice *_OK, tanpa GAGAL.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('a5a5a5a5-0000-0000-0000-000000000001','aset@x.com'), ('a5a5a5a5-0000-0000-0000-000000000002','kasir-aset@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type) values
  ('a5a5a5a5-0000-0000-0000-00000000000a','Toko Aset','a5a5a5a5-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,'active','retail');
insert into kos_members(kos_id,user_id,role) values ('a5a5a5a5-0000-0000-0000-00000000000a','a5a5a5a5-0000-0000-0000-000000000001','pemilik'),
  ('a5a5a5a5-0000-0000-0000-00000000000a','a5a5a5a5-0000-0000-0000-000000000002','kasir');
\set K 'a5a5a5a5-0000-0000-0000-00000000000a'
select (date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) - interval '3 months')::date as m3 \gset
set role authenticated;
select set_config('request.jwt.claim.sub', 'a5a5a5a5-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a5a5a5a5-0000-0000-0000-000000000001","email":"aset@x.com"}', false) \g /dev/null
select module_on(:'K', 'u_aset') a0_modul;

\echo == A. Beli aset 3 bulan lalu: kulkas 12.000.000, sisa 0, umur 24 bulan → 500.000/bulan, 3 bulan sudah lewat
select asset_save(:'K', null, jsonb_build_object('name', 'Kulkas showcase', 'category', 'Peralatan', 'mode', 'beli', 'date', :'m3', 'cost', 12000000, 'account', 'bank', 'life_months', 24)) as kulkas \gset
select kind = 'modal' and amount = 12000000 and account = 'bank' a_pengeluaran_modal from expenses where id = (select expense_id from fixed_assets where id = :'kulkas');
select (x->>'accumulated')::numeric = 1500000 and (x->>'book_value')::numeric = 10500000 and (x->>'monthly')::numeric = 500000 and (x->>'months_left')::int = 21 a_susut_3_bulan
from jsonb_array_elements(asset_list(:'K')->'assets') x where x->>'id' = :'kulkas';
select jsonb_array_length(asset_schedule(:'kulkas')) = 3 a_jadwal_3_baris;

\echo == B. Pembulatan: 1.000.000 / 3 bulan → total penyusutan tepat 1.000.000
select asset_save(:'K', null, jsonb_build_object('name', 'Timbangan', 'mode', 'awal', 'date', :'m3', 'cost', 1000000, 'life_months', 3)) as timb \gset
select (x->>'accumulated')::numeric = 1000000 and (x->>'book_value')::numeric = 0 and (x->>'monthly')::numeric = 0 b_habis_tepat
from jsonb_array_elements(asset_list(:'K')->'assets') x where x->>'id' = :'timb';

\echo == C. Tanah (tidak disusutkan) & tautkan pengeluaran modal yang sudah ada
select asset_save(:'K', null, jsonb_build_object('name', 'Tanah kios', 'mode', 'awal', 'date', :'m3', 'cost', 50000000)) as tanah \gset
select (x->>'accumulated')::numeric = 0 and x->>'months_left' is null c_tanah_tidak_susut from jsonb_array_elements(asset_list(:'K')->'assets') x where x->>'id' = :'tanah';
reset role;
insert into expenses(id, kos_id, date, kind, amount, description, account) values ('a5a5a5a5-0000-0000-0000-0000000000e1', :'K', :'m3', 'modal', 3000000, 'Etalase kaca', 'kas');
set role authenticated;
select jsonb_array_length(asset_list(:'K')->'candidates') = 1 c_kandidat;
select asset_save(:'K', null, jsonb_build_object('name', 'Etalase kaca', 'mode', 'tautkan', 'expense_id', 'a5a5a5a5-0000-0000-0000-0000000000e1', 'salvage', 600000, 'life_months', 12)) as etalase \gset
select cost = 3000000 and start_date = :'m3' and not own_expense c_ikut_pengeluaran from fixed_assets where id = :'etalase';
select (x->>'accumulated')::numeric = 600000 c_susut_dari_nilai_dikurangi_sisa from jsonb_array_elements(asset_list(:'K')->'assets') x where x->>'id' = :'etalase';
select jsonb_array_length(asset_list(:'K')->'candidates') = 0 c_kandidat_habis;
do $$ declare m text; begin
  begin delete from expenses where id = 'a5a5a5a5-0000-0000-0000-0000000000e1'; exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like '%Aset tetap%' then raise exception 'C_GAGAL hapus pengeluaran: %', m; end if; raise notice 'c_OK: pengeluaran pembelian aset tidak bisa dihapus dari Pengeluaran';
end $$;

\echo == D. Jurnal: seimbang; Aset tetap, akumulasi, beban penyusutan cocok dengan daftar aset
reset role;
select acct_sync_internal(:'K') \g /dev/null
select (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 d_seimbang;
select (select sum(l.debit - l.credit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'aset_tetap') = 66000000 d_aset_66jt,
       (select sum(l.credit - l.debit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'akum_penyusutan') = 3100000 d_akumulasi,
       (select sum(l.debit - l.credit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'beban_penyusutan') = 3100000 d_beban,
       (select sum(l.credit - l.debit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'saldo_awal') = 51000000 d_saldo_awal;
select acct_sync_internal(:'K') = 0 d_sinkron_ulang_tanpa_dobel;
set role authenticated;
select (asset_list(:'K')->>'total_book')::numeric = 62900000 d_total_nilai_buku;

\echo == E. Ubah umur manfaat kulkas 24 → 12 bulan: jurnal dikoreksi otomatis
select asset_save(:'K', :'kulkas', jsonb_build_object('name', 'Kulkas showcase', 'life_months', 12)) \g /dev/null
reset role;
select acct_sync_internal(:'K') > 0 e_ada_koreksi;
select (select sum(l.credit - l.debit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'akum_penyusutan') = 4600000 e_akumulasi_baru,
       (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 e_seimbang;
set role authenticated;

\echo == F. Jual kulkas hari ini 8.000.000 (nilai buku 9.000.000 → rugi 1.000.000)
select (asset_dispose(:'kulkas', jsonb_build_object('kind', 'dijual', 'amount', 8000000, 'account', 'kas')) ->> 'gain')::numeric = -1000000 f_rugi_1jt;
reset role;
select acct_sync_internal(:'K') \g /dev/null
select (select sum(l.debit - l.credit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and l.source_type = 'asset_disposal' and a.sys_key = 'kas') = 8000000 f_kas_masuk,
       (select sum(l.debit - l.credit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and l.source_type = 'asset_disposal' and a.sys_key = 'beban_lain') = 1000000 f_rugi_di_jurnal,
       (select sum(l.debit - l.credit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'aset_tetap') = 54000000 f_aset_keluar,
       (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 f_seimbang;
set role authenticated;
select (asset_list(:'K')->>'total_cost')::numeric = 54000000 f_total_tanpa_yang_dilepas;
-- buang etalase (tanpa uang) lalu batalkan
select asset_dispose(:'etalase', jsonb_build_object('kind', 'dibuang', 'note', 'pecah')) \g /dev/null
select asset_dispose_undo(:'etalase', 'salah pilih aset') \g /dev/null
select status = 'aktif' and disposed_date is null f_batal_lepas from fixed_assets where id = :'etalase';

\echo == G. Validasi & izin
do $$ declare m text; k uuid := 'a5a5a5a5-0000-0000-0000-00000000000a'; begin
  begin perform asset_save(k, null, jsonb_build_object('name', 'Besok', 'mode', 'beli', 'date', current_date + 5, 'cost', 1000, 'account', 'kas')); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tanggal beli belum tiba%' then raise exception 'G_GAGAL tanggal: %', m; end if; m := null;
  begin perform asset_save(k, null, jsonb_build_object('name', 'Sisa', 'mode', 'awal', 'cost', 1000, 'salvage', 1000, 'life_months', 12)); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Nilai sisa harus lebih kecil%' then raise exception 'G_GAGAL sisa: %', m; end if; m := null;
  begin perform asset_dispose((select id from fixed_assets where name = 'Tanah kios'), jsonb_build_object('kind', 'dijual', 'amount', 0, 'account', 'kas')); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Isi uang hasil penjualan%' then raise exception 'G_GAGAL jual 0: %', m; end if;
  raise notice 'g_OK: tanggal depan, nilai sisa, jual tanpa uang ditolak';
end $$;
select set_config('request.jwt.claim.sub', 'a5a5a5a5-0000-0000-0000-000000000002', false), set_config('request.jwt.claims', '{"sub":"a5a5a5a5-0000-0000-0000-000000000002","email":"kasir-aset@x.com"}', false) \g /dev/null
select count(*) = 0 g_kasir_tidak_melihat from fixed_assets;
do $$ declare m text; begin
  begin perform asset_list('a5a5a5a5-0000-0000-0000-00000000000a'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Hanya pemilik%' then raise exception 'G_GAGAL kasir: %', m; end if; raise notice 'g_OK: kasir tidak bisa membuka daftar aset';
end $$;
select set_config('request.jwt.claim.sub', 'a5a5a5a5-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a5a5a5a5-0000-0000-0000-000000000001","email":"aset@x.com"}', false) \g /dev/null

\echo == H. Hapus aset salah catat: aset "beli" dari menu Aset ikut menghapus pengeluarannya; yang ditautkan tetap
select asset_save(:'K', null, jsonb_build_object('name', 'Salah catat', 'mode', 'beli', 'cost', 700000, 'account', 'kas', 'life_months', 12)) as salah \gset
select expense_id as salah_exp from fixed_assets where id = :'salah' \gset
select asset_delete(:'salah', 'salah input') \g /dev/null
select asset_delete(:'etalase', 'bukan aset') \g /dev/null
reset role;
select not exists (select 1 from expenses where id = :'salah_exp') h_pengeluaran_ikut_hapus, exists (select 1 from expenses where id = 'a5a5a5a5-0000-0000-0000-0000000000e1') h_pengeluaran_tautan_tetap;
select acct_sync_internal(:'K') \g /dev/null
select (select sum(debit) - sum(credit) from acct_lines where kos_id = :'K') = 0 h_seimbang,
       (select sum(l.credit - l.debit) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = :'K' and a.sys_key = 'akum_penyusutan') = 1000000 h_akumulasi_tinggal_timbangan;
