import Link from 'next/link';
import LandingNav from '@/components/LandingNav';
import { BUSINESS, SITE_HOST } from '@/lib/plan';
import {
  ScrSignup, ScrHelp, ScrRoomEdit, ScrStartLease, ScrRooms, ScrInvoices, ScrPay, ScrVerify, ScrReminder,
  ScrExtra, ScrExpense, ScrOwner, ScrEndLease, ScrDashboard, ScrReport, ScrExport, ScrReceipt, ScrPlan, ScrPenawaran, ScrUpgradeSukses, ScrAlasanBerhenti, ScrAnggaran, ScrRekonBank, ScrAksesKaryawan, ScrPersetujuanTingkat, ScrAnalisis, ScrGrosir, ScrSDM, ScrSatuan, ScrAset, ScrResep, ScrPromo, ScrFaktur, ScrKonsinyasi, ScrVarian, ScrKomisi, ScrBeliBanyak, ScrKesehatanStok, ScrHargaPelanggan, ScrUmurPiutang, ScrPaketSeri, ScrKasirOffline, ScrNotifAktif, ScrNotifCenter, ScrNotifSet, ScrProyek, ScrPenawaranProyek, ScrBiayaProyek, ScrTagihanProyek, ScrPortalPelanggan, ScrPortal, ScrPesanan, ScrNota, ScrDeposit, ScrPerbaikan, ScrMeteran, ScrBooking, ScrBuilder, ScrCatatan, ScrLampiran, ScrKonfirmasi, ScrAntar, ScrDapur, ScrMeja, ScrMedia, ScrTurPanduan } from '@/components/demo/Screens';

import HitungKunjungan from '@/components/HitungKunjungan';
export const metadata = {
  title: 'Panduan PRASARA — Langkah demi Langkah',
  description: 'Panduan lengkap memakai PRASARA: kamar, penghuni, tagihan otomatis, pembayaran, pengeluaran, laporan, kwitansi, dan langganan.',
  openGraph: { title: 'Panduan PRASARA — Langkah demi Langkah', description: 'Cara memakai PRASARA dari daftar sampai laporan, lengkap dengan gambar.', url: '/panduan', images: [{ url: '/og.jpg?v=3', width: 1200, height: 630 }] },
};

const wa = `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent('Halo, saya butuh bantuan memakai aplikasi PRASARA.')}`;
const Std = () => <span className="chip gold" style={{ marginLeft: 6 }}>Dasar</span>;
const Pro = () => <span className="chip gold" style={{ marginLeft: 6 }}>Pro</span>;
const Bis = () => <span className="chip gold" style={{ marginLeft: 6 }}>Bisnis</span>;

// Menu toko (Retail & Grosir)
const MENUS_TOKO = [
  ['Dashboard toko', 'Penjualan & laba hari ini, bulan ini vs bulan lalu, tren harian, barang terlaris, transaksi terakhir, perlu perhatian, stok menipis'],
  ['Kasir', 'Jual eceran/grosir, kartu barang bergambar per kategori, tahan transaksi, scan barcode, struk'],
  ['Penjualan & Shift kasir', 'Riwayat transaksi, retur, batal; buka/tutup laci'],
  ['Belanja', 'Pesan ke supplier, terima barang, retur ke supplier, utang supplier'],
  ['Mutasi stok', 'Pindahkan barang antar lokasi; pemilik: tambah gudang/cabang dari sini'],
  ['Prospek & tindak lanjut', 'Calon pelanggan/penghuni, tahapan, catatan, jadwal hubungi lagi'],
  ['Halaman bisnis', 'Tautan publik: profil, katalog/kamar, formulir permintaan (Portal, Paket Pro)'],
  ['Kas & kasbon', 'Saldo kas/bank, biaya, kasbon pelanggan, utang, pinjaman & cicilan'],
  ['Barang & stok', 'Barang, satuan, harga, barcode, label, tombol cepat'],
  ['Pelanggan & supplier', 'Kontak, sisa kasbon/utang, riwayat'],
  ['Laporan', 'Laba, barang terlaris dan tidak laku'],
];
// Menu jasa (Jasa & Laundry)
const MENUS_JASA = [
  ['Dashboard', 'Antrean per tahap, terlambat, harus selesai hari ini, jemput/antar, uang masuk hari ini'],
  ['Pesanan', 'Terima pesanan, pindah tahap, siap, serahkan, bayar/DP, nota, keluhan, batal'],
  ['Kas', 'Saldo kas/bank, biaya, uang masuk/keluar lain, utang supplier'],
  ['Laporan', 'Pendapatan, laba perkiraan, per layanan, pelanggan, ketepatan waktu, keluhan'],
  ['Layanan & tahap', 'Harga per kg/pcs, minimal, lama pengerjaan; urutan tahap proses'],
  ['Bahan & stok', 'Deterjen, pewangi, plastik: stok, belanja, pemakaian'],
  ['Dapur (Kuliner)', 'Layar dapur: pesanan per tahap, meja/bungkus/antar, catatan menu, tombol tahap berikutnya'],
  ['Meja & reservasi (Kuliner)', 'Status tiap meja, tagihan per meja (bayar semua / bagi rata / per item), tutup meja, reservasi'],
];
const MENUS = [
  ['Dashboard', 'Ringkasan kas bulan ini, hunian, tagihan, tunggakan, dan jatuh tempo terdekat'],
  ['Kamar', 'Peta kamar, harga sewa, fasilitas, dan memasukkan penghuni'],
  ['Penghuni', 'Data penghuni, tunggakan, deposit/uang jaminan, pengingat WhatsApp, dan akhiri sewa'],
  ['Tagihan', 'Tagihan sewa otomatis, tagihan tambahan, dan mencatat pembayaran'],
  ['Pembayaran', 'Memverifikasi pembayaran dan riwayat uang masuk per bulan'],
  ['Booking kamar', 'Pesan kamar untuk tanggal masuk, uang tanda jadi, check-in, batal/hangus'],
  ['Keluhan & perbaikan', 'Kerusakan/keluhan per kamar, penanggung jawab, status, biaya perbaikan'],
  ['Meteran listrik/air', 'Angka meter per kamar tiap bulan → tagihan tambahan otomatis'],
  ['Pengeluaran', 'Biaya kos (termasuk gaji pengelola) dan uang yang diambil pemilik'],
  ['Laporan', 'Laba rugi, arus kas, tren 6 bulan, ekspor Excel dan PDF'],
  ['Langganan', 'Paket aktif, perpanjang, dan cara bayar'],
  ['Pengaturan', 'Profil kos, kategori pengeluaran, unduh semua data, tutup bisnis, keluar'],
  ['Promo & bundling', 'Diskon barang, beli X gratis Y, paket bundling, minimal belanja — terjadwal & otomatis di Kasir (toko)'],
  ['Aset tetap', 'Daftar aset (motor, mesin, peralatan), penyusutan otomatis per bulan, nilai buku, jual/buang aset'],
  ['SDM & gaji', 'Data karyawan, jadwal shift, absensi (karyawan bisa absen sendiri), kasbon, hitung & bayar gaji, slip gaji'],
  ['Karyawan', 'Undang karyawan, atur peran & akses per modul/tindakan, penyetuju, nonaktifkan, hapus'],
  ['Persetujuan', 'Permintaan tindakan berisiko dari karyawan & otomatisasi; aturan & tingkat persetujuan'],
  ['Otomatisasi', 'Pekerjaan rutin setiap pagi: stok menipis, kasbon, tagihan telat, ringkasan bulanan/mingguan, penjualan turun, anggaran'],
  ['Konfigurasi', 'Profil bisnis, modul aktif, saran, cabang & gudang, riwayat'],
  ['Pusat Pengalaman', 'Profil bisnis (Business DNA), fitur & rekomendasi beralasan, atur menu, tombol (+) & dashboard, tahap bisnis, pulihkan pengaturan'],
  ['Pembukuan', 'Jurnal otomatis, buku besar, laba rugi, neraca, tutup periode, rekonsiliasi bank & anggaran (Paket Bisnis)'],
  ['Analisis Bisnis', 'Skor kesehatan, insight & tindak lanjut, filter periode/cabang, drill-down ke transaksi sumber, ekspor Excel/PDF'],
  ['Riwayat aktivitas', 'Siapa melakukan apa & kapan: penjualan, pembatalan, stok, pembayaran, tagihan, pesanan'],
];

// [bagian, judul, menu, langkah[], catatan, jenis catatan, layar, paket]
const PARTS = [
  ['A', 'Persiapan (sekali saja)', [
    ['Daftar dan kenalkan bisnis Anda', 'Halaman depan › Mulai Sekarang', [
      <>Buka <b>{SITE_HOST}</b>, tekan <b>Mulai Sekarang</b>. Isi <b>nama lengkap</b>, <b>email aktif</b>, <b>nomor WhatsApp</b>, dan <b>kata sandi</b> (minimal 8 karakter, berisi huruf dan angka — tombol <b>Lihat</b> menampilkan ketikan Anda), ulangi kata sandi, centang persetujuan Syarat & Privasi, lalu <b>Buat akun</b>.</>,
      <>Buka email dari PRASARA dan ketuk <b>tautan verifikasi</b>. Belum masuk? Di layar <b>Cek email Anda</b> tekan <b>Kirim ulang email verifikasi</b> (bisa setelah 60 detik). Akun belum aktif sebelum diverifikasi.</>,
      <>Setelah verifikasi muncul sambutan <b>Selamat datang di PRASARA</b> → <b>Daftarkan Bisnis Saya</b>. Di <b>Apa jenis bisnis yang Anda miliki atau kelola?</b> pilih satu atau lebih kategori (mis. Properti & Hunian, Retail, Laundry), lalu <b>Lanjut</b>.</>,
      <>Untuk tiap bisnis, formulir dibagi <b>5 bagian pendek</b>: <b>Identitas</b> (nama, jenis usaha, deskripsi), <b>Operasional</b> (alamat, nomor kontak, jam buka, status bisnis), <b>Pengelolaan</b> (nama pemilik, peran Anda, dikelola sendiri atau bersama tim), <b>Kebutuhan</b> (apa saja yang ingin dikelola + pertanyaan singkat, mis. kos: jumlah kamar), dan <b>Karakter bisnis</b> (model bisnis, sumber pendapatan, karakter operasional, kanal, skala — sudah terisi dari jenis usaha, tinggal disesuaikan; menentukan menu, dashboard & tombol (+), lihat Langkah 110). Tiap isian diberi tanda <b>Wajib</b>, <b>Opsional</b>, atau <b>Bisa nanti</b>. Isian tersimpan otomatis di akun Anda (di server), jadi bisa dilanjutkan dari HP atau laptop mana pun — bila terputus, buka lagi dan lanjutkan.</>,
      <>Di <b>Ringkasan</b> periksa semua isian (tekan <b>Ubah</b> di baris yang ingin diperbaiki), lalu <b>Buat draf bisnis</b>. Tiap bisnis dibuat terpisah sebagai <b>draf</b> — lanjutkan di <b>Pusat Konfirmasi</b> (Langkah 64) untuk melengkapi & mengaktifkannya. Alamat, kontak, dan jam buka yang sudah diisi tidak perlu diketik ulang.</>,
      <>Setelah bisnis aktif, Beranda menampilkan <b>Persiapan bisnis</b>: lengkapi profil, periksa modul, masukkan barang/layanan/kamar, atur cara pembayaran, tambah karyawan (opsional), dan catat transaksi pertama. Tekan <b>Kerjakan</b> untuk langsung ke halamannya, <b>Nanti</b> untuk melewati dulu, atau <b>Sembunyikan daftar ini</b>. Daftar yang sama selalu ada di Pusat Konfirmasi.</>,
    ], <>Karyawan tidak membuat bisnis baru: pilih <b>Saya karyawan…</b> dan minta pemilik mengundang email Anda di menu Karyawan. Tidak menerima email verifikasi? Periksa folder Spam atau Promosi, lalu kirim ulang. <b>Lupa kata sandi?</b> Di halaman Masuk tekan <b>Lupa kata sandi?</b>, isi email, buka tautan yang dikirim, lalu buat kata sandi baru. Nama & nomor WhatsApp bisa diubah di <b>Akun › Profil Anda</b>.</>, null, <ScrSignup />],
    ['Kenali tombol Panduan', 'Semua menu', [
      <>Di sebelah judul setiap menu ada tombol kecil <b>? Panduan</b>.</>,
      <>Tekan untuk membaca <b>Cara pakai</b> menu itu dalam 3 langkah.</>,
      <>Kotak kuning <b>Perhatian</b> berisi kesalahan yang sering terjadi.</>,
      <>Tekan <b>Mengerti</b> untuk kembali. Tombol <b>?</b> di pojok kanan atas membuka <b>Pusat bantuan</b> (lihat Langkah 22).</>,
    ], 'Kalau ragu di menu mana pun, buka Panduan dulu sebelum menyimpan.', null, <ScrHelp />],
    ['Isi harga dan data kamar', 'Kamar › ketuk kamar › Ubah data kamar', [
      <>Isi <b>Harga sewa / bulan</b>. Boleh ditulis 750000, 750.000, atau 750rb.</>,
      <>Isi <b>Fasilitas</b> dipisah koma, misalnya kasur, lemari, KM dalam.</>,
      <>Atur <b>Status</b>: Tersedia, Dalam perbaikan, atau Tidak disewakan.</>,
      <>Tekan <b>Simpan</b>. Ulangi untuk setiap kamar.</>,
    ], 'Status "Terisi" tidak perlu dipilih — otomatis berubah saat penghuni masuk.', null, <ScrRoomEdit />],
    ['Masukkan penghuni', 'Kamar › ketuk kamar Tersedia › Isi kamar ini', [
      <>Pilih <b>Penghuni baru</b>, isi <b>Nama lengkap</b> dan <b>No. WhatsApp</b>.</>,
      <>Isi <b>Harga sewa per bulan</b> dan <b>Tanggal masuk</b>.</>,
      <><b>Sewa dihitung mulai</b> biarkan sama dengan tanggal masuk (penghuni baru). Pilih <b>Batas bayar sewa bulan pertama</b>: <b>Hari masuk</b>, <b>+3 hari</b>, <b>+7 hari</b>, atau tanggal lain — sebelum tanggal itu tagihan tidak dianggap telat dan tidak ikut pengingat. Ada uang jaminan? Isi <b>Deposit diterima</b> (lihat Langkah 51). Tekan <b>Mulai sewa</b>.</>,
      <>Tagihan sewa langsung terbit otomatis dan kamar menjadi <b>Terisi</b>.</>,
    ], <><b>Penghuni lama</b> (sudah tinggal sebelum memakai aplikasi): isi <b>Sewa dihitung mulai</b> dengan awal periode <b>berikutnya yang belum dibayar</b>. Jika diisi tanggal masuk dulu, bulan-bulan yang sudah lunas ikut ditagih. Batas bayar bulan pertama bisa diubah lagi di <b>Penghuni › ketuk nama › Batas bayar bulan pertama</b> selama belum lunas.</>, 'warn', <ScrStartLease />],
    ['Periksa peta kamar', 'Kamar', [
      <>Warna kotak: <b>hijau</b> terisi, <b>biru</b> tersedia, <b>kuning</b> perbaikan, <b>abu</b> tidak disewakan.</>,
      <>Setiap kamar menampilkan penghuni, harga, dan tunggakan bila ada.</>,
      <>Saring dengan tombol <b>Semua · Tersedia · Terisi</b> di atas.</>,
    ], null, null, <ScrRooms />],
  ]],
  ['B', 'Rutin setiap bulan', [
    ['Cek tagihan yang terbit', 'Tagihan', [
      <>Tagihan sewa terbit sendiri <b>7 hari sebelum jatuh tempo</b>. Anda tidak perlu membuatnya.</>,
      <><b>Belum lunas</b>: masih ada sisa. <b>Menunggak</b>: lewat jatuh tempo.</>,
      <>Ketuk tagihan untuk melihat rincian dan riwayat pembayarannya.</>,
    ], null, null, <ScrInvoices />],
    ['Catat pembayaran', 'Tagihan › ketuk tagihan › Catat pembayaran (atau Penghuni / Kamar › Catat pembayaran / tandai lunas)', [
      <>Isi <b>Jumlah</b>. Bayar sebagian boleh — sisanya tetap tercatat.</>,
      <>Isi <b>Tanggal bayar</b> dan <b>Metode</b>: tunai, transfer, QRIS, atau <b>Dipotong dari deposit</b> (muncul bila penghuni punya deposit).</>,
      <>Centang <b>Uang sudah saya terima</b> bila uang sudah dicek masuk.</>,
      <>Tekan <b>Simpan pembayaran</b>. Status tagihan berubah otomatis.</>,
    ], <>Untuk transfer dan QRIS, centang <b>Uang sudah saya terima</b> hanya setelah notifikasi uang masuk muncul di aplikasi bank Anda.</>, 'warn', <ScrPay />],
    ['Verifikasi pembayaran', 'Pembayaran', [
      <>Pembayaran yang belum dicentang, dan bukti yang dikirim penghuni lewat portal (label <b>Dikirim penghuni</b>), muncul di <b>Menunggu verifikasi</b>.</>,
      <>Untuk kiriman penghuni, tekan <b>Lihat bukti</b> untuk melihat foto transfernya.</>,
      <>Cek mutasi rekening, lalu tekan <b>Uang sudah masuk</b> atau <b>Tolak</b>.</>,
      <>Di bawahnya tampil total uang yang diterima bulan ini.</>,
    ], <>Setiap ada bukti baru dari penghuni, email pemberitahuan berisi foto bukti dikirim ke email akun Anda (bisa dimatikan di Pengaturan).</>, null, <ScrVerify />],
    ['Ingatkan penghuni lewat WhatsApp', 'Penghuni › ketuk penghuni', [
      <>Buka penghuni yang menunggak.</>,
      <>Tekan <b>Kirim pengingat via WhatsApp</b>.</>,
      <>Pesan berisi rincian tagihan sudah tersusun sopan — tinggal tekan kirim.</>,
      <>Ingin kata-katanya sesuai gaya Anda? Ketuk <b>Ubah teks pesan WhatsApp</b> di bawah tombol, atau buka <b>Pengaturan › Teks pesan WhatsApp</b>.</>,
    ], 'Tombol pengingat hanya muncul bila nomor WhatsApp penghuni sudah diisi.', null, <ScrReminder />],
    ['Tagihan tambahan', 'Tagihan › + Tagihan tambahan', [
      <>Pilih <b>Penghuni</b>.</>,
      <>Isi <b>Keterangan</b> (listrik token, laundry, denda, deposit) dan <b>Jumlah</b>.</>,
      <>Isi <b>Jatuh tempo</b>, lalu tekan <b>Buat tagihan</b>.</>,
    ], null, null, <ScrExtra />],
    ['Catat pengeluaran', 'Pengeluaran › Biaya kos › + Catat', [
      <>Isi <b>Jumlah</b> (boleh 275rb atau 1,2jt) dan <b>Tanggal</b>.</>,
      <>Pilih <b>Kategori</b>: listrik dan air, internet, perbaikan, kebersihan, <b>gaji pengelola / penjaga</b>, dan lainnya.</>,
      <>Isi <b>Keterangan</b> agar mudah diingat, lalu <b>Simpan</b>.</>,
    ], <>Renovasi dan beli perabot memakai kategori jenis <b>Modal</b> — tidak mengurangi laba operasional, tetapi tetap mengurangi kas.</>, null, <ScrExpense />],
    ['Uang diambil pemilik & transaksi lain', 'Pengeluaran › Diambil pemilik & lainnya › + Catat', [
      <>Pilih <b>Jenis</b>: <b>Diambil pemilik (prive)</b>, Setoran modal, atau Pendapatan lain.</>,
      <><b>Pinjaman</b> dicatat di tab <b>Pinjaman</b>: daftarkan pinjamannya, catat <b>Dana diterima</b>, dan saat membayar isi <b>bagian bunga</b> agar laporan memisahkan pokok (mengurangi utang) dan bunga (biaya).</>,
      <>Isi <b>Jumlah</b>, <b>Tanggal</b>, dan keterangan, lalu <b>Simpan</b>.</>,
      <>Laporan memisahkannya: prive mengurangi kas tetapi <b>tidak</b> mengurangi laba.</>,
    ], <><b>Jangan tertukar:</b> gaji pengelola/penjaga adalah <b>biaya kos</b> (tab Biaya kos). Uang yang dipakai pemilik untuk keperluan pribadi adalah <b>prive</b> (tab ini).</>, 'warn', <ScrOwner />],
    ['Penghuni keluar atau pindah kamar', 'Penghuni (atau Kamar) › Akhiri sewa / Pindah kamar', [
      <>Isi <b>Tanggal keluar</b> yang sebenarnya — boleh <b>lebih awal</b> atau <b>lebih lambat</b> dari rencana — dan alasan bila perlu.</>,
      <>Tekan <b>Akhiri sewa</b>. Kamar kembali <b>Tersedia</b>. Tanggal yang belum tiba disimpan sebagai <b>Rencana selesai</b> (kamar tetap terisi, tagihan berhenti di tanggal itu); penghuni yang <b>batal masuk</b> (tanggal keluar sebelum tanggal masuk) ditutup dan tagihannya dibatalkan.</>,
      <>Tagihan sesudah tanggal keluar yang belum dibayar dibatalkan otomatis. Tunggakan lama tetap tercatat. Sudah ada pembayaran untuk periode sesudah tanggal keluar? Jumlahnya ditampilkan — kembalikan ke penghuni atau biarkan sesuai kesepakatan.</>,
      <>Rencana selesai bisa diubah kapan saja (Penghuni › ketuk nama › Rencana selesai › ubah). Dimajukan: tagihan sesudahnya yang belum dibayar ikut dibatalkan. Dimundurkan/dikosongkan: tagihan itu terbit lagi. Rencana yang sudah lewat tapi sewa masih aktif ditandai di detail penghuni.</>,
      <>Masih ada deposit? Selesaikan di <b>Penghuni › Deposit</b>: kembalikan, potong untuk kerusakan, atau lunasi tunggakan dari deposit (Langkah 51).</>,
      <><b>Pindah kamar</b> (penghuni tetap tinggal, hanya ganti kamar): tekan <b>Pindah kamar</b>, pilih kamar kosong, tanggal pindah, dan harga baru. Tanggal tagihan tetap sama: periode yang sedang berjalan tetap di kamar lama, harga baru mulai tagihan berikutnya. Ingin menagih selisih bulan ini? Isi <b>Tagihan selisih</b> (atau ketuk <b>Hitung sisa hari</b>). Deposit dan tagihan yang sudah dibayar di muka ikut pindah; kamar lama kembali <b>Tersedia</b>.</>,
    ], <>Pindah kamar dicatat saat penghuni benar-benar pindah. Kamar yang sedang dibooking tidak bisa jadi tujuan.</>, null, <ScrEndLease />],
  ]],
  ['C', 'Pengecekan', [
    ['Pantau kondisi kos di Dashboard', 'Dashboard', [
      <><b>Kas bersih</b> = uang masuk − pengeluaran bulan ini (deposit yang diterima/dikembalikan ikut dihitung).</>,
      <>Kotak <b>🔧 keluhan</b> muncul bila ada keluhan/perbaikan yang belum selesai.</>,
      <><b>Hunian</b> = kamar terisi dibanding kamar yang bisa disewakan.</>,
      <><b>Tunggakan</b> dan daftar <b>penghuni menunggak</b> untuk ditindaklanjuti.</>,
      <>Grafik <b>Tagihan vs terkumpul</b> 6 bulan, <b>Perlu perhatian</b>, <b>Jatuh tempo 7 hari</b>, <b>Status kamar</b>, <b>Aktivitas terbaru</b>, dan <b>Aksi cepat</b>. Di laptop bagian-bagian ini tersusun dalam beberapa kolom; di HP satu kolom.</>,
      <>Tekan <b>Atur dashboard</b> untuk menyembunyikan bagian yang tidak dipakai atau mengubah urutannya (centang / ↑ ↓). Pilihan disimpan di perangkat itu saja; <b>Kembalikan bawaan</b> mengembalikan susunan awal. Dashboard Toko, Jasa/Kuliner, dan bisnis kustom memakai cara yang sama.</>,
    ], 'Kas bersih bukan laba. Untuk laba yang benar, lihat Laporan.', null, <ScrDashboard />],
    ['Laporan bulanan', 'Laporan', [
      <>Pilih bulan dengan tombol <b>‹ ›</b>.</>,
      <><b>Laba operasional</b> = pendapatan − biaya operasional.</>,
      <><b>Arus kas bersih</b> = laba − belanja modal − pengeluaran non-operasional.</>,
      <>Biaya operasional per kategori (semua paket). Grafik 6 bulan (pendapatan vs biaya — ketuk batang untuk angkanya) dan <b>pendapatan per kamar</b> (sewa, tambahan listrik/air, dan sisa belum dibayar tiap kamar) <Std /></>,
    ], 'Laporan berbasis kas: pendapatan dihitung saat uang diterima, bukan saat ditagih.', null, <ScrReport />],
    ['Ekspor Excel dan PDF', 'Laporan › Ekspor', [
      <><b>Laporan 12 bulan</b>: rekap pendapatan, biaya, dan laba per bulan.</>,
      <><b>Transaksi bulan ini</b>: semua uang masuk dan keluar.</>,
      <><b>Cetak / simpan PDF</b>: pilih "Simpan sebagai PDF" di jendela cetak.</>,
    ], 'Unduh laporan setiap akhir bulan dan simpan sebagai arsip pembukuan.', null, <ScrExport />, true],
    ['Kwitansi untuk penghuni', 'Tagihan › ketuk tagihan › 🧾 Kwitansi', [
      <>Di riwayat pembayaran, tekan <b>🧾 Kwitansi</b>.</>,
      <>Kwitansi berisi nomor, nama, kamar, jumlah, dan terbilang.</>,
      <>Tekan <b>Kirim via WhatsApp</b> atau <b>Cetak / PDF</b>.</>,
    ], null, null, <ScrReceipt />, true],
  ]],
  ['D', 'Akun, langganan, dan portal penghuni', [
    ['Berlangganan', 'Langganan', [
      <>Pilih paket: <b>Dasar</b>, <b>Bisnis</b>, atau <b>Pro</b>. Harga normal tampil dicoret di atas harga yang berlaku (harga per bisnis per bulan). Lalu pilih durasi; untuk Pro tersedia <b>1 tahun</b> dengan harga tahunan yang dibayar sekali untuk 12 bulan.</>,
      <>Bayar lewat <b>QRIS</b>, <b>transfer bank</b>, atau <b>Lynk.id</b> sesuai total. Dengan <b>Lynk.id</b>, pilih tombol itu lalu tekan <b>Buat tagihan & buka Lynk.id</b>. Di halaman Lynk, isi email akun Anda (tertulis di layar) agar pembayaran otomatis cocok; paket aktif sendiri begitu pembayaran diterima, tanpa kirim bukti.</>,
      <>Tekan <b>Saya sudah bayar</b>, lalu <b>Kirim bukti via WhatsApp</b>. Setiap pembayaran mendapat <b>nomor invoice</b> (INV-…) dan <b>ID transaksi</b> (TRX-…). Tagihan punya <b>batas waktu bayar 3 hari</b>; lewat batas, tanda <b>sudah lewat</b> muncul. Salah pilih dan belum membayar? Tekan <b>Belum bayar — batalkan</b>, lalu pilih lagi.</>,
      <>Paket aktif setelah diperiksa, biasanya dalam 1×24 jam pada hari kerja (pembayaran lewat Lynk.id: otomatis bila email dan nominal cocok dengan satu tagihan Lynk yang menunggu). Invoice bisa dibuka & dicetak di <b>Riwayat tagihan</b>.</>,
      <>Begitu pembayaran diverifikasi, kartu <b>Upgrade Berhasil!</b> muncul sekali (di HP mana pun Anda masuk): paket baru, jumlah dibayar, masa aktif, kapasitas baru, dan fitur baru. Bila upgrade dimulai dari penawaran, tombol <b>Lanjut tambah karyawan</b> / <b>Lanjut tambah cabang</b> membawa Anda kembali ke formulir yang tadi tertahan, tanpa mengulang dari awal.</>,
      <><b>Naik paket</b> berlaku sejak disetujui (sisa hari paket lama dihitung ulang dan ditambahkan). <b>Turun paket</b> berlaku setelah paket sekarang berakhir.</>,
      <>Saat <b>akun karyawan</b> sudah penuh, penawaran <b>Paket Bisnis</b> muncul (hingga 5 karyawan). Ketuk <b>Upgrade</b> untuk langsung memilih paket itu, atau <b>Tetap menggunakan Paket Dasar</b>. Penawaran yang Anda tutup tidak muncul lagi selama 7 hari.</>,
      <>Pelanggan <b>Pro bulanan</b> yang sudah aktif 30 hari akan melihat penawaran <b>Pro Tahunan</b>: dibayar sekali untuk 12 bulan dengan harga yang tertulis di layar, dan hematnya ditampilkan. Penawaran ini muncul paling banyak sekali dalam 30 hari dan bisa ditutup kapan saja.</>,
      <>Pengguna <b>Gratis</b> bisa melihat penawaran <b>Paket Dasar</b>: setelah transaksi pertama tercatat, atau sebagai penawaran umum berkala (paling sering sekali dalam 30 hari). Pemilik <b>Paket Dasar</b> yang membuka <b>Laporan</b> bisa melihat penawaran <b>Paket Bisnis</b> (paling sering sekali dalam 14 hari). Penawaran aktivitas dan umum tidak muncul bersamaan dalam satu minggu, dan tidak pernah muncul di halaman kasir atau pembayaran.</>,
      <>Tidak ingin memperpanjang? Tekan <b>Berhenti memperpanjang</b> — paket tetap aktif sampai tanggal berakhir, lalu menjadi Gratis. Bisa dibatalkan lagi. Sesudahnya muncul pertanyaan <b>Boleh tahu alasannya?</b> yang boleh dijawab atau <b>Lewati</b>; jawaban tidak mengubah apa pun.</>,
      <>Kuota paket dipantau otomatis. Saat <b>akun karyawan</b>, <b>kamar terisi</b>, <b>ruang foto & lampiran</b>, <b>produk/layanan aktif</b>, <b>pelanggan</b>, <b>supplier</b>, <b>cabang</b>, atau <b>ekspor laporan bulan ini</b> mencapai <b>80%</b>, muncul peringatan di atas halaman; pada <b>100%</b> peringatannya merah. Tekan <b>Tutup peringatan</b> untuk menyembunyikannya; peringatan muncul lagi setelah 7 hari.</>,
      <>Batas awal per paket (Gratis/Dasar · Bisnis · Pro): produk/layanan aktif 100 · 1.000 · 5.000; pelanggan 500 · 5.000 · 20.000; supplier 100 · 1.000 · 5.000; cabang 1 · 3 · 10 (lokasi utama ikut dihitung, gudang tidak); ekspor laporan Dasar 10 · Bisnis 100 · Pro 500 per bulan. Saat penuh, data lama <b>tetap ada dan bisa diubah</b>; yang ditahan hanya penambahan baru. Nonaktifkan barang/layanan atau arsipkan kontak yang tidak dipakai untuk memberi ruang, atau naik paket.</>,
      <>Masa coba (14 hari) punya pengingat di <b>hari ke-10</b>, <b>hari ke-12</b>, dan <b>hari terakhir</b>, lalu saat berakhir. Pengingat tiap tahap hanya sekali, dan paling banyak dua dalam tiga hari.</>,
    ], <>Bisnis baru mendapat masa coba {BUSINESS.trialDays} hari dengan fitur Paket Dasar (dihitung sejak bisnis diaktifkan). Setelah itu menjadi Gratis dengan batasannya (mis. kamar terisi untuk kos). Bila paket habis, mungkin ada <b>masa tenggang</b> beberapa hari sebelum fitur terkunci. <b>Data tidak pernah dihapus.</b></>, null, <><ScrPlan /><ScrPenawaran /><ScrUpgradeSukses /><ScrAlasanBerhenti /></>],
    ['Pengaturan, beberapa kos, dan layar utama', 'Pengaturan', [
      <>Ubah <b>nama dan alamat kos</b> — tercetak di kwitansi.</>,
      <><b>Info untuk penghuni</b>: nomor WhatsApp, cara bayar, dan peraturan kos (tampil di portal), serta pilihan email <b>notifikasi bukti transfer</b> dan <b>daftar tagih setiap pagi</b>.</>,
      <><b>Teks pesan WhatsApp</b>: ubah kata-kata pesan pengingat tagihan dan pesan link portal. Ketuk kata berwarna seperti <b>{'{nama}'}</b> atau <b>{'{total}'}</b> untuk menyisipkan data penghuni otomatis; lihat <b>Contoh pesan</b> sebelum menyimpan. <b>Pakai teks bawaan</b> mengembalikan teks awal.</>,
      <><b>QRIS kos</b>: unggah screenshot QRIS dari aplikasi bank/merchant agar penghuni bisa scan dari portal. Uji dengan satu pembayaran kecil setelah mengganti.</>,
      <>Tambah kategori pengeluaran sesuai kebutuhan.</>,
      <>Toko yang sudah PKP: bagian <b>Pajak (PPN)</b> — centang <b>Toko saya memungut PPN</b>, isi <b>tarif</b> sesuai ketentuan yang berlaku untuk usaha Anda (tidak diisi otomatis; tanyakan konsultan pajak bila ragu) dan NPWP bila perlu, lalu <b>Simpan pajak</b>. Barang yang tidak dikenai PPN ditandai <b>Bebas PPN</b> di Barang & stok. Berlaku untuk penjualan berikutnya.</>,
      <>Punya kos lain? <b>+ Tambah kos lain</b>, lalu pindah dengan mengetuk nama bisnis di kiri atas.</>,
      <>Pasang di layar utama HP: Safari › <b>Bagikan</b> › <b>Tambah ke Layar Utama</b>; Chrome › <b>⋮</b> › <b>Tambahkan ke layar utama</b>. Ikon <b>P</b> bertuliskan PRASARA muncul di layar HP dan langsung membuka bisnis Anda. Sudah memasang ikon lama? Hapus ikonnya, lalu pasang ulang dari alamat baru <b>prasara-id.vercel.app</b>.</>,
    ], null, null, null],
    ['Portal penghuni & asisten 24 jam', 'Penghuni › ketuk penghuni › Portal penghuni', [
      <>Isi dulu <b>Info untuk penghuni</b> di Pengaturan: nomor WhatsApp pengelola, <b>cara bayar</b>, <b>peraturan kos</b>, dan unggah <b>QRIS kos</b> agar penghuni bisa langsung scan.</>,
      <>Buka penghuni. Bila tertulis <b>Portal penghuni belum aktif</b>, tekan <b>Aktifkan portal penghuni</b> (sekali saja untuk semua penghuni). Kos yang didaftarkan lewat pendaftaran baru: portal disarankan di Pusat Konfirmasi, dan <b>rekening/cara bayar</b> serta <b>peraturan</b> yang diisi di sana langsung tampil di portal.</>,
      <>Tekan <b>Kirim link via WhatsApp</b>. Penghuni menerima link pribadi tanpa perlu daftar. Kata-kata pesannya bisa diubah di <b>Pengaturan › Teks pesan WhatsApp</b>; link selalu ikut terkirim.</>,
      <>Penghuni bisa melihat tagihan, <b>mengirim bukti transfer</b>, <b>melapor kerusakan</b> (tab Lapor kerusakan), dan <b>bertanya ke asisten</b> soal tagihan, cara bayar, dan peraturan.</>,
      <>Bukti yang dikirim muncul di <b>Pembayaran › Menunggu verifikasi</b> dengan tombol <b>Lihat bukti</b>.</>,
    ], <>Asisten hanya menjawab urusan kos dan hanya memakai data penghuni itu sendiri. Jika link tersebar ke orang lain, tekan <b>Ganti link</b>.</>, 'warn', <ScrPortal />, 'pro'],
    ['Pengingat jatuh tempo otomatis', 'Pengaturan › Info untuk penghuni', [
      <>Setiap pagi sekitar pukul 07.00, <b>daftar tagih</b> dikirim ke email Anda: siapa yang telat dan yang jatuh tempo 3 hari ke depan.</>,
      <>Di daftar itu setiap penghuni punya tombol <b>Kirim WA</b> — satu ketukan membuka WhatsApp Anda dengan pesan pengingat yang sudah tersusun (memakai teks dari <b>Pengaturan › Teks pesan WhatsApp</b> bila sudah Anda ubah).</>,
      <>Penghuni yang punya <b>email</b> mendapat pengingat otomatis 3 hari sebelum, pada hari jatuh tempo, dan 3 hari setelah telat.</>,
      <>Email penghuni diisi di data penghuni, atau oleh penghuni sendiri lewat <b>Portal › Pengingat email</b>.</>,
    ], <>Tekan <b>Kirim daftar tagih sekarang (uji)</b> di Pengaturan untuk mencoba. Pengingat hanya dikirim untuk tagihan yang belum lunas.</>, null, null, true],
    ['Pusat bantuan & email arahan', 'Tombol ? di pojok kanan atas', [
      <>Tekan tombol <b>?</b> di pojok kanan atas untuk membuka <b>Pusat bantuan</b>.</>,
      <>Ketik pertanyaan, misalnya <i>penghuni lama</i>, <i>kwitansi</i>, atau <i>prive</i>. Ketuk jawabannya, lalu <b>Buka menunya</b>.</>,
      <>Belum terjawab? Tekan <b>Laporkan masalah</b> di bagian <b>Tiket bantuan</b>: pilih jenis masalah, tulis judul dan ceritanya, lalu <b>Kirim</b>. Balasan tim muncul di sana dan dikirim ke email Anda. Bisa juga <b>Tanya via WhatsApp</b>.</>,
      <>Bila tim perlu memeriksa, pemilik bisa menekan <b>Izinkan selama 24 jam</b>. Tim hanya melihat ringkasan angka (tanpa nama/nomor penghuni atau pelanggan), tidak bisa mengubah data, dan setiap pembukaan tercatat di sana. <b>Cabut izin sekarang</b> kapan saja.</>,
      <>Selama masa coba, PRASARA mengirim <b>email arahan</b> hanya untuk langkah yang belum Anda kerjakan, paling banyak satu email tiap 2 hari.</>,
    ], <>Email arahan & info bisa dimatikan lewat tautan di bawah email, atau di <b>Pengaturan › Akun</b>. Pengingat tagihan dan pengumuman layanan penting tidak ikut berhenti. Pengumuman dari tim PRASARA juga tampil sebagai banner di atas aplikasi; tekan ✕ untuk menutupnya. Ingin menghapus akun? Buka <b>Akun › Ajukan hapus akun</b>; admin memproses permintaan itu, dan data yang wajib disimpan menurut ketentuan tetap disimpan.</>, null, null],
    ['Notifikasi & ringkasan lewat email', 'Lonceng di kanan atas', [
      <>Angka merah di <b>lonceng</b> = hal yang perlu ditindaklanjuti hari ini: pembayaran menunggu diperiksa, tagihan telat, dan jatuh tempo hari ini.</>,
      <>Ketuk lonceng. Bagian <b>Perlu perhatian</b> juga menampilkan sewa yang akan berakhir, kamar tanpa harga, dan penghuni tanpa nomor WhatsApp. Ketuk untuk membuka menunya.</>,
      <>Di <b>Pengaturan email</b>, pilih yang ingin diterima: daftar tagih setiap pagi, <b>ringkasan mingguan</b> (Senin), dan <b>ringkasan bulanan</b> (tanggal 1).</>,
      <>Tekan <b>Kirim contoh ringkasan</b> untuk melihat isinya di email Anda.</>,
    ], <>Ringkasan bulanan menyala otomatis, ringkasan mingguan mati sampai Anda menyalakannya. Semua angka berasal dari data yang Anda catat — sama dengan menu Laporan.</>, null, null],
    ['Banyak bisnis & Ringkasan pemilik', 'Menu ☰ › Ringkasan pemilik', [
      <>Tekan <b>+ Tambah bisnis</b> (atau ketuk nama bisnis di kiri atas › Tambah bisnis), pilih jenisnya, isi nama, tinjau modul, lalu <b>Setujui & buat bisnis</b>.</>,
      <>Jika punya lebih dari satu bisnis, aplikasi dibuka di <b>Ringkasan pemilik</b>: hal yang <b>perlu perhatian</b> dari semua bisnis, lalu angka tiap bisnis (pendapatan, biaya, laba, tunggakan/kasbon, utang, kas).</>,
      <>Ketuk angka mana pun untuk membuka <b>sumbernya</b> di bisnis itu (mis. Laporan atau Kas) dan melihat transaksinya. Ganti bulan dengan tombol ‹ ›.</>,
      <>Tanda <b>Lengkap</b> / <b>Perkiraan</b> menunjukkan apakah angkanya sudah final. <b>Gabungan bisnis</b> (opsional) hanya dibuat bila Anda memilihnya: ketuk <b>Pilih bisnis yang digabung</b>, centang minimal dua bisnis, lalu <b>Simpan gabungan</b>. Gabungan menampilkan selisih dibanding bulan sebelumnya dan dipisah per badan usaha; tekan <b>Unduh Excel</b> untuk menyimpannya (berisi angka tiap bisnis, jumlah, per badan usaha, dan catatan; dihitung ke kuota ekspor bisnis Pro di gabungan). Kosongkan lagi dengan <b>Hapus gabungan</b>.</>,
      <>Gabungan bisnis = <b>Paket Pro</b>: minimal satu bisnis yang digabung harus berpaket Pro (bisnis lain boleh paket apa saja). Bisnis Pro diberi tanda <b>Pro</b> di daftar pilihan. Bila paket turun, jumlah gabungan disembunyikan (pilihan tetap tersimpan) sampai ada bisnis Pro lagi; angka tiap bisnis tetap tampil untuk semua paket.</>,
    ], <>Pembukuan setiap bisnis terpisah: transaksi toko tidak masuk ke laporan kos. Jumlah gabungan hanya indikasi (bukan laporan konsolidasi resmi), apalagi bila basis pencatatannya berbeda — kos dicatat saat uang diterima, toko saat penjualan terjadi.</>, null, null],
  ]],
  ['E', 'Retail & Grosir (toko)', [
    ['Barang, satuan, dan stok', 'Menu Barang & stok', [
      <>Buka bisnis toko Anda (ketuk nama bisnis di kiri atas), lalu menu <b>Barang & stok</b>. Tekan <b>+ Tambah barang</b>.</>,
      <>Isi nama, lalu pilih <b>Satuan utama</b> (pcs, kg, gram, liter, ml, bungkus, botol… atau ketik sendiri) — satuan terkecil yang Anda hitung. Stok, harga modal, dan laporan selalu dihitung dalam satuan ini. Isi <b>harga modal</b> per satuan utama, stok sekarang, serta harga eceran/grosirnya.</>,
      <>Di <b>Satuan jual lain</b>, ketuk satuan siap pakai (mis. <b>+ Kemasan 250 gram</b>, <b>+ ½ kg</b>, <b>+ Lusin</b>, <b>+ Dus</b>) atau <b>+ Satuan lain</b>. Cukup isi <b>Nama</b>, <b>Isi</b>, dan <b>Satuan isi</b> — mis. Kemasan 250 gram · isi 250 · gram, atau Dus · isi 24 · botol, atau Karton · isi 2 · Dus. Tidak perlu menghitung sendiri.</>,
      <>Baca baris <b>Hasil</b> di bawahnya, mis. "1 Kemasan 250 gram = 0,25 kg · modal Rp 3.000 · untung Rp 700". Sistem menghitung 1 kg = 1.000 gram, 1 ons = 100 gram, 1 kuintal = 100 kg, 1 ton = 1.000 kg, 1 liter = 1.000 ml. Nama yang salah isi (mis. "gram" diisi 250 kg) langsung ditandai merah dan tidak bisa disimpan.</>,
      <>Berat dan volume <b>tidak pernah</b> dikonversi otomatis. Menjual minyak ber-satuan utama kg per liter? Pilih satuan isi <b>liter</b>, lalu isi <b>Berat 1 liter barang ini</b> (mis. 0,9 kg hasil timbang sendiri).</>,
      <>Untuk menghitung ulang atau mencatat barang rusak, tekan <b>Stok</b> di samping barang, pilih alasannya, isi jumlah, lalu <b>Simpan</b>.</>,
      <>Opsional: isi <b>Kode barang</b> dan <b>Barcode</b> tiap satuan (angka di bawah garis-garis kemasan). Di Kasir, scan barcode atau ketik kodenya lalu Enter — barang langsung masuk keranjang.</>,
      <>Saat mengisi barcode di <b>Barang &amp; stok</b>, pilih <b>Pindai</b> pada satuan yang sesuai. Mode <b>Barcode garis</b> melewati QR di kemasan. Ratakan kemasan dan arahkan barcode ke kotak panduan. Jika kamera masih sulit membaca, tekan <b>Pindai dari foto</b>, pilih foto dekat yang tajam, lalu simpan barang.</>,
    ], <>Scanner barcode Bluetooth/USB bekerja di iPhone maupun Android. Tombol kamera 📷 Pindai bisa dipakai di iPhone dan Android (izinkan akses kamera). Stok tidak bisa diketik langsung — setiap perubahan tercatat di <b>Riwayat stok</b> agar selisihnya bisa ditelusuri. Satuan utama tidak bisa diganti setelah barang punya stok/riwayat (angka lama tercatat dalam satuan itu) — tambahkan satuan lain sebagai satuan jual. Semua menu (Kasir, Belanja, Retur, Mutasi, Pesanan grosir, Stok) memakai isi satuan yang sama, sehingga stok, HPP, dan laba selalu cocok. Kode barang hanya penanda sendiri, bukan tempat satuan.</>, null, <ScrSatuan />],
    ['Jualan di kasir', 'Menu Kasir', [
      <>Buka <b>Kasir</b>. Pilih <b>Eceran</b> atau <b>Grosir</b> di kanan atas — harga mengikuti pilihan ini.</>,
      <>Pilih kategori di baris atas (<b>Semua</b>, Sembako, Minuman, …) atau ketik nama/kode di kotak cari. Setiap barang tampil sebagai kartu bergambar: ketuk <b>+</b> untuk memasukkan ke keranjang, ketuk lagi untuk menambah jumlah. Barang dengan beberapa satuan (mis. pcs & dus) bertanda <b>2 satuan ›</b> — ketuk untuk memilih satuannya.</>,
      <>Keranjang tampil di sisi kanan (laptop) atau di bawah daftar barang (HP & tablet). Ubah jumlah dengan <b>−</b>/<b>+</b>; tombol <b>⋯</b> untuk mengubah harga atau menghapus baris. Ketuk <b>%</b> untuk diskon. Bilah aksi: <b>Pelanggan</b> (harga khusus & kasbon), <b>Diskon</b>, <b>Catatan</b>, <b>Tahan</b> (simpan keranjang dulu, layani pembeli lain, lanjutkan lewat <b>Ditahan</b>), <b>Riwayat</b>. Di laptop ada pintasan F2 pelanggan, F3 diskon, F4 catatan, F5 tahan, F6 riwayat, F10 bayar.</>,
      <>Tekan <b>Bayar</b> (di HP juga ada di bilah hijau bawah). Pilih <b>Tunai</b> (isi uang diterima → kembalian), <b>Transfer / QRIS</b>, atau <b>Kasbon</b> (pilih/isi nama pelanggan).</>,
      <>Pembeli bayar dengan beberapa cara? Pilih <b>Campuran</b> lalu isi bagian <b>Tunai</b>, <b>Transfer / QRIS</b>, dan/atau <b>Kasbon</b> (tombol <b>Sisa</b> mengisi kekurangannya). Baris <b>Terbagi</b> harus sama dengan total. Bila ada bagian kasbon, pilih pelanggannya. Kas, bank, kasbon, shift, dan laporan otomatis dibagi sesuai rincian.</>,
      <>Toko PKP: setelah <b>Pajak (PPN)</b> diaktifkan di Pengaturan, layar bayar menampilkan <b>Termasuk PPN</b> dan struk mencetak bagian PPN-nya. Harga jual tetap harga yang Anda isi (sudah termasuk PPN).</>,
      <>Di <b>Scan Barcode</b>, PRASARA beralih ke <b>pemindai cadangan</b> bila pemindai browser tidak tersedia, gagal membaca, atau beberapa detik tidak menemukan kode. Jika izin kamera ditolak di Safari iPhone, buka menu halaman › <b>Pengaturan Situs Web › Kamera</b>, izinkan akses, lalu tekan <b>Coba kamera lagi</b>. Ketik atau masukkan kode dengan scanner Bluetooth/USB lewat kolom <b>Ketik kode barcode</b> lalu tekan <b>Gunakan kode</b>.</>,
      <>Kalau kode terbaca tetapi belum terdaftar, pemindai tetap terbuka. Periksa atau ketik ulang kode, atau daftarkan barcode untuk satuan yang sesuai di <b>Barang &amp; stok › Ubah barang</b>.</>,
      <>Tanpa barcode, buka <b>Pindai foto produk</b> di <b>Kasir</b> atau <b>Barang &amp; stok</b>. Foto bagian depan kemasan dengan tulisan yang tajam. Pilih barang yang cocok, lalu pilih satuan bila ada beberapa pilihan. Bunyi bip terdengar setelah hasil pindai berhasil diterapkan.</>,
      <>Untuk desain kemasan baru atau lama yang tulisannya berbeda, simpan teks pembeda di <b>Barang &amp; stok › Ubah barang › Nama lain di kemasan</b>. Tulis satu nama per baris. Bila foto tidak cukup jelas atau varian mirip, cocokkan pilihan dengan kemasan sebelum menambah ke keranjang.</>,
      <>Tekan <b>Simpan</b>. Stok berkurang otomatis. Tekan <b>Lihat / kirim struk</b> untuk mencetak atau mengirim struk lewat WhatsApp.</>,
    ], <>Transaksi yang salah dibatalkan dari menu <b>Penjualan</b> (ketuk transaksinya › Batalkan, isi alasan). Barang yang dikembalikan pelanggan: ketuk transaksinya › <b>Retur barang</b>, isi jumlahnya, pilih <b>uang tunai</b>, <b>transfer balik</b>, atau <b>potong kasbon</b>. Stok bertambah lagi dan penjualan berkurang di laporan.</>, null, null],
    ['Belanja ke supplier', 'Menu Belanja', [
      <>Buka <b>Belanja</b>, tekan <b>+ Belanja</b>. Isi tanggal dan pilih supplier (atau ketik nama supplier baru).</>,
      <>Ketik nama barang di kolom <b>+ Cari barang</b>, ketuk barangnya. Pilih satuan yang dibeli (mis. dus), isi jumlah dan <b>harga beli per satuan</b> itu.</>,
      <>Di bawah setiap barang terlihat stok yang bertambah dan <b>harga modal baru</b> (rata-rata dengan stok lama).</>,
      <>Pilih <b>Tunai</b>, <b>Transfer</b>, atau <b>Utang ke supplier</b> (wajib ada supplier), lalu <b>Simpan belanja</b>.</>,
      <>Barang dari supplier rusak atau salah kirim? Ketuk belanjanya › <b>Retur ke supplier</b>. Isi jumlah yang dikembalikan, pilih <b>Potong utang ke supplier</b> (untuk belanja utang) atau <b>Uang kembali tunai/transfer</b>, tulis alasan, lalu <b>Simpan retur</b>.</>,
    ], <>Harga beli terakhir terisi otomatis. Belanja yang salah dibatalkan dari daftar Belanja: stok dikurangi lagi dan harga modal dikembalikan. Retur ke supplier mengurangi stok dan menghitung ulang harga modal; utang atau kas ikut berubah dan jurnal pembukuan dibuat otomatis. Retur tidak bisa dibatalkan, dan belanja yang sudah diretur tidak bisa dibatalkan lagi.</>, null, null],
    ['Pesan dulu, terima kemudian', 'Menu Belanja › Pesan dulu', [
      <>Saat memesan ke supplier tetapi barang belum datang: <b>+ Belanja</b> › pilih <b>Pesan dulu (belum datang)</b>, isi barang dan harga, lalu <b>Simpan pesanan</b>. Stok belum bertambah.</>,
      <>Pesanan tampil berlabel <b>Dipesan</b>. Kotak <b>Pesanan belum datang</b> menunjukkan jumlahnya.</>,
      <>Saat barang datang, ketuk pesanannya › <b>Terima barang</b>. Isi jumlah yang benar-benar datang (boleh sebagian) dan harga bila berubah, lalu <b>Simpan penerimaan</b>.</>,
      <>Sisa yang tidak akan dikirim: <b>Tutup pesanan</b>. Pesanan yang tidak jadi sama sekali: <b>Batalkan pesanan</b>.</>,
    ], <>Stok, harga modal, kas, dan utang ke supplier hanya dihitung dari barang yang sudah diterima.</>, null, null],
    ['Kas, biaya, dan kasbon', 'Menu Kas & kasbon', [
      <>Pertama kali: tekan <b>+ Uang masuk/keluar lain</b> › <b>Setor modal</b>, isi jumlah uang di laci sekarang (dan di bank, pilih Bank).</>,
      <>Biaya toko (listrik, gaji, bensin): <b>+ Biaya</b>, pilih jenis, jumlah, dan dibayar dari kas atau bank. Uang diambil untuk pribadi: pilih <b>Prive</b>.</>,
      <>Tab <b>Kasbon pelanggan</b>: daftar yang masih berutang beserta sisanya. Tekan <b>Terima bayar</b> (boleh dicicil) atau <b>Ingatkan WA</b>.</>,
      <>Tab <b>Utang supplier</b>: tekan <b>Bayar</b> saat melunasi belanja utang.</>,
      <>Tab <b>Pinjaman</b>: <b>+ Pinjaman baru</b> (pemberi, pokok, bunga %/tahun, tenor, cicilan, jatuh tempo — tombol bantu hitung cicilan anuitas tersedia), lalu <b>Dana diterima</b> saat uang masuk. Setiap bayar: <b>Bayar cicilan</b>, isi jumlah total dan <b>bagian bunga</b> sesuai rekening koran. Pokok mengurangi sisa utang; hanya bunga yang menjadi beban dan mengurangi laba. Catatan pinjaman lama bisa <b>ditautkan</b> ke daftar.</>,
    ], <>Saldo kas & bank dihitung otomatis dari penjualan, belanja, biaya, dan pelunasan. Hitung uang di laci sesekali; kalau beda, ada transaksi yang belum dicatat.</>, null, null],
    ['Laporan toko', 'Menu Laporan', [
      <>Buka <b>Laporan</b>, pilih bulan dengan tombol <b>‹ ›</b>.</>,
      <><b>Laba rugi</b>: penjualan − modal barang terjual = laba kotor, lalu dikurangi biaya operasional dan selisih stok = <b>laba bersih</b>. Prive dan belanja barang tidak mengurangi laba.</>,
      <><b>Produk</b>: pilih <b>Terlaris</b> atau <b>Paling untung</b>. Bagian <b>Tidak laku</b> menunjukkan barang berstok yang tidak terjual bulan itu.</>,
      <>Paket Dasar ke atas: <b>Unduh Excel</b> dan <b>Cetak / PDF</b>.</>,
      <><b>Dashboard toko</b> (Beranda) meringkas angka yang sama setiap hari: penjualan & laba kotor hari ini, penjualan bulan ini dibanding bulan lalu penuh, grafik penjualan harian, barang terlaris, transaksi terakhir, <b>Perlu perhatian</b> (stok di bawah minimum, barang tanpa harga modal, belanja menunggu diterima), dan <b>Aksi cepat</b>. Grafik & barang terlaris hanya tampil untuk pemilik/pengelola keuangan. <b>Atur dashboard</b> menyembunyikan atau mengurutkan bagian (disimpan di perangkat itu).</>,
      <>Bila PPN aktif: bagian <b>PPN keluaran</b> menunjukkan penjualan kena PPN (DPP), PPN dari penjualan, PPN retur, dan <b>PPN keluaran bersih</b> bulan itu. Penjualan & laba di laporan sudah <b>tanpa PPN</b> (PPN bukan pendapatan toko).</>,
    ], <>Kalau muncul peringatan harga modal kosong, isi modalnya di Barang & stok — tanpa modal, laba barang itu terlihat terlalu tinggi.</>, null, null],
  ]],
  ['F', 'Karyawan, kontak & shift', [
    ['Mengundang & mengatur karyawan', 'Menu Karyawan (khusus pemilik)', [
      <>Buka <b>Karyawan</b>, isi <b>email karyawan</b>, pilih <b>peran</b>, lalu <b>Undang</b>. Toko: Pengelola, Kasir, Staf gudang. Kos: Pengelola, Penjaga.</>,
      <>Tekan <b>Kirim cara masuk via WA</b>. Karyawan membuka PRASARA › <b>Masuk</b> › <b>Daftar</b> dengan email itu, lalu konfirmasi email. Saat masuk, ia langsung berada di bisnis Anda — tidak perlu membuat bisnis.</>,
      <>Karyawan hanya melihat menu perannya. Kasir tidak melihat harga modal, laba, kas, dan laporan; penjualan yang ia lihat hanya miliknya sendiri. Setiap penjualan mencatat nama kasirnya.</>,
      <>Ganti peran lewat pilihan di daftar. <b>Nonaktifkan</b> untuk menutup akses sementara; <b>Hapus</b> untuk membuang emailnya dari daftar. Tombol <b>Bersihkan</b> menghapus semua email nonaktif dan undangan kedaluwarsa sekaligus.</>,
      <>Tekan <b>Atur akses</b> pada karyawan. <b>Modul yang boleh dibuka</b> (Paket Bisnis & Pro): pilih <b>Sesuai peran</b> atau <b>Pilih sendiri</b> lalu centang modulnya — mis. kasir yang juga boleh mengurus stok tetapi tidak melihat laporan keuangan. Karyawan & Langganan selalu khusus pemilik.</>,
      <><b>Izin per tindakan</b> (Paket Pro): untuk tiap tindakan berisiko pilih <b>Ikut aturan bisnis</b>, <b>Boleh langsung</b>, <b>Perlu persetujuan</b>, atau <b>Tidak boleh</b>. Centang <b>Boleh menyetujui permintaan karyawan lain (tingkat 1)</b> untuk menjadikannya penyetuju. Tekan <b>Simpan</b>; berlaku saat karyawan membuka aplikasi lagi.</>,
    ], <>Undangan berlaku 14 hari. Batas karyawan: Gratis 1, Dasar 1, Bisnis 5, Pro 15. Saat batas penuh, tombol Undang membuka pilihan upgrade paket. Menghapus karyawan tidak menghapus riwayat transaksinya. Karyawan keluar dari akun lewat Pusat bantuan › Keluar dari akun. Semua hak akses diperiksa di database. Bila paket turun, pengaturan akses tidak dihapus — karyawan kembali memakai hak perannya sampai paket naik lagi.</>, null, <ScrAksesKaryawan />],
    ['Pelanggan & supplier', 'Menu Pelanggan & supplier (toko)', [
      <>Pilih tab <b>Pelanggan</b> atau <b>Supplier</b>. Angka merah = sisa kasbon pelanggan atau utang Anda ke supplier.</>,
      <>Ketuk nama untuk melihat <b>riwayat</b> penjualan, belanja, dan pelunasannya. Ketuk nomor penjualan untuk membuka struknya.</>,
      <>Ubah nama atau nomor WhatsApp, lalu <b>Simpan</b>. Tombol <b>+ Tambah</b> untuk kontak baru.</>,
      <>Tidak dipakai lagi? Ketuk kontaknya › <b>Hapus</b>. Kontak yang belum pernah bertransaksi dihapus permanen; yang sudah punya riwayat <b>diarsipkan</b> agar laporan tetap benar — bisa dipulihkan lewat <b>Lihat arsip</b>. Sisa kasbon/utang harus lunas dulu.</>,
    ], <>Pelunasan tetap dicatat di <b>Kas & kasbon</b>. Struk toko memakai nama, alamat, No. WA, dan tulisan bawah struk dari <b>Pengaturan › Profil toko</b>.</>, null, null],
    ['Shift kasir', 'Menu Shift kasir (toko)', [
      <>Sebelum jualan, hitung uang di laci. Buka <b>Shift kasir</b>, isi <b>Uang awal di laci</b>, lalu <b>Buka shift</b>.</>,
      <>Selama shift, aplikasi menjumlahkan penjualan tunai Anda: <b>Seharusnya di laci</b> = uang awal + penjualan tunai − retur tunai.</>,
      <>Selesai jaga: hitung uang di laci, isi jumlahnya, lalu <b>Tutup shift</b>. Hasilnya <b>Pas</b>, <b>Lebih</b>, atau <b>Kurang</b>.</>,
      <>Pemilik melihat riwayat shift semua kasir beserta selisihnya.</>,
    ], <>Shift tidak wajib. Selisih hanya dicatat, tidak mengubah saldo Kas. Uang laci yang dipakai untuk biaya tetap dicatat di Kas & kasbon.</>, null, null],
    ['Pengingat toko', 'Lonceng di kanan atas (toko)', [
      <>Angka merah di <b>lonceng</b> = hal yang perlu ditindaklanjuti: stok minus, habis atau menipis, pesanan yang lewat perkiraan datang, serta kasbon pelanggan dan utang supplier yang jatuh tempo dalam 3 hari.</>,
      <>Di <b>Stok minus per lokasi</b>, ketuk baris barang untuk membuka <b>Kartu stok</b> lokasi tersebut. Misalnya, outlet A minus 3 pcs dan outlet B punya 10 pcs. Outlet A tetap diperingatkan meski totalnya 7 pcs. Peringatan juga muncul di <b>Dashboard toko › Perlu perhatian</b> dan <b>Barang &amp; stok</b>.</>,
      <>Ketuk lonceng. Tekan <b>Ingatkan WA</b> untuk kasbon, atau <b>Pesan / belanja barang</b> untuk stok.</>,
      <>Pemilik bisa menyalakan <b>email pengingat setiap pagi</b> pukul 07.00 di halaman itu (paket Dasar ke atas).</>,
    ], <>Stok menipis memakai <b>peringatan stok minimum</b> yang diisi di setiap barang. Email hanya dikirim bila ada yang perlu ditindaklanjuti.</>, null, null],
    ['Barang tanpa barcode & label', 'Barang & stok › ☆ dan Cetak label', [
      <>Tekan <b>☆</b> di samping barang yang sering dijual. Barang itu tampil <b>paling depan</b> di Kasir dengan tanda ★ — satu ketukan <b>+</b> = +1.</>,
      <>Untuk label barcode sendiri: buka <b>Barang & stok › Cetak label</b>. Barang yang belum punya kode: tekan <b>Buat kode otomatis</b>.</>,
      <>Tekan <b>+</b> pada barang untuk jumlah label, lalu <b>Cetak</b> (printer biasa atau simpan PDF). Tempel di rak atau kemasan ulang.</>,
      <>Di Kasir, scan label itu dengan <b>📷 Pindai</b> atau scanner Bluetooth — barang langsung masuk keranjang.</>,
    ], <>Pertama kali memakai kamera, izinkan akses kamera untuk situs PRASARA. Coba scan satu label dulu sebelum mencetak banyak.</>, null, null],
    ['Pusat konfigurasi', 'Menu ☰ › Konfigurasi (pemilik & pengelola)', [
      <>Tab <b>Modul</b>: cari modul atau saring per jenis (Inti bisnis, Khusus industri, Operasional, Analisis, Otomatisasi, Portal, Administrasi). Statusnya: <b>Aktif</b>, <b>Tersedia</b>, <b>Disarankan</b> (dari jawaban profil usaha Anda — alasannya tertulis), <b>Perlu paket lebih tinggi</b>, atau <b>Dalam rencana</b> (belum bisa dipakai). Ketuk modul untuk melihat fungsi, menu, data, modul yang dibutuhkan, paket, dan tombol menuju pengaturannya.</>,
      <>Tekan <b>Aktifkan</b> atau <b>Nonaktifkan</b> (wajib alasan). Sebelum menonaktifkan, kotak <b>Dampak bila dinonaktifkan</b> menunjukkan menu yang disembunyikan, data yang tetap tersimpan, dan modul lain yang bergantung (harus dinonaktifkan dulu). Modul nonaktif: menunya hilang dan pemakaiannya ditolak server, tetapi <b>data lama tidak dihapus</b>.</>,
      <>Pengelola hanya bisa <b>meminta</b>; pemilik menyetujui di tab <b>Persetujuan</b>.</>,
      <>Tab <b>Profil</b>: kelompok bisnis, karakteristik usaha, dan <b>badan usaha</b> (perorangan, CV, PT…). Tab <b>Cabang & gudang</b>: daftar lokasi (khusus pemilik). Jumlah cabang mengikuti paket (Gratis/Dasar 1, Bisnis 3, Pro 10; lokasi utama ikut dihitung, gudang tidak). Bila penuh, muncul penawaran naik paket; setelah upgrade, formulir cabang baru langsung terbuka.</>,
      <>Tab <b>Riwayat</b>: semua perubahan — siapa, kapan, alasan, dan tingkat risikonya.</>,
    ], <>Modul inti (mis. Kasir, Barang, Tagihan) selalu aktif. Modul yang masih punya transaksi terbuka (shift belum ditutup, pesanan belum diterima) tidak bisa dinonaktifkan sebelum diselesaikan. Cabang & gudang saat ini dicatat sebagai struktur; stok per cabang segera hadir.</>, null, null],
    ['Persetujuan', 'Menu ☰ › Persetujuan', [
      <>Tindakan berisiko oleh karyawan — mis. <b>membatalkan penjualan</b>, <b>membatalkan belanja</b>, <b>membatalkan pelunasan</b>, <b>menghapus kontak</b>, <b>mengubah modul</b> — tidak langsung jalan. Karyawan menekan tombolnya, menulis alasan, lalu permintaan masuk ke sini.</>,
      <>Kasir bisa <b>meminta pembatalan</b> atau <b>meminta retur</b> untuk penjualannya sendiri dari menu Penjualan.</>,
      <>Pemilik membuka permintaan: terlihat <b>nomor</b>, siapa yang meminta, alasan, <b>data terdampak</b>, dan <b>estimasi nilai</b>. Tekan <b>Setujui & jalankan</b> atau <b>Tolak</b>.</>,
      <>Setelah disetujui, sistem langsung menjalankan tindakannya dan mencatat hasilnya (berhasil atau gagal beserta sebabnya) di <b>Riwayat</b>.</>,
      <>Tab <b>Aturan</b> (pemilik): pilih tindakan mana yang wajib disetujui. Mengubah aturan sendiri tersedia mulai <b>Paket Bisnis</b>; di paket lain aturan bawaan tetap berlaku dan tampil apa adanya, dengan tombol <b>Lihat Paket Bisnis</b>. Bisnis yang dibuat sebelum 14 Nov 2026 tetap bisa mengubahnya.</>,
      <><b>Persetujuan bertingkat</b> (Paket Pro): di tab Aturan, pilih <b>2 tingkat (penyetuju lalu pemilik)</b> untuk sebuah tindakan dan, bila perlu, isi <b>Tingkat 2 mulai nominal</b> (mis. 500.000; kosong = selalu). Penyetuju tingkat 1 ditunjuk di menu Karyawan › Atur akses.</>,
      <>Penyetuju membuka permintaan karyawan lain di modulnya dan menekan <b>Setujui tingkat 1</b> (diteruskan ke pemilik) atau <b>Setujui & jalankan</b> bila cukup 1 tingkat. Setiap keputusan tercatat di <b>Riwayat keputusan</b>.</>,
    ], <>Pemilik selalu bisa langsung menjalankan tindakan tanpa persetujuan, di tingkat mana pun. Aturan bawaan: pembatalan penjualan/belanja/pelunasan, hapus kontak, dan ubah modul wajib disetujui; retur dan penyesuaian stok tidak. Peminta tidak bisa menyetujui permintaannya sendiri, dan perubahan modul selalu diputuskan pemilik.</>, null, <ScrPersetujuanTingkat />],
    ['Otomatisasi', 'Menu ☰ › Otomatisasi (pemilik)', [
      <>Pilih resep, baca <b>pemicu → syarat → tindakan</b>-nya, lalu tekan <b>Nyalakan</b>. Semua resep berjalan setiap pagi pukul 07.00.</>,
      <>Toko: <b>stok menipis → draf pesanan</b> ke supplier terakhir (menunggu persetujuan Anda), <b>kasbon jatuh tempo</b>, <b>utang supplier jatuh tempo</b>, <b>shift lupa ditutup</b>. Kos: <b>pembayaran menunggu diperiksa</b>, <b>tagihan telat</b>. Semua: <b>ringkasan awal bulan</b>.</>,
      <>Hasilnya muncul di <b>Pemberitahuan</b> (dan email untuk resep tertentu). Tekan <b>Jalankan sekarang</b> untuk mencoba.</>,
      <>Buka <b>Riwayat jalan</b> untuk melihat kapan berjalan, hasilnya, atau kesalahannya.</>,
      <>Menyalakan resep tersedia mulai <b>Paket Bisnis</b> (bisnis yang dibuat sebelum 14 Nov 2026 tetap bisa). Mematikan selalu bisa. Bila paket turun, resep yang menyala tidak dijalankan lagi sampai paket naik.</>,
      <>Jasa: <b>pesanan lewat janji selesai</b>. Resep bertanda <b>Pro</b> (Paket Pro): <b>penjualan turun</b> (7 hari terakhir dibanding 7 hari sebelumnya, paling banyak sekali seminggu), <b>biaya mendekati anggaran</b> (dari menu Anggaran), <b>sewa segera berakhir</b> (kos), dan <b>ringkasan mingguan</b> setiap Senin. Di Paket Pro Anda juga bisa memilih <b>hari jalan</b> (Sen–Min) tiap resep; kosong = setiap hari.</>,
    ], <>Otomatisasi tidak pernah mengubah data sendiri: tindakan yang mengubah data (mis. membuat pesanan) masuk ke Persetujuan. Paling banyak sekali sehari, tidak membuat pesanan ganda, dan dijeda otomatis setelah 3 kali gagal. WhatsApp otomatis belum tersedia — pesan WA disiapkan untuk dikirim dengan satu ketukan.</>, null, null],
    ['Pembukuan', 'Menu ☰ › Pembukuan (pemilik & pengelola)', [
      <>Tidak perlu mencatat dua kali: setiap penjualan, retur, belanja, kas, kasbon/utang, perubahan stok, pengeluaran, dan pembayaran sewa yang terverifikasi otomatis menjadi <b>jurnal</b> (debit & kredit seimbang). Jurnal diposting saat halaman dibuka dan setiap pagi.</>,
      <>Tab <b>Laporan</b>: <b>Laba rugi</b> (pendapatan, HPP, beban) untuk bulan terpilih atau sejak awal tahun, dan <b>Neraca</b> (aset = kewajiban + ekuitas) per akhir bulan. Kotak di atasnya menunjukkan cakupan, waktu dibuat, basis pencatatan, dan status <b>Lengkap/Belum lengkap</b> beserta sebabnya.</>,
      <>Toko: <b>Cek kecocokan</b> membandingkan saldo buku dengan menu Kas, kasbon, utang, dan nilai stok. Selisih ditampilkan, tidak diubah diam-diam.</>,
      <>Tab <b>Buku besar</b>: pilih akun (mis. Kas) untuk melihat setiap mutasi dan saldonya; ketuk <b>lihat …</b> untuk membuka transaksi asalnya. Tab <b>Jurnal</b>: semua jurnal beserta baris debit/kreditnya.</>,
      <>Punya beberapa bisnis dalam satu badan usaha (atur di Konfigurasi › Profil)? Pilih <b>Seluruh badan usaha</b> untuk laporan gabungan bisnis-bisnis itu. Badan usaha berbeda tidak pernah digabung.</>,
      <>Di bawah neraca ada <b>Arus kas</b>: saldo awal, uang masuk, uang keluar, dan saldo akhir akun Kas + Bank (pindah kas ke bank tidak dihitung). Paket Bisnis juga melihat rinciannya per aktivitas — <b>operasi</b>, <b>investasi</b> (aset tetap), <b>pendanaan</b> (modal, prive, pinjaman) — sampai per akun.</>,
      <>Laba rugi per akun dan <b>neraca ringkas</b> (total aset, kewajiban, modal) tersedia di semua paket. <b>Laporan lanjutan</b> — neraca per akun, rincian <b>Buku besar</b>, laba rugi per lokasi, dan laporan gabungan badan usaha — mulai <b>Paket Bisnis</b>; bisnis yang dibuat sebelum 14 Nov 2026 tetap mendapatkannya.</>,
      <>Tab <b>Periode & manual</b> (pemilik): <b>Tutup</b> bulan yang sudah diperiksa (alasan wajib, tercatat). <b>Jurnal manual</b> untuk penyesuaian, mis. saldo awal rekening bank: debit Bank, kredit Ekuitas saldo awal. Jurnal manual tersedia mulai <b>Paket Bisnis</b> (bisnis yang dibuat sebelum 14 Nov 2026 tetap bisa).</>,
      <>Tab <b>Rekonsiliasi bank</b> (Paket Bisnis): isi <b>saldo rekening koran</b> akhir bulan, centang baris akun Bank yang sudah tercantum di rekening koran, lalu lihat <b>Selisih</b>. Bila 0, tekan <b>Selesaikan rekonsiliasi</b>. Selisih biasanya karena biaya admin/bunga bank yang belum dicatat — catat dulu, lalu cocokkan lagi. Baris yang belum muncul di bank ikut ke bulan berikutnya; pemilik bisa <b>Buka kembali</b> dengan alasan.</>,
      <><b>Keuangan › Anggaran</b> (Paket Bisnis): pilih bulan, isi anggaran tiap kategori biaya, lalu ketuk di luar kotak untuk menyimpan. Bilah menunjukkan terpakai (hijau), mendekati batas ≥80% (kuning), atau melebihi (merah). Realisasi dihitung otomatis dari pengeluaran yang tercatat.</>,
      <>Bulan baru: tekan <b>Salin anggaran</b> bulan lalu, atau <b>Pakai Rp …</b> untuk memakai realisasi bulan lalu sebagai anggaran. Kosongkan isian untuk menghapus. Di paket lain menu ini tetap menampilkan pengeluaran per kategori.</>,
      <>Kartu <b>Rencana</b> di atas: ketuk <b>Isi target pendapatan</b> (pendapatan usaha dari Pembukuan, tanpa pendapatan lain). Pengelola keuangan menekan <b>Ajukan ke pemilik</b>; pemilik menekan <b>Setujui anggaran</b> atau <b>Tolak</b> (alasan wajib) — pemilik juga boleh langsung menyetujui. Anggaran yang diubah setelah diajukan/disetujui kembali menjadi <b>Draf</b> (revisi tercatat) dan perlu disetujui ulang. Bulan yang sudah <b>tutup buku</b> terkunci.</>,
      <>Kartu yang sama menunjukkan realisasi, <b>proyeksi akhir bulan</b> (laju harian sampai hari ini × jumlah hari sebulan — perkiraan, bukan angka aktual; kategori bertanda <b>Biaya tetap bulanan</b> seperti sewa tempat atau gaji tetap memakai yang lebih besar antara realisasi dan anggarannya, karena dibayar sekali sebulan). Centang <b>Biaya tetap bulanan</b> di lembar ubah anggaran kategori itu. Kartu juga menunjukkan <b>dampak ke laba</b>: pendapatan di atas/bawah target dikurangi biaya di atas/bawah anggaran. Biaya di sini = pengeluaran yang dicatat di menu Pengeluaran, tanpa harga pokok barang (HPP) dan penyusutan. Ringkasannya juga tampil di Analisis Bisnis › Anggaran.</>,
    ], <>Jurnal tidak bisa dihapus atau diubah. Bila penjualan/belanja dibatalkan atau diubah, sistem membuat <b>jurnal pembalikan/koreksi</b>; untuk bulan yang sudah ditutup, koreksinya dicatat di bulan berjalan. Kos dicatat saat uang diterima (basis kas), toko saat transaksi terjadi — gabungan berbeda basis hanya indikasi, bukan konsolidasi resmi. PPh final UMKM dijurnal otomatis bila profil pajak diatur (Analisis Bisnis › Pajak); penyusutan otomatis dari menu Aset tetap. Bisnis yang sudah ditutup tetap bisa dibuka laporannya (arsip hanya-baca, jurnalnya tidak berubah).</>, null, <><ScrRekonBank /><ScrAnggaran /></>],
    ['Stok per lokasi & mutasi', 'Konfigurasi › Cabang & gudang, lalu menu Mutasi stok (toko)', [
      <>Pemilik membuka <b>Menu ☰ › Mutasi stok</b> › <b>+ Tambah gudang / cabang</b> (atau Konfigurasi › Cabang & gudang › + Tambah). Lokasi yang sudah ada otomatis bernama <b>Lokasi utama</b> (boleh diganti namanya) dan semua stok lama ada di sana.</>,
      <>Begitu ada lebih dari satu lokasi, muncul kotak <b>📍 Lokasi kerja</b> di Kasir, Barang & stok, dan Belanja. Pilih lokasi tempat Anda bekerja: penjualan, belanja, hitung ulang stok, dan barang rusak tercatat di lokasi itu.</>,
      <>Barang & stok menampilkan stok <b>di sini</b> dan <b>total</b>; tombol <b>Stok</b> menunjukkan rincian per lokasi.</>,
      <>Memindahkan barang (mis. gudang → toko): buka <b>Mutasi stok</b>, pilih <b>Dari</b> dan <b>Ke</b>, cari barang, isi jumlah, lalu <b>Pindahkan</b>. Riwayat mutasi mencatat nomor, asal–tujuan, waktu, dan siapa.</>,
      <>Jika ada <b>Stok minus per lokasi</b>, buka kartu stok dari peringatannya untuk memeriksa saldo dan mutasi lokasi tersebut sebelum melakukan koreksi. Membuka kartu tidak mengganti <b>Lokasi kerja</b>.</>,
      <>Pemilik bisa menetapkan lokasi kerja tiap karyawan di menu <b>Karyawan</b>; karyawan itu tidak bisa pindah lokasi sendiri dan hanya bisa mengirim barang dari lokasinya.</>,
      <>Uang kas juga per lokasi: <b>Kas & kasbon</b> menampilkan <b>Uang kas per lokasi</b>. Biaya, uang masuk/keluar lain, dan pembayaran kasbon/utang dicatat di lokasi kerja Anda. Setoran laci cabang ke toko utama: <b>Pindahkan uang kas</b>.</>,
      <>Laporan toko › <b>Per lokasi</b>: penjualan, laba kotor, biaya lokasi, dan <b>kontribusi</b> (laba kotor − biaya operasional lokasi itu).</>,
    ], <>Mutasi barang dan pindah kas tidak mengubah total stok, harga modal, maupun total kas bisnis. Jumlah yang dipindah tidak boleh melebihi yang tercatat di lokasi asal. Lokasi yang masih ada stoknya tidak bisa dinonaktifkan. Bank, pengingat stok minimum, dan pembukuan tetap satu untuk seluruh bisnis.</>, null, null],
    ['Saran untuk bisnis Anda', 'Konfigurasi › Saran (pemilik & pengelola)', [
      <>Bila ada saran, di dashboard Toko/Dashboard kos muncul kotak <b>💡 N saran</b>. Ketuk untuk membuka <b>Konfigurasi › Saran</b>.</>,
      <>Setiap saran menyebut <b>alasan</b> dengan angka dari data Anda (mis. "7 penjualan kasbon dalam 30 hari terakhir"), <b>manfaat</b>, <b>dampak</b>, dan <b>tingkat risiko</b>.</>,
      <>Tekan <b>Terapkan</b> untuk menjalankannya (mengaktifkan modul, menyalakan otomatisasi, atau mewajibkan persetujuan), atau <b>Buka</b> untuk saran yang Anda kerjakan sendiri (mis. melengkapi harga modal, menutup buku).</>,
      <>Tidak cocok? Tekan <b>Abaikan 30 hari</b> (alasan opsional). Semua keputusan tercatat di Riwayat.</>,
    ], <>Saran hanya muncul bila datanya cukup kuat (mis. minimal beberapa kejadian dalam 30 hari), bukan dari satu kejadian. Tidak ada yang berubah sebelum Anda menekan Terapkan. Pengelola yang menerapkan saran modul akan mengirim permintaan ke pemilik. Saran ini dihitung dengan aturan tetap dari data Anda sendiri.</>, null, null],
    ['Unduh semua data & tutup bisnis', 'Pengaturan › Data & penutupan bisnis (pemilik)', [
      <>Tekan <b>Unduh Excel</b> (satu lembar per jenis data: barang, penjualan, belanja, kas, jurnal, dll. — bisa difilter dan dijumlah) atau <b>Unduh PDF</b> (laporan berhalaman, siap dibaca, dicetak, atau dikirim). Di iPhone, file tersimpan di app <b>Files › Unduhan</b> dan bisa dibuka langsung.</>,
      <>Usaha berhenti? Tekan <b>Tutup bisnis…</b>. Sistem memeriksa: shift yang belum ditutup, pesanan supplier yang belum selesai, persetujuan menunggu, pembayaran belum diverifikasi, penghuni aktif, dan <b>ekspor data dalam 7 hari terakhir</b> — semuanya harus beres dulu.</>,
      <>Baca bagian <b>Perlu diketahui</b> (sisa kasbon/utang/tagihan, stok, periode buku, karyawan aktif) lalu centang <b>Saya mengerti</b>.</>,
      <>Ketik nama bisnis persis sama, tulis alasan, lalu tekan <b>Tutup bisnis</b>.</>,
      <>Bisnis yang ditutup menampilkan pita merah di semua halaman. Pemilik bisa menekan <b>Buka kembali</b> kapan saja (alasan wajib).</>,
    ], <>Menutup bisnis tidak menghapus data apa pun: transaksi, laporan, dan pembukuan tetap bisa dilihat dan diunduh. Selama ditutup, semua orang (termasuk pemilik) tidak bisa mencatat apa pun, otomatisasi dimatikan, dan email harian/ringkasan untuk bisnis itu berhenti. Foto bukti transfer tidak ikut dalam file Excel/PDF.</>, null, null],
    ['Prospek & tindak lanjut', 'Menu ☰ › Prospek & tindak lanjut (toko) / Calon penghuni (kos)', [
      <>Ada yang bertanya atau tertarik? Tekan <b>+ Prospek baru</b>: isi nama, No. HP, kebutuhan (mis. "ambil beras 5 karung/minggu" atau "kamar mandi dalam"), dari mana tahunya, dan perkiraan nilai bila ada.</>,
      <>Ikuti tahapannya: <b>Baru → Dihubungi → Penawaran → Jadi</b> atau <b>Tidak jadi</b> (alasan wajib). Prospek toko yang <b>Jadi</b> otomatis masuk daftar pelanggan — dicocokkan lewat No. HP, bukan nama.</>,
      <>Di setiap prospek: tulis <b>catatan</b> (WA, telepon, kunjungan, keluhan) dan <b>jadwalkan tindak lanjut</b> (Besok / 3 hari / 1 minggu). Pelanggan lama juga bisa diberi catatan & tindak lanjut dari menu Pelanggan & supplier.</>,
      <>Tab <b>Tindak lanjut</b> berisi semua jadwal; yang jatuh hari ini atau terlewat berwarna merah dan muncul sebagai kotak <b>📞</b> di dashboard. Tekan <b>Kirim WA</b> lalu <b>Selesai</b>.</>,
    ], <>Angka "Jadi (90 hari)" = prospek jadi ÷ (jadi + tidak jadi) yang ditutup 90 hari terakhir. Catatan tidak bisa dihapus agar riwayat utuh. Simpan seperlunya saja (nama, No. HP, kebutuhan); jangan mencatat data pribadi sensitif. Kasir dan penjaga juga bisa memakai menu ini.</>, null, null],
    ['Halaman bisnis untuk pelanggan', 'Menu ☰ › Halaman bisnis (pemilik)', [
      <><b>Portal bisnis tersedia di Paket Pro</b> (sesuai paket harga): menerbitkan halaman, katalog, formulir permintaan, pendaftaran penghuni & pesanan online, QR per meja, dan reservasi online. Bisnis yang dibuat sebelum 14 Nov 2026 tetap bisa. Di paket lain isi halaman tetap bisa disiapkan dan <b>Simpan saja</b>; tombol <b>Lihat Paket Pro</b> menampilkan penawarannya. Bila paket turun, halaman disembunyikan otomatis keesokan harinya — isinya tidak hilang.</>,
      <>Unggah <b>Logo</b> (gambar persegi; dikecilkan otomatis). Isi <b>alamat halaman</b> (mis. toko-subur), kalimat singkat, tentang, alamat, jam buka, dan No. WhatsApp untuk pelanggan.</>,
      <>Pilih yang ditampilkan: toko — <b>barang cepat (★)</b> atau <b>semua barang aktif</b>; kos — <b>kamar yang tersedia</b>. Centang <b>Tampilkan harga jual</b> bila ingin harganya terlihat.</>,
      <>Tambahkan <b>Tautan</b> (maks 6): ketuk <b>+ 📍 Lokasi (Google Maps)</b>, <b>+ 📷 Instagram</b>, <b>+ 🖼️ Foto</b> atau <b>+ Tautan lain</b>, lalu tempel alamatnya (di aplikasi Maps/Instagram: <b>Bagikan › Salin tautan</b>). Tampil sebagai tombol di halaman. Alamat https:// yang Anda tulis di Tentang/Ketentuan juga bisa diketuk.</>,
      <>Tekan <b>Terbitkan</b>. Baca daftar yang akan terlihat publik, lalu setujui. Cara tercepat: ketuk ikon <b>Bagikan</b> (panah ke atas, pojok kanan atas, ada di semua bisnis) › <b>Terbitkan sekarang & dapatkan tautan</b> — halaman langsung terbit dengan nama, alamat & WhatsApp bisnis (isi lainnya bisa diatur nanti). Setelah terbit, ikon yang sama menampilkan <b>QR code</b> dan tautan. Pilih <b>Bagikan…</b> (menu bagikan HP), <b>WhatsApp</b>, <b>Salin tautan</b>, <b>Simpan gambar QR</b> (untuk status/grup WA), atau <b>Cetak poster QR</b> (A4 — di iPhone pilih Cetak atau simpan PDF) untuk ditempel di kasir, meja, etalase, atau pintu.</>,
      <>Pelanggan membuka tautan tanpa memasang aplikasi, memilih barang/kamar, mengisi nama & WhatsApp, menyetujui dihubungi, lalu <b>Kirim permintaan</b>. Setelah terkirim mereka pindah ke halaman <b>Terkirim</b>: nomor (bisa disalin), status <b>Menunggu konfirmasi</b>, ringkasan, langkah berikutnya, tombol <b>Chat WhatsApp pemilik</b> (pesan sudah berisi nomornya), jam buka, alamat, tautan lokasi, cara bayar (bila Anda izinkan), dan ketentuan. Berlaku untuk pendaftaran penghuni, booking, pesanan jasa/kuliner, pesanan QR meja, reservasi, dan permintaan toko.</>,
      <>Permintaan masuk ke <b>Prospek & tindak lanjut</b> (label <b>Perlu konfirmasi</b>); email ke Anda bila dicentang. Ketuk permintaannya: sistem sudah <b>mengecek otomatis</b> (kamar kosong pada tanggal itu, stok cukup, harga masih sama, No. HP ganda).</>,
      <>Bila cocok tekan <b>Konfirmasi</b>: kos → <b>booking kamar</b> langsung dibuat (bisa sekalian catat DP); toko → <b>keranjang Kasir</b> terisi, prospek otomatis <b>Jadi</b> setelah dibayar. Lalu kabari pelanggan lewat tombol WhatsApp.</>,
      <><b>Checkout toko publik</b> tersedia saat katalog dan harga terbit serta modul <b>Penawaran & pesanan pelanggan</b> aktif. Ketuk foto untuk melihat detail, atau ikon keranjang untuk memilih kemasan dan jumlah. Buka <b>Keranjang</b>, centang barang, lalu <b>Checkout</b>. Pilih ambil di toko atau kirim ke alamat, cara bayar, dan isi kontak. Tidak perlu akun atau OTP. Isi foto, deskripsi, dan komposisi dari <b>Barang &amp; stok › Barang</b> agar muncul di detail produk.</>,
      <>Pada <b>Beranda toko</b>, ketuk <b>Pesanan baru</b>, <b>Penawaran baru</b> atau <b>Permintaan baru</b> di bagian <b>Pemberitahuan portal</b> untuk langsung membuka detailnya. Membuka detail tetap menyisakan pemberitahuan sampai kiriman ditindaklanjuti.</>,
      <>Buka <b>Pesanan grosir › Penawaran</b> untuk memeriksa pesanan publik dan mengonfirmasinya. Sampaikan total akhir dan ongkir kepada pembeli. Pembeli membuka <b>Pesanan</b> di browser yang sama untuk melacaknya dan menilai produk setelah diterima. Transfer dan QRIS mengikuti pengaturan toko dan diverifikasi oleh penjual sebelum dicatat.</>,
      <>Pelanggan toko membuka <b>Minta Penawaran</b>, lalu mencari barang dan memilih satuan serta jumlah. Alternatifnya, unggah daftar, ketik kebutuhan, pilih paket usaha, atau impor keranjang dari ikon keranjang. Ketuk <b>Lanjutkan</b>, isi kontak dan persetujuan, lalu kirim tanpa login. Nomor permintaan tampil di halaman status.</>,
      <>Pemilik membuka <b>Pesanan grosir › Penawaran</b>, meninjau kebutuhan dan lampiran, lalu memakai <b>Ubah</b> untuk menyusun harga. Pilih <b>Kirim penawaran ke portal</b>. Pelanggan meninjau versi terbaru di <b>Riwayat Permintaan</b> pada browser yang sama, lalu mengajukan negosiasi atau menyetujui. Setelah disetujui, penawaran yang sama menjadi pesanan.</>,
      <>Bisnis <b>jasa/laundry</b>: pelanggan yang memilih layanan langsung membuat <b>pesanan</b> (lihat Langkah 66); yang hanya bertanya masuk ke Prospek.</>,
      <><b>Rekening & QRIS untuk pelanggan</b> (semua jenis bisnis, opsional): isi <b>Cara bayar</b> dan unggah <b>QRIS</b> di Pengaturan, lalu nyalakan <b>Tampilkan rekening/QRIS di halaman bisnis</b> (di Halaman bisnis atau Pengaturan). Tampil di halaman, setelah pesanan/permintaan terkirim, di <b>Cek status pesanan</b> (belum lunas), dan di formulir pendaftaran penghuni. Matikan kapan saja bila lebih suka mengirim rekening lewat WhatsApp.</>,
    ], <>Yang TIDAK pernah tampil: harga modal, laba, stok persis (hanya Tersedia/Habis), data pelanggan, dan catatan staf. Permintaan bukan penjualan final dan tidak mengubah stok, kas, atau jurnal. Spam dibatasi otomatis (terlalu cepat/terlalu sering dari satu perangkat ditolak). Tekan <b>Sembunyikan halaman</b> kapan saja; bisnis yang ditutup otomatis tidak tampil. Pesanan publik toko menunggu konfirmasi sebelum pemenuhan. Pembayaran transfer dan QRIS dikonfirmasi secara manual.</>, null, null],
  ]],
  ['G', 'Jasa & Laundry', [
    ['Buat bisnis laundry, atur layanan & tahap', 'Ketuk nama bisnis › + Tambah bisnis › Laundry & Jasa Rumah Tangga; lalu Menu ☰ › Layanan & tahap', [
      <>Pilih kategori <b>Laundry & Jasa Rumah Tangga</b> (subkategori Laundry), pilih layanan yang Anda sediakan, jam operasional, dan antar jemput. Lengkapi <b>harga & estimasi</b> tiap layanan dan wilayah/biaya/jadwal antar jemput di <b>Pusat Konfirmasi</b> (Langkah 64), lalu aktifkan.</>,
      <>Buka <b>Layanan & tahap</b>. Ketuk layanan untuk mengubah <b>harga per kg/pcs</b>, <b>minimal</b> (mis. 3 kg — 2 kg tetap dihitung 3 kg), <b>lama pengerjaan</b> (jam), <b>deskripsi</b>, <b>persyaratan</b> (mis. pakaian luntur dipisah), info tambahan, dan <b>Tersedia / Tidak tersedia sementara</b>. <b>+ Layanan</b> untuk menambah.</>,
      <>Di <b>Tahap proses</b>, ganti nama, urutkan dengan ↑ ↓, nonaktifkan, atau <b>+ Tahap</b>, lalu <b>Simpan tahap</b>.</>,
    ], <>Harga tidak pernah diisi otomatis. Deskripsi & persyaratan tampil di halaman bisnis; layanan yang tidak tersedia tidak bisa dipilih. Tahap yang sedang dipakai pesanan tidak bisa dinonaktifkan. Setiap perubahan harga & tahap tercatat di Konfigurasi › Riwayat.</>, null, null],
    ['Terima pesanan & beri nota', 'Pesanan › + Pesanan baru', [
      <>Cari pelanggan lama (nama / No. HP) atau isi nama & No. WhatsApp pelanggan baru — tersimpan otomatis, dicocokkan lewat nomor.</>,
      <>Ketuk <b>+</b> pada kartu layanan/menu (kategori & kotak cari di atasnya). Layanan per kg: isi beratnya; per pcs/porsi: atur dengan <b>−</b>/<b>+</b>. Tombol <b>⋯</b> untuk catatan (mis. "3 kemeja putih") atau menghapus. Total dihitung otomatis termasuk minimal. Di laptop, Pesanan baru tampil penuh seperti Kasir: katalog kiri, pesanan kanan.</>,
      <>Bila perlu: centang <b>Dijemput</b>/<b>Diantar</b>, pilih <b>Wilayah</b> (ongkos terisi otomatis), alamat, dan tanggal/jam jemput-antar (Langkah 65); isi <b>diskon</b>, dan ubah <b>janji selesai</b>.</>,
      <>Isi <b>Bayar sekarang</b> untuk DP atau tekan <b>Lunas sekarang</b>; kosongkan bila bayar saat ambil. Tekan <b>Simpan pesanan</b>.</>,
      <>Di detail pesanan tekan <b>Nota</b> untuk mencetak (printer struk 58 mm) atau <b>Kirim via WhatsApp</b>, atau tombol <b>WA: diterima</b>.</>,
    ], <>Harga dihitung ulang oleh server dari daftar layanan — kasir tidak bisa mengubah harga satuan; potongan lewat diskon yang tercatat. Tekan Simpan dua kali tidak membuat pesanan dobel. Pesan WhatsApp dikirim manual dari HP Anda (bukan otomatis).</>, null, <ScrPesanan />],
    ['Kerjakan pesanan per tahap', 'Pesanan (pemilik, kasir, Petugas proses)', [
      <>Papan pesanan bisa disaring: <b>Semua aktif</b>, <b>Diterima</b>, per tahap (Cuci, Setrika, …), <b>Siap</b>, <b>Menunggu jemput</b>, <b>Dalam pengantaran</b> (di daftar ditulis singkat: <b>Tunggu jemput</b> / <b>Diantar</b>), <b>Terlambat</b>, <b>Selesai & batal</b>; atau cari nomor/nama/No. HP.</>,
      <>Ketuk pesanan › tombol <b>→ [tahap berikutnya]</b> (mis. → Kering) setiap kali pekerjaan pindah tahap. Setelah tahap terakhir: <b>→ Siap</b>. Bisa juga <b>Langsung siap</b>.</>,
      <>Salah tekan? <b>Mundur</b> (alasan wajib). Semua perpindahan tercatat di <b>Riwayat</b> beserta waktu dan siapa.</>,
      <>Karyawan bagian produksi undang sebagai <b>Petugas proses</b> (menu Karyawan): hanya bisa memindahkan tahap & mencatat keluhan, tidak melihat uang dan tidak bisa menyerahkan pesanan.</>,
    ], <>Pesanan lewat janji selesai berwarna merah dan muncul di Dashboard & Ringkasan pemilik. Pesanan siap lebih dari 3 hari belum diambil juga diingatkan.</>, null, null],
    ['Serahkan, terima bayar, tagih', 'Pesanan › ketuk pesanan Siap', [
      <>Tekan <b>WA: sudah siap</b> untuk memberi tahu pelanggan.</>,
      <>Saat pelanggan membayar: <b>+ Bayar</b> (tunai/transfer/e-wallet). Boleh sebagian.</>,
      <>Tekan <b>Sudah diambil</b> (atau <b>Sudah diantar</b>) saat barang diserahkan; boleh isi siapa yang menerima. Bila belum lunas, sistem meminta konfirmasi — sisa bayar tetap tercatat dan bisa ditagih dengan <b>WA: tagih</b>.</>,
    ], <>Pendapatan dicatat saat pesanan diserahkan. Uang yang diterima sebelumnya (DP) dicatat sebagai uang muka. Transfer dicatat setelah uang benar-benar masuk.</>, null, <ScrNota />],
    ['Keluhan, cuci ulang, batal & pengembalian uang', 'Pesanan › ketuk pesanan', [
      <><b>Catat keluhan</b>: pilih jenis (kurang bersih, rusak, hilang, luntur, terlambat), tulis catatan, centang <b>Cuci ulang</b> bila perlu. Pesanan yang sudah diserahkan dibuatkan <b>pesanan cuci ulang</b> baru tanpa biaya; yang belum, kembali ke tahap pertama.</>,
      <>Setelah beres: <b>Selesaikan</b> keluhan, tulis penyelesaian dan ganti rugi bila ada. Ganti rugi uang catat di <b>Kas › + Biaya</b> (kategori Ganti rugi pelanggan).</>,
      <><b>Batalkan pesanan</b> atau membatalkan catatan pembayaran (✕ di daftar pembayaran): alasan wajib dan, untuk karyawan, perlu <b>persetujuan</b> pemilik. Uang yang sudah dibayar dikembalikan lewat <b>Pengembalian uang</b>.</>,
    ], <>Pesanan yang sudah diserahkan tidak bisa dibatalkan. Bisnis tidak bisa ditutup selama masih ada pesanan belum selesai atau pesanan batal yang uangnya belum dikembalikan.</>, 'warn', null],
    ['Bahan, kas & laporan jasa', 'Menu ☰ › Bahan & stok · Kas · Laporan', [
      <><b>Bahan & stok</b>: daftar deterjen, pewangi, plastik, dll. Beli lewat <b>Belanja</b>; saat dipakai tekan <b>Stok</b> › <b>Pemakaian bahan</b> agar biaya bahan masuk laporan.</>,
      <><b>Kas</b>: saldo kas/bank (termasuk pembayaran pesanan), <b>+ Biaya</b> (listrik, gaji, gas), dan utang supplier. Sisa bayar pelanggan ada di Pesanan.</>,
      <><b>Laporan</b>: pendapatan per bulan, laba perkiraan (pendapatan − bahan − biaya), uang masuk, belum lunas, uang muka, per layanan, pelanggan teratas, ketepatan waktu, dan keluhan. <b>Unduh Excel</b> (Dasar ke atas).</>,
    ], <>Pembukuan otomatis: pesanan diserahkan → Pendapatan jasa & Piutang jasa; pembayaran → Kas/Bank; pemakaian bahan → Beban bahan. Belum tersedia: komisi/penugasan per karyawan, pengingat otomatis jasa, dan stok per cabang untuk bisnis jasa.</>, null, null],
  ]],
  ['H', 'Kos lanjutan: deposit, keluhan, meteran & booking', [
    ['Deposit / uang jaminan', 'Penghuni › ketuk penghuni › Deposit', [
      <>Saat <b>Isi kamar</b>, isi <b>Deposit diterima</b> dan pilih masuk ke kas atau bank. Penghuni lama: buka penghuninya › <b>+ Terima deposit</b>.</>,
      <>Saldo deposit tampil di Penghuni, di detail Kamar, dan di portal penghuni.</>,
      <>Saat penghuni keluar: <b>Kembalikan</b> (sebagian atau semua), <b>Potong (kerusakan dll.)</b> dengan alasan, atau lunasi tunggakan lewat <b>Tagihan › Catat pembayaran › Metode: Dipotong dari deposit</b>.</>,
      <>Salah catat? Tekan <b>✕</b> di riwayat deposit dan tulis alasannya.</>,
    ], <>Deposit <b>bukan pendapatan</b>: dicatat sebagai titipan (utang ke penghuni) di Pembukuan. Potongan untuk kerusakan menjadi pendapatan lain; potongan untuk tunggakan menjadi pembayaran sewa tanpa uang masuk baru. Mengembalikan, memotong, dan membatalkan hanya bisa oleh pemilik/pengelola; penjaga bisa mencatat deposit diterima.</>, 'warn', <ScrDeposit />],
    ['Keluhan & perbaikan', 'Menu ☰ › Keluhan & perbaikan (atau Kamar › Catat keluhan)', [
      <>Tekan <b>+ Catat keluhan</b>: pilih kamar (atau area umum), jenis (listrik, air, bangunan, …), tulis masalahnya, prioritas, dan siapa yang menangani.</>,
      <>Kamar kosong yang rusak bisa <b>ditutup sementara</b> (status Perbaikan) agar tidak terisi; otomatis kembali Tersedia saat selesai.</>,
      <>Ikuti statusnya: <b>Mulai dikerjakan</b>, <b>Menunggu…</b> (bahan/tukang), lalu <b>Selesai</b> dengan apa yang dikerjakan dan biayanya — centang <b>Catat biaya di Pengeluaran</b> agar masuk laporan.</>,
      <>Penghuni (portal Pro) bisa melapor sendiri dari tab <b>Lapor kerusakan</b> dan melihat statusnya. Kabari penghuni dengan tombol <b>WA penghuni</b>.</>,
    ], <>Semua perubahan tercatat di <b>Riwayat</b> (siapa & kapan). Laporan dari portal dibatasi (maks 3 yang belum selesai per penghuni) agar tidak disalahgunakan. Penjaga bisa menutup keluhan, tetapi biaya hanya dicatat ke Pengeluaran oleh pemilik/pengelola.</>, null, <ScrPerbaikan />],
    ['Meteran listrik & air', 'Menu ☰ › Meteran listrik/air', [
      <>Pertama kali: tekan <b>+ Listrik (kWh)</b> atau <b>+ Air (m³)</b>, isi tarif per satuan dan tagihan minimal (bila ada).</>,
      <>Bulan pertama: isi angka meter tiap kamar sebagai <b>angka awal</b> (belum ditagih).</>,
      <>Bulan berikutnya: isi angka sekarang. Pemakaian dan tagihan tampil langsung (angka sekarang − bulan lalu × tarif). Isi jatuh tempo, lalu <b>Simpan & buat tagihan</b>.</>,
      <>Tagihan masuk ke <b>Tagihan</b> sebagai tagihan tambahan dan ikut pengingat WhatsApp/portal. Salah angka? Tekan <b>Batalkan</b> di kamar itu (tagihannya ikut batal bila belum dibayar), lalu isi ulang.</>,
    ], <>Kamar kosong tetap dicatat angkanya tetapi tidak ditagih. Angka lebih kecil dari bulan lalu ditolak — bila meteran diganti, centang <b>Meteran baru</b>. Listrik token/prabayar tidak perlu dicatat di sini.</>, null, <ScrMeteran />],
    ['Booking kamar', 'Menu ☰ › Booking kamar (atau Kamar › Booking kamar ini, Prospek › Buat booking)', [
      <>Tekan <b>+ Booking</b>: pilih kamar, isi nama & WhatsApp calon penghuni, <b>tanggal masuk</b>, sewa yang disepakati, lama sewa, dan batas konfirmasi (opsional).</>,
      <>Ada uang tanda jadi? Isi <b>DP</b> dan pilih masuk ke kas atau bank. Kirim <b>WA konfirmasi</b> ke calon penghuni.</>,
      <>Kamar yang dibooking ditandai <b>Dibooking</b> di Kamar, tidak bisa diisi orang lain, dan tidak tampil sebagai kamar kosong di halaman bisnis/portal. Kamar yang masih terisi boleh dibooking untuk tanggal setelah rencana selesai sewa penghuninya (isi di <b>Penghuni › ketuk nama › Rencana selesai › ubah</b>).</>,
      <>Saat penghuni datang: buka booking › <b>Check-in</b>. Sewa dimulai dari tanggal masuk dan data penghuni dibuat. Sudah menerima sewa bulan pertama? Isi <b>Sewa bulan pertama sudah dibayar</b> (atau ketuk <b>Sudah dibayar penuh</b>) — tagihan langsung lunas. Belum? Pilih <b>Batas bayar sewa bulan pertama</b> (Hari masuk / +3 hari / +7 hari / tanggal lain) agar tagihan tidak langsung jatuh tempo. DP menjadi <b>deposit</b> — atau centang <b>Pakai DP untuk membayar tagihan pertama</b>.</>,
      <>Tidak jadi? <b>Batalkan booking</b>: tulis alasan dan berapa DP yang dikembalikan; sisanya <b>hangus</b> menjadi pendapatan lain.</>,
    ], <>DP booking bukan pendapatan sampai penghuni masuk atau DP hangus (di Pembukuan dicatat sebagai uang muka). Booking ber-DP hanya bisa dibatalkan pemilik/pengelola. Booking dari Prospek otomatis menandai prospek <b>Jadi</b> saat check-in.</>, 'warn', <ScrBooking />],
  ]],
  ['I', 'Business Builder (bisnis kustom)', [
    ['Buat bisnis kustom', 'Ketuk nama bisnis › + Tambah bisnis › Bisnis lain (Business Builder)', [
      <>Pilih <b>Template Bengkel motor</b>, <b>Template Salon & barbershop</b>, atau <b>Bangun sendiri</b>.</>,
      <>Isi nama usaha, lalu <b>Setujui & buat bisnis</b>. Bisnis dibuat sebagai <b>draf</b>; bila memakai template, tampilannya sudah siap dan cukup diaktifkan di <b>Pusat Konfirmasi</b> — Business Builder hanya untuk menyesuaikan.</>,
      <>Langkah <b>1. Profil</b>: isi deskripsi, model pendapatan (dari mana uang masuk), proses utama, dan lokasi.</>,
    ], <>Semua isi template bisa diubah. Selama draf, tim belum bisa mencatat.</>, null, <ScrBuilder />],
    ['Data & formulir (custom field)', 'Business Builder › 2. Data & formulir', [
      <><b>Jenis data</b> = hal yang dicatat, mis. Pelanggan, Kendaraan, Servis. Tekan <b>+ Jenis data</b>, pilih ikon dan awalan nomor (mis. SRV).</>,
      <>Tekan <b>+ Field</b>: nama, tipe (teks, angka, uang, tanggal, tanggal & jam, pilihan satu/banyak, ya/tidak, No. HP, <b>rujukan</b> ke jenis data lain), wajib, nilai bawaan, batas minimal/maksimal.</>,
      <>Atur <b>Tampil di daftar</b>, <b>Bisa dicari</b>, <b>Bisa disaring</b>, dan <b>Sembunyikan dari peran</b> (mis. harga modal tidak terlihat petugas). Urutkan dengan ↑ ↓.</>,
      <>Di <b>Ubah</b> jenis data, pilih <b>Field judul</b> (mis. Plat nomor) dan apakah memakai status & alur. Cek dengan <b>Pratinjau formulir</b>.</>,
    ], <>Field yang sudah berisi data tidak bisa diganti tipenya; nonaktifkan dan buat field baru (isi lama tidak hilang). Nama field yang sama di satu jenis data ditolak (konflik). Foto/file tidak dibuat sebagai field: pakai panel <b>📎 Lampiran</b> di setiap catatan (Langkah 63).</>, 'warn', null],
    ['Alur status & peran (workflow)', 'Business Builder › 3. Alur & peran', [
      <>Susun <b>status</b> (mis. Antre → Dikerjakan → Selesai → Diambil, Batal). Tandai satu <b>Awal</b> dan minimal satu <b>Akhir</b>; isi <b>batas jam</b> bila ada target waktu.</>,
      <>Tambah <b>aturan</b>: dari status apa ke status apa. Centang peran yang boleh (kosong = semua), <b>Wajib catatan</b>, dan <b>Perlu persetujuan</b> (selain pemilik, dikirim ke menu Persetujuan).</>,
      <>Tekan <b>Simpan alur</b>. Undang karyawan sebagai <b>Pengelola</b> atau <b>Petugas proses</b> di menu Karyawan.</>,
    ], <>Langkah yang tidak ada aturannya ditolak server, apa pun tampilannya. Pemilik selalu boleh.</>, null, null],
    ['Laporan (Report Builder)', 'Business Builder › 4. Laporan', [
      <>Tekan <b>+ Laporan</b>: pilih jenis data, metrik (<b>jumlah catatan</b>, <b>total</b> atau <b>rata-rata</b> field angka/uang), kelompok (per status, bulan, hari, atau field), periode bawaan, dan filter status.</>,
      <>Lihat hasilnya di menu <b>Laporan</b>: pilih laporan & periode; ada batang perbandingan dan <b>Unduh Excel</b> <Std />.</>,
    ], <>Laporan dihitung server dari catatan yang tidak diarsipkan (tanpa rumus bebas). Angka uang di bisnis kustom belum menjadi pembukuan resmi.</>, null, null],
    ['Validasi & aktifkan', 'Business Builder › 5. Validasi & aktifkan', [
      <>Lihat <b>Pratinjau workspace</b>: jenis data, field, status, aturan, laporan, peran, dan menu.</>,
      <>Perbaiki semua yang bertanda <b>Wajib</b> (tombol <b>Perbaiki</b> membawa ke langkahnya); <b>Saran</b> boleh diabaikan.</>,
      <>Pemilik menekan <b>Aktifkan bisnis</b>. Konfigurasi tetap bisa diubah setelah aktif. Bisnis dari template juga otomatis aktif saat diaktifkan dari <b>Pusat Konfirmasi</b> (validasi yang sama tetap dijalankan).</>,
    ], <>Batas Business Builder: tidak bisa mengubah struktur inti, kode, keamanan, atau data bisnis lain. Kebutuhan di luar itu = pengembangan khusus.</>, null, null],
    ['Catatan harian & dashboard', 'Catatan · Dashboard', [
      <>Buka <b>Catatan</b>, pilih jenis data, tekan <b>+ [nama jenis]</b>, isi formulir, pilih <b>Penanggung jawab</b> bila perlu.</>,
      <>Ketuk catatan › tombol <b>→ [status]</b> untuk memindahkan sesuai alur. Langkah wajib catatan meminta alasan; langkah perlu persetujuan dikirim ke pemilik.</>,
      <>Saring per status atau field, cari, <b>Ubah isi</b>, lihat <b>Riwayat</b> dan <b>Dipakai di</b> (mis. riwayat servis sebuah kendaraan). Data salah? <b>Arsipkan</b> (pemilik/pengelola).</>,
      <><b>Dashboard</b> menampilkan jumlah per status, <b>Tugas saya</b>, dan <b>Lewat batas waktu</b>.</>,
    ], <>Notifikasi saat ini tampil di Dashboard & Ringkasan pemilik; email/WhatsApp otomatis untuk bisnis kustom belum tersedia. Catatan yang masih dirujuk catatan lain tidak bisa diarsipkan.</>, null, <ScrCatatan />],
    ['Uang masuk, kas & biaya bisnis kustom', 'Business Builder › 2. Data & formulir › 💰 Uang masuk › Atur · menu Kas & biaya', [
      <>Pada jenis data yang menghasilkan uang (mis. Servis), tekan <b>Atur</b> di baris <b>Uang masuk</b>: pilih field uang (mis. Biaya jasa), <b>status kapan dihitung</b> (mis. Diambil), dan masuk ke kas atau bank.</>,
      <>Setiap catatan yang mencapai status itu otomatis menambah saldo <b>Kas</b>, tercatat di <b>Pembukuan</b> (Kas/Bank vs Pendapatan jasa), dan muncul di <b>Laporan › Keuangan</b> serta Ringkasan pemilik.</>,
      <>Catat biaya (gaji, sewa, bahan) di <b>Kas & biaya › + Biaya</b>; modal awal di <b>+ Uang masuk/keluar lain › Setor modal</b>.</>,
      <>Dashboard menampilkan <b>Uang masuk hari ini</b> (untuk pemilik/pengelola).</>,
    ], <>Bila catatan dipindah keluar dari status uang masuk (mis. dibatalkan) atau diarsipkan, uangnya tidak dihitung lagi. Template Bengkel & Salon sudah terisi (Biaya jasa saat Diambil, Harga saat Selesai). Petugas proses tidak melihat angka keuangan.</>, 'warn', null],
    ['Isian tambahan di menu bawaan', 'Menu ☰ › Konfigurasi › Isian tambahan', [
      <>Untuk kos (Penghuni), toko & laundry (Barang/bahan, Pelanggan & supplier) dan laundry (Pesanan jasa): tekan <b>+ Isian</b>, isi nama (mis. Asal kampus, Merek, Ukuran), tipe, pilihan, wajib, dan batas angka.</>,
      <>Isian muncul di bagian <b>Isian tambahan</b> pada detail data (Penghuni › ketuk nama, Barang › ketuk barang, Pesanan › ketuk pesanan, Kontak). Tekan <b>Ubah</b> untuk mengisi.</>,
      <>Isian ikut terunduh di <b>Unduh semua data</b> (lembar Isian tambahan).</>,
    ], <>Isian yang dinonaktifkan disembunyikan, isinya tetap tersimpan. Tipe tidak bisa diganti bila sudah berisi data. Maksimal 20 isian per menu. Belum bisa dipakai untuk mencari/menyaring di daftar.</>, null, null],
  ]],
  ['J', 'Lampiran foto & file', [
    ['Lampirkan foto, nota & dokumen', 'Detail data › 📎 Lampiran › + Foto / file', [
      <>Buka datanya: <b>Catatan</b> (bisnis kustom), <b>Pesanan</b> (jasa/laundry), <b>Keluhan & perbaikan</b>, <b>Penghuni › ketuk nama</b>, atau pengeluaran (<b>Pengeluaran › ketuk baris</b> / <b>Kas & biaya › 📎</b>).</>,
      <>Di bagian <b>📎 Lampiran</b> tekan <b>+ Foto / file</b>. Di iPhone pilih <b>Ambil Foto</b>, <b>Perpustakaan Foto</b>, atau <b>Pilih File</b> (PDF). Bisa memilih beberapa sekaligus.</>,
      <>Foto otomatis dikecilkan (foto iPhone/HEIC menjadi JPG) sebelum diunggah. Setelah mencatat biaya baru, Anda langsung ditawari menambah <b>foto nota</b>.</>,
      <>Ketuk gambar untuk membuka ukuran penuh. Hapus dengan <b>✕</b> › <b>Ya, hapus</b>.</>,
    ], <>File disimpan privat: hanya pengguna yang berhak melihat datanya (mis. dokumen penghuni hanya pemilik & bagian sewa; foto nota pengeluaran hanya pemilik/pengelola) yang bisa membuka, lewat tautan sementara 10 menit. Maks 4 MB per file, 10 file per data; ruang per bisnis mengikuti paket (Gratis 50 MB, Dasar 500 MB, Bisnis 2 GB, Pro 10 GB). Penambahan & penghapusan tercatat di Riwayat. Unduh semua data hanya berisi <b>daftar</b> lampiran, bukan filenya. Bisnis yang ditutup: lampiran bisa dilihat, tidak bisa ditambah.</>, 'warn', <ScrLampiran />],
  ]],
  ['K', 'Pusat Konfirmasi (setup bisnis baru)', [
    ['Tinjau, lengkapi & aktifkan bisnis', 'Pusat Konfirmasi (menu utama bisnis yang masih draf)', [
      <>Buka bisnis yang masih draf (ketuk nama bisnis di kiri atas). Lihat <b>Kelengkapan data</b> dan daftar yang disiapkan PRASARA: profil & informasi, layanan, alur kerja, modul, dan halaman pelanggan.</>,
      <>Ketuk <b>Lengkapi</b>/<b>Ubah</b> untuk mengisi (mis. alamat, WhatsApp, metode pembayaran; laundry: <b>harga & estimasi tiap layanan</b>, wilayah/biaya/jadwal antar jemput; kos: jumlah kamar & harga sewa), lalu <b>Simpan & setujui</b> — atau <b>Simpan draf</b>.</>,
      <>Putuskan tiap bagian: <b>Setujui</b>, <b>Tunda</b>, atau <b>Tolak</b> (bagian bertanda wajib hanya bisa disetujui). Modul: <b>Setujui semua yang disarankan</b> lalu sesuaikan.</>,
      <>Tekan <b>Tinjau seluruh konfigurasi & aktifkan</b>: lihat apa yang akan aktif dan yang tidak, lalu <b>Aktifkan</b>. Menu operasional langsung terbuka; halaman bisnis tetap draf sampai Anda terbitkan sendiri (Langkah 44).</>,
    ], <>Selama draf, transaksi (pesanan, penjualan, tagihan) ditolak server. Harga, kapasitas, dan jumlah karyawan tidak pernah diisi otomatis. Yang tidak disetujui tidak diaktifkan. Setelah aktif, bagian yang Anda setujui di sini langsung diterapkan; semua keputusan tercatat di Konfigurasi › Riwayat. Belum siap? <b>Tunda setup</b> atau <b>Tolak draf</b> (datanya tetap tersimpan).</>, 'warn', <ScrKonfirmasi />],
  ]],
  ['L', 'Laundry lanjutan: antar jemput', [
    ['Antar jemput: wilayah, jadwal & status', 'Menu ☰ › Antar jemput', [
      <>Pemilik: buka tab <b>Wilayah & jadwal</b>. <b>+ Wilayah</b> untuk tiap kecamatan/perumahan yang dilayani beserta biayanya; <b>+ Jam</b> untuk pilihan jam (Jemput / Antar / keduanya) dan kapasitas per hari bila perlu. Isian dari Pusat Konfirmasi sudah terbawa.</>,
      <>Tab <b>Jemput</b>: daftar cucian yang harus dijemput, dikelompokkan <b>Terlewat / Hari ini / Besok / Belum dijadwalkan</b>. Ketuk <b>Peta</b> untuk membuka alamat, <b>WA</b> untuk mengabari pelanggan, <b>Jadwal</b> untuk mengatur tanggal & jam, lalu <b>Sudah dijemput</b>.</>,
      <>Tab <b>Antar</b>: pesanan siap yang harus diantar. Tekan <b>Berangkat antar</b> (status jadi <b>Dalam pengantaran</b>), lalu <b>Sudah diterima pelanggan</b> — pesanan selesai.</>,
      <>Gagal jemput/antar (pelanggan tidak di rumah)? Tekan <b>Gagal</b>, tulis alasannya, lalu jadwalkan ulang. Pelanggan ternyata datang membawa cuciannya sendiri? Di detail pesanan tekan <b>Diantar pelanggan sendiri</b> (ongkos jemput bisa dihapus lewat <b>Ubah isi</b>).</>,
    ], <>Pesanan yang dijemput baru bisa diproses setelah <b>Sudah dijemput</b>. Hanya wilayah di daftar yang bisa dipilih — alamat di luar wilayah tidak dianggap terlayani. Petugas proses bisa menjemput/mengantar dan melihat No. HP pelanggan antar jemput, tetapi hanya bisa menyerahkan pesanan yang sudah lunas; penagihan oleh kasir/pemilik. Pembayaran tetap terpisah: pesanan tidak otomatis lunas. Semua langkah tercatat di Riwayat pesanan.</>, 'warn', <ScrAntar />],
    ['Pesanan dari halaman bisnis & cek status', 'Halaman bisnis (pelanggan) › Pesanan (Anda)', [
      <>Pelanggan membuka halaman bisnis Anda, memilih layanan & jumlah, memilih <b>Dijemput/Diantar</b> (hanya wilayah dan jam yang Anda atur), mengisi alamat, nama & WhatsApp, lalu <b>Kirim pesanan</b>. Mereka mendapat nomor pesanan (mis. PSN-261107-004).</>,
      <>Pesanan masuk ke <b>Pesanan</b> dengan status <b>Permintaan masuk</b> (dashboard menampilkan pemberitahuan; email bila dicentang). Ketuk pesanannya: periksa layanan, jadwal & alamat, ubah ongkos bila perlu, lalu <b>Konfirmasi</b> — atau <b>Tolak</b> dengan alasan. Kabari lewat <b>WA pelanggan</b>.</>,
      <>Setelah dikonfirmasi pesanan berjalan seperti biasa (jemput → proses → siap → antar/ambil). Berat sebenarnya diisi lewat <b>Ubah isi</b> saat barang diterima — masih bisa dikoreksi sampai pesanan <b>Siap</b> (belum diserahkan).</>,
      <>Pelanggan bisa membuka <b>Cek status pesanan</b> di halaman bisnis dengan nomor pesanan + No. WhatsApp yang sama: terlihat menunggu konfirmasi, dijemput, tahap proses, siap, dalam pengantaran, selesai, serta lunas/belum.</>,
    ], <>Permintaan belum bisa diproses sebelum dikonfirmasi. Harga dihitung server dari daftar layanan yang tersedia; layanan nonaktif tidak bisa dipesan. Pelanggan baru masuk daftar pelanggan saat Anda mengonfirmasi. Pembayaran tetap langsung ke Anda (tidak ada pembayaran online). Kiriman dibatasi per perangkat agar tidak di-spam.</>, 'warn', null],
  ]],
  ['M', 'Kuliner & jenis usaha lain', [
    ['Kuliner: menu, pesanan meja/bungkus & dapur', 'Pesanan › + Pesanan baru · Dapur', [
      <>Daftar di <b>/mulai</b> › kategori <b>Kuliner</b> (warung, kafe, katering). Di Pusat Konfirmasi isi alamat, WhatsApp, jam buka, cara bayar, <b>jumlah meja</b>, tahap dapur (awal: Dimasak → Siap saji), lalu <b>+ Menu</b> untuk tiap menu beserta harganya (per porsi/gelas/cup…). Aktifkan.</>,
      <>Saat pelanggan memesan: <b>Pesanan › + Pesanan baru</b> › pilih <b>Makan di tempat</b> (ketuk nomor meja), <b>Bungkus</b>, atau <b>Diantar</b> (bila pengantaran disetujui) › ketuk menu, isi jumlah dan catatan (mis. pedas, tanpa bawang) › bayar sekarang atau nanti › <b>Simpan pesanan</b>. Nama pelanggan boleh kosong untuk makan di tempat (tercatat "Meja 3").</>,
      <>Di dapur buka menu <b>Dapur</b>: pesanan terlama paling atas, berwarna merah bila lebih dari 30 menit. Tekan tombol besar <b>→ Dimasak</b> / <b>→ Siap saji</b> / <b>→ Siap</b>. Layar memuat ulang sendiri tiap 20 detik.</>,
      <>Kasir menyerahkan di <b>Pesanan</b>: <b>+ Bayar</b> bila belum, lalu <b>Sudah diserahkan</b> (atau <b>Sudah diantar</b>). Pesanan dari halaman bisnis masuk sebagai <b>Permintaan masuk</b> seperti Langkah 66 (tanpa jemput).</>,
      <><b>QR per meja</b>: isi <b>Jumlah meja</b> di <b>Menu & tahap</b>, terbitkan Halaman bisnis, lalu ketuk ikon <b>Bagikan</b> (pojok kanan atas) › <b>Cetak QR semua meja</b> (4 kartu per A4; bisa juga satu meja saja). Tempel di tiap meja. Tamu memindai, memilih menu, dan mengirim pesanan untuk mejanya (nama & WhatsApp boleh kosong). Pesanan muncul di Pesanan sebagai <b>Pesanan dari QR Meja N</b> dan di Dapur sebagai pemberitahuan; kasir <b>Konfirmasi</b> → masuk antrean Dapur.</>,
    ], <>Harga dihitung server dari daftar menu; kasir tidak bisa mengubah harga satuan (potongan lewat diskon yang tercatat). Pendapatan diakui saat pesanan diserahkan. Petugas dapur (peran Petugas proses) hanya melihat pesanan & tahap, tidak melihat uang. Bahan baku dicatat di <b>Bahan & stok</b>. Nomor meja dari QR dicek server (meja yang tidak ada ditolak); pesanan QR tetap menunggu konfirmasi kasir agar tidak ada pesanan iseng, dan tidak dikirim lewat email. Tagihan per meja, split bill &amp; reservasi: Langkah 69. <b>Dalam rencana</b>: pembayaran online dari meja, cetak ke printer dapur. Bukan sistem POS restoran besar — cocok untuk warung, kafe kecil, dan katering.</>, 'warn', <ScrDapur />],
    ['Jenis usaha lain: template siap pakai', '/mulai › pilih kategori', [
      <>Pendidikan/kursus, event & sewa perlengkapan, konstruksi/proyek, rental kendaraan/alat, travel, produksi/UMKM, pertanian/peternakan, klinik/praktik, komunitas/koperasi, dan ekspedisi kini disiapkan dengan <b>template Business Builder</b> sesuai jenisnya (mis. Rental: Penyewa, Sewa dengan harga & status Dipesan → Berjalan → Kembali; Kursus: Siswa, Kelas, Pembayaran).</>,
      <><b>Langsung siap pakai</b>: setelah daftar, cukup buka <b>Pusat Konfirmasi</b>, lengkapi alamat & WhatsApp bisnis, lalu tekan <b>Aktifkan</b>. Bagian <b>Tampilan & alur kerja siap pakai</b> sudah otomatis disetujui — Anda <b>tidak wajib</b> membuka Business Builder.</>,
      <>Menu langsung memakai nama sesuai usaha, mis. Event: <b>Acara</b>, <b>Klien</b>, <b>Tugas persiapan</b>, <b>Vendor</b>; Klinik: <b>Kunjungan</b>, <b>Pasien</b>; Bengkel: <b>Servis</b>, <b>Kendaraan</b>, <b>Pelanggan</b>. Tombol <b>+</b> (HP) atau <b>+ Aksi cepat</b> (laptop) berisi "Acara baru", "Klien baru", dst.</>,
      <><b>Dashboard</b> per jenis usaha, mis. Event: acara bulan ini, nilai kontrak, penawaran berjalan, acara 7 hari ke depan, tugas terlambat, daftar <b>Acara terdekat</b> & <b>Tugas persiapan</b>; Klinik: kunjungan hari ini, menunggu dilayani, jadwal hari ini; Bengkel: antre, dikerjakan, menunggu spare part, siap diambil. Semua dari catatan Anda sendiri.</>,
      <>Ingin menambah kolom atau mengganti status? Sesuaikan kapan saja di <b>Business Builder</b> (Langkah 55–62). Pilih <b>Organisasi & Lainnya › Usaha lain</b>? Buka Business Builder › <b>Mulai dari template siap pakai</b> dan pilih jenis usaha yang paling mirip. Template bisa diganti selama belum ada catatan.</>,
    ], <>Template hanya titik awal — semua bisa diubah, tidak ada data atau harga yang diisi otomatis. Fitur khusus per jenis (mis. jadwal kelas otomatis, rekam medis, pelacakan resi) belum ada; yang tersedia adalah pencatatan, alur status, peran, dan laporan dari Business Builder.</>, 'warn', null],
    ['Kuliner: meja, tagihan per meja & reservasi', 'Menu ☰ › Meja & reservasi', [
      <>Tab <b>Meja</b>: semua meja tampil dengan status — <b>Kosong</b>, <b>Terisi</b>, <b>Siap saji</b>, <b>QR baru</b>, <b>Belum lunas</b>, atau <b>Dipesan 19.00</b> (reservasi). Ketuk meja untuk melihat pesanannya dan <b>+ Pesanan untuk Meja N</b> (meja langsung terpilih).</>,
      <>Menagih: <b>Bayar semua</b> (satu kali bayar untuk semua pesanan meja); <b>Bagi rata</b> — isi jumlah orang, tekan <b>Catat bayar 1 orang</b> untuk tiap orang (orang terakhir membayar sisanya); atau <b>Per item</b> — centang yang dimakan satu orang, lalu bayar, ulangi untuk orang berikutnya. Pilih cara bayar (tunai/transfer/QRIS) tiap kali.</>,
      <>Setelah tamu selesai: <b>Tutup meja</b> — semua pesanan meja yang sudah Siap diserahkan (pendapatan tercatat) dan meja kembali Kosong.</>,
      <>Tab <b>Reservasi</b>: <b>+ Reservasi</b> untuk pesanan lewat telepon/WA (nama, jam, jumlah orang, meja bila sudah ditentukan). Tamu juga bisa menekan <b>Reservasi meja</b> di halaman bisnis — masuk sebagai <b>Permintaan</b>: pilih meja › <b>Konfirmasi</b> › <b>WA: konfirmasi</b>. Saat tamu tiba: <b>Tamu datang</b> (permintaan yang tamunya langsung datang: <b>Tamu sudah datang</b>); tidak muncul: <b>Tidak datang</b> — bila ternyata datang terlambat, buka lagi › <b>Ternyata datang (terlambat)</b>.</>,
    ], <>Meja yang sudah dipesan di jam yang bertumpuk ditolak otomatis. Bayar gabungan dicatat sekaligus — bila salah satu gagal, tidak ada yang tercatat; ketukan ganda tidak tercatat dua kali. Diskon/ongkos dibagi sebanding harga saat bayar per item. Tutup meja dengan sisa tagihan menjadikan sisa itu piutang (ada peringatan). Reservasi tanpa uang muka; <b>Dalam rencana</b>: DP reservasi dan pembayaran online.</>, 'warn', <ScrMeja />],
  ]],
  ['N', 'Pendaftaran penghuni online (kos)', [
    ['Calon penghuni daftar sendiri → Anda konfirmasi', 'Halaman bisnis (calon penghuni) › Prospek & tindak lanjut (Anda)', [
      <>Terbitkan <b>Halaman bisnis</b> dan bagikan tautannya (ikon <b>Bagikan</b> di pojok kanan atas). Bila ingin rekening/QRIS tampil di formulir, nyalakan <b>Tampilkan rekening/QRIS di halaman bisnis</b> (menu Halaman bisnis atau Pengaturan › Info untuk penghuni; isinya dari Cara bayar & QRIS di Pengaturan).</>,
      <>Calon penghuni membuka tautan › <b>Daftar / booking kamar</b>: pilih kamar, <b>Booking dulu</b> atau <b>Langsung huni</b> (masuk paling lambat 7 hari lagi), tanggal, nama, No. WhatsApp, alamat asal, kontak darurat, lalu <b>Bayar DP</b> atau <b>Lunas 1 bulan</b>, cara bayar, dan foto bukti transfer (opsional). Yang hanya ingin bertanya memakai tab <b>Tanya dulu</b>.</>,
      <>Pendaftaran masuk ke <b>Prospek & tindak lanjut</b> (email bila diaktifkan). Ketuk › lihat <b>Data pendaftar</b> dan <b>Lihat bukti transfer</b>. Cocokkan dengan mutasi rekening, lalu tekan <b>Uang Rp… sudah masuk → isi</b> (lewati bila belum masuk).</>,
      <><b>Langsung huni</b> › <b>Konfirmasi → masukkan sebagai penghuni</b>: data penghuni (nama, No. HP, alamat, kontak darurat) dibuat otomatis, sewa kamar dimulai, tagihan pertama terbit, (batas bayar bulan pertama bisa Anda pilih bila belum dibayar penuh), dan pembayaran tercatat lunas/sebagian beserta foto buktinya. <b>Booking dulu</b> › <b>Konfirmasi → buat booking</b>: masuk <b>Booking kamar</b> (DP tercatat); saat check-in, data diri pendaftar otomatis menjadi data penghuni.</>,
      <>Tekan <b>Kabari … via WhatsApp</b>, lalu kirim link <b>Portal penghuni</b> dari detail penghuni.</>,
    ], <>Kamar hanya bisa dipilih bila masih kosong di tanggal itu; nomor kontak darurat harus nomor orang lain. Bukti transfer bukan bukti sah sampai Anda cek mutasi — pembayaran hanya tercatat bila Anda mengisinya saat konfirmasi. Konfirmasi hanya bisa sekali (tidak ada penghuni/tagihan dobel). Foto bukti hanya bisa dibuka pemilik & bagian sewa.</>, 'warn', null],
  ]],
  ['O', 'Foto & media', [
    ['Foto kamar, barang, layanan, cover & galeri', 'Menu ☰ › Foto & media · Kamar/Barang/Layanan › + Foto · Halaman bisnis', [
      <>Tempelkan foto langsung di datanya: <b>Kamar</b> › ketuk kamar › <b>+ Foto</b>; <b>Barang</b> › ubah barang › <b>+ Foto</b>; <b>Layanan/Menu</b> › ketuk layanan › <b>+ Foto</b>; <b>Halaman bisnis</b> › <b>Cover</b> (1 foto lebar) dan <b>Galeri</b> (maks 12).</>,
      <><b>+ Foto</b> › <b>Unggah foto baru</b> (📷 Kamera atau 🖼 Galeri, bisa beberapa sekaligus) atau <b>Pilih dari pustaka media</b> (foto yang sudah ada, tanpa unggah ulang). Sebelum menyimpan: pilih rasio (Asli, 1:1, 4:3, 3:4, 16:9), <b>↻ Putar</b>, dan geser posisi agar bagian penting tidak terpotong. Tekan <b>Simpan</b>; bila gagal, tekan Simpan lagi untuk mencoba ulang.</>,
      <>Foto pertama = <b>foto utama</b>: tampil kecil di daftar <b>Kamar</b>, <b>Barang</b>, tombol cepat & hasil cari <b>Kasir</b>, daftar <b>Layanan/Menu</b>, dan tombol pilihan saat <b>terima pesanan</b> — memudahkan mencari dengan cepat. Ketuk foto: <b>Jadikan utama</b>, <b>Ganti foto ini</b> (hanya di tempat ini), atau <b>Lepas</b> (file tetap di pustaka).</>,
      <>Menu <b>Foto & media</b>: semua foto, kuota penyimpanan, filter kategori, pencarian, dan <b>Dipakai di</b> mana saja. <b>Ganti gambar</b> = berlaku di semua tempat yang memakainya. <b>Hapus</b> foto yang masih dipakai meminta konfirmasi dan melepasnya dari semua tempat.</>,
      <>Di halaman bisnis publik: cover di atas, galeri yang bisa digeser, dan foto kecil di samping tiap kamar/barang/layanan — ketuk untuk memperbesar. Foto kamar hanya tampil bila kamar tersedia.</>,
      <><b>Pengaturan › Tampilan Link</b>: pilih <b>Banner Otomatis</b> untuk memprioritaskan foto sesuai halaman, <b>Banner dari Foto Bisnis</b> untuk memprioritaskan cover/galeri, atau <b>Banner Custom</b> untuk mengunggah PNG, JPG, atau WebP (maks. 3 MB). PRASARA menyesuaikan gambar ke 1200 × 630 piksel tanpa memotong desain. Tanpa foto, template memakai warna dan identitas bisnis.</>,
      <>Atur judul, deskripsi, dan warna bila perlu. Pilih jenis halaman di <b>Pratinjau</b>, periksa tampilan saat dibagikan, lalu tekan <b>Simpan tampilan</b>. Nama, logo, dan foto yang diubah dipakai otomatis pada render berikutnya. Aplikasi pesan mungkin masih menyimpan pratinjau lama.</>,
    ], <>Foto di sini bersifat <b>publik</b> (untuk ditampilkan ke pelanggan). Dokumentasi internal — nota, bukti transfer, kondisi kamar/barang — tetap lewat <b>📎 Lampiran</b> di tiap data (privat). Foto dikecilkan di HP sebelum dikirim (maks 1600 px + thumbnail) agar hemat kuota dan cepat dibuka; kuota dihitung bersama lampiran sesuai paket.</>, 'warn', <ScrMedia />],
  ]],
  ['P', 'Analisis Bisnis', [
    ['Membaca Analisis Bisnis', 'Menu Analisis Bisnis (tepat di bawah Beranda; pemilik & bagian keuangan)', [
      <>Buka <b>Analisis Bisnis</b> di menu samping (di HP: ☰ › Analisis Bisnis). Ketuk tombol periode (mis. <b>Bulan ini · 1 – 27 Nov</b>) untuk memilih <b>Hari ini, Minggu ini, Bulan ini, Bulan lalu, Kuartal, Tahun, atau Kustom</b>, pembanding (<b>periode sebelumnya</b> dengan jumlah hari yang sama, <b>tahun lalu</b>, atau tanpa), serta <b>cabang</b> dan <b>kategori produk</b>. Pilihan ini tetap tersimpan saat Anda membuka halaman lain lalu kembali.</>,
      <><b>Skor Kesehatan Bisnis (0–100)</b> = rata-rata berbobot 5 komponen: profitabilitas 25%, likuiditas 20%, pertumbuhan 20%, efisiensi operasional 15%, risiko 20%. Ketuk <b>Lihat Detail Penilaian</b> untuk melihat nilai tiap komponen dan rumusnya. Bila data belum cukup (tanpa pendapatan, kurang dari 5 transaksi, atau kurang dari 3 komponen bisa dinilai) skor <b>tidak ditampilkan</b> — bukan diisi angka kira-kira.</>,
      <>Empat kotak di sampingnya: <b>Pertumbuhan omzet</b>, <b>Margin laba bersih</b>, <b>Efisiensi operasional</b> (100% − biaya operasional ÷ pendapatan), dan <b>Risiko bisnis</b> (Rendah/Sedang/Tinggi dari kas minus, rugi, pendapatan turun &gt;20%, piutang lewat tempo, stok mati). <b>Insight Utama</b> menjelaskan apa yang berubah, <b>penyebabnya dari data</b> (mis. jumlah transaksi vs nilai per transaksi), dan tindakan yang disarankan.</>,
      <>Di bawahnya: <b>Tren Performa</b> (omzet & laba, transaksi, atau pelanggan; 12 bulan atau harian), <b>Laba Rugi</b>, <b>Arus Kas</b> per minggu, lalu kartu yang menyesuaikan jenis bisnis — toko: penjualan per produk, perputaran persediaan, perilaku pelanggan; jasa/kuliner: layanan/menu, produktivitas pesanan; kos: pendapatan per jenis, hunian & penagihan, penghuni masuk/keluar. Di HP bagian ini dipisah dengan tab <b>Tren · Laba Rugi · Arus Kas · Produk · Pelanggan · Tindak Lanjut</b>.</>,
      <><b>Semua angka bisa diketuk</b>: muncul cara hitung, angka pembanding, lalu <b>baris jurnal sumber</b> dengan tautan <b>Bukti</b> (struk, nota, kwitansi, pengeluaran) dan tombol menuju Pembukuan/laporan. Panel <b>Analisis &amp; Tindak Lanjut</b> berisi 8 analisis mendalam: profitabilitas (grafik jembatan laba), arus kas, produk & persediaan, pelanggan, efisiensi (termasuk peta jam ramai di Paket Pro), prediksi & risiko, rekomendasi, serta alokasi laba & investasi (menuju Simulasi investasi di Pembukuan).</>,
      <>Baris tab di bawah judul membuka <b>modul</b> dengan periode yang sama: <b>Laporan Keuangan</b> (laba rugi bertingkat: pendapatan → laba kotor → <b>EBITDA</b> → <b>EBIT</b> → laba bersih; <b>Neraca</b> dengan tanda ✓ Seimbang; <b>Perubahan Ekuitas</b> — ekuitas awal periode, setoran modal, saldo awal, diambil pemilik (prive), laba/rugi periode, sampai ekuitas akhir, dengan tanda ✓ Cocok dengan neraca; <b>Rasio Keuangan</b> — margin, ROA, ROE, rasio lancar/cepat/kas, utang terhadap ekuitas, perputaran, hari persediaan/piutang/utang, siklus konversi kas; riwayat 12 bulan), <b>Arus Kas</b> per aktivitas + arus kas bebas, <b>Pajak</b> (PPN untuk toko, dan <b>PPh final UMKM 0,5%</b>: ketuk <b>Atur profil pajak</b> — jenis wajib pajak, NPWP, tahun terdaftar, bulan mulai; PPh dihitung per bulan dari pendapatan usaha bersih, orang pribadi bebas untuk Rp500 jt pertama per tahun (digabung untuk usaha dengan NPWP sama), dijurnal otomatis, lalu ketuk <b>Setor</b> untuk mencatat setoran; usaha kos wajib mengonfirmasi karena sewa bangunan umumnya kena PPh final 10%), <b>Anggaran</b> (target pendapatan, status persetujuan, proyeksi akhir bulan, dan anggaran vs realisasi per kategori), <b>Skenario</b> (Paket Bisnis: titik awal = rata-rata 3 bulan penuh terakhir di Pembukuan; ubah asumsi Pesimis/Dasar/Optimis — pendapatan, margin kotor, biaya, piutang terlambat, kenaikan bunga, biaya mendadak, untuk kos tingkat hunian, untuk jasa jumlah pesanan — lalu baca laba, kas akhir, kas terendah, bulan kas pertama minus, kebutuhan dana, dan rasio lancar 12 bulan ke depan, plus tujuh <b>stress test</b> seperti pendapatan turun 30% atau pelanggan bayar 60 hari lebih lambat; ketuk <b>Simpan</b> — setiap simpan menjadi versi baru yang tidak bisa diubah, bisa dibuka lagi atau diarsipkan (versi lama tetap dihitung dengan rumus saat disimpan; versi baru: retur mengurangi pendapatan, bunga & cicilan lancar ikut turun saat pinjaman lunas); semua angka ini PROYEKSI, bukan angka aktual), <b>KPI Industri</b> (Paket Bisnis; hanya dari data yang sudah dicatat — laundry/jasa: kiloan, pendapatan per kg, lama proses, siap tepat janji, cuci ulang, keluhan per 100 pesanan, antar-jemput, pesanan dari halaman bisnis, pelanggan kembali; kuliner: rata-rata per pesanan, makan di tempat, pesanan per meja per hari, food cost; kos: hunian rata-rata, uang masuk per kamar, sewa rata-rata, tepat bayar, tunggakan, penghuni masuk/keluar, lama tinggal, booking jadi masuk; toko: lihat Laporan toko › Indikator toko — ketuk KPI untuk cara hitungnya), <b>Investasi &amp; Valuasi</b> (aset tetap, simulasi NPV/IRR, valuasi DCF di Pembukuan, dan <b>Valuasi Multiple &amp; Aset</b> — Paket Bisnis: isi kelipatan bawah/tengah/atas (paling kecil 0,01, maks. 2 angka di belakang koma) atas laba bersih, EBITDA, atau pendapatan setahun <b>beserta sumbernya</b> (mis. penawaran calon pembeli, konsultan) karena PRASARA tidak memakai angka pasar karangan; valuasi aset mulai dari neraca, lalu sesuaikan persen persediaan bernilai, piutang tertagih, nilai pasar tiap aset tetap, dan penyesuaian lain; ketuk Simpan untuk versi baru — semua hasil berlabel ESTIMASI, bukan penilaian resmi), <b>Laporan &amp; Portofolio</b>, dan <b>Peta Modul</b> yang menunjukkan modul mana yang sudah tersedia dan mana yang masih dalam rencana. Ketuk pos laba rugi atau rasio untuk melihat rumus, akun, dan baris jurnalnya.</>,
      <><b>Ekspor</b> membuat Excel atau PDF berisi ringkasan, skor, insight, tren, arus kas, per akun, produk, dan pelanggan sesuai filter (dihitung dalam kuota ekspor). <b>Bagikan</b> mengirim ringkasan teks lewat WhatsApp/aplikasi lain.</>,
    ], <>Paket: <b>Dasar</b> = bulan ini & bulan lalu (ringkasan, skor, laba rugi, arus kas). <b>Bisnis</b> = periode bebas hingga ±1 tahun, tren 12 bulan + <b>proyeksi</b> bulan depan (tren linier, ditandai bukan angka aktual), per akun, produk, pelanggan, persediaan. <b>Pro</b> = filter & perbandingan cabang dan peta jam ramai. Angka uang = jurnal Pembukuan (sebelum pajak), jadi sama dengan laporan keuangan; kas dihitung untuk seluruh bisnis (tidak per cabang); biaya tanpa lokasi tidak masuk cabang mana pun.</>, null, <ScrAnalisis />],
  ]],
  ['Q', 'Riwayat aktivitas', [
    ['Melihat siapa melakukan apa', 'Pengaturan Bisnis › Riwayat aktivitas (semua anggota, sesuai bagiannya)', [
      <>Buka <b>Riwayat aktivitas</b>. Setiap peristiwa penting tercatat otomatis: penjualan & pembatalan, retur, belanja & barang diterima, penyesuaian & mutasi stok, pengeluaran, pelunasan kasbon/utang, tagihan & pembayaran sewa, booking, pesanan jasa per tahap, dan persetujuan.</>,
      <>Pilih bagian (<b>Penjualan & pesanan</b>, <b>Stok & belanja</b>, <b>Uang</b>, <b>Sewa & tagihan</b>) atau isi <b>Tanggal</b>. Tiap baris menunjukkan jenis, jam, ringkasan, <b>siapa yang melakukan</b>, dan nilainya.</>,
      <>Ketuk penjualan untuk membuka struknya, atau pesanan untuk membuka notanya. <b>Muat lebih banyak</b> untuk riwayat lama.</>,
    ], <>Riwayat ditulis oleh database di transaksi yang sama dengan datanya — bila transaksi gagal, riwayatnya juga tidak tercatat — dan tidak bisa diubah atau dihapus siapa pun. Karyawan hanya melihat aktivitas di bagian yang boleh ia buka. Riwayat dimulai sejak fitur ini aktif; transaksi lama tetap ada di menunya masing-masing.</>, null, null],
  ]],
  ['R', 'Grosir: penawaran, pesanan, surat jalan & faktur', [
    ['Penawaran → pesanan → kirim → faktur', 'Transaksi › Pesanan grosir (Retail & Grosir)', [
      <>Tekan <b>+ Penawaran</b>, pilih pelanggan. Kotak di bawahnya menunjukkan <b>piutang</b>, <b>pesanan berjalan</b>, <b>batas kredit</b>, piutang yang <b>lewat jatuh tempo</b>, dan daftar harga yang dipakai.</>,
      <>Cari barang (nama/barcode), isi jumlah & satuan. Harga terisi otomatis: <b>daftar harga pelanggan</b> → harga grosir → harga eceran — boleh diubah sesuai kesepakatan. Isi No. PO pelanggan, tempo bayar, alamat kirim, berlaku sampai bila perlu.</>,
      <><b>Simpan penawaran</b> lalu <b>Kirim WA</b> atau <b>Cetak penawaran</b> (PDF). Bila pelanggan setuju: <b>Pelanggan setuju → jadikan pesanan</b> (atau langsung <b>Simpan & jadikan pesanan</b>). Penawaran & pesanan belum mengubah stok atau uang.</>,
      <>Pesanan yang melewati <b>batas kredit</b> hanya bisa dikonfirmasi pemilik/pengelola dengan <b>alasan</b> (tercatat). Kasir diminta meminta pemilik. Ada piutang terlambat atau stok kurang? Muncul peringatan, pesanan tetap bisa dibuat.</>,
      <>Barang kurang? Buka pesanan terkonfirmasi › <b>Pemenuhan pesanan</b>. Per barang, lihat jumlah <b>Siap</b>, <b>Menunggu supplier</b>, dan <b>Perlu dipesan</b>. Dengan akses Penjualan dan Belanja di lokasi pesanan, tekan <b>+ Pesanan supplier</b>, pilih supplier, cek jumlah dan isi harga beli. Ulangi untuk supplier lain bila perlu.</>,
      <>Saat barang datang, buka <b>Belanja</b> dari pesanan supplier terkait dan tekan <b>Terima barang</b>. Isi jumlah yang benar-benar datang. Kembali ke pesanan pelanggan untuk melihat pembaruan. Bila supplier membatalkan sisa, tutup sisa di Belanja agar kekurangannya bisa dipesan ulang.</>,
      <>Saat barang berangkat: <b>Buat surat jalan</b>. Untuk pesanan yang terhubung ke supplier, jumlah awal mengikuti stok siap di lokasi pesanan. Kurangi bila dikirim bertahap. Pilih <b>Piutang (tempo)</b>, <b>Tunai</b>, atau <b>Transfer</b>, isi sopir & kendaraan. Stok berkurang dan <b>faktur</b> terbit otomatis (sama dengan transaksi Kasir: masuk laporan, PPN, dan pembukuan).</>,
      <>Cetak <b>Surat jalan</b> (tanpa harga, ada kolom cek & tanda tangan) dan <b>Faktur</b> (harga, jatuh tempo, rekening). Barang sampai: <b>Sudah diterima</b> + nama penerima. Gagal kirim: <b>Gagal kirim</b> + alasan → faktur dibatalkan, stok & piutang kembali, sisa bisa dikirim ulang (pemilik/keuangan).</>,
      <>Pelanggan tidak jadi ambil sisanya? <b>Tutup sisa</b> (alasan wajib). Pembayaran piutang dicatat di <b>Kas & kasbon</b> seperti biasa; pembayaran melunasi faktur terlama lebih dulu.</>,
    ], <>Stok bertambah saat penerimaan di Belanja dan berkurang saat surat jalan dibuat. Sisa pesanan supplier tetap perlu ditinjau di Belanja bila pesanan pelanggan dibatalkan atau ditutup.</>, 'warn', <ScrGrosir />],
    ['Batas kredit, tempo & daftar harga pelanggan', 'Pelanggan & supplier › ketuk pelanggan › Syarat pelanggan · Pesanan grosir › Daftar harga', [
      <>Buka pelanggan › <b>Syarat pelanggan (grosir)</b>: isi <b>Batas kredit</b> (kosong = tanpa batas), <b>Tempo bayar</b> (hari), <b>Daftar harga khusus</b>, alamat kirim, NPWP, lalu <b>Simpan syarat</b> (pemilik/keuangan).</>,
      <>Di bawahnya tampil faktur yang belum lunas beserta <b>jatuh tempo</b> atau <b>lewat tempo … hari</b>.</>,
      <>Daftar harga: <b>Pesanan grosir › Daftar harga</b> › buat (mis. <b>Reseller</b>) › isi harga khusus per barang & satuan (ketuk di luar kolom untuk menyimpan; kosongkan = harga biasa). Pasangkan ke pelanggan lewat Syarat pelanggan.</>,
    ], null, null, null],
  ]],
  ['S', 'Kedaluwarsa & saran belanja', [
    ['Mencatat & memantau tanggal kedaluwarsa', 'Barang & stok › Ubah barang · Belanja · Barang › Kedaluwarsa', [
      <>Buka barang yang bisa kedaluwarsa (susu, roti, obat, makanan) › <b>Ubah</b> › centang <b>Catat tanggal kedaluwarsa</b> › simpan. Stok yang sudah ada dicatat sebagai <b>tanggal belum diisi</b>.</>,
      <>Saat <b>+ Belanja</b> atau <b>Terima barang</b>, isi <b>Tanggal kedaluwarsa</b> dan <b>No. batch</b> (opsional) per baris. Datang dua tanggal? Tambahkan barang yang sama dua kali dengan tanggal berbeda.</>,
      <>Penjualan, pemakaian, retur ke supplier, dan mutasi stok <b>otomatis mengambil yang paling cepat kedaluwarsa</b> lebih dulu — kasir tidak perlu memilih. Mutasi membawa tanggalnya ke lokasi tujuan.</>,
      <>Buka <b>Barang › Kedaluwarsa</b>: ringkasan <b>sudah kedaluwarsa</b>, <b>≤ 30 hari lagi</b>, dan <b>tanggal belum diisi</b>, beserta nilai modalnya. Saring ≤ 30 hari, ≤ 60 hari, atau semua batch.</>,
      <>Ketuk batch untuk <b>Ubah tanggal</b>, <b>Pisahkan sebagian</b> (stok lama berisi dua tanggal), atau <b>Buang</b> (kedaluwarsa/rusak) — stok berkurang dan kerugiannya tercatat.</>,
    ], <>Barang yang sudah lewat tetap bisa terjual di Kasir — singkirkan dari rak lalu tekan Buang. Membuang bisa perlu persetujuan pemilik sesuai pengaturan Persetujuan.</>, 'warn', null],
    ['Saran belanja ulang', 'Belanja › Saran belanja', [
      <>Tekan <b>Saran belanja</b> dan cek lokasi kerja. Untuk toko retail, pilih target stok <b>1 minggu / 2 minggu / 1 bulan</b> setelah barang datang. <b>Pesan sekarang</b> memuat kebutuhan yang mendesak. <b>Terjadwal</b> menampilkan perkiraan tanggal pesan.</>,
      <>Buka <b>Dasar saran belanja</b> untuk melihat pemakaian bersih 30 hari, stok fisik, barang yang dipesan pelanggan atau ditahan, perkiraan kedatangan PO, dan waktu tunggu supplier. Perkiraan waktu pesan memakai cadangan 2 hari.</>,
      <>Buka <b>Perlu dicek</b> untuk pesanan dengan jadwal yang belum pasti atau batas stok yang bentrok dengan minimal pesan. Ketuk <b>Buka PO</b> lalu isi atau ubah perkiraan datang supaya pesanan yang sama ikut dihitung dengan tanggal yang benar.</>,
      <>Centang dan ubah jumlah bila perlu, lalu pilih <b>Siapkan pesanan</b>. Formulir PO terbuka dengan barang dan jumlah sudah terisi. Cek kembali supplier, harga, dan tanggal sebelum menyimpan.</>,
    ], <>Atur waktu tunggu di <b>Barang › Ubah › Harga dari supplier</b> atau pada barang. Perkiraan standar 3 hari dipakai jika keduanya kosong. Pesanan tanpa tanggal atau yang terlambat perlu dicek sebelum membuat pesanan tambahan.</>, null, null],
  ]],
  ['T', 'SDM: absensi, jadwal shift & gaji', [
    ['Data karyawan & jadwal shift', 'Menu ☰ › SDM & gaji › Karyawan · Jadwal', [
      <>Buka <b>SDM & gaji › Karyawan › + Tambah karyawan</b>. Isi nama, jabatan, No. HP, dan <b>sistem gaji</b>: <b>Bulanan</b> (gaji pokok per bulan), <b>Harian</b> (per hari hadir), atau <b>Per jam</b>. Tambahkan tunjangan tetap, upah lembur per jam, jam kerja per hari, tanggal mulai kerja, dan rekening gaji.</>,
      <>Karyawan yang tidak memakai aplikasi (gudang, kebersihan) tetap dicatat di sini. Yang punya akun (undang dulu di menu <b>Karyawan</b>) bisa ditautkan lewat <b>Akun aplikasi</b> agar bisa absen sendiri dari HP.</>,
      <>Tab <b>Jadwal</b> › <b>Atur jadwal</b>: pilih Pagi / Siang / Malam / Libur (jam bisa diubah), centang beberapa karyawan dan beberapa tanggal sekaligus, lalu Simpan. Ketuk satu hari untuk mengubah jadwal satu orang.</>,
    ], <>Karyawan berhenti: isi tanggal <b>Berhenti</b> dan hapus centang <b>Masih bekerja</b>. Datanya tetap tersimpan untuk riwayat gaji.</>, null, <ScrSDM />],
    ['Absensi harian', 'SDM & gaji › Absen saya · Absensi', [
      <>Karyawan yang akunnya ditautkan membuka <b>SDM & gaji</b> lalu tekan <b>Absen masuk</b> saat datang dan <b>Absen pulang</b> saat selesai. Lupa pulang kemarin? Tombol pulang menutup absen kemarin.</>,
      <>Pengelola membuka tab <b>Absensi</b>: pilih tanggal (‹ ›), ketuk <b>Hadir / Izin / Sakit / Alpa / Libur</b> untuk yang belum tercatat, atau ketuk status untuk mengoreksi jam masuk/pulang, lembur, dan catatan.</>,
      <>Lembur dihitung otomatis dari jam kerja melebihi jadwal (atau jam kerja per hari bila tanpa jadwal); bisa diisi manual.</>,
    ], null, null, null],
    ['Kasbon & penggajian', 'SDM & gaji › Gaji', [
      <><b>+ Kasbon</b>: pilih karyawan, jumlah, diambil dari kas/bank. Tercatat sebagai pengeluaran <b>Gaji karyawan</b> saat diberikan dan otomatis dipotong saat gajian.</>,
      <>Pilih bulan › <b>Hitung gaji</b>. Sistem menghitung dari data karyawan & absensi: bulanan penuh (prorata bila mulai/berhenti di tengah bulan), harian × hari hadir, per jam × jam kerja, ditambah tunjangan dan lembur, dikurangi kasbon.</>,
      <>Ketuk nama untuk menambah <b>bonus</b>, <b>potongan</b> (mis. alpa, denda), atau mengubah potongan kasbon. Absensi berubah? <b>Hitung ulang</b> — bonus & potongan tetap.</>,
      <>Pilih dari Kas atau Bank lalu <b>Bayar gaji</b>: satu pengeluaran <b>Gaji karyawan</b> sebesar total dibayar, masuk laporan dan pembukuan. Buka <b>Slip ›</b> untuk mencetak/PDF atau <b>Kirim WA</b> ke karyawan; karyawan yang tertaut melihat slipnya sendiri di Absen saya.</>,
    ], <>Salah hitung setelah dibayar? <b>Batalkan penggajian</b> (alasan wajib): pengeluarannya ikut dihapus dan kasbon kembali belum dipotong, lalu hitung ulang. Pengeluaran gaji tidak bisa dihapus dari menu Pengeluaran. Kasir/staf lain tidak bisa melihat data gaji.</>, 'warn', null],
  ]],
  ['U', 'Aset tetap & penyusutan', [
    ['Mencatat aset & penyusutan otomatis', 'Keuangan › Aset tetap', [
      <>Aset = barang yang dipakai usaha bertahun-tahun (motor, kulkas, mesin, etalase, komputer, bangunan). Tekan <b>+ Tambah aset</b> lalu pilih <b>Baru dibeli</b> (isi harga, tanggal, dibayar dari kas/bank — tercatat sebagai pengeluaran modal) atau <b>Sudah dimiliki</b> (isi perkiraan nilai sekarang; tidak ada uang keluar).</>,
      <>Sudah pernah mencatat pembeliannya di Pengeluaran sebagai <b>Modal / investasi</b>? Ia muncul di kotak <b>Pengeluaran modal yang belum dicatat sebagai aset</b> — tekan <b>Jadikan aset</b>.</>,
      <>Isi <b>Umur manfaat</b> (tombol 1/2/4/8/20 tahun atau ketik bulan) dan, bila ada, <b>nilai sisa</b>. Langsung tampil hitungannya, mis. "Penyusutan Rp 500.000 per bulan selama 2 tahun". Tanah: hapus centang <b>Disusutkan tiap bulan</b>.</>,
      <>Tiap bulan yang sudah lewat, sistem mencatat penyusutan sendiri ke <b>Pembukuan</b> (Beban penyusutan) — Anda tidak perlu menekan apa pun. Di daftar terlihat <b>nilai buku</b>, penyusutan per bulan, dan sisa bulan tiap aset.</>,
    ], <>Penyusutan <b>bukan uang keluar</b>: saldo kas tidak berubah (uangnya sudah keluar saat membeli) dan tidak muncul di menu Pengeluaran. Ia mengurangi laba di Pembukuan dan Analisis bisnis agar harga aset tidak membebani satu bulan saja. Mengubah umur/nilai sisa otomatis mengoreksi jurnalnya.</>, null, <ScrAset />],
    ['Menjual, membuang, atau menghapus aset', 'Aset tetap › ketuk aset', [
      <>Ketuk aset › <b>Jual / lepas aset</b>. Pilih <b>Dijual</b> (isi uang diterima & masuk ke kas/bank), <b>Dibuang / rusak</b>, atau <b>Hilang</b>, serta tanggalnya.</>,
      <>Sebelum disimpan tampil selisihnya terhadap nilai buku: <b>untung</b> (masuk Pendapatan lain) atau <b>rugi</b> (Beban non-operasional). Penyusutan berhenti sejak bulan itu.</>,
      <>Salah pilih? Buka tab <b>Sudah dilepas</b> › ketuk aset › <b>Batalkan pelepasan</b>. Salah catat aset? <b>Hapus (salah catat)</b> dengan alasan.</>,
    ], <>Pengeluaran pembelian aset tidak bisa dihapus dari menu Pengeluaran selama asetnya masih terdaftar — hapus asetnya dulu dari Aset tetap. Aset yang dibuat lewat "Baru dibeli" ikut menghapus pengeluarannya; yang berasal dari "Jadikan aset" pengeluarannya tetap ada.</>, 'warn', null],
  ]],
  ['V', 'Kuliner & jasa: resep, biaya bahan (food cost)', [
    ['Mengisi resep per menu / bahan per layanan', 'Stok › Resep & food cost (jasa lain: Bahan per layanan)', [
      <>Catat dulu bahannya di <b>Bahan & stok</b> dengan satuan utama dan satuan takarannya (mis. Beras: utama kg + satuan gram; Minyak: liter + ml; Telur: butir) serta harga modalnya.</>,
      <>Buka <b>Resep & food cost</b>, ketuk menu (atau dari <b>Menu & tahap</b> › ubah menu › <b>Atur resep & biaya bahan</b>). Tekan <b>+ Tambah bahan</b>, pilih bahan, isi <b>jumlah dipakai</b> untuk 1 porsi dan satuannya — mis. Beras 150 gram, Telur 1 butir, Minyak 20 ml.</>,
      <>Di bawah tiap bahan tampil hitungannya ("= 0,15 kg · Rp 1.800"), dan di bagian bawah: <b>biaya bahan per porsi</b>, <b>persen dari harga jual</b>, dan <b>untung kotor</b>. Simpan.</>,
      <>Daftar menu menampilkan persen biaya bahan (hijau ≤ 35%, kuning 35–45%, merah di atas 45%), untung per porsi, dan <b>cukup untuk berapa porsi</b> dari stok sekarang; bahan yang kurang disebut namanya.</>,
    ], <>Laundry/jasa lain memakai cara yang sama untuk <b>bahan per layanan</b>, mis. Cuci kiloan: deterjen 30 ml + pewangi 10 ml per kg. Aktifkan modul <b>Resep & biaya bahan</b> di Konfigurasi › Modul (Kuliner sudah aktif).</>, null, <ScrResep />],
    ['Bahan terpotong otomatis & laporan food cost', 'Pesanan selesai → stok · Resep & food cost › Laporan biaya bahan', [
      <>Saat pesanan <b>selesai</b> (diserahkan ke pelanggan), bahan sesuai resep × jumlah porsi langsung terpotong dari stok dan tercatat di riwayat bahan sebagai "Resep · pesanan …". Tidak perlu mencatat pemakaian satu per satu.</>,
      <>Tab <b>Laporan biaya bahan</b> (7 hari / bulan ini / 30 hari): biaya bahan terpakai, <b>food cost %</b> (biaya bahan ÷ penjualan), dan rinciannya per menu beserta untungnya.</>,
      <>Bahan tumpah, basi, atau rusak: catat di <b>Bahan & stok</b> › Stok › Rusak/Kedaluwarsa — muncul sebagai <b>Bahan terbuang</b> di laporan.</>,
    ], <>Stok bahan kurang <b>tidak menghalangi</b> pesanan selesai: stoknya menjadi minus dan ditandai agar Anda belanja atau hitung ulang. Biaya bahan tiap pesanan memakai harga modal saat itu; mengubah resep hanya berlaku untuk pesanan berikutnya. Staf dapur (operator) tidak melihat biaya.</>, 'warn', null],
  ]],
  ['W', 'Toko: promo & bundling', [
    ['Membuat promo', 'Transaksi › Promo & bundling', [
      <>Tekan <b>+ Promo</b>, beri nama (tampil di kasir & struk), lalu pilih jenisnya: <b>Diskon barang</b> (persen untuk barang tertentu atau semua), <b>Beli X gratis Y</b> (mis. beli 2 gratis 1 untuk barang & satuan yang sama), <b>Paket bundling</b> (beberapa barang dengan harga paket), atau <b>Minimal belanja</b> (mis. belanja Rp 100.000 potong Rp 5.000).</>,
      <>Isi rinciannya; hitungannya langsung tampil — mis. "Pembeli mengambil 3, membayar 2 (hemat Rp 3.500; setara diskon 33,3%)" atau "Harga biasa Rp 34.000 → paket Rp 30.000 · hemat Rp 4.000".</>,
      <>Atur <b>Berlaku</b>: tanggal mulai & sampai (kosong = tanpa batas), hari tertentu (mis. Sabtu–Minggu), dan untuk harga eceran, grosir, atau keduanya. Simpan.</>,
      <>Daftar promo menunjukkan statusnya (Berjalan / Terjadwal / Berakhir / Dimatikan), berapa kali dipakai, dan total potongannya. Ketuk promo untuk mengubah, mematikan, atau menghapus.</>,
    ], <>Sistem menolak promo yang merugikan tanpa sengaja: harga paket yang tidak lebih murah, gratis lebih banyak dari beli, dan potongan rupiah di atas setengah minimal belanja.</>, null, <ScrPromo />],
    ['Promo di Kasir & struk', 'Kasir › Bayar', [
      <>Kasir tidak perlu mengingat promo. Saat <b>Bayar</b>, promo yang berlaku hari itu muncul sendiri di bawah Subtotal ("Promo · Mie beli 2 gratis 1 −Rp 7.000") dan Total langsung berkurang.</>,
      <>Untuk Beli X gratis Y, masukkan seluruh barang yang dibawa pembeli (mis. 3 pcs untuk beli 2 gratis 1) — yang gratis dipotong otomatis dan stoknya tetap berkurang 3.</>,
      <>Kolom <b>Diskon tambahan</b> tetap bisa diisi manual di luar promo. Struk (cetak/WA) mencantumkan nama tiap promo.</>,
    ], <>Satu barang hanya kena satu promo (urutan: paket → beli X gratis Y → diskon barang → minimal belanja). Barang yang harganya diubah manual di kasir dan pengiriman Pesanan grosir tidak ikut promo. Potongan promo mengurangi penjualan di laporan dan pembukuan, sama seperti diskon; PPN dihitung dari harga setelah promo.</>, 'warn', null],
  ]],
  ['X', 'Pembelian: permintaan, faktur supplier & PPN masukan', [
    ['Permintaan pembelian', 'Belanja › tab Permintaan', [
      <>Staf yang tahu barang menipis menekan <b>+ Permintaan</b>, mencari barangnya, mengisi jumlah, satuan, dan keterangan (mis. "stok tinggal 2"), lalu <b>Kirim permintaan</b>. Stok dan uang belum berubah.</>,
      <>Pemilik atau bagian keuangan membuka permintaan itu: terlihat stok sekarang dan harga beli terakhir tiap barang. Tekan <b>Setujui</b>, atau <b>Tolak</b> dengan alasan agar pemohon tahu.</>,
      <>Permintaan yang disetujui: tekan <b>Buat pesanan ke supplier</b>, pilih supplier, sesuaikan jumlah/harga bila perlu, lalu simpan. Pesanannya muncul di tab <b>Belanja</b> berstatus Dipesan, dan diterima seperti biasa (Terima barang).</>,
    ], <>Permintaan tidak wajib. Toko yang dikelola sendiri tetap bisa langsung <b>+ Belanja</b> seperti biasa.</>, null, null],
    ['Faktur supplier & pencocokan', 'Belanja › tab Faktur supplier (atau buka belanja › Faktur supplier)', [
      <>Bagian atas menampilkan belanja yang <b>barangnya sudah diterima tetapi fakturnya belum dicatat</b>. Ketuk, lalu <b>+ Catat faktur</b>: isi nomor faktur dari supplier, tanggal, jatuh tempo, serta jumlah dan harga yang ditagih per barang (sudah terisi sesuai barang yang diterima).</>,
      <>Tekan <b>Simpan & cocokkan</b>. Tiap barang dibandingkan tiga arah: <b>Dipesan</b> · <b>Diterima</b> · <b>Ditagih</b>. Hasilnya <b>Cocok</b>, <b>Ada selisih</b> (harga atau jumlah berbeda), atau <b>Menunggu barang</b> (ditagih lebih banyak dari yang sudah diterima).</>,
      <>Faktur <b>Cocok</b> → <b>Posting faktur</b>. Faktur <b>Ada selisih</b> hanya bisa diposting pemilik/pengelola dengan mengisi alasan; selisih harganya dicatat sendiri di pembukuan (Selisih harga pembelian).</>,
      <>Bila faktur menambah tagihan (PPN atau selisih harga), pilih: <b>jadi utang ke supplier</b> atau <b>sudah dibayar</b> dari Kas/Bank.</>,
    ], <>Faktur yang sama persis dengan barang diterima <b>tidak mengubah utang</b> — nilainya sudah tercatat saat barang diterima; faktur menjadi bukti cocok. Faktur "Menunggu barang" tetap tersimpan sebagai draf dan diposting setelah barangnya datang. Nomor faktur yang sama dari supplier yang sama ditolak agar tidak tercatat dua kali. Belanja yang fakturnya sudah diposting tidak bisa dibatalkan sebelum fakturnya dibatalkan.</>, 'warn', <ScrFaktur />],
    ['PPN masukan & kinerja supplier', 'Faktur supplier › PPN · Laporan toko › PPN · Belanja › Kinerja supplier', [
      <>Bila PPN aktif (Pengaturan › Pajak (PPN)), centang <b>Faktur ini memuat PPN</b> saat mencatat faktur. Nilainya dihitung dari tarif Anda dan bisa disesuaikan dengan angka di faktur; isi juga nomor faktur pajaknya.</>,
      <>Di <b>Laporan toko</b>, bagian PPN kini menampilkan PPN keluaran, <b>PPN masukan</b> dari faktur supplier, dan selisihnya: <b>kurang bayar</b> atau <b>lebih bayar</b> bulan itu.</>,
      <>Tab <b>Kinerja supplier</b> merangkum tiap supplier: nilai belanja, datang tepat waktu, barang terpenuhi, rata-rata menunggu, retur, dan berapa faktur yang berselisih.</>,
    ], <>PPN masukan dicatat <b>di atas harga belanja</b>: isi harga barang di Belanja tanpa PPN, lalu PPN-nya di faktur. Bila usaha Anda bukan PKP, PPN dari supplier dimasukkan ke harga barang dan tidak dicatat terpisah. Angka ini bahan pelaporan — pastikan dengan konsultan pajak Anda.</>, 'warn', null],
  ]],
  ['Y', 'Toko: konsinyasi (titip jual)', [
    ['Menerima barang titipan', 'Stok › Konsinyasi › + Terima titipan', [
      <>Untuk barang yang <b>dititipkan orang lain</b> di toko Anda (keripik, kue, kerajinan): barangnya bukan milik toko, dan Anda baru membayar setelah laku.</>,
      <>Barang titipan baru dibuat dulu di <b>Barang & stok</b> dengan <b>stok awal 0</b> dan harga jualnya. Lalu di <b>Konsinyasi</b> tekan <b>+ Terima titipan</b>, pilih penitip (atau ketik nama penitip baru), pilih barangnya, isi <b>jumlah</b> dan <b>harga titip</b> — yaitu yang nanti Anda setor ke penitip per satuan.</>,
      <>Di bawah tiap barang tampil "Harga jual Rp 10.000 · laba toko Rp 3.000 per pcs". Simpan: stok bertambah, tetapi <b>belum ada utang</b>.</>,
    ], <>Barang titipan tidak bisa dibeli lewat Belanja dan tidak diberi stok awal. Barang milik toko yang sudah punya riwayat stok tidak bisa diubah jadi titipan — buat barang baru. Titipan berikutnya dengan harga titip berbeda dihitung rata-rata.</>, 'warn', <ScrKonsinyasi />],
    ['Menjual, menyetor & mengembalikan', 'Kasir · Konsinyasi › ketuk penitip', [
      <>Jual lewat <b>Kasir</b> seperti barang lain. Setiap barang titipan yang terjual otomatis menambah <b>Harus disetor</b> sebesar harga titipnya; retur dan pembatalan menguranginya lagi.</>,
      <>Ketuk nama penitip untuk melihat tiap barangnya: diterima, dikembalikan, terjual, sisa di toko, dan yang harus disetor periode ini.</>,
      <>Tekan <b>Setor ke penitip</b>, isi jumlah (boleh sebagian), pilih Tunai atau Transfer. Setoran juga terlihat di Kas & kasbon › Utang supplier dan di Kontak penitip.</>,
      <>Barang tidak laku dibawa pulang penitip: tekan <b>Kembalikan barang</b>, isi jumlahnya. Stok berkurang dan tidak perlu disetor.</>,
    ], <>Barang titipan yang <b>rusak, kedaluwarsa, atau hilang</b> di toko (dicatat di Barang & stok › Stok) dihitung harus disetor juga, karena menjadi tanggungan toko. Bila penitip sendiri yang menanggung, catat sebagai <b>Kembalikan barang</b>. Di pembukuan, titipan yang belum terjual tercatat sebagai Titipan konsinyasi (bukan utang), dan laba toko = harga jual − harga titip.</>, 'warn', null],
  ]],
  ['Z', 'Toko: kategori, varian, tutup harian & indikator', [
    ['Kategori barang', 'Barang & stok › Atur kategori', [
      <>Ketuk <b>+ Kategori</b> (atau <b>Atur kategori</b>) di bawah kolom cari, ketik nama (mis. Sembako, Minuman, Rokok), lalu <b>Tambah</b>.</>,
      <>Ketuk <b>Pilih barang</b> di samping kategori, centang barang-barangnya, lalu Simpan. Bisa juga dari <b>Ubah</b> barang › Kategori.</>,
      <>Tombol kategori muncul di Barang & stok dan di <b>Kasir</b> untuk menyaring daftar barang. Laporan toko menampilkan penjualan per kategori.</>,
    ], <>Menghapus kategori tidak menghapus barangnya — barang menjadi "Tanpa kategori".</>, null, null],
    ['Barang dengan varian (ukuran, warna, rasa)', 'Barang & stok › + Varian', [
      <>Tekan <b>+ Varian</b>, isi nama barang (mis. Kaos Polos), satuan utama, kategori, harga modal, dan harga jual.</>,
      <>Di <b>Pilihan varian</b>, isi nama pilihan dan isinya dipisah koma — mis. Warna: <i>Hitam, Putih</i> dan Ukuran: <i>S, M, L</i>. Semua kombinasi langsung tampil (Hitam / S, Hitam / M, …).</>,
      <>Untuk tiap kombinasi: hilangkan centang yang tidak dijual, ubah harga bila berbeda (mis. ukuran XL lebih mahal), isi stok sekarang dan kode/barcode. Ada satuan lain (mis. Lusin isi 12)? Isi di bagian <b>Satuan jual lain</b>. Simpan.</>,
      <>Menambah ukuran/warna baru nanti: buka salah satu varian › <b>Ubah</b> › <b>+ Tambah varian lain</b>.</>,
    ], <>Tiap varian adalah barang tersendiri dengan stok, harga modal, dan barcode sendiri, bernama "Kaos Polos — Hitam / L". Kasir, Belanja, promo, dan laporan bekerja seperti biasa. Setiap varian dihitung satu barang untuk batas paket.</>, 'warn', <ScrVarian />],
    ['Tutup harian', 'Transaksi › Tutup harian', [
      <>Setelah selesai berjualan, buka <b>Tutup harian</b>. Terlihat penjualan bersih, laba kotor, rata-rata belanja, rincian promo/diskon/retur, cara bayar, kasbon, pembatalan, per kasir, shift, dan <b>saldo kas menurut catatan</b>.</>,
      <>Hitung uang tunai, isi di <b>Uang tunai yang dihitung</b> (opsional) — selisihnya langsung tampil — tambahkan catatan bila perlu, lalu <b>Tutup hari</b>.</>,
      <>Riwayat di bawah menyimpan setiap hari yang ditutup. Bila ada transaksi tanggal itu yang dibatalkan, diretur, atau ditambah setelah ditutup, hari itu ditandai <b>Berubah</b>; buka lalu <b>Tutup ulang</b>.</>,
    ], <>Tutup harian adalah rekap dan bukti, bukan kunci: transaksi tetap bisa dikoreksi bila memang perlu. Bila ada beberapa lokasi, tutup harian dicatat untuk lokasi kerja Anda (kotak 📍). Hanya pemilik/bagian keuangan.</>, null, null],
    ['Indikator toko', 'Laporan toko › Indikator toko', [
      <>Di bawah laporan bulanan: <b>rata-rata belanja per transaksi</b>, jenis barang per transaksi, margin kotor, <b>perputaran persediaan</b> (berapa kali stok habis terjual dan diganti; disertai perkiraan stok cukup berapa hari), barang yang stoknya habis, susut (rusak & kedaluwarsa), dan pembatalan.</>,
      <><b>Per kasir</b>: jumlah transaksi, rata-rata, retur, pembatalan, dan selisih laci di shift. Pembatalan, retur, atau selisih yang sering pada satu orang patut diperiksa.</>,
      <>Penjualan dan laba <b>per kategori</b> serta <b>per varian</b> (mis. ukuran mana yang paling laku).</>,
    ], <>Semua angka dihitung dari transaksi dan kartu stok yang tercatat; barang titipan konsinyasi tidak ikut dalam nilai persediaan.</>, null, null],
  ]],
  ['AA', 'Toko: harga beli banyak, stok minus, komisi & pemeriksaan', [
    ['Harga beli banyak (harga per jumlah)', 'Barang & stok › Ubah › Harga beli banyak', [
      <>Buka barang › <b>Ubah</b> › <b>Harga beli banyak</b>. Pilih satuannya bila ada beberapa (mis. pcs dan Dus).</>,
      <>Isi <b>Beli minimal</b> dan <b>Harga per satuan</b> — mis. beli 10 pcs ke atas Rp 9.500, beli 50 ke atas Rp 9.000. Pilih berlaku untuk eceran & grosir, hanya eceran, atau hanya grosir. Simpan.</>,
      <>Di <b>Kasir</b>, saat jumlah di keranjang mencapai batasnya, harga turun otomatis dan muncul tulisan "Harga beli banyak". Daftar barang menampilkan tingkat harganya.</>,
    ], <>Kasir selalu memakai harga yang <b>lebih murah</b> antara harga biasa dan harga beli banyak. Harga yang diubah manual di Kasir dan di Pesanan grosir tidak ikut; promo tetap dihitung sesudahnya. Hanya pemilik/bagian keuangan yang bisa mengatur.</>, null, <ScrBeliBanyak />],
    ['Aturan stok minus', 'Pengaturan › Stok minus di Kasir', [
      <><b>Izinkan</b> (bawaan, seperti sebelumnya): barang tetap bisa dijual walau stok tercatat habis; stok menjadi minus dan bisa dibetulkan nanti.</>,
      <><b>Izinkan + peringatan</b>: Kasir melihat peringatan jelas saat menambah barang yang stoknya tidak cukup, tetapi tetap bisa menjual.</>,
      <><b>Tolak</b>: penjualan ditolak bila stok di lokasi itu tidak cukup — catat dulu barang masuk atau mutasi stok. Berlaku juga untuk surat jalan grosir.</>,
    ], <>Pilih Tolak hanya bila semua barang masuk selalu dicatat rapi; bila tidak, kasir bisa tertahan saat pembeli menunggu. Aturan ini tidak memengaruhi penyesuaian stok, pemakaian bahan, atau resep.</>, 'warn', null],
    ['Komisi kasir', 'Transaksi › Komisi kasir', [
      <>Tekan <b>+ Aturan</b>: pilih untuk siapa (semua kasir atau satu orang), barang (semua atau satu kategori), dan persen komisinya, lalu Simpan. Bila beberapa aturan cocok, yang paling khusus dipakai.</>,
      <>Pilih bulan: tiap kasir terlihat <b>penjualan bersih</b> (tanpa PPN, setelah diskon, promo, dan retur) dan komisinya.</>,
      <>Untuk membayar: buat dulu <b>draf gaji</b> bulan itu di SDM & gaji › Gaji, lalu kembali ke sini dan tekan <b>Masukkan komisi ke draf gaji</b>. Komisi masuk sebagai bonus di baris gaji orangnya, lalu dibayar bersama gaji.</>,
    ], <>Komisi hanya bisa masuk ke gaji bila akun kasir sudah <b>ditautkan</b> di data karyawan (SDM & gaji › Karyawan). Komisi tiap orang per bulan dimasukkan sekali saja. Penjualan yang dibatalkan tidak dihitung.</>, 'warn', <ScrKomisi />],
    ['Perlu diperiksa (pencegahan kehilangan)', 'Laporan toko › Perlu diperiksa', [
      <>Di bawah Indikator toko, daftar temuan bulan ini: harga diubah manual <b>di bawah modal</b>, <b>diskon manual</b> lebih dari 20%, kasir dengan <b>banyak pembatalan</b> atau <b>laci kurang</b> berulang, barang dengan <b>susut/selisih hitung</b> terbesar, dan hari yang <b>berubah setelah ditutup</b>.</>,
      <>Cek tiap temuan ke orangnya atau ke catatan transaksi (Penjualan, Shift kasir, Tutup harian).</>,
    ], <>Temuan dibuat dengan aturan tetap supaya mudah dicek — bukan tuduhan. Banyak temuan punya alasan wajar, misalnya harga khusus pelanggan tetap atau barang rusak.</>, null, null],
  ]],
  ['AB', 'Toko: stok yang bisa dijual, barang ditahan, kiriman & kesehatan stok', [
    ['Stok dipesan & stok yang bisa dijual', 'Pesanan grosir · Kasir · Barang & stok', [
      <>Saat penawaran grosir <b>dikonfirmasi jadi pesanan</b>, sisa barang yang belum dikirim otomatis <b>disisihkan (dipesan)</b>. Di detail pesanan terlihat apakah stok tersedia cukup.</>,
      <>Di Barang & stok muncul tulisan <b>Bisa dijual … · dipesan … · ditahan …</b> pada barang yang sebagian stoknya sudah dipesan atau ditahan.</>,
      <>Di Kasir, peringatan "melebihi stok" memakai stok yang <b>bisa dijual</b> (stok − dipesan − ditahan). Bila aturan stok minus = Tolak, penjualan yang memakai barang pesanan pelanggan grosir ditolak.</>,
      <>Begitu surat jalan dibuat, barang yang dikirim tidak lagi dihitung dipesan. Pesanan yang dibatalkan/ditutup melepas sisanya otomatis.</>,
    ], <>Stok fisik tidak berubah karena pesanan — yang berubah hanya angka "bisa dijual". Nilai persediaan di laporan tetap memakai stok fisik.</>, null, null],
    ['Barang ditahan (rusak, karantina, retur rusak)', 'Barang & stok › Stok › Pisahkan · Penjualan › Retur', [
      <>Barang rusak tapi belum pasti dibuang: buka <b>Stok</b> pada barang › alasan <b>Pisahkan: rusak / karantina</b>, pilih Rusak / Karantina / Perlu diperiksa, isi jumlah, Simpan.</>,
      <>Pelanggan mengembalikan barang rusak: saat <b>Retur barang</b>, centang <b>Barang rusak</b> — stok tetap bertambah tetapi langsung masuk daftar ditahan.</>,
      <>Buka Barang & stok › <b>Kesehatan stok</b> › Barang ditahan, ketuk barangnya, lalu pilih: <b>Bisa dijual lagi</b>, <b>Buang (rusak/kedaluwarsa)</b>, atau <b>Sudah diretur</b> (bila sudah dikembalikan ke supplier lewat Belanja). Boleh sebagian.</>,
    ], <>Barang ditahan tetap dihitung di stok & nilai persediaan sampai diputuskan. Membuang barang mengurangi stok dan nilainya menjadi beban; bila ada aturan persetujuan Penyesuaian stok, hanya pemilik yang bisa membuang.</>, 'warn', null],
    ['Mutasi dalam perjalanan', 'Mutasi stok › Kirim (dalam perjalanan)', [
      <>Pilih <b>Kirim (dalam perjalanan)</b>, pilih asal–tujuan dan barangnya, lalu Kirim. Stok asal langsung berkurang; total stok bisnis tidak berubah.</>,
      <>Di lokasi tujuan, buka Mutasi stok › bagian <b>Dalam perjalanan</b> › <b>Terima</b>. Isi jumlah yang benar-benar datang.</>,
      <>Bila kurang, pilih <b>Kembali ke asal</b> (dihitung balik ke stok asal) atau <b>Hilang/rusak di jalan</b> (keluar dari stok, menjadi beban). Belum jadi dikirim? <b>Batalkan kiriman</b> dengan alasan — semua kembali ke asal.</>,
    ], <>Selama dalam perjalanan, barang tidak bisa dijual di lokasi mana pun. Tanggal kedaluwarsa/batch ikut terbawa ke lokasi tujuan.</>, null, null],
    ['Stok maksimum & kesehatan stok', 'Barang & stok › Ubah · tab Kesehatan stok', [
      <>Di <b>Ubah</b> barang, isi <b>Stok maksimum</b> (opsional). Saran belanja tidak akan menyarankan melebihi batas ini, dan barang yang lewat ditandai.</>,
      <>Buka tab <b>Kesehatan stok</b>: barang dikelompokkan menjadi <b>Cepat laku</b>, Normal, <b>Lambat</b>, <b>Tidak bergerak</b>, Baru masuk, dan Habis — lengkap dengan terjual 30/90 hari, stok cukup berapa hari, umur stok, dan nilainya.</>,
      <>Barang tidak bergerak dan lambat sebaiknya dipromosikan (menu Promo), dibundel, atau diretur ke supplier agar modal tidak tertahan.</>,
    ], <>Aturan pengelompokan tertulis di bawah daftar (mis. tidak bergerak = ada stok, tidak terjual 90 hari, dan stok sudah ≥ 90 hari). Saran belanja juga menghitung barang yang sudah dipesan pelanggan.</>, null, <ScrKesehatanStok />],
  ]],
  ['AC', 'Toko: tata kelola harga & kredit', [
    ['Urutan harga & harga khusus pelanggan di Kasir', 'Kasir › Bayar › Pelanggan', [
      <>Harga ditentukan dengan urutan tetap: <b>harga yang diubah manual</b> › <b>daftar harga pelanggan</b> (bila sedang berlaku) › <b>harga outlet</b> atau harga umum (grosir/eceran) › <b>harga beli banyak</b> (diambil yang termurah) › <b>promo</b> (satu barang satu promo).</>,
      <>Di layar Bayar, pilih <b>Pelanggan</b> — sekarang bisa untuk semua cara bayar, bukan hanya kasbon. Bila pelanggan punya daftar harga, harga barang di keranjang langsung berubah dan tertulis <b>Harga khusus …</b>.</>,
      <>Tidak memilih pelanggan = harga umum. Angka akhir selalu dihitung ulang oleh server saat disimpan, jadi sama di Kasir, struk, dan laporan.</>,
    ], <>Pasangkan daftar harga ke pelanggan di Pelanggan & supplier › ketuk nama › Syarat pelanggan.</>, null, <ScrHargaPelanggan />],
    ['Masa berlaku daftar harga', 'Grosir › Daftar harga › ketuk daftar', [
      <>Isi <b>Berlaku mulai</b> dan/atau <b>Berakhir</b>, lalu <b>Simpan masa berlaku</b>. Kosongkan = berlaku terus.</>,
      <>Di luar masa berlaku, pelanggan otomatis kembali ke harga biasa — di pesanan grosir maupun Kasir. Daftar menampilkan tanda <b>Berakhir</b> / <b>Mulai …</b>.</>,
    ], <>Cocok untuk harga kontrak atau harga promo musiman pelanggan tertentu. Perubahan masa berlaku tercatat di riwayat pengaturan.</>, null, null],
    ['Batas diskon & margin minimum', 'Pengaturan › Batas diskon & margin di Kasir', [
      <>Isi <b>Diskon manual maks. (%)</b> dan/atau <b>Margin minimum (%)</b>, lalu Simpan. Kosong = tanpa batas (bawaan).</>,
      <>Bila kasir memberi diskon di atas batas, atau harga membuat margin di bawah minimum, transaksi <b>tidak tersimpan</b> dan muncul pesan batasnya.</>,
      <>Pemilik/pengelola yang sedang login melihat kolom <b>Alasan mengizinkan</b> → isi alasan → <b>Izinkan & simpan</b>. Kasir biasa tidak bisa mengizinkan sendiri.</>,
    ], <>Diskon promo otomatis tidak dihitung. Margin = (total jual − modal barang) ÷ total jual, dari harga termasuk PPN. Setiap izin tersimpan bersama alasannya dan siapa yang mengizinkan.</>, 'warn', null],
    ['Harga per outlet & riwayat harga', 'Barang & stok › Ubah barang', [
      <>Punya lebih dari satu outlet? Di <b>Ubah</b> barang ketuk <b>Harga per outlet</b>, isi harga eceran/grosir yang berbeda untuk outlet tertentu, Simpan. Kosong = harga umum.</>,
      <>Kasir di outlet itu otomatis memakai harga outletnya (outlet = lokasi kerja kasir). Daftar harga pelanggan tetap lebih diutamakan.</>,
      <>Ketuk <b>Riwayat harga</b> untuk melihat setiap perubahan harga eceran, grosir, daftar harga, dan outlet: harga lama → harga baru, tanggal, dan siapa yang mengubah.</>,
    ], <>Riwayat harga dan harga outlet hanya bisa dilihat/diatur pemilik dan bagian keuangan.</>, null, null],
    ['Tipe pelanggan, sales & peringatan kasbon', 'Pelanggan & supplier › ketuk nama › Syarat pelanggan', [
      <>Pilih <b>Tipe pelanggan</b> (Umum, Reseller, Distributor, Institusi) dan <b>Sales yang memegang</b>, lalu <b>Simpan tipe & sales</b>.</>,
      <>Saat kasbon di Kasir membuat piutang pelanggan <b>melewati batas kredit</b>, atau pelanggan punya piutang <b>lewat jatuh tempo</b>, muncul peringatan kuning.</>,
      <>Peringatan tidak menghalangi: kasbon tetap bisa disimpan dan tercatat di riwayat pelanggan. Pada pesanan grosir, piutang lewat jatuh tempo juga hanya diberi peringatan.</>,
      <>Setiap perubahan <b>batas kredit, tempo, daftar harga, tipe, dan sales</b> tercatat sebelum → sesudah di bagian <b>Riwayat syarat</b> (layar pelanggan) dan Konfigurasi › Riwayat — hanya terlihat oleh pemilik/pengelola.</>,
    ], <>Sales harus anggota tim bisnis ini. Laporan kinerja per sales menyusul bersama indikator grosir.</>, null, null],
  ]],
  ['AD', 'Tampilan adaptif, Pusat Pengalaman, Alur kerja, Integrasi & Kinerja', [
    ['Menu yang menyesuaikan bisnis & tombol (+)', 'Menu bawah · menu samping (☰ / laptop)', [
      <>Menu bawah di HP selalu: <b>Beranda</b> · <b>menu utama bisnis Anda</b> · <b>(+)</b> · <b>Laporan</b> · <b>Akun</b>. Menu utama mengikuti jenis bisnis: toko = <b>Transaksi</b>, kos = <b>Kamar</b>, laundry & kuliner = <b>Pesanan</b>, bisnis kustom = jenis data utama (mis. <b>Proyek</b>).</>,
      <>Tombol <b>(+)</b> di tengah <b>selalu ada</b> di semua bisnis. Ketuk untuk aksi cepat, mis. toko: Penjualan baru, Pesanan grosir, Tambah produk, Pembelian, Catat pengeluaran/pemasukan, Tambah pelanggan; kos: Tambah kamar, Tambah penghuni, Booking, Buat tagihan, Catat pembayaran.</>,
      <>Isi (+) mengikuti <b>halaman yang sedang dibuka</b> (di Barang, Tambah produk naik ke atas), <b>peran</b> Anda, dan <b>modul yang aktif</b>. Aksi yang paling sering Anda pakai pindah ke atas. Di laptop, tombol yang sama ada di kanan atas: <b>+ Aksi cepat</b>.</>,
      <>Menu samping (☰ di HP, kiri di laptop) dikelompokkan sesuai bisnis: toko — Penjualan, Pembelian, Persediaan, Pelanggan, Keuangan, Laporan; kos — Kamar, Penghuni, Booking, Perawatan lalu <b>Manajemen</b> (Tagihan, Pembayaran, Pengeluaran); kuliner — Pesanan, Menu, lalu <b>Operasional</b> (Bahan baku, Resep & food cost, Supplier, Karyawan & shift). Semua menu tetap bisa dicari di <b>Semua modul</b>.</>,
    ], <>Bisnis yang masih draf: tombol (+) tetap ada dan menjelaskan bahwa aksi cepat siap setelah bisnis diaktifkan di Pusat Konfirmasi.</>, null, null],
    ['Profil bisnis (Business DNA) & fitur saya', 'Pengaturan bisnis › Pusat Pengalaman', [
      <>Tab <b>Profil bisnis</b>: centang <b>model bisnis</b> (boleh lebih dari satu, mis. Eceran + Grosir), <b>sumber pendapatan</b>, <b>karakter operasional</b> (mis. Mengelola stok, Memakai bahan baku, Pelanggan bisa bayar belakangan, Menerima booking), <b>kanal penjualan</b>, <b>skala</b>, jumlah karyawan/outlet, dan bila ada <b>aktivitas bisnis kedua</b>. Tekan <b>Simpan profil</b>.</>,
      <>Profil awal sudah terisi dari jenis usaha yang dipilih saat mendaftar (bagian <b>Karakter bisnis</b>). Setiap simpan tercatat sebagai versi baru.</>,
      <>Tab <b>Fitur saya</b>: semua fitur dikelompokkan <b>Aktif</b>, <b>Direkomendasikan</b>, <b>Tersedia</b>, <b>Tidak aktif</b>, <b>Terkunci paket</b>, <b>Dalam rencana</b>, lengkap dengan <b>skor relevansi 0–100</b> dan alasannya. Tekan <b>Aktifkan</b>, atau <b>Nonaktifkan</b> (lihat dampaknya dulu, isi alasan).</>,
    ], <>Menyimpan profil TIDAK mengaktifkan atau mematikan fitur apa pun. Skor = 20% kategori + 25% karakter operasional + 20% model bisnis + 10% skala + 10% keputusan Anda + 15% alur kerja. Menonaktifkan fitur tidak menghapus data; fitur berbayar tetap butuh paket.</>, 'warn', null],
    ['Rekomendasi & perkembangan bisnis', 'Pusat Pengalaman › Rekomendasi · Perkembangan', [
      <>Tab <b>Rekomendasi</b>: tiap saran menulis <b>alasan</b> (mis. "Bisnis Anda punya karyawan", "Cabang/outlet aktif Anda sekarang lebih dari satu") dan <b>manfaatnya</b>. Pilih <b>Terima & aktifkan</b>, <b>Tunda 7 hari</b>, atau <b>Tolak</b>.</>,
      <>Saran yang ditolak <b>tidak muncul lagi</b> selama alasannya sama; muncul lagi hanya bila kondisi bisnis berubah (mis. barang aktif sudah 100 jenis). Saran dievaluasi ulang setiap pagi dan saat profil, cabang, karyawan, atau paket berubah.</>,
      <>Tab <b>Perkembangan</b>: tahap bisnis (Persiapan → Awal operasional → Bertumbuh → Mapan → Ekspansi → Multi-cabang → Operasi lanjutan) dihitung dari data nyata — jumlah karyawan, outlet, barang, transaksi 30 hari, pelanggan, supplier, umur bisnis.</>,
    ], <>Menerima saran untuk fitur berbayar tanpa paket yang sesuai: saran tercatat "Diterima" tetapi fitur belum aktif sampai paket dinaikkan. Tidak ada yang diaktifkan diam-diam.</>, null, null],
    ['Atur menu, aksi cepat & dashboard — dan memulihkannya', 'Pusat Pengalaman › Navigasi · Aksi cepat · Dashboard', [
      <><b>Navigasi</b>: pilih <b>menu utama</b> di menu bawah (posisi ke-2), ubah <b>urutan kelompok</b> (↑ ↓), hapus centang <b>Tampil</b> untuk menyembunyikan menu yang jarang dipakai, centang <b>Pintasan</b> (maks. 8) agar tampil paling atas di menu samping. Tekan <b>Simpan navigasi</b>.</>,
      <><b>Aksi cepat</b>: urutkan isi tombol (+), beri <b>★ favorit</b> (maks. 6, selalu paling atas), <b>Sembunyikan</b>, atau <b>Tampilkan</b> aksi opsional (mis. Buat promo, Terima barang titipan, jenis data Builder lain).</>,
      <><b>Dashboard</b>: centang bagian yang tampil di Beranda dan atur urutannya. Bisa juga langsung dari Beranda › <b>Atur dashboard</b>. Pengaturan pemilik berlaku untuk semua pengguna bisnis ini (tiap bagian tetap mengikuti izin orangnya).</>,
      <>Salah atur? Tekan <b>Kembalikan rekomendasi PRASARA</b>, atau buka tab <b>Perkembangan › Riwayat konfigurasi</b> lalu <b>Pulihkan</b> pada perubahan mana pun — tampilan kembali ke keadaan sebelum perubahan itu (tercatat sebagai versi baru). Profil bisnis juga bisa dipulihkan dengan cara yang sama.</>,
    ], <>Menu yang disembunyikan tetap bisa dibuka lewat <b>Semua modul</b> & pencarian; akses dan data tidak berubah. Tombol (+) tidak bisa dihilangkan.</>, null, null],
    ['Dashboard adaptif: periode, angka utama, denyut & sinyal bisnis', 'Beranda (Dashboard)', [
      <>Di atas dashboard pilih periode <b>Hari ini</b>, <b>7 hari</b>, atau <b>Bulan ini</b> — angka penjualan/pendapatan, transaksi, laba, margin, ketepatan waktu, food cost, dan pembayaran diterima ikut berganti. Angkanya dari sumber yang sama dengan menu Laporan.</>,
      <><b>Denyut bisnis</b> membandingkan periode itu dengan rata-rata 30 hari sebelumnya (selisih di bawah 15% = normal), mis. "Penjualan hari ini Rp3.250.000 — 20% di atas rata-rata". Toko juga membandingkan margin, jasa membandingkan ketepatan waktu, kos menampilkan hunian & persentase tagihan terkumpul.</>,
      <><b>Angka utama</b> dipilih PRASARA dari profil bisnis: toko sembako (kasbon) mendapat <b>Piutang pelanggan</b> & <b>Harga modal berubah</b>, toko fashion (varian) mendapat <b>Barang tidak bergerak</b>, grosir mendapat <b>Piutang lewat tempo</b>, kuliner mendapat <b>Food cost</b>, kos mendapat <b>Kamar kosong</b> & <b>Booking aktif</b>, kontraktor mendapat <b>Progres rata-rata</b> & <b>Realisasi vs RAB</b>.</>,
      <>Ubah lewat <b>Atur dashboard</b>: centang/urutkan bagian, centang/urutkan <b>Angka utama</b>, dan pilih <b>Periode bawaan</b>. Bisa juga di Pusat Pengalaman › Dashboard. <b>Perlu perhatian</b> kini juga memberi sinyal: piutang lewat tempo, harga modal naik, barang tidak terjual ≥ 90 hari, food cost di atas 40%, bahan menipis, ketepatan waktu di bawah 80%.</>,
      <>Kontraktor & proyek (bisnis baru): selain Proyek & Klien kini ada jenis data <b>RAB</b>, <b>Material</b>, dan <b>Tenaga kerja</b>. Dashboard menghitung <b>Realisasi vs RAB</b> = total material + upah tenaga kerja dibanding total RAB semua proyek; rincian per proyek ada di Laporan (RAB per proyek, Material per proyek, Upah per proyek).</>,
    ], <>Bila satu bagian gagal dimuat, bagian lain tetap tampil dengan tombol <b>Coba lagi</b>. Angka yang butuh izin keuangan tidak tampil untuk karyawan tanpa izin itu. Bisnis kontraktor lama bisa menambah RAB/Material/Tenaga kerja sendiri di Business Builder.</>, null, null],
    ['Peta proses & daftar alur', 'Pengaturan bisnis › Alur kerja', [
      <>Tab <b>Peta proses</b> menampilkan urutan kerja bisnis Anda, mis. toko: Belanja ke supplier → Terima barang → Persediaan → Harga jual → Penjualan → Pembayaran → Pembukuan → Laporan; laundry: Terima pesanan → Periksa barang → Proses → Cek kualitas → Selesai dikerjakan → Antar/diambil → Pembayaran; kontraktor: Proyek → RAB → Pembelian material → Tenaga kerja → Pelaksanaan → Progres → Kontrol biaya → Serah terima.</>,
      <>Tiap langkah diberi status dari <b>data 90 hari terakhir</b>: <b>Berjalan</b> (ada datanya), <b>Otomatis</b> (dikerjakan sistem, mis. pembukuan), <b>Belum dipakai</b>, <b>Belum diatur</b> (tahapnya belum ada di alur pesanan Anda, mis. belum ada tahap Cek kualitas), atau <b>Fitur nonaktif</b>. Ketuk langkah untuk membuka menunya.</>,
      <>Tab <b>Alur</b> berisi semua alur yang aktif: <b>Bisa diatur</b> (Pesanan jasa/laundry/kuliner), <b>Kustom</b> (jenis data Business Builder yang punya status), dan <b>Standar</b> (mis. Penjualan kasir, Belanja, Pesanan grosir, Booking, Sewa, Keluhan & perbaikan). Angka di tiap status = data yang sedang berjalan + yang selesai/batal 90 hari terakhir.</>,
      <>Ketuk alur untuk detail: status & jumlahnya, rata-rata lama di tiap tahap (bila minimal 3 pesanan), persetujuan yang berlaku, permintaan persetujuan terakhir, dan versi alur.</>,
    ], <>Alur standar mengikuti aturan bawaan PRASARA agar stok, kas, dan pembukuan tetap benar — yang bisa diatur di sana hanya persetujuan untuk tindakan berisiko (menu Persetujuan). Halaman ini hanya untuk pemilik & pengelola.</>, null, null],
    ['Aturan bersyarat untuk karyawan & persetujuan per alur', 'Alur kerja › Alur › Pesanan (atau jenis data kustom) › + Aturan', [
      <>Pilih <b>langkah yang diatur</b>. Pesanan: <b>Langsung siap (melewati tahap)</b>, <b>Diserahkan ke pelanggan</b>, atau <b>Pesanan dibatalkan</b>. Catatan kustom: <b>Pindah ke</b> status tertentu (mis. Pindah ke Selesai).</>,
      <>Isi <b>syarat</b> (boleh kosong = selalu): masih ada sisa bayar, sudah ada pembayaran, total minimal/maksimal, diantar atau diambil sendiri; untuk catatan kustom juga <b>isian</b> (mis. Progres kurang dari 100, Nilai minimal Rp100.000.000, Nomor kontrak masih kosong).</>,
      <>Pilih <b>Maka</b>: <b>Tidak diizinkan</b> (karyawan tidak bisa), <b>Perlu persetujuan pemilik</b> (karyawan mengirim permintaan, langkah dijalankan otomatis setelah Anda setujui di menu Persetujuan), atau <b>Wajib catatan</b> (mis. nama penerima). Beri nama aturan dan, bila perlu, pesan untuk karyawan. Contoh: "Bila diserahkan ke pelanggan dan masih ada sisa bayar → tidak diizinkan".</>,
      <>Aturan berlaku di semua jalan: menu Pesanan, Dapur, Antar jemput, dan tutup meja. Kurir yang terkena aturan persetujuan diminta menyerahkan lewat pemilik/kasir. Matikan, ubah, atau hapus aturan kapan saja.</>,
    ], <>Aturan <b>tidak berlaku untuk pemilik</b> — pemilik tetap bisa mencatat apa pun yang benar-benar terjadi. Aturan yang meminta persetujuan tersedia mulai <b>Paket Bisnis</b>; "Tidak diizinkan" dan "Wajib catatan" bisa dipakai di semua paket. Maksimal 20 aturan per alur.</>, 'warn', null],
    ['Alur siap pakai, versi & saran alur', 'Alur kerja › Alur · Saran · Riwayat', [
      <><b>Alur siap pakai</b> (bisnis jasa): mis. Laundry kiloan (Timbang & cek → Cuci → Kering → Setrika & lipat → Cek kualitas → Kemas), Dry clean, Cuci sepatu, Jahit & permak, Servis perangkat, Percetakan, Jasa kreatif, Konsultasi, Dapur kuliner. Yang cocok dengan usaha Anda ditandai <b>Cocok</b>. Ketuk → <b>Pakai alur ini</b>; centang bila ingin menyertakan aturan yang disarankan.</>,
      <>Tahap dengan nama sama dipakai ulang; tahap lain <b>dinonaktifkan, tidak dihapus</b>, sehingga riwayat pesanan tetap utuh. Tahap yang sedang dipakai pesanan dalam proses tidak bisa dinonaktifkan — selesaikan dulu pesanannya.</>,
      <>Setiap perubahan tahap, status, langkah Builder, atau aturan disimpan sebagai <b>versi</b>. Versi pertama disimpan otomatis sebelum perubahan pertama. Di detail alur, tekan <b>Pulihkan</b> pada versi mana pun; tab <b>Riwayat</b> menampilkan semua perubahan.</>,
      <>Tab <b>Saran</b> memberi saran dari data nyata: alur siap pakai untuk usaha sejenis, menambah tahap <b>Cek kualitas</b>, tahap yang paling lama, tahap yang sering dilewati, pesanan yang sering diserahkan belum lunas, banyak pesanan terlambat, catatan kustom yang tertahan, status yang tidak pernah dipakai, dan langkah proses yang belum dipakai. Pilih <b>Terapkan</b>, <b>Nanti</b> (30 hari), atau <b>Tidak perlu</b>.</>,
    ], <>Saran tidak pernah diterapkan tanpa persetujuan Anda. Saran yang ditolak tidak muncul lagi selama kondisinya sama.</>, null, null],
    ['Integrasi: kirim data dari website atau aplikasi lain jadi Prospek', 'Pengaturan bisnis › Integrasi', [
      <><b>Khusus Paket Pro.</b> Di paket lain halaman ini menampilkan tombol <b>Lihat Paket Pro</b>. Bila paket turun dari Pro, kiriman ke sambungan yang ada ditolak (tercatat di Riwayat), tetapi sambungan masih bisa dijeda, diubah namanya, atau dihapus.</>,
      <>Buka <b>Integrasi</b> (hanya pemilik & pengelola). Modul <b>Prospek & tindak lanjut (CRM)</b> harus aktif karena setiap kiriman dari luar masuk sebagai Prospek. Tekan <b>+ Sambungan baru</b>, beri <b>nama</b> pengingat (mis. "Formulir website" atau "Bot WhatsApp"), lalu <b>Buat sambungan</b>.</>,
      <>PRASARA mengenali nama kolom umum otomatis: <b>name/nama</b>, <b>phone/telepon/hp</b>, <b>message/pesan</b>, dan <b>email</b>. Bila aplikasi Anda memakai nama lain (boleh bersarang, mis. <b>kontak.wa</b>), isi di bagian <b>Nama kolom khusus</b>. Email dicatat di kolom kebutuhan prospek.</>,
      <>Layar berikutnya menampilkan <b>alamat sambungan</b>. Alamat itu <b>hanya tampil sekali</b> — tekan <b>Salin</b> dan simpan di tempat aman (catatan HP atau pengelola kata sandi). Tempel di aplikasi pengirim (Zapier, Make, n8n, Google Apps Script, bot, atau server website Anda) sebagai permintaan <b>POST</b>.</>,
      <>Tekan <b>Kirim contoh</b> untuk memastikan sambungan bekerja: PRASARA membuat satu prospek bernama "Contoh Uji PRASARA" yang boleh Anda batalkan. Tersedia juga contoh perintah kirim (curl) di layar yang sama.</>,
      <>Prospek yang masuk muncul di menu <b>Prospek</b> dengan sumber <b>Integrasi</b> dan nomor PRM-…, serta pengingatnya di Beranda. Tidak ada email otomatis. Nomor telepon yang sama dalam 10 menit dihitung sebagai kiriman ulang, bukan prospek baru; kiriman ulang yang persis sama bisa dicegah dengan header <b>Idempotency-Key</b>.</>,
      <>Di kartu sambungan: <b>Ubah</b> (nama & kolom khusus), <b>Jeda</b>/<b>Aktifkan</b>, <b>Kode baru</b> (alamat lama langsung berhenti bekerja), <b>Hapus</b>, dan <b>Riwayat</b>. Tab <b>Riwayat kiriman</b> menampilkan tiap kiriman: masuk jadi prospek, nomor sama dalam 10 menit, atau ditolak beserta alasannya (isi kurang tepat, terlalu banyak kiriman, sambungan dijeda).</>,
    ], <>Jangan menaruh alamat sambungan di JavaScript halaman web yang bisa dilihat pengunjung — siapa pun yang tahu alamatnya bisa mengirim prospek. Bila bocor, tekan <b>Kode baru</b>. Batas: maksimal 5 sambungan per bisnis, 60 kiriman per jam dan 300 prospek per hari per sambungan. PRASARA tidak menyimpan alamat lengkapnya (hanya sidik dan 4 karakter terakhir) dan tidak mengklaim pengirim sudah meminta izin dihubungi — pastikan sumbernya memintanya. Konektor lain (kabar keluar, WhatsApp resmi, pembayaran online, marketplace) masih <b>Dalam rencana</b> dan tidak berpura-pura aktif.</>, 'warn', null, 'pro'],
    ['Kinerja: fitur & aksi cepat yang benar-benar dipakai', 'Pengaturan bisnis › Pusat Pengalaman › Kinerja', [
      <>Pilih periode <b>7 hari</b>, <b>30 hari</b>, atau <b>90 hari</b>. <b>Ringkasan</b> menampilkan berapa orang yang memakai PRASARA (dari semua anggota), berapa hari dipakai, berapa kali menu dibuka, dan berapa kali aksi cepat diketuk.</>,
      <><b>Menu paling sering dibuka</b> dan <b>Aksi cepat (tombol +)</b>: kali dipakai dan oleh berapa orang. Aksi yang <b>belum pernah diketuk</b> ditampilkan agar bisa Anda sembunyikan lewat <b>Atur aksi cepat</b>.</>,
      <>Urutan tombol (+) yang belum Anda atur sendiri kini mengikuti aksi yang paling sering <b>Anda</b> pakai dari <b>semua perangkat</b> Anda (60 hari terakhir), bukan per HP lagi.</>,
      <><b>Fitur aktif yang jarang dipakai</b>: fitur yang menyala tetapi tidak dibuka di periode itu, beserta tanggal terakhir dibuka. Muncul setelah minimal 14 hari data agar tidak menyesatkan.</>,
      <><b>Hasil rekomendasi</b>: berapa saran yang Anda putuskan, berapa yang diterima, dan berapa yang <b>lalu dipakai</b> (menunya dibuka setelah diterima), plus saran alur kerja dan berapa kali tampilan diubah, dikembalikan, atau dipulihkan.</>,
    ], <>Yang dicatat HANYA jumlah menu dibuka dan aksi cepat diketuk per hari — tanpa isi transaksi, tanpa lokasi/perangkat, dan tidak ditampilkan per karyawan. Data disimpan 180 hari. Pencatatan dimulai 21 Nov 2026, jadi angka awal belum penuh. Halaman ini hanya untuk pemilik & pengelola.</>, null, null],
  ]],
  ['AE', 'Toko: neraca saldo, umur piutang & utang, nilai persediaan, indikator grosir', [
    ['Neraca saldo', 'Keuangan › Pembukuan › Neraca saldo', [
      <>Pilih bulan (atau centang <b>Sejak awal tahun</b>). Setiap akun tampil dengan <b>saldo awal</b>, <b>debit</b>, <b>kredit</b>, dan <b>saldo akhir</b> di kolom Debit atau Kredit.</>,
      <>Lihat kotak <b>Status</b>: <b>Seimbang</b> berarti jumlah debit = jumlah kredit — tanda pembukuan rapi. Bila tidak seimbang, angka selisihnya ditampilkan.</>,
      <>Tekan <b>Unduh Excel</b> untuk dikirim ke akuntan (dihitung sebagai ekspor bulan ini).</>,
    ], <>Angkanya dari jurnal otomatis yang sama dengan Laporan & Buku besar. Di Paket Dasar akun aset, kewajiban, dan modal diringkas menjadi 3 baris; rincian per akun tersedia di Paket Bisnis/Pro (Laporan lanjutan).</>, null, null],
    ['Umur piutang & utang', 'Pembukuan › Umur piutang & utang', [
      <>Pilih <b>Piutang pelanggan</b> atau <b>Utang pemasok</b>, lalu rentang <b>30/60/90 hari</b> atau <b>7/14/30 hari</b>.</>,
      <>Sisa tagihan dikelompokkan menurut <b>jatuh tempo</b>: belum jatuh tempo, lewat 1–30 hari, dan seterusnya. Pembayaran dianggap melunasi dokumen <b>terlama</b> lebih dulu.</>,
      <>Ketuk nama pelanggan/pemasok untuk melihat dokumennya satu per satu (nomor, tanggal, jatuh tempo, sisa, terlambat berapa hari).</>,
      <>Kontak yang <b>lebih bayar</b> (saldonya minus) ditampilkan terpisah, tidak dihitung dalam umur.</>,
    ], <>Total umur selalu sama dengan saldo di Pelanggan & supplier. Barang titipan yang sudah terjual masuk utang ke penitip tanpa jatuh tempo (kolom <b>Tanpa tempo</b>). Isi tempo pelanggan di Syarat pelanggan agar jatuh tempo kasbon terisi.</>, null, <ScrUmurPiutang />],
    ['Nilai persediaan per tanggal', 'Pembukuan › Nilai persediaan', [
      <>Pilih <b>Posisi per tanggal</b> (bawaan hari ini). Nilai = jumlah stok × <b>modal rata-rata bergerak</b> (metode HPP resmi), per barang, per kategori, dan per lokasi bila punya lebih dari satu lokasi.</>,
      <>Kotak terpisah: <b>Milik toko</b>, <b>Titipan</b> (milik penitip, bukan aset toko), dan <b>Dalam perjalanan</b> (kiriman antarlokasi yang belum diterima — tetap milik toko).</>,
      <>Untuk hari ini, sistem membandingkan dengan saldo akun <b>Persediaan</b> di buku besar. Bila beda, selisihnya ditampilkan agar bisa diperiksa.</>,
    ], <>Barang yang stoknya minus ditandai <b>Minus</b> dan mengurangi total — periksa di Barang & stok. Untuk tanggal lalu, posisi dihitung dari waktu gerak stok dicatat, jadi bisa sedikit berbeda dengan jurnal yang memakai tanggal dokumen.</>, 'warn', null],
    ['Indikator grosir & kinerja sales', 'Laporan toko › Indikator grosir', [
      <>Muncul bila modul Pesanan grosir atau Kredit pelanggan aktif. Isinya: <b>lama penagihan (DSO)</b>, piutang & yang tertagih, <b>pemenuhan pesanan</b> (nilai terkirim ÷ nilai dipesan), <b>kirim tepat waktu</b>, <b>gagal kirim</b>, dan rata-rata pesanan.</>,
      <><b>Per pelanggan</b>: omzet, laba, margin, piutang, dan pemakaian batas kredit (merah bila lewat).</>,
      <><b>Per sales</b>: dikelompokkan menurut <b>Sales yang memegang</b> di data pelanggan — jumlah pelanggan, omzet, laba, margin, dan piutang.</>,
    ], <>Hanya untuk pemilik & bagian keuangan. Angka omzet tanpa PPN dan dihitung dengan rumus yang sama dengan Indikator toko.</>, null, null],
  ]],
  ['AF', 'Toko: merek, barcode, harga supplier, paket, nomor seri, nota kredit & tukar barang', [
    ['Merek & barcode tambahan', 'Barang & stok › Atur merek · Ubah › Barcode tambahan', [
      <>Ketuk <b>+ Merek</b> / <b>Atur merek</b> di bawah kotak cari, tambahkan nama merek, lalu <b>Pilih barang</b> untuk memasangnya sekaligus — atau pilih <b>Merek</b> di form Ubah barang.</>,
      <>Saring daftar barang per merek; di Kasir, mengetik nama merek ikut menemukan barangnya. <b>Laporan toko</b> menampilkan <b>Penjualan per merek</b> (omzet, laba, margin).</>,
      <>Satu barang punya beberapa barcode (kemasan lama & baru, kode dari pemasok lain)? Buka <b>Ubah</b> › <b>Barcode tambahan</b>, scan atau ketik kodenya per satuan, <b>Tambah</b>. Semua kode bisa di-scan di Kasir.</>,
    ], <>Satu kode hanya boleh dipakai satu barang/satuan — sistem menolak kode yang sudah dipakai barang lain. Barcode utama tetap diisi di form barang.</>, null, null],
    ['Harga & minimal pesan per supplier', 'Barang & stok › Ubah › Harga dari supplier & minimal pesan', [
      <>Ketuk <b>+ Harga supplier</b>, pilih supplier & satuan beli, isi <b>harga sepakat</b>, <b>minimal pesan (MOQ)</b>, dan waktu kirim. Centang <b>Supplier utama</b> untuk supplier yang biasa dipakai.</>,
      <>Daftar menampilkan semua supplier untuk barang itu, termasuk <b>harga beli terakhir</b> dari Belanja dan harga per satuan utama, sehingga mudah dibandingkan.</>,
      <>Di form <b>Belanja</b>, harga terisi otomatis dari harga sepakat supplier yang dipilih, muncul peringatan bila jumlah di bawah minimal pesan, dan info bila supplier lain lebih murah. <b>Saran belanja</b> memakai supplier utama dan membulatkan jumlah ke minimal pesan.</>,
    ], <>Minimal pesan hanya peringatan — belanja tetap bisa disimpan bila kenyataannya berbeda.</>, null, null],
    ['Barang paket (isi dari barang lain)', 'Barang & stok › + Paket', [
      <>Ketuk <b>+ Paket</b>, isi nama & harga jual per paket, lalu cari dan tambahkan barang isinya beserta jumlah & satuannya (mis. 2 kg Gula + 3 pcs Teh). Terlihat modal per paket dan <b>bisa dibuat berapa</b> dari stok sekarang. <b>Simpan paket</b>.</>,
      <>Paket dijual di Kasir seperti barang biasa. Setiap paket terjual, <b>stok barang isinya</b> yang berkurang; modal paket = nilai barang isi yang keluar, jadi laba & pembukuan tetap benar.</>,
      <>Retur atau batal penjualan paket mengembalikan barang isi yang sama persis (walau isi paket sudah diubah). Ubah isi lewat tombol <b>Isi paket</b> di daftar barang.</>,
    ], <>Paket tidak punya stok sendiri dan tidak bisa dibeli dari supplier. Barang yang sudah punya riwayat stok tidak bisa dijadikan paket — buat barang baru untuk paketnya. Berbeda dengan <b>Promo › paket bundling</b> yang hanya memotong harga.</>, 'warn', <ScrPaketSeri />],
    ['Nomor seri / IMEI & garansi', 'Barang & stok › Ubah › Catat nomor seri · Kasir · Garansi', [
      <>Di <b>Ubah</b> barang ketuk <b>Catat nomor seri / IMEI & garansi</b>, centang, isi <b>lama garansi toko</b> (hari, mis. 365), Simpan. Daftarkan nomor seri unit yang ada (scan atau ketik, pisahkan koma/baris baru). Menu <b>Garansi & nomor seri</b> muncul otomatis.</>,
      <>Di Kasir, barang bernomor seri punya kolom <b>Nomor seri / IMEI</b> — scan saat dijual. Boleh menyusul: buka <b>Penjualan</b> › transaksi › <b>Isi</b> di baris barangnya. Nomor yang belum didaftarkan tetap dicatat. Struk menampilkan nomor seri & tanggal akhir garansi.</>,
      <>Pelanggan datang membawa barang: buka <b>Garansi & nomor seri</b>, scan/ketik nomornya, lihat status <b>Garansi aktif/habis</b>, pembeli, dan tanggal beli. Ketuk <b>+ Catat klaim</b>, tulis keluhannya, lalu <b>Perbarui</b> sampai Selesai/Ditolak beserta hasilnya.</>,
    ], <>Nomor seri yang sudah terjual tidak bisa dijual lagi. Retur (pilih nomor serinya) mengembalikan unit menjadi tersedia atau rusak; batal penjualan mengembalikannya tersedia. Unit diganti baru? Pakai <b>Tukar barang</b> agar stok ikut benar.</>, null, null],
    ['Nota kredit (saldo belanja pelanggan)', 'Penjualan › transaksi › Retur barang › Nota kredit · Kasir › Pakai nota kredit', [
      <>Saat retur, pilih pengembalian <b>Nota kredit (saldo belanja)</b>. Sistem menerbitkan nomor <b>NK-…</b> senilai retur; ketuk <b>kirim WA</b> untuk mengirim nomornya ke pelanggan.</>,
      <>Di Kasir, ketuk <b>Pakai nota kredit</b>, ketik/scan nomornya, <b>Pakai</b>. Nota memotong total; sisanya dibayar tunai/transfer/kasbon seperti biasa. Sisa nota tetap bisa dipakai lain kali.</>,
      <>Daftar & sisa semua nota ada di <b>Penjualan › Nota kredit</b>. Pemilik bisa mengisi <b>masa berlaku</b> nota baru, dan <b>Hanguskan sisa</b> nota yang tidak akan dipakai (menjadi pendapatan lain).</>,
    ], <>Nota kredit bukan uang keluar: tidak mengurangi kas/laci. Sisa nota tercatat sebagai utang toko ke pelanggan (akun Nota kredit di Pembukuan). Membatalkan penjualan yang dibayar nota mengembalikan saldo notanya.</>, null, null],
    ['Tukar barang', 'Penjualan › transaksi › Tukar barang', [
      <>Buka transaksi asal, ketuk <b>Tukar barang</b>. Isi jumlah barang lama yang dikembalikan, lalu cari dan tambahkan <b>barang pengganti</b> beserta jumlahnya.</>,
      <>Pilih cara uangnya (Tunai/Transfer, atau Potong kasbon bila penjualan asal kasbon). Terlihat perkiraan <b>Pelanggan membayar</b> atau <b>Dikembalikan ke pelanggan</b>.</>,
      <>Ketuk <b>Simpan tukar barang</b>: retur & penjualan baru tersimpan bersamaan (bila satu gagal, keduanya batal) dan saling tertaut di detailnya. Stok, laci, laporan, dan pembukuan ikut benar.</>,
    ], <>Harga barang pengganti dihitung ulang sistem saat disimpan (promo, harga pelanggan, harga beli banyak). Ingin selisihnya disimpan sebagai saldo? Lakukan Retur › Nota kredit, lalu pakai notanya di Kasir.</>, null, null],
  ]],
  ['AG', 'Toko: Kasir offline (tetap berjualan saat internet putus)', [
    ['Siapkan HP untuk Kasir offline', 'Browser HP › Tambahkan ke Layar Utama · Kasir', [
      <>Buka PRASARA di Chrome (Android) atau Safari (iPhone), lalu pilih <b>Tambahkan ke Layar Utama</b> (Chrome: menu ⋮; Safari: tombol Bagikan). Ikon PRASARA muncul di layar HP dan terbuka seperti aplikasi.</>,
      <><b>Masuk</b> dengan akun kasir/pemilik, lalu buka <b>Kasir</b> sekali saat ada internet. Daftar barang, harga, pelanggan, dan halaman Kasir tersimpan di HP. Ulangi sesekali saat online agar harga & stok di HP ikut terbaru.</>,
      <>Jangan <b>Keluar</b> dari akun dan jangan hapus data browser/aplikasi di HP kasir — sesi masuk dan antrean transaksi disimpan di sana.</>,
    ], <>Kasir offline berlaku per HP: setiap HP kasir perlu dibuka sekali saat online. Halaman lain (laporan, barang, pembukuan, dll.) tetap butuh internet; saat offline yang tampil "Sedang offline" dengan tombol <b>Buka Kasir</b>.</>, 'warn', null],
    ['Berjualan saat internet putus', 'Kasir (kotak kuning "Offline")', [
      <>Saat internet putus, Kasir menampilkan tanda <b>● Offline</b> dan kotak kuning <b>Offline</b>. Pilih barang seperti biasa (ketuk <b>+</b>), lalu tekan <b>Bayar</b> — tombol simpannya menjadi <b>Simpan di HP</b>. Stok yang tampil sudah dikurangi penjualan di HP yang belum terkirim.</>,
      <>Cara bayar <b>Tunai</b>, <b>Transfer/QRIS</b>, <b>Kasbon</b>, dan <b>Campuran</b> bisa dipakai. Untuk semua cara bayar, pilih <b>+ Pelanggan baru</b> untuk mengisi nama (dan No. HP opsional). Jika tunai kurang, pilih <b>Catat sisa sebagai kasbon</b>, pilih atau tambah pelanggan, lalu konfirmasi persetujuannya. Pelanggan baru yang dibuat saat offline bisa dipilih lagi untuk transaksi berikutnya di HP yang sama.</>,
      <>Setelah <b>Simpan di HP</b>, muncul nomor sementara <b>OFF-…</b> dan tombol <b>Lihat / cetak struk</b>. Nomor TRX resmi muncul setelah terkirim.</>,
      <>Saat internet kembali, transaksi <b>dikirim otomatis</b> berurutan (tanpa dobel, walau internet putus di tengah pengiriman). Tanggal, jam, shift, dan kartu stok memakai waktu transaksi aslinya. Buka <b>Antrean HP</b> untuk melihat status: Menunggu dikirim, Tersimpan, Tersimpan · perlu dicek, atau Gagal dicatat. Jika kiriman ditolak dan masih di HP, periksa alasannya sebelum mengirim ulang transaksi yang sama. Saat mengganti akun di HP yang sama, buka Kasir saat online sekali untuk menyiapkan salinan data akun tersebut.</>,
    ], <>Saat offline: <b>promo otomatis</b> tidak dihitung, <b>nota kredit</b> tidak bisa dipakai, batas kredit kasbon dicek setelah terkirim, dan diskon di atas batas pemilik wajib diberi alasan. Harga mengikuti salinan di HP; bila harga sudah berubah, transaksi tetap tersimpan dengan harga yang ditagih dan ditandai untuk pemilik.</>, 'warn', <ScrKasirOffline />],
    ['Memeriksa transaksi offline (pemilik)', 'Penjualan › Offline · Pengingat toko', [
      <>Buka <b>Penjualan</b> › tab <b>Offline</b> (pemilik & bagian keuangan). Tab <b>Perlu dicek</b> berisi transaksi yang terkirim dengan <b>temuan</b>: harga sudah berubah, promo tidak terhitung, stok jadi minus, diskon lewat batas, kasbon lewat batas kredit, shift atau tutup harian sudah ditutup, atau jam HP salah.</>,
      <>Transaksi bertemuan <b>sudah masuk</b> penjualan, stok, dan pembukuan — temuan hanya bahan pemeriksaan. Tindak lanjuti (mis. hitung ulang stok, tutup ulang hari), lalu ketuk <b>Tandai sudah dicek</b> dan tulis catatannya.</>,
      <><b>Gagal dicatat</b> = belum masuk penjualan (mis. barang sudah dihapus, atau akses kasir dicabut sebelum terkirim). Isi barang & cara bayarnya ditampilkan; catat ulang lewat Kasir bila benar terjadi, lalu tandai sudah dicek.</>,
      <>Lonceng & <b>Pengingat toko</b> ikut menampilkan transaksi offline yang perlu dicek.</>,
    ], <>Kasir yang lupa mengirim lalu keluar akun: pemilik/pengelola bisa masuk di HP itu dan memakai <b>Kirim dengan akun saya</b> di Antrean HP. Penjualan tercatat atas nama yang mengirim, dengan catatan siapa yang mencatat offline.</>, null, null],
  ]],  ['AH', 'Proyek: event, kreatif & produksi', [
    ['Membuat proyek & milestone', 'Proyek (bisnis event, kreatif/media, kontraktor)', [
      <>Buka menu <b>Proyek</b> (atau tombol <b>(+)</b> › <b>Proyek baru</b>). Menu ini muncul bila modul <b>Proyek</b> aktif — otomatis untuk bisnis Event, Media/kreatif, dan Kontraktor berpaket Bisnis/Pro; bisnis jasa atau kustom lain bisa mengaktifkannya di <b>Konfigurasi › Modul</b>.</>,
      <>Tekan <b>+ Proyek baru</b>: isi nama (mis. <i>Wedding Andi &amp; Sari</i>), pilih jenis (<b>Event / acara</b>, <b>Kreatif &amp; media</b>, <b>Produksi</b>, <b>Umum</b>), tahap (<b>Sudah deal</b> atau <b>Masih penawaran</b>), klien (pilih pelanggan atau ketik <b>Klien baru</b> — otomatis masuk daftar Pelanggan), tanggal mulai–selesai, <b>PIC</b>, lokasi, dan keterangan.</>,
      <><b>Nilai kontrak</b> hanya terlihat &amp; bisa diisi oleh pemilik/bagian keuangan. Nilai ini baru menjadi pendapatan di Pembukuan saat milestone diserahkan / proyek selesai (Langkah 136).</>,
      <>Di halaman proyek, tekan <b>+ Milestone</b> untuk tahap besar (mis. <i>DP &amp; konsep</i> → <i>Gladi bersih</i> → <i>Hari H</i> → <i>Pelunasan</i>) beserta target tanggal dan <b>rencana nilai termin</b>. Total termin dibandingkan dengan nilai kontrak (kurang/lebih ditampilkan). Centang milestone saat selesai.</>,
      <>Pekerjaan besar bisa dipecah: <b>+ Subproyek</b> (mis. produksi panggung) dengan PIC &amp; tugas sendiri — hanya satu tingkat.</>,
    ], <>Proyek memakai <b>Paket Bisnis</b> (juga Pro). Bila paket turun, proyek yang sudah ada tetap bisa dibuka, tugasnya ditandai, dan proyeknya diselesaikan atau dibatalkan — membuat &amp; mengubah butuh Paket Bisnis lagi. Anggaran & laba proyek ada di Langkah 135, tagihan & pembayaran klien di Langkah 136.</>, 'warn', <ScrProyek />, 'bisnis'],
    ['Tugas tim, anggota & status proyek', 'Proyek › buka proyek', [
      <>Tekan <b>+ Tugas</b>: judul, <b>penanggung jawab</b> (anggota tim bisnis), tenggat, prioritas, milestone. <b>Simpan &amp; tambah lagi</b> untuk mengetik banyak tugas berturut-turut.</>,
      <>Penanggung jawab melihat tugasnya di menu <b>Proyek</b> › <b>Tugas saya</b> dari HP-nya sendiri dan menekan <b>Mulai</b> lalu <b>Selesai ✓</b> — walau perannya kasir atau gudang, ia hanya melihat proyek tempat ia diberi tugas. Tugas lewat tenggat ditandai <b>terlambat</b>.</>,
      <><b>+ Anggota</b>: tambahkan anggota tim (mis. Koordinator lapangan, Editor) agar bisa melihat proyek ini. Karyawan bagian <b>proses</b> melihat semua proyek; pemilik, pengelola, dan PIC proyek yang bisa mengubah.</>,
      <>Ubah status lewat tombol di atas: <b>Tandai selesai</b> (tugas yang belum selesai diingatkan, tidak menghalangi), <b>Tunda</b>, <b>Batalkan</b> (alasan wajib), atau <b>Jalankan / buka lagi</b> (alasan wajib bila proyek sudah selesai/batal).</>,
      <><b>Dokumen proyek</b>: lampirkan kontrak, brief, denah, foto lokasi (foto/PDF maks. 4 MB). File desain/video besar simpan di Google Drive/Dropbox dan tempel tautannya di keterangan. <b>Riwayat</b> mencatat siapa membuat, mengubah, memberi tugas, dan menyelesaikan apa.</>,
    ], <>Nilai kontrak &amp; rencana termin tidak terlihat oleh karyawan selain bagian keuangan. Tugas yang sudah selesai tidak bisa dihapus (jejak pekerjaan) — buka lagi bila keliru.</>, null, null, 'bisnis'],    ['Penawaran, scope & perubahan scope', 'Proyek › tab Penawaran · halaman proyek', [
      <>Pemilik, pengelola, dan bagian keuangan melihat tab <b>Penawaran</b> di menu Proyek. Tekan <b>+ Penawaran baru</b>: judul, jenis proyek, klien, lalu <b>rincian pekerjaan</b> (uraian, jumlah, satuan, harga satuan) dan potongan bila ada. Total dihitung otomatis (tanpa PPN).</>,
      <><b>Termin pembayaran</b>: pilih cepat <b>100</b>, <b>50/50</b>, <b>30/40/30</b>, atau isi sendiri dalam persen atau rupiah — jumlahnya harus pas 100% / sama dengan total. Isi juga <b>Termasuk</b>, <b>Tidak termasuk</b>, kewajiban klien, <b>batas revisi</b>, biaya revisi tambahan, masa berlaku, dan rencana jadwal.</>,
      <>Buka penawaran untuk melihat dokumennya: <b>Cetak / PDF</b> atau <b>Kirim WA</b> ke klien (otomatis ditandai <b>Terkirim</b>). Mengubah penawaran yang sudah terkirim = <b>revisi</b> bernomor; versi lama tetap bisa dilihat.</>,
      <>Klien setuju? Tekan <b>Klien setuju</b>, isi nama penyetuju & tanggalnya. Proyek <b>dibuat otomatis</b> (atau proyek berstatus penawaran dijalankan) dengan nilai kontrak, jadwal, batas revisi, dan tiap termin menjadi <b>milestone</b>. Klien menolak? Tekan <b>Klien menolak</b> dan tulis alasannya.</>,
      <>Klien minta tambahan di luar kesepakatan? Di halaman proyek tekan <b>+ Perubahan scope</b>: rincian tambahan, termin, tambahan revisi, dan tanggal selesai baru. Setelah klien setuju, nilai kontrak dan batas revisi bertambah, jadwal bergeser, dan termin tambahan masuk milestone.</>,
    ], <>Keputusan klien dicatat oleh pemilik atau pengelola. Penawaran yang disetujui terkunci — tambahan pekerjaan selalu lewat Perubahan scope agar riwayat harga jelas. Penawaran lewat masa berlaku tetap bisa disetujui bila klien memang setuju. Penagihan termin & pencatatan uang klien ada di Langkah 136.</>, 'warn', <ScrPenawaranProyek />, 'bisnis'],    ['Anggaran, biaya & laba proyek', 'Proyek › buka proyek › Anggaran, biaya & laba · tab Laba proyek', [
      <>Bagian ini hanya untuk pemilik & bagian keuangan. Tekan <b>+ Anggaran</b>: isi rencana biaya per kategori (tombol cepat mis. <b>Venue</b>, <b>Sound</b>, <b>Talent</b>, <b>Dekorasi</b> untuk event; <b>Freelancer</b>, <b>Sewa alat</b> untuk kreatif). Rencana laba = nilai kontrak − anggaran langsung terlihat. Pemilik/pengelola menekan <b>Setujui anggaran</b> — perubahan berikutnya tampil sebagai selisih.</>,
      <><b>+ Catat biaya</b>: nominal, kategori anggaran, keterangan, tanggal, kas/bank. Biaya ini dicatat sebagai <b>pengeluaran biasa</b> (muncul di Kas & Pembukuan) dan langsung ditandai ke proyek.</>,
      <>Sudah mencatat di Kas atau Belanja? Pakai <b>Tandai biaya lama</b>: pilih pengeluaran/belanja 120 hari terakhir, kategori anggarannya, dan nominal untuk proyek ini — satu biaya bisa <b>dibagi</b> ke beberapa proyek. Belanja yang masih <b>dipesan</b> dihitung sebagai komitmen sampai barangnya diterima.</>,
      <><b>+ Komitmen vendor</b>: biaya yang sudah disepakati tapi belum dibayar (mis. sewa sound, fee band). Setelah dibayar tekan <b>Sudah dibayar</b>, lalu <b>Catat biaya</b> pembayarannya.</>,
      <>Baca bilah per kategori (merah = lewat anggaran) dan kotak <b>Perkiraan laba</b> + margin. Tab <b>Laba proyek</b> di menu Proyek merangkum nilai kontrak, biaya nyata, komitmen, dan perkiraan laba semua proyek.</>,
    ], <>Menandai biaya <b>tidak mengubah</b> jurnal atau saldo kas — uangnya sudah tercatat di Kas/Belanja. <b>Lepas</b> tanda tidak menghapus pengeluaran. Gaji karyawan tetap belum dibagi otomatis ke proyek; catat fee freelancer/kru sebagai biaya proyek. Perkiraan biaya akhir per kategori = yang lebih besar antara anggaran dan (biaya nyata + komitmen).</>, 'warn', <ScrBiayaProyek />, 'bisnis'],    ['Tagihan termin & pembayaran klien', 'Proyek › buka proyek › Tagihan & pembayaran klien', [
      <>Bagian ini hanya untuk pemilik & bagian keuangan. Di <b>Termin yang belum ditagih</b>, tekan <b>Tagihkan</b> — nominal & uraian terisi dari milestone (mis. DP 30%). Pilih jatuh tempo (<b>+7</b>, <b>+14</b>, <b>+30 hari</b>) lalu <b>Buat tagihan</b>. Tagihan lain (mis. tambahan) lewat <b>+ Tagihan</b>.</>,
      <>Buka tagihan untuk <b>Cetak / PDF</b> atau <b>Kirim WA</b> ke klien — rekening pembayaran dari Pengaturan ikut tercantum.</>,
      <>Uang masuk? Tekan <b>Catat bayar</b> di tagihannya, atau <b>+ Terima pembayaran</b> untuk DP yang langsung ditransfer tanpa tagihan. Pilih bank/kas dan tanggalnya. Pembayaran langsung tercatat di Kas & Pembukuan.</>,
      <>Selama milestone belum diserahkan, uang itu tercatat sebagai <b>uang muka</b> (belum pendapatan). Saat milestone bernilai dicentang selesai, nilainya menjadi <b>pendapatan</b>; bila klien belum membayar, kekurangannya menjadi <b>piutang</b>. Saat proyek ditandai selesai, sisa nilai kontrak ikut diakui.</>,
      <>Acara batal padahal DP sudah masuk? Pakai <b>Kembalikan uang muka</b> (uang keluar dari kas/bank) dan/atau <b>Uang muka hangus</b> (sesuai kontrak; menjadi pendapatan lain, tanpa uang keluar).</>,
    ], <>Salah catat pembayaran? Tekan <b>Batal</b> dan tulis alasannya — Pembukuan dikoreksi otomatis. Tagihan yang sudah dibayar tidak bisa dibatalkan sebelum pembayarannya dibatalkan. Pembayaran tetap bisa dicatat walau paket turun; membuat tagihan baru butuh Paket Bisnis. Tab <b>Laba proyek</b> kini juga menampilkan uang diterima, pendapatan diakui, dan tagihan yang lewat jatuh tempo.</>, 'warn', <ScrTagihanProyek />, 'bisnis'],
  ]],
  ['AI', 'Toko: Portal pelanggan grosir (pelanggan memesan sendiri)', [
    ['Membuat & membagikan link portal', 'Transaksi › Pesanan grosir › Portal pelanggan (Paket Pro)', [
      <>Atur dulu syarat pelanggan (daftar harga, batas kredit, tempo, alamat) di <b>Pelanggan & supplier › Syarat pelanggan</b> — portal memakai harga dan syarat itu.</>,
      <>Buka <b>Pesanan grosir</b> › tab <b>Portal pelanggan</b> › cari pelanggan › <b>Buat link</b>.</>,
      <>Tekan <b>Kirim WA</b> (pesan berisi link pribadi) atau <b>Salin link</b>. Pelanggan cukup membuka link — tanpa daftar akun atau kata sandi. Daftar menampilkan kapan link terakhir dibuka.</>,
      <>Link bocor atau pelanggan berhenti? <b>Ganti link</b> (link lama langsung mati) atau <b>Matikan</b>.</>,
    ], <>Portal hanya menampilkan harga milik pelanggan itu (daftar harga khusus › harga outlet/grosir › eceran, lalu harga beli banyak) dan status <b>Tersedia</b>/<b>Stok terbatas</b> — angka stok, harga modal, dan pelanggan lain tidak pernah terlihat. Barang tanpa harga jual tidak muncul. Promo Kasir tidak berlaku di portal.</>, 'warn', null],
    ['Pelanggan memesan, penjual mengonfirmasi', 'Link portal (pelanggan) · Pesanan grosir › Penawaran (penjual)', [
      <>Pelanggan: tab <b>Pesan barang</b> › cari/pilih kategori › ketuk <b>+ satuan</b> dan atur jumlah › <b>Lanjut pesan</b>. Pilih <b>Pesan sekarang</b> atau <b>Minta penawaran dulu</b>, isi tanggal dibutuhkan, No. PO, alamat kirim, catatan › <b>Kirim</b>. Muncul nomor pesanan dan langkah berikutnya.</>,
      <>Penjual: pesanan masuk ke <b>Pesanan grosir › Penawaran</b> bertanda <b>Baru dari portal</b>, juga di lonceng & Pengingat toko (dan email bila diaktifkan di Pengaturan). Buka, periksa stok & batas kredit, <b>Ubah</b> bila perlu, lalu <b>Konfirmasi pesanan pelanggan</b>. Selanjutnya sama: surat jalan → faktur → piutang.</>,
      <>Pelanggan memantau di tab <b>Pesanan</b> (status, jumlah terkirim, surat jalan, nomor faktur), bisa <b>Pesan lagi</b> dari pesanan lama, dan <b>Batalkan</b> selama belum dikonfirmasi. Tab <b>Tagihan</b>: sisa tagihan, batas kredit, faktur & jatuh tempo, pembayaran yang sudah dicatat, cara bayar, tombol kirim bukti lewat WhatsApp.</>,
    ], <>Pesanan portal belum mengubah stok atau uang sampai dikirim. Harga terkunci saat pelanggan memesan (dihitung server, bukan dari HP pelanggan). Melewati batas kredit tetap bisa dikirim pelanggan — penjual yang memutuskan saat konfirmasi (aturan batas kredit sama). Batas wajar: 10 pesanan per jam & 20 pesanan menunggu per pelanggan.</>, 'warn', <ScrPortalPelanggan />],
  ]],
  ['AJ', 'Keuangan: Daftar risiko', [
    ['Mencatat, menangani & meninjau risiko', 'Keuangan › Daftar risiko (Paket Bisnis)', [
      <><b>Saran dari data</b> muncul bila Pembukuan menunjukkan tanda bahaya: kas lebih kecil dari biaya sebulan, usaha merugi, cicilan pinjaman 12 bulan melebihi kas, piutang/tagihan lewat jatuh tempo, margin kotor sangat tipis, atau kas habis pada stress test. Ketuk <b>Masukkan ke daftar</b> (bisa diubah dulu) atau <b>Abaikan 90 hari</b> — tidak ada yang tercatat tanpa keputusan Anda. Pengelola tanpa akses keuangan hanya melihat saran dari tagihan/piutang yang lewat jatuh tempo.</>,
      <><b>+ Risiko baru</b>: judul, kategori, <b>kemungkinan</b> dan <b>dampak</b> (1–5), cara menangani (kurangi/hindari/alihkan/terima), rencana penanganan, nilai setelah ditangani (opsional), <b>penanggung jawab (PIC)</b>, target selesai, dan jarak tinjau (mis. setiap 30 hari).</>,
      <><b>Peta risiko</b> 5×5 menunjukkan jumlah risiko per kemungkinan × dampak — ketuk kotak untuk menyaring. Skor 1–4 rendah, 5–9 sedang, 10–14 tinggi, 15–25 sangat tinggi.</>,
      <>Saat jadwal tinjau tiba, tanggalnya berwarna merah: buka risiko › <b>Tinjau ulang</b> untuk menilai ulang kemungkinan & dampak; jadwal berikutnya bergeser otomatis.</>,
      <>PIC (karyawan mana pun) melihat menu <b>Daftar risiko</b> berisi risiko miliknya saja dan menekan <b>Tulis perkembangan</b> (status + catatan). Hanya pemilik/pengelola yang mengubah nilai atau menutup risiko. Bila akses karyawan dinonaktifkan, ia tidak bisa lagi memperbarui risiko — pilih PIC baru.</>,
    ], <>Dikelola pemilik atau karyawan berizin Keuangan/Pengaturan. Setiap perubahan, tinjauan, dan perkembangan tercatat di riwayat risiko; pembuatan & penutupan juga di Konfigurasi › Riwayat. Daftar ini catatan pengelolaan internal, bukan penilaian resmi pihak luar.</>, null, null, 'bisnis'],
  ]],
  ['AK', 'Analisis: Laporan investor (Paket Pro)', [
    ['Menyusun, menyetujui & mengirim laporan investor', 'Analisis Bisnis › Laporan & Portofolio › Laporan investor', [
      <>Ketuk <b>+ Laporan baru</b>: judul dan periode (bawaan = triwulan terakhir yang sudah lewat, maks. sekitar 1 tahun = 400 hari; pembanding juga maks. 400 hari) → <b>Buat draf</b>.</>,
      <><b>Ubah isi</b>: pembanding (opsional), tulis <b>Ringkasan eksekutif</b>, <b>Pembahasan & analisis manajemen</b>, <b>Prospek & rencana</b>, dan catatan; pilih <b>skenario</b> & <b>valuasi</b> versi tersimpan yang dilampirkan; centang bagian yang disertakan (laporan keuangan, perubahan ekuitas, arus kas, rasio, KPI industri, skenario, risiko, valuasi, metodologi).</>,
      <>Pratinjau A4 langsung di bawahnya: sampul, daftar isi, bagian bernomor. Angka draf = angka terkini Pembukuan.</>,
      <>Bagian keuangan menekan <b>Ajukan ke pemilik</b>; pemilik menekan <b>Finalkan</b> (atau <b>Tolak</b> dengan alasan). Pemilik juga boleh langsung memfinalkan draf.</>,
      <>Saat final, semua angka <b>dibekukan</b> dan laporan diarsip: tidak bisa diubah atau dihapus walau transaksi lama dikoreksi. Perlu perubahan? <b>Buat revisi</b> (draf baru, laporan final lama tetap utuh).</>,
      <><b>Cetak / Simpan PDF</b>: di HP pilih “Simpan sebagai PDF”, ukuran A4. Kirim PDF itu ke investor lewat WA/email.</>,
    ], <>Laporan investor memakai rumus yang sama dengan layar Analisis Bisnis (laba rugi, neraca, rasio, KPI, skenario, risiko, valuasi) dan menulis jelas bahwa ini <b>bukan laporan keuangan yang diaudit</b>; proyeksi & valuasi berlabel estimasi. Paket Bisnis tetap melihat semua bahannya di Analisis Bisnis.</>, 'warn', null, 'pro'],
  ]],
  ['AL', 'Rekap Bisnis: hasil & aktivitas per periode', [
    ['Membaca rekap harian sampai tahunan', 'Rekap Bisnis (tepat di bawah Analisis Bisnis)', [
      <>Pilih <b>Harian, Mingguan, Bulanan, Kuartalan, Tahunan</b>, atau <b>Kustom</b>; geser periode dengan tombol <b>‹ ›</b> atau ketuk nama periode untuk memilih tanggal/bulan. Batas periode memakai waktu Jakarta.</>,
      <>Kotak atas: <b>Total pendapatan</b>, <b>HPP</b>, <b>Biaya operasional</b>, <b>Laba bersih</b>, dan <b>Total transaksi</b>, masing-masing dengan perbandingan ke periode sebelumnya. <b>Filter</b> mengganti pembanding (periode sebelumnya / tahun lalu / tanpa) dan lokasi (Paket Pro).</>,
      <>Grafik <b>Komposisi keuangan</b> (HPP, operasional, laba), <b>Tren pendapatan</b> dan <b>Tren transaksi</b> — pilih <b>Dalam periode</b> (per hari/bulan) atau <b>Antarperiode</b> (6 bulan, 8 minggu, 4 kuartal, 3 tahun terakhir; ketuk titik untuk membuka periode itu).</>,
      <>Kartu rekap mengikuti jenis bisnis dan modul yang aktif: penjualan per kategori (toko), pesanan & layanan/menu (jasa, kuliner), hunian & tagihan (kos), pembelian per supplier, pergerakan persediaan, piutang & utang, kas & bank, pelanggan, karyawan, aset, pajak, perubahan modal, proyek, dan timeline aktivitas. Di HP kartu tampil sebagai kotak kategori yang dibuka di lembar bawah.</>,
      <><b>Semua angka, baris tabel, dan titik grafik bisa diketuk</b>: muncul cara hitung, pembanding, <b>transaksi sumber</b> (struk, nota, belanja, pengeluaran, gerak stok, pembayaran) dan <b>baris jurnal</b> dengan tautan bukti, plus tombol ke modul asal dengan periode yang sama (mis. Penjualan tanggal itu, Belanja/Pengeluaran/Pembayaran bulan itu).</>,
    ], <>Angka uang dari jurnal Pembukuan (sama dengan Laporan & Analisis Bisnis). <b>Kas masuk bukan pendapatan</b> (termasuk setoran modal, pinjaman, pelunasan piutang); setoran modal & prive mengubah modal, bukan laba. Status di atas kartu: <b>Periode berjalan</b> (angka sementara), <b>Belum direkonsiliasi</b>, <b>Sudah direkonsiliasi</b> (rekonsiliasi bank & tutup harian), <b>Sudah ditutup</b> (tutup buku di Pembukuan); <b>Belum lengkap</b> bila ada penjualan tanpa harga modal, bukti bayar menunggu, atau transaksi offline perlu dicek.</>, 'info'],
    ['Arsip rekap, ekspor & pemberitahuan', 'Rekap Bisnis › Arsip / Ekspor PDF / Excel', [
      <>Rekap <b>mingguan, bulanan, kuartalan, dan tahunan diarsipkan otomatis</b> setiap pagi setelah periodenya selesai. Periode lain (harian, kustom) bisa diarsipkan lewat <b>Arsip › Arsipkan</b> setelah periodenya lewat.</>,
      <>Arsip tidak bisa diubah. Bila transaksi periode lama dikoreksi, rekap menandai <b>Data sumber berubah</b> dan membuat <b>versi baru</b> (otomatis untuk 2 bulan terakhir, atau tombol <b>Simpan versi baru</b>); versi lama tetap bisa dibuka dan dibandingkan.</>,
      <><b>Ekspor PDF / Excel</b> berisi ringkasan + pembanding, laba rugi, tren, antarperiode, kas & bank, penjualan, pembelian, persediaan, utang-piutang, pelanggan, karyawan, aset, pajak & modal (memakai kuota ekspor paket). Ada juga <b>Cetak halaman</b> dan <b>Bagikan ringkasan</b> (WhatsApp/email).</>,
      <>Arsip otomatis & versi koreksi muncul di <b>Notifikasi</b> (kos) atau <b>Pengingat</b> (toko/jasa) selama 7 hari.</>,
    ], <>Hanya pemilik & karyawan berizin Keuangan. Penutupan periode tetap dilakukan di Pembukuan (Periode & manual) — Rekap hanya menampilkan statusnya dan tautan ke sana.</>, 'info'],
  ]],
  ['AM', 'Analisis: Konsolidasi beberapa bisnis (Paket Pro)', [
    ['Menggabungkan bisnis dengan eliminasi & bagian pemilik lain', 'Analisis Bisnis › Laporan & Portofolio › Konsolidasi · Pelanggan & supplier', [
      <>Di tiap bisnis, buka <b>Pelanggan & supplier</b> → kontak yang sebenarnya bisnis Anda sendiri (mis. “Warung B” sebagai pelanggan Toko A) → <b>Kontak ini bisnis saya sendiri?</b> → pilih bisnisnya.</>,
      <>Buka <b>Konsolidasi</b> → <b>+ Grup</b>: beri nama, centang minimal dua bisnis, isi <b>persen kepemilikan</b> Anda (bawaan 100%). Minimal satu bisnis Paket Pro.</>,
      <>Pilih periode (Bulan ini / Bulan lalu / Tahun ini / tanggal bebas, maks. 400 hari). Tabel <b>Laba rugi</b> & <b>Neraca gabungan</b> menampilkan angka per bisnis, kolom <b>Eliminasi</b>, dan <b>Gabungan</b>. Bila ada bisnis yang belum punya neraca (Neraca mulai Paket Bisnis di bisnis itu), neraca gabungan dan ekuitas bagian pemilik lain <b>ditahan</b> — tidak dianggap nol; laba rugi gabungan tetap tampil.</>,
      <>Eliminasi otomatis: penjualan antarbisnis (pendapatan ↔ harga pokok) sebesar yang dicatat bisnis pembeli sebagai <b>pembelian barang</b> (menu Belanja), dan piutang ↔ utang antarbisnis yang masih terbuka. Bila pembeli mencatatnya sebagai pengeluaran (mis. jasa), sisanya ditandai <b>belum dieliminasi</b> — tambahkan eliminasi manual “Lainnya” dengan pos Beban operasional & Pendapatan usaha. Isi <b>% barang antarbisnis yang sudah dijual lagi</b> — sisanya dianggap masih di gudang pembeli sehingga laba penjual atasnya belum dihitung. Persen ini otomatis dibatasi harga pokok penjualan yang benar-benar dicatat bisnis pembeli (barang yang belum terjual tidak bisa dianggap terjual).</>,
      <><b>+ Eliminasi manual</b> untuk kasus lain (mis. pinjaman antarbisnis): jenis, tanggal, jumlah, alasan wajib. Salah catat? <b>Batal</b> dengan alasan.</>,
      <>Bila kepemilikan di bawah 100%, ringkasan memisahkan laba & ekuitas <b>milik Anda</b> dan <b>pemilik lain</b> (kepentingan nonpengendali).</>,
    ], <>Berbeda dengan Ringkasan multi-bisnis yang hanya menjumlahkan. Batasan: tanpa goodwill/biaya investasi; laba belum terjadi berdasarkan perkiraan persen Anda; piutang/utang antarbisnis otomatis hanya untuk periode yang berakhir hari ini atau sesudahnya; bisnis kos mencatat pendapatan sewa saat uang diterima (basis kas) sedangkan toko/jasa saat transaksi terjadi, jadi gabungan kos + toko mencampur dua basis. Laporan pengelolaan internal, bukan laporan konsolidasi yang diaudit.</>, 'warn', null, 'pro'],
  ]],
  ['AN', 'Notifikasi di HP & komputer (Pusat Notifikasi)', [
    ['Mengaktifkan notifikasi di perangkat Anda', 'Lonceng › Pengaturan › Aktifkan Notifikasi', [
      <>Di Beranda muncul kartu <b>Jangan lewatkan aktivitas penting bisnis Anda</b> (bisa <b>Nanti saja</b>). Atau buka lonceng › <b>Pengaturan</b>. PRASARA mendeteksi perangkat Anda dan hanya menampilkan langkah yang cocok.</>,
      <><b>Android, Windows, Mac, Chromebook</b> (Chrome, Edge, Firefox, Samsung Internet): ketuk <b>Aktifkan Notifikasi</b> → browser bertanya sekali → <b>Izinkan</b>. Memasang PRASARA ke layar utama tidak wajib.</>,
      <><b>iPhone/iPad</b> (iOS 16.4 ke atas): di Safari ketuk <b>Bagikan</b> → <b>Tambahkan ke Layar Utama</b> → buka PRASARA dari <b>ikon P</b> → masuk → <b>Aktifkan Notifikasi</b> → <b>Izinkan</b>.</>,
      <>Setelah aktif, pesan <b>“Perangkat baru menerima notifikasi”</b> masuk sebagai bukti. Tombol <b>Kirim notifikasi uji</b> bisa dipakai kapan saja (maks. 5 kali per jam).</>,
      <>Izin terlanjur ditolak? Buka <b>Bantuan notifikasi</b> untuk cara mengizinkan per browser/HP. Keluar akun di sebuah perangkat otomatis menghentikan notifikasinya.</>,
    ], <>Tidak perlu aplikasi dari Play Store/App Store, email, atau WhatsApp. Push memakai layanan bawaan browser (gratis). Perangkat yang tidak mendukung tetap bisa memakai PRASARA; notifikasi tersimpan di Pusat Notifikasi.</>, 'info', <ScrNotifAktif />],
    ['Membaca & mengelola notifikasi', 'Lonceng › Lihat semua notifikasi', [
      <>Angka di lonceng = <b>belum dibaca</b> + hal yang <b>perlu ditindaklanjuti</b> (pembayaran menunggu, tagihan telat, pengingat toko). Di laptop/tablet lonceng membuka daftar singkat; di HP langsung ke Pusat Notifikasi.</>,
      <>Pilih kategori (<b>Penjualan, Pembelian, Keuangan, Inventaris, Karyawan, Pelanggan, Pengingat, Sistem & keamanan</b>), cari kata, atau centang <b>Belum dibaca</b>, <b>Arsip</b>, <b>Semua bisnis</b>.</>,
      <>Ketuk notifikasi → <b>Detail</b> (modul, waktu, prioritas, status pengiriman push) → <b>Buka …</b> ke halaman sumbernya. Notifikasi dari bisnis lain otomatis memindahkan bisnis aktif.</>,
      <>Tombol <b>⋯</b>: tandai dibaca/belum, arsipkan, hapus. <b>Tandai semua dibaca</b> membersihkan lonceng.</>,
    ], <>Notifikasi dibuat dari transaksi nyata: pesanan & permintaan dari halaman bisnis, prospek baru, bukti pembayaran penghuni, stok menipis/habis, persetujuan, tugas proyek, penjualan offline perlu dicek, perangkat baru & perubahan hak akses, serta pengingat pagi (tagihan jatuh tempo, pesanan terlambat). Anda hanya menerima yang sesuai izin modul Anda, dan tidak diberi tahu tentang tindakan Anda sendiri. Peristiwa beruntun digabung (mis. “12 penjualan baru”).</>, 'info', <ScrNotifCenter />],
    ['Kategori, jam tenang, suara & perangkat', 'Lonceng › Pengaturan · Perangkat terhubung', [
      <>Per kategori pilih <b>Dalam aplikasi</b> (lonceng) dan <b>Push</b> (layar HP/komputer). Bawaan: penjualan & pengeluaran harian tanpa push agar HP tidak terus berbunyi. Atur <b>Push untuk prioritas</b> bila hanya ingin yang penting.</>,
      <><b>Jam tenang</b>: jam mulai & selesai, zona waktu, hari. Push selain kritis ditahan sampai jam tenang selesai (notifikasi tetap tersimpan).</>,
      <><b>Suara khusus PRASARA</b> berbunyi saat aplikasi sedang terbuka (ada tombol Coba); saat tertutup HP memakai bunyi notifikasi bawaannya. <b>Getar</b> (Android) dan <b>Sembunyikan nominal di layar kunci</b> (bawaan aktif: “Rp •••”).</>,
      <><b>Perangkat terhubung</b>: semua HP/laptop yang menerima push akun Anda — matikan sementara, ganti nama, atau <b>Hapus</b> perangkat yang tidak dikenal (maks. 10 aktif).</>,
    ], <>Kategori & prioritas berlaku per bisnis; jam tenang, suara, dan privasi berlaku untuk semua bisnis Anda. Notifikasi kritis (keamanan akun) selalu masuk dan tidak ditunda.</>, 'info', <ScrNotifSet />],
  ]],
  ['AO', 'Learning Center & Panduan Interaktif', [
    ['Belajar bertahap dan mengulang panduan', 'Panduan & Bantuan → Learning Center', [
      <>Mulai dengan rekomendasi sesuai kategori, hak akses, dan modul aktif. Buka Memulai untuk checklist, Materi untuk pelajaran modul, atau Progres untuk memilih dari delapan tahap transaksi.</>,
      <>Untuk Retail & Grosir, buka Kasir atau Learning Center lalu pilih Coba Kasir DEMO. Tambahkan barang, tekan Bayar DEMO, periksa transaksi, dan lihat bukti latihan. Untuk latihan lanjutan, buka Pusat Praktik dan pilih mode terpandu, mandiri, atau tantangan. Gunakan item contoh, periksa pembayaran dan kembalian, lalu pilih Simpan simulasi untuk melihat bukti DEMO.</>,
      <>Gunakan peta hubungan antarmodul, materi koreksi, dan evaluasi untuk memeriksa kesiapan. Pengingat belajar di Pusat Notifikasi dapat dimatikan dari Progres. Asisten Bisnis mencari jawaban di dokumentasi internal.</>,
      <>Pilih <b>? Panduan</b> di halaman modul untuk tur bersorot (Langkah 148). Untuk mengulang onboarding, buka <b>Panduan &amp; Bantuan</b>.</>,
      <>Fokuskan kolom lalu pilih <b>Bantuan kolom</b> atau tekan F1 untuk melihat petunjuk pengisian.</>,
    ], <>Progres transaksi disinkronkan untuk anggota bisnis aktif saat tersambung. Draf latihan dan preferensi pengingat tetap tersedia di peramban yang sama. Pelanggan mendapat panduan sesuai halaman publik yang dibuka.</>, 'info'],
    ['Tur panduan interaktif: ulangi onboarding & tur setiap modul', 'Panduan & Bantuan → Tur panduan interaktif · tombol ? Panduan', [
      <><b>Panduan awal PRASARA</b> (onboarding) muncul di Beranda untuk pengguna baru dan bisa diulang kapan saja: Panduan &amp; Bantuan › Tur panduan interaktif › <b>Mulai / Lanjutkan / Ulangi</b>. Tur menyorot bisnis aktif, menu (menu bawah di HP, menu kiri di tablet & laptop), tombol <b>(+)</b>, pencarian, lonceng, dan tombol ? Panduan.</>,
      <>Setiap halaman punya tombol <b>? Panduan</b>. Tur menyorot bagian yang BENAR-BENAR tampil untuk bisnis, peran, paket, dan perangkat Anda — judul halaman, tombol yang disebut di langkah (mis. <b>+ Kamar</b>), kotak cari & filter, tab, daftar data, dan dashboard. Langkah yang bagiannya tidak tampil dijelaskan tanpa sorotan.</>,
      <>Kendali di kartu langkah: <b>Lanjutkan ›</b>, <b>‹ Sebelumnya</b>, <b>Jeda</b> (tombol halaman berubah jadi <b>▶ Lanjutkan panduan</b>), <b>Lewati</b>, <b>Ulangi</b>. Di laptop: panah ← → dan Esc (jeda). Halaman tetap bisa dipakai selama tur berjalan.</>,
      <>Daftar tur menampilkan status tiap modul (Selesai, Dijeda, Dilewati) dan jumlah yang selesai. Ketuk <b>Mulai</b> pada modul: halamannya terbuka dan tur berjalan otomatis. Saring <b>Belum selesai</b>, atau <b>Atur ulang progres panduan</b> untuk mulai lagi dari nol. Daftar ringkas juga ada di Learning Center › Memulai.</>,
    ], <>Tur hanya menunjukkan: tidak menekan tombol, mengisi formulir, atau menyimpan apa pun ke data bisnis — jadi aman diulang berkali-kali. Progresnya disimpan di akun Anda per bisnis &amp; peran (tanpa data bisnis), sehingga bisa dilanjutkan dari HP atau laptop lain; saat offline tetap tersimpan di perangkat dan dikirim saat tersambung. Karyawan hanya melihat tur modul yang boleh dibukanya. Pelanggan mendapat tombol Panduan sendiri di halaman bisnis, cek pesanan, dan portal.</>, 'info', <ScrTurPanduan />],
  ]],
];

const RULES = [
  'Jika opname langsung membetulkan salah ketik stok awal, buka Barang & stok › Stok › Riwayat stok. Pilih Koreksi salah input pada opname terkait, periksa jumlah dan dampak laporan, lalu isi alasan. Stok fisik tetap sesuai saldo terakhir.',
  'Catat semua uang keluar, sekecil apa pun — termasuk yang diambil pemilik untuk pribadi (prive). Saldo kas hanya cocok jika semuanya tercatat.',
  'Transfer dan QRIS dicatat sebagai diterima hanya setelah uang benar-benar masuk ke rekening.',
  'Penghuni lama: isi "Sewa dihitung mulai" dengan awal periode berikutnya yang belum dibayar.',
  'Kas bersih bukan laba. Lihat Laporan untuk laba, dan Tunggakan untuk uang yang belum tertagih.',
];

export default function Panduan() {
  let n = 0;
  return (
    <div className="lp">
      <HitungKunjungan path="/panduan" />
      <LandingNav />
      <div className="guide">
        <h1>Panduan PRASARA</h1>
        <p className="muted" style={{ margin: 0 }}>Langkah demi langkah memakai PRASARA untuk kos (kamar, penghuni, tagihan, pembayaran, laporan) toko (kasir, stok, belanja, kas, laporan), dan jasa/laundry (pesanan, tahap proses, nota, keluhan), termasuk karyawan.</p>

        <h2 style={{ color: 'var(--brand-2)' }}>Cara berpindah menu</h2>
        <ul style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Di HP, menu bawah berisi <b>Beranda</b>, <b>menu utama bisnis Anda</b> (toko: Transaksi, kos: Kamar, laundry/kuliner: Pesanan, bisnis kustom: jenis data utama), tombol <b>(+)</b> di tengah yang <b>selalu ada</b> (aksi cepat sesuai bisnis & halaman), <b>Laporan</b>, dan <b>Akun</b> (Langkah 109).</li>
          <li>Tombol <b>☰</b> di kanan atas membuka menu samping berisi kelompok menu sesuai jenis bisnis (dan <b>Semua modul</b>); ikon <b>🔍</b> mencari menu. Pilihan <b>Tampilan</b> (Terang / Gelap / Ikuti HP — bawaannya Terang) dan Keluar ada di <b>Akun</b>.</li>
          <li>Ikon <b>Bagikan</b> (panah ke atas) di pojok kanan atas: tautan & <b>QR code</b> halaman bisnis, siap dikirim atau dicetak, dari menu mana pun.</li>
          <li>Di <b>tablet</b> (lebar layar 768 px ke atas), menu tampil sebagai <b>deretan ikon di kiri</b>. Ketuk ikon kelompok untuk membuka daftar menunya, atau ketuk <b>☰</b> di kiri atas untuk menu lengkap dengan nama.</li>
          <li>Di <b>laptop & komputer</b>, menu ada di <b>sidebar kiri</b> dengan bagian sesuai jenis bisnis, mis. toko: <b>Workspace</b> (Penjualan, Pembelian, Persediaan, Pelanggan, Keuangan, Laporan) dan <b>Sistem</b>; kos: <b>Workspace</b> (Kamar, Penghuni, Booking, Perawatan), <b>Manajemen</b> (Tagihan, Pembayaran, Pengeluaran, Keuangan, Laporan), <b>Sistem</b>. Pintasan pilihan pemilik tampil paling atas. Klik nama kelompok untuk membuka submenu. Tombol <b>‹</b> di samping logo (atau <b>☰</b>) menciutkan sidebar menjadi ikon saja; pilihan ini diingat di perangkat itu. Saat diciutkan, arahkan kursor ke ikon untuk melihat namanya.</li>
          <li>Bagian atas laptop/tablet berisi <b>kotak cari menu</b> (tekan <b>Ctrl K</b> atau <b>/</b> untuk langsung mengetik), tombol <b>+ Aksi cepat</b>, <b>Bantuan</b>, <b>Notifikasi</b>, <b>Bagikan</b>, dan <b>profil</b> (Akun & tampilan, Ganti bisnis, Panduan, Keluar). Di atas judul tiap halaman ada <b>jejak lokasi</b>, mis. Beranda / Penjualan / Riwayat.</li>
          <li>Isi menu di semua perangkat sama: hanya modul yang sesuai jenis bisnis, paket, modul aktif, dan peran Anda.</li>
          <li>Daftar data (mis. <b>Penjualan</b>, <b>Barang & stok</b>, <b>Pelanggan & supplier</b>, <b>Tagihan</b>, <b>Pembayaran</b>, <b>Penghuni</b>, <b>Pesanan</b>, <b>Pengeluaran</b>, <b>Karyawan</b>, <b>Kas & kasbon</b>, <b>Belanja</b>, <b>Aset tetap</b>, <b>Booking kamar</b>, <b>Pesanan grosir</b>, <b>Prospek</b>, <b>Keluhan & perbaikan</b>, <b>Promo</b>, dan catatan bisnis jenis lain) tampil sebagai <b>tabel</b> di laptop — klik judul kolom (mis. Total, Waktu, Stok) untuk mengurutkan, klik sekali lagi untuk membalik urutan. Di HP, data yang sama tampil sebagai <b>kartu</b>. Bila datanya banyak, gunakan tombol <b>‹ ›</b> di bawah daftar untuk pindah halaman (di laptop jumlah per halaman bisa dipilih).</li>
          <li><b>Ketuk nama bisnis di kiri atas</b> untuk pindah bisnis atau menambah bisnis baru.</li>
          <li>Karyawan hanya melihat menu sesuai perannya.</li>
        </ul>
        <h2 style={{ color: 'var(--brand-2)' }}>Menu kos (Properti & Sewa)</h2>
        <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="g-table"><thead><tr><th>Menu</th><th>Dipakai untuk</th></tr></thead>
            <tbody>{MENUS.map(([m, t]) => <tr key={m}><td><b>{m}</b></td><td>{t}</td></tr>)}</tbody></table>
        </div>
        <h2 style={{ color: 'var(--brand-2)' }}>Menu toko (Retail & Grosir)</h2>
        <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="g-table"><thead><tr><th>Menu</th><th>Dipakai untuk</th></tr></thead>
            <tbody>{MENUS_TOKO.map(([m, t]) => <tr key={m}><td><b>{m}</b></td><td>{t}</td></tr>)}</tbody></table>
        </div>

        <h2 style={{ color: 'var(--brand-2)' }}>Menu jasa (Jasa & Laundry)</h2>
        <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="g-table"><thead><tr><th>Menu</th><th>Dipakai untuk</th></tr></thead>
            <tbody>{MENUS_JASA.map(([m, t]) => <tr key={m}><td><b>{m}</b></td><td>{t}</td></tr>)}</tbody></table>
        </div>

        <h2 style={{ color: 'var(--brand-2)' }}>Urutan panduan</h2>
        <div className="g-order">
          <div><b>Persiapan</b><span><a href="#bagian-A">Langkah 1–5</a><br />Daftar, kamar, penghuni</span></div>
          <div><b>Setiap bulan</b><span><a href="#bagian-B">Langkah 6–13</a><br />Tagihan, bayar, pengingat, biaya</span></div>
          <div><b>Pengecekan</b><span><a href="#bagian-C">Langkah 14–17</a><br />Dashboard, laporan, kwitansi</span></div>
          <div><b>Akun & otomatis</b><span><a href="#bagian-D">Langkah 18–24</a><br />Langganan, portal, pengingat</span></div>
          <div><b>Toko</b><span><a href="#bagian-E">Langkah 25–30</a><br />Barang, kasir, belanja, kas, laporan</span></div>
          <div><b>Karyawan & lainnya</b><span><a href="#bagian-F">Langkah 31–44</a><br />Karyawan, kontak, shift, label, konfigurasi, persetujuan, otomatisasi, pembukuan, lokasi, saran, ekspor & tutup bisnis, prospek, halaman bisnis</span></div>
          <div><b>Jasa & Laundry</b><span><a href="#bagian-G">Langkah 45–50</a><br />Layanan & tahap, pesanan, nota, proses, bayar, keluhan, bahan, laporan</span></div>
          <div><b>Business Builder</b><span><a href="#bagian-I">Langkah 55–62</a><br />Bisnis kustom: data & field, alur & peran, laporan, validasi, catatan, uang masuk & kas; isian tambahan di menu bawaan</span></div>
          <div><b>Kos lanjutan</b><span><a href="#bagian-H">Langkah 51–54</a><br />Deposit, keluhan & perbaikan, meteran listrik/air, booking kamar</span></div>
          <div><b>Lampiran</b><span><a href="#bagian-J">Langkah 63</a><br />Foto nota, kerusakan, dokumen penghuni, foto pesanan</span></div>
          <div><b>Setup bisnis baru</b><span><a href="#bagian-K">Langkah 64</a><br />Pusat Konfirmasi: lengkapi, setujui, aktifkan</span></div>
          <div><b>Antar jemput laundry</b><span><a href="#bagian-L">Langkah 65–66</a><br />Wilayah, biaya, jadwal, jemput & antar, pesanan dari halaman bisnis</span></div>
          <div><b>Foto & media</b><span><a href="#bagian-O">Langkah 71</a><br />Foto kamar, barang, layanan, cover & galeri; pustaka media</span></div>
          <div><b>Analisis Bisnis</b><span><a href="#bagian-P">Langkah 72</a><br />Skor kesehatan, insight, tren & proyeksi, laba rugi, arus kas, produk, pelanggan, risiko, ekspor</span></div>
          <div><b>Riwayat aktivitas</b><span><a href="#bagian-Q">Langkah 73</a><br />Siapa melakukan apa & kapan, tercatat otomatis</span></div>
          <div><b>Pendaftaran penghuni online</b><span><a href="#bagian-N">Langkah 70</a><br />Calon penghuni daftar & bayar DP/lunas dari halaman kos, Anda konfirmasi sekali</span></div>
          <div><b>Tampilan adaptif</b><span><a href="#bagian-AD">Langkah 109–118</a><br />Menu sesuai bisnis, tombol (+), Pusat Pengalaman, dashboard adaptif, Alur kerja: peta proses, aturan karyawan, alur siap pakai, versi & saran; Integrasi: sambungkan formulir website & aplikasi lain; Kinerja: fitur yang benar-benar dipakai</span></div>
          <div><b>Proyek</b><span><a href="#bagian-AH">Langkah 132–136</a><br />Event, kreatif &amp; produksi: penawaran & scope, anggaran & laba proyek, tagihan termin & pembayaran, klien, milestone, tugas tim, anggota, status</span></div>
          <div><b>Notifikasi</b><span><a href="#bagian-AN">Langkah 141–143</a><br />Aktifkan di HP/komputer (iPhone lewat Layar Utama), Pusat Notifikasi, kategori, jam tenang, perangkat</span></div>
          <div><b>Learning Center</b><span><a href="#langkah-147">Langkah 147</a><br />Belajar, simulasi, evaluasi, dan ulangi panduan</span></div>
          <div><b>Tur panduan interaktif</b><span><a href="#langkah-148">Langkah 148</a><br />Ulangi onboarding &amp; tur ? Panduan tiap modul</span></div>
          <div><b>Kuliner & usaha lain</b><span><a href="#bagian-M">Langkah 67–69</a><br />Menu, meja/bungkus/antar, layar dapur, QR per meja, tagihan per meja & split bill, reservasi; template kursus, rental, klinik, dll.</span></div>
        </div>
        <div className="g-note"><b>Catatan:</b> nama penghuni, nomor, alamat, dan angka di gambar adalah <b>data contoh</b> untuk ilustrasi, bukan data kos Anda.</div>

        <h2 style={{ color: 'var(--brand-2)' }}>Cara kerja otomatisnya</h2>
        <ol style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Saat penghuni <b>mulai sewa</b>, kamar menjadi Terisi dan tagihan sewa bulanan berjalan sendiri.</li>
          <li>Setiap <b>pembayaran</b> mengurangi sisa tagihan; status Lunas, Sebagian, atau Menunggak dihitung otomatis.</li>
          <li>Saat sewa <b>diakhiri</b>, kamar kembali Tersedia dan tagihan bulan berikutnya dibatalkan.</li>
          <li><b>Laba</b> = pembayaran diterima − biaya operasional. Belanja modal dan uang yang diambil pemilik (prive) <b>bukan biaya</b>, tetapi mengurangi kas.</li>
          <li>Data tersimpan aman di server dan bisa dibuka dari HP maupun laptop. Setiap pemilik hanya melihat datanya sendiri.</li>
        </ol>

        {PARTS.map(([code, partTitle, steps]) => (
          <section key={code} id={`bagian-${code}`} style={{ scrollMarginTop: 70 }}>
            <div className="g-part">Bagian {code} · {partTitle}</div>
            {steps.map(([title, menu, items, note, noteKind, screen, std]) => {
              n += 1;
              return (
                <article key={title} id={`langkah-${n}`} className="g-step">
                  <div>
                    <h3>Langkah {n} · {title}{std === 'pro' ? <Pro /> : std === 'bisnis' ? <Bis /> : std && <Std />}</h3>
                    <p className="g-menu">Menu: <b>{menu}</b></p>
                    <ol>{items.map((it, i) => <li key={i}>{it}</li>)}</ol>
                    {note && <div className={'g-note' + (noteKind === 'warn' ? ' warn' : '')}>{note}</div>}
                  </div>
                  {screen}
                </article>
              );
            })}
          </section>
        ))}

        <div className="g-gold" style={{ marginTop: 20 }}>
          <h3 style={{ color: 'var(--brand-2)', fontSize: 18 }}>Empat aturan emas agar angkanya akurat</h3>
          <ol>{RULES.map((r, i) => <li key={r}><b>{i + 1}</b><span>{r}</span></li>)}</ol>
        </div>

        <div className="panel" style={{ alignItems: 'center', textAlign: 'center' }}>
          <b>Masih bingung?</b>
          <span className="small muted">Tanyakan langsung, kami bantu sampai bisa.</span>
          <div className="row" style={{ justifyContent: 'center' }}>
            <a href={wa} target="_blank" rel="noreferrer"><button className="primary">Tanya via WhatsApp</button></a>
            <Link href="/beranda"><button>Buka aplikasi</button></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
