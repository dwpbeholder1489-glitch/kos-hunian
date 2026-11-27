-- Pengajuan publik menggunakan baris penawaran/pesanan yang sama.
alter table public.so_orders
  add column quote_purpose text,
  add column quote_consent_at timestamptz,
  add column quote_manual text,
  add column quote_attachment text,
  add column quote_filename text,
  add column quote_message text,
  add column quote_counter text,
  add column quote_counter_at timestamptz,
  add column quote_revision uuid,
  add column quote_accepted_at timestamptz;

insert into storage.buckets(id, name, public, file_size_limit)
values ('portal-quote', 'portal-quote', false, 3000000)
on conflict (id) do nothing;

create function public.portal_quote_page(p_slug text) returns public.public_pages
language sql stable security definer set search_path = public as $$
  select pg.* from public_pages pg join kos k on k.id = pg.kos_id
  where pg.slug = lower(p_slug) and pg.enabled and k.business_type = 'retail'
    and k.closed_at is null and k.suspended_at is null and k.setup_status = 'active'
    and module_on(k.id, 'u_halaman') and module_on(k.id, 'u_crm') and module_on(k.id, 'u_penawaran');
$$;
revoke execute on function public.portal_quote_page(text) from public, anon, authenticated;

create function public.portal_quote_catalog(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'sku', pr.sku, 'package', pr.is_kit,
      'units', (select jsonb_agg(jsonb_build_object('name', u.name) order by u.sort, u.qty)
                from product_units u where u.kos_id = pr.kos_id and u.product_id = pr.id)) order by pr.name)
    from products pr
    where pr.kos_id = pg.kos_id and pr.active and (pg.catalog_mode = 'semua' or (pg.catalog_mode = 'favorit' and pr.favorite))
      and exists (select 1 from product_units u where u.kos_id = pr.kos_id and u.product_id = pr.id)
  ), '[]'::jsonb)
  from portal_quote_page(p_slug) pg
  where pg.kos_id is not null;
$$;
revoke execute on function public.portal_quote_catalog(text) from public;
grant execute on function public.portal_quote_catalog(text) to anon, authenticated, service_role;

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
  if jsonb_array_length(p->'lines') = 0 and (v_kind <> 'penawaran' or guest_hash is null or
     (nullif(trim(p->>'note'), '') is null and nullif(trim(p->>'manual'), '') is null and p->>'attachment' is null)) then return jsonb_build_object('ok', false, 'error', 'Keranjang masih kosong'); end if;
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
    if (v_kind = 'pesanan' or guest_hash is null) and coalesce(v_price, 0) <= 0 then raise exception 'PORTAL: Harga % belum tersedia — tanyakan ke penjual.', pr.name; end if;
    v_price := case when guest_hash is not null and v_kind = 'penawaran' and not pg.show_prices then 0 else coalesce(v_price, 0) end;
    v_sort := v_sort + 1;
    insert into so_lines(order_id, kos_id, product_id, name, unit, unit_qty, qty, price, line_total, sort)
    values (o.id, c.kos_id, pr.id, pr.name, u.name, u.qty, round(l.qty, 3), v_price, round(round(l.qty, 3) * v_price, 2), v_sort);
  end loop;
  select coalesce(sum(line_total), 0) into v_total from so_lines where order_id = o.id;
  update so_orders set total = v_total,
    quote_consent_at = case when v_kind = 'penawaran' and guest_hash is not null then now() end,
    quote_purpose = case when v_kind = 'penawaran' and guest_hash is not null then left(p->>'purpose', 40) end,
    quote_manual = case when v_kind = 'penawaran' and guest_hash is not null then nullif(left(trim(p->>'manual'), 2000), '') end,
    quote_attachment = case when v_kind = 'penawaran' and guest_hash is not null then p->>'attachment' end,
    quote_filename = case when v_kind = 'penawaran' and guest_hash is not null then left(p->>'filename', 160) end
  where id = o.id;
  return jsonb_build_object('ok', true, 'id', o.id, 'number', o.number, 'total', v_total, 'kos_id', c.kos_id, 'customer', c.name, 'kind', v_kind);
exception when raise_exception then
  if sqlerrm like 'PORTAL: %' then return jsonb_build_object('ok', false, 'error', substr(sqlerrm, 9)); end if;
  raise;
end $$;

create or replace function public.portal_shop_orders(p_slug text, p_guest text) returns jsonb
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
    'closed_at', o.closed_at, 'total', case when o.quote_consent_at is not null and o.quote_revision is null
        and o.status in ('penawaran', 'batal') then null else o.total end, 'kind', o.portal_kind, 'payment', o.portal_payment,
    'fulfillment', o.portal_fulfillment, 'quote_revision', o.quote_revision,
    'quote_message', case when o.quote_revision is not null then o.quote_message end,
    'quote_manual', o.quote_manual, 'quote_filename', o.quote_filename, 'quote_accepted_at', o.quote_accepted_at,
    'quote_counter', o.quote_counter, 'valid_until', o.valid_until,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('product_id', l.product_id, 'name', l.name,
      'unit', l.unit, 'qty', l.qty, 'total', case when o.quote_consent_at is not null and o.quote_revision is null
        and o.status in ('penawaran', 'batal') then null else l.line_total end,
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

create or replace function public.portal_shop_order(p_slug text, p_guest text, p_device text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pg public_pages; c contacts; existing so_orders; order_id uuid; res jsonb; pay jsonb;
  guest_name text := trim(coalesce(p->>'name', ''));
  v_phone text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9]', '', 'g');
  is_quote boolean := coalesce(p->>'kind' = 'penawaran', false);
  fulfillment text := p->>'fulfillment'; payment text := p->>'payment';
begin
  pg := case when is_quote then portal_quote_page(p_slug) else portal_public_page(p_slug) end;
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
  if p->>'attachment' is not null and (not is_quote or
    split_part(p->>'attachment', '/', 1) <> lower(p_slug) or
    split_part(p->>'attachment', '/', 2) <> p_guest or
    split_part(p->>'attachment', '/', 3) <> order_id::text or
    split_part(p->>'attachment', '/', 4) !~ '^[a-f0-9]{64}$' or
    array_length(string_to_array(p->>'attachment', '/'), 1) <> 4) then
    return jsonb_build_object('ok', false, 'error', 'Lampiran tidak valid.');
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

-- Perubahan penawaran membatalkan persetujuan atas versi yang sebelumnya dikirim.
create function public.portal_quote_invalidate() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.quote_consent_at is not null and new.status = 'dikonfirmasi'
     and not exists (select 1 from so_lines where order_id = new.id) then
    raise exception 'Tambahkan barang sebelum mengonfirmasi penawaran';
  end if;
  if old.status = 'penawaran' and new.status = 'penawaran' then new.quote_revision := null; end if;
  return new;
end $$;

create trigger portal_quote_invalidate before update of updated_at on public.so_orders
for each row when (old.status = 'penawaran' and (old.quote_revision is not null or new.status = 'dikonfirmasi'))
execute function public.portal_quote_invalidate();

create function public.portal_quote_publish(p_order uuid, p_message text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o so_orders; rev uuid := gen_random_uuid();
begin
  select * into o from so_orders where id = p_order for update;
  if o.id is null then raise exception 'Penawaran tidak ditemukan'; end if;
  perform so_guard(o.kos_id);
  if o.status <> 'penawaran' or o.portal_kind is distinct from 'penawaran' or o.portal_guest_hash is null then
    raise exception 'Penawaran ini tidak dapat dikirim';
  end if;
  if not exists (select 1 from so_lines where order_id = o.id) then
    raise exception 'Tambahkan barang dan harga sebelum mengirim penawaran';
  end if;
  if o.valid_until < (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Perbarui masa berlaku sebelum mengirim penawaran';
  end if;
  if exists (select 1 from contacts where id = o.contact_id and (credit_limit is not null or terms_days is not null))
     or o.terms_days is not null then
    raise exception 'Penawaran dengan kredit atau tempo harus dikonfirmasi oleh pemilik';
  end if;
  update so_orders set quote_revision = rev, quote_message = nullif(left(trim(p_message), 500), '') where id = o.id;
  return rev;
end $$;
revoke execute on function public.portal_quote_publish(uuid, text) from public, anon;
grant execute on function public.portal_quote_publish(uuid, text) to authenticated;

create function public.portal_quote_approve(p_slug text, p_guest text, p_order uuid, p_revision uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pg public_pages; o so_orders; c contacts;
begin
  pg := portal_quote_page(p_slug);
  select * into o from so_orders
  where id = p_order and kos_id = pg.kos_id and portal_guest_hash = p_guest and portal_kind = 'penawaran'
  for update;
  if o.id is null then return jsonb_build_object('ok', false, 'error', 'Penawaran tidak ditemukan.'); end if;
  if o.quote_accepted_at is not null and o.quote_revision = p_revision and o.status <> 'batal' then
    return jsonb_build_object('ok', true, 'number', o.number);
  end if;
  if o.status <> 'penawaran' or p_revision is null or o.quote_revision is distinct from p_revision then
    return jsonb_build_object('ok', false, 'error', 'Penawaran telah berubah. Tinjau versi terbaru.');
  end if;
  if o.valid_until < (now() at time zone 'Asia/Jakarta')::date then
    return jsonb_build_object('ok', false, 'error', 'Masa berlaku penawaran berakhir. Hubungi bisnis.');
  end if;
  select * into c from contacts where id = o.contact_id and kos_id = o.kos_id for update;
  if c.id is null or c.archived_at is not null or c.credit_limit is not null or c.terms_days is not null or o.terms_days is not null then
    return jsonb_build_object('ok', false, 'error', 'Bisnis perlu mengonfirmasi penawaran ini.');
  end if;
  update so_orders set status = 'dikonfirmasi', confirmed_at = now(), confirmed_by = 'portal: ' || c.name,
    quote_accepted_at = now(), updated_at = now()
  where id = o.id;
  return jsonb_build_object('ok', true, 'number', o.number);
end $$;
revoke execute on function public.portal_quote_approve(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.portal_quote_approve(text, text, uuid, uuid) to service_role;

-- Status permintaan yang perlu ditindaklanjuti tampil di notifikasi yang sama.
create or replace function public.retail_portal_inbox(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with access as (
    select id from kos where id = p_kos and business_type = 'retail' and member_in('sell', p_kos)
  ), inbox as (
    select o.id, o.number,
      case when o.status = 'dikonfirmasi' then 'penawaran_disetujui'
           when o.quote_counter_at is not null then 'penawaran_negosiasi'
           else o.portal_kind end as kind,
      o.total, c.name as customer, coalesce(o.quote_accepted_at, o.quote_counter_at, o.created_at) as created_at, 'order'::text as target
    from access a join so_orders o on o.kos_id = a.id
    left join contacts c on c.id = o.contact_id and c.kos_id = a.id
    where o.source = 'portal' and ((o.status = 'penawaran' and o.quote_revision is null)
      or (o.status = 'dikonfirmasi' and o.quote_accepted_at is not null))
    union all
    select l.id, l.number, 'permintaan', l.est_value, l.name, l.created_at, 'lead'
    from access a join crm_leads l on l.kos_id = a.id
    where l.source = 'halaman' and l.stage not in ('jadi', 'batal') and l.ref_id is null
  )
  select coalesce(jsonb_agg(to_jsonb(inbox) order by created_at desc, id), '[]'::jsonb) from inbox;
$$;

create function public.portal_quote_counter(p_slug text, p_guest text, p_order uuid, p_revision uuid, p_message text) returns boolean
language plpgsql security definer set search_path = public as $$
declare pg public_pages; found_id uuid;
begin
  if coalesce(length(trim(p_message)), 0) not between 3 and 500 or p_revision is null then return false; end if;
  pg := portal_quote_page(p_slug);
  update so_orders set quote_revision = null, quote_counter = trim(p_message), quote_counter_at = now()
  where id = p_order and kos_id = pg.kos_id and portal_guest_hash = p_guest and portal_kind = 'penawaran'
    and status = 'penawaran' and quote_revision = p_revision
  returning id into found_id;
  return found_id is not null;
end $$;
revoke execute on function public.portal_quote_counter(text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.portal_quote_counter(text, text, uuid, uuid, text) to service_role;

create index so_orders_quote_attachment_idx on public.so_orders(quote_attachment) where quote_attachment is not null;

create function public.portal_quote_prepare_upload(p_slug text, p_guest text, p_device text, p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pg public_pages; o so_orders;
begin
  pg := portal_quote_page(p_slug);
  if pg.kos_id is null then return jsonb_build_object('allowed', false); end if;
  perform pg_advisory_xact_lock(hashtext('quote-upload:' || pg.kos_id::text));
  select * into o from so_orders where id = p_order and kos_id = pg.kos_id and portal_guest_hash = p_guest;
  if o.id is not null then return jsonb_build_object('allowed', true, 'id', o.id, 'number', o.number); end if;
  if (select count(*) from public_submissions
      where kos_id = pg.kos_id and outcome = 'quote_upload' and ip_hash = p_device
        and created_at > now() - interval '1 hour') >= 15
     or (select count(*) from public_submissions
      where kos_id = pg.kos_id and outcome = 'quote_upload' and created_at > now() - interval '1 day') >= 150 then
    return jsonb_build_object('allowed', false);
  end if;
  insert into public_submissions(kos_id, ip_hash, outcome) values (pg.kos_id, p_device, 'quote_upload');
  return jsonb_build_object('allowed', true);
end $$;
revoke execute on function public.portal_quote_prepare_upload(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.portal_quote_prepare_upload(text, text, text, uuid) to service_role;

create function public.portal_quote_orphan_paths() returns setof text
language plpgsql security definer set search_path = public as $$
begin
  delete from public_submissions where outcome = 'quote_upload' and created_at < now() - interval '1 day';
  return query select f.name from storage.objects f
  where f.bucket_id = 'portal-quote' and f.created_at < now() - interval '1 day'
    and not exists (select 1 from so_orders o where o.quote_attachment = f.name)
  order by f.created_at limit 500;
end $$;
revoke execute on function public.portal_quote_orphan_paths() from public, anon, authenticated;
grant execute on function public.portal_quote_orphan_paths() to service_role;
