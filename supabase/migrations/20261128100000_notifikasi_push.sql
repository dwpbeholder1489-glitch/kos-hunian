-- PRASARA Notification Engine: Pusat Notifikasi + Web Push (VAPID) tanpa layanan berbayar.
-- Alur: peristiwa bisnis (domain_events + beberapa sumber langsung) → katalog aturan (notif_event_types)
--       → penerima (anggota aktif yang berhak atas area itu, bukan pelakunya, sesuai preferensi)
--       → kotak masuk (notif_items, dikelompokkan & idempoten) → antrean push (notif_queue, jam tenang)
--       → pengirim server /api/notif/kirim (dibangunkan pg_net seketika + pg_cron tiap menit bila tersedia,
--         cadangan: cron harian) → layanan push browser (FCM/Apple/Mozilla, gratis) → perangkat.
-- Prinsip:
-- • Notifikasi TIDAK PERNAH menggagalkan transaksi bisnis: semua pembuatan dibungkus exception (galat dicatat saja).
-- • Hanya peristiwa NYATA; jenis peristiwa tanpa baris katalog tidak menjadi notifikasi (tetap di Riwayat aktivitas).
-- • Kotak masuk dibaca HANYA lewat RPC (tanpa policy select) yang memeriksa penerima = auth.uid() dan keanggotaan aktif.
-- • Hemat: peristiwa berfrekuensi tinggi (penjualan, pengeluaran, tagihan terbit) DIGABUNG per jendela waktu
--   (satu baris "12 penjualan baru"), push dibatasi satu per jendela, header Topic menimpa push yang belum terkirim.
-- • notif_items / notif_queue / notif_deliveries / push_subscriptions / notif_user_settings SENGAJA tanpa
--   zz_kos_open_guard: catatan milik AKUN penerima yang hanya ditulis fungsi sistem; penerima tetap harus bisa
--   menandai dibaca/mengarsipkan notifikasi bisnis yang sudah ditutup. notif_prefs (per bisnis) memakai guard.

-- ============================ Katalog aturan ============================
create table if not exists public.notif_event_types (
  code text primary key,                 -- event_type domain_events / sumber langsung
  category text not null check (category in ('aktivitas','penjualan','pembelian','keuangan','inventaris','karyawan','pelanggan','pengingat','sistem')),
  priority text not null check (priority in ('kritis','tinggi','normal','info')),
  audience text not null default 'area' check (audience in ('area','owner','approver','requester','assignee','self')),
  area text,                              -- null = area peristiwa; '' = semua anggota
  title text not null,                    -- judul satu peristiwa
  title_many text,                        -- judul gabungan; {n} = jumlah
  group_minutes int check (group_minutes between 1 and 1440),
  push_default boolean not null default false,
  link text not null,                     -- path aplikasi tujuan ({id} = aggregate_id)
  module text not null,                   -- label modul sumber
  active boolean not null default true
);
alter table public.notif_event_types enable row level security;
drop policy if exists notif_event_types_read on public.notif_event_types;
create policy notif_event_types_read on public.notif_event_types for select to authenticated using (true);
revoke insert, update, delete on public.notif_event_types from anon, authenticated;
grant select on public.notif_event_types to authenticated;

insert into public.notif_event_types(code, category, priority, audience, area, title, title_many, group_minutes, push_default, link, module) values
  -- Penjualan & pesanan
  ('SaleCreated',               'penjualan', 'info',   'area', 'finance',    'Penjualan baru', '{n} penjualan baru', 60, false, '/penjualan', 'Penjualan'),
  ('SaleVoided',                'penjualan', 'tinggi', 'area', 'finance',    'Penjualan dibatalkan', null, null, true, '/penjualan', 'Penjualan'),
  ('SaleReturned',              'penjualan', 'normal', 'area', 'finance',    'Retur penjualan', '{n} retur penjualan', 60, false, '/penjualan', 'Penjualan'),
  ('SalesOrderCreated',         'penjualan', 'normal', 'area', 'sell,finance','Pesanan grosir baru', '{n} pesanan grosir baru', 30, true, '/grosir', 'Pesanan grosir'),
  ('DeliveryCreated',           'penjualan', 'info',   'area', 'finance',    'Surat jalan dibuat', '{n} surat jalan dibuat', 60, false, '/grosir', 'Pesanan grosir'),
  ('ServiceOrderRequested',     'penjualan', 'tinggi', 'area', 'sell,ops',   'Permintaan pesanan baru', '{n} permintaan pesanan baru', 15, true, '/pesanan', 'Pesanan'),
  ('ServiceOrderCreated',       'penjualan', 'info',   'area', 'finance',    'Pesanan baru', '{n} pesanan baru', 60, false, '/pesanan', 'Pesanan'),
  ('ServiceOrderCompleted',     'penjualan', 'info',   'area', 'finance',    'Pesanan selesai', '{n} pesanan selesai', 60, false, '/pesanan', 'Pesanan'),
  ('ServiceOrderCancelled',     'penjualan', 'normal', 'area', 'finance',    'Pesanan dibatalkan', '{n} pesanan dibatalkan', 30, false, '/pesanan', 'Pesanan'),
  ('ReservationRequested',      'penjualan', 'tinggi', 'area', 'sell',       'Permintaan reservasi meja', '{n} permintaan reservasi', 15, true, '/meja', 'Meja & reservasi'),
  ('OfflineSaleReview',         'penjualan', 'tinggi', 'area', 'finance',    'Penjualan offline perlu dicek', '{n} penjualan offline perlu dicek', 60, true, '/penjualan?tab=offline', 'Kasir offline'),
  ('QuoteApproved',             'penjualan', 'normal', 'area', 'finance',    'Penawaran disetujui', null, null, false, '/proyek?tab=penawaran', 'Proyek'),
  ('QuoteRejected',             'penjualan', 'normal', 'area', 'finance',    'Penawaran ditolak', null, null, false, '/proyek?tab=penawaran', 'Proyek'),
  -- Pembelian
  ('PurchaseRequested',         'pembelian', 'normal', 'area', 'finance',    'Permintaan pembelian', '{n} permintaan pembelian', 30, true, '/belanja', 'Belanja'),
  ('PurchaseRequestApproved',   'pembelian', 'normal', 'area', 'stock',      'Permintaan pembelian disetujui', null, null, true, '/belanja', 'Belanja'),
  ('PurchaseRequestRejected',   'pembelian', 'normal', 'area', 'stock',      'Permintaan pembelian ditolak', null, null, true, '/belanja', 'Belanja'),
  ('PurchaseOrdered',           'pembelian', 'info',   'area', 'finance',    'Pesanan ke supplier', '{n} pesanan ke supplier', 60, false, '/belanja', 'Belanja'),
  ('GoodsReceived',             'pembelian', 'info',   'area', 'stock,finance','Barang diterima', '{n} penerimaan barang', 60, false, '/belanja', 'Belanja'),
  ('PurchaseVoided',            'pembelian', 'normal', 'area', 'finance',    'Belanja dibatalkan', null, null, false, '/belanja', 'Belanja'),
  ('SupplierInvoicePosted',     'pembelian', 'info',   'area', 'finance',    'Faktur supplier diposting', '{n} faktur supplier diposting', 60, false, '/belanja?tab=faktur', 'Belanja'),
  -- Keuangan
  ('PaymentSubmitted',          'keuangan',  'tinggi', 'area', 'rent',       'Bukti pembayaran masuk', '{n} bukti pembayaran masuk', 15, true, '/pembayaran', 'Pembayaran'),
  ('PaymentReceived',           'keuangan',  'normal', 'area', 'finance',    'Pembayaran diterima', '{n} pembayaran diterima', 60, false, '/pembayaran', 'Pembayaran'),
  ('PaymentVoided',             'keuangan',  'tinggi', 'area', 'finance',    'Pembayaran dibatalkan', null, null, true, '/pembayaran', 'Pembayaran'),
  ('InvoiceIssued',             'keuangan',  'info',   'area', 'rent',       'Tagihan terbit', '{n} tagihan terbit', 720, false, '/tagihan', 'Tagihan'),
  ('RentalInvoiceGenerated',    'keuangan',  'info',   'area', 'rent',       'Tagihan sewa terbit', '{n} tagihan sewa terbit', 720, false, '/tagihan', 'Tagihan'),
  ('InvoicePaid',               'keuangan',  'normal', 'area', 'rent',       'Tagihan lunas', '{n} tagihan lunas', 60, false, '/tagihan', 'Tagihan'),
  ('ExpenseRecorded',           'keuangan',  'info',   'area', 'finance',    'Pengeluaran dicatat', '{n} pengeluaran dicatat', 60, false, '/pengeluaran', 'Pengeluaran'),
  ('ExpenseDeleted',            'keuangan',  'normal', 'area', 'finance',    'Pengeluaran dihapus', null, null, false, '/pengeluaran', 'Pengeluaran'),
  ('ReceivableCollected',       'keuangan',  'normal', 'area', 'finance',    'Piutang dibayar', '{n} piutang dibayar', 60, false, '/kas', 'Kas'),
  ('PayablePaid',               'keuangan',  'info',   'area', 'finance',    'Utang dibayar', '{n} utang dibayar', 60, false, '/kas', 'Kas'),
  ('DayClosed',                 'keuangan',  'info',   'area', 'finance',    'Tutup harian', null, null, false, '/tutup-hari', 'Tutup harian'),
  ('ProjectPaymentReceived',    'keuangan',  'normal', 'area', 'finance',    'Pembayaran proyek diterima', null, null, false, '/proyek', 'Proyek'),
  ('BudgetApproved',            'keuangan',  'normal', 'area', 'finance',    'Anggaran disetujui', null, null, false, '/anggaran', 'Anggaran'),
  -- Inventaris
  ('StockOut',                  'inventaris','tinggi', 'area', 'stock',      'Stok habis', '{n} barang stok habis', 720, true, '/barang', 'Barang & stok'),
  ('StockLow',                  'inventaris','normal', 'area', 'stock',      'Stok menipis', '{n} barang stok menipis', 720, true, '/barang', 'Barang & stok'),
  ('InventoryAdjusted',         'inventaris','info',   'area', 'stock',      'Penyesuaian stok', '{n} penyesuaian stok', 60, false, '/barang', 'Barang & stok'),
  ('StockTransferred',          'inventaris','info',   'area', 'stock',      'Mutasi stok', '{n} mutasi stok', 60, false, '/mutasi', 'Mutasi'),
  ('StockTransferReceived',     'inventaris','info',   'area', 'stock',      'Mutasi stok diterima', null, null, false, '/mutasi', 'Mutasi'),
  ('StockHeld',                 'inventaris','normal', 'area', 'stock',      'Barang ditahan', '{n} barang ditahan', 60, false, '/barang', 'Barang & stok'),
  -- Persetujuan & aktivitas
  ('ApprovalRequested',         'aktivitas', 'tinggi', 'approver', '',       'Menunggu persetujuan Anda', '{n} permintaan menunggu persetujuan', 30, true, '/persetujuan', 'Persetujuan'),
  ('ApprovalDecided',           'aktivitas', 'normal', 'requester', '',      'Permintaan Anda diputuskan', null, null, true, '/persetujuan', 'Persetujuan'),
  ('ProjectStatusChanged',      'aktivitas', 'info',   'area', 'ops',        'Status proyek berubah', null, null, false, '/proyek/{id}', 'Proyek'),
  ('MilestoneCompleted',        'aktivitas', 'info',   'area', 'ops',        'Milestone selesai', null, null, false, '/proyek/{id}', 'Proyek'),
  ('ChangeRequested',           'aktivitas', 'normal', 'area', 'finance',    'Perubahan lingkup diajukan', null, null, false, '/proyek?tab=penawaran', 'Proyek'),
  -- Karyawan
  ('TaskAssigned',              'karyawan',  'normal', 'assignee', '',       'Tugas baru untuk Anda', '{n} tugas baru untuk Anda', 30, true, '/proyek/{id}', 'Proyek'),
  ('TeamAccessChanged',         'sistem',    'kritis', 'self', '',           'Hak akses Anda diubah', null, null, true, '/akun', 'Karyawan'),
  -- Pelanggan
  ('LeadCreated',               'pelanggan', 'tinggi', 'area', 'sell,rent,ops','Prospek baru masuk', '{n} prospek baru masuk', 15, true, '/crm', 'Prospek'),
  ('BookingCreated',            'pelanggan', 'normal', 'area', 'rent',       'Booking kamar baru', '{n} booking kamar baru', 30, true, '/booking', 'Booking'),
  ('BookingCancelled',          'pelanggan', 'info',   'area', 'rent',       'Booking dibatalkan', null, null, false, '/booking', 'Booking'),
  ('LeaseStarted',              'pelanggan', 'normal', 'area', 'rent',       'Penghuni masuk', '{n} penghuni masuk', 60, false, '/penghuni', 'Penghuni'),
  ('LeaseEnded',                'pelanggan', 'normal', 'area', 'rent',       'Penghuni keluar', '{n} penghuni keluar', 60, false, '/penghuni', 'Penghuni'),
  ('IssueReported',             'pelanggan', 'tinggi', 'area', 'rent',       'Keluhan penghuni baru', '{n} keluhan penghuni baru', 30, true, '/perbaikan', 'Keluhan & perbaikan'),
  -- Pengingat harian (dibuat cron)
  ('ReminderInvoicesDue',       'pengingat', 'tinggi', 'area', 'rent',       'Tagihan jatuh tempo', null, null, true, '/tagihan', 'Tagihan'),
  ('ReminderOrdersLate',        'pengingat', 'tinggi', 'area', 'sell,ops',   'Pesanan melewati janji', null, null, true, '/pesanan', 'Pesanan'),
  -- Sistem & keamanan (akun)
  ('DeviceAdded',               'sistem',    'kritis', 'self', '',           'Perangkat baru menerima notifikasi', null, null, true, '/pusat-notifikasi/perangkat', 'Keamanan'),
  ('TestPush',                  'sistem',    'normal', 'self', '',           'Uji notifikasi PRASARA', null, null, true, '/pusat-notifikasi/pengaturan', 'Notifikasi')
on conflict (code) do update set category = excluded.category, priority = excluded.priority, audience = excluded.audience, area = excluded.area,
  title = excluded.title, title_many = excluded.title_many, group_minutes = excluded.group_minutes, push_default = excluded.push_default,
  link = excluded.link, module = excluded.module;

create or replace function public.notif_rank(p text) returns int language sql immutable as $$
  select case p when 'kritis' then 4 when 'tinggi' then 3 when 'normal' then 2 else 1 end;
$$;

-- Tautan tujuan HANYA path aplikasi sendiri (tanpa skema/host, tanpa "//", tanpa karakter aneh) — anti open redirect & XSS
create or replace function public.notif_link_ok(p text) returns boolean language sql immutable as $$
  select p is not null and length(p) <= 300 and p ~ '^/[A-Za-z0-9/_-]*(\?[A-Za-z0-9=&_.%-]*)?$' and p !~ '^//' and p !~ '\.\.';
$$;

-- ============================ Kotak masuk ============================
create table if not exists public.notif_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kos_id uuid references public.kos(id) on delete cascade,   -- null = notifikasi akun (keamanan/sistem)
  event_type text not null,
  event_key text not null,               -- idempotensi per penerima (peristiwa sama tidak tercatat dua kali)
  group_key text,                        -- penggabungan peristiwa berfrekuensi tinggi
  category text not null,
  priority text not null,
  title text not null,
  body text not null default '',
  amount numeric(16,2),                  -- nominal terpisah: layar kunci bisa menyembunyikannya
  hits int not null default 1,           -- jumlah peristiwa yang digabung
  module text not null,
  source_type text,
  source_id uuid,
  link text not null check (public.notif_link_ok(link)),
  actor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz,
  opened_at timestamptz,
  archived_at timestamptz,
  expires_at timestamptz not null default now() + interval '180 days',
  unique (user_id, event_key)
);
create index if not exists notif_items_user on public.notif_items(user_id, created_at desc) where archived_at is null;
create index if not exists notif_items_unread on public.notif_items(user_id, kos_id) where read_at is null and archived_at is null;
create index if not exists notif_items_group on public.notif_items(user_id, group_key, created_at desc) where read_at is null and group_key is not null;
create index if not exists notif_items_expire on public.notif_items(expires_at);
alter table public.notif_items enable row level security;
revoke all on public.notif_items from anon, authenticated;

-- ============================ Pengaturan ============================
-- Per AKUN: jam tenang, suara, getar, privasi layar kunci (berlaku di semua bisnis)
create table if not exists public.notif_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quiet jsonb not null default '{"on": false, "start": "22:00", "end": "07:00", "days": [1,2,3,4,5,6,7], "tz": "Asia/Jakarta"}',
  sound boolean not null default true,         -- suara khusus saat aplikasi terbuka
  vibrate boolean not null default true,
  hide_amount boolean not null default true,   -- nominal tidak tampil di layar kunci
  updated_at timestamptz not null default now()
);
alter table public.notif_user_settings enable row level security;
revoke all on public.notif_user_settings from anon, authenticated;

-- Per AKUN × BISNIS: kategori dalam aplikasi / push, prioritas minimum push
create table if not exists public.notif_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  cats jsonb not null default '{}',            -- {kategori: {"app": bool, "push": bool}} — kosong = bawaan
  min_push text not null default 'info' check (min_push in ('kritis','tinggi','normal','info')),
  updated_at timestamptz not null default now(),
  primary key (user_id, kos_id)
);
alter table public.notif_prefs enable row level security;
revoke all on public.notif_prefs from anon, authenticated;
drop trigger if exists zz_kos_open_guard on public.notif_prefs;
create trigger zz_kos_open_guard before insert or update or delete on public.notif_prefs for each row execute function public.kos_open_guard();

-- ============================ Perangkat (Push Subscription) ============================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (device_id ~ '^[A-Za-z0-9-]{8,64}$'),   -- acak dari perangkat (bukan sidik jari)
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  keys_enc text not null,                      -- p256dh + auth terenkripsi AES-256-GCM di server (tidak pernah dikirim ke browser)
  app_key text not null,                       -- kunci publik VAPID saat berlangganan (kunci berganti → langganan tidak sah)
  label text not null default 'Perangkat',
  platform text not null default 'lainnya',
  browser text not null default 'lainnya',
  installed boolean not null default false,    -- dibuka sebagai aplikasi layar utama (PWA)
  enabled boolean not null default true,       -- pengguna bisa mematikan per perangkat
  status text not null default 'aktif' check (status in ('aktif','kedaluwarsa','dicabut')),
  fail_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz
);
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id) where status = 'aktif';
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- ============================ Antrean & log pengiriman ============================
create table if not exists public.notif_queue (
  id bigserial primary key,
  notif_id uuid not null references public.notif_items(id) on delete cascade,
  user_id uuid not null,
  status text not null default 'antre' check (status in ('antre','proses','terkirim','gagal','kedaluwarsa','dilewati')),
  next_at timestamptz not null default now(),
  attempts int not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  devices int not null default 0,              -- perangkat yang DITERIMA layanan push (bukan bukti dilihat)
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists notif_queue_due on public.notif_queue(next_at) where status in ('antre','proses');
create index if not exists notif_queue_notif on public.notif_queue(notif_id);
create index if not exists notif_queue_created on public.notif_queue(created_at);
alter table public.notif_queue enable row level security;
revoke all on public.notif_queue from anon, authenticated;

create table if not exists public.notif_deliveries (
  id bigserial primary key,
  queue_id bigint not null,
  notif_id uuid not null,
  subscription_id uuid,
  status text not null check (status in ('diterima','gagal','kedaluwarsa','ditunda')),
  http_status int,
  error text,
  at timestamptz not null default now()
);
create index if not exists notif_deliveries_at on public.notif_deliveries(at);
create index if not exists notif_deliveries_notif on public.notif_deliveries(notif_id);
alter table public.notif_deliveries enable row level security;
revoke all on public.notif_deliveries from anon, authenticated;

-- Konfigurasi platform (satu baris; HANYA service role): alamat aplikasi untuk pg_net, token pembangun, kunci VAPID bila env kosong
create table if not exists public.notif_config (
  id int primary key default 1 check (id = 1),
  app_url text,
  kick_token text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  vapid_public text,
  vapid_private text,
  last_kick_at timestamptz,
  last_run_at timestamptz,
  last_run jsonb,
  last_error text,
  last_error_at timestamptz
);
insert into public.notif_config(id) values (1) on conflict do nothing;
alter table public.notif_config enable row level security;
revoke all on public.notif_config from anon, authenticated;

-- ============================ Penerima ============================
-- Sama dengan member_can, untuk pengguna TERTENTU (bukan auth.uid())
create or replace function public.notif_member_ok(p_kos uuid, p_user uuid, p_areas text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when m.role = 'pemilik' then true
                when coalesce(p_areas, '') = '' then true
                when m.areas is not null and plan_has(p_kos, 'akses_modul')
                  then exists (select 1 from unnest(string_to_array(p_areas, ',')) a where a <> 'team' and a = any (m.areas))
                else role_allows(m.role, p_areas) end
    from kos_members m join kos k on k.id = m.kos_id
    where m.kos_id = p_kos and m.user_id = p_user and m.active and k.suspended_at is null), false);
$$;

create or replace function public.notif_targets(p_kos uuid, p_type text, p_area text, p_audience text, p_actor uuid, p_agg uuid, p_payload jsonb)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if p_audience = 'self' then
    return query select (p_payload->>'user_id')::uuid where nullif(p_payload->>'user_id', '') is not null
      and (p_kos is null or notif_member_ok(p_kos, (p_payload->>'user_id')::uuid, ''));
  elsif p_audience = 'requester' then
    return query select a.requested_by from approvals a where a.id = p_agg and a.requested_by is not null
      and a.requested_by is distinct from p_actor and notif_member_ok(p_kos, a.requested_by, '');
  elsif p_audience = 'assignee' then
    return query select t.assignee_user from prj_tasks t where t.id = nullif(p_payload->>'task_id', '')::uuid and t.assignee_user is not null
      and t.assignee_user is distinct from p_actor and notif_member_ok(p_kos, t.assignee_user, '');
  elsif p_audience = 'approver' then
    return query select m.user_id from kos_members m where m.kos_id = p_kos and m.active and m.user_id is distinct from p_actor
      and (m.role = 'pemilik' or m.can_approve) and notif_member_ok(p_kos, m.user_id, '');
  elsif p_audience = 'owner' then
    return query select m.user_id from kos_members m where m.kos_id = p_kos and m.active and m.role = 'pemilik' and m.user_id is distinct from p_actor;
  else
    return query select m.user_id from kos_members m where m.kos_id = p_kos and m.active and m.user_id is distinct from p_actor
      and notif_member_ok(p_kos, m.user_id, p_area);
  end if;
end $$;

-- Waktu kirim push setelah jam tenang (kritis tidak ditunda). Hari = hari mulainya jam tenang (ISO 1=Senin).
create or replace function public.notif_send_at(p_user uuid, p_priority text)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare q jsonb; tz text; loc timestamp; s time; e time; dur interval; d date; w0 timestamp;
begin
  if p_priority = 'kritis' then return now(); end if;
  select quiet into q from notif_user_settings where user_id = p_user;
  if q is null or coalesce((q->>'on')::boolean, false) is not true then return now(); end if;
  tz := coalesce(nullif(q->>'tz', ''), 'Asia/Jakarta');
  begin loc := now() at time zone tz; exception when others then tz := 'Asia/Jakarta'; loc := now() at time zone tz; end;
  s := (q->>'start')::time; e := (q->>'end')::time;
  if s = e then return now(); end if;
  dur := case when e > s then e - s else (e - s) + interval '24 hours' end;
  foreach d in array array[loc::date - 1, loc::date] loop
    w0 := d + s;
    if loc >= w0 and loc < w0 + dur and q->'days' @> to_jsonb(extract(isodow from d)::int) then
      return (w0 + dur) at time zone tz;
    end if;
  end loop;
  return now();
exception when others then return now();
end $$;

-- Bangunkan pengirim seketika lewat pg_net (bila terpasang & alamat sudah terdaftar). Tidak pernah melempar galat.
create or replace function public.notif_kick(p_reason text default 'antrean')
returns boolean language plpgsql security definer set search_path = public as $$
declare c notif_config;
begin
  if to_regproc('net.http_post') is null then return false; end if;
  select * into c from notif_config where id = 1;
  if c.app_url is null or c.app_url !~ '^https?://' then return false; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000)'
    using c.app_url || '/api/notif/kirim', jsonb_build_object('reason', p_reason),
          jsonb_build_object('Content-Type', 'application/json', 'x-notif-kick', c.kick_token);
  return true;
exception when others then return false;
end $$;

-- Satu kirim per pernyataan SQL (bukan per baris), dan tidak membangunkan lagi bila masih ada antrean baru yang belum diambil
create or replace function public.notif_queue_kick() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from new_rows where next_at <= now() + interval '5 seconds')
     and not exists (select 1 from notif_queue q where q.status = 'antre' and q.next_at <= now() and q.created_at > now() - interval '10 seconds'
                     and q.id not in (select id from new_rows)) then
    perform notif_kick('antrean');
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists notif_queue_kick on public.notif_queue;
create trigger notif_queue_kick after insert on public.notif_queue referencing new table as new_rows for each statement execute function public.notif_queue_kick();

-- ============================ Pembuat notifikasi ============================
-- Satu peristiwa → notifikasi untuk setiap penerima yang berhak. Kembali: jumlah notifikasi baru/diperbarui.
create or replace function public.notif_emit(p_kos uuid, p_type text, p_key text, p_area text, p_summary text, p_amount numeric,
                                             p_payload jsonb, p_actor uuid, p_agg_type text, p_agg uuid)
returns int language plpgsql security definer set search_path = public as $$
declare t notif_event_types; k kos; u uuid; v_area text; v_n int := 0; v_id uuid; v_link text; v_group text;
        g notif_items; v_pref jsonb; v_app boolean; v_push boolean; v_min text; v_new boolean;
begin
  select * into t from notif_event_types where code = p_type and active;
  if t.code is null then return 0; end if;
  if p_kos is not null then
    select * into k from kos where id = p_kos;
    if k.id is null or k.closed_at is not null or k.suspended_at is not null or coalesce(k.setup_status, 'active') <> 'active' then return 0; end if;
  end if;
  v_area := coalesce(t.area, p_area, '');
  v_link := replace(t.link, '{id}', coalesce(p_agg::text, ''));
  if not notif_link_ok(v_link) then v_link := '/pusat-notifikasi'; end if;

  for u in select distinct x from notif_targets(p_kos, p_type, v_area, t.audience, p_actor, p_agg, coalesce(p_payload, '{}')) x where x is not null loop
    -- preferensi: kritis selalu masuk kotak masuk; kategori lain bisa dimatikan
    v_pref := null; v_min := 'info';
    if p_kos is not null then select cats -> t.category, min_push into v_pref, v_min from notif_prefs where user_id = u and kos_id = p_kos; end if;
    v_app := t.priority = 'kritis' or coalesce((v_pref->>'app')::boolean, true);
    if not v_app then continue; end if;
    v_push := coalesce((v_pref->>'push')::boolean, t.push_default) and notif_rank(t.priority) >= notif_rank(coalesce(v_min, 'info'));

    v_new := true; v_id := null;
    v_group := case when t.group_minutes is not null then coalesce(p_kos::text, 'akun') || ':' || t.code end;
    if v_group is not null then
      select * into g from notif_items where user_id = u and group_key = v_group and read_at is null and archived_at is null
        and created_at > now() - make_interval(mins => t.group_minutes) order by created_at desc limit 1 for update;
      if g.id is not null then
        -- peristiwa yang sama persis tidak dihitung dua kali (kunci terakhir disimpan di event_key baris gabungan)
        if exists (select 1 from notif_items where user_id = u and event_key = p_type || ':' || p_key) then continue; end if;
        update notif_items set hits = g.hits + 1, event_key = p_type || ':' || p_key,
          title = coalesce(replace(t.title_many, '{n}', (g.hits + 1)::text), t.title),
          body = left(coalesce(p_summary, ''), 300),
          amount = case when p_amount is null and g.amount is null then null else coalesce(g.amount, 0) + coalesce(p_amount, 0) end,
          source_type = p_agg_type, source_id = p_agg, actor_id = p_actor, updated_at = now()
        where id = g.id;
        v_id := g.id; v_new := false;
      end if;
    end if;
    if v_new then
      insert into notif_items(user_id, kos_id, event_type, event_key, group_key, category, priority, title, body, amount, module, source_type, source_id, link, actor_id, expires_at)
      values (u, p_kos, p_type, p_type || ':' || p_key, v_group, t.category, t.priority, t.title, left(coalesce(p_summary, ''), 300), p_amount, t.module,
              p_agg_type, p_agg, v_link, p_actor, now() + case when t.priority = 'info' then interval '60 days' else interval '180 days' end)
      on conflict (user_id, event_key) do nothing returning id into v_id;
      if v_id is null then continue; end if;
    end if;
    v_n := v_n + 1;
    -- push hanya bila ada perangkat aktif; satu antrean per notifikasi gabungan (push berikutnya membawa isi terbaru)
    if v_push and exists (select 1 from push_subscriptions s where s.user_id = u and s.status = 'aktif' and s.enabled)
       and not exists (select 1 from notif_queue q where q.notif_id = v_id and (q.status in ('antre','proses') or q.created_at > now() - make_interval(mins => coalesce(t.group_minutes, 0)))) then
      insert into notif_queue(notif_id, user_id, next_at) values (v_id, u, notif_send_at(u, t.priority));
    end if;
  end loop;
  return v_n;
end $$;

-- Pembungkus aman: notifikasi TIDAK BOLEH menggagalkan transaksi bisnis
create or replace function public.notif_emit_safe(p_kos uuid, p_type text, p_key text, p_area text, p_summary text, p_amount numeric,
                                                  p_payload jsonb, p_actor uuid, p_agg_type text, p_agg uuid)
returns int language plpgsql security definer set search_path = public as $$
begin
  return notif_emit(p_kos, p_type, p_key, p_area, p_summary, p_amount, p_payload, p_actor, p_agg_type, p_agg);
exception when others then
  begin update notif_config set last_error = left(p_type || ': ' || sqlerrm, 500), last_error_at = now() where id = 1; exception when others then null; end;
  return 0;
end $$;
revoke execute on function public.notif_emit(uuid, text, text, text, text, numeric, jsonb, uuid, text, uuid),
  public.notif_emit_safe(uuid, text, text, text, text, numeric, jsonb, uuid, text, uuid),
  public.notif_targets(uuid, text, text, text, uuid, uuid, jsonb), public.notif_member_ok(uuid, uuid, text),
  public.notif_send_at(uuid, text), public.notif_kick(text) from public, anon, authenticated;

-- Peristiwa domain (outbox) → notifikasi. Per PERNYATAAN (transition table): impor/aksi massal = satu pemicu.
create or replace function public.notif_from_events() returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  for e in select r.* from new_rows r join notif_event_types t on t.code = r.event_type and t.active order by r.id loop
    perform notif_emit_safe(e.kos_id, e.event_type, e.idempotency_key, e.area, e.summary, e.amount, e.payload, e.actor_id, e.aggregate_type, e.aggregate_id);
  end loop;
  return null;
exception when others then return null;
end $$;
drop trigger if exists notif_from_events on public.domain_events;
create trigger notif_from_events after insert on public.domain_events referencing new table as new_rows for each statement execute function public.notif_from_events();

-- ---------- Sumber langsung (bukan domain_events) ----------
-- Stok menipis/habis: hanya saat MELEWATI batas (bukan setiap penjualan), paling banyak sekali per barang per hari
create or replace function public.notif_stock() returns trigger language plpgsql security definer set search_path = public as $$
declare v_day text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD');
begin
  if not new.active or coalesce(new.is_kit, false) then return null; end if;
  if new.stock <= 0 and old.stock > 0 then
    perform notif_emit_safe(new.kos_id, 'StockOut', new.id::text || ':' || v_day, 'stock', new.name || ' habis', null, '{}', null, 'product', new.id);
  elsif new.min_stock > 0 and new.stock <= new.min_stock and old.stock > new.min_stock and new.stock > 0 then
    perform notif_emit_safe(new.kos_id, 'StockLow', new.id::text || ':' || v_day, 'stock',
      new.name || ' tersisa ' || trim(to_char(new.stock, 'FM999999990.###')) || ' ' || coalesce(new.base_unit, ''), null, '{}', null, 'product', new.id);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists notif_stock on public.products;
create trigger notif_stock after update of stock on public.products for each row when (new.stock is distinct from old.stock) execute function public.notif_stock();

-- Prospek dari halaman bisnis / webhook (dibuat server tanpa pengguna)
create or replace function public.notif_leads() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    perform notif_emit_safe(new.kos_id, 'LeadCreated', new.id::text, 'sell,rent,ops',
      coalesce(new.number || ' · ', '') || coalesce(nullif(new.name, ''), 'Calon pelanggan') || coalesce(' · ' || left(nullif(new.need, ''), 80), ''), null, '{}', null, 'lead', new.id);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists notif_leads on public.crm_leads;
create trigger notif_leads after insert on public.crm_leads for each row execute function public.notif_leads();

create or replace function public.notif_maint() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'penghuni' then
    perform notif_emit_safe(new.kos_id, 'IssueReported', new.id::text, 'rent', coalesce(new.number || ' · ', '') || new.title, null, '{}', null, 'ticket', new.id);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists notif_maint on public.maint_tickets;
create trigger notif_maint after insert on public.maint_tickets for each row execute function public.notif_maint();

create or replace function public.notif_resv() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'portal' then
    perform notif_emit_safe(new.kos_id, 'ReservationRequested', new.id::text, 'sell',
      coalesce(new.number || ' · ', '') || new.name || ' · ' || new.party || ' orang · ' || to_char(new.starts_at at time zone 'Asia/Jakarta', 'DD/MM HH24:MI'), null, '{}', null, 'reservation', new.id);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists notif_resv on public.kul_reservations;
create trigger notif_resv after insert on public.kul_reservations for each row execute function public.notif_resv();

create or replace function public.notif_offline() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('perlu_cek', 'gagal') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform notif_emit_safe(new.kos_id, 'OfflineSaleReview', new.id::text || ':' || new.status, 'finance',
      case new.status when 'gagal' then 'Penjualan offline gagal dicatat' else 'Penjualan offline tersimpan, perlu dicek' end, new.total, '{}', new.user_id, 'pos_offline', new.id);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists notif_offline on public.pos_offline;
create trigger notif_offline after insert or update of status on public.pos_offline for each row execute function public.notif_offline();

-- Keamanan: hak akses karyawan berubah / dinonaktifkan → beri tahu orangnya
create or replace function public.notif_member_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'pemilik' or auth.uid() = new.user_id then return null; end if;
  if (new.role, new.areas, new.perms, new.can_approve, new.active) is distinct from (old.role, old.areas, old.perms, old.can_approve, old.active) then
    perform notif_emit_safe(case when new.active then new.kos_id else null end, 'TeamAccessChanged',
      new.kos_id::text || ':' || new.user_id::text || ':' || extract(epoch from clock_timestamp())::text, '',
      case when not new.active then 'Akses Anda ke ' || coalesce((select name from kos where id = new.kos_id), 'bisnis') || ' dinonaktifkan pemilik.'
           else 'Peran atau modul Anda di ' || coalesce((select name from kos where id = new.kos_id), 'bisnis') || ' diubah pemilik.' end,
      null, jsonb_build_object('user_id', new.user_id), auth.uid(), 'member', null);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists notif_member_change on public.kos_members;
create trigger notif_member_change after update on public.kos_members for each row execute function public.notif_member_change();

-- ============================ RPC pengguna ============================
create or replace function public.notif_row(n notif_items, p_kosname text)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', n.id, 'kos_id', n.kos_id, 'kos_name', p_kosname, 'type', n.event_type, 'category', n.category, 'priority', n.priority,
    'title', n.title, 'body', n.body, 'amount', n.amount, 'n', n.hits, 'module', n.module, 'link', n.link, 'at', n.updated_at, 'created_at', n.created_at,
    'read', n.read_at is not null, 'archived', n.archived_at is not null);
$$;

-- Hanya notifikasi yang masih boleh dibaca: penerima = saya, dan (akun) atau saya masih anggota aktif bisnis itu
create or replace function public.notif_visible(n notif_items) returns boolean language sql stable security definer set search_path = public as $$
  select n.user_id = auth.uid() and n.expires_at > now()
    and (n.kos_id is null or exists (select 1 from kos_members m where m.kos_id = n.kos_id and m.user_id = auth.uid() and m.active));
$$;

create or replace function public.notif_list(p_kos uuid, p_cat text default null, p_unread boolean default false, p_q text default null,
                                             p_before timestamptz default null, p_limit int default 30, p_archived boolean default false, p_all boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  return coalesce((select jsonb_agg(notif_row(x.it, x.kn) order by (x.it).updated_at desc) from (
    select n as it, k.name as kn from notif_items n left join kos k on k.id = n.kos_id
    where n.user_id = auth.uid() and notif_visible(n)
      and (p_all or n.kos_id is null or n.kos_id = p_kos)
      and (p_cat is null or p_cat = '' or n.category = p_cat)
      and (not p_unread or n.read_at is null)
      and ((p_archived and n.archived_at is not null) or (not p_archived and n.archived_at is null))
      and (p_before is null or n.updated_at < p_before)
      and (v_q is null or n.title ilike '%' || v_q || '%' or n.body ilike '%' || v_q || '%' or n.module ilike '%' || v_q || '%')
    order by n.updated_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100)) x), '[]');
end $$;

create or replace function public.notif_counts(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return '{"unread":0,"unread_all":0,"by_cat":{}}'; end if;
  return (select jsonb_build_object(
      'unread', coalesce(sum(cnt) filter (where here), 0),
      'unread_all', coalesce(sum(cnt), 0),
      'by_cat', coalesce(jsonb_object_agg(category, cnt) filter (where here), '{}'))
    from (select n.category, (n.kos_id is null or n.kos_id = p_kos) as here, count(*) cnt
          from notif_items n where n.user_id = auth.uid() and n.read_at is null and n.archived_at is null and notif_visible(n)
          group by 1, 2) s);
end $$;

create or replace function public.notif_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare n notif_items; v jsonb;
begin
  select * into n from notif_items where id = p_id;
  if n.id is null or not notif_visible(n) then raise exception 'Notifikasi tidak ditemukan'; end if;
  v := notif_row(n, (select name from kos where id = n.kos_id));
  return v || jsonb_build_object('opened', n.opened_at is not null,
    'push', (select jsonb_build_object('status', q.status, 'devices', q.devices, 'sent_at', q.sent_at, 'next_at', q.next_at)
             from notif_queue q where q.notif_id = n.id order by q.id desc limit 1));
end $$;

create or replace function public.notif_mark(p_ids uuid[], p_read boolean default true)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  update notif_items set read_at = case when p_read then coalesce(read_at, now()) else null end
  where id = any (coalesce(p_ids, '{}')) and user_id = auth.uid();
  get diagnostics v = row_count; return v;
end $$;

create or replace function public.notif_mark_all(p_kos uuid, p_cat text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  update notif_items set read_at = now() where user_id = auth.uid() and read_at is null and archived_at is null
    and (kos_id is null or kos_id = p_kos) and (p_cat is null or p_cat = '' or category = p_cat);
  get diagnostics v = row_count; return v;
end $$;

create or replace function public.notif_archive(p_ids uuid[], p_archive boolean default true)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  update notif_items set archived_at = case when p_archive then now() else null end, read_at = coalesce(read_at, case when p_archive then now() end)
  where id = any (coalesce(p_ids, '{}')) and user_id = auth.uid();
  get diagnostics v = row_count; return v;
end $$;

create or replace function public.notif_delete(p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  delete from notif_items where id = any (coalesce(p_ids, '{}')) and user_id = auth.uid();
  get diagnostics v = row_count; return v;
end $$;

-- Dibuka dari push / daftar: tandai dibaca + dibuka, kembalikan tujuan dari DATABASE (bukan dari URL → tanpa open redirect)
create or replace function public.notif_open(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n notif_items;
begin
  select * into n from notif_items where id = p_id;
  if n.id is null or not notif_visible(n) then return jsonb_build_object('link', '/pusat-notifikasi', 'kos_id', null); end if;
  update notif_items set read_at = coalesce(read_at, now()), opened_at = coalesce(opened_at, now()) where id = n.id;
  return jsonb_build_object('link', n.link, 'kos_id', n.kos_id);
end $$;

-- Pengaturan: kategori yang relevan untuk bisnis & peran ini (dari katalog), preferensi, jam tenang, perangkat
create or replace function public.notif_settings_get(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s notif_user_settings; p notif_prefs;
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  if p_kos is not null and not exists (select 1 from kos_members where kos_id = p_kos and user_id = auth.uid() and active) then raise exception 'Bukan anggota bisnis ini'; end if;
  select * into s from notif_user_settings where user_id = auth.uid();
  select * into p from notif_prefs where user_id = auth.uid() and kos_id = p_kos;
  return jsonb_build_object(
    'quiet', coalesce(s.quiet, '{"on": false, "start": "22:00", "end": "07:00", "days": [1,2,3,4,5,6,7], "tz": "Asia/Jakarta"}'::jsonb),
    'sound', coalesce(s.sound, true), 'vibrate', coalesce(s.vibrate, true), 'hide_amount', coalesce(s.hide_amount, true),
    'cats', coalesce(p.cats, '{}'), 'min_push', coalesce(p.min_push, 'info'),
    'catalog', (select coalesce(jsonb_agg(jsonb_build_object('code', t.code, 'category', t.category, 'priority', t.priority, 'title', t.title, 'push', t.push_default, 'module', t.module) order by t.category, t.code), '[]')
                from notif_event_types t where t.active and t.code <> 'TestPush'
                  and (t.audience in ('self','requester','assignee','approver') or p_kos is null or notif_member_ok(p_kos, auth.uid(), coalesce(t.area, '')))),
    'devices', (select count(*) from push_subscriptions where user_id = auth.uid() and status = 'aktif' and enabled));
end $$;

create or replace function public.notif_settings_set(p_kos uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q jsonb := p_data->'quiet'; c jsonb := p_data->'cats'; k text; v jsonb; clean jsonb := '{}';
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  if q is not null then
    if coalesce(q->>'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(q->>'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Jam tenang harus berformat JJ:MM'; end if;
    if jsonb_typeof(q->'days') <> 'array' or exists (select 1 from jsonb_array_elements(q->'days') d where jsonb_typeof(d) <> 'number' or d::int not between 1 and 7) then raise exception 'Hari jam tenang tidak sah'; end if;
    if not exists (select 1 from pg_timezone_names where name = coalesce(q->>'tz', 'Asia/Jakarta')) then raise exception 'Zona waktu tidak dikenal'; end if;
    q := jsonb_build_object('on', coalesce((q->>'on')::boolean, false), 'start', q->>'start', 'end', q->>'end',
      'days', (select coalesce(jsonb_agg(distinct d::int order by d::int), '[]') from jsonb_array_elements(q->'days') d), 'tz', coalesce(q->>'tz', 'Asia/Jakarta'));
  end if;
  insert into notif_user_settings(user_id) values (auth.uid()) on conflict do nothing;
  update notif_user_settings set quiet = coalesce(q, quiet),
    sound = coalesce((p_data->>'sound')::boolean, sound), vibrate = coalesce((p_data->>'vibrate')::boolean, vibrate),
    hide_amount = coalesce((p_data->>'hide_amount')::boolean, hide_amount), updated_at = now()
  where user_id = auth.uid();
  if p_kos is not null and (c is not null or p_data ? 'min_push') then
    if not exists (select 1 from kos_members where kos_id = p_kos and user_id = auth.uid() and active) then raise exception 'Bukan anggota bisnis ini'; end if;
    if coalesce(p_data->>'min_push', 'info') not in ('kritis','tinggi','normal','info') then raise exception 'Prioritas tidak dikenal'; end if;
    if c is not null then
      if jsonb_typeof(c) <> 'object' then raise exception 'Format kategori tidak sah'; end if;
      for k, v in select * from jsonb_each(c) loop
        if k not in ('aktivitas','penjualan','pembelian','keuangan','inventaris','karyawan','pelanggan','pengingat','sistem') then raise exception 'Kategori tidak dikenal: %', k; end if;
        clean := clean || jsonb_build_object(k, jsonb_build_object('app', coalesce((v->>'app')::boolean, true), 'push', (v->>'push')::boolean));
      end loop;
    end if;
    insert into notif_prefs(user_id, kos_id, cats, min_push) values (auth.uid(), p_kos, clean, coalesce(p_data->>'min_push', 'info'))
    on conflict (user_id, kos_id) do update set cats = case when c is null then notif_prefs.cats else excluded.cats end,
      min_push = coalesce(p_data->>'min_push', notif_prefs.min_push), updated_at = now();
  end if;
  return notif_settings_get(p_kos);
end $$;

create or replace function public.push_devices()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'device_id', device_id, 'label', label, 'platform', platform, 'browser', browser, 'installed', installed,
    'enabled', enabled, 'status', status, 'created_at', created_at, 'last_seen_at', last_seen_at, 'last_success_at', last_success_at,
    'last_failure_at', last_failure_at, 'fail_count', fail_count) order by last_seen_at desc), '[]')
  from push_subscriptions where user_id = auth.uid() and status <> 'dicabut';
$$;

create or replace function public.push_device_set(p_id uuid, p_enabled boolean, p_label text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update push_subscriptions set enabled = coalesce(p_enabled, enabled),
    label = coalesce(nullif(left(trim(coalesce(p_label, '')), 60), ''), label), updated_at = now()
  where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Perangkat tidak ditemukan'; end if;
end $$;

create or replace function public.push_device_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from push_subscriptions where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Perangkat tidak ditemukan'; end if;
end $$;

-- Kirim notifikasi uji ke perangkat sendiri (maks. 5 per jam)
create or replace function public.notif_test()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v int; d int;
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  select count(*) into d from push_subscriptions where user_id = auth.uid() and status = 'aktif' and enabled;
  if d = 0 then raise exception 'Belum ada perangkat aktif. Aktifkan notifikasi di perangkat ini dulu.'; end if;
  if (select count(*) from notif_items where user_id = auth.uid() and event_type = 'TestPush' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Uji notifikasi maksimal 5 kali per jam. Coba lagi nanti.';
  end if;
  v := notif_emit(null, 'TestPush', auth.uid()::text || ':' || extract(epoch from clock_timestamp())::text, '',
    'Jika pesan ini muncul, notifikasi PRASARA sudah aktif di ' || d || ' perangkat Anda.', null, jsonb_build_object('user_id', auth.uid()), null, 'test', null);
  -- uji selalu dikirim seketika (tanpa jam tenang)
  update notif_queue q set next_at = now() from notif_items n where q.notif_id = n.id and n.user_id = auth.uid() and n.event_type = 'TestPush' and q.status = 'antre';
  return jsonb_build_object('created', v, 'devices', d);
end $$;

revoke execute on function public.notif_list(uuid, text, boolean, text, timestamptz, int, boolean, boolean), public.notif_counts(uuid), public.notif_get(uuid),
  public.notif_mark(uuid[], boolean), public.notif_mark_all(uuid, text), public.notif_archive(uuid[], boolean), public.notif_delete(uuid[]), public.notif_open(uuid),
  public.notif_settings_get(uuid), public.notif_settings_set(uuid, jsonb), public.push_devices(), public.push_device_set(uuid, boolean, text),
  public.push_device_delete(uuid), public.notif_test() from public, anon;
grant execute on function public.notif_list(uuid, text, boolean, text, timestamptz, int, boolean, boolean), public.notif_counts(uuid), public.notif_get(uuid),
  public.notif_mark(uuid[], boolean), public.notif_mark_all(uuid, text), public.notif_archive(uuid[], boolean), public.notif_delete(uuid[]), public.notif_open(uuid),
  public.notif_settings_get(uuid), public.notif_settings_set(uuid, jsonb), public.push_devices(), public.push_device_set(uuid, boolean, text),
  public.push_device_delete(uuid), public.notif_test() to authenticated;
revoke execute on function public.notif_visible(notif_items), public.notif_row(notif_items, text) from public, anon;

-- ============================ RPC server (service role) ============================
-- Simpan/ganti langganan perangkat. Kunci perangkat SUDAH dienkripsi server. Maks. 10 perangkat aktif per akun (tertua dicabut).
create or replace function public.push_sub_save(p_user uuid, p_endpoint text, p_keys_enc text, p_app_key text, p_device text,
                                                p_label text, p_platform text, p_browser text, p_installed boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_new boolean := false; v_old uuid;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'Pengguna tidak dikenal'; end if;
  -- endpoint sama = perangkat sama (bisa pindah akun di perangkat yang sama → pemilik endpoint ikut pindah)
  select id into v_old from push_subscriptions where endpoint = p_endpoint;
  -- satu perangkat (device_id) satu langganan per akun: endpoint lama perangkat ini diganti
  delete from push_subscriptions where user_id = p_user and device_id = p_device and endpoint <> p_endpoint;
  insert into push_subscriptions(user_id, device_id, endpoint, keys_enc, app_key, label, platform, browser, installed)
  values (p_user, p_device, p_endpoint, p_keys_enc, p_app_key, left(coalesce(nullif(trim(p_label), ''), 'Perangkat'), 60),
          left(coalesce(p_platform, 'lainnya'), 20), left(coalesce(p_browser, 'lainnya'), 20), coalesce(p_installed, false))
  on conflict (endpoint) do update set user_id = excluded.user_id, device_id = excluded.device_id, keys_enc = excluded.keys_enc, app_key = excluded.app_key,
    label = case when push_subscriptions.user_id = excluded.user_id then push_subscriptions.label else excluded.label end,
    platform = excluded.platform, browser = excluded.browser, installed = excluded.installed,
    enabled = case when push_subscriptions.user_id = excluded.user_id then push_subscriptions.enabled else true end,
    status = 'aktif', fail_count = 0, last_error = null, last_seen_at = now(), updated_at = now()
  returning id, (xmax = 0) into v_id, v_new;
  -- cabut yang melebihi 10 perangkat aktif
  update push_subscriptions set status = 'dicabut', updated_at = now()
  where user_id = p_user and status = 'aktif' and id in (select id from push_subscriptions where user_id = p_user and status = 'aktif' order by last_seen_at desc offset 10);
  if v_new and v_old is null then
    -- keamanan: perangkat baru → beri tahu (juga menjadi bukti push sampai di perangkat ini)
    perform notif_emit_safe(null, 'DeviceAdded', v_id::text, '', left(coalesce(nullif(trim(p_label), ''), 'Perangkat'), 60) || ' sekarang menerima notifikasi PRASARA. Bukan Anda? Hapus perangkat ini di Perangkat terhubung.',
      null, jsonb_build_object('user_id', p_user), null, 'device', v_id);
  end if;
  return jsonb_build_object('id', v_id, 'new', v_new and v_old is null);
end $$;

-- pushsubscriptionchange dari service worker (tanpa sesi): hanya bila endpoint lama memang terdaftar
create or replace function public.push_sub_rotate(p_old text, p_endpoint text, p_keys_enc text, p_app_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update push_subscriptions set endpoint = p_endpoint, keys_enc = p_keys_enc, app_key = p_app_key, status = 'aktif', fail_count = 0, updated_at = now(), last_seen_at = now()
  where endpoint = p_old and status <> 'dicabut' and not exists (select 1 from push_subscriptions x where x.endpoint = p_endpoint);
  return found;
end $$;

create or replace function public.push_sub_remove(p_user uuid, p_endpoint text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from push_subscriptions where user_id = p_user and endpoint = p_endpoint;
  return found;
end $$;

-- Perangkat masih ada & milik akun ini? (status di layar Pengaturan) + tandai terakhir aktif
create or replace function public.push_sub_check(p_user uuid, p_endpoint text, p_installed boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s push_subscriptions;
begin
  update push_subscriptions set last_seen_at = now(), installed = coalesce(p_installed, installed)
  where user_id = p_user and endpoint = p_endpoint and last_seen_at < now() - interval '10 minutes';
  select * into s from push_subscriptions where user_id = p_user and endpoint = p_endpoint;
  if s.id is null then return jsonb_build_object('known', false); end if;
  return jsonb_build_object('known', true, 'id', s.id, 'enabled', s.enabled, 'status', s.status, 'app_key', s.app_key, 'last_success_at', s.last_success_at);
end $$;

-- Ambil antrean yang sudah waktunya (SKIP LOCKED: aman dijalankan bersamaan). Klaim kedaluwarsa 2 menit (pengirim mati = diambil ulang).
create or replace function public.notif_claim(p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  -- tidak perlu dikirim lagi: sudah dibaca di aplikasi, terlalu lama, penerima bukan anggota lagi, atau tidak ada perangkat
  update notif_queue q set status = 'dilewati', last_error = 'sudah dibaca'
    from notif_items n where n.id = q.notif_id and q.status = 'antre' and q.next_at <= now() and n.read_at is not null and n.priority <> 'kritis';
  update notif_queue q set status = 'kedaluwarsa', last_error = 'terlalu lama'
    where q.status in ('antre','proses') and q.next_at <= now() and q.created_at < now() - interval '24 hours';
  with c as (
    select q.id from notif_queue q
    where (q.status = 'antre' and q.next_at <= now()) or (q.status = 'proses' and q.claimed_at < now() - interval '2 minutes')
    order by q.next_at limit least(greatest(coalesce(p_limit, 100), 1), 500) for update skip locked
  ), u as (
    update notif_queue q set status = 'proses', claimed_at = now(), attempts = q.attempts + 1 from c where q.id = c.id returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'queue_id', u.id, 'notif_id', n.id, 'attempts', u.attempts, 'priority', n.priority, 'title', n.title, 'body', n.body, 'amount', n.amount,
      'n', n.hits, 'link', n.link, 'kos_id', n.kos_id, 'kos_name', k.name, 'category', n.category, 'tag', coalesce(n.group_key, n.id::text),
      'hide_amount', coalesce(st.hide_amount, true), 'vibrate', coalesce(st.vibrate, true),
      'unread', (select count(*) from notif_items x where x.user_id = n.user_id and x.read_at is null and x.archived_at is null),
      'member_ok', n.kos_id is null or exists (select 1 from kos_members m where m.kos_id = n.kos_id and m.user_id = n.user_id and m.active),
      'subs', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'keys', s.keys_enc, 'app_key', s.app_key)), '[]')
               from push_subscriptions s where s.user_id = n.user_id and s.status = 'aktif' and s.enabled))), '[]')
  into v
  from u join notif_items n on n.id = u.notif_id left join kos k on k.id = n.kos_id left join notif_user_settings st on st.user_id = n.user_id;
  return v;
end $$;

-- Hasil pengiriman. results = [{queue_id, outcome: terkirim|ulang|gagal|dilewati, error, subs:[{id, status: diterima|gagal|kedaluwarsa|ditunda, http, error}]}]
create or replace function public.notif_report(p_results jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; s jsonb; q notif_queue; v_ok int; v_sent int := 0; v_retry int := 0; v_fail int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_results, '[]')) loop
    select * into q from notif_queue where id = (r->>'queue_id')::bigint for update;
    if q.id is null or q.status <> 'proses' then continue; end if;
    v_ok := 0;
    for s in select * from jsonb_array_elements(coalesce(r->'subs', '[]')) loop
      insert into notif_deliveries(queue_id, notif_id, subscription_id, status, http_status, error)
      values (q.id, q.notif_id, (s->>'id')::uuid, s->>'status', nullif(s->>'http', '')::int, left(s->>'error', 300));
      if s->>'status' = 'diterima' then
        v_ok := v_ok + 1;
        update push_subscriptions set last_success_at = now(), fail_count = 0, last_error = null where id = (s->>'id')::uuid;
      elsif s->>'status' = 'kedaluwarsa' then
        update push_subscriptions set status = 'kedaluwarsa', last_failure_at = now(), last_error = left(s->>'error', 300), updated_at = now() where id = (s->>'id')::uuid;
      else
        update push_subscriptions set fail_count = fail_count + 1, last_failure_at = now(), last_error = left(s->>'error', 300),
          status = case when fail_count + 1 >= 20 and last_success_at is null or fail_count + 1 >= 50 then 'kedaluwarsa' else status end, updated_at = now()
        where id = (s->>'id')::uuid;
      end if;
    end loop;
    if r->>'outcome' = 'ulang' and q.attempts < 5 then
      -- mundur eksponensial: 1, 4, 16, 64 menit
      update notif_queue set status = 'antre', next_at = now() + make_interval(mins => power(4, q.attempts - 1)::int), devices = devices + v_ok,
        last_error = left(r->>'error', 300) where id = q.id;
      v_retry := v_retry + 1;
    elsif r->>'outcome' in ('terkirim') or v_ok > 0 then
      update notif_queue set status = 'terkirim', sent_at = now(), devices = devices + v_ok, last_error = left(r->>'error', 300) where id = q.id;
      v_sent := v_sent + 1;
    elsif r->>'outcome' = 'dilewati' then
      update notif_queue set status = 'dilewati', last_error = left(r->>'error', 300) where id = q.id;
    else
      update notif_queue set status = 'gagal', last_error = left(coalesce(r->>'error', 'gagal'), 300) where id = q.id;
      v_fail := v_fail + 1;
    end if;
  end loop;
  return jsonb_build_object('terkirim', v_sent, 'ulang', v_retry, 'gagal', v_fail);
end $$;

-- Alamat aplikasi (untuk pg_net) & catatan jalannya pengirim
create or replace function public.notif_config_get()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('app_url', app_url, 'kick_token', kick_token, 'vapid_public', vapid_public, 'vapid_private', vapid_private) from notif_config where id = 1;
$$;
create or replace function public.notif_config_set(p_app_url text, p_run jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update notif_config set app_url = case when p_app_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then p_app_url else app_url end,
    last_run_at = case when p_run is not null then now() else last_run_at end, last_run = coalesce(p_run, last_run)
  where id = 1;
end $$;
-- Kunci VAPID cadangan (bila env server kosong): dibuat SEKALI, tidak pernah ditimpa
create or replace function public.notif_vapid_init(p_public text, p_private text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update notif_config set vapid_public = p_public, vapid_private = p_private where id = 1 and vapid_public is null
    and p_public ~ '^[A-Za-z0-9_-]{80,100}$' and p_private ~ '^[A-Za-z0-9_-]{40,50}$';
  return (select jsonb_build_object('vapid_public', vapid_public, 'vapid_private', vapid_private) from notif_config where id = 1);
end $$;

-- pg_cron (tiap menit): bangunkan pengirim HANYA bila ada antrean yang jatuh tempo (jam tenang selesai, ulangi, klaim macet)
create or replace function public.notif_cron_kick()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from notif_queue where (status = 'antre' and next_at <= now()) or (status = 'proses' and claimed_at < now() - interval '2 minutes')) then
    return notif_kick('jadwal');
  end if;
  return false;
end $$;

-- Pengingat harian (cron pagi): satu notifikasi per bisnis per hari, hanya bila ada isinya
create or replace function public.notif_daily_tick()
returns jsonb language plpgsql security definer set search_path = public as $$
declare k record; v_day text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD'); v_t date := (now() at time zone 'Asia/Jakarta')::date;
        n_over int; n_today int; amt numeric; n_late int; v_made int := 0;
begin
  for k in select id, business_type from kos where closed_at is null and suspended_at is null and coalesce(setup_status, 'active') = 'active' loop
    begin
      if k.business_type = 'properti' then
        select count(*) filter (where overdue), count(*) filter (where due_date = v_t and not overdue), sum(outstanding)
          into n_over, n_today, amt from invoice_summary where kos_id = k.id and status <> 'batal' and outstanding > 0 and (overdue or due_date = v_t);
        if coalesce(n_over, 0) + coalesce(n_today, 0) > 0 then
          v_made := v_made + notif_emit(k.id, 'ReminderInvoicesDue', v_day, 'rent',
            concat_ws(' · ', case when n_today > 0 then n_today || ' jatuh tempo hari ini' end, case when n_over > 0 then n_over || ' lewat jatuh tempo' end), amt, '{}', null, 'kos', k.id);
        end if;
      elsif k.business_type = 'jasa' then
        select count(*) into n_late from svc_orders where kos_id = k.id and status not in ('selesai', 'batal', 'permintaan') and voided_at is null and due_at < now();
        if n_late > 0 then
          v_made := v_made + notif_emit(k.id, 'ReminderOrdersLate', v_day, 'sell,ops', n_late || ' pesanan belum selesai melewati janji', null, '{}', null, 'kos', k.id);
        end if;
      end if;
    exception when others then null;
    end;
  end loop;
  return jsonb_build_object('dibuat', v_made);
end $$;

-- Retensi: notifikasi kedaluwarsa, antrean & log lama, perangkat mati
create or replace function public.notif_purge()
returns jsonb language plpgsql security definer set search_path = public as $$
declare a int; b int; c int; d int;
begin
  delete from notif_items where expires_at < now(); get diagnostics a = row_count;
  delete from notif_queue where status not in ('antre','proses') and created_at < now() - interval '14 days'; get diagnostics b = row_count;
  delete from notif_deliveries where at < now() - interval '14 days'; get diagnostics c = row_count;
  delete from push_subscriptions where status <> 'aktif' and updated_at < now() - interval '30 days'; get diagnostics d = row_count;
  return jsonb_build_object('notifikasi', a, 'antrean', b, 'log', c, 'perangkat', d);
end $$;

revoke execute on function public.push_sub_save(uuid, text, text, text, text, text, text, text, boolean), public.push_sub_rotate(text, text, text, text),
  public.push_sub_remove(uuid, text), public.push_sub_check(uuid, text, boolean), public.notif_claim(int), public.notif_report(jsonb),
  public.notif_config_get(), public.notif_config_set(text, jsonb), public.notif_vapid_init(text, text), public.notif_cron_kick(),
  public.notif_daily_tick(), public.notif_purge() from public, anon, authenticated;
grant execute on function public.push_sub_save(uuid, text, text, text, text, text, text, text, boolean), public.push_sub_rotate(text, text, text, text),
  public.push_sub_remove(uuid, text), public.push_sub_check(uuid, text, boolean), public.notif_claim(int), public.notif_report(jsonb),
  public.notif_config_get(), public.notif_config_set(text, jsonb), public.notif_vapid_init(text, text), public.notif_cron_kick(),
  public.notif_daily_tick(), public.notif_purge() to service_role;

-- ============================ Admin platform (angka saja, tanpa isi notifikasi) ============================
create or replace function public.admin_notif_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cron boolean := false;
begin
  if not coalesce(admin_can('system.view'), false) then raise exception 'Tidak punya izin'; end if;
  if to_regclass('cron.job') is not null then
    begin execute 'select exists (select 1 from cron.job where jobname = ''prasara-notif'')' into v_cron; exception when others then v_cron := false; end;
  end if;
  return jsonb_build_object(
    'dibuat_7h', (select count(*) from notif_items where created_at > now() - interval '7 days'),
    'antre', (select count(*) from notif_queue where status = 'antre'),
    'antre_jatuh_tempo', (select count(*) from notif_queue where status = 'antre' and next_at <= now()),
    'proses', (select count(*) from notif_queue where status = 'proses'),
    'antrean_7h', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from notif_queue where created_at > now() - interval '7 days' group by status) s),
    'kirim_7h', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from notif_deliveries where at > now() - interval '7 days' group by status) s),
    'perangkat_aktif', (select count(*) from push_subscriptions where status = 'aktif' and enabled),
    'akun_perangkat', (select count(distinct user_id) from push_subscriptions where status = 'aktif' and enabled),
    'per_browser', (select coalesce(jsonb_object_agg(k, n), '{}') from (select platform || ' · ' || browser k, count(*) n from push_subscriptions where status = 'aktif' group by 1) s),
    'pwa', (select count(*) from push_subscriptions where status = 'aktif' and installed),
    'pg_net', to_regproc('net.http_post') is not null,
    'pg_cron', v_cron,
    'alamat_terdaftar', (select app_url is not null from notif_config where id = 1),
    'kunci_vapid_db', (select vapid_public is not null from notif_config where id = 1),
    'jalan_terakhir', (select last_run_at from notif_config where id = 1),
    'hasil_terakhir', (select last_run from notif_config where id = 1),
    'galat_terakhir', (select case when last_error_at > now() - interval '7 days' then jsonb_build_object('at', last_error_at, 'pesan', last_error) end from notif_config where id = 1));
end $$;
revoke execute on function public.admin_notif_overview() from public, anon;
grant execute on function public.admin_notif_overview() to authenticated;

-- ============================ Penjadwal (pg_net + pg_cron, bila tersedia) ============================
-- Keduanya ekstensi bawaan Supabase (gratis). Bila tidak bisa dipasang, migrasi TETAP lanjut: notifikasi dalam aplikasi
-- berjalan normal; push dikirim saat cron harian / saat pengguna mengirim uji (status jujur di Admin › Status sistem).
do $$ begin
  begin create extension if not exists pg_net; exception when others then raise notice 'pg_net tidak tersedia: %', sqlerrm; end;
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron tidak tersedia: %', sqlerrm; end;
  begin
    if to_regproc('cron.schedule') is not null then
      perform cron.schedule('prasara-notif', '* * * * *', 'select public.notif_cron_kick()');
    end if;
  exception when others then raise notice 'jadwal pg_cron tidak dibuat: %', sqlerrm;
  end;
end $$;
