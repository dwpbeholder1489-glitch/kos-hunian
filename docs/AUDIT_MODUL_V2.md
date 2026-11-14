# PRASARA — Audit Modul & Backlog (Universal Module Ecosystem V2.0)

Tanggal audit: 14 Nov 2026 · Dasar: repository `kos-hunian` (commit 0adcb97), 83 migrasi, database uji lokal (124 tabel), database produksi (dibaca lewat MCP, hanya baca).
Status mengikuti Bab 4: **VERIFIED** (diuji otomatis/nyata), **PARTIAL**, **NEEDS IMPROVEMENT**, **PLACEHOLDER**, **MISSING**, **DUPLICATE**, **BLOCKED**.

## 1. Arsitektur yang ditemukan (Bab 3A)

| Aspek | Temuan |
|---|---|
| Frontend | Next.js App Router, React client pages, CSS sendiri (`app/globals.css`, token `--gold` = emerald, gelap bawaan) |
| Backend | Supabase Postgres: RLS + fungsi `security definer` (RPC). API route Next hanya untuk kunci server (webhook, lampiran, media, cron, email) |
| Pola | **Modular monolith** di database: setiap domain = tabel + RPC; modul industri memakai engine bersama (akuntansi `acct_*`, stok `stock_moves`, kontak `contacts`, persetujuan `approvals`, otomatisasi `automation_*`) — sesuai Bab 7 |
| Auth | Supabase Auth (email + verifikasi), peran bisnis `kos_members`, peran platform `admin_staff`/`role_perms` + MFA |
| Job | Cron harian Vercel 07.00 WIB (`/api/cron/reminders`) → pengingat, otomatisasi, ringkasan, pembersihan, portal |
| Deploy | Push `main` → Vercel + migrasi Supabase otomatis |
| Uji | 23 file uji SQL (`supabase/tests`), uji isolasi tenant 141 kasus, render statis + screenshot |

## 2. Inventaris & status per bab

### Core (Bab 9–16)

| Bab | Modul | Status | Bukti / lokasi | Celah |
|---|---|---|---|---|
| 9 | Command Center | PARTIAL | `/bisnis` (ringkasan pemilik), `/analisis`, dashboard per jenis | Belum satu dashboard lintas jenis dengan kas, piutang, utang, pesanan tertunda & filter cabang sekaligus; preferensi widget belum ada |
| 10 | Sales & POS (toko) | VERIFIED (inti) | `/kasir`, `sales`, `sale_lines`, multi-satuan, harga eceran/grosir, diskon, kasbon, retur, shift | **SELESAI 14 Nov:** PPN keluaran (harga termasuk PPN, bebas PPN per barang, jurnal & laporan) dan bayar campuran. **MISSING:** penawaran harga (quotation), sales order B2B, komisi, laporan tutup harian, varian produk |
| 11 | Inventory | VERIFIED (inti) | `stock_moves` (ledger), `stock_levels` per lokasi, mutasi, opname, penyesuaian beralasan; **mesin konversi satuan** (satuan utama + satuan jual, isi + satuan isi dihitung server, berat↔volume hanya dengan densitas; 14 Nov) | **MISSING:** batch/kedaluwarsa, serial, reservasi stok, saran pemesanan ulang (reorder point/safety stock), umur stok |
| 12 | Accounting | VERIFIED | `acct_*` double-entry otomatis, periode tutup, buku besar, neraca, laba rugi, arus kas, rekonsiliasi bank, anggaran | **MISSING:** aset tetap & penyusutan otomatis, pajak, cost center, akrual/dibayar dimuka terjadwal |
| 13 | Procurement | PARTIAL | `purchases` (pesan, terima sebagian), retur supplier, pelunasan utang | **MISSING:** permintaan pembelian, RFQ, invoice supplier & 3-way matching, kinerja supplier |
| 14 | CRM | PARTIAL | `contacts`, `crm_leads/activities/tasks`, riwayat transaksi | **MISSING:** klasifikasi pelanggan, batas kredit, daftar harga khusus, loyalti/member, profitabilitas pelanggan |
| 15 | HR | VERIFIED (inti) | `/sdm`: `staff` (termasuk tanpa akun), `staff_shifts`, `attendance` (absen sendiri + koreksi pengelola, lembur otomatis), `staff_advances`, `payroll_runs/lines` (bulanan prorata/harian/per jam + tunjangan + lembur + bonus/potongan − kasbon) → pengeluaran "Gaji karyawan" (jurnal), slip cetak/WA | **SELESAI 14 Nov.** **Belum:** pengajuan cuti oleh karyawan, komisi penjualan, BPJS/PPh 21, absen berbasis lokasi/foto |
| 16 | Dokumen | PARTIAL | Struk, kwitansi, nota, ekspor Excel/PDF, lampiran privat, media publik | **MISSING:** penomoran dokumen terpusat, template PO/surat jalan/penawaran, riwayat versi dokumen |

### Industri (Bab 17–31)

| Bab | Industri | Status | Catatan |
|---|---|---|---|
| 17 | Retail & grocery | VERIFIED (inti) | Celah: promosi/bundling, konsinyasi, kedaluwarsa, analitik kasir |
| 18 | Grosir & distribusi | PARTIAL → inti selesai 14 Nov | Penawaran, pesanan, surat jalan bertahap, faktur, batas kredit, tempo, daftar harga, umur piutang, penerima/gagal kirim. **MISSING:** rute & armada, foto bukti kirim, harga bertingkat per jumlah |
| 19 | F&B (kuliner) | PARTIAL | Meja, reservasi, QR meja, layar dapur, split bill ada; **MISSING** resep, konsumsi bahan, food cost, waste |
| 20 | Laundry | VERIFIED | Tahap proses, per kg/item, antar jemput, keluhan; celah: perawatan mesin |
| 21 | Properti & kos | VERIFIED | E2E lulus; celah: multi-properti per gedung, perpanjangan kontrak |
| 22 | Jasa profesional | PARTIAL | Lewat Business Builder (template) |
| 23 | E-commerce | MISSING | Halaman bisnis + permintaan ≠ toko online |
| 24 | Manufaktur | PARTIAL (template Builder) | BOM/produksi belum menjadi mesin |
| 25–31 | Bengkel, klinik, pendidikan, pertanian, hotel, konstruksi, logistik | PARTIAL (template Builder) | Data & alur via Builder; belum terhubung stok/akuntansi khusus |

### Intelligence, otomatisasi, platform

| Bab | Modul | Status | Catatan |
|---|---|---|---|
| 32 | Insight | PARTIAL | `/analisis` (temuan dari data), saran fitur; standar insight (sumber, metode, kecukupan data) belum seragam |
| 33 | Business Health Score | MISSING | |
| 34 | Forecast & skenario | MISSING | |
| 35 | Automation | VERIFIED (resep) | Resep tetap + log + jeda; **MISSING** rule builder bebas (pemicu/syarat/tindakan dipilih pemilik) |
| 36 | Approval matrix | PARTIAL | Peran, tindakan, nominal, 2 tingkat (Pro); **MISSING** per cabang/departemen |
| 37–39 | Onboarding adaptif | VERIFIED | `/mulai`, Pusat Konfirmasi, rekomendasi modul dari profil |
| 40–42 | Portal, tracking, chat | PARTIAL | Portal penghuni, cek status pesanan jasa; **MISSING** login pelanggan, chat & tiket pelanggan |
| 43–44 | Admin platform | VERIFIED | Peran staf + MFA, akses bantuan terbatas & tercatat, tiket, audit, status sistem; **MISSING** tampilan registry modul |
| 45 | Entitlement | VERIFIED | `plan_has` di server, uji per fitur |
| 5–6 | Module Registry & dependensi | PARTIAL → diperbaiki tahap ini | Tabel `modules` + `business_modules` + dependensi wajib; metadata Bab 5 belum lengkap |
| 8 | Event lintas modul | VERIFIED (14 Nov) | `domain_events` outbox transaksional + idempoten, riwayat aktivitas `/aktivitas`, pemantauan kelengkapan di Admin › Status sistem. Belum ada penangan asinkron (dipakai saat integrasi/notifikasi) |

## 3. Temuan masalah

1. **Melanggar keputusan pemilik 13 Nov 2026:** modul `u_asisten` "Asisten AI" masih tampil "Segera hadir" di Konfigurasi › Modul. → dihentikan di tahap ini.
2. Registry belum mencatat fitur yang sudah ada (Persetujuan, Otomatisasi, Anggaran, Analisis, Media, Lampiran, Lokasi) → katalog tidak lengkap.
3. Status implementasi platform & status aktivasi pelanggan tercampur di satu kolom `status` (available/segera) — Bab 5 meminta dipisah.
4. Menonaktifkan modul tidak menampilkan dampak (menu yang hilang, data yang tetap) sebelum dikonfirmasi.

5. **Aturan terlalu kaku (keluhan pemilik 14 Nov):** sewa tidak bisa diakhiri bila tanggal masuk belum tiba atau tanggal keluar belum tiba; rencana selesai ditahan tagihan; booking −7 hari; langsung huni +7 hari; jemput tanpa opsi "antar sendiri"; pesanan siap tidak bisa dikoreksi; tamu terlambat tidak bisa ditandai datang. → dilonggarkan di migrasi `20261114210000` (keuangan tetap terjaga: tagihan yang sudah dibayar tidak dibatalkan diam-diam). Rekening/QRIS di halaman bisnis kini untuk semua jenis bisnis dengan saklar pemilik.
6. Celah yang ditemukan saat audit: **pindah kamar** penghuni belum ada (harus akhiri + mulai sewa baru, deposit tidak ikut) → masuk backlog P1.

## 4. Backlog berprioritas (Bab 54–55)

| Prio | Pekerjaan | Fase |
|---|---|---|
| P0 | ~~Module Registry V2 + dependency graph + dampak nonaktif + registry di Admin~~ — selesai 14 Nov | 0 |
| P0 | ~~Domain event outbox + riwayat aktivitas per dokumen~~ — selesai 14 Nov | 1 |
| P1 | ~~Pajak (PPN) & split payment di kasir + jurnal pajak~~ — selesai 14 Nov (PPN keluaran; masukan menyusul bersama faktur pembelian) | 1 |
| P1 | ~~Penawaran harga → sales order → surat jalan → faktur (grosir) + batas kredit & daftar harga pelanggan~~ — selesai 14 Nov (belum: rute/armada, harga bertingkat per jumlah, reservasi stok keras) | 1–2 |
| P1 | ~~Pindah kamar penghuni~~ — selesai 14 Nov | 1 |
| P1 | ~~Batch & kedaluwarsa + saran pemesanan ulang~~ — selesai 14 Nov (FEFO otomatis, mutasi membawa batch; belum: nomor seri, blokir jual barang kedaluwarsa opsional) | 1 |
| P1 | ~~Data karyawan, absensi, shift, gaji (jurnal gaji)~~ — selesai 14 Nov (belum: cuti diajukan karyawan, komisi, BPJS/PPh 21) | 1 |
| P1 | ~~Aset tetap & penyusutan otomatis~~ — selesai 14 Nov (garis lurus, pelepasan aset, jurnal otomatis; belum: saldo menurun, penyusutan fiskal, foto/lampiran aset) | 1 |
| P2 | ~~Resep & food cost kuliner (konsumsi bahan otomatis)~~ — selesai 14 Nov (resep per menu, potong bahan saat selesai, food cost % & margin, porsi tersedia, bahan terbuang; belum: sub-resep/bumbu racikan, menu engineering, yield/susut masak) | 2 |
| P2 | ~~Promosi & bundling~~ — selesai 14 Nov (diskon barang, beli X gratis Y, paket, minimal belanja; terjadwal; dihitung server; di struk). **Belum:** konsinyasi, promo untuk jasa/kuliner, voucher/kode kupon, poin loyalti | 2 |
| P2 | Permintaan pembelian, invoice supplier, 3-way matching | 2 |
| P3 | Business Health Score per jenis bisnis, proyeksi & skenario | 4 |
| P3 | Rule builder otomatisasi bebas | 4 |
| P4 | Login & chat pelanggan, toko online, integrasi keluar | 5 |
| P2–P3 | Mesin khusus Manufaktur, Logistik, Event (blueprint terpisah) | 3 |

Setiap item: database + RPC + UI + panduan + uji SQL + regresi sebelum dinyatakan selesai (Bab 59).
