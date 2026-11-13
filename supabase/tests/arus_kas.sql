-- Uji laporan arus kas. Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/arus_kas.sql"
-- Skenario (bulan ini), saldo awal bank 400.000 dicatat bulan lalu:
--   modal 1.000.000 → kas (pendanaan +), jual 300.000 tunai + HPP 180.000 (operasi +300.000),
--   setor kas→bank 500.000 (internal, tidak dihitung), beli peralatan 200.000 dari bank (investasi −),
--   bayar listrik 50.000 tunai (operasi −), prive 100.000 tunai (pendanaan −).
-- Harapan: awal 400.000; masuk 1.300.000; keluar 350.000; akhir 1.350.000;
--          operasi +250.000, investasi −200.000, pendanaan +900.000.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('c3c3c3c3-0000-0000-0000-000000000001','kas-owner@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status,business_type) values
  ('c3c3c3c3-0000-0000-0000-00000000000b','Toko Arus Kas','c3c3c3c3-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail'),
  ('c3c3c3c3-0000-0000-0000-00000000000d','Toko Arus Kas Dasar','c3c3c3c3-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail')
on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values
  ('c3c3c3c3-0000-0000-0000-00000000000b','c3c3c3c3-0000-0000-0000-000000000001','pemilik'),
  ('c3c3c3c3-0000-0000-0000-00000000000d','c3c3c3c3-0000-0000-0000-000000000001','pemilik')
on conflict do nothing;
do $$
declare k uuid; e uuid; n int := 0;
  acc jsonb;
  j record;
begin
  foreach k in array array['c3c3c3c3-0000-0000-0000-00000000000b','c3c3c3c3-0000-0000-0000-00000000000d']::uuid[] loop
    perform acct_ensure(k);
    select jsonb_object_agg(sys_key, id) into acc from acct_accounts where kos_id = k and sys_key is not null;
    for j in select * from (values
      ('AK-0', (date_trunc('month', current_date) - interval '10 day')::date, 'Saldo awal bank', 'bank', 'saldo_awal', 400000, null, null, 0),
      ('AK-1', current_date, 'Setoran modal', 'kas', 'modal', 1000000, null, null, 0),
      ('AK-2', current_date, 'Penjualan tunai', 'kas', 'penjualan', 300000, 'hpp', 'persediaan', 180000),
      ('AK-3', current_date, 'Setor ke bank', 'bank', 'kas', 500000, null, null, 0),
      ('AK-4', current_date, 'Beli peralatan', 'aset_tetap', 'bank', 200000, null, null, 0),
      ('AK-5', current_date, 'Bayar listrik', 'beban_operasional', 'kas', 50000, null, null, 0),
      ('AK-6', current_date, 'Prive', 'prive', 'kas', 100000, null, null, 0)) v(num, d, descr, deb, kre, amt, deb2, kre2, amt2)
    loop
      insert into acct_entries(kos_id, number, entry_date, description, kind) values (k, j.num, j.d, j.descr, 'manual') returning id into e;
      insert into acct_lines(entry_id, kos_id, account_id, debit, credit) values
        (e, k, (acc->>j.deb)::uuid, j.amt, 0), (e, k, (acc->>j.kre)::uuid, 0, j.amt);
      if j.deb2 is not null then
        insert into acct_lines(entry_id, kos_id, account_id, debit, credit) values
          (e, k, (acc->>j.deb2)::uuid, j.amt2, 0), (e, k, (acc->>j.kre2)::uuid, 0, j.amt2);
      end if;
    end loop;
  end loop;
end $$;
select set_config('request.jwt.claim.sub', 'c3c3c3c3-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"c3c3c3c3-0000-0000-0000-000000000001"}', false) \g /dev/null
\set B 'c3c3c3c3-0000-0000-0000-00000000000b'
\set D 'c3c3c3c3-0000-0000-0000-00000000000d'
select date_trunc('month', current_date)::date as m0, (date_trunc('month', current_date) + interval '1 month - 1 day')::date as m1 \gset

\echo == A. Ringkasan (Bisnis): awal 400.000, masuk 1.300.000, keluar 350.000, akhir 1.350.000, cocok
select x->>'saldo_awal' a_awal, x->>'masuk' a_masuk, x->>'keluar' a_keluar, x->>'saldo_akhir' a_akhir, x->>'cocok' a_cocok
from (select acct_cashflow(:'B', :'m0', :'m1') x) q;

\echo == B. Per kelompok: operasi 250.000, investasi -200.000, pendanaan 900.000; penjualan tidak terserap persediaan
select g->>'kelompok' b_kelompok, g->>'masuk' b_masuk, g->>'keluar' b_keluar, g->>'bersih' b_bersih
from jsonb_array_elements(acct_cashflow(:'B', :'m0', :'m1') -> 'kelompok') g;
select (select count(*) from jsonb_array_elements(acct_cashflow(:'B', :'m0', :'m1') -> 'kelompok') g, jsonb_array_elements(g->'akun') a
        where a->>'akun' ilike 'Persediaan%') = 0 b_persediaan_tidak_menyerap_penjualan;

\echo == C. Dasar baru: hanya ringkasan (kelompok tidak dikirim), angka total sama
select x->>'lengkap' c_lengkap, x->'kelompok' = 'null'::jsonb c_tanpa_rincian, x->>'saldo_akhir' c_akhir from (select acct_cashflow(:'D', :'m0', :'m1') x) q;

\echo == D. Periode tidak valid ditolak
do $$ declare m text; begin
  begin perform acct_cashflow('c3c3c3c3-0000-0000-0000-00000000000b', current_date, current_date - 1); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Periode tidak valid%' then raise exception 'D_GAGAL: %', m; end if; raise notice 'd_OK: periode terbalik ditolak';
end $$;
