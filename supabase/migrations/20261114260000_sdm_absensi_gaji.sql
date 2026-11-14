-- SDM: data karyawan (termasuk yang tidak punya akun), jadwal shift, absensi (dicatat pengelola atau absen sendiri),
-- kasbon karyawan, dan penggajian bulanan dengan slip gaji. Modul u_sdm (Modul V2.0 Bab 15; backlog P1).
-- Pembukuan berbasis kas (sama dengan laporan lain): kasbon karyawan & gaji yang dibayarkan dicatat sebagai pengeluaran
-- kategori "Gaji karyawan" (masuk Pengeluaran, laporan, anggaran, jurnal). Potongan kasbon di slip mengurangi uang yang
-- dibayar saat gajian (kasbonnya sudah tercatat sebagai pengeluaran saat diberikan), jadi total beban = gaji kotor − potongan lain.
-- Izin: kelola = pemilik/area team atau finance (sdm_admin). Absen sendiri = anggota yang ditautkan ke data karyawannya.

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  phone text check (phone is null or length(phone) <= 20),
  position text check (position is null or length(position) <= 60),
  member_user_id uuid,
  pay_type text not null default 'bulanan' check (pay_type in ('bulanan', 'harian', 'per_jam')),
  base_pay numeric(14,2) not null default 0 check (base_pay >= 0),
  allowance numeric(14,2) not null default 0 check (allowance >= 0),
  overtime_rate numeric(14,2) not null default 0 check (overtime_rate >= 0),
  work_hours numeric(4,1) not null default 8 check (work_hours > 0 and work_hours <= 24),
  join_date date, end_date date,
  active boolean not null default true,
  bank_info text check (bank_info is null or length(bank_info) <= 120),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (kos_id, member_user_id)
);
create index if not exists staff_kos on public.staff(kos_id, active);

create table if not exists public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  work_date date not null,
  start_time time, end_time time,
  label text check (label is null or length(label) <= 30),
  unique (staff_id, work_date)
);
create index if not exists staff_shifts_kos on public.staff_shifts(kos_id, work_date);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  work_date date not null,
  status text not null default 'hadir' check (status in ('hadir', 'izin', 'sakit', 'cuti', 'alpa', 'libur')),
  clock_in timestamptz, clock_out timestamptz,
  hours numeric(5,2) not null default 0 check (hours >= 0 and hours <= 24),
  overtime numeric(5,2) not null default 0 check (overtime >= 0 and overtime <= 24),
  note text check (note is null or length(note) <= 200),
  recorded_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (staff_id, work_date)
);
create index if not exists attendance_kos on public.attendance(kos_id, work_date);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  period date not null,
  status text not null default 'draf' check (status in ('draf', 'dibayar', 'batal')),
  account text check (account in ('kas', 'bank')),
  paid_date date,
  expense_id uuid references public.expenses(id) on delete set null,
  total_gross numeric(14,2) not null default 0, total_net numeric(14,2) not null default 0,
  note text, void_reason text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create unique index if not exists payroll_runs_one on public.payroll_runs(kos_id, period) where status <> 'batal';
create table if not exists public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  staff_id uuid not null references public.staff(id),
  name text not null, position text, pay_type text not null,
  days_present numeric(5,1) not null default 0, days_absent numeric(5,1) not null default 0, hours numeric(7,2) not null default 0, overtime_hours numeric(7,2) not null default 0,
  base numeric(14,2) not null default 0, allowance numeric(14,2) not null default 0, overtime numeric(14,2) not null default 0,
  bonus numeric(14,2) not null default 0, deduction numeric(14,2) not null default 0, advance_deduction numeric(14,2) not null default 0,
  net numeric(14,2) not null default 0, note text check (note is null or length(note) <= 200),
  unique (run_id, staff_id)
);
create table if not exists public.staff_advances (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  staff_id uuid not null references public.staff(id),
  date date not null default (now() at time zone 'Asia/Jakarta')::date,
  amount numeric(14,2) not null check (amount > 0),
  account text not null check (account in ('kas', 'bank')),
  note text check (note is null or length(note) <= 200),
  expense_id uuid references public.expenses(id) on delete set null,
  status text not null default 'aktif' check (status in ('aktif', 'batal')),
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists staff_advances_staff on public.staff_advances(staff_id);

-- RLS: data gaji hanya pemilik/team/keuangan; karyawan melihat datanya sendiri lewat RPC (staff_me)
do $$ declare t text; begin
  foreach t in array array['staff', 'staff_shifts', 'attendance', 'payroll_runs', 'payroll_lines', 'staff_advances'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (member_can(kos_id, ''team,finance''))', t || '_select', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

create or replace function public.sdm_admin(p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select member_in('team', p_kos) or member_in('finance', p_kos);
$$;
create or replace function public.sdm_guard(p_kos uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not sdm_admin(p_kos) then raise exception 'Hanya pemilik atau bagian keuangan yang bisa mengelola data karyawan & gaji'; end if;
  if not module_on(p_kos, 'u_sdm') then raise exception 'Modul SDM & gaji belum aktif (Konfigurasi › Modul)'; end if;
end $$;

-- kategori pengeluaran "Gaji karyawan"
create or replace function public.sdm_category(p_kos uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from expense_categories where kos_id = p_kos and name = 'Gaji karyawan';
  if v is null then insert into expense_categories(kos_id, name, kind) values (p_kos, 'Gaji karyawan', 'operasional') on conflict (kos_id, name) do nothing returning id into v; end if;
  if v is null then select id into v from expense_categories where kos_id = p_kos and name = 'Gaji karyawan'; end if;
  return v;
end $$;

-- ===== Karyawan =====
create or replace function public.staff_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); v_user uuid := nullif(p->>'member_user_id', '')::uuid;
begin
  perform sdm_guard(p_kos);
  if p_id is not null and not exists (select 1 from staff where id = p_id and kos_id = p_kos) then raise exception 'Karyawan tidak ditemukan'; end if;
  if coalesce(length(trim(p->>'name')), 0) < 2 then raise exception 'Isi nama karyawan'; end if;
  if coalesce(p->>'pay_type', 'bulanan') not in ('bulanan', 'harian', 'per_jam') then raise exception 'Jenis gaji: bulanan, harian, atau per jam'; end if;
  if v_user is not null and not exists (select 1 from kos_members where kos_id = p_kos and user_id = v_user) then raise exception 'Akun karyawan tidak ditemukan di bisnis ini'; end if;
  if v_user is not null and exists (select 1 from staff where kos_id = p_kos and member_user_id = v_user and id <> v_id) then raise exception 'Akun itu sudah ditautkan ke karyawan lain'; end if;
  insert into staff(id, kos_id, name, phone, position, member_user_id, pay_type, base_pay, allowance, overtime_rate, work_hours, join_date, end_date, active, bank_info, note)
  values (v_id, p_kos, trim(p->>'name'), nullif(trim(coalesce(p->>'phone', '')), ''), nullif(trim(coalesce(p->>'position', '')), ''), v_user,
    coalesce(p->>'pay_type', 'bulanan'), coalesce(nullif(p->>'base_pay', '')::numeric, 0), coalesce(nullif(p->>'allowance', '')::numeric, 0),
    coalesce(nullif(p->>'overtime_rate', '')::numeric, 0), coalesce(nullif(p->>'work_hours', '')::numeric, 8),
    nullif(p->>'join_date', '')::date, nullif(p->>'end_date', '')::date, coalesce((p->>'active')::boolean, true),
    nullif(trim(coalesce(p->>'bank_info', '')), ''), nullif(trim(coalesce(p->>'note', '')), ''))
  on conflict (id) do update set name = excluded.name, phone = excluded.phone, position = excluded.position, member_user_id = excluded.member_user_id,
    pay_type = excluded.pay_type, base_pay = excluded.base_pay, allowance = excluded.allowance, overtime_rate = excluded.overtime_rate, work_hours = excluded.work_hours,
    join_date = excluded.join_date, end_date = excluded.end_date, active = excluded.active, bank_info = excluded.bank_info, note = excluded.note, updated_at = now();
  return v_id;
end $$;

-- ===== Jadwal shift (banyak hari sekaligus) =====
-- p: {staff_ids:[...], dates:[...], start, end, label}  (start kosong & end kosong & label 'Libur' = libur; 'hapus': true = hapus jadwal)
create or replace function public.shift_plan_set(p_kos uuid, p jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare s uuid; d date; n int := 0;
begin
  perform sdm_guard(p_kos);
  if jsonb_typeof(p->'staff_ids') <> 'array' or jsonb_typeof(p->'dates') <> 'array' then raise exception 'Pilih karyawan dan tanggal'; end if;
  if jsonb_array_length(p->'dates') > 62 then raise exception 'Maksimal 62 hari sekali atur'; end if;
  for s in select (x #>> '{}')::uuid from jsonb_array_elements(p->'staff_ids') x loop
    if not exists (select 1 from staff where id = s and kos_id = p_kos) then raise exception 'Karyawan tidak ditemukan'; end if;
    for d in select (x #>> '{}')::date from jsonb_array_elements(p->'dates') x loop
      if coalesce((p->>'hapus')::boolean, false) then delete from staff_shifts where staff_id = s and work_date = d;
      else
        insert into staff_shifts(kos_id, staff_id, work_date, start_time, end_time, label)
        values (p_kos, s, d, nullif(p->>'start', '')::time, nullif(p->>'end', '')::time, nullif(trim(coalesce(p->>'label', '')), ''))
        on conflict (staff_id, work_date) do update set start_time = excluded.start_time, end_time = excluded.end_time, label = excluded.label;
      end if;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- jam kerja & lembur dari jam masuk/pulang (lembur = lewat jam selesai shift, atau lewat jam kerja harian bila tanpa shift)
create or replace function public.att_calc(p_staff uuid, p_date date, p_in timestamptz, p_out timestamptz, out hours numeric, out overtime numeric)
language plpgsql stable security definer set search_path = public as $$
declare sh staff_shifts; st staff; v_end timestamptz;
begin
  hours := 0; overtime := 0;
  if p_in is null or p_out is null or p_out <= p_in then return; end if;
  hours := round(extract(epoch from (p_out - p_in)) / 3600.0, 2);
  if hours > 24 then hours := 24; end if;
  select * into sh from staff_shifts where staff_id = p_staff and work_date = p_date;
  select * into st from staff where id = p_staff;
  if sh.end_time is not null then
    v_end := (p_date + sh.end_time) at time zone 'Asia/Jakarta';
    if sh.start_time is not null and sh.end_time < sh.start_time then v_end := v_end + interval '1 day'; end if;
    overtime := greatest(0, round(extract(epoch from (p_out - v_end)) / 3600.0, 2));
  else
    overtime := greatest(0, hours - coalesce(st.work_hours, 8));
  end if;
  overtime := least(overtime, hours);
end $$;

-- Catat absensi oleh pengelola. p: {staff_id, date, status, in:'HH:MM', out:'HH:MM', hours?, overtime?, note}
create or replace function public.attendance_set(p_kos uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st staff; v_date date := coalesce(nullif(p->>'date', '')::date, (now() at time zone 'Asia/Jakarta')::date);
        v_in timestamptz; v_out timestamptz; c record; v_status text := coalesce(nullif(p->>'status', ''), 'hadir');
begin
  perform sdm_guard(p_kos);
  select * into st from staff where id = nullif(p->>'staff_id', '')::uuid and kos_id = p_kos;
  if st.id is null then raise exception 'Karyawan tidak ditemukan'; end if;
  if v_status not in ('hadir', 'izin', 'sakit', 'cuti', 'alpa', 'libur') then raise exception 'Status absensi tidak dikenal'; end if;
  if v_date > (now() at time zone 'Asia/Jakarta')::date + 31 then raise exception 'Tanggal terlalu jauh ke depan'; end if;
  if v_status = 'hadir' then
    v_in := case when nullif(p->>'in', '') is not null then (v_date + (p->>'in')::time) at time zone 'Asia/Jakarta' end;
    v_out := case when nullif(p->>'out', '') is not null then (v_date + (p->>'out')::time) at time zone 'Asia/Jakarta' end;
    if v_in is not null and v_out is not null and v_out <= v_in then v_out := v_out + interval '1 day'; end if; -- shift lewat tengah malam
  end if;
  select * into c from att_calc(st.id, v_date, v_in, v_out);
  insert into attendance(kos_id, staff_id, work_date, status, clock_in, clock_out, hours, overtime, note, updated_at)
  values (p_kos, st.id, v_date, v_status, v_in, v_out,
    case when v_status = 'hadir' then coalesce(nullif(p->>'hours', '')::numeric, case when v_in is null then st.work_hours else c.hours end) else 0 end,
    case when v_status = 'hadir' then coalesce(nullif(p->>'overtime', '')::numeric, c.overtime) else 0 end,
    nullif(trim(coalesce(p->>'note', '')), ''), now())
  on conflict (staff_id, work_date) do update set status = excluded.status, clock_in = excluded.clock_in, clock_out = excluded.clock_out,
    hours = excluded.hours, overtime = excluded.overtime, note = excluded.note, recorded_by = auth.uid(), updated_at = now();
  return (select to_jsonb(a) from attendance a where staff_id = st.id and work_date = v_date);
end $$;

-- Absen sendiri (karyawan yang akunnya ditautkan): masuk / pulang
create or replace function public.attendance_clock(p_kos uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st staff; a attendance; v_today date := (now() at time zone 'Asia/Jakarta')::date; c record;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if not module_on(p_kos, 'u_sdm') then raise exception 'Modul SDM & gaji belum aktif'; end if;
  select * into st from staff where kos_id = p_kos and member_user_id = auth.uid() and active;
  if st.id is null then raise exception 'Akun Anda belum ditautkan ke data karyawan. Minta pemilik menautkannya di SDM & gaji.'; end if;
  select * into a from attendance where staff_id = st.id and work_date = v_today for update;
  if p_action = 'masuk' then
    if a.clock_in is not null then raise exception 'Sudah absen masuk jam %', to_char(a.clock_in at time zone 'Asia/Jakarta', 'HH24.MI'); end if;
    insert into attendance(kos_id, staff_id, work_date, status, clock_in, note) values (p_kos, st.id, v_today, 'hadir', now(), nullif(trim(coalesce(p_note, '')), ''))
    on conflict (staff_id, work_date) do update set status = 'hadir', clock_in = now(), note = coalesce(excluded.note, attendance.note), updated_at = now();
  elsif p_action = 'pulang' then
    -- shift lewat tengah malam: pakai catatan kemarin yang belum pulang
    if a.id is null or a.clock_in is null then
      select * into a from attendance where staff_id = st.id and work_date = v_today - 1 and clock_in is not null and clock_out is null for update;
      if a.id is null then raise exception 'Belum absen masuk hari ini'; end if;
    end if;
    if a.clock_out is not null then raise exception 'Sudah absen pulang jam %', to_char(a.clock_out at time zone 'Asia/Jakarta', 'HH24.MI'); end if;
    select * into c from att_calc(st.id, a.work_date, a.clock_in, now());
    update attendance set clock_out = now(), hours = c.hours, overtime = c.overtime, note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note), updated_at = now() where id = a.id;
  else raise exception 'Tindakan tidak dikenal'; end if;
  return staff_me(p_kos);
end $$;

-- Data untuk karyawan sendiri: status absen hari ini, jadwal 7 hari, riwayat bulan ini, sisa kasbon, slip gaji
create or replace function public.staff_me(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st staff; v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  select * into st from staff where kos_id = p_kos and member_user_id = auth.uid();
  if st.id is null then return jsonb_build_object('linked', false); end if;
  return jsonb_build_object('linked', true, 'staff_id', st.id, 'name', st.name, 'position', st.position,
    'today', (select to_jsonb(a) from attendance a where staff_id = st.id and work_date = v_today),
    'open_yesterday', (select to_jsonb(a) from attendance a where staff_id = st.id and work_date = v_today - 1 and clock_in is not null and clock_out is null),
    'shifts', (select coalesce(jsonb_agg(to_jsonb(s) order by s.work_date), '[]') from staff_shifts s where s.staff_id = st.id and s.work_date between v_today and v_today + 6),
    'month', (select coalesce(jsonb_agg(jsonb_build_object('date', a.work_date, 'status', a.status, 'in', a.clock_in, 'out', a.clock_out, 'hours', a.hours, 'overtime', a.overtime) order by a.work_date desc), '[]')
              from attendance a where a.staff_id = st.id and a.work_date >= date_trunc('month', v_today)::date),
    'advance', staff_advance_balance(st.id),
    'slips', (select coalesce(jsonb_agg(jsonb_build_object('run_id', r.id, 'period', r.period, 'net', l.net) order by r.period desc), '[]')
              from payroll_lines l join payroll_runs r on r.id = l.run_id where l.staff_id = st.id and r.status = 'dibayar'));
end $$;

-- ===== Kasbon karyawan =====
create or replace function public.staff_advance_balance(p_staff uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select sum(amount) from staff_advances where staff_id = p_staff and status = 'aktif'), 0)
       - coalesce((select sum(l.advance_deduction) from payroll_lines l join payroll_runs r on r.id = l.run_id where l.staff_id = p_staff and r.status = 'dibayar'), 0);
$$;

create or replace function public.staff_advance_add(p_kos uuid, p_staff uuid, p_amount numeric, p_account text, p_date date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare st staff; v_id uuid := gen_random_uuid(); v_exp uuid; v_date date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
begin
  perform sdm_guard(p_kos);
  select * into st from staff where id = p_staff and kos_id = p_kos;
  if st.id is null then raise exception 'Karyawan tidak ditemukan'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Isi jumlah kasbon'; end if;
  if coalesce(p_account, '') not in ('kas', 'bank') then raise exception 'Pilih kas atau bank'; end if;
  if v_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal kasbon belum tiba — catat saat uangnya diberikan'; end if;
  insert into expenses(kos_id, date, category_id, kind, amount, description, account)
  values (p_kos, v_date, sdm_category(p_kos), 'operasional', round(p_amount, 2), 'Kasbon karyawan · ' || st.name || coalesce(' · ' || nullif(trim(coalesce(p_note, '')), ''), ''), p_account)
  returning id into v_exp;
  insert into staff_advances(id, kos_id, staff_id, date, amount, account, note, expense_id)
  values (v_id, p_kos, st.id, v_date, round(p_amount, 2), p_account, nullif(trim(coalesce(p_note, '')), ''), v_exp);
  return v_id;
end $$;

create or replace function public.staff_advance_void(p_advance uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare sa staff_advances;
begin
  select * into sa from staff_advances where id = p_advance for update;
  if sa.id is null then raise exception 'Kasbon tidak ditemukan'; end if;
  perform sdm_guard(sa.kos_id);
  if sa.status <> 'aktif' then raise exception 'Kasbon sudah dibatalkan'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tulis alasannya'; end if;
  if staff_advance_balance(sa.staff_id) < sa.amount then raise exception 'Kasbon ini sudah dipotong dari gaji; batalkan penggajiannya dulu bila salah'; end if;
  update staff_advances set status = 'batal', note = coalesce(note || ' · ', '') || 'Batal: ' || trim(p_reason) where id = sa.id;
  perform set_config('prasara.sdm_ok', '1', true);
  delete from expenses where id = sa.expense_id;
  perform set_config('prasara.sdm_ok', '', true);
end $$;

-- ===== Penggajian =====
-- Draf gaji satu bulan: dihitung dari data karyawan + absensi bulan itu. Draf yang sudah ada dihitung ulang (catatan bonus/potongan dipertahankan).
create or replace function public.payroll_draft(p_kos uuid, p_month date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_m0 date := date_trunc('month', p_month)::date; v_m1 date; r payroll_runs; st staff; v_days int; v_emp int; v_pres numeric; v_abs numeric; v_hours numeric; v_ot numeric;
        v_base numeric; v_adv numeric; old payroll_lines;
begin
  perform sdm_guard(p_kos);
  v_m1 := (v_m0 + interval '1 month - 1 day')::date;
  v_days := v_m1 - v_m0 + 1;
  if v_m0 > date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date then raise exception 'Bulan itu belum tiba'; end if;
  select * into r from payroll_runs where kos_id = p_kos and period = v_m0 and status <> 'batal' for update;
  if r.status = 'dibayar' then raise exception 'Gaji bulan ini sudah dibayar. Batalkan dulu bila perlu dihitung ulang.'; end if;
  if r.id is null then insert into payroll_runs(kos_id, period) values (p_kos, v_m0) returning * into r; end if;
  for st in select * from staff where kos_id = p_kos and (active or end_date >= v_m0) and (join_date is null or join_date <= v_m1) order by name loop
    select coalesce(count(*) filter (where status = 'hadir'), 0), coalesce(count(*) filter (where status = 'alpa'), 0), coalesce(sum(hours), 0), coalesce(sum(overtime), 0)
      into v_pres, v_abs, v_hours, v_ot from attendance where staff_id = st.id and work_date between v_m0 and v_m1;
    -- bulanan: prorata bila masuk/keluar di tengah bulan
    v_emp := (least(v_m1, coalesce(st.end_date, v_m1)) - greatest(v_m0, coalesce(st.join_date, v_m0)) + 1);
    v_base := case st.pay_type
      when 'bulanan' then round(st.base_pay * least(1, greatest(0, v_emp)::numeric / v_days), 0)
      when 'harian' then round(st.base_pay * v_pres, 0)
      else round(st.base_pay * greatest(0, v_hours - v_ot), 0) end;
    v_adv := greatest(0, staff_advance_balance(st.id));
    select * into old from payroll_lines where run_id = r.id and staff_id = st.id;
    insert into payroll_lines(run_id, kos_id, staff_id, name, position, pay_type, days_present, days_absent, hours, overtime_hours, base, allowance, overtime, bonus, deduction, advance_deduction, net, note)
    values (r.id, p_kos, st.id, st.name, st.position, st.pay_type, v_pres, v_abs, v_hours, v_ot, v_base,
      case when st.pay_type = 'bulanan' then round(st.allowance * least(1, greatest(0, v_emp)::numeric / v_days), 0) else st.allowance end,
      round(v_ot * st.overtime_rate, 0), coalesce(old.bonus, 0), coalesce(old.deduction, 0), least(coalesce(old.advance_deduction, v_adv), v_adv), 0, old.note)
    on conflict (run_id, staff_id) do update set name = excluded.name, position = excluded.position, pay_type = excluded.pay_type, days_present = excluded.days_present,
      days_absent = excluded.days_absent, hours = excluded.hours, overtime_hours = excluded.overtime_hours, base = excluded.base, allowance = excluded.allowance,
      overtime = excluded.overtime, advance_deduction = excluded.advance_deduction;
  end loop;
  update payroll_lines set advance_deduction = least(advance_deduction, greatest(0, base + allowance + overtime + bonus - deduction)) where run_id = r.id;
  update payroll_lines set net = greatest(0, base + allowance + overtime + bonus - deduction - advance_deduction) where run_id = r.id;
  update payroll_runs set total_gross = (select coalesce(sum(base + allowance + overtime + bonus), 0) from payroll_lines where run_id = r.id),
    total_net = (select coalesce(sum(net), 0) from payroll_lines where run_id = r.id) where id = r.id;
  return r.id;
end $$;

-- Ubah satu baris draf: {base, allowance, overtime, bonus, deduction, advance_deduction, note}
create or replace function public.payroll_line_set(p_line uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l payroll_lines; r payroll_runs; v_adv numeric;
begin
  select * into l from payroll_lines where id = p_line for update;
  if l.id is null then raise exception 'Baris gaji tidak ditemukan'; end if;
  select * into r from payroll_runs where id = l.run_id;
  perform sdm_guard(r.kos_id);
  if r.status <> 'draf' then raise exception 'Gaji sudah dibayar — tidak bisa diubah'; end if;
  v_adv := greatest(0, staff_advance_balance(l.staff_id));
  update payroll_lines set
    base = coalesce(nullif(p->>'base', '')::numeric, base), allowance = coalesce(nullif(p->>'allowance', '')::numeric, allowance),
    overtime = coalesce(nullif(p->>'overtime', '')::numeric, overtime), bonus = coalesce(nullif(p->>'bonus', '')::numeric, bonus),
    deduction = coalesce(nullif(p->>'deduction', '')::numeric, deduction),
    advance_deduction = least(v_adv, coalesce(nullif(p->>'advance_deduction', '')::numeric, advance_deduction)),
    note = case when p ? 'note' then nullif(trim(coalesce(p->>'note', '')), '') else note end
  where id = l.id returning * into l;
  if least(l.base, l.allowance, l.overtime, l.bonus, l.deduction, l.advance_deduction) < 0 then raise exception 'Angka tidak boleh minus'; end if;
  if l.base + l.allowance + l.overtime + l.bonus - l.deduction - l.advance_deduction < 0 then raise exception 'Potongan melebihi gaji'; end if;
  update payroll_lines set net = base + allowance + overtime + bonus - deduction - advance_deduction where id = l.id returning * into l;
  update payroll_runs set total_gross = (select coalesce(sum(base + allowance + overtime + bonus), 0) from payroll_lines where run_id = r.id),
    total_net = (select coalesce(sum(net), 0) from payroll_lines where run_id = r.id) where id = r.id;
  return to_jsonb(l);
end $$;

create or replace function public.payroll_line_remove(p_line uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l payroll_lines; r payroll_runs;
begin
  select * into l from payroll_lines where id = p_line;
  if l.id is null then raise exception 'Baris gaji tidak ditemukan'; end if;
  select * into r from payroll_runs where id = l.run_id;
  perform sdm_guard(r.kos_id);
  if r.status <> 'draf' then raise exception 'Gaji sudah dibayar — tidak bisa diubah'; end if;
  delete from payroll_lines where id = l.id;
  update payroll_runs set total_gross = (select coalesce(sum(base + allowance + overtime + bonus), 0) from payroll_lines where run_id = r.id),
    total_net = (select coalesce(sum(net), 0) from payroll_lines where run_id = r.id) where id = r.id;
end $$;

-- Bayar gaji: satu pengeluaran "Gaji karyawan" sebesar total yang dibayarkan (kas/bank)
create or replace function public.payroll_pay(p_run uuid, p_account text, p_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r payroll_runs; v_exp uuid; v_date date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date); v_n int;
begin
  select * into r from payroll_runs where id = p_run for update;
  if r.id is null then raise exception 'Penggajian tidak ditemukan'; end if;
  perform sdm_guard(r.kos_id);
  if r.status <> 'draf' then raise exception 'Penggajian ini sudah %', r.status; end if;
  if coalesce(p_account, '') not in ('kas', 'bank') then raise exception 'Pilih dibayar dari kas atau bank'; end if;
  if v_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal bayar belum tiba — catat saat gaji benar-benar dibayar'; end if;
  select count(*) into v_n from payroll_lines where run_id = r.id;
  if v_n = 0 then raise exception 'Belum ada karyawan di penggajian ini'; end if;
  if r.total_net > 0 then
    insert into expenses(kos_id, date, category_id, kind, amount, description, account)
    values (r.kos_id, v_date, sdm_category(r.kos_id), 'operasional', r.total_net, 'Gaji karyawan ' || to_char(r.period, 'MM/YYYY') || ' · ' || v_n || ' orang', p_account)
    returning id into v_exp;
  end if;
  update payroll_runs set status = 'dibayar', account = p_account, paid_date = v_date, expense_id = v_exp where id = r.id;
  return jsonb_build_object('status', 'dibayar', 'total', r.total_net, 'expense_id', v_exp);
end $$;

-- Batalkan penggajian yang sudah dibayar (salah hitung): pengeluarannya dihapus, kasbon yang dipotong kembali terbuka
create or replace function public.payroll_void(p_run uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r payroll_runs;
begin
  select * into r from payroll_runs where id = p_run for update;
  if r.id is null then raise exception 'Penggajian tidak ditemukan'; end if;
  perform sdm_guard(r.kos_id);
  if r.status = 'batal' then raise exception 'Sudah dibatalkan'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tulis alasannya'; end if;
  update payroll_runs set status = 'batal', void_reason = trim(p_reason) where id = r.id;
  if r.expense_id is not null then
    perform set_config('prasara.sdm_ok', '1', true);
    delete from expenses where id = r.expense_id;
    perform set_config('prasara.sdm_ok', '', true);
  end if;
end $$;

-- Pengeluaran gaji/kasbon tidak dihapus dari menu Pengeluaran (agar SDM & pembukuan tetap cocok)
create or replace function public.expenses_sdm_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('prasara.sdm_ok', true) = '1' then return old; end if;
  if exists (select 1 from payroll_runs where expense_id = old.id and status = 'dibayar') or exists (select 1 from staff_advances where expense_id = old.id and status = 'aktif') then
    raise exception 'Pengeluaran ini dari SDM & gaji. Batalkan dari menu SDM & gaji agar data karyawan tetap cocok.';
  end if;
  return old;
end $$;
drop trigger if exists expenses_sdm_guard on public.expenses;
create trigger expenses_sdm_guard before delete on public.expenses for each row execute function public.expenses_sdm_guard();

-- Slip gaji (pengelola: semua; karyawan: miliknya sendiri)
create or replace function public.payroll_slip(p_run uuid, p_staff uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r payroll_runs; l payroll_lines; st staff; k kos;
begin
  select * into r from payroll_runs where id = p_run;
  if r.id is null then raise exception 'Slip tidak ditemukan'; end if;
  select * into st from staff where id = p_staff and kos_id = r.kos_id;
  if st.id is null or not (sdm_admin(r.kos_id) or coalesce(st.member_user_id = auth.uid() and r.status = 'dibayar', false)) then raise exception 'Slip tidak ditemukan'; end if;
  select * into l from payroll_lines where run_id = r.id and staff_id = st.id;
  if l.id is null then raise exception 'Slip tidak ditemukan'; end if;
  select * into k from kos where id = r.kos_id;
  return jsonb_build_object('business', jsonb_build_object('name', k.name, 'address', k.address, 'logo', k.profile->>'logo_path'),
    'period', r.period, 'status', r.status, 'paid_date', r.paid_date, 'account', r.account,
    'staff', jsonb_build_object('name', st.name, 'position', st.position, 'phone', st.phone, 'bank_info', st.bank_info, 'pay_type', st.pay_type, 'base_pay', st.base_pay, 'overtime_rate', st.overtime_rate),
    'line', to_jsonb(l), 'advance_left', staff_advance_balance(st.id));
end $$;

-- Ringkasan absensi per karyawan dalam rentang (laporan)
create or replace function public.attendance_summary(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform sdm_guard(p_kos);
  return (select coalesce(jsonb_agg(to_jsonb(z) order by z.name), '[]') from (
    select s.id staff_id, s.name,
      count(a.id) filter (where a.status = 'hadir') hadir, count(a.id) filter (where a.status = 'izin') izin, count(a.id) filter (where a.status = 'sakit') sakit,
      count(a.id) filter (where a.status = 'cuti') cuti, count(a.id) filter (where a.status = 'alpa') alpa, count(a.id) filter (where a.status = 'libur') libur,
      coalesce(sum(a.hours), 0) jam, coalesce(sum(a.overtime), 0) lembur,
      count(a.id) filter (where a.clock_in is not null and sh.start_time is not null and (a.clock_in at time zone 'Asia/Jakarta')::time > sh.start_time + interval '10 minutes') terlambat
    from staff s left join attendance a on a.staff_id = s.id and a.work_date between p_from and p_to
    left join staff_shifts sh on sh.staff_id = a.staff_id and sh.work_date = a.work_date
    where s.kos_id = p_kos and (s.active or a.id is not null)
    group by s.id, s.name) z);
end $$;

revoke execute on function public.sdm_admin(uuid), public.sdm_guard(uuid), public.sdm_category(uuid), public.att_calc(uuid, date, timestamptz, timestamptz), public.expenses_sdm_guard() from public, anon, authenticated;
grant execute on function public.sdm_admin(uuid) to authenticated;
revoke execute on function public.staff_save(uuid, uuid, jsonb), public.shift_plan_set(uuid, jsonb), public.attendance_set(uuid, jsonb), public.attendance_clock(uuid, text, text),
  public.staff_me(uuid), public.staff_advance_balance(uuid), public.staff_advance_add(uuid, uuid, numeric, text, date, text), public.staff_advance_void(uuid, text),
  public.payroll_draft(uuid, date), public.payroll_line_set(uuid, jsonb), public.payroll_line_remove(uuid), public.payroll_pay(uuid, text, date), public.payroll_void(uuid, text),
  public.payroll_slip(uuid, uuid), public.attendance_summary(uuid, date, date) from public, anon;
grant execute on function public.staff_save(uuid, uuid, jsonb), public.shift_plan_set(uuid, jsonb), public.attendance_set(uuid, jsonb), public.attendance_clock(uuid, text, text),
  public.staff_me(uuid), public.staff_advance_balance(uuid), public.staff_advance_add(uuid, uuid, numeric, text, date, text), public.staff_advance_void(uuid, text),
  public.payroll_draft(uuid, date), public.payroll_line_set(uuid, jsonb), public.payroll_line_remove(uuid), public.payroll_pay(uuid, text, date), public.payroll_void(uuid, text),
  public.payroll_slip(uuid, uuid), public.attendance_summary(uuid, date, date) to authenticated;

-- Module Registry
update public.modules set impl_status = 'production_ready', paths = '{/sdm}', config_path = '/sdm', area = 'team',
  description = 'Data karyawan (termasuk tanpa akun), jadwal shift, absensi (dicatat pengelola atau absen sendiri dari HP), kasbon karyawan, penggajian bulanan & slip gaji. Gaji tercatat sebagai pengeluaran "Gaji karyawan".',
  data_used = 'staff, staff_shifts, attendance, staff_advances, payroll_runs, payroll_lines, expenses'
where code = 'u_sdm';
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'u_sdm', true, 'sistem' from public.kos k on conflict do nothing;
