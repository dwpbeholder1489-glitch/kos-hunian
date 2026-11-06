-- PRASARA Retail: pesanan pembelian dan penerimaan barang (blueprint 5.1: Pembelian + Penerimaan barang).
-- Alur: Dipesan (stok belum berubah) → Terima barang (boleh sebagian; stok & modal berubah saat diterima) → Selesai.
-- Belanja langsung (barang sudah datang) tetap seperti sebelumnya.
-- purchases.total = nilai barang yang SUDAH diterima (dasar kas & utang); order_total = nilai pesanan.

alter table public.purchases add column if not exists order_total numeric(14,2);
alter table public.purchases add column if not exists expected_date date;
update public.purchases set order_total = total where order_total is null;
alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check check (status in ('dipesan', 'sebagian', 'selesai', 'batal'));

alter table public.purchase_lines add column if not exists qty_received numeric(14,3) not null default 0;
update public.purchase_lines set qty_received = qty where qty_received = 0;

-- Belanja langsung: semua baris langsung diterima
create or replace function public.purchase_create(p_id uuid, p_kos uuid, p_date date, p_contact uuid, p_lines jsonb, p_method text,
                                                  p_due date default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; l purchase_lines;
begin
  v := purchase_order_create(p_id, p_kos, p_date, p_contact, p_lines, p_method, p_due, p_note, null);
  if (v->>'duplicate')::boolean then return v; end if;
  return purchase_receive(p_id, (select jsonb_agg(jsonb_build_object('line_id', id, 'qty', qty, 'price', price)) from purchase_lines where purchase_id = p_id), p_date, true);
end $$;

-- Pesanan: catat barang yang dipesan, stok BELUM bertambah
create or replace function public.purchase_order_create(p_id uuid, p_kos uuid, p_date date, p_contact uuid, p_lines jsonb, p_method text,
                                                        p_due date default null, p_note text default null, p_expected date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_no text; v_seq int; l jsonb; p products; u product_units; v_existing purchases; v_qty numeric; v_price numeric; v_total numeric := 0;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if (select business_type from kos where id = p_kos) <> 'retail' then raise exception 'Belanja hanya untuk bisnis Retail & Grosir'; end if;
  select * into v_existing from purchases where id = p_id;
  if v_existing.id is not null then
    if v_existing.kos_id <> p_kos then raise exception 'Transaksi tidak valid'; end if;
    return jsonb_build_object('id', v_existing.id, 'number', v_existing.number, 'total', v_existing.total, 'duplicate', true);
  end if;
  if v_day > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak boleh di masa depan'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Daftar belanja masih kosong'; end if;
  if jsonb_array_length(p_lines) > 100 then raise exception 'Maksimal 100 baris per belanja'; end if;
  if p_method not in ('tunai', 'transfer', 'utang') then raise exception 'Cara bayar tidak dikenal'; end if;
  if p_contact is not null and not exists (select 1 from contacts where id = p_contact and kos_id = p_kos and kind = 'supplier') then raise exception 'Supplier tidak ditemukan'; end if;
  if p_method = 'utang' and p_contact is null then raise exception 'Pilih supplier untuk belanja utang'; end if;

  perform pg_advisory_xact_lock(hashtext('purchase:' || p_kos::text));
  select count(*) + 1 into v_seq from purchases where kos_id = p_kos and purchase_date = v_day;
  v_no := 'BLJ-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  insert into purchases(id, kos_id, number, purchase_date, contact_id, total, order_total, pay_method, due_date, note, status, expected_date)
  values (p_id, p_kos, v_no, v_day, p_contact, 0, 0, p_method, case when p_method = 'utang' then p_due end, nullif(trim(coalesce(p_note, '')), ''), 'dipesan', p_expected);

  for l in select * from jsonb_array_elements(p_lines) loop
    select * into p from products where id = (l->>'product_id')::uuid and kos_id = p_kos;
    if p.id is null then raise exception 'Barang tidak ditemukan'; end if;
    select * into u from product_units where product_id = p.id and name = l->>'unit';
    if u.id is null then raise exception 'Satuan "%" untuk % tidak ada', l->>'unit', p.name; end if;
    v_qty := (l->>'qty')::numeric; v_price := (l->>'price')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah % harus lebih dari 0', p.name; end if;
    if v_price is null or v_price < 0 then raise exception 'Isi harga beli %', p.name; end if;
    insert into purchase_lines(purchase_id, kos_id, product_id, name, unit, unit_qty, qty, price, line_total, qty_received)
    values (p_id, p_kos, p.id, p.name, u.name, u.qty, v_qty, v_price, 0, 0);
    v_total := v_total + round(v_qty * v_price, 2);
  end loop;
  update purchases set order_total = v_total where id = p_id;
  return jsonb_build_object('id', p_id, 'number', v_no, 'total', 0, 'order_total', v_total, 'duplicate', false);
end $$;

-- Terima barang: p_lines [{line_id, qty, price}] (qty = jumlah yang diterima kali ini, price = harga beli per satuan).
-- p_close = true: pesanan ditutup (sisa yang belum datang tidak ditunggu lagi).
create or replace function public.purchase_receive(p_purchase uuid, p_lines jsonb, p_date date default null, p_close boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b purchases; x jsonb; l purchase_lines; p products; v_qty numeric; v_price numeric; v_base numeric; v_unit_cost numeric; v_new_cost numeric;
        v_add numeric := 0; v_left numeric; v_any boolean := false;
begin
  select * into b from purchases where id = p_purchase for update;
  if b.id is null or not is_member(b.kos_id) then raise exception 'Belanja tidak ditemukan'; end if;
  if b.status not in ('dipesan', 'sebagian') then raise exception 'Pesanan ini sudah selesai atau dibatalkan'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    select * into l from purchase_lines where id = (x->>'line_id')::uuid and purchase_id = b.id for update;
    if l.id is null then raise exception 'Baris pesanan tidak ditemukan'; end if;
    v_qty := coalesce((x->>'qty')::numeric, 0);
    if v_qty < 0 then raise exception 'Jumlah diterima tidak boleh minus'; end if;
    if v_qty = 0 then continue; end if;
    v_price := coalesce((x->>'price')::numeric, l.price);
    if v_price < 0 then raise exception 'Harga tidak boleh minus'; end if;
    select * into p from products where id = l.product_id for update;
    v_base := round(v_qty * l.unit_qty, 3);
    v_unit_cost := v_price / l.unit_qty;
    v_new_cost := case when p.stock > 0 then (p.stock * p.cost + v_base * v_unit_cost) / (p.stock + v_base) else v_unit_cost end;
    update products set stock = stock + v_base, cost = round(v_new_cost, 2) where id = p.id;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (b.kos_id, p.id, 'beli', v_base, p.stock + v_base, round(v_qty * v_price, 2), b.id, b.number);
    update purchase_lines set qty_received = qty_received + v_qty, price = v_price, line_total = line_total + round(v_qty * v_price, 2) where id = l.id;
    v_add := v_add + round(v_qty * v_price, 2);
    v_any := true;
  end loop;
  if not v_any and not p_close then raise exception 'Isi jumlah barang yang diterima'; end if;
  select coalesce(sum(greatest(qty - qty_received, 0)), 0) into v_left from purchase_lines where purchase_id = b.id;
  update purchases set total = total + v_add,
    status = case when v_left <= 0 or p_close then (case when total + v_add = 0 then 'batal' else 'selesai' end) else 'sebagian' end,
    void_reason = case when (v_left <= 0 or p_close) and total + v_add = 0 then 'Pesanan ditutup tanpa barang diterima' else void_reason end
  where id = b.id;
  return jsonb_build_object('id', b.id, 'number', b.number, 'total', b.total + v_add, 'duplicate', false);
end $$;

-- Batalkan: barang yang sudah diterima dikurangi lagi dari stok; pesanan yang belum diterima cukup ditandai batal
create or replace function public.purchase_void(p_purchase uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare b purchases; l purchase_lines; p products; v_base numeric; v_rest numeric; v_cost numeric;
begin
  select * into b from purchases where id = p_purchase for update;
  if b.id is null or not is_member(b.kos_id) then raise exception 'Belanja tidak ditemukan'; end if;
  if b.status = 'batal' then raise exception 'Belanja sudah dibatalkan'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Isi alasan pembatalan'; end if;
  for l in select * from purchase_lines where purchase_id = b.id and qty_received > 0 loop
    select * into p from products where id = l.product_id for update;
    v_base := round(l.qty_received * l.unit_qty, 3);
    v_rest := p.stock - v_base;
    v_cost := case when v_rest > 0 then (p.stock * p.cost - l.line_total) / v_rest else p.cost end;
    if v_cost is null or v_cost < 0 then v_cost := p.cost; end if;
    update products set stock = v_rest, cost = round(v_cost, 2) where id = p.id;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (b.kos_id, p.id, 'batal', -v_base, v_rest, -l.line_total, b.id, 'Batal ' || b.number);
  end loop;
  update purchases set status = 'batal', void_reason = trim(p_reason), voided_at = now() where id = b.id;
end $$;

-- Utang & kas memakai nilai barang yang sudah diterima (status sebagian juga dihitung)
create or replace function public.contact_balance(p_contact uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case c.kind
    when 'pelanggan' then coalesce((select sum(total) from sales where contact_id = c.id and pay_method = 'kasbon' and status = 'selesai'), 0)
                        - coalesce((select sum(amount) from debt_payments where contact_id = c.id and kind = 'piutang' and status = 'selesai'), 0)
    else coalesce((select sum(total) from purchases where contact_id = c.id and pay_method = 'utang' and status in ('selesai', 'sebagian')), 0)
       - coalesce((select sum(amount) from debt_payments where contact_id = c.id and kind = 'utang' and status = 'selesai'), 0)
  end
  from contacts c where c.id = p_contact;
$$;
revoke execute on function public.contact_balance(uuid) from public, anon, authenticated;

create or replace function public.retail_ledger(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_kas numeric; v_bank numeric;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  with m as (
    select 'kas' as acc, total as amt from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'tunai'
    union all select 'bank', total from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'transfer'
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

revoke execute on function public.purchase_order_create(uuid, uuid, date, uuid, jsonb, text, date, text, date), public.purchase_receive(uuid, jsonb, date, boolean) from public, anon;
grant execute on function public.purchase_order_create(uuid, uuid, date, uuid, jsonb, text, date, text, date), public.purchase_receive(uuid, jsonb, date, boolean) to authenticated;

-- Laporan: belanja yang diterima sebagian ikut dihitung
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
    'belanja', (select coalesce(sum(total), 0) from purchases where kos_id = p_kos and status in ('selesai', 'sebagian') and purchase_date between p_from and p_to),
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
