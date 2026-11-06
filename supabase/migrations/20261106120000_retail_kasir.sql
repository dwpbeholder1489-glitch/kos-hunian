-- PRASARA Langkah 2 bagian 2: Kasir — pelanggan, penjualan (tunai / transfer / kasbon), struk, pembatalan.
-- Harga modal disalin ke setiap baris penjualan saat transaksi, agar laba lama tidak berubah saat modal berubah.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  kind text not null check (kind in ('pelanggan', 'supplier')),
  name text not null check (length(trim(name)) between 1 and 80),
  phone text,
  created_at timestamptz not null default now()
);
create index if not exists contacts_kos on public.contacts(kos_id, kind, name);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  sale_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  sold_at timestamptz not null default now(),
  tier text not null default 'ecer' check (tier in ('ecer', 'grosir')),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  total numeric(14,2) not null check (total >= 0),
  cost_total numeric(14,2) not null default 0,
  pay_method text not null check (pay_method in ('tunai', 'transfer', 'kasbon')),
  paid_amount numeric(14,2),                      -- uang yang diterima (tunai), untuk kembalian
  contact_id uuid references public.contacts(id),
  due_date date,
  status text not null default 'selesai' check (status in ('selesai', 'batal')),
  void_reason text,
  voided_at timestamptz,
  note text,
  created_by uuid default auth.uid(),
  unique (kos_id, number)
);
create index if not exists sales_kos_date on public.sales(kos_id, sale_date desc);

create table if not exists public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id),
  name text not null,
  unit text not null,
  unit_qty numeric(14,3) not null,               -- isi satuan dalam satuan dasar
  qty numeric(14,3) not null check (qty > 0),    -- jumlah satuan yang dijual
  price numeric(14,2) not null check (price >= 0),
  cost numeric(14,2) not null default 0,         -- harga modal per satuan dasar saat itu
  line_total numeric(14,2) not null
);
create index if not exists sale_lines_sale on public.sale_lines(sale_id);

alter table public.contacts enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
create policy contacts_select on public.contacts for select using (public.is_member(kos_id));
create policy sales_select on public.sales for select using (public.is_member(kos_id));
create policy sale_lines_select on public.sale_lines for select using (public.is_member(kos_id));
grant select on public.contacts, public.sales, public.sale_lines to authenticated;

create or replace function public.contact_save(p_kos uuid, p_id uuid, p_kind text, p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Nama wajib diisi'; end if;
  if p_id is null then
    insert into contacts(kos_id, kind, name, phone) values (p_kos, p_kind, trim(p_name), nullif(trim(coalesce(p_phone, '')), '')) returning id into v_id;
  else
    update contacts set name = trim(p_name), phone = nullif(trim(coalesce(p_phone, '')), '') where id = p_id and kos_id = p_kos returning id into v_id;
    if v_id is null then raise exception 'Kontak tidak ditemukan'; end if;
  end if;
  return v_id;
end $$;

-- Simpan penjualan. p_id dibuat oleh aplikasi: tombol Bayar yang tertekan dua kali tidak menghasilkan dua transaksi.
-- p_lines: [{product_id, unit, qty, price}]
create or replace function public.sale_create(p_id uuid, p_kos uuid, p_tier text, p_lines jsonb, p_discount numeric, p_method text,
                                              p_paid numeric default null, p_contact uuid default null, p_due date default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day date := (now() at time zone 'Asia/Jakarta')::date;
  v_no text; v_seq int; l jsonb; p products; u product_units;
  v_sub numeric := 0; v_cost numeric := 0; v_total numeric; v_qty numeric; v_price numeric; v_base numeric;
  v_existing sales;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if (select business_type from kos where id = p_kos) <> 'retail' then raise exception 'Kasir hanya untuk bisnis Retail & Grosir'; end if;
  select * into v_existing from sales where id = p_id;
  if v_existing.id is not null then
    if v_existing.kos_id <> p_kos then raise exception 'Transaksi tidak valid'; end if;
    return jsonb_build_object('id', v_existing.id, 'number', v_existing.number, 'total', v_existing.total, 'duplicate', true);
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Keranjang masih kosong'; end if;
  if jsonb_array_length(p_lines) > 100 then raise exception 'Maksimal 100 baris per transaksi'; end if;
  if p_method not in ('tunai', 'transfer', 'kasbon') then raise exception 'Cara bayar tidak dikenal'; end if;
  if p_method = 'kasbon' then
    if p_contact is null then raise exception 'Pilih pelanggan untuk kasbon'; end if;
    if not exists (select 1 from contacts where id = p_contact and kos_id = p_kos and kind = 'pelanggan') then raise exception 'Pelanggan tidak ditemukan'; end if;
  elsif p_contact is not null and not exists (select 1 from contacts where id = p_contact and kos_id = p_kos) then
    raise exception 'Pelanggan tidak ditemukan';
  end if;

  perform pg_advisory_xact_lock(hashtext('sale:' || p_kos::text));
  select count(*) + 1 into v_seq from sales where kos_id = p_kos and sale_date = v_day;
  v_no := 'TRX-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  insert into sales(id, kos_id, number, sale_date, tier, subtotal, discount, total, pay_method, paid_amount, contact_id, due_date, note)
  values (p_id, p_kos, v_no, v_day, coalesce(nullif(p_tier, ''), 'ecer'), 0, 0, 0, p_method, null, p_contact, case when p_method = 'kasbon' then p_due end, nullif(trim(coalesce(p_note, '')), ''));

  for l in select * from jsonb_array_elements(p_lines) loop
    select * into p from products where id = (l->>'product_id')::uuid and kos_id = p_kos for update;
    if p.id is null then raise exception 'Barang tidak ditemukan'; end if;
    select * into u from product_units where product_id = p.id and name = l->>'unit';
    if u.id is null then raise exception 'Satuan "%" untuk % tidak ada', l->>'unit', p.name; end if;
    v_qty := (l->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah % harus lebih dari 0', p.name; end if;
    v_price := coalesce((l->>'price')::numeric, case when p_tier = 'grosir' and u.price_wholesale > 0 then u.price_wholesale else u.price_retail end);
    if v_price < 0 then raise exception 'Harga tidak boleh minus'; end if;
    v_base := round(v_qty * u.qty, 3);
    insert into sale_lines(sale_id, kos_id, product_id, name, unit, unit_qty, qty, price, cost, line_total)
    values (p_id, p_kos, p.id, p.name, u.name, u.qty, v_qty, v_price, p.cost, round(v_qty * v_price, 2));
    update products set stock = stock - v_base where id = p.id;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (p_kos, p.id, 'jual', -v_base, p.stock - v_base, round(-v_base * p.cost, 2), p_id, v_no);
    v_sub := v_sub + round(v_qty * v_price, 2);
    v_cost := v_cost + round(v_base * p.cost, 2);
  end loop;

  if coalesce(p_discount, 0) < 0 or coalesce(p_discount, 0) > v_sub then raise exception 'Diskon tidak boleh melebihi subtotal'; end if;
  v_total := v_sub - coalesce(p_discount, 0);
  if p_method = 'tunai' and p_paid is not null and p_paid < v_total then raise exception 'Uang diterima kurang dari total'; end if;
  update sales set subtotal = v_sub, discount = coalesce(p_discount, 0), total = v_total, cost_total = v_cost,
    paid_amount = case when p_method = 'tunai' then coalesce(p_paid, v_total) end
  where id = p_id;
  return jsonb_build_object('id', p_id, 'number', v_no, 'total', v_total, 'duplicate', false);
end $$;

-- Batalkan penjualan: stok dikembalikan, transaksi tetap tersimpan dengan status Batal
create or replace function public.sale_void(p_sale uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s sales; l sale_lines; v_stock numeric;
begin
  select * into s from sales where id = p_sale for update;
  if s.id is null or not is_member(s.kos_id) then raise exception 'Transaksi tidak ditemukan'; end if;
  if s.status = 'batal' then raise exception 'Transaksi sudah dibatalkan'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Isi alasan pembatalan'; end if;
  for l in select * from sale_lines where sale_id = s.id loop
    update products set stock = stock + round(l.qty * l.unit_qty, 3) where id = l.product_id returning stock into v_stock;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (s.kos_id, l.product_id, 'batal', round(l.qty * l.unit_qty, 3), v_stock, round(l.qty * l.unit_qty * l.cost, 2), s.id, 'Batal ' || s.number);
  end loop;
  update sales set status = 'batal', void_reason = trim(p_reason), voided_at = now() where id = s.id;
end $$;

revoke execute on function public.contact_save(uuid, uuid, text, text, text), public.sale_create(uuid, uuid, text, jsonb, numeric, text, numeric, uuid, date, text), public.sale_void(uuid, text) from public, anon;
grant execute on function public.contact_save(uuid, uuid, text, text, text), public.sale_create(uuid, uuid, text, jsonb, numeric, text, numeric, uuid, date, text), public.sale_void(uuid, text) to authenticated;
