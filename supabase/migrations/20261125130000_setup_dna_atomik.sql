-- Simpan Business DNA dan draf dalam satu transaksi melalui RPC existing.
create function public.setup_create_with_dna(p jsonb, p_dna jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.setup_create(p);
  perform public.dna_save(v_id, p_dna, 'Pendaftaran bisnis', 'onboarding');
  return v_id;
end $$;

revoke execute on function public.setup_create_with_dna(jsonb, jsonb) from public, anon;
grant execute on function public.setup_create_with_dna(jsonb, jsonb) to authenticated;
