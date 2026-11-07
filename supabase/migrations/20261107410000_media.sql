-- Media Library terpusat (foto publik bisnis): cover, galeri, foto kamar, produk, layanan/menu, fasilitas, portofolio.
-- * File di Supabase Storage bucket publik "media" (dibuat otomatis oleh /api/media dengan kunci server), path {kos_id}/{id}.jpg + thumbnail {id}_t.jpg.
-- * Dokumentasi internal (bukti, kondisi barang/kamar, nota) tetap memakai Lampiran (bucket privat) — tidak ada sistem upload ganda.
-- * Satu foto bisa dipakai di banyak tempat lewat media_links: ganti di satu pemakaian (media_relink), ganti sumber untuk semua
--   pemakaian (media_replace_*), lepas tanpa menghapus file (media_unlink). Hapus foto yang masih dipakai butuh konfirmasi (p_force).
-- * Kuota penyimpanan paket (lampiran_mb) dipakai bersama lampiran + media.
-- * Semua perubahan lewat RPC dengan cek peran; riwayat di media.log.

create table if not exists public.media (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  category text not null check (category in ('cover', 'galeri', 'kamar', 'produk', 'layanan', 'fasilitas', 'portofolio', 'lainnya')),
  path text not null,
  thumb_path text not null,
  size int not null check (size > 0),
  width int, height int,
  name text,
  caption text,
  pending jsonb,                -- unggahan pengganti yang belum selesai
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_email text,
  deleted_at timestamptz,
  purged_at timestamptz,
  log jsonb not null default '[]'
);
create index if not exists media_kos on public.media(kos_id, created_at desc) where deleted_at is null;

create table if not exists public.media_links (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  entity text not null check (entity in ('kos_cover', 'kos_gallery', 'room', 'product', 'service')),
  entity_id uuid,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (media_id, entity, entity_id)
);
create index if not exists media_links_ent on public.media_links(kos_id, entity, entity_id, sort);

-- file lama yang menunggu dihapus dari penyimpanan (setelah ganti sumber / hapus)
create table if not exists public.media_trash (
  path text primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.media enable row level security;
alter table public.media_links enable row level security;
alter table public.media_trash enable row level security;
drop policy if exists media_select on public.media;
create policy media_select on public.media for select using (deleted_at is null and public.is_member(kos_id));
drop policy if exists media_links_select on public.media_links;
create policy media_links_select on public.media_links for select using (public.is_member(kos_id));
grant select on public.media, public.media_links to authenticated;
do $$ declare t text; begin
  foreach t in array array['media', 'media_links', 'media_trash'] loop
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

create or replace function public.media_usage(p_kos uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(size + coalesce((pending->>'size')::int, 0)), 0) from media where kos_id = p_kos and deleted_at is null and (uploaded_at is not null or created_at > now() - interval '1 hour');
$$;
-- kuota penyimpanan bersama: lampiran + media
create or replace function public.att_usage(p_kos uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select sum(size) from attachments where kos_id = p_kos and deleted_at is null and (uploaded_at is not null or created_at > now() - interval '1 hour')), 0)
       + media_usage(p_kos);
$$;

create or replace function public.media_log(p_old jsonb, p_text text)
returns jsonb language sql stable as $$
  select coalesce(p_old, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now(), 'text', left(p_text, 200), 'actor', actor_email()));
$$;

-- siapa boleh menempelkan foto ke data apa
create or replace function public.media_entity_check(p_kos uuid, p_entity text, p_entity_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_area text; v_label text; v_type text;
begin
  select business_type into v_type from kos where id = p_kos;
  if p_entity in ('kos_cover', 'kos_gallery') then
    if p_entity_id is not null then raise exception 'Data tidak valid'; end if;
    v_area := 'settings'; v_label := case p_entity when 'kos_cover' then 'Cover bisnis' else 'Galeri bisnis' end;
  elsif p_entity = 'room' then
    select 'Kamar ' || code into v_label from rooms where id = p_entity_id and kos_id = p_kos;
    v_area := 'rent';
  elsif p_entity = 'product' then
    select name into v_label from products where id = p_entity_id and kos_id = p_kos;
    v_area := 'stock';
  elsif p_entity = 'service' then
    select name into v_label from svc_services where id = p_entity_id and kos_id = p_kos;
    v_area := 'sell,settings';
  else raise exception 'Jenis data tidak dikenal'; end if;
  if v_label is null then raise exception 'Data tidak ditemukan'; end if;
  if not member_in(v_area, p_kos) then raise exception 'Tidak berwenang mengubah foto %', v_label; end if;
  return v_label;
end $$;

-- 1) siapkan unggahan (cek peran + kuota) → path; file diunggah server lalu media_commit
create or replace function public.media_prepare(p_kos uuid, p_category text, p_size int, p_w int, p_h int, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_lim int;
begin
  if not member_in('settings,rent,stock,sell', p_kos) then raise exception 'Tidak berwenang mengunggah foto'; end if;
  if p_category not in ('cover', 'galeri', 'kamar', 'produk', 'layanan', 'fasilitas', 'portofolio', 'lainnya') then raise exception 'Kategori tidak dikenal'; end if;
  if p_size is null or p_size <= 0 or p_size > 3 * 1048576 then raise exception 'Ukuran foto tidak valid (maks 3 MB setelah dikecilkan)'; end if;
  v_lim := plan_limit(p_kos, 'lampiran_mb');
  if v_lim is not null and att_usage(p_kos) + p_size > v_lim::bigint * 1048576 then
    raise exception 'BATAS_GRATIS: Ruang penyimpanan paket % sudah penuh (% MB). Hapus foto/lampiran lama atau upgrade paket.', (select name from plans where key = kos_plan(p_kos)), v_lim;
  end if;
  if (select count(*) from media where kos_id = p_kos and uploaded_at is null and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Terlalu banyak unggahan sekaligus. Tunggu sebentar.';
  end if;
  insert into media(id, kos_id, category, path, thumb_path, size, width, height, name, created_email, log)
  values (v_id, p_kos, p_category, p_kos || '/' || v_id || '.jpg', p_kos || '/' || v_id || '_t.jpg', p_size, p_w, p_h,
          nullif(left(trim(coalesce(p_name, '')), 120), ''), actor_email(), media_log(null, 'Diunggah'));
  return jsonb_build_object('id', v_id, 'path', p_kos || '/' || v_id || '.jpg', 'thumb_path', p_kos || '/' || v_id || '_t.jpg');
end $$;

create or replace function public.media_commit(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m media;
begin
  select * into m from media where id = p_id;
  if m.id is null or not member_in('settings,rent,stock,sell', m.kos_id) then raise exception 'Foto tidak ditemukan'; end if;
  update media set uploaded_at = coalesce(uploaded_at, now()) where id = p_id returning * into m;
  return jsonb_build_object('id', m.id, 'path', m.path, 'thumb_path', m.thumb_path, 'category', m.category);
end $$;

-- 2) tempel / lepas / ganti di satu pemakaian
create or replace function public.media_link(p_media uuid, p_entity text, p_entity_id uuid, p_main boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare m media; v_label text; v_id uuid; v_max int := case when p_entity = 'kos_cover' then 1 when p_entity = 'kos_gallery' then 12 else 8 end; v_n int;
begin
  select * into m from media where id = p_media and deleted_at is null and uploaded_at is not null;
  if m.id is null then raise exception 'Foto tidak ditemukan'; end if;
  v_label := media_entity_check(m.kos_id, p_entity, p_entity_id);
  if p_entity = 'kos_cover' then delete from media_links where kos_id = m.kos_id and entity = 'kos_cover'; end if;
  select count(*) into v_n from media_links where kos_id = m.kos_id and entity = p_entity and entity_id is not distinct from p_entity_id;
  if v_n >= v_max and not exists (select 1 from media_links where media_id = p_media and entity = p_entity and entity_id is not distinct from p_entity_id) then
    raise exception 'Maksimal % foto untuk %', v_max, v_label;
  end if;
  if coalesce(p_main, false) then update media_links set sort = sort + 1 where kos_id = m.kos_id and entity = p_entity and entity_id is not distinct from p_entity_id; end if;
  insert into media_links(kos_id, media_id, entity, entity_id, sort)
  values (m.kos_id, p_media, p_entity, p_entity_id, case when coalesce(p_main, false) then 0 else v_n end)
  on conflict (media_id, entity, entity_id) do update set sort = case when coalesce(p_main, false) then 0 else media_links.sort end
  returning id into v_id;
  update media set log = media_log(log, 'Dipakai di ' || v_label) where id = p_media;
  return v_id;
end $$;

create or replace function public.media_unlink(p_link uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l media_links; v_label text;
begin
  select * into l from media_links where id = p_link;
  if l.id is null then raise exception 'Data tidak ditemukan'; end if;
  v_label := media_entity_check(l.kos_id, l.entity, l.entity_id);
  delete from media_links where id = p_link;
  update media set log = media_log(log, 'Dilepas dari ' || v_label || ' (file tetap di pustaka)') where id = l.media_id;
end $$;

create or replace function public.media_main(p_link uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l media_links;
begin
  select * into l from media_links where id = p_link;
  if l.id is null then raise exception 'Data tidak ditemukan'; end if;
  perform media_entity_check(l.kos_id, l.entity, l.entity_id);
  update media_links set sort = sort + 1 where kos_id = l.kos_id and entity = l.entity and entity_id is not distinct from l.entity_id and id <> l.id;
  update media_links set sort = 0 where id = l.id;
end $$;

-- ganti foto hanya di SATU pemakaian (foto lama tetap di pustaka dan di pemakaian lain)
create or replace function public.media_relink(p_link uuid, p_media uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l media_links; m media; v_label text;
begin
  select * into l from media_links where id = p_link;
  select * into m from media where id = p_media and deleted_at is null and uploaded_at is not null;
  if l.id is null or m.id is null or m.kos_id <> l.kos_id then raise exception 'Data tidak ditemukan'; end if;
  v_label := media_entity_check(l.kos_id, l.entity, l.entity_id);
  if exists (select 1 from media_links where media_id = p_media and entity = l.entity and entity_id is not distinct from l.entity_id) then
    delete from media_links where id = p_link;
  else
    update media_links set media_id = p_media where id = p_link;
  end if;
  update media set log = media_log(log, 'Dipakai di ' || v_label || ' (mengganti foto lain)') where id = p_media;
end $$;

-- 3) ganti SUMBER foto (berlaku di semua pemakaian): siapkan path baru → unggah → selesaikan; file lama dibuang
create or replace function public.media_replace_prepare(p_id uuid, p_size int, p_w int, p_h int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m media; v_n text := replace(gen_random_uuid()::text, '-', ''); v_lim int;
begin
  select * into m from media where id = p_id and deleted_at is null and uploaded_at is not null for update;
  if m.id is null or not member_in('settings,rent,stock,sell', m.kos_id) then raise exception 'Foto tidak ditemukan'; end if;
  if p_size is null or p_size <= 0 or p_size > 3 * 1048576 then raise exception 'Ukuran foto tidak valid'; end if;
  v_lim := plan_limit(m.kos_id, 'lampiran_mb');
  if v_lim is not null and att_usage(m.kos_id) + p_size > v_lim::bigint * 1048576 then raise exception 'BATAS_GRATIS: Ruang penyimpanan penuh (% MB).', v_lim; end if;
  update media set pending = jsonb_build_object('path', m.kos_id || '/' || m.id || '-' || v_n || '.jpg', 'thumb_path', m.kos_id || '/' || m.id || '-' || v_n || '_t.jpg',
    'size', p_size, 'width', p_w, 'height', p_h, 'at', now()) where id = p_id returning * into m;
  return m.pending;
end $$;

create or replace function public.media_replace_commit(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m media; v_uses int;
begin
  select * into m from media where id = p_id and deleted_at is null for update;
  if m.id is null or m.pending is null or not member_in('settings,rent,stock,sell', m.kos_id) then raise exception 'Tidak ada penggantian yang menunggu'; end if;
  insert into media_trash(path, kos_id) values (m.path, m.kos_id), (m.thumb_path, m.kos_id) on conflict do nothing;
  select count(*) into v_uses from media_links where media_id = m.id;
  update media set path = m.pending->>'path', thumb_path = m.pending->>'thumb_path', size = (m.pending->>'size')::int,
    width = (m.pending->>'width')::int, height = (m.pending->>'height')::int, pending = null,
    log = media_log(log, 'Gambar diganti (berlaku di ' || v_uses || ' pemakaian)')
  where id = p_id returning * into m;
  return jsonb_build_object('id', m.id, 'path', m.path, 'thumb_path', m.thumb_path);
end $$;

-- 4) hapus: tolak bila masih dipakai, kecuali p_force (pemakaian ikut dilepas). File dibuang dari penyimpanan.
create or replace function public.media_delete(p_id uuid, p_force boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m media; v_uses int;
begin
  select * into m from media where id = p_id and deleted_at is null for update;
  if m.id is null then raise exception 'Foto tidak ditemukan'; end if;
  if not (member_in('settings', m.kos_id) or (m.created_by = auth.uid() and member_in('settings,rent,stock,sell', m.kos_id))) then
    raise exception 'Hanya pemilik atau pengunggah yang bisa menghapus foto'; end if;
  select count(*) into v_uses from media_links where media_id = p_id;
  if v_uses > 0 and not coalesce(p_force, false) then raise exception 'MASIH_DIPAKAI: Foto ini masih dipakai di % tempat', v_uses; end if;
  delete from media_links where media_id = p_id;
  insert into media_trash(path, kos_id) values (m.path, m.kos_id), (m.thumb_path, m.kos_id) on conflict do nothing;
  update media set deleted_at = now(), log = media_log(log, 'Dihapus' || case when v_uses > 0 then ' (dilepas dari ' || v_uses || ' tempat)' else '' end) where id = p_id;
  return jsonb_build_object('paths', jsonb_build_array(m.path, m.thumb_path));
end $$;

create or replace function public.media_caption(p_id uuid, p_caption text)
returns void language plpgsql security definer set search_path = public as $$
declare m media;
begin
  select * into m from media where id = p_id and deleted_at is null;
  if m.id is null or not member_in('settings,rent,stock,sell', m.kos_id) then raise exception 'Foto tidak ditemukan'; end if;
  update media set caption = nullif(left(trim(coalesce(p_caption, '')), 200), '') where id = p_id;
end $$;

-- daftar pustaka + di mana saja dipakai
create or replace function public.media_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_kos) then raise exception 'Tidak berwenang'; end if;
  return jsonb_build_object(
    'used', att_usage(p_kos), 'media_used', media_usage(p_kos), 'limit_mb', plan_limit(p_kos, 'lampiran_mb'),
    'can_manage', member_in('settings', p_kos),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'category', m.category, 'path', m.path, 'thumb_path', m.thumb_path, 'size', m.size,
        'width', m.width, 'height', m.height, 'name', m.name, 'caption', m.caption, 'created_at', m.created_at, 'created_email', m.created_email,
        'mine', m.created_by = auth.uid(), 'log', m.log,
        'uses', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'entity', l.entity, 'entity_id', l.entity_id, 'sort', l.sort,
          'label', case l.entity when 'kos_cover' then 'Cover bisnis' when 'kos_gallery' then 'Galeri bisnis'
            when 'room' then (select 'Kamar ' || code from rooms where id = l.entity_id)
            when 'product' then (select name from products where id = l.entity_id)
            when 'service' then (select name from svc_services where id = l.entity_id) end) order by l.created_at)
          from media_links l where l.media_id = m.id), '[]'::jsonb)) order by m.created_at desc)
      from media m where m.kos_id = p_kos and m.deleted_at is null and m.uploaded_at is not null), '[]'::jsonb));
end $$;

-- foto untuk satu data (kamar/produk/layanan/cover/galeri)
create or replace function public.media_for(p_kos uuid, p_entity text, p_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_kos) then raise exception 'Tidak berwenang'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('link_id', l.id, 'media_id', m.id, 'path', m.path, 'thumb_path', m.thumb_path, 'caption', m.caption,
      'width', m.width, 'height', m.height, 'shared', (select count(*) from media_links x where x.media_id = m.id) > 1) order by l.sort, l.created_at)
    from media_links l join media m on m.id = l.media_id
    where l.kos_id = p_kos and l.entity = p_entity and l.entity_id is not distinct from p_entity_id and m.deleted_at is null), '[]'::jsonb);
end $$;

-- foto untuk halaman publik: hanya bila halaman terbit & bisnis aktif; hanya data yang memang tampil
create or replace function public.public_media(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pg public_pages; k kos;
begin
  select * into pg from public_pages where slug = lower(p_slug) and enabled;
  select * into k from kos where id = pg.kos_id;
  if pg.kos_id is null or k.closed_at is not null or coalesce(k.setup_status, 'active') <> 'active' or not module_on(k.id, 'u_halaman') then return null; end if;
  return jsonb_build_object(
    'cover', (select jsonb_build_object('path', m.path, 'thumb', m.thumb_path, 'caption', m.caption) from media_links l join media m on m.id = l.media_id
              where l.kos_id = k.id and l.entity = 'kos_cover' and m.deleted_at is null order by l.sort limit 1),
    'gallery', coalesce((select jsonb_agg(jsonb_build_object('path', m.path, 'thumb', m.thumb_path, 'caption', m.caption) order by l.sort, l.created_at)
              from media_links l join media m on m.id = l.media_id where l.kos_id = k.id and l.entity = 'kos_gallery' and m.deleted_at is null), '[]'::jsonb),
    'items', coalesce((select jsonb_object_agg(x.entity_id, x.pics) from (
              select l.entity_id, jsonb_agg(jsonb_build_object('path', m.path, 'thumb', m.thumb_path, 'caption', m.caption) order by l.sort, l.created_at) pics
              from media_links l join media m on m.id = l.media_id
              where l.kos_id = k.id and l.entity in ('room', 'product', 'service') and m.deleted_at is null
                and case l.entity when 'room' then k.business_type = 'properti' and exists (select 1 from rooms r where r.id = l.entity_id and r.status = 'tersedia')
                                  when 'product' then k.business_type = 'retail' and exists (select 1 from products p where p.id = l.entity_id and p.active)
                                  else k.business_type = 'jasa' and exists (select 1 from svc_services s where s.id = l.entity_id and s.active) end
              group by l.entity_id) x), '{}'::jsonb));
end $$;

-- pembersihan file (cron harian): unggahan gagal > 1 jam + file lama di tempat sampah
create or replace function public.media_purge_list(p_limit int)
returns table(path text) language sql stable security definer set search_path = public as $$
  select t.path from media_trash t
  union all
  select x.p from media m, lateral (values (m.path), (m.thumb_path)) x(p) where m.uploaded_at is null and m.created_at < now() - interval '1 hour' and m.deleted_at is null
  union all
  select x.p from media m, lateral (values (m.pending->>'path'), (m.pending->>'thumb_path')) x(p) where m.pending is not null and (m.pending->>'at')::timestamptz < now() - interval '1 hour'
  limit greatest(1, least(p_limit, 1000));
$$;
create or replace function public.media_purged(p_paths text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from media_trash where path = any(p_paths);
  update media set deleted_at = now(), log = media_log(log, 'Unggahan tidak selesai, dibersihkan') where uploaded_at is null and created_at < now() - interval '1 hour' and deleted_at is null and path = any(p_paths);
  update media set pending = null where pending is not null and (pending->>'path') = any(p_paths);
end $$;
-- pemakaian ikut terhapus bila data induknya dihapus
create or replace function public.media_gone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from media_links where entity = tg_argv[0] and entity_id = old.id;
  return old;
end $$;
drop trigger if exists media_gone on public.rooms;
create trigger media_gone after delete on public.rooms for each row execute function public.media_gone('room');
drop trigger if exists media_gone on public.products;
create trigger media_gone after delete on public.products for each row execute function public.media_gone('product');
drop trigger if exists media_gone on public.svc_services;
create trigger media_gone after delete on public.svc_services for each row execute function public.media_gone('service');

revoke all on function public.media_usage(uuid), public.media_entity_check(uuid, text, uuid), public.media_prepare(uuid, text, int, int, int, text), public.media_commit(uuid),
  public.media_link(uuid, text, uuid, boolean), public.media_unlink(uuid), public.media_main(uuid), public.media_relink(uuid, uuid),
  public.media_replace_prepare(uuid, int, int, int), public.media_replace_commit(uuid), public.media_delete(uuid, boolean), public.media_caption(uuid, text),
  public.media_list(uuid), public.media_for(uuid, text, uuid), public.media_purge_list(int), public.media_purged(text[]) from public, anon;
grant execute on function public.media_prepare(uuid, text, int, int, int, text), public.media_commit(uuid), public.media_link(uuid, text, uuid, boolean),
  public.media_unlink(uuid), public.media_main(uuid), public.media_relink(uuid, uuid), public.media_replace_prepare(uuid, int, int, int),
  public.media_replace_commit(uuid), public.media_delete(uuid, boolean), public.media_caption(uuid, text), public.media_list(uuid), public.media_for(uuid, text, uuid) to authenticated;
grant execute on function public.media_purge_list(int), public.media_purged(text[]) to service_role;
grant execute on function public.public_media(text) to anon, authenticated;
