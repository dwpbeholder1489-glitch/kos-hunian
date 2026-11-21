# Audit & Rencana — Adaptive Business Experience v3.0

Tanggal: 21 Nov 2026 · Dasar: dokumen "PRASARA Adaptive Business Experience & Universal Business Operating System v3.0" + gambar acuan "Adaptive Business Experience v2.0".
Kode yang diaudit: repo `kos-hunian` commit `cbf872e` (105 migrasi, 45 file uji SQL). Semua migrasi terpasang bersih di PostgreSQL 16 lokal (mock `auth`/`extensions`).

Status jujur: **Verified** = ada kode + uji; **Partial** = sebagian; **UI only** = tampilan tanpa server; **Belum** = tidak ada.

## 1. Existing Architecture Report

| Lapisan | Kondisi sekarang |
|---|---|
| Framework | Next.js 15 App Router + React 19, CSS global, Supabase (Postgres + RLS + RPC `security definer`), Vercel. Tanpa state manager: `KosProvider` (context) memuat semua bisnis anggota + modul aktif + lokasi + akses. |
| Multi-tenant | `kos` = bisnis (tenant). Semua tabel ber-`kos_id`, RLS `member_can(kos,'area')`, RPC `member_in(area,kos)`. Bisnis ditutup/draf dijaga trigger `zz_kos_open_guard`. Uji isolasi `supabase/tests/isolasi.sql`. **Verified** |
| Mesin bisnis (engine) | 4 mesin: `properti` (kos/sewa), `retail` (toko/grosir), `jasa` (laundry, jasa umum, **kuliner** = jasa + `template_code='kuliner'`), `kustom` (Business Builder: jenis data/alur/laporan + tata letak siap pakai per template). |
| Klasifikasi | `biz_categories` (15) → `biz_subcategories` (55) → `biz_templates` (19) → engine. Kode stabil, nama bisa diubah, Super Admin mengelola di /admin/kategori. **Partial** (spesifikasi: ≥20 kategori, model/pendapatan/kapabilitas bawaan, versi). |
| Profil bisnis | `kos.setup_meta` (status usaha, hubungan, cabang, jawaban template), `kos.profile` (jam, cara bayar, pajak, dll.), `PROFILE_Q` + `recommend()` di `lib/modules.js` (pertanyaan ya/tidak → modul). **Partial**: belum ada Business DNA 6 dimensi tersimpan & berversi. |
| Katalog fitur | `modules` (Module Registry V2: jenis, kategori, `impl_status`, `entitlement`, dependensi wajib/opsional, area izin, paths) + `business_modules` (aktif per bisnis) + `module_catalog` / `module_set` / `module_impact` / `config_requests` / `config_history`. **Verified** — dipakai ulang sebagai Feature Catalog. Belum: metadata relevansi (model, kapabilitas, kategori), skor, aturan relevansi, siklus rekomendasi. |
| Entitlement | `plan_has` / `my_entitlements` / `legacy_features`; `module_set` menolak modul berbayar tanpa paket. **Verified** |
| Peristiwa | `domain_events` (outbox, trigger `dom_*`), `activity_feed`, `config_history` (sebelum/sesudah, pelaku, alasan). **Verified** — dipakai untuk audit & versi konfigurasi. |
| Keuangan | Jurnal double-entry otomatis (`acct_sync`), PPN, rekonsiliasi bank, arus kas, aset & penyusutan. **Verified** (di luar cakupan perubahan tahap ini; tidak disentuh). |

## 2. Existing Feature Inventory (ringkas)

- Properti: kamar, penghuni, sewa, tagihan otomatis, pembayaran, deposit, booking, perbaikan, meteran, portal penghuni, pendaftaran online, pindah kamar.
- Retail: kasir (eceran/grosir, bayar campuran, PPN, promo, harga bertingkat, daftar harga, harga outlet), stok multi-satuan & multi-lokasi, batch/kedaluwarsa, mutasi/kiriman, tahanan stok, belanja & faktur supplier, konsinyasi, grosir B2B (penawaran → surat jalan → faktur, batas kredit), shift, tutup harian, komisi, kesehatan stok.
- Jasa/Laundry/Kuliner: layanan & tahap, pesanan, antar-jemput, dapur, meja & reservasi, QR meja, resep & food cost, portal pemesanan.
- Kustom: Business Builder + 12 template siap pakai (event, proyek, pendidikan, rental, travel, produksi, tani, klinik, anggota, kirim, bengkel, salon) dengan dashboard `bb_home`.
- Umum: karyawan & peran, akses per modul, persetujuan bertingkat, otomatisasi, SDM & gaji, anggaran, analisis bisnis, pembukuan, halaman bisnis & QR, media, lampiran, CRM prospek, langganan & pembayaran Lynk.

## 3. Existing Navigation Structure

| Lebar | Struktur |
|---|---|
| HP <768 | Header (bisnis, cari, lonceng, bagikan, ☰) + menu bawah **[Beranda][Operasional][+][Laporan][Akun]** + Drawer ☰ (7 kelompok generik). |
| Tablet 768–1023 | Icon rail + topbar. |
| Desktop ≥1024 | Sidebar 252px (Workspace / Modul bisnis / Sistem) + topbar dengan "+ Aksi cepat". |

Sumber menu: `BUSINESS_TYPES[engine].tabs` → `tabsFor(kos)` (tersaring peran, modul aktif, jenis bisnis) → `groupsFor(kos)` (7 kelompok SAMA untuk semua bisnis: Operasional, Transaksi, Pelanggan, Inventaris, Keuangan, Laporan, Pengaturan).

**Temuan:**
- N-01 Kelompok sidebar identik untuk semua jenis bisnis (spesifikasi §12 meminta struktur per bisnis: retail Penjualan/Pembelian/Persediaan…, kos Kamar/Penghuni/Booking + Manajemen…).
- N-02 Slot ke-2 menu bawah = "Operasional" (daftar modul), bukan menu utama kontekstual (§13.1, gambar: Transaksi/Pesanan/Kamar/Proyek).
- N-03 **Tombol (+) tidak permanen**: dirender hanya bila `quickActions(kos).length > 0` → hilang untuk bisnis draf / peran tanpa aksi. Melanggar keputusan permanen §13.
- N-04 Aksi cepat = daftar statis per engine di `lib/menu.js`; tidak mengikuti Business DNA, tidak bisa diatur pemilik, tidak ada prioritas konteks halaman, tidak ada empty state.
- N-05 Pemilik tidak bisa mengatur urutan/menyembunyikan menu atau membuat pintasan.
- N-06 Beberapa aksi `?baru=` hanya membuka halaman tanpa formulir (`/kamar`, `/layanan`, `/kas?baru=masuk`).

## 4. Existing Dashboard Structure

`components/Dashboard.jsx` = satu kerangka, widget per halaman: `kos` (9 widget), `toko` (9), `jasa` (12), `kerja` (8). Data nyata dari RPC laporan. "Atur dashboard" (sembunyi/urutan) **disimpan di localStorage per perangkat** → tidak mengikuti pemilik di perangkat lain, tidak berversi, tidak bisa dipulihkan (§11.3, §18). Partial failure: widget yang gagal `node` falsy → tidak merusak dashboard lain. **Partial**

## 5. Existing Database Schema (yang relevan)

`kos` (business_type, category_code, subcategory_code, template_code, setup_status, setup_meta, profile), `biz_categories/subcategories/templates`, `modules`, `business_modules`, `config_requests`, `config_history`, `setup_items`, `bb_workspace` (layout), `domain_events`, `kos_members`, `staff`, `branches`, `plan_activations`.

## 6. Existing Business Logic Inventory (adaptif)

- Rekomendasi modul saat setup: template `spec.modules` + `recommend()` (jawaban ya/tidak). Tidak ada skor, tidak ada siklus terima/tolak/tunda di luar setup, tidak dievaluasi ulang saat bisnis berubah.
- Siklus hidup bisnis: tidak ada (selain masa coba & growth offer untuk paket).
- Event: `domain_events` lengkap untuk transaksi; belum ada evaluasi relevansi saat cabang/karyawan/paket berubah.

## 7. Existing Security Assessment

- Kuat: RLS + RPC `security definer` dengan `member_in`, entitlement di server (`plan_has`), modul nonaktif ditolak server (`module_on` di RPC & `pathModuleOff` di UI), audit `config_history`, guard bisnis ditutup/draf.
- Risiko untuk fitur baru: konfigurasi tampilan dari klien harus divalidasi server (bentuk & panjang), tidak boleh membuka akses (menu/aksi tetap disaring `tabsFor` + izin server). Rekomendasi tidak boleh mengaktifkan modul berbayar tanpa paket → aktivasi tetap lewat `module_set`.

## 8. Gap Analysis

| Spesifikasi | Status awal | Rencana |
|---|---|---|
| §5 Klasifikasi ≥20 kategori + registry (versi, model, kapabilitas bawaan) | 15 kategori, tanpa metadata DNA | +6 kategori (Hospitality, E-commerce, Teknologi, Media, Keuangan, Rental), subkategori sesuai daftar, kolom `version/supported_models/default_*` |
| §6 Business DNA 6 dimensi | Belum | `business_profiles` (dna jsonb + versi) + kosakata `biz_vocab` + `dna_default/dna_clean/dna_get/dna_save` |
| §7 Business process recognition | Tahap jasa & alur Builder saja | Peta proses per engine ditampilkan di Pusat Pengalaman (fase 4: workflow registry) |
| §8 Feature relevance (metadata, 5 kelas, skor berbobot, rule registry) | Belum | Kolom relevansi di `modules`, tabel `relevance_rules`, `feature_relevance(kos)` |
| §9 Decision engine (urutan security → … → default) | Sebagian tersebar | `feature_relevance` + `module_set` (security/izin/paket/dependensi) + konfigurasi pemilik |
| §11 Dashboard adaptif + personalisasi | Adaptif per engine; personalisasi lokal | Simpan di server (`experience_configs.dash`), berversi, pulihkan |
| §12 Sidebar dinamis per bisnis + kendali pemilik | Kelompok generik | Profil navigasi per bisnis (retail, kos, kuliner, laundry/jasa, kustom) + sembunyikan/urutkan/pintasan |
| §13 (+) permanen + panel kontekstual | Bersyarat, statis | (+) selalu ada; registry aksi cepat + DNA + izin + konteks halaman + pengaturan pemilik + empty state |
| §14 Siklus rekomendasi | Belum | `feature_recommendations` (recommended/accepted/rejected/deferred/activated/dismissed/expired) |
| §15 Business Experience Center | Belum | Halaman `/pengalaman` (Profil, Fitur, Dashboard, Navigasi, Aksi cepat, Rekomendasi, Evolusi) |
| §18 Versi & pemulihan konfigurasi | `config_history` saja | `experience_configs.version` + pulihkan dari riwayat |
| §19 Multi-bisnis | Sudah (Bisnis Anda, Ringkasan pemilik) | Dipertahankan |
| §20–21 Lifecycle & event | Belum | `biz_signals`, tahap kematangan, evaluasi saat profil/cabang/karyawan/paket berubah (trigger aman) + harian |
| §22 Onboarding adaptif | 4 bagian + Pusat Konfirmasi | + bagian "Karakter operasional" (DNA) + pratinjau workspace |
| §23 Keuangan | Verified | Tidak diubah |
| §24 Integration registry | `pay_providers` saja | Fase 6 (selesai, §18) |
| §28 Experience performance | Belum | Fase 7 (selesai, §19) |

## 9. Reusable Components Inventory

`Dashboard`/`Widget`/`Alerts`/`ActivityList`, `PageHeader`/`DataTable`/`FilterToolbar`, `Sheet` (bottom sheet HP), `NavIcon`, `AppShell` (Sidebar/Topbar/Crumbs/Dropdown), `useBaru`, `module_set`/`module_impact`/`config_log`, `tabsFor`/`canArea`/`pathModuleOff`.

## 10. Proposed Architecture (dipetakan ke 6 lapisan spesifikasi)

1. Klasifikasi: `biz_categories/subcategories/templates` (+ metadata) — tetap satu sumber.
2. Pemahaman bisnis: `business_profiles.dna` (6 dimensi) + `biz_vocab` + `biz_signals` (indikator nyata).
3. Decision engine: `feature_relevance` (skor + kelas + alasan) → `feature_recommendations` → `module_set` (satu-satunya pintu aktivasi: izin, paket, dependensi).
4. Shared engines: 4 mesin yang ada (tidak diduplikasi).
5. Adaptive experience: `lib/menu.js` profil navigasi + `lib/quick.js` registry aksi cepat + `experience_configs` (nav/quick/dash) + Dashboard.
6. UI: AppShell (HP/tablet/desktop) dengan (+) permanen.

Konfigurasi = data (tabel/registry), bukan `if` tersebar di komponen: profil navigasi & registry aksi cepat masing-masing satu file.

## 11. Files and Components to Modify

DB: migrasi baru `20261121100000_adaptive_foundation.sql`, uji `supabase/tests/adaptive_experience.sql`.
Frontend: `lib/menu.js` (profil navigasi, main tab, konfigurasi pemilik), `lib/quick.js` (baru), `lib/dna.js` (baru), `components/KosProvider.jsx` (muat DNA + konfigurasi), `app/(app)/layout.jsx` (menu bawah + (+) permanen + panel), `components/AppShell.jsx`, `components/Dashboard.jsx` (preferensi server), `app/(app)/pengalaman/page.jsx` (baru), `app/mulai/page.jsx` (bagian DNA), `app/(app)/konfirmasi/page.jsx` (pratinjau workspace), halaman yang perlu `?baru=` (`kamar`, `layanan`, `kas`), `lib/business.js` (rute & area baru), panduan (`app/panduan/page.jsx`, `lib/guide.js`).

## 12. Database Migration Plan

Satu migrasi aditif (tanpa mengubah/menghapus kolom lama): kolom baru di `biz_categories`/`biz_subcategories`/`modules`; tabel baru `biz_vocab`, `business_profiles`, `relevance_rules`, `feature_recommendations`, `experience_configs` (semua ber-`kos_id` diberi `zz_kos_open_guard`, tanpa policy tulis — hanya RPC). Bisnis lama: DNA = bawaan dari kategori (tidak disimpan sampai pemilik mengubah), konfigurasi tampilan kosong = rekomendasi PRASARA (tampilan lama tidak rusak). Trigger evaluasi dibungkus `exception when others` agar tidak pernah menggagalkan transaksi utama.

## 13. Implementation Roadmap

| Tahap | Isi | Status |
|---|---|---|
| Fase 0 | Audit ini | Selesai 21 Nov |
| Tahap 1 (Fase 1+2) | Klasifikasi 20+, Business DNA, katalog & aturan relevansi, rekomendasi, lifecycle dasar; navigasi per bisnis, (+) permanen, registry aksi cepat, konfigurasi pemilik berversi, Business Experience Center, onboarding DNA, preferensi dashboard di server | Selesai 21 Nov (lihat §14) |
| Fase 3 | Dashboard: KPI pilihan, periode bawaan, widget per subkategori (fashion: ukuran/warna; elektronik: garansi), Business Pulse/Signals | Selesai 21 Nov (§15) |
| Fase 4 | Workflow registry, alur bersyarat, persetujuan per alur | Selesai 21 Nov (§16) |
| Fase 5 | Ringkasan multi-bisnis lanjutan (konsolidasi berbatas izin) | Selesai 21 Nov (§17) |
| Fase 6 | Integration registry & webhook umum | Selesai 21 Nov (§18) — webhook masuk; webhook keluar ditunda |
| Fase 7 | Experience performance (pemakaian fitur, aksi cepat, rekomendasi) di server | Selesai 21 Nov (§19) |

Aturan yang dijaga: tidak menghapus fitur, tidak mengubah logika transaksi/keuangan, tidak mengaktifkan modul berbayar otomatis, tanpa AI generatif (aturan + skor tertulis), tanpa data contoh di aplikasi.

## 14. Hasil Tahap 1 (21 Nov 2026)

| Bagian | Status | Bukti |
|---|---|---|
| Klasifikasi 21 kategori + ±200 subkategori + DNA bawaan & versi | Verified | uji B (`adaptive_experience.sql`) |
| Business DNA 6 dimensi, validasi server, versi & pulihkan | Verified | uji E, M |
| Feature relevance (skor berbobot, 5 kelas + dalam rencana) & rule registry (28 aturan) | Verified | uji A, C, D |
| Rekomendasi: alasan, terima/tolak/tunda, tidak berulang, tidak mengaktifkan fitur berbayar | Verified | uji F, J |
| Lifecycle: sinyal nyata, tahap, evaluasi saat cabang/karyawan/paket berubah, harian | Verified | uji I; cron `experience_tick` |
| Konfigurasi navigasi/aksi cepat/dashboard berversi + pulihkan + reset | Verified | uji M |
| Isolasi tenant tabel baru | Verified | `isolasi.sql` 199/199 lulus |
| Profil navigasi 5 jenis (retail, kos, kuliner, jasa, kustom), menu utama kontekstual, (+) permanen, registry aksi cepat (DNA, izin, modul, konteks halaman, favorit, frekuensi) | Verified (logika) | uji Node `lib/menu.js`/`lib/quick.js`: 5 bisnis → sidebar, menu bawah & (+) berbeda; kasir hanya aksi penjualan; modul nonaktif → aksi hilang |
| Pusat Pengalaman, langkah DNA di /mulai, pratinjau workspace, dashboard di server | Verified (render) | Render komponen asli di Chrome 375/390/820/1280/1440 tanpa overflow |
| Panduan (Langkah 109–112, `lib/guide.js`) | Selesai | |

Belum (fase berikutnya): KPI pilihan & periode bawaan dashboard, widget khusus subkategori (ukuran/warna fashion, garansi elektronik), workflow registry & alur bersyarat, ringkasan multi-bisnis lanjutan, integration registry, analitik pemakaian fitur di server, UI Super Admin untuk mengubah DNA bawaan kategori (RPC `admin_biz_category_dna` sudah ada). Hospitality memakai mesin Properti (tarif harian & housekeeping belum).

## 15. Hasil Fase 3 — Adaptive Dashboard (21 Nov 2026)

| Bagian | Status | Bukti |
|---|---|---|
| Periode Hari ini / 7 hari / Bulan ini + periode bawaan per dashboard | Verified | uji B `adaptive_dashboard.sql`; render |
| Angka utama (KPI) dari katalog, rekomendasi dari Business DNA, dipilih & diurutkan pemilik (server, berversi) | Verified | uji B; render Atur dashboard |
| Denyut bisnis (dibanding rata-rata 30 hari, aturan ±15%) toko/jasa/kuliner/kos | Verified (render) | |
| Sinyal bisnis baru: piutang lewat tempo, harga modal naik (`cost_changes`), barang tidak bergerak, food cost > 40%, bahan menipis, ketepatan waktu < 80% | Verified | uji A, C |
| Widget per karakter: toko (piutang pelanggan, harga modal berubah, barang tidak bergerak), kuliner (food cost per menu, bahan menipis), kos (kamar kosong, booking aktif, jatuh tempo, pembayaran per periode) | Verified (render) | |
| Konstruksi: RAB, Material, Tenaga kerja; Progres rata-rata & Realisasi vs RAB (`bb_home` avg/ratio) | Verified | uji D (70%, Rp215 jt / Rp320 jt = 67,2%) + uji G template konsisten |
| Kegagalan satu widget tidak menggagalkan dashboard | Verified (kode) | `WidgetBoundary` |

Belum / jujur: nomor seri & garansi elektronik (belum ada data di mesin Retail), kinerja shift kuliner (kuliner tidak memakai shift kasir), stok per ukuran/warna sebagai widget khusus (varian sudah ada di Barang; widget menyusul), Realisasi vs RAB per proyek di dashboard (tersedia sebagai laporan per proyek).

## 16. Hasil Fase 4 — Process & Workflow Adaptation (21 Nov 2026)

Audit awal: alur sudah ada di tiga mesin terpisah (tahap pesanan jasa `svc_stages`, status & langkah Builder `bb_statuses/bb_transitions`, persetujuan per tindakan `approval_*`). Belum ada peta proses, registry, aturan bersyarat, versi/pulihkan alur, template, atau saran alur. Fase 4 dibangun DI ATAS mesin itu (migrasi `20261121120000_alur_kerja.sql`), tanpa mengubah perilaku lama.

| Bagian blueprint | Status | Bukti |
|---|---|---|
| Business Process Recognition — peta proses toko, grosir, kuliner, laundry, jasa, kos, konstruksi, event (+ kustom dari jenis data); status langkah dari data 90 hari (berjalan/otomatis/belum dipakai/belum diatur/fitur nonaktif) | Verified | uji A, F, H (`alur_kerja.sql`) |
| Workflow Registry — 12 alur standar + alur kustom per jenis data, jumlah per status, lama per tahap | Verified | uji H; render |
| Custom Workflow — tahap pesanan (menu lama) + 14 alur siap pakai per subkategori; status/langkah kustom tetap di Builder | Verified | uji B |
| Conditional Rules — tolak / perlu persetujuan / wajib catatan; syarat sisa bayar, sudah bayar, total, diantar, isian catatan kustom; ditegakkan di database untuk semua jalur; pemilik dikecualikan | Verified | uji C, D, F |
| Approval Workflow per alur — `langkah_pesanan_jasa` (dijalankan otomatis setelah disetujui), `bb_pindah_status`, batal pesanan | Verified | uji C |
| Workflow History & versioning — versi awal otomatis, versi tiap perubahan (tahap, Builder, aturan, template), pulihkan | Verified | uji B, E, F, J |
| Workflow Recommendations — template cocok, tahap cek kualitas, tahap paling lama, tahap sering dilewati, sering diserahkan belum lunas, banyak terlambat, catatan kustom tertahan, status tak terpakai, langkah proses belum dipakai; terima/tunda/tolak, tidak berulang | Verified (aturan template, cek kualitas, keputusan) | uji G; aturan berbasis volume (≥10 pesanan) diuji lewat kode, belum dengan data 30 hari |
| Izin & isolasi | Verified | uji C, I; `isolasi.sql` 201/201 |
| Regresi | Verified | 44 uji lama identik sebelum/sesudah; harga V2 identik |
| UI `/alur` + ringkasan di Pusat Pengalaman | Verified (render) | Chrome 375/390/820/1440 tanpa overflow |
| Panduan Langkah 114–116, `lib/guide.js` (alur, pesanan, layanan) | Selesai | |

Keputusan yang perlu konfirmasi pemilik: aturan yang meminta **persetujuan** mengikuti fitur `persetujuan` (Paket Bisnis/Pro, sama seperti mengatur aturan persetujuan sendiri); aturan **tolak** & **wajib catatan** tersedia di semua paket.

Belum / jujur: alur standar (penjualan, belanja, sewa, booking, grosir) tidak bisa diberi aturan bersyarat — hanya persetujuan per tindakan, agar stok/kas/jurnal tetap benar. Kurir yang terkena aturan persetujuan saat "Sudah diantar" diminta menyerahkan lewat pemilik/kasir (permintaan persetujuan dari menu Antar belum ada). Template alur untuk mesin selain jasa (mis. alur Builder event/proyek per subkategori) belum; status kustom tetap disusun di Builder.

## 17. Hasil Fase 5 (21 Nov 2026): ringkasan multi-bisnis lanjutan

Acuan blueprint: Bab 16 (konsolidasi hanya bila pemilik mengaktifkan secara eksplisit; data antarbisnis tidak boleh tercampur) dan dokumen Unified BI (pisahkan analisis individual, portofolio, laporan perusahaan, konsolidasi formal).

| Bagian | Status | Bukti |
|---|---|---|
| Penjumlahan otomatis "Semua bisnis" lintas badan usaha DIHAPUS; gabungan hanya atas pilihan pemilik/karyawan (per akun) | Verified | uji A, B, C, D |
| `portfolio_settings` (RLS, tanpa policy; akses lewat RPC) + `portfolio_get` / `portfolio_set` | Verified | uji B, G2 |
| Pilihan lama diabaikan bila akses dicabut atau bisnis ditangguhkan | Verified | uji E, F |
| Bisnis tanpa akses keuangan tidak bisa dipilih (karyawan tanpa `finance`) | Verified | uji C, D |
| Angka tetap dari `owner_overview2` (sumber sama dengan Laporan); selisih vs bulan sebelumnya dihitung dari baris yang sama | Verified (render) | `bisnis_hp_gab.png` (dummy) |
| Gabungan dipisah per badan usaha bila berbeda; tanda Indikasi bila basis berbeda atau ada angka belum final | Verified (render) | — |
| Panduan Langkah 24 (teks langkah 5) & `lib/guide.js` bisnis; CLAUDE.md | Selesai | |

Keputusan yang masih menunggu pemilik: apakah gabungan dibatasi paket (saat ini TIDAK dibatasi), dan apakah perlu ekspor gabungan. Belum ada: perbandingan periode lebih dari satu bulan, konsolidasi formal (eliminasi transaksi antarbisnis, tidak diperlukan selama gabungan diberi label indikasi), dan ringkasan gabungan di Beranda.

## 18. Hasil Fase 6 (21 Nov 2026): Integration registry & webhook masuk

Acuan: Culinary §12.1 dan IBOS Bab 9.2 (registry konektor, autentikasi, cakupan, pemetaan data, retry/idempotensi, log sambungan, aktif/nonaktif per bisnis, kunci hanya di server, status jujur).

| Bagian | Status | Bukti |
|---|---|---|
| Registry konektor `integration_catalog` (1 production_ready, 4 dalam rencana beserta syarat) | Verified | uji A |
| Sambungan per bisnis: buat, ubah, jeda/aktifkan, kode baru, hapus; maks. 5 | Verified | uji C, F, G |
| Token tidak disimpan (hanya sha256 + 4 karakter), tampil sekali; tabel tanpa policy & revoke | Verified | uji C, E |
| Webhook masuk → Prospek (alias kolom, pemetaan khusus, nomor angka, email ke kebutuhan, nama kosong → "Tanpa nama") | Verified | uji D1–D5, D9 |
| Idempotensi (`Idempotency-Key`), duplikat nomor 10 menit, batas 60/jam & 300/hari, token salah per IP | Verified | uji D2, D3, D10–D12 |
| Bisnis ditutup / ditangguhkan / CRM mati / sambungan dijeda ditolak; kode lama mati setelah rotasi | Verified | uji D11, D13–D15 |
| Isolasi antar bisnis & izin (kasir & orang luar ditolak); `isolasi.sql` 204/204 | Verified | uji B, E |
| Audit aksi pemilik tanpa token; log tanpa data pelanggan; purge retensi | Verified | uji H, J |
| Rute `/api/hook/[token]` (JSON/form/multipart, 16 KB, CORS, GET 405) | Verified (kode, lint, bundle); belum diuji pengirim luar sungguhan | — |
| UI `/integrasi` + panel di Admin › Status sistem + sumber "Integrasi" di Prospek & pengingat Beranda | Verified (render) | Chrome 390/1440 tanpa overflow |
| Panduan Langkah 117, `lib/guide.js` (integrasi), CLAUDE.md | Selesai | |

Keputusan yang perlu konfirmasi pemilik: (1) apakah webhook dibatasi paket — saat ini semua paket, karena matriks V2 tidak menyebutnya; (2) penjadwal untuk webhook KELUAR: cron Vercel paket sekarang hanya harian sehingga kabar keluar real-time tidak mungkin; pilihannya paket cron per menit, penjadwal luar (mis. GitHub Actions / cron-job.org dengan `CRON_SECRET`), atau menerima kiriman batch harian.

Belum / jujur: webhook keluar, WhatsApp resmi, pembayaran online untuk pelanggan bisnis, dan marketplace berstatus Dalam rencana (tidak ada klaim aktif tanpa kredensial). Prospek dari webhook tidak membawa persetujuan dihubungi (`consent_at` kosong) dan tidak mengirim email ke pemilik (kuota email). Belum ada: kategori sumber data selain prospek (mis. pesanan/penjualan masuk lewat webhook), tanda tangan HMAC dari pengirim (kini kerahasiaan alamat), dan uji dari layanan luar sungguhan.

### 18.1 Keputusan pemilik 21 Nov 2026 (migrasi `20261121150000`)

| Bagian | Status | Bukti |
|---|---|---|
| Integrasi = Paket Pro (buat/kode baru/aktifkan ditolak; jeda/hapus/riwayat tetap; webhook ke bisnis non-Pro ditolak & dicatat) | Verified | `integrasi.sql` uji K |
| Gabungan bisnis = Paket Pro (minimal satu bisnis Pro di gabungan; jumlah disembunyikan bila paket turun, pilihan tetap) | Verified | `ringkasan_portofolio.sql` uji H |
| Ekspor gabungan (Excel: per bisnis + jumlah, per badan usaha, catatan; kuota bisnis Pro) | Verified (bundle); belum diuji di HP | — |
| Perbaikan galat Alur kerja "column reference x is ambiguous" (saran langkah proses R9) | Verified | `alur_kerja.sql` uji Z (gagal di kode lama, lulus di kode baru) |
| Tabel fitur paket (`lib/plan.js`), panduan Langkah 24 & 117, `lib/guide.js` | Selesai | |

Keputusan Fase 4 (aturan persetujuan di Alur kerja mulai Paket Bisnis) tidak diubah.

## 19. Hasil Fase 7 (21 Nov 2026): Experience performance di server

Catatan sumber: teks lengkap §28 tidak tersimpan di dokumen Project; cakupan mengikuti rencana §8/§13 audit ini ("pemakaian fitur, aksi cepat, rekomendasi di server").

| Bagian | Status | Bukti |
|---|---|---|
| Pencatatan pemakaian (menu dibuka & aksi cepat diketuk, jumlah per hari) lewat `exp_track`; validasi isian, batas per kiriman & per hari, galat ditelan | Verified | `kinerja_pengalaman.sql` uji A, B, D |
| Tabel tertutup, orang luar/kasir tidak bisa membaca laporan, bisnis lain tidak bocor; `isolasi.sql` 205/205 | Verified | uji C, F |
| Urutan tombol (+) dari pemakaian sendiri di server (semua perangkat), cadangan per perangkat | Verified (kode, bundle) | — |
| Laporan Kinerja: orang aktif, menu & aksi teratas (tanpa rincian per orang), fitur aktif tak dipakai, hasil rekomendasi (hanya keputusan pemilik) + "lalu dipakai", saran alur, perubahan tampilan | Verified | uji E; render 390/1440 (isi & kosong) |
| Super Admin: agregat lintas bisnis tanpa nama | Verified | uji G |
| Retensi 180 hari (cron) & bisnis ditutup tidak tercatat | Verified | uji H |
| Panduan Langkah 118, `lib/guide.js`, CLAUDE.md | Selesai | |

Belum / jujur: data baru mulai terkumpul 21 Nov 2026 (angka awal belum penuh; daftar "jarang dipakai" sengaja disembunyikan sampai 14 hari data); waktu menyelesaikan tugas dan pemakaian widget dashboard belum diukur; pencatatan hanya dari aplikasi web yang terbuka (kiriman terakhir bisa hilang bila HP langsung mati).
