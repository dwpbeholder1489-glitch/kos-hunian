-- Realtime hanya menyiarkan sinyal perubahan. Isi pesan tetap dibaca melalui RPC berizin.
create table public.cx_room_updates (
  conversation_id uuid primary key references public.customer_conversations(id) on delete cascade,
  changed_at timestamptz not null default clock_timestamp()
);
alter table public.cx_room_updates enable row level security;
create function public.cx_can_watch(p_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from customer_conversations c where c.id = p_conv and member_in(cx_area(c),c.kos_id));
$$;
revoke all on function public.cx_can_watch(uuid) from public, anon;
grant execute on function public.cx_can_watch(uuid) to authenticated;
grant select on public.cx_room_updates to authenticated;
create policy cx_watch on public.cx_room_updates for select to authenticated using (cx_can_watch(conversation_id));
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    alter publication supabase_realtime add table public.cx_room_updates;
  end if;
end $$;
create function public.cx_emit_room() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into cx_room_updates(conversation_id) values (new.conversation_id)
    on conflict (conversation_id) do update set changed_at = clock_timestamp();
  return new;
end $$;
revoke all on function public.cx_emit_room() from public, anon, authenticated;
create trigger cx_emit_room after insert or update of read_at on public.customer_messages
  for each row execute function public.cx_emit_room();

create table public.cx_customer_activity (
  conversation_id uuid primary key references public.customer_conversations(id) on delete cascade,
  seen_at timestamptz not null default clock_timestamp()
);
alter table public.cx_customer_activity enable row level security;

alter table public.customer_messages drop constraint customer_messages_kind_check,
  drop constraint customer_messages_card, drop constraint customer_messages_card_side;
alter table public.customer_messages
  add constraint customer_messages_kind_check check (kind in ('teks','gambar','dokumen','produk','penawaran','pembayaran','catatan','pesanan')),
  add constraint customer_messages_card check ((kind in ('produk','penawaran','pembayaran','pesanan')) = (payload is not null)),
  add constraint customer_messages_card_side check (kind not in ('produk','penawaran','pembayaran','pesanan') or sender = 'business');

create function public.cx_live_payload(p_kos uuid, p_kind text, p jsonb, p_channel text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r record; v_order jsonb; v_paid numeric;
begin
  if p_kind = 'produk' then
    select pr.active,pr.name,pr.base_unit,pr.stock,pr.is_kit,u.name as unit,u.price_retail,u.price_wholesale into r
    from products pr left join product_units u on u.product_id = pr.id and u.name = p->>'unit'
    where pr.kos_id = p_kos and pr.id::text = p->>'product_id';
    if not found or not r.active or r.unit is null then return p || jsonb_build_object('unavailable',true); end if;
    return p || jsonb_build_object('name',r.name,'base_unit',r.base_unit,'stock',case when not r.is_kit then greatest(r.stock,0) end,
      'price',case when p_channel = 'grosir' and r.price_wholesale > 0 then r.price_wholesale else r.price_retail end);
  elsif p_kind in ('pesanan','penawaran') or (p_kind = 'pembayaran' and p ? 'order_id') then
    v_order := cx_track(p_kos,coalesce(p->>'type','so_order'),(p->>'order_id')::uuid);
    if v_order is null then return p || jsonb_build_object('unavailable',true); end if;
    if coalesce(p->>'type','so_order') = 'so_order' then
      select case when coalesce(sum(s.amt_kasbon),0) = 0 then coalesce(sum(s.total),0)
          when member_in('sell,finance',p_kos) then greatest(coalesce(sum(s.total - coalesce(a.open_amount,0)),0),0)
          end into v_paid
      from so_deliveries d join sales s on s.id=d.sale_id and s.kos_id=d.kos_id and s.status='selesai'
      left join receivable_open(p_kos, (select o.contact_id from so_orders o where o.id=d.order_id)) a on a.sale_id=s.id
      where d.kos_id=p_kos and d.order_id::text=p->>'order_id' and d.status <> 'gagal';
      if v_paid is not null then
        v_order := v_order || jsonb_build_object('paid',v_paid,'lunas',v_paid >= (v_order->>'total')::numeric);
      end if;
    end if;
    return p || (select jsonb_object_agg(key,value) from jsonb_each(v_order) where key in ('status','total','paid','payment','lunas','valid_until'))
      || jsonb_build_object('items',jsonb_array_length(v_order->'lines'),'number',v_order->>'number');
  end if;
  return p;
end $$;
revoke all on function public.cx_live_payload(uuid,text,jsonb,text) from public, anon, authenticated;

create function public.cx_room_meta(c customer_conversations) returns jsonb
language sql stable security definer set search_path = public as $$
  with relevant as (
    select o.id,o.number,o.total,o.status,o.created_at,'so_order' as type
    from so_orders o where o.kos_id = c.kos_id and c.channel <> 'jasa' and (
      (c.guest_hash is not null and o.portal_guest_hash = c.guest_hash)
      or (c.guest_hash is null and o.portal_guest_hash is null and o.contact_id = c.contact_id)
      or (c.reference_type = 'so_order' and o.id = c.reference_id))
    union all
    select s.id,s.number,s.total,s.status,s.created_at,'svc_order'
    from svc_orders s where s.kos_id = c.kos_id and c.channel = 'jasa'
      and (s.contact_id = c.contact_id or (c.reference_type = 'svc_order' and s.id = c.reference_id))
  )
  select jsonb_build_object(
    'online',exists(select 1 from cx_customer_activity where conversation_id = c.id and seen_at > now() - interval '90 seconds'),
    'since',coalesce((select created_at from contacts where id = c.contact_id and kos_id = c.kos_id),c.created_at),
    'can_order',case when c.channel = 'jasa' then member_in('sell,ops',c.kos_id)
      else module_on(c.kos_id,'u_penawaran') and member_in('sell,finance',c.kos_id)
        and exists(select 1 from contacts where id = c.contact_id and kos_id = c.kos_id and kind = 'pelanggan') end,
    'count',(select count(*) from relevant where status not in ('batal','penawaran')),
    'total',(select coalesce(sum(total),0) from relevant where status not in ('batal','penawaran')),
    'orders',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc),'[]')
      from (select * from relevant order by created_at desc limit 30) r)
  );
$$;
revoke all on function public.cx_room_meta(customer_conversations) from public, anon, authenticated;

create function public.cx_order_from_room(p_conv uuid,p_order uuid,p_message uuid,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c customer_conversations; res jsonb; v_type text; old_message customer_messages; v_lines jsonb;
begin
  select * into c from customer_conversations where id = p_conv;
  if c.id is null or not member_in(cx_area(c),c.kos_id) then raise exception 'Percakapan tidak ditemukan'; end if;
  if not cx_chat_on(c.kos_id) then raise exception 'Chat pelanggan sedang dimatikan'; end if;
  if p_order is null or p_message is null or jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Pesanan tidak valid'; end if;
  if jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'Pilih 1 sampai 50 baris pesanan'; end if;
  perform pg_advisory_xact_lock(hashtext('cx:' || c.id::text));
  select * into old_message from customer_messages where id = p_message;
  if found then
    if old_message.conversation_id <> c.id or old_message.kind <> 'pesanan' or old_message.payload->>'order_id' <> p_order::text then
      raise exception 'Permintaan tidak valid'; end if;
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;
  if exists(select 1 from so_orders where id=p_order) or exists(select 1 from svc_orders where id=p_order) then raise exception 'ID pesanan sudah dipakai'; end if;
  if c.channel = 'jasa' then
    v_type := 'svc_order';
    select jsonb_agg(jsonb_build_object('service_id',line->>'service_id','qty',line->'qty') order by position)
      into v_lines from jsonb_array_elements(p_lines) with ordinality as x(line,position);
    perform svc_order_create(p_order,c.kos_id,jsonb_build_object('contact_id',c.contact_id,'name',c.customer_name,
      'phone',c.customer_phone,'lines',v_lines,'discount',0,'deliver',false,'pickup',false));
  else
    if c.contact_id is null then raise exception 'Pesanan dari chat memerlukan pelanggan yang tertaut'; end if;
    v_type := 'so_order';
    select jsonb_agg(jsonb_build_object('product_id',line->>'product_id','unit',line->>'unit','qty',line->'qty') order by position)
      into v_lines from jsonb_array_elements(p_lines) with ordinality as x(line,position);
    perform so_save(p_order,c.kos_id,jsonb_build_object('contact_id',c.contact_id,'lines',v_lines,'confirm',true));
    update so_orders set portal_kind='pesanan',portal_guest_hash=c.guest_hash where id=p_order and kos_id=c.kos_id;
  end if;
  res := cx_post(c,'business',p_message,'pesanan','',jsonb_build_object('order_id',p_order,'type',v_type),null);
  if res ? 'error' then raise exception '%', res->>'error'; end if;
  return res;
end $$;
revoke all on function public.cx_order_from_room(uuid,uuid,uuid,jsonb) from public, anon;
grant execute on function public.cx_order_from_room(uuid,uuid,uuid,jsonb) to authenticated;

do $$
declare b text;
begin
  b := pg_get_functiondef('public.cx_customer(jsonb)'::regprocedure);
  b := replace(b, 'if v_op = ''list'' then', 'if v_op = ''list'' then
    if c.id is not null then
      insert into cx_customer_activity(conversation_id) values (c.id)
        on conflict (conversation_id) do update set seen_at = clock_timestamp()
        where cx_customer_activity.seen_at < clock_timestamp() - interval ''25 seconds'';
    end if;');
  execute b;
  b := pg_get_functiondef('public.cx_messages(uuid,boolean,uuid)'::regprocedure);
  b := replace(b, '''payload'', m.payload', '''payload'', cx_live_payload(m.kos_id,m.kind,m.payload,
    (select channel from customer_conversations where id=m.conversation_id))');
  execute b;
  b := pg_get_functiondef('public.cx_thread(uuid,text,jsonb)'::regprocedure);
  b := replace(b, '''messages'', cx_messages(c.id, true, v_before)', '''room'', cx_room_meta(c), ''messages'', cx_messages(c.id, true, v_before)');
  execute b;
end $$;

create function public.cx_send_order_bill(p_conv uuid,p_order uuid,p_message uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c customer_conversations; k kos; v_order jsonb; v_type text; v_result jsonb;
begin
  select * into c from customer_conversations where id = p_conv;
  if c.id is null or not member_in(cx_area(c),c.kos_id) then raise exception 'Percakapan tidak ditemukan'; end if;
  if not cx_chat_on(c.kos_id) then raise exception 'Chat pelanggan sedang dimatikan'; end if;
  select elem->>'type' into v_type from jsonb_array_elements(cx_room_meta(c)->'orders') elem where elem->>'id' = p_order::text;
  if v_type is null then raise exception 'Pesanan tidak terkait pelanggan ini'; end if;
  v_order := cx_track(c.kos_id,v_type,p_order);
  if v_order is null or v_order->>'status' in ('penawaran','batal') then raise exception 'Pesanan belum bisa ditagihkan'; end if;
  select * into k from kos where id = c.kos_id;
  if nullif(trim(coalesce(k.payment_info,'')),'') is null and k.qris_image is null then raise exception 'Isi rekening atau QRIS di Pengaturan'; end if;
  v_result := cx_post(c,'business',p_message,'pembayaran','',jsonb_build_object(
    'order_id',p_order,'type',v_type,'number',v_order->>'number','total',v_order->'total',
    'payment_info',k.payment_info,'qris',k.qris_image,'rules',k.profile->>'payment_rules'),null);
  if v_result ? 'error' then raise exception '%', v_result->>'error'; end if;
  return v_result;
end $$;
revoke all on function public.cx_send_order_bill(uuid,uuid,uuid) from public, anon;
grant execute on function public.cx_send_order_bill(uuid,uuid,uuid) to authenticated;

create function public.cx_room_track(p_conv uuid,p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c customer_conversations; v_type text;
begin
  select * into c from customer_conversations where id = p_conv;
  if c.id is null or not member_in(cx_area(c),c.kos_id) then
    raise exception 'Percakapan tidak ditemukan';
  end if;
  select elem->>'type' into v_type from jsonb_array_elements(cx_room_meta(c)->'orders') elem
    where elem->>'id' = p_order::text;
  if v_type is null and not exists (
    select 1 from customer_messages m where m.conversation_id=c.id and m.sender='business'
      and m.kind in ('pesanan','penawaran','pembayaran') and m.payload->>'order_id'=p_order::text
  ) then raise exception 'Pesanan tidak terkait percakapan ini'; end if;
  return cx_track(c.kos_id,coalesce(v_type,case when c.channel='jasa' then 'svc_order' else 'so_order' end),p_order);
end $$;
revoke all on function public.cx_room_track(uuid,uuid) from public, anon;
grant execute on function public.cx_room_track(uuid,uuid) to authenticated;
