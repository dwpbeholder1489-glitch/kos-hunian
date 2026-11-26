-- Proyeksi persediaan per lokasi kerja. Pengiriman belum pasti ditampilkan
-- untuk ditinjau, tanpa menganggap barangnya sudah tersedia.
create function public.reorder_guidance(p_kos uuid, p_cover int default 14)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_cover int := greatest(1, least(coalesce(p_cover, 14), 60));
  v_branch uuid;
  v_main uuid;
  v_result jsonb;
begin
  if not member_in('stock', p_kos) or not module_on(p_kos, 'r_belanja') then
    raise exception 'Tidak punya akses ke Belanja';
  end if;
  if not exists (select 1 from kos where id = p_kos and business_type = 'retail') then
    raise exception 'Saran belanja ini tersedia untuk toko retail';
  end if;
  v_main := branch_main_id(p_kos);
  v_branch := stock_loc(p_kos);

  with demand as (
    select m.product_id, greatest(0, -sum(m.delta)) as qty
    from stock_moves m
    left join sales s on m.kind = 'jual' and s.id = m.ref_id and s.kos_id = m.kos_id
    where m.kos_id = p_kos and coalesce(m.branch_id, v_main) = v_branch
      and m.created_at >= (v_today - 29)::timestamp at time zone 'Asia/Jakarta'
      and m.created_at < (v_today + 1)::timestamp at time zone 'Asia/Jakarta'
      and m.kind in ('jual', 'retur_jual', 'pakai') and s.status is distinct from 'batal'
    group by m.product_id
  ), open_lines as (
    select l.product_id, b.id, b.number, b.expected_date, sum((l.qty-l.qty_received)*l.unit_qty) as qty
    from purchases b
    join purchase_lines l on l.purchase_id = b.id and l.kos_id = b.kos_id
    where b.kos_id = p_kos and coalesce(b.branch_id, v_main) = v_branch
      and b.status in ('dipesan','sebagian') and l.qty > l.qty_received
    group by l.product_id, b.id, b.number, b.expected_date
  ), scheduled as (
    select product_id, expected_date-v_today as day, sum(qty) qty
    from open_lines where expected_date >= v_today group by 1, 2
  ), inbound as (
    select product_id, sum(qty) as ordered,
      coalesce(sum(qty) filter (where expected_date >= v_today), 0) as scheduled_qty,
      coalesce(sum(qty) filter (where expected_date is null or expected_date < v_today), 0) as uncertain_qty,
      jsonb_agg(jsonb_build_object('id',id,'number',number,'date',expected_date,'qty',qty)
        order by expected_date nulls last, number) as orders
    from open_lines group by product_id
  ), basis as (
    select p.id, p.name, p.base_unit, p.cost, coalesce(l.qty, 0) as stock, p.min_stock, p.max_stock,
      stock_reserved_at(p.id, v_branch) as reserved, stock_held_at(p.id, v_branch) as held,
      coalesce(d.qty,0) as used, coalesce(d.qty,0)/30 as rate,
      coalesce(i.ordered,0) as ordered, coalesce(i.scheduled_qty,0) as scheduled_qty,
      coalesce(i.uncertain_qty,0) as uncertain_qty, coalesce(i.orders,'[]'::jsonb) as orders,
      coalesce(pref.contact_id,last.contact_id) as supplier_id, pref.contact_id is not null as preferred,
      coalesce(pref.lead_days,p.lead_days,3) as lead,
      case when pref.lead_days is not null then 'supplier' when p.lead_days is not null then 'barang' else 'default' end as lead_source,
      coalesce(pref.unit,last.unit,p.base_unit) as unit, coalesce(pref.unit_qty,last.unit_qty,1) as unit_qty,
      coalesce(pref.price, case when pref.contact_id is null then last.price end) as unit_price, pref.moq
    from products p
    left join stock_levels l on l.product_id = p.id and l.branch_id = v_branch and l.kos_id = p_kos
    left join demand d on d.product_id = p.id
    left join inbound i on i.product_id = p.id
    left join lateral (
      select si.contact_id, si.unit, u.qty as unit_qty, si.price, si.lead_days, si.moq
      from supplier_items si join product_units u on u.product_id = si.product_id and u.name = si.unit
      join contacts c on c.id = si.contact_id and c.kos_id = p_kos and c.kind = 'supplier' and c.archived_at is null
      where si.kos_id = p_kos and si.product_id = p.id and si.preferred
      order by si.id limit 1
    ) pref on true
    left join lateral (
      select b.contact_id, l.unit, u.qty as unit_qty, case when l.unit_qty = u.qty then l.price end as price
      from purchase_lines l join purchases b on b.id = l.purchase_id and b.kos_id = p_kos
      join contacts c on c.id = b.contact_id and c.kos_id = p_kos and c.kind = 'supplier' and c.archived_at is null
      join product_units u on u.product_id = l.product_id and u.name = l.unit
      where l.product_id = p.id and l.qty_received > 0 and b.status in ('selesai','sebagian')
      order by (coalesce(b.branch_id, v_main) = v_branch) desc, b.purchase_date desc, b.created_at desc, l.id limit 1
    ) last on pref.contact_id is null
    where p.kos_id = p_kos and p.active and not p.is_kit and p.consign_contact_id is null
  ), relevant as (
    select *, stock - reserved - held as available
    from basis
    where (used > 0 or min_stock > 0 or reserved > 0 or stock < 0)
      and stock - reserved - held <= min_stock + rate * (lead + v_cover)
  ), projection as (
    select r.id, g.day, r.available - r.rate * g.day + sum(coalesce(s.qty,0)) over
      (partition by r.id order by g.day rows unbounded preceding) as balance
    from relevant r
    cross join lateral generate_series(0, r.lead + v_cover * 2) g(day)
    left join scheduled s on s.product_id = r.id and s.day = g.day
  ), first_events as (
    select r.id,
      min(p.day) filter (where p.balance < r.min_stock or (r.rate > 0 and p.balance = 0)) as first_gap,
      min(p.day) filter (where p.balance <= 0 and (r.rate > 0 or p.balance < 0)) as first_empty
    from relevant r
    join projection p on p.id = r.id and p.day <= r.lead + v_cover
    group by r.id
  ), dates as (
    select r.*, f.first_gap, f.first_empty, greatest(0, f.first_gap - r.lead - 2) as order_in
    from relevant r
    join first_events f on f.id = r.id
    where f.first_gap is not null
  ), requirements as (
    select d.id, greatest(0, max(d.min_stock - p.balance)) as need
    from dates d
    join projection p on p.id = d.id and p.day between d.order_in + d.lead and d.order_in + d.lead + v_cover
    group by d.id
  ), needs as (
    select d.*, n.need,
      case when d.max_stock is null then null else greatest(0,d.max_stock - greatest(d.stock,0) - d.ordered) end as capacity
    from dates d
    join requirements n on n.id = d.id
  ), sizing as (
    select *,
      case when capacity is null then null else floor(capacity / unit_qty) end as max_units,
      greatest(ceil(need / unit_qty), coalesce(ceil(moq),0)) as desired_units
    from needs
  ), decisions as (
    select *,
      case
        when uncertain_qty > 0 then 'check_eta'
        when need <= 0 then 'expedite'
        when max_units = 0 or (max_units is not null and max_units < coalesce(ceil(moq),0)) then 'check_limit'
        when order_in = 0 then 'order_now'
        else 'schedule'
      end as action
    from sizing
  )
  select jsonb_build_object(
    'location_id', v_branch,
    'location', (select name from branches where id = v_branch and kos_id = p_kos),
    'cover', v_cover, 'history_days', 30, 'safety_days', 2,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'product_id', r.id, 'name', r.name, 'base_unit', r.base_unit, 'stock', r.stock,
      'available', r.available, 'reserved', r.reserved, 'held', r.held, 'used', r.used,
      'min_stock', r.min_stock, 'max_stock', r.max_stock, 'per_day', round(r.rate,3),
      'lead_days', r.lead, 'lead_source', r.lead_source,
      'on_order', r.ordered, 'scheduled_qty', r.scheduled_qty, 'uncertain_qty', r.uncertain_qty, 'orders', r.orders,
      'shortage_date', v_today + r.first_gap, 'stockout_date', v_today + r.first_empty,
      'order_date', v_today + r.order_in, 'action', r.action, 'need', round(r.need,3),
      'unit', r.unit, 'unit_qty', r.unit_qty, 'max_units', r.max_units, 'moq', r.moq,
      'moq_applied', coalesce(ceil(r.moq) > ceil(r.need/r.unit_qty),false),
      'suggest', case when r.action in ('order_now','schedule') then least(r.desired_units, coalesce(r.max_units,r.desired_units)) end,
      'price', coalesce(r.unit_price, round(r.cost*r.unit_qty,2)), 'supplier_id', r.supplier_id,
      'supplier', (select name from contacts where id = r.supplier_id and kos_id = p_kos), 'preferred', r.preferred
    ) order by (r.order_in > 0), r.order_in, r.first_gap, r.name, r.id), '[]'::jsonb)
  ) into v_result
  from decisions r;
  return v_result;
end $$;
revoke execute on function public.reorder_guidance(uuid,int) from public, anon;
grant execute on function public.reorder_guidance(uuid,int) to authenticated;

-- Perbarui jadwal PO yang masih terbuka tanpa mengubah penerimaan atau nilai pembelian.
create function public.purchase_expected_set(p_purchase uuid, p_expected date)
returns date language plpgsql security definer set search_path = public as $$
declare b purchases;
begin
  select * into b from purchases where id = p_purchase for update;
  if b.id is null or not member_in('stock', b.kos_id) or not module_on(b.kos_id,'r_belanja') then
    raise exception 'Pesanan tidak ditemukan atau tidak dapat diakses';
  end if;
  if b.status not in ('dipesan','sebagian') then raise exception 'Jadwal hanya bisa diubah untuk pesanan yang masih terbuka'; end if;
  if p_expected is not null and p_expected < (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Pilih perkiraan kedatangan mulai hari ini';
  end if;
  update purchases set expected_date = p_expected where id = b.id;
  return p_expected;
end $$;
revoke execute on function public.purchase_expected_set(uuid,date) from public, anon;
grant execute on function public.purchase_expected_set(uuid,date) to authenticated;
