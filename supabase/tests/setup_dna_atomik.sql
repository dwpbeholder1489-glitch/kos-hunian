-- Draf dan profil harus tersimpan bersama atau keduanya dibatalkan.
begin;

insert into auth.users(id, email) values
  ('ae000000-0000-0000-0000-000000000001', 'onboarding-dna@x.com');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_payload jsonb := '{"category":"retail","subcategory":"retail_sembako","name":"Toko uji onboarding"}';
  v_dna jsonb := '{"models":["retail","wholesale"],"revenue":["one_time"],"caps":["uses_inventory","uses_customer_debt"],"scale":"kecil","channels":[]}';
  v_id uuid;
  v_profile jsonb;
begin
  begin
    perform setup_create_with_dna(v_payload, v_dna || '{"models":[]}');
    raise exception 'Draf dengan DNA tidak valid semestinya gagal';
  exception when raise_exception then
    if sqlerrm <> 'Pilih minimal satu model bisnis' then raise; end if;
  end;

  if exists (select 1 from kos where name = v_payload->>'name') then
    raise exception 'Draf masih tersisa setelah validasi DNA gagal';
  end if;

  v_id := setup_create_with_dna(v_payload, v_dna);
  v_profile := dna_get(v_id);
  if v_profile->>'source' is distinct from 'onboarding'
    or v_profile->>'version' is distinct from '1'
    or not coalesce(v_profile->'dna'->'models' ? 'wholesale', false)
    or not coalesce(v_profile->'dna'->'caps' ? 'uses_customer_debt', false) then
    raise exception 'Pilihan Business DNA tidak tersimpan: %', v_profile;
  end if;

  if (setup_state(v_id)->'business'->>'status') is not distinct from 'active' then
    raise exception 'Pendaftaran mengaktifkan bisnis tanpa konfirmasi';
  end if;

  v_id := setup_create(v_payload || '{"name":"Toko klien sebelumnya"}');
  if dna_get(v_id)->>'source' is distinct from 'default' then
    raise exception 'Panggilan setup_create lama kehilangan perilaku default';
  end if;
end $$;

rollback;
