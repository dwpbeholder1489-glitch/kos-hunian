-- Perbaikan: gen_random_bytes ada di skema "extensions" di Supabase, bukan "public".
-- Pakai gen_random_uuid() (bawaan PostgreSQL) agar tidak bergantung pada letak ekstensi.
create or replace function public.portal_link(p_occupant uuid, p_reset boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare o record; v_token text;
begin
  select * into o from occupants where id = p_occupant for update;
  if o.id is null or not is_member(o.kos_id) then raise exception 'Penghuni tidak ditemukan'; end if;
  if o.portal_token is not null and not p_reset then return o.portal_token; end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  update occupants set portal_token = v_token where id = p_occupant;
  return v_token;
end $$;
