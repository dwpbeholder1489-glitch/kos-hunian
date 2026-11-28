-- Progres tur panduan interaktif (onboarding & "? Panduan" per modul), lintas perangkat.
-- HANYA metadata belajar milik akun: kunci tur, status, langkah terakhir. Tidak ada data bisnis,
-- dan mengulang tur tidak pernah menulis ke tabel operasional.
-- Sengaja TANPA zz_kos_open_guard (seperti notif_items): milik akun pembelajar, dan onboarding justru
-- dipakai saat bisnis masih DRAF. Bisnis yang DITUTUP ditolak di fungsi simpan (arsip hanya-baca).
create table public.learning_tours (
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  tour text not null check (tour ~ '^(onboarding|page:/[a-z0-9:/_-]{0,95})$'),
  status text not null check (status in ('active', 'paused', 'skipped', 'completed')),
  step smallint not null default 0 check (step between 0 and 60),
  steps smallint not null default 0 check (steps between 0 and 60),
  runs integer not null default 1 check (runs between 0 and 100000),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (kos_id, user_id, role, tour)
);

alter table public.learning_tours enable row level security;
revoke all on public.learning_tours from public, anon, authenticated;

-- Baca progres sendiri untuk bisnis & peran aktif.
create function public.learning_tour_list(p_kos uuid)
returns table (tour text, status text, step smallint, steps smallint, runs integer, completed_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.member_role(p_kos);
begin
  if auth.uid() is null or v_role is null then
    raise exception 'Progres panduan hanya tersedia untuk anggota bisnis' using errcode = '42501';
  end if;
  return query select t.tour, t.status, t.step, t.steps, t.runs, t.completed_at, t.updated_at
    from public.learning_tours t
    where t.kos_id = p_kos and t.user_id = auth.uid() and t.role = v_role
    order by t.updated_at desc limit 300;
end $$;

-- Simpan satu tur. Yang lebih baru (p_at) menang; p_at di masa depan > 10 menit ditolak.
create function public.learning_tour_save(p_kos uuid, p_tour text, p_status text, p_step smallint, p_steps smallint, p_runs integer, p_at timestamptz)
returns public.learning_tours language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_role text := public.member_role(p_kos);
  v_row public.learning_tours;
  v_count integer;
begin
  if v_user is null or v_role is null then
    raise exception 'Progres panduan hanya tersedia untuk anggota bisnis' using errcode = '42501';
  end if;
  if exists (select 1 from public.kos where id = p_kos and closed_at is not null) then
    raise exception 'Bisnis ini sudah ditutup (arsip hanya-baca).' using errcode = '42501';
  end if;
  if p_tour is null or p_tour !~ '^(onboarding|page:/[a-z0-9:/_-]{0,95})$'
     or p_status is null or p_status not in ('active', 'paused', 'skipped', 'completed')
     or p_step is null or p_step not between 0 and 60 or p_steps is null or p_steps not between 0 and 60
     or p_runs is null or p_runs not between 0 and 100000
     or p_at is null or not isfinite(p_at) or p_at > now() + interval '10 minutes' then
    raise exception 'Data progres panduan tidak valid' using errcode = '22023';
  end if;
  select count(*) into v_count from public.learning_tours
    where kos_id = p_kos and user_id = v_user and role = v_role and tour <> p_tour;
  if v_count >= 300 then
    raise exception 'Terlalu banyak catatan panduan untuk bisnis ini' using errcode = '22023';
  end if;
  insert into public.learning_tours as t (kos_id, user_id, role, tour, status, step, steps, runs, completed_at, updated_at)
  values (p_kos, v_user, v_role, p_tour, p_status, p_step, p_steps, p_runs,
    case when p_status = 'completed' then p_at end, p_at)
  on conflict (kos_id, user_id, role, tour) do update set
    status = case when excluded.updated_at >= t.updated_at then excluded.status else t.status end,
    step = case when excluded.updated_at >= t.updated_at then excluded.step else t.step end,
    steps = case when excluded.updated_at >= t.updated_at then excluded.steps else t.steps end,
    runs = greatest(t.runs, excluded.runs),
    completed_at = coalesce(t.completed_at, excluded.completed_at),
    updated_at = greatest(t.updated_at, excluded.updated_at)
  returning * into v_row;
  return v_row;
end $$;

-- Atur ulang progres sendiri (semua tur, atau satu tur). Tidak menyentuh data bisnis.
create function public.learning_tour_reset(p_kos uuid, p_tour text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_role text := public.member_role(p_kos); v_n integer;
begin
  if auth.uid() is null or v_role is null then
    raise exception 'Progres panduan hanya tersedia untuk anggota bisnis' using errcode = '42501';
  end if;
  delete from public.learning_tours
    where kos_id = p_kos and user_id = auth.uid() and role = v_role and (p_tour is null or tour = p_tour);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.learning_tour_list(uuid) from public, anon;
revoke all on function public.learning_tour_save(uuid, text, text, smallint, smallint, integer, timestamptz) from public, anon;
revoke all on function public.learning_tour_reset(uuid, text) from public, anon;
grant execute on function public.learning_tour_list(uuid) to authenticated;
grant execute on function public.learning_tour_save(uuid, text, text, smallint, smallint, integer, timestamptz) to authenticated;
grant execute on function public.learning_tour_reset(uuid, text) to authenticated;
