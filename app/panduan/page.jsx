import Link from 'next/link';
import LandingNav from '@/components/LandingNav';
import { BUSINESS, SITE_HOST } from '@/lib/plan';
import {
  ScrSignup, ScrHelp, ScrRoomEdit, ScrStartLease, ScrRooms, ScrInvoices, ScrPay, ScrVerify, ScrReminder,
  ScrExtra, ScrExpense, ScrOwner, ScrEndLease, ScrDashboard, ScrReport, ScrExport, ScrReceipt, ScrPlan, ScrPortal, ScrPesanan, ScrNota, ScrDeposit, ScrPerbaikan, ScrMeteran, ScrBooking, ScrBuilder, ScrCatatan, ScrLampiran, ScrKonfirmasi, ScrAntar, ScrDapur, ScrMeja, ScrMedia } from '@/components/demo/Screens';

export const metadata = {
  title: 'Panduan PRASARA — Langkah demi Langkah',
  description: 'Panduan lengkap memakai PRASARA: kamar, penghuni, tagihan otomatis, pembayaran, pengeluaran, laporan, kwitansi, dan langganan.',
  openGraph: { title: 'Panduan PRASARA — Langkah demi Langkah', description: 'Cara memakai PRASARA dari daftar sampai laporan, lengkap dengan gambar.', url: '/panduan', images: [{ url: '/og.jpg?v=3', width: 1200, height: 630 }] },
};

const wa = `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent('Halo, saya butuh bantuan memakai aplikasi PRASARA.')}`;
const Std = () => <span className="chip gold" style={{ marginLeft: 6 }}>Standar</span>;
const Pro = () => <span className="chip gold" style={{ marginLeft: 6 }}>Pro</span>;

// Menu toko (Retail & Grosir)
const MENUS_TOKO = [
  ['Toko', 'Ringkasan hari ini: penjualan, laba kotor, stok menipis'],
  ['Kasir', 'Jual eceran/grosir, tombol barang cepat, scan barcode, struk'],
  ['Penjualan & Shift kasir', 'Riwayat transaksi, retur, batal; buka/tutup laci'],
  ['Belanja', 'Pesan ke supplier, terima barang, retur ke supplier, utang supplier'],
  ['Mutasi stok', 'Pindahkan barang antar lokasi; pemilik: tambah gudang/cabang dari sini'],
  ['Prospek & tindak lanjut', 'Calon pelanggan/penghuni, tahapan, catatan, jadwal hubungi lagi'],
  ['Halaman bisnis', 'Tautan publik: profil, katalog/kamar, formulir permintaan'],
  ['Kas & kasbon', 'Saldo kas/bank, biaya, kasbon pelanggan, utang'],
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
  ['Karyawan', 'Undang pengelola/penjaga, atur peran, nonaktifkan, hapus'],
  ['Persetujuan', 'Permintaan tindakan berisiko dari karyawan & otomatisasi; aturan persetujuan'],
  ['Otomatisasi', 'Pekerjaan rutin setiap pagi: stok menipis, kasbon, tagihan telat, ringkasan bulanan'],
  ['Konfigurasi', 'Profil bisnis, modul aktif, saran, cabang & gudang, riwayat'],
  ['Pembukuan', 'Jurnal otomatis, buku besar, laba rugi, neraca, tutup periode'],
];

// [bagian, judul, menu, langkah[], catatan, jenis catatan, layar, paket]
const PARTS = [
  ['A', 'Persiapan (sekali saja)', [
    ['Daftar dan kenalkan bisnis Anda', 'Halaman depan › Mulai Sekarang', [
      <>Buka <b>{SITE_HOST}</b>, tekan <b>Mulai Sekarang</b>, isi email dan kata sandi, lalu <b>Buat akun</b>. Buka email Anda dan ketuk tautan konfirmasi.</>,
      <>Masuk. Di <b>Apa jenis bisnis yang Anda miliki atau kelola?</b> pilih satu atau lebih kategori (mis. Properti & Hunian, Retail, Laundry), lalu <b>Lanjut</b>.</>,
      <>Untuk tiap bisnis isi <b>nama</b>, <b>subkategori</b>, <b>lokasi</b>, <b>status bisnis</b>, <b>hubungan Anda</b>, <b>jumlah cabang</b>, dan pertanyaan singkat (mis. kos: jumlah kamar; laundry: layanan, jam, antar jemput).</>,
      <>Tekan <b>Tinjau</b> lalu <b>Buat draf bisnis</b>. Tiap bisnis dibuat terpisah sebagai <b>draf</b> — lanjutkan di <b>Pusat Konfirmasi</b> (Langkah 64) untuk melengkapi & mengaktifkannya.</>,
    ], <>Karyawan tidak membuat bisnis baru: pilih <b>Saya karyawan…</b> dan minta pemilik mengundang email Anda di menu Karyawan. Tidak menerima email konfirmasi? Periksa folder Spam atau Promosi.</>, null, <ScrSignup />],
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
      <>Isi <b>Tagihan pertama jatuh tempo</b>. Ada uang jaminan? Isi <b>Deposit diterima</b> (lihat Langkah 51). Tekan <b>Mulai sewa</b>.</>,
      <>Tagihan sewa langsung terbit otomatis dan kamar menjadi <b>Terisi</b>.</>,
    ], <><b>Penghuni lama</b> (sudah tinggal sebelum memakai aplikasi): isi tagihan pertama dengan jatuh tempo <b>berikutnya yang belum dibayar</b>. Jika diisi tanggal masuk dulu, bulan-bulan yang sudah lunas ikut ditagih.</>, 'warn', <ScrStartLease />],
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
    ['Catat pembayaran', 'Tagihan › ketuk tagihan › Catat pembayaran', [
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
      <>Pilih <b>Jenis</b>: <b>Diambil pemilik (prive)</b>, Setoran modal, Pendapatan lain, Pinjaman diterima, atau Bayar pinjaman.</>,
      <>Isi <b>Jumlah</b>, <b>Tanggal</b>, dan keterangan, lalu <b>Simpan</b>.</>,
      <>Laporan memisahkannya: prive mengurangi kas tetapi <b>tidak</b> mengurangi laba.</>,
    ], <><b>Jangan tertukar:</b> gaji pengelola/penjaga adalah <b>biaya kos</b> (tab Biaya kos). Uang yang dipakai pemilik untuk keperluan pribadi adalah <b>prive</b> (tab ini).</>, 'warn', <ScrOwner />],
    ['Penghuni keluar', 'Penghuni (atau Kamar) › Akhiri sewa', [
      <>Isi <b>Tanggal keluar</b> (hari ini atau sebelumnya) dan alasan bila perlu. Penghuni baru akan keluar nanti? Isi <b>Rencana selesai</b> di detail penghuni saja — kamar tetap terisi sampai penghuni benar-benar keluar.</>,
      <>Tekan <b>Akhiri sewa</b>. Kamar kembali <b>Tersedia</b>.</>,
      <>Tagihan bulan berikutnya yang belum dibayar dibatalkan otomatis. Tunggakan lama tetap tercatat.</>,
      <>Masih ada deposit? Selesaikan di <b>Penghuni › Deposit</b>: kembalikan, potong untuk kerusakan, atau lunasi tunggakan dari deposit (Langkah 51).</>,
    ], null, null, <ScrEndLease />],
  ]],
  ['C', 'Pengecekan', [
    ['Pantau kondisi kos di Dashboard', 'Dashboard', [
      <><b>Kas bersih</b> = uang masuk − pengeluaran bulan ini (deposit yang diterima/dikembalikan ikut dihitung).</>,
      <>Kotak <b>🔧 keluhan</b> muncul bila ada keluhan/perbaikan yang belum selesai.</>,
      <><b>Hunian</b> = kamar terisi dibanding kamar yang bisa disewakan.</>,
      <><b>Tunggakan</b> dan daftar <b>penghuni menunggak</b> untuk ditindaklanjuti.</>,
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
      <>Pilih paket dan durasinya. Harga dan fitur tiap paket tampil di sana (harga per bisnis per bulan).</>,
      <>Bayar lewat <b>QRIS</b> atau <b>transfer bank</b> sesuai total.</>,
      <>Tekan <b>Saya sudah bayar</b>, lalu <b>Kirim bukti via WhatsApp</b>. Setiap pembayaran mendapat <b>nomor invoice</b> (INV-…).</>,
      <>Paket aktif setelah diperiksa, biasanya dalam 1×24 jam pada hari kerja. Invoice bisa dibuka & dicetak di <b>Riwayat tagihan</b>.</>,
      <><b>Naik paket</b> berlaku sejak disetujui (sisa hari paket lama dihitung ulang dan ditambahkan). <b>Turun paket</b> berlaku setelah paket sekarang berakhir.</>,
      <>Tidak ingin memperpanjang? Tekan <b>Berhenti memperpanjang</b> — paket tetap aktif sampai tanggal berakhir, lalu menjadi Gratis. Bisa dibatalkan lagi.</>,
    ], <>Bisnis baru mendapat {BUSINESS.trialDays} hari semua fitur. Setelah itu menjadi Gratis dengan batasannya (mis. kamar terisi untuk kos). Bila paket habis, mungkin ada <b>masa tenggang</b> beberapa hari sebelum fitur terkunci. <b>Data tidak pernah dihapus.</b></>, null, <ScrPlan />],
    ['Pengaturan, beberapa kos, dan layar utama', 'Pengaturan', [
      <>Ubah <b>nama dan alamat kos</b> — tercetak di kwitansi.</>,
      <><b>Info untuk penghuni</b>: nomor WhatsApp, cara bayar, dan peraturan kos (tampil di portal), serta pilihan email <b>notifikasi bukti transfer</b> dan <b>daftar tagih setiap pagi</b>.</>,
      <><b>Teks pesan WhatsApp</b>: ubah kata-kata pesan pengingat tagihan dan pesan link portal. Ketuk kata berwarna seperti <b>{'{nama}'}</b> atau <b>{'{total}'}</b> untuk menyisipkan data penghuni otomatis; lihat <b>Contoh pesan</b> sebelum menyimpan. <b>Pakai teks bawaan</b> mengembalikan teks awal.</>,
      <><b>QRIS kos</b>: unggah screenshot QRIS dari aplikasi bank/merchant agar penghuni bisa scan dari portal. Uji dengan satu pembayaran kecil setelah mengganti.</>,
      <>Tambah kategori pengeluaran sesuai kebutuhan.</>,
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
    ], <>Email arahan & info bisa dimatikan lewat tautan di bawah email, atau di <b>Pengaturan › Akun</b>. Pengingat tagihan dan pengumuman layanan penting tidak ikut berhenti. Pengumuman dari tim PRASARA juga tampil sebagai banner di atas aplikasi; tekan ✕ untuk menutupnya.</>, null, null],
    ['Notifikasi & ringkasan lewat email', 'Lonceng di kanan atas', [
      <>Angka merah di <b>lonceng</b> = hal yang perlu ditindaklanjuti hari ini: pembayaran menunggu diperiksa, tagihan telat, dan jatuh tempo hari ini.</>,
      <>Ketuk lonceng. Bagian <b>Perlu perhatian</b> juga menampilkan sewa yang akan berakhir, kamar tanpa harga, dan penghuni tanpa nomor WhatsApp. Ketuk untuk membuka menunya.</>,
      <>Di <b>Pengaturan email</b>, pilih yang ingin diterima: daftar tagih setiap pagi, <b>ringkasan mingguan</b> (Senin), dan <b>ringkasan bulanan</b> (tanggal 1).</>,
      <>Tekan <b>Kirim contoh ringkasan</b> untuk melihat isinya di email Anda.</>,
    ], <>Ringkasan bulanan menyala otomatis, ringkasan mingguan mati sampai Anda menyalakannya. Semua angka berasal dari data yang Anda catat — sama dengan menu Laporan.</>, null, null],
    ['Banyak bisnis & Ringkasan pemilik', 'Operasional › Ringkasan pemilik', [
      <>Tekan <b>+ Tambah bisnis</b> (atau ketuk nama bisnis di kiri atas › Tambah bisnis), pilih jenisnya, isi nama, tinjau modul, lalu <b>Setujui & buat bisnis</b>.</>,
      <>Jika punya lebih dari satu bisnis, aplikasi dibuka di <b>Ringkasan pemilik</b>: hal yang <b>perlu perhatian</b> dari semua bisnis, lalu angka tiap bisnis (pendapatan, biaya, laba, tunggakan/kasbon, utang, kas).</>,
      <>Ketuk angka mana pun untuk membuka <b>sumbernya</b> di bisnis itu (mis. Laporan atau Kas) dan melihat transaksinya. Ganti bulan dengan tombol ‹ ›.</>,
      <>Tanda <b>Lengkap</b> / <b>Perkiraan</b> menunjukkan apakah angkanya sudah final. <b>Ringkasan manajemen</b> di bawah menjumlahkan per badan usaha dan semua bisnis.</>,
    ], <>Pembukuan setiap bisnis terpisah: transaksi toko tidak masuk ke laporan kos. Jumlah gabungan hanya indikasi (bukan laporan konsolidasi resmi), apalagi bila basis pencatatannya berbeda — kos dicatat saat uang diterima, toko saat penjualan terjadi.</>, null, null],
  ]],
  ['E', 'Retail & Grosir (toko)', [
    ['Barang, satuan, dan stok', 'Menu Barang & stok', [
      <>Buka bisnis toko Anda (ketuk nama bisnis di kiri atas), lalu menu <b>Barang & stok</b>. Tekan <b>+ Tambah barang</b>.</>,
      <>Isi nama, <b>satuan terkecil</b> (pcs, bungkus, kg) dan <b>harga modal</b> per satuan itu, lalu stok sekarang.</>,
      <>Di <b>Satuan jual & harga</b>, isi harga eceran dan grosir. Tekan <b>+ Tambah satuan</b> untuk dus/pak/renteng beserta isinya (mis. dus isi 40). Di bawah tiap satuan tampil hitungannya, mis. "1 dus = 40 pcs · modal Rp 112.000 · untung Rp 8.000".</>,
      <>Barang <b>curah</b> dijual sebagian (minyak/gula/beras per kg): satuan terkecil <b>kg</b>, harga modal per kg, lalu ketuk <b>+ ¼ kg</b> / <b>+ ½ kg</b> — isinya terisi otomatis (0,25 / 0,5). Nama seperti "250 gram" juga dihitung otomatis menjadi 0,25 kg.</>,
      <>Untuk menghitung ulang atau mencatat barang rusak, tekan <b>Stok</b> di samping barang, pilih alasannya, isi jumlah, lalu <b>Simpan</b>.</>,
      <>Opsional: isi <b>Kode barang</b> dan <b>Barcode</b> tiap satuan (angka di bawah garis-garis kemasan). Di Kasir, scan barcode atau ketik kodenya lalu Enter — barang langsung masuk keranjang.</>,
    ], <>Scanner barcode Bluetooth/USB bekerja di iPhone maupun Android. Tombol kamera 📷 Pindai bisa dipakai di iPhone dan Android (izinkan akses kamera). Stok tidak bisa diketik langsung — setiap perubahan tercatat di <b>Riwayat stok</b> agar selisihnya bisa ditelusuri. Muncul tanda merah jika harga eceran di bawah modal, jika nama satuan sama dengan satuan terkecil, atau jika isinya tidak cocok (mis. "250 gram" diisi 250 padahal satuan terkecil kg) — lengkap dengan tombol <b>Pakai 0,25</b> untuk membetulkannya. Kode barang hanya penanda sendiri, bukan tempat satuan.</>, null, null],
    ['Jualan di kasir', 'Menu Kasir', [
      <>Buka <b>Kasir</b>. Pilih <b>Eceran</b> atau <b>Grosir</b> di kanan atas — harga mengikuti pilihan ini.</>,
      <>Cari barang, lalu ketuk tombol satuannya (mis. <b>pcs · Rp 3.500</b> atau <b>dus · Rp 125.000</b>). Ketuk lagi untuk menambah jumlah.</>,
      <>Ketuk bar <b>Keranjang</b> di bawah. Ubah jumlah atau harga bila perlu, isi diskon, lalu pilih <b>Tunai</b> (isi uang diterima → kembalian), <b>Transfer / QRIS</b>, atau <b>Kasbon</b> (pilih/isi nama pelanggan).</>,
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
    ], <>Saldo kas & bank dihitung otomatis dari penjualan, belanja, biaya, dan pelunasan. Hitung uang di laci sesekali; kalau beda, ada transaksi yang belum dicatat.</>, null, null],
    ['Laporan toko', 'Menu Laporan', [
      <>Buka <b>Laporan</b>, pilih bulan dengan tombol <b>‹ ›</b>.</>,
      <><b>Laba rugi</b>: penjualan − modal barang terjual = laba kotor, lalu dikurangi biaya operasional dan selisih stok = <b>laba bersih</b>. Prive dan belanja barang tidak mengurangi laba.</>,
      <><b>Produk</b>: pilih <b>Terlaris</b> atau <b>Paling untung</b>. Bagian <b>Tidak laku</b> menunjukkan barang berstok yang tidak terjual bulan itu.</>,
      <>Paket Standar: <b>Unduh Excel</b> dan <b>Cetak / PDF</b>.</>,
    ], <>Kalau muncul peringatan harga modal kosong, isi modalnya di Barang & stok — tanpa modal, laba barang itu terlihat terlalu tinggi.</>, null, null],
  ]],
  ['F', 'Karyawan, kontak & shift', [
    ['Mengundang & mengatur karyawan', 'Menu Karyawan (khusus pemilik)', [
      <>Buka <b>Karyawan</b>, isi <b>email karyawan</b>, pilih <b>peran</b>, lalu <b>Undang</b>. Toko: Pengelola, Kasir, Staf gudang. Kos: Pengelola, Penjaga.</>,
      <>Tekan <b>Kirim cara masuk via WA</b>. Karyawan membuka PRASARA › <b>Masuk</b> › <b>Daftar</b> dengan email itu, lalu konfirmasi email. Saat masuk, ia langsung berada di bisnis Anda — tidak perlu membuat bisnis.</>,
      <>Karyawan hanya melihat menu perannya. Kasir tidak melihat harga modal, laba, kas, dan laporan; penjualan yang ia lihat hanya miliknya sendiri. Setiap penjualan mencatat nama kasirnya.</>,
      <>Ganti peran lewat pilihan di daftar. <b>Nonaktifkan</b> untuk menutup akses sementara; <b>Hapus</b> untuk membuang emailnya dari daftar. Tombol <b>Bersihkan</b> menghapus semua email nonaktif dan undangan kedaluwarsa sekaligus.</>,
    ], <>Undangan berlaku 14 hari. Batas karyawan: Gratis 1, Standar 3, Pro tanpa batas. Menghapus karyawan tidak menghapus riwayat transaksinya. Karyawan keluar dari akun lewat Pusat bantuan › Keluar dari akun.</>, null, null],
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
      <>Angka merah di <b>lonceng</b> = hal yang perlu ditindaklanjuti: stok habis atau menipis, pesanan yang lewat perkiraan datang, kasbon pelanggan dan utang supplier yang jatuh tempo dalam 3 hari.</>,
      <>Ketuk lonceng. Tekan <b>Ingatkan WA</b> untuk kasbon, atau <b>Pesan / belanja barang</b> untuk stok.</>,
      <>Pemilik bisa menyalakan <b>email pengingat setiap pagi</b> pukul 07.00 di halaman itu (paket Standar).</>,
    ], <>Stok menipis memakai <b>peringatan stok minimum</b> yang diisi di setiap barang. Email hanya dikirim bila ada yang perlu ditindaklanjuti.</>, null, null],
    ['Barang tanpa barcode & label', 'Barang & stok › ☆ dan Cetak label', [
      <>Tekan <b>☆</b> di samping barang yang sering dijual. Barang itu muncul sebagai <b>tombol cepat</b> di atas Kasir — satu ketukan = +1 (maks 24 barang).</>,
      <>Untuk label barcode sendiri: buka <b>Barang & stok › Cetak label</b>. Barang yang belum punya kode: tekan <b>Buat kode otomatis</b>.</>,
      <>Tekan <b>+</b> pada barang untuk jumlah label, lalu <b>Cetak</b> (printer biasa atau simpan PDF). Tempel di rak atau kemasan ulang.</>,
      <>Di Kasir, scan label itu dengan <b>📷 Pindai</b> atau scanner Bluetooth — barang langsung masuk keranjang.</>,
    ], <>Pertama kali memakai kamera, izinkan akses kamera untuk situs PRASARA. Coba scan satu label dulu sebelum mencetak banyak.</>, null, null],
    ['Pusat konfigurasi', 'Operasional › Konfigurasi (pemilik & pengelola)', [
      <>Tab <b>Modul</b>: lihat modul aktif, yang bisa diaktifkan, dan yang segera hadir. Ketuk modul untuk melihat fungsinya, menu, data yang dipakai, modul yang dibutuhkan, dan paketnya.</>,
      <>Tekan <b>Aktifkan</b> atau <b>Nonaktifkan</b> (wajib alasan). Modul nonaktif: menunya hilang dan pemakaiannya ditolak server, tetapi <b>data lama tidak dihapus</b>.</>,
      <>Pengelola hanya bisa <b>meminta</b>; pemilik menyetujui di tab <b>Persetujuan</b>.</>,
      <>Tab <b>Profil</b>: kelompok bisnis, karakteristik usaha, dan <b>badan usaha</b> (perorangan, CV, PT…). Tab <b>Cabang & gudang</b>: daftar lokasi (khusus pemilik).</>,
      <>Tab <b>Riwayat</b>: semua perubahan — siapa, kapan, alasan, dan tingkat risikonya.</>,
    ], <>Modul inti (mis. Kasir, Barang, Tagihan) selalu aktif. Modul yang masih punya transaksi terbuka (shift belum ditutup, pesanan belum diterima) tidak bisa dinonaktifkan sebelum diselesaikan. Cabang & gudang saat ini dicatat sebagai struktur; stok per cabang segera hadir.</>, null, null],
    ['Persetujuan', 'Operasional › Persetujuan', [
      <>Tindakan berisiko oleh karyawan — mis. <b>membatalkan penjualan</b>, <b>membatalkan belanja</b>, <b>membatalkan pelunasan</b>, <b>menghapus kontak</b>, <b>mengubah modul</b> — tidak langsung jalan. Karyawan menekan tombolnya, menulis alasan, lalu permintaan masuk ke sini.</>,
      <>Kasir bisa <b>meminta pembatalan</b> atau <b>meminta retur</b> untuk penjualannya sendiri dari menu Penjualan.</>,
      <>Pemilik membuka permintaan: terlihat <b>nomor</b>, siapa yang meminta, alasan, <b>data terdampak</b>, dan <b>estimasi nilai</b>. Tekan <b>Setujui & jalankan</b> atau <b>Tolak</b>.</>,
      <>Setelah disetujui, sistem langsung menjalankan tindakannya dan mencatat hasilnya (berhasil atau gagal beserta sebabnya) di <b>Riwayat</b>.</>,
      <>Tab <b>Aturan</b> (pemilik): pilih tindakan mana yang wajib disetujui.</>,
    ], <>Pemilik selalu bisa langsung menjalankan tindakan tanpa persetujuan. Aturan bawaan: pembatalan penjualan/belanja/pelunasan, hapus kontak, dan ubah modul wajib disetujui; retur dan penyesuaian stok tidak.</>, null, null],
    ['Otomatisasi', 'Operasional › Otomatisasi (pemilik)', [
      <>Pilih resep, baca <b>pemicu → syarat → tindakan</b>-nya, lalu tekan <b>Nyalakan</b>. Semua resep berjalan setiap pagi pukul 07.00.</>,
      <>Toko: <b>stok menipis → draf pesanan</b> ke supplier terakhir (menunggu persetujuan Anda), <b>kasbon jatuh tempo</b>, <b>utang supplier jatuh tempo</b>, <b>shift lupa ditutup</b>. Kos: <b>pembayaran menunggu diperiksa</b>, <b>tagihan telat</b>. Semua: <b>ringkasan awal bulan</b>.</>,
      <>Hasilnya muncul di <b>Pemberitahuan</b> (dan email untuk resep tertentu). Tekan <b>Jalankan sekarang</b> untuk mencoba.</>,
      <>Buka <b>Riwayat jalan</b> untuk melihat kapan berjalan, hasilnya, atau kesalahannya.</>,
    ], <>Otomatisasi tidak pernah mengubah data sendiri: tindakan yang mengubah data (mis. membuat pesanan) masuk ke Persetujuan. Paling banyak sekali sehari, tidak membuat pesanan ganda, dan dijeda otomatis setelah 3 kali gagal. WhatsApp otomatis belum tersedia — pesan WA disiapkan untuk dikirim dengan satu ketukan.</>, null, null],
    ['Pembukuan', 'Operasional › Pembukuan (pemilik & pengelola)', [
      <>Tidak perlu mencatat dua kali: setiap penjualan, retur, belanja, kas, kasbon/utang, perubahan stok, pengeluaran, dan pembayaran sewa yang terverifikasi otomatis menjadi <b>jurnal</b> (debit & kredit seimbang). Jurnal diposting saat halaman dibuka dan setiap pagi.</>,
      <>Tab <b>Laporan</b>: <b>Laba rugi</b> (pendapatan, HPP, beban) untuk bulan terpilih atau sejak awal tahun, dan <b>Neraca</b> (aset = kewajiban + ekuitas) per akhir bulan. Kotak di atasnya menunjukkan cakupan, waktu dibuat, basis pencatatan, dan status <b>Lengkap/Belum lengkap</b> beserta sebabnya.</>,
      <>Toko: <b>Cek kecocokan</b> membandingkan saldo buku dengan menu Kas, kasbon, utang, dan nilai stok. Selisih ditampilkan, tidak diubah diam-diam.</>,
      <>Tab <b>Buku besar</b>: pilih akun (mis. Kas) untuk melihat setiap mutasi dan saldonya; ketuk <b>lihat …</b> untuk membuka transaksi asalnya. Tab <b>Jurnal</b>: semua jurnal beserta baris debit/kreditnya.</>,
      <>Punya beberapa bisnis dalam satu badan usaha (atur di Konfigurasi › Profil)? Pilih <b>Seluruh badan usaha</b> untuk laporan gabungan bisnis-bisnis itu. Badan usaha berbeda tidak pernah digabung.</>,
      <>Tab <b>Periode & manual</b> (pemilik): <b>Tutup</b> bulan yang sudah diperiksa (alasan wajib, tercatat). <b>Jurnal manual</b> untuk penyesuaian, mis. saldo awal rekening bank: debit Bank, kredit Ekuitas saldo awal.</>,
    ], <>Jurnal tidak bisa dihapus atau diubah. Bila penjualan/belanja dibatalkan atau diubah, sistem membuat <b>jurnal pembalikan/koreksi</b>; untuk bulan yang sudah ditutup, koreksinya dicatat di bulan berjalan. Kos dicatat saat uang diterima (basis kas), toko saat transaksi terjadi — gabungan berbeda basis hanya indikasi, bukan konsolidasi resmi. Pajak & penyusutan otomatis belum tersedia.</>, null, null],
    ['Stok per lokasi & mutasi', 'Konfigurasi › Cabang & gudang, lalu menu Mutasi stok (toko)', [
      <>Pemilik membuka <b>Operasional › Mutasi stok</b> › <b>+ Tambah gudang / cabang</b> (atau Konfigurasi › Cabang & gudang › + Tambah). Lokasi yang sudah ada otomatis bernama <b>Lokasi utama</b> (boleh diganti namanya) dan semua stok lama ada di sana.</>,
      <>Begitu ada lebih dari satu lokasi, muncul kotak <b>📍 Lokasi kerja</b> di Kasir, Barang & stok, dan Belanja. Pilih lokasi tempat Anda bekerja: penjualan, belanja, hitung ulang stok, dan barang rusak tercatat di lokasi itu.</>,
      <>Barang & stok menampilkan stok <b>di sini</b> dan <b>total</b>; tombol <b>Stok</b> menunjukkan rincian per lokasi.</>,
      <>Memindahkan barang (mis. gudang → toko): buka <b>Mutasi stok</b>, pilih <b>Dari</b> dan <b>Ke</b>, cari barang, isi jumlah, lalu <b>Pindahkan</b>. Riwayat mutasi mencatat nomor, asal–tujuan, waktu, dan siapa.</>,
      <>Pemilik bisa menetapkan lokasi kerja tiap karyawan di menu <b>Karyawan</b>; karyawan itu tidak bisa pindah lokasi sendiri dan hanya bisa mengirim barang dari lokasinya.</>,
      <>Uang kas juga per lokasi: <b>Kas & kasbon</b> menampilkan <b>Uang kas per lokasi</b>. Biaya, uang masuk/keluar lain, dan pembayaran kasbon/utang dicatat di lokasi kerja Anda. Setoran laci cabang ke toko utama: <b>Pindahkan uang kas</b>.</>,
      <>Laporan toko › <b>Per lokasi</b>: penjualan, laba kotor, biaya lokasi, dan <b>kontribusi</b> (laba kotor − biaya operasional lokasi itu).</>,
    ], <>Mutasi barang dan pindah kas tidak mengubah total stok, harga modal, maupun total kas bisnis. Jumlah yang dipindah tidak boleh melebihi yang tercatat di lokasi asal. Lokasi yang masih ada stoknya tidak bisa dinonaktifkan. Bank, pengingat stok minimum, dan pembukuan tetap satu untuk seluruh bisnis.</>, null, null],
    ['Saran untuk bisnis Anda', 'Konfigurasi › Saran (pemilik & pengelola)', [
      <>Bila ada saran, di dashboard Toko/Dashboard kos muncul kotak <b>💡 N saran</b>. Ketuk untuk membuka <b>Konfigurasi › Saran</b>.</>,
      <>Setiap saran menyebut <b>alasan</b> dengan angka dari data Anda (mis. "7 penjualan kasbon dalam 30 hari terakhir"), <b>manfaat</b>, <b>dampak</b>, dan <b>tingkat risiko</b>.</>,
      <>Tekan <b>Terapkan</b> untuk menjalankannya (mengaktifkan modul, menyalakan otomatisasi, atau mewajibkan persetujuan), atau <b>Buka</b> untuk saran yang Anda kerjakan sendiri (mis. melengkapi harga modal, menutup buku).</>,
      <>Tidak cocok? Tekan <b>Abaikan 30 hari</b> (alasan opsional). Semua keputusan tercatat di Riwayat.</>,
    ], <>Saran hanya muncul bila datanya cukup kuat (mis. minimal beberapa kejadian dalam 30 hari), bukan dari satu kejadian. Tidak ada yang berubah sebelum Anda menekan Terapkan. Pengelola yang menerapkan saran modul akan mengirim permintaan ke pemilik. Saran ini dihitung dengan aturan tetap — bukan AI.</>, null, null],
    ['Unduh semua data & tutup bisnis', 'Pengaturan › Data & penutupan bisnis (pemilik)', [
      <>Tekan <b>Unduh Excel</b> (satu lembar per jenis data: barang, penjualan, belanja, kas, jurnal, dll. — bisa difilter dan dijumlah) atau <b>Unduh PDF</b> (laporan berhalaman, siap dibaca, dicetak, atau dikirim). Di iPhone, file tersimpan di app <b>Files › Unduhan</b> dan bisa dibuka langsung.</>,
      <>Usaha berhenti? Tekan <b>Tutup bisnis…</b>. Sistem memeriksa: shift yang belum ditutup, pesanan supplier yang belum selesai, persetujuan menunggu, pembayaran belum diverifikasi, penghuni aktif, dan <b>ekspor data dalam 7 hari terakhir</b> — semuanya harus beres dulu.</>,
      <>Baca bagian <b>Perlu diketahui</b> (sisa kasbon/utang/tagihan, stok, periode buku, karyawan aktif) lalu centang <b>Saya mengerti</b>.</>,
      <>Ketik nama bisnis persis sama, tulis alasan, lalu tekan <b>Tutup bisnis</b>.</>,
      <>Bisnis yang ditutup menampilkan pita merah di semua halaman. Pemilik bisa menekan <b>Buka kembali</b> kapan saja (alasan wajib).</>,
    ], <>Menutup bisnis tidak menghapus data apa pun: transaksi, laporan, dan pembukuan tetap bisa dilihat dan diunduh. Selama ditutup, semua orang (termasuk pemilik) tidak bisa mencatat apa pun, otomatisasi dimatikan, dan email harian/ringkasan untuk bisnis itu berhenti. Foto bukti transfer tidak ikut dalam file Excel/PDF.</>, null, null],
    ['Prospek & tindak lanjut', 'Operasional › Prospek & tindak lanjut (toko) / Calon penghuni (kos)', [
      <>Ada yang bertanya atau tertarik? Tekan <b>+ Prospek baru</b>: isi nama, No. HP, kebutuhan (mis. "ambil beras 5 karung/minggu" atau "kamar mandi dalam"), dari mana tahunya, dan perkiraan nilai bila ada.</>,
      <>Ikuti tahapannya: <b>Baru → Dihubungi → Penawaran → Jadi</b> atau <b>Tidak jadi</b> (alasan wajib). Prospek toko yang <b>Jadi</b> otomatis masuk daftar pelanggan — dicocokkan lewat No. HP, bukan nama.</>,
      <>Di setiap prospek: tulis <b>catatan</b> (WA, telepon, kunjungan, keluhan) dan <b>jadwalkan tindak lanjut</b> (Besok / 3 hari / 1 minggu). Pelanggan lama juga bisa diberi catatan & tindak lanjut dari menu Pelanggan & supplier.</>,
      <>Tab <b>Tindak lanjut</b> berisi semua jadwal; yang jatuh hari ini atau terlewat berwarna merah dan muncul sebagai kotak <b>📞</b> di dashboard. Tekan <b>Kirim WA</b> lalu <b>Selesai</b>.</>,
    ], <>Angka "Jadi (90 hari)" = prospek jadi ÷ (jadi + tidak jadi) yang ditutup 90 hari terakhir. Catatan tidak bisa dihapus agar riwayat utuh. Simpan seperlunya saja (nama, No. HP, kebutuhan); jangan mencatat data pribadi sensitif. Kasir dan penjaga juga bisa memakai menu ini.</>, null, null],
    ['Halaman bisnis untuk pelanggan', 'Operasional › Halaman bisnis (pemilik)', [
      <>Unggah <b>Logo</b> (gambar persegi; dikecilkan otomatis). Isi <b>alamat halaman</b> (mis. toko-subur), kalimat singkat, tentang, alamat, jam buka, dan No. WhatsApp untuk pelanggan.</>,
      <>Pilih yang ditampilkan: toko — <b>barang cepat (★)</b> atau <b>semua barang aktif</b>; kos — <b>kamar yang tersedia</b>. Centang <b>Tampilkan harga jual</b> bila ingin harganya terlihat.</>,
      <>Tambahkan <b>Tautan</b> (maks 6): ketuk <b>+ 📍 Lokasi (Google Maps)</b>, <b>+ 📷 Instagram</b>, <b>+ 🖼️ Foto</b> atau <b>+ Tautan lain</b>, lalu tempel alamatnya (di aplikasi Maps/Instagram: <b>Bagikan › Salin tautan</b>). Tampil sebagai tombol di halaman. Alamat https:// yang Anda tulis di Tentang/Ketentuan juga bisa diketuk.</>,
      <>Tekan <b>Terbitkan</b>. Baca daftar yang akan terlihat publik, lalu setujui. Cara tercepat: ketuk ikon <b>Bagikan</b> (panah ke atas, pojok kanan atas, ada di semua bisnis) › <b>Terbitkan sekarang & dapatkan tautan</b> — halaman langsung terbit dengan nama, alamat & WhatsApp bisnis (isi lainnya bisa diatur nanti). Setelah terbit, ikon yang sama menampilkan <b>QR code</b> dan tautan. Pilih <b>Bagikan…</b> (menu bagikan HP), <b>WhatsApp</b>, <b>Salin tautan</b>, <b>Simpan gambar QR</b> (untuk status/grup WA), atau <b>Cetak poster QR</b> (A4 — di iPhone pilih Cetak atau simpan PDF) untuk ditempel di kasir, meja, etalase, atau pintu.</>,
      <>Pelanggan membuka tautan tanpa memasang aplikasi, memilih barang/kamar, mengisi nama & WhatsApp, menyetujui dihubungi, lalu <b>Kirim permintaan</b>. Mereka mendapat nomor permintaan (mis. PRM-261107-001).</>,
      <>Permintaan masuk ke <b>Prospek & tindak lanjut</b> (label <b>Perlu konfirmasi</b>); email ke Anda bila dicentang. Ketuk permintaannya: sistem sudah <b>mengecek otomatis</b> (kamar kosong pada tanggal itu, stok cukup, harga masih sama, No. HP ganda).</>,
      <>Bila cocok tekan <b>Konfirmasi</b>: kos → <b>booking kamar</b> langsung dibuat (bisa sekalian catat DP); toko → <b>keranjang Kasir</b> terisi, prospek otomatis <b>Jadi</b> setelah dibayar. Lalu kabari pelanggan lewat tombol WhatsApp.</>,
      <>Bisnis <b>jasa/laundry</b>: pelanggan yang memilih layanan langsung membuat <b>pesanan</b> (lihat Langkah 66); yang hanya bertanya masuk ke Prospek.</>,
    ], <>Yang TIDAK pernah tampil: harga modal, laba, stok persis (hanya Tersedia/Habis), data pelanggan, dan catatan staf. Permintaan bukan penjualan final dan tidak mengubah stok, kas, atau jurnal. Spam dibatasi otomatis (terlalu cepat/terlalu sering dari satu perangkat ditolak). Tekan <b>Sembunyikan halaman</b> kapan saja; bisnis yang ditutup otomatis tidak tampil. Tanpa Konfirmasi Anda, tidak ada booking/pesanan/penjualan yang dibuat. Pembayaran online belum tersedia.</>, null, null],
  ]],
  ['G', 'Jasa & Laundry', [
    ['Buat bisnis laundry, atur layanan & tahap', 'Ketuk nama bisnis › + Tambah bisnis › Laundry & Jasa Rumah Tangga; lalu Operasional › Layanan & tahap', [
      <>Pilih kategori <b>Laundry & Jasa Rumah Tangga</b> (subkategori Laundry), pilih layanan yang Anda sediakan, jam operasional, dan antar jemput. Lengkapi <b>harga & estimasi</b> tiap layanan dan wilayah/biaya/jadwal antar jemput di <b>Pusat Konfirmasi</b> (Langkah 64), lalu aktifkan.</>,
      <>Buka <b>Layanan & tahap</b>. Ketuk layanan untuk mengubah <b>harga per kg/pcs</b>, <b>minimal</b> (mis. 3 kg — 2 kg tetap dihitung 3 kg), <b>lama pengerjaan</b> (jam), <b>deskripsi</b>, <b>persyaratan</b> (mis. pakaian luntur dipisah), info tambahan, dan <b>Tersedia / Tidak tersedia sementara</b>. <b>+ Layanan</b> untuk menambah.</>,
      <>Di <b>Tahap proses</b>, ganti nama, urutkan dengan ↑ ↓, nonaktifkan, atau <b>+ Tahap</b>, lalu <b>Simpan tahap</b>.</>,
    ], <>Harga tidak pernah diisi otomatis. Deskripsi & persyaratan tampil di halaman bisnis; layanan yang tidak tersedia tidak bisa dipilih. Tahap yang sedang dipakai pesanan tidak bisa dinonaktifkan. Setiap perubahan harga & tahap tercatat di Konfigurasi › Riwayat.</>, null, null],
    ['Terima pesanan & beri nota', 'Pesanan › + Pesanan baru', [
      <>Cari pelanggan lama (nama / No. HP) atau isi nama & No. WhatsApp pelanggan baru — tersimpan otomatis, dicocokkan lewat nomor.</>,
      <>Ketuk layanan (mis. <b>+ Cuci kering setrika</b>), isi berat/jumlah dan catatan (mis. "3 kemeja putih"). Total dihitung otomatis termasuk minimal.</>,
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
    ['Bahan, kas & laporan jasa', 'Operasional › Bahan & stok · Kas · Laporan', [
      <><b>Bahan & stok</b>: daftar deterjen, pewangi, plastik, dll. Beli lewat <b>Belanja</b>; saat dipakai tekan <b>Stok</b> › <b>Pemakaian bahan</b> agar biaya bahan masuk laporan.</>,
      <><b>Kas</b>: saldo kas/bank (termasuk pembayaran pesanan), <b>+ Biaya</b> (listrik, gaji, gas), dan utang supplier. Sisa bayar pelanggan ada di Pesanan.</>,
      <><b>Laporan</b>: pendapatan per bulan, laba perkiraan (pendapatan − bahan − biaya), uang masuk, belum lunas, uang muka, per layanan, pelanggan teratas, ketepatan waktu, dan keluhan. <b>Unduh Excel</b> (Standar ke atas).</>,
    ], <>Pembukuan otomatis: pesanan diserahkan → Pendapatan jasa & Piutang jasa; pembayaran → Kas/Bank; pemakaian bahan → Beban bahan. Belum tersedia: komisi/penugasan per karyawan, pengingat otomatis jasa, dan stok per cabang untuk bisnis jasa.</>, null, null],
  ]],
  ['H', 'Kos lanjutan: deposit, keluhan, meteran & booking', [
    ['Deposit / uang jaminan', 'Penghuni › ketuk penghuni › Deposit', [
      <>Saat <b>Isi kamar</b>, isi <b>Deposit diterima</b> dan pilih masuk ke kas atau bank. Penghuni lama: buka penghuninya › <b>+ Terima deposit</b>.</>,
      <>Saldo deposit tampil di Penghuni, di detail Kamar, dan di portal penghuni.</>,
      <>Saat penghuni keluar: <b>Kembalikan</b> (sebagian atau semua), <b>Potong (kerusakan dll.)</b> dengan alasan, atau lunasi tunggakan lewat <b>Tagihan › Catat pembayaran › Metode: Dipotong dari deposit</b>.</>,
      <>Salah catat? Tekan <b>✕</b> di riwayat deposit dan tulis alasannya.</>,
    ], <>Deposit <b>bukan pendapatan</b>: dicatat sebagai titipan (utang ke penghuni) di Pembukuan. Potongan untuk kerusakan menjadi pendapatan lain; potongan untuk tunggakan menjadi pembayaran sewa tanpa uang masuk baru. Mengembalikan, memotong, dan membatalkan hanya bisa oleh pemilik/pengelola; penjaga bisa mencatat deposit diterima.</>, 'warn', <ScrDeposit />],
    ['Keluhan & perbaikan', 'Operasional › Keluhan & perbaikan (atau Kamar › Catat keluhan)', [
      <>Tekan <b>+ Catat keluhan</b>: pilih kamar (atau area umum), jenis (listrik, air, bangunan, …), tulis masalahnya, prioritas, dan siapa yang menangani.</>,
      <>Kamar kosong yang rusak bisa <b>ditutup sementara</b> (status Perbaikan) agar tidak terisi; otomatis kembali Tersedia saat selesai.</>,
      <>Ikuti statusnya: <b>Mulai dikerjakan</b>, <b>Menunggu…</b> (bahan/tukang), lalu <b>Selesai</b> dengan apa yang dikerjakan dan biayanya — centang <b>Catat biaya di Pengeluaran</b> agar masuk laporan.</>,
      <>Penghuni (portal Pro) bisa melapor sendiri dari tab <b>Lapor kerusakan</b> dan melihat statusnya. Kabari penghuni dengan tombol <b>WA penghuni</b>.</>,
    ], <>Semua perubahan tercatat di <b>Riwayat</b> (siapa & kapan). Laporan dari portal dibatasi (maks 3 yang belum selesai per penghuni) agar tidak disalahgunakan. Penjaga bisa menutup keluhan, tetapi biaya hanya dicatat ke Pengeluaran oleh pemilik/pengelola.</>, null, <ScrPerbaikan />],
    ['Meteran listrik & air', 'Operasional › Meteran listrik/air', [
      <>Pertama kali: tekan <b>+ Listrik (kWh)</b> atau <b>+ Air (m³)</b>, isi tarif per satuan dan tagihan minimal (bila ada).</>,
      <>Bulan pertama: isi angka meter tiap kamar sebagai <b>angka awal</b> (belum ditagih).</>,
      <>Bulan berikutnya: isi angka sekarang. Pemakaian dan tagihan tampil langsung (angka sekarang − bulan lalu × tarif). Isi jatuh tempo, lalu <b>Simpan & buat tagihan</b>.</>,
      <>Tagihan masuk ke <b>Tagihan</b> sebagai tagihan tambahan dan ikut pengingat WhatsApp/portal. Salah angka? Tekan <b>Batalkan</b> di kamar itu (tagihannya ikut batal bila belum dibayar), lalu isi ulang.</>,
    ], <>Kamar kosong tetap dicatat angkanya tetapi tidak ditagih. Angka lebih kecil dari bulan lalu ditolak — bila meteran diganti, centang <b>Meteran baru</b>. Listrik token/prabayar tidak perlu dicatat di sini.</>, null, <ScrMeteran />],
    ['Booking kamar', 'Operasional › Booking kamar (atau Kamar › Booking kamar ini, Prospek › Buat booking)', [
      <>Tekan <b>+ Booking</b>: pilih kamar, isi nama & WhatsApp calon penghuni, <b>tanggal masuk</b>, sewa yang disepakati, lama sewa, dan batas konfirmasi (opsional).</>,
      <>Ada uang tanda jadi? Isi <b>DP</b> dan pilih masuk ke kas atau bank. Kirim <b>WA konfirmasi</b> ke calon penghuni.</>,
      <>Kamar yang dibooking ditandai <b>Dibooking</b> di Kamar, tidak bisa diisi orang lain, dan tidak tampil sebagai kamar kosong di halaman bisnis/portal. Kamar yang masih terisi boleh dibooking untuk tanggal setelah rencana selesai sewa penghuninya (isi di <b>Penghuni › ketuk nama › Rencana selesai › ubah</b>).</>,
      <>Saat penghuni datang: buka booking › <b>Check-in</b>. Sewa dimulai, data penghuni dibuat, dan DP menjadi <b>deposit</b> — atau centang <b>Pakai DP untuk membayar tagihan pertama</b>.</>,
      <>Tidak jadi? <b>Batalkan booking</b>: tulis alasan dan berapa DP yang dikembalikan; sisanya <b>hangus</b> menjadi pendapatan lain.</>,
    ], <>DP booking bukan pendapatan sampai penghuni masuk atau DP hangus (di Pembukuan dicatat sebagai uang muka). Booking ber-DP hanya bisa dibatalkan pemilik/pengelola. Booking dari Prospek otomatis menandai prospek <b>Jadi</b> saat check-in.</>, 'warn', <ScrBooking />],
  ]],
  ['I', 'Business Builder (bisnis kustom)', [
    ['Buat bisnis kustom', 'Ketuk nama bisnis › + Tambah bisnis › Bisnis lain (Business Builder)', [
      <>Pilih <b>Template Bengkel motor</b>, <b>Template Salon & barbershop</b>, atau <b>Bangun sendiri</b>. (<b>Bangun dengan AI</b> belum tersedia.)</>,
      <>Isi nama usaha, lalu <b>Setujui & buat bisnis</b>. Bisnis dibuat sebagai <b>draf</b> dan Anda langsung masuk ke <b>Business Builder</b>.</>,
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
      <>Pemilik menekan <b>Aktifkan bisnis</b>. Konfigurasi tetap bisa diubah setelah aktif.</>,
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
    ['Isian tambahan di menu bawaan', 'Operasional › Konfigurasi › Isian tambahan', [
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
    ], <>File disimpan privat: hanya pengguna yang berhak melihat datanya (mis. dokumen penghuni hanya pemilik & bagian sewa; foto nota pengeluaran hanya pemilik/pengelola) yang bisa membuka, lewat tautan sementara 10 menit. Maks 4 MB per file, 10 file per data; ruang per bisnis mengikuti paket (Gratis 50 MB, Standar 500 MB, Pro 2 GB). Penambahan & penghapusan tercatat di Riwayat. Unduh semua data hanya berisi <b>daftar</b> lampiran, bukan filenya. Bisnis yang ditutup: lampiran bisa dilihat, tidak bisa ditambah.</>, 'warn', <ScrLampiran />],
  ]],
  ['K', 'Pusat Konfirmasi (setup bisnis baru)', [
    ['Tinjau, lengkapi & aktifkan bisnis', 'Pusat Konfirmasi (menu utama bisnis yang masih draf)', [
      <>Buka bisnis yang masih draf (ketuk nama bisnis di kiri atas). Lihat <b>Kelengkapan data</b> dan daftar yang disiapkan PRASARA: profil & informasi, layanan, alur kerja, modul, dan halaman pelanggan.</>,
      <>Ketuk <b>Lengkapi</b>/<b>Ubah</b> untuk mengisi (mis. alamat, WhatsApp, metode pembayaran; laundry: <b>harga & estimasi tiap layanan</b>, wilayah/biaya/jadwal antar jemput; kos: jumlah kamar & harga sewa), lalu <b>Simpan & setujui</b> — atau <b>Simpan draf</b>.</>,
      <>Putuskan tiap bagian: <b>Setujui</b>, <b>Tunda</b>, atau <b>Tolak</b> (bagian bertanda wajib hanya bisa disetujui). Modul: <b>Setujui semua yang disarankan</b> lalu sesuaikan.</>,
      <>Tekan <b>Tinjau seluruh konfigurasi & aktifkan</b>: lihat apa yang akan aktif dan yang tidak, lalu <b>Aktifkan</b>. Menu operasional langsung terbuka; halaman bisnis tetap draf sampai Anda terbitkan sendiri (Langkah 44).</>,
    ], <>Selama draf, transaksi (pesanan, penjualan, tagihan) ditolak server. Harga, kapasitas, dan jumlah karyawan tidak pernah diisi otomatis. Yang tidak disetujui tidak diaktifkan. Setelah aktif, bagian yang Anda setujui di sini langsung diterapkan; semua keputusan tercatat di Konfigurasi › Riwayat. Belum siap? <b>Tunda setup</b> atau <b>Tolak draf</b> (datanya tetap tersimpan). Asisten AI untuk mengisi draf: segera hadir.</>, 'warn', <ScrKonfirmasi />],
  ]],
  ['L', 'Laundry lanjutan: antar jemput', [
    ['Antar jemput: wilayah, jadwal & status', 'Operasional › Antar jemput', [
      <>Pemilik: buka tab <b>Wilayah & jadwal</b>. <b>+ Wilayah</b> untuk tiap kecamatan/perumahan yang dilayani beserta biayanya; <b>+ Jam</b> untuk pilihan jam (Jemput / Antar / keduanya) dan kapasitas per hari bila perlu. Isian dari Pusat Konfirmasi sudah terbawa.</>,
      <>Tab <b>Jemput</b>: daftar cucian yang harus dijemput, dikelompokkan <b>Terlewat / Hari ini / Besok / Belum dijadwalkan</b>. Ketuk <b>Peta</b> untuk membuka alamat, <b>WA</b> untuk mengabari pelanggan, <b>Jadwal</b> untuk mengatur tanggal & jam, lalu <b>Sudah dijemput</b>.</>,
      <>Tab <b>Antar</b>: pesanan siap yang harus diantar. Tekan <b>Berangkat antar</b> (status jadi <b>Dalam pengantaran</b>), lalu <b>Sudah diterima pelanggan</b> — pesanan selesai.</>,
      <>Gagal jemput/antar (pelanggan tidak di rumah)? Tekan <b>Gagal</b>, tulis alasannya, lalu jadwalkan ulang.</>,
    ], <>Pesanan yang dijemput baru bisa diproses setelah <b>Sudah dijemput</b>. Hanya wilayah di daftar yang bisa dipilih — alamat di luar wilayah tidak dianggap terlayani. Petugas proses bisa menjemput/mengantar dan melihat No. HP pelanggan antar jemput, tetapi hanya bisa menyerahkan pesanan yang sudah lunas; penagihan oleh kasir/pemilik. Pembayaran tetap terpisah: pesanan tidak otomatis lunas. Semua langkah tercatat di Riwayat pesanan.</>, 'warn', <ScrAntar />],
    ['Pesanan dari halaman bisnis & cek status', 'Halaman bisnis (pelanggan) › Pesanan (Anda)', [
      <>Pelanggan membuka halaman bisnis Anda, memilih layanan & jumlah, memilih <b>Dijemput/Diantar</b> (hanya wilayah dan jam yang Anda atur), mengisi alamat, nama & WhatsApp, lalu <b>Kirim pesanan</b>. Mereka mendapat nomor pesanan (mis. PSN-261107-004).</>,
      <>Pesanan masuk ke <b>Pesanan</b> dengan status <b>Permintaan masuk</b> (dashboard menampilkan pemberitahuan; email bila dicentang). Ketuk pesanannya: periksa layanan, jadwal & alamat, ubah ongkos bila perlu, lalu <b>Konfirmasi</b> — atau <b>Tolak</b> dengan alasan. Kabari lewat <b>WA pelanggan</b>.</>,
      <>Setelah dikonfirmasi pesanan berjalan seperti biasa (jemput → proses → siap → antar/ambil). Berat sebenarnya diisi lewat <b>Ubah isi</b> saat barang diterima.</>,
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
      <>Setelah daftar, buka <b>Pusat Konfirmasi</b> untuk melengkapi profil, lalu <b>Business Builder</b> untuk menyesuaikan field, status, dan peran (Langkah 55–62). Aktifkan.</>,
      <>Catat kegiatan sehari-hari di <b>Catatan</b>, uang masuk lewat field uang pada catatan, dan lihat <b>Laporan</b>.</>,
    ], <>Template hanya titik awal — semua bisa diubah, tidak ada data atau harga yang diisi otomatis. Fitur khusus per jenis (mis. jadwal kelas otomatis, rekam medis, pelacakan resi) belum ada; yang tersedia adalah pencatatan, alur status, peran, dan laporan dari Business Builder.</>, 'warn', null],
    ['Kuliner: meja, tagihan per meja & reservasi', 'Operasional › Meja & reservasi', [
      <>Tab <b>Meja</b>: semua meja tampil dengan status — <b>Kosong</b>, <b>Terisi</b>, <b>Siap saji</b>, <b>QR baru</b>, <b>Belum lunas</b>, atau <b>Dipesan 19.00</b> (reservasi). Ketuk meja untuk melihat pesanannya dan <b>+ Pesanan untuk Meja N</b> (meja langsung terpilih).</>,
      <>Menagih: <b>Bayar semua</b> (satu kali bayar untuk semua pesanan meja); <b>Bagi rata</b> — isi jumlah orang, tekan <b>Catat bayar 1 orang</b> untuk tiap orang (orang terakhir membayar sisanya); atau <b>Per item</b> — centang yang dimakan satu orang, lalu bayar, ulangi untuk orang berikutnya. Pilih cara bayar (tunai/transfer/QRIS) tiap kali.</>,
      <>Setelah tamu selesai: <b>Tutup meja</b> — semua pesanan meja yang sudah Siap diserahkan (pendapatan tercatat) dan meja kembali Kosong.</>,
      <>Tab <b>Reservasi</b>: <b>+ Reservasi</b> untuk pesanan lewat telepon/WA (nama, jam, jumlah orang, meja bila sudah ditentukan). Tamu juga bisa menekan <b>Reservasi meja</b> di halaman bisnis — masuk sebagai <b>Permintaan</b>: pilih meja › <b>Konfirmasi</b> › <b>WA: konfirmasi</b>. Saat tamu tiba: <b>Tamu datang</b>; tidak muncul: <b>Tidak datang</b>.</>,
    ], <>Meja yang sudah dipesan di jam yang bertumpuk ditolak otomatis. Bayar gabungan dicatat sekaligus — bila salah satu gagal, tidak ada yang tercatat; ketukan ganda tidak tercatat dua kali. Diskon/ongkos dibagi sebanding harga saat bayar per item. Tutup meja dengan sisa tagihan menjadikan sisa itu piutang (ada peringatan). Reservasi tanpa uang muka; <b>Dalam rencana</b>: DP reservasi dan pembayaran online.</>, 'warn', <ScrMeja />],
  ]],
  ['N', 'Pendaftaran penghuni online (kos)', [
    ['Calon penghuni daftar sendiri → Anda konfirmasi', 'Halaman bisnis (calon penghuni) › Prospek & tindak lanjut (Anda)', [
      <>Terbitkan <b>Halaman bisnis</b> dan bagikan tautannya (ikon <b>Bagikan</b> di pojok kanan atas). Bila ingin rekening/QRIS tampil di formulir, centang <b>Tampilkan rekening/QRIS di formulir pendaftaran penghuni</b> di menu Halaman bisnis (isinya dari Pengaturan › Info untuk penghuni).</>,
      <>Calon penghuni membuka tautan › <b>Daftar / booking kamar</b>: pilih kamar, <b>Booking dulu</b> atau <b>Langsung huni</b> (masuk paling lambat 7 hari lagi), tanggal, nama, No. WhatsApp, alamat asal, kontak darurat, lalu <b>Bayar DP</b> atau <b>Lunas 1 bulan</b>, cara bayar, dan foto bukti transfer (opsional). Yang hanya ingin bertanya memakai tab <b>Tanya dulu</b>.</>,
      <>Pendaftaran masuk ke <b>Prospek & tindak lanjut</b> (email bila diaktifkan). Ketuk › lihat <b>Data pendaftar</b> dan <b>Lihat bukti transfer</b>. Cocokkan dengan mutasi rekening, lalu tekan <b>Uang Rp… sudah masuk → isi</b> (lewati bila belum masuk).</>,
      <><b>Langsung huni</b> › <b>Konfirmasi → masukkan sebagai penghuni</b>: data penghuni (nama, No. HP, alamat, kontak darurat) dibuat otomatis, sewa kamar dimulai, tagihan pertama terbit, dan pembayaran tercatat lunas/sebagian beserta foto buktinya. <b>Booking dulu</b> › <b>Konfirmasi → buat booking</b>: masuk <b>Booking kamar</b> (DP tercatat); saat check-in, data diri pendaftar otomatis menjadi data penghuni.</>,
      <>Tekan <b>Kabari … via WhatsApp</b>, lalu kirim link <b>Portal penghuni</b> dari detail penghuni.</>,
    ], <>Kamar hanya bisa dipilih bila masih kosong di tanggal itu; nomor kontak darurat harus nomor orang lain. Bukti transfer bukan bukti sah sampai Anda cek mutasi — pembayaran hanya tercatat bila Anda mengisinya saat konfirmasi. Konfirmasi hanya bisa sekali (tidak ada penghuni/tagihan dobel). Foto bukti hanya bisa dibuka pemilik & bagian sewa.</>, 'warn', null],
  ]],
  ['O', 'Foto & media', [
    ['Foto kamar, barang, layanan, cover & galeri', 'Operasional › Foto & media · Kamar/Barang/Layanan › + Foto · Halaman bisnis', [
      <>Tempelkan foto langsung di datanya: <b>Kamar</b> › ketuk kamar › <b>+ Foto</b>; <b>Barang</b> › ubah barang › <b>+ Foto</b>; <b>Layanan/Menu</b> › ketuk layanan › <b>+ Foto</b>; <b>Halaman bisnis</b> › <b>Cover</b> (1 foto lebar) dan <b>Galeri</b> (maks 12).</>,
      <><b>+ Foto</b> › <b>Unggah foto baru</b> (📷 Kamera atau 🖼 Galeri, bisa beberapa sekaligus) atau <b>Pilih dari pustaka media</b> (foto yang sudah ada, tanpa unggah ulang). Sebelum menyimpan: pilih rasio (Asli, 1:1, 4:3, 3:4, 16:9), <b>↻ Putar</b>, dan geser posisi agar bagian penting tidak terpotong. Tekan <b>Simpan</b>; bila gagal, tekan Simpan lagi untuk mencoba ulang.</>,
      <>Foto pertama = <b>foto utama</b>: tampil kecil di daftar <b>Kamar</b>, <b>Barang</b>, tombol cepat & hasil cari <b>Kasir</b>, daftar <b>Layanan/Menu</b>, dan tombol pilihan saat <b>terima pesanan</b> — memudahkan mencari dengan cepat. Ketuk foto: <b>Jadikan utama</b>, <b>Ganti foto ini</b> (hanya di tempat ini), atau <b>Lepas</b> (file tetap di pustaka).</>,
      <>Menu <b>Foto & media</b>: semua foto, kuota penyimpanan, filter kategori, pencarian, dan <b>Dipakai di</b> mana saja. <b>Ganti gambar</b> = berlaku di semua tempat yang memakainya. <b>Hapus</b> foto yang masih dipakai meminta konfirmasi dan melepasnya dari semua tempat.</>,
      <>Di halaman bisnis publik: cover di atas, galeri yang bisa digeser, dan foto kecil di samping tiap kamar/barang/layanan — ketuk untuk memperbesar. Foto kamar hanya tampil bila kamar tersedia.</>,
    ], <>Foto di sini bersifat <b>publik</b> (untuk ditampilkan ke pelanggan). Dokumentasi internal — nota, bukti transfer, kondisi kamar/barang — tetap lewat <b>📎 Lampiran</b> di tiap data (privat). Foto dikecilkan di HP sebelum dikirim (maks 1600 px + thumbnail) agar hemat kuota dan cepat dibuka; kuota dihitung bersama lampiran sesuai paket. <b>Segera hadir</b>: saran foto & deskripsi otomatis oleh AI.</>, 'warn', <ScrMedia />],
  ]],
];

const RULES = [
  'Catat semua uang keluar, sekecil apa pun — termasuk yang diambil pemilik untuk pribadi (prive). Saldo kas hanya cocok jika semuanya tercatat.',
  'Transfer dan QRIS dicatat sebagai diterima hanya setelah uang benar-benar masuk ke rekening.',
  'Penghuni lama: isi tagihan pertama dengan jatuh tempo berikutnya yang belum dibayar.',
  'Kas bersih bukan laba. Lihat Laporan untuk laba, dan Tunggakan untuk uang yang belum tertagih.',
];

export default function Panduan() {
  let n = 0;
  return (
    <div className="lp">
      <LandingNav />
      <div className="guide">
        <h1>Panduan PRASARA</h1>
        <p className="muted" style={{ margin: 0 }}>Langkah demi langkah memakai PRASARA untuk kos (kamar, penghuni, tagihan, pembayaran, laporan) toko (kasir, stok, belanja, kas, laporan), dan jasa/laundry (pesanan, tahap proses, nota, keluhan), termasuk karyawan.</p>

        <h2 style={{ color: 'var(--brand-2)' }}>Cara berpindah menu</h2>
        <ul style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Di HP, menu bawah berisi <b>Beranda</b>, <b>Operasional</b> (semua modul bisnis, dikelompokkan: Operasional, Transaksi, Pelanggan, Inventaris, Keuangan, Laporan, Pengaturan), tombol <b>+</b> (aksi cepat, mis. catat pembayaran atau pesanan baru), <b>Laporan</b>, dan <b>Akun</b>.</li>
          <li>Tombol <b>☰</b> di kanan atas membuka menu samping berisi semua kelompok menu; ikon <b>🔍</b> mencari menu. Pilihan <b>Tampilan</b> (Gelap / Terang / Ikuti HP) dan Keluar ada di <b>Akun</b>.</li>
          <li>Ikon <b>Bagikan</b> (panah ke atas) di pojok kanan atas: tautan & <b>QR code</b> halaman bisnis, siap dikirim atau dicetak, dari menu mana pun.</li>
          <li>Di laptop, semua menu tampil di bagian atas.</li>
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
          <div><b>Pendaftaran penghuni online</b><span><a href="#bagian-N">Langkah 70</a><br />Calon penghuni daftar & bayar DP/lunas dari halaman kos, Anda konfirmasi sekali</span></div>
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
                    <h3>Langkah {n} · {title}{std === 'pro' ? <Pro /> : std && <Std />}</h3>
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
