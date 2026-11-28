alter table public.kos add column purchase_price_alert_pct numeric(8,2)
  check (purchase_price_alert_pct between 0 and 10000);
alter table public.supplier_invoice_lines
  add column unit_discount numeric(14,2) not null default 0 check (unit_discount >= 0);

-- price tetap harga bersih sebelum PPN untuk pencocokan, utang, dan faktur lama.
do $$
declare d text := pg_get_functiondef('public.sinv_save(uuid,uuid,jsonb)'::regprocedure);
begin
  if strpos(d, 'v_price := nullif(x->>') = 0 or strpos(d, 'qty, price, line_total)') = 0 then
    raise exception 'Format penyimpanan faktur berubah';
  end if;
  d := replace(d, 'v_price numeric;', 'v_price numeric; v_discount numeric;');
  d := replace(d, $old$    if v_lines @>$old$, $new$    v_discount := coalesce((x->>'discount')::numeric,0);
    if not (v_price between 0 and 999999999999.99 and v_discount between 0 and v_price)
      or v_price <> round(v_price,2) or v_discount <> round(v_discount,2) then
      raise exception 'Periksa harga dan diskon per satuan untuk %', l.name;
    end if;
    v_price := v_price - v_discount;
    if v_lines @>$new$);
  d := replace(d, $old$'price', v_price);$old$, $new$'price', v_price, 'discount', v_discount);$new$);
  d := replace(d, 'qty, price, line_total)', 'qty, price, line_total, unit_discount)');
  d := replace(d, $old$::numeric, 2)
  from jsonb_array_elements(v_lines)$old$, $new$::numeric, 2), (y->>'discount')::numeric
  from jsonb_array_elements(v_lines)$new$);
  execute d;

  d := pg_get_functiondef('public.sinv_context(uuid)'::regprocedure);
  d := replace(d, $old$'match', case when i.status = 'draf'$old$, $new$'discounts', (select coalesce(jsonb_object_agg(sl.purchase_line_id, sl.unit_discount), '{}'::jsonb)
    from supplier_invoice_lines sl where sl.invoice_id=i.id and sl.unit_discount>0),
    'match', case when i.status = 'draf'$new$);
  execute d;
end $$;

create function public.purchase_price_threshold_set(p_kos uuid,p_percent numeric)
returns numeric language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from kos where id=p_kos and owner_id=auth.uid() and closed_at is null) then
    raise exception 'Hanya pemilik bisnis dapat mengatur batas kenaikan';
  end if;
  if p_percent is not null and (not (p_percent between 0 and 10000) or p_percent<>round(p_percent,2)) then
    raise exception 'Batas kenaikan harus 0–10.000 persen dengan maksimal dua desimal';
  end if;
  update kos set purchase_price_alert_pct=p_percent where id=p_kos;
  return p_percent;
end $$;

-- Agregasi per produk dan faktur, lalu bandingkan pembelian sebelumnya per pemasok.
create function public.purchase_price_comparisons(p_kos uuid,p_product uuid default null)
returns table (product_id uuid, contact_id uuid, invoice_id uuid, purchase_id uuid, supplier_no text,
  invoice_date date, posted_at timestamptz, quantity numeric, net_total numeric, net_price numeric,
  previous_id uuid, previous_purchase uuid, previous_no text, previous_date date, previous_price numeric, is_latest boolean)
language sql stable set search_path=public as $$
  with totals as (
    select pl.product_id,i.contact_id,i.id,i.purchase_id,i.supplier_no,i.invoice_date,i.posted_at,
      sum(il.qty * pl.unit_qty) as qty,sum(il.line_total) as net
    from supplier_invoices i
    join supplier_invoice_lines il on il.invoice_id=i.id and il.kos_id=i.kos_id
    join purchase_lines pl on pl.id=il.purchase_line_id and pl.purchase_id=i.purchase_id
    where i.kos_id=p_kos and i.status='diposting' and (p_product is null or pl.product_id=p_product)
    group by pl.product_id,i.id having sum(il.qty * pl.unit_qty)>0
  ), ordered as (
    select *, lag(id) over history as previous_id,lag(purchase_id) over history as previous_purchase,
      lag(supplier_no) over history as previous_no,lag(invoice_date) over history as previous_date,
      lag(net/qty) over history as previous_price,lead(id) over history is null as is_latest
    from totals
    window history as (partition by product_id,contact_id order by invoice_date,posted_at,id)
  )
  select r.product_id,r.contact_id,r.id,r.purchase_id,r.supplier_no,r.invoice_date,r.posted_at,r.qty,r.net,r.net/r.qty,
    case when r.previous_purchase=r.purchase_id then prior.id else r.previous_id end,
    case when r.previous_purchase=r.purchase_id then prior.purchase_id else r.previous_purchase end,
    case when r.previous_purchase=r.purchase_id then prior.supplier_no else r.previous_no end,
    case when r.previous_purchase=r.purchase_id then prior.invoice_date else r.previous_date end,
    case when r.previous_purchase=r.purchase_id then prior.net/prior.qty else r.previous_price end,
    r.is_latest
  from ordered r
  left join lateral (
    select t.* from totals t
    where r.previous_purchase=r.purchase_id and t.product_id=r.product_id and t.contact_id=r.contact_id
      and t.purchase_id<>r.purchase_id and (t.invoice_date,t.posted_at,t.id)<(r.invoice_date,r.posted_at,r.id)
    order by t.invoice_date desc,t.posted_at desc,t.id desc limit 1
  ) prior on true;
$$;
revoke execute on function public.purchase_price_comparisons(uuid,uuid) from public,anon,authenticated;

create function public.purchase_price_monitor(p_kos uuid,p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare k kos; rows jsonb; count_rows int;
begin
  perform preq_guard(p_kos,'finance');
  select * into k from kos where id=p_kos;
  with page as (
    select p.name,p.base_unit,c.name as supplier,s.*,
      s.net_price-s.previous_price as difference,
      (s.net_price-s.previous_price)*100/nullif(s.previous_price,0) as percent
    from purchase_price_comparisons(p_kos) s
    join products p on p.id=s.product_id join contacts c on c.id=s.contact_id
    order by s.invoice_date desc,s.posted_at desc,s.invoice_id,s.product_id
    offset greatest(coalesce(p_offset,0),0) limit 51
  )
  select count(*),coalesce(jsonb_agg(to_jsonb(page) || jsonb_build_object('alert',
    coalesce(page.net_price > page.previous_price and k.purchase_price_alert_pct is not null
      and (page.previous_price=0 or page.percent>k.purchase_price_alert_pct),false))
    order by invoice_date desc,posted_at desc,invoice_id,product_id),'[]'::jsonb)
  into count_rows,rows from page;
  return jsonb_build_object('items',case when count_rows>50 then rows-50 else rows end,
    'more',count_rows>50,'threshold',k.purchase_price_alert_pct,'owner',k.owner_id=auth.uid());
end $$;

create function public.purchase_price_simulation(p_kos uuid,p_product uuid,p_invoice uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s record;
begin
  perform preq_guard(p_kos,'finance');
  select * into s from purchase_price_comparisons(p_kos,p_product) r where r.invoice_id=p_invoice;
  if not found then raise exception 'Faktur yang diposting tidak ditemukan'; end if;
  return (
    select jsonb_build_object(
      'net_price',s.net_price,'latest',s.is_latest,'active',p.active,
      'tax_rate',case when not p.tax_exempt and k.profile->'tax'->>'aktif'='true'
        then coalesce((k.profile->'tax'->>'rate')::numeric,0) else 0 end,
      'units',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'qty',u.qty,
        'retail',u.price_retail,'wholesale',u.price_wholesale) order by u.sort,u.name),'[]'::jsonb) from product_units u where u.product_id=p.id)
    ) from products p join kos k on k.id=p.kos_id where p.id=p_product and p.kos_id=p_kos
  );
end $$;

create function public.purchase_price_apply(p_kos uuid,p_product uuid,p_invoice uuid,p_unit uuid,p_tier text,
  p_expected numeric,p_factor numeric,p_price numeric)
returns numeric language plpgsql security definer set search_path=public as $$
declare u product_units; current_price numeric; s jsonb;
begin
  if not exists (select 1 from kos where id=p_kos and owner_id=auth.uid() and closed_at is null) then
    raise exception 'Hanya pemilik bisnis dapat menyetujui harga jual baru';
  end if;
  if p_tier is null or p_tier not in ('retail','wholesale') or p_price is null
    or not (p_price>0 and p_price<=999999999999.99) or p_price<>round(p_price,2) then
    raise exception 'Harga jual baru tidak valid';
  end if;
  perform 1 from supplier_invoices where id=p_invoice and kos_id=p_kos and status='diposting' for share;
  s := purchase_price_simulation(p_kos,p_product,p_invoice);
  if not (s->>'latest')::boolean or not (s->>'active')::boolean then
    raise exception 'Gunakan faktur terbaru untuk barang aktif';
  end if;
  select * into u from product_units where id=p_unit and product_id=p_product and kos_id=p_kos for update;
  if not found or u.qty is distinct from p_factor then raise exception 'Satuan berubah. Buka ulang simulasi'; end if;
  current_price := case p_tier when 'retail' then u.price_retail else u.price_wholesale end;
  if current_price=p_price then return current_price; end if;
  if current_price is distinct from p_expected then raise exception 'Harga jual sudah berubah. Buka ulang simulasi'; end if;
  if p_tier='retail' then update product_units set price_retail=p_price where id=u.id;
  else update product_units set price_wholesale=p_price where id=u.id; end if;
  return p_price;
end $$;

revoke execute on function public.purchase_price_threshold_set(uuid,numeric),public.purchase_price_monitor(uuid,int),
  public.purchase_price_simulation(uuid,uuid,uuid),public.purchase_price_apply(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric) from public,anon;
grant execute on function public.purchase_price_threshold_set(uuid,numeric),public.purchase_price_monitor(uuid,int),
  public.purchase_price_simulation(uuid,uuid,uuid),public.purchase_price_apply(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric) to authenticated;
