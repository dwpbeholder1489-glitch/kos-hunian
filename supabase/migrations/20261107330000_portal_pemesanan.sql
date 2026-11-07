-- Automatic Business Setup tahap 3 — Portal pemesanan pelanggan (bisnis jasa/laundry):
-- * pelanggan memilih layanan di halaman bisnis → pesanan berstatus "permintaan" (Permintaan masuk / Menunggu konfirmasi)
--   dengan pilihan jemput/antar (hanya wilayah & jam yang diatur pemilik); harga dihitung server, belum ada pembayaran
-- * pemilik/kasir: Konfirmasi (→ diterima, pelanggan tersimpan, janji selesai dihitung sejak konfirmasi) atau Tolak
-- * pelanggan cek status pakai nomor pesanan + No. WhatsApp
-- * logo bisnis (bucket publik "logo"; hanya path yang disimpan)

-- ================= Status permintaan =================
alter table public.svc_orders drop constraint if exists svc_orders_status_check;
alter table public.svc_orders add constraint svc_orders_status_check check (status in ('permintaan', 'diterima', 'proses', 'siap', 'selesai', 'batal'));
alter table public.svc_orders add column if not exists source text not null default 'kasir' check (source in ('kasir', 'portal'));
alter table public.svc_orders add column if not exists portal_ip text;            -- hash IP (bukan IP asli), untuk batas kiriman
alter table public.svc_orders add column if not exists confirmed_at timestamptz;
create index if not exists svc_orders_portal on public.svc_orders(kos_id, created_at) where source = 'portal';

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

-- Pesanan yang masih permintaan tidak bisa diproses sebelum dikonfirmasi
select public._prasara_patch('public.svc_order_move(uuid,text,text)',
  'if o.status in (''selesai'', ''batal'') then raise exception ''Pesanan sudah %'', o.status; end if;',
  'if o.status in (''selesai'', ''batal'') then raise exception ''Pesanan sudah %'', o.status; end if;
  if o.status = ''permintaan'' then raise exception ''Ini masih permintaan dari halaman bisnis. Tekan Konfirmasi dulu.''; end if;');

-- Isi permintaan boleh diubah sebelum dikonfirmasi (mis. layanan salah pilih)
select public._prasara_patch('public.svc_order_edit(uuid,jsonb)',
  'if o.status not in (''diterima'', ''proses'') then',
  'if o.status not in (''permintaan'', ''diterima'', ''proses'') then');

-- ================= Pelanggan memesan dari halaman bisnis (dipanggil server dengan kunci server) =================
-- p: {name, phone, note, consent, lines:[{service_id, qty}], pickup, deliver, address, zone_id, pickup_date, pickup_slot, delivery_date, delivery_slot}
create or replace function public.public_order_create(p_slug text, p jsonb, p_ip_hash text, p_elapsed int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pg public_pages; k kos; v_id uuid := gen_random_uuid(); v_lines jsonb; v_sub numeric; v_fee numeric := 0; v_no text; v_day date := (now() at time zone 'Asia/Jakarta')::date;
        v_name text := left(trim(coalesce(p->>'name', '')), 80); v_phone text := left(trim(coalesce(p->>'phone', '')), 20);
        v_pick boolean := coalesce((p->>'pickup')::boolean, false); v_del boolean := coalesce((p->>'deliver')::boolean, false); z svc_zones; x jsonb; v_clean jsonb := '[]';
        v_pd date; v_dd date;
begin
  select * into pg from public_pages where slug = lower(p_slug) and enabled;
  select * into k from kos where id = pg.kos_id;
  if pg.kos_id is null or k.closed_at is not null or k.setup_status <> 'active' or k.suspended_at is not null or not module_on(k.id, 'u_halaman') or not module_on(k.id, 'u_crm') then
    return jsonb_build_object('ok', false, 'error', 'Halaman ini sedang tidak menerima pesanan.');
  end if;
  if k.business_type <> 'jasa' then return jsonb_build_object('ok', false, 'error', 'Pemesanan langsung hanya untuk bisnis jasa.'); end if;
  if coalesce(p_elapsed, 0) < 3 then return jsonb_build_object('ok', false, 'error', 'Mohon isi formulir dengan lengkap lalu kirim lagi.'); end if;
  if (select count(*) from svc_orders where kos_id = k.id and source = 'portal' and portal_ip = p_ip_hash and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from svc_orders where kos_id = k.id and source = 'portal' and created_at > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'Terlalu banyak pesanan dari perangkat ini. Coba lagi nanti atau hubungi lewat WhatsApp.');
  end if;
  if not coalesce((p->>'consent')::boolean, false) then return jsonb_build_object('ok', false, 'error', 'Centang persetujuan agar kami bisa menghubungi Anda.'); end if;
  if length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'Isi nama Anda.'); end if;
  if crm_phone(v_phone) is null then return jsonb_build_object('ok', false, 'error', 'Isi No. WhatsApp yang benar.'); end if;
  -- layanan: hanya yang aktif di bisnis ini; jumlah wajar
  for x in select * from jsonb_array_elements(case when jsonb_typeof(p->'lines') = 'array' then p->'lines' else '[]' end) loop
    if not exists (select 1 from svc_services where id = nullif(x->>'service_id', '')::uuid and kos_id = k.id and active) then
      return jsonb_build_object('ok', false, 'error', 'Ada layanan yang sudah tidak tersedia. Muat ulang halaman.');
    end if;
    if coalesce((x->>'qty')::numeric, 0) <= 0 or (x->>'qty')::numeric > 1000 then return jsonb_build_object('ok', false, 'error', 'Isi jumlah layanan yang benar.'); end if;
    v_clean := v_clean || jsonb_build_object('service_id', x->>'service_id', 'qty', (x->>'qty')::numeric, 'note', left(coalesce(x->>'note', ''), 120));
  end loop;
  if jsonb_array_length(v_clean) = 0 or jsonb_array_length(v_clean) > 10 then return jsonb_build_object('ok', false, 'error', 'Pilih 1–10 layanan.'); end if;
  v_lines := svc_price_lines(k.id, v_clean);
  v_sub := (select sum((e->>'line_total')::numeric) from jsonb_array_elements(v_lines) e);
  -- antar jemput: hanya bila modul aktif, wilayah & jam dari daftar pemilik
  if (v_pick or v_del) then
    if not module_on(k.id, 'j_antar') then return jsonb_build_object('ok', false, 'error', 'Antar jemput tidak tersedia.'); end if;
    if length(trim(coalesce(p->>'address', ''))) < 5 then return jsonb_build_object('ok', false, 'error', 'Isi alamat untuk antar jemput.'); end if;
    if exists (select 1 from svc_zones where kos_id = k.id and active) then
      select * into z from svc_zones where id = nullif(p->>'zone_id', '')::uuid and kos_id = k.id and active;
      if z.id is null then return jsonb_build_object('ok', false, 'error', 'Pilih wilayah. Alamat di luar wilayah yang dilayani belum bisa dijemput/diantar — hubungi lewat WhatsApp.'); end if;
      v_fee := z.fee;
    end if;
    v_pd := case when v_pick then nullif(p->>'pickup_date', '')::date end;
    v_dd := case when v_del then nullif(p->>'delivery_date', '')::date end;
    if v_pd is not null and (v_pd < v_day or v_pd > v_day + 30) or v_dd is not null and (v_dd < v_day or v_dd > v_day + 45) then
      return jsonb_build_object('ok', false, 'error', 'Tanggal jemput/antar tidak valid.');
    end if;
    if coalesce(p->>'pickup_slot', '') <> '' and not exists (select 1 from svc_slots where kos_id = k.id and active and label = p->>'pickup_slot' and kind in ('jemput', 'keduanya')) then
      return jsonb_build_object('ok', false, 'error', 'Jam jemput tidak tersedia.');
    end if;
    if coalesce(p->>'delivery_slot', '') <> '' and not exists (select 1 from svc_slots where kos_id = k.id and active and label = p->>'delivery_slot' and kind in ('antar', 'keduanya')) then
      return jsonb_build_object('ok', false, 'error', 'Jam antar tidak tersedia.');
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('svc:' || k.id::text));
  v_no := 'PSN-' || to_char(v_day, 'YYMMDD') || '-' || lpad(((select count(*) from svc_orders where kos_id = k.id and number like 'PSN-' || to_char(v_day, 'YYMMDD') || '-%') + 1)::text, 3, '0');
  insert into svc_orders(id, kos_id, number, customer_name, customer_phone, status, due_at, pickup, deliver, address, delivery_fee, subtotal, discount, total, note, source, portal_ip, zone_id, created_by)
  values (v_id, k.id, v_no, v_name, v_phone, 'permintaan', null, v_pick, v_del, nullif(trim(coalesce(p->>'address', '')), ''), case when v_pick or v_del then v_fee else 0 end,
          v_sub, 0, v_sub + case when v_pick or v_del then v_fee else 0 end, nullif(left(trim(coalesce(p->>'note', '')), 300), ''), 'portal', p_ip_hash, z.id, null);
  insert into svc_order_lines(order_id, kos_id, service_id, name, unit, qty, charge_qty, price, line_total, note)
  select v_id, k.id, (e->>'service_id')::uuid, e->>'name', e->>'unit', (e->>'qty')::numeric, (e->>'charge_qty')::numeric, (e->>'price')::numeric, (e->>'line_total')::numeric, nullif(e->>'note', '')
  from jsonb_array_elements(v_lines) e;
  -- jadwal yang dipilih pelanggan (kapasitas dicek)
  if v_pick or v_del then
    perform svc_logistics_apply(v_id, jsonb_build_object('pickup_date', v_pd, 'pickup_slot', p->>'pickup_slot', 'delivery_date', v_dd, 'delivery_slot', p->>'delivery_slot'));
  end if;
  insert into svc_events(order_id, kos_id, kind, text, actor) values (v_id, k.id, 'status', 'Permintaan masuk dari halaman bisnis', 'pelanggan (halaman bisnis)');
  return jsonb_build_object('ok', true, 'number', v_no, 'kos_id', k.id, 'order_id', v_id, 'total', v_sub + case when v_pick or v_del then v_fee else 0 end);
exception when others then
  if sqlerrm like 'Jadwal jemput % sudah penuh' then return jsonb_build_object('ok', false, 'error', sqlerrm || '. Pilih jam lain.'); end if;
  raise;
end $$;
revoke all on function public.public_order_create(text, jsonb, text, int) from public, anon, authenticated;
grant execute on function public.public_order_create(text, jsonb, text, int) to service_role;

-- Pelanggan cek status (nomor pesanan + No. WhatsApp yang sama)
create or replace function public.public_order_status(p_slug text, p_number text, p_phone text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pg public_pages; o svc_orders; v_paid numeric;
begin
  select * into pg from public_pages where slug = lower(p_slug) and enabled;
  if pg.kos_id is null then return jsonb_build_object('ok', false, 'error', 'Halaman tidak ditemukan.'); end if;
  select * into o from svc_orders where kos_id = pg.kos_id and upper(number) = upper(trim(coalesce(p_number, ''))) and crm_phone(customer_phone) = crm_phone(p_phone);
  if o.id is null or crm_phone(p_phone) is null then return jsonb_build_object('ok', false, 'error', 'Pesanan tidak ditemukan. Periksa nomor pesanan dan No. WhatsApp.'); end if;
  v_paid := svc_paid(o.id);
  return jsonb_build_object('ok', true, 'number', o.number, 'name', o.customer_name, 'status', o.status, 'stage', (select name from svc_stages where id = o.stage_id),
    'received_at', o.received_at, 'confirmed_at', o.confirmed_at, 'due_at', o.due_at, 'completed_at', o.completed_at,
    'pickup', o.pickup, 'pickup_status', o.pickup_status, 'pickup_date', o.pickup_date, 'pickup_slot', o.pickup_slot,
    'deliver', o.deliver, 'delivery_status', o.delivery_status, 'delivery_date', o.delivery_date, 'delivery_slot', o.delivery_slot,
    'total', o.total, 'paid', v_paid, 'lunas', v_paid >= o.total, 'void_reason', case when o.status = 'batal' then o.void_reason end,
    'lines', (select jsonb_agg(jsonb_build_object('name', l.name, 'qty', l.qty, 'unit', l.unit, 'line_total', l.line_total)) from svc_order_lines l where l.order_id = o.id));
end $$;
revoke all on function public.public_order_status(text, text, text) from public, anon, authenticated;
grant execute on function public.public_order_status(text, text, text) to service_role;

-- ================= Pemilik/kasir: konfirmasi atau tolak =================
create or replace function public.svc_request_confirm(p_order uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o svc_orders; v_contact uuid; v_hours int; v_fee numeric;
begin
  select * into o from svc_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform svc_guard(o.kos_id, 'sell');
  if o.status <> 'permintaan' then raise exception 'Pesanan ini sudah %', case o.status when 'batal' then 'ditolak/batal' else 'dikonfirmasi' end; end if;
  -- pelanggan baru disimpan saat dikonfirmasi (bukan saat kiriman masuk)
  select id into v_contact from contacts where kos_id = o.kos_id and kind = 'pelanggan' and archived_at is null and crm_phone(phone) = crm_phone(o.customer_phone) limit 1;
  if v_contact is null and crm_phone(o.customer_phone) is not null then
    insert into contacts(kos_id, kind, name, phone) values (o.kos_id, 'pelanggan', o.customer_name, o.customer_phone) returning id into v_contact;
  end if;
  select max(s.hours) into v_hours from svc_order_lines l join svc_services s on s.id = l.service_id where l.order_id = o.id;
  v_fee := case when p ? 'delivery_fee' and (o.pickup or o.deliver) then greatest(0, coalesce(nullif(p->>'delivery_fee', '')::numeric, o.delivery_fee)) else o.delivery_fee end;
  update svc_orders set status = 'diterima', contact_id = coalesce(contact_id, v_contact), confirmed_at = now(), received_at = now(),
    due_at = coalesce(nullif(p->>'due_at', '')::timestamptz, now() + make_interval(hours => coalesce(v_hours, 48))),
    delivery_fee = v_fee, total = subtotal - discount + v_fee
  where id = o.id;
  perform svc_event(o.id, 'status', 'Dikonfirmasi' || coalesce(' · ' || nullif(trim(coalesce(p->>'note', '')), ''), ''));
  return jsonb_build_object('ok', true, 'number', o.number);
end $$;

create or replace function public.svc_request_reject(p_order uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare o svc_orders;
begin
  select * into o from svc_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform svc_guard(o.kos_id, 'sell');
  if o.status <> 'permintaan' then raise exception 'Hanya permintaan yang belum dikonfirmasi yang bisa ditolak'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasannya (dikirim ke pelanggan lewat WA oleh Anda)'; end if;
  update svc_orders set status = 'batal', void_reason = trim(p_reason), voided_at = now() where id = o.id;
  perform svc_event(o.id, 'status', 'Permintaan ditolak · ' || trim(p_reason));
end $$;

-- Dashboard: jumlah permintaan menunggu konfirmasi
select public._prasara_patch('public.svc_dashboard(uuid)',
  '''any'', exists (select 1 from svc_orders where kos_id = p_kos),',
  '''any'', exists (select 1 from svc_orders where kos_id = p_kos),
    ''permintaan'', (select count(*) from svc_orders where kos_id = p_kos and status = ''permintaan''),');
select public._prasara_patch('public.svc_dashboard(uuid)',
  '''baru_hari_ini'', (select count(*) from svc_orders where kos_id = p_kos and (received_at at time zone ''Asia/Jakarta'')::date = d and status <> ''batal''),',
  '''baru_hari_ini'', (select count(*) from svc_orders where kos_id = p_kos and (received_at at time zone ''Asia/Jakarta'')::date = d and status not in (''batal'', ''permintaan'')),');
-- Papan: sumber pesanan
select public._prasara_patch('public.svc_board(uuid)',
  'o.pickup, o.deliver, o.address, o.pickup_status,',
  'o.source, o.confirmed_at, o.pickup, o.deliver, o.address, o.pickup_status,');
-- Antar jemput: permintaan belum masuk daftar jemput
select public._prasara_patch('public.svc_logistics(uuid)',
  'from svc_orders o where o.kos_id = p_kos and o.status not in (''selesai'', ''batal'')',
  'from svc_orders o where o.kos_id = p_kos and o.status not in (''selesai'', ''batal'', ''permintaan'')');

-- ================= Halaman bisnis: data pemesanan & logo =================
select public._prasara_patch('public.public_page_view(text)',
  '''wa_phone'', pg.wa_phone, ''policy'', pg.policy, ''links'', pg.links,',
  '''wa_phone'', pg.wa_phone, ''policy'', pg.policy, ''links'', pg.links, ''logo'', k.profile->>''logo_path'',
    ''order'', case when k.business_type = ''jasa'' and pg.catalog_mode <> ''tidak'' then jsonb_build_object(
      ''logistics'', module_on(k.id, ''j_antar''),
      ''zones'', case when module_on(k.id, ''j_antar'') then (select coalesce(jsonb_agg(jsonb_build_object(''id'', z.id, ''name'', z.name, ''fee'', z.fee, ''note'', z.note) order by z.sort, z.name), ''[]'') from svc_zones z where z.kos_id = k.id and z.active) else ''[]''::jsonb end,
      ''slots'', case when module_on(k.id, ''j_antar'') then (select coalesce(jsonb_agg(jsonb_build_object(''label'', s.label, ''kind'', s.kind) order by s.sort), ''[]'') from svc_slots s where s.kos_id = k.id and s.active) else ''[]''::jsonb end) end,');

-- ================= Logo =================
create or replace function public.logo_prepare(p_kos uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa mengganti logo'; end if;
  if (select closed_at from kos where id = p_kos) is not null then raise exception 'Bisnis sudah ditutup'; end if;
  return p_kos || '/logo-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10) || '.jpg';
end $$;
create or replace function public.logo_set(p_kos uuid, p_path text)
returns text language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa mengganti logo'; end if;
  if p_path is not null and p_path !~ ('^' || p_kos || '/logo-[0-9a-f]{10}\.jpg$') then raise exception 'Lokasi logo tidak valid'; end if;
  select profile->>'logo_path' into v_old from kos where id = p_kos;
  perform set_config('prasara.setup_ok', '1', true);
  update kos set profile = case when p_path is null then profile - 'logo_path' else profile || jsonb_build_object('logo_path', p_path) end where id = p_kos;
  perform config_log(p_kos, 'ubah_logo', 'Logo', jsonb_build_object('logo', v_old), jsonb_build_object('logo', p_path), null, 'rendah', actor_email());
  -- item "Logo" di Pusat Konfirmasi mengikuti
  update setup_items set complete = p_path is not null,
    status = case when p_path is null then 'needs_information' when status in ('needs_information', 'draft') then 'pending_owner_confirmation' else status end, updated_at = now()
  where kos_id = p_kos and code = 'logo';
  return v_old;
end $$;
-- item Logo kini bisa diisi: input 'logo'
update public.setup_items set input = 'logo', help = 'Unggah logo (foto/gambar persegi). Tampil di halaman bisnis dan aplikasi.' where code = 'logo' and input = 'pending';
update public.biz_templates set spec = replace(replace(spec::text, '"input": "pending"', '"input": "logo"'),
  'Unggah logo tersedia bersama portal pemesanan (tahap berikutnya).', 'Unggah logo (foto/gambar persegi). Tampil di halaman bisnis dan aplikasi.')::jsonb where spec::text like '%"input": "pending"%';
select public._prasara_patch('public.setup_clean(text,jsonb,jsonb,uuid)',
  'elsif p_input = ''pending'' then',
  'elsif p_input = ''logo'' then
    v := ''{}''; ok := (select profile->>''logo_path'' from kos where id = p_kos) is not null;
  elsif p_input = ''pending'' then');

drop function public._prasara_patch(text, text, text);
