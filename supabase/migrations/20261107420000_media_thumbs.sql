-- Foto kecil di daftar (Barang, Kasir, Kamar, Layanan/Menu, Pesanan): satu panggilan per daftar.
-- Mengembalikan {entity_id: thumb_path} foto utama (urutan pertama) tiap data. Foto ini memang publik (bucket media),
-- tetapi daftar tetap hanya untuk anggota bisnis.
create or replace function public.media_thumbs(p_kos uuid, p_entity text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_kos) then raise exception 'Tidak berwenang'; end if;
  if p_entity not in ('room', 'product', 'service') then raise exception 'Jenis data tidak dikenal'; end if;
  return coalesce((select jsonb_object_agg(x.entity_id, x.thumb_path) from (
    select distinct on (l.entity_id) l.entity_id, m.thumb_path
    from media_links l join media m on m.id = l.media_id
    where l.kos_id = p_kos and l.entity = p_entity and l.entity_id is not null and m.deleted_at is null
    order by l.entity_id, l.sort, l.created_at) x), '{}'::jsonb);
end $$;
revoke all on function public.media_thumbs(uuid, text) from public, anon;
grant execute on function public.media_thumbs(uuid, text) to authenticated;
