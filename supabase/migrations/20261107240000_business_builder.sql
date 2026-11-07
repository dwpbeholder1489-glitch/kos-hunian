-- PRASARA · Business Builder (tahap 1): bisnis kustom yang dibangun sendiri dari aplikasi.
-- Jenis data (objek) + Custom Field Builder + Workflow Builder (status, transisi, peran, persetujuan, batas waktu)
-- + Report Builder (metrik tervalidasi) + Preview/Validasi/Aktivasi. Tanpa SQL/kode bebas dari pengguna:
-- semua tipe, aturan, dan laporan dijalankan oleh fungsi server yang tervalidasi (blueprint bagian 7).

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

alter table public.kos drop constraint if exists kos_business_type_check;
alter table public.kos add constraint kos_business_type_check check (business_type in ('properti', 'retail', 'jasa', 'kustom'));

create or replace function public.team_roles(p_type text)
returns text[] language sql immutable as $$
  select case when p_type = 'retail' then array['pengelola', 'kasir', 'gudang']
              when p_type = 'jasa' then array['pengelola', 'kasir', 'operator', 'gudang']
              when p_type = 'kustom' then array['pengelola', 'operator']
              else array['pengelola', 'penjaga'] end;
$$;

-- ================= Tabel =================
create table if not exists public.bb_workspace (
  kos_id uuid primary key references public.kos(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'aktif')),
  template text not null default 'kosong',
  template_version int not null default 1,
  description text check (description is null or length(description) <= 500),
  revenue_model text check (revenue_model is null or length(revenue_model) <= 200),
  main_process text check (main_process is null or length(main_process) <= 300),
  locations text check (locations is null or length(locations) <= 200),
  activated_at timestamptz,
  activated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.bb_objects (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null check (length(trim(name)) between 2 and 40),
  prefix text not null default 'DAT' check (prefix ~ '^[A-Z]{2,5}$'),
  icon text not null default '📋' check (length(icon) <= 8),
  title_field text,
  workflow boolean not null default true,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kos_id, key)
);

create table if not exists public.bb_fields (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  object_id uuid not null references public.bb_objects(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  label text not null check (length(trim(label)) between 1 and 60),
  type text not null check (type in ('text', 'longtext', 'number', 'currency', 'date', 'datetime', 'select', 'multiselect', 'boolean', 'phone', 'reference')),
  help text check (help is null or length(help) <= 200),
  required boolean not null default false,
  choices text[] not null default '{}',
  min_value numeric,
  max_value numeric,
  default_value text check (default_value is null or length(default_value) <= 200),
  ref_object uuid references public.bb_objects(id) on delete restrict,
  in_list boolean not null default true,
  searchable boolean not null default false,
  filterable boolean not null default false,
  hidden_roles text[] not null default '{}',
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (object_id, key)
);

create table if not exists public.bb_statuses (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  object_id uuid not null references public.bb_objects(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 40),
  tone text not null default 'info' check (tone in ('info', 'gold', 'good', 'bad', 'void')),
  is_initial boolean not null default false,
  is_final boolean not null default false,
  sla_hours int check (sla_hours is null or sla_hours between 1 and 8760),
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists public.bb_transitions (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  object_id uuid not null references public.bb_objects(id) on delete cascade,
  from_status uuid references public.bb_statuses(id) on delete cascade, -- null = dari status mana pun yang belum final
  to_status uuid not null references public.bb_statuses(id) on delete cascade,
  roles text[] not null default '{}',            -- kosong = semua yang punya akses; pemilik selalu boleh
  require_note boolean not null default false,
  require_approval boolean not null default false -- selain pemilik: lewat Persetujuan
);

create table if not exists public.bb_records (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  object_id uuid not null references public.bb_objects(id) on delete restrict,
  number text not null,
  title text not null default '',
  status_id uuid references public.bb_statuses(id) on delete restrict,
  status_since timestamptz not null default now(),
  data jsonb not null default '{}',
  assigned_to text,
  archived_at timestamptz,
  archive_reason text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kos_id, number)
);
create index if not exists bb_records_obj on public.bb_records(object_id, created_at desc);
create index if not exists bb_records_status on public.bb_records(status_id);

create table if not exists public.bb_events (
  id bigserial primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  record_id uuid not null references public.bb_records(id) on delete cascade,
  kind text not null,
  text text not null,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists bb_events_rec on public.bb_events(record_id, created_at);

create table if not exists public.bb_reports (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  object_id uuid not null references public.bb_objects(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  metric text not null default 'count' check (metric in ('count', 'sum', 'avg')),
  field_key text,
  group_by text not null default 'status' check (group_by ~ '^(status|month|day|none|field:[a-z][a-z0-9_]{1,30})$'),
  period_days int check (period_days is null or period_days between 1 and 3660),
  filter_status uuid references public.bb_statuses(id) on delete set null,
  sort int not null default 0
);

-- Konfigurasi boleh dibaca anggota (tanpa isi catatan). Catatan hanya lewat fungsi (menyaring kolom tersembunyi per peran).
alter table public.bb_workspace enable row level security;
do $$ declare t text; begin
  foreach t in array array['bb_objects', 'bb_fields', 'bb_statuses', 'bb_transitions', 'bb_reports', 'bb_records', 'bb_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
  foreach t in array array['bb_objects', 'bb_fields', 'bb_statuses', 'bb_transitions', 'bb_reports'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (public.is_member(kos_id))', t || '_select', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
drop policy if exists bb_workspace_select on public.bb_workspace;
create policy bb_workspace_select on public.bb_workspace for select using (public.is_member(kos_id));
grant select on public.bb_workspace to authenticated;
drop trigger if exists zz_kos_open_guard on public.bb_workspace;
create trigger zz_kos_open_guard before insert or update or delete on public.bb_workspace for each row execute function public.kos_open_guard();

-- ================= Modul & persetujuan =================
insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, sort) values
  ('k_dashboard', 'Dashboard bisnis kustom', 'Ringkasan catatan per status, tugas saya, dan yang lewat batas waktu.', '{kustom}', true, '{}', null, '{/kerja}', 'Catatan & status', 'available', 1),
  ('k_catatan', 'Catatan & alur kerja', 'Formulir sesuai field buatan sendiri dengan status dan alur yang diatur di Business Builder.', '{kustom}', true, '{}', null, '{/catatan}', 'Catatan kustom', 'available', 2),
  ('k_laporan', 'Laporan kustom', 'Laporan dari Report Builder: jumlah, total, rata-rata per status/bulan/field.', '{kustom}', true, '{k_catatan}', null, '{/laporan-kustom}', 'Catatan kustom', 'available', 3),
  ('k_builder', 'Business Builder', 'Atur jenis data, field, status, alur, peran, dan laporan; validasi lalu aktifkan.', '{kustom}', true, '{}', null, '{/builder}', 'Konfigurasi bisnis', 'available', 4)
on conflict (code) do nothing;
update public.modules set applies_to = applies_to || '{kustom}'::text[] where code in ('u_karyawan') and not ('kustom' = any(applies_to));
update public.approval_actions set applies_to = applies_to || '{kustom}'::text[] where code in ('ubah_modul') and not ('kustom' = any(applies_to));
insert into public.approval_actions(code, label, risk, request_area, default_required, applies_to, sort) values
  ('bb_pindah_status', 'Memindahkan status catatan (langkah yang butuh persetujuan)', 'menengah', 'ops', true, '{kustom}', 1)
on conflict (code) do nothing;

-- ================= Bantuan =================
create or replace function public.bb_slug(p text)
returns text language sql immutable as $$
  select left(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), 30);
$$;

create or replace function public.bb_role(p_kos uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from kos where id = p_kos and owner_id = auth.uid()) then 'pemilik'
              else (select role from kos_members where kos_id = p_kos and user_id = auth.uid() limit 1) end;
$$;

create or replace function public.bb_kustom(p_kos uuid, p_area text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if (select business_type from kos where id = p_kos) is distinct from 'kustom' then raise exception 'Menu ini untuk bisnis kustom (Business Builder)'; end if;
  if not member_in(p_area, p_kos) then raise exception 'Tidak punya akses untuk tindakan ini'; end if;
end $$;

create or replace function public.bb_event(p_record uuid, p_kind text, p_text text)
returns void language sql security definer set search_path = public as $$
  insert into bb_events(kos_id, record_id, kind, text, actor) select kos_id, id, p_kind, left(p_text, 1000), coalesce(actor_email(), 'sistem') from bb_records where id = p_record;
$$;

-- ================= Konfigurasi (pemilik/pengelola: area settings) =================
create or replace function public.bb_workspace_save(p_kos uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_old jsonb;
begin
  perform bb_kustom(p_kos, 'settings');
  select to_jsonb(w) into v_old from bb_workspace w where kos_id = p_kos;
  update bb_workspace set description = nullif(trim(p->>'description'), ''), revenue_model = nullif(trim(p->>'revenue_model'), ''),
    main_process = nullif(trim(p->>'main_process'), ''), locations = nullif(trim(p->>'locations'), ''), updated_at = now() where kos_id = p_kos;
  if p ? 'name' and length(trim(p->>'name')) >= 2 then update kos set name = trim(p->>'name') where id = p_kos; end if;
  perform config_log(p_kos, 'builder_profil', 'Profil bisnis', v_old, p, null, 'rendah', actor_email());
end $$;

create or replace function public.bb_object_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; v_key text; v_old jsonb; v_prefix text;
begin
  perform bb_kustom(p_kos, 'settings');
  if coalesce(length(trim(p->>'name')), 0) < 2 then raise exception 'Isi nama jenis data (mis. Servis)'; end if;
  v_prefix := upper(left(regexp_replace(coalesce(nullif(p->>'prefix', ''), trim(p->>'name')), '[^A-Za-z]', '', 'g'), 3));
  if length(v_prefix) < 2 then v_prefix := 'DAT'; end if;
  if v_id is null then
    if (select count(*) from bb_objects where kos_id = p_kos and active) >= 12 then raise exception 'Maksimal 12 jenis data per bisnis'; end if;
    v_key := bb_slug(p->>'name');
    if v_key !~ '^[a-z]' then v_key := 'data_' || v_key; end if;
    v_key := left(v_key, 24);
    if exists (select 1 from bb_objects where kos_id = p_kos and key = v_key) then v_key := left(v_key, 20) || '_' || (select count(*) + 1 from bb_objects where kos_id = p_kos); end if;
    insert into bb_objects(kos_id, key, name, prefix, icon, workflow, sort)
    values (p_kos, v_key, trim(p->>'name'), v_prefix, coalesce(nullif(p->>'icon', ''), '📋'), coalesce((p->>'workflow')::boolean, true),
            (select coalesce(max(sort), 0) + 1 from bb_objects where kos_id = p_kos)) returning id into v_id;
  else
    select to_jsonb(o) into v_old from bb_objects o where id = v_id and kos_id = p_kos;
    if v_old is null then raise exception 'Jenis data tidak ditemukan'; end if;
    if p ? 'title_field' and nullif(p->>'title_field', '') is not null and not exists (select 1 from bb_fields where object_id = v_id and key = p->>'title_field' and active and type in ('text', 'phone', 'select', 'reference', 'number', 'date')) then
      raise exception 'Field judul harus field aktif bertipe teks/nomor HP/pilihan/referensi/angka/tanggal'; end if;
    if coalesce((p->>'active')::boolean, true) = false and exists (select 1 from bb_fields f join bb_objects o on o.id = f.object_id where f.ref_object = v_id and f.active and o.active and o.id <> v_id) then
      raise exception 'Jenis data ini dipakai sebagai referensi oleh jenis data lain. Nonaktifkan field referensinya dulu.'; end if;
    update bb_objects set name = trim(p->>'name'), prefix = v_prefix, icon = coalesce(nullif(p->>'icon', ''), icon),
      title_field = case when p ? 'title_field' then nullif(p->>'title_field', '') else title_field end,
      workflow = coalesce((p->>'workflow')::boolean, workflow), active = coalesce((p->>'active')::boolean, active),
      sort = coalesce((p->>'sort')::int, sort) where id = v_id;
  end if;
  perform config_log(p_kos, 'builder_jenis_data', trim(p->>'name'), v_old, p, null, 'rendah', actor_email());
  return v_id;
end $$;

create or replace function public.bb_field_save(p_kos uuid, p_object uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; f bb_fields; v_key text; v_type text := p->>'type'; v_choices text[]; v_ref uuid := nullif(p->>'ref_object', '')::uuid; v_used boolean; v_roles text[];
begin
  perform bb_kustom(p_kos, 'settings');
  if not exists (select 1 from bb_objects where id = p_object and kos_id = p_kos) then raise exception 'Jenis data tidak ditemukan'; end if;
  if coalesce(length(trim(p->>'label')), 0) < 1 then raise exception 'Isi nama field'; end if;
  if v_type = 'file' then raise exception 'Tipe lampiran file belum tersedia (segera hadir)'; end if;
  if v_type not in ('text', 'longtext', 'number', 'currency', 'date', 'datetime', 'select', 'multiselect', 'boolean', 'phone', 'reference') then raise exception 'Tipe field tidak dikenal'; end if;
  select coalesce(array_agg(distinct trim(c)) filter (where trim(c) <> ''), '{}') into v_choices from jsonb_array_elements_text(coalesce(p->'choices', '[]')) c;
  if v_type in ('select', 'multiselect') and coalesce(array_length(v_choices, 1), 0) < 2 then raise exception 'Isi minimal 2 pilihan untuk field pilihan'; end if;
  if coalesce(array_length(v_choices, 1), 0) > 40 then raise exception 'Maksimal 40 pilihan'; end if;
  if v_type = 'reference' and (v_ref is null or not exists (select 1 from bb_objects where id = v_ref and kos_id = p_kos and active)) then raise exception 'Pilih jenis data yang dirujuk'; end if;
  if v_type = 'reference' and v_ref = p_object then raise exception 'Field referensi tidak bisa merujuk jenis data yang sama'; end if;
  if (p->>'min_value') is not null and (p->>'max_value') is not null and (p->>'min_value')::numeric > (p->>'max_value')::numeric then raise exception 'Nilai minimal lebih besar dari maksimal'; end if;
  select coalesce(array_agg(r), '{}') into v_roles from jsonb_array_elements_text(coalesce(p->'hidden_roles', '[]')) r where r = any(team_roles('kustom'));
  if v_id is null then
    if (select count(*) from bb_fields where object_id = p_object and active) >= 40 then raise exception 'Maksimal 40 field per jenis data'; end if;
    v_key := bb_slug(coalesce(nullif(p->>'key', ''), p->>'label'));
    if v_key !~ '^[a-z]' then v_key := 'f_' || v_key; end if;
    v_key := left(v_key, 24);
    if length(v_key) < 2 then v_key := 'f_' || (select count(*) + 1 from bb_fields where object_id = p_object); end if;
    if exists (select 1 from bb_fields where object_id = p_object and key = v_key) then
      raise exception 'Konflik field: nama "%" sudah dipakai di jenis data ini. Pakai nama lain.', trim(p->>'label'); end if;
    insert into bb_fields(kos_id, object_id, key, label, type, help, required, choices, min_value, max_value, default_value, ref_object, in_list, searchable, filterable, hidden_roles, sort)
    values (p_kos, p_object, v_key, trim(p->>'label'), v_type, nullif(trim(p->>'help'), ''), coalesce((p->>'required')::boolean, false), v_choices,
            nullif(p->>'min_value', '')::numeric, nullif(p->>'max_value', '')::numeric, nullif(p->>'default_value', ''), case when v_type = 'reference' then v_ref end,
            coalesce((p->>'in_list')::boolean, true), coalesce((p->>'searchable')::boolean, v_type in ('text', 'phone')), coalesce((p->>'filterable')::boolean, v_type in ('select', 'boolean')), v_roles,
            (select coalesce(max(sort), 0) + 1 from bb_fields where object_id = p_object)) returning id into v_id;
    update bb_objects set title_field = v_key where id = p_object and title_field is null and v_type in ('text', 'phone', 'select', 'reference');
  else
    select * into f from bb_fields where id = v_id and object_id = p_object;
    if f.id is null then raise exception 'Field tidak ditemukan'; end if;
    v_used := exists (select 1 from bb_records where object_id = p_object and data ? f.key);
    if v_type <> f.type and v_used then raise exception 'Tipe field "%" tidak bisa diubah karena sudah berisi data. Buat field baru bila perlu.', f.label; end if;
    if f.type in ('select', 'multiselect') and v_used and exists (select 1 from bb_records r where r.object_id = p_object and r.archived_at is null and (
         (f.type = 'select' and r.data->>f.key is not null and not ((r.data->>f.key) = any(v_choices))) or
         (f.type = 'multiselect' and exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(r.data->f.key) = 'array' then r.data->f.key else '[]' end) c where not (c = any(v_choices)))))) then
      raise exception 'Ada catatan yang memakai pilihan yang dihapus. Ubah catatan itu dulu, atau biarkan pilihannya.'; end if;
    if coalesce((p->>'active')::boolean, true) = false and exists (select 1 from bb_objects where id = p_object and title_field = f.key) then raise exception 'Field ini dipakai sebagai judul. Ganti field judul dulu.'; end if;
    if coalesce((p->>'active')::boolean, true) = false and exists (select 1 from bb_reports where object_id = p_object and (field_key = f.key or group_by = 'field:' || f.key)) then raise exception 'Field ini dipakai di laporan. Ubah/hapus laporannya dulu.'; end if;
    update bb_fields set label = trim(p->>'label'), type = v_type, help = nullif(trim(p->>'help'), ''), required = coalesce((p->>'required')::boolean, required), choices = v_choices,
      min_value = nullif(p->>'min_value', '')::numeric, max_value = nullif(p->>'max_value', '')::numeric, default_value = nullif(p->>'default_value', ''),
      ref_object = case when v_type = 'reference' then v_ref end, in_list = coalesce((p->>'in_list')::boolean, in_list), searchable = coalesce((p->>'searchable')::boolean, searchable),
      filterable = coalesce((p->>'filterable')::boolean, filterable), hidden_roles = v_roles, active = coalesce((p->>'active')::boolean, active), sort = coalesce((p->>'sort')::int, sort)
    where id = v_id;
  end if;
  perform config_log(p_kos, 'builder_field', trim(p->>'label'), case when f.id is not null then to_jsonb(f) end, p, null, 'rendah', actor_email());
  return v_id;
end $$;

-- Status & alur satu jenis data sekaligus: p_statuses [{id?, label, tone, is_initial, is_final, sla_hours, active}],
-- p_rules [{from (index status | null), to (index), roles[], require_note, require_approval}]
create or replace function public.bb_workflow_save(p_kos uuid, p_object uuid, p_statuses jsonb, p_rules jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare x jsonb; i int := 0; ids uuid[] := '{}'; v_id uuid; n_init int := 0; r jsonb; v_from uuid; v_to uuid; v_roles text[];
begin
  perform bb_kustom(p_kos, 'settings');
  if not exists (select 1 from bb_objects where id = p_object and kos_id = p_kos) then raise exception 'Jenis data tidak ditemukan'; end if;
  if jsonb_array_length(coalesce(p_statuses, '[]')) = 0 then raise exception 'Isi minimal satu status'; end if;
  if jsonb_array_length(p_statuses) > 20 then raise exception 'Maksimal 20 status'; end if;
  for x in select * from jsonb_array_elements(p_statuses) loop
    if coalesce(length(trim(x->>'label')), 0) < 1 then raise exception 'Nama status ke-% kosong', i + 1; end if;
    if coalesce((x->>'is_initial')::boolean, false) and coalesce((x->>'active')::boolean, true) then n_init := n_init + 1; end if;
    v_id := nullif(x->>'id', '')::uuid;
    if v_id is not null and not exists (select 1 from bb_statuses where id = v_id and object_id = p_object) then raise exception 'Status tidak dikenal'; end if;
    if v_id is not null and not coalesce((x->>'active')::boolean, true) and exists (select 1 from bb_records where status_id = v_id and archived_at is null) then
      raise exception 'Status "%" masih dipakai catatan, tidak bisa dinonaktifkan', x->>'label'; end if;
    if v_id is null then
      insert into bb_statuses(kos_id, object_id, label, tone, is_initial, is_final, sla_hours, sort, active)
      values (p_kos, p_object, trim(x->>'label'), coalesce(nullif(x->>'tone', ''), 'info'), coalesce((x->>'is_initial')::boolean, false), coalesce((x->>'is_final')::boolean, false),
              nullif(x->>'sla_hours', '')::int, i, coalesce((x->>'active')::boolean, true)) returning id into v_id;
    else
      update bb_statuses set label = trim(x->>'label'), tone = coalesce(nullif(x->>'tone', ''), tone), is_initial = coalesce((x->>'is_initial')::boolean, false),
        is_final = coalesce((x->>'is_final')::boolean, false), sla_hours = nullif(x->>'sla_hours', '')::int, sort = i, active = coalesce((x->>'active')::boolean, true) where id = v_id;
    end if;
    ids := ids || v_id; i := i + 1;
  end loop;
  if n_init <> 1 then raise exception 'Pilih tepat satu status awal (untuk catatan baru)'; end if;
  delete from bb_transitions where object_id = p_object;
  for r in select * from jsonb_array_elements(coalesce(p_rules, '[]')) loop
    v_from := case when r->>'from' is null or r->>'from' = '' then null else ids[(r->>'from')::int + 1] end;
    v_to := ids[(r->>'to')::int + 1];
    if v_to is null then raise exception 'Aturan alur tidak lengkap'; end if;
    if v_from = v_to then raise exception 'Aturan alur ke status yang sama tidak diperlukan'; end if;
    select coalesce(array_agg(x2), '{}') into v_roles from jsonb_array_elements_text(coalesce(r->'roles', '[]')) x2 where x2 = any(team_roles('kustom'));
    insert into bb_transitions(kos_id, object_id, from_status, to_status, roles, require_note, require_approval)
    values (p_kos, p_object, v_from, v_to, v_roles, coalesce((r->>'require_note')::boolean, false), coalesce((r->>'require_approval')::boolean, false));
  end loop;
  perform config_log(p_kos, 'builder_alur', (select name from bb_objects where id = p_object), null, jsonb_build_object('status', p_statuses, 'aturan', p_rules), null, 'menengah', actor_email());
end $$;

create or replace function public.bb_report_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; v_obj uuid := (p->>'object_id')::uuid; v_metric text := coalesce(p->>'metric', 'count'); v_field text := nullif(p->>'field_key', ''); v_group text := coalesce(nullif(p->>'group_by', ''), 'status');
begin
  perform bb_kustom(p_kos, 'settings');
  if p ? 'delete' and (p->>'delete')::boolean then delete from bb_reports where id = v_id and kos_id = p_kos; return v_id; end if;
  if not exists (select 1 from bb_objects where id = v_obj and kos_id = p_kos) then raise exception 'Pilih jenis data'; end if;
  if coalesce(length(trim(p->>'name')), 0) < 2 then raise exception 'Isi nama laporan'; end if;
  if v_metric not in ('count', 'sum', 'avg') then raise exception 'Metrik tidak dikenal'; end if;
  if v_metric <> 'count' and not exists (select 1 from bb_fields where object_id = v_obj and key = v_field and active and type in ('number', 'currency')) then
    raise exception 'Untuk total/rata-rata, pilih field angka atau uang'; end if;
  if v_group like 'field:%' and not exists (select 1 from bb_fields where object_id = v_obj and key = substr(v_group, 7) and active and type in ('select', 'boolean', 'text', 'reference')) then
    raise exception 'Kelompokkan hanya per field pilihan/ya-tidak/teks/referensi'; end if;
  if v_group not in ('status', 'month', 'day', 'none') and v_group not like 'field:%' then raise exception 'Pengelompokan tidak dikenal'; end if;
  if v_id is null then
    insert into bb_reports(kos_id, object_id, name, metric, field_key, group_by, period_days, filter_status, sort)
    values (p_kos, v_obj, trim(p->>'name'), v_metric, case when v_metric <> 'count' then v_field end, v_group, nullif(p->>'period_days', '')::int, nullif(p->>'filter_status', '')::uuid,
            (select coalesce(max(sort), 0) + 1 from bb_reports where kos_id = p_kos)) returning id into v_id;
  else
    update bb_reports set object_id = v_obj, name = trim(p->>'name'), metric = v_metric, field_key = case when v_metric <> 'count' then v_field end, group_by = v_group,
      period_days = nullif(p->>'period_days', '')::int, filter_status = nullif(p->>'filter_status', '')::uuid where id = v_id and kos_id = p_kos;
  end if;
  return v_id;
end $$;

-- ================= Validasi & aktivasi =================
create or replace function public.bb_validate(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e jsonb := '[]'; w jsonb := '[]'; o record; n int; s record;
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak punya akses'; end if;
  if (select business_type from kos where id = p_kos) <> 'kustom' then raise exception 'Bukan bisnis kustom'; end if;
  if not exists (select 1 from bb_objects where kos_id = p_kos and active) then
    e := e || jsonb_build_object('area', 'Data & formulir', 'masalah', 'Belum ada jenis data', 'solusi', 'Tambahkan minimal satu jenis data, mis. "Servis" atau "Pesanan".'); end if;
  for o in select * from bb_objects where kos_id = p_kos and active order by sort loop
    select count(*) into n from bb_fields where object_id = o.id and active;
    if n = 0 then e := e || jsonb_build_object('area', o.name, 'masalah', 'Belum ada field', 'solusi', 'Tambahkan field, mis. Nama, Tanggal, Biaya.'); end if;
    if o.title_field is null or not exists (select 1 from bb_fields where object_id = o.id and key = o.title_field and active) then
      e := e || jsonb_build_object('area', o.name, 'masalah', 'Field judul belum dipilih', 'solusi', 'Pilih field yang menjadi judul catatan (mis. Nama atau Plat nomor).'); end if;
    if exists (select 1 from bb_fields where object_id = o.id and active and type = 'reference' and (ref_object is null or not exists (select 1 from bb_objects r where r.id = ref_object and r.active))) then
      e := e || jsonb_build_object('area', o.name, 'masalah', 'Ada field referensi ke jenis data yang tidak aktif', 'solusi', 'Aktifkan jenis data yang dirujuk atau nonaktifkan field itu.'); end if;
    if exists (select 1 from bb_fields where object_id = o.id and active and type in ('select', 'multiselect') and coalesce(array_length(choices, 1), 0) < 2) then
      e := e || jsonb_build_object('area', o.name, 'masalah', 'Field pilihan tanpa pilihan', 'solusi', 'Isi minimal 2 pilihan.'); end if;
    if exists (select 1 from bb_fields where object_id = o.id and active and required and default_value is null and type = 'boolean') then
      w := w || jsonb_build_object('area', o.name, 'masalah', 'Field ya/tidak wajib tanpa nilai bawaan', 'solusi', 'Field ya/tidak biasanya tidak perlu wajib.'); end if;
    if o.workflow then
      select count(*) into n from bb_statuses where object_id = o.id and active and is_initial;
      if n <> 1 then e := e || jsonb_build_object('area', o.name || ' · alur', 'masalah', 'Status awal harus tepat satu', 'solusi', 'Tandai satu status sebagai status awal.'); end if;
      if not exists (select 1 from bb_statuses where object_id = o.id and active and is_final) then
        e := e || jsonb_build_object('area', o.name || ' · alur', 'masalah', 'Belum ada status akhir', 'solusi', 'Tandai status seperti "Selesai" atau "Batal" sebagai status akhir.'); end if;
      for s in select * from bb_statuses where object_id = o.id and active and not is_final loop
        if not exists (select 1 from bb_transitions t join bb_statuses ts on ts.id = t.to_status and ts.active where t.object_id = o.id and (t.from_status = s.id or t.from_status is null) and t.to_status <> s.id) then
          e := e || jsonb_build_object('area', o.name || ' · alur', 'masalah', format('Status "%s" buntu (tidak ada langkah keluar)', s.label), 'solusi', 'Tambahkan aturan alur dari status ini ke status berikutnya.'); end if;
      end loop;
      for s in select * from bb_statuses where object_id = o.id and active and not is_initial loop
        if not exists (select 1 from bb_transitions t where t.object_id = o.id and t.to_status = s.id) then
          w := w || jsonb_build_object('area', o.name || ' · alur', 'masalah', format('Status "%s" tidak pernah bisa dicapai', s.label), 'solusi', 'Tambahkan aturan alur menuju status ini, atau nonaktifkan.'); end if;
      end loop;
      if exists (select 1 from bb_transitions t where t.object_id = o.id and (exists (select 1 from bb_statuses x where x.id = t.to_status and not x.active) or exists (select 1 from bb_statuses x where x.id = t.from_status and not x.active))) then
        w := w || jsonb_build_object('area', o.name || ' · alur', 'masalah', 'Ada aturan ke/dari status nonaktif (diabaikan)', 'solusi', 'Simpan ulang alur untuk merapikan.'); end if;
      if exists (select 1 from bb_transitions t where t.object_id = o.id and cardinality(t.roles) > 0 and not ('pengelola' = any(t.roles)) and not ('operator' = any(t.roles))) then
        w := w || jsonb_build_object('area', o.name || ' · peran', 'masalah', 'Ada langkah yang hanya bisa dilakukan pemilik', 'solusi', 'Itu boleh; pastikan memang disengaja.'); end if;
    end if;
  end loop;
  if exists (select 1 from bb_reports r where r.kos_id = p_kos and (not exists (select 1 from bb_objects bo where bo.id = r.object_id and bo.active)
      or (r.metric <> 'count' and not exists (select 1 from bb_fields f where f.object_id = r.object_id and f.key = r.field_key and f.active)))) then
    e := e || jsonb_build_object('area', 'Laporan', 'masalah', 'Ada laporan yang memakai jenis data/field nonaktif', 'solusi', 'Ubah atau hapus laporan tersebut.'); end if;
  if not exists (select 1 from bb_reports where kos_id = p_kos) then
    w := w || jsonb_build_object('area', 'Laporan', 'masalah', 'Belum ada laporan', 'solusi', 'Tambahkan minimal satu laporan, mis. jumlah per status.'); end if;
  if not exists (select 1 from bb_workspace where kos_id = p_kos and coalesce(main_process, '') <> '') then
    w := w || jsonb_build_object('area', 'Profil', 'masalah', 'Proses utama belum diisi', 'solusi', 'Isi singkat proses utama usaha agar mudah dipahami tim.'); end if;
  if kos_plan(p_kos) is null then w := w || jsonb_build_object('area', 'Paket', 'masalah', 'Paket langganan tidak terbaca', 'solusi', 'Cek menu Langganan.'); end if;
  return jsonb_build_object('ok', jsonb_array_length(e) = 0, 'errors', e, 'warnings', w,
    'status', (select status from bb_workspace where kos_id = p_kos),
    'summary', jsonb_build_object('objects', (select count(*) from bb_objects where kos_id = p_kos and active), 'fields', (select count(*) from bb_fields where kos_id = p_kos and active),
      'statuses', (select count(*) from bb_statuses where kos_id = p_kos and active), 'rules', (select count(*) from bb_transitions where kos_id = p_kos),
      'reports', (select count(*) from bb_reports where kos_id = p_kos), 'roles', to_jsonb(team_roles('kustom'))));
end $$;

create or replace function public.bb_activate(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not member_can(p_kos, 'team') then raise exception 'Hanya pemilik yang bisa mengaktifkan bisnis'; end if;
  v := bb_validate(p_kos);
  if not (v->>'ok')::boolean then raise exception 'Masih ada % masalah. Perbaiki dulu di langkah Validasi.', jsonb_array_length(v->'errors'); end if;
  update bb_workspace set status = 'aktif', activated_at = coalesce(activated_at, now()), activated_by = actor_email(), updated_at = now() where kos_id = p_kos;
  perform config_log(p_kos, 'builder_aktifkan', 'Aktifkan bisnis', null, v->'summary', null, 'menengah', actor_email());
  return v;
end $$;

-- ================= Catatan =================
-- Validasi & normalisasi isi catatan berdasarkan field yang aktif (tipe, wajib, pilihan, batas, referensi). Kunci tak dikenal dibuang.
create or replace function public.bb_clean(p_object uuid, p_data jsonb, p_old jsonb, p_role text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f bb_fields; v jsonb; out jsonb := '{}'; t text; n numeric; arr jsonb;
begin
  for f in select * from bb_fields where object_id = p_object and active order by sort loop
    -- field tersembunyi untuk peran ini: pertahankan nilai lama, abaikan kiriman
    if p_role = any(f.hidden_roles) then
      if p_old ? f.key then out := out || jsonb_build_object(f.key, p_old->f.key); end if;
      continue;
    end if;
    v := p_data->f.key;
    if v is null or v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and trim(v #>> '{}') = '') or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0) then
      if f.required and f.type <> 'boolean' then raise exception '"%" wajib diisi', f.label; end if;
      if f.type = 'boolean' then out := out || jsonb_build_object(f.key, coalesce(v, 'false'::jsonb) = 'true'::jsonb); end if;
      continue;
    end if;
    t := v #>> '{}';
    case f.type
      when 'text' then if length(t) > 300 then raise exception '"%" terlalu panjang (maks 300 huruf)', f.label; end if; out := out || jsonb_build_object(f.key, trim(t));
      when 'longtext' then if length(t) > 3000 then raise exception '"%" terlalu panjang (maks 3000 huruf)', f.label; end if; out := out || jsonb_build_object(f.key, trim(t));
      when 'phone' then t := regexp_replace(t, '[^0-9+]', '', 'g'); if length(t) < 6 or length(t) > 16 then raise exception '"%" bukan nomor HP yang valid', f.label; end if; out := out || jsonb_build_object(f.key, t);
      when 'number', 'currency' then
        begin n := replace(t, ',', '.')::numeric; exception when others then raise exception '"%" harus angka', f.label; end;
        if f.type = 'currency' then n := round(n, 2); if n < 0 and f.min_value is null then raise exception '"%" tidak boleh negatif', f.label; end if; end if;
        if f.min_value is not null and n < f.min_value then raise exception '"%" minimal %', f.label, f.min_value; end if;
        if f.max_value is not null and n > f.max_value then raise exception '"%" maksimal %', f.label, f.max_value; end if;
        out := out || jsonb_build_object(f.key, n);
      when 'date' then begin out := out || jsonb_build_object(f.key, t::date::text); exception when others then raise exception '"%" bukan tanggal', f.label; end;
      when 'datetime' then begin out := out || jsonb_build_object(f.key, to_char(t::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')); exception when others then raise exception '"%" bukan tanggal & jam', f.label; end;
      when 'boolean' then out := out || jsonb_build_object(f.key, t in ('true', '1', 'ya'));
      when 'select' then if not (t = any(f.choices)) then raise exception 'Pilihan "%" tidak tersedia untuk %', t, f.label; end if; out := out || jsonb_build_object(f.key, t);
      when 'multiselect' then
        if jsonb_typeof(v) <> 'array' then raise exception '"%" harus daftar pilihan', f.label; end if;
        select coalesce(jsonb_agg(distinct c), '[]') into arr from jsonb_array_elements_text(v) c;
        if exists (select 1 from jsonb_array_elements_text(arr) c where not (c = any(f.choices))) then raise exception 'Ada pilihan yang tidak tersedia untuk %', f.label; end if;
        out := out || jsonb_build_object(f.key, arr);
      when 'reference' then
        if not exists (select 1 from bb_records r where r.id::text = t and r.object_id = f.ref_object and r.archived_at is null) then raise exception '"%" merujuk catatan yang tidak ada', f.label; end if;
        out := out || jsonb_build_object(f.key, t);
    end case;
  end loop;
  return out;
end $$;

create or replace function public.bb_title(p_object uuid, p_data jsonb)
returns text language sql stable security definer set search_path = public as $$
  select left(coalesce(case when f.type = 'reference' then (select r.title from bb_records r where r.id::text = p_data->>f.key) else p_data->>f.key end, ''), 120)
  from bb_objects o left join bb_fields f on f.object_id = o.id and f.key = o.title_field where o.id = p_object;
$$;

create or replace function public.bb_record_save(p_id uuid, p_kos uuid, p_object uuid, p_data jsonb, p_assigned text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o bb_objects; r bb_records; v_data jsonb; v_role text := bb_role(p_kos); v_no text; v_init uuid; v_changed text;
begin
  perform bb_kustom(p_kos, 'ops');
  if (select status from bb_workspace where kos_id = p_kos) <> 'aktif' then raise exception 'Bisnis belum diaktifkan. Selesaikan Business Builder › Validasi › Aktifkan.'; end if;
  select * into o from bb_objects where id = p_object and kos_id = p_kos and active;
  if o.id is null then raise exception 'Jenis data tidak ditemukan'; end if;
  if jsonb_typeof(coalesce(p_data, '{}')) <> 'object' then raise exception 'Data tidak valid'; end if;
  select * into r from bb_records where id = p_id for update;
  if r.id is not null and (r.kos_id <> p_kos or r.object_id <> p_object) then raise exception 'Catatan tidak ditemukan'; end if;
  if r.id is not null and r.archived_at is not null then raise exception 'Catatan ini sudah diarsipkan'; end if;
  v_data := bb_clean(p_object, p_data, coalesce(r.data, '{}'), v_role);
  if r.id is null then
    if (select count(*) from bb_records where kos_id = p_kos and created_at > now() - interval '1 day') >= 2000 then raise exception 'Batas 2.000 catatan per hari tercapai'; end if;
    if o.workflow then select id into v_init from bb_statuses where object_id = o.id and active and is_initial limit 1; end if;
    perform pg_advisory_xact_lock(hashtext('bbno' || p_kos::text));
    v_no := o.prefix || '-' || to_char((now() at time zone 'Asia/Jakarta')::date, 'YYMMDD') || '-' ||
      lpad(((select count(*) from bb_records where kos_id = p_kos and number like o.prefix || '-' || to_char((now() at time zone 'Asia/Jakarta')::date, 'YYMMDD') || '-%') + 1)::text, 3, '0');
    insert into bb_records(id, kos_id, object_id, number, title, status_id, data, assigned_to, created_by)
    values (p_id, p_kos, o.id, v_no, coalesce(nullif(bb_title(o.id, v_data), ''), v_no), v_init, v_data, nullif(trim(p_assigned), ''), actor_email());
    perform bb_event(p_id, 'dibuat', 'Dicatat' || coalesce(' · status ' || (select label from bb_statuses where id = v_init), ''));
    return jsonb_build_object('id', p_id, 'number', v_no);
  end if;
  select string_agg(coalesce(f.label, k), ', ') into v_changed from (
    select k from jsonb_object_keys(v_data || r.data) k where (v_data->k) is distinct from (r.data->k)) z
    left join bb_fields f on f.object_id = o.id and f.key = z.k;
  update bb_records set data = v_data, title = coalesce(nullif(bb_title(o.id, v_data), ''), number),
    assigned_to = case when p_assigned is null then assigned_to else nullif(trim(p_assigned), '') end, updated_at = now() where id = r.id;
  if v_changed is not null then perform bb_event(r.id, 'ubah', 'Diubah: ' || v_changed); end if;
  if p_assigned is not null and nullif(trim(p_assigned), '') is distinct from r.assigned_to then perform bb_event(r.id, 'tugas', 'Penanggung jawab: ' || coalesce(nullif(trim(p_assigned), ''), '—')); end if;
  return jsonb_build_object('id', r.id, 'number', r.number);
end $$;

-- Pindah status sesuai aturan alur (peran, catatan wajib, persetujuan)
create or replace function public.bb_record_move(p_record uuid, p_to uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r bb_records; t bb_transitions; v_role text; v_from text; v_to bb_statuses;
begin
  select * into r from bb_records where id = p_record for update;
  if r.id is null then raise exception 'Catatan tidak ditemukan'; end if;
  perform bb_kustom(r.kos_id, 'ops');
  if r.archived_at is not null then raise exception 'Catatan ini sudah diarsipkan'; end if;
  v_role := bb_role(r.kos_id);
  select * into v_to from bb_statuses where id = p_to and object_id = r.object_id and active;
  if v_to.id is null then raise exception 'Status tujuan tidak ditemukan'; end if;
  if p_to = r.status_id then raise exception 'Catatan sudah berstatus %', v_to.label; end if;
  select * into t from bb_transitions where object_id = r.object_id and to_status = p_to
    and (from_status = r.status_id or (from_status is null and not coalesce((select is_final from bb_statuses where id = r.status_id), false)))
  order by from_status nulls last limit 1;
  if t.id is null then raise exception 'Langkah dari "%" ke "%" tidak diizinkan oleh alur kerja', coalesce((select label from bb_statuses where id = r.status_id), '-'), v_to.label; end if;
  if v_role <> 'pemilik' and cardinality(t.roles) > 0 and not (v_role = any(t.roles)) then raise exception 'Peran Anda tidak diizinkan melakukan langkah ini'; end if;
  if t.require_note and coalesce(length(trim(p_note)), 0) < 3 then raise exception 'Langkah ini wajib disertai catatan/alasan'; end if;
  if t.require_approval and not member_can(r.kos_id, 'team') then raise exception 'PERLU_PERSETUJUAN: Langkah ini perlu persetujuan pemilik. Kirim permintaan dari aplikasi.'; end if;
  v_from := coalesce((select label from bb_statuses where id = r.status_id), '-');
  update bb_records set status_id = p_to, status_since = now(), updated_at = now() where id = r.id;
  perform bb_event(r.id, 'status', v_from || ' → ' || v_to.label || coalesce(' · ' || nullif(trim(p_note), ''), ''));
  return jsonb_build_object('ok', true, 'status', v_to.label);
end $$;

create or replace function public.bb_record_archive(p_record uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r bb_records;
begin
  select * into r from bb_records where id = p_record for update;
  if r.id is null then raise exception 'Catatan tidak ditemukan'; end if;
  perform bb_kustom(r.kos_id, 'settings');
  if r.archived_at is not null then raise exception 'Sudah diarsipkan'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tulis alasan mengarsipkan'; end if;
  if exists (select 1 from bb_fields f join bb_records x on x.object_id = f.object_id and x.data->>f.key = r.id::text and x.archived_at is null where f.ref_object = r.object_id and f.active) then
    raise exception 'Catatan ini masih dirujuk catatan lain (mis. kendaraan yang punya riwayat servis). Arsipkan itu dulu.'; end if;
  update bb_records set archived_at = now(), archive_reason = trim(p_reason) where id = r.id;
  perform bb_event(r.id, 'arsip', 'Diarsipkan: ' || trim(p_reason));
end $$;

-- Baca catatan: field tersembunyi untuk peran pembaca dibuang dari hasil
create or replace function public.bb_strip(p_object uuid, p_data jsonb, p_role text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(p_data - coalesce((select array_agg(key) from bb_fields where object_id = p_object and p_role = any(hidden_roles)), '{}'::text[]), '{}');
$$;

create or replace function public.bb_list(p_kos uuid, p_object uuid, p_archived boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text := bb_role(p_kos);
begin
  perform bb_kustom(p_kos, 'ops');
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'number', r.number, 'title', r.title, 'status_id', r.status_id, 'status_since', r.status_since,
      'data', bb_strip(r.object_id, r.data, v_role), 'assigned_to', r.assigned_to, 'created_at', r.created_at, 'updated_at', r.updated_at, 'created_by', r.created_by,
      'archived_at', r.archived_at, 'archive_reason', r.archive_reason) order by r.created_at desc)
    from (select * from bb_records where kos_id = p_kos and object_id = p_object and (archived_at is not null) = coalesce(p_archived, false) order by created_at desc limit 2000) r), '[]');
end $$;

create or replace function public.bb_record_get(p_record uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r bb_records; v_role text;
begin
  select * into r from bb_records where id = p_record;
  if r.id is null then raise exception 'Catatan tidak ditemukan'; end if;
  perform bb_kustom(r.kos_id, 'ops');
  v_role := bb_role(r.kos_id);
  return jsonb_build_object('record', jsonb_build_object('id', r.id, 'number', r.number, 'title', r.title, 'status_id', r.status_id, 'status_since', r.status_since,
      'data', bb_strip(r.object_id, r.data, v_role), 'assigned_to', r.assigned_to, 'created_at', r.created_at, 'created_by', r.created_by, 'archived_at', r.archived_at, 'archive_reason', r.archive_reason, 'object_id', r.object_id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'text', text, 'actor', actor, 'at', created_at) order by created_at desc) from bb_events where record_id = r.id), '[]'),
    'refs', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'number', x.number, 'title', x.title, 'object', o.name, 'status_id', x.status_id) order by x.created_at desc)
      from bb_fields f join bb_records x on x.object_id = f.object_id and x.data->>f.key = r.id::text and x.archived_at is null join bb_objects o on o.id = x.object_id
      where f.ref_object = r.object_id and f.active), '[]'));
end $$;

-- Pilihan untuk field referensi (judul saja)
create or replace function public.bb_ref_options(p_kos uuid, p_object uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform bb_kustom(p_kos, 'ops');
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'number', number) order by title) from bb_records where kos_id = p_kos and object_id = p_object and archived_at is null), '[]');
end $$;

-- Dashboard: jumlah per status, tugas saya, lewat batas waktu
create or replace function public.bb_dashboard(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me text := actor_email();
begin
  perform bb_kustom(p_kos, 'ops');
  return jsonb_build_object(
    'workspace', (select to_jsonb(w) from bb_workspace w where kos_id = p_kos),
    'counts', coalesce((select jsonb_agg(jsonb_build_object('object_id', object_id, 'status_id', status_id, 'n', n)) from (
      select object_id, status_id, count(*) n from bb_records where kos_id = p_kos and archived_at is null group by 1, 2) z), '[]'),
    'today', (select count(*) from bb_records where kos_id = p_kos and archived_at is null and created_at >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'),
    'mine', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'number', r.number, 'title', r.title, 'object_id', r.object_id, 'status_id', r.status_id, 'status_since', r.status_since) order by r.status_since)
      from bb_records r left join bb_statuses s on s.id = r.status_id where r.kos_id = p_kos and r.archived_at is null and r.assigned_to = v_me and not coalesce(s.is_final, false)), '[]'),
    'overdue', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'number', r.number, 'title', r.title, 'object_id', r.object_id, 'status_id', r.status_id, 'status_since', r.status_since,
        'hours', s.sla_hours, 'assigned_to', r.assigned_to) order by r.status_since)
      from bb_records r join bb_statuses s on s.id = r.status_id where r.kos_id = p_kos and r.archived_at is null and s.sla_hours is not null and not s.is_final
        and r.status_since + make_interval(hours => s.sla_hours) < now()), '[]'));
end $$;

-- Orang yang bisa ditugaskan (email anggota aktif bisnis ini)
create or replace function public.bb_people(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform bb_kustom(p_kos, 'ops');
  return coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'role', m.role) order by m.role = 'pemilik' desc, u.email)
    from kos_members m join auth.users u on u.id = m.user_id where m.kos_id = p_kos and m.active), '[]');
end $$;
revoke execute on function public.bb_people(uuid) from public, anon;
grant execute on function public.bb_people(uuid) to authenticated;

-- ================= Laporan (Report Builder) =================
create or replace function public.bb_report_run(p_report uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare rp bb_reports; v_from date; v_to date := coalesce(p_to, (now() at time zone 'Asia/Jakarta')::date); v_role text; f bb_fields; g bb_fields; rows jsonb; v_total numeric; v_n bigint;
begin
  select * into rp from bb_reports where id = p_report;
  if rp.id is null then raise exception 'Laporan tidak ditemukan'; end if;
  perform bb_kustom(rp.kos_id, 'finance');
  v_role := bb_role(rp.kos_id);
  v_from := coalesce(p_from, case when rp.period_days is not null then v_to - rp.period_days + 1 end, date '2000-01-01');
  if rp.metric <> 'count' then
    select * into f from bb_fields where object_id = rp.object_id and key = rp.field_key and active;
    if f.id is null then raise exception 'Field laporan sudah tidak aktif'; end if;
    if v_role = any(f.hidden_roles) then raise exception 'Field laporan ini disembunyikan untuk peran Anda'; end if;
  end if;
  if rp.group_by like 'field:%' then select * into g from bb_fields where object_id = rp.object_id and key = substr(rp.group_by, 7) and active; end if;
  with base as (
    select r.*, (r.created_at at time zone 'Asia/Jakarta')::date d,
      case when rp.metric = 'count' then 1::numeric else (r.data->>rp.field_key)::numeric end val
    from bb_records r where r.object_id = rp.object_id and r.archived_at is null
      and (r.created_at at time zone 'Asia/Jakarta')::date between v_from and v_to
      and (rp.filter_status is null or r.status_id = rp.filter_status)
  ), grp as (
    select case rp.group_by when 'status' then coalesce((select label from bb_statuses where id = b.status_id), '(tanpa status)')
                            when 'month' then to_char(b.d, 'YYYY-MM') when 'day' then to_char(b.d, 'YYYY-MM-DD') when 'none' then 'Semua'
                            else coalesce(case when g.type = 'reference' then (select x.title from bb_records x where x.id::text = b.data->>g.key)
                                               when g.type = 'boolean' then case when (b.data->>g.key)::boolean then 'Ya' else 'Tidak' end
                                               else b.data->>g.key end, '(kosong)') end k,
           case rp.group_by when 'status' then coalesce((select sort from bb_statuses where id = b.status_id), 999)::text else '' end srt,
           b.val
    from base b
  )
  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', n, 'value', v) order by srt, k), '[]'), sum(n), case when rp.metric = 'avg' then avg(v) else sum(v) end
  into rows, v_n, v_total
  from (select k, srt, count(*) n, case when rp.metric = 'avg' then round(avg(val), 2) else sum(coalesce(val, 0)) end v from grp where rp.metric = 'count' or val is not null group by k, srt) z;
  return jsonb_build_object('report', to_jsonb(rp), 'from', v_from, 'to', v_to, 'rows', rows, 'records', coalesce(v_n, 0),
    'total', case when rp.metric = 'avg' then (select round(avg((r.data->>rp.field_key)::numeric), 2) from bb_records r where r.object_id = rp.object_id and r.archived_at is null
      and (r.created_at at time zone 'Asia/Jakarta')::date between v_from and v_to and (rp.filter_status is null or r.status_id = rp.filter_status) and r.data ? rp.field_key) else coalesce(v_total, 0) end,
    'field', case when f.id is not null then jsonb_build_object('label', f.label, 'type', f.type) end);
end $$;

-- ================= Template =================
create or replace function public.bb_seed_template(p_kos uuid, p_tpl text)
returns void language plpgsql security definer set search_path = public as $$
declare o1 uuid; o2 uuid; o3 uuid; s uuid[];
  -- pembuat status cepat
begin
  insert into bb_workspace(kos_id, template, template_version) values (p_kos, coalesce(p_tpl, 'kosong'), 1) on conflict (kos_id) do nothing;
  if p_tpl = 'bengkel' then
    update bb_workspace set description = 'Bengkel motor', revenue_model = 'Jasa servis + penjualan spare part', main_process = 'Motor masuk → dicek → dikerjakan → selesai → diambil & dibayar' where kos_id = p_kos;
    insert into bb_objects(kos_id, key, name, prefix, icon, workflow, sort) values (p_kos, 'pelanggan', 'Pelanggan', 'PLG', '👤', false, 1) returning id into o1;
    insert into bb_fields(kos_id, object_id, key, label, type, required, sort, searchable) values
      (p_kos, o1, 'nama', 'Nama', 'text', true, 1, true), (p_kos, o1, 'no_hp', 'No. WhatsApp', 'phone', false, 2, true), (p_kos, o1, 'alamat', 'Alamat', 'text', false, 3, false);
    update bb_objects set title_field = 'nama' where id = o1;
    insert into bb_objects(kos_id, key, name, prefix, icon, workflow, sort) values (p_kos, 'kendaraan', 'Kendaraan', 'KDR', '🏍️', false, 2) returning id into o2;
    insert into bb_fields(kos_id, object_id, key, label, type, required, choices, ref_object, sort, searchable, filterable) values
      (p_kos, o2, 'plat', 'Plat nomor', 'text', true, '{}', null, 1, true, false),
      (p_kos, o2, 'merek', 'Merek & tipe', 'text', false, '{}', null, 2, true, false),
      (p_kos, o2, 'jenis', 'Jenis', 'select', false, '{Matic,Bebek,Sport,Lainnya}', null, 3, false, true),
      (p_kos, o2, 'pemilik', 'Pemilik', 'reference', false, '{}', o1, 4, false, false);
    update bb_objects set title_field = 'plat' where id = o2;
    insert into bb_objects(kos_id, key, name, prefix, icon, workflow, sort) values (p_kos, 'servis', 'Servis', 'SRV', '🔧', true, 3) returning id into o3;
    insert into bb_fields(kos_id, object_id, key, label, type, required, choices, ref_object, sort, searchable, filterable, in_list, hidden_roles) values
      (p_kos, o3, 'kendaraan', 'Kendaraan', 'reference', true, '{}', o2, 1, false, false, true, '{}'),
      (p_kos, o3, 'keluhan', 'Keluhan / pekerjaan', 'longtext', true, '{}', null, 2, true, false, true, '{}'),
      (p_kos, o3, 'jenis_servis', 'Jenis servis', 'select', false, '{"Servis rutin","Ganti oli",Perbaikan,"Turun mesin",Lainnya}', null, 3, false, true, true, '{}'),
      (p_kos, o3, 'km', 'Kilometer', 'number', false, '{}', null, 4, false, false, false, '{}'),
      (p_kos, o3, 'mekanik', 'Mekanik', 'text', false, '{}', null, 5, true, true, true, '{}'),
      (p_kos, o3, 'biaya_jasa', 'Biaya jasa', 'currency', false, '{}', null, 6, false, false, true, '{}'),
      (p_kos, o3, 'biaya_part', 'Biaya spare part', 'currency', false, '{}', null, 7, false, false, false, '{}'),
      (p_kos, o3, 'lunas', 'Sudah dibayar', 'boolean', false, '{}', null, 8, false, true, true, '{}');
    update bb_objects set title_field = 'kendaraan' where id = o3;
    perform bb_seed_flow(p_kos, o3, '[["Antre","info",true,false,null],["Dikerjakan","gold",false,false,24],["Menunggu spare part","gold",false,false,72],["Selesai","good",false,false,48],["Diambil","good",false,true,null],["Batal","void",false,true,null]]',
      '[[0,1,false,false],[1,2,false,false],[2,1,false,false],[1,3,false,false],[3,4,false,false],[null,5,true,true]]');
    insert into bb_reports(kos_id, object_id, name, metric, field_key, group_by, period_days, sort) values
      (p_kos, o3, 'Servis per status', 'count', null, 'status', null, 1),
      (p_kos, o3, 'Pendapatan jasa per bulan', 'sum', 'biaya_jasa', 'month', 365, 2),
      (p_kos, o3, 'Spare part per bulan', 'sum', 'biaya_part', 'month', 365, 3),
      (p_kos, o3, 'Servis per mekanik (30 hari)', 'count', null, 'field:mekanik', 30, 4);
  elsif p_tpl = 'salon' then
    update bb_workspace set description = 'Salon / barbershop', revenue_model = 'Jasa perawatan per kunjungan', main_process = 'Janji temu → datang → dilayani → selesai & bayar' where kos_id = p_kos;
    insert into bb_objects(kos_id, key, name, prefix, icon, workflow, sort) values (p_kos, 'pelanggan', 'Pelanggan', 'PLG', '👤', false, 1) returning id into o1;
    insert into bb_fields(kos_id, object_id, key, label, type, required, sort, searchable) values
      (p_kos, o1, 'nama', 'Nama', 'text', true, 1, true), (p_kos, o1, 'no_hp', 'No. WhatsApp', 'phone', false, 2, true), (p_kos, o1, 'catatan', 'Catatan (alergi, preferensi)', 'longtext', false, 3, false);
    update bb_objects set title_field = 'nama' where id = o1;
    insert into bb_objects(kos_id, key, name, prefix, icon, workflow, sort) values (p_kos, 'janji_temu', 'Janji temu', 'JNJ', '💇', true, 2) returning id into o2;
    insert into bb_fields(kos_id, object_id, key, label, type, required, choices, ref_object, sort, searchable, filterable, in_list) values
      (p_kos, o2, 'pelanggan', 'Pelanggan', 'reference', true, '{}', o1, 1, false, false, true),
      (p_kos, o2, 'waktu', 'Waktu', 'datetime', true, '{}', null, 2, false, false, true),
      (p_kos, o2, 'layanan', 'Layanan', 'multiselect', true, '{Potong,Cuci,Creambath,Pewarnaan,Smoothing,Lainnya}', null, 3, false, false, true),
      (p_kos, o2, 'stylist', 'Stylist', 'text', false, '{}', null, 4, true, true, true),
      (p_kos, o2, 'harga', 'Harga', 'currency', false, '{}', null, 5, false, false, true);
    update bb_objects set title_field = 'pelanggan' where id = o2;
    perform bb_seed_flow(p_kos, o2, '[["Dijadwalkan","info",true,false,null],["Datang","gold",false,false,3],["Selesai","good",false,true,null],["Tidak datang","bad",false,true,null],["Batal","void",false,true,null]]',
      '[[0,1,false,false],[1,2,false,false],[0,3,false,false],[null,4,true,false]]');
    insert into bb_reports(kos_id, object_id, name, metric, field_key, group_by, period_days, sort) values
      (p_kos, o2, 'Janji temu per status (30 hari)', 'count', null, 'status', 30, 1),
      (p_kos, o2, 'Pendapatan per bulan', 'sum', 'harga', 'month', 365, 2),
      (p_kos, o2, 'Per stylist (30 hari)', 'sum', 'harga', 'field:stylist', 30, 3);
  else
    update bb_workspace set template = 'kosong' where kos_id = p_kos;
    insert into bb_objects(kos_id, key, name, prefix, icon, workflow, sort) values (p_kos, 'pekerjaan', 'Pekerjaan', 'PKJ', '📋', true, 1) returning id into o1;
    insert into bb_fields(kos_id, object_id, key, label, type, required, sort, searchable) values (p_kos, o1, 'judul', 'Judul', 'text', true, 1, true), (p_kos, o1, 'nilai', 'Nilai', 'currency', false, 2, false);
    update bb_objects set title_field = 'judul' where id = o1;
    perform bb_seed_flow(p_kos, o1, '[["Baru","info",true,false,null],["Dikerjakan","gold",false,false,null],["Selesai","good",false,true,null],["Batal","void",false,true,null]]',
      '[[0,1,false,false],[1,2,false,false],[null,3,true,false]]');
    insert into bb_reports(kos_id, object_id, name, metric, field_key, group_by, period_days, sort) values (p_kos, o1, 'Pekerjaan per status', 'count', null, 'status', null, 1);
  end if;
end $$;

-- status: [[label, tone, initial, final, sla]], aturan: [[from|null, to, note, approval]]
create or replace function public.bb_seed_flow(p_kos uuid, p_object uuid, p_st jsonb, p_rules jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare x jsonb; i int := 0; ids uuid[] := '{}'; v uuid;
begin
  for x in select * from jsonb_array_elements(p_st) loop
    insert into bb_statuses(kos_id, object_id, label, tone, is_initial, is_final, sla_hours, sort)
    values (p_kos, p_object, x->>0, x->>1, (x->>2)::boolean, (x->>3)::boolean, nullif(x->>4, '')::int, i) returning id into v;
    ids := ids || v; i := i + 1;
  end loop;
  for x in select * from jsonb_array_elements(p_rules) loop
    insert into bb_transitions(kos_id, object_id, from_status, to_status, require_note, require_approval)
    values (p_kos, p_object, case when x->>0 is null then null else ids[(x->>0)::int + 1] end, ids[(x->>1)::int + 1], (x->>2)::boolean, (x->>3)::boolean);
  end loop;
end $$;

-- ================= Integrasi =================
select public._prasara_patch('public.create_business(text,text,text,integer,text)',
  '  else
    raise exception ''Jenis bisnis tidak dikenal'';',
  '  elsif p_type = ''kustom'' then
    if coalesce(trim(p_name), '''') = '''' then raise exception ''Nama usaha wajib diisi''; end if;
    insert into kos(name, address, owner_id, business_type, business_groups) values (trim(p_name), nullif(trim(p_address), ''''), auth.uid(), ''kustom'', ''{lainnya}'') returning id into v_id;
    insert into kos_members(kos_id, user_id, role) values (v_id, auth.uid(), ''pemilik'');
    perform bb_seed_template(v_id, case when p_prefix in (''bengkel'', ''salon'') then p_prefix else ''kosong'' end);
    return v_id;
  else
    raise exception ''Jenis bisnis tidak dikenal'';');

-- Persetujuan langkah alur
select public._prasara_patch('public.approval_request(uuid,text,jsonb,text)',
  'elsif p_action = ''batal_pelunasan'' then',
  'elsif p_action = ''bb_pindah_status'' then
    v_target := p_payload->>''record_id'';
    select r.number || '' · '' || r.title || '': '' || coalesce(fs.label, ''-'') || '' → '' || ts.label into v_sum
    from bb_records r left join bb_statuses fs on fs.id = r.status_id join bb_statuses ts on ts.id = (p_payload->>''to_status'')::uuid and ts.object_id = r.object_id
    where r.id = v_target::uuid and r.kos_id = p_kos and r.archived_at is null;
    if v_sum is null then raise exception ''Catatan tidak ditemukan''; end if;
    v_sum := ''Pindah status '' || v_sum;
    v_imp := jsonb_build_object(''catatan'', v_sum, ''alasan'', p_reason);
  elsif p_action = ''batal_pelunasan'' then');
select public._prasara_patch('public.approval_decide(uuid,boolean,text)',
  'when ''batal_pelunasan'' then',
  'when ''bb_pindah_status'' then bb_record_move((ap.payload->>''record_id'')::uuid, (ap.payload->>''to_status'')::uuid, coalesce(ap.payload->>''note'', ap.reason))
      when ''batal_pelunasan'' then');

-- Unduh semua data: bisnis kustom (semua catatan apa adanya + riwayat)
select public._prasara_patch('public.business_export_sheets(uuid)',
  '  s := s || xs(''Persetujuan'',',
  '  if k.business_type = ''kustom'' then
    s := s || xs(''Konfigurasi'', array[''Jenis data'', ''Field'', ''Label'', ''Tipe'', ''Wajib'', ''Pilihan''], array[''t'', ''t'', ''t'', ''t'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(o.name, f.key, f.label, f.type, case when f.required then ''ya'' else '''' end, array_to_string(f.choices, '', '')) order by o.sort, f.sort)
       from bb_fields f join bb_objects o on o.id = f.object_id where f.kos_id = p_kos and f.active));
    s := s || xs(''Catatan'', array[''Jenis data'', ''Nomor'', ''Judul'', ''Status'', ''Isi'', ''Penanggung jawab'', ''Dibuat'', ''Oleh'', ''Diarsipkan''], array[''t'', ''t'', ''t'', ''t'', ''t'', ''t'', ''t'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(o.name, r.number, r.title, st.label, r.data::text, r.assigned_to, xs_time(r.created_at), r.created_by, xs_time(r.archived_at)) order by r.created_at)
       from bb_records r join bb_objects o on o.id = r.object_id left join bb_statuses st on st.id = r.status_id where r.kos_id = p_kos));
    s := s || xs(''Riwayat catatan'', array[''Waktu'', ''Nomor'', ''Kejadian'', ''Oleh''], array[''t'', ''t'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(xs_time(e.created_at), r.number, e.text, e.actor) order by e.created_at)
       from bb_events e join bb_records r on r.id = e.record_id where e.kos_id = p_kos));
  end if;
  s := s || xs(''Persetujuan'',');

select public._prasara_patch('public.owner_overview2(date)',
  '    elsif k.business_type = ''jasa'' then',
  '    elsif k.business_type = ''kustom'' then
      v_rev := null; v_cogs := null; v_ops := null; v_recv := null; v_pay := null; v_kas := null; v_bank := null;
      v_flags := v_flags || ''["Bisnis kustom: angka keuangan belum dihitung PRASARA (lihat Laporan kustom)"]'';
      v_last := (select max(updated_at) from bb_records where kos_id = k.id);
      v_att := v_att || coalesce((select jsonb_agg(jsonb_build_object(''text'', n || '' catatan lewat batas waktu'', ''href'', ''/kerja'', ''tone'', ''bad'')) from (
        select count(*) n from bb_records r join bb_statuses s on s.id = r.status_id where r.kos_id = k.id and r.archived_at is null and s.sla_hours is not null and not s.is_final
          and r.status_since + make_interval(hours => s.sla_hours) < now()) z where n > 0), ''[]'')
        || case when (select status from bb_workspace where kos_id = k.id) = ''draft'' then jsonb_build_array(jsonb_build_object(''text'', ''Business Builder belum diaktifkan'', ''href'', ''/builder'', ''tone'', ''gold'')) else ''[]''::jsonb end;
    elsif k.business_type = ''jasa'' then');

select public._prasara_patch('public.admin_customers()',
  '      exists (select 1 from svc_orders o where o.kos_id = k.id) as has_order,',
  '      exists (select 1 from svc_orders o where o.kos_id = k.id) as has_order,
      -- Bisnis kustom
      exists (select 1 from bb_workspace w where w.kos_id = k.id and w.status = ''aktif'') as builder_active,
      exists (select 1 from bb_records b where b.kos_id = k.id) as has_record,
      exists (select 1 from bb_records b where b.kos_id = k.id and b.created_at >= now() - interval ''30 days'') as record_30,');
select public._prasara_patch('public.admin_customer_base(uuid)',
  '''other_businesses'',',
  '''records'', (select count(*) from bb_records where kos_id = k.id and archived_at is null),
           ''builder_status'', (select status from bb_workspace where kos_id = k.id),
           ''other_businesses'',');
select public._prasara_patch('public.admin_customers()',
  '(select max(created_at) from bookings where kos_id = k.id),',
  '(select max(created_at) from bookings where kos_id = k.id), (select max(created_at) from bb_records where kos_id = k.id),');

revoke execute on function public.bb_slug(text), public.bb_role(uuid), public.bb_kustom(uuid, text), public.bb_event(uuid, text, text), public.bb_clean(uuid, jsonb, jsonb, text),
  public.bb_title(uuid, jsonb), public.bb_strip(uuid, jsonb, text), public.bb_seed_template(uuid, text), public.bb_seed_flow(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.bb_workspace_save(uuid, jsonb), public.bb_object_save(uuid, uuid, jsonb), public.bb_field_save(uuid, uuid, uuid, jsonb),
  public.bb_workflow_save(uuid, uuid, jsonb, jsonb), public.bb_report_save(uuid, uuid, jsonb), public.bb_validate(uuid), public.bb_activate(uuid),
  public.bb_record_save(uuid, uuid, uuid, jsonb, text), public.bb_record_move(uuid, uuid, text), public.bb_record_archive(uuid, text), public.bb_list(uuid, uuid, boolean),
  public.bb_record_get(uuid), public.bb_ref_options(uuid, uuid), public.bb_dashboard(uuid), public.bb_report_run(uuid, date, date) from public, anon;
grant execute on function public.bb_workspace_save(uuid, jsonb), public.bb_object_save(uuid, uuid, jsonb), public.bb_field_save(uuid, uuid, uuid, jsonb),
  public.bb_workflow_save(uuid, uuid, jsonb, jsonb), public.bb_report_save(uuid, uuid, jsonb), public.bb_validate(uuid), public.bb_activate(uuid),
  public.bb_record_save(uuid, uuid, uuid, jsonb, text), public.bb_record_move(uuid, uuid, text), public.bb_record_archive(uuid, text), public.bb_list(uuid, uuid, boolean),
  public.bb_record_get(uuid), public.bb_ref_options(uuid, uuid), public.bb_dashboard(uuid), public.bb_report_run(uuid, date, date) to authenticated;

drop function public._prasara_patch(text, text, text);
