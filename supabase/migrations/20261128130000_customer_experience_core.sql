-- Shared communication keyed by source module and transaction. Authorization is resolved by the adapter.
create table public.customer_messages (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  reference_type text not null check (reference_type = 'so_order'),
  reference_id uuid not null references public.so_orders(id) on delete cascade,
  sender text not null check (sender in ('customer', 'business')),
  actor_id uuid,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz
);
create index customer_messages_thread on public.customer_messages(kos_id, reference_type, reference_id, created_at desc, id desc);
alter table public.customer_messages enable row level security;
revoke all on public.customer_messages from public, anon, authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.customer_messages
for each row execute function public.kos_open_guard();

create function public.cx_order(p_reference uuid, p_slug text, p_credential text, p_access text)
returns public.so_orders language sql stable security definer set search_path = public as $$
  select o.* from so_orders o join kos k on k.id = o.kos_id
  where o.id = p_reference and k.business_type = 'retail'
    and k.closed_at is null and k.suspended_at is null and k.setup_status = 'active'
    and case p_access
      when 'owner' then k.owner_id = auth.uid()
      when 'guest' then o.portal_guest_hash = p_credential and exists (
        select 1 from public_pages p where p.kos_id = k.id and p.slug = p_slug and p.enabled
          and module_on(k.id, 'u_halaman') and module_on(k.id, 'u_crm'))
      when 'private' then o.portal_guest_hash is null and o.contact_id = (cportal_contact(p_credential)).id
        and cportal_block(k.id) is null
      else false end
$$;
revoke execute on function public.cx_order(uuid,text,text,text) from public, anon, authenticated;

create function public.cx_exchange(p_reference uuid, p_slug text, p_credential text, p_access text,
  p_action text, p_message uuid default null, p_body text default null, p_before uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o so_orders; side text; cursor_at timestamptz; message customer_messages; incoming text;
begin
  o := cx_order(p_reference, p_slug, p_credential, p_access);
  if o.id is null then return null; end if;
  side := case when p_access = 'owner' then 'business' else 'customer' end;
  incoming := case when side = 'business' then 'customer' else 'business' end;
  if p_action = 'send' then
    if p_message is null or length(trim(coalesce(p_body,''))) not between 1 and 2000 then return jsonb_build_object('error','Pesan tidak valid.'); end if;
    perform pg_advisory_xact_lock(hashtext('cx:' || o.id::text));
    select * into message from customer_messages where id = p_message;
    if not found then
      if (select count(*) from customer_messages m where m.kos_id = o.kos_id and m.reference_id = o.id
        and m.sender = side and m.created_at > now() - interval '1 minute') >= 15 then
        return jsonb_build_object('error','Tunggu sebentar sebelum mengirim pesan lagi.');
      end if;
      insert into customer_messages(id,kos_id,reference_type,reference_id,sender,actor_id,body)
      values (p_message,o.kos_id,'so_order',o.id,side,auth.uid(),trim(p_body)) returning * into message;
      if side = 'customer' then
        begin
          perform dom_emit(o.kos_id, 'CustomerMessageReceived', 'so_order', o.id, p_message::text,
            'sell', 'Pesan pelanggan · ' || o.number, null, '{}'::jsonb);
        exception when others then
          raise warning 'Customer message notification failed (%)', sqlstate;
        end;
      end if;
    end if;
    if message.kos_id <> o.kos_id or message.reference_id <> o.id or message.sender <> side or message.body <> trim(p_body) then
      return jsonb_build_object('error','Pesan tidak valid.');
    end if;
    return jsonb_build_object('ok',true);
  elsif p_action = 'read' then
    select m.created_at into cursor_at from customer_messages m
      where m.id = p_message and m.kos_id = o.kos_id and m.reference_id = o.id and m.sender = incoming;
    if found then
      update customer_messages m set read_at = clock_timestamp() where m.kos_id = o.kos_id
        and m.reference_id = o.id and m.sender = incoming and m.read_at is null
        and (m.created_at,m.id) <= (cursor_at,p_message);
    end if;
    return jsonb_build_object('ok',true);
  elsif p_action <> 'list' then return null;
  end if;
  if p_before is not null then
    select m.created_at into cursor_at from customer_messages m where m.kos_id = o.kos_id and m.reference_id = o.id and m.id = p_before;
    if not found then return null; end if;
  end if;
  return jsonb_build_object(
    'messages', (select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]') from (
      select id,sender,body,created_at,read_at from customer_messages m
      where m.kos_id = o.kos_id and m.reference_id = o.id
        and (p_before is null or (m.created_at,m.id) < (cursor_at,p_before))
      order by created_at desc,id desc limit 40) m),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at,e.id),'[]') from (
      select event_id,id,event_type,occurred_at from domain_events e
      where e.kos_id = o.kos_id and (
        (e.aggregate_type = 'so_order' and e.aggregate_id = o.id and e.event_type in
          ('SalesOrderCreated','SalesOrderDikonfirmasi','SalesOrderSebagian','SalesOrderSelesai','SalesOrderBatal'))
        or (e.aggregate_type = 'so_delivery' and e.event_type in ('DeliveryCreated','DeliveryDiterima','DeliveryGagal')
          and exists(select 1 from so_deliveries d where d.id = e.aggregate_id and d.kos_id = o.kos_id and d.order_id = o.id))
      ) order by occurred_at desc,id desc limit 100) e)
  );
end $$;
revoke execute on function public.cx_exchange(uuid,text,text,text,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.cx_exchange(uuid,text,text,text,text,uuid,text,uuid) to service_role;

create function public.cx_owner_exchange(p_reference uuid,p_action text,p_message uuid default null,p_body text default null,p_before uuid default null)
returns jsonb language sql security definer set search_path = public as $$
  select cx_exchange(p_reference,null,null,'owner',p_action,p_message,p_body,p_before)
$$;
revoke execute on function public.cx_owner_exchange(uuid,text,uuid,text,uuid) from public,anon;
grant execute on function public.cx_owner_exchange(uuid,text,uuid,text,uuid) to authenticated;

create function public.cx_owner_inbox(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(i) order by i.last_at desc),'[]') from (
    select o.id,o.number,c.name customer,max(m.created_at) last_at,
      count(*) filter (where m.sender = 'customer' and m.read_at is null) unread
    from kos k join so_orders o on o.kos_id = k.id
    join customer_messages m on m.kos_id = k.id and m.reference_id = o.id
    left join contacts c on c.id = o.contact_id and c.kos_id = k.id
    where k.id = p_kos and k.owner_id = auth.uid() and k.closed_at is null
      and k.suspended_at is null and k.setup_status = 'active' and k.business_type = 'retail'
    group by o.id,c.name order by max(m.created_at) desc limit 100
  ) i
$$;
revoke execute on function public.cx_owner_inbox(uuid) from public,anon;
grant execute on function public.cx_owner_inbox(uuid) to authenticated;

insert into public.notif_event_types(code,category,priority,audience,area,title,push_default,link,module)
values ('CustomerMessageReceived','pelanggan','normal','owner','sell','Pesan pelanggan baru',false,
  '/grosir?pesanan={id}&chat=1','Chat pelanggan')
on conflict (code) do nothing;

create function public.cx_guest_unread(p_slug text,p_guest text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(q.reference_id,q.unread),'{}'::jsonb)
  from (
    select m.reference_id,count(*) unread
    from public_pages p join kos k on k.id = p.kos_id
    join so_orders o on o.kos_id = k.id and o.portal_guest_hash = p_guest
    join customer_messages m on m.kos_id = k.id and m.reference_id = o.id
    where p.slug = p_slug and p.enabled and k.business_type = 'retail'
      and k.closed_at is null and k.suspended_at is null and k.setup_status = 'active'
      and module_on(k.id,'u_halaman') and module_on(k.id,'u_crm')
      and m.sender = 'business' and m.read_at is null
    group by m.reference_id
  ) q
$$;
revoke execute on function public.cx_guest_unread(text,text) from public,anon,authenticated;
grant execute on function public.cx_guest_unread(text,text) to service_role;
