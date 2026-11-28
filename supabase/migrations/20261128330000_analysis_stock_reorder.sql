create index stock_moves_sale_ref on public.stock_moves(kos_id, ref_id)
  where kind = 'jual' and delta < 0;

create function public.analysis_stock_reorder(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_from date := v_today - 14;
  v_main uuid;
  v_branch uuid;
  v_result jsonb;
begin
  if not member_in('finance', p_kos) or not member_in('stock', p_kos)
    or not module_on(p_kos, 'r_belanja')
    or not exists (select 1 from kos where id = p_kos and business_type = 'retail') then
    raise exception 'Tidak punya akses ke Saran Belanja Stok';
  end if;
  v_main := branch_main_id(p_kos);
  v_branch := stock_loc(p_kos);

  with sales_history as (
    -- Mutasi jual sudah dalam satuan stok, termasuk komponen dari produk paket.
    select m.product_id, sum(-m.delta) as sold,
      count(distinct s.sale_date) as selling_days
    from sales s
    join stock_moves m on m.ref_id = s.id and m.kos_id = s.kos_id and m.kind = 'jual' and m.delta < 0
    where s.kos_id = p_kos and s.status = 'selesai' and coalesce(m.branch_id, v_main) = v_branch
      and s.sale_date >= v_from and s.sale_date < v_today
    group by m.product_id
  ), open_lines as (
    select l.product_id, b.id, b.number, b.expected_date,
      round(sum((l.qty - l.qty_received) * l.unit_qty), 3) as qty
    from purchases b
    join purchase_lines l on l.purchase_id = b.id and l.kos_id = b.kos_id
    where b.kos_id = p_kos and coalesce(b.branch_id, v_main) = v_branch
      and b.status in ('dipesan', 'sebagian') and l.qty > l.qty_received
    group by l.product_id, b.id
  ), orders as (
    select product_id,
      coalesce(sum(qty) filter (where expected_date is null or expected_date < v_today), 0) as uncertain,
      jsonb_agg(jsonb_build_object('id', id, 'number', number, 'date', expected_date, 'qty', qty)
        order by expected_date nulls last, number) as details
    from open_lines where qty > 0 group by product_id
  ), basis as (
    select p.id, p.name, p.base_unit, p.created_at,
      coalesce(l.qty, 0) as stock, stock_reserved_at(p.id, v_branch) as reserved, stock_held_at(p.id, v_branch) as held,
      coalesce(h.sold, 0) as sold, coalesce(h.selling_days, 0) as selling_days,
      coalesce(o.uncertain, 0) as uncertain, coalesce(o.details, '[]'::jsonb) as orders,
      supplier.contact_id, supplier.name as supplier, coalesce(supplier.unit, default_unit.name, p.base_unit) as unit, supplier.price,
      coalesce(supplier.lead_days, p.lead_days) as lead,
      case when supplier.lead_days is not null then 'pemasok' when p.lead_days is not null then 'barang' end as lead_source
    from products p
    left join stock_levels l on l.product_id = p.id and l.kos_id = p_kos and l.branch_id = v_branch
    left join sales_history h on h.product_id = p.id
    left join orders o on o.product_id = p.id
    left join lateral (
      select c.id as contact_id, c.name, choice.unit, choice.price, choice.lead_days
      from (
        select si.contact_id, si.unit, si.price, si.lead_days,
          case when si.preferred then 0 when si.lead_days is not null then 3 else 4 end as priority,
          null::date as purchase_date,
          null::timestamptz as created_at, si.id
        from supplier_items si
        where si.kos_id = p_kos and si.product_id = p.id
        union all
        select b.contact_id, pl.unit, case when pl.unit_qty = u.qty then pl.price end,
          si.lead_days, case when coalesce(b.branch_id, v_main) = v_branch then 1 else 2 end,
          b.purchase_date, b.created_at, pl.id
        from purchase_lines pl join purchases b on b.id = pl.purchase_id and b.kos_id = p_kos
        join product_units u on u.product_id = pl.product_id and u.name = pl.unit
        left join supplier_items si on si.product_id = pl.product_id and si.contact_id = b.contact_id and si.unit = pl.unit
        where pl.product_id = p.id and pl.qty_received > 0 and b.status in ('selesai', 'sebagian')
      ) choice
      join contacts c on c.id = choice.contact_id and c.kos_id = p_kos and c.kind = 'supplier' and c.archived_at is null
      join product_units u on u.product_id = p.id and u.name = choice.unit
      order by choice.priority, choice.purchase_date desc, choice.created_at desc, choice.id limit 1
    ) supplier on true
    left join lateral (
      select u.name from product_units u where u.product_id = p.id
      order by (u.name = p.base_unit) desc, u.sort, u.name limit 1
    ) default_unit on supplier.unit is null
    where p.kos_id = p_kos and p.active and not p.is_kit and p.consign_contact_id is null
  ), inputs as (
    select *, stock - reserved - held as available,
      created_at <= v_from::timestamp at time zone 'Asia/Jakarta' and selling_days >= 2 as history_ready
    from basis
  ), events as (
    select r.id, r.available, r.sold, event.day, sum(event.qty) as arrival
    from inputs r
    cross join lateral (
      select 0 as day, 0::numeric as qty
      union all select r.lead, 0
      union all
      select o.expected_date - v_today, o.qty from open_lines o
      where o.product_id = r.id and o.expected_date between v_today and v_today + r.lead
    ) event
    where r.history_ready and r.lead is not null and r.available * 14 <= r.sold * r.lead
    group by r.id, r.available, r.sold, event.day
  ), balances as (
    -- Bandingkan dalam kelipatan 14 agar batas tepat hari kirim tidak meleset karena pembulatan rata-rata.
    select *, available * 14 - sold * day + sum(arrival * 14) over (partition by id order by day) as after_arrival
    from events
  ), gaps as (
    select id, bool_or(after_arrival <= 0 or (day > 0 and after_arrival - arrival * 14 < 0)) as runs_out,
      (array_agg(after_arrival order by day desc))[1] / 14 as balance_on_arrival
    from balances group by id
  ), results as (
    select r.*, g.balance_on_arrival, case
      when not history_ready then 'history'
      when lead is null then 'lead'
      when g.runs_out and uncertain > 0 then 'eta'
      when g.runs_out then 'order'
    end as reason
    from inputs r left join gaps g on g.id = r.id
  )
  select jsonb_build_object('from', v_from, 'to', v_today - 1, 'as_of', v_today,
    'location', (select name from branches where id = v_branch and kos_id = p_kos),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'base_unit', base_unit, 'stock', stock, 'reserved', reserved, 'held', held,
      'available', available, 'sold', sold, 'selling_days', selling_days, 'history_ready', history_ready,
      'per_day', sold / 14, 'days_left', case when sold > 0 then greatest(available,0) * 14 / sold end,
      'lead', lead, 'lead_source', lead_source, 'lead_date', v_today + lead, 'balance_on_arrival', balance_on_arrival, 'orders', orders, 'reason', reason,
      'supplier_id', contact_id, 'supplier', supplier, 'unit', coalesce(unit, base_unit), 'price', price
    ) order by (reason <> 'order'), (greatest(available,0) * 14 / nullif(sold,0)), name, id)
    filter (where reason is not null), '[]'::jsonb)) into v_result
  from results;
  return v_result;
end $$;

revoke execute on function public.analysis_stock_reorder(uuid) from public, anon;
grant execute on function public.analysis_stock_reorder(uuid) to authenticated;
