-- Uji laporan lanjutan (Paket Bisnis; bisnis lama tetap lengkap). Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/laporan_lanjutan.sql"
\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('b2b2b2b2-0000-0000-0000-000000000001','lap-owner@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status,business_type) values
  ('b2b2b2b2-0000-0000-0000-00000000000d','Toko Dasar Baru','b2b2b2b2-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail'),
  ('b2b2b2b2-0000-0000-0000-00000000000b','Toko Bisnis','b2b2b2b2-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail')
on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values
  ('b2b2b2b2-0000-0000-0000-00000000000d','b2b2b2b2-0000-0000-0000-000000000001','pemilik'),
  ('b2b2b2b2-0000-0000-0000-00000000000b','b2b2b2b2-0000-0000-0000-000000000001','pemilik')
on conflict do nothing;
\set D 'b2b2b2b2-0000-0000-0000-00000000000d'
\set B 'b2b2b2b2-0000-0000-0000-00000000000b'
-- Jurnal yang sama di kedua bisnis: modal 1.000.000 ke kas, penjualan 300.000 tunai
do $$ declare k uuid; e1 uuid; e2 uuid; begin
  foreach k in array array['b2b2b2b2-0000-0000-0000-00000000000d','b2b2b2b2-0000-0000-0000-00000000000b']::uuid[] loop
    perform acct_ensure(k);
    insert into acct_entries(kos_id, number, entry_date, description, kind) values (k, 'LAP-1', current_date, 'Setoran modal', 'manual') returning id into e1;
    insert into acct_entries(kos_id, number, entry_date, description, kind) values (k, 'LAP-2', current_date, 'Penjualan tunai', 'manual') returning id into e2;
    insert into acct_lines(entry_id, kos_id, account_id, debit, credit) values
      (e1, k, (select id from acct_accounts where kos_id = k and sys_key = 'kas'), 1000000, 0),
      (e1, k, (select id from acct_accounts where kos_id = k and type = 'ekuitas' order by code limit 1), 0, 1000000),
      (e2, k, (select id from acct_accounts where kos_id = k and sys_key = 'kas'), 300000, 0),
      (e2, k, (select id from acct_accounts where kos_id = k and type = 'pendapatan' order by code limit 1), 0, 300000);
  end loop;
end $$;
select set_config('request.jwt.claim.sub', 'b2b2b2b2-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"b2b2b2b2-0000-0000-0000-000000000001","email":"lap-owner@x.com"}', false) \g /dev/null
select date_trunc('month', current_date)::date as m0, (date_trunc('month', current_date) + interval '1 month - 1 day')::date as m1 \gset

\echo == A. Dasar baru: ringkas; neraca hanya total; laba rugi tetap per akun; tidak ada per lokasi
select (acct_report(:'D', false, :'m0', :'m1') ->> 'ringkas')::boolean a_ringkas,
       (select count(*) from jsonb_array_elements(acct_report(:'D', false, :'m0', :'m1') -> 'accounts') x where x->>'type' = 'aset') a_baris_aset,
       (select (x->>'balance')::numeric from jsonb_array_elements(acct_report(:'D', false, :'m0', :'m1') -> 'accounts') x where x->>'type' = 'aset') a_total_aset,
       (select count(*) > 0 from jsonb_array_elements(acct_report(:'D', false, :'m0', :'m1') -> 'accounts') x where x->>'type' = 'pendapatan' and (x->>'period')::numeric <> 0) a_laba_rugi_rinci,
       acct_report(:'D', false, :'m0', :'m1') -> 'per_lokasi' = 'null'::jsonb a_tanpa_per_lokasi;

insert into legal_entities(id, owner_id, name) values ('b2b2b2b2-0000-0000-0000-0000000000ee', 'b2b2b2b2-0000-0000-0000-000000000001', 'CV Uji') on conflict do nothing;
update kos set legal_entity_id = 'b2b2b2b2-0000-0000-0000-0000000000ee' where id in (:'D', :'B');
\echo == B. Dasar baru: rincian buku besar & laporan gabungan ditolak
do $$ declare m text; begin
  begin perform acct_ledger('b2b2b2b2-0000-0000-0000-00000000000d', false, '1-1100', date_trunc('month', current_date)::date, current_date); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'B_GAGAL: ledger: %', m; end if; raise notice 'b_OK: buku besar rinci ditolak';
  m := null;
  begin perform acct_report('b2b2b2b2-0000-0000-0000-00000000000d', true, date_trunc('month', current_date)::date, current_date); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'B_GAGAL: gabungan: %', m; end if; raise notice 'b_OK: laporan gabungan ditolak';
end $$;

\echo == C. Paket Bisnis: lengkap; total aset sama dengan versi ringkas
select (acct_report(:'B', true, :'m0', :'m1') ->> 'ringkas')::boolean = false c_gabungan_bisnis_boleh;
select (acct_report(:'B', false, :'m0', :'m1') ->> 'ringkas')::boolean c_ringkas,
       (select count(*) > 1 from jsonb_array_elements(acct_report(:'B', false, :'m0', :'m1') -> 'accounts') x where x->>'type' = 'aset') c_aset_per_akun,
       (select sum((x->>'balance')::numeric) from jsonb_array_elements(acct_report(:'B', false, :'m0', :'m1') -> 'accounts') x where x->>'type' = 'aset') c_total_aset,
       jsonb_array_length(acct_ledger(:'B', false, (select code from acct_accounts where kos_id = :'B' and sys_key = 'kas'), :'m0', :'m1') -> 'lines') c_mutasi_kas;

\echo == D. Bisnis lama (legacy) di Dasar tetap lengkap
update kos set legacy_features = legacy_features || '{laporan_lanjutan}' where id = :'D';
select (acct_report(:'D', false, :'m0', :'m1') ->> 'ringkas')::boolean = false d_lama_lengkap,
       jsonb_array_length(acct_ledger(:'D', false, (select code from acct_accounts where kos_id = :'D' and sys_key = 'kas'), :'m0', :'m1') -> 'lines') d_mutasi_kas;
update kos set legacy_features = array_remove(legacy_features, 'laporan_lanjutan') where id = :'D';

\echo == E. Penawaran hanya untuk yang belum punya
select growth_offer(:'D', 'fitur', 'REPORT.ADVANCED_REQUESTED') ->> 'id' e_dasar, growth_offer(:'B', 'fitur', 'REPORT.ADVANCED_REQUESTED') is null e_bisnis_tidak;
