# Customer Experience V3.0

## Audit repositori

| Area | Bukti dan keputusan |
| --- | --- |
| Portal dan identitas | `/b/[slug]` memberi akses katalog publik. Portal retail memakai cookie tamu HttpOnly yang dicocokkan ke hash pada pesanan. `/c/[token]` memakai pemeriksaan kontak dan hak portal grosir yang sudah tersedia. `/p/[token]` tetap memakai akses penghuni. Belum ada identitas pelanggan terverifikasi lintas bisnis. |
| Chat terdahulu | `/api/portal-chat` menangani asisten penghuni, sedangkan portal retail menyediakan tautan WhatsApp. Chat pemilik–pelanggan membutuhkan penyimpanan pesan dan pemeriksaan konteks transaksi. |
| Tracking dan workflow | `domain_events` merekam aktivitas transaksi secara atomik. Penjualan grosir dan surat jalan sudah menerbitkan event. Migrasi `20261121120000_alur_kerja.sql` mengatur versi dan aturan workflow internal. Pemetaan versi workflow ke setiap transaksi portal masih diperlukan. |
| Pemenuhan dan pembayaran | Checkout retail, surat jalan, pengiriman parsial, invoice, piutang, persetujuan versi penawaran, dan pencatatan pembayaran berasal dari modul bisnis yang sudah ada. |
| Dokumen | Penyimpanan privat dan URL bertanda tangan tersedia untuk jenis lampiran yang sudah didukung, termasuk lampiran penawaran. Hak akses lampiran chat masih perlu dibangun. |
| Booking dan ketersediaan | Booking kamar, reservasi meja, slot layanan dan kapasitas sudah memiliki alur masing-masing. Mesin reservasi lintas sumber daya masih perlu dievaluasi. |
| Notifikasi | `notif_event_types`, `notif_queue`, dan pengaturan kanal sudah tersedia. Chat pelanggan menambah satu jenis event ke infrastruktur ini. Isi pesan tersimpan di chat. |

## Implementasi tahap ini

- `customer_messages` menyimpan pesan teks dua arah, UUID idempoten, konteks pesanan, pihak pengirim, waktu server, dan status dibaca. Tidak ada akses tabel langsung untuk klien. RPC pemilik memeriksa kepemilikan bisnis. RPC pelanggan dibatasi ke server dan memakai kredensial portal yang sudah ada.
- Adaptor transaksi `so_order` mencakup retail checkout tamu dan pesanan pada tautan pribadi grosir. Komponen chat yang sama digunakan pada dua portal pelanggan dan detail transaksi pemilik.
- Inbox pemilik di Pesanan grosir menampilkan hingga 100 percakapan terbaru dengan pencarian pelanggan atau nomor transaksi. Chat mengambil 40 pesan per halaman dan memeriksa pembaruan tiap lima detik saat panel terbuka.
- Aktivitas transaksi menampilkan hingga 100 event dari pesanan dan surat jalannya. Pelanggan menerima kode event dan waktu yang diizinkan. Ringkasan internal, catatan, alasan pembatalan dari event, dan metadata aktor tetap berada di sumber internal.
- Pesan baru pelanggan menerbitkan event untuk notifikasi pemilik. Daftar pesanan tamu menampilkan jumlah balasan belum dibaca. Pengiriman eksternal bergantung pada konfigurasi kanal yang sudah tersedia.

## Kandidat profil dan cakupan 15 kategori

Berikut pemetaan rancangan awal. Hanya adaptor retail dan grosir pada baris pertama yang terhubung ke chat dan tracking baru dalam tahap ini.

| Kategori | Workflow pelanggan yang akan dipetakan | Sumber dan status |
| --- | --- | --- |
| Retail dan perdagangan | Pesanan → konfirmasi → pemenuhan → penyerahan | `so_orders`, `so_deliveries`; adaptor aktif |
| Properti dan hunian | Pengajuan → booking → check-in → sewa → keluar | Booking, lease, tagihan, keluhan; integrasi baru tertunda |
| Laundry dan jasa rumah tangga | Pickup → pemeriksaan → pengerjaan → pengembalian | `svc_orders`, tahap jasa dan antar-jemput; integrasi tertunda |
| Kuliner dan hospitality | Pesanan → dapur → siap → diserahkan; reservasi meja terpisah | Pesanan jasa kuliner, dapur, meja; integrasi tertunda |
| Distribusi dan logistik | Penawaran → alokasi → pengiriman parsial → diterima | Grosir mendukung surat jalan; adaptor ekspedisi tertunda |
| Manufaktur dan produksi | Spesifikasi → persetujuan → produksi → QC → kirim | Integrasi produksi dan kontrak publik tertunda |
| Jasa profesional | Brief → penawaran → milestone → review → serah terima | Mesin jasa/proyek; integrasi portal tambahan tertunda |
| Kesehatan dan kecantikan | Pilih tenaga → jadwal → check-in → layanan → selesai | Adaptor jadwal dan pengamanan data kesehatan tertunda |
| Pendidikan dan pelatihan | Daftar → kelas → penilaian → selesai → sertifikat | Inisiatif Learning Ecosystem diaudit terpisah; integrasi portal pelanggan tertunda |
| Event dan hiburan | Penawaran → booking → persiapan → pelaksanaan → pelunasan | Proyek dan termin; ticketing dan portal tertunda |
| Otomotif | Booking → inspeksi → estimasi → persetujuan → servis → serah terima | Mesin jasa sebagai kandidat; kendaraan dan profil portal tertunda |
| Pertanian dan peternakan | Permintaan → kesepakatan grade dan harga → penyerahan | Kandidat grosir; profil panen dan kemitraan tertunda |
| Konstruksi dan proyek | Survei → kontrak → progres → persetujuan → serah terima | Proyek, milestone dan tagihan termin; integrasi portal tertunda |
| Travel dan pariwisata | Reservasi → pembayaran → persiapan → keberangkatan → selesai | Adaptor kapasitas, itinerary, dan sewa kendaraan tertunda |
| Organisasi dan lainnya | Pendaftaran → aktivasi → kegiatan/iuran → perpanjangan | Kandidat Business Builder; keanggotaan dan izin perwakilan tertunda |

## Cakupan yang masih terbuka

Portal Builder pelanggan, konfigurasi menu lintas profil, versi workflow terikat transaksi, status publik yang dapat diedit, pusat dokumen universal, pembayaran/refund lintas kategori, hak akses staf per penugasan atau cabang, pemulihan akun, perwakilan/wali, chat lampiran dan catatan internal, status dan penugasan percakapan, tiket dukungan, retensi dan ekspor chat, preferensi notifikasi pelanggan, notifikasi event pelanggan dengan status dibaca terpisah, serta analitik masih membutuhkan tahap berikutnya. WhatsApp otomatis dan GPS memerlukan integrasi resmi serta pengujian konfigurasi. Link WhatsApp lama tetap dapat dipakai.

Tahap berikutnya yang disarankan adalah memvalidasi adaptor pesanan jasa dan penghuni dengan sumber event masing-masing, lalu menambahkan konfigurasi publik per subjenis dan akses staf per penugasan. Sebelum produksi, verifikasi migrasi, backup dan prosedur rollback, alur dua browser dengan kredensial terisolasi, dan render HP/desktop. Untuk rollback aplikasi, kembalikan versi frontend dan biarkan riwayat pesan tersimpan.

## Bukti pengujian tahap retail

| Pengujian | Hasil lokal |
| --- | --- |
| Rangkaian migrasi | Lulus di PostgreSQL melalui PGlite dengan skema platform Supabase untuk pengujian. |
| Akses dan isolasi | Uji SQL menolak akses sesi tamu lain, slug toko lain, pemilik bisnis lain, dan akses langsung ke tabel pesan. |
| Percakapan dan notifikasi | Uji SQL memverifikasi pesan dua arah, deduplikasi pengiriman ulang, tanda dibaca, dan satu notifikasi pemilik dengan tautan ke transaksi serta tanpa isi pesan. |
| Tracking dan regresi pesanan | Uji SQL membaca event konfirmasi dan penerimaan dari transaksi nyata serta menjalankan checkout, penawaran grosir, stok, dan penilaian produk. |
| Portal browser | Chromium menjalankan checkout, mengirim pesan, memuat ulang riwayat, membaca event transaksi, menguji sesi kedua, dan memeriksa overflow pada 390 px dan 1280 px dengan basis data lokal. |
| Regresi JavaScript | 32 pengujian Node lulus. |
