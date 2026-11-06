-- Tombol barang cepat di Kasir (favorit) dan kode barang otomatis untuk label barcode buatan sendiri.
alter table public.products add column if not exists favorite boolean not null default false;

create or replace function public.product_set_favorite(p_product uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_kos uuid;
begin
  select kos_id into v_kos from products where id = p_product;
  if v_kos is null or not member_in('stock', v_kos) then raise exception 'Barang tidak ditemukan'; end if;
  if p_on and (select count(*) from products where kos_id = v_kos and favorite and id <> p_product) >= 24 then
    raise exception 'Maksimal 24 barang cepat. Lepas tanda bintang barang lain dulu.';
  end if;
  update products set favorite = p_on where id = p_product;
end $$;

-- Beri kode otomatis (B0001, B0002, ...) untuk barang aktif yang belum punya kode
create or replace function public.product_auto_codes(p_kos uuid, p_products uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_next int;
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  perform pg_advisory_xact_lock(hashtext('sku:' || p_kos::text));
  select coalesce(max(substring(sku from '^B(\d{4,})$')::int), 0) + 1 into v_next from products where kos_id = p_kos and sku ~ '^B\d{4,}$';
  for r in select id from products where kos_id = p_kos and active and sku is null and (p_products is null or id = any(p_products)) order by name loop
    update products set sku = 'B' || lpad(v_next::text, 4, '0') where id = r.id;
    v_next := v_next + 1; n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.product_set_favorite(uuid, boolean), public.product_auto_codes(uuid, uuid[]) from public, anon;
grant execute on function public.product_set_favorite(uuid, boolean), public.product_auto_codes(uuid, uuid[]) to authenticated;
