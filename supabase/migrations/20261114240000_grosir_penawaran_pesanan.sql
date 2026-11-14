-- Grosir & B2B (Modul V2.0 Bab 18; Retail Wholesale Blueprint H/D; backlog P1):
-- Penawaran harga → Pesanan pelanggan (cek batas kredit) → Surat jalan (bisa bertahap) → Faktur → Pembayaran (piutang).
-- Pesanan, pengiriman, faktur, dan pembayaran adalah kejadian terpisah:
--   so_orders/so_lines      = penawaran & pesanan (tidak mengubah stok/uang)
--   so_deliveries (+lines)  = surat jalan; setiap surat jalan menerbitkan SATU faktur = baris `sales` (lewat sale_create:
--                             stok keluar, HPP, pendapatan, PPN, piutang/kasbon — satu sumber kebenaran yang sama dengan Kasir)
--   pembayaran piutang      = debt_payments yang sudah ada (Kas & kasbon)
-- Pelanggan: batas kredit, tempo (hari), daftar harga khusus, alamat kirim, NPWP (kolom baru di contacts).
-- Daftar harga: price_lists + price_list_items (harga per barang & satuan).
-- Umur piutang: receivable_aging (FIFO: pembayaran melunasi faktur terlama dulu).

-- ===== Pelanggan =====
alter table public.contacts add column if not exists credit_limit numeric(14,2) check (credit_limit is null or credit_limit >= 0);
alter table public.contacts add column if not exists terms_days int check (terms_days is null or terms_days between 0 and 365);
alter table public.contacts add column if not exists address text check (address is null or length(address) <= 300);
alter table public.contacts add column if not exists npwp text check (npwp is null or length(npwp) <= 30);

-- ===== Daftar harga =====
create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  note text check (note is null or length(note) <= 200),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists price_lists_kos on public.price_lists(kos_id);
create table if not exists public.price_list_items (
  list_id uuid not null references public.price_lists(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  unit text not null,
  price numeric(14,2) not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (list_id, product_id, unit)
);
alter table public.contacts add column if not exists price_list_id uuid references public.price_lists(id) on delete set null;

-- ===== Penawaran & pesanan =====
create table if not exists public.so_orders (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  contact_id uuid not null references public.contacts(id),
  status text not null default 'penawaran' check (status in ('penawaran', 'dikonfirmasi', 'sebagian', 'selesai', 'batal')),
  order_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  valid_until date,
  need_date date,
  customer_ref text check (customer_ref is null or length(customer_ref) <= 60),
  ship_address text check (ship_address is null or length(ship_address) <= 300),
  terms_days int check (terms_days is null or terms_days between 0 and 365),
  note text check (note is null or length(note) <= 500),
  total numeric(14,2) not null default 0,
  credit_check jsonb,
  confirmed_at timestamptz, confirmed_by text,
  closed_at timestamptz, close_reason text,
  branch_id uuid,
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (kos_id, number)
);
create index if not exists so_orders_kos on public.so_orders(kos_id, status, order_date desc);
create index if not exists so_orders_contact on public.so_orders(contact_id);
create table if not exists public.so_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.so_orders(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id),
  name text not null,
  unit text not null,
  unit_qty numeric(14,3) not null,
  qty numeric(14,3) not null check (qty > 0),
  price numeric(14,2) not null check (price >= 0),
  line_total numeric(14,2) not null,
  qty_sent numeric(14,3) not null default 0,
  sort int not null default 0
);
create index if not exists so_lines_order on public.so_lines(order_id);
create table if not exists public.so_deliveries (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  order_id uuid not null references public.so_orders(id) on delete cascade,
  number text not null,
  sale_id uuid references public.sales(id),
  ship_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  status text not null default 'dikirim' check (status in ('dikirim', 'diterima', 'gagal')),
  driver text check (driver is null or length(driver) <= 60),
  vehicle text check (vehicle is null or length(vehicle) <= 30),
  recipient text check (recipient is null or length(recipient) <= 80),
  received_at timestamptz,
  note text check (note is null or length(note) <= 300),
  created_by text, created_at timestamptz not null default now(),
  unique (kos_id, number)
);
create index if not exists so_deliveries_order on public.so_deliveries(order_id);
create table if not exists public.so_delivery_lines (
  delivery_id uuid not null references public.so_deliveries(id) on delete cascade,
  line_id uuid not null references public.so_lines(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  qty numeric(14,3) not null check (qty > 0),
  primary key (delivery_id, line_id)
);

-- RLS: baca untuk kasir & keuangan; tulis hanya lewat fungsi
alter table public.price_lists enable row level security;
alter table public.price_list_items enable row level security;
alter table public.so_orders enable row level security;
alter table public.so_lines enable row level security;
alter table public.so_deliveries enable row level security;
alter table public.so_delivery_lines enable row level security;
drop policy if exists price_lists_select on public.price_lists;
create policy price_lists_select on public.price_lists for select using (member_can(kos_id, 'sell,finance'));
drop policy if exists price_list_items_select on public.price_list_items;
create policy price_list_items_select on public.price_list_items for select using (member_can(kos_id, 'sell,finance'));
drop policy if exists so_orders_select on public.so_orders;
create policy so_orders_select on public.so_orders for select using (member_can(kos_id, 'sell,finance'));
drop policy if exists so_lines_select on public.so_lines;
create policy so_lines_select on public.so_lines for select using (member_can(kos_id, 'sell,finance'));
drop policy if exists so_deliveries_select on public.so_deliveries;
create policy so_deliveries_select on public.so_deliveries for select using (member_can(kos_id, 'sell,finance'));
drop policy if exists so_delivery_lines_select on public.so_delivery_lines;
create policy so_delivery_lines_select on public.so_delivery_lines for select using (member_can(kos_id, 'sell,finance'));
grant select on public.price_lists, public.price_list_items, public.so_orders, public.so_lines, public.so_deliveries, public.so_delivery_lines to authenticated;

-- bisnis ditutup / belum aktif: tolak tulis
do $$ declare t text; begin
  foreach t in array array['price_lists', 'price_list_items', 'so_orders', 'so_lines', 'so_deliveries', 'so_delivery_lines'] loop
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

-- ===== Pengecekan umum =====
create or replace function public.so_guard(p_kos uuid, p_area text default 'sell')
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in(p_area, p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if (select business_type from kos where id = p_kos) <> 'retail' then raise exception 'Penawaran & pesanan grosir hanya untuk bisnis Retail & Grosir'; end if;
  if not module_on(p_kos, 'u_penawaran') then raise exception 'Modul Penawaran & pesanan belum aktif (Konfigurasi › Modul)'; end if;
end $$;

-- Harga untuk pelanggan: daftar harga khusus → harga grosir (bila tier grosir & diisi) → harga eceran
create or replace function public.price_for(p_kos uuid, p_contact uuid, p_product uuid, p_unit text, p_tier text default 'grosir')
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when li.price is not null then jsonb_build_object('price', li.price, 'source', 'daftar', 'list', pl.name)
    when p_tier = 'grosir' and u.price_wholesale > 0 then jsonb_build_object('price', u.price_wholesale, 'source', 'grosir')
    else jsonb_build_object('price', u.price_retail, 'source', 'eceran') end
  from product_units u
  left join contacts c on c.id = p_contact and c.kos_id = p_kos
  left join price_lists pl on pl.id = c.price_list_id and pl.archived_at is null
  left join price_list_items li on li.list_id = pl.id and li.product_id = u.product_id and li.unit = u.name
  where u.product_id = p_product and u.name = p_unit and u.kos_id = p_kos and member_in('sell,finance', p_kos);
$$;

-- Daftar harga untuk banyak barang sekaligus (form pesanan & Kasir)
create or replace function public.price_list_for_contact(p_kos uuid, p_contact uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('list', pl.name, 'list_id', pl.id,
    'items', coalesce((select jsonb_agg(jsonb_build_object('product_id', li.product_id, 'unit', li.unit, 'price', li.price)) from price_list_items li where li.list_id = pl.id), '[]'))
  from contacts c join price_lists pl on pl.id = c.price_list_id and pl.archived_at is null
  where c.id = p_contact and c.kos_id = p_kos and member_in('sell,finance', p_kos);
$$;

-- Umur piutang (FIFO): faktur kasbon terlama dilunasi lebih dulu oleh pembayaran & retur kasbon
create or replace function public.receivable_open(p_kos uuid, p_contact uuid default null)
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
  where member_in('sell,finance', p_kos) and inv.cum - coalesce(paid.amt, 0) > 0.009;
$$;

-- Ringkasan kredit satu pelanggan (dipakai form pesanan, konfirmasi, Kontak)
create or replace function public.customer_credit(p_contact uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c contacts; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_bal numeric; v_over numeric; v_over_days int; v_open_orders numeric;
begin
  select * into c from contacts where id = p_contact;
  if c.id is null or not member_in('sell,finance', c.kos_id) then raise exception 'Pelanggan tidak ditemukan'; end if;
  v_bal := coalesce(contact_balance(c.id), 0);
  select coalesce(sum(open_amount) filter (where due_date < v_today), 0), max(v_today - due_date) filter (where due_date < v_today)
    into v_over, v_over_days from receivable_open(c.kos_id, c.id);
  select coalesce(sum(l.price * (l.qty - l.qty_sent)), 0) into v_open_orders
  from so_orders o join so_lines l on l.order_id = o.id where o.contact_id = c.id and o.status in ('dikonfirmasi', 'sebagian');
  return jsonb_build_object('balance', v_bal, 'overdue', v_over, 'overdue_days', coalesce(v_over_days, 0), 'open_orders', v_open_orders,
    'limit', c.credit_limit, 'available', case when c.credit_limit is not null then c.credit_limit - v_bal - v_open_orders end,
    'terms_days', c.terms_days, 'price_list_id', c.price_list_id, 'price_list', (select name from price_lists where id = c.price_list_id),
    'address', c.address, 'npwp', c.npwp);
end $$;

-- Syarat pelanggan (batas kredit, tempo, daftar harga, alamat, NPWP) — pemilik/keuangan
create or replace function public.customer_terms_set(p_contact uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c contacts; v_list uuid := nullif(p->>'price_list_id', '')::uuid; v_limit numeric := nullif(p->>'credit_limit', '')::numeric; v_terms int := nullif(p->>'terms_days', '')::int;
begin
  select * into c from contacts where id = p_contact for update;
  if c.id is null or not member_in('finance', c.kos_id) then raise exception 'Pelanggan tidak ditemukan'; end if;
  if c.kind <> 'pelanggan' then raise exception 'Syarat ini hanya untuk pelanggan'; end if;
  if v_limit is not null and v_limit < 0 then raise exception 'Batas kredit tidak valid'; end if;
  if v_terms is not null and (v_terms < 0 or v_terms > 365) then raise exception 'Tempo 0–365 hari'; end if;
  if v_list is not null and not exists (select 1 from price_lists where id = v_list and kos_id = c.kos_id and archived_at is null) then raise exception 'Daftar harga tidak ditemukan'; end if;
  update contacts set credit_limit = v_limit, terms_days = v_terms, price_list_id = v_list,
    address = nullif(trim(coalesce(p->>'address', '')), ''), npwp = nullif(trim(coalesce(p->>'npwp', '')), '') where id = c.id;
  perform config_log(c.kos_id, 'syarat_pelanggan', 'Syarat pelanggan ' || c.name, null,
    jsonb_build_object('batas_kredit', v_limit, 'tempo', v_terms, 'daftar_harga', v_list), null, 'rendah', actor_email());
  return customer_credit(c.id);
end $$;

create or replace function public.price_list_save(p_kos uuid, p_id uuid, p_name text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if coalesce(length(trim(p_name)), 0) < 1 then raise exception 'Isi nama daftar harga, mis. Harga reseller'; end if;
  insert into price_lists(id, kos_id, name, note) values (v_id, p_kos, trim(p_name), nullif(trim(coalesce(p_note, '')), ''))
  on conflict (id) do update set name = excluded.name, note = excluded.note, updated_at = now(), archived_at = null
  where price_lists.kos_id = p_kos;
  return v_id;
end $$;

create or replace function public.price_list_archive(p_list uuid)
returns void language plpgsql security definer set search_path = public as $$
declare pl price_lists;
begin
  select * into pl from price_lists where id = p_list;
  if pl.id is null or not member_in('finance', pl.kos_id) then raise exception 'Daftar harga tidak ditemukan'; end if;
  update price_lists set archived_at = now() where id = pl.id;
  update contacts set price_list_id = null where price_list_id = pl.id;
end $$;

-- Isi harga di daftar (null/kosong = hapus baris → kembali ke harga biasa)
create or replace function public.price_list_item_set(p_list uuid, p_product uuid, p_unit text, p_price numeric)
returns void language plpgsql security definer set search_path = public as $$
declare pl price_lists;
begin
  select * into pl from price_lists where id = p_list;
  if pl.id is null or not member_in('finance', pl.kos_id) then raise exception 'Daftar harga tidak ditemukan'; end if;
  if not exists (select 1 from product_units where product_id = p_product and name = p_unit and kos_id = pl.kos_id) then raise exception 'Barang/satuan tidak ditemukan'; end if;
  if p_price is null then delete from price_list_items where list_id = pl.id and product_id = p_product and unit = p_unit; return; end if;
  if p_price < 0 then raise exception 'Harga tidak boleh minus'; end if;
  insert into price_list_items(list_id, kos_id, product_id, unit, price) values (pl.id, pl.kos_id, p_product, p_unit, round(p_price, 2))
  on conflict (list_id, product_id, unit) do update set price = excluded.price, updated_at = now();
  update price_lists set updated_at = now() where id = pl.id;
end $$;

-- ===== Penawaran / pesanan =====
-- p: {contact_id, lines:[{product_id, unit, qty, price?}], valid_until, need_date, customer_ref, ship_address, terms_days, note, confirm}
create or replace function public.so_save(p_id uuid, p_kos uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o so_orders; c contacts; l jsonb; u product_units; pr products; v_price numeric; v_qty numeric; v_total numeric := 0; v_no text; v_seq int;
        v_day date := (now() at time zone 'Asia/Jakarta')::date; v_new boolean; v_sort int := 0; v_old so_lines;
begin
  perform so_guard(p_kos);
  if p_id is null then raise exception 'ID wajib'; end if;
  select * into o from so_orders where id = p_id for update;
  v_new := o.id is null;
  if not v_new and o.kos_id <> p_kos then raise exception 'Pesanan tidak valid'; end if;
  if not v_new and o.status not in ('penawaran', 'dikonfirmasi', 'sebagian') then raise exception 'Pesanan yang sudah selesai/batal tidak bisa diubah'; end if;
  select * into c from contacts where id = coalesce(nullif(p->>'contact_id', '')::uuid, o.contact_id) and kos_id = p_kos and kind = 'pelanggan';
  if c.id is null then raise exception 'Pilih pelanggan'; end if;
  if not v_new and c.id <> o.contact_id and exists (select 1 from so_deliveries where order_id = o.id) then raise exception 'Pelanggan tidak bisa diganti setelah ada surat jalan'; end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'Tambahkan minimal satu barang'; end if;
  if jsonb_array_length(p->'lines') > 100 then raise exception 'Maksimal 100 baris'; end if;

  if v_new then
    perform pg_advisory_xact_lock(hashtext('so:' || p_kos::text));
    select count(*) + 1 into v_seq from so_orders where kos_id = p_kos and order_date = v_day;
    v_no := 'SO-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
    insert into so_orders(id, kos_id, number, contact_id, status, order_date, created_by, branch_id)
    values (p_id, p_kos, v_no, c.id, 'penawaran', v_day, actor_email(), (select stock_loc(p_kos)))
    returning * into o;
  end if;

  -- baris lama yang sudah terkirim tidak boleh hilang/dikurangi di bawah jumlah terkirim
  for v_old in select * from so_lines where order_id = o.id and qty_sent > 0 loop
    if not exists (select 1 from jsonb_array_elements(p->'lines') x where nullif(x->>'id', '')::uuid = v_old.id and (x->>'qty')::numeric >= v_old.qty_sent) then
      raise exception '% sudah dikirim % %; jumlah tidak boleh kurang dari itu', v_old.name, v_old.qty_sent, v_old.unit; end if;
  end loop;
  delete from so_lines where order_id = o.id and qty_sent = 0
    and id not in (select nullif(x->>'id', '')::uuid from jsonb_array_elements(p->'lines') x where nullif(x->>'id', '') is not null);

  for l in select * from jsonb_array_elements(p->'lines') loop
    v_sort := v_sort + 1;
    select * into pr from products where id = nullif(l->>'product_id', '')::uuid and kos_id = p_kos;
    if pr.id is null then raise exception 'Barang tidak ditemukan'; end if;
    select * into u from product_units where product_id = pr.id and name = l->>'unit';
    if u.id is null then raise exception 'Satuan "%" untuk % tidak ada', l->>'unit', pr.name; end if;
    v_qty := nullif(l->>'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah % harus lebih dari 0', pr.name; end if;
    v_price := coalesce(nullif(l->>'price', '')::numeric, (price_for(p_kos, c.id, pr.id, u.name) ->> 'price')::numeric, 0);
    if v_price < 0 then raise exception 'Harga % tidak boleh minus', pr.name; end if;
    if nullif(l->>'id', '') is not null and exists (select 1 from so_lines where id = (l->>'id')::uuid and order_id = o.id) then
      update so_lines set product_id = case when qty_sent > 0 then product_id else pr.id end, name = case when qty_sent > 0 then name else pr.name end,
        unit = case when qty_sent > 0 then unit else u.name end, unit_qty = case when qty_sent > 0 then unit_qty else u.qty end,
        qty = v_qty, price = v_price, line_total = round(v_qty * v_price, 2), sort = v_sort
      where id = (l->>'id')::uuid;
    else
      insert into so_lines(order_id, kos_id, product_id, name, unit, unit_qty, qty, price, line_total, sort)
      values (o.id, p_kos, pr.id, pr.name, u.name, u.qty, v_qty, v_price, round(v_qty * v_price, 2), v_sort);
    end if;
  end loop;
  select coalesce(sum(line_total), 0) into v_total from so_lines where order_id = o.id;

  update so_orders set contact_id = c.id, total = v_total,
    valid_until = nullif(p->>'valid_until', '')::date, need_date = nullif(p->>'need_date', '')::date,
    customer_ref = nullif(trim(coalesce(p->>'customer_ref', '')), ''),
    ship_address = coalesce(nullif(trim(coalesce(p->>'ship_address', '')), ''), c.address),
    terms_days = coalesce(nullif(p->>'terms_days', '')::int, c.terms_days),
    note = nullif(trim(coalesce(p->>'note', '')), ''), updated_at = now()
  where id = o.id returning * into o;
  -- pesanan yang sudah dikonfirmasi lalu diubah: status kirim dihitung ulang
  if o.status in ('dikonfirmasi', 'sebagian') then perform so_refresh(o.id); end if;

  if coalesce((p->>'confirm')::boolean, false) and o.status = 'penawaran' then
    return so_confirm(o.id, p->>'override_reason') || jsonb_build_object('id', o.id, 'number', o.number);
  end if;
  return jsonb_build_object('id', o.id, 'number', o.number, 'total', v_total, 'status', o.status);
end $$;

-- status pesanan dari jumlah terkirim
create or replace function public.so_refresh(p_order uuid)
returns text language plpgsql security definer set search_path = public as $$
declare o so_orders; v_all boolean; v_any boolean; v_st text;
begin
  select * into o from so_orders where id = p_order;
  if o.status in ('penawaran', 'batal') or o.closed_at is not null then return o.status; end if;
  select bool_and(qty_sent >= qty), bool_or(qty_sent > 0) into v_all, v_any from so_lines where order_id = o.id;
  v_st := case when v_all then 'selesai' when v_any then 'sebagian' else 'dikonfirmasi' end;
  update so_orders set status = v_st, updated_at = now() where id = o.id;
  return v_st;
end $$;

-- Konfirmasi pesanan: cek batas kredit (pemilik/pengelola boleh melewati dengan alasan), peringatan stok & piutang terlambat
create or replace function public.so_confirm(p_order uuid, p_override text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o so_orders; c contacts; cr jsonb; v_remaining numeric; v_exposure numeric; v_warn jsonb := '[]'; v_short text;
begin
  select * into o from so_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform so_guard(o.kos_id);
  if o.status <> 'penawaran' then raise exception 'Pesanan ini sudah dikonfirmasi'; end if;
  select * into c from contacts where id = o.contact_id;
  cr := customer_credit(c.id);
  select coalesce(sum(price * qty), 0) into v_remaining from so_lines where order_id = o.id;
  v_exposure := (cr->>'balance')::numeric + (cr->>'open_orders')::numeric + v_remaining;
  if c.credit_limit is not null and v_exposure > c.credit_limit then
    if not member_in('settings', o.kos_id) then
      raise exception 'Melewati batas kredit % (piutang % + pesanan berjalan % + pesanan ini %). Minta pemilik/pengelola mengonfirmasi, atau minta pembayaran dulu.',
        dom_rp(c.credit_limit), dom_rp((cr->>'balance')::numeric), dom_rp((cr->>'open_orders')::numeric), dom_rp(v_remaining); end if;
    if coalesce(length(trim(p_override)), 0) < 3 then
      raise exception 'BATAS_KREDIT: Pesanan ini membuat total kredit % melewati batas %. Tulis alasan bila tetap dikonfirmasi.', dom_rp(v_exposure), dom_rp(c.credit_limit); end if;
  end if;
  if (cr->>'overdue')::numeric > 0 then
    v_warn := v_warn || jsonb_build_array('Ada piutang lewat jatuh tempo ' || dom_rp((cr->>'overdue')::numeric) || ' (terlama ' || (cr->>'overdue_days') || ' hari).');
  end if;
  select string_agg(l.name, ', ') into v_short from so_lines l join products p on p.id = l.product_id
  where l.order_id = o.id and p.stock < (select coalesce(sum((l2.qty - l2.qty_sent) * l2.unit_qty), 0) from so_lines l2 join so_orders o2 on o2.id = l2.order_id
    where l2.product_id = p.id and (o2.id = o.id or o2.status in ('dikonfirmasi', 'sebagian')));
  if v_short is not null then v_warn := v_warn || jsonb_build_array('Stok belum cukup untuk semua pesanan berjalan: ' || v_short || '. Pesanan tetap bisa dikirim bertahap.'); end if;
  update so_orders set status = 'dikonfirmasi', confirmed_at = now(), confirmed_by = actor_email(), updated_at = now(),
    credit_check = jsonb_build_object('limit', c.credit_limit, 'exposure', v_exposure, 'balance', cr->'balance', 'overdue', cr->'overdue',
      'override', case when c.credit_limit is not null and v_exposure > c.credit_limit then trim(p_override) end, 'by', actor_email(), 'at', now())
  where id = o.id;
  return jsonb_build_object('status', 'dikonfirmasi', 'warnings', v_warn);
end $$;

-- Batal (belum ada surat jalan) atau tutup sisa (sudah ada surat jalan)
create or replace function public.so_cancel(p_order uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare o so_orders; v_st text;
begin
  select * into o from so_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform so_guard(o.kos_id);
  if o.status in ('selesai', 'batal') then raise exception 'Pesanan sudah %', o.status; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tulis alasannya'; end if;
  v_st := case when exists (select 1 from so_deliveries where order_id = o.id and status <> 'gagal') then 'selesai' else 'batal' end;
  update so_orders set status = v_st, closed_at = now(), close_reason = trim(p_reason), updated_at = now() where id = o.id;
  return v_st;
end $$;

-- Surat jalan + faktur. p: {lines:[{line_id, qty}], method 'kasbon'|'tunai'|'transfer', driver, vehicle, note}
create or replace function public.so_deliver(p_id uuid, p_order uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o so_orders; c contacts; x jsonb; sl so_lines; v_lines jsonb := '[]'; v_qty numeric; v_no text; v_seq int; v_sale jsonb; v_sale_id uuid := gen_random_uuid();
        v_day date := (now() at time zone 'Asia/Jakarta')::date; v_method text := coalesce(nullif(p->>'method', ''), 'kasbon'); v_st text; v_ex so_deliveries;
begin
  select * into v_ex from so_deliveries where id = p_id;
  if v_ex.id is not null then return jsonb_build_object('id', v_ex.id, 'number', v_ex.number, 'sale_id', v_ex.sale_id, 'duplicate', true); end if;
  select * into o from so_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform so_guard(o.kos_id);
  if o.status = 'penawaran' then raise exception 'Konfirmasi pesanan dulu sebelum membuat surat jalan'; end if;
  if o.status in ('selesai', 'batal') then raise exception 'Pesanan sudah %', o.status; end if;
  if v_method not in ('kasbon', 'tunai', 'transfer') then raise exception 'Pilih cara bayar: piutang (tempo), tunai, atau transfer'; end if;
  select * into c from contacts where id = o.contact_id;
  if jsonb_typeof(p->'lines') <> 'array' then raise exception 'Isi jumlah yang dikirim'; end if;

  perform pg_advisory_xact_lock(hashtext('sj:' || o.kos_id::text));
  select count(*) + 1 into v_seq from so_deliveries where kos_id = o.kos_id and ship_date = v_day;
  v_no := 'SJ-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  insert into so_deliveries(id, kos_id, order_id, number, ship_date, driver, vehicle, note, created_by)
  values (p_id, o.kos_id, o.id, v_no, v_day, nullif(trim(coalesce(p->>'driver', '')), ''), nullif(trim(coalesce(p->>'vehicle', '')), ''),
          nullif(trim(coalesce(p->>'note', '')), ''), actor_email());

  for x in select * from jsonb_array_elements(p->'lines') loop
    v_qty := nullif(x->>'qty', '')::numeric;
    continue when v_qty is null or v_qty = 0;
    if v_qty < 0 then raise exception 'Jumlah kirim tidak boleh minus'; end if;
    select * into sl from so_lines where id = (x->>'line_id')::uuid and order_id = o.id for update;
    if sl.id is null then raise exception 'Baris pesanan tidak ditemukan'; end if;
    if sl.qty_sent + v_qty > sl.qty then raise exception '% hanya tersisa % % untuk dikirim (ubah pesanan bila pelanggan menambah)', sl.name, sl.qty - sl.qty_sent, sl.unit; end if;
    insert into so_delivery_lines(delivery_id, line_id, kos_id, qty) values (p_id, sl.id, o.kos_id, v_qty);
    update so_lines set qty_sent = qty_sent + v_qty where id = sl.id;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('product_id', sl.product_id, 'unit', sl.unit, 'qty', v_qty, 'price', sl.price));
  end loop;
  if jsonb_array_length(v_lines) = 0 then raise exception 'Isi jumlah barang yang dikirim'; end if;

  -- faktur = penjualan grosir dengan harga pesanan (stok, HPP, pendapatan, PPN, piutang — sama dengan Kasir)
  v_sale := sale_create(v_sale_id, o.kos_id, 'grosir', v_lines, 0, v_method, null, o.contact_id,
    case when v_method = 'kasbon' then v_day + coalesce(o.terms_days, c.terms_days, 0) end,
    'Faktur ' || o.number || ' · ' || v_no || coalesce(' · PO ' || o.customer_ref, ''));
  update so_deliveries set sale_id = (v_sale->>'id')::uuid where id = p_id;
  v_st := so_refresh(o.id);
  return jsonb_build_object('id', p_id, 'number', v_no, 'sale_id', v_sale->>'id', 'invoice', v_sale->>'number', 'total', v_sale->'total', 'status', v_st, 'duplicate', false);
end $$;

-- Status pengiriman: diterima (nama penerima) atau gagal (faktur dibatalkan, stok & piutang kembali, sisa bisa dikirim ulang)
create or replace function public.so_delivery_status(p_delivery uuid, p_status text, p_recipient text default null, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare dv so_deliveries; o so_orders;
begin
  select * into dv from so_deliveries where id = p_delivery for update;
  if dv.id is null then raise exception 'Surat jalan tidak ditemukan'; end if;
  perform so_guard(dv.kos_id);
  if dv.status <> 'dikirim' and not (dv.status = 'diterima' and p_status = 'diterima') then raise exception 'Surat jalan ini sudah %', dv.status; end if;
  if p_status = 'diterima' then
    update so_deliveries set status = 'diterima', received_at = now(), recipient = nullif(trim(coalesce(p_recipient, '')), ''),
      note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note) where id = dv.id;
  elsif p_status = 'gagal' then
    if coalesce(length(trim(p_note)), 0) < 3 then raise exception 'Tulis alasannya (mis. toko tutup, alamat salah)'; end if;
    if not member_in('finance', dv.kos_id) then raise exception 'Gagal kirim membatalkan fakturnya — minta pemilik atau bagian keuangan menandai'; end if;
    if dv.sale_id is not null and (select status from sales where id = dv.sale_id) = 'selesai' then
      perform sale_void(dv.sale_id, 'Gagal kirim ' || dv.number || ': ' || trim(p_note));
    end if;
    update so_lines l set qty_sent = l.qty_sent - d.qty from so_delivery_lines d where d.delivery_id = dv.id and d.line_id = l.id;
    update so_deliveries set status = 'gagal', note = trim(p_note) where id = dv.id;
    select * into o from so_orders where id = dv.order_id;
    if o.status = 'selesai' and o.closed_at is null then update so_orders set status = 'dikonfirmasi' where id = o.id; end if;
    perform so_refresh(dv.order_id);
  else raise exception 'Status tidak dikenal'; end if;
  return p_status;
end $$;

-- Data dokumen cetak (penawaran/pesanan, surat jalan, faktur) untuk satu pesanan
create or replace function public.so_document(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o so_orders; k kos;
begin
  select * into o from so_orders where id = p_order;
  if o.id is null or not member_in('sell,finance', o.kos_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  select * into k from kos where id = o.kos_id;
  return jsonb_build_object(
    'order', to_jsonb(o) - 'credit_check',
    'business', jsonb_build_object('name', k.name, 'address', k.address, 'phone', k.contact_phone, 'npwp', k.profile->'tax'->>'npwp', 'logo', k.profile->>'logo_path',
      'payment_info', k.payment_info, 'footer', k.receipt_footer),
    'customer', (select jsonb_build_object('name', c.name, 'phone', c.phone, 'address', c.address, 'npwp', c.npwp) from contacts c where c.id = o.contact_id),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'unit', l.unit, 'qty', l.qty, 'qty_sent', l.qty_sent, 'price', l.price, 'line_total', l.line_total) order by l.sort), '[]') from so_lines l where l.order_id = o.id),
    'deliveries', (select coalesce(jsonb_agg(jsonb_build_object('id', dv.id, 'number', dv.number, 'ship_date', dv.ship_date, 'status', dv.status, 'driver', dv.driver, 'vehicle', dv.vehicle,
        'recipient', dv.recipient, 'received_at', dv.received_at, 'note', dv.note,
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('line_id', x.line_id, 'qty', x.qty)), '[]') from so_delivery_lines x where x.delivery_id = dv.id),
        'invoice', (select jsonb_build_object('number', s.number, 'date', s.sale_date, 'total', s.total, 'tax', s.tax_amount, 'tax_rate', s.tax_rate, 'pay_method', s.pay_method,
                    'due_date', s.due_date, 'status', s.status) from sales s where s.id = dv.sale_id)) order by dv.created_at), '[]') from so_deliveries dv where dv.order_id = o.id));
end $$;
revoke execute on function public.so_document(uuid) from public, anon;
grant execute on function public.so_document(uuid) to authenticated;

-- Peristiwa (riwayat aktivitas)
create or replace function public.dom_so_orders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform dom_emit(new.kos_id, 'SalesOrderCreated', 'so_order', new.id, new.id::text, 'sell', 'Penawaran ' || new.number, null, jsonb_build_object('number', new.number));
  elsif new.status is distinct from old.status then
    perform dom_emit(new.kos_id, 'SalesOrder' || initcap(new.status), 'so_order', new.id, new.id::text || ':' || new.status, 'sell',
      'Pesanan ' || new.number || ' → ' || new.status || coalesce(' · ' || new.close_reason, ''), new.total, jsonb_build_object('number', new.number, 'status', new.status));
  end if;
  return null;
end $$;
drop trigger if exists dom_so_orders on public.so_orders;
create trigger dom_so_orders after insert or update of status on public.so_orders for each row execute function public.dom_so_orders();
create or replace function public.dom_so_deliveries()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform dom_emit(new.kos_id, 'DeliveryCreated', 'so_delivery', new.id, new.id::text, 'sell', 'Surat jalan ' || new.number, null, jsonb_build_object('number', new.number, 'order_id', new.order_id));
  elsif new.status is distinct from old.status then
    perform dom_emit(new.kos_id, 'Delivery' || initcap(new.status), 'so_delivery', new.id, new.id::text || ':' || new.status, 'sell',
      'Surat jalan ' || new.number || ' → ' || new.status || coalesce(' · ' || new.recipient, '') || coalesce(' · ' || new.note, ''), null, jsonb_build_object('number', new.number));
  end if;
  return null;
end $$;
drop trigger if exists dom_so_deliveries on public.so_deliveries;
create trigger dom_so_deliveries after insert or update of status on public.so_deliveries for each row execute function public.dom_so_deliveries();

-- Izin
revoke execute on function public.so_guard(uuid, text), public.so_refresh(uuid), public.dom_so_orders(), public.dom_so_deliveries() from public, anon, authenticated;
revoke execute on function public.price_for(uuid, uuid, uuid, text, text), public.price_list_for_contact(uuid, uuid), public.receivable_open(uuid, uuid),
  public.customer_credit(uuid), public.customer_terms_set(uuid, jsonb), public.price_list_save(uuid, uuid, text, text), public.price_list_archive(uuid),
  public.price_list_item_set(uuid, uuid, text, numeric), public.so_save(uuid, uuid, jsonb), public.so_confirm(uuid, text), public.so_cancel(uuid, text),
  public.so_deliver(uuid, uuid, jsonb), public.so_delivery_status(uuid, text, text, text) from public, anon;
grant execute on function public.price_for(uuid, uuid, uuid, text, text), public.price_list_for_contact(uuid, uuid), public.receivable_open(uuid, uuid),
  public.customer_credit(uuid), public.customer_terms_set(uuid, jsonb), public.price_list_save(uuid, uuid, text, text), public.price_list_archive(uuid),
  public.price_list_item_set(uuid, uuid, text, numeric), public.so_save(uuid, uuid, jsonb), public.so_confirm(uuid, text), public.so_cancel(uuid, text),
  public.so_deliver(uuid, uuid, jsonb), public.so_delivery_status(uuid, text, text, text) to authenticated;

-- ===== Module Registry: penawaran & kredit siap dipakai (Retail) =====
update public.modules set impl_status = 'production_ready', applies_to = '{retail}', paths = '{/grosir}',
  description = 'Penawaran harga → pesanan pelanggan → surat jalan (bisa bertahap) → faktur → piutang. Dokumen bisa dicetak/dikirim lewat WhatsApp.',
  data_used = 'so_orders, so_lines, so_deliveries, sales (faktur)', config_path = '/grosir', area = 'sell'
where code = 'u_penawaran';
update public.modules set impl_status = 'production_ready', applies_to = '{retail}', paths = '{/grosir?tab=harga}',
  description = 'Batas kredit & tempo per pelanggan, daftar harga khusus (reseller/grosir), umur piutang. Pesanan yang melewati batas perlu alasan pemilik/pengelola.',
  data_used = 'contacts (batas kredit, tempo), price_lists, price_list_items', config_path = '/kontak', area = 'finance'
where code = 'u_kredit';
-- bisnis retail yang sudah ada: aktif seperti modul opsional lain (bisnis baru otomatis lewat kos_seed_modules)
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, m.code, true, 'sistem' from public.kos k join public.modules m on m.code in ('u_penawaran', 'u_kredit')
where k.business_type = 'retail' on conflict do nothing;
