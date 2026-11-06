-- Retur penjualan (barang kembali dari pelanggan) dan shift kasir (buka/tutup laci, hitung uang).

-- ---------- Retur penjualan ----------
create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  sale_id uuid not null references public.sales(id),
  contact_id uuid references public.contacts(id),
  number text not null,
  return_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  total numeric(14,2) not null check (total >= 0),          -- uang dikembalikan / kasbon dikurangi
  cost_total numeric(14,2) not null default 0,              -- modal barang yang kembali ke stok
  refund_method text not null check (refund_method in ('tunai', 'transfer', 'kasbon')),
  reason text not null,
  status text not null default 'selesai' check (status in ('selesai')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (kos_id, number)
);
create index if not exists sale_returns_sale on public.sale_returns(sale_id);
create index if not exists sale_returns_kos_date on public.sale_returns(kos_id, return_date desc);

create table if not exists public.sale_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sale_returns(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  sale_line_id uuid not null references public.sale_lines(id),
  product_id uuid not null references public.products(id),
  name text not null,
  unit text not null,
  unit_qty numeric(14,3) not null,
  qty numeric(14,3) not null check (qty > 0),
  amount numeric(14,2) not null,
  cost numeric(14,2) not null default 0
);
create index if not exists sale_return_lines_line on public.sale_return_lines(sale_line_id);

alter table public.sale_returns enable row level security;
alter table public.sale_return_lines enable row level security;
create policy sale_returns_select on public.sale_returns for select using (public.member_can(kos_id, 'finance'));
create policy sale_return_lines_select on public.sale_return_lines for select using (public.member_can(kos_id, 'finance'));
grant select on public.sale_returns, public.sale_return_lines to authenticated;

-- p_lines: [{line_id, qty}] dalam satuan yang dijual. Uang kembali dihitung dari harga jual setelah diskon (proporsional).
create or replace function public.sale_return_create(p_id uuid, p_sale uuid, p_lines jsonb, p_refund text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s sales; l sale_lines; x jsonb; v_qty numeric; v_done numeric; v_base numeric; v_amt numeric; v_stock numeric;
        v_total numeric := 0; v_cost numeric := 0; v_no text; v_seq int; v_day date := (now() at time zone 'Asia/Jakarta')::date;
        v_factor numeric; v_existing sale_returns;
begin
  select * into v_existing from sale_returns where id = p_id;
  if v_existing.id is not null then return jsonb_build_object('id', v_existing.id, 'number', v_existing.number, 'total', v_existing.total, 'duplicate', true); end if;
  select * into s from sales where id = p_sale for update;
  if s.id is null or not member_in('finance', s.kos_id) then raise exception 'Penjualan tidak ditemukan'; end if;
  if s.status <> 'selesai' then raise exception 'Penjualan yang dibatalkan tidak bisa diretur'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Isi alasan retur'; end if;
  if p_refund not in ('tunai', 'transfer', 'kasbon') then raise exception 'Pilih cara pengembalian uang'; end if;
  if p_refund = 'kasbon' and (s.contact_id is null or s.pay_method <> 'kasbon') then raise exception 'Potong kasbon hanya untuk penjualan kasbon'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Pilih barang yang diretur'; end if;
  v_factor := case when s.subtotal > 0 then s.total / s.subtotal else 1 end;

  perform pg_advisory_xact_lock(hashtext('retur:' || s.kos_id::text));
  select count(*) + 1 into v_seq from sale_returns where kos_id = s.kos_id and return_date = v_day;
  v_no := 'RTR-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  insert into sale_returns(id, kos_id, sale_id, contact_id, number, return_date, total, refund_method, reason)
  values (p_id, s.kos_id, s.id, s.contact_id, v_no, v_day, 0, p_refund, trim(p_reason));

  for x in select * from jsonb_array_elements(p_lines) loop
    v_qty := (x->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select * into l from sale_lines where id = (x->>'line_id')::uuid and sale_id = s.id;
    if l.id is null then raise exception 'Baris penjualan tidak ditemukan'; end if;
    select coalesce(sum(qty), 0) into v_done from sale_return_lines where sale_line_id = l.id;
    if v_qty > l.qty - v_done then raise exception 'Retur % melebihi jumlah yang dibeli (sisa %)', l.name, trim_scale(l.qty - v_done); end if;
    v_base := round(v_qty * l.unit_qty, 3);
    v_amt := round(v_qty * l.price * v_factor, 2);
    insert into sale_return_lines(return_id, kos_id, sale_line_id, product_id, name, unit, unit_qty, qty, amount, cost)
    values (p_id, s.kos_id, l.id, l.product_id, l.name, l.unit, l.unit_qty, v_qty, v_amt, l.cost);
    update products set stock = stock + v_base where id = l.product_id returning stock into v_stock;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (s.kos_id, l.product_id, 'retur_jual', v_base, v_stock, round(v_base * l.cost, 2), p_id, v_no || ' dari ' || s.number);
    v_total := v_total + v_amt;
    v_cost := v_cost + round(v_base * l.cost, 2);
  end loop;
  if v_total = 0 and v_cost = 0 and not exists (select 1 from sale_return_lines where return_id = p_id) then raise exception 'Isi jumlah barang yang diretur'; end if;
  update sale_returns set total = v_total, cost_total = v_cost where id = p_id;
  return jsonb_build_object('id', p_id, 'number', v_no, 'total', v_total, 'duplicate', false);
end $$;

-- Detail penjualan + retur yang sudah ada (jumlah yang masih bisa diretur per baris)
create or replace function public.sale_detail(p_sale uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare s sales; v_fin boolean;
begin
  select * into s from sales where id = p_sale;
  if s.id is null or not member_can(s.kos_id, 'sell,finance') then raise exception 'Penjualan tidak ditemukan'; end if;
  v_fin := member_can(s.kos_id, 'finance');
  if not v_fin and s.created_by is distinct from auth.uid() then raise exception 'Penjualan tidak ditemukan'; end if;
  return jsonb_build_object(
    'sale', (case when v_fin then to_jsonb(s) else to_jsonb(s) - 'cost_total' end) || jsonb_build_object('cashier', (select email from auth.users where id = s.created_by)),
    'lines', (select coalesce(jsonb_agg((case when v_fin then to_jsonb(l) else to_jsonb(l) - 'cost' end)
                || jsonb_build_object('returned', (select coalesce(sum(r.qty), 0) from sale_return_lines r where r.sale_line_id = l.id))), '[]') from sale_lines l where l.sale_id = s.id),
    'returns', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'date', r.return_date, 'total', r.total, 'refund_method', r.refund_method, 'reason', r.reason,
                  'items', (select jsonb_agg(jsonb_build_object('name', x.name, 'qty', x.qty, 'unit', x.unit)) from sale_return_lines x where x.return_id = r.id)) order by r.created_at), '[]')
                from sale_returns r where r.sale_id = s.id),
    'contact', (select to_jsonb(c) from contacts c where c.id = s.contact_id));
end $$;

-- Penjualan yang sudah diretur tidak bisa dibatalkan (agar stok & uang tidak dihitung dua kali)
create or replace function public.sale_void(p_sale uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s sales; l sale_lines; v_stock numeric;
begin
  select * into s from sales where id = p_sale for update;
  if s.id is null or not member_in('finance', s.kos_id) then raise exception 'Transaksi tidak ditemukan'; end if;
  if s.status = 'batal' then raise exception 'Transaksi sudah dibatalkan'; end if;
  if exists (select 1 from sale_returns where sale_id = s.id) then raise exception 'Penjualan ini sudah ada retur; pakai Retur untuk sisa barangnya'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Isi alasan pembatalan'; end if;
  for l in select * from sale_lines where sale_id = s.id loop
    update products set stock = stock + round(l.qty * l.unit_qty, 3) where id = l.product_id returning stock into v_stock;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (s.kos_id, l.product_id, 'batal', round(l.qty * l.unit_qty, 3), v_stock, round(l.qty * l.unit_qty * l.cost, 2), s.id, 'Batal ' || s.number);
  end loop;
  update sales set status = 'batal', void_reason = trim(p_reason), voided_at = now() where id = s.id;
end $$;

-- Kasbon berkurang oleh retur "potong kasbon"
create or replace function public.contact_balance(p_contact uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case c.kind
    when 'pelanggan' then coalesce((select sum(total) from sales where contact_id = c.id and pay_method = 'kasbon' and status = 'selesai'), 0)
                        - coalesce((select sum(amount) from debt_payments where contact_id = c.id and kind = 'piutang' and status = 'selesai'), 0)
                        - coalesce((select sum(total) from sale_returns where contact_id = c.id and refund_method = 'kasbon'), 0)
    else coalesce((select sum(total) from purchases where contact_id = c.id and pay_method = 'utang' and status in ('selesai', 'sebagian')), 0)
       - coalesce((select sum(amount) from debt_payments where contact_id = c.id and kind = 'utang' and status = 'selesai'), 0)
  end
  from contacts c where c.id = p_contact;
$$;
revoke execute on function public.contact_balance(uuid) from public, anon, authenticated;

-- Saldo kas/bank: uang retur keluar dari kas (tunai) atau bank (transfer)
create or replace function public.retail_ledger(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_kas numeric; v_bank numeric;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  with m as (
    select 'kas' as acc, total as amt from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'tunai'
    union all select 'bank', total from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'transfer'
    union all select case when refund_method = 'tunai' then 'kas' else 'bank' end, -total from sale_returns where kos_id = p_kos and refund_method in ('tunai', 'transfer')
    union all select case when pay_method = 'tunai' then 'kas' else 'bank' end, -total from purchases where kos_id = p_kos and status in ('selesai', 'sebagian') and pay_method in ('tunai', 'transfer')
    union all select account, case when kind = 'piutang' then amount else -amount end from debt_payments where kos_id = p_kos and status = 'selesai'
    union all select account, -amount from expenses where kos_id = p_kos
    union all select account, case when kind in ('pendapatan_lain', 'setoran_modal', 'pinjaman_masuk') then amount
                                   when kind in ('prive', 'bayar_pinjaman') then -amount
                                   when kind = 'setor_bank' then -amount
                                   when kind = 'tarik_bank' then amount
                                   else 0 end from cash_entries where kos_id = p_kos
    union all select 'bank', amount from cash_entries where kos_id = p_kos and kind = 'setor_bank'
    union all select 'bank', -amount from cash_entries where kos_id = p_kos and kind = 'tarik_bank'
  )
  select coalesce(sum(amt) filter (where acc = 'kas'), 0), coalesce(sum(amt) filter (where acc = 'bank'), 0) into v_kas, v_bank from m;

  return jsonb_build_object('kas', v_kas, 'bank', v_bank,
    'kasbon', (select coalesce(jsonb_agg(row_to_json(x) order by x.sisa desc), '[]'::jsonb) from (
      select c.id, c.name, c.phone, contact_balance(c.id) as sisa,
        (select min(due_date) from sales s where s.contact_id = c.id and s.pay_method = 'kasbon' and s.status = 'selesai' and s.due_date is not null) as due,
        (select min(sale_date) from sales s where s.contact_id = c.id and s.pay_method = 'kasbon' and s.status = 'selesai') as since
      from contacts c where c.kos_id = p_kos and c.kind = 'pelanggan') x where x.sisa > 0.5),
    'utang', (select coalesce(jsonb_agg(row_to_json(x) order by x.sisa desc), '[]'::jsonb) from (
      select c.id, c.name, c.phone, contact_balance(c.id) as sisa,
        (select min(due_date) from purchases b where b.contact_id = c.id and b.pay_method = 'utang' and b.status in ('selesai', 'sebagian') and b.due_date is not null) as due,
        (select min(purchase_date) from purchases b where b.contact_id = c.id and b.pay_method = 'utang' and b.status in ('selesai', 'sebagian')) as since
      from contacts c where c.kos_id = p_kos and c.kind = 'supplier') x where x.sisa > 0.5));
end $$;

create or replace function public.retail_ledger_internal(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (
    select 'kas' as acc, total as amt from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'tunai'
    union all select 'kas', -total from sale_returns where kos_id = p_kos and refund_method = 'tunai'
    union all select case when pay_method = 'tunai' then 'kas' else 'bank' end, -total from purchases where kos_id = p_kos and status in ('selesai', 'sebagian') and pay_method in ('tunai', 'transfer')
    union all select account, case when kind = 'piutang' then amount else -amount end from debt_payments where kos_id = p_kos and status = 'selesai'
    union all select account, -amount from expenses where kos_id = p_kos
    union all select account, case when kind in ('pendapatan_lain', 'setoran_modal', 'pinjaman_masuk', 'tarik_bank') then amount
                                   when kind in ('prive', 'bayar_pinjaman', 'setor_bank') then -amount else 0 end from cash_entries where kos_id = p_kos
  ) select jsonb_build_object('kas', coalesce(sum(amt) filter (where acc = 'kas'), 0)) from m;
$$;
revoke execute on function public.retail_ledger_internal(uuid) from public, anon, authenticated;

-- Laporan: penjualan & modal sudah dikurangi retur pada periode retur terjadi
create or replace function public.retail_report(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if p_from > p_to then raise exception 'Periode tidak valid'; end if;
  with s as (select * from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to),
  rt as (select * from sale_returns where kos_id = p_kos and return_date between p_from and p_to),
  ln as (
    select l.product_id, l.name, l.qty * l.unit_qty as base_qty,
           l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end as omzet,
           l.qty * l.unit_qty * l.cost as hpp, (l.cost = 0) as no_cost
    from sale_lines l join s on s.id = l.sale_id
    union all
    select x.product_id, x.name, -x.qty * x.unit_qty, -x.amount, -x.qty * x.unit_qty * x.cost, false
    from sale_return_lines x join rt on rt.id = x.return_id),
  prod as (
    select ln.product_id, max(ln.name) as name, sum(ln.base_qty) as qty, round(sum(ln.omzet), 2) as omzet, round(sum(ln.hpp), 2) as hpp,
           round(sum(ln.omzet) - sum(ln.hpp), 2) as laba, bool_or(ln.no_cost) as no_cost
    from ln group by ln.product_id)
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'trx', (select count(*) from s),
    'omzet', (select coalesce(sum(total), 0) from s) - (select coalesce(sum(total), 0) from rt),
    'retur', (select coalesce(sum(total), 0) from rt),
    'retur_n', (select count(*) from rt),
    'diskon', (select coalesce(sum(discount), 0) from s),
    'hpp', (select coalesce(sum(cost_total), 0) from s) - (select coalesce(sum(cost_total), 0) from rt),
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
    'belanja', (select coalesce(sum(total), 0) from purchases where kos_id = p_kos and status in ('selesai', 'sebagian') and purchase_date between p_from and p_to),
    'harian', (select coalesce(jsonb_agg(row_to_json(h) order by h.d), '[]'::jsonb) from (
        select d, sum(omzet) as omzet, sum(laba) as laba, sum(trx)::int as trx from (
          select sale_date as d, total as omzet, total - cost_total as laba, 1 as trx from s
          union all select return_date, -total, -(total - cost_total), 0 from rt) z group by d) h),
    'produk', (select coalesce(jsonb_agg(row_to_json(p) order by p.omzet desc), '[]'::jsonb) from prod p),
    'tidak_laku', (select coalesce(jsonb_agg(row_to_json(t) order by t.modal desc), '[]'::jsonb) from (
        select pr.id, pr.name, pr.stock, pr.base_unit, round(pr.stock * pr.cost, 2) as modal,
          (select max(s2.sale_date) from sale_lines l2 join sales s2 on s2.id = l2.sale_id where l2.product_id = pr.id and s2.status = 'selesai') as last_sold
        from products pr where pr.kos_id = p_kos and pr.active and pr.stock > 0
          and not exists (select 1 from ln where ln.product_id = pr.id) limit 30) t)
  ) into r;
  return r;
end $$;

-- ---------- Shift kasir ----------
create table if not exists public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id),
  opened_at timestamptz not null default now(),
  opening_cash numeric(14,2) not null check (opening_cash >= 0),
  closed_at timestamptz,
  expected_cash numeric(14,2),
  counted_cash numeric(14,2),
  summary jsonb,
  note text
);
create unique index if not exists cash_shifts_one_open on public.cash_shifts(kos_id, user_id) where closed_at is null;
create index if not exists cash_shifts_kos on public.cash_shifts(kos_id, opened_at desc);
alter table public.cash_shifts enable row level security; -- hanya lewat fungsi

-- Ringkasan uang selama shift: penjualan & retur oleh kasir ini sejak shift dibuka
create or replace function public.shift_summary(p_shift uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with sh as (select * from cash_shifts where id = p_shift),
  s as (select x.* from sales x, sh where x.kos_id = sh.kos_id and x.created_by = sh.user_id and x.status = 'selesai'
          and x.sold_at >= sh.opened_at and x.sold_at < coalesce(sh.closed_at, now())),
  r as (select x.* from sale_returns x, sh where x.kos_id = sh.kos_id and x.created_by = sh.user_id
          and x.created_at >= sh.opened_at and x.created_at < coalesce(sh.closed_at, now()))
  select jsonb_build_object(
    'trx', (select count(*) from s),
    'tunai', (select coalesce(sum(total), 0) from s where pay_method = 'tunai'),
    'transfer', (select coalesce(sum(total), 0) from s where pay_method = 'transfer'),
    'kasbon', (select coalesce(sum(total), 0) from s where pay_method = 'kasbon'),
    'retur_tunai', (select coalesce(sum(total), 0) from r where refund_method = 'tunai'),
    'expected', (select opening_cash from sh) + (select coalesce(sum(total), 0) from s where pay_method = 'tunai')
                - (select coalesce(sum(total), 0) from r where refund_method = 'tunai'));
$$;
revoke execute on function public.shift_summary(uuid) from public, anon, authenticated;

create or replace function public.shift_current(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare sh cash_shifts;
begin
  if not member_in('sell', p_kos) then raise exception 'Tidak punya akses kasir'; end if;
  select * into sh from cash_shifts where kos_id = p_kos and user_id = auth.uid() and closed_at is null;
  if sh.id is null then return null; end if;
  return to_jsonb(sh) || jsonb_build_object('summary', shift_summary(sh.id));
end $$;

create or replace function public.shift_open(p_kos uuid, p_cash numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not member_in('sell', p_kos) then raise exception 'Tidak punya akses kasir'; end if;
  if p_cash is null or p_cash < 0 then raise exception 'Isi uang awal di laci (boleh 0)'; end if;
  if exists (select 1 from cash_shifts where kos_id = p_kos and user_id = auth.uid() and closed_at is null) then raise exception 'Shift Anda masih terbuka'; end if;
  insert into cash_shifts(kos_id, opening_cash) values (p_kos, p_cash) returning id into v_id;
  return v_id;
end $$;

create or replace function public.shift_close(p_kos uuid, p_counted numeric, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare sh cash_shifts; v_sum jsonb;
begin
  if not member_in('sell', p_kos) then raise exception 'Tidak punya akses kasir'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Isi jumlah uang hasil hitung di laci'; end if;
  select * into sh from cash_shifts where kos_id = p_kos and user_id = auth.uid() and closed_at is null for update;
  if sh.id is null then raise exception 'Tidak ada shift yang terbuka'; end if;
  update cash_shifts set closed_at = now() where id = sh.id;
  v_sum := shift_summary(sh.id);
  update cash_shifts set summary = v_sum, expected_cash = (v_sum->>'expected')::numeric, counted_cash = p_counted,
    note = nullif(trim(coalesce(p_note, '')), '') where id = sh.id;
  return v_sum || jsonb_build_object('counted', p_counted, 'diff', p_counted - (v_sum->>'expected')::numeric);
end $$;

-- Riwayat shift: pemilik/pengelola melihat semua kasir, kasir melihat miliknya
create or replace function public.shift_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_fin boolean := member_in('finance', p_kos);
begin
  if not member_in('sell,finance', p_kos) then raise exception 'Tidak punya akses'; end if;
  return (select coalesce(jsonb_agg(x order by x.opened_at desc), '[]') from (
    select sh.id, u.email as cashier, sh.opened_at, sh.closed_at, sh.opening_cash, sh.counted_cash, sh.note,
      coalesce(sh.expected_cash, (shift_summary(sh.id)->>'expected')::numeric) as expected_cash,
      coalesce(sh.summary, shift_summary(sh.id)) as summary
    from cash_shifts sh join auth.users u on u.id = sh.user_id
    where sh.kos_id = p_kos and (v_fin or sh.user_id = auth.uid()) order by sh.opened_at desc limit 60) x);
end $$;

revoke execute on function public.sale_return_create(uuid, uuid, jsonb, text, text), public.shift_current(uuid), public.shift_open(uuid, numeric),
  public.shift_close(uuid, numeric, text), public.shift_list(uuid) from public, anon;
grant execute on function public.sale_return_create(uuid, uuid, jsonb, text, text), public.shift_current(uuid), public.shift_open(uuid, numeric),
  public.shift_close(uuid, numeric, text), public.shift_list(uuid) to authenticated;
