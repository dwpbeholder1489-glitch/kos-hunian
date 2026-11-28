-- Harga dan validasi lini pesanan mengikuti katalog di server.
create or replace function public.cx_order_from_room(p_conv uuid,p_order uuid,p_message uuid,p_lines jsonb) returns jsonb
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
