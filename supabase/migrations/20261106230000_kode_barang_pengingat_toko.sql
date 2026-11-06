-- Kode barang (SKU) & barcode per satuan, dan pengingat toko (stok menipis, kasbon/utang jatuh tempo, pesanan terlambat).

-- ---------- SKU & barcode ----------
alter table public.products add column if not exists sku text check (sku is null or length(trim(sku)) between 1 and 40);
alter table public.product_units add column if not exists barcode text check (barcode is null or length(trim(barcode)) between 3 and 40);
create unique index if not exists products_sku_unique on public.products(kos_id, lower(sku)) where sku is not null;
create unique index if not exists product_units_barcode_unique on public.product_units(kos_id, barcode) where barcode is not null;

drop function if exists public.product_save(uuid, uuid, text, text, numeric, numeric, jsonb, numeric);
create or replace function public.product_save(p_kos uuid, p_id uuid, p_name text, p_base text, p_cost numeric, p_min numeric, p_units jsonb,
                                               p_initial_stock numeric default 0, p_sku text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; u jsonb; i int := 0; v_base text := coalesce(nullif(trim(p_base), ''), 'pcs'); v_names text[] := '{}';
        v_sku text := nullif(trim(coalesce(p_sku, '')), ''); v_code text; v_other text;
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if (select business_type from kos where id = p_kos) <> 'retail' then raise exception 'Barang hanya untuk bisnis Retail & Grosir'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Nama barang wajib diisi'; end if;
  if coalesce(p_cost, 0) < 0 or coalesce(p_min, 0) < 0 or coalesce(p_initial_stock, 0) < 0 then raise exception 'Angka tidak boleh minus'; end if;
  if jsonb_typeof(p_units) <> 'array' or jsonb_array_length(p_units) = 0 then raise exception 'Isi minimal satu satuan jual'; end if;
  if jsonb_array_length(p_units) > 6 then raise exception 'Maksimal 6 satuan per barang'; end if;
  if v_sku is not null then
    select name into v_other from products where kos_id = p_kos and lower(sku) = lower(v_sku) and id is distinct from p_id;
    if v_other is not null then raise exception 'Kode barang "%" sudah dipakai %', v_sku, v_other; end if;
  end if;

  if p_id is null then
    insert into products(kos_id, name, base_unit, cost, min_stock, sku) values (p_kos, trim(p_name), v_base, coalesce(p_cost, 0), coalesce(p_min, 0), v_sku) returning id into v_id;
  else
    update products set name = trim(p_name), base_unit = v_base, cost = coalesce(p_cost, 0), min_stock = coalesce(p_min, 0), sku = v_sku
      where id = p_id and kos_id = p_kos returning id into v_id;
    if v_id is null then raise exception 'Barang tidak ditemukan'; end if;
  end if;

  delete from product_units where product_id = v_id;
  for u in select * from jsonb_array_elements(p_units) loop
    if coalesce(trim(u->>'name'), '') = '' then raise exception 'Nama satuan wajib diisi'; end if;
    if lower(trim(u->>'name')) = any(v_names) then raise exception 'Nama satuan "%" dobel', trim(u->>'name'); end if;
    v_names := v_names || lower(trim(u->>'name'));
    if i > 0 and coalesce((u->>'qty')::numeric, 0) <= 1 then raise exception 'Isi satuan "%" harus lebih dari 1 %', trim(u->>'name'), v_base; end if;
    v_code := nullif(trim(coalesce(u->>'barcode', '')), '');
    if v_code is not null then
      select p.name into v_other from product_units pu join products p on p.id = pu.product_id where pu.kos_id = p_kos and pu.barcode = v_code;
      if v_other is not null then raise exception 'Barcode % sudah dipakai %', v_code, v_other; end if;
    end if;
    insert into product_units(product_id, kos_id, name, qty, price_retail, price_wholesale, sort, barcode)
    values (v_id, p_kos, case when i = 0 then v_base else trim(u->>'name') end, case when i = 0 then 1 else (u->>'qty')::numeric end,
            greatest(0, coalesce((u->>'price_retail')::numeric, 0)), greatest(0, coalesce((u->>'price_wholesale')::numeric, 0)), i, v_code);
    i := i + 1;
  end loop;

  if p_id is null and coalesce(p_initial_stock, 0) > 0 then
    update products set stock = p_initial_stock where id = v_id;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, note)
    values (p_kos, v_id, 'awal', p_initial_stock, p_initial_stock, round(p_initial_stock * coalesce(p_cost, 0), 2), 'Stok awal');
  end if;
  return v_id;
end $$;
revoke execute on function public.product_save(uuid, uuid, text, text, numeric, numeric, jsonb, numeric, text) from public, anon;
grant execute on function public.product_save(uuid, uuid, text, text, numeric, numeric, jsonb, numeric, text) to authenticated;

-- ---------- Pengingat toko ----------
-- p_fin: sertakan kasbon & utang (data uang); stok & pesanan selalu disertakan
create or replace function public.retail_alerts_internal(p_kos uuid, p_fin boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  with d as (select (now() at time zone 'Asia/Jakarta')::date as t)
  select jsonb_build_object(
    'habis', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'stock', p.stock, 'unit', p.base_unit) order by p.name), '[]')
              from products p where p.kos_id = p_kos and p.active and p.stock <= 0 and p.min_stock > 0),
    'menipis', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'stock', p.stock, 'min', p.min_stock, 'unit', p.base_unit) order by p.stock / nullif(p.min_stock, 0)), '[]')
              from products p where p.kos_id = p_kos and p.active and p.stock > 0 and p.min_stock > 0 and p.stock <= p.min_stock),
    'pesanan', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'number', b.number, 'supplier', c.name, 'expected', b.expected_date) order by b.expected_date), '[]')
              from purchases b left join contacts c on c.id = b.contact_id, d
              where b.kos_id = p_kos and b.status in ('dipesan', 'sebagian') and b.expected_date is not null and b.expected_date < d.t),
    'kasbon', case when p_fin then (select coalesce(jsonb_agg(x order by x.due), '[]') from (
                select c.id, c.name, c.phone, contact_balance(c.id) as sisa,
                  (select min(s.due_date) from sales s where s.contact_id = c.id and s.pay_method = 'kasbon' and s.status = 'selesai' and s.due_date is not null) as due
                from contacts c where c.kos_id = p_kos and c.kind = 'pelanggan') x, d
              where x.sisa > 0.5 and x.due is not null and x.due <= d.t + 3) else '[]'::jsonb end,
    'utang', case when p_fin then (select coalesce(jsonb_agg(x order by x.due), '[]') from (
                select c.id, c.name, contact_balance(c.id) as sisa,
                  (select min(b.due_date) from purchases b where b.contact_id = c.id and b.pay_method = 'utang' and b.status in ('selesai', 'sebagian') and b.due_date is not null) as due
                from contacts c where c.kos_id = p_kos and c.kind = 'supplier') x, d
              where x.sisa > 0.5 and x.due is not null and x.due <= d.t + 3) else '[]'::jsonb end);
$$;
revoke execute on function public.retail_alerts_internal(uuid, boolean) from public, anon, authenticated;

create or replace function public.retail_alerts(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('stock,finance', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  return retail_alerts_internal(p_kos, member_in('finance', p_kos));
end $$;
revoke execute on function public.retail_alerts(uuid) from public, anon;
grant execute on function public.retail_alerts(uuid) to authenticated;

-- Email pagi untuk pemilik toko (dipakai jadwal otomatis dengan kunci server): hanya toko yang menyalakan email pagi,
-- paket Standar/Pro (termasuk masa coba), dan bila ada hal yang perlu ditindaklanjuti
create or replace function public.retail_alert_batch()
returns table(kos_id uuid, kos_name text, owner_email text, alerts jsonb)
language sql stable security definer set search_path = public, auth as $$
  select k.id, k.name, u.email::text, a.x
  from kos k join auth.users u on u.id = k.owner_id
  cross join lateral (select retail_alerts_internal(k.id, true) as x) a
  where k.business_type = 'retail' and k.daily_digest and k.suspended_at is null and kos_plan(k.id) in ('standar', 'pro')
    and (jsonb_array_length(a.x->'habis') + jsonb_array_length(a.x->'menipis') + jsonb_array_length(a.x->'pesanan')
         + jsonb_array_length(a.x->'kasbon') + jsonb_array_length(a.x->'utang')) > 0
    and not exists (select 1 from digest_log g where g.kos_id = k.id and g.day = (now() at time zone 'Asia/Jakarta')::date);
$$;
revoke execute on function public.retail_alert_batch() from public, anon, authenticated;
grant execute on function public.retail_alert_batch() to service_role;
