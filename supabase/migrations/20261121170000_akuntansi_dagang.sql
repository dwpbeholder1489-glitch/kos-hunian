-- Tahap 2 Retail: Fondasi akuntansi dagang (Master Prompt Retail Bagian 16–17, Blueprint §12).
-- Neraca saldo, umur piutang & utang, nilai persediaan, indikator grosir. TANPA tabel baru: semua angka dari
-- sumber yang sama dengan laporan lama —
--   • neraca saldo  = jurnal (acct_lines/acct_entries), sama dengan Pembukuan;
--   • umur utang     = komponen contact_balance pemasok (beli utang, tambahan faktur, titipan terjual − bayar − retur),
--                      dibagi ke dokumen terlama dulu (FIFO) seperti receivable_open → total = saldo pemasok;
--   • nilai persediaan = kartu stok (stock_moves.delta/value, tanggal Jakarta) — rumus sama dengan retail_kpi;
--   • indikator grosir = sales/sale_lines/sale_returns (rumus omzet & HPP sama dengan retail_kpi), so_orders/so_lines/so_deliveries.

-- 1. Neraca saldo ------------------------------------------------------------------------------------
-- Tanpa fitur laporan_lanjutan: akun aset/kewajiban/ekuitas diringkas jadi 3 baris (aturan sama dengan acct_report_scope).
-- Tetap seimbang karena jumlah seluruh saldo jurnal = 0.
create or replace function public.acct_trial_balance(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_full boolean; v_rows jsonb;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Periode tidak valid'; end if;
  perform acct_sync_internal(p_kos);
  v_full := plan_has(p_kos, 'laporan_lanjutan');
  with a as (
    select ac.code, ac.name, ac.type, ac.sys_key,
      round(coalesce(sum(l.debit - l.credit) filter (where e.entry_date < p_from), 0), 2) awal,
      round(coalesce(sum(l.debit) filter (where e.entry_date between p_from and p_to), 0), 2) debit,
      round(coalesce(sum(l.credit) filter (where e.entry_date between p_from and p_to), 0), 2) kredit,
      round(coalesce(sum(l.debit - l.credit) filter (where e.entry_date <= p_to), 0), 2) akhir
    from acct_accounts ac
    left join acct_lines l on l.account_id = ac.id
    left join acct_entries e on e.id = l.entry_id
    where ac.kos_id = p_kos
    group by ac.code, ac.name, ac.type, ac.sys_key
  ), b as (
    select code, name, type, sys_key, awal, debit, kredit, akhir, false ringkas
    from a where v_full or type in ('pendapatan', 'beban')
    union all
    select case type when 'aset' then '1' when 'kewajiban' then '2' else '3' end,
           case type when 'aset' then 'Seluruh aset' when 'kewajiban' then 'Seluruh kewajiban' else 'Seluruh ekuitas (modal)' end,
           type, null, sum(awal), sum(debit), sum(kredit), sum(akhir), true
    from a where not v_full and type in ('aset', 'kewajiban', 'ekuitas') group by type
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', code, 'name', name, 'type', type, 'sys_key', sys_key, 'ringkas', ringkas,
      'awal', awal, 'debit', debit, 'kredit', kredit, 'akhir', akhir,
      'akhir_debit', greatest(akhir, 0), 'akhir_kredit', greatest(-akhir, 0)) order by code), '[]'::jsonb)
  into v_rows
  from b where awal <> 0 or debit <> 0 or kredit <> 0 or akhir <> 0;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'ringkas', not v_full, 'rows', v_rows,
    'total', (select jsonb_build_object(
        'debit', coalesce(sum((r->>'debit')::numeric), 0), 'kredit', coalesce(sum((r->>'kredit')::numeric), 0),
        'akhir_debit', coalesce(sum((r->>'akhir_debit')::numeric), 0), 'akhir_kredit', coalesce(sum((r->>'akhir_kredit')::numeric), 0))
      from jsonb_array_elements(v_rows) r),
    'seimbang', (select abs(coalesce(sum((r->>'akhir_debit')::numeric), 0) - coalesce(sum((r->>'akhir_kredit')::numeric), 0)) < 0.01
                    and abs(coalesce(sum((r->>'debit')::numeric), 0) - coalesce(sum((r->>'kredit')::numeric), 0)) < 0.01
                 from jsonb_array_elements(v_rows) r));
end $$;
revoke execute on function public.acct_trial_balance(uuid, date, date) from public, anon;
grant execute on function public.acct_trial_balance(uuid, date, date) to authenticated;

-- 2. Utang pemasok per dokumen (pasangan receivable_open) --------------------------------------------
-- Dokumen: belanja utang (jatuh tempo = due_date atau tanggal beli), tambahan faktur yang diposting (PPN masukan +
-- selisih harga, jatuh tempo faktur), titipan terjual per hari (tanpa jatuh tempo — setor sesuai kesepakatan).
-- Pengurang: pembayaran utang, retur potong utang, tambahan faktur negatif, titipan kembali bersih negatif.
-- Pengurang dialokasikan ke dokumen terlama dulu → jumlah sisa = contact_balance pemasok (bila positif).
create or replace function public.payable_open(p_kos uuid, p_contact uuid default null)
returns table(contact_id uuid, doc_type text, doc_id uuid, number text, doc_date date, due_date date, amount numeric, open_amount numeric)
language sql stable security definer set search_path = public as $$
  with sup as (
    select c.id from contacts c where c.kos_id = p_kos and c.kind = 'supplier' and (p_contact is null or c.id = p_contact)
  ), cons as (
    select p.consign_contact_id cid, (m.created_at at time zone 'Asia/Jakarta')::date d, sum(-m.value) amt
    from stock_moves m join products p on p.id = m.product_id join sup on sup.id = p.consign_contact_id
    where m.kind not in ('titip', 'titip_kembali', 'transfer')
    group by 1, 2
  ), items as (
    select p.contact_id cid, 'beli'::text dt, 1 ord, p.id, p.number, p.purchase_date d, coalesce(p.due_date, p.purchase_date) due, p.total amt
    from purchases p join sup on sup.id = p.contact_id
    where p.pay_method = 'utang' and p.status in ('selesai', 'sebagian') and p.total > 0
    union all
    select si.contact_id, 'faktur', 2, si.id, coalesce(nullif(si.supplier_no, ''), si.number), si.invoice_date, coalesce(si.due_date, si.invoice_date), si.variance + si.tax_amount
    from supplier_invoices si join sup on sup.id = si.contact_id
    where si.status = 'diposting' and si.variance + si.tax_amount > 0
    union all
    select cid, 'titipan', 3, null::uuid, 'Titipan terjual', d, null::date, amt from cons where amt > 0
  ), credits as (
    select sup.id cid,
      coalesce((select sum(dp.amount) from debt_payments dp where dp.contact_id = sup.id and dp.kind = 'utang' and dp.status = 'selesai'), 0)
      + coalesce((select sum(r.total) from purchase_returns r where r.contact_id = sup.id and r.refund_method = 'potong_utang'), 0)
      - coalesce((select sum(si.variance + si.tax_amount) from supplier_invoices si where si.contact_id = sup.id and si.status = 'diposting' and si.variance + si.tax_amount < 0), 0)
      - coalesce((select sum(cons.amt) from cons where cons.cid = sup.id and cons.amt < 0), 0) amt
    from sup
  ), c as (
    select i.*, sum(i.amt) over (partition by i.cid order by i.d, i.ord, i.number, i.id) cum from items i
  )
  select c.cid, c.dt, c.id, c.number, c.d, c.due, c.amt, least(c.amt, greatest(0, c.cum - coalesce(cr.amt, 0)))
  from c left join credits cr on cr.cid = c.cid
  where member_in('finance', p_kos) and c.cum - coalesce(cr.amt, 0) > 0.009;
$$;
revoke execute on function public.payable_open(uuid, uuid) from public, anon;
grant execute on function public.payable_open(uuid, uuid) to authenticated;

-- 3. Umur piutang / utang -----------------------------------------------------------------------------
-- Kelompok umur dihitung dari JATUH TEMPO (bukan tanggal transaksi) terhadap hari ini (Asia/Jakarta).
-- Rentang bisa dipilih (p_edges = 3 batas naik, mis. {30,60,90} atau {7,14,30}).
create or replace function public.aging_report(p_kos uuid, p_kind text, p_edges int[] default array[30, 60, 90])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; e1 int; e2 int; e3 int; v_out jsonb;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_kind is null or p_kind not in ('piutang', 'utang') then raise exception 'Pilih piutang atau utang'; end if;
  if coalesce(array_length(p_edges, 1), 0) <> 3 or p_edges[1] < 1 or p_edges[2] <= p_edges[1] or p_edges[3] <= p_edges[2] or p_edges[3] > 3650 then
    raise exception 'Rentang umur tidak valid (tiga batas hari yang naik, mis. 30, 60, 90)';
  end if;
  e1 := p_edges[1]; e2 := p_edges[2]; e3 := p_edges[3];

  with docs as (
    select r.contact_id, 'jual'::text doc_type, r.sale_id doc_id, r.number, r.sale_date doc_date, r.due_date, r.amount, r.open_amount
    from receivable_open(p_kos) r where p_kind = 'piutang'
    union all
    select u.contact_id, u.doc_type, u.doc_id, u.number, u.doc_date, u.due_date, u.amount, u.open_amount
    from payable_open(p_kos) u where p_kind = 'utang'
  ), b as (
    select d.*,
      case when d.due_date is null then null else greatest(v_today - d.due_date, 0) end late,
      case when d.due_date is null then 'tanpa'
           when v_today <= d.due_date then 'belum'
           when v_today - d.due_date <= e1 then 'b1'
           when v_today - d.due_date <= e2 then 'b2'
           when v_today - d.due_date <= e3 then 'b3'
           else 'b4' end bucket
    from docs d
  )
  select jsonb_build_object(
    'kind', p_kind, 'asof', v_today, 'edges', to_jsonb(p_edges),
    'rows', coalesce((select jsonb_agg(q.r order by (q.r->>'total')::numeric desc) from (
        select jsonb_build_object(
          'contact_id', c.id, 'name', c.name, 'phone', c.phone, 'sales_user', c.sales_user,
          'total', round(sum(b.open_amount), 2),
          'belum', round(coalesce(sum(b.open_amount) filter (where b.bucket = 'belum'), 0), 2),
          'b1', round(coalesce(sum(b.open_amount) filter (where b.bucket = 'b1'), 0), 2),
          'b2', round(coalesce(sum(b.open_amount) filter (where b.bucket = 'b2'), 0), 2),
          'b3', round(coalesce(sum(b.open_amount) filter (where b.bucket = 'b3'), 0), 2),
          'b4', round(coalesce(sum(b.open_amount) filter (where b.bucket = 'b4'), 0), 2),
          'tanpa', round(coalesce(sum(b.open_amount) filter (where b.bucket = 'tanpa'), 0), 2),
          'max_late', max(b.late),
          'docs', jsonb_agg(jsonb_build_object('doc_type', b.doc_type, 'doc_id', b.doc_id, 'number', b.number, 'doc_date', b.doc_date,
                    'due_date', b.due_date, 'amount', b.amount, 'open', b.open_amount, 'late', b.late, 'bucket', b.bucket) order by b.doc_date, b.number)) r
        from b join contacts c on c.id = b.contact_id
        group by c.id, c.name, c.phone, c.sales_user) q), '[]'::jsonb),
    'total', (select jsonb_build_object(
        'total', round(coalesce(sum(open_amount), 0), 2),
        'belum', round(coalesce(sum(open_amount) filter (where bucket = 'belum'), 0), 2),
        'b1', round(coalesce(sum(open_amount) filter (where bucket = 'b1'), 0), 2),
        'b2', round(coalesce(sum(open_amount) filter (where bucket = 'b2'), 0), 2),
        'b3', round(coalesce(sum(open_amount) filter (where bucket = 'b3'), 0), 2),
        'b4', round(coalesce(sum(open_amount) filter (where bucket = 'b4'), 0), 2),
        'tanpa', round(coalesce(sum(open_amount) filter (where bucket = 'tanpa'), 0), 2),
        'kontak', count(distinct contact_id), 'dokumen', count(*)) from b),
    -- Lebih bayar (saldo negatif) tidak masuk umur; ditampilkan terpisah agar total tetap jujur
    'lebih_bayar', (select coalesce(jsonb_agg(jsonb_build_object('contact_id', x.id, 'name', x.name, 'amount', x.amt) order by x.amt desc), '[]'::jsonb)
        from (select c.id, c.name, round(-contact_balance(c.id), 2) amt from contacts c
              where c.kos_id = p_kos and c.kind = case p_kind when 'piutang' then 'pelanggan' else 'supplier' end) x
        where x.amt > 0.009)
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.aging_report(uuid, text, int[]) from public, anon;
grant execute on function public.aging_report(uuid, text, int[]) to authenticated;

-- 4. Nilai persediaan --------------------------------------------------------------------------------
-- Per barang pada akhir tanggal p_asof (kosong = hari ini): jumlah = Σ delta selain 'transfer' (barang dalam
-- perjalanan tetap milik sendiri), nilai = Σ value (HPP rata-rata bergerak). Titipan konsinyasi ditampilkan
-- terpisah (ada di akun Persediaan tetapi bukan milik toko). Dibandingkan dengan saldo akun Persediaan di buku besar.
-- Per lokasi (bila >1 lokasi aktif) = jumlah di lokasi × modal rata-rata barang itu.
create or replace function public.inventory_valuation(p_kos uuid, p_asof date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; v_asof date; v_buku numeric; v_multi boolean; v_out jsonb;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  v_asof := least(coalesce(p_asof, v_today), v_today);
  perform acct_sync_internal(p_kos);
  select round(coalesce(sum(l.debit - l.credit), 0), 2) into v_buku
  from acct_lines l join acct_accounts a on a.id = l.account_id join acct_entries e on e.id = l.entry_id
  where a.kos_id = p_kos and a.sys_key = 'persediaan' and e.entry_date <= v_asof;
  v_multi := (select count(*) from branches where kos_id = p_kos and active) > 1;

  with mv as (
    select m.product_id, m.branch_id, m.kind, m.delta, m.value
    from stock_moves m where m.kos_id = p_kos and (m.created_at at time zone 'Asia/Jakarta')::date <= v_asof
  ), pr as (
    select p.id, p.name, p.base_unit, (p.consign_contact_id is not null) consign, coalesce(pc.name, 'Tanpa kategori') cat,
      round(coalesce(sum(mv.delta) filter (where mv.kind <> 'transfer'), 0), 3) qty,
      round(coalesce(sum(mv.value), 0), 2) val
    from products p
    left join product_categories pc on pc.id = p.category_id
    left join mv on mv.product_id = p.id
    where p.kos_id = p_kos
    group by p.id, p.name, p.base_unit, p.consign_contact_id, pc.name
  ), loc as (
    select coalesce(mv.branch_id, branch_main_id(p_kos)) branch_id, mv.product_id, sum(mv.delta) qty from mv group by 1, 2
  )
  select jsonb_build_object(
    'asof', v_asof,
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('product_id', id, 'name', name, 'unit', base_unit, 'category', cat, 'consign', consign,
               'qty', qty, 'value', val, 'avg_cost', case when qty > 0 then round(val / qty, 2) end) order by val desc, name), '[]'::jsonb)
             from pr where qty <> 0 or val <> 0),
    'total', (select jsonb_build_object(
               'own', round(coalesce(sum(val) filter (where not consign), 0), 2),
               'consign', round(coalesce(sum(val) filter (where consign), 0), 2),
               'all', round(coalesce(sum(val), 0), 2),
               'items', count(*) filter (where qty > 0),
               'minus', count(*) filter (where qty < 0)) from pr),
    'per_kategori', (select coalesce(jsonb_agg(jsonb_build_object('category', cat, 'value', v, 'items', n) order by v desc), '[]'::jsonb)
             from (select cat, round(sum(val), 2) v, count(*) filter (where qty > 0) n from pr where not consign group by cat) k where v <> 0 or n > 0),
    'per_lokasi', case when v_multi then (select coalesce(jsonb_agg(jsonb_build_object('branch_id', z.branch_id, 'name', z.name, 'qty', z.q, 'value', z.val) order by z.name), '[]'::jsonb) from (
               select l.branch_id, coalesce(br.name, 'Lokasi utama') name, round(sum(l.qty), 3) q,
                      round(sum(l.qty * case when pr.qty > 0 then pr.val / pr.qty else 0 end), 2) val
               from loc l join pr on pr.id = l.product_id left join branches br on br.id = l.branch_id
               group by l.branch_id, br.name) z) end,
    'transit', (select round(coalesce(sum((pr.qty - coalesce(lq.q, 0)) * case when pr.qty > 0 then pr.val / pr.qty else 0 end), 0), 2)
             from pr left join (select product_id, sum(qty) q from loc group by product_id) lq on lq.product_id = pr.id),
    -- Pembanding buku besar HANYA untuk posisi hari ini: jurnal memakai tanggal dokumen, kartu stok memakai waktu dicatat,
    -- sehingga untuk tanggal lampau dokumen bertanggal mundur akan tampak sebagai selisih semu.
    'basis', 'waktu_dicatat',
    'buku', case when v_asof = v_today then v_buku end,
    'selisih', case when v_asof = v_today then round(v_buku - (select coalesce(sum(val), 0) from pr), 2) end
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.inventory_valuation(uuid, date) from public, anon;
grant execute on function public.inventory_valuation(uuid, date) to authenticated;

-- 5. Indikator grosir (Master Prompt Bagian 17 "Wholesale KPIs") -------------------------------------
-- Rumus tertulis di keterangan tiap angka (UI). Omzet = baris penjualan × total/subtotal − PPN − retur (sama dengan retail_kpi).
create or replace function public.wholesale_kpi(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_days int; v_open numeric; v_credit numeric; v_collect numeric; v_cust jsonb;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Periode tidak valid'; end if;
  v_days := p_to - p_from + 1;
  select coalesce(sum(open_amount), 0) into v_open from receivable_open(p_kos);
  select coalesce(sum(amt_kasbon), 0) into v_credit from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to;
  select coalesce(sum(amount), 0) into v_collect from debt_payments where kos_id = p_kos and kind = 'piutang' and status = 'selesai' and date between p_from and p_to;

  with s as (select * from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to and contact_id is not null),
  rt as (select * from sale_returns where kos_id = p_kos and return_date between p_from and p_to and contact_id is not null),
  ln as (
    select s.contact_id, l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount omzet, l.qty * l.unit_qty * l.cost hpp, s.id sale_id
    from sale_lines l join s on s.id = l.sale_id
    union all
    select rt.contact_id, -(x.amount), -(x.qty * x.unit_qty * x.cost), null
    from sale_return_lines x join rt on rt.id = x.return_id
  ), cu as (
    select c.id, c.name, c.tipe, c.sales_user, round(sum(ln.omzet), 2) omzet, round(sum(ln.hpp), 2) hpp, count(distinct ln.sale_id) trx,
      round(coalesce((select sum(open_amount) from receivable_open(p_kos, c.id)), 0), 2) piutang, c.credit_limit
    from ln join contacts c on c.id = ln.contact_id group by c.id, c.name, c.tipe, c.sales_user, c.credit_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object('contact_id', id, 'name', name, 'tipe', tipe, 'sales_user', sales_user, 'omzet', omzet, 'hpp', hpp,
           'laba', omzet - hpp, 'margin_pct', case when omzet > 0 then round(100 * (omzet - hpp) / omzet, 1) end, 'trx', trx,
           'piutang', piutang, 'limit', credit_limit,
           'pakai_limit_pct', case when credit_limit > 0 then round(100 * piutang / credit_limit, 1) end) order by omzet desc), '[]'::jsonb)
  into v_cust from cu;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'days', v_days,
    'piutang', round(v_open, 2), 'penjualan_kredit', round(v_credit, 2), 'tertagih', round(v_collect, 2),
    -- DSO = piutang saat ini ÷ rata-rata penjualan kredit per hari pada periode
    'dso', case when v_credit > 0 then round(v_open / (v_credit / v_days)) end,
    'pelanggan', v_cust,
    'per_sales', (select coalesce(jsonb_agg(jsonb_build_object('sales_user', su, 'omzet', o, 'laba', l, 'margin_pct', case when o > 0 then round(100 * l / o, 1) end,
                    'pelanggan', n, 'piutang', p) order by o desc), '[]'::jsonb)
                  from (select x->>'sales_user' su, sum((x->>'omzet')::numeric) o, sum((x->>'laba')::numeric) l, count(*) n, sum((x->>'piutang')::numeric) p
                        from jsonb_array_elements(v_cust) x group by 1) z),
    'pesanan', (select jsonb_build_object(
        'jumlah', count(*), 'nilai', round(coalesce(sum(o.total), 0), 2),
        'rata_rata', case when count(*) > 0 then round(sum(o.total) / count(*), 2) end,
        -- fill rate nilai = Σ terkirim × harga ÷ Σ dipesan × harga (pesanan dikonfirmasi di periode, tidak batal)
        'fill_rate_pct', (select case when sum(l.qty * l.price) > 0 then round(100 * sum(least(l.qty_sent, l.qty) * l.price) / sum(l.qty * l.price), 1) end
                          from so_lines l where l.order_id = any(array_agg(o.id))),
        'lengkap', count(*) filter (where not exists (select 1 from so_lines l where l.order_id = o.id and l.qty_sent < l.qty)))
      from so_orders o
      where o.kos_id = p_kos and o.status in ('dikonfirmasi', 'sebagian', 'selesai') and (o.confirmed_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'kirim', (select jsonb_build_object(
        'jumlah', count(*), 'gagal', count(*) filter (where d.status = 'gagal'),
        'dengan_target', count(*) filter (where d.status <> 'gagal' and o.need_date is not null),
        'tepat_waktu', count(*) filter (where d.status <> 'gagal' and o.need_date is not null and d.ship_date <= o.need_date),
        -- tepat waktu = surat jalan (tidak gagal) dengan tanggal kirim ≤ tanggal dibutuhkan pesanan
        'tepat_pct', case when count(*) filter (where d.status <> 'gagal' and o.need_date is not null) > 0
                       then round(100.0 * count(*) filter (where d.status <> 'gagal' and o.need_date is not null and d.ship_date <= o.need_date)
                                  / count(*) filter (where d.status <> 'gagal' and o.need_date is not null), 1) end,
        'gagal_pct', case when count(*) > 0 then round(100.0 * count(*) filter (where d.status = 'gagal') / count(*), 1) end)
      from so_deliveries d join so_orders o on o.id = d.order_id
      where d.kos_id = p_kos and d.ship_date between p_from and p_to));
end $$;
revoke execute on function public.wholesale_kpi(uuid, date, date) from public, anon;
grant execute on function public.wholesale_kpi(uuid, date, date) to authenticated;
