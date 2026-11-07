-- QR per meja (Kuliner): pelanggan memindai QR di meja → /b/[slug]?meja=N → pesanan "makan di tempat" untuk meja itu.
-- Tetap masuk sebagai "Permintaan masuk" dan dikonfirmasi kasir (mencegah pesanan iseng).
-- Nomor meja divalidasi server (1..jumlah meja di kos.profile.tables). No. WhatsApp opsional untuk pesanan meja.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

-- 1) public_order_create: nomor meja
select public._prasara_patch('public.public_order_create(text,jsonb,text,integer)',
  'v_pd date; v_dd date;',
  'v_pd date; v_dd date; v_tbl text := nullif(left(trim(coalesce(p->>''table_no'', '''')), 10), ''''); v_ntab int;');
select public._prasara_patch('public.public_order_create(text,jsonb,text,integer)',
  '  if coalesce(p_elapsed, 0) < 3 then',
  '  if v_tbl is not null then
    v_ntab := case when coalesce(k.profile->>''tables'', '''') ~ ''^\d{1,3}$'' then (k.profile->>''tables'')::int else 0 end;
    if coalesce(k.template_code, '''') <> ''kuliner'' or v_ntab = 0 or v_tbl !~ ''^\d{1,3}$'' or v_tbl::int < 1 or v_tbl::int > v_ntab then
      return jsonb_build_object(''ok'', false, ''error'', ''Nomor meja tidak dikenal. Pindai ulang QR di meja Anda atau tanyakan ke kasir.'');
    end if;
    v_tbl := (v_tbl::int)::text; v_pick := false; v_del := false;
  end if;
  if coalesce(p_elapsed, 0) < 3 then');
-- banyak meja bisa memakai Wi-Fi warung yang sama: batas per perangkat/hari lebih longgar untuk pesanan meja
select public._prasara_patch('public.public_order_create(text,jsonb,text,integer)',
  'and created_at > now() - interval ''1 hour'') >= 3',
  'and created_at > now() - interval ''1 hour'') >= (case when v_tbl is not null then 15 else 3 end)');
select public._prasara_patch('public.public_order_create(text,jsonb,text,integer)',
  'and created_at > now() - interval ''1 day'') >= 60',
  'and created_at > now() - interval ''1 day'') >= (case when k.template_code = ''kuliner'' then 400 else 60 end)');
select public._prasara_patch('public.public_order_create(text,jsonb,text,integer)',
  '  if not coalesce((p->>''consent'')::boolean, false) then',
  '  if v_tbl is not null and length(v_name) < 2 then v_name := ''Meja '' || v_tbl; end if;
  if not (v_tbl is not null and v_phone = '''') and not coalesce((p->>''consent'')::boolean, false) then');
select public._prasara_patch('public.public_order_create(text,jsonb,text,integer)',
  '  if crm_phone(v_phone) is null then',
  '  if not (v_tbl is not null and v_phone = '''') and crm_phone(v_phone) is null then');
select public._prasara_patch('public.public_order_create(text,jsonb,text,integer)',
  'v_name, v_phone, ''permintaan''',
  'v_name, nullif(v_phone, ''''), ''permintaan''');
select public._prasara_patch('public.public_order_create(text,jsonb,text,integer)',
  '  if k.template_code = ''kuliner'' and not v_del then update svc_orders set dine = ''bungkus'' where id = v_id; end if;',
  '  if v_tbl is not null then update svc_orders set dine = ''tempat'', table_no = v_tbl where id = v_id;
  elsif k.template_code = ''kuliner'' and not v_del then update svc_orders set dine = ''bungkus'' where id = v_id; end if;');
select public._prasara_patch('public.public_order_create(text,jsonb,text,integer)',
  '''Permintaan masuk dari halaman bisnis'', ''pelanggan (halaman bisnis)'');',
  'case when v_tbl is not null then ''Pesanan dari QR meja '' || v_tbl else ''Permintaan masuk dari halaman bisnis'' end, ''pelanggan (halaman bisnis)'');');

-- 2) halaman publik tahu jumlah meja; cek status menampilkan meja
select public._prasara_patch('public.public_page_view(text)',
  '''kuliner'', k.template_code = ''kuliner'',',
  '''kuliner'', k.template_code = ''kuliner'', ''tables'', case when k.template_code = ''kuliner'' and coalesce(k.profile->>''tables'', '''') ~ ''^\d{1,3}$'' then (k.profile->>''tables'')::int else 0 end,');
select public._prasara_patch('public.public_order_status(text,text,text)',
  '''dine'', o.dine,',
  '''dine'', o.dine, ''table_no'', o.table_no,');
drop function public._prasara_patch(text, text, text);

-- 3) Jumlah meja bisa diubah setelah bisnis aktif (menu Menu & tahap)
create or replace function public.kul_tables_set(p_kos uuid, p_n int)
returns int language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak berwenang'; end if;
  if not exists (select 1 from kos where id = p_kos and business_type = 'jasa' and (template_code = 'kuliner' or category_code = 'kuliner')) then raise exception 'Khusus bisnis Kuliner'; end if;
  if p_n is null or p_n < 0 or p_n > 200 then raise exception 'Jumlah meja 0–200'; end if;
  select profile->>'tables' into v_old from kos where id = p_kos;
  update kos set profile = coalesce(profile, '{}'::jsonb) || jsonb_build_object('tables', p_n) where id = p_kos;
  perform config_log(p_kos, 'jumlah_meja', 'Jumlah meja', v_old::jsonb, to_jsonb(p_n), null, 'rendah', actor_email());
  return p_n;
end $$;
revoke all on function public.kul_tables_set(uuid, int) from public, anon;
grant execute on function public.kul_tables_set(uuid, int) to authenticated;

-- 4) Bagikan & QR: jumlah meja untuk QR per meja
create or replace function public.share_info(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pg record; k record;
begin
  if not is_member(p_kos) then raise exception 'Tidak berwenang'; end if;
  select id, name, business_type, template_code, category_code, setup_status, closed_at, profile into k from kos where id = p_kos;
  select slug, enabled into pg from public_pages where kos_id = p_kos;
  return jsonb_build_object(
    'name', k.name, 'type', k.business_type, 'kuliner', coalesce(k.template_code = 'kuliner' or k.category_code = 'kuliner', false),
    'tables', case when coalesce(k.profile->>'tables', '') ~ '^\d{1,3}$' then (k.profile->>'tables')::int else 0 end,
    'logo_path', k.profile->>'logo_path',
    'module', module_on(p_kos, 'u_halaman'),
    'live', coalesce(pg.enabled, false) and coalesce(k.setup_status, 'active') = 'active' and k.closed_at is null,
    'slug', case when coalesce(pg.enabled, false) or member_can(p_kos, 'settings') then pg.slug end,
    'can_edit', member_can(p_kos, 'settings'));
end $$;
