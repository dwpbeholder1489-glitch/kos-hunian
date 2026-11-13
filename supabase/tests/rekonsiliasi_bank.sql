-- Uji rekonsiliasi bank (Paket Bisnis). Jalankan di database baru:
-- su postgres -c "psql -p 5499 -h /var/tmp/pgtest -d <db> -f supabase/tests/rekonsiliasi_bank.sql"
\set ON_ERROR_STOP off
insert into auth.users(id,email) values
  ('a1a1a1a1-0000-0000-0000-000000000001','rekon-owner@x.com'),
  ('a1a1a1a1-0000-0000-0000-000000000002','rekon-kasir@x.com')
on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,trial_until,setup_status,business_type) values
  ('a1a1a1a1-0000-0000-0000-00000000000b','Toko Rekon Bisnis','a1a1a1a1-0000-0000-0000-000000000001','bisnis',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail'),
  ('a1a1a1a1-0000-0000-0000-00000000000d','Toko Rekon Dasar','a1a1a1a1-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 20,null,'active','retail')
on conflict do nothing;
insert into kos_members(kos_id,user_id,role) values
  ('a1a1a1a1-0000-0000-0000-00000000000b','a1a1a1a1-0000-0000-0000-000000000001','pemilik'),
  ('a1a1a1a1-0000-0000-0000-00000000000d','a1a1a1a1-0000-0000-0000-000000000001','pemilik'),
  ('a1a1a1a1-0000-0000-0000-00000000000b','a1a1a1a1-0000-0000-0000-000000000002','kasir')
on conflict do nothing;
\set B 'a1a1a1a1-0000-0000-0000-00000000000b'
\set D 'a1a1a1a1-0000-0000-0000-00000000000d'
-- Jurnal Bank buatan di bulan lalu: masuk 1.000.000 & 250.000, keluar 300.000 (saldo buku 950.000)
select acct_ensure(:'B') \g /dev/null
select date_trunc('month', current_date - interval '1 month')::date as m1 \gset
select (date_trunc('month', current_date - interval '1 month') + interval '5 day')::date as t1 \gset
with acc as (select (select id from acct_accounts where kos_id = :'B' and sys_key = 'bank') b,
                    (select id from acct_accounts where kos_id = :'B' and type = 'ekuitas' order by code limit 1) q),
e as (insert into acct_entries(kos_id, number, entry_date, description, kind) values
        (:'B','UJI-1', :'t1', 'Setoran modal ke bank', 'manual'), (:'B','UJI-2', :'t1', 'Transfer dari pelanggan', 'manual'), (:'B','UJI-3', :'t1', 'Bayar supplier via transfer', 'manual')
      returning id, number)
insert into acct_lines(entry_id, kos_id, account_id, debit, credit, memo)
select e.id, :'B', x.acc, x.d, x.c, x.memo from e, acc,
  lateral (values
    (case e.number when 'UJI-1' then acc.b when 'UJI-2' then acc.b else acc.q end, case e.number when 'UJI-1' then 1000000 when 'UJI-2' then 250000 else 300000 end, 0, e.number),
    (case e.number when 'UJI-3' then acc.b else acc.q end, 0, case e.number when 'UJI-1' then 1000000 when 'UJI-2' then 250000 else 300000 end, e.number)) x(acc, d, c, memo);

select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', false), set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","email":"rekon-owner@x.com"}', false) \g /dev/null

\echo == A. Ringkasan awal: 3 baris Bank, saldo buku 950.000, belum ada yang cocok
select (bank_recon_get(:'B', :'m1') ->> 'saldo_buku')::numeric a_buku, jsonb_array_length(bank_recon_get(:'B', :'m1') -> 'baris') a_baris,
       (bank_recon_get(:'B', :'m1') ->> 'saldo_cocok')::numeric a_cocok;

\echo == B. Saldo koran 1.250.000 (dua uang masuk sudah di bank, bayar supplier belum); tandai 2 baris masuk -> selisih 0 -> selesai
select bank_recon_save(:'B', :'m1', 1250000, 'Rekening koran BRI') is not null b_simpan;
do $$ declare m text; begin
  begin perform bank_recon_finish('a1a1a1a1-0000-0000-0000-00000000000b', date_trunc('month', current_date - interval '1 month')::date); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Masih ada selisih%' then raise exception 'B_GAGAL: selesai dengan selisih: %', m; end if; raise notice 'b_OK: selesai ditolak saat selisih (%)', m;
end $$;
select bank_recon_mark(:'B', :'m1', (select array_agg(l.id) from acct_lines l join acct_entries e on e.id = l.entry_id
  where l.kos_id = :'B' and e.number in ('UJI-1','UJI-2') and l.account_id = (select id from acct_accounts where kos_id = :'B' and sys_key = 'bank')), true) b_ditandai;
select (bank_recon_get(:'B', :'m1') ->> 'selisih')::numeric b_selisih, (bank_recon_get(:'B', :'m1') ->> 'belum_muncul')::numeric b_belum_muncul;
select bank_recon_finish(:'B', :'m1');
select bank_recon_get(:'B', :'m1') #>> '{rekon,status}' b_status;
do $$ declare m text; begin
  begin perform bank_recon_save('a1a1a1a1-0000-0000-0000-00000000000b', date_trunc('month', current_date - interval '1 month')::date, 5, null); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like '%sudah selesai%' then raise exception 'B_GAGAL: ubah setelah selesai: %', m; end if; raise notice 'b_OK: terkunci setelah selesai';
end $$;

\echo == C. Bulan berikutnya: baris yang sudah cocok tidak muncul lagi; hanya pembayaran supplier
select jsonb_array_length(bank_recon_get(:'B', current_date) -> 'baris') c_baris_tersisa, bank_recon_get(:'B', current_date) -> 'baris' -> 0 ->> 'uraian' c_uraian;

\echo == D. Buka kembali: wajib alasan; kasir tidak bisa; Paket Dasar ditolak & ditawari upgrade
do $$ declare m text; begin
  begin perform bank_recon_reopen('a1a1a1a1-0000-0000-0000-00000000000b', date_trunc('month', current_date - interval '1 month')::date, 'x'); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'Tulis alasan%' then raise exception 'D_GAGAL: %', m; end if; raise notice 'd_OK: alasan wajib';
end $$;
select bank_recon_reopen(:'B', :'m1', 'Salah input saldo koran');
select bank_recon_get(:'B', :'m1') #>> '{rekon,status}' d_status_setelah_buka;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000002', false) \g /dev/null
do $$ declare m text; begin
  begin perform bank_recon_get('a1a1a1a1-0000-0000-0000-00000000000b', current_date); exception when others then m := sqlerrm; end;
  if m is null then raise exception 'D_GAGAL: kasir bisa melihat rekonsiliasi'; end if; raise notice 'd_OK: kasir ditolak (%)', m;
end $$;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', false) \g /dev/null
select (bank_recon_get(:'D', current_date) ->> 'aktif')::boolean = false d_dasar_tidak_aktif;
do $$ declare m text; begin
  begin perform bank_recon_save('a1a1a1a1-0000-0000-0000-00000000000d', current_date, 1, null); exception when others then m := sqlerrm; end;
  if coalesce(m, '') not like 'BATAS_PAKET%' then raise exception 'D_GAGAL: %', m; end if; raise notice 'd_OK: Dasar ditolak';
end $$;
select growth_offer(:'D', 'fitur', 'FINANCE.RECONCILIATION_REQUESTED') ->> 'id' d_penawaran, growth_offer(:'B', 'fitur', 'FINANCE.RECONCILIATION_REQUESTED') is null d_bisnis_tidak_ditawari;

\echo == E. Baris bisnis lain tidak bisa ditandai
select bank_recon_mark(:'B', current_date, array[-1, 999999999]::bigint[], true) e_baris_asing_diabaikan;
