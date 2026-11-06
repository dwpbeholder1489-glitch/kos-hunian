-- PRASARA Langkah 2 bagian 1: Retail & Grosir — barang, satuan (dus/pak/pcs), harga eceran/grosir, stok.
-- Stok disimpan dalam satuan dasar. Setiap perubahan stok tercatat di stock_moves (tidak bisa diubah langsung dari aplikasi).

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  base_unit text not null default 'pcs' check (length(trim(base_unit)) between 1 and 20),
  cost numeric(14,2) not null default 0 check (cost >= 0),          -- harga modal rata-rata per satuan dasar
  stock numeric(14,3) not null default 0,                           -- dalam satuan dasar; hanya berubah lewat stock_moves
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists products_kos on public.products(kos_id, name);

create table if not exists public.product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 20),
  qty numeric(14,3) not null check (qty > 0),                       -- isi dalam satuan dasar (pcs = 1, dus = 40)
  price_retail numeric(14,2) not null default 0 check (price_retail >= 0),
  price_wholesale numeric(14,2) not null default 0 check (price_wholesale >= 0),
  sort int not null default 0,
  unique (product_id, name)
);
create index if not exists product_units_product on public.product_units(product_id, sort);

create table if not exists public.stock_moves (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null check (kind in ('awal','opname','rusak','kedaluwarsa','koreksi','jual','beli','retur_jual','retur_beli','batal')),
  delta numeric(14,3) not null,
  stock_after numeric(14,3) not null,
  value numeric(14,2) not null default 0,                           -- delta × harga modal saat itu
  note text,
  ref_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists stock_moves_product on public.stock_moves(product_id, created_at desc);
create index if not exists stock_moves_kos on public.stock_moves(kos_id, created_at desc);

alter table public.products enable row level security;
alter table public.product_units enable row level security;
alter table public.stock_moves enable row level security;
create policy products_select on public.products for select using (public.is_member(kos_id));
create policy product_units_select on public.product_units for select using (public.is_member(kos_id));
create policy stock_moves_select on public.stock_moves for select using (public.is_member(kos_id));
grant select on public.products, public.product_units, public.stock_moves to authenticated;
-- Semua penulisan lewat fungsi di bawah agar stok & riwayatnya selalu cocok.

-- Simpan barang baru / ubah barang. p_units: [{name, qty, price_retail, price_wholesale}], baris pertama = satuan dasar (qty 1).
create or replace function public.product_save(p_kos uuid, p_id uuid, p_name text, p_base text, p_cost numeric, p_min numeric, p_units jsonb, p_initial_stock numeric default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; u jsonb; i int := 0; v_base text := coalesce(nullif(trim(p_base), ''), 'pcs'); v_names text[] := '{}';
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if (select business_type from kos where id = p_kos) <> 'retail' then raise exception 'Barang hanya untuk bisnis Retail & Grosir'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Nama barang wajib diisi'; end if;
  if coalesce(p_cost, 0) < 0 or coalesce(p_min, 0) < 0 or coalesce(p_initial_stock, 0) < 0 then raise exception 'Angka tidak boleh minus'; end if;
  if jsonb_typeof(p_units) <> 'array' or jsonb_array_length(p_units) = 0 then raise exception 'Isi minimal satu satuan jual'; end if;
  if jsonb_array_length(p_units) > 6 then raise exception 'Maksimal 6 satuan per barang'; end if;

  if p_id is null then
    insert into products(kos_id, name, base_unit, cost, min_stock) values (p_kos, trim(p_name), v_base, coalesce(p_cost, 0), coalesce(p_min, 0)) returning id into v_id;
  else
    update products set name = trim(p_name), base_unit = v_base, cost = coalesce(p_cost, 0), min_stock = coalesce(p_min, 0)
      where id = p_id and kos_id = p_kos returning id into v_id;
    if v_id is null then raise exception 'Barang tidak ditemukan'; end if;
  end if;

  delete from product_units where product_id = v_id;
  for u in select * from jsonb_array_elements(p_units) loop
    if i > 0 and coalesce(trim(u->>'name'), '') = '' then raise exception 'Nama satuan wajib diisi'; end if;
    if i > 0 and lower(trim(u->>'name')) = any(v_names) then raise exception 'Nama satuan "%" dobel', trim(u->>'name'); end if;
    v_names := v_names || case when i = 0 then lower(v_base) else lower(trim(u->>'name')) end;
    if i > 0 and coalesce((u->>'qty')::numeric, 0) <= 1 then raise exception 'Isi satuan "%" harus lebih dari 1 %', trim(u->>'name'), v_base; end if;
    insert into product_units(product_id, kos_id, name, qty, price_retail, price_wholesale, sort)
    values (v_id, p_kos, case when i = 0 then v_base else trim(u->>'name') end, case when i = 0 then 1 else (u->>'qty')::numeric end,
            greatest(0, coalesce((u->>'price_retail')::numeric, 0)), greatest(0, coalesce((u->>'price_wholesale')::numeric, 0)), i);
    i := i + 1;
  end loop;

  if p_id is null and coalesce(p_initial_stock, 0) > 0 then
    update products set stock = p_initial_stock where id = v_id;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, note)
    values (p_kos, v_id, 'awal', p_initial_stock, p_initial_stock, round(p_initial_stock * coalesce(p_cost, 0), 2), 'Stok awal');
  end if;
  return v_id;
end $$;

-- Sesuaikan stok: opname (isi jumlah fisik), rusak/kedaluwarsa (jumlah dibuang), koreksi (tambah/kurang)
create or replace function public.stock_adjust(p_product uuid, p_reason text, p_qty numeric, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare p products; v_delta numeric;
begin
  select * into p from products where id = p_product for update;
  if p.id is null or not is_member(p.kos_id) then raise exception 'Barang tidak ditemukan'; end if;
  if p_qty is null then raise exception 'Isi jumlahnya'; end if;
  if p_reason = 'opname' then
    if p_qty < 0 then raise exception 'Jumlah fisik tidak boleh minus'; end if;
    v_delta := p_qty - p.stock;
  elsif p_reason in ('rusak', 'kedaluwarsa') then
    if p_qty <= 0 then raise exception 'Isi jumlah yang dibuang'; end if;
    v_delta := -p_qty;
  elsif p_reason = 'koreksi' then
    v_delta := p_qty;
  else raise exception 'Alasan tidak dikenal'; end if;
  if v_delta = 0 then return 0; end if;
  update products set stock = stock + v_delta where id = p.id;
  insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, note)
  values (p.kos_id, p.id, p_reason, v_delta, p.stock + v_delta, round(v_delta * p.cost, 2), nullif(trim(coalesce(p_note, '')), ''));
  return v_delta;
end $$;

-- Arsipkan / aktifkan lagi (barang tidak dihapus agar riwayat tetap ada)
create or replace function public.product_set_active(p_product uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update products set active = p_active where id = p_product and is_member(kos_id);
  if not found then raise exception 'Barang tidak ditemukan'; end if;
end $$;

revoke execute on function public.product_save(uuid, uuid, text, text, numeric, numeric, jsonb, numeric), public.stock_adjust(uuid, text, numeric, text), public.product_set_active(uuid, boolean) from public, anon;
grant execute on function public.product_save(uuid, uuid, text, text, numeric, numeric, jsonb, numeric), public.stock_adjust(uuid, text, numeric, text), public.product_set_active(uuid, boolean) to authenticated;
