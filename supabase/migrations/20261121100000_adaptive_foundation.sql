-- Adaptive Business Experience v3.0 — Tahap 1 (Fase 1 + fondasi Fase 2). Audit: docs/AUDIT_ADAPTIVE_EXPERIENCE.md
-- • Klasifikasi universal: 21 kategori (≥20), subkategori sesuai daftar spesifikasi, metadata DNA bawaan + versi.
-- • Business DNA 6 dimensi (identitas, model bisnis, struktur pendapatan, DNA operasional, skala, kanal) di business_profiles,
--   kosakata stabil di biz_vocab (bisa ditambah tanpa kode). Bawaan dihitung dari kategori + isian pendaftaran.
-- • Feature Relevance Engine: metadata relevansi di modules + rule registry relevance_rules + skor berbobot
--   R = .20 kategori + .25 operasional + .20 model + .10 skala + .10 preferensi pemilik + .15 alur (aturan).
--   Skor BUKAN izin: aktivasi tetap lewat module_set (izin, paket, dependensi).
-- • Siklus rekomendasi (recommended/accepted/rejected/deferred/activated/dismissed/expired) dengan alasan & riwayat;
--   yang ditolak tidak muncul lagi kecuali alasannya berubah.
-- • Lifecycle: biz_signals (indikator nyata) + tahap kematangan + evaluasi saat profil/cabang/karyawan/paket berubah (aman, tidak
--   pernah menggagalkan transaksi utama) dan harian (experience_tick).
-- • Konfigurasi pengalaman pemilik (navigasi, aksi cepat, dashboard) di experience_configs, berversi, bisa dipulihkan.
-- Tanpa AI generatif: semua keputusan dari aturan & angka tertulis.

-- ================= 1. Klasifikasi: metadata & versi =================
alter table public.biz_categories add column if not exists version int not null default 1;
alter table public.biz_categories add column if not exists supported_models text[] not null default '{}';
alter table public.biz_categories add column if not exists default_revenue text[] not null default '{}';
alter table public.biz_categories add column if not exists default_caps text[] not null default '{}';
alter table public.biz_categories add column if not exists default_channels text[] not null default '{}';
alter table public.biz_categories add column if not exists default_features text[] not null default '{}';
alter table public.biz_categories add column if not exists updated_at timestamptz not null default now();
alter table public.biz_subcategories add column if not exists version int not null default 1;
alter table public.biz_subcategories add column if not exists supported_models text[] not null default '{}';  -- ditambahkan ke bawaan kategori
alter table public.biz_subcategories add column if not exists default_caps text[] not null default '{}';
alter table public.biz_subcategories add column if not exists default_channels text[] not null default '{}';
alter table public.biz_subcategories add column if not exists description text;
alter table public.biz_subcategories add column if not exists updated_at timestamptz not null default now();

create or replace function public.biz_class_version()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and to_jsonb(new) - 'version' - 'updated_at' is distinct from to_jsonb(old) - 'version' - 'updated_at' then
    new.version := old.version + 1; new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists biz_categories_version on public.biz_categories;
create trigger biz_categories_version before update on public.biz_categories for each row execute function public.biz_class_version();
drop trigger if exists biz_subcategories_version on public.biz_subcategories;
create trigger biz_subcategories_version before update on public.biz_subcategories for each row execute function public.biz_class_version();

-- Kategori baru (spesifikasi §5.1: 04 Hospitality, 16 E-commerce, 17 Teknologi, 18 Media, 19 Keuangan, 20 Rental)
insert into public.biz_categories(code, name, icon, description, engine, template, group_code, note, sort) values
  ('hospitality', 'Hospitality & Akomodasi', '🏨', 'Hotel, villa, resort, homestay, guest house, hostel', 'properti', 'kos', 'fnb_hospitality',
   'Memakai mesin Properti: kamar, booking dengan uang muka, check-in, tagihan, perbaikan. Tarif harian & housekeeping khusus hotel dalam rencana.', 4),
  ('ecommerce', 'E-commerce & Bisnis Digital', '🛍️', 'Online shop, seller marketplace, dropship, produk digital', 'retail', 'toko', 'retail_trading',
   'Memakai mesin Retail: produk, stok, pesanan, pelanggan, laporan. Sinkron otomatis dengan marketplace dalam rencana.', 16),
  ('teknologi', 'Teknologi, IT & Software', '💻', 'Software house, SaaS, IT consultant, technical support', 'jasa', 'jasa_umum', 'professional_admin',
   'Memakai mesin Jasa: layanan, pesanan kerja, tahap pengerjaan, pembayaran.', 17),
  ('media', 'Media, Kreatif & Komunikasi', '🎨', 'Agensi digital, desain, foto/video, content creator, periklanan', 'jasa', 'jasa_umum', 'professional_admin',
   'Memakai mesin Jasa: brief jadi pesanan, tahap produksi & revisi, pembayaran.', 18),
  ('keuangan', 'Keuangan & Layanan Finansial', '🏦', 'Konsultan keuangan, agen pembayaran, layanan asuransi, administrasi keuangan', 'jasa', 'jasa_umum', 'professional_admin',
   'PRASARA hanya mencatat operasional bisnis Anda. Kegiatan yang diatur regulator (pembiayaan, simpan pinjam, asuransi) tetap wajib memiliki izin resmi.', 19),
  ('rental', 'Rental, Sewa & Leasing', '🧰', 'Rental alat berat, alat pesta, mesin, kendaraan, perlengkapan', 'kustom', 'bb_rental', 'property_rental',
   'Template sewa alat siap pakai: aset, jadwal sewa, deposit, pengembalian.', 20)
on conflict (code) do nothing;

-- Nama tampilan & urutan mengikuti spesifikasi (kode tetap — relasi tidak berubah)
update public.biz_categories c set name = x.n, sort = x.s from (values
  ('retail', 'Retail & Perdagangan', 1), ('distribusi', 'Grosir, Distribusi & Logistik', 2), ('properti', 'Properti & Real Estate', 3),
  ('hospitality', 'Hospitality & Akomodasi', 4), ('kuliner', 'Kuliner & Food and Beverage', 5), ('laundry', 'Laundry & Jasa Operasional', 6),
  ('manufaktur', 'Manufaktur & Produksi', 7), ('profesional', 'Jasa Profesional & Konsultasi', 8), ('kesehatan', 'Kesehatan, Kecantikan & Wellness', 9),
  ('pendidikan', 'Pendidikan & Pelatihan', 10), ('event', 'Event, Hiburan & Entertainment', 11), ('otomotif', 'Otomotif & Transportasi', 12),
  ('pertanian', 'Pertanian, Perkebunan & Peternakan', 13), ('konstruksi', 'Konstruksi & Engineering', 14), ('travel', 'Travel & Pariwisata', 15),
  ('ecommerce', 'E-commerce & Bisnis Digital', 16), ('teknologi', 'Teknologi, IT & Software', 17), ('media', 'Media, Kreatif & Komunikasi', 18),
  ('keuangan', 'Keuangan & Layanan Finansial', 19), ('rental', 'Rental, Sewa & Leasing', 20), ('lainnya', 'Organisasi & Lainnya', 21)
) as x(c, n, s) where c.code = x.c;
update public.biz_categories set description = 'Komunitas, yayasan, koperasi, organisasi keagamaan, membership, energi & lingkungan, usaha lain' where code = 'lainnya';
update public.biz_subcategories set name = 'Toko fashion' where code = 'retail_pakaian';

-- Subkategori sesuai daftar spesifikasi (engine/template kosong = ikut kategori; berbeda mesin = wajib template mesin itu)
insert into public.biz_subcategories(code, category_code, name, engine, template, note, sort) values
  ('retail_supermarket', 'retail', 'Supermarket', null, null, null, 3), ('retail_elektronik', 'retail', 'Toko elektronik', null, null, null, 6),
  ('retail_kosmetik', 'retail', 'Toko kosmetik', null, null, null, 7), ('retail_rumah', 'retail', 'Perlengkapan rumah', null, null, null, 8),
  ('retail_furniture', 'retail', 'Toko furniture', null, null, null, 9), ('retail_buku', 'retail', 'Toko buku & alat tulis', null, null, null, 10),
  ('retail_apotek', 'retail', 'Toko obat & apotek', null, null, null, 11), ('retail_bayi', 'retail', 'Perlengkapan bayi', null, null, null, 12),
  ('retail_olahraga', 'retail', 'Alat olahraga', null, null, null, 13), ('retail_sparepart', 'retail', 'Toko suku cadang', null, null, null, 14),
  ('retail_specialty', 'retail', 'Specialty retail', null, null, null, 15),
  ('distribusi_subdistributor', 'distribusi', 'Subdistributor', null, null, null, 3), ('distribusi_reseller', 'distribusi', 'Reseller', null, null, null, 4),
  ('distribusi_importir', 'distribusi', 'Importir', null, null, null, 5), ('distribusi_eksportir', 'distribusi', 'Eksportir', null, null, null, 6),
  ('distribusi_wholesaler', 'distribusi', 'Wholesaler', null, null, null, 7), ('distribusi_coldchain', 'distribusi', 'Distribusi rantai dingin', null, null, null, 8),
  ('distribusi_gudang', 'distribusi', 'Pergudangan', 'kustom', 'bb_kirim', null, 9), ('distribusi_fulfillment', 'distribusi', 'Fulfillment', 'kustom', 'bb_kirim', null, 10),
  ('distribusi_lastmile', 'distribusi', 'Last-mile delivery', 'kustom', 'bb_kirim', null, 11),
  ('properti_rumah', 'properti', 'Rumah sewa', null, null, null, 4), ('properti_apartemen', 'properti', 'Apartemen', null, null, null, 5),
  ('properti_ruko', 'properti', 'Ruko', null, null, null, 6), ('properti_gedung', 'properti', 'Gedung komersial', null, null, null, 7),
  ('properti_pengelola', 'properti', 'Pengelolaan properti', null, null, null, 8),
  ('properti_agen', 'properti', 'Agen properti', 'jasa', 'jasa_umum', 'Memakai mesin Jasa: listing jadi pesanan, komisi tercatat sebagai pendapatan.', 9),
  ('properti_developer', 'properti', 'Developer properti', 'kustom', 'bb_proyek', null, 10),
  ('hospitality_hotel', 'hospitality', 'Hotel', null, null, null, 1), ('hospitality_villa', 'hospitality', 'Villa', null, null, null, 2),
  ('hospitality_resort', 'hospitality', 'Resort', null, null, null, 3), ('hospitality_homestay', 'hospitality', 'Homestay', null, null, null, 4),
  ('hospitality_guesthouse', 'hospitality', 'Guest house', null, null, null, 5), ('hospitality_hostel', 'hospitality', 'Hostel', null, null, null, 6),
  ('hospitality_penginapan', 'hospitality', 'Penginapan', null, null, null, 7), ('hospitality_serviced', 'hospitality', 'Serviced apartment', null, null, null, 8),
  ('hospitality_boutique', 'hospitality', 'Boutique hotel', null, null, null, 9),
  ('kuliner_coffee', 'kuliner', 'Coffee shop', null, null, null, 5), ('kuliner_rumahmakan', 'kuliner', 'Rumah makan', null, null, null, 6),
  ('kuliner_bakery', 'kuliner', 'Bakery & patisserie', null, null, null, 7), ('kuliner_cloud', 'kuliner', 'Cloud kitchen', null, null, null, 8),
  ('kuliner_foodtruck', 'kuliner', 'Food truck', null, null, null, 9), ('kuliner_franchise', 'kuliner', 'Franchise makanan', null, null, null, 10),
  ('kuliner_minuman', 'kuliner', 'Usaha minuman', null, null, null, 11), ('kuliner_fastfood', 'kuliner', 'Fast food', null, null, null, 12),
  ('kuliner_casual', 'kuliner', 'Casual dining', null, null, null, 13), ('kuliner_fine', 'kuliner', 'Fine dining', null, null, null, 14),
  ('laundry_cucikendaraan', 'laundry', 'Cuci kendaraan', null, 'jasa_umum', null, 6), ('laundry_pest', 'laundry', 'Pest control', null, 'jasa_umum', null, 7),
  ('laundry_homeservice', 'laundry', 'Home service & perawatan rumah', null, 'jasa_umum', null, 8),
  ('laundry_perbaikan', 'laundry', 'Jasa perbaikan rumah', null, 'jasa_umum', null, 9), ('laundry_fasilitas', 'laundry', 'Pemeliharaan fasilitas', null, 'jasa_umum', null, 10),
  ('manufaktur_minuman', 'manufaktur', 'Produksi minuman', null, null, null, 4), ('manufaktur_garment', 'manufaktur', 'Garment', null, null, null, 5),
  ('manufaktur_furniture', 'manufaktur', 'Furniture', null, null, null, 6), ('manufaktur_percetakan', 'manufaktur', 'Percetakan', null, null, null, 7),
  ('manufaktur_pengolahan', 'manufaktur', 'Pengolahan bahan', null, null, null, 8), ('manufaktur_komponen', 'manufaktur', 'Industri komponen', null, null, null, 9),
  ('manufaktur_packaging', 'manufaktur', 'Packaging', null, null, null, 10),
  ('profesional_hukum', 'profesional', 'Konsultan hukum', null, null, null, 6), ('profesional_pajak', 'profesional', 'Konsultan pajak', null, null, null, 7),
  ('profesional_akuntansi', 'profesional', 'Akuntansi', null, null, null, 8), ('profesional_arsitek', 'profesional', 'Arsitek', null, null, null, 9),
  ('profesional_teknik', 'profesional', 'Konsultan teknik', null, null, null, 10), ('profesional_agensi', 'profesional', 'Agensi', null, null, null, 11),
  ('profesional_admin', 'profesional', 'Jasa administrasi', null, null, null, 12), ('profesional_manajemen', 'profesional', 'Konsultan manajemen', null, null, null, 13),
  ('kesehatan_dokter', 'kesehatan', 'Praktik dokter', null, 'bb_klinik', 'Untuk antrean & pembayaran; jangan menyimpan diagnosis/rekam medis.', 5),
  ('kesehatan_fisioterapi', 'kesehatan', 'Fisioterapi', null, 'bb_klinik', 'Untuk antrean & pembayaran; jangan menyimpan diagnosis/rekam medis.', 6),
  ('kesehatan_lab', 'kesehatan', 'Laboratorium', null, 'bb_klinik', 'Untuk antrean & pembayaran; hasil pemeriksaan tidak disimpan di sini.', 7),
  ('kesehatan_gym', 'kesehatan', 'Pusat kebugaran', null, 'bb_anggota', null, 8), ('kesehatan_wellness', 'kesehatan', 'Wellness center', null, null, null, 9),
  ('kesehatan_beauty', 'kesehatan', 'Beauty clinic', null, null, null, 10),
  ('pendidikan_sekolah', 'pendidikan', 'Sekolah', null, null, null, 3), ('pendidikan_lembaga', 'pendidikan', 'Lembaga pelatihan', null, null, null, 4),
  ('pendidikan_olahraga', 'pendidikan', 'Pelatihan olahraga & renang', null, null, null, 5), ('pendidikan_musik', 'pendidikan', 'Kursus musik', null, null, null, 6),
  ('pendidikan_profesional', 'pendidikan', 'Pelatihan profesional', null, null, null, 7), ('pendidikan_center', 'pendidikan', 'Training center', null, null, null, 8),
  ('pendidikan_nonformal', 'pendidikan', 'Pendidikan nonformal', null, null, null, 9),
  ('event_konser', 'event', 'Konser', null, null, null, 4), ('event_studio', 'event', 'Studio', null, 'bb_rental', null, 5),
  ('event_ph', 'event', 'Production house', null, null, null, 6), ('event_venue', 'event', 'Venue management', null, 'bb_rental', null, 7),
  ('event_hiburan', 'event', 'Tempat hiburan', null, null, null, 8), ('event_produksi', 'event', 'Event production', null, null, null, 9),
  ('otomotif_dealer', 'otomotif', 'Dealer', 'retail', 'toko', null, 5), ('otomotif_rental', 'otomotif', 'Rental kendaraan', null, 'bb_rental', null, 6),
  ('otomotif_transportasi', 'otomotif', 'Jasa transportasi', null, 'bb_kirim', null, 7), ('otomotif_fleet', 'otomotif', 'Fleet management & perawatan armada', null, 'bb_kirim', null, 8),
  ('pertanian_kebun', 'pertanian', 'Perkebunan', null, null, null, 4), ('pertanian_ikan', 'pertanian', 'Perikanan & tambak', null, null, null, 5),
  ('pertanian_budidaya', 'pertanian', 'Budidaya', null, null, null, 6), ('pertanian_agribisnis', 'pertanian', 'Agribisnis', null, null, null, 7),
  ('pertanian_olahan', 'pertanian', 'Pengolahan hasil pertanian', null, 'bb_produksi', null, 8),
  ('pertanian_distribusi', 'pertanian', 'Distribusi hasil panen', 'retail', 'toko', null, 9),
  ('konstruksi_developer', 'konstruksi', 'Developer proyek', null, null, null, 4), ('konstruksi_konsultan', 'konstruksi', 'Konsultan konstruksi', null, null, null, 5),
  ('konstruksi_listrik', 'konstruksi', 'Instalasi listrik', null, null, null, 6), ('konstruksi_plumbing', 'konstruksi', 'Plumbing', null, null, null, 7),
  ('konstruksi_sipil', 'konstruksi', 'Pekerjaan sipil', null, null, null, 8), ('konstruksi_interior', 'konstruksi', 'Interior', null, null, null, 9),
  ('konstruksi_engineering', 'konstruksi', 'Engineering services', null, null, null, 10), ('konstruksi_infra', 'konstruksi', 'Infrastruktur', null, null, null, 11),
  ('travel_tour', 'travel', 'Tour operator', null, null, null, 4), ('travel_biro', 'travel', 'Biro perjalanan', null, null, null, 5),
  ('travel_pemandu', 'travel', 'Pemandu wisata', null, null, null, 6), ('travel_lokal', 'travel', 'Wisata lokal & paket wisata', null, null, null, 7),
  ('travel_transportasi', 'travel', 'Travel transportasi', null, null, null, 8), ('travel_aktivitas', 'travel', 'Penyedia aktivitas wisata', null, null, null, 9),
  ('ecommerce_onlineshop', 'ecommerce', 'Online shop', null, null, null, 1), ('ecommerce_marketplace', 'ecommerce', 'Marketplace seller', null, null, null, 2),
  ('ecommerce_d2c', 'ecommerce', 'D2C (direct to consumer)', null, null, null, 3), ('ecommerce_dropship', 'ecommerce', 'Dropship', null, null, null, 4),
  ('ecommerce_affiliate', 'ecommerce', 'Affiliate commerce', null, null, null, 5), ('ecommerce_social', 'ecommerce', 'Social commerce', null, null, null, 6),
  ('ecommerce_digital', 'ecommerce', 'Produk digital', null, null, null, 7), ('ecommerce_membership', 'ecommerce', 'Membership digital', 'kustom', 'bb_anggota', null, 8),
  ('ecommerce_storefront', 'ecommerce', 'Digital storefront', null, null, null, 9),
  ('teknologi_softwarehouse', 'teknologi', 'Software house', null, null, null, 1), ('teknologi_saas', 'teknologi', 'SaaS', null, null, null, 2),
  ('teknologi_konsultan', 'teknologi', 'IT consultant', null, null, null, 3), ('teknologi_web', 'teknologi', 'Web & mobile development', null, null, null, 4),
  ('teknologi_managed', 'teknologi', 'Managed IT services', null, null, null, 5), ('teknologi_security', 'teknologi', 'Cybersecurity', null, null, null, 6),
  ('teknologi_infra', 'teknologi', 'IT infrastructure & cloud', null, null, null, 7), ('teknologi_support', 'teknologi', 'Technical support', null, null, null, 8),
  ('media_agensi', 'media', 'Agensi digital & social media', null, null, null, 1), ('media_desain', 'media', 'Desain grafis & branding', null, null, null, 2),
  ('media_foto', 'media', 'Fotografi', null, null, null, 3), ('media_video', 'media', 'Videografi & produksi media', null, null, null, 4),
  ('media_creator', 'media', 'Content creator', null, null, null, 5), ('media_penerbitan', 'media', 'Penerbitan', null, null, null, 6),
  ('media_iklan', 'media', 'Periklanan', null, null, null, 7),
  ('keuangan_konsultan', 'keuangan', 'Konsultan keuangan', null, null, null, 1), ('keuangan_agen', 'keuangan', 'Agen pembayaran', null, null, null, 2),
  ('keuangan_asuransi', 'keuangan', 'Layanan asuransi (agen)', null, null, 'Wajib terdaftar/berizin sesuai ketentuan regulator.', 3),
  ('keuangan_pembiayaan', 'keuangan', 'Lembaga pembiayaan', null, null, 'Wajib berizin regulator. PRASARA tidak menggantikan sistem pembiayaan berizin.', 4),
  ('keuangan_ksp', 'keuangan', 'Koperasi simpan pinjam', 'kustom', 'bb_anggota', 'Wajib berizin. Template ini hanya mencatat anggota & iuran, bukan sistem simpan pinjam.', 5),
  ('keuangan_admin', 'keuangan', 'Administrasi keuangan', null, null, null, 6),
  ('rental_alatberat', 'rental', 'Rental alat berat', null, null, null, 1), ('rental_pesta', 'rental', 'Rental alat pesta', null, null, null, 2),
  ('rental_mesin', 'rental', 'Rental mesin', null, null, null, 3), ('rental_kendaraan', 'rental', 'Rental kendaraan', null, null, null, 4),
  ('rental_perlengkapan', 'rental', 'Sewa perlengkapan', null, null, null, 5), ('rental_kantor', 'rental', 'Rental peralatan kantor', null, null, null, 6),
  ('rental_fasilitas', 'rental', 'Penyewaan fasilitas', null, null, null, 7), ('rental_equipment', 'rental', 'Equipment rental', null, null, null, 8),
  ('lainnya_yayasan', 'lainnya', 'Yayasan & organisasi sosial', null, null, null, 3), ('lainnya_keagamaan', 'lainnya', 'Organisasi keagamaan', null, null, null, 4),
  ('lainnya_membership', 'lainnya', 'Bisnis berbasis membership', null, null, null, 5),
  ('lainnya_energi', 'lainnya', 'Energi & utilitas', 'jasa', 'jasa_umum', null, 6), ('lainnya_lingkungan', 'lainnya', 'Pengelolaan limbah & lingkungan', 'jasa', 'jasa_umum', null, 7)
on conflict (code) do nothing;

-- ================= 2. Kosakata Business DNA (kode stabil; label bisa diubah) =================
create table if not exists public.biz_vocab (
  dim text not null check (dim in ('model', 'revenue', 'cap', 'channel', 'scale', 'ownership', 'omzet')),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null,
  hint text,
  sort int not null default 0,
  active boolean not null default true,
  primary key (dim, code)
);
alter table public.biz_vocab enable row level security;
drop policy if exists biz_vocab_read on public.biz_vocab;
create policy biz_vocab_read on public.biz_vocab for select using (true);
grant select on public.biz_vocab to anon, authenticated;

insert into public.biz_vocab(dim, code, label, hint, sort) values
  ('model', 'product_sales', 'Jual produk', null, 1), ('model', 'retail', 'Eceran', null, 2), ('model', 'wholesale', 'Grosir / B2B', null, 3),
  ('model', 'distribution', 'Distribusi', null, 4), ('model', 'service', 'Jasa / layanan', null, 5), ('model', 'food_beverage', 'Makanan & minuman', null, 6),
  ('model', 'rental', 'Sewa', null, 7), ('model', 'subscription', 'Langganan', null, 8), ('model', 'project', 'Berbasis proyek', null, 9),
  ('model', 'manufacturing', 'Produksi / manufaktur', null, 10), ('model', 'ecommerce', 'Toko online', null, 11), ('model', 'marketplace', 'Marketplace', null, 12),
  ('model', 'commission', 'Komisi / perantara', null, 13), ('model', 'hospitality', 'Penginapan & hospitality', null, 14),
  ('revenue', 'one_time', 'Sekali bayar per transaksi', null, 1), ('revenue', 'recurring', 'Pendapatan berulang', null, 2),
  ('revenue', 'contract', 'Nilai kontrak', null, 3), ('revenue', 'rental_income', 'Pendapatan sewa', null, 4), ('revenue', 'commission', 'Komisi', null, 5),
  ('revenue', 'milestone', 'Termin / pembayaran bertahap proyek', null, 6), ('revenue', 'subscription', 'Langganan', null, 7), ('revenue', 'membership', 'Iuran anggota', null, 8),
  ('cap', 'uses_inventory', 'Mengelola stok barang', null, 1), ('cap', 'uses_variants', 'Produk punya varian (ukuran, warna)', null, 2),
  ('cap', 'uses_ingredients', 'Memakai bahan baku', null, 3), ('cap', 'uses_recipes', 'Memakai resep / takaran', null, 4),
  ('cap', 'uses_production', 'Ada proses produksi', null, 5), ('cap', 'uses_job_orders', 'Ada pesanan kerja / work order', null, 6),
  ('cap', 'uses_booking', 'Menerima booking', null, 7), ('cap', 'uses_reservation', 'Menerima reservasi (meja, jadwal)', null, 8),
  ('cap', 'uses_customer_debt', 'Pelanggan bisa bayar belakangan (piutang/kasbon)', null, 9), ('cap', 'uses_suppliers', 'Belanja ke supplier', null, 10),
  ('cap', 'uses_shifts', 'Karyawan bergantian shift', null, 11), ('cap', 'uses_multi_outlet', 'Lebih dari satu cabang / outlet', null, 12),
  ('cap', 'uses_project_budget', 'Anggaran per proyek (RAB)', null, 13), ('cap', 'uses_asset_tracking', 'Mencatat aset / peralatan', null, 14),
  ('cap', 'uses_delivery', 'Antar / pengiriman', null, 15), ('cap', 'uses_returns', 'Ada retur & pengembalian dana', null, 16),
  ('cap', 'uses_quality_control', 'Ada pemeriksaan kualitas', null, 17), ('cap', 'uses_maintenance', 'Ada perawatan / perbaikan', null, 18),
  ('cap', 'uses_contracts', 'Memakai kontrak / perjanjian', null, 19), ('cap', 'uses_recurring_billing', 'Tagihan rutin (bulanan, mingguan)', null, 20),
  ('cap', 'uses_resource_scheduling', 'Menjadwalkan orang, alat, atau ruang', null, 21), ('cap', 'uses_approval', 'Perlu persetujuan berjenjang', null, 22),
  ('cap', 'uses_barcode', 'Pakai barcode / label harga', null, 23), ('cap', 'uses_expiry', 'Barang/bahan punya tanggal kedaluwarsa', null, 24),
  ('cap', 'uses_consignment', 'Menerima barang titipan (konsinyasi)', null, 25), ('cap', 'uses_utility_metering', 'Menagih listrik/air per meteran', null, 26),
  ('cap', 'uses_tax', 'Memungut PPN', null, 27),
  ('channel', 'physical_store', 'Toko / tempat usaha fisik', null, 1), ('channel', 'online_store', 'Toko online sendiri', null, 2),
  ('channel', 'marketplace', 'Marketplace', null, 3), ('channel', 'website', 'Website', null, 4), ('channel', 'social', 'Media sosial', null, 5),
  ('channel', 'whatsapp', 'WhatsApp', null, 6), ('channel', 'direct_sales', 'Penjualan langsung / tatap muka', null, 7),
  ('channel', 'distributor_network', 'Jaringan distributor / agen', null, 8), ('channel', 'field_sales', 'Sales lapangan', null, 9),
  ('scale', 'mikro', 'Mikro', 'Dikelola sendiri atau bersama keluarga', 1), ('scale', 'kecil', 'Kecil', 'Beberapa karyawan, 1–2 lokasi', 2),
  ('scale', 'menengah', 'Menengah', 'Tim beberapa bagian, beberapa cabang', 3), ('scale', 'besar', 'Besar', 'Banyak cabang & departemen', 4),
  ('scale', 'enterprise', 'Enterprise', 'Grup usaha, banyak entitas', 5),
  ('ownership', 'perorangan', 'Perorangan', null, 1), ('ownership', 'keluarga', 'Usaha keluarga', null, 2), ('ownership', 'cv', 'CV', null, 3),
  ('ownership', 'pt', 'PT', null, 4), ('ownership', 'koperasi', 'Koperasi', null, 5), ('ownership', 'yayasan', 'Yayasan', null, 6),
  ('ownership', 'waralaba', 'Waralaba', null, 7), ('ownership', 'lainnya', 'Lainnya', null, 8),
  ('omzet', 'lt10', 'Di bawah Rp10 juta/bulan', null, 1), ('omzet', 'r10_50', 'Rp10–50 juta/bulan', null, 2), ('omzet', 'r50_250', 'Rp50–250 juta/bulan', null, 3),
  ('omzet', 'r250_1m', 'Rp250 juta–1 miliar/bulan', null, 4), ('omzet', 'gt1m', 'Di atas Rp1 miliar/bulan', null, 5)
on conflict (dim, code) do nothing;

-- DNA bawaan per kategori (model, pendapatan, kapabilitas, kanal) — titik awal; pemilik yang menyesuaikan
update public.biz_categories c set supported_models = x.m, default_revenue = x.r, default_caps = x.k, default_channels = x.ch from (values
  ('retail', '{retail,product_sales}'::text[], '{one_time}'::text[], '{uses_inventory,uses_suppliers,uses_customer_debt,uses_returns}'::text[], '{physical_store,whatsapp}'::text[]),
  ('distribusi', '{wholesale,distribution}', '{one_time}', '{uses_inventory,uses_suppliers,uses_customer_debt,uses_delivery}', '{direct_sales,field_sales,whatsapp}'),
  ('properti', '{rental}', '{rental_income,recurring}', '{uses_booking,uses_recurring_billing,uses_contracts,uses_maintenance}', '{physical_store,whatsapp}'),
  ('hospitality', '{hospitality,rental}', '{rental_income,one_time}', '{uses_booking,uses_reservation,uses_maintenance}', '{physical_store,marketplace,whatsapp}'),
  ('kuliner', '{food_beverage,product_sales}', '{one_time}', '{uses_ingredients,uses_recipes,uses_inventory,uses_suppliers,uses_shifts}', '{physical_store,whatsapp}'),
  ('laundry', '{service}', '{one_time}', '{uses_job_orders,uses_delivery,uses_quality_control}', '{physical_store,whatsapp}'),
  ('manufaktur', '{manufacturing,product_sales}', '{one_time}', '{uses_production,uses_ingredients,uses_inventory,uses_suppliers,uses_quality_control}', '{direct_sales,whatsapp}'),
  ('profesional', '{service,project}', '{one_time,contract}', '{uses_job_orders,uses_contracts}', '{direct_sales,whatsapp}'),
  ('kesehatan', '{service}', '{one_time}', '{uses_booking,uses_resource_scheduling,uses_shifts}', '{physical_store,whatsapp}'),
  ('pendidikan', '{service,subscription}', '{recurring,membership}', '{uses_recurring_billing,uses_resource_scheduling}', '{physical_store,whatsapp}'),
  ('event', '{project,service}', '{contract,milestone}', '{uses_contracts,uses_project_budget,uses_resource_scheduling}', '{direct_sales,social,whatsapp}'),
  ('otomotif', '{service,product_sales}', '{one_time}', '{uses_job_orders,uses_inventory,uses_suppliers,uses_maintenance}', '{physical_store,whatsapp}'),
  ('pertanian', '{product_sales,manufacturing}', '{one_time}', '{uses_production,uses_inventory,uses_suppliers,uses_asset_tracking}', '{direct_sales,whatsapp}'),
  ('konstruksi', '{project}', '{contract,milestone}', '{uses_project_budget,uses_contracts,uses_suppliers,uses_approval}', '{direct_sales}'),
  ('travel', '{service,commission}', '{one_time,commission}', '{uses_booking,uses_resource_scheduling}', '{social,whatsapp,website}'),
  ('ecommerce', '{ecommerce,retail,product_sales}', '{one_time}', '{uses_inventory,uses_variants,uses_delivery,uses_returns,uses_suppliers}', '{online_store,marketplace,social}'),
  ('teknologi', '{service,subscription,project}', '{recurring,contract,subscription}', '{uses_contracts,uses_recurring_billing,uses_job_orders}', '{website,direct_sales}'),
  ('media', '{service,project}', '{contract,milestone}', '{uses_job_orders,uses_contracts,uses_project_budget}', '{social,website,direct_sales}'),
  ('keuangan', '{service,commission}', '{commission,contract}', '{uses_contracts,uses_recurring_billing,uses_approval}', '{direct_sales,whatsapp}'),
  ('rental', '{rental}', '{rental_income}', '{uses_booking,uses_asset_tracking,uses_maintenance,uses_contracts}', '{physical_store,whatsapp}'),
  ('lainnya', '{service,subscription}', '{membership,recurring}', '{uses_recurring_billing}', '{whatsapp}')
) as x(c, m, r, k, ch) where c.code = x.c;
update public.biz_categories c set default_features = coalesce((select array_agg(v) from jsonb_array_elements_text(t.spec->'modules') v), '{}')
from public.biz_templates t where t.code = c.template;

-- Pembeda subkategori dalam kategori yang sama (uji "Same Category Differentiation")
update public.biz_subcategories s set supported_models = x.m, default_caps = x.k from (values
  ('retail_sembako', '{}'::text[], '{uses_customer_debt}'::text[]),
  ('retail_grosir', '{wholesale}', '{uses_customer_debt,uses_delivery}'),
  ('retail_pakaian', '{}', '{uses_variants,uses_barcode}'),
  ('retail_elektronik', '{service}', '{uses_returns,uses_maintenance,uses_barcode}'),
  ('retail_minimarket', '{}', '{uses_barcode,uses_shifts,uses_expiry}'),
  ('retail_supermarket', '{}', '{uses_barcode,uses_shifts,uses_expiry,uses_consignment}'),
  ('retail_apotek', '{}', '{uses_expiry,uses_barcode}'),
  ('retail_kosmetik', '{}', '{uses_variants,uses_expiry}'),
  ('retail_bangunan', '{wholesale}', '{uses_delivery}'),
  ('retail_sparepart', '{}', '{uses_barcode}'),
  ('kuliner_coffee', '{}', '{uses_shifts}'),
  ('kuliner_restoran', '{}', '{uses_reservation}'),
  ('kuliner_katering', '{project}', '{uses_delivery,uses_contracts}'),
  ('kuliner_bakery', '{manufacturing}', '{uses_production,uses_expiry}'),
  ('kuliner_cloud', '{ecommerce}', '{uses_delivery}'),
  ('laundry_laundry', '{}', '{uses_delivery}'),
  ('properti_kos', '{}', '{uses_utility_metering}'),
  ('distribusi_coldchain', '{}', '{uses_expiry,uses_asset_tracking}')
) as x(c, m, k) where s.code = x.c;

-- Super Admin: ubah DNA bawaan kategori/subkategori (tanpa kode)
create or replace function public.admin_biz_category_dna(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_old jsonb; f text; v_dim text;
begin
  if not admin_can('plans.manage') then raise exception 'Khusus Super Admin'; end if;
  foreach f in array array['models', 'revenue', 'caps', 'channels'] loop
    v_dim := case f when 'models' then 'model' when 'revenue' then 'revenue' when 'caps' then 'cap' else 'channel' end;
    if p ? f and exists (select 1 from jsonb_array_elements_text(p->f) v where not exists (select 1 from biz_vocab b where b.dim = v_dim and b.code = v)) then
      raise exception 'Kode % tidak dikenal', f; end if;
  end loop;
  if coalesce(p->>'kind', 'kategori') = 'kategori' then
    select to_jsonb(c) into v_old from biz_categories c where code = p->>'code';
    if v_old is null then raise exception 'Kategori tidak dikenal'; end if;
    update biz_categories set
      supported_models = coalesce((select array_agg(distinct v) from jsonb_array_elements_text(p->'models') v), supported_models),
      default_revenue = coalesce((select array_agg(distinct v) from jsonb_array_elements_text(p->'revenue') v), default_revenue),
      default_caps = coalesce((select array_agg(distinct v) from jsonb_array_elements_text(p->'caps') v), default_caps),
      default_channels = coalesce((select array_agg(distinct v) from jsonb_array_elements_text(p->'channels') v), default_channels)
    where code = p->>'code';
  else
    select to_jsonb(s) into v_old from biz_subcategories s where code = p->>'code';
    if v_old is null then raise exception 'Subkategori tidak dikenal'; end if;
    update biz_subcategories set
      supported_models = coalesce((select array_agg(distinct v) from jsonb_array_elements_text(p->'models') v), supported_models),
      default_caps = coalesce((select array_agg(distinct v) from jsonb_array_elements_text(p->'caps') v), default_caps),
      default_channels = coalesce((select array_agg(distinct v) from jsonb_array_elements_text(p->'channels') v), default_channels)
    where code = p->>'code';
  end if;
  insert into admin_log(actor_email, action, detail) values (actor_email(), 'ubah_dna_kategori', jsonb_build_object('sebelum', v_old, 'sesudah', p));
end $$;
revoke execute on function public.admin_biz_category_dna(jsonb) from public, anon;
grant execute on function public.admin_biz_category_dna(jsonb) to authenticated;

-- ================= 3. Business DNA per bisnis =================
create table if not exists public.business_profiles (
  kos_id uuid primary key references public.kos(id) on delete cascade,
  dna jsonb not null,
  version int not null default 1,
  source text not null default 'owner' check (source in ('onboarding', 'owner')),
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.business_profiles enable row level security;
drop policy if exists business_profiles_read on public.business_profiles;
create policy business_profiles_read on public.business_profiles for select using (public.is_member(kos_id));
grant select on public.business_profiles to authenticated;
drop trigger if exists zz_kos_open_guard on public.business_profiles;
create trigger zz_kos_open_guard before insert or update or delete on public.business_profiles for each row execute function public.kos_open_guard();

-- Gabungkan dua array teks (unik, terurut)
create or replace function public.tx_union(a text[], b text[])
returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct x order by x), '{}') from unnest(coalesce(a, '{}') || coalesce(b, '{}')) x where x is not null and x <> '';
$$;
create or replace function public.js_arr(j jsonb)
returns text[] language sql immutable as $$
  select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) x;
$$;

-- Kategori efektif bisnis lama (dibuat sebelum pendaftaran multi-kategori)
create or replace function public.biz_category_of(k public.kos)
returns text language sql stable as $$
  select coalesce(k.category_code, case k.business_type when 'properti' then 'properti' when 'retail' then 'retail'
    when 'jasa' then case when k.template_code = 'kuliner' then 'kuliner' else 'laundry' end else 'lainnya' end);
$$;

-- DNA bawaan: kategori + subkategori + isian pendaftaran. Tidak mengarang angka.
create or replace function public.dna_default(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k kos; c biz_categories; s biz_subcategories; v_caps text[]; v_models text[]; v_needs text[]; v_br int; m jsonb;
begin
  select * into k from kos where id = p_kos;
  if k.id is null then return null; end if;
  select * into c from biz_categories where code = biz_category_of(k);
  select * into s from biz_subcategories where code = k.subcategory_code;
  m := coalesce(k.setup_meta, '{}');
  v_needs := js_arr(m->'needs');
  v_br := coalesce(nullif(m->>'branches', '')::int, 0);
  v_caps := tx_union(c.default_caps, s.default_caps);
  v_models := tx_union(c.supported_models, s.supported_models);
  if 'stok' = any(v_needs) then v_caps := tx_union(v_caps, '{uses_inventory}'); end if;
  if 'pembelian' = any(v_needs) then v_caps := tx_union(v_caps, '{uses_suppliers}'); end if;
  if v_br > 0 then v_caps := tx_union(v_caps, '{uses_multi_outlet}'); end if;
  if (m->'answers'->>'delivery') = 'true' then v_caps := tx_union(v_caps, '{uses_delivery}'); end if;
  if m->'answers'->>'sales_mode' in ('Grosir', 'Eceran & grosir') then v_models := tx_union(v_models, '{wholesale}'); end if;
  if coalesce((k.profile->'tax'->>'aktif')::boolean, false) then v_caps := tx_union(v_caps, '{uses_tax}'); end if;
  return jsonb_build_object(
    'identity', jsonb_build_object('secondary_category', null, 'ownership', null, 'custom_label', ''),
    'models', to_jsonb(v_models), 'revenue', to_jsonb(coalesce(c.default_revenue, '{}')), 'caps', to_jsonb(v_caps),
    'scale', case when m->>'managed' = 'tim' or 'karyawan' = any(v_needs) then 'kecil' else 'mikro' end,
    'indicators', jsonb_build_object('employees', null, 'outlets', 1 + v_br, 'tx_month', null, 'omzet', null),
    'channels', to_jsonb(tx_union(c.default_channels, s.default_channels)));
end $$;
revoke execute on function public.dna_default(uuid) from public, anon, authenticated;

create or replace function public.dna_effective(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select dna from business_profiles where kos_id = p_kos), dna_default(p_kos));
$$;
revoke execute on function public.dna_effective(uuid) from public, anon, authenticated;

-- Validasi & bentuk kanonik DNA (server = sumber kebenaran)
create or replace function public.dna_clean(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; d text; f text; arr text[]; bad text; v_int int; ind jsonb := coalesce(p->'indicators', '{}'); idn jsonb := coalesce(p->'identity', '{}');
        out_ind jsonb := '{}'; k text;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Data profil bisnis tidak valid'; end if;
  r := '{}';
  foreach f in array array['models', 'revenue', 'caps', 'channels'] loop
    d := case f when 'models' then 'model' when 'revenue' then 'revenue' when 'caps' then 'cap' else 'channel' end;
    if p ? f and jsonb_typeof(p->f) <> 'array' then raise exception 'Data profil bisnis tidak valid (%)', f; end if;
    arr := js_arr(p->f);
    select string_agg(x, ', ') into bad from unnest(arr) x where not exists (select 1 from biz_vocab v where v.dim = d and v.code = x and v.active);
    if bad is not null then raise exception 'Pilihan tidak dikenal: %', bad; end if;
    r := r || jsonb_build_object(f, to_jsonb(tx_union(arr, '{}')));
  end loop;
  if jsonb_array_length(r->'models') = 0 then raise exception 'Pilih minimal satu model bisnis'; end if;
  if jsonb_array_length(r->'revenue') = 0 then raise exception 'Pilih minimal satu sumber pendapatan'; end if;
  if not exists (select 1 from biz_vocab where dim = 'scale' and code = p->>'scale' and active) then raise exception 'Pilih skala usaha'; end if;
  r := r || jsonb_build_object('scale', p->>'scale');
  foreach k in array array['employees', 'outlets', 'tx_month', 'customers', 'suppliers', 'assets'] loop
    if ind ? k and ind->>k is not null and ind->>k <> '' then
      if (ind->>k) !~ '^\d{1,9}$' then raise exception 'Angka % harus bilangan bulat', k; end if;
      v_int := (ind->>k)::int;
      if k = 'outlets' and v_int not between 1 and 10000 then raise exception 'Jumlah outlet/cabang 1–10.000'; end if;
      if v_int > 100000000 then raise exception 'Angka % terlalu besar', k; end if;
      out_ind := out_ind || jsonb_build_object(k, v_int);
    else out_ind := out_ind || jsonb_build_object(k, null); end if;
  end loop;
  if nullif(ind->>'omzet', '') is not null and not exists (select 1 from biz_vocab where dim = 'omzet' and code = ind->>'omzet') then raise exception 'Rentang omzet tidak dikenal'; end if;
  out_ind := out_ind || jsonb_build_object('omzet', nullif(ind->>'omzet', ''));
  r := r || jsonb_build_object('indicators', out_ind);
  if nullif(idn->>'ownership', '') is not null and not exists (select 1 from biz_vocab where dim = 'ownership' and code = idn->>'ownership') then raise exception 'Bentuk kepemilikan tidak dikenal'; end if;
  if nullif(idn->>'secondary_category', '') is not null and not exists (select 1 from biz_categories where code = idn->>'secondary_category' and active) then raise exception 'Kategori kedua tidak dikenal'; end if;
  if length(trim(coalesce(idn->>'custom_label', ''))) > 60 then raise exception 'Jenis usaha khusus maksimal 60 huruf'; end if;
  r := r || jsonb_build_object('identity', jsonb_build_object('secondary_category', nullif(idn->>'secondary_category', ''), 'ownership', nullif(idn->>'ownership', ''),
                                                             'custom_label', trim(coalesce(idn->>'custom_label', ''))));
  return r;
end $$;
revoke execute on function public.dna_clean(jsonb) from public, anon;
grant execute on function public.dna_clean(jsonb) to authenticated;

-- ================= 4. Sinyal nyata & tahap kematangan =================
create or replace function public.biz_signals(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with k as (select * from kos where id = p_kos)
  select jsonb_build_object(
    'employees', (select count(*) from kos_members m where m.kos_id = p_kos and m.active and m.role <> 'pemilik')
               + (select count(*) from staff s where s.kos_id = p_kos and s.active and s.member_user_id is null),
    'outlets', 1 + (select count(*) from branches b where b.kos_id = p_kos and b.kind = 'cabang' and b.active and not b.is_main),
    'products', (select count(*) from products p where p.kos_id = p_kos and p.active),
    'customers', (select count(*) from contacts c where c.kos_id = p_kos and c.kind = 'pelanggan'),
    'suppliers', (select count(*) from contacts c where c.kos_id = p_kos and c.kind = 'supplier'),
    'assets', (select count(*) from fixed_assets a where a.kos_id = p_kos),
    'tx30', (select count(*) from sales s where s.kos_id = p_kos and s.status <> 'batal' and s.sold_at >= now() - interval '30 days')
          + (select count(*) from svc_orders o where o.kos_id = p_kos and o.created_at >= now() - interval '30 days')
          + (select count(*) from payments y where y.kos_id = p_kos and y.status = 'terverifikasi' and y.paid_at >= (now() - interval '30 days')::date)
          + (select count(*) from bb_records r where r.kos_id = p_kos and r.created_at >= now() - interval '30 days'),
    'age_days', (select greatest(0, (now()::date - coalesce(k.activated_at, k.created_at)::date)) from k),
    'active', (select k.setup_status = 'active' and k.closed_at is null from k));
$$;
revoke execute on function public.biz_signals(uuid) from public, anon, authenticated;

-- Tahap: startup → early → growing → established → expansion → multi_branch → advanced (indikator, bukan label permanen)
create or replace function public.biz_stage(sig jsonb)
returns text language sql immutable as $$
  select case
    when not coalesce((sig->>'active')::boolean, false) then 'startup'
    when (sig->>'outlets')::int >= 3 and (sig->>'employees')::int >= 10 and (sig->>'tx30')::int >= 1000 then 'advanced'
    when (sig->>'outlets')::int >= 3 then 'multi_branch'
    when (sig->>'outlets')::int = 2 then 'expansion'
    when (sig->>'age_days')::int >= 180 and (sig->>'tx30')::int >= 100 then 'established'
    when (sig->>'tx30')::int >= 30 or (sig->>'employees')::int >= 1 then 'growing'
    when (sig->>'tx30')::int > 0 or (sig->>'age_days')::int >= 14 then 'early'
    else 'startup' end;
$$;

-- ================= 5. Feature Catalog: metadata relevansi + rule registry =================
alter table public.modules add column if not exists rel_models text[] not null default '{}';
alter table public.modules add column if not exists rel_caps text[] not null default '{}';
alter table public.modules add column if not exists rel_categories text[] not null default '{}';
alter table public.modules add column if not exists min_scale text;
alter table public.modules add column if not exists benefit text;

update public.modules m set rel_models = x.mo, rel_caps = x.ca, min_scale = x.sc, benefit = x.b from (values
  ('p_pengeluaran', '{rental,hospitality}'::text[], '{uses_maintenance}'::text[], null::text, 'Biaya listrik, perbaikan, dan gaji ikut tercatat sehingga laba bersih terlihat apa adanya.'),
  ('p_pengingat', '{rental}', '{uses_recurring_billing}', null, 'Penghuni & Anda diingatkan sebelum jatuh tempo — tunggakan berkurang tanpa menagih manual.'),
  ('p_booking', '{rental,hospitality}', '{uses_booking,uses_reservation}', null, 'Kamar yang sudah dipesan terkunci, uang tanda jadi tercatat terpisah sampai check-in.'),
  ('p_portal', '{rental}', '{uses_recurring_billing}', null, 'Penghuni melihat tagihan & mengirim bukti transfer sendiri dari HP.'),
  ('p_perbaikan', '{rental,hospitality}', '{uses_maintenance}', null, 'Keluhan kamar tercatat sampai selesai, biaya perbaikan masuk pengeluaran.'),
  ('p_meteran', '{rental}', '{uses_utility_metering}', null, 'Angka meteran listrik/air langsung jadi tagihan tambahan yang benar.'),
  ('j_bahan', '{food_beverage,service}', '{uses_inventory,uses_ingredients}', null, 'Stok bahan (deterjen, bahan baku) terpantau dan tidak tiba-tiba habis.'),
  ('j_antar', '{service,food_beverage}', '{uses_delivery}', null, 'Jadwal jemput & antar, ongkos per wilayah, dan status pengantaran dalam satu layar.'),
  ('r_belanja', '{retail,wholesale,distribution,food_beverage}', '{uses_suppliers}', null, 'Pesanan ke supplier, barang diterima, dan utang supplier tercatat rapi.'),
  ('r_kontak', '{retail,wholesale,distribution}', '{uses_customer_debt,uses_suppliers}', null, 'Daftar pelanggan & supplier dengan saldo kasbon/utang masing-masing.'),
  ('r_shift', '{retail,food_beverage}', '{uses_shifts}', null, 'Uang laci dihitung per pergantian kasir — selisih langsung terlihat.'),
  ('r_label', '{retail}', '{uses_barcode}', null, 'Cetak barcode & label harga, kasir cukup memindai.'),
  ('r_pengingat', '{retail,wholesale}', '{uses_inventory,uses_customer_debt}', null, 'Diingatkan stok menipis & kasbon jatuh tempo lewat email.'),
  ('u_karyawan', '{}', '{uses_shifts}', null, 'Karyawan mencatat dari akun sendiri dengan menu sesuai perannya.'),
  ('u_akuntansi', '{}', '{}', 'kecil', 'Jurnal, neraca, dan laba rugi otomatis dari transaksi harian.'),
  ('u_penawaran', '{wholesale,distribution}', '{uses_customer_debt,uses_contracts}', null, 'Penawaran → pesanan → surat jalan → faktur untuk pelanggan grosir/B2B.'),
  ('u_kredit', '{wholesale,distribution}', '{uses_customer_debt}', null, 'Batas kredit & daftar harga khusus per pelanggan.'),
  ('r_batch', '{retail,food_beverage}', '{uses_expiry}', null, 'Barang dekat kedaluwarsa terlihat lebih awal, penjualan memakai stok terlama dulu.'),
  ('u_sdm', '{}', '{uses_shifts}', 'kecil', 'Absensi, jadwal shift, gaji, dan kasbon karyawan dalam satu tempat.'),
  ('u_aset', '{rental}', '{uses_asset_tracking}', null, 'Daftar aset & penyusutan bulanan otomatis di pembukuan.'),
  ('j_resep', '{food_beverage}', '{uses_recipes,uses_ingredients}', null, 'Bahan terpotong otomatis per menu; food cost & margin per menu terlihat.'),
  ('r_promo', '{retail,ecommerce}', '{}', null, 'Diskon terjadwal, beli X gratis Y, dan paket bundling langsung dihitung di kasir.'),
  ('r_konsinyasi', '{retail}', '{uses_consignment}', null, 'Barang titipan tercatat terpisah; setoran ke penitip dihitung otomatis.'),
  ('u_crm', '{}', '{}', null, 'Calon pelanggan tidak terlupa: catat, tindak lanjuti, dan ubah jadi transaksi.'),
  ('u_halaman', '{}', '{}', null, 'Halaman bisnis, tautan, dan QR agar pelanggan bisa melihat & memesan sendiri.')
) as x(c, mo, ca, sc, b) where m.code = x.c;

create table if not exists public.relevance_rules (
  code text primary key check (code ~ '^[A-Z][A-Z0-9_]{2,40}$'),
  name text not null,
  cond jsonb not null default '{}',     -- models_any, revenue_any, caps_any, caps_all, channels_any, engines_any, categories_any, scale_in,
                                         -- employees_min, outlets_min, products_min, tx30_min (semua harus terpenuhi)
  recommend text[] not null,
  reason text not null,                  -- kalimat alasan untuk pemilik
  event text,                            -- peristiwa lifecycle yang diwakili (NEW_OUTLET_ADDED, dll.)
  active boolean not null default true,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.relevance_rules enable row level security;
drop policy if exists relevance_rules_read on public.relevance_rules;
create policy relevance_rules_read on public.relevance_rules for select to authenticated using (true);
grant select on public.relevance_rules to authenticated;

insert into public.relevance_rules(code, name, cond, recommend, reason, event) values
  ('FNB_INGREDIENTS', 'F&B memakai bahan baku', '{"models_any":["food_beverage"],"caps_all":["uses_ingredients"]}', '{j_bahan,j_resep,r_belanja,r_kontak}',
   'Usaha makanan/minuman Anda memakai bahan baku', null),
  ('SERVICE_JOBS', 'Jasa dengan pesanan kerja', '{"models_any":["service"],"caps_any":["uses_job_orders"]}', '{r_kontak,u_crm}', 'Usaha jasa dengan pesanan kerja dari pelanggan', null),
  ('MULTI_OUTLET_DNA', 'Banyak outlet (profil)', '{"caps_any":["uses_multi_outlet"]}', '{u_karyawan,u_akuntansi}', 'Anda mengelola lebih dari satu cabang/outlet', null),
  ('MULTI_OUTLET_DATA', 'Cabang bertambah', '{"outlets_min":2}', '{u_karyawan,u_akuntansi,u_sdm}', 'Cabang/outlet aktif Anda sekarang lebih dari satu', 'NEW_OUTLET_ADDED'),
  ('RECURRING', 'Pendapatan berulang', '{"caps_any":["uses_recurring_billing"]}', '{p_pengingat,p_portal}', 'Ada tagihan rutin yang perlu ditagih tepat waktu', null),
  ('RECURRING_REV', 'Model pendapatan berulang', '{"revenue_any":["recurring","subscription","rental_income","membership"]}', '{p_pengingat,p_portal}', 'Sumber pendapatan Anda berulang (sewa/langganan/iuran)', 'REVENUE_MODEL_CHANGED'),
  ('RENTAL_ASSETS', 'Sewa dengan aset', '{"models_any":["rental","hospitality"],"caps_any":["uses_asset_tracking"]}', '{u_aset,p_booking,p_perbaikan}', 'Bisnis sewa Anda mengelola aset fisik', null),
  ('CUSTOMER_DEBT', 'Pelanggan bayar belakangan', '{"caps_any":["uses_customer_debt"]}', '{r_kontak,r_pengingat,u_kredit}', 'Ada pelanggan yang membayar belakangan (kasbon/piutang)', null),
  ('WHOLESALE', 'Grosir / B2B', '{"models_any":["wholesale","distribution"]}', '{u_penawaran,u_kredit,r_kontak,r_belanja}', 'Anda menjual grosir / ke pelanggan bisnis', null),
  ('SUPPLIERS', 'Belanja ke supplier', '{"caps_any":["uses_suppliers"]}', '{r_belanja,r_kontak}', 'Anda rutin belanja ke supplier', null),
  ('STAFF', 'Ada karyawan', '{"employees_min":1}', '{u_karyawan}', 'Bisnis Anda punya karyawan', 'EMPLOYEE_COUNT_INCREASED'),
  ('STAFF_PAYROLL', 'Tim bertambah', '{"employees_min":3}', '{u_sdm}', 'Karyawan Anda 3 orang atau lebih — absensi & gaji perlu rapi', 'EMPLOYEE_COUNT_INCREASED'),
  ('SHIFTS', 'Karyawan bergantian shift', '{"caps_any":["uses_shifts"]}', '{r_shift,u_sdm,u_karyawan}', 'Karyawan Anda bekerja bergantian shift', null),
  ('ONLINE_CHANNEL', 'Kanal online', '{"channels_any":["online_store","website","social","marketplace","whatsapp"]}', '{u_halaman,u_crm}', 'Pelanggan Anda datang lewat kanal online/WhatsApp', null),
  ('EXPIRY', 'Barang berkedaluwarsa', '{"caps_any":["uses_expiry"]}', '{r_batch}', 'Barang/bahan Anda punya tanggal kedaluwarsa', null),
  ('BARCODE', 'Pakai barcode', '{"caps_any":["uses_barcode"]}', '{r_label}', 'Anda memakai barcode/label harga', null),
  ('INVENTORY_GROWTH', 'Persediaan bertambah', '{"products_min":100}', '{r_label,r_pengingat,r_batch}', 'Barang aktif Anda sudah 100 jenis atau lebih', 'INVENTORY_USAGE_DETECTED'),
  ('TX_VOLUME', 'Transaksi meningkat', '{"tx30_min":300}', '{u_akuntansi}', 'Transaksi 30 hari terakhir 300 atau lebih — pembukuan otomatis membantu', null),
  ('SCALE_ACCOUNTING', 'Skala kecil ke atas', '{"scale_in":["kecil","menengah","besar","enterprise"]}', '{u_akuntansi}', 'Skala usaha Anda butuh laporan keuangan lengkap', null),
  ('ASSETS', 'Mencatat aset', '{"caps_any":["uses_asset_tracking"]}', '{u_aset}', 'Anda mencatat aset/peralatan usaha', null),
  ('MAINTENANCE', 'Perawatan & perbaikan', '{"caps_any":["uses_maintenance"]}', '{p_perbaikan}', 'Ada perawatan/perbaikan yang perlu dipantau', null),
  ('BOOKING', 'Booking & reservasi', '{"caps_any":["uses_booking","uses_reservation"]}', '{p_booking}', 'Anda menerima booking/reservasi', 'BOOKING_CAPABILITY_ENABLED'),
  ('DELIVERY', 'Antar jemput', '{"caps_any":["uses_delivery"]}', '{j_antar}', 'Anda melayani antar/jemput', null),
  ('CONSIGNMENT', 'Barang titipan', '{"caps_any":["uses_consignment"]}', '{r_konsinyasi}', 'Anda menerima barang titipan', null),
  ('RETAIL_PROMO', 'Toko eceran', '{"models_any":["retail","ecommerce"]}', '{r_promo}', 'Toko eceran biasanya memakai promo & paket', null),
  ('UTILITY_METER', 'Meteran listrik/air', '{"caps_any":["uses_utility_metering"]}', '{p_meteran}', 'Anda menagih listrik/air per meteran', null),
  ('PROPERTY_EXPENSE', 'Biaya properti', '{"engines_any":["properti"]}', '{p_pengeluaran}', 'Biaya operasional properti perlu dicatat agar laba terlihat', null),
  ('APPROVAL', 'Persetujuan berjenjang', '{"caps_any":["uses_approval"],"employees_min":1}', '{u_karyawan}', 'Transaksi tertentu perlu persetujuan sebelum dijalankan', null)
on conflict (code) do nothing;

create or replace function public.rule_match(c jsonb, dna jsonb, sig jsonb, p_engine text, p_category text)
returns boolean language sql immutable as $$
  select (not c ? 'models_any' or exists (select 1 from jsonb_array_elements_text(c->'models_any') x where coalesce(dna->'models', '[]') ? x))
     and (not c ? 'revenue_any' or exists (select 1 from jsonb_array_elements_text(c->'revenue_any') x where coalesce(dna->'revenue', '[]') ? x))
     and (not c ? 'caps_any' or exists (select 1 from jsonb_array_elements_text(c->'caps_any') x where coalesce(dna->'caps', '[]') ? x))
     and (not c ? 'caps_all' or not exists (select 1 from jsonb_array_elements_text(c->'caps_all') x where not coalesce(dna->'caps', '[]') ? x))
     and (not c ? 'channels_any' or exists (select 1 from jsonb_array_elements_text(c->'channels_any') x where coalesce(dna->'channels', '[]') ? x))
     and (not c ? 'engines_any' or c->'engines_any' ? p_engine)
     and (not c ? 'categories_any' or c->'categories_any' ? coalesce(p_category, ''))
     and (not c ? 'scale_in' or c->'scale_in' ? coalesce(dna->>'scale', ''))
     and (not c ? 'employees_min' or coalesce((sig->>'employees')::int, 0) >= (c->>'employees_min')::int)
     and (not c ? 'outlets_min' or coalesce((sig->>'outlets')::int, 1) >= (c->>'outlets_min')::int)
     and (not c ? 'products_min' or coalesce((sig->>'products')::int, 0) >= (c->>'products_min')::int)
     and (not c ? 'tx30_min' or coalesce((sig->>'tx30')::int, 0) >= (c->>'tx30_min')::int);
$$;

-- ================= 6. Rekomendasi (siklus hidup) =================
create table if not exists public.feature_recommendations (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  module_code text not null references public.modules(code),
  status text not null default 'recommended' check (status in ('recommended', 'accepted', 'rejected', 'deferred', 'activated', 'dismissed', 'expired')),
  rules text[] not null default '{}',
  reason text not null,
  benefit text,
  event text,
  score int,
  context_hash text not null,
  required_entitlement text,
  defer_until date,
  note text,
  decided_by text,
  decided_at timestamptz,
  history jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists feature_reco_open on public.feature_recommendations(kos_id, module_code) where status in ('recommended', 'deferred', 'accepted');
create index if not exists feature_reco_kos on public.feature_recommendations(kos_id, created_at desc);
alter table public.feature_recommendations enable row level security;
drop policy if exists feature_reco_read on public.feature_recommendations;
create policy feature_reco_read on public.feature_recommendations for select using (public.member_can(kos_id, 'settings'));
grant select on public.feature_recommendations to authenticated;
drop trigger if exists zz_kos_open_guard on public.feature_recommendations;
create trigger zz_kos_open_guard before insert or update or delete on public.feature_recommendations for each row execute function public.kos_open_guard();

-- ================= 7. Feature Relevance Engine =================
-- Hasil per modul: skor 0–100 (rincian 6 komponen), kelas relevansi, status fitur, aturan yang terpenuhi & alasannya.
create or replace function public.relevance_core(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k kos; v_engine text; v_cat text; dna jsonb; sig jsonb; v_rank int; out jsonb := '[]';
  m record; fired text[]; reasons text[]; s_cat int; s_op int; s_model int; s_scale int; s_owner int; s_flow int; v_score int; v_rel text; v_status text;
  v_on boolean; v_plan boolean; v_last text; v_open text; v_hits int; v_total int;
begin
  select * into k from kos where id = p_kos;
  v_engine := k.business_type; v_cat := biz_category_of(k);
  dna := dna_effective(p_kos);
  sig := biz_signals(p_kos);
  -- angka yang dinyatakan pemilik di profil ikut dihitung (sebelum data transaksi ada)
  sig := sig || jsonb_build_object(
    'employees', greatest(coalesce((sig->>'employees')::int, 0), coalesce((dna->'indicators'->>'employees')::int, 0)),
    'outlets', greatest(coalesce((sig->>'outlets')::int, 1), coalesce((dna->'indicators'->>'outlets')::int, 1)));
  v_rank := coalesce((select sort from biz_vocab where dim = 'scale' and code = dna->>'scale'), 1);
  for m in select * from modules where v_engine = any(applies_to) and impl_status <> 'deprecated' order by sort loop
    select coalesce(array_agg(r.code order by r.code), '{}'), coalesce(array_agg(r.reason order by r.code), '{}') into fired, reasons
      from relevance_rules r where r.active and m.code = any(r.recommend) and rule_match(r.cond, dna, sig, v_engine, v_cat);
    v_on := module_on(p_kos, m.code);
    v_plan := m.entitlement is null or plan_has(p_kos, m.entitlement);
    select f.status into v_last from feature_recommendations f where f.kos_id = p_kos and f.module_code = m.code order by f.updated_at desc limit 1;
    select f.status into v_open from feature_recommendations f where f.kos_id = p_kos and f.module_code = m.code and f.status in ('recommended', 'deferred', 'accepted') limit 1;
    s_cat := case when cardinality(m.rel_categories) > 0 then case when v_cat = any(m.rel_categories) then 100 else 20 end
                  when m.module_type = 'industry' or m.core then 100 else 60 end;
    v_total := cardinality(m.rel_caps);
    select count(*) into v_hits from unnest(m.rel_caps) x where coalesce(dna->'caps', '[]') ? x;
    s_op := case when v_total = 0 then 50 when v_hits = 0 then 0 else 70 + (30 * v_hits / v_total) end;
    s_model := case when cardinality(m.rel_models) = 0 then 50
                    when exists (select 1 from unnest(m.rel_models) x where coalesce(dna->'models', '[]') ? x) then 100 else 10 end;
    s_scale := case when m.min_scale is null then 100
                    when v_rank >= coalesce((select sort from biz_vocab where dim = 'scale' and code = m.min_scale), 1) then 100 else 30 end;
    -- preferensi pemilik: hanya keputusan nyata pemilik (aktif bawaan sistem saat bisnis dibuat = netral)
    s_owner := case when v_last in ('rejected', 'dismissed') then 0 when v_last = 'deferred' then 40 when v_last in ('accepted', 'activated') then 100
                    when not m.core and exists (select 1 from business_modules b where b.kos_id = p_kos and b.module_code = m.code
                                                and coalesce(b.updated_by, '') not in ('bawaan', 'sistem')) then case when v_on then 100 else 20 end
                    else 50 end;
    s_flow := case when cardinality(fired) > 0 then 100 else 30 end;
    v_score := round(0.20 * s_cat + 0.25 * s_op + 0.20 * s_model + 0.10 * s_scale + 0.10 * s_owner + 0.15 * s_flow);
    v_rel := case when m.impl_status in ('planned', 'in_development', 'testing') then 'planned'
                  when m.core then 'essential'
                  when not v_plan and not v_on then 'restricted'
                  when v_score >= 60 then 'highly' when v_score >= 40 then 'optional' else 'not_relevant' end;
    v_status := case when m.impl_status in ('planned', 'in_development', 'testing') then 'planned'
                     when v_on then 'active'
                     when not v_plan then 'restricted'
                     when v_open in ('recommended', 'deferred', 'accepted') then 'recommended'
                     when exists (select 1 from business_modules b where b.kos_id = p_kos and b.module_code = m.code and not b.active) then 'disabled'
                     else 'available' end;
    out := out || jsonb_build_array(jsonb_build_object(
      'code', m.code, 'name', m.name, 'description', m.description, 'benefit', m.benefit, 'core', m.core, 'module_type', m.module_type,
      'score', v_score, 'tier', case when v_score >= 80 then 'sangat' when v_score >= 60 then 'disarankan' when v_score >= 40 then 'opsional' else 'tidak' end,
      'breakdown', jsonb_build_object('category', s_cat, 'operational', s_op, 'model', s_model, 'scale', s_scale, 'owner', s_owner, 'workflow', s_flow),
      'relevance', v_rel, 'status', v_status, 'active', v_on, 'plan_ok', v_plan, 'entitlement', m.entitlement,
      'rules', to_jsonb(fired), 'reasons', to_jsonb(reasons), 'depends_on', m.depends_on, 'paths', m.paths, 'config_path', m.config_path,
      'last_decision', v_last));
  end loop;
  return jsonb_build_object('dna', dna, 'signals', sig, 'stage', biz_stage(sig), 'engine', v_engine, 'category', v_cat, 'modules', out);
end $$;
revoke execute on function public.relevance_core(uuid) from public, anon, authenticated;

create or replace function public.feature_relevance(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  return relevance_core(p_kos);
end $$;
revoke execute on function public.feature_relevance(uuid) from public, anon;
grant execute on function public.feature_relevance(uuid) to authenticated;

-- Segarkan rekomendasi (idempoten). Rekomendasi HANYA dari aturan yang terpenuhi (selalu ada alasan).
-- Ditolak/diabaikan tidak muncul lagi kecuali kumpulan aturan pemicunya berubah (context_hash).
create or replace function public.reco_refresh(p_kos uuid, p_event text default null)
returns int language plpgsql security definer set search_path = public as $$
declare rel jsonb; it jsonb; v_hash text; v_new int := 0; v_prev text := coalesce(current_setting('prasara.setup_ok', true), ''); v_closed timestamptz; r feature_recommendations;
begin
  select closed_at into v_closed from kos where id = p_kos;
  if v_closed is not null or not exists (select 1 from kos where id = p_kos) then return 0; end if;
  perform set_config('prasara.setup_ok', '1', true);
  rel := relevance_core(p_kos);
  for it in select * from jsonb_array_elements(rel->'modules') loop
    -- modul sudah aktif → rekomendasi terbuka selesai
    if (it->>'active')::boolean then
      update feature_recommendations set status = 'activated', updated_at = now(),
        history = history || jsonb_build_array(jsonb_build_object('at', now(), 'status', 'activated', 'by', 'sistem'))
      where kos_id = p_kos and module_code = it->>'code' and status in ('recommended', 'deferred', 'accepted');
      continue;
    end if;
    if it->>'relevance' in ('planned', 'essential') or jsonb_array_length(it->'rules') = 0 then
      update feature_recommendations set status = 'expired', updated_at = now(),
        history = history || jsonb_build_array(jsonb_build_object('at', now(), 'status', 'expired', 'by', 'sistem', 'note', 'Alasan rekomendasi tidak berlaku lagi'))
      where kos_id = p_kos and module_code = it->>'code' and status in ('recommended', 'deferred');
      continue;
    end if;
    v_hash := md5(it->>'code' || ':' || (select string_agg(x, ',' order by x) from jsonb_array_elements_text(it->'rules') x));
    select * into r from feature_recommendations where kos_id = p_kos and module_code = it->>'code' and status in ('recommended', 'deferred', 'accepted');
    if r.id is not null then
      update feature_recommendations set score = (it->>'score')::int, rules = js_arr(it->'rules'),
        reason = array_to_string(js_arr(it->'reasons'), '; '), context_hash = v_hash, updated_at = now(),
        status = case when status = 'deferred' and defer_until <= (now() at time zone 'Asia/Jakarta')::date then 'recommended' else status end
      where id = r.id;
      continue;
    end if;
    -- keputusan terakhir menolak/mengabaikan dengan alasan yang sama → jangan ulangi
    if exists (select 1 from feature_recommendations where kos_id = p_kos and module_code = it->>'code' and status in ('rejected', 'dismissed') and context_hash = v_hash) then
      continue;
    end if;
    insert into feature_recommendations(kos_id, module_code, status, rules, reason, benefit, event, score, context_hash, required_entitlement, history)
    values (p_kos, it->>'code', 'recommended', js_arr(it->'rules'), array_to_string(js_arr(it->'reasons'), '; '),
            (select benefit from modules where code = it->>'code'), p_event, (it->>'score')::int, v_hash, it->>'entitlement',
            jsonb_build_array(jsonb_build_object('at', now(), 'status', 'recommended', 'by', 'sistem', 'event', p_event)));
    v_new := v_new + 1;
  end loop;
  perform set_config('prasara.setup_ok', v_prev, true);
  return v_new;
end $$;
revoke execute on function public.reco_refresh(uuid, text) from public, anon, authenticated;

-- Pemicu peristiwa lifecycle: TIDAK PERNAH menggagalkan transaksi utama
create or replace function public.exp_event(p_kos uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
begin
  begin
    perform reco_refresh(p_kos, p_event);
  exception when others then null;
  end;
end $$;
revoke execute on function public.exp_event(uuid, text) from public, anon, authenticated;

create or replace function public.exp_event_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform exp_event(new.kos_id, tg_argv[0]);
  return null;
end $$;
drop trigger if exists exp_branches on public.branches;
create trigger exp_branches after insert or update of active on public.branches for each row execute function public.exp_event_trg('NEW_OUTLET_ADDED');
drop trigger if exists exp_members on public.kos_members;
create trigger exp_members after insert or update of active on public.kos_members for each row execute function public.exp_event_trg('EMPLOYEE_COUNT_INCREASED');
drop trigger if exists exp_staff on public.staff;
create trigger exp_staff after insert on public.staff for each row execute function public.exp_event_trg('EMPLOYEE_COUNT_INCREASED');
drop trigger if exists exp_plan on public.plan_activations;
create trigger exp_plan after insert on public.plan_activations for each row execute function public.exp_event_trg('SUBSCRIPTION_CHANGED');

-- Keputusan pemilik atas rekomendasi. Terima = aktivasi lewat module_set (izin, paket, dependensi tetap dicek).
create or replace function public.reco_decide(p_kos uuid, p_id uuid, p_action text, p_note text default null, p_days int default 7)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r feature_recommendations; v_res text; v_status text; v_msg text;
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  select * into r from feature_recommendations where id = p_id and kos_id = p_kos for update;
  if r.id is null then raise exception 'Rekomendasi tidak ditemukan'; end if;
  if r.status not in ('recommended', 'deferred', 'accepted') then raise exception 'Rekomendasi ini sudah diputuskan'; end if;
  if p_action not in ('terima', 'tolak', 'tunda', 'abaikan') then raise exception 'Tindakan tidak dikenal'; end if;
  if p_action = 'tunda' and coalesce(p_days, 0) not between 1 and 90 then raise exception 'Tunda 1–90 hari'; end if;
  if p_action = 'terima' then
    begin
      v_res := module_set(p_kos, r.module_code, true, coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Menerima rekomendasi PRASARA'));
      v_status := case when v_res = 'menunggu' then 'accepted' else 'activated' end;
      v_msg := case when v_res = 'menunggu' then 'Menunggu persetujuan pemilik' else 'Modul diaktifkan' end;
    exception when others then
      -- tidak bisa diaktifkan (paket/dependensi): diterima tetapi belum aktif, alasan dikembalikan apa adanya
      v_status := 'accepted'; v_msg := sqlerrm;
    end;
  else
    v_status := case p_action when 'tolak' then 'rejected' when 'tunda' then 'deferred' else 'dismissed' end;
  end if;
  update feature_recommendations set status = v_status, note = nullif(trim(coalesce(p_note, '')), ''), decided_by = actor_email(), decided_at = now(), updated_at = now(),
    defer_until = case when p_action = 'tunda' then (now() at time zone 'Asia/Jakarta')::date + p_days end,
    history = history || jsonb_build_array(jsonb_build_object('at', now(), 'status', v_status, 'by', actor_email(), 'note', coalesce(v_msg, p_note)))
  where id = p_id;
  perform config_log(p_kos, 'rekomendasi', r.module_code, jsonb_build_object('status', r.status), jsonb_build_object('status', v_status, 'tindakan', p_action),
                     coalesce(nullif(trim(coalesce(p_note, '')), ''), r.reason), 'rendah', actor_email());
  return jsonb_build_object('status', v_status, 'message', v_msg);
end $$;
revoke execute on function public.reco_decide(uuid, uuid, text, text, int) from public, anon;
grant execute on function public.reco_decide(uuid, uuid, text, text, int) to authenticated;

-- ================= 8. Konfigurasi pengalaman (navigasi, aksi cepat, dashboard) =================
create table if not exists public.experience_configs (
  kos_id uuid primary key references public.kos(id) on delete cascade,
  nav jsonb not null default '{}',     -- { main, hidden[], pins[], order[] }
  quick jsonb not null default '{}',   -- { order[], hidden[], fav[] }
  dash jsonb not null default '{}',    -- { <dashboard>: { hidden[], order[] } }
  version int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.experience_configs enable row level security;
drop policy if exists experience_configs_read on public.experience_configs;
create policy experience_configs_read on public.experience_configs for select using (public.is_member(kos_id));
grant select on public.experience_configs to authenticated;
drop trigger if exists zz_kos_open_guard on public.experience_configs;
create trigger zz_kos_open_guard before insert or update or delete on public.experience_configs for each row execute function public.kos_open_guard();

create or replace function public.exp_str_list(j jsonb, p_re text, p_max int, p_name text)
returns jsonb language plpgsql immutable as $$
declare a text[];
begin
  if j is null or j = 'null'::jsonb then return '[]'; end if;
  if jsonb_typeof(j) <> 'array' then raise exception 'Isian % tidak valid', p_name; end if;
  if jsonb_array_length(j) > p_max then raise exception 'Isian % maksimal % item', p_name, p_max; end if;
  if exists (select 1 from jsonb_array_elements(j) x where jsonb_typeof(x) <> 'string' or x #>> '{}' !~ p_re) then raise exception 'Isian % tidak valid', p_name; end if;
  select coalesce(array_agg(x order by o), '{}') into a from (select x, min(o) o from jsonb_array_elements_text(j) with ordinality t(x, o) group by x) s;
  return to_jsonb(a);
end $$;

create or replace function public.exp_clean(p_part text, p jsonb)
returns jsonb language plpgsql immutable as $$
declare path_re text := '^/[a-z0-9/_-]{0,80}$'; id_re text := '^[a-z0-9_-]{1,60}$'; key_re text := '^[a-z0-9_]{1,30}$'; r jsonb := '{}'; d text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Konfigurasi tidak valid'; end if;
  if p_part = 'nav' then
    if nullif(p->>'main', '') is not null and (p->>'main') !~ path_re then raise exception 'Menu utama tidak valid'; end if;
    r := jsonb_build_object('main', nullif(p->>'main', ''), 'hidden', exp_str_list(p->'hidden', path_re, 80, 'menu tersembunyi'),
      'pins', exp_str_list(p->'pins', path_re, 8, 'pintasan'), 'order', exp_str_list(p->'order', key_re, 30, 'urutan kelompok'));
  elsif p_part = 'quick' then
    r := jsonb_build_object('order', exp_str_list(p->'order', id_re, 60, 'urutan'), 'hidden', exp_str_list(p->'hidden', id_re, 60, 'disembunyikan'),
      'fav', exp_str_list(p->'fav', id_re, 6, 'favorit'));
  elsif p_part = 'dash' then
    for d in select jsonb_object_keys(p) loop
      if d not in ('kos', 'toko', 'jasa', 'kerja') then raise exception 'Dashboard tidak dikenal'; end if;
      if jsonb_typeof(p->d) <> 'object' then raise exception 'Konfigurasi dashboard tidak valid'; end if;
      r := r || jsonb_build_object(d, jsonb_build_object('hidden', exp_str_list(p->d->'hidden', id_re, 40, 'widget'), 'order', exp_str_list(p->d->'order', id_re, 40, 'urutan widget')));
    end loop;
  else raise exception 'Bagian konfigurasi tidak dikenal'; end if;
  return r;
end $$;

create or replace function public.exp_apply(p_kos uuid, p_part text, p_value jsonb, p_action text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_before jsonb; c experience_configs;
begin
  insert into experience_configs(kos_id) values (p_kos) on conflict do nothing;
  select * into c from experience_configs where kos_id = p_kos for update;
  v_before := case p_part when 'nav' then c.nav when 'quick' then c.quick else c.dash end;
  if v_before = p_value then return jsonb_build_object('version', c.version, 'changed', false); end if;
  update experience_configs set nav = case when p_part = 'nav' then p_value else nav end, quick = case when p_part = 'quick' then p_value else quick end,
    dash = case when p_part = 'dash' then p_value else dash end, version = version + 1, updated_at = now(), updated_by = actor_email()
  where kos_id = p_kos returning * into c;
  perform config_log(p_kos, p_action, p_part, v_before, p_value, nullif(trim(coalesce(p_reason, '')), ''), 'rendah', actor_email());
  return jsonb_build_object('version', c.version, 'changed', true);
end $$;
revoke execute on function public.exp_apply(uuid, text, jsonb, text, text) from public, anon, authenticated;

create or replace function public.experience_save(p_kos uuid, p_part text, p_value jsonb, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  return exp_apply(p_kos, p_part, exp_clean(p_part, p_value), 'ubah_tampilan', p_reason);
end $$;
revoke execute on function public.experience_save(uuid, text, jsonb, text) from public, anon;
grant execute on function public.experience_save(uuid, text, jsonb, text) to authenticated;

-- Kembalikan ke rekomendasi PRASARA (konfigurasi kosong = bawaan sistem)
create or replace function public.experience_reset(p_kos uuid, p_part text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  if p_part not in ('nav', 'quick', 'dash') then raise exception 'Bagian konfigurasi tidak dikenal'; end if;
  return exp_apply(p_kos, p_part, '{}'::jsonb, 'reset_tampilan', 'Kembali ke rekomendasi PRASARA');
end $$;
revoke execute on function public.experience_reset(uuid, text) from public, anon;
grant execute on function public.experience_reset(uuid, text) to authenticated;

-- ================= 9. DNA: baca & simpan (berversi) =================
create or replace function public.dna_save(p_kos uuid, p_dna jsonb, p_reason text default null, p_source text default 'owner')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb; v_prev text := coalesce(current_setting('prasara.setup_ok', true), ''); v_ver int; v_closed timestamptz; v_new int;
        ev text := 'BUSINESS_PROFILE_UPDATED';
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  select closed_at into v_closed from kos where id = p_kos;
  if v_closed is not null then raise exception 'Bisnis ini sudah ditutup (arsip hanya-baca).'; end if;
  if p_source not in ('owner', 'onboarding') then raise exception 'Sumber tidak dikenal'; end if;
  v_after := dna_clean(p_dna);
  if v_after->'identity'->>'secondary_category' = (select biz_category_of(k) from kos k where id = p_kos) then
    raise exception 'Kategori kedua harus berbeda dari kategori utama'; end if;
  v_before := dna_effective(p_kos);
  if v_before - 'source' = v_after and exists (select 1 from business_profiles where kos_id = p_kos) then
    return dna_get(p_kos);
  end if;
  if v_before->'revenue' is distinct from v_after->'revenue' then ev := 'REVENUE_MODEL_CHANGED'; end if;
  if not (coalesce(v_before->'caps', '[]'::jsonb) @> (v_after->'caps')) then ev := case when ev = 'REVENUE_MODEL_CHANGED' then ev else 'NEW_OPERATIONAL_CAPABILITY_ADDED' end; end if;
  perform set_config('prasara.setup_ok', '1', true);   -- profil boleh diisi saat bisnis masih draf (konfigurasi, bukan operasional)
  insert into business_profiles(kos_id, dna, version, source, updated_by) values (p_kos, v_after, 1, p_source, actor_email())
  on conflict (kos_id) do update set dna = excluded.dna, version = business_profiles.version + 1, source = excluded.source, updated_at = now(), updated_by = excluded.updated_by
  returning version into v_ver;
  perform config_log(p_kos, 'ubah_dna', 'Business DNA v' || v_ver, v_before, v_after, coalesce(nullif(trim(coalesce(p_reason, '')), ''), case p_source when 'onboarding' then 'Pendaftaran bisnis' else 'Profil bisnis diperbarui' end), 'rendah', actor_email());
  perform set_config('prasara.setup_ok', v_prev, true);
  v_new := reco_refresh(p_kos, ev);
  return dna_get(p_kos) || jsonb_build_object('new_recommendations', v_new, 'event', ev);
end $$;
revoke execute on function public.dna_save(uuid, jsonb, text, text) from public, anon;
grant execute on function public.dna_save(uuid, jsonb, text, text) to authenticated;

create or replace function public.dna_get(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k kos; p business_profiles;
begin
  if not is_member(p_kos) then raise exception 'Bisnis tidak ditemukan'; end if;
  select * into k from kos where id = p_kos;
  select * into p from business_profiles where kos_id = p_kos;
  return jsonb_build_object('dna', coalesce(p.dna, dna_default(p_kos)), 'stored', p.kos_id is not null, 'version', coalesce(p.version, 0),
    'source', coalesce(p.source, 'default'), 'updated_at', p.updated_at, 'engine', k.business_type, 'category', biz_category_of(k),
    'subcategory', k.subcategory_code, 'template', k.template_code, 'defaults', dna_default(p_kos));
end $$;
revoke execute on function public.dna_get(uuid) from public, anon;
grant execute on function public.dna_get(uuid) to authenticated;

-- Untuk KosProvider: DNA efektif + konfigurasi tampilan semua bisnis anggota (satu panggilan)
create or replace function public.my_experience()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(k.id, jsonb_build_object(
      'dna', dna_effective(k.id), 'dna_stored', exists (select 1 from business_profiles b where b.kos_id = k.id),
      'cfg', coalesce((select jsonb_build_object('nav', e.nav, 'quick', e.quick, 'dash', e.dash, 'version', e.version) from experience_configs e where e.kos_id = k.id),
                      '{"nav":{},"quick":{},"dash":{},"version":0}'::jsonb))), '{}')
  from kos k where is_member(k.id);
$$;
revoke execute on function public.my_experience() from public, anon;
grant execute on function public.my_experience() to authenticated;

-- ================= 10. Business Experience Center: ringkasan, riwayat, pemulihan =================
create or replace function public.experience_overview(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rel jsonb; v_stage text; v_last text; v_prev text := coalesce(current_setting('prasara.setup_ok', true), '');
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  perform exp_event(p_kos, 'BUSINESS_REVIEWED');
  rel := relevance_core(p_kos);
  v_stage := rel->>'stage';
  select after->>'stage' into v_last from config_history where kos_id = p_kos and action = 'tahap_bisnis' order by created_at desc limit 1;
  if v_last is distinct from v_stage and (select closed_at is null from kos where id = p_kos) then
    perform set_config('prasara.setup_ok', '1', true);
    -- dicatat atas nama sistem (bukan pengguna yang kebetulan membuka halaman)
    insert into config_history(kos_id, actor, action, target, before, after, reason, risk)
    values (p_kos, 'sistem', 'tahap_bisnis', v_stage, case when v_last is null then null else jsonb_build_object('stage', v_last) end,
            jsonb_build_object('stage', v_stage, 'signals', rel->'signals'), 'Dievaluasi dari data operasional', 'rendah');
    perform set_config('prasara.setup_ok', v_prev, true);
  end if;
  return rel || jsonb_build_object(
    'profile', dna_get(p_kos),
    'recommendations', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'module', f.module_code, 'name', m.name, 'description', m.description,
         'status', f.status, 'reason', f.reason, 'benefit', f.benefit, 'event', f.event, 'score', f.score, 'rules', f.rules,
         'entitlement', f.required_entitlement, 'plan_ok', f.required_entitlement is null or plan_has(p_kos, f.required_entitlement),
         'depends', (select coalesce(jsonb_agg(d.name), '[]') from modules d where d.code = any(m.depends_on) and not module_on(p_kos, d.code)),
         'defer_until', f.defer_until, 'note', f.note, 'decided_by', f.decided_by, 'decided_at', f.decided_at, 'created_at', f.created_at, 'history', f.history)
         order by case f.status when 'recommended' then 0 when 'accepted' then 1 when 'deferred' then 2 else 3 end, f.score desc nulls last, f.updated_at desc), '[]')
       from feature_recommendations f join modules m on m.code = f.module_code
       where f.kos_id = p_kos and (f.status in ('recommended', 'deferred', 'accepted') or f.updated_at >= now() - interval '90 days')),
    'config', coalesce((select jsonb_build_object('nav', e.nav, 'quick', e.quick, 'dash', e.dash, 'version', e.version, 'updated_at', e.updated_at, 'updated_by', e.updated_by)
                        from experience_configs e where e.kos_id = p_kos), '{"nav":{},"quick":{},"dash":{},"version":0}'::jsonb));
end $$;
revoke execute on function public.experience_overview(uuid) from public, anon;
grant execute on function public.experience_overview(uuid) to authenticated;

create or replace function public.experience_history(p_kos uuid, p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'at', h.created_at, 'actor', h.actor, 'action', h.action, 'target', h.target,
            'before', h.before, 'after', h.after, 'reason', h.reason,
            'restorable', h.action in ('ubah_tampilan', 'reset_tampilan', 'pulihkan_tampilan') or (h.action = 'ubah_dna' and h.before is not null))
          order by h.created_at desc, h.id desc), '[]')
    from (select * from config_history where kos_id = p_kos
            and action in ('ubah_dna', 'ubah_tampilan', 'reset_tampilan', 'pulihkan_tampilan', 'rekomendasi', 'tahap_bisnis', 'aktifkan_modul', 'nonaktifkan_modul', 'setup_draf')
          order by created_at desc, id desc limit least(greatest(coalesce(p_limit, 60), 1), 200)) h);
end $$;
revoke execute on function public.experience_history(uuid, int) from public, anon;
grant execute on function public.experience_history(uuid, int) to authenticated;

-- Pulihkan konfigurasi ke keadaan SEBELUM perubahan tertentu (rollback aman; tercatat sebagai versi baru)
create or replace function public.experience_restore(p_kos uuid, p_history bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h config_history;
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  select * into h from config_history where id = p_history and kos_id = p_kos;
  if h.id is null then raise exception 'Riwayat tidak ditemukan'; end if;
  if h.action in ('ubah_tampilan', 'reset_tampilan', 'pulihkan_tampilan') then
    if h.target not in ('nav', 'quick', 'dash') then raise exception 'Riwayat ini tidak bisa dipulihkan'; end if;
    return exp_apply(p_kos, h.target, exp_clean(h.target, coalesce(h.before, '{}'::jsonb)), 'pulihkan_tampilan',
                     'Dipulihkan ke keadaan sebelum perubahan ' || to_char(h.created_at at time zone 'Asia/Jakarta', 'DD/MM/YYYY HH24:MI'));
  elsif h.action = 'ubah_dna' and h.before is not null then
    return dna_save(p_kos, h.before, 'Dipulihkan ke profil sebelum ' || to_char(h.created_at at time zone 'Asia/Jakarta', 'DD/MM/YYYY HH24:MI'), 'owner');
  end if;
  raise exception 'Riwayat ini tidak bisa dipulihkan';
end $$;
revoke execute on function public.experience_restore(uuid, bigint) from public, anon;
grant execute on function public.experience_restore(uuid, bigint) to authenticated;

-- Evaluasi harian (cron, kunci server): segarkan rekomendasi semua bisnis aktif
create or replace function public.experience_tick()
returns jsonb language plpgsql security definer set search_path = public as $$
declare k record; n int := 0; v_new int := 0;
begin
  for k in select id from kos where setup_status = 'active' and closed_at is null and suspended_at is null order by id limit 5000 loop
    begin
      v_new := v_new + reco_refresh(k.id, 'DAILY_EVALUATION');
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  return jsonb_build_object('bisnis', n, 'rekomendasi_baru', v_new);
end $$;
revoke execute on function public.experience_tick() from public, anon, authenticated;
grant execute on function public.experience_tick() to service_role;
