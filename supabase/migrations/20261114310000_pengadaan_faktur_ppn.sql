-- Pengadaan lengkap: permintaan pembelian → pesanan → terima → FAKTUR SUPPLIER (pencocokan 3 arah) + PPN masukan + kinerja supplier.
-- (Modul V2.0 Bab 13 Procurement; blueprint Retail & Wholesale bagian G; backlog P2.) Memakai modul r_belanja yang sudah ada.
-- Prinsip:
--   * Mesin Belanja lama TIDAK diubah: stok, harga modal, dan utang dari barang yang diterima tetap dari purchases.total.
--   * Faktur supplier = dokumen dari supplier. Saat DIPOSTING hanya menambah dua hal ke utang supplier:
--       (1) PPN masukan (akun 1-1500, aset) — hanya bila PPN aktif di Pengaturan › Pajak; PPN ditambahkan DI ATAS harga belanja;
--       (2) selisih harga faktur vs nilai barang diterima (akun 5-2100 Selisih harga pembelian).
--     Jadi faktur yang persis sama dengan barang diterima dan tanpa PPN tidak mengubah angka apa pun (hanya bukti cocok).
--   * Pencocokan 3 arah per baris: dipesan (qty, harga pesanan) · diterima (qty, harga terima) · ditagih (qty, harga faktur).
--       cocok            → boleh diposting bagian keuangan;
--       selisih          → hanya pemilik/pengelola (settings) dengan alasan (pesan SELISIH_FAKTUR:);
--       menunggu_barang  → qty ditagih > qty diterima: faktur tetap bisa DISIMPAN (draf), diposting setelah barang datang.
--   * Tambahan utang bisa langsung dibayar (kas/bank) saat posting → memakai debt_payments yang sudah ada (kas & jurnal konsisten).
--   * Permintaan pembelian tidak menyentuh stok/uang; disetujui bagian keuangan, lalu dijadikan pesanan (purchase_order_create).

-- ---------- Harga pesanan asli (purchase_receive menimpa price dengan harga terima) ----------
alter table public.purchase_lines add column if not exists order_price numeric(14,2);
update public.purchase_lines set order_price = price where order_price is null;
create or replace function public.purchase_lines_order_price() returns trigger language plpgsql as $$
begin
  if new.order_price is null then new.order_price := new.price; end if;
  return new;
end $$;
drop trigger if exists purchase_lines_order_price on public.purchase_lines;
create trigger purchase_lines_order_price before insert on public.purchase_lines for each row execute function public.purchase_lines_order_price();

-- ---------- Permintaan pembelian ----------
create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  req_date date not null,
  needed_date date,
  note text,
  status text not null default 'diajukan' check (status in ('diajukan', 'disetujui', 'ditolak', 'dipesan', 'batal')),
  decided_by uuid, decided_at timestamptz, decide_note text,
  purchase_id uuid references public.purchases(id) on delete set null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists purchase_requests_kos on public.purchase_requests(kos_id, status, req_date desc);
create table if not exists public.purchase_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.purchase_requests(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null, unit text not null,
  qty numeric(14,3) not null check (qty > 0),
  note text
);
create index if not exists purchase_request_lines_req on public.purchase_request_lines(request_id);
alter table public.purchases add column if not exists request_id uuid references public.purchase_requests(id) on delete set null;

-- ---------- Faktur supplier ----------
create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  contact_id uuid not null references public.contacts(id),
  number text not null,                       -- nomor internal FS-…
  supplier_no text not null,                  -- nomor faktur dari supplier
  invoice_date date not null,
  due_date date,
  tax_no text,                                -- nomor faktur pajak (bila ada)
  subtotal numeric(14,2) not null default 0,  -- jumlah baris (sebelum PPN)
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total numeric(14,2) not null default 0,
  variance numeric(14,2) not null default 0,  -- selisih harga vs nilai diterima (diisi saat diposting)
  match_status text check (match_status in ('cocok', 'selisih', 'menunggu_barang')),
  match jsonb,
  status text not null default 'draf' check (status in ('draf', 'diposting', 'batal')),
  override_reason text,
  posted_by uuid, posted_at timestamptz,
  payment_id uuid references public.debt_payments(id) on delete set null,
  void_reason text, voided_at timestamptz,
  note text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists supplier_invoices_kos on public.supplier_invoices(kos_id, status, invoice_date desc);
create index if not exists supplier_invoices_purchase on public.supplier_invoices(purchase_id);
create unique index if not exists supplier_invoices_no on public.supplier_invoices(kos_id, contact_id, lower(supplier_no)) where status <> 'batal';
create table if not exists public.supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.supplier_invoices(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  purchase_line_id uuid not null references public.purchase_lines(id) on delete cascade,
  qty numeric(14,3) not null check (qty > 0),
  price numeric(14,2) not null check (price >= 0),
  line_total numeric(14,2) not null
);
create index if not exists supplier_invoice_lines_inv on public.supplier_invoice_lines(invoice_id);
create index if not exists supplier_invoice_lines_pl on public.supplier_invoice_lines(purchase_line_id);

do $$
declare t text;
begin
  foreach t in array array['purchase_requests', 'purchase_request_lines', 'supplier_invoices', 'supplier_invoice_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (member_can(kos_id, %L))', t || '_select', t,
                   case when t like 'purchase_request%' then 'stock,finance' else 'finance,stock' end);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

-- ---------- Permintaan pembelian: RPC ----------
create or replace function public.preq_guard(p_kos uuid, p_area text) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_kos is null or not member_in(p_area, p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if not module_on(p_kos, 'r_belanja') then raise exception 'Modul Belanja sedang nonaktif. Aktifkan di Pusat konfigurasi.'; end if;
end $$;

create or replace function public.preq_create(p_id uuid, p_kos uuid, p_lines jsonb, p_needed date default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_day date := (now() at time zone 'Asia/Jakarta')::date; v_no text; v_seq int; l jsonb; p products; v_qty numeric; r purchase_requests;
begin
  perform preq_guard(p_kos, 'stock');
  select * into r from purchase_requests where id = p_id;
  if r.id is not null then
    if r.kos_id <> p_kos then raise exception 'Permintaan tidak valid'; end if;
    return jsonb_build_object('id', r.id, 'number', r.number, 'duplicate', true);
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Daftar barang yang diminta masih kosong'; end if;
  if jsonb_array_length(p_lines) > 100 then raise exception 'Maksimal 100 baris per permintaan'; end if;
  perform pg_advisory_xact_lock(hashtext('preq:' || p_kos::text));
  select count(*) + 1 into v_seq from purchase_requests where kos_id = p_kos and req_date = v_day;
  v_no := 'PP-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  insert into purchase_requests(id, kos_id, number, req_date, needed_date, note)
  values (p_id, p_kos, v_no, v_day, p_needed, nullif(trim(coalesce(p_note, '')), ''));
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into p from products where id = (l->>'product_id')::uuid and kos_id = p_kos;
    if p.id is null then raise exception 'Barang tidak ditemukan'; end if;
    if not exists (select 1 from product_units where product_id = p.id and name = l->>'unit') then raise exception 'Satuan "%" untuk % tidak ada', l->>'unit', p.name; end if;
    v_qty := (l->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah % harus lebih dari 0', p.name; end if;
    insert into purchase_request_lines(request_id, kos_id, product_id, name, unit, qty, note)
    values (p_id, p_kos, p.id, p.name, l->>'unit', v_qty, nullif(trim(coalesce(l->>'note', '')), ''));
  end loop;
  return jsonb_build_object('id', p_id, 'number', v_no, 'duplicate', false);
end $$;

create or replace function public.preq_decide(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r purchase_requests;
begin
  select * into r from purchase_requests where id = p_request for update;
  if r.id is null then raise exception 'Permintaan tidak ditemukan'; end if;
  perform preq_guard(r.kos_id, 'finance');
  if r.status <> 'diajukan' then raise exception 'Permintaan ini sudah diputuskan'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'Isi alasan penolakan agar pemohon tahu'; end if;
  update purchase_requests set status = case when p_approve then 'disetujui' else 'ditolak' end, decided_by = auth.uid(), decided_at = now(),
         decide_note = nullif(trim(coalesce(p_note, '')), '') where id = r.id;
end $$;

create or replace function public.preq_cancel(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r purchase_requests;
begin
  select * into r from purchase_requests where id = p_request for update;
  if r.id is null then raise exception 'Permintaan tidak ditemukan'; end if;
  perform preq_guard(r.kos_id, 'stock');
  if r.created_by is distinct from auth.uid() and not member_in('finance', r.kos_id) then raise exception 'Hanya pemohon atau bagian keuangan yang bisa membatalkan'; end if;
  if r.status not in ('diajukan', 'disetujui') then raise exception 'Permintaan ini sudah diproses'; end if;
  update purchase_requests set status = 'batal' where id = r.id;
end $$;

-- Permintaan yang disetujui → pesanan ke supplier (jumlah & harga boleh disesuaikan pembeli)
create or replace function public.preq_to_order(p_request uuid, p_id uuid, p_contact uuid, p_lines jsonb, p_method text, p_due date default null, p_expected date default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r purchase_requests; v jsonb;
begin
  select * into r from purchase_requests where id = p_request for update;
  if r.id is null then raise exception 'Permintaan tidak ditemukan'; end if;
  perform preq_guard(r.kos_id, 'stock');
  if r.status = 'dipesan' and r.purchase_id = p_id then return jsonb_build_object('id', p_id, 'duplicate', true); end if;
  if r.status = 'diajukan' then raise exception 'Permintaan ini belum disetujui'; end if;
  if r.status <> 'disetujui' then raise exception 'Permintaan ini sudah diproses atau dibatalkan'; end if;
  if p_contact is null then raise exception 'Pilih supplier untuk pesanan ini'; end if;
  v := purchase_order_create(p_id, r.kos_id, null, p_contact, p_lines, p_method, p_due,
         coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Dari permintaan ' || r.number), p_expected);
  update purchases set request_id = r.id where id = p_id;
  update purchase_requests set status = 'dipesan', purchase_id = p_id where id = r.id;
  return v || jsonb_build_object('request', r.number);
end $$;

create or replace function public.preq_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (member_in('stock', p_kos) or member_in('finance', p_kos)) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  return jsonb_build_object(
    'can_decide', member_in('finance', p_kos),
    'me', auth.uid(),
    'rows', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
      select r.id, r.number, r.req_date, r.needed_date, r.note, r.status, r.decide_note, r.decided_at, r.decided_by, r.created_by, r.created_at, r.purchase_id,
             (select number from purchases where id = r.purchase_id) as purchase_number,
             (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'product_id', l.product_id, 'name', l.name, 'unit', l.unit, 'qty', l.qty, 'note', l.note,
                       'stock', (select stock from products where id = l.product_id),
                       'last_price', (select pl.price from purchase_lines pl join purchases b on b.id = pl.purchase_id
                                      where pl.product_id = l.product_id and pl.unit = l.unit and b.status <> 'batal' order by b.created_at desc limit 1)) order by l.name), '[]'::jsonb)
              from purchase_request_lines l where l.request_id = r.id) as lines
      from purchase_requests r where r.kos_id = p_kos
        and (r.status in ('diajukan', 'disetujui') or r.created_at > now() - interval '60 days')
      order by r.created_at desc limit 100) x));
end $$;

-- ---------- Faktur supplier: pencocokan 3 arah ----------
-- p_lines: [{line_id, qty, price}] (baris faktur); p_skip = faktur yang sedang dihitung (tidak ikut "sudah ditagih").
create or replace function public.sinv_match_calc(p_purchase uuid, p_lines jsonb, p_skip uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with il as (
    select (x->>'line_id')::uuid as line_id, (x->>'qty')::numeric as qty, (x->>'price')::numeric as price
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x
  ), r as (
    select l.id, l.name, l.unit, l.qty as order_qty, coalesce(l.order_price, l.price) as order_price, l.qty_received as recv_qty,
           case when l.qty_received > 0 then round(l.line_total / l.qty_received, 2) else coalesce(l.order_price, l.price) end as recv_price,
           coalesce((select sum(sl.qty) from supplier_invoice_lines sl join supplier_invoices si on si.id = sl.invoice_id
                     where sl.purchase_line_id = l.id and si.status = 'diposting' and si.id is distinct from p_skip), 0) as billed,
           il.qty, il.price
    from il join purchase_lines l on l.id = il.line_id and l.purchase_id = p_purchase
  ), f as (
    select r.*, round(r.qty * r.price, 2) as amount, round(r.qty * (r.price - r.recv_price), 2) as diff,
           (r.billed + r.qty > r.recv_qty + 0.0005) as over_recv,
           (r.billed + r.qty > r.order_qty + 0.0005) as over_order,
           (abs(r.price - r.order_price) > 0.005) as price_order,
           (abs(r.price - r.recv_price) > 0.005) as price_recv
    from r
  )
  select jsonb_build_object(
    'status', case when coalesce(bool_or(over_recv), false) then 'menunggu_barang'
                   when coalesce(bool_or(over_order or price_order or price_recv), false) then 'selisih' else 'cocok' end,
    'subtotal', coalesce(sum(amount), 0),
    'variance', coalesce(sum(diff), 0),
    'lines', coalesce(jsonb_agg(jsonb_build_object('line_id', id, 'name', name, 'unit', unit, 'order_qty', order_qty, 'order_price', order_price,
               'recv_qty', recv_qty, 'recv_price', recv_price, 'billed', billed, 'qty', qty, 'price', price, 'amount', amount, 'diff', diff,
               'over_recv', over_recv, 'over_order', over_order, 'price_order', price_order, 'price_recv', price_recv) order by name), '[]'::jsonb))
  from f;
$$;

create or replace function public.sinv_lines_json(p_invoice uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('line_id', purchase_line_id, 'qty', qty, 'price', price)), '[]'::jsonb) from supplier_invoice_lines where invoice_id = p_invoice;
$$;

-- Data untuk formulir faktur: baris belanja (dipesan/diterima/sudah ditagih) + faktur yang sudah ada
create or replace function public.sinv_context(p_purchase uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b purchases;
begin
  select * into b from purchases where id = p_purchase;
  if b.id is null or not (member_in('finance', b.kos_id) or member_in('stock', b.kos_id)) then raise exception 'Belanja tidak ditemukan'; end if;
  return jsonb_build_object(
    'purchase', jsonb_build_object('id', b.id, 'number', b.number, 'status', b.status, 'pay_method', b.pay_method, 'contact_id', b.contact_id,
                  'supplier', (select name from contacts where id = b.contact_id), 'total', b.total, 'order_total', b.order_total, 'due_date', b.due_date),
    'can_post', member_in('finance', b.kos_id), 'can_override', member_in('settings', b.kos_id),
    'tax', (select profile -> 'tax' from kos where id = b.kos_id),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('line_id', l.id, 'name', l.name, 'unit', l.unit, 'order_qty', l.qty, 'order_price', coalesce(l.order_price, l.price),
                'recv_qty', l.qty_received, 'recv_price', case when l.qty_received > 0 then round(l.line_total / l.qty_received, 2) else coalesce(l.order_price, l.price) end,
                'billed', coalesce((select sum(sl.qty) from supplier_invoice_lines sl join supplier_invoices si on si.id = sl.invoice_id
                                    where sl.purchase_line_id = l.id and si.status = 'diposting'), 0)) order by l.name), '[]'::jsonb)
              from purchase_lines l where l.purchase_id = b.id),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'supplier_no', i.supplier_no, 'invoice_date', i.invoice_date, 'due_date', i.due_date,
                   'tax_no', i.tax_no, 'subtotal', i.subtotal, 'tax_amount', i.tax_amount, 'total', i.total, 'variance', i.variance, 'status', i.status, 'note', i.note,
                   'override_reason', i.override_reason, 'void_reason', i.void_reason, 'paid', i.payment_id is not null,
                   'match', case when i.status = 'draf' then sinv_match_calc(b.id, sinv_lines_json(i.id), i.id) else i.match end) order by i.created_at desc), '[]'::jsonb)
                 from supplier_invoices i where i.purchase_id = b.id));
end $$;

-- Simpan faktur (baru / ubah draf). p: {supplier_no, invoice_date, due_date, tax_no, tax_amount, note, lines:[{line_id, qty, price}]}
create or replace function public.sinv_save(p_id uuid, p_purchase uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b purchases; i supplier_invoices; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_no text; v_seq int;
        v_date date := coalesce(nullif(p->>'invoice_date', '')::date, (now() at time zone 'Asia/Jakarta')::date);
        v_sno text := trim(coalesce(p->>'supplier_no', '')); v_tax numeric := coalesce(nullif(p->>'tax_amount', '')::numeric, 0);
        x jsonb; l purchase_lines; v_qty numeric; v_price numeric; v_sub numeric := 0; v_lines jsonb := '[]'::jsonb; m jsonb;
begin
  select * into b from purchases where id = p_purchase for update;
  if b.id is null then raise exception 'Belanja tidak ditemukan'; end if;
  perform preq_guard(b.kos_id, 'finance');
  if b.status = 'batal' then raise exception 'Belanja ini sudah dibatalkan'; end if;
  if b.contact_id is null then raise exception 'Belanja ini belum punya supplier. Faktur hanya untuk belanja yang ada supplier-nya.'; end if;
  if length(v_sno) < 1 or length(v_sno) > 60 then raise exception 'Isi nomor faktur dari supplier'; end if;
  if v_date > v_today then raise exception 'Tanggal faktur tidak boleh di masa depan'; end if;
  if v_tax < 0 then raise exception 'PPN tidak boleh minus'; end if;
  if v_tax > 0 and coalesce((select (profile -> 'tax' ->> 'aktif')::boolean from kos where id = b.kos_id), false) is not true then
    raise exception 'PPN masukan hanya dicatat bila PPN aktif (Pengaturan › Pajak). Bila usaha Anda bukan PKP, masukkan PPN ke harga barang.';
  end if;
  select * into i from supplier_invoices where id = p_id for update;
  if i.id is not null then
    if i.purchase_id <> b.id then raise exception 'Faktur tidak valid'; end if;
    if i.status <> 'draf' then raise exception 'Faktur yang sudah diposting tidak bisa diubah. Batalkan lalu buat lagi.'; end if;
  end if;
  if exists (select 1 from supplier_invoices where kos_id = b.kos_id and contact_id = b.contact_id and lower(supplier_no) = lower(v_sno) and status <> 'batal' and id <> p_id) then
    raise exception 'Nomor faktur % dari supplier ini sudah pernah dicatat', v_sno;
  end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'Isi barang yang ditagih di faktur'; end if;
  for x in select * from jsonb_array_elements(p->'lines') loop
    v_qty := coalesce(nullif(x->>'qty', '')::numeric, 0);
    if v_qty = 0 then continue; end if;
    select * into l from purchase_lines where id = (x->>'line_id')::uuid and purchase_id = b.id;
    if l.id is null then raise exception 'Baris belanja tidak ditemukan'; end if;
    v_price := nullif(x->>'price', '')::numeric;
    if v_qty < 0 then raise exception 'Jumlah % tidak boleh minus', l.name; end if;
    if v_price is null or v_price < 0 then raise exception 'Isi harga % di faktur', l.name; end if;
    if v_lines @> jsonb_build_array(jsonb_build_object('line_id', l.id)) then raise exception '% tertulis dua kali', l.name; end if;
    v_lines := v_lines || jsonb_build_object('line_id', l.id, 'qty', v_qty, 'price', v_price);
    v_sub := v_sub + round(v_qty * v_price, 2);
  end loop;
  if jsonb_array_length(v_lines) = 0 then raise exception 'Isi jumlah barang yang ditagih'; end if;
  if v_tax > v_sub then raise exception 'PPN lebih besar dari nilai barang. Periksa lagi angkanya.'; end if;

  if i.id is null then
    perform pg_advisory_xact_lock(hashtext('sinv:' || b.kos_id::text));
    select count(*) + 1 into v_seq from supplier_invoices where kos_id = b.kos_id and created_at::date = now()::date;
    v_no := 'FS-' || to_char(v_today, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
    insert into supplier_invoices(id, kos_id, purchase_id, contact_id, number, supplier_no, invoice_date) values (p_id, b.kos_id, b.id, b.contact_id, v_no, v_sno, v_date);
  else
    v_no := i.number;
    delete from supplier_invoice_lines where invoice_id = p_id;
  end if;
  insert into supplier_invoice_lines(invoice_id, kos_id, purchase_line_id, qty, price, line_total)
  select p_id, b.kos_id, (y->>'line_id')::uuid, (y->>'qty')::numeric, (y->>'price')::numeric, round((y->>'qty')::numeric * (y->>'price')::numeric, 2)
  from jsonb_array_elements(v_lines) y;
  m := sinv_match_calc(b.id, v_lines, p_id);
  update supplier_invoices set supplier_no = v_sno, invoice_date = v_date, due_date = nullif(p->>'due_date', '')::date,
         tax_no = nullif(trim(coalesce(p->>'tax_no', '')), ''), note = nullif(trim(coalesce(p->>'note', '')), ''),
         subtotal = v_sub, tax_amount = v_tax, total = v_sub + v_tax, match_status = m->>'status'
  where id = p_id;
  return jsonb_build_object('id', p_id, 'number', v_no, 'match', m, 'total', v_sub + v_tax);
end $$;

-- Posting faktur. p_pay: null = jadi utang ke supplier; 'kas'/'bank' = tambahan (PPN + selisih) langsung dibayar.
create or replace function public.sinv_post(p_invoice uuid, p_reason text default null, p_pay text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i supplier_invoices; b purchases; m jsonb; v_var numeric; v_extra numeric; v_pay uuid; v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  select * into i from supplier_invoices where id = p_invoice for update;
  if i.id is null then raise exception 'Faktur tidak ditemukan'; end if;
  perform preq_guard(i.kos_id, 'finance');
  if i.status = 'diposting' then return jsonb_build_object('id', i.id, 'duplicate', true); end if;
  if i.status <> 'draf' then raise exception 'Faktur ini sudah dibatalkan'; end if;
  select * into b from purchases where id = i.purchase_id for update;
  if b.status = 'batal' then raise exception 'Belanja-nya sudah dibatalkan'; end if;
  if p_pay is not null and p_pay not in ('kas', 'bank') then raise exception 'Cara bayar tidak dikenal'; end if;
  m := sinv_match_calc(b.id, sinv_lines_json(i.id), i.id);
  if m->>'status' = 'menunggu_barang' then
    raise exception 'Jumlah yang ditagih lebih banyak dari barang yang sudah diterima. Terima dulu barangnya di Belanja, atau kurangi jumlah di faktur. Faktur tetap tersimpan sebagai draf.';
  end if;
  if m->>'status' = 'selisih' then
    if not member_in('settings', i.kos_id) then raise exception 'SELISIH_FAKTUR: Faktur berbeda dari pesanan/barang diterima. Hanya pemilik atau pengelola yang bisa menyetujui selisih ini.'; end if;
    if coalesce(trim(p_reason), '') = '' then raise exception 'SELISIH_FAKTUR: Isi alasan menerima selisih faktur ini.'; end if;
  end if;
  v_var := coalesce((m->>'variance')::numeric, 0);
  v_extra := v_var + i.tax_amount;
  if p_pay is not null and v_extra > 0 then
    insert into debt_payments(kos_id, contact_id, kind, date, amount, account, note)
    values (i.kos_id, i.contact_id, 'utang', v_today, v_extra, p_pay, 'Tambahan faktur ' || i.supplier_no || ' (' || i.number || ')') returning id into v_pay;
  end if;
  update supplier_invoices set status = 'diposting', match = m, match_status = m->>'status', variance = v_var, posted_by = auth.uid(), posted_at = now(),
         override_reason = case when m->>'status' = 'selisih' then trim(p_reason) end, payment_id = v_pay where id = i.id;
  if b.pay_method = 'utang' and i.due_date is not null then update purchases set due_date = i.due_date where id = b.id; end if;
  return jsonb_build_object('id', i.id, 'number', i.number, 'match', m->>'status', 'variance', v_var, 'tax', i.tax_amount, 'extra', v_extra, 'paid', v_pay is not null, 'duplicate', false);
end $$;

create or replace function public.sinv_void(p_invoice uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare i supplier_invoices;
begin
  select * into i from supplier_invoices where id = p_invoice for update;
  if i.id is null then raise exception 'Faktur tidak ditemukan'; end if;
  perform preq_guard(i.kos_id, 'finance');
  if i.status = 'batal' then raise exception 'Faktur sudah dibatalkan'; end if;
  if i.status = 'diposting' and coalesce(trim(p_reason), '') = '' then raise exception 'Isi alasan pembatalan'; end if;
  if i.payment_id is not null then
    update debt_payments set status = 'batal', void_reason = 'Faktur ' || i.number || ' dibatalkan' where id = i.payment_id and status = 'selesai';
  end if;
  update supplier_invoices set status = 'batal', void_reason = nullif(trim(coalesce(p_reason, '')), ''), voided_at = now() where id = i.id;
end $$;

-- Daftar faktur (Belanja › Faktur supplier)
create or replace function public.sinv_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (member_in('finance', p_kos) or member_in('stock', p_kos)) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  return jsonb_build_object(
    'can_post', member_in('finance', p_kos),
    'rows', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
      select i.id, i.number, i.supplier_no, i.invoice_date, i.due_date, i.total, i.tax_amount, i.variance, i.status, i.match_status, i.purchase_id, i.created_at,
             (select number from purchases where id = i.purchase_id) as purchase_number, (select name from contacts where id = i.contact_id) as supplier
      from supplier_invoices i where i.kos_id = p_kos order by i.created_at desc limit 200) x),
    -- belanja ber-supplier yang barangnya sudah diterima tetapi belum seluruhnya ada fakturnya
    'belum', (select coalesce(jsonb_agg(y order by y.purchase_date desc), '[]'::jsonb) from (
      select b.id, b.number, b.purchase_date, b.total, (select name from contacts where id = b.contact_id) as supplier
      from purchases b where b.kos_id = p_kos and b.status in ('selesai', 'sebagian') and b.contact_id is not null
        and b.purchase_date > current_date - 120
        and exists (select 1 from purchase_lines l where l.purchase_id = b.id and l.qty_received >
              coalesce((select sum(sl.qty) from supplier_invoice_lines sl join supplier_invoices si on si.id = sl.invoice_id
                        where sl.purchase_line_id = l.id and si.status in ('draf', 'diposting')), 0) + 0.0005)
      order by b.purchase_date desc limit 60) y));
end $$;

-- ---------- Batal belanja: faktur harus dibatalkan dulu ----------
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

select public._prasara_patch('public.purchase_void(uuid,text)',
  $x$if coalesce(trim(p_reason), '') = '' then raise exception 'Isi alasan pembatalan'; end if;$x$,
  $x$if coalesce(trim(p_reason), '') = '' then raise exception 'Isi alasan pembatalan'; end if;
  if exists (select 1 from supplier_invoices where purchase_id = b.id and status = 'diposting') then
    raise exception 'Belanja ini sudah punya faktur supplier yang diposting. Batalkan fakturnya dulu (Belanja › Faktur supplier).';
  end if;
  update supplier_invoices set status = 'batal', void_reason = 'Belanja dibatalkan', voided_at = now() where purchase_id = b.id and status = 'draf';$x$);

-- ---------- Utang supplier ikut faktur (PPN masukan + selisih harga) ----------
select public._prasara_patch('public.contact_balance(uuid)',
  $x$- coalesce((select sum(total) from purchase_returns where contact_id = c.id and refund_method = 'potong_utang'), 0)$x$,
  $x$- coalesce((select sum(total) from purchase_returns where contact_id = c.id and refund_method = 'potong_utang'), 0)
       + coalesce((select sum(variance + tax_amount) from supplier_invoices where contact_id = c.id and status = 'diposting'), 0)$x$);

select public._prasara_patch('public.contact_history(uuid)',
  $x$from purchase_returns r where r.contact_id = c.id$x$,
  $x$from purchase_returns r where r.contact_id = c.id
    union all select i.posted_at, i.invoice_date, 'Faktur supplier ' || i.supplier_no || ' · PPN & selisih harga (menambah utang)', i.variance + i.tax_amount, 'selesai', null
      from supplier_invoices i where i.contact_id = c.id and i.status = 'diposting' and i.variance + i.tax_amount <> 0$x$);

-- ---------- Akun & jurnal ----------
select public._prasara_patch('public.acct_ensure(uuid)',
  $x$('6-2000', 'Beban penyusutan', 'beban', 'beban_penyusutan')$x$,
  $x$('6-2000', 'Beban penyusutan', 'beban', 'beban_penyusutan'),
    ('1-1500', 'PPN masukan', 'aset', 'ppn_masukan'),
    ('5-2100', 'Selisih harga pembelian', 'beban', 'selisih_beli')$x$);
select public.acct_ensure(id) from public.kos;

select public._prasara_patch('public.acct_desired(uuid)',
  $x$where fa.kos_id = p_kos and fa.status = 'dilepas' and x.v <> 0;$x$,
  $x$where fa.kos_id = p_kos and fa.status = 'dilepas' and x.v <> 0
  union all
  -- faktur supplier: PPN masukan + selisih harga menambah utang (nilai barang sudah dijurnal oleh 'purchase')
  select 'supplier_invoice', si.id, si.invoice_date, 'Faktur supplier ' || si.supplier_no || ' (' || si.number || ')', x.k, x.v from supplier_invoices si
    cross join lateral (values ('ppn_masukan', si.tax_amount), ('selisih_beli', si.variance), ('utang', -(si.tax_amount + si.variance))) x(k, v)
    where si.kos_id = p_kos and si.status = 'diposting' and x.v <> 0;$x$);
drop function public._prasara_patch(text, text, text);

-- ---------- Laporan PPN: keluaran − masukan ----------
create or replace function public.tax_report(p_kos uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_m0 date := date_trunc('month', coalesce(p_month, current_date))::date; v_m1 date; v_out numeric; v_in numeric;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  v_m1 := (v_m0 + interval '1 month - 1 day')::date;
  v_out := (select coalesce(sum(tax_amount), 0) from sales where kos_id = p_kos and status = 'selesai' and sale_date between v_m0 and v_m1)
         - (select coalesce(sum(r.tax_amount), 0) from sale_returns r where r.kos_id = p_kos and r.return_date between v_m0 and v_m1);
  v_in := (select coalesce(sum(tax_amount), 0) from supplier_invoices where kos_id = p_kos and status = 'diposting' and invoice_date between v_m0 and v_m1);
  return jsonb_build_object('bulan', v_m0, 'setelan', (select profile -> 'tax' from kos where id = p_kos),
    'penjualan', (select jsonb_build_object('jumlah', count(*), 'total', coalesce(sum(total), 0), 'dpp', coalesce(sum(tax_base - tax_amount), 0),
                    'ppn', coalesce(sum(tax_amount), 0), 'tidak_kena', coalesce(sum(total - tax_base), 0))
                  from sales where kos_id = p_kos and status = 'selesai' and sale_date between v_m0 and v_m1),
    'retur_ppn', (select coalesce(sum(r.tax_amount), 0) from sale_returns r where r.kos_id = p_kos and r.return_date between v_m0 and v_m1),
    'retur_dpp', (select coalesce(sum(case when s.tax_rate > 0 then round(r.tax_amount * 100 / s.tax_rate, 2) else 0 end), 0)
                  from sale_returns r join sales s on s.id = r.sale_id where r.kos_id = p_kos and r.return_date between v_m0 and v_m1),
    'ppn_keluaran', v_out,
    'pembelian', (select jsonb_build_object('jumlah', count(*) filter (where tax_amount > 0), 'dpp', coalesce(sum(subtotal) filter (where tax_amount > 0), 0),
                    'ppn', coalesce(sum(tax_amount), 0), 'tanpa_nomor', count(*) filter (where tax_amount > 0 and tax_no is null))
                  from supplier_invoices where kos_id = p_kos and status = 'diposting' and invoice_date between v_m0 and v_m1),
    'faktur_masukan', (select coalesce(jsonb_agg(jsonb_build_object('number', i.number, 'supplier_no', i.supplier_no, 'tax_no', i.tax_no, 'date', i.invoice_date,
                         'supplier', (select name from contacts where id = i.contact_id), 'dpp', i.subtotal, 'ppn', i.tax_amount) order by i.invoice_date), '[]'::jsonb)
                       from supplier_invoices i where i.kos_id = p_kos and i.status = 'diposting' and i.tax_amount > 0 and i.invoice_date between v_m0 and v_m1),
    'ppn_masukan', v_in,
    'selisih', v_out - v_in);   -- > 0 = kurang bayar (disetor), < 0 = lebih bayar
end $$;

-- ---------- Kinerja supplier ----------
create or replace function public.supplier_scorecard(p_kos uuid, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_to date := coalesce(p_to, (now() at time zone 'Asia/Jakarta')::date); v_from date;
begin
  if not (member_in('finance', p_kos) or member_in('stock', p_kos)) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  v_from := coalesce(p_from, v_to - 89);
  return jsonb_build_object('from', v_from, 'to', v_to, 'rows', (select coalesce(jsonb_agg(row_to_json(s) order by s.nilai desc), '[]'::jsonb) from (
    select c.id, c.name,
           count(*) as pesanan,
           coalesce(sum(b.total), 0) as nilai,
           count(*) filter (where b.expected_date is not null and b.last_recv is not null) as dijanjikan,
           count(*) filter (where b.expected_date is not null and b.last_recv is not null and b.last_recv <= b.expected_date) as tepat,
           round(avg(b.last_recv - b.purchase_date) filter (where b.last_recv is not null and b.last_recv > b.purchase_date), 1) as hari_tunggu,
           case when sum(b.q_order) filter (where b.status = 'selesai') > 0
                then round(100 * sum(least(b.q_recv, b.q_order)) filter (where b.status = 'selesai') / sum(b.q_order) filter (where b.status = 'selesai'), 0) end as terpenuhi,
           coalesce((select sum(r.total) from purchase_returns r where r.contact_id = c.id and r.return_date between v_from and v_to), 0) as retur,
           (select count(*) from supplier_invoices i where i.contact_id = c.id and i.status = 'diposting' and i.invoice_date between v_from and v_to) as faktur,
           (select count(*) from supplier_invoices i where i.contact_id = c.id and i.status = 'diposting' and i.match_status = 'selisih' and i.invoice_date between v_from and v_to) as faktur_selisih
    from contacts c join lateral (
      select p.*, (select max((m.created_at at time zone 'Asia/Jakarta')::date) from stock_moves m where m.ref_id = p.id and m.kind = 'beli') as last_recv,
             (select coalesce(sum(l.qty), 0) from purchase_lines l where l.purchase_id = p.id) as q_order,
             (select coalesce(sum(l.qty_received), 0) from purchase_lines l where l.purchase_id = p.id) as q_recv
      from purchases p where p.contact_id = c.id and p.status <> 'batal' and p.purchase_date between v_from and v_to) b on true
    where c.kos_id = p_kos and c.kind = 'supplier'
    group by c.id, c.name) s));
end $$;

-- ---------- Riwayat aktivitas ----------
create or replace function public.dom_purchase_requests() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform dom_emit(new.kos_id, 'PurchaseRequested', 'purchase_request', new.id, new.id::text, 'stock', 'Permintaan pembelian ' || new.number, null, jsonb_build_object('number', new.number));
  elsif new.status is distinct from old.status then
    perform dom_emit(new.kos_id, case new.status when 'disetujui' then 'PurchaseRequestApproved' when 'ditolak' then 'PurchaseRequestRejected'
                                   when 'dipesan' then 'PurchaseRequestOrdered' else 'PurchaseRequestCancelled' end,
      'purchase_request', new.id, new.id::text || ':' || new.status, 'stock',
      'Permintaan pembelian ' || new.number || ' ' || case new.status when 'disetujui' then 'disetujui' when 'ditolak' then 'ditolak' when 'dipesan' then 'dijadikan pesanan' else 'dibatalkan' end,
      null, jsonb_build_object('number', new.number, 'status', new.status));
  end if;
  return null;
end $$;
drop trigger if exists dom_purchase_requests on public.purchase_requests;
create trigger dom_purchase_requests after insert or update on public.purchase_requests for each row execute function public.dom_purchase_requests();

create or replace function public.dom_supplier_invoices() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('diposting', 'batal') and not (old.status = 'draf' and new.status = 'batal') then
    perform dom_emit(new.kos_id, case when new.status = 'diposting' then 'SupplierInvoicePosted' else 'SupplierInvoiceVoided' end, 'supplier_invoice', new.id,
      new.id::text || ':' || new.status, 'finance',
      'Faktur supplier ' || new.supplier_no || case when new.status = 'diposting' then case when new.match_status = 'selisih' then ' diposting dengan selisih' else ' diposting' end else ' dibatalkan' end
        || ' · ' || dom_rp(new.total), new.total,
      jsonb_build_object('number', new.number, 'match', new.match_status, 'variance', new.variance, 'tax', new.tax_amount, 'reason', coalesce(new.override_reason, new.void_reason)));
  end if;
  return null;
end $$;
drop trigger if exists dom_supplier_invoices on public.supplier_invoices;
create trigger dom_supplier_invoices after update on public.supplier_invoices for each row execute function public.dom_supplier_invoices();

-- ---------- Hak eksekusi ----------
revoke execute on function public.preq_guard(uuid, text), public.sinv_match_calc(uuid, jsonb, uuid), public.sinv_lines_json(uuid),
  public.purchase_lines_order_price(), public.dom_purchase_requests(), public.dom_supplier_invoices() from public, anon, authenticated;
revoke execute on function public.preq_create(uuid, uuid, jsonb, date, text), public.preq_decide(uuid, boolean, text), public.preq_cancel(uuid),
  public.preq_to_order(uuid, uuid, uuid, jsonb, text, date, date, text), public.preq_list(uuid), public.sinv_context(uuid), public.sinv_save(uuid, uuid, jsonb),
  public.sinv_post(uuid, text, text), public.sinv_void(uuid, text), public.sinv_list(uuid), public.supplier_scorecard(uuid, date, date) from public, anon;
grant execute on function public.preq_create(uuid, uuid, jsonb, date, text), public.preq_decide(uuid, boolean, text), public.preq_cancel(uuid),
  public.preq_to_order(uuid, uuid, uuid, jsonb, text, date, date, text), public.preq_list(uuid), public.sinv_context(uuid), public.sinv_save(uuid, uuid, jsonb),
  public.sinv_post(uuid, text, text), public.sinv_void(uuid, text), public.sinv_list(uuid), public.supplier_scorecard(uuid, date, date) to authenticated;
