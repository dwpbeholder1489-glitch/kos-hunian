begin;
insert into auth.users(id, email) values
  ('fa000000-0000-0000-0000-000000000001', 'setup-saran@x.com'),
  ('fa000000-0000-0000-0000-000000000002', 'setup-saran-luar@x.com');
-- Gunakan entitlement yang tidak diberikan oleh paket apa pun dalam fixture.
update modules set entitlement = 'uji_entitlement_tidak_tersedia' where code = 'u_penawaran';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_payload jsonb := '{"category":"retail","subcategory":"retail_sembako","name":"Toko uji retail"}';
  v_retail jsonb := '{"models":["retail"],"revenue":["one_time"],"caps":["uses_inventory"],"scale":"mikro","channels":[]}';
  v_grosir jsonb := v_retail || '{"models":["retail","wholesale"],"caps":["uses_inventory","uses_customer_debt"]}';
  v_retail_id uuid;
  v_grosir_id uuid;
  v_state jsonb;
begin
  v_retail_id := setup_create_with_dna(v_payload, v_retail);
  v_grosir_id := setup_create_with_dna(v_payload || '{"name":"Toko uji grosir"}', v_grosir);
  if setup_state(v_retail_id)->'module_suggestions' ? 'modul_u_penawaran' then
    raise exception 'Retail tanpa grosir mendapatkan saran pesanan grosir';
  end if;

  v_state := setup_state(v_grosir_id)->'module_suggestions';
  if not coalesce(v_state->'modul_u_penawaran'->'reasons' ? 'Anda menjual grosir / ke pelanggan bisnis', false)
     or not coalesce(v_state->'modul_r_kontak'->'reasons' ? 'Ada pelanggan yang membayar belakangan (kasbon/piutang)', false) then
    raise exception 'Saran grosir/piutang tidak memuat alasan berdasarkan profil: %', v_state;
  end if;

  if v_state->'modul_u_penawaran'->>'state' is distinct from 'restricted' then
    raise exception 'Saran di luar paket harus ditandai terkunci';
  end if;

  perform setup_item_save(v_grosir_id, 'modul_r_kontak', null, 'tolak', null);
  perform setup_approve_recommended(v_grosir_id);
  v_state := setup_state(v_grosir_id);
  if v_state->'module_suggestions' ? 'modul_r_kontak'
     or not exists (select 1 from jsonb_array_elements(v_state->'items') x where x->>'code' = 'modul_r_kontak' and x->>'status' = 'rejected') then
    raise exception 'Persetujuan massal mengabaikan penolakan owner';
  end if;
  if exists (select 1 from jsonb_array_elements(v_state->'items') x
             where x->>'code' = 'modul_u_penawaran' and x->>'status' in ('approved', 'active')) then
    raise exception 'Persetujuan massal melewati entitlement';
  end if;

  perform set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000002', true);
  begin
    perform setup_state(v_grosir_id);
    raise exception 'Saran terbaca oleh akun di luar bisnis';
  exception when raise_exception then
    if sqlerrm <> 'Hanya pemilik/pengelola yang bisa membuka Pusat Konfirmasi' then raise; end if;
  end;
end $$;
rollback;
