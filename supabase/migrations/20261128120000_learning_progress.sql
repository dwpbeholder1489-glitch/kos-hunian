-- Progres pribadi. Tidak menyimpan data transaksi maupun fixture DEMO.
create table public.learning_progress (
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  track text not null check (track ~ '^[a-z0-9_/-]{1,100}$'),
  role text not null,
  version smallint not null check (version between 1 and 100),
  category text not null,
  done smallint[] not null default '{}',
  current_step smallint not null check (current_step between 0 and 7),
  started_at timestamptz not null default now(),
  touched_at timestamptz not null default now(),
  completed_at timestamptz,
  practice_count integer not null default 0 check (practice_count between 0 and 100000),
  attempts jsonb not null default '[]',
  primary key (kos_id, user_id, role, track, version),
  check (cardinality(done) <= 8 and done <@ array[0,1,2,3,4,5,6,7]::smallint[]),
  check (jsonb_typeof(attempts) = 'array' and jsonb_array_length(attempts) <= 50)
);

alter table public.learning_progress enable row level security;
revoke all on public.learning_progress from public, anon, authenticated;
grant select on public.learning_progress to authenticated;
create policy learning_progress_read on public.learning_progress for select to authenticated
  using (user_id = auth.uid() and public.member_role(kos_id) is not null);
create trigger zz_kos_open_guard before insert or update or delete on public.learning_progress
  for each row execute function public.kos_open_guard();

create function public.learning_progress_save(p_kos uuid, p_track text, p_version smallint, p_done smallint[],
  p_step smallint, p_started timestamptz, p_touched timestamptz, p_practice integer, p_attempts jsonb)
returns public.learning_progress language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_role text := public.member_role(p_kos);
  v_category text;
  v_attempt jsonb;
  v_result public.learning_progress;
begin
  if v_user is null or v_role is null then
    raise exception 'Progres ini hanya tersedia untuk anggota bisnis' using errcode = '42501';
  end if;
  if p_track is null or p_track !~ '^[a-z0-9_/-]{1,100}$' or p_version is null or p_version not between 1 and 100
     or p_step is null or p_step not between 0 and 7 or p_done is null or cardinality(p_done) > 8
     or not (p_done <@ array[0,1,2,3,4,5,6,7]::smallint[])
     or p_practice is null or p_practice not between 0 and 100000
     or p_started is null or p_touched is null or not isfinite(p_started) or not isfinite(p_touched)
     or p_started > p_touched or p_touched > now() + interval '10 minutes'
     or p_attempts is null or jsonb_typeof(p_attempts) <> 'array' then
    raise exception 'Data progres tidak valid' using errcode = '22023';
  end if;
  if jsonb_array_length(p_attempts) > 50 or octet_length(p_attempts::text) > 7500 then
    raise exception 'Riwayat evaluasi terlalu panjang' using errcode = '22023';
  end if;
  for v_attempt in select value from jsonb_array_elements(p_attempts) loop
    if jsonb_typeof(v_attempt) <> 'object' or jsonb_typeof(v_attempt->'at') is distinct from 'string'
      or coalesce(v_attempt->>'at', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
      or jsonb_typeof(v_attempt->'score') is distinct from 'number'
      or jsonb_typeof(v_attempt->'max') is distinct from 'number'
      or coalesce(v_attempt->>'score', '') !~ '^[0-8]$'
      or coalesce(v_attempt->>'max', '') !~ '^[1-8]$' then
      raise exception 'Hasil evaluasi tidak valid' using errcode = '22023';
    end if;
    if (v_attempt->>'score')::integer > (v_attempt->>'max')::integer then
      raise exception 'Nilai evaluasi melebihi jumlah soal' using errcode = '22023';
    end if;
  end loop;
  select coalesce(category_code, business_type, 'properti') into v_category from public.kos where id = p_kos;
  insert into public.learning_progress as progress
    (kos_id, user_id, track, role, version, category, done, current_step, started_at, touched_at, completed_at, practice_count, attempts)
  values (p_kos, v_user, p_track, v_role, p_version, v_category,
    array(select distinct value from unnest(p_done) value order by value), p_step, p_started, p_touched,
    case when p_done @> array[0,1,2,3,4,5,6,7]::smallint[] then now() end,
    p_practice,
    (select coalesce(jsonb_agg(jsonb_build_object('at', value->'at', 'score', value->'score', 'max', value->'max')), '[]'::jsonb)
      from jsonb_array_elements(p_attempts)))
  on conflict (kos_id, user_id, role, track, version) do update set
    done = array(select distinct value from unnest(progress.done || excluded.done) value order by value),
    current_step = case when excluded.touched_at >= progress.touched_at then excluded.current_step else progress.current_step end,
    started_at = least(progress.started_at, excluded.started_at),
    touched_at = greatest(progress.touched_at, excluded.touched_at),
    completed_at = coalesce(progress.completed_at,
      case when (progress.done || excluded.done) @> array[0,1,2,3,4,5,6,7]::smallint[] then now() end),
    practice_count = greatest(progress.practice_count, excluded.practice_count),
    attempts = (select coalesce(jsonb_agg(value order by value->>'at'), '[]'::jsonb) from (
      select distinct value, value->>'at' as attempted_at from jsonb_array_elements(progress.attempts || excluded.attempts)
      order by attempted_at desc, value desc limit 50
    ) recent)
  returning * into v_result;
  return v_result;
end $$;

revoke all on function public.learning_progress_save(uuid, text, smallint, smallint[], smallint, timestamptz, timestamptz, integer, jsonb) from public, anon;
grant execute on function public.learning_progress_save(uuid, text, smallint, smallint[], smallint, timestamptz, timestamptz, integer, jsonb) to authenticated;
