-- Uji progres tur panduan (migrasi 20261128130000). Lulus = berakhir tanpa ERROR; semua di-ROLLBACK.
-- Pakai: psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/learning_tours.sql
begin;
insert into auth.users(id, email) values
 ('a2000000-0000-4000-8000-000000000001', 'tour-owner@example.test'),
 ('a2000000-0000-4000-8000-000000000002', 'tour-staff@example.test'),
 ('a2000000-0000-4000-8000-000000000003', 'tour-outsider@example.test');
insert into public.kos(id, name, owner_id, business_type, setup_status) values
 ('a2000000-0000-4000-8000-000000000011', 'Tes Tur', 'a2000000-0000-4000-8000-000000000001', 'retail', 'active'),
 ('a2000000-0000-4000-8000-000000000012', 'Bisnis Draf', 'a2000000-0000-4000-8000-000000000001', 'jasa', 'draft');
insert into public.kos_members(kos_id, user_id, role, active) values
 ('a2000000-0000-4000-8000-000000000011', 'a2000000-0000-4000-8000-000000000001', 'pemilik', true),
 ('a2000000-0000-4000-8000-000000000011', 'a2000000-0000-4000-8000-000000000002', 'kasir', true),
 ('a2000000-0000-4000-8000-000000000012', 'a2000000-0000-4000-8000-000000000001', 'pemilik', true)
on conflict (kos_id, user_id) do update set role = excluded.role, active = true;

-- Cuplikan data bisnis: mengulang tur TIDAK boleh mengubahnya.
create temp table snap as select
  (select count(*) from public.sales) sales, (select count(*) from public.stock_moves) moves,
  (select count(*) from public.payments) pays, (select count(*) from public.domain_events) events;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
do $$
declare
  k uuid := 'a2000000-0000-4000-8000-000000000011';
  r public.learning_tours;
  n integer;
begin
  -- 1. Simpan, jeda, lalu perangkat lain dengan catatan LEBIH LAMA tidak menimpa
  r := public.learning_tour_save(k, 'page:/kasir', 'paused', 2::smallint, 6::smallint, 1, now() - interval '1 minute');
  r := public.learning_tour_save(k, 'page:/kasir', 'completed', 5::smallint, 6::smallint, 1, now() - interval '1 hour');
  if r.status <> 'paused' or r.step <> 2 then raise exception 'GAGAL: catatan lama menimpa yang baru: %', r; end if;
  -- 2. Catatan lebih baru menang; completed_at terisi; runs = maksimum
  r := public.learning_tour_save(k, 'page:/kasir', 'completed', 5::smallint, 6::smallint, 3, now());
  if r.status <> 'completed' or r.completed_at is null or r.runs <> 3 then raise exception 'GAGAL: selesai tidak tercatat: %', r; end if;
  -- 3. Ulangi setelah selesai: status berjalan, completed_at pertama dipertahankan
  r := public.learning_tour_save(k, 'page:/kasir', 'active', 0::smallint, 6::smallint, 4, now());
  if r.status <> 'active' or r.completed_at is null or r.runs <> 4 then raise exception 'GAGAL: ulangi menghapus riwayat selesai: %', r; end if;
  r := public.learning_tour_save(k, 'onboarding', 'skipped', 1::smallint, 7::smallint, 1, now());
  select count(*) into n from public.learning_tour_list(k);
  if n <> 2 then raise exception 'GAGAL: daftar tur %', n; end if;
  -- 4. Validasi: kunci, status, langkah, waktu masa depan
  begin perform public.learning_tour_save(k, 'page:/Kasir;drop', 'paused', 0::smallint, 1::smallint, 1, now()); raise exception 'GAGAL: kunci tidak sah diterima';
  exception when invalid_parameter_value then null; end;
  begin perform public.learning_tour_save(k, 'page:/kasir', 'selesai', 0::smallint, 1::smallint, 1, now()); raise exception 'GAGAL: status tidak sah diterima';
  exception when invalid_parameter_value then null; end;
  begin perform public.learning_tour_save(k, 'page:/kasir', 'paused', 61::smallint, 1::smallint, 1, now()); raise exception 'GAGAL: langkah > 60 diterima';
  exception when invalid_parameter_value then null; end;
  begin perform public.learning_tour_save(k, 'page:/kasir', 'paused', 0::smallint, 1::smallint, 1, now() + interval '1 day'); raise exception 'GAGAL: waktu masa depan diterima';
  exception when invalid_parameter_value then null; end;
  -- 5. Bisnis DRAF: onboarding boleh disimpan (dipakai saat setup)
  r := public.learning_tour_save('a2000000-0000-4000-8000-000000000012', 'onboarding', 'paused', 1::smallint, 7::smallint, 1, now());
  if r.status <> 'paused' then raise exception 'GAGAL: bisnis draf menolak progres onboarding'; end if;
  -- 6. Tabel tidak bisa dibaca/ditulis langsung
  begin perform 1 from public.learning_tours; raise exception 'GAGAL: tabel terbaca langsung';
  exception when insufficient_privilege then null; end;
  begin update public.learning_tours set status = 'completed'; raise exception 'GAGAL: tabel bisa diubah langsung';
  exception when insufficient_privilege then null; end;
end $$;

-- Karyawan: progres terpisah per akun & peran; tidak melihat milik pemilik; tidak bisa menulis ke bisnis lain
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
do $$
declare k uuid := 'a2000000-0000-4000-8000-000000000011'; n integer; r public.learning_tours;
begin
  select count(*) into n from public.learning_tour_list(k);
  if n <> 0 then raise exception 'GAGAL: kasir melihat progres pemilik (%)', n; end if;
  r := public.learning_tour_save(k, 'page:/kasir', 'paused', 1::smallint, 5::smallint, 1, now());
  if r.role <> 'kasir' then raise exception 'GAGAL: peran tidak tercatat dari server: %', r.role; end if;
  begin perform public.learning_tour_save('a2000000-0000-4000-8000-000000000012', 'onboarding', 'paused', 0::smallint, 1::smallint, 1, now());
    raise exception 'GAGAL: tulis ke bisnis lain diterima';
  exception when insufficient_privilege then null; end;
  -- Reset hanya milik sendiri
  n := public.learning_tour_reset(k, null);
  if n <> 1 then raise exception 'GAGAL: reset kasir menghapus % baris', n; end if;
end $$;

-- Orang luar: semua ditolak
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin perform public.learning_tour_list('a2000000-0000-4000-8000-000000000011'); raise exception 'GAGAL: orang luar membaca';
  exception when insufficient_privilege then null; end;
  begin perform public.learning_tour_reset('a2000000-0000-4000-8000-000000000011', null); raise exception 'GAGAL: orang luar reset';
  exception when insufficient_privilege then null; end;
end $$;

-- Pemilik: reset kasir tidak menyentuh milik pemilik; reset satu tur; bisnis ditutup = simpan ditolak
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
do $$
declare k uuid := 'a2000000-0000-4000-8000-000000000011'; n integer;
begin
  select count(*) into n from public.learning_tour_list(k);
  if n <> 2 then raise exception 'GAGAL: reset kasir menghapus progres pemilik (%)', n; end if;
  n := public.learning_tour_reset(k, 'onboarding');
  if n <> 1 or (select count(*) from public.learning_tour_list(k)) <> 1 then raise exception 'GAGAL: reset satu tur'; end if;
end $$;
reset role;
do $$ begin
  if (select (sales, moves, pays, events) <> ((select count(*) from public.sales), (select count(*) from public.stock_moves),
      (select count(*) from public.payments), (select count(*) from public.domain_events)) from snap) then
    raise exception 'GAGAL: data bisnis berubah karena progres tur';
  end if;
end $$;
update public.kos set closed_at = now() where id = 'a2000000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
do $$
begin
  perform public.learning_tour_list('a2000000-0000-4000-8000-000000000011');
  begin perform public.learning_tour_save('a2000000-0000-4000-8000-000000000011', 'page:/kasir', 'paused', 0::smallint, 1::smallint, 1, now());
    raise exception 'GAGAL: bisnis ditutup menerima simpan';
  exception when insufficient_privilege then null; end;
  raise notice 'OK learning_tours: semua pernyataan lulus';
end $$;
rollback;
