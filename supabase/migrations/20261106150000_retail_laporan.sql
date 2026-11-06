-- PRASARA Langkah 2 bagian 5: Laporan toko — laba rugi per periode, produk terlaris/paling untung, barang tidak laku.
-- Semua angka dari catatan; diskon transaksi dibagi proporsional ke setiap baris.

create or replace function public.retail_report(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if p_from > p_to then raise exception 'Periode tidak valid'; end if;
  with s as (select * from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to),
  ln as (
    select l.product_id, l.name, l.qty * l.unit_qty as base_qty,
           l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end as omzet,
           l.qty * l.unit_qty * l.cost as hpp, (l.cost = 0) as no_cost
    from sale_lines l join s on s.id = l.sale_id),
  prod as (
    select ln.product_id, max(ln.name) as name, sum(ln.base_qty) as qty, round(sum(ln.omzet), 2) as omzet, round(sum(ln.hpp), 2) as hpp,
           round(sum(ln.omzet) - sum(ln.hpp), 2) as laba, bool_or(ln.no_cost) as no_cost
    from ln group by ln.product_id)
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'trx', (select count(*) from s),
    'omzet', (select coalesce(sum(total), 0) from s),
    'diskon', (select coalesce(sum(discount), 0) from s),
    'hpp', (select coalesce(sum(cost_total), 0) from s),
    'bayar', jsonb_build_object(
      'tunai', (select coalesce(sum(total), 0) from s where pay_method = 'tunai'),
      'transfer', (select coalesce(sum(total), 0) from s where pay_method = 'transfer'),
      'kasbon', (select coalesce(sum(total), 0) from s where pay_method = 'kasbon')),
    'grosir', (select coalesce(sum(total), 0) from s where tier = 'grosir'),
    'biaya', (select coalesce(sum(amount), 0) from expenses where kos_id = p_kos and kind = 'operasional' and date between p_from and p_to),
    'biaya_rinci', (select coalesce(jsonb_agg(row_to_json(b) order by b.total desc), '[]'::jsonb) from (
        select coalesce(c.name, 'Lainnya') as name, sum(e.amount) as total from expenses e left join expense_categories c on c.id = e.category_id
        where e.kos_id = p_kos and e.kind = 'operasional' and e.date between p_from and p_to group by 1) b),
    'belanja_modal', (select coalesce(sum(amount), 0) from expenses where kos_id = p_kos and kind <> 'operasional' and date between p_from and p_to),
    'selisih_stok', (select coalesce(sum(value), 0) from stock_moves where kos_id = p_kos and kind in ('opname', 'rusak', 'kedaluwarsa', 'koreksi')
                       and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'pendapatan_lain', (select coalesce(sum(amount), 0) from cash_entries where kos_id = p_kos and kind = 'pendapatan_lain' and date between p_from and p_to),
    'prive', (select coalesce(sum(amount), 0) from cash_entries where kos_id = p_kos and kind = 'prive' and date between p_from and p_to),
    'setoran_modal', (select coalesce(sum(amount), 0) from cash_entries where kos_id = p_kos and kind = 'setoran_modal' and date between p_from and p_to),
    'belanja', (select coalesce(sum(total), 0) from purchases where kos_id = p_kos and status = 'selesai' and purchase_date between p_from and p_to),
    'harian', (select coalesce(jsonb_agg(row_to_json(h) order by h.d), '[]'::jsonb) from (
        select sale_date as d, sum(total) as omzet, sum(total) - sum(cost_total) as laba, count(*) as trx from s group by sale_date) h),
    'produk', (select coalesce(jsonb_agg(row_to_json(p) order by p.omzet desc), '[]'::jsonb) from prod p),
    'tidak_laku', (select coalesce(jsonb_agg(row_to_json(t) order by t.modal desc), '[]'::jsonb) from (
        select pr.id, pr.name, pr.stock, pr.base_unit, round(pr.stock * pr.cost, 2) as modal,
          (select max(s2.sale_date) from sale_lines l2 join sales s2 on s2.id = l2.sale_id where l2.product_id = pr.id and s2.status = 'selesai') as last_sold
        from products pr where pr.kos_id = p_kos and pr.active and pr.stock > 0
          and not exists (select 1 from ln where ln.product_id = pr.id) limit 30) t)
  ) into r;
  return r;
end $$;
revoke execute on function public.retail_report(uuid, date, date) from public, anon;
grant execute on function public.retail_report(uuid, date, date) to authenticated;

-- Halaman "Bisnis saya": tambahkan angka toko (penjualan & laba kotor bulan ini, kasbon)
create or replace function public.owner_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'Asia/Jakarta')::date as d),
  m as (select date_trunc('month', d)::date as m0, (date_trunc('month', d) + interval '1 month - 1 day')::date as m1, d from t)
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at), '[]'::jsonb) from (
    select k.id, k.name, k.business_type, k.created_at, kos_plan(k.id) as plan,
      (select count(*) from rooms r where r.kos_id = k.id and r.status <> 'tidak_disewakan')::int as rooms,
      (select count(*) from leases l where l.kos_id = k.id and l.status = 'aktif')::int as occupied,
      coalesce((select sum(s.outstanding) from invoice_summary s where s.kos_id = k.id and s.status <> 'batal' and s.outstanding > 0 and s.due_date <= m.d), 0) as outstanding,
      (select count(*) from invoice_summary s where s.kos_id = k.id and s.overdue)::int as overdue,
      (select count(*) from payments p where p.kos_id = k.id and p.status = 'menunggu')::int as pending,
      coalesce((select sum(p.amount) from payments p where p.kos_id = k.id and p.status = 'terverifikasi' and p.paid_at between m.m0 and m.m1), 0)
        + coalesce((select sum(c.amount) from cash_entries c where c.kos_id = k.id and c.kind = 'pendapatan_lain' and c.date between m.m0 and m.m1), 0) as income,
      coalesce((select sum(e.amount) from expenses e where e.kos_id = k.id and e.kind = 'operasional' and e.date between m.m0 and m.m1), 0) as ops,
      coalesce((select sum(s.total) from sales s where s.kos_id = k.id and s.status = 'selesai' and s.sale_date between m.m0 and m.m1), 0) as sales_month,
      coalesce((select sum(s.total - s.cost_total) from sales s where s.kos_id = k.id and s.status = 'selesai' and s.sale_date between m.m0 and m.m1), 0) as gross_month,
      coalesce((select sum(s.total) from sales s where s.kos_id = k.id and s.status = 'selesai' and s.sale_date = m.d), 0) as sales_today,
      coalesce((select sum(s.total) from sales s where s.kos_id = k.id and s.status = 'selesai' and s.pay_method = 'kasbon'), 0)
        - coalesce((select sum(dp.amount) from debt_payments dp where dp.kos_id = k.id and dp.kind = 'piutang' and dp.status = 'selesai'), 0) as kasbon,
      (select count(*) from products p where p.kos_id = k.id and p.active and p.min_stock > 0 and p.stock <= p.min_stock)::int as low_stock
    from kos k cross join m
    where is_member(k.id)
  ) x;
$$;
