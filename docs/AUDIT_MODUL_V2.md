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
| 10 | Sales & POS (toko) | VERIFIED (inti) | `/kasir`, `sales`, `sale_lines`, multi-satuan, harga eceran/grosir, diskon, kasbon, retur, shift | **MISSING:** pajak (PPN), split payment, penawaran harga (quotation), sales order B2B, komisi, laporan tutup harian, varian produk |
| 11 | Inventory | VERIFIED (inti) | `stock_moves` (ledger), `stock_levels` per lokasi, mutasi, opname, penyesuaian beralasan | **MISSING:** batch/kedaluwarsa, serial, reservasi stok, saran pemesanan ulang (reorder point/safety stock), umur stok |
| 12 | Accounting | VERIFIED | `acct_*` double-entry otomatis, periode tutup, buku besar, neraca, laba rugi, arus kas, rekonsiliasi bank, anggaran | **MISSING:** aset tetap & penyusutan otomatis, pajak, cost center, akrual/dibayar dimuka terjadwal |
| 13 | Procurement | PARTIAL | `purchases` (pesan, terima sebagian), retur supplier, pelunasan utang | **MISSING:** permintaan pembelian, RFQ, invoice supplier & 3-way matching, kinerja supplier |
| 14 | CRM | PARTIAL | `contacts`, `crm_leads/activities/tasks`, riwayat transaksi | **MISSING:** klasifikasi pelanggan, batas kredit, daftar harga khusus, loyalti/member, profitabilitas pelanggan |
| 15 | HR | MISSING (sebagian) | Hanya akun karyawan (`kos_members`) + hak akses | **MISSING:** data karyawan (termasuk tanpa akun), absensi, jadwal shift, cuti, gaji, lembur, komisi |
| 16 | Dokumen | PARTIAL | Struk, kwitansi, nota, ekspor Excel/PDF, lampiran privat, media publik | **MISSING:** penomoran dokumen terpusat, template PO/surat jalan/penawaran, riwayat versi dokumen |

### Industri (Bab 17–31)

| Bab | Industri | Status | Catatan |
|---|---|---|---|
| 17 | Retail & grocery | VERIFIED (inti) | Celah: promosi/bundling, konsinyasi, kedaluwarsa, analitik kasir |
| 18 | Grosir & distribusi | PARTIAL | Harga grosir ada; **MISSING** sales order, batas kredit, rute & surat jalan, bukti kirim |
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

## 4. Backlog berprioritas (Bab 54–55)

| Prio | Pekerjaan | Fase |
|---|---|---|
| P0 | ~~Module Registry V2 + dependency graph + dampak nonaktif + registry di Admin~~ — selesai 14 Nov | 0 |
| P0 | ~~Domain event outbox + riwayat aktivitas per dokumen~~ — selesai 14 Nov | 1 |
| P1 | Pajak (PPN) & split payment di kasir + jurnal pajak | 1 |
| P1 | Penawaran harga → sales order → pengiriman/surat jalan → invoice (grosir) + batas kredit & daftar harga pelanggan | 1–2 |
| P1 | Batch & kedaluwarsa + saran pemesanan ulang | 1 |
| P1 | Data karyawan, absensi, shift, gaji (jurnal gaji) | 1 |
| P1 | Aset tetap & penyusutan otomatis | 1 |
| P2 | Resep & food cost kuliner (konsumsi bahan otomatis) | 2 |
| P2 | Promosi & bundling, konsinyasi | 2 |
| P2 | Permintaan pembelian, invoice supplier, 3-way matching | 2 |
| P3 | Business Health Score per jenis bisnis, proyeksi & skenario | 4 |
| P3 | Rule builder otomatisasi bebas | 4 |
| P4 | Login & chat pelanggan, toko online, integrasi keluar | 5 |
| P2–P3 | Mesin khusus Manufaktur, Logistik, Event (blueprint terpisah) | 3 |

Setiap item: database + RPC + UI + panduan + uji SQL + regresi sebelum dinyatakan selesai (Bab 59).
