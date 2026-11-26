-- Portal bisnis publik dan portal grosir memakai mesin SO dan resolusi harga yang sama.
alter table public.so_orders add column portal_guest_hash text,
  add column portal_fulfillment text check (portal_fulfillment in ('ambil', 'antar')),
  add column portal_payment text check (portal_payment in ('tunai', 'transfer', 'qris'));
create index so_orders_portal_guest on public.so_orders(kos_id, portal_guest_hash, created_at desc)
  where portal_guest_hash is not null;

create function public.portal_stock(p products, b uuid) returns numeric
language sql stable set search_path = public as $$
  select case when (p).is_kit then kit_avail((p).id, b)
         else coalesce((select l.qty from stock_levels l where l.product_id = (p).id and l.branch_id = b), 0)
              - stock_held_at((p).id, b) - stock_reserved_at((p).id, b) end;
$$;
revoke execute on function public.portal_stock(products, uuid) from public, anon, authenticated;

create or replace function public.portal_unit_price(p_kos uuid, p_contact uuid, p_product uuid, p_unit text, p_qty numeric, p_tier text)
returns numeric language sql stable security definer set search_path = public as $$
  select case when x.base is null then null else least(x.base, coalesce(price_break(p_product, p_unit, p_tier, coalesce(p_qty, 1)), x.base)) end
  from (select price_resolve(p_kos, p_contact, u.product_id, u.name, p_tier, u.price_retail, u.price_wholesale) base
        from product_units u where u.product_id = p_product and u.name = p_unit and u.kos_id = p_kos) x;
$$;
revoke execute on function public.portal_unit_price(uuid, uuid, uuid, text, numeric, text) from public, anon, authenticated;

create or replace function public.cportal_price(p_kos uuid, p_contact uuid, p_product uuid, p_unit text, p_qty numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select portal_unit_price(p_kos, p_contact, p_product, p_unit, p_qty, 'grosir');
$$;
create or replace function public.portal_write_order(c contacts, p jsonb, pg public_pages default null, guest_hash text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; o so_orders; l record; pr products; u product_units; v_price numeric; v_total numeric := 0; v_seq int; v_no text;
        v_day date := (now() at time zone 'Asia/Jakarta')::date; v_kind text; v_need date; v_sort int := 0; v_n int;
begin
  begin v_id := (p->>'id')::uuid; exception when others then v_id := null; end;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'Permintaan tidak valid'); end if;
  perform pg_advisory_xact_lock(hashtext('so:' || c.kos_id::text));
  -- kiriman ulang (internet putus / ketuk dua kali) = pesanan yang sama
  select * into o from so_orders where id = v_id;
  if o.id is not null then
    if o.kos_id = c.kos_id and o.contact_id = c.id and o.source = 'portal' and o.portal_guest_hash is not distinct from guest_hash then return jsonb_build_object('ok', true, 'id', o.id, 'number', o.number, 'total', o.total, 'duplicate', true); end if;
    return jsonb_build_object('ok', false, 'error', 'Permintaan tidak valid');
  end if;
  -- batas wajar per pelanggan
  select count(*) into v_n from so_orders where contact_id = c.id and source = 'portal' and created_at > now() - interval '1 hour';
  if v_n >= 10 then return jsonb_build_object('ok', false, 'error', 'Terlalu banyak pesanan dalam satu jam. Coba lagi nanti atau hubungi penjual.'); end if;
  select count(*) into v_n from so_orders where contact_id = c.id and source = 'portal' and status = 'penawaran';
  if v_n >= 20 then return jsonb_build_object('ok', false, 'error', 'Masih ada 20 pesanan menunggu konfirmasi. Tunggu penjual mengonfirmasi dulu.'); end if;

  v_kind := case when p->>'kind' = 'penawaran' then 'penawaran' else 'pesanan' end;
  if jsonb_typeof(p->'lines') is distinct from 'array' then return jsonb_build_object('ok', false, 'error', 'Keranjang masih kosong'); end if;
  if jsonb_array_length(p->'lines') = 0 then return jsonb_build_object('ok', false, 'error', 'Keranjang masih kosong'); end if;
  if jsonb_array_length(p->'lines') > 100 then return jsonb_build_object('ok', false, 'error', 'Maksimal 100 barang per pesanan'); end if;
  if exists (select 1 from jsonb_array_elements(p->'lines') as item
    where not case when (item->>'qty') ~ '^\d{1,7}(\.\d{1,12})?$' then (item->>'qty')::numeric > 0 else false end) then
    return jsonb_build_object('ok', false, 'error', 'Jumlah barang tidak valid');
  end if;
  begin v_need := nullif(p->>'need_date', '')::date; exception when others then v_need := null; end;
  if v_need is not null and (v_need < v_day or v_need > v_day + 366) then return jsonb_build_object('ok', false, 'error', 'Tanggal dibutuhkan harus hari ini atau sesudahnya'); end if;

  select count(*) + 1 into v_seq from so_orders where kos_id = c.kos_id and order_date = v_day;
  v_no := 'SO-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  insert into so_orders(id, kos_id, number, contact_id, status, order_date, need_date, customer_ref, ship_address, terms_days, note,
                        created_by, branch_id, source, portal_kind, portal_guest_hash, portal_fulfillment, portal_payment)
  values (v_id, c.kos_id, v_no, c.id, 'penawaran', v_day, v_need,
          nullif(left(trim(coalesce(p->>'customer_ref', '')), 60), ''),
          coalesce(nullif(left(trim(coalesce(p->>'ship_address', '')), 300), ''), c.address), c.terms_days,
          nullif(left(trim(coalesce(p->>'note', '')), 500), ''), 'portal: ' || c.name, branch_main_id(c.kos_id), 'portal', v_kind, guest_hash, case when guest_hash is not null then p->>'fulfillment' end, case when guest_hash is not null then p->>'payment' end)
  returning * into o;

  -- barang & satuan yang sama digabung; harga selalu dihitung server
  for l in select x->>'product_id' pid, x->>'unit' unit, sum((x->>'qty')::numeric) qty, min(ord) ord
           from jsonb_array_elements(p->'lines') with ordinality t(x, ord) group by 1, 2 order by min(ord) loop
    select * into pr from products where id::text = l.pid and kos_id = c.kos_id and active
      and (guest_hash is null or pg.catalog_mode = 'semua' or (pg.catalog_mode = 'favorit' and favorite));
    if pr.id is null then raise exception 'PORTAL: Ada barang yang sudah tidak dijual. Muat ulang halaman.'; end if;
    select * into u from product_units where product_id = pr.id and kos_id = c.kos_id and name = l.unit;
    if u.id is null then raise exception 'PORTAL: Satuan % untuk % tidak ada. Muat ulang halaman.', l.unit, pr.name; end if;
    if l.qty is null or round(l.qty, 3) <= 0 or l.qty > 1000000 then raise exception 'PORTAL: Jumlah % tidak valid', pr.name; end if;
    if guest_hash is not null and v_kind = 'pesanan' and
      coalesce((select sum(sl.qty * sl.unit_qty) from so_lines sl where sl.order_id = o.id and sl.product_id = pr.id), 0)
        + l.qty * u.qty > portal_stock(pr, o.branch_id) then
      raise exception 'PORTAL: Stok % tidak cukup. Kurangi jumlah atau hubungi toko.', pr.name;
    end if;
    v_price := portal_unit_price(c.kos_id, case when guest_hash is null then c.id end, pr.id, u.name, l.qty,
      case when guest_hash is null then 'grosir' else 'ecer' end);
    if coalesce(v_price, 0) <= 0 then raise exception 'PORTAL: Harga % belum tersedia — tanyakan ke penjual.', pr.name; end if;
    v_sort := v_sort + 1;
    insert into so_lines(order_id, kos_id, product_id, name, unit, unit_qty, qty, price, line_total, sort)
    values (o.id, c.kos_id, pr.id, pr.name, u.name, u.qty, round(l.qty, 3), v_price, round(round(l.qty, 3) * v_price, 2), v_sort);
  end loop;
  select coalesce(sum(line_total), 0) into v_total from so_lines where order_id = o.id;
  update so_orders set total = v_total where id = o.id;
  return jsonb_build_object('ok', true, 'id', o.id, 'number', o.number, 'total', v_total, 'kos_id', c.kos_id, 'customer', c.name, 'kind', v_kind);
exception when raise_exception then
  if sqlerrm like 'PORTAL: %' then return jsonb_build_object('ok', false, 'error', substr(sqlerrm, 9)); end if;
  raise;
end $$;
revoke execute on function public.portal_write_order(contacts, jsonb, public_pages, text) from public, anon, authenticated;

create or replace function public.cportal_order(p_token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c contacts; blocked text;
begin
  c := cportal_contact(p_token);
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Link tidak berlaku. Minta link terbaru ke penjual.'); end if;
  blocked := cportal_block(c.kos_id);
  if blocked is not null then return jsonb_build_object('ok', false, 'error', blocked); end if;
  return portal_write_order(c, p);
end $$;

create function public.portal_public_page(p_slug text) returns public.public_pages
language sql stable security definer set search_path = public as $$
  select pg.* from public_pages pg join kos k on k.id = pg.kos_id
  where pg.slug = lower(p_slug) and pg.enabled and pg.show_prices and pg.catalog_mode <> 'tidak'
    and k.business_type = 'retail' and k.closed_at is null and k.suspended_at is null and k.setup_status = 'active'
    and module_on(k.id, 'u_halaman') and module_on(k.id, 'u_crm') and module_on(k.id, 'u_penawaran');
$$;
revoke execute on function public.portal_public_page(text) from public, anon, authenticated;

alter table public.products
  add column portal_description text check (length(portal_description) <= 2000),
  add column portal_composition text check (length(portal_composition) <= 1000);

create function public.product_save_for_portal(
  p_kos uuid, p_id uuid, p_name text, p_base text, p_cost numeric, p_min numeric, p_units jsonb,
  p_initial_stock numeric, p_sku text, p_density numeric, p_packaging_aliases text[],
  p_description text, p_composition text
) returns uuid language plpgsql security definer set search_path = public as $$
declare saved uuid;
begin
  saved := product_save_with_packaging(p_kos, p_id, p_name, p_base, p_cost, p_min, p_units,
    p_initial_stock, p_sku, p_density, p_packaging_aliases);
  update products set portal_description = nullif(trim(p_description), ''),
    portal_composition = nullif(trim(p_composition), '') where id = saved and kos_id = p_kos;
  return saved;
end $$;
revoke execute on function public.product_save_for_portal(uuid, uuid, text, text, numeric, numeric, jsonb, numeric, text, numeric, text[], text, text) from public, anon;
grant execute on function public.product_save_for_portal(uuid, uuid, text, text, numeric, numeric, jsonb, numeric, text, numeric, text[], text, text) to authenticated;

create table public.portal_product_ratings (
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  order_id uuid not null references public.so_orders(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  primary key (product_id, order_id)
);
alter table public.portal_product_ratings enable row level security;
revoke all on public.portal_product_ratings from public, anon, authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.portal_product_ratings
  for each row execute function public.kos_open_guard();

create function public.portal_shop_catalog(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pg public_pages; b uuid;
begin
  pg := portal_public_page(p_slug);
  if pg.kos_id is null then return null; end if;
  b := branch_main_id(pg.kos_id);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pr.id, 'name', pr.name, 'sku', pr.sku, 'packaging', pr.variant_label, 'base_unit', pr.base_unit, 'category', pc.name, 'brand', pb.name,
      'description', pr.portal_description, 'composition', pr.portal_composition,
      'rating', r.rating, 'rating_count', r.rating_count, 'units', j.units
    ) order by pr.created_at desc, pr.id)
    from products pr
    left join product_categories pc on pc.id = pr.category_id and pc.kos_id = pg.kos_id
    left join product_brands pb on pb.id = pr.brand_id and pb.kos_id = pg.kos_id
    cross join lateral (
      select round(avg(score), 1) rating, count(*) rating_count from portal_product_ratings
      where product_id = pr.id and kos_id = pg.kos_id
    ) r
    cross join lateral (select greatest(0, portal_stock(pr, b)) stock) s
    cross join lateral (
      select jsonb_agg(jsonb_build_object('name', u.name, 'qty', u.qty, 'price', q.price, 'available', s.stock >= u.qty, 'pricing', 'tiered',
        'breaks', coalesce((select jsonb_agg(jsonb_build_object('min_qty', pbk.min_qty, 'price', pbk.price)
          order by pbk.min_qty, pbk.price) from price_breaks pbk where pbk.product_id = pr.id
          and pbk.unit = u.name and pbk.tier in ('semua', 'ecer')), '[]'::jsonb)) order by u.sort, u.qty) units
      from product_units u
      cross join lateral (select portal_unit_price(pg.kos_id, null, pr.id, u.name, 0, 'ecer') price) q
      where u.product_id = pr.id and u.kos_id = pg.kos_id and q.price > 0
    ) j
    where pr.kos_id = pg.kos_id and pr.active and (pg.catalog_mode = 'semua' or pr.favorite) and j.units is not null
  ), '[]'::jsonb), 'pay', public_pay_info(p_slug));
end $$;
revoke execute on function public.portal_shop_catalog(text) from public;
grant execute on function public.portal_shop_catalog(text) to anon, authenticated, service_role;

create function public.portal_shop_orders(p_slug text, p_guest text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pg public_pages;
begin
  -- Riwayat tetap bisa dibaca saat toko mematikan harga atau checkout.
  if coalesce(p_guest, '') !~ '^[a-f0-9]{64}$' then return '[]'::jsonb; end if;
  select pp.* into pg from public_pages pp join kos k on k.id = pp.kos_id
  where pp.slug = lower(p_slug) and pp.enabled and k.business_type = 'retail'
    and k.closed_at is null and k.suspended_at is null and k.setup_status = 'active'
    and module_on(k.id, 'u_halaman') and module_on(k.id, 'u_crm');
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', o.id, 'number', o.number, 'status', o.status, 'created_at', o.created_at, 'confirmed_at', o.confirmed_at,
    'closed_at', o.closed_at, 'total', o.total, 'kind', o.portal_kind, 'payment', o.portal_payment,
    'fulfillment', o.portal_fulfillment,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('product_id', l.product_id, 'name', l.name,
      'unit', l.unit, 'qty', l.qty, 'total', l.line_total,
      'rateable', exists (
        select 1 from so_delivery_lines dl join so_deliveries d on d.id = dl.delivery_id and d.kos_id = dl.kos_id
        where dl.line_id = l.id and dl.kos_id = l.kos_id and d.order_id = o.id and d.status = 'diterima'
      ),
      'rating', (select r.score from portal_product_ratings r where r.order_id = o.id
        and r.product_id = l.product_id and r.kos_id = o.kos_id)) order by l.sort)
      from so_lines l where l.order_id = o.id and l.kos_id = o.kos_id), '[]'::jsonb),
    'deliveries', coalesce((select jsonb_agg(jsonb_build_object('status', d.status, 'created_at', d.created_at,
      'received_at', d.received_at) order by d.created_at)
      from so_deliveries d where d.order_id = o.id and d.kos_id = o.kos_id), '[]'::jsonb)
    ) order by o.created_at desc) from
    (select * from so_orders where kos_id = pg.kos_id and portal_guest_hash = p_guest
      order by created_at desc limit 30) o), '[]'::jsonb);
end $$;
revoke execute on function public.portal_shop_orders(text, text) from public, anon, authenticated;
grant execute on function public.portal_shop_orders(text, text) to service_role;

create function public.portal_shop_order(p_slug text, p_guest text, p_device text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pg public_pages; c contacts; existing so_orders; order_id uuid; res jsonb; pay jsonb;
  guest_name text := trim(coalesce(p->>'name', ''));
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9]', '', 'g');
  is_quote boolean := coalesce(p->>'kind' = 'penawaran', false);
  fulfillment text := p->>'fulfillment'; payment text := p->>'payment';
begin
  pg := portal_public_page(p_slug);
  if pg.kos_id is null or coalesce(p_guest, '') !~ '^[a-f0-9]{64}$' or p_device is null then
    return jsonb_build_object('ok', false, 'error', 'Toko ini sedang tidak menerima pesanan online.');
  end if;
  begin order_id := (p->>'id')::uuid; exception when invalid_text_representation then order_id := null; end;
  if order_id is null or jsonb_typeof(p->'lines') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'Permintaan tidak valid.');
  end if;
  perform pg_advisory_xact_lock(hashtext('so:' || pg.kos_id::text));
  select * into existing from so_orders where id = order_id;
  if found then
    if existing.kos_id = pg.kos_id and existing.portal_guest_hash = p_guest then
      return jsonb_build_object('ok', true, 'id', existing.id, 'number', existing.number, 'total', existing.total, 'duplicate', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'Permintaan tidak valid.');
  end if;
  if length(guest_name) not between 2 and 80 or length(v_phone) not between 9 and 15 or p->>'consent' is distinct from 'true' then
    return jsonb_build_object('ok', false, 'error', 'Isi nama, nomor WhatsApp dan persetujuan untuk memesan.');
  end if;
  if not is_quote then
    pay := public_pay_info(p_slug);
    if coalesce(fulfillment, '') not in ('ambil', 'antar') or
       (fulfillment = 'antar' and length(trim(coalesce(p->>'ship_address', ''))) < 5) then
      return jsonb_build_object('ok', false, 'error', 'Pilih cara menerima pesanan dan lengkapi alamat pengiriman.');
    end if;
    if coalesce(payment, '') not in ('tunai', 'transfer', 'qris') or
       (payment = 'transfer' and nullif(trim(pay->>'payment_info'), '') is null) or
       (payment = 'qris' and nullif(trim(pay->>'qris'), '') is null) then
      return jsonb_build_object('ok', false, 'error', 'Pilih cara bayar yang tersedia.');
    end if;
  end if;
  if (select count(*) from public_submissions where kos_id = pg.kos_id and ip_hash = p_device
      and created_at > now() - interval '1 hour' and outcome = 'ok') >= 10
    or (select count(*) from so_orders where kos_id = pg.kos_id and portal_guest_hash is not null
      and created_at > now() - interval '1 day') >= 100 then
    return jsonb_build_object('ok', false, 'error', 'Batas pemesanan tercapai. Coba lagi nanti atau hubungi toko.');
  end if;
  -- Kontak hanya dipakai ulang dari sesi tamu yang sama, tanpa menautkan kontak bertoken.
  select g.* into c from so_orders o join contacts g on g.id = o.contact_id and g.kos_id = o.kos_id
  where o.kos_id = pg.kos_id and o.portal_guest_hash = p_guest and g.archived_at is null
    and g.portal_token is null and g.name = guest_name and g.phone = v_phone and g.price_list_id is null
    and g.credit_limit is null and g.terms_days is null
  order by o.created_at desc limit 1;
  if c.id is null then
    insert into contacts(kos_id, kind, name, phone) values (pg.kos_id, 'pelanggan', guest_name, v_phone) returning * into c;
  end if;
  p := p || jsonb_build_object('note', case when not is_quote then
    concat('Portal publik · ', case fulfillment when 'ambil' then 'Ambil di toko' else 'Kirim ke alamat' end,
      ' · ', case payment when 'tunai' then 'Tunai saat menerima' when 'transfer' then 'Transfer bank' else 'QRIS' end,
      ' · Pembayaran belum diverifikasi.', case when nullif(trim(p->>'note'), '') is not null then E'\n' || trim(p->>'note') end)
    else p->>'note' end);
  res := portal_write_order(c, p, pg, p_guest);
  if not coalesce((res->>'ok')::boolean, false) then
    raise exception 'SHOP: %', res->>'error';
  end if;
  insert into public_submissions(kos_id, ip_hash, outcome) values (pg.kos_id, p_device, 'ok');
  return res;
exception when raise_exception then
  if sqlerrm like 'SHOP: %' then return jsonb_build_object('ok', false, 'error', substr(sqlerrm, 7)); end if;
  raise;
end $$;
revoke execute on function public.portal_shop_order(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.portal_shop_order(text, text, text, jsonb) to service_role;

-- Satu penilaian anonim per produk yang benar-benar diterima pada pesanan tamu.
create function public.portal_shop_rate(p_slug text, p_guest text, p_order uuid, p_product uuid, p_score int)
returns boolean language plpgsql security definer set search_path = public as $$
declare pg public_pages;
begin
  pg := portal_public_page(p_slug);
  if pg.kos_id is null or coalesce(p_guest, '') !~ '^[a-f0-9]{64}$' or coalesce(p_score, 0) not between 1 and 5 then
    return false;
  end if;
  insert into portal_product_ratings(kos_id, product_id, order_id, score)
  select o.kos_id, p_product, o.id, p_score
  from so_orders o
  where o.id = p_order and o.kos_id = pg.kos_id and o.portal_guest_hash = p_guest and o.status = 'selesai'
    and exists (select 1 from so_lines l join so_delivery_lines dl on dl.line_id = l.id and dl.kos_id = l.kos_id
      join so_deliveries d on d.id = dl.delivery_id and d.order_id = l.order_id and d.kos_id = l.kos_id
      where l.order_id = o.id and l.kos_id = o.kos_id and l.product_id = p_product and d.status = 'diterima')
    and not exists (select 1 from so_deliveries d where d.order_id = o.id and d.kos_id = o.kos_id and d.status = 'dikirim')
  on conflict (product_id, order_id) do update set score = excluded.score;
  return found;
end $$;
revoke execute on function public.portal_shop_rate(text, text, uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.portal_shop_rate(text, text, uuid, uuid, int) to service_role;
