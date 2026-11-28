-- Template inventaris, bukti pemeriksaan dan konfirmasi serah terima.
create table public.room_inventory_templates (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  created_at timestamptz not null default now()
);
create index on public.room_inventory_templates(kos_id);
alter table public.room_inventory_templates enable row level security;
create policy room_inventory_templates_all on public.room_inventory_templates for all
  using (public.member_can(kos_id, 'rent')) with check (public.member_can(kos_id, 'rent'));
grant select, insert, delete on public.room_inventory_templates to authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.room_inventory_templates
  for each row execute function public.kos_open_guard();

create function public.room_inventory_apply(p_kos uuid, p_template uuid, p_rooms uuid[])
returns int language plpgsql set search_path = public as $$
declare v_items jsonb; v_count int;
begin
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses inventaris'; end if;
  if coalesce(cardinality(p_rooms), 0) not between 1 and 200
     or exists (select 1 from unnest(p_rooms) x(id) where not exists (select 1 from rooms where id = x.id and kos_id = p_kos))
    then raise exception 'Daftar kamar tidak valid'; end if;
  select items into v_items from room_inventory_templates where id = p_template and kos_id = p_kos;
  if not found then raise exception 'Template tidak ditemukan'; end if;
  -- Serialisasi aplikasi template agar pengiriman ulang tidak membuat salinan ganda.
  perform pg_advisory_xact_lock(hashtextextended('room_inventory:' || p_kos::text, 0));
  insert into room_items(kos_id, room_id, name, qty)
  select p_kos, r.id, i.name, i.qty
  from (select distinct unnest(p_rooms) id) r
  cross join (
    select distinct on (lower(trim(x.name))) trim(x.name) name, x.qty
    from jsonb_to_recordset(v_items) x(name text, qty int)
    order by lower(trim(x.name)), x.qty desc
  ) i
  where not exists (select 1 from room_items x where x.kos_id = p_kos and x.room_id = r.id and lower(trim(x.name)) = lower(i.name));
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.room_inventory_apply(uuid,uuid,uuid[]) from public, anon;
grant execute on function public.room_inventory_apply(uuid,uuid,uuid[]) to authenticated;

alter table public.room_inspections add column confirmed_name text,
  add column confirmed_at timestamptz,
  add column request_id uuid unique;

create function public.room_handover_save(p_kos uuid, p_room uuid, p_lease uuid, p_kind text, p_date date,
  p_items jsonb, p_note text, p_damage numeric, p_confirmed boolean, p_request uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses inventaris'; end if;
  if p_request is null then raise exception 'Permintaan tidak valid'; end if;
  if p_kind not in ('masuk','keluar') or p_kind is null then raise exception 'Pilih serah terima masuk atau keluar'; end if;
  select o.name into v_name from leases l join occupants o on o.id = l.occupant_id
  where l.id = p_lease and l.kos_id = p_kos and l.room_id = p_room and o.kos_id = p_kos
    and l.start_date <= p_date and (l.end_date is null or l.end_date >= p_date);
  if not found then raise exception 'Pilih kontrak yang berlaku pada tanggal serah terima'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Checklist belum diisi';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('room_handover:' || p_request::text, 0));
  select id into v_id from room_inspections where request_id = p_request and kos_id = p_kos and room_id = p_room
    and created_by = auth.uid();
  if found then return v_id; end if;
  if (select count(*) from room_items where kos_id = p_kos and room_id = p_room) <> jsonb_array_length(p_items)
    or (select count(distinct item->>'item_id') from jsonb_array_elements(p_items) item) <> jsonb_array_length(p_items)
    then raise exception 'Daftar perlengkapan berubah. Buka ulang checklist dan periksa semua barang'; end if;
  v_id := room_inspection_save(p_kos,p_room,p_lease,p_kind,p_date,p_items,p_note,p_damage);
  update room_inspections set request_id = p_request,
    confirmed_name = case when p_confirmed then v_name end,
    confirmed_at = case when p_confirmed then now() end
  where id = v_id;
  return v_id;
end $$;
revoke all on function public.room_handover_save(uuid,uuid,uuid,text,date,jsonb,text,numeric,boolean,uuid) from public, anon;
grant execute on function public.room_handover_save(uuid,uuid,uuid,text,date,jsonb,text,numeric,boolean,uuid) to authenticated;

alter table public.attachments drop constraint attachments_entity_check;
alter table public.attachments add constraint attachments_entity_check
  check (entity in ('bb_record','svc_order','maint_ticket','occupant','expense','project','room_item','room_inspection'));

do $$
declare def text := pg_get_functiondef('public.att_target(text,uuid)'::regprocedure);
begin
  execute replace(def, '  else
    raise exception ''Jenis data tidak dikenal'';',
  '  elsif p_entity = ''room_item'' then
    select r.kos_id, ''rent'', ''rent'' into kos_id, read_area, write_area from room_items r where r.id = p_id;
  elsif p_entity = ''room_inspection'' then
    select r.kos_id, ''rent'', ''rent'' into kos_id, read_area, write_area from room_inspections r where r.id = p_id;
  else
    raise exception ''Jenis data tidak dikenal'';');
end $$;

create trigger att_gone after delete on public.room_items
  for each row execute function public.att_parent_gone('room_item');
create trigger att_gone after delete on public.room_inspections
  for each row execute function public.att_parent_gone('room_inspection');
