-- Automatic Business Setup & Owner Confirmation (tahap 1)
-- Pendaftaran multi-kategori → draf bisnis per kategori → item konfigurasi (DRAFT / NEEDS_INFORMATION / PENDING_OWNER_CONFIRMATION /
-- APPROVED / ACTIVE / REJECTED / PAUSED) → pemilik menyetujui → aktivasi hanya untuk yang disetujui.
-- Bisnis lama tetap 'active'. Template tidak mengarang harga/kapasitas/jumlah karyawan: semua menunggu isian pemilik.

-- ================= Kategori, subkategori, template (bisa diatur Super Admin) =================
create table if not exists public.biz_templates (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null,
  engine text not null check (engine in ('properti', 'retail', 'jasa', 'kustom')),
  spec jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create table if not exists public.biz_categories (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null check (length(trim(name)) between 2 and 60),
  icon text not null default '🏢',
  description text,
  engine text not null check (engine in ('properti', 'retail', 'jasa', 'kustom')),
  template text not null references public.biz_templates(code),
  group_code text not null default 'lainnya',
  note text,                                   -- mis. "Mesin kuliner dalam rencana"
  sort int not null default 0,
  active boolean not null default true
);
create table if not exists public.biz_subcategories (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  category_code text not null references public.biz_categories(code) on update cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  engine text check (engine in ('properti', 'retail', 'jasa', 'kustom')),
  template text references public.biz_templates(code),
  note text,
  sort int not null default 0,
  active boolean not null default true
);
alter table public.biz_templates enable row level security;
alter table public.biz_categories enable row level security;
alter table public.biz_subcategories enable row level security;
drop policy if exists biz_categories_read on public.biz_categories;
create policy biz_categories_read on public.biz_categories for select using (true);
drop policy if exists biz_subcategories_read on public.biz_subcategories;
create policy biz_subcategories_read on public.biz_subcategories for select using (true);
drop policy if exists biz_templates_read on public.biz_templates;
create policy biz_templates_read on public.biz_templates for select using (true);
grant select on public.biz_categories, public.biz_subcategories, public.biz_templates to anon, authenticated;

-- Template. Item umum (alamat, WhatsApp) ditambahkan fungsi; di sini item khusus jenis usaha.
-- input: text | longtext | phone | hours | multi | choice | number | service | rooms | delivery | stages | gudang | builder | pending
-- must: approve (wajib disetujui) | decide (wajib diputuskan: setujui/tunda/tolak) | optional
insert into public.biz_templates(code, name, engine, spec) values
('kos', 'Kos & sewa kamar', 'properti', $j${
  "questions": [{"key": "room_count", "label": "Jumlah kamar", "type": "number", "placeholder": "mis. 10"}, {"key": "prefix", "label": "Awalan nomor kamar", "type": "text", "placeholder": "A → A01, A02"}],
  "items": [
    {"code": "kamar", "kind": "info", "label": "Kamar & harga sewa", "help": "Jumlah kamar, awalan nomor, dan harga sewa per bulan. Harga bisa dibedakan per kamar setelah aktif.", "input": "rooms", "must": "approve", "apply": "rooms"},
    {"code": "fasilitas", "kind": "info", "label": "Fasilitas kamar", "input": "multi", "choices": ["WiFi", "AC", "Kipas angin", "Kamar mandi dalam", "Kasur", "Lemari", "Meja", "Parkir motor", "Dapur bersama", "Listrik token"], "must": "optional", "apply": "rooms_facilities"},
    {"code": "aturan_bayar", "kind": "info", "label": "Aturan pembayaran", "help": "Mis. bayar paling lambat tanggal 5, deposit 1 bulan.", "input": "longtext", "must": "optional", "apply": "profile.payment_rules"},
    {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS", "E-wallet"], "must": "optional", "apply": "profile.payment_methods"}
  ],
  "modules": ["p_pengeluaran", "p_pengingat", "p_perbaikan", "p_booking", "u_crm", "u_halaman", "u_akuntansi"],
  "portal": true
}$j$::jsonb),
('toko', 'Toko eceran & grosir', 'retail', $j${
  "questions": [{"key": "sales_mode", "label": "Cara berjualan", "type": "choice", "choices": [["Eceran", "Eceran"], ["Grosir", "Grosir"], ["Eceran & grosir", "Eceran & grosir"]]}, {"key": "hours", "label": "Jam buka", "type": "text", "placeholder": "mis. 06.00–21.00"}],
  "items": [
    {"code": "jam", "kind": "info", "label": "Jam buka", "input": "hours", "must": "approve", "prefill": "hours", "apply": "profile.hours"},
    {"code": "cara_jual", "kind": "info", "label": "Cara berjualan", "input": "choice", "choices": ["Eceran", "Grosir", "Eceran & grosir"], "must": "approve", "prefill": "sales_mode", "apply": "profile.sales_mode"},
    {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS", "E-wallet", "Kasbon (bayar nanti)"], "must": "optional", "apply": "profile.payment_methods"},
    {"code": "gudang", "kind": "info", "label": "Lokasi gudang", "help": "Punya gudang terpisah dari toko? Isi namanya agar stok bisa dicatat per lokasi.", "input": "gudang", "must": "optional", "apply": "branches_gudang"}
  ],
  "after": [["produk", "Barang & satuan", "/barang"], ["harga", "Harga jual & harga beli", "/barang"], ["stok", "Stok awal", "/barang"], ["supplier", "Supplier", "/kontak"]],
  "modules": ["r_belanja", "r_kontak", "r_label", "r_pengingat", "u_crm", "u_halaman", "u_akuntansi"],
  "portal": true
}$j$::jsonb),
('laundry', 'Laundry', 'jasa', $j${
  "questions": [
    {"key": "services", "label": "Layanan yang tersedia", "type": "multi", "choices": [["kiloan", "Laundry kiloan"], ["cuci_setrika", "Cuci & setrika"], ["setrika", "Setrika saja"], ["satuan", "Satuan (bed cover, selimut, jas)"], ["sepatu", "Cuci sepatu"]]},
    {"key": "hours", "label": "Jam operasional", "type": "text", "placeholder": "mis. 08.00–20.00"},
    {"key": "delivery", "label": "Melayani antar jemput?", "type": "yesno"}
  ],
  "services": {
    "kiloan": {"name": "Laundry kiloan", "unit": "kg", "category": "Kiloan", "description": "Cuci, kering, lipat"},
    "cuci_setrika": {"name": "Cuci & setrika", "unit": "kg", "category": "Kiloan", "description": "Cuci, kering, setrika, lipat"},
    "setrika": {"name": "Setrika saja", "unit": "kg", "category": "Kiloan", "description": "Pakaian sudah bersih, hanya disetrika"},
    "satuan": {"name": "Bed cover / selimut", "unit": "pcs", "category": "Satuan", "description": "Dihitung per potong"},
    "sepatu": {"name": "Cuci sepatu", "unit": "pasang", "category": "Satuan", "description": "Dihitung per pasang"}
  },
  "items": [
    {"code": "jam", "kind": "info", "label": "Jam operasional", "input": "hours", "must": "approve", "prefill": "hours", "apply": "profile.hours"},
    {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS", "E-wallet"], "must": "approve", "apply": "profile.payment_methods"},
    {"code": "alur", "kind": "alur", "label": "Tahap proses pesanan", "help": "Urutan kerja setiap pesanan. Bisa diubah di Layanan & tahap.", "input": "stages", "must": "approve", "default": {"stages": ["Cuci", "Kering", "Setrika", "Cek kualitas", "Kemas"]}, "apply": "stages"},
    {"code": "kapasitas", "kind": "info", "label": "Kapasitas harian", "help": "Perkiraan berat cucian yang sanggup dikerjakan per hari (kg).", "input": "number", "unit": "kg/hari", "must": "optional", "apply": "profile.capacity_per_day"},
    {"code": "jml_karyawan", "kind": "info", "label": "Jumlah karyawan", "input": "number", "unit": "orang", "min": 0, "must": "optional", "apply": "profile.staff_count"},
    {"code": "kebijakan", "kind": "info", "label": "Kebijakan komplain & kehilangan", "help": "Mis. komplain maksimal 1x24 jam; ganti rugi kehilangan maks 10x ongkos cuci.", "input": "longtext", "must": "optional", "apply": "profile.complaint_policy"},
    {"code": "logo", "kind": "info", "label": "Logo", "help": "Unggah logo tersedia bersama portal pemesanan (tahap berikutnya).", "input": "pending", "must": "optional", "apply": "none"}
  ],
  "modules": ["j_bahan", "r_kontak", "u_crm", "u_halaman", "u_akuntansi"],
  "portal": true
}$j$::jsonb),
('jasa_umum', 'Jasa umum', 'jasa', $j${
  "questions": [{"key": "hours", "label": "Jam operasional", "type": "text", "placeholder": "mis. 08.00–17.00"}, {"key": "delivery", "label": "Melayani antar jemput / datang ke lokasi?", "type": "yesno"}],
  "services": {},
  "items": [
    {"code": "jam", "kind": "info", "label": "Jam operasional", "input": "hours", "must": "approve", "prefill": "hours", "apply": "profile.hours"},
    {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS", "E-wallet"], "must": "approve", "apply": "profile.payment_methods"},
    {"code": "alur", "kind": "alur", "label": "Tahap proses pesanan", "input": "stages", "must": "approve", "default": {"stages": ["Dikerjakan", "Dicek"]}, "apply": "stages"},
    {"code": "kebijakan", "kind": "info", "label": "Kebijakan komplain & garansi", "input": "longtext", "must": "optional", "apply": "profile.complaint_policy"}
  ],
  "modules": ["r_kontak", "u_crm", "u_halaman", "u_akuntansi"],
  "portal": true
}$j$::jsonb),
('bengkel', 'Bengkel (Business Builder)', 'kustom', $j${
  "questions": [{"key": "hours", "label": "Jam buka", "type": "text", "placeholder": "mis. 08.00–17.00"}],
  "builder": "bengkel",
  "items": [
    {"code": "jam", "kind": "info", "label": "Jam buka", "input": "hours", "must": "approve", "prefill": "hours", "apply": "profile.hours"},
    {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS", "E-wallet"], "must": "optional", "apply": "profile.payment_methods"}
  ],
  "modules": ["u_akuntansi"]
}$j$::jsonb),
('salon', 'Salon & perawatan (Business Builder)', 'kustom', $j${
  "questions": [{"key": "hours", "label": "Jam buka", "type": "text", "placeholder": "mis. 09.00–20.00"}],
  "builder": "salon",
  "items": [
    {"code": "jam", "kind": "info", "label": "Jam buka", "input": "hours", "must": "approve", "prefill": "hours", "apply": "profile.hours"},
    {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS", "E-wallet"], "must": "optional", "apply": "profile.payment_methods"}
  ],
  "modules": ["u_akuntansi"]
}$j$::jsonb),
('kosong', 'Susun sendiri (Business Builder)', 'kustom', $j${
  "questions": [{"key": "hours", "label": "Jam operasional", "type": "text", "placeholder": "opsional"}],
  "builder": "kosong",
  "items": [
    {"code": "jam", "kind": "info", "label": "Jam operasional", "input": "hours", "must": "optional", "prefill": "hours", "apply": "profile.hours"},
    {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS", "E-wallet"], "must": "optional", "apply": "profile.payment_methods"}
  ],
  "modules": ["u_akuntansi"]
}$j$::jsonb)
on conflict (code) do nothing;

insert into public.biz_categories(code, name, icon, description, engine, template, group_code, note, sort) values
  ('retail', 'Retail & Perdagangan', '🛒', 'Toko sembako, minimarket, grosir, toko bangunan', 'retail', 'toko', 'retail_trading', null, 1),
  ('properti', 'Properti & Hunian', '🏠', 'Kos, kontrakan, homestay', 'properti', 'kos', 'property_rental', null, 2),
  ('laundry', 'Laundry & Jasa Rumah Tangga', '🧺', 'Laundry, dry clean, cuci sepatu, jasa kebersihan', 'jasa', 'laundry', 'services', null, 3),
  ('kuliner', 'Kuliner & Hospitality', '🍽️', 'Restoran, warung, kafe, katering', 'kustom', 'kosong', 'fnb_hospitality', 'Mesin kuliner khusus (menu, meja, dapur) dalam rencana. Sementara disusun dengan Business Builder.', 4),
  ('distribusi', 'Distribusi & Logistik', '🚚', 'Distributor, agen, ekspedisi', 'retail', 'toko', 'distribution', null, 5),
  ('manufaktur', 'Manufaktur & Produksi', '🏭', 'Produksi makanan, konveksi, kerajinan', 'kustom', 'kosong', 'manufacturing', 'Mesin produksi khusus dalam rencana. Sementara disusun dengan Business Builder.', 6),
  ('profesional', 'Jasa Profesional', '💼', 'Konsultan, desain, servis elektronik, percetakan', 'jasa', 'jasa_umum', 'professional_admin', null, 7),
  ('kesehatan', 'Kesehatan & Kecantikan', '💇', 'Salon, barbershop, klinik, spa', 'kustom', 'salon', 'services', null, 8),
  ('pendidikan', 'Pendidikan & Pelatihan', '🎓', 'Bimbel, kursus, pelatihan', 'kustom', 'kosong', 'lainnya', 'Disusun dengan Business Builder.', 9),
  ('event', 'Event & Hiburan', '🎉', 'Event organizer, wedding organizer, sewa alat, studio', 'kustom', 'kosong', 'project_event', 'Disusun dengan Business Builder.', 10),
  ('otomotif', 'Otomotif', '🔧', 'Bengkel motor/mobil, cuci kendaraan, suku cadang', 'kustom', 'bengkel', 'services', null, 11),
  ('pertanian', 'Pertanian & Peternakan', '🌾', 'Pertanian, peternakan, toko tani', 'kustom', 'kosong', 'lainnya', 'Disusun dengan Business Builder.', 12),
  ('konstruksi', 'Konstruksi & Proyek', '🏗️', 'Kontraktor, renovasi, material', 'kustom', 'kosong', 'project_event', 'Disusun dengan Business Builder.', 13),
  ('travel', 'Travel & Pariwisata', '✈️', 'Agen travel, rental kendaraan, wisata', 'kustom', 'kosong', 'fnb_hospitality', 'Disusun dengan Business Builder.', 14),
  ('lainnya', 'Organisasi & Lainnya', '🧩', 'Komunitas, yayasan, koperasi, usaha lain', 'kustom', 'kosong', 'lainnya', 'Disusun dengan Business Builder.', 15)
on conflict (code) do nothing;

insert into public.biz_subcategories(code, category_code, name, engine, template, note, sort) values
  ('retail_sembako', 'retail', 'Toko sembako', null, null, null, 1), ('retail_minimarket', 'retail', 'Minimarket', null, null, null, 2),
  ('retail_grosir', 'retail', 'Grosir', null, null, null, 3), ('retail_bangunan', 'retail', 'Toko bangunan', null, null, null, 4),
  ('retail_pakaian', 'retail', 'Toko pakaian', null, null, null, 5), ('retail_lain', 'retail', 'Toko lainnya', null, null, null, 9),
  ('properti_kos', 'properti', 'Kos', null, null, null, 1), ('properti_kontrakan', 'properti', 'Kontrakan', null, null, null, 2),
  ('properti_homestay', 'properti', 'Homestay / guest house', null, null, null, 3),
  ('laundry_laundry', 'laundry', 'Laundry', null, null, null, 1), ('laundry_dryclean', 'laundry', 'Dry clean', null, null, null, 2),
  ('laundry_sepatu', 'laundry', 'Cuci sepatu & tas', null, 'jasa_umum', null, 3), ('laundry_kebersihan', 'laundry', 'Jasa kebersihan', null, 'jasa_umum', null, 4),
  ('laundry_jahit', 'laundry', 'Jahit & permak', null, 'jasa_umum', null, 5),
  ('kuliner_restoran', 'kuliner', 'Restoran', null, null, null, 1), ('kuliner_warung', 'kuliner', 'Warung makan', null, null, null, 2),
  ('kuliner_kafe', 'kuliner', 'Kafe', null, null, null, 3), ('kuliner_katering', 'kuliner', 'Katering', null, null, null, 4),
  ('kuliner_penginapan', 'kuliner', 'Penginapan', 'properti', 'kos', null, 5),
  ('distribusi_distributor', 'distribusi', 'Distributor', null, null, null, 1), ('distribusi_agen', 'distribusi', 'Agen', null, null, null, 2),
  ('distribusi_ekspedisi', 'distribusi', 'Ekspedisi / kurir', 'kustom', 'kosong', 'Disusun dengan Business Builder.', 3),
  ('manufaktur_makanan', 'manufaktur', 'Produksi makanan', null, null, null, 1), ('manufaktur_konveksi', 'manufaktur', 'Konveksi', null, null, null, 2),
  ('manufaktur_kerajinan', 'manufaktur', 'Kerajinan', null, null, null, 3),
  ('profesional_konsultan', 'profesional', 'Konsultan', null, null, null, 1), ('profesional_desain', 'profesional', 'Desain & kreatif', null, null, null, 2),
  ('profesional_servis', 'profesional', 'Servis elektronik', null, null, null, 3), ('profesional_cetak', 'profesional', 'Percetakan', null, null, null, 4),
  ('profesional_foto', 'profesional', 'Fotografi', null, null, null, 5),
  ('kesehatan_salon', 'kesehatan', 'Salon & barbershop', null, null, null, 1), ('kesehatan_spa', 'kesehatan', 'Spa & pijat', null, null, null, 2),
  ('kesehatan_klinik', 'kesehatan', 'Klinik / praktik', 'kustom', 'kosong', 'Disusun dengan Business Builder.', 3),
  ('kesehatan_apotek', 'kesehatan', 'Apotek / toko obat', 'retail', 'toko', null, 4),
  ('pendidikan_bimbel', 'pendidikan', 'Bimbel / les', null, null, null, 1), ('pendidikan_kursus', 'pendidikan', 'Kursus & pelatihan', null, null, null, 2),
  ('event_eo', 'event', 'Event organizer', null, null, null, 1), ('event_wo', 'event', 'Wedding organizer', null, null, null, 2),
  ('event_sewa', 'event', 'Sewa alat & perlengkapan', null, null, null, 3),
  ('otomotif_motor', 'otomotif', 'Bengkel motor', null, null, null, 1), ('otomotif_mobil', 'otomotif', 'Bengkel mobil', null, null, null, 2),
  ('otomotif_cuci', 'otomotif', 'Cuci kendaraan', 'jasa', 'jasa_umum', null, 3), ('otomotif_sparepart', 'otomotif', 'Toko suku cadang', 'retail', 'toko', null, 4),
  ('pertanian_tani', 'pertanian', 'Pertanian', null, null, null, 1), ('pertanian_ternak', 'pertanian', 'Peternakan', null, null, null, 2),
  ('pertanian_toko', 'pertanian', 'Toko pertanian', 'retail', 'toko', null, 3),
  ('konstruksi_kontraktor', 'konstruksi', 'Kontraktor', null, null, null, 1), ('konstruksi_renovasi', 'konstruksi', 'Renovasi', null, null, null, 2),
  ('konstruksi_material', 'konstruksi', 'Toko material', 'retail', 'toko', null, 3),
  ('travel_agen', 'travel', 'Agen travel', null, null, null, 1), ('travel_rental', 'travel', 'Rental kendaraan', null, null, null, 2),
  ('travel_penginapan', 'travel', 'Penginapan', 'properti', 'kos', null, 3),
  ('lainnya_komunitas', 'lainnya', 'Komunitas / organisasi', null, null, null, 1), ('lainnya_koperasi', 'lainnya', 'Koperasi', null, null, null, 2),
  ('lainnya_lain', 'lainnya', 'Lainnya', null, null, null, 9)
on conflict (code) do nothing;

-- ================= Status bisnis & item konfigurasi =================
alter table public.kos add column if not exists setup_status text not null default 'active';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kos_setup_status_check') then
    alter table public.kos add constraint kos_setup_status_check check (setup_status in ('draft', 'needs_information', 'pending_owner_confirmation', 'approved', 'active', 'rejected', 'paused'));
  end if;
end $$;
alter table public.kos add column if not exists category_code text references public.biz_categories(code) on update cascade;
alter table public.kos add column if not exists subcategory_code text references public.biz_subcategories(code) on update cascade;
alter table public.kos add column if not exists template_code text references public.biz_templates(code) on update cascade;
alter table public.kos add column if not exists setup_meta jsonb not null default '{}';   -- status usaha, hubungan, cabang, jawaban awal
alter table public.kos add column if not exists activated_at timestamptz;

create table if not exists public.setup_items (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,50}$'),
  kind text not null check (kind in ('info', 'layanan', 'alur', 'modul', 'portal')),
  label text not null,
  help text,
  input text not null,
  spec jsonb not null default '{}',           -- pilihan, satuan, cara menerapkan, dsb.
  must text not null default 'optional' check (must in ('approve', 'decide', 'optional')),
  value jsonb not null default '{}',
  complete boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'needs_information', 'pending_owner_confirmation', 'approved', 'active', 'rejected', 'paused')),
  sort int not null default 0,
  note text,
  updated_by text not null default 'sistem',
  updated_at timestamptz not null default now(),
  unique (kos_id, code)
);
alter table public.setup_items enable row level security;
drop policy if exists setup_items_select on public.setup_items;
create policy setup_items_select on public.setup_items for select using (public.member_can(kos_id, 'settings'));
grant select on public.setup_items to authenticated;
drop trigger if exists zz_kos_open_guard on public.setup_items;
create trigger zz_kos_open_guard before insert or update or delete on public.setup_items for each row execute function public.kos_open_guard();

-- Bisnis yang belum aktif: hanya konfigurasi yang boleh ditulis (operasional menunggu aktivasi)
create or replace function public.kos_open_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kos uuid := coalesce(case when tg_op = 'DELETE' then null else new.kos_id end, old.kos_id); v_closed timestamptz; v_setup text;
begin
  if auth.uid() is not null then
    select closed_at, setup_status into v_closed, v_setup from kos where id = v_kos;
    if v_closed is not null then
      raise exception 'Bisnis ini sudah ditutup (arsip hanya-baca). Pemilik bisa membukanya kembali di Pengaturan.';
    end if;
    if v_setup is not null and v_setup <> 'active' and coalesce(current_setting('prasara.setup_ok', true), '') <> '1'
       and tg_table_name not in ('setup_items', 'bb_workspace', 'bb_objects', 'bb_fields', 'bb_statuses', 'bb_transitions', 'bb_reports', 'public_pages', 'branches', 'cf_fields', 'expense_categories') then
      raise exception 'Bisnis ini masih draf. Selesaikan dan aktifkan di Pusat Konfirmasi terlebih dahulu.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- Kolom status hanya diubah lewat fungsi setup
create or replace function public.kos_setup_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('prasara.setup_ok', true), '') <> '1'
     and (new.setup_status, new.activated_at, new.category_code, new.subcategory_code, new.template_code, new.setup_meta)
         is distinct from (old.setup_status, old.activated_at, old.category_code, old.subcategory_code, old.template_code, old.setup_meta) then
    raise exception 'Status setup hanya bisa diubah lewat Pusat Konfirmasi';
  end if;
  return new;
end $$;
drop trigger if exists kos_setup_guard on public.kos;
create trigger kos_setup_guard before update on public.kos for each row execute function public.kos_setup_guard();

-- ================= Validasi isian item (server = sumber kebenaran) =================
create or replace function public.setup_num(p jsonb)
returns numeric language plpgsql immutable as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) = 'number' then return (p #>> '{}')::numeric; end if;
  if jsonb_typeof(p) = 'string' and trim(p #>> '{}') ~ '^[0-9]+([.,][0-9]+)?$' then return replace(trim(p #>> '{}'), ',', '.')::numeric; end if;
  if jsonb_typeof(p) = 'string' and trim(p #>> '{}') = '' then return null; end if;
  raise exception 'Isi angka yang benar';
end $$;

-- mengembalikan {value: bersih, complete: bool}
create or replace function public.setup_clean(p_input text, p_spec jsonb, p jsonb, p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb := '{}'; t text; n numeric; a text[]; ok boolean := false; s jsonb;
begin
  p := coalesce(p, '{}');
  if p_input in ('text', 'longtext', 'hours') then
    t := left(trim(coalesce(p->>'v', '')), case when p_input = 'longtext' then 1000 else 200 end);
    v := jsonb_build_object('v', t); ok := length(t) >= 2;
  elsif p_input = 'phone' then
    t := regexp_replace(coalesce(p->>'v', ''), '[^0-9+]', '', 'g');
    if t <> '' and length(regexp_replace(t, '\D', '', 'g')) not between 9 and 15 then raise exception 'Nomor WhatsApp 9–15 angka'; end if;
    v := jsonb_build_object('v', t); ok := t <> '';
  elsif p_input = 'multi' then
    select coalesce(array_agg(distinct x), '{}') into a from jsonb_array_elements_text(case when jsonb_typeof(p->'v') = 'array' then p->'v' else '[]' end) x
      where x in (select jsonb_array_elements_text(p_spec->'choices'));
    v := jsonb_build_object('v', to_jsonb(a)); ok := cardinality(a) > 0;
  elsif p_input = 'choice' then
    t := p->>'v';
    if t is not null and t <> '' and not exists (select 1 from jsonb_array_elements_text(p_spec->'choices') c where c = t) then raise exception 'Pilihan tidak dikenal'; end if;
    v := jsonb_build_object('v', nullif(t, '')); ok := coalesce(t, '') <> '';
  elsif p_input = 'number' then
    n := setup_num(p->'v');
    if n is not null and (n < coalesce((p_spec->>'min')::numeric, 1) or n > 100000) then raise exception 'Angka di luar batas wajar'; end if;
    v := jsonb_build_object('v', n); ok := n is not null;
  elsif p_input = 'service' then
    t := left(trim(coalesce(p->>'name', '')), 80);
    if length(t) < 2 then raise exception 'Isi nama layanan'; end if;
    n := setup_num(p->'price');
    if n is not null and n <= 0 then raise exception 'Harga harus lebih dari 0 (kosongkan bila belum ditentukan)'; end if;
    v := jsonb_build_object('name', t, 'unit', left(coalesce(nullif(trim(p->>'unit'), ''), 'kg'), 20), 'price', n,
      'hours', setup_num(p->'hours'), 'min_qty', coalesce(setup_num(p->'min_qty'), 0),
      'category', left(nullif(trim(coalesce(p->>'category', '')), ''), 40), 'description', left(nullif(trim(coalesce(p->>'description', '')), ''), 300),
      'requirements', left(nullif(trim(coalesce(p->>'requirements', '')), ''), 300), 'svc_id', p->'svc_id');
    if (v->>'hours') is not null and (v->>'hours')::numeric not between 1 and 720 then raise exception 'Estimasi pengerjaan 1–720 jam'; end if;
    if (v->>'min_qty')::numeric < 0 then raise exception 'Minimal tidak boleh minus'; end if;
    ok := n is not null and (v->>'hours') is not null;
  elsif p_input = 'rooms' then
    n := setup_num(p->'count');
    if n is not null and (n < 1 or n > 300 or n <> trunc(n)) then raise exception 'Jumlah kamar 1–300'; end if;
    t := upper(left(regexp_replace(coalesce(p->>'prefix', 'A'), '[^A-Za-z0-9]', '', 'g'), 3));
    v := jsonb_build_object('count', n, 'prefix', coalesce(nullif(t, ''), 'A'), 'price', setup_num(p->'price'));
    if (v->>'price')::numeric <= 0 then raise exception 'Harga sewa harus lebih dari 0'; end if;
    ok := n is not null and (v->>'price') is not null;
  elsif p_input = 'delivery' then
    n := setup_num(p->'fee');
    if n is not null and n < 0 then raise exception 'Biaya tidak boleh minus'; end if;
    v := jsonb_build_object('areas', left(trim(coalesce(p->>'areas', '')), 300), 'fee', n, 'schedule', left(trim(coalesce(p->>'schedule', '')), 200));
    ok := length(v->>'areas') >= 2 and length(v->>'schedule') >= 2 and n is not null;
  elsif p_input = 'stages' then
    select coalesce(jsonb_agg(left(trim(x), 40)), '[]') into s from jsonb_array_elements_text(case when jsonb_typeof(p->'stages') = 'array' then p->'stages' else '[]' end) x where length(trim(x)) >= 2;
    if jsonb_array_length(s) > 12 then raise exception 'Maksimal 12 tahap'; end if;
    v := jsonb_build_object('stages', s); ok := jsonb_array_length(s) >= 1;
  elsif p_input = 'gudang' then
    v := jsonb_build_object('ada', coalesce((p->>'ada')::boolean, false), 'name', left(trim(coalesce(p->>'name', '')), 60));
    ok := (p ? 'ada') and (not (v->>'ada')::boolean or length(v->>'name') >= 2);
  elsif p_input = 'builder' then
    v := '{}'; ok := exists (select 1 from bb_workspace where kos_id = p_kos and status = 'aktif');
  elsif p_input in ('module', 'portal') then
    v := coalesce(p, '{}'); ok := true;
  elsif p_input = 'pending' then
    v := '{}'; ok := false;
  else
    raise exception 'Jenis isian tidak dikenal';
  end if;
  return jsonb_build_object('value', v, 'complete', ok);
end $$;

-- ================= Membuat item dari template =================
create or replace function public.setup_add_item(p_kos uuid, p_code text, p_kind text, p_label text, p_help text, p_input text, p_spec jsonb, p_must text, p_value jsonb, p_sort int)
returns void language plpgsql security definer set search_path = public as $$
declare c jsonb;
begin
  begin
    c := setup_clean(p_input, p_spec, p_value, p_kos);
  exception when others then
    c := setup_clean(p_input, p_spec, '{}', p_kos); -- jawaban awal tidak valid: biarkan kosong untuk diisi pemilik
  end;
  insert into setup_items(kos_id, code, kind, label, help, input, spec, must, value, complete, status, sort)
  values (p_kos, p_code, p_kind, p_label, p_help, p_input, coalesce(p_spec, '{}'), p_must, c->'value', (c->>'complete')::boolean,
          case when (c->>'complete')::boolean then 'draft' else 'needs_information' end, p_sort)
  on conflict (kos_id, code) do nothing;
end $$;

create or replace function public.setup_generate(p_kos uuid)
returns void language plpgsql security definer set search_path = public as $$
declare k kos; tp biz_templates; ans jsonb; it jsonb; i int := 0; sv text; m modules; v_reco text[];
begin
  select * into k from kos where id = p_kos;
  select * into tp from biz_templates where code = k.template_code;
  ans := coalesce(k.setup_meta->'answers', '{}');
  perform setup_add_item(p_kos, 'alamat', 'info', 'Alamat lengkap', 'Dipakai di nota, halaman bisnis, dan untuk pelanggan.', 'text', '{"apply": "kos.address"}', 'approve', jsonb_build_object('v', coalesce(k.setup_meta->>'location', k.address, '')), 1);
  perform setup_add_item(p_kos, 'wa', 'info', 'Nomor WhatsApp bisnis', 'Untuk pelanggan menghubungi Anda.', 'phone', '{"apply": "kos.contact_phone"}', 'approve', jsonb_build_object('v', coalesce(k.contact_phone, '')), 2);
  i := 10;
  for it in select * from jsonb_array_elements(coalesce(tp.spec->'items', '[]')) loop
    i := i + 1;
    perform setup_add_item(p_kos, it->>'code', it->>'kind', it->>'label', it->>'help', it->>'input', it - 'code' - 'kind' - 'label' - 'help' - 'input' - 'must' - 'default', it->>'must',
      case when it ? 'prefill' then jsonb_build_object('v', ans->(it->>'prefill'))
           when it->>'input' = 'rooms' then jsonb_build_object('count', ans->'room_count', 'prefix', coalesce(ans->>'prefix', 'A'))
           else coalesce(it->'default', '{}') end, i);
  end loop;
  -- layanan yang dipilih pemilik (tanpa harga & estimasi: menunggu isian pemilik)
  i := 40;
  for sv in select jsonb_array_elements_text(case when jsonb_typeof(ans->'services') = 'array' then ans->'services' else '[]' end) loop
    if tp.spec->'services' ? sv then
      i := i + 1;
      perform setup_add_item(p_kos, 'layanan_' || sv, 'layanan', tp.spec->'services'->sv->>'name', 'Isi harga per satuan dan estimasi pengerjaan. Harga tidak diisi otomatis.', 'service',
        '{"apply": "service"}', 'decide', tp.spec->'services'->sv, i);
    end if;
  end loop;
  if k.business_type = 'jasa' and coalesce((ans->>'delivery')::boolean, false) then
    perform setup_add_item(p_kos, 'antar_jemput', 'layanan', 'Antar jemput', 'Tentukan wilayah yang dilayani, jadwal, dan biaya. Wilayah di luar daftar tidak dianggap terlayani.', 'delivery',
      '{"apply": "delivery"}', 'decide', '{}', 60);
  end if;
  if tp.spec ? 'builder' then
    perform setup_add_item(p_kos, 'builder', 'alur', 'Data & alur kerja (Business Builder)', 'Sesuaikan jenis data, formulir, status, dan laporan, lalu Validasi & aktifkan di Business Builder.', 'builder', '{"apply": "none", "link": "/builder"}', 'approve', '{}', 61);
  end if;
  -- modul opsional: yang disarankan template diberi tanda; semua menunggu keputusan pemilik
  select coalesce(array_agg(x), '{}') into v_reco from jsonb_array_elements_text(coalesce(tp.spec->'modules', '[]')) x;
  i := 70;
  for m in select * from modules where k.business_type = any(applies_to) and not core and status = 'available' order by sort loop
    i := i + 1;
    perform setup_add_item(p_kos, 'modul_' || m.code, 'modul', m.name, m.description, 'module',
      jsonb_build_object('apply', 'module', 'module', m.code, 'depends_on', to_jsonb(m.depends_on), 'entitlement', m.entitlement), 'optional',
      jsonb_build_object('recommended', m.code = any(v_reco)), i);
  end loop;
  if coalesce((tp.spec->>'portal')::boolean, false) then
    perform setup_add_item(p_kos, 'portal', 'portal', 'Halaman bisnis untuk pelanggan (draf)', 'Disiapkan sebagai draf, tidak langsung terbit. Anda meninjau dan menerbitkannya sendiri di Halaman bisnis.', 'portal',
      '{"apply": "portal", "needs_module": "u_halaman"}', 'optional', '{}', 90);
  end if;
end $$;

-- Status bisnis dihitung dari item (untuk bisnis yang belum aktif)
create or replace function public.setup_refresh(p_kos uuid)
returns text language plpgsql security definer set search_path = public as $$
declare k kos; v text; v_need boolean; v_pend boolean; v_svc boolean;
begin
  select * into k from kos where id = p_kos;
  if k.setup_status in ('active', 'rejected', 'paused') then return k.setup_status; end if;
  -- item builder mengikuti status Business Builder
  update setup_items set complete = exists (select 1 from bb_workspace where kos_id = p_kos and status = 'aktif'),
    status = case when exists (select 1 from bb_workspace where kos_id = p_kos and status = 'aktif') then 'approved' else 'needs_information' end
  where kos_id = p_kos and input = 'builder' and status <> 'active';
  select bool_or(not complete and must = 'approve') or bool_or(not complete and must = 'decide' and status not in ('rejected', 'paused')),
         bool_or(must = 'approve' and status <> 'approved') or bool_or(must = 'decide' and status not in ('approved', 'rejected', 'paused'))
    into v_need, v_pend from setup_items where kos_id = p_kos;
  v_svc := k.business_type <> 'jasa' or exists (select 1 from setup_items where kos_id = p_kos and kind = 'layanan' and input = 'service' and status = 'approved');
  v := case when coalesce(v_need, false) or not v_svc and not exists (select 1 from setup_items where kos_id = p_kos and input = 'service' and complete) then 'needs_information'
            when coalesce(v_pend, false) or not v_svc then 'pending_owner_confirmation'
            else 'approved' end;
  if v is distinct from k.setup_status then
    perform set_config('prasara.setup_ok', '1', true);
    update kos set setup_status = v where id = p_kos;
  end if;
  return v;
end $$;

-- ================= Pendaftaran: buat draf bisnis =================
create or replace function public.setup_create(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare c biz_categories; s biz_subcategories; v_engine text; v_tpl text; v_id uuid; v_name text := trim(coalesce(p->>'name', '')); v_rel text := coalesce(p->>'relation', 'pemilik');
        v_stage text := coalesce(p->>'stage', 'berjalan'); v_br int; tp biz_templates; ans jsonb := coalesce(p->'answers', '{}');
begin
  if auth.uid() is null then raise exception 'Harus login terlebih dahulu'; end if;
  if v_rel = 'karyawan' then raise exception 'Karyawan bergabung lewat undangan: minta pemilik bisnis menambahkan email Anda di menu Karyawan.'; end if;
  if v_rel not in ('pemilik', 'pengelola', 'perwakilan', 'baru') then raise exception 'Pilih hubungan Anda dengan bisnis ini'; end if;
  if v_stage not in ('berjalan', 'baru', 'dikembangkan') then raise exception 'Pilih status bisnis'; end if;
  if length(v_name) not between 2 and 80 then raise exception 'Nama bisnis 2–80 huruf'; end if;
  select * into c from biz_categories where code = p->>'category' and active;
  if c.code is null then raise exception 'Kategori tidak dikenal'; end if;
  if coalesce(p->>'subcategory', '') <> '' then
    select * into s from biz_subcategories where code = p->>'subcategory' and category_code = c.code and active;
    if s.code is null then raise exception 'Subkategori tidak dikenal'; end if;
  end if;
  v_br := coalesce(setup_num(p->'branches'), 0)::int;
  if v_br < 0 or v_br > 100 then raise exception 'Jumlah cabang 0–100'; end if;
  if (select count(*) from kos where owner_id = auth.uid() and setup_status not in ('active')) >= 10 then raise exception 'Terlalu banyak draf bisnis. Selesaikan atau tolak draf yang ada dulu.'; end if;
  v_engine := coalesce(s.engine, c.engine); v_tpl := coalesce(s.template, case when s.engine is not null and s.engine <> c.engine then null end, c.template);
  select * into tp from biz_templates where code = v_tpl;
  if tp.code is null or tp.engine <> v_engine then raise exception 'Template kategori belum diatur dengan benar. Hubungi admin.'; end if;
  if v_engine = 'properti' and (setup_num(ans->'room_count') is not null and setup_num(ans->'room_count') not between 1 and 300) then raise exception 'Jumlah kamar 1–300'; end if;

  perform set_config('prasara.setup_ok', '1', true);
  insert into kos(name, address, owner_id, business_type, business_groups, setup_status, category_code, subcategory_code, template_code, setup_meta)
  values (v_name, nullif(left(trim(coalesce(p->>'location', '')), 200), ''), auth.uid(), v_engine, array[c.group_code], 'draft', c.code, s.code, tp.code,
          jsonb_build_object('stage', v_stage, 'relation', v_rel, 'branches', v_br, 'location', left(trim(coalesce(p->>'location', '')), 200), 'answers', ans, 'created_by', actor_email()))
  returning id into v_id;
  insert into kos_members(kos_id, user_id, role) values (v_id, auth.uid(), 'pemilik');
  -- konfigurasi dasar (bukan data operasional)
  insert into expense_categories(kos_id, name, kind)
  select v_id, x.n, x.k from (values ('Listrik dan air', 'operasional'), ('Gaji karyawan', 'operasional'), ('Sewa tempat', 'operasional'), ('Transportasi', 'operasional'),
    ('Perbaikan', 'operasional'), ('Perlengkapan', 'operasional'), ('Peralatan', 'modal')) x(n, k);
  if v_engine = 'properti' then insert into expense_categories(kos_id, name, kind) values (v_id, 'Pengembalian deposit', 'non_operasional'), (v_id, 'Internet', 'operasional'); end if;
  if v_engine = 'kustom' then perform bb_seed_template(v_id, coalesce(tp.spec->>'builder', 'kosong')); end if;
  perform setup_generate(v_id);
  perform config_log(v_id, 'setup_draf', c.name, null, jsonb_build_object('kategori', c.name, 'subkategori', s.name, 'template', tp.name, 'status_usaha', v_stage, 'hubungan', v_rel), 'Pendaftaran bisnis', 'rendah', actor_email());
  perform setup_refresh(v_id);
  return v_id;
end $$;

-- ================= Menerapkan item yang disetujui =================
create or replace function public.setup_apply(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare it setup_items; k kos; v_apply text; n int; v_id uuid; x text; v_code text; m modules;
begin
  select * into it from setup_items where id = p_item;
  select * into k from kos where id = it.kos_id;
  v_apply := it.spec->>'apply';
  perform set_config('prasara.setup_ok', '1', true);
  if v_apply = 'kos.address' then update kos set address = it.value->>'v' where id = k.id;
  elsif v_apply = 'kos.contact_phone' then update kos set contact_phone = it.value->>'v' where id = k.id;
  elsif v_apply like 'profile.%' then update kos set profile = profile || jsonb_build_object(substr(v_apply, 9), it.value->'v') where id = k.id;
  elsif v_apply = 'rooms' then
    if not exists (select 1 from rooms where kos_id = k.id) then
      for n in 1..(it.value->>'count')::int loop
        insert into rooms(kos_id, code, rent, facilities) values (k.id, (it.value->>'prefix') || lpad(n::text, 2, '0'), (it.value->>'price')::numeric,
          coalesce((select array(select jsonb_array_elements_text(value->'v')) from setup_items where kos_id = k.id and code = 'fasilitas' and status in ('approved', 'active')), '{}'));
      end loop;
    end if;
  elsif v_apply = 'rooms_facilities' then
    update rooms set facilities = array(select jsonb_array_elements_text(it.value->'v')) where kos_id = k.id and coalesce(cardinality(facilities), 0) = 0;
  elsif v_apply = 'service' then
    v_id := nullif(it.value->>'svc_id', '')::uuid;
    if v_id is not null and exists (select 1 from svc_services where id = v_id and kos_id = k.id) then
      update svc_services set name = it.value->>'name', unit = it.value->>'unit', price = (it.value->>'price')::numeric, hours = (it.value->>'hours')::int,
        min_qty = (it.value->>'min_qty')::numeric, category = it.value->>'category', active = true where id = v_id;
    else
      insert into svc_services(kos_id, name, category, unit, price, min_qty, hours, active, sort)
      values (k.id, it.value->>'name', it.value->>'category', it.value->>'unit', (it.value->>'price')::numeric, (it.value->>'min_qty')::numeric, (it.value->>'hours')::int, true, it.sort)
      returning id into v_id;
      update setup_items set value = value || jsonb_build_object('svc_id', v_id) where id = it.id;
    end if;
  elsif v_apply = 'delivery' then update kos set profile = profile || jsonb_build_object('delivery', it.value) where id = k.id;
  elsif v_apply = 'stages' then
    if not exists (select 1 from svc_stages where kos_id = k.id) then
      n := 0;
      for x in select jsonb_array_elements_text(it.value->'stages') loop n := n + 1; insert into svc_stages(kos_id, name, sort) values (k.id, x, n); end loop;
    end if;
  elsif v_apply = 'branches_gudang' then
    if (it.value->>'ada')::boolean and not exists (select 1 from branches where kos_id = k.id and kind = 'gudang') then
      insert into branches(kos_id, name, kind) values (k.id, it.value->>'name', 'gudang');
    end if;
  elsif v_apply = 'module' then
    v_code := it.spec->>'module';
    select * into m from modules where code = v_code;
    if m.entitlement is null or plan_has(k.id, m.entitlement) then
      insert into business_modules(kos_id, module_code, active, updated_at, updated_by) values (k.id, v_code, true, now(), actor_email())
      on conflict (kos_id, module_code) do update set active = true, updated_at = now(), updated_by = excluded.updated_by;
    end if;
  elsif v_apply = 'portal' then
    if not exists (select 1 from public_pages where kos_id = k.id) and module_on(k.id, 'u_halaman') then
      x := left(regexp_replace(regexp_replace(lower(k.name), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g'), 34);
      if length(x) < 3 then x := 'bisnis-' || substr(k.id::text, 1, 6); end if;
      while exists (select 1 from public_pages where slug = x) or x in ('admin', 'api', 'masuk', 'mulai', 'panduan', 'bantuan', 'prasara', 'login', 'daftar', 'toko', 'kos', 'demo', 'contoh', 'www', 'app') loop
        x := left(x, 33) || '-' || substr(md5(random()::text), 1, 4);
      end loop;
      insert into public_pages(kos_id, slug, enabled, address, hours, wa_phone, catalog_mode, show_prices, updated_by)
      values (k.id, x, false, k.address, k.profile->>'hours', k.contact_phone, case when k.business_type = 'retail' then 'favorit' else 'semua' end, true, actor_email());
    end if;
  end if;
  if k.setup_status = 'active' then update setup_items set status = 'active' where id = it.id; end if;
end $$;

-- Membatalkan efek item yang sudah aktif (ditolak/ditunda setelah bisnis aktif)
create or replace function public.setup_unapply(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare it setup_items; v_dep text; v_open text;
begin
  select * into it from setup_items where id = p_item;
  perform set_config('prasara.setup_ok', '1', true);
  if it.spec->>'apply' = 'module' then
    select string_agg(d.name, ', ') into v_dep from modules d where (it.spec->>'module') = any(d.depends_on) and not d.core and module_on(it.kos_id, d.code);
    if v_dep is not null then raise exception 'Nonaktifkan dulu modul yang bergantung padanya: %', v_dep; end if;
    v_open := module_open_items(it.kos_id, it.spec->>'module');
    if v_open is not null and it.spec->>'module' <> 'u_karyawan' then raise exception 'Belum bisa dinonaktifkan: %. Selesaikan dulu.', v_open; end if;
    update business_modules set active = false, updated_at = now(), updated_by = actor_email() where kos_id = it.kos_id and module_code = it.spec->>'module';
  elsif it.spec->>'apply' = 'service' and nullif(it.value->>'svc_id', '') is not null then
    update svc_services set active = false where id = (it.value->>'svc_id')::uuid and kos_id = it.kos_id;
  end if;
end $$;

-- ================= Pusat Konfirmasi: simpan / setujui / tolak / tunda =================
create or replace function public.setup_item_save(p_kos uuid, p_code text, p_value jsonb, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it setup_items; c jsonb; v_new text; v_active boolean; v_dep text; v_old jsonb;
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa mengisi konfigurasi'; end if;
  if p_action in ('setujui', 'tolak', 'tunda') and not member_can(p_kos, 'team') then raise exception 'Keputusan setujui/tolak/tunda hanya oleh pemilik bisnis'; end if;
  if p_action not in ('simpan', 'setujui', 'tolak', 'tunda') then raise exception 'Tindakan tidak dikenal'; end if;
  if (select setup_status from kos where id = p_kos) in ('rejected', 'paused') then raise exception 'Setup bisnis ini sedang ditolak/ditunda. Lanjutkan setup dulu.'; end if;
  select * into it from setup_items where kos_id = p_kos and code = p_code;
  if it.id is null then raise exception 'Item konfigurasi tidak ditemukan'; end if;
  v_old := to_jsonb(it) - 'spec';
  v_active := (select setup_status from kos where id = p_kos) = 'active';
  if p_value is not null and p_action in ('simpan', 'setujui') then
    c := setup_clean(it.input, it.spec, p_value, p_kos);
    update setup_items set value = (c->'value') || case when it.value ? 'svc_id' and it.value->>'svc_id' is not null then jsonb_build_object('svc_id', it.value->'svc_id') else '{}' end,
      complete = (c->>'complete')::boolean, updated_by = actor_email(), updated_at = now() where id = it.id
    returning * into it;
  end if;
  if p_action = 'simpan' then
    v_new := case when it.input = 'builder' then it.status when not it.complete then 'needs_information' when it.status = 'active' and p_value is null then 'active' else 'pending_owner_confirmation' end;
  elsif p_action = 'setujui' then
    if not it.complete then raise exception '"%" belum lengkap. Lengkapi isinya dulu.', it.label; end if;
    if it.input = 'builder' then raise exception 'Bagian ini disetujui dengan Validasi & aktifkan di Business Builder'; end if;
    if it.kind = 'modul' then
      select string_agg(d.name, ', ') into v_dep from modules d where d.code = any(select jsonb_array_elements_text(it.spec->'depends_on')) and not d.core
        and not exists (select 1 from setup_items x where x.kos_id = p_kos and x.code = 'modul_' || d.code and x.status in ('approved', 'active'))
        and not (v_active and module_on(p_kos, d.code));
      if v_dep is not null then raise exception 'Setujui dulu modul: %', v_dep; end if;
      if it.spec->>'entitlement' is not null and not plan_has(p_kos, it.spec->>'entitlement') then raise exception 'Modul ini membutuhkan paket yang lebih tinggi. Lihat menu Langganan.'; end if;
    end if;
    if it.kind = 'portal' and not exists (select 1 from setup_items x where x.kos_id = p_kos and x.code = 'modul_' || (it.spec->>'needs_module') and x.status in ('approved', 'active'))
       and not (v_active and module_on(p_kos, it.spec->>'needs_module')) then
      raise exception 'Setujui dulu modul Halaman bisnis & formulir';
    end if;
    v_new := 'approved';
  else -- tolak / tunda
    if it.must = 'approve' then raise exception '"%" wajib untuk bisnis ini dan tidak bisa ditolak/ditunda. Ubah isinya bila belum tepat.', it.label; end if;
    if it.kind = 'modul' then
      select string_agg(x.label, ', ') into v_dep from setup_items x where x.kos_id = p_kos and x.kind = 'modul' and x.status in ('approved', 'active')
        and (x.spec->'depends_on') ? (it.spec->>'module');
      if v_dep is not null then raise exception 'Modul ini dibutuhkan oleh: %. Tolak/tunda modul itu dulu.', v_dep; end if;
      if it.spec->>'module' = 'u_halaman' and exists (select 1 from setup_items x where x.kos_id = p_kos and x.kind = 'portal' and x.status in ('approved', 'active')) then
        raise exception 'Halaman bisnis sudah disetujui. Tunda/tolak item Halaman bisnis dulu.';
      end if;
    end if;
    if v_active and it.status = 'active' then perform setup_unapply(it.id); end if;
    v_new := case when p_action = 'tolak' then 'rejected' else 'paused' end;
  end if;
  update setup_items set status = v_new, note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note), updated_by = actor_email(), updated_at = now() where id = it.id;
  if v_active and v_new = 'approved' then perform setup_apply(it.id); end if;
  perform config_log(p_kos, 'setup_' || p_action, it.label, v_old, (select to_jsonb(x) - 'spec' from setup_items x where x.id = it.id), p_note,
    case when p_action = 'simpan' then 'rendah' else 'menengah' end, actor_email());
  return jsonb_build_object('status', v_new, 'business', setup_refresh(p_kos));
end $$;

-- Setujui sekaligus semua modul yang disarankan (dan yang lengkap) — pemilik
create or replace function public.setup_approve_recommended(p_kos uuid)
returns int language plpgsql security definer set search_path = public as $$
declare it setup_items; n int := 0;
begin
  if not member_can(p_kos, 'team') then raise exception 'Hanya pemilik bisnis'; end if;
  -- urutkan agar dependensi disetujui lebih dulu
  for it in select * from setup_items where kos_id = p_kos and kind = 'modul' and status not in ('approved', 'active') and (value->>'recommended')::boolean
             order by jsonb_array_length(coalesce(spec->'depends_on', '[]')), sort loop
    begin
      perform setup_item_save(p_kos, it.code, null, 'setujui', null);
      n := n + 1;
    exception when others then null; -- modul berbayar / dependensi belum ada: biarkan untuk diputuskan manual
    end;
  end loop;
  return n;
end $$;

-- Tambah layanan baru di draf (mis. jasa umum)
create or replace function public.setup_add_service(p_kos uuid, p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola'; end if;
  if (select business_type from kos where id = p_kos) <> 'jasa' then raise exception 'Layanan hanya untuk bisnis jasa'; end if;
  if (select count(*) from setup_items where kos_id = p_kos and kind = 'layanan') >= 40 then raise exception 'Maksimal 40 layanan di setup'; end if;
  v_code := 'layanan_x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  perform setup_add_item(p_kos, v_code, 'layanan', left(trim(coalesce(p->>'name', '')), 80), 'Layanan tambahan dari pemilik.', 'service', '{"apply": "service"}', 'decide', p,
    50 + (select count(*)::int from setup_items where kos_id = p_kos and kind = 'layanan'));
  update setup_items set status = case when complete then 'pending_owner_confirmation' else 'needs_information' end, updated_by = actor_email() where kos_id = p_kos and code = v_code;
  perform config_log(p_kos, 'setup_tambah_layanan', p->>'name', null, p, null, 'rendah', actor_email());
  perform setup_refresh(p_kos);
  return v_code;
end $$;

-- Keadaan setup untuk Pusat Konfirmasi
create or replace function public.setup_state(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k kos; v_status text; v_total numeric; v_score numeric; v_after jsonb := '[]'; a jsonb; v_done boolean; tp biz_templates;
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa membuka Pusat Konfirmasi'; end if;
  v_status := setup_refresh(p_kos);
  select * into k from kos where id = p_kos;
  select * into tp from biz_templates where code = k.template_code;
  -- progres dari kelengkapan data: lengkap & disetujui = 1, lengkap belum disetujui = 0,5, belum lengkap = 0 (item wajib/diputuskan saja)
  select count(*), coalesce(sum(case when status in ('approved', 'active') then 1 when status in ('rejected', 'paused') and must = 'decide' then 1 when complete then 0.5 else 0 end), 0)
    into v_total, v_score from setup_items where kos_id = p_kos and must in ('approve', 'decide');
  -- daftar "setelah aktif" dihitung dari data nyata
  for a in select * from jsonb_array_elements(coalesce(tp.spec->'after', '[]')) loop
    v_done := case a->>0
      when 'produk' then exists (select 1 from products where kos_id = p_kos)
      when 'harga' then exists (select 1 from products where kos_id = p_kos) and not exists (select 1 from products p where p.kos_id = p_kos and p.active and not exists (select 1 from product_units u where u.product_id = p.id and u.price_retail > 0))
      when 'stok' then exists (select 1 from stock_moves where kos_id = p_kos and kind = 'awal')
      when 'supplier' then exists (select 1 from contacts where kos_id = p_kos and kind in ('supplier', 'keduanya'))
      else false end;
    v_after := v_after || jsonb_build_array(jsonb_build_object('code', a->>0, 'label', a->>1, 'href', a->>2, 'done', v_done));
  end loop;
  return jsonb_build_object(
    'business', jsonb_build_object('id', k.id, 'name', k.name, 'type', k.business_type, 'status', v_status, 'activated_at', k.activated_at,
      'category', (select jsonb_build_object('code', code, 'name', name, 'icon', icon, 'note', note) from biz_categories where code = k.category_code),
      'subcategory', (select jsonb_build_object('code', code, 'name', name, 'note', note) from biz_subcategories where code = k.subcategory_code),
      'template', tp.name, 'meta', k.setup_meta - 'answers', 'is_owner', member_can(p_kos, 'team')),
    'items', coalesce((select jsonb_agg(to_jsonb(x) - 'kos_id' order by x.sort, x.code) from setup_items x where x.kos_id = p_kos), '[]'),
    'progress', jsonb_build_object('total', v_total, 'score', v_score, 'pct', case when v_total = 0 then 100 else round(100 * v_score / v_total) end,
      'missing', (select count(*) from setup_items where kos_id = p_kos and not complete and input <> 'pending' and (must <> 'decide' or status not in ('rejected', 'paused')) and kind <> 'modul')),
    'after', v_after,
    'can_activate', v_status = 'approved' and member_can(p_kos, 'team'));
end $$;

-- ================= Aktivasi (hanya yang disetujui) =================
create or replace function public.setup_activate(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k kos; it setup_items; v_on text[]; v_n int := 0;
begin
  if not member_can(p_kos, 'team') then raise exception 'Aktivasi hanya oleh pemilik bisnis'; end if;
  if setup_refresh(p_kos) <> 'approved' then raise exception 'Belum bisa diaktifkan: masih ada informasi wajib yang belum lengkap atau belum disetujui.'; end if;
  select * into k from kos where id = p_kos;
  if k.business_type = 'kustom' and not exists (select 1 from bb_workspace where kos_id = p_kos and status = 'aktif') then raise exception 'Selesaikan Validasi & aktifkan di Business Builder dulu'; end if;
  perform set_config('prasara.setup_ok', '1', true);
  -- modul opsional: hanya yang disetujui yang aktif
  select coalesce(array_agg(spec->>'module'), '{}') into v_on from setup_items where kos_id = p_kos and kind = 'modul' and status = 'approved';
  update business_modules bm set active = bm.module_code = any(v_on) and (m.entitlement is null or plan_has(p_kos, m.entitlement)), updated_at = now(), updated_by = actor_email()
  from modules m where m.code = bm.module_code and bm.kos_id = p_kos and not m.core;
  -- item lain (urut: info dulu, lalu layanan/alur, portal terakhir)
  for it in select * from setup_items where kos_id = p_kos and status = 'approved' and kind <> 'modul'
            order by case kind when 'info' then 1 when 'alur' then 2 when 'layanan' then 3 else 4 end, sort loop
    perform setup_apply(it.id); v_n := v_n + 1;
  end loop;
  update setup_items set status = 'active', updated_at = now() where kos_id = p_kos and status = 'approved';
  update kos set setup_status = 'active', activated_at = now() where id = p_kos;
  perform config_log(p_kos, 'setup_aktifkan', k.name, null, jsonb_build_object('modul', v_on, 'item', v_n), 'Pemilik mengaktifkan bisnis', 'tinggi', actor_email());
  return jsonb_build_object('ok', true, 'modules', v_on, 'items', v_n);
end $$;

-- Tunda / tolak / lanjutkan setup seluruh bisnis (belum aktif)
create or replace function public.setup_business_action(p_kos uuid, p_action text, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare k kos; v text;
begin
  if not member_can(p_kos, 'team') then raise exception 'Hanya pemilik bisnis'; end if;
  select * into k from kos where id = p_kos;
  if k.setup_status = 'active' then raise exception 'Bisnis sudah aktif. Untuk berhenti, pakai Tutup bisnis di Pengaturan.'; end if;
  if p_action in ('tunda', 'tolak') and coalesce(length(trim(p_note)), 0) < 3 then raise exception 'Tuliskan alasannya'; end if;
  perform set_config('prasara.setup_ok', '1', true);
  if p_action = 'tunda' then update kos set setup_status = 'paused' where id = p_kos; v := 'paused';
  elsif p_action = 'tolak' then update kos set setup_status = 'rejected' where id = p_kos; v := 'rejected';
  elsif p_action = 'lanjut' then update kos set setup_status = 'draft' where id = p_kos; v := setup_refresh(p_kos);
  else raise exception 'Tindakan tidak dikenal'; end if;
  perform config_log(p_kos, 'setup_bisnis_' || p_action, k.name, jsonb_build_object('status', k.setup_status), jsonb_build_object('status', v), p_note, 'menengah', actor_email());
  return v;
end $$;

revoke all on function public.setup_apply(uuid), public.setup_unapply(uuid), public.setup_add_item(uuid, text, text, text, text, text, jsonb, text, jsonb, int),
  public.setup_generate(uuid), public.setup_refresh(uuid) from public, anon, authenticated;

-- ================= Halaman publik hanya untuk bisnis aktif =================
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.public_page_view(text)',
  'if k.closed_at is not null or k.suspended_at is not null',
  'if k.closed_at is not null or k.setup_status <> ''active'' or k.suspended_at is not null');
select public._prasara_patch('public.public_submit(text,text,text,text,jsonb,boolean,text,integer)',
  'if pg.kos_id is null or k.closed_at is not null or k.suspended_at is not null',
  'if pg.kos_id is null or k.closed_at is not null or k.setup_status <> ''active'' or k.suspended_at is not null');
select public._prasara_patch('public.public_page_save(uuid,jsonb)',
  'if v_on and (select closed_at from kos where id = p_kos) is not null then',
  'if v_on and (select setup_status from kos where id = p_kos) <> ''active'' then raise exception ''Aktifkan bisnis di Pusat Konfirmasi dulu; halaman bisa disimpan sebagai draf.''; end if;
  if v_on and (select closed_at from kos where id = p_kos) is not null then');
drop function public._prasara_patch(text, text, text);

-- ================= Super Admin: kategori & subkategori =================
create or replace function public.admin_biz_category_save(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_old jsonb;
begin
  if not admin_can('plans.manage') then raise exception 'Khusus Super Admin'; end if;
  if coalesce(p->>'code', '') !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'Kode 2–40 huruf kecil/angka/garis bawah'; end if;
  if coalesce(p->>'kind', 'kategori') = 'kategori' then
    if coalesce(p->>'engine', '') not in ('properti', 'retail', 'jasa', 'kustom') then raise exception 'Mesin tidak dikenal'; end if;
    if not exists (select 1 from biz_templates where code = p->>'template' and engine = p->>'engine') then raise exception 'Template tidak cocok dengan mesinnya'; end if;
    select to_jsonb(c) into v_old from biz_categories c where code = p->>'code';
    insert into biz_categories(code, name, icon, description, engine, template, group_code, note, sort, active)
    values (p->>'code', trim(p->>'name'), coalesce(nullif(p->>'icon', ''), '🏢'), nullif(trim(coalesce(p->>'description', '')), ''), p->>'engine', p->>'template',
            coalesce(nullif(p->>'group_code', ''), 'lainnya'), nullif(trim(coalesce(p->>'note', '')), ''), coalesce((p->>'sort')::int, 99), coalesce((p->>'active')::boolean, true))
    on conflict (code) do update set name = excluded.name, icon = excluded.icon, description = excluded.description, engine = excluded.engine, template = excluded.template,
      group_code = excluded.group_code, note = excluded.note, sort = excluded.sort, active = excluded.active;
  else
    if not exists (select 1 from biz_categories where code = p->>'category_code') then raise exception 'Kategori induk tidak dikenal'; end if;
    if nullif(p->>'sub_engine', '') is not null and not exists (select 1 from biz_templates where code = p->>'sub_template' and engine = p->>'sub_engine') then
      raise exception 'Subkategori dengan mesin lain wajib memilih template mesin itu'; end if;
    if nullif(p->>'sub_engine', '') is null and nullif(p->>'sub_template', '') is not null
       and not exists (select 1 from biz_templates t join biz_categories c on c.code = p->>'category_code' where t.code = p->>'sub_template' and t.engine = c.engine) then
      raise exception 'Template tidak cocok dengan mesin kategori'; end if;
    select to_jsonb(s) into v_old from biz_subcategories s where code = p->>'code';
    insert into biz_subcategories(code, category_code, name, engine, template, note, sort, active)
    values (p->>'code', p->>'category_code', trim(p->>'name'), nullif(p->>'sub_engine', ''), nullif(p->>'sub_template', ''), nullif(trim(coalesce(p->>'note', '')), ''),
            coalesce((p->>'sort')::int, 99), coalesce((p->>'active')::boolean, true))
    on conflict (code) do update set category_code = excluded.category_code, name = excluded.name, engine = excluded.engine, template = excluded.template,
      note = excluded.note, sort = excluded.sort, active = excluded.active;
  end if;
  insert into admin_log(actor_email, action, detail) values (actor_email(), 'ubah_kategori_bisnis', jsonb_build_object('sebelum', v_old, 'sesudah', p));
end $$;
