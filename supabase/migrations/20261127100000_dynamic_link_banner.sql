create table public.link_banner_settings (
  kos_id uuid primary key references public.kos(id) on delete cascade,
  enabled boolean not null default true,
  mode text not null default 'auto' check (mode in ('auto', 'photo', 'custom')),
  category text check (category in ('retail', 'kuliner', 'properti', 'jasa', 'lainnya')),
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  title text check (length(title) <= 80),
  description text check (length(description) <= 150),
  custom_png bytea check (
    octet_length(custom_png) between 33 and 3200000 and
    substring(custom_png from 1 for 24) = decode('89504e470d0a1a0a0000000d49484452000004b000000276', 'hex')
  ),
  check (mode <> 'custom' or custom_png is not null)
);
alter table public.link_banner_settings enable row level security;
revoke all on public.link_banner_settings from public, anon, authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.link_banner_settings
for each row execute function public.kos_open_guard();

create function public.link_banner_config(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'enabled', coalesce(s.enabled, true), 'mode', coalesce(s.mode, 'auto'), 'category', s.category,
    'color', s.color, 'title', s.title, 'description', s.description, 'hasCustom', s.custom_png is not null,
    'name', k.name, 'tagline', pg.tagline, 'businessType', k.business_type, 'template', k.template_code,
    'businessCategory', k.category_code
  )
  from kos k left join link_banner_settings s on s.kos_id = k.id
  left join public_pages pg on pg.kos_id = k.id
  where k.id = p_kos and member_in('settings', k.id);
$$;

create function public.link_banner_save(p_kos uuid, p_settings jsonb, p_png text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_existing bytea;
begin
  if not member_in('settings', p_kos) then raise exception 'Akses pengaturan bisnis ditolak'; end if;
  -- Kunci baris bisnis agar dua penyimpanan bersamaan tidak mengembalikan gambar lama.
  perform 1 from kos where id = p_kos and closed_at is null and suspended_at is null for update;
  if not found then raise exception 'Bisnis sedang tidak dapat diubah'; end if;
  if length(p_png) > 4266668 then raise exception 'Banner terlalu besar'; end if;
  select custom_png into v_existing from link_banner_settings where kos_id = p_kos;
  if p_settings->>'mode' = 'custom' and p_png is null and v_existing is null then
    raise exception 'Unggah banner custom terlebih dahulu';
  end if;
  -- Pengaturan berbagi boleh disiapkan ketika bisnis masih draf.
  perform set_config('prasara.setup_ok', '1', true);
  insert into link_banner_settings(kos_id, enabled, mode, category, color, title, description, custom_png)
  values (p_kos, (p_settings->>'enabled')::boolean, p_settings->>'mode',
    nullif(p_settings->>'category', ''), nullif(p_settings->>'color', ''),
    nullif(trim(p_settings->>'title'), ''), nullif(trim(p_settings->>'description'), ''),
    coalesce(decode(p_png, 'base64'), v_existing))
  on conflict (kos_id) do update set
    enabled = excluded.enabled, mode = excluded.mode, category = excluded.category, color = excluded.color,
    title = excluded.title, description = excluded.description, custom_png = excluded.custom_png;
end $$;

-- Snapshot untuk renderer. Aset dipilih dari bisnis yang sama dan produk yang boleh tampil.
create function public.link_banner_snapshot(p_kos uuid, p_context text, p_item text, p_preview boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k kos; pg public_pages; s link_banner_settings; v_item uuid; v_name text; v_note text;
        v_photos jsonb;
begin
  select * into k from kos where id = p_kos;
  if k.id is null then return null; end if;
  select * into pg from public_pages where kos_id = k.id;
  select * into s from link_banner_settings where kos_id = k.id;

  if p_context in ('produk', 'katalog') and k.business_type = 'retail' then
    select pr.id, pr.name, left(pr.portal_description, 150) into v_item, v_name, v_note
    from products pr where pr.kos_id = k.id and pr.active and
      (p_preview or pg.catalog_mode = 'semua' or (pg.catalog_mode = 'favorit' and pr.favorite))
      and (p_context = 'katalog' or pr.id::text = p_item or (p_preview and p_item is null))
    order by exists (
      select 1 from media_links l join media m on m.id = l.media_id and m.kos_id = l.kos_id
      where l.kos_id = k.id and l.entity = 'product' and l.entity_id = pr.id
        and m.deleted_at is null and m.uploaded_at is not null
    ) desc, pr.favorite desc, pr.name, pr.id limit 1;
  elsif p_context = 'katalog' and k.business_type = 'jasa' and (p_preview or pg.catalog_mode <> 'tidak') then
    select sv.id into v_item from svc_services sv
    where sv.kos_id = k.id and sv.active and exists (
      select 1 from media_links l join media m on m.id = l.media_id and m.kos_id = l.kos_id
      where l.kos_id = k.id and l.entity = 'service' and l.entity_id = sv.id
        and m.deleted_at is null and m.uploaded_at is not null
    ) order by sv.id limit 1;
  elsif p_context = 'booking' and k.business_type = 'properti' and (p_preview or pg.catalog_mode <> 'tidak') then
    select r.id into v_item from rooms r
    where r.kos_id = k.id and r.status = 'tersedia' and exists (
      select 1 from media_links l join media m on m.id = l.media_id and m.kos_id = l.kos_id
      where l.kos_id = k.id and l.entity = 'room' and l.entity_id = r.id
        and m.deleted_at is null and m.uploaded_at is not null
    ) order by r.code, r.id limit 1;
  end if;
  if p_context = 'produk' and not p_preview and v_item is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object('path', x.path, 'kind', x.kind) order by x.priority), '[]'::jsonb)
  into v_photos from (
    select distinct on (rank.priority) m.path, rank.priority,
      case when rank.priority = 1 then 'item' else 'business' end as kind
    from media_links l join media m on m.id = l.media_id and m.kos_id = l.kos_id
    cross join lateral (select case l.entity when 'kos_cover' then 2 when 'kos_gallery' then 3 else 1 end as priority) rank
    where l.kos_id = k.id and m.deleted_at is null and m.uploaded_at is not null
      and (l.entity in ('kos_cover', 'kos_gallery') or
           (l.entity_id = v_item and l.entity = case k.business_type when 'retail' then 'product' when 'jasa' then 'service' else 'room' end))
    order by rank.priority, l.sort, l.created_at, l.id
  ) x;

  return jsonb_build_object(
    'business', k.id, 'name', k.name, 'businessType', k.business_type, 'template', k.template_code,
    'businessCategory', k.category_code, 'logo', k.profile->>'logo_path', 'tagline', pg.tagline, 'photos', v_photos,
    'itemTitle', case when p_context = 'produk' then v_name end,
    'itemDescription', case when p_context = 'produk' then v_note end,
    'enabled', coalesce(s.enabled, true), 'mode', coalesce(s.mode, 'auto'), 'category', s.category,
    'color', s.color, 'title', s.title, 'description', s.description,
    'custom', case when s.mode = 'custom' or p_preview then encode(s.custom_png, 'base64') end);
end $$;

create function public.link_banner_preview(p_kos uuid, p_context text)
returns jsonb language sql stable security definer set search_path = public as $$
  select link_banner_snapshot(p_kos, p_context, null, true) where member_in('settings', p_kos);
$$;

create function public.link_banner_public(p_source text, p_key text, p_context text, p_item text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k kos; c contacts;
begin
  if p_source = 'b' then
    select bs.* into k from kos bs join public_pages pg on pg.kos_id = bs.id
    where pg.slug = lower(p_key) and pg.enabled and module_on(bs.id, 'u_halaman') and module_on(bs.id, 'u_crm');
  elsif p_source = 'c' and p_context in ('portal', 'faktur') then
    c := cportal_contact(p_key);
    if c.id is not null and cportal_block(c.kos_id) is null then select * into k from kos where id = c.kos_id; end if;
  elsif p_source = 'p' and p_context in ('portal', 'faktur') and length(p_key) between 20 and 80 then
    select bs.* into k from kos bs join occupants o on o.kos_id = bs.id
    where o.portal_token = p_key and plan_has(bs.id, 'portal_penghuni') and module_on(bs.id, 'p_portal');
  end if;
  if k.id is null or k.closed_at is not null or k.suspended_at is not null or k.setup_status <> 'active' then return null; end if;
  -- Portal bertoken bersifat privat. Gunakan hanya identitas bisnis, tanpa tagline draf.
  if p_source in ('c', 'p') then return link_banner_snapshot(k.id, p_context, null, false) - 'tagline'; end if;
  return link_banner_snapshot(k.id, p_context, p_item, false);
end $$;

revoke execute on function public.link_banner_snapshot(uuid,text,text,boolean), public.link_banner_public(text,text,text,text),
  public.link_banner_preview(uuid,text), public.link_banner_config(uuid), public.link_banner_save(uuid,jsonb,text)
from public, anon, authenticated;
grant execute on function public.link_banner_public(text,text,text,text) to service_role;
grant execute on function public.link_banner_preview(uuid,text), public.link_banner_config(uuid), public.link_banner_save(uuid,jsonb,text)
to authenticated;
