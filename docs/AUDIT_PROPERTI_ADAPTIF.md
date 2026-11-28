# Audit & Roadmap — Adaptive Property & Rental Management (28 Nov 2026)

Permintaan pemilik: kembangkan modul Kos & Properti menjadi Adaptive Property & Rental Management System setara Toko & Ritel,
memakai mesin bersama PRASARA (tanpa menduplikasi modul), mempertahankan data & fungsi lama, adaptif per jenis properti, progressive disclosure.

Status jujur: **Terverifikasi** = diuji (SQL lokal PostgreSQL 16 / uji JS / build / render), **Sudah ada** = fitur lama yang dipakai ulang,
**Dalam rencana** = belum dibangun (tidak ditampilkan sebagai fitur di aplikasi).

## 1. Hasil audit kondisi sebelum tahap ini

| Kebutuhan | Kondisi sebelumnya | Mesin bersama yang tersedia |
|---|---|---|
| Kamar/unit, penghuni, sewa, tagihan, pembayaran | Sudah ada & matang (generate_invoices, pindah kamar, tagihan pertama, kwitansi) | — |
| Deposit, booking, check-in booking | Sudah ada (deposits, bookings, booking_checkin) | — |
| Perawatan & keluhan, utilitas (meteran) | Sudah ada (maint_tickets, meter_readings) | — |
| Portal penghuni, pendaftaran online, halaman bisnis | Sudah ada (Pro) | u_halaman, p_portal |
| Akuntansi, anggaran, aset tetap, risiko, analisis, rekap | Sudah ada (jurnal kos = basis kas) | u_akuntansi, budgets, fixed_assets, biz_intel, profit_analysis |
| SDM & gaji, karyawan & akses | Sudah ada, tapi menu SDM tersembunyi di "Sistem" | u_sdm, kos_members |
| Otomasi | Sudah ada (resep sewa_berakhir, pengingat) | automation_* |
| **Multi-properti** | **Tidak ada** — kamar tanpa lokasi | branches (lokasi toko), batas paket `cabang` |
| **Inventaris kamar & pemeriksaan check-in/out** | **Tidak ada** (hanya teks fasilitas) | fixed_assets (tautan opsional), deposits |
| **Property Intelligence** (NOI, ROI, yield, balik modal, proyeksi) | **Tidak ada** (hanya hunian & uang masuk per kamar di Profitabilitas) | jurnal (biz_fin_class), profit_rooms |
| **Istilah per jenis properti** | Semua jenis memakai "Kamar/Penghuni" | biz_subcategories (kos, kontrakan, apartemen, ruko, homestay, villa…) |
| Dashboard sesuai gambar acuan | Ada KPI & tren tagihan, belum ada tren hunian/komposisi biaya/status/investasi | components/Dashboard |
| Pembelian & supplier untuk properti | Mesin Belanja berbasis stok barang (retail/jasa) | r_belanja (belum untuk properti) |
| Referral, kampanye pemasaran | Tidak ada di platform | — |

## 2. Yang dibangun di tahap ini (Terverifikasi)

Migrasi `20261128160000_properti_adaptif.sql` (tanpa mengubah migrasi lama, tanpa backfill data):

1. **Multi-properti** = lokasi bersama (`branches` kind `cabang`); `rooms.branch_id` (null = lokasi utama) + `floor`, `size_m2`, `capacity`;
   `property_save` (pemilik), `my_locations` kini juga untuk properti, `doc_loc` memberi lokasi kerja pada pengeluaran properti,
   `acct_line_branch` mengenali pembayaran/deposit/DP booking lewat kamar → laporan per lokasi (Analisis, Profitabilitas, Rekap) ikut benar.
   Batas paket lokasi berlaku apa adanya (Dasar 1, Bisnis 3, Pro 10).
2. **Inventaris kamar** `room_items` + **pemeriksaan** `room_inspections` (masuk/keluar/rutin, salinan kondisi sebelum→sesudah, tidak bisa diubah)
   lewat `room_inspection_save`; kerusakan → kotak Deposit (potong deposit mesin lama). Modul `p_inventaris` (registri, aktif untuk bisnis properti).
3. **Nilai investasi & pasar** per properti `property_values` lewat `property_value_set` (keuangan, tercatat `config_history`), tanpa angka bawaan.
4. **Property Intelligence** `property_intel(kos, from, to, branch)` = SATU sumber: laba rugi jurnal per lokasi, hunian bulanan (hari kamar),
   tunggakan per umur, penagihan, perawatan, per unit, sewa ke depan 12 bulan, per properti. Rumus HANYA `lib/propertyIntel.js`.
   Paket: Dasar ringkas · Bisnis (`analisis_lanjutan`) per unit/ROI/yield/balik modal/proyeksi · Pro (`analisis_mendalam`) per properti.
5. **Adaptif**: `lib/propertyTerms.js` (kos = Kamar/Penghuni; kontrakan/apartemen/ruko/gedung = Unit/Penyewa; penginapan/villa = Tamu & Reservasi)
   dipakai menu, aksi cepat (+), halaman Kamar/Inventaris/Properti, Beranda.
6. **Navigasi**: profil properti = Operasional properti (Properti & Lokasi, Kamar/Unit + Inventaris, Penghuni, Booking, Perawatan, Utilitas) →
   Keuangan → Tim & pemasaran (SDM, Karyawan, Calon penghuni, Halaman bisnis, Media) → Sistem. Kelompok tanpa menu yang boleh dibuka otomatis hilang.
7. **Beranda** (gambar acuan): alamat di kepala, KPI bawaan Hunian/Pendapatan sewa (vs bulan lalu)/Tunggakan/Perawatan aktif, widget
   Tren hunian 6 bulan, Komposisi biaya bulan ini, Status kamar (Terisi/Kosong/Booking/Perawatan), Analisis & investasi. Widget lama tetap ada.
8. **Panduan**: `/panduan` Bagian AR (Langkah 152–154) + layar contoh, `lib/guide.js` (properti, inventaris, kamar), `lib/help.js` (4 entri).

Uji: `supabase/tests/properti_adaptif.sql` (semua kolom t), `node supabase/tests/properti_adaptif_js.mjs` (45 lulus, data nyata
`supabase/tests/data/property_intel.json`), `tests/adaptive-navigation.test.mjs` (+ uji menu properti), `isolasi.sql` LULUS 273,
`e2e_kos.sql`, `pindah_kamar.sql`, seluruh `harness/run_bi.sh` LULUS, `next build` sukses, render HP 390px & laptop 1280px tanpa geser samping.

## 3. Roadmap (Dalam rencana — butuh keputusan pemilik)

| Tahap | Isi | Catatan / keputusan yang dibutuhkan |
|---|---|---|
| P2 | Pembelian & supplier properti | Pakai mesin Belanja (r_belanja) untuk barang habis pakai (sabun, lampu) + kontak supplier; perlu keputusan: aktifkan stok untuk properti atau pembelian tanpa stok (langsung biaya)? |
| P2 | Kontrak sewa digital | Dokumen kontrak dari template + tanda terima; tanda tangan elektronik butuh penyedia (belum ada). |
| P3 | Referral penghuni | Kode referral di portal/halaman bisnis → diskon/komisi; perlu keputusan bentuk imbalan & akuntansinya (diskon tagihan vs beban pemasaran). |
| P3 | Kampanye pemasaran | Dipadukan dengan Growth/halaman bisnis; WhatsApp otomatis belum tersedia (butuh API resmi). |
| P3 | Otomasi khusus properti | Resep baru: pengingat pemeriksaan rutin inventaris, tunggakan > 60 hari, kamar kosong > 30 hari. |
| P3 | Hunian historis per status kamar | Hunian bulanan memakai daftar kamar yang disewakan SEKARANG (tidak ada riwayat status kamar); butuh tabel riwayat status bila ingin presisi. |
| P4 | Sewa harian/mingguan (penginapan) | Mesin tagihan sekarang bulanan; penginapan harian butuh siklus tagihan baru — keputusan besar, belum disentuh. |

Batasan yang diketahui: penyusutan & biaya tanpa lokasi dihitung di lokasi utama; profit per unit = kontribusi langsung (biaya bersama tidak dibagi);
laporan kos tetap basis kas (keputusan pemilik 27 Nov 2026).
