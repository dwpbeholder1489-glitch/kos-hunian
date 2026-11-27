-- Rekap Bisnis (Business Recap Center) — rangkuman hasil & aktivitas per periode (harian/mingguan/bulanan/kuartalan/tahunan/kustom).
-- TANPA tabel transaksi/jurnal baru. Semua angka dari sumber yang sama dengan laporan lain:
--   • pendapatan/HPP/biaya/laba/transaksi/pelanggan = biz_figures_total & biz_figures (jurnal + transaksi; = Pembukuan & Analisis Bisnis)
--   • kelompok akun                                 = biz_fin_class (sama dengan biz_financials)
--   • kas & bank                                    = baris akun Kas+Bank per jurnal; jurnal neto 0 (pindah kas↔bank) tidak dihitung (= biz_intel.kas = acct_cashflow)
--   • saldo awal/mutasi/akhir per akun              = acct_lines (Pembukuan); rumus kelompok (kas, piutang, utang, pajak, modal) di lib/recap.js
--   • penjualan toko                                = rumus retail_report (omzet tanpa PPN, dikurangi retur)
--   • pelanggan                                     = biz_customer_rows (segmen Analisis Bisnis)
--   • aktivitas khusus jenis bisnis                 = industry_kpi_period (angka mentah KPI industri)
--   • timeline                                      = domain_events (activity_feed)
--   • status periode                                = acct_periods (tutup buku), bank_recons (rekonsiliasi), day_closings (tutup harian toko)
-- Arsip: recap_snapshots (tidak bisa diubah/dihapus; versi baru bila data sumber berubah). Otomatis: recap_auto_tick (cron harian).

-- =====================================================================================================
-- 1. Inti rekap (tanpa cek anggota; dipanggil biz_recap & recap_auto_tick). TIDAK di-grant ke pengguna.
-- =====================================================================================================
create or replace function public.biz_recap_core(p_kos uuid, p_from date, p_to date, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_type text; v_tpl text; v_grain text; r jsonb; v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  select business_type, template_code into v_type, v_tpl from kos where id = p_kos;
  if v_type is null then raise exception 'Bisnis tidak ditemukan'; end if;
  v_grain := case when p_to - p_from <= 62 then 'day' else 'month' end;

  r := jsonb_build_object('jenis', v_type, 'template', v_tpl, 'from', p_from, 'to', p_to, 'branch', p_branch,
    'ringkas', biz_figures_total(p_kos, p_from, p_to, p_branch));

  -- Laba rugi per kelompok akun & per akun beban (jurnal periode; dengan filter lokasi bila dipilih)
  r := r || jsonb_build_object('kelas', (
    select coalesce(jsonb_object_agg(k, v), '{}') from (
      select biz_fin_class(a.type, a.sys_key) k,
             round(sum(case when a.type = 'pendapatan' then l.credit - l.debit else l.debit - l.credit end), 2) v
      from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
      where l.kos_id = p_kos and e.entry_date between p_from and p_to and a.type in ('pendapatan', 'beban')
        and (p_branch is null or acct_line_branch(l.source_type, l.source_id) = p_branch)
      group by 1) z),
    'beban_akun', (
    select coalesce(jsonb_agg(jsonb_build_object('akun', name, 'sys', sys_key, 'kelas', k, 'nilai', v) order by v desc), '[]') from (
      select a.name, a.sys_key, biz_fin_class(a.type, a.sys_key) k, round(sum(l.debit - l.credit), 2) v
      from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
      where l.kos_id = p_kos and e.entry_date between p_from and p_to and a.type = 'beban'
        and (p_branch is null or acct_line_branch(l.source_type, l.source_id) = p_branch)
      group by 1, 2, 3 having sum(l.debit - l.credit) <> 0) z));

  -- Tren di dalam periode (harian ≤ 62 hari, selain itu bulanan), slot kosong tetap ada
  r := r || jsonb_build_object('grain', v_grain, 'tren', (
    select coalesce(jsonb_agg(jsonb_build_object('mulai', s.b, 'pendapatan', coalesce(f.pendapatan, 0), 'hpp', coalesce(f.hpp, 0),
             'biaya', coalesce(f.biaya, 0), 'transaksi', coalesce(f.transaksi, 0), 'pelanggan', coalesce(f.pelanggan, 0)) order by s.b), '[]')
    from (select g::date b from generate_series(case when v_grain = 'day' then p_from else date_trunc('month', p_from)::date end, p_to,
                                                 case when v_grain = 'day' then interval '1 day' else interval '1 month' end) g) s
    left join biz_figures(p_kos, p_from, p_to, v_grain, p_branch) f on f.b = s.b));

  -- Saldo per akun (semua lokasi): saldo sebelum periode, debit & kredit di dalam periode. Rumus kelompok di lib/recap.js.
  r := r || jsonb_build_object('akun', (
    select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'type', z.type, 'sys', z.sys_key, 'kelas', biz_fin_class(z.type, z.sys_key),
             'open', round(z.open, 2), 'dr', round(z.dr, 2), 'cr', round(z.cr, 2)) order by z.code), '[]')
    from (select a.id, a.code, a.name, a.type, a.sys_key,
                 coalesce(sum(l.debit - l.credit) filter (where e.entry_date < p_from), 0) open,
                 coalesce(sum(l.debit) filter (where e.entry_date between p_from and p_to), 0) dr,
                 coalesce(sum(l.credit) filter (where e.entry_date between p_from and p_to), 0) cr
          from acct_accounts a
          join acct_lines l on l.account_id = a.id and l.kos_id = p_kos
          join acct_entries e on e.id = l.entry_id and e.entry_date <= p_to
          where a.kos_id = p_kos
          group by a.id, a.code, a.name, a.type, a.sys_key) z
    where z.open <> 0 or z.dr <> 0 or z.cr <> 0));

  -- Kas & bank: total masuk/keluar per jurnal (pindah kas↔bank neto 0 tidak dihitung) + per slot waktu
  r := r || jsonb_build_object('kas', (
    with ent as (
      select e.entry_date d, sum(l.debit - l.credit) k
      from acct_entries e join acct_lines l on l.entry_id = e.id join acct_accounts a on a.id = l.account_id
      where e.kos_id = p_kos and e.entry_date between p_from and p_to and a.sys_key in ('kas', 'bank')
      group by e.id, e.entry_date having sum(l.debit - l.credit) <> 0),
    bk as (select case when v_grain = 'day' then d else date_trunc('month', d)::date end b,
                  coalesce(sum(k) filter (where k > 0), 0) masuk, coalesce(-sum(k) filter (where k < 0), 0) keluar
           from ent group by 1)
    select jsonb_build_object(
      'masuk', round((select coalesce(sum(masuk), 0) from bk), 2), 'keluar', round((select coalesce(sum(keluar), 0) from bk), 2),
      'buckets', (select coalesce(jsonb_agg(jsonb_build_object('mulai', s.b, 'masuk', round(coalesce(bk.masuk, 0), 2), 'keluar', round(coalesce(bk.keluar, 0), 2)) order by s.b), '[]')
                  from (select g::date b from generate_series(case when v_grain = 'day' then p_from else date_trunc('month', p_from)::date end, p_to,
                          case when v_grain = 'day' then interval '1 day' else interval '1 month' end) g) s left join bk on bk.b = s.b))));

  -- Pengeluaran per kategori (dokumen Pengeluaran/Kas; jurnal tetap sumber "biaya operasional")
  r := r || jsonb_build_object('pengeluaran', (
    select jsonb_build_object(
      'operasional', round(coalesce(sum(x.amount) filter (where x.kind = 'operasional'), 0), 2),
      'modal', round(coalesce(sum(x.amount) filter (where x.kind = 'modal'), 0), 2),
      'non_operasional', round(coalesce(sum(x.amount) filter (where x.kind = 'non_operasional'), 0), 2),
      'n', count(*),
      'kategori', (select coalesce(jsonb_agg(jsonb_build_object('id', cid, 'name', nm, 'kind', kd, 'total', t, 'n', c) order by t desc), '[]') from (
          select e2.category_id cid, coalesce(c.name, 'Tanpa kategori') nm, e2.kind kd, round(sum(e2.amount), 2) t, count(*) c
          from expenses e2 left join expense_categories c on c.id = e2.category_id
          where e2.kos_id = p_kos and e2.date between p_from and p_to and (p_branch is null or e2.branch_id = p_branch)
          group by 1, 2, 3) k))
    from expenses x where x.kos_id = p_kos and x.date between p_from and p_to and (p_branch is null or x.branch_id = p_branch)));

  -- Penjualan toko (rumus retail_report)
  if v_type = 'retail' then
    r := r || jsonb_build_object('penjualan', (
      with s as (select * from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to and (p_branch is null or branch_id = p_branch)),
      rt as (select x.* from sale_returns x join sales s0 on s0.id = x.sale_id where x.kos_id = p_kos and x.return_date between p_from and p_to
               and (p_branch is null or s0.branch_id = p_branch)),
      ln as (
        select l.product_id, l.name, l.qty * l.unit_qty q, l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount o,
               l.qty * l.unit_qty * l.cost h
        from sale_lines l join s on s.id = l.sale_id
        union all
        select x.product_id, x.name, -x.qty * x.unit_qty, -x.amount, -x.qty * x.unit_qty * x.cost
        from sale_return_lines x join rt on rt.id = x.return_id),
      pr as (select ln.product_id, max(ln.name) name, sum(q) q, sum(o) o, sum(h) h from ln group by 1)
      select jsonb_build_object(
        'trx', (select count(*) from s),
        'bruto', round((select coalesce(sum(total - tax_amount + discount), 0) from s), 2),
        'diskon', round((select coalesce(sum(discount), 0) from s), 2),
        'promo', round((select coalesce(sum(promo_discount), 0) from s), 2),
        'retur', round((select coalesce(sum(total - tax_amount), 0) from rt), 2),
        'retur_n', (select count(*) from rt),
        'omzet', round((select coalesce(sum(total - tax_amount), 0) from s) - (select coalesce(sum(total - tax_amount), 0) from rt), 2),
        'ppn', round((select coalesce(sum(tax_amount), 0) from s), 2),
        'hpp', round((select coalesce(sum(cost_total), 0) from s) - (select coalesce(sum(cost_total), 0) from rt), 2),
        'bayar', jsonb_build_object('tunai', (select coalesce(sum(amt_tunai), 0) from s), 'transfer', (select coalesce(sum(amt_transfer), 0) from s),
                                    'kasbon', (select coalesce(sum(amt_kasbon), 0) from s), 'nota', (select coalesce(sum(amt_nota), 0) from s)),
        'grosir', round((select coalesce(sum(total - tax_amount), 0) from s where tier = 'grosir'), 2),
        'batal_n', (select count(*) from sales where kos_id = p_kos and status = 'batal' and sale_date between p_from and p_to and (p_branch is null or branch_id = p_branch)),
        'tanpa_modal', (select count(distinct s.id) from s join sale_lines l on l.sale_id = s.id where l.cost = 0 and l.line_total > 0),
        'kategori', (select coalesce(jsonb_agg(jsonb_build_object('id', cid, 'name', nm, 'qty', round(q, 3), 'omzet', round(o, 2), 'laba', round(o - h, 2)) order by o desc), '[]') from (
            select p.category_id cid, coalesce(c.name, 'Tanpa kategori') nm, sum(pr.q) q, sum(pr.o) o, sum(pr.h) h
            from pr left join products p on p.id = pr.product_id left join product_categories c on c.id = p.category_id group by 1, 2) k),
        'produk', (select coalesce(jsonb_agg(jsonb_build_object('id', product_id, 'name', name, 'qty', round(q, 3), 'omzet', round(o, 2), 'laba', round(o - h, 2)) order by o desc), '[]')
                   from (select * from pr order by o desc limit 10) t))));
  end if;

  -- Jasa & kuliner: layanan/menu terlaris dari pesanan selesai; Kos & jasa: angka operasional mentah (industry_kpi_period)
  if v_type = 'jasa' then
    r := r || jsonb_build_object('layanan', (
      select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'qty', round(q, 3), 'unit', un, 'nilai', round(v, 2), 'pesanan', n) order by v desc), '[]') from (
        select l.name nm, max(l.unit) un, sum(l.qty) q, sum(l.line_total) v, count(distinct l.order_id) n
        from svc_order_lines l join svc_orders o on o.id = l.order_id
        where o.kos_id = p_kos and o.status = 'selesai' and o.completed_date between p_from and p_to
        group by 1 order by 4 desc limit 10) z),
      'uang_masuk_jasa', (select round(coalesce(sum(amount) filter (where kind <> 'kembali'), 0) - coalesce(sum(amount) filter (where kind = 'kembali'), 0), 2)
                          from svc_payments where kos_id = p_kos and status <> 'batal' and (paid_at at time zone 'Asia/Jakarta')::date between p_from and p_to));
  end if;
  if v_type in ('jasa', 'properti') then
    r := r || jsonb_build_object('operasional', industry_kpi_period(p_kos, p_from, p_to));
  end if;
  if v_type = 'properti' then
    r := r || jsonb_build_object('sewa', jsonb_build_object(
      'tagihan_terbit', (select coalesce(sum(amount), 0) from invoices where kos_id = p_kos and status = 'terbit' and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
      'tagihan_terbit_n', (select count(*) from invoices where kos_id = p_kos and status = 'terbit' and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
      'tunggakan_total', (select round(coalesce(sum(greatest(i.amount - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi' and p.paid_at <= p_to), 0), 0)), 0), 2)
                          from invoices i where i.kos_id = p_kos and i.status = 'terbit' and i.due_date <= least(p_to, v_today)),
      'penghuni_aktif', (select count(distinct occupant_id) from leases where kos_id = p_kos and start_date <= p_to and (end_date is null or end_date >= p_to) and status <> 'batal'),
      'booking_baru', (select count(*) from bookings where kos_id = p_kos and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to)));
  end if;

  -- Pembelian (bila ada belanja)
  if exists (select 1 from purchases where kos_id = p_kos) then
    r := r || jsonb_build_object('pembelian', (
      with b as (select * from purchases where kos_id = p_kos and status in ('selesai', 'sebagian') and purchase_date between p_from and p_to and (p_branch is null or branch_id = p_branch))
      select jsonb_build_object(
        'n', (select count(*) from b), 'total', round((select coalesce(sum(total), 0) from b), 2),
        'utang', round((select coalesce(sum(total), 0) from b where pay_method = 'utang'), 2),
        'retur', round((select coalesce(sum(total), 0) from purchase_returns where kos_id = p_kos and return_date between p_from and p_to), 2),
        'retur_n', (select count(*) from purchase_returns where kos_id = p_kos and return_date between p_from and p_to),
        'dipesan_n', (select count(*) from purchases where kos_id = p_kos and status = 'dipesan' and purchase_date <= p_to and (p_branch is null or branch_id = p_branch)),
        'dipesan', round((select coalesce(sum(coalesce(order_total, total)), 0) from purchases where kos_id = p_kos and status = 'dipesan' and purchase_date <= p_to and (p_branch is null or branch_id = p_branch)), 2),
        'supplier', (select coalesce(jsonb_agg(jsonb_build_object('id', cid, 'name', nm, 'n', c, 'total', t) order by t desc), '[]') from (
            select b.contact_id cid, coalesce(k.name, 'Tanpa supplier') nm, count(*) c, round(sum(b.total), 2) t
            from b left join contacts k on k.id = b.contact_id group by 1, 2 order by 4 desc limit 10) z))));
  end if;

  -- Persediaan dari kartu stok (semua lokasi; 'transfer' bukan masuk/keluar bisnis)
  if exists (select 1 from stock_moves where kos_id = p_kos) then
    r := r || jsonb_build_object('persediaan', (
      with m as (select kind, delta, value, (created_at at time zone 'Asia/Jakarta')::date d from stock_moves where kos_id = p_kos and kind <> 'transfer')
      select jsonb_build_object(
        'awal', jsonb_build_object('qty', round(coalesce(sum(delta) filter (where d < p_from), 0), 3), 'nilai', round(coalesce(sum(value) filter (where d < p_from), 0), 2)),
        'akhir', jsonb_build_object('qty', round(coalesce(sum(delta) filter (where d <= p_to), 0), 3), 'nilai', round(coalesce(sum(value) filter (where d <= p_to), 0), 2)),
        'jenis', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'n', n, 'qty', round(q, 3), 'nilai', round(v, 2)) order by kind), '[]') from (
            select kind, count(*) n, sum(delta) q, sum(value) v from m where d between p_from and p_to group by 1) z),
        'jual_qty', round(coalesce(-sum(delta) filter (where d between p_from and p_to and kind = 'jual'), 0), 3))
      from m));
  end if;

  -- Pelanggan (segmen Analisis Bisnis) + kontak baru
  r := r || jsonb_build_object('pelanggan', (
    select jsonb_build_object(
      'aktif', count(*) filter (where n_now > 0), 'baru', count(*) filter (where seg = 'baru'), 'setia', count(*) filter (where seg = 'setia'),
      'kadang', count(*) filter (where seg = 'kadang'), 'tidak_aktif', count(*) filter (where seg = 'tidak_aktif'),
      'berulang', count(*) filter (where n_now >= 2), 'nilai', round(coalesce(sum(v_now), 0), 2),
      'terdaftar', (select count(*) from contacts where kos_id = p_kos and kind = 'pelanggan' and (created_at at time zone 'Asia/Jakarta')::date <= p_to
                     and (archived_at is null or (archived_at at time zone 'Asia/Jakarta')::date > p_to)),
      'terdaftar_baru', (select count(*) from contacts where kos_id = p_kos and kind = 'pelanggan' and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to))
    from biz_customer_rows(p_kos, p_from, p_to, p_branch)));

  -- Karyawan (SDM, gaji, kasbon, komisi) — hanya bila ada data
  if exists (select 1 from staff where kos_id = p_kos) or exists (select 1 from payroll_runs where kos_id = p_kos) then
    r := r || jsonb_build_object('karyawan', jsonb_build_object(
      'aktif', (select count(*) from staff where kos_id = p_kos and coalesce(join_date, p_from) <= p_to and (end_date is null or end_date >= p_from) and (active or end_date is not null)),
      'kehadiran', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from attendance where kos_id = p_kos and work_date between p_from and p_to group by 1) z),
      'jam', (select round(coalesce(sum(hours), 0), 1) from attendance where kos_id = p_kos and work_date between p_from and p_to),
      'lembur', (select round(coalesce(sum(overtime), 0), 1) from attendance where kos_id = p_kos and work_date between p_from and p_to),
      'gaji', (select round(coalesce(sum(total_net), 0), 2) from payroll_runs where kos_id = p_kos and status = 'dibayar' and paid_date between p_from and p_to),
      'gaji_n', (select count(*) from payroll_runs where kos_id = p_kos and status = 'dibayar' and paid_date between p_from and p_to),
      'kasbon', (select round(coalesce(sum(amount), 0), 2) from staff_advances where kos_id = p_kos and status = 'aktif' and date between p_from and p_to),
      'komisi', (select round(coalesce(sum(amount), 0), 2) from commission_payouts where kos_id = p_kos and month between date_trunc('month', p_from)::date and p_to)));
  end if;

  -- Aset tetap (penyusutan & nilai buku dari jurnal di lib/recap.js)
  if exists (select 1 from fixed_assets where kos_id = p_kos) then
    r := r || jsonb_build_object('aset', jsonb_build_object(
      'baru_n', (select count(*) from fixed_assets where kos_id = p_kos and start_date between p_from and p_to),
      'baru', (select round(coalesce(sum(cost), 0), 2) from fixed_assets where kos_id = p_kos and start_date between p_from and p_to),
      'lepas_n', (select count(*) from fixed_assets where kos_id = p_kos and status = 'dilepas' and disposed_date between p_from and p_to),
      'lepas', (select round(coalesce(sum(disposal_amount), 0), 2) from fixed_assets where kos_id = p_kos and status = 'dilepas' and disposed_date between p_from and p_to),
      'aktif', (select count(*) from fixed_assets where kos_id = p_kos and start_date <= p_to and (status = 'aktif' or disposed_date > p_to))));
  end if;

  -- Setoran pajak (kas)
  r := r || jsonb_build_object('setor_pajak', (select round(coalesce(sum(amount), 0), 2) from cash_entries where kos_id = p_kos and kind = 'bayar_pajak' and date between p_from and p_to));

  -- Proyek (bila dipakai)
  if exists (select 1 from prj_projects where kos_id = p_kos) then
    r := r || jsonb_build_object('proyek', jsonb_build_object(
      'mulai', (select count(*) from prj_projects where kos_id = p_kos and start_date between p_from and p_to),
      'selesai', (select count(*) from prj_projects where kos_id = p_kos and status = 'selesai' and (closed_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
      'ditagih', (select round(coalesce(sum(amount), 0), 2) from prj_invoices where kos_id = p_kos and status <> 'batal' and issue_date between p_from and p_to),
      'diterima', (select round(coalesce(sum(amount) filter (where kind = 'bayar'), 0) - coalesce(sum(amount) filter (where kind = 'kembali'), 0), 2)
                   from prj_payments where kos_id = p_kos and status <> 'batal' and pay_date between p_from and p_to)));
  end if;

  -- Aktivitas (jumlah peristiwa per area & jenis; rinciannya lewat activity_feed yang memfilter hak akses)
  r := r || jsonb_build_object('aktivitas', (
    select jsonb_build_object('total', count(*),
      'area', (select coalesce(jsonb_object_agg(coalesce(area, '-'), n), '{}') from (
          select area, count(*) n from domain_events where kos_id = p_kos and (occurred_at at time zone 'Asia/Jakarta')::date between p_from and p_to group by 1) z),
      'jenis', (select coalesce(jsonb_agg(jsonb_build_object('type', t, 'label', event_label(t), 'area', ar, 'n', n) order by n desc), '[]') from (
          select event_type t, max(area) ar, count(*) n from domain_events where kos_id = p_kos and (occurred_at at time zone 'Asia/Jakarta')::date between p_from and p_to
          group by 1 order by 3 desc limit 12) z))
    from domain_events where kos_id = p_kos and (occurred_at at time zone 'Asia/Jakarta')::date between p_from and p_to));

  return r;
end $$;
revoke execute on function public.biz_recap_core(uuid, date, date, uuid) from public, anon, authenticated;

-- Status periode (tidak ikut hash arsip): berjalan / ditutup / direkonsiliasi / belum direkonsiliasi
create or replace function public.recap_status(p_kos uuid, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (select g::date b from generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month') g),
  mm as (
    select m.b,
      (select closed_at from acct_periods p where p.kos_id = p_kos and p.month = m.b) closed_at,
      (select status from bank_recons r where r.kos_id = p_kos and r.month = m.b) rekon,
      exists (select 1 from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
              where l.kos_id = p_kos and a.sys_key = 'bank' and e.entry_date between m.b and (m.b + interval '1 month - 1 day')::date) perlu_rekon
    from m),
  dy as (
    select (select count(distinct sale_date) from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to) jual,
           (select count(distinct s.sale_date) from sales s where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between p_from and p_to
              and exists (select 1 from day_closings c where c.kos_id = p_kos and c.day = s.sale_date)) tutup)
  select jsonb_build_object(
    'berjalan', p_to >= (now() at time zone 'Asia/Jakarta')::date,
    'bulan', (select jsonb_agg(jsonb_build_object('bulan', b, 'ditutup', closed_at is not null, 'ditutup_at', closed_at,
                'rekon', case when not perlu_rekon then 'tidak_perlu' else coalesce(rekon, 'belum') end) order by b) from mm),
    'hari_jual', (select jual from dy), 'hari_ditutup', (select tutup from dy),
    'ditutup', (select bool_and(closed_at is not null) from mm),
    'direkonsiliasi', (select bool_and(not perlu_rekon or rekon = 'selesai') from mm) and (select jual = tutup from dy));
$$;
revoke execute on function public.recap_status(uuid, date, date) from public, anon, authenticated;

-- Hash data rekap (tanpa status & waktu buat) — dasar deteksi "data sumber berubah"
create or replace function public.recap_hash(p_data jsonb)
returns text language sql immutable as $$ select md5((p_data - 'status' - 'dibuat')::text) $$;

-- =====================================================================================================
-- 2. Arsip rekap
-- =====================================================================================================
create table if not exists public.recap_snapshots (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  kind text not null check (kind in ('harian', 'mingguan', 'bulanan', 'kuartalan', 'tahunan', 'kustom')),
  period_from date not null,
  period_to date not null check (period_to >= period_from and period_to - period_from <= 400),
  branch_id uuid references public.branches(id) on delete cascade,
  version int not null check (version > 0),
  source text not null check (source in ('manual', 'otomatis', 'koreksi')),
  data jsonb not null,
  data_hash text not null,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists recap_snapshots_ver on public.recap_snapshots(kos_id, kind, period_from, period_to, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), version);
create index if not exists recap_snapshots_kos on public.recap_snapshots(kos_id, created_at desc);
alter table public.recap_snapshots enable row level security;
revoke all on public.recap_snapshots from public, anon, authenticated;
drop trigger if exists zz_kos_open_guard on public.recap_snapshots;
create trigger zz_kos_open_guard before insert or update or delete on public.recap_snapshots for each row execute function public.kos_open_guard();

-- Arsip final tidak boleh berubah diam-diam: koreksi = versi baru (hapus hanya ikut terhapus bersama bisnis)
create or replace function public.recap_snapshots_immutable()
returns trigger language plpgsql as $$
begin raise exception 'Arsip rekap tidak bisa diubah atau dihapus. Simpan versi baru bila data berubah.'; end $$;
drop trigger if exists recap_snapshots_immutable on public.recap_snapshots;
create trigger recap_snapshots_immutable before update or delete on public.recap_snapshots for each row when (pg_trigger_depth() = 0)
  execute function public.recap_snapshots_immutable();

-- Simpan versi bila berbeda dari versi terakhir (inti; tanpa cek anggota)
create or replace function public.recap_store(p_kos uuid, p_kind text, p_from date, p_to date, p_branch uuid, p_source text, p_actor uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_data jsonb; v_hash text; v_last recap_snapshots%rowtype; v_row recap_snapshots%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('recap:' || p_kos || ':' || p_kind || ':' || p_from || ':' || p_to || ':' || coalesce(p_branch::text, ''), 0));
  v_data := biz_recap_core(p_kos, p_from, p_to, p_branch);
  v_hash := recap_hash(v_data);
  select * into v_last from recap_snapshots where kos_id = p_kos and kind = p_kind and period_from = p_from and period_to = p_to
    and branch_id is not distinct from p_branch order by version desc limit 1;
  if found and v_last.data_hash = v_hash then
    return jsonb_build_object('id', v_last.id, 'version', v_last.version, 'baru', false);
  end if;
  insert into recap_snapshots(kos_id, kind, period_from, period_to, branch_id, version, source, data, data_hash, note, created_by)
  values (p_kos, p_kind, p_from, p_to, p_branch, coalesce(v_last.version, 0) + 1,
          case when v_last.id is not null and p_source = 'otomatis' then 'koreksi' else p_source end,
          v_data || jsonb_build_object('status', recap_status(p_kos, p_from, p_to), 'dibuat', now()), v_hash, nullif(trim(coalesce(p_note, '')), ''), p_actor)
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'version', v_row.version, 'baru', true, 'source', v_row.source);
end $$;
revoke execute on function public.recap_store(uuid, text, date, date, uuid, text, uuid, text) from public, anon, authenticated;

-- Kondisi saat ini (TIDAK diarsipkan & tidak ikut hash): dokumen terbuka, stok, dan hal yang membuat rekap belum final
create or replace function public.recap_now(p_kos uuid, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'piutang_pelanggan', case when k.business_type = 'retail' then (select count(distinct contact_id) from receivable_open_core(p_kos, null) where open_amount > 0) end,
    'utang_supplier', case when exists (select 1 from purchases where kos_id = p_kos) then (select count(distinct contact_id) from payable_open(p_kos, null) where open_amount > 0) end,
    'produk_aktif', (select count(*) from products where kos_id = p_kos and active and not coalesce(is_kit, false)),
    'stok_habis', (select count(*) from products where kos_id = p_kos and active and not coalesce(is_kit, false) and stock <= 0),
    'di_bawah_min', (select count(*) from products where kos_id = p_kos and active and not coalesce(is_kit, false) and min_stock > 0 and stock > 0 and stock < min_stock),
    'menunggu_verifikasi', (select count(*) from payments where kos_id = p_kos and status = 'menunggu' and paid_at <= p_to),
    'pos_offline_cek', (select count(*) from pos_offline where kos_id = p_kos and status in ('perlu_cek', 'gagal') and reviewed_at is null
                          and (coalesce(client_at, received_at) at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'tanpa_modal', (select count(distinct s.id) from sales s join sale_lines l on l.sale_id = s.id where s.kos_id = p_kos and s.status = 'selesai'
                      and s.sale_date between p_from and p_to and l.cost = 0 and l.line_total > 0),
    'jurnal_koreksi', (select count(*) from acct_entries where kos_id = p_kos and kind = 'koreksi' and entry_date between p_from and p_to),
    'proyek_berjalan', (select count(*) from prj_projects where kos_id = p_kos and status = 'berjalan'))
  from kos k where k.id = p_kos;
$$;
revoke execute on function public.recap_now(uuid, date, date) from public, anon, authenticated;

-- =====================================================================================================
-- 3. RPC pengguna (area keuangan)
-- =====================================================================================================
-- Rekap langsung (selalu data terbaru). p_series = [{from,to}] periode sebelumnya (maks. 12) untuk grafik historis.
create or replace function public.biz_recap(p_kos uuid, p_from date, p_to date, p_cmp_from date default null, p_cmp_to date default null,
                                            p_branch uuid default null, p_series jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date; v_cur jsonb; v_res jsonb; v_hash text; v_last recap_snapshots%rowtype;
  v_deep boolean; v_branch_name text; s jsonb; v_seri jsonb := '[]';
begin
  if auth.uid() is null or not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Periode tidak valid'; end if;
  if p_from > v_today then raise exception 'Periode belum berjalan'; end if;
  if p_to - p_from > 400 then raise exception 'Periode maksimal sekitar 1 tahun (400 hari)'; end if;
  if (p_cmp_from is null) <> (p_cmp_to is null) or p_cmp_to < p_cmp_from or p_cmp_to - p_cmp_from > 400 then raise exception 'Periode pembanding tidak valid'; end if;
  if p_series is not null and (jsonb_typeof(p_series) <> 'array' or jsonb_array_length(p_series) > 12) then raise exception 'Seri periode tidak valid'; end if;
  v_deep := plan_has(p_kos, 'analisis_mendalam');
  if p_branch is not null then
    if not v_deep then raise exception 'BATAS_PAKET: Rekap per cabang tersedia di Paket Pro.'; end if;
    select name into v_branch_name from branches where id = p_branch and kos_id = p_kos;
    if v_branch_name is null then raise exception 'Lokasi tidak ditemukan'; end if;
  end if;
  perform acct_sync_internal(p_kos);

  v_cur := biz_recap_core(p_kos, p_from, p_to, p_branch);
  v_hash := recap_hash(v_cur);
  for s in select * from jsonb_array_elements(coalesce(p_series, '[]')) loop
    if (s ->> 'from')::date is null or (s ->> 'to')::date < (s ->> 'from')::date or (s ->> 'to')::date - (s ->> 'from')::date > 400 then
      raise exception 'Seri periode tidak valid'; end if;
    v_seri := v_seri || jsonb_build_array(jsonb_build_object('from', s ->> 'from', 'to', s ->> 'to',
      'v', biz_figures_total(p_kos, (s ->> 'from')::date, least((s ->> 'to')::date, v_today), p_branch)));
  end loop;
  select * into v_last from recap_snapshots where kos_id = p_kos and period_from = p_from and period_to = p_to
    and branch_id is not distinct from p_branch order by created_at desc, version desc limit 1;

  v_res := jsonb_build_object('cur', v_cur, 'hari_ini', v_today, 'branch_name', v_branch_name, 'mendalam', v_deep,
    'status', recap_status(p_kos, p_from, p_to),
    'cmp', case when p_cmp_from is not null then biz_recap_core(p_kos, p_cmp_from, least(p_cmp_to, v_today), p_branch) end,
    'seri', v_seri,
    'lokasi', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'gudang', kind = 'gudang') order by is_main desc, name), '[]') from branches where kos_id = p_kos and active),
    'kini', recap_now(p_kos, p_from, p_to),
    'arsip', case when v_last.id is not null then jsonb_build_object('id', v_last.id, 'version', v_last.version, 'kind', v_last.kind, 'source', v_last.source,
               'created_at', v_last.created_at, 'berubah', v_last.data_hash <> v_hash) end);

  -- Peta aktivitas hari × jam (Paket Pro, sama dengan heatmap Analisis Bisnis)
  if v_deep then
    v_res := v_res || jsonb_build_object('heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('h', dw, 'j', jm, 'n', n)), '[]') from (
        select extract(isodow from occurred_at at time zone 'Asia/Jakarta')::int dw, extract(hour from occurred_at at time zone 'Asia/Jakarta')::int jm, count(*) n
        from domain_events where kos_id = p_kos and member_in(area, p_kos) and (occurred_at at time zone 'Asia/Jakarta')::date between p_from and p_to group by 1, 2) z));
  end if;
  return v_res;
end $$;
revoke execute on function public.biz_recap(uuid, date, date, date, date, uuid, jsonb) from public, anon;
grant execute on function public.biz_recap(uuid, date, date, date, date, uuid, jsonb) to authenticated;

-- Daftar transaksi sumber untuk satu angka rekap (maks. 300 baris, terbaru dulu)
create or replace function public.recap_docs(p_kos uuid, p_kind text, p_from date, p_to date, p_branch uuid default null, p_key text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Periode tidak valid'; end if;
  if p_branch is not null and not plan_has(p_kos, 'analisis_mendalam') then raise exception 'BATAS_PAKET: Rekap per cabang tersedia di Paket Pro.'; end if;
  r := case p_kind
    when 'penjualan' then (select jsonb_agg(z order by z.tanggal desc, z.nomor desc) from (
        select s.id, s.number nomor, s.sale_date tanggal, s.total - s.tax_amount nilai, s.status, c.name pihak, s.pay_method info
        from sales s left join contacts c on c.id = s.contact_id
        where s.kos_id = p_kos and s.sale_date between p_from and p_to and (p_branch is null or s.branch_id = p_branch)
          and (p_key is null or (p_key = 'batal' and s.status = 'batal') or (p_key = 'diskon' and s.status = 'selesai' and s.discount > 0)
               or (p_key = 'tanpa_modal' and s.status = 'selesai' and exists (select 1 from sale_lines l where l.sale_id = s.id and l.cost = 0 and l.line_total > 0)))
          and (p_key is not null or s.status = 'selesai')
        order by s.sale_date desc, s.number desc limit 300) z)
    when 'retur' then (select jsonb_agg(z order by z.tanggal desc) from (
        select x.id, x.number nomor, x.return_date tanggal, x.total - x.tax_amount nilai, x.refund_method info, c.name pihak, x.sale_id
        from sale_returns x join sales s on s.id = x.sale_id left join contacts c on c.id = x.contact_id
        where x.kos_id = p_kos and x.return_date between p_from and p_to and (p_branch is null or s.branch_id = p_branch)
        order by x.return_date desc limit 300) z)
    when 'kategori' then (select jsonb_agg(z order by z.nilai desc) from (
        select l.product_id id, max(l.name) nomor, sum(l.qty * l.unit_qty) qty, round(sum(l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount), 2) nilai
        from sale_lines l join sales s on s.id = l.sale_id left join products p on p.id = l.product_id
        where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between p_from and p_to and (p_branch is null or s.branch_id = p_branch)
          and coalesce(p.category_id::text, '-') = coalesce(p_key, '-')
        group by l.product_id order by 4 desc limit 300) z)
    when 'pembelian' then (select jsonb_agg(z order by z.tanggal desc) from (
        select b.id, b.number nomor, b.purchase_date tanggal, b.total nilai, b.status, c.name pihak, b.pay_method info
        from purchases b left join contacts c on c.id = b.contact_id
        where b.kos_id = p_kos and b.status in ('selesai', 'sebagian') and b.purchase_date between p_from and p_to and (p_branch is null or b.branch_id = p_branch)
          and (p_key is null or b.contact_id::text = p_key or (p_key = '-' and b.contact_id is null))
        order by b.purchase_date desc limit 300) z)
    when 'pengeluaran' then (select jsonb_agg(z order by z.tanggal desc) from (
        select e.id, e.date tanggal, e.amount nilai, coalesce(c.name, 'Tanpa kategori') pihak, e.description nomor, e.kind info, e.account status
        from expenses e left join expense_categories c on c.id = e.category_id
        where e.kos_id = p_kos and e.date between p_from and p_to and (p_branch is null or e.branch_id = p_branch)
          and (p_key is null or e.category_id::text = p_key or (p_key = '-' and e.category_id is null) or e.kind = p_key)
        order by e.date desc, e.created_at desc limit 300) z)
    when 'stok' then (select jsonb_agg(z order by z.tanggal desc) from (
        select m.id, (m.created_at at time zone 'Asia/Jakarta')::date tanggal, p.name pihak, m.kind info, m.delta qty, m.value nilai, m.note nomor
        from stock_moves m join products p on p.id = m.product_id
        where m.kos_id = p_kos and m.kind <> 'transfer' and (m.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
          and (p_key is null or m.kind = any (string_to_array(p_key, ',')))
        order by m.created_at desc limit 300) z)
    when 'pesanan' then (select jsonb_agg(z order by z.tanggal desc) from (
        select o.id, o.number nomor, o.completed_date tanggal, o.total nilai, o.status, coalesce(c.name, o.customer_name) pihak, null info
        from svc_orders o left join contacts c on c.id = o.contact_id
        where o.kos_id = p_kos and o.status = 'selesai' and o.completed_date between p_from and p_to
        order by o.completed_date desc limit 300) z)
    when 'bayar_sewa' then (select jsonb_agg(z order by z.tanggal desc) from (
        select p.id, p.paid_at tanggal, p.amount nilai, p.method info, p.status, o.name pihak, r.code nomor
        from payments p left join invoices i on i.id = p.invoice_id left join occupants o on o.id = i.occupant_id left join rooms r on r.id = i.room_id
        where p.kos_id = p_kos and p.status = 'terverifikasi' and p.paid_at between p_from and p_to
        order by p.paid_at desc limit 300) z)
    when 'gaji' then (select jsonb_agg(z order by z.tanggal desc) from (
        select g.id, g.paid_date tanggal, g.total_net nilai, to_char(g.period, 'YYYY-MM') nomor, g.status, null pihak, g.account info
        from payroll_runs g where g.kos_id = p_kos and g.status = 'dibayar' and g.paid_date between p_from and p_to order by g.paid_date desc) z)
    when 'aset' then (select jsonb_agg(z order by z.tanggal desc) from (
        select a.id, coalesce(case when a.status = 'dilepas' and a.disposed_date between p_from and p_to then a.disposed_date end, a.start_date) tanggal,
               case when a.status = 'dilepas' and a.disposed_date between p_from and p_to then a.disposal_amount else a.cost end nilai,
               a.name nomor, case when a.status = 'dilepas' and a.disposed_date between p_from and p_to then 'dilepas · ' || a.disposal_kind else 'baru' end info, a.status, a.category pihak
        from fixed_assets a where a.kos_id = p_kos and (a.start_date between p_from and p_to or (a.status = 'dilepas' and a.disposed_date between p_from and p_to))) z)
    when 'tagihan_proyek' then (select jsonb_agg(z order by z.tanggal desc) from (
        select i.id, i.number nomor, i.issue_date tanggal, i.amount nilai, i.status, p.name pihak, p.number info
        from prj_invoices i join prj_projects p on p.id = i.project_id
        where i.kos_id = p_kos and i.status <> 'batal' and i.issue_date between p_from and p_to order by i.issue_date desc limit 300) z)
    when 'pelanggan' then (select jsonb_agg(z order by z.nilai desc) from (
        select b.contact_id id, c.name pihak, b.seg info, b.n_now qty, b.v_now nilai, b.last_d tanggal
        from biz_customer_rows(p_kos, p_from, p_to, p_branch) b join contacts c on c.id = b.contact_id
        where p_key is null or b.seg = p_key or (p_key = 'aktif' and b.n_now > 0) or (p_key = 'berulang' and b.n_now >= 2)
        order by b.v_now desc limit 300) z)
    else null end;
  if r is null and p_kind not in ('penjualan', 'retur', 'kategori', 'pembelian', 'pengeluaran', 'stok', 'pesanan', 'bayar_sewa', 'gaji', 'aset', 'tagihan_proyek', 'pelanggan') then
    raise exception 'Jenis rincian tidak dikenal'; end if;
  return coalesce(r, '[]');
end $$;
revoke execute on function public.recap_docs(uuid, text, date, date, uuid, text) from public, anon;
grant execute on function public.recap_docs(uuid, text, date, date, uuid, text) to authenticated;

-- Simpan arsip manual (periode yang sudah selesai)
create or replace function public.recap_save(p_kos uuid, p_kind text, p_from date, p_to date, p_branch uuid default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_kind not in ('harian', 'mingguan', 'bulanan', 'kuartalan', 'tahunan', 'kustom') then raise exception 'Jenis rekap tidak dikenal'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Periode tidak valid'; end if;
  if p_to >= (now() at time zone 'Asia/Jakarta')::date then raise exception 'Periode masih berjalan. Arsip dibuat setelah periode selesai.'; end if;
  if p_branch is not null and (not plan_has(p_kos, 'analisis_mendalam') or not exists (select 1 from branches where id = p_branch and kos_id = p_kos)) then
    raise exception 'BATAS_PAKET: Rekap per cabang tersedia di Paket Pro.'; end if;
  perform acct_sync_internal(p_kos);
  return recap_store(p_kos, p_kind, p_from, p_to, p_branch, 'manual', auth.uid(), p_note);
end $$;
revoke execute on function public.recap_save(uuid, text, date, date, uuid, text) from public, anon;
grant execute on function public.recap_save(uuid, text, date, date, uuid, text) to authenticated;

-- Daftar arsip (tanpa isi)
create or replace function public.recap_list(p_kos uuid, p_kind text default null, p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'from', s.period_from, 'to', s.period_to, 'branch_id', s.branch_id,
      'branch_name', b.name, 'version', s.version, 'source', s.source, 'note', s.note, 'created_at', s.created_at,
      'by', (select email from auth.users u where u.id = s.created_by),
      'pendapatan', s.data #> '{ringkas,pendapatan}', 'laba', s.data #> '{ringkas,laba}', 'transaksi', s.data #> '{ringkas,transaksi}',
      'terbaru', not exists (select 1 from recap_snapshots n where n.kos_id = s.kos_id and n.kind = s.kind and n.period_from = s.period_from
                              and n.period_to = s.period_to and n.branch_id is not distinct from s.branch_id and n.version > s.version))
    order by s.period_to desc, s.kind, s.version desc)
    from (select * from recap_snapshots where kos_id = p_kos and (p_kind is null or kind = p_kind)
          order by period_to desc, version desc limit least(greatest(coalesce(p_limit, 60), 1), 300)) s left join branches b on b.id = s.branch_id), '[]');
end $$;
revoke execute on function public.recap_list(uuid, text, int) from public, anon;
grant execute on function public.recap_list(uuid, text, int) to authenticated;

-- Buka satu arsip + bandingkan dengan data sekarang
create or replace function public.recap_get(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v recap_snapshots%rowtype; v_now text;
begin
  select * into v from recap_snapshots where id = p_id;
  if v.id is null or auth.uid() is null or not member_in('finance', v.kos_id) then raise exception 'Arsip tidak ditemukan'; end if;
  perform acct_sync_internal(v.kos_id);
  v_now := recap_hash(biz_recap_core(v.kos_id, v.period_from, v.period_to, v.branch_id));
  return jsonb_build_object('id', v.id, 'kind', v.kind, 'from', v.period_from, 'to', v.period_to, 'branch_id', v.branch_id, 'version', v.version,
    'source', v.source, 'note', v.note, 'created_at', v.created_at, 'data', v.data, 'berubah', v_now <> v.data_hash,
    'versi', (select jsonb_agg(jsonb_build_object('id', id, 'version', version, 'source', source, 'created_at', created_at) order by version desc)
              from recap_snapshots where kos_id = v.kos_id and kind = v.kind and period_from = v.period_from and period_to = v.period_to and branch_id is not distinct from v.branch_id));
end $$;
revoke execute on function public.recap_get(uuid) from public, anon;
grant execute on function public.recap_get(uuid) to authenticated;

-- =====================================================================================================
-- 4. Rekap otomatis (cron harian, service_role)
--    • arsip periode yang baru selesai: mingguan (Sen–Min), bulanan, kuartalan, tahunan — mengejar bila cron terlewat
--    • versi koreksi: bila data 2 bulan terakhir / minggu / kuartal / tahun terakhir yang sudah diarsipkan berubah
--    • dilewati: bisnis ditutup, belum aktif, atau tanpa jurnal & transaksi di periode itu
-- =====================================================================================================
create or replace function public.recap_auto_tick(p_limit int default 300)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date; y date; k record; p record; v_new int := 0; v_fix int := 0; v_err int := 0; v_n int := 0; x jsonb;
begin
  y := v_today - 1;
  for k in select id from kos where closed_at is null and coalesce(setup_status, 'active') = 'active'
             and exists (select 1 from acct_entries e where e.kos_id = kos.id and e.entry_date >= v_today - 400)
           order by id limit greatest(coalesce(p_limit, 300), 1) loop
    v_n := v_n + 1;
    perform acct_sync_internal(k.id);
    for p in
      select * from (values
        ('mingguan', (date_trunc('week', y + 1)::date - 7), (date_trunc('week', y + 1)::date - 1)),
        ('bulanan', (date_trunc('month', y + 1) - interval '1 month')::date, (date_trunc('month', y + 1)::date - 1)),
        ('bulanan', (date_trunc('month', y + 1) - interval '2 month')::date, ((date_trunc('month', y + 1) - interval '1 month')::date - 1)),
        ('kuartalan', (date_trunc('quarter', y + 1) - interval '3 month')::date, (date_trunc('quarter', y + 1)::date - 1)),
        ('tahunan', (date_trunc('year', y + 1) - interval '1 year')::date, (date_trunc('year', y + 1)::date - 1))) t(kind, f, t)
    loop
      begin
        -- tanpa aktivitas di periode itu → tidak diarsipkan
        if not exists (select 1 from acct_entries e where e.kos_id = k.id and e.entry_date between p.f and p.t)
           and not exists (select 1 from domain_events d where d.kos_id = k.id and (d.occurred_at at time zone 'Asia/Jakarta')::date between p.f and p.t) then
          continue;
        end if;
        -- periode bulan ke-2 ke belakang hanya diperiksa ulang (koreksi), tidak dibuat baru bila belum pernah ada
        if p.kind = 'bulanan' and p.t < (date_trunc('month', y + 1)::date - 1)
           and not exists (select 1 from recap_snapshots s where s.kos_id = k.id and s.kind = 'bulanan' and s.period_from = p.f and s.period_to = p.t and s.branch_id is null) then
          continue;
        end if;
        x := recap_store(k.id, p.kind, p.f, p.t, null, 'otomatis', null, null);
        if (x ->> 'baru')::boolean then
          if x ->> 'source' = 'koreksi' then v_fix := v_fix + 1; else v_new := v_new + 1; end if;
        end if;
      exception when others then v_err := v_err + 1;
      end;
    end loop;
  end loop;
  return jsonb_build_object('bisnis', v_n, 'arsip_baru', v_new, 'versi_koreksi', v_fix, 'gagal', v_err);
end $$;
revoke execute on function public.recap_auto_tick(int) from public, anon, authenticated;
grant execute on function public.recap_auto_tick(int) to service_role;

-- Pemberitahuan: arsip otomatis/koreksi terbaru (Notifikasi)
create or replace function public.recap_notice(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not member_in('finance', p_kos) then return '[]'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'from', period_from, 'to', period_to, 'version', version, 'source', source, 'created_at', created_at)
                   order by created_at desc)
                   from (select * from recap_snapshots where kos_id = p_kos and source in ('otomatis', 'koreksi') and created_at >= now() - interval '7 days'
                         order by created_at desc limit 5) z), '[]');
end $$;
revoke execute on function public.recap_notice(uuid) from public, anon;
grant execute on function public.recap_notice(uuid) to authenticated;
