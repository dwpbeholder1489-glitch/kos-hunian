alter table public.products
  add column if not exists packaging_aliases text[] not null default '{}',
  add constraint products_packaging_aliases_count check (cardinality(packaging_aliases) <= 10);

-- Simpan nama alternatif bersama barang dalam transaksi yang sama.
-- kasir_catalog sudah memuat kolom produk melalui to_jsonb(p).
create function public.product_save_with_packaging(
  p_kos uuid, p_id uuid, p_name text, p_base text, p_cost numeric, p_min numeric, p_units jsonb,
  p_initial_stock numeric, p_sku text, p_density numeric, p_packaging_aliases text[]
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  result_id uuid;
  aliases text[];
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if not exists (select 1 from kos where id = p_kos and business_type = 'retail') then
    raise exception 'Nama kemasan tersedia untuk toko retail';
  end if;
  if cardinality(p_packaging_aliases) > 10 or exists (
    select 1 from unnest(p_packaging_aliases) as alias where length(trim(alias)) > 100
  ) then
    raise exception 'Gunakan maksimal 10 nama kemasan, masing-masing hingga 100 karakter';
  end if;
  select coalesce(array_agg(distinct trim(alias) order by trim(alias)), '{}'::text[])
  into aliases
  from unnest(p_packaging_aliases) as alias
  where nullif(trim(alias), '') is not null;

  result_id := product_save(p_kos, p_id, p_name, p_base, p_cost, p_min, p_units, p_initial_stock, p_sku, p_density);
  update products set packaging_aliases = aliases where id = result_id and kos_id = p_kos;
  return result_id;
end $$;
revoke execute on function public.product_save_with_packaging(uuid,uuid,text,text,numeric,numeric,jsonb,numeric,text,numeric,text[]) from public, anon;
grant execute on function public.product_save_with_packaging(uuid,uuid,text,text,numeric,numeric,jsonb,numeric,text,numeric,text[]) to authenticated;
