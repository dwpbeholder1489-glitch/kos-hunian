-- Workspace Event (Tahap A Master Prompt "PRASARA Event Business Management", 22 Nov 2026).
-- Keputusan pemilik:
--   E1  Bisnis event memakai Mesin Proyek saja (menu Business Builder disembunyikan di frontend; data Builder tidak disentuh).
--   E2  Status event 8 tahap: OTOMATIS dari data + bisa diubah pemilik (prj_event_status / prj_stage_set).
--   E3  Paket: INTI (Paket Dasar) = Beranda Event, event, kalender, tugas, pelanggan, tagihan DP & pelunasan;
--       LANJUTAN (Paket Bisnis/Pro, fitur `proyek_lanjut`) = penawaran, anggaran & laba, komitmen vendor, laporan laba.
--       Mengubah keputusan K5 (sebelumnya semua Proyek = Paket Bisnis).
--   E4  Bertahap: Tahap A = navigasi + Beranda Event + status + cover + kalender.

-- ---------- 1) Paket ----------
update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{proyek}'::text[]) f)
where v.plan_key = 'dasar' and v.id = (public.plan_current(v.plan_key)).id;
update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{proyek_lanjut}'::text[]) f)
where v.plan_key in ('bisnis', 'pro') and v.id = (public.plan_current(v.plan_key)).id;

-- Tambahkan kode fitur tanpa menimpa kode lain yang ditambahkan migrasi sesudah 21 Nov (mis. laporan_investor)
do $$ begin
  execute format('create or replace function public.plan_feature_codes() returns text[] language sql immutable as $f$ select %L::text[] $f$',
    (select array_agg(distinct x) from unnest(public.plan_feature_codes() || '{proyek_lanjut}'::text[]) x));
end $$;

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

-- Fitur lanjutan: membuat/mengubah penawaran, anggaran, biaya, komitmen butuh Paket Bisnis (membaca data sendiri tetap boleh)
select public._prasara_patch('public.quote_guard(uuid,boolean)',
  '  perform prj_guard(p_kos, p_write);',
  '  perform prj_guard(p_kos, p_write);
  if p_write and not plan_has(p_kos, ''proyek_lanjut'') then
    raise exception ''BATAS_PAKET: Penawaran & perubahan scope tersedia mulai Paket Bisnis. Penawaran yang sudah ada tetap bisa dibuka.'';
  end if;');
select public._prasara_patch('public.prj_cost_guard(uuid,boolean)',
  '  perform prj_guard(p.kos_id, p_write);',
  '  perform prj_guard(p.kos_id, p_write);
  if p_write and not plan_has(p.kos_id, ''proyek_lanjut'') then
    raise exception ''BATAS_PAKET: Anggaran, biaya & laba per event tersedia mulai Paket Bisnis. Data yang sudah ada tetap bisa dibuka.'';
  end if;');

-- Modul Proyek kini juga untuk Paket Dasar: aktifkan untuk bisnis event/media/konstruksi yang paketnya sekarang mencakup
update public.business_modules bm set active = true, updated_at = now(), updated_by = 'sistem'
from public.kos k
where bm.kos_id = k.id and bm.module_code = 'u_proyek' and not bm.active
  and k.category_code in ('event', 'media', 'konstruksi') and public.plan_has(k.id, 'proyek');

-- Pelanggan & vendor (contacts) untuk bisnis kustom (event): modul r_kontak berlaku juga untuk kustom
update public.modules set applies_to = (select array_agg(distinct x) from unnest(applies_to || '{kustom}'::text[]) x) where code = 'r_kontak';
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'r_kontak', k.category_code = 'event', 'sistem' from public.kos k where k.business_type = 'kustom'
on conflict (kos_id, module_code) do update set active = excluded.active or business_modules.active;

-- Penawaran upgrade: Proyek inti kini dari Dasar; fitur lanjutan → Bisnis
update public.growth_rules set active = false, updated_by = 'sistem' where id = 'UPGRADE.PROJECT.DASAR';
update public.growth_rules set to_plan = 'dasar', title = 'Kelola setiap acara sebagai event.',
  message = 'Paket Dasar memberi tiap event satu tempat: klien, jadwal, tugas tim, tagihan DP & pelunasan, dan kalender acara.',
  cta = 'Upgrade ke Paket Dasar', updated_by = 'sistem' where id = 'UPGRADE.PROJECT.GRATIS';
-- Jenis penawaran baru: ditambahkan ke daftar yang ada (tidak menimpa tambahan migrasi lain)
do $$ declare d text; begin
  select pg_get_constraintdef(oid) into d from pg_constraint where conname = 'growth_rules_trigger_event_check';
  if position('PROJECT.ADVANCED.REQUESTED' in d) = 0 then
    alter table public.growth_rules drop constraint growth_rules_trigger_event_check;
    execute 'alter table public.growth_rules add constraint growth_rules_trigger_event_check ' || replace(d, ']))))', ', ''PROJECT.ADVANCED.REQUESTED''::text]))))');
  end if;
end $$;
do $$ declare d text; begin
  d := pg_get_functiondef('public.growth_event_feature(text)'::regprocedure);
  if position('PROJECT.ADVANCED.REQUESTED' in d) = 0 then
    if position(' end;' in d) = 0 then raise exception 'growth_event_feature: pola tidak ditemukan'; end if;
    execute regexp_replace(d, ' end;(\s*\$function\$)', ' when ''PROJECT.ADVANCED.REQUESTED'' then ''proyek_lanjut'' end;\1');
  end if;
end $$;
insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select 'UPGRADE.PROJECT.ADVANCED.' || upper(p.k), 'Penawaran, anggaran & laba event (' || p.n || ')', 'fitur', 'upgrade', p.k, 'bisnis', 1, 'PROJECT.ADVANCED.REQUESTED',
  'Ketahui untung-rugi setiap event.',
  'Paket Bisnis menambahkan penawaran ke klien dengan scope & termin, perubahan scope, anggaran per kategori, komitmen vendor, dan laba per event.',
  'Upgrade ke Paket Bisnis', 'Nanti saja', 30, 7, false, 'sistem'
from (values ('gratis', 'Gratis'), ('dasar', 'Dasar')) as p(k, n)
on conflict (id) do nothing;

-- ---------- 2) Data event di proyek ----------
alter table public.prj_projects add column if not exists confirmed_at timestamptz;          -- pertama kali dikonfirmasi (status berjalan)
alter table public.prj_projects add column if not exists event_stage text
  check (event_stage is null or event_stage in ('draft', 'penawaran', 'menunggu', 'terkonfirmasi', 'persiapan', 'berlangsung'));   -- pilihan manual (null = otomatis)
alter table public.prj_projects add column if not exists category text check (category is null or length(category) <= 60);      -- kategori event (wedding, seminar, …)
alter table public.prj_projects add column if not exists guests int check (guests is null or guests between 0 and 10000000);     -- jumlah peserta
alter table public.prj_projects add column if not exists start_time time;
alter table public.prj_projects add column if not exists end_time time;
update public.prj_projects set confirmed_at = coalesce(
  (select q.decided_at from public.prj_quotes q where q.id = prj_projects.quote_id), created_at)
where confirmed_at is null and status in ('berjalan', 'ditunda', 'selesai');

create or replace function public.prj_projects_stage() returns trigger language plpgsql as $$
begin
  if new.status in ('berjalan', 'ditunda', 'selesai') and new.confirmed_at is null then new.confirmed_at := now(); end if;
  -- tahap manual yang tidak cocok lagi dengan status → kembali otomatis
  if new.status = 'penawaran' and new.event_stage in ('terkonfirmasi', 'persiapan', 'berlangsung') then new.event_stage := null; end if;
  if new.status <> 'penawaran' and new.event_stage in ('draft', 'penawaran', 'menunggu') then new.event_stage := null; end if;
  if new.status in ('selesai', 'batal') then new.event_stage := null; end if;
  return new;
end $$;
drop trigger if exists prj_projects_stage on public.prj_projects;
create trigger prj_projects_stage before insert or update of status, event_stage on public.prj_projects for each row execute function public.prj_projects_stage();

-- Status event (8): Dibatalkan/Selesai dari status proyek; tanggal acara hari ini = Berlangsung (mengalahkan Terkonfirmasi/Persiapan);
-- pilihan manual pemilik; selain itu otomatis: belum dikonfirmasi = Draft / Penawaran (draf penawaran) / Menunggu Konfirmasi (penawaran terkirim);
-- sudah dikonfirmasi = Terkonfirmasi.
create or replace function public.prj_event_status(p prj_projects)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p.status = 'batal' then 'dibatalkan'
    when p.status = 'selesai' then 'selesai'
    when p.status <> 'penawaran' and p.start_date is not null
         and (now() at time zone 'Asia/Jakarta')::date between p.start_date and coalesce(p.end_date, p.start_date) then 'berlangsung'
    when p.event_stage is not null then p.event_stage
    when p.status = 'penawaran' then case
      when exists (select 1 from prj_quotes q where q.project_id = p.id and q.status = 'terkirim') then 'menunggu'
      when exists (select 1 from prj_quotes q where q.project_id = p.id and q.status = 'draf') then 'penawaran'
      else 'draft' end
    else 'terkonfirmasi' end;
$$;

-- Ubah tahap event (pemilik/pengelola/PIC). null = kembali otomatis. Selesai/Dibatalkan lewat tombol status proyek.
create or replace function public.prj_stage_set(p_project uuid, p_stage text)
returns text language plpgsql security definer set search_path = public as $$
declare p prj_projects;
begin
  select * into p from prj_projects where id = p_project;
  if p.id is null or prj_access(p.id) is distinct from 'kelola' then raise exception 'Hanya pemilik, pengelola, atau PIC event ini'; end if;
  perform prj_guard(p.kos_id, false);
  if p_stage is not null and p_stage not in ('draft', 'penawaran', 'menunggu', 'terkonfirmasi', 'persiapan', 'berlangsung') then raise exception 'Tahap tidak dikenal'; end if;
  if p.status in ('selesai', 'batal') then raise exception 'Event sudah %. Buka lagi dulu bila perlu diubah.', p.status; end if;
  if p_stage in ('draft', 'penawaran', 'menunggu') and p.status <> 'penawaran' then
    raise exception 'Event sudah dikonfirmasi. Tahap sebelum konfirmasi hanya untuk event yang belum dikonfirmasi.';
  end if;
  if p_stage in ('terkonfirmasi', 'persiapan', 'berlangsung') and p.status = 'penawaran' then
    raise exception 'Konfirmasi event dulu (tombol Konfirmasi event), lalu pilih tahapnya.';
  end if;
  update prj_projects set event_stage = p_stage, updated_at = now() where id = p.id;
  select * into p from prj_projects where id = p.id;
  perform prj_emit(p.id, 'ProjectUpdated', p.id::text || ':tahap:' || extract(epoch from clock_timestamp())::text,
    'Tahap event: ' || coalesce(p_stage, 'otomatis (' || prj_event_status(p) || ')'), '{}'::jsonb);
  return prj_event_status(p);
end $$;

-- Info event tambahan (kategori, jumlah peserta, jam). Dipanggil setelah prj_save oleh formulir.
create or replace function public.prj_event_info_set(p_project uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare pr prj_projects; v_cat text := nullif(trim(coalesce(p->>'category', '')), ''); v_g int := nullif(p->>'guests', '')::int;
        v_st time := nullif(p->>'start_time', '')::time; v_et time := nullif(p->>'end_time', '')::time;
begin
  select * into pr from prj_projects where id = p_project;
  if pr.id is null or prj_access(pr.id) is distinct from 'kelola' then raise exception 'Hanya pemilik, pengelola, atau PIC event ini'; end if;
  perform prj_guard(pr.kos_id, true);
  if v_cat is not null and length(v_cat) > 60 then raise exception 'Kategori maks. 60 huruf'; end if;
  if v_g is not null and (v_g < 0 or v_g > 10000000) then raise exception 'Jumlah peserta tidak valid'; end if;
  update prj_projects set category = v_cat, guests = v_g, start_time = v_st, end_time = v_et, updated_at = now() where id = pr.id;
end $$;

-- ---------- 3) Foto cover event (bucket media) ----------
alter table public.media_links drop constraint if exists media_links_entity_check;
alter table public.media_links add constraint media_links_entity_check check (entity in ('kos_cover', 'kos_gallery', 'room', 'product', 'service', 'project'));
select public._prasara_patch('public.media_entity_check(uuid,text,uuid)',
  '  else raise exception ''Jenis data tidak dikenal''; end if;',
  '  elsif p_entity = ''project'' then
    select number || '' · '' || name into v_label from prj_projects where id = p_entity_id and kos_id = p_kos;
    v_area := ''ops,settings'';
  else raise exception ''Jenis data tidak dikenal''; end if;');
select public._prasara_patch('public.media_list(uuid)',
  'when ''service'' then (select name from svc_services where id = l.entity_id) end',
  'when ''service'' then (select name from svc_services where id = l.entity_id)
            when ''project'' then (select ''Event '' || name from prj_projects where id = l.entity_id) end');

create or replace function public.prj_cover(p_project uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(m.thumb_path, m.path) from media_links l join media m on m.id = l.media_id
  where l.entity = 'project' and l.entity_id = p_project and m.deleted_at is null order by l.sort, l.created_at limit 1;
$$;

-- prj_row: + status event, kategori, peserta, jam, cover
create or replace function public.prj_row(p prj_projects, p_fin boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'number', p.number, 'name', p.name, 'kind', p.kind, 'status', p.status,
    'event_status', prj_event_status(p), 'event_stage', p.event_stage, 'category', p.category, 'guests', p.guests,
    'start_time', to_char(p.start_time, 'HH24:MI'), 'end_time', to_char(p.end_time, 'HH24:MI'), 'cover', prj_cover(p.id), 'confirmed_at', p.confirmed_at,
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

-- prj_list & prj_get: + tanda fitur lanjutan
select public._prasara_patch('public.prj_list(uuid)',
  '    ''allowed'', plan_has(p_kos, ''proyek''),',
  '    ''allowed'', plan_has(p_kos, ''proyek''), ''lanjut'', plan_has(p_kos, ''proyek_lanjut''),');
select public._prasara_patch('public.prj_get(uuid)',
  '''allowed'', plan_has(p.kos_id, ''proyek''),',
  '''allowed'', plan_has(p.kos_id, ''proyek''), ''lanjut'', plan_has(p.kos_id, ''proyek_lanjut''),');

-- ---------- 4) Beranda Event ----------
-- Semua angka dari data nyata: proyek (event), prj_rev_events (pendapatan diakui, sama dengan Pembukuan), prj_cost_links (biaya event).
-- Karyawan di luar pengelola/bagian proses hanya melihat event tempat ia terlibat; angka uang hanya untuk bagian keuangan.
create or replace function public.event_home(p_kos uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_fin boolean; v_all boolean; v_today date := (now() at time zone 'Asia/Jakarta')::date;
        m0 date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Jakarta')::date))::date;
        m1 date; p0 date; p1 date; s0 date; ps0 date; v jsonb;
begin
  perform prj_guard(p_kos, false);
  v_fin := member_in('finance', p_kos);
  v_all := member_in('settings,ops', p_kos);
  m1 := (m0 + interval '1 month' - interval '1 day')::date; p0 := (m0 - interval '1 month')::date; p1 := (m0 - interval '1 day')::date;
  s0 := (m0 - interval '5 months')::date; ps0 := (s0 - interval '6 months')::date;
  with vis as (
    select p.* from prj_projects p where p.kos_id = p_kos
      and (v_all or p.manager_user = auth.uid()
           or exists (select 1 from prj_members m where m.project_id = p.id and m.user_id = auth.uid())
           or exists (select 1 from prj_tasks t where t.project_id = p.id and t.assignee_user = auth.uid()))),
  rec as (select e.project_id, e.ev_date, -e.delta amt from prj_rev_events(p_kos) e where e.ev_type in ('prj_recog', 'prj_recog_rest')),
  cost as (select l.amount, coalesce(x.date, pu.purchase_date) d, pu.status pst from prj_cost_links l
             left join expenses x on x.id = l.expense_id left join purchases pu on pu.id = l.purchase_id where l.kos_id = p_kos)
  select jsonb_build_object(
    'month', m0, 'today', v_today, 'fin', v_fin, 'allowed', plan_has(p_kos, 'proyek'), 'lanjut', plan_has(p_kos, 'proyek_lanjut'),
    'can_create', member_in('settings', p_kos) and plan_has(p_kos, 'proyek'),
    'kpi', jsonb_build_object(
      'active', (select count(*) from vis where status in ('berjalan', 'ditunda')),
      'active_prev', (select count(*) from vis where status <> 'penawaran' and confirmed_at < m0 and (closed_at is null or closed_at >= m0)),
      'booking_count', (select count(*) from vis where status <> 'batal' and (confirmed_at at time zone 'Asia/Jakarta')::date between m0 and m1),
      'booking_count_prev', (select count(*) from vis where status <> 'batal' and (confirmed_at at time zone 'Asia/Jakarta')::date between p0 and p1),
      'booking_value', case when v_fin then (select coalesce(sum(value), 0) from vis where status <> 'batal' and (confirmed_at at time zone 'Asia/Jakarta')::date between m0 and m1) end,
      'booking_value_prev', case when v_fin then (select coalesce(sum(value), 0) from vis where status <> 'batal' and (confirmed_at at time zone 'Asia/Jakarta')::date between p0 and p1) end,
      'events', (select count(*) from vis where status <> 'batal' and start_date <= m1 and coalesce(end_date, start_date) >= m0),
      'events_prev', (select count(*) from vis where status <> 'batal' and start_date <= p1 and coalesce(end_date, start_date) >= p0),
      'revenue', case when v_fin then (select coalesce(sum(amt), 0) from rec where ev_date between m0 and m1) end,
      'revenue_prev', case when v_fin then (select coalesce(sum(amt), 0) from rec where ev_date between p0 and p1) end),
    'upcoming', (select coalesce(jsonb_agg(prj_row(x, v_fin) order by x.start_date, x.start_time nulls last), '[]') from (
                  select * from vis where status not in ('selesai', 'batal') and start_date is not null and coalesce(end_date, start_date) >= v_today
                  order by start_date, start_time nulls last limit 5) x),
    'undated', (select count(*) from vis where status not in ('selesai', 'batal') and start_date is null),
    'calendar', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'start_date', start_date, 'end_date', coalesce(end_date, start_date),
                   'event_status', prj_event_status(vis)) order by start_date), '[]')
                 from vis where status <> 'batal' and start_date <= m1 and coalesce(end_date, start_date) >= m0),
    'revenue6', case when v_fin then (select jsonb_agg(jsonb_build_object('month', g.m, 'amount', coalesce((select sum(amt) from rec where date_trunc('month', ev_date)::date = g.m), 0)) order by g.m)
                  from (select generate_series(s0, m0, interval '1 month')::date m) g) end,
    'finance', case when v_fin then jsonb_build_object(
      'revenue', (select coalesce(sum(amt), 0) from rec where ev_date between s0 and m1),
      'revenue_prev', (select coalesce(sum(amt), 0) from rec where ev_date between ps0 and (s0 - 1)),
      'cost', (select coalesce(sum(amount), 0) from cost where coalesce(pst, 'selesai') not in ('dipesan', 'batal') and d between s0 and m1),
      'receivable', (select coalesce(sum(greatest(-n, 0)), 0) from (select project_id, sum(delta) n from prj_rev_events(p_kos) group by 1) z),
      'advance', (select coalesce(sum(greatest(n, 0)), 0) from (select project_id, sum(delta) n from prj_rev_events(p_kos) group by 1) z)) end,
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'due_date', t.due_date, 'priority', t.priority,
                'assignee', prj_user_label(t.assignee_user), 'project_id', t.project_id, 'project', vp.name,
                'can_toggle', coalesce(t.assignee_user = auth.uid(), false) or coalesce(prj_access(vp.id) = 'kelola', false))
              order by t.due_date nulls last, t.created_at), '[]')
              from (select t.* from prj_tasks t join vis on vis.id = t.project_id
                    where t.status in ('todo', 'proses') and vis.status not in ('selesai', 'batal')
                    order by t.due_date nulls last, t.created_at limit 6) t join vis vp on vp.id = t.project_id),
    'tasks_open', (select count(*) from prj_tasks t join vis on vis.id = t.project_id where t.status in ('todo', 'proses') and vis.status not in ('selesai', 'batal')))
  into v;
  return v;
end $$;

-- ---------- 5) Perbaikan prj_save (Tahap 1A) ----------
-- (a) `v_changes || 'nama'` dibaca PostgreSQL sebagai array literal → galat "malformed array literal" setiap kali event diubah.
-- (b) Kolom yang tidak dikirim saat mengubah (klien, PIC, proyek induk) tidak boleh terhapus diam-diam.
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.prj_save(uuid,uuid,jsonb)', 'v_changes := v_changes || ''', 'v_changes := v_changes || text ''');
select public._prasara_patch('public.prj_save(uuid,uuid,jsonb)',
  '  -- nilai kontrak: hanya bagian keuangan; selain itu nilai lama dipertahankan',
  '  -- tidak dikirim saat mengubah = pertahankan yang lama
  if not v_new then
    if not (p_data ? ''contact_id'') and not (p_data ? ''client_name'') then v_contact := p.contact_id; end if;
    if not (p_data ? ''manager_user'') then v_mgr := p.manager_user; end if;
    if not (p_data ? ''parent_id'') then v_parent := p.parent_id; end if;
  end if;
  -- nilai kontrak: hanya bagian keuangan; selain itu nilai lama dipertahankan');
drop function public._prasara_patch(text, text, text);

revoke execute on function public.prj_event_status(public.prj_projects), public.prj_cover(uuid), public.prj_projects_stage() from public, anon, authenticated;
revoke execute on function public.prj_stage_set(uuid, text), public.prj_event_info_set(uuid, jsonb), public.event_home(uuid, date) from public, anon;
grant execute on function public.prj_stage_set(uuid, text), public.prj_event_info_set(uuid, jsonb), public.event_home(uuid, date) to authenticated;

-- ---------- 6) Jadwal & Tim ----------
-- Kalender bulanan + SEMUA tugas terbuka event yang terlihat + beban kerja per orang. Izin sama dengan prj_list/event_home.
create or replace function public.event_schedule(p_kos uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_fin boolean; v_all boolean; v_today date := (now() at time zone 'Asia/Jakarta')::date;
        m0 date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Jakarta')::date))::date; m1 date; v jsonb;
begin
  perform prj_guard(p_kos, false);
  v_fin := member_in('finance', p_kos);
  v_all := member_in('settings,ops', p_kos);
  m1 := (m0 + interval '1 month' - interval '1 day')::date;
  with vis as (
    select p.* from prj_projects p where p.kos_id = p_kos
      and (v_all or p.manager_user = auth.uid()
           or exists (select 1 from prj_members m where m.project_id = p.id and m.user_id = auth.uid())
           or exists (select 1 from prj_tasks t where t.project_id = p.id and t.assignee_user = auth.uid()))),
  tk as (select t.*, vis.name pname, vis.start_date pstart from prj_tasks t join vis on vis.id = t.project_id
         where t.status in ('todo', 'proses') and vis.status not in ('selesai', 'batal'))
  select jsonb_build_object('month', m0, 'today', v_today, 'can_all', v_all,
    'events', (select coalesce(jsonb_agg(prj_row(x, v_fin) order by x.start_date, x.start_time nulls last), '[]')
               from vis x where x.status <> 'batal' and x.start_date <= m1 and coalesce(x.end_date, x.start_date) >= m0),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status, 'due_date', t.due_date, 'priority', t.priority,
                'assignee_user', t.assignee_user, 'assignee', prj_user_label(t.assignee_user), 'project_id', t.project_id, 'project', t.pname,
                'event_date', t.pstart, 'late', t.due_date < v_today,
                'can_toggle', coalesce(t.assignee_user = auth.uid(), false) or coalesce(prj_access(t.project_id) = 'kelola', false))
              order by t.due_date nulls last, t.pstart nulls last, t.created_at), '[]')
              from (select * from tk order by due_date nulls last, pstart nulls last, created_at limit 300) t),
    'tasks_total', (select count(*) from tk),
    'team', (select coalesce(jsonb_agg(jsonb_build_object('user_id', a.u, 'name', coalesce(prj_user_label(a.u), 'Belum ditentukan'),
                'open', a.n, 'late', a.l, 'today', a.td) order by a.u is null, a.n desc), '[]')
             from (select assignee_user u, count(*) n, count(*) filter (where due_date < v_today) l, count(*) filter (where due_date = v_today) td
                   from tk group by assignee_user) a))
  into v;
  return v;
end $$;
revoke execute on function public.event_schedule(uuid, date) from public, anon;
grant execute on function public.event_schedule(uuid, date) to authenticated;
