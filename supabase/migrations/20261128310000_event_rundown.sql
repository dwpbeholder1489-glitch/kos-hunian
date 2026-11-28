-- Event Tahap B — Rundown & Jadwal (Master Prompt Event §11; Blueprint §5.5 Rundown Management & §5.8 Event execution; EVT-016).
-- Rundown = sumber jadwal operasional per event (bukan sekadar dokumen cetak):
--   * item: hari, jam mulai, durasi/jam selesai, lokasi/stage, aktivitas, deskripsi, PIC (anggota bisnis), pengisi acara/pembicara,
--     technical cue, kebutuhan alat, catatan, status pelaksanaan (rencana/siap/berjalan/selesai/dilewati) + waktu nyata & pelakunya;
--   * riwayat versi (simpan versi bernomor, lihat & pulihkan); setiap perubahan saat acara tercatat di riwayat (domain_events);
--   * geser jadwal (acara molor) untuk item berikutnya; peringatan PIC bentrok di event lain (tidak memblokir);
--   * agenda harian lintas event untuk Jadwal & Tim.
-- Checklist persiapan = Tugas proyek yang sudah ada (tanpa tabel baru). Paket: bagian inti event (fitur `proyek`, Paket Dasar).

-- ---------- 1) Tabel ----------
create table if not exists public.prj_rundown_items (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  project_id uuid not null references public.prj_projects(id) on delete cascade,
  day date not null,
  start_time time not null,
  duration_min int check (duration_min is null or duration_min between 0 and 1440),
  title text not null check (length(trim(title)) between 2 and 200),
  description text check (description is null or length(description) <= 2000),
  location text check (location is null or length(location) <= 120),
  pic_user uuid references auth.users(id) on delete set null,
  performer text check (performer is null or length(performer) <= 200),
  cue text check (cue is null or length(cue) <= 500),
  equipment text check (equipment is null or length(equipment) <= 500),
  note text check (note is null or length(note) <= 1000),
  status text not null default 'rencana' check (status in ('rencana', 'siap', 'berjalan', 'selesai', 'dilewati')),
  actual_start timestamptz, actual_end timestamptz, status_by uuid,
  sort int not null default 0,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists prj_rundown_project on public.prj_rundown_items(project_id, day, start_time, sort);
create index if not exists prj_rundown_kos_day on public.prj_rundown_items(kos_id, day);
create index if not exists prj_rundown_pic on public.prj_rundown_items(kos_id, pic_user, day) where pic_user is not null;

create table if not exists public.prj_rundown_versions (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  project_id uuid not null references public.prj_projects(id) on delete cascade,
  version int not null,
  note text check (note is null or length(note) <= 300),
  items jsonb not null default '[]',
  items_hash text not null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  unique (project_id, version)
);

do $$ declare t text; begin
  foreach t in array array['prj_rundown_items', 'prj_rundown_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

-- ---------- 2) Pesan paket (sejak E3 Proyek inti = Paket Dasar), akses PIC rundown, label riwayat ----------
create or replace function public.prj_guard(p_kos uuid, p_write boolean)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if not module_on(p_kos, 'u_proyek') then raise exception 'Modul Proyek belum aktif (Konfigurasi › Modul)'; end if;
  if p_write and not plan_has(p_kos, 'proyek') then
    raise exception 'BATAS_PAKET: Proyek & event tersedia mulai Paket Dasar. Yang sudah ada tetap bisa dibuka, diselesaikan, atau dibatalkan.';
  end if;
end $$;

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

-- PIC item rundown (mis. kru, MC) ikut melihat event itu — sama seperti penanggung jawab tugas
do $$ declare f text; begin
  foreach f in array array['public.prj_access(uuid)', 'public.prj_list(uuid)', 'public.event_home(uuid,date)', 'public.event_schedule(uuid,date)'] loop
    perform public._prasara_patch(f,
      'or exists (select 1 from prj_tasks t where t.project_id = p.id and t.assignee_user = auth.uid())',
      'or exists (select 1 from prj_tasks t where t.project_id = p.id and t.assignee_user = auth.uid())
           or exists (select 1 from prj_rundown_items r where r.project_id = p.id and r.pic_user = auth.uid())');
  end loop;
end $$;

select public._prasara_patch('public.event_label(text)',
  'when ''ProjectMemberChanged'' then ''Anggota proyek''',
  'when ''ProjectMemberChanged'' then ''Anggota proyek'' when ''RundownChanged'' then ''Rundown diubah''
    when ''RundownStatus'' then ''Pelaksanaan rundown'' when ''RundownVersion'' then ''Versi rundown''');
drop function public._prasara_patch(text, text, text);

-- ---------- 3) Inti ----------
create or replace function public.prj_rundown_end(p_start time, p_dur int)
returns time language sql immutable as $$
  select case when p_dur is null then null else (p_start + make_interval(mins => p_dur))::time end;
$$;

-- Bentuk item untuk tampilan & snapshot versi
create or replace function public.prj_rundown_row(r prj_rundown_items)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', r.id, 'day', r.day, 'start_time', to_char(r.start_time, 'HH24:MI'), 'duration_min', r.duration_min,
    'end_time', to_char(prj_rundown_end(r.start_time, r.duration_min), 'HH24:MI'), 'title', r.title, 'description', r.description,
    'location', r.location, 'pic_user', r.pic_user, 'pic', prj_user_label(r.pic_user), 'performer', r.performer, 'cue', r.cue,
    'equipment', r.equipment, 'note', r.note, 'status', r.status, 'actual_start', r.actual_start, 'actual_end', r.actual_end,
    'status_by', prj_user_label(r.status_by), 'sort', r.sort);
$$;

-- Isi rundown yang dibandingkan antar versi (tanpa status pelaksanaan & waktu nyata)
create or replace function public.prj_rundown_hash(p_project uuid)
returns text language sql stable security definer set search_path = public as $$
  select md5(coalesce(string_agg(concat_ws('|', day, start_time, duration_min, title, description, location, pic_user, performer, cue, equipment, note),
    '¶' order by day, start_time, sort, id), ''))
  from prj_rundown_items where project_id = p_project;
$$;

-- Validasi & simpan satu item (tanpa cek akses; dipakai save/bulk/restore)
create or replace function public.prj_rundown_put(p prj_projects, p_id uuid, d jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); v_day date; v_start time; v_end time; v_dur int; v_pic uuid;
        v_title text := trim(coalesce(d->>'title', '')); v_old prj_rundown_items;
begin
  if p_id is not null then
    select * into v_old from prj_rundown_items where id = p_id;
    if v_old.id is null or v_old.project_id <> p.id then raise exception 'Item rundown tidak ditemukan'; end if;
  end if;
  begin
    v_day := coalesce(nullif(d->>'day', '')::date, v_old.day, p.start_date);
    v_start := nullif(d->>'start_time', '')::time;
    v_end := nullif(d->>'end_time', '')::time;
    v_dur := nullif(d->>'duration_min', '')::int;
  exception when others then raise exception 'Tanggal / jam / durasi tidak valid';
  end;
  if v_day is null then raise exception 'Isi tanggal item rundown (event belum punya tanggal)'; end if;
  if v_start is null then raise exception 'Isi jam mulai'; end if;
  if length(v_title) < 2 then raise exception 'Isi nama kegiatan'; end if;
  -- jam selesai menang atas durasi; lewat tengah malam (mis. 23:00–01:00) = hari berikutnya
  if v_end is not null then
    v_dur := (extract(epoch from (v_end - v_start))::int / 60 + 1440) % 1440;
  end if;
  if v_dur is not null and (v_dur < 0 or v_dur > 1440) then raise exception 'Durasi 0–1440 menit'; end if;
  if nullif(d->>'pic_user', '') is not null then
    v_pic := (d->>'pic_user')::uuid;
    if not exists (select 1 from kos_members m where m.kos_id = p.kos_id and m.user_id = v_pic) and v_pic <> (select owner_id from kos where id = p.kos_id) then
      -- pemulihan versi lama: PIC yang sudah keluar dari tim dikosongkan, bukan menggagalkan pemulihan
      if coalesce((d->>'_restore')::boolean, false) then v_pic := null; else raise exception 'PIC harus anggota tim bisnis ini'; end if;
    end if;
  end if;
  insert into prj_rundown_items(id, kos_id, project_id, day, start_time, duration_min, title, description, location, pic_user, performer, cue, equipment, note, sort)
  values (v_id, p.kos_id, p.id, v_day, v_start, v_dur, v_title, nullif(trim(d->>'description'), ''), nullif(trim(d->>'location'), ''), v_pic,
          nullif(trim(d->>'performer'), ''), nullif(trim(d->>'cue'), ''), nullif(trim(d->>'equipment'), ''), nullif(trim(d->>'note'), ''),
          coalesce(nullif(d->>'sort', '')::int, 0))
  on conflict (id) do update set day = excluded.day, start_time = excluded.start_time, duration_min = excluded.duration_min, title = excluded.title,
    description = excluded.description, location = excluded.location, pic_user = excluded.pic_user, performer = excluded.performer, cue = excluded.cue,
    equipment = excluded.equipment, note = excluded.note, sort = case when d ? 'sort' then excluded.sort else prj_rundown_items.sort end, updated_at = now();
  return v_id;
end $$;

create or replace function public.prj_rundown_kelola(p_project uuid, p_write boolean)
returns prj_projects language plpgsql security definer set search_path = public as $$
declare p prj_projects;
begin
  select * into p from prj_projects where id = p_project;
  if p.id is null or prj_access(p.id) is distinct from 'kelola' then raise exception 'Hanya pemilik, pengelola, atau PIC event yang bisa mengubah rundown'; end if;
  perform prj_guard(p.kos_id, p_write);
  return p;
end $$;

-- ---------- 4) RPC ----------
create or replace function public.prj_rundown(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p prj_projects; v_acc text; v_last prj_rundown_versions;
begin
  select * into p from prj_projects where id = p_project;
  v_acc := prj_access(p_project);
  if p.id is null or v_acc is null then raise exception 'Event tidak ditemukan'; end if;
  perform prj_guard(p.kos_id, false);
  select * into v_last from prj_rundown_versions where project_id = p.id order by version desc limit 1;
  return jsonb_build_object(
    'access', v_acc, 'allowed', plan_has(p.kos_id, 'proyek'), 'me', auth.uid(),
    'business', (select jsonb_build_object('name', k.name, 'address', k.address, 'phone', k.contact_phone, 'logo', k.profile->>'logo_path') from kos k where k.id = p.kos_id),
    'can_edit', v_acc = 'kelola' and plan_has(p.kos_id, 'proyek'),
    'now', to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI'),
    'project', jsonb_build_object('id', p.id, 'number', p.number, 'name', p.name, 'status', p.status, 'start_date', p.start_date, 'end_date', p.end_date,
      'start_time', to_char(p.start_time, 'HH24:MI'), 'end_time', to_char(p.end_time, 'HH24:MI'), 'location', p.location, 'client', (select name from contacts where id = p.contact_id)),
    'items', (select coalesce(jsonb_agg(prj_rundown_row(r) || jsonb_build_object(
        'can_status', v_acc = 'kelola' or coalesce(r.pic_user = auth.uid(), false),
        'out_of_range', p.start_date is not null and (r.day < p.start_date or r.day > coalesce(p.end_date, p.start_date)),
        -- PIC yang sama di event lain pada jam yang bertumpuk (peringatan, tidak memblokir)
        'clash', (select coalesce(jsonb_agg(jsonb_build_object('project', o.name, 'title', x.title, 'start_time', to_char(x.start_time, 'HH24:MI'))), '[]')
                  from prj_rundown_items x join prj_projects o on o.id = x.project_id
                  where r.pic_user is not null and x.kos_id = r.kos_id and x.pic_user = r.pic_user and x.project_id <> r.project_id
                    and x.day = r.day and o.status not in ('batal') and x.status <> 'dilewati'
                    and x.start_time < coalesce(prj_rundown_end(r.start_time, r.duration_min), r.start_time + interval '1 minute')
                    and r.start_time < coalesce(prj_rundown_end(x.start_time, x.duration_min), x.start_time + interval '1 minute')))
        order by r.day, r.start_time, r.sort, r.created_at), '[]') from prj_rundown_items r where r.project_id = p.id),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'version', v.version, 'note', v.note, 'at', v.created_at,
                   'by', prj_user_label(v.created_by), 'count', jsonb_array_length(v.items)) order by v.version desc), '[]')
                 from prj_rundown_versions v where v.project_id = p.id),
    'changed', exists (select 1 from prj_rundown_items where project_id = p.id) and (v_last.id is null or v_last.items_hash <> prj_rundown_hash(p.id)),
    'team', case when v_acc = 'kelola' then (select coalesce(jsonb_agg(jsonb_build_object('user_id', u, 'name', prj_user_label(u)) order by prj_user_label(u)), '[]')
              from (select k.owner_id u from kos k where k.id = p.kos_id union select m.user_id from kos_members m where m.kos_id = p.kos_id) z) else '[]'::jsonb end);
end $$;

create or replace function public.prj_rundown_save(p_project uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare pr prj_projects; v_id uuid;
begin
  pr := prj_rundown_kelola(p_project, true);
  v_id := prj_rundown_put(pr, p_id, coalesce(p, '{}'::jsonb));
  perform prj_emit(pr.id, 'RundownChanged', v_id::text || ':' || extract(epoch from clock_timestamp())::text,
    'Rundown ' || case when p_id is null then 'ditambah' else 'diubah' end || ': ' || (select to_char(start_time, 'HH24:MI') || ' ' || title from prj_rundown_items where id = v_id), '{}'::jsonb);
  return v_id;
end $$;

-- Banyak item sekaligus (kerangka per jenis event / salin hari). Maks 100 item per kirim.
create or replace function public.prj_rundown_bulk(p_project uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare pr prj_projects; e jsonb; n int := 0;
begin
  pr := prj_rundown_kelola(p_project, true);
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Daftar item kosong'; end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'Maks. 100 item sekali tambah'; end if;
  for e in select * from jsonb_array_elements(p_items) loop
    perform prj_rundown_put(pr, null, e - 'id');
    n := n + 1;
  end loop;
  perform prj_emit(pr.id, 'RundownChanged', pr.id::text || ':bulk:' || extract(epoch from clock_timestamp())::text, 'Rundown: ' || n || ' item ditambahkan', '{}'::jsonb);
  return n;
end $$;

create or replace function public.prj_rundown_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r prj_rundown_items; pr prj_projects;
begin
  select * into r from prj_rundown_items where id = p_id;
  if r.id is null then raise exception 'Item rundown tidak ditemukan'; end if;
  pr := prj_rundown_kelola(r.project_id, true);
  delete from prj_rundown_items where id = r.id;
  perform prj_emit(pr.id, 'RundownChanged', r.id::text || ':hapus', 'Rundown dihapus: ' || to_char(r.start_time, 'HH24:MI') || ' ' || r.title, '{}'::jsonb);
end $$;

-- Acara molor/maju: geser item di hari itu mulai jam tertentu (yang belum selesai/dilewati). Boleh saat paket turun (operasional hari-H).
create or replace function public.prj_rundown_shift(p_project uuid, p_day date, p_from time, p_minutes int)
returns int language plpgsql security definer set search_path = public as $$
declare pr prj_projects; n int;
begin
  pr := prj_rundown_kelola(p_project, false);
  if p_minutes is null or p_minutes = 0 or abs(p_minutes) > 720 then raise exception 'Geser 1–720 menit (maju atau mundur)'; end if;
  if exists (select 1 from prj_rundown_items where project_id = pr.id and day = p_day and start_time >= p_from and status not in ('selesai', 'dilewati')
             and (extract(epoch from start_time)::int / 60 + p_minutes) not between 0 and 1439) then
    raise exception 'Pergeseran melewati pergantian hari. Ubah tanggal item tersebut secara manual.';
  end if;
  update prj_rundown_items set start_time = start_time + make_interval(mins => p_minutes), updated_at = now()
  where project_id = pr.id and day = p_day and start_time >= p_from and status not in ('selesai', 'dilewati');
  get diagnostics n = row_count;
  perform prj_emit(pr.id, 'RundownChanged', pr.id::text || ':geser:' || extract(epoch from clock_timestamp())::text,
    'Rundown ' || to_char(p_day, 'DD/MM') || ' digeser ' || case when p_minutes > 0 then '+' else '' end || p_minutes || ' menit mulai ' || to_char(p_from, 'HH24:MI') || ' (' || n || ' item)', '{}'::jsonb);
  return n;
end $$;

-- Pelaksanaan (rundown live): pengelola/PIC event, atau PIC item itu. Dicatat waktu & pelakunya. Boleh saat paket turun.
create or replace function public.prj_rundown_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r prj_rundown_items; v_acc text;
begin
  select * into r from prj_rundown_items where id = p_id;
  if r.id is null then raise exception 'Item rundown tidak ditemukan'; end if;
  v_acc := prj_access(r.project_id);
  if not (coalesce(v_acc = 'kelola', false) or (coalesce(r.pic_user = auth.uid(), false) and is_member(r.kos_id))) then
    raise exception 'Hanya PIC item ini atau pengelola event yang bisa mengubah status pelaksanaan';
  end if;
  perform prj_guard(r.kos_id, false);
  if p_status not in ('rencana', 'siap', 'berjalan', 'selesai', 'dilewati') then raise exception 'Status tidak dikenal'; end if;
  update prj_rundown_items set status = p_status, status_by = auth.uid(), updated_at = now(),
    actual_start = case when p_status = 'berjalan' then coalesce(actual_start, now()) when p_status in ('rencana', 'siap') then null else actual_start end,
    actual_end = case when p_status in ('selesai', 'dilewati') then now() else null end
  where id = r.id returning * into r;
  perform prj_emit(r.project_id, 'RundownStatus', r.id::text || ':' || p_status || ':' || extract(epoch from clock_timestamp())::text,
    to_char(r.start_time, 'HH24:MI') || ' ' || r.title || ' → ' || case p_status when 'rencana' then 'rencana' when 'siap' then 'siap'
      when 'berjalan' then 'berjalan' when 'selesai' then 'selesai' else 'dilewati' end, '{}'::jsonb);
  return prj_rundown_row(r);
end $$;

-- ---------- 5) Versi ----------
create or replace function public.prj_rundown_snap(pr prj_projects, p_note text)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  perform pg_advisory_xact_lock(hashtext('rundown_ver:' || pr.id::text));
  select coalesce(max(version), 0) + 1 into v from prj_rundown_versions where project_id = pr.id;
  insert into prj_rundown_versions(kos_id, project_id, version, note, items, items_hash)
  values (pr.kos_id, pr.id, v, nullif(left(trim(coalesce(p_note, '')), 300), ''),
          (select coalesce(jsonb_agg(prj_rundown_row(r) - 'status' - 'actual_start' - 'actual_end' - 'status_by' order by r.day, r.start_time, r.sort, r.created_at), '[]')
           from prj_rundown_items r where r.project_id = pr.id),
          prj_rundown_hash(pr.id));
  return v;
end $$;

create or replace function public.prj_rundown_version_save(p_project uuid, p_note text)
returns int language plpgsql security definer set search_path = public as $$
declare pr prj_projects; v int;
begin
  pr := prj_rundown_kelola(p_project, false);
  if not exists (select 1 from prj_rundown_items where project_id = pr.id) then raise exception 'Rundown masih kosong'; end if;
  if exists (select 1 from prj_rundown_versions where project_id = pr.id and version = (select max(version) from prj_rundown_versions where project_id = pr.id)
             and items_hash = prj_rundown_hash(pr.id)) then
    raise exception 'Tidak ada perubahan sejak versi terakhir';
  end if;
  v := prj_rundown_snap(pr, p_note);
  perform prj_emit(pr.id, 'RundownVersion', pr.id::text || ':v' || v, 'Rundown versi ' || v || coalesce(' · ' || nullif(trim(p_note), ''), ''), '{}'::jsonb);
  return v;
end $$;

create or replace function public.prj_rundown_version_get(p_version uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v prj_rundown_versions;
begin
  select * into v from prj_rundown_versions where id = p_version;
  if v.id is null or prj_access(v.project_id) is null then raise exception 'Versi tidak ditemukan'; end if;
  perform prj_guard(v.kos_id, false);
  return jsonb_build_object('id', v.id, 'version', v.version, 'note', v.note, 'at', v.created_at, 'by', prj_user_label(v.created_by), 'items', v.items);
end $$;

-- Pulihkan: isi sekarang yang belum disimpan dijadikan versi dulu, lalu item diganti dari versi lama (status kembali rencana)
create or replace function public.prj_rundown_restore(p_version uuid, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare v prj_rundown_versions; pr prj_projects; e jsonb; nv int;
begin
  select * into v from prj_rundown_versions where id = p_version;
  if v.id is null then raise exception 'Versi tidak ditemukan'; end if;
  pr := prj_rundown_kelola(v.project_id, true);
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasan pemulihan (min. 3 huruf)'; end if;
  if exists (select 1 from prj_rundown_items where project_id = pr.id)
     and not exists (select 1 from prj_rundown_versions where project_id = pr.id and items_hash = prj_rundown_hash(pr.id)
                     and version = (select max(version) from prj_rundown_versions where project_id = pr.id)) then
    perform prj_rundown_snap(pr, 'Otomatis: isi sebelum dipulihkan ke versi ' || v.version);
  end if;
  delete from prj_rundown_items where project_id = pr.id;
  for e in select * from jsonb_array_elements(v.items) loop
    perform prj_rundown_put(pr, null, (e - 'id' - 'pic' - 'end_time') || '{"_restore":true}'::jsonb);
  end loop;
  nv := prj_rundown_snap(pr, 'Dipulihkan dari versi ' || v.version || ': ' || trim(p_reason));
  perform prj_emit(pr.id, 'RundownVersion', pr.id::text || ':pulih:' || nv, 'Rundown dipulihkan dari versi ' || v.version || ' → versi ' || nv || ' · ' || trim(p_reason), '{}'::jsonb);
  return nv;
end $$;

-- ---------- 6) Agenda harian lintas event (Jadwal & Tim) ----------
create or replace function public.event_agenda(p_kos uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_day date := coalesce(p_day, (now() at time zone 'Asia/Jakarta')::date);
begin
  perform prj_guard(p_kos, false);
  return jsonb_build_object('day', v_day,
    'items', (select coalesce(jsonb_agg(prj_rundown_row(r) || jsonb_build_object('project_id', p.id, 'project', p.name,
                'can_status', coalesce(prj_access(p.id) = 'kelola', false) or coalesce(r.pic_user = auth.uid(), false))
              order by r.start_time, p.name, r.sort), '[]')
              from prj_rundown_items r join prj_projects p on p.id = r.project_id
              where r.kos_id = p_kos and r.day = v_day and p.status <> 'batal' and prj_access(p.id) is not null));
end $$;

-- ---------- 7) Hak eksekusi ----------
revoke execute on function public.prj_rundown_put(prj_projects, uuid, jsonb), public.prj_rundown_kelola(uuid, boolean),
  public.prj_rundown_snap(prj_projects, text), public.prj_rundown_row(prj_rundown_items), public.prj_rundown_hash(uuid) from public, anon, authenticated;
revoke execute on function public.prj_rundown(uuid), public.prj_rundown_save(uuid, uuid, jsonb), public.prj_rundown_bulk(uuid, jsonb),
  public.prj_rundown_delete(uuid), public.prj_rundown_shift(uuid, date, time, int), public.prj_rundown_status(uuid, text),
  public.prj_rundown_version_save(uuid, text), public.prj_rundown_version_get(uuid), public.prj_rundown_restore(uuid, text),
  public.event_agenda(uuid, date) from public, anon;
grant execute on function public.prj_rundown(uuid), public.prj_rundown_save(uuid, uuid, jsonb), public.prj_rundown_bulk(uuid, jsonb),
  public.prj_rundown_delete(uuid), public.prj_rundown_shift(uuid, date, time, int), public.prj_rundown_status(uuid, text),
  public.prj_rundown_version_save(uuid, text), public.prj_rundown_version_get(uuid), public.prj_rundown_restore(uuid, text),
  public.event_agenda(uuid, date) to authenticated;
