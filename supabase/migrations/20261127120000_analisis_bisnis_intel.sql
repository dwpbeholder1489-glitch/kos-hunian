-- Analisis Bisnis (Business Intelligence Center) — rentang tanggal bebas, pembanding, cabang & kategori.
-- TANPA tabel baru: semua angka dari sumber yang sudah dipakai laporan lain:
--   • uang (pendapatan/HPP/biaya)  = jurnal acct_lines (sama dengan Pembukuan & biz_analysis), lokasi lewat acct_line_branch
--   • jumlah transaksi             = sales selesai + svc_orders selesai + payments terverifikasi (sama dengan biz_month_figures)
--   • arus kas                     = baris akun Kas+Bank per jurnal; jurnal yang neto 0 (pindah kas↔bank) tidak dihitung
--                                    (sama dengan total masuk/keluar acct_cashflow)
--   • perputaran persediaan        = rumus retail_kpi (HPP nota ÷ rata-rata nilai kartu stok milik toko)
--   • piutang lewat tempo          = tagihan sewa terbit belum lunas (kos) / receivable_open_core (kasbon toko)
-- Tingkat paket (fitur lama analisis_lanjutan / analisis_mendalam):
--   Dasar      : periode di dalam bulan ini & bulan lalu; ringkasan, tren 2 bulan, arus kas ringkas, posisi, piutang lewat tempo
--   Lanjutan   : periode bebas (≤ 400 hari, mulai ≤ 24 bulan lalu); + tren 12 bulan, per akun, produk/layanan, pelanggan, persediaan
--   Mendalam   : + filter cabang, perbandingan cabang, peta jam ramai (heatmap)

create or replace function public.biz_figures(p_kos uuid, p_from date, p_to date, p_grain text, p_branch uuid)
returns table(b date, pendapatan numeric, hpp numeric, biaya numeric, transaksi bigint, pelanggan bigint)
language sql stable security definer set search_path = public as $$
  with j as (
    select case when p_grain = 'all' then p_from else date_trunc(p_grain, e.entry_date)::date end as b,
           -sum(l.debit - l.credit) filter (where a.type = 'pendapatan') as pendapatan,
           sum(l.debit - l.credit) filter (where a.sys_key = 'hpp') as hpp,
           sum(l.debit - l.credit) filter (where a.type = 'beban' and coalesce(a.sys_key, '') <> 'hpp') as biaya
    from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
    where l.kos_id = p_kos and e.entry_date between p_from and p_to and a.type in ('pendapatan', 'beban')
      and (p_branch is null or acct_line_branch(l.source_type, l.source_id) = p_branch)
    group by 1),
  t as (
    select s.sale_date as d, 'k' || s.contact_id::text as c
    from sales s where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between p_from and p_to and (p_branch is null or s.branch_id = p_branch)
    union all
    select o.completed_date, 'k' || o.contact_id::text
    from svc_orders o where p_branch is null and o.kos_id = p_kos and o.status = 'selesai' and o.completed_date between p_from and p_to
    union all
    select p.paid_at, 'o' || i.occupant_id::text
    from payments p left join invoices i on i.id = p.invoice_id
    where p_branch is null and p.kos_id = p_kos and p.status = 'terverifikasi' and p.paid_at between p_from and p_to),
  tt as (select case when p_grain = 'all' then p_from else date_trunc(p_grain, d)::date end as b, count(*) as n, count(distinct c) as pc from t group by 1)
  select coalesce(j.b, tt.b), round(coalesce(j.pendapatan, 0), 2), round(coalesce(j.hpp, 0), 2), round(coalesce(j.biaya, 0), 2),
         coalesce(tt.n, 0)::bigint, coalesce(tt.pc, 0)::bigint
  from j full join tt on tt.b = j.b;
$$;
revoke execute on function public.biz_figures(uuid, date, date, text, uuid) from public, anon, authenticated;

-- Satu baris ringkas (bukan per bucket) sebagai jsonb
create or replace function public.biz_figures_total(p_kos uuid, p_from date, p_to date, p_branch uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('pendapatan', f.pendapatan, 'hpp', f.hpp, 'biaya', f.biaya,
            'laba', round(f.pendapatan - f.hpp - f.biaya, 2), 'transaksi', f.transaksi, 'pelanggan', f.pelanggan)
          from biz_figures(p_kos, p_from, p_to, 'all', p_branch) f limit 1),
         jsonb_build_object('pendapatan', 0, 'hpp', 0, 'biaya', 0, 'laba', 0, 'transaksi', 0, 'pelanggan', 0));
$$;
revoke execute on function public.biz_figures_total(uuid, date, date, uuid) from public, anon, authenticated;

-- Segmentasi pelanggan (kontak yang bertransaksi di Kasir/Pesanan jasa) untuk satu periode:
--   baru = transaksi pertamanya di periode ini; setia = aktif di periode & ≥ 3 transaksi dalam 180 hari s.d. akhir periode;
--   kadang = aktif selain itu; tidak_aktif = bertransaksi dalam 180 hari sebelum akhir periode tetapi tidak di periode ini.
create or replace function public.biz_customer_rows(p_kos uuid, p_from date, p_to date, p_branch uuid)
returns table(contact_id uuid, seg text, n_now bigint, v_now numeric, last_d date)
language sql stable security definer set search_path = public as $$
  with tx as (
    select s.contact_id as c, s.sale_date as d, s.total - s.tax_amount as v
    from sales s where s.kos_id = p_kos and s.status = 'selesai' and s.contact_id is not null and s.sale_date <= p_to
      and (p_branch is null or s.branch_id = p_branch)
    union all
    select o.contact_id, o.completed_date, o.total
    from svc_orders o where p_branch is null and o.kos_id = p_kos and o.status = 'selesai' and o.contact_id is not null and o.completed_date <= p_to),
  per as (
    select c, count(*) filter (where d between p_from and p_to) as n_now, coalesce(sum(v) filter (where d between p_from and p_to), 0) as v_now,
           min(d) as first_d, max(d) as last_d, count(*) filter (where d between p_to - 179 and p_to) as n180
    from tx group by c)
  select c, case when n_now > 0 and first_d >= p_from then 'baru' when n_now > 0 and n180 >= 3 then 'setia' when n_now > 0 then 'kadang'
                 when last_d >= p_to - 179 then 'tidak_aktif' end, n_now, round(v_now, 2), last_d
  from per where n_now > 0 or last_d >= p_to - 179;
$$;
revoke execute on function public.biz_customer_rows(uuid, date, date, uuid) from public, anon, authenticated;

create or replace function public.biz_intel(p_kos uuid, p_from date, p_to date, p_cmp_from date default null, p_cmp_to date default null,
                                            p_branch uuid default null, p_category uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_level text; v_type text; v_tpl text; v_floor date; v_res jsonb; v_multi boolean; v_cmp_ok boolean := true;
  v_m1 date; v_tfrom date; v_n int; v_open numeric; v_close numeric; v_grain text; v_cat_name text; v_branch_name text;
  v_inv_from date; v_hm_from date;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Periode tidak valid'; end if;
  if p_from > v_today then raise exception 'Periode belum berjalan'; end if;
  if p_to - p_from > 400 then raise exception 'Periode maksimal sekitar 1 tahun (400 hari)'; end if;
  if (p_cmp_from is null) <> (p_cmp_to is null) or p_cmp_to < p_cmp_from or p_cmp_to - p_cmp_from > 400 then
    raise exception 'Periode pembanding tidak valid'; end if;
  perform acct_sync_internal(p_kos);
  v_level := case when plan_has(p_kos, 'analisis_mendalam') then 'mendalam' when plan_has(p_kos, 'analisis_lanjutan') then 'lanjutan' else 'dasar' end;
  select business_type, template_code into v_type, v_tpl from kos where id = p_kos;

  -- Batas paket ditegakkan di server
  v_floor := (date_trunc('month', v_today) - interval '1 month')::date;
  if v_level = 'dasar' and p_from < v_floor then
    raise exception 'BATAS_PAKET: Paket Dasar menampilkan bulan ini dan bulan lalu. Periode lebih panjang tersedia mulai Paket Bisnis.'; end if;
  if v_level <> 'dasar' and p_from < (date_trunc('month', v_today) - interval '24 month')::date then
    raise exception 'Periode paling awal 24 bulan ke belakang'; end if;
  if v_level = 'dasar' and p_cmp_from is not null and p_cmp_from < v_floor then v_cmp_ok := false; end if;
  if p_branch is not null then
    if v_level <> 'mendalam' then raise exception 'BATAS_PAKET: Analisis per cabang tersedia di Paket Pro.'; end if;
    select name into v_branch_name from branches where id = p_branch and kos_id = p_kos;
    if v_branch_name is null then raise exception 'Lokasi tidak ditemukan'; end if;
  end if;
  if p_category is not null then
    if v_level = 'dasar' then raise exception 'BATAS_PAKET: Analisis produk tersedia mulai Paket Bisnis.'; end if;
    select name into v_cat_name from product_categories where id = p_category and kos_id = p_kos;
    if v_cat_name is null then raise exception 'Kategori tidak ditemukan'; end if;
  end if;
  v_multi := (select count(*) from branches where kos_id = p_kos and active) > 1;

  v_res := jsonb_build_object('level', v_level, 'jenis', v_type, 'template', v_tpl, 'from', p_from, 'to', p_to,
    'hari_ini', v_today, 'cmp_from', case when v_cmp_ok then p_cmp_from end, 'cmp_to', case when v_cmp_ok then p_cmp_to end,
    'cmp_terkunci', not v_cmp_ok, 'branch', p_branch, 'branch_name', v_branch_name, 'category', p_category, 'category_name', v_cat_name,
    'multi_lokasi', v_multi,
    'cur', biz_figures_total(p_kos, p_from, p_to, p_branch),
    'cmp', case when v_cmp_ok and p_cmp_from is not null then biz_figures_total(p_kos, p_cmp_from, p_cmp_to, p_branch) end,
    'lokasi', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'gudang', kind = 'gudang') order by is_main desc, name), '[]')
               from branches where kos_id = p_kos and active));

  -- Tren bulanan s.d. bulan akhir periode (Dasar 2 bulan, lainnya 12 bulan)
  v_m1 := date_trunc('month', p_to)::date;
  v_n := case when v_level = 'dasar' then 2 else 12 end;
  v_tfrom := (v_m1 - make_interval(months => v_n - 1))::date;
  v_res := v_res || jsonb_build_object('tren', (
    select coalesce(jsonb_agg(jsonb_build_object('mulai', m.b::date, 'pendapatan', coalesce(f.pendapatan, 0), 'hpp', coalesce(f.hpp, 0),
             'biaya', coalesce(f.biaya, 0), 'transaksi', coalesce(f.transaksi, 0), 'pelanggan', coalesce(f.pelanggan, 0)) order by m.b), '[]')
    from generate_series(v_tfrom, v_m1, interval '1 month') m(b)
    left join biz_figures(p_kos, v_tfrom, (v_m1 + interval '1 month - 1 day')::date, 'month', p_branch) f on f.b = m.b::date));
  -- Harian di dalam periode (periode ≤ 92 hari)
  if p_to - p_from <= 92 then
    v_res := v_res || jsonb_build_object('harian', (
      select coalesce(jsonb_agg(jsonb_build_object('mulai', g.d::date, 'pendapatan', coalesce(f.pendapatan, 0), 'hpp', coalesce(f.hpp, 0),
               'biaya', coalesce(f.biaya, 0), 'transaksi', coalesce(f.transaksi, 0), 'pelanggan', coalesce(f.pelanggan, 0)) order by g.d), '[]')
      from generate_series(p_from, p_to, interval '1 day') g(d)
      left join biz_figures(p_kos, p_from, p_to, 'day', p_branch) f on f.b = g.d::date));
  end if;

  -- Arus kas (seluruh bisnis; kas tidak dipisah per cabang). Pekan = 7 hari dihitung dari tanggal awal periode.
  v_grain := case when p_to - p_from <= 62 then 'week' else 'month' end;
  select coalesce(sum(l.debit - l.credit) filter (where e.entry_date < p_from), 0), coalesce(sum(l.debit - l.credit) filter (where e.entry_date <= p_to), 0)
    into v_open, v_close
  from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
  where l.kos_id = p_kos and a.sys_key in ('kas', 'bank');
  v_res := v_res || jsonb_build_object('kas', (
    with ent as (
      select e.entry_date as d, sum(l.debit - l.credit) as k
      from acct_entries e join acct_lines l on l.entry_id = e.id join acct_accounts a on a.id = l.account_id
      where e.kos_id = p_kos and e.entry_date between p_from and p_to and a.sys_key in ('kas', 'bank')
      group by e.id, e.entry_date having sum(l.debit - l.credit) <> 0),
    bk as (
      select case when v_grain = 'week' then p_from + ((d - p_from) / 7) * 7 else date_trunc('month', d)::date end as b,
             coalesce(sum(k) filter (where k > 0), 0) as masuk, coalesce(-sum(k) filter (where k < 0), 0) as keluar
      from ent group by 1),
    slots as (
      select case when v_grain = 'week' then (p_from + (i * 7))::date else (date_trunc('month', p_from) + make_interval(months => i))::date end as b
      from generate_series(0, case when v_grain = 'week' then (p_to - p_from) / 7
                                   else ((extract(year from p_to) - extract(year from p_from)) * 12 + extract(month from p_to) - extract(month from p_from))::int end) i)
    select jsonb_build_object('grain', v_grain, 'saldo_awal', round(v_open, 2), 'saldo_akhir', round(v_close, 2),
      'masuk', round((select coalesce(sum(masuk), 0) from bk), 2), 'keluar', round((select coalesce(sum(keluar), 0) from bk), 2),
      'cocok', round(v_open + (select coalesce(sum(masuk) - sum(keluar), 0) from bk), 2) = round(v_close, 2),
      'buckets', (select coalesce(jsonb_agg(jsonb_build_object('mulai', s.b,
                    'selesai', least(p_to, case when v_grain = 'week' then s.b + 6 else (s.b + interval '1 month - 1 day')::date end),
                    'masuk', round(coalesce(bk.masuk, 0), 2), 'keluar', round(coalesce(bk.keluar, 0), 2)) order by s.b), '[]')
                  from slots s left join bk on bk.b = s.b))));

  -- Posisi keuangan per akhir periode (dari saldo jurnal) + rata-rata kas keluar 90 hari terakhir s.d. akhir periode
  v_res := v_res || jsonb_build_object('posisi', (
    select jsonb_build_object('per', p_to,
      'kas', round(coalesce(sum(l.debit - l.credit) filter (where a.sys_key in ('kas', 'bank')), 0), 2),
      'piutang', round(coalesce(sum(l.debit - l.credit) filter (where a.type = 'aset' and a.sys_key like 'piutang%'), 0), 2),
      'persediaan', round(coalesce(sum(l.debit - l.credit) filter (where a.sys_key = 'persediaan'), 0), 2),
      'kewajiban', round(coalesce(-sum(l.debit - l.credit) filter (where a.type = 'kewajiban'), 0), 2),
      'kas_keluar_90', (select round(coalesce(-sum(k) filter (where k < 0), 0), 2) from (
          select sum(l2.debit - l2.credit) as k from acct_entries e2 join acct_lines l2 on l2.entry_id = e2.id join acct_accounts a2 on a2.id = l2.account_id
          where e2.kos_id = p_kos and e2.entry_date between p_to - 89 and p_to and a2.sys_key in ('kas', 'bank') group by e2.id) z),
      'hari_data', greatest(0, p_to - (select min(e3.entry_date) from acct_entries e3 where e3.kos_id = p_kos) + 1))
    from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
    where l.kos_id = p_kos and e.entry_date <= p_to));

  -- Piutang lewat tempo per hari ini (sumber dokumen, bukan jurnal)
  v_res := v_res || jsonb_build_object('piutang_lewat', case
    when v_type = 'properti' then (
      select jsonb_build_object('nilai', round(coalesce(sum(sisa) filter (where due_date < v_today), 0), 2), 'terbuka', round(coalesce(sum(sisa), 0), 2),
               'dokumen', count(*) filter (where due_date < v_today), 'sumber', 'tagihan')
      from (select i.due_date, i.amount - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi'), 0) as sisa
            from invoices i where i.kos_id = p_kos and i.status = 'terbit') z where sisa > 0)
    when v_type = 'retail' then (
      select jsonb_build_object('nilai', round(coalesce(sum(open_amount) filter (where due_date < v_today), 0), 2), 'terbuka', round(coalesce(sum(open_amount), 0), 2),
               'dokumen', count(*) filter (where due_date < v_today), 'sumber', 'kasbon')
      from receivable_open_core(p_kos) where open_amount > 0)
    end);

  -- Hunian (kos)
  if v_type = 'properti' then
    v_res := v_res || jsonb_build_object('hunian', jsonb_build_object(
      'kamar', (select count(*) from rooms where kos_id = p_kos),
      'terisi', (select count(distinct room_id) from leases where kos_id = p_kos and status = 'aktif'),
      'masuk', (select count(*) from leases where kos_id = p_kos and start_date between p_from and p_to and prev_lease_id is null),
      'keluar', (select count(*) from leases where kos_id = p_kos and status <> 'aktif' and end_date between p_from and p_to
                   and not exists (select 1 from leases n where n.prev_lease_id = leases.id)),
      'tagihan', (select round(coalesce(sum(amount), 0), 2) from invoices where kos_id = p_kos and status = 'terbit' and due_date between p_from and p_to),
      'tagihan_dibayar', (select round(coalesce(sum(least(i.amount, (select coalesce(sum(p.amount), 0) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi'))), 0), 2)
                          from invoices i where i.kos_id = p_kos and i.status = 'terbit' and i.due_date between p_from and p_to)));
  end if;

  if v_level in ('lanjutan', 'mendalam') then
    -- Per akun (periode vs pembanding)
    v_res := v_res || jsonb_build_object('per_akun', (select coalesce(jsonb_agg(z order by z.jenis, z.ini desc), '[]') from (
        select a.name as akun, a.id, case when a.type = 'pendapatan' then 'pendapatan' when a.sys_key = 'hpp' then 'hpp' else 'biaya' end as jenis,
               round(coalesce(sum(case when a.type = 'pendapatan' then l.credit - l.debit else l.debit - l.credit end) filter (where e.entry_date between p_from and p_to), 0), 2) as ini,
               round(coalesce(sum(case when a.type = 'pendapatan' then l.credit - l.debit else l.debit - l.credit end)
                     filter (where v_cmp_ok and e.entry_date between p_cmp_from and p_cmp_to), 0), 2) as lalu
        from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
        where l.kos_id = p_kos and a.type in ('pendapatan', 'beban')
          and (e.entry_date between p_from and p_to or (v_cmp_ok and e.entry_date between p_cmp_from and p_cmp_to))
          and (p_branch is null or acct_line_branch(l.source_type, l.source_id) = p_branch)
        group by a.id, a.name, a.type, a.sys_key) z where z.ini <> 0 or z.lalu <> 0));

    -- Produk / layanan (nilai bersih seperti retail_kpi: setelah diskon nota, tanpa PPN, dikurangi retur)
    if v_type = 'retail' then
      v_res := v_res || jsonb_build_object('kategori', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]')
                                                        from product_categories where kos_id = p_kos),
        'produk', (with ln as (
            select l.product_id, l.name, s.sale_date as d, l.qty * l.unit_qty as q,
                   l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount as omzet, l.qty * l.unit_qty * l.cost as hpp
            from sale_lines l join sales s on s.id = l.sale_id
            where s.kos_id = p_kos and s.status = 'selesai' and (p_branch is null or s.branch_id = p_branch)
              and (s.sale_date between p_from and p_to or (v_cmp_ok and s.sale_date between p_cmp_from and p_cmp_to))
            union all
            select x.product_id, x.name, r.return_date, -x.qty * x.unit_qty, -x.amount, -x.qty * x.unit_qty * x.cost
            from sale_return_lines x join sale_returns r on r.id = x.return_id
            left join sales s on s.id = r.sale_id
            where r.kos_id = p_kos and (p_branch is null or s.branch_id = p_branch)
              and (r.return_date between p_from and p_to or (v_cmp_ok and r.return_date between p_cmp_from and p_cmp_to))),
          f as (select ln.* from ln left join products p on p.id = ln.product_id where p_category is null or p.category_id = p_category),
          g as (select product_id, max(name) as nama, sum(q) filter (where d between p_from and p_to) as qty,
                       sum(omzet) filter (where d between p_from and p_to) as nilai, sum(omzet - hpp) filter (where d between p_from and p_to) as laba,
                       sum(omzet) filter (where v_cmp_ok and d between p_cmp_from and p_cmp_to) as nilai_lalu
                from f group by product_id)
          select jsonb_build_object('total', round(coalesce(sum(nilai), 0), 2), 'total_lalu', round(coalesce(sum(nilai_lalu), 0), 2),
                   'laba', round(coalesce(sum(laba), 0), 2), 'jenis', count(*) filter (where coalesce(nilai, 0) <> 0),
                   'items', (select coalesce(jsonb_agg(jsonb_build_object('id', product_id, 'nama', nama, 'jumlah', round(qty, 3), 'nilai', round(nilai, 2),
                                   'laba', round(laba, 2), 'nilai_lalu', round(coalesce(nilai_lalu, 0), 2)) order by nilai desc), '[]')
                             from (select * from g where coalesce(nilai, 0) <> 0 order by nilai desc limit 10) t))
          from g));
    elsif v_type = 'jasa' then
      v_res := v_res || jsonb_build_object('produk', (with ln as (
            select ol.name, o.completed_date as d, ol.charge_qty as q, ol.line_total as omzet
            from svc_order_lines ol join svc_orders o on o.id = ol.order_id
            where o.kos_id = p_kos and o.status = 'selesai'
              and (o.completed_date between p_from and p_to or (v_cmp_ok and o.completed_date between p_cmp_from and p_cmp_to))),
          g as (select name as nama, sum(q) filter (where d between p_from and p_to) as qty, sum(omzet) filter (where d between p_from and p_to) as nilai,
                       sum(omzet) filter (where v_cmp_ok and d between p_cmp_from and p_cmp_to) as nilai_lalu from ln group by name)
          select jsonb_build_object('total', round(coalesce(sum(nilai), 0), 2), 'total_lalu', round(coalesce(sum(nilai_lalu), 0), 2), 'laba', null,
                   'jenis', count(*) filter (where coalesce(nilai, 0) <> 0),
                   'items', (select coalesce(jsonb_agg(jsonb_build_object('nama', nama, 'jumlah', round(qty, 3), 'nilai', round(nilai, 2), 'laba', null,
                                   'nilai_lalu', round(coalesce(nilai_lalu, 0), 2)) order by nilai desc), '[]')
                             from (select * from g where coalesce(nilai, 0) <> 0 order by nilai desc limit 10) t))
          from g));
    end if;

    -- Perputaran persediaan bulanan (6 bulan s.d. bulan akhir periode; rumus retail_kpi)
    if v_type = 'retail' then
      v_inv_from := (v_m1 - interval '5 month')::date;
      v_res := v_res || jsonb_build_object('persediaan', (
        select coalesce(jsonb_agg(jsonb_build_object('mulai', m.b, 'hpp', x.hpp, 'awal', x.inv0, 'akhir', x.inv1,
                 'perputaran', case when x.inv0 + x.inv1 > 0 then round(x.hpp / ((x.inv0 + x.inv1) / 2), 2) end) order by m.b), '[]')
        from (select g::date as b, least((g + interval '1 month - 1 day')::date, v_today) as e from generate_series(v_inv_from, v_m1, interval '1 month') g) m
        cross join lateral (select
            (select coalesce(sum(cost_total), 0) from sales where kos_id = p_kos and status = 'selesai' and sale_date between m.b and m.e)
              - (select coalesce(sum(cost_total), 0) from sale_returns where kos_id = p_kos and return_date between m.b and m.e) as hpp,
            (select coalesce(sum(sm.value), 0) from stock_moves sm join products p on p.id = sm.product_id
             where sm.kos_id = p_kos and p.consign_contact_id is null and (sm.created_at at time zone 'Asia/Jakarta')::date < m.b) as inv0,
            (select coalesce(sum(sm.value), 0) from stock_moves sm join products p on p.id = sm.product_id
             where sm.kos_id = p_kos and p.consign_contact_id is null and (sm.created_at at time zone 'Asia/Jakarta')::date <= m.e) as inv1) x));
    end if;

    -- Perilaku pelanggan (kontak di Kasir/Pesanan)
    if v_type in ('retail', 'jasa') then
      v_res := v_res || jsonb_build_object('pelanggan', (
        with r as (select * from biz_customer_rows(p_kos, p_from, p_to, p_branch))
        select jsonb_build_object(
          'baru', count(*) filter (where seg = 'baru'), 'setia', count(*) filter (where seg = 'setia'),
          'kadang', count(*) filter (where seg = 'kadang'), 'tidak_aktif', count(*) filter (where seg = 'tidak_aktif'),
          'aktif', count(*) filter (where n_now > 0), 'trx_kontak', coalesce(sum(n_now), 0),
          'baru_lalu', case when v_cmp_ok and p_cmp_from is not null then (select count(*) from biz_customer_rows(p_kos, p_cmp_from, p_cmp_to, p_branch) where seg = 'baru') end,
          'nilai_teratas', (select coalesce(max(v_now), 0) from r),
          'daftar', (select coalesce(jsonb_agg(jsonb_build_object('id', r2.contact_id, 'name', c.name, 'seg', r2.seg, 'n', r2.n_now, 'nilai', r2.v_now, 'terakhir', r2.last_d)
                                   order by r2.v_now desc, r2.last_d desc), '[]')
                     from (select * from r order by v_now desc, last_d desc limit 150) r2 join contacts c on c.id = r2.contact_id))
        from r));
    end if;
  end if;

  if v_level = 'mendalam' then
    -- Perbandingan cabang (bisnis multi-lokasi)
    if v_multi then
      v_res := v_res || jsonb_build_object('per_lokasi', (
        select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'lokasi', b.name, 'gudang', b.kind = 'gudang',
                 'cur', biz_figures_total(p_kos, p_from, p_to, b.id),
                 'cmp', case when p_cmp_from is not null then biz_figures_total(p_kos, p_cmp_from, p_cmp_to, b.id) end) order by b.is_main desc, b.name), '[]')
        from branches b where b.kos_id = p_kos and b.active));
    end if;
    -- Peta jam ramai: transaksi per hari (1=Senin) × jam, maksimal 92 hari terakhir periode
    if v_type in ('retail', 'jasa') then
      v_hm_from := greatest(p_from, p_to - 91);
      v_res := v_res || jsonb_build_object('heatmap', jsonb_build_object('from', v_hm_from, 'to', p_to, 'sel', (
        select coalesce(jsonb_agg(jsonb_build_object('h', dw, 'j', jm, 'n', n, 'nilai', round(v, 2))), '[]') from (
          select extract(isodow from t at time zone 'Asia/Jakarta')::int as dw, extract(hour from t at time zone 'Asia/Jakarta')::int as jm, count(*) as n, sum(v) as v
          from (select s.sold_at as t, s.total - s.tax_amount as v from sales s
                where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between v_hm_from and p_to and (p_branch is null or s.branch_id = p_branch)
                union all
                select o.completed_at, o.total from svc_orders o
                where p_branch is null and o.kos_id = p_kos and o.status = 'selesai' and o.completed_date between v_hm_from and p_to and o.completed_at is not null) q
          group by 1, 2) z)));
    end if;
  end if;
  return v_res;
end $$;
revoke execute on function public.biz_intel(uuid, date, date, date, date, uuid, uuid) from public, anon;
grant execute on function public.biz_intel(uuid, date, date, date, date, uuid, uuid) to authenticated;
