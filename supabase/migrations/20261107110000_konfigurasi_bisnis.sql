-- Fondasi Business Profile & Module Registry (blueprint 20, 21, 23.1 langkah 1–4):
-- badan usaha (legal entity), profil & kelompok bisnis, cabang/gudang, katalog modul per bisnis dengan dependensi,
-- persetujuan perubahan material, riwayat konfigurasi. Menonaktifkan modul tidak menghapus data.

-- ---------- Badan usaha ----------
create table if not exists public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  kind text not null default 'perorangan' check (kind in ('perorangan', 'cv', 'pt', 'koperasi', 'yayasan', 'lainnya')),
  created_at timestamptz not null default now()
);
alter table public.legal_entities enable row level security;
drop policy if exists legal_entities_own on public.legal_entities;
create policy legal_entities_own on public.legal_entities for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.legal_entities to authenticated;

-- ---------- Profil bisnis ----------
alter table public.kos add column if not exists legal_entity_id uuid references public.legal_entities(id) on delete set null;
alter table public.kos add column if not exists business_groups text[] not null default '{}';
alter table public.kos add column if not exists profile jsonb not null default '{}';
update public.kos set business_groups = case when business_type = 'retail' then '{retail_trading}'::text[] else '{property_rental}'::text[] end
where business_groups = '{}';

create or replace function public.business_group_codes()
returns text[] language sql immutable as $$
  select array['retail_trading', 'property_rental', 'services', 'fnb_hospitality', 'project_event', 'manufacturing', 'professional_admin', 'distribution', 'lainnya'];
$$;

-- ---------- Cabang & gudang (struktur; transaksi per cabang belum dipakai) ----------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  kind text not null default 'cabang' check (kind in ('cabang', 'gudang')),
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.branches enable row level security;
drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches for select using (public.is_member(kos_id));
grant select on public.branches to authenticated;

-- ---------- Module Registry ----------
create table if not exists public.modules (
  code text primary key,
  name text not null,
  description text not null,
  applies_to text[] not null,              -- jenis bisnis: properti, retail
  core boolean not null default false,     -- inti: selalu aktif
  depends_on text[] not null default '{}',
  entitlement text,                        -- fitur paket yang dibutuhkan (plan_feature_codes)
  paths text[] not null default '{}',      -- menu aplikasi
  data_used text,
  status text not null default 'available' check (status in ('available', 'segera')),
  version text not null default '1.0',
  sort int not null default 0
);
alter table public.modules enable row level security;
drop policy if exists modules_read on public.modules;
create policy modules_read on public.modules for select using (true);
grant select on public.modules to authenticated, anon;

insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, sort) values
  ('p_dashboard', 'Dashboard kos', 'Ringkasan kas, hunian, tagihan, dan tunggakan.', '{properti}', true, '{}', null, '{/beranda}', 'Kamar, tagihan, pembayaran', 'available', 1),
  ('p_kamar', 'Kamar & penghuni', 'Data kamar, harga sewa, penghuni, dan sewa.', '{properti}', true, '{}', null, '{/kamar,/penghuni}', 'Kamar, penghuni, sewa', 'available', 2),
  ('p_tagihan', 'Tagihan & pembayaran', 'Tagihan sewa otomatis, pembayaran sebagian, verifikasi.', '{properti}', true, '{p_kamar}', null, '{/tagihan,/pembayaran,/kwitansi}', 'Tagihan, pembayaran', 'available', 3),
  ('p_laporan', 'Laporan keuangan kos', 'Laba rugi, arus kas, tren.', '{properti}', true, '{p_tagihan}', null, '{/laporan}', 'Pembayaran, pengeluaran', 'available', 4),
  ('p_pengeluaran', 'Pengeluaran', 'Biaya kos, belanja modal, dan uang yang diambil pemilik.', '{properti}', false, '{}', null, '{/pengeluaran}', 'Pengeluaran, kas', 'available', 5),
  ('p_pengingat', 'Pengingat & notifikasi tagihan', 'Lonceng notifikasi, daftar tagih, email pengingat jatuh tempo.', '{properti}', false, '{p_tagihan}', 'pengingat_email', '{/notifikasi}', 'Tagihan, email penghuni', 'available', 6),
  ('p_portal', 'Portal penghuni', 'Link pribadi penghuni untuk cek tagihan dan kirim bukti transfer.', '{properti}', false, '{p_tagihan}', 'portal_penghuni', '{}', 'Tagihan penghuni, bukti transfer', 'available', 7),
  ('r_toko', 'Ringkasan toko', 'Penjualan hari ini, laba kotor, stok menipis.', '{retail}', true, '{}', null, '{/toko}', 'Penjualan, barang', 'available', 11),
  ('r_barang', 'Barang & stok', 'Barang, satuan, harga eceran/grosir, stok, harga modal.', '{retail}', true, '{}', null, '{/barang}', 'Barang, stok', 'available', 12),
  ('r_kasir', 'Kasir & penjualan', 'Kasir eceran/grosir, struk, riwayat, retur, batal.', '{retail}', true, '{r_barang}', null, '{/kasir,/penjualan,/struk}', 'Penjualan, stok', 'available', 13),
  ('r_kas', 'Kas & kasbon', 'Saldo kas/bank, biaya, kasbon pelanggan, utang supplier.', '{retail}', true, '{}', null, '{/kas}', 'Kas, kasbon, utang', 'available', 14),
  ('r_laporan', 'Laporan toko', 'Laba, barang terlaris dan tidak laku.', '{retail}', true, '{r_kasir}', null, '{/laporan-toko}', 'Penjualan, biaya', 'available', 15),
  ('r_belanja', 'Belanja ke supplier', 'Pesan barang, terima sebagian/penuh, utang supplier.', '{retail}', false, '{r_barang}', null, '{/belanja}', 'Belanja, stok, utang', 'available', 16),
  ('r_kontak', 'Pelanggan & supplier', 'Daftar kontak, sisa kasbon/utang, riwayat.', '{retail}', false, '{}', null, '{/kontak}', 'Kontak, transaksi', 'available', 17),
  ('r_shift', 'Shift kasir', 'Buka/tutup laci, hitung uang, selisih.', '{retail}', false, '{r_kasir}', null, '{/shift}', 'Penjualan tunai per kasir', 'available', 18),
  ('r_label', 'Barcode & label', 'Kode barang otomatis dan cetak label barcode.', '{retail}', false, '{r_barang}', null, '{/label}', 'Barang', 'available', 19),
  ('r_pengingat', 'Pengingat toko', 'Lonceng stok menipis, pesanan terlambat, kasbon/utang jatuh tempo; email pagi.', '{retail}', false, '{r_barang}', null, '{/pengingat}', 'Barang, kasbon, utang', 'available', 20),
  ('u_karyawan', 'Karyawan', 'Undang karyawan dengan peran dan hak akses.', '{properti,retail}', false, '{}', null, '{/karyawan}', 'Email karyawan', 'available', 30),
  ('u_akuntansi', 'Akuntansi & jurnal', 'Bagan akun, jurnal otomatis, neraca.', '{properti,retail}', false, '{}', null, '{}', null, 'segera', 40),
  ('u_asisten', 'Asisten AI', 'Tanya kondisi bisnis dengan bahasa sehari-hari.', '{properti,retail}', false, '{}', null, '{}', null, 'segera', 41),
  ('u_online', 'Pesanan online', 'Terima pesanan dari pelanggan lewat link.', '{retail}', false, '{}', null, '{}', null, 'segera', 42)
on conflict (code) do nothing;

create table if not exists public.business_modules (
  kos_id uuid not null references public.kos(id) on delete cascade,
  module_code text not null references public.modules(code),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (kos_id, module_code)
);
alter table public.business_modules enable row level security;
drop policy if exists business_modules_select on public.business_modules;
create policy business_modules_select on public.business_modules for select using (public.is_member(kos_id));
grant select on public.business_modules to authenticated;

-- Bisnis yang sudah ada: semua modul opsional tetap aktif (tidak ada yang berubah)
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, m.code, true, 'sistem' from public.kos k join public.modules m on k.business_type = any(m.applies_to) and not m.core and m.status = 'available'
on conflict do nothing;

-- Bisnis baru: modul opsional aktif sebagai bawaan; pemilik meninjau di onboarding/Pusat konfigurasi
create or replace function public.kos_seed_modules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into business_modules(kos_id, module_code, active, updated_by)
  select new.id, m.code, true, 'bawaan' from modules m where new.business_type = any(m.applies_to) and not m.core and m.status = 'available'
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists kos_seed_modules on public.kos;
create trigger kos_seed_modules after insert on public.kos for each row execute function public.kos_seed_modules();

create or replace function public.module_on(p_kos uuid, p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select core from modules where code = p_code), false)
      or exists (select 1 from business_modules where kos_id = p_kos and module_code = p_code and active);
$$;

-- ---------- Persetujuan & riwayat konfigurasi ----------
create table if not exists public.config_requests (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  module_code text not null references public.modules(code),
  action text not null check (action in ('aktifkan', 'nonaktifkan')),
  reason text,
  risk text not null,
  requested_by text,
  status text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak', 'dibatalkan')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.config_history (
  id bigserial primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  actor text,
  action text not null,
  target text,
  before jsonb,
  after jsonb,
  reason text,
  risk text,
  approved_by text,
  created_at timestamptz not null default now()
);
create index if not exists config_history_kos on public.config_history(kos_id, created_at desc);
alter table public.config_requests enable row level security;
alter table public.config_history enable row level security;
drop policy if exists config_requests_select on public.config_requests;
create policy config_requests_select on public.config_requests for select using (public.member_can(kos_id, 'settings'));
drop policy if exists config_history_select on public.config_history;
create policy config_history_select on public.config_history for select using (public.member_can(kos_id, 'settings'));
grant select on public.config_requests, public.config_history to authenticated;

create or replace function public.config_log(p_kos uuid, p_action text, p_target text, p_before jsonb, p_after jsonb, p_reason text, p_risk text, p_approved_by text)
returns void language sql security definer set search_path = public as $$
  insert into config_history(kos_id, actor, action, target, before, after, reason, risk, approved_by)
  values (p_kos, actor_email(), p_action, p_target, p_before, p_after, nullif(trim(coalesce(p_reason, '')), ''), p_risk, p_approved_by);
$$;
revoke execute on function public.config_log(uuid, text, text, jsonb, jsonb, text, text, text) from public, anon, authenticated;

-- Dampak menonaktifkan modul: transaksi yang masih terbuka
create or replace function public.module_open_items(p_kos uuid, p_code text)
returns text language sql stable security definer set search_path = public as $$
  select case p_code
    when 'r_shift' then (select case when count(*) > 0 then count(*) || ' shift masih terbuka' end from cash_shifts where kos_id = p_kos and closed_at is null)
    when 'r_belanja' then (select case when count(*) > 0 then count(*) || ' pesanan belum selesai diterima' end from purchases where kos_id = p_kos and status in ('dipesan', 'sebagian'))
    when 'p_portal' then (select case when count(*) > 0 then count(*) || ' bukti transfer dari portal menunggu diperiksa' end from payments p where p.kos_id = p_kos and p.status = 'menunggu' and exists (select 1 from payment_proofs x where x.payment_id = p.id))
    when 'u_karyawan' then (select case when count(*) > 0 then count(*) || ' karyawan aktif (akses mereka tertutup selama modul nonaktif)' end from kos_members where kos_id = p_kos and role <> 'pemilik' and active)
    else null end;
$$;

-- Katalog modul untuk satu bisnis (status, prasyarat, paket, dampak)
create or replace function public.module_catalog(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t text;
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  select business_type into t from kos where id = p_kos;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'code', m.code, 'name', m.name, 'description', m.description, 'core', m.core, 'status', m.status, 'version', m.version,
      'active', module_on(p_kos, m.code), 'depends_on', m.depends_on,
      'depends_names', (select coalesce(jsonb_agg(d.name), '[]') from modules d where d.code = any(m.depends_on)),
      'dependents', (select coalesce(jsonb_agg(d.name), '[]') from modules d where m.code = any(d.depends_on) and module_on(p_kos, d.code) and not d.core),
      'entitlement', m.entitlement, 'plan_ok', m.entitlement is null or plan_has(p_kos, m.entitlement),
      'paths', m.paths, 'data_used', m.data_used, 'open_items', module_open_items(p_kos, m.code),
      'pending', (select r.action from config_requests r where r.kos_id = p_kos and r.module_code = m.code and r.status = 'menunggu' limit 1)
    ) order by m.sort), '[]') from modules m where t = any(m.applies_to));
end $$;

-- Ubah modul. Pemilik: langsung (setelah konfirmasi di aplikasi). Pengelola: menjadi permintaan persetujuan.
create or replace function public.module_set(p_kos uuid, p_code text, p_on boolean, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare m modules; v_owner boolean := member_can(p_kos, 'team'); v_risk text; v_open text; v_dep text; v_type text;
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  select * into m from modules where code = p_code;
  select business_type into v_type from kos where id = p_kos;
  if m.code is null or not (v_type = any(m.applies_to)) then raise exception 'Modul tidak tersedia untuk bisnis ini'; end if;
  if m.status <> 'available' then raise exception 'Modul ini belum tersedia'; end if;
  if m.core then raise exception 'Modul inti selalu aktif'; end if;
  if module_on(p_kos, p_code) = p_on then raise exception 'Modul sudah %', case when p_on then 'aktif' else 'nonaktif' end; end if;
  if p_on then
    select string_agg(d.name, ', ') into v_dep from modules d where d.code = any(m.depends_on) and not module_on(p_kos, d.code);
    if v_dep is not null then raise exception 'Aktifkan dulu modul: %', v_dep; end if;
    if m.entitlement is not null and not plan_has(p_kos, m.entitlement) then raise exception 'Modul ini membutuhkan paket yang lebih tinggi. Lihat menu Langganan.'; end if;
    v_risk := 'menengah';
  else
    select string_agg(d.name, ', ') into v_dep from modules d where p_code = any(d.depends_on) and not d.core and module_on(p_kos, d.code);
    if v_dep is not null then raise exception 'Nonaktifkan dulu modul yang bergantung padanya: %', v_dep; end if;
    v_open := module_open_items(p_kos, p_code);
    if v_open is not null and p_code <> 'u_karyawan' then raise exception 'Belum bisa dinonaktifkan: %. Selesaikan dulu.', v_open; end if;
    v_risk := case when v_open is not null then 'tinggi' else 'menengah' end;
    if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasan menonaktifkan'; end if;
  end if;

  if not v_owner then
    if exists (select 1 from config_requests where kos_id = p_kos and module_code = p_code and status = 'menunggu') then raise exception 'Sudah ada permintaan yang menunggu persetujuan pemilik'; end if;
    insert into config_requests(kos_id, module_code, action, reason, risk, requested_by)
    values (p_kos, p_code, case when p_on then 'aktifkan' else 'nonaktifkan' end, nullif(trim(coalesce(p_reason, '')), ''), v_risk, actor_email());
    perform config_log(p_kos, 'minta_persetujuan', p_code, null, jsonb_build_object('aktif', p_on), p_reason, v_risk, null);
    return 'menunggu';
  end if;

  insert into business_modules(kos_id, module_code, active, updated_at, updated_by) values (p_kos, p_code, p_on, now(), actor_email())
  on conflict (kos_id, module_code) do update set active = excluded.active, updated_at = now(), updated_by = excluded.updated_by;
  perform config_log(p_kos, case when p_on then 'aktifkan_modul' else 'nonaktifkan_modul' end, p_code,
    jsonb_build_object('aktif', not p_on), jsonb_build_object('aktif', p_on), p_reason, v_risk, actor_email());
  update config_requests set status = 'dibatalkan', decided_by = actor_email(), decided_at = now() where kos_id = p_kos and module_code = p_code and status = 'menunggu';
  return 'diterapkan';
end $$;

create or replace function public.config_decide(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r config_requests; v_by text;
begin
  select * into r from config_requests where id = p_request for update;
  if r.id is null or not member_can(r.kos_id, 'team') then raise exception 'Permintaan tidak ditemukan'; end if;
  if r.status <> 'menunggu' then raise exception 'Permintaan sudah diproses'; end if;
  if p_approve then
    v_by := r.requested_by;
    perform module_set(r.kos_id, r.module_code, r.action = 'aktifkan', coalesce(r.reason, 'disetujui') || ' (diminta ' || coalesce(v_by, '-') || ')');
  else
    perform config_log(r.kos_id, 'tolak_persetujuan', r.module_code, null, null, r.reason, r.risk, actor_email());
  end if;
  update config_requests set status = case when p_approve then 'disetujui' else 'ditolak' end, decided_by = actor_email(), decided_at = now() where id = p_request;
end $$;

-- Onboarding: pemilik meninjau & menyetujui modul awal (hanya untuk bisnis yang baru dibuat)
create or replace function public.business_modules_init(p_kos uuid, p_codes text[])
returns void language plpgsql security definer set search_path = public as $$
declare k kos;
begin
  if not member_can(p_kos, 'team') then raise exception 'Khusus pemilik bisnis'; end if;
  select * into k from kos where id = p_kos;
  if k.created_at < now() - interval '1 day' then raise exception 'Gunakan Pusat konfigurasi untuk mengubah modul'; end if;
  update business_modules bm set active = (bm.module_code = any(coalesce(p_codes, '{}'))) and (m.entitlement is null or plan_has(p_kos, m.entitlement)),
    updated_at = now(), updated_by = actor_email()
  from modules m where m.code = bm.module_code and bm.kos_id = p_kos and not m.core;
  perform config_log(p_kos, 'konfigurasi_awal', 'modul', null, to_jsonb(p_codes), 'Ditinjau saat membuat bisnis', 'menengah', actor_email());
end $$;

-- Profil bisnis & badan usaha
create or replace function public.business_profile_save(p_kos uuid, p_groups text[], p_profile jsonb, p_legal_entity uuid)
returns void language plpgsql security definer set search_path = public as $$
declare k kos;
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  if p_groups is null or cardinality(p_groups) = 0 or not (p_groups <@ business_group_codes()) then raise exception 'Pilih minimal satu kelompok bisnis'; end if;
  select * into k from kos where id = p_kos for update;
  if p_legal_entity is not null and not exists (select 1 from legal_entities where id = p_legal_entity and owner_id = k.owner_id) then raise exception 'Badan usaha tidak ditemukan'; end if;
  if p_legal_entity is distinct from k.legal_entity_id and not member_can(p_kos, 'team') then raise exception 'Badan usaha hanya bisa diubah pemilik'; end if;
  update kos set business_groups = p_groups, profile = coalesce(p_profile, '{}'), legal_entity_id = p_legal_entity where id = p_kos;
  perform config_log(p_kos, 'ubah_profil', 'profil',
    jsonb_build_object('kelompok', k.business_groups, 'profil', k.profile, 'badan_usaha', k.legal_entity_id),
    jsonb_build_object('kelompok', p_groups, 'profil', p_profile, 'badan_usaha', p_legal_entity), null, 'rendah', actor_email());
end $$;

create or replace function public.branch_save(p_kos uuid, p_id uuid, p_name text, p_kind text, p_address text, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; b branches;
begin
  if not member_can(p_kos, 'team') then raise exception 'Cabang & gudang hanya bisa ditambah atau diubah oleh pemilik'; end if;
  if p_id is null then
    insert into branches(kos_id, name, kind, address) values (p_kos, trim(p_name), coalesce(p_kind, 'cabang'), nullif(trim(coalesce(p_address, '')), '')) returning id into v_id;
    perform config_log(p_kos, 'tambah_cabang', trim(p_name), null, jsonb_build_object('jenis', p_kind, 'alamat', p_address), null, 'menengah', actor_email());
  else
    select * into b from branches where id = p_id and kos_id = p_kos;
    if b.id is null then raise exception 'Cabang tidak ditemukan'; end if;
    update branches set name = trim(p_name), kind = coalesce(p_kind, kind), address = nullif(trim(coalesce(p_address, '')), ''), active = coalesce(p_active, active) where id = p_id returning id into v_id;
    perform config_log(p_kos, 'ubah_cabang', trim(p_name), to_jsonb(b), jsonb_build_object('nama', p_name, 'jenis', p_kind, 'alamat', p_address, 'aktif', p_active), null, 'menengah', actor_email());
  end if;
  return v_id;
end $$;

-- Modul aktif per bisnis untuk menu aplikasi
create or replace function public.my_modules()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(k.id, (select coalesce(jsonb_agg(m.code), '[]') from modules m where k.business_type = any(m.applies_to) and module_on(k.id, m.code))), '{}')
  from kos k join kos_members km on km.kos_id = k.id and km.user_id = auth.uid() and km.active;
$$;

-- ---------- Modul nonaktif juga ditolak di server ----------
do $$
declare r record; v_def text;
begin
  for r in select * from (values
    ('public.shift_open(uuid,numeric)', 'if not member_in(''sell'', p_kos) then raise exception ''Tidak punya akses kasir''; end if;'),
    ('public.shift_close(uuid,numeric,text)', 'if not member_in(''sell'', p_kos) then raise exception ''Tidak punya akses kasir''; end if;'),
    ('public.shift_current(uuid)', 'if not member_in(''sell'', p_kos) then raise exception ''Tidak punya akses kasir''; end if;'),
    ('public.purchase_order_create(uuid,uuid,date,uuid,jsonb,text,date,text,date)', 'if not member_in(''stock'', p_kos) then raise exception ''Tidak punya akses ke bisnis ini''; end if;'),
    ('public.product_auto_codes(uuid,uuid[])', 'if not member_in(''stock'', p_kos) then raise exception ''Tidak punya akses ke bisnis ini''; end if;'),
    ('public.retail_alerts(uuid)', 'if not member_in(''stock,finance'', p_kos) then raise exception ''Tidak punya akses ke bisnis ini''; end if;'),
    ('public.contacts_overview(uuid)', 'if not member_in(''stock,finance'', p_kos) then raise exception ''Tidak punya akses ke bisnis ini''; end if;'),
    ('public.team_invite(uuid,text,text)', 'if not member_can(p_kos, ''team'') then raise exception ''Khusus pemilik bisnis''; end if;')
  ) t(fn, line) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.line in v_def) = 0 then raise exception 'Baris tidak ditemukan di %', r.fn; end if;
    execute replace(v_def, r.line, r.line || E'\n  if not module_on(p_kos, ' ||
      quote_literal(case
        when r.fn like 'public.shift%' then 'r_shift'
        when r.fn like 'public.purchase%' then 'r_belanja'
        when r.fn like 'public.product_auto%' then 'r_label'
        when r.fn like 'public.retail_alerts%' then 'r_pengingat'
        when r.fn like 'public.contacts%' then 'r_kontak'
        else 'u_karyawan' end) || ') then raise exception ''Modul ini sedang nonaktif. Aktifkan di Pusat konfigurasi.''; end if;');
  end loop;
end $$;

do $$
declare r record; v_def text;
begin
  for r in select * from (values
    ('public.purchase_receive(uuid,jsonb,date,boolean)', 'if b.id is null or not member_in(''stock'', b.kos_id) then raise exception ''Belanja tidak ditemukan''; end if;', 'if not module_on(b.kos_id, ''r_belanja'') then raise exception ''Modul ini sedang nonaktif. Aktifkan di Pusat konfigurasi.''; end if;'),
    ('public.portal_get(text)', 'if not plan_has(k.id, ''portal_penghuni'') then', null),
    ('public.portal_submit_payment(text,uuid,numeric,date,text,text,text)', 'if not plan_has(o.kos_id, ''portal_penghuni'') then', null),
    ('public.retail_alert_batch()', 'and plan_has(k.id, ''email_toko'')', null),
    ('public.reminder_batch()', 'plan_has(k.id, ''pengingat_email'') as can_remind, plan_has(k.id, ''portal_penghuni'') as can_portal', null)
  ) t(fn, old, extra) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old in v_def) = 0 then raise exception 'Potongan tidak ditemukan di %', r.fn; end if;
    if r.extra is not null then
      v_def := replace(v_def, r.old, r.old || E'\n  ' || r.extra);
    elsif r.fn = 'public.portal_get(text)' then
      v_def := replace(v_def, r.old, 'if not (plan_has(k.id, ''portal_penghuni'') and module_on(k.id, ''p_portal'')) then');
    elsif r.fn like 'public.portal_submit%' then
      v_def := replace(v_def, r.old, 'if not (plan_has(o.kos_id, ''portal_penghuni'') and module_on(o.kos_id, ''p_portal'')) then');
    elsif r.fn = 'public.retail_alert_batch()' then
      v_def := replace(v_def, r.old, 'and plan_has(k.id, ''email_toko'') and module_on(k.id, ''r_pengingat'')');
    else
      v_def := replace(v_def, r.old, '(plan_has(k.id, ''pengingat_email'') and module_on(k.id, ''p_pengingat'')) as can_remind, (plan_has(k.id, ''portal_penghuni'') and module_on(k.id, ''p_portal'')) as can_portal');
    end if;
    execute v_def;
  end loop;
end $$;

revoke execute on function public.module_on(uuid, text), public.module_open_items(uuid, text), public.module_catalog(uuid), public.module_set(uuid, text, boolean, text),
  public.config_decide(uuid, boolean), public.business_modules_init(uuid, text[]), public.business_profile_save(uuid, text[], jsonb, uuid),
  public.branch_save(uuid, uuid, text, text, text, boolean), public.my_modules(), public.business_group_codes() from public, anon;
grant execute on function public.module_on(uuid, text), public.module_catalog(uuid), public.module_set(uuid, text, boolean, text),
  public.config_decide(uuid, boolean), public.business_modules_init(uuid, text[]), public.business_profile_save(uuid, text[], jsonb, uuid),
  public.branch_save(uuid, uuid, text, text, text, boolean), public.my_modules(), public.business_group_codes() to authenticated;
