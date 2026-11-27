# Audit awal PRASARA Interactive Learning & Transaction Guide

Baseline `cc95535`. Audit sumber, navigasi, migrasi, dan tes yang tersedia. Status operasional di bawah berarti jalur aplikasi dan layanan terlihat di repositori. Pengujian produksi dengan akun bisnis belum dilakukan.

| Area | Kondisi | Bukti dan implikasi |
| --- | --- | --- |
| Arsitektur | Tersedia | Next.js App Router, Supabase, KosProvider, AppLayout. Gunakan layout dan konteks bisnis aktif. |
| Navigasi | Tersedia | `lib/business.js` dan `lib/menu.js` mengatur kategori, area, status setup dan modul. |
| Dashboard | Tersedia | Beranda, Toko, Jasa, Kerja. Metrik berbeda per kategori. |
| Pendaftaran | Tersedia | `app/mulai` dan `setup_create`. Usaha draf masuk Konfirmasi. |
| Business Builder | Tersedia | `bb_workspace`, objek, kolom, status, validasi, menu Catatan dinamis. |
| Konfigurasi usaha | Tersedia | Konfirmasi, Konfigurasi dan registry modul. Gunakan izin yang ada. |
| Transaksi | Tersedia | Penjualan, Pesanan, Tagihan dan Pembayaran punya alur dan penyimpanan berbeda. |
| POS | Tersedia / tidak relevan bagi sebagian kategori | Kasir Retail dan pengalaman pemesanan Kuliner. Kos dan Builder memakai alur sesuai jenisnya. |
| Persediaan | Tersedia / tidak relevan bila modul mati | Barang, mutasi, pergerakan lokasi, bahan opsional. |
| Produk dan layanan | Tersedia | Barang, satuan dan harga ecer/grosir. Jasa memakai Layanan & tahap. |
| Pelanggan | Tersedia | Kontak, penghuni, portal, pelanggan pesanan. |
| Keuangan | Tersedia | Kas, pembukuan dan analisis. Hak akses per area. |
| Kas dan rekening | Tersedia | Jenis penerimaan, pembukuan, dan rekonsiliasi. |
| Piutang dan utang | Tersedia | Kas dan kontak, `receivable_open`, tagihan sewa. |
| Pembelian | Tersedia / tidak relevan bila modul mati | Belanja, penerimaan, retur supplier. |
| Pengeluaran | Tersedia | Pengeluaran Kos dan pencatatan biaya melalui Kas. |
| Laporan | Tersedia | Laporan per kategori, Rekap dan Analisis Bisnis. |
| Pengaturan | Tersedia | Pengaturan, konfigurasi, pusat pengalaman. |
| Hak akses | Tersedia | `my_access`, `member_in`, RLS, izin persetujuan. Area finance dapat dikonfigurasi pada peran yang didukung. |
| Notifikasi | Tersedia sebagian | Pusat Notifikasi operasional, email onboarding Kos. Pengingat belajar khusus belum tersedia. |
| Bantuan | Tersedia sebagian | PAGE_HELP, HELP, searchHelp, buku panduan, F1 dan tur. Tur modal saat ini mengunci navigasi dan selector generik dapat menyorot elemen yang keliru. |
| Database | Tersedia | Relasi per kos, RLS serta RPC transaksi. Belum ada penyimpanan progres belajar lintas perangkat. |
| UI | Tersedia | PageHelp, PageHeader, komponen kartu, ikon, CSS tema gelap dan responsif. |
| Progres | Tersedia sebagian | localStorage dipisah akun/bisnis/peran. Hanya lima tahap dan nilai terakhir. Riwayat percobaan, resume rincian serta status materi berubah belum lengkap. |
| Praktik | Tersedia sebagian | Demo transaksi di memori. Mode latihan, status, koreksi, bukti, verifikasi backend dan katalog latihan belum lengkap. |

## Rencana integrasi sebelum perubahan komponen

1. Perluas Learning Center yang telah ada dengan orientasi, katalog dari rute yang diizinkan, delapan tahap transaksi, kesiapan, glosarium, dan petunjuk koreksi. Gunakan PAGE_HELP, HELP, aturan business, komponen UI dan halaman bantuan bersama.
2. Tambahkan perhitungan simulasi murni dan endpoint pemeriksaan DEMO tanpa koneksi database. Gunakan fixture yang diberi label, pembulatan rupiah, validasi input, tiga mode serta bukti riwayat lokal. Jalur produksi tetap memakai RPC dan izin yang sudah berlaku.
3. Perbaiki tur menjadi panel nonmodal dengan target aktual dan tindakan sehingga tur tidak menahan navigasi. Ada fallback berupa bantuan halaman ketika target spesifik tidak tersedia.
4. Tambahkan penyimpanan tahap, hasil, percobaan dan pengingat yang dapat dikendalikan. Pertahankan catatan versi lama. Pisahkan progres dan payload latihan.
5. Uji aturan akses, alur UI, perhitungan, batas backend dan regresi. Laporkan fitur yang masih memerlukan verifikasi.

Risiko utama adalah kebocoran data lintas bisnis, penggunaan tarif/aturan produksi yang keliru, salah sorot saat elemen tidak tersedia, dan hilangnya progres versi lama. Mitigasi melalui pemisahan kode, fixture terisolasi, filter akses, selector stabil dan migrasi progres non-destruktif.
