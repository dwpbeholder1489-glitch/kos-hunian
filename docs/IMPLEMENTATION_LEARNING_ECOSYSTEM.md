# Laporan implementasi PRASARA Interactive Learning & Transaction Guide

## Komponen dan integrasi

- Learning Center yang ada kini menampung Memulai, Materi, Pusat Praktik, Progres dan Bantuan. Komponen yang digunakan kembali meliputi KosProvider, PageHelp, NavIcon, panduan internal, tema PRASARA serta aturan area dan modul dari business.js.
- LearningPractice menangani pemilihan item, pelanggan, jumlah, diskon, pembayaran, review, bukti, dan pengerjaan pesanan DEMO. Endpoint `POST /api/learning/demo` memeriksa input dengan fixture internal. Jalur modul produksi tetap menggunakan aturan dan RPC yang sudah ada.
- Katalog memakai kategori bisnis, modul aktif, area akses dan objek Business Builder. Materi Builder membaca kolom yang terlihat dan alur status dari konfigurasi aktual saat dibuka. Tautan panduan menuju konfigurasi, transaksi, persediaan, pelanggan, keuangan, pembelian, pengeluaran, dan laporan yang diizinkan. Catatan versi lama tetap tersimpan.
- Tur Kasir, Pesanan, Tagihan, Learning Center, dan beberapa halaman pelanggan menggunakan target yang dapat ditemukan di UI. Panel tur tidak bersifat modal. Halaman lain tetap menyediakan langkah bantuan yang bisa dibaca dalam halaman.
- Pusat Notifikasi menampilkan pengingat belajar lokal jika pengguna memulai tetapi belum menyelesaikan materi, dan pengingat dapat dimatikan di Progres. Pengingat pelanggan, email, push, dan webhook tidak dipicu.

## Penyimpanan dan isolasi

Progres, tahap terakhir, waktu, kategori, peran, versi, draf DEMO, jumlah simulasi dan 50 percobaan evaluasi terakhir tersimpan di peramban dengan kunci akun dan bisnis. Progres transaksi juga dipisah menurut peran dan jalur belajar. Jawaban yang sudah diperiksa dapat dilanjutkan setelah halaman dimuat ulang. Status kegagalan penyimpanan terlihat di Learning Center. Materi selesai yang tidak tersedia pada konfigurasi saat ini tidak ikut denominator katalog.

Endpoint DEMO tidak mengimpor klien database, penyelesaian transaksi atau penyedia pembayaran. Sistem memakai item, pelanggan, stok dan diskon fixture. Untuk contoh Kasir dengan PPN aktif, antarmuka menyalin hanya tarif PPN ke kalkulator DEMO. Tarif diperiksa dalam batas konfigurasi Kasir. Bukti hasil latihan hanya tersedia pada sesi tampilan. Satu tabel baru, `learning_progress`, menyinkronkan tahap transaksi dan ringkasan hasil akun dan bisnis aktif. RLS membatasi pembacaan ke pemilik catatan yang masih menjadi anggota. RPC menggabungkan tahap selesai dan percobaan dari beberapa perangkat sambil menjaga langkah terbaru. Tabel tunduk pada pengaman bisnis tertutup. Draf, riwayat katalog, preferensi, dan tur tetap lokal.

## Status akhir

| Status | Cakupan |
| --- | --- |
| Berfungsi | Orientasi dan katalog, delapan tahap, latihan transaksi tiga mode, resume draf dan evaluasi, review, bukti DEMO, kasus koreksi, peta modul, penilaian informatif, glosarium serta pencarian berbasis aturan. |
| Berfungsi | Validasi backend untuk jumlah, stok DEMO, pelanggan, hari jatuh tempo, diskon, pajak termasuk harga, pembayaran sebagian, penerimaan, dan kembalian. |
| Sebagian berfungsi | Latihan produk, pelanggan, pengeluaran dan laporan memakai studi kasus singkat. Belum mereplikasi formulir operasional lengkap. |
| Sebagian berfungsi | Tur bertarget tersedia pada halaman tertentu. Modul lain memakai bantuan kontekstual. Adaptasi Builder memakai objek, kolom, dan aturan status aktual, dengan latihan kas ketika tersedia. |
| Sebagian berfungsi | Progres inti transaksi disinkronkan. Katalog, pengingat, tur, dan draf tetap lokal. Riwayat versi lama dipertahankan dan tahap dasar yang setara dibawa ke versi baru. |
| Belum tersedia | Sinkronisasi draf dan katalog lintas perangkat, konfigurasi materi khusus melalui editor Business Builder, dan bukti DEMO permanen. |
| Perlu verifikasi | UAT pengguna pemula, keyboard virtual perangkat fisik, serta regresi dengan akun dan database staging untuk seluruh modul operasional. |

## Verifikasi

- `node --test tests/*.test.mjs` mencakup contoh Rp500.000/Rp300.000 dan Rp500.000/Rp600.000, diskon, PPN, batas stok, kuantitas desimal, izin, objek Builder, payload salah dan batas ukuran endpoint.
- Build produksi dan 32 tes Node lulus. Chromium diuji pada lebar 390, 768 dan 1440 px, termasuk tema gelap, tur yang dapat dijeda, resume sesi, dan visibilitas kolom Builder. Chromium memakai Supabase tiruan untuk membuktikan alur latihan dan tidak adanya pemanggilan tulis produksi dalam latihan yang diuji. Simulasi memakai endpoint Next.js yang berjalan dan fixture terisolasi.
- `supabase/tests/learning_progress.sql` menguji penggabungan progres, batas nilai, dan isolasi akun dan bisnis di PostgreSQL 16 setelah seluruh migrasi diterapkan.
- Regresi SQL lokal lulus untuk `e2e_kos`, `kasir_offline`, `akses_persetujuan_pro`, dan `adaptive_experience`.
- Jalur transaksi operasional tidak diedit selain penandaan elemen untuk sorotan. Regresi sistem penuh terhadap data produksi tidak dilakukan.
