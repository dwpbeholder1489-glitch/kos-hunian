-- Analisis Kinerja & Profitabilitas (Analisis Bisnis › Profitabilitas). Keputusan pemilik 28 Nov 2026:
--   • BEP: biaya TETAP = kategori pengeluaran bertanda "Biaya tetap bulanan" (expense_categories.fixed_monthly) + penyusutan + bunga;
--     sisanya variabel. Tanpa biaya tetap → BEP tidak dihitung (data belum cukup).
--   • Peluang terlewat (ESTIMASI, adaptif per jenis bisnis): stok habis (toko), kamar kosong (kos), pesanan batal (jasa/kuliner),
--     kas menganggur & piutang lambat (semua; butuh suku bunga acuan yang diisi pemilik — tanpa angka bawaan).
--   • Paket: Dasar = ringkasan (laba rugi, margin, BEP; bulan ini & bulan lalu); Bisnis (analisis_lanjutan) = semua analisis + drill-down;
--     Pro (analisis_mendalam) = filter & perbandingan cabang. Unit bisnis = cabang/lokasi.
-- TANPA tabel transaksi baru. Angka uang laba rugi dari JURNAL (sama dengan Pembukuan/biz_intel); per produk dari baris penjualan
-- (rumus retail_kpi); rumus rasio, BEP, kebocoran, peluang & rekomendasi HANYA di lib/profitability.js.

-- ---------- Setelan: suku bunga acuan untuk biaya peluang (kos.profile.profit.opp_rate, % per tahun) ----------
create or replace function public.profit_settings_set(p_kos uuid, p_rate numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old numeric;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if p_rate is not null and (p_rate < 0 or p_rate > 100 or p_rate <> round(p_rate, 2)) then raise exception 'Suku bunga 0–100%% per tahun, maks. 2 desimal'; end if;
  select nullif(profile -> 'profit' ->> 'opp_rate', '')::numeric into v_old from kos where id = p_kos;
  update kos set profile = jsonb_set(coalesce(profile, '{}'), '{profit}', coalesce(profile -> 'profit', '{}') || jsonb_build_object('opp_rate', p_rate)) where id = p_kos;
  if v_old is distinct from p_rate then
    perform config_log(p_kos, 'ubah_bunga_acuan', 'Suku bunga acuan biaya peluang', jsonb_build_object('rate', v_old), jsonb_build_object('rate', p_rate), null, 'rendah', null);
  end if;
  return jsonb_build_object('opp_rate', p_rate);
end $$;
revoke execute on function public.profit_settings_set(uuid, numeric) from public, anon;
grant execute on function public.profit_settings_set(uuid, numeric) to authenticated;

-- ---------- Baris jurnal laba rugi + tanda biaya tetap (internal) ----------
create or replace function public.profit_lines(p_kos uuid, p_from date, p_to date, p_branch uuid)
returns table(d date, cls text, acc uuid, acc_name text, tetap boolean, v numeric)
language sql stable security definer set search_path = public as $$
  select e.entry_date, biz_fin_class(a.type, coalesce(a.sys_key, '')), a.id, a.name,
         biz_fin_class(a.type, coalesce(a.sys_key, '')) in ('penyusutan', 'bunga')
           or (l.source_type = 'expense' and exists (select 1 from expenses x join expense_categories c on c.id = x.category_id
                                                      where x.id = l.source_id and c.fixed_monthly)),
         case when a.type = 'pendapatan' then l.credit - l.debit else l.debit - l.credit end
  from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
  where l.kos_id = p_kos and a.type in ('pendapatan', 'beban') and e.entry_date between p_from and p_to
    and (p_branch is null or acct_line_branch(l.source_type, l.source_id) = p_branch);
$$;
revoke execute on function public.profit_lines(uuid, date, date, uuid) from public, anon, authenticated;

-- Ringkasan kelas laba rugi: {cls: nilai} + tetap (bagian biaya tetap) + tetap_rinci
create or replace function public.profit_totals(p_kos uuid, p_from date, p_to date, p_branch uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with x as (select * from profit_lines(p_kos, p_from, p_to, p_branch))
  select coalesce((select jsonb_object_agg(cls, round(s, 2)) from (select cls, sum(v) s from x group by cls) z), '{}'::jsonb)
    || jsonb_build_object(
      'tetap', round(coalesce((select sum(v) from x where tetap and cls in ('beban_operasional', 'penyusutan', 'bunga')), 0), 2),
      'tetap_biaya', round(coalesce((select sum(v) from x where tetap and cls = 'beban_operasional'), 0), 2));
$$;
revoke execute on function public.profit_totals(uuid, date, date, uuid) from public, anon, authenticated;

-- Per produk (toko): omzet tanpa PPN − retur, HPP baris, jumlah satuan utama. Rumus sama dengan retail_kpi.
create or replace function public.profit_products(p_kos uuid, p_from date, p_to date, p_branch uuid, p_category uuid)
returns table(product_id uuid, omzet numeric, hpp numeric, qty numeric, lines bigint, tanpa_modal bigint)
language sql stable security definer set search_path = public as $$
  with s as (select * from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to and (p_branch is null or branch_id = p_branch)),
  rt as (select r.* from sale_returns r join sales s2 on s2.id = r.sale_id
         where r.kos_id = p_kos and r.return_date between p_from and p_to and (p_branch is null or s2.branch_id = p_branch)),
  ln as (
    select l.product_id, l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount as omzet,
           l.qty * l.unit_qty * l.cost as hpp, l.qty * l.unit_qty as q, 1 as n, case when coalesce(l.cost, 0) = 0 then 1 else 0 end as nocost
    from sale_lines l join s on s.id = l.sale_id
    union all
    select x.product_id, -x.amount, -x.qty * x.unit_qty * x.cost, -x.qty * x.unit_qty, 0, 0 from sale_return_lines x join rt on rt.id = x.return_id)
  select ln.product_id, round(sum(ln.omzet), 2), round(sum(ln.hpp), 2), round(sum(ln.q), 3), sum(ln.n)::bigint, sum(ln.nocost)::bigint
  from ln join products p on p.id = ln.product_id
  where p_category is null or p.category_id = p_category
  group by ln.product_id;
$$;
revoke execute on function public.profit_products(uuid, date, date, uuid, uuid) from public, anon, authenticated;

-- Per layanan / menu (jasa & kuliner): nilai baris setelah diskon pesanan; biaya bahan hanya bila ada resep
create or replace function public.profit_services(p_kos uuid, p_from date, p_to date)
returns table(name text, service_id uuid, omzet numeric, bahan numeric, qty numeric, lines bigint, beresep bigint)
language sql stable security definer set search_path = public as $$
  select l.name, l.service_id,
         round(sum(l.line_total * case when o.subtotal > 0 then (o.subtotal - o.discount) / o.subtotal else 1 end), 2),
         round(sum(l.recipe_cost), 2), round(sum(l.qty), 3), count(*), count(l.recipe_cost)
  from svc_order_lines l join svc_orders o on o.id = l.order_id
  where o.kos_id = p_kos and o.status = 'selesai' and o.completed_date between p_from and p_to
  group by l.name, l.service_id;
$$;
revoke execute on function public.profit_services(uuid, date, date) from public, anon, authenticated;

-- Per kamar (kos): uang masuk (pembayaran terverifikasi), hari terisi unik, tarif
create or replace function public.profit_rooms(p_kos uuid, p_from date, p_to date)
returns table(room_id uuid, code text, rent numeric, status text, masuk numeric, hari_terisi bigint, hari bigint)
language sql stable security definer set search_path = public as $$
  with lim as (select p_from a, least(p_to, (now() at time zone 'Asia/Jakarta')::date) b)
  select r.id, coalesce(nullif(r.name, ''), r.code), r.rent, r.status,
         coalesce((select sum(p.amount) from payments p join invoices i on i.id = p.invoice_id
                   where p.kos_id = p_kos and i.room_id = r.id and p.status = 'terverifikasi' and p.paid_at between p_from and p_to), 0),
         (select count(distinct g.d) from leases le cross join lim
            cross join lateral generate_series(greatest(le.start_date, lim.a), least(coalesce(le.end_date, lim.b), lim.b), interval '1 day') g(d)
          where le.kos_id = p_kos and le.room_id = r.id and le.start_date <= lim.b and (le.end_date is null or le.end_date >= lim.a)),
         (select greatest(0, b - a + 1) from lim)
  from rooms r where r.kos_id = p_kos and r.status <> 'tidak_disewakan';
$$;
revoke execute on function public.profit_rooms(uuid, date, date) from public, anon, authenticated;

-- Hari stok habis per produk (kartu stok: stock_after ≤ 0 sampai gerak berikutnya), dibatasi periode s.d. sekarang
create or replace function public.profit_stockout(p_kos uuid, p_from date, p_to date, p_category uuid)
returns table(product_id uuid, hari_habis numeric, habis_sekarang boolean)
language sql stable security definer set search_path = public as $$
  with lim as (select p_from::timestamp a, least((p_to + 1)::timestamp, (now() at time zone 'Asia/Jakarta')) b),
  mv as (
    select m.product_id, (m.created_at at time zone 'Asia/Jakarta') t, m.stock_after,
           lead(m.created_at at time zone 'Asia/Jakarta') over (partition by m.product_id order by m.created_at, m.id) nt
    from stock_moves m join products p on p.id = m.product_id
    where m.kos_id = p_kos and p.active and not p.is_kit and (p_category is null or p.category_id = p_category))
  select mv.product_id,
         round(sum(greatest(0, extract(epoch from (least(coalesce(mv.nt, lim.b), lim.b) - greatest(mv.t, lim.a))) / 86400))::numeric, 2),
         bool_or(mv.nt is null and mv.stock_after <= 0)
  from mv, lim where mv.stock_after <= 0 and mv.t < lim.b and coalesce(mv.nt, lim.b) > lim.a
  group by mv.product_id;
$$;
revoke execute on function public.profit_stockout(uuid, date, date, uuid) from public, anon, authenticated;

-- ---------- RPC utama ----------
create or replace function public.profit_analysis(p_kos uuid, p_from date, p_to date, p_cmp_from date default null, p_cmp_to date default null,
                                                  p_branch uuid default null, p_category uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date; v_level text; v_type text; v_tpl text; v_floor date; v_cmp_ok boolean := true;
  v_full boolean; v_deep boolean; v_res jsonb; v_m1 date; v_tfrom date; v_asof date; v_days int; v_multi boolean;
  v_open numeric; v_branch_name text; v_cat_name text;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Periode tidak valid'; end if;
  if p_from > v_today then raise exception 'Periode belum berjalan'; end if;
  if p_to - p_from > 400 then raise exception 'Periode maksimal sekitar 1 tahun (400 hari)'; end if;
  if (p_cmp_from is null) <> (p_cmp_to is null) or p_cmp_to < p_cmp_from or p_cmp_to - p_cmp_from > 400 then raise exception 'Periode pembanding tidak valid'; end if;
  perform acct_sync_internal(p_kos);
  v_level := case when plan_has(p_kos, 'analisis_mendalam') then 'mendalam' when plan_has(p_kos, 'analisis_lanjutan') then 'lanjutan' else 'dasar' end;
  v_full := v_level <> 'dasar'; v_deep := v_level = 'mendalam';
  select business_type, template_code into v_type, v_tpl from kos where id = p_kos;
  v_floor := (date_trunc('month', v_today) - interval '1 month')::date;
  if not v_full and p_from < v_floor then
    raise exception 'BATAS_PAKET: Paket Dasar menampilkan bulan ini dan bulan lalu. Periode lebih panjang tersedia mulai Paket Bisnis.'; end if;
  if v_full and p_from < (date_trunc('month', v_today) - interval '24 month')::date then raise exception 'Periode paling awal 24 bulan ke belakang'; end if;
  if not v_full and p_cmp_from is not null and p_cmp_from < v_floor then v_cmp_ok := false; end if;
  if p_branch is not null then
    if not v_deep then raise exception 'BATAS_PAKET: Analisis per cabang tersedia di Paket Pro.'; end if;
    select name into v_branch_name from branches where id = p_branch and kos_id = p_kos;
    if v_branch_name is null then raise exception 'Lokasi tidak ditemukan'; end if;
  end if;
  if p_category is not null then
    if not v_full then raise exception 'BATAS_PAKET: Analisis produk tersedia mulai Paket Bisnis.'; end if;
    select name into v_cat_name from product_categories where id = p_category and kos_id = p_kos;
    if v_cat_name is null then raise exception 'Kategori tidak ditemukan'; end if;
  end if;
  v_multi := (select count(*) from branches where kos_id = p_kos and active) > 1;
  v_asof := least(p_to, v_today); v_days := v_asof - p_from + 1;

  v_res := jsonb_build_object('level', v_level, 'jenis', v_type, 'template', v_tpl, 'from', p_from, 'to', p_to, 'hari_ini', v_today,
    'hari', p_to - p_from + 1, 'hari_berjalan', v_days,
    'cmp_from', case when v_cmp_ok then p_cmp_from end, 'cmp_to', case when v_cmp_ok then p_cmp_to end, 'cmp_terkunci', not v_cmp_ok,
    'branch', p_branch, 'branch_name', v_branch_name, 'category', p_category, 'category_name', v_cat_name, 'multi_lokasi', v_multi,
    'opp_rate', (select nullif(profile -> 'profit' ->> 'opp_rate', '')::numeric from kos where id = p_kos),
    'cur', profit_totals(p_kos, p_from, p_to, p_branch) || (select to_jsonb(t) - 'b' from biz_figures_total(p_kos, p_from, p_to, p_branch) t limit 1),
    'cmp', case when v_cmp_ok and p_cmp_from is not null then
             profit_totals(p_kos, p_cmp_from, p_cmp_to, p_branch) || (select to_jsonb(t) - 'b' from biz_figures_total(p_kos, p_cmp_from, p_cmp_to, p_branch) t limit 1) end,
    'kategori_tetap', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nama', name) order by name), '[]') from expense_categories where kos_id = p_kos and fixed_monthly),
    'kategori_biaya_n', (select count(*) from expense_categories where kos_id = p_kos));

  -- Tren bulanan (Dasar dijepit batas paket, lainnya 12 bulan) — kelas laba rugi + bagian biaya tetap
  v_m1 := date_trunc('month', p_to)::date;
  v_tfrom := greatest((v_m1 - make_interval(months => case when v_full then 11 else 1 end))::date,
                      case when v_full then (date_trunc('month', v_today) - interval '24 month')::date else v_floor end);
  v_res := v_res || jsonb_build_object('tren', (
    select coalesce(jsonb_agg(jsonb_build_object('mulai', g.b::date, 'v', profit_totals(p_kos, g.b::date, least((g.b + interval '1 month - 1 day')::date, p_to), p_branch)) order by g.b), '[]')
    from generate_series(v_tfrom, v_m1, interval '1 month') g(b)));

  -- Struktur biaya per akun & per kategori pengeluaran (cur & cmp)
  v_res := v_res || jsonb_build_object('akun', (
    select coalesce(jsonb_agg(jsonb_build_object('id', acc, 'nama', acc_name, 'cls', cls, 'cur', round(c, 2), 'cmp', round(p, 2), 'tetap', round(t, 2)) order by c desc), '[]') from (
      select acc, acc_name, cls, sum(v) filter (where k = 'c') c, coalesce(sum(v) filter (where k = 'p'), 0) p, coalesce(sum(v) filter (where k = 'c' and tetap), 0) t
      from (select 'c' k, * from profit_lines(p_kos, p_from, p_to, p_branch)
            union all select 'p', * from profit_lines(p_kos, p_cmp_from, p_cmp_to, p_branch) where v_cmp_ok and p_cmp_from is not null) z
      where cls in ('hpp', 'beban_operasional', 'penyusutan', 'bunga', 'beban_lain')
      group by acc, acc_name, cls having coalesce(sum(v) filter (where k = 'c'), 0) <> 0 or coalesce(sum(v) filter (where k = 'p'), 0) <> 0) q));
  v_res := v_res || jsonb_build_object('kategori_biaya', (
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nama', c.name, 'kind', c.kind, 'tetap', c.fixed_monthly, 'cur', x.cur, 'cmp', x.cmp, 'n', x.n,
             'anggaran', (select sum(b.amount) from budgets b where b.kos_id = p_kos and b.category_id = c.id and b.month between date_trunc('month', p_from)::date and p_to)) order by x.cur desc), '[]')
    from expense_categories c
    cross join lateral (select coalesce(sum(e.amount) filter (where e.date between p_from and p_to), 0) cur,
                               coalesce(sum(e.amount) filter (where v_cmp_ok and e.date between p_cmp_from and p_cmp_to), 0) cmp,
                               count(*) filter (where e.date between p_from and p_to) n
                        from expenses e where e.kos_id = p_kos and e.category_id = c.id and e.kind <> 'modal' and (p_branch is null or e.branch_id = p_branch)) x
    where c.kos_id = p_kos and (x.cur <> 0 or x.cmp <> 0)));

  if not v_full then return v_res; end if;

  -- ===== Paket Bisnis ke atas =====
  if v_type = 'retail' then
    v_res := v_res || jsonb_build_object('produk', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nama', p.name, 'kategori', coalesce(pc.name, 'Tanpa kategori'), 'kategori_id', pc.id,
               'omzet', coalesce(c.omzet, 0), 'hpp', coalesce(c.hpp, 0), 'qty', coalesce(c.qty, 0), 'baris', coalesce(c.lines, 0), 'tanpa_modal', coalesce(c.tanpa_modal, 0),
               'omzet_lalu', b.omzet, 'hpp_lalu', b.hpp, 'qty_lalu', b.qty) order by coalesce(c.omzet, 0) desc), '[]')
      from (select product_id from profit_products(p_kos, p_from, p_to, p_branch, p_category)
            union select product_id from profit_products(p_kos, p_cmp_from, p_cmp_to, p_branch, p_category) where v_cmp_ok and p_cmp_from is not null) ids
      join products p on p.id = ids.product_id left join product_categories pc on pc.id = p.category_id
      left join profit_products(p_kos, p_from, p_to, p_branch, p_category) c on c.product_id = p.id
      left join (select * from profit_products(p_kos, p_cmp_from, p_cmp_to, p_branch, p_category) where v_cmp_ok and p_cmp_from is not null) b on b.product_id = p.id));
  elsif v_type = 'jasa' and p_branch is null then
    v_res := v_res || jsonb_build_object('layanan', (
      select coalesce(jsonb_agg(jsonb_build_object('nama', c.name, 'id', c.service_id, 'omzet', c.omzet, 'bahan', c.bahan, 'qty', c.qty, 'baris', c.lines, 'beresep', c.beresep,
               'omzet_lalu', b.omzet) order by c.omzet desc), '[]')
      from profit_services(p_kos, p_from, p_to) c
      left join (select * from profit_services(p_kos, p_cmp_from, p_cmp_to) where v_cmp_ok and p_cmp_from is not null) b on b.name = c.name and b.service_id is not distinct from c.service_id));
  elsif v_type = 'properti' then
    v_res := v_res || jsonb_build_object('kamar', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.room_id, 'nama', c.code, 'tarif', c.rent, 'status', c.status, 'masuk', c.masuk, 'hari_terisi', c.hari_terisi, 'hari', c.hari,
               'masuk_lalu', b.masuk, 'hari_terisi_lalu', b.hari_terisi, 'hari_lalu', b.hari) order by c.masuk desc), '[]')
      from profit_rooms(p_kos, p_from, p_to) c
      left join (select * from profit_rooms(p_kos, p_cmp_from, p_cmp_to) where v_cmp_ok and p_cmp_from is not null) b on b.room_id = c.room_id));
  end if;

  -- Per cabang (Pro, tanpa filter cabang, > 1 lokasi aktif)
  if v_deep and v_multi and p_branch is null then
    -- Per lokasi aktif: kelas laba rugi + biaya tetap (profit_totals per cabang). Baris tanpa lokasi = total − Σ cabang (dihitung di lib).
    v_res := v_res || jsonb_build_object('cabang', (
      select coalesce(jsonb_agg(jsonb_build_object('id', br.id, 'nama', br.name, 'gudang', br.kind = 'gudang', 'v', profit_totals(p_kos, p_from, p_to, br.id)) order by br.is_main desc, br.name), '[]')
      from branches br where br.kos_id = p_kos and br.active));
  end if;

  -- Kebocoran laba (aktual dari catatan; piutang lama = risiko), adaptif per jenis
  v_res := v_res || jsonb_build_object('bocor', case
    when v_type = 'retail' then jsonb_build_object(
      'diskon_manual', (select jsonb_build_object('nilai', coalesce(sum(greatest(discount - coalesce(promo_discount, 0), 0)), 0), 'n', count(*) filter (where discount - coalesce(promo_discount, 0) > 0))
                        from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to and (p_branch is null or branch_id = p_branch)),
      'promo', (select jsonb_build_object('nilai', coalesce(sum(promo_discount), 0), 'n', count(*) filter (where coalesce(promo_discount, 0) > 0))
                from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to and (p_branch is null or branch_id = p_branch)),
      'bawah_modal', (select jsonb_build_object('nilai', coalesce(sum(rugi), 0), 'n', count(*)) from (
          select l.qty * l.unit_qty * l.cost - (l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount) rugi
          from sale_lines l join sales s on s.id = l.sale_id
          where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between p_from and p_to and (p_branch is null or s.branch_id = p_branch)) z where rugi >= 1),
      'susut', (select jsonb_build_object('nilai', coalesce(-sum(value), 0), 'n', count(*)) from stock_moves
                where kos_id = p_kos and kind in ('rusak', 'kedaluwarsa') and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to and (p_branch is null or branch_id = p_branch)),
      'selisih_stok', (select jsonb_build_object('nilai', coalesce(-sum(value), 0), 'n', count(*)) from stock_moves
                where kos_id = p_kos and kind in ('opname', 'koreksi') and value < 0 and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to and (p_branch is null or branch_id = p_branch)),
      'retur', (select jsonb_build_object('nilai', coalesce(sum(r.total), 0), 'n', count(*)) from sale_returns r join sales s on s.id = r.sale_id
                where r.kos_id = p_kos and r.return_date between p_from and p_to and (p_branch is null or s.branch_id = p_branch)),
      'batal', (select jsonb_build_object('nilai', coalesce(sum(total), 0), 'n', count(*)) from sales
                where kos_id = p_kos and status = 'batal' and sale_date between p_from and p_to and (p_branch is null or branch_id = p_branch)),
      'laci_kurang', case when p_branch is null then (select jsonb_build_object('nilai', coalesce(sum(expected_cash - counted_cash), 0), 'n', count(*)) from cash_shifts
                where kos_id = p_kos and closed_at is not null and counted_cash < expected_cash and (opened_at at time zone 'Asia/Jakarta')::date between p_from and p_to) end,
      'piutang_90', (select jsonb_build_object('nilai', coalesce(sum(open_amount), 0), 'n', count(*)) from receivable_open_core(p_kos) where due_date < v_asof - 90))
    when v_type = 'jasa' then jsonb_build_object(
      'diskon', (select jsonb_build_object('nilai', coalesce(sum(discount), 0), 'n', count(*) filter (where discount > 0)) from svc_orders
                 where kos_id = p_kos and status = 'selesai' and completed_date between p_from and p_to),
      'ganti_rugi', (select jsonb_build_object('nilai', coalesce(sum(compensation), 0), 'n', count(*) filter (where compensation > 0)) from svc_complaints
                     where kos_id = p_kos and resolved_at is not null and (resolved_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
      'kerja_ulang', (select jsonb_build_object('nilai', 0, 'n', count(*)) from svc_orders where kos_id = p_kos and rework_of is not null and status = 'selesai' and completed_date between p_from and p_to),
      'susut', (select jsonb_build_object('nilai', coalesce(-sum(value), 0), 'n', count(*)) from stock_moves
                where kos_id = p_kos and kind in ('rusak', 'kedaluwarsa') and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
      'batal', (select jsonb_build_object('nilai', coalesce(sum(total), 0), 'n', count(*)) from svc_orders
                where kos_id = p_kos and status = 'batal' and (received_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
      'piutang_90', (select jsonb_build_object('nilai', coalesce(sum(o.total - svc_paid(o.id)), 0), 'n', count(*)) from svc_orders o
                     where o.kos_id = p_kos and o.status = 'selesai' and o.total > svc_paid(o.id) and o.completed_date < v_asof - 90))
    when v_type = 'properti' then jsonb_build_object(
      'tunggakan', (select jsonb_build_object('nilai', coalesce(sum(greatest(i.amount - paid, 0)), 0), 'n', count(*) filter (where i.amount > paid)) from (
          select i.*, (select coalesce(sum(p.amount), 0) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi') paid
          from invoices i where i.kos_id = p_kos and i.status = 'terbit' and i.due_date between p_from and v_asof) i),
      'tagihan_batal', (select jsonb_build_object('nilai', coalesce(sum(amount), 0), 'n', count(*)) from invoices
          where kos_id = p_kos and status = 'batal' and due_date between p_from and p_to and coalesce(cancel_reason, '') not like 'Otomatis%'),
      'piutang_90', (select jsonb_build_object('nilai', coalesce(sum(greatest(i.amount - (select coalesce(sum(p.amount), 0) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi'), 0)), 0),
                       'n', count(*)) from invoices i where i.kos_id = p_kos and i.status = 'terbit' and i.due_date < v_asof - 90))
    else '{}'::jsonb end);

  -- Peluang yang terlewat (bahan mentah; ESTIMASI dihitung di lib)
  select coalesce(sum(case when a.sys_key in ('kas', 'bank') then l.debit - l.credit end), 0) into v_open
  from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
  where l.kos_id = p_kos and e.entry_date < p_from and a.sys_key in ('kas', 'bank');
  v_res := v_res || jsonb_build_object('peluang', jsonb_build_object(
    'stok_habis', case when v_type = 'retail' then (
        select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nama', p.name, 'hari_habis', o.hari_habis, 'habis_sekarang', o.habis_sekarang,
                 'qty', coalesce(c.qty, 0), 'omzet', coalesce(c.omzet, 0), 'hpp', coalesce(c.hpp, 0)) order by o.hari_habis desc), '[]')
        from profit_stockout(p_kos, p_from, p_to, p_category) o join products p on p.id = o.product_id
        left join profit_products(p_kos, p_from, p_to, null, p_category) c on c.product_id = o.product_id
        where o.hari_habis > 0 and p_branch is null) end,
    'kamar_kosong', case when v_type = 'properti' then (
        select coalesce(jsonb_agg(jsonb_build_object('id', room_id, 'nama', code, 'tarif', rent, 'status', status, 'hari_kosong', hari - hari_terisi) order by (hari - hari_terisi) * rent desc), '[]')
        from profit_rooms(p_kos, p_from, p_to) where hari > hari_terisi) end,
    'pesanan_batal', case when v_type = 'jasa' then (
        select jsonb_build_object('nilai', coalesce(sum(total), 0), 'n', count(*)) from svc_orders
        where kos_id = p_kos and status = 'batal' and (received_at at time zone 'Asia/Jakarta')::date between p_from and p_to) end,
    -- piutang lewat jatuh tempo: Σ (sisa × hari terlambat di dalam periode)
    'piutang_lambat', (select jsonb_build_object('sisa', coalesce(sum(amt), 0), 'rupiah_hari', coalesce(sum(amt * greatest(0, v_asof - greatest(due, p_from - 1))), 0), 'n', count(*)) from (
        select open_amount amt, due_date due from receivable_open_core(p_kos) where v_type = 'retail' and due_date < v_asof
        union all
        select greatest(i.amount - (select coalesce(sum(p.amount), 0) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi' and p.paid_at <= v_asof), 0), i.due_date
        from invoices i where v_type = 'properti' and i.kos_id = p_kos and i.status = 'terbit' and i.due_date < v_asof
        union all
        select o.total - svc_paid(o.id), o.completed_date from svc_orders o
        where v_type = 'jasa' and o.kos_id = p_kos and o.status = 'selesai' and o.total > svc_paid(o.id) and o.completed_date < v_asof) z where amt > 0),
    -- kas & bank: saldo rata-rata harian dan uang keluar per bulan (jurnal), tanpa filter cabang
    'kas', case when p_branch is null then (
        select jsonb_build_object('rata_saldo', round(avg(saldo), 2), 'keluar', round(sum(keluar), 2), 'hari', count(*), 'saldo_akhir', round((array_agg(saldo order by d desc))[1], 2))
        from (select g.d, v_open + coalesce(sum(x.net) over (order by g.d), 0) saldo, coalesce(x.keluar, 0) keluar
              from generate_series(p_from, v_asof, interval '1 day') g(d)
              left join (select e.entry_date dd, sum(l.debit - l.credit) net,
                                sum(l.credit) filter (where not exists (select 1 from acct_lines l2 join acct_accounts a2 on a2.id = l2.account_id
                                                      where l2.entry_id = l.entry_id and a2.sys_key in ('kas', 'bank') and l2.id <> l.id and l2.debit > 0)) keluar
                         from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
                         where l.kos_id = p_kos and a.sys_key in ('kas', 'bank') and e.entry_date between p_from and v_asof
                         group by 1) x on x.dd = g.d::date) s) end));

  -- Kualitas data
  v_res := v_res || jsonb_build_object('data', jsonb_build_object(
    'tanpa_modal', case when v_type = 'retail' then (select count(*) from sale_lines l join sales s on s.id = l.sale_id
                    where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between p_from and p_to and coalesce(l.cost, 0) = 0 and (p_branch is null or s.branch_id = p_branch)) end,
    'layanan_tanpa_resep', case when v_type = 'jasa' then (select count(*) from svc_order_lines l join svc_orders o on o.id = l.order_id
                    where o.kos_id = p_kos and o.status = 'selesai' and o.completed_date between p_from and p_to and l.recipe_cost is null) end,
    'jurnal_pertama', (select min(e.entry_date) from acct_entries e where e.kos_id = p_kos)));
  return v_res;
end $$;
revoke execute on function public.profit_analysis(uuid, date, date, date, date, uuid, uuid) from public, anon;
grant execute on function public.profit_analysis(uuid, date, date, date, date, uuid, uuid) to authenticated;

-- ---------- Rincian sampai transaksi asal (drill-down; Paket Bisnis ke atas) ----------
-- p_kind: product (key = produk) | expense (key = kategori pengeluaran) | room (key = kamar) | service (key = nama layanan)
--         | leak (key = kode kebocoran) | stock (key = produk; riwayat kartu stok)
create or replace function public.profit_docs(p_kos uuid, p_kind text, p_key text, p_from date, p_to date, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rows jsonb; v_asof date := least(p_to, (now() at time zone 'Asia/Jakarta')::date);
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if not plan_has(p_kos, 'analisis_lanjutan') then raise exception 'BATAS_PAKET: Rincian sampai transaksi tersedia mulai Paket Bisnis.'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Periode tidak valid'; end if;
  if p_branch is not null and not plan_has(p_kos, 'analisis_mendalam') then raise exception 'BATAS_PAKET: Analisis per cabang tersedia di Paket Pro.'; end if;
  if p_kind = 'product' then
    select jsonb_agg(r order by r->>'tanggal', r->>'ref') into v_rows from (
      select jsonb_build_object('tanggal', s.sale_date, 'ref', s.number, 'id', s.id, 'jenis', 'penjualan', 'qty', l.qty * l.unit_qty,
               'nilai', round(l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount, 2),
               'hpp', round(l.qty * l.unit_qty * l.cost, 2), 'link', '/penjualan?tanggal=' || s.sale_date) r
      from sale_lines l join sales s on s.id = l.sale_id
      where s.kos_id = p_kos and l.product_id::text = p_key and s.status = 'selesai' and s.sale_date between p_from and p_to and (p_branch is null or s.branch_id = p_branch)
      union all
      select jsonb_build_object('tanggal', r.return_date, 'ref', r.number, 'id', r.id, 'jenis', 'retur', 'qty', -x.qty * x.unit_qty, 'nilai', -x.amount,
               'hpp', -round(x.qty * x.unit_qty * x.cost, 2), 'link', '/penjualan?tanggal=' || r.return_date)
      from sale_return_lines x join sale_returns r on r.id = x.return_id join sales s on s.id = r.sale_id
      where r.kos_id = p_kos and x.product_id::text = p_key and r.return_date between p_from and p_to and (p_branch is null or s.branch_id = p_branch)
      limit 300) z;
  elsif p_kind = 'expense' then
    select jsonb_agg(jsonb_build_object('tanggal', e.date, 'ref', coalesce(nullif(e.description, ''), 'Pengeluaran'), 'id', e.id, 'jenis', 'pengeluaran', 'nilai', e.amount,
             'link', '/pengeluaran?bulan=' || to_char(e.date, 'YYYY-MM')) order by e.date) into v_rows
    from expenses e where e.kos_id = p_kos and e.category_id::text = p_key and e.kind <> 'modal' and e.date between p_from and p_to and (p_branch is null or e.branch_id = p_branch);
  elsif p_kind = 'room' then
    select jsonb_agg(jsonb_build_object('tanggal', p.paid_at, 'ref', coalesce(o.name, 'Penghuni'), 'id', p.id, 'jenis', 'pembayaran', 'nilai', p.amount,
             'link', '/pembayaran?bulan=' || to_char(p.paid_at, 'YYYY-MM')) order by p.paid_at) into v_rows
    from payments p join invoices i on i.id = p.invoice_id left join occupants o on o.id = i.occupant_id
    where p.kos_id = p_kos and i.room_id::text = p_key and p.status = 'terverifikasi' and p.paid_at between p_from and p_to;
  elsif p_kind = 'service' then
    select jsonb_agg(jsonb_build_object('tanggal', o.completed_date, 'ref', o.number, 'id', o.id, 'jenis', 'pesanan', 'qty', l.qty,
             'nilai', round(l.line_total * case when o.subtotal > 0 then (o.subtotal - o.discount) / o.subtotal else 1 end, 2), 'hpp', l.recipe_cost, 'link', '/pesanan') order by o.completed_date) into v_rows
    from svc_order_lines l join svc_orders o on o.id = l.order_id
    where o.kos_id = p_kos and l.name = p_key and o.status = 'selesai' and o.completed_date between p_from and p_to;
  elsif p_kind = 'stock' then
    select jsonb_agg(jsonb_build_object('tanggal', (m.created_at at time zone 'Asia/Jakarta')::date, 'ref', m.kind, 'id', m.id, 'jenis', 'stok', 'qty', m.delta,
             'sisa', m.stock_after, 'nilai', m.value, 'link', '/barang') order by m.created_at) into v_rows
    from stock_moves m where m.kos_id = p_kos and m.product_id::text = p_key and (m.created_at at time zone 'Asia/Jakarta')::date between p_from - 31 and p_to;
  elsif p_kind = 'leak' then
    if p_key in ('diskon_manual', 'promo') then
      select jsonb_agg(jsonb_build_object('tanggal', sale_date, 'ref', number, 'id', id, 'jenis', 'penjualan',
               'nilai', case when p_key = 'promo' then promo_discount else discount - coalesce(promo_discount, 0) end, 'link', '/penjualan?tanggal=' || sale_date) order by sale_date) into v_rows
      from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to and (p_branch is null or branch_id = p_branch)
        and case when p_key = 'promo' then coalesce(promo_discount, 0) > 0 else discount - coalesce(promo_discount, 0) > 0 end;
    elsif p_key = 'bawah_modal' then
      select jsonb_agg(r order by r->>'tanggal') into v_rows from (
        select jsonb_build_object('tanggal', s.sale_date, 'ref', s.number || ' · ' || l.name, 'id', s.id, 'jenis', 'penjualan', 'qty', l.qty * l.unit_qty,
                 'nilai', round(l.qty * l.unit_qty * l.cost - (l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount), 2),
                 'link', '/penjualan?tanggal=' || s.sale_date) r
        from sale_lines l join sales s on s.id = l.sale_id
        where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between p_from and p_to and (p_branch is null or s.branch_id = p_branch)
          and l.qty * l.unit_qty * l.cost - (l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount) >= 1) z;
    elsif p_key in ('susut', 'selisih_stok') then
      select jsonb_agg(jsonb_build_object('tanggal', (m.created_at at time zone 'Asia/Jakarta')::date, 'ref', p.name || ' · ' || m.kind, 'id', m.id, 'jenis', 'stok', 'qty', m.delta,
               'nilai', -m.value, 'link', '/barang') order by m.created_at) into v_rows
      from stock_moves m join products p on p.id = m.product_id
      where m.kos_id = p_kos and (m.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to and (p_branch is null or m.branch_id = p_branch)
        and case when p_key = 'susut' then m.kind in ('rusak', 'kedaluwarsa') else m.kind in ('opname', 'koreksi') and m.value < 0 end;
    elsif p_key = 'retur' then
      select jsonb_agg(jsonb_build_object('tanggal', r.return_date, 'ref', r.number, 'id', r.id, 'jenis', 'retur', 'nilai', r.total, 'link', '/penjualan?tanggal=' || r.return_date) order by r.return_date) into v_rows
      from sale_returns r join sales s on s.id = r.sale_id where r.kos_id = p_kos and r.return_date between p_from and p_to and (p_branch is null or s.branch_id = p_branch);
    elsif p_key = 'batal' then
      select jsonb_agg(x order by x->>'tanggal') into v_rows from (
        select jsonb_build_object('tanggal', sale_date, 'ref', number, 'id', id, 'jenis', 'penjualan', 'nilai', total, 'catatan', void_reason, 'link', '/penjualan?tanggal=' || sale_date) x
        from sales where kos_id = p_kos and status = 'batal' and sale_date between p_from and p_to and (p_branch is null or branch_id = p_branch)
        union all
        select jsonb_build_object('tanggal', (received_at at time zone 'Asia/Jakarta')::date, 'ref', number, 'id', id, 'jenis', 'pesanan', 'nilai', total, 'catatan', void_reason, 'link', '/pesanan')
        from svc_orders where kos_id = p_kos and status = 'batal' and (received_at at time zone 'Asia/Jakarta')::date between p_from and p_to) z;
    elsif p_key = 'laci_kurang' then
      select jsonb_agg(jsonb_build_object('tanggal', (opened_at at time zone 'Asia/Jakarta')::date, 'ref', 'Shift kasir', 'id', id, 'jenis', 'shift', 'nilai', expected_cash - counted_cash, 'link', '/penjualan') order by opened_at) into v_rows
      from cash_shifts where kos_id = p_kos and closed_at is not null and counted_cash < expected_cash and (opened_at at time zone 'Asia/Jakarta')::date between p_from and p_to;
    elsif p_key = 'diskon' then
      select jsonb_agg(jsonb_build_object('tanggal', completed_date, 'ref', number, 'id', id, 'jenis', 'pesanan', 'nilai', discount, 'link', '/pesanan') order by completed_date) into v_rows
      from svc_orders where kos_id = p_kos and status = 'selesai' and discount > 0 and completed_date between p_from and p_to;
    elsif p_key = 'ganti_rugi' then
      select jsonb_agg(jsonb_build_object('tanggal', (resolved_at at time zone 'Asia/Jakarta')::date, 'ref', 'Keluhan', 'id', id, 'jenis', 'keluhan', 'nilai', compensation, 'link', '/pesanan') order by resolved_at) into v_rows
      from svc_complaints where kos_id = p_kos and resolved_at is not null and compensation > 0 and (resolved_at at time zone 'Asia/Jakarta')::date between p_from and p_to;
    elsif p_key = 'kerja_ulang' then
      select jsonb_agg(jsonb_build_object('tanggal', completed_date, 'ref', number, 'id', id, 'jenis', 'pesanan', 'nilai', total, 'link', '/pesanan') order by completed_date) into v_rows
      from svc_orders where kos_id = p_kos and rework_of is not null and status = 'selesai' and completed_date between p_from and p_to;
    elsif p_key in ('tunggakan', 'tagihan_batal') then
      select jsonb_agg(jsonb_build_object('tanggal', i.due_date, 'ref', coalesce(o.name, 'Penghuni') || ' · ' || i.kind, 'id', i.id, 'jenis', 'tagihan',
               'nilai', case when p_key = 'tunggakan' then i.amount - i.paid else i.amount end, 'catatan', i.cancel_reason, 'link', '/tagihan') order by i.due_date) into v_rows
      from (select i.*, (select coalesce(sum(p.amount), 0) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi') paid from invoices i where i.kos_id = p_kos) i
      left join occupants o on o.id = i.occupant_id
      where case when p_key = 'tunggakan' then i.status = 'terbit' and i.due_date between p_from and v_asof and i.amount > i.paid
                 else i.status = 'batal' and i.due_date between p_from and p_to and coalesce(i.cancel_reason, '') not like 'Otomatis%' end;
    elsif p_key = 'piutang_90' then
      select jsonb_agg(x order by x->>'tanggal') into v_rows from (
        select jsonb_build_object('tanggal', r.due_date, 'ref', r.number || coalesce(' · ' || c.name, ''), 'id', r.sale_id, 'jenis', 'piutang', 'nilai', r.open_amount, 'link', '/pembukuan?tab=umur') x
        from receivable_open_core(p_kos) r left join contacts c on c.id = r.contact_id where r.due_date < v_asof - 90
        union all
        select jsonb_build_object('tanggal', i.due_date, 'ref', 'Tagihan sewa', 'id', i.id, 'jenis', 'tagihan',
                 'nilai', i.amount - (select coalesce(sum(p.amount), 0) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi'), 'link', '/tagihan')
        from invoices i where i.kos_id = p_kos and i.status = 'terbit' and i.due_date < v_asof - 90
          and i.amount > (select coalesce(sum(p.amount), 0) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi')
        union all
        select jsonb_build_object('tanggal', o.completed_date, 'ref', o.number, 'id', o.id, 'jenis', 'pesanan', 'nilai', o.total - svc_paid(o.id), 'link', '/pesanan')
        from svc_orders o where o.kos_id = p_kos and o.status = 'selesai' and o.total > svc_paid(o.id) and o.completed_date < v_asof - 90) z;
    else raise exception 'Jenis rincian tidak dikenal';
    end if;
  else raise exception 'Jenis rincian tidak dikenal';
  end if;
  return jsonb_build_object('kind', p_kind, 'key', p_key, 'rows', coalesce(v_rows, '[]'::jsonb));
end $$;
revoke execute on function public.profit_docs(uuid, text, text, date, date, uuid) from public, anon;
grant execute on function public.profit_docs(uuid, text, text, date, date, uuid) to authenticated;
