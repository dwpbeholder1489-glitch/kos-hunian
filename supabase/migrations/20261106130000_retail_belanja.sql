-- PRASARA Langkah 2 bagian 3: Belanja ke supplier — stok bertambah, harga modal rata-rata (moving average) dihitung ulang,
-- bayar tunai / transfer / utang ke supplier.

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  purchase_date date not null,
  contact_id uuid references public.contacts(id),
  total numeric(14,2) not null check (total >= 0),
  pay_method text not null check (pay_method in ('tunai', 'transfer', 'utang')),
  due_date date,
  status text not null default 'selesai' check (status in ('selesai', 'batal')),
  void_reason text,
  voided_at timestamptz,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (kos_id, number)
);
create index if not exists purchases_kos_date on public.purchases(kos_id, purchase_date desc);

create table if not exists public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id),
  name text not null,
  unit text not null,
  unit_qty numeric(14,3) not null,
  qty numeric(14,3) not null check (qty > 0),
  price numeric(14,2) not null check (price >= 0),      -- harga beli per satuan yang dibeli
  line_total numeric(14,2) not null
);
create index if not exists purchase_lines_product on public.purchase_lines(product_id);
create index if not exists purchase_lines_purchase on public.purchase_lines(purchase_id);

alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
create policy purchases_select on public.purchases for select using (public.is_member(kos_id));
create policy purchase_lines_select on public.purchase_lines for select using (public.is_member(kos_id));
grant select on public.purchases, public.purchase_lines to authenticated;

-- p_lines: [{product_id, unit, qty, price}]  (price = harga beli per satuan yang dipilih, mis. per dus)
create or replace function public.purchase_create(p_id uuid, p_kos uuid, p_date date, p_contact uuid, p_lines jsonb, p_method text,
                                                  p_due date default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_no text; v_seq int; l jsonb; p products; u product_units; v_existing purchases;
  v_qty numeric; v_price numeric; v_base numeric; v_unit_cost numeric; v_new_cost numeric; v_total numeric := 0;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if (select business_type from kos where id = p_kos) <> 'retail' then raise exception 'Belanja hanya untuk bisnis Retail & Grosir'; end if;
  select * into v_existing from purchases where id = p_id;
  if v_existing.id is not null then
    if v_existing.kos_id <> p_kos then raise exception 'Transaksi tidak valid'; end if;
    return jsonb_build_object('id', v_existing.id, 'number', v_existing.number, 'total', v_existing.total, 'duplicate', true);
  end if;
  if v_day > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal belanja tidak boleh di masa depan'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Daftar belanja masih kosong'; end if;
  if jsonb_array_length(p_lines) > 100 then raise exception 'Maksimal 100 baris per belanja'; end if;
  if p_method not in ('tunai', 'transfer', 'utang') then raise exception 'Cara bayar tidak dikenal'; end if;
  if p_contact is not null and not exists (select 1 from contacts where id = p_contact and kos_id = p_kos and kind = 'supplier') then raise exception 'Supplier tidak ditemukan'; end if;
  if p_method = 'utang' and p_contact is null then raise exception 'Pilih supplier untuk belanja utang'; end if;

  perform pg_advisory_xact_lock(hashtext('purchase:' || p_kos::text));
  select count(*) + 1 into v_seq from purchases where kos_id = p_kos and purchase_date = v_day;
  v_no := 'BLJ-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  insert into purchases(id, kos_id, number, purchase_date, contact_id, total, pay_method, due_date, note)
  values (p_id, p_kos, v_no, v_day, p_contact, 0, p_method, case when p_method = 'utang' then p_due end, nullif(trim(coalesce(p_note, '')), ''));

  for l in select * from jsonb_array_elements(p_lines) loop
    select * into p from products where id = (l->>'product_id')::uuid and kos_id = p_kos for update;
    if p.id is null then raise exception 'Barang tidak ditemukan'; end if;
    select * into u from product_units where product_id = p.id and name = l->>'unit';
    if u.id is null then raise exception 'Satuan "%" untuk % tidak ada', l->>'unit', p.name; end if;
    v_qty := (l->>'qty')::numeric;
    v_price := (l->>'price')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah % harus lebih dari 0', p.name; end if;
    if v_price is null or v_price < 0 then raise exception 'Isi harga beli %', p.name; end if;
    v_base := round(v_qty * u.qty, 3);
    v_unit_cost := v_price / u.qty;
    -- Harga modal rata-rata bergerak; stok minus/nol dianggap mulai dari harga beli ini
    v_new_cost := case when p.stock > 0 then (p.stock * p.cost + v_base * v_unit_cost) / (p.stock + v_base) else v_unit_cost end;
    insert into purchase_lines(purchase_id, kos_id, product_id, name, unit, unit_qty, qty, price, line_total)
    values (p_id, p_kos, p.id, p.name, u.name, u.qty, v_qty, v_price, round(v_qty * v_price, 2));
    update products set stock = stock + v_base, cost = round(v_new_cost, 2) where id = p.id;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (p_kos, p.id, 'beli', v_base, p.stock + v_base, round(v_qty * v_price, 2), p_id, v_no);
    v_total := v_total + round(v_qty * v_price, 2);
  end loop;
  update purchases set total = v_total where id = p_id;
  return jsonb_build_object('id', p_id, 'number', v_no, 'total', v_total, 'duplicate', false);
end $$;

-- Batalkan belanja: stok dikurangi lagi, harga modal dikembalikan sejauh bisa dihitung
create or replace function public.purchase_void(p_purchase uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare b purchases; l purchase_lines; p products; v_base numeric; v_rest numeric; v_cost numeric;
begin
  select * into b from purchases where id = p_purchase for update;
  if b.id is null or not is_member(b.kos_id) then raise exception 'Belanja tidak ditemukan'; end if;
  if b.status = 'batal' then raise exception 'Belanja sudah dibatalkan'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Isi alasan pembatalan'; end if;
  for l in select * from purchase_lines where purchase_id = b.id loop
    select * into p from products where id = l.product_id for update;
    v_base := round(l.qty * l.unit_qty, 3);
    v_rest := p.stock - v_base;
    v_cost := case when v_rest > 0 then (p.stock * p.cost - l.line_total) / v_rest else p.cost end;
    if v_cost is null or v_cost < 0 then v_cost := p.cost; end if;
    update products set stock = v_rest, cost = round(v_cost, 2) where id = p.id;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (b.kos_id, p.id, 'batal', -v_base, v_rest, -l.line_total, b.id, 'Batal ' || b.number);
  end loop;
  update purchases set status = 'batal', void_reason = trim(p_reason), voided_at = now() where id = b.id;
end $$;

revoke execute on function public.purchase_create(uuid, uuid, date, uuid, jsonb, text, date, text), public.purchase_void(uuid, text) from public, anon;
grant execute on function public.purchase_create(uuid, uuid, date, uuid, jsonb, text, date, text), public.purchase_void(uuid, text) to authenticated;
