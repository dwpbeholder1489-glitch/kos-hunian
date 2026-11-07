-- Lampiran foto/file (Supabase Storage, bucket privat "lampiran").
-- File diunggah lewat server (/api/lampiran) dengan kunci server; database yang memutuskan siapa boleh apa
-- (att_prepare / att_commit / att_list / att_open / att_delete). Tabel attachments tanpa policy select: baca lewat RPC.
-- Data yang bisa diberi lampiran: catatan bisnis kustom, pesanan jasa, keluhan & perbaikan, penghuni, pengeluaran.

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  entity text not null check (entity in ('bb_record', 'svc_order', 'maint_ticket', 'occupant', 'expense')),
  entity_id uuid not null,
  path text not null unique,
  name text not null check (length(name) between 1 and 120),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size int not null check (size > 0 and size <= 4194304),
  note text check (note is null or length(note) <= 200),
  created_by text not null,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,                 -- null = sedang diunggah / gagal (tidak tampil, dibersihkan otomatis)
  deleted_at timestamptz,
  deleted_by text,
  purged_at timestamptz                    -- file di Storage sudah dihapus (catatan tetap ada untuk jejak audit)
);
create index if not exists attachments_entity on public.attachments(entity, entity_id) where deleted_at is null;
create index if not exists attachments_kos on public.attachments(kos_id) where deleted_at is null;
alter table public.attachments enable row level security;
drop trigger if exists zz_kos_open_guard on public.attachments;
create trigger zz_kos_open_guard before insert or update or delete on public.attachments for each row execute function public.kos_open_guard();

-- Batas penyimpanan per bisnis (MB) mengikuti paket; bisa diubah Super Admin di Admin › Paket
update public.plan_versions v set limits = v.limits || jsonb_build_object('lampiran_mb', case v.plan_key when 'gratis' then 50 when 'standar' then 500 else 2000 end)
where not (v.limits ? 'lampiran_mb') and v.version = (select max(version) from public.plan_versions x where x.plan_key = v.plan_key);

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

select public._prasara_patch('public.admin_plan_version(text,numeric,jsonb,text[],text,text)',
  'if k not in (''kamar_terisi'', ''karyawan'') then',
  'if k not in (''kamar_terisi'', ''karyawan'', ''lampiran_mb'') then');

-- Data tujuan: bisnis, area untuk melihat, area untuk menambah/menghapus
create or replace function public.att_target(p_entity text, p_id uuid, out kos_id uuid, out read_area text, out write_area text, out btype text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_entity = 'bb_record' then
    select r.kos_id, 'ops', 'ops' into kos_id, read_area, write_area from bb_records r where r.id = p_id;
  elsif p_entity = 'svc_order' then
    select o.kos_id, 'sell,ops,finance', 'sell,ops' into kos_id, read_area, write_area from svc_orders o where o.id = p_id;
  elsif p_entity = 'maint_ticket' then
    select t.kos_id, 'rent', 'rent' into kos_id, read_area, write_area from maint_tickets t where t.id = p_id;
  elsif p_entity = 'occupant' then
    select o.kos_id, 'rent', 'rent' into kos_id, read_area, write_area from occupants o where o.id = p_id;
  elsif p_entity = 'expense' then
    select e.kos_id, 'finance', 'finance' into kos_id, read_area, write_area from expenses e where e.id = p_id;
  else
    raise exception 'Jenis data tidak dikenal';
  end if;
  if kos_id is null then raise exception 'Data tidak ditemukan'; end if;
  select k.business_type into btype from kos k where k.id = kos_id;
  if p_entity = 'bb_record' and btype <> 'kustom' then raise exception 'Data tidak ditemukan'; end if;
  if p_entity = 'svc_order' and btype <> 'jasa' then raise exception 'Data tidak ditemukan'; end if;
  if p_entity in ('maint_ticket', 'occupant') and btype <> 'properti' then raise exception 'Data tidak ditemukan'; end if;
end $$;

create or replace function public.att_usage(p_kos uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(size), 0) from attachments where kos_id = p_kos and deleted_at is null and (uploaded_at is not null or created_at > now() - interval '1 hour');
$$;

create or replace function public.att_log(p_entity text, p_id uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_entity = 'bb_record' then perform bb_event(p_id, 'lampiran', p_text);
  elsif p_entity = 'svc_order' then perform svc_event(p_id, 'lampiran', p_text);
  elsif p_entity = 'maint_ticket' then perform maint_event(p_id, 'lampiran', p_text);
  end if;
end $$;

-- 1) Minta izin unggah → baris "sedang diunggah" + lokasi file (dibuat server, bukan dari pengguna)
create or replace function public.att_prepare(p_entity text, p_id uuid, p_name text, p_mime text, p_size int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; v_id uuid := gen_random_uuid(); v_ext text; v_path text; v_lim int; v_name text;
begin
  select * into t from att_target(p_entity, p_id);
  if not member_in(t.write_area, t.kos_id) then raise exception 'Tidak punya akses untuk menambah lampiran di sini'; end if;
  if p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then raise exception 'Jenis file tidak didukung. Pakai foto (JPG/PNG) atau PDF.'; end if;
  if p_size is null or p_size <= 0 then raise exception 'File kosong'; end if;
  if p_size > 4194304 then raise exception 'File terlalu besar (maks 4 MB). Untuk PDF, kecilkan dulu atau foto halamannya.'; end if;
  if (select count(*) from attachments where entity = p_entity and entity_id = p_id and deleted_at is null and (uploaded_at is not null or created_at > now() - interval '1 hour')) >= 10 then
    raise exception 'Maksimal 10 lampiran per data. Hapus yang tidak perlu dulu.';
  end if;
  v_lim := plan_limit(t.kos_id, 'lampiran_mb');
  if v_lim is not null and att_usage(t.kos_id) + p_size > v_lim::bigint * 1048576 then
    raise exception 'BATAS_GRATIS: Ruang lampiran paket % sudah penuh (% MB). Hapus lampiran lama atau upgrade paket.', (select name from plans where key = kos_plan(t.kos_id)), v_lim;
  end if;
  v_ext := case p_mime when 'application/pdf' then 'pdf' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'jpg' end;
  v_name := left(regexp_replace(coalesce(nullif(trim(p_name), ''), 'lampiran.' || v_ext), '[\r\n\t/\\]', ' ', 'g'), 120);
  v_path := t.kos_id || '/' || p_entity || '/' || p_id || '/' || v_id || '.' || v_ext;
  insert into attachments(id, kos_id, entity, entity_id, path, name, mime, size, created_by)
  values (v_id, t.kos_id, p_entity, p_id, v_path, v_name, p_mime, p_size, actor_email());
  return jsonb_build_object('id', v_id, 'path', v_path);
end $$;

-- 2) Setelah file tersimpan di Storage
create or replace function public.att_commit(p_att uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a attachments; t record;
begin
  select * into a from attachments where id = p_att and deleted_at is null and uploaded_at is null;
  if a.id is null then raise exception 'Lampiran tidak ditemukan'; end if;
  select * into t from att_target(a.entity, a.entity_id);
  if not member_in(t.write_area, t.kos_id) or a.created_by <> actor_email() then raise exception 'Tidak punya akses'; end if;
  update attachments set uploaded_at = now() where id = a.id;
  perform att_log(a.entity, a.entity_id, 'Lampiran ditambah: ' || a.name);
end $$;

-- Daftar lampiran satu data (+ pemakaian ruang). Lokasi file dikembalikan untuk dibuatkan tautan sementara oleh server.
create or replace function public.att_list(p_entity text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t record;
begin
  select * into t from att_target(p_entity, p_id);
  if not member_in(t.read_area, t.kos_id) then raise exception 'Tidak punya akses ke data ini'; end if;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'mime', mime, 'size', size, 'path', path, 'by', created_by, 'at', uploaded_at) order by uploaded_at)
      from attachments where entity = p_entity and entity_id = p_id and deleted_at is null and uploaded_at is not null), '[]'),
    'can_add', member_in(t.write_area, t.kos_id) and (select closed_at from kos where id = t.kos_id) is null,
    'used', att_usage(t.kos_id), 'limit_mb', plan_limit(t.kos_id, 'lampiran_mb'));
end $$;

create or replace function public.att_delete(p_att uuid)
returns text language plpgsql security definer set search_path = public as $$
declare a attachments; t record;
begin
  select * into a from attachments where id = p_att and deleted_at is null;
  if a.id is null then raise exception 'Lampiran tidak ditemukan'; end if;
  select * into t from att_target(a.entity, a.entity_id);
  if not member_in(t.write_area, t.kos_id) then raise exception 'Tidak punya akses untuk menghapus lampiran'; end if;
  update attachments set deleted_at = now(), deleted_by = actor_email() where id = a.id;
  perform att_log(a.entity, a.entity_id, 'Lampiran dihapus: ' || a.name);
  return a.path;
end $$;

-- Data induk dihapus → lampirannya ikut ditandai terhapus (file dibersihkan jadwal harian)
create or replace function public.att_parent_gone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update attachments set deleted_at = now(), deleted_by = coalesce(actor_email(), 'sistem') || ' (data induk dihapus)'
  where entity = tg_argv[0] and entity_id = old.id and deleted_at is null;
  return old;
end $$;
drop trigger if exists att_gone on public.expenses;
create trigger att_gone after delete on public.expenses for each row execute function public.att_parent_gone('expense');
drop trigger if exists att_gone on public.occupants;
create trigger att_gone after delete on public.occupants for each row execute function public.att_parent_gone('occupant');
drop trigger if exists att_gone on public.svc_orders;
create trigger att_gone after delete on public.svc_orders for each row execute function public.att_parent_gone('svc_order');
drop trigger if exists att_gone on public.maint_tickets;
create trigger att_gone after delete on public.maint_tickets for each row execute function public.att_parent_gone('maint_ticket');
drop trigger if exists att_gone on public.bb_records;
create trigger att_gone after delete on public.bb_records for each row execute function public.att_parent_gone('bb_record');

-- Jadwal harian (kunci server saja): file yang dihapus / unggahan gagal → hapus dari Storage
create or replace function public.att_purge_list(p_limit int default 200)
returns table(id uuid, path text) language sql stable security definer set search_path = public as $$
  select a.id, a.path from attachments a
  where a.purged_at is null and (a.deleted_at is not null or (a.uploaded_at is null and a.created_at < now() - interval '1 day'))
  order by a.created_at limit p_limit;
$$;
create or replace function public.att_purged(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update attachments set purged_at = now(), deleted_at = coalesce(deleted_at, now()), deleted_by = coalesce(deleted_by, 'sistem (unggahan tidak selesai)') where id = any(p_ids);
$$;
revoke all on function public.att_purge_list(int) from public, anon, authenticated;
revoke all on function public.att_purged(uuid[]) from public, anon, authenticated;
grant execute on function public.att_purge_list(int) to service_role;
grant execute on function public.att_purged(uuid[]) to service_role;
revoke all on function public.att_target(text, uuid) from public, anon;
revoke all on function public.att_log(text, uuid, text) from public, anon, authenticated;

-- Ekspor: daftar lampiran (nama file, bukan isi file)
select public._prasara_patch('public.business_export_sheets(uuid)',
  '  s := s || xs(''Persetujuan'',',
  '  if exists (select 1 from attachments where kos_id = p_kos and uploaded_at is not null and deleted_at is null) then
    s := s || xs(''Lampiran'', array[''Data'', ''Nama file'', ''Ukuran (KB)'', ''Diunggah oleh'', ''Waktu''], array[''t'', ''t'', ''n'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(case a.entity when ''bb_record'' then ''Catatan'' when ''svc_order'' then ''Pesanan jasa'' when ''maint_ticket'' then ''Keluhan & perbaikan''
          when ''occupant'' then ''Penghuni'' else ''Pengeluaran'' end, a.name, round(a.size / 1024.0), a.created_by, to_char(a.uploaded_at at time zone ''Asia/Jakarta'', ''YYYY-MM-DD HH24:MI'')) order by a.uploaded_at)
       from attachments a where a.kos_id = p_kos and a.uploaded_at is not null and a.deleted_at is null));
  end if;
  s := s || xs(''Persetujuan'',');

drop function public._prasara_patch(text, text, text);
