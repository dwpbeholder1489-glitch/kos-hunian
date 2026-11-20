-- Tahap 1 Tata kelola harga & kredit (bagian 5, pendukung layar Kasir): angka di keranjang = angka yang ditagih server.
-- kasir_catalog mengirim harga outlet (lokasi kerja), daftar harga pelanggan yang sedang berlaku, batas diskon;
-- promo_preview menerima pelanggan agar pratinjau memakai urutan harga resmi (price_resolve).

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in v_def) = 0 then raise exception 'Patch % tidak menemukan teks: %', p_sig, left(p_old, 80); end if;
  execute replace(v_def, p_old, p_new);
end $$;

-- 1. kasir_catalog: harga satuan mengikuti harga outlet; pelanggan membawa daftar harga yang berlaku; isi daftar harga; batas diskon
select public._prasara_patch('public.kasir_catalog(uuid)',
  $x$'units', (select coalesce(jsonb_agg(to_jsonb(u)), '[]') from product_units u where u.kos_id = p_kos),$x$,
  $x$'units', (select coalesce(jsonb_agg(to_jsonb(u) || coalesce((select jsonb_strip_nulls(jsonb_build_object('price_retail', o.price_retail, 'price_wholesale', o.price_wholesale)) || jsonb_build_object('outlet', true)
       from outlet_prices o where o.branch_id = stock_loc(p_kos) and o.product_id = u.product_id and o.unit = u.name), '{}'::jsonb)), '[]') from product_units u where u.kos_id = p_kos),
    'list_items', (select coalesce(jsonb_agg(jsonb_build_object('list_id', li.list_id, 'product_id', li.product_id, 'unit', li.unit, 'price', li.price)), '[]')
       from price_list_items li join price_lists pl on pl.id = li.list_id
       where li.kos_id = p_kos and public.price_list_live(pl.id, p_kos) and exists (select 1 from contacts c where c.price_list_id = pl.id and c.kos_id = p_kos)),
    'price_policy', (select coalesce(profile -> 'price_policy', '{}'::jsonb) from kos where id = p_kos),$x$);
select public._prasara_patch('public.kasir_catalog(uuid)',
  $x$jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone)$x$,
  $x$jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'tipe', c.tipe,
       'price_list_id', case when c.price_list_id is not null and public.price_list_live(c.price_list_id, p_kos) then c.price_list_id end,
       'price_list', (select pl.name from price_lists pl where pl.id = c.price_list_id and public.price_list_live(pl.id, p_kos)))$x$);

-- 2. promo_preview + pelanggan (parameter baru di akhir, bawaan kosong → pemanggil lama tetap jalan)
drop function if exists public.promo_preview(uuid, text, jsonb);
create or replace function public.promo_preview(p_kos uuid, p_tier text, p_lines jsonb, p_contact uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l jsonb; u product_units; v jsonb := '[]'; v_sub numeric := 0; v_price numeric; r jsonb;
begin
  if not member_in('sell', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if jsonb_typeof(coalesce(p_lines, '[]')) <> 'array' then raise exception 'Keranjang tidak valid'; end if;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    select pu.* into u from product_units pu join products p on p.id = pu.product_id where p.kos_id = p_kos and pu.product_id = (l->>'product_id')::uuid and pu.name = l->>'unit';
    if u.id is null then continue; end if;
    v_price := coalesce((l->>'price')::numeric, price_resolve(p_kos, p_contact, u.product_id, u.name, p_tier, u.price_retail, u.price_wholesale));
    if (l->>'price') is null then v_price := least(v_price, coalesce(price_break(u.product_id, u.name, p_tier, (l->>'qty')::numeric), v_price)); end if;
    v := v || jsonb_build_object('product_id', u.product_id, 'unit', u.name, 'qty', (l->>'qty')::numeric, 'price', v_price, 'manual', (l->>'price') is not null);
    v_sub := v_sub + round((l->>'qty')::numeric * v_price, 2);
  end loop;
  r := promo_calc(p_kos, p_tier, (now() at time zone 'Asia/Jakarta')::date, v);
  return r || jsonb_build_object('subtotal', v_sub, 'lines', v);
end $$;
revoke execute on function public.promo_preview(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.promo_preview(uuid, text, jsonb, uuid) to authenticated;

drop function if exists public._prasara_patch(text, text, text);
