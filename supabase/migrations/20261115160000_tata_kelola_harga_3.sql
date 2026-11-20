-- Tahap 1 Tata kelola harga & kredit (bagian 3): harga per outlet + urutan harga di Kasir (keputusan pemilik 15 Nov 2026).
-- Urutan resmi: harga manual › daftar harga pelanggan (aktif) › grosir/eceran (dari outlet bila ada, lalu harga umum)
-- › harga beli banyak (termurah) › promo. Harga outlet hanya mengganti harga DASAR (grosir/eceran) di outlet itu.
-- Outlet yang dipakai = lokasi kerja pengguna (stock_loc). Tanpa baris outlet = harga umum.

-- 1. Harga per outlet -------------------------------------------------------------------------------
create table if not exists public.outlet_prices (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  unit text not null,
  price_retail numeric check (price_retail is null or price_retail >= 0),
  price_wholesale numeric check (price_wholesale is null or price_wholesale >= 0),
  updated_at timestamptz not null default now(),
  unique (branch_id, product_id, unit)
);
create index if not exists outlet_prices_kos on public.outlet_prices(kos_id);
alter table public.outlet_prices enable row level security;
drop policy if exists outlet_prices_select on public.outlet_prices;
create policy outlet_prices_select on public.outlet_prices for select using (member_can(kos_id, 'sell,finance'));
grant select on public.outlet_prices to authenticated;
drop trigger if exists zz_kos_open_guard on public.outlet_prices;
create trigger zz_kos_open_guard before insert or update or delete on public.outlet_prices for each row execute function public.kos_open_guard();

create or replace function public.outlet_price_set(p_kos uuid, p_branch uuid, p_product uuid, p_unit text, p_retail numeric, p_wholesale numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Khusus keuangan/pemilik'; end if;
  if not exists (select 1 from branches where id = p_branch and kos_id = p_kos and active) then raise exception 'Outlet tidak ditemukan'; end if;
  if not exists (select 1 from product_units where product_id = p_product and name = p_unit and kos_id = p_kos) then raise exception 'Barang/satuan tidak ditemukan'; end if;
  if p_retail is null and p_wholesale is null then
    delete from outlet_prices where branch_id = p_branch and product_id = p_product and unit = p_unit;
    return;
  end if;
  if coalesce(p_retail, 0) < 0 or coalesce(p_wholesale, 0) < 0 then raise exception 'Harga tidak boleh minus'; end if;
  insert into outlet_prices(kos_id, branch_id, product_id, unit, price_retail, price_wholesale, updated_at)
  values (p_kos, p_branch, p_product, p_unit, p_retail, p_wholesale, now())
  on conflict (branch_id, product_id, unit) do update set price_retail = excluded.price_retail, price_wholesale = excluded.price_wholesale, updated_at = now();
end $$;
revoke execute on function public.outlet_price_set(uuid, uuid, uuid, text, numeric, numeric) from public, anon;
grant execute on function public.outlet_price_set(uuid, uuid, uuid, text, numeric, numeric) to authenticated;

-- Riwayat harga outlet ikut tercatat (kind 'outlet')
alter table public.price_history drop constraint if exists price_history_kind_check;
alter table public.price_history add constraint price_history_kind_check check (kind in ('eceran', 'grosir', 'daftar', 'outlet'));
alter table public.price_history add column if not exists branch_id uuid;

create or replace function public.price_history_outlet()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prod text; v_branch text;
begin
  select name into v_prod from products where id = new.product_id;
  select name into v_branch from branches where id = new.branch_id;
  if tg_op = 'UPDATE' and new.price_retail is distinct from old.price_retail then
    insert into price_history(kos_id, product_id, product_name, unit, kind, branch_id, list_name, old_price, new_price, changed_by)
    values (new.kos_id, new.product_id, v_prod, new.unit, 'outlet', new.branch_id, v_branch, old.price_retail, new.price_retail, actor_email());
  elsif tg_op = 'INSERT' and new.price_retail is not null then
    insert into price_history(kos_id, product_id, product_name, unit, kind, branch_id, list_name, old_price, new_price, changed_by)
    values (new.kos_id, new.product_id, v_prod, new.unit, 'outlet', new.branch_id, v_branch, null, new.price_retail, actor_email());
  end if;
  return new;
end $$;
drop trigger if exists outlet_prices_history on public.outlet_prices;
create trigger outlet_prices_history after insert or update on public.outlet_prices
  for each row execute function public.price_history_outlet();

-- 2. Penentu harga dasar untuk satu baris penjualan (dipakai sale_create) ----------------------------
create or replace function public.price_resolve(p_kos uuid, p_contact uuid, p_product uuid, p_unit text, p_tier text, p_base_retail numeric, p_base_wholesale numeric)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v_list uuid; v_li numeric; v_ret numeric := p_base_retail; v_wh numeric := p_base_wholesale; o record;
begin
  -- 1) daftar harga pelanggan yang sedang berlaku
  if p_contact is not null then
    select c.price_list_id into v_list from contacts c where c.id = p_contact and c.kos_id = p_kos;
    if v_list is not null and public.price_list_live(v_list, p_kos) then
      select li.price into v_li from price_list_items li where li.list_id = v_list and li.product_id = p_product and li.unit = p_unit;
      if v_li is not null then return v_li; end if;
    end if;
  end if;
  -- 2) harga outlet (menggantikan harga umum per kolom bila diisi)
  select op.price_retail, op.price_wholesale into o from outlet_prices op where op.branch_id = stock_loc(p_kos) and op.product_id = p_product and op.unit = p_unit;
  if found then
    v_ret := coalesce(o.price_retail, v_ret);
    v_wh := coalesce(o.price_wholesale, v_wh);
  end if;
  -- 3) grosir bila tier grosir dan diisi, lainnya eceran
  return case when p_tier = 'grosir' and coalesce(v_wh, 0) > 0 then v_wh else v_ret end;
end $$;
revoke execute on function public.price_resolve(uuid, uuid, uuid, text, text, numeric, numeric) from public, anon;

-- 3. Patch sale_create: harga baris tanpa harga manual memakai urutan resmi (price_resolve)
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in v_def) = 0 then raise exception 'Patch % tidak menemukan teks: %', p_sig, left(p_old, 80); end if;
  execute replace(v_def, p_old, p_new);
end $$;

select public._prasara_patch('public.sale_create(uuid, uuid, text, jsonb, numeric, text, numeric, uuid, date, text, jsonb)',
  $x$    v_price := coalesce((l->>'price')::numeric, case when p_tier = 'grosir' and u.price_wholesale > 0 then u.price_wholesale else u.price_retail end);$x$,
  $x$    v_price := coalesce((l->>'price')::numeric, price_resolve(p_kos, p_contact, p.id, u.name, p_tier, u.price_retail, u.price_wholesale));$x$);

drop function if exists public._prasara_patch(text, text, text);
