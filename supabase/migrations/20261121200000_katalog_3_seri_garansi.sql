-- Tahap 3 Retail · Katalog lanjutan (3): NOMOR SERI + GARANSI (toko elektronik/specialty).
-- products.track_serial (dibuat di migrasi paket) + warranty_days. Nomor seri dicatat per unit (product_serials):
-- tersedia → terjual (lewat Kasir/penjualan) → kembali tersedia/rusak (retur) atau tersedia lagi (penjualan dibatalkan).
-- Tidak kaku: nomor seri yang belum didaftarkan boleh langsung dicatat saat dijual; penjualan tanpa nomor seri tetap bisa
-- disimpan dan nomornya ditautkan belakangan. Stok & uang tetap dari mesin lama (nomor seri hanya identitas unit).

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in v_def) = 0 then raise exception 'Patch % tidak menemukan teks: %', p_sig, left(p_old, 80); end if;
  execute replace(v_def, p_old, p_new);
end $$;

alter table public.products add column if not exists warranty_days int check (warranty_days is null or warranty_days between 0 and 3650);

create table if not exists public.product_serials (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  serial text not null check (length(trim(serial)) between 1 and 60),
  status text not null default 'tersedia' check (status in ('tersedia', 'terjual', 'rusak', 'keluar')),
  sale_id uuid references public.sales(id) on delete set null,
  sale_line_id uuid references public.sale_lines(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  sold_date date,
  warranty_until date,
  note text check (note is null or length(note) <= 200),
  log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index if not exists product_serials_unique on public.product_serials(product_id, lower(serial));
create index if not exists product_serials_kos on public.product_serials(kos_id, lower(serial));
create index if not exists product_serials_sale on public.product_serials(sale_id) where sale_id is not null;
alter table public.product_serials enable row level security;
drop policy if exists product_serials_select on public.product_serials;
create policy product_serials_select on public.product_serials for select using (member_can(kos_id, 'sell,stock,finance'));
drop trigger if exists zz_kos_open_guard on public.product_serials;
create trigger zz_kos_open_guard before insert or update or delete on public.product_serials for each row execute function public.kos_open_guard();

-- Modul menu "Garansi & nomor seri" (aktif otomatis saat barang pertama dicatat nomor serinya)
insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, version, sort, module_type, category, impl_status, feature_keys, area, optional_deps, owner_approval, config_path)
select 'r_garansi', 'Nomor seri & garansi', 'Catat nomor seri/IMEI setiap unit, garansi toko sejak tanggal terjual, cek garansi dari nomor seri, dan klaim garansi sampai selesai.',
       '{retail}', false, '{r_barang}', null, '{/garansi}', 'product_serials, warranty_claims', 'available', '1.0', 69, 'operational', category, 'production_ready', '{}', 'sell', '{}', false, '/garansi'
from public.modules where code = 'r_promo'
on conflict (code) do nothing;

create table if not exists public.warranty_claims (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  serial_id uuid not null references public.product_serials(id) on delete cascade,
  number text not null,
  claim_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  issue text not null check (length(trim(issue)) between 3 and 500),
  in_warranty boolean not null,
  status text not null default 'diterima' check (status in ('diterima', 'diproses', 'selesai', 'ditolak')),
  resolution text check (resolution is null or length(resolution) <= 500),
  contact_id uuid references public.contacts(id) on delete set null,
  log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (kos_id, number)
);
create index if not exists warranty_claims_serial on public.warranty_claims(serial_id);
alter table public.warranty_claims enable row level security;
drop policy if exists warranty_claims_select on public.warranty_claims;
create policy warranty_claims_select on public.warranty_claims for select using (member_can(kos_id, 'sell,stock,finance'));
drop trigger if exists zz_kos_open_guard on public.warranty_claims;
create trigger zz_kos_open_guard before insert or update or delete on public.warranty_claims for each row execute function public.kos_open_guard();

create or replace function public.serial_ev(p_ev text, p_ref text default null, p_note text default null)
returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('at', now(), 'ev', p_ev, 'ref', p_ref, 'note', p_note, 'by', auth.uid())));
$$;

-- Nyalakan/matikan catat nomor seri & lama garansi (hari) per barang
create or replace function public.product_set_serial(p_product uuid, p_track boolean, p_warranty_days int default null)
returns void language plpgsql security definer set search_path = public as $$
declare p products;
begin
  select * into p from products where id = p_product;
  if p.id is null or not member_in('stock', p.kos_id) then raise exception 'Barang tidak ditemukan'; end if;
  if (select business_type from kos where id = p.kos_id) <> 'retail' then raise exception 'Nomor seri hanya untuk bisnis Retail & Grosir'; end if;
  if coalesce(p_track, false) and p.is_kit then raise exception 'Barang paket tidak mencatat nomor seri — catat di barang komponennya'; end if;
  if p_warranty_days is not null and (p_warranty_days < 0 or p_warranty_days > 3650) then raise exception 'Lama garansi 0–3650 hari'; end if;
  update products set track_serial = coalesce(p_track, false), warranty_days = nullif(p_warranty_days, 0) where id = p.id;
  -- menu Garansi muncul begitu ada barang bernomor seri
  if coalesce(p_track, false) then
    insert into business_modules(kos_id, module_code, active, updated_by) values (p.kos_id, 'r_garansi', true, 'sistem')
    on conflict (kos_id, module_code) do update set active = true;
  end if;
end $$;

-- Daftarkan nomor seri unit yang ada di toko (mis. saat barang datang)
create or replace function public.serial_add(p_kos uuid, p_product uuid, p_serials text[], p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p products; v text; v_n int := 0; v_dup text[] := '{}'; v_seen text[] := '{}';
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke barang bisnis ini'; end if;
  select * into p from products where id = p_product and kos_id = p_kos;
  if p.id is null then raise exception 'Barang tidak ditemukan'; end if;
  if not p.track_serial then raise exception 'Nyalakan dulu "Catat nomor seri" pada barang ini'; end if;
  if coalesce(array_length(p_serials, 1), 0) = 0 then raise exception 'Isi minimal satu nomor seri'; end if;
  if array_length(p_serials, 1) > 500 then raise exception 'Maksimal 500 nomor seri sekali simpan'; end if;
  foreach v in array p_serials loop
    v := trim(v);
    continue when v = '';
    if length(v) > 60 then raise exception 'Nomor seri "%" terlalu panjang (maks. 60)', left(v, 20); end if;
    if lower(v) = any(v_seen) then continue; end if;
    v_seen := v_seen || lower(v);
    if exists (select 1 from product_serials where product_id = p.id and lower(serial) = lower(v)) then v_dup := v_dup || v; continue; end if;
    insert into product_serials(kos_id, product_id, serial, status, note, log) values (p_kos, p.id, v, 'tersedia', nullif(trim(coalesce(p_note, '')), ''), serial_ev('daftar', null, nullif(trim(coalesce(p_note, '')), '')));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('added', v_n, 'duplicates', to_jsonb(v_dup));
end $$;

-- Perbaikan manual: tersedia ↔ rusak, keluar (hilang/dikembalikan ke supplier), atau hapus salah ketik
create or replace function public.serial_set_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r product_serials;
begin
  select * into r from product_serials where id = p_id for update;
  if r.id is null or not member_in('stock', r.kos_id) then raise exception 'Nomor seri tidak ditemukan'; end if;
  if p_status = 'hapus' then
    if r.status <> 'tersedia' or r.log @> '[{"ev":"jual"}]' then raise exception 'Hanya nomor seri yang belum pernah terjual yang bisa dihapus'; end if;
    delete from product_serials where id = p_id; return;
  end if;
  if p_status not in ('tersedia', 'rusak', 'keluar') then raise exception 'Status tidak dikenal'; end if;
  if r.status = 'terjual' then raise exception 'Nomor seri yang terjual berubah lewat retur atau pembatalan penjualan'; end if;
  if p_status <> 'tersedia' and coalesce(trim(p_note), '') = '' then raise exception 'Isi alasan'; end if;
  update product_serials set status = p_status, log = log || serial_ev('ubah_' || p_status, null, nullif(trim(coalesce(p_note, '')), '')) where id = p_id;
end $$;

create or replace function public.serial_list(p_kos uuid, p_product uuid default null, p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (member_in('stock', p_kos) or member_in('sell', p_kos)) then raise exception 'Tidak punya akses'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'serial', r.serial, 'status', r.status, 'product_id', r.product_id, 'product', p.name,
      'sale_id', r.sale_id, 'sale_number', s.number, 'sold_date', r.sold_date, 'warranty_until', r.warranty_until, 'customer', c.name, 'note', r.note, 'created_at', r.created_at)
      order by r.status <> 'tersedia', r.created_at desc), '[]'::jsonb)
    from product_serials r join products p on p.id = r.product_id left join sales s on s.id = r.sale_id left join contacts c on c.id = r.contact_id
    where r.kos_id = p_kos and (p_product is null or r.product_id = p_product) and (p_status is null or r.status = p_status));
end $$;

-- Tandai nomor seri terjual untuk satu baris penjualan (dipakai sale_create & tautkan belakangan)
create or replace function public.serial_sell(p_kos uuid, p_sale uuid, p_line uuid, p_product uuid, p_base numeric, p_serials jsonb, p_contact uuid, p_day date)
returns int language plpgsql security definer set search_path = public as $$
declare p products; v text; r product_serials; v_n int := 0; v_no text; v_seen text[] := '{}';
begin
  select * into p from products where id = p_product;
  if not p.track_serial then raise exception '% tidak mencatat nomor seri', p.name; end if;
  if jsonb_typeof(p_serials) <> 'array' then raise exception 'Daftar nomor seri tidak valid'; end if;
  if jsonb_array_length(p_serials) > p_base then raise exception 'Nomor seri % (%) lebih banyak dari jumlah yang dijual (%)', p.name, jsonb_array_length(p_serials), trim_scale(p_base); end if;
  select number into v_no from sales where id = p_sale;
  for v in select trim(value) from jsonb_array_elements_text(p_serials) loop
    continue when v = '';
    if lower(v) = any(v_seen) then raise exception 'Nomor seri % tertulis dua kali', v; end if;
    v_seen := v_seen || lower(v);
    select * into r from product_serials where product_id = p.id and lower(serial) = lower(v) for update;
    if r.id is null then
      insert into product_serials(kos_id, product_id, serial, status, log) values (p_kos, p.id, v, 'tersedia', serial_ev('daftar', v_no, 'dicatat saat dijual')) returning * into r;
    elsif r.status <> 'tersedia' then
      raise exception 'Nomor seri % (%) berstatus % %', v, p.name, r.status,
        coalesce(' di ' || (select number from sales where id = r.sale_id), '');
    end if;
    update product_serials set status = 'terjual', sale_id = p_sale, sale_line_id = p_line, contact_id = p_contact, sold_date = p_day,
      warranty_until = case when coalesce(p.warranty_days, 0) > 0 then p_day + p.warranty_days end,
      log = log || serial_ev('jual', v_no) where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Tautkan / ganti nomor seri sebuah baris penjualan setelah transaksi tersimpan
create or replace function public.sale_serials_set(p_sale uuid, p_line uuid, p_serials text[])
returns int language plpgsql security definer set search_path = public as $$
declare s sales; l sale_lines; v_ret numeric;
begin
  select * into s from sales where id = p_sale for update;
  if s.id is null or not (member_in('sell', s.kos_id) or member_in('finance', s.kos_id)) then raise exception 'Penjualan tidak ditemukan'; end if;
  if s.status <> 'selesai' then raise exception 'Penjualan yang dibatalkan tidak bisa diberi nomor seri'; end if;
  select * into l from sale_lines where id = p_line and sale_id = s.id;
  if l.id is null then raise exception 'Baris penjualan tidak ditemukan'; end if;
  select coalesce(sum(qty * unit_qty), 0) into v_ret from sale_return_lines where sale_line_id = l.id;
  update product_serials set status = 'tersedia', sale_id = null, sale_line_id = null, contact_id = null, sold_date = null, warranty_until = null,
    log = log || serial_ev('lepas', s.number, 'diganti') where sale_line_id = l.id and status = 'terjual';
  return serial_sell(s.kos_id, s.id, l.id, l.product_id, round(l.qty * l.unit_qty, 3) - v_ret, to_jsonb(coalesce(p_serials, '{}'::text[])), s.contact_id, s.sale_date);
end $$;

-- Retur: nomor seri yang dikembalikan kembali tersedia (atau rusak)
create or replace function public.serial_return(p_kos uuid, p_line uuid, p_serials jsonb, p_rusak boolean, p_ref text, p_base numeric)
returns int language plpgsql security definer set search_path = public as $$
declare v text; r product_serials; v_n int := 0;
begin
  if jsonb_typeof(p_serials) <> 'array' then return 0; end if;
  if jsonb_array_length(p_serials) > p_base then raise exception 'Nomor seri yang diretur lebih banyak dari jumlah retur'; end if;
  for v in select trim(value) from jsonb_array_elements_text(p_serials) loop
    continue when v = '';
    select * into r from product_serials where sale_line_id = p_line and lower(serial) = lower(v) and status = 'terjual' for update;
    if r.id is null then raise exception 'Nomor seri % bukan dari penjualan ini', v; end if;
    update product_serials set status = case when p_rusak then 'rusak' else 'tersedia' end, sale_id = null, sale_line_id = null, contact_id = null, sold_date = null, warranty_until = null,
      log = log || serial_ev('retur', p_ref, case when p_rusak then 'rusak' end) where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------- sambungkan ke penjualan, pembatalan, retur ----------
select public._prasara_patch('public.sale_create(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb)',
  $x$    v_sub := v_sub + round(v_qty * v_price, 2);$x$,
  $x$    v_sub := v_sub + round(v_qty * v_price, 2);
    if jsonb_typeof(l->'serials') = 'array' and jsonb_array_length(l->'serials') > 0 then
      perform serial_sell(p_kos, p_id, v_line, p.id, v_base, l->'serials', p_contact, v_day);
    end if;$x$);
select public._prasara_patch('public.sale_void(uuid,text)',
  $x$  update sales set status = 'batal', void_reason = trim(p_reason), voided_at = now() where id = s.id;$x$,
  $x$  update product_serials set status = 'tersedia', sale_id = null, sale_line_id = null, contact_id = null, sold_date = null, warranty_until = null,
    log = log || serial_ev('batal', s.number) where sale_id = s.id and status = 'terjual';
  update sales set status = 'batal', void_reason = trim(p_reason), voided_at = now() where id = s.id;$x$);
select public._prasara_patch('public.sale_return_create(uuid,uuid,jsonb,text,text)',
  $x$    v_total := v_total + v_amt;
  end loop;$x$,
  $x$    if jsonb_typeof(x->'serials') = 'array' and jsonb_array_length(x->'serials') > 0 then
      perform serial_return(s.kos_id, l.id, x->'serials', coalesce((x->>'rusak')::boolean, false), v_no, v_base);
    end if;
    v_total := v_total + v_amt;
  end loop;$x$);

-- ---------- cek garansi & klaim ----------
create or replace function public.serial_lookup(p_kos uuid, p_q text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_day date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not (member_in('sell', p_kos) or member_in('stock', p_kos) or member_in('finance', p_kos)) then raise exception 'Tidak punya akses'; end if;
  if length(trim(coalesce(p_q, ''))) < 2 then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'serial', r.serial, 'status', r.status, 'product_id', r.product_id, 'product', p.name,
      'sale_id', r.sale_id, 'sale_number', s.number, 'sold_date', r.sold_date, 'warranty_until', r.warranty_until,
      'garansi', case when r.status <> 'terjual' then null when r.warranty_until is null then 'tanpa' when r.warranty_until >= v_day then 'aktif' else 'habis' end,
      'days_left', case when r.warranty_until is not null then r.warranty_until - v_day end,
      'customer', c.name, 'phone', c.phone, 'contact_id', r.contact_id, 'log', r.log,
      'claims', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'number', w.number, 'claim_date', w.claim_date, 'issue', w.issue, 'status', w.status, 'in_warranty', w.in_warranty, 'resolution', w.resolution) order by w.created_at desc), '[]'::jsonb)
                 from warranty_claims w where w.serial_id = r.id))
      order by (lower(r.serial) = lower(trim(p_q))) desc, r.created_at desc), '[]'::jsonb)
    from (select * from product_serials where kos_id = p_kos and lower(serial) like lower(trim(p_q)) || '%' order by created_at desc limit 20) r
    join products p on p.id = r.product_id left join sales s on s.id = r.sale_id left join contacts c on c.id = r.contact_id);
end $$;

create or replace function public.claim_create(p_kos uuid, p_serial uuid, p_issue text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r product_serials; v_day date := (now() at time zone 'Asia/Jakarta')::date; v_no text; v_seq int; v_id uuid; v_in boolean;
begin
  if not (member_in('sell', p_kos) or member_in('stock', p_kos)) then raise exception 'Tidak punya akses'; end if;
  select * into r from product_serials where id = p_serial and kos_id = p_kos;
  if r.id is null then raise exception 'Nomor seri tidak ditemukan'; end if;
  if coalesce(length(trim(p_issue)), 0) < 3 then raise exception 'Tulis keluhan/kerusakannya'; end if;
  v_in := r.status = 'terjual' and r.warranty_until is not null and r.warranty_until >= v_day;
  perform pg_advisory_xact_lock(hashtext('garansi:' || p_kos::text));
  select count(*) + 1 into v_seq from warranty_claims where kos_id = p_kos and claim_date = v_day;
  v_no := 'GRS-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  insert into warranty_claims(kos_id, serial_id, number, claim_date, issue, in_warranty, contact_id, log)
  values (p_kos, r.id, v_no, v_day, trim(p_issue), v_in, r.contact_id, serial_ev('diterima'))
  returning id into v_id;
  update product_serials set log = log || serial_ev('klaim', v_no) where id = r.id;
  return jsonb_build_object('id', v_id, 'number', v_no, 'in_warranty', v_in);
end $$;

create or replace function public.claim_status(p_id uuid, p_status text, p_resolution text default null)
returns void language plpgsql security definer set search_path = public as $$
declare w warranty_claims;
begin
  select * into w from warranty_claims where id = p_id for update;
  if w.id is null or not (member_in('sell', w.kos_id) or member_in('stock', w.kos_id)) then raise exception 'Klaim tidak ditemukan'; end if;
  if p_status not in ('diterima', 'diproses', 'selesai', 'ditolak') then raise exception 'Status tidak dikenal'; end if;
  if p_status in ('selesai', 'ditolak') and coalesce(trim(p_resolution), '') = '' then raise exception 'Tulis hasilnya (mis. diperbaiki, diganti unit baru, ditolak karena jatuh)'; end if;
  update warranty_claims set status = p_status, resolution = coalesce(nullif(trim(coalesce(p_resolution, '')), ''), resolution),
    log = log || serial_ev(p_status, null, nullif(trim(coalesce(p_resolution, '')), '')) where id = p_id;
end $$;

create or replace function public.claims_list(p_kos uuid, p_open boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (member_in('sell', p_kos) or member_in('stock', p_kos)) then raise exception 'Tidak punya akses'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'number', w.number, 'claim_date', w.claim_date, 'issue', w.issue, 'status', w.status, 'in_warranty', w.in_warranty,
      'resolution', w.resolution, 'serial', r.serial, 'serial_id', r.id, 'product', p.name, 'customer', c.name, 'phone', c.phone, 'warranty_until', r.warranty_until, 'sale_number', s.number)
      order by w.created_at desc), '[]'::jsonb)
    from warranty_claims w join product_serials r on r.id = w.serial_id join products p on p.id = r.product_id
    left join contacts c on c.id = w.contact_id left join sales s on s.id = r.sale_id
    where w.kos_id = p_kos and (not coalesce(p_open, true) or w.status in ('diterima', 'diproses')));
end $$;

-- Nomor seri per baris penjualan (struk & detail penjualan)
create or replace function public.sale_serials(p_sale uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_kos uuid;
begin
  select kos_id into v_kos from sales where id = p_sale;
  if v_kos is null or not (member_in('sell', v_kos) or member_in('finance', v_kos)) then raise exception 'Penjualan tidak ditemukan'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('line_id', r.sale_line_id, 'serial', r.serial, 'warranty_until', r.warranty_until) order by r.serial), '[]'::jsonb)
    from product_serials r where r.sale_id = p_sale and r.status = 'terjual');
end $$;

drop function public._prasara_patch(text, text, text);
