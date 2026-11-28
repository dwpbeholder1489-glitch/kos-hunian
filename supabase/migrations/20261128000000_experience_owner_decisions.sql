-- Shared navigation, action and dashboard configurations require an owner decision.
-- Module requests retain module_set's existing approval workflow and data retention.
do $$
declare
  procedure_name text;
  definition text;
  old_guard constant text := $guard$if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;$guard$;
  owner_guard constant text := $guard$if not member_can(p_kos, 'team') then raise exception 'Perubahan ini hanya dapat diputuskan oleh pemilik bisnis'; end if;$guard$;
begin
  foreach procedure_name in array array[
    'public.experience_save(uuid,text,jsonb,text)',
    'public.experience_reset(uuid,text)',
    'public.experience_restore(uuid,bigint)',
    'public.reco_decide(uuid,uuid,text,text,integer)'
  ] loop
    definition := pg_get_functiondef(procedure_name::regprocedure);
    if position(old_guard in definition) = 0 then
      raise exception 'Pemeriksaan izin tidak ditemukan pada %', procedure_name;
    end if;
    execute replace(definition, old_guard, owner_guard);
  end loop;
end $$;
