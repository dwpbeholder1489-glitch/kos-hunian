-- Tahap 5 Retail — Portal pelanggan grosir (B2B) (Master Prompt Retail Bagian 15 "B2B Portal", Blueprint §9B, RET-004).
-- Bentuk: LINK PRIBADI per pelanggan (pola sama dengan portal penghuni /p/[token]) → /c/[token]. Tanpa akun/sandi pelanggan.
-- Pelanggan melihat: katalog dengan HARGA MILIKNYA (urutan resmi price_resolve + harga beli banyak), status tersedia (tanpa angka stok),
-- batas kredit & piutang, faktur & sisa tagihan, riwayat pesanan + surat jalan; bisa memesan / minta penawaran / pesan lagi / batal (selama belum dikonfirmasi).
-- Pesanan portal = so_orders status 'penawaran' (source 'portal') → pemilik mengonfirmasi lewat so_confirm (cek batas kredit & stok tetap di sana).
-- Mesin pesanan/surat jalan/faktur TIDAK diubah. Tidak ada tabel baru.
-- Akses: Paket Pro (fitur portal_bisnis, sama dengan portal lain V2) + modul u_penawaran aktif + bisnis aktif (tidak ditutup/ditangguhkan/draf).
-- Tulis dari pelanggan HANYA lewat server (/api/portal-b2b, service_role): cportal_order, cportal_cancel. Baca: cportal_get (anon).

alter table public.contacts add column if not exists portal_token text;
alter table public.contacts add column if not exists portal_at timestamptz;        -- link dibuat/diganti
alter table public.contacts add column if not exists portal_seen_at timestamptz;   -- terakhir dibuka pelanggan
create unique index if not exists contacts_portal_token on public.contacts(portal_token) where portal_token is not null;

alter table public.so_orders add column if not exists source text not null default 'staf';
alter table public.so_orders add column if not exists portal_kind text;
alter table public.so_orders add column if not exists reviewed_at timestamptz;     -- pesanan portal sudah dilihat penjual
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'so_orders_source_chk') then
    alter table public.so_orders add constraint so_orders_source_chk check (source in ('staf', 'portal'));
    alter table public.so_orders add constraint so_orders_portal_kind_chk check (portal_kind is null or portal_kind in ('pesanan', 'penawaran'));
  end if;
end $$;
-- pesanan lama tidak perlu ditinjau
update public.so_orders set reviewed_at = coalesce(reviewed_at, created_at) where source = 'staf' and reviewed_at is null;

-- 1. Umur piutang tanpa cek anggota (dipakai portal) — receivable_open tetap sama perilakunya --------------------------
create or replace function public.receivable_open_core(p_kos uuid, p_contact uuid default null)
returns table(contact_id uuid, sale_id uuid, number text, sale_date date, due_date date, amount numeric, open_amount numeric)
language sql stable security definer set search_path = public as $$
  with inv as (
    select s.contact_id, s.id, s.number, s.sale_date, coalesce(s.due_date, s.sale_date) due, s.amt_kasbon amt,
           sum(s.amt_kasbon) over (partition by s.contact_id order by s.sale_date, s.sold_at, s.id) cum
    from sales s where s.kos_id = p_kos and s.status = 'selesai' and s.amt_kasbon > 0 and (p_contact is null or s.contact_id = p_contact)
  ), paid as (
    select c.id contact_id,
      coalesce((select sum(amount) from debt_payments d where d.contact_id = c.id and d.kind = 'piutang' and d.status = 'selesai'), 0)
      + coalesce((select sum(total) from sale_returns r where r.contact_id = c.id and r.refund_method = 'kasbon'), 0) amt
    from contacts c where c.kos_id = p_kos and c.kind = 'pelanggan' and (p_contact is null or c.id = p_contact)
  )
  select inv.contact_id, inv.id, inv.number, inv.sale_date, inv.due, inv.amt,
         least(inv.amt, greatest(0, inv.cum - coalesce(paid.amt, 0)))
  from inv left join paid on paid.contact_id = inv.contact_id
  where inv.cum - coalesce(paid.amt, 0) > 0.009;
$$;
revoke execute on function public.receivable_open_core(uuid, uuid) from public, anon, authenticated;

create or replace function public.receivable_open(p_kos uuid, p_contact uuid default null)
returns table(contact_id uuid, sale_id uuid, number text, sale_date date, due_date date, amount numeric, open_amount numeric)
language sql stable security definer set search_path = public as $$
  select * from receivable_open_core(p_kos, p_contact) where member_in('sell,finance', p_kos);
$$;

-- 2. Pelanggan dari token (null = tidak sah / bisnis tidak melayani) -----------------------------------------------
create or replace function public.cportal_contact(p_token text)
returns public.contacts language plpgsql stable security definer set search_path = public as $$
declare c contacts; k kos;
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 80 then return null; end if;
  select * into c from contacts where portal_token = p_token and kind = 'pelanggan' and archived_at is null;
  if c.id is null then return null; end if;
  select * into k from kos where id = c.kos_id;
  if k.closed_at is not null or k.suspended_at is not null or coalesce(k.setup_status, 'active') <> 'active' or k.business_type <> 'retail' then return null; end if;
  return c;
end $$;
revoke execute on function public.cportal_contact(text) from public, anon, authenticated;

-- alasan portal tidak bisa dipakai (null = boleh)
create or replace function public.cportal_block(p_kos uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when not plan_has(p_kos, 'portal_bisnis') then 'Portal pelanggan sedang tidak aktif. Silakan hubungi penjual.'
              when not module_on(p_kos, 'u_penawaran') then 'Pemesanan lewat portal sedang dimatikan penjual. Silakan hubungi penjual.' end;
$$;
revoke execute on function public.cportal_block(uuid) from public, anon, authenticated;

-- 3. Penjual: buat / ganti / matikan link ----------------------------------------------------------------------
create or replace function public.cportal_link(p_contact uuid, p_reset boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c contacts; v_token text;
begin
  select * into c from contacts where id = p_contact;
  if c.id is null or c.kind <> 'pelanggan' or not member_in('sell,finance', c.kos_id) then raise exception 'Pelanggan tidak ditemukan'; end if;
  if c.archived_at is not null then raise exception 'Pelanggan ini diarsipkan'; end if;
  if c.portal_token is not null and not coalesce(p_reset, false) then
    return jsonb_build_object('token', c.portal_token, 'at', c.portal_at, 'seen', c.portal_seen_at);
  end if;
  if not plan_has(c.kos_id, 'portal_bisnis') then raise exception 'BATAS_PAKET: Portal pelanggan grosir tersedia di Paket Pro.'; end if;
  if not module_on(c.kos_id, 'u_penawaran') then raise exception 'Aktifkan modul Penawaran & pesanan pelanggan dulu (Pusat konfigurasi).'; end if;
  -- 64 karakter acak (gen_random_uuid = acak kriptografis, tanpa pgcrypto)
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update contacts set portal_token = v_token, portal_at = now() where id = c.id;
  perform dom_emit(c.kos_id, case when c.portal_token is null then 'CustomerPortalCreated' else 'CustomerPortalReset' end, 'contact', c.id,
    c.id::text || ':' || extract(epoch from clock_timestamp())::text, 'sell',
    case when c.portal_token is null then 'Link portal dibuat untuk ' else 'Link portal diganti untuk ' end || c.name, null, '{}'::jsonb);
  return jsonb_build_object('token', v_token, 'at', now(), 'seen', null, 'reset', c.portal_token is not null);
end $$;

create or replace function public.cportal_off(p_contact uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c contacts;
begin
  select * into c from contacts where id = p_contact;
  if c.id is null or c.kind <> 'pelanggan' or not member_in('sell,finance', c.kos_id) then raise exception 'Pelanggan tidak ditemukan'; end if;
  if c.portal_token is null then return; end if;
  update contacts set portal_token = null where id = c.id;
  perform dom_emit(c.kos_id, 'CustomerPortalDisabled', 'contact', c.id, c.id::text || ':off:' || extract(epoch from clock_timestamp())::text, 'sell',
    'Link portal dimatikan untuk ' || c.name, null, '{}'::jsonb);
end $$;

-- daftar pelanggan + status portal (tab Portal di Pesanan grosir)
create or replace function public.cportal_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('sell,finance', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  return jsonb_build_object('allowed', plan_has(p_kos, 'portal_bisnis'), 'module', module_on(p_kos, 'u_penawaran'),
    'customers', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'tipe', c.tipe,
        'token', c.portal_token, 'at', c.portal_at, 'seen', c.portal_seen_at,
        'orders', (select count(*) from so_orders o where o.contact_id = c.id and o.source = 'portal')) order by c.portal_token is null, c.name)
      from contacts c where c.kos_id = p_kos and c.kind = 'pelanggan' and c.archived_at is null), '[]'::jsonb));
end $$;

-- penjual menandai pesanan portal sudah dilihat (lonceng)
create or replace function public.so_mark_reviewed(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o so_orders;
begin
  select * into o from so_orders where id = p_order;
  if o.id is null or not member_in('sell,finance', o.kos_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.reviewed_at is null then update so_orders set reviewed_at = now() where id = o.id; end if;
end $$;

-- 4. Harga untuk pelanggan portal: urutan resmi (price_resolve tier grosir) lalu harga beli banyak (termurah) ------------
create or replace function public.cportal_price(p_kos uuid, p_contact uuid, p_product uuid, p_unit text, p_qty numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select case when x.base is null then null else least(x.base, coalesce(price_break(p_product, p_unit, 'grosir', coalesce(p_qty, 1)), x.base)) end
  from (select price_resolve(p_kos, p_contact, u.product_id, u.name, 'grosir', u.price_retail, u.price_wholesale) base
        from product_units u where u.product_id = p_product and u.name = p_unit and u.kos_id = p_kos) x;
$$;
revoke execute on function public.cportal_price(uuid, uuid, uuid, text, numeric) from public, anon, authenticated;

-- 5. Isi portal (anon) -------------------------------------------------------------------------------------------
create or replace function public.cportal_get(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c contacts; k kos; v_block text; v_b uuid; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_bal numeric; v_over numeric; v_open numeric;
begin
  c := cportal_contact(p_token);
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Link tidak berlaku. Minta link terbaru ke penjual.'); end if;
  select * into k from kos where id = c.kos_id;
  v_block := cportal_block(k.id);
  if v_block is not null then
    return jsonb_build_object('ok', false, 'error', v_block, 'business', jsonb_build_object('name', k.name, 'phone', k.contact_phone));
  end if;
  -- "terakhir dibuka" dicatat paling sering sekali per jam
  if c.portal_seen_at is null or c.portal_seen_at < now() - interval '1 hour' then
    update contacts set portal_seen_at = now() where id = c.id;
  end if;
  v_b := branch_main_id(k.id);
  v_bal := coalesce(contact_balance(c.id), 0);
  select coalesce(sum(open_amount) filter (where due_date < v_today), 0) into v_over from receivable_open_core(k.id, c.id);
  select coalesce(sum(l.price * (l.qty - l.qty_sent)), 0) into v_open
  from so_orders o join so_lines l on l.order_id = o.id where o.contact_id = c.id and o.status in ('dikonfirmasi', 'sebagian');

  return jsonb_build_object('ok', true,
    'business', jsonb_build_object('name', k.name, 'phone', k.contact_phone, 'address', k.address, 'logo', k.profile->>'logo_path',
      'payment_info', k.payment_info, 'qris', k.qris_image, 'methods', k.profile->'payment_methods', 'rules', k.profile->>'payment_rules',
      'tax', coalesce((k.profile->'tax'->>'aktif')::boolean, false)),
    'customer', jsonb_build_object('name', c.name, 'address', c.address, 'phone', c.phone, 'terms_days', c.terms_days, 'credit_limit', c.credit_limit,
      'balance', v_bal, 'overdue', v_over, 'open_orders', v_open,
      'available', case when c.credit_limit is not null then c.credit_limit - v_bal - v_open end,
      'price_list', (select pl.name from price_lists pl where pl.id = c.price_list_id and price_list_live(pl.id, k.id))),
    'catalog', coalesce((select jsonb_agg(z order by z.cat_sort nulls last, z.cat nulls last, z.name) from (
        select p.id, p.name, p.sku, p.base_unit, pc.name cat, pc.sort cat_sort, pb.name brand,
          (select m.thumb_path from media_links ml join media m on m.id = ml.media_id
            where ml.kos_id = k.id and ml.entity = 'product' and ml.entity_id = p.id and m.deleted_at is null order by ml.sort, ml.created_at limit 1) thumb,
          case when p.is_kit then kit_avail(p.id, v_b) > 0
               else coalesce((select l.qty from stock_levels l where l.product_id = p.id and l.branch_id = v_b), 0) - stock_held_at(p.id, v_b) - stock_reserved_at(p.id, v_b) > 0 end avail,
          u.units
        from products p
        left join product_categories pc on pc.id = p.category_id
        left join product_brands pb on pb.id = p.brand_id
        cross join lateral (
          select jsonb_agg(jsonb_build_object('name', uu.name, 'qty', uu.qty, 'price', uu.price,
                   'breaks', coalesce((select jsonb_agg(jsonb_build_object('min_qty', b.min_qty, 'price', b.price) order by b.min_qty)
                                       from price_breaks b where b.product_id = p.id and b.unit = uu.name and b.tier in ('semua', 'grosir') and b.price < uu.price), '[]'::jsonb))
                 order by uu.sort, uu.qty) units
          from (select u1.name, u1.qty, u1.sort, cportal_price(k.id, c.id, p.id, u1.name, 1) price from product_units u1 where u1.product_id = p.id) uu
          where uu.price > 0) u
        where p.kos_id = k.id and p.active and u.units is not null
        order by p.name limit 1500) z), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number, 'status', o.status, 'date', o.order_date, 'total', o.total,
        'source', o.source, 'kind', o.portal_kind, 'ref', o.customer_ref, 'need_date', o.need_date, 'valid_until', o.valid_until, 'note', o.note,
        'close_reason', o.close_reason, 'ship_address', o.ship_address,
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('product_id', l.product_id, 'name', l.name, 'unit', l.unit, 'qty', l.qty, 'sent', l.qty_sent,
                    'price', l.price, 'total', l.line_total) order by l.sort), '[]'::jsonb) from so_lines l where l.order_id = o.id),
        'deliveries', (select coalesce(jsonb_agg(jsonb_build_object('number', d.number, 'date', d.ship_date, 'status', d.status, 'recipient', d.recipient,
                    'invoice', s.number) order by d.created_at), '[]'::jsonb) from so_deliveries d left join sales s on s.id = d.sale_id where d.order_id = o.id))
        order by o.created_at desc)
      from (select * from so_orders where contact_id = c.id order by created_at desc limit 30) o), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'number', s.number, 'date', s.sale_date, 'due', coalesce(s.due_date, s.sale_date),
        'total', s.total, 'tax', s.tax_amount, 'credit', s.amt_kasbon, 'open', coalesce(r.open_amount, 0),
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'unit', l.unit, 'qty', l.qty, 'price', l.price, 'total', l.line_total)), '[]'::jsonb)
                  from sale_lines l where l.sale_id = s.id)) order by s.sale_date desc, s.sold_at desc)
      from (select * from sales where contact_id = c.id and kos_id = k.id and status = 'selesai' order by sale_date desc, sold_at desc limit 30) s
      left join receivable_open_core(k.id, c.id) r on r.sale_id = s.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('date', d.date, 'amount', d.amount) order by d.date desc)
      from (select * from debt_payments where contact_id = c.id and kind = 'piutang' and status = 'selesai' order by date desc limit 20) d), '[]'::jsonb));
end $$;
grant execute on function public.cportal_get(text) to anon, authenticated;

-- 6. Pesanan dari portal (HANYA server / service_role) -------------------------------------------------------------
-- p: {id (uuid dari HP; idempoten), kind 'pesanan'|'penawaran', lines:[{product_id, unit, qty}], need_date, customer_ref, ship_address, note}
create or replace function public.cportal_order(p_token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c contacts; v_block text; v_id uuid; o so_orders; l record; pr products; u product_units; v_price numeric; v_total numeric := 0; v_seq int; v_no text;
        v_day date := (now() at time zone 'Asia/Jakarta')::date; v_kind text; v_need date; v_sort int := 0; v_n int;
begin
  c := cportal_contact(p_token);
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Link tidak berlaku. Minta link terbaru ke penjual.'); end if;
  v_block := cportal_block(c.kos_id);
  if v_block is not null then return jsonb_build_object('ok', false, 'error', v_block); end if;
  begin v_id := (p->>'id')::uuid; exception when others then v_id := null; end;
  if v_id is null then return jsonb_build_object('ok', false, 'error', 'Permintaan tidak valid'); end if;
  -- kiriman ulang (internet putus / ketuk dua kali) = pesanan yang sama
  select * into o from so_orders where id = v_id;
  if o.id is not null then
    if o.contact_id = c.id and o.source = 'portal' then return jsonb_build_object('ok', true, 'id', o.id, 'number', o.number, 'total', o.total, 'duplicate', true); end if;
    return jsonb_build_object('ok', false, 'error', 'Permintaan tidak valid');
  end if;
  -- batas wajar per pelanggan
  select count(*) into v_n from so_orders where contact_id = c.id and source = 'portal' and created_at > now() - interval '1 hour';
  if v_n >= 10 then return jsonb_build_object('ok', false, 'error', 'Terlalu banyak pesanan dalam satu jam. Coba lagi nanti atau hubungi penjual.'); end if;
  select count(*) into v_n from so_orders where contact_id = c.id and source = 'portal' and status = 'penawaran';
  if v_n >= 20 then return jsonb_build_object('ok', false, 'error', 'Masih ada 20 pesanan menunggu konfirmasi. Tunggu penjual mengonfirmasi dulu.'); end if;

  v_kind := case when p->>'kind' = 'penawaran' then 'penawaran' else 'pesanan' end;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then return jsonb_build_object('ok', false, 'error', 'Keranjang masih kosong'); end if;
  if jsonb_array_length(p->'lines') > 100 then return jsonb_build_object('ok', false, 'error', 'Maksimal 100 barang per pesanan'); end if;
  begin v_need := nullif(p->>'need_date', '')::date; exception when others then v_need := null; end;
  if v_need is not null and (v_need < v_day or v_need > v_day + 366) then return jsonb_build_object('ok', false, 'error', 'Tanggal dibutuhkan harus hari ini atau sesudahnya'); end if;

  perform pg_advisory_xact_lock(hashtext('so:' || c.kos_id::text));
  select count(*) + 1 into v_seq from so_orders where kos_id = c.kos_id and order_date = v_day;
  v_no := 'SO-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  insert into so_orders(id, kos_id, number, contact_id, status, order_date, need_date, customer_ref, ship_address, terms_days, note,
                        created_by, branch_id, source, portal_kind)
  values (v_id, c.kos_id, v_no, c.id, 'penawaran', v_day, v_need,
          nullif(left(trim(coalesce(p->>'customer_ref', '')), 60), ''),
          coalesce(nullif(left(trim(coalesce(p->>'ship_address', '')), 300), ''), c.address), c.terms_days,
          nullif(left(trim(coalesce(p->>'note', '')), 500), ''), 'portal: ' || c.name, branch_main_id(c.kos_id), 'portal', v_kind)
  returning * into o;

  -- barang & satuan yang sama digabung; harga selalu dihitung server
  for l in select x->>'product_id' pid, x->>'unit' unit, sum(case when (x->>'qty') ~ '^\d+(\.\d+)?$' then (x->>'qty')::numeric end) qty, min(ord) ord
           from jsonb_array_elements(p->'lines') with ordinality t(x, ord) group by 1, 2 order by min(ord) loop
    select * into pr from products where id::text = l.pid and kos_id = c.kos_id and active;
    if pr.id is null then raise exception 'PORTAL: Ada barang yang sudah tidak dijual. Muat ulang halaman.'; end if;
    select * into u from product_units where product_id = pr.id and name = l.unit;
    if u.id is null then raise exception 'PORTAL: Satuan % untuk % tidak ada. Muat ulang halaman.', l.unit, pr.name; end if;
    if l.qty is null or l.qty <= 0 or l.qty > 1000000 then raise exception 'PORTAL: Jumlah % tidak valid', pr.name; end if;
    v_price := cportal_price(c.kos_id, c.id, pr.id, u.name, l.qty);
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
revoke execute on function public.cportal_order(text, jsonb) from public, anon, authenticated;
grant execute on function public.cportal_order(text, jsonb) to service_role;

-- pelanggan membatalkan pesanan portal yang BELUM dikonfirmasi penjual (HANYA server)
create or replace function public.cportal_cancel(p_token text, p_order uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c contacts; o so_orders;
begin
  c := cportal_contact(p_token);
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Link tidak berlaku.'); end if;
  select * into o from so_orders where id = p_order and contact_id = c.id for update;
  if o.id is null then return jsonb_build_object('ok', false, 'error', 'Pesanan tidak ditemukan'); end if;
  if o.status = 'batal' then return jsonb_build_object('ok', true, 'number', o.number); end if;
  if o.status <> 'penawaran' then return jsonb_build_object('ok', false, 'error', 'Pesanan sudah dikonfirmasi penjual. Hubungi penjual untuk membatalkan.'); end if;
  update so_orders set status = 'batal', closed_at = now(), updated_at = now(), reviewed_at = null,
    close_reason = left('Dibatalkan pelanggan lewat portal' || coalesce(': ' || nullif(trim(p_reason), ''), ''), 300)
  where id = o.id;
  return jsonb_build_object('ok', true, 'number', o.number, 'kos_id', c.kos_id);
end $$;
revoke execute on function public.cportal_cancel(text, uuid, text) from public, anon, authenticated;
grant execute on function public.cportal_cancel(text, uuid, text) to service_role;

-- 7. Lonceng/Pengingat toko: pesanan portal yang belum dilihat ----------------------------------------------------
create or replace function public.retail_alerts(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('stock,finance', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if not module_on(p_kos, 'r_pengingat') then raise exception 'Modul ini sedang nonaktif. Aktifkan di Pusat konfigurasi.'; end if;
  return retail_alerts_internal(p_kos, member_in('finance', p_kos))
    || case when member_in('finance', p_kos) then jsonb_build_object('offline', coalesce((
         select jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'at', o.used_at, 'total', o.total, 'n', jsonb_array_length(o.issues)) order by o.received_at desc)
         from (select * from pos_offline where kos_id = p_kos and status <> 'tersimpan' and reviewed_at is null order by received_at desc limit 20) o), '[]'::jsonb))
       else '{}'::jsonb end
    || case when member_in('sell,finance', p_kos) then jsonb_build_object('portal', coalesce((
         select jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number, 'status', o.status, 'kind', o.portal_kind, 'total', o.total,
                  'customer', (select name from contacts where id = o.contact_id), 'at', o.created_at) order by o.created_at desc)
         from (select * from so_orders where kos_id = p_kos and source = 'portal' and reviewed_at is null order by created_at desc limit 20) o), '[]'::jsonb))
       else '{}'::jsonb end;
end $$;
