-- Peringatan kuota 80% & 100% (PRASARA_PAKET_HARGA_MASTER_PROMPT_V2 §4.2 & §8).
-- Angka dihitung dari database, bukan dari frontend. Hanya untuk yang berhak mengatur tim (pemilik).
-- Kuota yang tidak punya batas di paket tidak ditampilkan.
create or replace function public.kuota_status(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb := '[]'::jsonb; lim int; used numeric;
begin
  if not member_in('team', p_kos) then raise exception 'Khusus pemilik bisnis'; end if;

  lim := team_limit(p_kos);
  if lim is not null and lim < 1000 then
    v := v || jsonb_build_array(jsonb_build_object('key', 'karyawan', 'label', 'Akun karyawan', 'used', team_used(p_kos), 'limit', lim));
  end if;

  lim := plan_limit(p_kos, 'kamar_terisi');
  if lim is not null then
    used := (select count(*) from leases where kos_id = p_kos and status = 'aktif');
    v := v || jsonb_build_array(jsonb_build_object('key', 'kamar_terisi', 'label', 'Kamar terisi', 'used', used, 'limit', lim));
  end if;

  lim := plan_limit(p_kos, 'lampiran_mb');
  if lim is not null then
    used := round(att_usage(p_kos) / 1048576.0, 1);
    v := v || jsonb_build_array(jsonb_build_object('key', 'lampiran_mb', 'label', 'Ruang foto & lampiran (MB)', 'used', used, 'limit', lim));
  end if;

  return (select coalesce(jsonb_agg(x || jsonb_build_object('pct', floor(100 * (x->>'used')::numeric / nullif((x->>'limit')::numeric, 0))::int)), '[]'::jsonb)
          from jsonb_array_elements(v) x);
end $$;

revoke execute on function public.kuota_status(uuid) from public, anon;
grant execute on function public.kuota_status(uuid) to authenticated;
