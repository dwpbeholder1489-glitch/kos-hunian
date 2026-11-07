-- Automatic Business Setup tahap 2 — Laundry lengkap:
-- * layanan: deskripsi, persyaratan, info tambahan (ketersediaan = aktif/nonaktif)
-- * antar jemput: wilayah + biaya (svc_zones), jadwal/slot (svc_slots), status jemput & antar per pesanan
--   (pesanan dijemput tidak bisa diproses sebelum "sudah dijemput"; "dalam pengantaran" → "terkirim" = diserahkan)
-- * modul j_antar (Antar jemput), dikendalikan item "Antar jemput" di Pusat Konfirmasi
-- * ringkasan dashboard dari transaksi nyata (svc_dashboard)

-- ================= Layanan =================
alter table public.svc_services add column if not exists description text check (description is null or length(description) <= 300);
alter table public.svc_services add column if not exists requirements text check (requirements is null or length(requirements) <= 300);
alter table public.svc_services add column if not exists info text check (info is null or length(info) <= 300);

-- ================= Antar jemput: wilayah & jadwal =================
create table if not exists public.svc_zones (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  fee numeric(14,2) not null default 0 check (fee >= 0),
  note text check (note is null or length(note) <= 200),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists svc_zones_name on public.svc_zones(kos_id, lower(name));
create table if not exists public.svc_slots (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  label text not null check (length(trim(label)) between 3 and 40),     -- mis. "08.00–10.00"
  kind text not null default 'keduanya' check (kind in ('jemput', 'antar', 'keduanya')),
  capacity int check (capacity is null or capacity between 1 and 500),  -- maks pesanan per slot per hari (opsional)
  active boolean not null default true,
  sort int not null default 0
);
alter table public.svc_zones enable row level security;
alter table public.svc_slots enable row level security;
drop policy if exists svc_zones_read on public.svc_zones;
create policy svc_zones_read on public.svc_zones for select using (public.member_can(kos_id, 'sell') or public.member_can(kos_id, 'ops') or public.member_can(kos_id, 'settings'));
drop policy if exists svc_slots_read on public.svc_slots;
create policy svc_slots_read on public.svc_slots for select using (public.member_can(kos_id, 'sell') or public.member_can(kos_id, 'ops') or public.member_can(kos_id, 'settings'));
grant select on public.svc_zones, public.svc_slots to authenticated;
drop trigger if exists zz_kos_open_guard on public.svc_zones;
create trigger zz_kos_open_guard before insert or update or delete on public.svc_zones for each row execute function public.kos_open_guard();
drop trigger if exists zz_kos_open_guard on public.svc_slots;
create trigger zz_kos_open_guard before insert or update or delete on public.svc_slots for each row execute function public.kos_open_guard();

-- ================= Status jemput & antar per pesanan =================
alter table public.svc_orders add column if not exists zone_id uuid references public.svc_zones(id) on delete set null;
alter table public.svc_orders add column if not exists pickup_status text check (pickup_status in ('menunggu', 'dijadwalkan', 'dijemput', 'gagal'));
alter table public.svc_orders add column if not exists pickup_date date;
alter table public.svc_orders add column if not exists pickup_slot text;
alter table public.svc_orders add column if not exists picked_at timestamptz;
alter table public.svc_orders add column if not exists delivery_status text check (delivery_status in ('menunggu', 'dijadwalkan', 'dalam_pengantaran', 'terkirim', 'gagal'));
alter table public.svc_orders add column if not exists delivery_date date;
alter table public.svc_orders add column if not exists delivery_slot text;
alter table public.svc_orders add column if not exists delivered_at timestamptz;
alter table public.svc_orders add column if not exists courier text;

-- pesanan lama
update public.svc_orders set pickup_status = case when status in ('diterima') then 'menunggu' else 'dijemput' end where pickup and pickup_status is null;
update public.svc_orders set delivery_status = case when status = 'selesai' then 'terkirim' else 'menunggu' end where deliver and delivery_status is null;

create or replace function public.svc_orders_logi_defaults()
returns trigger language plpgsql as $$
begin
  if new.pickup and new.pickup_status is null then new.pickup_status := case when new.pickup_date is not null then 'dijadwalkan' else 'menunggu' end; end if;
  if not new.pickup then new.pickup_status := null; new.pickup_date := null; new.pickup_slot := null; end if;
  if new.deliver and new.delivery_status is null then new.delivery_status := case when new.delivery_date is not null then 'dijadwalkan' else 'menunggu' end; end if;
  if not new.deliver then new.delivery_status := null; new.delivery_date := null; new.delivery_slot := null; end if;
  return new;
end $$;
drop trigger if exists svc_orders_logi on public.svc_orders;
create trigger svc_orders_logi before insert or update of pickup, deliver on public.svc_orders for each row execute function public.svc_orders_logi_defaults();

-- ================= Modul Antar jemput =================
insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, sort) values
  ('j_antar', 'Antar jemput', 'Wilayah & biaya antar jemput, jadwal, daftar jemput/antar hari ini, status dijemput / dalam pengantaran / terkirim.', '{jasa}', false, '{}', null, '{/antar}', 'Alamat pelanggan, jadwal, status antar jemput', 'available', 13)
on conflict (code) do nothing;
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'j_antar', true, 'sistem' from public.kos k where k.business_type = 'jasa' and k.setup_status = 'active' on conflict do nothing;

-- ================= Fungsi: pengaturan wilayah & jadwal =================
create or replace function public.svc_zone_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid := p_id; v_fee numeric := coalesce((p->>'fee')::numeric, 0);
begin
  perform svc_guard(p_kos, 'settings');
  if not module_on(p_kos, 'j_antar') then raise exception 'Modul Antar jemput sedang nonaktif'; end if;
  if length(trim(coalesce(p->>'name', ''))) < 2 then raise exception 'Isi nama wilayah'; end if;
  if v_fee < 0 then raise exception 'Biaya tidak boleh minus'; end if;
  if v is null then
    insert into svc_zones(kos_id, name, fee, note, active, sort) values (p_kos, trim(p->>'name'), v_fee, nullif(trim(coalesce(p->>'note', '')), ''), coalesce((p->>'active')::boolean, true),
      coalesce((select max(sort) + 1 from svc_zones where kos_id = p_kos), 1)) returning id into v;
  else
    update svc_zones set name = trim(p->>'name'), fee = v_fee, note = nullif(trim(coalesce(p->>'note', '')), ''), active = coalesce((p->>'active')::boolean, active) where id = v and kos_id = p_kos;
    if not found then raise exception 'Wilayah tidak ditemukan'; end if;
  end if;
  perform config_log(p_kos, 'ubah_wilayah_antar', trim(p->>'name'), null, p, null, 'rendah', actor_email());
  return v;
exception when unique_violation then raise exception 'Wilayah "%" sudah ada', trim(p->>'name');
end $$;

create or replace function public.svc_slot_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid := p_id;
begin
  perform svc_guard(p_kos, 'settings');
  if not module_on(p_kos, 'j_antar') then raise exception 'Modul Antar jemput sedang nonaktif'; end if;
  if length(trim(coalesce(p->>'label', ''))) < 3 then raise exception 'Isi jam, mis. 08.00–10.00'; end if;
  if coalesce(p->>'kind', 'keduanya') not in ('jemput', 'antar', 'keduanya') then raise exception 'Jenis jadwal tidak dikenal'; end if;
  if v is null then
    insert into svc_slots(kos_id, label, kind, capacity, active, sort) values (p_kos, trim(p->>'label'), coalesce(p->>'kind', 'keduanya'), nullif(p->>'capacity', '')::int,
      coalesce((p->>'active')::boolean, true), coalesce((select max(sort) + 1 from svc_slots where kos_id = p_kos), 1)) returning id into v;
  else
    update svc_slots set label = trim(p->>'label'), kind = coalesce(p->>'kind', kind), capacity = nullif(p->>'capacity', '')::int, active = coalesce((p->>'active')::boolean, active)
    where id = v and kos_id = p_kos;
    if not found then raise exception 'Jadwal tidak ditemukan'; end if;
  end if;
  perform config_log(p_kos, 'ubah_jadwal_antar', trim(p->>'label'), null, p, null, 'rendah', actor_email());
  return v;
end $$;

-- ================= Fungsi: jadwal & status per pesanan =================
-- p: {zone_id, address, pickup_date, pickup_slot, delivery_date, delivery_slot, courier}
create or replace function public.svc_logistics_apply(p_order uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare o svc_orders; z svc_zones; v_zone uuid := nullif(p->>'zone_id', '')::uuid; v_n int;
begin
  select * into o from svc_orders where id = p_order for update;
  if not (o.pickup or o.deliver) then return; end if;
  if v_zone is not null then
    select * into z from svc_zones where id = v_zone and kos_id = o.kos_id and active;
    if z.id is null then raise exception 'Wilayah antar jemput tidak dikenal / nonaktif'; end if;
  elsif p ? 'zone_id' and exists (select 1 from svc_zones where kos_id = o.kos_id and active) and o.zone_id is null then
    raise exception 'Pilih wilayah antar jemput. Alamat di luar wilayah yang dilayani tidak bisa dijemput/diantar.';
  end if;
  -- kapasitas slot per hari
  if coalesce(p->>'pickup_slot', '') <> '' and p->>'pickup_date' is not null then
    select count(*) into v_n from svc_orders where kos_id = o.kos_id and id <> o.id and pickup_date = (p->>'pickup_date')::date and pickup_slot = p->>'pickup_slot' and status <> 'batal';
    if v_n >= coalesce((select capacity from svc_slots where kos_id = o.kos_id and label = p->>'pickup_slot' and active limit 1), 100000) then raise exception 'Jadwal jemput % sudah penuh', p->>'pickup_slot'; end if;
  end if;
  update svc_orders set
    zone_id = coalesce(v_zone, zone_id),
    address = coalesce(nullif(trim(coalesce(p->>'address', '')), ''), address),
    pickup_date = case when pickup and p ? 'pickup_date' then nullif(p->>'pickup_date', '')::date else pickup_date end,
    pickup_slot = case when pickup and p ? 'pickup_slot' then nullif(trim(p->>'pickup_slot'), '') else pickup_slot end,
    delivery_date = case when deliver and p ? 'delivery_date' then nullif(p->>'delivery_date', '')::date else delivery_date end,
    delivery_slot = case when deliver and p ? 'delivery_slot' then nullif(trim(p->>'delivery_slot'), '') else delivery_slot end,
    courier = case when p ? 'courier' then nullif(trim(p->>'courier'), '') else courier end
  where id = o.id;
  update svc_orders set
    pickup_status = case when pickup and pickup_status in ('menunggu', 'gagal') and pickup_date is not null then 'dijadwalkan' else pickup_status end,
    delivery_status = case when deliver and delivery_status in ('menunggu', 'gagal') and delivery_date is not null then 'dijadwalkan' else delivery_status end
  where id = o.id;
end $$;
revoke all on function public.svc_logistics_apply(uuid, jsonb) from public, anon, authenticated;

create or replace function public.svc_logistics_set(p_order uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare o svc_orders;
begin
  select * into o from svc_orders where id = p_order;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform svc_guard(o.kos_id, 'sell,ops');
  if o.status in ('selesai', 'batal') then raise exception 'Pesanan sudah %', o.status; end if;
  perform svc_logistics_apply(o.id, p);
  perform svc_event(o.id, 'antar', 'Jadwal antar jemput diubah'
    || coalesce(' · jemput ' || to_char((select pickup_date from svc_orders where id = o.id), 'DD/MM') || coalesce(' ' || (select pickup_slot from svc_orders where id = o.id), ''), '')
    || coalesce(' · antar ' || to_char((select delivery_date from svc_orders where id = o.id), 'DD/MM') || coalesce(' ' || (select delivery_slot from svc_orders where id = o.id), ''), ''));
end $$;

-- Jemput: dijemput / gagal
create or replace function public.svc_pickup(p_order uuid, p_action text, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare o svc_orders;
begin
  select * into o from svc_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform svc_guard(o.kos_id, 'sell,ops');
  if not o.pickup then raise exception 'Pesanan ini tidak dijemput'; end if;
  if o.status in ('selesai', 'batal') then raise exception 'Pesanan sudah %', o.status; end if;
  if p_action = 'dijemput' then
    if o.pickup_status = 'dijemput' then raise exception 'Sudah dijemput'; end if;
    update svc_orders set pickup_status = 'dijemput', picked_at = now() where id = o.id;
    perform svc_event(o.id, 'antar', 'Sudah dijemput' || coalesce(' · ' || nullif(trim(coalesce(p_note, '')), ''), ''));
  elsif p_action = 'gagal' then
    if coalesce(length(trim(p_note)), 0) < 3 then raise exception 'Tuliskan alasannya (mis. pelanggan tidak di rumah)'; end if;
    if o.pickup_status = 'dijemput' then raise exception 'Sudah dijemput'; end if;
    update svc_orders set pickup_status = 'gagal', pickup_date = null, pickup_slot = null where id = o.id;
    perform svc_event(o.id, 'antar', 'Jemput gagal · ' || trim(p_note));
  else raise exception 'Tindakan tidak dikenal'; end if;
  return p_action;
end $$;

-- Antar: berangkat / terkirim (= diserahkan) / gagal
create or replace function public.svc_delivery(p_order uuid, p_action text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o svc_orders; r jsonb;
begin
  select * into o from svc_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform svc_guard(o.kos_id, 'sell,ops');
  if not o.deliver then raise exception 'Pesanan ini tidak diantar'; end if;
  if o.status <> 'siap' then raise exception 'Pesanan belum siap diantar'; end if;
  if p_action = 'berangkat' then
    update svc_orders set delivery_status = 'dalam_pengantaran', courier = coalesce(courier, actor_email()) where id = o.id;
    perform svc_event(o.id, 'antar', 'Dalam pengantaran' || coalesce(' · ' || nullif(trim(coalesce(p_note, '')), ''), ''));
    return jsonb_build_object('status', 'dalam_pengantaran');
  elsif p_action = 'gagal' then
    if coalesce(length(trim(p_note)), 0) < 3 then raise exception 'Tuliskan alasannya'; end if;
    update svc_orders set delivery_status = 'gagal', delivery_date = null, delivery_slot = null where id = o.id;
    perform svc_event(o.id, 'antar', 'Antar gagal · ' || trim(p_note));
    return jsonb_build_object('status', 'gagal');
  elsif p_action = 'terkirim' then
    -- petugas proses (tanpa akses uang) hanya boleh menyerahkan pesanan yang sudah lunas
    if not member_in('sell', o.kos_id) and svc_paid(o.id) < o.total then raise exception 'Pesanan belum lunas. Serah terima & penagihan oleh kasir/pemilik.'; end if;
    if not member_in('sell', o.kos_id) then perform set_config('prasara.svc_handover_ok', '1', true); end if;
    r := svc_order_move(o.id, 'selesai', p_note);
    return r;
  else raise exception 'Tindakan tidak dikenal'; end if;
end $$;

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

-- Proses tidak bisa dimulai sebelum dijemput; serah terima pesanan antar = terkirim
select public._prasara_patch('public.svc_order_move(uuid,text,text)',
  'if p_to = ''selesai'' then perform svc_guard(o.kos_id, ''sell''); else perform svc_guard(o.kos_id, ''sell,ops''); end if;',
  'if p_to = ''selesai'' and coalesce(current_setting(''prasara.svc_handover_ok'', true), '''') <> ''1'' then perform svc_guard(o.kos_id, ''sell''); else perform svc_guard(o.kos_id, ''sell,ops''); end if;
  if p_to in (''next'', ''siap'') and o.status = ''diterima'' and o.pickup and coalesce(o.pickup_status, '''') <> ''dijemput'' then
    raise exception ''Cucian belum dijemput. Tandai "Sudah dijemput" dulu.'';
  end if;');
select public._prasara_patch('public.svc_order_move(uuid,text,text)',
  'handover = case when v_status = ''selesai'' then nullif(trim(coalesce(p_note, '''')), '''') else handover end',
  'handover = case when v_status = ''selesai'' then nullif(trim(coalesce(p_note, '''')), '''') else handover end,
    delivery_status = case when v_status = ''selesai'' and o.deliver then ''terkirim'' when v_status in (''proses'', ''diterima'') and delivery_status = ''dalam_pengantaran'' then ''menunggu'' else delivery_status end,
    delivered_at = case when v_status = ''selesai'' and o.deliver then now() else delivered_at end');

-- Pesanan baru: wilayah, jadwal jemput/antar
select public._prasara_patch('public.svc_order_create(uuid,uuid,jsonb)',
  '  perform svc_event(p_id, ''status'', ''Pesanan diterima''',
  '  if coalesce((p->>''pickup'')::boolean, false) or coalesce((p->>''deliver'')::boolean, false) then perform svc_logistics_apply(p_id, p); end if;
  perform svc_event(p_id, ''status'', ''Pesanan diterima''');

-- Papan pesanan: kolom antar jemput (No. HP untuk petugas antar jemput)
select public._prasara_patch('public.svc_board(uuid)',
  'o.pickup, o.deliver, o.address,',
  'o.pickup, o.deliver, o.address, o.pickup_status, o.pickup_date, o.pickup_slot, o.picked_at, o.delivery_status, o.delivery_date, o.delivery_slot, o.delivered_at, o.courier,
        o.zone_id, (select name from svc_zones z where z.id = o.zone_id) as zone_name,
        case when not v_money and (o.pickup or o.deliver) then o.customer_phone end as logi_phone,');

-- Layanan: deskripsi, persyaratan, info
select public._prasara_patch('public.svc_service_save(uuid,uuid,jsonb)',
  'returning id into v;',
  'returning id into v;
    update svc_services set description = nullif(trim(coalesce(p->>''description'', '''')), ''''), requirements = nullif(trim(coalesce(p->>''requirements'', '''')), ''''),
      info = nullif(trim(coalesce(p->>''info'', '''')), '''') where id = v;');
select public._prasara_patch('public.svc_service_save(uuid,uuid,jsonb)',
  'hours = coalesce((p->>''hours'')::int, hours), active = coalesce((p->>''active'')::boolean, active)',
  'hours = coalesce((p->>''hours'')::int, hours), active = coalesce((p->>''active'')::boolean, active),
      description = nullif(trim(coalesce(p->>''description'', '''')), ''''), requirements = nullif(trim(coalesce(p->>''requirements'', '''')), ''''), info = nullif(trim(coalesce(p->>''info'', '''')), '''')');

-- Setup: layanan membawa deskripsi/persyaratan; item "Antar jemput" = modul j_antar + wilayah + jadwal
select public._prasara_patch('public.setup_apply(uuid)',
  'min_qty = (it.value->>''min_qty'')::numeric, category = it.value->>''category'', active = true where id = v_id;',
  'min_qty = (it.value->>''min_qty'')::numeric, category = it.value->>''category'', description = it.value->>''description'', requirements = it.value->>''requirements'', active = true where id = v_id;');
select public._prasara_patch('public.setup_apply(uuid)',
  'returning id into v_id;
      update setup_items',
  'returning id into v_id;
      update svc_services set description = it.value->>''description'', requirements = it.value->>''requirements'' where id = v_id;
      update setup_items');
select public._prasara_patch('public.setup_apply(uuid)',
  'elsif v_apply = ''delivery'' then update kos set profile = profile || jsonb_build_object(''delivery'', it.value) where id = k.id;',
  'elsif v_apply = ''delivery'' then
    update kos set profile = profile || jsonb_build_object(''delivery'', it.value) where id = k.id;
    insert into business_modules(kos_id, module_code, active, updated_at, updated_by) values (k.id, ''j_antar'', true, now(), actor_email())
    on conflict (kos_id, module_code) do update set active = true, updated_at = now(), updated_by = excluded.updated_by;
    -- wilayah: dipisah koma, biaya sama (bisa dibedakan nanti di menu Antar jemput)
    for x in select trim(z) from regexp_split_to_table(coalesce(it.value->>''areas'', ''''), ''[,;\n]'') z where length(trim(z)) >= 2 loop
      insert into svc_zones(kos_id, name, fee, sort) values (k.id, left(x, 80), coalesce((it.value->>''fee'')::numeric, 0), coalesce((select max(sort) + 1 from svc_zones where kos_id = k.id), 1))
      on conflict do nothing;
    end loop;
    -- jadwal: ambil rentang jam yang tertulis (mis. "jemput 08–10, antar 16–19")
    for x in select (regexp_matches(lower(coalesce(it.value->>''schedule'', '''')), ''(jemput|antar)?[^0-9a-z]*(?:jam|pukul|pkl)?[^0-9a-z]*([0-9]{1,2})(?:[.:]([0-9]{2}))? ?[-–] ?([0-9]{1,2})(?:[.:]([0-9]{2}))?'', ''g''))::text loop
      declare mm text[] := x::text[];
      begin
        if mm[2]::int between 0 and 23 and mm[4]::int between 0 and 24 and not exists (select 1 from svc_slots where kos_id = k.id
            and label = lpad(mm[2], 2, ''0'') || ''.'' || coalesce(mm[3], ''00'') || ''–'' || lpad(mm[4], 2, ''0'') || ''.'' || coalesce(mm[5], ''00'')) then
          insert into svc_slots(kos_id, label, kind, sort) values (k.id, lpad(mm[2], 2, ''0'') || ''.'' || coalesce(mm[3], ''00'') || ''–'' || lpad(mm[4], 2, ''0'') || ''.'' || coalesce(mm[5], ''00''),
            coalesce(mm[1], ''keduanya''), coalesce((select max(sort) + 1 from svc_slots where kos_id = k.id), 1));
        end if;
      end;
    end loop;');
select public._prasara_patch('public.setup_unapply(uuid)',
  'elsif it.spec->>''apply'' = ''service'' and',
  'elsif it.spec->>''apply'' = ''delivery'' then
    if exists (select 1 from svc_orders where kos_id = it.kos_id and status not in (''selesai'', ''batal'') and (pickup or deliver)) then
      raise exception ''Masih ada pesanan antar jemput yang berjalan. Selesaikan dulu.'';
    end if;
    update business_modules set active = false, updated_at = now(), updated_by = actor_email() where kos_id = it.kos_id and module_code = ''j_antar'';
  elsif it.spec->>''apply'' = ''service'' and');
-- modul j_antar tidak ditawarkan terpisah di Pusat Konfirmasi (mengikuti item "Antar jemput")
select public._prasara_patch('public.setup_generate(uuid)',
  'for m in select * from modules where k.business_type = any(applies_to) and not core and status = ''available'' order by sort loop',
  'for m in select * from modules where k.business_type = any(applies_to) and not core and status = ''available'' and code <> ''j_antar'' order by sort loop');
-- Halaman bisnis: deskripsi & persyaratan layanan ikut tampil
select public._prasara_patch('public.public_page_view(text)',
  '''note'', case when s.min_qty > 0 then ''minimal '' || trim(to_char(s.min_qty, ''FM999990.###'')) || '' '' || s.unit end,',
  '''note'', nullif(concat_ws('' · '', s.description, case when s.min_qty > 0 then ''minimal '' || trim(to_char(s.min_qty, ''FM999990.###'')) || '' '' || s.unit end,
            ''Syarat: '' || s.requirements, s.info), ''''),');
drop function public._prasara_patch(text, text, text);

-- ================= Daftar antar jemput & ringkasan dashboard =================
create or replace function public.svc_logistics(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform svc_guard(p_kos, 'sell,ops');
  return jsonb_build_object(
    'zones', (select coalesce(jsonb_agg(to_jsonb(z) - 'kos_id' order by z.sort, z.name), '[]') from svc_zones z where z.kos_id = p_kos),
    'slots', (select coalesce(jsonb_agg(to_jsonb(s) - 'kos_id' order by s.sort, s.label), '[]') from svc_slots s where s.kos_id = p_kos),
    'note', (select profile->'delivery' from kos where id = p_kos),
    'orders', (select coalesce(jsonb_agg(z order by coalesce(z.pickup_date, z.delivery_date) nulls last, z.number), '[]') from (
      select o.id, o.number, o.customer_name, o.customer_phone, o.address, o.status, o.pickup, o.deliver, o.pickup_status, o.pickup_date, o.pickup_slot, o.picked_at,
        o.delivery_status, o.delivery_date, o.delivery_slot, o.delivered_at, o.courier, o.due_at, (select name from svc_zones z where z.id = o.zone_id) as zone_name,
        case when member_in('sell,finance', p_kos) then o.total - svc_paid(o.id) end as sisa, o.total - svc_paid(o.id) <= 0 as lunas,
        (select string_agg(l.name || ' ' || trim(to_char(l.qty, 'FM999990.###')) || ' ' || l.unit, ', ') from svc_order_lines l where l.order_id = o.id) as items
      from svc_orders o where o.kos_id = p_kos and o.status not in ('selesai', 'batal')
        and ((o.pickup and o.pickup_status <> 'dijemput') or (o.deliver and o.status = 'siap'))) z));
end $$;

create or replace function public.svc_dashboard(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_money boolean; d date := (now() at time zone 'Asia/Jakarta')::date;
begin
  perform svc_guard(p_kos, 'sell,ops,finance');
  v_money := member_in('sell,finance', p_kos);
  return jsonb_build_object(
    'any', exists (select 1 from svc_orders where kos_id = p_kos),
    'baru_hari_ini', (select count(*) from svc_orders where kos_id = p_kos and (received_at at time zone 'Asia/Jakarta')::date = d and status <> 'batal'),
    'menunggu_jemput', (select count(*) from svc_orders where kos_id = p_kos and status = 'diterima' and pickup and pickup_status <> 'dijemput'),
    'belum_diproses', (select count(*) from svc_orders where kos_id = p_kos and status = 'diterima' and (not pickup or pickup_status = 'dijemput')),
    'per_tahap', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'n', (select count(*) from svc_orders o where o.stage_id = s.id and o.status = 'proses')) order by s.sort), '[]')
      from svc_stages s where s.kos_id = p_kos and s.active),
    'siap_diambil', (select count(*) from svc_orders where kos_id = p_kos and status = 'siap' and not deliver),
    'siap_diantar', (select count(*) from svc_orders where kos_id = p_kos and status = 'siap' and deliver and coalesce(delivery_status, '') <> 'dalam_pengantaran'),
    'dalam_pengantaran', (select count(*) from svc_orders where kos_id = p_kos and status = 'siap' and deliver and delivery_status = 'dalam_pengantaran'),
    'selesai_hari_ini', (select count(*) from svc_orders where kos_id = p_kos and status = 'selesai' and completed_date = d),
    'pendapatan_hari_ini', case when v_money then (select coalesce(sum(total), 0) from svc_orders where kos_id = p_kos and status = 'selesai' and completed_date = d) end,
    'pendapatan_bulan_ini', case when v_money then (select coalesce(sum(total), 0) from svc_orders where kos_id = p_kos and status = 'selesai' and completed_date >= date_trunc('month', d)::date) end,
    'tertunda', case when v_money then (select coalesce(sum(o.total - svc_paid(o.id)), 0) from svc_orders o where o.kos_id = p_kos and o.status <> 'batal' and o.total > svc_paid(o.id)) end,
    'tertunda_n', case when v_money then (select count(*) from svc_orders o where o.kos_id = p_kos and o.status <> 'batal' and o.total > svc_paid(o.id)) end);
end $$;
