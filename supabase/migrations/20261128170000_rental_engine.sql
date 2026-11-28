-- Universal Rental Engine (Properti Tahap 2, permintaan pemilik 28 Nov 2026; docs/AUDIT_PROPERTI_ADAPTIF.md).
-- TIDAK membuat mesin sewa baru: memperluas leases/bookings/invoices yang sudah ada.
--   • leases.cycle: 'bulan' (bawaan = perilaku lama PERSIS sama), 'minggu', 'tahun' (tagihan berkala), 'jam', 'hari', 'khusus' (satu tagihan
--     untuk seluruh masa sewa = stay_total). Sewa harian: start_date = tanggal masuk, end_date = malam terakhir (check-out − 1).
--   • bookings.unit + check_out/start_at/end_at/total/quote: banyak booking per kamar boleh selama waktunya tidak bertumpuk
--     (rental_clash). Booking bulanan lama (tanpa check_out) = terbuka sejak check_in, aturan lama tetap.
--   • Tarif: rental_rates (per unit waktu, per kamar atau semua) + rental_rate_rules (musim, hari pekan, tanggal khusus, durasi).
--     Harga SELALU dari rental_quote (server) — browser hanya menampilkan.
--   • Akuntansi tidak berubah: tagihan → pembayaran → jurnal pendapatan_sewa; deposit & DP booking memakai mesin lama.

-- ---------- 1. Kolom ----------
alter table public.leases add column if not exists cycle text not null default 'bulan';
alter table public.leases add column if not exists qty numeric(10,2);
alter table public.leases add column if not exists stay_total numeric(14,2);
alter table public.leases add column if not exists start_at timestamptz;
alter table public.leases add column if not exists end_at timestamptz;
alter table public.leases add column if not exists quote jsonb;
alter table public.bookings add column if not exists unit text not null default 'bulan';
alter table public.bookings add column if not exists check_out date;
alter table public.bookings add column if not exists start_at timestamptz;
alter table public.bookings add column if not exists end_at timestamptz;
alter table public.bookings add column if not exists total numeric(14,2);
alter table public.bookings add column if not exists quote jsonb;
do $$ begin
  alter table public.leases add constraint leases_cycle_check check (cycle in ('jam', 'hari', 'minggu', 'bulan', 'tahun', 'khusus'));
  alter table public.leases add constraint leases_stay_total_check check (stay_total is null or stay_total > 0);
  alter table public.bookings add constraint bookings_unit_check check (unit in ('jam', 'hari', 'minggu', 'bulan', 'tahun', 'khusus'));
  alter table public.bookings add constraint bookings_range_check check ((check_out is null or check_out > check_in) and (end_at is null or end_at > start_at));
exception when duplicate_object then null; end $$;

-- Awal periode ke-k untuk tagihan berkala
create or replace function public.lease_period_start(p_start date, p_cycle text, k int)
returns date language sql immutable as $$
  select case p_cycle when 'minggu' then p_start + 7 * k when 'tahun' then (p_start + make_interval(years => k))::date
              else (p_start + make_interval(months => k))::date end;
$$;
-- Sewa setara per bulan (proyeksi & analisis); sewa sekali bayar = 0 (sudah ditagih penuh)
create or replace function public.lease_monthly_rent(p_cycle text, p_rent numeric)
returns numeric language sql immutable as $$
  select case p_cycle when 'bulan' then p_rent when 'minggu' then round(p_rent * 52 / 12, 2) when 'tahun' then round(p_rent / 12, 2) else 0 end;
$$;

-- Diisi oleh rental_start/booking_checkin lewat setelan transaksi prasara.rental (start_lease tidak berubah tanda tangannya)
create or replace function public.leases_rental_fill()
returns trigger language plpgsql as $$
declare s text := nullif(current_setting('prasara.rental', true), ''); j jsonb;
begin
  if s is null then return new; end if;
  j := s::jsonb;
  new.cycle := coalesce(j ->> 'cycle', new.cycle);
  new.qty := nullif(j ->> 'qty', '')::numeric;
  new.stay_total := nullif(j ->> 'stay_total', '')::numeric;
  new.start_at := nullif(j ->> 'start_at', '')::timestamptz;
  new.end_at := nullif(j ->> 'end_at', '')::timestamptz;
  new.quote := j -> 'quote';
  return new;
end $$;
drop trigger if exists leases_rental_fill on public.leases;
create trigger leases_rental_fill before insert on public.leases for each row execute function public.leases_rental_fill();
revoke execute on function public.leases_rental_fill() from public, anon, authenticated;

-- ---------- 2. Rentang waktu & bentrok ----------
create or replace function public.rental_day(p date)
returns timestamptz language sql immutable as $$ select (p::timestamp at time zone 'Asia/Jakarta'); $$;
-- Rentang sewa: [mulai, selesai) ; end_date = hari terakhir (inklusif). Tanpa end → terbuka.
create or replace function public.rental_lease_span(l leases)
returns tstzrange language sql stable as $$
  select tstzrange(coalesce(l.start_at, rental_day(l.start_date)), coalesce(l.end_at, rental_day(l.end_date + 1)), '[)');
$$;
-- Rentang booking: per jam = start_at..end_at; harian dst = check_in..check_out; bulanan lama = sejak check_in (+ months bila diisi)
create or replace function public.rental_booking_span(b bookings)
returns tstzrange language sql stable as $$
  select tstzrange(coalesce(b.start_at, rental_day(b.check_in)),
                   coalesce(b.end_at, rental_day(b.check_out), case when b.months is not null then rental_day((b.check_in + make_interval(months => b.months))::date) end), '[)');
$$;
create or replace function public.rental_clash(p_room uuid, p_span tstzrange, p_except_booking uuid, p_except_lease uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare r rooms; b bookings; l leases;
begin
  select * into r from rooms where id = p_room;
  if r.status = 'tidak_disewakan' then return 'Kamar ' || r.code || ' tidak disewakan'; end if;
  select * into b from bookings x where x.room_id = p_room and x.status = 'aktif' and x.id is distinct from p_except_booking
    and rental_booking_span(x) && p_span order by x.check_in limit 1;
  if b.id is not null then
    return 'Kamar ' || r.code || ' sudah dibooking ' || b.name || ' (' || b.number || ')' ||
      case when b.check_out is not null or b.end_at is not null then ' ' || to_char(lower(rental_booking_span(b)) at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') || ' – ' || to_char(upper(rental_booking_span(b)) at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') else '' end;
  end if;
  select * into l from leases x where x.room_id = p_room and x.status = 'aktif' and x.id is distinct from p_except_lease and rental_lease_span(x) && p_span limit 1;
  if l.id is not null then
    return 'Kamar ' || r.code || ' masih terisi' || case when l.end_date is null and l.end_at is null then ' tanpa rencana selesai. Isi rencana selesai sewa penghuninya dulu (Penghuni › ketuk nama › Rencana selesai › ubah).'
      else ' sampai ' || to_char(coalesce(l.end_at at time zone 'Asia/Jakarta', l.end_date::timestamp), case when l.end_at is not null then 'DD-MM-YYYY HH24:MI' else 'DD-MM-YYYY' end) || '. Pilih waktu sesudahnya.' end;
  end if;
  return null;
end $$;
revoke execute on function public.rental_clash(uuid, tstzrange, uuid, uuid), public.rental_lease_span(leases), public.rental_booking_span(bookings) from public, anon, authenticated;

-- Cek booking bulanan lama memakai rentang (booking lain yang sudah selesai sebelum tanggal masuk tidak lagi menghalangi)
create or replace function public.booking_room_check(p_room uuid, p_check_in date, p_except uuid)
returns text language sql stable security definer set search_path = public as $$
  select rental_clash(p_room, tstzrange(rental_day(p_check_in), null, '[)'), p_except, null);
$$;

-- start_lease: hanya booking yang bertumpuk dengan masa sewa ini yang menghalangi (dulu: booking aktif apa pun)
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.start_lease(uuid,uuid,date,numeric,date,date)',
  $o$if exists (select 1 from bookings where room_id = p_room and status = 'aktif' and id::text is distinct from nullif(current_setting('prasara.booking_ok', true), '')) then$o$,
  $n$if exists (select 1 from bookings bk where bk.room_id = p_room and bk.status = 'aktif' and bk.id::text is distinct from nullif(current_setting('prasara.booking_ok', true), '')
       and rental_booking_span(bk) && tstzrange(coalesce(nullif(current_setting('prasara.rental', true), '')::jsonb ->> 'start_at', rental_day(p_start)::text)::timestamptz,
                                                coalesce(nullif(current_setting('prasara.rental', true), '')::jsonb ->> 'end_at', case when p_end is not null then rental_day(p_end + 1)::text end)::timestamptz, '[)')) then$n$);
-- end_lease: sewa sekali bayar (jam/hari/khusus) yang diakhiri setelah masuk tidak membatalkan tagihan masa sewanya
select public._prasara_patch('public.end_lease(uuid,date,text)',
  $o$and i.period_start >= v_end
    and not exists$o$,
  $n$and i.period_start >= v_end and (l.cycle not in ('jam', 'hari', 'khusus') or v_before)
    and not exists$n$);
-- lease_set_end: periode mengikuti siklus; sewa sekali bayar memakai Perpanjang (rental_extend)
select public._prasara_patch('public.lease_set_end(uuid,date)',
  $o$if l.status <> 'aktif' then raise exception 'Sewa ini sudah berakhir'; end if;$o$,
  $n$if l.status <> 'aktif' then raise exception 'Sewa ini sudah berakhir'; end if;
  if l.cycle in ('jam', 'hari', 'khusus') then raise exception 'Sewa per % dibayar sekaligus. Untuk menambah waktu pakai Perpanjang; untuk keluar lebih cepat pakai Akhiri sewa.', l.cycle; end if;$n$);
select public._prasara_patch('public.lease_set_end(uuid,date)',
  $o$(select (l.billing_start + make_interval(months => g + 1))::date from generate_series(0, 239) g
                        where (l.billing_start + make_interval(months => g))::date = i2.period_start)$o$,
  $n$(select lease_period_start(l.billing_start, l.cycle, g + 1) from generate_series(0, 239) g
                        where lease_period_start(l.billing_start, l.cycle, g) = i2.period_start)$n$);
-- pindah kamar hanya untuk sewa berkala bulanan (mesin pindah kamar menghitung siklus bulanan)
select public._prasara_patch('public.lease_move_room(uuid,jsonb)',
  $o$if l.status <> 'aktif' then raise exception 'Sewa ini sudah berakhir'; end if;$o$,
  $n$if l.status <> 'aktif' then raise exception 'Sewa ini sudah berakhir'; end if;
  if l.cycle <> 'bulan' then raise exception 'Pindah kamar otomatis hanya untuk sewa bulanan. Untuk sewa per %: akhiri sewa ini lalu mulai sewa baru di kamar tujuan.', l.cycle; end if;$n$);
select public._prasara_patch('public.lease_move_room(uuid,jsonb)',
  $o$if exists (select 1 from bookings where room_id = r.id and status = 'aktif') then$o$,
  $n$if exists (select 1 from bookings bk where bk.room_id = r.id and bk.status = 'aktif' and rental_booking_span(bk) && tstzrange(rental_day(v_date), null, '[)')) then$n$);
drop function public._prasara_patch(text, text, text);

-- ---------- 3. Tagihan otomatis per siklus ----------
create or replace function public.generate_invoices(p_kos uuid, p_days_ahead integer default 7)
returns integer language plpgsql security definer set search_path = public as $$
declare l record; k int; v_start date; v_next date; v_end date; v_until date; v_count int := 0; v_rows int;
begin
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses ke kos ini'; end if;
  v_until := (now() at time zone 'Asia/Jakarta')::date + p_days_ahead;
  for l in select * from leases where kos_id = p_kos and status = 'aktif' loop
    if l.cycle in ('jam', 'hari', 'khusus') then
      continue when l.start_date > v_until;
      -- sewa sekali bayar: satu tagihan untuk seluruh masa sewa, terbit saat check-in
      insert into invoices(kos_id, lease_id, room_id, occupant_id, kind, period_start, period_end, due_date, amount, description)
      values (p_kos, l.id, l.room_id, l.occupant_id, 'sewa', l.start_date, coalesce(l.end_date, l.start_date), coalesce(l.first_due, l.start_date),
              coalesce(l.stay_total, l.rent),
              'Sewa ' || case l.cycle when 'jam' then 'per jam' when 'hari' then 'harian' else 'periode khusus' end || coalesce(' · ' || trim(to_char(l.qty, 'FM999990.##')) || case l.cycle when 'jam' then ' jam' when 'hari' then ' malam' else '' end, ''))
      on conflict (lease_id, period_start) where kind = 'sewa' do nothing;
      get diagnostics v_rows = row_count; v_count := v_count + v_rows;
      continue;
    end if;
    for k in 0..239 loop
      v_start := lease_period_start(l.billing_start, l.cycle, k);
      exit when v_start > v_until;
      exit when l.end_date is not null and v_start >= l.end_date;
      v_next := lease_period_start(l.billing_start, l.cycle, k + 1);
      v_end := case when l.end_date is not null and l.end_date < v_next then l.end_date else v_next - 1 end;
      insert into invoices(kos_id, lease_id, room_id, occupant_id, kind, period_start, period_end, due_date, amount, description)
      values (p_kos, l.id, l.room_id, l.occupant_id, 'sewa', v_start, v_end, case when k = 0 and l.first_due is not null then greatest(l.first_due, v_start) else v_start end, l.rent,
              case l.cycle when 'minggu' then 'Sewa mingguan' when 'tahun' then 'Sewa tahunan' else 'Sewa bulanan' end)
      on conflict (lease_id, period_start) where kind = 'sewa' do nothing;
      get diagnostics v_rows = row_count;
      v_count := v_count + v_rows;
    end loop;
  end loop;
  return v_count;
end $$;

-- ---------- 4. Tarif & aturan tarif dinamis ----------
create table if not exists public.rental_rates (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,      -- null = semua kamar/unit
  unit text not null check (unit in ('jam', 'hari', 'minggu', 'bulan', 'tahun')),
  price numeric(14,2) not null check (price > 0),
  min_qty int not null default 1 check (min_qty between 1 and 1000),
  active boolean not null default true,
  note text check (note is null or length(note) <= 200),
  updated_at timestamptz not null default now()
);
create unique index if not exists rental_rates_uniq on public.rental_rates(kos_id, coalesce(room_id, '00000000-0000-0000-0000-000000000000'::uuid), unit);
create table if not exists public.rental_rate_rules (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  kind text not null check (kind in ('musim', 'hari_pekan', 'tanggal', 'durasi')),
  start_date date, end_date date,
  days int[] not null default '{}',
  min_qty int,
  adj_kind text not null default 'persen' check (adj_kind in ('persen', 'nominal')),
  adj_value numeric(14,2) not null,
  units text[] not null default '{}',        -- kosong = semua unit waktu
  room_ids uuid[] not null default '{}',     -- kosong = semua kamar
  priority int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (adj_kind <> 'persen' or adj_value between -90 and 300),
  check (kind not in ('musim', 'tanggal') or (start_date is not null and end_date is not null and end_date >= start_date)),
  check (kind <> 'hari_pekan' or (cardinality(days) between 1 and 7 and days <@ array[1,2,3,4,5,6,7])),
  check (kind <> 'durasi' or min_qty between 2 and 1000)
);
alter table public.rental_rates enable row level security;
alter table public.rental_rate_rules enable row level security;
drop policy if exists rental_rates_read on public.rental_rates;
create policy rental_rates_read on public.rental_rates for select using (public.member_can(kos_id, 'rent') or public.member_can(kos_id, 'settings'));
drop policy if exists rental_rate_rules_read on public.rental_rate_rules;
create policy rental_rate_rules_read on public.rental_rate_rules for select using (public.member_can(kos_id, 'rent') or public.member_can(kos_id, 'settings'));
grant select on public.rental_rates, public.rental_rate_rules to authenticated;
drop trigger if exists zz_kos_open_guard on public.rental_rates;
create trigger zz_kos_open_guard before insert or update or delete on public.rental_rates for each row execute function public.kos_open_guard();
drop trigger if exists zz_kos_open_guard on public.rental_rate_rules;
create trigger zz_kos_open_guard before insert or update or delete on public.rental_rate_rules for each row execute function public.kos_open_guard();

create or replace function public.rental_rate_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_room uuid := nullif(p ->> 'room_id', '')::uuid;
begin
  if not member_in('settings,finance', p_kos) then raise exception 'Tarif hanya bisa diatur pemilik/pengelola'; end if;
  if (select business_type from kos where id = p_kos) <> 'properti' then raise exception 'Hanya untuk bisnis properti'; end if;
  if v_room is not null and not exists (select 1 from rooms where id = v_room and kos_id = p_kos) then raise exception 'Kamar tidak ditemukan'; end if;
  if not (nullif(p ->> 'price', '')::numeric > 0) then raise exception 'Isi harga lebih dari 0'; end if;
  if p_id is null then
    insert into rental_rates(kos_id, room_id, unit, price, min_qty, active, note)
    values (p_kos, v_room, p ->> 'unit', (p ->> 'price')::numeric, coalesce(nullif(p ->> 'min_qty', '')::int, 1), coalesce((p ->> 'active')::boolean, true), nullif(trim(p ->> 'note'), ''))
    on conflict (kos_id, coalesce(room_id, '00000000-0000-0000-0000-000000000000'::uuid), unit) do update
      set price = excluded.price, min_qty = excluded.min_qty, active = excluded.active, note = excluded.note, updated_at = now()
    returning id into v_id;
  else
    update rental_rates set room_id = v_room, unit = p ->> 'unit', price = (p ->> 'price')::numeric, min_qty = coalesce(nullif(p ->> 'min_qty', '')::int, 1),
      active = coalesce((p ->> 'active')::boolean, true), note = nullif(trim(p ->> 'note'), ''), updated_at = now()
    where id = p_id and kos_id = p_kos returning id into v_id;
    if v_id is null then raise exception 'Tarif tidak ditemukan'; end if;
  end if;
  perform config_log(p_kos, 'ubah_tarif_sewa', coalesce((select code from rooms where id = v_room), 'Semua kamar') || ' · per ' || (p ->> 'unit'), null, p, null, 'rendah', null);
  return v_id;
end $$;
create or replace function public.rental_rule_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_rooms uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p -> 'room_ids', '[]')) x), '{}');
begin
  if not member_in('settings,finance', p_kos) then raise exception 'Aturan tarif hanya bisa diatur pemilik/pengelola'; end if;
  if (select business_type from kos where id = p_kos) <> 'properti' then raise exception 'Hanya untuk bisnis properti'; end if;
  if exists (select 1 from unnest(v_rooms) r where not exists (select 1 from rooms where id = r and kos_id = p_kos)) then raise exception 'Kamar tidak ditemukan'; end if;
  if p_id is null then
    insert into rental_rate_rules(kos_id, name, kind, start_date, end_date, days, min_qty, adj_kind, adj_value, units, room_ids, priority, active)
    values (p_kos, trim(p ->> 'name'), p ->> 'kind', nullif(p ->> 'start_date', '')::date, nullif(p ->> 'end_date', '')::date,
      coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(p -> 'days', '[]')) x), '{}'), nullif(p ->> 'min_qty', '')::int,
      coalesce(p ->> 'adj_kind', 'persen'), (p ->> 'adj_value')::numeric,
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'units', '[]')) x), '{}'), v_rooms,
      coalesce(nullif(p ->> 'priority', '')::int, 0), coalesce((p ->> 'active')::boolean, true))
    returning id into v_id;
  else
    update rental_rate_rules set name = trim(p ->> 'name'), kind = p ->> 'kind', start_date = nullif(p ->> 'start_date', '')::date, end_date = nullif(p ->> 'end_date', '')::date,
      days = coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(p -> 'days', '[]')) x), '{}'), min_qty = nullif(p ->> 'min_qty', '')::int,
      adj_kind = coalesce(p ->> 'adj_kind', 'persen'), adj_value = (p ->> 'adj_value')::numeric,
      units = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'units', '[]')) x), '{}'), room_ids = v_rooms,
      priority = coalesce(nullif(p ->> 'priority', '')::int, 0), active = coalesce((p ->> 'active')::boolean, true), updated_at = now()
    where id = p_id and kos_id = p_kos returning id into v_id;
    if v_id is null then raise exception 'Aturan tidak ditemukan'; end if;
  end if;
  perform config_log(p_kos, 'ubah_aturan_tarif', trim(p ->> 'name'), null, p, null, 'rendah', null);
  return v_id;
end $$;
create or replace function public.rental_rate_delete(p_kos uuid, p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_in('settings,finance', p_kos) then raise exception 'Tarif hanya bisa diatur pemilik/pengelola'; end if;
  if p_kind = 'rule' then delete from rental_rate_rules where id = p_id and kos_id = p_kos;
  else delete from rental_rates where id = p_id and kos_id = p_kos; end if;
  perform config_log(p_kos, 'hapus_tarif_sewa', p_kind, null, null, null, 'rendah', null);
end $$;
revoke execute on function public.rental_rate_save(uuid, uuid, jsonb), public.rental_rule_save(uuid, uuid, jsonb), public.rental_rate_delete(uuid, text, uuid) from public, anon;
grant execute on function public.rental_rate_save(uuid, uuid, jsonb), public.rental_rule_save(uuid, uuid, jsonb), public.rental_rate_delete(uuid, text, uuid) to authenticated;

-- ---------- 5. Penghitung harga (SATU sumber) ----------
-- Tiap periode (jam/malam/minggu/bulan/tahun) diberi harga dasar lalu aturan tanggal (musim, hari pekan, tanggal khusus) diterapkan
-- berurutan menurut prioritas (persen dikalikan, nominal ditambah, min. 0); terakhir aturan durasi (qty ≥ min) atas subtotal.
-- 'khusus' = harga total diisi manual (p_price). Hasil dibulatkan ke rupiah.
create or replace function public.rental_quote_core(p_kos uuid, p_room uuid, p_unit text, p_start timestamptz, p_end timestamptz, p_price numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r rooms; v_rate rental_rates; v_base numeric; v_qty int; v_step interval; i int; v_at timestamptz; v_day date; v_p numeric; rr record;
        v_lines jsonb := '[]'; v_sub numeric := 0; v_adj jsonb := '[]'; v_total numeric; v_dur numeric; v_s date; v_e date;
begin
  select * into r from rooms where id = p_room and kos_id = p_kos;
  if r.id is null then raise exception 'Kamar tidak ditemukan'; end if;
  if p_unit not in ('jam', 'hari', 'minggu', 'bulan', 'tahun', 'khusus') then raise exception 'Satuan sewa tidak dikenal'; end if;
  if p_start is null then raise exception 'Isi waktu mulai'; end if;
  if p_end is not null and p_end <= p_start then raise exception 'Waktu selesai harus sesudah waktu mulai'; end if;
  if p_unit = 'khusus' then
    if p_end is null then raise exception 'Periode khusus wajib punya tanggal selesai'; end if;
    if not (p_price > 0) then raise exception 'Isi harga total periode khusus'; end if;
    return jsonb_build_object('unit', p_unit, 'qty', 1, 'price', p_price, 'lines', jsonb_build_array(jsonb_build_object('label', 'Periode khusus', 'qty', 1, 'price', p_price)),
      'subtotal', p_price, 'adjustments', '[]'::jsonb, 'total', round(p_price));
  end if;
  if p_unit = 'jam' and p_end is null then raise exception 'Isi jam selesai'; end if;
  if p_unit = 'hari' and p_end is null then raise exception 'Isi tanggal keluar (check-out)'; end if;
  select * into v_rate from rental_rates where kos_id = p_kos and unit = p_unit and active and (room_id = p_room or room_id is null) order by room_id nulls last limit 1;
  v_base := coalesce(v_rate.price, case when p_unit = 'bulan' then r.rent end);
  if v_base is null or v_base <= 0 then raise exception 'Tarif per % untuk kamar % belum diatur (menu Tarif & kalender).', p_unit, r.code; end if;
  v_s := (p_start at time zone 'Asia/Jakarta')::date; v_e := (p_end at time zone 'Asia/Jakarta')::date;
  v_qty := case p_unit
    when 'jam' then ceil(extract(epoch from (p_end - p_start)) / 3600)::int
    when 'hari' then greatest(1, v_e - v_s)
    when 'minggu' then case when p_end is null then 1 else greatest(1, ceil((v_e - v_s) / 7.0))::int end
    when 'bulan' then case when p_end is null then 1 else greatest(1, (extract(year from age(v_e, v_s)) * 12 + extract(month from age(v_e, v_s)) + case when extract(day from age(v_e, v_s)) > 0 then 1 else 0 end)::int) end
    else case when p_end is null then 1 else greatest(1, ceil((extract(year from age(v_e, v_s)) * 12 + extract(month from age(v_e, v_s)) + case when extract(day from age(v_e, v_s)) > 0 then 1 else 0 end) / 12.0))::int end end;
  if v_qty > (case p_unit when 'jam' then 744 when 'hari' then 400 else 120 end) then raise exception 'Masa sewa terlalu panjang untuk satuan %', p_unit; end if;
  if v_qty < coalesce(v_rate.min_qty, 1) then raise exception 'Minimal sewa % %', v_rate.min_qty, case p_unit when 'hari' then 'malam' else p_unit end; end if;
  v_step := case p_unit when 'jam' then interval '1 hour' when 'hari' then interval '1 day' when 'minggu' then interval '7 days' when 'bulan' then interval '1 month' else interval '1 year' end;
  for i in 0 .. v_qty - 1 loop
    v_at := p_start + v_step * i;
    v_day := (v_at at time zone 'Asia/Jakarta')::date;
    v_p := v_base;
    for rr in select * from rental_rate_rules x where x.kos_id = p_kos and x.active and x.kind <> 'durasi'
                and (cardinality(x.units) = 0 or p_unit = any(x.units)) and (cardinality(x.room_ids) = 0 or p_room = any(x.room_ids))
                and ((x.kind in ('musim', 'tanggal') and v_day between x.start_date and x.end_date) or (x.kind = 'hari_pekan' and extract(isodow from v_day)::int = any(x.days)))
              order by x.priority, x.name loop
      v_p := greatest(0, case when rr.adj_kind = 'persen' then v_p * (1 + rr.adj_value / 100) else v_p + rr.adj_value end);
    end loop;
    v_p := round(v_p);
    v_sub := v_sub + v_p;
    if jsonb_array_length(v_lines) > 0 and (v_lines -> -1 ->> 'price')::numeric = v_p then
      v_lines := jsonb_set(v_lines, array[(jsonb_array_length(v_lines) - 1)::text, 'qty'], to_jsonb((v_lines -> -1 ->> 'qty')::int + 1));
    else
      v_lines := v_lines || jsonb_build_object('from', v_day, 'qty', 1, 'price', v_p);
    end if;
  end loop;
  v_total := v_sub;
  for rr in select * from rental_rate_rules x where x.kos_id = p_kos and x.active and x.kind = 'durasi' and v_qty >= x.min_qty
              and (cardinality(x.units) = 0 or p_unit = any(x.units)) and (cardinality(x.room_ids) = 0 or p_room = any(x.room_ids))
            order by x.min_qty desc, x.priority limit 1 loop
    v_dur := round(case when rr.adj_kind = 'persen' then v_total * rr.adj_value / 100 else rr.adj_value end);
    v_total := greatest(0, v_total + v_dur);
    v_adj := v_adj || jsonb_build_object('name', rr.name, 'amount', v_dur);
  end loop;
  if v_total <= 0 then raise exception 'Total sewa menjadi 0 — periksa aturan tarif'; end if;
  return jsonb_build_object('unit', p_unit, 'qty', v_qty, 'price', v_base, 'lines', v_lines, 'subtotal', v_sub, 'adjustments', v_adj, 'total', round(v_total),
    'rules', (select coalesce(jsonb_agg(name), '[]') from rental_rate_rules x where x.kos_id = p_kos and x.active and x.kind <> 'durasi'
              and (cardinality(x.units) = 0 or p_unit = any(x.units)) and (cardinality(x.room_ids) = 0 or p_room = any(x.room_ids))
              and ((x.kind in ('musim', 'tanggal') and x.start_date <= coalesce(v_e, v_s) and x.end_date >= v_s) or x.kind = 'hari_pekan')));
end $$;
revoke execute on function public.rental_quote_core(uuid, uuid, text, timestamptz, timestamptz, numeric) from public, anon, authenticated;
create or replace function public.rental_quote(p_kos uuid, p_room uuid, p_unit text, p_start timestamptz, p_end timestamptz, p_price numeric default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  return rental_quote_core(p_kos, p_room, p_unit, p_start, p_end, p_price)
    || jsonb_build_object('clash', rental_clash(p_room, tstzrange(p_start, p_end, '[)'), null, null));
end $$;
revoke execute on function public.rental_quote(uuid, uuid, text, timestamptz, timestamptz, numeric) from public, anon;
grant execute on function public.rental_quote(uuid, uuid, text, timestamptz, timestamptz, numeric) to authenticated;

-- Rentang dari isian: per jam = start_at/end_at; lainnya = tanggal (check_in 00:00 .. check_out 00:00)
create or replace function public.rental_span_of(p jsonb, p_unit text)
returns tstzrange language sql stable as $$
  select case when p_unit = 'jam' then tstzrange(nullif(p ->> 'start_at', '')::timestamptz, nullif(p ->> 'end_at', '')::timestamptz, '[)')
              else tstzrange(rental_day(nullif(p ->> 'check_in', '')::date), rental_day(nullif(p ->> 'check_out', '')::date), '[)') end;
$$;

-- ---------- 6. Booking per satuan waktu ----------
-- Satuan 'bulan' tanpa check_out = jalur lama persis (booking_create_monthly). Satuan lain → harga dari rental_quote_core.
alter function public.booking_create(uuid, uuid, jsonb) rename to booking_create_monthly;
revoke execute on function public.booking_create_monthly(uuid, uuid, jsonb) from public, anon, authenticated;
create or replace function public.booking_create(p_id uuid, p_kos uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_unit text := coalesce(nullif(p ->> 'unit', ''), 'bulan'); v_span tstzrange; q jsonb; v_msg text; r jsonb; v_room uuid := nullif(p ->> 'room_id', '')::uuid;
begin
  if v_unit = 'bulan' and nullif(p ->> 'check_out', '') is null then return booking_create_monthly(p_id, p_kos, p); end if;
  if p_id is null then raise exception 'ID wajib'; end if;
  if exists (select 1 from bookings where id = p_id) then return jsonb_build_object('id', p_id, 'number', (select number from bookings where id = p_id), 'duplikat', true); end if;
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if not exists (select 1 from rooms where id = v_room and kos_id = p_kos) then raise exception 'Pilih kamar'; end if;
  v_span := rental_span_of(p, v_unit);
  if lower(v_span) is null then raise exception 'Isi waktu mulai'; end if;
  q := rental_quote_core(p_kos, v_room, v_unit, lower(v_span), upper(v_span), nullif(p ->> 'price', '')::numeric);
  perform pg_advisory_xact_lock(hashtext('booking' || v_room::text));
  v_msg := rental_clash(v_room, v_span, null, null);
  if v_msg is not null then raise exception '%', v_msg; end if;
  -- simpan lewat jalur lama (nomor, DP, CRM) dengan cek bentrok yang sudah dilakukan di atas, lalu lengkapi kolom satuan
  perform set_config('prasara.rental_booking', '1', true);
  r := booking_create_monthly(p_id, p_kos, p || jsonb_build_object('check_in', (lower(v_span) at time zone 'Asia/Jakarta')::date, 'rent', (q ->> 'price')::numeric));
  perform set_config('prasara.rental_booking', '', true);
  update bookings set unit = v_unit, check_out = case when v_unit <> 'jam' then (upper(v_span) at time zone 'Asia/Jakarta')::date end,
    start_at = case when v_unit = 'jam' then lower(v_span) end, end_at = case when v_unit = 'jam' then upper(v_span) end,
    total = (q ->> 'total')::numeric, quote = q, months = null where id = p_id;
  return r || jsonb_build_object('total', (q ->> 'total')::numeric, 'quote', q);
end $$;
revoke execute on function public.booking_create(uuid, uuid, jsonb) from public, anon;
grant execute on function public.booking_create(uuid, uuid, jsonb) to authenticated;
-- Jalur lama memeriksa booking_room_check (terbuka sejak check_in): untuk booking bersatuan cek dilakukan di atas
create or replace function public.booking_room_check(p_room uuid, p_check_in date, p_except uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when coalesce(current_setting('prasara.rental_booking', true), '') = '1' then null
              else rental_clash(p_room, tstzrange(rental_day(p_check_in), null, '[)'), p_except, null) end;
$$;

-- Check-in booking: sewa mewarisi satuan & total booking
alter function public.booking_checkin(uuid, jsonb) rename to booking_checkin_core;
revoke execute on function public.booking_checkin_core(uuid, jsonb) from public, anon, authenticated;
create or replace function public.booking_checkin(p_booking uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b bookings; r jsonb;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null or b.unit = 'bulan' and b.check_out is null then return booking_checkin_core(p_booking, p); end if;
  if b.status <> 'aktif' or not member_in('rent', b.kos_id) then return booking_checkin_core(p_booking, p); end if;
  perform set_config('prasara.rental', jsonb_build_object('cycle', b.unit, 'qty', b.quote ->> 'qty',
    'stay_total', case when b.unit in ('jam', 'hari', 'khusus') then b.total end, 'start_at', b.start_at, 'end_at', b.end_at, 'quote', b.quote)::text, true);
  r := booking_checkin_core(p_booking, p || jsonb_build_object(
    'start', coalesce(nullif(p ->> 'start', ''), coalesce((b.start_at at time zone 'Asia/Jakarta')::date, b.check_in)::text),
    'end', coalesce(nullif(p ->> 'end', ''), (case when b.unit = 'jam' then ((b.end_at - interval '1 second') at time zone 'Asia/Jakarta')::date else b.check_out - 1 end)::text)));
  perform set_config('prasara.rental', '', true);
  return r;
end $$;
revoke execute on function public.booking_checkin(uuid, jsonb) from public, anon;
grant execute on function public.booking_checkin(uuid, jsonb) to authenticated;

-- ---------- 7. Sewa langsung (tanpa booking) & perpanjangan ----------
-- p: {unit, check_in, check_out | start_at, end_at, price (khusus), first_due}
create or replace function public.rental_start(p_room uuid, p_occupant uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_kos uuid; v_unit text := coalesce(nullif(p ->> 'unit', ''), 'bulan'); v_span tstzrange; q jsonb; v_msg text; v_lease uuid; v_end date;
begin
  select kos_id into v_kos from rooms where id = p_room;
  if v_kos is null or not member_in('rent', v_kos) then raise exception 'Kamar tidak ditemukan'; end if;
  if v_unit = 'bulan' then raise exception 'Sewa bulanan pakai Isi kamar seperti biasa'; end if;
  v_span := rental_span_of(p, v_unit);
  if lower(v_span) is null then raise exception 'Isi waktu mulai'; end if;
  if v_unit in ('jam', 'hari', 'khusus') and upper(v_span) is null then raise exception 'Isi waktu selesai'; end if;
  q := rental_quote_core(v_kos, p_room, v_unit, lower(v_span), upper(v_span), nullif(p ->> 'price', '')::numeric);
  v_msg := rental_clash(p_room, v_span, null, null);
  if v_msg is not null then raise exception '%', v_msg; end if;
  v_end := case when upper(v_span) is null then null when v_unit = 'jam' then ((upper(v_span) - interval '1 second') at time zone 'Asia/Jakarta')::date
                else (upper(v_span) at time zone 'Asia/Jakarta')::date - 1 end;
  perform set_config('prasara.rental', jsonb_build_object('cycle', v_unit, 'qty', q ->> 'qty', 'stay_total', case when v_unit in ('jam', 'hari', 'khusus') then (q ->> 'total')::numeric end,
    'start_at', case when v_unit = 'jam' then lower(v_span) end, 'end_at', case when v_unit = 'jam' then upper(v_span) end, 'quote', q)::text, true);
  v_lease := start_lease(p_room, p_occupant, (lower(v_span) at time zone 'Asia/Jakarta')::date,
    case when v_unit in ('minggu', 'tahun') then (q ->> 'price')::numeric else (q ->> 'total')::numeric end, (lower(v_span) at time zone 'Asia/Jakarta')::date, v_end);
  perform set_config('prasara.rental', '', true);
  if nullif(p ->> 'first_due', '') is not null then perform lease_first_due(v_lease, (p ->> 'first_due')::date); end if;
  return jsonb_build_object('lease_id', v_lease, 'quote', q);
end $$;
revoke execute on function public.rental_start(uuid, uuid, jsonb) from public, anon;
grant execute on function public.rental_start(uuid, uuid, jsonb) to authenticated;

-- Perpanjang sewa sekali bayar: tagihan baru untuk tambahan waktu (harga dari aturan tarif saat itu)
create or replace function public.rental_extend(p_lease uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l leases; v_old timestamptz; v_new timestamptz; q jsonb; v_msg text; v_inv uuid := gen_random_uuid();
begin
  select * into l from leases where id = p_lease for update;
  if l.id is null or not member_in('rent', l.kos_id) then raise exception 'Sewa tidak ditemukan'; end if;
  if l.status <> 'aktif' then raise exception 'Sewa ini sudah berakhir'; end if;
  if l.cycle not in ('jam', 'hari', 'khusus') then raise exception 'Perpanjang dipakai untuk sewa per jam/harian/khusus. Sewa berkala diatur lewat Rencana selesai.'; end if;
  v_old := upper(rental_lease_span(l));
  v_new := case when l.cycle = 'jam' then nullif(p ->> 'end_at', '')::timestamptz else rental_day(nullif(p ->> 'check_out', '')::date) end;
  if v_new is null or v_new <= v_old then raise exception 'Waktu selesai baru harus sesudah %', to_char(v_old at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI'); end if;
  q := rental_quote_core(l.kos_id, l.room_id, l.cycle, v_old, v_new, nullif(p ->> 'price', '')::numeric);
  v_msg := rental_clash(l.room_id, tstzrange(v_old, v_new, '[)'), null, l.id);
  if v_msg is not null then raise exception '%', v_msg; end if;
  update leases set end_date = case when l.cycle = 'jam' then ((v_new - interval '1 second') at time zone 'Asia/Jakarta')::date else (v_new at time zone 'Asia/Jakarta')::date - 1 end,
    end_at = case when l.cycle = 'jam' then v_new end, qty = coalesce(qty, 0) + (q ->> 'qty')::numeric, stay_total = coalesce(stay_total, rent) + (q ->> 'total')::numeric
  where id = l.id;
  insert into invoices(id, kos_id, lease_id, room_id, occupant_id, kind, period_start, period_end, due_date, amount, description)
  values (v_inv, l.kos_id, l.id, l.room_id, l.occupant_id, 'tambahan', (v_old at time zone 'Asia/Jakarta')::date, ((v_new - interval '1 second') at time zone 'Asia/Jakarta')::date,
    (now() at time zone 'Asia/Jakarta')::date, (q ->> 'total')::numeric, 'Perpanjangan sewa · ' || (q ->> 'qty') || case l.cycle when 'jam' then ' jam' when 'hari' then ' malam' else '' end);
  return jsonb_build_object('invoice_id', v_inv, 'quote', q);
end $$;
revoke execute on function public.rental_extend(uuid, jsonb) from public, anon;
grant execute on function public.rental_extend(uuid, jsonb) to authenticated;

-- ---------- 8. Kalender ketersediaan ----------
create or replace function public.rental_calendar(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_span tstzrange := tstzrange(rental_day(p_from), rental_day(p_to + 1), '[)');
begin
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if p_to < p_from or p_to - p_from > 100 then raise exception 'Rentang kalender maksimal 100 hari'; end if;
  return jsonb_build_object('from', p_from, 'to', p_to,
    'rooms', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'status', r.status, 'branch_id', r.branch_id, 'rent', r.rent) order by r.code), '[]') from rooms r where r.kos_id = p_kos),
    'items', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('kind', 'sewa', 'id', l.id, 'room_id', l.room_id, 'label', o.name, 'cycle', l.cycle,
               'from', lower(rental_lease_span(l)), 'to', upper(rental_lease_span(l))) x
      from leases l join occupants o on o.id = l.occupant_id
      where l.kos_id = p_kos and l.status = 'aktif' and rental_lease_span(l) && v_span
      union all
      select jsonb_build_object('kind', 'booking', 'id', b.id, 'room_id', b.room_id, 'label', b.name || ' · ' || b.number, 'cycle', b.unit,
               'from', lower(rental_booking_span(b)), 'to', upper(rental_booking_span(b)), 'dp', b.dp_amount, 'total', b.total)
      from bookings b where b.kos_id = p_kos and b.status = 'aktif' and rental_booking_span(b) && v_span) q), '[]'));
end $$;
revoke execute on function public.rental_calendar(uuid, date, date) from public, anon;
grant execute on function public.rental_calendar(uuid, date, date) to authenticated;

-- ---------- 9. Analisis: proyeksi memakai sewa setara bulanan ----------
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.property_intel(uuid,date,date,uuid)', 'select sum(l.rent) from leases l', 'select sum(lease_monthly_rent(l.cycle, l.rent)) from leases l');
drop function public._prasara_patch(text, text, text);

-- ---------- 10. Modul ----------
insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, version, sort, module_type, category, impl_status, feature_keys, area, optional_deps, owner_approval, config_path)
select 'p_tarif', 'Tarif & kalender sewa', 'Sewa per jam, harian, mingguan, bulanan, tahunan, dan periode khusus dengan tarif dinamis (musim, akhir pekan, tanggal khusus, diskon durasi) dan kalender ketersediaan.',
       '{properti}', false, '{p_kamar}', null, '{/tarif}', 'rental_rates, rental_rate_rules, leases.cycle, bookings.unit', 'available', '1.0', 10, 'operational', category, 'production_ready', '{}', 'rent', '{p_booking}', false, '/tarif'
from public.modules where code = 'p_booking'
on conflict (code) do nothing;
update public.modules set rel_models = '{rental,hospitality}', benefit = 'Terima tamu per jam/harian/mingguan dengan harga yang menyesuaikan musim & akhir pekan, tanpa dobel booking.' where code = 'p_tarif';
-- aktif otomatis untuk properti jenis penginapan/apartemen/villa (jenis lain bisa mengaktifkan di Konfigurasi › Modul)
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'p_tarif', true, 'sistem' from public.kos k
where k.business_type = 'properti' and (k.category_code = 'hospitality' or k.subcategory_code in ('properti_homestay', 'properti_apartemen', 'kuliner_penginapan', 'travel_penginapan'))
on conflict do nothing;
