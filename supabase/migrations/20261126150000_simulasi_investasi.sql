create table public.acct_investment_simulations (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  previous_id uuid references public.acct_investment_simulations(id) on delete set null,
  name text not null check (length(name) between 1 and 100),
  mode text not null check (mode in ('plan', 'direct')),
  assumptions jsonb not null check (jsonb_typeof(assumptions) = 'object' and octet_length(assumptions::text) <= 4096),
  created_at timestamptz not null default now(),
  created_by uuid not null
);
create index acct_investment_simulations_business_recent on public.acct_investment_simulations(kos_id, created_at desc, id desc);
alter table public.acct_investment_simulations enable row level security;
revoke all on public.acct_investment_simulations from public, anon, authenticated;

create function public.acct_investment_simulation(p_kos uuid, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_previous uuid;
  v_result acct_investment_simulations%rowtype;
begin
  if v_actor is null or not coalesce(member_in('finance', p_kos), false) then
    raise exception 'Tidak punya akses keuangan';
  end if;
  if p_action = 'list' then
    return coalesce((select jsonb_agg(to_jsonb(s) - 'created_by' - 'kos_id' order by s.created_at desc, s.id desc)
      from (select * from acct_investment_simulations where kos_id = p_kos order by created_at desc, id desc limit 50) s), '[]'::jsonb);
  elsif p_action = 'save' then
    v_id := (p_data->>'id')::uuid;
    v_previous := (p_data->>'previous_id')::uuid;
    if v_previous is not null and not exists (
      select 1 from acct_investment_simulations where id = v_previous and kos_id = p_kos
    ) then raise exception 'Simulasi asal tidak ditemukan'; end if;
    insert into acct_investment_simulations (id, kos_id, previous_id, name, mode, assumptions, created_by)
    values (v_id, p_kos, v_previous, trim(p_data->>'name'), p_data->>'mode', p_data->'assumptions', v_actor)
    on conflict (id) do nothing;
    select * into v_result from acct_investment_simulations where id = v_id and kos_id = p_kos;
    if not found then raise exception 'Simulasi tidak bisa disimpan'; end if;
    return to_jsonb(v_result) - 'created_by' - 'kos_id';
  end if;
  raise exception 'Tindakan simulasi tidak dikenal';
end;
$$;
revoke execute on function public.acct_investment_simulation(uuid, text, jsonb) from public, anon;
grant execute on function public.acct_investment_simulation(uuid, text, jsonb) to authenticated;
