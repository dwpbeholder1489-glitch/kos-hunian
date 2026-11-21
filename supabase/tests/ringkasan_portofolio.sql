-- Uji Fase 5 Ringkasan multi-bisnis (migrasi 20261121130000). Database baru:
-- /var/tmp/pgtest/runtest.sh <db> supabase/tests/ringkasan_portofolio.sql
-- Lulus = semua kolom ok bernilai t. Baris dengan f = gagal.
\set ON_ERROR_STOP off
insert into auth.users(id,email) values
  ('b2b2b2b2-0000-0000-0000-000000000001','pemilik@x.com'), ('b2b2b2b2-0000-0000-0000-000000000002','kasir@x.com'),
  ('b2b2b2b2-0000-0000-0000-000000000004','lain@x.com') on conflict do nothing;
insert into kos(id,name,owner_id,plan,paid_until,setup_status,business_type,category_code,subcategory_code,template_code) values
  ('b2b2b2b2-0000-0000-0000-00000000000a','Laundry Bersih','b2b2b2b2-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','jasa','laundry','laundry_laundry','laundry'),
  ('b2b2b2b2-0000-0000-0000-00000000000b','Toko Uji','b2b2b2b2-0000-0000-0000-000000000001','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','retail','retail',null,'toko'),
  ('b2b2b2b2-0000-0000-0000-00000000000c','Laundry Dasar','b2b2b2b2-0000-0000-0000-000000000001','dasar',(now() at time zone 'Asia/Jakarta')::date + 30,'active','jasa','laundry','laundry_laundry','laundry'),
  ('b2b2b2b2-0000-0000-0000-00000000000d','Kos Milik Lain','b2b2b2b2-0000-0000-0000-000000000004','pro',(now() at time zone 'Asia/Jakarta')::date + 30,'active','properti','properti',null,'kos');
insert into kos_members(kos_id,user_id,role) values
  ('b2b2b2b2-0000-0000-0000-00000000000a','b2b2b2b2-0000-0000-0000-000000000001','pemilik'),
  ('b2b2b2b2-0000-0000-0000-00000000000b','b2b2b2b2-0000-0000-0000-000000000001','pemilik'),
  ('b2b2b2b2-0000-0000-0000-00000000000c','b2b2b2b2-0000-0000-0000-000000000001','pemilik'),
  ('b2b2b2b2-0000-0000-0000-00000000000d','b2b2b2b2-0000-0000-0000-000000000004','pemilik'),
  ('b2b2b2b2-0000-0000-0000-00000000000a','b2b2b2b2-0000-0000-0000-000000000002','kasir');

\set PM 'b2b2b2b2-0000-0000-0000-000000000001'
\set KS 'b2b2b2b2-0000-0000-0000-000000000002'
\set A  'b2b2b2b2-0000-0000-0000-00000000000a'
\set B  'b2b2b2b2-0000-0000-0000-00000000000b'
\set C  'b2b2b2b2-0000-0000-0000-00000000000c'
\set D  'b2b2b2b2-0000-0000-0000-00000000000d'

set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false);

\echo == A. Bawaan: belum pernah memilih, tidak ada gabungan
select 'A1 bawaan kosong' as k, (portfolio_get() ->> 'include') = '[]' as ok;

\echo == B. Pemilik memilih bisnis miliknya
select 'B1 simpan dua bisnis' as k, (portfolio_set(array[:'A'::uuid, :'B'::uuid]) -> 'include') @> jsonb_build_array(:'A'::text) as ok;
select 'B2 jumlah tersimpan = 2' as k, jsonb_array_length(portfolio_get() -> 'include') = 2 as ok;
select 'B3 duplikat diabaikan' as k, jsonb_array_length(portfolio_set(array[:'A'::uuid, :'A'::uuid, :'B'::uuid]) -> 'include') = 2 as ok;

\echo == C. Bisnis milik orang lain (tanpa keanggotaan) ditolak
do $$ begin
  begin
    perform portfolio_set(array['b2b2b2b2-0000-0000-0000-00000000000d'::uuid]);
    raise notice 'C1_GAGAL: bisnis orang lain diterima';
  exception when others then raise notice 'C1_OK (ditolak: %)', sqlerrm; end;
end $$;
select 'C2 pilihan tidak berubah setelah ditolak' as k, jsonb_array_length(portfolio_get() -> 'include') = 2 as ok;

\echo == D. Karyawan tanpa akses keuangan tidak bisa menggabungkan
select set_config('request.jwt.claim.sub', :'KS', false);
do $$ begin
  begin
    perform portfolio_set(array['b2b2b2b2-0000-0000-0000-00000000000a'::uuid]);
    raise notice 'D1_GAGAL: kasir bisa memilih gabungan';
  exception when others then raise notice 'D1_OK (ditolak: %)', sqlerrm; end;
end $$;
select 'D2 kasir: pilihan kosong' as k, (portfolio_get() ->> 'include') = '[]' as ok;
select set_config('request.jwt.claim.sub', :'PM', false);

\echo == E. Akses dicabut: pilihan lama tidak ikut dibaca
reset role;
delete from kos_members where kos_id = :'B' and user_id = :'PM';
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false);
select 'E1 bisnis tanpa akses tidak muncul' as k, not ((portfolio_get() -> 'include') @> jsonb_build_array(:'B'::text)) as ok;
select 'E2 bisnis lain tetap ada' as k, (portfolio_get() -> 'include') @> jsonb_build_array(:'A'::text) as ok;

\echo == F. Bisnis ditangguhkan tidak ikut
reset role;
update kos set suspended_at = now() where id = :'A';
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false);
select 'F1 bisnis ditangguhkan tidak muncul' as k, not ((portfolio_get() -> 'include') @> jsonb_build_array(:'A'::text)) as ok;
reset role;
update kos set suspended_at = null where id = :'A';
set role authenticated;
select set_config('request.jwt.claim.sub', :'PM', false);

\echo == G. Kosongkan pilihan & isolasi
select 'G1 kosongkan pilihan' as k, jsonb_array_length(portfolio_set(array[]::uuid[]) -> 'include') = 0 as ok;
do $$ begin
  begin
    perform 1 from portfolio_settings;
    raise notice 'G2_GAGAL: klien bisa membaca tabel langsung';
  exception when insufficient_privilege then raise notice 'G2_OK (tabel tertutup)'; end;
end $$;
select set_config('request.jwt.claim.sub', :'KS', false);
select 'G4 kasir tidak melihat pilihan pemilik' as k, (portfolio_get() ->> 'include') = '[]' as ok;
reset role;
