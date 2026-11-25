-- Saran Pusat Konfirmasi dihitung dari profil dan paket saat ini.
create function public.setup_module_suggestions(p_kos uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(it.code, jsonb_build_object(
    'state', case when coalesce((m->>'plan_ok')::boolean, false) then 'recommended' else 'restricted' end,
    'reasons', case
      when jsonb_array_length(m->'reasons') > 0 then m->'reasons'
      else jsonb_build_array('Sesuai model dan kebutuhan operasional bisnis Anda.')
    end,
    'benefit', m->>'benefit'
  )), '{}'::jsonb)
  from jsonb_array_elements(public.relevance_core(p_kos)->'modules') m
  join public.setup_items it on it.kos_id = p_kos and it.kind = 'modul' and it.spec->>'module' = m->>'code'
  where it.status not in ('approved', 'active', 'rejected', 'paused')
    and m->>'relevance' <> 'planned'
    and (jsonb_array_length(m->'rules') > 0 or (m->>'score')::int >= 60);
$$;

revoke execute on function public.setup_module_suggestions(uuid) from public, anon, authenticated;

-- Pertahankan bentuk respons lama dan tambahkan saran untuk UI baru.
do $$
declare
  v_definition text := pg_get_functiondef('public.setup_state(uuid)'::regprocedure);
  v_marker text := $marker$    'items', coalesce($marker$;
begin
  if position(v_marker in v_definition) = 0 then
    raise exception 'setup_state: titik penambahan saran modul tidak ditemukan';
  end if;
  execute replace(v_definition, v_marker, $replacement$    'module_suggestions', setup_module_suggestions(p_kos),
    'items', coalesce($replacement$);
end $$;

create or replace function public.setup_approve_recommended(p_kos uuid)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  it setup_items;
  v_suggestions jsonb;
  v_count int := 0;
  v_progress int;
begin
  if not member_can(p_kos, 'team') then raise exception 'Hanya pemilik bisnis'; end if;
  v_suggestions := setup_module_suggestions(p_kos);

  -- Selesaikan dependensi yang juga disarankan sebelum mencoba modul berikutnya.
  loop
    v_progress := 0;
    for it in
      select * from setup_items
      where kos_id = p_kos and kind = 'modul'
        and status not in ('approved', 'active', 'rejected', 'paused')
        and v_suggestions->code->>'state' = 'recommended'
      order by sort, code
      for update
    loop
      begin
        perform setup_item_save(p_kos, it.code, null, 'setujui', null);
        v_progress := v_progress + 1;
      exception when raise_exception then
        -- RPC existing menolak modul yang dependensinya atau syarat paketnya belum terpenuhi.
        null;
      end;
    end loop;
    exit when v_progress = 0;
    v_count := v_count + v_progress;
  end loop;

  return v_count;
end $$;
