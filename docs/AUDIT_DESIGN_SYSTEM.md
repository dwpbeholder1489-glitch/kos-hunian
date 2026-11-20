# Audit UI & Rencana — Unified Design System & Responsive Experience

Tanggal: 20 Nov 2026 · Dasar: dokumen "PRASARA Desain Sistem — Master Implementation Specification" + gambar acuan (desktop, laptop, tablet, HP).
Kode yang diaudit: repo `kos-hunian` commit `d4c5582` ("Tahap 1 Retail: tata kelola harga & kredit").

## 1. Kondisi existing (Existing UI Audit)

| Aspek | Kondisi sekarang | Spesifikasi | Status |
|---|---|---|---|
| Framework | Next.js 15 App Router + React 19, CSS global (`app/globals.css`, ±90 KB) berbasis variabel CSS | Pakai yang ada | Sesuai |
| Tema | Gelap = bawaan, terang/ikuti HP opsional | Latar `#F7FAF8`, kartu putih (terang) | **Berbeda** |
| Warna | Aksen `#0F7A4E`, latar `#F2F6F4`, garis `#D3E0DA`, teks `#0E1E19` | Primary `#15803D`, Forest `#064E3B`, latar `#F7FAF8`, garis `#DCE7E0`, teks `#14251F/#64746D/#87948E` | Berbeda |
| Font | Plus Jakarta Sans | Inter / Geist | Berbeda |
| Radius | 14px kartu, 10px tombol/input | Kartu 10–12, input 8, tombol 6–8, modal 12–16 | Berbeda |
| Spasi | Angka lepas (6, 10, 14…) | Kelipatan 4px dengan token | Belum ada token |
| Fokus keyboard | Tidak ada `:focus-visible` di aplikasi | Indikator fokus (WCAG 2.2 AA) | **Kurang** |
| Label | `.label` huruf kapital di banyak tempat (74 pemakaian) + `th` kapital | Hindari uppercase berlebihan | Perlu dikurangi |
| Ikon | Garis SVG (`NavIcon`) untuk menu, tetapi emoji (🏠🛒🧺) untuk jenis bisnis | Gaya ikon konsisten | Sebagian |

### Navigasi & layout

| Lebar | Sekarang | Spesifikasi |
|---|---|---|
| < 900px | Header (nama bisnis, cari, lonceng, bagikan, ☰) + menu bawah melayang (Beranda · Operasional · + · Laporan · Akun) + menu samping ☰ | Dipertahankan (< 768px) |
| 768–1023px | Sama dengan HP (menu bawah membentang penuh) | Icon rail + drawer, topbar |
| ≥ 900px | Menu bawah disembunyikan; **semua menu (bisa 30+) dalam satu baris tab horizontal** di header | Sidebar kiri tetap (240–260px, bisa diciutkan 68–76px) + topbar 60–68px |
| Lebar konten | `.wrap` maks 1040px, satu kolom | Area kerja penuh, maks proporsional |

Menu sudah **adaptif**: `tabsFor(kos)` + `groupsFor(kos)` (lib/business.js, lib/menu.js) menyaring per jenis bisnis, paket, modul aktif, dan peran. Ini dipakai ulang untuk sidebar — tidak ada daftar menu statis baru.

## 2. Inventaris komponen (Component Inventory)

| Spesifikasi | Yang sudah ada | Catatan |
|---|---|---|
| AppShell / Topbar / MobileBottomNavigation | `app/(app)/layout.jsx` (header.top, `.bnav`, Drawer) | Belum ada sidebar desktop, rail tablet, topbar desktop |
| BusinessSwitcher | Sheet "Bisnis Anda" | Dipakai ulang dari sidebar & topbar |
| Breadcrumb | — | Baru |
| PageHeader | Pola tiap halaman: `.row between` + `<h2>` + `PageHelp` + tombol | 65 halaman, belum seragam |
| KPIWidget | `Tile` (149 pemakaian), `.grid` | Restyle via token |
| ContentCard | `.panel` (336 pemakaian) | Restyle via token |
| DataList / DataCard | `.li` (589 pemakaian) | Pola kartu/daftar — cocok untuk HP |
| DataTable | `<table>` hanya 13 tempat (laporan, dokumen) | **Belum ada tabel responsif standar** |
| Modal / BottomSheet | `Sheet` (118 pemakaian; bawah di HP, tengah ≥720px) | Sesuai spek, perlu token radius |
| Toast | `Toaster` | Ada |
| StatusBadge | `.chip` good/warn/bad/info/void/gold | Ada |
| EmptyState | `Empty` + `EmptyArt` | Ada |
| Loading | `Loading` (teks "Memuat…") | Skeleton belum ada |
| ChartContainer | `components/Charts.jsx` (CompareBars, DayColumns, BarList) | Ada, sederhana |
| NotificationPanel | `NotifBell` (kos) / `RetailBell` (toko) → `/notifikasi` | Ada untuk kos & toko |
| SearchInput | `.searchbox` di Modul Bisnis | Pencarian menu saja |
| Tooltip | — | Baru (sidebar ciut) |

## 3. Daftar masalah responsif (Responsive Issue List)

1. **R-01** Desktop tidak punya sidebar; baris tab horizontal memuat semua menu dan harus digeser ke samping.
2. **R-02** Breakpoint utama 900px tidak sesuai sistem 640/768/1024/1280/1536.
3. **R-03** Tablet 768–899px memakai menu bawah HP yang membentang; tablet 900–1023px memakai tab atas yang padat.
4. **R-04** Konten desktop terkunci 1040px satu kolom → ruang kosong di layar lebar, dashboard tidak multi-kolom.
5. **R-05** Tidak ada topbar desktop: pencarian, bantuan, profil, aksi cepat (tombol + hanya ada di menu bawah HP → hilang di desktop).
6. **R-06** Tidak ada breadcrumb/konteks halaman.
7. **R-07** Data di desktop tetap daftar kartu; belum ada tabel dengan kolom/sortir (Fase 4/6).
8. **R-08** Tidak ada indikator fokus keyboard.
9. **R-09** Aturan CSS shell tertulis dua kali (header.top & .bnav lama + baru) → rawan saling timpa.
10. **R-10** Halaman Management Center (`/admin`) memaksa tema gelap sendiri (di luar cakupan pelanggan; diselaraskan belakangan).

## 4. Rencana implementasi (Implementation Plan)

| Tahap | Isi | Status |
|---|---|---|
| A (Fase 1–3) | Audit ini; token baru + tema terang bawaan (gelap tetap bisa dipilih); Inter; tombol/input/kartu/chip/tabel/fokus; **AppShell baru**: sidebar desktop ≥1024 (lebar/ciut, disimpan per perangkat, kelompok WORKSPACE · MODUL BISNIS · SISTEM dari `groupsFor`), icon rail + drawer 768–1023, topbar (breadcrumb, cari, aksi cepat, notifikasi, bantuan, bagikan, profil); HP tidak diubah strukturnya | Dikerjakan 20 Nov |
| B (Fase 4) | Komponen bersama: `PageHeader`, `DataTable` responsif (tabel desktop → kartu HP), `FilterToolbar`, `Pagination`, skeleton (`components/Page.jsx`); dipasang di Penjualan, Pelanggan & supplier, Barang & stok | Dikerjakan 20 Nov |
| C (Fase 5) | Dashboard adaptif per jenis bisnis (KPI, grafik, aktivitas, peringatan, aksi cepat, atur tampil/urutan) memakai sumber data yang ada (`components/Dashboard.jsx`; kos, toko, jasa/kuliner, kustom). Preferensi tata letak masih per perangkat | Dikerjakan 20 Nov |
| D (Fase 6) | Penyelarasan modul sesuai prioritas: Dashboard → Operasional → Penjualan/POS → Produk & Inventori → Pelanggan → Keuangan → Laporan → Karyawan → Pengaturan → lainnya | Sebagian (20 Nov): tabel standar di Tagihan, Pembayaran, Penghuni, Pesanan, Pengeluaran, Karyawan, Kas & kasbon, Belanja, Aset, Booking, Grosir, Prospek, Keluhan, Promo, Catatan kustom; uji lebar 375–1920 (harness) lulus; Kasir laptop 2 panel (≥1280); `PageHeader` di 49 halaman (judul, panduan, keterangan, aksi seragam). Berikutnya: tabel/filter standar di Operasional, Keuangan, Laporan, Karyawan |
| E (Fase 7–8) | Uji 375/390/430/768/820/1024/1280/1440/1920, portrait/landscape, regresi | Tiap tahap + akhir |

Aturan yang dijaga di semua tahap: tidak mengubah database, API, business logic, izin, paket; tidak menghapus fitur; tidak memakai data contoh di aplikasi.
