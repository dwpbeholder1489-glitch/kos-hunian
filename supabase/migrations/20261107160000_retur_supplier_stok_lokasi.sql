-- (1) Retur ke supplier: barang dikembalikan → stok berkurang, harga modal dihitung ulang, utang dipotong atau uang kembali.
-- (2) Stok per lokasi (blueprint 25.8, 25.12): lokasi utama + cabang/gudang, stok per lokasi, mutasi antar lokasi dengan jejak asal-tujuan,
--     karyawan bisa dikunci ke lokasinya, penjualan/belanja tercatat di lokasi tempat dilakukan.

-- ================= helper patch =================
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

-- ================= (1) RETUR KE SUPPLIER =================
create table if not exists public.purchase_returns (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id),
  contact_id uuid references public.contacts(id),
  number text not null,
  return_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  total numeric(14,2) not null default 0 check (total >= 0),
  refund_method text not null check (refund_method in ('potong_utang', 'tunai', 'transfer')),
  reason text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (kos_id, number)
);
create index if not exists purchase_returns_purchase on public.purchase_returns(purchase_id);
create index if not exists purchase_returns_contact on public.purchase_returns(contact_id);
create table if not exists public.purchase_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.purchase_returns(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  purchase_line_id uuid not null references public.purchase_lines(id),
  product_id uuid not null references public.products(id),
  name text not null,
  unit text not null,
  unit_qty numeric(14,3) not null,
  qty numeric(14,3) not null check (qty > 0),
  price numeric(14,2) not null,
  amount numeric(14,2) not null
);
create index if not exists purchase_return_lines_line on public.purchase_return_lines(purchase_line_id);
alter table public.purchase_returns enable row level security;
alter table public.purchase_return_lines enable row level security;
drop policy if exists purchase_returns_select on public.purchase_returns;
create policy purchase_returns_select on public.purchase_returns for select using (public.member_can(kos_id, 'stock,finance'));
drop policy if exists purchase_return_lines_select on public.purchase_return_lines;
create policy purchase_return_lines_select on public.purchase_return_lines for select using (public.member_can(kos_id, 'stock,finance'));
grant select on public.purchase_returns, public.purchase_return_lines to authenticated;

insert into public.approval_actions(code, label, risk, request_area, default_required, applies_to, sort)
values ('retur_belanja', 'Retur barang ke supplier', 'menengah', 'stock', false, '{retail}', 4)
on conflict (code) do nothing;

-- ================= (2) LOKASI =================
alter table public.branches add column if not exists is_main boolean not null default false;
create unique index if not exists branches_one_main on public.branches(kos_id) where is_main;

create table if not exists public.member_locations (
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid not null,
  branch_id uuid not null references public.branches(id) on delete cascade,
  locked boolean not null default false,       -- true = ditetapkan pemilik, karyawan tidak bisa pindah sendiri
  updated_at timestamptz not null default now(),
  primary key (kos_id, user_id)
);
alter table public.member_locations enable row level security;
drop policy if exists member_locations_select on public.member_locations;
create policy member_locations_select on public.member_locations for select using (user_id = auth.uid() or public.member_can(kos_id, 'team'));
grant select on public.member_locations to authenticated;

create table if not exists public.stock_levels (
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  qty numeric(14,3) not null default 0,
  primary key (product_id, branch_id)
);
create index if not exists stock_levels_kos on public.stock_levels(kos_id, branch_id);
alter table public.stock_levels enable row level security;
drop policy if exists stock_levels_select on public.stock_levels;
create policy stock_levels_select on public.stock_levels for select using (public.member_can(kos_id, 'stock,finance'));
grant select on public.stock_levels to authenticated;

create table if not exists public.stock_transfers (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  from_branch uuid not null references public.branches(id),
  to_branch uuid not null references public.branches(id),
  lines jsonb not null,
  note text,
  created_by uuid default auth.uid(),
  created_email text,
  created_at timestamptz not null default now(),
  unique (kos_id, number)
);
alter table public.stock_transfers enable row level security;
drop policy if exists stock_transfers_select on public.stock_transfers;
create policy stock_transfers_select on public.stock_transfers for select using (public.member_can(kos_id, 'stock,finance'));
grant select on public.stock_transfers to authenticated;

alter table public.stock_moves add column if not exists branch_id uuid references public.branches(id);
alter table public.sales add column if not exists branch_id uuid references public.branches(id);
alter table public.purchases add column if not exists branch_id uuid references public.branches(id);
create index if not exists sales_branch on public.sales(kos_id, branch_id, sale_date);
alter table public.stock_moves drop constraint if exists stock_moves_kind_check;
alter table public.stock_moves add constraint stock_moves_kind_check check (kind in ('awal', 'opname', 'rusak', 'kedaluwarsa', 'koreksi', 'jual', 'beli', 'retur_jual', 'retur_beli', 'batal', 'transfer'));

-- Lokasi utama (dibuat otomatis untuk bisnis retail)
create or replace function public.branch_main_ensure(p_kos uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from branches where kos_id = p_kos and is_main;
  if v is null then
    insert into branches(kos_id, name, kind, is_main) values (p_kos, 'Lokasi utama', 'cabang', true)
    on conflict do nothing returning id into v;
    if v is null then select id into v from branches where kos_id = p_kos and is_main; end if;
  end if;
  return v;
end $$;

-- Lokasi kerja pengguna saat ini: (persetujuan → lokasi peminta) › pilihan/penetapan › lokasi utama
create or replace function public.stock_loc(p_kos uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select b.id from branches b where b.kos_id = p_kos and b.active and b.id::text = nullif(current_setting('prasara.branch', true), '')),
    (select m.branch_id from member_locations m join branches b on b.id = m.branch_id and b.active where m.kos_id = p_kos and m.user_id = auth.uid()),
    (select id from branches where kos_id = p_kos and is_main));
$$;

create or replace function public.loc_multi(p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from branches where kos_id = p_kos and active) > 1;
$$;

-- Setiap mutasi stok tercatat di lokasi: dari dokumennya (penjualan/belanja/retur), atau lokasi kerja pengguna
create or replace function public.stock_moves_loc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null then
    new.branch_id := coalesce(
      (select branch_id from sales where id = new.ref_id),
      (select s.branch_id from sale_returns r join sales s on s.id = r.sale_id where r.id = new.ref_id),
      (select branch_id from purchases where id = new.ref_id),
      (select b.branch_id from purchase_returns r join purchases b on b.id = r.purchase_id where r.id = new.ref_id),
      stock_loc(new.kos_id), branch_main_ensure(new.kos_id));
  end if;
  insert into stock_levels(product_id, branch_id, kos_id, qty) values (new.product_id, new.branch_id, new.kos_id, new.delta)
  on conflict (product_id, branch_id) do update set qty = stock_levels.qty + excluded.qty;
  return new;
end $$;
drop trigger if exists stock_moves_loc on public.stock_moves;
create trigger stock_moves_loc before insert on public.stock_moves for each row execute function public.stock_moves_loc();

create or replace function public.doc_loc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and (select business_type from kos where id = new.kos_id) = 'retail' then
    new.branch_id := coalesce(stock_loc(new.kos_id), branch_main_ensure(new.kos_id));
  end if;
  return new;
end $$;
drop trigger if exists sales_loc on public.sales;
create trigger sales_loc before insert on public.sales for each row execute function public.doc_loc();
drop trigger if exists purchases_loc on public.purchases;
create trigger purchases_loc before insert on public.purchases for each row execute function public.doc_loc();

create or replace function public.kos_main_branch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.business_type = 'retail' then perform branch_main_ensure(new.id); end if;
  return new;
end $$;
drop trigger if exists kos_main_branch on public.kos;
create trigger kos_main_branch after insert on public.kos for each row execute function public.kos_main_branch();

-- Data lama: semua stok & transaksi dianggap di lokasi utama
do $$
declare k record; v uuid;
begin
  for k in select id from kos where business_type = 'retail' loop
    v := branch_main_ensure(k.id);
    update stock_moves set branch_id = v where kos_id = k.id and branch_id is null;
    update sales set branch_id = v where kos_id = k.id and branch_id is null;
    update purchases set branch_id = v where kos_id = k.id and branch_id is null;
    insert into stock_levels(product_id, branch_id, kos_id, qty)
    select id, v, k.id, stock from products where kos_id = k.id
    on conflict (product_id, branch_id) do update set qty = excluded.qty;
  end loop;
end $$;

-- Daftar lokasi & lokasi kerja saya, per bisnis retail
create or replace function public.my_locations()
returns jsonb language plpgsql security definer set search_path = public as $$
declare k record; r jsonb := '{}';
begin
  for k in select id from kos where business_type = 'retail' and (owner_id = auth.uid() or exists (select 1 from kos_members m where m.kos_id = kos.id and m.user_id = auth.uid() and m.active)) loop
    perform branch_main_ensure(k.id);
    r := r || jsonb_build_object(k.id::text, jsonb_build_object(
      'list', (select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'kind', b.kind, 'is_main', b.is_main) order by b.is_main desc, b.name) from branches b where b.kos_id = k.id and b.active),
      'current', stock_loc(k.id),
      'locked', coalesce((select locked from member_locations where kos_id = k.id and user_id = auth.uid()), false) and not member_can(k.id, 'team')));
  end loop;
  return r;
end $$;

create or replace function public.my_location_set(p_kos uuid, p_branch uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if not exists (select 1 from branches where id = p_branch and kos_id = p_kos and active) then raise exception 'Lokasi tidak ditemukan'; end if;
  if not member_can(p_kos, 'team') and exists (select 1 from member_locations where kos_id = p_kos and user_id = auth.uid() and locked) then
    raise exception 'Lokasi kerja Anda ditetapkan pemilik. Minta pemilik mengubahnya di menu Karyawan.'; end if;
  insert into member_locations(kos_id, user_id, branch_id, locked) values (p_kos, auth.uid(), p_branch, false)
  on conflict (kos_id, user_id) do update set branch_id = excluded.branch_id, updated_at = now();
end $$;

-- Pemilik menetapkan lokasi kerja karyawan (null = bebas memilih)
create or replace function public.member_location_set(p_kos uuid, p_user uuid, p_branch uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not member_can(p_kos, 'team') then raise exception 'Hanya pemilik yang bisa menetapkan lokasi karyawan'; end if;
  if not exists (select 1 from kos_members where kos_id = p_kos and user_id = p_user) then raise exception 'Karyawan tidak ditemukan'; end if;
  select b.name into v_old from member_locations m join branches b on b.id = m.branch_id where m.kos_id = p_kos and m.user_id = p_user and m.locked;
  if p_branch is null then
    delete from member_locations where kos_id = p_kos and user_id = p_user;
  else
    if not exists (select 1 from branches where id = p_branch and kos_id = p_kos and active) then raise exception 'Lokasi tidak ditemukan'; end if;
    insert into member_locations(kos_id, user_id, branch_id, locked) values (p_kos, p_user, p_branch, true)
    on conflict (kos_id, user_id) do update set branch_id = excluded.branch_id, locked = true, updated_at = now();
  end if;
  perform config_log(p_kos, 'lokasi_karyawan', coalesce((select email from auth.users where id = p_user), p_user::text),
    to_jsonb(v_old), to_jsonb(coalesce((select name from branches where id = p_branch), 'bebas memilih')), null, 'rendah', actor_email());
end $$;

-- Stok per lokasi (untuk menu Barang)
create or replace function public.stock_levels_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('stock,finance', p_kos) then raise exception 'Tidak punya akses ke stok'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'branch_id', branch_id, 'qty', qty)), '[]') from stock_levels where kos_id = p_kos and qty <> 0);
end $$;

-- Mutasi stok antar lokasi: dua catatan (keluar & masuk) dengan jejak asal–tujuan; total stok bisnis tidak berubah
create or replace function public.stock_transfer(p_id uuid, p_kos uuid, p_from uuid, p_to uuid, p_lines jsonb, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_day date := (now() at time zone 'Asia/Jakarta')::date; v_no text; x jsonb; p products; v_qty numeric; v_have numeric; v_ex stock_transfers; v_lines jsonb := '[]';
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke stok'; end if;
  select * into v_ex from stock_transfers where id = p_id;
  if v_ex.id is not null then return jsonb_build_object('id', v_ex.id, 'number', v_ex.number, 'duplicate', true); end if;
  if p_from = p_to then raise exception 'Lokasi asal dan tujuan harus berbeda'; end if;
  if (select count(*) from branches where id in (p_from, p_to) and kos_id = p_kos and active) <> 2 then raise exception 'Lokasi tidak ditemukan atau nonaktif'; end if;
  if not member_can(p_kos, 'team') and exists (select 1 from member_locations where kos_id = p_kos and user_id = auth.uid() and locked and branch_id <> p_from) then
    raise exception 'Anda hanya bisa mengirim barang dari lokasi kerja Anda'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Pilih barang yang dipindahkan'; end if;
  perform pg_advisory_xact_lock(hashtext('mutasi:' || p_kos::text));
  v_no := 'MUT-' || to_char(v_day, 'YYMMDD') || '-' || lpad(((select count(*) from stock_transfers where kos_id = p_kos and created_at >= v_day) + 1)::text, 3, '0');
  insert into stock_transfers(id, kos_id, number, from_branch, to_branch, lines, note, created_email) values (p_id, p_kos, v_no, p_from, p_to, '[]', nullif(trim(coalesce(p_note, '')), ''), actor_email());
  for x in select * from jsonb_array_elements(p_lines) loop
    select * into p from products where id = (x->>'product_id')::uuid and kos_id = p_kos for update;
    if p.id is null then raise exception 'Barang tidak ditemukan'; end if;
    v_qty := round(coalesce((x->>'qty')::numeric, 0), 3);
    if v_qty <= 0 then raise exception 'Jumlah % harus lebih dari 0', p.name; end if;
    select coalesce(qty, 0) into v_have from stock_levels where product_id = p.id and branch_id = p_from;
    if coalesce(v_have, 0) < v_qty then raise exception 'Stok % di lokasi asal hanya % %', p.name, trim(to_char(coalesce(v_have, 0), 'FM999999990.###')), p.base_unit; end if;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note, branch_id)
    values (p_kos, p.id, 'transfer', -v_qty, p.stock, 0, p_id, v_no || ' keluar', p_from),
           (p_kos, p.id, 'transfer', v_qty, p.stock, 0, p_id, v_no || ' masuk', p_to);
    v_lines := v_lines || jsonb_build_object('product_id', p.id, 'name', p.name, 'qty', v_qty, 'unit', p.base_unit);
  end loop;
  update stock_transfers set lines = v_lines where id = p_id;
  return jsonb_build_object('id', p_id, 'number', v_no, 'duplicate', false);
end $$;

-- ================= Retur ke supplier: fungsi =================
create or replace function public.purchase_return_create(p_id uuid, p_purchase uuid, p_lines jsonb, p_refund text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b purchases; x jsonb; l purchase_lines; p products; v_ex purchase_returns; v_day date := (now() at time zone 'Asia/Jakarta')::date; v_no text;
        v_qty numeric; v_done numeric; v_base numeric; v_amt numeric; v_total numeric := 0; v_have numeric; v_rest numeric; v_cost numeric; v_loc uuid;
begin
  select * into v_ex from purchase_returns where id = p_id;
  if v_ex.id is not null then return jsonb_build_object('id', v_ex.id, 'number', v_ex.number, 'total', v_ex.total, 'duplicate', true); end if;
  select * into b from purchases where id = p_purchase for update;
  if b.id is null or not member_in('stock', b.kos_id) then raise exception 'Belanja tidak ditemukan'; end if;
  if approval_needed(b.kos_id, 'retur_belanja') then raise exception 'PERLU_PERSETUJUAN: Tindakan ini perlu persetujuan pemilik. Kirim permintaan dari aplikasi.'; end if;
  if b.status not in ('selesai', 'sebagian') then raise exception 'Hanya belanja yang barangnya sudah diterima yang bisa diretur'; end if;
  if p_refund not in ('potong_utang', 'tunai', 'transfer') then raise exception 'Pilih cara pengembalian'; end if;
  if p_refund = 'potong_utang' and b.pay_method <> 'utang' then raise exception 'Belanja ini tidak dibayar dengan utang. Pilih uang kembali tunai atau transfer.'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasan retur'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Pilih barang yang diretur'; end if;
  v_loc := coalesce(b.branch_id, branch_main_ensure(b.kos_id));
  perform pg_advisory_xact_lock(hashtext('retur_beli:' || b.kos_id::text));
  v_no := 'RB-' || to_char(v_day, 'YYMMDD') || '-' || lpad(((select count(*) from purchase_returns where kos_id = b.kos_id and return_date = v_day) + 1)::text, 3, '0');
  insert into purchase_returns(id, kos_id, purchase_id, contact_id, number, return_date, total, refund_method, reason)
  values (p_id, b.kos_id, b.id, b.contact_id, v_no, v_day, 0, p_refund, trim(p_reason));
  for x in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((x->>'qty')::numeric, 0);
    if v_qty = 0 then continue; end if;
    if v_qty < 0 then raise exception 'Jumlah retur tidak boleh minus'; end if;
    select * into l from purchase_lines where id = (x->>'line_id')::uuid and purchase_id = b.id for update;
    if l.id is null then raise exception 'Baris belanja tidak ditemukan'; end if;
    select coalesce(sum(qty), 0) into v_done from purchase_return_lines where purchase_line_id = l.id;
    if v_qty > l.qty_received - v_done then
      raise exception 'Retur % melebihi yang diterima (sisa bisa diretur % %)', l.name, trim(to_char(l.qty_received - v_done, 'FM999999990.###')), l.unit; end if;
    select * into p from products where id = l.product_id for update;
    v_base := round(v_qty * l.unit_qty, 3);
    select coalesce(qty, 0) into v_have from stock_levels where product_id = p.id and branch_id = v_loc;
    if coalesce(v_have, 0) < v_base then
      raise exception 'Stok % di lokasi belanja hanya % % — tidak cukup untuk diretur', p.name, trim(to_char(coalesce(v_have, 0), 'FM999999990.###')), p.base_unit; end if;
    v_amt := round(v_qty * l.price, 2);
    v_rest := p.stock - v_base;
    v_cost := case when v_rest > 0 then (p.stock * p.cost - v_amt) / v_rest else p.cost end;
    if v_cost is null or v_cost < 0 then v_cost := p.cost; end if;
    update products set stock = v_rest, cost = round(v_cost, 2) where id = p.id;
    insert into purchase_return_lines(return_id, kos_id, purchase_line_id, product_id, name, unit, unit_qty, qty, price, amount)
    values (p_id, b.kos_id, l.id, p.id, l.name, l.unit, l.unit_qty, v_qty, l.price, v_amt);
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note, branch_id)
    values (b.kos_id, p.id, 'retur_beli', -v_base, v_rest, -v_amt, p_id, v_no || ' dari ' || b.number, v_loc);
    v_total := v_total + v_amt;
  end loop;
  if v_total <= 0 then raise exception 'Isi jumlah barang yang diretur'; end if;
  if p_refund = 'potong_utang' and b.contact_id is not null and contact_balance(b.contact_id) < v_total then
    raise exception 'Sisa utang ke supplier ini (%) lebih kecil dari nilai retur. Pilih uang kembali tunai atau transfer.', replace(to_char(contact_balance(b.contact_id), 'FM999,999,999,999'), ',', '.'); end if;
  update purchase_returns set total = v_total where id = p_id;
  return jsonb_build_object('id', p_id, 'number', v_no, 'total', v_total, 'duplicate', false);
end $$;

-- Belanja yang sudah diretur tidak bisa dibatalkan begitu saja
select public._prasara_patch('public.purchase_void(uuid,text)',
  'if b.status = ''batal'' then raise exception ''Belanja sudah dibatalkan''; end if;',
  'if b.status = ''batal'' then raise exception ''Belanja sudah dibatalkan''; end if;
  if exists (select 1 from purchase_returns where purchase_id = b.id) then raise exception ''Belanja ini sudah punya retur ke supplier, jadi tidak bisa dibatalkan. Retur sisa barangnya bila perlu.''; end if;');

-- Kas/bank, utang, riwayat kontak, laporan, pembukuan: ikut memperhitungkan retur ke supplier
select public._prasara_patch('public.retail_ledger(uuid)',
  'union all select case when pay_method = ''tunai'' then ''kas'' else ''bank'' end, -total from purchases where kos_id = p_kos and status in (''selesai'', ''sebagian'') and pay_method in (''tunai'', ''transfer'')',
  'union all select case when pay_method = ''tunai'' then ''kas'' else ''bank'' end, -total from purchases where kos_id = p_kos and status in (''selesai'', ''sebagian'') and pay_method in (''tunai'', ''transfer'')
    union all select case when refund_method = ''tunai'' then ''kas'' else ''bank'' end, total from purchase_returns where kos_id = p_kos and refund_method in (''tunai'', ''transfer'')');
select public._prasara_patch('public.retail_ledger_internal(uuid)',
  'union all select case when pay_method = ''tunai'' then ''kas'' else ''bank'' end, -total from purchases where kos_id = p_kos and status in (''selesai'', ''sebagian'') and pay_method in (''tunai'', ''transfer'')',
  'union all select case when pay_method = ''tunai'' then ''kas'' else ''bank'' end, -total from purchases where kos_id = p_kos and status in (''selesai'', ''sebagian'') and pay_method in (''tunai'', ''transfer'')
    union all select case when refund_method = ''tunai'' then ''kas'' else ''bank'' end, total from purchase_returns where kos_id = p_kos and refund_method in (''tunai'', ''transfer'')');
select public._prasara_patch('public.contact_balance(uuid)',
  '- coalesce((select sum(amount) from debt_payments where contact_id = c.id and kind = ''utang'' and status = ''selesai''), 0)',
  '- coalesce((select sum(amount) from debt_payments where contact_id = c.id and kind = ''utang'' and status = ''selesai''), 0)
       - coalesce((select sum(total) from purchase_returns where contact_id = c.id and refund_method = ''potong_utang''), 0)');
select public._prasara_patch('public.contact_history(uuid)',
  'union all select d.created_at, d.date,',
  'union all select r.created_at, r.return_date, ''Retur ke supplier '' || r.number || case when r.refund_method = ''potong_utang'' then '' (potong utang)'' else '' (uang kembali)'' end, r.total, ''selesai'', null
      from purchase_returns r where r.contact_id = c.id
    union all select d.created_at, d.date,');
select public._prasara_patch('public.retail_report(uuid,date,date)',
  '''belanja'', (select coalesce(sum(total), 0) from purchases where kos_id = p_kos and status in (''selesai'', ''sebagian'') and purchase_date between p_from and p_to),',
  '''belanja'', (select coalesce(sum(total), 0) from purchases where kos_id = p_kos and status in (''selesai'', ''sebagian'') and purchase_date between p_from and p_to)
                - (select coalesce(sum(total), 0) from purchase_returns where kos_id = p_kos and return_date between p_from and p_to),
    ''retur_beli'', (select coalesce(sum(total), 0) from purchase_returns where kos_id = p_kos and return_date between p_from and p_to),
    ''lokasi'', (select coalesce(jsonb_agg(row_to_json(z) order by z.omzet desc), ''[]''::jsonb) from (
        select coalesce(br.name, ''Lokasi utama'') as name, count(*)::int as trx, sum(s.total) as omzet, sum(s.total - s.cost_total) as laba
        from s left join branches br on br.id = s.branch_id group by 1) z),');
select public._prasara_patch('public.acct_desired(uuid)',
  'where p.kos_id = p_kos and p.status = ''terverifikasi'';',
  'where p.kos_id = p_kos and p.status = ''terverifikasi''
  union all
  select ''purchase_return'', r.id, r.return_date, ''Retur ke supplier '' || r.number, x.k, x.v from purchase_returns r
    cross join lateral (values (case r.refund_method when ''potong_utang'' then ''utang'' when ''tunai'' then ''kas'' else ''bank'' end, r.total), (''persediaan'', -r.total)) x(k, v)
    where r.kos_id = p_kos;');

-- Hitung ulang stok (opname) membandingkan dengan stok DI LOKASI, bukan total semua lokasi
select public._prasara_patch('public.stock_adjust(uuid,text,numeric,text)',
  'v_delta := p_qty - p.stock;',
  'v_delta := p_qty - coalesce((select qty from stock_levels where product_id = p.id and branch_id = coalesce(stock_loc(p.kos_id), branch_main_ensure(p.kos_id))), 0);');

-- Kasir melihat stok di lokasinya bila bisnis punya lebih dari satu lokasi
select public._prasara_patch('public.kasir_catalog(uuid)',
  '''products'', (select coalesce(jsonb_agg(to_jsonb(p) - ''cost'' order by p.name), ''[]'') from products p where p.kos_id = p_kos and p.active),',
  '''products'', (select coalesce(jsonb_agg((to_jsonb(p) - ''cost'') || case when loc_multi(p_kos) then jsonb_build_object(''stock'', coalesce((select l.qty from stock_levels l where l.product_id = p.id and l.branch_id = stock_loc(p_kos)), 0), ''stock_total'', p.stock) else ''{}''::jsonb end order by p.name), ''[]'') from products p where p.kos_id = p_kos and p.active),
    ''location'', (select name from branches where id = stock_loc(p_kos)),');

-- Lokasi utama tidak bisa dinonaktifkan; lokasi yang masih ada stoknya harus dikosongkan dulu (mutasi)
select public._prasara_patch('public.branch_save(uuid,uuid,text,text,text,boolean)',
  'if b.id is null then raise exception ''Cabang tidak ditemukan''; end if;',
  'if b.id is null then raise exception ''Cabang tidak ditemukan''; end if;
    if p_active is false and b.active then
      if b.is_main then raise exception ''Lokasi utama tidak bisa dinonaktifkan (boleh diganti namanya)''; end if;
      if exists (select 1 from stock_levels where branch_id = b.id and qty <> 0) then raise exception ''Masih ada stok di lokasi ini. Pindahkan dulu lewat menu Mutasi stok.''; end if;
    end if;');

-- Persetujuan: retur ke supplier, dan tindakan stok dijalankan di lokasi peminta (bukan lokasi pemilik)
select public._prasara_patch('public.approval_request(uuid,text,jsonb,text)',
  'elsif p_action = ''batal_pelunasan'' then',
  'elsif p_action = ''retur_belanja'' then
    select * into b from purchases where id = (p_payload->>''purchase_id'')::uuid and kos_id = p_kos;
    if b.id is null or b.status not in (''selesai'', ''sebagian'') then raise exception ''Belanja tidak ditemukan atau belum diterima''; end if;
    if jsonb_typeof(p_payload->''lines'') <> ''array'' then raise exception ''Isi barang yang diretur''; end if;
    v_cost := (select coalesce(sum(round((x->>''qty'')::numeric * l.price, 2)), 0) from jsonb_array_elements(p_payload->''lines'') x join purchase_lines l on l.id = (x->>''line_id'')::uuid and l.purchase_id = b.id);
    v_sum := ''Retur ke supplier dari '' || b.number || '' ('' || replace(to_char(v_cost, ''FM999,999,999,999''), '','', ''.'') || '', '' || coalesce(p_payload->>''refund'', ''-'') || '')'';
    v_imp := jsonb_build_object(''belanja'', b.number, ''supplier'', (select name from contacts where id = b.contact_id), ''barang'', (select jsonb_agg(jsonb_build_object(''nama'', l.name, ''jumlah'', (x->>''qty'')::numeric, ''satuan'', l.unit))
      from jsonb_array_elements(p_payload->''lines'') x join purchase_lines l on l.id = (x->>''line_id'')::uuid), ''pengembalian'', p_payload->>''refund'');
    v_target := null;
  elsif p_action = ''batal_pelunasan'' then');
select public._prasara_patch('public.approval_decide(uuid,boolean,text)',
  'when ''batal_pelunasan'' then',
  'when ''retur_belanja'' then purchase_return_create(gen_random_uuid(), (ap.payload->>''purchase_id'')::uuid, ap.payload->''lines'', coalesce(ap.payload->>''refund'', ''tunai''), coalesce(ap.reason, ''disetujui pemilik''))
      when ''batal_pelunasan'' then');
select public._prasara_patch('public.approval_decide(uuid,boolean,text)',
  'begin
    v_res := case ap.action_code',
  'perform set_config(''prasara.branch'', coalesce((select branch_id::text from member_locations where kos_id = ap.kos_id and user_id = ap.requested_by), ''''), true);
  begin
    v_res := case ap.action_code');

-- Hak akses fungsi
revoke execute on function public.branch_main_ensure(uuid), public.stock_moves_loc(), public.doc_loc(), public.kos_main_branch() from public, anon, authenticated;
revoke execute on function public.stock_loc(uuid), public.loc_multi(uuid), public.my_locations(), public.my_location_set(uuid, uuid), public.member_location_set(uuid, uuid, uuid),
  public.stock_levels_list(uuid), public.stock_transfer(uuid, uuid, uuid, uuid, jsonb, text), public.purchase_return_create(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.stock_loc(uuid), public.loc_multi(uuid), public.my_locations(), public.my_location_set(uuid, uuid), public.member_location_set(uuid, uuid, uuid),
  public.stock_levels_list(uuid), public.stock_transfer(uuid, uuid, uuid, uuid, jsonb, text), public.purchase_return_create(uuid, uuid, jsonb, text, text) to authenticated;
drop function public._prasara_patch(text, text, text);
