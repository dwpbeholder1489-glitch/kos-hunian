-- Bagikan tautan & QR halaman bisnis dari tombol cepat di atas layar.
-- Tabel public_pages hanya bisa dibaca peran pengaturan; tautan yang SUDAH TERBIT memang publik,
-- jadi semua anggota bisnis boleh mengambilnya lewat fungsi ini (tanpa isi pengaturan lain).
create or replace function public.share_info(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pg record; k record;
begin
  if not is_member(p_kos) then raise exception 'Tidak berwenang'; end if;
  select id, name, business_type, template_code, category_code, setup_status, closed_at, profile into k from kos where id = p_kos;
  select slug, enabled into pg from public_pages where kos_id = p_kos;
  return jsonb_build_object(
    'name', k.name, 'type', k.business_type, 'kuliner', coalesce(k.template_code = 'kuliner' or k.category_code = 'kuliner', false),
    'logo_path', k.profile->>'logo_path',
    'module', module_on(p_kos, 'u_halaman'),
    'live', coalesce(pg.enabled, false) and coalesce(k.setup_status, 'active') = 'active' and k.closed_at is null,
    'slug', case when coalesce(pg.enabled, false) or member_can(p_kos, 'settings') then pg.slug end,
    'can_edit', member_can(p_kos, 'settings'));
end $$;
revoke all on function public.share_info(uuid) from public, anon;
grant execute on function public.share_info(uuid) to authenticated;
