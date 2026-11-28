create table public.stock_shopping_lists (
  kos_id uuid not null references public.kos(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  items jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (kos_id, branch_id, user_id)
);
alter table public.stock_shopping_lists enable row level security;
revoke all on public.stock_shopping_lists from public, anon, authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.stock_shopping_lists
  for each row execute function public.kos_open_guard();

create function public.stock_suggestion_branch(p_kos uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('stock', p_kos) or not module_on(p_kos, 'r_belanja')
    or not exists (select 1 from kos where id = p_kos and business_type = 'retail') then
    raise exception 'Tidak punya akses ke Saran Belanja Stok';
  end if;
  return stock_loc(p_kos);
end $$;
revoke execute on function public.stock_suggestion_branch(uuid) from public, anon, authenticated;

create function public.stock_suggestion_data(p_kos uuid, p_days int, p_product uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with scope as materialized (
    select stock_suggestion_branch(p_kos) as branch, branch_main_id(p_kos) as main,
      (now() at time zone 'Asia/Jakarta')::date as today,
      case when p_days in (7, 14, 30, 90) then p_days else 30 end as days
  ), windows as (
    select *, today-days as start_day, (today - interval '1 year')::date as season_end
    from scope
  ), sales_rows as (
    select m.product_id, s.id, s.number, s.sale_date, sum(-m.delta) as qty,
      s.sale_date < w.today - 90 as seasonal
    from windows w
    join sales s on s.kos_id = p_kos and s.status = 'selesai'
      and (s.sale_date between w.today - 90 and w.today - 1 or s.sale_date between w.season_end - w.days and w.season_end - 1)
    join stock_moves m on m.kos_id = p_kos and m.ref_id = s.id and m.kind = 'jual' and m.delta < 0
      and coalesce(m.branch_id, w.main) = w.branch and (p_product is null or m.product_id = p_product)
    group by m.product_id, s.id, s.sale_date, w.today
  ), sold as (
    select r.product_id,
      coalesce(sum(r.qty) filter (where not r.seasonal and r.sale_date >= w.start_day),0) as selected_qty,
      count(distinct r.sale_date) filter (where not r.seasonal and r.sale_date >= w.start_day) as selected_days,
      coalesce(sum(r.qty) filter (where not r.seasonal),0) as recent_qty,
      count(distinct r.sale_date) filter (where not r.seasonal) as recent_days,
      coalesce(sum(r.qty) filter (where r.seasonal),0) as seasonal_qty,
      count(distinct r.sale_date) filter (where r.seasonal) as seasonal_days
    from sales_rows r cross join windows w group by r.product_id
  ), open_rows as (
    select l.product_id, b.id, b.number, b.expected_date as date, round(sum((l.qty-l.qty_received)*l.unit_qty),3) as qty,
      'purchase' as type
    from windows w, purchases b join purchase_lines l on l.purchase_id = b.id and l.kos_id = b.kos_id
    where b.kos_id = p_kos and coalesce(b.branch_id,w.main) = w.branch and b.status in ('dipesan','sebagian')
      and l.qty > l.qty_received and (p_product is null or l.product_id = p_product)
    group by l.product_id,b.id
    union all
    select (x->>'product_id')::uuid, t.id, t.number, null, sum((x->>'qty')::numeric), 'transfer'
    from windows w, stock_transfers t cross join lateral jsonb_array_elements(t.lines) x
    where t.kos_id = p_kos and t.to_branch = w.branch and t.status = 'dikirim'
      and (p_product is null or (x->>'product_id')::uuid = p_product)
    group by 1,t.id
  ), inbound as (
    select product_id,jsonb_agg(to_jsonb(o) - 'product_id' order by date nulls last,number) as items
    from open_rows o where qty > 0 group by product_id
  ), reserved_rows as (
    select l.product_id,o.id,o.number,round(sum((l.qty-l.qty_sent)*l.unit_qty),3) as qty
    from windows w, so_lines l join so_orders o on o.id = l.order_id
    where o.kos_id = p_kos and o.status in ('dikonfirmasi','sebagian') and coalesce(o.branch_id,w.main) = w.branch
      and l.qty > l.qty_sent and (p_product is null or l.product_id = p_product)
    group by l.product_id,o.id
  ), reservations as (
    select product_id,sum(qty) as qty,jsonb_agg(to_jsonb(r) - 'product_id' order by number) as items
    from reserved_rows r group by product_id
  ), rows as (
    select p.id,p.name,p.base_unit,p.category_id,c.name as category,(p.created_at at time zone 'Asia/Jakarta')::date as created,
      coalesce(l.qty,0) as stock,p.min_stock,p.max_stock,stock_held_at(p.id,w.branch) as held,
      coalesce(r.qty,0) as reserved,coalesce(r.items,'[]'::jsonb) as customer_orders,
      coalesce(i.items,'[]'::jsonb) as inbound,coalesce(s.selected_qty,0) as sold,coalesce(s.selected_days,0) as selling_days,
      coalesce(s.recent_qty,0) as sold_90,coalesce(s.recent_days,0) as selling_days_90,
      coalesce(s.seasonal_qty,0) as sold_season,coalesce(s.seasonal_days,0) as selling_days_season,
      supply.contact_id as supplier_id,supply.name as supplier,supply.unit as supplier_unit,
      coalesce(supply.lead_days,p.lead_days,observed.days) as lead,
      case when supply.lead_days is not null then 'supplier'
        when p.lead_days is not null then 'catalog'
        when observed.days is not null then 'receipts' end as lead_source,
      coalesce(observed.samples,'[]'::jsonb) as lead_samples,
      coalesce(replenishments.orders,'[]'::jsonb) as replenishments,
      coalesce(units.options,'[]'::jsonb) as units
    from products p cross join windows w
    left join product_categories c on c.id = p.category_id and c.kos_id = p_kos
    left join stock_levels l on l.product_id = p.id and l.kos_id = p_kos and l.branch_id = w.branch
    left join sold s on s.product_id = p.id
    left join reservations r on r.product_id = p.id
    left join inbound i on i.product_id = p.id
    left join lateral (
      select c.id as contact_id,c.name,choice.unit,choice.lead_days
      from (
        select si.contact_id,si.unit,si.lead_days,case when si.preferred then 0 else 3 end as priority,null::date as date,si.id
        from supplier_items si where si.kos_id = p_kos and si.product_id = p.id
        union all
        select b.contact_id,pl.unit,si.lead_days,case when coalesce(b.branch_id,w.main)=w.branch then 1 else 2 end,b.purchase_date,pl.id
        from purchase_lines pl join purchases b on b.id = pl.purchase_id and b.kos_id = p_kos
        left join supplier_items si on si.product_id=pl.product_id and si.unit=pl.unit and si.contact_id=b.contact_id
        where pl.product_id=p.id and pl.qty_received > 0 and b.status in ('selesai','sebagian')
      ) choice
      join contacts c on c.id=choice.contact_id and c.kos_id=p_kos and c.kind='supplier' and c.archived_at is null
      join product_units u on u.product_id=p.id and u.name=choice.unit
      order by choice.priority,choice.date desc nulls last,(choice.lead_days is null),choice.id limit 1
    ) supply on true
    left join lateral (
      select case when count(*) >= 2 then ceil(avg(h.days))::int end as days,
        jsonb_agg(to_jsonb(h) order by h.received desc) as samples
      from (
        select b.id,b.number,b.purchase_date as ordered,min((receipt.created_at at time zone 'Asia/Jakarta')::date) as received,
          min((receipt.created_at at time zone 'Asia/Jakarta')::date)-b.purchase_date as days
        from purchases b join purchase_receipts receipt on receipt.purchase_id=b.id
        where b.kos_id=p_kos and b.contact_id=supply.contact_id and coalesce(b.branch_id,w.main)=w.branch
          and b.status in ('selesai','sebagian') and b.purchase_date >= w.today-365
          and exists (select 1 from jsonb_array_elements(receipt.lines) x where x->>'product_id'=p.id::text and (x->>'accepted_base')::numeric > 0)
        group by b.id
        order by received desc limit 5
      ) h
    ) observed on supply.contact_id is not null and supply.lead_days is null and p.lead_days is null
    left join lateral (
      select jsonb_agg(to_jsonb(history) order by history.date desc,history.number) as orders
      from (
        select b.id,b.number,b.purchase_date as date,round(sum(pl.qty_received*pl.unit_qty),3) as qty
        from purchase_lines pl join purchases b on b.id=pl.purchase_id and b.kos_id=p_kos
        where pl.product_id=p.id and pl.qty_received>0 and b.status in ('selesai','sebagian')
          and coalesce(b.branch_id,w.main)=w.branch and b.purchase_date >= w.today-180
        group by b.id order by b.purchase_date desc,b.id limit 5
      ) history
    ) replenishments on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('name',u.name,'factor',u.qty,'moq',si.moq,
        'price',coalesce(si.price,last.price,case when p.cost>0 then round(p.cost*u.qty,2) end),
        'price_source',case when si.price is not null then 'supplier' when last.price is not null then 'purchase'
          when p.cost>0 then 'cost' end, 'purchase_id',last.id,'purchase_number',last.number
      ) order by (u.name=supply.unit) desc nulls last,(u.name=p.base_unit) desc,u.sort,u.name) as options
      from product_units u
      left join supplier_items si on si.product_id=p.id and si.contact_id=supply.contact_id and si.unit=u.name
      left join lateral (
        select b.id,b.number,round(pl.line_total / pl.qty_received,2) as price
        from purchase_lines pl join purchases b on b.id=pl.purchase_id and b.kos_id=p_kos
        where pl.product_id=p.id and pl.unit=u.name and pl.unit_qty=u.qty and pl.qty_received>0
          and b.status in ('selesai','sebagian')
        order by (b.contact_id=supply.contact_id) desc nulls last,(coalesce(b.branch_id,w.main)=w.branch) desc,
          b.purchase_date desc,b.created_at desc,pl.id limit 1
      ) last on true
      where u.product_id=p.id
    ) units on true
    where p.kos_id=p_kos and p.active and not p.is_kit and p.consign_contact_id is null and (p_product is null or p.id=p_product)
  )
  select jsonb_build_object(
    'location_id',w.branch,'location',(select name from branches where id=w.branch),'today',w.today,'days',w.days,
    'from',w.start_day,'to',w.today-1,'season_from',w.season_end-w.days,'season_to',w.season_end-1,
    'rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.name,r.id) from rows r),'[]'::jsonb),
    'suppliers',case when p_product is null then (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name,c.id),'[]'::jsonb)
      from contacts c where c.kos_id=p_kos and c.kind='supplier' and c.archived_at is null) end,
    'saved',case when p_product is null then (select jsonb_build_object('items',s.items,'updated_at',s.updated_at)
      from stock_shopping_lists s where s.kos_id=p_kos and s.branch_id=w.branch and s.user_id=auth.uid()) end,
    'sales_sources',case when p_product is not null then (select coalesce(jsonb_agg(to_jsonb(s)-'product_id' order by s.sale_date desc,s.number),'[]'::jsonb) from sales_rows s) end
  ) from windows w;
$$;

create function public.stock_shopping_save(p_kos uuid, p_branch uuid, p_items jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare saved_at timestamptz;
begin
  if stock_suggestion_branch(p_kos) is distinct from p_branch then raise exception 'Lokasi kerja berubah. Muat ulang daftar.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Daftar belanja tidak valid'; end if;
  if jsonb_array_length(p_items)>500 then raise exception 'Daftar belanja maksimal 500 produk'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(id uuid, unit text, qty numeric)
    where x.qty is null or not (x.qty between 0.001 and 9999999) or x.qty <> round(x.qty,3)
      or not exists (select 1 from products p join product_units u on u.product_id=p.id
        where p.id=x.id and p.kos_id=p_kos and p.active and not p.is_kit and p.consign_contact_id is null and u.name=x.unit)
  ) or (select count(distinct x->>'id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Periksa produk, satuan, dan jumlah di daftar belanja';
  end if;
  insert into stock_shopping_lists(kos_id,branch_id,user_id,items)
    values(p_kos,p_branch,auth.uid(),p_items)
    on conflict(kos_id,branch_id,user_id) do update set items=excluded.items,updated_at=now()
    returning updated_at into saved_at;
  return saved_at;
end $$;

create function public.stock_suggestion_order(p_kos uuid,p_branch uuid,p_id uuid,p_supplier uuid,p_lines jsonb,
  p_method text,p_due date default null,p_expected date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if stock_suggestion_branch(p_kos) is distinct from p_branch then raise exception 'Lokasi kerja berubah. Muat ulang daftar.'; end if;
  if p_id is null or p_supplier is null then raise exception 'ID pesanan dan pemasok wajib diisi'; end if;
  perform pg_advisory_xact_lock(hashtextextended('stock-suggestion-order:' || p_id::text,0));
  if not exists (select 1 from purchases where id=p_id and kos_id=p_kos) then
    if not exists (select 1 from contacts where id=p_supplier and kos_id=p_kos and kind='supplier' and archived_at is null) then
      raise exception 'Pilih pemasok aktif';
    end if;
    if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Rincian pesanan tidak valid'; end if;
    if exists (
      select 1 from jsonb_to_recordset(p_lines) as x(product_id uuid,qty numeric,price numeric)
      where x.qty is null or not (x.qty between 0.001 and 9999999) or x.qty <> round(x.qty,3)
        or x.price is null or not (x.price between 0 and 999999999999.99) or x.price <> round(x.price,2)
        or not exists (select 1 from products p where p.id=x.product_id and p.kos_id=p_kos and p.active
          and not p.is_kit and p.consign_contact_id is null)
    ) then raise exception 'Periksa produk, jumlah, dan harga pesanan'; end if;
  end if;
  perform set_config('prasara.branch',p_branch::text,true);
  result := purchase_order_create(p_id,p_kos,null,p_supplier,p_lines,p_method,p_due,null,p_expected);
  if not coalesce((result->>'duplicate')::boolean,false) then
    update stock_shopping_lists s set items=(
      select coalesce(jsonb_agg(x order by ord),'[]'::jsonb) from jsonb_array_elements(s.items) with ordinality as a(x,ord)
      where not exists (select 1 from jsonb_array_elements(p_lines) l
        where l->>'product_id'=x->>'id' and l->>'unit'=x->>'unit' and (l->>'qty')::numeric=(x->>'qty')::numeric)
    ),updated_at=now()
    where s.kos_id=p_kos and s.branch_id=p_branch and s.user_id=auth.uid();
  end if;
  return result;
end $$;

revoke execute on function public.stock_suggestion_data(uuid,int,uuid),public.stock_shopping_save(uuid,uuid,jsonb),
  public.stock_suggestion_order(uuid,uuid,uuid,uuid,jsonb,text,date,date) from public,anon;
grant execute on function public.stock_suggestion_data(uuid,int,uuid),public.stock_shopping_save(uuid,uuid,jsonb),
  public.stock_suggestion_order(uuid,uuid,uuid,uuid,jsonb,text,date,date) to authenticated;
