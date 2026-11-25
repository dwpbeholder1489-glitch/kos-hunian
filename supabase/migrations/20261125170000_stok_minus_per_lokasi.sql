-- Stok fisik minus dibaca dari saldo masing-masing lokasi, bukan total produk.
create index if not exists stock_levels_negative
  on public.stock_levels(kos_id, qty) where qty < 0;

create function public.retail_negative_stock(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('stock,finance', p_kos) then
    raise exception 'Tidak punya akses ke bisnis ini';
  end if;
  if not exists (select 1 from kos where id = p_kos and business_type = 'retail') then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'product_name', p.name, 'product_active', p.active,
      'branch_id', b.id, 'branch_name', b.name, 'branch_active', b.active,
      'qty', l.qty, 'unit', p.base_unit, 'total_stock', p.stock
    ) order by l.qty, b.name, p.name, p.id, b.id), '[]'::jsonb)
    from stock_levels l
    join products p on p.id = l.product_id and p.kos_id = l.kos_id
    join branches b on b.id = l.branch_id and b.kos_id = l.kos_id
    where l.kos_id = p_kos and l.qty < 0 and not p.is_kit
  );
end $$;

revoke execute on function public.retail_negative_stock(uuid) from public, anon;
grant execute on function public.retail_negative_stock(uuid) to authenticated;

-- Pengingat dan lonceng memakai sumber yang sama dengan dashboard dan Barang & stok.
do $$
declare
  v_sql text := pg_get_functiondef('public.retail_alerts(uuid)'::regprocedure);
  v_old text := $anchor$return retail_alerts_internal(p_kos, member_in('finance', p_kos))$anchor$;
begin
  if strpos(v_sql, v_old) = 0 then raise exception 'Tidak menemukan sumber Pengingat toko'; end if;
  execute replace(v_sql, v_old, v_old || $patch$
    || jsonb_build_object('stok_minus', retail_negative_stock(p_kos))$patch$);
end $$;
