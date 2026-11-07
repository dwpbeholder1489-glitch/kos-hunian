-- Mesin Jasa (blueprint FINAL Bagian 5.3 & Fase 5 prioritas 3) dengan template pertama: Laundry.
-- Pola "Build Once. Configure Many": katalog layanan + tahap proses yang bisa diatur per bisnis; bengkel/salon/servis
-- nanti cukup template baru di atas mesin yang sama. Memakai ulang komponen yang sudah teruji: kontak (pelanggan/supplier),
-- barang & stok (bahan operasional), belanja ke supplier, kas, persetujuan, pembukuan (jurnal otomatis), CRM & halaman publik.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

-- ================= Jenis bisnis & peran =================
alter table public.kos drop constraint if exists kos_business_type_check;
alter table public.kos add constraint kos_business_type_check check (business_type in ('properti', 'retail', 'jasa'));
alter table public.kos_members drop constraint if exists kos_members_role_check;
alter table public.kos_members add constraint kos_members_role_check check (role in ('pemilik', 'pengelola', 'kasir', 'gudang', 'penjaga', 'operator'));
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'kos_invites_role_check') then
    alter table public.kos_invites drop constraint kos_invites_role_check;
    alter table public.kos_invites add constraint kos_invites_role_check check (role in ('pengelola', 'kasir', 'gudang', 'penjaga', 'operator'));
  end if;
end $$;

-- Peran baru "operator" (petugas proses): area 'ops' = memindahkan tahap pesanan, tanpa melihat uang
create or replace function public.role_allows(p_role text, p_areas text)
returns boolean language sql immutable as $$
  select case
    when p_role is null then false
    when p_role = 'pemilik' then true
    when coalesce(p_areas, '') = '' then true
    else exists (select 1 from unnest(string_to_array(p_areas, ',')) a
                 where (p_role = 'pengelola' and a <> 'team')
                    or (p_role = 'kasir' and a = 'sell')
                    or (p_role = 'gudang' and a = 'stock')
                    or (p_role = 'penjaga' and a = 'rent')
                    or (p_role = 'operator' and a = 'ops'))
  end;
$$;
create or replace function public.team_roles(p_type text)
returns text[] language sql immutable as $$
  select case when p_type = 'retail' then array['pengelola', 'kasir', 'gudang']
              when p_type = 'jasa' then array['pengelola', 'kasir', 'operator', 'gudang']
              else array['pengelola', 'penjaga'] end;
$$;

-- ================= Tabel mesin jasa =================
create table if not exists public.svc_services (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  category text check (length(category) <= 40),
  unit text not null default 'kg' check (length(trim(unit)) between 1 and 20),
  price numeric(14,2) not null check (price >= 0),
  min_qty numeric(10,3) not null default 0 check (min_qty >= 0),
  hours int not null default 48 check (hours between 1 and 720),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists svc_services_kos on public.svc_services(kos_id, active, sort);

create table if not exists public.svc_stages (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 40),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists svc_stages_kos on public.svc_stages(kos_id, sort);

create table if not exists public.svc_orders (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  contact_id uuid references public.contacts(id),
  customer_name text not null,
  customer_phone text,
  received_at timestamptz not null default now(),
  due_at timestamptz,
  status text not null default 'diterima' check (status in ('diterima', 'proses', 'siap', 'selesai', 'batal')),
  stage_id uuid references public.svc_stages(id),
  pickup boolean not null default false,
  deliver boolean not null default false,
  address text,
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0 check (discount >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  note text,
  completed_at timestamptz,
  completed_date date,
  handover text,
  rework_of uuid references public.svc_orders(id),
  void_reason text,
  voided_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (kos_id, number)
);
create index if not exists svc_orders_kos on public.svc_orders(kos_id, status, due_at);
create index if not exists svc_orders_done on public.svc_orders(kos_id, completed_date);

create table if not exists public.svc_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.svc_orders(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  service_id uuid references public.svc_services(id),
  name text not null,
  unit text not null,
  qty numeric(10,3) not null check (qty > 0),
  charge_qty numeric(10,3) not null check (charge_qty > 0),
  price numeric(14,2) not null check (price >= 0),
  line_total numeric(14,2) not null,
  note text
);
create index if not exists svc_order_lines_order on public.svc_order_lines(order_id);

create table if not exists public.svc_payments (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  order_id uuid not null references public.svc_orders(id),
  kind text not null default 'bayar' check (kind in ('bayar', 'kembali')),
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('tunai', 'transfer', 'ewallet')),
  account text not null check (account in ('kas', 'bank')),
  paid_at date not null default (now() at time zone 'Asia/Jakarta')::date,
  status text not null default 'selesai' check (status in ('selesai', 'batal')),
  void_reason text,
  branch_id uuid references public.branches(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists svc_payments_order on public.svc_payments(order_id);
create index if not exists svc_payments_kos on public.svc_payments(kos_id, paid_at);

create table if not exists public.svc_events (
  id bigserial primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  order_id uuid not null references public.svc_orders(id) on delete cascade,
  kind text not null,
  text text not null,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists svc_events_order on public.svc_events(order_id, created_at);

create table if not exists public.svc_complaints (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  order_id uuid not null references public.svc_orders(id),
  kind text not null check (kind in ('kurang_bersih', 'rusak', 'hilang', 'luntur', 'terlambat', 'lainnya')),
  note text not null check (length(trim(note)) between 3 and 500),
  rewash boolean not null default false,
  status text not null default 'terbuka' check (status in ('terbuka', 'selesai')),
  resolution text,
  compensation numeric(14,2) not null default 0 check (compensation >= 0),
  created_email text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
create index if not exists svc_complaints_kos on public.svc_complaints(kos_id, status);

-- RLS: baca sesuai area; semua perubahan lewat fungsi server
alter table public.svc_services enable row level security;
alter table public.svc_stages enable row level security;
alter table public.svc_orders enable row level security;
alter table public.svc_order_lines enable row level security;
alter table public.svc_payments enable row level security;
alter table public.svc_events enable row level security;
alter table public.svc_complaints enable row level security;
drop policy if exists svc_services_select on public.svc_services;
create policy svc_services_select on public.svc_services for select using (public.member_can(kos_id, 'sell,ops,settings,finance'));
drop policy if exists svc_stages_select on public.svc_stages;
create policy svc_stages_select on public.svc_stages for select using (public.member_can(kos_id, 'sell,ops,settings,finance'));
drop policy if exists svc_orders_select on public.svc_orders;
create policy svc_orders_select on public.svc_orders for select using (public.member_can(kos_id, 'sell,finance'));
drop policy if exists svc_order_lines_select on public.svc_order_lines;
create policy svc_order_lines_select on public.svc_order_lines for select using (public.member_can(kos_id, 'sell,finance'));
drop policy if exists svc_payments_select on public.svc_payments;
create policy svc_payments_select on public.svc_payments for select using (public.member_can(kos_id, 'sell,finance'));
drop policy if exists svc_events_select on public.svc_events;
create policy svc_events_select on public.svc_events for select using (public.member_can(kos_id, 'sell,ops,finance'));
drop policy if exists svc_complaints_select on public.svc_complaints;
create policy svc_complaints_select on public.svc_complaints for select using (public.member_can(kos_id, 'sell,ops,finance'));
grant select on public.svc_services, public.svc_stages, public.svc_orders, public.svc_order_lines, public.svc_payments, public.svc_events, public.svc_complaints to authenticated;
do $$
declare t text;
begin
  foreach t in array array['svc_services', 'svc_stages', 'svc_orders', 'svc_order_lines', 'svc_payments', 'svc_events', 'svc_complaints'] loop
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;
drop trigger if exists svc_payments_loc on public.svc_payments;
create trigger svc_payments_loc before insert on public.svc_payments for each row execute function public.doc_loc();

-- ================= Modul, template, aksi persetujuan =================
insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, sort) values
  ('j_dashboard', 'Dashboard jasa', 'Antrean per tahap, jatuh tempo, siap diambil, antar-jemput, uang masuk.', '{jasa}', true, '{}', null, '{/jasa}', 'Pesanan & pembayaran', 'available', 1),
  ('j_pesanan', 'Pesanan jasa', 'Terima pesanan (kg/item), tahap proses, nota, pembayaran DP/lunas, antar-jemput, keluhan & cuci ulang.', '{jasa}', true, '{}', null, '{/pesanan,/nota}', 'Pelanggan, layanan, pesanan, pembayaran', 'available', 2),
  ('j_layanan', 'Layanan & tahap proses', 'Daftar layanan beserta harga, minimal, dan lama pengerjaan; tahap proses yang bisa diatur.', '{jasa}', true, '{}', null, '{/layanan}', 'Katalog layanan', 'available', 3),
  ('j_laporan', 'Laporan jasa', 'Pesanan, pendapatan, per layanan, ketepatan waktu, keluhan, biaya bahan.', '{jasa}', true, '{}', null, '{/laporan-jasa}', 'Pesanan, pembayaran, bahan, biaya', 'available', 4),
  ('j_kas', 'Kas', 'Saldo kas & bank, biaya, utang supplier.', '{jasa}', true, '{}', null, '{/kas}', 'Pembayaran, biaya, belanja', 'available', 5),
  ('j_bahan', 'Bahan & stok', 'Bahan operasional (deterjen, pewangi, plastik): stok, pemakaian, hitung ulang.', '{jasa}', false, '{}', null, '{/barang}', 'Bahan, pergerakan stok', 'available', 12)
on conflict (code) do nothing;
-- modul umum & yang dipakai ulang ikut tersedia untuk jasa
update public.modules set applies_to = applies_to || '{jasa}'::text[] where code in ('r_belanja', 'r_kontak', 'u_crm', 'u_halaman', 'u_karyawan', 'u_akuntansi', 'u_asisten') and not ('jasa' = any(applies_to));
update public.automation_recipes set applies_to = applies_to || '{jasa}'::text[] where code in ('stok_minimum', 'utang_jatuh_tempo') and not ('jasa' = any(applies_to));
update public.approval_actions set applies_to = applies_to || '{jasa}'::text[] where code in ('batal_belanja', 'batal_pelunasan', 'penyesuaian_stok', 'hapus_kontak', 'ubah_modul', 'buat_pesanan_supplier', 'retur_belanja') and not ('jasa' = any(applies_to));
insert into public.approval_actions(code, label, risk, request_area, default_required, applies_to, sort) values
  ('batal_pesanan_jasa', 'Membatalkan pesanan jasa', 'tinggi', 'sell', true, '{jasa}', 1),
  ('batal_bayar_jasa', 'Membatalkan pembayaran pesanan jasa', 'tinggi', 'sell', true, '{jasa}', 2)
on conflict (code) do nothing;

-- Template Laundry (bisa diubah pemilik setelah bisnis dibuat)
create or replace function public.svc_seed_template(p_kos uuid, p_template text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from svc_stages where kos_id = p_kos) then return; end if;
  if p_template = 'laundry' then
    insert into svc_stages(kos_id, name, sort) values (p_kos, 'Cuci', 1), (p_kos, 'Kering', 2), (p_kos, 'Setrika', 3), (p_kos, 'Cek kualitas (QC)', 4), (p_kos, 'Kemas', 5);
    insert into svc_services(kos_id, name, category, unit, price, min_qty, hours, sort) values
      (p_kos, 'Cuci kering setrika', 'Kiloan', 'kg', 7000, 3, 48, 1),
      (p_kos, 'Cuci kering setrika — kilat', 'Kiloan', 'kg', 12000, 3, 24, 2),
      (p_kos, 'Setrika saja', 'Kiloan', 'kg', 5000, 3, 24, 3),
      (p_kos, 'Bed cover', 'Satuan', 'pcs', 25000, 0, 72, 4),
      (p_kos, 'Selimut', 'Satuan', 'pcs', 20000, 0, 72, 5),
      (p_kos, 'Jas / blazer', 'Satuan', 'pcs', 20000, 0, 72, 6),
      (p_kos, 'Sepatu', 'Satuan', 'pasang', 30000, 0, 72, 7);
    insert into expense_categories(kos_id, name, kind)
    select p_kos, x.n, x.k from (values ('Listrik dan air', 'operasional'), ('Gaji karyawan', 'operasional'), ('Sewa tempat', 'operasional'),
      ('Gas / bahan bakar', 'operasional'), ('Perbaikan mesin', 'operasional'), ('Ganti rugi pelanggan', 'operasional'), ('Mesin cuci & peralatan', 'modal')) x(n, k)
    where not exists (select 1 from expense_categories where kos_id = p_kos);
  else
    insert into svc_stages(kos_id, name, sort) values (p_kos, 'Dikerjakan', 1), (p_kos, 'Dicek', 2);
    insert into expense_categories(kos_id, name, kind)
    select p_kos, x.n, x.k from (values ('Listrik dan air', 'operasional'), ('Gaji karyawan', 'operasional'), ('Sewa tempat', 'operasional'),
      ('Transportasi', 'operasional'), ('Ganti rugi pelanggan', 'operasional'), ('Peralatan', 'modal')) x(n, k)
    where not exists (select 1 from expense_categories where kos_id = p_kos);
  end if;
end $$;

-- Buat bisnis jasa (p_prefix dipakai sebagai kode template: 'laundry' atau 'umum')
select public._prasara_patch('public.create_business(text,text,text,integer,text)',
  '  else
    raise exception ''Jenis bisnis tidak dikenal'';',
  '  elsif p_type = ''jasa'' then
    if coalesce(trim(p_name), '''') = '''' then raise exception ''Nama usaha wajib diisi''; end if;
    insert into kos(name, address, owner_id, business_type, business_groups) values (trim(p_name), nullif(trim(p_address), ''''), auth.uid(), ''jasa'', ''{services}'') returning id into v_id;
    insert into kos_members(kos_id, user_id, role) values (v_id, auth.uid(), ''pemilik'');
    perform svc_seed_template(v_id, case when p_prefix = ''umum'' then ''umum'' else ''laundry'' end);
    return v_id;
  else
    raise exception ''Jenis bisnis tidak dikenal'';');

-- Bahan & belanja: pakai ulang fungsi barang/belanja toko untuk bisnis jasa
select public._prasara_patch('public.product_save(uuid,uuid,text,text,numeric,numeric,jsonb,numeric,text)',
  'if (select business_type from kos where id = p_kos) <> ''retail'' then raise exception ''Barang hanya untuk bisnis Retail & Grosir''; end if;',
  'if (select business_type from kos where id = p_kos) not in (''retail'', ''jasa'') then raise exception ''Barang hanya untuk bisnis Retail & Grosir atau Jasa (bahan)''; end if;');
select public._prasara_patch('public.purchase_order_create(uuid,uuid,date,uuid,jsonb,text,date,text,date)',
  'if (select business_type from kos where id = p_kos) <> ''retail'' then raise exception ''Belanja hanya untuk bisnis Retail & Grosir''; end if;',
  'if (select business_type from kos where id = p_kos) not in (''retail'', ''jasa'') then raise exception ''Belanja hanya untuk bisnis Retail & Grosir atau Jasa''; end if;');
-- Pemakaian bahan (mis. deterjen terpakai minggu ini) = biaya bahan
alter table public.stock_moves drop constraint if exists stock_moves_kind_check;
alter table public.stock_moves add constraint stock_moves_kind_check check (kind in ('awal', 'opname', 'rusak', 'kedaluwarsa', 'koreksi', 'jual', 'beli', 'retur_jual', 'retur_beli', 'batal', 'transfer', 'pakai'));
select public._prasara_patch('public.stock_adjust(uuid,text,numeric,text)',
  '  elsif p_reason in (''rusak'', ''kedaluwarsa'') then',
  '  elsif p_reason in (''rusak'', ''kedaluwarsa'', ''pakai'') then');

-- ================= Fungsi inti =================
create or replace function public.svc_guard(p_kos uuid, p_areas text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in(p_areas, p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if (select business_type from kos where id = p_kos) <> 'jasa' then raise exception 'Menu ini untuk bisnis Jasa'; end if;
end $$;

create or replace function public.svc_paid(p_order uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind = 'bayar' then amount else -amount end), 0) from svc_payments where order_id = p_order and status = 'selesai';
$$;

create or replace function public.svc_event(p_order uuid, p_kind text, p_text text)
returns void language sql security definer set search_path = public as $$
  insert into svc_events(kos_id, order_id, kind, text, actor) select kos_id, id, p_kind, p_text, coalesce(actor_email(), 'sistem') from svc_orders where id = p_order;
$$;

create or replace function public.svc_service_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid := p_id;
begin
  perform svc_guard(p_kos, 'settings');
  if coalesce((p->>'price')::numeric, -1) < 0 then raise exception 'Isi harga layanan'; end if;
  if v is null then
    insert into svc_services(kos_id, name, category, unit, price, min_qty, hours, active, sort)
    values (p_kos, trim(p->>'name'), nullif(trim(p->>'category'), ''), coalesce(nullif(trim(p->>'unit'), ''), 'kg'), (p->>'price')::numeric,
            coalesce((p->>'min_qty')::numeric, 0), coalesce((p->>'hours')::int, 48), coalesce((p->>'active')::boolean, true),
            coalesce((select max(sort) + 1 from svc_services where kos_id = p_kos), 1)) returning id into v;
  else
    update svc_services set name = trim(p->>'name'), category = nullif(trim(p->>'category'), ''), unit = coalesce(nullif(trim(p->>'unit'), ''), unit),
      price = (p->>'price')::numeric, min_qty = coalesce((p->>'min_qty')::numeric, 0), hours = coalesce((p->>'hours')::int, hours), active = coalesce((p->>'active')::boolean, active)
    where id = v and kos_id = p_kos;
    if not found then raise exception 'Layanan tidak ditemukan'; end if;
  end if;
  perform config_log(p_kos, 'ubah_layanan', trim(p->>'name'), null, p, null, 'rendah', actor_email());
  return v;
end $$;

-- Simpan urutan tahap: [{id?, name, active}]; tahap yang dipakai pesanan aktif tidak bisa dinonaktifkan
create or replace function public.svc_stages_save(p_kos uuid, p_stages jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare x jsonb; i int := 0; v_ids uuid[] := '{}'; v uuid;
begin
  perform svc_guard(p_kos, 'settings');
  if jsonb_typeof(p_stages) <> 'array' or (select count(*) from jsonb_array_elements(p_stages) e where coalesce((e->>'active')::boolean, true)) = 0 then raise exception 'Minimal satu tahap aktif'; end if;
  for x in select * from jsonb_array_elements(p_stages) loop
    i := i + 1;
    if coalesce(length(trim(x->>'name')), 0) < 2 then raise exception 'Nama tahap minimal 2 huruf'; end if;
    if x->>'id' is not null then
      v := (x->>'id')::uuid;
      if not coalesce((x->>'active')::boolean, true) and exists (select 1 from svc_orders where stage_id = v and status = 'proses') then
        raise exception 'Tahap "%" masih dipakai pesanan yang sedang diproses', x->>'name'; end if;
      update svc_stages set name = trim(x->>'name'), sort = i, active = coalesce((x->>'active')::boolean, true) where id = v and kos_id = p_kos;
      if not found then raise exception 'Tahap tidak ditemukan'; end if;
    else
      insert into svc_stages(kos_id, name, sort, active) values (p_kos, trim(x->>'name'), i, coalesce((x->>'active')::boolean, true)) returning id into v;
    end if;
    v_ids := v_ids || v;
  end loop;
  perform config_log(p_kos, 'ubah_tahap_jasa', 'tahap proses', null, p_stages, null, 'rendah', actor_email());
end $$;

-- Hitung baris pesanan dari katalog (harga di server, bukan dari HP)
create or replace function public.svc_price_lines(p_kos uuid, p_lines jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare x jsonb; s svc_services; v_q numeric; v_cq numeric; r jsonb := '[]';
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Pilih minimal satu layanan'; end if;
  if jsonb_array_length(p_lines) > 30 then raise exception 'Terlalu banyak baris'; end if;
  for x in select * from jsonb_array_elements(p_lines) loop
    select * into s from svc_services where id = (x->>'service_id')::uuid and kos_id = p_kos;
    if s.id is null or not s.active then raise exception 'Layanan tidak tersedia'; end if;
    v_q := round(coalesce((x->>'qty')::numeric, 0), 3);
    if v_q <= 0 or v_q > 9999 then raise exception 'Jumlah % tidak valid', s.name; end if;
    v_cq := greatest(v_q, s.min_qty);
    r := r || jsonb_build_object('service_id', s.id, 'name', s.name, 'unit', s.unit, 'qty', v_q, 'charge_qty', v_cq, 'price', s.price,
      'line_total', round(v_cq * s.price, 2), 'hours', s.hours, 'note', nullif(trim(coalesce(x->>'note', '')), ''));
  end loop;
  return r;
end $$;

create or replace function public.svc_order_create(p_id uuid, p_kos uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ex svc_orders; v_lines jsonb; v_sub numeric; v_disc numeric := round(coalesce((p->>'discount')::numeric, 0), 2); v_fee numeric := round(coalesce((p->>'delivery_fee')::numeric, 0), 2);
        v_total numeric; v_contact uuid := nullif(p->>'contact_id', '')::uuid; v_name text := trim(coalesce(p->>'name', '')); v_phone text := nullif(trim(coalesce(p->>'phone', '')), '');
        v_due timestamptz; v_day date := (now() at time zone 'Asia/Jakarta')::date; v_no text; v_pay numeric := round(coalesce((p->'payment'->>'amount')::numeric, 0), 2);
begin
  perform svc_guard(p_kos, 'sell');
  select * into v_ex from svc_orders where id = p_id;
  if v_ex.id is not null then return jsonb_build_object('id', v_ex.id, 'number', v_ex.number, 'total', v_ex.total, 'duplicate', true); end if;
  -- pelanggan: pilih dari daftar, atau dicocokkan lewat No. HP, atau dibuat baru (bukan dari nama saja)
  if v_contact is not null then
    select name, coalesce(v_phone, phone) into v_name, v_phone from contacts where id = v_contact and kos_id = p_kos and kind = 'pelanggan';
    if v_name is null then raise exception 'Pelanggan tidak ditemukan'; end if;
  else
    if length(v_name) < 2 then raise exception 'Isi nama pelanggan'; end if;
    if crm_phone(v_phone) is not null then
      select id into v_contact from contacts where kos_id = p_kos and kind = 'pelanggan' and archived_at is null and crm_phone(phone) = crm_phone(v_phone) limit 1;
    end if;
    if v_contact is null and v_phone is not null then
      insert into contacts(kos_id, kind, name, phone) values (p_kos, 'pelanggan', v_name, v_phone) returning id into v_contact;
    end if;
  end if;
  v_lines := svc_price_lines(p_kos, p->'lines');
  v_sub := (select sum((x->>'line_total')::numeric) from jsonb_array_elements(v_lines) x);
  if v_disc < 0 or v_disc > v_sub then raise exception 'Diskon tidak boleh melebihi harga layanan'; end if;
  if v_fee < 0 then raise exception 'Ongkos antar-jemput tidak valid'; end if;
  v_total := v_sub - v_disc + v_fee;
  v_due := coalesce(nullif(p->>'due_at', '')::timestamptz, now() + make_interval(hours => (select max((x->>'hours')::int) from jsonb_array_elements(v_lines) x)));
  if v_pay < 0 or v_pay > v_total then raise exception 'Pembayaran awal tidak boleh melebihi total'; end if;
  perform pg_advisory_xact_lock(hashtext('svc:' || p_kos::text));
  v_no := 'PSN-' || to_char(v_day, 'YYMMDD') || '-' || lpad(((select count(*) from svc_orders where kos_id = p_kos and number like 'PSN-' || to_char(v_day, 'YYMMDD') || '-%') + 1)::text, 3, '0');
  insert into svc_orders(id, kos_id, number, contact_id, customer_name, customer_phone, due_at, pickup, deliver, address, delivery_fee, subtotal, discount, total, note)
  values (p_id, p_kos, v_no, v_contact, v_name, v_phone, v_due, coalesce((p->>'pickup')::boolean, false), coalesce((p->>'deliver')::boolean, false),
          nullif(trim(coalesce(p->>'address', '')), ''), v_fee, v_sub, v_disc, v_total, nullif(trim(coalesce(p->>'note', '')), ''));
  insert into svc_order_lines(order_id, kos_id, service_id, name, unit, qty, charge_qty, price, line_total, note)
  select p_id, p_kos, (x->>'service_id')::uuid, x->>'name', x->>'unit', (x->>'qty')::numeric, (x->>'charge_qty')::numeric, (x->>'price')::numeric, (x->>'line_total')::numeric, x->>'note'
  from jsonb_array_elements(v_lines) x;
  perform svc_event(p_id, 'status', 'Pesanan diterima' || case when v_disc > 0 then ' · diskon ' || replace(to_char(v_disc, 'FM999,999,999'), ',', '.') else '' end);
  if v_pay > 0 then
    perform svc_payment_add(gen_random_uuid(), p_id, v_pay, coalesce(p->'payment'->>'method', 'tunai'), 'bayar');
  end if;
  return jsonb_build_object('id', p_id, 'number', v_no, 'total', v_total, 'duplicate', false);
end $$;

-- Ubah isi pesanan (mis. berat setelah ditimbang ulang) selama belum siap; tercatat
create or replace function public.svc_order_edit(p_order uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o svc_orders; v_lines jsonb; v_sub numeric; v_disc numeric; v_fee numeric; v_total numeric; v_paid numeric;
begin
  select * into o from svc_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform svc_guard(o.kos_id, 'sell');
  if o.status not in ('diterima', 'proses') then raise exception 'Pesanan yang sudah siap/selesai/batal tidak bisa diubah'; end if;
  v_lines := svc_price_lines(o.kos_id, p->'lines');
  v_sub := (select sum((x->>'line_total')::numeric) from jsonb_array_elements(v_lines) x);
  v_disc := round(coalesce((p->>'discount')::numeric, o.discount), 2); v_fee := round(coalesce((p->>'delivery_fee')::numeric, o.delivery_fee), 2);
  if v_disc < 0 or v_disc > v_sub or v_fee < 0 then raise exception 'Diskon/ongkos tidak valid'; end if;
  v_total := v_sub - v_disc + v_fee; v_paid := svc_paid(o.id);
  if v_paid > v_total then raise exception 'Total baru lebih kecil dari yang sudah dibayar (%). Catat pengembalian uang dulu.', replace(to_char(v_paid, 'FM999,999,999'), ',', '.'); end if;
  delete from svc_order_lines where order_id = o.id;
  insert into svc_order_lines(order_id, kos_id, service_id, name, unit, qty, charge_qty, price, line_total, note)
  select o.id, o.kos_id, (x->>'service_id')::uuid, x->>'name', x->>'unit', (x->>'qty')::numeric, (x->>'charge_qty')::numeric, (x->>'price')::numeric, (x->>'line_total')::numeric, x->>'note'
  from jsonb_array_elements(v_lines) x;
  update svc_orders set subtotal = v_sub, discount = v_disc, delivery_fee = v_fee, total = v_total,
    due_at = coalesce(nullif(p->>'due_at', '')::timestamptz, due_at), pickup = coalesce((p->>'pickup')::boolean, pickup), deliver = coalesce((p->>'deliver')::boolean, deliver),
    address = coalesce(nullif(trim(coalesce(p->>'address', '')), ''), address), note = coalesce(nullif(trim(coalesce(p->>'note', '')), ''), note)
  where id = o.id;
  perform svc_event(o.id, 'ubah', 'Isi pesanan diubah: total ' || replace(to_char(o.total, 'FM999,999,999'), ',', '.') || ' → ' || replace(to_char(v_total, 'FM999,999,999'), ',', '.')
    || coalesce(' · ' || nullif(trim(coalesce(p->>'reason', '')), ''), ''));
  return jsonb_build_object('total', v_total);
end $$;

-- Pindah tahap. p_to: 'next' | 'prev' | 'siap' | 'selesai' (diambil/diantar)
create or replace function public.svc_order_move(p_order uuid, p_to text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o svc_orders; v_cur svc_stages; v_next uuid; v_name text; v_status text; v_paid numeric;
begin
  select * into o from svc_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  if p_to = 'selesai' then perform svc_guard(o.kos_id, 'sell'); else perform svc_guard(o.kos_id, 'sell,ops'); end if;
  if o.status in ('selesai', 'batal') then raise exception 'Pesanan sudah %', o.status; end if;
  select * into v_cur from svc_stages where id = o.stage_id;
  if p_to = 'next' then
    if o.status = 'siap' then raise exception 'Pesanan sudah siap; tandai diambil/diantar'; end if;
    select id, name into v_next, v_name from svc_stages where kos_id = o.kos_id and active and (o.status = 'diterima' or sort > coalesce(v_cur.sort, -1)) order by sort limit 1;
    if v_next is null then v_status := 'siap'; v_name := 'Siap diambil/diantar'; else v_status := 'proses'; end if;
  elsif p_to = 'prev' then
    if o.status = 'diterima' then raise exception 'Belum ada tahap sebelumnya'; end if;
    select id, name into v_next, v_name from svc_stages where kos_id = o.kos_id and active and (o.status = 'siap' or sort < v_cur.sort) order by sort desc limit 1;
    if v_next is null then v_status := 'diterima'; v_name := 'Diterima'; else v_status := 'proses'; end if;
    if coalesce(length(trim(p_note)), 0) < 3 then raise exception 'Tuliskan alasan mundur tahap'; end if;
  elsif p_to = 'siap' then
    v_status := 'siap'; v_next := null; v_name := 'Siap diambil/diantar';
  elsif p_to = 'selesai' then
    if o.status <> 'siap' then raise exception 'Pesanan belum siap'; end if;
    v_status := 'selesai'; v_next := null; v_name := case when o.deliver then 'Sudah diantar' else 'Sudah diambil' end;
  else raise exception 'Tujuan tidak dikenal'; end if;
  update svc_orders set status = v_status, stage_id = v_next,
    completed_at = case when v_status = 'selesai' then now() end,
    completed_date = case when v_status = 'selesai' then (now() at time zone 'Asia/Jakarta')::date end,
    handover = case when v_status = 'selesai' then nullif(trim(coalesce(p_note, '')), '') else handover end
  where id = o.id;
  v_paid := svc_paid(o.id);
  perform svc_event(o.id, 'status', v_name || case when v_status = 'selesai' and v_paid < o.total then ' · belum lunas, sisa ' || replace(to_char(o.total - v_paid, 'FM999,999,999'), ',', '.') else '' end
    || coalesce(' · ' || nullif(trim(coalesce(p_note, '')), ''), ''));
  return jsonb_build_object('status', v_status, 'stage', v_name, 'outstanding', o.total - v_paid);
end $$;

create or replace function public.svc_order_cancel(p_order uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o svc_orders; v_paid numeric;
begin
  select * into o from svc_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform svc_guard(o.kos_id, 'sell');
  if approval_needed(o.kos_id, 'batal_pesanan_jasa') then raise exception 'PERLU_PERSETUJUAN: Tindakan ini perlu persetujuan pemilik. Kirim permintaan dari aplikasi.'; end if;
  if o.status in ('selesai', 'batal') then raise exception 'Pesanan sudah % dan tidak bisa dibatalkan', o.status; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasan pembatalan'; end if;
  update svc_orders set status = 'batal', stage_id = null, void_reason = trim(p_reason), voided_at = now() where id = o.id;
  v_paid := svc_paid(o.id);
  perform svc_event(o.id, 'batal', 'Dibatalkan: ' || trim(p_reason) || case when v_paid > 0 then ' · uang ' || replace(to_char(v_paid, 'FM999,999,999'), ',', '.') || ' perlu dikembalikan (catat Pengembalian)' else '' end);
  return jsonb_build_object('refund_due', v_paid);
end $$;

create or replace function public.svc_payment_add(p_id uuid, p_order uuid, p_amount numeric, p_method text, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o svc_orders; v_paid numeric; v_amt numeric := round(coalesce(p_amount, 0), 2);
begin
  if exists (select 1 from svc_payments where id = p_id) then return jsonb_build_object('duplicate', true); end if;
  select * into o from svc_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform svc_guard(o.kos_id, 'sell');
  if p_method not in ('tunai', 'transfer', 'ewallet') then raise exception 'Pilih cara bayar'; end if;
  if v_amt <= 0 then raise exception 'Isi jumlah uang'; end if;
  v_paid := svc_paid(o.id);
  if p_kind = 'bayar' then
    if o.status = 'batal' then raise exception 'Pesanan sudah dibatalkan'; end if;
    if v_amt > o.total - v_paid then raise exception 'Melebihi sisa tagihan (%)', replace(to_char(o.total - v_paid, 'FM999,999,999'), ',', '.'); end if;
  elsif p_kind = 'kembali' then
    if v_amt > v_paid then raise exception 'Pengembalian melebihi uang yang sudah diterima'; end if;
  else raise exception 'Jenis tidak dikenal'; end if;
  insert into svc_payments(id, kos_id, order_id, kind, amount, method, account) values (p_id, o.kos_id, o.id, p_kind, v_amt, p_method, case when p_method = 'tunai' then 'kas' else 'bank' end);
  perform svc_event(o.id, 'bayar', case when p_kind = 'bayar' then 'Bayar ' else 'Uang dikembalikan ' end || replace(to_char(v_amt, 'FM999,999,999'), ',', '.') || ' (' || p_method || ')');
  return jsonb_build_object('paid', svc_paid(o.id), 'outstanding', o.total - svc_paid(o.id));
end $$;

create or replace function public.svc_payment_void(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare x svc_payments;
begin
  select * into x from svc_payments where id = p_payment for update;
  if x.id is null then raise exception 'Pembayaran tidak ditemukan'; end if;
  perform svc_guard(x.kos_id, 'sell');
  if approval_needed(x.kos_id, 'batal_bayar_jasa') then raise exception 'PERLU_PERSETUJUAN: Tindakan ini perlu persetujuan pemilik. Kirim permintaan dari aplikasi.'; end if;
  if x.status = 'batal' then raise exception 'Pembayaran sudah dibatalkan'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasan'; end if;
  if x.kind = 'bayar' and svc_paid(x.order_id) - x.amount < 0 then raise exception 'Batalkan dulu catatan pengembalian uangnya'; end if;
  update svc_payments set status = 'batal', void_reason = trim(p_reason) where id = x.id;
  perform svc_event(x.order_id, 'bayar', 'Pembayaran ' || replace(to_char(x.amount, 'FM999,999,999'), ',', '.') || ' dibatalkan: ' || trim(p_reason));
end $$;

-- Keluhan. Cuci ulang: pesanan yang belum diserahkan kembali ke tahap pertama; pesanan yang SUDAH diserahkan
-- dibuat pesanan cuci ulang baru tanpa biaya (terhubung ke pesanan asal) agar pendapatan & riwayat asal tetap utuh.
create or replace function public.svc_complaint_add(p_order uuid, p_kind text, p_note text, p_rewash boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o svc_orders; v uuid; v_first uuid; v_new uuid; v_no text; v_day date := (now() at time zone 'Asia/Jakarta')::date;
begin
  select * into o from svc_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform svc_guard(o.kos_id, 'sell,ops');
  if o.status = 'batal' then raise exception 'Pesanan dibatalkan'; end if;
  if coalesce(length(trim(p_note)), 0) < 3 then raise exception 'Tuliskan keluhannya'; end if;
  insert into svc_complaints(kos_id, order_id, kind, note, rewash, created_email) values (o.kos_id, o.id, p_kind, trim(p_note), coalesce(p_rewash, false), actor_email()) returning id into v;
  select id into v_first from svc_stages where kos_id = o.kos_id and active order by sort limit 1;
  if coalesce(p_rewash, false) and o.status <> 'selesai' then
    update svc_orders set status = 'proses', stage_id = v_first where id = o.id;
    perform svc_event(o.id, 'keluhan', 'Keluhan (' || replace(p_kind, '_', ' ') || '): ' || trim(p_note) || ' · dikerjakan ulang dari tahap pertama');
  elsif coalesce(p_rewash, false) then
    perform pg_advisory_xact_lock(hashtext('svc:' || o.kos_id::text));
    v_new := gen_random_uuid();
    v_no := 'PSN-' || to_char(v_day, 'YYMMDD') || '-' || lpad(((select count(*) from svc_orders where kos_id = o.kos_id and number like 'PSN-' || to_char(v_day, 'YYMMDD') || '-%') + 1)::text, 3, '0');
    insert into svc_orders(id, kos_id, number, contact_id, customer_name, customer_phone, due_at, status, stage_id, deliver, address, subtotal, discount, total, note, rework_of)
    values (v_new, o.kos_id, v_no, o.contact_id, o.customer_name, o.customer_phone, now() + interval '24 hours', 'proses', v_first, o.deliver, o.address, 0, 0, 0,
            'Cuci ulang ' || o.number || ': ' || trim(p_note), o.id);
    insert into svc_order_lines(order_id, kos_id, service_id, name, unit, qty, charge_qty, price, line_total, note)
    select v_new, kos_id, service_id, name, unit, qty, charge_qty, 0, 0, 'cuci ulang' from svc_order_lines where order_id = o.id;
    perform svc_event(v_new, 'status', 'Pesanan cuci ulang tanpa biaya dari ' || o.number);
    perform svc_event(o.id, 'keluhan', 'Keluhan (' || replace(p_kind, '_', ' ') || '): ' || trim(p_note) || ' · dibuat pesanan cuci ulang ' || v_no);
  else
    perform svc_event(o.id, 'keluhan', 'Keluhan (' || replace(p_kind, '_', ' ') || '): ' || trim(p_note));
  end if;
  return jsonb_build_object('id', v, 'rework_number', v_no);
end $$;

create or replace function public.svc_complaint_resolve(p_id uuid, p_resolution text, p_compensation numeric)
returns void language plpgsql security definer set search_path = public as $$
declare c svc_complaints;
begin
  select * into c from svc_complaints where id = p_id for update;
  if c.id is null then raise exception 'Keluhan tidak ditemukan'; end if;
  perform svc_guard(c.kos_id, 'sell');
  if c.status = 'selesai' then raise exception 'Keluhan sudah selesai'; end if;
  if coalesce(length(trim(p_resolution)), 0) < 3 then raise exception 'Tuliskan penyelesaiannya'; end if;
  update svc_complaints set status = 'selesai', resolution = trim(p_resolution), compensation = greatest(coalesce(p_compensation, 0), 0), resolved_at = now(), resolved_by = actor_email() where id = c.id;
  perform svc_event(c.order_id, 'keluhan', 'Keluhan selesai: ' || trim(p_resolution) || case when coalesce(p_compensation, 0) > 0 then ' · ganti rugi ' || replace(to_char(p_compensation, 'FM999,999,999'), ',', '.') || ' (catat di Kas sebagai biaya)' else '' end);
end $$;

-- Papan pesanan: pesanan aktif + 30 hari terakhir. Operator (tanpa akses uang) tidak menerima angka uang.
create or replace function public.svc_board(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_money boolean;
begin
  perform svc_guard(p_kos, 'sell,ops,finance');
  v_money := member_in('sell,finance', p_kos);
  return jsonb_build_object(
    'money', v_money,
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sort', sort) order by sort), '[]') from svc_stages where kos_id = p_kos and active),
    'orders', (select coalesce(jsonb_agg(z order by z.due_at nulls last, z.number), '[]') from (
      select o.id, o.number, o.customer_name, case when v_money then o.customer_phone end as customer_phone, o.contact_id, o.received_at, o.due_at, o.status, o.stage_id,
        (select name from svc_stages where id = o.stage_id) as stage_name, o.pickup, o.deliver, o.address, o.note, o.completed_at, o.void_reason, o.handover,
        case when v_money then o.total end as total, case when v_money then o.discount end as discount, case when v_money then o.delivery_fee end as delivery_fee,
        case when v_money then svc_paid(o.id) end as paid, (select number from svc_orders r where r.id = o.rework_of) as rework_of,
        (select jsonb_agg(jsonb_build_object('name', l.name, 'unit', l.unit, 'qty', l.qty, 'charge_qty', l.charge_qty, 'service_id', l.service_id, 'note', l.note,
            'price', case when v_money then l.price end, 'line_total', case when v_money then l.line_total end)) from svc_order_lines l where l.order_id = o.id) as lines,
        (select count(*) from svc_complaints c where c.order_id = o.id and c.status = 'terbuka') as open_complaints
      from svc_orders o where o.kos_id = p_kos and (o.status not in ('selesai', 'batal') or coalesce(o.completed_at, o.voided_at) > now() - interval '30 days')) z));
end $$;

create or replace function public.svc_order_detail(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o svc_orders; v_money boolean;
begin
  select * into o from svc_orders where id = p_order;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform svc_guard(o.kos_id, 'sell,ops,finance');
  v_money := member_in('sell,finance', o.kos_id);
  return jsonb_build_object(
    'events', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'text', text, 'actor', actor, 'at', created_at) order by created_at desc), '[]') from svc_events where order_id = o.id),
    'payments', case when v_money then (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'amount', amount, 'method', method, 'paid_at', paid_at, 'status', status, 'void_reason', void_reason) order by created_at), '[]') from svc_payments where order_id = o.id) else '[]'::jsonb end,
    'complaints', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'note', note, 'rewash', rewash, 'status', status, 'resolution', resolution, 'compensation', compensation, 'at', created_at) order by created_at desc), '[]') from svc_complaints where order_id = o.id));
end $$;

-- Laporan jasa (pendapatan = pesanan selesai/diserahkan pada periode; uang diterima dicatat terpisah)
create or replace function public.svc_report(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform svc_guard(p_kos, 'finance');
  return (with d as (select * from svc_orders where kos_id = p_kos and status = 'selesai' and completed_date between p_from and p_to)
  select jsonb_build_object(
    'masuk', (select count(*) from svc_orders where kos_id = p_kos and (received_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'masuk_batal', (select count(*) from svc_orders where kos_id = p_kos and status = 'batal' and (received_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'selesai', (select count(*) from d where rework_of is null),
    'selesai_ulang', (select count(*) from d where rework_of is not null),
    'pendapatan', (select coalesce(sum(total), 0) from d),
    'diskon', (select coalesce(sum(discount), 0) from d),
    'ongkir', (select coalesce(sum(delivery_fee), 0) from d),
    'tepat_waktu', (select count(*) from d where due_at is null or exists (select 1 from svc_events e where e.order_id = d.id and e.kind = 'status' and e.text like 'Siap%' and e.created_at <= d.due_at)),
    'uang_masuk', (select coalesce(sum(case when kind = 'bayar' then amount else -amount end), 0) from svc_payments where kos_id = p_kos and status = 'selesai' and paid_at between p_from and p_to),
    'piutang', (select coalesce(sum(o.total - svc_paid(o.id)), 0) from svc_orders o where o.kos_id = p_kos and o.status = 'selesai' and o.total > svc_paid(o.id)),
    'uang_muka', (select coalesce(sum(svc_paid(o.id)), 0) from svc_orders o where o.kos_id = p_kos and o.status <> 'selesai'),
    'bahan', (select coalesce(-sum(value), 0) from stock_moves where kos_id = p_kos and kind in ('pakai', 'rusak', 'kedaluwarsa') and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'biaya', (select coalesce(sum(amount), 0) from expenses where kos_id = p_kos and kind = 'operasional' and date between p_from and p_to),
    'keluhan', (select count(*) from svc_complaints where kos_id = p_kos and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'cuci_ulang', (select count(*) from svc_complaints where kos_id = p_kos and rewash and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'ganti_rugi', (select coalesce(sum(compensation), 0) from svc_complaints where kos_id = p_kos and resolved_at is not null and (resolved_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'layanan', (select coalesce(jsonb_agg(z order by z.pendapatan desc), '[]') from (
        select l.name, l.unit, sum(l.qty) as qty, count(distinct l.order_id) as pesanan, sum(l.line_total) as pendapatan
        from svc_order_lines l join d on d.id = l.order_id group by l.name, l.unit) z),
    'harian', (select coalesce(jsonb_agg(z order by z.d), '[]') from (select completed_date as d, count(*) as n, sum(total) as pendapatan from d group by 1) z),
    'pelanggan', (select coalesce(jsonb_agg(z order by z.pendapatan desc), '[]') from (select customer_name as name, count(*) as n, sum(total) as pendapatan from d group by 1 order by 3 desc limit 10) z)));
end $$;

-- ================= Integrasi ke sistem yang sudah ada =================
-- Kas & bank: pembayaran pesanan jasa ikut dihitung
select public._prasara_patch('public.retail_ledger(uuid)',
  '    union all select account, -amount from expenses where kos_id = p_kos',
  '    union all select account, case when kind = ''bayar'' then amount else -amount end from svc_payments where kos_id = p_kos and status = ''selesai''
    union all select account, -amount from expenses where kos_id = p_kos');
select public._prasara_patch('public.retail_ledger_internal(uuid)',
  '    union all select account, -amount from expenses where kos_id = p_kos',
  '    union all select account, case when kind = ''bayar'' then amount else -amount end from svc_payments where kos_id = p_kos and status = ''selesai''
    union all select account, -amount from expenses where kos_id = p_kos');
select public._prasara_patch('public.cash_by_location_internal(uuid)',
  '    union all select branch_id, -amount from expenses where kos_id = p_kos and account = ''kas''',
  '    union all select branch_id, case when kind = ''bayar'' then amount else -amount end from svc_payments where kos_id = p_kos and status = ''selesai'' and account = ''kas''
    union all select branch_id, -amount from expenses where kos_id = p_kos and account = ''kas''');

-- Pembukuan: akun & posting otomatis (pendapatan diakui saat pesanan diserahkan; uang sebelum itu = uang muka pelanggan)
select public._prasara_patch('public.acct_ensure(uuid)',
  '    (''6-9000'', ''Beban non-operasional'', ''beban'', ''beban_lain'')',
  '    (''6-9000'', ''Beban non-operasional'', ''beban'', ''beban_lain''),
    (''1-1310'', ''Piutang pelanggan jasa'', ''aset'', ''piutang_jasa''),
    (''2-1300'', ''Uang muka pelanggan'', ''kewajiban'', ''uang_muka''),
    (''4-3000'', ''Pendapatan jasa'', ''pendapatan'', ''pendapatan_jasa''),
    (''5-3000'', ''Pemakaian bahan'', ''beban'', ''beban_bahan'')');
select public._prasara_patch('public.acct_desired(uuid)',
  '(case when m.kind = ''awal'' then ''saldo_awal'' else ''selisih_persediaan'' end, -m.value)) x(k, v)
    where m.kos_id = p_kos and m.kind in (''awal'', ''opname'', ''rusak'', ''kedaluwarsa'', ''koreksi'') and m.value <> 0',
  '(case when m.kind = ''awal'' then ''saldo_awal'' when m.kind = ''pakai'' then ''beban_bahan'' else ''selisih_persediaan'' end, -m.value)) x(k, v)
    where m.kos_id = p_kos and m.kind in (''awal'', ''opname'', ''rusak'', ''kedaluwarsa'', ''koreksi'', ''pakai'') and m.value <> 0');
select public._prasara_patch('public.acct_desired(uuid)',
  '  union all
  select ''purchase_return'',',
  '  union all
  select ''svc_order'', o.id, coalesce(o.completed_date, (o.received_at at time zone ''Asia/Jakarta'')::date), ''Pesanan jasa '' || o.number || '' · '' || o.customer_name, x.k, x.v from svc_orders o
    cross join lateral (select svc_paid(o.id) as pd) p
    cross join lateral (values
      (''piutang_jasa'', case when o.status = ''selesai'' then o.total else p.pd end),
      (case when o.status = ''selesai'' then ''pendapatan_jasa'' else ''uang_muka'' end, -(case when o.status = ''selesai'' then o.total else p.pd end))) x(k, v)
    where o.kos_id = p_kos and (o.status = ''selesai'' or p.pd <> 0)
  union all
  select ''svc_payment'', y.id, y.paid_at, case when y.kind = ''bayar'' then ''Terima pembayaran jasa '' else ''Uang kembali jasa '' end || (select number from svc_orders where id = y.order_id), x.k, x.v from svc_payments y
    cross join lateral (values (y.account, case when y.kind = ''bayar'' then y.amount else -y.amount end), (''piutang_jasa'', -(case when y.kind = ''bayar'' then y.amount else -y.amount end))) x(k, v)
    where y.kos_id = p_kos and y.status = ''selesai''
  union all
  select ''purchase_return'',');

-- Persetujuan: batal pesanan & batal pembayaran jasa
select public._prasara_patch('public.approval_request(uuid,text,jsonb,text)',
  'elsif p_action = ''batal_pelunasan'' then',
  'elsif p_action = ''batal_pesanan_jasa'' then
    v_target := p_payload->>''order_id'';
    select number || '' · '' || customer_name || '' ('' || replace(to_char(total, ''FM999,999,999''), '','', ''.'') || '')'' into v_sum from svc_orders where id = v_target::uuid and kos_id = p_kos and status not in (''selesai'', ''batal'');
    if v_sum is null then raise exception ''Pesanan tidak ditemukan atau sudah selesai''; end if;
    v_sum := ''Batalkan pesanan '' || v_sum;
    v_imp := jsonb_build_object(''pesanan'', v_sum, ''alasan'', p_reason, ''jumlah'', (select svc_paid(v_target::uuid)));
  elsif p_action = ''batal_bayar_jasa'' then
    v_target := p_payload->>''payment_id'';
    select ''Batalkan pembayaran '' || replace(to_char(y.amount, ''FM999,999,999''), '','', ''.'') || '' untuk '' || o.number into v_sum from svc_payments y join svc_orders o on o.id = y.order_id where y.id = v_target::uuid and y.kos_id = p_kos and y.status = ''selesai'';
    if v_sum is null then raise exception ''Pembayaran tidak ditemukan''; end if;
    v_imp := jsonb_build_object(''pembayaran'', v_sum, ''alasan'', p_reason);
  elsif p_action = ''batal_pelunasan'' then');
select public._prasara_patch('public.approval_decide(uuid,boolean,text)',
  'when ''batal_pelunasan'' then',
  'when ''batal_pesanan_jasa'' then svc_order_cancel((ap.payload->>''order_id'')::uuid, coalesce(ap.reason, ''disetujui pemilik''))
      when ''batal_bayar_jasa'' then (select jsonb_build_object(''ok'', true) from (select svc_payment_void((ap.payload->>''payment_id'')::uuid, coalesce(ap.reason, ''disetujui pemilik''))) z)
      when ''batal_pelunasan'' then');

-- Ringkasan pemilik: angka bisnis jasa
select public._prasara_patch('public.owner_overview2(date)',
  '    else
      v_rev := coalesce((select sum(amount) from payments where kos_id = k.id and status = ''terverifikasi'' and paid_at between m0 and m1), 0)',
  '    elsif k.business_type = ''jasa'' then
      v_rev := coalesce((select sum(total) from svc_orders where kos_id = k.id and status = ''selesai'' and completed_date between m0 and m1), 0)
             + coalesce((select sum(amount) from cash_entries where kos_id = k.id and kind = ''pendapatan_lain'' and date between m0 and m1), 0);
      v_cogs := coalesce((select -sum(value) from stock_moves where kos_id = k.id and kind in (''pakai'', ''rusak'', ''kedaluwarsa'') and (created_at at time zone ''Asia/Jakarta'')::date between m0 and m1), 0);
      v_ops := coalesce((select sum(amount) from expenses where kos_id = k.id and kind = ''operasional'' and date between m0 and m1), 0);
      v_led := retail_ledger(k.id);
      v_kas := (v_led ->> ''kas'')::numeric; v_bank := (v_led ->> ''bank'')::numeric;
      v_recv := coalesce((select sum(o.total - svc_paid(o.id)) from svc_orders o where o.kos_id = k.id and o.status = ''selesai'' and o.total > svc_paid(o.id)), 0);
      v_pay := coalesce((select sum((x ->> ''sisa'')::numeric) from jsonb_array_elements(v_led -> ''utang'') x), 0);
      v_att := v_att
        || coalesce((select jsonb_agg(jsonb_build_object(''text'', n || '' pesanan lewat janji selesai'', ''href'', ''/pesanan'', ''tone'', ''bad'')) from (select count(*) n from svc_orders where kos_id = k.id and status in (''diterima'', ''proses'') and due_at < now()) z where n > 0), ''[]'')
        || coalesce((select jsonb_agg(jsonb_build_object(''text'', n || '' pesanan siap belum diambil > 3 hari'', ''href'', ''/pesanan'', ''tone'', ''gold'')) from (select count(*) n from svc_orders o where kos_id = k.id and status = ''siap'' and exists (select 1 from svc_events e where e.order_id = o.id and e.text like ''Siap%'' and e.created_at < now() - interval ''3 days'')) z where n > 0), ''[]'')
        || coalesce((select jsonb_agg(jsonb_build_object(''text'', n || '' keluhan pelanggan terbuka'', ''href'', ''/pesanan'', ''tone'', ''bad'')) from (select count(*) n from svc_complaints where kos_id = k.id and status = ''terbuka'') z where n > 0), ''[]'');
      v_last := greatest((select max(created_at) from svc_orders where kos_id = k.id), (select max(created_at) from expenses where kos_id = k.id));
    else
      v_rev := coalesce((select sum(amount) from payments where kos_id = k.id and status = ''terverifikasi'' and paid_at between m0 and m1), 0)');
select public._prasara_patch('public.owner_overview2(date)',
  '''basis'', case when k.business_type = ''retail'' then ''penjualan'' else ''kas'' end,',
  '''basis'', case when k.business_type = ''retail'' then ''penjualan'' when k.business_type = ''jasa'' then ''pesanan selesai'' else ''kas'' end,');

-- Tutup bisnis: pesanan jasa yang belum selesai harus dituntaskan dulu
select public._prasara_patch('public.business_close_check(uuid)',
  '  -- peringatan (boleh lanjut setelah dipahami)',
  '  select count(*) into n from svc_orders where kos_id = p_kos and status not in (''selesai'', ''batal'');
  if n > 0 then b := b || jsonb_build_object(''label'', format(''%s pesanan jasa belum selesai/diambil'', n), ''href'', ''/pesanan''); end if;
  select count(*) into n from svc_orders o where kos_id = p_kos and status = ''batal'' and svc_paid(o.id) > 0;
  if n > 0 then b := b || jsonb_build_object(''label'', format(''%s pesanan batal yang uangnya belum dikembalikan'', n), ''href'', ''/pesanan''); end if;
  -- peringatan (boleh lanjut setelah dipahami)');

-- Halaman bisnis publik: tampilkan layanan & terima permintaan layanan
select public._prasara_patch('public.public_page_view(text)',
  '      else (select coalesce(jsonb_agg(jsonb_build_object(''id'', r.id,',
  '      when k.business_type = ''jasa'' then (select coalesce(jsonb_agg(jsonb_build_object(''id'', s.id, ''name'', s.name, ''available'', true,
          ''note'', case when s.min_qty > 0 then ''minimal '' || trim(to_char(s.min_qty, ''FM999990.###'')) || '' '' || s.unit end,
          ''units'', jsonb_build_array(jsonb_build_object(''name'', s.unit, ''price'', case when pg.show_prices then s.price end))) order by s.sort), ''[]'')
        from svc_services s where s.kos_id = k.id and s.active)
      else (select coalesce(jsonb_agg(jsonb_build_object(''id'', r.id,');
select public._prasara_patch('public.public_submit(text,text,text,text,jsonb,boolean,text,integer)',
  '    else
      select coalesce(nullif(r.name, ''''), ''Kamar '' || r.code) into v_name',
  '    elsif k.business_type = ''jasa'' then
      select s.name into v_name from svc_services s where s.id = (x->>''id'')::uuid and s.kos_id = k.id and s.active and pg.catalog_mode <> ''tidak'';
      if v_name is null then return jsonb_build_object(''ok'', false, ''error'', ''Layanan yang dipilih tidak tersedia lagi. Muat ulang halaman.''); end if;
      v_items := v_items || jsonb_build_object(''id'', x->>''id'', ''name'', v_name, ''unit'', (select unit from svc_services where id = (x->>''id'')::uuid), ''qty'', v_q,
        ''price'', case when pg.show_prices then (select price from svc_services where id = (x->>''id'')::uuid) end);
    else
      select coalesce(nullif(r.name, ''''), ''Kamar '' || r.code) into v_name');

-- Ekspor Excel/PDF: lembar data jasa
select public._prasara_patch('public.business_export_sheets(uuid)',
  '  else
    s := s || xs(''Kamar'',',
  '  elsif k.business_type = ''jasa'' then
    s := s || xs(''Layanan'', array[''Nama'', ''Kategori'', ''Satuan'', ''Harga'', ''Minimal'', ''Lama (jam)'', ''Aktif''], array[''t'', ''t'', ''t'', ''r'', ''n'', ''n'', ''t''],
      (select jsonb_agg(jsonb_build_array(name, category, unit, price, min_qty, hours, case when active then ''ya'' else ''tidak'' end) order by sort) from svc_services where kos_id = p_kos));
    s := s || xs(''Pesanan'', array[''Diterima'', ''Nomor'', ''Pelanggan'', ''No. HP'', ''Janji selesai'', ''Status'', ''Subtotal'', ''Diskon'', ''Ongkir'', ''Total'', ''Dibayar'', ''Sisa'', ''Diserahkan'', ''Alasan batal''],
      array[''t'', ''t'', ''t'', ''t'', ''t'', ''t'', ''r'', ''r'', ''r'', ''r'', ''r'', ''r'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(xs_time(o.received_at), o.number, o.customer_name, o.customer_phone, xs_time(o.due_at), o.status, o.subtotal, o.discount, o.delivery_fee, o.total,
        svc_paid(o.id), o.total - svc_paid(o.id), xs_time(o.completed_at), o.void_reason) order by o.received_at) from svc_orders o where o.kos_id = p_kos));
    s := s || xs(''Rincian pesanan'', array[''Nomor'', ''Layanan'', ''Jumlah'', ''Dihitung'', ''Satuan'', ''Harga'', ''Subtotal'', ''Catatan''], array[''t'', ''t'', ''n'', ''n'', ''t'', ''r'', ''r'', ''t''],
      (select jsonb_agg(jsonb_build_array(o.number, l.name, l.qty, l.charge_qty, l.unit, l.price, l.line_total, l.note) order by o.received_at) from svc_order_lines l join svc_orders o on o.id = l.order_id where l.kos_id = p_kos));
    s := s || xs(''Pembayaran jasa'', array[''Tanggal'', ''Nomor pesanan'', ''Jenis'', ''Jumlah'', ''Cara'', ''Status'', ''Alasan batal''], array[''d'', ''t'', ''t'', ''r'', ''t'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(y.paid_at, o.number, y.kind, y.amount, y.method, y.status, y.void_reason) order by y.created_at) from svc_payments y join svc_orders o on o.id = y.order_id where y.kos_id = p_kos));
    s := s || xs(''Keluhan'', array[''Waktu'', ''Nomor pesanan'', ''Jenis'', ''Keluhan'', ''Cuci ulang'', ''Status'', ''Penyelesaian'', ''Ganti rugi''], array[''t'', ''t'', ''t'', ''t'', ''t'', ''t'', ''t'', ''r''],
      (select jsonb_agg(jsonb_build_array(xs_time(c.created_at), o.number, c.kind, c.note, case when c.rewash then ''ya'' else '''' end, c.status, c.resolution, c.compensation) order by c.created_at) from svc_complaints c join svc_orders o on o.id = c.order_id where c.kos_id = p_kos));
    s := s || xs(''Riwayat proses'', array[''Waktu'', ''Nomor pesanan'', ''Kejadian'', ''Oleh''], array[''t'', ''t'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(xs_time(e.created_at), o.number, e.text, e.actor) order by e.created_at) from svc_events e join svc_orders o on o.id = e.order_id where e.kos_id = p_kos));
    s := s || xs(''Bahan'', array[''Nama bahan'', ''Satuan'', ''Stok'', ''Harga modal'', ''Stok minimum''], array[''t'', ''t'', ''n'', ''r'', ''n''],
      (select jsonb_agg(jsonb_build_array(name, base_unit, stock, cost, min_stock) order by name) from products where kos_id = p_kos));
    s := s || xs(''Riwayat bahan'', array[''Waktu'', ''Bahan'', ''Jenis'', ''Perubahan'', ''Nilai'', ''Catatan''], array[''t'', ''t'', ''t'', ''n'', ''r'', ''t''],
      (select jsonb_agg(jsonb_build_array(xs_time(m.created_at), p.name, m.kind, m.delta, m.value, m.note) order by m.created_at) from stock_moves m join products p on p.id = m.product_id where m.kos_id = p_kos));
    s := s || xs(''Belanja'', array[''Tanggal'', ''Nomor'', ''Supplier'', ''Total'', ''Cara bayar'', ''Status''], array[''d'', ''t'', ''t'', ''r'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(x.purchase_date, x.number, c.name, x.total, x.pay_method, x.status) order by x.created_at) from purchases x left join contacts c on c.id = x.contact_id where x.kos_id = p_kos));
  else
    s := s || xs(''Kamar'',');

-- CRM: prospek bisnis jasa yang jadi juga masuk daftar pelanggan (dicocokkan lewat No. HP)
select public._prasara_patch('public.crm_lead_stage(uuid,text,text)',
  'if p_stage = ''jadi'' and k.business_type = ''retail'' and l.contact_id is null then',
  'if p_stage = ''jadi'' and k.business_type in (''retail'', ''jasa'') and l.contact_id is null then');

-- Management Center: sinyal kesehatan & ringkasan untuk bisnis jasa (tanpa data pribadi pelanggan)
select public._prasara_patch('public.admin_customers()',
  '      exists (select 1 from purchases b2 where b2.kos_id = k.id) as has_purchase,',
  '      exists (select 1 from purchases b2 where b2.kos_id = k.id) as has_purchase,
      -- Jasa
      exists (select 1 from svc_services s where s.kos_id = k.id and s.active and s.price > 0) as services_priced,
      exists (select 1 from svc_orders o where o.kos_id = k.id and o.created_at >= now() - interval ''30 days'') as order_30,
      exists (select 1 from svc_orders o where o.kos_id = k.id) as has_order,
      exists (select 1 from svc_orders o where o.kos_id = k.id and o.status = ''selesai'') as has_done,');
select public._prasara_patch('public.admin_customers()',
  '(select max(created_at) from products where kos_id = k.id)) as last_at',
  '(select max(created_at) from products where kos_id = k.id), (select max(created_at) from svc_orders where kos_id = k.id),
        (select max(created_at) from svc_events where kos_id = k.id)) as last_at');
select public._prasara_patch('public.admin_customer_base(uuid)',
  '''other_businesses'',',
  '''services'', (select count(*) from svc_services where kos_id = k.id and active),
           ''orders'', (select count(*) from svc_orders where kos_id = k.id and status <> ''batal''),
           ''orders_done'', (select count(*) from svc_orders where kos_id = k.id and status = ''selesai''),
           ''other_businesses'',');
select public._prasara_patch('public.admin_customer_base(uuid)',
  '                 union all select min(created_at), ''Pengeluaran pertama dicatat''',
  '                 union all select min(created_at), ''Pesanan jasa pertama diterima'' from svc_orders where kos_id = k.id having min(created_at) is not null
                 union all select min(completed_at), ''Pesanan jasa pertama diserahkan'' from svc_orders where kos_id = k.id and status = ''selesai'' having min(completed_at) is not null
                 union all select min(created_at), ''Pengeluaran pertama dicatat''');

-- Hak akses fungsi
revoke execute on function public.svc_seed_template(uuid, text), public.svc_paid(uuid), public.svc_event(uuid, text, text), public.svc_guard(uuid, text), public.svc_price_lines(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.svc_service_save(uuid, uuid, jsonb), public.svc_stages_save(uuid, jsonb), public.svc_order_create(uuid, uuid, jsonb), public.svc_order_edit(uuid, jsonb),
  public.svc_order_move(uuid, text, text), public.svc_order_cancel(uuid, text), public.svc_payment_add(uuid, uuid, numeric, text, text), public.svc_payment_void(uuid, text),
  public.svc_complaint_add(uuid, text, text, boolean), public.svc_complaint_resolve(uuid, text, numeric), public.svc_board(uuid), public.svc_order_detail(uuid), public.svc_report(uuid, date, date) from public, anon;
grant execute on function public.svc_service_save(uuid, uuid, jsonb), public.svc_stages_save(uuid, jsonb), public.svc_order_create(uuid, uuid, jsonb), public.svc_order_edit(uuid, jsonb),
  public.svc_order_move(uuid, text, text), public.svc_order_cancel(uuid, text), public.svc_payment_add(uuid, uuid, numeric, text, text), public.svc_payment_void(uuid, text),
  public.svc_complaint_add(uuid, text, text, boolean), public.svc_complaint_resolve(uuid, text, numeric), public.svc_board(uuid), public.svc_order_detail(uuid), public.svc_report(uuid, date, date) to authenticated;

drop function public._prasara_patch(text, text, text);
