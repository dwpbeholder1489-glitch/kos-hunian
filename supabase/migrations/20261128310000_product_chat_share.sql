-- Konteks produk berasal dari katalog publik dan menempel pada satu pesan, tanpa duplikasi percakapan.
alter table public.customer_messages add column product_context jsonb;
alter table public.customer_conversations add column guest_signal uuid not null default gen_random_uuid();

create function public.cx_public_product(p_slug text, p_product uuid, p_unit text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('product_id', pr.id, 'name', pr.name, 'unit', u.name,
    'price', case when pg.show_prices and u.price > 0 then u.price end, 'available', u.available,
    'photo', (select m.thumb_path from media_links l join media m on m.id = l.media_id and m.kos_id = l.kos_id
      where l.kos_id = pr.kos_id and l.entity = 'product' and l.entity_id = pr.id
        and m.deleted_at is null and m.uploaded_at is not null order by l.sort, l.created_at, l.id limit 1),
    'slug', pg.slug)
  from public_pages pg join kos k on k.id = pg.kos_id
  join products pr on pr.id = p_product and pr.kos_id = k.id and pr.active
  cross join lateral (
    select pu.name, pricing.price, portal_stock(pr, branch_main_id(k.id)) >= pu.qty as available
    from product_units pu
    cross join lateral (select case when pg.show_prices then portal_unit_price(k.id, null, pr.id, pu.name, 1, 'ecer') end as price) pricing
    where pu.product_id = pr.id and pu.kos_id = k.id and (p_unit is null or pu.name = p_unit)
    order by (pricing.price > 0) desc nulls last, (portal_stock(pr, branch_main_id(k.id)) >= pu.qty) desc, pu.sort, pu.qty
    limit 1
  ) u
  where pg.slug = lower(p_slug) and pg.enabled and k.business_type = 'retail'
    and k.closed_at is null and k.suspended_at is null and k.setup_status = 'active'
    and module_on(k.id, 'u_halaman') and module_on(k.id, 'u_crm')
    and (pg.catalog_mode = 'semua' or (pg.catalog_mode = 'favorit' and pr.favorite));
$$;
revoke all on function public.cx_public_product(text, uuid, text) from public, anon, authenticated;
grant execute on function public.cx_public_product(text, uuid, text) to service_role;

-- Pesan tetap mengikuti autentikasi, batas pengiriman, dan idempotensi cx_customer.
create function public.cx_customer_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare product jsonb; result jsonb; product_id uuid;
begin
  if p->>'access' is distinct from 'guest' or p->>'ref' is distinct from 'umum'
     or coalesce(p->>'op', '') not in ('list', 'send') then return null; end if;
  begin product_id := (p->>'product_id')::uuid; exception when invalid_text_representation then return null; end;
  product := cx_public_product(p->>'slug', product_id, p->>'product_unit');
  if p->>'op' = 'send' and product is null then
    return jsonb_build_object('error', 'Produk atau satuan sudah tidak tersedia di katalog.');
  end if;
  result := cx_customer(p);
  if p->>'op' = 'list' and result is not null then return result || jsonb_build_object('product', product); end if;
  if result->>'ok' = 'true' and result->>'duplicate' is distinct from 'true' then
    update customer_messages set product_context = product where id = (result->>'id')::uuid;
  end if;
  return result;
end $$;
revoke all on function public.cx_customer_product(jsonb) from public, anon, authenticated;
grant execute on function public.cx_customer_product(jsonb) to service_role;

-- Kanal tamu hanya menerima sinyal kosong dan namanya diberikan melalui akses cookie yang sudah diperiksa.
do $$
declare b text;
begin
  b := pg_get_functiondef('public.cx_customer(jsonb)'::regprocedure);
  b := replace(b, '''need_identity'', v_umum', '''signal'', case when v_access = ''guest'' then c.guest_signal end, ''need_identity'', v_umum');
  execute b;
  b := pg_get_functiondef('public.cx_messages(uuid,boolean,uuid)'::regprocedure);
  b := replace(b, '''created_at'', m.created_at', '''product_context'', case when m.product_context is not null then
      coalesce(cx_public_product((select slug from public_pages where kos_id = m.kos_id), (m.product_context->>''product_id'')::uuid, m.product_context->>''unit''),
        jsonb_build_object(''product_id'', m.product_context->''product_id'', ''name'', m.product_context->''name'', ''unavailable'', true)) end,
      ''created_at'', m.created_at');
  execute b;
end $$;

create function public.cx_emit_guest() returns trigger
language plpgsql security definer set search_path = public as $$
declare signal uuid;
begin
  if new.kind = 'catatan' or to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return new; end if;
  select c.guest_signal into signal from customer_conversations c
    where c.id = new.conversation_id and c.guest_hash is not null;
  if signal is not null then
    execute 'select realtime.send(''{}''::jsonb, ''changed'', $1, false)' using 'cx-guest:' || signal::text;
  end if;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.cx_emit_guest() from public, anon, authenticated;
create trigger cx_emit_guest after insert or update of read_at on public.customer_messages
  for each row execute function public.cx_emit_guest();
