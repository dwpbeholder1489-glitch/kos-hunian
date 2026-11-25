-- Mesin Proyek — Tahap 1A blueprint Event, Media & Creative Production (audit: docs/AUDIT_EVENT_MEDIA_CREATIVE.md).
-- Keputusan pemilik 21 Nov 2026:
--   K1  Mesin Proyek baru (prj_*); template Business Builder lama tetap berjalan.
--   K2  Event = proyek bertipe event (data khusus event menyusul di tabel sendiri); subproyek opsional (satu tingkat).
--   K3  Uang klien sebelum serah terima = uang muka; pendapatan diakui per termin/milestone diserahkan (Tahap 1D — kolom
--       prj_milestones.amount disiapkan sekarang sebagai RENCANA nilai termin, belum menjurnal apa pun).
--   K5  Paket Bisnis (fitur `proyek`, juga di Pro). Fitur BARU → tanpa pengecualian bisnis lama.
-- Prinsip:
--   * Tidak ada uang yang bergerak di tahap ini: nilai kontrak & nilai termin hanya rencana, tidak masuk Pembukuan/laporan.
--   * Tabel tanpa policy select (baca lewat RPC) karena akses per proyek: pemilik/pengelola (settings) & PIC proyek = kelola;
--     area ops = lihat semua; anggota proyek & penanggung jawab tugas = lihat proyek itu saja (EVT-015 akses berbasis penugasan).
--   * Nilai uang hanya untuk area finance.
--   * Paket turun: data tetap bisa dibuka; hanya menyelesaikan/membatalkan proyek dan menandai tugas yang masih boleh
--     (pemilik tidak boleh terkunci dari pekerjaannya sendiri). Membuat & mengubah butuh Paket Bisnis.

-- ---------- Tabel ----------
create table if not exists public.prj_projects (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  name text not null check (length(trim(name)) between 2 and 120),
  kind text not null default 'umum' check (kind in ('event', 'kreatif', 'produksi', 'umum')),
  status text not null default 'berjalan' check (status in ('penawaran', 'berjalan', 'ditunda', 'selesai', 'batal')),
  contact_id uuid references public.contacts(id) on delete set null,
  manager_user uuid references auth.users(id) on delete set null,
  parent_id uuid references public.prj_projects(id) on delete set null,
  start_date date, end_date date,
  value numeric(14,2) check (value is null or (value >= 0 and value <= 999999999999)),
  location text check (location is null or length(location) <= 200),
  description text check (description is null or length(description) <= 2000),
  status_note text check (status_note is null or length(status_note) <= 300),
  closed_at timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (parent_id is null or parent_id <> id),
  unique (kos_id, number)
);
create index if not exists prj_projects_kos on public.prj_projects(kos_id, status);
create index if not exists prj_projects_parent on public.prj_projects(parent_id) where parent_id is not null;

create table if not exists public.prj_milestones (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  project_id uuid not null references public.prj_projects(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  due_date date,
  amount numeric(14,2) check (amount is null or (amount >= 0 and amount <= 999999999999)),   -- rencana nilai termin (Tahap 1D)
  status text not null default 'rencana' check (status in ('rencana', 'selesai')),
  done_at timestamptz, done_by uuid,
  note text check (note is null or length(note) <= 500),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists prj_milestones_project on public.prj_milestones(project_id, sort);

create table if not exists public.prj_tasks (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  project_id uuid not null references public.prj_projects(id) on delete cascade,
  milestone_id uuid references public.prj_milestones(id) on delete set null,
  title text not null check (length(trim(title)) between 2 and 200),
  assignee_user uuid references auth.users(id) on delete set null,
  due_date date,
  priority text not null default 'normal' check (priority in ('rendah', 'normal', 'tinggi')),
  status text not null default 'todo' check (status in ('todo', 'proses', 'selesai', 'batal')),
  note text check (note is null or length(note) <= 1000),
  done_at timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists prj_tasks_project on public.prj_tasks(project_id, status);
create index if not exists prj_tasks_assignee on public.prj_tasks(kos_id, assignee_user) where status in ('todo', 'proses');

create table if not exists public.prj_members (
  project_id uuid not null references public.prj_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  role_label text check (role_label is null or length(role_label) <= 40),
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

do $$ declare t text; begin
  foreach t in array array['prj_projects', 'prj_milestones', 'prj_tasks', 'prj_members'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

-- ---------- Paket, modul, fitur ----------
update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{proyek}'::text[]) f)
where v.plan_key in ('bisnis', 'pro') and v.id = (public.plan_current(v.plan_key)).id;

create or replace function public.plan_feature_codes()
returns text[] language sql immutable as $$
  select array['laporan_lengkap', 'ekspor', 'kwitansi', 'pengingat_email', 'portal_penghuni', 'email_toko',
               'portal_bisnis', 'jurnal_manual', 'anggaran', 'rekonsiliasi', 'laporan_lanjutan', 'persetujuan', 'otomatisasi',
               'akses_modul', 'akses_granular', 'persetujuan_bertingkat', 'otomatisasi_lanjutan', 'analisis_lanjutan', 'analisis_mendalam',
               'integrasi', 'gabungan_bisnis', 'proyek'];
$$;

insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, sort,
  module_type, category, impl_status, feature_keys, area, config_path, owner_approval, rel_models, rel_caps, rel_categories, benefit) values
  ('u_proyek', 'Proyek', 'Proyek event, kreatif, dan produksi: klien, PIC, jadwal, milestone & rencana termin, tugas dengan penanggung jawab, anggota tim, lampiran, dan riwayat.',
   '{jasa,kustom}', false, '{}', 'proyek', '{/proyek}', 'Proyek, milestone, tugas, anggota proyek, pelanggan', 'available', 40,
   'operational', 'operasional', 'production_ready', '{proyek}', 'ops', '/proyek', false,
   '{project}', '{uses_project_budget,uses_contracts,uses_resource_scheduling}', '{event,media,konstruksi}',
   'Setiap acara atau pekerjaan klien punya satu tempat: jadwal, milestone, tugas tiap orang, dan riwayatnya — tidak tercecer di chat.')
on conflict (code) do nothing;

-- Bisnis yang sudah ada: aktif hanya bila jenisnya relevan DAN paketnya sudah mencakup (selebihnya bisa diaktifkan di Konfigurasi › Modul)
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'u_proyek', coalesce(k.category_code in ('event', 'media', 'konstruksi') and public.plan_has(k.id, 'proyek'), false), 'sistem'
from public.kos k where k.business_type in ('jasa', 'kustom')
on conflict do nothing;

-- Bisnis baru: kos_seed_modules mengaktifkan semua modul tersedia; Proyek hanya untuk jenis yang relevan & paket yang mencakup
create or replace function public.kos_seed_proyek()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- coalesce: bisnis tanpa kategori (null) → nonaktif, bukan null (kolom active not null)
  update business_modules set active = coalesce(new.category_code in ('event', 'media', 'konstruksi') and plan_has(new.id, 'proyek'), false)
  where kos_id = new.id and module_code = 'u_proyek';
  return new;
end $$;
drop trigger if exists kos_seed_proyek on public.kos;
create trigger kos_seed_proyek after insert on public.kos for each row execute function public.kos_seed_proyek();

insert into public.relevance_rules(code, name, cond, recommend, reason, event) values
  ('PROJECT_WORK', 'Bekerja per proyek', '{"models_any":["project"]}', '{u_proyek}', 'Bisnis Anda bekerja per proyek/acara untuk klien', null),
  ('PROJECT_CATEGORY', 'Event, kreatif & kontraktor', '{"categories_any":["event","media","konstruksi"]}', '{u_proyek}', 'Jenis usaha Anda biasanya dikelola per proyek atau acara', null)
on conflict (code) do nothing;

-- ---------- Akses ----------
-- 'kelola' = pemilik/pengelola (settings) atau PIC proyek; 'lihat' = area ops, anggota proyek, atau penanggung jawab tugas di proyek itu
create or replace function public.prj_access(p_project uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare p prj_projects;
begin
  select * into p from prj_projects where id = p_project;
  if p.id is null or not is_member(p.kos_id) then return null; end if;
  if member_in('settings', p.kos_id) then return 'kelola'; end if;
  if p.manager_user = auth.uid() then return 'kelola'; end if;
  if member_in('ops', p.kos_id)
     or exists (select 1 from prj_members m where m.project_id = p.id and m.user_id = auth.uid())
     or exists (select 1 from prj_tasks t where t.project_id = p.id and t.assignee_user = auth.uid()) then return 'lihat'; end if;
  return null;
end $$;

-- Modul aktif (selalu) + paket mencakup (untuk membuat/mengubah)
create or replace function public.prj_guard(p_kos uuid, p_write boolean)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if not module_on(p_kos, 'u_proyek') then raise exception 'Modul Proyek belum aktif (Konfigurasi › Modul)'; end if;
  if p_write and not plan_has(p_kos, 'proyek') then
    raise exception 'BATAS_PAKET: Proyek tersedia mulai Paket Bisnis. Proyek yang sudah ada tetap bisa dibuka, diselesaikan, atau dibatalkan.';
  end if;
end $$;

create or replace function public.prj_user_label(p_user uuid)
returns text language sql stable security definer set search_path = public, auth as $$
  select coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), u.email) from auth.users u where u.id = p_user;
$$;

-- ---------- Riwayat (domain_events: aggregate 'project' = id proyek, termasuk kejadian tugas & milestone) ----------
create or replace function public.prj_emit(p_project uuid, p_type text, p_key text, p_summary text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare p prj_projects;
begin
  select * into p from prj_projects where id = p_project;
  perform dom_emit(p.kos_id, p_type, 'project', p.id, p_key, 'ops', p.number || ' · ' || p_summary, null, coalesce(p_payload, '{}'));
end $$;

create or replace function public.dom_prj_projects() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform dom_emit(new.kos_id, 'ProjectCreated', 'project', new.id, new.id::text, 'ops', new.number || ' · Proyek dibuat · ' || new.name, null,
      jsonb_build_object('kind', new.kind, 'status', new.status));
  elsif new.status is distinct from old.status then
    perform dom_emit(new.kos_id, 'ProjectStatusChanged', 'project', new.id, new.id::text || ':' || new.status || ':' || extract(epoch from now())::bigint::text, 'ops',
      new.number || ' · ' || old.status || ' → ' || new.status || coalesce(' · ' || new.status_note, ''), null,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return null;
end $$;
drop trigger if exists dom_prj_projects on public.prj_projects;
create trigger dom_prj_projects after insert or update of status on public.prj_projects for each row execute function public.dom_prj_projects();

create or replace function public.dom_prj_tasks() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'selesai' and (tg_op = 'INSERT' or old.status <> 'selesai') then
    perform prj_emit(new.project_id, 'TaskCompleted', new.id::text || ':' || extract(epoch from now())::bigint::text, 'Tugas selesai · ' || new.title,
      jsonb_build_object('task_id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists dom_prj_tasks on public.prj_tasks;
create trigger dom_prj_tasks after insert or update of status on public.prj_tasks for each row execute function public.dom_prj_tasks();

create or replace function public.dom_prj_milestones() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'selesai' and (tg_op = 'INSERT' or old.status <> 'selesai') then
    perform prj_emit(new.project_id, 'MilestoneCompleted', new.id::text || ':' || extract(epoch from now())::bigint::text, 'Milestone selesai · ' || new.name,
      jsonb_build_object('milestone_id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists dom_prj_milestones on public.prj_milestones;
create trigger dom_prj_milestones after insert or update of status on public.prj_milestones for each row execute function public.dom_prj_milestones();

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.event_label(text)',
  'else p_type end;',
  'when ''ProjectCreated'' then ''Proyek baru'' when ''ProjectStatusChanged'' then ''Status proyek'' when ''ProjectUpdated'' then ''Proyek diubah''
    when ''MilestoneCompleted'' then ''Milestone selesai'' when ''TaskCompleted'' then ''Tugas selesai'' when ''TaskAssigned'' then ''Tugas diberikan''
    when ''ProjectMemberChanged'' then ''Anggota proyek'' else p_type end;');

-- ---------- Lampiran proyek (dokumen kecil: kontrak, brief, foto lokasi). File karya besar = tautan eksternal (K4, Tahap 2) ----------
alter table public.attachments drop constraint if exists attachments_entity_check;
alter table public.attachments add constraint attachments_entity_check check (entity in ('bb_record', 'svc_order', 'maint_ticket', 'occupant', 'expense', 'project'));
select public._prasara_patch('public.att_target(text,uuid)',
  '  else
    raise exception ''Jenis data tidak dikenal'';',
  '  elsif p_entity = ''project'' then
    select p.kos_id, ''ops,settings'', ''ops,settings'' into kos_id, read_area, write_area from prj_projects p where p.id = p_id;
  else
    raise exception ''Jenis data tidak dikenal'';');
select public._prasara_patch('public.att_log(text,uuid,text)',
  '  elsif p_entity = ''maint_ticket'' then',
  '  elsif p_entity = ''project'' then perform prj_emit(p_id, ''ProjectUpdated'', p_id::text || '':att:'' || md5(p_text || clock_timestamp()::text), p_text, ''{}''::jsonb);
  elsif p_entity = ''maint_ticket'' then');
drop trigger if exists att_gone on public.prj_projects;
create trigger att_gone after delete on public.prj_projects for each row execute function public.att_parent_gone('project');

-- ---------- Ringkasan per proyek (dipakai daftar & detail) ----------
create or replace function public.prj_row(p prj_projects, p_fin boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'number', p.number, 'name', p.name, 'kind', p.kind, 'status', p.status,
    'contact_id', p.contact_id, 'client', (select name from contacts where id = p.contact_id),
    'manager_user', p.manager_user, 'manager', prj_user_label(p.manager_user),
    'parent_id', p.parent_id, 'parent', (select number || ' · ' || name from prj_projects where id = p.parent_id),
    'start_date', p.start_date, 'end_date', p.end_date, 'location', p.location, 'description', p.description,
    'status_note', p.status_note, 'closed_at', p.closed_at, 'created_at', p.created_at,
    'value', case when p_fin then p.value end,
    'tasks_total', t.total, 'tasks_done', t.done, 'tasks_open', t.open, 'tasks_late', t.late,
    'progress', case when t.total > 0 then round(100.0 * t.done / t.total) end,
    'next_milestone', (select jsonb_build_object('name', m.name, 'due_date', m.due_date) from prj_milestones m
                       where m.project_id = p.id and m.status = 'rencana' order by m.due_date nulls last, m.sort limit 1),
    'subprojects', (select count(*) from prj_projects c where c.parent_id = p.id))
  from (select count(*) filter (where status <> 'batal') total, count(*) filter (where status = 'selesai') done,
               count(*) filter (where status in ('todo', 'proses')) open,
               count(*) filter (where status in ('todo', 'proses') and due_date < (now() at time zone 'Asia/Jakarta')::date) late
        from prj_tasks where project_id = p.id) t;
$$;

-- ---------- Daftar ----------
create or replace function public.prj_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_fin boolean; v_all boolean; v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  perform prj_guard(p_kos, false);
  v_fin := member_in('finance', p_kos);
  v_all := member_in('settings,ops', p_kos);
  return jsonb_build_object(
    'allowed', plan_has(p_kos, 'proyek'),
    'can_create', member_in('settings', p_kos),
    'fin', v_fin,
    'projects', (select coalesce(jsonb_agg(prj_row(p, v_fin) order by case p.status when 'berjalan' then 0 when 'penawaran' then 1 when 'ditunda' then 2 else 3 end,
                                           p.end_date nulls last, p.created_at desc), '[]')
                 from prj_projects p where p.kos_id = p_kos
                   and (v_all or p.manager_user = auth.uid()
                        or exists (select 1 from prj_members m where m.project_id = p.id and m.user_id = auth.uid())
                        or exists (select 1 from prj_tasks t where t.project_id = p.id and t.assignee_user = auth.uid()))),
    'mine', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'due_date', t.due_date, 'priority', t.priority,
                                                          'project_id', p.id, 'project', p.number || ' · ' || p.name, 'late', t.due_date < v_today)
                                       order by t.due_date nulls last, t.created_at), '[]')
             from prj_tasks t join prj_projects p on p.id = t.project_id
             where t.kos_id = p_kos and t.assignee_user = auth.uid() and t.status in ('todo', 'proses') and p.status not in ('selesai', 'batal')));
end $$;

-- ---------- Detail ----------
create or replace function public.prj_get(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare p prj_projects; v_acc text; v_fin boolean;
begin
  select * into p from prj_projects where id = p_project;
  v_acc := prj_access(p_project);
  if p.id is null or v_acc is null then raise exception 'Proyek tidak ditemukan'; end if;
  perform prj_guard(p.kos_id, false);
  v_fin := member_in('finance', p.kos_id);
  return prj_row(p, v_fin) || jsonb_build_object(
    'access', v_acc, 'fin', v_fin, 'allowed', plan_has(p.kos_id, 'proyek'), 'me', auth.uid(),
    'milestones', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'due_date', m.due_date, 'status', m.status, 'note', m.note,
                     'amount', case when v_fin then m.amount end, 'done_at', m.done_at, 'sort', m.sort,
                     'tasks_total', (select count(*) from prj_tasks t where t.milestone_id = m.id and t.status <> 'batal'),
                     'tasks_done', (select count(*) from prj_tasks t where t.milestone_id = m.id and t.status = 'selesai'))
                   order by m.sort, m.due_date nulls last, m.created_at), '[]') from prj_milestones m where m.project_id = p.id),
    'milestone_total', case when v_fin then (select sum(amount) from prj_milestones where project_id = p.id) end,
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'priority', t.priority, 'due_date', t.due_date,
                'note', t.note, 'milestone_id', t.milestone_id, 'assignee_user', t.assignee_user, 'assignee', prj_user_label(t.assignee_user), 'done_at', t.done_at)
              order by case t.status when 'proses' then 0 when 'todo' then 1 when 'selesai' then 2 else 3 end, t.due_date nulls last, t.created_at), '[]')
              from prj_tasks t where t.project_id = p.id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', prj_user_label(m.user_id), 'role_label', m.role_label) order by m.added_at), '[]')
                from prj_members m where m.project_id = p.id),
    'children', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'number', c.number, 'name', c.name, 'status', c.status) order by c.created_at), '[]')
                 from prj_projects c where c.parent_id = p.id and prj_access(c.id) is not null),   -- hanya subproyek yang boleh dibuka
    'history', (select coalesce(jsonb_agg(jsonb_build_object('label', event_label(e.event_type), 'summary', e.summary, 'at', e.occurred_at,
                  'actor', coalesce(prj_user_label(e.actor_id), 'sistem')) order by e.id desc), '[]')
                from (select * from domain_events where kos_id = p.kos_id and aggregate_type = 'project' and aggregate_id = p.id order by id desc limit 100) e),
    -- pilihan untuk formulir (hanya pengelola proyek)
    'team', case when v_acc = 'kelola' then (select coalesce(jsonb_agg(jsonb_build_object('user_id', km.user_id, 'name', prj_user_label(km.user_id), 'role', km.role)
                   order by km.role = 'pemilik' desc, prj_user_label(km.user_id)), '[]') from kos_members km where km.kos_id = p.kos_id and km.active) end);
end $$;

-- Pilihan formulir proyek baru: pelanggan, tim, proyek induk
create or replace function public.prj_form_options(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform prj_guard(p_kos, false);
  if not member_in('settings', p_kos) and not exists (select 1 from prj_projects where kos_id = p_kos and manager_user = auth.uid()) then
    raise exception 'Hanya pemilik, pengelola, atau PIC proyek';
  end if;
  return jsonb_build_object(
    'clients', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone) order by c.name), '[]')
                from contacts c where c.kos_id = p_kos and c.kind = 'pelanggan' and c.archived_at is null),
    'team', (select coalesce(jsonb_agg(jsonb_build_object('user_id', km.user_id, 'name', prj_user_label(km.user_id), 'role', km.role)
               order by km.role = 'pemilik' desc, prj_user_label(km.user_id)), '[]') from kos_members km where km.kos_id = p_kos and km.active),
    'parents', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'label', p.number || ' · ' || p.name) order by p.created_at desc), '[]')
                from prj_projects p where p.kos_id = p_kos and p.parent_id is null and p.status not in ('selesai', 'batal')));
end $$;

-- ---------- Simpan proyek ----------
-- data: name, kind, status (hanya saat membuat: penawaran|berjalan), contact_id ATAU client_name (+client_phone) = pelanggan baru,
--       manager_user, parent_id, start_date, end_date, value (hanya finance; selain itu diabaikan), location, description
create or replace function public.prj_save(p_kos uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare p prj_projects; v_id uuid := coalesce(p_id, gen_random_uuid()); v_new boolean; v_contact uuid; v_mgr uuid; v_parent uuid;
        v_name text := trim(coalesce(p_data->>'name', '')); v_kind text := coalesce(nullif(p_data->>'kind', ''), 'umum');
        v_start date := nullif(p_data->>'start_date', '')::date; v_end date := nullif(p_data->>'end_date', '')::date;
        v_value numeric; v_num text; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_changes text[] := '{}';
begin
  perform prj_guard(p_kos, true);
  select * into p from prj_projects where id = p_id and kos_id = p_kos;
  v_new := p.id is null;
  if v_new and p_id is not null and exists (select 1 from prj_projects where id = p_id) then raise exception 'Proyek tidak ditemukan'; end if;
  if v_new and not member_in('settings', p_kos) then raise exception 'Hanya pemilik atau pengelola yang bisa membuat proyek'; end if;
  if not v_new and prj_access(p.id) is distinct from 'kelola' then raise exception 'Hanya pemilik, pengelola, atau PIC proyek ini yang bisa mengubahnya'; end if;
  if not v_new and p.status in ('selesai', 'batal') then raise exception 'Proyek sudah %. Buka lagi dulu bila perlu diubah.', p.status; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'Nama proyek 2–120 huruf'; end if;
  if v_kind not in ('event', 'kreatif', 'produksi', 'umum') then raise exception 'Jenis proyek tidak dikenal'; end if;
  if v_start is not null and v_end is not null and v_end < v_start then raise exception 'Tanggal selesai tidak boleh sebelum tanggal mulai'; end if;
  if v_start is not null and v_start < v_today - 3650 then raise exception 'Tanggal mulai terlalu jauh ke belakang'; end if;
  -- klien
  if nullif(p_data->>'contact_id', '') is not null then
    select id into v_contact from contacts where id = (p_data->>'contact_id')::uuid and kos_id = p_kos and kind = 'pelanggan';
    if v_contact is null then raise exception 'Pelanggan tidak ditemukan'; end if;
  elsif length(trim(coalesce(p_data->>'client_name', ''))) >= 1 then
    if length(trim(p_data->>'client_name')) > 80 then raise exception 'Nama klien maks. 80 huruf'; end if;
    insert into contacts(kos_id, kind, name, phone) values (p_kos, 'pelanggan', trim(p_data->>'client_name'), nullif(trim(coalesce(p_data->>'client_phone', '')), ''))
    returning id into v_contact;
  end if;
  -- PIC
  if nullif(p_data->>'manager_user', '') is not null then
    select user_id into v_mgr from kos_members where kos_id = p_kos and user_id = (p_data->>'manager_user')::uuid and active;
    if v_mgr is null then raise exception 'PIC harus anggota tim bisnis ini'; end if;
  end if;
  -- proyek induk: satu tingkat saja, bisnis yang sama
  if nullif(p_data->>'parent_id', '') is not null then
    select id into v_parent from prj_projects where id = (p_data->>'parent_id')::uuid and kos_id = p_kos and parent_id is null;
    if v_parent is null or v_parent = v_id then raise exception 'Proyek induk tidak valid (subproyek hanya satu tingkat)'; end if;
    if not v_new and exists (select 1 from prj_projects where parent_id = v_id) then raise exception 'Proyek ini sudah punya subproyek, jadi tidak bisa menjadi subproyek'; end if;
  end if;
  -- nilai kontrak: hanya bagian keuangan; selain itu nilai lama dipertahankan
  if member_in('finance', p_kos) then
    v_value := nullif(p_data->>'value', '')::numeric;
    if v_value is not null and (v_value < 0 or v_value > 999999999999) then raise exception 'Nilai kontrak tidak valid'; end if;
  else
    v_value := p.value;
  end if;

  if v_new then
    perform pg_advisory_xact_lock(hashtext('prj_number:' || p_kos::text));
    v_num := 'PRJ-' || to_char(v_today, 'YYMM') || '-' || lpad((
      coalesce((select max(substring(number from '\d+$')::int) from prj_projects where kos_id = p_kos and number like 'PRJ-' || to_char(v_today, 'YYMM') || '-%'), 0) + 1)::text, 3, '0');
    insert into prj_projects(id, kos_id, number, name, kind, status, contact_id, manager_user, parent_id, start_date, end_date, value, location, description)
    values (v_id, p_kos, v_num, v_name, v_kind, case when p_data->>'status' = 'penawaran' then 'penawaran' else 'berjalan' end,
            v_contact, coalesce(v_mgr, auth.uid()),
            v_parent, v_start, v_end, v_value,
            nullif(left(trim(coalesce(p_data->>'location', '')), 200), ''), nullif(left(trim(coalesce(p_data->>'description', '')), 2000), ''));
  else
    if p.name is distinct from v_name then v_changes := v_changes || 'nama'; end if;
    if p.contact_id is distinct from v_contact then v_changes := v_changes || 'klien'; end if;
    if p.manager_user is distinct from v_mgr then v_changes := v_changes || 'PIC'; end if;
    if p.start_date is distinct from v_start or p.end_date is distinct from v_end then v_changes := v_changes || 'jadwal'; end if;
    if p.value is distinct from v_value then v_changes := v_changes || 'nilai kontrak'; end if;
    if p.kind is distinct from v_kind then v_changes := v_changes || 'jenis'; end if;
    if p.parent_id is distinct from v_parent then v_changes := v_changes || 'proyek induk'; end if;
    update prj_projects set name = v_name, kind = v_kind, contact_id = v_contact, manager_user = v_mgr, parent_id = v_parent,
      start_date = v_start, end_date = v_end, value = v_value,
      location = nullif(left(trim(coalesce(p_data->>'location', '')), 200), ''), description = nullif(left(trim(coalesce(p_data->>'description', '')), 2000), ''),
      updated_at = now()
    where id = p.id;
    if array_length(v_changes, 1) > 0 then
      perform prj_emit(p.id, 'ProjectUpdated', p.id::text || ':ubah:' || extract(epoch from clock_timestamp())::text, 'Diubah: ' || array_to_string(v_changes, ', '), '{}'::jsonb);
    end if;
  end if;
  return v_id;
end $$;

-- ---------- Status proyek ----------
-- Longgar (jangan menghalangi kenyataan): semua perpindahan boleh; batal & membuka lagi wajib alasan.
-- Selesai/batal tetap boleh walau paket sudah turun. Hasil: jumlah tugas yang masih terbuka (peringatan, tidak menahan).
create or replace function public.prj_status(p_project uuid, p_status text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p prj_projects; v_note text := nullif(trim(coalesce(p_note, '')), ''); v_open int;
begin
  select * into p from prj_projects where id = p_project;
  if p.id is null or prj_access(p.id) is distinct from 'kelola' then raise exception 'Hanya pemilik, pengelola, atau PIC proyek ini yang bisa mengubah status'; end if;
  perform prj_guard(p.kos_id, p_status not in ('selesai', 'batal'));
  if p_status not in ('penawaran', 'berjalan', 'ditunda', 'selesai', 'batal') then raise exception 'Status tidak dikenal'; end if;
  if p_status = p.status then raise exception 'Status proyek sudah %', p_status; end if;
  if p_status = 'batal' and coalesce(length(v_note), 0) < 3 then raise exception 'Tuliskan alasan pembatalan (min. 3 huruf)'; end if;
  if p.status in ('selesai', 'batal') and coalesce(length(v_note), 0) < 3 then raise exception 'Tuliskan alasan membuka lagi proyek ini (min. 3 huruf)'; end if;
  if v_note is not null and length(v_note) > 300 then raise exception 'Catatan maks. 300 huruf'; end if;
  select count(*) into v_open from prj_tasks where project_id = p.id and status in ('todo', 'proses');
  update prj_projects set status = p_status, status_note = v_note,
    closed_at = case when p_status in ('selesai', 'batal') then now() end, updated_at = now()
  where id = p.id;
  return jsonb_build_object('ok', true, 'open_tasks', v_open);
end $$;

-- ---------- Milestone ----------
create or replace function public.prj_milestone_save(p_project uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare p prj_projects; m prj_milestones; v_id uuid := coalesce(p_id, gen_random_uuid()); v_amount numeric;
        v_name text := trim(coalesce(p_data->>'name', ''));
begin
  select * into p from prj_projects where id = p_project;
  if p.id is null or prj_access(p.id) is distinct from 'kelola' then raise exception 'Hanya pemilik, pengelola, atau PIC proyek'; end if;
  perform prj_guard(p.kos_id, true);
  if p.status in ('selesai', 'batal') then raise exception 'Proyek sudah %', p.status; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'Nama milestone 2–120 huruf'; end if;
  if p_id is not null then
    select * into m from prj_milestones where id = p_id and project_id = p.id;
    if m.id is null then raise exception 'Milestone tidak ditemukan'; end if;
  elsif (select count(*) from prj_milestones where project_id = p.id) >= 50 then raise exception 'Maksimal 50 milestone per proyek';
  end if;
  if member_in('finance', p.kos_id) then
    v_amount := nullif(p_data->>'amount', '')::numeric;
    if v_amount is not null and (v_amount < 0 or v_amount > 999999999999) then raise exception 'Nilai termin tidak valid'; end if;
  else
    v_amount := m.amount;
  end if;
  insert into prj_milestones(id, kos_id, project_id, name, due_date, amount, note, sort)
  values (v_id, p.kos_id, p.id, v_name, nullif(p_data->>'due_date', '')::date, v_amount, nullif(left(trim(coalesce(p_data->>'note', '')), 500), ''),
          coalesce(nullif(p_data->>'sort', '')::int, (select coalesce(max(sort), 0) + 1 from prj_milestones where project_id = p.id)))
  on conflict (id) do update set name = excluded.name, due_date = excluded.due_date, amount = excluded.amount, note = excluded.note,
    sort = coalesce(nullif(p_data->>'sort', '')::int, prj_milestones.sort);
  return v_id;
end $$;

create or replace function public.prj_milestone_done(p_id uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m prj_milestones;
begin
  select * into m from prj_milestones where id = p_id;
  if m.id is null or prj_access(m.project_id) is distinct from 'kelola' then raise exception 'Hanya pemilik, pengelola, atau PIC proyek'; end if;
  perform prj_guard(m.kos_id, false);
  update prj_milestones set status = case when p_done then 'selesai' else 'rencana' end,
    done_at = case when p_done then now() end, done_by = case when p_done then auth.uid() end
  where id = m.id;
end $$;

create or replace function public.prj_milestone_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m prj_milestones;
begin
  select * into m from prj_milestones where id = p_id;
  if m.id is null or prj_access(m.project_id) is distinct from 'kelola' then raise exception 'Hanya pemilik, pengelola, atau PIC proyek'; end if;
  perform prj_guard(m.kos_id, true);
  if m.status = 'selesai' then raise exception 'Milestone yang sudah selesai tidak bisa dihapus. Tandai belum selesai dulu bila keliru.'; end if;
  delete from prj_milestones where id = m.id;   -- tugasnya tetap ada (milestone_id jadi kosong)
end $$;

-- ---------- Tugas ----------
create or replace function public.prj_task_save(p_project uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare p prj_projects; t prj_tasks; v_id uuid := coalesce(p_id, gen_random_uuid()); v_ms uuid; v_user uuid;
        v_title text := trim(coalesce(p_data->>'title', '')); v_pri text := coalesce(nullif(p_data->>'priority', ''), 'normal');
begin
  select * into p from prj_projects where id = p_project;
  if p.id is null or prj_access(p.id) is distinct from 'kelola' then raise exception 'Hanya pemilik, pengelola, atau PIC proyek yang bisa membuat/mengubah tugas'; end if;
  perform prj_guard(p.kos_id, true);
  if p.status in ('selesai', 'batal') then raise exception 'Proyek sudah %', p.status; end if;
  if length(v_title) < 2 or length(v_title) > 200 then raise exception 'Judul tugas 2–200 huruf'; end if;
  if v_pri not in ('rendah', 'normal', 'tinggi') then raise exception 'Prioritas tidak dikenal'; end if;
  if p_id is not null then
    select * into t from prj_tasks where id = p_id and project_id = p.id;
    if t.id is null then raise exception 'Tugas tidak ditemukan'; end if;
  elsif (select count(*) from prj_tasks where project_id = p.id) >= 500 then raise exception 'Maksimal 500 tugas per proyek';
  end if;
  if nullif(p_data->>'milestone_id', '') is not null then
    select id into v_ms from prj_milestones where id = (p_data->>'milestone_id')::uuid and project_id = p.id;
    if v_ms is null then raise exception 'Milestone tidak ditemukan di proyek ini'; end if;
  end if;
  if nullif(p_data->>'assignee_user', '') is not null then
    select user_id into v_user from kos_members where kos_id = p.kos_id and user_id = (p_data->>'assignee_user')::uuid and active;
    if v_user is null then raise exception 'Penanggung jawab harus anggota tim bisnis ini'; end if;
  end if;
  insert into prj_tasks(id, kos_id, project_id, milestone_id, title, assignee_user, due_date, priority, note)
  values (v_id, p.kos_id, p.id, v_ms, v_title, v_user, nullif(p_data->>'due_date', '')::date, v_pri, nullif(left(trim(coalesce(p_data->>'note', '')), 1000), ''))
  on conflict (id) do update set milestone_id = excluded.milestone_id, title = excluded.title, assignee_user = excluded.assignee_user,
    due_date = excluded.due_date, priority = excluded.priority, note = excluded.note, updated_at = now();
  if v_user is not null and v_user is distinct from t.assignee_user then
    perform prj_emit(p.id, 'TaskAssigned', v_id::text || ':' || v_user::text || ':' || extract(epoch from clock_timestamp())::text,
      'Tugas "' || v_title || '" untuk ' || coalesce(prj_user_label(v_user), '-'), jsonb_build_object('task_id', v_id));
  end if;
  return v_id;
end $$;

-- Status tugas: pengelola proyek, atau penanggung jawab tugas itu sendiri. Boleh walau paket turun (pekerjaan tidak terhenti).
create or replace function public.prj_task_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare t prj_tasks; p prj_projects;
begin
  select * into t from prj_tasks where id = p_id;
  if t.id is null then raise exception 'Tugas tidak ditemukan'; end if;
  select * into p from prj_projects where id = t.project_id;
  -- coalesce: tugas tanpa penanggung jawab (null) tidak boleh lolos pemeriksaan
  if not (coalesce(prj_access(p.id) = 'kelola', false) or (coalesce(t.assignee_user = auth.uid(), false) and is_member(t.kos_id))) then
    raise exception 'Hanya penanggung jawab tugas atau pengelola proyek yang bisa mengubah status tugas';
  end if;
  perform prj_guard(t.kos_id, false);
  if p_status not in ('todo', 'proses', 'selesai', 'batal') then raise exception 'Status tidak dikenal'; end if;
  if p_status = 'batal' and prj_access(p.id) is distinct from 'kelola' then raise exception 'Hanya pengelola proyek yang bisa membatalkan tugas'; end if;
  if p.status = 'batal' then raise exception 'Proyek sudah batal'; end if;
  update prj_tasks set status = p_status, done_at = case when p_status = 'selesai' then coalesce(done_at, now()) end, updated_at = now() where id = t.id;
end $$;

create or replace function public.prj_task_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t prj_tasks;
begin
  select * into t from prj_tasks where id = p_id;
  if t.id is null or prj_access(t.project_id) is distinct from 'kelola' then raise exception 'Hanya pemilik, pengelola, atau PIC proyek'; end if;
  perform prj_guard(t.kos_id, true);
  if t.status = 'selesai' then raise exception 'Tugas yang sudah selesai tidak dihapus (jejak pekerjaan). Ubah statusnya bila keliru.'; end if;
  delete from prj_tasks where id = t.id;
end $$;

-- ---------- Anggota proyek ----------
create or replace function public.prj_member_set(p_project uuid, p_user uuid, p_on boolean, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare p prj_projects;
begin
  select * into p from prj_projects where id = p_project;
  if p.id is null or prj_access(p.id) is distinct from 'kelola' then raise exception 'Hanya pemilik, pengelola, atau PIC proyek'; end if;
  perform prj_guard(p.kos_id, p_on);
  if p_on then
    if not exists (select 1 from kos_members where kos_id = p.kos_id and user_id = p_user and active) then raise exception 'Anggota harus anggota tim bisnis ini'; end if;
    if (select count(*) from prj_members where project_id = p.id) >= 50 then raise exception 'Maksimal 50 anggota per proyek'; end if;
    insert into prj_members(project_id, user_id, kos_id, role_label) values (p.id, p_user, p.kos_id, nullif(left(trim(coalesce(p_role, '')), 40), ''))
    on conflict (project_id, user_id) do update set role_label = excluded.role_label;
  else
    delete from prj_members where project_id = p.id and user_id = p_user;
  end if;
  perform prj_emit(p.id, 'ProjectMemberChanged', p.id::text || ':' || p_user::text || ':' || extract(epoch from clock_timestamp())::text,
    case when p_on then 'Anggota: ' else 'Keluar dari proyek: ' end || coalesce(prj_user_label(p_user), '-') || coalesce(' (' || nullif(trim(p_role), '') || ')', ''), '{}'::jsonb);
end $$;

-- ---------- Penawaran upgrade ----------
alter table public.growth_rules drop constraint if exists growth_rules_trigger_event_check;
alter table public.growth_rules add constraint growth_rules_trigger_event_check
  check (trigger_event is null or trigger_event in ('LAPORAN.DIBUKA', 'TRANSAKSI.PERTAMA', 'REPORT.ADVANCED_REQUESTED', 'PORTAL.PUBLIC_PAGE.REQUESTED',
    'PORTAL.CATALOG.REQUESTED', 'PORTAL.REGISTRATION.REQUESTED', 'PORTAL.BOOKING.REQUESTED', 'PORTAL.SYNC.REQUESTED',
    'FINANCE.MANUAL_JOURNAL_REQUESTED', 'FINANCE.RECONCILIATION_REQUESTED', 'BUDGET.CREATE_REQUESTED', 'TRANSACTION.APPROVAL_REQUESTED', 'WORKFLOW.REQUESTED',
    'ACCESS.MODULE.REQUESTED', 'ACCESS.GRANULAR.REQUESTED', 'APPROVAL.MULTILEVEL.REQUESTED', 'WORKFLOW.ADVANCED.REQUESTED',
    'ANALYTICS.ADVANCED.REQUESTED', 'ANALYTICS.MULTI_BRANCH.REQUESTED', 'INTEGRATION.REQUESTED', 'PORTFOLIO.CONSOLIDATION.REQUESTED',
    'PROJECT.REQUESTED'));
select public._prasara_patch('public.growth_event_feature(text)',
  'when ''PORTFOLIO.CONSOLIDATION.REQUESTED'' then ''gabungan_bisnis'' end;',
  'when ''PORTFOLIO.CONSOLIDATION.REQUESTED'' then ''gabungan_bisnis'' when ''PROJECT.REQUESTED'' then ''proyek'' end;');
insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select 'UPGRADE.PROJECT.' || upper(p.k), 'Proyek event & kreatif (' || p.n || ')', 'fitur', 'upgrade', p.k, 'bisnis', 1, 'PROJECT.REQUESTED',
  'Kelola setiap acara & pekerjaan klien sebagai proyek.',
  'Paket Bisnis memberi tiap proyek satu tempat: klien, PIC, jadwal, milestone & rencana termin, tugas tiap anggota tim, lampiran, dan riwayat lengkap.',
  'Upgrade ke Paket Bisnis', 'Nanti saja', 30, 7, false, 'sistem'
from (values ('gratis', 'Gratis'), ('dasar', 'Dasar')) as p(k, n)
on conflict (id) do nothing;

-- Pendaftaran: modul Proyek hanya ditawarkan di Pusat Konfirmasi bila paket sudah mencakupnya. Item yang tidak bisa disetujui
-- (masa coba = Paket Dasar) hanya akan menghalangi aktivasi; setelah upgrade modul diaktifkan lewat Konfigurasi › Modul / rekomendasi.
select public._prasara_patch('public.setup_generate(uuid)',
  'and status = ''available'' and code <> ''j_antar'' order by sort loop',
  'and status = ''available'' and code <> ''j_antar''
             and not (code = ''u_proyek'' and not plan_has(p_kos, ''proyek'')) order by sort loop');

drop function public._prasara_patch(text, text, text);

-- ---------- Hak eksekusi ----------
revoke execute on function public.prj_access(uuid), public.prj_guard(uuid, boolean), public.prj_user_label(uuid), public.prj_emit(uuid, text, text, text, jsonb),
  public.prj_row(public.prj_projects, boolean), public.dom_prj_projects(), public.dom_prj_tasks(), public.dom_prj_milestones(), public.kos_seed_proyek()
  from public, anon, authenticated;
revoke execute on function public.prj_list(uuid), public.prj_get(uuid), public.prj_form_options(uuid), public.prj_save(uuid, uuid, jsonb),
  public.prj_status(uuid, text, text), public.prj_milestone_save(uuid, uuid, jsonb), public.prj_milestone_done(uuid, boolean), public.prj_milestone_delete(uuid),
  public.prj_task_save(uuid, uuid, jsonb), public.prj_task_status(uuid, text), public.prj_task_delete(uuid), public.prj_member_set(uuid, uuid, boolean, text)
  from public, anon;
grant execute on function public.prj_list(uuid), public.prj_get(uuid), public.prj_form_options(uuid), public.prj_save(uuid, uuid, jsonb),
  public.prj_status(uuid, text, text), public.prj_milestone_save(uuid, uuid, jsonb), public.prj_milestone_done(uuid, boolean), public.prj_milestone_delete(uuid),
  public.prj_task_save(uuid, uuid, jsonb), public.prj_task_status(uuid, text), public.prj_task_delete(uuid), public.prj_member_set(uuid, uuid, boolean, text)
  to authenticated;
