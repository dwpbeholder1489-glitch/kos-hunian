-- Tahap 3 Retail · Katalog lanjutan (1): merek barang, banyak barcode per satuan, harga & MOQ per supplier.
-- Mesin lama tidak berubah: barcode utama tetap di product_units.barcode; tambahan disimpan per (barang, nama satuan)
-- karena product_save membuat ulang baris satuan setiap kali barang disimpan.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in v_def) = 0 then raise exception 'Patch % tidak menemukan teks: %', p_sig, left(p_old, 80); end if;
  execute replace(v_def, p_old, p_new);
end $$;

-- =====================================================================
-- 1. MEREK
-- =====================================================================
create table if not exists public.product_brands (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index if not exists product_brands_name on public.product_brands(kos_id, lower(name));
alter table public.product_brands enable row level security;
drop policy if exists product_brands_select on public.product_brands;
create policy product_brands_select on public.product_brands for select using (is_member(kos_id));
drop trigger if exists zz_kos_open_guard on public.product_brands;
create trigger zz_kos_open_guard before insert or update or delete on public.product_brands for each row execute function public.kos_open_guard();

alter table public.products add column if not exists brand_id uuid references public.product_brands(id) on delete set null;
create index if not exists products_brand on public.products(brand_id) where brand_id is not null;

create or replace function public.brand_save(p_kos uuid, p_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke barang bisnis ini'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Isi nama merek'; end if;
  if exists (select 1 from product_brands where kos_id = p_kos and lower(name) = lower(trim(p_name)) and id is distinct from p_id) then
    raise exception 'Merek "%" sudah ada', trim(p_name);
  end if;
  if p_id is null then
    insert into product_brands(kos_id, name) values (p_kos, trim(p_name)) returning id into v_id;
  else
    update product_brands set name = trim(p_name) where id = p_id and kos_id = p_kos returning id into v_id;
    if v_id is null then raise exception 'Merek tidak ditemukan'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.brand_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b product_brands;
begin
  select * into b from product_brands where id = p_id;
  if b.id is null or not member_in('stock', b.kos_id) then raise exception 'Merek tidak ditemukan'; end if;
  delete from product_brands where id = p_id;   -- barangnya menjadi tanpa merek (on delete set null)
end $$;

create or replace function public.product_set_brand(p_products uuid[], p_brand uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_kos uuid; v_n int;
begin
  select kos_id into v_kos from products where id = p_products[1];
  if v_kos is null or not member_in('stock', v_kos) then raise exception 'Barang tidak ditemukan'; end if;
  if exists (select 1 from products where id = any(p_products) and kos_id <> v_kos) then raise exception 'Barang tidak valid'; end if;
  if p_brand is not null and not exists (select 1 from product_brands where id = p_brand and kos_id = v_kos) then raise exception 'Merek tidak ditemukan'; end if;
  update products set brand_id = p_brand where id = any(p_products);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Laporan per merek: rumus sama dengan retail_kpi (omzet = baris × total/subtotal − PPN, dikurangi retur; laba = omzet − modal)
create or replace function public.brand_report(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Periode tidak valid'; end if;
  return (with s as (select * from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to),
    rt as (select * from sale_returns where kos_id = p_kos and return_date between p_from and p_to),
    ln as (
      select l.product_id, l.qty * l.unit_qty as qty, l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount as omzet, l.qty * l.unit_qty * l.cost as hpp
      from sale_lines l join s on s.id = l.sale_id
      union all select x.product_id, -x.qty * x.unit_qty, -x.amount, -x.qty * x.unit_qty * x.cost from sale_return_lines x join rt on rt.id = x.return_id)
    select coalesce(jsonb_agg(c order by c.omzet desc), '[]'::jsonb) from (
      select pb.id, coalesce(pb.name, 'Tanpa merek') as name, count(distinct ln.product_id) as barang,
             round(sum(ln.omzet), 2) as omzet, round(sum(ln.omzet) - sum(ln.hpp), 2) as laba,
             case when sum(ln.omzet) > 0 then round((sum(ln.omzet) - sum(ln.hpp)) * 100 / sum(ln.omzet), 1) end as margin_pct
      from ln join products p on p.id = ln.product_id left join product_brands pb on pb.id = p.brand_id
      group by pb.id, pb.name having sum(ln.omzet) <> 0 or sum(ln.hpp) <> 0) c);
end $$;

-- =====================================================================
-- 2. BANYAK BARCODE PER SATUAN
-- =====================================================================
create table if not exists public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  unit text not null,
  code text not null check (length(trim(code)) between 3 and 40),
  created_at timestamptz not null default now()
);
create unique index if not exists product_barcodes_code on public.product_barcodes(kos_id, lower(code));
create index if not exists product_barcodes_product on public.product_barcodes(product_id);
alter table public.product_barcodes enable row level security;
drop policy if exists product_barcodes_select on public.product_barcodes;
create policy product_barcodes_select on public.product_barcodes for select using (is_member(kos_id));
drop trigger if exists zz_kos_open_guard on public.product_barcodes;
create trigger zz_kos_open_guard before insert or update or delete on public.product_barcodes for each row execute function public.kos_open_guard();

-- Satu kode hanya untuk satu barang/satuan: barcode utama (product_units) dan barcode tambahan saling dicek
create or replace function public.barcode_owner(p_kos uuid, p_code text, p_product uuid default null, p_unit text default null)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.name || ' (' || pu.name || ')' from product_units pu join products p on p.id = pu.product_id
      where pu.kos_id = p_kos and lower(pu.barcode) = lower(trim(p_code)) and not (pu.product_id = p_product and pu.name = p_unit) limit 1),
    (select p.name || ' (' || pb.unit || ')' from product_barcodes pb join products p on p.id = pb.product_id
      where pb.kos_id = p_kos and lower(pb.code) = lower(trim(p_code)) and not (pb.product_id = p_product and pb.unit = p_unit) limit 1));
$$;

-- Ganti seluruh barcode tambahan satu satuan (barcode utama tetap di form barang)
create or replace function public.unit_barcodes_set(p_product uuid, p_unit text, p_codes text[])
returns int language plpgsql security definer set search_path = public as $$
declare p products; c text; v_other text; v_n int := 0; v_main text;
begin
  select * into p from products where id = p_product;
  if p.id is null or not member_in('stock', p.kos_id) then raise exception 'Barang tidak ditemukan'; end if;
  select barcode into v_main from product_units where product_id = p.id and name = p_unit;
  if not found then raise exception 'Satuan "%" tidak ada', p_unit; end if;
  if coalesce(array_length(p_codes, 1), 0) > 20 then raise exception 'Maksimal 20 barcode tambahan per satuan'; end if;
  delete from product_barcodes where product_id = p.id and unit = p_unit;
  foreach c in array coalesce(p_codes, '{}'::text[]) loop
    c := trim(c);
    continue when c = '' or lower(c) = lower(coalesce(v_main, ''));
    if length(c) < 3 or length(c) > 40 then raise exception 'Barcode "%" harus 3–40 karakter', c; end if;
    if exists (select 1 from product_barcodes where product_id = p.id and unit = p_unit and lower(code) = lower(c)) then continue; end if;
    v_other := barcode_owner(p.kos_id, c, p.id, p_unit);
    if v_other is not null then raise exception 'Barcode % sudah dipakai %', c, v_other; end if;
    insert into product_barcodes(kos_id, product_id, unit, code) values (p.kos_id, p.id, p_unit, c);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- product_save: barcode utama tidak boleh sama dengan barcode tambahan barang lain; barcode tambahan satuan yang dihapus ikut dibersihkan
select public._prasara_patch('public.product_save(uuid,uuid,text,text,numeric,numeric,jsonb,numeric,text,numeric)',
  $x$      if v_other is not null then raise exception 'Barcode % sudah dipakai %', v_code, v_other; end if;$x$,
  $x$      if v_other is not null then raise exception 'Barcode % sudah dipakai %', v_code, v_other; end if;
      select p.name into v_other from product_barcodes pb join products p on p.id = pb.product_id
        where pb.kos_id = p_kos and lower(pb.code) = lower(v_code) and not (pb.product_id = v_id and pb.unit = r->>'name');
      if v_other is not null then raise exception 'Barcode % sudah dipakai % (barcode tambahan)', v_code, v_other; end if;
      delete from product_barcodes where product_id = v_id and unit = r->>'name' and lower(code) = lower(v_code);$x$);
select public._prasara_patch('public.product_save(uuid,uuid,text,text,numeric,numeric,jsonb,numeric,text,numeric)',
  $x$  if p_id is null and coalesce(p_initial_stock, 0) > 0 then$x$,
  $x$  delete from product_barcodes pb where pb.product_id = v_id and not exists (select 1 from product_units u where u.product_id = v_id and u.name = pb.unit);
  if p_id is null and coalesce(p_initial_stock, 0) > 0 then$x$);

-- Cari barang dari kode apa pun (barcode utama, barcode tambahan, kode barang)
create or replace function public.barcode_find(p_kos uuid, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  return coalesce(
    (select jsonb_build_object('product_id', pu.product_id, 'unit', pu.name, 'via', 'utama') from product_units pu where pu.kos_id = p_kos and lower(pu.barcode) = lower(trim(p_code)) limit 1),
    (select jsonb_build_object('product_id', pb.product_id, 'unit', pb.unit, 'via', 'tambahan') from product_barcodes pb where pb.kos_id = p_kos and lower(pb.code) = lower(trim(p_code))
       and exists (select 1 from product_units u where u.product_id = pb.product_id and u.name = pb.unit) limit 1),
    (select jsonb_build_object('product_id', p.id, 'unit', (select name from product_units where product_id = p.id order by sort limit 1), 'via', 'kode') from products p where p.kos_id = p_kos and lower(p.sku) = lower(trim(p_code)) limit 1));
end $$;

-- Kasir: satuan membawa barcode tambahannya ('codes'); barang membawa nama merek untuk pencarian
select public._prasara_patch('public.kasir_catalog(uuid)',
  $x$'units', (select coalesce(jsonb_agg(to_jsonb(u) || coalesce($x$,
  $x$'units', (select coalesce(jsonb_agg(to_jsonb(u) || jsonb_build_object('codes', (select coalesce(jsonb_agg(pb.code), '[]'::jsonb) from product_barcodes pb where pb.product_id = u.product_id and pb.unit = u.name)) || coalesce($x$);
select public._prasara_patch('public.kasir_catalog(uuid)',
  $x$'products', (select coalesce(jsonb_agg((to_jsonb(p) - 'cost') || $x$,
  $x$'products', (select coalesce(jsonb_agg((to_jsonb(p) - 'cost') || jsonb_build_object('brand', (select b.name from product_brands b where b.id = p.brand_id)) || $x$);

-- =====================================================================
-- 3. HARGA & MOQ PER SUPPLIER
-- =====================================================================
create table if not exists public.supplier_items (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  unit text not null,
  price numeric(14,2) check (price is null or price >= 0),
  moq numeric(14,3) check (moq is null or moq > 0),            -- minimal pesan, dalam satuan beli ini
  lead_days int check (lead_days is null or lead_days between 0 and 180),
  supplier_code text check (supplier_code is null or length(supplier_code) <= 40),
  preferred boolean not null default false,
  note text check (note is null or length(note) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  unique (contact_id, product_id, unit)
);
create index if not exists supplier_items_product on public.supplier_items(product_id);
create unique index if not exists supplier_items_preferred on public.supplier_items(product_id) where preferred;
alter table public.supplier_items enable row level security;
drop policy if exists supplier_items_select on public.supplier_items;
create policy supplier_items_select on public.supplier_items for select using (member_can(kos_id, 'stock,finance'));
drop trigger if exists zz_kos_open_guard on public.supplier_items;
create trigger zz_kos_open_guard before insert or update or delete on public.supplier_items for each row execute function public.kos_open_guard();

create or replace function public.supplier_item_save(p_kos uuid, p_contact uuid, p_product uuid, p_unit text, p_price numeric, p_moq numeric,
  p_lead int default null, p_code text default null, p_preferred boolean default false, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; p products;
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke belanja bisnis ini'; end if;
  if not exists (select 1 from contacts where id = p_contact and kos_id = p_kos and kind = 'supplier') then raise exception 'Supplier tidak ditemukan'; end if;
  select * into p from products where id = p_product and kos_id = p_kos;
  if p.id is null then raise exception 'Barang tidak ditemukan'; end if;
  if not exists (select 1 from product_units where product_id = p.id and name = p_unit) then raise exception 'Satuan "%" untuk % tidak ada', p_unit, p.name; end if;
  if p_moq is not null and p_moq <> round(p_moq, 3) then raise exception 'Minimal pesan maksimal 3 angka di belakang koma'; end if;
  if coalesce(p_preferred, false) then update supplier_items set preferred = false where product_id = p.id and preferred and not (contact_id = p_contact and unit = p_unit); end if;
  insert into supplier_items(kos_id, contact_id, product_id, unit, price, moq, lead_days, supplier_code, preferred, note)
  values (p_kos, p_contact, p.id, p_unit, p_price, p_moq, p_lead, nullif(trim(coalesce(p_code, '')), ''), coalesce(p_preferred, false), nullif(trim(coalesce(p_note, '')), ''))
  on conflict (contact_id, product_id, unit) do update set price = excluded.price, moq = excluded.moq, lead_days = excluded.lead_days, supplier_code = excluded.supplier_code,
    preferred = excluded.preferred, note = excluded.note, updated_at = now(), updated_by = auth.uid()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.supplier_item_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_kos uuid;
begin
  select kos_id into v_kos from supplier_items where id = p_id;
  if v_kos is null or not member_in('stock', v_kos) then raise exception 'Data tidak ditemukan'; end if;
  delete from supplier_items where id = p_id;
end $$;

-- Daftar harga supplier + harga beli terakhir dari Belanja (dipakai untuk perbandingan per barang dan katalog per supplier).
-- Baris tanpa supplier_items tetap muncul bila pernah dibeli dari supplier itu (source = 'riwayat').
create or replace function public.supplier_items_for(p_kos uuid, p_contact uuid default null, p_product uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke belanja bisnis ini'; end if;
  return (with lastbuy as (
      select distinct on (b.contact_id, l.product_id, l.unit) b.contact_id, l.product_id, l.unit, l.price, b.purchase_date, b.number
      from purchase_lines l join purchases b on b.id = l.purchase_id
      where b.kos_id = p_kos and b.contact_id is not null and b.status in ('selesai', 'sebagian') and l.qty_received > 0
        and (p_contact is null or b.contact_id = p_contact) and (p_product is null or l.product_id = p_product)
      order by b.contact_id, l.product_id, l.unit, b.purchase_date desc, b.created_at desc),
    keys as (
      select contact_id, product_id, unit from supplier_items where kos_id = p_kos and (p_contact is null or contact_id = p_contact) and (p_product is null or product_id = p_product)
      union select contact_id, product_id, unit from lastbuy)
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', si.id, 'contact_id', k.contact_id, 'supplier', c.name, 'product_id', k.product_id, 'product', p.name, 'base_unit', p.base_unit,
        'unit', k.unit, 'unit_qty', (select qty from product_units where product_id = k.product_id and name = k.unit),
        'price', si.price, 'moq', si.moq, 'lead_days', si.lead_days, 'supplier_code', si.supplier_code, 'preferred', coalesce(si.preferred, false), 'note', si.note,
        'last_price', lb.price, 'last_date', lb.purchase_date, 'last_number', lb.number,
        'unit_cost', round(coalesce(si.price, lb.price) / nullif((select qty from product_units where product_id = k.product_id and name = k.unit), 0), 2),
        'source', case when si.id is null then 'riwayat' else 'daftar' end)
      order by p.name, coalesce(si.preferred, false) desc,
        coalesce(si.price, lb.price) / nullif((select qty from product_units where product_id = k.product_id and name = k.unit), 0) nulls last, c.name), '[]'::jsonb)
    from keys k join contacts c on c.id = k.contact_id join products p on p.id = k.product_id
    left join supplier_items si on si.contact_id = k.contact_id and si.product_id = k.product_id and si.unit = k.unit
    left join lastbuy lb on lb.contact_id = k.contact_id and lb.product_id = k.product_id and lb.unit = k.unit
    where p.kos_id = p_kos);
end $$;

-- Saran belanja: supplier utama (preferred) dipakai lebih dulu — satuan, harga, waktu tunggu, dan jumlah dibulatkan ke minimal pesan (MOQ)
create or replace function public.reorder_suggest(p_kos uuid, p_cover integer default 14, p_lookback integer default 30, p_safety integer default 2)
returns jsonb language plpgsql stable security definer set search_path = public as $function$
declare v_res jsonb;
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  with usage as (
    select m.product_id, -sum(m.delta) filter (where m.kind in ('jual', 'pakai', 'retur_jual')) out_qty
    from stock_moves m where m.kos_id = p_kos and m.created_at >= now() - make_interval(days => greatest(p_lookback, 7)) group by 1
  ), onorder as (
    select l.product_id, sum(greatest(l.qty - l.qty_received, 0) * l.unit_qty) qty
    from purchase_lines l join purchases b on b.id = l.purchase_id where b.kos_id = p_kos and b.status in ('dipesan', 'sebagian') group by 1
  ), lastbuy as (
    select distinct on (l.product_id) l.product_id, b.contact_id, l.unit, l.unit_qty, l.price, b.purchase_date
    from purchase_lines l join purchases b on b.id = l.purchase_id where b.kos_id = p_kos and b.status in ('selesai', 'sebagian') and l.qty_received > 0
    order by l.product_id, b.purchase_date desc, b.created_at desc
  ), pref as (
    select si.product_id, si.contact_id, si.unit, u.qty unit_qty, coalesce(si.price, (select l2.price from purchase_lines l2 join purchases b2 on b2.id = l2.purchase_id
             where b2.contact_id = si.contact_id and l2.product_id = si.product_id and l2.unit = si.unit and l2.qty_received > 0 order by b2.purchase_date desc, b2.created_at desc limit 1)) price,
           si.moq, si.lead_days
    from supplier_items si join product_units u on u.product_id = si.product_id and u.name = si.unit
    where si.kos_id = p_kos and si.preferred
  ), calc as (
    select p.id, p.name, p.base_unit, p.stock, p.min_stock, p.max_stock, stock_reserved_at(p.id) + stock_held_at(p.id) reserved,
      coalesce(pf.lead_days, p.lead_days, 3) lead, p.cost,
      round(coalesce(u.out_qty, 0) / greatest(p_lookback, 7), 3) per_day, coalesce(o.qty, 0) on_order,
      coalesce(pf.contact_id, lb.contact_id) contact_id,
      case when pf.product_id is not null then pf.unit else lb.unit end buy_unit,
      case when pf.product_id is not null then pf.unit_qty else lb.unit_qty end buy_qty,
      case when pf.product_id is not null then pf.price else lb.price end buy_price,
      pf.moq, pf.product_id is not null as preferred,
      (select name from product_units pu where pu.product_id = p.id order by pu.qty desc limit 1) big_unit,
      (select qty from product_units pu where pu.product_id = p.id order by pu.qty desc limit 1) big_qty
    from products p left join usage u on u.product_id = p.id left join onorder o on o.product_id = p.id left join lastbuy lb on lb.product_id = p.id
      left join pref pf on pf.product_id = p.id
    where p.kos_id = p_kos and p.active
  ), rec as (
    select c.*, greatest(c.min_stock, round(c.per_day * (c.lead + p_safety), 3)) rop,
      greatest(0, least(round(c.per_day * (c.lead + p_cover) + c.min_stock + c.reserved - c.stock - c.on_order, 3),
      case when c.max_stock is not null then round(c.max_stock + c.reserved - c.stock - c.on_order, 3) else 1e12 end)) need
    from calc c
  )
  select coalesce(jsonb_agg(jsonb_build_object('product_id', r.id, 'name', r.name, 'base_unit', r.base_unit, 'stock', r.stock, 'min_stock', r.min_stock,
      'per_day', r.per_day, 'days_left', case when r.per_day > 0 then floor(r.stock / r.per_day) end, 'lead_days', r.lead, 'on_order', r.on_order, 'reserved', r.reserved, 'max_stock', r.max_stock, 'reorder_point', r.rop,
      'need', r.need, 'unit', coalesce(r.buy_unit, r.big_unit, r.base_unit), 'unit_qty', coalesce(r.buy_qty, r.big_qty, 1),
      'suggest', greatest(ceil(r.need / coalesce(nullif(r.buy_qty, 0), nullif(r.big_qty, 0), 1)), coalesce(ceil(r.moq), 0)),
      'moq', r.moq, 'moq_applied', r.moq is not null and ceil(r.moq) > ceil(r.need / coalesce(nullif(r.buy_qty, 0), nullif(r.big_qty, 0), 1)),
      'price', coalesce(r.buy_price, round(r.cost * coalesce(r.buy_qty, r.big_qty, 1), 2)),
      'supplier_id', r.contact_id, 'supplier', (select name from contacts where id = r.contact_id), 'preferred', r.preferred,
      'reason', case when r.stock <= 0 then 'habis' when r.reserved > 0 and r.stock - r.reserved <= r.min_stock then 'sudah dipesan/ditahan ' || trim(to_char(r.reserved, 'FM999999990.###'), '.') || ' ' || r.base_unit when r.stock + r.on_order <= r.min_stock then 'di bawah stok minimum' else 'akan habis dalam ' || floor(r.stock / nullif(r.per_day, 0)) || ' hari' end)
    order by case when r.stock <= 0 then 0 else 1 end, r.stock / nullif(r.per_day, 0) nulls last, r.name), '[]')
  into v_res
  from rec r where r.need > 0 and r.stock - r.reserved + r.on_order <= r.rop and (r.per_day > 0 or r.min_stock > 0 or r.reserved > 0);
  return v_res;
end $function$;

drop function public._prasara_patch(text, text, text);
