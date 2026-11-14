-- Pajak PPN keluaran & bayar campuran di Kasir toko (Modul V2.0 Bab 10 "Tax Configuration", "Split Payment"; Bab 12 pajak).
-- PPN: pemilik mengatur aktif + tarif (tidak diisi otomatis). Harga jual di kasir = HARGA SUDAH TERMASUK PPN (wajib untuk
--   penjualan eceran ke konsumen); sistem memisahkan bagian PPN: jurnal Penjualan = total − PPN, PPN keluaran (kewajiban) = PPN.
--   Barang bisa ditandai "Bebas PPN" (mis. sembako tertentu). Diskon dibagi proporsional. Retur membalik PPN sebanding.
--   PPN masukan (dari faktur supplier) belum: menyusul bersama faktur pembelian.
-- Bayar campuran: satu penjualan dibayar beberapa cara (tunai + transfer/QRIS + kasbon). sales.pay_method = 'campuran' +
--   pay_split; kolom hasil amt_tunai/amt_transfer/amt_kasbon dipakai SEMUA perhitungan kas, bank, piutang, shift, laporan.
-- Perbaikan peristiwa: penjualan/retur/belanja dibuat dengan total 0 lalu diisi → peristiwa "baru" ditulis di akhir transaksi
--   (constraint trigger tertunda) dengan membaca angka final.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

-- ---------- 1) Kolom ----------
alter table public.sales drop constraint if exists sales_pay_method_check;
alter table public.sales add constraint sales_pay_method_check check (pay_method in ('tunai', 'transfer', 'kasbon', 'campuran'));
alter table public.sales add column if not exists pay_split jsonb;
alter table public.sales add column if not exists tax_amount numeric(14,2) not null default 0;
alter table public.sales add column if not exists tax_rate numeric(5,2);
alter table public.sales add column if not exists tax_base numeric(14,2) not null default 0;   -- nilai kena PPN (termasuk PPN, setelah diskon)
alter table public.sales add column if not exists amt_tunai numeric(14,2) generated always as
  (case pay_method when 'tunai' then total when 'campuran' then coalesce((pay_split->>'tunai')::numeric, 0) else 0 end) stored;
alter table public.sales add column if not exists amt_transfer numeric(14,2) generated always as
  (case pay_method when 'transfer' then total when 'campuran' then coalesce((pay_split->>'transfer')::numeric, 0) else 0 end) stored;
alter table public.sales add column if not exists amt_kasbon numeric(14,2) generated always as
  (case pay_method when 'kasbon' then total when 'campuran' then coalesce((pay_split->>'kasbon')::numeric, 0) else 0 end) stored;
alter table public.sales drop constraint if exists sales_split_ok;
alter table public.sales add constraint sales_split_ok check (
  pay_method <> 'campuran' or total = 0 or
  coalesce((pay_split->>'tunai')::numeric, 0) + coalesce((pay_split->>'transfer')::numeric, 0) + coalesce((pay_split->>'kasbon')::numeric, 0) = total);
alter table public.sales drop constraint if exists sales_tax_ok;
alter table public.sales add constraint sales_tax_ok check (tax_amount >= 0 and tax_amount <= total);
alter table public.sale_returns add column if not exists tax_amount numeric(14,2) not null default 0;
alter table public.sale_lines add column if not exists tax_amount numeric(14,2) not null default 0;   -- bagian PPN baris ini (setelah diskon)
alter table public.products add column if not exists tax_exempt boolean not null default false;

-- PPN retur = PPN baris yang dikembalikan, sebanding jumlahnya (barang bebas PPN tidak membalik PPN)
create or replace function public.sale_returns_tax() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.tax_amount := least(coalesce((select round(sum(rl.qty / nullif(sl.qty, 0) * sl.tax_amount), 2)
                                    from sale_return_lines rl join sale_lines sl on sl.id = rl.sale_line_id where rl.return_id = new.id), 0), new.total);
  return new;
end $$;
drop trigger if exists sale_returns_tax on public.sale_returns;
create trigger sale_returns_tax before insert or update of total on public.sale_returns for each row execute function public.sale_returns_tax();

-- ---------- 2) Akun PPN & jurnal ----------
select public._prasara_patch('public.acct_ensure(uuid)',
  $x$('2-1400', 'Deposit penghuni', 'kewajiban', 'deposit_penghuni')$x$,
  $x$('2-1400', 'Deposit penghuni', 'kewajiban', 'deposit_penghuni'),
    ('2-1500', 'PPN keluaran', 'kewajiban', 'ppn_keluaran')$x$);
select public.acct_ensure(id) from public.kos;

select public._prasara_patch('public.acct_desired(uuid)',
  $x$((select k from acc where m = s.pay_method), s.total), ('penjualan', -s.total)$x$,
  $x$('kas', s.amt_tunai), ('bank', s.amt_transfer), ('piutang', s.amt_kasbon), ('penjualan', -(s.total - s.tax_amount)), ('ppn_keluaran', -s.tax_amount)$x$);
select public._prasara_patch('public.acct_desired(uuid)',
  $x$('retur_penjualan', r.total)$x$,
  $x$('retur_penjualan', r.total - r.tax_amount), ('ppn_keluaran', r.tax_amount)$x$);

-- ---------- 3) Semua pembaca cara bayar memakai rincian per cara ----------
select public._prasara_patch('public.cash_by_location_internal(uuid)',
  $x$select branch_id b, total amt from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'tunai'$x$,
  $x$select branch_id b, amt_tunai amt from sales where kos_id = p_kos and status = 'selesai' and amt_tunai <> 0$x$);
select public._prasara_patch('public.contact_balance(uuid)',
  $x$coalesce((select sum(total) from sales where contact_id = c.id and pay_method = 'kasbon' and status = 'selesai'), 0)$x$,
  $x$coalesce((select sum(amt_kasbon) from sales where contact_id = c.id and amt_kasbon > 0 and status = 'selesai'), 0)$x$);
select public._prasara_patch('public.contact_history(uuid)',
  $x$case when s.pay_method = 'kasbon' then ' (kasbon)' else '' end$x$,
  $x$case when s.pay_method = 'kasbon' then ' (kasbon)' when s.amt_kasbon > 0 then ' (sebagian kasbon)' else '' end$x$);
select public._prasara_patch('public.owner_overview()',
  $x$coalesce((select sum(s.total) from sales s where s.kos_id = k.id and s.status = 'selesai' and s.pay_method = 'kasbon'), 0)$x$,
  $x$coalesce((select sum(s.amt_kasbon) from sales s where s.kos_id = k.id and s.status = 'selesai' and s.amt_kasbon > 0), 0)$x$);
select public._prasara_patch('public.recommendations(uuid)',
  $x$from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'kasbon' and sale_date >= d30$x$,
  $x$from sales where kos_id = p_kos and status = 'selesai' and amt_kasbon > 0 and sale_date >= d30$x$);
select public._prasara_patch('public.retail_alerts_internal(uuid,boolean)',
  $x$s.pay_method = 'kasbon'$x$, $x$s.amt_kasbon > 0$x$);
select public._prasara_patch('public.retail_ledger_internal_full(uuid)',
  $x$s.pay_method = 'kasbon'$x$, $x$s.amt_kasbon > 0$x$);
select public._prasara_patch('public.retail_ledger(uuid)',
  $x$s.pay_method = 'kasbon'$x$, $x$s.amt_kasbon > 0$x$);
select public._prasara_patch('public.retail_ledger(uuid)',
  $x$select 'kas' as acc, total as amt from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'tunai'$x$,
  $x$select 'kas' as acc, amt_tunai as amt from sales where kos_id = p_kos and status = 'selesai' and amt_tunai <> 0$x$);
select public._prasara_patch('public.retail_ledger(uuid)',
  $x$union all select 'bank', total from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'transfer'$x$,
  $x$union all select 'bank', amt_transfer from sales where kos_id = p_kos and status = 'selesai' and amt_transfer <> 0$x$);
select public._prasara_patch('public.retail_ledger_internal(uuid)',
  $x$select 'kas' as acc, total as amt from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'tunai'$x$,
  $x$select 'kas' as acc, amt_tunai as amt from sales where kos_id = p_kos and status = 'selesai' and amt_tunai <> 0$x$);
select public._prasara_patch('public.retail_report(uuid,date,date)',
  $x$'tunai', (select coalesce(sum(total), 0) from s where pay_method = 'tunai')$x$, $x$'tunai', (select coalesce(sum(amt_tunai), 0) from s)$x$);
select public._prasara_patch('public.retail_report(uuid,date,date)',
  $x$'kasbon', (select coalesce(sum(total), 0) from s where pay_method = 'kasbon')$x$, $x$'kasbon', (select coalesce(sum(amt_kasbon), 0) from s), 'ppn', (select coalesce(sum(tax_amount), 0) from s)$x$);
select public._prasara_patch('public.retail_report(uuid,date,date)',
  $x$'transfer', (select coalesce(sum(total), 0) from s where pay_method = 'transfer')$x$, $x$'transfer', (select coalesce(sum(amt_transfer), 0) from s)$x$);
select public._prasara_patch('public.shift_summary(uuid)',
  $x$'tunai', (select coalesce(sum(total), 0) from s where pay_method = 'tunai')$x$, $x$'tunai', (select coalesce(sum(amt_tunai), 0) from s)$x$);
select public._prasara_patch('public.shift_summary(uuid)',
  $x$'kasbon', (select coalesce(sum(total), 0) from s where pay_method = 'kasbon')$x$, $x$'kasbon', (select coalesce(sum(amt_kasbon), 0) from s)$x$);
select public._prasara_patch('public.shift_summary(uuid)',
  $x$'transfer', (select coalesce(sum(total), 0) from s where pay_method = 'transfer')$x$, $x$'transfer', (select coalesce(sum(amt_transfer), 0) from s)$x$);
select public._prasara_patch('public.shift_summary(uuid)',
  $x$(select opening_cash from sh) + (select coalesce(sum(total), 0) from s where pay_method = 'tunai')$x$,
  $x$(select opening_cash from sh) + (select coalesce(sum(amt_tunai), 0) from s)$x$);
select public._prasara_patch('public.sale_return_create(uuid,uuid,jsonb,text,text)',
  $x$s.pay_method <> 'kasbon'$x$, $x$s.amt_kasbon <= 0$x$);

-- Pendapatan/laba = tanpa PPN (PPN titipan negara, bukan pendapatan toko)
select public._prasara_patch('public.retail_report(uuid,date,date)',
  $x$l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end as omzet$x$,
  $x$l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount as omzet$x$);
select public._prasara_patch('public.retail_report(uuid,date,date)',
  $x$'omzet', (select coalesce(sum(total), 0) from s) - (select coalesce(sum(total), 0) from rt)$x$,
  $x$'omzet', (select coalesce(sum(total - tax_amount), 0) from s) - (select coalesce(sum(total - tax_amount), 0) from rt)$x$);
select public._prasara_patch('public.retail_report(uuid,date,date)',
  $x$sum(total) as omzet, sum(total - cost_total) as laba from s group by 1$x$,
  $x$sum(total - tax_amount) as omzet, sum(total - tax_amount - cost_total) as laba from s group by 1$x$);
select public._prasara_patch('public.retail_report(uuid,date,date)',
  $x$select sale_date as d, total as omzet, total - cost_total as laba, 1 as trx from s$x$,
  $x$select sale_date as d, total - tax_amount as omzet, total - tax_amount - cost_total as laba, 1 as trx from s$x$);
select public._prasara_patch('public.retail_report(uuid,date,date)',
  $x$union all select return_date, -total, -(total - cost_total), 0 from rt$x$,
  $x$union all select return_date, -(total - tax_amount), -(total - tax_amount - cost_total), 0 from rt$x$);
select public._prasara_patch('public.owner_overview2(date)',
  $x$sum(total) from sales where kos_id = k.id$x$, $x$sum(total - tax_amount) from sales where kos_id = k.id$x$);
select public._prasara_patch('public.owner_overview2(date)',
  $x$sum(total) from sale_returns where kos_id = k.id$x$, $x$sum(total - tax_amount) from sale_returns where kos_id = k.id$x$);
select public._prasara_patch('public.automation_run_rule(uuid,text)',
  $x$sum(total) from sales where kos_id = k.id$x$, $x$sum(total - tax_amount) from sales where kos_id = k.id$x$);
select public._prasara_patch('public.automation_run_rule(uuid,text)',
  $x$sum(total) from sale_returns where kos_id = k.id$x$, $x$sum(total - tax_amount) from sale_returns where kos_id = k.id$x$);

-- ---------- 4) Pengaturan PPN & barang bebas PPN ----------
create or replace function public.tax_settings_set(p_kos uuid, p_active boolean, p_rate numeric, p_npwp text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb;
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  if p_active and (p_rate is null or p_rate <= 0 or p_rate > 25) then raise exception 'Isi tarif PPN dalam persen (mis. sesuai ketentuan yang berlaku untuk usaha Anda)'; end if;
  select coalesce(profile -> 'tax', '{}') into v_old from kos where id = p_kos;
  v_new := jsonb_build_object('aktif', coalesce(p_active, false), 'rate', case when p_active then round(p_rate, 2) else (v_old ->> 'rate')::numeric end,
                              'npwp', nullif(trim(coalesce(p_npwp, '')), ''), 'mode', 'termasuk');
  update kos set profile = coalesce(profile, '{}') || jsonb_build_object('tax', v_new) where id = p_kos;
  perform config_log(p_kos, 'ubah_pajak', 'PPN', v_old, v_new, null, 'tinggi', actor_email());
  return v_new;
end $$;
revoke execute on function public.tax_settings_set(uuid, boolean, numeric, text) from public, anon;
grant execute on function public.tax_settings_set(uuid, boolean, numeric, text) to authenticated;

create or replace function public.product_set_tax(p_product uuid, p_exempt boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_kos uuid;
begin
  select kos_id into v_kos from products where id = p_product;
  if v_kos is null or not member_in('stock', v_kos) then raise exception 'Barang tidak ditemukan'; end if;
  update products set tax_exempt = coalesce(p_exempt, false) where id = p_product;
end $$;
revoke execute on function public.product_set_tax(uuid, boolean) from public, anon;
grant execute on function public.product_set_tax(uuid, boolean) to authenticated;

-- ---------- 5) Kasir: bayar campuran + PPN ----------
drop function if exists public.sale_create(uuid, uuid, text, jsonb, numeric, text, numeric, uuid, date, text);
create or replace function public.sale_create(p_id uuid, p_kos uuid, p_tier text, p_lines jsonb, p_discount numeric, p_method text,
  p_paid numeric default null, p_contact uuid default null, p_due date default null, p_note text default null, p_payments jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day date := (now() at time zone 'Asia/Jakarta')::date;
  v_no text; v_seq int; l jsonb; p products; u product_units;
  v_sub numeric := 0; v_cost numeric := 0; v_total numeric; v_qty numeric; v_price numeric; v_base numeric;
  v_existing sales; v_split jsonb; v_method text := p_method; v_n int; v_kasbon numeric := 0; v_tunai numeric := 0;
  v_tax jsonb; v_rate numeric; v_taxable numeric := 0; v_tax_amt numeric := 0;
begin
  if not member_in('sell', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if (select business_type from kos where id = p_kos) <> 'retail' then raise exception 'Kasir hanya untuk bisnis Retail & Grosir'; end if;
  select * into v_existing from sales where id = p_id;
  if v_existing.id is not null then
    if v_existing.kos_id <> p_kos then raise exception 'Transaksi tidak valid'; end if;
    return jsonb_build_object('id', v_existing.id, 'number', v_existing.number, 'total', v_existing.total, 'duplicate', true);
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Keranjang masih kosong'; end if;
  if jsonb_array_length(p_lines) > 100 then raise exception 'Maksimal 100 baris per transaksi'; end if;

  -- Rincian bayar campuran: [{method, amount}] → dijumlah per cara; satu cara saja = cara biasa
  if p_payments is not null and jsonb_typeof(p_payments) = 'array' and jsonb_array_length(p_payments) > 0 then
    if exists (select 1 from jsonb_array_elements(p_payments) x where x->>'method' not in ('tunai', 'transfer', 'kasbon')
               or (x->>'amount') is null or (x->>'amount')::numeric <= 0) then raise exception 'Rincian pembayaran tidak valid'; end if;
    select jsonb_object_agg(m, a), count(*) into v_split, v_n
    from (select x->>'method' m, round(sum((x->>'amount')::numeric), 2) a from jsonb_array_elements(p_payments) x group by 1) z;
    v_method := case when v_n = 1 then (select key from jsonb_each(v_split) limit 1) else 'campuran' end;
    if v_n = 1 then v_split := null; end if;
  end if;
  if v_method not in ('tunai', 'transfer', 'kasbon', 'campuran') then raise exception 'Cara bayar tidak dikenal'; end if;
  v_kasbon := case when v_method = 'kasbon' then 1 else coalesce((v_split->>'kasbon')::numeric, 0) end;
  if v_kasbon > 0 then
    if p_contact is null then raise exception 'Pilih pelanggan untuk kasbon'; end if;
    if not exists (select 1 from contacts where id = p_contact and kos_id = p_kos and kind = 'pelanggan') then raise exception 'Pelanggan tidak ditemukan'; end if;
  elsif p_contact is not null and not exists (select 1 from contacts where id = p_contact and kos_id = p_kos) then
    raise exception 'Pelanggan tidak ditemukan';
  end if;

  perform pg_advisory_xact_lock(hashtext('sale:' || p_kos::text));
  select count(*) + 1 into v_seq from sales where kos_id = p_kos and sale_date = v_day;
  v_no := 'TRX-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  insert into sales(id, kos_id, number, sale_date, tier, subtotal, discount, total, pay_method, paid_amount, contact_id, due_date, note)
  values (p_id, p_kos, v_no, v_day, coalesce(nullif(p_tier, ''), 'ecer'), 0, 0, 0, v_method, null, p_contact, case when v_kasbon > 0 then p_due end, nullif(trim(coalesce(p_note, '')), ''));

  for l in select * from jsonb_array_elements(p_lines) loop
    select * into p from products where id = (l->>'product_id')::uuid and kos_id = p_kos for update;
    if p.id is null then raise exception 'Barang tidak ditemukan'; end if;
    select * into u from product_units where product_id = p.id and name = l->>'unit';
    if u.id is null then raise exception 'Satuan "%" untuk % tidak ada', l->>'unit', p.name; end if;
    v_qty := (l->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah % harus lebih dari 0', p.name; end if;
    v_price := coalesce((l->>'price')::numeric, case when p_tier = 'grosir' and u.price_wholesale > 0 then u.price_wholesale else u.price_retail end);
    if v_price < 0 then raise exception 'Harga tidak boleh minus'; end if;
    v_base := round(v_qty * u.qty, 3);
    insert into sale_lines(sale_id, kos_id, product_id, name, unit, unit_qty, qty, price, cost, line_total)
    values (p_id, p_kos, p.id, p.name, u.name, u.qty, v_qty, v_price, p.cost, round(v_qty * v_price, 2));
    update products set stock = stock - v_base where id = p.id;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (p_kos, p.id, 'jual', -v_base, p.stock - v_base, round(-v_base * p.cost, 2), p_id, v_no);
    v_sub := v_sub + round(v_qty * v_price, 2);
    v_cost := v_cost + round(v_base * p.cost, 2);
    if not p.tax_exempt then v_taxable := v_taxable + round(v_qty * v_price, 2); end if;
  end loop;

  if coalesce(p_discount, 0) < 0 or coalesce(p_discount, 0) > v_sub then raise exception 'Diskon tidak boleh melebihi subtotal'; end if;
  v_total := v_sub - coalesce(p_discount, 0);

  -- PPN (harga sudah termasuk PPN): bagian PPN dari nilai kena pajak setelah diskon proporsional
  select profile -> 'tax' into v_tax from kos where id = p_kos;
  if coalesce((v_tax->>'aktif')::boolean, false) and (v_tax->>'rate')::numeric > 0 and v_sub > 0 then
    v_rate := (v_tax->>'rate')::numeric;
    v_taxable := round(v_taxable - coalesce(p_discount, 0) * v_taxable / v_sub, 2);
    -- per baris (dasar retur), lalu total = jumlah baris agar selalu cocok
    update sale_lines sl set tax_amount = round(sl.line_total * (1 - coalesce(p_discount, 0) / v_sub) * v_rate / (100 + v_rate), 2)
    from products pr where sl.sale_id = p_id and pr.id = sl.product_id and not pr.tax_exempt;
    select coalesce(sum(tax_amount), 0) into v_tax_amt from sale_lines where sale_id = p_id;
  end if;

  if v_method = 'campuran' then
    if (coalesce((v_split->>'tunai')::numeric, 0) + coalesce((v_split->>'transfer')::numeric, 0) + coalesce((v_split->>'kasbon')::numeric, 0)) <> v_total then
      raise exception 'Jumlah rincian pembayaran (%) harus sama dengan total (%)',
        coalesce((v_split->>'tunai')::numeric, 0) + coalesce((v_split->>'transfer')::numeric, 0) + coalesce((v_split->>'kasbon')::numeric, 0), v_total;
    end if;
    v_tunai := coalesce((v_split->>'tunai')::numeric, 0);
    if p_paid is not null and p_paid < v_tunai then raise exception 'Uang tunai diterima kurang dari bagian tunai'; end if;
  elsif v_method = 'tunai' then
    v_tunai := v_total;
    if p_paid is not null and p_paid < v_total then raise exception 'Uang diterima kurang dari total'; end if;
  end if;

  update sales set subtotal = v_sub, discount = coalesce(p_discount, 0), total = v_total, cost_total = v_cost, pay_split = v_split,
    paid_amount = case when v_tunai > 0 then coalesce(p_paid, v_tunai) end,
    tax_amount = v_tax_amt, tax_rate = case when v_tax_amt > 0 or v_rate is not null then v_rate end, tax_base = case when v_tax_amt > 0 then v_taxable else 0 end
  where id = p_id;
  return jsonb_build_object('id', p_id, 'number', v_no, 'total', v_total, 'tax', v_tax_amt, 'method', v_method, 'duplicate', false);
end $$;
revoke execute on function public.sale_create(uuid, uuid, text, jsonb, numeric, text, numeric, uuid, date, text, jsonb) from public, anon;
grant execute on function public.sale_create(uuid, uuid, text, jsonb, numeric, text, numeric, uuid, date, text, jsonb) to authenticated;

-- ---------- 6) Laporan PPN keluaran per bulan ----------
create or replace function public.tax_report(p_kos uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_m0 date := date_trunc('month', coalesce(p_month, current_date))::date; v_m1 date;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  v_m1 := (v_m0 + interval '1 month - 1 day')::date;
  return jsonb_build_object('bulan', v_m0, 'setelan', (select profile -> 'tax' from kos where id = p_kos),
    'penjualan', (select jsonb_build_object('jumlah', count(*), 'total', coalesce(sum(total), 0), 'dpp', coalesce(sum(tax_base - tax_amount), 0),
                    'ppn', coalesce(sum(tax_amount), 0), 'tidak_kena', coalesce(sum(total - tax_base), 0))
                  from sales where kos_id = p_kos and status = 'selesai' and sale_date between v_m0 and v_m1),
    'retur_ppn', (select coalesce(sum(r.tax_amount), 0) from sale_returns r where r.kos_id = p_kos and r.return_date between v_m0 and v_m1),
    'retur_dpp', (select coalesce(sum(case when s.tax_rate > 0 then round(r.tax_amount * 100 / s.tax_rate, 2) else 0 end), 0)
                  from sale_returns r join sales s on s.id = r.sale_id where r.kos_id = p_kos and r.return_date between v_m0 and v_m1),
    'ppn_keluaran', (select coalesce(sum(tax_amount), 0) from sales where kos_id = p_kos and status = 'selesai' and sale_date between v_m0 and v_m1)
                    - (select coalesce(sum(r.tax_amount), 0) from sale_returns r where r.kos_id = p_kos and r.return_date between v_m0 and v_m1));
end $$;
revoke execute on function public.tax_report(uuid, date) from public, anon;
grant execute on function public.tax_report(uuid, date) to authenticated;

-- ---------- 7) Peristiwa: dokumen baru ditulis di akhir transaksi dengan angka final ----------
create or replace function public.dom_sales_new() returns trigger language plpgsql security definer set search_path = public as $$
declare s sales;
begin
  select * into s from sales where id = new.id;
  if s.id is not null and s.status = 'selesai' then
    perform dom_emit(s.kos_id, 'SaleCreated', 'sale', s.id, s.id::text, 'sell', 'Penjualan ' || s.number || ' · ' || dom_rp(s.total) || ' · ' || s.pay_method
      || case when s.tax_amount > 0 then ' · PPN ' || dom_rp(s.tax_amount) else '' end,
      s.total, jsonb_build_object('number', s.number, 'pay_method', s.pay_method, 'split', s.pay_split, 'tax', s.tax_amount, 'branch_id', s.branch_id));
  end if;
  return null;
end $$;
create or replace function public.dom_sales() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'batal' and old.status <> 'batal' then
    perform dom_emit(new.kos_id, 'SaleVoided', 'sale', new.id, new.id::text, 'sell', 'Penjualan ' || new.number || ' dibatalkan' || coalesce(' · ' || new.void_reason, ''),
      new.total, jsonb_build_object('number', new.number));
  end if;
  return null;
end $$;
drop trigger if exists dom_sales on public.sales;
create trigger dom_sales after update of status on public.sales for each row execute function public.dom_sales();
drop trigger if exists dom_sales_new on public.sales;
create constraint trigger dom_sales_new after insert on public.sales deferrable initially deferred for each row execute function public.dom_sales_new();

create or replace function public.dom_sale_returns() returns trigger language plpgsql security definer set search_path = public as $$
declare r sale_returns;
begin
  select * into r from sale_returns where id = new.id;
  if r.id is null then return null; end if;
  perform dom_emit(r.kos_id, 'SaleReturned', 'sale', r.sale_id, r.id::text, 'sell',
    'Retur ' || r.number || ' dari ' || coalesce((select number from sales where id = r.sale_id), '-') || ' · ' || dom_rp(r.total),
    r.total, jsonb_build_object('return_id', r.id, 'number', r.number, 'refund', r.refund_method, 'tax', r.tax_amount));
  return null;
end $$;
drop trigger if exists dom_sale_returns on public.sale_returns;
create constraint trigger dom_sale_returns after insert on public.sale_returns deferrable initially deferred for each row execute function public.dom_sale_returns();

create or replace function public.dom_purchases_new() returns trigger language plpgsql security definer set search_path = public as $$
declare b purchases;
begin
  select * into b from purchases where id = new.id;
  if b.id is null then return null; end if;
  perform dom_emit(b.kos_id, case when b.status = 'dipesan' then 'PurchaseOrdered' when b.status = 'batal' then 'PurchaseVoided' else 'GoodsReceived' end, 'purchase', b.id, b.id::text || ':' || b.status, 'stock',
    case when b.status = 'dipesan' then 'Pesanan ke supplier ' else 'Belanja ' end || b.number || ' · ' || dom_rp(greatest(b.total, coalesce(b.order_total, 0))),
    greatest(b.total, coalesce(b.order_total, 0)), jsonb_build_object('number', b.number, 'status', b.status));
  return null;
end $$;
create or replace function public.dom_purchases() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform dom_emit(new.kos_id, case when new.status = 'batal' then 'PurchaseVoided' else 'GoodsReceived' end, 'purchase', new.id, new.id::text || ':' || new.status, 'stock',
      case new.status when 'batal' then 'Belanja ' || new.number || ' dibatalkan' when 'sebagian' then 'Barang diterima sebagian · ' || new.number
        else 'Barang diterima lengkap · ' || new.number end || ' · ' || dom_rp(new.total),
      new.total, jsonb_build_object('number', new.number, 'status', new.status));
  end if;
  return null;
end $$;
drop trigger if exists dom_purchases on public.purchases;
create trigger dom_purchases after update of status on public.purchases for each row execute function public.dom_purchases();
drop trigger if exists dom_purchases_new on public.purchases;
create constraint trigger dom_purchases_new after insert on public.purchases deferrable initially deferred for each row execute function public.dom_purchases_new();

-- Peristiwa lama yang tercatat Rp 0 karena urutan simpan: perbaiki ringkasannya dari angka final (hanya bila ada)
update public.domain_events e set amount = s.total,
  summary = 'Penjualan ' || s.number || ' · ' || public.dom_rp(s.total) || ' · ' || s.pay_method
from public.sales s where e.event_type = 'SaleCreated' and e.aggregate_id = s.id and coalesce(e.amount, 0) = 0 and s.total <> 0;
update public.domain_events e set amount = r.total,
  summary = 'Retur ' || r.number || ' dari ' || coalesce((select number from public.sales where id = r.sale_id), '-') || ' · ' || public.dom_rp(r.total)
from public.sale_returns r where e.event_type = 'SaleReturned' and e.idempotency_key = 'SaleReturned:' || r.id and coalesce(e.amount, 0) = 0 and r.total <> 0;
update public.domain_events e set amount = greatest(b.total, coalesce(b.order_total, 0)),
  summary = case when b.status = 'dipesan' then 'Pesanan ke supplier ' else 'Belanja ' end || b.number || ' · ' || public.dom_rp(greatest(b.total, coalesce(b.order_total, 0)))
from public.purchases b where e.aggregate_type = 'purchase' and e.aggregate_id = b.id and e.event_type in ('PurchaseOrdered', 'GoodsReceived')
  and coalesce(e.amount, 0) = 0 and greatest(b.total, coalesce(b.order_total, 0)) <> 0;

-- ---------- 8) Registry ----------
update public.modules set impl_status = 'production_ready', paths = '{}', config_path = '/pengaturan', feature_keys = '{}',
  description = 'PPN keluaran di Kasir toko: harga termasuk PPN, barang bebas PPN, jurnal PPN keluaran, laporan PPN per bulan. PPN masukan menyusul bersama faktur pembelian.'
where code = 'u_pajak';
update public.modules set applies_to = '{retail}', core = true where code = 'u_pajak';

drop function public._prasara_patch(text, text, text);
