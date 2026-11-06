-- Pembukuan (blueprint 5.1, 22.1–22.3, 25.11): posting engine double-entry dari transaksi yang sudah ada.
-- * Bagan akun per bisnis; jurnal & baris jurnal; periode bisa ditutup.
-- * Posting = selisih antara "jurnal yang seharusnya" dari dokumen sumber dan yang sudah diposting →
--   koreksi/pembalikan tercatat sebagai jurnal baru (tidak ada penghapusan diam-diam).
-- * Satu badan usaha boleh melihat gabungan bisnis-bisnisnya (dimensi bisnis); badan usaha berbeda tidak digabung.

create table if not exists public.acct_accounts (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('aset', 'kewajiban', 'ekuitas', 'pendapatan', 'beban')),
  sys_key text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kos_id, code),
  unique (kos_id, sys_key)
);
create table if not exists public.acct_entries (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  entry_date date not null,
  description text not null,
  kind text not null check (kind in ('posting', 'koreksi', 'manual')),
  source_type text,
  source_id uuid,
  created_by text,
  created_at timestamptz not null default now(),
  unique (kos_id, number)
);
create index if not exists acct_entries_kos_date on public.acct_entries(kos_id, entry_date);
create index if not exists acct_entries_source on public.acct_entries(source_type, source_id);
create table if not exists public.acct_lines (
  id bigserial primary key,
  entry_id uuid not null references public.acct_entries(id) on delete restrict,
  kos_id uuid not null references public.kos(id) on delete cascade,
  account_id uuid not null references public.acct_accounts(id),
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  source_type text,
  source_id uuid,
  memo text,
  check (debit = 0 or credit = 0)
);
create index if not exists acct_lines_entry on public.acct_lines(entry_id);
create index if not exists acct_lines_kos_acc on public.acct_lines(kos_id, account_id);
create index if not exists acct_lines_source on public.acct_lines(kos_id, source_type, source_id);
create table if not exists public.acct_periods (
  kos_id uuid not null references public.kos(id) on delete cascade,
  month date not null,
  closed_at timestamptz,
  closed_by text,
  note text,
  primary key (kos_id, month)
);
alter table public.acct_accounts enable row level security;
alter table public.acct_entries enable row level security;
alter table public.acct_lines enable row level security;
alter table public.acct_periods enable row level security;
drop policy if exists acct_accounts_select on public.acct_accounts;
create policy acct_accounts_select on public.acct_accounts for select using (public.member_can(kos_id, 'finance'));
drop policy if exists acct_entries_select on public.acct_entries;
create policy acct_entries_select on public.acct_entries for select using (public.member_can(kos_id, 'finance'));
drop policy if exists acct_lines_select on public.acct_lines;
create policy acct_lines_select on public.acct_lines for select using (public.member_can(kos_id, 'finance'));
drop policy if exists acct_periods_select on public.acct_periods;
create policy acct_periods_select on public.acct_periods for select using (public.member_can(kos_id, 'finance'));
grant select on public.acct_accounts, public.acct_entries, public.acct_lines, public.acct_periods to authenticated;

-- Jurnal yang sudah diposting tidak boleh diubah/dihapus
create or replace function public.acct_immutable()
returns trigger language plpgsql as $$
begin raise exception 'Jurnal yang sudah diposting tidak bisa diubah atau dihapus. Gunakan jurnal koreksi.'; end $$;
drop trigger if exists acct_lines_immutable on public.acct_lines;
create trigger acct_lines_immutable before update or delete on public.acct_lines for each row when (pg_trigger_depth() = 0) execute function public.acct_immutable();
drop trigger if exists acct_entries_immutable on public.acct_entries;
create trigger acct_entries_immutable before update or delete on public.acct_entries for each row when (pg_trigger_depth() = 0) execute function public.acct_immutable();

-- Bagan akun bawaan
create or replace function public.acct_ensure(p_kos uuid)
returns void language sql security definer set search_path = public as $$
  insert into acct_accounts(kos_id, code, name, type, sys_key)
  select p_kos, a.code, a.name, a.type, a.k from (values
    ('1-1100', 'Kas', 'aset', 'kas'),
    ('1-1200', 'Bank', 'aset', 'bank'),
    ('1-1300', 'Piutang usaha (kasbon)', 'aset', 'piutang'),
    ('1-1400', 'Persediaan barang', 'aset', 'persediaan'),
    ('1-2000', 'Aset tetap & investasi', 'aset', 'aset_tetap'),
    ('2-1100', 'Utang usaha (supplier)', 'kewajiban', 'utang'),
    ('2-1200', 'Pinjaman', 'kewajiban', 'pinjaman'),
    ('3-1000', 'Modal pemilik', 'ekuitas', 'modal'),
    ('3-2000', 'Prive (diambil pemilik)', 'ekuitas', 'prive'),
    ('3-3000', 'Ekuitas saldo awal', 'ekuitas', 'saldo_awal'),
    ('4-1000', 'Penjualan', 'pendapatan', 'penjualan'),
    ('4-1100', 'Retur penjualan', 'pendapatan', 'retur_penjualan'),
    ('4-2000', 'Pendapatan sewa & tagihan', 'pendapatan', 'pendapatan_sewa'),
    ('4-9000', 'Pendapatan lain', 'pendapatan', 'pendapatan_lain'),
    ('5-1000', 'Harga pokok penjualan (HPP)', 'beban', 'hpp'),
    ('5-2000', 'Selisih & kerusakan persediaan', 'beban', 'selisih_persediaan'),
    ('6-1000', 'Beban operasional', 'beban', 'beban_operasional'),
    ('6-9000', 'Beban non-operasional', 'beban', 'beban_lain')
  ) a(code, name, type, k)
  on conflict do nothing;
$$;

-- Jurnal yang seharusnya untuk setiap dokumen sumber (+ = debit, − = kredit). Setiap dokumen seimbang.
create or replace function public.acct_desired(p_kos uuid)
returns table(source_type text, source_id uuid, src_date date, descr text, sys_key text, amount numeric)
language sql stable security definer set search_path = public as $$
  with acc(m, k) as (values ('tunai', 'kas'), ('transfer', 'bank'), ('kasbon', 'piutang'), ('utang', 'utang'), ('kas', 'kas'), ('bank', 'bank'), ('ewallet', 'bank'), ('lainnya', 'bank'))
  -- penjualan
  select 'sale', s.id, s.sale_date, 'Penjualan ' || s.number, x.k, x.v from sales s
    cross join lateral (values ((select k from acc where m = s.pay_method), s.total), ('penjualan', -s.total), ('hpp', s.cost_total), ('persediaan', -s.cost_total)) x(k, v)
    where s.kos_id = p_kos and s.status = 'selesai'
  union all
  select 'return', r.id, r.return_date, 'Retur ' || r.number, x.k, x.v from sale_returns r
    cross join lateral (values ('retur_penjualan', r.total), ((select k from acc where m = r.refund_method), -r.total), ('persediaan', r.cost_total), ('hpp', -r.cost_total)) x(k, v)
    where r.kos_id = p_kos
  union all
  select 'purchase', b.id, b.purchase_date, 'Belanja ' || b.number, x.k, x.v from purchases b
    cross join lateral (values ('persediaan', b.total), ((select k from acc where m = b.pay_method), -b.total)) x(k, v)
    where b.kos_id = p_kos and b.status in ('selesai', 'sebagian')
  union all
  select 'debt_payment', d.id, d.date, case when d.kind = 'piutang' then 'Terima kasbon' else 'Bayar utang' end || coalesce(' · ' || (select name from contacts where id = d.contact_id), ''), x.k, x.v from debt_payments d
    cross join lateral (values (case when d.kind = 'piutang' then d.account else 'utang' end, d.amount), (case when d.kind = 'piutang' then 'piutang' else d.account end, -d.amount)) x(k, v)
    where d.kos_id = p_kos and d.status = 'selesai'
  union all
  select 'stock_move', m.id, (m.created_at at time zone 'Asia/Jakarta')::date,
         case m.kind when 'awal' then 'Stok awal' when 'opname' then 'Hitung ulang stok' when 'rusak' then 'Barang rusak' when 'kedaluwarsa' then 'Barang kedaluwarsa' else 'Koreksi stok' end
           || ' · ' || coalesce((select name from products where id = m.product_id), ''), x.k, x.v from stock_moves m
    cross join lateral (values ('persediaan', m.value), (case when m.kind = 'awal' then 'saldo_awal' else 'selisih_persediaan' end, -m.value)) x(k, v)
    where m.kos_id = p_kos and m.kind in ('awal', 'opname', 'rusak', 'kedaluwarsa', 'koreksi') and m.value <> 0
  union all
  select 'expense', e.id, e.date, coalesce(nullif(e.description, ''), 'Pengeluaran') || coalesce(' · ' || (select name from expense_categories where id = e.category_id), ''), x.k, x.v from expenses e
    cross join lateral (values (case e.kind when 'operasional' then 'beban_operasional' when 'modal' then 'aset_tetap' else 'beban_lain' end, e.amount), (e.account, -e.amount)) x(k, v)
    where e.kos_id = p_kos
  union all
  select 'cash_entry', c.id, c.date,
         case c.kind when 'pendapatan_lain' then 'Pendapatan lain' when 'setoran_modal' then 'Setoran modal' when 'prive' then 'Diambil pemilik' when 'pinjaman_masuk' then 'Pinjaman masuk'
           when 'bayar_pinjaman' then 'Bayar pinjaman' when 'setor_bank' then 'Setor ke bank' else 'Tarik dari bank' end || coalesce(' · ' || nullif(c.description, ''), ''), x.k, x.v from cash_entries c
    cross join lateral (values
      (case c.kind when 'prive' then 'prive' when 'bayar_pinjaman' then 'pinjaman' when 'setor_bank' then 'bank' when 'tarik_bank' then 'kas' else c.account end, c.amount),
      (case c.kind when 'pendapatan_lain' then 'pendapatan_lain' when 'setoran_modal' then 'modal' when 'pinjaman_masuk' then 'pinjaman' when 'setor_bank' then 'kas' when 'tarik_bank' then 'bank' else c.account end, -c.amount)) x(k, v)
    where c.kos_id = p_kos
  union all
  select 'payment', p.id, p.paid_at, 'Pembayaran sewa' || coalesce(' · ' || (select o.name from invoices i join occupants o on o.id = i.occupant_id where i.id = p.invoice_id), ''), x.k, x.v from payments p
    cross join lateral (values ((select k from acc where m = p.method), p.amount), ('pendapatan_sewa', -p.amount)) x(k, v)
    where p.kos_id = p_kos and p.status = 'terverifikasi';
$$;
revoke execute on function public.acct_desired(uuid) from public, anon, authenticated;

create or replace function public.acct_period_closed(p_kos uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from acct_periods where kos_id = p_kos and month = date_trunc('month', p_date)::date and closed_at is not null);
$$;

create or replace function public.acct_next_number(p_kos uuid, p_date date)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) + 1 into n from acct_entries where kos_id = p_kos and number like 'JRN-' || to_char(p_date, 'YYMM') || '-%';
  return 'JRN-' || to_char(p_date, 'YYMM') || '-' || lpad(n::text, 4, '0');
end $$;

-- Posting engine: bandingkan "seharusnya" dengan yang sudah diposting, lalu posting selisihnya
create or replace function public.acct_sync_internal(p_kos uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_entry uuid; v_date date; v_today date := (now() at time zone 'Asia/Jakarta')::date; n int := 0; v_first boolean;
begin
  perform acct_ensure(p_kos);
  perform pg_advisory_xact_lock(hashtext('acct:' || p_kos::text));
  for r in
    with d as (select source_type, source_id, max(src_date) as src_date, max(descr) as descr, sys_key, round(sum(amount), 2) as amt
               from acct_desired(p_kos) group by source_type, source_id, sys_key),
    p as (select l.source_type, l.source_id, a.sys_key, round(sum(l.debit - l.credit), 2) as amt
          from acct_lines l join acct_accounts a on a.id = l.account_id
          where l.kos_id = p_kos and l.source_type is not null group by l.source_type, l.source_id, a.sys_key),
    diff as (select coalesce(d.source_type, p.source_type) st, coalesce(d.source_id, p.source_id) sid, coalesce(d.sys_key, p.sys_key) k,
                    coalesce(d.amt, 0) - coalesce(p.amt, 0) delta, d.src_date, d.descr
             from d full join p on p.source_type = d.source_type and p.source_id = d.source_id and p.sys_key = d.sys_key)
    select st, sid, max(src_date) src_date, max(descr) descr, jsonb_agg(jsonb_build_object('k', k, 'v', delta)) lines
    from diff where delta <> 0 group by st, sid
  loop
    v_first := not exists (select 1 from acct_lines where kos_id = p_kos and source_type = r.st and source_id = r.sid);
    v_date := case when v_first and r.src_date is not null and not acct_period_closed(p_kos, r.src_date) then r.src_date else v_today end;
    insert into acct_entries(kos_id, number, entry_date, description, kind, source_type, source_id, created_by)
    values (p_kos, acct_next_number(p_kos, v_date), v_date,
            case when v_first then coalesce(r.descr, r.st)
                 when r.descr is null then 'Pembalikan: ' || coalesce((select description from acct_entries where kos_id = p_kos and source_type = r.st and source_id = r.sid and kind = 'posting' order by created_at limit 1), r.st) || ' (dibatalkan/dihapus)'
                 else 'Koreksi: ' || r.descr || ' (diubah)' end,
            case when v_first then 'posting' else 'koreksi' end, r.st, r.sid, 'sistem')
    returning id into v_entry;
    insert into acct_lines(entry_id, kos_id, account_id, debit, credit, source_type, source_id)
    select v_entry, p_kos, a.id, greatest((x->>'v')::numeric, 0), greatest(-(x->>'v')::numeric, 0), r.st, r.sid
    from jsonb_array_elements(r.lines) x join acct_accounts a on a.kos_id = p_kos and a.sys_key = x->>'k';
    if (select sum(debit) - sum(credit) from acct_lines where entry_id = v_entry) <> 0 then raise exception 'Jurnal tidak seimbang untuk % %', r.st, r.sid; end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.acct_sync_internal(uuid) from public, anon, authenticated;

create or replace function public.acct_sync(p_kos uuid)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  return acct_sync_internal(p_kos);
end $$;

-- Jadwal harian (kunci server)
create or replace function public.acct_sync_all()
returns jsonb language plpgsql security definer set search_path = public as $$
declare k record; n int := 0; v_err int := 0;
begin
  for k in select id from kos where suspended_at is null loop
    begin n := n + acct_sync_internal(k.id); exception when others then v_err := v_err + 1; end;
  end loop;
  return jsonb_build_object('jurnal', n, 'gagal', v_err);
end $$;
revoke execute on function public.acct_sync_all() from public, anon, authenticated;
grant execute on function public.acct_sync_all() to service_role;

-- Cakupan laporan: satu bisnis, atau semua bisnis dalam satu badan usaha (wajib akses keuangan ke semuanya)
create or replace function public.acct_scope(p_kos uuid, p_entity boolean)
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare v_le uuid; v_ids uuid[];
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if not p_entity then return array[p_kos]; end if;
  select legal_entity_id into v_le from kos where id = p_kos;
  if v_le is null then raise exception 'Bisnis ini belum diberi badan usaha (Konfigurasi › Profil)'; end if;
  select array_agg(id order by created_at) into v_ids from kos where legal_entity_id = v_le and suspended_at is null;
  if exists (select 1 from unnest(v_ids) i where not member_in('finance', i)) then raise exception 'Anda tidak punya akses keuangan ke semua bisnis dalam badan usaha ini'; end if;
  return v_ids;
end $$;

-- Laporan: laba rugi periode, neraca per tanggal akhir, rekonsiliasi, status kelengkapan
create or replace function public.acct_report(p_kos uuid, p_entity boolean, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_posted int := 0; v_recon jsonb := '[]'; k record; v_led jsonb; v_inv numeric; v_bal numeric; i uuid;
begin
  v_ids := acct_scope(p_kos, p_entity);
  foreach i in array v_ids loop v_posted := v_posted + acct_sync_internal(i); end loop;
  -- rekonsiliasi: saldo buku besar vs angka operasional (toko)
  for k in select id, name from kos where id = any(v_ids) and business_type = 'retail' loop
    v_led := retail_ledger_internal_full(k.id) || retail_ledger_internal(k.id);
    v_inv := (select coalesce(sum(round(stock * cost, 2)), 0) from products where kos_id = k.id and stock > 0);
    v_recon := v_recon || (
      select jsonb_agg(jsonb_build_object('bisnis', k.name, 'akun', x.nama, 'buku', x.buku, 'operasional', x.ops, 'selisih', round(x.buku - x.ops, 2)))
      from (select a.name nama,
                   coalesce((select sum(l.debit - l.credit) from acct_lines l where l.account_id = a.id), 0) buku,
                   case a.sys_key when 'kas' then (v_led->>'kas')::numeric
                                  when 'piutang' then (select coalesce(sum((x->>'sisa')::numeric), 0) from jsonb_array_elements(v_led->'kasbon') x)
                                  when 'utang' then -(select coalesce(sum((x->>'sisa')::numeric), 0) from jsonb_array_elements(v_led->'utang') x)
                                  when 'persediaan' then v_inv end ops
            from acct_accounts a where a.kos_id = k.id and a.sys_key in ('kas', 'piutang', 'utang', 'persediaan')) x);
  end loop;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'generated_at', now(), 'posted_now', v_posted,
    'businesses', (select jsonb_agg(jsonb_build_object('id', kk.id, 'name', kk.name, 'type', kk.business_type, 'basis', case when kk.business_type = 'retail' then 'akrual sederhana' else 'kas' end) order by kk.created_at) from kos kk where kk.id = any(v_ids)),
    'entity', (select jsonb_build_object('id', le.id, 'name', le.name, 'kind', le.kind) from kos kk join legal_entities le on le.id = kk.legal_entity_id where kk.id = p_kos),
    'accounts', (select coalesce(jsonb_agg(x order by x.code), '[]') from (
        select a.code, a.name, a.type, a.sys_key,
          round(coalesce(sum(l.debit - l.credit) filter (where e.entry_date between p_from and p_to), 0), 2) as period,
          round(coalesce(sum(l.debit - l.credit) filter (where e.entry_date <= p_to), 0), 2) as balance
        from acct_accounts a left join acct_lines l on l.account_id = a.id left join acct_entries e on e.id = l.entry_id
        where a.kos_id = any(v_ids) group by a.code, a.name, a.type, a.sys_key) x),
    'recon', v_recon,
    'closed', (select coalesce(jsonb_agg(to_char(month, 'YYYY-MM') order by month), '[]') from acct_periods where kos_id = any(v_ids) and closed_at is not null),
    'checks', jsonb_build_object(
      'balanced', (select coalesce(sum(debit) = sum(credit), true) from acct_lines where kos_id = any(v_ids)),
      'no_cost_sales', (select count(*) from sale_lines sl join sales s on s.id = sl.sale_id where s.kos_id = any(v_ids) and s.status = 'selesai' and sl.cost = 0 and s.sale_date between p_from and p_to),
      'pending_payments', (select count(*) from payments where kos_id = any(v_ids) and status = 'menunggu' and paid_at between p_from and p_to),
      'negative_stock', (select count(*) from products where kos_id = any(v_ids) and active and stock < 0)));
end $$;

-- Buku besar satu akun (berdasarkan kode, di semua bisnis cakupan)
create or replace function public.acct_ledger(p_kos uuid, p_entity boolean, p_code text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_ids uuid[];
begin
  v_ids := acct_scope(p_kos, p_entity);
  return jsonb_build_object(
    'opening', (select round(coalesce(sum(l.debit - l.credit), 0), 2) from acct_lines l join acct_accounts a on a.id = l.account_id join acct_entries e on e.id = l.entry_id
                where a.kos_id = any(v_ids) and a.code = p_code and e.entry_date < p_from),
    'lines', (select coalesce(jsonb_agg(x order by x.entry_date, x.number), '[]') from (
        select e.entry_date, e.number, e.description, e.kind, e.source_type, e.source_id, kk.name as business, l.debit, l.credit
        from acct_lines l join acct_accounts a on a.id = l.account_id join acct_entries e on e.id = l.entry_id join kos kk on kk.id = l.kos_id
        where a.kos_id = any(v_ids) and a.code = p_code and e.entry_date between p_from and p_to
        order by e.entry_date, e.number limit 500) x));
end $$;

create or replace function public.acct_journal(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'number', e.number, 'date', e.entry_date, 'description', e.description, 'kind', e.kind,
      'source_type', e.source_type, 'source_id', e.source_id, 'created_by', e.created_by,
      'lines', (select jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'debit', l.debit, 'credit', l.credit, 'memo', l.memo) order by l.debit desc, a.code)
                from acct_lines l join acct_accounts a on a.id = l.account_id where l.entry_id = e.id)) order by e.entry_date desc, e.number desc), '[]')
    from (select * from acct_entries where kos_id = p_kos and entry_date between p_from and p_to order by entry_date desc, number desc limit 300) e);
end $$;

-- Jurnal manual (penyesuaian / saldo awal). Pemilik saja; harus seimbang; tidak boleh di periode tertutup.
create or replace function public.acct_manual(p_kos uuid, p_date date, p_description text, p_lines jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_entry uuid; v_no text; ln jsonb; v_d numeric := 0; v_c numeric := 0; a acct_accounts;
begin
  if not member_can(p_kos, 'team') then raise exception 'Jurnal manual hanya oleh pemilik'; end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak valid'; end if;
  if acct_period_closed(p_kos, p_date) then raise exception 'Periode % sudah ditutup', to_char(p_date, 'MM/YYYY'); end if;
  if coalesce(length(trim(p_description)), 0) < 5 then raise exception 'Tuliskan keterangan (minimal 5 huruf)'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then raise exception 'Minimal dua baris'; end if;
  perform acct_ensure(p_kos);
  for ln in select * from jsonb_array_elements(p_lines) loop
    if not exists (select 1 from acct_accounts where kos_id = p_kos and code = ln->>'code' and active) then raise exception 'Akun % tidak ada', ln->>'code'; end if;
    if coalesce((ln->>'debit')::numeric, 0) < 0 or coalesce((ln->>'credit')::numeric, 0) < 0 or (coalesce((ln->>'debit')::numeric, 0) > 0 and coalesce((ln->>'credit')::numeric, 0) > 0) then
      raise exception 'Setiap baris hanya debit atau kredit, tidak minus'; end if;
    v_d := v_d + coalesce((ln->>'debit')::numeric, 0); v_c := v_c + coalesce((ln->>'credit')::numeric, 0);
  end loop;
  if v_d <> v_c or v_d = 0 then raise exception 'Jurnal tidak seimbang: debit % ≠ kredit %', v_d, v_c; end if;
  perform pg_advisory_xact_lock(hashtext('acct:' || p_kos::text));
  v_no := acct_next_number(p_kos, p_date);
  insert into acct_entries(kos_id, number, entry_date, description, kind, created_by) values (p_kos, v_no, p_date, trim(p_description), 'manual', actor_email()) returning id into v_entry;
  insert into acct_lines(entry_id, kos_id, account_id, debit, credit, memo)
  select v_entry, p_kos, a2.id, coalesce((x->>'debit')::numeric, 0), coalesce((x->>'credit')::numeric, 0), nullif(x->>'memo', '')
  from jsonb_array_elements(p_lines) x join acct_accounts a2 on a2.kos_id = p_kos and a2.code = x->>'code'
  where coalesce((x->>'debit')::numeric, 0) > 0 or coalesce((x->>'credit')::numeric, 0) > 0;
  perform config_log(p_kos, 'jurnal_manual', v_no, null, jsonb_build_object('tanggal', p_date, 'baris', p_lines), trim(p_description), 'tinggi', actor_email());
  return v_no;
end $$;

-- Tutup / buka periode (risiko tinggi; tercatat)
create or replace function public.acct_period_set(p_kos uuid, p_month date, p_close boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date;
begin
  if not member_can(p_kos, 'team') then raise exception 'Tutup/buka periode hanya oleh pemilik'; end if;
  if p_close and v_m >= date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date then raise exception 'Hanya bulan yang sudah lewat yang bisa ditutup'; end if;
  if coalesce(length(trim(p_note)), 0) < 5 then raise exception 'Tuliskan alasan (minimal 5 huruf)'; end if;
  if p_close then perform acct_sync_internal(p_kos); end if;
  insert into acct_periods(kos_id, month, closed_at, closed_by, note) values (p_kos, v_m, case when p_close then now() end, actor_email(), trim(p_note))
  on conflict (kos_id, month) do update set closed_at = case when p_close then now() end, closed_by = actor_email(), note = trim(p_note);
  perform config_log(p_kos, case when p_close then 'tutup_periode' else 'buka_periode' end, to_char(v_m, 'YYYY-MM'), null, null, p_note, 'tinggi', actor_email());
end $$;

-- Modul Pembukuan kini tersedia (bukan lagi "segera")
update public.modules set status = 'available', name = 'Pembukuan (jurnal & neraca)', description = 'Jurnal otomatis dari transaksi, buku besar, laba rugi, neraca, tutup periode.',
  paths = '{/pembukuan}', data_used = 'Semua transaksi keuangan', sort = 31 where code = 'u_akuntansi';
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'u_akuntansi', true, 'sistem' from public.kos k on conflict do nothing;

revoke execute on function public.acct_ensure(uuid), public.acct_period_closed(uuid, date), public.acct_next_number(uuid, date), public.acct_sync(uuid), public.acct_scope(uuid, boolean),
  public.acct_report(uuid, boolean, date, date), public.acct_ledger(uuid, boolean, text, date, date), public.acct_journal(uuid, date, date),
  public.acct_manual(uuid, date, text, jsonb), public.acct_period_set(uuid, date, boolean, text) from public, anon;
revoke execute on function public.acct_ensure(uuid), public.acct_next_number(uuid, date) from authenticated;
grant execute on function public.acct_sync(uuid), public.acct_report(uuid, boolean, date, date), public.acct_ledger(uuid, boolean, text, date, date), public.acct_journal(uuid, date, date),
  public.acct_manual(uuid, date, text, jsonb), public.acct_period_set(uuid, date, boolean, text) to authenticated;
