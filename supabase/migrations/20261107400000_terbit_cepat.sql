-- Bagikan & QR: pemilik bisa menerbitkan halaman bisnis langsung dari lembar Bagikan (satu ketukan),
-- termasuk bisnis yang modul Halaman bisnisnya belum aktif atau belum pernah menyimpan halaman.
create or replace function public.slug_from_name(p_name text)
returns text language sql immutable as $$
  select left(trim(both '-' from regexp_replace(translate(lower(coalesce(p_name, '')), 'áàâäãéèêëíìîïóòôöõúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '-', 'g')), 34);
$$;

create or replace function public.public_page_quick_publish(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k kos; v_slug text; v_base text; n int := 1; pg public_pages;
begin
  if not member_can(p_kos, 'team') then raise exception 'Hanya pemilik yang bisa menerbitkan halaman bisnis'; end if;
  select * into k from kos where id = p_kos;
  if k.closed_at is not null then raise exception 'Bisnis ditutup tidak bisa diterbitkan'; end if;
  if coalesce(k.setup_status, 'active') <> 'active' then raise exception 'Aktifkan bisnis di Pusat Konfirmasi dulu'; end if;
  if not module_on(p_kos, 'u_halaman') then perform module_set(p_kos, 'u_halaman', true, 'Terbitkan halaman dari tombol Bagikan'); end if;
  if not module_on(p_kos, 'u_halaman') then raise exception 'Modul Halaman bisnis belum bisa diaktifkan (cek paket atau persetujuan)'; end if;
  select * into pg from public_pages where kos_id = p_kos;
  if pg.kos_id is not null then
    update public_pages set enabled = true, published_at = coalesce(published_at, now()), updated_at = now(), updated_by = actor_email() where kos_id = p_kos;
    v_slug := pg.slug;
  else
    v_base := slug_from_name(k.name);
    if length(v_base) < 3 or v_base in ('admin', 'api', 'masuk', 'mulai', 'panduan', 'bantuan', 'prasara', 'login', 'daftar', 'toko', 'kos', 'demo', 'contoh', 'www', 'app') then v_base := 'bisnis-' || coalesce(nullif(v_base, ''), 'baru'); end if;
    v_slug := v_base;
    while exists (select 1 from public_pages where slug = v_slug) loop n := n + 1; v_slug := v_base || '-' || n; end loop;
    insert into public_pages(kos_id, slug, enabled, address, wa_phone, catalog_mode, show_prices, email_notify, published_at, updated_at, updated_by, links)
    values (p_kos, v_slug, true, nullif(trim(k.address), ''), nullif(regexp_replace(coalesce(k.contact_phone, ''), '[^0-9+]', '', 'g'), ''),
            case when k.business_type = 'retail' then 'favorit' else 'semua' end, true, true, now(), now(), actor_email(), '[]'::jsonb);
  end if;
  perform config_log(p_kos, 'terbitkan_halaman', v_slug, null, jsonb_build_object('enabled', true, 'via', 'Bagikan'), null, 'menengah', actor_email());
  return jsonb_build_object('slug', v_slug);
end $$;
revoke all on function public.public_page_quick_publish(uuid) from public, anon;
grant execute on function public.public_page_quick_publish(uuid) to authenticated;
